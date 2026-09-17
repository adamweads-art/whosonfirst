'use client';

import { useState, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { savePractice } from '../../../lib/actions';

const BLOCK_TYPES = ['Warmup', 'Whole Team', 'Stations', 'Transition', 'Scrimmage', 'Wrap-up'];

export default function PlanClient({ practice, roster, drills, initialBlocks, target }) {
  const [present, setPresent] = useState(new Set(practice.attendanceIds));
  const [blocks, setBlocks] = useState(initialBlocks);
  const [openPicker, setOpenPicker] = useState(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState(null);

  const drillById = useMemo(
    () => Object.fromEntries(drills.map((d) => [d.id, d])),
    [drills]
  );

  const planned = blocks.reduce((s, b) => s + (Number(b.duration) || 0), 0);
  const remaining = target - planned;

  function addBlock(type) {
    setBlocks((b) => [
      ...b,
      { key: crypto.randomUUID(), type, duration: type === 'Transition' ? 5 : 10, drillIds: [] },
    ]);
    setResult(null);
  }

  function update(key, patch) {
    setBlocks((b) => b.map((x) => (x.key === key ? { ...x, ...patch } : x)));
    setResult(null);
  }

  function remove(key) {
    setBlocks((b) => b.filter((x) => x.key !== key));
    setResult(null);
  }

  function move(index, delta) {
    const t = index + delta;
    if (t < 0 || t >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[t]] = [next[t], next[index]];
    setBlocks(next);
    setResult(null);
  }

  function toggleDrill(key, drillId) {
    setBlocks((b) =>
      b.map((x) => {
        if (x.key !== key) return x;
        const has = x.drillIds.includes(drillId);
        return {
          ...x,
          drillIds: has
            ? x.drillIds.filter((d) => d !== drillId)
            : [...x.drillIds, drillId],
        };
      })
    );
    setResult(null);
  }

  function save() {
    setResult(null);
    startTransition(async () => {
      setResult(
        await savePractice(practice.id, {
          attendanceIds: [...present],
          blocks: blocks.map((b) => ({
            type: b.type,
            duration: Number(b.duration) || 10,
            drillIds: b.drillIds,
            rotationMinutes: b.rotationMinutes,
            notes: b.notes,
          })),
        })
      );
    });
  }

  return (
    <div className="stack">
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2>Who's here</h2>
          <span className="eyebrow">{present.size} of {roster.length}</span>
        </div>
        <ul className="roster">
          {roster.map((p) => (
            <li key={p.id}>
              <label>
                <input
                  type="checkbox"
                  checked={present.has(p.id)}
                  onChange={() =>
                    setPresent((prev) => {
                      const next = new Set(prev);
                      next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                      return next;
                    })
                  }
                />
                <span className="jersey">{p.jersey != null ? `#${p.jersey}` : '--'}</span>
                <span className="who">{p.name}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="eyebrow" style={{ marginTop: '0.6rem' }}>
          Checked players get split into station groups
        </p>
      </section>

      <div className={`budget ${remaining < 0 ? 'over' : ''}`}>
        <span className="eyebrow">Planned</span>
        <strong>{planned} min</strong>
        <span className="eyebrow">
          {remaining === 0
            ? 'exactly on target'
            : remaining > 0
            ? `${remaining} left`
            : `${Math.abs(remaining)} over`}
        </span>
      </div>

      {blocks.map((b, i) => {
        const isStations = b.type === 'Stations';
        const chosen = b.drillIds.map((id) => drillById[id]).filter(Boolean);
        const usable = drills.filter((d) =>
          isStations ? d.format !== 'Whole Team' : true
        );

        return (
          <section className="panel block-card" key={b.key}>
            <div className="block-head">
              <select
                value={b.type}
                onChange={(e) => update(b.key, { type: e.target.value })}
                aria-label="Block type"
              >
                {BLOCK_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                max="60"
                value={b.duration}
                onChange={(e) => update(b.key, { duration: e.target.value })}
                aria-label="Minutes"
                style={{ width: '4.5rem' }}
              />
              <span className="eyebrow">min</span>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="Move down">↓</button>
              <button type="button" onClick={() => remove(b.key)} aria-label="Remove block" className="danger">×</button>
            </div>

            {chosen.length > 0 && (
              <ul className="chosen">
                {chosen.map((d) => (
                  <li key={d.id}>
                    <span>{d.name}</span>
                    <button type="button" onClick={() => toggleDrill(b.key, d.id)} aria-label={`Remove ${d.name}`}>×</button>
                  </li>
                ))}
              </ul>
            )}

            {isStations && chosen.length > 1 && (
              <p className="eyebrow" style={{ marginTop: '0.4rem' }}>
                {chosen.length} stations, {present.size} players, about{' '}
                {Math.ceil(present.size / chosen.length)} per group,{' '}
                {Math.max(1, Math.floor((Number(b.duration) || 10) / chosen.length))} min per rotation
              </p>
            )}

            <button
              type="button"
              className="btn btn-quiet"
              style={{ marginTop: '0.6rem', minHeight: 40, fontSize: '0.85rem' }}
              onClick={() => setOpenPicker(openPicker === b.key ? null : b.key)}
            >
              {openPicker === b.key ? 'Done picking' : 'Add drills'}
            </button>

            {openPicker === b.key && (
              <ul className="drill-picker">
                {usable.map((d) => (
                  <li key={d.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={b.drillIds.includes(d.id)}
                        onChange={() => toggleDrill(b.key, d.id)}
                      />
                      <span className="who">
                        {d.name}
                        <span className="tag">{d.duration}m</span>
                        {d.format === 'Whole Team' && <span className="tag">TEAM</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <div className="panel">
        <h3 style={{ marginBottom: '0.5rem' }}>Add a block</h3>
        <div className="block-adders">
          {BLOCK_TYPES.map((t) => (
            <button key={t} type="button" className="stepper" onClick={() => addBlock(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {result?.error && <div className="notice">{result.error}</div>}
      {result?.ok && (
        <div className="notice" style={{ borderLeftColor: 'var(--blue)' }}>
          Saved {result.blocks} blocks.{' '}
          <Link href={`/practice/${practice.id}/run`}>Run practice →</Link>
        </div>
      )}

      <button className="btn" onClick={save} disabled={pending || blocks.length === 0}>
        {pending ? 'Saving' : 'Save plan'}
      </button>

      {blocks.length > 0 && (
        <Link
          href={`/practice/${practice.id}/run`}
          className="btn btn-quiet"
          style={{ display: 'block', textAlign: 'center', textDecoration: 'none', lineHeight: '2.4' }}
        >
          Run practice
        </Link>
      )}
    </div>
  );
}
