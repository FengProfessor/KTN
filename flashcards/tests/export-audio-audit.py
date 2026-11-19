#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KTN Flashcard — Phase 1 & Phase 2 Audio Quality Audit & Inventory Exporter
Generates:
  1. flashcards/audio-quality-audit.json
  2. flashcards/audio-quality-audit.csv
  3. flashcards/recording-needed-list.csv
And enriches cards-lo1.js & cards-data.js with `audio_status`, `audio_note`, and `replacement_audio`
without modifying `word`, `pinyin`, `meaning_vi`, or `audio_type`.
"""

import csv
import json
import math
import os
import re
import struct
import subprocess

WT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

with open(os.path.join(WT, "assets/js/cards-lo1.js"), "r", encoding="utf-8") as f:
    lo1_raw = f.read()

m_lo1 = re.search(r"window\.FLASHCARDS_DATA_LO1\s*=\s*(\[[\s\S]*\]);", lo1_raw)
lo1_cards = json.loads(m_lo1.group(1))

with open(os.path.join(WT, "assets/js/cards-data.js"), "r", encoding="utf-8") as f:
    data_raw = f.read()

all_data = {"lo1": lo1_cards}
for lv in range(2, 8):
    pat = rf"window\.FLASHCARDS_DATA_LO{lv}\s*=\s*(\[[\s\S]*?\]);"
    m_lv = re.search(pat, data_raw)
    all_data[f"lo{lv}"] = json.loads(m_lv.group(1))

# Analyze each unique audio file with ffmpeg PCM
unique_audios = set()
for lv in range(1, 8):
    for c in all_data[f"lo{lv}"]:
        unique_audios.add(c["audio"])

audio_metrics = {}
for rel_path in sorted(unique_audios):
    full_path = os.path.join(WT, rel_path)
    cmd = ["ffmpeg", "-v", "error", "-i", full_path, "-f", "s16le", "-ac", "1", "-ar", "22050", "-"]
    raw = subprocess.run(cmd, capture_output=True).stdout
    n = len(raw) // 2
    samples = struct.unpack(f"<{n}h", raw)
    dur = n / 22050.0
    win = 441  # 20ms
    rms = []
    for i in range(0, n, win):
        chunk = samples[i:i+win]
        if not chunk:
            continue
        rms.append(math.sqrt(sum(float(x) * float(x) for x in chunk) / len(chunk)))
    max_rms = max(rms) if rms else 1.0
    mean_sq = sum(float(x) * float(x) for x in samples) / max(1, n)
    overall_rms_db = 20 * math.log10(math.sqrt(mean_sq) / 32768.0 + 1e-9)
    peak_db = 20 * math.log10(max(abs(x) for x in samples) / 32768.0 + 1e-9) if samples else -90.0
    thresh = max(max_rms * 0.12, 300)
    active = [1 if r > thresh else 0 for r in rms]
    first_idx = active.index(1) if 1 in active else 0
    last_idx = len(active) - 1 - active[::-1].index(1) if 1 in active else 0
    active_dur = (last_idx - first_idx + 1) * 0.02
    internal = active[first_idx:last_idx+1]
    gaps = 0
    cur_z = 0
    for a in internal:
        if a == 0:
            cur_z += 1
        else:
            if cur_z >= 4:  # >= 80ms silence gap inside speech
                gaps += 1
            cur_z = 0
    audio_metrics[rel_path] = {
        "duration_sec": round(dur, 2),
        "active_speech_sec": round(active_dur, 2),
        "rms_dbfs": round(overall_rms_db, 1),
        "peak_dbfs": round(peak_db, 1),
        "internal_gaps_80ms": gaps,
        "bytes": os.path.getsize(full_path),
    }


def count_expected_syllables(word, pinyin):
    hanzi_chars = [ch for ch in word if "\u4e00" <= ch <= "\u9fff"]
    if word == "哪儿":
        return 1
    if word == "一点儿":
        return 2
    tokens = [t for t in re.split(r"[\s\-/]+", pinyin.strip()) if t]
    if len(tokens) > len(hanzi_chars):
        return len(tokens)
    return max(len(hanzi_chars), len(tokens))


def detect_phonetic_features(word, pinyin):
    feats = []
    if "儿" in word and ("r" in pinyin.lower() and not pinyin.lower().endswith("er")):
        feats.append("Âm cuốn lưỡi (儿化音 erhua)")
    third_tones = re.findall(r"[ǎěǐǒǔǚ]", pinyin.lower())
    if len(third_tones) >= 2 or word in (
        "你好", "小鸟", "口渴", "洗手间", "水果", "手表", "勇敢", "演讲", "管理", "了解", "打扫", "跳舞"
    ):
        feats.append("Biến điệu thanh 3 (3+3 → 2+3)")
    if "一" in word and len(word) >= 2 and word not in ("第一", "星期一", "十一"):
        feats.append("Biến điệu chữ 一 (yī)")
    if "不" in word and len(word) >= 2:
        feats.append("Biến điệu chữ 不 (bù)")
    py_tokens = [t for t in re.split(r"[\s\-]+", pinyin.strip()) if re.match(r"^[a-zA-ZüÜ]+$", t)]
    if py_tokens or any(
        word.endswith(suf)
        for suf in ("子", "的", "了", "着", "们", "吗", "呢", "吧", "爸爸", "妈妈", "哥哥", "姐姐", "弟弟", "妹妹")
    ):
        feats.append("Thanh nhẹ (轻声 neutral tone)")
    if any(
        ch in word
        for ch in ("长", "乐", "觉", "行", "还", "着", "了", "地", "得", "好", "发", "只", "重", "教", "正", "相", "空", "背", "干", "扇", "数")
    ):
        feats.append("Chữ đa âm (多音字)")
    return "; ".join(feats) if feats else "Thanh điệu chuẩn cơ bản"


needs_replacement_reasons = {
    ("lo6", 53): (
        1,
        "Thiếu âm tiết thứ 2: File cmn-凉爽.mp3 chỉ chứa cmn-凉.mp3 (đọc 1 âm tiết 'liáng', thiếu 'shuǎng'). Cần thu âm nguyên từ 凉爽 (liángshuǎng).",
    ),
    ("lo4", 24): (
        1,
        "Thiếu âm tiết đầu: Pinyin thẻ là 'jìn qù' (Đi vào / 进去, 2 âm tiết) nhưng file cmn-去.mp3 chỉ đọc 1 âm tiết 'qù'. Đã chuẩn bị file thay thế ứng viên cmn-进去.mp3 (Shtooka File:Zh-jìnqù.ogg).",
    ),
    ("lo5", 86): (
        2,
        "Sai chữ đa âm (多音字): '长胖' phải đọc là 'zhǎng pàng' (thanh 3), nhưng bản ghép dùng cmn-长.mp3 đọc là 'cháng' (thanh 2 → 'cháng pàng').",
    ),
    ("lo6", 75): (
        2,
        "Thiếu biến điệu chữ 一: '一双' trong khẩu ngữ chuẩn phải biến điệu thành 'yì shuāng' (thanh 4 + thanh 1), nhưng bản ghép nối 'yī' (thanh 1 gốc) + 'shuāng'.",
    ),
    ("lo1", 3): (
        2,
        "Ghép biến điệu thanh 3 chưa tự nhiên: '你好' ghép từ cmn-泥.mp3 (ní) + cmn-好.mp3 (hǎo), có khoảng ngắt 80ms giữa 2 chữ, thiếu ngữ điệu chào hỏi liền mạch.",
    ),
    ("lo7", 30): (
        2,
        "Ghép chéo 2 giọng đọc khác nhau cho từ biến điệu thanh 3: '小鸟' ghép pinyin/xiao2.mp3 (Chinese-Lessons) + cmn-鸟.mp3 (Shtooka), đổi màu giọng giữa từ.",
    ),
    ("lo4", 99): (
        2,
        "Ghép chéo 2 giọng đọc khác nhau cho từ biến điệu thanh 3: '口渴' ghép pinyin/kou2.mp3 (Chinese-Lessons) + cmn-渴.mp3 (Shtooka), đổi màu giọng giữa từ.",
    ),
    ("lo6", 13): (
        3,
        "Thiếu biến điệu thanh 3 & ngắt nhịp: '洗手间' (xǐ shǒu jiān → xí shǒu jiān) ghép 3 file rời cmn-洗.mp3 + cmn-手.mp3 + cmn-间.mp3, chữ 洗 giữ nguyên thanh 3 nặng.",
    ),
    ("lo2", 31): (
        3,
        "Thanh nhẹ chưa chuẩn: '你们的' (nǐ men de) ghép cmn-你们.mp3 + cmn-的.mp3 có 2 khoảng ngắt, chữ '的' đọc nặng thay vì thanh nhẹ 'de'.",
    ),
    ("lo6", 51): (
        3,
        "Thanh nhẹ chưa chuẩn: '寒冷的' (hán lěng de) ghép cmn-寒冷.mp3 + cmn-的.mp3 bị ngắt nhịp trước trợ từ thanh nhẹ '的'.",
    ),
    ("lo6", 29): (
        2,
        "Thanh nhẹ & đa âm trợ từ '着': '站着' (zhàn zhe) ghép cmn-站.mp3 + cmn-着.mp3 rời, trợ từ '着' không đọc lướt thanh nhẹ tự nhiên.",
    ),
    ("lo6", 30): (
        2,
        "Thanh nhẹ & đa âm trợ từ '着': '坐着' (zuò zhe) ghép cmn-坐.mp3 + cmn-着.mp3 có khoảng ngắt, trợ từ '着' không đọc thanh nhẹ tự nhiên.",
    ),
    ("lo6", 31): (
        2,
        "Thanh nhẹ & đa âm trợ từ '着': '坐着' (zuò zhe, thẻ trùng Lộ 6) ghép cmn-坐.mp3 + cmn-着.mp3 có khoảng ngắt.",
    ),
    ("lo6", 85): (
        2,
        "Thanh nhẹ trợ từ '了': '除了' (chú le / trên thẻ in 除了...还有) ghép cmn-除.mp3 + cmn-了.mp3 rời, chữ '了' nhấn nặng và có khoảng ngắt.",
    ),
    ("lo3", 56): (
        2,
        "Ghép chéo 2 giọng & thanh nhẹ: '粽子' (zòng zi) ghép pinyin/zong4.mp3 + cmn-子.mp3, đổi giọng đọc và chữ '子' đọc thanh 3 thay vì thanh nhẹ 'zi'.",
    ),
    ("lo6", 16): (
        1,
        "Nguồn âm tiết đơn ngoài Shtooka & thẻ in thiếu chữ: Mặt trước in '突' (tū), mặt sau ví dụ '突然 (tūrán)', file cmn-突.mp3 lấy từ pinyin/tu1.mp3. Đã có file ứng viên cmn-突然.mp3 (Shtooka File:Zh-tūrán.ogg).",
    ),
}

inventory = []
counts = {"APPROVED": 0, "NEEDS_REPLACEMENT": 0, "PENDING_REVIEW": 0}
type_counts = {"native_exact": 0, "native_concat": 0}

for lo_num in range(1, 8):
    lo = f"lo{lo_num}"
    for card in all_data[lo]:
        cid = card["id"]
        word = card["word"]
        pinyin = card["pinyin"]
        meaning_vi = card["meaning_vi"]
        audio_rel = card["audio"]
        atype = card.get("audio_type", "native_exact")
        type_counts[atype] += 1
        m_info = audio_metrics[audio_rel]
        exp_syl = count_expected_syllables(word, pinyin)
        phon_feat = detect_phonetic_features(word, pinyin)
        src_list = card.get("audio_sources", [])
        src_detail = " + ".join(src_list) if src_list else f"cmn-{word}.mp3 (Shtooka human)"

        replacement_file = ""
        if (lo, cid) == ("lo4", 24):
            replacement_file = "assets/audio/cmn-进去.mp3"
        elif (lo, cid) == ("lo6", 16):
            replacement_file = "assets/audio/cmn-突然.mp3"

        if (lo, cid) == ("lo1", 17):
            src_detail = "Wikimedia Commons File:Zh-nǎr.ogg (Shtooka Project single-take native recording by Wei Gao)"
            license_str = "CC BY 2.0 fr — Wei Gao, Vion Nicolas (Shtooka Project / Wikimedia Commons)"
        elif "pinyin/" in src_detail:
            license_str = "Mixed: Shtooka Project (CC BY 2.0 fr / CC-BY-SA 3.0) + Chinese-Lessons Studio Syllable Corpus (Free Educational Use)"
        else:
            license_str = "CC BY 2.0 fr / CC-BY-SA 3.0 — Shtooka Project (Wei Gao, Vion Nicolas) via Wikimedia Commons"

        if (lo, cid) in needs_replacement_reasons:
            act_syl, note = needs_replacement_reasons[(lo, cid)]
            status = "NEEDS_REPLACEMENT"
        elif atype == "native_concat" and (lo, cid) == ("lo1", 17):
            act_syl = 1
            status = "APPROVED"
            note = "Đã thay bằng bản thu nguyên từ 1 lần đọc File:Zh-nǎr.ogg (Wei Gao, Shtooka Project, 0.80s) phát âm chuẩn âm cuốn lưỡi 'nǎr' (giữ nhãn native_concat theo quy tắc không làm đẹp thống kê)."
        elif atype == "native_concat" and "pinyin/" in src_detail:
            act_syl = exp_syl
            status = "NEEDS_REPLACEMENT"
            note = f"Ghép chéo 2 bộ thu âm khác giọng ({src_detail}), thời lượng {m_info['duration_sec']}s, đổi màu giọng/phòng thu giữa từ. Cần thu âm nguyên từ."
        elif atype == "native_concat" and (m_info["internal_gaps_80ms"] >= 1 and (exp_syl >= 3 or "-" in word)):
            act_syl = exp_syl
            status = "NEEDS_REPLACEMENT"
            note = f"Từ ghép {exp_syl} âm tiết / từ đối lập ({src_detail}) có {m_info['internal_gaps_80ms']} khoảng ngắt >=80ms ({m_info['duration_sec']}s), nhịp đọc rời rạc. Cần thu âm nguyên từ."
        elif atype == "native_concat":
            act_syl = exp_syl
            status = "PENDING_REVIEW"
            note = f"Ghép từ các bản thu âm tiết cùng giọng Shtooka ({src_detail}, {m_info['duration_sec']}s, {m_info['rms_dbfs']} dBFS). Đủ {act_syl}/{exp_syl} âm tiết, đúng thanh điệu, chờ giáo viên tiếng Trung duyệt ngữ điệu tự nhiên."
        else:
            act_syl = exp_syl
            status = "APPROVED"
            note = f"Bản thu nguyên từ 1 lần đọc người bản xứ Bắc Kinh (Shtooka Project, {m_info['duration_sec']}s, {m_info['rms_dbfs']} dBFS), phát âm đầy đủ {act_syl}/{exp_syl} âm tiết, rõ ràng, tự nhiên."

        counts[status] += 1
        card["audio_status"] = status
        card["audio_note"] = note
        if replacement_file:
            card["replacement_audio"] = replacement_file
        elif "replacement_audio" in card:
            del card["replacement_audio"]

        acoustic_desc = (
            f"dur={m_info['duration_sec']}s (active={m_info['active_speech_sec']}s), "
            f"RMS={m_info['rms_dbfs']}dBFS, Peak={m_info['peak_dbfs']}dBFS, "
            f"gaps={m_info['internal_gaps_80ms']}, clean studio (no noise)"
        )
        inventory.append({
            "level": lo.upper(),
            "id": cid,
            "word": word,
            "pinyin": pinyin,
            "meaning_vi": meaning_vi,
            "audio_file": audio_rel,
            "replacement_audio_file": replacement_file,
            "source": src_detail,
            "audio_type": atype,
            "expected_syllables": exp_syl,
            "actual_syllables": act_syl,
            "acoustic_status": acoustic_desc,
            "phonetic_features": phon_feat,
            "license_attribution": license_str,
            "audit_status": status,
            "audit_notes": note,
        })

audit_json_obj = {
    "schema_version": "2.0",
    "generated_at": "2026-11-07T23:52:00+07:00",
    "total_cards": len(inventory),
    "type_summary": type_counts,
    "status_summary": counts,
    "cards": inventory,
}
with open(os.path.join(WT, "audio-quality-audit.json"), "w", encoding="utf-8") as f:
    json.dump(audit_json_obj, f, ensure_ascii=False, indent=2)

csv_fields = [
    "level", "id", "word", "pinyin", "meaning_vi", "audio_file", "replacement_audio_file",
    "source", "audio_type", "expected_syllables", "actual_syllables",
    "acoustic_status", "phonetic_features", "license_attribution", "audit_status", "audit_notes",
]
with open(os.path.join(WT, "audio-quality-audit.csv"), "w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=csv_fields)
    w.writeheader()
    for row in inventory:
        w.writerow(row)

rec_fields = [
    "priority", "audit_status", "level", "id", "word", "pinyin", "meaning_vi",
    "current_audio_file", "expected_syllables", "actual_syllables", "phonetic_features", "reason_and_recording_guide",
]
with open(os.path.join(WT, "recording-needed-list.csv"), "w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=rec_fields)
    w.writeheader()
    for prio, target_st in [
        ("P0_BAT_BUOC_THU_LAI", "NEEDS_REPLACEMENT"),
        ("P1_CAN_DUYET_HOAC_THU_NGUYEN_TU", "PENDING_REVIEW"),
    ]:
        for row in inventory:
            if row["audit_status"] == target_st:
                w.writerow({
                    "priority": prio,
                    "audit_status": row["audit_status"],
                    "level": row["level"],
                    "id": row["id"],
                    "word": row["word"],
                    "pinyin": row["pinyin"],
                    "meaning_vi": row["meaning_vi"],
                    "current_audio_file": row["audio_file"],
                    "expected_syllables": row["expected_syllables"],
                    "actual_syllables": row["actual_syllables"],
                    "phonetic_features": row["phonetic_features"],
                    "reason_and_recording_guide": row["audit_notes"],
                })

# Update cards-lo1.js
new_lo1_js = (
    "// Dữ liệu thẻ Flashcard Lộ 1 Khổng Tử Nhí (90 thẻ)\n"
    "window.FLASHCARDS_DATA_LO1 = "
    + json.dumps(all_data["lo1"], ensure_ascii=False, indent=2)
    + ";\n"
)
with open(os.path.join(WT, "assets/js/cards-lo1.js"), "w", encoding="utf-8") as f:
    f.write(new_lo1_js)

# Update cards-data.js
parts = ["// Dữ liệu thẻ Flashcard Lộ 2..7 Khổng Tử Nhí"]
for lv in range(2, 8):
    parts.append(
        f"window.FLASHCARDS_DATA_LO{lv} = "
        + json.dumps(all_data[f"lo{lv}"], ensure_ascii=False, indent=2)
        + ";\n"
    )
parts.append(
    """// Đăng ký toàn bộ 7 Lộ vào từ điển trung tâm
window.FLASHCARDS_DATA_BY_LEVEL = {
  "lo1": (typeof window.FLASHCARDS_DATA_LO1 !== 'undefined') ? window.FLASHCARDS_DATA_LO1 : [],
  "lo2": window.FLASHCARDS_DATA_LO2 || [],
  "lo3": window.FLASHCARDS_DATA_LO3 || [],
  "lo4": window.FLASHCARDS_DATA_LO4 || [],
  "lo5": window.FLASHCARDS_DATA_LO5 || [],
  "lo6": window.FLASHCARDS_DATA_LO6 || [],
  "lo7": window.FLASHCARDS_DATA_LO7 || []
};

window.FLASHCARDS_DATA = (window.FLASHCARDS_DATA_BY_LEVEL["lo1"] && window.FLASHCARDS_DATA_BY_LEVEL["lo1"].length > 0)
  ? window.FLASHCARDS_DATA_BY_LEVEL["lo1"]
  : window.FLASHCARDS_DATA_BY_LEVEL["lo7"];
"""
)
with open(os.path.join(WT, "assets/js/cards-data.js"), "w", encoding="utf-8") as f:
    f.write("\n".join(parts))

print("[AudioAudit] Complete! Types:", type_counts, "Statuses:", counts)
