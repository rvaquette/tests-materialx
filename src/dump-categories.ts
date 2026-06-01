/**
 * Dumps every distinct node category found across all .mtlx files, sorted.
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

const cats = new Set<string>();
for (const f of collect(ROOT)) {
  try {
    const doc = parseMtlx(readFileSync(f, 'utf-8'));
    for (const n of doc.nodes) cats.add(n.category);
    for (const g of doc.nodegraphs) for (const n of g.nodes) cats.add(n.category);
  } catch { /* skip */ }
}
console.log([...cats].sort().join('\n'));
