import { useRef, useState } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import type { Asset } from '@/domain/types';

const KIND_ICON: Record<Asset['kind'], string> = {
  video: '🎞️',
  audio: '🎵',
  image: '🖼️',
  caption: '💬',
};

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function MediaPanel() {
  const assets = useProjectStore((s) => s.assets);
  const importFiles = useProjectStore((s) => s.importFiles);
  const removeAsset = useProjectStore((s) => s.removeAsset);
  const importProgress = useProjectStore((s) => s.importProgress);
  const selectedAssetId = useUIStore((s) => s.selectedAssetId);
  const selectAsset = useUIStore((s) => s.selectAsset);
  const setRightPanel = useUIStore((s) => s.setRightPanel);
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div>
      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) void importFiles(e.dataTransfer.files);
        }}
      >
        <div style={{ fontSize: 20 }}>＋</div>
        Drop media here or click to import
        <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
          video · audio · images · SRT/VTT
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="video/*,audio/*,image/*,.srt,.vtt,.ass"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.length) void importFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {importProgress && (
        <div className="notice info" style={{ marginTop: 10 }}>
          Importing {importProgress.done + 1}/{importProgress.total}
          {importProgress.currentName ? ` — ${importProgress.currentName}` : ''}
        </div>
      )}

      <div className="asset-list">
        {assets.length === 0 && !importProgress && (
          <div className="muted" style={{ marginTop: 8 }}>
            No media yet.
          </div>
        )}
        {assets.map((a) => (
          <div
            key={a.id}
            className={`asset ${selectedAssetId === a.id ? 'selected' : ''}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-asset-id', a.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => {
              selectAsset(a.id);
              setRightPanel('inspector');
            }}
          >
            <div className="thumb">
              {a.thumbnailDataUrl ? (
                <img
                  src={a.thumbnailDataUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }}
                />
              ) : (
                KIND_ICON[a.kind]
              )}
            </div>
            <div className="info">
              <div className="name">{a.name}</div>
              <div className="sub">
                {a.meta.durationSec != null && `${a.meta.durationSec.toFixed(1)}s · `}
                {a.meta.width && a.meta.height ? `${a.meta.width}×${a.meta.height} · ` : ''}
                {humanBytes(a.meta.sizeBytes)}
              </div>
            </div>
            <button
              className="ghost danger"
              title="Remove"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Remove "${a.name}" and any clips using it?`)) void removeAsset(a.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="muted" style={{ marginTop: 12, fontSize: 11 }}>
        Drag an asset onto a timeline track to add it at the drop point.
      </div>
    </div>
  );
}
