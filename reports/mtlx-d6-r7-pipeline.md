# D6.R7 - Tests pipeline D6

Generated: 2026-06-04T11:51:35.242Z
Schema: mtlx-d6-r7-pipeline-tests-v1

## Totaux

| Metric | Value |
|---|---:|
| tests | 9 |
| pass | 9 |
| fail | 0 |

## D6.R7.a - Golden tests

- pass: 3
- fail: 0

| Fixture | Status | Checks |
|---|---|---|
| materialx/Materials/TestSuite/stdlib/geometric/look_assignment_order.mtlx | pass | mesh /Preview_Mesh -> Blue_Material ; mesh /Calibration_Mesh -> Red_Material |
| materialx/Materials/TestSuite/stdlib/texture/udim.mtlx | pass | cube_material exists ; udimset stringarray propagated |
| materialx/Materials/TestSuite/stdlib/texture/token_graph_material.mtlx | pass | top-level token Brass_Image_Extension=jpg ; token mirrored into unassigned runtime properties |

## D6.R7.b - Non-regression scenes look/materialassign/collection

- pass: 3
- fail: 0
- deterministic fixture: materialx/Materials/Examples/StandardSurface/standard_surface_chess_set.mtlx
- deterministic serialization: yes

| Fixture | Status | Active look | Looks | Assignments | Errors | Warnings | Infos | Checks |
|---|---|---|---:|---:|---:|---:|---:|---|
| materialx/Materials/TestSuite/stdlib/geometric/look_assignment_order.mtlx | pass | Look | 1 | 2 | 0 | 0 | 0 | active look remains Look ; resolved assignment cardinality remains 2 |
| materialx/Materials/TestSuite/stdlib/materials/material_node_discovery.mtlx | pass | look1 | 3 | 0 | 0 | 6 | 0 | collection-based assign still emits D6R2-COLL-003 warning ; no scene-level error regression |
| materialx/Materials/Examples/StandardSurface/standard_surface_chess_set.mtlx | pass | L_ChessSet | 1 | 15 | 0 | 0 | 0 | active look remains L_ChessSet ; at least 15 resolved assignments preserved |

## D6.R7.c - Erreurs attendues

- pass: 3
- fail: 0

| Case | Status | Expected | Observed | Checks |
|---|---|---|---|---|
| invalid-node-references | pass | NODE-001, NODE-002 | NODE-001, NODE-002 | Unresolved nodename is detected. ; Unresolved nodegraph is detected. |
| invalid-references | pass | LOOK-001, LOOK-002 | LOOK-001, LOOK-002 | Unknown material reference reported. ; Unknown collection reference reported. |
| incomplete-document | pass | DOC-001, ND-002 | DOC-001, ND-002 | Missing version detected. ; Nodedef without output detected. |