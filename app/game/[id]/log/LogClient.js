'use client';

import { useState, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { logGame, readCardPhoto } from '../../../../lib/actions';

/**
 * Shrink a phone photo before upload. A raw phone photo is several megabytes;
 * 1600px on the long edge is plenty for reading handwriting and lands around
 * 300 KB, which keeps the upload fast on a field connection.
 */
async function shrink(file, maxEdge = 1600, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not open that photo.'));
      i.src = url;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function LogClient({ game, photoEnabled }) {
  const [innings, setInnings] = useState(game.inningsPlayed ?? null);
  const [notes, setNotes] = useState(game.rawNotes || '');
  const [source, setSource] = useState('Typed Note');
  const [preview, setPreview] = useState(null);
  const [reading, setReading] = useState(false);
  const [readMsg, setReadMsg] = useState(null);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef(null);
  const router = useRouter();

  const options = [1, 2, 3, 4, 5, 6];
  if (innings != null && innings > 6) options.push(innings);

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    setReadMsg(null);
    setReading(true);

    try {
      const dataUrl = await shrink(file);
      setPreview(dataUrl);
      const res = await readCardPhoto(dataUrl.split(',')[1], 'image/jpeg');

      if (res?.error) {
        setError(res.error);
        return;
      }

      const found = [];
      if (res.inningsPlayed != null) {
        setInnings(res.inningsPlayed);
        found.push(`${res.inningsPlayed} innings`);
      }
      if (res.notes) {
        setNotes((prev) => (prev.trim() ? `${prev.trim()}\n\n${res.notes}` : res.notes));
        found.push('your notes');
      }
      setSource('Card Photo');
      setReadMsg(`Read ${found.join(' and ')}. Check it against the photo, then save.`);
    } catch (err) {
      setError(err.message || 'Could not read that photo.');
    } finally {
      setReading(false);
    }
  }

  function save() {
    if (innings == null) {
      setError('Pick how many innings you played.');
      return;
    }
    setError(null);
    setWarning(null);
    startTransition(async () => {
      const res = await logGame(game.id, innings, notes, source);
      if (res?.error) setError(res.error);
      else if (res?.warning) setWarning(res.warning);
      else router.push(`/game/${game.id}`);
    });
  }

  return (
    <div className="stack">
      {photoEnabled && (
        <section className="panel">
          <h2 style={{ marginBottom: '0.5rem' }}>Photograph the card</h2>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPhoto}
            style={{ display: 'none' }}
          />
          <button
            className="btn"
            onClick={() => fileRef.current?.click()}
            disabled={reading || pending}
          >
            {reading ? 'Reading the card' : preview ? 'Retake photo' : 'Take photo'}
          </button>
          <p className="eyebrow" style={{ marginTop: '0.6rem' }}>
            Reads the innings box and your notes. The photo is not saved.
          </p>

          {preview && (
            <img
              src={preview}
              alt="The card you just photographed"
              className="card-preview"
            />
          )}

          {readMsg && (
            <div className="notice" style={{ borderLeftColor: 'var(--blue)', marginTop: '0.6rem' }}>
              {readMsg}
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <h2 style={{ marginBottom: '0.5rem' }}>How many innings?</h2>
        <div className="steppers">
          {options.map((n) => (
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
          Anything you planned past this stops counting toward playing time
        </p>
      </section>

      <section className="panel">
        <h2 style={{ marginBottom: '0.5rem' }}>What to work on</h2>
        <textarea
          rows={5}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Nobody covered first on bunts. Marcus struggled on backhands."
        />
        <p className="eyebrow" style={{ marginTop: '0.5rem' }}>
          Each thing you list shows up on your next practice plan
        </p>
      </section>

      {error && <div className="notice">{error}</div>}

      {warning && (
        <div className="notice">
          {warning} <Link href={`/game/${game.id}`}>Back to the game</Link>
        </div>
      )}

      <button className="btn" onClick={save} disabled={pending || reading}>
        {pending ? 'Saving' : 'Save'}
      </button>
    </div>
  );
}
