import { describe, it, expect } from "vitest";
import {
  BASKET_H,
  BASKET_MAX_SPEED,
  BASKET_TOP,
  BASKET_W,
  BONUS_POINTS,
  COMBO_STEP,
  FIELD_H,
  FIELD_W,
  GOAL_SCORE,
  GOOD_POINTS,
  ITEM_RADIUS,
  MAX_LEVEL,
  MAX_LIVES,
  MAX_MULTIPLIER,
  ROUND_SECONDS,
  START_LIVES,
  WAVE_SECONDS,
  aimAt,
  badChanceFor,
  clampBasketX,
  createGame,
  fallSpeedFor,
  levelFor,
  moveBasket,
  multiplierFor,
  overlapsBasket,
  releaseAim,
  spawnGapFor,
  spawnItem,
  startGame,
  steer,
  step,
  togglePause,
} from "./game.js";

/** Deterministic PRNG stand-in: replays `values`, then repeats the last one. */
function seq(...values) {
  let i = 0;
  return () => values[i < values.length ? i++ : values.length - 1];
}

/** A playing state whose spawner is muted, so tests only see what they place. */
function quietGame(overrides = {}) {
  const game = startGame(createGame({ rng: seq(0.5) }));
  return {
    ...game,
    // Spawns are driven by `spawnTimer`; a far-future timer keeps the field clear.
    spawnTimer: -1e6,
    ...overrides,
  };
}

/** Drop one item straight into the basket mouth. */
function itemAt(x, y, overrides = {}) {
  return {
    id: 1,
    kind: "good",
    key: "apple",
    x,
    y,
    vy: 0,
    drift: 0,
    spin: 0,
    r: ITEM_RADIUS,
    ...overrides,
  };
}

describe("createGame / startGame", () => {
  it("開局是 ready、3 命、0 分、空場", () => {
    const game = createGame();
    expect(game.phase).toBe("ready");
    expect(game.lives).toBe(START_LIVES);
    expect(game.score).toBe(0);
    expect(game.combo).toBe(0);
    expect(game.multiplier).toBe(1);
    expect(game.level).toBe(1);
    expect(game.items).toEqual([]);
    expect(game.basket.x).toBe(FIELD_W / 2);
  });

  it("目標模式帶著目標分與倒數，無盡模式兩者皆無", () => {
    const goal = createGame({ mode: "goal" });
    expect(goal.goal).toBe(GOAL_SCORE);
    expect(goal.timeLeft).toBe(ROUND_SECONDS);

    const endless = createGame({ mode: "endless" });
    expect(endless.goal).toBe(0);
    expect(endless.timeLeft).toBe(Infinity);
  });

  it("startGame 清掉上一局殘留並轉為 playing", () => {
    const dirty = {
      ...createGame(),
      score: 999,
      lives: 1,
      combo: 12,
      items: [itemAt(10, 10)],
    };
    const fresh = startGame(dirty);
    expect(fresh.phase).toBe("playing");
    expect(fresh.score).toBe(0);
    expect(fresh.lives).toBe(START_LIVES);
    expect(fresh.combo).toBe(0);
    expect(fresh.items).toEqual([]);
  });

  it("togglePause 只在 playing／paused 之間切換", () => {
    const playing = quietGame();
    const paused = togglePause(playing);
    expect(paused.phase).toBe("paused");
    expect(togglePause(paused).phase).toBe("playing");

    const finished = { ...playing, phase: "lost" };
    expect(togglePause(finished).phase).toBe("lost");
  });
});

describe("菜籃移動邊界", () => {
  it("clampBasketX 夾住左右牆", () => {
    expect(clampBasketX(-500)).toBe(BASKET_W / 2);
    expect(clampBasketX(FIELD_W + 500)).toBe(FIELD_W - BASKET_W / 2);
    expect(clampBasketX(FIELD_W / 2)).toBe(FIELD_W / 2);
  });

  it("按住右鍵會加速右移", () => {
    const basket = { x: FIELD_W / 2, vx: 0, w: BASKET_W };
    const moved = moveBasket(basket, { dir: 1, target: null }, 0.1);
    expect(moved.vx).toBeGreaterThan(0);
    expect(moved.x).toBeGreaterThan(basket.x);
  });

  it("持續右推也不會越過右牆，且撞牆後速度歸零", () => {
    let basket = { x: FIELD_W / 2, vx: 0, w: BASKET_W };
    for (let i = 0; i < 200; i++) basket = moveBasket(basket, { dir: 1, target: null }, 1 / 60);
    expect(basket.x).toBe(FIELD_W - BASKET_W / 2);
    expect(basket.vx).toBe(0);
  });

  it("持續左推也不會越過左牆", () => {
    let basket = { x: FIELD_W / 2, vx: 0, w: BASKET_W };
    for (let i = 0; i < 200; i++) basket = moveBasket(basket, { dir: -1, target: null }, 1 / 60);
    expect(basket.x).toBe(BASKET_W / 2);
  });

  it("速度有上限", () => {
    let basket = { x: FIELD_W / 2, vx: 0, w: BASKET_W };
    for (let i = 0; i < 50; i++) basket = moveBasket(basket, { dir: 1, target: null }, 1 / 60);
    expect(Math.abs(basket.vx)).toBeLessThanOrEqual(BASKET_MAX_SPEED + 1e-9);
  });

  it("觸控拖曳朝目標移動且不會過衝", () => {
    const basket = { x: 100, vx: 0, w: BASKET_W };
    const near = moveBasket(basket, { dir: 0, target: 102 }, 0.5);
    expect(near.x).toBe(102);

    const far = moveBasket(basket, { dir: 0, target: FIELD_W }, 1 / 60);
    expect(far.x).toBeGreaterThan(100);
    expect(far.x - 100).toBeLessThanOrEqual(BASKET_MAX_SPEED / 60 + 1e-9);
  });

  it("拖曳目標超出場外時仍夾在牆內", () => {
    const basket = { x: 100, vx: 0, w: BASKET_W };
    const moved = moveBasket(basket, { dir: 0, target: -999 }, 10);
    expect(moved.x).toBe(BASKET_W / 2);
  });

  it("放開後摩擦力讓菜籃停下", () => {
    let basket = { x: FIELD_W / 2, vx: BASKET_MAX_SPEED, w: BASKET_W };
    for (let i = 0; i < 60; i++) basket = moveBasket(basket, { dir: 0, target: null }, 1 / 60);
    expect(basket.vx).toBe(0);
  });

  it("steer／aimAt／releaseAim 更新輸入意圖", () => {
    const game = quietGame();
    expect(steer(game, 1).input.dir).toBe(1);
    expect(steer(game, -3).input.dir).toBe(-1);
    expect(aimAt(game, 40).input.target).toBe(clampBasketX(40));
    expect(releaseAim(aimAt(game, 40)).input.target).toBe(null);
  });
});

describe("碰撞判定", () => {
  const basket = { x: FIELD_W / 2, vx: 0, w: BASKET_W };

  it("落在籃口正上緣就算接住", () => {
    expect(overlapsBasket(itemAt(FIELD_W / 2, BASKET_TOP - ITEM_RADIUS + 1), basket)).toBe(true);
  });

  it("還在高處不算接住", () => {
    expect(overlapsBasket(itemAt(FIELD_W / 2, BASKET_TOP - 80), basket)).toBe(false);
  });

  it("水平錯開超過籃寬不算接住", () => {
    expect(overlapsBasket(itemAt(FIELD_W / 2 + BASKET_W, BASKET_TOP), basket)).toBe(false);
  });

  it("已經掉到籃底以下不算接住", () => {
    expect(overlapsBasket(itemAt(FIELD_W / 2, BASKET_TOP + BASKET_H + ITEM_RADIUS + 5), basket)).toBe(
      false,
    );
  });

  it("以每幀最大位移掃過籃口時不會穿透", () => {
    const fastest = fallSpeedFor(MAX_LEVEL) * 1.15;
    const perFrame = fastest * 0.05; // app.js 會把 dt 夾在 0.05
    let caught = false;
    for (let y = BASKET_TOP - ITEM_RADIUS - perFrame; y < FIELD_H; y += perFrame) {
      if (overlapsBasket(itemAt(FIELD_W / 2, y), basket)) caught = true;
    }
    expect(caught).toBe(true);
  });
});

describe("難度曲線", () => {
  it("multiplierFor 每 COMBO_STEP 加一並封頂", () => {
    expect(multiplierFor(0)).toBe(1);
    expect(multiplierFor(COMBO_STEP - 1)).toBe(1);
    expect(multiplierFor(COMBO_STEP)).toBe(2);
    expect(multiplierFor(COMBO_STEP * 2)).toBe(3);
    expect(multiplierFor(COMBO_STEP * 999)).toBe(MAX_MULTIPLIER);
  });

  it("levelFor 每 WAVE_SECONDS 升一級並封頂", () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(WAVE_SECONDS - 0.01)).toBe(1);
    expect(levelFor(WAVE_SECONDS)).toBe(2);
    expect(levelFor(WAVE_SECONDS * 3)).toBe(4);
    expect(levelFor(WAVE_SECONDS * 999)).toBe(MAX_LEVEL);
  });

  it("等級越高掉得越快、生成越密、壞物越多", () => {
    expect(fallSpeedFor(3)).toBeGreaterThan(fallSpeedFor(1));
    expect(spawnGapFor(3)).toBeLessThan(spawnGapFor(1));
    expect(badChanceFor(3)).toBeGreaterThan(badChanceFor(1));
  });

  it("生成間隔與壞物比例有安全上下限", () => {
    expect(spawnGapFor(MAX_LEVEL)).toBeGreaterThanOrEqual(0.35);
    expect(badChanceFor(MAX_LEVEL)).toBeLessThanOrEqual(0.35);
  });
});

describe("spawnItem", () => {
  it("生在畫面上方且整顆都在左右牆內", () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const item = spawnItem({ rng: seq(r), level: 4, nextId: 7 });
      expect(item.y).toBeLessThan(0);
      expect(item.x).toBeGreaterThanOrEqual(ITEM_RADIUS);
      expect(item.x).toBeLessThanOrEqual(FIELD_W - ITEM_RADIUS);
      expect(item.vy).toBeGreaterThan(0);
      expect(item.id).toBe(7);
    }
  });

  it("極低 roll 產生金色 bonus", () => {
    const item = spawnItem({ rng: seq(0.001, 0.5), level: 1, nextId: 1 });
    expect(item.kind).toBe("bonus");
  });

  it("中段 roll 產生壞掉的食材", () => {
    const item = spawnItem({ rng: seq(0.06, 0.5), level: 1, nextId: 1 });
    expect(item.kind).toBe("bad");
  });

  it("高 roll 產生好食材，且 key 合法", () => {
    const item = spawnItem({ rng: seq(0.99, 0.5), level: 1, nextId: 1 });
    expect(item.kind).toBe("good");
    expect(item.key).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("step — 接取與連擊", () => {
  it("接到好食材加分、連擊 +1、事件帶 key", () => {
    const game = quietGame({ items: [itemAt(FIELD_W / 2, BASKET_TOP)] });
    const { state, events } = step(game, 1 / 60);
    expect(state.score).toBe(GOOD_POINTS);
    expect(state.combo).toBe(1);
    expect(state.stats.caught).toBe(1);
    expect(state.items).toHaveLength(0);
    expect(events.find((e) => e.type === "catch")?.key).toBe("apple");
  });

  it("連擊達門檻後倍率讓同一顆食材更值錢", () => {
    const hot = quietGame({
      combo: COMBO_STEP * 2 - 1,
      items: [itemAt(FIELD_W / 2, BASKET_TOP)],
    });
    const { state } = step(hot, 1 / 60);
    expect(state.multiplier).toBe(3);
    expect(state.score).toBe(GOOD_POINTS * 3);
  });

  it("bestCombo 會記住本局最長連擊", () => {
    const game = quietGame({ combo: 9, bestCombo: 9, items: [itemAt(FIELD_W / 2, BASKET_TOP)] });
    const { state } = step(game, 1 / 60);
    expect(state.bestCombo).toBe(10);
  });

  it("接到壞食材扣命、連擊歸零", () => {
    const game = quietGame({
      combo: 8,
      items: [itemAt(FIELD_W / 2, BASKET_TOP, { kind: "bad", key: "bomb_tomato" })],
    });
    const { state, events } = step(game, 1 / 60);
    expect(state.lives).toBe(START_LIVES - 1);
    expect(state.combo).toBe(0);
    expect(state.multiplier).toBe(1);
    expect(state.stats.hit).toBe(1);
    expect(events.some((e) => e.type === "hit")).toBe(true);
  });

  it("漏接好食材扣命並中斷連擊", () => {
    const game = quietGame({
      combo: 6,
      items: [itemAt(40, FIELD_H + ITEM_RADIUS - 1, { vy: 200 })],
    });
    const { state, events } = step(game, 1 / 60);
    expect(state.lives).toBe(START_LIVES - 1);
    expect(state.combo).toBe(0);
    expect(state.stats.missed).toBe(1);
    expect(events.some((e) => e.type === "miss")).toBe(true);
  });

  it("讓壞食材落地是正確玩法，不扣命也不斷連擊", () => {
    const game = quietGame({
      combo: 6,
      items: [itemAt(40, FIELD_H + ITEM_RADIUS - 1, { kind: "bad", key: "bomb_tomato", vy: 200 })],
    });
    const { state, events } = step(game, 1 / 60);
    expect(state.lives).toBe(START_LIVES);
    expect(state.combo).toBe(6);
    expect(events.some((e) => e.type === "dodge")).toBe(true);
  });

  it("接到 bonus 高分並補一條命", () => {
    const game = quietGame({
      lives: 2,
      items: [itemAt(FIELD_W / 2, BASKET_TOP, { kind: "bonus", key: "cake-birthday" })],
    });
    const { state, events } = step(game, 1 / 60);
    expect(state.score).toBe(BONUS_POINTS);
    expect(state.lives).toBe(3);
    expect(state.stats.bonus).toBe(1);
    expect(events.find((e) => e.type === "bonus")?.healed).toBe(true);
  });

  it("bonus 不會把生命補過上限", () => {
    const game = quietGame({
      lives: MAX_LIVES,
      items: [itemAt(FIELD_W / 2, BASKET_TOP, { kind: "bonus", key: "cake-birthday" })],
    });
    const { state, events } = step(game, 1 / 60);
    expect(state.lives).toBe(MAX_LIVES);
    expect(events.find((e) => e.type === "bonus")?.healed).toBe(false);
  });

  it("掉落物會左右漂移但撞牆反彈，永遠留在場內", () => {
    const game = quietGame({
      items: [itemAt(ITEM_RADIUS + 1, 0, { drift: -400, vy: 10 })],
    });
    const { state } = step(game, 0.05);
    expect(state.items[0].x).toBeGreaterThanOrEqual(ITEM_RADIUS);
    expect(state.items[0].drift).toBeGreaterThan(0);
  });
});

describe("step — 升級、勝負與時間", () => {
  it("跨過波次秒數會升級並發出事件", () => {
    const game = quietGame({ elapsed: WAVE_SECONDS - 0.01 });
    const { state, events } = step(game, 0.05);
    expect(state.level).toBe(2);
    expect(events.find((e) => e.type === "levelup")?.level).toBe(2);
  });

  it("生命歸零就落敗", () => {
    const game = quietGame({
      lives: 1,
      items: [itemAt(FIELD_W / 2, BASKET_TOP, { kind: "bad", key: "bomb_tomato" })],
    });
    const { state, events } = step(game, 1 / 60);
    expect(state.lives).toBe(0);
    expect(state.phase).toBe("lost");
    expect(events.find((e) => e.type === "lose")?.reason).toBe("lives");
  });

  it("達到目標分就獲勝", () => {
    const game = quietGame({
      score: GOAL_SCORE - GOOD_POINTS,
      items: [itemAt(FIELD_W / 2, BASKET_TOP)],
    });
    const { state, events } = step(game, 1 / 60);
    expect(state.phase).toBe("won");
    expect(events.some((e) => e.type === "win")).toBe(true);
  });

  it("時間耗盡但沒達標就落敗", () => {
    const game = quietGame({ timeLeft: 0.02 });
    const { state, events } = step(game, 0.05);
    expect(state.timeLeft).toBe(0);
    expect(state.phase).toBe("lost");
    expect(events.find((e) => e.type === "lose")?.reason).toBe("time");
  });

  it("無盡模式不會因分數獲勝，也不會被時間淘汰", () => {
    const endless = {
      ...startGame(createGame({ mode: "endless", rng: seq(0.5) })),
      spawnTimer: -1e6,
      score: GOAL_SCORE * 10,
    };
    const { state } = step(endless, 5);
    expect(state.phase).toBe("playing");
    expect(state.timeLeft).toBe(Infinity);
  });

  it("非 playing 階段 step 不做事", () => {
    for (const phase of ["ready", "paused", "won", "lost"]) {
      const game = { ...quietGame({ items: [itemAt(FIELD_W / 2, BASKET_TOP)] }), phase };
      const { state, events } = step(game, 1 / 60);
      expect(events).toEqual([]);
      expect(state.score).toBe(0);
      expect(state.elapsed).toBe(0);
    }
  });

  it("dt<=0 不推進世界", () => {
    const game = quietGame();
    const { state, events } = step(game, 0);
    expect(state).toBe(game);
    expect(events).toEqual([]);
  });
});

describe("step — 生成與純度", () => {
  it("時間累積會依 gap 陸續生成掉落物", () => {
    let game = startGame(createGame({ rng: seq(0.5) }));
    for (let i = 0; i < 180; i++) game = step(game, 1 / 60).state;
    expect(game.items.length).toBeGreaterThan(0);
    expect(game.nextId).toBeGreaterThan(1);
  });

  it("step 不會就地改寫傳入的 state", () => {
    const game = quietGame({ items: [itemAt(FIELD_W / 2, BASKET_TOP)] });
    const snapshot = JSON.parse(JSON.stringify({ ...game, timeLeft: 0 }));
    const { state } = step(game, 1 / 60);
    expect(state).not.toBe(game);
    expect(JSON.parse(JSON.stringify({ ...game, timeLeft: 0 }))).toEqual(snapshot);
  });

  it("一整局跑到底不會卡住，最後一定分出勝負", () => {
    let game = startGame(createGame({ rng: seq(0.5) }));
    for (let i = 0; i < 60 * (ROUND_SECONDS + 5) && game.phase === "playing"; i++) {
      game = step(game, 1 / 60).state;
    }
    expect(["won", "lost"]).toContain(game.phase);
  });
});
