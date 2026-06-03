import fs from 'node:fs/promises';
import path from 'node:path';
import { parseMtlx } from './mtlx/parser.js';
import { translateMtlxSceneAssignments } from './mtlx/sceneTranslator.js';
import { resolveRuntimeMetadata, serializeRuntimeMetadataPackage } from './mtlx/metadataResolver.js';

type FixtureSummary = {
  file: string;
  activeLook: string | null;
  materials: number;
  mappedProperties: number;
  unassignedProperties: number;
  diagnostics: {
    error: number;
    warning: number;
    info: number;
  };
};

type D6R3Report = {
  generatedAt: string;
  schema: string;
  fixtures: FixtureSummary[];
  totals: {
    files: number;
    materials: number;
    mappedProperties: number;
    unassignedProperties: number;
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
const REPORT_JSON = path.join(REPORT_DIR, 'mtlx-d6-r3-metadata.json');
const REPORT_MD = path.join(REPORT_DIR, 'mtlx-d6-r3-metadata.md');

const FIXTURES = [
  'materialx/Materials/TestSuite/stdlib/texture/udim.mtlx',
  'materialx/Materials/TestSuite/stdlib/upgrade/syntax_1_36.mtlx',
  'materialx/Materials/TestSuite/stdlib/texture/token_graph_material.mtlx',
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

function extractMeshCatalog(xml: string): string[] {
  const meshSet = new Set<string>();
  const geomAttr = /\bgeom\s*=\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = geomAttr.exec(xml)) !== null) {
    for (const token of m[1].split(',').map((t) => t.trim()).filter(Boolean)) {
      if (token.includes('*')) continue;
      meshSet.add(token);
    }
  }
  if (meshSet.size === 0) {
    meshSet.add('/Preview_Mesh');
    meshSet.add('/Calibration_Mesh');
  }
  return [...meshSet].sort((a, b) => a.localeCompare(b));
}

function countMappedProperties(pkg: ReturnType<typeof resolveRuntimeMetadata>): number {
  return pkg.materialMetadata.reduce((sum, m) => sum + m.properties.length, 0);
}

function toMarkdown(report: D6R3Report): string {
  const lines: string[] = [];
  lines.push('# D6.R3 - Resolution des proprietes et metadata hors shader');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Schema: ${report.schema}`);
  lines.push('');
  lines.push('## Totaux');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---:|');
  lines.push(`| files | ${report.totals.files} |`);
  lines.push(`| materials | ${report.totals.materials} |`);
  lines.push(`| mapped properties | ${report.totals.mappedProperties} |`);
  lines.push(`| unassigned properties | ${report.totals.unassignedProperties} |`);
  lines.push(`| diagnostics error | ${report.totals.diagnostics.error} |`);
  lines.push(`| diagnostics warning | ${report.totals.diagnostics.warning} |`);
  lines.push(`| diagnostics info | ${report.totals.diagnostics.info} |`);
  lines.push('');
  lines.push('## Fixtures');
  lines.push('');
  lines.push('| Fixture | Active look | Materials | Mapped props | Unassigned props | Errors | Warnings | Infos |');
  lines.push('|---|---|---:|---:|---:|---:|---:|---:|');
  for (const f of report.fixtures) {
    lines.push(`| ${f.file} | ${f.activeLook ?? '-'} | ${f.materials} | ${f.mappedProperties} | ${f.unassignedProperties} | ${f.diagnostics.error} | ${f.diagnostics.warning} | ${f.diagnostics.info} |`);
  }
  lines.push('');
  lines.push('## Determinisme');
  lines.push('');
  lines.push(`- Fixture: ${report.deterministicSerialization.fixture}`);
  lines.push(`- Double serialisation identique: ${report.deterministicSerialization.sameHashOnDoubleSerialization ? 'oui' : 'non'}`);
  lines.push('');
  lines.push('## Notes D6.R3');
  lines.push('');
  lines.push('- D6.R3.a: normalisation des unites angle/distance vers radian/metre quand possible.');
  lines.push('- D6.R3.b: propagation des metadonnees vers materiaux via look actif et mapping mesh->material D6.R2.');
  lines.push('- D6.R3.c: journal des proprietes non mappees et diagnostics de references/tokens non resolus.');
  return lines.join('\n');
}

async function run(): Promise<void> {
  const generatedAt = new Date().toISOString();
  const fixtureResults: FixtureSummary[] = [];

  let totalMaterials = 0;
  let totalMappedProps = 0;
  let totalUnassigned = 0;
  let totalError = 0;
  let totalWarning = 0;
  let totalInfo = 0;

  let deterministicFixture = FIXTURES[0];
  let deterministicOk = true;

  for (const rel of FIXTURES) {
    const fullPath = path.join(ROOT, rel);
    const xml = await fs.readFile(fullPath, 'utf8');
    const doc = parseMtlx(xml);
    const meshCatalog = extractMeshCatalog(xml);

    const scene = translateMtlxSceneAssignments(doc, { meshCatalog, generatedAt });
    const metadata = resolveRuntimeMetadata(doc, { sceneAssignments: scene, generatedAt });

    const mappedProperties = countMappedProperties(metadata);
    const unassignedProperties = metadata.unassignedProperties.length;

    const diagError = metadata.diagnostics.filter((d) => d.severity === 'error').length;
    const diagWarning = metadata.diagnostics.filter((d) => d.severity === 'warning').length;
    const diagInfo = metadata.diagnostics.filter((d) => d.severity === 'info').length;

    totalMaterials += metadata.materialMetadata.length;
    totalMappedProps += mappedProperties;
    totalUnassigned += unassignedProperties;
    totalError += diagError;
    totalWarning += diagWarning;
    totalInfo += diagInfo;

    fixtureResults.push({
      file: rel,
      activeLook: metadata.activeLook,
      materials: metadata.materialMetadata.length,
      mappedProperties,
      unassignedProperties,
      diagnostics: {
        error: diagError,
        warning: diagWarning,
        info: diagInfo,
      },
    });

    if (rel.endsWith('/udim.mtlx')) {
      const cube = metadata.materialMetadata.find((m) => m.material === 'cube_material');
      assert(Boolean(cube), 'Expected cube_material metadata in udim fixture.');
      assert(cube!.properties.some((p) => p.name === 'udimset'), 'Expected udimset propagated to cube_material.');
    }

    if (rel.endsWith('/token_graph_material.mtlx')) {
      assert(Object.keys(metadata.tokens).length > 0, 'Expected at least one top-level token in token fixture.');
      deterministicFixture = rel;
      const s1 = serializeRuntimeMetadataPackage(metadata);
      const s2 = serializeRuntimeMetadataPackage(metadata);
      deterministicOk = stableHash(s1) === stableHash(s2);
    }
  }

  const report: D6R3Report = {
    generatedAt,
    schema: 'mtlx-d6-r3-runtime-metadata-v1',
    fixtures: fixtureResults,
    totals: {
      files: FIXTURES.length,
      materials: totalMaterials,
      mappedProperties: totalMappedProps,
      unassignedProperties: totalUnassigned,
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

  assert(report.deterministicSerialization.sameHashOnDoubleSerialization, 'Deterministic serialization check failed for D6.R3.');

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
  console.log('D6.R3 metadata resolution OK');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
