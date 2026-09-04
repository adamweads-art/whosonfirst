'use client';

import { useState, useTransition } from 'react';
import { refreshTallies } from '../lib/actions';

/**
 * Season tallies are a cache the app writes. Editing Airtable by hand does not
 * trigger a rebuild, so this is the manual one. Deliberately understated: it is
 * a maintenance tool, not something you need before a game.
 */
export default function RefreshTallies() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState(null);

  function run() {
    setResult(null);
    startTransition(async () => {
      setResult(await refreshTallies());
    });
  }

  return (
    <div style={{ marginTop: '1.25rem' }}>
      <button
        className="btn btn-quiet"
        onClick={run}
        disabled={pending}
        style={{ fontSize: '0.85rem', minHeight: 40 }}
      >
        {pending ? 'Recalculating' : 'Recalculate playing time'}
      </button>

      {result?.error && (
        <div className="notice" style={{ marginTop: '0.6rem' }}>
          {result.error}
        </div>
      )}

      {result?.ok && (
        <p className="eyebrow" style={{ marginTop: '0.6rem' }}>
          Rebuilt from {result.assignments} assignments
          {result.orphans > 0 && `, ignored ${result.orphans} from deleted games`}
        </p>
      )}

      {!result && !pending && (
        <p className="eyebrow" style={{ marginTop: '0.6rem' }}>
          Only needed if you edited the base directly
        </p>
      )}
    </div>
  );
}
