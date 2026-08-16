/**
 * 接食材 — DOM、Canvas 與輸入層。
 * 遊戲規則全部留在 game.js；這裡只轉送輸入、畫 state、播放事件與保存結果。
 */
import {
  BASKET_H,
  BASKET_TOP,
  FIELD_H,
  FIELD_W,
  GOOD_KEYS,
  BAD_KEYS,
  BONUS_KEY,
  MAX_LIVES,
  createGame,
  startGame,
  steer,
  aimAt,
  releaseAim,
  step,
  togglePause,
} from "./game.js";
import { FoodcatchAudio } from "./audio.js";
import { EMPTY_PROGRESS, loadProgress, mergeProgress, saveProgress } from "./persist.js";

const $ = (id) => document.getElementById(id);
const els = {
  canvas: $("board"),
  stage: $("stage"),
  overlay: $("overlay"),
  panelTitle: $("panel-title"),
  panelBody: $("panel-body"),
  panelStats: $("panel-stats"),
  panelModes: $("panel-modes"),
  primary: $("btn-primary"),
  secondary: $("btn-secondary"),
  pause: $("btn-pause"),
  sound: $("btn-sound"),
  score: $("stat-score"),
  goal: $("stat-goal"),
  time: $("stat-time"),
  combo: $("stat-combo"),
  mult: $("stat-mult"),
  level: $("stat-level"),
  lives: $("lives"),
  goalTrack: $("goal-track"),
  goalFill: $("goal-fill"),
  toast: $("toast"),
  bestGoal: $("best-goal"),
  bestEndless: $("best-endless"),
  bestCombo: $("best-combo"),
  modeButtons: [...document.querySelectorAll(".mode")],
  left: $("pad-left"),
  right: $("pad-right"),
};

const ctx = els.canvas.getContext("2d");
const audio = new FoodcatchAudio();
let progress = { ...EMPTY_PROGRESS };
let selectedMode = "goal";
let game = createGame({ mode: selectedMode });
let rafId = 0;
let lastFrame = 0;
let activePointer = null;
let heldDirection = 0;
let toastTimer = 0;
let savedOutcome = false;
let particles = [];

const imageKeys = [...GOOD_KEYS, ...BAD_KEYS, BONUS_KEY];
const foodImages = Object.fromEntries(
  imageKeys.map((key) => {
    const image = new Image();
    image.src = `assets/food/${key}.png`;
    return [key, image];
  }),
);
const particleImages = ["star_01", "spark_02", "circle_01", "circle_02"].map((key) => {
  const image = new Image();
  image.src = `assets/particles/${key}.png`;
  return image;
});

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "∞";
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function resizeCanvas() {
  const rect = els.stage.getBoundingClientRect();
  const cssWidth = Math.max(1, Math.min(rect.width, (rect.height * FIELD_W) / FIELD_H));
  const cssHeight = (cssWidth * FIELD_H) / FIELD_W;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  els.canvas.style.width = `${cssWidth}px`;
  els.canvas.style.height = `${cssHeight}px`;
  els.canvas.width = Math.round(cssWidth * dpr);
  els.canvas.height = Math.round(cssHeight * dpr);
  draw();
}

function toFieldX(clientX) {
  const rect = els.canvas.getBoundingClientRect();
  return ((clientX - rect.left) / rect.width) * FIELD_W;
}

function showToast(text, tone = "good") {
  window.clearTimeout(toastTimer);
  els.toast.textContent = text;
  els.toast.dataset.tone = tone;
  els.toast.classList.add("show");
  toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 900);
}

function burst(x, y, tone, amount = 7) {
  for (let i = 0; i < amount; i += 1) {
    const angle = (Math.PI * 2 * i) / amount + Math.random() * 0.35;
    const speed = 45 + Math.random() * 75;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 25,
      life: 0.5 + Math.random() * 0.3,
      maxLife: 0.8,
      size: 8 + Math.random() * 8,
      tone,
      image: particleImages[i % particleImages.length],
    });
  }
}

function updateParticles(dt) {
  particles = particles
    .map((particle) => ({
      ...particle,
      x: particle.x + particle.vx * dt,
      y: particle.y + particle.vy * dt,
      vy: particle.vy + 170 * dt,
      life: particle.life - dt,
    }))
    .filter((particle) => particle.life > 0);
}

function handleEvents(events) {
  for (const event of events) {
    if (event.type === "catch") {
      audio.catchSfx(event.combo);
      burst(event.x, event.y, "good");
      showToast(`+${event.points}　${event.combo} 連擊`, "good");
    } else if (event.type === "bonus") {
      audio.bonusSfx();
      burst(event.x, event.y, "bonus", 12);
      showToast(`金色蛋糕 +${event.points}${event.healed ? "　生命 +1" : ""}`, "good");
    } else if (event.type === "hit") {
      audio.hitSfx();
      burst(event.x, event.y, "bad", 10);
      showToast("接到壞食材！生命 -1", "bad");
    } else if (event.type === "miss") {
      audio.missSfx();
      showToast("漏接好食材！生命 -1", "bad");
    } else if (event.type === "levelup") {
      audio.levelupSfx();
      showToast(`第 ${event.level} 波：更快、更密！`, "good");
    } else if (event.type === "win") {
      audio.winSfx();
    } else if (event.type === "lose") {
      audio.loseSfx();
    }
  }
}

function renderHud() {
  els.score.textContent = String(game.score);
  els.goal.textContent = game.mode === "goal" ? `／${game.goal}` : "無盡";
  els.time.textContent = formatTime(game.timeLeft);
  els.time.closest(".stat").classList.toggle("is-urgent", game.mode === "goal" && game.timeLeft <= 10);
  els.combo.textContent = String(game.combo);
  els.mult.textContent = `×${game.multiplier}`;
  els.combo.closest(".stat").classList.toggle("is-hot", game.multiplier > 1);
  els.level.textContent = String(game.level);
  els.lives.innerHTML = Array.from({ length: MAX_LIVES }, (_, index) =>
    `<span class="heart${index >= game.lives ? " spent" : ""}">🍅</span>`,
  ).join("");
  els.lives.setAttribute("aria-label", `生命 ${game.lives}`);
  els.goalTrack.classList.toggle("is-endless", game.mode === "endless");
  els.goalFill.style.width =
    game.mode === "goal" ? `${Math.min(100, (game.score / game.goal) * 100)}%` : "0%";
  els.pause.disabled = !["playing", "paused"].includes(game.phase);
  els.pause.firstElementChild.textContent = game.phase === "paused" ? "▶" : "⏸";
  els.pause.setAttribute("aria-label", game.phase === "paused" ? "繼續" : "暫停");
}

function renderRecords() {
  els.bestGoal.textContent = progress.bestGoal ? String(progress.bestGoal) : "—";
  els.bestEndless.textContent = progress.bestEndless ? String(progress.bestEndless) : "—";
  els.bestCombo.textContent = progress.bestCombo ? String(progress.bestCombo) : "—";
}

function setModesVisible(visible) {
  els.panelModes.hidden = !visible;
  for (const button of els.modeButtons) {
    button.setAttribute("aria-checked", String(button.dataset.mode === selectedMode));
  }
}

function showReadyPanel() {
  els.overlay.hidden = false;
  els.panelTitle.textContent = "接食材";
  els.panelTitle.dataset.tone = "";
  els.panelBody.textContent = "接住好食材、閃開壞食材。連續接中會提高倍率，每 20 秒升一級。";
  els.panelStats.hidden = true;
  setModesVisible(true);
  els.primary.textContent = "開始遊戲";
  els.secondary.hidden = true;
}

function showPausePanel() {
  els.overlay.hidden = false;
  els.panelTitle.textContent = "已暫停";
  els.panelTitle.dataset.tone = "";
  els.panelBody.textContent = "菜籃和食材都停住了。準備好再繼續。";
  els.panelStats.hidden = true;
  setModesVisible(false);
  els.primary.textContent = "繼續";
  els.secondary.textContent = "重新開始";
  els.secondary.hidden = false;
}

function showOutcomePanel() {
  els.overlay.hidden = false;
  const won = game.phase === "won";
  els.panelTitle.textContent = won ? "達標！你贏了" : game.mode === "endless" ? "本輪結束" : "挑戰失敗";
  els.panelTitle.dataset.tone = won ? "win" : "lose";
  els.panelBody.textContent = won
    ? `在時間內拿到 ${game.score} 分。`
    : game.lives <= 0
      ? `生命用完了，最後拿到 ${game.score} 分。`
      : `時間到，距離目標還差 ${Math.max(0, game.goal - game.score)} 分。`;
  els.panelStats.innerHTML = [
    ["得分", game.score],
    ["最長連擊", game.bestCombo],
    ["接住", game.stats.caught + game.stats.bonus],
    ["漏接／撞壞", `${game.stats.missed}／${game.stats.hit}`],
  ]
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
    .join("");
  els.panelStats.hidden = false;
  setModesVisible(false);
  els.primary.textContent = "再玩一次";
  els.secondary.textContent = "切換模式";
  els.secondary.hidden = false;
}

async function recordOutcome() {
  if (savedOutcome) return;
  savedOutcome = true;
  progress = mergeProgress(progress, {
    mode: game.mode,
    score: game.score,
    bestCombo: game.bestCombo,
    outcome: game.phase,
  });
  renderRecords();
  await saveProgress(progress);
}

function beginGame() {
  audio.unlock();
  game = startGame(createGame({ mode: selectedMode }));
  savedOutcome = false;
  particles = [];
  heldDirection = 0;
  els.overlay.hidden = true;
  renderHud();
  lastFrame = performance.now();
  if (!rafId) rafId = requestAnimationFrame(frame);
}

function frame(now) {
  rafId = 0;
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (game.phase === "playing") {
    const result = step(game, dt);
    game = result.state;
    updateParticles(dt);
    handleEvents(result.events);
    if (["won", "lost"].includes(game.phase)) {
      showOutcomePanel();
      void recordOutcome();
    }
  }
  draw();
  renderHud();
  if (game.phase === "playing") rafId = requestAnimationFrame(frame);
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, FIELD_H);
  gradient.addColorStop(0, "#102b3c");
  gradient.addColorStop(1, "#08131b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  ctx.fillStyle = "rgba(255,255,255,.025)";
  for (let y = 42; y < FIELD_H - 50; y += 56) ctx.fillRect(0, y, FIELD_W, 1);
  ctx.fillStyle = "#173342";
  ctx.fillRect(0, FIELD_H - 42, FIELD_W, 42);
  ctx.fillStyle = "rgba(79,209,176,.12)";
  ctx.fillRect(0, BASKET_TOP, FIELD_W, 2);
}

function drawBasket() {
  const { x, w } = game.basket;
  const left = x - w / 2;
  ctx.save();
  ctx.strokeStyle = "#f2c14e";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(x, BASKET_TOP + 2, w * 0.38, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = "#b87932";
  ctx.beginPath();
  ctx.moveTo(left, BASKET_TOP);
  ctx.lineTo(left + 8, BASKET_TOP + BASKET_H);
  ctx.lineTo(left + w - 8, BASKET_TOP + BASKET_H);
  ctx.lineTo(left + w, BASKET_TOP);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#f0bd69";
  ctx.lineWidth = 3;
  for (let line = 13; line < w; line += 16) {
    ctx.beginPath();
    ctx.moveTo(left + line, BASKET_TOP + 2);
    ctx.lineTo(left + line - 3, BASKET_TOP + BASKET_H - 2);
    ctx.stroke();
  }
  ctx.strokeStyle = "#6e441f";
  ctx.lineWidth = 4;
  ctx.strokeRect(left, BASKET_TOP, w, BASKET_H);
  ctx.restore();
}

function drawItem(item) {
  const image = foodImages[item.key];
  const size = item.kind === "bonus" ? 46 : item.kind === "bad" ? 42 : 39;
  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.rotate(item.rot);
  if (item.kind === "bonus") {
    ctx.shadowColor = "#ffd95a";
    ctx.shadowBlur = 18;
  } else if (item.kind === "bad") {
    ctx.shadowColor = "#ff5264";
    ctx.shadowBlur = 9;
  }
  if (image?.complete && image.naturalWidth) {
    ctx.drawImage(image, -size / 2, -size / 2, size, size);
  } else {
    ctx.fillStyle = item.kind === "bad" ? "#ff5264" : item.kind === "bonus" ? "#ffd95a" : "#4fd1b0";
    ctx.beginPath();
    ctx.arc(0, 0, item.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles() {
  for (const particle of particles) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, particle.life / particle.maxLife);
    ctx.translate(particle.x, particle.y);
    ctx.fillStyle =
      particle.tone === "bad" ? "#ff6b7a" : particle.tone === "bonus" ? "#ffd95a" : "#4fd1b0";
    if (particle.image.complete && particle.image.naturalWidth) {
      ctx.drawImage(particle.image, -particle.size / 2, -particle.size / 2, particle.size, particle.size);
    } else {
      ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
    }
    ctx.restore();
  }
}

function draw() {
  if (!ctx || !els.canvas.width) return;
  ctx.setTransform(els.canvas.width / FIELD_W, 0, 0, els.canvas.height / FIELD_H, 0, 0);
  drawBackground();
  for (const item of game.items) drawItem(item);
  drawParticles();
  drawBasket();
}

function setDirection(direction) {
  heldDirection = direction;
  game = steer(game, direction);
  els.left.classList.toggle("is-down", direction < 0);
  els.right.classList.toggle("is-down", direction > 0);
}

function toggleGamePause() {
  const before = game.phase;
  game = togglePause(game);
  if (game.phase === "paused") {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    showPausePanel();
  } else if (before === "paused" && game.phase === "playing") {
    els.overlay.hidden = true;
    lastFrame = performance.now();
    rafId ||= requestAnimationFrame(frame);
  }
  renderHud();
}

function bindPad(button, direction) {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    audio.unlock();
    button.setPointerCapture?.(event.pointerId);
    setDirection(direction);
  });
  const release = (event) => {
    event.preventDefault();
    if (heldDirection === direction) setDirection(0);
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}

function bindEvents() {
  window.addEventListener("resize", resizeCanvas);
  new ResizeObserver(resizeCanvas).observe(els.stage);

  els.canvas.addEventListener("pointerdown", (event) => {
    if (game.phase !== "playing") return;
    event.preventDefault();
    audio.unlock();
    activePointer = event.pointerId;
    els.canvas.setPointerCapture(event.pointerId);
    game = aimAt(game, toFieldX(event.clientX));
  });
  els.canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId === activePointer && game.phase === "playing") {
      event.preventDefault();
      game = aimAt(game, toFieldX(event.clientX));
    }
  });
  const releasePointer = (event) => {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    game = releaseAim(game);
  };
  els.canvas.addEventListener("pointerup", releasePointer);
  els.canvas.addEventListener("pointercancel", releasePointer);

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
      event.preventDefault();
      setDirection(-1);
    } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
      event.preventDefault();
      setDirection(1);
    } else if ((event.key === " " || event.key === "Escape") && ["playing", "paused"].includes(game.phase)) {
      event.preventDefault();
      toggleGamePause();
    }
  });
  document.addEventListener("keyup", (event) => {
    if ((event.key === "ArrowLeft" || event.key.toLowerCase() === "a") && heldDirection < 0) setDirection(0);
    if ((event.key === "ArrowRight" || event.key.toLowerCase() === "d") && heldDirection > 0) setDirection(0);
  });

  bindPad(els.left, -1);
  bindPad(els.right, 1);

  els.modeButtons.forEach((button) =>
    button.addEventListener("click", () => {
      selectedMode = button.dataset.mode;
      audio.uiSfx();
      setModesVisible(true);
    }),
  );
  els.primary.addEventListener("click", () => {
    audio.uiSfx();
    if (game.phase === "paused") toggleGamePause();
    else beginGame();
  });
  els.secondary.addEventListener("click", () => {
    audio.uiSfx();
    if (game.phase === "paused") beginGame();
    else {
      game = createGame({ mode: selectedMode });
      renderHud();
      showReadyPanel();
      draw();
    }
  });
  els.pause.addEventListener("click", toggleGamePause);
  els.sound.addEventListener("click", () => {
    const enabled = !audio.enabled;
    audio.setEnabled(enabled);
    if (enabled) audio.uiSfx();
    progress = { ...progress, sound: enabled, updatedAt: new Date().toISOString() };
    els.sound.setAttribute("aria-pressed", String(enabled));
    els.sound.firstElementChild.textContent = enabled ? "🔊" : "🔇";
    void saveProgress(progress);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.phase === "playing") toggleGamePause();
  });
}

async function init() {
  bindEvents();
  progress = await loadProgress();
  audio.setEnabled(progress.sound);
  els.sound.setAttribute("aria-pressed", String(progress.sound));
  els.sound.firstElementChild.textContent = progress.sound ? "🔊" : "🔇";
  renderRecords();
  renderHud();
  showReadyPanel();
  resizeCanvas();
}

void init();
