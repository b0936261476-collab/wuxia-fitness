// 音樂與畫面掛載引擎(data/media.json)
// 原則:所有素材欄位可為 null——沒填就整個功能靜默隱藏,絕不報錯、不擋遊戲。
// 瀏覽器自動播放限制:BGM 在玩家第一次點擊頁面後才真正開聲。

let media = null;
let bgmAudio = null;      // BGM 音軌
let currentBgmSrc = null;
let pendingBgmSrc = null; // 尚未解鎖自動播放時,先記住想播的曲子
let ambAudio = null;      // 環境音軌(疊在 BGM 之上)
let currentAmbSrc = null;
let pendingAmbSrc = null;
let unlocked = false;     // 玩家是否已互動過(自動播放解鎖)
let muted = localStorage.getItem("wuxia-media-muted") === "1";

export function initMedia(mediaData) {
  media = mediaData || null;
  // 第一次互動解鎖音訊(瀏覽器政策)
  const unlock = () => {
    unlocked = true;
    if (pendingBgmSrc && !muted) startBgm(pendingBgmSrc);
    if (pendingAmbSrc && !muted) startAmbience(pendingAmbSrc);
    document.removeEventListener("pointerdown", unlock);
  };
  document.addEventListener("pointerdown", unlock);
}

export function hasAnyBgm() {
  // 有任何聲音素材(BGM/環境音/音效)就顯示靜音開關
  const b = media?.bgm, a = media?.ambience, s = media?.sfx;
  return Boolean(
    b && (b.default || b.quiz ||
      Object.values(b.byTab || {}).some(Boolean) ||
      Object.values(b.byEventType || {}).some(Boolean)) ||
    a && (Object.values(a.byEventId || {}).some(Boolean) ||
      Object.values(a.byRegion || {}).some(Boolean)) ||
    s && ["judgeSuccess", "judgeFail", "choice", "levelup"].some((k) => s[k])
  );
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  localStorage.setItem("wuxia-media-muted", muted ? "1" : "0");
  if (muted) {
    bgmAudio?.pause();
    ambAudio?.pause();
  } else {
    if (currentBgmSrc || pendingBgmSrc) startBgm(currentBgmSrc || pendingBgmSrc);
    if (currentAmbSrc || pendingAmbSrc) startAmbience(currentAmbSrc || pendingAmbSrc);
  }
  return muted;
}

/** 依情境解析並切換 BGM。context: {quiz?:true, tab?:string, eventType?:string} */
export function playBgm(context = {}) {
  if (!media?.bgm) return;
  const b = media.bgm;
  const src =
    (context.quiz ? b.quiz : null) ??
    (context.eventType ? b.byEventType?.[context.eventType] : null) ??
    (context.tab ? b.byTab?.[context.tab] : null) ??
    b.default;
  if (!src) { stopBgm(); return; }
  if (src === currentBgmSrc && bgmAudio && !bgmAudio.paused) return; // 同曲不重播
  if (!unlocked || muted) { pendingBgmSrc = src; return; }
  startBgm(src);
}

function startBgm(src) {
  if (bgmAudio && currentBgmSrc === src) {
    bgmAudio.play().catch(() => {});
    return;
  }
  bgmAudio?.pause();
  bgmAudio = new Audio(src);
  bgmAudio.loop = true;
  bgmAudio.volume = media?.bgm?.volume ?? 0.5;
  bgmAudio.play().catch(() => {}); // 檔案缺失或政策阻擋:靜默略過
  currentBgmSrc = src;
  pendingBgmSrc = null;
}

export function stopBgm() {
  bgmAudio?.pause();
  currentBgmSrc = null;
  pendingBgmSrc = null;
}

// ---------- 環境音(第二音軌:山有鳥鳴、水有濤聲、市有人聲) ----------

/**
 * 依事件掛環境音。解析順序:byEventId[eventId] > byRegion(依地域標籤逐一比對,取第一個有登記的)。
 * 找不到對應 → 靜默停掉現有環境音。
 */
export function playAmbience(eventId, regions = []) {
  const amb = media?.ambience;
  if (!amb) return;
  let src = amb.byEventId?.[eventId] ?? null;
  if (!src) {
    for (const r of regions) {
      if (amb.byRegion?.[r]) { src = amb.byRegion[r]; break; }
    }
  }
  if (!src) { stopAmbience(); return; }
  if (src === currentAmbSrc && ambAudio && !ambAudio.paused) return;
  if (!unlocked || muted) { pendingAmbSrc = src; currentAmbSrc = src; return; }
  startAmbience(src);
}

function startAmbience(src) {
  if (ambAudio && currentAmbSrc === src && !ambAudio.paused) return;
  ambAudio?.pause();
  ambAudio = new Audio(src);
  ambAudio.loop = true;
  ambAudio.volume = media?.ambience?.volume ?? 0.4;
  ambAudio.play().catch(() => {});
  currentAmbSrc = src;
  pendingAmbSrc = null;
}

export function stopAmbience() {
  ambAudio?.pause();
  currentAmbSrc = null;
  pendingAmbSrc = null;
}

/** 音效:name = judgeSuccess | judgeFail | choice | levelup */
export function playSfx(name) {
  const src = media?.sfx?.[name];
  if (!src || muted || !unlocked) return;
  const a = new Audio(src);
  a.volume = media?.sfx?.volume ?? 0.7;
  a.play().catch(() => {});
}

/** 事件插圖:指定 > 地域備援 > 類型備援;無則 null(UI 不顯示) */
export function eventImage(eventId, eventType, region) {
  const img = media?.images;
  if (!img) return null;
  return img.events?.[eventId] ?? (region ? img.byRegion?.[region] : null) ?? img.byEventType?.[eventType] ?? null;
}

export function headerImage() {
  return media?.images?.header ?? null;
}

export function quizImage() {
  return media?.images?.quiz ?? null;
}
