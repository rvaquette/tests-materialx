import type { MtlxDocument, MtlxLook, MtlxMaterialAssign } from './types.js';

export type SceneDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface SceneDiagnostic {
  severity: SceneDiagnosticSeverity;
  code: string;
  message: string;
  look?: string;
  assign?: string;
  ref?: string;
}

export interface AssignmentTrace {
  index: number;
  sourceLook: string;
  assignName: string;
  material: string;
  targets: string[];
  selectors: string[];
  fromCollection?: string;
  fromGeom?: string;
}

export interface RuntimeLookAssignment {
  look: string;
  inheritedChain: string[];
  meshToMaterial: Record<string, string>;
  traces: AssignmentTrace[];
}

export interface RuntimeSceneAssignment {
  schema: 'mtlx-scene-assignments-v1';
  generatedAt: string;
  activeLook: string | null;
  meshCatalog: string[];
  looks: RuntimeLookAssignment[];
  diagnostics: SceneDiagnostic[];
}

export interface TranslateSceneOptions {
  meshCatalog: string[];
  activeLook?: string;
  generatedAt?: string;
}

type CollectionRef = {
  selectors: Set<string>;
};

function splitList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function canonicalMeshName(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '/') return '/';
  const withoutTrailing = trimmed.replace(/\/+$/g, '');
  if (withoutTrailing.length === 0) return '/';
  return withoutTrailing;
}

function meshAliases(mesh: string): string[] {
  const canonical = canonicalMeshName(mesh);
  const aliases = new Set<string>([canonical]);
  if (canonical === '/') {
    aliases.add('*');
    aliases.add('/*');
  } else if (canonical.startsWith('/')) {
    aliases.add(canonical.slice(1));
  } else {
    aliases.add(`/${canonical}`);
  }
  return [...aliases];
}

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function selectorMatchesMesh(selector: string, mesh: string): boolean {
  const normalizedSelector = canonicalMeshName(selector);
  if (normalizedSelector === '*' || normalizedSelector === '/' || normalizedSelector === '/*') {
    return true;
  }

  const aliases = meshAliases(mesh);
  if (!normalizedSelector.includes('*')) {
    return aliases.includes(normalizedSelector);
  }

  const regex = new RegExp(`^${escapeRegex(normalizedSelector).replace(/\\\*/g, '.*')}$`);
  return aliases.some((candidate) => regex.test(candidate));
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function resolveInheritedChain(
  lookName: string,
  lookByName: Map<string, MtlxLook>,
  diagnostics: SceneDiagnostic[],
): string[] {
  const stack = new Set<string>();
  const chain: string[] = [];

  function dfs(currentName: string): void {
    const look = lookByName.get(currentName);
    if (!look) {
      diagnostics.push({
        severity: 'error',
        code: 'D6R2-LOOK-001',
        message: `Look "${currentName}" not found for inheritance resolution.`,
        ref: currentName,
      });
      return;
    }
    if (stack.has(currentName)) {
      diagnostics.push({
        severity: 'error',
        code: 'D6R2-LOOK-002',
        message: `Cycle detected in look inheritance at "${currentName}".`,
        ref: currentName,
      });
      return;
    }
    if (chain.includes(currentName)) return;

    stack.add(currentName);
    if (look.inherit) {
      dfs(look.inherit);
    }
    stack.delete(currentName);

    chain.push(currentName);
  }

  dfs(lookName);
  return chain;
}

function resolveCollectionSelectors(
  collectionName: string,
  collectionMap: Map<string, { geom?: string; includecollection?: string }>,
  diagnostics: SceneDiagnostic[],
  cache: Map<string, CollectionRef>,
  stack: Set<string>,
): CollectionRef {
  const cached = cache.get(collectionName);
  if (cached) return cached;

  const collection = collectionMap.get(collectionName);
  if (!collection) {
    diagnostics.push({
      severity: 'error',
      code: 'D6R2-COLL-001',
      message: `Collection "${collectionName}" not found.`,
      ref: collectionName,
    });
    const fallback = { selectors: new Set<string>() };
    cache.set(collectionName, fallback);
    return fallback;
  }

  if (stack.has(collectionName)) {
    diagnostics.push({
      severity: 'error',
      code: 'D6R2-COLL-002',
      message: `Cycle detected in includecollection at "${collectionName}".`,
      ref: collectionName,
    });
    const fallback = { selectors: new Set<string>() };
    cache.set(collectionName, fallback);
    return fallback;
  }

  stack.add(collectionName);
  const selectors = new Set<string>();

  for (const selector of splitList(collection.geom)) {
    selectors.add(selector);
  }

  for (const includeName of splitList(collection.includecollection)) {
    const included = resolveCollectionSelectors(includeName, collectionMap, diagnostics, cache, stack);
    for (const selector of included.selectors) selectors.add(selector);
  }

  stack.delete(collectionName);

  const resolved = { selectors };
  cache.set(collectionName, resolved);
  return resolved;
}

function selectTargets(selectors: string[], meshCatalog: string[]): string[] {
  if (selectors.length === 0) return [];
  const selected = new Set<string>();
  for (const selector of selectors) {
    for (const mesh of meshCatalog) {
      if (selectorMatchesMesh(selector, mesh)) {
        selected.add(mesh);
      }
    }
  }
  return uniqueSorted(selected);
}

function resolveAssignSelectors(
  assign: MtlxMaterialAssign,
  collectionMap: Map<string, { geom?: string; includecollection?: string }>,
  diagnostics: SceneDiagnostic[],
  collectionCache: Map<string, CollectionRef>,
): { selectors: string[]; fromCollection?: string; fromGeom?: string } {
  const selectors = new Set<string>();
  let fromCollection: string | undefined;
  let fromGeom: string | undefined;

  if (assign.collection) {
    const resolved = resolveCollectionSelectors(assign.collection, collectionMap, diagnostics, collectionCache, new Set<string>());
    for (const selector of resolved.selectors) selectors.add(selector);
    fromCollection = assign.collection;
    if (resolved.selectors.size === 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'D6R2-COLL-003',
        message: `Collection "${assign.collection}" resolved to no selectors.`,
        assign: assign.name,
        ref: assign.collection,
      });
    }
  }

  if (assign.geom) {
    for (const selector of splitList(assign.geom)) selectors.add(selector);
    fromGeom = assign.geom;
  }

  return {
    selectors: uniqueSorted(selectors),
    fromCollection,
    fromGeom,
  };
}

function collectKnownMaterials(doc: MtlxDocument): Set<string> {
  const materials = new Set<string>();
  for (const node of doc.nodes) materials.add(node.name);
  for (const graph of doc.nodegraphs) materials.add(graph.name);
  return materials;
}

export function translateMtlxSceneAssignments(
  doc: MtlxDocument,
  options: TranslateSceneOptions,
): RuntimeSceneAssignment {
  const diagnostics: SceneDiagnostic[] = [];
  const meshCatalog = uniqueSorted(options.meshCatalog.map((m) => canonicalMeshName(m)).filter((m) => m.length > 0));

  if (meshCatalog.length === 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'D6R2-MESH-001',
      message: 'Mesh catalog is empty: no assignment target can be resolved.',
    });
  }

  const collectionMap = new Map(doc.collections.map((c) => [c.name, { geom: c.geom, includecollection: c.includecollection }]));
  const collectionCache = new Map<string, CollectionRef>();
  const lookByName = new Map(doc.looks.map((look) => [look.name, look]));
  const knownMaterials = collectKnownMaterials(doc);

  const lookResults: RuntimeLookAssignment[] = [];

  for (const look of doc.looks) {
    const inheritedChain = resolveInheritedChain(look.name, lookByName, diagnostics);
    const orderedAssigns: Array<{ sourceLook: string; assign: MtlxMaterialAssign }> = [];

    for (const lookName of inheritedChain) {
      const src = lookByName.get(lookName);
      if (!src) continue;
      for (const assign of src.materialassigns) {
        orderedAssigns.push({ sourceLook: lookName, assign });
      }
    }

    const meshToMaterial = new Map<string, string>();
    const traces: AssignmentTrace[] = [];

    orderedAssigns.forEach(({ sourceLook, assign }, index) => {
      if (!assign.material) {
        diagnostics.push({
          severity: 'warning',
          code: 'D6R2-ASN-001',
          message: `materialassign "${assign.name}" has no material reference and is skipped.`,
          look: look.name,
          assign: assign.name,
        });
        return;
      }

      if (!knownMaterials.has(assign.material)) {
        diagnostics.push({
          severity: 'warning',
          code: 'D6R2-ASN-002',
          message: `Material reference "${assign.material}" was not found in top-level nodes/nodegraphs.`,
          look: look.name,
          assign: assign.name,
          ref: assign.material,
        });
      }

      const selectorResult = resolveAssignSelectors(assign, collectionMap, diagnostics, collectionCache);
      const targets = selectTargets(selectorResult.selectors, meshCatalog);

      if (targets.length === 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'D6R2-ASN-003',
          message: `materialassign "${assign.name}" resolved to no mesh target.`,
          look: look.name,
          assign: assign.name,
        });
      }

      for (const target of targets) {
        meshToMaterial.set(target, assign.material);
      }

      traces.push({
        index,
        sourceLook,
        assignName: assign.name,
        material: assign.material,
        targets,
        selectors: selectorResult.selectors,
        fromCollection: selectorResult.fromCollection,
        fromGeom: selectorResult.fromGeom,
      });
    });

    lookResults.push({
      look: look.name,
      inheritedChain,
      meshToMaterial: Object.fromEntries(uniqueSorted(meshToMaterial.keys()).map((k) => [k, meshToMaterial.get(k)!])),
      traces,
    });
  }

  const activeLook =
    options.activeLook && lookByName.has(options.activeLook)
      ? options.activeLook
      : doc.looks.length > 0
        ? doc.looks[0].name
        : null;

  if (options.activeLook && !lookByName.has(options.activeLook)) {
    diagnostics.push({
      severity: 'warning',
      code: 'D6R2-LOOK-003',
      message: `Requested active look "${options.activeLook}" does not exist; fallback applied.`,
      ref: options.activeLook,
    });
  }

  diagnostics.sort((a, b) => {
    const sevRank: Record<SceneDiagnosticSeverity, number> = { error: 0, warning: 1, info: 2 };
    return sevRank[a.severity] - sevRank[b.severity]
      || a.code.localeCompare(b.code)
      || (a.look ?? '').localeCompare(b.look ?? '')
      || (a.assign ?? '').localeCompare(b.assign ?? '')
      || a.message.localeCompare(b.message);
  });

  return {
    schema: 'mtlx-scene-assignments-v1',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    activeLook,
    meshCatalog,
    looks: lookResults,
    diagnostics,
  };
}

export function serializeRuntimeSceneAssignment(value: RuntimeSceneAssignment): string {
  const normalized: RuntimeSceneAssignment = {
    ...value,
    meshCatalog: uniqueSorted(value.meshCatalog),
    looks: [...value.looks]
      .sort((a, b) => a.look.localeCompare(b.look))
      .map((look) => ({
        ...look,
        inheritedChain: uniqueSorted(look.inheritedChain),
        traces: [...look.traces].sort((a, b) => a.index - b.index || a.assignName.localeCompare(b.assignName)),
        meshToMaterial: Object.fromEntries(
          Object.entries(look.meshToMaterial)
            .sort(([ka], [kb]) => ka.localeCompare(kb)),
        ),
      })),
    diagnostics: [...value.diagnostics],
  };

  return JSON.stringify(normalized, null, 2);
}
