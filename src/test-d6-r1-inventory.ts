import fs from 'node:fs/promises';
import path from 'node:path';

type D6Status = 'supporte' | 'ignore' | 'warning' | 'erreur';

type D6Rule = {
  node: string;
  status: D6Status;
  rationale: string;
};

type D6Entry = D6Rule & {
  count: number;
  present: boolean;
};

type D6Report = {
  generatedAt: string;
  corpusRoot: string;
  totals: {
    supporte: number;
    ignore: number;
    warning: number;
    erreur: number;
    presentNodes: number;
  };
  entries: D6Entry[];
  unknownCandidates: Array<{ node: string; count: number }>;
};

const CORPUS_ROOT = 'D:/WebGL2/tests-materialx/materialx/Materials';
const REPORT_DIR = 'D:/WebGL2/tests-materialx/reports';
const REPORT_JSON = path.join(REPORT_DIR, 'mtlx-d6-r1-inventory.json');
const REPORT_MD = path.join(REPORT_DIR, 'mtlx-d6-r1-inventory.md');

const D6_RULES: D6Rule[] = [
  { node: 'look', status: 'supporte', rationale: 'Mapping des looks vers les assignations runtime.' },
  { node: 'materialassign', status: 'supporte', rationale: 'Assignation de materiaux aux geometries/collections.' },
  { node: 'collection', status: 'supporte', rationale: 'Selection geometrique a resoudre avant shader.' },
  { node: 'propertyset', status: 'supporte', rationale: 'Conteneur de proprietes pipeline/runtime.' },
  { node: 'propertysetassign', status: 'supporte', rationale: 'Application de propertyset sur cibles de scene.' },
  { node: 'geominfo', status: 'supporte', rationale: 'Metadonnees geometriques pour preprocessing.' },
  { node: 'geompropdef', status: 'supporte', rationale: 'Definition de proprietes geometriques exploitees hors kernel.' },
  { node: 'geompropvalue', status: 'supporte', rationale: 'Valeurs de proprietes geometriques a propager dans le preprocessing runtime.' },
  { node: 'geompropvalueuniform', status: 'supporte', rationale: 'Variante uniforme des valeurs de geomprop pour normalisation pipeline.' },
  { node: 'geomprop', status: 'supporte', rationale: 'Reference de propriete geometrique a resoudre avant execution shader.' },
  { node: 'geomattr', status: 'supporte', rationale: 'Attribut geometrique a convertir en donnees runtime de scene.' },
  { node: 'geomattrvalue', status: 'supporte', rationale: 'Valeur explicite d attribut geometrique a integrer en preprocessing.' },
  { node: 'geomcolor', status: 'warning', rationale: 'Metadonnee de couleur geometrique: warning si non mappee vers une propriete runtime connue.' },
  { node: 'token', status: 'warning', rationale: 'Doit etre resolu au preprocessing; warning si non resolu.' },
  { node: 'token_image', status: 'ignore', rationale: 'Noeud texture D2 hors perimetre D6; exclu du suivi scene/meta D6.' },
  { node: 'opgraph', status: 'ignore', rationale: 'Noeud editorial/non runtime pour ce path tracer.' },
  { node: 'backdrop', status: 'ignore', rationale: 'Element UI/editor, sans impact rendu.' },
  { node: 'surfacematerial', status: 'supporte', rationale: 'Contrat pipeline de liaison vers surfaceshader.' },
  { node: 'volumematerial', status: 'supporte', rationale: 'Contrat pipeline de liaison vers volumeshader.' },
  { node: 'displacement', status: 'warning', rationale: 'Support partiel; fallback/warning selon capacites runtime.' },
  { node: 'shader', status: 'warning', rationale: 'Legacy/interop: journaliser et router vers fallback.' },
  { node: 'material', status: 'warning', rationale: 'Legacy/interop: normaliser vers surfacematerial.' },
  { node: 'foo_surface', status: 'erreur', rationale: 'Noeud legacy de test non supporte en production.' },
  { node: 'myshader', status: 'erreur', rationale: 'Noeud custom de test sans mapping connu.' },
  { node: 'mymaterial', status: 'erreur', rationale: 'Noeud custom de test sans mapping connu.' },
  { node: 'mybsdf', status: 'erreur', rationale: 'Noeud custom de test sans mapping connu.' },
  { node: 'myedf', status: 'erreur', rationale: 'Noeud custom de test sans mapping connu.' },
];

function normalize(tag: string): string {
  return tag.trim().toLowerCase();
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

function toMarkdown(report: D6Report): string {
  const lines: string[] = [];
  lines.push('# D6.R1 - Inventaire et classification des noeuds D6');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Corpus root: ${report.corpusRoot}`);
  lines.push('');
  lines.push('| Statut | Nombre de noeuds |');
  lines.push('|---|---:|');
  lines.push(`| supporte | ${report.totals.supporte} |`);
  lines.push(`| ignore | ${report.totals.ignore} |`);
  lines.push(`| warning | ${report.totals.warning} |`);
  lines.push(`| erreur | ${report.totals.erreur} |`);
  lines.push('');
  lines.push(`Noeuds D6 presents dans le corpus: ${report.totals.presentNodes}`);
  lines.push('');
  lines.push('| Noeud | Statut | Present | Occurrences | Rationale |');
  lines.push('|---|---|---:|---:|---|');
  for (const e of report.entries) {
    lines.push(`| ${e.node} | ${e.status} | ${e.present ? 'oui' : 'non'} | ${e.count} | ${e.rationale} |`);
  }
  lines.push('');
  lines.push('## Candidats non classes (heuristique D6)');
  if (report.unknownCandidates.length === 0) {
    lines.push('- none');
  } else {
    for (const c of report.unknownCandidates) {
      lines.push(`- ${c.node} (count=${c.count})`);
    }
  }
  lines.push('');
  lines.push('## Politique D6.R1');
  lines.push('- supporte: doit etre traduit en donnees runtime avant execution shader.');
  lines.push('- ignore: element editorial/outil, sans effet runtime.');
  lines.push('- warning: accepte avec avertissement et fallback documente.');
  lines.push('- erreur: rejet explicite tant qu aucun mapping de migration n est defini.');
  return lines.join('\n');
}

async function run(): Promise<void> {
  const files = await collectMtlxFiles(CORPUS_ROOT);
  const counts = new Map<string, number>();
  for (const filePath of files) {
    const xml = await fs.readFile(filePath, 'utf8');
    extractTagCounts(xml, counts);
  }

  const knownSet = new Set(D6_RULES.map((r) => r.node));
  const entries: D6Entry[] = D6_RULES.map((r) => {
    const count = counts.get(r.node) ?? 0;
    return { ...r, count, present: count > 0 };
  });

  const candidates = [...counts.entries()]
    .filter(([node]) => {
      if (knownSet.has(node)) return false;
      return (
        node === 'look' ||
        node.endsWith('assign') ||
        node === 'collection' ||
        node.startsWith('property') ||
        node.startsWith('geom') ||
        node === 'token' ||
        node === 'opgraph' ||
        node === 'backdrop'
      );
    })
    .map(([node, count]) => ({ node, count }))
    .sort((a, b) => b.count - a.count || a.node.localeCompare(b.node));

  const report: D6Report = {
    generatedAt: new Date().toISOString(),
    corpusRoot: CORPUS_ROOT,
    totals: {
      supporte: entries.filter((e) => e.status === 'supporte').length,
      ignore: entries.filter((e) => e.status === 'ignore').length,
      warning: entries.filter((e) => e.status === 'warning').length,
      erreur: entries.filter((e) => e.status === 'erreur').length,
      presentNodes: entries.filter((e) => e.present).length,
    },
    entries,
    unknownCandidates: candidates,
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
        present: report.entries.filter((e) => e.present).map((e) => ({ node: e.node, status: e.status, count: e.count })),
        unknownCandidates: report.unknownCandidates,
      },
      null,
      2,
    ),
  );
  console.log('D6.R1 inventory OK');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
