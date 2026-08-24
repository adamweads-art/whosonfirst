import { Fragment } from 'react';
import Link from 'next/link';
import { getRoster, getGame, getAssignments } from '../../../../lib/airtable';
import { activePositions } from '../../../../lib/rotation';
import Logo from '../../../Logo';
import PrintButton from './PrintButton';

export const dynamic = 'force-dynamic';

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * The dugout card.
 *
 * Every position row is followed by a dashed write-in row. When a kid moves
 * mid-game you cross out and scribble the change directly under the inning it
 * happened in. That handwriting is what the phone photographs afterwards, so
 * the blank space is the point rather than wasted margin.
 */
export default async function CardPage({ params }) {
  let roster, game, allAssignments;

  try {
    [roster, game, allAssignments] = await Promise.all([
      getRoster(),
      getGame(params.id),
      getAssignments(),
    ]);
  } catch (err) {
    return (
      <main className="wrap">
        <div className="masthead">
          <h1>Cannot reach Airtable</h1>
        </div>
        <div className="notice">
          The card could not load. Check your connection and reload.
          <div className="eyebrow" style={{ marginTop: '0.5rem' }}>
            {err.message}
          </div>
        </div>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="wrap">
        <div className="notice">
          That game is not in the base. <Link href="/">Back to games</Link>
        </div>
      </main>
    );
  }

  const mine = allAssignments.filter((a) => a.gameId === game.id);

  if (mine.length === 0) {
    return (
      <main className="wrap">
        <div className="masthead">
          <h1>No lineup yet</h1>
        </div>
        <div className="notice">
          Build the lineup first.{' '}
          <Link href={`/game/${game.id}`}>Back to the game</Link>
        </div>
      </main>
    );
  }

  const byPlayer = Object.fromEntries(mine.map((a) => [a.playerId, a]));
  const playerById = Object.fromEntries(roster.map((p) => [p.id, p]));

  const played = mine
    .map((a) => playerById[a.playerId])
    .filter(Boolean)
    .sort(
      (a, b) =>
        (byPlayer[a.id].battingSlot ?? 99) - (byPlayer[b.id].battingSlot ?? 99)
    );

  const inningCount = Math.max(
    ...mine.map((a) => a.innings.filter(Boolean).length)
  );
  const positions = activePositions(played.length);
  const absent = roster.filter(
    (p) => p.active && !played.some((q) => q.id === p.id)
  );

  const label = (p) =>
    p.jersey != null ? `${p.jersey} ${p.name.split(' ')[0]}` : p.name.split(' ')[0];

  return (
    <>
      <div className="wrap no-print" style={{ paddingBottom: '0.5rem' }}>
        <div className="masthead">
          <Link href={`/game/${game.id}`} aria-label="Back to game" style={{ display: 'inline-block' }}>
            <Logo width={110} />
          </Link>
        </div>
        <PrintButton />
      </div>

      <div className="card-page">
        <div className="card-head">
          <div>
            <div
              style={{
                fontFamily: 'var(--display)',
                fontSize: '17pt',
                fontWeight: 700,
                textTransform: 'uppercase',
                lineHeight: 1.1,
              }}
            >
              vs {game.opponent || game.label}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8pt' }}>
              {formatDate(game.date)}
              {game.homeAway ? ` · ${game.homeAway}` : ''}
              {absent.length > 0 && ` · OUT: ${absent.map((p) => p.name.split(' ')[0]).join(', ')}`}
            </div>
          </div>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '7pt',
              letterSpacing: '0.1em',
              textAlign: 'right',
              color: '#555',
            }}
          >
            INNINGS PLAYED
            <div
              style={{
                border: '1px solid #000',
                width: '2.4rem',
                height: '1.5rem',
                marginTop: '2px',
                marginLeft: 'auto',
              }}
            />
          </div>
        </div>

        <table className="card">
          <thead>
            <tr>
              <th style={{ textAlign: 'left', width: '2.6rem' }}>POS</th>
              {Array.from({ length: inningCount }, (_, i) => (
                <th key={i}>{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => (
              <Fragment key={pos}>
                <tr>
                  <th>{pos}</th>
                  {Array.from({ length: inningCount }, (_, i) => {
                    const who = played.find(
                      (p) => byPlayer[p.id].innings[i] === pos
                    );
                    return <td key={i}>{who ? label(who) : ''}</td>;
                  })}
                </tr>
                <tr className="writein">
                  <th>CHG</th>
                  {Array.from({ length: inningCount }, (_, i) => (
                    <td key={i} />
                  ))}
                </tr>
              </Fragment>
            ))}
            <tr className="card-bench">
              <th>BENCH</th>
              {Array.from({ length: inningCount }, (_, i) => {
                const sitting = played.filter(
                  (p) => byPlayer[p.id].innings[i] === 'Bench'
                );
                return (
                  <td key={i}>
                    {sitting.map((p) => p.jersey ?? p.name.slice(0, 3)).join(' ')}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
          <table className="card-batting" style={{ flex: 1, borderCollapse: 'collapse' }}>
            <tbody>
              {played.map((p, i) => (
                <tr key={p.id}>
                  <td className="slot">{i + 1}</td>
                  <td>
                    {p.jersey != null ? `${p.jersey}  ` : ''}
                    {p.name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="notes-box" style={{ flex: 1 }}>
            <div className="label">What to work on</div>
            <div className="notes-lines" />
          </div>
        </div>
      </div>
    </>
  );
}
