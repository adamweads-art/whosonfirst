'use server';

import { revalidatePath } from 'next/cache';
import { generateLineup, recomputeTallies, POSITIONS } from './rotation';
import { splitGroups } from './groups';
import { planSwap, planMove } from './swap.mjs';
import { claudeConfigured, readCard, tagNotes } from './claude';
import {
  getRoster,
  getGames,
  getAssignments,
  replaceAssignments,
  writeTallies,
  writeBattingOrder,
  updateGame,
  createGame as createGameRecord,
  createPractice as createPracticeRecord,
  updatePractice,
  replaceBlocks,
  getBlocks,
  getSkills,
  getObservations,
  patchAssignmentInnings,
  deleteGameCascade,
  deletePracticeCascade,
  replaceGameObservations,
  setObservationStatus,
  F,
  FD,
} from './airtable';

const F_PRACTICE = FD.practice;

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

// ---------------------------------------------------------------------------
// Manual overrides
//
// The generator is a starting point, not a verdict. A coach at the field needs
// to put a particular kid behind the plate for one inning without regenerating
// the game and losing everything else.
//
// Both actions below go through one helper so the rules are stated once:
// a change is always a trade, never a deletion. Two players exchange cells, or
// one player takes a vacant spot. Neither route can strand a position by
// accident the way hand-editing Airtable can.
// ---------------------------------------------------------------------------

/**
 * Flag an edit that breaks a rule the generator would have respected.
 *
 * Non-blocking on purpose. The coach asked for an override, so they get the
 * override; they just get told what it costs.
 */
function poolWarning(roster, playerId, position) {
  const p = roster.find((x) => x.id === playerId);
  if (!p || position === 'Bench') return null;
  if ((p.exclusions || []).includes(position)) {
    return `${p.name} is marked as not playing ${position}.`;
  }
  if (position === 'P' && !p.pitcherPool) return `${p.name} is not in the pitcher pool.`;
  if (position === 'C' && !p.catcherPool) return `${p.name} is not in the catcher pool.`;
  return null;
}

/**
 * Load the game, run a planner from `lib/swap`, write the result.
 *
 * Tallies get rebuilt rather than nudged, for the same reason `generate` does
 * it: incrementing drifts, recomputing cannot. Costs about seven API calls,
 * which at a handful of edits per game is well inside the free tier.
 */
async function applyEdit(gameId, plan) {
  if (!gameId) return { error: 'No game.' };

  try {
    const [roster, assignments] = await Promise.all([getRoster(), getAssignments()]);
    const rows = assignments.filter((a) => a.gameId === gameId);

    const { edits, error } = plan(rows);
    if (error) return { error };
    if (!edits.length) return { ok: true, warnings: [] };

    const warnings = edits
      .map((e) => poolWarning(roster, e.playerId, e.position))
      .filter(Boolean);

    await patchAssignmentInnings(edits);
    await rebuildTallies();

    revalidatePath(`/game/${gameId}`);
    revalidatePath('/');
    return { ok: true, warnings };
  } catch (err) {
    return { error: `Could not save the change. ${err.message}` };
  }
}

/** Trade two players' spots for one inning. Either can be on the bench. */
export async function swapPlayers(gameId, inning, aId, bId) {
  return applyEdit(gameId, (rows) => planSwap(rows, inning, aId, bId));
}

/** Put one player in a named spot for one inning. */
export async function movePlayer(gameId, inning, playerId, position) {
  return applyEdit(gameId, (rows) => planMove(rows, inning, playerId, position));
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

// ---------------------------------------------------------------------------
// Practice
// ---------------------------------------------------------------------------

export async function createPracticeAction({ date, startTime, location }) {
  const cleanDate = String(date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return { error: 'Pick a date.' };

  const [y, m, d] = cleanDate.split('-').map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  try {
    const created = await createPracticeRecord({
      [F_PRACTICE.label]: label,
      [F_PRACTICE.date]: cleanDate,
      [F_PRACTICE.startTime]: String(startTime || '').trim(),
      [F_PRACTICE.location]: String(location || '').trim(),
    });
    revalidatePath('/practice');
    return { ok: true, id: created.id };
  } catch (err) {
    return { error: `Could not create the practice. ${err.message}` };
  }
}

/**
 * Save the whole plan: attendance, blocks, and station groups.
 *
 * Station groups are computed here rather than in the browser so the split is
 * always consistent with whoever is actually marked present at save time.
 */
export async function savePractice(practiceId, { attendanceIds, blocks, addressedIds = [] }) {
  try {
    const existing = await getBlocks();

    const prepared = blocks.map((b) => {
      const out = {
        label: `${b.type} ${b.duration}m`,
        type: b.type,
        duration: Number(b.duration) || 10,
        drillIds: b.drillIds || [],
        notes: b.notes || '',
      };
      if (b.type === 'Stations' && b.drillIds?.length > 1) {
        const groups = splitGroups(attendanceIds, b.drillIds.length);
        out.stationGroups = JSON.stringify({
          groups: groups.map((players, i) => ({
            name: String.fromCharCode(65 + i),
            players,
          })),
          rotation: b.drillIds,
        });
        out.rotationMinutes =
          Number(b.rotationMinutes) ||
          Math.max(1, Math.floor((Number(b.duration) || 10) / b.drillIds.length));
      }
      return out;
    });

    await replaceBlocks(practiceId, prepared, existing);
    await updatePractice(practiceId, {
      [F_PRACTICE.attendance]: attendanceIds,
    });

    // Observations this plan is working on get marked addressed, and linked to
    // the practice so there is a record of when each thing got attention.
    if (addressedIds.length) {
      await setObservationStatus(addressedIds, 'Addressed', practiceId);
    }

    revalidatePath(`/practice/${practiceId}`);
    revalidatePath('/practice');
    return { ok: true, blocks: prepared.length };
  } catch (err) {
    return { error: `Could not save the plan. ${err.message}` };
  }
}

/**
 * Read a photo of the marked-up dugout card.
 *
 * Returns what it read for the coach to check. Nothing is saved here, and the
 * photo itself is never stored: it goes to Claude, comes back as text, and is
 * gone.
 */
export async function readCardPhoto(base64, mediaType) {
  if (!claudeConfigured()) {
    return { error: 'Photo reading is not set up yet. Add ANTHROPIC_API_KEY in Vercel.' };
  }
  if (!base64 || typeof base64 !== 'string') {
    return { error: 'No photo came through. Try again.' };
  }
  try {
    const result = await readCard(base64, mediaType || 'image/jpeg');
    if (result.inningsPlayed == null && !result.notes) {
      return { error: 'Could not find any handwriting on the card. Try a closer, straighter photo.' };
    }
    return { ok: true, ...result };
  } catch (err) {
    return { error: `Could not read the photo. ${err.message}` };
  }
}

export async function logGame(gameId, inningsPlayed, notes, source = 'Typed Note') {
  const cleanNotes = String(notes || '').trim();
  const fields = {
    [F.game.status]: 'Logged',
    [F.game.inningsPlayed]: inningsPlayed,
    [F.game.rawNotes]: cleanNotes,
  };

  await updateGame(gameId, fields);

  // Innings Played changes what counts, so tallies have to be rebuilt.
  await rebuildTallies();

  // Turn the notes into observations for practice planning. A failure here
  // never blocks saving the game: the innings and raw notes are already in.
  let warning = null;
  try {
    await saveObservationsForGame(gameId, cleanNotes, source);
  } catch (err) {
    warning = `Game saved, but the notes could not be sorted for practice. ${err.message}`;
  }

  revalidatePath(`/game/${gameId}`);
  revalidatePath('/');
  revalidatePath('/practice');

  return { ok: true, warning };
}

async function saveObservationsForGame(gameId, notes, source) {
  const [existing, games] = await Promise.all([getObservations(), getGames()]);
  const game = games.find((g) => g.id === gameId);
  const date = game?.date || new Date().toISOString().slice(0, 10);
  const src = source === 'Card Photo' ? 'Card Photo' : 'Typed Note';

  if (!notes) {
    // Notes cleared: remove whatever open observations this game had.
    await replaceGameObservations(gameId, [], existing);
    return;
  }

  let items;
  if (claudeConfigured()) {
    const [skills, roster] = await Promise.all([getSkills(), getRoster()]);
    const tagged = await tagNotes(
      notes,
      skills,
      roster.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))
    );
    items = tagged.map((t) => ({ ...t, rawText: notes, source: src, date }));
  }

  // No key, or nothing came back: still carry the note forward, just untagged.
  if (!items || items.length === 0) {
    items = [{
      summary: notes.length > 80 ? `${notes.slice(0, 77)}...` : notes,
      scope: 'Team',
      skillIds: [],
      playerIds: [],
      rawText: notes,
      source: src,
      date,
    }];
  }

  await replaceGameObservations(gameId, items, existing);
}

export async function dismissObservation(observationId) {
  try {
    await setObservationStatus([observationId], 'Dismissed');
    revalidatePath('/practice');
    return { ok: true };
  } catch (err) {
    return { error: `Could not dismiss. ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

/**
 * Delete a game, its lineup, and its observations, then rebuild playing time.
 *
 * The rebuild is the important part: without it the deleted game's innings
 * would sit in the tallies forever and the rotation would keep balancing
 * against a game that no longer exists.
 */
export async function deleteGame(gameId) {
  if (!gameId) return { error: 'No game to delete.' };
  try {
    await deleteGameCascade(gameId);
    await rebuildTallies();
    revalidatePath('/');
    revalidatePath('/practice');
    return { ok: true };
  } catch (err) {
    return { error: `Could not delete the game. ${err.message}` };
  }
}

export async function deletePractice(practiceId) {
  if (!practiceId) return { error: 'No practice to delete.' };
  try {
    const stats = await deletePracticeCascade(practiceId);
    revalidatePath('/practice');
    return { ok: true, ...stats };
  } catch (err) {
    return { error: `Could not delete the practice. ${err.message}` };
  }
}
