/**
 * Test runner: parses and validates every .mtlx file found under materialx/
 * and prints a structured report to stdout.
 *
 * Run with:
 *   npx tsx src/test-mtlx.ts
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMtlx } from './mtlx/parser.js';
import { validateMtlx } from './mtlx/validator.js';
import type { ValidationIssue } from './mtlx/validator.js';
import type { MtlxDocument } from './mtlx/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', 'materialx');

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

// ---------------------------------------------------------------------------
// Per-file statistics
// ---------------------------------------------------------------------------

interface FileStats {
  path: string;
  relPath: string;
  parseOk: boolean;
  parseError?: string;
  doc?: MtlxDocument;
  valid?: boolean;
  hasXInclude?: boolean;
  errorCount: number;
  warnCount: number;
  infoCount: number;
  issues: ValidationIssue[];
  /** Summary of the document's node-graph topology. */
  topology?: TopologySummary;
}

interface TopologySummary {
  version: string;
  topLevelNodes: number;
  nodegraphs: number;
  nodedefs: number;
  implementations: number;
  typedefs: number;
  looks: number;
  collections: number;
  totalGraphNodes: number;
  categories: string[];   // distinct node categories used
}

function summariseTopology(doc: MtlxDocument): TopologySummary {
  const categories = new Set<string>();
  for (const n of doc.nodes) categories.add(n.category);
  for (const ng of doc.nodegraphs) {
    for (const n of ng.nodes) categories.add(n.category);
  }
  const totalGraphNodes = doc.nodegraphs.reduce((s, g) => s + g.nodes.length, 0);
  return {
    version: doc.version,
    topLevelNodes: doc.nodes.length,
    nodegraphs: doc.nodegraphs.length,
    nodedefs: doc.nodedefs.length,
    implementations: doc.implementations.length,
    typedefs: doc.typedefs.length,
    looks: doc.looks.length,
    collections: doc.collections.length,
    totalGraphNodes,
    categories: [...categories].sort(),
  };
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

const ANSI = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  green:  '\x1b[32m',
  cyan:   '\x1b[36m',
  grey:   '\x1b[90m',
};

function colorSeverity(sev: ValidationIssue['severity']): string {
  switch (sev) {
    case 'error':   return ANSI.red;
    case 'warning': return ANSI.yellow;
    case 'info':    return ANSI.grey;
  }
}

function printFileReport(stats: FileStats): void {
  const rel = stats.relPath.replace(/\\/g, '/');

  if (!stats.parseOk) {
    console.log(`${ANSI.red}${ANSI.bold}[PARSE ERROR]${ANSI.reset} ${rel}`);
    console.log(`  ${ANSI.red}${stats.parseError}${ANSI.reset}`);
    return;
  }

  const valid = stats.valid ? `${ANSI.green}OK${ANSI.reset}` : `${ANSI.red}FAIL${ANSI.reset}`;
  const xi = stats.hasXInclude ? ` ${ANSI.cyan}[xi:include]${ANSI.reset}` : '';
  const counts = [
    stats.errorCount > 0 ? `${ANSI.red}${stats.errorCount}E${ANSI.reset}` : '',
    stats.warnCount  > 0 ? `${ANSI.yellow}${stats.warnCount}W${ANSI.reset}` : '',
    stats.infoCount  > 0 ? `${ANSI.grey}${stats.infoCount}I${ANSI.reset}` : '',
  ].filter(Boolean).join(' ');

  console.log(`${ANSI.bold}[${valid}]${ANSI.reset} ${rel}${xi}  ${counts}`);

  // Topology line
  if (stats.topology) {
    const t = stats.topology;
    const parts: string[] = [`v${t.version}`];
    if (t.topLevelNodes)    parts.push(`nodes:${t.topLevelNodes}`);
    if (t.nodegraphs)       parts.push(`graphs:${t.nodegraphs}(${t.totalGraphNodes}n)`);
    if (t.nodedefs)         parts.push(`defs:${t.nodedefs}`);
    if (t.implementations)  parts.push(`impls:${t.implementations}`);
    if (t.typedefs)         parts.push(`typedefs:${t.typedefs}`);
    if (t.looks)            parts.push(`looks:${t.looks}`);
    if (t.collections)      parts.push(`colls:${t.collections}`);
    if (t.categories.length) parts.push(`cats:[${t.categories.join(',')}]`);
    console.log(`  ${ANSI.cyan}${parts.join('  ')}${ANSI.reset}`);
  }

  // Issues
  for (const issue of stats.issues) {
    const col = colorSeverity(issue.severity);
    const sev = issue.severity.toUpperCase().padEnd(7);
    console.log(`  ${col}${sev}${ANSI.reset} [${ANSI.bold}${issue.code}${ANSI.reset}] ${issue.path}`);
    console.log(`  ${' '.repeat(9)}${issue.message}`);
  }
}

// ---------------------------------------------------------------------------
// Summary table
// ---------------------------------------------------------------------------

function printSummary(all: FileStats[]): void {
  const total   = all.length;
  const parseOk = all.filter(s => s.parseOk).length;
  const valid   = all.filter(s => s.valid).length;
  const errors  = all.reduce((n, s) => n + s.errorCount, 0);
  const warns   = all.reduce((n, s) => n + s.warnCount, 0);
  const infos   = all.reduce((n, s) => n + s.infoCount, 0);

  const allCategories = new Set<string>();
  for (const s of all) {
    if (s.topology) s.topology.categories.forEach(c => allCategories.add(c));
  }

  console.log('');
  console.log('='.repeat(72));
  console.log(`${ANSI.bold}SUMMARY${ANSI.reset}`);
  console.log('='.repeat(72));
  console.log(`  Files processed : ${total}`);
  console.log(`  Parse success   : ${parseOk} / ${total}`);
  console.log(`  Logically valid : ${valid} / ${parseOk}`);
  console.log(`  Errors          : ${ANSI.red}${errors}${ANSI.reset}`);
  console.log(`  Warnings        : ${ANSI.yellow}${warns}${ANSI.reset}`);
  console.log(`  Infos           : ${ANSI.grey}${infos}${ANSI.reset}`);
  console.log(`  Distinct node categories (${allCategories.size}):`);
  const sortedCats = [...allCategories].sort();
  for (let i = 0; i < sortedCats.length; i += 6) {
    console.log('    ' + sortedCats.slice(i, i + 6).join('  '));
  }
  console.log('='.repeat(72));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const files = collectMtlxFiles(ROOT);
  console.log(`${ANSI.bold}MaterialX Logical Validator${ANSI.reset} — ${files.length} files found under ${ROOT}`);
  console.log('');

  const allStats: FileStats[] = [];

  for (const file of files) {
    const relPath = relative(ROOT, file);
    const stats: FileStats = {
      path: file,
      relPath,
      parseOk: false,
      errorCount: 0,
      warnCount: 0,
      infoCount: 0,
      issues: [],
    };

    // 1. Parse
    try {
      const xml = readFileSync(file, 'utf-8');
      const doc = parseMtlx(xml);
      stats.parseOk = true;
      stats.doc = doc;
      stats.topology = summariseTopology(doc);

      // 2. Validate
      const result = validateMtlx(doc);
      stats.valid = result.valid;
      stats.hasXInclude = result.hasXInclude;
      stats.issues = result.issues;
      stats.errorCount = result.issues.filter(i => i.severity === 'error').length;
      stats.warnCount  = result.issues.filter(i => i.severity === 'warning').length;
      stats.infoCount  = result.issues.filter(i => i.severity === 'info').length;
    } catch (err) {
      stats.parseOk = false;
      stats.parseError = String(err);
    }

    printFileReport(stats);
    allStats.push(stats);
  }

  printSummary(allStats);

  // Exit with non-zero code if any file has parse errors or logic errors
  const hasErrors = allStats.some(s => !s.parseOk || !s.valid);
  process.exitCode = hasErrors ? 1 : 0;
}

main();
