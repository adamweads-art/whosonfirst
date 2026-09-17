/**
 * Airtable data layer.
 *
 * Field IDs rather than names, deliberately. Names get renamed (we already hit
 * this once with "Assignments 2"), IDs never change. The tradeoff is that this
 * file is unreadable without the map below, so the map is the documentation.
 *
 * API call discipline: Airtable free allows 1000 calls per month. Every
 * function here is written to batch. A full generate cycle costs about ten
 * calls. Nothing else in the app should touch the API.
 */

const API = process.env.AIRTABLE_API_BASE || 'https://api.airtable.com/v0';

export const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;

export const TABLES = {
  players: 'tblVTEZExniNqtbZF',
  skills: 'tblrIzcHocRp31WIv',
  drills: 'tbl7nHgfx7WeYCKEs',
  games: 'tblrzGwalPzZ3xXGM',
  assignments: 'tbllj4SYnPs8682oF',
  observations: 'tbl01AiFZD4DqyqdI',
  practices: 'tbldRweoBUsm9rXIQ',
  blocks: 'tblubHMpufuf1tzZh',
};

export const F = {
  player: {
    name: 'fldHN8QEuRg9FA6pL',
    jersey: 'fldMT6Z8zZhGYbaCW',
    battingOrder: 'fldXbIvubTIXrjVpL',
    exclusions: 'fldvrs539ZxABjUM2',
    pitcherPool: 'fldCOGsJJGQgbddUp',
    catcherPool: 'fldJtoUKST7ITPmg8',
    active: 'fldD8CTtgs5k6dK2t',
    innings: {
      P: 'fldVMfEZn2MyiCKw4',
      C: 'fldrpe1L6bt5rKj6G',
      '1B': 'fld2QutFHUVu5Fx0j',
      '2B': 'fldTPFU3zGFnkvm3U',
      '3B': 'fldYBjxv63RYT8MbE',
      SS: 'fldpHSyuzBgsUWQWY',
      LF: 'flds8ZHZqZ5jKjD1a',
      CF: 'fldWwL4oz49G4FE85',
      RF: 'fldz4a5IjXCHenskF',
      Bench: 'fldoRtZvur1bkGdmX',
    },
  },
  game: {
    label: 'fldxxacfeFpvfVY4p',
    date: 'fldBTtH1wzDeHeij4',
    opponent: 'fldLJh6Qm9icc3N89',
    homeAway: 'fldrbWYzLOxtUZHFI',
    inningsPlanned: 'fldVAAThgitaEyVFu',
    inningsPlayed: 'fldSmfG9M5Yfxjc1N',
    status: 'fldJUAuIxZT808Rks',
    cardPhoto: 'fldtI8zavAfOw0aYO',
    rawNotes: 'fldMF6m27yns4ac8n',
    absentPlayers: 'fld0pfLRK9zb1B5YX',
  },
  assignment: {
    label: 'fldJ6cB3E3Nnw5gID',
    game: 'fldbtD1otPX6Lvh6E',
    player: 'fldaVFV6lSyT1S3B8',
    battingSlot: 'fldPapLnyge0ClfOT',
    modified: 'fld0pMT39OrfLUKvJ',
    innings: [
      'fld3tuNSCm5pyglIR',
      'fldpZtmTUk3LDPrsQ',
      'fldKwKt9nbn4WEdEy',
      'fldyDSXM1iu3PADk3',
      'fldQp5UD0jZSiRKsJ',
      'fld31XF73zH8avr1P',
    ],
  },
};

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

async function call(path, options = {}) {
  if (!BASE_ID || !TOKEN) {
    throw new Error(
      'Airtable is not configured. Set AIRTABLE_BASE_ID and AIRTABLE_TOKEN.'
    );
  }

  const res = await fetch(`${API}/${BASE_ID}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable ${res.status}: ${body}`);
  }
  return res.json();
}

/** Pages through a table. Airtable returns 100 records per call. */
async function listAll(tableId, params = {}) {
  const records = [];
  let offset;

  do {
    const qs = new URLSearchParams({
      pageSize: '100',
      returnFieldsByFieldId: 'true',
      ...params,
    });
    if (offset) qs.set('offset', offset);

    const data = await call(`${tableId}?${qs}`);
    records.push(...data.records);
    offset = data.offset;
  } while (offset);

  return records;
}

/** Airtable caps writes at 10 records per request. */
async function writeBatched(tableId, records, method) {
  const results = [];
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10);
    const data = await call(tableId, {
      method,
      body: JSON.stringify({ records: chunk, typecast: true }),
    });
    results.push(...data.records);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getRoster() {
  const records = await listAll(TABLES.players);

  return records
    .map((r) => ({
      id: r.id,
      name: r.fields[F.player.name] || '(unnamed)',
      jersey: r.fields[F.player.jersey] ?? null,
      battingOrder: r.fields[F.player.battingOrder] ?? 999,
      exclusions: r.fields[F.player.exclusions] || [],
      pitcherPool: r.fields[F.player.pitcherPool] === true,
      catcherPool: r.fields[F.player.catcherPool] === true,
      active: r.fields[F.player.active] !== false,
    }))
    .sort((a, b) => a.battingOrder - b.battingOrder);
}

export async function getGames() {
  const records = await listAll(TABLES.games);

  return records
    .map((r) => ({
      id: r.id,
      label: r.fields[F.game.label] || 'Untitled game',
      date: r.fields[F.game.date] || null,
      opponent: r.fields[F.game.opponent] || '',
      homeAway: r.fields[F.game.homeAway] || '',
      inningsPlanned: r.fields[F.game.inningsPlanned] ?? 6,
      inningsPlayed: r.fields[F.game.inningsPlayed] ?? null,
      status: r.fields[F.game.status] || 'Scheduled',
      absentIds: r.fields[F.game.absentPlayers] || [],
      rawNotes: r.fields[F.game.rawNotes] || '',
    }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export async function getGame(gameId) {
  const games = await getGames();
  return games.find((g) => g.id === gameId) || null;
}

export async function getAssignments() {
  const records = await listAll(TABLES.assignments);

  return records.map((r) => ({
    id: r.id,
    gameId: (r.fields[F.assignment.game] || [])[0] || null,
    playerId: (r.fields[F.assignment.player] || [])[0] || null,
    battingSlot: r.fields[F.assignment.battingSlot] ?? null,
    innings: F.assignment.innings.map((fid) => r.fields[fid] || null),
    modified: r.fields[F.assignment.modified] === true,
  }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function replaceAssignments(gameId, rows, existing) {
  const stale = existing.filter((a) => a.gameId === gameId).map((a) => a.id);

  for (let i = 0; i < stale.length; i += 10) {
    const qs = new URLSearchParams();
    stale.slice(i, i + 10).forEach((id) => qs.append('records[]', id));
    await call(`${TABLES.assignments}?${qs}`, { method: 'DELETE' });
  }

  const payload = rows.map((row) => {
    const fields = {
      [F.assignment.label]: row.label,
      [F.assignment.game]: [gameId],
      [F.assignment.player]: [row.playerId],
      [F.assignment.battingSlot]: row.battingSlot,
    };
    row.innings.forEach((pos, i) => {
      if (pos) fields[F.assignment.innings[i]] = pos;
    });
    return { fields };
  });

  return writeBatched(TABLES.assignments, payload, 'POST');
}

export async function writeTallies(tallies) {
  const payload = Object.entries(tallies).map(([playerId, counts]) => {
    const fields = {};
    Object.entries(F.player.innings).forEach(([pos, fid]) => {
      fields[fid] = counts[pos] || 0;
    });
    return { id: playerId, fields };
  });

  return writeBatched(TABLES.players, payload, 'PATCH');
}

export async function updateGame(gameId, fields) {
  return call(TABLES.games, {
    method: 'PATCH',
    body: JSON.stringify({ records: [{ id: gameId, fields }] }),
  });
}

export async function createGame({ date, opponent, homeAway, inningsPlanned }) {
  // The Game field is a formula in the base:
  //   DATETIME_FORMAT({Date}, 'MMM D') & " vs " & {Opponent}
  // Airtable computes it, so writing to it is rejected. Set the inputs and
  // the label appears on its own.
  const data = await call(TABLES.games, {
    method: 'POST',
    body: JSON.stringify({
      records: [
        {
          fields: {
            [F.game.date]: date,
            [F.game.opponent]: opponent,
            [F.game.homeAway]: homeAway,
            [F.game.inningsPlanned]: inningsPlanned,
            [F.game.status]: 'Scheduled',
          },
        },
      ],
      typecast: true,
    }),
  });

  return data.records[0];
}

export async function writeBattingOrder(orderedIds) {
  // Batting Order is 1-based and dense: the array's position is the answer.
  const payload = orderedIds.map((id, i) => ({
    id,
    fields: { [F.player.battingOrder]: i + 1 },
  }));
  return writeBatched(TABLES.players, payload, 'PATCH');
}

export const FD = {
  drill: {
    name: 'fldKLwC08lrL1htGc',
    description: 'fldlMkyXApv80Y8gq',
    duration: 'fld8juhi9eoDdeKt5',
    format: 'fld7uvgUXTlgwV3kq',
    minPlayers: 'fldbkgTktaYTN9pKW',
    maxPlayers: 'fldLPnF42TAudnl8s',
    equipment: 'fldXObqusLkcgoTPZ',
    setup: 'fld3sXgxgZ3hTDfnz',
    coaching: 'fldZFoA145aRF8l03',
    intensity: 'fldFZ2Kcd5bu8FSvG',
    skills: 'fldJ1F6FGATpucQCo',
  },
  practice: {
    label: 'fldiG8ne19GRZsJU2',
    date: 'fld7nWvZ7Rw4nLwdG',
    startTime: 'fldnYAdk9MZ5bp619',
    location: 'fldYZc0aTaiYfODyw',
    phase: 'fldDz9Soq52je40qT',
    notes: 'fldiRia33BoPqE1sa',
    attendance: 'fldVflr59ag5RZ8x0',
    focusSkills: 'fldyIRkiRZBwkyDlj',
    blocks: 'fldSuDmKCefgUYNfv',
  },
  block: {
    label: 'fldW2BrrgDhYD0SIV',
    order: 'fldqFGCbrnVpzyF07',
    type: 'fldNmhUmX5zxuZ3RL',
    duration: 'fldJrI7CQDIk72o8N',
    stationGroups: 'fldsNGNkBSlJ1BcDr',
    rotationMinutes: 'fldQUbI9CU2dospaG',
    notes: 'fldNpIkQ3qIIYz6pI',
    practice: 'fldhVoI9nXupgmYzs',
    drills: 'fldDLh6MIceN5Rrvr',
  },
};

export async function getDrills() {
  const records = await listAll(TABLES.drills);
  return records
    .map((r) => ({
      id: r.id,
      name: r.fields[FD.drill.name] || '(untitled)',
      description: r.fields[FD.drill.description] || '',
      duration: r.fields[FD.drill.duration] ?? 10,
      format: r.fields[FD.drill.format] || 'Either',
      minPlayers: r.fields[FD.drill.minPlayers] ?? 1,
      maxPlayers: r.fields[FD.drill.maxPlayers] ?? null,
      equipment: r.fields[FD.drill.equipment] || [],
      setup: r.fields[FD.drill.setup] || '',
      coaching: r.fields[FD.drill.coaching] || '',
      intensity: r.fields[FD.drill.intensity] || '',
      skillIds: r.fields[FD.drill.skills] || [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPractices() {
  const records = await listAll(TABLES.practices);
  return records
    .map((r) => ({
      id: r.id,
      label: r.fields[FD.practice.label] || 'Practice',
      date: r.fields[FD.practice.date] || null,
      startTime: r.fields[FD.practice.startTime] || '',
      location: r.fields[FD.practice.location] || '',
      phase: r.fields[FD.practice.phase] || 'Early',
      notes: r.fields[FD.practice.notes] || '',
      attendanceIds: r.fields[FD.practice.attendance] || [],
      blockIds: r.fields[FD.practice.blocks] || [],
    }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export async function getBlocks() {
  const records = await listAll(TABLES.blocks);
  return records
    .map((r) => ({
      id: r.id,
      practiceId: (r.fields[FD.block.practice] || [])[0] || null,
      order: r.fields[FD.block.order] ?? 0,
      type: r.fields[FD.block.type] || 'Whole Team',
      duration: r.fields[FD.block.duration] ?? 10,
      rotationMinutes: r.fields[FD.block.rotationMinutes] ?? null,
      stationGroups: r.fields[FD.block.stationGroups] || '',
      notes: r.fields[FD.block.notes] || '',
      drillIds: r.fields[FD.block.drills] || [],
    }))
    .sort((a, b) => a.order - b.order);
}

export async function createPractice(fields) {
  const data = await call(TABLES.practices, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  return data.records[0];
}

export async function updatePractice(practiceId, fields) {
  return call(TABLES.practices, {
    method: 'PATCH',
    body: JSON.stringify({ records: [{ id: practiceId, fields }] }),
  });
}

/**
 * Blocks get replaced wholesale rather than diffed. A practice has maybe eight
 * of them, so the bookkeeping of matching up edits costs more than it saves.
 */
export async function replaceBlocks(practiceId, blocks, existing) {
  const stale = existing.filter((b) => b.practiceId === practiceId).map((b) => b.id);
  for (let i = 0; i < stale.length; i += 10) {
    const qs = new URLSearchParams();
    stale.slice(i, i + 10).forEach((id) => qs.append('records[]', id));
    await call(`${TABLES.blocks}?${qs}`, { method: 'DELETE' });
  }

  if (blocks.length === 0) return [];

  const payload = blocks.map((b, i) => {
    const fields = {
      [FD.block.label]: b.label,
      [FD.block.practice]: [practiceId],
      [FD.block.order]: i + 1,
      [FD.block.type]: b.type,
      [FD.block.duration]: b.duration,
    };
    if (b.drillIds?.length) fields[FD.block.drills] = b.drillIds;
    if (b.rotationMinutes) fields[FD.block.rotationMinutes] = b.rotationMinutes;
    if (b.stationGroups) fields[FD.block.stationGroups] = b.stationGroups;
    if (b.notes) fields[FD.block.notes] = b.notes;
    return { fields };
  });

  return writeBatched(TABLES.blocks, payload, 'POST');
}

export function isConfigured() {
  return Boolean(BASE_ID && TOKEN);
}
