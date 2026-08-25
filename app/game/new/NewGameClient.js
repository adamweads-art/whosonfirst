'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createGame } from '../../../lib/actions';

/** Today in the browser's own timezone, as YYYY-MM-DD. */
function todayLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function NewGameClient() {
  const [date, setDate] = useState(todayLocal());
  const [opponent, setOpponent] = useState('');
  const [homeAway, setHomeAway] = useState('Home');
  const [innings, setInnings] = useState(6);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save(thenBuild) {
    setError(null);
    startTransition(async () => {
      const res = await createGame({
        date,
        opponent,
        homeAway,
        inningsPlanned: innings,
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      // Straight into the lineup if they want it, otherwise back to the list.
      router.push(thenBuild ? `/game/${res.id}` : '/');
      router.refresh();
    });
  }

  return (
    <div className="stack">
      <section className="panel">
        <h2 style={{ marginBottom: '0.5rem' }}>When</h2>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </section>

      <section className="panel">
        <h2 style={{ marginBottom: '0.5rem' }}>Who</h2>
        <input
          type="text"
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
          placeholder="Tigers"
          autoComplete="off"
          enterKeyHint="done"
        />
        <div className="steppers" style={{ marginTop: '0.6rem' }}>
          {['Home', 'Away'].map((side) => (
            <button
              key={side}
              type="button"
              className="stepper"
              aria-pressed={homeAway === side}
              onClick={() => setHomeAway(side)}
            >
              {side}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 style={{ marginBottom: '0.5rem' }}>Innings</h2>
        <div className="steppers">
          {[3, 4, 5, 6].map((n) => (
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
          You can change this when you build the lineup
        </p>
      </section>

      {error && <div className="notice">{error}</div>}

      <button className="btn" onClick={() => save(true)} disabled={pending}>
        {pending ? 'Saving' : 'Add and build lineup'}
      </button>

      <button
        className="btn btn-quiet"
        onClick={() => save(false)}
        disabled={pending}
      >
        Add and come back later
      </button>
    </div>
  );
}
