/**
 * Dumps every distinct node category with its observed output type(s), sorted.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMtlx } from './mtlx/parser.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', 'materialx');

function collect(dir: string): string[] {
  const r: string[] = [];
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) r.push(...collect(f));
    else if (e.endsWith('.mtlx')) r.push(f);
  }
  return r;
}

const catTypes = new Map<string, Set<string>>();
for (const f of collect(ROOT)) {
  try {
    const doc = parseMtlx(readFileSync(f, 'utf-8'));
    for (const n of doc.nodes) {
      if (!catTypes.has(n.category)) catTypes.set(n.category, new Set());
      if (n.type) catTypes.get(n.category)!.add(n.type);
    }
    for (const g of doc.nodegraphs) {
      for (const n of g.nodes) {
        if (!catTypes.has(n.category)) catTypes.set(n.category, new Set());
        if (n.type) catTypes.get(n.category)!.add(n.type);
      }
    }
  } catch { /* skip */ }
}

for (const [cat, types] of [...catTypes.entries()].sort(([a],[b]) => a.localeCompare(b))) {
  console.log(`${cat}\t${[...types].join(', ')}`);
}
