import Link from 'next/link';
import { getPractices, getBlocks } from '../../lib/airtable';
import Logo from '../Logo';
import NewPractice from './NewPractice';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Practices' };

function formatDate(iso) {
  if (!iso) return 'No date';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default async function PracticesPage() {
  let practices = [];
  let blocks = [];
  let error = null;

  try {
    [practices, blocks] = await Promise.all([getPractices(), getBlocks()]);
  } catch (err) {
    error = err.message;
  }

  const minutesFor = (id) =>
    blocks
      .filter((b) => b.practiceId === id)
      .reduce((sum, b) => sum + (b.duration || 0), 0);

  return (
    <main className="wrap">
      <div className="masthead">
        <div>
          <Link href="/" aria-label="Back to games" style={{ display: 'inline-block' }}>
            <Logo width={110} />
          </Link>
          <h1 style={{ marginTop: '0.5rem' }}>Practices</h1>
        </div>
      </div>

      {error && <div className="notice">Could not reach Airtable. {error}</div>}

      {practices.length === 0 && !error && (
        <div className="panel">
          <h3>No practices yet</h3>
          <p className="muted" style={{ marginBottom: 0 }}>
            Add one below, then build the plan from the drill library.
          </p>
        </div>
      )}

      {practices.length > 0 && (
        <ul className="roster panel" style={{ padding: '0.25rem 0.75rem' }}>
          {practices.map((p) => {
            const mins = minutesFor(p.id);
            return (
              <li key={p.id}>
                <Link
                  href={`/practice/${p.id}`}
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
                  <span className="eyebrow" style={{ width: '5.5rem', flex: 'none' }}>
                    {formatDate(p.date)}
                  </span>
                  <span style={{ flex: 1, fontWeight: 500 }}>
                    {p.location || 'Practice'}
                    {p.startTime && <span className="tag">{p.startTime}</span>}
                  </span>
                  <span className="eyebrow">{mins > 0 ? `${mins} MIN` : 'EMPTY'}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <NewPractice />
    </main>
  );
}
