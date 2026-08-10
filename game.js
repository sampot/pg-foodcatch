/**
 * 接食材 — 純邏輯：落物、接取判定、計分、難度、回合狀態機。
 * 純函式設計，方便單元測試。
 *
 * 玩法：
 *  食材從天上掉下來，玩家左右移動「菜籃」接住。
 *  接中食物 +1 分（連擊加成）；接到炸彈（壞掉的番茄）扣命並掉落炸裂。
 *  漏掉食物扣一點機會；食材落地太快，會依耐性懲罰。
 */

const W = 360; // 邏輯寬度（px 座標基準）
const H = 520; // 邏輯高度
const BASKET_W = 64;
const SPEED_BASE = 90; // px/s 起始下墜速度

/** 掉落物件：{x, y, type: 'food'|'bomb', key, v}。 */
export function spawnItem(rand = Math.random, t = 0) {
  const isBomb = rand() < 0.14; // 約 14% 炸彈
  const type = isBomb ? "bomb" : "food";
  const key = isBomb ? "bomb_tomato" : pickFood(rand);
  return {
    x: 20 + rand() * (W - 40),
    y: -30,
    type,
    key,
    v: SPEED_BASE + rand() * 40,
  };
}

const FOODS = [
  "apple",
  "banana",
  "burger",
  "cheese",
  "carrot",
  "corn-dog",
  "donut",
  "egg",
  "fries",
  "grapes",
  "ice-cream",
  "orange",
  "pancakes",
  "pizza-box",
  "strawberry",
  "watermelon",
  "loaf",
  "bread",
  "hot-dog",
  "cookie",
];
function pickFood(rand) {
  return FOODS[Math.floor(rand() * FOODS.length)];
}

/** 建立一局。 */
export function newGame() {
  return {
    score: 0,
    streak: 0,
    lives: 3,
    combo: 0,
    maxCombo: 0,
    items: [],
    basket: { x: W / 2 - BASKET_W / 2, w: BASKET_W },
    spawnAcc: 0,
    spawnGap: 1.1, // 秒
    speedMul: 1,
    t: 0,
    dt: 0,
    level: 1,
    lastSpawn: 0,
    over: false,
    elapsed: 0,
    caught: 0,
    missed: 0,
  };
}

const WIDTH = W;
const HEIGHT = H;

export { WIDTH, HEIGHT, BASKET_W, SPEED_BASE };

/**
 * 每幀更新（dt 秒）。回傳事件陣列：
 *  - { type:'catch', key, score, combo }
 *  - { type:'bomb', lostLife:true }
 *  - { type:'drop', key }（漏接）
 */
export function update(game, dt, rand = Math.random) {
  if (game.over) return [];
  game.t += dt;
  game.elapsed += dt;

  const events = [];
  // 生成
  game.spawnAcc += dt;
  const gap = Math.max(0.45, game.spawnGap / (1 + (game.level - 1) * 0.12));
  while (game.spawnAcc >= gap) {
    game.spawnAcc -= gap;
    const it = spawnItem(rand, game.t);
    it.v = it.v * game.speedMul;
    game.items.push(it);
    events.push({ type: "spawn", key: it.key, isBomb: it.type === "bomb" });
  }

  // 移動
  const basket = game.basket;
  for (const it of game.items) {
    it.y += it.v * dt;
    // 接取判定：x 重疊且 y 進入籃子範圍
    if (it.type === "food") {
      if (
        it.y >= H - 44 &&
        it.y <= H - 10 &&
        it.x + 22 > basket.x &&
        it.x - 22 < basket.x + basket.w
      ) {
        game.score += 10 + Math.min(10, game.streak) * 2;
        game.streak++;
        game.combo++;
        game.maxCombo = Math.max(game.maxCombo, game.combo);
        game.caught++;
        events.push({ type: "catch", key: it.key, score: 3 + Math.floor(game.streak / 3) });
        it.done = true;
      } else if (it.y > H - 8) {
        game.streak = 0;
        game.combo = 0;
        game.missed++;
        events.push({ type: "drop", key: it.key });
        it.done = true;
      }
    } else {
      // 炸彈：碰到就爆
      if (
        it.y >= H - 44 &&
        it.y <= H + 8 &&
        it.x + 22 > basket.x &&
        it.x - 22 < basket.x + basket.w
      ) {
        game.lives--;
        game.streak = 0;
        game.combo = 0;
        events.push({ type: "bomb" });
        it.done = true;
        if (game.lives <= 0) {
          game.over = true;
          events.push({ type: "gameover" });
        }
      } else if (it.y > H - 2) {
        it.done = true; // 炸彈落地無傷
      }
    }
  }
  game.items = game.items.filter((i) => !i.done);

  // 難度：每 20 秒升級
  if (game.elapsed > 0) {
    const lv = 1 + Math.floor(game.elapsed / 20);
    if (lv > game.level) {
      game.level = lv;
      game.speedMul = Math.min(1.9, 1 + (lv - 1) * 0.18);
      events.push({ type: "levelup", level: lv });
    }
  }
  return events;
}

/** 重置一場。 */
export function resetGame() {
  return newGame();
}