import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMtlx } from './mtlx/parser.js';
import { validateMtlx } from './mtlx/validator.js';
import type { MtlxDocument, MtlxNode } from './mtlx/types.js';

type Rule = {
  file: string;
  nodeName: string;
  category: string;
  requiredInputs?: string[];
  missingInputs?: string[];
};

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TARGET_ROOT = join(__dirname, '..', 'materialx', 'Materials', 'TestSuite', 'd1_targets');

const RULES: Rule[] = [
  {
    file: 'facingratio_defaults.mtlx',
    nodeName: 'facingratio_default',
    category: 'facingratio',
    missingInputs: ['normal', 'view_position', 'invert'],
  },
  {
    file: 'facingratio_defaults.mtlx',
    nodeName: 'facingratio_invert',
    category: 'facingratio',
    requiredInputs: ['invert'],
    missingInputs: ['normal', 'view_position'],
  },
  {
    file: 'switch_out_of_range_defaults.mtlx',
    nodeName: 'switch_oob',
    category: 'switch',
    requiredInputs: ['which', 'in2', 'in3'],
    missingInputs: ['in1'],
  },
  {
    file: 'ifgreater_boolean_defaults.mtlx',
    nodeName: 'ifgreater_bool_default',
    category: 'ifgreater',
    requiredInputs: ['value1', 'value2'],
    missingInputs: ['in1', 'in2'],
  },
  {
    file: 'remap_mix_signatures.mtlx',
    nodeName: 'remap_v3_scalar',
    category: 'remap',
    requiredInputs: ['in', 'inlow', 'inhigh', 'outlow', 'outhigh'],
  },
  {
    file: 'remap_mix_signatures.mtlx',
    nodeName: 'mix_v3_scalar',
    category: 'mix',
    requiredInputs: ['fg', 'bg', 'mix'],
  },
  {
    file: 'remap_mix_signatures.mtlx',
    nodeName: 'mix_v3_v3',
    category: 'mix',
    requiredInputs: ['fg', 'bg', 'mix'],
  },
];

function collectMtlxFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...collectMtlxFiles(full));
    } else if (entry.endsWith('.mtlx')) {
      results.push(full);
    }
  }
  return results.sort();
}

function findNodeByName(doc: MtlxDocument, nodeName: string): MtlxNode | null {
  for (const ng of doc.nodegraphs) {
    for (const n of ng.nodes) {
      if (n.name === nodeName) return n;
    }
  }
  for (const n of doc.nodes) {
    if (n.name === nodeName) return n;
  }
  return null;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function main(): void {
  const files = collectMtlxFiles(TARGET_ROOT);
  console.log(`D1 target tests: ${files.length} file(s) under ${TARGET_ROOT}`);

  const docs = new Map<string, MtlxDocument>();

  for (const file of files) {
    const rel = relative(TARGET_ROOT, file).replace(/\\/g, '/');
    const xml = readFileSync(file, 'utf-8');
    const doc = parseMtlx(xml);
    const result = validateMtlx(doc);
    assert(result.valid, `Validation failed for ${rel}: ${result.issues.map(i => `${i.code}:${i.message}`).join(' | ')}`);
    docs.set(rel, doc);
    console.log(`  OK parse+validate: ${rel}`);
  }

  for (const rule of RULES) {
    const doc = docs.get(rule.file);
    assert(!!doc, `Missing parsed document for rule file ${rule.file}`);

    const node = findNodeByName(doc!, rule.nodeName);
    assert(!!node, `Node ${rule.nodeName} not found in ${rule.file}`);
    assert(node!.category === rule.category, `Node ${rule.nodeName} expected category ${rule.category}, got ${node!.category}`);

    const inputNames = new Set(node!.inputs.map(i => i.name));

    for (const req of rule.requiredInputs ?? []) {
      assert(inputNames.has(req), `Node ${rule.nodeName} in ${rule.file} missing required input '${req}'`);
    }
    for (const miss of rule.missingInputs ?? []) {
      assert(!inputNames.has(miss), `Node ${rule.nodeName} in ${rule.file} should omit input '${miss}'`);
    }

    console.log(`  OK rule: ${rule.file} :: ${rule.nodeName}`);
  }

  console.log('D1 target tests passed.');
}

main();
