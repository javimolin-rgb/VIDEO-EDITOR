import { customAlphabet } from 'nanoid';

// URL-safe, human-scannable ids. Prefixed by entity type for log readability.
const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const raw = customAlphabet(alphabet, 12);

export type IdPrefix =
  | 'proj'
  | 'asset'
  | 'track'
  | 'clip'
  | 'marker'
  | 'ver'
  | 'gen'
  | 'job'
  | 'ref'
  | 'take'
  | 'action';

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${raw()}`;
}
