import { useEffect, useState } from 'react';
import { useAutomationStore } from '@/state/automationStore';
import { useUIStore } from '@/state/uiStore';
import { STEP_DEFS, stepDef, type RecipeStepKind, type RecipeTrigger } from '@/automation/types';

const STATUS_PILL: Record<string, string> = {
  pending: '',
  running: 'warn',
  done: 'good',
  skipped: '',
  failed: 'warn',
};

/** Automation workspace (spec §87, §82, §141, §182). */
export function AutomationPanel() {
  const s = useAutomationStore();
  const pushToast = useUIStore((x) => x.pushToast);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['reel', 'landscape']);
  const [brandName, setBrandName] = useState('');

  useEffect(() => {
    void s.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="panel-body" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <h2>Automation</h2>
      <p className="muted">
        Recipes chain the tools you already have. Run them by hand or when media is imported. Steps
        that need a capability this build doesn’t have are skipped with a reason (spec §87, §159).
      </p>

      {/* ── Recipes ─────────────────────────────────────────────────────── */}
      <div className="row" style={{ marginTop: 16 }}>
        <h3>Recipes</h3>
        <span className="spacer" />
        <input
          placeholder="New recipe name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{ width: 200 }}
        />
        <button
          onClick={async () => {
            const id = await s.createRecipe(newName || 'New recipe');
            setNewName('');
            setExpanded(id);
          }}
        >
          + Recipe
        </button>
      </div>

      {s.recipes.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No recipes yet.</div>}

      {s.recipes.map((r) => (
        <div key={r.id} className="model-row" style={{ display: 'block', padding: 12, marginTop: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            <input
              value={r.name}
              onChange={(e) => void s.updateRecipe(r.id, { name: e.target.value })}
              style={{ maxWidth: 220, fontWeight: 600 }}
            />
            <select
              value={r.trigger}
              onChange={(e) => void s.updateRecipe(r.id, { trigger: e.target.value as RecipeTrigger })}
              style={{ width: 140 }}
            >
              <option value="manual">Manual</option>
              <option value="on-import">On import</option>
            </select>
            <label className="row" style={{ fontSize: 11 }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={r.enabled}
                onChange={(e) => void s.updateRecipe(r.id, { enabled: e.target.checked })}
              />
              enabled
            </label>
            <span className="muted" style={{ fontSize: 11 }}>
              {r.steps.length} steps
            </span>
            <span className="spacer" />
            <button onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
              {expanded === r.id ? 'Close' : 'Edit'}
            </button>
            <button
              className="primary"
              disabled={r.steps.length === 0 || !!s.run && !s.run.done}
              onClick={() => {
                void s.runRecipe(r.id);
                pushToast('info', `Running “${r.name}”…`);
              }}
            >
              Run
            </button>
            <button className="ghost danger" onClick={() => void s.deleteRecipe(r.id)}>
              ✕
            </button>
          </div>

          {expanded === r.id && (
            <div style={{ marginTop: 10 }}>
              {r.steps.map((step, i) => {
                const def = stepDef(step.kind);
                return (
                  <div key={step.id} className="model-row" style={{ display: 'block', padding: 8, marginBottom: 6 }}>
                    <div className="row">
                      <span className="muted mono" style={{ fontSize: 11 }}>
                        {i + 1}
                      </span>
                      <strong style={{ fontSize: 12 }}>{def.label}</strong>
                      {def.needsModel && <span className="pill" style={{ fontSize: 10 }}>needs model</span>}
                      <span className="spacer" />
                      <button className="ghost" style={{ padding: '1px 6px' }} onClick={() => void s.moveStep(r.id, step.id, -1)}>
                        ↑
                      </button>
                      <button className="ghost" style={{ padding: '1px 6px' }} onClick={() => void s.moveStep(r.id, step.id, 1)}>
                        ↓
                      </button>
                      <button className="ghost danger" style={{ padding: '1px 6px' }} onClick={() => void s.removeStep(r.id, step.id)}>
                        ✕
                      </button>
                    </div>
                    <div className="muted" style={{ fontSize: 11, margin: '2px 0 6px' }}>
                      {def.detail}
                    </div>
                    {def.params.length > 0 && (
                      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        {def.params.map((p) => (
                          <label key={p.key} className="row" style={{ fontSize: 11, gap: 4 }}>
                            {p.label}
                            {p.type === 'select' ? (
                              <select
                                value={String(step.params[p.key] ?? p.default)}
                                onChange={(e) => void s.updateStep(r.id, step.id, { ...step.params, [p.key]: e.target.value })}
                                style={{ width: 130 }}
                              >
                                {p.options!.map((o) => (
                                  <option key={o} value={o}>
                                    {o}
                                  </option>
                                ))}
                              </select>
                            ) : p.type === 'bool' ? (
                              <input
                                type="checkbox"
                                style={{ width: 'auto' }}
                                checked={Boolean(step.params[p.key] ?? p.default)}
                                onChange={(e) => void s.updateStep(r.id, step.id, { ...step.params, [p.key]: e.target.checked })}
                              />
                            ) : (
                              <input
                                type={p.type === 'number' ? 'number' : 'text'}
                                value={String(step.params[p.key] ?? p.default)}
                                onChange={(e) =>
                                  void s.updateStep(r.id, step.id, {
                                    ...step.params,
                                    [p.key]: p.type === 'number' ? Number(e.target.value) : e.target.value,
                                  })
                                }
                                style={{ width: 90 }}
                              />
                            )}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) void s.addStep(r.id, e.target.value as RecipeStepKind);
                  e.target.value = '';
                }}
              >
                <option value="">+ Add step…</option>
                {STEP_DEFS.map((d) => (
                  <option key={d.kind} value={d.kind}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      ))}

      {/* ── Run log ─────────────────────────────────────────────────────── */}
      {s.run && (
        <div className="model-row" style={{ display: 'block', padding: 12, marginTop: 12 }}>
          <strong style={{ fontSize: 12 }}>Run {s.run.done ? '· finished' : '· running…'}</strong>
          <div className="activity" style={{ marginTop: 6 }}>
            {s.run.steps.map((st) => (
              <div key={st.stepId} className="entry" style={{ display: 'block', fontSize: 11 }}>
                <span className={`pill ${STATUS_PILL[st.status]}`} style={{ fontSize: 10, marginRight: 6 }}>
                  {st.status}
                </span>
                {st.title}
                {st.result && <span className="muted"> — {st.result}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Social repurposing ──────────────────────────────────────────── */}
      <h3 style={{ marginTop: 20 }}>Repurpose for social</h3>
      <p className="muted" style={{ fontSize: 12 }}>
        Auto-reframes the first video clip for each platform (subject tracked) and drafts a content
        pack from the captions / transcript (spec §82, §182).
      </p>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        {s.platforms.map((p) => (
          <label key={p.id} className="row" style={{ fontSize: 12, gap: 4 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={platforms.includes(p.id)}
              onChange={(e) =>
                setPlatforms((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id)))
              }
            />
            {p.label} ({p.aspect})
          </label>
        ))}
      </div>
      <button
        className="primary"
        style={{ marginTop: 8 }}
        disabled={platforms.length === 0}
        onClick={() => {
          void s.repurpose(platforms);
          pushToast('info', 'Repurposing — reframed clips will appear in Media.');
        }}
      >
        Repurpose
      </button>

      {s.contentPack && (
        <div className="model-row" style={{ display: 'block', padding: 12, marginTop: 10 }}>
          <div className="field">
            <label>Title</label>
            <div>{s.contentPack.title}</div>
          </div>
          <div className="field">
            <label>Description</label>
            <div className="muted" style={{ fontSize: 12 }}>{s.contentPack.description}</div>
          </div>
          <div className="field">
            <label>Tags</label>
            <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
              {s.contentPack.tags.map((t) => (
                <span key={t} className="pill">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="field">
            <label>CTA</label>
            <div>{s.contentPack.cta}</div>
          </div>
          <div className="notice" style={{ fontSize: 12 }}>Hook: {s.contentPack.hookNote}</div>
        </div>
      )}

      {/* ── Brand templates ─────────────────────────────────────────────── */}
      <h3 style={{ marginTop: 20 }}>Brand templates</h3>
      <div className="row">
        <input
          placeholder="Template name"
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          style={{ width: 200 }}
        />
        <button
          onClick={async () => {
            await s.saveBrandTemplate(brandName || 'Brand');
            setBrandName('');
            pushToast('success', 'Saved current caption style + colours as a brand template.');
          }}
        >
          Save current as template
        </button>
      </div>
      <div className="col" style={{ gap: 6, marginTop: 8 }}>
        {s.brandTemplates.map((t) => (
          <div key={t.id} className="row" style={{ justifyContent: 'space-between' }}>
            <span>
              {t.name}{' '}
              <span className="muted" style={{ fontSize: 11 }}>
                · {t.captionStyle.preset} · {t.colors.length} colours · {t.primaryAspect}
              </span>
            </span>
            <div className="row" style={{ gap: 4 }}>
              <button
                className="ghost"
                onClick={() => {
                  s.applyBrandTemplate(t.id);
                  pushToast('success', `Applied “${t.name}”.`);
                }}
              >
                Apply
              </button>
              <button className="ghost danger" onClick={() => void s.deleteBrandTemplate(t.id)}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
