import fs from 'node:fs/promises';
import path from 'node:path';
import { parseMtlx } from './parser.js';
import type { MtlxDocument, MtlxLook, MtlxNode, MtlxNodegraph } from './types.js';

export type ExpansionSeverity = 'info' | 'warning' | 'error';

export interface ExpansionDiagnostic {
  severity: ExpansionSeverity;
  code: string;
  message: string;
  scope?: string;
  ref?: string;
}

export interface ExpandedSourceDocument {
  scope: string;
  filePath: string;
  includes: string[];
  stats: {
    typedefs: number;
    nodedefs: number;
    implementations: number;
    nodegraphs: number;
    nodes: number;
    looks: number;
    collections: number;
    propertysets: number;
    geominfos: number;
  };
}

export interface CanonicalNodegraphSummary {
  scope: string;
  name: string;
  canonicalName: string;
  nodeCount: number;
  nodedef?: string;
}

export interface CanonicalLookSummary {
  scope: string;
  name: string;
  canonicalName: string;
  inheritedChain: string[];
  materialAssignCount: number;
}

export interface ExpandedMtlxPackage {
  schema: 'mtlx-d6-r4-expanded-v1';
  generatedAt: string;
  entryFile: string;
  includeSummary: {
    requested: number;
    resolved: number;
    missing: number;
    cycles: number;
  };
  expandedTotals: {
    documents: number;
    typedefs: number;
    nodedefs: number;
    implementations: number;
    nodegraphs: number;
    nodes: number;
    looks: number;
    collections: number;
    propertysets: number;
    geominfos: number;
  };
  canonical: {
    scopes: string[];
    nodegraphs: CanonicalNodegraphSummary[];
    looks: CanonicalLookSummary[];
  };
  references: {
    total: number;
    resolved: number;
    unresolved: number;
  };
  documents: ExpandedSourceDocument[];
  diagnostics: ExpansionDiagnostic[];
}

interface ParsedSourceDocument {
  scope: string;
  filePath: string;
  doc: MtlxDocument;
  includes: string[];
}

interface ExpandContext {
  rootDir: string;
  generatedAt: string;
  requested: number;
  resolved: number;
  missing: number;
  cycles: number;
  cache: Map<string, ParsedSourceDocument>;
  order: ParsedSourceDocument[];
  diagnostics: ExpansionDiagnostic[];
}

function canonicalFilePath(value: string): string {
  return path.resolve(value).replace(/\\/g, '/');
}

function canonicalScope(rootDir: string, filePath: string): string {
  const rel = path.relative(rootDir, filePath).replace(/\\/g, '/');
  if (!rel || rel === '.') return 'root';
  const withoutExt = rel.replace(/\.mtlx$/i, '');
  return withoutExt.replace(/[^A-Za-z0-9_./-]/g, '_');
}

function canonicalName(scope: string, name: string): string {
  return `${scope}::${name}`;
}

function includeRefs(doc: MtlxDocument): string[] {
  return doc.unknownElements
    .filter((x) => x.tag === 'xi:include')
    .map((x) => (x.attributes.href ?? '').trim())
    .filter((x) => x.length > 0);
}

async function loadDocumentRecursive(
  filePath: string,
  parentStack: string[],
  context: ExpandContext,
): Promise<ParsedSourceDocument | null> {
  const resolvedPath = canonicalFilePath(filePath);

  if (parentStack.includes(resolvedPath)) {
    context.cycles += 1;
    context.diagnostics.push({
      severity: 'error',
      code: 'D6R4-INC-001',
      message: `Include cycle detected for "${resolvedPath}".`,
      ref: resolvedPath,
    });
    return null;
  }

  const cached = context.cache.get(resolvedPath);
  if (cached) return cached;

  let xml = '';
  try {
    xml = await fs.readFile(resolvedPath, 'utf8');
  } catch {
    context.missing += 1;
    context.diagnostics.push({
      severity: 'error',
      code: 'D6R4-INC-002',
      message: `Included file not found: "${resolvedPath}".`,
      ref: resolvedPath,
    });
    return null;
  }

  let doc: MtlxDocument;
  try {
    doc = parseMtlx(xml);
  } catch (error) {
    context.diagnostics.push({
      severity: 'error',
      code: 'D6R4-INC-003',
      message: `Unable to parse included file "${resolvedPath}": ${String(error)}`,
      ref: resolvedPath,
    });
    return null;
  }

  const scope = canonicalScope(context.rootDir, resolvedPath);
  const includes = includeRefs(doc);
  const parsed: ParsedSourceDocument = {
    scope,
    filePath: resolvedPath,
    doc,
    includes,
  };

  context.cache.set(resolvedPath, parsed);
  context.order.push(parsed);

  for (const href of includes) {
    context.requested += 1;
    const target = canonicalFilePath(path.resolve(path.dirname(resolvedPath), href));
    const loaded = await loadDocumentRecursive(target, [...parentStack, resolvedPath], context);
    if (loaded) {
      context.resolved += 1;
    }
  }

  return parsed;
}

function countRefsForTopNode(
  scope: string,
  node: MtlxNode,
  topNodeNames: Set<string>,
  graphNamesByScope: Map<string, Set<string>>,
  graphNamesGlobal: Set<string>,
  diagnostics: ExpansionDiagnostic[],
): { total: number; resolved: number } {
  let total = 0;
  let resolved = 0;

  for (const input of node.inputs) {
    if (input.nodename) {
      total += 1;
      if (topNodeNames.has(input.nodename)) {
        resolved += 1;
      } else {
        diagnostics.push({
          severity: 'warning',
          code: 'D6R4-REF-001',
          message: `Top-level nodename reference "${input.nodename}" could not be resolved.`,
          scope,
          ref: canonicalName(scope, node.name),
        });
      }
    }

    if (input.nodegraph) {
      total += 1;
      const local = graphNamesByScope.get(scope)?.has(input.nodegraph) === true;
      const global = graphNamesGlobal.has(input.nodegraph);
      if (local || global) {
        resolved += 1;
      } else {
        diagnostics.push({
          severity: 'warning',
          code: 'D6R4-REF-002',
          message: `nodegraph reference "${input.nodegraph}" could not be resolved.`,
          scope,
          ref: canonicalName(scope, node.name),
        });
      }
    }
  }

  return { total, resolved };
}

function countRefsForGraphNode(
  scope: string,
  graph: MtlxNodegraph,
  node: MtlxNode,
  localNodeNames: Set<string>,
  graphNamesByScope: Map<string, Set<string>>,
  graphNamesGlobal: Set<string>,
  diagnostics: ExpansionDiagnostic[],
): { total: number; resolved: number } {
  let total = 0;
  let resolved = 0;
  const graphInputNames = new Set(graph.inputs.map((x) => x.name));
  const graphOutputNames = new Set(graph.outputs.map((x) => x.name));

  for (const input of node.inputs) {
    if (input.nodename) {
      total += 1;
      if (localNodeNames.has(input.nodename)) {
        resolved += 1;
      } else {
        diagnostics.push({
          severity: 'warning',
          code: 'D6R4-REF-003',
          message: `nodename reference "${input.nodename}" in graph "${graph.name}" could not be resolved.`,
          scope,
          ref: `${canonicalName(scope, graph.name)}::${node.name}`,
        });
      }
    }

    if (input.nodegraph) {
      total += 1;
      const local = graphNamesByScope.get(scope)?.has(input.nodegraph) === true;
      const global = graphNamesGlobal.has(input.nodegraph);
      if (local || global) {
        resolved += 1;
      } else {
        diagnostics.push({
          severity: 'warning',
          code: 'D6R4-REF-004',
          message: `nodegraph reference "${input.nodegraph}" in graph "${graph.name}" could not be resolved.`,
          scope,
          ref: `${canonicalName(scope, graph.name)}::${node.name}`,
        });
      }
    }

    if (input.interfacename) {
      total += 1;
      if (graphInputNames.has(input.interfacename)) {
        resolved += 1;
      } else {
        diagnostics.push({
          severity: 'warning',
          code: 'D6R4-REF-005',
          message: `interfacename reference "${input.interfacename}" in graph "${graph.name}" could not be resolved.`,
          scope,
          ref: `${canonicalName(scope, graph.name)}::${node.name}`,
        });
      }
    }

    if (input.output) {
      total += 1;
      if (graphOutputNames.has(input.output)) {
        resolved += 1;
      } else {
        diagnostics.push({
          severity: 'info',
          code: 'D6R4-REF-006',
          message: `output reference "${input.output}" in graph "${graph.name}" not found on graph outputs; left as local semantic.`,
          scope,
          ref: `${canonicalName(scope, graph.name)}::${node.name}`,
        });
      }
    }
  }

  return { total, resolved };
}

function resolveLookChain(
  look: MtlxLook,
  lookMap: Map<string, MtlxLook>,
  diagnostics: ExpansionDiagnostic[],
  scope: string,
): string[] {
  const chain: string[] = [];
  const stack = new Set<string>();

  function walk(current: MtlxLook): void {
    if (stack.has(current.name)) {
      diagnostics.push({
        severity: 'error',
        code: 'D6R4-LOOK-001',
        message: `Look inheritance cycle detected at "${current.name}".`,
        scope,
        ref: canonicalName(scope, current.name),
      });
      return;
    }

    if (chain.includes(current.name)) return;

    stack.add(current.name);
    if (current.inherit) {
      const parent = lookMap.get(current.inherit);
      if (!parent) {
        diagnostics.push({
          severity: 'warning',
          code: 'D6R4-LOOK-002',
          message: `Look "${current.name}" inherits from missing look "${current.inherit}".`,
          scope,
          ref: canonicalName(scope, current.name),
        });
      } else {
        walk(parent);
      }
    }
    stack.delete(current.name);
    chain.push(current.name);
  }

  walk(look);
  return chain;
}

export async function expandAndFlattenMtlxDocument(entryFile: string): Promise<ExpandedMtlxPackage> {
  const entryPath = canonicalFilePath(entryFile);
  const rootDir = path.dirname(entryPath);

  const context: ExpandContext = {
    rootDir,
    generatedAt: new Date().toISOString(),
    requested: 0,
    resolved: 0,
    missing: 0,
    cycles: 0,
    cache: new Map<string, ParsedSourceDocument>(),
    order: [],
    diagnostics: [],
  };

  const root = await loadDocumentRecursive(entryPath, [], context);
  if (!root) {
    throw new Error(`Unable to load root MaterialX document: ${entryPath}`);
  }

  const graphNamesByScope = new Map<string, Set<string>>();
  const graphNamesGlobal = new Set<string>();
  for (const doc of context.order) {
    const names = new Set(doc.doc.nodegraphs.map((g) => g.name));
    graphNamesByScope.set(doc.scope, names);
    for (const name of names) graphNamesGlobal.add(name);
  }

  let refTotal = 0;
  let refResolved = 0;
  const nodegraphsCanonical: CanonicalNodegraphSummary[] = [];
  const looksCanonical: CanonicalLookSummary[] = [];

  let totalTypedefs = 0;
  let totalNodedefs = 0;
  let totalImplementations = 0;
  let totalNodegraphs = 0;
  let totalNodes = 0;
  let totalLooks = 0;
  let totalCollections = 0;
  let totalPropertysets = 0;
  let totalGeominfos = 0;

  const sourceDocs: ExpandedSourceDocument[] = [];

  for (const source of context.order) {
    const { doc, scope } = source;
    totalTypedefs += doc.typedefs.length;
    totalNodedefs += doc.nodedefs.length;
    totalImplementations += doc.implementations.length;
    totalNodegraphs += doc.nodegraphs.length;
    totalNodes += doc.nodes.length;
    totalLooks += doc.looks.length;
    totalCollections += doc.collections.length;
    totalPropertysets += doc.propertysets.length;
    totalGeominfos += doc.geominfos.length;

    const topNodeNames = new Set(doc.nodes.map((n) => n.name));

    for (const node of doc.nodes) {
      const refs = countRefsForTopNode(
        scope,
        node,
        topNodeNames,
        graphNamesByScope,
        graphNamesGlobal,
        context.diagnostics,
      );
      refTotal += refs.total;
      refResolved += refs.resolved;
    }

    for (const graph of doc.nodegraphs) {
      nodegraphsCanonical.push({
        scope,
        name: graph.name,
        canonicalName: canonicalName(scope, graph.name),
        nodeCount: graph.nodes.length,
        nodedef: graph.nodedef,
      });

      const localNodeNames = new Set(graph.nodes.map((n) => n.name));
      for (const node of graph.nodes) {
        const refs = countRefsForGraphNode(
          scope,
          graph,
          node,
          localNodeNames,
          graphNamesByScope,
          graphNamesGlobal,
          context.diagnostics,
        );
        refTotal += refs.total;
        refResolved += refs.resolved;
      }
    }

    const lookMap = new Map(doc.looks.map((l) => [l.name, l]));
    for (const look of doc.looks) {
      looksCanonical.push({
        scope,
        name: look.name,
        canonicalName: canonicalName(scope, look.name),
        inheritedChain: resolveLookChain(look, lookMap, context.diagnostics, scope),
        materialAssignCount: look.materialassigns.length,
      });
    }

    sourceDocs.push({
      scope,
      filePath: source.filePath,
      includes: [...source.includes].sort((a, b) => a.localeCompare(b)),
      stats: {
        typedefs: doc.typedefs.length,
        nodedefs: doc.nodedefs.length,
        implementations: doc.implementations.length,
        nodegraphs: doc.nodegraphs.length,
        nodes: doc.nodes.length,
        looks: doc.looks.length,
        collections: doc.collections.length,
        propertysets: doc.propertysets.length,
        geominfos: doc.geominfos.length,
      },
    });
  }

  nodegraphsCanonical.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
  looksCanonical.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
  sourceDocs.sort((a, b) => a.scope.localeCompare(b.scope) || a.filePath.localeCompare(b.filePath));

  context.diagnostics.sort((a, b) => {
    const rank: Record<ExpansionSeverity, number> = { error: 0, warning: 1, info: 2 };
    return rank[a.severity] - rank[b.severity]
      || a.code.localeCompare(b.code)
      || (a.scope ?? '').localeCompare(b.scope ?? '')
      || (a.ref ?? '').localeCompare(b.ref ?? '')
      || a.message.localeCompare(b.message);
  });

  const scopes = [...new Set(sourceDocs.map((d) => d.scope))].sort((a, b) => a.localeCompare(b));

  return {
    schema: 'mtlx-d6-r4-expanded-v1',
    generatedAt: context.generatedAt,
    entryFile: entryPath,
    includeSummary: {
      requested: context.requested,
      resolved: context.resolved,
      missing: context.missing,
      cycles: context.cycles,
    },
    expandedTotals: {
      documents: sourceDocs.length,
      typedefs: totalTypedefs,
      nodedefs: totalNodedefs,
      implementations: totalImplementations,
      nodegraphs: totalNodegraphs,
      nodes: totalNodes,
      looks: totalLooks,
      collections: totalCollections,
      propertysets: totalPropertysets,
      geominfos: totalGeominfos,
    },
    canonical: {
      scopes,
      nodegraphs: nodegraphsCanonical,
      looks: looksCanonical,
    },
    references: {
      total: refTotal,
      resolved: refResolved,
      unresolved: Math.max(0, refTotal - refResolved),
    },
    documents: sourceDocs,
    diagnostics: context.diagnostics,
  };
}

export function serializeExpandedMtlxPackage(value: ExpandedMtlxPackage): string {
  const normalized: ExpandedMtlxPackage = {
    ...value,
    canonical: {
      scopes: [...value.canonical.scopes].sort((a, b) => a.localeCompare(b)),
      nodegraphs: [...value.canonical.nodegraphs].sort((a, b) => a.canonicalName.localeCompare(b.canonicalName)),
      looks: [...value.canonical.looks]
        .map((look) => ({
          ...look,
          inheritedChain: [...look.inheritedChain].sort((a, b) => a.localeCompare(b)),
        }))
        .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName)),
    },
    documents: [...value.documents]
      .map((doc) => ({
        ...doc,
        includes: [...doc.includes].sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.scope.localeCompare(b.scope) || a.filePath.localeCompare(b.filePath)),
    diagnostics: [...value.diagnostics],
  };

  return JSON.stringify(normalized, null, 2);
}
