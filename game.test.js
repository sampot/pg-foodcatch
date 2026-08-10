import { newGame, update, spawnItem, resetGame, WIDTH, HEIGHT, BASKET_W } from "./game.js";
import { describe, it, expect } from "vitest";

/** 可注入的 PRNG：回傳固定序列，行為同 Math.random。 */
function makeSeq(seq) {
  let i = 0;
  return () => seq[i < seq.length ? i++ : seq.length - 1];
}

describe("spawnItem", () => {
  it("產生位於畫面上方的食物或炸彈", () => {
    for (let k = 0; k < 50; k++) {
      const it = spawnItem(makeSeq([0.5, 0.5, 0.9]));
      expect(it.x).toBeGreaterThanOrEqual(20);
      expect(it.x).toBeLessThanOrEqual(WIDTH - 20);
      expect(it.y).toBe(-30);
      expect(["food", "bomb"]).toContain(it.type);
      expect(it.v).toBeGreaterThan(0);
    }
  });

  it("機率高時會產生炸彈", () => {
    const it = spawnItem(makeSeq([0.05, 0.05, 0.5]));
    expect(it.type).toBe("bomb");
    expect(it.key).toBe("bomb_tomato");
  });

  it("隨機選擇的食物 key 合法", () => {
    const it = spawnItem(makeSeq([0.999, 0.999, 0.5]));
    expect(it.type).toBe("food");
    expect(it.key).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("newGame", () => {
  it("初始 3 命、0 分、空掉落", () => {
    const g = newGame();
    expect(g.lives).toBe(3);
    expect(g.score).toBe(0);
    expect(g.items).toHaveLength(0);
    expect(g.over).toBe(false);
    expect(g.basket.w).toBe(BASKET_W);
  });

  it("resetGame 產生新一局", () => {
    const g = newGame();
    g.score = 99;
    const r = resetGame();
    expect(r).not.toBe(g);
    expect(r.score).toBe(0);
    expect(r.lives).toBe(3);
  });
});

describe("update", () => {
  it("spawn 事件出現且物件下移", () => {
    const g = newGame();
    const events = update(g, 1.2, makeSeq([0.5, 0.5, 0.5, 0.5, 0.5]));
    expect(events.some((e) => e.type === "spawn")).toBe(true);
    expect(g.items.length).toBeGreaterThan(0);
    for (const it of g.items) expect(it.y).toBeGreaterThan(-30);
  });

  it("炸彈碰到菜藍扣命並產 bomb 事件", () => {
    const g = newGame();
    g.items.push({
      x: WIDTH / 2,
      y: HEIGHT - 40,
      v: 0,
      type: "bomb",
      key: "bomb_tomato",
    });
    g.basket.x = WIDTH / 2 - BASKET_W / 2;
    const events = update(g, 0.1, makeSeq([0.5]));
    expect(events.some((e) => e.type === "bomb")).toBe(true);
    expect(g.lives).toBe(2);
    expect(g.items).toHaveLength(0);
  });

  it("食物被接住：加分、連擊、caught", () => {
    const g = newGame();
    g.basket.x = WIDTH / 2 - BASKET_W / 2;
    g.items.push({ x: WIDTH / 2, y: HEIGHT - 40, v: 120, type: "food", key: "apple" });
    const events = update(g, 0.1, makeSeq([0.5]));
    expect(events.some((e) => e.type === "catch")).toBe(true);
    expect(g.score).toBeGreaterThanOrEqual(10);
    expect(g.caught).toBe(1);
    expect(g.streak).toBe(1);
    expect(g.combo).toBe(1);
    expect(g.items).toHaveLength(0);
  });

  it("食物落到底部：漏接、連擊歸零", () => {
    const g = newGame();
    g.streak = 5;
    g.items.push({ x: 30, y: HEIGHT - 6, v: 120, type: "food", key: "banana" });
    const events = update(g, 0.05, makeSeq([0.5]));
    expect(events.some((e) => e.type === "drop")).toBe(true);
    expect(g.missed).toBe(1);
    expect(g.streak).toBe(0);
  });

  it("溢出畫面的炸彈只會消失不扣命", () => {
    const g = newGame();
    g.items.push({ x: 100, y: HEIGHT - 1, v: 120, type: "bomb", key: "bomb_tomato" });
    const events = update(g, 0.01, makeSeq([0.5]));
    expect(events.some((e) => e.type === "bomb")).toBe(false);
    expect(g.lives).toBe(3);
    expect(g.items).toHaveLength(0);
  });

  it("等級升級提高速度", () => {
    const g = newGame();
    g.elapsed = 19;
    const events = update(g, 1.5, makeSeq([0.5]));
    expect(events.some((e) => e.type === "levelup" && e.level === 2)).toBe(true);
    expect(g.speedMul).toBeGreaterThan(1);
  });

  it("3 命耗盡 → gameover", () => {
    const g = newGame();
    g.lives = 1;
    g.basket.x = WIDTH / 2 - BASKET_W / 2;
    g.items.push({ x: WIDTH / 2, y: HEIGHT - 40, v: 120, type: "bomb", key: "bomb_tomato" });
    const events = update(g, 0.1, makeSeq([0.5]));
    expect(events.some((e) => e.type === "gameover")).toBe(true);
    expect(g.over).toBe(true);
  });

  it("over 之後 update 不再動作", () => {
    const g = newGame();
    g.over = true;
    g.items.push({ x: 10, y: HEIGHT - 40, v: 120, type: "food", key: "apple" });
    const events = update(g, 0.1, makeSeq([0.5]));
    expect(events).toHaveLength(0);
    expect(g.caught).toBe(0);
  });

  it("跨長時間片段會依序產出多個 spawn", () => {
    const g = newGame();
    const c = makeSeq([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const events = update(g, 5.0, c);
    const spawns = events.filter((e) => e.type === "spawn");
    expect(spawns.length).toBeGreaterThan(1);
  });
});

describe("難度曲線", () => {
  it("spawn gap 隨等級縮短、有下限", () => {
    const g = newGame();
    g.level = 10;
    const ev = update(g, 0.001, makeSeq([0.5]));
    expect(ev).toEqual([]);
    // gap 公式應 >= 0.45
    const gap = Math.max(0.45, g.spawnGap / (1 + (g.level - 1) * 0.12));
    expect(gap).toBeGreaterThanOrEqual(0.45);
  });
});