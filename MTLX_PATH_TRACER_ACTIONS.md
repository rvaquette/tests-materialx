# Actions MaterialX PathTracer (audit 2026-06-02)

Perimetre audite:
- parse / resolution des graphes MaterialX (surface, env, light)
- emission GLSL des noeuds et graphes
- coherence avec une exploitation pathtracer "vraie" (transport closure, PDF, sampling, robustesse)

Constats principaux:
- OK: le socle D0-D3 est coherent (parsing, typage, registres, extraction CPU, emission GLSL de base).
- OK: emission GLSL surface graph existe et est exploitable pour des overrides materiau cibles.
- Ecart 1 (majeur): les closures D4 dans src/loaders/mtlx/nodes restent des approximations vec3 (heuristiques), sans contrat physique complet eval/sample/pdf par closure.
- Ecart 2 (majeur): la composition closure (mix, layer, scaled_layer, multiply) est encore majoritairement au niveau "couleur proxy", pas au niveau lobe/transport.
- Ecart 3 (important): la collecte des bindings de graphes surface ne couvre que les inputs relies via nodegraph; les cas relies directement via nodename ne sont pas promus en overrides GLSL proceduraux.
- Ecart 4 (important): le fallback resolveGLSL sur source non resolue produit un token commentaire, ce qui peut casser du GLSL genere selon le contexte d'injection.
- Ecart 5 (moyen): les graphes env/light exposent emitGLSL, mais le chemin principal reste surtout CPU (extractConfig), donc couverture runtime GLSL partielle.

Actions requises (priorisees):
- [x] 1. D4-closure-native: remplacer les sorties proxy vec3 des noeuds closure par un contrat structurel aligne pathtracer (eval, sample, pdf, flags reflect/transmit/emissive).
- [ ] 2. D4-composition-native: migrer mix/layer/scaled_layer/multiply vers une composition au niveau des lobes closures (pas seulement une interpolation de radiance).
- [ ] 3. Surface binding coverage: etendre la collecte de bindings pour inclure les chaines nodename directes (et pas uniquement nodegraph).
- [ ] 4. Robustesse emission: remplacer les placeholders unresolved par des fallbacks types (zeroOfType) + warning de validation explicite.
- [ ] 5. Env/light parity: definir une strategie explicite (CPU-only assumee ou GLSL runtime) et supprimer l'ambiguite entre extractConfig et emitGLSL.
- [ ] 6. Validation ciblee: ajouter des scenes de non-regression pour chaque action ci-dessus (closures D4, composition, bindings directs, erreurs de resolution).

Definition de "vrai support MaterialX pathtracer" (mise a jour):
- les noeuds closure ne degradent plus vers un simple vec3;
- toutes les compositions closure preservent eval/sample/pdf coherents;
- le mapping des graphes surface couvre nodegraph et nodename;
- les erreurs de resolution sont detectees et degradees de maniere typee, jamais via GLSL invalide;
- une suite de scenes valide visuellement et numeriquement ces chemins.
