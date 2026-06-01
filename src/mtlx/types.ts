/**
 * Completely generic MaterialX (.mtlx) type model.
 *
 * The model is structured in two complementary layers:
 *   1. A fully typed layer covering every known MTLX construct.
 *   2. A raw generic element tree (`MtlxRawElement`) that captures anything
 *      not covered by the typed layer so that no information is ever lost.
 *
 * Key concepts from the MaterialX specification:
 *   - A `nodedef`  declares the signature of a node (inputs, outputs, type).
 *   - A `nodegraph` is a subgraph: either a standalone graph or the body of a
 *     `nodedef` (when its `nodedef` attribute references one).
 *   - An `implementation` maps a `nodedef` to inline source code or an external
 *     file for a specific code-generation target.
 *   - A `typedef` introduces a named struct type with typed `member` fields.
 *   - Every other top-level or in-graph element is a **node instance** whose
 *     XML tag is the node *category* (e.g. "standard_surface", "multiply").
 *   - `look` / `collection` / `propertyset` / `geominfo` handle scene
 *     assignment and geometry metadata.
 */

// ---------------------------------------------------------------------------
// Primitive / shared building blocks
// ---------------------------------------------------------------------------

/** A single input port on a node, nodedef, nodegraph interface, or implementation. */
export interface MtlxInput {
  /** Input port identifier. */
  name: string;
  /** MaterialX type string (e.g. "float", "color3", "surfaceshader", …). */
  type: string;

  // --- Value source: exactly one of the following groups is expected ---

  /** Literal value when the input is not connected. */
  value?: string;
  /** Name of a node in the same scope whose output feeds this input. */
  nodename?: string;
  /** Name of a nodegraph whose output feeds this input. */
  nodegraph?: string;
  /** Output port name on the connected node/nodegraph (for multi-output nodes). */
  output?: string;
  /** Interface input name on the enclosing nodegraph's nodedef this input binds to. */
  interfacename?: string;

  // --- Optional metadata ---
  colorspace?: string;
  /** True if this input should be treated as a uniform (not interpolated). */
  uniform?: boolean;
  /** Name of a geometric property to use as the default value. */
  defaultgeomprop?: string;
  /** Alternate name used in the implementation source code. */
  implname?: string;
  doc?: string;

  /** Extra attributes not covered by the typed fields above. */
  extra: Record<string, string>;
}

/** An output port on a node, nodedef, or nodegraph. */
export interface MtlxOutput {
  name: string;
  type: string;
  /** Node in the same scope that drives this output. */
  nodename?: string;
  /** Default value (rarely used). */
  value?: string;
  doc?: string;
  extra: Record<string, string>;
}

/** A single field inside a `typedef` struct. */
export interface MtlxMember {
  name: string;
  type: string;
  value?: string;
  extra: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Top-level document constructs
// ---------------------------------------------------------------------------

/** A custom struct type definition (`<typedef>`). */
export interface MtlxTypedef {
  name: string;
  members: MtlxMember[];
  extra: Record<string, string>;
}

/**
 * A node *definition* (`<nodedef>`): the signature (inputs / outputs) of a
 * reusable node category.
 */
export interface MtlxNodedef {
  name: string;
  /** The node category this definition covers (maps to the XML tag of instances). */
  node?: string;
  /** Functional group / namespace. */
  nodegroup?: string;
  version?: string;
  isdefaultversion?: boolean;
  doc?: string;
  inputs: MtlxInput[];
  outputs: MtlxOutput[];
  extra: Record<string, string>;
}

/**
 * A code-generation implementation for a `nodedef` (`<implementation>`).
 * Carries either inline `sourcecode` or an external `file`, for one `target`.
 */
export interface MtlxImplementation {
  name: string;
  /** References an existing `MtlxNodedef.name`. */
  nodedef: string;
  /** Code-gen target identifier (e.g. "genglsl", "genosl", "genmdl"). */
  target?: string;
  /** Inline source-code snippet. */
  sourcecode?: string;
  /** Path to an external implementation file. */
  file?: string;
  /** Per-port renaming overrides for the implementation. */
  inputs: MtlxInput[];
  extra: Record<string, string>;
}

/**
 * A **node instance**: any element inside `<materialx>` or `<nodegraph>` that
 * is not a structural element (nodedef / nodegraph / typedef / …).
 * The XML tag name is the node *category*.
 */
export interface MtlxNode {
  /** XML tag = node category (e.g. "standard_surface", "multiply", "image"). */
  category: string;
  name: string;
  /** Output type of the node (e.g. "surfaceshader", "float", "multioutput"). */
  type: string;
  /** Explicit nodedef reference (overrides implicit category look-up). */
  nodedef?: string;
  version?: string;
  doc?: string;
  inputs: MtlxInput[];
  /**
   * Inline output declarations – only used on multi-output nodes that declare
   * their ports explicitly, or inside nodegraphs.
   */
  outputs: MtlxOutput[];
  extra: Record<string, string>;
}

/**
 * A subgraph / node-graph (`<nodegraph>`).
 * - Standalone when `nodedef` is absent.
 * - The *body* of a `MtlxNodedef` when `nodedef` is present.
 */
export interface MtlxNodegraph {
  name: string;
  /** References the `MtlxNodedef.name` this graph implements. */
  nodedef?: string;
  /** Interface inputs (only meaningful when the graph is standalone or a nodedef body). */
  inputs: MtlxInput[];
  outputs: MtlxOutput[];
  /** All node instances contained in the graph. */
  nodes: MtlxNode[];
  extra: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Look / scene-assignment constructs
// ---------------------------------------------------------------------------

export interface MtlxMaterialAssign {
  name: string;
  /** References a `MtlxCollection.name`. */
  collection?: string;
  /** References the material node name. */
  material?: string;
  geom?: string;
  exclusive?: boolean;
  extra: Record<string, string>;
}

export interface MtlxVisibilityAssign {
  name: string;
  collection?: string;
  geom?: string;
  visibility?: boolean;
  viewercollection?: string;
  viewergeom?: string;
  extra: Record<string, string>;
}

export interface MtlxLook {
  name: string;
  inherit?: string;
  materialassigns: MtlxMaterialAssign[];
  visibilityassigns: MtlxVisibilityAssign[];
  extra: Record<string, string>;
}

export interface MtlxCollection {
  name: string;
  geom?: string;
  includecollection?: string;
  extra: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Property-set and geometry-info constructs
// ---------------------------------------------------------------------------

export interface MtlxProperty {
  name: string;
  type: string;
  value?: string;
  extra: Record<string, string>;
}

export interface MtlxPropertySet {
  name: string;
  properties: MtlxProperty[];
  extra: Record<string, string>;
}

export interface MtlxGeomProp {
  name: string;
  type: string;
  geomprop?: string;
  value?: string;
  extra: Record<string, string>;
}

export interface MtlxGeomInfo {
  name: string;
  geom?: string;
  geomprops: MtlxGeomProp[];
  extra: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Raw / escape-hatch for unknown elements
// ---------------------------------------------------------------------------

/**
 * A fully generic tree node that represents any XML element not (or not yet)
 * covered by the typed structures above.  This guarantees that the parser
 * never silently drops information.
 */
export interface MtlxRawElement {
  tag: string;
  attributes: Record<string, string>;
  children: MtlxRawElement[];
  text?: string;
}

// ---------------------------------------------------------------------------
// Root document
// ---------------------------------------------------------------------------

/**
 * The root `<materialx>` document.
 * All parsed content is collected here.
 */
export interface MtlxDocument {
  /** MaterialX spec version (e.g. "1.39"). */
  version: string;
  colorspace?: string;
  fileprefix?: string;

  typedefs: MtlxTypedef[];
  nodedefs: MtlxNodedef[];
  implementations: MtlxImplementation[];
  nodegraphs: MtlxNodegraph[];
  /** Top-level node instances (outside any nodegraph). */
  nodes: MtlxNode[];
  looks: MtlxLook[];
  collections: MtlxCollection[];
  propertysets: MtlxPropertySet[];
  geominfos: MtlxGeomInfo[];

  /**
   * Any element at document level whose tag is not handled by the typed
   * categories above (forward-compatibility escape hatch).
   */
  unknownElements: MtlxRawElement[];
}
