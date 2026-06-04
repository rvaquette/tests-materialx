# D6.R6 - Contrat de donnees runtime

Generated: 2026-06-04T10:11:23.489Z
Schema: mtlx-d6-runtime-contract-v1

## Totaux

| Metric | Value |
|---|---:|
| files | 3 |
| materials | 1 |
| textures | 0 |
| overrides | 0 |
| lights | 0 |
| env enabled | 1 |
| diagnostics error | 0 |
| diagnostics warning | 1 |
| diagnostics info | 1 |
| validation valid | 3 |
| validation invalid | 0 |
| validation errors | 0 |
| validation warnings | 2 |
| legacy inputs migrated | 3 |
| legacy loads validated | 3 |

## Fixtures

| Fixture | Schema | Active look | Materials | Textures | Overrides | Lights | Env | Valid | Errors | Warnings | Legacy migrated |
|---|---|---|---:|---:|---:|---:|---|---|---:|---:|---|
| materialx/Materials/TestSuite/stdlib/texture/udim.mtlx | mtlx-d6-runtime-contract-v1 | - | 1 | 0 | 0 | 0 | none | oui | 0 | 0 | oui |
| materialx/Materials/TestSuite/stdlib/texture/token_graph_material.mtlx | mtlx-d6-runtime-contract-v1 | - | 0 | 0 | 0 | 0 | latlong | oui | 0 | 1 | oui |
| materialx/Materials/Examples/StandardSurface/standard_surface_chess_set.mtlx | mtlx-d6-runtime-contract-v1 | L_ChessSet | 0 | 0 | 0 | 0 | none | oui | 0 | 1 | oui |

## Determinisme

- Fixture: materialx/Materials/TestSuite/stdlib/texture/token_graph_material.mtlx
- Double serialisation identique: oui

## Notes D6.R6

- D6.R6.a: schema versionne `mtlx-d6-runtime-contract-v1` pour le payload runtime final (materials, textures, overrides, lights, env).
- D6.R6.b: validation explicite (`validateRuntimeDataContract`) et gate pre-load (`loadRuntimeDataContract`).
- D6.R6.c: compatibilite ascendante via migration des entrees legacy scene/metadata et chargement d un payload legacy partiel.