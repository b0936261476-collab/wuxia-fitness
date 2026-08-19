# Flag 台帳(flag_registry)

> 《事件庫生產規格書 v1》第三節:每個新 flag 必須登記——名稱|來源事件|預期命運(明線/暗線/沉線)|引用處。
> 未登記的 flag 視為自檢不通過。本檔與 `data/events.json` 同步維護。

## 秦大嫂線(1-1 ~ 1-4)

| flag | 來源 | 命運 | 引用處 / 後續 |
|---|---|---|---|
| purse_waited / purse_waited_night / purse_returned / purse_chased | 1-1 | 明+回聲 | L1:婦人/里正回聲;chased 者婦人認得臉 |
| qin_widow_knows_face | 1-1 D成功 | 暗線 | 後續同線事件文案分歧 |
| purse_pocketed{六兩} | 1-1 B | **樓梯第一階** | 1-2 觸發條件(3天後);敗露則惡名倍算;歸還扣六兩起(待金錢系統) |
| purse_pocketed_after_wait{六兩} | 1-1 A失敗→C2 | 樓梯第一階(較軟) | 1-2 觸發條件+「你等過」愧疚版起段 |
| purse_returned_lied | 1-2 A→A1 | 明+回聲 | L1:秦大嫂逢人說好人;玩家獨知成色 |
| purse_confessed | 1-2 A→A2 | 明+回聲 | L1:「肯回頭的人不多」——同線最暖版 |
| purse_returned_anon / hidden_virtue_purse | 1-2 B | 暗線(陰德) | 日後可能傳開補發(見證原則) |
| purse_to_school | 1-2 D | 明+暗雙線 | 學堂線開;秦大嫂永不知情 |
| purse_ignored_notice | 1-2 C | 樓梯二階 | 二度別過頭的紀錄 |
| purse_lied_as_hero | 1-2 C 名人版 | **偽君子引信①** | 敗露事件:「原來你是個偽君子」由她親口說出 |
| purse_earning_back | 1-2 E | 進行中 | 勞務折銀狀態;1-3 結算 |
| purse_repaid_intime | 1-3 結局一 | 明+暗雙線 | 愧疚暗線:秦大嫂回聲永遠帶刺 |
| purse_repaid_late / boy_working_dock | 1-3 結局二 | 暗線 | 碼頭做工的孩子線 |
| purse_ignored | 1-3 結局三 | **樓梯第三階(3天後)** | 1-4 觸發條件 |
| boy_saved_mother | 1-4 A | 明+回聲 | L1:碼頭/小鎮回聲(歇工念書的少年) |
| boy_knows_truth | 1-4 A2 | 暗線 | 「被原諒但不被忘記」底色 |
| boy_will_seek_you | 1-4 A2 | **暗線・長線(休眠)** | 拜師/報恩/討帳三路皆通,屆時再定 |
| boy_knows_your_name | 1-4 A2 名人版 | 暗線 | 少年知道玩家稱號 |
| boy_abandoned(/_broke) | 1-4 C(/C_broke) | **底層長線** | 數年後邪道年輕高手,不上榜、只找玩家 |

## 日常/抉擇/對決/機緣(DA / CH / DU / FO)

| flag | 來源 | 命運 | 引用處 / 後續 |
|---|---|---|---|
| dyg_rumor_heard | DA-001 察覺即得 | 暗線 | 斷雲崗支線(延後製作)開啟時回收 |
| dyg_rumor_deep | DA-001 C成功 | 暗線 | 同上,深一層 |
| witnessed_silent_hunt | DA-001 D(輾壓級) | 沉線 | 無聲獵殺懸案,可認領 |
| sugar_old_man_gift | DA-002 A | 暗線 | 賣糖翁(#79)線,踏階糖人 |
| sugar_man_seen_through / lesson_guard_your_eyes | DA-002 C | 暗線 | 「看破守不住」教訓伏筆,日後可回收成真 |
| sugar_man_peer_talk | DA-002 D(輾壓級) | 暗線 | 賣糖翁線正式開啟位 |
| heard_shoe_saying | DA-003 A | 沉線 | 行話「看人先看鞋」 |
| met_reformed_whipman | DA-003 C | 暗線(睡眠) | 改行的鞭客,日後任何線可認領 |
| whipman_rain_promise | DA-003 D(輾壓級) | 暗線 | 雨中之諾——自帶未來事件入口 |
| herb_rhyme_heard | DA-004 A | 明線 | FO-001 觸發鑰匙(順口溜) |
| scale_exposed | CH-001 A | 明+回聲 | 黑心秤被砸 |
| scale_warned | CH-001 B | 回聲 | 婆婆那句話 |
| scale_ignored | CH-001 C | 沉線 | 換一家買米 |
| scale_lied_as_hero | CH-001 C 名人版 | **偽君子引信②** | 與 purse_lied_as_hero 同族,敗露可合併結算 |
| scale_boss_marked_you | CH-001 D(輾壓級) | 暗線(睡眠) | 滴水不漏的掌櫃「記住您了」 |
| fight_stopped / fight_stopped_by_name | CH-002 A | 明+回聲 | 名字壓架——樑子未解只是延期 |
| feud_brewing | CH-002 A | 暗線(L3候選) | 兩家樑子,滾成械鬥人命的候補 |
| feud_witnessed | CH-002 B | 沉線 | 你在場 |
| fight_watched_as_hero | CH-002 B 名人版 | **偽君子引信③** | 名聲越大,袖手越響 |
| met_whisper_broker | CH-002 D(輾壓級) | **暗線(重量級睡眠)** | 遞話人——他反手把你認清楚了 |
| dock_wrestled | DU-001 A/C | 沉線 | 碼頭人脈候補 |
| dock_trick_exposed | DU-001 C | 沉線 | 看破凹槽把戲 |
| wanderer_sparred | DU-002 A/B/C/E | 沉線 | 切磋之緣 |
| saw_spearman_truth | DU-002 E | 暗線 | 看出棍是槍 |
| spearman_three_moves | DU-002 E成功 | 暗線 | 棄槍人真三招——改行人群像第二位 |
| cliff_marked | FO-001 A失敗/B失敗/C | 暗線 | 記住那道崖,重訪候補 |
| ate_owned_herb | FO-001 成功+輾壓級 | 暗線(小) | 吃了有主的藥 |
| herb_farmer_friend | FO-001 D(輾壓級) | 暗線(睡眠) | 藥農之交,藥線/毒醫谷線可回收 |
| flute_source_seen | FO-002 A成功 | 暗線 | 見過吹笛人背影 |
| empty_tassel_seen | FO-002 A成功+眼功察覺 | 暗線 | **劍宗線專屬線索**(空穗環) |
| flute_listened | FO-002 B | 沉線 | 尊重了不想被找到的人 |
| flute_duet | FO-002 C成功 | 暗線 | 日後揭曉:全遊戲最溫柔的一次「原來是你」 |
| flute_trust | FO-002 A成功 名人版 | 暗線 | 「不入江湖傳聞——有勞」 |

## 引擎自動落地的 flag

| flag | 來源 | 說明 |
|---|---|---|
| surpassed_{rank} | game.js updateRanking | 超越具名 NPC(§9.9),一次性快報+俠名獎勵 |

## 序章/教學(TU-000 ~ TU-006,2026-08-19 入庫)

| flag | 來源 | 命運 | 引用處 / 後續 |
|---|---|---|---|
| heard_sitianjian | TU-001 出村 | 暗線 | 司天監首次入耳(「路上少打聽」) |
| road_town / road_river / road_mountain | TU-002 三岔口 | 暗線 | 路向權重:日後量產事件掛路向加權(三選一,互斥) |
| dog_bridge | TU-003 A失敗 | 沉線 | 教科書式沉線——也許某天土狗會再出現,也許不會 |
| temple_footprint | TU-005 A | 暗線 | 黑衣人線索之一(廟外半個腳印) |
| saw_qunxialu | TU-006 | 暗線 | 已見過群俠錄榜文 |
