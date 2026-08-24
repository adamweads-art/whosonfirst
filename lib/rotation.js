/**
 * Little League rotation engine.
 *
 * Pure functions, no I/O, no Airtable dependency. Everything the engine needs
 * arrives as arguments and everything it decides comes back as a return value.
 * That is what makes it testable in isolation.
 */

export const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'LCF', 'RCF', 'RF'];
export const INFIELD = ['P', 'C', '1B', '2B', '3B', 'SS'];

// Order in which outfield spots get filled as the roster shrinks.
// With one outfielder you want them roughly in center, not stranded in right.
const OUTFIELD_FILL_ORDER = ['LCF', 'RCF', 'LF', 'RF'];

export const MIN_PLAYERS = 7;
const MAX_INNINGS = 6;

// ---------------------------------------------------------------------------
// Seeded PRNG. Deterministic output for a given seed so tests are repeatable
// and a regenerated lineup for the same game is stable.
// ---------------------------------------------------------------------------

function makeRng(seed) {
  let s = 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) {
    s = (s * 31 + str.charCodeAt(i)) >>> 0;
  }
  s = s || 1;
  return function next() {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Field shape
// ---------------------------------------------------------------------------

/**
 * Six infielders always. Outfielders are whatever is left over, capped at four.
 */
export function activePositions(playerCount) {
  if (playerCount < MIN_PLAYERS) {
    throw new Error(
      `Only ${playerCount} players available. Need at least ${MIN_PLAYERS} to field a team.`
    );
  }
  const outfielderCount = Math.min(Math.max(playerCount - INFIELD.length, 0), 4);
  return [...INFIELD, ...OUTFIELD_FILL_ORDER.slice(0, outfielderCount)];
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

/**
 * Hard constraints only. A player is eligible for a position if they have not
 * excluded it and, for P and C, if they are in that pool.
 */
export function isEligible(player, position) {
  if (player.exclusions && player.exclusions.includes(position)) return false;
  if (position === 'P' && !player.pitcherPool) return false;
  if (position === 'C' && !player.catcherPool) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Batting order
// ---------------------------------------------------------------------------

/**
 * Order stays fixed by the roster's Batting Order field. Leadoff rotates
 * forward one slot per game, wrapping around the present players.
 */
export function buildBattingOrder(activeRoster, gameNumber) {
  const sorted = [...activeRoster].sort((a, b) => a.battingOrder - b.battingOrder);
  if (sorted.length === 0) return [];
  const leadoff = ((gameNumber - 1) % sorted.length + sorted.length) % sorted.length;
  return [...sorted.slice(leadoff), ...sorted.slice(0, leadoff)];
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * @param {Object}   opts
 * @param {Array}    opts.players         Full roster. {id, name, battingOrder, exclusions[], pitcherPool, catcherPool, active}
 * @param {Array}    opts.absentIds       Player ids not at this game
 * @param {number}   opts.inningsPlanned  How many innings to plan (1-6)
 * @param {number}   opts.gameNumber      Sequence number, drives leadoff rotation
 * @param {Object}   opts.history         {playerId: {P:n, C:n, ..., Bench:n}} season totals so far
 * @param {*}        opts.seed            Anything stringable. Same seed gives same lineup.
 *
 * @returns {Object} {battingOrder, innings, warnings}
 *   innings is an array of {playerId: position|'Bench'} maps, one per inning.
 */
export function generateLineup(opts) {
  const {
    players,
    absentIds = [],
    inningsPlanned = MAX_INNINGS,
    gameNumber = 1,
    history = {},
    seed = 'default',
  } = opts;

  const rng = makeRng(seed);
  const warnings = [];

  const roster = players
    .filter((p) => p.active !== false)
    .filter((p) => !absentIds.includes(p.id));

  const positions = activePositions(roster.length);
  const fieldSpots = positions.length;
  const benchPerInning = Math.max(0, roster.length - fieldSpots);

  // Season counts, cloned so we can accumulate this game's innings as we go.
  // The engine treats in-game assignments as immediately "spent" so that a kid
  // who plays shortstop in the first inning is deprioritized for it later.
  const seasonCount = {};
  const benchCount = {};
  roster.forEach((p) => {
    const h = history[p.id] || {};
    seasonCount[p.id] = {};
    POSITIONS.forEach((pos) => { seasonCount[p.id][pos] = h[pos] || 0; });
    benchCount[p.id] = h.Bench || 0;
  });

  const totalInnings = {};
  roster.forEach((p) => {
    totalInnings[p.id] = POSITIONS.reduce((sum, pos) => sum + seasonCount[p.id][pos], 0);
  });

  // Battery load and non-battery load are tracked separately because kids in
  // the P or C pools get claimed for the battery before the other eight spots
  // are filled. Without this split they fall far behind everywhere else: a kid
  // in both pools can go a whole season barely seeing the infield.
  const batteryLoad = (id) => seasonCount[id].P + seasonCount[id].C;
  const nonBatteryLoad = (id) => totalInnings[id] - batteryLoad(id);

  const benchedThisGame = {};
  const playedThisGame = {};
  roster.forEach((p) => {
    benchedThisGame[p.id] = 0;
    playedThisGame[p.id] = new Set();
  });

  const innings = [];

  for (let inning = 0; inning < inningsPlanned; inning++) {
    const assignment = {};

    // --- Bench selection -------------------------------------------------
    // Rule: nobody sits twice while anyone has yet to sit. Within that,
    // whoever has the fewest bench innings on the season sits first.
    let benched = [];
    if (benchPerInning > 0) {
      const notYetSat = roster
        .filter((p) => benchedThisGame[p.id] === 0)
        .sort((a, b) =>
          benchCount[a.id] - benchCount[b.id] ||
          totalInnings[b.id] - totalInnings[a.id] ||
          rng() - 0.5
        );

      const pool = notYetSat.length >= benchPerInning
        ? notYetSat
        : [...roster].sort((a, b) =>
            benchedThisGame[a.id] - benchedThisGame[b.id] ||
            benchCount[a.id] - benchCount[b.id] ||
            rng() - 0.5
          );

      benched = pool.slice(0, benchPerInning);
      benched.forEach((p) => {
        assignment[p.id] = 'Bench';
        benchedThisGame[p.id] += 1;
        benchCount[p.id] += 1;
      });
    }

    // --- Field assignment ------------------------------------------------
    const benchedIds = new Set(benched.map((p) => p.id));
    const available = roster.filter((p) => !benchedIds.has(p.id));
    const taken = new Set();

    // Most-constrained-first. P and C have the smallest eligible pools, so
    // filling them last is how a greedy assigner paints itself into a corner.
    // Sorting positions by how many players can actually play them avoids
    // nearly all dead ends without needing to backtrack.
    const ordered = [...positions].sort((a, b) => {
      const countA = available.filter((p) => isEligible(p, a)).length;
      const countB = available.filter((p) => isEligible(p, b)).length;
      return countA - countB || rng() - 0.5;
    });

    for (const pos of ordered) {
      const isBattery = pos === 'P' || pos === 'C';

      // Battery spots rank on combined P+C load first, so a kid in both pools
      // does not get double the battery duty of a kid in only one.
      //
      // Every other spot ranks on innings at that position, then on how little
      // non-battery time the player has had. That second term is what pulls
      // battery kids back into the rest of the field.
      const rank = isBattery
        ? (a, b) =>
            (batteryLoad(a.id) - batteryLoad(b.id)) ||
            (seasonCount[a.id][pos] - seasonCount[b.id][pos]) ||
            (totalInnings[a.id] - totalInnings[b.id]) ||
            (rng() - 0.5)
        : (a, b) =>
            (seasonCount[a.id][pos] - seasonCount[b.id][pos]) ||
            (nonBatteryLoad(a.id) - nonBatteryLoad(b.id)) ||
            (totalInnings[a.id] - totalInnings[b.id]) ||
            (rng() - 0.5);

      // Preferred: eligible, unassigned, and hasn't already played here today.
      let candidates = available
        .filter((p) => !taken.has(p.id))
        .filter((p) => isEligible(p, pos))
        .filter((p) => !playedThisGame[p.id].has(pos))
        .sort(rank);

      // Fallback: allow a repeat position within the game. Soft constraint.
      if (candidates.length === 0) {
        candidates = available
          .filter((p) => !taken.has(p.id))
          .filter((p) => isEligible(p, pos))
          .sort(rank);
      }

      if (candidates.length === 0) {
        // Hard constraints cannot all be met. Leave the spot open rather than
        // silently violating an exclusion or a pool restriction.
        warnings.push(
          `Inning ${inning + 1}: no eligible player for ${pos}. ` +
          `Check pool checkboxes and position exclusions.`
        );
        continue;
      }

      const chosen = candidates[0];
      assignment[chosen.id] = pos;
      taken.add(chosen.id);
      playedThisGame[chosen.id].add(pos);
      seasonCount[chosen.id][pos] += 1;
      totalInnings[chosen.id] += 1;
    }

    innings.push(assignment);
  }

  return {
    battingOrder: buildBattingOrder(roster, gameNumber),
    innings,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Tally recomputation
// ---------------------------------------------------------------------------

/**
 * Rebuild season totals from scratch out of assignment records.
 *
 * Recompute, never increment. Last season's version incremented running totals,
 * so deleting a game left phantom innings in the tally forever. Innings beyond
 * a game's actual Innings Played are excluded here, which is what makes the
 * one-tap post-game field meaningful.
 *
 * @param {Array} assignments  {playerId, gameId, innings: ['SS','Bench',...]}
 * @param {Object} gameInningsPlayed  {gameId: number|null}. null means as planned.
 */
export function recomputeTallies(assignments, gameInningsPlayed = {}) {
  const tallies = {};

  for (const a of assignments) {
    if (!tallies[a.playerId]) {
      tallies[a.playerId] = {};
      POSITIONS.forEach((pos) => { tallies[a.playerId][pos] = 0; });
      tallies[a.playerId].Bench = 0;
    }

    const cap = gameInningsPlayed[a.gameId];
    const limit = (cap === null || cap === undefined) ? a.innings.length : cap;

    a.innings.slice(0, limit).forEach((pos) => {
      if (!pos) return;
      if (tallies[a.playerId][pos] === undefined) return;
      tallies[a.playerId][pos] += 1;
    });
  }

  return tallies;
}
