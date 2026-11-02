const fs = require('fs');
const path = require('path');

const videoMap = require('./extracted_video_map.cjs');

// Complete metadata for all 15 lessons
const LESSONS_DATA = [
  {
    id: 1,
    num: 1,
    titleZh: 'AI小语，你好！',
    titleVi: 'Xin chào AI Tiểu Ngữ!',
    parts: videoMap[1],
    duration: '13:34',
    sgkPage: 17, // offset +16
    sbtPage: 11, // offset +10
    voVietPage: 1,
    grammar: 'Lời chào hỏi cơ bản, Đại từ xưng hô 你 (Bạn), 我 (Tôi), 您 (Ngài)',
    homework: {
      status: 'unsubmitted',
      score: null,
      submittedAt: null,
      note: '',
      teacherComment: null
    },
    audioTracks: [
      { name: 'Bài khóa 1 (Xin chào)', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/01-1.mp3' },
      { name: 'Từ mới 1 (Phát âm chuẩn)', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/01-2.mp3' },
      { name: 'Bài khóa 2 (Đối thoại)', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/01-3.mp3' },
      { name: 'Luyện nghe SBT Bài 1', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/sbt-01.mp3' }
    ]
  },
  {
    id: 2,
    num: 2,
    titleZh: '我叫李文',
    titleVi: 'Mình tên là Lý Văn',
    parts: videoMap[2],
    duration: '12:00',
    sgkPage: 23,
    sbtPage: 17,
    voVietPage: 9,
    grammar: 'Hỏi tên với 什么名字, Động từ 叫 (Tên là), Họ và tên tiếng Trung',
    homework: {
      status: 'unsubmitted',
      score: null,
      submittedAt: null,
      note: '',
      teacherComment: null
    },
    audioTracks: [
      { name: 'Bài khóa 1 (Giới thiệu tên)', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/02-1.mp3' },
      { name: 'Từ mới 2', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/02-2.mp3' },
      { name: 'Luyện nghe SBT Bài 2', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/sbt-02.mp3' }
    ]
  },
  {
    id: 3,
    num: 3,
    titleZh: '我是中国人',
    titleVi: 'Tôi là người Trung Quốc',
    parts: videoMap[3],
    duration: '30:00 (2 phần)',
    sgkPage: 29,
    sbtPage: 23,
    voVietPage: 17,
    grammar: 'Động từ phán đoán 是, Câu nghi vấn 吗, Tên các quốc gia',
    homework: {
      status: 'unsubmitted',
      note: '',
      teacherComment: null
    },
    audioTracks: [
      { name: 'Bài khóa 1 (Quốc tịch)', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/03-1.mp3' },
      { name: 'Từ mới 3', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/03-2.mp3' },
      { name: 'Luyện nghe SBT Bài 3', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/sbt-03.mp3' }
    ]
  },
  {
    id: 4,
    num: 4,
    titleZh: '这是我的一家',
    titleVi: 'Đây là gia đình của tôi',
    parts: videoMap[4],
    duration: '55:00 (4 phần)',
    sgkPage: 35,
    sbtPage: 29,
    voVietPage: 25,
    grammar: 'Đại từ chỉ thị 这 / 那, Trợ từ sở hữu 的, Thành viên gia đình & Lượng từ 口, 个',
    homework: {
      status: 'unsubmitted',
      note: '',
      teacherComment: null
    },
    audioTracks: [
      { name: 'Bài khóa 1 (Gia đình)', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/04-1.mp3' },
      { name: 'Từ mới 4', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/04-2.mp3' },
      { name: 'Luyện nghe SBT Bài 4', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/sbt-04.mp3' }
    ]
  },
  {
    id: 5,
    num: 5,
    titleZh: '今天我休息',
    titleVi: 'Hôm nay tôi được nghỉ',
    parts: videoMap[5],
    duration: '28:00 (2 phần)',
    sgkPage: 43,
    sbtPage: 37,
    voVietPage: 33,
    grammar: 'Các ngày trong tuần (星期), Ngày tháng, Trạng ngữ chỉ thời gian',
    homework: { status: 'unsubmitted' },
    audioTracks: [
      { name: 'Bài khóa 1 (Ngày nghỉ)', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/05-1.mp3' },
      { name: 'Luyện nghe SBT Bài 5', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/sbt-05.mp3' }
    ]
  },
  {
    id: 6,
    num: 6,
    titleZh: '你的手机号是多少？',
    titleVi: 'Số điện thoại của bạn là bao nhiêu?',
    parts: videoMap[6],
    duration: '26:00 (2 phần)',
    sgkPage: 51,
    sbtPage: 43,
    voVietPage: 41,
    grammar: 'Đọc số đếm 0-99, Số điện thoại (yāo cho số 1), Từ hỏi 多少',
    homework: { status: 'unsubmitted' },
    audioTracks: [
      { name: 'Bài khóa 1 (Số điện thoại)', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/06-1.mp3' },
      { name: 'Luyện nghe SBT Bài 6', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/sbt-06.mp3' }
    ]
  },
  {
    id: 7,
    num: 7,
    titleZh: '我晚上六点半下班',
    titleVi: 'Tôi tan làm lúc sáu rưỡi tối',
    parts: videoMap[7],
    duration: '27:00 (2 phần)',
    sgkPage: 59,
    sbtPage: 49,
    voVietPage: 49,
    grammar: 'Giờ giấc (点, 分, 半), Buổi trong ngày (上午, 下午, 晚上), Lịch trình hoạt động',
    homework: { status: 'unsubmitted' },
    audioTracks: [
      { name: 'Bài khóa 1 (Giờ giấc)', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/07-1.mp3' },
      { name: 'Luyện nghe SBT Bài 7', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/sbt-07.mp3' }
    ]
  },
  {
    id: 8,
    num: 8,
    titleZh: '我爸爸也在医院工作',
    titleVi: 'Bố tôi cũng làm việc ở bệnh viện',
    parts: videoMap[8],
    duration: '29:00 (2 phần)',
    sgkPage: 67,
    sbtPage: 55,
    voVietPage: 57,
    grammar: 'Phó từ 也, Giới từ 在 + Địa điểm + Động từ, Các ngành nghề phổ biến',
    homework: { status: 'unsubmitted' },
    audioTracks: [
      { name: 'Bài khóa 1 (Nơi làm việc)', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/08-1.mp3' },
      { name: 'Luyện nghe SBT Bài 8', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/sbt-08.mp3' }
    ]
  },
  {
    id: 9,
    num: 9,
    titleZh: '我明天上午在学校学习',
    titleVi: 'Sáng mai tôi học ở trường',
    parts: videoMap[9],
    duration: '31:00 (2 phần)',
    sgkPage: 75,
    sbtPage: 63,
    voVietPage: 65,
    grammar: 'Trật tự Thời gian - Địa điểm - Hành động, Địa điểm trong trường học',
    homework: { status: 'unsubmitted' },
    audioTracks: [
      { name: 'Bài khóa 1 (Học tập)', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/09-1.mp3' },
      { name: 'Luyện nghe SBT Bài 9', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/sbt-09.mp3' }
    ]
  },
  {
    id: 10,
    num: 10,
    titleZh: '这儿的苹果真便宜！',
    titleVi: 'Táo ở đây rẻ thật đấy!',
    parts: videoMap[10],
    duration: '28:00 (2 phần)',
    sgkPage: 83,
    sbtPage: 78, // offset +12
    voVietPage: 73,
    grammar: 'Phó từ cảm thán 真, Mua sắm và hỏi giá (多少钱, 斤, 块)',
    homework: { status: 'unsubmitted' },
    audioTracks: [
      { name: 'Bài khóa 1 (Mua sắm)', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/10-1.mp3' },
      { name: 'Luyện nghe SBT Bài 10', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/sbt-10.mp3' }
    ]
  },
  {
    id: 11,
    num: 11,
    titleZh: '我读大学呢',
    titleVi: 'Tôi đang học đại học',
    parts: videoMap[11],
    duration: '26:00 (2 phần)',
    sgkPage: 91,
    sbtPage: 87,
    voVietPage: 81,
    grammar: 'Trợ từ 呢 biểu thị hành động đang diễn ra, Cấp bậc học vấn',
    homework: { status: 'unsubmitted' },
    audioTracks: [
      { name: 'Bài khóa 1 (Đang học)', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/11-1.mp3' },
      { name: 'Luyện nghe SBT Bài 11', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/sbt-11.mp3' }
    ]
  },
  {
    id: 12,
    num: 12,
    titleZh: '昨天下了雪了',
    titleVi: 'Hôm qua có tuyết rơi rồi',
    parts: videoMap[12],
    duration: '42:00 (3 phần)',
    sgkPage: 99,
    sbtPage: 96,
    voVietPage: 89,
    grammar: 'Trợ từ động thái 了 (Hành động hoàn thành), Thời tiết và bốn mùa',
    homework: { status: 'unsubmitted' },
    audioTracks: [
      { name: 'Bài khóa 1 (Thời tiết)', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/12-1.mp3' },
      { name: 'Luyện nghe SBT Bài 12', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/sbt-12.mp3' }
    ]
  },
  {
    id: 13,
    num: 13,
    titleZh: '请给我一杯茶',
    titleVi: 'Xin cho tôi một cốc trà',
    parts: videoMap[13],
    duration: '28:00 (2 phần)',
    sgkPage: 107,
    sbtPage: 105,
    voVietPage: 97,
    grammar: 'Câu cầu khiến với 请, Động từ 给, Lượng từ đồ uống 杯, 瓶',
    homework: { status: 'unsubmitted' },
    audioTracks: [
      { name: 'Bài khóa 1 (Quán trà)', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/13-1.mp3' },
      { name: 'Luyện nghe SBT Bài 13', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/sbt-13.mp3' }
    ]
  },
  {
    id: 14,
    num: 14,
    titleZh: '我看了一个电影',
    titleVi: 'Tôi đã xem một bộ phim',
    parts: videoMap[14],
    duration: '30:00 (2 phần)',
    sgkPage: 115,
    sbtPage: 114,
    voVietPage: 105,
    grammar: 'Cấu trúc V + 了 + Số lượng từ + Tân ngữ, Kể lại hoạt động giải trí',
    homework: { status: 'unsubmitted' },
    audioTracks: [
      { name: 'Bài khóa 1 (Xem phim)', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/14-1.mp3' },
      { name: 'Luyện nghe SBT Bài 14', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/sbt-14.mp3' }
    ]
  },
  {
    id: 15,
    num: 15,
    titleZh: '大兴机场见！',
    titleVi: 'Hẹn gặp ở sân bay Đại Hưng!',
    parts: videoMap[15],
    duration: '32:00 (2 phần)',
    sgkPage: 123,
    sbtPage: 123,
    voVietPage: 113,
    grammar: 'Phương tiện giao thông (飞机, 出租车), Lời hẹn gặp (见), Ôn tập tổng kết New HSK 1.0',
    homework: { status: 'unsubmitted' },
    audioTracks: [
      { name: 'Bài khóa 1 (Hẹn gặp)', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/15-1.mp3' },
      { name: 'Luyện nghe SBT Bài 15', url: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/sbt-15.mp3' }
    ]
  }
];

fs.writeFileSync('d:/Vibe/khongtunhi_sofl_style/clean_lessons_data.json', JSON.stringify(LESSONS_DATA, null, 2));
console.log('Saved clean_lessons_data.json with 15 lessons!');
