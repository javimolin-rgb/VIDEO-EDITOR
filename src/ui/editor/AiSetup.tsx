import { useEffect, useState } from 'react';
import { detectHardware, type HardwareProfile } from '@/ai/hardware';
import { listModels, type ModelTask } from '@/ai/registry';

const TASK_LABEL: Record<ModelTask, string> = {
  video: 'Video models',
  image: 'Image models',
  audio: 'Audio models',
  speech: 'Speech models',
  vision: 'Vision models',
  upscale: 'Upscaling models',
};

function gib(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(bytes < 1024 ** 3 ? 2 : 1)} GB`;
}

/**
 * First-run AI setup center (spec §7, §252). Phase 1 shows the hardware
 * profile and the model catalogue with honest, non-functional install
 * controls — nothing is downloaded silently, and the local runtime that
 * would perform installs is Phase 3.
 */
export function AiSetup() {
  const [hw, setHw] = useState<HardwareProfile | null>(null);

  useEffect(() => {
    void detectHardware().then(setHw);
  }, []);

  const tasks: ModelTask[] = ['video', 'speech', 'audio', 'image', 'vision', 'upscale'];

  return (
    <div className="panel-body" style={{ maxWidth: 900, margin: '0 auto' }}>
      <h2>AI Setup</h2>
      <p className="muted">
        Local-first. Choose what to run on this device. Nothing downloads without your confirmation
        (spec §7, §97). No account, no cloud, no external API.
      </p>

      <h4 style={{ margin: '16px 0 8px' }}>This device</h4>
      {hw ? (
        <div className="model-row" style={{ display: 'block' }}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span className="pill">{hw.os}</span>
            <span className="pill">{hw.gpuVendor} GPU</span>
            <span className="pill">{hw.logicalCores} cores</span>
            <span className="pill">{hw.deviceMemoryGb ? `${hw.deviceMemoryGb} GB RAM (approx)` : 'RAM unknown'}</span>
            <span className="pill">{hw.webgpu ? 'WebGPU ✓' : 'WebGPU ✗'}</span>
            <span className="pill">{hw.webcodecs ? 'WebCodecs ✓' : 'WebCodecs ✗'}</span>
            <span className={`pill ${hw.recommendedProfile === 'quality' ? 'good' : 'warn'}`}>
              Recommended: {hw.recommendedProfile.toUpperCase()}
            </span>
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
            {hw.notes}
          </div>
        </div>
      ) : (
        <div className="muted">Detecting…</div>
      )}

      {tasks.map((task) => {
        const models = listModels(task);
        if (models.length === 0) return null;
        return (
          <div key={task}>
            <h4 style={{ margin: '18px 0 8px' }}>{TASK_LABEL[task]}</h4>
            {models.map(({ descriptor: d, state }) => (
              <div key={d.id} className="model-row">
                <div>
                  <div className="name">
                    {d.name}{' '}
                    <span className="pill" style={{ marginLeft: 6 }}>
                      {state === 'installed' ? 'installed' : 'not installed'}
                    </span>
                  </div>
                  <div className="spec">
                    {d.license} · ~{gib(d.sizeBytesApprox)} · needs ≥{d.vramGbMin} GB VRAM / ≥
                    {d.ramGbMin} GB RAM · {d.hardware.join(', ')} · {d.speedEstimate}/
                    {d.qualityEstimate}
                    <br />
                    Source: {d.downloadSource}
                    <br />
                    {d.notes}
                  </div>
                </div>
                <div className="col" style={{ alignItems: 'stretch', minWidth: 120 }}>
                  <button
                    disabled
                    title="The local inference service that performs downloads arrives in Phase 3."
                  >
                    Download
                  </button>
                  <button disabled>Model info</button>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <div className="notice" style={{ marginTop: 20 }}>
        Install controls are disabled because the local inference service (spec §149–§151) is not
        part of Phase 1. The registry, hardware detection, capability routing and provider
        abstraction it depends on are all in place, so wiring a runtime (native Python / ComfyUI /
        llama.cpp-style service) does not require touching the editor.
      </div>
    </div>
  );
}
