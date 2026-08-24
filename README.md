# Who's On First - Lineup Manager

Batting order and field assignments for a youth baseball team, backed by Airtable.

Generate a lineup from confirmed attendance, print a card for the dugout, and log what actually happened afterward. Season-long playing time balances itself.

---

## What it does

**Before the game.** Tap who is missing, tap how many innings, tap Build lineup. About thirty seconds.

**During the game.** You carry paper. The card has a dashed write-in row under every position so a mid-game change gets scribbled directly under the inning it happened in.

**After the game.** Tap how many innings you actually played. That single number is what keeps the fairness math honest when a game gets called early. Optionally type a sentence about what needs work.

---

## Setup

### 1. Get an Airtable token

Go to [airtable.com/create/tokens](https://airtable.com/create/tokens) and create a personal access token.

Scopes: `data.records:read`, `data.records:write`, `schema.bases:read`

Access: grant it the **Little League Manager** base only.

### 2. Run it locally

```bash
npm install
cp .env.example .env.local
```

Open `.env.local` and paste your token into `AIRTABLE_TOKEN`. The base ID is already filled in.

```bash
npm run dev
```

Open http://localhost:3000

### 3. Deploy to Vercel

Push this folder to a GitHub repo, then import it at [vercel.com/new](https://vercel.com/new).

In the Vercel project, add two environment variables:

| Name | Value |
|---|---|
| `AIRTABLE_BASE_ID` | `appYrtViyYy69dyAt` |
| `AIRTABLE_TOKEN` | your token |

Deploy. On your phone, open the URL and use Add to Home Screen so it opens like an app.

---

## Before your first game

In Airtable, fill in the **Players** table:

- **Name** and **Jersey Number**
- **Batting Order**, 1 through 13. Leadoff advances one player each game automatically, so this only needs setting once.
- **Position Exclusions** for anyone who has asked not to play somewhere. Honored absolutely, never overridden.
- **Pitcher Pool** and **Catcher Pool** for kids who want those spots. Only these kids get assigned P or C.
- **Active** checked for everyone on the roster.

Then add your games to the **Games** table with a Date and Opponent. That is all a game needs before you can build a lineup for it.

---

## How assignments get decided

In priority order:

1. Nobody is ever assigned a position they excluded.
2. P comes only from the pitcher pool, C only from the catcher pool.
3. Six infielders always. Outfielders are whoever is left, up to four. Seven players minimum.
4. Nobody sits twice while anyone has not sat once.
5. Nobody repeats a position within a game unless there is no alternative.
6. Among everyone eligible, whoever has played that position least gets it.
7. Ties break toward whoever has the fewest total innings on the season.

Battery kids are ranked on combined pitching plus catching load, and every other position uses a non-battery tiebreak. Without that split, kids in the pools fall badly behind everywhere else, because they get claimed for P or C before the other eight spots are filled.

Rules 1 through 3 are absolute. If they cannot all be satisfied the app leaves the spot blank and tells you why rather than quietly breaking one.

---

## Editing a lineup by hand

Open the **Assignments** table in Airtable and change the Inning cell. Each is a dropdown. Tick **Modified** so you know it was touched.

Rebuilding the lineup discards manual edits, so make changes after you generate, not before.

---

## Season tallies

The eleven innings fields on **Players** are a cache. They get rebuilt from scratch every time you generate a lineup or log a game, so:

- Deleting a game removes its innings from the totals immediately.
- Innings past a game's Innings Played never count.
- If a number ever looks wrong, generate any lineup and the totals correct themselves.

---

## Free tier notes

Airtable free allows 1,000 API calls per month. Only this app touches the API, and only to generate lineups and log games, at roughly ten calls each. A busy month lands near sixty. Adding integrations that poll Airtable is what would put that budget at risk.

Free also caps the base at 1,000 records. One season fits with room to spare. At season end, duplicate the base as an archive, then clear Games, Assignments, Observations, Practices, and Practice Blocks from the working base. Players, Skills, and Drills carry forward.

---

## Tests

The rotation engine is pure and has no Airtable dependency, which is what makes it testable:

```bash
node rotation.test.js
```

Thirty checks covering field shape at every roster size, both hard constraints, bench fairness, batting order rotation, determinism, and season-long convergence.

---

## Layout

```
lib/rotation.js    the engine. pure functions, no I/O
lib/airtable.js    data layer. field IDs, not names
lib/actions.js     server actions connecting the two
app/page.js        game list
app/game/[id]/     attendance, generate, lineup grid
       /card/      the printable dugout card
       /log/       post-game
```
