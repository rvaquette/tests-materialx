/**
 * Parser: XML string → MtlxDocument
 *
 * Uses fast-xml-parser to turn the XML into a plain JS tree, then maps that
 * tree onto the typed MtlxDocument model.  Every attribute is preserved; any
 * unrecognised top-level element ends up in `unknownElements`.
 */

import { XMLParser } from 'fast-xml-parser';
import type {
  MtlxDocument,
  MtlxInput,
  MtlxOutput,
  MtlxMember,
  MtlxTypedef,
  MtlxNodedef,
  MtlxImplementation,
  MtlxNode,
  MtlxNodegraph,
  MtlxMaterialAssign,
  MtlxVisibilityAssign,
  MtlxLook,
  MtlxCollection,
  MtlxProperty,
  MtlxPropertySet,
  MtlxGeomProp,
  MtlxGeomInfo,
  MtlxRawElement,
} from './types.js';

// ---------------------------------------------------------------------------
// fast-xml-parser configuration
// ---------------------------------------------------------------------------

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseAttributeValue: false,   // keep everything as strings
  parseTagValue: false,
  isArray: (_name, _jpath, _isLeafNode, isAttribute) => {
    // Always wrap non-attribute elements in arrays so self-closing elements
    // (leaf nodes with only attributes, no text/children) are not lost.
    return !isAttribute;
  },
  trimValues: true,
  commentPropName: '#comment',
  stopNodes: [],
});

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

type RawObj = Record<string, unknown>;

function attr(raw: RawObj, key: string): string | undefined {
  const v = raw[`@_${key}`];
  return typeof v === 'string' ? v : undefined;
}

function attrStr(raw: RawObj, key: string, fallback = ''): string {
  return attr(raw, key) ?? fallback;
}

function attrBool(raw: RawObj, key: string): boolean | undefined {
  const v = attr(raw, key);
  if (v === undefined) return undefined;
  return v === 'true' || v === '1';
}

/** Return all attribute key/value pairs that are NOT in `knownKeys`. */
function extraAttrs(raw: RawObj, knownKeys: string[]): Record<string, string> {
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!k.startsWith('@_')) continue;
    const bare = k.slice(2);
    if (!knownKeys.includes(bare)) {
      extra[bare] = String(v);
    }
  }
  return extra;
}

function childArray(raw: RawObj, tag: string): RawObj[] {
  const v = raw[tag];
  if (!Array.isArray(v)) return [];
  return (v as unknown[]).filter((x): x is RawObj => typeof x === 'object' && x !== null) as RawObj[];
}

// ---------------------------------------------------------------------------
// Element parsers
// ---------------------------------------------------------------------------

function parseInput(raw: RawObj): MtlxInput {
  const known = ['name', 'type', 'value', 'nodename', 'nodegraph', 'output',
    'interfacename', 'colorspace', 'uniform', 'defaultgeomprop', 'implname', 'doc'];
  return {
    name: attrStr(raw, 'name'),
    type: attrStr(raw, 'type'),
    value: attr(raw, 'value'),
    nodename: attr(raw, 'nodename'),
    nodegraph: attr(raw, 'nodegraph'),
    output: attr(raw, 'output'),
    interfacename: attr(raw, 'interfacename'),
    colorspace: attr(raw, 'colorspace'),
    uniform: attrBool(raw, 'uniform'),
    defaultgeomprop: attr(raw, 'defaultgeomprop'),
    implname: attr(raw, 'implname'),
    doc: attr(raw, 'doc'),
    extra: extraAttrs(raw, known),
  };
}

function parseOutput(raw: RawObj): MtlxOutput {
  const known = ['name', 'type', 'nodename', 'value', 'doc'];
  return {
    name: attrStr(raw, 'name'),
    type: attrStr(raw, 'type'),
    nodename: attr(raw, 'nodename'),
    value: attr(raw, 'value'),
    doc: attr(raw, 'doc'),
    extra: extraAttrs(raw, known),
  };
}

function parseMember(raw: RawObj): MtlxMember {
  const known = ['name', 'type', 'value'];
  return {
    name: attrStr(raw, 'name'),
    type: attrStr(raw, 'type'),
    value: attr(raw, 'value'),
    extra: extraAttrs(raw, known),
  };
}

function parseTypedef(raw: RawObj): MtlxTypedef {
  const known = ['name'];
  return {
    name: attrStr(raw, 'name'),
    members: childArray(raw, 'member').map(parseMember),
    extra: extraAttrs(raw, known),
  };
}

function parseNodedef(raw: RawObj): MtlxNodedef {
  const known = ['name', 'node', 'nodegroup', 'version', 'isdefaultversion', 'doc',
    'nodename', 'type', 'namespace', 'context'];
  return {
    name: attrStr(raw, 'name'),
    node: attr(raw, 'node'),
    nodegroup: attr(raw, 'nodegroup'),
    version: attr(raw, 'version'),
    isdefaultversion: attrBool(raw, 'isdefaultversion'),
    doc: attr(raw, 'doc'),
    inputs: childArray(raw, 'input').map(parseInput),
    outputs: childArray(raw, 'output').map(parseOutput),
    extra: extraAttrs(raw, known),
  };
}

function parseImplementation(raw: RawObj): MtlxImplementation {
  const known = ['name', 'nodedef', 'target', 'sourcecode', 'file'];
  return {
    name: attrStr(raw, 'name'),
    nodedef: attrStr(raw, 'nodedef'),
    target: attr(raw, 'target'),
    sourcecode: attr(raw, 'sourcecode'),
    file: attr(raw, 'file'),
    inputs: childArray(raw, 'input').map(parseInput),
    extra: extraAttrs(raw, known),
  };
}

/**
 * Parse any element that represents a node instance.
 * `tag` is the XML element tag (= node category).
 */
function parseNode(tag: string, raw: RawObj): MtlxNode {
  const known = ['name', 'type', 'nodedef', 'version', 'doc'];
  return {
    category: tag,
    name: attrStr(raw, 'name'),
    type: attrStr(raw, 'type'),
    nodedef: attr(raw, 'nodedef'),
    version: attr(raw, 'version'),
    doc: attr(raw, 'doc'),
    inputs: childArray(raw, 'input').map(parseInput),
    outputs: childArray(raw, 'output').map(parseOutput),
    extra: extraAttrs(raw, known),
  };
}

function parseNodegraph(raw: RawObj): MtlxNodegraph {
  const known = ['name', 'nodedef'];
  const nodes: MtlxNode[] = [];

  // Every key that isn't a structural one or an attribute is a node category
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('@_')) continue;
    if (NODEGRAPH_STRUCTURAL_TAGS.has(key)) continue;
    if (key === '#comment') continue;
    if (!Array.isArray(value)) continue;
    for (const child of value as unknown[]) {
      if (typeof child === 'object' && child !== null) {
        nodes.push(parseNode(key, child as RawObj));
      }
    }
  }

  return {
    name: attrStr(raw, 'name'),
    nodedef: attr(raw, 'nodedef'),
    inputs: childArray(raw, 'input').map(parseInput),
    outputs: childArray(raw, 'output').map(parseOutput),
    nodes,
    extra: extraAttrs(raw, known),
  };
}

function parseMaterialAssign(raw: RawObj): MtlxMaterialAssign {
  const known = ['name', 'collection', 'material', 'geom', 'exclusive'];
  return {
    name: attrStr(raw, 'name'),
    collection: attr(raw, 'collection'),
    material: attr(raw, 'material'),
    geom: attr(raw, 'geom'),
    exclusive: attrBool(raw, 'exclusive'),
    extra: extraAttrs(raw, known),
  };
}

function parseVisibilityAssign(raw: RawObj): MtlxVisibilityAssign {
  const known = ['name', 'collection', 'geom', 'visibility', 'viewercollection', 'viewergeom'];
  return {
    name: attrStr(raw, 'name'),
    collection: attr(raw, 'collection'),
    geom: attr(raw, 'geom'),
    visibility: attrBool(raw, 'visibility'),
    viewercollection: attr(raw, 'viewercollection'),
    viewergeom: attr(raw, 'viewergeom'),
    extra: extraAttrs(raw, known),
  };
}

function parseLook(raw: RawObj): MtlxLook {
  const known = ['name', 'inherit'];
  return {
    name: attrStr(raw, 'name'),
    inherit: attr(raw, 'inherit'),
    materialassigns: childArray(raw, 'materialassign').map(parseMaterialAssign),
    visibilityassigns: childArray(raw, 'visibilityassign').map(parseVisibilityAssign),
    extra: extraAttrs(raw, known),
  };
}

function parseCollection(raw: RawObj): MtlxCollection {
  const known = ['name', 'geom', 'includecollection'];
  return {
    name: attrStr(raw, 'name'),
    geom: attr(raw, 'geom'),
    includecollection: attr(raw, 'includecollection'),
    extra: extraAttrs(raw, known),
  };
}

function parseProperty(raw: RawObj): MtlxProperty {
  const known = ['name', 'type', 'value'];
  return {
    name: attrStr(raw, 'name'),
    type: attrStr(raw, 'type'),
    value: attr(raw, 'value'),
    extra: extraAttrs(raw, known),
  };
}

function parsePropertySet(raw: RawObj): MtlxPropertySet {
  const known = ['name'];
  return {
    name: attrStr(raw, 'name'),
    properties: childArray(raw, 'property').map(parseProperty),
    extra: extraAttrs(raw, known),
  };
}

function parseGeomProp(raw: RawObj): MtlxGeomProp {
  const known = ['name', 'type', 'geomprop', 'value'];
  return {
    name: attrStr(raw, 'name'),
    type: attrStr(raw, 'type'),
    geomprop: attr(raw, 'geomprop'),
    value: attr(raw, 'value'),
    extra: extraAttrs(raw, known),
  };
}

function parseGeomInfo(raw: RawObj): MtlxGeomInfo {
  const known = ['name', 'geom'];
  return {
    name: attrStr(raw, 'name'),
    geom: attr(raw, 'geom'),
    geomprops: childArray(raw, 'geomprop').map(parseGeomProp),
    extra: extraAttrs(raw, known),
  };
}

/** Recursively build a raw element tree for unknown elements. */
function parseRawElement(tag: string, raw: RawObj): MtlxRawElement {
  const attributes: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('@_')) {
      attributes[k.slice(2)] = String(v);
    }
  }
  const children: MtlxRawElement[] = [];
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('@_') || k === '#comment') continue;
    if (Array.isArray(v)) {
      for (const child of v as unknown[]) {
        if (typeof child === 'object' && child !== null) {
          children.push(parseRawElement(k, child as RawObj));
        }
      }
    }
  }
  return { tag, attributes, children };
}

// ---------------------------------------------------------------------------
// Structural tag sets
// ---------------------------------------------------------------------------

/** Tags that are structural inside a `<nodegraph>` (not node instances). */
const NODEGRAPH_STRUCTURAL_TAGS = new Set([
  'input', 'output', '#comment', '#text',
]);

/** Tags that are structural at the `<materialx>` document level. */
const DOC_STRUCTURAL_TAGS = new Set([
  'nodedef',
  'nodegraph',
  'implementation',
  'typedef',
  'look',
  'collection',
  'propertyset',
  'geominfo',
  '#comment',
  '#text',
  'token',
  // XML namespace-prefixed tags are structural / meta elements (e.g. xi:include).
  // They are collected into unknownElements rather than treated as node instances.
  'xi:include',
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse an XML string containing a MaterialX document.
 * @param xml  Raw XML text (content of a .mtlx file).
 * @returns    A fully typed `MtlxDocument`.
 */
export function parseMtlx(xml: string): MtlxDocument {
  const root = parser.parse(xml) as RawObj;
  const mxArr = root['materialx'];
  if (!Array.isArray(mxArr) || mxArr.length === 0) {
    throw new Error('No <materialx> root element found.');
  }
  const mx = mxArr[0] as RawObj;

  const typedefs: MtlxTypedef[] = [];
  const nodedefs: MtlxNodedef[] = [];
  const implementations: MtlxImplementation[] = [];
  const nodegraphs: MtlxNodegraph[] = [];
  const nodes: MtlxNode[] = [];
  const looks: MtlxLook[] = [];
  const collections: MtlxCollection[] = [];
  const propertysets: MtlxPropertySet[] = [];
  const geominfos: MtlxGeomInfo[] = [];
  const unknownElements: MtlxRawElement[] = [];

  for (const [key, value] of Object.entries(mx)) {
    if (key.startsWith('@_') || key === '#comment') continue;
    if (!Array.isArray(value)) continue;

    for (const child of value as unknown[]) {
      if (typeof child !== 'object' || child === null) continue;
      const c = child as RawObj;

      switch (key) {
        case 'typedef':        typedefs.push(parseTypedef(c)); break;
        case 'nodedef':        nodedefs.push(parseNodedef(c)); break;
        case 'implementation': implementations.push(parseImplementation(c)); break;
        case 'nodegraph':      nodegraphs.push(parseNodegraph(c)); break;
        case 'look':           looks.push(parseLook(c)); break;
        case 'collection':     collections.push(parseCollection(c)); break;
        case 'propertyset':    propertysets.push(parsePropertySet(c)); break;
        case 'geominfo':       geominfos.push(parseGeomInfo(c)); break;
        default:
          if (!DOC_STRUCTURAL_TAGS.has(key)) {
            // Everything else is a top-level node instance.
            // Skip keys that look like XML processing instructions or namespace prefixes.
            if (!key.startsWith('#') && !key.startsWith('?')) {
              nodes.push(parseNode(key, c));
            }
          } else {
            unknownElements.push(parseRawElement(key, c));
          }
      }
    }
  }

  return {
    version: attrStr(mx, 'version'),
    colorspace: attr(mx, 'colorspace'),
    fileprefix: attr(mx, 'fileprefix'),
    typedefs,
    nodedefs,
    implementations,
    nodegraphs,
    nodes,
    looks,
    collections,
    propertysets,
    geominfos,
    unknownElements,
  };
}
