import fs from 'node:fs/promises';
import path from 'node:path';

type Severity = 'info' | 'warning' | 'error';

type Rule = {
  node: string;
  severity: Severity;
  category: 'supported' | 'ignore' | 'warning' | 'unsupported';
  message: string;
  fallback: string;
};

type CoverageEntry = Rule & {
  count: number;
  present: boolean;
};

type NodeDiagnostic = {
  severity: Severity;
  effectiveSeverity: Severity;
  code: string;
  node: string;
  count: number;
  message: string;
  fallback: string;
  promotedByStrict: boolean;
};

type D6R5Report = {
  generatedAt: string;
  schema: 'mtlx-d6-r5-diagnostics-v1';
  corpusRoot: string;
  strict: {
    enabled: boolean;
    promoteAllWarnings: boolean;
    promoteWarningNodes: string[];
    promotedWarnings: number;
    blockingErrors: number;
    ciPass: boolean;
  };
  totals: {
    rules: number;
    presentNodes: number;
    diagnostics: {
      info: number;
      warning: number;
      error: number;
    };
    effectiveDiagnostics: {
      info: number;
      warning: number;
      error: number;
    };
  };
  coverage: CoverageEntry[];
  diagnostics: NodeDiagnostic[];
  unknownCandidates: Array<{ node: string; count: number }>;
};

const CORPUS_ROOT = 'D:/WebGL2/tests-materialx/materialx/Materials';
const REPORT_DIR = 'D:/WebGL2/tests-materialx/reports';
const REPORT_JSON = path.join(REPORT_DIR, 'mtlx-d6-r5-diagnostics.json');
const REPORT_MD = path.join(REPORT_DIR, 'mtlx-d6-r5-diagnostics.md');

const DEFAULT_PROMOTED_WARNING_NODES = ['token', 'geomcolor', 'displacement', 'shader', 'material'];

const RULES: Rule[] = [
  {
    node: 'look',
    severity: 'info',
    category: 'supported',
    message: 'Look is handled by scene translation (D6.R2).',
    fallback: 'No fallback required. Keep translated runtime assignments.',
  },
  {
    node: 'materialassign',
    severity: 'info',
    category: 'supported',
    message: 'materialassign is resolved to mesh->material mappings (D6.R2).',
    fallback: 'No fallback required. Use deterministic assignment order.',
  },
  {
    node: 'collection',
    severity: 'info',
    category: 'supported',
    message: 'collection selectors are expanded before runtime (D6.R2).',
    fallback: 'No fallback required. Expand wildcard selectors recursively.',
  },
  {
    node: 'propertyset',
    severity: 'info',
    category: 'supported',
    message: 'propertyset is consumed by metadata resolution (D6.R3).',
    fallback: 'No fallback required. Keep property mapping at preprocessing stage.',
  },
  {
    node: 'propertysetassign',
    severity: 'info',
    category: 'supported',
    message: 'propertysetassign is consumed by metadata resolution (D6.R3).',
    fallback: 'No fallback required. Resolve to material metadata package.',
  },
  {
    node: 'geominfo',
    severity: 'info',
    category: 'supported',
    message: 'geominfo is supported in metadata preprocessing (D6.R3).',
    fallback: 'No fallback required. Preserve normalized metadata values.',
  },
  {
    node: 'geompropdef',
    severity: 'info',
    category: 'supported',
    message: 'geompropdef is handled as preprocessing metadata declaration.',
    fallback: 'No fallback required. Keep declaration for downstream mapping.',
  },
  {
    node: 'geompropvalue',
    severity: 'info',
    category: 'supported',
    message: 'geompropvalue is propagated through metadata resolver (D6.R3).',
    fallback: 'No fallback required. Resolve against active look mapping.',
  },
  {
    node: 'geompropvalueuniform',
    severity: 'info',
    category: 'supported',
    message: 'geompropvalueuniform is normalized before runtime ingestion.',
    fallback: 'No fallback required. Keep normalized value in metadata package.',
  },
  {
    node: 'geomprop',
    severity: 'info',
    category: 'supported',
    message: 'geomprop references are resolved during preprocessing.',
    fallback: 'No fallback required. Keep references in metadata pipeline.',
  },
  {
    node: 'geomattr',
    severity: 'info',
    category: 'supported',
    message: 'geomattr is treated as metadata attribute input.',
    fallback: 'No fallback required. Map to runtime material metadata.',
  },
  {
    node: 'geomattrvalue',
    severity: 'info',
    category: 'supported',
    message: 'geomattrvalue is treated as metadata attribute value input.',
    fallback: 'No fallback required. Map to runtime material metadata.',
  },
  {
    node: 'geomcolor',
    severity: 'warning',
    category: 'warning',
    message: 'geomcolor is not mapped by default to a runtime material key.',
    fallback: 'Map geomcolor to an explicit material metadata property or ignore intentionally.',
  },
  {
    node: 'token',
    severity: 'warning',
    category: 'warning',
    message: 'token requires preprocessing substitution before runtime load.',
    fallback: 'Resolve token values at preprocess stage or provide deterministic defaults.',
  },
  {
    node: 'token_image',
    severity: 'info',
    category: 'ignore',
    message: 'token_image is out of D6 scene/meta scope.',
    fallback: 'Handle as D2 texture concern, not as D6 diagnostic failure.',
  },
  {
    node: 'opgraph',
    severity: 'info',
    category: 'ignore',
    message: 'opgraph is editorial and intentionally ignored in runtime.',
    fallback: 'Keep out of runtime contract and shader paths.',
  },
  {
    node: 'backdrop',
    severity: 'info',
    category: 'ignore',
    message: 'backdrop is editorial and ignored by runtime.',
    fallback: 'No fallback required. Ignore safely in preprocessing.',
  },
  {
    node: 'surfacematerial',
    severity: 'info',
    category: 'supported',
    message: 'surfacematerial is part of runtime linkage contract.',
    fallback: 'No fallback required. Preserve material linkage.',
  },
  {
    node: 'volumematerial',
    severity: 'info',
    category: 'supported',
    message: 'volumematerial is part of runtime linkage contract.',
    fallback: 'No fallback required. Preserve material linkage.',
  },
  {
    node: 'displacement',
    severity: 'warning',
    category: 'warning',
    message: 'displacement runtime support is partial in current pipeline.',
    fallback: 'Fallback to normal/bump approximation or emit explicit no-displacement policy.',
  },
  {
    node: 'shader',
    severity: 'warning',
    category: 'warning',
    message: 'legacy shader nodes need normalization toward surfacematerial.',
    fallback: 'Normalize legacy shader references to surfacematerial during preprocessing.',
  },
  {
    node: 'material',
    severity: 'warning',
    category: 'warning',
    message: 'legacy material nodes need normalization toward surfacematerial.',
    fallback: 'Normalize legacy material references to surfacematerial during preprocessing.',
  },
  {
    node: 'foo_surface',
    severity: 'error',
    category: 'unsupported',
    message: 'Unsupported legacy test node foo_surface detected.',
    fallback: 'Replace with supported standard_surface/open_pbr_surface equivalent.',
  },
  {
    node: 'myshader',
    severity: 'error',
    category: 'unsupported',
    message: 'Unsupported custom test node myshader detected.',
    fallback: 'Replace with supported shader node and provide migration mapping.',
  },
  {
    node: 'mymaterial',
    severity: 'error',
    category: 'unsupported',
    message: 'Unsupported custom test node mymaterial detected.',
    fallback: 'Replace with supported material node and provide migration mapping.',
  },
  {
    node: 'mybsdf',
    severity: 'error',
    category: 'unsupported',
    message: 'Unsupported custom test node mybsdf detected.',
    fallback: 'Replace with supported BSDF node and migrate graph connections.',
  },
  {
    node: 'myedf',
    severity: 'error',
    category: 'unsupported',
    message: 'Unsupported custom test node myedf detected.',
    fallback: 'Replace with supported EDF node and migrate graph connections.',
  },
];

function normalize(tag: string): string {
  return tag.trim().toLowerCase();
}

function parseArgs(args: string[]): {
  strict: boolean;
  promoteAllWarnings: boolean;
  promoteWarningNodes: Set<string>;
} {
  let strict = false;
  let promoteAllWarnings = false;
  const promoteWarningNodes = new Set(DEFAULT_PROMOTED_WARNING_NODES);

  for (const raw of args) {
    const arg = raw.trim();
    if (arg === '--strict') strict = true;
    if (arg === '--promote-all-warnings' || arg === '--fail-on-warning') {
      strict = true;
      promoteAllWarnings = true;
    }
    if (arg.startsWith('--promote-warning=')) {
      strict = true;
      const value = arg.slice('--promote-warning='.length);
      for (const token of value.split(',').map((x) => normalize(x)).filter(Boolean)) {
        promoteWarningNodes.add(token);
      }
    }
  }

  return { strict, promoteAllWarnings, promoteWarningNodes };
}

async function collectMtlxFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(current, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.mtlx')) files.push(p);
    }
  }
  return files;
}

function extractTagCounts(xml: string, counts: Map<string, number>): void {
  const re = /<\s*([A-Za-z_][A-Za-z0-9_]*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const tag = normalize(m[1]);
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
}

function findUnknownCandidates(counts: Map<string, number>, known: Set<string>): Array<{ node: string; count: number }> {
  return [...counts.entries()]
    .filter(([node]) => {
      if (known.has(node)) return false;
      return (
        node === 'look'
        || node.endsWith('assign')
        || node === 'collection'
        || node.startsWith('property')
        || node.startsWith('geom')
        || node === 'token'
        || node === 'opgraph'
        || node === 'backdrop'
      );
    })
    .map(([node, count]) => ({ node, count }))
    .sort((a, b) => b.count - a.count || a.node.localeCompare(b.node));
}

function diagnosticCode(rule: Rule): string {
  if (rule.category === 'unsupported') return 'D6R5-UNSUPPORTED-001';
  if (rule.category === 'warning') return 'D6R5-WARNING-001';
  if (rule.category === 'ignore') return 'D6R5-IGNORE-001';
  return 'D6R5-SUPPORTED-001';
}

function toMarkdown(report: D6R5Report): string {
  const lines: string[] = [];
  lines.push('# D6.R5 - Politique de diagnostics D6');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Schema: ${report.schema}`);
  lines.push(`Corpus root: ${report.corpusRoot}`);
  lines.push('');
  lines.push('## Strict CI');
  lines.push('');
  lines.push(`- strict enabled: ${report.strict.enabled ? 'yes' : 'no'}`);
  lines.push(`- promote all warnings: ${report.strict.promoteAllWarnings ? 'yes' : 'no'}`);
  lines.push(`- promote warning nodes: ${report.strict.promoteWarningNodes.join(', ') || 'none'}`);
  lines.push(`- promoted warnings: ${report.strict.promotedWarnings}`);
  lines.push(`- blocking errors: ${report.strict.blockingErrors}`);
  lines.push(`- CI pass: ${report.strict.ciPass ? 'yes' : 'no'}`);
  lines.push('');
  lines.push('## Totaux');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---:|');
  lines.push(`| rules | ${report.totals.rules} |`);
  lines.push(`| present nodes | ${report.totals.presentNodes} |`);
  lines.push(`| diagnostics info | ${report.totals.diagnostics.info} |`);
  lines.push(`| diagnostics warning | ${report.totals.diagnostics.warning} |`);
  lines.push(`| diagnostics error | ${report.totals.diagnostics.error} |`);
  lines.push(`| effective diagnostics info | ${report.totals.effectiveDiagnostics.info} |`);
  lines.push(`| effective diagnostics warning | ${report.totals.effectiveDiagnostics.warning} |`);
  lines.push(`| effective diagnostics error | ${report.totals.effectiveDiagnostics.error} |`);
  lines.push('');
  lines.push('## Diagnostics');
  lines.push('');
  lines.push('| Node | Count | Severity | Effective | Code | Message | Fallback |');
  lines.push('|---|---:|---|---|---|---|---|');
  for (const d of report.diagnostics) {
    lines.push(`| ${d.node} | ${d.count} | ${d.severity} | ${d.effectiveSeverity} | ${d.code} | ${d.message} | ${d.fallback} |`);
  }
  lines.push('');
  lines.push('## Couverture regles');
  lines.push('');
  lines.push('| Node | Category | Severity | Present | Count |');
  lines.push('|---|---|---|---:|---:|');
  for (const c of report.coverage) {
    lines.push(`| ${c.node} | ${c.category} | ${c.severity} | ${c.present ? 'yes' : 'no'} | ${c.count} |`);
  }
  lines.push('');
  lines.push('## Unknown candidates');
  if (report.unknownCandidates.length === 0) {
    lines.push('- none');
  } else {
    for (const c of report.unknownCandidates) {
      lines.push(`- ${c.node} (count=${c.count})`);
    }
  }
  lines.push('');
  lines.push('## Notes D6.R5');
  lines.push('- D6.R5.a: messages explicites emis pour chaque noeud unsupported detecte.');
  lines.push('- D6.R5.b: chaque diagnostic warning/error embarque une suggestion de fallback pipeline.');
  lines.push('- D6.R5.c: mode strict CI disponible via `--strict` avec promotion configurable des warnings.');
  return lines.join('\n');
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const files = await collectMtlxFiles(CORPUS_ROOT);
  const counts = new Map<string, number>();
  for (const filePath of files) {
    const xml = await fs.readFile(filePath, 'utf8');
    extractTagCounts(xml, counts);
  }

  const known = new Set(RULES.map((r) => r.node));
  const unknownCandidates = findUnknownCandidates(counts, known);

  const coverage: CoverageEntry[] = RULES
    .map((rule) => {
      const count = counts.get(rule.node) ?? 0;
      return {
        ...rule,
        count,
        present: count > 0,
      };
    })
    .sort((a, b) => a.node.localeCompare(b.node));

  const diagnostics: NodeDiagnostic[] = [];
  for (const entry of coverage) {
    if (!entry.present) continue;
    if (entry.severity === 'info') continue;

    const promote =
      args.strict
      && entry.severity === 'warning'
      && (args.promoteAllWarnings || args.promoteWarningNodes.has(entry.node));

    diagnostics.push({
      severity: entry.severity,
      effectiveSeverity: promote ? 'error' : entry.severity,
      code: diagnosticCode(entry),
      node: entry.node,
      count: entry.count,
      message: entry.message,
      fallback: entry.fallback,
      promotedByStrict: promote,
    });
  }

  for (const c of unknownCandidates) {
    const promote = args.strict && (args.promoteAllWarnings || args.promoteWarningNodes.has(c.node));
    diagnostics.push({
      severity: 'warning',
      effectiveSeverity: promote ? 'error' : 'warning',
      code: 'D6R5-UNKNOWN-001',
      node: c.node,
      count: c.count,
      message: `Unknown D6 candidate node "${c.node}" requires explicit policy classification.`,
      fallback: 'Classify node as supported/ignore/warning/error in D6 policy before CI promotion.',
      promotedByStrict: promote,
    });
  }

  diagnostics.sort((a, b) => {
    const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
    return rank[a.effectiveSeverity] - rank[b.effectiveSeverity]
      || a.node.localeCompare(b.node)
      || a.code.localeCompare(b.code);
  });

  const report: D6R5Report = {
    generatedAt: new Date().toISOString(),
    schema: 'mtlx-d6-r5-diagnostics-v1',
    corpusRoot: CORPUS_ROOT,
    strict: {
      enabled: args.strict,
      promoteAllWarnings: args.promoteAllWarnings,
      promoteWarningNodes: [...args.promoteWarningNodes].sort((a, b) => a.localeCompare(b)),
      promotedWarnings: diagnostics.filter((d) => d.promotedByStrict).length,
      blockingErrors: diagnostics.filter((d) => d.effectiveSeverity === 'error').length,
      ciPass: diagnostics.filter((d) => d.effectiveSeverity === 'error').length === 0,
    },
    totals: {
      rules: RULES.length,
      presentNodes: coverage.filter((c) => c.present).length,
      diagnostics: {
        info: diagnostics.filter((d) => d.severity === 'info').length,
        warning: diagnostics.filter((d) => d.severity === 'warning').length,
        error: diagnostics.filter((d) => d.severity === 'error').length,
      },
      effectiveDiagnostics: {
        info: diagnostics.filter((d) => d.effectiveSeverity === 'info').length,
        warning: diagnostics.filter((d) => d.effectiveSeverity === 'warning').length,
        error: diagnostics.filter((d) => d.effectiveSeverity === 'error').length,
      },
    },
    coverage,
    diagnostics,
    unknownCandidates,
  };

  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(REPORT_MD, toMarkdown(report), 'utf8');

  console.log(
    JSON.stringify(
      {
        reportJson: REPORT_JSON,
        reportMd: REPORT_MD,
        strict: report.strict,
        totals: report.totals,
      },
      null,
      2,
    ),
  );
  console.log('D6.R5 diagnostics policy OK');

  if (args.strict && !report.strict.ciPass) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
