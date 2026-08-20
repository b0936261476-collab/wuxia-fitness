// NPC 榜單名冊(v2 總綱 §9.5 / §9.7)
// 純邏輯、無 DOM。百強具名資料在 data/npcs.json(內容權威來源見該檔 note),
// 本檔案負責:①依排名帶生成 levelSum(§9.7.3/§9.7.7) ②玩家排名/百分位估算(§9.7.1/§8.1)。

/**
 * 依 rankBandLevelSum(data/npcs.json)算出某排名的基準 levelSum,
 * 帶內線性插值(排名帶內數字較小=排名較後=levelSum較低)。
 * @param {number} rank 1~100
 * @param {object} bands data.npcs.rankBandLevelSum
 * @returns {number}
 */
export function bandLevelSum(rank, bands) {
  for (const [key, range] of Object.entries(bands)) {
    if (key === "note") continue;
    const [lo, hi] = range;
    if (key.includes("-")) {
      const [a, b] = key.split("-").map(Number);
      if (rank >= a && rank <= b) {
        const t = b === a ? 0 : (rank - a) / (b - a);
        return hi - t * (hi - lo); // 帶內排名數字越大(越後面)→越接近lo
      }
    } else if (Number(key) === rank) {
      return lo; // 單一排名的帶,lo===hi
    }
  }
  throw new Error(`排名 ${rank} 不在任何已定義的排名帶內`);
}

/** ±3% 抖動(§9.7.7),rng 可注入以利測試 */
export function jitteredLevelSum(baseLevelSum, rng = Math.random) {
  const jitter = 1 + (rng() * 2 - 1) * 0.03;
  return baseLevelSum * jitter;
}

/**
 * 生成第 rank 名的 levelSum(帶內插值+±3%抖動,§9.7.7)。
 */
export function generateNpcLevelSum(rank, bands, rng = Math.random) {
  return jitteredLevelSum(bandLevelSum(rank, bands), rng);
}

/**
 * 萬人總冊排名→levelSum 反推曲線(§9.7.1)。總綱只給了幾個錨點,不是連續公式:
 *   rank1↔1200(§9.7.3)、rank100↔165(§9.7.3 91-100帶中點)、
 *   rank1000↔60(§9.7.1「總冊九成人levelSum<60」反推:9000人在後90%,故第1000名是60的分界)、
 *   rank9000↔0(§9.7.1「玩家創角起始排名9,000開外」,新角色levelSum≈0)。
 * ⚠️ rank>100 的曲線形狀是本檔案依這些錨點做的假設(線性插值),不是總綱給的公式;
 * 只用於 Phase 1 的排名估算/整數關口播報,不影響百強本身的數值(那些照 rankBandLevelSum 精確生成)。
 */
const TAIL_ANCHORS = [
  { rank: 100, levelSum: 165 },
  { rank: 1000, levelSum: 60 },
  { rank: 9000, levelSum: 0.5 },
  { rank: 10000, levelSum: 0 }
];

/** 依萬人總冊錨點,反推「levelSum → 約略排名」(用於玩家排名估算,非精確值)。 */
export function estimateRankForLevelSum(levelSum, bands, ledgerSize = 10000) {
  if (levelSum >= bandLevelSum(1, bands)) return 1;
  for (let rank = 1; rank <= 100; rank++) {
    if (levelSum >= bandLevelSum(rank, bands)) return rank;
  }
  for (let i = 0; i < TAIL_ANCHORS.length - 1; i++) {
    const a = TAIL_ANCHORS[i];
    const b = TAIL_ANCHORS[i + 1];
    if (levelSum <= a.levelSum && levelSum >= b.levelSum) {
      if (a.levelSum === b.levelSum) return a.rank;
      const t = (a.levelSum - levelSum) / (a.levelSum - b.levelSum);
      return Math.round(a.rank + t * (b.rank - a.rank));
    }
  }
  return ledgerSize;
}

/** 依排名算百分位(贏過多少比例的人,0~1),§8.1 群俠錄用 */
export function percentileForRank(rank, ledgerSize = 10000) {
  return 1 - (rank - 1) / ledgerSize;
}

/** §8.1 群俠錄八階,回傳 tierIndex(對應 data/titles.json ranking.tiers 的索引) */
export function rankingTierIndexForPercentile(percentile, isRank1 = false) {
  if (isRank1) return 7; // rank1
  if (percentile >= 0.999) return 6; // top01
  if (percentile >= 0.99) return 5;  // top1
  if (percentile >= 0.95) return 4;  // top5
  if (percentile >= 0.80) return 3;  // top20
  if (percentile >= 0.50) return 2;  // top50
  return 1; // bottom50
}

/**
 * 玩家目前排名快照(§9.7.1/§8.1整合入口)。
 * @param {number} playerLevelSum
 * @param {object} npcsData  data/npcs.json
 * @returns {{rank:number, percentile:number, tierIndex:number}}
 */
export function playerRankSnapshot(playerLevelSum, npcsData) {
  const ledgerSize = npcsData.totalLedger?.size ?? 10000;
  const rank = estimateRankForLevelSum(playerLevelSum, npcsData.rankBandLevelSum, ledgerSize);
  const percentile = percentileForRank(rank, ledgerSize);
  const tierIndex = rankingTierIndexForPercentile(percentile, rank === 1);
  return { rank, percentile, tierIndex };
}

/** 依排名找出對應的具名 NPC 資料(若排名 > 100,回 null,對應到萬人總冊無名記錄) */
export function namedNpcAtRank(rank, npcsData) {
  return npcsData.top100.find((n) => n.rank === rank) ?? null;
}

// ---------- §9.9 排位互動系統 ----------

/**
 * 萬人區(#101後)整數關口播報:每熔過 step(預設500)名一則(§9.9)。
 *
 * 「跨過」的定義是 prevRank > m 且 newRank <= m ——名次剛好停在關口上也算跨過,
 * 因為 §9.9 的播報詞就是「群俠錄第 4,500 位——你的名字往前挪了」,說的是你現在站在哪。
 * (先前寫成嚴格 m > newRank,結果剛好停在關口上的那一次不播,而下一次算 highest 時
 *  又已經把這道關口跳過去了,等於整道關口永遠不會播報。)
 *
 * @returns {number[]} 由高到低排序,本次跨越的所有整數關口(可能一次跨多個)
 */
export function integerMilestonesCrossed(prevRank, newRank, step = 500) {
  if (newRank >= prevRank) return [];
  const milestones = [];
  const highest = Math.floor((prevRank - 1) / step) * step; // 小於 prevRank 的最大關口
  for (let m = highest; m >= newRank && m >= step; m -= step) {
    milestones.push(m);
  }
  return milestones;
}

/** 本次排名提升所超越的具名NPC清單(§9.9,rank數字變小=名次變好) */
export function surpassedNpcs(prevRank, newRank, npcsData) {
  if (newRank >= prevRank) return [];
  return npcsData.top100.filter((npc) => npc.rank >= newRank && npc.rank < prevRank);
}

/**
 * 你上頭最近的一位具名對手(第 rank-1 名)。
 * 已是天下第一、或還沒擠進百強時回 null(百強外沒有具名對手,那一段看整數關口)。
 */
export function nextNamedNpcAbove(rank, npcsData) {
  if (rank <= 1) return null;
  return namedNpcAtRank(rank - 1, npcsData);
}

/**
 * 萬人區下一個整數關口(§9.9,每 step 名一道坎)。
 * 已經在第一道坎之內(rank <= step)時回 null——那時候該看的是百強,不是關口。
 */
export function nextIntegerMilestone(rank, step = 500) {
  if (rank <= step) return null;
  return Math.floor((rank - 1) / step) * step;
}

/** 超越檔位分類(§9.9三檔):十強走深度互動、⚠存疑者走特殊檔、其餘普通檔 */
export function surpassTier(npc) {
  if (npc.rank <= 10) return "top10";
  if (npc.flags?.includes("disputed")) return "special";
  return "normal";
}

/**
 * 超越獎勵的俠名量(§9.9「榜位越前越多」,未給精確公式)。
 * ⚠️ 假設:線性,第100名+1,第1名+50,實裝期應依標準玩家聲望曲線校準。
 */
export function surpassFameReward(rank) {
  return Math.round(1 + (100 - rank) * (49 / 99));
}
