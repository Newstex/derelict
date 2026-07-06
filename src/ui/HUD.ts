/**
 * HUD — DOM-based heads-up display.
 *
 * Shows health bar, oxygen bar, and optional level/XP info.
 * Minimal, diegetic-style overlay. Pure DOM (no Three.js), so it can be
 * tested with jsdom-style environments if needed.
 */

export interface HUDStats {
  health: number;
  maxHealth: number;
  oxygen: number;
  maxOxygen: number;
  level?: number;
  xp?: number;
  xpToNext?: number;
}

export class HUD {
  private root: HTMLElement;

  private healthFill: HTMLElement;
  private healthText: HTMLElement;
  private oxygenFill: HTMLElement;
  private oxygenText: HTMLElement;
  private levelLabel: HTMLElement;
  private xpFill: HTMLElement;
  private xpText: HTMLElement;

  /** Last seen values — avoids redundant DOM writes when unchanged. */
  private lastHealth = -1;
  private lastOxygen = -1;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.classList.add('hud-overlay');

    // --- Vitals panel ---
    const vitals = document.createElement('div');
    vitals.className = 'hud-vitals';

    const hb = this.makeBar('health', '❤ HEALTH');
    this.healthFill = hb.fill;
    this.healthText = hb.text;
    vitals.appendChild(hb.el);

    const ob = this.makeBar('oxygen', '⊕ OXYGEN');
    this.oxygenFill = ob.fill;
    this.oxygenText = ob.text;
    vitals.appendChild(ob.el);

    this.levelLabel = document.createElement('div');
    this.levelLabel.className = 'hud-level';
    this.levelLabel.textContent = 'LV 1';
    vitals.appendChild(this.levelLabel);

    const xb = this.makeBar('xp', 'XP');
    this.xpFill = xb.fill;
    this.xpText = xb.text;
    vitals.appendChild(xb.el);

    this.root.appendChild(vitals);
  }

  private makeBar(kind: 'health' | 'oxygen' | 'xp', label: string): {
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
    text.textContent = label;

    el.appendChild(fill);
    el.appendChild(text);
    return { el, fill, text };
  }

  /**
   * Update the HUD from a stats snapshot.
   * Only writes to the DOM when values actually change.
   */
  update(stats: HUDStats): void {
    const hpPct = stats.maxHealth > 0
      ? Math.max(0, Math.min(100, (stats.health / stats.maxHealth) * 100))
      : 0;
    const enPct = stats.maxOxygen > 0
      ? Math.max(0, Math.min(100, (stats.oxygen / stats.maxOxygen) * 100))
      : 0;

    if (stats.health !== this.lastHealth) {
      this.healthFill.style.width = `${hpPct}%`;
      this.healthText.textContent = `❤ ${Math.ceil(stats.health)} / ${stats.maxHealth}`;
      this.lastHealth = stats.health;
    }

    if (stats.oxygen !== this.lastOxygen) {
      this.oxygenFill.style.width = `${enPct}%`;
      this.oxygenText.textContent = `⊕ ${Math.ceil(stats.oxygen)} / ${stats.maxOxygen}`;
      this.lastOxygen = stats.oxygen;
    }

    if (stats.level !== undefined) {
      this.levelLabel.textContent = `LV ${stats.level}`;
    }

    if (stats.xp !== undefined && stats.xpToNext !== undefined) {
      const xpPct = stats.xpToNext > 0
        ? Math.max(0, Math.min(100, (stats.xp / stats.xpToNext) * 100))
        : 0;
      this.xpFill.style.width = `${xpPct}%`;
      this.xpText.textContent = `XP ${stats.xp} / ${stats.xpToNext}`;
    }
  }

  /** Flash a damage indicator overlay. */
  flashDamage(): void {
    // Lightweight: toggle a class briefly
    this.root.classList.add('hud-damaged');
    window.setTimeout(() => this.root.classList.remove('hud-damaged'), 150);
  }

  /** Show a zone label briefly (e.g. on zone entry). */
  showZoneLabel(name: string): void {
    const label = document.createElement('div');
    label.className = 'hud-zone-label visible';
    label.textContent = name.toUpperCase();
    this.root.appendChild(label);
    window.setTimeout(() => label.classList.remove('visible'), 2500);
    window.setTimeout(() => label.remove(), 3100);
  }
}