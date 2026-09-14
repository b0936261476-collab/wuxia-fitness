// 從 data/events.json 直接生出過稿網頁(通用版;十強那頁仍用 render-top10-review.mjs)。
// 重點是「不手抄」:設計者過的稿必須跟遊戲裡跑的是同一份。
// 用法:node scripts/render-review.mjs <批次代號> [輸出路徑]   批次代號見下方 BATCHES
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const J = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const events = J("data/events.json");
const map = J("data/map.json");

const BATCHES = {
  b17: {
    pick: (id) => /^JN-01[0-7]_/.test(id),
    title: "江南補完過稿頁",
    seal: "一步一江湖 ‧ 江南補完 ‧ 八件",
    h1: "江 南",
    sub: "江南六個地點,原本每處只剩一件左右的事——走到劍宗跟走到清弦閣,感覺差不多。<br>這八件補下去之後,<b>各處都有自己的事了</b>。",
    key: "wuxia-b17-review-v1",
    copyHead: "江南補完・八件"
  },
  b18: {
    pick: (id) => /^DM-0\d\d_/.test(id) || id === "BJ-013_army_kitchen",
    title: "大漠開通過稿頁",
    seal: "一步一江湖 ‧ 大漠開通 ‧ 十二件",
    h1: "大 漠",
    sub: "玩家大約第 55 天就會走到大漠門口,而大漠一直是空的。<br>這批十一件把大漠開起來(黑水驛、孤狼幫、赤焰部、無名沙城),<b>最後一件是順手補北疆邊軍的</b>。",
    key: "wuxia-b18-review-v1",
    copyHead: "大漠開通・十二件"
  }
};

const code = process.argv[2];
const B = BATCHES[code];
if (!B) { console.error("批次代號:", Object.keys(BATCHES).join(" / ")); process.exit(1); }
const OUT = process.argv[3] ?? join(ROOT, `${B.title}.html`);

const locName = {};
for (const p of map.provinces) for (const l of p.locations) locName[l.id] = `${l.name}(${p.name})`;
const provName = Object.fromEntries(map.provinces.map((p) => [p.id, p.name]));

const ABILITY = { qinggong: "輕功", neigong: "內功", yinggong: "硬功", ruangong: "軟功", yangong: "眼力", ergong: "耳力" };
const TYPE = { daily: "見聞", choice: "抉擇", duel: "比試", fortune: "機緣" };

// 旗標 → 會設下它的事件名,用來把「要先…」講成人話
const setterOf = {};
for (const e of events.pool) (function walk(o) {
  if (Array.isArray(o)) return o.forEach(walk);
  if (!o || typeof o !== "object") return;
  for (const [k, v] of Object.entries(o)) {
    if (k === "setFlags" && Array.isArray(v)) for (const f of v) (setterOf[f] ??= new Set()).add(e.title);
    else walk(v);
  }
})(e);
const needFlags = (flags) => {
  const titles = new Set();
  for (const f of flags) for (const t of setterOf[f] ?? []) titles.add(`〈${t}〉`);
  return titles.size ? `遇過${[...titles].join("或")}的人才有` : "之前的事記得的人才有";
};

const md = (s) =>
  String(s ?? "")
    .replace(/\*\*(.+?)\*\*/g, '<em class="beat">$1</em>')
    .replace(/〔稱號〕/g, '<span class="ph">〔你的稱號〕</span>')
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>");

function whereOf(ev) {
  const c = ev.conditions || {};
  if (c.atLocation) return locName[c.atLocation] ?? c.atLocation;
  if (c.atProvince) return `${provName[c.atProvince]}各處`;
  return "路上";
}
function gateOf(ev) {
  const c = ev.conditions || {};
  const bits = [];
  if (c.requireFlags?.length) bits.push(needFlags(c.requireFlags).replace("的人才有", "之後才會遇到"));
  bits.push(c.baseWeight != null && c.baseWeight < 1 ? "稀有" : "常見");
  return bits.join(";");
}
function gatesOf(ch) {
  const g = [];
  if (ch.requirePerception) g.push("察覺到的人才有");
  if (ch.requireFlag) g.push(needFlags(ch.requireFlag.split("|")));
  if (ch.judge) {
    if (ch.judgeType?.startsWith("fortune")) g.push("看運氣");
    else g.push("比試:" + (ch.tags || []).map((t) => ABILITY[t] ?? t).join("或"));
  }
  return g;
}
function outcomeLabels(ch, evType) {
  if (ch.judgeType?.startsWith("fortune")) return ["靈", "不靈"];
  if (evType === "duel" || ch.failType === "loss") return ["贏", "輸"];
  return ["成", "不成"];
}
const fameOf = (o) => o?.fameVariants?.["fameTier>=4"]?.text;

const items = [];
for (const ev of events.pool.filter((e) => B.pick(e.eventId))) {
  const b = ev.beats;
  const body = [];
  body.push({ t: "scene", x: md(b.qi.text) });
  if (fameOf(b.qi)) body.push({ t: "fame", l: "出名之後,開場變成", x: md(fameOf(b.qi)) });
  if (ev.perception?.revealText) {
    const who = ev.perception.tag === "ergong" ? "耳力好" : ev.perception.tag === "yangong" ? "眼力好" : "察覺到";
    body.push({ t: "reveal", l: `${who}的人會多看到這一段`, x: md(ev.perception.revealText) });
  }
  for (const ch of b.cheng?.choices || []) {
    const out = b.he?.byChoice?.[ch.id] ?? {};
    const res = [];
    const zh = b.zhuan?.textByChoice?.[ch.id];
    if (zh) res.push({ l: null, x: md(zh) });
    if (out.success || out.fail) {
      const [ok, ng] = outcomeLabels(ch, ev.eventType);
      if (out.success) res.push({ l: ok, x: md(out.success.text) });
      if (out.fail) res.push({ l: ng, x: md(out.fail.text) });
    } else if (out.text) res.push({ l: null, x: md(out.text) });
    if (out.perceivedExtra) res.push({ l: "察覺到的人這條會多一段", x: md(out.perceivedExtra.text), k: "reveal" });
    if (fameOf(out)) res.push({ l: "出名之後這條變成", x: md(fameOf(out)), k: "fame" });
    body.push({ t: "pick", g: gatesOf(ch), x: md(ch.text), res });
  }
  if (!(b.cheng?.choices || []).length && b.he?.text) {
    body.push({ t: "plain", x: md(b.he.text) });
    if (b.he.perceivedExtra) body.push({ t: "reveal", l: "察覺到的人會多看到這一段", x: md(b.he.perceivedExtra.text) });
    if (fameOf(b.he)) body.push({ t: "fame", l: "出名之後,結尾變成", x: md(fameOf(b.he)) });
  }
  if (ev.variants?.crush?.text) body.push({ t: "crush", l: "練得很強的人,比試直接變成", x: md(ev.variants.crush.text) });
  const revisit = b.qi.variants?.revisit;
  items.push({
    kind: TYPE[ev.eventType] ?? ev.eventType,
    title: ev.title,
    where: whereOf(ev),
    gate: gateOf(ev),
    revisit: revisit ? md(revisit) : null,
    body
  });
}
if (!items.length) { console.error("這個批次抓不到任何事件"); process.exit(1); }

const N = items.length;
const DATA = JSON.stringify(items, null, 1);
const html = `<title>${B.title}</title>
<style>
  :root {
    --paper:#f4ecdc; --card:#fbf6ea; --card-sunk:#efe5cf;
    --ink:#2b2620; --ink-soft:#5d5346; --ink-faint:#8a7f6c;
    --rule:#c9b992; --rule-soft:#ded0ad;
    --zhu:#8c2f1b; --zhu-deep:#6e2313;
    --gold:#a8842c; --gold-wash:#a8842c14; --green:#4a6741; --blue:#3f5a73;
    --shadow:0 1px 2px rgba(43,38,32,.06), 0 8px 24px -16px rgba(43,38,32,.35);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper:#16130e; --card:#1e1a14; --card-sunk:#171410;
      --ink:#e9e0cb; --ink-soft:#a99c85; --ink-faint:#7c7261;
      --rule:#3c3529; --rule-soft:#2b261e;
      --zhu:#cf5f42; --zhu-deep:#e07a5c;
      --gold:#c8a447; --gold-wash:#c8a4471f; --green:#83a077; --blue:#8aa6c0;
      --shadow:0 1px 2px rgba(0,0,0,.4), 0 10px 30px -18px rgba(0,0,0,.9);
    }
  }
  :root[data-theme="dark"] {
    --paper:#16130e; --card:#1e1a14; --card-sunk:#171410;
    --ink:#e9e0cb; --ink-soft:#a99c85; --ink-faint:#7c7261;
    --rule:#3c3529; --rule-soft:#2b261e;
    --zhu:#cf5f42; --zhu-deep:#e07a5c;
    --gold:#c8a447; --gold-wash:#c8a4471f; --green:#83a077; --blue:#8aa6c0;
    --shadow:0 1px 2px rgba(0,0,0,.4), 0 10px 30px -18px rgba(0,0,0,.9);
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink);
    font-family:"Noto Serif TC","Source Han Serif TC","PMingLiU","MingLiU","Songti TC",serif;
    font-size:17px; line-height:1.95; -webkit-text-size-adjust:100%; }
  .ui { font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif; font-feature-settings:"tnum"; }
  header.top { padding:32px 20px 24px; text-align:center; border-bottom:1px solid var(--rule);
    background: radial-gradient(120% 90% at 50% -30%, var(--gold-wash), transparent 62%), var(--card-sunk); }
  .seal { font-family:"Noto Sans TC","PingFang TC",system-ui,sans-serif; font-size:.68rem;
    letter-spacing:.42em; text-indent:.42em; color:var(--ink-faint); margin:0 0 12px; }
  h1 { margin:0; font-size:1.7rem; font-weight:700; letter-spacing:.26em; text-indent:.26em; color:var(--zhu-deep); }
  .sub { margin:14px auto 0; max-width:31rem; font-size:.92rem; line-height:1.85; color:var(--ink-soft); }
  .sub b { color:var(--zhu); }
  .legend { margin:14px auto 0; max-width:31rem; display:flex; flex-wrap:wrap; justify-content:center; gap:6px 14px;
    font-family:"Noto Sans TC","PingFang TC",system-ui,sans-serif; font-size:.74rem; color:var(--ink-faint); }
  .legend i { font-style:normal; display:inline-block; width:.8em; height:.8em; margin-right:5px; vertical-align:-.05em; border-radius:1px; }
  .tally { position:sticky; top:0; z-index:20; background:color-mix(in srgb, var(--paper) 92%, transparent);
    backdrop-filter:blur(8px); border-bottom:1px solid var(--rule); padding:10px 16px;
    display:flex; align-items:center; gap:12px; }
  .marks { display:flex; gap:4px; flex:1; min-width:0; }
  .mk { flex:1; height:5px; border-radius:1px; background:var(--rule-soft); transition:background .25s ease; }
  .mk[data-v="pass"]{ background:var(--green); } .mk[data-v="revise"]{ background:var(--zhu); }
  .cnt { font-family:"Noto Sans TC","PingFang TC",system-ui,sans-serif; font-size:.78rem;
    font-variant-numeric:tabular-nums; color:var(--ink-soft); white-space:nowrap; }
  .jump { font-family:"Noto Sans TC","PingFang TC",system-ui,sans-serif; font-size:.76rem;
    border:1px solid var(--rule); background:var(--card); color:var(--ink-soft);
    border-radius:3px; padding:5px 10px; cursor:pointer; white-space:nowrap; }
  main { max-width:40rem; margin:0 auto; padding:8px 16px 96px; }
  article.slip { margin-top:26px; background:var(--card); border:1px solid var(--rule);
    border-left-width:4px; border-left-color:var(--rule-soft); border-radius:2px;
    box-shadow:var(--shadow); padding:22px 18px 0; transition:border-left-color .25s ease; }
  article.slip[data-v="pass"]{ border-left-color:var(--green); }
  article.slip[data-v="revise"]{ border-left-color:var(--zhu); }
  .rk { font-family:"Noto Sans TC","PingFang TC",system-ui,sans-serif; font-size:.72rem;
    letter-spacing:.18em; color:var(--gold); margin:0; }
  h2 { margin:5px 0 12px; font-size:1.32rem; letter-spacing:.12em; font-weight:700; }
  .meta { margin:0 0 14px; padding:9px 12px; background:var(--card-sunk); border-left:2px solid var(--rule);
    font-size:.84rem; line-height:1.75; color:var(--ink-soft); }
  .meta b { color:var(--ink); }
  .scene, .plain { margin:0 0 14px; padding:12px 14px; background:var(--card-sunk);
    border-left:2px solid var(--rule); line-height:1.9; }
  .scene { font-weight:700; }
  .box { margin:0 0 14px; padding:10px 13px; border-radius:2px; font-size:.93rem; line-height:1.85; color:var(--ink-soft); }
  .box .lbl { font-family:"Noto Sans TC","PingFang TC",system-ui,sans-serif; font-size:.68rem;
    letter-spacing:.16em; display:block; margin-bottom:5px; }
  .reveal { border:1px dashed var(--gold); } .reveal .lbl { color:var(--gold); }
  .fame { border:1px solid color-mix(in srgb, var(--zhu) 45%, transparent); } .fame .lbl { color:var(--zhu); }
  .fame .lbl::before { content:"★ "; }
  .crush { border:1px solid color-mix(in srgb, var(--blue) 50%, transparent); } .crush .lbl { color:var(--blue); }
  .crush .lbl::before { content:"◆ "; }
  .branch { margin:0 0 16px; }
  .pick { display:flex; gap:8px; font-weight:700; color:var(--zhu-deep); line-height:1.85; margin:0; }
  .pick::before { content:"▸"; flex:none; opacity:.65; }
  .out { margin:6px 0 0 18px; padding-left:12px; border-left:1px dotted var(--rule); line-height:1.9; }
  .out p { margin:0 0 8px; } .out p:last-child { margin-bottom:0; }
  .out .box { margin:8px 0 0; }
  .res { font-family:"Noto Sans TC","PingFang TC",system-ui,sans-serif; font-size:.7rem; letter-spacing:.12em;
    color:var(--card); background:var(--ink-faint); border-radius:2px; padding:1px 6px; margin-right:6px; vertical-align:.12em; }
  .gate { font-family:"Noto Sans TC","PingFang TC",system-ui,sans-serif; font-size:.68rem;
    letter-spacing:.1em; color:var(--gold); border:1px solid currentColor; border-radius:2px;
    padding:0 5px; margin-right:6px; vertical-align:.14em; white-space:nowrap; }
  .revisit { margin:0 0 14px; padding:9px 12px; border-left:2px solid var(--rule-soft);
    font-size:.88rem; color:var(--ink-faint); line-height:1.8; }
  .revisit .lbl { font-family:"Noto Sans TC","PingFang TC",system-ui,sans-serif; font-size:.68rem;
    letter-spacing:.16em; display:block; margin-bottom:4px; }
  em.beat { font-style:normal; font-weight:700; color:var(--ink); }
  .ph { color:var(--zhu); font-weight:700; }
  .verdict { margin:18px -18px 0; padding:12px 18px; border-top:1px solid var(--rule);
    background:var(--card-sunk); display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  .vq { font-family:"Noto Sans TC","PingFang TC",system-ui,sans-serif; font-size:.74rem;
    letter-spacing:.12em; color:var(--ink-faint); margin-right:2px; }
  .mark { font-family:"Noto Serif TC","PMingLiU",serif; font-size:.92rem; letter-spacing:.2em;
    text-indent:.2em; padding:7px 16px; border:1px solid var(--rule); background:var(--card);
    color:var(--ink-soft); border-radius:2px; cursor:pointer; transition:all .18s ease; }
  .mark:hover { border-color:var(--ink-faint); }
  .mark:focus-visible { outline:2px solid var(--gold); outline-offset:2px; }
  .mark[aria-pressed="true"][data-v="pass"]{ background:var(--green); border-color:var(--green); color:var(--card); }
  .mark[aria-pressed="true"][data-v="revise"]{ background:var(--zhu); border-color:var(--zhu); color:var(--card); }
  .note { flex:1 1 100%; font-family:"Noto Serif TC","PMingLiU",serif; font-size:.92rem; line-height:1.7;
    padding:8px 10px; border:1px solid var(--rule); border-radius:2px; background:var(--card);
    color:var(--ink); resize:vertical; min-height:2.6em; }
  .note::placeholder { color:var(--ink-faint); }
  .colophon { margin-top:38px; padding:22px 18px; border:1px solid var(--rule); border-radius:2px;
    background:var(--card-sunk); text-align:center; }
  .colophon h3 { margin:0 0 8px; font-size:1.05rem; letter-spacing:.2em; text-indent:.2em; color:var(--zhu-deep); }
  .colophon p { margin:0 auto 16px; max-width:27rem; font-size:.9rem; color:var(--ink-soft); }
  .copy { font-family:"Noto Serif TC","PMingLiU",serif; font-size:1rem; letter-spacing:.2em; text-indent:.2em;
    padding:11px 30px; border:1px solid var(--zhu); background:var(--zhu); color:var(--card);
    border-radius:2px; cursor:pointer; }
  .copy:hover { background:var(--zhu-deep); border-color:var(--zhu-deep); }
  .cn { margin-top:12px; font-family:"Noto Sans TC","PingFang TC",system-ui,sans-serif;
    font-size:.8rem; color:var(--green); min-height:1.4em; }
  .outbox { width:100%; margin-top:14px; font-family:ui-monospace,"Menlo","Consolas",monospace;
    font-size:.78rem; line-height:1.7; padding:10px; border:1px solid var(--rule); border-radius:2px;
    background:var(--card); color:var(--ink-soft); resize:vertical; }
  @media (prefers-reduced-motion: reduce) { * { transition:none !important; } }
  @media (min-width:700px) { article.slip { padding:26px 26px 0; } .verdict { margin:22px -26px 0; padding:14px 26px; } }
</style>

<header class="top">
  <p class="seal">${B.seal}</p>
  <h1>${B.h1}</h1>
  <p class="sub">${B.sub}</p>
  <div class="legend">
    <span><i style="border:1px dashed var(--gold)"></i>察覺到才看得到</span>
    <span><i style="border:1px solid var(--zhu)"></i>★ 出名之後</span>
    <span><i style="border:1px solid var(--blue)"></i>◆ 練得很強</span>
  </div>
</header>

<div class="tally ui">
  <div class="marks" id="marks" aria-hidden="true"></div>
  <span class="cnt" id="cnt">已批 0 / ${N}</span>
  <button class="jump" id="jump" type="button">下一件未批</button>
</div>

<main id="main"></main>

<script>
(function () {
  "use strict";
  var ITEMS = ${DATA};
  var KEY = ${JSON.stringify(B.key)};
  var COPY_HEAD = ${JSON.stringify(B.copyHead)};
  var state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { state = {}; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  var NUM = "一二三四五六七八九十";
  function cn(i) { i += 1; return i <= 10 ? NUM[i - 1] : "十" + (i % 10 ? NUM[i % 10 - 1] : ""); }

  function box(k, l, x) { return '<div class="box ' + k + '"><span class="lbl ui">' + l + '</span>' + x + '</div>'; }
  function bodyHtml(parts) {
    return parts.map(function (p) {
      if (p.t === "scene") return '<p class="scene">' + p.x + '</p>';
      if (p.t === "plain") return '<p class="plain">' + p.x + '</p>';
      if (p.t === "reveal" || p.t === "fame" || p.t === "crush") return box(p.t, p.l, p.x);
      if (p.t === "pick") {
        var gates = (p.g || []).map(function (g) { return '<span class="gate">' + g + '</span>'; }).join("");
        var res = (p.res || []).map(function (r) {
          if (r.k) return box(r.k, r.l, r.x);
          return '<p>' + (r.l ? '<span class="res">' + r.l + '</span>' : '') + r.x + '</p>';
        }).join("");
        return '<div class="branch"><p class="pick"><span>' + gates + p.x + '</span></p><div class="out">' + res + '</div></div>';
      }
      return "";
    }).join("");
  }

  var html = "";
  ITEMS.forEach(function (it, i) {
    var v = state[i] || {};
    html += '<article class="slip" id="s' + i + '"' + (v.mark ? ' data-v="' + v.mark + '"' : '') + '>' +
      '<p class="rk ui">' + cn(i) + ' ‧ ' + it.kind + '</p>' +
      '<h2>' + it.title + '</h2>' +
      '<p class="meta"><b>在哪遇到:</b>' + it.where + '<br><b>多常遇到:</b>' + it.gate + '</p>' +
      bodyHtml(it.body) +
      (it.revisit ? '<p class="revisit"><span class="lbl ui">第二次遇到的開場</span>' + it.revisit + '</p>' : '') +
      '<div class="verdict"><span class="vq ui">批一句</span>' +
        '<button class="mark" type="button" data-i="' + i + '" data-v="pass" aria-pressed="' + (v.mark === "pass") + '">過</button>' +
        '<button class="mark" type="button" data-i="' + i + '" data-v="revise" aria-pressed="' + (v.mark === "revise") + '">要改</button>' +
        '<textarea class="note" data-i="' + i + '" rows="2" placeholder="哪一段怪?一句就好"' +
          (v.mark === "revise" || (v.note && v.note.length) ? "" : " hidden") + '></textarea>' +
      '</div></article>';
  });
  html += '<div class="colophon"><h3>批完了</h3>' +
    '<p>這批已經上線,所以是上線後過稿——要改的我改完再推一次。</p>' +
    '<button class="copy" type="button" id="copy">複製批語</button>' +
    '<p class="cn ui" id="cn" role="status"></p>' +
    '<textarea class="outbox" id="outbox" rows="9" readonly hidden></textarea></div>';

  var main = document.getElementById("main");
  main.innerHTML = html;
  main.querySelectorAll(".note").forEach(function (t) { t.value = (state[Number(t.dataset.i)] || {}).note || ""; });

  var marksEl = document.getElementById("marks");
  var cntEl = document.getElementById("cnt");
  marksEl.innerHTML = ITEMS.map(function (_, i) { return '<span class="mk" data-i="' + i + '"></span>'; }).join("");
  function refresh() {
    var done = 0;
    ITEMS.forEach(function (_, i) {
      var m = (state[i] || {}).mark;
      var d = marksEl.querySelector('[data-i="' + i + '"]');
      if (m) { d.setAttribute("data-v", m); done++; } else { d.removeAttribute("data-v"); }
    });
    cntEl.textContent = "已批 " + done + " / " + ITEMS.length;
  }
  main.addEventListener("click", function (e) {
    var b = e.target.closest(".mark"); if (!b) return;
    var i = Number(b.dataset.i), v = b.dataset.v, cur = state[i] || {};
    cur.mark = (cur.mark === v) ? null : v; state[i] = cur; save();
    var s = document.getElementById("s" + i);
    if (cur.mark) s.setAttribute("data-v", cur.mark); else s.removeAttribute("data-v");
    s.querySelectorAll(".mark").forEach(function (x) { x.setAttribute("aria-pressed", String(x.dataset.v === cur.mark)); });
    var n = s.querySelector(".note");
    n.hidden = !(cur.mark === "revise" || (cur.note && cur.note.length));
    if (cur.mark === "revise") n.focus();
    refresh();
  });
  main.addEventListener("input", function (e) {
    var t = e.target.closest(".note"); if (!t) return;
    var i = Number(t.dataset.i); state[i] = state[i] || {}; state[i].note = t.value; save();
  });
  document.getElementById("jump").addEventListener("click", function () {
    for (var i = 0; i < ITEMS.length; i++) {
      if (!(state[i] || {}).mark) { document.getElementById("s" + i).scrollIntoView({ behavior:"smooth", block:"start" }); return; }
    }
    document.querySelector(".colophon").scrollIntoView({ behavior:"smooth", block:"center" });
  });
  document.getElementById("copy").addEventListener("click", function () {
    var lines = [COPY_HEAD, ""];
    ITEMS.forEach(function (it, i) {
      var v = state[i] || {};
      var m = v.mark === "pass" ? "過" : v.mark === "revise" ? "要改" : "還沒批";
      lines.push(cn(i) + " 《" + it.title + "》— " + m + (v.note ? "  ⟨" + v.note.trim() + "⟩" : ""));
    });
    var text = lines.join("\\n");
    var o = document.getElementById("outbox"), n = document.getElementById("cn");
    o.value = text;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { n.textContent = "複製好了,貼給我就行。"; o.hidden = true; },
        function () { o.hidden = false; o.select(); n.textContent = "這個瀏覽器不讓網頁自己複製,文字在下面,長按選取。"; });
    } else { o.hidden = false; o.select(); n.textContent = "文字在下面,長按選取複製。"; }
  });
  refresh();
})();
</script>
`;

writeFileSync(OUT, html, "utf8");
console.log("生成完成:", B.title, N, "件 →", OUT);
for (const it of items) console.log("  ", it.kind, "《" + it.title + "》", it.where, "|", it.gate);
