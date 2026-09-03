import { describe, expect, it } from 'vitest';
import { addShot, createShot, moveShot, orderedShots, removeShot, totalDurationSec, updateShot } from './storyboard';

describe('storyboard ops', () => {
  it('adds shots with dense sequential order', () => {
    let shots = addShot([]);
    shots = addShot(shots);
    shots = addShot(shots);
    expect(shots.map((s) => s.order)).toEqual([0, 1, 2]);
    expect(shots[0]!.title).toBe('Shot 1');
  });

  it('removes and renumbers', () => {
    let shots = [addShot([])[0]!, ...addShot(addShot([])).slice(0)];
    shots = addShot(addShot(addShot([])));
    const midId = orderedShots(shots)[1]!.id;
    shots = removeShot(shots, midId);
    expect(shots.map((s) => s.order)).toEqual([0, 1]);
  });

  it('moves a shot up and down within bounds', () => {
    let shots = addShot(addShot(addShot([])));
    const ids = orderedShots(shots).map((s) => s.id);
    shots = moveShot(shots, ids[2]!, -1);
    expect(orderedShots(shots).map((s) => s.id)).toEqual([ids[0], ids[2], ids[1]]);
    // moving the first one up is a no-op
    shots = moveShot(shots, orderedShots(shots)[0]!.id, -1);
    expect(orderedShots(shots).map((s) => s.id)).toEqual([ids[0], ids[2], ids[1]]);
  });

  it('updates a shot and preserves its id', () => {
    const shots = addShot([]);
    const id = shots[0]!.id;
    const next = updateShot(shots, id, { durationSec: 8, state: 'ready' });
    expect(next[0]!.id).toBe(id);
    expect(next[0]!.durationSec).toBe(8);
    expect(next[0]!.state).toBe('ready');
  });

  it('sums total duration', () => {
    const shots = [createShot({ durationSec: 3 }), createShot({ durationSec: 4, order: 1 })];
    expect(totalDurationSec(shots)).toBe(7);
  });
});
