import Link from 'next/link';
import { getRoster, getDrills, getPractices, getBlocks, getSkills, getObservations, getGames } from '../../../lib/airtable';
import Logo from '../../Logo';
import ConfirmDelete from '../../ConfirmDelete';
import { deletePractice } from '../../../lib/actions';
import PlanClient from './PlanClient';

export const dynamic = 'force-dynamic';

const TARGET_MINUTES = 90;

export default async function PracticePage({ params }) {
  let roster, drills, practices, blocks, skills, observations, games;

  try {
    [roster, drills, practices, blocks, skills, observations, games] = await Promise.all([
      getRoster(),
      getDrills(),
      getPractices(),
      getBlocks(),
      getSkills(),
      getObservations(),
      getGames(),
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

  // Open observations from games, shaped for display. Names are resolved here so
  // the client component only deals with plain strings.
  const skillName = Object.fromEntries(skills.map((sk) => [sk.id, sk.name]));
  const playerName = Object.fromEntries(roster.map((p) => [p.id, p.name.split(' ')[0]]));
  const gameLabel = Object.fromEntries(games.map((g) => [g.id, g.opponent || g.label]));

  const openObs = observations
    .filter((o) => o.status === 'Open')
    .slice(0, 12)
    .map((o) => ({
      id: o.id,
      summary: o.summary,
      date: o.date,
      game: o.gameId ? gameLabel[o.gameId] || '' : '',
      players: o.playerIds.map((id) => playerName[id]).filter(Boolean),
      skills: o.skillIds.map((id) => skillName[id]).filter(Boolean),
      skillIds: o.skillIds,
    }));

  return (
    <main className="wrap">
      <div className="masthead">
        <div>
          <Link href="/practice" aria-label="Back to practices" style={{ display: 'inline-block' }}>
            <Logo width={110} />
          </Link>
          <h1 style={{ marginTop: '0.5rem' }}>{practice.label}</h1>
        </div>
      </div>

      <PlanClient
        practice={practice}
        roster={roster.filter((p) => p.active)}
        drills={drills}
        initialBlocks={mine}
        target={TARGET_MINUTES}
        observations={openObs}
      />

      <ConfirmDelete
        label="Delete this practice"
        warning="This removes the practice and its blocks. Anything it was set to address goes back to your open items."
        onDelete={deletePractice.bind(null, practice.id)}
        redirectTo="/practice"
      />
    </main>
  );
}
