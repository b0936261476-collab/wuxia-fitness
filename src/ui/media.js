// 音樂與畫面掛載引擎(data/media.json)
// 原則:所有素材欄位可為 null——沒填就整個功能靜默隱藏,絕不報錯、不擋遊戲。
// 瀏覽器自動播放限制:BGM 在玩家第一次點擊頁面後才真正開聲。

let media = null;
let bgmAudio = null;      // 目前的 <audio> 實例
let currentBgmSrc = null;
let pendingBgmSrc = null; // 尚未解鎖自動播放時,先記住想播的曲子
let unlocked = false;     // 玩家是否已互動過(自動播放解鎖)
let muted = localStorage.getItem("wuxia-media-muted") === "1";

export function initMedia(mediaData) {
  media = mediaData || null;
  // 第一次互動解鎖音訊(瀏覽器政策)
  const unlock = () => {
    unlocked = true;
    if (pendingBgmSrc && !muted) startBgm(pendingBgmSrc);
    document.removeEventListener("pointerdown", unlock);
  };
  document.addEventListener("pointerdown", unlock);
}

export function hasAnyBgm() {
  if (!media?.bgm) return false;
  const b = media.bgm;
  return Boolean(
    b.default || b.quiz ||
    Object.values(b.byTab || {}).some(Boolean) ||
    Object.values(b.byEventType || {}).some(Boolean)
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
  } else if (currentBgmSrc || pendingBgmSrc) {
    startBgm(currentBgmSrc || pendingBgmSrc);
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
