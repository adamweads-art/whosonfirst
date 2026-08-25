'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createGame } from '../lib/actions';

export default function AddGame() {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [opponent, setOpponent] = useState('');
  const [homeAway, setHomeAway] = useState('Home');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const router = useRouter();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createGame({ date, opponent, homeAway });
      if (res?.error) {
        setError(res.error);
        return;
      }
      // Jump straight into the new game so the next thing is roster confirmation
      router.push(`/game/${res.id}`);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-quiet"
        style={{ marginTop: '1rem' }}
        onClick={() => setOpen(true)}
      >
        + Add a game
      </button>
    );
  }

  return (
    <section className="panel" style={{ marginTop: '1rem' }}>
      <h2 style={{ marginBottom: '0.75rem' }}>Add a game</h2>

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <label>
          <span className="eyebrow" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Date
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        <label>
          <span className="eyebrow" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Opponent
          </span>
          <input
            type="text"
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="Tigers"
          />
        </label>

        <div>
          <span className="eyebrow" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Home or away
          </span>
          <div className="steppers">
            {['Home', 'Away'].map((v) => (
              <button
                key={v}
                type="button"
                className="stepper"
                aria-pressed={homeAway === v}
                onClick={() => setHomeAway(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="notice" style={{ marginTop: '0.75rem' }}>{error}</div>
      )}

      <div className="action-row" style={{ marginTop: '1rem' }}>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={pending}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn"
          onClick={submit}
          disabled={pending}
        >
          {pending ? 'Adding' : 'Add game'}
        </button>
      </div>
    </section>
  );
}
