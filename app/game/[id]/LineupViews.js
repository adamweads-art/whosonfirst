'use client';

import { useState } from 'react';

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

function PositionMarker({ pos, player }) {
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

  return (
    <g>
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
              fontWeight: 500,
              fill: 'var(--ink)',
              fontFamily: 'var(--body)',
            }}
          >
            {player.name.split(' ')[0]}
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
    </g>
  );
}

function FieldView({ players, positions, inningCount }) {
  const [inning, setInning] = useState(0);

  const atPosition = (pos) =>
    players.find((p) => p.innings[inning] === pos) || null;
  const benched = players.filter((p) => p.innings[inning] === 'Bench');

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
        role="img"
        aria-label={`Field positions for inning ${inning + 1}`}
        style={{ display: 'block', marginTop: '0.75rem' }}
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

        {positions.map((pos) => (
          <PositionMarker key={pos} pos={pos} player={atPosition(pos)} />
        ))}
      </svg>

      {benched.length > 0 && (
        <div className="bench-strip">
          <span className="eyebrow">Bench</span>
          <span>
            {benched
              .map((p) =>
                p.jersey != null ? `${p.name.split(' ')[0]} (${p.jersey})` : p.name.split(' ')[0]
              )
              .join(', ')}
          </span>
        </div>
      )}
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
                return (
                  <td key={i}>
                    {who ? (
                      who.jersey != null ? (
                        <span className="num">{who.jersey}</span>
                      ) : (
                        who.name.split(' ')[0]
                      )
                    ) : (
                      '·'
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="bench-row">
            <th>BENCH</th>
            {Array.from({ length: inningCount }, (_, i) => {
              const sitting = players.filter((p) => p.innings[i] === 'Bench');
              return (
                <td key={i}>
                  {sitting.length
                    ? sitting
                        .map((p) => (p.jersey != null ? p.jersey : p.name.slice(0, 3)))
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

export default function LineupViews({ players, positions, inningCount }) {
  const [view, setView] = useState('grid');

  return (
    <>
      <div className="view-toggle">
        <button
          type="button"
          className="stepper"
          aria-pressed={view === 'grid'}
          onClick={() => setView('grid')}
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
            players={players}
            positions={positions}
            inningCount={inningCount}
          />
        ) : (
          <FieldView
            players={players}
            positions={positions}
            inningCount={inningCount}
          />
        )}
      </div>

      {view === 'grid' && (
        <p className="eyebrow" style={{ marginTop: '0.6rem' }}>
          Numbers are jerseys
        </p>
      )}
    </>
  );
}
