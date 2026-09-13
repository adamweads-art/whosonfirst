import Link from 'next/link';
import { getRoster } from '../../lib/airtable';
import Logo from '../Logo';
import RosterClient from './RosterClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Batting order' };

export default async function RosterPage() {
  let roster;
  try {
    roster = await getRoster();
  } catch (err) {
    return (
      <main className="wrap">
        <div className="masthead">
          <h1>Cannot reach Airtable</h1>
        </div>
        <div className="notice">
          Could not load the roster. Check your connection and reload.
          <div className="eyebrow" style={{ marginTop: '0.5rem' }}>
            {err.message}
          </div>
        </div>
      </main>
    );
  }

  const active = roster.filter((p) => p.active);

  return (
    <main className="wrap">
      <div className="masthead">
        <div>
          <Link href="/" aria-label="Back to games" style={{ display: 'inline-block' }}>
            <Logo width={110} />
          </Link>
          <h1 style={{ marginTop: '0.5rem' }}>Batting order</h1>
        </div>
      </div>

      {active.length === 0 ? (
        <div className="notice">
          No active players. Add players in the Airtable base and tick Active.
        </div>
      ) : (
        <RosterClient
          initial={active.map((p) => ({
            id: p.id,
            name: p.name,
            jersey: p.jersey,
            pitcherPool: p.pitcherPool,
            catcherPool: p.catcherPool,
          }))}
        />
      )}
    </main>
  );
}
