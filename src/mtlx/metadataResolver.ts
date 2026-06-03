import type { MtlxDocument, MtlxGeomInfo, MtlxGeomProp, MtlxNode, MtlxPropertySet, MtlxRawElement } from './types.js';
import type { RuntimeSceneAssignment } from './sceneTranslator.js';

export type MetadataSeverity = 'info' | 'warning' | 'error';

export interface MetadataDiagnostic {
  severity: MetadataSeverity;
  code: string;
  message: string;
  ref?: string;
}

export interface RuntimePropertyValue {
  name: string;
  type: string;
  rawValue?: string;
  normalizedValue?: string;
  unit?: string;
  unitType?: string;
  source: {
    kind: 'propertyset' | 'geominfo' | 'token';
    name: string;
  };
}

export interface RuntimeMaterialMetadata {
  material: string;
  meshes: string[];
  properties: RuntimePropertyValue[];
}

export interface RuntimeMetadataPackage {
  schema: 'mtlx-d6-r3-runtime-metadata-v1';
  generatedAt: string;
  activeLook: string | null;
  tokens: Record<string, string>;
  materialMetadata: RuntimeMaterialMetadata[];
  unassignedProperties: RuntimePropertyValue[];
  diagnostics: MetadataDiagnostic[];
}

export interface ResolveMetadataOptions {
  sceneAssignments: RuntimeSceneAssignment;
  generatedAt?: string;
}

type UnitNormalization = {
  normalizedValue?: string;
  warning?: string;
};

const DISTANCE_TO_METER: Record<string, number> = {
  meter: 1,
  m: 1,
  centimeter: 0.01,
  cm: 0.01,
  millimeter: 0.001,
  mm: 0.001,
  kilometer: 1000,
  km: 1000,
  inch: 0.0254,
  in: 0.0254,
  foot: 0.3048,
  ft: 0.3048,
};

function splitNumericValues(raw: string): number[] | null {
  const parts = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return [];

  const values: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isFinite(n)) return null;
    values.push(n);
  }
  return values;
}

function formatNumericValues(values: number[]): string {
  return values.map((v) => {
    const fixed = Number(v.toFixed(9));
    return String(fixed);
  }).join(', ');
}

function normalizeUnitValue(rawValue: string | undefined, unitType: string | undefined, unit: string | undefined): UnitNormalization {
  if (!rawValue || !unitType || !unit) return {};

  const values = splitNumericValues(rawValue);
  if (values === null) {
    return { warning: `Cannot normalize non numeric value "${rawValue}".` };
  }

  const unitTypeLower = unitType.toLowerCase();
  const unitLower = unit.toLowerCase();

  if (unitTypeLower === 'angle') {
    if (unitLower === 'radian' || unitLower === 'rad') {
      return { normalizedValue: formatNumericValues(values) };
    }
    if (unitLower === 'degree' || unitLower === 'deg') {
      const out = values.map((v) => v * Math.PI / 180);
      return { normalizedValue: formatNumericValues(out) };
    }
    return { warning: `Unsupported angle unit "${unit}".` };
  }

  if (unitTypeLower === 'distance') {
    const factor = DISTANCE_TO_METER[unitLower];
    if (!factor) {
      return { warning: `Unsupported distance unit "${unit}".` };
    }
    const out = values.map((v) => v * factor);
    return { normalizedValue: formatNumericValues(out) };
  }

  return { warning: `Unsupported unit type "${unitType}".` };
}

function normalizeSelector(selector: string): string {
  const s = selector.trim();
  if (s === '/') return '/';
  return s.replace(/\/+$/g, '');
}

function meshAliases(mesh: string): string[] {
  const normalized = normalizeSelector(mesh);
  if (normalized === '/') return ['/', '*', '/*'];
  const aliases = [normalized];
  if (normalized.startsWith('/')) aliases.push(normalized.slice(1));
  else aliases.push(`/${normalized}`);
  return aliases;
}

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchSelector(selector: string, mesh: string): boolean {
  const s = normalizeSelector(selector);
  if (s === '*' || s === '/' || s === '/*') return true;

  const aliases = meshAliases(mesh);
  if (!s.includes('*')) {
    return aliases.includes(s);
  }

  const regex = new RegExp(`^${escapeRegex(s).replace(/\\\*/g, '.*')}$`);
  return aliases.some((candidate) => regex.test(candidate));
}

function resolveCollectionSelectors(doc: MtlxDocument, diagnostics: MetadataDiagnostic[]): Map<string, Set<string>> {
  const byName = new Map(doc.collections.map((c) => [c.name, c]));
  const cache = new Map<string, Set<string>>();

  function resolve(name: string, stack: Set<string>): Set<string> {
    const cached = cache.get(name);
    if (cached) return cached;

    const coll = byName.get(name);
    if (!coll) {
      diagnostics.push({
        severity: 'warning',
        code: 'D6R3-COLL-001',
        message: `Collection "${name}" not found while resolving propertysetassign.`,
        ref: name,
      });
      const empty = new Set<string>();
      cache.set(name, empty);
      return empty;
    }

    if (stack.has(name)) {
      diagnostics.push({
        severity: 'error',
        code: 'D6R3-COLL-002',
        message: `Collection cycle detected at "${name}".`,
        ref: name,
      });
      const empty = new Set<string>();
      cache.set(name, empty);
      return empty;
    }

    const selectors = new Set<string>();
    stack.add(name);

    for (const s of (coll.geom ?? '').split(',').map((v) => v.trim()).filter(Boolean)) {
      selectors.add(s);
    }

    for (const child of (coll.includecollection ?? '').split(',').map((v) => v.trim()).filter(Boolean)) {
      for (const s of resolve(child, stack)) selectors.add(s);
    }

    stack.delete(name);
    cache.set(name, selectors);
    return selectors;
  }

  for (const c of doc.collections) {
    resolve(c.name, new Set<string>());
  }

  return cache;
}

function collectTopLevelTokens(doc: MtlxDocument): Record<string, string> {
  const out: Record<string, string> = {};

  for (const raw of doc.unknownElements) {
    if (raw.tag !== 'token') continue;
    const name = raw.attributes.name;
    if (!name) continue;
    out[name] = raw.attributes.value ?? '';
  }

  for (const node of doc.nodes) {
    if (node.category !== 'token') continue;
    const v = node.inputs.find((i) => i.name === 'value')?.value ?? node.extra.value ?? '';
    out[node.name] = v;
  }

  return out;
}

function collectPropertySetAssignNodes(doc: MtlxDocument): MtlxNode[] {
  return doc.nodes.filter((n) => n.category === 'propertysetassign');
}

function applyTokens(
  raw: string | undefined,
  tokens: Record<string, string>,
  diagnostics: MetadataDiagnostic[],
  ref: string,
): string | undefined {
  if (!raw) return raw;
  return raw.replace(/<([A-Za-z_][A-Za-z0-9_]*)>/g, (_m, tokenName: string) => {
    if (Object.prototype.hasOwnProperty.call(tokens, tokenName)) {
      return tokens[tokenName];
    }
    diagnostics.push({
      severity: 'warning',
      code: 'D6R3-TOKEN-001',
      message: `Token "${tokenName}" could not be resolved in "${ref}".`,
      ref,
    });
    return `<${tokenName}>`;
  });
}

function propertyValueFrom(
  kind: 'propertyset' | 'geominfo' | 'token',
  sourceName: string,
  name: string,
  type: string,
  rawValue: string | undefined,
  diagnostics: MetadataDiagnostic[],
): RuntimePropertyValue {
  const unit = undefined;
  const unitType = undefined;
  const normalized = normalizeUnitValue(rawValue, unitType, unit);

  if (normalized.warning) {
    diagnostics.push({
      severity: 'warning',
      code: 'D6R3-NORM-001',
      message: normalized.warning,
      ref: `${kind}:${sourceName}:${name}`,
    });
  }

  return {
    name,
    type,
    rawValue,
    normalizedValue: normalized.normalizedValue,
    unit,
    unitType,
    source: {
      kind,
      name: sourceName,
    },
  };
}

function propertyValueFromGeomProp(
  geomInfo: MtlxGeomInfo,
  geomProp: MtlxGeomProp,
  diagnostics: MetadataDiagnostic[],
): RuntimePropertyValue {
  const unit = geomProp.extra.unit;
  const unitType = geomProp.extra.unittype;
  const normalized = normalizeUnitValue(geomProp.value, unitType, unit);

  if (normalized.warning) {
    diagnostics.push({
      severity: 'warning',
      code: 'D6R3-NORM-002',
      message: normalized.warning,
      ref: `geominfo:${geomInfo.name}:${geomProp.name}`,
    });
  }

  return {
    name: geomProp.name,
    type: geomProp.type,
    rawValue: geomProp.value,
    normalizedValue: normalized.normalizedValue,
    unit,
    unitType,
    source: {
      kind: 'geominfo',
      name: geomInfo.name,
    },
  };
}

function fallbackMaterialCandidates(doc: MtlxDocument): string[] {
  const out = new Set<string>();
  for (const node of doc.nodes) {
    if (node.type === 'material' || node.category === 'surfacematerial' || node.category === 'volumematerial') {
      out.add(node.name);
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function meshMaterialMap(
  doc: MtlxDocument,
  scene: RuntimeSceneAssignment,
  diagnostics: MetadataDiagnostic[],
): Map<string, string> {
  if (!scene.activeLook) {
    const fallback = fallbackMaterialCandidates(doc);
    if (fallback.length === 1) {
      diagnostics.push({
        severity: 'info',
        code: 'D6R3-MAP-001',
        message: `No active look: using single material fallback "${fallback[0]}" for all meshes.`,
        ref: fallback[0],
      });
      return new Map(scene.meshCatalog.map((mesh) => [mesh, fallback[0]]));
    }
    if (fallback.length > 1) {
      diagnostics.push({
        severity: 'warning',
        code: 'D6R3-MAP-002',
        message: `No active look and multiple material candidates found (${fallback.length}); metadata propagation is ambiguous.`,
      });
    }
    return new Map<string, string>();
  }
  const active = scene.looks.find((l) => l.look === scene.activeLook);
  if (!active) return new Map<string, string>();
  return new Map(Object.entries(active.meshToMaterial));
}

function addMaterialProperty(
  target: Map<string, RuntimePropertyValue[]>,
  material: string,
  value: RuntimePropertyValue,
): void {
  const existing = target.get(material);
  if (!existing) {
    target.set(material, [value]);
  } else {
    existing.push(value);
  }
}

export function resolveRuntimeMetadata(
  doc: MtlxDocument,
  options: ResolveMetadataOptions,
): RuntimeMetadataPackage {
  const diagnostics: MetadataDiagnostic[] = [];
  const tokens = collectTopLevelTokens(doc);
  const collectionSelectors = resolveCollectionSelectors(doc, diagnostics);
  const meshToMaterial = meshMaterialMap(doc, options.sceneAssignments, diagnostics);

  const perMaterial = new Map<string, RuntimePropertyValue[]>();
  const unassigned: RuntimePropertyValue[] = [];

  const propertySetsByName = new Map<string, MtlxPropertySet>(doc.propertysets.map((p) => [p.name, p]));

  for (const g of doc.geominfos) {
    const selectors = (g.geom ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const targetMeshes = selectors.length === 0
      ? [...meshToMaterial.keys()]
      : [...meshToMaterial.keys()].filter((mesh) => selectors.some((s) => matchSelector(s, mesh)));

    for (const gp of g.geomprops) {
      const value = propertyValueFromGeomProp(g, gp, diagnostics);
      if (targetMeshes.length === 0) {
        unassigned.push(value);
        diagnostics.push({
          severity: 'info',
          code: 'D6R3-GEO-001',
          message: `Geominfo property "${gp.name}" has no mesh target in active look.`,
          ref: g.name,
        });
        continue;
      }

      for (const mesh of targetMeshes) {
        const material = meshToMaterial.get(mesh);
        if (!material) {
          unassigned.push(value);
          continue;
        }
        addMaterialProperty(perMaterial, material, value);
      }
    }
  }

  for (const assign of collectPropertySetAssignNodes(doc)) {
    const propertySetName = assign.extra.propertyset ?? assign.inputs.find((i) => i.name === 'propertyset')?.value;
    if (!propertySetName) {
      diagnostics.push({
        severity: 'warning',
        code: 'D6R3-PSA-001',
        message: `propertysetassign "${assign.name}" has no propertyset reference.`,
        ref: assign.name,
      });
      continue;
    }

    const propertySet = propertySetsByName.get(propertySetName);
    if (!propertySet) {
      diagnostics.push({
        severity: 'warning',
        code: 'D6R3-PSA-002',
        message: `propertysetassign "${assign.name}" references unknown propertyset "${propertySetName}".`,
        ref: assign.name,
      });
      continue;
    }

    const selectors = new Set<string>();
    const geomExpr = assign.extra.geom ?? assign.inputs.find((i) => i.name === 'geom')?.value;
    const collExpr = assign.extra.collection ?? assign.inputs.find((i) => i.name === 'collection')?.value;

    for (const s of (geomExpr ?? '').split(',').map((v) => v.trim()).filter(Boolean)) {
      selectors.add(s);
    }

    if (collExpr) {
      for (const collName of collExpr.split(',').map((v) => v.trim()).filter(Boolean)) {
        const collSelectors = collectionSelectors.get(collName);
        if (!collSelectors) {
          diagnostics.push({
            severity: 'warning',
            code: 'D6R3-PSA-003',
            message: `propertysetassign "${assign.name}" references unknown collection "${collName}".`,
            ref: assign.name,
          });
          continue;
        }
        for (const s of collSelectors) selectors.add(s);
      }
    }

    const targetMeshes = selectors.size === 0
      ? [...meshToMaterial.keys()]
      : [...meshToMaterial.keys()].filter((mesh) => [...selectors].some((s) => matchSelector(s, mesh)));

    for (const prop of propertySet.properties) {
      const tokenized = applyTokens(prop.value, tokens, diagnostics, `${propertySet.name}.${prop.name}`);
      const value = propertyValueFrom('propertyset', propertySet.name, prop.name, prop.type, tokenized, diagnostics);
      if (targetMeshes.length === 0) {
        unassigned.push(value);
        diagnostics.push({
          severity: 'info',
          code: 'D6R3-PSA-004',
          message: `Property "${prop.name}" from "${propertySet.name}" had no mesh target in active look.`,
          ref: assign.name,
        });
        continue;
      }

      for (const mesh of targetMeshes) {
        const material = meshToMaterial.get(mesh);
        if (!material) {
          unassigned.push(value);
          continue;
        }
        addMaterialProperty(perMaterial, material, value);
      }
    }
  }

  for (const [name, tokenValue] of Object.entries(tokens)) {
    const tokenProperty = propertyValueFrom('token', 'top-level-token', name, 'string', tokenValue, diagnostics);
    unassigned.push(tokenProperty);
  }

  const materialMetadata: RuntimeMaterialMetadata[] = [...perMaterial.entries()]
    .map(([material, properties]) => {
      const meshes = [...meshToMaterial.entries()]
        .filter(([, mat]) => mat === material)
        .map(([mesh]) => mesh)
        .sort((a, b) => a.localeCompare(b));

      return {
        material,
        meshes,
        properties: [...properties].sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type)),
      };
    })
    .sort((a, b) => a.material.localeCompare(b.material));

  diagnostics.sort((a, b) => {
    const rank: Record<MetadataSeverity, number> = { error: 0, warning: 1, info: 2 };
    return rank[a.severity] - rank[b.severity]
      || a.code.localeCompare(b.code)
      || (a.ref ?? '').localeCompare(b.ref ?? '')
      || a.message.localeCompare(b.message);
  });

  return {
    schema: 'mtlx-d6-r3-runtime-metadata-v1',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    activeLook: options.sceneAssignments.activeLook,
    tokens,
    materialMetadata,
    unassignedProperties: unassigned.sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type)),
    diagnostics,
  };
}

export function serializeRuntimeMetadataPackage(pkg: RuntimeMetadataPackage): string {
  const stable: RuntimeMetadataPackage = {
    ...pkg,
    tokens: Object.fromEntries(Object.entries(pkg.tokens).sort(([a], [b]) => a.localeCompare(b))),
    materialMetadata: [...pkg.materialMetadata].sort((a, b) => a.material.localeCompare(b.material)),
    unassignedProperties: [...pkg.unassignedProperties].sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type)),
    diagnostics: [...pkg.diagnostics],
  };
  return JSON.stringify(stable, null, 2);
}
