import { describe, it, expect, vi } from "vitest";
import {
  EMPTY_PROGRESS,
  PROGRESS_KEY,
  loadProgress,
  mergeProgress,
  saveProgress,
} from "./persist.js";

describe("mergeProgress", () => {
  it("只往上更新最佳紀錄", () => {
    const previous = { ...EMPTY_PROGRESS, bestGoal: 900, bestEndless: 4000, bestCombo: 30 };
    const merged = mergeProgress(previous, {
      mode: "goal",
      score: 100,
      bestCombo: 5,
      outcome: "lost",
    });
    expect(merged.bestGoal).toBe(900);
    expect(merged.bestEndless).toBe(4000);
    expect(merged.bestCombo).toBe(30);
  });

  it("破紀錄時寫入新高分，並分開記兩種模式", () => {
    const merged = mergeProgress(EMPTY_PROGRESS, {
      mode: "endless",
      score: 2400,
      bestCombo: 18,
      outcome: "lost",
    });
    expect(merged.bestEndless).toBe(2400);
    expect(merged.bestGoal).toBe(0);
    expect(merged.bestCombo).toBe(18);
  });

  it("累計場次與勝場，並蓋上時間戳", () => {
    const once = mergeProgress(EMPTY_PROGRESS, { mode: "goal", score: 1500, outcome: "won" }, new Date(0));
    expect(once.plays).toBe(1);
    expect(once.wins).toBe(1);
    expect(once.updatedAt).toBe(new Date(0).toISOString());

    const twice = mergeProgress(once, { mode: "goal", score: 10, outcome: "lost" });
    expect(twice.plays).toBe(2);
    expect(twice.wins).toBe(1);
  });

  it("殘缺或 null 的舊紀錄不會炸，會補回預設欄位", () => {
    const merged = mergeProgress(null, {});
    expect(merged).toMatchObject({ bestGoal: 0, bestEndless: 0, plays: 1, wins: 0 });
    expect(merged.sound).toBe(true);
  });
});

describe("loadProgress", () => {
  it("讀得到就把 JSON 併進預設值", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ bestGoal: 1500, sound: false }),
    }));
    const progress = await loadProgress(fetcher);
    expect(fetcher).toHaveBeenCalledWith(PROGRESS_KEY);
    expect(progress.bestGoal).toBe(1500);
    expect(progress.sound).toBe(false);
    expect(progress.plays).toBe(0);
  });

  it("沒有 KV（404／離線）就回預設值，不丟例外", async () => {
    expect(await loadProgress(async () => ({ ok: false }))).toEqual(EMPTY_PROGRESS);
    expect(
      await loadProgress(async () => {
        throw new Error("offline");
      }),
    ).toEqual(EMPTY_PROGRESS);
  });

  it("內容壞掉也回預設值", async () => {
    const progress = await loadProgress(async () => ({ ok: true, text: async () => "not json" }));
    expect(progress).toEqual(EMPTY_PROGRESS);
  });
});

describe("saveProgress", () => {
  it("以 PUT 寫回 /api/kv", async () => {
    const fetcher = vi.fn(async () => ({ ok: true }));
    const progress = { ...EMPTY_PROGRESS, bestGoal: 1500 };
    await saveProgress(progress, fetcher);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(PROGRESS_KEY);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body).bestGoal).toBe(1500);
  });

  it("寫入失敗時安靜吞掉，遊戲照常繼續", async () => {
    const progress = { ...EMPTY_PROGRESS };
    await expect(
      saveProgress(progress, async () => {
        throw new Error("offline");
      }),
    ).resolves.toBe(progress);
  });
});
