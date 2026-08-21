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

## 範例:掛環境音(山上鳥叫、河邊水聲、鬧市人聲)

環境音是疊在背景音樂之上的第二音軌,跟著**事件的地域**自動切換、事件結束自動停。
`media.json` 的 `ambience.byRegion` 已列好目前事件庫用到的全部地域,填路徑即可:

```json
"山道": "assets/audio/amb-birds.mp3",
"碼頭": "assets/audio/amb-river.mp3",
"夜市": "assets/audio/amb-crowd.mp3"
```

也可用 `ambience.byEventId` 給單一事件指定專屬環境音(優先於地域)。

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

## AI 生圖提示詞(2026-08-21 給設計者的建議,生好丟進 img/ 即可)

**風格基底(每張共用)**
- 中文:水墨畫風格、宣紙米色背景、大量留白、淡墨暈染、遠山霧氣、少量硃砂紅點綴、武俠意境、無文字、橫幅構圖
- 英文:traditional Chinese ink wash painting, wuxia atmosphere, beige rice paper texture, negative space, misty mountains, vermillion accents, no text(Midjourney 橫幅 --ar 4:1、事件圖 --ar 10:3)

**五個位置的主體**:①頁首=官道獨行旅人+層疊山巒+孤松+雁陣(1200×300)②見聞=路邊茶棚熱茶(800×240)③抉擇=三岔路+路牌+佇立背影 ④比試=兩道剪影對峙塵土飛揚 ⑤機緣=崖頂觀雲海+淡月

**技巧**:同一批生成裡挑五張色調才統一;有亂碼文字就加「畫面中不要文字」/ --no text watermark;壓到 300KB 內(tinypng.com)。
