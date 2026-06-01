# Modélisation des fichiers MaterialX (`.mtlx`)

> Analyse réalisée sur **196 fichiers `.mtlx`** du dépôt `materialx/`.  
> Résultat de la validation : **196/196 parsés ✓ — 196/196 valides logiquement ✓ — 0 erreur**.

---

## 1. Structure du document

Un fichier `.mtlx` est un document XML dont l'élément racine est `<materialx>`.  
Il peut combiner librement les constructions suivantes :

```
<materialx version="1.39" colorspace="lin_rec709" fileprefix="…">
  ├── <typedef>          — définition d'un type struct personnalisé
  ├── <nodedef>          — signature réutilisable d'un nœud (inputs / outputs)
  ├── <nodegraph>        — sous-graphe (standalone ou corps d'un nodedef)
  ├── <implementation>   — mapping nodedef → code source pour un target (GLSL, OSL…)
  ├── <look>             — affectation de matériaux à des géométries
  ├── <collection>       — sélection de géométries
  ├── <propertyset>      — ensemble de propriétés nommées
  ├── <geominfo>         — propriétés géométriques déclaratives
  └── <XxxNode …>        — toute autre balise = instance de nœud (catégorie = tag XML)
```

Les nœuds sont identifiés par leur **catégorie** (nom du tag XML), pas par un attribut `type` séparé.  
L'attribut `type` indique le **type de sortie** du nœud (ex. `color3`, `surfaceshader`, `BSDF`, …).

---

## 2. Les constructions structurelles

### 2.1 `<nodedef>` — Déclaration de signature

| Attribut | Rôle |
|---|---|
| `name` | Identifiant unique de la définition (ex. `ND_layered`) |
| `node` | Catégorie du nœud que cette définition couvre (ex. `mylayered`) |
| `nodegroup` | Groupe fonctionnel (ex. `pbr`, `procedural2d`) |
| `version` / `isdefaultversion` | Versionnage |
| `<input>` enfants | Ports d'entrée avec type et valeur par défaut |
| `<output>` enfants | Ports de sortie avec type |

### 2.2 `<nodegraph>` — Graphe de nœuds

Un `<nodegraph>` est un réseau de nœuds connectés.  
Deux modes d'usage :

| Mode | `nodedef` présent ? | Rôle |
|---|---|---|
| **Standalone** | Non | Graphe réutilisable ou matériau complet |
| **Corps de nodedef** | Oui (référence `ND_…`) | Implémentation procédurale d'un nodedef |

Les **inputs d'interface** (`<input>` enfant direct du `<nodegraph>`) connectent le graphe au monde extérieur via `nodename`, `nodegraph` ou `interfacename`.  
Les **outputs** (`<output>`) déclarent les sorties exposées du graphe.

### 2.3 `<implementation>` — Implémentation code

Lie un `nodedef` à du code source natif pour un target de génération.

| Attribut | Rôle |
|---|---|
| `nodedef` | Référence le `ND_…` implémenté |
| `target` | Code-gen cible : `genglsl`, `genosl`, `genmdl`, `genmsl`, `genslang` |
| `sourcecode` | Code inline (ex. `{{in}}.ss`) |
| `file` | Chemin vers un fichier externe |

### 2.4 `<typedef>` — Type struct

Définit un type structuré composé de champs typés (`<member>`), ex. :

```xml
<typedef name="texcoord_struct">
  <member name="ss" type="float" value="0.5"/>
  <member name="tt" type="float" value="0.5"/>
</typedef>
```

### 2.5 `<look>` / `<collection>` — Affectation de scène

```
<look>
  └── <materialassign material="MatName" collection="ColName" />
<collection geom="/mesh/sphere" />
```

---

## 3. Connexion entre nœuds

Un input peut avoir **exactement une** source de valeur :

| Attribut | Signification |
|---|---|
| `value="…"` | Valeur littérale |
| `nodename="NodeA"` | Sortie unique du nœud `NodeA` dans la même portée |
| `nodegraph="NG_X" output="out"` | Port nommé `out` du nodegraph `NG_X` |
| `interfacename="param"` | Binding vers un input de l'interface du nodegraph parent |

Les nœuds **multi-sortie** (`type="multioutput"`) exposent leurs ports via `<output>` enfants ; les inputs qui les ciblent ajoutent `output="portName"`.

---

## 4. Types de données

| Famille | Types |
|---|---|
| Scalaires | `float`, `integer`, `boolean`, `string`, `filename` |
| Vecteurs | `vector2`, `vector3`, `vector4` |
| Couleurs | `color3`, `color4` |
| Matrices | `matrix33`, `matrix44` |
| Shaders | `surfaceshader`, `displacementshader`, `lightshader`, `volumeshader` |
| Matériaux | `material` |
| PBR interne | `BSDF`, `EDF`, `VDF` |
| Struct | tout nom défini par `<typedef>` |
| Multi-sortie | `multioutput` (ports déclarés via `<output>` enfants) |

---

## 5. Tableau complet des nœuds concrets

229 catégories observées, classées par groupe fonctionnel.

### 5.1 Matériaux de surface (shaders haut niveau)

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `standard_surface` | `surfaceshader` | Shader Arnold / MaterialX de référence |
| `open_pbr_surface` | `surfaceshader` | Shader OpenPBR |
| `disney_principled` | `surfaceshader` | Modèle Disney Principled |
| `gltf_pbr` | `surfaceshader` | Shader glTF PBR |
| `UsdPreviewSurface` | `surfaceshader` | Shader USD Preview |
| `surface` | `surfaceshader` | Assemblage générique BSDF+EDF |
| `surface_unlit` | `surfaceshader` | Surface non éclairée |
| `sheen_surface` | `surfaceshader` | Surface velours |
| `network_surface` | `surfaceshader` | Surface réseau (custom) |
| `pattern_shader` | `surfaceshader` | Shader procédural (test) |
| `foo_surface` | `surfaceshader` | Shader test/exemple |
| `simple_hair` | `surfaceshader` | Shader cheveux simplifié |
| `mylayered` | `surfaceshader` | Shader layeré custom |
| `myshader` | `surfaceshader` | Shader custom |
| `substrateshader` | `surfaceshader` | Shader substrat (test) |
| `testmetal` | `surfaceshader` | Metal de test |
| `gooch_shade` | `color3` | Ombrage non-photoréaliste Gooch |
| `npr_test:toon_shade` | `color3` | Ombrage toon (NPR, avec namespace) |

### 5.2 Matériaux et assignation

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `surfacematerial` | `material` | Conteneur de shader de surface |
| `volumematerial` | `material` | Conteneur de shader de volume |
| `material_def` | `material` | Matériau défini par nodedef |
| `mymaterial` | `material` | Matériau custom |
| `displacement` | `displacementshader` | Shader de déplacement |

### 5.3 BSDF (Bidirectional Scattering Distribution Functions)

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `oren_nayar_diffuse_bsdf` | `BSDF` | Diffus rugueux Oren-Nayar |
| `burley_diffuse_bsdf` | `BSDF` | Diffus Burley (Disney) |
| `diffuse_brdf` | `BSDF` | BRDF diffuse générique |
| `dielectric_bsdf` | `BSDF` | Diélectrique (réflexion + réfraction) |
| `dielectric_brdf` | `BSDF` | BRDF diélectrique |
| `dielectric_btdf` | `BSDF` | BTDF diélectrique (transmission) |
| `conductor_bsdf` | `BSDF` | Conducteur (métaux) |
| `conductor_brdf` | `BSDF` | BRDF conducteur |
| `generalized_schlick_bsdf` | `BSDF` | Fresnel Schlick généralisé |
| `generalized_schlick_brdf` | `BSDF` | BRDF Schlick généralisé |
| `sheen_bsdf` | `BSDF` | BSDF velours / tissu |
| `translucent_bsdf` | `BSDF` | Translucidité |
| `subsurface_bsdf` | `BSDF` | Sous-surface scattering |
| `chiang_hair_bsdf` | `BSDF` | BSDF cheveux Chiang |
| `thin_film_bsdf` | `BSDF` | *(via layer + dielectric)* |
| `layer` | `BSDF` | Empilement vertical de BSDFs |
| `mix` *(BSDF)* | `BSDF` | Mélange linéaire de BSDFs |
| `add` *(BSDF)* | `BSDF` | Addition de BSDFs |
| `multiply` *(BSDF)* | `BSDF` | Modulation d'un BSDF |
| `custom_layer` | `BSDF` | Layer custom (test) |
| `scaled_layer` | `BSDF` | Layer avec facteur d'échelle |
| `mybsdf` | `BSDF` | BSDF custom |
| `substratebsdf` | `BSDF` | BSDF substrat (test) |
| `LamaAdd` | `BSDF`, `EDF` | Lama: addition |
| `LamaConductor` | `BSDF` | Lama: conducteur |
| `LamaDielectric` | `BSDF` | Lama: diélectrique |
| `LamaDiffuse` | `BSDF` | Lama: diffus |
| `LamaGeneralizedSchlick` | `BSDF` | Lama: Schlick généralisé |
| `LamaIridescence` | `BSDF` | Lama: iridescence |
| `LamaLayer` | `BSDF` | Lama: empilement |
| `LamaMix` | `BSDF`, `EDF` | Lama: mélange |
| `LamaSheen` | `BSDF` | Lama: velours |
| `LamaSSS` | `BSDF` | Lama: sous-surface |
| `LamaTranslucent` | `BSDF` | Lama: translucidité |

### 5.4 EDF (Emission Distribution Functions)

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `uniform_edf` | `EDF` | Émission uniforme |
| `generalized_schlick_edf` | `EDF` | Émission Schlick |
| `add` *(EDF)* | `EDF` | Addition d'EDFs |
| `mix` *(EDF)* | `EDF` | Mélange d'EDFs |
| `multiply` *(EDF)* | `EDF` | Modulation d'une EDF |
| `LamaEmission` | `EDF` | Lama: émission |
| `myedf` | `EDF` | EDF custom |

### 5.5 VDF (Volume Distribution Functions)

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `anisotropic_vdf` | `VDF` | Volume anisotrope |

### 5.6 Sources lumineuses

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `directional_light` | `lightshader` | Lumière directionnelle |
| `point_light` | `lightshader` | Lumière ponctuelle |
| `spot_light` | `lightshader` | Lumière spot |
| `light` | `lightshader` | Lumière générique (assemblage EDF) |
| `lightcompoundtest` | `lightshader` | Lumière composée (test) |

### 5.7 Texture et images

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `image` | `color3`, `float`, `vector3`, `color4`, `vector2`, `vector4` | Image 2D générique |
| `tiledimage` | `color3`, `float`, `vector3`, `color4`, `vector2`, `vector4` | Image 2D tuilée |
| `latlongimage` | `color3` | Image lat-long (sphérique) |
| `gltf_image` | `vector3`, `color3` | Image glTF |
| `gltf_colorimage` | `multioutput` | Image couleur+alpha glTF |
| `gltf_normalmap` | `vector3` | Normal map glTF |
| `hextiledimage` | `color3`, `color4` | Image tuilée hexagonale |
| `hextilednormalmap` | `vector3` | Normal map tuilée hexagonale |
| `UsdUVTexture` | `multioutput` | Texture USD |
| `token_image` | `color3` | Image paramétrique par token |
| `mybitmap` | `color3` | Image custom |
| `myimage` | `color3` | Image custom |
| `blur` | `color3`, `color4`, `float`, `vector2`, `vector3`, `vector4` | Flou d'image |

### 5.8 Coordonnées de texture et placement

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `texcoord` | `vector2`, `vector3` | Coordonnées UV de la géométrie |
| `place2d` | `vector2` | Transformation 2D des UVs |
| `rotate2d` | `vector2` | Rotation 2D des UVs |
| `rotate3d` | `vector3` | Rotation 3D |
| `triplanarprojection` | `color3`, `color4`, `vector2`, `vector3`, `float`, `vector4` | Projection triplanaire |
| `transformmatrix` | `vector2`, `vector3`, `vector4` | Transformation matricielle |
| `transformpoint` | `vector3`, `vector2` | Transformation d'un point |
| `transformvector` | `vector3`, `vector4` | Transformation d'un vecteur |
| `transformnormal` | `vector3` | Transformation d'une normale |

### 5.9 Cartes normales et déplacement

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `normalmap` | `vector3` | Décodage d'une normal map |
| `heighttonormal` | `vector3` | Conversion hauteur → normale |
| `mynormal_map` | `vector3` | Normal map custom |

### 5.10 Données géométriques

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `position` | `vector3` | Position du point courant |
| `normal` | `vector3` | Normale de surface |
| `tangent` | `vector3` | Tangente de surface |
| `bitangent` | `vector3` | Bitangente de surface |
| `viewdirection` | `vector3` | Direction vers la caméra |
| `facingratio` | `float` | Rapport de face (N·V) |
| `geomcolor` | `float`, `color3`, `color4` | Couleur vertex |
| `geompropvalue` | `integer`, `boolean`, `float`, `color3`, `color4`, `vector2`, `vector3`, `vector4` | Propriété géométrique par nom |
| `geompropvalueuniform` | `string` | Propriété géométrique uniforme |
| `geomattrvalue` | `integer` | Attribut géométrique entier |
| `frame` | `float` | Numéro de frame courant |
| `time` | `float` | Temps courant |
| `positionwrapper` | `vector3` | Wrapper de position (test) |

### 5.11 Cheveux

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `chiang_hair_bsdf` | `BSDF` | BSDF cheveux (Chiang 2016) |
| `chiang_hair_roughness` | `multioutput` | Calcul de roughness cheveux |
| `chiang_hair_absorption_from_color` | `vector3` | Absorption depuis couleur |
| `deon_hair_absorption_from_melanin` | `vector3` | Absorption depuis mélanine |

### 5.12 Utilitaires PBR

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `roughness_anisotropy` | `vector2` | Conversion roughness anisotrope |
| `roughness_dual` | `vector2` | Roughness dual axis |
| `artistic_ior` | `multioutput` | IOR depuis F0 artistique |
| `blackbody` | `color3` | Émission corps noir (température → couleur) |

### 5.13 Mathématiques — Arithmétique

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `add` | `color3`, `float`, `vector2`, `vector3`, `vector4`, `color4`, `integer`, `matrix33`, `matrix44` | Addition |
| `subtract` | *(idem)* | Soustraction |
| `multiply` | *(idem)* | Multiplication |
| `divide` | *(idem)* | Division |
| `modulo` | `float`, `color3`, `color4`, `vector2`, `vector3`, `vector4` | Modulo |
| `power` | `float`, `color3`, `color4`, `vector2`, `vector3`, `vector4` | Puissance |
| `safepower` | *(idem)* | Puissance sécurisée (≥0) |
| `sqrt` | `float`, `vector2`, `vector3`, `vector4` | Racine carrée |
| `exp` | *(idem)* | Exponentielle |
| `ln` | *(idem)* | Logarithme naturel |
| `absval` | `float`, `color3`, `color4`, `vector2`, `vector3`, `vector4` | Valeur absolue |
| `sign` | *(idem)* | Signe (−1, 0, +1) |
| `floor` | `float`, `color3`, `color4`, `vector2`, `vector3`, `vector4`, `integer` | Plancher |
| `ceil` | *(idem)* | Plafond |
| `round` | *(idem)* | Arrondi |
| `fract` | `float`, `color3`, `color4`, `vector2`, `vector3`, `vector4` | Partie fractionnaire |
| `trianglewave` | `float` | Onde triangulaire |

### 5.14 Mathématiques — Trigonométrie

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `sin` | `float`, `vector2`, `vector3`, `vector4` | Sinus |
| `cos` | *(idem)* | Cosinus |
| `tan` | *(idem)* | Tangente |
| `asin` | *(idem)* | Arc sinus |
| `acos` | *(idem)* | Arc cosinus |
| `atan2` | *(idem)* | Arc tangente à 2 arguments |

### 5.15 Mathématiques — Vecteurs / matrices

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `dotproduct` | `float` | Produit scalaire |
| `crossproduct` | `vector3` | Produit vectoriel |
| `magnitude` | `float` | Norme d'un vecteur |
| `normalize` | `vector2`, `vector3`, `vector4` | Normalisation |
| `reflect` | `vector3` | Réflexion d'un vecteur |
| `rotate` | `vector2`, `vector3` | Rotation |
| `creatematrix` | `matrix33`, `matrix44` | Construction de matrice |
| `determinant` | `float` | Déterminant |
| `invertmatrix` | `matrix33`, `matrix44` | Inversion de matrice |
| `transpose` | `matrix33`, `matrix44` | Transposée |

### 5.16 Mathématiques — Utilitaires scalaires/couleur

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `clamp` | `float`, `color3`, `color4`, `vector2`, `vector3`, `vector4` | Clamping |
| `min` | *(idem)* | Minimum |
| `max` | *(idem)* | Maximum |
| `remap` | *(idem)* | Remappage d'intervalle |
| `smoothstep` | `float`, `vector2`, `vector3`, `vector4` | Lissage Hermite |
| `contrast` | `float` | Contraste |
| `invert` | `float`, `color3`, `color4`, `vector2`, `vector3`, `vector4`, `matrix33`, `matrix44` | Inversion |
| `mix` | `float`, `color3`, `color4`, `vector2`, `vector3`, `vector4`, `surfaceshader`, `BSDF`, `EDF` | Interpolation linéaire |
| `luminance` | `color3`, `color4` | Luminance |
| `dot` | `float`, `color3`, `color4`, `vector2`, `vector3`, `vector4`, `matrix44`, `filename` | Passe-fil (identity) |

### 5.17 Conditions et logique

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `ifequal` | tous types numériques + booléen | Sélection si égal |
| `ifgreater` | *(idem)* | Sélection si supérieur |
| `ifgreatereq` | *(idem)* | Sélection si supérieur ou égal |
| `switch` | `color3`, `vector4` | Sélection par indice entier |
| `compare` | tous types numériques | Comparaison |
| `and` | `boolean` | ET logique |
| `or` | `boolean` | OU logique |
| `not` | `boolean` | NON logique |
| `xor` | `boolean` | OU exclusif |

### 5.18 Canaux — Combine / Separate / Convert

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `combine2` | `vector2`, `color4`, `vector4` | Assembler 2 scalaires |
| `combine3` | `color3`, `vector3` | Assembler 3 scalaires |
| `combine4` | `color4`, `vector4` | Assembler 4 scalaires |
| `combine` | `color2`, `color3`, `color4` | Assembler des canaux |
| `separate2` | `multioutput` | Séparer un vecteur 2D |
| `separate3` | `multioutput` | Séparer un vecteur 3D |
| `separate4` | `multioutput` | Séparer un vecteur 4D |
| `separate` | `multioutput` | Séparation générique |
| `color4split` | `multioutput` | Séparer un color4 |
| `extract` | `float`, `vector3`, `vector4` | Extraire un composant par indice |
| `swizzle` | `color3`, `color4` | Réarrangement de canaux |
| `convert` | `float`, `color3`, `vector2`, `vector3`, `vector4` | Conversion de type |

### 5.19 Opérations couleur (compositing)

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `hsvtorgb` | `color3`, `color4` | HSV → RGB |
| `rgbtohsv` | `color3`, `color4` | RGB → HSV |
| `burn` | `float`, `color3`, `color4` | Burn (compositing) |
| `dodge` | `float`, `color3`, `color4` | Dodge (compositing) |
| `screen` | `float`, `color3`, `color4` | Screen (compositing) |
| `difference` | `float`, `color3`, `color4` | Différence (compositing) |
| `over` | `color4` | Composition over |
| `matte` | `color4` | Composition matte |
| `mask` | `color4` | Masquage |
| `in` | `color4` | Composition in |
| `out` | `color4` | Composition out |
| `inside` | `float`, `color3`, `color4` | Intérieur d'un masque |
| `outside` | `float`, `color3`, `color4` | Extérieur d'un masque |
| `disjointover` | `color4` | Composition disjoint-over |
| `plus` | `float`, `color3`, `color4` | Addition couleur clampée |
| `minus` | `float`, `color3`, `color4` | Soustraction couleur clampée |
| `premult` | `color4` | Pré-multiplication alpha |
| `unpremult` | `color4` | Dé-multiplication alpha |

### 5.20 Bruit et procédural

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `noise2d` | `float`, `color3`, `vector2`, `vector3`, `vector4` | Bruit Perlin 2D |
| `noise3d` | `float`, `color3`, `vector2`, `vector3`, `vector4` | Bruit Perlin 3D |
| `fractal2d` | `float`, `vector2`, `vector3`, `vector4` | Bruit fractal 2D |
| `fractal3d` | `float`, `color3`, `vector2`, `vector3`, `vector4` | Bruit fractal 3D |
| `cellnoise2d` | `float` | Bruit cellulaire 2D |
| `cellnoise3d` | `float` | Bruit cellulaire 3D |
| `worleynoise2d` | `float`, `vector2`, `vector3` | Bruit de Worley 2D |
| `worleynoise3d` | `float`, `vector2`, `vector3` | Bruit de Worley 3D |
| `flake2d` | `multioutput` | Flocon 2D (peinture nacré) |
| `flake3d` | `multioutput` | Flocon 3D (peinture nacré) |

### 5.21 Patterns procéduraux

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `checker` | `float` | Damier |
| `circle` | `float` | Cercle |
| `line` | `float` | Ligne |
| `grid` | `color3` | Grille |
| `crosshatch` | `color3` | Hachures croisées |
| `ramp4` | `color3`, `color4`, `float`, `vector2`, `vector3`, `vector4` | Dégradé 4 coins |
| `ramplr` | *(idem)* | Dégradé gauche-droite |
| `ramptb` | *(idem)* | Dégradé haut-bas |
| `splitlr` | *(idem)* | Split gauche-droite |
| `splittb` | *(idem)* | Split haut-bas |
| `randomcolor` | `color3` | Couleur aléatoire |
| `tiledcircles` | `color3` | Cercles tuilés |
| `tiledcloverleafs` | `color3` | Trèfles tuilés |
| `tiledhexagons` | `color3` | Hexagones tuilés |
| `tm_test` | `color3` | Test texture mapping |
| `tm_retest` | `color3` | Re-test texture mapping |

### 5.22 Nœuds d'organisation / méta

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `backdrop` | *(vide)* | Nœud d'annotation visuel (éditeur de graphe) |
| `token` | `string` | Token de paramètre (substitution dans `filename`) |
| `dot` | tous types | Passe-fil sans transformation |
| `output` | tous types | Sortie explicite dans un nodegraph |
| `input` | `color3` | Entrée explicite (usage rare) |
| `shader` | *(vide)* | Nœud shader générique (obsolète) |
| `material` | *(vide)* | Nœud matériau générique (obsolète) |
| `opgraph` | *(vide)* | Graphe d'opération (usage interne) |

### 5.23 Nœuds custom / test (fichiers TestSuite)

| Catégorie | Type(s) de sortie | Notes |
|---|---|---|
| `mybitmap_remap` | `float` | Remappage bitmap custom |
| `customtype` | `multioutput` | Type de sortie custom |
| `upstream_graph_def` | `multioutput` | Graphe upstream (test nodegraph-to-nodegraph) |
| `extract_s` | `float` | Extraction struct `ss` (test typedef) |
| `extract_first_s_group` | `float` | Extraction groupe struct (test typedef) |

---

## 6. Règles de validité logique (vérifiées par le validateur)

| Code | Sévérité | Règle |
|---|---|---|
| DOC-001 | error | `version` présent et non vide |
| DOC-002 | error | Noms uniques parmi nœuds + nodegraphs top-level |
| DOC-003 | error | Noms uniques parmi les `nodedef` |
| DOC-004 | error | Noms uniques parmi les `implementation` |
| DOC-005 | error | Noms uniques parmi les `look` et `collection` |
| ND-001 | warning | Un `nodedef` devrait avoir l'attribut `node` |
| ND-002 | warning | Un `nodedef` devrait avoir au moins une sortie |
| NG-001 | error | `nodegraph.nodedef` référence un `nodedef` existant |
| NG-002 | error | Noms uniques à l'intérieur d'un `nodegraph` |
| NG-003 | error | Les `<output>` du graph pointent vers des nœuds internes existants |
| NG-004 | error | Les `interfacename` dans les nœuds internes existent sur le `nodedef` |
| NG-005 | error | Les sorties du nodegraph correspondent aux sorties du nodedef |
| NODE-001 | error | `nodename` référence un nœud existant dans la portée courante |
| NODE-002 | error | `nodegraph` référence un nodegraph existant dans le document |
| NODE-003 | error | `output` référence un port existant sur le nœud/graph ciblé |
| NODE-004 | info/error | Exactement une source de valeur par input |
| IMPL-001 | error | `implementation.nodedef` référence un `nodedef` existant |
| LOOK-001 | error/warning | `materialassign.material` référence un nœud ou nodegraph existant |
| LOOK-002 | error/warning | `materialassign.collection` référence une collection existante |
| COLL-001 | error | `includecollection` référence une collection existante |

> LOOK-001/002 sont dégradés en **warning** quand le document contient un `xi:include`,  
> car les symboles manquants peuvent être définis dans le fichier inclus.

---

## 7. Fichiers créés

```
src/
  mtlx/
    types.ts             — Modèle TypeScript générique (MtlxDocument, MtlxNode, …)
    parser.ts            — Parseur XML → MtlxDocument (via fast-xml-parser)
    validator.ts         — Validateur logique (20 règles)
  test-mtlx.ts           — Runner : parse + valide tous les .mtlx, rapport coloré
  dump-categories.ts     — Utilitaire : liste les catégories de nœuds
  dump-categories-typed.ts — Utilitaire : liste catégories + types de sortie
```
