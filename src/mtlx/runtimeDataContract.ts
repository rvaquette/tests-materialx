import type { RuntimeSceneAssignment } from './sceneTranslator.js';
import type { RuntimeMetadataPackage, RuntimePropertyValue } from './metadataResolver.js';

export type RuntimeContractSeverity = 'info' | 'warning' | 'error';

export interface RuntimeContractDiagnostic {
  severity: RuntimeContractSeverity;
  code: string;
  message: string;
  ref?: string;
}

export interface RuntimeMaterialContract {
  material: string;
  meshes: string[];
  properties: RuntimePropertyValue[];
}

export interface RuntimeTextureContract {
  id: string;
  uri: string;
  source: 'token' | 'property';
}

export interface RuntimeOverridesContract {
  meshMaterialOverrides: Record<string, string>;
  propertyOverrides: Array<{
    material: string;
    name: string;
    value: string;
  }>;
}

export interface RuntimeLightContract {
  id: string;
  type: string;
  enabled: boolean;
}

export interface RuntimeEnvironmentContract {
  id: string;
  type: 'none' | 'latlong';
  uri?: string;
}

export interface RuntimeDataContract {
  schema: 'mtlx-d6-runtime-contract-v1';
  generatedAt: string;
  sourceSchemas: {
    sceneAssignments: string;
    metadata: string;
  };
  compatibility: {
    migratedLegacyInputs: boolean;
    acceptedLegacySchemas: string[];
  };
  scene: {
    activeLook: string | null;
    meshCatalog: string[];
  };
  materials: RuntimeMaterialContract[];
  textures: RuntimeTextureContract[];
  overrides: RuntimeOverridesContract;
  lights: RuntimeLightContract[];
  env: RuntimeEnvironmentContract;
  diagnostics: RuntimeContractDiagnostic[];
}

export interface RuntimeContractValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface BuildRuntimeDataContractOptions {
  generatedAt?: string;
  overrides?: Partial<RuntimeOverridesContract>;
  lights?: RuntimeLightContract[];
  env?: RuntimeEnvironmentContract;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function cloneProperties(properties: RuntimePropertyValue[]): RuntimePropertyValue[] {
  return [...properties].map((p) => ({
    ...p,
    source: { ...p.source },
  }));
}

function stableSortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function guessTextures(metadata: RuntimeMetadataPackage): RuntimeTextureContract[] {
  const textures = new Map<string, RuntimeTextureContract>();

  for (const [name, value] of Object.entries(metadata.tokens)) {
    if (typeof value !== 'string') continue;
    const lower = value.toLowerCase();
    const looksLikeTexture =
      lower.endsWith('.png')
      || lower.endsWith('.jpg')
      || lower.endsWith('.jpeg')
      || lower.endsWith('.exr')
      || lower.endsWith('.hdr')
      || lower.endsWith('.tif')
      || lower.endsWith('.tiff');
    if (!looksLikeTexture) continue;

    textures.set(`token:${name}`, {
      id: `token:${name}`,
      uri: value,
      source: 'token',
    });
  }

  for (const material of metadata.materialMetadata) {
    for (const property of material.properties) {
      const raw = property.rawValue ?? '';
      const lower = raw.toLowerCase();
      const looksLikeTexture =
        lower.endsWith('.png')
        || lower.endsWith('.jpg')
        || lower.endsWith('.jpeg')
        || lower.endsWith('.exr')
        || lower.endsWith('.hdr')
        || lower.endsWith('.tif')
        || lower.endsWith('.tiff');
      if (!looksLikeTexture) continue;

      const id = `property:${material.material}:${property.name}`;
      textures.set(id, {
        id,
        uri: raw,
        source: 'property',
      });
    }
  }

  return [...textures.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeSceneLike(input: unknown): { scene: RuntimeSceneAssignment; migrated: boolean } {
  if (!isRecord(input)) {
    throw new Error('Invalid scene assignments input: expected object.');
  }

  const schema = typeof input.schema === 'string' ? input.schema : 'legacy-scene-assignment';
  const meshCatalog = stableSortedUnique(toStringArray(input.meshCatalog));
  const looksRaw = Array.isArray(input.looks) ? input.looks : [];
  const diagnosticsRaw = Array.isArray(input.diagnostics) ? input.diagnostics : [];

  const looks = looksRaw
    .filter(isRecord)
    .map((look): RuntimeSceneAssignment['looks'][number] => {
      const meshToMaterialRaw = isRecord(look.meshToMaterial) ? look.meshToMaterial : {};
      const meshToMaterial: Record<string, string> = {};
      for (const [k, v] of Object.entries(meshToMaterialRaw)) {
        if (typeof v === 'string') meshToMaterial[k] = v;
      }

      const tracesRaw = Array.isArray(look.traces) ? look.traces : [];
      const traces = tracesRaw
        .filter(isRecord)
        .map((trace, index) => ({
          index: typeof trace.index === 'number' ? trace.index : index,
          sourceLook: typeof trace.sourceLook === 'string' ? trace.sourceLook : (typeof look.look === 'string' ? look.look : 'unknown'),
          assignName: typeof trace.assignName === 'string' ? trace.assignName : `assign_${index}`,
          material: typeof trace.material === 'string' ? trace.material : 'unknown_material',
          targets: toStringArray(trace.targets),
          selectors: toStringArray(trace.selectors),
          fromCollection: typeof trace.fromCollection === 'string' ? trace.fromCollection : undefined,
          fromGeom: typeof trace.fromGeom === 'string' ? trace.fromGeom : undefined,
        }));

      return {
        look: typeof look.look === 'string' ? look.look : 'Look',
        inheritedChain: toStringArray(look.inheritedChain),
        meshToMaterial,
        traces,
      };
    });

  const diagnostics = diagnosticsRaw
    .filter(isRecord)
    .map((d): RuntimeSceneAssignment['diagnostics'][number] => ({
      severity: d.severity === 'error' || d.severity === 'warning' || d.severity === 'info' ? d.severity : 'info',
      code: typeof d.code === 'string' ? d.code : 'D6R6-SCENE-INFO',
      message: typeof d.message === 'string' ? d.message : 'Legacy diagnostic migrated.',
      look: typeof d.look === 'string' ? d.look : undefined,
      assign: typeof d.assign === 'string' ? d.assign : undefined,
      ref: typeof d.ref === 'string' ? d.ref : undefined,
    }));

  const scene: RuntimeSceneAssignment = {
    schema: 'mtlx-scene-assignments-v1',
    generatedAt: typeof input.generatedAt === 'string' ? input.generatedAt : new Date().toISOString(),
    activeLook: typeof input.activeLook === 'string' || input.activeLook === null
      ? input.activeLook
      : (looks[0]?.look ?? null),
    meshCatalog,
    looks,
    diagnostics,
  };

  return {
    scene,
    migrated: schema !== 'mtlx-scene-assignments-v1',
  };
}

function normalizeMetadataLike(input: unknown): { metadata: RuntimeMetadataPackage; migrated: boolean } {
  if (!isRecord(input)) {
    throw new Error('Invalid metadata input: expected object.');
  }

  const schema = typeof input.schema === 'string' ? input.schema : 'legacy-runtime-metadata';
  const tokensRaw = isRecord(input.tokens) ? input.tokens : {};
  const tokens: Record<string, string> = {};
  for (const [k, v] of Object.entries(tokensRaw)) {
    if (typeof v === 'string') tokens[k] = v;
  }

  const materialsRaw = Array.isArray(input.materialMetadata) ? input.materialMetadata : [];
  const materialMetadata = materialsRaw
    .filter(isRecord)
    .map((m): RuntimeMetadataPackage['materialMetadata'][number] => {
      const propertiesRaw = Array.isArray(m.properties) ? m.properties : [];
      const properties = propertiesRaw
        .filter(isRecord)
        .map((p): RuntimePropertyValue => ({
          name: typeof p.name === 'string' ? p.name : 'unknown',
          type: typeof p.type === 'string' ? p.type : 'string',
          rawValue: typeof p.rawValue === 'string' ? p.rawValue : undefined,
          normalizedValue: typeof p.normalizedValue === 'string' ? p.normalizedValue : undefined,
          unit: typeof p.unit === 'string' ? p.unit : undefined,
          unitType: typeof p.unitType === 'string' ? p.unitType : undefined,
          source: isRecord(p.source)
            ? {
                kind: p.source.kind === 'propertyset' || p.source.kind === 'geominfo' || p.source.kind === 'token'
                  ? p.source.kind
                  : 'token',
                name: typeof p.source.name === 'string' ? p.source.name : 'legacy',
              }
            : { kind: 'token', name: 'legacy' },
        }));

      return {
        material: typeof m.material === 'string' ? m.material : 'unknown_material',
        meshes: toStringArray(m.meshes),
        properties,
      };
    });

  const unassignedRaw = Array.isArray(input.unassignedProperties) ? input.unassignedProperties : [];
  const unassignedProperties = unassignedRaw
    .filter(isRecord)
    .map((p): RuntimePropertyValue => ({
      name: typeof p.name === 'string' ? p.name : 'unknown',
      type: typeof p.type === 'string' ? p.type : 'string',
      rawValue: typeof p.rawValue === 'string' ? p.rawValue : undefined,
      normalizedValue: typeof p.normalizedValue === 'string' ? p.normalizedValue : undefined,
      unit: typeof p.unit === 'string' ? p.unit : undefined,
      unitType: typeof p.unitType === 'string' ? p.unitType : undefined,
      source: isRecord(p.source)
        ? {
            kind: p.source.kind === 'propertyset' || p.source.kind === 'geominfo' || p.source.kind === 'token'
              ? p.source.kind
              : 'token',
            name: typeof p.source.name === 'string' ? p.source.name : 'legacy',
          }
        : { kind: 'token', name: 'legacy' },
    }));

  const diagnosticsRaw = Array.isArray(input.diagnostics) ? input.diagnostics : [];
  const diagnostics = diagnosticsRaw
    .filter(isRecord)
    .map((d): RuntimeMetadataPackage['diagnostics'][number] => ({
      severity: d.severity === 'error' || d.severity === 'warning' || d.severity === 'info' ? d.severity : 'info',
      code: typeof d.code === 'string' ? d.code : 'D6R6-META-INFO',
      message: typeof d.message === 'string' ? d.message : 'Legacy metadata diagnostic migrated.',
      ref: typeof d.ref === 'string' ? d.ref : undefined,
    }));

  const metadata: RuntimeMetadataPackage = {
    schema: 'mtlx-d6-r3-runtime-metadata-v1',
    generatedAt: typeof input.generatedAt === 'string' ? input.generatedAt : new Date().toISOString(),
    activeLook: typeof input.activeLook === 'string' || input.activeLook === null ? input.activeLook : null,
    tokens,
    materialMetadata,
    unassignedProperties,
    diagnostics,
  };

  return {
    metadata,
    migrated: schema !== 'mtlx-d6-r3-runtime-metadata-v1',
  };
}

export function buildRuntimeDataContract(
  sceneInput: RuntimeSceneAssignment | unknown,
  metadataInput: RuntimeMetadataPackage | unknown,
  options?: BuildRuntimeDataContractOptions,
): RuntimeDataContract {
  const sceneResult = normalizeSceneLike(sceneInput);
  const metadataResult = normalizeMetadataLike(metadataInput);

  const materials: RuntimeMaterialContract[] = metadataResult.metadata.materialMetadata
    .map((m) => ({
      material: m.material,
      meshes: stableSortedUnique(m.meshes),
      properties: cloneProperties(m.properties),
    }))
    .sort((a, b) => a.material.localeCompare(b.material));

  const diagnostics: RuntimeContractDiagnostic[] = [
    ...sceneResult.scene.diagnostics.map((d) => ({
      severity: d.severity,
      code: d.code,
      message: `[scene] ${d.message}`,
      ref: d.ref,
    })),
    ...metadataResult.metadata.diagnostics.map((d) => ({
      severity: d.severity,
      code: d.code,
      message: `[metadata] ${d.message}`,
      ref: d.ref,
    })),
  ].sort((a, b) => a.code.localeCompare(b.code) || a.message.localeCompare(b.message));

  const lights = options?.lights ? [...options.lights] : [];
  const env = options?.env ?? { id: 'default', type: 'none' as const };
  const overrides: RuntimeOverridesContract = {
    meshMaterialOverrides: { ...(options?.overrides?.meshMaterialOverrides ?? {}) },
    propertyOverrides: [...(options?.overrides?.propertyOverrides ?? [])],
  };

  return {
    schema: 'mtlx-d6-runtime-contract-v1',
    generatedAt: options?.generatedAt ?? new Date().toISOString(),
    sourceSchemas: {
      sceneAssignments: sceneResult.scene.schema,
      metadata: metadataResult.metadata.schema,
    },
    compatibility: {
      migratedLegacyInputs: sceneResult.migrated || metadataResult.migrated,
      acceptedLegacySchemas: ['legacy-scene-assignment', 'legacy-runtime-metadata'],
    },
    scene: {
      activeLook: sceneResult.scene.activeLook,
      meshCatalog: stableSortedUnique(sceneResult.scene.meshCatalog),
    },
    materials,
    textures: guessTextures(metadataResult.metadata),
    overrides,
    lights,
    env,
    diagnostics,
  };
}

export function validateRuntimeDataContract(contract: unknown): RuntimeContractValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(contract)) {
    return { valid: false, errors: ['Contract must be an object.'], warnings: [] };
  }

  if (contract.schema !== 'mtlx-d6-runtime-contract-v1') {
    errors.push(`Unsupported contract schema: ${String(contract.schema)}`);
  }

  if (typeof contract.generatedAt !== 'string' || contract.generatedAt.length === 0) {
    errors.push('generatedAt must be a non-empty string.');
  }

  if (!isRecord(contract.scene)) {
    errors.push('scene must be an object.');
  } else {
    if (contract.scene.activeLook !== null && typeof contract.scene.activeLook !== 'string') {
      errors.push('scene.activeLook must be string or null.');
    }
    if (!Array.isArray(contract.scene.meshCatalog)) {
      errors.push('scene.meshCatalog must be an array.');
    }
  }

  if (!Array.isArray(contract.materials)) {
    errors.push('materials must be an array.');
  } else if (contract.materials.length === 0) {
    warnings.push('materials is empty: runtime may render with fallback materials.');
  }

  if (!Array.isArray(contract.textures)) {
    errors.push('textures must be an array.');
  }

  if (!Array.isArray(contract.lights)) {
    errors.push('lights must be an array.');
  }

  if (!isRecord(contract.env)) {
    errors.push('env must be an object.');
  }

  if (!isRecord(contract.overrides)) {
    errors.push('overrides must be an object.');
  }

  if (!Array.isArray(contract.diagnostics)) {
    errors.push('diagnostics must be an array.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function loadRuntimeDataContract(contractInput: unknown, strict = true): RuntimeDataContract {
  if (!isRecord(contractInput)) {
    throw new Error('Cannot load runtime data contract: input must be an object.');
  }

  const migrated = buildRuntimeDataContract(
    isRecord(contractInput.scene)
      ? {
          schema: 'mtlx-scene-assignments-v1',
          generatedAt: typeof contractInput.generatedAt === 'string' ? contractInput.generatedAt : new Date().toISOString(),
          activeLook: contractInput.scene.activeLook === null || typeof contractInput.scene.activeLook === 'string'
            ? contractInput.scene.activeLook
            : null,
          meshCatalog: toStringArray(contractInput.scene.meshCatalog),
          looks: [],
          diagnostics: [],
        }
      : { schema: 'legacy-scene-assignment', meshCatalog: [], looks: [] },
    {
      schema: 'mtlx-d6-r3-runtime-metadata-v1',
      generatedAt: typeof contractInput.generatedAt === 'string' ? contractInput.generatedAt : new Date().toISOString(),
      activeLook: isRecord(contractInput.scene)
        && (typeof contractInput.scene.activeLook === 'string' || contractInput.scene.activeLook === null)
        ? contractInput.scene.activeLook
        : null,
      tokens: {},
      materialMetadata: Array.isArray(contractInput.materials)
        ? contractInput.materials
            .filter(isRecord)
            .map((m) => ({
              material: typeof m.material === 'string' ? m.material : 'unknown_material',
              meshes: toStringArray(m.meshes),
              properties: Array.isArray(m.properties)
                ? m.properties
                    .filter(isRecord)
                    .map((p) => ({
                      name: typeof p.name === 'string' ? p.name : 'unknown',
                      type: typeof p.type === 'string' ? p.type : 'string',
                      rawValue: typeof p.rawValue === 'string' ? p.rawValue : undefined,
                      normalizedValue: typeof p.normalizedValue === 'string' ? p.normalizedValue : undefined,
                      unit: typeof p.unit === 'string' ? p.unit : undefined,
                      unitType: typeof p.unitType === 'string' ? p.unitType : undefined,
                      source: { kind: 'token' as const, name: 'contract-load' },
                    }))
                : [],
            }))
        : [],
      unassignedProperties: [],
      diagnostics: [],
    },
    {
      generatedAt: typeof contractInput.generatedAt === 'string' ? contractInput.generatedAt : new Date().toISOString(),
      lights: Array.isArray(contractInput.lights)
        ? contractInput.lights
            .filter(isRecord)
            .map((l, index) => ({
              id: typeof l.id === 'string' ? l.id : `light_${index}`,
              type: typeof l.type === 'string' ? l.type : 'unknown',
              enabled: typeof l.enabled === 'boolean' ? l.enabled : true,
            }))
        : [],
      env: isRecord(contractInput.env)
        ? {
            id: typeof contractInput.env.id === 'string' ? contractInput.env.id : 'default',
            type: contractInput.env.type === 'latlong' ? 'latlong' : 'none',
            uri: typeof contractInput.env.uri === 'string' ? contractInput.env.uri : undefined,
          }
        : { id: 'default', type: 'none' },
    },
  );

  const validation = validateRuntimeDataContract(migrated);
  if (strict && !validation.valid) {
    throw new Error(`Runtime contract validation failed: ${validation.errors.join('; ')}`);
  }
  return migrated;
}

export function serializeRuntimeDataContract(contract: RuntimeDataContract): string {
  const stable: RuntimeDataContract = {
    ...contract,
    scene: {
      ...contract.scene,
      meshCatalog: stableSortedUnique(contract.scene.meshCatalog),
    },
    materials: [...contract.materials]
      .map((m) => ({
        ...m,
        meshes: stableSortedUnique(m.meshes),
        properties: cloneProperties(m.properties).sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type)),
      }))
      .sort((a, b) => a.material.localeCompare(b.material)),
    textures: [...contract.textures].sort((a, b) => a.id.localeCompare(b.id)),
    overrides: {
      meshMaterialOverrides: Object.fromEntries(
        Object.entries(contract.overrides.meshMaterialOverrides).sort(([a], [b]) => a.localeCompare(b)),
      ),
      propertyOverrides: [...contract.overrides.propertyOverrides]
        .sort((a, b) => a.material.localeCompare(b.material) || a.name.localeCompare(b.name)),
    },
    lights: [...contract.lights].sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics: [...contract.diagnostics]
      .sort((a, b) => a.code.localeCompare(b.code) || a.message.localeCompare(b.message)),
  };

  return JSON.stringify(stable, null, 2);
}
