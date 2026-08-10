/**
 * 接食材 — 介面與互動。Canvas 渲染，觸控／滑鼠移動菜籃。
 */
import { newGame, update, WIDTH, HEIGHT, BASKET_W } from "./game.js";
import { FoodcatchAudio } from "./audio.js";

const audio = new FoodcatchAudio();

const els = {
  canvas: document.getElementById("game"),
  score: document.getElementById("score"),
  lives: document.getElementById("lives"),
  level: document.getElementById("level"),
  combo: document.getElementById("combo"),
  status: document.getElementById("status"),
  btnStart: document.getElementById("btn-start"),
  btnMute: document.getElementById("btn-mute"),
  best: document.getElementById("best-label"),
};

const BEST_KEY = "pg-foodcatch-best";

const ctx = els.canvas.getContext("2d");
// 畫布尺寸依裝置縮放，邏輯座標保持 W×H
const RATIO = WIDTH / HEIGHT;
function resize() {
  const maxW = Math.min(window.innerWidth - 20, 420);
  const h = window.innerHeight - 170;
  const w = maxW;
  els.canvas.width = w;
  els.canvas.height = Math.max(360, Math.min(h, w / RATIO));
}
window.addEventListener("resize", resize);
resize();

let game = null;
let running = false;
let raf = null;
let pointerX = WIDTH / 2;
let bestSco = 0;

const foodImg = {};
const imgNames = [
  "apple", "banana", "burger", "cheese", "carrot", "corn-dog", "donut", "egg",
  "fries", "grapes", "ice-cream", "orange", "pancakes", "pizza-box", "strawberry",
  "watermelon", "loaf", "bread", "hot-dog", "cookie", "bomb_tomato",
];
for (const n of imgNames) {
  const im = new Image();
  im.src = `assets/food/${n}.png`;
  foodImg[n] = im;
}

function setStatus(msg, tone = "") {
  els.status.textContent = msg;
  els.status.dataset.tone = tone;
}

function startGame() {
  audio.unlock();
  game = newGame();
  running = true;
  pointerX = WIDTH / 2;
  game.basket.x = pointerX - BASKET_W / 2;
  setStatus("接著掉下來的食材！躲開壞掉的番茄！");
  renderHud();
  if (raf) cancelAnimationFrame(raf);
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const events = update(game, dt);
    for (const e of events) {
      if (e.type === "catch") audio.catchSfx();
      else if (e.type === "bomb") audio.bomb();
      else if (e.type === "drop") audio.drop();
      else if (e.type === "levelup") {
        audio.levelup();
        setStatus(`升級！等級 ${e.level}，速度加快。`, "win");
      } else if (e.type === "gameover") {
        audio.gameover();
        endGame();
      }
    }
    draw();
    renderHud();
    if (game && !game.over) raf = requestAnimationFrame(loop);
    else if (game && game.over) raf = null;
  };
  raf = requestAnimationFrame(loop);
}

function endGame() {
  running = false;
  setStatus(`遊戲結束！得分 ${game.score}。按「再玩一次」重來。`, "lose");
  if (game.score > bestSco) {
    bestSco = game.score;
    saveBest();
  }
}

function draw() {
  const w = els.canvas.width;
  const h = els.canvas.height;
  const sx = w / WIDTH;
  const sy = h / HEIGHT;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.scale(sx, sy);
  // 背景
  ctx.fillStyle = "#12202c";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#1b3141";
  ctx.fillRect(0, HEIGHT - 34, WIDTH, 34); // 地板
  ctx.fillStyle = "rgba(255,255,255,.05)";
  ctx.fillRect(0, HEIGHT - 60, WIDTH, 2);
  // 食材
  for (const it of game.items) {
    const img = foodImg[it.key];
    if (img && img.complete) {
      const size = it.type === "bomb" ? 44 : 40;
      ctx.drawImage(img, it.x - size / 2, it.y - size / 2, size, size);
    } else {
      ctx.fillStyle = it.type === "bomb" ? "#c0392b" : "#f1c40f";
      ctx.beginPath();
      ctx.arc(it.x, it.y, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 菜籃
  const b = game.basket;
  ctx.fillStyle = "#e8c069";
  ctx.fillRect(b.x - 6, HEIGHT - 20, b.w + 12, 14);
  ctx.fillStyle = "#c79b47";
  ctx.fillRect(b.x + 6, HEIGHT - 20, b.w - 12, 4);
  ctx.fillStyle = "#a9b8c4";
  ctx.fillRect(b.x, HEIGHT - 28, b.w, 6);
  ctx.restore();
}

function renderHud() {
  els.score.textContent = String(game ? game.score : 0);
  els.lives.textContent = game ? "❤".repeat(Math.max(0, game.lives)) : "❤❤❤";
  els.combo.textContent = game ? `×${game.combo}` : "×0";
  els.level.textContent = game ? String(game.level) : "1";
}

/** 以邏輯座標設定菜籃中心（並夾在畫布範圍內）。 */
function setBasketCenter(logicalX) {
  if (!game || game.over) return;
  pointerX = Math.max(BASKET_W / 2, Math.min(WIDTH - BASKET_W / 2, logicalX));
  game.basket.x = pointerX - BASKET_W / 2;
}

function moveBasket(clientX) {
  const rect = els.canvas.getBoundingClientRect();
  const ratio = WIDTH / rect.width;
  setBasketCenter((clientX - rect.left) * ratio);
}

function bindEvents() {
  els.btnStart.addEventListener("click", () => startGame());
  els.canvas.addEventListener("pointermove", (e) => moveBasket(e.clientX));
  els.canvas.addEventListener("pointerdown", (e) => {
    audio.unlock();
    moveBasket(e.clientX);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") setBasketCenter(pointerX - 30);
    if (e.key === "ArrowRight") setBasketCenter(pointerX + 30);
  });
  els.btnMute.addEventListener("click", () => {
    const on = audio.enabled;
    audio.setEnabled(!on);
    els.btnMute.setAttribute("aria-pressed", String(!on));
    els.btnMute.textContent = on ? "音效關" : "音效開";
  });
}

async function loadBest() {
  try {
    const res = await fetch(`/api/kv/${BEST_KEY}`);
    if (res.ok) {
      const t = (await res.text()).trim();
      if (/^\d+$/.test(t)) {
        bestSco = Number(t);
        els.best.textContent = bestSco + " 分";
        return;
      }
    }
  } catch {
    /* 無 KV */
  }
  els.best.textContent = "—";
}

async function saveBest() {
  els.best.textContent = bestSco + " 分";
  try {
    await fetch(`/api/kv/${BEST_KEY}`, { method: "PUT", body: String(bestSco) });
  } catch {
    /* 無 KV */
  }
}

async function init() {
  bindEvents();
  await loadBest();
  game = newGame();
  draw();
  renderHud();
  setStatus("按「開始」接食材。");
}

init();