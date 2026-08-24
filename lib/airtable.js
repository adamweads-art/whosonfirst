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
      LCF: 'fldWwL4oz49G4FE85',
      RCF: 'fldQGnUg35eCfYX4h',
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
      body: JSON.stringify({ records: chunk, typecast: false }),
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

export function isConfigured() {
  return Boolean(BASE_ID && TOKEN);
}
