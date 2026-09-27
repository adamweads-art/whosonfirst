/**
 * Tests for manual lineup edits.
 *
 * The thing worth protecting is not that a swap swaps. It is that no sequence
 * of taps at the field can quietly leave a position unmanned or a kid in two
 * places at once. Most of what follows checks the board after the edit rather
 * than the edit itself.
 *
 * Run: node swap.test.mjs
 */

import { planSwap, planMove, applyEdits, spotOf } from './lib/swap.mjs';

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failures.push(`${name}\n    ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  assert(a === b, `${msg || 'mismatch'}\n    expected ${b}\n    got      ${a}`);
}

// ---------------------------------------------------------------------------
// A twelve-player game. Inning 0 is full: nine in the field, three sitting.
// ---------------------------------------------------------------------------

const FIELD = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];

function board() {
  const names = [
    ['p1', 'P'], ['p2', 'C'], ['p3', '1B'], ['p4', '2B'], ['p5', '3B'],
    ['p6', 'SS'], ['p7', 'LF'], ['p8', 'CF'], ['p9', 'RF'],
    ['p10', 'Bench'], ['p11', 'Bench'], ['p12', 'Bench'],
  ];
  return names.map(([playerId, pos]) => ({
    id: `rec_${playerId}`,
    playerId,
    innings: [pos, 'Bench', 'Bench', 'Bench', 'Bench', 'Bench'],
  }));
}

/** Every position filled exactly once, nobody in two places. */
function wellFormed(rows, inning) {
  const held = rows.map((r) => spotOf(r, inning)).filter((p) => p !== 'Bench');
  const missing = FIELD.filter((p) => !held.includes(p));
  const dupes = held.filter((p, i) => held.indexOf(p) !== i);
  assert(!missing.length, `position left open: ${missing.join(', ')}`);
  assert(!dupes.length, `position held twice: ${dupes.join(', ')}`);
}

// ---------------------------------------------------------------------------

check('swaps two fielders', () => {
  const rows = board();
  const { edits, error } = planSwap(rows, 0, 'p2', 'p6');
  assert(!error, error);
  const after = applyEdits(rows, edits);
  eq(spotOf(after.find((r) => r.playerId === 'p2'), 0), 'SS');
  eq(spotOf(after.find((r) => r.playerId === 'p6'), 0), 'C');
  wellFormed(after, 0);
});

check('the catcher swap the whole feature exists for', () => {
  // "Switch a kid for one inning at catcher."
  const rows = board();
  const { edits } = planSwap(rows, 0, 'p2', 'p11');
  const after = applyEdits(rows, edits);
  eq(spotOf(after.find((r) => r.playerId === 'p11'), 0), 'C');
  eq(spotOf(after.find((r) => r.playerId === 'p2'), 0), 'Bench');
  wellFormed(after, 0);
});

check('swapping a bench player in benches the fielder', () => {
  const rows = board();
  const { edits } = planSwap(rows, 0, 'p10', 'p5');
  const after = applyEdits(rows, edits);
  eq(spotOf(after.find((r) => r.playerId === 'p10'), 0), '3B');
  eq(spotOf(after.find((r) => r.playerId === 'p5'), 0), 'Bench');
  wellFormed(after, 0);
});

check('swap touches only the inning asked for', () => {
  const rows = board();
  rows.find((r) => r.playerId === 'p2').innings[3] = 'RF';
  const { edits } = planSwap(rows, 0, 'p2', 'p6');
  const after = applyEdits(rows, edits);
  eq(after.find((r) => r.playerId === 'p2').innings[3], 'RF', 'inning 4 moved');
  eq(after.find((r) => r.playerId === 'p6').innings[3], 'Bench');
});

check('swap is symmetric', () => {
  const rows = board();
  const a = applyEdits(rows, planSwap(rows, 0, 'p3', 'p8').edits);
  const b = applyEdits(rows, planSwap(rows, 0, 'p8', 'p3').edits);
  eq(
    a.map((r) => spotOf(r, 0)),
    b.map((r) => spotOf(r, 0)),
    'order of taps changed the result'
  );
});

check('swapping twice returns the original lineup', () => {
  const rows = board();
  const once = applyEdits(rows, planSwap(rows, 0, 'p1', 'p12').edits);
  const twice = applyEdits(once, planSwap(once, 0, 'p1', 'p12').edits);
  eq(
    twice.map((r) => spotOf(r, 0)),
    rows.map((r) => spotOf(r, 0))
  );
});

check('refuses to swap a player with himself', () => {
  assert(planSwap(board(), 0, 'p4', 'p4').error);
});

check('refuses two bench players', () => {
  // Nothing would change, and silently "succeeding" would look like a bug.
  assert(planSwap(board(), 0, 'p10', 'p11').error);
});

check('refuses an unknown player', () => {
  assert(planSwap(board(), 0, 'p4', 'ghost').error);
});

check('refuses an out-of-range inning', () => {
  assert(planSwap(board(), 6, 'p1', 'p2').error);
  assert(planSwap(board(), -1, 'p1', 'p2').error);
  assert(planMove(board(), 9, 'p1', 'C').error);
});

check('refuses an empty lineup', () => {
  assert(planSwap([], 0, 'p1', 'p2').error);
  assert(planMove([], 0, 'p1', 'C').error);
});

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

check('moving into an occupied spot trades, it does not overwrite', () => {
  const rows = board();
  const { edits } = planMove(rows, 0, 'p10', 'CF');
  const after = applyEdits(rows, edits);
  eq(spotOf(after.find((r) => r.playerId === 'p10'), 0), 'CF');
  eq(spotOf(after.find((r) => r.playerId === 'p8'), 0), 'Bench', 'p8 vanished');
  wellFormed(after, 0);
});

check('moving into a vacant spot fills it and opens the old one', () => {
  const rows = board();
  rows.find((r) => r.playerId === 'p9').innings[0] = 'Bench'; // RF empty
  const { edits } = planMove(rows, 0, 'p1', 'RF');
  const after = applyEdits(rows, edits);
  eq(spotOf(after.find((r) => r.playerId === 'p1'), 0), 'RF');
  const onP = after.filter((r) => spotOf(r, 0) === 'P');
  eq(onP.length, 0, 'P should now read as open');
});

check('moving a bench player into a vacant spot strands nothing', () => {
  const rows = board();
  rows.find((r) => r.playerId === 'p7').innings[0] = 'Bench'; // LF empty
  const { edits } = planMove(rows, 0, 'p10', 'LF');
  const after = applyEdits(rows, edits);
  wellFormed(after, 0);
});

check('moving to the bench displaces nobody', () => {
  const rows = board();
  const { edits } = planMove(rows, 0, 'p5', 'Bench');
  eq(edits.length, 1, 'benching pulled someone else onto the field');
  const after = applyEdits(rows, edits);
  eq(after.filter((r) => spotOf(r, 0) === 'Bench').length, 4);
});

check('moving a player to where he already is does nothing', () => {
  const { edits, error } = planMove(board(), 0, 'p5', '3B');
  assert(!error, error);
  eq(edits, []);
});

check('an empty cell counts as bench, and gets written as one', () => {
  const rows = board();
  rows.find((r) => r.playerId === 'p11').innings[0] = null;
  const { edits } = planSwap(rows, 0, 'p11', 'p2');
  const after = applyEdits(rows, edits);
  eq(spotOf(after.find((r) => r.playerId === 'p11'), 0), 'C');
  eq(
    after.find((r) => r.playerId === 'p2').innings[0],
    'Bench',
    'null leaked back into the base instead of Bench'
  );
});

check('rejects a position that is not a position', () => {
  assert(planMove(board(), 0, 'p1', 'DH').error);
  assert(planMove(board(), 0, 'p1', 'RCF').error, 'old four-outfielder name');
  assert(planMove(board(), 0, 'p1', '').error);
});

// ---------------------------------------------------------------------------
// The property that matters: no reachable sequence of taps breaks the field.
// ---------------------------------------------------------------------------

check('200 random swaps never open or double a position', () => {
  let rows = board();
  let seed = 7;
  const rand = (n) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };

  for (let i = 0; i < 200; i += 1) {
    const a = rows[rand(rows.length)].playerId;
    const b = rows[rand(rows.length)].playerId;
    const { edits, error } = planSwap(rows, 0, a, b);
    if (error) continue; // same player, or both benched: nothing applied
    rows = applyEdits(rows, edits);
    wellFormed(rows, 0);
  }

  eq(rows.filter((r) => spotOf(r, 0) === 'Bench').length, 3, 'bench count drifted');
});

check('mixed swaps and moves keep the bench count honest', () => {
  let rows = board();
  rows = applyEdits(rows, planSwap(rows, 0, 'p10', 'p1').edits);
  rows = applyEdits(rows, planMove(rows, 0, 'p11', 'SS').edits);
  rows = applyEdits(rows, planSwap(rows, 0, 'p3', 'p12').edits);
  wellFormed(rows, 0);
  eq(rows.filter((r) => spotOf(r, 0) === 'Bench').length, 3);
});

check('a nine-player game has nobody on the bench and still swaps', () => {
  const rows = board().slice(0, 9);
  const { edits, error } = planSwap(rows, 0, 'p1', 'p9');
  assert(!error, error);
  const after = applyEdits(rows, edits);
  eq(spotOf(after.find((r) => r.playerId === 'p1'), 0), 'RF');
  wellFormed(after, 0);
});

// ---------------------------------------------------------------------------

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
failures.forEach((f) => console.log(`  FAIL  ${f}\n`));
process.exit(failures.length ? 1 : 0);
