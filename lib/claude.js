/**
 * Claude API calls. Server-side only: the key never reaches the browser.
 *
 * Two jobs:
 *   readCard   photo of the marked-up dugout card -> innings played + notes
 *   tagNotes   free-text notes -> separate observations tagged to skills and players
 *
 * Model is an environment variable so it can be swapped without a code change.
 */

const API = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

export function claudeConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function ask(content, maxTokens = 4000) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content }],
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  // Pick out text blocks by type rather than position. Newer models can return
  // thinking blocks ahead of the answer.
  return (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

/** Pull the first JSON value out of a reply that may be wrapped in prose or fences. */
function extractJson(text, opener) {
  const cleaned = text.replace(/```json|```/g, '');
  const closer = opener === '{' ? '}' : ']';
  const start = cleaned.indexOf(opener);
  const end = cleaned.lastIndexOf(closer);
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Could not find structured data in the reply.');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

// ---------------------------------------------------------------------------

export async function readCard(base64, mediaType = 'image/jpeg') {
  const text = await ask([
    {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: base64 },
    },
    {
      type: 'text',
      text: `This is a photo of a youth baseball lineup card that a coach marked up by hand during a game.

Read only two handwritten things:
1. The number written in the box labelled INNINGS PLAYED near the top right corner.
2. The handwriting in the box labelled WHAT TO WORK ON at the bottom.

Ignore the printed lineup grid, the batting order, and anything scribbled in the CHG rows.

Transcribe the notes faithfully in the coach's own words. Do not summarize, reword, or add anything. If a word is illegible, write [?] in its place. If a box is empty, use null.

Reply with only this JSON and nothing else:
{"innings_played": <integer or null>, "notes": <string or null>}`,
    },
  ], 1500);

  const parsed = extractJson(text, '{');
  const innings = Number.parseInt(parsed.innings_played, 10);

  return {
    inningsPlayed: Number.isFinite(innings) && innings >= 1 && innings <= 9 ? innings : null,
    notes: typeof parsed.notes === 'string' ? parsed.notes.trim() : '',
  };
}

// ---------------------------------------------------------------------------

/**
 * Split notes into observations and tag each one.
 *
 * Skills and players are given to the model as short codes (S1, P4) rather
 * than Airtable record IDs. Short codes are far harder to garble, and every
 * code that comes back gets checked against the real list, so a made-up tag
 * is dropped rather than written to the base.
 */
export async function tagNotes(notes, skills, players) {
  const skillCodes = skills.map((s, i) => ({ code: `S${i + 1}`, ...s }));
  const playerCodes = players.map((p, i) => ({ code: `P${i + 1}`, ...p }));

  const skillList = skillCodes
    .map((s) => `${s.code}: ${s.name} (${s.category})`)
    .join('\n');
  const playerList = playerCodes
    .map((p) => `${p.code}: ${p.name}`)
    .join('\n');

  const text = await ask([
    {
      type: 'text',
      text: `A youth baseball coach wrote these notes after a game about what the team needs to work on:

"""
${notes}
"""

Split them into separate observations, one per distinct thing to work on. For each one:
- summary: a short plain phrase in the coach's voice, under 12 words
- scope: "Individual" if it names one player, "Group" if it names several, "Team" if it is about everyone
- skills: codes of the skills it relates to, from the list below. Usually one or two. Use an empty list if none genuinely fit rather than forcing a match.
- players: codes of any players it names, from the list below. Match on first names. Empty list if none are named.

Skills:
${skillList}

Players:
${playerList}

Reply with only a JSON array and nothing else:
[{"summary": "...", "scope": "Team", "skills": ["S3"], "players": []}]`,
    },
  ]);

  const parsed = extractJson(text, '[');
  const skillByCode = Object.fromEntries(skillCodes.map((s) => [s.code, s.id]));
  const playerByCode = Object.fromEntries(playerCodes.map((p) => [p.code, p.id]));
  const scopes = new Set(['Individual', 'Group', 'Team']);

  return (Array.isArray(parsed) ? parsed : [])
    .filter((o) => o && typeof o.summary === 'string' && o.summary.trim())
    .map((o) => {
      const playerIds = (o.players || []).map((c) => playerByCode[c]).filter(Boolean);
      const skillIds = (o.skills || []).map((c) => skillByCode[c]).filter(Boolean);
      let scope = scopes.has(o.scope) ? o.scope : 'Team';
      // Keep scope honest with what actually survived validation.
      if (playerIds.length === 0) scope = 'Team';
      else if (playerIds.length === 1) scope = 'Individual';
      else scope = 'Group';
      return {
        summary: o.summary.trim().slice(0, 120),
        scope,
        skillIds: [...new Set(skillIds)],
        playerIds: [...new Set(playerIds)],
      };
    });
}
