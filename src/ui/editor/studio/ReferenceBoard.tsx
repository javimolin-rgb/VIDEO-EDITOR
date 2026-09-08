import { useProjectStore } from '@/state/projectStore';
import { useT } from '@/i18n';
import type { ReferencePriority, ReferenceRole } from '@/domain/types';

const ROLES: ReferenceRole[] = [
  'character',
  'product',
  'clothing',
  'environment',
  'architecture',
  'style',
  'color',
  'composition',
  'camera',
  'motion',
  'brand',
];
const PRIORITIES: ReferencePriority[] = ['critical', 'high', 'medium', 'low'];

/** Reference board (spec §23, §24, §135) — each reference carries a role + priority. */
export function ReferenceBoard() {
  const t = useT();
  const project = useProjectStore((s) => s.project);
  const assets = useProjectStore((s) => s.assets);
  const addReference = useProjectStore((s) => s.addReference);
  const updateReference = useProjectStore((s) => s.updateReference);
  const removeReference = useProjectStore((s) => s.removeReference);
  if (!project) return null;

  const refs = project.references;
  const imageAssets = assets.filter((a) => a.kind === 'image' || a.kind === 'video');
  const unreferenced = imageAssets.filter((a) => !refs.some((r) => r.assetId === a.id));

  return (
    <div>
      <h4 style={{ margin: '4px 0 8px' }}>{t('form.references')}</h4>

      {refs.length === 0 && (
        <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
          {t('form.referencesHint')}
        </div>
      )}

      <div className="col" style={{ gap: 6 }}>
        {refs.map((r) => {
          const asset = assets.find((a) => a.id === r.assetId);
          return (
            <div key={r.assetId} className="asset" style={{ cursor: 'default' }}>
              <div className="thumb">
                {asset?.thumbnailDataUrl ? (
                  <img
                    src={asset.thumbnailDataUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }}
                  />
                ) : (
                  '🖼️'
                )}
              </div>
              <div className="info" style={{ gap: 4 }}>
                <div className="name">{asset?.name ?? r.assetId}</div>
                <div className="row" style={{ gap: 4 }}>
                  <select
                    value={r.role}
                    onChange={(e) => updateReference(r.assetId, { role: e.target.value as ReferenceRole })}
                    style={{ padding: '2px 4px', fontSize: 11 }}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <select
                    value={r.priority}
                    onChange={(e) =>
                      updateReference(r.assetId, { priority: e.target.value as ReferencePriority })
                    }
                    style={{ padding: '2px 4px', fontSize: 11 }}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button className="ghost danger" onClick={() => removeReference(r.assetId)}>
                ✕
              </button>
            </div>
          );
        })}
      </div>

      {unreferenced.length > 0 && (
        <select
          value=""
          style={{ marginTop: 8 }}
          onChange={(e) => {
            if (e.target.value) addReference(e.target.value, 'style', 'medium');
            e.target.value = '';
          }}
        >
          <option value="">+ Add reference from media…</option>
          {unreferenced.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
