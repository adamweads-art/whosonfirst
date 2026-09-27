/**
 * Manual lineup edits, as pure functions.
 *
 * Same split as the rotation engine: all the rules live here with no I/O, so
 * they can be tested exhaustively. `lib/actions.js` loads the rows, calls one
 * of these, and writes whatever comes back.
 *
 * The invariant both functions protect: an edit is a trade. Nobody is ever
 * removed from an inning without somebody taking their place, or without the
 * vacancy being the thing the coach explicitly asked for.
 *
 * `rows` is the shape `getAssignments()` returns, already filtered to one game:
 *   { id, playerId, innings: [pos|null × 6] }
 */

export const PLACES = [
  'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'Bench',
];

/** An empty cell means the same thing as a bench cell, and is written as one. */
export const spotOf = (row, inning) => row?.innings[inning] || 'Bench';

function validate(rows, inning) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return 'This game has no lineup yet.';
  }
  if (!Number.isInteger(inning) || inning < 0 || inning > 5) {
    return 'That inning is out of range.';
  }
  return null;
}

/**
 * Exchange two players' spots for one inning.
 *
 * Either may be on the bench, which is how a coach pulls a kid off the pine
 * and into a position in one gesture.
 */
export function planSwap(rows, inning, aId, bId) {
  const bad = validate(rows, inning);
  if (bad) return { error: bad };

  if (!aId || !bId) return { error: 'Pick two players.' };
  if (aId === bId) return { error: 'Pick two different players.' };

  const a = rows.find((r) => r.playerId === aId);
  const b = rows.find((r) => r.playerId === bId);
  if (!a || !b) return { error: 'That player is not in this lineup.' };

  const aPos = spotOf(a, inning);
  const bPos = spotOf(b, inning);

  // Two players on the bench trading bench seats is not a change.
  if (aPos === bPos) return { error: 'Both are already in the same spot.' };

  return {
    edits: [
      { id: a.id, playerId: aId, inning, position: bPos },
      { id: b.id, playerId: bId, inning, position: aPos },
    ],
  };
}

/**
 * Put one player in a named spot for one inning.
 *
 * Whoever held that spot inherits the mover's old one, so the field stays
 * full. Moving somebody to the bench displaces nobody, because the bench is
 * not a slot with an occupant: that one leaves a position open on purpose,
 * and the field view draws it in red so it cannot be missed.
 */
export function planMove(rows, inning, playerId, position) {
  const bad = validate(rows, inning);
  if (bad) return { error: bad };

  if (!playerId) return { error: 'Pick a player.' };
  if (!PLACES.includes(position)) return { error: 'That is not a position.' };

  const mover = rows.find((r) => r.playerId === playerId);
  if (!mover) return { error: 'That player is not in this lineup.' };

  const from = spotOf(mover, inning);
  if (from === position) return { edits: [] };

  const edits = [{ id: mover.id, playerId, inning, position }];

  if (position !== 'Bench') {
    const held = rows.find(
      (r) => r.playerId !== playerId && spotOf(r, inning) === position
    );
    if (held) {
      edits.push({ id: held.id, playerId: held.playerId, inning, position: from });
    }
  }

  return { edits };
}

/**
 * Apply planned edits to a copy of the rows.
 *
 * Only used by the tests, to assert on the board that results rather than on
 * the edit list. Anything that reads well as a property of the finished
 * lineup should be checked here rather than by inspecting edits.
 */
export function applyEdits(rows, edits) {
  const byId = new Map(edits.map((e) => [e.id, e]));
  return rows.map((r) => {
    const e = byId.get(r.id);
    if (!e) return r;
    return {
      ...r,
      innings: r.innings.map((v, i) => (i === e.inning ? e.position : v)),
    };
  });
}
