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
  "DA-014_night_cart": "只有看過打鐵鋪劍坯的人會遇到(3 天後,一次性)",
  "DA-015_bow_returned": "只有看過樵夫牆上那張弓的人會遇到(3 天後,一次性)",
  "FO-007_go_regret": "只有看破過殘局套路的人會遇到(3 天後,一次性)",
  "CH-011_seventh_fair": "只有聽出碼頭暗語的人會遇到(3 天後,一次性)",
  "DA-016_beneath_board": "走商路的人更常遇到(可重複)",
  "CH-012_shrine_night": "哪條路都會遇到(可重複)",
  "DU-007_ring_toss": "走商路的人更常遇到(可重複)",
  "DU-008_laundry_chase": "走水路的人更常遇到(可重複)",
  "CH-013_blind_woman": "哪條路都會遇到(一次性)",
  "FO-008_eave_bells": "走山路的人更常遇到(可重複)",
  "DA-017_old_courier": "哪條路都會遇到(可重複)",
  "DA-018_night_traveler": "哪條路都會遇到(可重複)",
  "DA-019_kids_kungfu": "哪條路都會遇到(可重複)",
  "CH-014_faked_injury": "哪條路都會遇到(可重複)",
  "CH-015_porter_back": "哪條路都會遇到(可重複)",
  "CH-016_dice_stall": "走商路的人更常遇到(可重複)",
  "DU-009_footrace": "哪條路都會遇到(可重複)",
  "DU-010_chicken_chase": "哪條路都會遇到(可重複)",
  "FO-009_broken_stele": "哪條路都會遇到(可重複)",
  "FO-010_shooting_star": "哪條路都會遇到(可重複)",
  "CH-017_east_village": "只有看過打鐵鋪劍坯、又撞見夜裝騾車的人會遇到(3 天後,一次性)",
  "CH-018_south_bridge": "只有初七在集上把事情看明白的人會遇到(3 天後,一次性)",
  "CH-019_boy_returns": "只有聽過少年那句「我去找你」的人會遇到(45 天後——他得先把債一筆一筆還完,一次性)",
  "FO-011_coin_keeper": "只有聽茶棚老闆講過灰衣人的人會遇到(一次性)",
  "DU-011_challenge_seeker": "俠名遠播之後才會遇到(偶爾重複)",
  "CH-020_water_dispute": "俠名遠播之後才會遇到(一次性)",
  "CH-021_impostor": "俠名遠播之後才會遇到(一次性)",
  "CH-022_storyteller_you": "俠名遠播之後才會遇到(可重複)",
  "CH-023_kneeling_boy": "俠名遠播之後才會遇到(一次性)",
  "CH-024_name_escort": "俠名遠播之後才會遇到(一次性)",
  "CH-025_new_scale": "只有當年管過米行那桿秤的人會遇到(20 天後——換秤掛招牌要日子,一次性)",
  "DU-012_diving_rematch": "只有上回贏過摸江底的人會遇到(45 天後——他練了一個多月,一次性)",
  "CH-026_basket_siblings": "走山路的人更常遇到(一次性)",
  "FO-012_one_coin_fortune": "哪條路都會遇到(一次性)——結語依你的命格而不同",
  "EN-001_pei_sparring": "很稀有的遭遇(約五到七天可能一件)。輸贏都有收穫",
  "EN-002_liu_fox": "很稀有的遭遇。帶著傷遇到她,開場整個不同",
  "EN-003_su_two_selves": "很稀有的遭遇。每次遇到擲骰:醒六成/醉四成,是兩個不同的她",
  "EN-004_shi_day_night": "很稀有的遭遇。你現實中幾點玩,決定遇到哪個人格(白天郎中/夜裡史夜)",
  "EN-005_zhan_tides": "很稀有的遭遇,水路更常見。他的心境五天一換:高潮/平潮/低潮三種深淺",
  "EN-006_table_stranger": "很稀有的遭遇(一次性)。她是誰,這件事不會告訴你",
  "EN-007_teller_of_xianren": "只有拼過桌的人會遇到(20 天後,一次性)——你會知道那天對面坐的是誰",
  "EN-008_zhan_names": "只有三種展孤舟都遇過的人會遇到(一次性)",
  "EN-009_fishing_elder": "很稀有的遭遇。他只跟無名的人搭話——出了名,反而虧",
  "EN-010_mad_scholar": "很稀有的遭遇。名頭在他這裡不好使",
  "EN-011_fate_gambler": "很稀有的遭遇。賭的是小事,看的是你的命",
  "EN-012_hong_gu": "很稀有的遭遇。衣裳不會說謊",
  "CH-027_taoist_story": "哪條路都會遇到(可重複)",
  "DA-020_road_measurer": "哪條路都會遇到(可重複)",
  "CH-028_shade_quarrel": "哪條路都會遇到(可重複)",
  "CH-029_hiccup_master": "哪條路都會遇到(可重複)",
  "CH-030_barber_blade": "走商路的人更常遇到(可重複)",
  "DU-013_lantern_riddle": "走商路的人更常遇到(可重複)",
  "DA-021_night_watchman": "走商路的人更常遇到(可重複)——耳力好的人會聽出蹊蹺",
  "DA-022_net_cat": "走水路的人更常遇到(可重複)",
  "DA-023_mute_ferryboy": "走水路的人更常遇到(可重複)",
  "CH-031_mountain_fog": "走山路的人更常遇到(可重複)——聽過樵夫那句話的人多一條路",
  "DU-014_monkey_persimmon": "走山路的人更常遇到(可重複)",
  "CH-032_shrine_lots": "走山路的人更常遇到(可重複)",
  "BJ-000_veteran_map": "只在洛陽遇到(一次性)——北疆的圖從這裡來",
  "BJ-001_yanmen_arrive": "到了雁門關才會遇到(可重複)",
  "BJ-002_names_on_wall": "到了雁門關才會遇到(可重複)",
  "BJ-003_archery_ground": "到了邊軍將門才會遇到(可重複)",
  "BJ-004_wenren_gui": "北疆境內的稀有遭遇——榜上第十九,在北疆打聽一個地方",
  "BJ-005_xiao_ruins": "到了蕭家軍舊址才會遇到(可重複)",
  "BJ-006_swept_snow": "只有去過舊址的人會遇到(20 天後,一次性)",
  "BJ-007_bow_maker": "到了缺月弓廬才會遇到(可重複)",
  "BJ-008_horse_milk": "北疆境內都會遇到(可重複)",
  "BJ-009_beacon": "北疆境內都會遇到(可重複)",
  "BJ-010_bow_owner": "只有在弓廬聽過斷弓來歷的人會遇到(10 天後,回洛陽,一次性)",
  "BJ-011_the_town": "只有遇過那位打聽地方的人會遇到(15 天後,在中原境內,一次性)",
  "BJ-012_bring_word": "找到那個地方之後,回北疆才會遇到(10 天後,一次性)",
  "ZY-001_home_town": "回到中原小鎮才會遇到(可重複)",
  "ZY-002_notice_wall": "回到中原小鎮才會遇到(可重複)",
  "ZY-003_ferry_wait": "到了臨江渡才會遇到(可重複)",
  "ZY-004_dock_ledger": "到了臨江渡才會遇到(可重複)",
  "ZY-005_kongtong_gate": "到了崆峒派山門才會遇到(可重複)",
  "ZY-006_old_man_kongtong": "崆峒山門的稀有遭遇——榜上第三十,坐在石階上歇氣",
  "ZY-007_yunling_charcoal": "到了雲嶺才會遇到(可重複)",
  "ZY-008_yunling_trap": "到了雲嶺才會遇到(可重複)",
  "ZY-009_duanyun_fog": "到了斷雲崗才會遇到(可重複)——你只會拿到問題",
  "ZY-010_duanyun_oil": "上過斷雲崗的人,10 天後再上崗會遇到(一次性)",
  "JN-010_sect_backyard": "到了江南劍宗才會遇到(稀有,可重複)——後山偏院,兩個人的位子",
  "JN-011_morning_drill": "到了江南劍宗才會遇到(可重複)",
  "JN-012_unfinished_tune": "清弦閣的稀有遭遇——榜上第二十五,一段開頭彈了十一年",
  "JN-013_gate_boy_hum": "到了清弦閣才會遇到(可重複)",
  "JN-014_next_table": "到了醉仙樓才會遇到(可重複)——聽得懂的人,別急著開口",
  "JN-015_stone_no_ripple": "到了鏡湖才會遇到(可重複)",
  "JN-016_night_market_song": "到了揚州才會遇到(可重複)——遇過渡口那位琴師的人多一句話",
  "JN-017_plum_rain": "江南境內都會遇到(可重複)",
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
for (const id of ["DA-001_teahouse_storyteller", "DA-002_sugar_figurine", "DA-003_rain_shelter", "DA-004_herb_gatherer", "CH-001_cheat_scale", "CH-002_street_duel", "DU-001_arm_wrestle_dock", "DU-002_wandering_staff", "FO-001_cliff_herb", "FO-002_night_flute", "CH-010_peddler_cart", "DA-013_censor_passing", "CH-012_shrine_night", "CH-013_blind_woman", "DA-017_old_courier", "DA-018_night_traveler", "DA-019_kids_kungfu", "CH-014_faked_injury", "CH-015_porter_back", "CH-027_taoist_story", "DA-020_road_measurer", "CH-028_shade_quarrel", "CH-029_hiccup_master", "DU-009_footrace", "DU-010_chicken_chase", "FO-009_broken_stele", "FO-010_shooting_star", "CH-019_boy_returns", "FO-012_one_coin_fortune"]) {
  renderEvent(events.pool.find((e) => e.eventId === id));
}

P("\n---");
P("## 五、隨機池・商路(三岔口選「走東」的人更常遇到)");
for (const id of ["DA-005_teatime_gossip", "DA-007_tightrope_walker", "CH-003_drunkard_stall", "DA-009_old_tune", "DA-011_blacksmith", "CH-008_lost_child", "DU-005_teahouse_go", "DA-014_night_cart", "FO-007_go_regret", "DA-016_beneath_board", "DU-007_ring_toss", "CH-016_dice_stall", "CH-017_east_village", "CH-025_new_scale", "CH-030_barber_blade", "DU-013_lantern_riddle", "DA-021_night_watchman"]) {
  renderEvent(events.pool.find((e) => e.eventId === id));
}

P("\n---");
P("## 六、隨機池・水路(選「走南」的人更常遇到)");
for (const id of ["CH-004_overloaded_ferry", "DU-003_river_diving", "FO-004_night_fishfire", "DA-008_ferry_repaid", "CH-006_ferry_grudge", "CH-007_wine_errand", "DA-010_dock_talk", "CH-009_letter_writing", "FO-006_sunken_bell", "CH-011_seventh_fair", "DU-008_laundry_chase", "CH-018_south_bridge", "DU-012_diving_rematch", "DA-022_net_cat", "DA-023_mute_ferryboy"]) {
  renderEvent(events.pool.find((e) => e.eventId === id));
}

P("\n---");
P("## 七、隨機池・山路(選「走西」的人更常遇到)");
for (const id of ["DA-006_woodsman_night", "CH-005_landslide", "DU-004_hunter_archery", "FO-003_mist_lantern", "DA-012_rain_pavilion", "DU-006_runaway_mule", "FO-005_sea_of_clouds", "DA-015_bow_returned", "FO-008_eave_bells", "FO-011_coin_keeper", "CH-026_basket_siblings", "CH-031_mountain_fog", "DU-014_monkey_persimmon", "CH-032_shrine_lots"]) {
  renderEvent(events.pool.find((e) => e.eventId === id));
}

P("\n---");
P("## 八、出名之後才會遇到的(俠名不到,這些事根本不會發生)");
P("");
P("你的俠名練到**俠名遠播**那一階,江湖對你的態度就變了——底下這些事,只找有名字的人。");
for (const id of ["DU-011_challenge_seeker", "CH-020_water_dispute", "CH-021_impostor", "CH-022_storyteller_you", "CH-023_kneeling_boy", "CH-024_name_escort"]) {
  renderEvent(events.pool.find((e) => e.eventId === id));
}

P("\n---");
P("## 中原各地(走到那裡才會遇到的事)");
P("");
P("中原是起點,也是你回得去的地方。這些事只在特定地方發生——走到了,才遇得到。");
for (const id of ["ZY-001_home_town", "ZY-002_notice_wall", "ZY-003_ferry_wait", "ZY-004_dock_ledger", "ZY-005_kongtong_gate", "ZY-006_old_man_kongtong", "ZY-007_yunling_charcoal", "ZY-008_yunling_trap", "ZY-009_duanyun_fog", "ZY-010_duanyun_oil"]) {
  renderEvent(events.pool.find((e) => e.eventId === id));
}

P("\n---");
P("## 江南各地(要先拿到江南的輿圖)");
P("");
P("水道穿城、橋比路多。這裡的人把差一點當失敗,把菜名當暗號,把一面湖當祖傳的祕密。");
for (const id of ["JN-010_sect_backyard", "JN-011_morning_drill", "JN-012_unfinished_tune", "JN-013_gate_boy_hum", "JN-014_next_table", "JN-015_stone_no_ripple", "JN-016_night_market_song", "JN-017_plum_rain"]) {
  renderEvent(events.pool.find((e) => e.eventId === id));
}

P("\n---");
P("## 北疆(要先拿到關防圖、歷練也夠,才走得到)");
P("");
P("風大、話少、規矩硬。北邊的人不比劍,比誰的弓拉得久。");
for (const id of ["BJ-000_veteran_map", "BJ-001_yanmen_arrive", "BJ-002_names_on_wall", "BJ-003_archery_ground", "BJ-004_wenren_gui", "BJ-005_xiao_ruins", "BJ-006_swept_snow", "BJ-007_bow_maker", "BJ-008_horse_milk", "BJ-009_beacon", "BJ-010_bow_owner", "BJ-011_the_town", "BJ-012_bring_word"]) {
  renderEvent(events.pool.find((e) => e.eventId === id));
}

P("\n---");
P("## 九、路上遇到的人(遭遇——很稀有,榜上的人真的會出現)");
P("");
P("百強不只是榜文上的名字。走著走著,你可能真的遇到他們——大約五到七天才可能碰上一件,遇到誰看緣分。同一個人可以遇到很多次,關係是攢出來的。");
for (const id of ["EN-001_pei_sparring", "EN-002_liu_fox", "EN-003_su_two_selves", "EN-004_shi_day_night", "EN-005_zhan_tides", "EN-006_table_stranger", "EN-007_teller_of_xianren", "EN-008_zhan_names", "EN-009_fishing_elder", "EN-010_mad_scholar", "EN-011_fate_gambler", "EN-012_hong_gu"]) {
  renderEvent(events.pool.find((e) => e.eventId === id));
}

P("\n---");
P("## 十、事件之外的劇情(提醒)");
P("");
P("- **天賦耳語**(23 句):極端命格的人,約千分之一機率在事件裡多讀到一句「世界對你的異樣反應」(你自己定稿的那批)");
P("- **狀態敘事**(6 種):血量/內力/體力掉到警戒線時的四段式文案(已入庫,UI 接線在待辦)");
P("- **監使頒號**(6 段):六維第一次練到 Lv.10 時,司天監找上門的六種場景(已入庫,頒號事件流在待辦)");

console.log(out.join("\n"));
