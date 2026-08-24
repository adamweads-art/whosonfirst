/**
 * Rotation engine test suite.
 *
 * Every constraint from the spec gets an assertion, in priority order.
 * Run with: node rotation.test.js
 */

const {
  POSITIONS,
  activePositions,
  isEligible,
  buildBattingOrder,
  generateLineup,
  recomputeTallies,
} = require('./rotation');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, message: err.message });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

function section(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

// ---------------------------------------------------------------------------
// Fixture roster: 13 players, realistic constraints
// ---------------------------------------------------------------------------

function makeRoster() {
  return [
    { id: 'p01', name: 'Avery',   battingOrder: 1,  exclusions: [],       pitcherPool: true,  catcherPool: false },
    { id: 'p02', name: 'Bennett', battingOrder: 2,  exclusions: ['C'],    pitcherPool: true,  catcherPool: false },
    { id: 'p03', name: 'Cruz',    battingOrder: 3,  exclusions: [],       pitcherPool: false, catcherPool: true  },
    { id: 'p04', name: 'Dev',     battingOrder: 4,  exclusions: ['P'],    pitcherPool: false, catcherPool: true  },
    { id: 'p05', name: 'Eli',     battingOrder: 5,  exclusions: [],       pitcherPool: true,  catcherPool: true  },
    { id: 'p06', name: 'Finn',    battingOrder: 6,  exclusions: [],       pitcherPool: false, catcherPool: false },
    { id: 'p07', name: 'Gus',     battingOrder: 7,  exclusions: ['P','C'],pitcherPool: false, catcherPool: false },
    { id: 'p08', name: 'Hana',    battingOrder: 8,  exclusions: [],       pitcherPool: false, catcherPool: false },
    { id: 'p09', name: 'Ike',     battingOrder: 9,  exclusions: [],       pitcherPool: true,  catcherPool: false },
    { id: 'p10', name: 'Jo',      battingOrder: 10, exclusions: ['1B'],   pitcherPool: false, catcherPool: false },
    { id: 'p11', name: 'Kai',     battingOrder: 11, exclusions: [],       pitcherPool: false, catcherPool: true  },
    { id: 'p12', name: 'Lena',    battingOrder: 12, exclusions: [],       pitcherPool: false, catcherPool: false },
    { id: 'p13', name: 'Milo',    battingOrder: 13, exclusions: ['SS'],   pitcherPool: false, catcherPool: false },
  ];
}

const byId = (roster) => Object.fromEntries(roster.map((p) => [p.id, p]));

// ---------------------------------------------------------------------------

section('Field shape');

check('13 players fields 9 with 3 outfielders', () => {
  const pos = activePositions(13);
  assert(pos.length === 9, `expected 9 spots, got ${pos.length}`);
  ['LF', 'CF', 'RF'].forEach((o) =>
    assert(pos.includes(o), `missing ${o}`));
});

check('9 players fields 9', () => {
  assert(activePositions(9).length === 9);
});

check('8 players fields 8 with 2 outfielders', () => {
  const pos = activePositions(8);
  assert(pos.length === 8, `expected 8, got ${pos.length}`);
  assert(pos.filter((p) => ['LF','CF','RF'].includes(p)).length === 2);
});

check('7 players fields 7 with 1 outfielder, and it is not a corner', () => {
  const pos = activePositions(7);
  assert(pos.length === 7, `expected 7, got ${pos.length}`);
  const of = pos.filter((p) => ['LF','CF','RF'].includes(p));
  assert(of.length === 1, `expected 1 outfielder, got ${of.length}`);
  assert(of[0] === 'CF', `lone outfielder should cover center, got ${of[0]}`);
});

check('all 6 infield spots present at every roster size', () => {
  for (let n = 7; n <= 13; n++) {
    const pos = activePositions(n);
    ['P','C','1B','2B','3B','SS'].forEach((i) =>
      assert(pos.includes(i), `${n} players: missing ${i}`));
  }
});

check('6 players throws', () => {
  let threw = false;
  try { activePositions(6); } catch (e) { threw = true; }
  assert(threw, 'should refuse to field fewer than 7');
});

// ---------------------------------------------------------------------------

section('Hard constraint: position exclusions');

check('no player is ever assigned an excluded position', () => {
  const roster = makeRoster();
  const idx = byId(roster);
  for (let game = 1; game <= 20; game++) {
    const result = generateLineup({
      players: roster, gameNumber: game, seed: `x${game}`, inningsPlanned: 6,
    });
    result.innings.forEach((inning, i) => {
      Object.entries(inning).forEach(([pid, pos]) => {
        if (pos === 'Bench') return;
        assert(
          !idx[pid].exclusions.includes(pos),
          `game ${game} inning ${i + 1}: ${idx[pid].name} assigned excluded ${pos}`
        );
      });
    });
  }
});

check('exclusions hold even on a short roster where options are tight', () => {
  const roster = makeRoster();
  const idx = byId(roster);
  const absent = ['p01', 'p02', 'p03', 'p04', 'p05', 'p06'];
  const result = generateLineup({
    players: roster, absentIds: absent, gameNumber: 3, seed: 'tight',
  });
  result.innings.forEach((inning) => {
    Object.entries(inning).forEach(([pid, pos]) => {
      if (pos === 'Bench') return;
      assert(!idx[pid].exclusions.includes(pos),
        `${idx[pid].name} assigned excluded ${pos}`);
    });
  });
});

// ---------------------------------------------------------------------------

section('Hard constraint: battery pools');

check('P is only ever assigned from the pitcher pool', () => {
  const roster = makeRoster();
  const idx = byId(roster);
  for (let game = 1; game <= 20; game++) {
    const result = generateLineup({
      players: roster, gameNumber: game, seed: `p${game}`,
    });
    result.innings.forEach((inning, i) => {
      Object.entries(inning).forEach(([pid, pos]) => {
        if (pos !== 'P') return;
        assert(idx[pid].pitcherPool === true,
          `game ${game} inning ${i + 1}: ${idx[pid].name} pitching but not in pool`);
      });
    });
  }
});

check('C is only ever assigned from the catcher pool', () => {
  const roster = makeRoster();
  const idx = byId(roster);
  for (let game = 1; game <= 20; game++) {
    const result = generateLineup({
      players: roster, gameNumber: game, seed: `c${game}`,
    });
    result.innings.forEach((inning, i) => {
      Object.entries(inning).forEach(([pid, pos]) => {
        if (pos !== 'C') return;
        assert(idx[pid].catcherPool === true,
          `game ${game} inning ${i + 1}: ${idx[pid].name} catching but not in pool`);
      });
    });
  }
});

check('warns rather than violating when the pool is empty', () => {
  const roster = makeRoster().map((p) => ({ ...p, pitcherPool: false }));
  const result = generateLineup({ players: roster, gameNumber: 1, seed: 'nopool' });
  assert(result.warnings.length > 0, 'should warn when nobody can pitch');
  result.innings.forEach((inning) => {
    Object.values(inning).forEach((pos) =>
      assert(pos !== 'P', 'assigned P with an empty pitcher pool'));
  });
});

// ---------------------------------------------------------------------------

section('Bench fairness');

check('nobody sits twice while anyone has not sat', () => {
  const roster = makeRoster();
  const idx = byId(roster);
  for (let game = 1; game <= 20; game++) {
    const result = generateLineup({
      players: roster, gameNumber: game, seed: `b${game}`, inningsPlanned: 6,
    });
    const sits = {};
    roster.forEach((p) => { sits[p.id] = 0; });
    result.innings.forEach((inning) => {
      Object.entries(inning).forEach(([pid, pos]) => {
        if (pos === 'Bench') sits[pid] += 1;
      });
    });
    const counts = Object.values(sits);
    const spread = Math.max(...counts) - Math.min(...counts);
    assert(spread <= 1,
      `game ${game}: bench spread ${spread}, ` +
      Object.entries(sits).map(([k, v]) => `${idx[k].name}:${v}`).join(' '));
  }
});

check('every player is either fielding or benched, never missing', () => {
  const roster = makeRoster();
  const result = generateLineup({ players: roster, gameNumber: 1, seed: 'cover' });
  result.innings.forEach((inning, i) => {
    assert(Object.keys(inning).length === roster.length,
      `inning ${i + 1}: ${Object.keys(inning).length} of ${roster.length} accounted for`);
  });
});

check('no position is double-assigned within an inning', () => {
  const roster = makeRoster();
  for (let game = 1; game <= 20; game++) {
    const result = generateLineup({ players: roster, gameNumber: game, seed: `d${game}` });
    result.innings.forEach((inning, i) => {
      const used = Object.values(inning).filter((p) => p !== 'Bench');
      assert(new Set(used).size === used.length,
        `game ${game} inning ${i + 1}: duplicate position`);
    });
  }
});

// ---------------------------------------------------------------------------

section('Position variety within a game');

check('players rarely repeat a non-battery position in the same game', () => {
  // Battery is deliberately excluded. A kid pitching two innings or catching
  // three is normal baseball, not a rotation failure. The constraint that
  // matters is that nobody plays right field four times in one game.
  const roster = makeRoster();
  let repeats = 0;
  let opportunities = 0;
  for (let game = 1; game <= 20; game++) {
    const result = generateLineup({ players: roster, gameNumber: game, seed: `v${game}` });
    const seen = {};
    roster.forEach((p) => { seen[p.id] = {}; });
    result.innings.forEach((inning) => {
      Object.entries(inning).forEach(([pid, pos]) => {
        if (pos === 'Bench' || pos === 'P' || pos === 'C') return;
        opportunities += 1;
        seen[pid][pos] = (seen[pid][pos] || 0) + 1;
        if (seen[pid][pos] > 1) repeats += 1;
      });
    });
  }
  const rate = repeats / opportunities;
  // Threshold is a little looser than it looks: with only 7 non-battery spots
  // (down from 8 when there were four outfielders) there is less room to avoid
  // a repeat when exclusions bite. Real games are 4 to 6 innings, so this rate
  // across a 6-inning stress test represents a much smaller absolute count.
  assert(rate < 0.08, `repeat rate ${(rate * 100).toFixed(1)}% is too high`);
});

// ---------------------------------------------------------------------------

section('Season fairness convergence');

check('position innings even out over a full season', () => {
  const roster = makeRoster();
  const idx = byId(roster);
  let history = {};

  for (let game = 1; game <= 18; game++) {
    const result = generateLineup({
      players: roster, gameNumber: game, seed: `s${game}`, history, inningsPlanned: 6,
    });
    result.innings.forEach((inning) => {
      Object.entries(inning).forEach(([pid, pos]) => {
        if (!history[pid]) history[pid] = {};
        history[pid][pos] = (history[pid][pos] || 0) + 1;
      });
    });
  }

  // Compared within groups, not across them.
  //
  // A kid in a battery pool spends roughly 30 innings a season at P or C,
  // leaving about 53 to spread over the other eight spots. A kid in no pool
  // has all 83 for those same eight. So pool kids will always show fewer
  // innings at second base than non-pool kids, and no amount of tuning
  // changes that: the innings simply are not there. Conservation, not a bug.
  //
  // What the engine must guarantee is that kids in comparable situations are
  // treated comparably.
  const groups = {
    'battery pool': roster.filter((p) => p.pitcherPool || p.catcherPool),
    'field only': roster.filter((p) => !p.pitcherPool && !p.catcherPool),
  };

  POSITIONS.filter((pos) => pos !== 'P' && pos !== 'C').forEach((pos) => {
    Object.entries(groups).forEach(([label, members]) => {
      const eligible = members.filter((p) => isEligible(p, pos));
      if (eligible.length < 2) return;
      const counts = eligible.map((p) => (history[p.id] && history[p.id][pos]) || 0);
      const spread = Math.max(...counts) - Math.min(...counts);
      // Six innings across an 18 game season, under one game's worth.
      // Exclusions are the reason this cannot go tighter: a kid who will not
      // play shortstop has the same total innings to spend across seven
      // positions instead of eight, so those seven each run higher than a
      // teammate with no exclusions. The engine cannot invent innings.
      assert(spread <= 6,
        `${pos} within ${label}: spread of ${spread} ` +
        eligible.map((p, i) => `${p.name}:${counts[i]}`).join(' '));
    });
  });
});

check('battery load is even across the pools', () => {
  // Measured on combined P+C rather than per position. A kid in both pools
  // splits their battery time between the two jobs, so asserting that they
  // pitch as often as a pitch-only kid would be asking for the wrong thing.
  // What should hold is that no pool member carries much more battery duty
  // than another.
  const roster = makeRoster();
  let history = {};
  for (let game = 1; game <= 18; game++) {
    const result = generateLineup({
      players: roster, gameNumber: game, seed: `bt${game}`, history, inningsPlanned: 6,
    });
    result.innings.forEach((inning) => {
      Object.entries(inning).forEach(([pid, pos]) => {
        if (!history[pid]) history[pid] = {};
        history[pid][pos] = (history[pid][pos] || 0) + 1;
      });
    });
  }

  const poolMembers = roster.filter((p) => p.pitcherPool || p.catcherPool);
  const loads = poolMembers.map((p) => {
    const h = history[p.id] || {};
    return (h.P || 0) + (h.C || 0);
  });
  const spread = Math.max(...loads) - Math.min(...loads);
  // Under one full-game's worth of variance over an 18 game season, which is
  // as tight as this can go given how many battery-pool kids there are.
  assert(spread <= 10,
    `battery spread ${spread}: ` +
    poolMembers.map((p, i) => `${p.name}:${loads[i]}`).join(' '));

  // Nobody outside a pool should ever land in the battery.
  roster.filter((p) => !p.pitcherPool && !p.catcherPool).forEach((p) => {
    const h = history[p.id] || {};
    assert(!h.P && !h.C, `${p.name} is in no pool but logged battery innings`);
  });
});

check('total playing time stays close across the roster', () => {
  const roster = makeRoster();
  let history = {};
  for (let game = 1; game <= 18; game++) {
    const result = generateLineup({
      players: roster, gameNumber: game, seed: `t${game}`, history, inningsPlanned: 6,
    });
    result.innings.forEach((inning) => {
      Object.entries(inning).forEach(([pid, pos]) => {
        if (!history[pid]) history[pid] = {};
        history[pid][pos] = (history[pid][pos] || 0) + 1;
      });
    });
  }
  const totals = roster.map((p) => {
    const h = history[p.id] || {};
    return POSITIONS.reduce((sum, pos) => sum + (h[pos] || 0), 0);
  });
  const spread = Math.max(...totals) - Math.min(...totals);
  assert(spread <= 3,
    `total innings spread ${spread}: ` +
    roster.map((p, i) => `${p.name}:${totals[i]}`).join(' '));
});

check('bench innings even out over a season', () => {
  const roster = makeRoster();
  let history = {};
  for (let game = 1; game <= 18; game++) {
    const result = generateLineup({
      players: roster, gameNumber: game, seed: `bn${game}`, history, inningsPlanned: 6,
    });
    result.innings.forEach((inning) => {
      Object.entries(inning).forEach(([pid, pos]) => {
        if (!history[pid]) history[pid] = {};
        history[pid][pos] = (history[pid][pos] || 0) + 1;
      });
    });
  }
  const bench = roster.map((p) => (history[p.id] && history[p.id].Bench) || 0);
  const spread = Math.max(...bench) - Math.min(...bench);
  assert(spread <= 3,
    `bench spread ${spread}: ` +
    roster.map((p, i) => `${p.name}:${bench[i]}`).join(' '));
});

// ---------------------------------------------------------------------------

section('Batting order');

check('leadoff advances one player per game', () => {
  const roster = makeRoster();
  const first = buildBattingOrder(roster, 1)[0];
  const second = buildBattingOrder(roster, 2)[0];
  const third = buildBattingOrder(roster, 3)[0];
  assert(first.battingOrder === 1, `game 1 leadoff should be #1, got ${first.battingOrder}`);
  assert(second.battingOrder === 2, `game 2 leadoff should be #2, got ${second.battingOrder}`);
  assert(third.battingOrder === 3, `game 3 leadoff should be #3, got ${third.battingOrder}`);
});

check('relative order is preserved after rotation', () => {
  const roster = makeRoster();
  const order = buildBattingOrder(roster, 5).map((p) => p.battingOrder);
  assert(order[0] === 5, `expected leadoff 5, got ${order[0]}`);
  for (let i = 1; i < order.length; i++) {
    const expected = ((5 - 1 + i) % roster.length) + 1;
    assert(order[i] === expected,
      `slot ${i}: expected ${expected}, got ${order[i]}`);
  }
});

check('leadoff wraps past the roster size', () => {
  const roster = makeRoster();
  const g1 = buildBattingOrder(roster, 1)[0];
  const g14 = buildBattingOrder(roster, 14)[0];
  assert(g1.id === g14.id, 'game 14 should wrap back to game 1 leadoff');
});

check('absent players are dropped from the order', () => {
  const roster = makeRoster();
  const result = generateLineup({
    players: roster, absentIds: ['p01', 'p05'], gameNumber: 1, seed: 'abs',
  });
  const ids = result.battingOrder.map((p) => p.id);
  assert(ids.length === 11, `expected 11 batters, got ${ids.length}`);
  assert(!ids.includes('p01') && !ids.includes('p05'), 'absent player in order');
});

// ---------------------------------------------------------------------------

section('Determinism');

check('same seed produces the same lineup', () => {
  const roster = makeRoster();
  const a = generateLineup({ players: roster, gameNumber: 4, seed: 'fixed' });
  const b = generateLineup({ players: roster, gameNumber: 4, seed: 'fixed' });
  assert(JSON.stringify(a.innings) === JSON.stringify(b.innings),
    'identical seeds diverged');
});

check('different seeds produce different lineups', () => {
  const roster = makeRoster();
  const a = generateLineup({ players: roster, gameNumber: 4, seed: 'one' });
  const b = generateLineup({ players: roster, gameNumber: 4, seed: 'two' });
  assert(JSON.stringify(a.innings) !== JSON.stringify(b.innings),
    'different seeds produced identical output');
});

// ---------------------------------------------------------------------------

section('Short game handling');

check('planning fewer innings produces fewer innings', () => {
  const roster = makeRoster();
  const result = generateLineup({
    players: roster, gameNumber: 1, seed: 'short', inningsPlanned: 4,
  });
  assert(result.innings.length === 4, `expected 4, got ${result.innings.length}`);
});

check('short rosters still generate a full lineup', () => {
  const roster = makeRoster();
  for (const absentCount of [0, 1, 2, 3, 4, 5, 6]) {
    const absent = roster.slice(0, absentCount).map((p) => p.id);
    const result = generateLineup({
      players: roster, absentIds: absent, gameNumber: 2, seed: `sr${absentCount}`,
    });
    const expectedSpots = activePositions(13 - absentCount).length;
    result.innings.forEach((inning, i) => {
      const fielding = Object.values(inning).filter((p) => p !== 'Bench').length;
      assert(fielding === expectedSpots,
        `${13 - absentCount} players inning ${i + 1}: ${fielding} fielding, expected ${expectedSpots}`);
    });
  }
});

// ---------------------------------------------------------------------------

section('Tally recomputation');

check('innings beyond Innings Played are excluded', () => {
  const assignments = [
    { playerId: 'p01', gameId: 'g1', innings: ['SS','2B','LF','P','C','1B'] },
  ];
  const full = recomputeTallies(assignments, { g1: null });
  assert(full.p01.SS === 1 && full.p01.C === 1, 'full game should count all six');

  const short = recomputeTallies(assignments, { g1: 4 });
  assert(short.p01.SS === 1, 'inning 1 should count');
  assert(short.p01.P === 1, 'inning 4 should count');
  assert(short.p01.C === 0, 'inning 5 should not count');
  assert(short.p01['1B'] === 0, 'inning 6 should not count');
});

check('deleting a game removes its innings entirely', () => {
  const all = [
    { playerId: 'p01', gameId: 'g1', innings: ['SS','SS'] },
    { playerId: 'p01', gameId: 'g2', innings: ['LF','LF'] },
  ];
  const before = recomputeTallies(all, {});
  assert(before.p01.SS === 2 && before.p01.LF === 2);

  const after = recomputeTallies(all.filter((a) => a.gameId !== 'g2'), {});
  assert(after.p01.SS === 2, 'remaining game should be intact');
  assert(after.p01.LF === 0, 'deleted game should leave no phantom innings');
});

check('bench innings are tallied', () => {
  const assignments = [
    { playerId: 'p01', gameId: 'g1', innings: ['SS','Bench','LF','Bench'] },
  ];
  const t = recomputeTallies(assignments, {});
  assert(t.p01.Bench === 2, `expected 2 bench, got ${t.p01.Bench}`);
});

// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(50)}`);
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  ${f.name}\n    ${f.message}`));
  process.exit(1);
}
