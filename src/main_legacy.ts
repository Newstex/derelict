/**
 * DERELICT — Entry point / bootstrap.
 *
 * Wires together: Sim, Renderer, HUD, MenuSystem, InputHandler,
 * CameraController, AudioSystem. Runs the game loop (sim at 20Hz,
 * renderer at 60fps), handles menu transitions, pause/resume,
 * save/load, game over and victory.
 *
 * NOTE: Sim (src/sim/world.ts) is built by another agent. The Renderer
 * owns its scene/camera and exposes them read-only. This file owns the
 * master game loop (sim at 20Hz via setInterval, render at 60fps via rAF)
 * so camera + HUD stay in sync with rendering.
 */

import * as THREE from 'three';

// World interface + types
import {
  type IWorld,
  type SimEvent,
  CharacterClass,
  GamePhase,
  SimEventType,
} from './world_api.js';

// Sim + Renderer (built by other agents — import from expected paths)
import { Sim } from './sim/world.js';
import { Renderer } from './render/renderer.js';

// Ability definitions (from sim content module, for HUD tooltips)
import { PLAYER_ABILITIES } from './sim/content/abilities.js';

// UI layer (DOM)
import { HUD } from './ui/HudLegacy.js';
import { MenuSystem } from './ui/menus.js';
import { TooltipSystem } from './ui/tooltips.js';

// Game layer
import { InputHandler } from './game/input.js';
import { CameraController } from './game/camera.js';
import { AudioSystem } from './game/audio.js';

// Styles (imported so Vite bundles them)
import './ui/styles.css';

const SIM_HZ = 20;
const SIM_DT = 1 / SIM_HZ;
const MAX_FRAME_DT = 0.1;

class GameBootstrap {
  private world: IWorld;
  private renderer: Renderer;
  private camera: THREE.PerspectiveCamera;
  private scene: THREE.Scene;

  private hud: HUD;
  private menus: MenuSystem;
  private tooltips: TooltipSystem;
  private input: InputHandler;
  private cameraCtrl: CameraController;
  private audio: AudioSystem;

  // DOM roots
  private canvas: HTMLCanvasElement;
  private hudRoot: HTMLElement;

  // Loop state
  private simInterval: number | null = null;
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private running = false;

  // Event tap — captures events drained by HUD so audio can react too.
  private eventTap: SimEvent[] = [];

  // Phase tracking
  private lastPhase: GamePhase = GamePhase.MainMenu;

  constructor() {
    // --- DOM setup ---
    const appRoot = document.getElementById('app') ?? document.body;
    this.canvas = (document.getElementById('game-canvas') as HTMLCanvasElement) ??
      this.createCanvas(appRoot);
    this.hudRoot = (document.getElementById('hud-root') as HTMLElement) ??
      this.createHudRoot(appRoot);

    // --- Core sim (implements IWorld) ---
    this.world = new Sim() as IWorld;

    // Wrap drainEvents so audio can tap the event stream without
    // double-draining. The HUD calls drainEvents() each update;
    // we intercept and copy events into eventTap for audio dispatch.
    this.wrapDrainEvents();

    // --- Renderer (owns scene + camera, exposes them read-only) ---
    this.renderer = new Renderer(this.canvas, this.world);
    this.scene = this.renderer.scene;
    this.camera = this.renderer.camera;

    // --- Game subsystems ---
    this.cameraCtrl = new CameraController(this.camera, this.world);
    this.audio = new AudioSystem();

    // --- UI subsystems ---
    this.hud = new HUD(this.world, this.hudRoot);
    // Register ability definitions so HUD can display icons/cooldowns
    this.hud.registerAbilities(Object.values(PLAYER_ABILITIES));
    this.menus = new MenuSystem(this.world, this.hudRoot);
    this.tooltips = new TooltipSystem(this.hudRoot);
    // Wire tooltip system to HUD for ability hover tooltips
    this.hud.setTooltipSystem(this.tooltips);

    // --- Input ---
    this.input = new InputHandler(this.world, this.canvas, {
      onToggleInventory: () => this.toggleInventory(),
      onToggleCharacterSheet: () => this.toggleCharacterSheet(),
      onTogglePause: () => this.togglePause(),
    });

    // Wire camera drag/zoom from input → camera controller
    this.input.onCameraDrag = (dx, dy) => this.cameraCtrl.applyDrag(dx, dy);
    this.input.onCameraZoom = (delta) => this.cameraCtrl.applyZoom(delta);

    // Wire menu callbacks
    this.wireMenus();

    // Resize handling
    window.addEventListener('resize', this.onResize);

    // Start with main menu visible
    this.menus.showMainMenu();

    // Start loops
    this.startSimLoop();
    this.startRenderLoop();
  }

  private createCanvas(parent: HTMLElement): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.id = 'game-canvas';
    parent.insertBefore(c, parent.firstChild);
    return c;
  }

  private createHudRoot(parent: HTMLElement): HTMLElement {
    const d = document.createElement('div');
    d.id = 'hud-root';
    parent.appendChild(d);
    return d;
  }

  // ----------------------------------------------------------
  // Event tap — intercept drainEvents so audio + HUD share events
  // ----------------------------------------------------------

  private wrapDrainEvents(): void {
    const world = this.world as IWorld;
    const original = world.drainEvents.bind(world);
    const tap = this.eventTap;
    world.drainEvents = (): SimEvent[] => {
      const events = original();
      for (const e of events) tap.push(e);
      return events;
    };
  }

  // ----------------------------------------------------------
  // Menu wiring
  // ----------------------------------------------------------

  private wireMenus(): void {
    this.menus.onStartGame = (classId) => this.startNewGame(classId);
    this.menus.onLoadGame = () => this.loadGame();
    this.menus.onResume = () => this.resumeGame();
    this.menus.onSave = () => this.saveGame();
    this.menus.onQuitToMenu = () => this.quitToMenu();
    this.menus.onRestart = () => this.restartGame();
  }

  private startNewGame(classId: CharacterClass): void {
    this.audio.resume();
    this.audio.playUiBlip();
    this.world.command({ type: 'newGame', classId });
    // Step once to initialize world state so getPlayer/getZone work
    this.world.step(SIM_DT);
    this.menus.hideAll();
    this.audio.startAmbient();
    this.hud.showZoneLabel(this.world.getZone().name);
  }

  private loadGame(): void {
    this.audio.resume();
    this.audio.playUiBlip();
    this.world.command({ type: 'load' });
    this.world.step(SIM_DT);
    this.menus.hideAll();
    this.audio.startAmbient();
    this.hud.showZoneLabel(this.world.getZone().name);
  }

  private saveGame(): void {
    this.audio.playUiBlip();
    this.world.command({ type: 'save' });
  }

  private resumeGame(): void {
    this.audio.playUiBlip();
    this.menus.hideAll();
  }

  private quitToMenu(): void {
    this.audio.playUiBlip();
    this.audio.stopAmbient();
    this.menus.showMainMenu();
  }

  private restartGame(): void {
    this.audio.playUiBlip();
    this.audio.stopAmbient();
    try {
      const player = this.world.getPlayer();
      const classId = player.classId ?? CharacterClass.Engineer;
      this.world.command({ type: 'newGame', classId });
      this.world.step(SIM_DT);
      this.menus.hideAll();
      this.audio.startAmbient();
      this.hud.showZoneLabel(this.world.getZone().name);
    } catch {
      // If we can't read the player (sim not initialized), go to char creation
      this.menus.showCharacterCreation();
    }
  }

  private togglePause(): void {
    if (this.world.phase === GamePhase.Playing) {
      this.menus.showPause();
    } else if (this.world.phase === GamePhase.Paused) {
      this.menus.hideAll();
    }
  }

  private toggleInventory(): void {
    // Inventory panel could be a future UI component.
    // Acknowledge with audio blip for now.
    this.audio.playUiBlip();
  }

  private toggleCharacterSheet(): void {
    this.audio.playUiBlip();
  }

  // ----------------------------------------------------------
  // Game loops
  // ----------------------------------------------------------

  private startSimLoop(): void {
    if (this.simInterval !== null) return;
    this.simInterval = window.setInterval(() => {
      if (this.world.phase === GamePhase.Playing) {
        this.world.step(SIM_DT);
      }
    }, SIM_DT * 1000);
  }

  private startRenderLoop(): void {
    if (this.rafId !== null) return;
    this.running = true;
    this.lastFrameTime = performance.now();

    const loop = (now: number): void => {
      if (!this.running) return;
      const dt = Math.min(MAX_FRAME_DT, (now - this.lastFrameTime) / 1000);
      this.lastFrameTime = now;

      // Camera follows player (smooth)
      this.cameraCtrl.update(dt);

      // Render the 3D scene
      this.renderer.render(dt);

      // Update HUD if in-game (this calls drainEvents, which taps events)
      const phase = this.world.phase;
      if (phase === GamePhase.Playing || phase === GamePhase.Paused) {
        this.hud.update();
        this.menus.update();
      }

      // Dispatch tapped events to audio system
      this.dispatchAudioEvents();

      // Check for phase transitions (game over / victory)
      this.checkPhaseTransitions();

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  // ----------------------------------------------------------
  // Audio event dispatch (from event tap)
  // ----------------------------------------------------------

  private dispatchAudioEvents(): void {
    if (this.eventTap.length === 0) return;
    for (const ev of this.eventTap) {
      this.handleAudioEvent(ev);
    }
    this.eventTap.length = 0;
  }

  private handleAudioEvent(ev: SimEvent): void {
    switch (ev.type) {
      case SimEventType.ProjectileFired:
        this.audio.playZap();
        break;
      case SimEventType.Damage:
        this.audio.playHit();
        break;
      case SimEventType.Death:
        this.audio.playExplosion();
        break;
      case SimEventType.LevelUp:
        this.audio.playLevelUp();
        break;
      case SimEventType.AbilityUsed:
        this.audio.playAbilityActivate();
        break;
      default:
        break;
    }
  }

  // ----------------------------------------------------------
  // Phase transitions
  // ----------------------------------------------------------

  private checkPhaseTransitions(): void {
    const phase = this.world.phase;
    if (phase === this.lastPhase) return;
    this.lastPhase = phase;

    if (phase === GamePhase.GameOver) {
      this.audio.stopAmbient();
      this.audio.playExplosion();
      this.menus.showGameOver();
    } else if (phase === GamePhase.Victory) {
      this.audio.stopAmbient();
      this.audio.playLevelUp();
      this.menus.showVictory();
    } else if (phase === GamePhase.MainMenu) {
      this.audio.stopAmbient();
      this.menus.showMainMenu();
    }
  }

  // ----------------------------------------------------------
  // Resize
  // ----------------------------------------------------------

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.resize(window.innerWidth, window.innerHeight);
  };
}

// ----------------------------------------------------------
// Bootstrap
// ----------------------------------------------------------

function start(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new GameBootstrap();
    });
  } else {
    new GameBootstrap();
  }
}

start();

export {};