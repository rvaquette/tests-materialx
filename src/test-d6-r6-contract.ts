import fs from 'node:fs/promises';
import path from 'node:path';
import { parseMtlx } from './mtlx/parser.js';
import { translateMtlxSceneAssignments } from './mtlx/sceneTranslator.js';
import { resolveRuntimeMetadata } from './mtlx/metadataResolver.js';
import {
  buildRuntimeDataContract,
  loadRuntimeDataContract,
  serializeRuntimeDataContract,
  validateRuntimeDataContract,
  type RuntimeDataContract,
} from './mtlx/runtimeDataContract.js';

type FixtureSummary = {
  file: string;
  schema: string;
  activeLook: string | null;
  materials: number;
  textures: number;
  overrides: number;
  lights: number;
  envType: string;
  diagnostics: {
    error: number;
    warning: number;
    info: number;
  };
  validation: {
    valid: boolean;
    errors: number;
    warnings: number;
  };
  compatibility: {
    migratedLegacyInputs: boolean;
  };
};

type D6R6Report = {
  generatedAt: string;
  schema: string;
  fixtures: FixtureSummary[];
  totals: {
    files: number;
    materials: number;
    textures: number;
    overrides: number;
    lights: number;
    envEnabled: number;
    diagnostics: {
      error: number;
      warning: number;
      info: number;
    };
    validation: {
      valid: number;
      invalid: number;
      errors: number;
      warnings: number;
    };
    compatibility: {
      legacyInputMigrated: number;
      legacyLoadValidated: number;
    };
  };
  deterministicSerialization: {
    fixture: string;
    sameHashOnDoubleSerialization: boolean;
  };
};

const ROOT = path.resolve('D:/WebGL2/tests-materialx');
const REPORT_DIR = path.join(ROOT, 'reports');
const REPORT_JSON = path.join(REPORT_DIR, 'mtlx-d6-r6-contract.json');
const REPORT_MD = path.join(REPORT_DIR, 'mtlx-d6-r6-contract.md');

const FIXTURES = [
  'materialx/Materials/TestSuite/stdlib/texture/udim.mtlx',
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

function createLegacyLikeContract(contract: RuntimeDataContract): unknown {
  return {
    generatedAt: contract.generatedAt,
    scene: {
      activeLook: contract.scene.activeLook,
      meshCatalog: contract.scene.meshCatalog,
    },
    materials: contract.materials,
    lights: contract.lights,
    env: contract.env,
  };
}

function toMarkdown(report: D6R6Report): string {
  const lines: string[] = [];
  lines.push('# D6.R6 - Contrat de donnees runtime');
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
  lines.push(`| textures | ${report.totals.textures} |`);
  lines.push(`| overrides | ${report.totals.overrides} |`);
  lines.push(`| lights | ${report.totals.lights} |`);
  lines.push(`| env enabled | ${report.totals.envEnabled} |`);
  lines.push(`| diagnostics error | ${report.totals.diagnostics.error} |`);
  lines.push(`| diagnostics warning | ${report.totals.diagnostics.warning} |`);
  lines.push(`| diagnostics info | ${report.totals.diagnostics.info} |`);
  lines.push(`| validation valid | ${report.totals.validation.valid} |`);
  lines.push(`| validation invalid | ${report.totals.validation.invalid} |`);
  lines.push(`| validation errors | ${report.totals.validation.errors} |`);
  lines.push(`| validation warnings | ${report.totals.validation.warnings} |`);
  lines.push(`| legacy inputs migrated | ${report.totals.compatibility.legacyInputMigrated} |`);
  lines.push(`| legacy loads validated | ${report.totals.compatibility.legacyLoadValidated} |`);
  lines.push('');
  lines.push('## Fixtures');
  lines.push('');
  lines.push('| Fixture | Schema | Active look | Materials | Textures | Overrides | Lights | Env | Valid | Errors | Warnings | Legacy migrated |');
  lines.push('|---|---|---|---:|---:|---:|---:|---|---|---:|---:|---|');
  for (const f of report.fixtures) {
    lines.push(`| ${f.file} | ${f.schema} | ${f.activeLook ?? '-'} | ${f.materials} | ${f.textures} | ${f.overrides} | ${f.lights} | ${f.envType} | ${f.validation.valid ? 'oui' : 'non'} | ${f.validation.errors} | ${f.validation.warnings} | ${f.compatibility.migratedLegacyInputs ? 'oui' : 'non'} |`);
  }
  lines.push('');
  lines.push('## Determinisme');
  lines.push('');
  lines.push(`- Fixture: ${report.deterministicSerialization.fixture}`);
  lines.push(`- Double serialisation identique: ${report.deterministicSerialization.sameHashOnDoubleSerialization ? 'oui' : 'non'}`);
  lines.push('');
  lines.push('## Notes D6.R6');
  lines.push('');
  lines.push('- D6.R6.a: schema versionne `mtlx-d6-runtime-contract-v1` pour le payload runtime final (materials, textures, overrides, lights, env).');
  lines.push('- D6.R6.b: validation explicite (`validateRuntimeDataContract`) et gate pre-load (`loadRuntimeDataContract`).');
  lines.push('- D6.R6.c: compatibilite ascendante via migration des entrees legacy scene/metadata et chargement d un payload legacy partiel.');
  return lines.join('\n');
}

async function run(): Promise<void> {
  const generatedAt = new Date().toISOString();
  const fixtures: FixtureSummary[] = [];

  let totalMaterials = 0;
  let totalTextures = 0;
  let totalOverrides = 0;
  let totalLights = 0;
  let totalEnvEnabled = 0;
  let totalDiagError = 0;
  let totalDiagWarning = 0;
  let totalDiagInfo = 0;

  let totalValid = 0;
  let totalInvalid = 0;
  let totalValidationErrors = 0;
  let totalValidationWarnings = 0;

  let totalLegacyInputMigrated = 0;
  let totalLegacyLoadValidated = 0;

  let deterministicFixture = FIXTURES[0];
  let deterministicOk = true;

  for (const rel of FIXTURES) {
    const fullPath = path.join(ROOT, rel);
    const xml = await fs.readFile(fullPath, 'utf8');
    const doc = parseMtlx(xml);
    const meshCatalog = extractMeshCatalog(xml);

    const scene = translateMtlxSceneAssignments(doc, { meshCatalog, generatedAt });
    const metadata = resolveRuntimeMetadata(doc, { sceneAssignments: scene, generatedAt });

    const contract = buildRuntimeDataContract(scene, metadata, {
      generatedAt,
      env: {
        id: 'default_env',
        type: rel.includes('token_graph_material') ? 'latlong' : 'none',
        uri: rel.includes('token_graph_material') ? 'materialx/Lights/goegap.hdr' : undefined,
      },
    });

    const validation = validateRuntimeDataContract(contract);
    assert(validation.valid, `Runtime contract validation failed for ${rel}: ${validation.errors.join('; ')}`);

    const loaded = loadRuntimeDataContract(JSON.parse(serializeRuntimeDataContract(contract)), true);
    const loadedValidation = validateRuntimeDataContract(loaded);
    assert(loadedValidation.valid, `Pre-load validation gate failed for ${rel}.`);

    const legacyScene = {
      ...scene,
      schema: 'legacy-scene-assignment',
    };
    const legacyMetadata = {
      ...metadata,
      schema: 'legacy-runtime-metadata',
    };
    const migrated = buildRuntimeDataContract(legacyScene, legacyMetadata, { generatedAt });
    assert(migrated.compatibility.migratedLegacyInputs, `Legacy migration not detected for ${rel}.`);

    const legacyLoaded = loadRuntimeDataContract(createLegacyLikeContract(contract), true);
    const legacyLoadedValidation = validateRuntimeDataContract(legacyLoaded);
    assert(legacyLoadedValidation.valid, `Legacy pre-load adaptation failed for ${rel}.`);

    if (migrated.compatibility.migratedLegacyInputs) totalLegacyInputMigrated += 1;
    if (legacyLoadedValidation.valid) totalLegacyLoadValidated += 1;

    const diagError = contract.diagnostics.filter((d) => d.severity === 'error').length;
    const diagWarning = contract.diagnostics.filter((d) => d.severity === 'warning').length;
    const diagInfo = contract.diagnostics.filter((d) => d.severity === 'info').length;

    const envEnabled = contract.env.type !== 'none';
    if (envEnabled) totalEnvEnabled += 1;

    totalMaterials += contract.materials.length;
    totalTextures += contract.textures.length;
    totalOverrides += contract.overrides.propertyOverrides.length;
    totalLights += contract.lights.length;

    totalDiagError += diagError;
    totalDiagWarning += diagWarning;
    totalDiagInfo += diagInfo;

    if (validation.valid) totalValid += 1;
    else totalInvalid += 1;
    totalValidationErrors += validation.errors.length;
    totalValidationWarnings += validation.warnings.length;

    fixtures.push({
      file: rel,
      schema: contract.schema,
      activeLook: contract.scene.activeLook,
      materials: contract.materials.length,
      textures: contract.textures.length,
      overrides: contract.overrides.propertyOverrides.length,
      lights: contract.lights.length,
      envType: contract.env.type,
      diagnostics: {
        error: diagError,
        warning: diagWarning,
        info: diagInfo,
      },
      validation: {
        valid: validation.valid,
        errors: validation.errors.length,
        warnings: validation.warnings.length,
      },
      compatibility: {
        migratedLegacyInputs: migrated.compatibility.migratedLegacyInputs,
      },
    });

    if (rel.endsWith('/token_graph_material.mtlx')) {
      deterministicFixture = rel;
      const s1 = serializeRuntimeDataContract(contract);
      const s2 = serializeRuntimeDataContract(contract);
      deterministicOk = stableHash(s1) === stableHash(s2);
    }
  }

  const report: D6R6Report = {
    generatedAt,
    schema: 'mtlx-d6-runtime-contract-v1',
    fixtures,
    totals: {
      files: FIXTURES.length,
      materials: totalMaterials,
      textures: totalTextures,
      overrides: totalOverrides,
      lights: totalLights,
      envEnabled: totalEnvEnabled,
      diagnostics: {
        error: totalDiagError,
        warning: totalDiagWarning,
        info: totalDiagInfo,
      },
      validation: {
        valid: totalValid,
        invalid: totalInvalid,
        errors: totalValidationErrors,
        warnings: totalValidationWarnings,
      },
      compatibility: {
        legacyInputMigrated: totalLegacyInputMigrated,
        legacyLoadValidated: totalLegacyLoadValidated,
      },
    },
    deterministicSerialization: {
      fixture: deterministicFixture,
      sameHashOnDoubleSerialization: deterministicOk,
    },
  };

  assert(report.deterministicSerialization.sameHashOnDoubleSerialization, 'Deterministic serialization check failed for D6.R6.');

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
  console.log('D6.R6 runtime contract OK');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
