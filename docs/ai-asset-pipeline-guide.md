# DERELICT — AI Asset Pipeline Guide

This document describes the end-to-end AI-assisted asset pipeline used to produce
characters, animations, and world models for DERELICT. The pipeline is split into
seven stages. Each stage has a tool, a set of constraints, a quality gate, and an
output artifact. Work proceeds left to right; a stage should not be considered
complete until its quality gate passes.

```
 ┌─────────┐   ┌────────────┐   ┌─────────┐   ┌────────┐   ┌──────────┐   ┌──────────┐   ┌───────┐
 │ Stage 1 │──▶│  Stage 2   │──▶│ Stage 3 │──▶│ Stage 4│──▶│  Stage 5 │──▶│  Stage 6 │──▶│Stage 7│
 │ image2  │   │ 混元3D      │   │ AccuRIG │   │ Mixamo │   │Blender+  │   │Sketchfab │   │ Codex │
 │constraints│  │Studio      │   │ rig     │   │ anims  │   │Rokoko    │   │ world    │   │ integ.│
 └─────────┘   └────────────┘   └─────────┘   └────────┘   └──────────┘   └──────────┘   └───────┘
```

---

## Stage 1 — ChatGPT image2: Character Constraints

**Goal:** Produce a single, consistent 4-view reference sheet that downstream 3D
generation can consume without manual cleanup.

**Tool:** ChatGPT with the `image2` (DALL·E image) model.

### Constraints

Every character reference image must satisfy **all** of the following:

1. **T-pose.** The character stands in a strict T-pose: arms straight out to the
   sides, palms facing forward (or down), fingers together. No bent elbows, no
   relaxed shoulders, no asymmetry.
2. **Same stance across all four views.** Front, side, back, and 3/4 views must
   show the character in the **identical pose**. Only the camera orbits the
   character; the character does not move.
3. **Uniform focal length.** All four views must use the same effective focal
   length (no telephoto compression on one view and wide-angle distortion on
   another). Practically: prompt for "orthographic-style, flat, no perspective
   distortion" and keep the camera distance constant.
4. **Unified canvas.** All four views are rendered onto a **single image** laid
   out in a 2×2 grid (front | side | back | 3/4) on a neutral background. No
   separate files, no mismatched backgrounds, no border artifacts.
5. **Neutral background.** Solid light-grey (#cccccc) or white. No props, no
   shadows on the ground, no environment.
6. **Consistent lighting.** Soft, frontal, shadowless key light in all views.
7. **No accessories that occlude the body.** Hair tied back, no capes, no
   backpacks. Bulky armor should be approximated as a tight bodysuit; detail is
   added in Stage 2.

### Prompt template

```
A 2x2 character reference sheet for a [ROLE] in a sci-fi space station.
Four views, top row: front view, side view (left). Bottom row: back view,
3/4 view. The character is in a strict A-pose / T-pose, arms straight out,
palms down, standing upright. Identical pose in every view. Orthographic,
flat, no perspective distortion. Neutral light-grey background, soft
shadowless lighting. Full body visible head to toe. No props, no shadows,
no environment. Style: clean concept-art, muted palette.
```

### Output

- `docs/refs/<char-id>_refsheet.png` — the 2×2 reference sheet.

### Quality gate

- [ ] All four views present on one image.
- [ ] T-pose held in every view.
- [ ] No perspective distortion between views.
- [ ] Character fits fully inside each quadrant (no clipping).

---

## Stage 2 — 混元3D Studio: Model Generation

**Goal:** Convert the 2D reference sheet into a clean, medium-poly 3D mesh.

**Tool:** [混元3D Studio](https://3d.hunyuan.tencent.com/) (Tencent Hunyuan 3D).

### Constraints

1. **Input:** the Stage 1 reference sheet only. Do not feed in unrelated art.
2. **Target polycount:** ~50,000 faces (medium-poly). Too low → silhouettes
   break; too high → browser performance suffers. Aim for 40k–60k.
3. **Single mesh.** The output should be one watertight mesh, not a collection of
   disconnected parts. If the generator returns parts, merge them before export.
4. **T-pose preserved.** Do not let the generator apply a relaxed or A-pose. The
   exported model must still be in the Stage 1 T-pose.
5. **Texture atlas:** one 2048×2048 (or 4096×4096 for hero characters) color map.
   PBR maps (normal, roughness, metalness) are welcome but optional.

### Output

- `assets/raw/<char-id>_hunyuan.glb` — the generated model (GLB preferred).
- `assets/raw/<char-id>_color.png` — the color texture if exported separately.

### Quality gate

- [ ] Polycount between 40k and 60k faces.
- [ ] Mesh is watertight (no holes, no floating parts).
- [ ] T-pose intact (arms straight, no bent elbows).
- [ ] Textures load correctly (no missing-material pink).

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Lopsided limbs | Reference views inconsistent | Re-do Stage 1 with stricter prompt |
| 200k+ faces | Generator in high-poly mode | Decimate in Blender (keep <60k) |
| T-pose lost | Generator auto-relaxed the pose | Re-run, explicitly forbid relaxation in prompt |
| Missing face / hole | Low input resolution on one view | Re-generate that view and stitch again |

---

## Stage 3 — AccuRIG: Rigging

**Goal:** Add a humanoid skeleton to the Stage 2 mesh with correctly centered
joints so animations retarget cleanly.

**Tool:** [AccuRIG](https://www.reallusion.com/accurig/) (Reallusion).

### Constraints

1. **Humanoid template.** Use the standard AccuRIG humanoid skeleton (Mixamo-
   compatible hierarchy: hips → spine → chest → neck → head; shoulders →
   elbows → wrists; hips → knees → ankles → feet).
2. **Joint centering.** Every major joint must be centered on the geometric
   center of the corresponding mesh region:
   - **Shoulders** — centered in the armpit, not on the deltoid.
   - **Elbows** — centered between the inner and outer elbow surface.
   - **Wrists** — centered in the wrist cross-section.
   - **Hips** — centered between the left and right hip joints, at the pelvis
     midpoint.
   - **Knees** — centered in the knee cross-section.
   - **Ankles** — centered in the ankle cross-section.
3. **Roll bones** — leave AccuRIG's default roll/secondary bones in place; they
   improve deformation and do not hurt retargeting.
4. **Skin weights** — auto-skin is acceptable, but verify no twisted elbows or
   candy-wrapper shoulders on a quick rotation test.
5. **Export format:** FBX (binary) for the rig, with the mesh and textures
   embedded or alongside.

### Output

- `assets/rigged/<char-id>_rigged.fbx` — rigged character.
- `assets/rigged/<char-id>_rigged.glb` — GLB copy for the browser (convert with
  `blender --background --python export_glb.py` if needed).

### Quality gate

- [ ] All six joint groups (shoulders, elbows, wrists, hips, knees, ankles)
      visually centered in AccuRIG's joint inspector.
- [ ] Rotating each joint by 45° does not produce candy-wrapper or twist
      artifacts.
- [ ] Skeleton hierarchy matches the Mixamo humanoid template.
- [ ] FBX opens in Blender with no missing-bone warnings.

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Elbow twists on rotation | Wrist/forearm roll bone mis-centered | Re-center wrist joint in AccuRIG |
| Candy-wrapper shoulder | Shoulder joint too far out on deltoid | Move shoulder joint into armpit center |
| Mixamo import fails | Non-standard bone names | Use AccuRIG's "Mixamo-compatible" export preset |
| Foot rolls through floor | Ankle joint ahead of heel | Re-center ankle at the ankle cross-section |

---

## Stage 4 — Mixamo: Animation Download

**Goal:** Download the animations the character will use, **source-only**, without
any skin or mesh data.

**Tool:** [Mixamo](https://www.mixamo.com/) (Adobe).

### Constraints

1. **No skin.** Download animations **without** the default Mixamo character
   skin. We only want the animation clip, not a mesh. In the Mixamo download
   dialog choose:
   - Format: **FBX for Unity** (or "FBX Binary").
   - Skin: **Without Skin** / "No Character".
2. **Source-only.** Each download is a single animation; do not batch-merge in
   Mixamo. Merging happens in Stage 5.
3. **In-place vs. forward.** For locomotion (walk, run, strafe) download the
   "In Place" variant so the root does not translate; the game moves the
   character. For cinematics (death, emote) forward-root is fine.
4. **Framerate:** 30 FPS (Mixamo default). Re-sample in Blender if you need 60.
5. **Naming:** keep the Mixamo animation name in the file so Stage 5 can find it.

### Standard animation set (per character)

| Clip | Mixamo search | Type |
|---|---|---|
| Idle | "Idle" | in-place |
| Walk | "Walk" | in-place |
| Run | "Run" | in-place |
| Jump | "Jump" | root-motion ok |
| Crouch Idle | "Crouch Idle" | in-place |
| Crouch Walk | "Crouch Walk" | in-place |
| Attack | "Punch / Swing" | in-place |
| Hit React | "Hit React" | in-place |
| Death | "Death" | forward ok |

### Output

- `assets/anims/source/<anim-name>.fbx` — one file per clip, source-only.

### Quality gate

- [ ] Every file is source-only (no mesh, no material in the FBX).
- [ ] Every locomotion clip is the "In Place" variant (root does not translate).
- [ ] Framerate is 30 FPS.
- [ ] All nine standard clips present for the character.

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Character slides when walking | Downloaded forward-root variant | Re-download "In Place" variant |
| FBX contains a body | Forgot to pick "Without Skin" | Re-download with no skin |
| Clip name lost | Renamed file | Keep Mixamo's clip name in filename |

---

## Stage 5 — Blender + Rokoko: Retargeting

**Goal:** Retarget the source-only Mixamo animations onto the **target armature**
(the AccuRIG rig from Stage 3) and bake them as new actions, one action per clip.

**Tools:** Blender 4.x + [Rokoko Studio Live for Blender](https://www.rokoko.com/)
add-on (the free retargeting tool included with Rokoko's Blender plugin).

### Constraints

1. **Target armature is authoritative.** All animations are retargeted **onto**
   the Stage 3 rig. The Mixamo skeleton is only the **source**; it is never
   shipped to the game.
2. **One action per clip.** Each Mixamo source clip becomes a named Blender
   Action on the target armature. Do not merge multiple clips into one Action.
3. **Bake as new actions.** After retargeting, use Rokoko's "Bake to Action"
   (or Blender's *Animation ▸ Bake Action*) so the retargeted motion is a
   self-contained, standalone Action with no live constraint dependency.
4. **Preserve clip names.** The baked Action's name must equal the original
   Mixamo clip name (`Idle`, `Walk`, `Run`, …) so the runtime can look it up.
5. **Root motion policy:**
   - In-place clips → bake root at origin (no root translation).
   - Forward-root clips → keep root translation in the action.
6. **Export:** single GLB containing the rigged character + all baked Actions
   embedded (Blender: *Export ▸ glTF 2.0 ▸ Animation ▸ All Actions*).

### Workflow

1. Import the Stage 3 rig into Blender.
2. Import a Stage 4 source-only FBX (Mixamo skeleton + clip).
3. Open Rokoko's Retargeting panel; set source = Mixamo skeleton, target =
   AccuRIG rig.
4. Map bones (Rokoko auto-maps humanoid rigs; verify hips/spine/chest/neck/head/
   shoulders/arms/legs map correctly).
5. Retarget, then Bake to Action, naming the Action after the clip.
6. Repeat for every clip. Save the .blend file as the character's master scene.
7. Export GLB with all Actions.

### Output

- `assets/characters/<char-id>.glb` — rigged character with embedded Actions.
- `assets/characters/<char-id>.blend` — Blender master scene (kept for re-bakes).

### Quality gate

- [ ] Every standard clip (Stage 4 list) exists as a baked Action on the target
      rig.
- [ ] No Rokoko constraints remain in the Action (it is fully baked).
- [ ] In-place clips have zero root translation across the clip.
- [ ] GLB opens in `gltfreport` / Three.js with all animations listed.
- [ ] Spot-check: play Idle, Walk, Run, Attack — no foot sliding, no twist.

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Feet slide on walk | In-place clip had residual root motion | Re-bake with "Clear Root Translation" |
| Arms clip into body | Shoulder mapping wrong | Fix shoulder mapping, re-bake |
| Action depends on constraint | Forgot to bake | Bake to Action, do not leave live retarget |
| GLB has only one anim | "All Actions" not checked on export | Re-export with All Actions enabled |
| T-pose lost after bake | Bake range included a non-rest frame | Set pre-roll to rest pose, re-bake |

---

## Stage 6 — Sketchfab: World Models

**Goal:** Download 3D environment/world models (rooms, props, fixtures) that the
game will place into the station.

**Tool:** [Sketchfab](https://sketchfab.com/) (download licensed models).

### Constraints

1. **License:** Only download models under a license compatible with the
   project (CC0, CC-BY, or a purchased commercial license). Record the license
   and attribution in `assets/world/_licenses.csv`.
2. **Polycount per asset:** ≤ 30k faces for a hero prop, ≤ 5k for a filler prop.
   Whole-room kits should be ≤ 100k faces assembled.
3. **Format:** GLB or glTF. Convert FBX/OBJ via Blender before committing.
4. **Textures:** baked into the GLB (embedded) or alongside in the same folder.
   Max 2048×2048 per material; use 512 for small props.
5. **Collision:** world models are **visual only**; collision is generated
   separately by the game's station builder. Do not bake collision meshes in.

### Output

- `assets/world/<asset-id>.glb` — the world model.
- `assets/world/_licenses.csv` — append `asset-id, name, url, license, author`.

### Quality gate

- [ ] License recorded in `_licenses.csv`.
- [ ] Polycount within budget.
- [ ] GLB opens in Three.js with textures intact.
- [ ] No embedded collision meshes.

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Missing textures in-game | Textures not embedded | Re-export GLB with embedded textures |
| Model too big | Different unit scale | Normalize to meters in Blender, re-export |
| License unclear | No license tag on Sketchfab | Do not use; pick a clearly-licensed model |

---

## Stage 7 — Codex: Integration

**Goal:** Wire every produced asset into the DERELICT game build.

**Tool:** Codex (this agent / the dev agent).

### Tasks

1. Place final GLBs under `public/assets/...` (Vite serves `public/`).
2. Register each asset in the `AssetManifest` (`src/assets/AssetPipeline.ts`),
   advancing its `PipelineStage` as it passes each gate.
3. Load characters via `CharacterAsset.loadFromGLB()` and drive the
   `AnimationMixer` from the game loop.
4. Place world models via the station builder; generate collision proxies from
   bounding boxes.
5. Run `npm run build && npm test`; ensure 0 type errors and all tests pass.

### Quality gate

- [ ] `npm run build` succeeds with no TypeScript errors.
- [ ] `npm test` passes (all suites green).
- [ ] Characters animate in-game (idle/walk verified visually).
- [ ] World models render with correct textures.
- [ ] `AssetManifest` shows every shipped asset at `PipelineStage.Complete`.

---

## File Naming Conventions

All asset paths are lowercase, hyphen-separated, with a stable asset-id prefix.

| Kind | Path | Example |
|---|---|---|
| Reference sheet | `docs/refs/<id>_refsheet.png` | `docs/refs/scientist_refsheet.png` |
| Raw generated model | `assets/raw/<id>_hunyuan.glb` | `assets/raw/scientist_hunyuan.glb` |
| Rigged model | `assets/rigged/<id>_rigged.fbx` | `assets/rigged/scientist_rigged.fbx` |
| Source animation | `assets/anims/source/<clip>.fbx` | `assets/anims/source/walk_inplace.fbx` |
| Final character | `assets/characters/<id>.glb` | `assets/characters/scientist.glb` |
| World model | `assets/world/<id>.glb` | `assets/world/corridor_straight.glb` |
| License log | `assets/world/_licenses.csv` | — |

Asset-ids are lowercase, ASCII, hyphen-separated, and stable for the life of the
asset (e.g. `scientist`, `engineer`, `corridor-straight`).

---

## Quick Reference — Stages, Tools, Gates

| # | Stage | Tool | Key constraint | Output |
|---|---|---|---|---|
| 1 | Constraints | ChatGPT image2 | 4-view T-pose, unified canvas | refsheet PNG |
| 2 | Model generation | 混元3D Studio | ~50k faces, watertight | rigged? GLB/FBX |
| 3 | Rigging | AccuRIG | centered joints (6 groups) | rigged FBX/GLB |
| 4 | Animation | Mixamo | source-only, no skin, in-place | source FBX clips |
| 5 | Retargeting | Blender + Rokoko | bake as new Actions on target rig | final character GLB |
| 6 | World assets | Sketchfab | licensed, ≤budget polycount | world GLBs |
| 7 | Integration | Codex | build + tests green | shipped game |

---

## Global Troubleshooting

- **Character looks wrong in-game** → walk back up the pipeline: is the T-pose
  intact at Stage 2? Are joints centered at Stage 3? Is the clip baked (not
  constraint-driven) at Stage 5?
- **Build fails after adding an asset** → usually a path/typo in
  `AssetManifest.setFilePath` or a non-embedded texture. Re-export the GLB with
  embedded textures.
- **Test count dropped** → a previous suite regressed; run `npm test` before
  committing any asset integration.
- **Animations jitter / loop badly** → the "In Place" variant was not used, or
  the bake range started mid-clip. Re-bake from the rest pose.

---

*This guide is the source of truth for the DERELICT asset pipeline. Update it
when a stage's tool or constraints change; do not let it drift from practice.*