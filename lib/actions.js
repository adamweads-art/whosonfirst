'use server';

import { revalidatePath } from 'next/cache';
import { generateLineup, recomputeTallies, POSITIONS } from './rotation';
import {
  getRoster,
  getGames,
  getAssignments,
  replaceAssignments,
  writeTallies,
  updateGame,
  F,
} from './airtable';

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
  const fresh = await getAssignments();
  const tallies = recomputeTallies(fresh, inningsPlayedByGame);
  const complete = {};
  roster.forEach((p) => {
    complete[p.id] = tallies[p.id] || {};
    [...POSITIONS, 'Bench'].forEach((pos) => {
      complete[p.id][pos] = complete[p.id][pos] || 0;
    });
  });
  await writeTallies(complete);

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
export async function logGame(gameId, inningsPlayed, notes) {
  const fields = {
    [F.game.status]: 'Logged',
    [F.game.inningsPlayed]: inningsPlayed,
  };
  if (notes && notes.trim()) fields[F.game.rawNotes] = notes.trim();

  await updateGame(gameId, fields);

  // Innings Played changes what counts, so tallies have to be rebuilt.
  const [roster, games, assignments] = await Promise.all([
    getRoster(),
    getGames(),
    getAssignments(),
  ]);
  const inningsPlayedByGame = Object.fromEntries(
    games.map((g) => [g.id, g.inningsPlayed])
  );
  const tallies = recomputeTallies(assignments, inningsPlayedByGame);
  const complete = {};
  roster.forEach((p) => {
    complete[p.id] = tallies[p.id] || {};
    [...POSITIONS, 'Bench'].forEach((pos) => {
      complete[p.id][pos] = complete[p.id][pos] || 0;
    });
  });
  await writeTallies(complete);

  revalidatePath(`/game/${gameId}`);
  revalidatePath('/');

  return { ok: true };
}
