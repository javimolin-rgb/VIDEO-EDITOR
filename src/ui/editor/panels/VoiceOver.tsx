import { useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import { useT } from '@/i18n';
import { useSettingsStore } from '@/state/settingsStore';
import { localRuntime } from '@/ai/local/runtime';
import { encodeWav } from '@/audio/wav';

const MODEL_BY_LANG: Record<string, string> = { es: 'tts-es', en: 'tts-en' };

/** Generate a voice-over from a script — live read (Web Speech) or a rendered
 *  clip (on-device MMS-TTS). */
export function VoiceOver() {
  const t = useT();
  const project = useProjectStore((s) => s.project);
  const importGeneratedAudio = useProjectStore((s) => s.importGeneratedAudio);
  const pushToast = useUIStore((s) => s.pushToast);
  const lang = useSettingsStore((s) => s.language);

  const defaultText = useMemo(() => {
    const cues = project?.timeline.captionLayer.cues ?? [];
    return cues.map((c) => c.text).join(' ').trim();
  }, [project?.timeline.captionLayer.cues]);

  const [text, setText] = useState(defaultText);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceUri, setVoiceUri] = useState('');
  const [rate, setRate] = useState(1);
  const [modelLang, setModelLang] = useState<'es' | 'en'>(lang === 'es' ? 'es' : 'en');
  const [progress, setProgress] = useState<string | null>(null);
  const speaking = useRef(false);

  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const load = () => {
      const list = speechSynthesis.getVoices();
      setVoices(list);
      if (!voiceUri && list.length) {
        const pref =
          list.find((v) => v.lang.toLowerCase().startsWith(lang)) ??
          list.find((v) => v.default) ??
          list[0];
        if (pref) setVoiceUri(pref.voiceURI);
      }
    };
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, [lang, voiceUri]);

  const readAloud = () => {
    if (typeof speechSynthesis === 'undefined') {
      pushToast('error', t('voice.noWebSpeech'));
      return;
    }
    if (speaking.current) {
      speechSynthesis.cancel();
      speaking.current = false;
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    const v = voices.find((x) => x.voiceURI === voiceUri);
    if (v) u.voice = v;
    u.rate = rate;
    u.onend = () => (speaking.current = false);
    speaking.current = true;
    speechSynthesis.speak(u);
  };

  const renderClip = async () => {
    const clean = text.trim();
    if (!clean) return;
    const modelId = MODEL_BY_LANG[modelLang]!;
    try {
      if (!localRuntime.isInstalled(modelId)) {
        setProgress(t('voice.downloading'));
        await localRuntime.install(modelId, (_f, note) => setProgress(note));
      }
      setProgress(t('voice.rendering'));
      const { audio, sampleRate } = await localRuntime.synthesize(clean, {
        modelId,
        onProgress: (_f, note) => setProgress(note),
      });
      const blob = encodeWav([audio], sampleRate);
      await importGeneratedAudio(blob, 'Voice-over.wav', true);
      pushToast('success', t('voice.added'));
    } catch (e) {
      pushToast('error', String((e as Error).message ?? e));
    } finally {
      setProgress(null);
    }
  };

  if (!project) return null;

  return (
    <div className="model-row" style={{ display: 'block', padding: 10, marginTop: 12 }}>
      <strong style={{ fontSize: 12 }}>{t('voice.title')}</strong>
      <div className="muted" style={{ fontSize: 11, margin: '4px 0 8px' }}>
        {t('voice.note')}
      </div>

      <textarea
        rows={4}
        value={text}
        placeholder={t('voice.placeholder')}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="rowfields" style={{ marginTop: 8 }}>
        <div className="field">
          <label>{t('voice.voice')}</label>
          <select value={voiceUri} onChange={(e) => setVoiceUri(e.target.value)}>
            {voices.length === 0 && <option value="">—</option>}
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t('voice.speed')} — {rate.toFixed(2)}×</label>
          <input
            type="range"
            min={0.6}
            max={1.6}
            step={0.05}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="row" style={{ gap: 6, marginTop: 6 }}>
        <button onClick={readAloud} disabled={!text.trim()}>
          🔊 {t('voice.read')}
        </button>
        <div className="field" style={{ flex: 1, margin: 0 }}>
          <select value={modelLang} onChange={(e) => setModelLang(e.target.value as 'es' | 'en')}>
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </div>
        <button className="primary" disabled={!text.trim() || !!progress} onClick={() => void renderClip()}>
          {progress ?? t('voice.render')}
        </button>
      </div>
      <div className="muted" style={{ fontSize: 10, marginTop: 6 }}>
        {t('voice.modelNote')}
      </div>
    </div>
  );
}
