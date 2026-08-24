import Link from 'next/link';
import { getGame } from '../../../../lib/airtable';
import LogClient from './LogClient';

export const dynamic = 'force-dynamic';

export default async function LogPage({ params }) {
  let game;

  try {
    game = await getGame(params.id);
  } catch (err) {
    return (
      <main className="wrap">
        <div className="masthead">
          <h1>Cannot reach Airtable</h1>
        </div>
        <div className="notice">
          Could not load this game. Check your connection and reload.
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

  return (
    <main className="wrap">
      <div className="masthead">
        <div>
          <span className="eyebrow">
            <Link href={`/game/${game.id}`} style={{ textDecoration: 'none' }}>
              ← Back
            </Link>
          </span>
          <h1 style={{ marginTop: '0.15rem' }}>After the game</h1>
        </div>
      </div>

      <LogClient game={game} />
    </main>
  );
}
