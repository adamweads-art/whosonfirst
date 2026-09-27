'use client';

import { useState, useTransition } from 'react';
import { swapPlayers, movePlayer } from '../../../lib/actions';

/**
 * Where each fielder stands, in the SVG's coordinate space.
 *
 * Laid out from real proportions: home at (190, 310), 90-unit basepaths, and
 * an outfield fence 200 units out. Everything sits inside the fence, which the
 * first version did not — center field was drawn past the arc.
 *
 * `label` picks which side the name block sits on so no two collide.
 */
const SPOTS = {
  P: { x: 190, y: 252, label: 'below' },
  C: { x: 190, y: 332, label: 'leader' },
  '1B': { x: 252, y: 234, label: 'below' },
  '2B': { x: 239, y: 177, label: 'below' },
  SS: { x: 141, y: 177, label: 'below' },
  '3B': { x: 128, y: 234, label: 'below' },
  LF: { x: 78, y: 158, label: 'below' },
  CF: { x: 190, y: 124, label: 'below' },
  RF: { x: 302, y: 158, label: 'below' },
};

const first = (name) => name.split(' ')[0];

function PositionMarker({ pos, player, selected, onTap }) {
  const spot = SPOTS[pos];
  if (!spot) return null;

  const { x, y, label } = spot;
  const empty = !player;

  // The catcher sits at the bottom of the frame with no room beneath, so the
  // name goes out to the right on a short leader line instead.
  const leader = label === 'leader';
  const nameX = leader ? x + 48 : x;
  const nameY = leader ? y - 2 : y + 22;
  const anchor = leader ? 'start' : 'middle';

  const aria = empty
    ? `${pos} is open`
    : `${player.name} at ${pos}${selected ? ', selected' : ''}`;

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={aria}
      aria-pressed={selected}
      onClick={onTap}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap();
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      {leader && !empty && (
        <line
          x1={x + 13}
          y1={y}
          x2={nameX - 6}
          y2={y}
          stroke="var(--rule)"
          strokeWidth="0.5"
          strokeDasharray="2 2"
        />
      )}

      {/* Selection ring. Drawn under the marker so it reads as a halo. */}
      {selected && (
        <circle
          cx={x}
          cy={y}
          r="14"
          fill="none"
          stroke="var(--red)"
          strokeWidth="3"
        />
      )}

      <circle
        cx={x}
        cy={y}
        r="8.5"
        fill={empty ? 'none' : 'var(--ink)'}
        stroke={empty ? 'var(--red)' : 'none'}
        strokeWidth="1.5"
        strokeDasharray={empty ? '3 2' : undefined}
      />

      {empty ? (
        <text
          x={nameX}
          y={nameY}
          textAnchor={anchor}
          style={{ fontSize: 11, fill: 'var(--red)', fontFamily: 'var(--mono)' }}
        >
          {pos} open
        </text>
      ) : (
        <>
          <text
            x={nameX}
            y={nameY}
            textAnchor={anchor}
            style={{
              fontSize: 12.5,
              fontWeight: selected ? 700 : 500,
              fill: 'var(--ink)',
              fontFamily: 'var(--body)',
            }}
          >
            {first(player.name)}
          </text>
          <text
            x={nameX}
            y={nameY + 13}
            textAnchor={anchor}
            style={{
              fontSize: 10.5,
              fill: 'var(--ink-soft)',
              fontFamily: 'var(--mono)',
            }}
          >
            {player.jersey != null ? `${player.jersey} · ${pos}` : pos}
          </text>
        </>
      )}

      {/* Touch target. A thumb at the field is nowhere near 8.5 units wide. */}
      <circle cx={x} cy={y} r="24" fill="transparent" />
    </g>
  );
}

function FieldView({
  players,
  positions,
  inningCount,
  inning,
  setInning,
  selectedId,
  onTapPlayer,
  onTapEmpty,
  busy,
}) {
  const atPosition = (pos) =>
    players.find((p) => p.innings[inning] === pos) || null;
  const benched = players.filter(
    (p) => (p.innings[inning] || 'Bench') === 'Bench'
  );

  return (
    <>
      <div className="inning-tabs">
        {Array.from({ length: inningCount }, (_, i) => (
          <button
            key={i}
            type="button"
            className="stepper"
            aria-pressed={inning === i}
            onClick={() => setInning(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <svg
        viewBox="0 0 380 356"
        width="100%"
        aria-label={`Field positions for inning ${inning + 1}`}
        style={{
          display: 'block',
          marginTop: '0.75rem',
          opacity: busy ? 0.55 : 1,
          pointerEvents: busy ? 'none' : 'auto',
          transition: 'opacity 120ms ease',
        }}
      >
        <path
          d="M 48 168 A 200 200 0 0 1 332 168 L 190 310 Z"
          fill="var(--outfield)"
          stroke="var(--rule)"
          strokeWidth="0.5"
        />
        <path
          d="M 190 310 L 254 246 L 190 183 L 126 246 Z"
          fill="var(--infield)"
          stroke="var(--rule)"
          strokeWidth="0.5"
        />
        <line x1="190" y1="310" x2="48" y2="168" stroke="var(--rule)" strokeWidth="0.5" />
        <line x1="190" y1="310" x2="332" y2="168" stroke="var(--rule)" strokeWidth="0.5" />

        <rect x="250" y="242" width="8" height="8" fill="var(--card)" stroke="var(--rule)" strokeWidth="0.5" transform="rotate(45 254 246)" />
        <rect x="186" y="179" width="8" height="8" fill="var(--card)" stroke="var(--rule)" strokeWidth="0.5" transform="rotate(45 190 183)" />
        <rect x="122" y="242" width="8" height="8" fill="var(--card)" stroke="var(--rule)" strokeWidth="0.5" transform="rotate(45 126 246)" />
        <path d="M 185 305 L 195 305 L 195 311 L 190 316 L 185 311 Z" fill="var(--card)" stroke="var(--rule)" strokeWidth="0.5" />
        <circle cx="190" cy="252" r="11" fill="var(--infield)" stroke="var(--rule)" strokeWidth="0.5" />

        {positions.map((pos) => {
          const player = atPosition(pos);
          return (
            <PositionMarker
              key={pos}
              pos={pos}
              player={player}
              selected={Boolean(player) && player.id === selectedId}
              onTap={() =>
                player ? onTapPlayer(player.id) : onTapEmpty(pos)
              }
            />
          );
        })}
      </svg>

      <div className="bench-strip">
        <span className="eyebrow">Bench</span>
        <div className="bench-chips">
          {benched.length === 0 && <span className="eyebrow">Nobody sitting</span>}
          {benched.map((p) => (
            <button
              key={p.id}
              type="button"
              className="chip"
              aria-pressed={p.id === selectedId}
              disabled={busy}
              onClick={() => onTapPlayer(p.id)}
            >
              {first(p.name)}
              {p.jersey != null && <span className="chip-num">{p.jersey}</span>}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function GridView({ players, positions, inningCount }) {
  return (
    <div className="grid-scroll">
      <table className="grid">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>POS</th>
            {Array.from({ length: inningCount }, (_, i) => (
              <th key={i}>{i + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => (
            <tr key={pos}>
              <th>{pos}</th>
              {Array.from({ length: inningCount }, (_, i) => {
                const who = players.find((p) => p.innings[i] === pos);
                return <td key={i}>{who ? first(who.name) : '·'}</td>;
              })}
            </tr>
          ))}
          <tr className="bench-row">
            <th>BENCH</th>
            {Array.from({ length: inningCount }, (_, i) => {
              const sitting = players.filter(
                (p) => (p.innings[i] || 'Bench') === 'Bench'
              );
              return (
                <td key={i}>
                  {sitting.length
                    ? sitting
                        .map((p) =>
                          // Numbers here on purpose: three or four names in one
                          // cell get truncated into uselessness.
                          p.jersey != null ? p.jersey : first(p.name)
                        )
                        .join(' ')
                    : '—'}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function LineupViews({ players, positions, inningCount, gameId }) {
  const [view, setView] = useState('grid');
  const [inning, setInning] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [note, setNote] = useState(null);
  const [busy, startTransition] = useTransition();

  // The board the user is touching. Swaps land here first so the field
  // redraws on the tap, not a second later when Airtable answers. A fresh
  // payload from the server replaces it wholesale, which is also how a
  // failed write gets undone.
  const [serverCopy, setServerCopy] = useState(players);
  const [board, setBoard] = useState(players);
  if (serverCopy !== players) {
    setServerCopy(players);
    setBoard(players);
  }

  const byId = Object.fromEntries(board.map((p) => [p.id, p]));
  const selected = selectedId ? byId[selectedId] : null;
  const spotOf = (id) => byId[id]?.innings[inning] || 'Bench';

  function run(optimistic, call) {
    const before = board;
    setNote(null);
    setBoard(optimistic);
    setSelectedId(null);

    startTransition(async () => {
      const res = await call();
      if (res?.error) {
        setBoard(before);
        setNote({ bad: true, text: res.error });
      } else if (res?.warnings?.length) {
        setNote({ bad: false, text: res.warnings.join(' ') });
      }
    });
  }

  function place(list, id, pos) {
    return list.map((p) =>
      p.id === id
        ? { ...p, innings: p.innings.map((v, i) => (i === inning ? pos : v)) }
        : p
    );
  }

  function tapPlayer(id) {
    if (busy) return;

    if (!selectedId) {
      setSelectedId(id);
      setNote(null);
      return;
    }
    if (selectedId === id) {
      setSelectedId(null);
      return;
    }

    const aPos = spotOf(selectedId);
    const bPos = spotOf(id);
    if (aPos === bPos) {
      // Two bench players. Trading them changes nothing.
      setSelectedId(id);
      return;
    }

    const a = selectedId;
    run(place(place(board, a, bPos), id, aPos), () =>
      swapPlayers(gameId, inning, a, id)
    );
  }

  function tapEmpty(pos) {
    if (busy || !selectedId) return;
    const id = selectedId;
    run(place(board, id, pos), () => movePlayer(gameId, inning, id, pos));
  }

  return (
    <>
      <div className="view-toggle">
        <button
          type="button"
          className="stepper"
          aria-pressed={view === 'grid'}
          onClick={() => {
            setView('grid');
            setSelectedId(null);
          }}
        >
          Grid
        </button>
        <button
          type="button"
          className="stepper"
          aria-pressed={view === 'field'}
          onClick={() => setView('field')}
        >
          Field
        </button>
      </div>

      <div style={{ marginTop: '0.75rem' }}>
        {view === 'grid' ? (
          <GridView
            players={board}
            positions={positions}
            inningCount={inningCount}
          />
        ) : (
          <FieldView
            players={board}
            positions={positions}
            inningCount={inningCount}
            inning={inning}
            setInning={(i) => {
              setInning(i);
              setSelectedId(null);
              setNote(null);
            }}
            selectedId={selectedId}
            onTapPlayer={tapPlayer}
            onTapEmpty={tapEmpty}
            busy={busy}
          />
        )}
      </div>

      {view === 'field' && (
        <div className="swap-bar" aria-live="polite">
          {busy && <span className="eyebrow">Saving…</span>}
          {!busy && selected && (
            <>
              <span>
                <strong>{first(selected.name)}</strong> at {spotOf(selectedId)}.
                Tap where to put them.
              </span>
              <button
                type="button"
                className="chip chip-quiet"
                onClick={() => setSelectedId(null)}
              >
                Cancel
              </button>
            </>
          )}
          {!busy && !selected && (
            <span className="eyebrow">
              Tap a player, then tap the spot to trade them into
            </span>
          )}
        </div>
      )}

      {note && (
        <div
          className="notice"
          style={{ marginTop: '0.6rem' }}
          role={note.bad ? 'alert' : 'status'}
        >
          {note.bad ? note.text : `Saved. ${note.text}`}
        </div>
      )}

      {view === 'grid' && (
        <p className="eyebrow" style={{ marginTop: '0.6rem' }}>
          Bench shows jersey numbers to fit. Switch to Field to make changes.
        </p>
      )}
    </>
  );
}
