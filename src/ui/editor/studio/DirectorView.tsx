import { useDirectorStore } from '@/state/directorStore';
import { AUTONOMY_LABEL, type AutonomyLevel, type CreativeBrief } from '@/ai/director/types';

const AUTONOMY: AutonomyLevel[] = ['assisted', 'semi-auto', 'auto', 'full-auto'];
const PLATFORMS: CreativeBrief['platform'][] = ['reel', 'tiktok', 'story', 'square', 'youtube', 'landscape'];
const STYLES = ['cinematic', 'editorial', 'fashion', 'commercial', 'documentary', 'minimal', 'analog', 'luxury'];

const STATUS_PILL: Record<string, string> = {
  pending: '',
  running: 'warn',
  done: 'good',
  skipped: '',
  failed: 'warn',
};

/** AI Director (spec §80, §126, §194, §195). Plan first, approve, then run. */
export function DirectorView() {
  const s = useDirectorStore();

  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      <div className="row" style={{ marginTop: 12 }}>
        <h3>AI Director</h3>
        <span className="spacer" />
        <select value={s.autonomy} onChange={(e) => s.setAutonomy(e.target.value as AutonomyLevel)}>
          {AUTONOMY.map((a) => (
            <option key={a} value={a}>
              {AUTONOMY_LABEL[a]}
            </option>
          ))}
        </select>
      </div>

      <div className="notice info" style={{ marginTop: 8 }}>
        The Director builds an editable, numbered plan from a brief or a script, then runs it
        against the tools that exist (storyboard, generation queue, quality control, colour match,
        captions). Steps needing a capability this build doesn’t have (music, SFX) are skipped
        honestly. No step touches your project until you approve the plan.
      </div>

      {!s.plan && (
        <div className="model-row" style={{ display: 'block', padding: 12, marginTop: 12 }}>
          <div className="row" style={{ gap: 4, marginBottom: 10 }}>
            <button className={s.input === 'brief' ? 'primary' : ''} onClick={() => s.setInput('brief')}>
              From a brief
            </button>
            <button className={s.input === 'script' ? 'primary' : ''} onClick={() => s.setInput('script')}>
              From a script
            </button>
          </div>

          {s.input === 'brief' ? (
            <>
              <div className="field">
                <label>Objective</label>
                <input
                  value={s.brief.objective}
                  placeholder="e.g. launch teaser for the new running shoe"
                  onChange={(e) => s.patchBrief({ objective: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Product</label>
                <input
                  value={s.brief.product}
                  placeholder="e.g. Aero X running shoe, coral colourway"
                  onChange={(e) => s.patchBrief({ product: e.target.value })}
                />
              </div>
              <div className="rowfields">
                <div className="field">
                  <label>Platform</label>
                  <select
                    value={s.brief.platform}
                    onChange={(e) => s.patchBrief({ platform: e.target.value as CreativeBrief['platform'] })}
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Style</label>
                  <select value={s.brief.style} onChange={(e) => s.patchBrief({ style: e.target.value })}>
                    {STYLES.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="rowfields">
                <div className="field">
                  <label>Duration — {s.brief.durationSec}s</label>
                  <input
                    type="range"
                    min={6}
                    max={45}
                    value={s.brief.durationSec}
                    onChange={(e) => s.patchBrief({ durationSec: Number(e.target.value) })}
                  />
                </div>
                <div className="field">
                  <label>Shots — {s.brief.shotCount}</label>
                  <input
                    type="range"
                    min={3}
                    max={10}
                    value={s.brief.shotCount}
                    onChange={(e) => s.patchBrief({ shotCount: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="field">
                <label>Mood</label>
                <input value={s.brief.mood} onChange={(e) => s.patchBrief({ mood: e.target.value })} />
              </div>
            </>
          ) : (
            <div className="field">
              <label>Script / voiceover</label>
              <textarea
                rows={8}
                placeholder={'Paste the script. One idea per sentence or paragraph — each becomes a scene.'}
                value={s.script}
                onChange={(e) => s.setScript(e.target.value)}
              />
            </div>
          )}

          <button
            className="primary"
            style={{ width: '100%', marginTop: 6 }}
            disabled={s.input === 'script' ? !s.script.trim() : !s.brief.product.trim() && !s.brief.objective.trim()}
            onClick={s.buildPlan}
          >
            Build plan
          </button>
        </div>
      )}

      {s.plan && (
        <div className="model-row" style={{ display: 'block', padding: 12, marginTop: 12 }}>
          <div className="row">
            <strong>{s.plan.goal}</strong>
            <span className="spacer" />
            <button onClick={s.discardPlan} disabled={s.running}>
              Discard
            </button>
            {s.autonomy !== 'assisted' && (
              <button className="primary" disabled={s.running} onClick={() => void s.runPlan()}>
                {s.running ? 'Running…' : 'Approve & run'}
              </button>
            )}
          </div>

          <h4 style={{ margin: '12px 0 6px' }}>Shots ({s.plan.shots.length})</h4>
          <div className="col" style={{ gap: 4 }}>
            {s.plan.shots.map((sh, i) => (
              <div key={i} className="row" style={{ gap: 6 }}>
                <span className="muted mono" style={{ fontSize: 11, width: 54, flexShrink: 0 }}>
                  {sh.title}
                </span>
                <input
                  value={sh.prompt}
                  onChange={(e) => s.editShotPrompt(i, e.target.value)}
                  style={{ fontSize: 12 }}
                />
                <span className="muted mono" style={{ fontSize: 11 }}>
                  {sh.durationSec}s
                </span>
              </div>
            ))}
          </div>

          <h4 style={{ margin: '14px 0 6px' }}>Steps</h4>
          <div className="col" style={{ gap: 4 }}>
            {s.plan.steps.map((st, i) => (
              <div
                key={st.id}
                className="row"
                style={{
                  gap: 8,
                  padding: '6px 4px',
                  borderBottom: '1px solid var(--line)',
                  background: s.currentStepId === st.id ? 'var(--bg-3)' : undefined,
                }}
              >
                <span className="muted mono" style={{ fontSize: 11 }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12 }}>
                    {st.title}
                    {st.destructive && <span className="muted"> · changes the project</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {st.result ?? st.detail}
                  </div>
                </div>
                <span className={`pill ${STATUS_PILL[st.status]}`} style={{ fontSize: 10 }}>
                  {st.status}
                </span>
                {s.autonomy === 'assisted' && st.status === 'pending' && (
                  <button
                    style={{ padding: '2px 8px' }}
                    disabled={s.running}
                    onClick={() => void s.runStep(st.id)}
                  >
                    Run
                  </button>
                )}
                {s.autonomy === 'assisted' && !s.running && st.status === 'pending' && (
                  <button className="ghost danger" style={{ padding: '2px 6px' }} onClick={() => s.removePlanStep(st.id)}>
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          {s.log.length > 0 && (
            <div className="activity" style={{ marginTop: 12 }}>
              {s.log.map((line, i) => (
                <div key={i} className="entry" style={{ display: 'block', fontSize: 11 }}>
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
