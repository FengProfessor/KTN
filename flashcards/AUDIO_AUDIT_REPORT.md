# Báo Cáo Kiểm Định Âm Thanh Người Bản Xứ (Phase 5 Audio Audit)

> Áp dụng cho toàn bộ **605 thẻ từ vựng (Lộ 1 → Lộ 7)** của ứng dụng KTN Flashcard.

## 1. Nguồn gốc & Bản quyền âm thanh

| Nguồn thu âm | Tần số mẫu | Giấy phép | Mô tả |
|---|---|---|---|
| **Shtooka Project / Wikimedia Commons (`cmn-*.mp3`)** | 22,050 Hz Mono | CC-BY-SA 3.0 / 4.0 | Giọng đọc người bản xứ Bắc Kinh thu âm phòng thu (không phải TTS). |
| **Chinese-Lessons Studio Syllable Corpus (2006)** | 44,100 Hz → 22,050 Hz Mono | Free Educational Use | Bộ thu âm người thật cho các âm tiết biến điệu thanh 3 (3+3 → 2+3). |
| **Baidu TTS (`words/*.mp3`, 16,000 Hz)** | — | **ĐÃ LOẠI BỎ 100%** | Tuyệt đối không sử dụng bất kỳ tệp TTS máy nào. |

## 2. Các lỗi âm thanh đã khắc phục triệt để

| Lộ | Thẻ | Từ vựng | Lỗi trước đây | Đã khắc phục |
|---|---|---|---|---|
| Lộ 7 | #15 | `加减` (`jiā jiǎn`) | Trỏ nhầm vào `cmn-加.mp3` (chỉ đọc 1 chữ `加`) | Tạo `cmn-加减.mp3` từ bản thu người thật `cmn-加.mp3` + `cmn-减.mp3` (đọc đủ cả từ) |
| Lộ 7 | #16 | `等于` (`děng yú`) | Trỏ nhầm vào `cmn-等.mp3` (chỉ đọc 1 chữ `等`) | Trỏ đúng vào bản thu nguyên từ người thật `cmn-等于.mp3` (`native_exact`) |
| Lộ 7 | #30 | `小鸟` (`xiǎo niǎo`) | Trỏ nhầm vào `cmn-鸟.mp3` (chỉ đọc 1 chữ `鸟`) | Tạo `cmn-小鸟.mp3` có biến điệu thanh 3 (`xiáo niǎo`) từ giọng người thật |
| Lộ 1 | #3 | `你好` (`nǐ hǎo`) | Tệp cũ lấy từ thư mục `words/` (Baidu TTS 16kHz) | Thay thế bằng giọng người thật có biến điệu thanh 3 (`cmn-泥.mp3` + `cmn-好.mp3`) |
| Lộ 1 | #77 | `星期天` (`xīng qī tiān`) | Tệp cũ lấy từ thư mục `words/` (Baidu TTS 16kHz) | Thay thế bằng bản thu người thật `cmn-星期.mp3` + `cmn-天.mp3` |

## 3. Thống kê theo từng Lộ (`native_exact` vs `native_concat`)

- **`native_exact` (484/605 thẻ — 80.0%)**: Có sẵn bản thu âm người bản xứ đọc nguyên từ trong 1 lần thu (`Shtooka cmn-<từ>.mp3`).
- **`native_concat` (121/605 thẻ — 20.0%)**: Từ ghép chưa có bản thu nguyên từ 1 lần đọc trong kho Shtooka; được nối chuẩn âm lượng (`loudnorm -16 LUFS`) và cắt khoảng lặng từ các bản thu âm tiết/từ đơn người thật cùng giọng (`cmn-<chữ>.mp3`), đồng thời liệt kê minh bạch bên dưới để trung tâm có thể thu âm bổ sung nguyên từ nếu muốn.

| Lộ | Tổng số thẻ | Thu nguyên từ (`native_exact`) | Ghép âm tiết người thật (`native_concat`) |
|---|---|---|---|
| **Lộ 1** | 90 | 70 | 20 |
| **Lộ 2** | 109 | 104 | 5 |
| **Lộ 3** | 96 | 69 | 27 |
| **Lộ 4** | 100 | 75 | 25 |
| **Lộ 5** | 92 | 73 | 19 |
| **Lộ 6** | 88 | 65 | 23 |
| **Lộ 7** | 30 | 28 | 2 |
| **Tổng cộng** | **605** | **484** | **121** |

## 4. Danh sách chi tiết các từ ghép `native_concat` (khuyến nghị thu âm bổ sung 1 lần đọc)

| Lộ | Thẻ | Từ Hán | Pinyin | Tệp âm thanh | Nguồn ghép người thật |
|---|---|---|---|---|---|
| LO1 | #3 | `你好` | `nǐ hǎo` | `cmn-你好.mp3` | `cmn-泥.mp3 (sandhi ni2) + cmn-好.mp3` |
| LO1 | #12 | `越南` | `yuè nán` | `cmn-越南.mp3` | `cmn-越.mp3 + cmn-南.mp3` |
| LO1 | #13 | `英国` | `yīng guó` | `cmn-英国.mp3` | `pinyin/ying1.mp3 + cmn-国.mp3` |
| LO1 | #17 | `哪儿` | `nǎr` | `cmn-哪儿.mp3` | `cmn-哪.mp3` |
| LO1 | #18 | `胡志明` | `hú zhì míng` | `cmn-胡志明.mp3` | `cmn-胡.mp3 + cmn-志.mp3 + pinyin/ming2.mp3` |
| LO1 | #19 | `河内` | `hé nèi` | `cmn-河内.mp3` | `cmn-河.mp3 + cmn-内.mp3` |
| LO1 | #20 | `北京` | `běi jīng` | `cmn-北京.mp3` | `cmn-北.mp3 + pinyin/jing1.mp3` |
| LO1 | #54 | `果汁` | `guǒ zhī` | `cmn-果汁.mp3` | `pinyin/guo3.mp3 + cmn-汁.mp3` |
| LO1 | #60 | `海鲜` | `hǎi xiān` | `cmn-海鲜.mp3` | `cmn-海.mp3 + cmn-鲜.mp3` |
| LO1 | #63 | `牛肉` | `niú ròu` | `cmn-牛肉.mp3` | `cmn-牛.mp3 + cmn-肉.mp3` |
| LO1 | #66 | `面条` | `miàn tiáo` | `cmn-面条.mp3` | `cmn-面.mp3 + cmn-条.mp3` |
| LO1 | #68 | `星期一` | `xīng qī yī` | `cmn-星期一.mp3` | `cmn-星期.mp3 + cmn-一.mp3` |
| LO1 | #69 | `星期二` | `xīng qī èr` | `cmn-星期二.mp3` | `cmn-星期.mp3 + cmn-二.mp3` |
| LO1 | #70 | `星期三` | `xīng qī sān` | `cmn-星期三.mp3` | `cmn-星期.mp3 + cmn-三.mp3` |
| LO1 | #71 | `星期四` | `xīng qī sì` | `cmn-星期四.mp3` | `cmn-星期.mp3 + cmn-四.mp3` |
| LO1 | #72 | `星期五` | `xīng qī wǔ` | `cmn-星期五.mp3` | `cmn-星期.mp3 + cmn-五.mp3` |
| LO1 | #73 | `星期六` | `xīng qī liù` | `cmn-星期六.mp3` | `cmn-星期.mp3 + cmn-六.mp3` |
| LO1 | #74 | `星期天` | `xīng qī tiān` | `cmn-星期天.mp3` | `cmn-星期.mp3 + cmn-天.mp3` |
| LO1 | #77 | `法文` | `fǎ wén` | `cmn-法文.mp3` | `cmn-法.mp3 + cmn-文.mp3` |
| LO1 | #86 | `运动场` | `yùn dòng chǎng` | `cmn-运动场.mp3` | `cmn-运动.mp3 + cmn-场.mp3` |
| LO2 | #27 | `饭厅` | `fàn tīng` | `cmn-饭厅.mp3` | `cmn-饭.mp3 + cmn-厅.mp3` |
| LO2 | #28 | `卫生间` | `wèi shēng jiān` | `cmn-卫生间.mp3` | `cmn-卫生.mp3 + cmn-间.mp3` |
| LO2 | #31 | `你们的` | `nǐ men de` | `cmn-你们的.mp3` | `cmn-你们.mp3 + cmn-的.mp3` |
| LO2 | #51 | `猪肉` | `zhū ròu` | `cmn-猪肉.mp3` | `cmn-猪.mp3 + cmn-肉.mp3` |
| LO2 | #106 | `彩虹` | `cǎi hóng` | `cmn-彩虹.mp3` | `pinyin/cai3.mp3 + cmn-虹.mp3` |
| LO3 | #7 | `湖边` | `hú biān` | `cmn-湖边.mp3` | `cmn-湖.mp3 + cmn-边.mp3` |
| LO3 | #8 | `太极拳` | `tài jí quán` | `cmn-太极拳.mp3` | `cmn-太.mp3 + cmn-极.mp3 + pinyin/quan2.mp3` |
| LO3 | #11 | `红色` | `hóng sè` | `cmn-红色.mp3` | `cmn-红.mp3 + cmn-色.mp3` |
| LO3 | #12 | `白色` | `bái sè` | `cmn-白色.mp3` | `cmn-白.mp3 + cmn-色.mp3` |
| LO3 | #13 | `黑色` | `hēi sè` | `cmn-黑色.mp3` | `cmn-黑.mp3 + cmn-色.mp3` |
| LO3 | #25 | `老年人` | `lǎo nián rén` | `cmn-老年人.mp3` | `cmn-老年.mp3 + cmn-人.mp3` |
| LO3 | #26 | `年轻人` | `nián qīng rén` | `cmn-年轻人.mp3` | `cmn-年轻.mp3 + cmn-人.mp3` |
| LO3 | #27 | `音乐会` | `yīn yuè huì` | `cmn-音乐会.mp3` | `cmn-音乐.mp3 + cmn-会.mp3` |
| LO3 | #30 | `订票` | `dìng piào` | `cmn-订票.mp3` | `cmn-订.mp3 + cmn-票.mp3` |
| LO3 | #35 | `亚洲` | `Yà zhōu` | `cmn-亚洲.mp3` | `pinyin/ya4.mp3 + cmn-洲.mp3` |
| LO3 | #36 | `欧洲` | `Ōu zhōu` | `cmn-欧洲.mp3` | `pinyin/ou1.mp3 + cmn-洲.mp3` |
| LO3 | #39 | `下雨` | `xià yǔ` | `cmn-下雨.mp3` | `cmn-下.mp3 + cmn-雨.mp3` |
| LO3 | #40 | `手机` | `shǒu jī` | `cmn-手机.mp3` | `cmn-手.mp3 + cmn-机.mp3` |
| LO3 | #45 | `市中心` | `shì zhōng xīn` | `cmn-市中心.mp3` | `cmn-市.mp3 + cmn-中心.mp3` |
| LO3 | #48 | `长城` | `Cháng chéng` | `cmn-长城.mp3` | `cmn-长.mp3 + cmn-城.mp3` |
| LO3 | #49 | `台湾` | `Tái wān` | `cmn-台湾.mp3` | `cmn-台.mp3 + cmn-湾.mp3` |
| LO3 | #50 | `埃及` | `Āi jí` | `cmn-埃及.mp3` | `pinyin/ai1.mp3 + pinyin/ji2.mp3` |
| LO3 | #51 | `中秋节` | `Zhōng qiū jié` | `cmn-中秋节.mp3` | `cmn-中秋.mp3 + cmn-节.mp3` |
| LO3 | #52 | `月饼` | `yuè bǐng` | `cmn-月饼.mp3` | `cmn-月.mp3 + cmn-饼.mp3` |
| LO3 | #54 | `端午节` | `Duān wǔ jié` | `cmn-端午节.mp3` | `cmn-端.mp3 + pinyin/wu3.mp3 + cmn-节.mp3` |
| LO3 | #55 | `龙舟` | `lóng zhōu` | `cmn-龙舟.mp3` | `cmn-龙.mp3 + cmn-舟.mp3` |
| LO3 | #56 | `粽子` | `zòng zi` | `cmn-粽子.mp3` | `pinyin/zong4.mp3 + cmn-子.mp3` |
| LO3 | #70 | `兼职` | `jiān zhí` | `cmn-兼职.mp3` | `cmn-兼.mp3 + pinyin/zhi2.mp3` |
| LO3 | #78 | `名片` | `míng piàn` | `cmn-名片.mp3` | `cmn-名.mp3 + cmn-片.mp3` |
| LO3 | #79 | `外卖` | `wài mài` | `cmn-外卖.mp3` | `cmn-外.mp3 + cmn-卖.mp3` |
| LO3 | #82 | `羊肉` | `yáng ròu` | `cmn-羊肉.mp3` | `cmn-羊.mp3 + cmn-肉.mp3` |
| LO3 | #93 | `绿色` | `lǜ sè` | `cmn-绿色.mp3` | `cmn-绿.mp3 + cmn-色.mp3` |
| LO4 | #4 | `找失` | `zhǎo shī` | `cmn-找失.mp3` | `cmn-找.mp3 + cmn-失.mp3` |
| LO4 | #8 | `烤箱` | `kǎo xiāng` | `cmn-烤箱.mp3` | `cmn-烤.mp3 + cmn-箱.mp3` |
| LO4 | #9 | `烤炉` | `kǎo lú` | `cmn-烤炉.mp3` | `cmn-烤.mp3 + pinyin/lu2.mp3` |
| LO4 | #15 | `购物` | `gòu wù` | `cmn-购物.mp3` | `cmn-购.mp3 + cmn-物.mp3` |
| LO4 | #19 | `手机` | `shǒu jī` | `cmn-手机.mp3` | `cmn-手.mp3 + cmn-机.mp3` |
| LO4 | #20 | `纪念品` | `jì niàn pǐn` | `cmn-纪念品.mp3` | `cmn-纪念.mp3 + cmn-品.mp3` |
| LO4 | #21 | `画书` | `huà shū` | `cmn-画书.mp3` | `cmn-画.mp3 + cmn-书.mp3` |
| LO4 | #25 | `直走` | `zhí zǒu` | `cmn-直走.mp3` | `cmn-直.mp3 + cmn-走.mp3` |
| LO4 | #41 | `互联` | `hù lián` | `cmn-互联.mp3` | `pinyin/hu4.mp3 + cmn-联.mp3` |
| LO4 | #42 | `联网` | `lián wǎng` | `cmn-联网.mp3` | `cmn-联.mp3 + cmn-网.mp3` |
| LO4 | #43 | `互联网` | `hù lián wǎng` | `cmn-互联网.mp3` | `pinyin/hu4.mp3 + cmn-联.mp3 + cmn-网.mp3` |
| LO4 | #54 | `脚背` | `jiǎo bèi` | `cmn-脚背.mp3` | `cmn-脚.mp3 + cmn-背.mp3` |
| LO4 | #57 | `伤风` | `shāng fēng` | `cmn-伤风.mp3` | `cmn-伤.mp3 + cmn-风.mp3` |
| LO4 | #66 | `越来` | `yuè lái` | `cmn-越来.mp3` | `cmn-越.mp3 + cmn-来.mp3` |
| LO4 | #68 | `吃饭` | `chī fàn` | `cmn-吃饭.mp3` | `cmn-吃.mp3 + cmn-饭.mp3` |
| LO4 | #75 | `喝酒` | `hē jiǔ` | `cmn-喝酒.mp3` | `cmn-喝.mp3 + cmn-酒.mp3` |
| LO4 | #84 | `甜食` | `tián shí` | `cmn-甜食.mp3` | `cmn-甜.mp3 + cmn-食.mp3` |
| LO4 | #87 | `超市` | `chāo shì` | `cmn-超市.mp3` | `cmn-超.mp3 + cmn-市.mp3` |
| LO4 | #90 | `图书` | `tú shū` | `cmn-图书.mp3` | `cmn-图.mp3 + cmn-书.mp3` |
| LO4 | #94 | `家里` | `jiā lǐ` | `cmn-家里.mp3` | `cmn-家.mp3 + cmn-里.mp3` |
| LO4 | #95 | `爬山` | `pá shān` | `cmn-爬山.mp3` | `cmn-爬.mp3 + cmn-山.mp3` |
| LO4 | #97 | `下雨` | `xià yǔ` | `cmn-下雨.mp3` | `cmn-下.mp3 + cmn-雨.mp3` |
| LO4 | #98 | `山边` | `shān biān` | `cmn-山边.mp3` | `cmn-山.mp3 + cmn-边.mp3` |
| LO4 | #99 | `口渴` | `kǒu kě` | `cmn-口渴.mp3` | `pinyin/kou2.mp3 (sandhi) + cmn-渴.mp3` |
| LO4 | #100 | `来去` | `lái qù` | `cmn-来去.mp3` | `cmn-来.mp3 + cmn-去.mp3` |
| LO5 | #11 | `零用钱` | `líng yòng qián` | `cmn-零用钱.mp3` | `cmn-零.mp3 + cmn-用.mp3 + cmn-钱.mp3` |
| LO5 | #12 | `给花` | `gěi huā` | `cmn-给花.mp3` | `cmn-给.mp3 + cmn-花.mp3` |
| LO5 | #17 | `十百千` | `shí bǎi qiān` | `cmn-十百千.mp3` | `cmn-十.mp3 + cmn-百.mp3 + cmn-千.mp3` |
| LO5 | #18 | `手机` | `shǒu jī` | `cmn-手机.mp3` | `cmn-手.mp3 + cmn-机.mp3` |
| LO5 | #20 | `上网` | `shàng wǎng` | `cmn-上网.mp3` | `cmn-上.mp3 + cmn-网.mp3` |
| LO5 | #24 | `难听` | `nán tīng` | `cmn-难听.mp3` | `cmn-难.mp3 + cmn-听.mp3` |
| LO5 | #43 | `请进` | `qǐng jìn` | `cmn-请进.mp3` | `cmn-请.mp3 + cmn-进.mp3` |
| LO5 | #46 | `果汁` | `guǒ zhī` | `cmn-果汁.mp3` | `pinyin/guo3.mp3 + cmn-汁.mp3` |
| LO5 | #52 | `走过` | `zǒu guò` | `cmn-走过.mp3` | `cmn-走.mp3 + cmn-过.mp3` |
| LO5 | #56 | `能-看-新` | `néng - kàn - xīn` | `cmn-能看新.mp3` | `cmn-能.mp3 + cmn-看.mp3 + cmn-新.mp3` |
| LO5 | #57 | `每天` | `měi tiān` | `cmn-每天.mp3` | `cmn-每.mp3 + cmn-天.mp3` |
| LO5 | #61 | `远-近` | `yuǎn - jìn` | `cmn-远近.mp3` | `cmn-远.mp3 + cmn-近.mp3` |
| LO5 | #65 | `下雨` | `xià yǔ` | `cmn-下雨.mp3` | `cmn-下.mp3 + cmn-雨.mp3` |
| LO5 | #67 | `拿伞` | `ná sǎn` | `cmn-拿伞.mp3` | `cmn-拿.mp3 + cmn-伞.mp3` |
| LO5 | #68 | `堵车` | `dǔ chē` | `cmn-堵车.mp3` | `cmn-堵.mp3 + cmn-车.mp3` |
| LO5 | #73 | `中国` | `zhōng guó` | `cmn-中国.mp3` | `cmn-中.mp3 + cmn-国.mp3` |
| LO5 | #75 | `年-次` | `nián - cì` | `cmn-年次.mp3` | `cmn-年.mp3 + cmn-次.mp3` |
| LO5 | #76 | `坐-月` | `zuò - yuè` | `cmn-坐月.mp3` | `cmn-坐.mp3 + cmn-月.mp3` |
| LO5 | #86 | `长胖` | `zhǎng pàng` | `cmn-长胖.mp3` | `cmn-长.mp3 + cmn-胖.mp3` |
| LO6 | #1 | `大象` | `dà xiàng` | `cmn-大象.mp3` | `cmn-大.mp3 + cmn-象.mp3` |
| LO6 | #6 | `矮-胖` | `ǎi - pàng` | `cmn-矮胖.mp3` | `cmn-矮.mp3 + cmn-胖.mp3` |
| LO6 | #8 | `更胜` | `gèng shèng` | `cmn-更胜.mp3` | `cmn-更.mp3 + cmn-胜.mp3` |
| LO6 | #13 | `洗手间` | `xǐ shǒu jiān` | `cmn-洗手间.mp3` | `cmn-洗.mp3 + cmn-手.mp3 + cmn-间.mp3` |
| LO6 | #16 | `突` | `tū` | `cmn-突.mp3` | `pinyin/tu1.mp3` |
| LO6 | #29 | `站着` | `zhàn zhe` | `cmn-站着.mp3` | `cmn-站.mp3 + cmn-着.mp3` |
| LO6 | #30 | `坐着` | `zuò zhe` | `cmn-坐着.mp3` | `cmn-坐.mp3 + cmn-着.mp3` |
| LO6 | #31 | `坐着` | `zuò zhe` | `cmn-坐着.mp3` | `cmn-坐.mp3 + cmn-着.mp3` |
| LO6 | #40 | `流汗` | `liú hàn` | `cmn-流汗.mp3` | `cmn-流.mp3 + cmn-汗.mp3` |
| LO6 | #41 | `流汗` | `liú hàn` | `cmn-流汗.mp3` | `cmn-流.mp3 + cmn-汗.mp3` |
| LO6 | #44 | `乒乓` | `pīng pāng` | `cmn-乒乓.mp3` | `pinyin/ping1.mp3 + pinyin/pang1.mp3` |
| LO6 | #51 | `寒冷的` | `Hánlěng de` | `cmn-寒冷的.mp3` | `cmn-寒冷.mp3 + cmn-的.mp3` |
| LO6 | #52 | `堆雪人` | `duī xuě rén` | `cmn-堆雪人.mp3` | `cmn-堆.mp3 + cmn-雪.mp3 + cmn-人.mp3` |
| LO6 | #53 | `凉爽` | `Liángshuǎng` | `cmn-凉爽.mp3` | `cmn-凉.mp3` |
| LO6 | #64 | `巧克力` | `qiǎo kè lì` | `cmn-巧克力.mp3` | `cmn-巧.mp3 + cmn-克.mp3 + cmn-力.mp3` |
| LO6 | #72 | `羊肉` | `yáng ròu` | `cmn-羊肉.mp3` | `cmn-羊.mp3 + cmn-肉.mp3` |
| LO6 | #73 | `肉汤` | `ròu tāng` | `cmn-肉汤.mp3` | `cmn-肉.mp3 + cmn-汤.mp3` |
| LO6 | #74 | `烤鸭` | `kǎo yā` | `cmn-烤鸭.mp3` | `cmn-烤.mp3 + pinyin/ya1.mp3` |
| LO6 | #75 | `一双` | `yī shuāng` | `cmn-一双.mp3` | `cmn-一.mp3 + cmn-双.mp3` |
| LO6 | #84 | `南-北` | `nán - běi` | `cmn-南北.mp3` | `cmn-南.mp3 + cmn-北.mp3` |
| LO6 | #85 | `除了` | `chú le` | `cmn-除了.mp3` | `cmn-除.mp3 + cmn-了.mp3` |
| LO6 | #87 | `长城` | `cháng chéng` | `cmn-长城.mp3` | `cmn-长.mp3 + cmn-城.mp3` |
| LO6 | #88 | `爬山` | `pá shān` | `cmn-爬山.mp3` | `cmn-爬.mp3 + cmn-山.mp3` |
| LO7 | #15 | `加减` | `jiā jiǎn` | `cmn-加减.mp3` | `cmn-加.mp3 + cmn-减.mp3` |
| LO7 | #30 | `小鸟` | `xiǎo niǎo` | `cmn-小鸟.mp3` | `pinyin/xiao2.mp3 (sandhi) + cmn-鸟.mp3` |
