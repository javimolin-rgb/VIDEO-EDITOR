import { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import { useGenStore } from '@/state/genStore';
import { searchProject, type SearchHit } from '@/ai/search';

interface Command {
  id: string;
  title: string;
  hint?: string;
  run: () => void;
}

/**
 * Global command palette + project search (spec §88, §174). Commands match the
 * typed query; anything left over is run through `searchProject` so ⌘K also
 * jumps to captions, transcript lines, markers and assets.
 */
export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPalette);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);

  const store = useProjectStore.getState;
  const ui = useUIStore.getState;

  const commands = useMemo<Command[]>(
    () => [
      { id: 'undo', title: 'Undo', hint: '⌘Z', run: () => store().undo() },
      { id: 'redo', title: 'Redo', hint: '⇧⌘Z', run: () => store().redo() },
      {
        id: 'split',
        title: 'Split clip at playhead',
        hint: 'S',
        run: () => store().splitAtPlayhead(ui().selectedClipIds),
      },
      { id: 'marker', title: 'Add marker at playhead', hint: 'M', run: () => store().addMarkerAtPlayhead() },
      {
        id: 'remove-silences',
        title: 'Remove silences from selected clip (balanced)',
        run: () => {
          const id = ui().selectedClipIds[0];
          if (id) void store().removeSilences(id, 'balanced');
        },
      },
      {
        id: 'detect-shots',
        title: 'Detect shots in selected clip',
        run: () => {
          const id = ui().selectedClipIds[0];
          if (id) void store().detectShotsForClip(id, 0.45);
        },
      },
      {
        id: 'captions',
        title: 'Generate captions from audio (local)',
        run: () => {
          ui().setWorkspace('edit');
          ui().setLeftPanel('text');
        },
      },
      { id: 'add-video-track', title: 'Add video track', run: () => store().addTrack('video') },
      { id: 'add-audio-track', title: 'Add audio track', run: () => store().addTrack('audio') },
      {
        id: 'version',
        title: 'Save version snapshot',
        run: () => void store().createVersion(`Snapshot ${new Date().toLocaleTimeString()}`),
      },
      { id: 'studio', title: 'Open AI Video Studio', run: () => ui().setWorkspace('studio') },
      {
        id: 'gen-video',
        title: 'Generate video from a prompt…',
        run: () => {
          useGenStore.getState().setMode('text-to-video');
          ui().setWorkspace('studio');
        },
      },
      {
        id: 'fill-gap',
        title: 'Fill gap at playhead with AI',
        run: () => {
          void useGenStore.getState().fillGap();
        },
      },
      {
        id: 'storyboard',
        title: 'Open Storyboard',
        run: () => {
          useGenStore.getState().setStudioView('storyboard');
          ui().setWorkspace('studio');
        },
      },
      {
        id: 'director',
        title: 'Open AI Director',
        run: () => {
          useGenStore.getState().setStudioView('director');
          ui().setWorkspace('studio');
        },
      },
      {
        id: 'broll',
        title: 'Generate B-roll from captions',
        run: () => void useGenStore.getState().generateBroll(),
      },
      {
        id: 'extend-clip',
        title: 'Extend selected clip (+3s)',
        run: () => {
          const id = ui().selectedClipIds[0];
          if (id) void useGenStore.getState().extendClip(id, 3);
        },
      },
      {
        id: 'reframe-clip',
        title: 'Auto-reframe selected clip to 9:16',
        run: () => {
          const id = ui().selectedClipIds[0];
          if (id) void useGenStore.getState().autoReframeClip(id, '9:16');
        },
      },
      {
        id: 'continuity',
        title: 'Analyse timeline continuity',
        run: () => void useGenStore.getState().analyzeContinuity(),
      },
      { id: 'ai-setup', title: 'Open AI Setup (local models)', run: () => ui().setWorkspace('ai-setup') },
      { id: 'edit', title: 'Back to editor', run: () => ui().setWorkspace('edit') },
    ],
    [store, ui],
  );

  const filteredCommands = commands.filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));

  const hits = useMemo<SearchHit[]>(() => {
    if (q.trim().length < 2) return [];
    const s = store();
    if (!s.project) return [];
    return searchProject(s.project, s.assets, s.transcript, q);
  }, [q, store]);

  const runHit = (hit: SearchHit) => {
    const s = store();
    if (hit.assetId) {
      ui().selectAsset(hit.assetId);
      ui().setWorkspace('edit');
      ui().setLeftPanel('media');
    } else if (hit.frame != null) {
      ui().setWorkspace('edit');
      s.setPlayhead(hit.frame);
    }
  };

  const total = filteredCommands.length + hits.length;

  useEffect(() => {
    if (!open) {
      setQ('');
      setActive(0);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="palette" onClick={() => setOpen(false)}>
      <div className="palette-box" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Command, or search captions / transcript / assets…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, total - 1));
            if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
            if (e.key === 'Enter') {
              if (active < filteredCommands.length) filteredCommands[active]?.run();
              else runHit(hits[active - filteredCommands.length]!);
              setOpen(false);
            }
            if (e.key === 'Escape') setOpen(false);
          }}
        />
        {filteredCommands.map((c, i) => (
          <div
            key={c.id}
            className={`palette-item ${i === active ? 'active' : ''}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => {
              c.run();
              setOpen(false);
            }}
          >
            <span>{c.title}</span>
            {c.hint && <span className="hint">{c.hint}</span>}
          </div>
        ))}
        {hits.map((h, i) => {
          const idx = filteredCommands.length + i;
          return (
            <div
              key={`hit-${idx}`}
              className={`palette-item ${idx === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(idx)}
              onClick={() => {
                runHit(h);
                setOpen(false);
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {h.label}
              </span>
              <span className="hint">{h.kind}</span>
            </div>
          );
        })}
        {total === 0 && <div className="palette-item muted">Nothing matches</div>}
      </div>
    </div>
  );
}
