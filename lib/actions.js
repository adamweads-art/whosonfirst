'use server';

import { revalidatePath } from 'next/cache';
import { generateLineup, recomputeTallies, POSITIONS } from './rotation';
import {
  getRoster,
  getGames,
  getAssignments,
  replaceAssignments,
  writeTallies,
  writeBattingOrder,
  updateGame,
  createGame as createGameRecord,
  F,
} from './airtable';

/**
 * Add a game from the app rather than from Airtable.
 *
 * One API call. Validation lives here, not only in the browser, so a bad
 * value cannot reach the base by any route.
 */
export async function createGame({ date, opponent, homeAway, inningsPlanned }) {
  const cleanDate = String(date || '').trim();
  const cleanOpponent = String(opponent || '').trim();
  const side = homeAway === 'Away' ? 'Away' : 'Home';
  const innings = Number(inningsPlanned) || 6;

  if (!cleanDate) return { error: 'Pick a date.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    return { error: 'That date is not valid.' };
  }
  if (!cleanOpponent) return { error: 'Who are you playing?' };
  if (cleanOpponent.length > 60) {
    return { error: 'That opponent name is too long.' };
  }
  if (innings < 1 || innings > 6) {
    return { error: 'Innings must be between 1 and 6.' };
  }

  try {
    const created = await createGameRecord({
      date: cleanDate,
      opponent: cleanOpponent,
      homeAway: side,
      inningsPlanned: innings,
    });
    revalidatePath('/');
    return { ok: true, id: created.id };
  } catch (err) {
    return { error: `Could not save the game. ${err.message}` };
  }
}


/**
 * Generate a lineup for one game.
 *
 * API cost: roughly ten calls. Three reads (roster, games, assignments),
 * two deletes and two creates for assignments, two patches for tallies,
 * one patch for game status.
 */
export async function generate(gameId, absentIds, inningsPlanned) {
  const [roster, games, assignments] = await Promise.all([
    getRoster(),
    getGames(),
    getAssignments(),
  ]);

  const game = games.find((g) => g.id === gameId);
  if (!game) return { error: 'That game is no longer in the base.' };

  // Games are numbered by date order so leadoff advances one player per game,
  // and so regenerating an old game does not shift every later one.
  const chronological = [...games]
    .filter((g) => g.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const gameNumber = chronological.findIndex((g) => g.id === gameId) + 1 || 1;

  // History excludes this game, so regenerating does not count itself twice.
  const inningsPlayedByGame = Object.fromEntries(
    games.map((g) => [g.id, g.inningsPlayed])
  );
  const history = recomputeTallies(
    assignments.filter((a) => a.gameId !== gameId),
    inningsPlayedByGame
  );

  let result;
  try {
    result = generateLineup({
      players: roster,
      absentIds,
      inningsPlanned,
      gameNumber,
      history,
      seed: gameId,
    });
  } catch (err) {
    return { error: err.message };
  }

  const present = roster.filter(
    (p) => p.active && !absentIds.includes(p.id)
  );
  const slotOf = Object.fromEntries(
    result.battingOrder.map((p, i) => [p.id, i + 1])
  );

  const rows = present.map((p) => ({
    playerId: p.id,
    label: `${game.label} — ${p.name}`,
    battingSlot: slotOf[p.id] ?? null,
    innings: result.innings.map((inn) => inn[p.id] || null),
  }));

  await replaceAssignments(gameId, rows, assignments);

  // Recompute every tally across the whole season rather than incrementing.
  // This is what makes deleted games disappear from the totals instead of
  // leaving phantom innings behind.
  await rebuildTallies();

  await updateGame(gameId, {
    [F.game.status]: 'Lineup Generated',
    [F.game.absentPlayers]: absentIds,
    [F.game.inningsPlanned]: inningsPlanned,
  });

  revalidatePath(`/game/${gameId}`);
  revalidatePath('/');

  return { ok: true, warnings: result.warnings };
}

/**
 * Post-game logging. Innings Played is the one field that matters, because
 * it is what keeps the fairness math honest when a game gets called early.
 */
/**
 * Rebuild every player's season tallies from whatever Assignments currently
 * exist. Costs about four API calls.
 *
 * Assignments whose game no longer exists are skipped. Deleting a Game in
 * Airtable does not delete its Assignment records, so without this those
 * orphans would keep counting toward playing time forever.
 */
async function rebuildTallies() {
  const [roster, games, assignments] = await Promise.all([
    getRoster(),
    getGames(),
    getAssignments(),
  ]);

  const liveGameIds = new Set(games.map((g) => g.id));
  const live = assignments.filter((a) => liveGameIds.has(a.gameId));

  const inningsPlayedByGame = Object.fromEntries(
    games.map((g) => [g.id, g.inningsPlayed])
  );
  const tallies = recomputeTallies(live, inningsPlayedByGame);

  const complete = {};
  roster.forEach((p) => {
    complete[p.id] = tallies[p.id] || {};
    [...POSITIONS, 'Bench'].forEach((pos) => {
      complete[p.id][pos] = complete[p.id][pos] || 0;
    });
  });

  await writeTallies(complete);
  return { players: roster.length, assignments: live.length, orphans: assignments.length - live.length };
}

/**
 * Manual refresh, for when the base has been edited directly. Tallies are a
 * cache the app writes; editing Airtable by hand does not trigger a rebuild,
 * so this is the button that does.
 */
export async function refreshTallies() {
  try {
    const stats = await rebuildTallies();
    revalidatePath('/');
    return { ok: true, ...stats };
  } catch (err) {
    return { error: `Could not refresh. ${err.message}` };
  }
}

/**
 * Save a new batting order.
 *
 * Only affects games generated from here on. Lineups already built keep the
 * order they were built with, since their batting slots are stored on the
 * Assignment records.
 */
export async function saveBattingOrder(orderedIds) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { error: 'No players to save.' };
  }
  try {
    await writeBattingOrder(orderedIds);
    revalidatePath('/roster');
    revalidatePath('/');
    return { ok: true, count: orderedIds.length };
  } catch (err) {
    return { error: `Could not save the order. ${err.message}` };
  }
}

export async function logGame(gameId, inningsPlayed, notes) {
  const fields = {
    [F.game.status]: 'Logged',
    [F.game.inningsPlayed]: inningsPlayed,
  };
  if (notes && notes.trim()) fields[F.game.rawNotes] = notes.trim();

  await updateGame(gameId, fields);

  // Innings Played changes what counts, so tallies have to be rebuilt.
  await rebuildTallies();

  revalidatePath(`/game/${gameId}`);
  revalidatePath('/');

  return { ok: true };
}
