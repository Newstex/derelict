/**
 * InputHandler — keyboard/mouse input → world.command().
 *
 * WASD movement, 1-4 abilities, E interact, F pickup,
 * I inventory, Tab character sheet, Esc pause.
 * Mouse drag forwarded to camera controller if set.
 */

import {
  type IWorld,
  type Vec3,
  EntityKind,
  type Entity,
  GamePhase,
} from '../world_api.js';

/** External hooks for UI toggles (set by main.ts). */
export interface InputHooks {
  onToggleInventory?: () => void;
  onToggleCharacterSheet?: () => void;
  onTogglePause?: () => void;
}

export class InputHandler {
  private readonly world: IWorld;
  private readonly canvas: HTMLCanvasElement;
  private hooks: InputHooks;

  // Movement state
  private keysDown = new Set<string>();
  private movementTimer: number | null = null;

  // Mouse state for camera orbit
  private mouseDragging = false;
  private mouseLastX = 0;
  private mouseLastY = 0;

  /** Camera orbit callback — set by CameraController or main.ts. */
  onCameraDrag: ((dx: number, dy: number) => void) | null = null;
  onCameraZoom: ((delta: number) => void) | null = null;

  // Bound handlers (for removal)
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseUp: () => void;
  private boundWheel: (e: WheelEvent) => void;
  private boundContext: (e: Event) => void;
  private boundBlur: () => void;

  private destroyed = false;

  constructor(world: IWorld, canvas: HTMLCanvasElement, hooks: InputHooks = {}) {
    this.world = world;
    this.canvas = canvas;
    this.hooks = hooks;

    this.boundKeyDown = (e) => this.onKeyDown(e);
    this.boundKeyUp = (e) => this.onKeyUp(e);
    this.boundMouseDown = (e) => this.onMouseDown(e);
    this.boundMouseMove = (e) => this.onMouseMove(e);
    this.boundMouseUp = () => this.onMouseUp();
    this.boundWheel = (e) => this.onWheel(e);
    this.boundContext = (e) => e.preventDefault();
    this.boundBlur = () => this.onBlur();

    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    canvas.addEventListener('mousedown', this.boundMouseDown);
    window.addEventListener('mousemove', this.boundMouseMove);
    window.addEventListener('mouseup', this.boundMouseUp);
    canvas.addEventListener('wheel', this.boundWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.boundContext);
    window.addEventListener('blur', this.boundBlur);

    // Start movement loop (20Hz to match sim)
    this.movementTimer = window.setInterval(() => this.flushMovement(), 50);
  }

  // ----------------------------------------------------------
  // Keyboard
  // ----------------------------------------------------------

  private onKeyDown(e: KeyboardEvent): void {
    if (this.destroyed) return;
    const code = e.code;

    // Prevent default for game keys to avoid page scroll
    const gameKeys = [
      'KeyW', 'KeyA', 'KeyS', 'KeyD',
      'Digit1', 'Digit2', 'Digit3', 'Digit4',
      'KeyE', 'KeyF', 'KeyI', 'Tab', 'Escape',
    ];
    if (gameKeys.includes(code)) {
      e.preventDefault();
    }

    // Handle one-shot keys on keydown (not repeat)
    if (!e.repeat) {
      switch (code) {
        case 'Digit1':
          this.useAbility(0);
          return;
        case 'Digit2':
          this.useAbility(1);
          return;
        case 'Digit3':
          this.useAbility(2);
          return;
        case 'Digit4':
          this.useAbility(3);
          return;
        case 'KeyE':
          this.interact();
          return;
        case 'KeyF':
          this.pickup();
          return;
        case 'KeyI':
          this.hooks.onToggleInventory?.();
          return;
        case 'Tab':
          this.hooks.onToggleCharacterSheet?.();
          return;
        case 'Escape':
          this.hooks.onTogglePause?.();
          return;
      }
    }

    this.keysDown.add(code);
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keysDown.delete(e.code);
  }

  private onBlur(): void {
    this.keysDown.clear();
    this.mouseDragging = false;
  }

  // ----------------------------------------------------------
  // Movement (polled at 20Hz)
  // ----------------------------------------------------------

  private flushMovement(): void {
    if (this.destroyed) return;
    if (this.world.phase !== GamePhase.Playing) return;

    let dx = 0;
    let dz = 0;

    if (this.keysDown.has('KeyW')) dz -= 1;
    if (this.keysDown.has('KeyS')) dz += 1;
    if (this.keysDown.has('KeyA')) dx -= 1;
    if (this.keysDown.has('KeyD')) dx += 1;

    if (dx === 0 && dz === 0) return;

    // Normalize diagonal
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      dx /= len;
      dz /= len;
    }

    const running = this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight');

    this.world.command({
      type: 'move',
      intent: { dx, dz, running },
    });
  }

  // ----------------------------------------------------------
  // Abilities
  // ----------------------------------------------------------

  private useAbility(slot: number): void {
    if (this.world.phase !== GamePhase.Playing) return;
    const player = this.world.getPlayer();
    const abilityIds = player.abilities ?? [];
    const abilityId = abilityIds[slot];
    if (!abilityId) return;

    // Target nearest enemy, or fallback to cursor direction
    const target = this.findNearestEnemy(player);
    if (target) {
      this.world.command({
        type: 'useAbility',
        intent: { abilityId, targetId: target.id },
      });
    } else {
      // No enemy nearby — fire toward cursor / forward
      const targetPos = this.cursorWorldPos() ?? {
        x: player.pos.x + Math.sin(player.rotation),
        y: player.pos.y,
        z: player.pos.z + Math.cos(player.rotation),
      };
      this.world.command({
        type: 'useAbility',
        intent: { abilityId, targetPos },
      });
    }
  }

  private findNearestEnemy(player: Entity): Entity | null {
    const entities = this.world.getEntities();
    let nearest: Entity | null = null;
    let nearestDist = Infinity;
    for (const ent of entities) {
      if (ent.kind !== EntityKind.Enemy) continue;
      if (!ent.isAlive) continue;
      const d = Math.hypot(
        ent.pos.x - player.pos.x,
        ent.pos.z - player.pos.z,
      );
      if (d < nearestDist) {
        nearestDist = d;
        nearest = ent;
      }
    }
    return nearest;
  }

  /** Approximate cursor world position via raycast placeholder.
   *  In a full implementation this would unproject through the camera.
   *  For now returns null (caller falls back to forward direction). */
  private cursorWorldPos(): Vec3 | null {
    return null;
  }

  // ----------------------------------------------------------
  // Interact / Pickup
  // ----------------------------------------------------------

  private interact(): void {
    if (this.world.phase !== GamePhase.Playing) return;
    const player = this.world.getPlayer();
    const target = this.findNearestInteractable(player);
    if (target) {
      this.world.command({
        type: 'interact',
        intent: { targetId: target.id },
      });
    }
  }

  private findNearestInteractable(player: Entity): Entity | null {
    const entities = this.world.getEntities();
    let nearest: Entity | null = null;
    let nearestDist = Infinity;
    const maxRange = 3.0;
    for (const ent of entities) {
      if (ent.kind !== EntityKind.Npc && ent.kind !== EntityKind.Prop) continue;
      const d = Math.hypot(
        ent.pos.x - player.pos.x,
        ent.pos.z - player.pos.z,
      );
      if (d < nearestDist && d <= maxRange) {
        nearestDist = d;
        nearest = ent;
      }
    }
    return nearest;
  }

  private pickup(): void {
    if (this.world.phase !== GamePhase.Playing) return;
    const player = this.world.getPlayer();
    const target = this.findNearestItem(player);
    if (target) {
      this.world.command({
        type: 'pickup',
        intent: { itemId: target.id },
      });
    }
  }

  private findNearestItem(player: Entity): Entity | null {
    const entities = this.world.getEntities();
    let nearest: Entity | null = null;
    let nearestDist = Infinity;
    const maxRange = 3.0;
    for (const ent of entities) {
      if (ent.kind !== EntityKind.Item) continue;
      const d = Math.hypot(
        ent.pos.x - player.pos.x,
        ent.pos.z - player.pos.z,
      );
      if (d < nearestDist && d <= maxRange) {
        nearestDist = d;
        nearest = ent;
      }
    }
    return nearest;
  }

  // ----------------------------------------------------------
  // Mouse (camera control)
  // ----------------------------------------------------------

  private onMouseDown(e: MouseEvent): void {
    if (e.button === 2 || e.button === 1) {
      // Right or middle button → orbit
      this.mouseDragging = true;
      this.mouseLastX = e.clientX;
      this.mouseLastY = e.clientY;
    } else if (e.button === 0 && this.world.phase === GamePhase.Playing) {
      // Left click → could be click-to-move or ability targeting
      // For now, forward to camera if dragging starts
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.mouseDragging) return;
    const dx = e.clientX - this.mouseLastX;
    const dy = e.clientY - this.mouseLastY;
    this.mouseLastX = e.clientX;
    this.mouseLastY = e.clientY;
    this.onCameraDrag?.(dx, dy);
  }

  private onMouseUp(): void {
    this.mouseDragging = false;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.onCameraZoom?.(e.deltaY);
  }

  // ----------------------------------------------------------
  // Teardown
  // ----------------------------------------------------------

  destroy(): void {
    this.destroyed = true;
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    this.canvas.removeEventListener('mousedown', this.boundMouseDown);
    window.removeEventListener('mousemove', this.boundMouseMove);
    window.removeEventListener('mouseup', this.boundMouseUp);
    this.canvas.removeEventListener('wheel', this.boundWheel);
    this.canvas.removeEventListener('contextmenu', this.boundContext);
    window.removeEventListener('blur', this.boundBlur);
    if (this.movementTimer !== null) {
      clearInterval(this.movementTimer);
      this.movementTimer = null;
    }
    this.keysDown.clear();
  }
}