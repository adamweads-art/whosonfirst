'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { logGame } from '../../../../lib/actions';

export default function LogClient({ game }) {
  const [innings, setInnings] = useState(game.inningsPlayed ?? null);
  const [notes, setNotes] = useState(game.rawNotes || '');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const router = useRouter();

  function save() {
    if (innings == null) {
      setError('Pick how many innings you played.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await logGame(game.id, innings, notes);
      if (res?.error) setError(res.error);
      else router.push(`/game/${game.id}`);
    });
  }

  return (
    <div className="stack">
      <section className="panel">
        <h2 style={{ marginBottom: '0.5rem' }}>How many innings?</h2>
        <div className="steppers">
          {[2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              type="button"
              className="stepper"
              aria-pressed={innings === n}
              onClick={() => setInnings(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="eyebrow" style={{ marginTop: '0.6rem' }}>
          Anything you planned past this stops counting toward playing time
        </p>
      </section>

      <section className="panel">
        <h2 style={{ marginBottom: '0.5rem' }}>What to work on</h2>
        <textarea
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Nobody covered first on bunts. Marcus struggled on backhands."
        />
        <p className="eyebrow" style={{ marginTop: '0.5rem' }}>
          Write it however you say it. Optional.
        </p>
      </section>

      {error && <div className="notice">{error}</div>}

      <button className="btn" onClick={save} disabled={pending}>
        {pending ? 'Saving' : 'Save'}
      </button>
    </div>
  );
}
