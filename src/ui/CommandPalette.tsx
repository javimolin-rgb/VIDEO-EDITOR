import { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';

interface Command {
  id: string;
  title: string;
  hint?: string;
  run: () => void;
}

/**
 * Global command palette (spec §88). Phase 1 wires the editing commands that
 * exist today; generative commands appear here once a local model is
 * installed rather than as dead entries (spec §160).
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
      {
        id: 'marker',
        title: 'Add marker at playhead',
        hint: 'M',
        run: () => store().addMarkerAtPlayhead(),
      },
      { id: 'add-video-track', title: 'Add video track', run: () => store().addTrack('video') },
      { id: 'add-audio-track', title: 'Add audio track', run: () => store().addTrack('audio') },
      {
        id: 'version',
        title: 'Save version snapshot',
        run: () => void store().createVersion(`Snapshot ${new Date().toLocaleTimeString()}`),
      },
      { id: 'studio', title: 'Open AI Video Studio', run: () => ui().setWorkspace('studio') },
      { id: 'ai-setup', title: 'Open AI Setup (local models)', run: () => ui().setWorkspace('ai-setup') },
      { id: 'edit', title: 'Back to editor', run: () => ui().setWorkspace('edit') },
    ],
    [store, ui],
  );

  const filtered = commands.filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));

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
          placeholder="Type a command…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, filtered.length - 1));
            if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
            if (e.key === 'Enter') {
              filtered[active]?.run();
              setOpen(false);
            }
            if (e.key === 'Escape') setOpen(false);
          }}
        />
        {filtered.map((c, i) => (
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
        {filtered.length === 0 && <div className="palette-item muted">No matching command</div>}
      </div>
    </div>
  );
}
