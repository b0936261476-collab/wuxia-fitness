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

## B2 批次(DA-005 ~ FO-004,2026-08-20 入庫)

| flag | 來源 | 命運 | 引用處 / 後續 |
|---|---|---|---|
| heard_mountain_saying | DA-006 | 沉線 | 山裡行話「迷路找水」 |
| woodsman_bow_seen | DA-006 察覺 | 暗線(睡眠) | 樵夫替誰養的弓?獵戶/黑衣線可認領 |
| tightrope_kindness | DA-007 輾壓級 | 暗線 | 走索人的人情——被看見了還替他收著 |
| drunkard_subdued | CH-003 A成功 | 暗線 | 醉漢=碼頭苦力,碼頭事件人情回聲候補 |
| wonton_walked_by | CH-003 C | 沉線 | 糖葫蘆沒平時甜 |
| gave_seat_medicine | CH-004 A | 暗線 | 抱藥婦人的人情,醫館/藥線可回收 |
| ferryman_grudge | CH-004 C | 暗線(睡眠) | 被砸了買賣的艄公——那不是感激的眼神 |
| caravan_friend | CH-005 A成功 | 暗線 | 商隊人脈(「考慮走鏢嗎?」) |
| landslide_manmade | CH-005 B成功+察覺(深25) | **暗線(睡眠)** | 塌方是人為的——劫道線候補 |
| river_respect | DU-003 A成功 | 暗線 | 渡口人脈,「水爺」回聲 |
| river_prodigy_seen | DU-003 C | 暗線 | 江心蓑衣師父(留白)——水線人物候補 |
| hunter_respect | DU-004 A/C成功 | 暗線 | 山線人脈;與 DA-006 樵夫的弓可互文 |
| lantern_tune | FO-003 A成功 | 暗線 | 燈籠老人哼的老調——與「燈」意象同源留白 |
| lantern_man_met | FO-003 C | **暗線(睡眠・高規格)** | 「有些霧,散不掉喔」——主線外圍,認領需設計者定奪 |
| fisher_met | FO-004 A成功 | 暗線 | 老漁夫,聽水辨魚汛 |
| fisher_song_heard | FO-004 B | 沉線 | 夢裡聽不懂的詞 |
| river_rite_seen | FO-004 C | 暗線 | 江上法事為誰超度?水線懸案候補 |
| cliff_conquered_weak | FO-001 仰望成功 | 暗線 | 以弱摘藥——採藥人都得敬三分 |
| flute_membrane | FO-002 仰望成功 | 暗線 | 窗台上的斷笛膜——被注意到了 |

## B3 批次(後續回聲,DA-008 ~ DA-010,2026-08-21 入庫)

| flag | 來源 | 命運 | 引用處 / 後續 |
|---|---|---|---|
| ferry_debt_repaid | DA-008 | 回聲收尾 | 婦人的人情落地(藥草) |
| ferry_grudge_endured | CH-006 A | 沉線 | 樑子繼續淤著 |
| ferry_grudge_settled | CH-006 B | 回聲收尾 | 和了一半(清除 ferryman_grudge) |
| ferryman_owes_you | CH-006 C | 暗線 | 這條江上有個艄公欠你一次(清除 grudge) |
| fiddler_knows_tune | DA-009(跟燈版) | **暗線(高規格)** | 「聽過的人都不在了」——燈籠人線再深一寸 |
| fiddler_fled_from_name | DA-009 跟燈版・名人 | 暗線 | 他本來想說什麼的;名聲讓他嚥了回去 |
| fiddler_blessing | DA-009(站住版) | 暗線 | 琴師說的「他」是誰? |
| wine_poured | CH-007 A | 暗線 | 替老漁夫倒了酒——「水裡的」是誰,留白 |
| wine_declined | CH-007 B | 沉線 | 搖不動櫓的手 |
| sunken_ship_heard | DA-010 | **暗線(懸案)** | 十年前無風無浪沉的船、空船艙——水線懸案主鉤 |
| gossip_fled_from_name | DA-010 法事版・名人 | 沉線 | 名聲讓人把嘴閉緊 |

## B4 批次(日常池,DA-011 ~ DA-013,2026-08-22 入庫)

| flag | 來源 | 命運 | 引用處 / 後續 |
|---|---|---|---|
| smith_swords_seen | DA-011 察覺 | 暗線(睡眠) | 誰來小鎮訂一批劍?兵事/劫道線候補 |
| pavilion_carving_seen | DA-012 察覺 | **暗線(高規格留白)** | 二十年前的落款、新鮮的刻痕——「娘,雪停了我就回去。」 |
| saw_go_trap | DU-005 C | 沉線 | 看破殘局套路;老者贈言「別急著贏」 |
| dock_cipher_heard | CH-009 C | **暗線(睡眠)** | 碼頭暗語「初七的集不要去」——幫派/私鹽線候補 |
| bell_inscription_read | FO-006 A成功 | **暗線(懸案)** | 「敕建普濟寺鎮水」——不存在的廟;與十年沉船同屬水線 |
| temple_ford_name | FO-006 名人版 | 暗線 | 渡口老名字叫「寺前」——名聲換來的多一句 |

## B5 批次(伏筆二響+日常,DA-014 ~ FO-008,2026-08-22 入庫)

| flag | 來源 | 命運 | 引用處 / 後續 |
|---|---|---|---|
| sword_cart_seen | DA-014 | **暗線(兵器流向)** | 夜裝的騾車往東——官道,也是山;與 smith_swords_seen 同線 |
| bow_returned_seen | DA-015 | 暗線 | 「人走了。弓得回家。」弓主人是誰,留白 |
| go_regret_solved | FO-007 A成功 | 回聲收尾 | 二十年殘局收了;「不是他棋高。是他敢。」 |
| cipher_nod / cipher_came_true / cipher_hush | CH-011 | **暗線(幫派/私鹽線)** | 暗語應驗;官差名單「又撲空」;漢子的噤聲手勢 |
| board_elder_seen | DA-016 察覺 | 沉線 | 摸榜尾名字的老者——誰的名字?他是誰? |
| pay_it_forward | CH-012 A/C | 暗線(陰德) | 「留給後來人」的火傳了下去;無見證,俠名±0 |
| willow_walked / willow_coin | CH-013 | **暗線(高規格留白)** | 柳家坳沒了;「只要還有人肯接這一問,它就還在。」銅錢是溫的 |
| bell_coin_added | FO-008 A成功 | 暗線 | 無名祠添了第十八枚錢 |
| gray_keeper_heard | FO-008 名人版 | **暗線(睡眠)** | 每年清明添錢的灰衣人——不是監裡的,瘸一條腿 |
