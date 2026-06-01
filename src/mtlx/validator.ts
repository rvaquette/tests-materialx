/**
 * Logical validator for a parsed MtlxDocument.
 *
 * Checks performed (from a construction / graph-topology perspective):
 *
 *   DOC-001  version attribute is present and non-empty.
 *   DOC-002  No duplicate names across top-level nodes & nodegraphs.
 *   DOC-003  No duplicate names among nodedefs.
 *   DOC-004  No duplicate names among implementations.
 *   DOC-005  No duplicate names among looks / collections.
 *
 *   ND-001   nodedef.node attribute is recommended (warning only).
 *   ND-002   A nodedef must have at least one output.
 *
 *   NG-001   When a nodegraph references a nodedef, that nodedef must exist.
 *   NG-002   No duplicate node names inside a nodegraph.
 *   NG-003   Each output of a nodegraph must reference an existing node
 *            (or be a pass-through) inside that graph.
 *   NG-004   Interface bindings (interfacename) inside a nodegraph must
 *            reference an input declared on the nodegraph's linked nodedef.
 *   NG-005   When a nodegraph implements a nodedef, its outputs must match
 *            the nodedef's outputs in name and type.
 *
 *   NODE-001 Each input with nodename must reference an existing node in scope.
 *   NODE-002 Each input with nodegraph must reference an existing nodegraph.
 *   NODE-003 When an input specifies an `output`, the referenced
 *            node/nodegraph must expose that output port.
 *   NODE-004 An input must have exactly one value source
 *            (value | nodename | nodegraph | interfacename).
 *
 *   IMPL-001 An implementation's nodedef must reference an existing nodedef.
 *
 *   LOOK-001 A materialassign's material must reference an existing node.
 *   LOOK-002 A materialassign's collection (if set) must reference an
 *            existing collection.
 *
 *   COLL-001 An includecollection must reference an existing collection.
 */

import type {
  MtlxDocument,
  MtlxInput,
  MtlxNode,
  MtlxNodegraph,
} from './types.js';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type Severity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  code: string;
  severity: Severity;
  message: string;
  /** Breadcrumb path into the document (e.g. "nodegraph[NG_foo]/node[bar]/input[in1]"). */
  path: string;
}

export interface ValidationResult {
  /** True when there are no 'error'-level issues. */
  valid: boolean;
  issues: ValidationIssue[];
  /** True when the document uses xi:include, meaning external names are unresolved. */
  hasXInclude: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class Validator {
  private issues: ValidationIssue[] = [];

  error(code: string, path: string, message: string): void {
    this.issues.push({ code, severity: 'error', path, message });
  }

  warn(code: string, path: string, message: string): void {
    this.issues.push({ code, severity: 'warning', path, message });
  }

  info(code: string, path: string, message: string): void {
    this.issues.push({ code, severity: 'info', path, message });
  }

  get result(): ValidationResult {
    return {
      valid: this.issues.every(i => i.severity !== 'error'),
      issues: this.issues,
      hasXInclude: false, // set by validateMtlx
    };
  }
}

function countValueSources(inp: MtlxInput): number {
  let n = 0;
  if (inp.value !== undefined)       n++;
  if (inp.nodename !== undefined)    n++;
  if (inp.nodegraph !== undefined)   n++;
  if (inp.interfacename !== undefined) n++;
  return n;
}

function collectNames<T extends { name: string }>(items: T[]): Set<string> {
  return new Set(items.map(i => i.name));
}

function checkDuplicates<T extends { name: string }>(
  v: Validator,
  items: T[],
  scope: string,
  code: string,
): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.name) continue;
    if (seen.has(item.name)) {
      v.error(code, scope, `Duplicate name "${item.name}".`);
    }
    seen.add(item.name);
  }
}

// ---------------------------------------------------------------------------
// Scope helpers
// ---------------------------------------------------------------------------

function nodesByName(nodes: MtlxNode[]): Map<string, MtlxNode> {
  return new Map(nodes.map(n => [n.name, n]));
}

function graphsByName(graphs: MtlxNodegraph[]): Map<string, MtlxNodegraph> {
  return new Map(graphs.map(g => [g.name, g]));
}

// ---------------------------------------------------------------------------
// Validators per construct
// ---------------------------------------------------------------------------

function validateInputs(
  v: Validator,
  inputs: MtlxInput[],
  path: string,
  scopeNodes: Map<string, MtlxNode>,
  scopeGraphs: Map<string, MtlxNodegraph>,
  nodedefInputNames: Set<string> | null, // for interfacename checks inside nodegraph nodes
): void {
  for (const inp of inputs) {
    const ipath = `${path}/input[${inp.name}]`;

    // NODE-004: exactly one value source
    const srcCount = countValueSources(inp);
    if (srcCount === 0) {
      // Inputs with no value/connection are technically allowed (use default from nodedef).
      // Issue an info only.
      v.info('NODE-004', ipath, 'Input has no value or connection (uses nodedef default).');
    } else if (srcCount > 1) {
      v.error('NODE-004', ipath,
        'Input has more than one value source (value/nodename/nodegraph/interfacename).');
    }

    // NODE-001: nodename reference
    if (inp.nodename !== undefined) {
      if (!scopeNodes.has(inp.nodename)) {
        v.error('NODE-001', ipath,
          `nodename="${inp.nodename}" does not reference a node in this scope.`);
      } else if (inp.output !== undefined) {
        // NODE-003: output port on node
        const target = scopeNodes.get(inp.nodename)!;
        if (target.outputs.length > 0) {
          const portNames = new Set(target.outputs.map(o => o.name));
          if (!portNames.has(inp.output)) {
            v.error('NODE-003', ipath,
              `output="${inp.output}" not found on node "${inp.nodename}" (ports: ${[...portNames].join(', ')}).`);
          }
        }
        // If the node is declared as multioutput but has no explicit port list,
        // the ports are defined by the nodedef – we cannot validate them here.
        else if (target.type !== 'multioutput') {
          v.warn('NODE-003', ipath,
            `output="${inp.output}" specified but node "${inp.nodename}" has no explicit output ports.`);
        }
      }
    }

    // NODE-002: nodegraph reference
    if (inp.nodegraph !== undefined) {
      if (!scopeGraphs.has(inp.nodegraph)) {
        v.error('NODE-002', ipath,
          `nodegraph="${inp.nodegraph}" does not reference a nodegraph in this document.`);
      } else if (inp.output !== undefined) {
        // NODE-003: output port on nodegraph
        const targetGraph = scopeGraphs.get(inp.nodegraph)!;
        const portNames = new Set(targetGraph.outputs.map(o => o.name));
        if (!portNames.has(inp.output)) {
          v.error('NODE-003', ipath,
            `output="${inp.output}" not found on nodegraph "${inp.nodegraph}" (ports: ${[...portNames].join(', ')}).`);
        }
      }
    }

    // NG-004: interfacename must reference a nodedef input
    if (inp.interfacename !== undefined && nodedefInputNames !== null) {
      if (!nodedefInputNames.has(inp.interfacename)) {
        v.error('NG-004', ipath,
          `interfacename="${inp.interfacename}" not found among nodedef inputs.`);
      }
    }
  }
}

function validateNodegraph(
  v: Validator,
  ng: MtlxNodegraph,
  allNodedefs: Map<string, import('./types.js').MtlxNodedef>,
  allGraphs: Map<string, MtlxNodegraph>,
  allDocNodes: Map<string, MtlxNode>,   // document-level scope for interface inputs
): void {
  const path = `nodegraph[${ng.name}]`;

  // NG-001: nodedef reference
  let nodedefInputNames: Set<string> | null = null;
  let nodedef = ng.nodedef ? allNodedefs.get(ng.nodedef) : undefined;
  if (ng.nodedef) {
    if (!nodedef) {
      v.error('NG-001', path,
        `nodedef="${ng.nodedef}" does not reference an existing nodedef.`);
    } else {
      nodedefInputNames = collectNames(nodedef.inputs);
    }
  }

  // For standalone nodegraphs, interfacename references resolve to the
  // graph's own declared interface inputs.
  const ngInterfaceNames: Set<string> =
    nodedef ? (nodedefInputNames ?? new Set()) : collectNames(ng.inputs);

  // NG-002: no duplicate node names
  checkDuplicates(v, ng.nodes, path, 'NG-002');

  const scopeNodes = nodesByName(ng.nodes);

  // NG-003: each output must reference an existing node in the graph
  for (const out of ng.outputs) {
    const opath = `${path}/output[${out.name}]`;
    if (out.nodename && !scopeNodes.has(out.nodename)) {
      v.error('NG-003', opath,
        `nodename="${out.nodename}" does not reference any node in the graph.`);
    }
  }

  // NG-005: outputs must match nodedef outputs
  if (nodedef) {
    const ndOutNames = new Set(nodedef.outputs.map(o => o.name));
    const ngOutNames = new Set(ng.outputs.map(o => o.name));
    for (const name of ndOutNames) {
      if (!ngOutNames.has(name)) {
        v.error('NG-005', path,
          `Nodegraph is missing output "${name}" required by nodedef "${ng.nodedef}".`);
      }
    }
    for (const ngOut of ng.outputs) {
      const ndOut = nodedef.outputs.find(o => o.name === ngOut.name);
      if (ndOut && ndOut.type && ngOut.type && ndOut.type !== ngOut.type) {
        v.error('NG-005', `${path}/output[${ngOut.name}]`,
          `Type mismatch: nodedef says "${ndOut.type}", nodegraph output says "${ngOut.type}".`);
      }
    }
  }

  // Validate inputs on each node in the graph (internal scope)
  for (const node of ng.nodes) {
    const npath = `${path}/node[${node.name}]`;
    validateInputs(v, node.inputs, npath, scopeNodes, allGraphs, ngInterfaceNames);
  }

  // Validate interface-level inputs of the nodegraph itself.
  // These connect the external scope (document-level) into the graph, so
  // nodename references must be resolved against the document-level nodes.
  validateInputs(v, ng.inputs, path, allDocNodes, allGraphs, null);
}

function validateTopLevelNodes(
  v: Validator,
  nodes: MtlxNode[],
  allGraphs: Map<string, MtlxNodegraph>,
): void {
  const scopeNodes = nodesByName(nodes);
  for (const node of nodes) {
    const path = `node[${node.name}]`;
    validateInputs(v, node.inputs, path, scopeNodes, allGraphs, null);
  }
}

function validateLooks(
  v: Validator,
  looks: import('./types.js').MtlxLook[],
  allNodes: Map<string, MtlxNode>,
  allGraphs: Map<string, MtlxNodegraph>,
  allCollections: Set<string>,
  hasXInclude: boolean,
): void {
  for (const look of looks) {
    const lpath = `look[${look.name}]`;
    for (const ma of look.materialassigns) {
      const mapath = `${lpath}/materialassign[${ma.name}]`;
      // LOOK-001: material can be a top-level node OR a nodegraph with a material output
      if (ma.material && !allNodes.has(ma.material) && !allGraphs.has(ma.material)) {
        if (hasXInclude) {
          v.warn('LOOK-001', mapath,
            `material="${ma.material}" not found in this file (may be defined in an xi:include).`);
        } else {
          v.error('LOOK-001', mapath,
            `material="${ma.material}" does not reference an existing top-level node or nodegraph.`);
        }
      }
      // LOOK-002
      if (ma.collection && !allCollections.has(ma.collection)) {
        if (hasXInclude) {
          v.warn('LOOK-002', mapath,
            `collection="${ma.collection}" not found in this file (may be defined in an xi:include).`);
        } else {
          v.error('LOOK-002', mapath,
            `collection="${ma.collection}" does not reference an existing collection.`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function validateMtlx(doc: MtlxDocument): ValidationResult {
  const v = new Validator();

  // Detect XInclude usage: any top-level node whose category starts with 'xi:'
  // or an unknown element tag containing 'include' signals that external
  // documents are being included. Cross-reference checks must be relaxed.
  const hasXInclude =
    doc.nodes.some(n => n.category.startsWith('xi:')) ||
    doc.unknownElements.some(e => e.tag === 'xi:include');
  // DOC-001: version
  if (!doc.version || doc.version.trim() === '') {
    v.error('DOC-001', 'materialx', 'Missing or empty "version" attribute.');
  }

  // Build global look-up maps
  const allNodedefs = new Map(doc.nodedefs.map(nd => [nd.name, nd]));
  const allGraphs = graphsByName(doc.nodegraphs);
  const allTopNodes = nodesByName(doc.nodes);
  const allCollectionNames = collectNames(doc.collections);

  // DOC-002: duplicate top-level node / nodegraph names combined
  checkDuplicates(v, [...doc.nodes, ...doc.nodegraphs], 'materialx', 'DOC-002');

  // DOC-003: duplicate nodedef names
  checkDuplicates(v, doc.nodedefs, 'materialx/nodedefs', 'DOC-003');

  // DOC-004: duplicate implementation names
  checkDuplicates(v, doc.implementations, 'materialx/implementations', 'DOC-004');

  // DOC-005: duplicate look / collection names
  checkDuplicates(v, doc.looks, 'materialx/looks', 'DOC-005');
  checkDuplicates(v, doc.collections, 'materialx/collections', 'DOC-005');

  // ND-001 / ND-002: nodedef checks
  for (const nd of doc.nodedefs) {
    const ndpath = `nodedef[${nd.name}]`;
    if (!nd.node) {
      v.warn('ND-001', ndpath, 'nodedef is missing the "node" attribute (node category).');
    }
    if (nd.outputs.length === 0) {
      v.warn('ND-002', ndpath, 'nodedef has no output declarations.');
    }
  }

  // IMPL-001: implementation nodedef references
  for (const impl of doc.implementations) {
    const ipath = `implementation[${impl.name}]`;
    if (!allNodedefs.has(impl.nodedef)) {
      v.error('IMPL-001', ipath,
        `nodedef="${impl.nodedef}" does not reference an existing nodedef.`);
    }
  }

  // Validate nodegraphs
  for (const ng of doc.nodegraphs) {
    validateNodegraph(v, ng, allNodedefs, allGraphs, allTopNodes);
  }

  // Validate top-level nodes
  validateTopLevelNodes(v, doc.nodes, allGraphs);

  // LOOK-001 / LOOK-002
  // When XInclude is used, materials may be defined in included files; demote to warnings.
  validateLooks(v, doc.looks, allTopNodes, allGraphs, allCollectionNames, hasXInclude);

  // COLL-001: includecollection references
  for (const coll of doc.collections) {
    if (coll.includecollection) {
      for (const ref of coll.includecollection.split(',').map(s => s.trim()).filter(Boolean)) {
        if (!allCollectionNames.has(ref)) {
          v.error('COLL-001', `collection[${coll.name}]`,
            `includecollection="${ref}" does not reference an existing collection.`);
        }
      }
    }
  }

  return {
    ...v.result,
    hasXInclude,
  };
}
