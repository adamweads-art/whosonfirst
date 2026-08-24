import Link from 'next/link';
import { getRoster, getGame, getAssignments } from '../../../lib/airtable';
import { activePositions } from '../../../lib/rotation';
import GameClient from './GameClient';

export const dynamic = 'force-dynamic';

export default async function GamePage({ params }) {
  let roster, game, allAssignments;

  try {
    [roster, game, allAssignments] = await Promise.all([
      getRoster(),
      getGame(params.id),
      getAssignments(),
    ]);
  } catch (err) {
    // A blank error screen the night before a game is useless. Say what broke.
    return (
      <main className="wrap">
        <div className="masthead">
          <h1>Cannot reach Airtable</h1>
        </div>
        <div className="notice">
          The lineup could not load. Check your connection and reload.
          <div className="eyebrow" style={{ marginTop: '0.5rem' }}>
            {err.message}
          </div>
        </div>
        <p style={{ marginTop: '1rem' }}>
          <Link href="/">← Back to games</Link>
        </p>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="wrap">
        <div className="masthead">
          <h1>Not found</h1>
        </div>
        <div className="notice">
          That game is not in the base. <Link href="/">Back to games</Link>
        </div>
      </main>
    );
  }

  const mine = allAssignments.filter((a) => a.gameId === game.id);
  const byPlayer = Object.fromEntries(mine.map((a) => [a.playerId, a]));
  const playerById = Object.fromEntries(roster.map((p) => [p.id, p]));

  const played = mine
    .map((a) => playerById[a.playerId])
    .filter(Boolean)
    .sort(
      (a, b) =>
        (byPlayer[a.id].battingSlot ?? 99) - (byPlayer[b.id].battingSlot ?? 99)
    );

  const inningCount = mine.length
    ? Math.max(...mine.map((a) => a.innings.filter(Boolean).length))
    : 0;

  const positions = played.length >= 7 ? activePositions(played.length) : [];

  return (
    <main className="wrap">
      <div className="masthead">
        <div>
          <span className="eyebrow">
            <Link href="/" style={{ textDecoration: 'none' }}>
              ← Who&rsquo;s on First?
            </Link>
          </span>
          <h1 style={{ marginTop: '0.15rem' }}>
            {game.opponent || game.label}
          </h1>
        </div>
        <span className="eyebrow">{game.homeAway || ''}</span>
      </div>

      <div className="stack">
        {inningCount > 0 && (
          <div className="action-row no-print">
            <a href="#build" className="btn btn-quiet">
              Build lineup
            </a>
            <Link href={`/game/${game.id}/log`} className="btn btn-quiet">
              {game.inningsPlayed != null
                ? `Logged ${game.inningsPlayed} innings`
                : 'What happened'}
            </Link>
          </div>
        )}

        {inningCount > 0 && (
          <section className="panel">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: '0.6rem',
              }}
            >
              <h2>Field</h2>
              <Link href={`/game/${game.id}/card`} className="eyebrow">
                Print card →
              </Link>
            </div>

            <div className="grid-scroll">
              <table className="grid">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>POS</th>
                    {Array.from({ length: inningCount }, (_, i) => (
                      <th key={i}>{i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => (
                    <tr key={pos}>
                      <th>{pos}</th>
                      {Array.from({ length: inningCount }, (_, i) => {
                        const who = played.find(
                          (p) => byPlayer[p.id].innings[i] === pos
                        );
                        return (
                          <td key={i}>
                            {who ? (
                              who.jersey != null ? (
                                <span className="num">{who.jersey}</span>
                              ) : (
                                who.name.split(' ')[0]
                              )
                            ) : (
                              '·'
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="bench-row">
                    <th>BENCH</th>
                    {Array.from({ length: inningCount }, (_, i) => {
                      const sitting = played.filter(
                        (p) => byPlayer[p.id].innings[i] === 'Bench'
                      );
                      return (
                        <td key={i}>
                          {sitting.length
                            ? sitting
                                .map((p) =>
                                  p.jersey != null
                                    ? p.jersey
                                    : p.name.slice(0, 3)
                                )
                                .join(' ')
                            : '—'}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="eyebrow" style={{ marginTop: '0.6rem' }}>
              Numbers are jerseys
            </p>
          </section>
        )}

        {inningCount > 0 && (
          <section className="panel">
            <h2 style={{ marginBottom: '0.6rem' }}>Batting order</h2>
            <table className="grid" style={{ fontSize: '0.85rem' }}>
              <tbody>
                {played.map((p, i) => (
                  <tr key={p.id}>
                    <th style={{ width: '2.2rem', textAlign: 'center' }}>
                      {i + 1}
                    </th>
                    <td style={{ textAlign: 'left' }}>
                      {p.jersey != null && (
                        <span className="num">{p.jersey} </span>
                      )}
                      {p.name}
                      {i === 0 && <span className="lead"> LEADOFF</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <div id="build" style={{ scrollMarginTop: '1rem' }}>
          <GameClient
            game={game}
            roster={roster}
            initialAbsent={game.absentIds}
            gridInnings={inningCount}
          />
        </div>

        {inningCount > 0 && (
          <Link
            href={`/game/${game.id}/log`}
            className="btn btn-quiet"
            style={{
              display: 'block',
              textAlign: 'center',
              textDecoration: 'none',
              lineHeight: '2.1',
            }}
          >
            {game.inningsPlayed != null
              ? `Logged ${game.inningsPlayed} innings`
              : 'What happened'}
          </Link>
        )}
      </div>
    </main>
  );
}
