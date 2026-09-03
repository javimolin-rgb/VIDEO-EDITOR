import { useEffect } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';

/**
 * Editor keyboard shortcuts (spec §10 — configurable later; Phase 1 ships a
 * sensible default map). Ignores events while a text field is focused.
 */
export function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.tagName === 'SELECT');

      const mod = e.metaKey || e.ctrlKey;
      const p = useProjectStore.getState();
      const ui = useUIStore.getState();

      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.setCommandPalette(!ui.commandPaletteOpen);
        return;
      }
      if (typing) return;

      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        p.undo();
        return;
      }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        p.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void p.saveNow();
        ui.pushToast('success', 'Project saved');
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          ui.togglePlay();
          break;
        case 's':
        case 'S':
          p.splitAtPlayhead(ui.selectedClipIds);
          break;
        case 'm':
        case 'M':
          p.addMarkerAtPlayhead();
          break;
        case 'Delete':
        case 'Backspace':
          if (ui.selectedClipIds.length) {
            p.removeClips(ui.selectedClipIds);
            ui.clearClipSelection();
          }
          break;
        case 'ArrowLeft':
          if (p.project) p.setPlayhead(p.project.timeline.playheadFrame - (e.shiftKey ? 10 : 1));
          break;
        case 'ArrowRight':
          if (p.project) p.setPlayhead(p.project.timeline.playheadFrame + (e.shiftKey ? 10 : 1));
          break;
        case 'Home':
          p.setPlayhead(0);
          break;
        case '+':
        case '=':
          ui.zoomIn();
          break;
        case '-':
          ui.zoomOut();
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
