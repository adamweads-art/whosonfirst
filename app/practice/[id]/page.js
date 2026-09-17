import Link from 'next/link';
import { getRoster, getDrills, getPractices, getBlocks } from '../../../lib/airtable';
import Logo from '../../Logo';
import PlanClient from './PlanClient';

export const dynamic = 'force-dynamic';

const TARGET_MINUTES = 90;

export default async function PracticePage({ params }) {
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
        <div className="masthead"><h1>Not found</h1></div>
        <div className="notice">
          That practice is not in the base. <Link href="/practice">Back to practices</Link>
        </div>
      </main>
    );
  }

  const mine = blocks
    .filter((b) => b.practiceId === practice.id)
    .map((b) => ({
      key: b.id,
      type: b.type,
      duration: b.duration,
      drillIds: b.drillIds,
      rotationMinutes: b.rotationMinutes,
      notes: b.notes,
    }));

  // Skills tagged for later in the season are hidden early, so the picker does
  // not offer stealing drills in week one.
  const phaseRank = { Early: 0, Mid: 1, Late: 2 };
  const allowed = phaseRank[practice.phase] ?? 0;

  return (
    <main className="wrap">
      <div className="masthead">
        <div>
          <Link href="/practice" aria-label="Back to practices" style={{ display: 'inline-block' }}>
            <Logo width={110} />
          </Link>
          <h1 style={{ marginTop: '0.5rem' }}>{practice.label}</h1>
        </div>
        <span className="eyebrow">{practice.phase} season</span>
      </div>

      <PlanClient
        practice={practice}
        roster={roster.filter((p) => p.active)}
        drills={drills}
        initialBlocks={mine}
        target={TARGET_MINUTES}
      />
    </main>
  );
}
