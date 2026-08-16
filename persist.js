/**
 * 紀錄保存：走 Playgrounds 宿主的 `/api/kv`。
 * 這裡是唯一的權威來源；沒有宿主（直接開檔／離線）時就退回一場性的預設值。
 */

export const PROGRESS_KEY = "/api/kv/pg-foodcatch:progress";

export const EMPTY_PROGRESS = {
  bestGoal: 0,
  bestEndless: 0,
  bestCombo: 0,
  plays: 0,
  wins: 0,
  sound: true,
  updatedAt: null,
};

/** 把一局的結果折進既有紀錄。純函式，方便測。 */
export function mergeProgress(previous, run = {}, now = new Date()) {
  const base = { ...EMPTY_PROGRESS, ...(previous ?? {}) };
  const score = Number(run.score) || 0;
  const endless = run.mode === "endless";
  return {
    ...base,
    bestGoal: endless ? base.bestGoal : Math.max(base.bestGoal, score),
    bestEndless: endless ? Math.max(base.bestEndless, score) : base.bestEndless,
    bestCombo: Math.max(base.bestCombo, Number(run.bestCombo) || 0),
    plays: base.plays + 1,
    wins: base.wins + (run.outcome === "won" ? 1 : 0),
    updatedAt: now.toISOString(),
  };
}

export async function loadProgress(fetcher = fetch) {
  try {
    const response = await fetcher(PROGRESS_KEY);
    if (!response?.ok) return { ...EMPTY_PROGRESS };
    const text = await response.text();
    if (!text) return { ...EMPTY_PROGRESS };
    return { ...EMPTY_PROGRESS, ...JSON.parse(text) };
  } catch {
    return { ...EMPTY_PROGRESS };
  }
}

export async function saveProgress(progress, fetcher = fetch) {
  try {
    await fetcher(PROGRESS_KEY, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(progress),
    });
  } catch {
    // 沒有宿主或離線：不擋玩家，下次再寫。
  }
  return progress;
}
