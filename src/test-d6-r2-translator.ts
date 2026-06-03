import fs from 'node:fs/promises';
import path from 'node:path';
import { parseMtlx } from './mtlx/parser.js';
import {
  serializeRuntimeSceneAssignment,
  translateMtlxSceneAssignments,
  type RuntimeSceneAssignment,
} from './mtlx/sceneTranslator.js';

type FixtureResult = {
  file: string;
  lookCount: number;
  assignmentCount: number;
  activeLook: string | null;
  diagnostics: {
    error: number;
    warning: number;
    info: number;
  };
  preview?: {
    look: string;
    meshToMaterial: Record<string, string>;
  };
};

type D6R2Report = {
  generatedAt: string;
  schema: string;
  fixtures: FixtureResult[];
  totals: {
    files: number;
    withLooks: number;
    translatedLooks: number;
    assignments: number;
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
const REPORT_JSON = path.join(REPORT_DIR, 'mtlx-d6-r2-translation.json');
const REPORT_MD = path.join(REPORT_DIR, 'mtlx-d6-r2-translation.md');

const FIXTURES = [
  'materialx/Materials/TestSuite/stdlib/geometric/look_assignment_order.mtlx',
  'materialx/Materials/TestSuite/stdlib/materials/material_node_discovery.mtlx',
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

function countAssignments(scene: RuntimeSceneAssignment): number {
  return scene.looks.reduce((sum, look) => sum + Object.keys(look.meshToMaterial).length, 0);
}

function toMarkdown(report: D6R2Report): string {
  const lines: string[] = [];
  lines.push('# D6.R2 - Traducteur scene MaterialX vers runtime interne');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Schema: ${report.schema}`);
  lines.push('');
  lines.push('## Totaux');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---:|');
  lines.push(`| files | ${report.totals.files} |`);
  lines.push(`| files with looks | ${report.totals.withLooks} |`);
  lines.push(`| translated looks | ${report.totals.translatedLooks} |`);
  lines.push(`| total assignments | ${report.totals.assignments} |`);
  lines.push(`| diagnostics error | ${report.totals.diagnostics.error} |`);
  lines.push(`| diagnostics warning | ${report.totals.diagnostics.warning} |`);
  lines.push(`| diagnostics info | ${report.totals.diagnostics.info} |`);
  lines.push('');
  lines.push('## Fixtures');
  lines.push('');
  lines.push('| Fixture | Looks | Assignments | Active look | Errors | Warnings | Infos |');
  lines.push('|---|---:|---:|---|---:|---:|---:|');
  for (const f of report.fixtures) {
    lines.push(`| ${f.file} | ${f.lookCount} | ${f.assignmentCount} | ${f.activeLook ?? '-'} | ${f.diagnostics.error} | ${f.diagnostics.warning} | ${f.diagnostics.info} |`);
  }
  lines.push('');
  lines.push('## Determinisme');
  lines.push('');
  lines.push(`- Fixture: ${report.deterministicSerialization.fixture}`);
  lines.push(`- Double serialisation identique: ${report.deterministicSerialization.sameHashOnDoubleSerialization ? 'oui' : 'non'}`);
  lines.push('');
  lines.push('## Notes D6.R2');
  lines.push('');
  lines.push('- D6.R2.a: resolution geom + collection + wildcard appliquee au mesh catalog runtime.');
  lines.push('- D6.R2.b: priorite geree par ordre d application deterministic (heritage look puis ordre des materialassign).');
  lines.push('- D6.R2.c: serialisation stable JSON (`serializeRuntimeSceneAssignment`).');
  return lines.join('\n');
}

async function run(): Promise<void> {
  const generatedAt = new Date().toISOString();
  const fixtureResults: FixtureResult[] = [];

  let totalErrors = 0;
  let totalWarnings = 0;
  let totalInfos = 0;
  let totalLooks = 0;
  let totalAssignments = 0;
  let filesWithLooks = 0;

  let deterministicFixture = FIXTURES[0];
  let deterministicOk = true;

  for (const rel of FIXTURES) {
    const fullPath = path.join(ROOT, rel);
    const xml = await fs.readFile(fullPath, 'utf8');
    const doc = parseMtlx(xml);

    const meshCatalog = extractMeshCatalog(xml);
    const scene = translateMtlxSceneAssignments(doc, {
      meshCatalog,
      generatedAt,
    });

    if (doc.looks.length > 0) filesWithLooks += 1;
    totalLooks += scene.looks.length;

    const assignmentCount = countAssignments(scene);
    totalAssignments += assignmentCount;

    const diagError = scene.diagnostics.filter((d) => d.severity === 'error').length;
    const diagWarn = scene.diagnostics.filter((d) => d.severity === 'warning').length;
    const diagInfo = scene.diagnostics.filter((d) => d.severity === 'info').length;

    totalErrors += diagError;
    totalWarnings += diagWarn;
    totalInfos += diagInfo;

    fixtureResults.push({
      file: rel,
      lookCount: scene.looks.length,
      assignmentCount,
      activeLook: scene.activeLook,
      diagnostics: {
        error: diagError,
        warning: diagWarn,
        info: diagInfo,
      },
      preview: scene.looks[0]
        ? {
            look: scene.looks[0].look,
            meshToMaterial: scene.looks[0].meshToMaterial,
          }
        : undefined,
    });

    if (rel.includes('look_assignment_order.mtlx')) {
      const translatedLook = scene.looks.find((l) => l.look === 'Look');
      assert(Boolean(translatedLook), 'Expected look "Look" in look_assignment_order fixture.');
      const mapping = translatedLook!.meshToMaterial;
      assert(mapping['/Preview_Mesh'] === 'Blue_Material', 'Expected /Preview_Mesh to resolve to Blue_Material (last assignment wins).');
      assert(mapping['/Calibration_Mesh'] === 'Red_Material', 'Expected /Calibration_Mesh to resolve to Red_Material (last assignment wins).');
      deterministicFixture = rel;
      const s1 = serializeRuntimeSceneAssignment(scene);
      const s2 = serializeRuntimeSceneAssignment(scene);
      deterministicOk = stableHash(s1) === stableHash(s2);
    }
  }

  const report: D6R2Report = {
    generatedAt,
    schema: 'mtlx-scene-assignments-v1',
    fixtures: fixtureResults,
    totals: {
      files: FIXTURES.length,
      withLooks: filesWithLooks,
      translatedLooks: totalLooks,
      assignments: totalAssignments,
      diagnostics: {
        error: totalErrors,
        warning: totalWarnings,
        info: totalInfos,
      },
    },
    deterministicSerialization: {
      fixture: deterministicFixture,
      sameHashOnDoubleSerialization: deterministicOk,
    },
  };

  assert(report.deterministicSerialization.sameHashOnDoubleSerialization, 'Deterministic serialization check failed.');

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
  console.log('D6.R2 translation OK');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
