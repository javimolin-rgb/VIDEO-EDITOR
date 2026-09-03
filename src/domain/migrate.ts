/**
 * Forward migration of persisted projects (spec §241 — never silently
 * invalidate old records). Runs on load; fills fields added by later schema
 * versions with safe defaults and bumps `schemaVersion`.
 */

import { createLogger } from '@/lib/logger';
import {
  DEFAULT_CAPTION_STYLE,
  IDENTITY_TRANSFORM,
  NEUTRAL_COLOR,
  PROJECT_SCHEMA_VERSION,
  type Clip,
  type Track,
  type VideoProject,
} from './types';

const log = createLogger('domain');

type LegacyClip = Partial<Clip> & Pick<Clip, 'id' | 'trackId' | 'assetId' | 'timelineStart' | 'sourceIn' | 'sourceOut'>;
type LegacyTrack = Partial<Track> & Pick<Track, 'id' | 'kind' | 'name' | 'index'>;

function migrateClip(c: LegacyClip): Clip {
  return {
    speed: 1,
    gain: 1,
    opacity: 1,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: null,
    ...c,
    pan: c.pan ?? 0,
    transform: c.transform ?? { ...IDENTITY_TRANSFORM },
    color: c.color ?? { ...NEUTRAL_COLOR },
    effects: c.effects ?? [],
    keyframes: c.keyframes ?? {},
  };
}

function migrateTrack(t: LegacyTrack): Track {
  return {
    muted: false,
    locked: false,
    hidden: false,
    height: t.kind === 'audio' ? 72 : 96,
    ...t,
    gain: t.gain ?? 1,
    pan: t.pan ?? 0,
  };
}

export function migrateProject(input: VideoProject): VideoProject {
  const version = input.meta.schemaVersion ?? 1;
  if (version >= PROJECT_SCHEMA_VERSION) return input;

  log.info('migrating project', { from: version, to: PROJECT_SCHEMA_VERSION, id: input.meta.id });

  const timeline = input.timeline as VideoProject['timeline'];
  const migrated: VideoProject = {
    ...input,
    meta: { ...input.meta, schemaVersion: PROJECT_SCHEMA_VERSION },
    references: input.references ?? [],
    timeline: {
      ...timeline,
      tracks: timeline.tracks.map((t) => migrateTrack(t as LegacyTrack)),
      clips: timeline.clips.map((c) => migrateClip(c as LegacyClip)),
      transitions: timeline.transitions ?? [],
      captionLayer:
        timeline.captionLayer ?? {
          enabled: false,
          style: { ...DEFAULT_CAPTION_STYLE },
          cues: [],
          sourceName: null,
        },
    },
  };
  return migrated;
}
