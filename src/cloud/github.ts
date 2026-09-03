/**
 * GitHub as project storage (spec §118, §249). The project package is written
 * to a repo via the GitHub Contents API — no git binary, works from the
 * browser and the desktop shell. The token is the user's own Personal Access
 * Token, stored only in this browser's localStorage, sent only to
 * api.github.com.
 */

import { createLogger } from '@/lib/logger';
import { buildPackage, importPackage, type ProjectPackage } from '@/storage/projectPackage';

const log = createLogger('storage');
const API = 'https://api.github.com';
const KEY = 'aiv.github';

export interface GitHubConfig {
  /** "owner/name" */
  repo: string;
  token: string;
  branch: string;
  /** Folder in the repo to keep packages in. */
  dir: string;
  enabled: boolean;
  autoSync: boolean;
}

export const DEFAULT_GH: GitHubConfig = {
  repo: '',
  token: '',
  branch: 'main',
  dir: 'projects',
  enabled: false,
  autoSync: false,
};

export function loadGitHubConfig(): GitHubConfig {
  try {
    return { ...DEFAULT_GH, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<GitHubConfig>) };
  } catch {
    return { ...DEFAULT_GH };
  }
}

export function saveGitHubConfig(cfg: GitHubConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* private mode */
  }
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}
function fromBase64(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function gh(cfg: GitHubConfig, path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cfg.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  return res;
}

export async function testConnection(cfg: GitHubConfig): Promise<{ ok: boolean; detail: string }> {
  if (!cfg.repo.includes('/')) return { ok: false, detail: 'Repository must be "owner/name".' };
  if (!cfg.token) return { ok: false, detail: 'A Personal Access Token is required.' };
  try {
    const res = await gh(cfg, `/repos/${cfg.repo}`);
    if (res.status === 404) return { ok: false, detail: 'Repository not found, or the token lacks access.' };
    if (res.status === 401) return { ok: false, detail: 'Bad token (401).' };
    if (!res.ok) return { ok: false, detail: `GitHub returned ${res.status}.` };
    const body = (await res.json()) as { permissions?: { push?: boolean } };
    if (body.permissions && !body.permissions.push) {
      return { ok: false, detail: 'The token can read but not write this repository.' };
    }
    return { ok: true, detail: 'Connected — the token can write to this repository.' };
  } catch (e) {
    return { ok: false, detail: `Network error: ${String(e)}` };
  }
}

interface ContentsFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
}

async function getSha(cfg: GitHubConfig, path: string): Promise<string | null> {
  const res = await gh(cfg, `/repos/${cfg.repo}/contents/${encodeURI(path)}?ref=${cfg.branch}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path}: ${res.status}`);
  const body = (await res.json()) as ContentsFile;
  return body.sha;
}

async function putFile(cfg: GitHubConfig, path: string, contentB64: string, message: string): Promise<void> {
  const sha = await getSha(cfg, path).catch(() => null);
  const res = await gh(cfg, `/repos/${cfg.repo}/contents/${encodeURI(path)}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: contentB64, branch: cfg.branch, ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub PUT ${path}: ${res.status} ${txt.slice(0, 160)}`);
  }
}

async function getFile(cfg: GitHubConfig, path: string): Promise<string | null> {
  const res = await gh(cfg, `/repos/${cfg.repo}/contents/${encodeURI(path)}?ref=${cfg.branch}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path}: ${res.status}`);
  const body = (await res.json()) as { content?: string; encoding?: string; download_url?: string };
  if (body.content && body.encoding === 'base64') return fromBase64(body.content);
  if (body.download_url) return fetch(body.download_url).then((r) => r.text());
  return null;
}

export interface RemoteProject {
  id: string;
  name: string;
  sizeKb: number;
}

export async function listRemoteProjects(cfg: GitHubConfig): Promise<RemoteProject[]> {
  const res = await gh(cfg, `/repos/${cfg.repo}/contents/${encodeURI(cfg.dir)}?ref=${cfg.branch}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub list: ${res.status}`);
  const files = (await res.json()) as ContentsFile[];
  const out: RemoteProject[] = [];
  for (const f of files) {
    if (f.type !== 'file' || !f.name.endsWith('.json')) continue;
    const id = f.name.replace(/\.json$/, '');
    let name = id;
    try {
      const txt = await getFile(cfg, f.path);
      if (txt) name = (JSON.parse(txt) as ProjectPackage).project.meta.name;
    } catch {
      /* keep id as name */
    }
    out.push({ id, name, sizeKb: Math.round(f.size / 1024) });
  }
  return out;
}

const MAX_PUSH_BYTES = 45 * 1024 * 1024;

export async function pushProject(cfg: GitHubConfig, projectId: string): Promise<{ bytes: number }> {
  const pkg = await buildPackage(projectId);
  if (!pkg) throw new Error('Project not found.');
  const json = JSON.stringify(pkg);
  if (json.length > MAX_PUSH_BYTES) {
    throw new Error(
      `This project packages to ${(json.length / 1024 / 1024).toFixed(0)} MB, over the ~45 MB limit for GitHub Contents. Remove heavy media or export a local package instead.`,
    );
  }
  const path = `${cfg.dir}/${projectId}.json`;
  await putFile(cfg, path, toBase64(json), `Sync ${pkg.project.meta.name} — ${new Date().toISOString()}`);
  log.info('pushed project to GitHub', { projectId, bytes: json.length });
  return { bytes: json.length };
}

export async function pullProject(cfg: GitHubConfig, projectId: string): Promise<string> {
  const txt = await getFile(cfg, `${cfg.dir}/${projectId}.json`);
  if (!txt) throw new Error('That project is not in the repository.');
  const pkg = JSON.parse(txt) as ProjectPackage;
  return importPackage(pkg, 'replace');
}
