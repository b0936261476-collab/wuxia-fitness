// 從 data/events.json 直接生出十強真容的過稿頁。
// 重點是「不手抄」:過稿頁上的字必須跟遊戲裡跑的是同一份,否則設計者過的稿
// 跟實際上線的內容會悄悄分岔。用法:node scripts/render-top10-review.mjs [輸出路徑]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.argv[2] ?? join(ROOT, "十強真容_過稿頁.html");
const J = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const events = J("data/events.json");
const npcs = J("data/npcs.json");
const map = J("data/map.json");

const locName = {};
for (const p of map.provinces) for (const l of p.locations) locName[l.id] = `${l.name}(${p.name})`;
const provName = Object.fromEntries(map.provinces.map((p) => [p.id, p.name]));

const ORDER = [3, 4, 5, 6, 7, 8, 9];
const BIND_RANK = {};
for (const n of npcs.top100) BIND_RANK[n.name] = n;

const esc = (s) => String(s ?? "");
const md = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<em class="beat">$1</em>')
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
  const flags = (c.requireFlags || []).filter((f) => !f.startsWith("surpassed_"));
  const rank = (c.requireFlags || []).find((f) => f.startsWith("surpassed_"));
  const bits = [];
  if (rank) bits.push(`要先在榜上壓過第 ${rank.replace("surpassed_", "")} 名`);
  if (flags.length) bits.push(`還要先 ${flags.join(" / ")}`);
  bits.push(`遇到的機率很低(權重 ${c.baseWeight}）`);
  return bits.join(";");
}

const items = [];
for (const rank of ORDER) {
  const ev = events.pool.find((e) => e.eventId.startsWith("TEN-") && BIND_RANK[e.npcBind]?.rank === rank);
  if (!ev) { console.error("找不到第", rank, "名的事件"); continue; }
  const npc = BIND_RANK[ev.npcBind];
  const body = [];
  body.push({ t: "scene", x: md(ev.beats.qi.text) });
  if (ev.perception?.revealText) {
    body.push({ t: "reveal", x: md(ev.perception.revealText) });
  }
  for (const ch of ev.beats.cheng.choices || []) {
    const out = ev.beats.he.byChoice?.[ch.id];
    body.push({
      t: "pick",
      g: ch.requirePerception ? "察覺到的人才有" : null,
      x: md(ch.text),
      out: md(out?.text ?? "")
    });
  }
  const revisit = ev.beats.qi.variants?.revisit;
  items.push({
    rank: `第 ${npc.rank} 名`,
    name: npc.name,
    nick: npc.nickname ?? "",
    title: ev.title,
    where: whereOf(ev),
    gate: gateOf(ev),
    revisit: revisit ? md(revisit) : null,
    body
  });
}

const DATA = JSON.stringify(items, null, 1);

const html = `<title>一步一江湖 十強真容全文</title>
<style>
  :root {
    --paper:#f4ecdc; --card:#fbf6ea; --card-sunk:#efe5cf;
    --ink:#2b2620; --ink-soft:#5d5346; --ink-faint:#8a7f6c;
    --rule:#c9b992; --rule-soft:#ded0ad;
    --zhu:#8c2f1b; --zhu-deep:#6e2313;
    --gold:#a8842c; --gold-wash:#a8842c14; --green:#4a6741;
    --shadow:0 1px 2px rgba(43,38,32,.06), 0 8px 24px -16px rgba(43,38,32,.35);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper:#16130e; --card:#1e1a14; --card-sunk:#171410;
      --ink:#e9e0cb; --ink-soft:#a99c85; --ink-faint:#7c7261;
      --rule:#3c3529; --rule-soft:#2b261e;
      --zhu:#cf5f42; --zhu-deep:#e07a5c;
      --gold:#c8a447; --gold-wash:#c8a4471f; --green:#83a077;
      --shadow:0 1px 2px rgba(0,0,0,.4), 0 10px 30px -18px rgba(0,0,0,.9);
    }
  }
  :root[data-theme="dark"] {
    --paper:#16130e; --card:#1e1a14; --card-sunk:#171410;
    --ink:#e9e0cb; --ink-soft:#a99c85; --ink-faint:#7c7261;
    --rule:#3c3529; --rule-soft:#2b261e;
    --zhu:#cf5f42; --zhu-deep:#e07a5c;
    --gold:#c8a447; --gold-wash:#c8a4471f; --green:#83a077;
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
    letter-spacing:.18em; color:var(--gold); }
  h2 { margin:5px 0 2px; font-size:1.32rem; letter-spacing:.12em; font-weight:700; }
  .who { font-family:"Noto Sans TC","PingFang TC",system-ui,sans-serif; font-size:.76rem;
    letter-spacing:.1em; color:var(--ink-faint); margin:0 0 12px; }
  .meta { margin:0 0 14px; padding:9px 12px; background:var(--card-sunk); border-left:2px solid var(--rule);
    font-size:.84rem; line-height:1.75; color:var(--ink-soft); }
  .meta b { color:var(--ink); }
  .scene { margin:0 0 14px; padding:12px 14px; background:var(--card-sunk);
    border-left:2px solid var(--rule); font-weight:700; line-height:1.9; }
  .reveal { margin:0 0 14px; padding:10px 13px; border:1px dashed var(--gold);
    border-radius:2px; font-size:.93rem; line-height:1.85; color:var(--ink-soft); }
  .reveal .lbl { font-family:"Noto Sans TC","PingFang TC",system-ui,sans-serif; font-size:.68rem;
    letter-spacing:.16em; color:var(--gold); display:block; margin-bottom:5px; }
  .branch { margin:0 0 16px; }
  .pick { display:flex; gap:8px; font-weight:700; color:var(--zhu-deep); line-height:1.85; }
  .pick::before { content:"▸"; flex:none; opacity:.65; }
  .out { margin:6px 0 0 18px; padding-left:12px; border-left:1px dotted var(--rule); line-height:1.9; }
  .gate { font-family:"Noto Sans TC","PingFang TC",system-ui,sans-serif; font-size:.68rem;
    letter-spacing:.1em; color:var(--gold); border:1px solid currentColor; border-radius:2px;
    padding:0 5px; margin-right:6px; vertical-align:.14em; white-space:nowrap; }
  .revisit { margin:0 0 14px; padding:9px 12px; border-left:2px solid var(--rule-soft);
    font-size:.88rem; color:var(--ink-faint); line-height:1.8; }
  .revisit .lbl { font-family:"Noto Sans TC","PingFang TC",system-ui,sans-serif; font-size:.68rem;
    letter-spacing:.16em; display:block; margin-bottom:4px; }
  em.beat { font-style:normal; font-weight:700; color:var(--ink); }
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
  .note[hidden]{ display:none; }
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
  .outbox[hidden]{ display:none; }
  @media (prefers-reduced-motion: reduce) { * { transition:none !important; } }
  @media (min-width:700px) { article.slip { padding:26px 26px 0; } .verdict { margin:22px -26px 0; padding:14px 26px; } }
</style>

<header class="top">
  <p class="seal">一步一江湖 ‧ 十強真容 ‧ 補完七件</p>
  <h1>全 文</h1>
  <p class="sub">首批三件你已經過稿,這是照同調性補完的七件——<b>這次是全文,不是摘要。</b><br>
    每件的順序就是遊戲裡的順序:開場、察覺到的人多看到的、然後每個選項與結果。<br>
    顧驚鴻那件已依你的批語重寫(原本「留情害死滿門→從此不敢用全力」因果是反的)。</p>
</header>

<div class="tally ui">
  <div class="marks" id="marks" aria-hidden="true"></div>
  <span class="cnt" id="cnt">已批 0 / 7</span>
  <button class="jump" id="jump" type="button">下一件未批</button>
</div>

<main id="main"></main>

<script>
(function () {
  "use strict";
  var ITEMS = ${DATA};
  var KEY = "wuxia-top10b-review-v1";
  var state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { state = {}; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  function bodyHtml(parts) {
    return parts.map(function (p) {
      if (p.t === "scene") return '<p class="scene">' + p.x + '</p>';
      if (p.t === "reveal") return '<p class="reveal"><span class="lbl ui">察覺到的人會多看到這一段</span>' + p.x + '</p>';
      if (p.t === "pick") {
        return '<div class="branch"><p class="pick"><span>' +
          (p.g ? '<span class="gate">' + p.g + '</span>' : '') + p.x + '</span></p>' +
          '<div class="out">' + p.out + '</div></div>';
      }
      return "";
    }).join("");
  }

  var html = "";
  ITEMS.forEach(function (it, i) {
    var v = state[i] || {};
    html += '<article class="slip" id="s' + i + '"' + (v.mark ? ' data-v="' + v.mark + '"' : '') + '>' +
      '<p class="rk ui">' + it.rank + '</p>' +
      '<h2>' + it.title + '</h2>' +
      '<p class="who ui">' + it.name + (it.nick ? ' ‧ ' + it.nick : '') + '</p>' +
      '<p class="meta"><b>在哪遇到:</b>' + it.where + '<br><b>怎麼才遇得到:</b>' + it.gate + '</p>' +
      bodyHtml(it.body) +
      (it.revisit ? '<p class="revisit"><span class="lbl ui">第二次遇到的開場</span>' + it.revisit + '</p>' : '') +
      '<div class="verdict"><span class="vq ui">批一句</span>' +
        '<button class="mark" type="button" data-i="' + i + '" data-v="pass" aria-pressed="' + (v.mark === "pass") + '">過</button>' +
        '<button class="mark" type="button" data-i="' + i + '" data-v="revise" aria-pressed="' + (v.mark === "revise") + '">要改</button>' +
        '<textarea class="note" data-i="' + i + '" rows="2" placeholder="哪一段怪?一句就好"' +
          (v.mark === "revise" || (v.note && v.note.length) ? "" : " hidden") + '>' + (v.note || "") + '</textarea>' +
      '</div></article>';
  });
  html += '<div class="colophon"><h3>批完了</h3>' +
    '<p>七件都已經上線,所以這是上線後過稿——要改的我改完再推一次。</p>' +
    '<button class="copy" type="button" id="copy">複製批語</button>' +
    '<p class="cn ui" id="cn" role="status"></p>' +
    '<textarea class="outbox" id="outbox" rows="9" readonly hidden></textarea></div>';

  var main = document.getElementById("main");
  main.innerHTML = html;

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
    var lines = ["十強真容・補完七件", ""];
    ITEMS.forEach(function (it, i) {
      var v = state[i] || {};
      var m = v.mark === "pass" ? "過" : v.mark === "revise" ? "要改" : "還沒批";
      lines.push(it.name + "《" + it.title + "》— " + m + (v.note ? "  ⟨" + v.note.trim() + "⟩" : ""));
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
console.log("生成完成:", items.length, "件");
for (const it of items) console.log("  ", it.rank, it.name, "《" + it.title + "》", it.where);
