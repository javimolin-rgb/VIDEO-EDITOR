import { useEffect, useState } from 'react';
import { localRuntime } from '@/ai/local/runtime';
import { LOCAL_MODELS, type LocalModelState } from '@/ai/local/types';
import { useUIStore } from '@/state/uiStore';

interface Row {
  state: LocalModelState;
  progress: number;
  message: string;
}

function mib(bytes: number): string {
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${Math.round(bytes / 1024 / 1024)} MB`;
}

/**
 * On-device AI models (spec §7, §57, §97, §158). These run in the browser via
 * WebAssembly/WebGPU. Weights download from the Hugging Face hub **only when
 * you click Download** and are cached locally afterwards — fully offline once
 * installed. No server, no API key.
 */
export function OnDeviceModels() {
  const pushToast = useUIStore((s) => s.pushToast);
  const [rows, setRows] = useState<Record<string, Row>>({});

  useEffect(() => {
    const installed = new Set(localRuntime.installedIds());
    setRows(
      Object.fromEntries(
        LOCAL_MODELS.map((m) => [
          m.id,
          {
            state: installed.has(m.id) ? 'installed' : 'not-installed',
            progress: 0,
            message: '',
          } as Row,
        ]),
      ),
    );
  }, []);

  const setRow = (id: string, patch: Partial<Row>) =>
    setRows((r) => ({ ...r, [id]: { ...r[id]!, ...patch } }));

  const download = async (id: string) => {
    setRow(id, { state: 'downloading', progress: 0, message: 'Starting…' });
    try {
      await localRuntime.install(id, (p, message) => setRow(id, { progress: p, message }));
      setRow(id, { state: 'installed', progress: 1, message: '' });
      pushToast('success', 'Model installed — it now works offline.');
    } catch (e) {
      setRow(id, { state: 'error', message: String(e) });
      pushToast('error', `Download failed: ${String(e)}`);
    }
  };

  const remove = async (id: string) => {
    await localRuntime.remove(id);
    setRow(id, { state: 'not-installed', progress: 0, message: '' });
    pushToast('info', 'Model removed.');
  };

  return (
    <div>
      <h4 style={{ margin: '16px 0 8px' }}>On-device speech models (in-browser)</h4>
      <p className="muted" style={{ fontSize: 12 }}>
        Powered by WebAssembly / WebGPU. Downloads come from the Hugging Face hub on first use and
        are cached locally; afterwards they run with no network.
      </p>

      {LOCAL_MODELS.map((m) => {
        const row = rows[m.id] ?? { state: 'not-installed', progress: 0, message: '' };
        return (
          <div key={m.id} className="model-row">
            <div>
              <div className="name">
                {m.label}{' '}
                <span className="pill" style={{ marginLeft: 6 }}>
                  {row.state === 'installed'
                    ? 'installed'
                    : row.state === 'downloading'
                      ? 'downloading…'
                      : row.state === 'error'
                        ? 'error'
                        : 'not installed'}
                </span>
              </div>
              <div className="spec">
                {m.license} · ~{mib(m.approxBytes)} · {m.note}
              </div>
              {row.state === 'downloading' && (
                <div style={{ marginTop: 6 }}>
                  <div
                    style={{
                      height: 5,
                      background: 'var(--bg-0)',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.round(row.progress * 100)}%`,
                        height: '100%',
                        background: 'var(--accent)',
                      }}
                    />
                  </div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                    {row.message}
                  </div>
                </div>
              )}
              {row.state === 'error' && (
                <div className="muted" style={{ fontSize: 11, marginTop: 4, color: 'var(--bad)' }}>
                  {row.message}
                </div>
              )}
            </div>
            <div className="col" style={{ alignItems: 'stretch', minWidth: 120 }}>
              {row.state === 'installed' ? (
                <button className="ghost danger" onClick={() => void remove(m.id)}>
                  Remove
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={row.state === 'downloading'}
                  onClick={() => void download(m.id)}
                >
                  {row.state === 'downloading' ? 'Downloading…' : `Download ~${mib(m.approxBytes)}`}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
