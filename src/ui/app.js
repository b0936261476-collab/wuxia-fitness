// UI 接線:載入資料檔、綁定操作、渲染畫面

import {
  logExercise, logSteps, pendingEventCount, startNextEvent, presentEvent,
  chooseOption, chooseSub, useItem, levels, createCharacter, MAX_DAILY_STEPS,
  resourcePercents, resourceMax, catchUpRecovery, attemptRebirthCompletion,
  playerLevelSum, revealRanking, effectiveNpcs, jianghuNews
} from "../engine/game.js";
import { collectNarratives } from "../engine/narratives.js";
import {
  ensureTravel, allLocations, locationById, provinceOf, distanceBetween,
  canTravelTo, setDestination, clearDestination, walked, remaining, checkArrival
} from "../engine/map.js";
import {
  namedNpcAtRank, nextNamedNpcAbove, nextIntegerMilestone,
  surpassTier, surpassFameReward, percentileForRank
} from "../engine/npcs.js";
import { reputationSnapshot } from "../engine/reputation.js";
import { rankingTitleForPercentile } from "../engine/titles.js";
import { SIX_TRIALS, isTrialComplete } from "../engine/rebirth.js";
import { levelProgress, milestoneTitle, DIMENSIONS } from "../engine/exp.js";
import { currentCoefficient } from "../engine/decay.js";
import { startTraining, stopTraining, cancelTraining, trainingElapsedMs } from "../engine/training.js";
import { loadState, saveState, exportSave, importSave, resetSave } from "../engine/storage.js";
import {
  initMedia, playBgm, playSfx, playAmbience, stopAmbience,
  eventImage, headerImage, quizImage, hasAnyBgm, isMuted, toggleMute
} from "./media.js";

const $ = (sel) => document.querySelector(sel);

const data = {};
let state;

const TYPE_LABELS = {
  daily: "日常見聞", choice: "抉擇分支", duel: "對決切磋", fortune: "機緣奇遇"
};
const FORM_LABELS = { crush: "輾壓", awe: "險境" };

const RESOURCE_META = [
  { key: "hp",   name: "血量", hint: "受傷會掉,隨時間自然回復" },
  { key: "qi",   name: "內力", hint: "運功會耗,恢復最快" },
  { key: "tili", name: "體力", hint: "每場事件固定耗 100,當日有練功回復加快" }
];
// §4:一律「低於」(嚴格 <),與 resources.js 同一組門檻
const TIER_LABEL = { light: "輕", heavy: "重" };
const NARRATIVE_BEAT_LABELS = {
  state:  ["覺", "察", "省", "變"],
  bestow: ["起", "承", "轉", "合"]
  // surpass 沒有段名:名次播報是江湖快報的口吻,不套四段式
};
const NARRATIVE_KIND_LABELS = {
  arrival: "輿圖 ‧ 到了",
  state:   "身上的狀況",
  bestow:  "司天監 ‧ 頒號",
  board:   "群俠錄 ‧ 榜文",
  surpass: "群俠錄 ‧ 名次變動"
};
const LEDGER_SIZE_FALLBACK = 1000000;

const DATA_VERSION = "p2-10"; // 改資料檔時遞增,破 GitHub Pages 的 10 分鐘快取,避免新舊檔案混用

async function loadData() {
  const names = ["exercises", "events", "titles", "items", "tags", "quiz", "npcs", "reputation", "whispers", "narratives", "media", "jianghu_news", "map"];
  const loaded = await Promise.all(
    names.map((n) =>
      fetch(`data/${n}.json?v=${DATA_VERSION}`).then((r) => {
        if (!r.ok) throw new Error(`載入 data/${n}.json 失敗`);
        return r.json();
      })
    )
  );
  names.forEach((n, i) => { data[n] = loaded[i]; });
}

function dateWithOffset(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function today() {
  return dateWithOffset(0);
}

function dimName(key) {
  return data.exercises.dimensions.find((d) => d.key === key)?.name ?? key;
}

function save() {
  saveState(state);
}

// ---------- 渲染 ----------

function renderAll() {
  renderTitleLine();
  renderResources();
  renderHero();
  renderTrain();
  renderRoad();
  renderMap();
  renderFame();
  renderBag();
}

/**
 * 玩家「知道」的名次——也就是上次看榜文/遇監使時的數字,不是即時真值。
 * 名次不隨練功即時跳動,是設計者定調的:得進城看榜才知道自己在哪(2026-08-21)。
 * 還沒看過榜就回 null。
 */
function knownRank() {
  return state.lastKnownRank ?? null;
}

/** 名次對應的百分位與稱號(拿已知名次去換算,不偷看真值) */
function knownRankTitle(rank) {
  const percentile = percentileForRank(rank, ledgerSize());
  return rankingTitleForPercentile(percentile, data, { isRank1: rank === 1 });
}

function ledgerSize() {
  return data.npcs.totalLedger?.size ?? LEDGER_SIZE_FALLBACK;
}

function npcLabel(npc) {
  return npc.nickname ? `${npc.name} ‧ ${npc.nickname}` : npc.name;
}

/** 三資源條(§4)。創角前沒有 resources,整塊收起來。 */
function renderResources() {
  const box = $("#resource-box");
  const percents = resourcePercents(state);
  if (!percents) { box.hidden = true; return; }
  box.hidden = false;
  const max = resourceMax(state);
  box.innerHTML = RESOURCE_META.map(({ key, name, hint }) => {
    const pct = Math.max(0, Math.min(1, percents[key]));
    const tier = pct < 0.10 ? "heavy" : pct < 0.30 ? "light" : null;
    const badge = tier
      ? `<span class="res-badge ${tier}">${TIER_LABEL[tier]}</span>` : "";
    return `<div class="res-row">
      <div class="res-head"><span class="res-name">${name}${badge}</span>
        <span class="res-num">${Math.round(state.resources[key])} / ${Math.round(max[key])}</span></div>
      <div class="bar"><div class="bar-fill res-${key} ${tier ?? ""}" style="width:${pct * 100}%"></div></div>
      <div class="res-hint">${hint}</div>
    </div>`;
  }).join("");
}

function renderTitleLine() {
  const { titles } = data.titles.milestones;
  const rank = knownRank();
  const parts = [rank == null
    ? "群俠錄:還沒見過榜文"
    : `群俠錄第 ${rank.toLocaleString()} 位 ‧ ${knownRankTitle(rank)}`];
  for (const d of DIMENSIONS) {
    const idx = state.milestones[d];
    if (idx != null && idx >= 0) parts.push(`${dimName(d)}:${titles[d][idx]}`);
  }
  $("#title-line").textContent = parts.join(" ‧ ");
}

function renderHero() {
  const grid = $("#stats-grid");
  const { thresholds, titles } = data.titles.milestones;
  grid.innerHTML = DIMENSIONS.map((d) => {
    const exp = state.exp[d];
    const p = levelProgress(exp);
    const idx = state.milestones[d];
    const title = idx != null && idx >= 0 ? titles[d][idx] : "";
    const pct = Math.min(100, (p.current / p.needed) * 100);
    return `<div class="stat-card">
      <div><span class="stat-name">${dimName(d)}</span><span class="stat-level">Lv.${p.level}</span></div>
      <div class="stat-title">${title}</div>
      <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
      <div class="stat-exp">${Math.floor(exp)} / ${p.next}(距下一級 ${Math.ceil(p.needed - p.current)})</div>
    </div>`;
  }).join("");
  $("#hero-steps").textContent = state.steps.total.toLocaleString();
}

function renderTrain() {
  const sel = $("#exercise-select");
  if (!sel.options.length) {
    sel.innerHTML = data.exercises.categories.map((cat) => {
      const opts = data.exercises.exercises
        .filter((e) => e.category === cat.key)
        .map((e) => `<option value="${e.id}">${e.name}</option>`)
        .join("");
      return `<optgroup label="${cat.name}">${opts}</optgroup>`;
    }).join("");
  }
  if (state.training) sel.value = state.training.exerciseId;
  updateTierHint();
  updateTrainMode();
  renderTodayLog();
}

// ---------- 計時修煉 ----------

let timerTick = null;

function selectedExercise() {
  return data.exercises.exercises.find((e) => e.id === $("#exercise-select").value);
}

function fmtElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 依所選項目切換「手動登記」與「計時修煉」兩種模式 */
function updateTrainMode() {
  const timed = selectedExercise()?.category === "minute";
  $("#manual-entry").hidden = timed;
  $("#exercise-amount").disabled = timed; // 停用才不會擋表單驗證
  $("#log-btn").hidden = timed;
  $("#timer-box").hidden = !timed;
  renderTimer();
}

function renderTimer() {
  const running = !!state.training;
  $("#timer-start").hidden = running;
  $("#timer-stop").hidden = !running;
  $("#timer-cancel").hidden = !running;
  $("#exercise-select").disabled = running;
  if (running) {
    $("#timer-display").textContent = fmtElapsed(trainingElapsedMs(state, Date.now()));
    if (!timerTick) timerTick = setInterval(renderTimer, 1000);
  } else {
    $("#timer-display").textContent = "00:00";
    if (timerTick) { clearInterval(timerTick); timerTick = null; }
  }
}

function updateTierHint() {
  const ex = data.exercises.exercises.find((e) => e.id === $("#exercise-select").value);
  if (!ex) return;
  const cat = data.exercises.categories.find((c) => c.key === ex.category);
  $("#exercise-unit").textContent = cat.unit;
  const cum = state.daily.date === today() ? (state.daily.byExercise[ex.id] || 0) : 0;
  const coef = currentCoefficient(cum, ex.tierSize, data.exercises.coefficients);
  const weights = Object.entries(ex.weights)
    .map(([d, w]) => `${dimName(d)}×${w}`)
    .join("、");
  $("#tier-hint").textContent =
    `權重:${weights}|遞減階梯:每 ${ex.tierSize} ${cat.unit}|今日已累積 ${cum} ${cat.unit},目前係數 ${Math.round(coef * 100)}%`;
}

function renderTodayLog() {
  const box = $("#today-log");
  const rows = state.records.filter((r) => r.date === today());
  if (!rows.length) {
    box.innerHTML = `<p class="empty">今日尚未練功。拳不離手,曲不離口。</p>`;
    return;
  }
  box.innerHTML = `<table>
    <tr><th>項目</th><th>原始量</th><th>有效量</th><th>六維收穫</th></tr>
    ${rows.map((r) => `<tr>
      <td>${r.name}</td><td>${r.amount}</td><td>${r.effective}</td>
      <td>${Object.entries(r.gains).map(([d, v]) => `${dimName(d)}+${Math.round(v)}`).join(" ")}</td>
    </tr>`).join("")}
  </table>`;
}

function renderRoad() {
  const pending = pendingEventCount(state);
  $("#pending-count").textContent = pending;
  $("#walk-btn").disabled = !!state.rebirth || (pending <= 0 && !state.pendingEvent);
  const bd = state.steps.byDate || {};
  const t = bd[today()], y = bd[dateWithOffset(-1)];
  $("#steps-status").textContent =
    `今天:${t != null ? `已記 ${t.toLocaleString()} 步` : "未記"}|昨天:${y != null ? `已記 ${y.toLocaleString()} 步` : "未記"}` +
    `(每日一次,單日最多採計 ${MAX_DAILY_STEPS.toLocaleString()} 步)`;
  renderRebirth();
  renderEventArea();
  renderJournal();
}

/** 重生(§5.1):血量歸零後擋住江湖路,練完六大試煉才起得來 */
function renderRebirth() {
  const box = $("#rebirth-box");
  if (!state.rebirth) { box.hidden = true; return; }
  box.hidden = false;
  const prog = state.rebirth.progress;
  const done = isTrialComplete(prog);
  const rows = SIX_TRIALS.map((t) => {
    const raw = prog[t.exerciseId] ?? 0;
    const ok = raw >= t.target;
    return `<div class="trial-row ${ok ? "done" : ""}">
      <span>${ok ? "✔" : "・"} ${t.label}</span>
      <span>${Math.floor(Math.min(raw, t.target))} / ${t.target}</span>
    </div>`;
  }).join("");
  box.innerHTML = `<h2>倒下之後</h2>
    <p class="rebirth-text">血流盡了,人卻還沒散。你被拖回一間破屋,躺了不知多久。要重新站上江湖路,
      得先讓這副身子認得自己——六大試煉,一項一項練回來。</p>
    <div class="trial-list">${rows}</div>
    <p class="hint">試煉算的是你實際登記的原始運動量(不扣遞減),可以分很多次累積。練功照常記就是了。</p>
    ${done
      ? `<button type="button" class="btn primary" id="rebirth-btn">起 身</button>`
      : `<p class="hint">六項全滿才起得來。這段期間走再多路,江湖也不會有事找上你。</p>`}`;
  if (done) {
    $("#rebirth-btn").addEventListener("click", () => {
      const res = attemptRebirthCompletion(state, today());
      if (!res) return;
      alert(res.success
        ? "你撐著牆站起來,才發現這副筋骨比倒下之前更耐折騰。這一趟疼,沒有白疼。"
        : "傷是好了,人還是那個人。你拍拍身上的土,推門出去——外頭天正亮著。");
      afterAction();
    });
  }
}

function paragraphs(text, cls) {
  if (!text) return "";
  return text.split("\n").filter((t) => t.trim())
    .map((t) => `<p class="${cls}">${t}</p>`).join("");
}

function regionsOf(eventId) {
  return data.events.pool.find((e) => e.eventId === eventId)?.tagBlock?.region ?? [];
}

/** 事件插圖掛載點:media.json 有登記才顯示 */
function eventArtHtml(eventId, eventType) {
  const src = eventImage(eventId, eventType, regionsOf(eventId)[0]);
  return src ? `<div class="event-art"><img src="${src}" alt=""></div>` : "";
}

function renderEventArea(lastEntry = null) {
  const area = $("#event-area");
  const view = presentEvent(state, data);

  if (!view && !lastEntry) {
    area.innerHTML = "";
    stopAmbience(); // 沒有事件在場,環境音收掉
    return;
  }

  if (view) {
    const typeLabel = TYPE_LABELS[view.eventType] ?? view.eventType;
    const formBadge = FORM_LABELS[view.form]
      ? `<span class="event-type form-badge">${FORM_LABELS[view.form]}</span>` : "";

    // 巢狀抉擇階段:只顯示前段結果與第二層選項
    if (view.phase === "sub") {
      area.innerHTML = `<div class="event-card">
        <span class="event-type">${typeLabel}</span>${formBadge}
        <h3>${view.title}</h3>
        ${paragraphs(view.subPrefixText, "event-text")}
        <div class="event-options">${view.choices
          .map((o) => `<button class="btn" data-sub="${o.id}">${o.text}</button>`).join("")}</div>
      </div>`;
      area.querySelectorAll("[data-sub]").forEach((btn) =>
        btn.addEventListener("click", () => onChoose(btn.dataset.sub, true))
      );
      return;
    }

    const whisper = view.whisper
      ? `<p class="whisper-line">${view.whisper}</p>` : "";
    const reveal = view.revealText
      ? `<div class="perception-box"><span class="perception-tag">察覺</span>${paragraphs(view.revealText, "event-text")}</div>` : "";
    const crush = view.crushText
      ? `<div class="perception-box crush"><span class="perception-tag">洞若觀火</span>${paragraphs(view.crushText, "event-text")}</div>` : "";
    const controls = view.immediate
      ? `<div class="event-options"><button class="btn primary" data-choice="">繼 續</button></div>`
      : `<div class="event-options">${view.choices
          .map((o) => `<button class="btn" data-choice="${o.id}">${o.text}</button>`).join("")}</div>`;

    playBgm({ eventType: view.eventType }); // 事件中依類型切曲(media.json 沒填則維持原曲/靜音)
    playAmbience(view.id, regionsOf(view.id)); // 環境音:山有鳥鳴、水有濤聲、市有人聲
    area.innerHTML = `<div class="event-card">
      ${eventArtHtml(view.id, view.eventType)}
      <span class="event-type">${typeLabel}</span>${formBadge}
      <h3>${view.title}</h3>
      ${paragraphs(view.qi, "event-text")}
      ${whisper}
      ${reveal}${crush}
      ${controls}
    </div>`;
    area.querySelectorAll("[data-choice]").forEach((btn) =>
      btn.addEventListener("click", () => onChoose(btn.dataset.choice || null, false))
    );
    return;
  }

  // 顯示剛結算完的結果
  const e = lastEntry;
  const cls = e.success === true ? "success" : e.success === false ? "failure" : "";
  const rateLine = e.rate != null
    ? `<p class="event-rate">判定成功率 ${Math.round(e.rate * 100)}% — ${e.success ? "成功" : "失敗"}</p>` : "";
  area.innerHTML = `<div class="event-card">
    ${eventArtHtml(e.id, e.type)}
    <span class="event-type">${TYPE_LABELS[e.type] ?? e.type}</span>
    <h3>${e.title}</h3>
    ${e.choice ? `<p class="event-rate">你的選擇:${e.choice}</p>` : ""}
    ${e.subChoice ? `<p class="event-rate">${e.subChoice}</p>` : ""}
    ${e.zhuanText ? paragraphs(e.zhuanText, "event-text zhuan") : ""}
    <div class="event-result ${cls}">${paragraphs(e.resultText, "event-text")}</div>
    ${rateLine}
    ${narrativeQueue.length
      ? `<div class="event-options"><button class="btn primary" id="after-event-btn">${afterEventLabel()}</button></div>`
      : ""}
  </div>`;
  // 有東西等著播,就等玩家自己按——別把結果文字蓋掉(事件讀到一半跳出榜文很怪)
  $("#after-event-btn")?.addEventListener("click", showNextNarrative);
}

/** 結果卡底下那顆鈕的字:先預告等著的是什麼,免得按下去被浮層嚇一跳 */
function afterEventLabel() {
  const next = narrativeQueue[0];
  if (!next) return "繼 續";
  if (next.kind === "board" || next.kind === "surpass") return "看 榜 文";
  if (next.kind === "bestow") return "那 人 開 口 了";
  if (next.kind === "state") return "喘 口 氣";
  return "繼 續";
}

function renderJournal() {
  const box = $("#journal");
  if (!state.journal.length) {
    box.innerHTML = `<p class="empty">尚未踏出第一步。輸入步數,江湖便在腳下。</p>`;
    return;
  }
  box.innerHTML = [...state.journal].reverse().slice(0, 50).map((e) => {
    if (e.type === "fate") {
      return `<div class="journal-entry"><div class="j-head">命格</div><div class="j-result">${e.text}</div></div>`;
    }
    if (NARRATIVE_KIND_LABELS[e.type]) {
      const head = NARRATIVE_KIND_LABELS[e.type];
      return `<div class="journal-entry ${e.type}"><div class="j-head">${head}</div>
        <div><strong>${e.title}</strong></div>
        <div class="j-result">${(e.resultText || "").split("\n")[0]}</div></div>`;
    }
    const tag = TYPE_LABELS[e.type] ?? e.type;
    const outcome = e.success === true ? "(成功)" : e.success === false ? "(失敗)" : "";
    return `<div class="journal-entry">
      <div class="j-head">第 ${e.n} 里 ‧ ${tag}${outcome}${e.form && FORM_LABELS[e.form] ? ` ‧ ${FORM_LABELS[e.form]}` : ""}</div>
      <div><strong>${e.title}</strong>${e.choice ? ` — ${e.choice}` : ""}</div>
      <div class="j-result">${(e.resultText || "").split("\n")[0]}</div>
    </div>`;
  }).join("");
}

function renderBag() {
  const inv = $("#inventory");
  const entries = Object.entries(state.inventory);
  if (!entries.length) {
    inv.innerHTML = `<p class="empty">行囊空空,倒也輕便。</p>`;
  } else {
    inv.innerHTML = entries.map(([id, count]) => {
      const item = data.items.items.find((i) => i.id === id);
      const usable = item?.type === "consumable";
      return `<div class="item-row">
        <div>
          <div>${item?.name ?? id} × ${count}</div>
          <div class="item-desc">${item?.description ?? ""}</div>
        </div>
        ${usable ? `<button class="btn" data-use="${id}">使用</button>` : ""}
      </div>`;
    }).join("");
    inv.querySelectorAll("[data-use]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const result = useItem(state, data, btn.dataset.use);
        if (typeof result === "string") {
          const d = data.items.debuffs.find((x) => x.id === result);
          alert(`用藥之後,「${d?.name ?? result}」痊癒了。`);
        } else if (result?.restore) {
          const names = { hp: "血量", qi: "內力", tili: "體力" };
          const text = Object.entries(result.restore)
            .map(([k, v]) => `${names[k] ?? k} +${Math.round(v)}`)
            .join("、");
          alert(`服下之後,${text}。`);
        } else {
          alert("現在用不上這個。留著吧,江湖路長。");
        }
        afterAction();
      })
    );
  }

  const dbox = $("#debuff-list");
  if (!state.debuffs.length) {
    dbox.innerHTML = `<p class="empty">身輕體健,百病不侵。</p>`;
  } else {
    dbox.innerHTML = state.debuffs.map((id) => {
      const d = data.items.debuffs.find((x) => x.id === id);
      return `<div class="debuff-row">
        <span class="debuff-name">${d?.name ?? id}</span>
        <p>${d?.description ?? ""}</p>
        <p>${d?.cureHint ?? ""}</p>
      </div>`;
    }).join("");
  }

  const q = $("#quest-status");
  if (state.labor?.active) {
    const rule = data.events.config.labor;
    q.innerHTML = `<p>【湊錢中】欠下的,用汗水還。滿日 ${state.labor.fullDates.length} / ${rule.targetFullDays} ——
      當日練功有效經驗達 ${rule.dailyEffectiveExpThreshold} 即為一個滿日,一天至多一兩。連續 ${rule.abandonZeroDays} 天不動,就當是放棄了。</p>`;
  } else {
    q.innerHTML = `<p>眼下沒有牽掛。江湖的帳,記在路上——你做過的事,它都記得。</p>`;
  }
}

// ---------- 輿圖(§9.10):步數就是趕路 ----------

const LOC_GLYPH = { town: "■", sect: "▲", spot: "◇" };
const LOC_KIND = { town: "城鎮", sect: "門派", spot: "景點" };

function renderMap() {
  if (!data.map) return;
  ensureTravel(state, data);
  const here = locationById(data, state.travel.at);
  const prov = provinceOf(data, state.travel.at);

  $("#map-here").innerHTML = `
    <p class="map-here-name"><span class="loc-glyph ${here.type}">${LOC_GLYPH[here.type]}</span>${here.name}</p>
    <p class="map-here-prov">${prov.name} ‧ ${LOC_KIND[here.type]}</p>
    <p class="map-see">${here.see}</p>
    <p class="hint">待在這裡的日子,遇到的多半是這一帶的事。</p>`;

  // 趕路進度
  const rest = remaining(state);
  const card = $("#map-journey-card");
  if (rest == null) {
    card.hidden = true;
  } else {
    card.hidden = false;
    const dest = locationById(data, state.travel.to);
    const done = walked(state);
    const pct = Math.min(100, (done / state.travel.distance) * 100);
    $("#map-journey").innerHTML = `
      <p class="journey-line">🚶 距離<strong>${dest.name}</strong>,還有
        <strong class="journey-steps">${rest.toLocaleString()}</strong> 步。
        ${rest <= 2000 ? "<em>再一口氣就到了。</em>" : ""}</p>
      <div class="bar"><div class="bar-fill journey-fill" style="width:${pct}%"></div></div>
      <p class="hint">已走 ${done.toLocaleString()} / ${state.travel.distance.toLocaleString()} 步。
        路上照樣遇得到事——趕路才是遇事的時候。</p>
      <button type="button" class="btn" id="map-abort">不去了</button>`;
    $("#map-abort").addEventListener("click", () => {
      if (!confirm(`放棄前往${dest.name}?已經走的路不會退回來。`)) return;
      clearDestination(state);
      save();
      renderAll();
    });
  }

  // 可去的地方(同州、已開放)
  const lv = playerLevelSum(state);
  const box = $("#map-dest");
  const reachable = allLocations(data)
    .filter((l) => l.id !== state.travel.at && provinceOf(data, l.id).open)
    .map((l) => ({ l, d: distanceBetween(data, state.travel.at, l.id) }))
    .filter((x) => x.d != null)
    .sort((a, b) => a.d - b.d);
  box.innerHTML = reachable.map(({ l, d }) => `
    <button type="button" class="dest-row" data-go="${l.id}"${state.travel.to === l.id ? " disabled" : ""}>
      <span class="loc-glyph ${l.type}">${LOC_GLYPH[l.type]}</span>
      <span class="dest-b">
        <span class="dest-n">${l.name}${state.travel.to === l.id ? "<em>(趕路中)</em>" : ""}</span>
        <span class="dest-see">${l.see}</span>
      </span>
      <span class="dest-d">${d.toLocaleString()} 步</span>
    </button>`).join("");
  box.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", () => {
      const res = setDestination(state, data, b.dataset.go, lv);
      if (!res.ok) { alert(res.text); return; }
      save();
      renderAll();
      $("#map-journey-card").scrollIntoView({ behavior: "smooth", block: "center" });
    })
  );

  // 天下:六州一覽
  $("#map-world").innerHTML = data.map.provinces.map((p) => {
    const hasMap = !!state.maps[p.id];
    const enough = (p.gate ?? 0) <= lv;
    const stateText = !p.open ? "尚未開放"
      : !hasMap ? "沒有這一州的圖"
      : !enough ? `歷練不夠(要 ${p.gate})`
      : "去得了";
    const cls = !p.open || !hasMap || !enough ? " locked" : "";
    return `<div class="world-row${cls}">
      <span class="world-n">${p.name}</span>
      <span class="world-s">${stateText}</span>
      <span class="world-c">${p.locations.length} 處</span>
    </div>`;
  }).join("");
}

/** 走到了沒?到了就把抵達敘事排進浮層隊列 */
function collectArrival() {
  if (!data.map) return [];
  const a = checkArrival(state, data);
  if (!a) return [];
  return [{
    kind: "arrival",
    name: a.name,
    beats: [a.text, a.firstTime ? `你到了${a.provinceName}的${a.name}。` : ""]
  }];
}

// ---------- 群俠錄(§9.7 名次 / §8.1 稱號 / §9.6 聲望) ----------

function renderFame() {
  const size = ledgerSize();
  const rank = knownRank();
  const box = $("#rank-target");

  if (rank == null) {
    $("#rank-box").innerHTML = `
      <p class="empty">你還不知道自己排第幾。</p>
      <p class="hint">《群俠錄》是司天監編的天下總冊,共 ${size.toLocaleString()} 人。
        榜文張貼在城鎮的告示牆上——進了城,或遇上監裡的人,你才會知道自己在哪一位。</p>`;
    box.innerHTML = `<p class="empty">連自己排第幾都還不知道,談什麼追前頭的人。</p>`;
    renderReputation();
    renderSurpassed();
    renderJianghuNews();
    return;
  }

  const seen = state.rankSeen;
  $("#rank-box").innerHTML = `
    <div class="rank-figure">
      <span class="rank-hash">第</span><span class="rank-number">${rank.toLocaleString()}</span><span class="rank-hash">位</span>
    </div>
    <p class="rank-title">${knownRankTitle(rank)}</p>
    <p class="hint">天下總冊共 ${size.toLocaleString()} 人,你前頭還有 ${(rank - 1).toLocaleString()} 個,
      身後是 ${(size - rank).toLocaleString()} 個。</p>
    <p class="hint rank-stale">${seen
      ? `這是 ${seen.date} 你在${seen.source === "監使" ? "監使口中聽來的" : "榜文上看到的"}數字。
         之後練的功還沒登榜——榜只有你進城看見時才會更新。`
      : "這個數字有點舊了,下次進城看榜就會更新。"}</p>`;

  // 前頭那個人:百強內看具名對手,總冊區看整數關口(§9.9);名冊用江湖活水生效版
  const namedAbove = nextNamedNpcAbove(rank, effectiveNpcs(state, data));
  const milestone = nextIntegerMilestone(rank);
  if (namedAbove) {
    const tier = surpassTier(namedAbove);
    box.innerHTML = `<div class="target-card">
      <p class="target-rank">第 ${namedAbove.rank} 名</p>
      <p class="target-name">${npcLabel(namedAbove)}</p>
      ${namedAbove.loreLine ? `<p class="target-lore">${namedAbove.loreLine}</p>` : ""}
      <p class="hint">${tier === "top10"
        ? "十強。到了這一步,勝負就不是榜上的數字說了算。"
        : `壓過去,俠名 +${surpassFameReward(namedAbove.rank)}。`}</p>
    </div>`;
  } else if (milestone) {
    box.innerHTML = `<div class="target-card">
      <p class="target-rank">第 ${milestone.toLocaleString()} 位</p>
      <p class="target-name">下一道坎</p>
      <p class="hint">萬人區不逐名計較,每五百名才算一道坎。跨過去,總冊上你的名字就往前挪一格。</p>
    </div>`;
  } else if (rank === 1) {
    box.innerHTML = `<p class="empty">前頭沒有人了。</p>`;
  } else {
    box.innerHTML = `<p class="empty">百強在望。再往前,就是有名有姓的人了。</p>`;
  }

  renderReputation();
  renderSurpassed();
  renderJianghuNews();
}

/** 江湖快報(§9.7.6:NPC 事件式變動——榜單是活的) */
function renderJianghuNews() {
  const box = $("#jianghu-news-box");
  if (!box) return;
  const news = jianghuNews(state);
  box.innerHTML = news.length
    ? news.slice(0, 10).map((n) => `<div class="news-row">
        <span class="news-date">${n.date}</span>
        <p class="news-text">${n.text}</p>
      </div>`).join("")
    : `<p class="empty">江湖最近很平靜。平靜不了太久的——閉關的總會出關,舊傷總會發作。</p>`;
}

/** 江湖評價(§9.6.4 矩陣) */
function renderReputation() {
  const rep = reputationSnapshot(state.reputation, data.reputation);
  $("#reputation-box").innerHTML = `
    <p class="evaluation">${rep.evaluation}</p>
    <div class="rep-row"><span class="rep-name">俠名</span>
      <span class="rep-tier">${rep.fameTierLabel}</span><span class="rep-num">${Math.round(rep.fame)}</span></div>
    <div class="rep-row"><span class="rep-name">惡名</span>
      <span class="rep-tier infamy">${rep.infamyTierLabel}</span><span class="rep-num">${Math.round(rep.infamy)}</span></div>
    <p class="hint">兩條路各走各的,不互相抵銷。做過的好事不會洗掉做過的壞事,反過來也一樣。</p>`;

}

/** 已超越的具名百強(靠 surpassed_{rank} flag 落地) */
function renderSurpassed() {
  const sbox = $("#surpassed-box");
  const ranks = Object.keys(state.flags)
    .map((k) => /^surpassed_(\d+)$/.exec(k))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
  sbox.innerHTML = ranks.length
    ? ranks.map((r) => {
        const npc = namedNpcAtRank(r, effectiveNpcs(state, data));
        return `<div class="surpassed-row"><span class="s-rank">#${r}</span>
          <span>${npc ? npcLabel(npc) : "無名記錄"}</span></div>`;
      }).join("")
    : `<p class="empty">還沒有。百強是有名有姓的人,壓過去一個,江湖就記你一筆。</p>`;
}

/**
 * 把 updateRanking 的結果翻成快報(§9.9)。
 * 拆成純建構器是因為事件結算路徑早在 finalizeHooks 裡呼叫過 updateRanking 了,
 * 那邊的結果掛在 entry.ranking;若在 UI 再呼叫一次,超越紀錄已經被吃掉,快報就永遠不會出現。
 */
function broadcastsFromRankingResult(result) {
  if (!result) return [];
  const out = [];
  const rank = result.rank.toLocaleString();

  // 榜文本身:第一次看到、或名次跟上次不同時才開口;沒動就不囉嗦
  if (result.firstTime) {
    out.push({
      kind: "board",
      name: `第 ${rank} 位`,
      beats: [`榜文貼在牆上,密密麻麻,一整面。你從後頭往前數,終於在第 ${rank} 位上找到自己的名字——` +
              `寫得很小,墨也淡。但它在上面。`]
    });
  } else if (result.rank < result.prevRank) {
    out.push({
      kind: "board",
      name: `第 ${rank} 位`,
      beats: [`榜文換過了。你的名字從第 ${result.prevRank.toLocaleString()} 位,挪到了第 ${rank} 位。`]
    });
  } else if (result.rank > result.prevRank) {
    out.push({
      kind: "board",
      name: `第 ${rank} 位`,
      beats: [`榜文換過了。你的名字退到第 ${rank} 位——這些日子在用功的,不只你一個。`]
    });
  }

  for (const npc of result.surpassed) {
    const reward = surpassFameReward(npc.rank);
    const beats = [
      `榜上這一行,你壓過了第 ${npc.rank} 名,${npcLabel(npc)}。`
    ];
    // #11–#100 的被超越反應詞(90 條);#1–#10 依 §9.7.5 走深度互動,Phase 1 先用人設引言頂著
    if (npc.surpassReaction) beats.push(npc.surpassReaction);
    else if (npc.loreLine) beats.push(npc.loreLine);
    beats.push(`俠名 +${reward}。`);
    out.push({ kind: "surpass", name: npcLabel(npc), beats });
  }
  for (const m of result.milestonesCrossed) {
    out.push({
      kind: "surpass",
      name: `第 ${m.toLocaleString()} 位`,
      beats: [`群俠錄第 ${m.toLocaleString()} 位——你的名字往前挪了。`]
    });
  }
  return out;
}

/** 遇上司天監的人(監使頒號)也算得知名次的管道之一(§9.9) */
function revealByEnvoy() {
  return broadcastsFromRankingResult(revealRanking(state, data, today(), "監使"));
}

// ---------- 敘事播放(§4 狀態四段式 / §8.7 監使頒號 / §9.9 名次快報) ----------

let narrativeQueue = [];

/** 把此刻該播的敘事收進隊列,同時寫一筆歷程供事後回看。回傳有沒有東西要播。 */
function queueItems(pending) {
  if (!pending.length) return false;
  for (const item of pending) {
    state.journal.push({
      n: state.steps.resolved,
      type: item.kind,
      title: item.name,
      resultText: item.beats.filter(Boolean).join("\n")
    });
  }
  narrativeQueue.push(...pending);
  return true;
}

function showNextNarrative() {
  const overlay = $("#narrative-overlay");
  const item = narrativeQueue.shift();
  if (!item) {
    overlay.hidden = true;
    $("#after-event-btn")?.remove(); // 播完了,結果卡上那顆鈕就沒用了
    return;
  }
  const labels = NARRATIVE_BEAT_LABELS[item.kind] ?? [];
  const beats = item.beats.filter(Boolean);
  $("#narrative-kind").textContent = NARRATIVE_KIND_LABELS[item.kind] ?? "";
  $("#narrative-title").textContent = item.name;
  $("#narrative-beats").innerHTML = beats.map((t, i) =>
    `<p class="narrative-beat${i === beats.length - 1 && beats.length > 1 ? " last" : ""}">
       ${labels[i] ? `<span class="beat-label">${labels[i]}</span>` : ""}${t}</p>`
  ).join("");
  $("#narrative-next").textContent = narrativeQueue.length ? "繼 續" : "知道了";
  overlay.hidden = false;
  playSfx(item.kind === "state" ? "judgeFail" : "judgeSuccess");
}

/**
 * 動過資源或經驗的操作,收尾都走這裡:排敘事 → 存檔 → 重畫 → 播。
 * 練功本身不會讓你知道自己排第幾——除非監使找上門頒號,那才算遇上了司天監的人。
 */
function afterAction() {
  const items = [...collectArrival(), ...collectNarratives(state, data, resourcePercents(state))];
  if (items.some((n) => n.kind === "bestow")) items.push(...revealByEnvoy());
  const has = queueItems(items);
  save();
  renderAll();
  if (has) showNextNarrative();
}

// ---------- 操作 ----------

function onChoose(choiceId, isSub) {
  playSfx("choice");
  const result = isSub
    ? chooseSub(state, data, choiceId, today())
    : chooseOption(state, data, choiceId, today());
  save();
  if (result.done) {
    if (result.entry.success === true) playSfx("judgeSuccess");
    else if (result.entry.success === false) playSfx("judgeFail");
    playBgm({ tab: "road" }); // 事件結束,回到分頁曲
    queueItems([
      ...collectArrival(),
      ...collectNarratives(state, data, resourcePercents(state)),
      ...broadcastsFromRankingResult(result.entry.ranking)
    ]);
    save();
    renderAll();
    // 敘事不自動彈:結果卡會自己長出一顆鈕,玩家讀完再按。
    // (事件進行到一半突然跳出榜文很怪——設計者回報 2026-08-21)
    renderEventArea(result.entry); // 須排在 renderAll 之後,否則結果卡會被蓋掉
  } else {
    renderEventArea(); // 進入巢狀抉擇,重新渲染第二層選項
  }
}

/** 存檔卡的提示列:用 alert 打斷玩家不划算,訊息留在畫面上比較好讀 */
function saveFlash(message) {
  const flash = $("#save-flash");
  flash.hidden = false;
  flash.textContent = message;
}

function bindEvents() {
  $("#narrative-next").addEventListener("click", showNextNarrative);

  // 分頁
  $("#tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
    document.querySelectorAll(".panel").forEach((p) =>
      p.classList.toggle("active", p.id === `tab-${btn.dataset.tab}`)
    );
    playBgm({ tab: btn.dataset.tab }); // 分頁背景曲(media.json 沒填則無事發生)
    if (btn.dataset.tab !== "road") stopAmbience(); // 離開江湖路,場景環境音收掉
  });

  // 音樂開關(media.json 有登記任何 BGM 才顯示)
  const mediaBtn = $("#media-toggle");
  if (mediaBtn) {
    mediaBtn.hidden = !hasAnyBgm();
    mediaBtn.textContent = isMuted() ? "🔇" : "🎵";
    mediaBtn.addEventListener("click", () => {
      mediaBtn.textContent = toggleMute() ? "🔇" : "🎵";
    });
  }

  // 練功
  $("#exercise-select").addEventListener("change", () => {
    updateTierHint();
    updateTrainMode();
  });
  $("#exercise-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = $("#exercise-select").value;
    if (selectedExercise()?.category === "minute") return; // 按分鐘一律走計時
    const amount = Number($("#exercise-amount").value);
    if (!(amount > 0)) return;
    const { effective, gains, actionSteps } = logExercise(state, data, id, amount, today());
    save();
    const gainText = Object.entries(gains)
      .map(([d, v]) => `${dimName(d)} +${Math.round(v)}`)
      .join("、");
    const flash = $("#train-result");
    flash.hidden = false;
    flash.textContent = `登記成功!有效量 ${Math.round(effective * 100) / 100},六維收穫:${gainText}。` +
      `這趟折算 ${actionSteps.toLocaleString()} 步行動力,江湖路上又能多走幾里。`;
    $("#exercise-amount").value = "";
    afterAction();
  });

  // 計時修煉
  $("#timer-start").addEventListener("click", () => {
    startTraining(state, data, $("#exercise-select").value, Date.now());
    save();
    renderTimer();
  });
  $("#timer-stop").addEventListener("click", () => {
    const res = stopTraining(state, data, today(), Date.now());
    save();
    const flash = $("#train-result");
    flash.hidden = false;
    if (!res) {
      flash.textContent = "不足一分鐘,這趟就當熱身,未登記。";
    } else {
      const gainText = Object.entries(res.gains)
        .map(([d, v]) => `${dimName(d)} +${Math.round(v)}`)
        .join("、");
      flash.textContent = `收功!實練 ${res.minutes} 分鐘,有效量 ${Math.round(res.effective * 100) / 100},` +
        `六維收穫:${gainText}。這趟折算 ${res.actionSteps.toLocaleString()} 步行動力。`;
    }
    afterAction();
  });
  $("#timer-cancel").addEventListener("click", () => {
    if (!confirm("確定放棄本次修煉?計時將不會登記。")) return;
    cancelTraining(state);
    save();
    renderTimer();
  });

  // 步數
  $("#steps-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = Number($("#steps-amount").value);
    if (!(amount > 0)) return;
    const offset = Number($("#steps-day").value);
    const dayLabel = offset === 0 ? "今天" : "昨天";
    let res;
    try {
      res = logSteps(state, data, amount, dateWithOffset(offset));
    } catch {
      alert(`${dayLabel}已經記過步數了。一日一記,莫要重複。`);
      return;
    }
    save();
    $("#steps-amount").value = "";
    const flash = $("#road-flash");
    flash.hidden = false;
    let msg = `${dayLabel}記上了 ${res.applied.toLocaleString()} 步。`;
    if (res.capped) msg += `(單日最多採計 ${MAX_DAILY_STEPS.toLocaleString()} 步,超出不計)`;
    if (res.gains) msg += ` 路也是功——六維各 +${Math.round(res.gains.light * 100) / 100}。`;
    if (res.warned) msg += " 日行兩萬步,俠士當真健步如飛!";
    flash.textContent = msg;
    afterAction();
  });

  // 前行
  $("#walk-btn").addEventListener("click", () => {
    if (narrativeQueue.length) { showNextNarrative(); return; } // 還有沒看的,先看完再上路
    if (state.rebirth) {
      const flash = $("#road-flash");
      flash.hidden = false;
      flash.textContent = "這副身子還躺著呢。六大試煉練完再說。";
      return;
    }
    if (state.pendingEvent) {
      renderEventArea();
      return;
    }
    const ev = startNextEvent(state, data, today(), Math.random, new Date().getHours()); // 現實時鐘進狀態機(§9.8.1)
    if (!ev) {
      const flash = $("#road-flash");
      flash.hidden = false;
      flash.textContent = "官道上一時清靜,沒遇上什麼事。改日再走走吧。";
      return;
    }
    save();
    renderRoad();
  });

  // 存檔
  // 存成檔案:最省事的搬家方式,不必自己複製一長串文字
  $("#download-btn").addEventListener("click", () => {
    const blob = new Blob([exportSave(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `一步一江湖-存檔-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    saveFlash(`存檔已經下載成檔案「${a.download}」,通常會在「下載」資料夾裡。` +
      "把它丟到雲端硬碟或傳給自己,換裝置時用「讀取存檔檔案」讀回來就好。");
  });

  $("#load-btn").addEventListener("click", () => $("#load-file").click());

  $("#load-file").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 清掉才能連續選同一個檔案
    if (!file) return;
    let imported;
    try {
      imported = importSave(await file.text());
    } catch {
      saveFlash(`「${file.name}」讀不出進度——可能不是這個遊戲的存檔,或檔案在傳送途中壞了。`);
      return;
    }
    if (!confirm(`要用「${file.name}」覆蓋目前的進度嗎?蓋掉之後救不回來。`)) {
      saveFlash("已取消,目前的進度沒有被動到。");
      return;
    }
    state = imported;
    save();
    renderAll();
    saveFlash(`已經讀入「${file.name}」,進度換成這份存檔了。`);
  });

  $("#export-btn").addEventListener("click", () => {
    const box = $("#save-io");
    box.value = exportSave(state);
    box.focus();
    box.select(); // 整段選起來,按 Ctrl+C 就走
    $("#copy-btn").hidden = false;
    saveFlash("進度已經匯出成下面這段文字。整段複製起來,收在記事本或傳給自己都行。");
  });

  $("#copy-btn").addEventListener("click", async () => {
    const text = $("#save-io").value;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      saveFlash("複製好了,貼到安全的地方收著。");
    } catch {
      // 瀏覽器不給複製(權限或非安全連線)就退回讓玩家自己按 Ctrl+C
      $("#save-io").select();
      saveFlash("這個瀏覽器不讓網頁自己複製。文字已經幫你選起來了,按 Ctrl+C(手機長按→複製)。");
    }
  });

  $("#import-btn").addEventListener("click", () => {
    const text = $("#save-io").value.trim();
    if (!text) {
      saveFlash("方框是空的。要還原進度,先把之前匯出的那段文字貼進下面的方框,再按「匯入存檔」。" +
        "如果你只是想備份,按的是左邊的「匯出存檔」。");
      return;
    }
    if (!confirm("匯入會用這段存檔覆蓋掉目前的進度,而且救不回來。確定要匯入嗎?")) return;
    let imported;
    try {
      imported = importSave(text);
    } catch {
      // JSON.parse 的原文是英文技術訊息,對玩家沒有意義,一律換成人話
      saveFlash("這段文字不是有效的存檔——可能是貼漏了一段,或貼到了別的東西。" +
        "請把匯出時那一整段(從頭到尾,含最前面的 { 和最後面的 })完整貼進來。");
      return;
    }
    state = imported;
    save();
    renderAll();
    saveFlash("匯入成功,進度已經換成這份存檔了。");
  });
  $("#reset-btn").addEventListener("click", () => {
    if (confirm("確定要重新開始?所有進度將清空,無法復原。")) {
      state = resetSave();
      save();
      renderAll();
      startQuiz(); // 重頭來過:先讓算命先生再看一次命底
    }
  });
}

// ---------- 捷徑步數回報(iPhone 捷徑開啟 ?steps=8000 自動登記)----------

function handleStepsParam() {
  const params = new URLSearchParams(location.search);
  const raw = Math.floor(Number(params.get("steps")));
  if (!(raw > 0)) return;
  const offset = params.get("day") === "-1" ? -1 : 0;
  const dayLabel = offset === 0 ? "今天" : "昨天";
  history.replaceState(null, "", location.pathname); // 清掉參數,避免重新整理重複觸發

  const flash = $("#road-flash");
  flash.hidden = false;
  try {
    const res = logSteps(state, data, raw, dateWithOffset(offset));
    save();
    let msg = `健康 App 回報:${dayLabel}記上了 ${res.applied.toLocaleString()} 步。`;
    if (res.capped) msg += `(單日最多採計 ${MAX_DAILY_STEPS.toLocaleString()} 步,超出不計)`;
    if (res.warned) msg += " 日行兩萬步,俠士當真健步如飛!";
    flash.textContent = msg;
  } catch {
    flash.textContent = `健康 App 回報:${dayLabel}已經記過步數,未重複登記。`;
  }
  // 切到江湖路分頁讓玩家看到結果
  document.querySelector('[data-tab="road"]').click();
}

// ---------- 創角:心理測驗(§1.2,12 題自 15 題庫隨機抽) ----------

const QUIZ_DRAW_COUNT = 12;
let quizState = null;
let quizBound = false;

function startQuiz() {
  if (!data.quiz?.questions?.length) {
    // 資料沒載齊(多半是瀏覽器快取拿到舊檔),給玩家一條活路而不是白畫面
    $("#quiz-overlay").hidden = false;
    $("#quiz-question").textContent = "算命先生的卦攤好像還沒擺好……請重新整理頁面(電腦按 Ctrl+F5)。";
    return;
  }
  const pool = [...data.quiz.questions];
  // 洗牌抽 12 題
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  quizState = { questions: pool.slice(0, QUIZ_DRAW_COUNT), index: 0, answers: [] };
  bindQuizOnce();
  const quizBg = quizImage();
  if (quizBg) $(".quiz-card").style.backgroundImage = `linear-gradient(rgba(251,246,234,0.92), rgba(251,246,234,0.92)), url("${quizBg}")`;
  playBgm({ quiz: true });
  $("#quiz-overlay").hidden = false;
  renderQuizQuestion();
}

// 事件委派掛在 overlay 容器上:就算翻譯外掛替換了按鈕節點,點擊仍然有效
function bindQuizOnce() {
  if (quizBound) return;
  quizBound = true;
  $("#quiz-overlay").addEventListener("click", (e) => {
    const opt = e.target.closest("[data-opt]");
    if (opt && quizState) {
      const q = quizState.questions[quizState.index];
      quizState.answers.push({ questionId: q.id, optionId: opt.dataset.opt });
      quizState.index += 1;
      if (quizState.index < quizState.questions.length) {
        renderQuizQuestion();
      } else {
        finishQuiz();
      }
      return;
    }
    if (e.target.closest("#quiz-done")) {
      $("#quiz-overlay").hidden = true;
      renderAll();
    }
  });
}

function renderQuizQuestion() {
  const q = quizState.questions[quizState.index];
  $("#quiz-progress").textContent = `${quizState.index + 1} / ${quizState.questions.length}`;
  $("#quiz-question").textContent = q.text;
  $("#quiz-options").innerHTML = q.options
    .map((o) => `<button class="btn quiz-opt" data-opt="${o.id}">${o.text}</button>`)
    .join("");
}

function finishQuiz() {
  const { fate } = createCharacter(state, quizState.answers, data);
  save();
  quizState = null;
  $("#quiz-progress").textContent = "";
  $("#quiz-question").textContent = "";
  $("#quiz-options").innerHTML = `
    <div class="fate-reveal">
      <p class="fate-label">村口的算命先生瞇眼看了你半天,只說了一句——</p>
      <p class="fate-line">「${fate.line}」</p>
      <button class="btn primary" id="quiz-done">踏上旅途</button>
    </div>`;
}

// ---------- 啟動 ----------

(async function main() {
  try {
    await loadData();
  } catch (err) {
    document.body.innerHTML = `<p style="padding:40px;text-align:center">資料載入失敗:${err.message}<br>請用本機伺服器開啟(如 npx serve),不要直接雙擊 html。</p>`;
    return;
  }
  state = loadState();
  catchUpRecovery(state, Date.now(), today()); // 關掉網頁的這段時間,傷該好的就好了(§4)
  saveState(state);
  initMedia(data.media); // 音樂/畫面掛載(media.json 全空 = 靜默停用)
  const headerBg = headerImage();
  if (headerBg) {
    const h = document.querySelector(".site-header");
    h.style.backgroundImage = `linear-gradient(rgba(244,236,220,0.82), rgba(244,236,220,0.82)), url("${headerBg}")`;
    h.style.backgroundSize = "cover";
    h.style.backgroundPosition = "center";
  }
  bindEvents();
  handleStepsParam();
  renderAll();

  // 開場不對名次:沒看過榜文就是不知道自己排第幾,這是設計者定調的規則。
  // 基準線由第一次「得知」自己建立(revealRanking 的 firstTime 分支)。
  playBgm({ tab: "hero" });
  if (!state.talents) startQuiz(); // 未創角:先做心理測驗(§1.2),測完才上路

  // 開著網頁不動也會慢慢回復:每分鐘結算一次,只重畫資源條
  setInterval(() => {
    if (catchUpRecovery(state, Date.now(), today()) > 0) { save(); renderResources(); }
  }, 60000);
})();
