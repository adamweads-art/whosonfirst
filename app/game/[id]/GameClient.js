'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { generate } from '../../../lib/actions';

const MIN_PLAYERS = 7;

export default function GameClient({ game, roster, initialAbsent, gridInnings }) {
  const [absent, setAbsent] = useState(new Set(initialAbsent));
  const [innings, setInnings] = useState(game.inningsPlanned || 6);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState(null);

  const active = roster.filter((p) => p.active);
  const present = active.length - absent.size;
  const tooFew = present < MIN_PLAYERS;

  function toggle(id) {
    setAbsent((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setResult(null);
  }

  function run() {
    setResult(null);
    startTransition(async () => {
      const res = await generate(game.id, [...absent], innings);
      setResult(res);
    });
  }

  return (
    <>
      <section className="panel">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '0.5rem',
          }}
        >
          <h2>Who's here</h2>
          <span className="eyebrow">
            {present} of {active.length}
          </span>
        </div>

        <ul className="roster">
          {active.map((p) => (
            <li key={p.id}>
              <label>
                <input
                  type="checkbox"
                  checked={absent.has(p.id)}
                  onChange={() => toggle(p.id)}
                />
                <span className="jersey">
                  {p.jersey != null ? `#${p.jersey}` : '--'}
                </span>
                <span className="who">
                  {p.name}
                  {p.pitcherPool && <span className="tag">P</span>}
                  {p.catcherPool && <span className="tag">C</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>

        <p className="eyebrow" style={{ marginTop: '0.75rem' }}>
          Check anyone who will not be at this game
        </p>
      </section>

      <section className="panel">
        <h2 style={{ marginBottom: '0.5rem' }}>Innings to plan</h2>
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
          Plan for six. You record what actually happened after the game.
        </p>
      </section>

      {tooFew && (
        <div className="notice">
          {present} players is not enough to field a team. You need at least{' '}
          {MIN_PLAYERS}.
        </div>
      )}

      <button className="btn" onClick={run} disabled={pending || tooFew}>
        {pending
          ? 'Working'
          : gridInnings > 0
          ? 'Build lineup again'
          : 'Build lineup'}
      </button>

      {result?.error && <div className="notice">{result.error}</div>}

      {result?.ok && (
        <>
          {result.warnings?.length > 0 ? (
            <div className="notice">
              <strong>Some spots could not be filled.</strong>
              <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="notice" style={{ borderLeftColor: 'var(--blue)' }}>
              Lineup built. Reload to see the grid, or open the card to print.
            </div>
          )}
          <Link href={`/game/${game.id}/card`} className="btn btn-quiet"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none', lineHeight: '2.1' }}>
            Open the card
          </Link>
        </>
      )}
    </>
  );
}
