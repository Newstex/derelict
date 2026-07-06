/**
 * AssetPipeline — types, manifest, and loader for the AI 3D asset pipeline.
 *
 * This module is the runtime counterpart to the seven-stage AI asset pipeline
 * documented in docs/ai-asset-pipeline-guide.md. It defines:
 *
 *  - AssetType and PipelineStage enums describing what an asset is and how
 *    far through the AI pipeline it has progressed.
 *  - AssetEntry: a single tracked asset (character / prop / environment /
 *    animation) with its current pipeline stage and source URL.
 *  - AssetManifest: a registry that tracks every asset through the pipeline,
 *    lets callers advance an asset's stage, and query by type or stage.
 *  - AssetLoader: a Three.js GLTFLoader wrapper that loads `.glb` files into
 *    Three.js and caches results by URL.
 *
 * Addresses GitHub issue #3 (AI Asset Pipeline Integration).
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ============================================================
// Enums & types
// ============================================================

/** The kind of asset produced by the pipeline. */
export enum AssetType {
  /** A skinned, animated character (mesh + skeleton + animations). */
  Character = 'character',
  /** A static or simple interactive prop (weapon, container, lamp, etc.). */
  Prop = 'prop',
  /** A static environment / world model (room, corridor, set dressing). */
  Environment = 'environment',
  /** An animation clip authored on Mixamo and retargeted in Blender. */
  Animation = 'animation',
}

/**
 * The stage of the AI asset pipeline an asset is currently at.
 *
 * Mirrors the seven-stage pipeline in docs/ai-asset-pipeline-guide.md.
 */
export enum PipelineStage {
  /** Stage 1: ChatGPT image2 four-view reference sheet. */
  ImageSheet = 'image_sheet',
  /** Stage 2: 混元3D Studio medium-poly model (~50k faces). */
  ModelGenerated = 'model_generated',
  /** Stage 3: AccuRIG rig skeleton with joint centering. */
  Rigged = 'rigged',
  /** Stage 4: Mixamo animations downloaded (source-only, no skin). */
  AnimationsDownloaded = 'animations_downloaded',
  /** Stage 5: Blender + Rokoko retarget onto the target armature. */
  Retargeted = 'retargeted',
  /** Stage 6: Sketchfab environment/world model downloaded. */
  WorldModelDownloaded = 'world_model_downloaded',
  /** Stage 7: Codex integration — asset is live in the game. */
  Integrated = 'integrated',
}

/** Ordered pipeline stages, used to validate stage transitions. */
export const PIPELINE_ORDER: readonly PipelineStage[] = [
  PipelineStage.ImageSheet,
  PipelineStage.ModelGenerated,
  PipelineStage.Rigged,
  PipelineStage.AnimationsDownloaded,
  PipelineStage.Retargeted,
  PipelineStage.WorldModelDownloaded,
  PipelineStage.Integrated,
];

/**
 * A single asset tracked through the pipeline.
 *
 * The `stage` field is mutable (advanced as the asset moves through the AI
 * pipeline); everything else is effectively immutable identity metadata.
 */
export interface AssetEntry {
  /** Stable unique identifier for this asset. */
  readonly id: string;
  /** Human-readable name, e.g. "Marine", "Airlock Room", "Walk Animation". */
  readonly name: string;
  /** Kind of asset. */
  readonly type: AssetType;
  /** Current pipeline stage. */
  stage: PipelineStage;
  /** Source URL of the final `.glb` (empty until a file exists). */
  readonly url: string;
  /** Optional target zone / slot this asset is destined for. */
  readonly target?: string;
  /** ISO timestamp the entry was created. */
  readonly createdAt: number;
  /** ISO timestamp the entry (usually its stage) was last updated. */
  updatedAt: number;
}

/** The result of a Three.js GLTFLoader load — minimal shape we use. */
export interface LoadedGLTF {
  readonly scene: THREE.Group;
  readonly animations: THREE.AnimationClip[];
  readonly parser: unknown;
}

// ============================================================
// AssetManifest
// ============================================================

/**
 * Registry tracking every asset through the AI pipeline.
 *
 * Pure data structure — no Three.js or DOM dependencies — so it can be
 * unit-tested in isolation and serialised to JSON for save/inspect.
 */
export class AssetManifest {
  /** Assets keyed by id for O(1) lookup. */
  private readonly entries = new Map<string, AssetEntry>();

  /** Counter used to mint unique ids when no explicit id is given. */
  private counter = 0;

  /**
   * Register a new asset at the start of the pipeline.
   *
   * @param name    human-readable asset name
   * @param type    asset kind
   * @param url     source URL of the final .glb (may be '' until produced)
   * @param target  optional zone/slot the asset is destined for
   * @param id      optional explicit id; defaults to an auto-generated one
   * @returns the created AssetEntry
   */
  register(
    name: string,
    type: AssetType,
    url = '',
    target?: string,
    id?: string,
  ): AssetEntry {
    const resolvedId = id ?? this.mintId();
    if (this.entries.has(resolvedId)) {
      throw new Error(`AssetManifest: duplicate asset id "${resolvedId}"`);
    }
    const now = Date.now();
    const entry: AssetEntry = {
      id: resolvedId,
      name,
      type,
      stage: PipelineStage.ImageSheet,
      url,
      target,
      createdAt: now,
      updatedAt: now,
    };
    this.entries.set(resolvedId, entry);
    return entry;
  }

  /**
   * Advance an asset to the next pipeline stage.
   *
   * The stage must be later than the asset's current stage; jumping backwards
   * is rejected because the pipeline is monotonic. Jumping forward by more
   * than one stage is allowed (e.g. an environment model skips rigging).
   *
   * @param id    asset id
   * @param stage the new pipeline stage
   * @returns the updated AssetEntry
   */
  advance(id: string, stage: PipelineStage): AssetEntry {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new Error(`AssetManifest: unknown asset id "${id}"`);
    }
    const currentIndex = PIPELINE_ORDER.indexOf(entry.stage);
    const nextIndex = PIPELINE_ORDER.indexOf(stage);
    if (nextIndex < currentIndex) {
      throw new Error(
        `AssetManifest: cannot regress "${id}" from ${entry.stage} to ${stage}`,
      );
    }
    entry.stage = stage;
    entry.updatedAt = Date.now();
    return entry;
  }

  /** Look up a single asset by id. */
  get(id: string): AssetEntry | undefined {
    return this.entries.get(id);
  }

  /** All registered assets. */
  all(): AssetEntry[] {
    return [...this.entries.values()];
  }

  /** All assets of a given type. */
  byType(type: AssetType): AssetEntry[] {
    return this.all().filter((e) => e.type === type);
  }

  /** All assets currently at a given pipeline stage. */
  byStage(stage: PipelineStage): AssetEntry[] {
    return this.all().filter((e) => e.stage === stage);
  }

  /** Number of registered assets. */
  get size(): number {
    return this.entries.size;
  }

  /** Remove an asset from the manifest. */
  remove(id: string): boolean {
    return this.entries.delete(id);
  }

  /**
   * Serialise the manifest to a plain array (JSON-safe).
   * Enums are stored as their string values.
   */
  toJSON(): AssetEntry[] {
    return this.all();
  }

  /** Mint a stable, unique id for an auto-registered asset. */
  private mintId(): string {
    this.counter += 1;
    return `asset_${this.counter}`;
  }
}

// ============================================================
// AssetLoader
// ============================================================

/**
 * Three.js wrapper that loads `.glb` (glTF 2.0 binary) files and caches the
 * result by URL so a model is only fetched once even if referenced by many
 * entities.
 *
 * Each successful load returns a `LoadedGLTF` containing the root `THREE.Group`
 * (`scene`) and any embedded `THREE.AnimationClip`s. Callers add `scene` to
 * a `THREE.Scene` and (for characters) feed `animations` to a
 * `THREE.AnimationMixer`.
 */
export class AssetLoader {
  private readonly loader: GLTFLoader;
  /** In-flight + completed loads keyed by URL. */
  private readonly cache = new Map<string, Promise<LoadedGLTF>>();

  /**
   * @param dracoLoader Optional DRACOLoader for compressed-mesh .glb files.
   *                   Pass one only when shipping DRACO-compressed assets.
   */
  constructor(dracoLoader?: THREE.Loader) {
    this.loader = new GLTFLoader();
    if (dracoLoader) {
      this.loader.setDRACOLoader(dracoLoader as never);
    }
  }

  /**
   * Load a `.glb` file from `url`. Returns a promise resolving to the parsed
   * glTF. Concurrent calls for the same URL share a single underlying load.
   *
   * @param url URL of the .glb file
   * @returns the loaded glTF (scene group + animations)
   */
  loadGLB(url: string): Promise<LoadedGLTF> {
    const cached = this.cache.get(url);
    if (cached) return cached;

    const promise = new Promise<LoadedGLTF>((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          resolve({
            scene: gltf.scene,
            animations: gltf.animations,
            parser: gltf.parser,
          });
        },
        undefined,
        (err) => {
          // Drop the failed load from the cache so callers can retry.
          this.cache.delete(url);
          reject(err);
        },
      );
    });

    this.cache.set(url, promise);
    return promise;
  }

  /** Whether a URL has already been loaded (or is currently loading). */
  has(url: string): boolean {
    return this.cache.has(url);
  }

  /** Drop a URL from the cache so the next `loadGLB` re-fetches it. */
  evict(url: string): boolean {
    return this.cache.delete(url);
  }

  /** Clear the entire cache. */
  clear(): void {
    this.cache.clear();
  }
}