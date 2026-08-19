# 一步一江湖 — 武林運動模擬器

玩家是武林中的小蝦米,透過真實運動累積六維武學能力(內功、輕功、硬功、軟功、眼功、耳功),透過日常走路步數推進江湖路並觸發劇情事件。用遊戲化維持運動動機。

完整設計見 [一步一江湖-完整規格書.md](./一步一江湖-完整規格書.md)。

## 兩條完全獨立的資源線

| 資源線 | 來源 | 用途 |
|---|---|---|
| 六維經驗值 | 主動記錄的 26 項運動 | 提升六項基本功等級,解鎖稱號 |
| 行動力(步數) | 手動輸入手機計步資料 | 每滿 1000 步觸發一次事件,推進江湖劇情 |

## 執行

純靜態網頁,無建置步驟。因為以 `fetch` 載入資料檔,需用本機伺服器開啟(不能直接雙擊 `index.html`):

```bash
npm run serve
```

然後開 <http://localhost:5173>。部署則直接丟 GitHub Pages 即可。

## 測試

```bash
npm test
```

以 Node 內建 test runner 驗證計算引擎:遞減分段(含規格書 §3 範例數字)、拆單防洗分、等級門檻、成功率夾限、支線流程、debuff 與物品等。

## 專案結構

```
data/
  exercises.json   ← 27 項運動的六維權重與遞減階梯(v2 §3)
  events.json      ← 事件庫:隨機事件 + 支線「藏鋒山門」4 階段(v2 §6),check.benchmarkLevel 對接標籤引擎
  titles.json      ← 群俠錄 + 武道里程碑雙稱號表(v2 §8;里程碑仍為經驗值門檻,待改等級門檻,見待辦)
  items.json       ← 物品與 debuff 清單
  tags.json        ← 標籤字典 tagRegistry(v2 §0),M2 標籤引擎的地基
  triggers.json    ← 觸發器註冊表(v2 §9),PRIORITY_INTERRUPT/NARRATIVE_INJECT 種子資料
  quiz.json        ← 心理測驗創角題庫種子(v2 §1.2)
  whispers.json    ← 天賦耳語文案池種子(v2 §8.6)
  npcs.json        ← 百強種子 + 萬人總冊生成參數(v2 §9.5/§9.7)
  reputation.json  ← 聲望階層門檻/評價矩陣(v2 §9.6)
src/
  engine/          ← 純邏輯計算引擎(無 DOM,Node 可直接測試)
    decay.js       ← 單日累積分階遞減
    exp.js         ← 等級門檻、里程碑
    tags.js        ← v2 §0.3 標籤判定引擎(唯一判定公式 + 疊加防爆三保險)
    triggers.js    ← v2 §9 觸發器優先序、NARRATIVE_INJECT 機率/冷卻判定
    check.js       ← ⚠️ 舊版判定公式,已被 tags.js 取代,保留供歷史對照
    game.js        ← 狀態與遊戲動作(練功、步數、事件、物品)
    storage.js     ← localStorage 存檔
  ui/              ← 介面(vanilla JS + CSS)
tests/             ← 引擎測試(含 tags.test.mjs:標籤引擎與觸發器優先序)
index.html
```

> 完整設計依據見 [一步一江湖_設計總綱_v2.md](./一步一江湖_設計總綱_v2.md)(Claude Code 開工唯一依據文件)。

數值全部放在 `data/` 資料檔,調平衡不動程式碼。

## 開發進度

- [x] **Phase 1 單機版**:計算引擎 + 運動記錄 UI + 步數輸入 + 事件觸發(20 個隨機事件 + 1 條支線)
- [ ] **Phase 2 群俠錄**:後端共享資料,排行榜與百分位稱號
- [ ] **Phase 3 內容擴充**:更多事件、支線、物品、debuff 種類
