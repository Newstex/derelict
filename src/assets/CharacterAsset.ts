/**
 * CharacterAsset — runtime wrapper for a loaded, animated character.
 *
 * Owns a single character glTF (mesh + skeleton + animations) loaded from a
 * `.glb` produced by the AI asset pipeline (see
 * docs/ai-asset-pipeline-guide.md, Stages 2–5). Exposes a small, focused API:
 *
 *  - loadFromGLB(url)       — async-load the character .glb via AssetLoader
 *  - playAnimation(name)   — cross-fade to a named animation clip
 *  - setMeshVisibility(bool) — toggle the mesh (e.g. for first-person view)
 *
 * The character's AnimationMixer is advanced from the main render loop via
 * update(dt). The root THREE.Group (this.group) is added to the scene by the
 * caller; CharacterAsset does not add itself to any scene.
 *
 * Addresses GitHub issue #3 (AI Asset Pipeline Integration).
 */

import * as THREE from 'three';
import { AssetLoader, type LoadedGLTF } from './AssetPipeline.js';

/** Options controlling the cross-fade between animation actions. */
export interface CharacterAssetOptions {
  /** Cross-fade duration in seconds when switching animations. Default 0.3. */
  readonly fadeDuration?: number;
}

/**
 * A loaded, animated character.
 *
 * Lifecycle:
 *   const c = new CharacterAsset(loader);
 *   await c.loadFromGLB('/assets/marine.glb');
 *   c.playAnimation('Walk');
 *   // each frame:
 *   c.update(dt);
 *   // on teardown:
 *   c.dispose();
 */
export class CharacterAsset {
  /** Root group to add to a THREE.Scene. */
  readonly group: THREE.Group;

  /** The loaded glTF result (set after a successful load). */
  private loaded: LoadedGLTF | null = null;

  /** Drives animation playback for this character. */
  private mixer: THREE.AnimationMixer | null = null;

  /** Map of clip name → action for quick lookup in playAnimation. */
  private readonly actions = new Map<string, THREE.AnimationAction>();

  /** Currently playing action (the most recently started one). */
  private current: THREE.AnimationAction | null = null;

  /** Cross-fade duration in seconds. */
  private readonly fadeDuration: number;

  /** Whether the mesh is currently visible. */
  private meshVisible = true;

  /** Whether loadFromGLB has completed successfully. */
  private ready = false;

  constructor(
    private readonly loader: AssetLoader,
    options: CharacterAssetOptions = {},
  ) {
    this.group = new THREE.Group();
    this.fadeDuration = options.fadeDuration ?? 0.3;
  }

  /** True once the character .glb has been loaded. */
  get isReady(): boolean {
    return this.ready;
  }

  /** Names of all animation clips available on this character. */
  get animationNames(): string[] {
    if (!this.loaded) return [];
    return this.loaded.animations.map((c) => c.name);
  }

  /** Current mesh visibility. */
  get isMeshVisible(): boolean {
    return this.meshVisible;
  }

  /**
   * Asynchronously load the character from a `.glb` URL.
   *
   * The loaded root group is added to `this.group` (so callers add
   * `this.group` to a scene once, and this method populates it). Animation
   * clips are registered with a fresh `AnimationMixer`.
   *
   * @param url URL of the character .glb
   */
  async loadFromGLB(url: string): Promise<void> {
    const gltf = await this.loader.loadGLB(url);
    this.loaded = gltf;

    // Parent the glTF root under this.group so callers always own the
    // stable root (even if the asset is reloaded).
    gltf.scene.traverse((obj) => {
      obj.castShadow = true;
      obj.receiveShadow = true;
    });
    this.group.add(gltf.scene);

    // Build the mixer and register every embedded clip as an action.
    this.mixer = new THREE.AnimationMixer(gltf.scene);
    this.actions.clear();
    for (const clip of gltf.animations) {
      const action = this.mixer.clipAction(clip);
      this.actions.set(clip.name, action);
    }

    // Auto-play the first clip if present (commonly "Idle"); otherwise leave
    // the character in its bind pose until playAnimation is called.
    if (gltf.animations.length > 0) {
      const first = gltf.animations[0];
      const action = this.actions.get(first.name);
      if (action) {
        action.play();
        this.current = action;
      }
    }

    this.ready = true;
  }

  /**
   * Cross-fade to a named animation.
   *
   * If the name is unknown the call is a no-op (and returns false) so callers
   * can guard with an `if (!playAnimation('Walk')) { /* missing clip */}`.
   *
   * @param name animation clip name (must match a clip in the loaded .glb)
   * @returns true if the animation exists and was started, false otherwise
   */
  playAnimation(name: string): boolean {
    if (!this.mixer) return false;
    const next = this.actions.get(name);
    if (!next) return false;

    if (this.current && this.current !== next) {
      this.current.fadeOut(this.fadeDuration);
    }
    next.reset().fadeIn(this.fadeDuration).play();
    this.current = next;
    return true;
  }

  /** Stop all animation playback, leaving the character in its current pose. */
  stopAnimation(): void {
    if (!this.mixer) return;
    this.mixer.stopAllAction();
    this.current = null;
  }

  /**
   * Toggle the character mesh visibility.
   *
   * The skeleton still updates while hidden (so resuming visibility resumes
   * the correct pose). Useful for first-person cameras where the player's
   * own body should not be rendered.
   */
  setMeshVisibility(visible: boolean): void {
    this.meshVisible = visible;
    if (!this.loaded) return;
    this.loaded.scene.visible = visible;
  }

  /**
   * Advance the animation mixer. Call every frame from the render loop.
   *
   * @param dt delta time in seconds
   */
  update(dt: number): void {
    if (this.mixer) this.mixer.update(dt);
  }

  /** The skeleton helper bones, if loaded. Useful for attaching props. */
  get skeleton(): THREE.Skeleton | null {
    if (!this.loaded) return null;
    let skel: THREE.Skeleton | null = null;
    this.loaded.scene.traverse((obj) => {
      if (skel) return;
      if (obj instanceof THREE.SkinnedMesh && obj.skeleton) {
        skel = obj.skeleton;
      }
    });
    return skel;
  }

  /** Release GPU/runtime resources held by this character. */
  dispose(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.mixer.getRoot());
      this.mixer = null;
    }
    if (this.loaded) {
      this.group.remove(this.loaded.scene);
      this.loaded.scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else if (mat) {
          mat.dispose();
        }
      });
      this.loaded = null;
    }
    this.actions.clear();
    this.current = null;
    this.ready = false;
  }
}