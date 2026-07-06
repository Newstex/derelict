/**
 * HUD — Main heads-up display overlay (DOM-based, not Three.js).
 *
 * Creates and manages health/energy/xp bars, ability bar, minimap,
 * status effects, cast bar, damage flash, zone label, and event log.
 * Reads from IWorld every update(); never mutates the sim.
 */

import {
  type IWorld,
  type Entity,
  type Ability,
  SimEventType,
  EntityKind,
  type SimEvent,
} from '../world_api.js';
import { TooltipSystem } from './tooltips.js';

/** Ability icon glyph map — maps iconKey to a unicode glyph for display. */
const ABILITY_GLYPHS: Record<string, string> = {
  ability_deploy_turret: '⚙',
  ability_repair: '🔧',
  ability_overcharge: '⚡',
  ability_power_shot: '🎯',
  ability_combat_stim: '💊',
  ability_suppression: '🔥',
  ability_med_nanites: '✚',
  ability_cryo_blast: '❄',
  ability_bio_scan: '📡',
  ability_rapid_fire: '⫶',
  ability_cloak: '👁',
  ability_scrap_grenade: '💥',
};

const STATUS_GLYPHS: Record<string, string> = {
  effect_regen: '✚',
  effect_overcharge: '⚡',
  effect_stim: '💊',
  effect_slow: '🐌',
  effect_freeze: '❄',
  effect_bleed: '🩸',
  effect_cloak: '👁',
  effect_burn: '🔥',
  effect_shock: '⚡',
  effect_radiation: '☢',
  effect_bioscan: '📡',
};

/** Max event log lines kept on screen. */
const MAX_LOG_LINES = 5;

export class HUD {
  private readonly world: IWorld;
  private readonly root: HTMLElement;
  private overlay!: HTMLElement;

  // Tooltip system (optional — set by main.ts or created internally)
  private tooltipSystem: TooltipSystem | null = null;

  // Vitals
  private healthFill!: HTMLElement;
  private healthText!: HTMLElement;
  private energyFill!: HTMLElement;
  private energyText!: HTMLElement;
  private xpFill!: HTMLElement;
  private xpText!: HTMLElement;
  private levelLabel!: HTMLElement;

  // Status effects
  private statusContainer!: HTMLElement;

  // Ability bar
  private abilitySlots: HTMLElement[] = [];
  private abilityCooldowns: HTMLElement[] = [];
  private abilityIcons: HTMLElement[] = [];
  private abilityCosts: HTMLElement[] = [];

  // Minimap
  private minimapCanvas!: HTMLCanvasElement;
  private minimapCtx!: CanvasRenderingContext2D;
  private minimapLabel!: HTMLElement;

  // Cast bar
  private castBar!: HTMLElement;
  private castBarFill!: HTMLElement;
  private castBarText!: HTMLElement;

  // Damage flash
  private damageFlash!: HTMLElement;

  // Zone label
  private zoneLabel!: HTMLElement;
  private zoneLabelTimer = 0;

  // Event log
  private eventLog!: HTMLElement;
  private logLines: HTMLElement[] = [];

  // Damage flash timer
  private damageFlashTimer = 0;

  constructor(world: IWorld, root: HTMLElement) {
    this.world = world;
    this.root = root;
    this.build();
  }

  // ----------------------------------------------------------
  // DOM construction
  // ----------------------------------------------------------

  private build(): void {
    this.overlay = document.createElement('div');
    this.overlay.className = 'hud-overlay';

    // --- Vitals panel ---
    const vitals = document.createElement('div');
    vitals.className = 'hud-vitals';

    const healthBar = this.makeBar('health');
    this.healthFill = healthBar.fill;
    this.healthText = healthBar.text;
    vitals.appendChild(healthBar.el);

    const energyBar = this.makeBar('energy');
    this.energyFill = energyBar.fill;
    this.energyText = energyBar.text;
    vitals.appendChild(energyBar.el);

    this.levelLabel = document.createElement('div');
    this.levelLabel.className = 'hud-level';
    vitals.appendChild(this.levelLabel);

    const xpBar = this.makeBar('xp');
    this.xpFill = xpBar.fill;
    this.xpText = xpBar.text;
    vitals.appendChild(xpBar.el);

    this.statusContainer = document.createElement('div');
    this.statusContainer.className = 'hud-status-effects';
    vitals.appendChild(this.statusContainer);

    this.overlay.appendChild(vitals);

    // --- Ability bar ---
    const abilityBar = document.createElement('div');
    abilityBar.className = 'hud-abilities';
    for (let i = 0; i < 4; i++) {
      const slot = document.createElement('div');
      slot.className = 'hud-ability-slot';

      const icon = document.createElement('div');
      icon.className = 'hud-ability-icon';
      slot.appendChild(icon);

      const cost = document.createElement('div');
      cost.className = 'hud-ability-cost';
      slot.appendChild(cost);

      const cd = document.createElement('div');
      cd.className = 'hud-ability-cooldown';
      cd.style.height = '0%';
      slot.appendChild(cd);

      const key = document.createElement('div');
      key.className = 'hud-ability-key';
      key.textContent = String(i + 1);
      slot.appendChild(key);

      // Tooltip on hover
      const slotIndex = i;
      slot.addEventListener('mouseenter', (e) => {
        this.showAbilityTooltip(slotIndex, e.clientX, e.clientY);
      });
      slot.addEventListener('mousemove', (e) => {
        this.showAbilityTooltip(slotIndex, e.clientX, e.clientY);
      });
      slot.addEventListener('mouseleave', () => {
        this.hideTooltip();
      });

      abilityBar.appendChild(slot);
      this.abilitySlots.push(slot);
      this.abilityIcons.push(icon);
      this.abilityCosts.push(cost);
      this.abilityCooldowns.push(cd);
    }
    this.overlay.appendChild(abilityBar);

    // --- Cast bar ---
    this.castBar = document.createElement('div');
    this.castBar.className = 'hud-castbar';
    this.castBarFill = document.createElement('div');
    this.castBarFill.className = 'hud-castbar-fill';
    this.castBarFill.style.width = '0%';
    this.castBarText = document.createElement('div');
    this.castBarText.className = 'hud-castbar-text';
    this.castBar.appendChild(this.castBarFill);
    this.castBar.appendChild(this.castBarText);
    this.overlay.appendChild(this.castBar);

    // --- Minimap ---
    const minimapWrap = document.createElement('div');
    minimapWrap.className = 'hud-minimap';
    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.width = 180;
    this.minimapCanvas.height = 180;
    const ctx = this.minimapCanvas.getContext('2d');
    if (!ctx) throw new Error('HUD: 2D context unavailable for minimap');
    this.minimapCtx = ctx;
    minimapWrap.appendChild(this.minimapCanvas);
    this.minimapLabel = document.createElement('div');
    this.minimapLabel.className = 'hud-minimap-label';
    minimapWrap.appendChild(this.minimapLabel);
    this.overlay.appendChild(minimapWrap);

    // --- Zone label ---
    this.zoneLabel = document.createElement('div');
    this.zoneLabel.className = 'hud-zone-label';
    this.overlay.appendChild(this.zoneLabel);

    // --- Damage flash ---
    this.damageFlash = document.createElement('div');
    this.damageFlash.className = 'hud-damage-flash';
    this.overlay.appendChild(this.damageFlash);

    // --- Event log ---
    this.eventLog = document.createElement('div');
    this.eventLog.className = 'hud-event-log';
    this.overlay.appendChild(this.eventLog);

    this.root.appendChild(this.overlay);
  }

  private makeBar(kind: 'health' | 'energy' | 'xp'): {
    el: HTMLElement;
    fill: HTMLElement;
    text: HTMLElement;
  } {
    const el = document.createElement('div');
    el.className = `hud-bar ${kind}`;
    const fill = document.createElement('div');
    fill.className = 'hud-bar-fill';
    fill.style.width = '100%';
    const text = document.createElement('div');
    text.className = 'hud-bar-text';
    el.appendChild(fill);
    el.appendChild(text);
    return { el, fill, text };
  }

  // ----------------------------------------------------------
  // Per-frame update — called from main loop
  // ----------------------------------------------------------

  update(): void {
    const player = this.world.getPlayer();
    if (!player) return;

    this.updateVitals(player);
    this.updateAbilities(player);
    this.updateStatusEffects(player);
    this.updateCastBar(player);
    this.updateMinimap();
    this.updateZoneLabel();
    this.processEvents();
    this.updateDamageFlash();
  }

  private updateVitals(player: Entity): void {
    const s = player.stats;

    const hpPct = s.maxHealth > 0 ? (s.health / s.maxHealth) * 100 : 0;
    this.healthFill.style.width = `${Math.max(0, Math.min(100, hpPct))}%`;
    this.healthText.textContent = `${Math.ceil(s.health)} / ${s.maxHealth}`;

    const enPct = s.maxEnergy > 0 ? (s.energy / s.maxEnergy) * 100 : 0;
    this.energyFill.style.width = `${Math.max(0, Math.min(100, enPct))}%`;
    this.energyText.textContent = `${Math.ceil(s.energy)} / ${s.maxEnergy}`;

    this.levelLabel.textContent = `LV ${s.level}`;

    const xpPct = s.xpToNext > 0 ? (s.xp / s.xpToNext) * 100 : 0;
    this.xpFill.style.width = `${Math.max(0, Math.min(100, xpPct))}%`;
    this.xpText.textContent = `XP ${s.xp}/${s.xpToNext}`;
  }

  private updateAbilities(player: Entity): void {
    const abilityIds = player.abilities ?? [];
    const tick = this.world.tick;
    const dt = this.world.dt;

    for (let i = 0; i < 4; i++) {
      const slot = this.abilitySlots[i]!;
      const icon = this.abilityIcons[i]!;
      const cd = this.abilityCooldowns[i]!;
      const cost = this.abilityCosts[i]!;

      const abilityId = abilityIds[i];
      if (!abilityId) {
        slot.classList.add('disabled');
        icon.textContent = '—';
        cost.textContent = '';
        cd.style.height = '0%';
        cd.textContent = '';
        continue;
      }

      const ability = this.lookupAbility(abilityId);
      const glyph = ability ? ABILITY_GLYPHS[ability.iconKey] ?? '◆' : '◆';
      icon.textContent = glyph;
      cost.textContent = ability ? `${ability.cost}` : '';

      // Cooldown: estimate remaining from lastAttacked tick and ability.cooldown
      if (ability) {
        const cdTotalTicks = ability.cooldown / dt;
        const ticksSince = tick - player.lastAttacked;
        const remaining = cdTotalTicks - ticksSince;
        if (remaining > 0) {
          const pct = (remaining / cdTotalTicks) * 100;
          cd.style.height = `${Math.max(0, Math.min(100, pct))}%`;
          cd.textContent = String(Math.ceil(remaining * dt));
          slot.classList.add('disabled');
        } else {
          cd.style.height = '0%';
          cd.textContent = '';
          // Disable if not enough energy
          if (player.stats.energy < ability.cost) {
            slot.classList.add('disabled');
          } else {
            slot.classList.remove('disabled');
          }
        }
      } else {
        cd.style.height = '0%';
        cd.textContent = '';
      }
    }
  }

  /** Resolve an ability id to its definition. IWorld doesn't expose a lookup,
   *  so we keep a lightweight registry built from the player entity hints.
   *  In practice the Sim should attach known abilities; we degrade gracefully. */
  private abilityCache = new Map<string, Ability>();

  private lookupAbility(id: string): Ability | null {
    return this.abilityCache.get(id) ?? null;
  }

  /** Allow external code (main.ts / tooltip system) to register ability defs. */
  registerAbilities(abilities: Ability[]): void {
    for (const a of abilities) this.abilityCache.set(a.id, a);
  }

  /** Set the tooltip system for ability hover tooltips. */
  setTooltipSystem(tooltips: TooltipSystem): void {
    this.tooltipSystem = tooltips;
  }

  /** Show tooltip for ability at slot index. */
  private showAbilityTooltip(slot: number, x: number, y: number): void {
    if (!this.tooltipSystem) return;
    const player = this.world.getPlayer();
    const abilityIds = player.abilities ?? [];
    const abilityId = abilityIds[slot];
    if (!abilityId) return;
    const ability = this.lookupAbility(abilityId);
    if (ability) {
      this.tooltipSystem.showAbility(ability, x, y);
    }
  }

  private hideTooltip(): void {
    this.tooltipSystem?.hide();
  }

  private updateStatusEffects(player: Entity): void {
    const effects = player.effects ?? [];
    // Rebuild only if count changed to avoid thrashing DOM
    if (this.statusContainer.childElementCount !== effects.length) {
      this.statusContainer.innerHTML = '';
      for (const eff of effects) {
        const icon = document.createElement('div');
        const isDebuff = (eff.tickDamage ?? 0) > 0;
        icon.className = 'hud-status-icon' + (isDebuff ? ' debuff' : '');
        const glyph = STATUS_GLYPHS[eff.iconKey] ?? eff.iconKey.charAt(0).toUpperCase();
        icon.textContent = glyph;

        const timer = document.createElement('div');
        timer.className = 'hud-status-timer';
        icon.appendChild(timer);

        icon.title = `${eff.name}: ${eff.description}`;
        this.statusContainer.appendChild(icon);
      }
    }
    // Update timer text
    const children = this.statusContainer.children;
    for (let i = 0; i < children.length && i < effects.length; i++) {
      const el = children[i] as HTMLElement;
      const timer = el.querySelector('.hud-status-timer') as HTMLElement | null;
      if (timer) {
        timer.textContent = effects[i]!.duration > 0
          ? String(Math.ceil(effects[i]!.duration))
          : '';
      }
    }
  }

  private updateCastBar(player: Entity): void {
    const cast = player.castBar;
    if (cast && cast.progress < 1) {
      this.castBar.classList.add('active');
      this.castBarFill.style.width = `${Math.max(0, Math.min(100, cast.progress * 100))}%`;
      this.castBarText.textContent = cast.abilityName;
    } else {
      this.castBar.classList.remove('active');
    }
  }

  // ----------------------------------------------------------
  // Minimap rendering
  // ----------------------------------------------------------

  private updateMinimap(): void {
    const ctx = this.minimapCtx;
    const zone = this.world.getZone();
    const W = this.minimapCanvas.width;
    const H = this.minimapCanvas.height;

    // Clear
    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, W, H);

    const bounds = zone.bounds;
    const worldW = bounds.width || 1;
    const worldD = bounds.depth || 1;
    // Scale to fit minimap with padding
    const pad = 8;
    const scaleX = (W - pad * 2) / worldW;
    const scaleZ = (H - pad * 2) / worldD;
    const scale = Math.min(scaleX, scaleZ);
    const offsetX = (W - worldW * scale) / 2;
    const offsetZ = (H - worldD * scale) / 2;

    const toMap = (x: number, z: number): [number, number] => [
      offsetX + x * scale,
      offsetZ + z * scale,
    ];

    // Draw rooms
    ctx.strokeStyle = '#1a2840';
    ctx.lineWidth = 1;
    for (const room of zone.rooms) {
      const [rx, rz] = toMap(room.pos.x, room.pos.z);
      const rw = Math.max(2, room.width * scale);
      const rh = Math.max(2, room.depth * scale);
      ctx.fillStyle = room.cleared ? 'rgba(0,40,40,0.4)' : 'rgba(20,30,60,0.5)';
      ctx.fillRect(rx - rw / 2, rz - rh / 2, rw, rh);
      ctx.strokeRect(rx - rw / 2, rz - rh / 2, rw, rh);
    }

    // Draw entities
    const entities = this.world.getEntities();
    for (const ent of entities) {
      if (!ent.isAlive) continue;
      const [ex, ez] = toMap(ent.pos.x, ent.pos.z);
      if (ent.kind === EntityKind.Player) {
        // Player: cyan diamond
        ctx.fillStyle = '#00ffe0';
        ctx.shadowColor = '#00ffe0';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(ex, ez - 3);
        ctx.lineTo(ex + 3, ez);
        ctx.lineTo(ex, ez + 3);
        ctx.lineTo(ex - 3, ez);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (ent.kind === EntityKind.Enemy) {
        // Enemy: red dot
        ctx.fillStyle = '#ff3344';
        ctx.shadowColor = '#ff3344';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(ex, ez, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (ent.kind === EntityKind.Item) {
        // Item: amber dot
        ctx.fillStyle = '#ffaa00';
        ctx.fillRect(ex - 1, ez - 1, 2, 2);
      } else if (ent.kind === EntityKind.Npc) {
        ctx.fillStyle = '#44ff66';
        ctx.fillRect(ex - 1.5, ez - 1.5, 3, 3);
      }
    }

    this.minimapLabel.textContent = zone.name.toUpperCase();
  }

  // ----------------------------------------------------------
  // Zone label
  // ----------------------------------------------------------

  private updateZoneLabel(): void {
    if (this.zoneLabelTimer > 0) {
      this.zoneLabelTimer -= this.world.dt;
      if (this.zoneLabelTimer <= 0) {
        this.zoneLabel.classList.remove('visible');
      }
    }
  }

  showZoneLabel(name: string): void {
    this.zoneLabel.textContent = name;
    this.zoneLabel.classList.add('visible');
    this.zoneLabelTimer = 3.0;
  }

  // ----------------------------------------------------------
  // Event processing + log + damage flash
  // ----------------------------------------------------------

  private processEvents(): void {
    const events = this.world.drainEvents();
    for (const ev of events) {
      this.handleEvent(ev);
    }
  }

  private handleEvent(ev: SimEvent): void {
    switch (ev.type) {
      case SimEventType.Damage:
        if (ev.entityId === this.world.getPlayer().id) {
          this.triggerDamageFlash();
        }
        this.addLogLine(this.formatDamage(ev), 'damage');
        break;
      case SimEventType.Heal:
        this.addLogLine(this.formatHeal(ev), 'heal');
        break;
      case SimEventType.Loot:
      case SimEventType.Pickup:
        this.addLogLine(this.formatLoot(ev), 'loot');
        break;
      case SimEventType.LevelUp:
        this.addLogLine('LEVEL UP!', 'level');
        break;
      case SimEventType.XpGain:
        this.addLogLine(this.formatXp(ev), 'level');
        break;
      case SimEventType.Death:
        this.addLogLine(this.formatDeath(ev), 'system');
        break;
      case SimEventType.ZoneChange: {
        const name = (ev.data?.['zoneName'] as string) ?? 'Unknown Zone';
        this.showZoneLabel(name);
        this.addLogLine(`Entered ${name}`, 'system');
        break;
      }
      case SimEventType.SaveComplete:
        this.addLogLine('Game saved', 'system');
        break;
      case SimEventType.LoadComplete:
        this.addLogLine('Game loaded', 'system');
        break;
      default:
        break;
    }
  }

  private formatDamage(ev: SimEvent): string {
    const amount = ev.data?.['amount'] ?? '?';
    const target = this.entityName(ev.entityId);
    return `${target} took ${amount} dmg`;
  }

  private formatHeal(ev: SimEvent): string {
    const amount = ev.data?.['amount'] ?? '?';
    return `+${amount} HP`;
  }

  private formatLoot(ev: SimEvent): string {
    const name = (ev.data?.['itemName'] as string) ?? 'item';
    return `Looted: ${name}`;
  }

  private formatXp(ev: SimEvent): string {
    const amount = ev.data?.['amount'] ?? '?';
    return `+${amount} XP`;
  }

  private formatDeath(ev: SimEvent): string {
    const name = this.entityName(ev.entityId);
    return `${name} died`;
  }

  private entityName(id?: number): string {
    if (id === undefined) return '???';
    const ent = this.world.getEntity(id);
    return ent ? ent.name : '???';
  }

  private addLogLine(text: string, cls: string): void {
    const line = document.createElement('div');
    line.className = `hud-event-line ${cls}`;
    line.textContent = text;
    this.eventLog.insertBefore(line, this.eventLog.firstChild);
    this.logLines.unshift(line);
    while (this.logLines.length > MAX_LOG_LINES) {
      const old = this.logLines.pop()!;
      old.remove();
    }
  }

  // ----------------------------------------------------------
  // Damage flash
  // ----------------------------------------------------------

  private triggerDamageFlash(): void {
    this.damageFlash.classList.add('active');
    this.damageFlashTimer = 0.4;
  }

  private updateDamageFlash(): void {
    if (this.damageFlashTimer > 0) {
      this.damageFlashTimer -= this.world.dt;
      if (this.damageFlashTimer <= 0) {
        this.damageFlash.classList.remove('active');
      }
    }
  }

  // ----------------------------------------------------------
  // Teardown
  // ----------------------------------------------------------

  destroy(): void {
    this.overlay.remove();
  }
}