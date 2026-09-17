import Link from 'next/link';
import { getGames, isConfigured } from '../lib/airtable';
import Logo from './Logo';
import RefreshTallies from './RefreshTallies';
import AddGame from './AddGame';

export const dynamic = 'force-dynamic';

function formatDate(iso) {
  if (!iso) return 'No date';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default async function Home() {
  if (!isConfigured()) {
    return (
      <main className="wrap">
        <div className="masthead">
          <Logo width={180} priority />
        </div>
        <div className="notice">
          Airtable is not connected yet. Add <code>AIRTABLE_BASE_ID</code> and{' '}
          <code>AIRTABLE_TOKEN</code> to your environment, then reload.
        </div>
      </main>
    );
  }

  let games = [];
  let error = null;
  try {
    games = await getGames();
  } catch (err) {
    error = err.message;
  }

  const needsLogging = games.filter(
    (g) => g.status === 'Lineup Generated' && g.inningsPlayed == null
  );

  return (
    <main className="wrap">
      <div className="masthead">
        <Logo width={180} priority />
        <Link href="/game/new" className="add-btn" aria-label="Add a game">
          +
        </Link>
      </div>

      {error && <div className="notice">Could not reach Airtable. {error}</div>}

      {needsLogging.length > 0 && (
        <div className="notice" style={{ marginBottom: '1rem' }}>
          <strong>{needsLogging.length}</strong>{' '}
          {needsLogging.length === 1 ? 'game needs' : 'games need'} an innings
          count. Without it the season tallies assume every game went the full
          six.
        </div>
      )}

      {games.length === 0 && !error && (
        <div className="panel">
          <h3>No games yet</h3>
          <p className="muted" style={{ marginBottom: '0.75rem' }}>
            Add your first game and you can build a lineup for it right away.
          </p>
          <Link
            href="/game/new"
            className="btn"
            style={{
              display: 'block',
              textAlign: 'center',
              textDecoration: 'none',
              lineHeight: '2.1',
            }}
          >
            Add a game
          </Link>
        </div>
      )}

      {games.length > 0 && (
        <ul className="roster panel" style={{ padding: '0.25rem 0.75rem' }}>
          {games.map((g) => (
            <li key={g.id}>
              <Link
                href={`/game/${g.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.8rem 0.25rem',
                  textDecoration: 'none',
                  color: 'var(--ink)',
                  minHeight: 48,
                }}
              >
                <span
                  className="eyebrow"
                  style={{ width: '5.5rem', flex: 'none' }}
                >
                  {formatDate(g.date)}
                </span>
                <span style={{ flex: 1, fontWeight: 500 }}>
                  {g.opponent || g.label}
                  {g.homeAway === 'Away' && (
                    <span className="tag">AWAY</span>
                  )}
                </span>
                <span className="eyebrow">
                  {g.inningsPlayed != null
                    ? `${g.inningsPlayed} INN`
                    : g.status === 'Lineup Generated'
                    ? 'READY'
                    : 'NEW'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <AddGame />

      <Link
        href="/practice"
        className="btn btn-quiet"
        style={{
          display: 'block',
          textAlign: 'center',
          textDecoration: 'none',
          lineHeight: '2.4',
          marginTop: '1.25rem',
          fontSize: '0.9rem',
          minHeight: 44,
        }}
      >
        Practices
      </Link>

      <Link
        href="/roster"
        className="btn btn-quiet"
        style={{
          display: 'block',
          textAlign: 'center',
          textDecoration: 'none',
          lineHeight: '2.4',
          marginTop: '0.5rem',
          fontSize: '0.9rem',
          minHeight: 44,
        }}
      >
        Batting order
      </Link>

      <RefreshTallies />
    </main>
  );
}
