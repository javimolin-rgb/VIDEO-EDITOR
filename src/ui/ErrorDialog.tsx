import { useProjectStore } from '@/state/projectStore';
import { isAppError } from '@/lib/errors';
import { useT } from '@/i18n';

/** Structured, actionable error surface (spec §119): why / what / how to fix. */
export function ErrorDialog() {
  const error = useProjectStore((s) => s.error);
  const dismiss = useProjectStore((s) => s.dismissError);
  const t = useT();
  if (!error) return null;

  const e = isAppError(error) ? error : { code: 'unknown', message: String(error) };

  return (
    <div className="modal-backdrop" onClick={dismiss}>
      <div className="modal" onClick={(ev) => ev.stopPropagation()} role="alertdialog" aria-modal="true">
        <h2>{t('error.title')}</h2>
        <div className="field">
          <label>{t('error.what')}</label>
          <div>{e.message}</div>
        </div>
        {e.cause && (
          <div className="field">
            <label>{t('error.why')}</label>
            <div className="muted">{e.cause}</div>
          </div>
        )}
        {e.fix && (
          <div className="notice info">
            <strong>{t('error.fix')}:</strong> {e.fix}
          </div>
        )}
        {e.code && e.code !== 'unknown' && (
          <div className="muted mono" style={{ fontSize: 11, marginTop: 8 }}>
            {e.code}
          </div>
        )}
        <div className="actions">
          <button className="primary" onClick={dismiss} autoFocus>
            {t('error.dismiss')}
          </button>
        </div>
      </div>
    </div>
  );
}
