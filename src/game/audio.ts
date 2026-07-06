/**
 * AudioSystem — procedural sound effects via Web Audio API.
 *
 * All sounds are synthesized at runtime — no audio files.
 * Combat: laser zap, hit impact, explosion.
 * UI: menu blip, ability activation, level up.
 * Ambient: low rumble drone, metal creaks, distant alarms.
 */

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Ambient nodes (kept for stop)
  private ambientGain: GainNode | null = null;
  private ambientNodes: AudioNode[] = [];
  private creakTimer: number | null = null;
  private alarmTimer: number | null = null;
  private ambientRunning = false;

  constructor() {
    // Defer AudioContext creation until first use (browser autoplay policy).
    // But try to construct lazily; many browsers allow it after user gesture.
    try {
      this.ensureContext();
    } catch {
      // Will retry on first play call.
    }
  }

  private ensureContext(): void {
    if (this.ctx) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5;
    this.masterGain.connect(this.ctx.destination);
  }

  /** Resume the context (call on user gesture). */
  resume(): void {
    this.ensureContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  /** Set master volume 0..1. */
  setVolume(v: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, v));
    }
  }

  // ============================================================
  // Combat Sounds
  // ============================================================

  /** Laser zap — quick oscillator sweep through a bandpass filter. */
  playZap(): void {
    const ctx = this.ensureAndResume();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.18);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(400, now + 0.18);
    filter.Q.value = 6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.4, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  /** Hit impact — short noise burst with lowpass. */
  playHit(): void {
    const ctx = this.ensureAndResume();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    const noise = this.createNoiseBuffer(ctx, 0.12);
    const src = ctx.createBufferSource();
    src.buffer = noise;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2500, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.1);
    filter.Q.value = 1.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.14);
  }

  /** Explosion — low-frequency sweep + noise burst. */
  playExplosion(): void {
    const ctx = this.ensureAndResume();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    // Low freq sweep
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.5);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.35, now);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    osc.connect(filter);
    filter.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.65);

    // Noise burst
    const noise = this.createNoiseBuffer(ctx, 0.4);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(1500, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(80, now + 0.4);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.45, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    src.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.45);
  }

  // ============================================================
  // UI Sounds
  // ============================================================

  /** Menu blip — short high tone. */
  playUiBlip(): void {
    const ctx = this.ensureAndResume();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.04);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /** Ability activation — descending chirp with filter sweep. */
  playAbilityActivate(): void {
    const ctx = this.ensureAndResume();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.15);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, now);
    filter.frequency.exponentialRampToValueAtTime(600, now + 0.15);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  /** Level up chime — ascending arpeggio. */
  playLevelUp(): void {
    const ctx = this.ensureAndResume();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6

    notes.forEach((freq, i) => {
      const t = now + i * 0.08;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(gain);
      if (this.masterGain) gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.32);
    });
  }

  // ============================================================
  // Ambient
  // ============================================================

  /** Start ambient drone layer: low rumble + intermittent creaks/alarms. */
  startAmbient(): void {
    const ctx = this.ensureAndResume();
    if (!ctx || !this.masterGain) return;
    if (this.ambientRunning) return;
    this.ambientRunning = true;

    const now = ctx.currentTime;

    // Low rumble drone — two detuned oscillators through lowpass
    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = 0.08;
    this.ambientGain.connect(this.masterGain);

    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 120;
    rumbleFilter.Q.value = 0.7;
    rumbleFilter.connect(this.ambientGain);
    this.ambientNodes.push(rumbleFilter);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 42;
    osc1.connect(rumbleFilter);
    osc1.start(now);
    this.ambientNodes.push(osc1);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 55;
    osc2.detune.value = 8;
    osc2.connect(rumbleFilter);
    osc2.start(now);
    this.ambientNodes.push(osc2);

    // Slow LFO on rumble gain for subtle pulsing
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.1;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain);
    lfoGain.connect(this.ambientGain.gain);
    lfo.start(now);
    this.ambientNodes.push(lfo, lfoGain);

    // Schedule intermittent creaks and alarms
    this.scheduleCreak();
    this.scheduleAlarm();
  }

  /** Stop ambient drone and clear scheduled sounds. */
  stopAmbient(): void {
    if (!this.ambientRunning) return;
    this.ambientRunning = false;
    if (this.creakTimer !== null) {
      clearTimeout(this.creakTimer);
      this.creakTimer = null;
    }
    if (this.alarmTimer !== null) {
      clearTimeout(this.alarmTimer);
      this.alarmTimer = null;
    }
    for (const node of this.ambientNodes) {
      try {
        if (node instanceof AudioScheduledSourceNode) {
          node.stop();
        }
        node.disconnect();
      } catch {
        // Already stopped/disconnected
      }
    }
    this.ambientNodes = [];
    if (this.ambientGain) {
      this.ambientGain.disconnect();
      this.ambientGain = null;
    }
  }

  /** Schedule a random metal creak after a delay. */
  private scheduleCreak(): void {
    if (!this.ambientRunning || !this.ctx) return;
    const delay = 4000 + Math.random() * 8000;
    this.creakTimer = window.setTimeout(() => {
      this.playCreak();
      this.scheduleCreak();
    }, delay);
  }

  /** Schedule a distant alarm after a delay. */
  private scheduleAlarm(): void {
    if (!this.ambientRunning || !this.ctx) return;
    const delay = 8000 + Math.random() * 12000;
    this.alarmTimer = window.setTimeout(() => {
      this.playDistantAlarm();
      this.scheduleAlarm();
    }, delay);
  }

  /** Metal creak — short filtered noise with pitch wobble. */
  private playCreak(): void {
    const ctx = this.ctx;
    if (!ctx || !this.ambientGain || !this.ambientRunning) return;
    const now = ctx.currentTime;
    const dur = 0.3 + Math.random() * 0.3;

    const noise = this.createNoiseBuffer(ctx, dur);
    const src = ctx.createBufferSource();
    src.buffer = noise;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(300 + Math.random() * 400, now);
    filter.frequency.linearRampToValueAtTime(
      200 + Math.random() * 300,
      now + dur,
    );
    filter.Q.value = 8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientGain);
    src.start(now);
    src.stop(now + dur);
  }

  /** Distant alarm — two-tone beep, quiet and muffled. */
  private playDistantAlarm(): void {
    const ctx = this.ctx;
    if (!ctx || !this.ambientGain || !this.ambientRunning) return;
    const now = ctx.currentTime;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.connect(this.ambientGain);

    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.5;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = i % 2 === 0 ? 180 : 240;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.04, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.connect(gain);
      gain.connect(filter);
      osc.start(t);
      osc.stop(t + 0.22);
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

  private ensureAndResume(): AudioContext | null {
    this.ensureContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext, dur: number): AudioBuffer {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  destroy(): void {
    this.stopAmbient();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}