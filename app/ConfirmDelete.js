'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Two-step delete.
 *
 * First tap arms it, second confirms. The confirm button is deliberately not
 * where the first button was, so a double tap cannot delete anything by
 * accident, and it disarms itself after a few seconds of no answer.
 */
export default function ConfirmDelete({ label, warning, onDelete, redirectTo }) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef(null);
  const router = useRouter();

  useEffect(() => {
    if (!armed) return;
    timer.current = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(timer.current);
  }, [armed]);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await onDelete();
      if (res?.error) {
        setError(res.error);
        setArmed(false);
        return;
      }
      router.push(redirectTo);
      router.refresh();
    });
  }

  if (!armed) {
    return (
      <div style={{ marginTop: '1.5rem' }}>
        {error && <div className="notice" style={{ marginBottom: '0.6rem' }}>{error}</div>}
        <button className="btn btn-danger" onClick={() => setArmed(true)}>
          {label}
        </button>
      </div>
    );
  }

  return (
    <div className="panel confirm-box" style={{ marginTop: '1.5rem' }}>
      <h3 style={{ marginBottom: '0.3rem' }}>Are you sure?</h3>
      <p className="eyebrow" style={{ marginBottom: '0.8rem' }}>{warning}</p>
      <div className="run-controls" style={{ marginTop: 0 }}>
        <button className="btn btn-quiet" onClick={() => setArmed(false)} disabled={pending}>
          Cancel
        </button>
        <button className="btn btn-danger" onClick={confirm} disabled={pending}>
          {pending ? 'Deleting' : 'Yes, delete'}
        </button>
      </div>
    </div>
  );
}
