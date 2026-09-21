'use client';

import { useState, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { savePractice, dismissObservation } from '../../../lib/actions';

const BLOCK_TYPES = ['Warmup', 'Whole Team', 'Stations', 'Transition', 'Scrimmage', 'Wrap-up'];

export default function PlanClient({ practice, roster, drills, initialBlocks, target, observations = [] }) {
  const [present, setPresent] = useState(new Set(practice.attendanceIds));
  const [blocks, setBlocks] = useState(initialBlocks);
  const [openPicker, setOpenPicker] = useState(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState(null);

  // Game observations. `linked` maps an observation to the drill added for it,
  // so it only counts as addressed if that drill is still in the plan at save
  // time. `manual` covers ones handled without a library drill.
  const [obsList, setObsList] = useState(observations);
  const [linked, setLinked] = useState({});
  const [manual, setManual] = useState(new Set());

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

  function planDrillIds(list = blocks) {
    return new Set(list.flatMap((b) => b.drillIds));
  }

  /**
   * Put a drill picked for an observation into the plan.
   *
   * Whole-team drills get their own block. Anything that works as a station
   * goes into the existing stations rotation if there is one, since backhand
   * reps belong in the rotation, not as a separate block for thirteen kids.
   */
  function addForObservation(obsId, drill) {
    setBlocks((prev) => {
      if (prev.some((b) => b.drillIds.includes(drill.id))) return prev;
      if (drill.format !== 'Whole Team') {
        const si = prev.findIndex((b) => b.type === 'Stations');
        if (si !== -1) {
          return prev.map((b, i) =>
            i === si ? { ...b, drillIds: [...b.drillIds, drill.id] } : b
          );
        }
      }
      return [
        ...prev,
        {
          key: crypto.randomUUID(),
          type: drill.format === 'Whole Team' ? 'Whole Team' : 'Stations',
          duration: drill.duration || 10,
          drillIds: [drill.id],
        },
      ];
    });
    setLinked((l) => ({ ...l, [obsId]: drill.id }));
    setResult(null);
  }

  function toggleManual(obsId) {
    setManual((prev) => {
      const next = new Set(prev);
      next.has(obsId) ? next.delete(obsId) : next.add(obsId);
      return next;
    });
    setResult(null);
  }

  async function dismiss(obsId) {
    const res = await dismissObservation(obsId);
    if (res?.ok) setObsList((l) => l.filter((o) => o.id !== obsId));
  }

  function addressedIds() {
    const inPlan = planDrillIds();
    const viaDrill = Object.entries(linked)
      .filter(([, drillId]) => inPlan.has(drillId))
      .map(([obsId]) => obsId);
    return [...new Set([...viaDrill, ...manual])];
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
          addressedIds: addressedIds(),
        })
      );
    });
  }

  const inPlan = planDrillIds();

  return (
    <div className="stack">
      {obsList.length > 0 && (
        <section className="panel from-games">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2>From recent games</h2>
            <span className="eyebrow">{obsList.length} open</span>
          </div>

          {obsList.map((o) => {
            const matches = drills
              .filter((d) => d.skillIds.some((id) => o.skillIds.includes(id)))
              .slice(0, 3);
            const covered =
              manual.has(o.id) || (linked[o.id] && inPlan.has(linked[o.id]));

            return (
              <div className={`obs ${covered ? 'covered' : ''}`} key={o.id}>
                <div className="obs-summary">
                  {covered && <span className="obs-check" aria-hidden="true">✓</span>}
                  {o.summary}
                </div>
                <div className="eyebrow">
                  {[o.game, o.players.join(', '), o.skills.join(', ')]
                    .filter(Boolean)
                    .join(' · ')}
                </div>

                <div className="obs-actions">
                  {matches.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className="chip"
                      disabled={inPlan.has(d.id)}
                      onClick={() => addForObservation(o.id, d)}
                    >
                      {inPlan.has(d.id) ? '✓ ' : '+ '}
                      {d.name}
                    </button>
                  ))}
                  <button type="button" className="chip quiet" onClick={() => toggleManual(o.id)}>
                    {manual.has(o.id) ? 'Undo covered' : 'Covering it'}
                  </button>
                  <button type="button" className="chip quiet" onClick={() => dismiss(o.id)}>
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}

          <p className="eyebrow" style={{ marginTop: '0.6rem' }}>
            Checked items get marked addressed when you save the plan
          </p>
        </section>
      )}

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
