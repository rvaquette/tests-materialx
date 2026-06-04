import fs from 'node:fs/promises';
import path from 'node:path';
import {
  expandAndFlattenMtlxDocument,
  serializeExpandedMtlxPackage,
  type ExpandedMtlxPackage,
} from './mtlx/documentExpander.js';

type FixtureSummary = {
  file: string;
  documents: number;
  includesRequested: number;
  includesResolved: number;
  includesMissing: number;
  includeCycles: number;
  references: {
    total: number;
    unresolved: number;
  };
  diagnostics: {
    error: number;
    warning: number;
    info: number;
  };
};

type D6R4Report = {
  generatedAt: string;
  schema: string;
  fixtures: FixtureSummary[];
  totals: {
    files: number;
    documents: number;
    includesRequested: number;
    includesResolved: number;
    includesMissing: number;
    includeCycles: number;
    unresolvedReferences: number;
    diagnostics: {
      error: number;
      warning: number;
      info: number;
    };
  };
  deterministicSerialization: {
    fixture: string;
    sameHashOnDoubleSerialization: boolean;
  };
};

const ROOT = path.resolve('D:/WebGL2/tests-materialx');
const REPORT_DIR = path.join(ROOT, 'reports');
const REPORT_JSON = path.join(REPORT_DIR, 'mtlx-d6-r4-expansion.json');
const REPORT_MD = path.join(REPORT_DIR, 'mtlx-d6-r4-expansion.md');

const FIXTURES = [
  'materialx/Materials/TestSuite/libraries/metal/brass_wire_mesh.mtlx',
  'materialx/Materials/TestSuite/stdlib/geometric/look_assignment_order.mtlx',
  'materialx/Materials/Examples/StandardSurface/standard_surface_chess_set.mtlx',
];

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

function diagCounts(pkg: ExpandedMtlxPackage): { error: number; warning: number; info: number } {
  return {
    error: pkg.diagnostics.filter((d) => d.severity === 'error').length,
    warning: pkg.diagnostics.filter((d) => d.severity === 'warning').length,
    info: pkg.diagnostics.filter((d) => d.severity === 'info').length,
  };
}

function toMarkdown(report: D6R4Report): string {
  const lines: string[] = [];
  lines.push('# D6.R4 - Pipeline d expansion / flattening document');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Schema: ${report.schema}`);
  lines.push('');
  lines.push('## Totaux');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---:|');
  lines.push(`| files | ${report.totals.files} |`);
  lines.push(`| expanded documents | ${report.totals.documents} |`);
  lines.push(`| includes requested | ${report.totals.includesRequested} |`);
  lines.push(`| includes resolved | ${report.totals.includesResolved} |`);
  lines.push(`| includes missing | ${report.totals.includesMissing} |`);
  lines.push(`| include cycles | ${report.totals.includeCycles} |`);
  lines.push(`| unresolved references | ${report.totals.unresolvedReferences} |`);
  lines.push(`| diagnostics error | ${report.totals.diagnostics.error} |`);
  lines.push(`| diagnostics warning | ${report.totals.diagnostics.warning} |`);
  lines.push(`| diagnostics info | ${report.totals.diagnostics.info} |`);
  lines.push('');
  lines.push('## Fixtures');
  lines.push('');
  lines.push('| Fixture | Docs | Inc req | Inc ok | Inc miss | Inc cycle | Refs | Unresolved | Errors | Warnings | Infos |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const f of report.fixtures) {
    lines.push(
      `| ${f.file} | ${f.documents} | ${f.includesRequested} | ${f.includesResolved} | ${f.includesMissing} | ${f.includeCycles} | ${f.references.total} | ${f.references.unresolved} | ${f.diagnostics.error} | ${f.diagnostics.warning} | ${f.diagnostics.info} |`,
    );
  }
  lines.push('');
  lines.push('## Determinisme');
  lines.push('');
  lines.push(`- Fixture: ${report.deterministicSerialization.fixture}`);
  lines.push(`- Double serialisation identique: ${report.deterministicSerialization.sameHashOnDoubleSerialization ? 'oui' : 'non'}`);
  lines.push('');
  lines.push('## Notes D6.R4');
  lines.push('');
  lines.push('- D6.R4.a: expansion recursive des includes avec protection anti cycles et diagnostics explicites.');
  lines.push('- D6.R4.b: canonicalisation des scopes et noms (`scope::name`) pour looks et nodegraphs.');
  lines.push('- D6.R4.c: emission d un artefact intermediaire inspectable et deterministe (JSON + markdown).');
  return lines.join('\n');
}

async function run(): Promise<void> {
  const generatedAt = new Date().toISOString();
  const fixtureResults: FixtureSummary[] = [];

  let totalDocuments = 0;
  let totalRequested = 0;
  let totalResolved = 0;
  let totalMissing = 0;
  let totalCycles = 0;
  let totalUnresolvedRefs = 0;
  let totalError = 0;
  let totalWarning = 0;
  let totalInfo = 0;

  let deterministicFixture = FIXTURES[0];
  let deterministicOk = true;

  for (const rel of FIXTURES) {
    const fullPath = path.join(ROOT, rel);
    const pkg = await expandAndFlattenMtlxDocument(fullPath);
    const diags = diagCounts(pkg);

    fixtureResults.push({
      file: rel,
      documents: pkg.expandedTotals.documents,
      includesRequested: pkg.includeSummary.requested,
      includesResolved: pkg.includeSummary.resolved,
      includesMissing: pkg.includeSummary.missing,
      includeCycles: pkg.includeSummary.cycles,
      references: {
        total: pkg.references.total,
        unresolved: pkg.references.unresolved,
      },
      diagnostics: diags,
    });

    totalDocuments += pkg.expandedTotals.documents;
    totalRequested += pkg.includeSummary.requested;
    totalResolved += pkg.includeSummary.resolved;
    totalMissing += pkg.includeSummary.missing;
    totalCycles += pkg.includeSummary.cycles;
    totalUnresolvedRefs += pkg.references.unresolved;
    totalError += diags.error;
    totalWarning += diags.warning;
    totalInfo += diags.info;

    if (rel.endsWith('/brass_wire_mesh.mtlx')) {
      assert(pkg.includeSummary.requested > 0, 'Expected at least one include in brass_wire_mesh fixture.');
      assert(pkg.includeSummary.resolved > 0, 'Expected include resolution in brass_wire_mesh fixture.');
      assert(pkg.expandedTotals.documents >= 2, 'Expected include expansion to load at least two documents.');
      deterministicFixture = rel;
      const s1 = serializeExpandedMtlxPackage(pkg);
      const s2 = serializeExpandedMtlxPackage(pkg);
      deterministicOk = stableHash(s1) === stableHash(s2);
    }

    if (rel.endsWith('/look_assignment_order.mtlx')) {
      assert(pkg.canonical.looks.length > 0, 'Expected look entries in look_assignment_order fixture.');
      assert(pkg.references.total >= 0, 'Reference accounting should be available for look fixture.');
    }
  }

  const report: D6R4Report = {
    generatedAt,
    schema: 'mtlx-d6-r4-expanded-v1',
    fixtures: fixtureResults,
    totals: {
      files: FIXTURES.length,
      documents: totalDocuments,
      includesRequested: totalRequested,
      includesResolved: totalResolved,
      includesMissing: totalMissing,
      includeCycles: totalCycles,
      unresolvedReferences: totalUnresolvedRefs,
      diagnostics: {
        error: totalError,
        warning: totalWarning,
        info: totalInfo,
      },
    },
    deterministicSerialization: {
      fixture: deterministicFixture,
      sameHashOnDoubleSerialization: deterministicOk,
    },
  };

  assert(report.deterministicSerialization.sameHashOnDoubleSerialization, 'Deterministic serialization check failed for D6.R4.');

  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(REPORT_MD, toMarkdown(report), 'utf8');

  console.log(
    JSON.stringify(
      {
        reportJson: REPORT_JSON,
        reportMd: REPORT_MD,
        totals: report.totals,
        deterministicSerialization: report.deterministicSerialization,
      },
      null,
      2,
    ),
  );
  console.log('D6.R4 expansion OK');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
