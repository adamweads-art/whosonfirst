import Link from 'next/link';
import Logo from '../../Logo';
import NewGameClient from './NewGameClient';

export const metadata = { title: 'Add a game' };

export default function NewGamePage() {
  return (
    <main className="wrap">
      <div className="masthead">
        <div>
          <Link href="/" aria-label="Back to games" style={{ display: 'inline-block' }}>
            <Logo width={110} />
          </Link>
          <h1 style={{ marginTop: '0.5rem' }}>Add a game</h1>
        </div>
      </div>

      <NewGameClient />
    </main>
  );
}
