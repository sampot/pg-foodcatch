/**
 * 接食材 — 音效。全部是 `assets/audio/` 裡的真實取樣（Kenney，CC0），沒有合成音。
 * 每個音各留一小池 <audio>，連續接中時可以疊著響而不互相切斷。
 */

const BANK = {
  // 接中的悶響：三顆輪流用，聽起來才不會像同一顆貼上去的。
  catch0: { src: "assets/audio/impactGeneric_light_000.ogg", volume: 0.5, size: 4 },
  catch1: { src: "assets/audio/impactGeneric_light_001.ogg", volume: 0.5, size: 4 },
  catch2: { src: "assets/audio/impactGeneric_light_002.ogg", volume: 0.5, size: 4 },
  bonus: { src: "assets/audio/confirmation_001.ogg", volume: 0.6, size: 2 },
  hit: { src: "assets/audio/impactGlass_light_000.ogg", volume: 0.75, size: 3 },
  miss: { src: "assets/audio/impactGeneric_light_002.ogg", volume: 0.35, size: 3 },
  levelup: { src: "assets/audio/jingles_STEEL00.ogg", volume: 0.5, size: 1 },
  win: { src: "assets/audio/jingles_NES00.ogg", volume: 0.55, size: 1 },
  lose: { src: "assets/audio/jingles_STEEL13.ogg", volume: 0.5, size: 1 },
  ui: { src: "assets/audio/click_002.ogg", volume: 0.4, size: 2 },
};

const CATCH_KEYS = ["catch0", "catch1", "catch2"];

class Pool {
  constructor({ src, volume, size }) {
    this.volume = volume;
    this.cursor = 0;
    this.nodes = Array.from({ length: size }, () => {
      const node = new Audio(src);
      node.preload = "auto";
      node.volume = volume;
      return node;
    });
  }

  play(rate = 1, gain = 1) {
    const node = this.nodes[this.cursor];
    this.cursor = (this.cursor + 1) % this.nodes.length;
    try {
      node.pause();
      node.currentTime = 0;
      node.playbackRate = rate;
      node.volume = Math.max(0, Math.min(1, this.volume * gain));
      const played = node.play();
      if (played && typeof played.catch === "function") played.catch(() => {});
    } catch {
      // 還沒被使用者手勢解鎖，或瀏覽器不給播：靜靜跳過。
    }
  }
}

export class FoodcatchAudio {
  constructor() {
    this.enabled = true;
    this.pools = null;
    this.catchTurn = 0;
  }

  /** 第一個使用者手勢時呼叫：建池並戳一下，讓行動裝置解鎖播放。 */
  unlock() {
    if (this.pools) return;
    this.pools = {};
    for (const [name, spec] of Object.entries(BANK)) this.pools[name] = new Pool(spec);
    const primer = this.pools.ui.nodes[0];
    try {
      primer.volume = 0;
      const played = primer.play();
      if (played && typeof played.catch === "function") played.catch(() => {});
      primer.pause();
      primer.currentTime = 0;
      primer.volume = BANK.ui.volume;
    } catch {
      // 忽略：真正播放時還會再試一次。
    }
  }

  setEnabled(on) {
    this.enabled = !!on;
  }

  play(name, rate = 1, gain = 1) {
    if (!this.enabled) return;
    this.unlock();
    this.pools?.[name]?.play(rate, gain);
  }

  /** 連擊越長音高越高，最多加五度左右，撐住「越接越爽」的節奏感。 */
  catchSfx(combo = 1) {
    const key = CATCH_KEYS[this.catchTurn % CATCH_KEYS.length];
    this.catchTurn += 1;
    this.play(key, 1 + Math.min(0.5, (combo - 1) * 0.045));
  }

  bonusSfx() {
    this.play("bonus", 1.05);
  }

  hitSfx() {
    this.play("hit", 0.85);
  }

  missSfx() {
    this.play("miss", 0.8);
  }

  levelupSfx() {
    this.play("levelup");
  }

  winSfx() {
    this.play("win");
  }

  loseSfx() {
    this.play("lose", 0.9);
  }

  uiSfx() {
    this.play("ui");
  }
}
