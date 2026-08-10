/**
 * 接食材 — 音效。優先播放 assets/audio 的 Kenney 衝擊音，失敗退回合成。
 */
export class FoodcatchAudio {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
  }

  async unlock() {
    this.ensure();
    if (this.ctx?.state === "suspended") await this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
  }

  tone(freq, dur, type = "sine", gain = 0.12, when = 0) {
    if (!this.enabled) return;
    this.ensure();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * 0.6, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.06, dur));
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.04);
  }

  _file(name, fallback) {
    if (!this.enabled) return;
    const a = new Audio(`assets/audio/${name}.ogg`);
    a.volume = 0.7;
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => fallback && fallback());
  }

  catchSfx() {
    this._file("impactGeneric_light_000", () => this.tone(600, 0.06, "triangle", 0.1));
  }

  bomb() {
    this._file("impactGlass_light_000", () => {
      this.tone(200, 0.2, "sawtooth", 0.14);
      this.tone(120, 0.25, "square", 0.12, 0.05);
    });
  }

  drop() {
    this._file("impactGeneric_light_002", () => this.tone(300, 0.08, "triangle", 0.06));
  }

  levelup() {
    for (let i = 0; i < 3; i++) this.tone(520 + i * 120, 0.09, "square", 0.08, i * 0.1);
  }

  gameover() {
    const seq = [330, 262, 196, 147];
    seq.forEach((f, i) => this.tone(f, 0.35, "sawtooth", 0.1, i * 0.22));
  }
}