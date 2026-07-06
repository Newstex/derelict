/**
 * MenuSystem — DOM-based menu screens for DERELICT.
 *
 * Main menu, character creation, pause, game over, victory.
 * Reads IWorld for save checks and stats; sends commands via world.command().
 */

import {
  type IWorld,
  type Entity,
  CharacterClass,
  type Stats,
} from '../world_api.js';

interface ClassDef {
  id: CharacterClass;
  name: string;
  role: string;
  desc: string;
  stats: { label: string; val: string }[];
  abilities: { name: string; desc: string }[];
}

const CLASS_DEFS: ClassDef[] = [
  {
    id: CharacterClass.Engineer,
    name: 'Engineer',
    role: 'Support / DPS',
    desc: 'Deploy turrets, repair gear, and overload systems. Master of machines.',
    stats: [
      { label: 'Health', val: '100' },
      { label: 'Energy', val: '120' },
      { label: 'Attack', val: '12' },
      { label: 'Defense', val: '10' },
    ],
    abilities: [
      { name: 'Deploy Turret', desc: 'Summons a stationary turret that fires at nearby enemies.' },
      { name: 'Repair', desc: 'Restores armor integrity over time.' },
      { name: 'Overcharge', desc: 'Boosts energy regen and ability speed temporarily.' },
    ],
  },
  {
    id: CharacterClass.Marine,
    name: 'Marine',
    role: 'Tank / DPS',
    desc: 'Front-line combat specialist. High durability and suppressive firepower.',
    stats: [
      { label: 'Health', val: '140' },
      { label: 'Energy', val: '90' },
      { label: 'Attack', val: '16' },
      { label: 'Defense', val: '14' },
    ],
    abilities: [
      { name: 'Power Shot', desc: 'High-damage single-target kinetic blast.' },
      { name: 'Combat Stim', desc: 'Increases speed and attack for a short duration.' },
      { name: 'Suppression Fire', desc: 'Cone attack that damages and slows multiple foes.' },
    ],
  },
  {
    id: CharacterClass.Scientist,
    name: 'Scientist',
    role: 'Healer / Control',
    desc: 'Nanite healing, cryogenic control, and biological scanning. Keeps you alive.',
    stats: [
      { label: 'Health', val: '90' },
      { label: 'Energy', val: '130' },
      { label: 'Attack', val: '10' },
      { label: 'Defense', val: '8' },
    ],
    abilities: [
      { name: 'Med-Nanites', desc: 'Heals over time and cleanses debuffs.' },
      { name: 'Cryo Blast', desc: 'Freezes targets, dealing cryo damage and slowing them.' },
      { name: 'Bio-Scan', desc: 'Reveals enemies and items in a large radius.' },
    ],
  },
  {
    id: CharacterClass.Scavenger,
    name: 'Scavenger',
    role: 'DPS / Utility',
    desc: 'Fast, stealthy, and resourceful. Hits hard, loots fast, and vanishes.',
    stats: [
      { label: 'Health', val: '100' },
      { label: 'Energy', val: '110' },
      { label: 'Attack', val: '14' },
      { label: 'Defense', val: '9' },
      { label: 'Speed', val: 'High' },
    ],
    abilities: [
      { name: 'Rapid Fire', desc: 'Quick multi-hit kinetic attack.' },
      { name: 'Cloak', desc: 'Become invisible to enemies for a short time.' },
      { name: 'Scrap Grenade', desc: 'AoE explosion with a chance to drop loot.' },
    ],
  },
];

export class MenuSystem {
  private readonly world: IWorld;
  private readonly root: HTMLElement;

  private screens = new Map<string, HTMLElement>();
  private selectedClass: CharacterClass | null = null;
  private selectedClassCard: HTMLElement | null = null;

  /** Callbacks that main.ts can hook into. */
  onStartGame: ((classId: CharacterClass) => void) | null = null;
  onLoadGame: (() => void) | null = null;
  onResume: (() => void) | null = null;
  onSave: (() => void) | null = null;
  onQuitToMenu: (() => void) | null = null;
  onRestart: (() => void) | null = null;

  constructor(world: IWorld, root: HTMLElement) {
    this.world = world;
    this.root = root;
    this.buildAll();
  }

  // ----------------------------------------------------------
  // Screen construction
  // ----------------------------------------------------------

  private buildAll(): void {
    this.screens.set('main', this.buildMainMenu());
    this.screens.set('character', this.buildCharacterCreation());
    this.screens.set('pause', this.buildPauseMenu());
    this.screens.set('gameover', this.buildGameOver());
    this.screens.set('victory', this.buildVictory());
    for (const el of this.screens.values()) {
      el.classList.add('hidden');
      this.root.appendChild(el);
    }
  }

  private makeScreen(id: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'menu-screen';
    el.dataset.screen = id;
    return el;
  }

  private makeButton(label: string, cls = '', onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.className = `menu-button ${cls}`.trim();
    btn.textContent = label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  // --- Main Menu ---
  private buildMainMenu(): HTMLElement {
    const el = this.makeScreen('main');

    const title = document.createElement('div');
    title.className = 'menu-title';
    title.textContent = 'DERELICT';
    el.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.className = 'menu-subtitle';
    subtitle.textContent = 'Survive the Silence';
    el.appendChild(subtitle);

    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.flexDirection = 'column';
    btnContainer.style.alignItems = 'center';

    btnContainer.appendChild(
      this.makeButton('New Game', 'primary', () => {
        this.showCharacterCreation();
      }),
    );

    const continueBtn = this.makeButton('Continue', '', () => {
      this.onLoadGame?.();
    });
    if (!this.world.hasSave()) {
      continueBtn.setAttribute('disabled', 'true');
    }
    btnContainer.appendChild(continueBtn);
    el.appendChild(btnContainer);

    const hint = document.createElement('div');
    hint.className = 'menu-controls-hint';
    hint.innerHTML =
      'WASD — Move &nbsp;|&nbsp; 1-4 — Abilities &nbsp;|&nbsp; E — Interact<br>' +
      'F — Pickup &nbsp;|&nbsp; I — Inventory &nbsp;|&nbsp; Tab — Character &nbsp;|&nbsp; Esc — Pause';
    el.appendChild(hint);

    return el;
  }

  // --- Character Creation ---
  private buildCharacterCreation(): HTMLElement {
    const el = this.makeScreen('character');

    const title = document.createElement('div');
    title.className = 'menu-title';
    title.style.fontSize = '32px';
    title.textContent = 'SELECT CLASS';
    el.appendChild(title);

    const cards = document.createElement('div');
    cards.className = 'menu-class-cards';

    for (const def of CLASS_DEFS) {
      const card = document.createElement('div');
      card.className = 'menu-class-card';
      card.addEventListener('click', () => {
        this.selectClass(def.id, card);
      });
      card.addEventListener('mouseenter', () => {
        this.selectClass(def.id, card);
      });

      const name = document.createElement('div');
      name.className = 'menu-class-name';
      name.textContent = def.name;
      card.appendChild(name);

      const role = document.createElement('div');
      role.className = 'menu-class-role';
      role.textContent = def.role;
      card.appendChild(role);

      const desc = document.createElement('div');
      desc.className = 'menu-class-desc';
      desc.textContent = def.desc;
      card.appendChild(desc);

      const stats = document.createElement('div');
      stats.className = 'menu-class-stats';
      for (const s of def.stats) {
        const row = document.createElement('div');
        row.className = 'menu-class-stat-row';
        const lbl = document.createElement('span');
        lbl.className = 'menu-class-stat-label';
        lbl.textContent = s.label;
        const val = document.createElement('span');
        val.className = 'menu-class-stat-val';
        val.textContent = s.val;
        row.appendChild(lbl);
        row.appendChild(val);
        stats.appendChild(row);
      }
      card.appendChild(stats);

      const abilities = document.createElement('div');
      abilities.className = 'menu-class-abilities';
      for (const a of def.abilities) {
        const ab = document.createElement('div');
        ab.className = 'menu-class-ability';
        const an = document.createElement('span');
        an.className = 'menu-class-ability-name';
        an.textContent = a.name;
        ab.appendChild(an);
        ab.append(` — ${a.desc}`);
        abilities.appendChild(ab);
      }
      card.appendChild(abilities);

      cards.appendChild(card);
    }
    el.appendChild(cards);

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '12px';
    btnRow.appendChild(
      this.makeButton('Back', '', () => {
        this.showMainMenu();
      }),
    );
    const startBtn = this.makeButton('Begin', 'primary', () => {
      if (this.selectedClass) {
        this.onStartGame?.(this.selectedClass);
      }
    });
    startBtn.classList.add('start-btn');
    btnRow.appendChild(startBtn);
    el.appendChild(btnRow);

    const instr = document.createElement('div');
    instr.className = 'menu-instructions';
    instr.textContent = 'Click a class card to select, then Begin.';
    el.appendChild(instr);

    return el;
  }

  private selectClass(id: CharacterClass, card: HTMLElement): void {
    this.selectedClass = id;
    if (this.selectedClassCard) {
      this.selectedClassCard.classList.remove('selected');
    }
    this.selectedClassCard = card;
    card.classList.add('selected');
    const startBtn = this.screens.get('character')?.querySelector('.start-btn') as
      | HTMLButtonElement
      | null;
    if (startBtn) startBtn.removeAttribute('disabled');
  }

  // --- Pause Menu ---
  private buildPauseMenu(): HTMLElement {
    const el = this.makeScreen('pause');

    const title = document.createElement('div');
    title.className = 'menu-title';
    title.style.fontSize = '32px';
    title.textContent = 'PAUSED';
    el.appendChild(title);

    const btns = document.createElement('div');
    btns.style.display = 'flex';
    btns.style.flexDirection = 'column';
    btns.style.alignItems = 'center';

    btns.appendChild(
      this.makeButton('Resume', 'primary', () => {
        this.onResume?.();
      }),
    );
    btns.appendChild(
      this.makeButton('Save', '', () => {
        this.onSave?.();
      }),
    );
    btns.appendChild(
      this.makeButton('Quit to Menu', 'danger', () => {
        this.onQuitToMenu?.();
      }),
    );
    el.appendChild(btns);

    return el;
  }

  // --- Game Over ---
  private buildGameOver(): HTMLElement {
    const el = this.makeScreen('gameover');

    const title = document.createElement('div');
    title.className = 'menu-title menu-death-title';
    title.textContent = 'YOU DIED';
    el.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.className = 'menu-subtitle';
    subtitle.style.color = 'var(--c-health)';
    subtitle.style.textShadow = 'var(--c-glow-red)';
    subtitle.textContent = 'The silence claims another';
    el.appendChild(subtitle);

    const statsEl = document.createElement('div');
    statsEl.className = 'menu-stats-summary';
    statsEl.dataset.role = 'stats';
    el.appendChild(statsEl);

    const btns = document.createElement('div');
    btns.style.display = 'flex';
    btns.style.flexDirection = 'column';
    btns.style.alignItems = 'center';
    btns.appendChild(
      this.makeButton('Restart', 'danger', () => {
        this.onRestart?.();
      }),
    );
    btns.appendChild(
      this.makeButton('Main Menu', '', () => {
        this.onQuitToMenu?.();
      }),
    );
    el.appendChild(btns);

    return el;
  }

  // --- Victory ---
  private buildVictory(): HTMLElement {
    const el = this.makeScreen('victory');

    const title = document.createElement('div');
    title.className = 'menu-title menu-victory-title';
    title.textContent = 'STATION RECLAIMED';
    el.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.className = 'menu-subtitle';
    subtitle.textContent = 'The rogue AI falls silent';
    el.appendChild(subtitle);

    const statsEl = document.createElement('div');
    statsEl.className = 'menu-stats-summary';
    statsEl.dataset.role = 'stats';
    el.appendChild(statsEl);

    const btns = document.createElement('div');
    btns.style.display = 'flex';
    btns.style.flexDirection = 'column';
    btns.style.alignItems = 'center';
    btns.appendChild(
      this.makeButton('Play Again', 'primary', () => {
        this.onRestart?.();
      }),
    );
    btns.appendChild(
      this.makeButton('Main Menu', '', () => {
        this.onQuitToMenu?.();
      }),
    );
    el.appendChild(btns);

    return el;
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------

  showMainMenu(): void {
    this.hideAll();
    this.screens.get('main')?.classList.remove('hidden');
    // Refresh Continue button state
    const continueBtn = this.screens
      .get('main')
      ?.querySelectorAll('.menu-button')[1] as HTMLButtonElement | undefined;
    if (continueBtn) {
      if (this.world.hasSave()) {
        continueBtn.removeAttribute('disabled');
      } else {
        continueBtn.setAttribute('disabled', 'true');
      }
    }
  }

  showCharacterCreation(): void {
    this.hideAll();
    this.selectedClass = null;
    this.selectedClassCard = null;
    // Reset card selections
    this.screens
      .get('character')
      ?.querySelectorAll('.menu-class-card')
      .forEach((c) => c.classList.remove('selected'));
    const startBtn = this.screens.get('character')?.querySelector('.start-btn') as
      | HTMLButtonElement
      | null;
    if (startBtn) startBtn.setAttribute('disabled', 'true');
    this.screens.get('character')?.classList.remove('hidden');
  }

  showPause(): void {
    this.hideAll();
    this.screens.get('pause')?.classList.remove('hidden');
  }

  showGameOver(): void {
    this.hideAll();
    this.populateStats('gameover');
    this.screens.get('gameover')?.classList.remove('hidden');
  }

  showVictory(): void {
    this.hideAll();
    this.populateStats('victory');
    this.screens.get('victory')?.classList.remove('hidden');
  }

  hideAll(): void {
    for (const el of this.screens.values()) {
      el.classList.add('hidden');
    }
  }

  /** Per-frame update — currently a no-op but required by interface. */
  update(): void {
    // Could refresh dynamic elements here if needed.
  }

  // ----------------------------------------------------------
  // Stats summary
  // ----------------------------------------------------------

  private populateStats(screenId: string): void {
    const container = this.screens
      .get(screenId)
      ?.querySelector('[data-role="stats"]') as HTMLElement | null;
    if (!container) return;
    container.innerHTML = '';

    let player: Entity | null = null;
    try {
      player = this.world.getPlayer();
    } catch {
      player = null;
    }

    if (player) {
      const s: Stats = player.stats;
      this.addStatRow(container, 'Level', String(s.level));
      this.addStatRow(container, 'XP', String(s.xp));
      this.addStatRow(container, 'Attack', String(s.attack));
      this.addStatRow(container, 'Defense', String(s.defense));
      const invCount = player.inventory?.length ?? 0;
      this.addStatRow(container, 'Items', String(invCount));
    }
    this.addStatRow(container, 'Tick', String(this.world.tick));
  }

  private addStatRow(parent: HTMLElement, label: string, value: string): void {
    const row = document.createElement('div');
    row.className = 'menu-stat-row';
    const lbl = document.createElement('span');
    lbl.className = 'menu-stat-label';
    lbl.textContent = label;
    const val = document.createElement('span');
    val.className = 'menu-stat-value';
    val.textContent = value;
    row.appendChild(lbl);
    row.appendChild(val);
    parent.appendChild(row);
  }

  // ----------------------------------------------------------
  // Teardown
  // ----------------------------------------------------------

  destroy(): void {
    for (const el of this.screens.values()) {
      el.remove();
    }
    this.screens.clear();
  }
}