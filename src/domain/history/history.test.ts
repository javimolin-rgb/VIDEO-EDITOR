import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, commit, initHistory, redo, undo } from './history';

describe('history', () => {
  it('commits, undoes and redoes snapshots', () => {
    let h = initHistory({ n: 0 });
    h = commit(h, { n: 1 }, 'set 1');
    h = commit(h, { n: 2 }, 'set 2');
    expect(h.present.snapshot.n).toBe(2);
    expect(canUndo(h)).toBe(true);

    h = undo(h);
    expect(h.present.snapshot.n).toBe(1);
    h = undo(h);
    expect(h.present.snapshot.n).toBe(0);
    expect(canUndo(h)).toBe(false);

    h = redo(h);
    expect(h.present.snapshot.n).toBe(1);
    expect(canRedo(h)).toBe(true);
  });

  it('clears the redo stack on a new commit', () => {
    let h = initHistory({ n: 0 });
    h = commit(h, { n: 1 }, 'a');
    h = undo(h);
    h = commit(h, { n: 9 }, 'b');
    expect(canRedo(h)).toBe(false);
    expect(h.present.snapshot.n).toBe(9);
  });

  it('bounds the past stack to the limit', () => {
    let h = initHistory({ n: 0 });
    for (let i = 1; i <= 10; i++) h = commit(h, { n: i }, `s${i}`, 'edit', { limit: 3 });
    expect(h.past.length).toBeLessThanOrEqual(3);
    expect(h.present.snapshot.n).toBe(10);
  });
});
