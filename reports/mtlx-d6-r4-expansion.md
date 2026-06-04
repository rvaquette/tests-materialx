# D6.R4 - Pipeline d expansion / flattening document

Generated: 2026-06-04T09:53:14.701Z
Schema: mtlx-d6-r4-expanded-v1

## Totaux

| Metric | Value |
|---|---:|
| files | 3 |
| expanded documents | 4 |
| includes requested | 1 |
| includes resolved | 1 |
| includes missing | 0 |
| include cycles | 0 |
| unresolved references | 7 |
| diagnostics error | 0 |
| diagnostics warning | 7 |
| diagnostics info | 0 |

## Fixtures

| Fixture | Docs | Inc req | Inc ok | Inc miss | Inc cycle | Refs | Unresolved | Errors | Warnings | Infos |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| materialx/Materials/TestSuite/libraries/metal/brass_wire_mesh.mtlx | 2 | 1 | 1 | 0 | 0 | 16 | 7 | 0 | 7 | 0 |
| materialx/Materials/TestSuite/stdlib/geometric/look_assignment_order.mtlx | 1 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| materialx/Materials/Examples/StandardSurface/standard_surface_chess_set.mtlx | 1 | 0 | 0 | 0 | 0 | 114 | 0 | 0 | 0 | 0 |

## Determinisme

- Fixture: materialx/Materials/TestSuite/libraries/metal/brass_wire_mesh.mtlx
- Double serialisation identique: oui

## Notes D6.R4

- D6.R4.a: expansion recursive des includes avec protection anti cycles et diagnostics explicites.
- D6.R4.b: canonicalisation des scopes et noms (`scope::name`) pour looks et nodegraphs.
- D6.R4.c: emission d un artefact intermediaire inspectable et deterministe (JSON + markdown).