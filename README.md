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

1. 按「開始」，移動手指／滑鼠（或 ← → 鍵）控制 **菜籃**。
2. 接住掉下來的**食物**：+10 分起，連續接中分數加倍。
3. 碰到**壞掉的番茄**（炸彈）：扣 1 命、連擊歸零。
4. **漏接**食物也會中斷連擊。
5. 每 20 秒升級，掉速加快；3 條命用完即結束，挑戰最高分。

> 高手祕技：同一種食物連續接中，combo 加成會讓分數飛快成長。

## 操作

- **觸控／滑鼠**：在畫面上左右滑動移動菜籃。
- **鍵盤**：`←`／`→` 移動。

## 技術

- `game.js`：純函式邏輯（掉落、接取判定、計分連擊、難度、生命）。
- `app.js`：Canvas 渲染 ＋ requestAnimationFrame 遊戲循環。
- `audio.js`：優先播放 `assets/audio/` 的 Kenney 衝擊音，失敗退回 Web Audio 合成。
- 最高分存 `/api/kv`（Playgrounds KV）。

## 授權

- 程式碼：MIT（見 `LICENSE`）。
- 食物美術：Kenney.nl — Food Kit（CC0，見 `assets/food/`）。
- 粒子：Kenney.nl — Particle Pack（CC0，見 `assets/particles/`）。
- 音效：Kenney.nl — Impact Sounds（CC0，見 `assets/audio/`）。
- 詳細署名見 `ATTRIBUTION.md`。