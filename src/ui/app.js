// UI 接線:載入資料檔、綁定操作、渲染畫面

import {
  logExercise, logSteps, pendingEventCount, startNextEvent, presentEvent,
  chooseOption, chooseSub, useItem, levels, createCharacter, MAX_DAILY_STEPS
} from "../engine/game.js";
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

const DATA_VERSION = "b2-1"; // 改資料檔時遞增,破 GitHub Pages 的 10 分鐘快取,避免新舊檔案混用

async function loadData() {
  const names = ["exercises", "events", "titles", "items", "tags", "quiz", "npcs", "reputation", "whispers", "narratives", "media"];
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
  renderHero();
  renderTrain();
  renderRoad();
  renderBag();
}

function renderTitleLine() {
  const { thresholds, titles } = data.titles.milestones;
  const parts = ["群俠錄:暫無排名"];
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
  $("#walk-btn").disabled = pending <= 0 && !state.pendingEvent;
  const bd = state.steps.byDate || {};
  const t = bd[today()], y = bd[dateWithOffset(-1)];
  $("#steps-status").textContent =
    `今天:${t != null ? `已記 ${t.toLocaleString()} 步` : "未記"}|昨天:${y != null ? `已記 ${y.toLocaleString()} 步` : "未記"}` +
    `(每日一次,單日最多採計 ${MAX_DAILY_STEPS.toLocaleString()} 步)`;
  renderEventArea();
  renderJournal();
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
  return src ? `<div class="event-art"><img src="${src}" alt="" loading="lazy"></div>` : "";
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
  </div>`;
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
        save();
        renderAll();
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
    renderAll();
    renderEventArea(result.entry);
  } else {
    renderEventArea(); // 進入巢狀抉擇,重新渲染第二層選項
  }
}

function bindEvents() {
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
    const { effective, gains } = logExercise(state, data, id, amount, today());
    save();
    const gainText = Object.entries(gains)
      .map(([d, v]) => `${dimName(d)} +${Math.round(v)}`)
      .join("、");
    const flash = $("#train-result");
    flash.hidden = false;
    flash.textContent = `登記成功!有效量 ${Math.round(effective * 100) / 100},六維收穫:${gainText}`;
    $("#exercise-amount").value = "";
    renderAll();
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
      flash.textContent = `收功!實練 ${res.minutes} 分鐘,有效量 ${Math.round(res.effective * 100) / 100},六維收穫:${gainText}`;
    }
    renderAll();
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
      res = logSteps(state, amount, dateWithOffset(offset));
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
    if (res.warned) msg += " 日行兩萬步,俠士當真健步如飛!";
    flash.textContent = msg;
    renderAll();
  });

  // 前行
  $("#walk-btn").addEventListener("click", () => {
    if (state.pendingEvent) {
      renderEventArea();
      return;
    }
    const ev = startNextEvent(state, data, today());
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
  $("#export-btn").addEventListener("click", () => {
    $("#save-io").value = exportSave(state);
  });
  $("#import-btn").addEventListener("click", () => {
    try {
      state = importSave($("#save-io").value);
      save();
      renderAll();
      alert("匯入成功。");
    } catch (err) {
      alert(`匯入失敗:${err.message}`);
    }
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
    const res = logSteps(state, raw, dateWithOffset(offset));
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
  playBgm({ tab: "hero" });
  if (!state.talents) startQuiz(); // 未創角:先做心理測驗(§1.2),測完才上路
})();
