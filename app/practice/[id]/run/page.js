import Link from 'next/link';
import { getRoster, getDrills, getPractices, getBlocks } from '../../../../lib/airtable';
import Logo from '../../../Logo';
import RunClient from './RunClient';

export const dynamic = 'force-dynamic';

export default async function RunPage({ params }) {
  let roster, drills, practices, blocks;

  try {
    [roster, drills, practices, blocks] = await Promise.all([
      getRoster(),
      getDrills(),
      getPractices(),
      getBlocks(),
    ]);
  } catch (err) {
    return (
      <main className="wrap">
        <div className="masthead"><h1>Cannot reach Airtable</h1></div>
        <div className="notice">
          Could not load the practice.
          <div className="eyebrow" style={{ marginTop: '0.5rem' }}>{err.message}</div>
        </div>
      </main>
    );
  }

  const practice = practices.find((p) => p.id === params.id);
  if (!practice) {
    return (
      <main className="wrap">
        <div className="notice">
          That practice is not in the base. <Link href="/practice">Back</Link>
        </div>
      </main>
    );
  }

  const mine = blocks.filter((b) => b.practiceId === practice.id);

  return (
    <main className="wrap">
      <div className="masthead">
        <div>
          <Link href={`/practice/${practice.id}`} aria-label="Back to plan" style={{ display: 'inline-block' }}>
            <Logo width={110} />
          </Link>
          <h1 style={{ marginTop: '0.5rem' }}>{practice.label}</h1>
        </div>
      </div>

      <RunClient
        practice={{ id: practice.id, label: practice.label, startTime: practice.startTime }}
        blocks={mine}
        drillById={Object.fromEntries(drills.map((d) => [d.id, d]))}
        playerById={Object.fromEntries(roster.map((p) => [p.id, { name: p.name, jersey: p.jersey }]))}
      />
    </main>
  );
}
