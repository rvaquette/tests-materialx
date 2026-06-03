# D6.R3 - Resolution des proprietes et metadata hors shader

Generated: 2026-06-03T21:21:12.706Z
Schema: mtlx-d6-r3-runtime-metadata-v1

## Totaux

| Metric | Value |
|---|---:|
| files | 4 |
| materials | 1 |
| mapped properties | 1 |
| unassigned properties | 2 |
| diagnostics error | 0 |
| diagnostics warning | 1 |
| diagnostics info | 2 |

## Fixtures

| Fixture | Active look | Materials | Mapped props | Unassigned props | Errors | Warnings | Infos |
|---|---|---:|---:|---:|---:|---:|---:|
| materialx/Materials/TestSuite/stdlib/texture/udim.mtlx | - | 1 | 1 | 0 | 0 | 0 | 1 |
| materialx/Materials/TestSuite/stdlib/upgrade/syntax_1_36.mtlx | - | 0 | 0 | 1 | 0 | 0 | 1 |
| materialx/Materials/TestSuite/stdlib/texture/token_graph_material.mtlx | - | 0 | 0 | 1 | 0 | 1 | 0 |
| materialx/Materials/Examples/StandardSurface/standard_surface_chess_set.mtlx | L_ChessSet | 0 | 0 | 0 | 0 | 0 | 0 |

## Determinisme

- Fixture: materialx/Materials/TestSuite/stdlib/texture/token_graph_material.mtlx
- Double serialisation identique: oui

## Notes D6.R3

- D6.R3.a: normalisation des unites angle/distance vers radian/metre quand possible.
- D6.R3.b: propagation des metadonnees vers materiaux via look actif et mapping mesh->material D6.R2.
- D6.R3.c: journal des proprietes non mappees et diagnostics de references/tokens non resolus.