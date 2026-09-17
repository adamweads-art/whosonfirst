'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';

function mmss(seconds) {
  const n = Math.abs(Math.round(seconds));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

/** "5:30 PM" or "17:30" to minutes past midnight. null if unparseable. */
function parseStart(text) {
  if (!text) return null;
  const m = String(text).trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return null;
  let hours = Number(m[1]);
  const mins = Number(m[2]);
  const suffix = m[3]?.toLowerCase();
  if (suffix === 'pm' && hours !== 12) hours += 12;
  if (suffix === 'am' && hours === 12) hours = 0;
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

function clockLabel(minutesPastMidnight) {
  const total = Math.round(minutesPastMidnight) % (24 * 60);
  const h24 = Math.floor(total / 60);
  const h = h24 % 12 || 12;
  return `${h}:${String(total % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

function beep(times = 1) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      const start = ctx.currentTime + i * 0.32;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      osc.start(start);
      osc.stop(start + 0.3);
    }
  } catch {
    // Audio is a nicety. Never let it break the timer.
  }
}

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * The plan is a budget, not a schedule.
 *
 * Blocks run long, drills get cut, kids turn up late. So the clock counts past
 * zero into overtime rather than stopping, durations stretch on the fly, and a
 * projected finish time updates live. None of it writes back to Airtable: the
 * saved plan stays as it was built, the same plan-versus-actual split the game
 * side uses.
 */
export default function RunClient({ practice, blocks, drillById, playerById }) {
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [budgets, setBudgets] = useState(() => blocks.map((b) => b.duration || 10));
  const [spent, setSpent] = useState(0);

  const startedAt = useRef(null);
  const lastRotation = useRef(-1);
  const alerted = useRef(false);

  const block = blocks[index];
  const budget = budgets[index] ?? 10;
  const left = budget * 60 - elapsed;
  const over = left < 0;

  const groups = block?.stationGroups ? safeParse(block.stationGroups) : null;
  const isStations = block?.type === 'Stations' && groups?.groups?.length > 1;

  // Rotation length derives from the live budget, so stretching a stations
  // block stretches every rotation instead of leaving a stub at the end.
  const stationCount = groups?.rotation?.length || 0;
  const rotationMinutes =
    stationCount > 0 ? Math.max(1, Math.floor(budget / stationCount)) : 0;
  const rotationSeconds = rotationMinutes * 60;
  const rotationIndex =
    rotationSeconds > 0 ? Math.floor(elapsed / rotationSeconds) : -1;
  const rotationLeft =
    rotationSeconds > 0 ? rotationSeconds - (elapsed % rotationSeconds) : 0;

  const startMinutes = useMemo(
    () => parseStart(practice.startTime),
    [practice.startTime]
  );

  const plannedTotal = blocks.reduce((s, b) => s + (b.duration || 0), 0);
  const futureMinutes = budgets.slice(index + 1).reduce((s, m) => s + m, 0);
  const projectedTotal = spent + Math.max(budget, elapsed / 60) + futureMinutes;
  const overrun = projectedTotal - plannedTotal;

  // Which blocks to drop, working backward, to get back on time.
  const trimSuggestion = useMemo(() => {
    if (overrun <= 0.5) return null;
    const names = [];
    let need = overrun;
    for (let i = blocks.length - 1; i > index && need > 0; i--) {
      names.push(blocks[i].type);
      need -= budgets[i];
    }
    return names.length ? names.join(' or ') : null;
  }, [overrun, blocks, budgets, index]);

  useEffect(() => {
    if (!running) return;
    startedAt.current = Date.now() - elapsed * 1000;
    const id = setInterval(() => {
      setElapsed((Date.now() - startedAt.current) / 1000);
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running || rotationSeconds <= 0) return;
    if (rotationIndex > lastRotation.current && rotationIndex > 0) {
      lastRotation.current = rotationIndex;
      beep(2);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
  }, [rotationIndex, running, rotationSeconds]);

  // Signal the end of the block, then keep counting. Overtime is a normal
  // state, not an error, so the timer never stops itself.
  useEffect(() => {
    if (running && left <= 0 && !alerted.current) {
      alerted.current = true;
      beep(3);
      if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
    }
  }, [left, running]);

  function goTo(i) {
    if (i < 0 || i >= blocks.length) return;
    if (i > index) setSpent((s) => s + Math.max(budgets[index], elapsed / 60));
    setIndex(i);
    setElapsed(0);
    setRunning(false);
    lastRotation.current = -1;
    alerted.current = false;
  }

  function adjust(delta) {
    setBudgets((b) => {
      const next = [...b];
      next[index] = Math.max(1, next[index] + delta);
      return next;
    });
    lastRotation.current = -1;
    alerted.current = false;
  }

  if (!block) {
    return (
      <div className="notice">
        This practice has no blocks yet.{' '}
        <Link href={`/practice/${practice.id}`}>Build the plan</Link>
      </div>
    );
  }

  const drills = (block.drillIds || []).map((id) => drillById[id]).filter(Boolean);

  return (
    <div className="stack">
      <div className="run-progress">
        {blocks.map((b, i) => (
          <button
            key={b.id}
            type="button"
            className={`pip ${i === index ? 'now' : ''} ${i < index ? 'done' : ''}`}
            style={{ flex: budgets[i] || 1 }}
            onClick={() => goTo(i)}
            aria-label={`Go to block ${i + 1}, ${b.type}`}
          />
        ))}
      </div>

      <div className={`finish ${overrun > 0.5 ? 'late' : ''}`}>
        <span className="eyebrow">Finishing</span>
        <strong>
          {startMinutes != null
            ? clockLabel(startMinutes + projectedTotal)
            : `${Math.round(projectedTotal)} min`}
        </strong>
        <span className="eyebrow">
          {overrun > 0.5
            ? `${Math.round(overrun)} over`
            : overrun < -0.5
            ? `${Math.abs(Math.round(overrun))} early`
            : 'on time'}
        </span>
      </div>

      <section className="panel run-now">
        <span className="eyebrow">
          Block {index + 1} of {blocks.length} · {block.type}
        </span>

        <div className={`clock ${over ? 'over' : left <= 60 ? 'urgent' : ''}`}>
          {over ? '+' : ''}
          {mmss(left)}
        </div>

        {isStations && (
          <div className="rotation-line">
            <span className="eyebrow">Rotate in</span>
            <strong>{mmss(Math.max(0, rotationLeft))}</strong>
          </div>
        )}

        <div className="run-adjust">
          <button className="btn btn-quiet" onClick={() => adjust(-2)}>
            −2 min
          </button>
          <button className="btn btn-quiet" onClick={() => adjust(2)}>
            +2 min
          </button>
        </div>

        <div className="run-controls">
          <button className="btn" onClick={() => setRunning((r) => !r)}>
            {running ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start'}
          </button>
          <button
            className="btn btn-quiet"
            onClick={() => goTo(index + 1)}
            disabled={index >= blocks.length - 1}
          >
            Next block
          </button>
        </div>
      </section>

      {trimSuggestion && (
        <div className="squeeze">
          Running {Math.round(overrun)} min long. Cutting {trimSuggestion} gets
          you back.
        </div>
      )}

      {isStations ? (
        <section className="panel">
          <h2 style={{ marginBottom: '0.6rem' }}>Stations</h2>
          {groups.groups.map((g, gi) => {
            const stationIdx =
              (gi + Math.max(0, rotationIndex)) % groups.rotation.length;
            const drill = drillById[groups.rotation[stationIdx]];
            return (
              <div className="station-row" key={g.name}>
                <span className="group-badge">{g.name}</span>
                <div>
                  <strong>{drill ? drill.name : 'Station'}</strong>
                  <div className="eyebrow">
                    {g.players
                      .map((id) => playerById[id]?.name.split(' ')[0])
                      .filter(Boolean)
                      .join(', ')}
                  </div>
                </div>
              </div>
            );
          })}
          <p className="eyebrow" style={{ marginTop: '0.6rem' }}>
            {rotationMinutes} min per rotation
          </p>
        </section>
      ) : (
        drills.map((d) => (
          <section className="panel" key={d.id}>
            <h2>{d.name}</h2>
            {d.setup && (
              <p className="eyebrow" style={{ marginTop: '0.4rem' }}>
                {d.setup}
              </p>
            )}
            {d.description && <p style={{ marginTop: '0.5rem' }}>{d.description}</p>}
            {d.coaching && (
              <div className="coaching">
                <span className="eyebrow">Say this</span>
                <p style={{ margin: '0.2rem 0 0' }}>{d.coaching}</p>
              </div>
            )}
            {d.equipment?.length > 0 && (
              <p className="eyebrow" style={{ marginTop: '0.6rem' }}>
                {d.equipment.join(', ')}
              </p>
            )}
          </section>
        ))
      )}

      {isStations &&
        groups.rotation
          .map((id) => drillById[id])
          .filter(Boolean)
          .map((d) => (
            <section className="panel" key={d.id}>
              <h3>{d.name}</h3>
              {d.coaching && (
                <p className="eyebrow" style={{ marginTop: '0.3rem' }}>
                  {d.coaching}
                </p>
              )}
            </section>
          ))}
    </div>
  );
}
