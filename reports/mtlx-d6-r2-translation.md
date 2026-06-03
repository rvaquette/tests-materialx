# D6.R2 - Traducteur scene MaterialX vers runtime interne

Generated: 2026-06-03T21:16:38.858Z
Schema: mtlx-scene-assignments-v1

## Totaux

| Metric | Value |
|---|---:|
| files | 3 |
| files with looks | 3 |
| translated looks | 5 |
| total assignments | 17 |
| diagnostics error | 0 |
| diagnostics warning | 6 |
| diagnostics info | 0 |

## Fixtures

| Fixture | Looks | Assignments | Active look | Errors | Warnings | Infos |
|---|---:|---:|---|---:|---:|---:|
| materialx/Materials/TestSuite/stdlib/geometric/look_assignment_order.mtlx | 1 | 2 | Look | 0 | 0 | 0 |
| materialx/Materials/TestSuite/stdlib/materials/material_node_discovery.mtlx | 3 | 0 | look1 | 0 | 6 | 0 |
| materialx/Materials/Examples/StandardSurface/standard_surface_chess_set.mtlx | 1 | 15 | L_ChessSet | 0 | 0 | 0 |

## Determinisme

- Fixture: materialx/Materials/TestSuite/stdlib/geometric/look_assignment_order.mtlx
- Double serialisation identique: oui

## Notes D6.R2

- D6.R2.a: resolution geom + collection + wildcard appliquee au mesh catalog runtime.
- D6.R2.b: priorite geree par ordre d application deterministic (heritage look puis ordre des materialassign).
- D6.R2.c: serialisation stable JSON (`serializeRuntimeSceneAssignment`).