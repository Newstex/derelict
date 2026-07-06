/**
 * TooltipSystem — hover tooltips for abilities, items, and entities.
 *
 * DOM-based, positioned near cursor. Sci-fi styled via styles.css.
 */

import {
  type Ability,
  type Item,
  type Rarity,
  Rarity as RarityEnum,
} from '../world_api.js';

const RARITY_LABELS: Record<Rarity, string> = {
  [RarityEnum.Common]: 'Common',
  [RarityEnum.Uncommon]: 'Uncommon',
  [RarityEnum.Rare]: 'Rare',
  [RarityEnum.Epic]: 'Epic',
};

export class TooltipSystem {
  private readonly root: HTMLElement;
  private el: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.el = document.createElement('div');
    this.el.className = 'tooltip';
    this.root.appendChild(this.el);
  }

  /** Show an ability tooltip near (x, y) screen coordinates. */
  showAbility(ability: Ability, x: number, y: number): void {
    this.el.innerHTML = '';

    const name = document.createElement('div');
    name.className = 'tooltip-name';
    name.textContent = ability.name;
    this.el.appendChild(name);

    this.addRow('Cost', `${ability.cost} Energy`, 'cost');
    this.addRow('Cooldown', `${ability.cooldown}s`, 'cooldown');
    if (ability.castTime > 0) {
      this.addRow('Cast Time', `${ability.castTime}s`, '');
    }
    this.addRow('Range', ability.range === 0 ? 'Melee' : `${ability.range}m`, '');
    this.addRow(
      'Damage',
      `${ability.damage[0]}–${ability.damage[1]}`,
      'damage',
    );
    this.addRow('School', ability.school, '');

    if (ability.effectId) {
      const dur = ability.effectDuration ?? 0;
      this.addRow('Effect', `${ability.effectId} (${dur}s)`, '');
    }

    const desc = document.createElement('div');
    desc.className = 'tooltip-desc';
    desc.textContent = ability.description;
    this.el.appendChild(desc);

    this.position(x, y);
    this.el.classList.add('visible');
  }

  /** Show an item tooltip near (x, y) screen coordinates. */
  showItem(item: Item, x: number, y: number): void {
    this.el.innerHTML = '';

    const name = document.createElement('div');
    name.className = 'tooltip-name';
    name.textContent = item.name;
    this.el.appendChild(name);

    const rarityCls = `rarity-${item.rarity}`;
    this.addRow('Rarity', RARITY_LABELS[item.rarity] ?? item.rarity, rarityCls);
    this.addRow('Type', item.itemType, '');

    if (item.stats) {
      const statParts: string[] = [];
      if (item.stats.attack) statParts.push(`+${item.stats.attack} ATK`);
      if (item.stats.defense) statParts.push(`+${item.stats.defense} DEF`);
      if (item.stats.speed) statParts.push(`+${item.stats.speed} SPD`);
      if (item.stats.critChance) statParts.push(`+${item.stats.critChance}% CRIT`);
      if (item.stats.maxHealth) statParts.push(`+${item.stats.maxHealth} Max HP`);
      if (item.stats.maxEnergy) statParts.push(`+${item.stats.maxEnergy} Max EN`);
      if (statParts.length > 0) {
        const statsEl = document.createElement('div');
        statsEl.className = 'tooltip-stats';
        statsEl.textContent = statParts.join('  ');
        this.el.appendChild(statsEl);
      }
    }

    if (item.healAmount) {
      this.addRow('Heal', `+${item.healAmount} HP`, '');
    }
    if (item.energyAmount) {
      this.addRow('Energy', `+${item.energyAmount} EN`, '');
    }
    if (item.damage) {
      this.addRow('Damage', `${item.damage[0]}–${item.damage[1]}`, 'damage');
    }
    if (item.school) {
      this.addRow('School', item.school, '');
    }
    if (item.stackable && item.stackCount > 1) {
      this.addRow('Stack', String(item.stackCount), '');
    }

    const desc = document.createElement('div');
    desc.className = 'tooltip-desc';
    desc.textContent = item.description;
    this.el.appendChild(desc);

    this.position(x, y);
    this.el.classList.add('visible');
  }

  hide(): void {
    this.el.classList.remove('visible');
  }

  // ----------------------------------------------------------
  // Internal helpers
  // ----------------------------------------------------------

  private addRow(label: string, value: string, valueClass: string): void {
    const row = document.createElement('div');
    row.className = 'tooltip-row';
    const lbl = document.createElement('span');
    lbl.className = 'tooltip-label';
    lbl.textContent = label;
    const val = document.createElement('span');
    val.className = 'tooltip-value' + (valueClass ? ` ${valueClass}` : '');
    val.textContent = value;
    row.appendChild(lbl);
    row.appendChild(val);
    this.el.appendChild(row);
  }

  /** Position the tooltip near (x,y), flipping if near screen edge. */
  private position(x: number, y: number): void {
    const margin = 12;
    const w = this.el.offsetWidth || 260;
    const h = this.el.offsetHeight || 100;
    let px = x + margin;
    let py = y + margin;
    if (px + w > window.innerWidth) px = x - w - margin;
    if (py + h > window.innerHeight) py = y - h - margin;
    if (px < 0) px = 0;
    if (py < 0) py = 0;
    this.el.style.left = `${px}px`;
    this.el.style.top = `${py}px`;
  }

  destroy(): void {
    this.el.remove();
  }
}