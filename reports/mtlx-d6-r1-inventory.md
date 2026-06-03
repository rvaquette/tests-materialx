# D6.R1 - Inventaire et classification des noeuds D6

Generated: 2026-06-03T21:10:33.545Z
Corpus root: D:/WebGL2/tests-materialx/materialx/Materials

| Statut | Nombre de noeuds |
|---|---:|
| supporte | 14 |
| ignore | 3 |
| warning | 5 |
| erreur | 5 |

Noeuds D6 presents dans le corpus: 24

| Noeud | Statut | Present | Occurrences | Rationale |
|---|---|---:|---:|---|
| look | supporte | oui | 7 | Mapping des looks vers les assignations runtime. |
| materialassign | supporte | oui | 26 | Assignation de materiaux aux geometries/collections. |
| collection | supporte | oui | 3 | Selection geometrique a resoudre avant shader. |
| propertyset | supporte | non | 0 | Conteneur de proprietes pipeline/runtime. |
| propertysetassign | supporte | non | 0 | Application de propertyset sur cibles de scene. |
| geominfo | supporte | oui | 2 | Metadonnees geometriques pour preprocessing. |
| geompropdef | supporte | non | 0 | Definition de proprietes geometriques exploitees hors kernel. |
| geompropvalue | supporte | oui | 8 | Valeurs de proprietes geometriques a propager dans le preprocessing runtime. |
| geompropvalueuniform | supporte | oui | 1 | Variante uniforme des valeurs de geomprop pour normalisation pipeline. |
| geomprop | supporte | oui | 1 | Reference de propriete geometrique a resoudre avant execution shader. |
| geomattr | supporte | oui | 1 | Attribut geometrique a convertir en donnees runtime de scene. |
| geomattrvalue | supporte | oui | 1 | Valeur explicite d attribut geometrique a integrer en preprocessing. |
| geomcolor | warning | oui | 3 | Metadonnee de couleur geometrique: warning si non mappee vers une propriete runtime connue. |
| token | warning | oui | 16 | Doit etre resolu au preprocessing; warning si non resolu. |
| token_image | ignore | oui | 2 | Noeud texture D2 hors perimetre D6; exclu du suivi scene/meta D6. |
| opgraph | ignore | oui | 1 | Noeud editorial/non runtime pour ce path tracer. |
| backdrop | ignore | oui | 1 | Element UI/editor, sans impact rendu. |
| surfacematerial | supporte | oui | 161 | Contrat pipeline de liaison vers surfaceshader. |
| volumematerial | supporte | oui | 1 | Contrat pipeline de liaison vers volumeshader. |
| displacement | warning | oui | 5 | Support partiel; fallback/warning selon capacites runtime. |
| shader | warning | oui | 2 | Legacy/interop: journaliser et router vers fallback. |
| material | warning | oui | 3 | Legacy/interop: normaliser vers surfacematerial. |
| foo_surface | erreur | oui | 2 | Noeud legacy de test non supporte en production. |
| myshader | erreur | oui | 1 | Noeud custom de test sans mapping connu. |
| mymaterial | erreur | oui | 1 | Noeud custom de test sans mapping connu. |
| mybsdf | erreur | oui | 2 | Noeud custom de test sans mapping connu. |
| myedf | erreur | oui | 1 | Noeud custom de test sans mapping connu. |

## Candidats non classes (heuristique D6)
- none

## Politique D6.R1
- supporte: doit etre traduit en donnees runtime avant execution shader.
- ignore: element editorial/outil, sans effet runtime.
- warning: accepte avec avertissement et fallback documente.
- erreur: rejet explicite tant qu aucun mapping de migration n est defini.