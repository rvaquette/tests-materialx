import fs from 'node:fs/promises';
import path from 'node:path';
import { parseMtlx } from './mtlx/parser.js';
import { validateMtlx } from './mtlx/validator.js';
import { translateMtlxSceneAssignments, serializeRuntimeSceneAssignment } from './mtlx/sceneTranslator.js';
import { resolveRuntimeMetadata, serializeRuntimeMetadataPackage } from './mtlx/metadataResolver.js';

type GoldenFixtureResult = {
  file: string;
  status: 'pass' | 'fail';
  checks: string[];
};

type NonRegressionFixtureResult = {
  file: string;
  status: 'pass' | 'fail';
  activeLook: string | null;
  lookCount: number;
  assignmentCount: number;
  diagnostics: {
    error: number;
    warning: number;
    info: number;
  };
  checks: string[];
};

type ExpectedErrorCaseResult = {
  caseId: string;
  status: 'pass' | 'fail';
  expected: string[];
  observed: string[];
  checks: string[];
};

type D6R7Report = {
  generatedAt: string;
  schema: 'mtlx-d6-r7-pipeline-tests-v1';
  sections: {
    golden: {
      fixtures: GoldenFixtureResult[];
      pass: number;
      fail: number;
    };
    nonRegression: {
      fixtures: NonRegressionFixtureResult[];
      pass: number;
      fail: number;
      deterministicSerialization: {
        fixture: string;
        sameHashOnDoubleSerialization: boolean;
      };
    };
    expectedErrors: {
      cases: ExpectedErrorCaseResult[];
      pass: number;
      fail: number;
    };
  };
  totals: {
    tests: number;
    pass: number;
    fail: number;
  };
};

const ROOT = path.resolve('D:/WebGL2/tests-materialx');
const REPORT_DIR = path.join(ROOT, 'reports');
const REPORT_JSON = path.join(REPORT_DIR, 'mtlx-d6-r7-pipeline.json');
const REPORT_MD = path.join(REPORT_DIR, 'mtlx-d6-r7-pipeline.md');

const GOLDEN_FIXTURES = {
  lookOrder: 'materialx/Materials/TestSuite/stdlib/geometric/look_assignment_order.mtlx',
  udim: 'materialx/Materials/TestSuite/stdlib/texture/udim.mtlx',
  tokenGraph: 'materialx/Materials/TestSuite/stdlib/texture/token_graph_material.mtlx',
};

const NON_REGRESSION_FIXTURES = {
  lookOrder: GOLDEN_FIXTURES.lookOrder,
  materialDiscovery: 'materialx/Materials/TestSuite/stdlib/materials/material_node_discovery.mtlx',
  chessSet: 'materialx/Materials/Examples/StandardSurface/standard_surface_chess_set.mtlx',
};

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

function countAssignments(looks: Array<{ meshToMaterial: Record<string, string> }>): number {
  return looks.reduce((sum, look) => sum + Object.keys(look.meshToMaterial).length, 0);
}

async function computePipeline(relFile: string, generatedAt: string): Promise<{
  scene: ReturnType<typeof translateMtlxSceneAssignments>;
  metadata: ReturnType<typeof resolveRuntimeMetadata>;
}> {
  const fullPath = path.join(ROOT, relFile);
  const xml = await fs.readFile(fullPath, 'utf8');
  const doc = parseMtlx(xml);
  const meshCatalog = extractMeshCatalog(xml);
  const scene = translateMtlxSceneAssignments(doc, { meshCatalog, generatedAt });
  const metadata = resolveRuntimeMetadata(doc, { sceneAssignments: scene, generatedAt });
  return { scene, metadata };
}

async function runGoldenTests(generatedAt: string): Promise<{
  fixtures: GoldenFixtureResult[];
  pass: number;
  fail: number;
}> {
  const results: GoldenFixtureResult[] = [];

  {
    const checks: string[] = [];
    let status: 'pass' | 'fail' = 'pass';
    try {
      const { scene } = await computePipeline(GOLDEN_FIXTURES.lookOrder, generatedAt);
      const look = scene.looks.find((l) => l.look === 'Look');
      assert(Boolean(look), 'Golden look fixture missing Look node.');
      assert(look!.meshToMaterial['/Preview_Mesh'] === 'Blue_Material', 'Golden mismatch on /Preview_Mesh final material.');
      assert(look!.meshToMaterial['/Calibration_Mesh'] === 'Red_Material', 'Golden mismatch on /Calibration_Mesh final material.');
      checks.push('mesh /Preview_Mesh -> Blue_Material');
      checks.push('mesh /Calibration_Mesh -> Red_Material');
    } catch (error) {
      status = 'fail';
      checks.push(String(error));
    }
    results.push({ file: GOLDEN_FIXTURES.lookOrder, status, checks });
  }

  {
    const checks: string[] = [];
    let status: 'pass' | 'fail' = 'pass';
    try {
      const { metadata } = await computePipeline(GOLDEN_FIXTURES.udim, generatedAt);
      const cubeMaterial = metadata.materialMetadata.find((m) => m.material === 'cube_material');
      assert(Boolean(cubeMaterial), 'Golden UDIM fixture missing cube_material metadata.');
      assert(cubeMaterial!.properties.some((p) => p.name === 'udimset' && p.type === 'stringarray'), 'Golden UDIM fixture missing udimset stringarray property.');
      checks.push('cube_material exists');
      checks.push('udimset stringarray propagated');
    } catch (error) {
      status = 'fail';
      checks.push(String(error));
    }
    results.push({ file: GOLDEN_FIXTURES.udim, status, checks });
  }

  {
    const checks: string[] = [];
    let status: 'pass' | 'fail' = 'pass';
    try {
      const { metadata } = await computePipeline(GOLDEN_FIXTURES.tokenGraph, generatedAt);
      assert(metadata.tokens.Brass_Image_Extension === 'jpg', 'Golden token fixture expected Brass_Image_Extension token value "jpg".');
      assert(metadata.unassignedProperties.some((p) => p.name === 'Brass_Image_Extension'), 'Golden token fixture missing unassigned token property Brass_Image_Extension.');
      checks.push('top-level token Brass_Image_Extension=jpg');
      checks.push('token mirrored into unassigned runtime properties');
    } catch (error) {
      status = 'fail';
      checks.push(String(error));
    }
    results.push({ file: GOLDEN_FIXTURES.tokenGraph, status, checks });
  }

  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.length - pass;
  return { fixtures: results, pass, fail };
}

async function runNonRegressionTests(generatedAt: string): Promise<{
  fixtures: NonRegressionFixtureResult[];
  pass: number;
  fail: number;
  deterministicSerialization: {
    fixture: string;
    sameHashOnDoubleSerialization: boolean;
  };
}> {
  const fixtures: NonRegressionFixtureResult[] = [];

  let deterministicFixture = NON_REGRESSION_FIXTURES.chessSet;
  let deterministicOk = true;

  for (const rel of Object.values(NON_REGRESSION_FIXTURES)) {
    const checks: string[] = [];
    let status: 'pass' | 'fail' = 'pass';
    let activeLook: string | null = null;
    let lookCount = 0;
    let assignmentCount = 0;
    let diagError = 0;
    let diagWarning = 0;
    let diagInfo = 0;

    try {
      const { scene, metadata } = await computePipeline(rel, generatedAt);
      activeLook = scene.activeLook;
      lookCount = scene.looks.length;
      assignmentCount = countAssignments(scene.looks);
      diagError = scene.diagnostics.filter((d) => d.severity === 'error').length + metadata.diagnostics.filter((d) => d.severity === 'error').length;
      diagWarning = scene.diagnostics.filter((d) => d.severity === 'warning').length + metadata.diagnostics.filter((d) => d.severity === 'warning').length;
      diagInfo = scene.diagnostics.filter((d) => d.severity === 'info').length + metadata.diagnostics.filter((d) => d.severity === 'info').length;

      if (rel === NON_REGRESSION_FIXTURES.lookOrder) {
        assert(scene.activeLook === 'Look', 'Non-regression look_order active look changed.');
        assert(assignmentCount === 2, 'Non-regression look_order assignment cardinality changed.');
        checks.push('active look remains Look');
        checks.push('resolved assignment cardinality remains 2');
      }

      if (rel === NON_REGRESSION_FIXTURES.materialDiscovery) {
        const hasCollectionEmptyWarning = scene.diagnostics.some((d) => d.code === 'D6R2-COLL-003');
        assert(hasCollectionEmptyWarning, 'Non-regression material_discovery expected D6R2-COLL-003 collection warning.');
        assert(scene.diagnostics.every((d) => d.severity !== 'error'), 'Non-regression material_discovery produced scene errors.');
        checks.push('collection-based assign still emits D6R2-COLL-003 warning');
        checks.push('no scene-level error regression');
      }

      if (rel === NON_REGRESSION_FIXTURES.chessSet) {
        assert(scene.activeLook === 'L_ChessSet', 'Non-regression chess_set active look changed.');
        assert(assignmentCount >= 15, 'Non-regression chess_set assignment coverage regressed.');
        checks.push('active look remains L_ChessSet');
        checks.push('at least 15 resolved assignments preserved');

        const sceneS1 = serializeRuntimeSceneAssignment(scene);
        const sceneS2 = serializeRuntimeSceneAssignment(scene);
        const metadataS1 = serializeRuntimeMetadataPackage(metadata);
        const metadataS2 = serializeRuntimeMetadataPackage(metadata);
        deterministicOk = stableHash(sceneS1 + metadataS1) === stableHash(sceneS2 + metadataS2);
        deterministicFixture = rel;
      }
    } catch (error) {
      status = 'fail';
      checks.push(String(error));
    }

    fixtures.push({
      file: rel,
      status,
      activeLook,
      lookCount,
      assignmentCount,
      diagnostics: {
        error: diagError,
        warning: diagWarning,
        info: diagInfo,
      },
      checks,
    });
  }

  const pass = fixtures.filter((f) => f.status === 'pass').length;
  const fail = fixtures.length - pass;

  return {
    fixtures,
    pass,
    fail,
    deterministicSerialization: {
      fixture: deterministicFixture,
      sameHashOnDoubleSerialization: deterministicOk,
    },
  };
}

function runExpectedErrorTests(): {
  cases: ExpectedErrorCaseResult[];
  pass: number;
  fail: number;
} {
  const cases: ExpectedErrorCaseResult[] = [];

  {
    const checks: string[] = [];
    let status: 'pass' | 'fail' = 'pass';
    const expected = ['NODE-001', 'NODE-002'];
    const observed: string[] = [];

    try {
      const doc = parseMtlx(
        '<?xml version="1.0"?>'
        + '<materialx version="1.39">'
        + '<standard_surface name="S" type="surfaceshader">'
        + '<input name="base_color" type="color3" nodename="missing_node"/>'
        + '<input name="specular_roughness" type="float" nodegraph="missing_graph"/>'
        + '</standard_surface>'
        + '</materialx>',
      );
      const result = validateMtlx(doc);
      for (const issue of result.issues) {
        if (issue.severity === 'error') observed.push(issue.code);
      }
      assert(observed.includes('NODE-001'), 'Missing expected NODE-001 unresolved nodename error.');
      assert(observed.includes('NODE-002'), 'Missing expected NODE-002 unresolved nodegraph error.');
      checks.push('Unresolved nodename is detected.');
      checks.push('Unresolved nodegraph is detected.');
    } catch (error) {
      status = 'fail';
      checks.push(String(error));
    }

    cases.push({
      caseId: 'invalid-node-references',
      status,
      expected,
      observed: [...new Set(observed)].sort((a, b) => a.localeCompare(b)),
      checks,
    });
  }

  {
    const checks: string[] = [];
    let status: 'pass' | 'fail' = 'pass';
    const expected = ['LOOK-001', 'LOOK-002'];
    const observed: string[] = [];

    try {
      const doc = parseMtlx(
        '<?xml version="1.0"?>'
        + '<materialx version="1.39">'
        + '<look name="L">'
        + '<materialassign name="a1" material="UnknownMaterial" collection="UnknownCollection"/>'
        + '</look>'
        + '</materialx>',
      );
      const result = validateMtlx(doc);
      for (const issue of result.issues) {
        if (issue.severity === 'error') observed.push(issue.code);
      }
      assert(observed.includes('LOOK-001'), 'Missing expected LOOK-001 error.');
      assert(observed.includes('LOOK-002'), 'Missing expected LOOK-002 error.');
      checks.push('Unknown material reference reported.');
      checks.push('Unknown collection reference reported.');
    } catch (error) {
      status = 'fail';
      checks.push(String(error));
    }

    cases.push({
      caseId: 'invalid-references',
      status,
      expected,
      observed: [...new Set(observed)].sort((a, b) => a.localeCompare(b)),
      checks,
    });
  }

  {
    const checks: string[] = [];
    let status: 'pass' | 'fail' = 'pass';
    const expected = ['DOC-001', 'ND-002'];
    const observed: string[] = [];

    try {
      const doc = parseMtlx('<?xml version="1.0"?><materialx><nodedef name="ND_Test" node="test"/></materialx>');
      const result = validateMtlx(doc);
      for (const issue of result.issues) observed.push(issue.code);
      assert(observed.includes('DOC-001'), 'Missing expected DOC-001 error for missing version.');
      assert(observed.includes('ND-002'), 'Missing expected ND-002 warning for nodedef without outputs.');
      checks.push('Missing version detected.');
      checks.push('Nodedef without output detected.');
    } catch (error) {
      status = 'fail';
      checks.push(String(error));
    }

    cases.push({
      caseId: 'incomplete-document',
      status,
      expected,
      observed: [...new Set(observed)].sort((a, b) => a.localeCompare(b)),
      checks,
    });
  }

  const pass = cases.filter((c) => c.status === 'pass').length;
  const fail = cases.length - pass;
  return { cases, pass, fail };
}

function toMarkdown(report: D6R7Report): string {
  const lines: string[] = [];
  lines.push('# D6.R7 - Tests pipeline D6');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Schema: ${report.schema}`);
  lines.push('');
  lines.push('## Totaux');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---:|');
  lines.push(`| tests | ${report.totals.tests} |`);
  lines.push(`| pass | ${report.totals.pass} |`);
  lines.push(`| fail | ${report.totals.fail} |`);
  lines.push('');
  lines.push('## D6.R7.a - Golden tests');
  lines.push('');
  lines.push(`- pass: ${report.sections.golden.pass}`);
  lines.push(`- fail: ${report.sections.golden.fail}`);
  lines.push('');
  lines.push('| Fixture | Status | Checks |');
  lines.push('|---|---|---|');
  for (const f of report.sections.golden.fixtures) {
    lines.push(`| ${f.file} | ${f.status} | ${f.checks.join(' ; ')} |`);
  }
  lines.push('');
  lines.push('## D6.R7.b - Non-regression scenes look/materialassign/collection');
  lines.push('');
  lines.push(`- pass: ${report.sections.nonRegression.pass}`);
  lines.push(`- fail: ${report.sections.nonRegression.fail}`);
  lines.push(`- deterministic fixture: ${report.sections.nonRegression.deterministicSerialization.fixture}`);
  lines.push(`- deterministic serialization: ${report.sections.nonRegression.deterministicSerialization.sameHashOnDoubleSerialization ? 'yes' : 'no'}`);
  lines.push('');
  lines.push('| Fixture | Status | Active look | Looks | Assignments | Errors | Warnings | Infos | Checks |');
  lines.push('|---|---|---|---:|---:|---:|---:|---:|---|');
  for (const f of report.sections.nonRegression.fixtures) {
    lines.push(`| ${f.file} | ${f.status} | ${f.activeLook ?? '-'} | ${f.lookCount} | ${f.assignmentCount} | ${f.diagnostics.error} | ${f.diagnostics.warning} | ${f.diagnostics.info} | ${f.checks.join(' ; ')} |`);
  }
  lines.push('');
  lines.push('## D6.R7.c - Erreurs attendues');
  lines.push('');
  lines.push(`- pass: ${report.sections.expectedErrors.pass}`);
  lines.push(`- fail: ${report.sections.expectedErrors.fail}`);
  lines.push('');
  lines.push('| Case | Status | Expected | Observed | Checks |');
  lines.push('|---|---|---|---|---|');
  for (const c of report.sections.expectedErrors.cases) {
    lines.push(`| ${c.caseId} | ${c.status} | ${c.expected.join(', ')} | ${c.observed.join(', ')} | ${c.checks.join(' ; ')} |`);
  }
  return lines.join('\n');
}

async function run(): Promise<void> {
  const generatedAt = new Date().toISOString();

  const golden = await runGoldenTests(generatedAt);
  const nonRegression = await runNonRegressionTests(generatedAt);
  const expectedErrors = runExpectedErrorTests();

  assert(nonRegression.deterministicSerialization.sameHashOnDoubleSerialization, 'D6.R7 non-regression deterministic serialization check failed.');

  const report: D6R7Report = {
    generatedAt,
    schema: 'mtlx-d6-r7-pipeline-tests-v1',
    sections: {
      golden,
      nonRegression,
      expectedErrors,
    },
    totals: {
      tests: golden.fixtures.length + nonRegression.fixtures.length + expectedErrors.cases.length,
      pass: golden.pass + nonRegression.pass + expectedErrors.pass,
      fail: golden.fail + nonRegression.fail + expectedErrors.fail,
    },
  };

  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(REPORT_MD, toMarkdown(report), 'utf8');

  console.log(
    JSON.stringify(
      {
        reportJson: REPORT_JSON,
        reportMd: REPORT_MD,
        totals: report.totals,
        nonRegressionDeterministic: report.sections.nonRegression.deterministicSerialization,
      },
      null,
      2,
    ),
  );

  if (report.totals.fail > 0) {
    throw new Error(`D6.R7 has ${report.totals.fail} failing tests.`);
  }

  console.log('D6.R7 pipeline tests OK');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
