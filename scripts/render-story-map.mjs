// 全事件劇情分支總覽生成器(玩家視角,零術語)
// 從 data/events.json 直接生成,保證與實際遊戲內容一字不差。
// 用法:node scripts/render-story-map.mjs > 全劇情分支總覽.md

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const events = loadJson("data/events.json");
const items = loadJson("data/items.json");

const DIM = { qinggong: "輕功", neigong: "內功", yinggong: "硬功", ruangong: "軟功", yangong: "眼力", ergong: "耳朵" };
const TYPE = { daily: "見聞", choice: "抉擇", duel: "比試", fortune: "機緣" };
const TIER = { 3: "譽滿一方", 4: "俠名遠播", 5: "名動江湖" };

function itemName(id) { return items.items.find((i) => i.id === id)?.name ?? id; }

function fxText(fx) {
  if (!fx) return "";
  const out = [];
  if (fx.fame) out.push(`俠名+${fx.fame}`);
  if (fx.infamy) out.push(`惡名+${fx.infamy}`);
  if (fx.hpDamage) out.push(fx.hpDamage >= 1200 ? "受重傷" : fx.hpDamage >= 500 ? "傷得不輕" : "受點小傷");
  if (fx.mpDamage) out.push("內力受損");
  if (fx.tiliDamage) out.push("累了一場");
  if (fx.hpRestore) out.push(fx.hpRestore >= 1 ? "血量全滿" : "血量回復");
  if (fx.mpRestore) out.push(fx.mpRestore >= 1 ? "內力全滿" : "內力回復");
  if (fx.tiliRestore) out.push("體力回復");
  if (fx.itemGrant) out.push("獲得:" + Object.keys(fx.itemGrant).map(itemName).join("、"));
  if (fx.setFlags?.length) out.push("⚑ 江湖記下了這件事");
  return out.length ? `(${out.join(",")})` : "";
}

function judgeLabel(ev, c) {
  if (!c.judge) return "";
  if (c.judgeType === "fortune" || c.judgeType === "fortune_light") return "【看運氣】";
  const dims = (c.tags || []).map((t) => DIM[t]).join("或");
  let diff = "";
  if (c.benchmarkModifier < 0) diff = ",較容易";
  if (c.benchmarkModifier > 0) diff = ",較難";
  return `【比試:${dims}${diff}】`;
}

// 條件的白話說明(逐事件手寫,避免術語)
const COND_NOTE = {
  "DA-008_ferry_repaid": "只有當時讓位給抱藥婦人的人會遇到(3 天後,一次性)",
  "CH-006_ferry_grudge": "只有當時當眾揭穿艄公的人會遇到(3 天後,一次性)",
  "DA-009_old_tune": "只有遇過霧中燈籠老人的人會遇到(3 天後,一次性)",
  "CH-007_wine_errand": "只有喝過老漁夫魚湯的人會遇到(3 天後,一次性)",
  "DA-010_dock_talk": "只有那晚聽過漁歌的人會遇到(3 天後,一次性)",
  "DA-011_blacksmith": "走商路的人更常遇到(可重複)",
  "CH-008_lost_child": "走商路的人更常遇到(可重複)",
  "DU-005_teahouse_go": "走商路的人更常遇到(可重複)",
  "DA-012_rain_pavilion": "走山路的人更常遇到(可重複)",
  "DU-006_runaway_mule": "走山路的人更常遇到(可重複)",
  "FO-005_sea_of_clouds": "走山路的人更常遇到(可重複)",
  "CH-009_letter_writing": "走水路的人更常遇到(可重複)",
  "FO-006_sunken_bell": "走水路的人更常遇到(可重複)",
  "CH-010_peddler_cart": "哪條路都會遇到(可重複)",
  "DA-013_censor_passing": "哪條路都會遇到(可重複)——遇到監使,你會得知自己最新名次",
  "1-1_lost_purse": "誰都可能遇到(一次性)",
  "1-2_purse_notice": "只有「拿了錢袋沒還」的人會遇到——撿錢那天起 3 天後",
  "1-3_purse_earned": "只有選了「湊錢」的人會遇到——由你現實中的運動速度決定結局",
  "1-4_dock_boy": "只有「二度別過頭」的人會遇到——放棄湊錢 3 天後",
  "DA-005_teatime_gossip": "錢袋的事發生過之後(2 天後),走商路的人更常遇到(一次性)",
  "DA-006_woodsman_night": "走山路的人更常遇到",
  "DA-007_tightrope_walker": "走商路的人更常遇到",
  "CH-003_drunkard_stall": "走商路的人更常遇到",
  "CH-004_overloaded_ferry": "走水路的人更常遇到",
  "CH-005_landslide": "走山路的人更常遇到",
  "DU-003_river_diving": "走水路的人更常遇到",
  "DU-004_hunter_archery": "走山路的人更常遇到",
  "FO-003_mist_lantern": "走山路的人更常遇到",
  "FO-004_night_fishfire": "走水路的人更常遇到",
  "FO-001_cliff_herb": "只有聽過採藥老漢順口溜的人會遇到",
  "TU-000_setting_out": "創角後第一件事(固定)",
  "TU-001_leaving_village": "第二件事(固定)",
  "TU-002_forked_road": "第三件事(固定)——這個選擇會影響你之後常遇到什麼",
  "TU-003_bridge_dog": "新手期(一次性)",
  "TU-004_peddler_pouch": "新手期(一次性)",
  "TU-005_temple_night": "新手期(一次性)",
  "TU-006_notice_board": "新手期(一次性)"
};

const out = [];
const P = (s = "") => out.push(s);

function renderOutcome(label, o, indent = "") {
  if (!o) return;
  P(`${indent}- **${label}**:${(o.text || "").replace(/\n+/g, " ")} ${fxText(o.effects)}`);
  if (o.perceivedExtra) P(`${indent}  - ↳ 察覺過的人多讀到:${o.perceivedExtra.text} ${o.perceivedExtra.setFlags ? "(⚑)" : ""}`);
  if (o.crushExtra) P(`${indent}  - ↳ 境界高的人多讀到:${o.crushExtra.text} ${o.crushExtra.setFlags ? "(⚑)" : ""}`);
  if (o.extraPerception) P(`${indent}  - ↳ ${DIM[o.extraPerception.tag]}極好的人再多看見:${o.extraPerception.text}(⚑)`);
  if (o.fameVariants) {
    for (const [k, v] of Object.entries(o.fameVariants)) {
      const tier = TIER[k.match(/\d+/)?.[0]] ?? k;
      P(`${indent}  - ★ 出名之後(俠名「${tier}」以上)改為:${v.text} ${fxText(v.effects)}`);
    }
  }
  if (o.mergeInto) P(`${indent}  - → 之後接回選項 ${o.mergeInto} 的流程`);
  if (o.subChoices) {
    P(`${indent}  再選一次:`);
    for (const s of o.subChoices) {
      P(`${indent}  - ▸ ${s.text}`);
      renderOutcome("結果", s.result, indent + "    ");
    }
  }
}

function renderEvent(ev) {
  P(`\n### ${ev.title}(${TYPE[ev.eventType]})`);
  const note = COND_NOTE[ev.eventId];
  if (note) P(`*${note}*\n`);
  P(`**${ev.beats.qi.text}**`);
  if (ev.beats.qi.variants) {
    for (const [k, v] of Object.entries(ev.beats.qi.variants)) {
      const label = k === "injured" ? "帶傷時開場改為" : "特定經歷者開場改為";
      P(`> ${label}:${v}`);
    }
  }
  if (ev.beats.qi.fameVariants) {
    for (const [k, v] of Object.entries(ev.beats.qi.fameVariants)) {
      const tier = TIER[k.match(/\d+/)?.[0]] ?? k;
      P(`> ★ 出名之後(俠名「${tier}」以上)開場改為:${v.text}`);
    }
  }
  const p = ev.perception;
  if (ev.unperceivedVersion) P(`\n沒察覺的人,這件事只是:「${ev.unperceivedVersion.text}」——就這樣過去了。`);
  if (p?.revealText) P(`\n【${DIM[p.tag]}好的人察覺】${p.revealText} ${p.setFlags ? "(⚑)" : ""}`);
  if (p?.crushReveal) P(`\n【${DIM[p.crushReveal.threshold.tag]}極高的人再看穿一層】${p.crushReveal.text}`);
  P("");

  const choices = ev.beats.cheng.choices || [];
  const he = ev.beats.he;
  if (!choices.length) {
    if (he.byFate) {
      P("(無選項——接下來的一段,依你的命格不同)");
      const L = { genggu: "根骨好的人", wuxing: "悟性高的人", yunqi: "運氣好的人", default: "平平常常的人" };
      for (const [k, v] of Object.entries(he.byFate)) P(`- **${L[k] ?? k}**:${v}`);
      if (he.epilogue) P(`\n之後(所有人):${he.epilogue}`);
    } else if (he.byFlag) {
      P("(無選項——依你過去做過的事,聽到不同的版本)");
      for (const v of he.byFlag) renderOutcome(flagLabel(v.flags), v);
      renderOutcome("以上皆非(錢還沒還的人)", he.default);
    } else if (he.byOutcome) {
      P("(無選項——結局由你現實中的表現決定)");
      const L = { intime: "三天內天天練滿・趕上了", late: "漏了日子才湊齊・遲了", abandoned: "連續七天沒動・放棄了" };
      for (const [k, v] of Object.entries(he.byOutcome)) renderOutcome(L[k] ?? k, v);
    } else {
      renderOutcome("接下來", he);
    }
  } else {
    for (const c of choices) {
      if (c.autoWhenInsufficient) continue; // 金錢系統未上線,不會出現
      const gates = [];
      if (c.requirePerception) gates.push(`${DIM[ev.perception?.tag] ?? "察覺"}好的人才有`);
      if (c.requireCrush) gates.push("境界極高的人才有");
      const gate = gates.length ? `(${gates.join(",")})` : "";
      P(`▸ ${gate}${c.text} ${judgeLabel(ev, c)} ${c.setFlags ? "(⚑)" : ""}${c.startsLabor ? "(進入「湊錢中」:現實運動折算工錢)" : ""}`);
      const z = ev.beats.zhuan?.textByChoice?.[c.id];
      if (z) P(`  懸念:${z}`);
      const o = he.byChoice?.[c.id];
      if (!o) { P(""); continue; }
      if (o.success || o.fail) {
        renderOutcome("成功", o.success, "  ");
        renderOutcome("失敗", o.fail, "  ");
      } else {
        renderOutcome("結果", o, "  ");
      }
      P("");
    }
    if (he.byChoice) {
      for (const [k, o] of Object.entries(he.byChoice)) {
        if (o?.sharedEpilogue) P(`之後(走到「${k}」這條線的人都會讀到):${o.sharedEpilogue}\n`);
      }
    }
  }

  const v = ev.variants;
  if (v?.crush) P(`◆ **遠強於對手時**,整件事變成:${v.crush.text} ${fxText(v.crush.effects)}`);
  if (v?.awe) {
    P(`◆ **遠弱於對手時(險境)**,開場變成:${v.awe.qi}`);
    if (v.awe.zhuan) P(`  懸念:${v.awe.zhuan}`);
    renderOutcome("險境・成功(獎勵翻倍)", v.awe.he?.success, "  ");
    renderOutcome("險境・失敗(懲罰加重)", v.awe.he?.fail, "  ");
  }
  if (v?.fameVariant) {
    for (const [k, fv] of Object.entries(v.fameVariant)) {
      const tier = TIER[k.match(/\d+/)?.[0]] ?? k;
      if (fv.text) P(`★ 出名之後(俠名「${tier}」以上),整件事變成:${fv.text}`);
      else if (fv.qi) P(`★ 出名之後(俠名「${tier}」以上),開場變成:${fv.qi}`);
    }
  }
}

function flagLabel(flags) {
  const MAP = {
    "purse_repaid_intime": "你用汗水及時還清的",
    "purse_confessed": "你當面認了錯的",
    "purse_to_school": "你把錢送去學堂的",
    "purse_returned_anon|hidden_virtue_purse": "你半夜匿名還的",
    "purse_waited|purse_waited_night|purse_chased|purse_returned|purse_returned_lied": "你當初就還了的(好人版)",
    "boy_saved_mother": "你最後在碼頭把錢給了孩子的"
  };
  return MAP[flags] ?? flags;
}

// ---------- 文件結構 ----------

P("# 一步一江湖・全劇情分支總覽");
P("");
P("> 由遊戲資料直接生成,與實際玩到的內容一字不差。");
P("> 讀法:**粗體**=遊戲畫面|▸=選項|【比試】=要擲骰的|(⚑)=江湖悄悄記下這件事,日後可能有回響|★=出名後的變化|◆=實力差距太大時的變化");
P("");
P("---");
P("## 〇、開場:算命先生的十二問");
P("");
P("新玩家開局,村口算命先生問你 12 題(從 15 題裡隨機抽)。答案決定你看不見的三種天賦:**根骨、悟性、運氣**——全程不顯示數字,你只能從命格文案和往後的際遇裡「體感」自己是誰。答完他送你一句命格評語(共 26 種,例:「你啊……就是太普通了。普通,也好。」/「這孩子,是老天爺捏到一半,睡著了。」)");
P("");
P("---");
P("## 一、序章三連(固定順序,誰都會走)");

for (const id of ["TU-000_setting_out", "TU-001_leaving_village", "TU-002_forked_road"]) {
  renderEvent(events.pool.find((e) => e.eventId === id));
}

P("\n---");
P("## 二、新手教學四件(序章後混入隨機池,各遇一次)");
for (const id of ["TU-003_bridge_dog", "TU-004_peddler_pouch", "TU-005_temple_night", "TU-006_notice_board"]) {
  renderEvent(events.pool.find((e) => e.eventId === id));
}

P("\n---");
P("## 三、秦大嫂線(錢袋的階梯——一步一步走下去,或走回來)");
P("");
P("這是目前唯一的多階段故事線。走向:**官道拾金**(誰都會遇到)→ 吞了錢的人 3 天後遇到**尋物告示** → 選「湊錢」的人由現實運動決定**六兩湊齊之日**的結局 → 二度別過頭的人 3 天後在碼頭遇到**最後一扇門**。");
for (const id of ["1-1_lost_purse", "1-2_purse_notice", "1-3_purse_earned", "1-4_dock_boy"]) {
  renderEvent(events.pool.find((e) => e.eventId === id));
}

P("\n---");
P("## 四、隨機池・通用(哪條路都會遇到)");
for (const id of ["DA-001_teahouse_storyteller", "DA-002_sugar_figurine", "DA-003_rain_shelter", "DA-004_herb_gatherer", "CH-001_cheat_scale", "CH-002_street_duel", "DU-001_arm_wrestle_dock", "DU-002_wandering_staff", "FO-001_cliff_herb", "FO-002_night_flute", "CH-010_peddler_cart", "DA-013_censor_passing"]) {
  renderEvent(events.pool.find((e) => e.eventId === id));
}

P("\n---");
P("## 五、隨機池・商路(三岔口選「走東」的人更常遇到)");
for (const id of ["DA-005_teatime_gossip", "DA-007_tightrope_walker", "CH-003_drunkard_stall", "DA-009_old_tune", "DA-011_blacksmith", "CH-008_lost_child", "DU-005_teahouse_go"]) {
  renderEvent(events.pool.find((e) => e.eventId === id));
}

P("\n---");
P("## 六、隨機池・水路(選「走南」的人更常遇到)");
for (const id of ["CH-004_overloaded_ferry", "DU-003_river_diving", "FO-004_night_fishfire", "DA-008_ferry_repaid", "CH-006_ferry_grudge", "CH-007_wine_errand", "DA-010_dock_talk", "CH-009_letter_writing", "FO-006_sunken_bell"]) {
  renderEvent(events.pool.find((e) => e.eventId === id));
}

P("\n---");
P("## 七、隨機池・山路(選「走西」的人更常遇到)");
for (const id of ["DA-006_woodsman_night", "CH-005_landslide", "DU-004_hunter_archery", "FO-003_mist_lantern", "DA-012_rain_pavilion", "DU-006_runaway_mule", "FO-005_sea_of_clouds"]) {
  renderEvent(events.pool.find((e) => e.eventId === id));
}

P("\n---");
P("## 八、事件之外的劇情(提醒)");
P("");
P("- **天賦耳語**(23 句):極端命格的人,約千分之一機率在事件裡多讀到一句「世界對你的異樣反應」(你自己定稿的那批)");
P("- **狀態敘事**(6 種):血量/內力/體力掉到警戒線時的四段式文案(已入庫,UI 接線在待辦)");
P("- **監使頒號**(6 段):六維第一次練到 Lv.10 時,司天監找上門的六種場景(已入庫,頒號事件流在待辦)");

console.log(out.join("\n"));
