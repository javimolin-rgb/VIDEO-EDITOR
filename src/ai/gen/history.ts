/**
 * Generation history + graph (spec §75, §124, §125, §173, §243). Every
 * generated clip gets a row linking prompt / model / seed / params / parent so
 * variations form a tree and identical requests can reuse an earlier result.
 */

import { db, type GenerationRow } from '@/storage/db';

export async function recordGeneration(row: GenerationRow): Promise<void> {
  await db.generations.put(row);
}

export async function listGenerations(projectId: string): Promise<GenerationRow[]> {
  return db.generations.where('projectId').equals(projectId).reverse().sortBy('createdAt');
}

export async function getGeneration(id: string): Promise<GenerationRow | undefined> {
  return db.generations.get(id);
}

/** Prior result for an identical request, if one exists (spec §173). */
export async function findByRequestHash(
  projectId: string,
  requestHash: string,
): Promise<GenerationRow | undefined> {
  const rows = await db.generations.where('requestHash').equals(requestHash).toArray();
  return rows.find((r) => r.projectId === projectId);
}

export async function deleteGeneration(id: string): Promise<void> {
  await db.generations.delete(id);
}

export interface GenerationNode extends GenerationRow {
  children: GenerationNode[];
  depth: number;
}

/** Build the parent→children forest, newest roots first. */
export function buildGraph(rows: GenerationRow[]): GenerationNode[] {
  const byId = new Map<string, GenerationNode>();
  for (const r of rows) byId.set(r.id, { ...r, children: [], depth: 0 });
  const roots: GenerationNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) {
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (n: GenerationNode) => {
    n.children.sort((a, b) => a.createdAt - b.createdAt);
    n.children.forEach(sortRec);
  };
  roots.sort((a, b) => b.createdAt - a.createdAt);
  roots.forEach(sortRec);
  return roots;
}

/** Flatten the forest for a simple indented list view. */
export function flattenGraph(nodes: GenerationNode[]): GenerationNode[] {
  const out: GenerationNode[] = [];
  const walk = (n: GenerationNode) => {
    out.push(n);
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}
