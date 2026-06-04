# D6.R5 - Politique de diagnostics D6

Generated: 2026-06-04T10:00:42.479Z
Schema: mtlx-d6-r5-diagnostics-v1
Corpus root: D:/WebGL2/tests-materialx/materialx/Materials

## Strict CI

- strict enabled: yes
- promote all warnings: no
- promote warning nodes: displacement, geomcolor, material, shader, token
- promoted warnings: 5
- blocking errors: 10
- CI pass: no

## Totaux

| Metric | Value |
|---|---:|
| rules | 27 |
| present nodes | 24 |
| diagnostics info | 0 |
| diagnostics warning | 5 |
| diagnostics error | 5 |
| effective diagnostics info | 0 |
| effective diagnostics warning | 0 |
| effective diagnostics error | 10 |

## Diagnostics

| Node | Count | Severity | Effective | Code | Message | Fallback |
|---|---:|---|---|---|---|---|
| displacement | 5 | warning | error | D6R5-WARNING-001 | displacement runtime support is partial in current pipeline. | Fallback to normal/bump approximation or emit explicit no-displacement policy. |
| foo_surface | 2 | error | error | D6R5-UNSUPPORTED-001 | Unsupported legacy test node foo_surface detected. | Replace with supported standard_surface/open_pbr_surface equivalent. |
| geomcolor | 3 | warning | error | D6R5-WARNING-001 | geomcolor is not mapped by default to a runtime material key. | Map geomcolor to an explicit material metadata property or ignore intentionally. |
| material | 3 | warning | error | D6R5-WARNING-001 | legacy material nodes need normalization toward surfacematerial. | Normalize legacy material references to surfacematerial during preprocessing. |
| mybsdf | 2 | error | error | D6R5-UNSUPPORTED-001 | Unsupported custom test node mybsdf detected. | Replace with supported BSDF node and migrate graph connections. |
| myedf | 1 | error | error | D6R5-UNSUPPORTED-001 | Unsupported custom test node myedf detected. | Replace with supported EDF node and migrate graph connections. |
| mymaterial | 1 | error | error | D6R5-UNSUPPORTED-001 | Unsupported custom test node mymaterial detected. | Replace with supported material node and provide migration mapping. |
| myshader | 1 | error | error | D6R5-UNSUPPORTED-001 | Unsupported custom test node myshader detected. | Replace with supported shader node and provide migration mapping. |
| shader | 2 | warning | error | D6R5-WARNING-001 | legacy shader nodes need normalization toward surfacematerial. | Normalize legacy shader references to surfacematerial during preprocessing. |
| token | 16 | warning | error | D6R5-WARNING-001 | token requires preprocessing substitution before runtime load. | Resolve token values at preprocess stage or provide deterministic defaults. |

## Couverture regles

| Node | Category | Severity | Present | Count |
|---|---|---|---:|---:|
| backdrop | ignore | info | yes | 1 |
| collection | supported | info | yes | 3 |
| displacement | warning | warning | yes | 5 |
| foo_surface | unsupported | error | yes | 2 |
| geomattr | supported | info | yes | 1 |
| geomattrvalue | supported | info | yes | 1 |
| geomcolor | warning | warning | yes | 3 |
| geominfo | supported | info | yes | 2 |
| geomprop | supported | info | yes | 1 |
| geompropdef | supported | info | no | 0 |
| geompropvalue | supported | info | yes | 8 |
| geompropvalueuniform | supported | info | yes | 1 |
| look | supported | info | yes | 7 |
| material | warning | warning | yes | 3 |
| materialassign | supported | info | yes | 26 |
| mybsdf | unsupported | error | yes | 2 |
| myedf | unsupported | error | yes | 1 |
| mymaterial | unsupported | error | yes | 1 |
| myshader | unsupported | error | yes | 1 |
| opgraph | ignore | info | yes | 1 |
| propertyset | supported | info | no | 0 |
| propertysetassign | supported | info | no | 0 |
| shader | warning | warning | yes | 2 |
| surfacematerial | supported | info | yes | 161 |
| token | warning | warning | yes | 16 |
| token_image | ignore | info | yes | 2 |
| volumematerial | supported | info | yes | 1 |

## Unknown candidates
- none

## Notes D6.R5
- D6.R5.a: messages explicites emis pour chaque noeud unsupported detecte.
- D6.R5.b: chaque diagnostic warning/error embarque une suggestion de fallback pipeline.
- D6.R5.c: mode strict CI disponible via `--strict` avec promotion configurable des warnings.