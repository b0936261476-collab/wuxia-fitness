# 素材資料夾(音樂與畫面)

把檔案丟進來,再到 `data/media.json` 填上路徑即生效,不用改程式。

```
assets/
  audio/   ← 音樂(bgm)與音效(sfx):.mp3 / .ogg
  img/     ← 圖片:.jpg / .png / .webp(建議壓在 300KB 以內,手機流量友善)
```

## 範例:掛一首江湖路的背景音樂

1. 把 `road-theme.mp3` 放進 `assets/audio/`
2. 打開 `data/media.json`,把 `bgm.byTab.road` 改成:

```json
"road": "assets/audio/road-theme.mp3"
```

3. 存檔、`git push`,線上就有音樂了(玩家可用右上角 🎵 開關)

## 範例:給「夜半笛聲」掛一張插圖

1. 把 `night-flute.jpg` 放進 `assets/img/`
2. 在 `data/media.json` 的 `images.events` 加:

```json
"FO-002_night_flute": "assets/img/night-flute.jpg"
```

## 注意

- 所有欄位都可以是 `null`(沒填 = 該處自動不顯示,不會壞)
- 瀏覽器規定:音樂要等玩家第一次點擊頁面後才會開始播(引擎已處理)
- 音樂記得用有授權的素材(或 AI 生成)
