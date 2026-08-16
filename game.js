/**
 * 接食材 — 遊戲核心（純邏輯，不碰 DOM）。
 *
 * 玩法：菜籃只能左右移動，接住從天而降的食材。
 *   好食材 → 加分，連續接中提高倍率。
 *   壞食材 → 接到就扣一條命（讓它落地才是對的）。
 *   漏接好食材 → 扣一條命。
 *   金色蛋糕 → 高分並補一條命。
 * 每 WAVE_SECONDS 秒升一級：掉得更快、生得更密、壞食材更多。
 *
 * `step()` 是不就地改寫的：吃一個 state 與 dt，回傳新的 state 與這一格發生的事件。
 * 呈現層（app.js）只負責畫出 state、把事件轉成音效與特效。
 */

// ── 場地 ────────────────────────────────────────────────
export const FIELD_W = 360;
export const FIELD_H = 560;

// ── 菜籃 ────────────────────────────────────────────────
export const BASKET_W = 78;
export const BASKET_H = 26;
/** 籃口上緣的 y。低於這條線、且水平重疊，就算接到。 */
export const BASKET_TOP = FIELD_H - 74;
export const BASKET_MAX_SPEED = 330; // px/s
export const BASKET_ACCEL = 1900; // px/s²
export const BASKET_DRAG = 1500; // px/s²，放手後的減速

// ── 掉落物 ──────────────────────────────────────────────
export const ITEM_RADIUS = 17;
export const BASE_FALL_SPEED = 120; // px/s @ level 1
export const BASE_SPAWN_GAP = 1.0; // 秒 @ level 1
export const BONUS_CHANCE = 0.05;

// ── 局勢 ────────────────────────────────────────────────
export const START_LIVES = 3;
export const MAX_LIVES = 5;
export const WAVE_SECONDS = 20;
export const MAX_LEVEL = 9;
export const ROUND_SECONDS = 90;
export const GOAL_SCORE = 1500;
export const COMBO_STEP = 4;
export const MAX_MULTIPLIER = 5;
export const GOOD_POINTS = 10;
export const BONUS_POINTS = 50;

export const GOOD_KEYS = [
  "apple",
  "banana",
  "bread",
  "burger",
  "carrot",
  "cheese",
  "cookie",
  "corn-dog",
  "croissant",
  "cupcake",
  "dim-sum",
  "donut",
  "egg",
  "fries",
  "grapes",
  "hot-dog",
  "ice-cream",
  "loaf",
  "orange",
  "pancakes",
  "pineapple",
  "pizza-box",
  "rice-ball",
  "sandwich",
  "strawberry",
  "sushi-salmon",
  "taco",
  "waffle",
  "watermelon",
];
export const BAD_KEYS = ["bomb_tomato", "fish-bones"];
export const BONUS_KEY = "cake-birthday";

/** mulberry32：小、快、可重播，讓測試與重播都拿得到同一局。 */
export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clampBasketX(x, width = BASKET_W) {
  const half = width / 2;
  return Math.max(half, Math.min(FIELD_W - half, x));
}

/** 連擊倍率：每 COMBO_STEP 次連續接中加一倍，封頂 MAX_MULTIPLIER。 */
export function multiplierFor(combo) {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(Math.max(0, combo) / COMBO_STEP));
}

/** 等級：每 WAVE_SECONDS 秒升一級，封頂 MAX_LEVEL。 */
export function levelFor(elapsed) {
  return Math.min(MAX_LEVEL, 1 + Math.floor(Math.max(0, elapsed) / WAVE_SECONDS));
}

export function fallSpeedFor(level) {
  return BASE_FALL_SPEED * (1 + (level - 1) * 0.16);
}

export function spawnGapFor(level) {
  return Math.max(0.35, BASE_SPAWN_GAP - (level - 1) * 0.075);
}

export function badChanceFor(level) {
  return Math.min(0.35, 0.12 + (level - 1) * 0.025);
}

/**
 * 抽一顆掉落物。rng 的取用順序固定：種類 → 圖 → x → 速度 → 漂移 → 自轉，
 * 這樣測試給定序列就能精準指定要生出什麼。
 */
export function spawnItem({ rng, level, nextId }) {
  const roll = rng();
  const kind = roll < BONUS_CHANCE ? "bonus" : roll < BONUS_CHANCE + badChanceFor(level) ? "bad" : "good";
  const pool = kind === "bonus" ? [BONUS_KEY] : kind === "bad" ? BAD_KEYS : GOOD_KEYS;
  const key = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  const x = ITEM_RADIUS + rng() * (FIELD_W - ITEM_RADIUS * 2);
  const vy = fallSpeedFor(level) * (0.85 + rng() * 0.3);
  const drift = (rng() - 0.5) * 44;
  const spin = (rng() - 0.5) * 2.4;
  return { id: nextId, kind, key, x, y: -ITEM_RADIUS, vy, drift, spin, r: ITEM_RADIUS, rot: 0 };
}

/** 掉落物是否落進籃口。籃口比外框略窄一點，接得剛好才算數。 */
export function overlapsBasket(item, basket) {
  const r = item.r ?? ITEM_RADIUS;
  if (item.y + r < BASKET_TOP) return false;
  if (item.y - r > BASKET_TOP + BASKET_H) return false;
  const half = basket.w / 2;
  const reach = r * 0.6;
  return item.x + reach > basket.x - half && item.x - reach < basket.x + half;
}

/**
 * 一格的菜籃運動。
 * 有 target（觸控／滑鼠拖曳）時直接朝目標走，速度上限一樣，所以拖曳不會作弊。
 * 沒有 target 時吃 dir（鍵盤／長按左右鈕）加速，放開則摩擦減速。
 */
export function moveBasket(basket, input, dt) {
  const { dir = 0, target = null } = input ?? {};
  let vx = basket.vx;
  let x = basket.x;

  if (target != null) {
    const want = clampBasketX(target, basket.w);
    const delta = want - x;
    const stride = BASKET_MAX_SPEED * dt;
    const move = Math.abs(delta) <= stride ? delta : Math.sign(delta) * stride;
    x += move;
    vx = dt > 0 ? move / dt : 0;
  } else if (dir !== 0) {
    vx = Math.max(-BASKET_MAX_SPEED, Math.min(BASKET_MAX_SPEED, vx + dir * BASKET_ACCEL * dt));
    x += vx * dt;
  } else {
    const brake = BASKET_DRAG * dt;
    vx = Math.abs(vx) <= brake ? 0 : vx - Math.sign(vx) * brake;
    x += vx * dt;
  }

  const clamped = clampBasketX(x, basket.w);
  return { ...basket, x: clamped, vx: clamped === x ? vx : 0 };
}

export function createGame(options = {}) {
  const mode = options.mode === "endless" ? "endless" : "goal";
  const seed = options.seed ?? ((Date.now() ^ 0x9e3779b9) >>> 0);
  return {
    phase: "ready", // ready | playing | paused | won | lost
    mode,
    seed,
    rng: options.rng ?? makeRng(seed),
    nextId: 1,
    elapsed: 0,
    timeLeft: mode === "goal" ? ROUND_SECONDS : Infinity,
    goal: mode === "goal" ? GOAL_SCORE : 0,
    level: 1,
    score: 0,
    lives: START_LIVES,
    combo: 0,
    bestCombo: 0,
    multiplier: 1,
    basket: { x: FIELD_W / 2, vx: 0, w: BASKET_W },
    input: { dir: 0, target: null },
    items: [],
    spawnTimer: 0,
    stats: { caught: 0, missed: 0, hit: 0, bonus: 0 },
  };
}

/** 用同樣的模式／亂數源開下一局。 */
export function startGame(state) {
  return {
    ...createGame({ mode: state?.mode, seed: state?.seed, rng: state?.rng }),
    phase: "playing",
  };
}

export function steer(state, dir) {
  const clamped = dir > 0 ? 1 : dir < 0 ? -1 : 0;
  return { ...state, input: { ...state.input, dir: clamped, target: null } };
}

export function aimAt(state, x) {
  return { ...state, input: { ...state.input, target: clampBasketX(x, state.basket.w) } };
}

export function releaseAim(state) {
  return { ...state, input: { ...state.input, target: null } };
}

export function togglePause(state) {
  if (state.phase === "playing") return { ...state, phase: "paused" };
  if (state.phase === "paused") return { ...state, phase: "playing" };
  return state;
}

/**
 * 推進一格。回傳 `{ state, events }`；events 供 UI 播音效／噴粒子：
 *   catch / bonus / hit / miss / dodge / levelup / win / lose
 */
export function step(state, dt) {
  if (state.phase !== "playing" || !(dt > 0)) return { state, events: [] };

  const events = [];
  const elapsed = state.elapsed + dt;
  const timeLeft = state.mode === "goal" ? Math.max(0, state.timeLeft - dt) : Infinity;

  let { score, lives, combo, bestCombo, nextId, spawnTimer } = state;
  const stats = { ...state.stats };
  const basket = moveBasket(state.basket, state.input, dt);

  const level = levelFor(elapsed);
  if (level > state.level) events.push({ type: "levelup", level });

  // 生成：用等級當下的 gap，長 dt 也能一次補齊多顆。
  const items = state.items.map((item) => ({ ...item }));
  spawnTimer += dt;
  const gap = spawnGapFor(level);
  while (spawnTimer >= gap) {
    spawnTimer -= gap;
    items.push(spawnItem({ rng: state.rng, level, nextId }));
    nextId += 1;
  }

  const survivors = [];
  for (const item of items) {
    item.y += item.vy * dt;
    item.x += item.drift * dt;
    item.rot += item.spin * dt;
    // 撞到左右牆就把漂移反彈回場內，避免掉落物貼牆消失。
    if (item.x < ITEM_RADIUS) {
      item.x = ITEM_RADIUS;
      item.drift = Math.abs(item.drift);
    } else if (item.x > FIELD_W - ITEM_RADIUS) {
      item.x = FIELD_W - ITEM_RADIUS;
      item.drift = -Math.abs(item.drift);
    }

    if (overlapsBasket(item, basket)) {
      if (item.kind === "bad") {
        lives -= 1;
        combo = 0;
        stats.hit += 1;
        events.push({ type: "hit", key: item.key, x: item.x, y: item.y, lives });
      } else {
        combo += 1;
        bestCombo = Math.max(bestCombo, combo);
        const multiplier = multiplierFor(combo);
        const points = (item.kind === "bonus" ? BONUS_POINTS : GOOD_POINTS) * multiplier;
        score += points;
        if (item.kind === "bonus") {
          const healed = lives < MAX_LIVES;
          if (healed) lives += 1;
          stats.bonus += 1;
          events.push({ type: "bonus", key: item.key, points, healed, x: item.x, y: item.y, multiplier });
        } else {
          stats.caught += 1;
          events.push({ type: "catch", key: item.key, points, combo, multiplier, x: item.x, y: item.y });
        }
      }
      continue;
    }

    if (item.y - item.r > FIELD_H) {
      if (item.kind === "bad") {
        events.push({ type: "dodge", key: item.key });
      } else {
        lives -= 1;
        combo = 0;
        stats.missed += 1;
        events.push({ type: "miss", key: item.key, x: item.x, lives });
      }
      continue;
    }

    survivors.push(item);
  }

  let phase = state.phase;
  if (state.mode === "goal" && score >= state.goal) {
    phase = "won";
    events.push({ type: "win", score });
  } else if (lives <= 0) {
    lives = 0;
    phase = "lost";
    events.push({ type: "lose", reason: "lives", score });
  } else if (state.mode === "goal" && timeLeft <= 0) {
    phase = "lost";
    events.push({ type: "lose", reason: "time", score });
  }

  return {
    state: {
      ...state,
      phase,
      elapsed,
      timeLeft,
      level,
      score,
      lives,
      combo,
      bestCombo,
      multiplier: multiplierFor(combo),
      basket,
      items: survivors,
      spawnTimer,
      nextId,
      stats,
    },
    events,
  };
}
