'use client';

import { useState, useTransition } from 'react';
import { saveBattingOrder } from '../../lib/actions';

/**
 * Reorder by arrows rather than drag-and-drop.
 *
 * Dragging a thirteen-row list on a phone is fiddly and easy to get wrong,
 * and this is a task you do sitting down at the start of a season, not one
 * you do quickly at the field. Arrows are also reachable by keyboard and by
 * screen reader, which dragging is not without a lot of extra work.
 */
export default function RosterClient({ initial }) {
  const [order, setOrder] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState(null);
  const [pending, startTransition] = useTransition();

  function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    setDirty(true);
    setResult(null);
  }

  function save() {
    setResult(null);
    startTransition(async () => {
      const res = await saveBattingOrder(order.map((p) => p.id));
      setResult(res);
      if (res?.ok) setDirty(false);
    });
  }

  function reset() {
    setOrder(initial);
    setDirty(false);
    setResult(null);
  }

  return (
    <div className="stack">
      <section className="panel">
        <ol className="order-list">
          {order.map((p, i) => (
            <li key={p.id}>
              <span className="slot">{i + 1}</span>
              <span className="who">
                {p.name}
                {p.jersey != null && <span className="tag">{p.jersey}</span>}
                {p.pitcherPool && <span className="tag">P</span>}
                {p.catcherPool && <span className="tag">C</span>}
              </span>
              <span className="arrows">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${p.name} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === order.length - 1}
                  aria-label={`Move ${p.name} down`}
                >
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <p className="eyebrow">
        Leadoff still advances one slot each game. This sets the order it
        advances through.
      </p>

      {result?.error && <div className="notice">{result.error}</div>}

      {result?.ok && (
        <div className="notice" style={{ borderLeftColor: 'var(--blue)' }}>
          Saved. Lineups already built keep the order they were built with.
        </div>
      )}

      <button className="btn" onClick={save} disabled={pending || !dirty}>
        {pending ? 'Saving' : dirty ? 'Save order' : 'No changes'}
      </button>

      {dirty && (
        <button className="btn btn-quiet" onClick={reset} disabled={pending}>
          Undo changes
        </button>
      )}
    </div>
  );
}
