import { useRef, useState } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import { useT } from '@/i18n';
import { SFX_DEFS, renderSfx, type SfxKind } from '@/audio/sfx';

/** Local synthesised SFX pack — preview and drop onto an audio track. */
export function SoundBank() {
  const t = useT();
  const importGeneratedAudio = useProjectStore((s) => s.importGeneratedAudio);
  const pushToast = useUIStore((s) => s.pushToast);
  const [busy, setBusy] = useState<SfxKind | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cache = useRef(new Map<SfxKind, string>());

  const preview = async (kind: SfxKind) => {
    try {
      let url = cache.current.get(kind);
      if (!url) {
        const blob = await renderSfx(kind);
        url = URL.createObjectURL(blob);
        cache.current.set(kind, url);
      }
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      void audioRef.current.play();
    } catch (e) {
      pushToast('error', String((e as Error).message ?? e));
    }
  };

  const add = async (kind: SfxKind) => {
    setBusy(kind);
    try {
      const blob = await renderSfx(kind);
      const def = SFX_DEFS.find((d) => d.kind === kind)!;
      await importGeneratedAudio(blob, `SFX · ${def.label}.wav`, true);
      pushToast('success', t('sfx.added', { name: def.label }));
    } catch (e) {
      pushToast('error', String((e as Error).message ?? e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="model-row" style={{ display: 'block', padding: 10, marginBottom: 12 }}>
      <strong style={{ fontSize: 12 }}>{t('sfx.title')}</strong>
      <div className="muted" style={{ fontSize: 11, margin: '4px 0 8px' }}>
        {t('sfx.note')}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: 6,
        }}
      >
        {SFX_DEFS.map((d) => (
          <div key={d.kind} className="row" style={{ gap: 4 }}>
            <button
              className="ghost icon-btn"
              title={t('sfx.preview')}
              aria-label={`${t('sfx.preview')} ${d.label}`}
              onClick={() => void preview(d.kind)}
            >
              ▶
            </button>
            <button
              style={{ flex: 1, justifyContent: 'flex-start', fontSize: 11 }}
              disabled={busy === d.kind}
              onClick={() => void add(d.kind)}
            >
              {busy === d.kind ? '…' : `＋ ${d.label}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
