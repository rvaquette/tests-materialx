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
- A faire: ajouter un plan de tests automatisés par niveau (D0 -> D5) et un suivi de couverture des noeuds concrets.

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
| D4.8 | Campagne de tests D4 | Suite de scenes cibles + checks numeriques (energie, PDF>0, variance) | Rapport de validation D4 complet | En cours (bloque runtime Node v25) |

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
