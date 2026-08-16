# 接食材（Food Catch）

一個菜籃、一桌美食從天而降。接住食物得分、躲開壞掉的番茄！街機式反應遊戲。

也可當作 [Playgrounds（遊樂場）](https://play.samkuo.me/) 的 **SAM**（`index.html` 入口）。

## 一鍵開 SAM 小

```
https://play.samkuo.me/?open=sampot/pg-foodcatch&name=接食材&fresh=1
```

同源會重用本機已匯入的沙盒；要強制新建可加 `&fresh=1`。

## 試玩（本機）

```bash
npx --yes http-server .
# 或
python3 -m http.server 8080
```

點按鈕或鍵盤操作後音效才會出聲。

## 玩法

1. 選擇 **目標賽**（90 秒內拿 1500 分）或 **無盡模式**，再按「開始遊戲」。
2. 拖曳畫面、按住左右觸控鈕，或用 `←`／`→`（`A`／`D`）控制 **菜籃**。
3. 接住掉下來的**好食材**：+10 分起；每連續接中 4 個，倍率提高一級，最高 ×5。
4. 接到**壞番茄／魚骨**或漏接好食材：扣 1 命、連擊歸零；壞食材落地則安全。
5. 金色生日蛋糕值 50 分並補 1 命（最多 5 命）。
6. 每 20 秒升級，掉得更快、更密，壞食材比例也會上升。

> 目標賽達到 1500 分即獲勝；無盡模式沒有時間限制，直到生命耗盡結算。

## 操作

- **觸控／滑鼠**：在畫面上左右拖曳，或按住畫面下方的左右鈕。
- **鍵盤**：`←`／`→` 或 `A`／`D` 移動；空白鍵／`Esc` 暫停。

## 技術

- `game.js`：純函式邏輯（掉落、接取判定、計分連擊、難度、生命）。
- `app.js`：Canvas 渲染 ＋ requestAnimationFrame 遊戲循環。
- `audio.js`：播放 `assets/audio/` 內實際收錄的 Kenney 音效與結算短曲。
- 目標賽／無盡最高分、最長連擊、場次、勝場與音效設定存入 `/api/kv`。

## 授權

- 程式碼：MIT（見 `LICENSE`）。
- 食物美術：Kenney.nl — Food Kit（CC0，見 `assets/food/`）。
- 粒子：Kenney.nl — Particle Pack（CC0，見 `assets/particles/`）。
- 音效／短曲：Kenney.nl — Impact Sounds、Interface Sounds、Music Jingles（CC0）。
- 詳細署名見 `ATTRIBUTION.md`。