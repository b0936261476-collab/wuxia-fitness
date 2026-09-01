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

## B6 批次(通用池,DA-017 ~ FO-010,2026-08-23 入庫)

| flag | 來源 | 命運 | 引用處 / 後續 |
|---|---|---|---|
| bloody_traveler_seen | DA-018 察覺 | 沉線 | 衣角帶血的夜行人——走得動的人,還不用人操心 |
| bandit_act_exposed | CH-014 D | 沉線 | 「回去練!」散夥的戲班 |
| dice_cheat_exposed | CH-016 C | 暗線 | 被砸場子的莊家——同族:scale_boss_marked_you |
| stele_name_gone | FO-009 A成功 | **暗線(留白)** | 去思碑上被鑿掉的名字——立碑的捨不得他走,鑿碑的容不下他留名 |
| star_wish_granted | FO-010 A成功 | 沉線 | 路邊還溫著的烤地瓜,不深究 |

## B7 批次(伏筆三響+出名者專屬,CH-017 ~ CH-024,2026-08-30 入庫)

| flag | 來源 | 命運 | 引用處 / 後續 |
|---|---|---|---|
| sword_village_known | CH-017 全結局 | 回聲收尾 | 劍線三響收線:劍去了東邊被山匪掃過的村子 |
| taught_east_village | CH-017 A | 沉線 | 下場教過農夫;老鐵匠「上回那瓢,還你」 |
| blunt_swords_known | CH-017 C | **暗線(守密)** | 你知道十二把劍全沒開刃——爛在肚子裡的秘密 |
| cipher_warned_you | CH-018 全結局 | 回聲收尾 | 暗語線三響收線:這回真的只是橋(大概) |
| bridge_heeded / bridge_vaulted / bridge_fell_in / bridge_marked | CH-018 | 沉線 | 過橋方式;bridge_marked=在橋頭留了「三、七、九,糟」 |
| boy_grown_seen | CH-019 全結局 | 回聲收尾 | 少年線收線:藥錢清了、記帳了、「換我請你吃麵」 |
| boy_gift_shoes | CH-019 A | 沉線 | 秦大嫂納的千層底;「她量過你的腳印」 |
| boy_refused_money / boy_keeps_reading | CH-019 B/C | 沉線 | 兩個銅板「買碗麵」;新封皮的舊書 |
| gray_keeper_met | FO-011 全結局 | 回聲收尾 | 灰衣人線收一半:見過了 |
| keeper_names_heard | FO-011 A成功 | **暗線(高規格留白)** | 他數的不是錢是名字;「錢在第三進的瓦罐裡。別多添,他們人齊了」——他是誰、那晚出了什麼事,不收 |
| keeper_shared_water | FO-011 B | 沉線 | 「添過錢的,是半個自己人」 |
| challenger_signed / challenger_won / challenger_befriended | DU-011 | 沉線 | 小本子簽名;「你一定是讓我對不對?!」;茶攤記了一路 |
| water_dispute_solved / water_dispute_judged / water_dispute_walked | CH-020 | 暗線 | 分水口的石頭是誰半夜挪的?兩村都懷疑鄰縣——候補線 |
| impostor_heard_out / impostor_exposed_public / impostor_new_road | CH-021 | 暗線 | impostor_new_road=江湖多了個講「無名大俠」的說書人——回響候補 |
| legend_heard / legend_corrected | CH-022 | 沉線 | 「沒有八尺——是九尺!」;大俠夜探黑風寨(你沒探過) |
| disciple_pointed / disciple_referred / disciple_father_came | CH-023 | 暗線 | 三年之約/武館「大俠的徒弟」/父子同跪——日後批次候補 |
| escort_paid_full / escort_meal_only / escort_refused | CH-024 | 沉線 | 黑風口山匪的「借道費」;替身漢子(該收版權嗎) |

## B8 批次(收尾滿 80,CH-025 ~ FO-012,2026-08-30 入庫)

| flag | 來源 | 命運 | 引用處 / 後續 |
|---|---|---|---|
| new_scale_verified / new_scale_called_out | CH-025 | 回聲收尾 | 米行線收線:秤真的換了;「秤準是本分,不是功德」 |
| water_half_master | DU-012 贏/輾壓 | 沉線 | 「水上的半個徒弟」——教了再補全 |
| river_avenged / rematch_ducked | DU-012 | 沉線 | 他贏了能吹一輩子;「他不敢」+替你付的船錢 |
| siblings_helped / siblings_shortcut | CH-026 | 沉線 | 揹簍當馬騎;半塊餅的謝禮 |
| fruit_secret_kept | CH-026 A察覺 | 沉線 | 替弟弟瞞了野果的事——天理已經在辦他了 |
| fate_stall_heard | FO-012 A成功 | **暗線(高規格留白)** | 卦攤先生=村口那位?命格軸專屬結語(壓軸,首尾呼應創角) |
| fate_stall_unreadable | FO-012 A失敗 | 沉線 | 「你的命在路上,不在攤上」 |
| fate_stall_peer | FO-012 B | **暗線(留白)** | 「同行,不收錢」——哪門子的同行? |

## B9 批次(遭遇系統首發,EN-001 ~ EN-006,2026-08-30 入庫)

| flag | 來源 | 命運 | 引用處 / 後續 |
|---|---|---|---|
| met_pei / pei_pointers | EN-001 | 暗線(關係攢積) | 見過裴景明;吃過他三處指點 |
| pei_let_you_see | EN-001 C(眼力極高) | **暗線(終局候補)** | 「等哪天我不讓了——你可別讓。」 |
| pei_serious | EN-001 輾壓 | **暗線(情感最高點)** | 他沒讓,還是輸了。「多謝。」 |
| met_liu / liu_taboo_touched / liu_sword_asked / fox_likes_you | EN-002 | 暗線(關係攢積) | 談「爭第一」她瞬間變臉;劍不看;狐狸認你 |
| met_su_awake / met_su_drunk | EN-003 | 暗線(關係攢積) | 兩個她各見過沒;醉態全渡口宣布「這位是朋友」 |
| met_shi_zhou / met_shi_ye | EN-004 | **暗線(留白)** | 白天的郎中/夜裡林邊那個背影;「夜裡遇到誰,別打招呼」 |
| met_zhan_high / met_zhan_mid / met_zhan_low | EN-005 | 暗線(集齊三態) | 三種展孤舟;集齊=「你見過完整的展孤舟」(二響候補) |
| met_incognito_shen | EN-006 A | **暗線(高規格留白)** | 拼桌的女人是誰,事件不說——貴人擦肩,回頭才知(二響:說書人揭曉) |

## B11 批次(收線+世外奇人,EN-007 ~ EN-012,2026-08-31 入庫;同批補 34 件再遇變體)

| flag | 來源 | 命運 | 引用處 / 後續 |
|---|---|---|---|
| shen_identity_known | EN-007 | **回聲收尾** | 拼桌的女人=沈聽雪;「知道的人知道就好」 |
| zhan_named_friend | EN-008 | **暗線(高規格)** | 「叫名字。朋友之間,叫名字。」;「江上有個人在等我」——等誰,不收 |
| met_fisher_sage / fisher_snubbed_you | EN-009 | 暗線(關係攢積) | 賣魚翁只理無名者;出名者被嫌「名頭太響」(全遊戲第一件出名反而虧) |
| met_scholar / scholar_verse_read | EN-010 | 暗線 | 滿地拆招口訣;「記住的東西會擋路」 |
| met_gambler / gambler_word_won / gambler_saw_fate | EN-011 | **暗線(留白)** | 站著的銅錢;「你的命我看過了。不用賭,也知道。」 |
| met_hong_gu | EN-012 | 暗線(關係攢積) | 「衣裳不會說謊。人會,衣裳不會。」多縫的一顆釦子 |

## B12 批次(日常池擴充,2026-08-31 入庫)

| flag | 來源 | 命運 | 引用處 / 後續 |
|---|---|---|---|
| taoist_story_told | CH-027 A/B | 沉線 | 化緣不化錢,化一個故事;講法不同,回的卦不同 |
| hiccup_cured | CH-029 B成功 | 沉線 | 一掌治嗝,被追著要拜師 |
| barber_shaved / barber_blade_seen | CH-030 | **暗線(留白)** | 「以前是砍柴的」「所以現在剃頭」——刀收進盒子就別再翻開 |
| riddle_won | DU-013 | 沉線 | 燈謎攤主的陰影 |
| nightwatch_code_heard / nightwatch_shadow_seen | DA-021 察覺 | **暗線(新伏筆線)** | 三更打的不是三更的點;牆根影子以指節應了半拍——回響後批收 |
| cat_stole_fish | DA-022 | 沉線 | 「牠挑人偷。上回偷的是個縣太爺。」 |
| mute_boy_met / mute_boy_hums | DA-023 | **暗線(留白)** | 他不是不能說,是不想說;那個看不懂的手勢 |
| fog_water_way | CH-031 B成功 | **回聲收尾** | 樵夫「迷了路找水」在山霧裡回本——一碗水的交情 |
| monkey_beaten / monkey_lost / monkey_king_offering | DU-014 | 沉線 | 猴王捧柿子(輾壓);雞認強者,猴也認 |
| shrine_secret_known / shrine_lot_taken | CH-032 | 沉線 | 籤筒裡全是上上籤;「求籤的人要的不是準,是個心安」 |

## B13 批次(北疆開通,BJ-000 ~ BJ-009,2026-08-31 入庫)

| flag | 來源 | 命運 | 引用處 / 後續 |
|---|---|---|---|
| veteran_map_gift | BJ-000 全結局 | 鑰匙 | 北疆輿圖到手——三條分支都給圖 |
| touch_the_wall_promise | BJ-000 A | **回聲** | 老兵託你在雁門關城牆上摸一把;BJ-002 才有那個選項 |
| beijiang_arrived | BJ-001 | 沉線 | 買了皮襖,滿街都是熊 |
| name_on_wall / touched_the_wall / wall_blanks_read | BJ-002 | **暗線(留白)** | 刻名字要回來劃掉;姓還在名沒了的刻痕;一批批空白留給沒回來的人 |
| archery_passed / archery_invited / bow_recognized | BJ-003 | 沉線 | 軍弓要笨才射得遠;輾壓版「它認你」 |
| met_wenren / wenren_looking_home / wenren_home_town | BJ-004 | **暗線(高規格留白)** | 榜上第十九在北疆打聽中原小鎮;「怕的不是找不到,是找到了認不出」 |
| xiao_ruins_seen / xiao_someone_tends / xiao_fire_read | BJ-005 | **暗線(蕭家構陷案)** | 沒有碑的廢墟;有人事後把碎瓷擺好;火是從裡面點的=滅口 |
| xiao_snow_swept / xiao_watcher_knew | BJ-006 | **暗線(高規格留白)** | 年年有人來掃雪、留一枝白梅;腳印輕得踩不進雪;出名後她知道你來了,不打算見 |
| met_bowmaker / bowmaker_rest / broken_bow_story | BJ-007 | **暗線(留白)** | 滿屋等人來取的弓;「我這輩子不該再拉弓了」;缺一半也是弓 |
| horse_milk_drunk / horse_milk_choked / horse_milk_toasted | BJ-008 | 沉線 | 笑你的人會把最好的肉夾給你 |
| met_beacon_keeper / beacon_dust_seen | BJ-009 | 沉線 | 「沒事的日子,才是我最忙的日子」 |

## B14 收線(設計者指出「留白不能斷尾」,2026-08-31)

| flag | 來源 | 命運 | 引用處 / 後續 |
|---|---|---|---|
| veteran_hand_seen | BJ-000 察覺 | **暗線→已收** | 老兵少了三根指頭、虎口是弓弦崩的疤——BJ-010 的伏筆 |
| bow_owner_known / bow_owner_confessed / bow_still_hangs | BJ-010 | **回聲收尾** | 削弓的人就是洛陽那個老兵;「怕的人拉弓,箭會殺錯人」;「我以為他早劈了當柴燒」 |
| found_sanlipu / sanlipu_grandma / stone_righted | BJ-011 | **回聲** | 三里鋪還在,但三十年前大水後往高處挪了二里;界石扶正了 |
| wenren_answered / wenren_debt / wenren_willow_echo | BJ-012 | **回聲收尾** | 他鬆了口氣:「還好不是我離開之後才荒的」;柳家坳老婦那句話成了答案 |
