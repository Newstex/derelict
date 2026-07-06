# AI Asset Pipeline Guide — Issue #3

This document describes the end-to-end AI-assisted 3D asset pipeline used to
produce characters, props, animations, and environment models for DERELICT.
The pipeline is a seven-stage workflow that turns a text concept into a fully
integrated, animated in-game asset. Each stage names the tool it uses, the
constraints that must be respected at that stage, and the deliverable that
feeds the next stage.

The pipeline is intentionally tool-agnostic at the integration boundary:
every stage ultimately produces a standard `.glb` file (glTF 2.0 binary) that
the runtime loads via Three.js `GLTFLoader`. The AI tools are used to *author*
assets; the engine only consumes portable, open glTF.

---

## Pipeline Overview

```
 ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
 │ Stage 1      │──▶│ Stage 2      │──▶│ Stage 3      │──▶│ Stage 4      │
 │ ChatGPT      │   │ 混元3D Studio│   │ AccuRIG      │   │ Mixamo       │
 │ image2       │   │ model gen    │   │ rigging      │   │ animations   │
 │ 4-view sheet │   │ ~50k faces   │   │ skeleton     │   │ source only  │
 └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
                                                                   │
                                                                   ▼
 ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
 │ Stage 7      │◀──│ Stage 6      │◀──│ Stage 5      │   │ (from S4)    │
 │ Codex        │   │ Sketchfab    │   │ Blender +    │   │              │
 │ integrate    │   │ world models │   │ Rokoko       │   │              │
 │ into game    │   │ .glb         │   │ retarget     │   │              │
 └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
```

| Stage | Tool | Input | Output |
|-------|------|-------|--------|
| 1 | ChatGPT image2 | character concept / text prompt | 4-view reference sheet (front/back/side/3-quarter) |
| 2 | 混元3D Studio (Hunyuan3D) | 4-view images | medium-poly 3D model, ~50k faces, `.glb`/`.obj` |
| 3 | AccuRIG | rigged-or-unrigged mesh | skeleton with centered joints, `.glb` |
| 4 | Mixamo | — (browse library) | animation `.fbx`/`.bvh`, **source-only, no skin** |
| 5 | Blender + Rokoko | target armature + Mixamo anims | retargeted `.glb` with animations baked to target |
| 6 | Sketchfab | — (browse library) | environment/world `.glb` models |
| 7 | Codex | all `.glb` assets | integrated game code (loaders, manifests, scenes) |

---

## Stage 1 — ChatGPT image2 → 4-View Character Constraints

**Tool:** ChatGPT with the `image2` (or equivalent multimodal image
generation) model.

**Goal:** Produce a clean four-view reference sheet (front, back, side,
three-quarter) for the character. These four views are the input to the
image-to-3D model generator in Stage 2. The quality of this stage dominates
the quality of the final mesh, so the constraints below are non-negotiable.

### Constraints

The four generated views **must** share all of the following properties so the
image-to-3D reconstructor treats them as the same character in the same pose:

1. **T-pose.** The character stands with arms straight out, parallel to the
   ground, palms down. This is the canonical rigging pose and lets AccuRIG
   place shoulder/wrist joints predictably.
2. **Same stance.** Feet shoulder-width apart, toes forward, weight even.
   Identical leg position across all four views.
3. **Uniform focal length.** All four images are rendered with the same
   camera focal length / field of view. Do not mix a telephoto side view with
   a wide-angle front view — the perspective distortion will confuse the 3D
   reconstructor and produce a skewed model.
4. **Uniform lighting.** Same key/fill direction and intensity across views.
5. **Consistent scale.** The character fills the frame the same way in each
   view (e.g. head-to-toe in front/back, head-to-toe in side, head-to-shoulder
   in the 3-quarter). Keep the subject centred.
6. **Flat background.** A plain, high-contrast background (white or neutral
   grey) so the silhouette is clean.

### Prompt guidance

Prompt the image model explicitly for each constraint, e.g.:

> *Full body concept sheet of [character], four orthographic views — front,
> back, side, three-quarter — all in an identical T-pose with arms straight
> out parallel to the ground, palms down, feet shoulder-width apart. Same
> camera focal length and lighting across all four views. Plain white
> background, clean silhouette, consistent scale, character centred in each
> frame.*

Generate each view separately if a single sheet would violate the uniform
focal-length / scale constraint, then assemble the four into one sheet.

### Deliverable

A single 4-view PNG (or four PNGs) meeting all constraints above. This is the
sole input to Stage 2.

---

## Stage 2 — 混元3D Studio → Medium-Poly Model

**Tool:** 混元3D Studio (Hunyuan3D Studio), the Tencent image-to-3D
reconstruction service.

**Goal:** Convert the 4-view reference sheet into a single watertight,
medium-poly 3D mesh.

### Constraints

1. **Target ~50,000 faces.** Enough geometry to hold silhouette and detail
   for a hero character, low enough to stay performant in a browser scene
   with several characters on screen. If the raw output is heavier, decimate
   in Blender before exporting.
2. **Single mesh.** Merge any loose parts into one connected mesh before
   export. Accessories that must be separate (e.g. a backpack) should be
   exported as a second `.glb` and treated as a Prop (see `AssetType.Prop`).
3. **T-pose preserved.** Do not pose the character in Studio. Keep the T-pose
   from Stage 1 so Stage 3 (AccuRIG) has a predictable bind pose.
4. **UVs and texture.** Export with baked textures (albedo at minimum).
   glTF 2.0 binary (`.glb`) is the preferred export format. If Studio emits
   `.obj` + texture, convert to `.glb` in Blender (see Stage 5).

### Deliverable

A `.glb` (or `.obj` + `.png` texture) of the character in T-pose, ~50k faces,
single mesh, baked textures.

---

## Stage 3 — AccuRIG → Rig Skeleton with Joint Centering

**Tool:** AccuRIG (Reallusion) or equivalent auto-rigging tool.

**Goal:** Add a humanoid skeleton to the T-pose mesh with joints centred in
the mesh volume (not snapped to the surface).

### Constraints

1. **Humanoid skeleton.** Use a standard humanoid rig (hips → spine → chest
   → neck → head; clavicles → upper arms → lower arms → hands; upper legs →
   lower legs → feet). AccuRIG's humanoid preset is the baseline.
2. **Joint centering.** Each joint must sit at the *centre* of the limb
   cross-section, not on the mesh surface. Surface-snapped joints cause
   twisting and candy-wrapper artefacts during animation. Verify elbows,
   knees, and wrists especially.
3. **Bind in T-pose.** Skin the mesh to the skeleton while still in T-pose.
   Do not rotate the arms down before binding.
4. **Export as `.glb`.** Export the rigged character with skin and skeleton as
   glTF 2.0 binary. Keep the mesh + skeleton + skin in one file.

### Deliverable

A rigged `.glb` (mesh + skeleton + skin weights) in T-pose, joints centred.

---

## Stage 4 — Mixamo → Download Animations (Source-Only, No Skin)

**Tool:** Mixamo (Adobe) animation library.

**Goal:** Download the animations the character will use (idle, walk, run,
jump, attack, death, etc.) **without** Mixamo's auto-rigged skin/character.
These become the *source* clips that Stage 5 retargets onto the target
armature from Stage 3.

### Constraints

1. **Source-only.** Download the animation clip itself, not a character+anim
   bundle. In Mixamo, set "With Skin" to **No** when downloading, or download
   the `.bvh`/`.fbx` animation-only export.
2. **No skin.** The downloaded file must contain only the skeleton + animation
   curve data, not a mesh. Mixing Mixamo's T-pose skin in produces duplicate
   geometry and a second skeleton that fights the target rig.
3. **Prefer `.fbx` or `.bvh`.** These carry clean per-bone animation curves
   that Blender + Rokoko can retarget. Avoid Mixamo's `.dae` unless necessary.
4. **Note the source rig name.** Mixamo animations are authored on the
   Mixamo standard humanoid rig; the retarget step needs to know the source
   naming convention.

### Deliverable

A set of animation files (`.fbx` or `.bvh`), one per clip, each containing only
skeleton + animation data (no mesh, no skin).

---

## Stage 5 — Blender + Rokoko → Retarget Animations to Target Armature

**Tool:** Blender 3D + the Rokoko retargeting add-on (or Blender's built-in
`Retarget`/`NLA` workflow if Rokoko is unavailable).

**Goal:** Transfer the animation curves from the Mixamo source skeleton onto
the target armature from Stage 3, bake the result, and export a single
`.glb` containing the character mesh + target skeleton + all retargeted
animations as embedded `THREE.AnimationClip`s.

### Constraints

1. **Target armature = Stage 3 rig.** Retarget onto the AccuRIG skeleton, not
   onto Mixamo's. The character mesh must stay bound to the Stage 3 skin
   weights throughout.
2. **Name mapping.** Use Rokoko's bone-mapping to align Mixamo joint names to
   the AccuRIG joint names. Verify hips, spine, head, and all four limbs map
   correctly before baking.
3. **Bake, don't link.** Bake each retargeted animation into the target
   armature's action/clip. Do not leave live constraints or drivers in the
   file — they don't survive glTF export.
4. **T-pose as rest.** The armature's rest pose must remain the Stage 3 T-pose.
5. **Export as `.glb`.** Export with:
   - mesh + skin + skeleton,
   - all retargeted animations as embedded glTF `animation` extensions,
   - **Y-up** (glTF default; Three.js is Y-up),
   - compression enabled if the file is large.
6. **One `.glb` per character.** All of a character's animations ship inside
   its one `.glb`. The runtime loads clips by name from this single file (see
   `CharacterAsset.playAnimation(name)`).

### Deliverable

A single `.glb` per character containing: mesh + skeleton + skin + all
retargeted `AnimationClip`s. This is the file `CharacterAsset.loadFromGLB(url)`
consumes.

---

## Stage 6 — Sketchfab → Download 3D World Models

**Tool:** Sketchfab (downloadable-licensed models).

**Goal:** Source environment / world art (space station interiors, props,
furniture, set dressing) that would be wasteful to model by hand.

### Constraints

1. **License check.** Only download models whose licence allows use in a
   shipped game (CC-BY, CC0, or purchased). Record attribution where
   required.
2. **`.glb` preferred.** Download the glTF binary export. If only `.fbx` or
   `.obj` is available, convert to `.glb` in Blender first.
3. **Decimate if heavy.** Sketchfab models are often high-poly for showcase.
   Decimate to a budget appropriate for a real-time scene (a few hundred k
   faces for a whole environment is a reasonable ceiling).
4. **Mark as `AssetType.Environment`.** World models are loaded via
   `AssetLoader.loadGLB(url)` and added directly to the scene, not animated
   through `CharacterAsset`.
5. **Re-centre / re-scale.** Many Sketchfab models come with arbitrary origin
   and scale. Normalise to a sensible unit scale (1 unit = 1 metre) and
   re-centre the origin on the model's floor before export.

### Deliverable

A set of `.glb` environment/prop models, each at unit scale, ready to drop
into the scene.

---

## Stage 7 — Codex → Integrate All Assets into the Game

**Tool:** Codex (or any capable coding agent / IDE) operating on the DERELICT
repository.

**Goal:** Wire every `.glb` produced by Stages 2–6 into the running game:
characters load and animate, environments appear in the correct zones, props
sit where level design needs them.

### Integration checklist

1. **Manifest.** Register each asset in an `AssetManifest` (see
   `src/assets/AssetPipeline.ts`) with its `AssetType`, pipeline stage, source
   URL, and target zone/slot.
2. **Loader.** Use `AssetLoader.loadGLB(url)` to load each `.glb` via Three.js
   `GLTFLoader`. Cache loaded `GLTF` results by URL so a model is only fetched
   once even if referenced by many entities.
3. **Characters.** Wrap loaded character glTFs in `CharacterAsset`
   (`loadFromGLB`). Use `playAnimation(name)` to drive clips and
   `setMeshVisibility(bool)` to toggle the mesh (e.g. for first-person view).
4. **Environments.** Add environment `THREE.Group`s from `AssetLoader`
   directly to the `THREE.Scene` for the matching zone.
5. **Animation mixer.** Drive every loaded character's `AnimationMixer` from
   the main render loop (`update(dt)`), advancing each by the frame delta.
6. **Dispose.** On zone transition or game teardown, call `dispose()` on each
   `CharacterAsset` and free the `GLTFLoader` cache to avoid GPU memory leaks.

### Deliverable

A running build (`npm run dev`) where all AI-authored assets appear in-game,
characters animate correctly, and environments render in their zones.

---

## Runtime Types (reference)

The pipeline maps onto these TypeScript types defined in
`src/assets/AssetPipeline.ts`:

| Pipeline concept | TypeScript type |
|------------------|-----------------|
| Kind of asset | `AssetType` enum (`Character`, `Prop`, `Environment`, `Animation`) |
| Stage of the pipeline | `PipelineStage` enum (`ImageSheet` … `Integrated`) |
| One tracked asset | `AssetEntry` (id, type, stage, url, name, createdAt, updatedAt) |
| The whole manifest | `AssetManifest` (register, advance, query by type/stage) |
| glTF loading | `AssetLoader.loadGLB(url)` → `Promise<THREE.GLTF>` |
| A playable character | `CharacterAsset` (`loadFromGLB`, `playAnimation`, `setMeshVisibility`) |

See `src/assets/AssetPipeline.ts` and `src/assets/CharacterAsset.ts` for the
implementation.