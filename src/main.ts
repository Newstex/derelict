/**
 * DERELICT — Entry point (foundation setup).
 *
 * This main.ts wires up the basic Three.js scene (MainScene) with:
 *  - Player entity + camera
 *  - WASD movement via MovementSystem (with collision detection)
 *  - HUD (health bar + oxygen bar)
 *
 * The full game bootstrap (Sim, Renderer, menus, audio) lives in
 * main_legacy.ts and will be integrated once the full pipeline is ready.
 * This file is intentionally minimal so the foundation (issue #1) and
 * player collisions (issue #9) can be verified independently.
 */

import { MainScene } from './scenes/MainScene.js';

// Foundation styles for the new HUD (supplements ui/styles.css)
import './ui/styles.css';

class DerelictGame {
  private scene: MainScene;
  private rafId: number | null = null;
  private lastTime = 0;
  private running = false;

  constructor() {
    const canvas = (document.getElementById('game-canvas') as HTMLCanvasElement) ?? this.createCanvas();
    const hudRoot = (document.getElementById('hud-root') as HTMLElement) ?? this.createHudRoot();

    this.scene = new MainScene(canvas, hudRoot);
    this.start();
  }

  private createCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.id = 'game-canvas';
    document.body.insertBefore(c, document.body.firstChild);
    return c;
  }

  private createHudRoot(): HTMLElement {
    const d = document.createElement('div');
    d.id = 'hud-root';
    document.body.appendChild(d);
    return d;
  }

  private start(): void {
    this.running = true;
    this.lastTime = performance.now();

    const loop = (now: number): void => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.scene.update(dt);
      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  dispose(): void {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.scene.dispose();
  }
}

function boot(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new DerelictGame());
  } else {
    new DerelictGame();
  }
}

boot();

export { DerelictGame };