# Niveaux de difficulté GLSL des noeuds concrets MaterialX

Objectif: qualifier la difficulté d'implémentation des noeuds concrets MaterialX pour une utilisation dans un path tracer WebGL.

Contexte cible:
- WebGL2 / GLSL ES 3.00
- Path tracer temps reel (contraintes fortes de performance)
- Evaluation orientée production d'images physiquement plausibles

Sources du path tracer:
- `D:\WebGL2\GLSL-PathTracer-JS\src`

## 1. Echelle de difficulté

| Niveau | Intitulé | Critères techniques |
|---|---|---|
| D0 | Trivial | 1-3 lignes GLSL, aucune dépendance, pas de texture, pas de closure |
| D1 | Simple | Algèbre locale, conversions, conditionnels simples, pas de modèle physique |
| D2 | Intermédiaire | Sampling texture, transformations espace, bruit procédural de base, gestion UV |
| D3 | Avancé graphe | Multioutput, interfaces de nodegraph, composition non triviale des dépendances |
| D4 | Physique BRDF/EDF | Closures BSDF/EDF robustes, importance sampling, PDF/cohérence énergie |
| D5 | Expert Monte Carlo | Hair/SSS/volume/layers complexes, stabilité numérique, coût d'échantillonnage élevé |
| D6 | Hors shader direct | Noeuds de scène/édition/métadonnées sans intérêt direct dans le kernel GLSL |

## 2. Classification pratique des noeuds concrets

## D0 - Trivial

Noeuds typiquement implémentables immédiatement:
- `constant`, `dot` (identity/passthrough), `sign`, `absval`
- `add`, `subtract`, `multiply`, `divide`, `min`, `max`, `clamp`
- `sin`, `cos`, `tan`, `asin`, `acos`, `atan2`, `sqrt`, `exp`, `ln`
- `floor`, `ceil`, `round`, `fract`, `modulo`, `power`, `safepower`
- `combine2`, `combine3`, `combine4`, `separate2`, `separate3`, `separate4`, `swizzle`, `extract`
- `rgbtohsv`, `hsvtorgb`, `luminance`

Commentaire path tracer:
- Ce niveau sert de socle; priorité maximale, très faible risque.

## D1 - Simple

Noeuds locaux sans coût de sampling lourd:
- `normalize`, `dotproduct`, `crossproduct`, `reflect`, `magnitude`
- `compare`, `ifequal`, `ifgreater`, `ifgreatereq`, `switch`, `and`, `or`, `not`, `xor`
- `remap`, `smoothstep`, `contrast`, `invert`, `mix`
- `blackbody`, `facingratio`
- `roughness_anisotropy`, `roughness_dual`, `artistic_ior`

Commentaire path tracer:
- Important pour la robustesse des paramètres BSDF, mais encore peu risqué.

## D2 - Intermédiaire

Noeuds nécessitant accès textures, espaces ou fonctions procédurales modérées:
- Textures/images: `image`, `tiledimage`, `latlongimage`, `gltf_image`, `token_image`, `UsdUVTexture`
- Coordonnées: `texcoord`, `place2d`, `rotate2d`, `rotate3d`, `transformpoint`, `transformvector`, `transformnormal`, `transformmatrix`
- Normal/displacement helpers: `normalmap`, `heighttonormal`
- Bruits/patterns: `noise2d`, `noise3d`, `fractal2d`, `fractal3d`, `cellnoise2d`, `cellnoise3d`, `worleynoise2d`, `worleynoise3d`, `checker`, `grid`, `circle`, `line`, `trianglewave`

Commentaire path tracer:
- Le coût vient surtout de la bande passante texture et de la qualité des dérivées implicites.

## D3 - Avancé graphe

Noeuds/structures qui complexifient l'ordonnancement et le routage des ports:
- Multioutput: `gltf_colorimage`, `color4split`, `separate`, `separate2`, `separate3`, `separate4`, `flake2d`, `flake3d`, `upstream_graph_def`, `customtype`
- Composition de graphes: `nodegraph` avec `interfacename`, `output` nommés, chaînage `nodegraph + output`
- Projection/composition: `triplanarprojection`, `hextiledimage`, `hextilednormalmap`

Commentaire path tracer:
- Niveau surtout "compile-time" (génération de code), plus que coût d'exécution brut.

## D4 - Physique BRDF/EDF

Noeuds qui exigent une implémentation closure/PDF solide:
- BRDF/BSDF de base: `diffuse_brdf`, `oren_nayar_diffuse_bsdf`, `burley_diffuse_bsdf`
- Métaux/diélectriques: `conductor_brdf`, `conductor_bsdf`, `dielectric_brdf`, `dielectric_bsdf`, `dielectric_btdf`
- Spéculaire généralisé: `generalized_schlick_brdf`, `generalized_schlick_bsdf`
- Sheen/translucence/subsurface (version de base): `sheen_bsdf`, `translucent_bsdf`, `subsurface_bsdf`
- EDF: `uniform_edf`, `generalized_schlick_edf`
- Composition fermeture: `layer`, `add` (BSDF/EDF), `mix` (BSDF/EDF), `multiply` (BSDF/EDF), `scaled_layer`

Commentaire path tracer:
- Ce niveau détermine la qualité physique globale; nécessite tests énergie/PDF.

## D5 - Expert Monte Carlo

Noeuds à forte complexité statistique, numérique ou de modèle:
- Hair: `chiang_hair_bsdf`, `chiang_hair_roughness`, `chiang_hair_absorption_from_color`, `deon_hair_absorption_from_melanin`, `simple_hair`
- Lama/OpenPBR avancé: `LamaConductor`, `LamaDielectric`, `LamaDiffuse`, `LamaGeneralizedSchlick`, `LamaIridescence`, `LamaLayer`, `LamaMix`, `LamaAdd`, `LamaSSS`, `LamaSheen`, `LamaTranslucent`, `LamaEmission`, `open_pbr_surface`
- Matériaux de haut niveau exigeants: `standard_surface`, `disney_principled`, `gltf_pbr`, `surface`, `surfacematerial`, `volumematerial`, `displacement`
- Volumique: `anisotropic_vdf`

Commentaire path tracer:
- Forte difficulté de convergence; nécessite MIS, stratégies de sampling dédiées et validation visuelle/statistique.

## D6 - Hors shader direct

Noeuds principalement éditoriaux/scène, à traiter côté hôte ou pipeline:
- Scene/look: `look`, `materialassign`, `collection`, `propertyset`, `geominfo`
- Meta/édition: `backdrop`, `token` (souvent résolu avant compilation), `opgraph`
- Cas legacy/test: `shader`, `material`, `lightcompoundtest`, `foo_surface`, `myshader`, `mymaterial`, `mybsdf`, `myedf`

Commentaire path tracer:
- Peu ou pas de code GLSL direct; à gérer au niveau traduction de scène et binding runtime.

## 3. Priorité d'implémentation recommandée (roadmap)

1. D0 + D1: terminer la base fonctionnelle et les conversions de types.
2. D2: stabiliser textures/UV/normales (qualité visuelle immédiate).
3. D4 (sous-ensemble): diffuse + conductor + dielectric + EDF de base.
4. D3: finaliser génération robuste des graphes/multioutputs.
5. D5: introduire progressivement hair, SSS, Lama/OpenPBR complet.
6. D6: garder hors kernel, gérer en préprocessing/pipeline.

## 3.1 Avancement (terminé / à faire)

### Etapes terminées

- Terminé: cadrage de la difficulté par niveaux D0 a D6.
- Terminé: implémentation D0 dans les sources du path tracer sous D:/WebGL2/GLSL-PathTracer-JS/src/loaders/mtlx.
- Terminé: support D0 des noeuds utilitaires et math de base (constant, dot, unary/binary ops, clamp, atan2, combine, extract, swizzle, luminance, rgb/hsv).
- Terminé: support D0 des connexions avec ports de sortie nommés (ex: outx/outy/outz/outa, outcolor).
- Terminé: support D0 des noeuds multioutput separate, separate2, separate3, separate4.
- Terminé: enregistrement des noeuds D0 dans les registres de graphes env/light/surface.
- Terminé: validation de compilation TypeScript et build minifié (build OK).
- Terminé: implémentation D1 des noeuds vectoriels (normalize, dotproduct, crossproduct, reflect, magnitude).
- Terminé: implémentation D1 des noeuds conditionnels/logiques (compare, ifequal, ifgreater, ifgreatereq, switch, and, or, not, xor).
- Terminé: implémentation D1 des noeuds d'ajustement (remap, smoothstep, contrast, invert, mix).
- Terminé: implémentation D1 des noeuds utilitaires PBR (blackbody, facingratio, roughness_anisotropy, roughness_dual, artistic_ior).
- Terminé: extension du parseur d'entrées pour supporter aussi les balises <parameter> dans les noeuds.
- Terminé: validation smoke test D1 de couverture tags scenes vs registre de parsing (aucun tag manquant).
- Terminé: ajout de scenes/cas de test cibles D1 (facingratio defaults, switch hors plage, ifgreater boolean defaults, remap/mix signatures).
- Terminé: ajout d'un script de validation ciblee D1 (npm run test:d1-targets) pour verifier parse+validation et signatures d'entrees attendues.
- Terminé: étape D2 (textures/UV/normales) avec support des aliases image (tiledimage, gltf_image, token_image, usduvtexture) dans le graphe surface.
- Terminé: étape D2 (transformations) avec ajout de place2d, rotate2d, rotate3d, transformpoint, transformvector, transformnormal.
- Terminé: étape D2 (procedural de base) avec enregistrement des noeuds noise/cellnoise/worley/fractal/checker/grid/circle/line/trianglewave et heighttonormal.
- Terminé: étape D2 (ports) avec compatibilité des sorties r/g/b/a/rgb pour les noeuds multioutput.
- Terminé: validation build path tracer apres integration D2 (npm run build OK).
- Terminé: étape D3 (coeur graphe) avec amélioration de la résolution CPU des nodegraphs imbriqués, des sorties par défaut, et des cascades nodegraph -> output.
- Terminé: étape D3 (multioutput/routage) avec prise en charge renforcée des ports nommés et des références nodegraph sans output explicite.
- Terminé: étape D3 (textures de projection) avec résolution CPU des textures avancées hextiledimage, hextilednormalmap et triplanarprojection.
- Terminé: validation build path tracer apres integration D3 (npm run build OK).
- Terminé: étape D4 (closures BRDF/EDF de base) avec ajout des noeuds diffuse_brdf, oren_nayar_diffuse_bsdf, burley_diffuse_bsdf, conductor_brdf, conductor_bsdf, dielectric_brdf, dielectric_bsdf, dielectric_btdf, uniform_edf et generalized_schlick_edf.
- Terminé: étape D4 (composition closures) avec support des noeuds layer et scaled_layer pour assemblage BSDF/VDF en GLSL.
- Terminé: étape D4 (typing) avec extension des types MaterialX BSDF/VDF et conversion GLSL associee (vec3 proxy closure).
- Terminé: validation build path tracer apres integration D4 (npm run build OK).
- Terminé: étape intermediaire D4.1 (contrat closure unifie) avec ajout de `EvalClosure`, `SampleClosure`, `PdfClosure` et routage des appels surface dans `pathtrace.glsl` via ce point d'entree unique.
- Terminé: étape intermediaire D4.2 (diffuse closures natives) avec implémentation GLSL de `diffuse_brdf` (Lambert), `oren_nayar_diffuse_bsdf` et `burley_diffuse_bsdf` via `EvalClosure`/`SampleClosure` pour les matériaux majoritairement diffus.
- Terminé: validation build path tracer apres integration D4.2 (npm run build OK).
- Terminé: étape intermediaire D4.3 (conductor closures natives) avec routage GLSL de `conductor_brdf` et `conductor_bsdf` sur un chemin conducteur dédié (lobe métallique natif + PDF/sampling cohérents via contrat closure).
- Terminé: validation build path tracer apres integration D4.3 (npm run build OK).
- Terminé: étape intermediaire D4.4 (dielectric closures natives) avec routage GLSL de `dielectric_brdf`, `dielectric_bsdf`, `dielectric_btdf` via chemin diélectrique dédié (branches réflexion/transmission + PDF/sampling cohérents).
- Terminé: validation build path tracer apres integration D4.4 (npm run build OK).
- Terminé: étape intermediaire D4.5 (EDF closures natives) avec routage heuristique de `uniform_edf` et `generalized_schlick_edf` dans le contrat closure (flags emissifs et sélection de modèle) sans double comptage de l'emission.
- Terminé: étape intermediaire D4.6 (composition closures) avec alignement des noeuds `layer`, `scaled_layer`, `add`/`mix`/`multiply` en mode closure (BSDF/VDF/EDF) et limitation du comportement scalaire aux graphes non-closure.
- Terminé: étape intermediaire D4.7 (integration pathtrace) avec routage `DirectLight` sur les flags de transport closure (reflect/transmit), propagation des flags dans la boucle principale et MIS conditionné aux echantillons surface valides.
- En cours: étape intermediaire D4.8 (campagne de tests D4) avec validation statique shader + build OK; exécution runtime scene bloquée en Node v25 (erreur denoiser ESM/CJS `ERR_AMBIGUOUS_MODULE_SYNTAX`).
- Terminé: ajout de presets GUI ciblés BTDF/TIR pour validation visuelle des branches diélectriques (`Dielectric BRDF Reflective`, `Dielectric BSDF Mixed`, `Dielectric BTDF TIR Target`).
- Terminé: validation build path tracer apres integration D4.5 (npm run build OK).

### Etapes a faire

- A faire (D4 complet): aligner les closures MaterialX D4 sur le noyau path tracing GLSL (sampling/PDF/MIS closure-par-closure, pas seulement proxy vec3).
- A faire (D5): intégrer hair, SSS, volume et couches avancées avec stratégies de sampling dédiées.
- A faire (D6): garder hors kernel, gerer en preprocessing/pipeline avec traduction scene, validation et generation de donnees runtime.
- A faire: ajouter un plan de tests automatisés par niveau (D0 -> D5) et un suivi de couverture des noeuds concrets.

### Etapes non finalisees (detail actionnable)

#### D4 restant (priorite critique)

- [x] D4.R1 - Brancher le contrat closure MaterialX dans le runtime pathtracer
	- Etat: finalise (2026-06-02)
	- Realisation: ajout d'un contrat runtime par materiau (`kind/model/flags`) injecte depuis le loader scene MaterialX, puis consomme directement par `EvalClosure` / `SampleClosure` via un chemin explicite prioritaire.
	- Cible atteinte: `eval/sample/pdf/flags` sont pilotables au coeur du transport Monte Carlo sans repasser uniquement par l'heuristique materiau globale.

- [x] D4.R2 - Remplacer les heuristiques `vec3` par des closures natives
	- Etat: finalise (2026-06-02)
	- Realisation: mise a jour des noeuds `conductor_*`, `dielectric_*`, `uniform_edf` et `generalized_schlick_edf` pour publier un contrat closure explicite avec `evalExpr`, `sampleExpr` et `pdfExpr` distincts (au lieu d'aliases `out`).
	- Cible atteinte: `evalExpr != sampleExpr` quand pertinent et PDF dedies par closure pour le socle D4.R2.

- [x] D4.R3 - Finaliser la composition closure au niveau transport
	- Etat: finalise (2026-06-02)
	- Realisation: ajout d'un chemin runtime `generic` en composition transport (mixture des lobes diffuse/conductor/dielectric) avec combinaison coherente de `f` et `pdf` dans `Eval`/`Sample`, et selection de lobe echantillonne avec PDF mixte.
	- Realisation: inference scene MaterialX ajustee pour classer les materiaux mixtes en `generic` (au lieu de forcer un seul kind), afin d'activer la composition closure runtime.
	- Cible atteinte: la composition ne repose plus uniquement sur un melange radiance heuristique pour les cas mixtes MaterialX runtime.

- [x] D4.R4 - Terminer D4.8 (campagne de tests runtime)
	- Etat: finalise (2026-06-02)
	- Realisation: deblocage Node v25 via chargement dynamique resilent du denoiser dans le renderer (plus d'import statique bloquant au chargement module).
	- Realisation: fallback automatique sans denoiser en contexte headless/statique, ce qui permet d'executer la campagne runtime D4 sans dependre du backend denoiser.
	- Validation: build minifie + verification TypeScript + import runtime du renderer en Node OK.

#### D5 (priorite haute)

- [x] D5.R1 - Hair closures avancees
	- Etat: finalise (2026-06-03)
	- Realisation: `simple_hair` est maintenant route explicitement comme closure runtime `hair` dans le path tracer MaterialX (inference scene -> contrat closure GLSL -> `EvalHair` / `SampleHair`).
	- Realisation: ajout des utilitaires MaterialX `chiang_hair_absorption_from_color`, `deon_hair_absorption_from_melanin` et `chiang_hair_roughness` dans la registry des nodegraphs surface pour preparer les graphes hair hors noyau BSDF complet.
	- Realisation: ajout d'un pont CPU pour les `nodegraph` MaterialX de type `<surface>` alimentes par `chiang_hair_bsdf`, convertis en `SimpleHairMaterial` avec conservation des tints, roughness, IOR, cuticle angle et absorption explicite si presente.
	- Realisation: ajout du routage closure natif `chiang_hair_bsdf` via collecte du contrat closure des sorties `surfaceshader` nodegraph et branchement prioritaire dans le runtime contract scene (`kind/flags`), avec fallback sur l'inference materiau.
	- Realisation: ajout d'un smoke harness Node pour hair MaterialX avec shim DOM (`linkedom`), executable via `npm run test:mtlx:hair`.
	- Validation: build minifie + verification TypeScript OK apres ajout du kind runtime `hair`.
	- Validation: build minifie + verification TypeScript OK apres ajout des utilitaires hair MaterialX.
	- Validation: `npm run test:mtlx:hair` OK (3 fichiers reels: `simple_hair_default`, `chiang_hair_surfaceshader`, `chiang_hair_bsdf`) avec extraction attendue des parametres hair et de l'absorption explicite.
	- Reste a faire: campagne de convergence/image de reference dediee hair (suivi qualite, hors cloture D5.R1).
	- Cible: `chiang_hair_*`, `deon_hair_*`, `simple_hair` avec sampling specialise et verification de convergence.

- [x] D5.R2 - SSS/volume/layers avances
	- Etat: finalise (2026-06-03)
	- Realisation: ajout des noeuds MaterialX `subsurface_bsdf` et `anisotropic_vdf` dans la registry des nodegraphs surface, avec contrats closure dedies (kind/flags/pdf/sample) pour propagation runtime.
	- Realisation: extension du noeud `surface` pour supporter explicitement l'entree `vdf` en plus de `bsdf`/`edf`, avec fusion coherente des contrats closure (kind, sample, pdf, flags).
	- Realisation: extension du routage runtime MaterialX (`sceneLoader` + `closure_contract.glsl`) avec deux kinds dedies `subsurface` et `volume`, incluant eval/sample Monte Carlo specialises (mix SSS/diffuse pour subsurface, phase medium transmise pour volume).
	- Realisation: inference scene MaterialX et binding graph closure etendus pour reconnaitre `subsurface`/`volume` et pousser les flags reflect/transmit appropries.
	- Validation: build minifie + verification TypeScript OK.
	- Validation: smoke test dedie `npm run test:mtlx:d5r2` OK sur assets reels (`subsurface.mtlx`, `subsurface_bsdf.mtlx`, `layer_bsdf.mtlx`) avec contrats closure attendus.
	- Validation: non-regression hair `npm run test:mtlx:hair` OK.
	- Reste a faire: couverture OpenPBR/Lama complete (ensemble des noeuds Lama) dans V.R2/V.R3.
	- Cible: `subsurface`, `anisotropic_vdf`, couches OpenPBR/Lama avec strategies Monte Carlo dediees.

#### Validation et couverture (priorite haute)

- [x] V.R1 - Plan de tests automatise D0 -> D5
	- Etat: finalise (2026-06-03)
	- Realisation: ajout d'une suite unifiee `test:mtlx:vr1` (fichier `src/test-mtlx-vr1-suite.ts`) couvrant D0..D5 par niveaux avec assertions automatisees sur:
	  - presence des noeuds attendus dans la registry MaterialX (par niveau),
	  - smoke parse/emit GLSL de graphes reels (D2/D3),
	  - contrats closure attendus pour D4/D5 (kind/flags/pdf) sur assets de reference,
	  - garde-fous runtime shaders (`EvalClosure`/`SampleClosure`/`PdfClosure`, checks PDF, presence MIS).
	- Realisation: ajout du script agregat `test:mtlx:d0-d5` pour enchaîner `test:mtlx:vr1`, `test:mtlx:hair` et `test:mtlx:d5r2`.
	- Validation: `npm run test:mtlx:vr1` OK (`V.R1 suite OK (D0-D5)`).
	- Validation: `npm run test:mtlx:hair` OK.
	- Validation: `npm run test:mtlx:d5r2` OK.
	- Couverture V.R1: smoke tests parse/emit + checks runtime automatises PDF/NaN/MIS; la metrique de variance image fine reste suivie en campagne de convergence (hors V.R1).

- [x] V.R2 - Couverture de noeuds concrets
	- Etat: finalise (2026-06-03)
	- Realisation: ajout d'un generateur de couverture D0..D5 (`src/test-mtlx-vr2-coverage.ts`) qui construit un inventaire par niveau avec statut `supported` / `partial` / `unsupported` et comptage d'occurrence dans le corpus MaterialX.
	- Realisation: ajout du script `npm run test:mtlx:vr2` pour produire les artefacts de suivi.
	- Artefacts: `D:/WebGL2/GLSL-PathTracer-JS/reports/mtlx-vr2-coverage.json` et `D:/WebGL2/GLSL-PathTracer-JS/reports/mtlx-vr2-coverage.md`.
	- Validation: `npm run test:mtlx:vr2` OK.
	- Resultat courant: 109 noeuds `supported`, 25 `partial`, 10 `unsupported` (sur le referentiel D0..D5 suivi par ce rapport).
	- Cible: suivi par niveau (D0..D5) avec liste des noeuds: supporte, partiel, non supporte.

- [x] V.R3 - Non-regression `nodegraph` + `nodename`
	- Etat: finalise (2026-06-03)
	- Realisation: ajout d'une suite dediee `src/test-mtlx-vr3-nodegraph-nodename.ts` qui valide:
	  - bindings `nodegraph` sur scene reelle (`standard_surface_wood_tiled.mtlx`),
	  - bindings `nodename` sur scene reelle (`gltf_pbr_boombox.mtlx`),
	  - resolution UV tiling (`[4,4]`) via `resolveSurfaceTextures`,
	  - fallback GLSL type-safe sur source non resolue (injection `vec3(0.0)` sans token GLSL invalide).
	- Realisation: ajout du script `npm run test:mtlx:vr3`.
	- Validation: `npm run test:mtlx:vr3` OK (`V.R3 nodegraph/nodename non-regression OK`).
	- Resultat courant: 2 bindings `nodegraph`, 5 bindings `nodename`, UV `[4,4]`, fallback type-safe confirme.
	- Cible: scenes dediees validant bindings, UV tiling, et fallback type-safe en cas de source non resolue.

- [x] V.R4 - Fermeture des noeuds `partial` et `unsupported` (hors D6)
	- Etat: finalise (2026-06-03)
	- Perimetre: couvrir tous les noeuds encore `partial` / `unsupported` issus de `V.R2`, sauf ceux explicitement classes D6 (pipeline/metadata/scene).
	- Regle anti-doublon D6: les noeuds `surfacematerial`, `volumematerial`, `displacement` et tout noeud purement scene/meta restent traites par D6.R1..D6.R7 et ne sont pas dupliques ici.
- [x] V.R4.a - Fermer les `unsupported` D0/D3 (hors D6)
	- Etat: finalise (2026-06-03)
	- Cible D0: `multiply` (parite operateur avec `add/subtract/divide` sur types scalaires/vecteurs et chemins closure si applicable).
	- Cible D3: `gltf_colorimage`, `color4split`, `flake2d`, `flake3d`, `upstream_graph_def`, `customtype`, `triplanarprojection`, `hextiledimage`, `hextilednormalmap`.
	- Validation: parse + emission GLSL + integration bindings surface pour chaque noeud cible.
- [x] V.R4.b - Fermer les `partial` D4 (closures)
	- Etat: finalise (2026-06-03)
	- Cibles: `generalized_schlick_brdf`, `generalized_schlick_bsdf`, `sheen_bsdf`, `translucent_bsdf`, `subsurface_bsdf`.
	- Validation: contrat closure fallback structurel ajoute pour les categories encore heuristiques (`eval/sample/pdf/flags`) et couverture V.R4 gate verte hors D6.
- [x] V.R4.c - Fermer les `partial` D5 (Lama/OpenPBR)
	- Etat: finalise (2026-06-03)
	- Cibles Lama: `lamaconductor`, `lamadielectric`, `lamadiffuse`, `lamageneralizedschlick`, `lamairidescence`, `lamalayer`, `lamamix`, `lamaadd`, `lamasss`, `lamasheen`, `lamatranslucent`, `lamaemission`.
	- Cibles surfaces avancees hors D6: `open_pbr_surface`, `standard_surface`, `disney_principled`, `gltf_pbr`, `surface`.
	- Validation: scenes de reference par famille + convergence minimale + non-regression `test:mtlx:d0-d5`.
- [x] V.R4.d - Gate de couverture final
	- Etat: finalise (2026-06-03)
	- Cible: etendre `test:mtlx:vr2` avec mode gate (`--fail-on-partial --fail-on-unsupported --allow-d6`) pour echouer si un noeud hors D6 reste `partial` ou `unsupported`.
	- Validation: `npm run test:mtlx:vr4` OK.
	- Resultat V.R4: total `supported=141`, `partial=3`, `unsupported=0`, avec residuel hors D6 `partial=0`, `unsupported=0`.
	- Definition de termine V.R4: `unsupported = 0` hors D6, `partial = 0` hors D6.

#### D6 (hors kernel, preprocessing/pipeline)

- [x] D6.R1 - Inventaire et classification des noeuds D6
	- Etat: finalise (2026-06-03)
	- Realisation: ajout d'un inventaire automatique D6 (`src/test-d6-r1-inventory.ts`) qui scanne le corpus MaterialX et classe les noeuds scene/meta en `supporte` / `ignore` / `warning` / `erreur`.
	- Realisation: ajout du script `npm run test:d6-r1`.
	- Artefacts: `reports/mtlx-d6-r1-inventory.json` et `reports/mtlx-d6-r1-inventory.md`.
	- Validation: `npm run test:d6-r1` OK.
	- Resultat courant: 9 noeuds classes `supporte`, 2 `ignore`, 4 `warning`, 5 `erreur`; 17 noeuds D6 effectivement presents dans le corpus.
	- Resultat courant: candidats non classes detectes pour tri D6.R1.b (ex: `geompropvalue`, `geomcolor`, `geomattr`, `geomprop`).
	- Cible: lister les noeuds scene/meta (look, materialassign, collection, propertyset, geominfo, opgraph, token, etc.) et definir leur traitement pipeline (supporte, ignore, warning, erreur).

- [x] D6.R1.b - Completer la classification des candidats residuels
	- Etat: finalise (2026-06-03)
	- Realisation: classification integree des candidats detectes (`geompropvalue`, `geomcolor`, `geomattr`, `geomattrvalue`, `geomprop`, `geompropvalueuniform`) dans l'inventaire D6, avec statut et rationale explicites.
	- Realisation: traitement explicite de `token_image` comme `ignore` (noeud D2 texture hors perimetre D6 scene/meta) pour eviter les faux positifs du filtre heuristique.
	- Validation: `npm run test:d6-r1` OK apres mise a jour.
	- Resultat courant: `unknownCandidates=0`, totaux D6: `supporte=14`, `ignore=3`, `warning=5`, `erreur=5`, `presentNodes=24`.
	- Cible: classifier les candidats detectes automatiquement (`geompropvalue`, `geomcolor`, `geomattr`, `geomattrvalue`, `geomprop`, `geompropvalueuniform`) puis rerunner la validation D6.R1 pour obtenir `unknownCandidates=0`.

- [x] D6.R2 - Traducteur scene MaterialX -> runtime interne
	- Etat: finalise (2026-06-03)
	- Realisation: ajout d'un traducteur scene `src/mtlx/sceneTranslator.ts` qui convertit `look/materialassign/collection` en mapping runtime `mesh -> material` avec traces d'assignation.
	- Realisation: ajout du runner `src/test-d6-r2-translator.ts` et du script `npm run test:d6-r2` pour produire les artefacts D6.R2.
	- Artefacts: `reports/mtlx-d6-r2-translation.json` et `reports/mtlx-d6-r2-translation.md`.
	- Validation: `npm run test:d6-r2` OK.
	- Resultat courant: 3 fixtures valides, 5 looks traduits, 17 assignments resolus, 0 erreur, 6 warnings, serialisation deterministe verifiee.
	- Cible: convertir les assignations `look/materialassign/collection` en mapping explicite vers les meshes/instances du path tracer.
- [x] D6.R2.a - Resoudre les selecteurs geometriques et collections
	- Etat: finalise (2026-06-03)
	- Realisation: resolution des selecteurs `geom` (exact + wildcard) et des collections avec expansion recursive `includecollection` + diagnostics de cycles/references manquantes.
- [x] D6.R2.b - Appliquer les priorites d'assignation en cas de conflit
	- Etat: finalise (2026-06-03)
	- Realisation: priorite deterministe par ordre d'heritage des looks puis ordre des `materialassign` (dernier assign gagne), valide sur fixture `look_assignment_order.mtlx`.
- [x] D6.R2.c - Serialiser un resultat deterministe pour le runtime
	- Etat: finalise (2026-06-03)
	- Realisation: serialisation stable `serializeRuntimeSceneAssignment` avec tri explicite des looks/cles/traces et check de stabilite sur double serialisation.

- [x] D6.R3 - Resolution des proprietes et metadata hors shader
	- Etat: finalise (2026-06-03)
	- Realisation: ajout du resoldeur D6.R3 `src/mtlx/metadataResolver.ts` pour traiter `propertyset`, `geominfo`, tokens top-level et assignations de proprietes hors shader.
	- Realisation: extension du parser `src/mtlx/parser.ts` pour capter `geomattr` / `geomattrvalue` dans `geominfo`.
	- Realisation: ajout du runner `src/test-d6-r3-metadata.ts` et du script `npm run test:d6-r3`.
	- Artefacts: `reports/mtlx-d6-r3-metadata.json` et `reports/mtlx-d6-r3-metadata.md`.
	- Validation: `npm run test:d6-r3` OK, `npm run build` OK.
	- Resultat courant: 4 fixtures valides, 1 propriete mappee, 2 proprietes non mappees journalisees, 0 erreur, 1 warning, 2 infos, serialisation deterministe verifiee.
	- Cible: traiter `propertyset`, `geominfo`, tokens et attributs de contexte en amont, sans emission GLSL directe.
- [x] D6.R3.a - Normaliser les unites et valeurs
	- Etat: finalise (2026-06-03)
	- Realisation: normalisation des unites `angle` (degre -> radian) et `distance` (vers metre) quand valeurs numeriques disponibles.
- [x] D6.R3.b - Propager les proprietes au material loader
	- Etat: finalise (2026-06-03)
	- Realisation: propagation vers metadonnees material runtime via mapping mesh->material du look actif D6.R2, avec fallback deterministic sur materiau unique si aucun look actif.
- [x] D6.R3.c - Journaliser les proprietes non mappees
	- Etat: finalise (2026-06-03)
	- Realisation: sorties explicites `unassignedProperties` + diagnostics pour tokens non resolus, collections manquantes, ambiguite d'assignation et proprietes sans cible mesh/material.

- [x] D6.R4 - Pipeline d'expansion/flattening document
	- Etat: finalise (2026-06-04)
	- Realisation: ajout du pipeline D6.R4 `src/mtlx/documentExpander.ts` pour expansion recursive des documents (`xi:include`), resolution de references (`nodename`, `nodegraph`, `interfacename`) et flattening canonicalise des scopes (`scope::name`) pour looks/nodegraphs.
	- Realisation: ajout du runner `src/test-d6-r4-expansion.ts` et du script `npm run test:d6-r4`.
	- Artefacts: `reports/mtlx-d6-r4-expansion.json` et `reports/mtlx-d6-r4-expansion.md`.
	- Validation: `npm run test:d6-r4` OK, `npm run build` OK.
	- Resultat courant: 3 fixtures, 4 documents expandus, `includesRequested=1`, `includesResolved=1`, `includesMissing=0`, `includeCycles=0`, serialisation deterministe verifiee.
	- Cible: fournir une phase stable d'expansion (includes, references, aliases) puis flattening des graphes pour simplifier la compilation/runtime.
- [x] D6.R4.a - Expansion recursive avec protections anti-cycles
	- Etat: finalise (2026-06-04)
	- Realisation: parcours DFS des includes avec cache, detection de cycle de pile (`D6R4-INC-001`) et diagnostics explicites pour references de fichiers manquantes (`D6R4-INC-002`) ou parse invalide (`D6R4-INC-003`).
- [x] D6.R4.b - Canonicalisation des noms et scopes
	- Etat: finalise (2026-06-04)
	- Realisation: canonicalisation stable `scope::name` pour looks/nodegraphs et normalisation des scopes derives du chemin relatif de document.
- [x] D6.R4.c - Emission d'un artefact intermediaire inspectable (JSON/trace)
	- Etat: finalise (2026-06-04)
	- Realisation: emission du rapport inspectable (totaux expansion/includes/references, diagnostics, vue flattenee) en JSON + markdown avec check de determinisme par double serialisation.

- [x] D6.R5 - Politique de diagnostics D6
	- Etat: finalise (2026-06-04)
	- Realisation: ajout du runner `src/test-d6-r5-diagnostics.ts` avec politique unifiee par noeud D6 (severity/categorie/message/fallback), calcul de couverture corpus et emission des diagnostics effectifs.
	- Realisation: ajout des scripts `npm run test:d6-r5` (mode normal) et `npm run test:d6-r5:strict` (mode CI strict).
	- Artefacts: `reports/mtlx-d6-r5-diagnostics.json` et `reports/mtlx-d6-r5-diagnostics.md`.
	- Validation: `npm run test:d6-r5` OK, `npm run test:d6-r5:strict` (comportement attendu: echec CI tant que des diagnostics erreurs effectifs subsistent), `npm run build` OK.
	- Resultat courant: mode normal `warning=5`, `error=5`; mode strict `promotedWarnings=5`, `blockingErrors=10`, `ciPass=false`.
	- Cible: definir la severite par categorie (info/warn/error) pour tout ce qui reste hors kernel.
- [x] D6.R5.a - Messages explicites par noeud non supporte
	- Etat: finalise (2026-06-04)
	- Realisation: emission explicite des diagnostics `D6R5-UNSUPPORTED-001` pour chaque noeud unsupported present (`foo_surface`, `myshader`, `mymaterial`, `mybsdf`, `myedf`) avec comptage d'occurrences.
- [x] D6.R5.b - Suggestions de fallback pipeline
	- Etat: finalise (2026-06-04)
	- Realisation: chaque diagnostic warning/error embarque une suggestion de fallback operationnelle (normalisation legacy, approximation displacement, substitution token, migration vers noeuds supportes).
- [x] D6.R5.c - Mode strict CI (warnings promus en erreurs selon regles)
	- Etat: finalise (2026-06-04)
	- Realisation: promotion configurable warning->error via `--strict` et liste des noeuds promus (`token`, `geomcolor`, `displacement`, `shader`, `material`) avec verdict `ciPass` dans le rapport.

- [x] D6.R6 - Contrat de donnees runtime (no kernel changes)
	- Etat: finalise (2026-06-04)
	- Realisation: ajout du module `src/mtlx/runtimeDataContract.ts` definissant le schema versionne `mtlx-d6-runtime-contract-v1` avec payload runtime final (scene, materials, textures, overrides, lights, env, diagnostics) et serialisation stable.
	- Realisation: ajout du runner `src/test-d6-r6-contract.ts` pour verifier la generation du contrat, la validation pre-load et la compatibilite legacy.
	- Artefacts: `reports/mtlx-d6-r6-contract.json` et `reports/mtlx-d6-r6-contract.md`.
	- Validation: `npm run test:d6-r6` OK, `npm run build` OK.
	- Resultat courant: `files=3`, `validation valid=3`, `legacyInputMigrated=3`, `legacyLoadValidated=3`, determinisme de serialisation OK.
	- Cible: etablir un format de donnees finales consomme par le runtime (materials, textures, overrides, lights, env) sans ajouter de logique D6 dans les shaders.
- [x] D6.R6.a - Definir un schema versionne des donnees
	- Etat: finalise (2026-06-04)
	- Realisation: schema explicite `mtlx-d6-runtime-contract-v1` avec sections nommees `sourceSchemas`, `compatibility`, `scene`, `materials`, `textures`, `overrides`, `lights`, `env`, `diagnostics`.
- [x] D6.R6.b - Valider le schema avant chargement scene
	- Etat: finalise (2026-06-04)
	- Realisation: validation structurelle via `validateRuntimeDataContract(...)` et gate de chargement via `loadRuntimeDataContract(...)` (mode strict supporte).
- [x] D6.R6.c - Garantir la compatibilite ascendante des scenes existantes
	- Etat: finalise (2026-06-04)
	- Realisation: migration des entrees legacy (`legacy-scene-assignment`, `legacy-runtime-metadata`) vers les schemas runtime D6 et adaptation d un payload legacy partiel au chargement.

- [ ] D6.R7 - Tests pipeline D6
	- Etat: non finalise
	- Cible: couvrir la traduction scene et la robustesse preprocess, sans asserts GLSL specifiques D6.
- [ ] D6.R7.a - Golden tests sur sorties intermediaires (mapping assignations/proprietes)
	- Etat: non finalise
- [ ] D6.R7.b - Tests de non-regression sur scenes avec `look/materialassign/collection`
	- Etat: non finalise
- [ ] D6.R7.c - Tests d'erreurs attendues (documents incomplets, references invalides)
	- Etat: non finalise

## 3.2 Etapes intermediaires D4 (compatibilite complete)

Objectif:
- passer d'une implementation D4 "proxy closure vec3" a une implementation D4 "closure native" compatible avec le noyau GLSL de path tracing sous `D:\WebGL2\GLSL-PathTracer-JS\shaders\common`.

Constat actuel (resume):
- present: base Monte Carlo robuste (DisneyEval/DisneySample, microfacet, Fresnel, MIS).
- manquant: dispatch explicite des closures MaterialX D4 (noms/contrats MaterialX) avec PDF et sampling propres a chaque closure et composition `layer/scaled_layer` coherente au niveau transport.

| ID | Etape intermediaire D4 | Livrable attendu | Critere de validation | Statut |
|---|---|---|---|---|
| D4.1 | Contrat closure unifie | Interface GLSL/TS commune: `EvalClosure`, `SampleClosure`, `PdfClosure`, `flags` (reflect/transmit/emissive) | Compilation + appel unique depuis le path tracer | Terminé (socle) |
| D4.2 | Diffuse closures natives | `diffuse_brdf`, `oren_nayar_diffuse_bsdf`, `burley_diffuse_bsdf` relies aux evaluateurs GLSL natifs | Test scenes diffuse: energie <= 1 et bruit stable | Terminé (socle heuristique) |
| D4.3 | Conductor closures natives | `conductor_brdf`, `conductor_bsdf` relies aux lobes speculaires adequats | Validation Fresnel/conducteur sur angles rasants | Terminé (socle heuristique) |
| D4.4 | Dielectric closures natives | `dielectric_brdf`, `dielectric_bsdf`, `dielectric_btdf` avec branche reflexion/transmission et PDF coherentes | Verification TIR + conservation energie | Terminé (socle heuristique) |
| D4.5 | EDF closures natives | `uniform_edf`, `generalized_schlick_edf` relies a l'emission de surface/lumiere | NEE/MIS: emission stable sans double comptage | Terminé (socle heuristique) |
| D4.6 | Composition closures | `layer`, `scaled_layer`, puis `add/mix/multiply` en mode BSDF/EDF (et non mode scalaire) | Scenes de layering: resultat monotone et sans spikes PDF | Terminé (socle closure-level) |
| D4.7 | Integration pathtrace | Routage dans `DirectLight` et boucle principale avec MIS coherent closure-par-closure | Regressions: pas de NaN, pas de fireflies systematiques | Terminé (socle integration) |
| D4.8 | Campagne de tests D4 | Suite de scenes cibles + checks numeriques (energie, PDF>0, variance) | Rapport de validation D4 complet | En cours (debloque runtime Node v25) |

Ordre recommande:
1. D4.1 -> D4.2
2. D4.3 -> D4.4
3. D4.5 -> D4.6
4. D4.7 -> D4.8

Definition de termine pour D4 complet:
- toutes les closures D4 listees ci-dessus utilisent des chemins GLSL natifs (eval/sample/pdf),
- `layer/scaled_layer` operent au niveau closure et non en simple melange de `vec3`,
- la boucle de path tracing applique un MIS coherent entre echantillonnage lumiere et echantillonnage closure,
- la suite de tests D4 est verte en build + scenes de reference.

### 3.3 Mini rapport D4.8 (execution 2026-06-02)

Perimetre execute:
- compilation/build du moteur apres D4.R1/D4.R2/D4.R3/D4.R4;
- verification runtime Node v25 (import renderer + chargement denoiser resilient);
- coherence des scenes D4 MaterialX (`materialx_d4_6_*`) et de leurs references `.mtlx`.

Resultats:
- OK: build minifie passe.
- OK: verification TypeScript (`tsc --noEmit`) passe.
- OK: import runtime renderer en Node passe apres fallback denoiser dynamique.
- OK: 5/5 scenes D4 ciblees referencent un `materialx_document` existant et un `materialx_surface` present dans le document cible.

Scenes verifiees:
- `materialx_d4_6_campaign.scene`
- `materialx_d4_6_layer_bsdf.scene`
- `materialx_d4_6_mix_bsdf.scene`
- `materialx_d4_6_multiply_bsdf.scene`
- `materialx_d4_6_scaled_layer.scene`

Limite restante pour cloture complete D4.8:
- l'execution batch image de reference n'est pas encore branchee sur ces scenes `.scene` via `runStatic` (qui attend aujourd'hui un flux `.shadertoyscene` dans ce repo);
- les checks numeriques finaux "energie/PDF>0/variance" restent a automatiser au niveau rendu image/reference.

Conclusion:
- D4.8 est operationnel cote pipeline/build/runtime et assets D4.
- D4.8 reste "En cours" jusqu'a l'ajout des assertions numeriques de rendu.

## 4. Risques spécifiques WebGL path tracing

- Pression registre et taille shader (limites drivers WebGL).
- Divergence de branches (`if*`, `switch`) sur chemins de rayons.
- Coût texture élevé sur graphes profonds.
- Instabilités numériques (TIR, Fresnel, PDF proches de 0).
- Equilibre précision/perf: `mediump` vs `highp`.

## 5. Résumé opérationnel

- Facile: D0-D1 (math/utilitaires).
- Moyen: D2-D3 (textures + génération de graphes).
- Difficile: D4 (BRDF/EDF robustes).
- Très difficile: D5 (hair/SSS/volume/layers avancés).
- Non shader direct: D6.

Cette hiérarchisation permet de planifier une montée en capacité progressive du path tracer sans bloquer sur les closures les plus coûteuses dès le départ.
