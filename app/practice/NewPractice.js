'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPracticeAction } from '../../lib/actions';

function todayLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function NewPractice() {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayLocal());
  const [startTime, setStartTime] = useState('');
  const [location, setLocation] = useState('');
  const [phase, setPhase] = useState('Early');
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await createPracticeAction({ date, startTime, location, phase });
      if (res?.error) setError(res.error);
      else router.push(`/practice/${res.id}`);
    });
  }

  if (!open) {
    return (
      <button
        className="btn"
        onClick={() => setOpen(true)}
        style={{ marginTop: '1rem' }}
      >
        Add a practice
      </button>
    );
  }

  return (
    <div className="stack" style={{ marginTop: '1rem' }}>
      <section className="panel">
        <h2 style={{ marginBottom: '0.5rem' }}>When</h2>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input
          type="text"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          placeholder="5:30 PM"
          style={{ marginTop: '0.5rem' }}
        />
      </section>

      <section className="panel">
        <h2 style={{ marginBottom: '0.5rem' }}>Where</h2>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Field 2"
        />
      </section>

      <section className="panel">
        <h2 style={{ marginBottom: '0.5rem' }}>Season phase</h2>
        <div className="steppers">
          {['Early', 'Mid', 'Late'].map((ph) => (
            <button
              key={ph}
              type="button"
              className="stepper"
              aria-pressed={phase === ph}
              onClick={() => setPhase(ph)}
            >
              {ph}
            </button>
          ))}
        </div>
        <p className="eyebrow" style={{ marginTop: '0.6rem' }}>
          Keeps late-season drills like stealing out of week one
        </p>
      </section>

      {error && <div className="notice">{error}</div>}

      <button className="btn" onClick={save} disabled={pending}>
        {pending ? 'Creating' : 'Create and build plan'}
      </button>
      <button className="btn btn-quiet" onClick={() => setOpen(false)} disabled={pending}>
        Cancel
      </button>
    </div>
  );
}
