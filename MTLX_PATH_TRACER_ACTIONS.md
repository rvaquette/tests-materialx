# Actions MaterialX PathTracer (audit reel 2026-06-02)

Perimetre audite:
- D:/WebGL2/GLSL-PathTracer-JS/src/loaders/mtlx
- verification complementaire de l'integration runtime dans:
	- D:/WebGL2/GLSL-PathTracer-JS/src/core/pathtracer/loaders/sceneLoader.ts

Objectif:
- verifier la coherence du code actuel avec un "vrai support MaterialX" pour un path tracer
- lister uniquement les actions restantes, en separant ce qui est deja fait

## Verdict global

- Le support MaterialX est solide pour D0-D3 (parse, graphes, textures, bindings procedural GLSL).
- Le support D4 est partiellement coherent: contrat closure present, mais implementation encore surtout heuristique/proxy vec3.
- Le pipeline runtime exploite bien les bindings de textures MaterialX, mais pas encore un dispatch closure MaterialX complet au niveau transport Monte Carlo.

## Constats verifies

1) Closures D4: contrat present mais pas "physique complet"
- Constate: `GlslClosureContract` existe (evalExpr/sampleExpr/pdfExpr/flagsExpr).
- Limite: dans plusieurs noeuds, `evalExpr == sampleExpr`, `pdfExpr` reste constant ou simplifie (`1.0` ou mix heuristique), et la sortie GLSL reste un `vec3` proxy.
- Conclusion: progression reelle, mais pas encore un support closure natif complet.

2) Composition closure: mieux qu'avant, encore partielle
- Constate: `mix`, `layer`, `scaled_layer`, `multiply` propagent des metadata closure (`pdfExpr`, `flagsExpr`).
- Limite: la composition reste basee sur des expressions radiance/proxy (`vec3`) plutot que des lobes explicitement samples/evalues separables.
- Conclusion: coherent avec un "socle D4", pas avec un "vrai D4 complet".

3) Couverture bindings surface: corrigee
- Constate: `collectSurfaceGraphBindings` gere a la fois `nodegraph` et `nodename`.
- Conclusion: l'ancien ecart "nodename non couvert" est clos.

4) Robustesse `resolveGLSL`: corrigee
- Constate: source non resolue -> warning + fallback type (`zeroOfType`), pas de token commentaire GLSL invalide.
- Conclusion: l'ancien ecart de robustesse est clos.

5) Env/light strategy: explicite
- Constate: env map supporte CPU + option GLSL; lights MaterialX restent CPU avec fallback explicite si mode GLSL demande.
- Conclusion: plus d'ambiguite, mais parite GLSL light non atteinte.

6) Integration runtime pathtracer: gap principal restant
- Constate: le runtime consomme surtout des fonctions procedurales de textures (`collectSurfaceGraphBindings`) et des parametres materiau; pas de consommation directe du contrat closure MaterialX au niveau coeur path tracing.
- Conclusion: principal ecart avec un "vrai support MaterialX pathtracer".

## Actions requises (priorisees)

- [ ] 1. Fermer le gap closure runtime (priorite critique)
	- Integrer le contrat closure MaterialX dans le chemin d'evaluation/sampling/PDF du path tracer (pas uniquement dans l'emission locale des nodes).
	- Definition de termine: les closures MaterialX pilotent effectivement les decisions de transport (eval/sample/pdf/flags) en runtime.

- [ ] 2. Remplacer les heuristiques D4 par des implementations closure natives (priorite critique)
	- Cibler d'abord: `conductor_*`, `dielectric_*`, `*_edf`, puis composition.
	- Definition de termine: `evalExpr`, `sampleExpr`, `pdfExpr` ne sont plus des aliases du meme proxy vec3.

- [ ] 3. Finaliser la composition closure au niveau lobe/transport (priorite haute)
	- `mix/layer/scaled_layer/multiply` doivent combiner des strategies d'echantillonnage/PDF coherentes, pas uniquement des melanges de valeur.
	- Definition de termine: conservation d'energie et PDF stables sur scenes de layering.

- [ ] 4. Etendre les bindings proceduraux au-dela du sous-ensemble texture actuel (priorite haute)
	- Elargir le mapping des inputs surface pris en charge et reduire les chemins "direct function" trop generiques.
	- Definition de termine: couverture des principaux inputs MaterialX utilises en prod, avec comportement coherent par type d'input.

- [ ] 5. Ajouter une campagne de non-regression ciblee D4 (priorite haute)
	- Tests requis: energie, PDF > 0, absence de NaN/fireflies systematiques, coherence reflect/transmit/emissive.
	- Inclure des scenes pour `nodegraph` et `nodename`.

- [ ] 6. Completer la voie GLSL pour lights MaterialX (priorite moyenne)
	- Soit implementer completement le chemin GLSL lightshader, soit verrouiller officiellement la strategie CPU-only.

## Actions closes (ne plus rouvrir)

- [x] Couverture `nodegraph` + `nodename` dans la collecte des bindings surface.
- [x] Fallback type-safe dans `resolveGLSL` avec warnings explicites.
- [x] Strategie env/light explicitee (fallback runtime visible).

## Definition operationnelle de "vrai support MaterialX pathtracer"

- les closures MaterialX ne sont plus de simples proxies vec3;
- `eval/sample/pdf/flags` sont appliques en runtime dans la boucle Monte Carlo;
- les compositions de closures conservent coherence energetique et PDF;
- les bindings surface couvrent les cas `nodegraph` et `nodename` avec semantics correctes;
- une suite de tests D4 valide visuellement et numeriquement le comportement.
