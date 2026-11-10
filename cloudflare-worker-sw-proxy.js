/**
 * ============================================================================
 * KHỔNG TỬ NHÍ — TRẠM GÁC CỔNG CLOUDFLARE WORKERS (BFF PROXY + PWA PUSH + CRON)
 * ============================================================================
 * Nhiệm vụ:
 * 1. Giữ kín mật khẩu Admin izTeach trong biến bí mật (env.IZTEACH_ADMIN_PASSWORD).
 * 2. Cấp & kiểm tra Thẻ phiên làm việc (HMAC-SHA256 Signed Token) và chia về 3 trang con:
 *    - Học sinh -> /sll-hocsinh.html
 *    - Giáo viên -> /sll-teacher.html
 *    - Quản lý   -> /sll-admin.html
 * 3. Kết nối Tủ hồ sơ Supabase (Đơn hàng, Lớp học, Điểm danh, Bài tập, Chat, Thiết bị PWA).
 * 4. Tận dụng Kho izTeach (Tài khoản Cognito, Mở khóa học HSK1, Kho S3 chứa Video/Ảnh bài tập).
 * 5. Hẹn giờ tự động mỗi 24h gõ cửa Supabase chống ngủ đông gói Free.
 */

const CDN_LOGO = 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/sofl-remake/logo.png';
const DEFAULT_VAPID_PUBLIC_KEY = 'BG4yPEa0evkPFiDAtau85Mg90U2WimsmOCRZgvIqeXQzUDzts5yR75wQub8YJCSXk0sK5jN3Jc3Hbp9jIVRECPM';
const DEFAULT_VENDOR_ID = '3529cd2b-7af6-4fda-887c-392a79393d6a';
const DEFAULT_COURSE_ID = '6adadba969897b0002482ca5';

const IZTEACH_ENDPOINTS = {
  staffSignin: 'https://gcnj5paf1j.execute-api.ap-southeast-1.amazonaws.com/prod/signin',
  studentSignin: 'https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student/signin',
  studentCrm: 'https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student',
  userPermission: 'https://vs1ocpw7ri.execute-api.ap-southeast-1.amazonaws.com/prod/user-permission',
  courseLayout: 'https://p9y4zl6vkd.execute-api.ap-southeast-1.amazonaws.com/prod/course/layout',
  courseList: 'https://p9y4zl6vkd.execute-api.ap-southeast-1.amazonaws.com/prod/course',
  courseUnits: 'https://p9y4zl6vkd.execute-api.ap-southeast-1.amazonaws.com/prod/unit',
  s3SignedUrl: 'https://xx7swzlhyl.execute-api.ap-southeast-1.amazonaws.com/prod/resource/signed-url',
  resourceReg: 'https://xx7swzlhyl.execute-api.ap-southeast-1.amazonaws.com/prod/resource',
  homeworkApi: 'https://rt6i5wgkj4.execute-api.ap-southeast-1.amazonaws.com/prod/homework',
  contactLead: 'https://c9xi8h3a3d.execute-api.ap-southeast-1.amazonaws.com/prod/contact'
};

// ============================================================================
// DANH MỤC 17 KHÓA HỌC VIDEO THỰC TẾ + GÓI COMBO TRÊN IZTEACH (MASTER CATALOG)
// ============================================================================
const MASTER_PRODUCT_MAPPING = {
  '6adadba969897b0002482ca5': {
    id: '6adadba969897b0002482ca5',
    code: 'HSK1-30',
    title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
    shortTitle: 'HSK1 3.0',
    badge: 'TIÊU CHUẨN MỚI 3.0',
    ageGroup: 'Mọi lứa tuổi (Học sinh & Người lớn)',
    description: '15 bài giảng chuẩn New HSK 3.0, phát âm chuẩn Pinyin, trọn bộ 5 sách PDF & 127 file nghe chất lượng cao.',
    thumb: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/1793019372729-hsk1_gemini_thumb.png',
    demoVideoUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadc45f8c3c60002a2b3c1/playlist.m3u8',
    demoDurationSeconds: 90,
    lessonSample: 'Bài 1: AI小语，你好！ (Phát âm chuẩn Pinyin & Lời chào)',
    lessonsCount: 15,
    price: 890000,
    oldPrice: 1500000
  },
  '65e7704a9ea90c00080d5195': {
    id: '65e7704a9ea90c00080d5195',
    code: 'CFK-01',
    title: 'Chinese For Kids (Khóa học cho bé 5 – 6 tuổi)',
    shortTitle: 'Chinese For Kids',
    badge: 'SONG NGỮ MẦM NON',
    ageGroup: 'Dành cho bé 5 – 6 tuổi',
    description: 'Tiếp cận tiếng Trung qua bài hát, hoạt hình và trò chơi tương tác, kích hoạt khả năng ngôn ngữ tự nhiên ngay từ nhỏ.',
    thumb: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/1709666936339-2023-happy-chinese-new-year-landscape-banner-320-x-180-px-4-png.png',
    demoVideoUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/65e8a7a56036860008448c37/playlist.m3u8',
    demoDurationSeconds: 90,
    lessonSample: 'Lesson 1: 第一课.mp4 (Song ngữ mầm non)',
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000
  },
  '661528ea42af880008944573': {
    id: '661528ea42af880008944573',
    code: 'CFK-03',
    title: 'Chinese For Kids 3 (Khóa Song ngữ Trẻ em Cấp độ 3)',
    shortTitle: 'Chinese For Kids 3',
    badge: 'SONG NGỮ CẤP ĐỘ 3',
    ageGroup: 'Dành cho bé 7 – 9 tuổi',
    description: 'Mở rộng vốn từ vựng song ngữ Trung - Anh và mẫu câu giao tiếp sinh hoạt hàng ngày cho trẻ em.',
    thumb: null,
    demoVideoUrl: null,
    demoDurationSeconds: 0,
    lessonSample: null,
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000
  },
  '65e7636a0a1b61000825c2ef': {
    id: '65e7636a0a1b61000825c2ef',
    code: 'MINI-01',
    title: 'Tiếng Trung Trẻ Em Mini 1 (Khóa học cho bé 4 – 6 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em Mini 1',
    badge: 'MẦM NON MINI 1',
    ageGroup: 'Dành cho bé 4 – 6 tuổi',
    description: 'Làm quen tiếng Trung vỡ lòng qua hình ảnh trực quan, bài đồng dao và từ vựng chủ đề gần gũi.',
    thumb: null,
    demoVideoUrl: null,
    demoDurationSeconds: 0,
    lessonSample: null,
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000
  },
  '6600fa477c18b80008c53c88': {
    id: '6600fa477c18b80008c53c88',
    code: 'MINI-02',
    title: 'Tiếng Trung Trẻ Em Mini 2 (Khóa học cho bé 5 – 7 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em Mini 2',
    badge: 'MẦM NON MINI 2',
    ageGroup: 'Dành cho bé 5 – 7 tuổi',
    description: 'Phát triển phản xạ nghe nói và nhận diện chữ Hán cơ bản qua các câu chuyện thiếu nhi sinh động.',
    thumb: null,
    demoVideoUrl: null,
    demoDurationSeconds: 0,
    lessonSample: null,
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000
  },
  '6600fa7da2bfe10008834e13': {
    id: '6600fa7da2bfe10008834e13',
    code: 'MINI-03',
    title: 'Tiếng Trung Trẻ Em Mini 3 (Khóa học cho bé 6 – 8 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em Mini 3',
    badge: 'MẦM NON MINI 3',
    ageGroup: 'Dành cho bé 6 – 8 tuổi',
    description: 'Hoàn thiện nền tảng phát âm, ghép câu giao tiếp tự nhiên và chuẩn bị bước vào lộ trình YCT.',
    thumb: null,
    demoVideoUrl: null,
    demoDurationSeconds: 0,
    lessonSample: null,
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000
  },
  '65e769bd637339000870618f': {
    id: '65e769bd637339000870618f',
    code: 'KIDS-01',
    title: 'Tiếng Trung Trẻ Em 1 (Lộ trình 6 – 11 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em 1',
    badge: 'CẤP ĐỘ 01',
    ageGroup: 'Dành cho bé 6 – 11 tuổi',
    description: 'Xây dựng nền tảng ngữ âm Pinyin, nét chữ Hán cơ bản và mẫu câu giao tiếp chủ đề bản thân, gia đình.',
    thumb: null,
    demoVideoUrl: null,
    demoDurationSeconds: 0,
    lessonSample: null,
    lessonsCount: 25,
    price: 890000,
    oldPrice: 1500000
  },
  '66028938bfd6c90008b816e1': {
    id: '66028938bfd6c90008b816e1',
    code: 'KIDS-02',
    title: 'Tiếng Trung Trẻ Em 2 (Lộ trình 6 – 12 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em 2',
    badge: 'CẤP ĐỘ 02',
    ageGroup: 'Dành cho bé 6 – 12 tuổi',
    description: 'Mở rộng mẫu câu hỏi đáp thời gian, sở thích, màu sắc và rèn luyện kỹ năng nghe hiểu chuẩn YCT 1-2.',
    thumb: null,
    demoVideoUrl: null,
    demoDurationSeconds: 0,
    lessonSample: null,
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000
  },
  '6638bd09a7367400085c7ab2': {
    id: '6638bd09a7367400085c7ab2',
    code: 'KIDS-03',
    title: 'Tiếng Trung Trẻ Em 3 (Lộ trình 6 – 12 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em 3',
    badge: 'CẤP ĐỘ 03',
    ageGroup: 'Dành cho bé 6 – 12 tuổi',
    description: 'Phương pháp học vui nhộn, hình ảnh sinh động giúp bé nhận diện mặt chữ Hán và phát âm chuẩn tự nhiên như bản xứ.',
    thumb: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/1711340507122-1709664536305-2023-happy-chinese-new-year-landscape-banner-320-x-180-px-1-png-png.png',
    demoVideoUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6638bea35f32730008fb0c0b/playlist.m3u8',
    demoDurationSeconds: 90,
    lessonSample: 'Bài giảng số 1: 1.Bài 1 Lộ 3 Trong công viên.mp4',
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000
  },
  '678d14b960eae20002ddf8fe': {
    id: '678d14b960eae20002ddf8fe',
    code: 'KIDS-04',
    title: 'Tiếng Trung Trẻ Em 4 (Lộ trình 7 – 13 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em 4',
    badge: 'CẤP ĐỘ 04',
    ageGroup: 'Dành cho bé 7 – 13 tuổi',
    description: 'Mở rộng vốn từ vựng chủ đề trường học, gia đình, rèn luyện phản xạ giao tiếp tự tin và kỹ năng viết chữ Hán cơ bản.',
    thumb: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/1740724600476-anh-nen-png.png',
    demoVideoUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/67bbd77b8860310002982dc6/playlist.m3u8',
    demoDurationSeconds: 90,
    lessonSample: 'Lộ 4 Bài 1: LO 4 BAI 1.mp4 (Lộ 4 - Giao tiếp phản xạ)',
    lessonsCount: 16,
    price: 890000,
    oldPrice: 1500000
  },
  '67a7290a5fdc26000238b4e9': {
    id: '67a7290a5fdc26000238b4e9',
    code: 'KIDS-05',
    title: 'Tiếng Trung Trẻ Em 5 (Lộ trình 8 – 14 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em 5',
    badge: 'CẤP ĐỘ 05',
    ageGroup: 'Dành cho bé 8 – 14 tuổi',
    description: 'Phát triển câu văn phức, mở rộng vốn từ chủ đề khoa học, xã hội và tăng cường phản xạ đối thoại lưu loát.',
    thumb: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/1739010469647-1709664720509-2023-happy-chinese-new-year-landscape-banner-320-x-180-px-2-png-png.png',
    demoVideoUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/67a729815277c40002c6c2c6/playlist.m3u8',
    demoDurationSeconds: 90,
    lessonSample: 'Bài 1: Bài 1 lộ 5.mp4 (Hội thoại chuyên sâu & Ngữ pháp)',
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000
  },
  '67a869302ecb9c000257d966': {
    id: '67a869302ecb9c000257d966',
    code: 'KIDS-06',
    title: 'Tiếng Trung Trẻ Em 6 (Lộ trình 9 – 15 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em 6',
    badge: 'CẤP ĐỘ 06',
    ageGroup: 'Dành cho bé 9 – 15 tuổi',
    description: 'Làm chủ kỹ năng thuyết trình, đọc hiểu đoạn văn dài và bứt phá các kỳ thi chứng chỉ quốc tế YCT / HSK.',
    thumb: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/1740724444452-anh-nen-png.png',
    demoVideoUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/67a8696dc4f5400002f8ac46/playlist.m3u8',
    demoDurationSeconds: 90,
    lessonSample: 'Bài 1: Bài 1 lộ 6.mp4 (Luyện thi chuẩn YCT/HSK)',
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000
  },
  '65e772a1767c56000829518e': {
    id: '65e772a1767c56000829518e',
    code: 'JUNIOR-01',
    title: 'Chinese Junior 1 (Tiếng Trung Thiếu Niên Song Ngữ)',
    shortTitle: 'Chinese Junior 1',
    badge: 'CHINESE JUNIOR 1',
    ageGroup: 'Dành cho học sinh 10 – 15 tuổi',
    description: 'Chương trình tiếng Trung thiếu niên song ngữ, rèn luyện toàn diện 4 kỹ năng Nghe - Nói - Đọc - Viết.',
    thumb: null,
    demoVideoUrl: null,
    demoDurationSeconds: 0,
    lessonSample: null,
    lessonsCount: 25,
    price: 990000,
    oldPrice: 1600000
  },
  '6638c76dfac274000876cd13': {
    id: '6638c76dfac274000876cd13',
    code: 'JUNIOR-03',
    title: 'Chinese Junior 3 (Tiếng Trung Thiếu Niên Cấp Độ 3)',
    shortTitle: 'Chinese Junior 3',
    badge: 'CHINESE JUNIOR 3',
    ageGroup: 'Dành cho học sinh 11 – 16 tuổi',
    description: 'Nâng cao ngữ pháp, từ vựng học thuật và phản xạ giao tiếp tiếng Trung chuyên sâu cho lứa tuổi thiếu niên.',
    thumb: null,
    demoVideoUrl: null,
    demoDurationSeconds: 0,
    lessonSample: null,
    lessonsCount: 25,
    price: 990000,
    oldPrice: 1600000
  },
  '65e76a533f5e7c00086715d7': {
    id: '65e76a533f5e7c00086715d7',
    code: 'HSK1-20',
    title: 'Khóa học Tiếng Trung HSK 1 & Giao Tiếp Phản Xạ',
    shortTitle: 'Tiếng Trung HSK 1',
    badge: 'GIAO TIẾP & HSK 1',
    ageGroup: 'Dành cho học sinh & người mới bắt đầu',
    description: '20 bài học trọng tâm HSK 1 kết hợp tình huống giao tiếp phản xạ thực tế hàng ngày.',
    thumb: null,
    demoVideoUrl: null,
    demoDurationSeconds: 0,
    lessonSample: null,
    lessonsCount: 20,
    price: 690000,
    oldPrice: 1200000
  },
  '65f6d1c722106a0008ff81a3': {
    id: '65f6d1c722106a0008ff81a3',
    code: 'HSK-PREP-VN',
    title: 'Khóa học Tiếng Trung + Luyện Thi HSK Chuẩn Quốc Tế',
    shortTitle: 'Tiếng Trung + Luyện Thi HSK',
    badge: 'LUYỆN THI HSK',
    ageGroup: 'Dành cho học sinh ôn thi HSK',
    description: 'Hệ thống hóa kiến thức, chiến thuật làm bài và giải đề luyện thi chứng chỉ HSK quốc tế.',
    thumb: null,
    demoVideoUrl: null,
    demoDurationSeconds: 0,
    lessonSample: null,
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000
  },
  '65e773c89ea90c00080d52fc': {
    id: '65e773c89ea90c00080d52fc',
    code: 'HSK-PREP-EN',
    title: 'Chinese + HSK Exam Preparation (Song ngữ Quốc tế)',
    shortTitle: 'Chinese + HSK Exam Prep',
    badge: 'HSK EXAM PREP',
    ageGroup: 'Hệ song ngữ Trung - Anh',
    description: 'Khóa luyện thi HSK giảng dạy song ngữ Trung - Anh chuẩn quốc tế dành cho học sinh trường quốc tế.',
    thumb: null,
    demoVideoUrl: null,
    demoDurationSeconds: 0,
    lessonSample: null,
    lessonsCount: 20,
    price: 990000,
    oldPrice: 1600000
  },
  'BUNDLE_YCT_ALL': {
    id: 'BUNDLE_YCT_ALL',
    code: 'COMBO-6',
    title: 'Trọn Bộ 6 Khóa Học Trực Tuyến (Lộ trình 5 – 15 tuổi)',
    shortTitle: 'Trọn Bộ 6 Khóa',
    badge: 'COMBO ƯU ĐÃI 50%',
    ageGroup: 'Trọn lộ trình 5 – 15 tuổi',
    description: 'Mở khóa toàn bộ 6 khóa học trọng tâm từ vỡ lòng đến nâng cao với học phí ưu đãi tiết kiệm 50%.',
    thumb: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/1793019372729-hsk1_gemini_thumb.png',
    demoVideoUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadc45f8c3c60002a2b3c1/playlist.m3u8',
    demoDurationSeconds: 90,
    lessonSample: 'Bài 1: AI小语，你好！ (Học thử Combo 6 khóa)',
    isBundle: true,
    bundleCourseIds: [
      '6adadba969897b0002482ca5',
      '65e7704a9ea90c00080d5195',
      '6638bd09a7367400085c7ab2',
      '678d14b960eae20002ddf8fe',
      '67a7290a5fdc26000238b4e9',
      '67a869302ecb9c000257d966'
    ],
    lessonsCount: 111,
    price: 2990000,
    oldPrice: 6000000
  }
};

function resolveOrderCourseIds(orderOrInput) {
  if (!orderOrInput) return [DEFAULT_COURSE_ID];
  if (Array.isArray(orderOrInput)) {
    const out = new Set();
    orderOrInput.forEach(item => {
      resolveOrderCourseIds(item).forEach(cid => out.add(cid));
    });
    return out.size ? Array.from(out) : [DEFAULT_COURSE_ID];
  }
  if (typeof orderOrInput === 'object') {
    if (Array.isArray(orderOrInput.courseIds) && orderOrInput.courseIds.length > 0) {
      return resolveOrderCourseIds(orderOrInput.courseIds);
    }
    const rawCid = String(orderOrInput.course_id || orderOrInput.courseId || orderOrInput.productId || '').trim();
    const rawName = String(orderOrInput.course_name || orderOrInput.courseName || orderOrInput.title || '').toLowerCase();
    if (rawCid === 'BUNDLE_YCT_ALL' || /trọn bộ|combo\s*6/i.test(rawName)) {
      return [...MASTER_PRODUCT_MAPPING.BUNDLE_YCT_ALL.bundleCourseIds];
    }
    if (rawCid && MASTER_PRODUCT_MAPPING[rawCid] && !MASTER_PRODUCT_MAPPING[rawCid].isBundle) {
      return [rawCid];
    }
    if (/chinese for kids|5\s*[-–]\s*6\s*tuổi/i.test(rawName) && !/trẻ em 3/i.test(rawName)) return ['65e7704a9ea90c00080d5195'];
    if (/trẻ em 3|cấp độ 03/i.test(rawName)) return ['6638bd09a7367400085c7ab2'];
    if (/trẻ em 4|cấp độ 04/i.test(rawName)) return ['678d14b960eae20002ddf8fe'];
    if (/trẻ em 5|cấp độ 05/i.test(rawName)) return ['67a7290a5fdc26000238b4e9'];
    if (/trẻ em 6|cấp độ 06/i.test(rawName)) return ['67a869302ecb9c000257d966'];
    if (/yct\s*4/i.test(rawName)) return ['6983672f409cc20002e530b8'];
    if (/phát âm|giao tiếp phản xạ/i.test(rawName)) return ['65e76a533f5e7c00086715d7'];
    if (/hán tự|luyện viết chữ hán/i.test(rawName)) return ['67bebce067dba000027d8119'];
    if (rawCid && /^[0-9a-f]{24}$/i.test(rawCid)) return [rawCid];
    return [DEFAULT_COURSE_ID];
  }
  const str = String(orderOrInput).trim();
  if (str === 'BUNDLE_YCT_ALL') return [...MASTER_PRODUCT_MAPPING.BUNDLE_YCT_ALL.bundleCourseIds];
  return [str || DEFAULT_COURSE_ID];
}

function filterMissingCourses(existingIds, targetIds) {
  const existingSet = new Set((Array.isArray(existingIds) ? existingIds : []).map(x => String(x?.id || x?._id || x || '').trim()).filter(Boolean));
  return (Array.isArray(targetIds) ? targetIds : [])
    .map(id => String(id || '').trim())
    .filter(id => id && !existingSet.has(id));
}

function computeStudentCase(stu) {
  if (!stu) return 'unassigned';
  const hasOnline = Boolean(stu.has_online_courses || stu.hasOnlineCourses || (Array.isArray(stu.online_courses || stu.onlineCourses) && (stu.online_courses || stu.onlineCourses).length > 0));
  const hasLive = Boolean(stu.has_live_class || stu.hasLiveClass || stu.class_code || stu.classCode);
  if (hasOnline && hasLive) return 'both';
  if (hasOnline) return 'online_only';
  if (hasLive) return 'sll_only';
  return 'unassigned';
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-KTN-Webhook-Secret, X-KTN-Test-Mode',
  'Access-Control-Max-Age': '86400',
  'X-KTN-Worker-Version': 'ktn-prod-v2026.11.03'
};

function buildSwScript(vapidPublicKey) {
  return `
const CDN_LOGO = '${CDN_LOGO}';
const VAPID_PUBLIC_KEY = '${vapidPublicKey || DEFAULT_VAPID_PUBLIC_KEY}';
const RECENT_PUSH_EVENT_IDS = new Set();

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function hasMatchingApplicationServerKey(sub, expectedKeyBytes) {
  try {
    const rawKey = sub && sub.options && sub.options.applicationServerKey;
    if (!rawKey) return true;
    const actual = new Uint8Array(rawKey);
    if (actual.length !== expectedKeyBytes.length) return false;
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== expectedKeyBytes[i]) return false;
    }
    return true;
  } catch {
    return true;
  }
}

function syncSubscriptionToBackend(sub, previousEndpoint) {
  if (!sub || typeof sub.toJSON !== 'function') return Promise.resolve();
  const subJson = sub.toJSON();
  if (!subJson || !subJson.endpoint || !subJson.keys || !subJson.keys.p256dh || !subJson.keys.auth) {
    return Promise.resolve();
  }
  return fetch('/api/ktn/push/subscribe', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: subJson,
      ...(previousEndpoint ? { previousEndpoint } : {})
    })
  }).catch(() => {});
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    self.clients.claim().then(() => {
      if (!self.registration || !self.registration.pushManager) return;
      const expectedKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      return self.registration.pushManager.getSubscription().then((sub) => {
        if (!sub) return;
        let previousEndpoint = '';
        let subPromise = Promise.resolve(sub);
        if (!hasMatchingApplicationServerKey(sub, expectedKey)) {
          previousEndpoint = sub.endpoint || '';
          subPromise = sub.unsubscribe().catch(() => false).then(() =>
            self.registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: expectedKey
            })
          );
        }
        return subPromise.then((activeSub) => {
          if (!activeSub) return;
          return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            if (windowClients && windowClients.length > 0) {
              windowClients.forEach((c) =>
                c.postMessage({
                  type: 'KTN_PUSH_SUBSCRIPTION_CHANGED',
                  subscription: activeSub.toJSON(),
                  previousEndpoint: previousEndpoint || undefined
                })
              );
              return;
            }
            return syncSubscriptionToBackend(activeSub, previousEndpoint);
          });
        });
      }).catch(() => {});
    })
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch { payload = { title: 'Học Viện Khổng Tử Nhí', body: event.data ? event.data.text() : 'Bạn có thông báo mới!' }; }
  const notif = payload.notification || payload;
  const title = notif.title || 'Học Viện Khổng Tử Nhí';
  const eventId = String(notif.eventId || notif.id || ('ktn-push-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)));
  if (RECENT_PUSH_EVENT_IDS.size > 100) {
    RECENT_PUSH_EVENT_IDS.clear();
  }
  RECENT_PUSH_EVENT_IDS.add(eventId);
  const targetUrl = notif.action_url || notif.url || '/custom-page/so-lien-lac-test#/notifications';
  const eventType = String(notif.eventType || notif.type || 'web_push');
  const options = {
    body: notif.body || 'Chạm để mở Sổ Liên Lạc Điện Tử.',
    icon: notif.icon || CDN_LOGO,
    badge: notif.badge || CDN_LOGO,
    tag: eventId,
    renotify: true,
    timestamp: Number(notif.timestamp) || Date.now(),
    data: {
      url: targetUrl,
      action_url: targetUrl,
      actionUrl: targetUrl,
      id: eventId,
      eventId,
      eventType,
      type: eventType,
      roomId: notif.roomId || (notif.data && notif.data.roomId) || '',
      classCode: notif.classCode || (notif.data && notif.data.classCode) || '',
      homeworkId: notif.homeworkId || (notif.data && notif.data.homeworkId) || '',
      courseId: notif.courseId || (notif.data && notif.data.courseId) || '',
      lessonNum: notif.lessonNum || (notif.data && notif.data.lessonNum) || null,
      sessionNum: notif.sessionNum || (notif.data && notif.data.sessionNum) || null,
      messageId: notif.messageId || ''
    }
  };
  const showPromise = self.registration.showNotification(title, options).catch(() =>
    self.registration.showNotification(title, {
      body: options.body,
      tag: eventId,
      data: options.data
    })
  );
  event.waitUntil(
    showPromise.then(() =>
      Promise.all([
        fetch('/api/ktn/push/ack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId, eventType, displayedAt: new Date().toISOString() })
        }).catch(() => {}),
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
          windowClients.forEach((c) =>
            c.postMessage({
              type: 'KTN_PUSH_RECEIVED',
              eventId,
              eventType,
              title,
              body: options.body,
              data: options.data
            })
          );
        }).catch(() => {})
      ])
    )
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  const prevEndpoint = (event && event.oldSubscription && event.oldSubscription.endpoint) ? event.oldSubscription.endpoint : '';
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    }).then((newSub) => {
      return Promise.all([
        syncSubscriptionToBackend(newSub, prevEndpoint),
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
          clients.forEach((c) =>
            c.postMessage({
              type: 'KTN_PUSH_SUBSCRIPTION_CHANGED',
              subscription: newSub.toJSON(),
              previousEndpoint: prevEndpoint || undefined
            })
          );
        })
      ]);
    }).catch(() => {})
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'KTN_SHOW_NOTIFICATION') {
    const localId = String((data.data && (data.data.eventId || data.data.id)) || ('ktn-local-' + Date.now()));
    if (RECENT_PUSH_EVENT_IDS.has(localId)) {
      return;
    }
    const targetUrl = (data.data && (data.data.action_url || data.data.url)) || '/custom-page/so-lien-lac-test#/notifications';
    event.waitUntil(
      self.registration.showNotification(data.title || 'Học Viện Khổng Tử Nhí', {
        body: data.body || '',
        icon: CDN_LOGO,
        badge: CDN_LOGO,
        tag: localId,
        renotify: true,
        data: { url: targetUrl, action_url: targetUrl, id: localId, eventId: localId }
      }).catch(() => {})
    );
  }
});

function resolveSwColdOpenUrl(data) {
  const raw = String((data && (data.url || data.action_url || data.actionUrl)) || '').trim();
  const type = String((data && (data.eventType || data.type)) || '').trim();
  const classCode = String((data && data.classCode) || '').replace(/^class:/i, '').trim().toUpperCase();
  const roomId = String((data && data.roomId) || '').trim();
  const homeworkId = String((data && data.homeworkId) || '').trim();
  let working = raw;
  if (/^https?:\\/\\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const host = parsed.hostname.toLowerCase();
      const isInternal =
        host === 'khongtunhi.com' ||
        host === 'www.khongtunhi.com' ||
        host === 'localhost' ||
        host === '127.0.0.1';
      if (!isInternal) {
        return raw;
      }
      working = (parsed.pathname || '') + (parsed.search || '') + (parsed.hash || '');
    } catch {
      return raw;
    }
  }
  let route = working;
  const hashIdx = route.indexOf('#');
  if (hashIdx >= 0) {
    route = route.slice(hashIdx + 1);
  } else if (/^\\/custom-page\\/so-lien-lac(?:-test)?/i.test(route)) {
    route = route.replace(/^\\/custom-page\\/so-lien-lac(?:-test)?/i, '') || '/notifications';
  }
  if (!route.startsWith('/')) route = '/' + route;

  const qIdx = route.indexOf('?');
  const sp = new URLSearchParams(qIdx >= 0 ? route.slice(qIdx + 1) : '');
  const viewParam = sp.get('view') || '';

  if (route.startsWith('/messages') || route.startsWith('/nhom-lop') || viewParam === 'groups') {
    let targetRoom = sp.get('room') || sp.get('roomId') || roomId || '';
    const qCls = (sp.get('class') || sp.get('classCode') || classCode || '').replace(/^class:/i, '').trim().toUpperCase();
    if (!targetRoom && qCls) {
      targetRoom = 'class:' + qCls;
    } else if (targetRoom && !/^(?:class:|course:|student:)/i.test(targetRoom)) {
      targetRoom = 'class:' + targetRoom.toUpperCase();
    } else if (targetRoom && /^class:/i.test(targetRoom)) {
      targetRoom = 'class:' + targetRoom.slice(6).trim().toUpperCase();
    }
    route = targetRoom ? ('/chat?room=' + encodeURIComponent(targetRoom)) : '/chat';
  } else if (viewParam === 'grade') {
    const hwId = sp.get('hwId') || homeworkId || '';
    route = hwId ? ('/teacher?hwId=' + encodeURIComponent(hwId)) : '/teacher';
  } else if (viewParam === 'orders') {
    route = '/admin';
  } else if (route === '/notifications' || route === '/' || route === '/dashboard') {
    if (type === 'class_created' || type === 'class_teacher_changed') {
      route = classCode ? ('/teacher/classes?class=' + encodeURIComponent(classCode)) : '/teacher/classes';
    } else if (
      type === 'class_joined' ||
      type === 'class_reminder' ||
      type === 'schedule_changed' ||
      type === 'homework_assigned'
    ) {
      route = classCode ? ('/classrooms?class=' + encodeURIComponent(classCode)) : '/classrooms';
    } else if (
      type === 'chat_group_message' ||
      type === 'chat_private_message' ||
      type === 'chat_course_message' ||
      type === 'chat_message'
    ) {
      const targetRoom = roomId || (classCode ? ('class:' + classCode) : '');
      route = targetRoom ? ('/chat?room=' + encodeURIComponent(targetRoom)) : '/chat';
    } else {
      route = '/notifications';
    }
  }
  return '/custom-page/so-lien-lac-test#' + route;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = resolveSwColdOpenUrl(data);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const portalClient = windowClients.find((c) => c && typeof c.url === 'string' && c.url.includes('/custom-page/so-lien-lac'));
      if (portalClient) {
        portalClient.postMessage({ type: 'KTN_NOTIFICATION_CLICKED', data });
        if ('focus' in portalClient) return portalClient.focus();
        return;
      }
      const anyClient = windowClients[0];
      if (anyClient && typeof anyClient.navigate === 'function') {
        return anyClient.navigate(targetUrl).then((c) => (c && 'focus' in c ? c.focus() : null));
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
`.trim();
}

function b64urlEncodeBytes(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecodeBytes(str) {
  const clean = String(str || '').trim();
  const pad = '='.repeat((4 - (clean.length % 4)) % 4);
  const b64 = (clean + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concatUint8Arrays(...arrays) {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

async function hkdfDeriveBytes(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

function fnv1aHash36(str) {
  const s = String(str || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function recordPushDiagnosticLog(entry) {
  const safeEventId = String(entry.eventId || '').replace(/[a-zA-Z0-9.%+]+@[a-zA-Z0-9.-]+/g, 'stu');
  const logLine = `${safeEventId} | ${entry.eventType} | ${entry.recipientCount} | ${entry.subscriptionCount} | ${entry.pushAccepted} | ${entry.pushFailed} | ${entry.reason}`;
  console.log(`[KTN-PUSH] ${logLine}`);
  if (!Array.isArray(globalThis.__ktnPushDiagnosticsLog)) {
    globalThis.__ktnPushDiagnosticsLog = [];
  }
  globalThis.__ktnPushDiagnosticsLog.unshift({
    timestamp: new Date().toISOString(),
    eventId: safeEventId,
    eventType: entry.eventType,
    recipientCount: entry.recipientCount,
    subscriptionCount: entry.subscriptionCount,
    pushAccepted: entry.pushAccepted,
    pushFailed: entry.pushFailed,
    reason: entry.reason,
    logLine,
    pushServiceAccepted: entry.pushAccepted > 0,
    deviceDisplayConfirmed: false
  });
  if (globalThis.__ktnPushDiagnosticsLog.length > 100) {
    globalThis.__ktnPushDiagnosticsLog.length = 100;
  }
  return logLine;
}

async function resolveClassRecipientEmails(env, classCode, options = {}) {
  const cleanClass = String(classCode || '').trim().toUpperCase();
  const excludeEmail = normalizeEmail(options.excludeEmail || '');
  const includeTeacher = Boolean(options.includeTeacher || options.onlyTeachers);
  const onlyTeachers = Boolean(options.onlyTeachers);
  if (!cleanClass) return { classCode: '', recipientEmails: [] };

  const clsRes = await supabaseRequest(
    env,
    `ktn_classes?id=eq.${encodeURIComponent(cleanClass)}&select=id,teacher_email,teacher_code,active&limit=5`
  );
  const clsRows = (clsRes.ok && Array.isArray(clsRes.data)) ? clsRes.data : [];
  const clsRow = clsRows[0] || null;
  if (clsRow && clsRow.active === false) {
    return { classCode: cleanClass, active: false, recipientEmails: [] };
  }

  const recipientSet = new Set();
  if (!onlyTeachers) {
    const [stuRes, stuLifecycleMap] = await Promise.all([
      supabaseRequest(
        env,
        `ktn_students?class_code=eq.${encodeURIComponent(cleanClass)}&select=*&limit=500`
      ),
      typeof loadAllStudentLifecycleStates === 'function'
        ? loadAllStudentLifecycleStates(env).catch(() => new Map())
        : Promise.resolve(new Map())
    ]);
    if (stuRes.ok && Array.isArray(stuRes.data)) {
      for (const s of stuRes.data) {
        const sCls = String(s?.class_code || '').trim().toUpperCase();
        const em = normalizeEmail(s?.email || '');
        if (!em || sCls !== cleanClass || em === excludeEmail) continue;
        const lifeStatus = String(stuLifecycleMap.get(em)?.status || s?.account_status || s?.status || 'active').toLowerCase();
        if (lifeStatus === 'deleted' || lifeStatus === 'suspended' || lifeStatus === 'archived' || lifeStatus === 'dropped' || lifeStatus === 'locked') continue;
        recipientSet.add(em);
      }
    }
  }

  if (includeTeacher) {
    const teaRes = await supabaseRequest(env, 'ktn_teachers?select=*&limit=100');
    const allTeachers = (teaRes.ok && Array.isArray(teaRes.data)) ? teaRes.data : [];
    const inactiveTeacherEmails = new Set();
    const activeTeacherByEmail = new Map();
    const activeTeacherByCode = new Map();
    for (const t of allTeachers) {
      const tEm = normalizeEmail(t?.email || '');
      const tCode = String(t?.code || '').trim().toUpperCase();
      if (t?.active === false) {
        if (tEm) inactiveTeacherEmails.add(tEm);
        continue;
      }
      if (tEm) activeTeacherByEmail.set(tEm, t);
      if (tCode) activeTeacherByCode.set(tCode, t);
    }

    const clsOwnerEmail = normalizeEmail(clsRow?.teacher_email || '');
    const clsOwnerCode = String(clsRow?.teacher_code || '').trim().toUpperCase();
    if (clsOwnerEmail && !inactiveTeacherEmails.has(clsOwnerEmail)) {
      if (allTeachers.length === 0 || activeTeacherByEmail.has(clsOwnerEmail)) {
        if (clsOwnerEmail !== excludeEmail) recipientSet.add(clsOwnerEmail);
      }
    } else if (clsOwnerCode && activeTeacherByCode.has(clsOwnerCode)) {
      const matchedEm = normalizeEmail(activeTeacherByCode.get(clsOwnerCode)?.email || '');
      if (matchedEm && matchedEm !== excludeEmail) recipientSet.add(matchedEm);
    }

    for (const t of allTeachers) {
      if (t?.active === false) continue;
      const tEm = normalizeEmail(t?.email || '');
      const tCode = String(t?.code || '').trim().toUpperCase();
      if (!tEm || tEm === excludeEmail) continue;
      // Nếu ktn_classes đã gắn chủ nhiệm rõ ràng cho giáo viên khác, không dùng assigned_classes cũ
      if (clsOwnerEmail && clsOwnerEmail !== tEm && (!clsOwnerCode || clsOwnerCode !== tCode)) {
        continue;
      }
      const meta = extractTeacherMetaFromRow(t);
      if (meta.assignedClasses.includes(cleanClass)) {
        recipientSet.add(tEm);
      }
    }
  }

  recipientSet.delete(excludeEmail);
  return {
    classCode: cleanClass,
    active: true,
    recipientEmails: Array.from(recipientSet)
  };
}

async function resolvePrivateMessageRecipientEmails(env, studentEmail, session) {
  const targetStu = normalizeEmail(studentEmail || '');
  const senderEmail = normalizeEmail(session?.email || '');
  if (!targetStu) return [];

  if (session?.role !== 'student') {
    return targetStu !== senderEmail ? [targetStu] : [];
  }

  const recipientSet = new Set();
  const stuRes = await supabaseRequest(
    env,
    `ktn_students?email=eq.${encodeURIComponent(targetStu)}&select=class_code&limit=1`
  );
  const stuRow = (stuRes.ok && Array.isArray(stuRes.data) && stuRes.data[0]) ? stuRes.data[0] : null;
  const stuClass = String(stuRow?.class_code || session?.classCode || '').trim().toUpperCase();
  if (stuClass) {
    const clsRecipients = await resolveClassRecipientEmails(env, stuClass, {
      includeTeacher: true,
      excludeEmail: senderEmail
    });
    const teaRes = await supabaseRequest(env, 'ktn_teachers?active=eq.true&select=*&limit=50');
    const teacherEmailSet = new Set();
    if (teaRes.ok && Array.isArray(teaRes.data)) {
      for (const t of teaRes.data) {
        if (t?.active === false) continue;
        const em = normalizeEmail(t?.email || '');
        if (em) teacherEmailSet.add(em);
      }
    }
    for (const em of clsRecipients.recipientEmails) {
      if (teacherEmailSet.has(em) && em !== senderEmail) {
        recipientSet.add(em);
      }
    }
  }
  if (recipientSet.size === 0) {
    const teaRes = await supabaseRequest(env, 'ktn_teachers?active=eq.true&select=email,active&limit=20');
    if (teaRes.ok && Array.isArray(teaRes.data)) {
      for (const t of teaRes.data) {
        if (t?.active === false) continue;
        const em = normalizeEmail(t?.email || '');
        if (em && em !== senderEmail) recipientSet.add(em);
      }
    }
  }
  recipientSet.delete(senderEmail);
  return Array.from(recipientSet);
}

async function sendWebPushToSubscription(env, subRow, payloadObj) {
  const vapidPublicKey = String(env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY).trim();
  const vapidPrivateRaw = String(env.VAPID_PRIVATE_KEY || '').trim();
  if (!vapidPrivateRaw) {
    return {
      ok: false,
      blocked: true,
      status: 0,
      pushServiceAccepted: false,
      deviceDisplayConfirmed: false,
      reason: 'MISSING_VAPID_PRIVATE_KEY'
    };
  }
  const endpoint = String(subRow?.endpoint || '').trim();
  const p256dh = String(subRow?.p256dh || subRow?.keys?.p256dh || '').trim();
  const auth = String(subRow?.auth || subRow?.keys?.auth || '').trim();
  if (!endpoint.startsWith('https://') || !p256dh || !auth) {
    return {
      ok: false,
      invalid: true,
      status: 0,
      pushServiceAccepted: false,
      deviceDisplayConfirmed: false,
      reason: 'INVALID_SUBSCRIPTION_RECORD'
    };
  }
  if (
    endpoint.includes('push.khongtunhi.com/v2/') ||
    p256dh === 'ktn-mobile-web-p256dh' ||
    auth === 'ktn-mobile-web-auth'
  ) {
    await supabaseRequest(env, `ktn_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
      method: 'DELETE'
    }).catch(() => null);
    return {
      ok: false,
      invalid: true,
      expired: true,
      removed: true,
      status: 0,
      pushServiceAccepted: false,
      deviceDisplayConfirmed: false,
      reason: 'CORRUPT_SYNTHETIC_SUBSCRIPTION_REMOVED'
    };
  }

  let jwt = '';
  let bodyBytes = null;
  try {
    const endpointUrl = new URL(endpoint);
    const aud = `${endpointUrl.protocol}//${endpointUrl.host}`;
    const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
    const enc = new TextEncoder();

    const jwtHeader = b64urlEncodeBytes(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const jwtPayload = b64urlEncodeBytes(
      enc.encode(JSON.stringify({ aud, exp, sub: 'mailto:hocvienkhongtunhi123@gmail.com' }))
    );
    const unsignedToken = `${jwtHeader}.${jwtPayload}`;
    const cleanedPriv = vapidPrivateRaw.replace(/^['"]|['"]$/g, '').trim();
    let jwk;
    if (cleanedPriv.startsWith('{')) {
      jwk = JSON.parse(cleanedPriv);
    } else {
      const pubBytes = b64urlDecodeBytes(vapidPublicKey);
      if (pubBytes.length !== 65 || pubBytes[0] !== 4) {
        throw new Error('Invalid VAPID_PUBLIC_KEY uncompressed P-256 point');
      }
      jwk = {
        kty: 'EC',
        crv: 'P-256',
        x: b64urlEncodeBytes(pubBytes.slice(1, 33)),
        y: b64urlEncodeBytes(pubBytes.slice(33, 65)),
        d: cleanedPriv,
        ext: true
      };
    }
    const vapidPrivKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
    const sigBuf = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      vapidPrivKey,
      enc.encode(unsignedToken)
    );
    jwt = `${unsignedToken}.${b64urlEncodeBytes(new Uint8Array(sigBuf))}`;

    const uaPublicBytes = b64urlDecodeBytes(p256dh);
    const authSecretBytes = b64urlDecodeBytes(auth);
    const uaPubKey = await crypto.subtle.importKey(
      'raw',
      uaPublicBytes,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );
    const asKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
    const asPublicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey));
    const sharedSecret = new Uint8Array(
      await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPubKey }, asKeyPair.privateKey, 256)
    );

    const keyInfo = concatUint8Arrays(enc.encode('WebPush: info\0'), uaPublicBytes, asPublicBytes);
    const prkKey = await hkdfDeriveBytes(authSecretBytes, sharedSecret, keyInfo, 32);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const cekBytes = await hkdfDeriveBytes(salt, prkKey, enc.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonceBytes = await hkdfDeriveBytes(salt, prkKey, enc.encode('Content-Encoding: nonce\0'), 12);

    const aesKey = await crypto.subtle.importKey('raw', cekBytes, 'AES-GCM', false, ['encrypt']);
    const plaintext = concatUint8Arrays(enc.encode(JSON.stringify(payloadObj)), new Uint8Array([2]));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonceBytes, tagLength: 128 }, aesKey, plaintext)
    );

    const header = new Uint8Array(16 + 4 + 1 + asPublicBytes.length);
    header.set(salt, 0);
    header[16] = 0;
    header[17] = 0;
    header[18] = 16;
    header[19] = 0;
    header[20] = asPublicBytes.length;
    header.set(asPublicBytes, 21);
    bodyBytes = concatUint8Arrays(header, ciphertext);
  } catch (cryptoErr) {
    return {
      ok: false,
      cryptoError: true,
      status: 0,
      pushServiceAccepted: false,
      deviceDisplayConfirmed: false,
      reason: `WEB_PUSH_ENCRYPT_ERROR:${cryptoErr?.name || 'CryptoError'}`
    };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 6000) : null;
  try {
    const pushRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: 'high'
      },
      body: bodyBytes,
      ...(controller ? { signal: controller.signal } : {})
    });

    if (pushRes.status === 404 || pushRes.status === 410) {
      await supabaseRequest(env, `ktn_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
        method: 'DELETE'
      }).catch(() => null);
      return {
        ok: false,
        expired: true,
        removed: true,
        status: pushRes.status,
        pushServiceAccepted: false,
        deviceDisplayConfirmed: false,
        reason: `SUBSCRIPTION_EXPIRED_${pushRes.status}`
      };
    }

    if (pushRes.ok) {
      return {
        ok: true,
        status: pushRes.status,
        pushServiceAccepted: true,
        deviceDisplayConfirmed: false,
        reason: `PUSH_SERVICE_ACCEPTED_${pushRes.status}`
      };
    }

    let gatewayErrToken = '';
    try {
      const rawErrText = await pushRes.text();
      if (rawErrText) {
        try {
          const parsedErr = JSON.parse(rawErrText);
          gatewayErrToken = String(parsedErr?.reason || parsedErr?.error || parsedErr?.message || '').trim();
        } catch {
          gatewayErrToken = String(rawErrText).trim();
        }
      }
    } catch {
      gatewayErrToken = '';
    }
    const cleanErrCode = gatewayErrToken
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+/g, '')
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48);

    const permanentFailureCodes = [
      'Unregistered',
      'NotRegistered',
      'InvalidRegistration',
      'VapidPkHashMismatch',
      'DeviceTokenNotForTopic',
      'BadDeviceToken'
    ];
    const isPermanentInvalidSub =
      (pushRes.status === 400 || pushRes.status === 401 || pushRes.status === 403) &&
      permanentFailureCodes.some((code) => cleanErrCode.toLowerCase().includes(code.toLowerCase()));

    if (isPermanentInvalidSub) {
      await supabaseRequest(env, `ktn_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
        method: 'DELETE'
      }).catch(() => null);
    }

    return {
      ok: false,
      expired: isPermanentInvalidSub,
      removed: isPermanentInvalidSub,
      status: pushRes.status,
      pushServiceAccepted: false,
      deviceDisplayConfirmed: false,
      reason: cleanErrCode
        ? `PUSH_SERVICE_HTTP_${pushRes.status}:${cleanErrCode}`
        : `PUSH_SERVICE_HTTP_${pushRes.status}`
    };
  } catch (netErr) {
    const isAbort = netErr && (netErr.name === 'AbortError' || String(netErr.message || '').includes('aborted'));
    return {
      ok: false,
      networkError: true,
      status: 0,
      pushServiceAccepted: false,
      deviceDisplayConfirmed: false,
      reason: isAbort ? 'PUSH_GATEWAY_TIMEOUT' : `PUSH_NETWORK_ERROR:${netErr?.name || 'FetchError'}`
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

const VN_DAY_LABELS = {
  0: 'Chủ Nhật',
  1: 'Thứ 2',
  2: 'Thứ 3',
  3: 'Thứ 4',
  4: 'Thứ 5',
  5: 'Thứ 6',
  6: 'Thứ 7'
};

const VN_DAY_SHORT_LABELS = {
  0: 'CN',
  1: 'T2',
  2: 'T3',
  3: 'T4',
  4: 'T5',
  5: 'T6',
  6: 'T7'
};

const VN_WEEKDAY_SORT_ORDER = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 0: 7 };

function getVnDateTimeParts(epochMs = Date.now()) {
  const vnMs = Number(epochMs) + 7 * 3600 * 1000;
  const d = new Date(vnMs);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const dayOfWeek = d.getUTCDay();
  const hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  return { year, month, day, dayOfWeek, hours, minutes, dateStr, timeStr };
}

function vnDateTimeToEpochMs(dateStr, timeStr = '19:30') {
  const dm = String(dateStr || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = String(timeStr || '19:30').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!dm || !tm) return NaN;
  const year = Number(dm[1]);
  const month = Number(dm[2]);
  const day = Number(dm[3]);
  const hour = Number(tm[1]);
  const minute = Number(tm[2]);
  return Date.UTC(year, month - 1, day, hour - 7, minute, 0, 0);
}

function normalizeTimeHHMM(raw, fallback = '') {
  const m = String(raw || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return fallback;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function addOneHourHHMM(timeStr) {
  const m = String(timeStr || '').match(/^(\d{2}):(\d{2})$/);
  if (!m) return '20:30';
  const nextH = (Number(m[1]) + 1) % 24;
  return `${String(nextH).padStart(2, '0')}:${m[2]}`;
}

function formatOfficialScheduleDisplay(cfg) {
  if (!cfg || typeof cfg !== 'object' || cfg.status !== 'confirmed') {
    return 'Chưa có lịch học chính thức';
  }
  const start = normalizeTimeHHMM(cfg.startTime, '');
  const end = normalizeTimeHHMM(cfg.endTime, '');
  const timeRange = start ? (end ? `${start}–${end}` : start) : '';
  if (cfg.scheduleMode === 'custom_sessions') {
    const customList = Array.isArray(cfg.customSessions) ? cfg.customSessions : [];
    if (customList.length === 0) return 'Chưa có lịch học chính thức';
    return `Lịch theo buổi (${customList.length} buổi)${timeRange ? ` — ${timeRange}` : ''}`;
  }
  const days = Array.isArray(cfg.daysOfWeek)
    ? Array.from(new Set(cfg.daysOfWeek.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)))
    : [];
  if (days.length === 0 || !start) {
    return 'Chưa có lịch học chính thức';
  }
  days.sort((a, b) => (VN_WEEKDAY_SORT_ORDER[a] || 9) - (VN_WEEKDAY_SORT_ORDER[b] || 9));
  const dayNames = days.map((d) => VN_DAY_LABELS[d] || `Thứ ${d + 1}`);
  const dayPart = dayNames.length <= 2 ? dayNames.join(' & ') : dayNames.join(', ');
  return `${dayPart} — ${timeRange}`;
}

function parseLegacyScheduleSuggestion(rawText) {
  const text = String(rawText || '').trim();
  if (!text || text === 'Chưa có lịch học chính thức') return null;
  const timeMatch = text.match(/\b(\d{1,2}:\d{2})(?:\s*[-–~]\s*(\d{1,2}:\d{2}))?/);
  const startTime = timeMatch ? normalizeTimeHHMM(timeMatch[1], '19:30') : '19:30';
  const endTime = timeMatch && timeMatch[2] ? normalizeTimeHHMM(timeMatch[2], addOneHourHHMM(startTime)) : addOneHourHHMM(startTime);
  const days = new Set();
  const tMatches = text.matchAll(/(?:thứ|thu|\bt)\s*([2-7])/gi);
  for (const m of tMatches) {
    const num = Number(m[1]);
    if (num >= 2 && num <= 7) days.add(num - 1);
  }
  if (/chủ\s*nhật|chu\s*nhat|\bcn\b/i.test(text)) {
    days.add(0);
  }
  const daysOfWeek = Array.from(days).sort((a, b) => (VN_WEEKDAY_SORT_ORDER[a] || 9) - (VN_WEEKDAY_SORT_ORDER[b] || 9));
  if (daysOfWeek.length === 0) return null;
  return {
    daysOfWeek,
    startTime,
    endTime,
    timezone: 'Asia/Ho_Chi_Minh',
    scheduleMode: 'weekly',
    legacySourceText: text
  };
}

function computeUpcomingClassSessions(cfg, nowMs = Date.now(), limit = 6) {
  if (!cfg || typeof cfg !== 'object' || cfg.status !== 'confirmed') {
    return [];
  }
  const startDefault = normalizeTimeHHMM(cfg.startTime, '19:30');
  const endDefault = normalizeTimeHHMM(cfg.endTime, addOneHourHHMM(startDefault));
  const effectiveFrom = String(cfg.effectiveFrom || '').trim();
  const effectiveUntil = String(cfg.effectiveUntil || '').trim();
  const scheduleMode =
    cfg.scheduleMode === 'custom_sessions' || cfg.mode === 'custom_sessions'
      ? 'custom_sessions'
      : 'weekly';
  const daysSet = new Set(
    (Array.isArray(cfg.daysOfWeek) ? cfg.daysOfWeek : [])
      .map(Number)
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  );
  const customMap = new Map();
  if (Array.isArray(cfg.customSessions)) {
    for (const cs of cfg.customSessions) {
      const dt = String(cs?.date || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dt)) {
        customMap.set(dt, cs);
      }
    }
  }
  const exceptionsMap = new Map();
  if (Array.isArray(cfg.exceptions)) {
    for (const ex of cfg.exceptions) {
      const dt = String(ex?.date || '').trim();
      const exStatus = String(ex?.status || ex?.type || '').trim().toLowerCase();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dt) || !exStatus) continue;
      const newDate = String(ex?.newDate || '').trim();
      if (exStatus === 'rescheduled' && /^\d{4}-\d{2}-\d{2}$/.test(newDate) && newDate !== dt) {
        exceptionsMap.set(dt, {
          ...ex,
          status: 'postponed',
          type: 'postponed',
          movedToDate: newDate,
          note: ex?.note || `Đổi lịch sang ${newDate}`
        });
        exceptionsMap.set(newDate, {
          ...ex,
          date: newDate,
          originalDate: dt,
          status: 'rescheduled',
          type: 'rescheduled'
        });
      } else {
        exceptionsMap.set(dt, { ...ex, status: exStatus, type: exStatus });
      }
    }
  }

  const results = [];
  const seenDates = new Set();
  const baseCheckMs = Number(nowMs);
  for (let dayOffset = -1; dayOffset <= 42; dayOffset++) {
    const probeMs = baseCheckMs + dayOffset * 86400 * 1000;
    const vn = getVnDateTimeParts(probeMs);
    const dateStr = vn.dateStr;
    if (seenDates.has(dateStr)) continue;
    seenDates.add(dateStr);

    if (effectiveFrom && /^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) && dateStr < effectiveFrom) {
      continue;
    }
    if (effectiveUntil && /^\d{4}-\d{2}-\d{2}$/.test(effectiveUntil) && dateStr > effectiveUntil) {
      continue;
    }

    const ex = exceptionsMap.get(dateStr) || null;
    const customSession = customMap.get(dateStr) || null;
    const isScheduledDay =
      scheduleMode === 'custom_sessions'
        ? Boolean(customSession)
        : daysSet.has(vn.dayOfWeek);
    const isExtraRescheduledDay = Boolean(ex && ex.status === 'rescheduled');

    if (!isScheduledDay && !isExtraRescheduledDay) {
      continue;
    }

    const sessionStart = normalizeTimeHHMM(
      ex?.startTime || ex?.newStartTime || customSession?.startTime || startDefault,
      startDefault
    );
    const sessionEnd = normalizeTimeHHMM(
      ex?.endTime || ex?.newEndTime || customSession?.endTime || endDefault,
      addOneHourHHMM(sessionStart)
    );
    const startEpochMs = vnDateTimeToEpochMs(dateStr, sessionStart);
    let endEpochMs = vnDateTimeToEpochMs(dateStr, sessionEnd);
    if (!Number.isFinite(startEpochMs)) continue;
    if (Number.isFinite(endEpochMs) && endEpochMs <= startEpochMs) {
      endEpochMs += 86400 * 1000;
    }

    // Bỏ qua buổi học đã kết thúc hoàn toàn từ trước
    if (endEpochMs <= baseCheckMs) {
      continue;
    }

    const rawExStatus = String(ex?.status || ex?.type || '').toLowerCase();
    const isCancelled =
      rawExStatus === 'cancelled' ||
      rawExStatus === 'postponed' ||
      rawExStatus === 'holiday';
    const sessionStatus = isCancelled
      ? rawExStatus
      : rawExStatus === 'rescheduled'
        ? 'rescheduled'
        : 'scheduled';

    results.push({
      classCode: cfg.classCode,
      date: dateStr,
      sessionDate: dateStr,
      dayOfWeek: vn.dayOfWeek,
      dayLabel: VN_DAY_LABELS[vn.dayOfWeek] || '',
      dayShortLabel: VN_DAY_SHORT_LABELS[vn.dayOfWeek] || '',
      startTime: sessionStart,
      endTime: sessionEnd,
      timezone: 'Asia/Ho_Chi_Minh',
      startEpochMs,
      endEpochMs,
      status: sessionStatus,
      isCancelled,
      note: ex?.note || customSession?.title || '',
      meetingUrl: cfg.meetingUrl || ''
    });

    if (results.length >= limit) break;
  }

  return results;
}

async function loadAllClassScheduleConfigs(env) {
  const map = new Map();
  const res = await supabaseRequest(
    env,
    'ktn_dlp_alerts?room_id=eq.CLASS_SCHEDULE_CONFIG&order=created_at.desc&limit=200'
  );
  if (res.ok && Array.isArray(res.data)) {
    for (const row of res.data) {
      try {
        const parsed = JSON.parse(row.blocked_content || '{}');
        const cls = String(parsed?.classCode || String(row.id || '').replace(/^SCHED_CFG_/, '')).trim().toUpperCase();
        if (cls && !map.has(cls)) {
          map.set(cls, parsed);
        }
      } catch {}
    }
  }
  return map;
}

const DEFAULT_USER_NOTIFICATION_PREFS = {
  chat: true,
  homework: true,
  grades: true,
  schedule: true,
  important: true,
  reminder10Min: false,
  forumPushMode: 'immediate'
};

function sanitizeUserNotificationPrefs(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const rawForumMode = String(src.forumPushMode || 'immediate').toLowerCase();
  const forumPushMode = ['immediate', 'digest', 'off'].includes(rawForumMode) ? rawForumMode : 'immediate';
  return {
    chat: src.chat !== false,
    homework: src.homework !== false,
    grades: src.grades !== false,
    schedule: src.schedule !== false,
    // Thông báo quan trọng từ quản lý luôn được bật, không bao giờ bị tắt khi tắt tin nhắn thông thường
    important: true,
    reminder10Min: Boolean(src.reminder10Min),
    forumPushMode
  };
}

function isEventTypeAllowedByUserPrefs(eventType, rawPrefs, options = {}) {
  const prefs = sanitizeUserNotificationPrefs(rawPrefs);
  const t = String(eventType || '').toLowerCase();
  if (
    t === 'announcement_pinned' ||
    t === 'important_announcement' ||
    t === 'order_pending' ||
    t === 'course_request_pending' ||
    t === 'course_request_reviewed' ||
    t === 'direct_push' ||
    t === 'web_push'
  ) {
    return true;
  }
  if (t === 'class_created' || t === 'class_joined' || t === 'class_teacher_changed') {
    if (options.channel === 'push') {
      if (rawPrefs && (rawPrefs.classLifecycle === false || rawPrefs.classes === false || rawPrefs.pushEnabled === false)) {
        return false;
      }
      return prefs.schedule !== false;
    }
    if (rawPrefs && (rawPrefs.classLifecycle === false || rawPrefs.classes === false)) {
      return false;
    }
    return true;
  }
  if (t === 'forum_question') {
    // In-app inbox luôn hiển thị câu hỏi mới cho giáo viên; Push di động tôn trọng forumPushMode (immediate | digest | off)
    if (options.channel === 'push') {
      return prefs.forumPushMode === 'immediate';
    }
    return true;
  }
  if (t === 'forum_answer') {
    return true;
  }
  if (t.startsWith('chat_') || t === 'chat_message') {
    return prefs.chat !== false;
  }
  if (t === 'homework_graded' || t.startsWith('grade_')) {
    return prefs.grades !== false;
  }
  if (t.startsWith('homework_')) {
    return prefs.homework !== false;
  }
  if (t === 'class_reminder' || t === 'schedule_changed' || t === 'session_cancelled') {
    return prefs.schedule !== false;
  }
  return true;
}

async function getUserNotificationPreferencesMap(env, emails = []) {
  const cleanEmails = Array.from(new Set(emails.map((e) => normalizeEmail(e)).filter(Boolean)));
  const out = new Map();
  for (const em of cleanEmails) {
    out.set(em, { ...DEFAULT_USER_NOTIFICATION_PREFS });
  }
  if (cleanEmails.length === 0) return out;
  const ids = cleanEmails.map((em) => `NPREF_${em}`);
  const res = await supabaseRequest(
    env,
    `ktn_dlp_alerts?room_id=eq.NOTIF_PREFS&id=in.(${ids.map((id) => encodeURIComponent(id)).join(',')})&limit=200`
  );
  if (res.ok && Array.isArray(res.data)) {
    for (const row of res.data) {
      const em = normalizeEmail(row?.sender_email || String(row?.id || '').replace(/^NPREF_/, ''));
      if (!em) continue;
      try {
        const parsed = JSON.parse(row.blocked_content || '{}');
        out.set(em, sanitizeUserNotificationPrefs(parsed));
      } catch {}
    }
  }
  return out;
}

async function dispatchWebPushForQuery(env, queryFilter, payloadObj, meta = {}) {
  const eventId = String(meta.eventId || payloadObj?.eventId || payloadObj?.id || `EVT-${Date.now()}`).trim();
  const eventType = String(meta.eventType || payloadObj?.eventType || 'web_push').trim();
  const senderEmail = normalizeEmail(meta.senderEmail || '');
  const verifyClassCode = String(meta.classCode || payloadObj?.classCode || '').trim().toUpperCase();
  const hasExplicitRecipients = Array.isArray(meta.recipientEmails);
  const cleanRecipients = hasExplicitRecipients
    ? Array.from(
        new Set(
          meta.recipientEmails
            .map((e) => normalizeEmail(e))
            .filter((e) => e && e !== senderEmail)
        )
      )
    : [];

  if (verifyClassCode && !meta.allowArchivedClassPush) {
    const clsCheckRes = await supabaseRequest(
      env,
      `ktn_classes?id=eq.${encodeURIComponent(verifyClassCode)}&select=id,active&limit=1`
    ).catch(() => ({ ok: false, data: [] }));
    const clsRow = clsCheckRes.ok && Array.isArray(clsCheckRes.data) && clsCheckRes.data[0] ? clsCheckRes.data[0] : null;
    if (clsRow && clsRow.active === false) {
      const reason = 'CLASS_ARCHIVED_OR_INACTIVE';
      const logLine = recordPushDiagnosticLog({
        eventId,
        eventType,
        recipientCount: 0,
        subscriptionCount: 0,
        pushAccepted: 0,
        pushFailed: 0,
        reason
      });
      return {
        ok: true,
        skipped: true,
        eventId,
        eventType,
        recipientCount: 0,
        subscriptionCount: 0,
        pushAccepted: 0,
        pushFailed: 0,
        reason,
        logLine,
        pushServiceAccepted: false,
        deviceDisplayConfirmed: false,
        total: 0,
        delivered: 0,
        expiredRemoved: 0,
        results: []
      };
    }
  }

  if (!globalThis.__ktnPushEventIdCache) {
    globalThis.__ktnPushEventIdCache = new Map();
  }
  if (eventId && !meta.allowEventIdRetry && globalThis.__ktnPushEventIdCache.has(eventId)) {
    const cachedResult = globalThis.__ktnPushEventIdCache.get(eventId);
    return {
      ...cachedResult,
      idempotent: true,
      idempotentReplay: true
    };
  }

  if (eventId && !meta.allowEventIdRetry && !meta.skipDbEventDedup) {
    const dedupDbId = `PUSH_EVT_${eventId}`;
    const existingDedupRes = await supabaseRequest(
      env,
      `ktn_dlp_alerts?room_id=eq.PUSH_EVENT_DEDUP&id=eq.${encodeURIComponent(dedupDbId)}&limit=1`
    ).catch(() => ({ ok: false, data: [] }));
    if (existingDedupRes.ok && Array.isArray(existingDedupRes.data) && existingDedupRes.data[0]) {
      let parsedPrev = {};
      try {
        parsedPrev = JSON.parse(existingDedupRes.data[0].blocked_content || '{}');
      } catch {}
      const replayOut = {
        ok: true,
        eventId,
        eventType,
        recipientCount: Number(parsedPrev.recipientCount || 0),
        subscriptionCount: Number(parsedPrev.subscriptionCount || 0),
        pushAccepted: Number(parsedPrev.pushAccepted || 0),
        pushFailed: Number(parsedPrev.pushFailed || 0),
        reason: parsedPrev.reason || 'IDEMPOTENT_DB_REPLAY',
        pushServiceAccepted: Boolean(parsedPrev.pushServiceAccepted),
        deviceDisplayConfirmed: false,
        total: Number(parsedPrev.total || 0),
        delivered: Number(parsedPrev.delivered || 0),
        expiredRemoved: 0,
        results: [],
        idempotent: true,
        idempotentReplay: true
      };
      globalThis.__ktnPushEventIdCache.set(eventId, replayOut);
      return replayOut;
    }
  }

  if (!env.VAPID_PRIVATE_KEY) {
    const recipientCount = hasExplicitRecipients ? cleanRecipients.length : 0;
    const reason = 'MISSING_VAPID_PRIVATE_KEY';
    const logLine = recordPushDiagnosticLog({
      eventId,
      eventType,
      recipientCount,
      subscriptionCount: 0,
      pushAccepted: 0,
      pushFailed: 0,
      reason
    });
    return {
      ok: false,
      skipped: true,
      eventId,
      eventType,
      recipientCount,
      subscriptionCount: 0,
      pushAccepted: 0,
      pushFailed: 0,
      reason,
      logLine,
      pushServiceAccepted: false,
      deviceDisplayConfirmed: false,
      total: 0,
      delivered: 0,
      expiredRemoved: 0,
      results: []
    };
  }

  if (hasExplicitRecipients && cleanRecipients.length === 0) {
    const reason = 'NO_ELIGIBLE_RECIPIENTS';
    const logLine = recordPushDiagnosticLog({
      eventId,
      eventType,
      recipientCount: 0,
      subscriptionCount: 0,
      pushAccepted: 0,
      pushFailed: 0,
      reason
    });
    return {
      ok: true,
      eventId,
      eventType,
      recipientCount: 0,
      subscriptionCount: 0,
      pushAccepted: 0,
      pushFailed: 0,
      reason,
      logLine,
      pushServiceAccepted: false,
      deviceDisplayConfirmed: false,
      total: 0,
      delivered: 0,
      expiredRemoved: 0,
      results: []
    };
  }

  try {
    const effectiveFilter = hasExplicitRecipients
      ? `user_email=in.(${cleanRecipients.map((e) => encodeURIComponent(e)).join(',')})`
      : String(queryFilter || '');
    const subsRes = await supabaseRequest(env, `ktn_push_subscriptions?${effectiveFilter}&limit=100`);
    const rawRows = Array.isArray(subsRes.data) ? subsRes.data : [];
    const recipientSet = hasExplicitRecipients ? new Set(cleanRecipients) : null;

    const candidateEmails = Array.from(
      new Set([
        ...cleanRecipients,
        ...rawRows.map((r) => normalizeEmail(r?.user_email || '')).filter(Boolean)
      ])
    );
    const userPrefsMap = await getUserNotificationPreferencesMap(env, candidateEmails);

    const seenEndpoints = new Set();
    const matchedRows = [];
    let expiredRemoved = 0;
    let mutedByPreferenceCount = 0;

    for (const row of rawRows) {
      const rowEmail = normalizeEmail(row?.user_email || '');
      if (senderEmail && rowEmail === senderEmail) continue;
      if (recipientSet && !recipientSet.has(rowEmail)) continue;
      const mergedPrefs = userPrefsMap.get(rowEmail) || row?.notify_settings || DEFAULT_USER_NOTIFICATION_PREFS;
      if (!isEventTypeAllowedByUserPrefs(eventType, mergedPrefs, { channel: 'push' })) {
        mutedByPreferenceCount += 1;
        continue;
      }
      const ep = String(row?.endpoint || '').trim();
      const p256dh = String(row?.p256dh || row?.keys?.p256dh || '').trim();
      const auth = String(row?.auth || row?.keys?.auth || '').trim();
      if (!ep) continue;
      if (
        ep.includes('push.khongtunhi.com/v2/') ||
        p256dh === 'ktn-mobile-web-p256dh' ||
        auth === 'ktn-mobile-web-auth'
      ) {
        await supabaseRequest(env, `ktn_push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`, {
          method: 'DELETE'
        }).catch(() => null);
        expiredRemoved += 1;
        continue;
      }
      if (seenEndpoints.has(ep)) continue;
      seenEndpoints.add(ep);
      matchedRows.push(row);

      if (verifyClassCode && row?.user_role === 'student' && String(row?.class_code || '').trim().toUpperCase() !== verifyClassCode) {
        supabaseRequest(env, `ktn_push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: { class_code: verifyClassCode, updated_at: new Date().toISOString() }
        }).catch(() => null);
      }
    }

    const recipientCount = hasExplicitRecipients
      ? cleanRecipients.length
      : new Set(matchedRows.map((r) => normalizeEmail(r?.user_email || '')).filter(Boolean)).size || 1;
    const subscriptionCount = matchedRows.length;

    if (subscriptionCount === 0) {
      const reason =
        mutedByPreferenceCount > 0
          ? 'MUTED_BY_USER_PREFERENCES'
          : expiredRemoved > 0
            ? 'CORRUPT_SUBSCRIPTION_REMOVED_NO_VALID_SUB'
            : 'NO_ACTIVE_PUSH_SUBSCRIPTION';
      const logLine = recordPushDiagnosticLog({
        eventId,
        eventType,
        recipientCount,
        subscriptionCount: 0,
        pushAccepted: 0,
        pushFailed: 0,
        reason
      });
      const zeroOut = {
        ok: true,
        eventId,
        eventType,
        recipientCount,
        subscriptionCount: 0,
        pushAccepted: 0,
        pushFailed: 0,
        mutedByPreferenceCount,
        reason,
        logLine,
        pushServiceAccepted: false,
        deviceDisplayConfirmed: false,
        total: 0,
        delivered: 0,
        expiredRemoved,
        results: []
      };
      if (eventId) {
        globalThis.__ktnPushEventIdCache.set(eventId, zeroOut);
        if (!meta.allowEventIdRetry && !meta.skipDbEventDedup) {
          await supabaseRequest(env, 'ktn_dlp_alerts', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates,return=minimal',
            body: {
              id: `PUSH_EVT_${eventId}`,
              room_id: 'PUSH_EVENT_DEDUP',
              sender_email: senderEmail || 'system@khongtunhi.com',
              sender_name: eventType,
              blocked_content: JSON.stringify({
                eventId,
                eventType,
                recipientCount,
                subscriptionCount: 0,
                pushAccepted: 0,
                pushFailed: 0,
                reason,
                pushServiceAccepted: false,
                total: 0,
                delivered: 0,
                createdAt: new Date().toISOString()
              }),
              created_at: new Date().toISOString()
            }
          }).catch(() => null);
        }
      }
      return zeroOut;
    }

    const enrichedPayload = {
      ...payloadObj,
      id: eventId,
      eventId,
      eventType,
      timestamp: Date.now()
    };

    const results = await Promise.all(
      matchedRows.map((row) => sendWebPushToSubscription(env, row, enrichedPayload))
    );

    let pushAccepted = 0;
    let pushFailed = 0;
    const failReasons = [];
    for (const r of results) {
      if (r.ok) {
        pushAccepted += 1;
      } else {
        pushFailed += 1;
        if (r.reason) failReasons.push(r.reason);
      }
      if (r.expired) {
        expiredRemoved += 1;
      }
    }

    const uniqueFailReasons = Array.from(new Set(failReasons));
    let reason = 'PUSH_SERVICE_ACCEPTED';
    if (pushAccepted > 0 && pushFailed > 0) {
      reason = `PARTIAL_ACCEPTED(${ uniqueFailReasons.join(',') })`;
    } else if (pushAccepted === 0) {
      reason = uniqueFailReasons.join(',') || 'ALL_PUSH_REQUESTS_FAILED';
    }

    const logLine = recordPushDiagnosticLog({
      eventId,
      eventType,
      recipientCount,
      subscriptionCount,
      pushAccepted,
      pushFailed,
      reason
    });

    const finalResult = {
      ok: true,
      eventId,
      eventType,
      recipientCount,
      subscriptionCount,
      pushAccepted,
      pushFailed,
      mutedByPreferenceCount,
      reason,
      logLine,
      pushServiceAccepted: pushAccepted > 0,
      deviceDisplayConfirmed: false,
      total: subscriptionCount,
      delivered: pushAccepted,
      expiredRemoved,
      results
    };
    if (eventId) {
      globalThis.__ktnPushEventIdCache.set(eventId, finalResult);
      if (globalThis.__ktnPushEventIdCache.size > 500) {
        const oldestKey = globalThis.__ktnPushEventIdCache.keys().next().value;
        if (oldestKey) globalThis.__ktnPushEventIdCache.delete(oldestKey);
      }
      if (!meta.allowEventIdRetry && !meta.skipDbEventDedup) {
        await supabaseRequest(env, 'ktn_dlp_alerts', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=minimal',
          body: {
            id: `PUSH_EVT_${eventId}`,
            room_id: 'PUSH_EVENT_DEDUP',
            sender_email: senderEmail || 'system@khongtunhi.com',
            sender_name: eventType,
            blocked_content: JSON.stringify({
              eventId,
              eventType,
              recipientCount,
              subscriptionCount,
              pushAccepted,
              pushFailed,
              reason,
              pushServiceAccepted: pushAccepted > 0,
              total: subscriptionCount,
              delivered: pushAccepted,
              createdAt: new Date().toISOString()
            }),
            created_at: new Date().toISOString()
          }
        }).catch(() => null);
      }
    }
    return finalResult;
  } catch (err) {
    const recipientCount = hasExplicitRecipients ? cleanRecipients.length : 0;
    const reason = `DISPATCH_EXCEPTION:${err?.name || 'Error'}`;
    const logLine = recordPushDiagnosticLog({
      eventId,
      eventType,
      recipientCount,
      subscriptionCount: 0,
      pushAccepted: 0,
      pushFailed: 1,
      reason
    });
    return {
      ok: false,
      eventId,
      eventType,
      recipientCount,
      subscriptionCount: 0,
      pushAccepted: 0,
      pushFailed: 1,
      reason,
      logLine,
      pushServiceAccepted: false,
      deviceDisplayConfirmed: false,
      total: 0,
      delivered: 0,
      expiredRemoved: 0,
      error: reason
    };
  }
}

async function emitTargetedLifecycleNotification(env, options = {}) {
  const recipientEmail = normalizeEmail(options.recipientEmail || '');
  const senderEmail = normalizeEmail(options.senderEmail || 'admin@khongtunhi.com');
  const eventType = String(options.type || options.eventType || 'system').trim();
  const classCode = String(options.classCode || '').trim().toUpperCase();
  const roomId = String(options.roomId || (classCode ? `class:${classCode}` : '')).trim();
  const title = String(options.title || 'Thông báo từ Khổng Tử Nhí').trim();
  const body = String(options.body || '').trim();
  const actionUrl = String(options.actionUrl || options.url || '/custom-page/so-lien-lac-test#/dashboard').trim();
  const actionLabel = String(options.actionLabel || 'Mở lớp học').trim();
  const nowIso = new Date().toISOString();

  if (!recipientEmail) {
    return {
      ok: false,
      skipped: true,
      reason: 'MISSING_RECIPIENT_EMAIL',
      inAppCreated: false,
      pushResult: null
    };
  }

  const rawEventId = String(
    options.eventId ||
      `LIFECYCLE_${eventType.toUpperCase()}_${classCode || 'GEN'}_${recipientEmail}_${Date.now()}`
  ).trim();

  // Kiểm tra chống trùng bền vững trên DB (ktn_dlp_alerts với room_id = KTN_LIFECYCLE_NOTIFICATION)
  const existingCheck = await supabaseRequest(
    env,
    `ktn_dlp_alerts?room_id=eq.KTN_LIFECYCLE_NOTIFICATION&id=eq.${encodeURIComponent(rawEventId)}&limit=1`
  ).catch(() => ({ ok: false, data: [] }));

  if (existingCheck.ok && Array.isArray(existingCheck.data) && existingCheck.data[0]) {
    let prevPayload = {};
    try {
      prevPayload = JSON.parse(existingCheck.data[0].blocked_content || '{}');
    } catch {}
    return {
      ok: true,
      idempotent: true,
      idempotentReplay: true,
      eventId: rawEventId,
      eventType,
      recipientEmail,
      classCode,
      inAppCreated: true,
      notification: prevPayload,
      pushResult: {
        ok: true,
        idempotent: true,
        idempotentReplay: true,
        eventId: rawEventId,
        eventType,
        recipientCount: 1,
        subscriptionCount: 0,
        pushAccepted: 0,
        pushFailed: 0,
        reason: 'IDEMPOTENT_NOTIFICATION_REPLAY'
      }
    };
  }

  const notifRecord = {
    id: rawEventId,
    eventId: rawEventId,
    type: eventType,
    eventType,
    recipientEmail,
    target_email: recipientEmail,
    senderEmail,
    classCode,
    roomId,
    title,
    body,
    actionUrl,
    url: actionUrl,
    actionLabel,
    meta: options.meta && typeof options.meta === 'object' ? options.meta : {},
    createdAt: nowIso
  };

  // Lưu bền vững vào ktn_dlp_alerts (luôn tồn tại trên mọi môi trường Supabase & Mock DB)
  const dlpInsertRes = await supabaseRequest(env, 'ktn_dlp_alerts', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      id: rawEventId,
      room_id: 'KTN_LIFECYCLE_NOTIFICATION',
      sender_email: recipientEmail,
      sender_name: classCode || eventType,
      reason: eventType,
      blocked_content: JSON.stringify(notifRecord),
      created_at: nowIso
    }
  }).catch(() => ({ ok: false }));

  // Đồng thời lưu vào ktn_notifications nếu bảng hỗ trợ
  const fullNotifInsert = await supabaseRequest(env, 'ktn_notifications', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: {
      id: rawEventId,
      event_id: rawEventId,
      recipient_email: recipientEmail,
      user_email: recipientEmail,
      target_email: recipientEmail,
      sender_email: senderEmail,
      type: eventType,
      class_code: classCode || null,
      room_id: roomId || null,
      title,
      body,
      action_url: actionUrl,
      action_label: actionLabel,
      read: false,
      metadata: notifRecord.meta,
      created_at: nowIso
    }
  }).catch(() => ({ ok: false }));
  if (!fullNotifInsert || !fullNotifInsert.ok) {
    await supabaseRequest(env, 'ktn_notifications', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: {
        id: rawEventId,
        user_email: recipientEmail,
        target_email: recipientEmail,
        type: eventType,
        class_code: classCode || null,
        title,
        body,
        action_url: actionUrl,
        action_label: actionLabel,
        read: false,
        created_at: nowIso
      }
    }).catch(() => null);
  }

  let pushResult = null;
  if (options.sendPush !== false) {
    pushResult = await dispatchWebPushForQuery(
      env,
      `user_email=eq.${encodeURIComponent(recipientEmail)}`,
      {
        id: rawEventId,
        eventId: rawEventId,
        eventType,
        title,
        body,
        tag: `ktn-${eventType}-${classCode || 'general'}-${rawEventId}`,
        url: actionUrl,
        classCode,
        roomId
      },
      {
        eventId: rawEventId,
        eventType,
        classCode,
        senderEmail: options.allowSelfPush ? '' : senderEmail,
        recipientEmails: [recipientEmail],
        allowArchivedClassPush: Boolean(options.allowArchivedClassPush)
      }
    );
  }

  return {
    ok: true,
    idempotent: false,
    eventId: rawEventId,
    eventType,
    recipientEmail,
    classCode,
    inAppCreated: Boolean(dlpInsertRes.ok),
    notification: notifRecord,
    pushResult
  };
}

async function insertTargetedForumNotification(env, options = {}) {
  return emitTargetedLifecycleNotification(env, options);
}

async function saveClassScheduleConfig(env, session, rawClassCode, rawInput = {}) {
  const classCode = String(rawClassCode || rawInput?.classCode || '').trim().toUpperCase();
  if (!classCode) {
    return { ok: false, status: 400, message: 'Vui lòng chọn mã lớp học hợp lệ.' };
  }
  const existingMap = await loadAllClassScheduleConfigs(env);
  const prevCfg = existingMap.get(classCode) || {};

  const requestedMode = rawInput.scheduleMode || rawInput.mode;
  const prevMode = prevCfg.scheduleMode || prevCfg.mode;
  const scheduleMode =
    requestedMode === 'custom_sessions'
      ? 'custom_sessions'
      : prevMode === 'custom_sessions' && !requestedMode
        ? 'custom_sessions'
        : 'weekly';

  const rawDays = Array.isArray(rawInput.daysOfWeek)
    ? rawInput.daysOfWeek
    : Array.isArray(rawInput.day_of_week)
      ? rawInput.day_of_week
      : Array.isArray(prevCfg.daysOfWeek)
        ? prevCfg.daysOfWeek
        : [];
  const daysOfWeek = Array.from(
    new Set(rawDays.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))
  ).sort((a, b) => (VN_WEEKDAY_SORT_ORDER[a] || 9) - (VN_WEEKDAY_SORT_ORDER[b] || 9));

  const startTime = normalizeTimeHHMM(
    rawInput.startTime ?? rawInput.start_time ?? prevCfg.startTime ?? '',
    ''
  );
  const endTime = normalizeTimeHHMM(
    rawInput.endTime ?? rawInput.end_time ?? prevCfg.endTime ?? '',
    startTime ? addOneHourHHMM(startTime) : ''
  );
  const timezone = 'Asia/Ho_Chi_Minh';
  const todayVn = getVnDateTimeParts(Date.now()).dateStr;
  const effectiveFrom = String(
    rawInput.effectiveFrom ?? rawInput.effective_from ?? prevCfg.effectiveFrom ?? todayVn
  ).trim();
  const rawUntil = rawInput.effectiveUntil ?? rawInput.effective_until ?? prevCfg.effectiveUntil ?? null;
  const effectiveUntil = rawUntil && /^\d{4}-\d{2}-\d{2}$/.test(String(rawUntil).trim())
    ? String(rawUntil).trim()
    : null;

  const customSessions = Array.isArray(rawInput.customSessions)
    ? rawInput.customSessions
        .map((cs) => ({
          date: String(cs?.date || '').trim(),
          startTime: normalizeTimeHHMM(cs?.startTime || startTime || '19:30', '19:30'),
          endTime: normalizeTimeHHMM(cs?.endTime || endTime || '20:30', '20:30'),
          title: String(cs?.title || '').trim()
        }))
        .filter((cs) => /^\d{4}-\d{2}-\d{2}$/.test(cs.date))
    : Array.isArray(prevCfg.customSessions)
      ? prevCfg.customSessions
      : [];

  const rawExceptions = Array.isArray(rawInput.exceptions)
    ? rawInput.exceptions
    : Array.isArray(prevCfg.exceptions)
      ? prevCfg.exceptions
      : [];
  const nowIso = new Date().toISOString();
  const exceptions = rawExceptions
    .map((ex) => {
      const dt = String(ex?.date || '').trim();
      const st = String(ex?.status || ex?.type || '').trim().toLowerCase();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dt)) return null;
      if (!['rescheduled', 'postponed', 'cancelled', 'holiday'].includes(st)) return null;
      const newDateRaw = String(ex?.newDate || '').trim();
      const newDate = st === 'rescheduled' && /^\d{4}-\d{2}-\d{2}$/.test(newDateRaw) ? newDateRaw : undefined;
      const startOverride = ex?.startTime || ex?.newStartTime;
      const endOverride = ex?.endTime || ex?.newEndTime;
      return {
        date: dt,
        status: st,
        type: st,
        ...(newDate ? { newDate } : {}),
        startTime: startOverride ? normalizeTimeHHMM(startOverride, startTime || '19:30') : undefined,
        endTime: endOverride ? normalizeTimeHHMM(endOverride, endTime || '20:30') : undefined,
        note: String(ex?.note || '').trim(),
        updatedBy: ex?.updatedBy || session.email,
        updatedAt: ex?.updatedAt || nowIso
      };
    })
    .filter(Boolean);

  const rawMeetingUrl = String(rawInput.meetingUrl ?? rawInput.meeting_url ?? prevCfg.meetingUrl ?? '').trim();
  const meetingUrl = /^https:\/\//i.test(rawMeetingUrl) ? rawMeetingUrl : '';

  const requestedStatus = String(rawInput.status || 'confirmed').trim().toLowerCase();
  const hasValidRule =
    scheduleMode === 'custom_sessions'
      ? customSessions.length > 0
      : daysOfWeek.length > 0 && Boolean(startTime);
  if (requestedStatus === 'confirmed' && !hasValidRule) {
    return {
      ok: false,
      status: 400,
      message: 'Vui lòng chọn ít nhất một thứ trong tuần và giờ bắt đầu hợp lệ để xác nhận lịch học chính thức.'
    };
  }
  const finalStatus =
    requestedStatus === 'paused' || requestedStatus === 'unconfirmed'
      ? requestedStatus
      : hasValidRule
        ? 'confirmed'
        : 'unconfirmed';

  const prevHistory = Array.isArray(prevCfg.history) ? prevCfg.history : [];
  const summaryText = formatOfficialScheduleDisplay({
    classCode,
    daysOfWeek,
    startTime,
    endTime,
    scheduleMode,
    customSessions,
    status: finalStatus
  });
  const nextHistory = [
    {
      updatedBy: session.email,
      updatedByName: session.name || session.email,
      updatedByRole: session.role,
      updatedAt: nowIso,
      summary: summaryText,
      exceptionCount: exceptions.length
    },
    ...prevHistory
  ].slice(0, 15);

  const nextConfig = {
    classCode,
    daysOfWeek,
    day_of_week: daysOfWeek,
    startTime,
    start_time: startTime,
    endTime,
    end_time: endTime,
    timezone,
    effectiveFrom,
    effective_from: effectiveFrom,
    effectiveUntil,
    effective_until: effectiveUntil,
    scheduleMode,
    mode: scheduleMode,
    customSessions,
    exceptions,
    meetingUrl,
    status: finalStatus,
    updatedBy: session.email,
    updated_by: session.email,
    updatedByName: session.name || session.email,
    updatedByRole: session.role,
    updatedAt: nowIso,
    updated_at: nowIso,
    history: nextHistory
  };

  const cfgId = `SCHED_CFG_${classCode}`;
  let saveRes = await supabaseRequest(env, 'ktn_dlp_alerts?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      id: cfgId,
      room_id: 'CLASS_SCHEDULE_CONFIG',
      sender_email: session.email,
      sender_name: session.name || session.email,
      sender_role: session.role,
      blocked_content: JSON.stringify(nextConfig),
      reason: 'OFFICIAL_CLASS_SCHEDULE',
      resolved: true,
      created_at: nowIso
    }
  });
  if (!saveRes || !saveRes.ok) {
    saveRes = await supabaseRequest(env, `ktn_dlp_alerts?id=eq.${encodeURIComponent(cfgId)}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: {
        sender_email: session.email,
        sender_name: session.name || session.email,
        sender_role: session.role,
        blocked_content: JSON.stringify(nextConfig),
        created_at: nowIso
      }
    });
  }
  if (!saveRes || !saveRes.ok) {
    return {
      ok: false,
      status: 502,
      message: 'Không thể lưu cấu hình lịch học chính thức vào cơ sở dữ liệu Supabase.'
    };
  }

  // Cập nhật chuỗi hiển thị vào bảng ktn_classes khi đã xác nhận lịch chính thức
  await supabaseRequest(env, `ktn_classes?id=eq.${encodeURIComponent(classCode)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: {
      schedule: finalStatus === 'confirmed' ? summaryText : '',
      updated_at: nowIso
    }
  }).catch(() => null);

  return {
    ok: true,
    status: 200,
    scheduleConfig: nextConfig,
    officialScheduleText: summaryText,
    upcomingSessions: computeUpcomingClassSessions(nextConfig, Date.now(), 6)
  };
}

async function runClassScheduleReminders(env, options = {}) {
  const nowMs = options.nowMs && Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const filterClassCode = String(options.classCode || '').trim().toUpperCase();
  const vnNow = getVnDateTimeParts(nowMs);

  const [clsRes, scheduleMap] = await Promise.all([
    supabaseRequest(
      env,
      filterClassCode
        ? `ktn_classes?id=eq.${encodeURIComponent(filterClassCode)}&active=eq.true`
        : 'ktn_classes?active=eq.true&order=id.asc'
    ),
    loadAllClassScheduleConfigs(env)
  ]);

  const activeClasses = Array.isArray(clsRes.data) ? clsRes.data : [];
  const dispatchedReminders = [];
  const skippedSessions = [];

  if (!globalThis.__ktnReminderSentKeys) {
    globalThis.__ktnReminderSentKeys = new Set();
  }

  for (const clsRow of activeClasses) {
    const classCode = String(clsRow?.id || '').trim().toUpperCase();
    if (!classCode) continue;
    if (filterClassCode && classCode !== filterClassCode) continue;

    const cfg = scheduleMap.get(classCode);
    // Tuyệt đối chỉ phát nhắc giờ cho lớp đã xác nhận lịch chính thức (status === 'confirmed')
    if (!cfg || cfg.status !== 'confirmed') {
      skippedSessions.push({
        classCode,
        reason: 'UNCONFIRMED_OR_NO_OFFICIAL_SCHEDULE'
      });
      continue;
    }

    const upcoming = computeUpcomingClassSessions(cfg, nowMs, 3);
    for (const sess of upcoming) {
      if (sess.isCancelled) {
        skippedSessions.push({
          classCode,
          sessionDate: sess.date,
          status: sess.status,
          reason: `SESSION_${String(sess.status).toUpperCase()}_SKIPPED`
        });
        continue;
      }

      const minutesUntilStart = (sess.startEpochMs - nowMs) / 60000;
      // Không gửi thông báo cũ khi buổi học đã bắt đầu hoặc đã qua (minutesUntilStart <= 0)
      if (minutesUntilStart <= 0) {
        skippedSessions.push({
          classCode,
          sessionDate: sess.date,
          minutesUntilStart: Math.round(minutesUntilStart),
          reason: 'SESSION_ALREADY_STARTED_OR_PAST'
        });
        continue;
      }

      let reminderOffset = null;
      if (minutesUntilStart >= 15 && minutesUntilStart <= 35) {
        reminderOffset = 30;
      } else if (minutesUntilStart >= 2 && minutesUntilStart < 15) {
        reminderOffset = 10;
      } else {
        continue;
      }

      // Nếu lịch mới vừa được tạo/cập nhật sau thời điểm cửa sổ nhắc (ví dụ vừa cài lịch cho buổi sát giờ hoặc đã qua), kiểm tra an toàn
      const clsResolved = await resolveClassRecipientEmails(env, classCode, {
        includeTeacher: true,
        excludeEmail: ''
      });
      const currentRecipients = clsResolved.recipientEmails;
      if (currentRecipients.length === 0) {
        skippedSessions.push({
          classCode,
          sessionDate: sess.date,
          reminderOffset,
          reason: 'NO_ACTIVE_CLASS_MEMBERS'
        });
        continue;
      }

      const prefsMap = await getUserNotificationPreferencesMap(env, currentRecipients);
      const offsetEligibleRecipients = currentRecipients.filter((em) => {
        const p = prefsMap.get(em) || DEFAULT_USER_NOTIFICATION_PREFS;
        if (p.schedule === false) return false;
        if (reminderOffset === 10 && !p.reminder10Min) return false;
        return true;
      });

      if (offsetEligibleRecipients.length === 0) {
        skippedSessions.push({
          classCode,
          sessionDate: sess.date,
          reminderOffset,
          reason: reminderOffset === 10 ? 'NO_RECIPIENT_OPTED_IN_10MIN' : 'ALL_RECIPIENTS_MUTED_SCHEDULE'
        });
        continue;
      }

      const candidateKeys = offsetEligibleRecipients.map(
        (em) => `REMIND_${classCode}_${sess.date}_${reminderOffset}_${em}`
      );
      const existingLogRes = await supabaseRequest(
        env,
        `ktn_dlp_alerts?room_id=eq.CLASS_REMINDER_LOG&id=in.(${candidateKeys.map((k) => encodeURIComponent(k)).join(',')})&select=id&limit=500`
      );
      const alreadySentIds = new Set(
        (Array.isArray(existingLogRes.data) ? existingLogRes.data : []).map((r) => String(r?.id || '').trim())
      );

      const newRecipients = [];
      const skippedDuplicateRecipients = [];
      for (const em of offsetEligibleRecipients) {
        const key = `REMIND_${classCode}_${sess.date}_${reminderOffset}_${em}`;
        if (alreadySentIds.has(key) || globalThis.__ktnReminderSentKeys.has(key)) {
          skippedDuplicateRecipients.push(em);
        } else {
          newRecipients.push(em);
        }
      }

      if (newRecipients.length === 0) {
        skippedSessions.push({
          classCode,
          sessionDate: sess.date,
          reminderOffset,
          skippedDuplicateCount: skippedDuplicateRecipients.length,
          reason: 'ALREADY_SENT_IDEMPOTENT_SKIP'
        });
        continue;
      }

      const validMeetingUrl = /^https:\/\//i.test(String(cfg.meetingUrl || '').trim())
        ? String(cfg.meetingUrl).trim()
        : '';
      const actionUrl = validMeetingUrl || `/custom-page/so-lien-lac-test#/classrooms?class=${encodeURIComponent(classCode)}`;
      const title = 'Sắp đến giờ học tiếng Trung!';
      const body = `Lớp ${classCode} bắt đầu lúc ${sess.startTime}. Chuẩn bị vào lớp nhé!`;
      const createdAtIso = new Date(nowMs).toISOString();

      const logRows = newRecipients.map((em) => {
        const key = `REMIND_${classCode}_${sess.date}_${reminderOffset}_${em}`;
        return {
          id: key,
          room_id: 'CLASS_REMINDER_LOG',
          sender_email: em,
          sender_name: classCode,
          sender_role: 'system',
          blocked_content: JSON.stringify({
            id: key,
            type: 'class_reminder',
            classCode,
            sessionDate: sess.date,
            startTime: sess.startTime,
            endTime: sess.endTime,
            reminderOffset,
            recipientEmail: em,
            title,
            body,
            actionLabel: 'Xem buổi học',
            actionUrl,
            meetingUrl: validMeetingUrl || null,
            createdAt: createdAtIso
          }),
          reason: 'CLASS_SCHEDULE_REMINDER',
          resolved: true,
          created_at: createdAtIso
        };
      });

      const writeLogRes = await supabaseRequest(env, 'ktn_dlp_alerts?on_conflict=id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: logRows
      });
      if (!writeLogRes || !writeLogRes.ok) {
        skippedSessions.push({
          classCode,
          sessionDate: sess.date,
          reminderOffset,
          reason: 'REMINDER_LOG_PERSIST_FAILED'
        });
        continue;
      }

      for (const em of newRecipients) {
        globalThis.__ktnReminderSentKeys.add(`REMIND_${classCode}_${sess.date}_${reminderOffset}_${em}`);
      }

      const eventId = `REMIND-${classCode}-${sess.date}-${reminderOffset}`;
      const pushResult = await dispatchWebPushForQuery(
        env,
        '',
        {
          id: eventId,
          eventId,
          eventType: 'class_reminder',
          title,
          body,
          actionLabel: 'Xem buổi học',
          action_url: actionUrl
        },
        {
          eventId,
          eventType: 'class_reminder',
          recipientEmails: newRecipients,
          senderEmail: '',
          classCode,
          allowEventIdRetry: true
        }
      );

      dispatchedReminders.push({
        classCode,
        sessionDate: sess.date,
        startTime: sess.startTime,
        endTime: sess.endTime,
        reminderOffset,
        minutesUntilStart: Math.round(minutesUntilStart),
        recipientEmails: newRecipients,
        skippedDuplicateCount: skippedDuplicateRecipients.length,
        actionUrl,
        hasMeetingUrl: Boolean(validMeetingUrl),
        pushResult
      });
    }
  }

  const totalRecipientsReminded = dispatchedReminders.reduce(
    (acc, r) => acc + (Array.isArray(r.recipientEmails) ? r.recipientEmails.length : 0),
    0
  );
  const totalSkippedDuplicates =
    dispatchedReminders.reduce((acc, r) => acc + (Number(r.skippedDuplicateCount) || 0), 0) +
    skippedSessions.reduce((acc, s) => acc + (Number(s.skippedDuplicateCount) || 0), 0);

  return {
    ok: true,
    evaluatedAt: new Date(nowMs).toISOString(),
    vnDate: vnNow.dateStr,
    vnTime: vnNow.timeStr,
    timezone: 'Asia/Ho_Chi_Minh',
    remindedSessionsCount: dispatchedReminders.length,
    dispatchedCount: totalRecipientsReminded,
    skippedDuplicatesCount: totalSkippedDuplicates,
    dispatchedReminders,
    skippedSessions
  };
}

const MANIFEST_JSON = JSON.stringify({
  name: 'Sổ Liên Lạc Điện Tử — Học Viện Khổng Tử Nhí',
  short_name: 'Khổng Tử Nhí',
  description: 'Sổ liên lạc điện tử & Cổng học tập trực tuyến Học Viện Khổng Tử Nhí',
  start_url: '/custom-page/so-lien-lac-test',
  scope: '/',
  display: 'standalone',
  background_color: '#F8FAFC',
  theme_color: '#B91C1C',
  icons: [
    { src: CDN_LOGO, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: CDN_LOGO, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
  ]
}, null, 2);

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
      ...extraHeaders
    }
  });
}

function normalizeEmail(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  const aliasMap = {
    'hoangngan': 'hoangngan@khongtunhi.com',
    'dachanh': 'dachanh@khongtunhi.com',
    'anman': 'anman@khongtunhi.com',
    'minhkhang': 'minhkhang@khongtunhi.com',
    'baochau': 'baochau@khongtunhi.com',
    'giabao': 'giabao@khongtunhi.com',
    'linhlm': 'linh.lam@khongtunhi.com',
    'colinh': 'linh.lam@khongtunhi.com',
    'mylinh': 'linh.lam@khongtunhi.com',
    'giaovien': 'linh.lam@khongtunhi.com',
    'gv': 'linh.lam@khongtunhi.com',
    'teacher': 'linh.lam@khongtunhi.com',
    'ktn-gv-01': 'linh.lam@khongtunhi.com',
    'hatt': 'thu.ha@khongtunhi.com',
    'coha': 'thu.ha@khongtunhi.com',
    'ktn-gv-02': 'thu.ha@khongtunhi.com',
    'admin': 'hocvienkhongtunhi123@gmail.com',
    'quanly': 'quanly@khongtunhi.com',
    'khongtunhi': 'khongtunhi@gmail.com',
    'taphong': 'taphong2002@gmail.com',
    'taphong2002': 'taphong2002@gmail.com',
    'taphong2002vip': 'taphong2002vip@gmail.com'
  };
  if (aliasMap[s]) return aliasMap[s];
  return s.includes('@') ? s : `${s}@khongtunhi.com`;
}

function getRoleTargetPage(role) {
  if (role === 'admin') return '/sll-admin.html';
  if (role === 'teacher') return '/sll-teacher.html';
  return '/sll-hocsinh.html';
}

// ============================================================================
// KÝ & KIỂM TRA THẺ PHIÊN LÀM VIỆC (HMAC-SHA256 SIGNED TOKEN — 365 NGÀY)
// ============================================================================
async function getHmacKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret || 'ktn-default-change-me-in-production-env'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function toBase64Url(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(b64u) {
  const padding = '='.repeat((4 - (b64u.length % 4)) % 4);
  const b64 = (b64u + padding).replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(b64)));
}

async function signSessionToken(payload, secret) {
  const jti = payload.jti || ('sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10));
  const data = {
    ...payload,
    jti,
    accessToken: undefined,
    izteachAccessToken: undefined,
    iat: Date.now(),
    exp: Date.now() + 30 * 86400 * 1000
  };
  const bodyB64 = toBase64Url(JSON.stringify(data));
  const key = await getHmacKey(secret);
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(bodyB64));
  const sigBytes = Array.from(new Uint8Array(sigBuf), b => String.fromCharCode(b)).join('');
  const sigB64 = btoa(sigBytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${bodyB64}.${sigB64}`;
}

async function verifySessionToken(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [bodyB64, sigB64] = parts;
  if (!bodyB64 || !sigB64) return null;
  try {
    const key = await getHmacKey(secret);
    const padding = '='.repeat((4 - (sigB64.length % 4)) % 4);
    const rawSig = atob((sigB64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
    const sigArr = new Uint8Array(rawSig.length);
    for (let i = 0; i < rawSig.length; i++) sigArr[i] = rawSig.charCodeAt(i);
    const valid = await crypto.subtle.verify('HMAC', key, sigArr, new TextEncoder().encode(bodyB64));
    if (!valid) return null;
    const payload = JSON.parse(fromBase64Url(bodyB64));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

const revokedTokenMemorySet = new Set();

function getTokenRevocationKey(rawToken, jti) {
  if (jti && typeof jti === 'string') return jti;
  const s = String(rawToken || '').trim();
  return s ? ('tok_' + s.slice(-36)) : '';
}

async function isTokenRevoked(env, rawToken, jti) {
  const key1 = jti ? String(jti).trim() : '';
  const key2 = getTokenRevocationKey(rawToken, null);
  if ((key1 && revokedTokenMemorySet.has(key1)) || (key2 && revokedTokenMemorySet.has(key2))) {
    return true;
  }
  const lookupIds = [key1 ? `REVOKED_${key1}` : '', key2 ? `REVOKED_${key2}` : ''].filter(Boolean);
  if (lookupIds.length === 0) return false;
  try {
    const inParam = lookupIds.map(id => encodeURIComponent(id)).join(',');
    const res = await supabaseRequest(
      env,
      `ktn_dlp_alerts?id=in.(${inParam})&room_id=eq.AUTH_REVOKED&select=id,blocked_content&limit=5`
    );
    if (!res || !res.ok) {
      // Fail-closed: nếu kho thu hồi phiên không phản hồi hợp lệ, từ chối token để không lọt phiên đã đăng xuất
      return true;
    }
    if (Array.isArray(res.data) && res.data.length > 0) {
      const now = Date.now();
      for (const row of res.data) {
        const exp = Number(row?.blocked_content || 0);
        if (!exp || exp > now) {
          const rawKey = String(row.id || '').replace(/^REVOKED_/, '');
          if (rawKey) revokedTokenMemorySet.add(rawKey);
        }
      }
    }
  } catch {
    return true;
  }
  return Boolean((key1 && revokedTokenMemorySet.has(key1)) || (key2 && revokedTokenMemorySet.has(key2)));
}

async function revokeSessionTokenServerSide(env, rawToken, jti) {
  const cleanRaw = String(rawToken || '').trim();
  if (cleanRaw) {
    verifiedIzTeachTokenCache.delete(cleanRaw);
  }
  const key1 = jti ? String(jti).trim() : '';
  const key2 = getTokenRevocationKey(cleanRaw, null);
  if (key1) revokedTokenMemorySet.add(key1);
  if (key2) revokedTokenMemorySet.add(key2);
  const keys = Array.from(new Set([key1, key2].filter(Boolean)));
  if (keys.length === 0) return { ok: true, persisted: true };
  try {
    const now = Date.now();
    const exp = String(now + 30 * 86400 * 1000);
    const rows = keys.map(k => ({
      id: `REVOKED_${k}`,
      room_id: 'AUTH_REVOKED',
      sender_email: 'system@khongtunhi.com',
      sender_name: 'Auth Revocation Guard',
      sender_role: 'system',
      blocked_content: exp,
      reason: 'SESSION_LOGOUT_REVOKED',
      resolved: true
    }));
    const res = await supabaseRequest(env, 'ktn_dlp_alerts?on_conflict=id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: rows
    });
    if (!res || !res.ok) {
      return { ok: false, persisted: false, status: res?.status || 503 };
    }
    // Dọn các dòng thu hồi phiên đã quá hạn 30 ngày
    const cutoffIso = new Date(now - 30 * 86400 * 1000).toISOString();
    await supabaseRequest(
      env,
      `ktn_dlp_alerts?room_id=eq.AUTH_REVOKED&created_at=lt.${encodeURIComponent(cutoffIso)}`,
      { method: 'DELETE', prefer: 'return=minimal' }
    ).catch(() => null);
    return { ok: true, persisted: true };
  } catch {
    return { ok: false, persisted: false, status: 503 };
  }
}

const verifiedIzTeachTokenCache = new Map();

async function verifyIzTeachAccessToken(tok, env) {
  if (!tok || typeof tok !== 'string') return null;
  if (!tok.startsWith('eayJ') && !tok.startsWith('eyJ')) return null;
  const parts = tok.split('.');
  if (parts.length !== 3) return null;

  const cached = verifiedIzTeachTokenCache.get(tok);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.session;
  }

  try {
    const midB64u = parts[1];
    const midPad = '='.repeat((4 - (midB64u.length % 4)) % 4);
    const midJsonStr = atob((midB64u + midPad).replace(/-/g, '+').replace(/_/g, '/'));
    const midObj = JSON.parse(midJsonStr);

    let dec = midObj;
    if (midObj && typeof midObj.payloadCompressed === 'string') {
      const compB64 = midObj.payloadCompressed;
      const compPad = '='.repeat((4 - (compB64.length % 4)) % 4);
      const binStr = atob((compB64 + compPad).replace(/-/g, '+').replace(/_/g, '/'));
      const compBytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) compBytes[i] = binStr.charCodeAt(i);
      const ds = new DecompressionStream('deflate');
      const writer = ds.writable.getWriter();
      writer.write(compBytes);
      writer.close();
      const decompressedText = await new Response(ds.readable).text();
      dec = JSON.parse(decompressedText);
    }

    const email = normalizeEmail(dec?.email || '');
    const userId = String(dec?.userId || dec?.id || '').trim();
    const expectedVendor = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
    const vendorId = String(dec?.vendorId || '').trim();
    if (!email || !userId || vendorId !== expectedVendor) {
      return null;
    }

    // Xác thực chữ ký token trực tiếp qua endpoint user-permission của izTeach.
    // Chỉ chấp nhận khi upstream xác nhận hợp lệ với HTTP 200 OK (từ chối mọi mã 401/403/5xx).
    const permUrl = `${IZTEACH_ENDPOINTS.userPermission}?userId=${encodeURIComponent(userId)}&vendorId=${encodeURIComponent(vendorId)}`;
    const permRes = await fetch(permUrl, { headers: { Authorization: tok } });
    if (permRes.status !== 200) {
      return null;
    }
    const permData = await permRes.json().catch(() => null);
    if (!permData || typeof permData !== 'object') {
      return null;
    }

    const decRoles = Array.isArray(dec?.roles) ? dec.roles : [];
    let role = 'student';
    let name = dec?.name || email.split('@')[0];
    let code = userId;
    let classCode = null;

    if (decRoles.includes('root') || decRoles.includes('admin')) {
      role = 'admin';
    } else {
      const sbTeacher = await supabaseRequest(env, `ktn_teachers?email=eq.${encodeURIComponent(email)}&select=*&limit=1`);
      if (sbTeacher.ok && Array.isArray(sbTeacher.data) && sbTeacher.data[0]) {
        const tRow = sbTeacher.data[0];
        if (tRow.active === false) {
          return null;
        }
        if (tRow.role === 'admin' && (decRoles.includes('root') || decRoles.includes('admin'))) {
          role = 'admin';
        } else {
          role = 'teacher';
        }
        name = tRow.name || name;
        code = tRow.code || code;
      } else if (email === 'linh.lam@khongtunhi.com' || email === 'thu.ha@khongtunhi.com') {
        role = 'teacher';
      } else {
        const sbStudent = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(email)}&select=*&limit=1`);
        if (sbStudent.ok && Array.isArray(sbStudent.data) && sbStudent.data[0]) {
          const sRow = sbStudent.data[0];
          role = 'student';
          name = sRow.name || name;
          code = sRow.code || code;
          classCode = sRow.class_code || null;
        }
      }
    }

    const session = {
      id: code,
      code,
      userId,
      email,
      name,
      role,
      roles: [role],
      classCode
    };
    verifiedIzTeachTokenCache.set(tok, {
      session,
      expiresAt: Date.now() + 5 * 60 * 1000
    });
    return session;
  } catch {
    return null;
  }
}

async function extractSessionFromRequest(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const tok = authHeader.slice(7).trim();
    const verified = await verifySessionToken(tok, env.KTN_SESSION_SECRET);
    if (verified) {
      if (await isTokenRevoked(env, tok, verified.jti)) return null;
      return verified;
    }
    if (await isTokenRevoked(env, tok, null)) return null;
    const verifiedIz = await verifyIzTeachAccessToken(tok, env);
    if (verifiedIz) {
      return verifiedIz;
    }
  }
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)ktn_webapp_token=([^;]+)/);
  if (match && match[1]) {
    const rawCookieTok = decodeURIComponent(match[1]);
    const verified = await verifySessionToken(rawCookieTok, env.KTN_SESSION_SECRET);
    if (verified) {
      if (await isTokenRevoked(env, rawCookieTok, verified.jti)) return null;
      return verified;
    }
    if (await isTokenRevoked(env, rawCookieTok, null)) return null;
    const verifiedIz = await verifyIzTeachAccessToken(rawCookieTok, env);
    if (verifiedIz) {
      return verifiedIz;
    }
  }
  return null;
}

function extractTeacherMetaFromRow(row) {
  if (!row || typeof row !== 'object') {
    return { assignedClasses: [], assignedCourses: [], provisioningStatus: '', cognitoUserId: null, pwdHmac: null };
  }
  const classesSet = new Set();
  if (Array.isArray(row.assigned_classes)) {
    for (const c of row.assigned_classes) {
      const clean = String(c || '').trim().toUpperCase();
      if (clean) classesSet.add(clean);
    }
  }
  const coursesSet = new Set();
  if (Array.isArray(row.assigned_courses)) {
    for (const c of row.assigned_courses) {
      const clean = String(c || '').trim().toLowerCase();
      if (/^[0-9a-f]{24}$/i.test(clean)) coursesSet.add(clean);
    }
  }
  let provisioningStatus = String(row.provisioning_status || '').trim();
  let cognitoUserId = row.cognito_user_id || null;
  let pwdHmac = null;
  let customPassword = false;
  if (Array.isArray(row.aliases)) {
    for (const item of row.aliases) {
      const s = String(item || '').trim();
      if (s.startsWith('__class:')) {
        const cls = s.slice(8).trim().toUpperCase();
        if (cls) classesSet.add(cls);
      } else if (s.startsWith('__course:')) {
        const cid = s.slice(9).trim().toLowerCase();
        if (/^[0-9a-f]{24}$/i.test(cid)) coursesSet.add(cid);
      } else if (s.startsWith('__status:') && !provisioningStatus) {
        provisioningStatus = s.slice(9).trim();
      } else if (s.startsWith('__uid:') && !cognitoUserId) {
        cognitoUserId = s.slice(6).trim();
      } else if (s.startsWith('__pwd_hmac:')) {
        pwdHmac = s.slice(11).trim();
      } else if (s === '__pwd_custom:1') {
        customPassword = true;
      }
    }
  }
  return {
    assignedClasses: Array.from(classesSet),
    assignedCourses: Array.from(coursesSet),
    provisioningStatus,
    cognitoUserId,
    pwdHmac,
    passwordHmac: pwdHmac,
    customPassword
  };
}

async function computeTeacherCredentialHmac(email, password, secret) {
  const cleanEmail = normalizeEmail(email || '');
  const cleanPwd = String(password || '');
  if (!cleanEmail || !cleanPwd) return '';
  const key = await getHmacKey(secret || 'ktn-default-change-me-in-production-env');
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`ktn_teacher_pwd_v1:${cleanEmail}:${cleanPwd}`));
  const sigBytes = Array.from(new Uint8Array(sigBuf), b => b.toString(16).padStart(2, '0')).join('');
  return sigBytes;
}

async function deriveDeterministicInitialPassword(env, operationId, email) {
  const cleanEmail = normalizeEmail(email || '');
  const cleanOp = String(operationId || 'default-op').trim();
  const key = await getHmacKey(env?.KTN_SESSION_SECRET || 'ktn-default-change-me-in-production-env');
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`ktn_init_pwd_v1:${cleanOp}:${cleanEmail}`));
  const hex = Array.from(new Uint8Array(sigBuf), b => b.toString(16).padStart(2, '0')).join('');
  return `Ktn@${hex.slice(0, 6).toUpperCase()}9!`;
}

async function getTeacherAssignedClassCodes(env, teacherEmail) {
  const email = normalizeEmail(teacherEmail || '');
  if (!email) return [];
  const tRes = await supabaseRequest(
    env,
    `ktn_teachers?email=eq.${encodeURIComponent(email)}&select=*&limit=1`
  );
  const tRow = (tRes.ok && Array.isArray(tRes.data) && tRes.data[0]) ? tRes.data[0] : null;
  if (tRow && tRow.active === false) {
    return [];
  }
  const meta = extractTeacherMetaFromRow(tRow);
  const classSet = new Set(meta.assignedClasses);

  // Đối chiếu nguồn sự thật từ ktn_classes để loại bỏ lớp đã lưu trữ (active=false) hoặc lớp đã chuyển sang giáo viên khác
  const allClsRes = await supabaseRequest(
    env,
    'ktn_classes?select=id,teacher_email,teacher_code,active&order=created_at.asc,id.asc'
  );
  const teacherCode = String(tRow?.code || tRow?.teacher_code || '').trim();
  if (allClsRes.ok && Array.isArray(allClsRes.data)) {
    for (const c of allClsRes.data) {
      const cid = String(c?.id || '').trim().toUpperCase();
      if (!cid) continue;
      if (c.active === false) {
        classSet.delete(cid);
        continue;
      }
      const clsTeacherEmail = normalizeEmail(c?.teacher_email || '');
      const clsTeacherCode = String(c?.teacher_code || '').trim();
      if (clsTeacherEmail === email || (!clsTeacherEmail && teacherCode && clsTeacherCode && clsTeacherCode === teacherCode)) {
        classSet.add(cid);
      } else {
        classSet.delete(cid);
      }
    }
  }
  return Array.from(classSet);
}

async function getTeacherAssignedCourseIds(env, teacherEmail) {
  const email = normalizeEmail(teacherEmail || '');
  if (!email) return [];
  const tRes = await supabaseRequest(
    env,
    `ktn_teachers?email=eq.${encodeURIComponent(email)}&select=*&limit=1`
  );
  const tRow = (tRes.ok && Array.isArray(tRes.data) && tRes.data[0]) ? tRes.data[0] : null;
  if (!tRow || tRow.active === false) {
    return [];
  }
  const meta = extractTeacherMetaFromRow(tRow);
  const courseSet = new Set(meta.assignedCourses);
  const cRes = await supabaseRequest(
    env,
    `ktn_courses?teacher_email=eq.${encodeURIComponent(email)}&active=eq.true&select=course_id`
  );
  if (cRes.ok && Array.isArray(cRes.data)) {
    for (const c of cRes.data) {
      const cid = String(c?.course_id || '').trim().toLowerCase();
      if (/^[0-9a-f]{24}$/i.test(cid)) courseSet.add(cid);
    }
  }
  return Array.from(courseSet);
}


function normalizeRoomClassCode(rawRoomId) {
  const s = String(rawRoomId || '').trim().replace(/^class:/i, '').trim().toUpperCase();
  if (!s || s === 'GENERAL' || s === 'ALL') return '';
  return s;
}

const COURSE_CHAT_ALIASES = {
  'hsk1': '6adadba969897b0002482ca5',
  'hsk1-30': '6adadba969897b0002482ca5',
  'cfk1': '65e7704a9ea90c00080d5195',
  'cfk-01': '65e7704a9ea90c00080d5195',
  'cfk': '65e7704a9ea90c00080d5195',
  'cfk-03': '661528ea42af880008944573',
  '65e7688d524c58000836593b': '65e7704a9ea90c00080d5195',
  'mini-01': '65e7636a0a1b61000825c2ef',
  'mini-02': '6600fa477c18b80008c53c88',
  'mini-03': '6600fa7da2bfe10008834e13',
  'yct1': '65e769bd637339000870618f',
  'kids-01': '65e769bd637339000870618f',
  'kids-02': '66028938bfd6c90008b816e1',
  'kids-03': '6638bd09a7367400085c7ab2',
  'kids-04': '678d14b960eae20002ddf8fe',
  'kids-05': '67a7290a5fdc26000238b4e9',
  'kids-06': '67a869302ecb9c000257d966',
  'junior-01': '65e772a1767c56000829518e',
  'junior-03': '6638c76dfac274000876cd13',
  'yct-04': '6983672f409cc20002e530b8',
  'pron-01': '65e76a533f5e7c00086715d7',
  'hanzi-01': '67bebce067dba000027d8119'
};

function fnv1aHex(str) {
  const s = String(str || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

function buildDeterministicMessageId(roomKey, senderEmail, clientMessageId) {
  const cleanClient = String(clientMessageId || '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 96);
  if (!cleanClient) {
    return 'MSG-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  }
  const canonicalRoom = String(roomKey || '').trim().replace(/^class:/i, '').toLowerCase();
  const scopeHash = fnv1aHex(`${canonicalRoom}|${normalizeEmail(senderEmail)}`);
  return `MSG-IDEM-${scopeHash}__${cleanClient}`;
}

function extractClientMessageIdFromServerId(serverId) {
  const m = String(serverId || '').match(/^MSG-IDEM-[a-z0-9-]+__([a-zA-Z0-9_.-]+)$/);
  return m ? m[1] : null;
}

function parseChatRoomDescriptor(rawRoomId) {
  const raw = String(rawRoomId || '').trim();
  if (!raw) return { valid: false, type: '', classCode: '', roomId: '', queryKeys: [] };

  if (/^course:/i.test(raw)) {
    const rawCid = raw.replace(/^course:/i, '').trim().toLowerCase();
    if (!rawCid) return { valid: false, type: 'course', classCode: '', roomId: '', queryKeys: [] };
    const canonicalCid = COURSE_CHAT_ALIASES[rawCid] || rawCid;
    const keys = new Set([`course:${canonicalCid}`, `course:${rawCid}`]);
    if (canonicalCid === '65e7704a9ea90c00080d5195') {
      keys.add('course:65e7688d524c58000836593b');
    }
    return {
      valid: true,
      type: 'course',
      courseId: canonicalCid,
      rawCourseId: rawCid,
      classCode: `course:${canonicalCid}`,
      roomId: `course:${canonicalCid}`,
      queryKeys: Array.from(keys)
    };
  }

  if (/^(?:direct:)?student:/i.test(raw)) {
    const stuEmail = normalizeEmail(raw.replace(/^(?:direct:)?student:/i, '').trim());
    if (!stuEmail || !stuEmail.includes('@')) {
      return { valid: false, type: 'student', classCode: '', roomId: '', queryKeys: [] };
    }
    return {
      valid: true,
      type: 'student',
      studentEmail: stuEmail,
      classCode: `student:${stuEmail}`,
      roomId: `student:${stuEmail}`,
      queryKeys: [`student:${stuEmail}`, `direct:student:${stuEmail}`]
    };
  }

  const classCode = normalizeRoomClassCode(raw);
  if (!classCode) return { valid: false, type: 'class', classCode: '', roomId: '', queryKeys: [] };
  return {
    valid: true,
    type: 'class',
    classCode,
    roomId: `class:${classCode}`,
    queryKeys: [classCode, `class:${classCode}`]
  };
}

async function isActiveTeacherSession(env, session) {
  if (!session || session.role !== 'teacher') return false;
  const email = normalizeEmail(session.email || '');
  if (email === 'linh.lam@khongtunhi.com' || email === 'thu.ha@khongtunhi.com') return true;
  const tRes = await supabaseRequest(env, `ktn_teachers?email=ilike.${encodeURIComponent(email)}&limit=1`);
  if (!tRes.ok || !Array.isArray(tRes.data) || tRes.data.length === 0) return false;
  return tRes.data[0].active !== false;
}

async function canAccessChatRoom(env, session, rawRoomId) {
  const desc = parseChatRoomDescriptor(rawRoomId);
  if (!desc.valid) {
    return {
      allowed: false,
      status: 400,
      classCode: '',
      roomId: '',
      message: 'Vui lòng chọn đúng mã lớp học hoặc khóa học (roomId) để xem hoặc gửi tin nhắn.'
    };
  }
  if (!session) {
    return { allowed: false, status: 401, classCode: desc.classCode, roomId: desc.roomId, message: 'Vui lòng đăng nhập.' };
  }

  // Với nhóm lớp (class:<CLASS_CODE>), kiểm tra lớp còn active hay đã đóng/lưu trữ trước cho MỌI role (kể cả Admin)
  if (desc.type === 'class') {
    const classCode = desc.classCode;
    const clsRes = await supabaseRequest(
      env,
      `ktn_classes?id=eq.${encodeURIComponent(classCode)}&select=id,active,teacher_email,teacher_code&limit=1`
    );
    const clsRow = clsRes.ok && Array.isArray(clsRes.data) && clsRes.data[0] ? clsRes.data[0] : null;
    if (clsRow && clsRow.active === false) {
      return {
        allowed: false,
        status: 403,
        error: 'CLASS_ARCHIVED_OR_INACTIVE',
        classCode,
        roomId: desc.roomId,
        message: `Lớp ${classCode} đã được lưu trữ hoặc ngừng hoạt động nên không thể đọc hoặc gửi tin nhắn mới.`
      };
    }
    if (session.role === 'admin') {
      if (!clsRow) {
        return {
          allowed: false,
          status: 404,
          error: 'CLASS_NOT_FOUND',
          classCode,
          roomId: desc.roomId,
          message: `Lớp ${classCode} không tồn tại trong hệ thống.`
        };
      }
      return { allowed: true, status: 200, ...desc };
    }
  }

  if (session.role === 'admin') {
    return { allowed: true, status: 200, ...desc };
  }

  if (session.role === 'student' && session.email) {
    const stuLifecycle = await getStudentLifecycleState(env, session.email).catch(() => null);
    const lifeStatus = String(stuLifecycle?.status || '').toLowerCase();
    if (lifeStatus === 'deleted' || lifeStatus === 'suspended' || lifeStatus === 'archived') {
      return {
        allowed: false,
        status: 403,
        error: lifeStatus === 'deleted' ? 'ACCOUNT_DELETED' : (lifeStatus === 'suspended' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_ARCHIVED'),
        classCode: desc.classCode,
        roomId: desc.roomId,
        message: 'Tài khoản học viên hiện đang tạm khóa hoặc ngừng hoạt động nên không thể truy cập phòng trao đổi.'
      };
    }
  }

  if (desc.type === 'class') {
    const classCode = desc.classCode;
    if (session.role === 'teacher') {
      if (!(await isActiveTeacherSession(env, session))) {
        return { allowed: false, status: 403, classCode, roomId: desc.roomId, message: 'Tài khoản giáo viên chưa được kích hoạt.' };
      }
      const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
      if (!assignedClasses.includes(classCode)) {
        return {
          allowed: false,
          status: 403,
          error: 'TEACHER_CLASS_SCOPE_FORBIDDEN',
          classCode,
          roomId: desc.roomId,
          message: `Cô không phụ trách lớp ${classCode} nên không có quyền truy cập phòng trao đổi của lớp này.`
        };
      }
      return { allowed: true, status: 200, ...desc };
    }
    const stuRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(session.email)}&select=*&limit=1`);
    const stuRow = (stuRes.ok && Array.isArray(stuRes.data) && stuRes.data[0]) ? stuRes.data[0] : null;
    const rowAccStatus = String(stuRow?.account_status || '').toLowerCase();
    if (rowAccStatus === 'deleted' || rowAccStatus === 'suspended' || rowAccStatus === 'archived') {
      return {
        allowed: false,
        status: 403,
        error: rowAccStatus === 'deleted' ? 'ACCOUNT_DELETED' : 'ACCOUNT_SUSPENDED',
        classCode,
        roomId: desc.roomId,
        message: 'Tài khoản học viên hiện không ở trạng thái hoạt động.'
      };
    }
    // Bắt buộc dựa trên dữ liệu thực trong DB, không cho phép session.classCode cũ tiếp tục truy cập khi đã đổi/gỡ lớp
    const realClassCode = stuRow
      ? String(stuRow.class_code || '').trim().toUpperCase()
      : String(session.classCode || '').trim().toUpperCase();
    if (!realClassCode || realClassCode !== classCode) {
      return {
        allowed: false,
        status: 403,
        error: 'STUDENT_CLASS_SCOPE_FORBIDDEN',
        classCode,
        roomId: desc.roomId,
        message: `Em không thuộc lớp ${classCode} nên không có quyền xem hoặc gửi tin nhắn trong phòng trao đổi của lớp này.`
      };
    }
    return { allowed: true, status: 200, ...desc };
  }

  if (desc.type === 'course') {
    if (session.role === 'teacher') {
      if (!(await isActiveTeacherSession(env, session))) {
        return { allowed: false, status: 403, classCode: desc.classCode, roomId: desc.roomId, message: 'Tài khoản giáo viên chưa được kích hoạt.' };
      }
      const assignedCourses = await getTeacherAssignedCourseIds(env, session.email);
      const isCourseAssigned =
        assignedCourses.includes(desc.courseId) ||
        assignedCourses.includes(desc.rawCourseId) ||
        ((desc.courseId === '65e7704a9ea90c00080d5195' || desc.courseId === '65e7688d524c58000836593b') &&
          (assignedCourses.includes('65e7704a9ea90c00080d5195') || assignedCourses.includes('65e7688d524c58000836593b')));
      if (!isCourseAssigned) {
        return {
          allowed: false,
          status: 403,
          error: 'TEACHER_COURSE_SCOPE_FORBIDDEN',
          code: 'TEACHER_COURSE_CHAT_FORBIDDEN',
          classCode: desc.classCode,
          roomId: desc.roomId,
          message: 'Cô chưa được phân công phụ trách khóa học này nên không có quyền truy cập phòng trao đổi của khóa.'
        };
      }
      return { allowed: true, status: 200, ...desc };
    }
    const stuRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(session.email)}&limit=1`);
    const stuRow = (stuRes.ok && Array.isArray(stuRes.data) && stuRes.data[0]) ? stuRes.data[0] : null;
    const rowAccStatus = String(stuRow?.account_status || '').toLowerCase();
    if (rowAccStatus === 'deleted' || rowAccStatus === 'suspended' || rowAccStatus === 'archived') {
      return {
        allowed: false,
        status: 403,
        error: rowAccStatus === 'deleted' ? 'ACCOUNT_DELETED' : 'ACCOUNT_SUSPENDED',
        classCode: desc.classCode,
        roomId: desc.roomId,
        message: 'Tài khoản học viên hiện đang tạm khóa hoặc ngừng hoạt động.'
      };
    }
    // Khi bản ghi học viên đã tồn tại trong Supabase DB, chỉ tin cậy danh sách khóa học trong DB (không dùng session cũ hay tự đồng bộ ngược từ izTeach làm khôi phục khóa đã thu hồi)
    const onlineList = stuRow
      ? (Array.isArray(stuRow.online_courses) ? stuRow.online_courses : [])
      : (Array.isArray(session.onlineCourses) ? session.onlineCourses : []);
    let enrolledIds = new Set(
      onlineList
        .map(c => {
          const cid = String(c?.id || c?._id || c?.code || c || '').trim().toLowerCase();
          return COURSE_CHAT_ALIASES[cid] || cid;
        })
        .filter(Boolean)
    );
    if (enrolledIds.has('65e7704a9ea90c00080d5195') || enrolledIds.has('65e7688d524c58000836593b')) {
      enrolledIds.add('65e7704a9ea90c00080d5195');
      enrolledIds.add('65e7688d524c58000836593b');
    }
    if (!stuRow && !enrolledIds.has(desc.courseId) && !enrolledIds.has(desc.rawCourseId)) {
      const syncedStu = await syncStudentEntitlementFromIzTeach(env, {
        email: session.email,
        name: session.name,
        phone: '',
        cognitoUserId: session.userId,
        izteachStudentId: session.studentId,
        accessToken: session.izteachAccessToken || session.accessToken
      });
      if (syncedStu && Array.isArray(syncedStu.online_courses)) {
        for (const c of syncedStu.online_courses) {
          const cid = String(c?.id || c?._id || c || '').trim().toLowerCase();
          if (cid) enrolledIds.add(COURSE_CHAT_ALIASES[cid] || cid);
        }
        if (enrolledIds.has('65e7704a9ea90c00080d5195') || enrolledIds.has('65e7688d524c58000836593b')) {
          enrolledIds.add('65e7704a9ea90c00080d5195');
          enrolledIds.add('65e7688d524c58000836593b');
        }
      }
    }
    if (!enrolledIds.has(desc.courseId) && !enrolledIds.has(desc.rawCourseId)) {
      return {
        allowed: false,
        status: 403,
        error: 'COURSE_NOT_ENTITLED',
        classCode: desc.classCode,
        roomId: desc.roomId,
        message: 'Em chưa được cấp quyền khóa học này nên không thể tham gia nhóm trao đổi của khóa.'
      };
    }
    return { allowed: true, status: 200, ...desc };
  }

  if (desc.type === 'student') {
    if (session.role === 'teacher') {
      if (!(await isActiveTeacherSession(env, session))) {
        return { allowed: false, status: 403, classCode: desc.classCode, roomId: desc.roomId, message: 'Tài khoản giáo viên chưa được kích hoạt.' };
      }
      const stuRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(desc.studentEmail)}&select=class_code&limit=1`);
      const stuRow = (stuRes.ok && Array.isArray(stuRes.data) && stuRes.data[0]) ? stuRes.data[0] : null;
      const stuClassCode = String(stuRow?.class_code || '').trim().toUpperCase();
      if (stuClassCode) {
        const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
        if (!assignedClasses.includes(stuClassCode)) {
          return {
            allowed: false,
            status: 403,
            error: 'TEACHER_CLASS_SCOPE_FORBIDDEN',
            code: 'TEACHER_STUDENT_ROOM_FORBIDDEN',
            classCode: stuClassCode,
            roomId: desc.roomId,
            message: `Học viên thuộc lớp ${stuClassCode} ngoài phạm vi lớp được phân công của cô.`
          };
        }
      }
      return { allowed: true, status: 200, ...desc };
    }
    const myEmail = normalizeEmail(session.email || '');
    if (!myEmail || myEmail !== desc.studentEmail) {
      return {
        allowed: false,
        status: 403,
        error: 'STUDENT_PRIVATE_ROOM_FORBIDDEN',
        classCode: desc.classCode,
        roomId: desc.roomId,
        message: 'Kênh nhắn riêng 1-1 với cô giáo là bảo mật cá nhân. Em không được phép truy cập hộp thư riêng của học viên khác.'
      };
    }
    return { allowed: true, status: 200, ...desc };
  }

  return { allowed: false, status: 400, classCode: '', roomId: '', message: 'Phòng trao đổi không hợp lệ.' };
}

function getDefaultPinnedAnnouncement(_access) {
  return null;
}

async function getRoomPinnedAnnouncement(env, access) {
  if (!access || !access.roomId) return null;
  const pinKey = 'PIN:' + access.roomId;
  const res = await supabaseRequest(env, `ktn_dlp_alerts?room_id=eq.${encodeURIComponent(pinKey)}&order=created_at.desc&limit=1`);
  if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
    const row = res.data[0];
    try {
      const parsed = JSON.parse(row.blocked_content || '{}');
      if (parsed && parsed.content && parsed.isDefault !== true) {
        const neutralAuthorLabel =
          row.sender_role === 'admin' ? 'Ban Quản Trị KTN' : 'Giáo viên phụ trách';
        return {
          roomId: access.roomId,
          content: String(parsed.content).trim(),
          pinnedBy: parsed.pinnedBy || row.sender_name || row.sender_email || neutralAuthorLabel,
          pinnedByEmail: parsed.pinnedByEmail || row.sender_email || '',
          messageId: parsed.messageId || null,
          isDefault: false,
          updatedAt: parsed.updatedAt || row.created_at || new Date().toISOString()
        };
      }
    } catch {}
  }
  return getDefaultPinnedAnnouncement(access);
}

async function saveRoomPinnedAnnouncement(env, session, access, content, messageId = null) {
  const pinKey = 'PIN:' + access.roomId;
  const pinId = 'PIN-' + access.roomId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const nowIso = new Date().toISOString();
  const actorLabel =
    session.name ||
    session.email ||
    (session.role === 'admin' ? 'Ban Quản Trị KTN' : 'Giáo viên phụ trách');
  const payload = {
    roomId: access.roomId,
    content: String(content || '').trim(),
    pinnedBy: actorLabel,
    pinnedByEmail: session.email || '',
    messageId: messageId || null,
    isDefault: false,
    updatedAt: nowIso
  };
  const existingRes = await supabaseRequest(env, `ktn_dlp_alerts?room_id=eq.${encodeURIComponent(pinKey)}&order=created_at.desc&limit=1`);
  const existingRow = (existingRes.ok && Array.isArray(existingRes.data) && existingRes.data[0]) ? existingRes.data[0] : null;
  let sbRes = null;
  if (existingRow && existingRow.id) {
    sbRes = await supabaseRequest(env, `ktn_dlp_alerts?id=eq.${encodeURIComponent(existingRow.id)}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: {
        sender_email: session.email,
        sender_name: actorLabel,
        sender_role: session.role,
        blocked_content: JSON.stringify(payload)
      }
    });
  }
  if (!sbRes || !sbRes.ok || !Array.isArray(sbRes.data) || sbRes.data.length === 0) {
    sbRes = await supabaseRequest(env, 'ktn_dlp_alerts', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        id: pinId + '-' + Date.now(),
        room_id: pinKey,
        sender_email: session.email,
        sender_name: actorLabel,
        sender_role: session.role,
        blocked_content: JSON.stringify(payload),
        reason: 'ROOM_PINNED_ANNOUNCEMENT',
        created_at: nowIso
      }
    });
  }
  return { ok: Boolean(sbRes && sbRes.ok), pinnedMessage: payload, status: sbRes?.status || 500 };
}

// ============================================================================
// KẾT NỐI SUPABASE REST API (POSTGREST)
// ============================================================================
async function supabaseRequest(env, tableAndQuery, options = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 503, data: null, unconfigured: true };
  }
  const baseUrl = env.SUPABASE_URL.replace(/\/+$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY).trim();
  const url = `${baseUrl}/rest/v1/${tableAndQuery}`;
  const headers = {
    'apikey': key,
    'Content-Type': 'application/json',
    'Prefer': options.prefer || 'return=representation',
    ...(options.headers || {})
  };
  // Legacy service_role keys (eyJ...) cần thêm Authorization: Bearer; khóa mới (sb_secret_...) chỉ dùng header apikey
  if (!key.startsWith('sb_')) {
    headers['Authorization'] = `Bearer ${key}`;
  }
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const contentRange = (res.headers && typeof res.headers.get === 'function')
    ? (res.headers.get('content-range') || res.headers.get('Content-Range') || '')
    : '';
  let totalCount = null;
  if (contentRange) {
    const m = String(contentRange).match(/\/(\d+)\s*$/);
    if (m) totalCount = Number(m[1]);
  }
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data, totalCount, contentRange };
}

// ============================================================================
// LẤY TOKEN ADMIN IZTEACH TỪ KÉT SẮT BÍ MẬT CỦA ROBOT CLOUDFLARE
// ============================================================================
let cachedIzTeachAdminToken = null;
let cachedIzTeachAdminTokenAt = 0;

async function getIzTeachAdminToken(env, forceRefresh = false) {
  if (!forceRefresh && cachedIzTeachAdminToken && (Date.now() - cachedIzTeachAdminTokenAt < 15 * 60 * 1000)) {
    return cachedIzTeachAdminToken;
  }
  const adminEmail = env.IZTEACH_ADMIN_EMAIL || 'hocvienkhongtunhi123@gmail.com';
  const adminPassword = env.IZTEACH_ADMIN_PASSWORD;
  if (!adminPassword) {
    return null;
  }
  const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
  const res = await fetch(IZTEACH_ENDPOINTS.staffSignin, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: adminEmail,
      password: btoa(adminPassword),
      vendorId
    })
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (data && data.accessToken) {
    cachedIzTeachAdminToken = data.accessToken;
    cachedIzTeachAdminTokenAt = Date.now();
    return data.accessToken;
  }
  return null;
}

// ============================================================================
// BỘ LỌC AN TOÀN LIÊN LẠC (DLP) TRÊN SERVER
// ============================================================================
function inspectDlpContent(text) {
  const s = String(text || '');
  const phoneRegex = /(?<!\d)(?:\+?84|0)\s*(?:3|5|7|8|9)(?:[\s.-]*\d){8}(?!\d)/;
  const linkRegex = /\b(?:zalo\.me|fb\.com|facebook\.com|t\.me)\b/i;
  if (phoneRegex.test(s)) {
    return { blocked: true, reason: 'Phát hiện số điện thoại cá nhân trong tin nhắn lớp học' };
  }
  if (linkRegex.test(s)) {
    return { blocked: true, reason: 'Phát hiện liên kết mạng xã hội ngoài luồng (Zalo/Facebook/Telegram)' };
  }
  return { blocked: false, reason: '' };
}

// ============================================================================
// QUY TRÌNH DUYỆT ĐƠN 1 CHẠM (TẠO COGNITO UUID + MỞ KHÓA HỌC IZTEACH)
// ============================================================================
function isValidCognitoUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || '').trim());
}

function isValidIzTeachPermissionPayload(permData) {
  if (!permData || typeof permData !== 'object') return false;
  if (permData.error || (typeof permData.statusCode === 'number' && permData.statusCode >= 400)) return false;
  if (Array.isArray(permData)) {
    return permData.some(item => item && typeof item === 'object' && Array.isArray(item.onlineCourses));
  }
  return Array.isArray(permData.onlineCourses) || Boolean(permData.data && Array.isArray(permData.data.onlineCourses));
}

function extractIzTeachOnlineCourseIds(permData) {
  const list = Array.isArray(permData)
    ? permData
    : (permData && typeof permData === 'object'
      ? (permData.data && typeof permData.data === 'object' ? [permData.data] : [permData])
      : []);
  const ids = [];
  const seen = new Set();
  for (const item of list) {
    const arr = Array.isArray(item?.onlineCourses) ? item.onlineCourses : [];
    for (const c of arr) {
      const cid = String(c?.id || c?._id || c?.onlineCourseId || c?.productId || c || '').trim();
      if (cid && !seen.has(cid)) {
        seen.add(cid);
        ids.push(cid);
      }
    }
  }
  return ids;
}

function normalizeViSearchText(input) {
  if (!input) return '';
  return String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function extractParentPhoneFromInternalNote(note) {
  const s = String(note || '');
  const m = s.match(/\[SĐT_PH:([^\]]+)\]/i);
  return m && m[1] ? m[1].trim() : '';
}

function buildStudentSearchText(row) {
  if (!row || typeof row !== 'object') return '';
  const compactName = normalizeViSearchText(row.name || '').replace(/\s+/g, '');
  const rawParentName = String(row.parent_name || row.parentName || '').trim();
  const cleanParentName = rawParentName.replace(/\s*\[SĐT_PH:[^\]]+\]/gi, '').trim();
  const parentPhone =
    row.parent_phone ||
    row.parentPhone ||
    extractParentPhoneFromInternalNote(row.internal_note) ||
    extractParentPhoneFromInternalNote(rawParentName);
  const parts = [
    row.code,
    row.name,
    compactName,
    row.email,
    row.phone,
    cleanParentName,
    parentPhone,
    row.class_code || row.classCode
  ];
  return normalizeViSearchText(parts.filter(Boolean).join(' '));
}

function computeStudentAccountAndSyncStatus(row) {
  const hasCognito = isValidCognitoUuid(row?.cognito_user_id || row?.cognitoUserId);
  const hasClass = Boolean(row?.class_code);
  const courses = Array.isArray(row?.online_courses) ? row.online_courses : [];
  const hasCourses = courses.length > 0;
  let accountStatus = row?.account_status || '';
  if (!accountStatus) {
    if (hasCognito) accountStatus = 'ready_to_login';
    else if (hasClass || hasCourses) accountStatus = 'pending_activation';
    else accountStatus = 'unassigned';
  }
  let syncStatus = row?.sync_status || '';
  if (!syncStatus) {
    if (row?.last_sync_error) syncStatus = 'partial_failure';
    else if (!hasCognito && (hasCourses || hasClass)) syncStatus = 'pending_sync';
    else syncStatus = 'synced';
  }
  return { accountStatus, syncStatus };
}

function enrichStudentRowV3(row) {
  if (!row || typeof row !== 'object') return row;
  const studentCase = computeStudentCase(row);
  const { accountStatus, syncStatus } = computeStudentAccountAndSyncStatus(row);
  const rawParentName = String(row.parent_name ?? row.parentName ?? '').trim();
  const resolvedParentName = rawParentName.replace(/\s*\[SĐT_PH:[^\]]+\]/gi, '').trim();
  const rawInternalNote = String(row.internal_note ?? row.internalNote ?? row.note ?? '').trim();
  const resolvedInternalNote = rawInternalNote.replace(/\s*\[SĐT_PH:[^\]]+\]/gi, '').trim();
  const resolvedParentPhone =
    row.parent_phone ||
    row.parentPhone ||
    extractParentPhoneFromInternalNote(rawInternalNote) ||
    extractParentPhoneFromInternalNote(rawParentName) ||
    '';
  return {
    ...row,
    parent_name: resolvedParentName,
    parentName: resolvedParentName || undefined,
    parent_phone: resolvedParentPhone || null,
    parentPhone: resolvedParentPhone || null,
    internal_note: resolvedInternalNote || null,
    note: resolvedInternalNote || null,
    studentCase,
    account_status: accountStatus,
    sync_status: syncStatus,
    accountStatus,
    syncStatus,
    search_text: row.search_text || buildStudentSearchText(row)
  };
}

function filterAndRankStudents(rows, filters = {}) {
  const rawQuery = String(filters.q || filters.query || '').trim();
  const normQuery = normalizeViSearchText(rawQuery);
  const queryTokens = normQuery ? normQuery.split(' ').filter(Boolean) : [];
  const lowerRawQuery = rawQuery.toLowerCase();

  const classFilter = String(filters.classCode || '').trim().toUpperCase();
  const courseFilter = String(filters.courseId || '').trim();
  const accountStatusFilter = String(filters.accountStatus || '').trim().toLowerCase();
  const syncStatusFilter = String(filters.syncStatus || '').trim().toLowerCase();
  const caseFilter = String(filters.studentCase || '').trim().toLowerCase();

  const scored = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    if (!raw) continue;
    const stu = enrichStudentRowV3(raw);

    if (classFilter) {
      const stuCls = String(stu.class_code || '').trim().toUpperCase();
      if (classFilter === '__UNASSIGNED__' || classFilter === 'UNASSIGNED' || classFilter === 'NONE') {
        if (stuCls) continue;
      } else if (stuCls !== classFilter) {
        continue;
      }
    }

    if (courseFilter) {
      const cList = Array.isArray(stu.online_courses) ? stu.online_courses : [];
      const hasCourse = cList.some(c => String(c?.id || c?._id || c || '').trim() === courseFilter);
      if (!hasCourse) continue;
    }

    if (accountStatusFilter && accountStatusFilter !== 'all') {
      if (String(stu.account_status || '').toLowerCase() !== accountStatusFilter) continue;
    }

    if (syncStatusFilter && syncStatusFilter !== 'all') {
      const stuSync = String(stu.sync_status || '').toLowerCase();
      if (syncStatusFilter === 'needs_resync') {
        const needsResync =
          stuSync === 'needs_resync' ||
          stuSync === 'sync_failed' ||
          stuSync === 'partial_failure' ||
          stuSync === 'pending_sync' ||
          stuSync === 'error' ||
          Boolean(stu.last_sync_error);
        if (!needsResync) continue;
      } else if (stuSync !== syncStatusFilter) {
        continue;
      }
    }

    if (caseFilter && caseFilter !== 'all') {
      const stuCase = String(stu.studentCase || '').toLowerCase();
      const canonicalCase =
        caseFilter === 'video_only' ? 'online_only'
        : caseFilter === 'live_only' ? 'sll_only'
        : caseFilter === 'hybrid' ? 'both'
        : caseFilter === 'none' ? 'unassigned'
        : caseFilter;
      if (stuCase !== canonicalCase) continue;
    }

    if (queryTokens.length === 0) {
      scored.push({ stu, score: 1 });
      continue;
    }

    const searchBlob = stu.search_text || buildStudentSearchText(stu);
    const normName = normalizeViSearchText(stu.name || '');
    const compactName = normName.replace(/\s+/g, '');
    const allTokensMatch = queryTokens.every(
      tok => searchBlob.includes(tok) || (tok.length >= 4 && compactName.includes(tok))
    );
    const rawDirectMatch =
      String(stu.name || '').toLowerCase().includes(lowerRawQuery) ||
      String(stu.email || '').toLowerCase().includes(lowerRawQuery) ||
      String(stu.code || '').toLowerCase().includes(lowerRawQuery) ||
      String(stu.phone || '').toLowerCase().includes(lowerRawQuery) ||
      String(stu.parent_phone || stu.parentPhone || '').toLowerCase().includes(lowerRawQuery) ||
      String(stu.parent_name || stu.parentName || '').toLowerCase().includes(lowerRawQuery);

    if (!allTokensMatch && !rawDirectMatch) continue;

    let score = 10;
    const lowerEmail = String(stu.email || '').toLowerCase();
    const lowerCode = String(stu.code || '').toLowerCase();
    const cleanPhone = String(stu.phone || '');
    const cleanParentPhone = String(stu.parent_phone || stu.parentPhone || '');

    if (lowerEmail === lowerRawQuery || lowerCode === lowerRawQuery || cleanPhone === rawQuery || (cleanParentPhone && cleanParentPhone === rawQuery)) {
      score = 100;
    } else if (normName === normQuery || String(stu.name || '').toLowerCase() === lowerRawQuery) {
      score = 95;
    } else if (lowerEmail.startsWith(lowerRawQuery) || lowerCode.startsWith(lowerRawQuery)) {
      score = 85;
    } else if (normName.startsWith(normQuery) || normName.endsWith(' ' + normQuery)) {
      score = 80;
    } else if (normName.includes(normQuery) || (normQuery.length >= 4 && compactName.includes(normQuery.replace(/\s+/g, '')))) {
      score = 70;
    } else if (queryTokens.every(tok => normName.includes(tok))) {
      score = 60;
    }

    scored.push({ stu, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ta = Date.parse(a.stu.updated_at || '') || 0;
    const tb = Date.parse(b.stu.updated_at || '') || 0;
    if (tb !== ta) return tb - ta;
    return String(a.stu.email || '').localeCompare(String(b.stu.email || ''));
  });

  return scored.map(item => item.stu);
}

function extractIzTeachStudentRecords(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.filter(item => item && typeof item === 'object');
  if (typeof payload !== 'object') return [];

  const candidateArrays = [
    payload.data,
    payload.items,
    payload.results,
    payload.rows,
    payload.students,
    payload.users,
    payload.list,
    payload.records,
    payload.data?.items,
    payload.data?.results,
    payload.data?.rows,
    payload.data?.students,
    payload.data?.users,
    payload.data?.list,
    payload.data?.records,
    payload.data?.data,
    payload.result?.items,
    payload.result?.results,
    payload.result?.data
  ];
  for (const arr of candidateArrays) {
    if (Array.isArray(arr)) {
      return arr.filter(item => item && typeof item === 'object');
    }
  }

  const candidateObjects = [
    payload.data,
    payload.student,
    payload.user,
    payload.item,
    payload.result,
    payload.record,
    payload
  ];
  for (const obj of candidateObjects) {
    if (
      obj &&
      typeof obj === 'object' &&
      !Array.isArray(obj) &&
      (obj.email || obj.dynamoId || obj.userId || obj.cognitoUserId || obj.cognito_user_id || obj.sub || obj._id || obj.id || obj.studentId)
    ) {
      return [obj];
    }
  }
  return [];
}

function extractIdentityFromIzTeachRecord(record) {
  if (!record || typeof record !== 'object') {
    return { cognitoUserId: null, izteachStudentId: null, status: null, rawId: null };
  }
  const nestedObjects = [
    record,
    record.data && typeof record.data === 'object' && !Array.isArray(record.data) ? record.data : null,
    record.student && typeof record.student === 'object' ? record.student : null,
    record.user && typeof record.user === 'object' ? record.user : null,
    record.result && typeof record.result === 'object' && !Array.isArray(record.result) ? record.result : null,
    record.item && typeof record.item === 'object' ? record.item : null
  ].filter(Boolean);

  let cognitoUserId = null;
  let izteachStudentId = null;
  let status = null;
  let rawId = null;

  // Ưu tiên trường UUID của Cognito (dynamoId, userId, cognitoUserId, sub), tuyệt đối không nhầm _id 24-hex của CRM với Cognito UUID
  const uuidCandidateFields = ['dynamoId', 'userId', 'cognitoUserId', 'cognito_user_id', 'sub', 'cognitoSub', 'id'];
  for (const obj of nestedObjects) {
    if (!status && typeof obj.status === 'string' && obj.status.trim()) {
      status = obj.status.trim();
    }
    if (!rawId && (obj._id || obj.id || obj.studentId)) {
      rawId = String(obj._id || obj.id || obj.studentId).trim();
    }
    if (!izteachStudentId) {
      if (obj._id && !isValidCognitoUuid(obj._id)) {
        izteachStudentId = String(obj._id).trim();
      } else if (obj.studentId && !isValidCognitoUuid(obj.studentId)) {
        izteachStudentId = String(obj.studentId).trim();
      } else if (obj.id && !isValidCognitoUuid(obj.id)) {
        izteachStudentId = String(obj.id).trim();
      }
    }
    if (!cognitoUserId) {
      for (const field of uuidCandidateFields) {
        const val = obj[field];
        if (isValidCognitoUuid(val)) {
          cognitoUserId = String(val).trim();
          break;
        }
      }
    }
  }

  if (!izteachStudentId && rawId && !isValidCognitoUuid(rawId)) {
    izteachStudentId = rawId;
  }

  return { cognitoUserId, izteachStudentId, status, rawId };
}

function describeIzTeachResponseShape(payload) {
  if (payload === null || payload === undefined) return 'null';
  if (Array.isArray(payload)) {
    const first = payload[0];
    const firstKeys = (first && typeof first === 'object') ? Object.keys(first).slice(0, 10).join(',') : typeof first;
    return `Array(${payload.length})[${firstKeys}]`;
  }
  if (typeof payload !== 'object') return typeof payload;
  const topKeys = Object.keys(payload).slice(0, 12);
  const subDesc = topKeys.map(k => {
    const v = payload[k];
    if (Array.isArray(v)) return `${k}:Array(${v.length})`;
    if (v && typeof v === 'object') return `${k}:{${Object.keys(v).slice(0, 8).join(',')}}`;
    return k;
  });
  return `{${subDesc.join(',')}}`;
}

function normalizeIzTeachPhone(rawPhone, email = '') {
  let digits = String(rawPhone || '').replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length === 11) {
    digits = '0' + digits.slice(2);
  } else if (digits.length === 9 && /^[35789]/.test(digits)) {
    digits = '0' + digits;
  }
  if (/^0[35789]\d{8}$/.test(digits)) {
    return digits;
  }
  return deriveDeterministicFallbackPhone(email, 0);
}

function deriveDeterministicFallbackPhone(email = '', attempt = 1) {
  const seed = `${normalizeEmail(email)}|crm-phone|${attempt}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const prefixes = ['09', '03', '07', '08', '05'];
  const prefix = prefixes[(hash + attempt) % prefixes.length];
  const eightDigits = String(10000000 + (hash % 90000000)).padStart(8, '0').slice(0, 8);
  return prefix + eightDigits;
}

async function provisionStudentOnIzTeach(env, order) {
  const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
  let adminToken = await getIzTeachAdminToken(env);
  if (!adminToken) {
    return { ok: false, error: 'Chưa cấu hình mật khẩu IZTEACH_ADMIN_PASSWORD trong Cloudflare Worker Secret.' };
  }

  const email = normalizeEmail(order.student_email || order.studentEmail || order.email);
  if (!email || !email.includes('@')) {
    return { ok: false, error: 'Email học viên không hợp lệ khi khởi tạo trên izTeach.' };
  }
  const name = String(order.student_name || order.studentName || order.name || email.split('@')[0]).trim();
  const rawPhone = String(order.phone || '').trim();
  const crmPhone = normalizeIzTeachPhone(rawPhone, email);
  const targetCourseIds = order.skipCourses ? [] : resolveOrderCourseIds(order);
  const deterministicPwd = await deriveDeterministicInitialPassword(
    env,
    order.operationId || ('PROV-EMAIL:' + email),
    email
  );
  const candidatePassword = String(order.initialPassword || order.password || deterministicPwd).trim();
  const defaultPassB64 = btoa(unescape(encodeURIComponent(candidatePassword)));

  let cognitoUserId = isValidCognitoUuid(order.cognito_user_id || order.cognitoUserId)
    ? String(order.cognito_user_id || order.cognitoUserId).trim()
    : null;
  let izteachStudentId = order.izteach_student_id || order.izteachStudentId || null;
  let accountCreated = Boolean(order.preserveAccountCreated && isValidCognitoUuid(cognitoUserId));
  let existingAccount = !accountCreated && isValidCognitoUuid(cognitoUserId);
  let crmAccountStatus = null;
  let createHttpStatus = null;
  let createResponseShape = null;
  let createErrorDetail = null;
  let reconciledExisting = false;

  const queryStudentCrmByEmail = async (includeVendor = true) => {
    const qs = includeVendor
      ? `vendorId=${encodeURIComponent(vendorId)}&email=${encodeURIComponent(email)}`
      : `email=${encodeURIComponent(email)}`;
    const url = `${IZTEACH_ENDPOINTS.studentCrm}?${qs}`;
    let qRes = await fetch(url, {
      headers: { Authorization: adminToken }
    });
    if ((qRes.status === 401 || qRes.status === 403) && env.IZTEACH_ADMIN_PASSWORD) {
      const refreshed = await getIzTeachAdminToken(env, true);
      if (refreshed) {
        adminToken = refreshed;
        qRes = await fetch(url, {
          headers: { Authorization: adminToken }
        });
      }
    }
    if (!qRes.ok) {
      return { ok: false, httpStatus: qRes.status, found: null, identity: null, responseShape: `HTTP_${qRes.status}` };
    }
    const qData = await qRes.json().catch(() => null);
    const shape = describeIzTeachResponseShape(qData);
    const list = extractIzTeachStudentRecords(qData);
    let found = list.find(u => {
      const recEmail = normalizeEmail(u?.email || u?.user?.email || u?.student?.email || '');
      return recEmail === email;
    });
    if (!found && list.length === 1 && !list[0]?.email && !list[0]?.user?.email) {
      found = list[0];
    }
    return {
      ok: true,
      httpStatus: qRes.status,
      found: found || null,
      identity: found ? extractIdentityFromIzTeachRecord(found) : null,
      responseShape: shape
    };
  };

  // Tầng 1: Tra cứu học viên hiện có trên izTeach CRM bằng email chuẩn hóa và đúng vendorId
  let foundInInitialLookup = false;
  if (!isValidCognitoUuid(cognitoUserId)) {
    cognitoUserId = null;
    try {
      const lookup1 = await queryStudentCrmByEmail(true);
      if (lookup1.found && lookup1.identity) {
        foundInInitialLookup = true;
        izteachStudentId = lookup1.identity.izteachStudentId || izteachStudentId;
        crmAccountStatus = lookup1.identity.status || crmAccountStatus;
        if (isValidCognitoUuid(lookup1.identity.cognitoUserId)) {
          cognitoUserId = lookup1.identity.cognitoUserId;
          if (order.preserveAccountCreated) {
            accountCreated = true;
            existingAccount = false;
          } else {
            existingAccount = true;
            accountCreated = false;
          }
        }
      }
      // Nếu CRM trả về bản ghi cho đúng email nhưng thiếu trường UUID trên bản ghi danh sách, đối chiếu thêm hồ sơ Supabase của đúng email đó
      if (foundInInitialLookup && !isValidCognitoUuid(cognitoUserId)) {
        const sbCheck = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(email)}&limit=1`).catch(() => null);
        const sbRow = (sbCheck && sbCheck.ok && Array.isArray(sbCheck.data) && sbCheck.data[0]) ? sbCheck.data[0] : null;
        if (sbRow && normalizeEmail(sbRow.email) === email && isValidCognitoUuid(sbRow.cognito_user_id)) {
          cognitoUserId = String(sbRow.cognito_user_id).trim();
          izteachStudentId = izteachStudentId || sbRow.izteach_student_id || null;
          existingAccount = !order.preserveAccountCreated;
          accountCreated = Boolean(order.preserveAccountCreated);
        }
      }
    } catch {}
  }

  // Tầng 2: Tạo mới học viên trên izTeach nếu chưa có (chỉ tạo đúng 1 tài khoản; tự xử lý nếu trùng SĐT phụ huynh trên CRM)
  let attemptedCreate = false;
  if (!isValidCognitoUuid(cognitoUserId)) {
    attemptedCreate = true;
    try {
      let createRes = null;
      let cData = null;
      let rawCreateText = '';
      let errMsg = '';

      for (let phoneAttempt = 0; phoneAttempt <= 2; phoneAttempt++) {
        const phoneForCrm = phoneAttempt === 0
          ? crmPhone
          : deriveDeterministicFallbackPhone(email, phoneAttempt);

        createRes = await fetch(IZTEACH_ENDPOINTS.studentCrm, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: adminToken },
          body: JSON.stringify({
            vendorId,
            name,
            email,
            phone: phoneForCrm,
            password: defaultPassB64,
            status: 'verified'
          })
        });

        if ((createRes.status === 401 || createRes.status === 403) && phoneAttempt === 0 && env.IZTEACH_ADMIN_PASSWORD) {
          const refreshed = await getIzTeachAdminToken(env, true);
          if (refreshed) {
            adminToken = refreshed;
            createRes = await fetch(IZTEACH_ENDPOINTS.studentCrm, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: adminToken },
              body: JSON.stringify({
                vendorId,
                name,
                email,
                phone: phoneForCrm,
                password: defaultPassB64,
                status: 'verified'
              })
            });
          }
        }

        rawCreateText = await createRes.text().catch(() => '');
        try {
          cData = rawCreateText ? JSON.parse(rawCreateText) : null;
        } catch {
          cData = null;
        }
        createHttpStatus = createRes.status;
        createResponseShape = describeIzTeachResponseShape(cData ?? rawCreateText);
        errMsg = String(cData?.data || cData?.message || cData?.error || rawCreateText || '').trim();

        // Nếu izTeach báo "Số điện thoại đã tồn tại trong hệ thống" (phụ huynh đăng ký con thứ 2 hoặc đổi email),
        // tự động thử lại POST với SĐT dự phòng cho CRM izTeach, trong khi vẫn giữ nguyên SĐT thật trên KTN/Supabase.
        const isPhoneDuplicateError = !createRes.ok &&
          /(số\s*điện\s*thoại|điện\s*thoại|phone).*(tồn\s*tại|exist|duplicate|taken|used)/i.test(errMsg);
        if (isPhoneDuplicateError && phoneAttempt < 2) {
          continue;
        }
        break;
      }

      const isAlreadyExistsConflict = createRes &&
        !createRes.ok &&
        (
          createRes.status === 409 ||
          /(email|tài\s*khoản|account|user).*(tồn\s*tại|exist|duplicate|taken)|already\s*exist|is\s*existed/i.test(errMsg)
        );

      if (createRes && createRes.ok) {
        accountCreated = !foundInInitialLookup;
        existingAccount = Boolean(foundInInitialLookup);
        const createdIdentity = extractIdentityFromIzTeachRecord(cData);
        if (createdIdentity.izteachStudentId) {
          izteachStudentId = createdIdentity.izteachStudentId;
        }
        if (createdIdentity.status) {
          crmAccountStatus = createdIdentity.status;
        }
        if (isValidCognitoUuid(createdIdentity.cognitoUserId)) {
          cognitoUserId = createdIdentity.cognitoUserId;
        }

        // Bước 4: Nếu POST trả 200/201 thành công nhưng phản hồi chưa kèm Cognito UUID (chỉ trả _id hoặc rỗng), tra cứu lại ngay tài khoản vừa tạo
        if (!isValidCognitoUuid(cognitoUserId)) {
          const postCreateLookup = await queryStudentCrmByEmail(true);
          if (postCreateLookup.identity) {
            izteachStudentId = postCreateLookup.identity.izteachStudentId || izteachStudentId;
            crmAccountStatus = postCreateLookup.identity.status || crmAccountStatus;
            if (isValidCognitoUuid(postCreateLookup.identity.cognitoUserId)) {
              cognitoUserId = postCreateLookup.identity.cognitoUserId;
            }
          }
          if (!isValidCognitoUuid(cognitoUserId)) {
            const postCreateGlobal = await queryStudentCrmByEmail(false);
            if (postCreateGlobal.identity) {
              izteachStudentId = postCreateGlobal.identity.izteachStudentId || izteachStudentId;
              crmAccountStatus = postCreateGlobal.identity.status || crmAccountStatus;
              if (isValidCognitoUuid(postCreateGlobal.identity.cognitoUserId)) {
                cognitoUserId = postCreateGlobal.identity.cognitoUserId;
              }
            }
          }
        }
      } else if (isAlreadyExistsConflict) {
        // Bước 5: Gặp tài khoản đã tồn tại (409 hoặc báo trùng email) -> chuyển sang luồng đối soát thay vì tạo trùng
        reconciledExisting = true;
        accountCreated = Boolean(order.preserveAccountCreated);
        existingAccount = !accountCreated;

        const conflictIdentity = extractIdentityFromIzTeachRecord(cData);
        if (conflictIdentity.izteachStudentId) {
          izteachStudentId = conflictIdentity.izteachStudentId;
        }
        if (isValidCognitoUuid(conflictIdentity.cognitoUserId)) {
          cognitoUserId = conflictIdentity.cognitoUserId;
        }

        if (!isValidCognitoUuid(cognitoUserId)) {
          const recLookup = await queryStudentCrmByEmail(true);
          if (recLookup.identity) {
            izteachStudentId = recLookup.identity.izteachStudentId || izteachStudentId;
            crmAccountStatus = recLookup.identity.status || crmAccountStatus;
            if (isValidCognitoUuid(recLookup.identity.cognitoUserId)) {
              cognitoUserId = recLookup.identity.cognitoUserId;
            }
          }
        }
        if (!isValidCognitoUuid(cognitoUserId)) {
          const recGlobal = await queryStudentCrmByEmail(false);
          if (recGlobal.identity) {
            izteachStudentId = recGlobal.identity.izteachStudentId || izteachStudentId;
            crmAccountStatus = recGlobal.identity.status || crmAccountStatus;
            if (isValidCognitoUuid(recGlobal.identity.cognitoUserId)) {
              cognitoUserId = recGlobal.identity.cognitoUserId;
            }
          }
        }
        if (!isValidCognitoUuid(cognitoUserId)) {
          const sbLookup = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(email)}&limit=1`).catch(() => null);
          const sbRow = (sbLookup && sbLookup.ok && Array.isArray(sbLookup.data) && sbLookup.data[0]) ? sbLookup.data[0] : null;
          if (sbRow && normalizeEmail(sbRow.email) === email && isValidCognitoUuid(sbRow.cognito_user_id)) {
            cognitoUserId = String(sbRow.cognito_user_id).trim();
            izteachStudentId = izteachStudentId || sbRow.izteach_student_id || null;
          }
        }
      } else if (createRes) {
        createErrorDetail = `HTTP ${createRes.status}${errMsg ? ': ' + errMsg.slice(0, 160) : ''}`;
      }
    } catch (createErr) {
      createErrorDetail = createErr?.message || 'CRM_CREATE_NETWORK_ERROR';
    }
  }

  // Tầng 3: Sign-in Probe (chỉ dùng làm bước dự phòng bổ trợ khi CRM chưa trả về Cognito UUID)
  if (!isValidCognitoUuid(cognitoUserId)) {
    try {
      const siRes = await fetch(IZTEACH_ENDPOINTS.studentSignin, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ol-vendor-id': vendorId,
          'ol-client-id': vendorId
        },
        body: JSON.stringify({ email, password: defaultPassB64, vendorId })
      });
      const siData = await siRes.json().catch(() => null);
      if (siRes.ok && siData) {
        const siIdentity = extractIdentityFromIzTeachRecord(siData);
        if (isValidCognitoUuid(siIdentity.cognitoUserId)) {
          cognitoUserId = siIdentity.cognitoUserId;
        }
        izteachStudentId = siData.studentId || siIdentity.izteachStudentId || izteachStudentId;
        if (isValidCognitoUuid(cognitoUserId)) {
          if ((attemptedCreate && !reconciledExisting && !foundInInitialLookup) || order.preserveAccountCreated) {
            accountCreated = true;
            existingAccount = false;
          } else {
            existingAccount = true;
            accountCreated = false;
          }
        }
      }
    } catch {}
  }

  if (!isValidCognitoUuid(cognitoUserId)) {
    const detailedReason = createErrorDetail
      ? `Không lấy được Cognito UUID từ izTeach cho email ${email} (${createErrorDetail})`
      : `Không lấy được Cognito UUID từ izTeach cho email ${email}`;
    return {
      ok: false,
      failedStep: 'izteach_account_provision',
      httpStatus: createHttpStatus && createHttpStatus >= 400 ? createHttpStatus : 502,
      izteachCreateStatus: createHttpStatus,
      izteachResponseShape: createResponseShape,
      error: detailedReason
    };
  }

  // Tầng 3.5: Đọc các khóa học hiện có của học viên trên izTeach để cộng dồn (không ghi đè khóa cũ)
  let existingIzCourseIds = [];
  try {
    const permRes = await fetch(`${IZTEACH_ENDPOINTS.userPermission}?userId=${encodeURIComponent(cognitoUserId)}&vendorId=${encodeURIComponent(vendorId)}`, {
      headers: { Authorization: adminToken }
    });
    if (permRes.ok) {
      const permData = await permRes.json().catch(() => null);
      existingIzCourseIds = extractIzTeachOnlineCourseIds(permData);
    }
  } catch {}

  const missingCourseIds = filterMissingCourses(existingIzCourseIds, targetCourseIds);

  // Tầng 4: Cấp quyền mở thêm các khóa học còn thiếu trên izTeach (PUT /user-permission/add-products/:userId)
  if (missingCourseIds.length > 0) {
    const grantRes = await fetch(`${IZTEACH_ENDPOINTS.userPermission}/add-products/${encodeURIComponent(cognitoUserId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify({
        vendorId,
        userId: cognitoUserId,
        productIds: missingCourseIds,
        productType: 'online-course'
      })
    });

    if (!grantRes.ok) {
      const errTxt = await grantRes.text().catch(() => '');
      if (!/is existed/i.test(errTxt)) {
        return {
          ok: false,
          failedStep: 'izteach_permissions',
          error: 'Lỗi cấp quyền khóa học izTeach: ' + errTxt,
          cognitoUserId,
          izteachStudentId,
          accountCreated,
          existingAccount
        };
      }
    }
  }

  // Tầng 4.5: Nếu ở chế độ đối soát tuyệt đối (replaceCourses: true), thu hồi các khóa học đã bỏ chọn trên izTeach
  let coursesToRemove = [];
  if (order.replaceCourses === true) {
    const targetSet = new Set(targetCourseIds.map(id => String(id || '').trim()).filter(Boolean));
    coursesToRemove = existingIzCourseIds.filter(cid => cid && !targetSet.has(cid));
    if (coursesToRemove.length > 0) {
      const remRes = await fetch(`${IZTEACH_ENDPOINTS.userPermission}/remove-products/${encodeURIComponent(cognitoUserId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: adminToken },
        body: JSON.stringify({
          vendorId,
          userId: cognitoUserId,
          productIds: coursesToRemove,
          productType: 'online-course'
        })
      }).catch(e => ({ ok: false, status: 503, _err: e }));
      if (!remRes || !remRes.ok) {
        const errTxt = remRes && typeof remRes.text === 'function' ? await remRes.text().catch(() => '') : (remRes?._err?.message || 'NETWORK_ERROR');
        return { ok: false, error: 'Lỗi thu hồi khóa học cũ trên izTeach khi đối soát: ' + (errTxt || ('HTTP ' + (remRes?.status || 503))), cognitoUserId, accountCreated, existingAccount };
      }
    }
  }

  // Tầng 5: Xác minh sau cập nhật (Read-After-Write Verification) trực tiếp trên izTeach user-permission
  let verifiedIzCourseIds = order.replaceCourses === true
    ? Array.from(new Set(targetCourseIds))
    : Array.from(new Set([...existingIzCourseIds, ...targetCourseIds]));
  if (missingCourseIds.length > 0 || coursesToRemove.length > 0) {
    try {
      const verifyRes = await fetch(`${IZTEACH_ENDPOINTS.userPermission}?userId=${encodeURIComponent(cognitoUserId)}&vendorId=${encodeURIComponent(vendorId)}`, {
        headers: { Authorization: adminToken }
      });
      if (!verifyRes.ok) {
        return { ok: false, error: 'Không xác minh được quyền khóa học trên izTeach sau cập nhật (HTTP ' + verifyRes.status + ')', cognitoUserId, accountCreated, existingAccount };
      }
      const verifyData = await verifyRes.json().catch(() => null);
      if (verifyData && typeof verifyData === 'object') {
        verifiedIzCourseIds = extractIzTeachOnlineCourseIds(verifyData);
        const verifiedSet = new Set(verifiedIzCourseIds);
        const stillMissing = targetCourseIds.filter(cid => cid && !verifiedSet.has(cid));
        if (stillMissing.length > 0) {
          return { ok: false, error: 'izTeach chưa xác nhận cấp khóa học: ' + stillMissing.join(', '), cognitoUserId, accountCreated, existingAccount };
        }
        if (order.replaceCourses === true && coursesToRemove.length > 0) {
          const stillPresent = coursesToRemove.filter(cid => verifiedSet.has(cid));
          if (stillPresent.length > 0) {
            return { ok: false, error: 'izTeach chưa xác nhận thu hồi khóa học: ' + stillPresent.join(', '), cognitoUserId, accountCreated, existingAccount };
          }
        }
      }
    } catch (verifyErr) {
      return { ok: false, error: 'Lỗi xác minh quyền khóa học trên izTeach: ' + (verifyErr?.message || 'NETWORK_ERROR'), cognitoUserId, accountCreated, existingAccount };
    }
  }

  // BUG BE-02 Fix: Chỉ trả mật khẩu khởi tạo 1 lần khi thực sự vừa tạo tài khoản mới trên izTeach.
  // Nếu tài khoản đã tồn tại từ trước (existingAccount=true), không bao giờ sinh mật khẩu giả khác với mật khẩu đang dùng.
  const oneTimeInitialPassword = accountCreated ? candidatePassword : null;
  const credentialMode = accountCreated ? 'new_account_initial_password' : 'existing_account_unchanged';

  return {
    ok: true,
    verified: true,
    cognitoUserId,
    izteachStudentId,
    email,
    name,
    crmAccountStatus: crmAccountStatus || 'verified',
    izteachCreateStatus: createHttpStatus,
    izteachResponseShape: createResponseShape,
    accountCreated,
    existingAccount: !accountCreated && Boolean(existingAccount),
    credentialMode,
    initialPassword: oneTimeInitialPassword,
    courseId: targetCourseIds[0] || (order.skipCourses ? null : DEFAULT_COURSE_ID),
    grantedCourseIds: targetCourseIds,
    allCourseIds: verifiedIzCourseIds
  };
}

/**
 * Thu hồi khóa học trực tiếp trên izTeach (PUT /user-permission/remove-products/:cognitoUserId)
 * Không bao giờ coi skipped: true là thành công; bắt buộc xác minh sau khi thu hồi.
 */
async function revokeStudentCoursesOnIzTeach(env, { email, cognitoUserId, removeCourseIds = [] }) {
  const cleanIds = Array.from(new Set((Array.isArray(removeCourseIds) ? removeCourseIds : []).map(id => String(id || '').trim()).filter(Boolean)));
  if (cleanIds.length === 0) return { ok: true, verified: true, removedCourseIds: [] };
  const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
  const adminToken = await getIzTeachAdminToken(env);
  if (!adminToken) return { ok: false, skipped: false, reason: 'NO_ADMIN_TOKEN', error: 'Missing izTeach admin token' };

  let resolvedUid = isValidCognitoUuid(cognitoUserId) ? cognitoUserId : null;
  const cleanEmail = normalizeEmail(email);

  if (!resolvedUid && cleanEmail) {
    const stuLookup = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(cleanEmail)}&limit=1`);
    const existingRow = (stuLookup.ok && Array.isArray(stuLookup.data) && stuLookup.data[0]) || null;
    if (isValidCognitoUuid(existingRow?.cognito_user_id)) {
      resolvedUid = existingRow.cognito_user_id;
    }
  }

  if (!resolvedUid && cleanEmail) {
    try {
      const qRes = await fetch(`${IZTEACH_ENDPOINTS.studentCrm}?vendorId=${encodeURIComponent(vendorId)}&email=${encodeURIComponent(cleanEmail)}`, {
        headers: { Authorization: adminToken }
      });
      if (qRes.ok) {
        const qData = await qRes.json().catch(() => null);
        const list = extractIzTeachStudentRecords(qData);
        const found = list.find(u => normalizeEmail(u?.email || u?.user?.email) === cleanEmail);
        if (found) {
          const identity = extractIdentityFromIzTeachRecord(found);
          if (isValidCognitoUuid(identity.cognitoUserId)) resolvedUid = identity.cognitoUserId;
        }
      }
    } catch {}
  }

  if (!resolvedUid) {
    return {
      ok: false,
      skipped: false,
      reason: 'NO_COGNITO_UID',
      error: 'Không tìm thấy Cognito UUID trên izTeach cho học viên ' + (cleanEmail || '')
    };
  }

  try {
    const revRes = await fetch(`${IZTEACH_ENDPOINTS.userPermission}/remove-products/${encodeURIComponent(resolvedUid)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify({
        vendorId,
        userId: resolvedUid,
        productIds: cleanIds,
        productType: 'online-course'
      })
    });
    if (!revRes.ok) {
      const errTxt = await revRes.text().catch(() => '');
      return { ok: false, skipped: false, status: revRes.status, reason: 'IZTEACH_HTTP_' + revRes.status, error: errTxt || ('HTTP ' + revRes.status), cognitoUserId: resolvedUid };
    }

    // Xác minh sau thu hồi (Read-After-Write Verification) trên izTeach user-permission
    const verifyRes = await fetch(`${IZTEACH_ENDPOINTS.userPermission}?userId=${encodeURIComponent(resolvedUid)}&vendorId=${encodeURIComponent(vendorId)}`, {
      headers: { Authorization: adminToken }
    });
    if (!verifyRes.ok) {
      return {
        ok: false,
        skipped: false,
        status: verifyRes.status,
        reason: 'VERIFY_FAILED',
        error: 'Không thể xác minh trạng thái thu hồi khóa học trên izTeach (HTTP ' + verifyRes.status + ')',
        cognitoUserId: resolvedUid
      };
    }
    const verifyData = await verifyRes.json().catch(() => null);
    const remainingIds = extractIzTeachOnlineCourseIds(verifyData);
    const remainingSet = new Set(remainingIds);
    const stillPresent = cleanIds.filter(cid => remainingSet.has(cid));
    if (stillPresent.length > 0) {
      return {
        ok: false,
        skipped: false,
        reason: 'REVOKE_VERIFICATION_MISMATCH',
        error: 'izTeach vẫn còn giữ khóa học sau lệnh thu hồi: ' + stillPresent.join(', '),
        cognitoUserId: resolvedUid,
        remainingCourseIds: remainingIds
      };
    }

    return {
      ok: true,
      verified: true,
      skipped: false,
      cognitoUserId: resolvedUid,
      removedCourseIds: cleanIds,
      remainingCourseIds: remainingIds
    };
  } catch (err) {
    return { ok: false, skipped: false, reason: 'REVOKE_ERROR', error: err?.message || 'REVOKE_ERROR', cognitoUserId: resolvedUid };
  }
}

const COURSE_UNIT_MAP = {
  '6adadba969897b0002482ca5': { 1: '6adadbcaf75fe5000247ca71', 2: '6adadc3b69897b0002482d22', 3: '6adae08769897b000248340a', 4: '6adf1b51e2681300028de363', 5: '6adf1fade5b2290002718df9', 6: '6adf22e9e5b22900027199e7', 7: '6adf3578b3cfe60002ab5a55', 8: '6adf3707b3cfe60002ab5fd6', 9: '6ae52ef17b101100026bb5d7', 10: '6ae546eaa1908400020410e3', 11: '6ae54a51fab31400021bee3b', 12: '6ae54f37a1908400020426c9', 13: '6ae550b3a190840002042a62', 14: '6ae558d7fab31400021c1676', 15: '6ae56d92b734640002ce863a', 16: '6adf21c2e2681300028dfa46', 17: '6ae56c9db734640002ce8446' },
  '678d14b960eae20002ddf8fe': { 1: '678d14ef83903000028fb716', 2: '67bbd7167e21a900021ce2ce', 3: '67bbd7187e21a900021ce2e1', 4: '67bbd7197e21a900021ce2e8', 5: '67bbd7237e21a900021ce2fe', 6: '67bbd7247e21a900021ce302', 7: '67bbd7267e21a900021ce30f', 8: '67bbd728f0b1030002fa0e2f', 9: '67bbd729f0b1030002fa0e34', 10: '67bbd72af0b1030002fa0e39', 11: '67bbd72cf0b1030002fa0e40', 12: '67bbd72ef0b1030002fa0e59', 13: '67bbd730f0b1030002fa0e5e', 14: '67bbd731f0b1030002fa0e62', 15: '67bbd732f0b1030002fa0e69', 16: '67bbd735f0b1030002fa0e6e' },
  '65e7704a9ea90c00080d5195': { 1: '663e2cb2f960e80008fb905a', 2: '663e2cb3ef5f220008fee283', 3: '663e2cb6d87762000820b409', 4: '663e2cb8d87762000820b40c', 5: '663e2cba501e8b00082e04d9', 6: '663e2cbcf6e78b000877efb4', 7: '663e2cbf0710270008948856', 8: '663e2cc1501e8b00082e04eb', 9: '663e2cc3071027000894885d', 10: '663e2cc60710270008948862', 11: '663e2cc90710270008948867', 12: '663e2ccb501e8b00082e04f5', 13: '663e2ccd071027000894887c', 14: '663e2ccf501e8b00082e04fa', 15: '663e2cd2f6e78b000877efba', 16: '663e2cd4501e8b00082e0502', 17: '663e2cd6501e8b00082e0505', 18: '663e2cd807102700089488c2', 19: '663e2cdaf6e78b000877efe1', 20: '663e2cdced505f0008ed1f31' },
  '6638bd09a7367400085c7ab2': { 1: '6638bd156090c200087ed9d4', 2: '6638bd156090c200087ed9d0', 3: '6638bd146090c200087ed9cc', 4: '6638bd14a7367400085c7abc', 5: '6638bd136090c200087ed9c2', 6: '6638bd126090c200087ed9be', 7: '6638bd126090c200087ed9ba', 8: '6638bd126090c200087ed9b6', 9: '6638bd116090c200087ed9b2', 10: '6638bd116090c200087ed9ae', 11: '6638bd106090c200087ed9aa', 12: '6638bd106090c200087ed9a6', 13: '6638bd0f6090c200087ed9a2', 14: '6638bd0f6090c200087ed99e', 15: '6638bd0e6090c200087ed99a', 16: '6638bd0e6090c200087ed996', 17: '6638bd0d6090c200087ed992', 18: '6638bd0d6090c200087ed98d', 19: '6638bd0c6090c200087ed989', 20: '6638bd0c6090c200087ed985' },
  '65e76a533f5e7c00086715d7': { 1: '65e8bfe290ed4a0008fe87aa', 2: '65e8c00e90ed4a0008fe87b8', 3: '65e8c02b90ed4a0008fe87c2', 4: '65e8c03990ed4a0008fe87c9', 5: '65e8c04590ed4a0008fe87d1', 6: '65e8c05390ed4a0008fe87db', 7: '65e8c05d90ed4a0008fe87e1', 8: '65e8c06690ed4a0008fe87e7', 9: '65f6d4deaf683f0008c040f1', 10: '65e8c070fcfcaf0008525490', 11: '65e8c086d3b8e900089c49a4', 12: '65e8c090d3b8e900089c49ae', 13: '65e8c099d3b8e900089c49b4', 14: '65e8c0a3fcfcaf000852549e', 15: '65e8c0add3b8e900089c49ca', 16: '65e8c0b7d3b8e900089c49d1', 17: '65e8c0cafcfcaf00085254a8', 18: '65e8c0d4fcfcaf00085254af', 19: '65e8c0defcfcaf00085254b7', 20: '69230bd3bafc0800020a6860' },
  '67a869302ecb9c000257d966': { 1: '67a86940e7d5cf000204abf3', 2: '67a86941e7d5cf000204abf8', 3: '67a869432ecb9c000257d99a', 4: '67a869442ecb9c000257d99f', 5: '67a869462ecb9c000257d9a8', 6: '67a869482ecb9c000257d9ad', 7: '67a86949e7d5cf000204ac68', 8: '67a8694b2ecb9c000257d9b4', 9: '67a8694de7d5cf000204ac79', 10: '67a8694ee7d5cf000204ac7e', 11: '67a869502ecb9c000257d9be', 12: '67a86951e7d5cf000204ac8c', 13: '67a86953e7d5cf000204ac96', 14: '67a86955e7d5cf000204ac9f', 15: '67a869572ecb9c000257d9d3', 16: '67a86959e570870002de0282', 17: '67a8695b2ecb9c000257d9ea', 18: '67a8695ee7d5cf000204acb5', 19: '67a86960e7d5cf000204acc3', 20: '67a86962e7d5cf000204accf' },
  '67a7290a5fdc26000238b4e9': { 1: '67a729145fdc26000238b517', 2: '67a729d74be3170002dfb3cc', 3: '67a72a294be3170002dfb432', 4: '67a72a2b4be3170002dfb43d', 5: '67a72a2c4be3170002dfb447', 6: '67a72a2d5fdc26000238b725', 7: '67a72a2e5fdc26000238b737', 8: '67a72a305fdc26000238b73f', 9: '67a72a325fdc26000238b749', 10: '67a72a334be3170002dfb462', 11: '67a72a354be3170002dfb466', 12: '67a72a364be3170002dfb46a', 13: '67a72a384be3170002dfb472', 14: '67a72a394be3170002dfb476', 15: '67a72a3b4be3170002dfb47b', 16: '67a72a3d4be3170002dfb484', 17: '67a72a3e4be3170002dfb489', 18: '67a72a404be3170002dfb48d', 19: '67a72a424be3170002dfb494', 20: '67a72a434be3170002dfb498' },
  '65e769bd637339000870618f': { 1: '6607ce6f21dc710008875026', 2: '6607ce7921dc71000887503f', 3: '6607ce7b21dc710008875048', 4: '6607ce7eb00d8d00089262f1', 5: '6607d0df8b279e00081a54c8', 6: '6607d1a283e588000871ab9d', 7: '6607d19ce4925800089d37db', 8: '6607d1a3380b740008b3c779', 9: '6607d1a583e588000871aba6', 10: '6607d1a883e588000871abab', 11: '6607d2fbdacfda000857bafe', 12: '6607d3ba83e588000871ae8b', 13: '6607d3c783e588000871aea2', 14: '6607d3d683e588000871aead', 15: '6607d3e783e588000871aed4', 16: '6607d3f08b279e00081a5894', 17: '6607d3fe8b279e00081a5911', 18: '6607d405dacfda000857bc26', 19: '6607d417dacfda000857bc46', 20: '6607d41fdacfda000857bc54', 21: '6607d4318b279e00081a5947', 22: '6607d4438b279e00081a5985', 23: '6607d43b8b279e00081a5972', 24: '6607d4578b279e00081a5991', 25: '6607d473dacfda000857bd0d' },
  '66028938bfd6c90008b816e1': { 1: '66028942bfd6c90008b8172f', 2: '66028942bfd6c90008b8172c', 3: '66028942bfd6c90008b8172a', 4: '66028941bfd6c90008b81728', 5: '660289416be3ad000881bd3d', 6: '660289406be3ad000881bd3b', 7: '660289406be3ad000881bd39', 8: '660289406be3ad000881bd37', 9: '6602893fbfd6c90008b8170f', 10: '6602893fbfd6c90008b8170d', 11: '6602893fbfd6c90008b8170b', 12: '6602893fbfd6c90008b81708', 13: '6602893fbfd6c90008b81706', 14: '6602893ebfd6c90008b81704', 15: '6602893ebfd6c90008b81702', 16: '6602893ebfd6c90008b81700', 17: '6602893ebfd6c90008b816fc', 18: '6602893ebfd6c90008b816fe', 19: '6602893dbfd6c90008b816fa', 20: '6602893dbfd6c90008b816f8' },
  '65e7636a0a1b61000825c2ef': { 1: '66151e91edf4a8000831d55c', 2: '66151e9340e05d00084ef497', 3: '66151e95159f810008a94f95', 4: '66151e9f32008f0008b9a45e', 5: '66151ee3d226ed0008a4de6f', 6: '66151ee529101d00087a7e42', 7: '66151ef0159f810008a94fd8', 8: '66151ef232008f0008b9a47e', 9: '66151ef4d226ed0008a4de77', 10: '66151efb32008f0008b9a492', 11: '66151efc32008f0008b9a497', 12: '66151efe159f810008a94fe1', 13: '66151f0132008f0008b9a4b3', 14: '66151f02d226ed0008a4de8d', 15: '66151f04d226ed0008a4de94', 16: '66151f0732008f0008b9a4b8', 17: '66151f0932008f0008b9a4c0', 18: '66151f0ad226ed0008a4dea7', 19: '66151f0d32008f0008b9a4c2', 20: '66151f0f29101d00087a7e48' },
  '6600fa477c18b80008c53c88': { 1: '661a40df8b116f00081e5907', 2: '661a40f0deefc7000889f048', 3: '661a413df4a2b80008a9ba4a', 4: '661a413ef4a2b80008a9ba5c', 5: '661a41418b116f00081e5944', 6: '661a4144f4a2b80008a9ba5f', 7: '661a4146f4a2b80008a9ba65', 8: '661a414b8b116f00081e5953', 9: '661a414dba471c00088b6ac8', 10: '661a41508b116f00081e595c', 11: '661a4152f4a2b80008a9ba73', 12: '661a41548b116f00081e5991', 13: '661a41b78b116f00081e5a40', 14: '661a41ba8b116f00081e5a46', 15: '661a41bc8b116f00081e5a4d', 16: '661a41bf8b116f00081e5a53', 17: '661a41c18b116f00081e5a5b', 18: '661a41c4deefc7000889f12b', 19: '661a41c68b116f00081e5a66', 20: '661a41c98b116f00081e5a6d' },
  '6600fa7da2bfe10008834e13': { 1: '66024f93bfeae0000840c495', 2: '66024f95bfeae0000840c49a', 3: '66024f97bfeae0000840c49f', 4: '66024f99bfeae0000840c4a4', 5: '66024f9abfeae0000840c4aa', 6: '66024f9cbfeae0000840c4af', 7: '66024f9ebfeae0000840c4b4', 8: '66024f9f8fe62f0008deb5f1', 9: '66024fa1bfeae0000840c4bc', 10: '66024fa3bfeae0000840c4c7', 11: '66024fa58fe62f0008deb5fa', 12: '66024fa78fe62f0008deb600', 13: '66024fa9752cee00085b3a25', 14: '66024fab752cee00085b3a2d', 15: '66024fae752cee00085b3a36', 16: '66024fb18fe62f0008deb606', 17: '66024fb38fe62f0008deb60b', 18: '66024fb7752cee00085b3a45', 19: '66024fb8752cee00085b3a4a', 20: '66024fbb8fe62f0008deb614' },
  '661528ea42af880008944573': { 1: '661528f42c3c210008e6b336', 2: '661528f42c3c210008e6b334', 3: '661528f42c3c210008e6b332', 4: '661528f42c3c210008e6b330', 5: '661528f3f8789400080a4118', 6: '661528f3f8789400080a4116', 7: '661528f3f8789400080a4114', 8: '661528f3f8789400080a4112', 9: '661528f3f8789400080a4110', 10: '661528f2f8789400080a410e', 11: '661528f2b6ac6d0008597d67', 12: '661528f2f8789400080a410c', 13: '661528f142af88000894457d', 14: '661528f02c3c210008e6b32b', 15: '661528f02c3c210008e6b329', 16: '661528f02c3c210008e6b327', 17: '661528ef2c3c210008e6b325', 18: '6638e9108a44d500081e86e7', 19: '661528ef2c3c210008e6b323', 20: '661528ef2c3c210008e6b321' },
  '65e772a1767c56000829518e': { 1: '6607c0f24b876a0008abaf44', 2: '6607c0f5dc20050008a26631', 3: '6607c0fa4b876a0008abaf50', 4: '6607c0fb0f3de50009512e2e', 5: '6607c10f0f3de50009512e52', 6: '6607c1100f3de50009512e58', 7: '6607c1130f3de50009512e60', 8: '6607c1150f3de50009512e65', 9: '6607c118dc20050008a26645', 10: '6607c444dde7ed00080ac105', 11: '6607c452dde7ed00080ac11e', 12: '6607c45fe1beeb0008a7b8fc', 13: '6607c486e1beeb0008a7b91b', 14: '6607c497e1beeb0008a7b956', 15: '6607c4a5e1beeb0008a7b979', 16: '6607c4b94fcf630008747361', 17: '6607c5e2e1beeb0008a7ba80', 18: '6607c603e1beeb0008a7baa6', 19: '6607c6174fcf630008747451', 20: '6607c62da8818d0008df4e49', 21: '6607c639a8818d0008df4e6f', 22: '6607c64fa8818d0008df4e7d', 23: '6607c65ea8818d0008df4ea2', 24: '6607c672a8818d0008df4eb2', 25: '6607c689a8818d0008df4f14' },
  '6638c76dfac274000876cd13': { 1: '6638c78283319a00088e117a', 2: '6638c7813d17360007de7f60', 3: '6638c78183319a00088e1175', 4: '6638c78083319a00088e1171', 5: '6638c77f83319a00088e116d', 6: '6638c77f83319a00088e1168', 7: '6638c77e83319a00088e1164', 8: '6638c77dd0d47e00085fdb46', 9: '6638c77cd0d47e00085fdb42', 10: '6638c77cd0d47e00085fdb3e', 11: '6638c77cd0d47e00085fdb3a', 12: '6638c77bd0d47e00085fdb36', 13: '6638c77bfac274000876cd35', 14: '6638c77ad0d47e00085fdb32', 15: '6638c77afac274000876cd2a', 16: '6638c7793d17360007de7f55', 17: '6638c7793d17360007de7f51', 18: '6638c7783d17360007de7f4d', 19: '6638c7773d17360007de7f47', 20: '6638c7763d17360007de7f41', 21: '6638c776d0d47e00085fdb2c', 22: '6638c7743d17360007de7f38', 23: '6638c773d0d47e00085fdb28', 24: '6638c77154f6eb00082e04c6', 25: '6638c77054f6eb00082e04c1' },
  '65f6d1c722106a0008ff81a3': { 1: '6614c0a823f8f80008b8edd0', 2: '6614c31359e3f70008eb70c5', 3: '6614c5563e5a010009106e88', 4: '6614c891672f5c00089031f3', 5: '6614c9df13ff200008e8856e', 6: '661521b35643be0008808bd3', 7: '661521b5b288f40008d4fbb1', 8: '661521b8b288f40008d4fbb9', 9: '661521ba5643be0008808bdb', 10: '661521bc5643be0008808be1', 11: '661521bf5643be0008808be9', 12: '661521c1b288f40008d4fbbd', 13: '661521c35643be0008808bf6', 14: '661521c55643be0008808bfb', 15: '661521c75643be0008808c00', 16: '661521ca5643be0008808c06', 17: '661521ccb288f40008d4fbc2', 18: '661521ceb288f40008d4fbc8', 19: '661521d05643be0008808c12', 20: '661521d25643be0008808c1d' },
  '65e773c89ea90c00080d52fc': { 1: '66023c4cac192d0008a1befd', 2: '66023de8cb4b7b0008c2f5d9', 3: '660240cb1626fb00080af3d0', 4: '660240cd1626fb00080af3d7', 5: '660240cf1626fb00080af3e0', 6: '660240d01626fb00080af3e5', 7: '660240d21626fb00080af3ed', 8: '660240d41626fb00080af3f2', 9: '660240d61626fb00080af3fa', 10: '660240d81626fb00080af405', 11: '660240dc1626fb00080af40d', 12: '660240de1626fb00080af415', 13: '660240e009e20700084d7a87', 14: '660240e38d79cc0008436752', 15: '660240fc1626fb00080af433', 16: '660240fd1626fb00080af438', 17: '660240ff1626fb00080af43e', 18: '6602410209e20700084d7b57', 19: '6602410509e20700084d7b5c', 20: '6602410609e20700084d7b61' }
};

const HSK1_LEGACY_VIDEO_UNIT_MAP = {
  1: '6adadbcaf75fe5000247ca71',
  2: '6adadc3b69897b0002482d22',
  3: '6adf1a4fe2681300028de082',
  4: '6adf1e12e5b2290002718830',
  5: '6adf2171e5b22900027194df',
  6: '6adf3932e8e0af00026814ef',
  7: '6adf3633b3cfe60002ab5cf4',
  8: '6adf37f61d600a0002d466ae',
  9: '6ae532927b101100026bb9f3',
  10: '6ae547d1a1908400020412fd',
  11: '6ae54abdfab31400021befb0',
  12: '6ae5504aa1908400020429c9',
  13: '6ae550fefab31400021bff7a',
  14: '6ae56b19b734640002ce823d',
  15: '6ae56f7f9902f90002d5ebdc'
};

// Toàn bộ 33 unitIds của HSK 1 (3.0) theo từng bài học (gồm các phần nhỏ 3.1, 3.2, 4.1..4.4, 12.1..12.3 và SBT 1.1/1.2)
const HSK1_LESSON_ALLOWED_UNITS = {
  1: ['6adadbcaf75fe5000247ca71', '6adb27370ae64c00025de049', '6adb30510ae64c00025de0cd'],
  2: ['6adadc3b69897b0002482d22'],
  3: ['6adae08769897b000248340a', '6adf1a4fe2681300028de082'],
  4: ['6adf1b51e2681300028de363', '6adf1c22e2681300028de711', '6adf1c491d600a0002d4010d', '6adf1d00e2681300028de9a6', '6adf1d2be2681300028dea4a', '6adf1e12e5b2290002718830'],
  5: ['6adf1fade5b2290002718df9', '6adf2171e5b22900027194df'],
  6: ['6adf22e9e5b22900027199e7', '6adf3932e8e0af00026814ef'],
  7: ['6adf3578b3cfe60002ab5a55', '6adf3633b3cfe60002ab5cf4'],
  8: ['6adf3707b3cfe60002ab5fd6', '6adf37f61d600a0002d466ae'],
  9: ['6ae52ef17b101100026bb5d7', '6ae532927b101100026bb9f3'],
  10: ['6ae546eaa1908400020410e3', '6ae547d1a1908400020412fd'],
  11: ['6ae54a51fab31400021bee3b', '6ae54abdfab31400021befb0'],
  12: ['6ae54f37a1908400020426c9', '6ae54fe0a1908400020428a5', '6ae5504aa1908400020429c9'],
  13: ['6ae550b3a190840002042a62', '6ae550fefab31400021bff7a'],
  14: ['6ae558d7fab31400021c1676', '6ae56b19b734640002ce823d'],
  15: ['6ae56d92b734640002ce863a', '6ae56f7f9902f90002d5ebdc'],
  16: ['6adf21c2e2681300028dfa46', '6aed8dd944034f00029b2b12'],
  17: ['6ae56c9db734640002ce8446', '6aed934844034f00029b3d9e']
};

// Ánh xạ videoUnitId (type: video) cho 9 khóa học có tách riêng unit video và unit homework trên izTeach
const COURSE_VIDEO_UNIT_MAP = {
  '65e7704a9ea90c00080d5195': { 1: '65e8a76f7a2e2600088125b4', 2: '65e8a7b02856250008d6f6ae', 3: '65e8a7c8a87e910008f3b5e8', 4: '65e8a8782856250008d6f7e7', 5: '65e8a8907a2e2600088125f9', 6: '65e8a8a6212cff0008515866', 7: '65e8a8d28a7dda0008c3bb8b', 8: '65e8a8e02856250008d6f8a4', 9: '65e8a90f7a2e26000881262b', 10: '65e8a9297a2e26000881264f', 11: '65e8a93c212cff00085158a5', 12: '65e8a9762856250008d6f8fd', 13: '65e8a988a87e910008f3b600', 14: '65e8a9be2856250008d6f92d', 15: '65e8a9e3a87e910008f3b630', 16: '65e8a9f9a87e910008f3b68f', 17: '65e8aa45a87e910008f3b778', 18: '65e8aa597a2e260008812733', 19: '65e8aa6c7a2e260008812758', 20: '65e8aa84a87e910008f3b7c7' },
  '6638bd09a7367400085c7ab2': { 1: '6638bd156090c200087ed9d6', 2: '6638bd156090c200087ed9d2', 3: '6638bd146090c200087ed9ce', 4: '6638bd146090c200087ed9ca', 5: '6638bd13a7367400085c7aba', 6: '6638bd136090c200087ed9c0', 7: '6638bd126090c200087ed9bc', 8: '6638bd126090c200087ed9b8', 9: '6638bd116090c200087ed9b4', 10: '6638bd116090c200087ed9b0', 11: '6638bd106090c200087ed9ac', 12: '6638bd106090c200087ed9a8', 13: '6638bd106090c200087ed9a4', 14: '6638bd0f6090c200087ed9a0', 15: '6638bd0f6090c200087ed99c', 16: '6638bd0e6090c200087ed998', 17: '6638bd0e6090c200087ed994', 18: '6638bd0d6090c200087ed98f', 19: '6638bd0d6090c200087ed98b', 20: '6638bd0c6090c200087ed987' },
  '65e76a533f5e7c00086715d7': { 20: '65e8c0e7fcfcaf00085254be' },
  '65e769bd637339000870618f': { 1: '65e8adcc4796480008803f7f', 2: '65e8adfc4796480008803f98', 3: '65e8ae09a7947a00080db5c2', 4: '65e8ae134796480008803fbd', 5: '65e8ae5156918200093460a6', 6: '65e8ae6356918200093460b7', 7: '65e8ae7a56918200093460c8', 8: '65e8ae8c4796480008803ff2', 9: '65e8ae9880cb9d0008b296df', 10: '65e8aeac479648000880400b', 11: '65e8aebe4796480008804042', 12: '65e8aec8479648000880407f', 13: '65e8aed280cb9d0008b296fd', 14: '65e8aee247964800088040a3', 15: '65e8af1347964800088040b5', 16: '65e8af2347964800088040c1', 17: '65e8af31d3b8e900089c443f', 18: '65e8af4347964800088040e7', 19: '65e8af4ed3b8e900089c444d', 20: '65e8af5cd3b8e900089c4457', 21: '65e8af6847964800088040f5', 22: '65e8af75d3b8e900089c446a', 23: '65e8af8ad3b8e900089c44a2', 24: '65e8af964796480008804120', 25: '65e8afbd479648000880412f' },
  '65e7636a0a1b61000825c2ef': { 1: '65e763be6373390008705ffe', 2: '65e7d94486988f00087af4d1', 3: '65e7d95f6fe5b00008cf8632', 4: '65e7da1486988f00087af558', 5: '65e7da35c5e0f000084269e8', 6: '65e7da4fc5e0f000084269fd', 7: '65e7da66c5e0f00008426a2d', 8: '65e7da74c5e0f00008426a44', 9: '65e7daafd3efb6000825e1ec', 10: '65e7dabfd3efb6000825e1ff', 11: '65e7dad4d3efb6000825e22d', 12: '65e7dae6d3efb6000825e24b', 13: '65e7daf3c5e0f00008426a85', 14: '65e7db0486988f00087af5cc', 15: '65e7db14d3efb6000825e27e', 16: '65e7db22c5e0f00008426a9c', 17: '65e7db31c5e0f00008426af3', 18: '65e7db3e2593b40008e8b86e', 19: '65e7db4cc5e0f00008426aff', 20: '65e7db57c5e0f00008426b19' },
  '6600fa477c18b80008c53c88': { 1: '6600fa5f7c18b80008c53ca1', 2: '660100fb92624c0008719def', 3: '660100fda1f8650008c3ed97', 4: '660100fea1f8650008c3eda0', 5: '66010100a1f8650008c3eda7', 6: '6601010192624c0008719df8', 7: '6601010ea1f8650008c3edae', 8: '6601010f92624c0008719e15', 9: '6601011192624c0008719e1a', 10: '6601011292624c0008719e1f', 11: '6601011492624c0008719e24', 12: '6601011592624c0008719e2c', 13: '6601011792624c0008719e31', 14: '6601011892624c0008719e3e', 15: '6601011a92624c0008719e47', 16: '6601011b92624c0008719e5a', 17: '6601011da56c980008124b5a', 18: '66010121a56c980008124b83', 19: '66010122ab1fb100088df626', 20: '66010124ab1fb100088df62e' },
  '65e772a1767c56000829518e': { 1: '65e8b44e4796480008804489', 2: '65e8b4a947964800088044ab', 3: '65e8b4d647964800088044c4', 4: '65e8b4fe47964800088044e8', 5: '65e8b52847964800088044f3', 6: '65e8b55d6ff95a000866a5a0', 7: '65e8b57a4796480008804503', 8: '65e8b5ab6ff95a000866a5b1', 9: '65e8b5e7d3b8e900089c474a', 10: '65e8b61147964800088045ac', 11: '65e8b62e47964800088045b9', 12: '65e8b646d3b8e900089c4770', 13: '65e8b66a47964800088045e0', 14: '65e8b69cd3b8e900089c47c3', 15: '65e8b6e1d3b8e900089c47cf', 16: '65e8b75d7dfefa0008d819e0', 17: '65edc85ae47d3c0008e34b15', 18: '65edca8e0929320008118e95', 19: '65edcb9a0929320008118f7f', 20: '65edcba4e47d3c0008e35110', 21: '65edcbbc0929320008118ff5', 22: '65edcbd302ed97000881322e', 23: '65edd7950929320008119d3b', 24: '65edd55e222c990008eae887', 25: '65edd9a6f5b7e2000a6eab79' },
  '6638c76dfac274000876cd13': { 1: '6638c78283319a00088e117c', 2: '6638c7813d17360007de7f62', 3: '6638c78183319a00088e1177', 4: '6638c78083319a00088e1173', 5: '6638c78083319a00088e116f', 6: '6638c77f83319a00088e116a', 7: '6638c77f83319a00088e1166', 8: '6638c77dd0d47e00085fdb48', 9: '6638c77dd0d47e00085fdb44', 10: '6638c77cd0d47e00085fdb40', 11: '6638c77cd0d47e00085fdb3c', 12: '6638c77bd0d47e00085fdb38', 13: '6638c77bfac274000876cd37', 14: '6638c77bd0d47e00085fdb34', 15: '6638c77ad0d47e00085fdb30', 16: '6638c779fac274000876cd28', 17: '6638c7793d17360007de7f53', 18: '6638c7783d17360007de7f4f', 19: '6638c7773d17360007de7f49', 20: '6638c7773d17360007de7f44', 21: '6638c7763d17360007de7f3e', 22: '6638c7750c45a9000821f4a5', 23: '6638c7733d17360007de7f36', 24: '6638c77280bf7500081844e2', 25: '6638c77154f6eb00082e04c4' },
  '65f6d1c722106a0008ff81a3': { 1: '65f6d2276fa3c60009c579f9', 2: '65f6d4d4af683f0008c040c9', 3: '65f6d4d5af683f0008c040ce', 4: '65f6d4d7af683f0008c040d4', 5: '65f6d4d8af683f0008c040da', 6: '65f6d4daaf683f0008c040df', 7: '65f6d4dbaf683f0008c040e4', 8: '65f6d4ddaf683f0008c040ec', 9: '65f6d4deaf683f0008c040f1', 10: '65f6d4e0af683f0008c040f9', 11: '65f6d4e1af683f0008c04102', 12: '65f6d4e2ac8d740008c3ebe6', 13: '65f6d4e4af683f0008c0410d', 14: '65f6d4e5973d0c0009a62364', 15: '65f6d4e7eb240400084e6fe1', 16: '65f6d4e8973d0c0009a62369', 17: '65f6d4ea973d0c0009a62371', 18: '65f6d4eceb240400084e6ff2', 19: '65f6d4ee973d0c0009a6237c', 20: '65f6d4f1eb240400084e6ff9' }
};

const UNIT_TO_COURSE_MAP = (() => {
  const rev = {};
  for (const [cid, lessons] of Object.entries(COURSE_UNIT_MAP)) {
    for (const [lNum, uId] of Object.entries(lessons)) {
      rev[String(uId).toLowerCase()] = { courseId: cid.toLowerCase(), lessonNum: Number(lNum) };
    }
  }
  for (const [cid, lessons] of Object.entries(COURSE_VIDEO_UNIT_MAP)) {
    for (const [lNum, uId] of Object.entries(lessons)) {
      rev[String(uId).toLowerCase()] = { courseId: cid.toLowerCase(), lessonNum: Number(lNum) };
    }
  }
  for (const [lNum, uList] of Object.entries(HSK1_LESSON_ALLOWED_UNITS)) {
    for (const uId of uList) {
      rev[String(uId).toLowerCase()] = { courseId: DEFAULT_COURSE_ID.toLowerCase(), lessonNum: Number(lNum) };
    }
  }
  return rev;
})();

/**
 * Phân giải chính xác Course -> Lesson -> Unit cho toàn bộ 17 khóa học (346 bài + các phần nhỏ).
 * Tuyệt đối KHÔNG fallback bài lớp trực tiếp (CLASS_*) hoặc khóa khác sang HSK1.
 */
function resolveCourseUnitId(rawCourseId, rawLessonNum, explicitUnitId = null) {
  const courseId = String(rawCourseId || '').trim();
  let lessonNum = Number(rawLessonNum) || 0;
  const cleanExplicitUnit = explicitUnitId ? String(explicitUnitId).trim() : '';

  if (courseId.toUpperCase().startsWith('CLASS_') || lessonNum >= 100) {
    return {
      isLiveClass: true,
      valid: false,
      courseId,
      lessonNum,
      unitId: null,
      syncStatus: 'not_applicable_live_class',
      reason: 'LIVE_CLASS_HOMEWORK'
    };
  }

  const normCourseId = courseId.toLowerCase();

  // Nếu gửi lên explicitUnitId thuộc đúng khóa học nhưng lessonNum đang là số thứ tự của sub-unit (1..33), chuẩn hóa về lessonNum thật
  if (cleanExplicitUnit && normCourseId === DEFAULT_COURSE_ID.toLowerCase()) {
    const owner = UNIT_TO_COURSE_MAP[cleanExplicitUnit.toLowerCase()];
    if (owner && owner.courseId === normCourseId && (lessonNum < 1 || lessonNum > 17)) {
      lessonNum = owner.lessonNum;
    }
  }

  if (!/^[0-9a-f]{24}$/i.test(courseId) || lessonNum < 1) {
    return {
      isLiveClass: false,
      valid: false,
      courseId,
      lessonNum,
      unitId: null,
      syncStatus: 'mapping_required',
      reason: 'INVALID_COURSE_OR_LESSON'
    };
  }

  const courseMap = COURSE_UNIT_MAP[normCourseId];

  if (courseMap) {
    if (courseMap[lessonNum]) {
      const canonicalUnitId = courseMap[lessonNum];
      if (cleanExplicitUnit) {
        const normExplicit = cleanExplicitUnit.toLowerCase();
        const isHsk1SubUnitMatch = normCourseId === DEFAULT_COURSE_ID.toLowerCase() && (
          HSK1_LEGACY_VIDEO_UNIT_MAP[lessonNum]?.toLowerCase() === normExplicit ||
          (HSK1_LESSON_ALLOWED_UNITS[lessonNum] || []).some(id => id.toLowerCase() === normExplicit)
        );
        const isCourseVideoUnitMatch = COURSE_VIDEO_UNIT_MAP[normCourseId]?.[lessonNum]?.toLowerCase() === normExplicit;
        if (normExplicit !== canonicalUnitId.toLowerCase() && !isHsk1SubUnitMatch && !isCourseVideoUnitMatch) {
          return {
            isLiveClass: false,
            valid: false,
            courseId: normCourseId,
            lessonNum,
            unitId: null,
            syncStatus: 'mapping_required',
            reason: 'UNIT_COURSE_MISMATCH'
          };
        }
      }
      return {
        isLiveClass: false,
        valid: true,
        courseId: normCourseId,
        lessonNum,
        unitId: canonicalUnitId,
        syncStatus: 'pending_sync'
      };
    }
    // Khóa học đã có trong danh mục 17 khóa nhưng lessonNum vượt phạm vi bài học của khóa
    return {
      isLiveClass: false,
      valid: false,
      courseId: normCourseId,
      lessonNum,
      unitId: null,
      syncStatus: 'mapping_required',
      reason: cleanExplicitUnit ? 'UNIT_COURSE_MISMATCH' : 'MAPPING_REQUIRED'
    };
  }

  // Khóa học ngoài danh mục 17 khóa: KHÔNG tự chấp nhận unitId do trình duyệt gửi lên nếu chưa xác thực với izTeach
  if (cleanExplicitUnit && /^[0-9a-f]{24}$/i.test(cleanExplicitUnit)) {
    const owner = UNIT_TO_COURSE_MAP[cleanExplicitUnit.toLowerCase()];
    if (owner && (owner.courseId !== normCourseId || owner.lessonNum !== lessonNum)) {
      return {
        isLiveClass: false,
        valid: false,
        courseId: normCourseId,
        lessonNum,
        unitId: null,
        syncStatus: 'mapping_required',
        reason: 'CROSS_COURSE_UNIT_MISMATCH'
      };
    }
    return {
      isLiveClass: false,
      valid: false,
      requiresRemoteVerification: true,
      candidateUnitId: cleanExplicitUnit.toLowerCase(),
      courseId: normCourseId,
      lessonNum,
      unitId: null,
      syncStatus: 'mapping_required',
      reason: 'UNVERIFIED_EXTERNAL_UNIT_ID'
    };
  }

  return {
    isLiveClass: false,
    valid: false,
    courseId: normCourseId,
    lessonNum,
    unitId: null,
    syncStatus: 'mapping_required',
    reason: 'MAPPING_REQUIRED'
  };
}

/**
 * Đối chiếu mã bài học (unitId) với danh mục 346 bài chuẩn; nếu thuộc khóa học mới ngoài danh mục 17 khóa,
 * bắt buộc xác thực trực tiếp với API /prod/unit của izTeach trước khi chấp nhận.
 */
async function resolveAndVerifyCourseUnitId(env, rawCourseId, rawLessonNum, explicitUnitId = null) {
  const base = resolveCourseUnitId(rawCourseId, rawLessonNum, explicitUnitId);
  if (!base.requiresRemoteVerification || !base.candidateUnitId) {
    return base;
  }
  const adminToken = await getIzTeachAdminToken(env);
  if (!adminToken) {
    return base;
  }
  const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
  try {
    const unitRes = await fetch(
      `${IZTEACH_ENDPOINTS.courseUnits}?course=${encodeURIComponent(base.courseId)}&vendorId=${encodeURIComponent(vendorId)}`,
      { headers: { Authorization: adminToken } }
    );
    if (!unitRes.ok) return base;
    const units = await unitRes.json().catch(() => []);
    const unitList = Array.isArray(units) ? units : (Array.isArray(units?.data) ? units.data : []);
    const matched = unitList.find(u => {
      if (!u) return false;
      const uid = String(u._id || u.id || '').trim().toLowerCase();
      if (uid !== base.candidateUnitId) return false;
      const uCourse = String(u.course?._id || u.course || base.courseId).trim().toLowerCase();
      return uCourse === base.courseId;
    });
    if (matched) {
      return {
        isLiveClass: false,
        valid: true,
        verifiedOnIzTeach: true,
        courseId: base.courseId,
        lessonNum: base.lessonNum,
        unitId: base.candidateUnitId,
        syncStatus: 'pending_sync'
      };
    }
  } catch {}
  return base;
}

const IN_FLIGHT_HOMEWORK_OPS = new Map();

async function runWithHomeworkConcurrencyLock(opKey, fn) {
  if (IN_FLIGHT_HOMEWORK_OPS.has(opKey)) {
    const existingOutcome = await IN_FLIGHT_HOMEWORK_OPS.get(opKey).catch(() => null);
    if (existingOutcome && existingOutcome.status === 200 && existingOutcome.data?.ok) {
      const replayPayload = {
        ...existingOutcome.data,
        idempotent: true,
        idempotentReplay: true,
        concurrentDedup: true,
        izteachMirror: existingOutcome.data.izteachMirror
          ? { ...existingOutcome.data.izteachMirror, idempotent: true, idempotentReplay: true }
          : undefined
      };
      return jsonResponse(replayPayload, 200);
    }
  }
  let resolveLock;
  const lockPromise = new Promise(resolve => { resolveLock = resolve; });
  IN_FLIGHT_HOMEWORK_OPS.set(opKey, lockPromise);
  try {
    const response = await fn();
    const clonedText = await response.clone().text().catch(() => '');
    let parsedData = null;
    try { parsedData = JSON.parse(clonedText); } catch {}
    resolveLock({ status: response.status, data: parsedData });
    return response;
  } catch (err) {
    resolveLock(null);
    throw err;
  } finally {
    IN_FLIGHT_HOMEWORK_OPS.delete(opKey);
  }
}

async function verifyIzTeachHomeworkReceipt(env, { remoteId, courseId, unitId, expectApproved = false, expectedScore = null }) {
  const cleanRemoteId = String(remoteId || '').trim();
  if (!/^[0-9a-f]{24}$/i.test(cleanRemoteId)) {
    return { verified: false, reason: 'INVALID_REMOTE_ID' };
  }
  const adminToken = await getIzTeachAdminToken(env);
  if (!adminToken) {
    return { verified: false, reason: 'NO_ADMIN_TOKEN' };
  }
  const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
  try {
    const res = await fetch(
      `${IZTEACH_ENDPOINTS.homeworkApi}?vendorId=${encodeURIComponent(vendorId)}&course=${encodeURIComponent(courseId)}`,
      { headers: { Authorization: adminToken } }
    );
    if (!res.ok) return { verified: false, reason: 'IZTEACH_QUERY_HTTP_' + res.status };
    const raw = await res.json().catch(() => []);
    const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
    const hit = list.find(item => {
      if (!item) return false;
      const itemId = String(item._id || item.id || '').trim().toLowerCase();
      if (itemId !== cleanRemoteId.toLowerCase()) return false;
      const itemCourse = String(item.course?._id || item.course || '').trim().toLowerCase();
      const itemUnit = String(item.unit?._id || item.unit || '').trim().toLowerCase();
      if (itemCourse !== String(courseId).toLowerCase() || itemUnit !== String(unitId).toLowerCase()) return false;
      if (expectApproved) {
        if (item.state !== 'approved') return false;
        if (expectedScore !== null && expectedScore !== undefined && Number(item.mark) !== Number(expectedScore)) return false;
      }
      return true;
    });
    if (hit) {
      return { verified: true, remoteId: String(hit._id || hit.id), record: hit };
    }
    return { verified: false, reason: 'RECEIPT_NOT_FOUND_ON_IZTEACH' };
  } catch {
    return { verified: false, reason: 'RECEIPT_VERIFY_NETWORK_ERROR' };
  }
}

/**
 * Đồng bộ bài nộp / kết quả chấm điểm từ Supabase ktn_homeworks sang izTeach /prod/homework.
 * Chỉ đồng bộ khi xác định chính xác Course + Lesson + Unit hợp lệ và chống tạo bản ghi trùng lặp (Idempotent).
 */
async function mirrorHomeworkToIzTeach(env, hwRow, isGraded = false, options = {}) {
  if (!hwRow) return { ok: false, syncStatus: 'sync_failed', reason: 'EMPTY_HW' };

  const explicitUnitId = options.unitId || hwRow.workbook_answers?._syncMeta?.unitId || null;
  const resolved = await resolveAndVerifyCourseUnitId(env, hwRow.course_id, hwRow.lesson_num, explicitUnitId);

  if (resolved.isLiveClass) {
    return {
      ok: true,
      skipped: true,
      syncStatus: 'not_applicable_live_class',
      reason: 'LIVE_CLASS_HOMEWORK'
    };
  }

  if (!resolved.valid || !resolved.unitId) {
    return {
      ok: false,
      skipped: true,
      syncStatus: 'mapping_required',
      reason: resolved.reason || 'MAPPING_REQUIRED',
      courseId: resolved.courseId,
      lessonNum: resolved.lessonNum
    };
  }

  const courseId = resolved.courseId;
  const unitId = resolved.unitId;
  const lessonNum = resolved.lessonNum;
  const cleanEmail = normalizeEmail(hwRow.student_email || '');
  const baseNote = String(hwRow.student_note || '').trim();
  const feedback = String(hwRow.teacher_feedback || '').trim();
  const statusStr = String(hwRow.status || (isGraded ? 'graded' : 'pending'));
  const scoreVal = isGraded && hwRow.score !== null && hwRow.score !== undefined ? Number(hwRow.score) : null;

  const signature = JSON.stringify({
    courseId,
    unitId,
    lessonNum,
    fileUrl: String(hwRow.file_url || ''),
    status: statusStr,
    state: isGraded ? 'approved' : 'submitted',
    score: scoreVal,
    feedback,
    note: baseNote
  });

  const prevMeta = (hwRow.workbook_answers && typeof hwRow.workbook_answers === 'object' && hwRow.workbook_answers._syncMeta) || {};
  if (!options.force && prevMeta.syncStatus === 'synced' && prevMeta.lastSyncedSignature === signature) {
    return {
      ok: true,
      idempotent: true,
      syncStatus: 'synced',
      remoteId: prevMeta.izteachRemoteId || null,
      courseId,
      unitId,
      lessonNum,
      signature
    };
  }

  const adminToken = await getIzTeachAdminToken(env);
  if (!adminToken) {
    return { ok: false, syncStatus: 'sync_failed', reason: 'NO_ADMIN_TOKEN', courseId, unitId, lessonNum, signature };
  }
  const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
  const s3Bucket = 'https://online-learning-izteach-6-aws-source-bucket.s3-ap-southeast-1.amazonaws.com';
  const cdnPrefix = 'https://d21acfi38wn3iy.cloudfront.net/';

  let cognitoUserId = hwRow.cognito_user_id || '';
  if (!cognitoUserId && cleanEmail) {
    const stuRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(cleanEmail)}&select=cognito_user_id&limit=1`);
    if (stuRes.ok && Array.isArray(stuRes.data) && stuRes.data[0]?.cognito_user_id) {
      cognitoUserId = stuRes.data[0].cognito_user_id;
    }
  }

  const rawAtts = Array.isArray(hwRow.attachments) && hwRow.attachments.length > 0
    ? hwRow.attachments
    : (hwRow.file_url ? [{ title: hwRow.lesson_title || 'Bài nộp', fileUrl: hwRow.file_url, mediaType: hwRow.file_type || 'audio', size: 0 }] : []);

  const resources = rawAtts.map((a, idx) => {
    const urlStr = String(a.cdnUrl || a.fileUrl || a.playUrl || hwRow.file_url || '').trim();
    const s3Key = urlStr.startsWith(cdnPrefix)
      ? urlStr.slice(cdnPrefix.length)
      : (a.s3Key || urlStr);
    const mType = String(a.mediaType || a.fileType || hwRow.file_type || 'audio').toLowerCase();
    const mimeType = a.mimeType || (mType === 'image' ? 'image/jpeg' : (mType === 'video' ? 'video/mp4' : 'audio/mpeg'));
    return {
      _id: a.resourceId || a.id || `${hwRow.id || 'HW'}-${idx}`,
      title: a.title || hwRow.lesson_title || 'Bài tập',
      size: Number(a.size || 0),
      dataType: 'resource',
      link: s3Key,
      provider: 'S3',
      type: 'homework',
      subType: 'file',
      vendorId,
      origin: {
        link: s3Key,
        size: Number(a.size || 0),
        type: 'homework',
        mimeType,
        bucket: s3Bucket
      }
    };
  });

  const hasFeedback = Boolean(feedback && (isGraded || statusStr === 'revision_requested'));
  const combinedNotes = hasFeedback
    ? (baseNote ? `${baseNote}\n[Nhận xét Giáo viên]: ${feedback}` : `[Nhận xét Giáo viên]: ${feedback}`)
    : baseNote;

  const payload = {
    title: hwRow.lesson_title || `Bài tập Bài ${lessonNum}`,
    notes: combinedNotes,
    vendorId,
    course: courseId,
    unit: unitId,
    userId: cognitoUserId || '',
    name: hwRow.student_name || cleanEmail.split('@')[0] || 'Học viên',
    email: cleanEmail,
    state: isGraded ? 'approved' : 'submitted',
    mark: scoreVal !== null ? scoreVal : undefined,
    teacherFeedback: hasFeedback ? feedback : undefined,
    type: 'multiple-files',
    resources
  };

  try {
    const res = await fetch(IZTEACH_ENDPOINTS.homeworkApi, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        syncStatus: 'sync_failed',
        reason: 'IZTEACH_HTTP_' + res.status,
        courseId,
        unitId,
        lessonNum,
        signature
      };
    }
    const data = await res.json().catch(() => null);
    const remoteObj = data?.data || data || {};
    const remoteId = remoteObj._id || remoteObj.id || prevMeta.izteachRemoteId || null;
    return {
      ok: true,
      syncStatus: 'synced',
      remoteId,
      courseId,
      unitId,
      lessonNum,
      signature,
      data: remoteObj
    };
  } catch (err) {
    return {
      ok: false,
      syncStatus: 'sync_failed',
      reason: 'MIRROR_HW_ERROR',
      error: err?.message || 'MIRROR_HW_ERROR',
      courseId,
      unitId,
      lessonNum,
      signature
    };
  }
}

async function mergeAndUpsertStudentCourses(env, {
  email,
  name,
  phone,
  parentName = undefined,
  parentPhone = undefined,
  cognitoUserId,
  izteachStudentId,
  addCourseIds = [],
  removeCourseIds = [],
  replaceCourseIds = null,
  classCode = undefined,
  codeHint = '',
  accountStatus = undefined,
  syncStatus = undefined,
  lastSyncError = undefined,
  internalNote = undefined,
  suppressClassJoinedNotification = false,
  actorEmail = 'admin@khongtunhi.com'
}) {
  const cleanEmail = normalizeEmail(email);
  const nowIso = new Date().toISOString();

  // Tra cứu hồ sơ học viên hiện có trong Supabase ktn_students
  let existingRow = null;
  const stuLookup = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(cleanEmail)}&limit=1`);
  if (stuLookup.ok && Array.isArray(stuLookup.data) && stuLookup.data[0]) {
    existingRow = stuLookup.data[0];
  }

  const previousClassCode = String(existingRow?.class_code || '').trim().toUpperCase();
  const prevCourses = Array.isArray(existingRow?.online_courses) ? existingRow.online_courses : [];
  const prevIds = prevCourses.map(c => String(c?.id || c || '').trim()).filter(Boolean);

  let nextIds;
  if (Array.isArray(replaceCourseIds)) {
    nextIds = Array.from(new Set(replaceCourseIds.map(id => String(id || '').trim()).filter(Boolean)));
  } else {
    const removeSet = new Set((Array.isArray(removeCourseIds) ? removeCourseIds : []).map(id => String(id || '').trim()));
    nextIds = Array.from(new Set([...prevIds, ...addCourseIds.map(id => String(id || '').trim()).filter(Boolean)]))
      .filter(id => !removeSet.has(id));
  }

  const onlineCoursesJson = nextIds.map(cid => {
    const meta = MASTER_PRODUCT_MAPPING[cid];
    const prevObj = prevCourses.find(c => String(c?.id || '') === cid);
    return {
      id: cid,
      title: meta?.shortTitle || prevObj?.title || 'Khóa học trực tuyến'
    };
  });

  const normalizedIncomingClass =
    classCode !== undefined
      ? (String(classCode || '').trim().toUpperCase() || null)
      : (previousClassCode || null);
  const finalClassCode = normalizedIncomingClass;
  const studentCode = existingRow?.code || codeHint || ('KTN-' + Date.now().toString().slice(-6));
  const resolvedCognito = cognitoUserId || existingRow?.cognito_user_id || null;
  const resolvedIzStuId = izteachStudentId || existingRow?.izteach_student_id || null;
  const resolvedPhone = phone !== undefined ? String(phone).trim() : (existingRow?.phone || '');
  const rawExistingParentName = String(existingRow?.parent_name || '').trim();
  const cleanExistingParentName = rawExistingParentName.replace(/\s*\[SĐT_PH:[^\]]+\]/gi, '').trim();
  const resolvedParentName = parentName !== undefined
    ? String(parentName).trim().replace(/\s*\[SĐT_PH:[^\]]+\]/gi, '').trim()
    : cleanExistingParentName;
  const resolvedParentPhone = parentPhone !== undefined
    ? String(parentPhone).trim()
    : (
        existingRow?.parent_phone ||
        existingRow?.parentPhone ||
        extractParentPhoneFromInternalNote(existingRow?.internal_note) ||
        extractParentPhoneFromInternalNote(rawExistingParentName) ||
        ''
      );
  const basePayload = {
    code: studentCode,
    email: cleanEmail,
    name: (name !== undefined && String(name).trim() !== '') ? String(name).trim() : (existingRow?.name || cleanEmail.split('@')[0]),
    phone: resolvedPhone,
    cognito_user_id: resolvedCognito,
    izteach_student_id: resolvedIzStuId,
    class_code: finalClassCode,
    has_live_class: Boolean(finalClassCode),
    has_online_courses: onlineCoursesJson.length > 0,
    online_courses: onlineCoursesJson,
    updated_at: nowIso
  };
  const v2ParentNameWithPhoneTag = resolvedParentPhone
    ? (resolvedParentName ? `${resolvedParentName} [SĐT_PH:${resolvedParentPhone}]` : `[SĐT_PH:${resolvedParentPhone}]`)
    : resolvedParentName;
  const v2Payload = (parentName !== undefined || parentPhone !== undefined || v2ParentNameWithPhoneTag)
    ? { ...basePayload, parent_name: v2ParentNameWithPhoneTag }
    : basePayload;

  let mergedInternalNote = internalNote !== undefined && String(internalNote).trim() !== ''
    ? String(internalNote).trim()
    : String(existingRow?.internal_note || '').trim();
  if (resolvedParentPhone) {
    mergedInternalNote = mergedInternalNote.replace(/\s*\[SĐT_PH:[^\]]+\]/gi, '').trim();
    mergedInternalNote = mergedInternalNote
      ? `${mergedInternalNote} [SĐT_PH:${resolvedParentPhone}]`
      : `[SĐT_PH:${resolvedParentPhone}]`;
  }

  const v3PayloadWithoutParentPhoneCol = (parentName !== undefined || resolvedParentName)
    ? { ...basePayload, parent_name: resolvedParentName }
    : { ...basePayload };
  if (accountStatus !== undefined) v3PayloadWithoutParentPhoneCol.account_status = accountStatus;
  if (syncStatus !== undefined) {
    v3PayloadWithoutParentPhoneCol.sync_status = syncStatus;
    if (syncStatus === 'synced') v3PayloadWithoutParentPhoneCol.last_synced_at = nowIso;
  }
  if (lastSyncError !== undefined) v3PayloadWithoutParentPhoneCol.last_sync_error = lastSyncError;
  if (mergedInternalNote) {
    v3PayloadWithoutParentPhoneCol.internal_note = mergedInternalNote;
  }
  v3PayloadWithoutParentPhoneCol.search_text = buildStudentSearchText({
    ...v3PayloadWithoutParentPhoneCol,
    parent_phone: resolvedParentPhone
  });

  const extendedPayload = (parentPhone !== undefined || resolvedParentPhone)
    ? { ...v3PayloadWithoutParentPhoneCol, parent_phone: resolvedParentPhone }
    : v3PayloadWithoutParentPhoneCol;

  let sbRes = await supabaseRequest(env, 'ktn_students', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: Object.keys(extendedPayload).length > Object.keys(v2Payload).length ? extendedPayload : v2Payload
  });
  if ((!sbRes || !sbRes.ok) && sbRes?.status === 400 && extendedPayload.parent_phone !== undefined) {
    sbRes = await supabaseRequest(env, 'ktn_students', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: v3PayloadWithoutParentPhoneCol
    });
  }
  // Fallback an toàn nếu bảng ktn_students chưa chạy kịp migration V3 (tránh lỗi 400 column does not exist nhưng vẫn giữ parent_name)
  if ((!sbRes || !sbRes.ok) && sbRes?.status === 400 && Object.keys(v3PayloadWithoutParentPhoneCol).length > Object.keys(v2Payload).length) {
    sbRes = await supabaseRequest(env, 'ktn_students', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: v2Payload
    });
  }
  if ((!sbRes || !sbRes.ok) && sbRes?.status === 400 && Object.keys(v2Payload).length > Object.keys(basePayload).length) {
    sbRes = await supabaseRequest(env, 'ktn_students', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: basePayload
    });
  }
  // Nếu xung đột unique email (23505 ktn_students_email_key) do bản ghi vừa được tạo đồng thời với mã code khác, cập nhật trực tiếp theo email
  if ((!sbRes || !sbRes.ok) && sbRes?.status === 409 && String(sbRes?.data?.code || '') === '23505') {
    const { code: _omitCode, ...patchV2 } = v2Payload;
    sbRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(cleanEmail)}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: patchV2
    });
  }
  if (!sbRes || !sbRes.ok || !Array.isArray(sbRes.data) || sbRes.data.length === 0) {
    return {
      ok: false,
      error: 'SUPABASE_UPSERT_FAILED',
      status: sbRes?.status || 503
    };
  }
  const saved = sbRes.data[0];

  // Đồng bộ class_code trên ktn_push_subscriptions nếu lớp thay đổi (hoặc bị gỡ)
  const effectiveNewClass = String(finalClassCode || '').trim().toUpperCase();
  if (effectiveNewClass !== previousClassCode) {
    await supabaseRequest(env, `ktn_push_subscriptions?user_email=eq.${encodeURIComponent(cleanEmail)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: {
        class_code: effectiveNewClass || null,
        updated_at: nowIso
      }
    }).catch(() => null);
  }

  let classJoinedNotification = null;
  if (
    !suppressClassJoinedNotification &&
    effectiveNewClass &&
    effectiveNewClass !== previousClassCode
  ) {
    const clsLookup = await supabaseRequest(
      env,
      `ktn_classes?id=eq.${encodeURIComponent(effectiveNewClass)}&select=*&limit=1`
    ).catch(() => ({ ok: false, data: [] }));
    const clsRow = clsLookup.ok && Array.isArray(clsLookup.data) && clsLookup.data[0] ? clsLookup.data[0] : null;
    if (!clsRow || clsRow.active !== false) {
      let teacherName = String(clsRow?.teacher_name || '').trim();
      const teacherEmail = normalizeEmail(clsRow?.teacher_email || '');
      if (!teacherName && teacherEmail) {
        const tLookup = await supabaseRequest(
          env,
          `ktn_teachers?email=eq.${encodeURIComponent(teacherEmail)}&select=name&limit=1`
        ).catch(() => ({ ok: false, data: [] }));
        if (tLookup.ok && Array.isArray(tLookup.data) && tLookup.data[0]?.name) {
          teacherName = String(tLookup.data[0].name).trim();
        }
      }
      const teacherDisplay = teacherName ? ` (Giáo viên: ${teacherName})` : '';
      const baseEventId = `CLASS_JOINED_${effectiveNewClass}_${fnv1aHash36(cleanEmail)}_${previousClassCode || 'NONE'}`;
      const priorJoinRes = await supabaseRequest(
        env,
        `ktn_dlp_alerts?room_id=eq.KTN_LIFECYCLE_NOTIFICATION&sender_email=eq.${encodeURIComponent(cleanEmail)}&sender_name=eq.${encodeURIComponent(effectiveNewClass)}&reason=eq.class_joined&select=id`
      ).catch(() => ({ ok: false, data: [] }));
      const priorJoinCount = priorJoinRes.ok && Array.isArray(priorJoinRes.data) ? priorJoinRes.data.length : 0;
      const eventId = priorJoinCount > 0 ? `${baseEventId}_T${priorJoinCount + 1}` : baseEventId;
      const actionUrl = `/custom-page/so-lien-lac-test#/classrooms?class=${encodeURIComponent(effectiveNewClass)}&roomId=${encodeURIComponent('class:' + effectiveNewClass)}`;
      const chatUrl = `/custom-page/so-lien-lac-test#/messages?roomId=${encodeURIComponent('class:' + effectiveNewClass)}`;
      classJoinedNotification = await emitTargetedLifecycleNotification(env, {
        eventId,
        type: 'class_joined',
        recipientEmail: cleanEmail,
        senderEmail: actorEmail || 'admin@khongtunhi.com',
        classCode: effectiveNewClass,
        roomId: `class:${effectiveNewClass}`,
        title: `Bạn đã được thêm vào lớp ${effectiveNewClass}`,
        body: `Bạn đã được thêm vào lớp ${effectiveNewClass}${teacherDisplay}. Hãy mở Sổ liên lạc để xem lịch học và nhóm lớp nhé!`,
        actionUrl,
        actionLabel: 'Mở lớp & Nhóm chat',
        allowSelfPush: true,
        meta: {
          classCode: effectiveNewClass,
          previousClassCode: previousClassCode || null,
          teacherName: teacherName || null,
          teacherEmail: teacherEmail || null,
          roomId: `class:${effectiveNewClass}`,
          chatUrl
        }
      }).catch(() => null);
    }
  }

  return {
    ...enrichStudentRowV3({
      ...saved,
      parent_name: saved.parent_name ?? extendedPayload.parent_name ?? existingRow?.parent_name ?? '',
      parent_phone: saved.parent_phone ?? resolvedParentPhone ?? '',
      internal_note: saved.internal_note ?? mergedInternalNote ?? existingRow?.internal_note ?? null,
      account_status: saved.account_status ?? extendedPayload.account_status ?? existingRow?.account_status,
      sync_status: saved.sync_status ?? extendedPayload.sync_status ?? existingRow?.sync_status,
      last_sync_error: saved.last_sync_error ?? extendedPayload.last_sync_error ?? existingRow?.last_sync_error ?? null
    }),
    classJoinedNotification,
    pushDispatch: classJoinedNotification?.pushResult || null,
    ok: true
  };
}

// ============================================================================
// ORCHESTRATION & OBSERVABILITY V3 (PROVISIONING JOBS, SYNC EVENTS, ORDER SAGA)
// ============================================================================
function generateOperationId(prefix = 'PROV') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function deriveDeterministicOperationId(prefix = 'PROV', idempotencyKey = '', targetEmail = '') {
  const cleanKey = String(idempotencyKey || '').trim();
  const cleanEmail = normalizeEmail(targetEmail || '');
  const raw = `${cleanKey}|${cleanEmail}`;
  if (!cleanKey) return generateOperationId(prefix);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (ch + i);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  const keyTag = cleanKey.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-8) || 'IDEM';
  return `${prefix}-${keyTag}-${h1.toString(36).toUpperCase()}${h2.toString(36).toUpperCase().slice(0, 4)}`;
}

async function runWithProvisioningLock(lockKey, taskFn) {
  const key = String(lockKey || '').trim().toLowerCase();
  if (!key) return taskFn();
  if (!globalThis.__ktnProvisioningLocksMap) globalThis.__ktnProvisioningLocksMap = new Map();
  const prevPromise = globalThis.__ktnProvisioningLocksMap.get(key) || Promise.resolve();
  let releaseLock;
  const nextPromise = new Promise((resolve) => {
    releaseLock = resolve;
  });
  globalThis.__ktnProvisioningLocksMap.set(
    key,
    prevPromise.then(() => nextPromise, () => nextPromise)
  );
  await prevPromise.catch(() => {});
  try {
    return await taskFn();
  } finally {
    releaseLock();
    if (globalThis.__ktnProvisioningLocksMap.get(key) === nextPromise) {
      globalThis.__ktnProvisioningLocksMap.delete(key);
    }
  }
}

const SENSITIVE_AUDIT_KEYS_REGEX = /^(password|initialPassword|defaultPassword|adminPassword|accessToken|refreshToken|idToken|izteachAccessToken|token|secret|authorization|cookie|serviceRoleKey)$/i;

function sanitizeAuditPayload(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map(item => sanitizeAuditPayload(item));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_AUDIT_KEYS_REGEX.test(k)) {
        continue;
      }
      out[k] = sanitizeAuditPayload(v);
    }
    return out;
  }
  return value;
}

async function saveProvisioningJobState(env, jobRecord) {
  if (!jobRecord || !jobRecord.operation_id) return null;
  if (!globalThis.__ktnProvisioningJobsMap) globalThis.__ktnProvisioningJobsMap = new Map();
  const prev = globalThis.__ktnProvisioningJobsMap.get(jobRecord.operation_id) || {};
  const merged = {
    ...prev,
    ...jobRecord,
    request_payload: sanitizeAuditPayload(jobRecord.request_payload ?? prev.request_payload ?? {}),
    response_payload: sanitizeAuditPayload(jobRecord.response_payload ?? prev.response_payload ?? {}),
    result_summary: sanitizeAuditPayload(jobRecord.result_summary ?? prev.result_summary ?? {}),
    updated_at: new Date().toISOString()
  };
  globalThis.__ktnProvisioningJobsMap.set(jobRecord.operation_id, merged);
  if (merged.idempotency_key) {
    if (!globalThis.__ktnIdempotencyJobMap) globalThis.__ktnIdempotencyJobMap = new Map();
    globalThis.__ktnIdempotencyJobMap.set(merged.idempotency_key, merged);
  }
  try {
    const sbRes = await supabaseRequest(env, 'ktn_provisioning_jobs', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: merged
    });
    if ((!sbRes || !sbRes.ok) && sbRes?.status === 404) {
      const keyBasis = merged.idempotency_key || merged.operation_id;
      const idemSafeId = 'PJOB-' + String(keyBasis).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
      await supabaseRequest(env, 'ktn_dlp_alerts', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: {
          id: idemSafeId,
          room_id: 'PROVISIONING_JOB',
          sender_email: merged.actor_email || 'admin',
          sender_name: merged.target_email || 'system',
          sender_role: merged.target_role || 'admin',
          blocked_content: JSON.stringify(merged),
          reason: 'IDEM:' + (merged.idempotency_key || merged.operation_id),
          created_at: merged.updated_at
        }
      });
    }
  } catch {}
  return merged;
}

async function findLatestIncompleteStudentJobByEmail(env, rawEmail, rawOperationId = '') {
  const email = normalizeEmail(rawEmail);
  const opId = String(rawOperationId || '').trim();
  if (!email && !opId) return null;

  const isMatchingIncomplete = (row) => {
    if (!row || typeof row !== 'object') return false;
    if (row.status !== 'partial_failure' && row.status !== 'failed') return false;
    if (opId && row.operation_id === opId) return true;
    const rowEmail = normalizeEmail(row.target_email || row.request_payload?.email || '');
    return Boolean(email && rowEmail === email && (!row.job_type || row.job_type === 'student_create'));
  };

  if (globalThis.__ktnProvisioningJobsMap) {
    if (opId && globalThis.__ktnProvisioningJobsMap.has(opId)) {
      const byOp = globalThis.__ktnProvisioningJobsMap.get(opId);
      if (isMatchingIncomplete(byOp) && (!email || !byOp.target_email || normalizeEmail(byOp.target_email) === email)) {
        return byOp;
      }
    }
    const candidates = Array.from(globalThis.__ktnProvisioningJobsMap.values()).filter(isMatchingIncomplete);
    if (candidates.length > 0) {
      candidates.sort((a, b) => (Date.parse(b.updated_at || '') || 0) - (Date.parse(a.updated_at || '') || 0));
      return candidates[0];
    }
  }

  try {
    const queryFilter = opId
      ? `ktn_provisioning_jobs?operation_id=eq.${encodeURIComponent(opId)}&limit=1`
      : `ktn_provisioning_jobs?target_email=eq.${encodeURIComponent(email)}&order=updated_at.desc&limit=5`;
    const sbRes = await supabaseRequest(env, queryFilter);
    if (sbRes.ok && Array.isArray(sbRes.data)) {
      const found = sbRes.data.find(r => isMatchingIncomplete(r) && (!email || !r.target_email || normalizeEmail(r.target_email) === email));
      if (found) return found;
    } else if (sbRes?.status === 404 && email) {
      const fbRes = await supabaseRequest(
        env,
        `ktn_dlp_alerts?room_id=eq.PROVISIONING_JOB&sender_name=eq.${encodeURIComponent(email)}&order=created_at.desc&limit=5`
      );
      if (fbRes.ok && Array.isArray(fbRes.data)) {
        for (const item of fbRes.data) {
          try {
            const parsed = JSON.parse(item.blocked_content || '{}');
            if (isMatchingIncomplete(parsed) && normalizeEmail(parsed.target_email || parsed.request_payload?.email) === email) {
              return parsed;
            }
          } catch {}
        }
      }
    }
  } catch {}
  return null;
}

async function getCompletedJobByIdempotencyKey(env, idempotencyKey) {
  const key = String(idempotencyKey || '').trim();
  if (!key) return null;
  try {
    const sbRes = await supabaseRequest(env, `ktn_provisioning_jobs?idempotency_key=eq.${encodeURIComponent(key)}&status=eq.completed&limit=1`);
    if (sbRes.ok && Array.isArray(sbRes.data) && sbRes.data[0]) {
      return sbRes.data[0];
    }
    if (sbRes?.status === 404) {
      const fbRes = await supabaseRequest(
        env,
        `ktn_dlp_alerts?room_id=eq.PROVISIONING_JOB&reason=eq.${encodeURIComponent('IDEM:' + key)}&order=created_at.desc&limit=1`
      );
      if (fbRes.ok && Array.isArray(fbRes.data) && fbRes.data[0]?.blocked_content) {
        const parsed = JSON.parse(fbRes.data[0].blocked_content);
        if (parsed && parsed.status === 'completed') return parsed;
      }
    }
  } catch {}
  if (globalThis.__ktnIdempotencyJobMap && globalThis.__ktnIdempotencyJobMap.has(key)) {
    const cached = globalThis.__ktnIdempotencyJobMap.get(key);
    if (cached && cached.status === 'completed') return cached;
  }
  return null;
}

/**
 * Atomic multi-Worker-instance idempotency claim backed by PostgreSQL UNIQUE constraint on ktn_provisioning_jobs.idempotency_key.
 * Ensures two separate Worker instances (without shared globalThis memory) cannot execute duplicate provisioning for the same Idempotency-Key.
 */
async function claimProvisioningJobAtomically(env, {
  operationId,
  idempotencyKey,
  jobType,
  actorEmail,
  targetEmail,
  targetRole = 'student',
  requestPayload = {}
}) {
  let key = String(idempotencyKey || '').trim();
  const normTargetEmail = normalizeEmail(targetEmail || '');
  const resolvedOpId = operationId || (key ? deriveDeterministicOperationId('PROV', key, normTargetEmail) : generateOperationId('PROV'));
  if (!key) {
    return {
      claimed: true,
      operationId: resolvedOpId,
      completedSteps: [],
      cognitoUserId: null,
      izteachStudentId: null,
      job: null
    };
  }

  const isTargetMatch = (row) => {
    if (!row || typeof row !== 'object') return false;
    const rowEmail = normalizeEmail(row.target_email || row.request_payload?.email || '');
    if (normTargetEmail && rowEmail && rowEmail !== normTargetEmail) {
      return false;
    }
    return true;
  };

  const buildResumedReturn = (row) => ({
    claimed: true,
    resumed: true,
    operationId: row.operation_id || resolvedOpId,
    completedSteps: Array.isArray(row.completed_steps) ? row.completed_steps : [],
    cognitoUserId: row.cognito_user_id || null,
    izteachStudentId: row.izteach_student_id || null,
    job: row
  });

  const lookupJobByKey = async (lookupKey) => {
    let found = null;
    const checkRes = await supabaseRequest(env, `ktn_provisioning_jobs?idempotency_key=eq.${encodeURIComponent(lookupKey)}&limit=1`);
    if (checkRes.ok && Array.isArray(checkRes.data) && checkRes.data[0]) {
      found = checkRes.data[0];
    } else if (checkRes?.status === 404) {
      if (globalThis.__ktnIdempotencyJobMap && globalThis.__ktnIdempotencyJobMap.has(lookupKey)) {
        found = globalThis.__ktnIdempotencyJobMap.get(lookupKey);
      } else {
        const fbRes = await supabaseRequest(
          env,
          `ktn_dlp_alerts?room_id=eq.PROVISIONING_JOB&reason=eq.${encodeURIComponent('IDEM:' + lookupKey)}&order=created_at.desc&limit=1`
        );
        if (fbRes.ok && Array.isArray(fbRes.data) && fbRes.data[0]?.blocked_content) {
          try {
            found = JSON.parse(fbRes.data[0].blocked_content);
          } catch {}
        }
      }
    }
    return found;
  };

  const pollExistingJob = async (attempts = 3, delayMs = 30) => {
    for (let i = 0; i < attempts; i++) {
      let row = await lookupJobByKey(key);
      if (row && !isTargetMatch(row)) {
        row = null;
      }
      if (row) {
        if (row.status === 'completed') {
          return { state: 'completed', job: row };
        }
        if (row.status === 'partial_failure' || row.status === 'failed') {
          return { state: 'resumable', job: row };
        }
        if (i === attempts - 1) {
          return { state: 'in_progress', job: row };
        }
      }
      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
    return { state: 'none', job: null };
  };

  try {
    let existing = await lookupJobByKey(key);
    if (existing && !isTargetMatch(existing) && normTargetEmail) {
      key = `${key}:${normTargetEmail}`;
      existing = await lookupJobByKey(key);
    }
    if (existing) {
      if (existing.status === 'completed') {
        return {
          claimed: false,
          replayed: true,
          alreadyCompleted: true,
          operationId: existing.operation_id || resolvedOpId,
          job: existing
        };
      }
      if (existing.status === 'running' || existing.status === 'in_progress') {
        const waited = await pollExistingJob(3, 35);
        if (waited.state === 'completed' && waited.job) {
          return {
            claimed: false,
            replayed: true,
            alreadyCompleted: true,
            operationId: waited.job.operation_id || resolvedOpId,
            job: waited.job
          };
        }
        if (waited.state === 'resumable' && waited.job) {
          return buildResumedReturn(waited.job);
        }
        if (waited.state === 'in_progress') {
          return {
            claimed: false,
            inProgress: true,
            inProgressConflict: true,
            operationId: waited.job?.operation_id || resolvedOpId,
            job: waited.job || existing
          };
        }
      }
      if (existing.status === 'partial_failure' || existing.status === 'failed') {
        const resumedOpId = existing.operation_id || resolvedOpId;
        const resumedJob = {
          ...existing,
          operation_id: resumedOpId,
          idempotency_key: key,
          status: 'running',
          retry_count: Number(existing.retry_count || 0) + 1,
          updated_at: new Date().toISOString()
        };
        if (!globalThis.__ktnProvisioningJobsMap) globalThis.__ktnProvisioningJobsMap = new Map();
        globalThis.__ktnProvisioningJobsMap.set(resumedOpId, resumedJob);
        if (!globalThis.__ktnIdempotencyJobMap) globalThis.__ktnIdempotencyJobMap = new Map();
        globalThis.__ktnIdempotencyJobMap.set(key, resumedJob);
        const patchRes = await supabaseRequest(env, `ktn_provisioning_jobs?operation_id=eq.${encodeURIComponent(resumedOpId)}`, {
          method: 'PATCH',
          body: {
            status: 'running',
            retry_count: resumedJob.retry_count,
            updated_at: resumedJob.updated_at
          }
        });
        if ((!patchRes || !patchRes.ok) && patchRes?.status === 404) {
          const idemSafeId = 'PJOB-' + String(key).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
          await supabaseRequest(env, 'ktn_dlp_alerts', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates,return=representation',
            body: {
              id: idemSafeId,
              room_id: 'PROVISIONING_JOB',
              sender_email: resumedJob.actor_email || actorEmail || 'admin',
              sender_name: resumedJob.target_email || targetEmail || 'system',
              sender_role: resumedJob.target_role || targetRole || 'admin',
              blocked_content: JSON.stringify(resumedJob),
              reason: 'IDEM:' + key,
              created_at: resumedJob.updated_at
            }
          });
        }
        return buildResumedReturn(resumedJob);
      }
    }

    const nowIso = new Date().toISOString();
    const initialRow = {
      operation_id: resolvedOpId,
      idempotency_key: key,
      job_type: jobType || 'student_create',
      actor_email: actorEmail || 'admin',
      target_email: targetEmail,
      target_role: targetRole,
      status: 'running',
      sync_status: 'pending',
      completed_steps: [],
      request_payload: sanitizeAuditPayload(requestPayload),
      created_at: nowIso,
      updated_at: nowIso
    };

    // Strict INSERT without resolution=merge-duplicates so PostgreSQL UNIQUE constraint detects cross-instance races
    const insRes = await supabaseRequest(env, 'ktn_provisioning_jobs', {
      method: 'POST',
      prefer: 'return=representation',
      body: initialRow
    });

    if (insRes.status === 409) {
      const raced = await pollExistingJob(4, 35);
      if (raced.state === 'completed' && raced.job) {
        return {
          claimed: false,
          replayed: true,
          alreadyCompleted: true,
          operationId: raced.job.operation_id || resolvedOpId,
          job: raced.job
        };
      }
      if (raced.state === 'resumable' && raced.job) {
        return buildResumedReturn(raced.job);
      }
      return {
        claimed: false,
        inProgress: true,
        inProgressConflict: true,
        operationId: raced.job?.operation_id || resolvedOpId,
        job: raced.job || initialRow
      };
    }

    const claimedRow = (insRes.ok && Array.isArray(insRes.data) && insRes.data[0]) ? insRes.data[0] : initialRow;
    if (!globalThis.__ktnProvisioningJobsMap) globalThis.__ktnProvisioningJobsMap = new Map();
    globalThis.__ktnProvisioningJobsMap.set(resolvedOpId, claimedRow);
    if (!globalThis.__ktnIdempotencyJobMap) globalThis.__ktnIdempotencyJobMap = new Map();
    globalThis.__ktnIdempotencyJobMap.set(key, claimedRow);
    return {
      claimed: true,
      operationId: resolvedOpId,
      completedSteps: [],
      cognitoUserId: null,
      izteachStudentId: null,
      job: claimedRow
    };
  } catch {}

  return {
    claimed: true,
    operationId: resolvedOpId,
    completedSteps: [],
    cognitoUserId: null,
    izteachStudentId: null,
    job: null
  };
}

async function logSyncEvent(env, evt) {
  const safeStatus = evt.status || evt.syncStatus || 'synced';
  const safeEntityKey = String(evt.entityKey || evt.entityId || '').trim();
  const record = {
    id: evt.id || generateOperationId('SYNC'),
    operation_id: evt.operationId || null,
    event_type: evt.eventType || 'reconcile',
    source_system: evt.sourceSystem || 'worker',
    target_system: evt.targetSystem || 'both',
    entity_type: evt.entityType || 'student',
    entity_id: safeEntityKey || null,
    entity_key: safeEntityKey,
    status: safeStatus,
    sync_status: safeStatus,
    drift_code: evt.driftCode || null,
    error_code: evt.errorCode || null,
    error_message: evt.errorMessage || null,
    details: sanitizeAuditPayload(evt.details || {}),
    created_by: evt.createdBy || 'system',
    created_at: new Date().toISOString()
  };
  if (!globalThis.__ktnRecentSyncEvents) globalThis.__ktnRecentSyncEvents = [];
  globalThis.__ktnRecentSyncEvents.unshift(record);
  if (globalThis.__ktnRecentSyncEvents.length > 200) {
    globalThis.__ktnRecentSyncEvents.length = 200;
  }
  try {
    await supabaseRequest(env, 'ktn_sync_events', {
      method: 'POST',
      body: record
    });
  } catch {}
  return record;
}

const ORDER_META_MARKER = '<!--KTN_ORDER_META:';
const ORDER_META_PREFIX = '\n<!--KTN_ORDER_META:';
const ORDER_META_SUFFIX = '-->';

function extractOrderMetaFromRow(ord = {}) {
  const rawNote = String(ord.note || '');
  let customerNote = rawNote;
  let embedded = {};
  const idx = rawNote.lastIndexOf(ORDER_META_MARKER);
  if (idx !== -1 && rawNote.endsWith(ORDER_META_SUFFIX)) {
    customerNote = rawNote.slice(0, idx).trim();
    const jsonPart = rawNote.slice(idx + ORDER_META_MARKER.length, rawNote.length - ORDER_META_SUFFIX.length);
    try {
      embedded = JSON.parse(jsonPart) || {};
    } catch {
      embedded = {};
    }
  }
  return {
    customerNote,
    meta: {
      parent_name: String(ord.parent_name ?? embedded.parent_name ?? '').trim(),
      contact_status: String(ord.contact_status ?? embedded.contact_status ?? 'not_called').trim(),
      contact_note: String(ord.contact_note ?? embedded.contact_note ?? '').trim(),
      contact_updated_at: ord.contact_updated_at ?? embedded.contact_updated_at ?? null,
      contact_updated_by: ord.contact_updated_by ?? embedded.contact_updated_by ?? null,
      payment_sub_status: String(ord.payment_sub_status ?? embedded.payment_sub_status ?? '').trim(),
      payment_verified_by: ord.payment_verified_by ?? embedded.payment_verified_by ?? null,
      payment_verified_at: ord.payment_verified_at ?? embedded.payment_verified_at ?? null,
      payment_tx_ref: String(ord.payment_tx_ref ?? embedded.payment_tx_ref ?? '').trim(),
      payment_received_amount: (ord.payment_received_amount ?? embedded.payment_received_amount) !== undefined
        ? Number(ord.payment_received_amount ?? embedded.payment_received_amount)
        : null,
      payment_proof_auto: Boolean(ord.payment_proof_auto ?? embedded.payment_proof_auto),
      processed_tx_ids: Array.isArray(ord.processed_tx_ids ?? embedded.processed_tx_ids)
        ? (ord.processed_tx_ids ?? embedded.processed_tx_ids)
        : [],
      source: String(ord.source ?? embedded.source ?? 'website').trim(),
      account_created: (ord.account_created ?? embedded.account_created) !== undefined
        ? Boolean(ord.account_created ?? embedded.account_created)
        : null,
      credential_handed_off: Boolean(ord.credential_handed_off ?? embedded.credential_handed_off),
      credential_handed_off_at: ord.credential_handed_off_at ?? embedded.credential_handed_off_at ?? null,
      credential_handed_off_by: ord.credential_handed_off_by ?? embedded.credential_handed_off_by ?? null,
      provisioning_status: String(ord.provisioning_status ?? embedded.provisioning_status ?? '').trim(),
      last_sync_error: ord.last_sync_error ?? embedded.last_sync_error ?? null,
      update_profile_phone: Boolean(ord.update_profile_phone ?? embedded.update_profile_phone),
      v2_managed: Boolean(ord.v2_managed ?? embedded.v2_managed)
    }
  };
}

function serializeOrderNoteWithMeta(customerNote, meta = {}) {
  const cleanNote = String(customerNote || '').replace(/\n?<!--KTN_ORDER_META:[\s\S]*?-->$/, '').trim();
  const safeMeta = sanitizeAuditPayload(meta || {});
  return `${cleanNote}${ORDER_META_PREFIX}${JSON.stringify(safeMeta)}${ORDER_META_SUFFIX}`;
}

async function resolveServerCoursePrice(env, courseId) {
  const cid = String(courseId || DEFAULT_COURSE_ID).trim();
  const baseCourse = MASTER_PRODUCT_MAPPING[cid] || null;
  let configPrices = {};
  let defaultAmount = 890000;
  let paymentConfig = null;
  try {
    const cfgRes = await supabaseRequest(env, 'ktn_payment_config?id=eq.default&limit=1');
    if (cfgRes.ok && Array.isArray(cfgRes.data) && cfgRes.data[0]) {
      paymentConfig = cfgRes.data[0];
      if (paymentConfig.course_prices && typeof paymentConfig.course_prices === 'object') {
        configPrices = paymentConfig.course_prices;
      }
      if (Number(paymentConfig.default_amount) > 0) {
        defaultAmount = Number(paymentConfig.default_amount);
      }
    }
  } catch {}
  let dbCourse = null;
  try {
    const dbRes = await supabaseRequest(env, `ktn_courses?course_id=eq.${encodeURIComponent(cid)}&limit=1`);
    if (dbRes.ok && Array.isArray(dbRes.data) && dbRes.data[0]) {
      dbCourse = dbRes.data[0];
    }
  } catch {}
  const validCourse = Boolean(baseCourse || dbCourse);
  const priceFromConfig = Number(configPrices[cid]);
  const priceFromDb = Number(dbCourse?.price);
  const priceFromMaster = Number(baseCourse?.price);
  const authoritativePrice = (priceFromConfig > 0)
    ? priceFromConfig
    : ((priceFromDb > 0) ? priceFromDb : ((priceFromMaster > 0) ? priceFromMaster : defaultAmount));
  const title = dbCourse?.title || baseCourse?.title || '';
  const shortTitle = dbCourse?.short_title || baseCourse?.shortTitle || title;
  return {
    validCourse,
    courseId: cid,
    title,
    shortTitle,
    price: authoritativePrice,
    paymentConfig
  };
}

function isSyntheticPlaceholderEmail(email) {
  const e = normalizeEmail(email || '');
  if (!e) return true;
  if (/^hv_[0-9]+@gmail\.com$/i.test(e)) return true;
  if (/@pending\.khongtunhi\.local$/i.test(e)) return true;
  return false;
}

function buildVietQrPaymentInfo(paymentConfig, orderId, amount) {
  const bankId = paymentConfig?.bank_id || 'MB';
  const bankName = paymentConfig?.bank_name || 'MBBank';
  const accountNo = paymentConfig?.account_no || '0987654321';
  const accountName = paymentConfig?.account_name || 'HOC VIEN KHONG TU NHI';
  const transferContent = `KTN ${orderId}`;
  const qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(bankId)}-${encodeURIComponent(accountNo)}-compact2.png?amount=${encodeURIComponent(String(amount || 0))}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(accountName)}`;
  return {
    bankId,
    bankName,
    accountNo,
    accountNumber: accountNo,
    accountName,
    amount: Number(amount) || 0,
    transferContent,
    qrUrl
  };
}

function enrichOrderForResponse(ord, existingStudentMap = null) {
  const { customerNote, meta } = extractOrderMetaFromRow(ord);
  const isApproved = ord.approval_status === 'approved';
  const hasAssigned = Boolean(ord.assigned_user_id);
  const rawEmail = normalizeEmail(ord.student_email || '');
  const hasRealEmail = Boolean(rawEmail && !isSyntheticPlaceholderEmail(rawEmail));
  const matchedStudent = (existingStudentMap && hasRealEmail) ? existingStudentMap.get(rawEmail) : null;

  const contactStatus = meta.contact_status || 'not_called';
  let paymentDetailedStatus = meta.payment_sub_status || '';
  if (ord.payment_status === 'paid') {
    paymentDetailedStatus = 'verified_paid';
  } else if (ord.payment_status === 'refunded' || paymentDetailedStatus === 'refunded') {
    paymentDetailedStatus = 'refunded';
  } else if (
    paymentDetailedStatus === 'underpaid' ||
    paymentDetailedStatus === 'mismatch' ||
    paymentDetailedStatus === 'amount_mismatch'
  ) {
    paymentDetailedStatus = 'amount_mismatch';
  } else if (paymentDetailedStatus === 'customer_reported') {
    paymentDetailedStatus = 'customer_reported';
  } else if (paymentDetailedStatus === 'checking_tx' || paymentDetailedStatus === 'verifying_tx') {
    paymentDetailedStatus = 'verifying_tx';
  } else {
    paymentDetailedStatus = 'unpaid';
  }

  const provStatus =
    ord.provisioning_status ||
    meta.provisioning_status ||
    (isApproved && hasAssigned ? 'synced' : (isApproved ? 'partial_failure' : 'pending'));
  let accountDetailedStatus = 'no_account';
  if (provStatus === 'partial_failure' || provStatus === 'sync_failed') {
    accountDetailedStatus = 'sync_error';
  } else if (isApproved && hasAssigned) {
    if (meta.credential_handed_off) {
      accountDetailedStatus = 'credentials_handed_off';
    } else if (meta.account_created === true) {
      accountDetailedStatus = 'awaiting_password_or_handoff';
    } else {
      accountDetailedStatus = 'activated';
    }
  } else if (hasAssigned || matchedStudent) {
    accountDetailedStatus = 'existing_account';
  } else if (ord.payment_status === 'paid') {
    accountDetailedStatus = 'pending_creation';
  } else {
    accountDetailedStatus = 'no_account';
  }

  let studentTrackerStage = 'received';
  if (
    provStatus === 'partial_failure' ||
    provStatus === 'sync_failed' ||
    paymentDetailedStatus === 'amount_mismatch' ||
    paymentDetailedStatus === 'mismatch'
  ) {
    studentTrackerStage = 'needs_support';
  } else if (isApproved && hasAssigned) {
    studentTrackerStage = 'unlocked';
  } else if (isApproved && !hasAssigned) {
    studentTrackerStage = 'activating';
  } else if (ord.payment_status === 'paid') {
    studentTrackerStage = 'payment_verified';
  } else if (
    paymentDetailedStatus === 'customer_reported' ||
    paymentDetailedStatus === 'verifying_tx' ||
    paymentDetailedStatus === 'checking_tx' ||
    contactStatus === 'called'
  ) {
    studentTrackerStage = 'awaiting_payment';
  } else if (
    contactStatus === 'no_answer' ||
    contactStatus === 'callback' ||
    contactStatus === 'callback_scheduled'
  ) {
    studentTrackerStage = 'contacted';
  }

  const STAGE_LABELS = {
    received: 'Đã tiếp nhận',
    contacted: 'Đã liên hệ',
    awaiting_payment: 'Chờ thanh toán',
    payment_verified: 'Đã xác minh thanh toán',
    activating: 'Đang kích hoạt',
    unlocked: 'Đã mở khóa',
    needs_support: 'Cần hỗ trợ'
  };

  const cleanPhone = String(ord.phone || '').trim();
  const digitsOnly = cleanPhone.replace(/\D/g, '');
  const zaloUrl = /^0\d{9}$/.test(digitsOnly) ? `https://zalo.me/${digitsOnly}` : null;
  const masterCourse = MASTER_PRODUCT_MAPPING[ord.course_id] || null;
  const serverCoursePrice = Number(masterCourse?.price || ord.amount) || 890000;
  const amountValid = Number(ord.amount) > 0 && (!masterCourse || Number(ord.amount) === Number(masterCourse.price));
  const sourceVal = meta.source || 'website';

  return {
    ...ord,
    id: ord.order_id || ord.id,
    order_id: ord.order_id || ord.id,
    note: customerNote,
    customer_note: customerNote,
    student_email: hasRealEmail ? rawEmail : '',
    raw_student_email: rawEmail,
    has_valid_email: hasRealEmail,
    parent_name: meta.parent_name || '',
    parent_phone: cleanPhone,
    zalo_url: zaloUrl,
    contact_status: contactStatus,
    contact_note: meta.contact_note || '',
    consultation_note: meta.contact_note || '',
    contact_updated_at: meta.contact_updated_at || null,
    contact_updated_by: meta.contact_updated_by || null,
    payment_detailed_status: paymentDetailedStatus,
    payment_verified_by: meta.payment_verified_by || null,
    payment_verified_at: meta.payment_verified_at || null,
    payment_tx_ref: meta.payment_tx_ref || '',
    payment_received_amount: meta.payment_received_amount,
    payment_proof_auto: Boolean(meta.payment_proof_auto),
    payment_proof_source: meta.payment_proof_auto
      ? 'webhook_auto'
      : (meta.payment_verified_by ? 'admin_manual' : null),
    source: sourceVal,
    source_label: sourceVal === 'authenticated_student' ? 'Học viên đang đăng nhập' : 'Website',
    course_valid: Boolean(masterCourse || ord.course_id),
    amount_valid: amountValid,
    server_course_price: serverCoursePrice,
    account_detailed_status: accountDetailedStatus,
    account_created: meta.account_created,
    credential_handed_off: Boolean(meta.credential_handed_off),
    credential_handed_off_at: meta.credential_handed_off_at || null,
    credential_handed_off_by: meta.credential_handed_off_by || null,
    existing_student_code: matchedStudent?.code || null,
    existing_student_email: matchedStudent?.email || (hasAssigned ? rawEmail : null),
    existing_student: matchedStudent
      ? {
          code: matchedStudent.code,
          email: matchedStudent.email,
          name: matchedStudent.name,
          class_code: matchedStudent.class_code || null,
          online_courses_count: Array.isArray(matchedStudent.online_courses)
            ? matchedStudent.online_courses.length
            : 0
        }
      : null,
    student_tracker_stage: studentTrackerStage,
    student_tracker_label: STAGE_LABELS[studentTrackerStage] || 'Đã tiếp nhận',
    provisioningStatus: provStatus,
    last_sync_error: meta.last_sync_error || null
  };
}

/**
 * Orchestrator dùng chung cho cả Duyệt đơn thủ công (/api/ktn/orders/approve) và Duyệt tự động từ Webhook (/api/ktn/webhook/payment)
 * Giải quyết triệt để BUG BE-03 & BUG BE-04:
 * - Tách bạch trạng thái thanh toán (payment_status) và trạng thái cấp quyền (approval_status / provisioning_status)
 * - Kiểm tra kết quả của TỪNG bước ghi (izTeach account -> izTeach permissions -> Supabase ktn_orders -> Supabase ktn_students)
 * - Trả về partial_failure rõ ràng nếu izTeach thành công nhưng Supabase lỗi
 */
async function approveAndProvisionOrder(env, {
  orderId,
  orderInput = null,
  approvedBy = 'admin',
  paymentStatusOverride = undefined,
  classCode = undefined,
  operationId = undefined
}) {
  let opId = operationId || generateOperationId('PROV-ORD');
  const cleanOrderId = String(orderId || orderInput?.order_id || orderInput?.orderId || '').trim();
  if (!cleanOrderId) {
    return {
      ok: false,
      httpStatus: 400,
      operationId: opId,
      syncStatus: 'validation_error',
      retryable: false,
      completedSteps: [],
      failedStep: 'validate_order_id',
      message: 'Thiếu mã đơn hàng orderId.'
    };
  }

  return runWithProvisioningLock(`order_approve:${cleanOrderId}`, async () => {
    let order = orderInput || null;
    const ordLookup = await supabaseRequest(env, `ktn_orders?order_id=eq.${encodeURIComponent(cleanOrderId)}&limit=1`);
    if (ordLookup.ok && Array.isArray(ordLookup.data) && ordLookup.data[0]) {
      order = { ...(order || {}), ...ordLookup.data[0] };
    }
    if (!order) {
      return {
        ok: false,
        httpStatus: 404,
        operationId: opId,
        syncStatus: 'not_found',
        retryable: false,
        completedSteps: [],
        failedStep: 'lookup_order',
        message: 'Không tìm thấy đơn hàng ' + cleanOrderId
      };
    }

    const { customerNote, meta: orderMeta } = extractOrderMetaFromRow(order);

    const orderIdemKey = `order_approve:${cleanOrderId}`;
    const claim = await claimProvisioningJobAtomically(env, {
      operationId: opId,
      idempotencyKey: orderIdemKey,
      jobType: 'order_approve',
      actorEmail: approvedBy,
      targetEmail: normalizeEmail(order.student_email || order.studentEmail || ''),
      targetRole: 'student',
      requestPayload: { orderId: cleanOrderId, approvedBy, classCode }
    });
    if (claim.operationId) opId = claim.operationId;
    if (!claim.claimed && claim.alreadyCompleted && claim.job) {
      return {
        ok: true,
        httpStatus: 200,
        idempotentReplay: true,
        operationId: claim.job.operation_id || opId,
        orderId: cleanOrderId,
        syncStatus: 'synced',
        ...(claim.job.result_summary || {}),
        message: `Đơn hàng ${cleanOrderId} đã được duyệt và kích hoạt trước đó (Idempotent Replay).`
      };
    }
    if (!claim.claimed && claim.inProgressConflict) {
      return {
        ok: false,
        httpStatus: 409,
        idempotentConflict: true,
        retryable: true,
        operationId: claim.operationId || opId,
        orderId: cleanOrderId,
        syncStatus: 'in_progress',
        message: `Đơn hàng ${cleanOrderId} đang được xử lý bởi một tiến trình khác. Vui lòng đợi trong giây lát.`
      };
    }

    const completedSteps = Array.isArray(claim.completedSteps) ? [...claim.completedSteps] : [];
    const targetEmailNorm = normalizeEmail(order.student_email || order.studentEmail || '');
    const priorAccountCreated = Boolean(claim.job?.response_payload?.account_created_in_job);
    await saveProvisioningJobState(env, {
      operation_id: opId,
      idempotency_key: orderIdemKey,
      job_type: 'order_approve',
      actor_email: approvedBy,
      target_email: targetEmailNorm,
      target_role: 'student',
      status: 'running',
      sync_status: 'pending',
      completed_steps: completedSteps,
      request_payload: { orderId: cleanOrderId, approvedBy, classCode }
    });

    // Bước 1 & 2: Tạo/xác minh tài khoản & cấp quyền khóa học trên izTeach (hỗ trợ resume các bước đã hoàn tất)
    let prov = null;
    const orderCourseIds = resolveOrderCourseIds(order);
    const alreadyProvisionedOrderIzTeach =
      completedSteps.includes('izteach_account') &&
      completedSteps.includes('izteach_permissions') &&
      isValidCognitoUuid(claim.cognitoUserId);

    if (alreadyProvisionedOrderIzTeach) {
      const resumedPwd = priorAccountCreated
        ? await deriveDeterministicInitialPassword(env, opId, targetEmailNorm)
        : null;
      prov = {
        ok: true,
        verified: true,
        cognitoUserId: claim.cognitoUserId,
        izteachStudentId: claim.izteachStudentId || order.assigned_student_id || null,
        email: targetEmailNorm,
        name: String(order.student_name || order.studentName || targetEmailNorm.split('@')[0]).trim(),
        accountCreated: priorAccountCreated,
        existingAccount: !priorAccountCreated,
        credentialMode: priorAccountCreated ? 'new_account_initial_password' : 'existing_account_unchanged',
        initialPassword: resumedPwd,
        courseId: orderCourseIds[0] || DEFAULT_COURSE_ID,
        grantedCourseIds: orderCourseIds,
        allCourseIds: orderCourseIds
      };
    } else {
      prov = await provisionStudentOnIzTeach(env, {
        ...order,
        operationId: opId,
        cognito_user_id: order.cognito_user_id || order.assigned_user_id || claim.cognitoUserId || null,
        izteach_student_id: order.izteach_student_id || order.assigned_student_id || claim.izteachStudentId || null,
        preserveAccountCreated: priorAccountCreated
      });
    }

    if (!prov.ok) {
      if (isValidCognitoUuid(prov.cognitoUserId) && !completedSteps.includes('izteach_account')) {
        completedSteps.push('izteach_account');
      }
      const failedStepName = prov.failedStep || 'izteach_provision';
      const syncFailStatus = completedSteps.length > 0 ? 'partial_failure' : 'sync_failed';
      await saveProvisioningJobState(env, {
        operation_id: opId,
        status: completedSteps.length > 0 ? 'partial_failure' : 'failed',
        sync_status: syncFailStatus,
        completed_steps: completedSteps,
        failed_step: failedStepName,
        cognito_user_id: prov.cognitoUserId || claim.cognitoUserId || null,
        izteach_student_id: prov.izteachStudentId || claim.izteachStudentId || null,
        response_payload: {
          account_created_in_job: Boolean(prov.accountCreated || priorAccountCreated)
        },
        error_code: 'IZTEACH_PROVISION_FAILED',
        error_message: prov.error || 'Lỗi cấp quyền trên izTeach',
        retryable: true
      });
      try {
        const failedMeta = {
          ...orderMeta,
          account_created: Boolean(prov.accountCreated || priorAccountCreated),
          provisioning_status: syncFailStatus,
          last_sync_error: prov.error || 'IZTEACH_PROVISION_FAILED'
        };
        const errNow = new Date().toISOString();
        const errPatchRes = await supabaseRequest(env, `ktn_orders?order_id=eq.${encodeURIComponent(cleanOrderId)}`, {
          method: 'PATCH',
          body: {
            provisioning_status: syncFailStatus,
            note: serializeOrderNoteWithMeta(customerNote, failedMeta),
            updated_at: errNow
          }
        });
        if ((!errPatchRes || !errPatchRes.ok) && errPatchRes?.status === 400) {
          await supabaseRequest(env, `ktn_orders?order_id=eq.${encodeURIComponent(cleanOrderId)}`, {
            method: 'PATCH',
            body: {
              note: serializeOrderNoteWithMeta(customerNote, failedMeta),
              updated_at: errNow
            }
          });
        }
      } catch {}
      return {
        ok: false,
        httpStatus: 502,
        operationId: opId,
        orderId: cleanOrderId,
        syncStatus: syncFailStatus,
        retryable: true,
        completedSteps,
        failedStep: failedStepName,
        error: 'IZTEACH_PROVISION_FAILED',
        message: prov.error || 'Chưa cấp được quyền học trên izTeach.'
      };
    }

    if (!completedSteps.includes('izteach_account')) completedSteps.push('izteach_account');
    if (!completedSteps.includes('izteach_permissions')) completedSteps.push('izteach_permissions');

    // Bước 3: Cập nhật ktn_orders trên Supabase và KIỂM TRA KẾT QUẢ GHI
    const nowIso = new Date().toISOString();
    const resolvedPaymentStatus = paymentStatusOverride !== undefined
      ? paymentStatusOverride
      : (order.payment_status || order.paymentStatus || 'pending_verification');

    const updatedOrderMeta = {
      ...orderMeta,
      account_created: Boolean(prov.accountCreated),
      credential_handed_off: Boolean(orderMeta.credential_handed_off),
      provisioning_status: 'synced',
      last_sync_error: null
    };

    const baseOrderUpdatePayload = {
      order_id: cleanOrderId,
      student_name: String(order.student_name || order.studentName || prov.name || 'Học viên').trim(),
      student_email: prov.email,
      phone: String(order.phone || '').trim(),
      course_id: order.course_id || order.courseId || prov.courseId || DEFAULT_COURSE_ID,
      course_name: order.course_name || order.courseName || MASTER_PRODUCT_MAPPING[prov.courseId]?.title || 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
      amount: Number(order.amount) || 890000,
      payment_method: order.payment_method || order.paymentMethod || 'VietQR',
      payment_status: resolvedPaymentStatus,
      approval_status: 'approved',
      assigned_user_id: prov.cognitoUserId,
      assigned_student_id: prov.izteachStudentId,
      approved_at: nowIso,
      approved_by: approvedBy,
      note: serializeOrderNoteWithMeta(customerNote, updatedOrderMeta),
      updated_at: nowIso
    };

    const extOrderUpdatePayload = {
      ...baseOrderUpdatePayload,
      provisioning_status: 'synced',
      sync_status: 'synced',
      operation_id: opId
    };

    let ordWriteRes = await supabaseRequest(env, 'ktn_orders', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: extOrderUpdatePayload
    });
    if ((!ordWriteRes || !ordWriteRes.ok) && ordWriteRes?.status === 400) {
      ordWriteRes = await supabaseRequest(env, 'ktn_orders', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: baseOrderUpdatePayload
      });
    }

    const orderWriteOk = Boolean(ordWriteRes && ordWriteRes.ok && Array.isArray(ordWriteRes.data) && ordWriteRes.data.length > 0);
    if (orderWriteOk) {
      completedSteps.push('supabase_order_update');
    }

    // Bước 4: Cập nhật/cộng dồn khóa học vào bảng ktn_students trên Supabase và KIỂM TRA KẾT QUẢ GHI
    // Nếu đơn từ học viên đang đăng nhập và không chọn cập nhật SĐT hồ sơ, giữ nguyên SĐT hồ sơ hiện có (truyền undefined)
    const shouldPreserveProfilePhone = orderMeta.source === 'authenticated_student' && !orderMeta.update_profile_phone;
    const resolvedClassCode = classCode !== undefined
      ? classCode
      : (order.class_code || order.classCode || undefined);
    const studentCode = 'KTN-' + cleanOrderId.replace(/^ORD-/, '');
    const updatedStu = await mergeAndUpsertStudentCourses(env, {
      email: prov.email,
      name: prov.name,
      phone: shouldPreserveProfilePhone ? undefined : (order.phone || ''),
      parentName: orderMeta.parent_name ? orderMeta.parent_name : undefined,
      cognitoUserId: prov.cognitoUserId,
      izteachStudentId: prov.izteachStudentId,
      addCourseIds: prov.allCourseIds || prov.grantedCourseIds || [prov.courseId],
      classCode: resolvedClassCode,
      codeHint: studentCode,
      accountStatus: 'active',
      syncStatus: orderWriteOk ? 'synced' : 'partial_failure',
      lastSyncError: orderWriteOk ? null : 'SUPABASE_ORDER_UPDATE_FAILED'
    });

    const stuWriteOk = Boolean(updatedStu && updatedStu.ok !== false);
    if (stuWriteOk) {
      completedSteps.push('supabase_student_upsert');
    }

    if (!orderWriteOk || !stuWriteOk) {
      const failedStep = !orderWriteOk ? 'supabase_order_update' : 'supabase_student_upsert';
      if (!stuWriteOk && orderWriteOk) {
        try {
          const partialMeta = {
            ...updatedOrderMeta,
            provisioning_status: 'partial_failure',
            last_sync_error: 'SUPABASE_STUDENT_UPSERT_FAILED'
          };
          const partialNow = new Date().toISOString();
          const pRes = await supabaseRequest(env, `ktn_orders?order_id=eq.${encodeURIComponent(cleanOrderId)}`, {
            method: 'PATCH',
            body: {
              provisioning_status: 'partial_failure',
              sync_status: 'partial_failure',
              note: serializeOrderNoteWithMeta(customerNote, partialMeta),
              updated_at: partialNow
            }
          });
          if ((!pRes || !pRes.ok) && pRes?.status === 400) {
            await supabaseRequest(env, `ktn_orders?order_id=eq.${encodeURIComponent(cleanOrderId)}`, {
              method: 'PATCH',
              body: {
                note: serializeOrderNoteWithMeta(customerNote, partialMeta),
                updated_at: partialNow
              }
            });
          }
        } catch {}
      }
      await saveProvisioningJobState(env, {
        operation_id: opId,
        status: 'partial_failure',
        sync_status: 'partial_failure',
        completed_steps: completedSteps,
        failed_step: failedStep,
        cognito_user_id: prov.cognitoUserId,
        izteach_student_id: prov.izteachStudentId,
        error_code: failedStep.toUpperCase() + '_FAILED',
        error_message: 'Đã cấp quyền trên izTeach nhưng lưu dữ liệu vào Supabase chưa hoàn tất.',
        retryable: true
      });
      await logSyncEvent(env, {
        operationId: opId,
        eventType: 'order_approve',
        sourceSystem: 'izteach',
        targetSystem: 'supabase',
        entityType: 'order',
        entityKey: cleanOrderId,
        status: 'partial_failure',
        driftCode: !stuWriteOk ? 'A02_IZTEACH_WITHOUT_SUPABASE_STUDENT' : 'A08_ORDER_APPROVED_WITHOUT_COMPLETE_SYNC',
        errorCode: failedStep.toUpperCase() + '_FAILED',
        errorMessage: 'izTeach đã cấp quyền nhưng Supabase ghi thất bại ở bước ' + failedStep,
        details: { orderId: cleanOrderId, email: prov.email, completedSteps, failedStep },
        createdBy: approvedBy
      });
      return {
        ok: false,
        httpStatus: 502,
        operationId: opId,
        orderId: cleanOrderId,
        partialFailure: true,
        syncStatus: 'partial_failure',
        retryable: true,
        completedSteps,
        failedStep,
        cognitoUserId: prov.cognitoUserId,
        izteachStudentId: prov.izteachStudentId,
        studentEmail: prov.email,
        grantedCourseIds: prov.grantedCourseIds,
        allCourseIds: prov.allCourseIds,
        accountCreated: Boolean(prov.accountCreated),
        existingAccount: Boolean(prov.existingAccount),
        credentialMode: prov.credentialMode,
        defaultPassword: prov.initialPassword,
        initialPassword: prov.initialPassword,
        message: 'Đã cấp tài khoản/khóa học trên izTeach nhưng chưa lưu hoàn tất vào Supabase (' + failedStep + '). Vui lòng bấm Đồng bộ lại để hoàn tất.'
      };
    }

    await saveProvisioningJobState(env, {
      operation_id: opId,
      status: 'completed',
      sync_status: 'synced',
      completed_steps: completedSteps,
      failed_step: null,
      cognito_user_id: prov.cognitoUserId,
      izteach_student_id: prov.izteachStudentId,
      result_summary: {
        orderId: cleanOrderId,
        email: prov.email,
        grantedCourseIds: prov.grantedCourseIds,
        accountCreated: prov.accountCreated,
        existingAccount: prov.existingAccount
      }
    });

    return {
      ok: true,
      httpStatus: 200,
      operationId: opId,
      orderId: cleanOrderId,
      syncStatus: 'synced',
      completedSteps,
      failedStep: null,
      cognitoUserId: prov.cognitoUserId,
      izteachStudentId: prov.izteachStudentId,
      studentEmail: prov.email,
      grantedCourseIds: prov.grantedCourseIds,
      allCourseIds: prov.allCourseIds,
      student: updatedStu,
      order: enrichOrderForResponse(ordWriteRes.data[0]),
      accountCreated: Boolean(prov.accountCreated),
      existingAccount: Boolean(prov.existingAccount),
      credentialMode: prov.credentialMode,
      defaultPassword: prov.initialPassword,
      initialPassword: prov.initialPassword,
      message: `Đã duyệt đơn & kích hoạt cộng dồn ${prov.grantedCourseIds.length} khóa học trên izTeach và Supabase thành công!`
    };
  });
}

/**
 * Tự động đối chiếu quyền khóa học của 1 học viên trên izTeach và lưu đồng bộ vào Supabase ktn_students
 */
async function syncStudentEntitlementFromIzTeach(env, { email, name, phone, parentName, classCode, cognitoUserId, izteachStudentId, accessToken }) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;
  const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;

  const lifecycle = await getStudentLifecycleState(env, cleanEmail).catch(() => null);
  if (lifecycle && lifecycle.status === 'deleted') {
    return {
      email: cleanEmail,
      account_status: 'deleted',
      accountStatus: 'deleted',
      deleted: true
    };
  }

  let existingRow = null;
  const stuLookup = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(cleanEmail)}&limit=1`);
  if (stuLookup.ok && Array.isArray(stuLookup.data) && stuLookup.data[0]) {
    existingRow = stuLookup.data[0];
  }

  let resolvedCognitoUid = isValidCognitoUuid(cognitoUserId)
    ? cognitoUserId
    : (isValidCognitoUuid(existingRow?.cognito_user_id) ? existingRow.cognito_user_id : null);
  let resolvedStudentId = izteachStudentId || existingRow?.izteach_student_id || null;
  let resolvedName = name || existingRow?.name || cleanEmail.split('@')[0];
  let resolvedPhone = phone || existingRow?.phone || '';

  let adminToken = null;
  if (!resolvedCognitoUid) {
    adminToken = await getIzTeachAdminToken(env);
    if (adminToken) {
      try {
        const searchRes = await fetch(`${IZTEACH_ENDPOINTS.studentCrm}?vendorId=${encodeURIComponent(vendorId)}&email=${encodeURIComponent(cleanEmail)}`, {
          headers: { Authorization: adminToken }
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json().catch(() => null);
          const list = extractIzTeachStudentRecords(searchData);
          const found = list.find(u => normalizeEmail(u?.email || u?.user?.email) === cleanEmail);
          if (found) {
            const identity = extractIdentityFromIzTeachRecord(found);
            if (isValidCognitoUuid(identity.cognitoUserId)) {
              resolvedCognitoUid = identity.cognitoUserId;
            }
            resolvedStudentId = identity.izteachStudentId || resolvedStudentId;
            if (found.name && !name) resolvedName = found.name;
            if (found.phone && !phone) resolvedPhone = found.phone;
          }
        }
      } catch {}
    }
  }

  const isSuspended =
    lifecycle?.status === 'suspended' ||
    lifecycle?.status === 'archived' ||
    existingRow?.account_status === 'suspended' ||
    existingRow?.account_status === 'archived';
  const effectiveAccountStatus = lifecycle?.status || existingRow?.account_status || (isValidCognitoUuid(resolvedCognitoUid) ? 'active' : undefined);

  const izCourseIds = [];
  let fetchedIzPermOk = false;
  if (isValidCognitoUuid(resolvedCognitoUid) && !isSuspended) {
    const validIzAccessToken = (typeof accessToken === 'string' && accessToken.split('.').length === 3) ? accessToken : null;
    const tokenToUse = validIzAccessToken || adminToken || (await getIzTeachAdminToken(env));
    if (tokenToUse) {
      try {
        const pRes = await fetch(`${IZTEACH_ENDPOINTS.userPermission}?userId=${encodeURIComponent(resolvedCognitoUid)}&vendorId=${encodeURIComponent(vendorId)}`, {
          headers: { Authorization: tokenToUse }
        });
        if (pRes.ok) {
          const pData = await pRes.json().catch(() => null);
          if (isValidIzTeachPermissionPayload(pData)) {
            fetchedIzPermOk = true;
            for (const cid of extractIzTeachOnlineCourseIds(pData)) {
              izCourseIds.push(cid);
            }
          }
        }
      } catch {}
    }
  }

  // Chỉ đối soát thu hồi (replaceCourseIds) khi user-permission trả về cấu trúc onlineCourses hợp lệ (isValidIzTeachPermissionPayload)
  return mergeAndUpsertStudentCourses(env, {
    email: cleanEmail,
    name: resolvedName,
    phone: resolvedPhone,
    parentName,
    classCode,
    cognitoUserId: resolvedCognitoUid,
    izteachStudentId: resolvedStudentId,
    replaceCourseIds: isSuspended ? null : (fetchedIzPermOk ? izCourseIds : null),
    addCourseIds: isSuspended ? [] : (fetchedIzPermOk ? [] : izCourseIds),
    accountStatus: effectiveAccountStatus,
    syncStatus: isValidCognitoUuid(resolvedCognitoUid) ? 'synced' : undefined
  });
}

/**
 * Đồng bộ hàng loạt toàn bộ học viên từ izTeach về bảng ktn_students trên Supabase (Phân trang đầy đủ & tính toán Idempotent thực tế)
 * Đã sửa BUG BE-01: Khai báo đầy đủ tham số options = {} và bổ sung bảo vệ khi upstream rỗng, trùng lặp, rate-limit, retry, và phân trang nhiều trang.
 */
async function syncAllIzTeachStudentsToSupabase(env, options = {}) {
  const safeOptions = (options && typeof options === 'object') ? options : {};
  const adminToken = await getIzTeachAdminToken(env);
  if (!adminToken) return { ok: false, syncedCount: 0, error: 'Missing izTeach admin token' };
  const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
  let syncedCount = 0;
  const startedAtMs = Date.now();

  const fetchWithRetry = async (targetUrl, fetchInit, maxAttempts = 3) => {
    let lastRes = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const r = await fetch(targetUrl, fetchInit);
        if (r.ok) return r;
        lastRes = r;
        if ((r.status === 429 || r.status >= 500) && attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 40 * attempt));
          continue;
        }
        return r;
      } catch (err) {
        if (attempt >= maxAttempts) throw err;
        await new Promise(resolve => setTimeout(resolve, 40 * attempt));
      }
    }
    return lastRes;
  };

  try {
    // Lưu ý: Không truyền ?limit=500 ở trang 1 vì API Strapi/Mongo của izTeach coi limit là trường lọc.
    // Tuy nhiên nếu response từ studentCrm có metadata phân trang (totalPages / nextPage / hasMore), vòng lặp sẽ tải đầy đủ các trang tiếp theo.
    const searchRes = await fetchWithRetry(`${IZTEACH_ENDPOINTS.studentCrm}?vendorId=${encodeURIComponent(vendorId)}`, {
      headers: { Authorization: adminToken }
    });
    if (!searchRes || !searchRes.ok) {
      return { ok: false, syncedCount: 0, error: 'studentCrm status ' + (searchRes?.status || 'NETWORK_ERROR') };
    }
    const searchData = await searchRes.json().catch(() => null);
    const firstPageItems = Array.isArray(searchData?.data) ? searchData.data : (Array.isArray(searchData) ? searchData : []);
    const izList = [...firstPageItems];
    let pagesFetched = 1;
    const maxCrmPages = Math.min(25, Math.max(1, Number(safeOptions.maxPages || 20)));
    const declaredTotalPages = Number(
      searchData?.totalPages ||
      searchData?.pagination?.totalPages ||
      searchData?.meta?.totalPages ||
      (searchData?.total && firstPageItems.length > 0 ? Math.ceil(Number(searchData.total) / firstPageItems.length) : 1)
    ) || 1;

    if (declaredTotalPages > 1 || searchData?.hasMore === true || searchData?.nextPage) {
      for (let pageNum = 2; pageNum <= Math.min(maxCrmPages, Math.max(declaredTotalPages, 2)); pageNum++) {
        const nextRes = await fetchWithRetry(
          `${IZTEACH_ENDPOINTS.studentCrm}?vendorId=${encodeURIComponent(vendorId)}&page=${pageNum}`,
          { headers: { Authorization: adminToken } }
        );
        if (!nextRes || !nextRes.ok) break;
        const nextData = await nextRes.json().catch(() => null);
        const nextItems = Array.isArray(nextData?.data) ? nextData.data : (Array.isArray(nextData) ? nextData : []);
        if (nextItems.length === 0) break;
        izList.push(...nextItems);
        pagesFetched++;
        if (nextData?.hasMore === false && pageNum >= declaredTotalPages) break;
      }
    }

    // Lấy toàn bộ hồ sơ hiện có trong ktn_students bằng vòng lặp phân trang động (không giới hạn 2000 dòng)
    const dbList = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const pageRes = await supabaseRequest(env, `ktn_students?select=*&order=email.asc&limit=${pageSize}&offset=${offset}`);
      const pageRows = (pageRes.ok && Array.isArray(pageRes.data)) ? pageRes.data : [];
      dbList.push(...pageRows);
      if (pageRows.length < pageSize) break;
      offset += pageSize;
    }
    const supabaseBefore = dbList.length;

    // Bảo vệ an toàn: Nếu izTeach trả về mảng rỗng bất thường trong khi Supabase đã có học viên, không tự động thu hồi hay ghi đè!
    if (izList.length === 0 && supabaseBefore > 0 && !safeOptions.allowEmptyUpstream) {
      return {
        ok: false,
        skippedEmptyUpstream: true,
        izteachTotal: 0,
        supabaseBefore,
        syncedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        unchangedCount: supabaseBefore,
        failedCount: 0,
        error: 'UPSTREAM_EMPTY_STUDENT_LIST_PROTECTED'
      };
    }

    const lifecycleMap = await loadAllStudentLifecycleStates(env).catch(() => new Map());

    const byEmail = new Map();
    for (const row of dbList) {
      const em = normalizeEmail(row?.email || '');
      if (!em) continue;
      if (lifecycleMap.get(em)?.status === 'deleted') continue;
      byEmail.set(em, row);
    }

    let skippedCount = 0;
    let duplicateUpstreamCount = 0;
    const skippedReasons = [];
    const newStudentsNeedingPerm = [];
    const seenNeedPermEmails = new Set();
    const seenUpstreamEmails = new Set();
    const nowIso = new Date().toISOString();
    const upsertMap = new Map();

    const PLACEHOLDER_COURSE_REMAP = {
      '6a9502d28ef1e30002d38cd2': '65e769bd637339000870618f',
      '6acfe08c8ef1e30002d3933a': '66028938bfd6c90008b816e1',
      '6ad072d88ef1e30002d39481': '6638bd09a7367400085c7ab2',
      '6ad0d6bf8ef1e30002d3955a': '678d14b960eae20002ddf8fe',
      '6ad2fe038ef1e30002d397eb': '67a7290a5fdc26000238b4e9',
      '6ad440998ef1e30002d3995f': '67a869302ecb9c000257d966'
    };
    const normalizeOnlineCourseEntries = (arr) => {
      if (!Array.isArray(arr)) return [];
      const seen = new Set();
      const out = [];
      for (const item of arr) {
        let cid = String(item?.id || item?._id || item || '').trim();
        if (!cid) continue;
        if (PLACEHOLDER_COURSE_REMAP[cid]) cid = PLACEHOLDER_COURSE_REMAP[cid];
        if (cid === '6983672f409cc20002e530b8' || cid === '67bebce067dba000027d8119') continue;
        if (seen.has(cid)) continue;
        seen.add(cid);
        out.push({
          id: cid,
          title: MASTER_PRODUCT_MAPPING[cid]?.shortTitle || item?.title || 'Khóa học trực tuyến'
        });
      }
      return out;
    };

    // Giữ nguyên mọi học viên đã có trong Supabase (chuẩn hóa tên khóa học thật, giữ nguyên class_code trực tiếp)
    for (const [em, row] of byEmail.entries()) {
      const prevCourses = normalizeOnlineCourseEntries(row.online_courses);
      upsertMap.set(em, {
        code: row.code || ('KTN-' + Date.now().toString().slice(-6)),
        email: em,
        name: row.name || em.split('@')[0],
        phone: row.phone || '',
        cognito_user_id: isValidCognitoUuid(row.cognito_user_id) ? row.cognito_user_id : null,
        izteach_student_id: row.izteach_student_id || null,
        class_code: row.class_code || null,
        has_live_class: Boolean(row.class_code),
        has_online_courses: prevCourses.length > 0,
        online_courses: prevCourses,
        updated_at: row.updated_at || nowIso
      });
    }

    for (let i = 0; i < izList.length; i++) {
      const item = izList[i];
      const em = normalizeEmail(item?.email || '');
      if (!em || !em.includes('@')) {
        skippedCount++;
        if (skippedReasons.length < 10) {
          skippedReasons.push({ id: item?._id || item?.id || i, reason: 'INVALID_OR_EMPTY_EMAIL' });
        }
        continue;
      }
      const stuLife = lifecycleMap.get(em);
      if (stuLife && stuLife.status === 'deleted') {
        skippedCount++;
        if (skippedReasons.length < 10) {
          skippedReasons.push({ email: em, reason: 'DELETED_STUDENT_BLOCKED' });
        }
        continue;
      }
      if (seenUpstreamEmails.has(em)) {
        duplicateUpstreamCount++;
      }
      seenUpstreamEmails.add(em);

      const prev = upsertMap.get(em) || byEmail.get(em) || {};
      const cogId = isValidCognitoUuid(item.dynamoId)
        ? item.dynamoId
        : (isValidCognitoUuid(item.userId)
          ? item.userId
          : (isValidCognitoUuid(item.id) ? item.id : (prev.cognito_user_id || null)));
      const stuId = item._id || item.id || item.studentId || prev.izteach_student_id || null;
      const code = prev.code || ('KTN-IZ-' + (stuId ? String(stuId).slice(-6).toUpperCase() : String(i + 1).padStart(4, '0')));
      const prevCourses = Array.isArray(prev.online_courses) ? prev.online_courses : [];

      const mergedRow = {
        code,
        email: em,
        name: String(item.name || prev.name || em.split('@')[0]).trim(),
        phone: String(item.phone || prev.phone || '').trim(),
        cognito_user_id: cogId,
        izteach_student_id: stuId,
        class_code: prev.class_code || null,
        has_live_class: Boolean(prev.class_code),
        has_online_courses: prevCourses.length > 0,
        online_courses: prevCourses,
        updated_at: prev.updated_at || nowIso
      };
      upsertMap.set(em, mergedRow);

      const isStuSuspended = stuLife?.status === 'suspended' || prev?.account_status === 'suspended';
      const shouldQueryPerm = Boolean(
        !isStuSuspended && cogId && !seenNeedPermEmails.has(em) && (
          !byEmail.has(em) ||
          prevCourses.length === 0 ||
          safeOptions.reconcilePermissions !== false
        )
      );
      if (shouldQueryPerm) {
        seenNeedPermEmails.add(em);
        newStudentsNeedingPerm.push(mergedRow);
      }
    }

    // Truy vấn đầy đủ user-permission từ izTeach theo lô song song có giới hạn (batch size = 10)
    const PERM_BATCH_SIZE = Number(safeOptions.batchSize) > 0 ? Math.min(25, Number(safeOptions.batchSize)) : 10;
    let permissionErrorCount = 0;
    for (let b = 0; b < newStudentsNeedingPerm.length; b += PERM_BATCH_SIZE) {
      const batch = newStudentsNeedingPerm.slice(b, b + PERM_BATCH_SIZE);
      await Promise.all(batch.map(async (stuRow) => {
        try {
          const pRes = await fetchWithRetry(`${IZTEACH_ENDPOINTS.userPermission}?userId=${encodeURIComponent(stuRow.cognito_user_id)}&vendorId=${encodeURIComponent(vendorId)}`, {
            headers: { Authorization: adminToken }
          }, 2);
          if (pRes && pRes.ok) {
            const pData = await pRes.json().catch(() => null);
            if (!isValidIzTeachPermissionPayload(pData)) {
              permissionErrorCount++;
              return;
            }
            const cIds = extractIzTeachOnlineCourseIds(pData);
            if (cIds.length > 0 || !byEmail.has(stuRow.email) || safeOptions.reconcileAllPermissions) {
              const prevCourses = Array.isArray(stuRow.online_courses) ? stuRow.online_courses : [];
              stuRow.online_courses = normalizeOnlineCourseEntries(
                cIds.map(cid => {
                  const prevObj = prevCourses.find(c => String(c?.id || c?._id || c || '') === String(cid));
                  const prevTitle = typeof prevObj === 'object' && prevObj?.title && prevObj.title !== 'Khóa học trực tuyến' ? prevObj.title : '';
                  return {
                    id: cid,
                    title: MASTER_PRODUCT_MAPPING[cid]?.shortTitle || prevTitle || 'Khóa học trực tuyến'
                  };
                })
              );
              stuRow.has_online_courses = stuRow.online_courses.length > 0;
            }
          } else {
            permissionErrorCount++;
          }
        } catch {
          permissionErrorCount++;
        }
      }));
    }

    const allRows = Array.from(upsertMap.values());
    const changedRows = [];
    let createdCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    for (const row of allRows) {
      row.search_text = buildStudentSearchText(row);
      const orig = byEmail.get(row.email);
      if (!orig) {
        createdCount++;
        row.updated_at = nowIso;
        changedRows.push(row);
        continue;
      }
      const origCoursesSig = JSON.stringify(Array.isArray(orig.online_courses) ? orig.online_courses : []);
      const nextCoursesSig = JSON.stringify(Array.isArray(row.online_courses) ? row.online_courses : []);
      const hasDiff = (
        String(orig.name || '').trim() !== String(row.name || '').trim() ||
        String(orig.phone || '').trim() !== String(row.phone || '').trim() ||
        String(orig.cognito_user_id || '') !== String(row.cognito_user_id || '') ||
        String(orig.izteach_student_id || '') !== String(row.izteach_student_id || '') ||
        String(orig.class_code || '') !== String(row.class_code || '') ||
        Boolean(orig.has_live_class) !== Boolean(row.has_live_class) ||
        Boolean(orig.has_online_courses) !== Boolean(row.has_online_courses) ||
        origCoursesSig !== nextCoursesSig
      );
      if (hasDiff) {
        updatedCount++;
        row.updated_at = nowIso;
        changedRows.push(row);
      } else {
        unchangedCount++;
      }
    }

    let failedCount = 0;
    for (let i = 0; i < changedRows.length; i += 250) {
      const chunk = changedRows.slice(i, i + 250);
      let upRes = await supabaseRequest(env, 'ktn_students?on_conflict=email', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates',
        body: chunk
      });
      if ((!upRes || !upRes.ok) && upRes?.status === 400) {
        const baseChunk = chunk.map(({ search_text, ...rest }) => rest);
        upRes = await supabaseRequest(env, 'ktn_students?on_conflict=email', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates',
          body: baseChunk
        });
      }
      if (!upRes.ok) {
        failedCount += chunk.length;
      }
    }

    syncedCount = allRows.length - failedCount;
    const withOnlineCoursesCount = allRows.filter(r => r.has_online_courses && Array.isArray(r.online_courses) && r.online_courses.length > 0).length;
    const withLiveClassCount = allRows.filter(r => r.has_live_class && r.class_code).length;
    const summary = {
      ok: failedCount === 0,
      pagesFetched,
      izteachTotal: izList.length,
      supabaseBefore,
      syncedCount,
      createdCount,
      updatedCount,
      unchangedCount,
      skippedCount,
      duplicateUpstreamCount,
      permissionErrorCount,
      skippedReasons,
      failedCount,
      withOnlineCoursesCount,
      withLiveClassCount,
      durationMs: Date.now() - startedAtMs,
      syncedAt: nowIso,
      idempotent: (createdCount === 0 && updatedCount === 0 && failedCount === 0)
    };
    globalThis.__ktnLastSyncState = summary;
    return summary;
  } catch (err) {
    return { ok: false, syncedCount, error: err?.message || 'SYNC_ERROR' };
  }
}

// ============================================================================
// HỆ THỐNG VÒNG ĐỜI HỌC VIÊN, ĐỀ NGHỊ MỞ KHÓA & DIỄN ĐÀN HỎI ĐÁP THEO BÀI HỌC
// Dual-persistence: Bảng SQL chuyên biệt + ktn_dlp_alerts (tương thích 100% Live V2/V3)
// ============================================================================
const FORUM_POINTS_CONFIG = {
  substantive_answer: 1,
  marked_helpful: 2,
  accepted_answer: 3,
  verified_guidance_video: 5,
  long_pending_resolved: 2,
  daily_substantive_cap: 30,
  long_pending_threshold_ms: 12 * 3600 * 1000,
  ANSWER_CREATED: 1,
  HELPFUL_VOTE: 2,
  ACCEPTED_ANSWER: 3,
  VIDEO_ATTACHED: 5,
  LONG_PENDING_RESOLVED: 2,
  MIN_ANSWER_LENGTH: 15,
  LONG_PENDING_HOURS: 12,
  MAX_VIDEO_BYTES: 100 * 1024 * 1024
};

async function upsertStructuredAlertRecord(env, { id, roomId, senderEmail, senderName, senderRole, payload, reason }) {
  const nowIso = new Date().toISOString();
  const row = {
    id,
    room_id: roomId,
    sender_email: normalizeEmail(senderEmail || 'system@khongtunhi.com'),
    sender_name: String(senderName || senderEmail || 'KTN System').trim(),
    sender_role: ['student', 'teacher', 'admin', 'system'].includes(senderRole) ? senderRole : 'system',
    blocked_content: JSON.stringify(payload),
    reason: reason || roomId,
    resolved: true,
    created_at: payload?.createdAt || payload?.created_at || nowIso
  };
  let res = await supabaseRequest(env, 'ktn_dlp_alerts?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: row
  });
  if (!res || !res.ok) {
    res = await supabaseRequest(env, `ktn_dlp_alerts?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: {
        sender_email: row.sender_email,
        sender_name: row.sender_name,
        blocked_content: row.blocked_content,
        reason: row.reason
      }
    });
  }
  if (!res || !res.ok || (Array.isArray(res.data) && res.data.length === 0)) {
    const postRes = await supabaseRequest(env, 'ktn_dlp_alerts', {
      method: 'POST',
      prefer: 'return=representation',
      body: row
    });
    if (postRes && postRes.ok) res = postRes;
  }
  return { ok: Boolean(res && res.ok), status: res?.status || 500, payload };
}

async function loadTeacherDirectory(env) {
  const sbRes = await supabaseRequest(env, 'ktn_teachers?order=code.asc');
  const rows = (sbRes && sbRes.ok && Array.isArray(sbRes.data)) ? sbRes.data : [];
  return rows.map(t => {
    const tMeta = extractTeacherMetaFromRow(t);
    return {
      ...t,
      id: t.code || t.id || normalizeEmail(t.email || ''),
      code: t.code || t.id || '',
      email: normalizeEmail(t.email || ''),
      name: t.name || (t.email ? t.email.split('@')[0] : 'Giáo viên'),
      title: t.specialty || t.title || 'Giáo viên',
      assigned_classes: tMeta.assignedClasses,
      assigned_courses: tMeta.assignedCourses,
      cognito_user_id: tMeta.cognitoUserId || t.cognito_user_id || null,
      status: t.active === false ? 'locked' : 'active',
      active: t.active !== false
    };
  });
}

async function recordAdminAuditLog(env, logEntry = {}) {
  const nowIso = new Date().toISOString();
  const id = String(logEntry.id || `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`).trim();
  const row = {
    id,
    actor_email: normalizeEmail(logEntry.actorEmail || logEntry.actor_email || 'admin@khongtunhi.com'),
    actor_role: String(logEntry.actorRole || logEntry.actor_role || 'admin'),
    action_type: String(logEntry.action || logEntry.actionType || logEntry.action_type || 'ADMIN_ACTION'),
    target_type: String(logEntry.targetType || logEntry.target_type || 'system'),
    target_id: String(logEntry.targetId || logEntry.target_id || ''),
    reason: String(logEntry.reason || ''),
    metadata: logEntry.metadata || {},
    created_at: nowIso
  };
  await supabaseRequest(env, 'ktn_admin_audit_logs?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: row
  }).catch(() => null);
  await upsertStructuredAlertRecord(env, {
    id,
    roomId: 'ADMIN_AUDIT_LOG',
    senderEmail: row.actor_email,
    senderName: row.actor_email,
    senderRole: row.actor_role,
    payload: row,
    reason: row.action_type
  }).catch(() => null);
  return row;
}

async function loadAllStudentLifecycleStates(env) {
  const map = new Map();
  const res = await supabaseRequest(
    env,
    'ktn_dlp_alerts?room_id=eq.STUDENT_LIFECYCLE&order=created_at.desc&limit=1000'
  );
  if (res.ok && Array.isArray(res.data)) {
    for (const row of res.data) {
      try {
        const parsed = JSON.parse(row.blocked_content || '{}');
        const em = normalizeEmail(parsed.email || row.sender_email || String(row.id || '').replace(/^STU_LIFE_/, ''));
        if (em && !map.has(em)) {
          map.set(em, parsed);
        }
      } catch {}
    }
  }
  return map;
}

async function getStudentLifecycleState(env, email) {
  const cleanEmail = normalizeEmail(email || '');
  if (!cleanEmail) return null;
  const id = `STU_LIFE_${cleanEmail}`;
  const res = await supabaseRequest(
    env,
    `ktn_dlp_alerts?id=eq.${encodeURIComponent(id)}&room_id=eq.STUDENT_LIFECYCLE&limit=1`
  );
  if (res.ok && Array.isArray(res.data) && res.data[0]) {
    try {
      return JSON.parse(res.data[0].blocked_content || '{}');
    } catch {}
  }
  return null;
}

async function saveStudentLifecycleState(env, email, stateObj, actorSession) {
  const cleanEmail = normalizeEmail(email || '');
  const id = `STU_LIFE_${cleanEmail}`;
  const nowIso = new Date().toISOString();
  const payload = {
    ...stateObj,
    email: cleanEmail,
    updatedAt: nowIso,
    updatedBy: actorSession?.email || 'admin@khongtunhi.com'
  };
  const saved = await upsertStructuredAlertRecord(env, {
    id,
    roomId: 'STUDENT_LIFECYCLE',
    senderEmail: cleanEmail,
    senderName: actorSession?.name || actorSession?.email || 'Quản lý KTN',
    senderRole: 'admin',
    payload,
    reason: `STUDENT_LIFECYCLE_${String(payload.status || 'active').toUpperCase()}`
  });
  // Thử đồng bộ thêm lên cột account_status của bảng ktn_students nếu schema V3 đã mở cột
  if (payload.status !== 'deleted') {
    await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(cleanEmail)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: {
        account_status: payload.status,
        updated_at: nowIso
      }
    }).catch(() => null);
  }
  return saved;
}

async function loadAllCourseGrantRequests(env) {
  const byId = new Map();
  const [tblRes, alertRes] = await Promise.all([
    supabaseRequest(env, 'ktn_course_grant_requests?order=created_at.desc&limit=500').catch(() => ({ ok: false })),
    supabaseRequest(env, 'ktn_dlp_alerts?room_id=eq.COURSE_GRANT_REQUEST&order=created_at.desc&limit=500')
  ]);
  if (tblRes && tblRes.ok && Array.isArray(tblRes.data)) {
    for (const r of tblRes.data) {
      if (r && r.id) byId.set(String(r.id), r);
    }
  }
  if (alertRes && alertRes.ok && Array.isArray(alertRes.data)) {
    for (const row of alertRes.data) {
      try {
        const parsed = JSON.parse(row.blocked_content || '{}');
        const id = String(parsed.id || row.id || '').trim();
        if (id && !byId.has(id)) {
          byId.set(id, parsed);
        } else if (id && byId.has(id)) {
          const prev = byId.get(id);
          if ((Date.parse(parsed.updated_at || parsed.updatedAt || '') || 0) >= (Date.parse(prev.updated_at || prev.updatedAt || '') || 0)) {
            byId.set(id, { ...prev, ...parsed });
          }
        }
      } catch {}
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => (Date.parse(b.created_at || b.createdAt || '') || 0) - (Date.parse(a.created_at || a.createdAt || '') || 0)
  );
}

async function saveCourseGrantRequest(env, reqObj, actorSession) {
  const id = String(reqObj.id || `CREQ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`).trim();
  const nowIso = new Date().toISOString();
  const normalized = {
    id,
    teacher_id: reqObj.teacher_id || reqObj.teacherId || actorSession?.code || actorSession?.email || '',
    teacher_email: normalizeEmail(reqObj.teacher_email || reqObj.teacherEmail || actorSession?.email || ''),
    teacher_name: String(reqObj.teacher_name || reqObj.teacherName || actorSession?.name || '').trim(),
    student_id: String(reqObj.student_id || reqObj.studentId || '').trim(),
    student_email: normalizeEmail(reqObj.student_email || reqObj.studentEmail || ''),
    student_name: String(reqObj.student_name || reqObj.studentName || '').trim(),
    class_code: String(reqObj.class_code || reqObj.classCode || '').trim().toUpperCase(),
    course_id: String(reqObj.course_id || reqObj.courseId || '').trim().toLowerCase(),
    course_title: String(reqObj.course_title || reqObj.courseTitle || '').trim(),
    reason: String(reqObj.reason || '').trim(),
    status: reqObj.status || 'pending',
    reviewed_by_email: reqObj.reviewed_by_email || reqObj.reviewedByEmail || null,
    reviewed_at: reqObj.reviewed_at || reqObj.reviewedAt || null,
    review_note: String(reqObj.review_note || reqObj.reviewNote || '').trim(),
    entitlement_result: reqObj.entitlement_result || reqObj.entitlementResult || null,
    created_at: reqObj.created_at || reqObj.createdAt || nowIso,
    updated_at: nowIso
  };
  await supabaseRequest(env, 'ktn_course_grant_requests?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: normalized
  }).catch(() => null);
  const alertSave = await upsertStructuredAlertRecord(env, {
    id,
    roomId: 'COURSE_GRANT_REQUEST',
    senderEmail: normalized.teacher_email,
    senderName: normalized.teacher_name || normalized.teacher_email,
    senderRole: actorSession?.role || 'teacher',
    payload: normalized,
    reason: `COURSE_GRANT_${String(normalized.status).toUpperCase()}`
  });
  return { ok: alertSave.ok, request: normalized };
}

async function loadAllForumQuestions(env, filters = {}) {
  const byId = new Map();
  const [tblRes, alertRes] = await Promise.all([
    supabaseRequest(env, 'ktn_forum_questions?order=created_at.desc&limit=500').catch(() => ({ ok: false })),
    supabaseRequest(env, 'ktn_dlp_alerts?room_id=eq.FORUM_QUESTION&order=created_at.desc&limit=500')
  ]);
  if (tblRes && tblRes.ok && Array.isArray(tblRes.data)) {
    for (const r of tblRes.data) {
      if (r && r.id) byId.set(String(r.id), r);
    }
  }
  if (alertRes && alertRes.ok && Array.isArray(alertRes.data)) {
    for (const row of alertRes.data) {
      try {
        const parsed = JSON.parse(row.blocked_content || '{}');
        const id = String(parsed.id || row.id || '').trim();
        if (!id) continue;
        const prev = byId.get(id);
        if (!prev || (Date.parse(parsed.updated_at || '') || 0) >= (Date.parse(prev.updated_at || '') || 0)) {
          byId.set(id, { ...(prev || {}), ...parsed });
        }
      } catch {}
    }
  }
  let list = Array.from(byId.values());
  if (filters.courseId) {
    const rawCid = String(filters.courseId).trim().toLowerCase();
    const canonicalCid = COURSE_CHAT_ALIASES[rawCid] || rawCid;
    list = list.filter(q => {
      const qCid = String(q.course_id || q.courseId || '').trim().toLowerCase();
      return (COURSE_CHAT_ALIASES[qCid] || qCid) === canonicalCid;
    });
  }
  if (filters.unitId) {
    const cleanUid = String(filters.unitId).trim().toLowerCase();
    list = list.filter(q => String(q.unit_id || q.unitId || '').trim().toLowerCase() === cleanUid);
  }
  if (!filters.includeHidden) {
    list = list.filter(q => q.status !== 'hidden');
  }
  if (filters.status && filters.status !== 'all') {
    if (filters.status === 'unanswered' || filters.status === 'open') {
      list = list.filter(q => q.status === 'open' || Number(q.answer_count || 0) === 0);
    } else if (filters.status === 'answered' || filters.status === 'resolved') {
      list = list.filter(q => q.status === 'answered' || q.status === 'resolved' || Number(q.answer_count || 0) > 0);
    } else {
      list = list.filter(q => q.status === filters.status);
    }
  }
  if (filters.q) {
    const normQ = normalizeViSearchText(filters.q);
    if (normQ) {
      list = list.filter(q => {
        const hay = normalizeViSearchText(`${q.title || ''} ${q.content || ''} ${q.lesson_title_snapshot || ''} ${q.student_name || ''}`);
        return hay.includes(normQ);
      });
    }
  }
  list.sort((a, b) => (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0));
  return list;
}

async function saveForumQuestion(env, qObj, actorSession) {
  const id = String(qObj.id || `FQ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`).trim();
  const nowIso = new Date().toISOString();
  const rawCid = String(qObj.course_id || qObj.courseId || '').trim().toLowerCase();
  const canonicalCourseId = COURSE_CHAT_ALIASES[rawCid] || rawCid;
  const normalized = {
    id,
    course_id: canonicalCourseId,
    unit_id: String(qObj.unit_id || qObj.unitId || '').trim(),
    lesson_num: Number(qObj.lesson_num || qObj.lessonNum) || 1,
    lesson_title_snapshot: String(qObj.lesson_title_snapshot || qObj.lessonTitleSnapshot || qObj.lessonTitle || '').trim(),
    student_id: String(qObj.student_id || qObj.studentId || actorSession?.code || actorSession?.id || '').trim(),
    student_email: normalizeEmail(qObj.student_email || qObj.studentEmail || actorSession?.email || ''),
    student_name: String(qObj.student_name || qObj.studentName || actorSession?.name || 'Học viên KTN').trim(),
    title: String(qObj.title || '').trim(),
    content: String(qObj.content || '').trim(),
    video_timestamp_seconds:
      qObj.video_timestamp_seconds !== undefined && qObj.video_timestamp_seconds !== null && Number.isFinite(Number(qObj.video_timestamp_seconds))
        ? Math.max(0, Math.floor(Number(qObj.video_timestamp_seconds)))
        : null,
    attachments: Array.isArray(qObj.attachments) ? qObj.attachments : [],
    status: qObj.status || 'open',
    claimed_by_teacher_id: qObj.claimed_by_teacher_id ?? null,
    claimed_by_teacher_email: qObj.claimed_by_teacher_email ?? null,
    claimed_by_teacher_name: qObj.claimed_by_teacher_name ?? null,
    claimed_at: qObj.claimed_at ?? null,
    assigned_teacher_id: qObj.assigned_teacher_id ?? null,
    skipped_by_emails: Array.isArray(qObj.skipped_by_emails) ? qObj.skipped_by_emails : [],
    answer_count: Number(qObj.answer_count) || 0,
    helpful_count: Number(qObj.helpful_count) || 0,
    first_answered_at: qObj.first_answered_at || null,
    created_at: qObj.created_at || nowIso,
    updated_at: nowIso
  };
  const { lesson_num, skipped_by_emails, ...sqlRow } = normalized;
  let qTblRes = await supabaseRequest(env, 'ktn_forum_questions?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: normalized
  }).catch(() => ({ ok: false }));
  if ((!qTblRes || !qTblRes.ok) && qTblRes?.status === 400 && normalized.status === 'claimed') {
    qTblRes = await supabaseRequest(env, 'ktn_forum_questions?on_conflict=id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: { ...normalized, status: 'open' }
    }).catch(() => ({ ok: false }));
  }
  if ((!qTblRes || !qTblRes.ok) && qTblRes?.status === 400) {
    qTblRes = await supabaseRequest(env, 'ktn_forum_questions?on_conflict=id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: sqlRow
    }).catch(() => ({ ok: false }));
    if ((!qTblRes || !qTblRes.ok) && qTblRes?.status === 400 && sqlRow.status === 'claimed') {
      await supabaseRequest(env, 'ktn_forum_questions?on_conflict=id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: { ...sqlRow, status: 'open' }
      }).catch(() => null);
    }
  }
  const alertSave = await upsertStructuredAlertRecord(env, {
    id,
    roomId: 'FORUM_QUESTION',
    senderEmail: normalized.student_email,
    senderName: normalized.student_name,
    senderRole: actorSession?.role || 'student',
    payload: normalized,
    reason: `FORUM_Q_${normalized.course_id}_${normalized.unit_id}`
  });
  return { ok: alertSave.ok, question: normalized };
}

async function loadAllForumAnswers(env, questionIds = null) {
  const byId = new Map();
  const [tblRes, alertRes] = await Promise.all([
    supabaseRequest(env, 'ktn_forum_answers?order=created_at.asc&limit=1000').catch(() => ({ ok: false })),
    supabaseRequest(env, 'ktn_dlp_alerts?room_id=eq.FORUM_ANSWER&order=created_at.asc&limit=1000')
  ]);
  if (tblRes && tblRes.ok && Array.isArray(tblRes.data)) {
    for (const r of tblRes.data) {
      if (r && r.id) byId.set(String(r.id), r);
    }
  }
  if (alertRes && alertRes.ok && Array.isArray(alertRes.data)) {
    for (const row of alertRes.data) {
      try {
        const parsed = JSON.parse(row.blocked_content || '{}');
        const id = String(parsed.id || row.id || '').trim();
        if (!id) continue;
        const prev = byId.get(id);
        if (!prev || (Date.parse(parsed.updated_at || '') || 0) >= (Date.parse(prev.updated_at || '') || 0)) {
          byId.set(id, { ...(prev || {}), ...parsed });
        }
      } catch {}
    }
  }
  let list = Array.from(byId.values());
  if (Array.isArray(questionIds) && questionIds.length > 0) {
    const qSet = new Set(questionIds.map(id => String(id)));
    list = list.filter(a => qSet.has(String(a.question_id || a.questionId || '')));
  }
  list.sort((a, b) => (Date.parse(a.created_at || '') || 0) - (Date.parse(b.created_at || '') || 0));
  return list;
}

async function saveForumAnswer(env, aObj, actorSession) {
  const id = String(aObj.id || `FA-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`).trim();
  const nowIso = new Date().toISOString();
  const normalized = {
    id,
    question_id: String(aObj.question_id || aObj.questionId || '').trim(),
    author_id: String(aObj.author_id || aObj.authorId || actorSession?.code || actorSession?.id || '').trim(),
    author_email: normalizeEmail(aObj.author_email || aObj.authorEmail || actorSession?.email || ''),
    author_name: String(aObj.author_name || aObj.authorName || actorSession?.name || 'Giáo viên KTN').trim(),
    author_role: ['teacher', 'admin', 'student'].includes(aObj.author_role || actorSession?.role)
      ? (aObj.author_role || actorSession?.role)
      : 'teacher',
    teacher_id: (aObj.author_role || actorSession?.role) !== 'student'
      ? String(aObj.teacher_id || aObj.teacherId || actorSession?.code || actorSession?.email || '').trim()
      : null,
    content: String(aObj.content || '').trim(),
    attachments: Array.isArray(aObj.attachments) ? aObj.attachments : [],
    video_url: aObj.video_url || aObj.videoUrl || null,
    video_key: aObj.video_key || aObj.videoKey || null,
    video_duration_seconds: Number(aObj.video_duration_seconds || aObj.videoDurationSeconds) || null,
    video_size_bytes: Number(aObj.video_size_bytes || aObj.videoSizeBytes || aObj.videoFileSize) || null,
    video_verified: Boolean(aObj.video_verified ?? aObj.videoVerified),
    is_accepted: Boolean(aObj.is_accepted ?? aObj.isAccepted),
    helpful_count: Number(aObj.helpful_count ?? aObj.helpfulCount) || 0,
    helpful_voter_emails: Array.isArray(aObj.helpful_voter_emails) ? aObj.helpful_voter_emails : [],
    status: aObj.status || 'visible',
    created_at: aObj.created_at || nowIso,
    updated_at: nowIso
  };
  await supabaseRequest(env, 'ktn_forum_answers?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: normalized
  }).catch(() => null);
  const alertSave = await upsertStructuredAlertRecord(env, {
    id,
    roomId: 'FORUM_ANSWER',
    senderEmail: normalized.author_email,
    senderName: normalized.author_name,
    senderRole: normalized.author_role,
    payload: normalized,
    reason: `FORUM_A_${normalized.question_id}`
  });
  return { ok: alertSave.ok, answer: normalized };
}

function normalizeForumFollowRecord(raw, fallbackEmail = '') {
  if (!raw || typeof raw !== 'object') return null;
  const qid = String(raw.question_id || raw.questionId || '').trim();
  const em = normalizeEmail(raw.user_email || raw.userEmail || fallbackEmail || '');
  if (!qid || !em) return null;
  const userId = String(raw.user_id || raw.userId || em).trim();
  const userRole = ['student', 'teacher', 'admin'].includes(raw.user_role || raw.userRole)
    ? (raw.user_role || raw.userRole)
    : 'student';
  const rawMode = String(raw.notify_mode || raw.notifyMode || 'immediate').trim().toLowerCase();
  const isExplicitUnfollow = raw.following === false || raw.isFollowing === false || rawMode === 'off';
  const notifyMode = isExplicitUnfollow
    ? 'off'
    : (['immediate', 'digest', 'off'].includes(rawMode) ? rawMode : 'immediate');
  const following = !isExplicitUnfollow && notifyMode !== 'off';
  const nowIso = new Date().toISOString();
  const createdAt = raw.created_at || raw.createdAt || nowIso;
  const updatedAt = raw.updated_at || raw.updatedAt || createdAt;
  return {
    id: raw.id || `FFOL-${qid}-${fnv1aHex(em)}`,
    question_id: qid,
    questionId: qid,
    user_id: userId,
    userId,
    user_email: em,
    userEmail: em,
    user_role: userRole,
    userRole,
    notify_mode: notifyMode,
    notifyMode,
    following,
    isFollowing: following,
    created_at: createdAt,
    createdAt,
    updated_at: updatedAt,
    updatedAt
  };
}

async function loadAllForumFollows(env, questionId = null, options = {}) {
  const byKey = new Map();
  const [tblRes, alertRes] = await Promise.all([
    supabaseRequest(env, 'ktn_forum_follows?order=created_at.desc&limit=1000').catch(() => ({ ok: false })),
    supabaseRequest(env, 'ktn_dlp_alerts?room_id=eq.FORUM_FOLLOW&order=created_at.desc&limit=1000')
  ]);
  if (tblRes && tblRes.ok && Array.isArray(tblRes.data)) {
    for (const row of tblRes.data) {
      const norm = normalizeForumFollowRecord(row);
      if (!norm) continue;
      const k = `${norm.question_id}|${norm.user_email}`;
      const prev = byKey.get(k);
      if (!prev || (Date.parse(norm.updated_at || norm.created_at || '') || 0) >= (Date.parse(prev.updated_at || prev.created_at || '') || 0)) {
        byKey.set(k, norm);
      }
    }
  }
  if (alertRes && alertRes.ok && Array.isArray(alertRes.data)) {
    for (const row of alertRes.data) {
      try {
        const parsed = JSON.parse(row.blocked_content || '{}');
        const norm = normalizeForumFollowRecord(
          { ...parsed, updated_at: parsed.updated_at || row.created_at },
          row.sender_email || ''
        );
        if (!norm) continue;
        const k = `${norm.question_id}|${norm.user_email}`;
        const prev = byKey.get(k);
        if (!prev || (Date.parse(norm.updated_at || '') || 0) >= (Date.parse(prev.updated_at || '') || 0)) {
          byKey.set(k, norm);
        }
      } catch {}
    }
  }
  let list = Array.from(byKey.values());
  if (!options || options.includeAll !== true) {
    list = list.filter(f => f.following !== false && f.notify_mode !== 'off');
  }
  if (questionId) {
    list = list.filter(f => String(f.question_id) === String(questionId));
  }
  return list;
}

async function saveForumFollow(env, params = {}) {
  const rawQid = params.questionId ?? params.question_id ?? '';
  const rawUserId = params.userId ?? params.user_id ?? '';
  const rawEmail = params.userEmail ?? params.user_email ?? '';
  const rawRole = params.userRole ?? params.user_role ?? 'student';
  const rawMode = params.notifyMode ?? params.notify_mode ?? 'immediate';
  const rawFollowing = params.following !== undefined
    ? Boolean(params.following)
    : (params.isFollowing !== undefined ? Boolean(params.isFollowing) : String(rawMode).toLowerCase() !== 'off');

  const cleanQid = String(rawQid || '').trim();
  const cleanEmail = normalizeEmail(rawEmail || '');
  const cleanUserId = String(rawUserId || cleanEmail).trim();
  const cleanRole = ['student', 'teacher', 'admin'].includes(rawRole) ? rawRole : 'student';
  const effectiveFollowing = Boolean(rawFollowing && String(rawMode).toLowerCase() !== 'off');
  const cleanNotifyMode = !effectiveFollowing
    ? 'off'
    : (['immediate', 'digest', 'off'].includes(String(rawMode).toLowerCase()) ? String(rawMode).toLowerCase() : 'immediate');

  const id = `FFOL-${cleanQid}-${fnv1aHex(cleanEmail)}`;
  const nowIso = new Date().toISOString();
  const payload = {
    id,
    question_id: cleanQid,
    questionId: cleanQid,
    user_id: cleanUserId,
    userId: cleanUserId,
    user_email: cleanEmail,
    userEmail: cleanEmail,
    user_role: cleanRole,
    userRole: cleanRole,
    notify_mode: cleanNotifyMode,
    notifyMode: cleanNotifyMode,
    following: effectiveFollowing,
    isFollowing: effectiveFollowing,
    created_at: nowIso,
    createdAt: nowIso,
    updated_at: nowIso,
    updatedAt: nowIso
  };
  if (cleanQid && cleanUserId) {
    const fullRow = {
      id,
      question_id: cleanQid,
      user_id: cleanUserId,
      user_email: cleanEmail,
      user_role: cleanRole,
      notify_mode: cleanNotifyMode,
      following: effectiveFollowing,
      created_at: nowIso,
      updated_at: nowIso
    };
    const fRes = await supabaseRequest(env, 'ktn_forum_follows?on_conflict=question_id,user_id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: fullRow
    }).catch(() => ({ ok: false, status: 500 }));
    if (!fRes.ok && fRes.status === 400) {
      await supabaseRequest(env, 'ktn_forum_follows?on_conflict=question_id,user_id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: {
          question_id: cleanQid,
          user_id: cleanUserId,
          user_email: cleanEmail,
          user_role: cleanRole,
          notify_mode: cleanNotifyMode,
          created_at: nowIso
        }
      }).catch(() => null);
    } else if (fRes.ok && cleanEmail) {
      await supabaseRequest(
        env,
        `ktn_forum_follows?question_id=eq.${encodeURIComponent(cleanQid)}&user_email=eq.${encodeURIComponent(cleanEmail)}`,
        {
          method: 'PATCH',
          body: {
            notify_mode: cleanNotifyMode,
            following: effectiveFollowing,
            updated_at: nowIso
          }
        }
      ).catch(() => null);
    }
  }
  await upsertStructuredAlertRecord(env, {
    id,
    roomId: 'FORUM_FOLLOW',
    senderEmail: cleanEmail,
    senderName: cleanEmail,
    senderRole: cleanRole,
    payload,
    reason: effectiveFollowing ? 'FORUM_FOLLOW_ACTIVE' : 'FORUM_FOLLOW_UNSUBSCRIBED'
  });
  return payload;
}

async function loadAllTeacherContributionEvents(env) {
  const byId = new Map();
  const [tblRes, alertRes] = await Promise.all([
    supabaseRequest(env, 'ktn_teacher_contribution_events?order=created_at.desc&limit=1000').catch(() => ({ ok: false })),
    supabaseRequest(env, 'ktn_dlp_alerts?room_id=eq.TEACHER_CONTRIBUTION&order=created_at.desc&limit=1000')
  ]);
  if (tblRes && tblRes.ok && Array.isArray(tblRes.data)) {
    for (const r of tblRes.data) {
      const eid = String(r?.event_id || r?.id || '').trim();
      if (eid) byId.set(eid, { ...r, event_id: eid });
    }
  }
  if (alertRes && alertRes.ok && Array.isArray(alertRes.data)) {
    for (const row of alertRes.data) {
      try {
        const parsed = JSON.parse(row.blocked_content || '{}');
        const eid = String(parsed.event_id || parsed.id || row.id || '').trim();
        if (eid && !byId.has(eid)) {
          byId.set(eid, { ...parsed, event_id: eid });
        }
      } catch {}
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0)
  );
}

async function recordTeacherContributionEvent(env, evt) {
  const eventId = String(evt.event_id || evt.eventId || `CONTRIB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`).trim();
  const existingEvents = await loadAllTeacherContributionEvents(env);
  const dup = existingEvents.find(e => String(e.event_id) === eventId);
  if (dup) {
    return { ok: true, idempotent: true, event: dup };
  }
  const nowIso = new Date().toISOString();
  const teacherEmail = normalizeEmail(evt.teacher_email || evt.teacherEmail || '');
  const normalized = {
    event_id: eventId,
    teacher_id: String(evt.teacher_id || evt.teacherId || teacherEmail).trim(),
    teacher_email: teacherEmail,
    teacher_name: String(evt.teacher_name || evt.teacherName || teacherEmail).trim(),
    question_id: evt.question_id || evt.questionId || null,
    answer_id: evt.answer_id || evt.answerId || null,
    event_type: evt.event_type || evt.eventType || 'substantive_answer',
    points_delta: Number(evt.points_delta ?? evt.pointsDelta) || 0,
    reason: String(evt.reason || '').trim(),
    actor_email: normalizeEmail(evt.actor_email || evt.actorEmail || teacherEmail),
    verified_at: evt.verified_at || nowIso,
    created_at: evt.created_at || nowIso
  };
  await supabaseRequest(env, 'ktn_teacher_contribution_events?on_conflict=event_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: normalized
  }).catch(() => null);
  await upsertStructuredAlertRecord(env, {
    id: eventId,
    roomId: 'TEACHER_CONTRIBUTION',
    senderEmail: teacherEmail,
    senderName: normalized.teacher_name,
    senderRole: 'teacher',
    payload: normalized,
    reason: `CONTRIB_${normalized.event_type.toUpperCase()}`
  });
  return { ok: true, idempotent: false, event: normalized };
}

function sanitizeForumQuestionForViewer(q, answers, follows, viewerSession) {
  const isStaff = viewerSession?.role === 'teacher' || viewerSession?.role === 'admin';
  const myEmail = normalizeEmail(viewerSession?.email || '');
  const isOwnQuestion = Boolean(myEmail && normalizeEmail(q.student_email || '') === myEmail);
  const allFollowRecords = Array.isArray(follows) ? follows : [];
  const activeFollows = allFollowRecords.filter(f => f && f.following !== false && f.notify_mode !== 'off');
  const myFollowRecord = myEmail
    ? allFollowRecords.find(f => normalizeEmail(f?.user_email || f?.userEmail || '') === myEmail)
    : null;
  const isFollowing = myFollowRecord
    ? (myFollowRecord.following !== false && myFollowRecord.notify_mode !== 'off')
    : Boolean(isOwnQuestion);
  const followNotifyMode = myFollowRecord
    ? (isFollowing ? (myFollowRecord.notify_mode || myFollowRecord.notifyMode || 'immediate') : 'off')
    : (isOwnQuestion ? 'immediate' : 'off');
  const courseMeta = MASTER_PRODUCT_MAPPING[q.course_id] || null;

  const normalizeAtt = att => {
    const u = String(att?.fileUrl || att?.url || '').trim();
    const nm = String(att?.title || att?.name || att?.fileName || 'Đính kèm').trim();
    const tp = String(att?.fileType || att?.type || att?.kind || att?.mediaType || 'image/jpeg').trim();
    const sz = Number(att?.size || 0);
    return {
      title: nm,
      name: nm,
      fileName: nm,
      fileUrl: u,
      url: u,
      fileType: tp,
      type: tp,
      kind: tp.startsWith('audio') ? 'audio' : (tp.startsWith('video') ? 'video' : (tp.includes('pdf') ? 'pdf' : 'image')),
      size: sz
    };
  };

  const cleanAnswers = (Array.isArray(answers) ? answers : [])
    .filter(a => isStaff || a.status !== 'hidden')
    .map(a => {
      const voters = Array.isArray(a.helpful_voter_emails) ? a.helpful_voter_emails.map(e => normalizeEmail(e)) : [];
      const isOwnAnswer = Boolean(myEmail && normalizeEmail(a.author_email || '') === myEmail);
      const hasVotedHelpful = Boolean(myEmail && voters.includes(myEmail));
      const normAttachments = Array.isArray(a.attachments) ? a.attachments.map(normalizeAtt) : [];
      return {
        id: a.id,
        questionId: a.question_id,
        question_id: a.question_id,
        authorId: a.author_id,
        author_id: a.author_id,
        authorName: a.author_name,
        author_name: a.author_name,
        authorRole: a.author_role,
        author_role: a.author_role,
        ...(isStaff || isOwnAnswer ? { authorEmail: a.author_email, author_email: a.author_email } : {}),
        teacherId: a.teacher_id || null,
        teacher_id: a.teacher_id || null,
        content: a.content,
        attachments: normAttachments,
        videoUrl: a.video_url || null,
        video_url: a.video_url || null,
        videoDurationSeconds: a.video_duration_seconds || null,
        video_duration_seconds: a.video_duration_seconds || null,
        videoSizeBytes: a.video_size_bytes || null,
        video_size_bytes: a.video_size_bytes || null,
        videoVerified: Boolean(a.video_verified),
        video_verified: Boolean(a.video_verified),
        isAccepted: Boolean(a.is_accepted),
        is_accepted: Boolean(a.is_accepted),
        helpfulCount: Number(a.helpful_count) || 0,
        helpful_count: Number(a.helpful_count) || 0,
        hasVotedHelpful,
        viewerHasVotedHelpful: hasVotedHelpful,
        isOwnAnswer,
        status: a.status || 'visible',
        createdAt: a.created_at,
        created_at: a.created_at,
        updatedAt: a.updated_at,
        updated_at: a.updated_at
      };
    });

  const acceptedAnswer = cleanAnswers.find(a => a.isAccepted) || null;
  const totalHelpful = cleanAnswers.reduce((acc, a) => acc + (Number(a.helpfulCount) || 0), 0);
  const normQuestionAttachments = Array.isArray(q.attachments) ? q.attachments.map(normalizeAtt) : [];
  const lessonNumVal = Number(q.lesson_num) || 1;
  const lessonTitleVal = q.lesson_title_snapshot || `Bài ${lessonNumVal}`;
  const studentIdVal = q.student_id || ('HS-' + fnv1aHex(q.student_email || q.id).slice(0, 6).toUpperCase());
  const studentNameVal = q.student_name || 'Học viên KTN';

  return {
    id: q.id,
    courseId: q.course_id,
    course_id: q.course_id,
    courseTitle: courseMeta?.shortTitle || courseMeta?.title || 'Khóa học Video KTN',
    unitId: q.unit_id,
    unit_id: q.unit_id,
    lessonNum: lessonNumVal,
    lesson_num: lessonNumVal,
    lesson_number: lessonNumVal,
    lessonTitleSnapshot: lessonTitleVal,
    lesson_title_snapshot: lessonTitleVal,
    studentId: studentIdVal,
    student_id: studentIdVal,
    studentName: studentNameVal,
    student_name: studentNameVal,
    // Bảo vệ quyền riêng tư: Học sinh không nhìn thấy email/SĐT cá nhân của học sinh khác
    ...(isStaff || isOwnQuestion ? { studentEmail: q.student_email, student_email: q.student_email } : {}),
    isOwnQuestion,
    title: q.title,
    content: q.content,
    videoTimestampSeconds: q.video_timestamp_seconds,
    video_timestamp_seconds: q.video_timestamp_seconds,
    attachments: normQuestionAttachments,
    status: q.status || 'open',
    claimedByTeacherId: q.claimed_by_teacher_id || null,
    claimed_by_teacher_id: q.claimed_by_teacher_id || null,
    claimedByTeacherEmail: isStaff ? (q.claimed_by_teacher_email || null) : undefined,
    claimedByEmail: isStaff ? (q.claimed_by_teacher_email || null) : undefined,
    claimed_by_teacher_email: isStaff ? (q.claimed_by_teacher_email || null) : undefined,
    claimed_by_email: isStaff ? (q.claimed_by_teacher_email || null) : undefined,
    claimedByTeacherName: q.claimed_by_teacher_name || null,
    claimedByName: q.claimed_by_teacher_name || null,
    claimed_by_teacher_name: q.claimed_by_teacher_name || null,
    claimed_by_name: q.claimed_by_teacher_name || null,
    claimedAt: q.claimed_at || null,
    claimed_at: q.claimed_at || null,
    assignedTeacherId: q.assigned_teacher_id || null,
    assigned_teacher_id: q.assigned_teacher_id || null,
    answerCount: cleanAnswers.length,
    answer_count: cleanAnswers.length,
    answersCount: cleanAnswers.length,
    answers_count: cleanAnswers.length,
    helpfulCount: totalHelpful,
    helpful_count: totalHelpful,
    acceptedAnswerId: acceptedAnswer?.id || null,
    accepted_answer_id: acceptedAnswer?.id || null,
    hasAcceptedAnswer: Boolean(acceptedAnswer),
    hasVideoAnswer: cleanAnswers.some(a => Boolean(a.videoUrl)),
    followCount: activeFollows.length,
    followerCount: activeFollows.length,
    isFollowing,
    followNotifyMode,
    answers: cleanAnswers,
    createdAt: q.created_at,
    created_at: q.created_at,
    updatedAt: q.updated_at,
    updated_at: q.updated_at
  };
}

export default {
  // ==========================================================================
  // 1. HẸN GIỜ TỰ ĐỘNG MỖI 24H CHỐNG NGỦ ĐÔNG SUPABASE & ĐỒNG BỘ HỌC VIÊN
  // ==========================================================================
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const cronExpr = String(event?.cron || '').trim();
      const scheduledMs = event?.scheduledTime && Number.isFinite(Number(event.scheduledTime))
        ? Number(event.scheduledTime)
        : Date.now();

      // 1. Luôn kiểm tra và gửi nhắc giờ học tự động (trước 30 phút / 10 phút) cho các lớp đã xác nhận lịch chính thức
      const reminderResult = await runClassScheduleReminders(env, { nowMs: scheduledMs }).catch((err) => ({
        ok: false,
        error: err?.message || 'REMINDER_CRON_ERROR'
      }));
      globalThis.__ktnLastReminderCronState = reminderResult;

      // 2. Đồng bộ học viên định kỳ mỗi ngày (0 3 * * *) hoặc khi kích hoạt không chỉ định cron cụ thể
      if (!cronExpr || cronExpr === '0 3 * * *') {
        await supabaseRequest(env, 'ktn_payment_config?select=id&limit=1');
        const syncResult = await syncAllIzTeachStudentsToSupabase(env, {
          source: 'cron',
          reconcilePermissions: true,
          batchSize: 10
        });
        await logSyncEvent(env, {
          eventType: 'cron_sync',
          sourceSystem: 'izteach',
          targetSystem: 'supabase',
          entityType: 'student',
          entityKey: 'ALL_STUDENTS',
          status: syncResult.ok ? 'synced' : 'sync_failed',
          errorMessage: syncResult.error || null,
          details: syncResult,
          createdBy: 'cron:scheduled'
        });
      }
    })());
  },

  // ==========================================================================
  // 2. XỬ LÝ HTTP REQUEST & CỔNG API /api/ktn/*
  // ==========================================================================
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Phục vụ Service Worker cho Hệ thống Thông báo PWA
    if (path === '/sw.js' || path === '/firebase-messaging-sw.js') {
      return new Response(buildSwScript(env.VAPID_PUBLIC_KEY), {
        status: 200,
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Service-Worker-Allowed': '/',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
    }

    // Phục vụ Manifest PWA
    if (path === '/manifest.json') {
      return new Response(MANIFEST_JSON, {
        status: 200,
        headers: {
          'Content-Type': 'application/manifest+json; charset=utf-8',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }

    // Phục vụ trực tiếp 3 trang con độc lập & client core từ CloudFront CDN
    const STANDALONE_CDN_FILES = {
      '/sll-hocsinh.html': 'text/html; charset=utf-8',
      '/sll-teacher.html': 'text/html; charset=utf-8',
      '/sll-admin.html': 'text/html; charset=utf-8',
      '/ktn-webapp-client.js': 'application/javascript; charset=utf-8'
    };
    if (STANDALONE_CDN_FILES[path]) {
      const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
      const s3OriginUrl = `https://online-learning-izteach-6-aws-source-bucket.s3-ap-southeast-1.amazonaws.com/resource/documents/${vendorId}/sofl-remake${path}`;
      const cdnRes = await fetch(s3OriginUrl, { cf: { cacheTtl: 15, cacheEverything: false } });
      if (cdnRes.ok) {
        return new Response(cdnRes.body, {
          status: 200,
          headers: {
            'Content-Type': STANDALONE_CDN_FILES[path],
            'Cache-Control': 'no-cache, must-revalidate',
            ...CORS_HEADERS
          }
        });
      }
    }

    // ------------------------------------------------------------------------
    // A. ĐĂNG NHẬP TỪ POPUP TRANG CHỦ -> CẤP THẺ TỪ & CHIA VỀ 3 TRANG CON
    // ------------------------------------------------------------------------
    if (path === '/api/ktn/auth/login' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const rawIdentifier = String(body.email || body.phone || body.code || body.username || '').trim();
      let email = normalizeEmail(rawIdentifier);
      const password = String(body.password || '');
      if (!email || !password) {
        return jsonResponse({ ok: false, message: 'Vui lòng nhập đầy đủ Email và Mật khẩu.' }, 400);
      }

      const ROTATED_ACCOUNTS_SET = new Set([
        'hocvienkhongtunhi123@gmail.com',
        'quanly@khongtunhi.com',
        'khongtunhi@gmail.com',
        'linh.lam@khongtunhi.com',
        'thu.ha@khongtunhi.com',
        'hoangngan@khongtunhi.com',
        'dachanh@khongtunhi.com',
        'minhkhang@khongtunhi.com',
        'taphong2002@gmail.com',
        'taphong2002vip@gmail.com',
        'e2e.hs.a@khongtunhi.com',
        'e2e.hs.b@khongtunhi.com'
      ]);

      const safeLookup = rawIdentifier.replace(/[,()]/g, '').trim();
      const safeLower = safeLookup.toLowerCase();
      if (
        safeLookup &&
        !safeLookup.includes('@') &&
        !ROTATED_ACCOUNTS_SET.has(email) &&
        email === `${safeLower}@khongtunhi.com`
      ) {
        const codeLookup = await supabaseRequest(
          env,
          `ktn_students?or=(code.ilike.${encodeURIComponent(safeLookup)},phone.eq.${encodeURIComponent(safeLookup)})&limit=5`
        );
        const matchedStudent = Array.isArray(codeLookup.data)
          ? codeLookup.data.find(
              (r) =>
                String(r?.code || '').trim().toLowerCase() === safeLower ||
                String(r?.phone || '').trim() === safeLookup
            )
          : null;
        if (matchedStudent?.email) {
          email = normalizeEmail(matchedStudent.email);
        } else {
          const teacherCodeLookup = await supabaseRequest(
            env,
            `ktn_teachers?or=(code.ilike.${encodeURIComponent(safeLookup)},phone.eq.${encodeURIComponent(safeLookup)})&limit=5`
          );
          const matchedTeacher = Array.isArray(teacherCodeLookup.data)
            ? teacherCodeLookup.data.find(
                (r) =>
                  String(r?.id || r?.code || '').trim().toLowerCase() === safeLower ||
                  String(r?.phone || '').trim() === safeLookup
              )
            : null;
          if (matchedTeacher?.email) {
            email = normalizeEmail(matchedTeacher.email);
          }
        }
      }
      const rotatedSecret = String(env.KTN_STAFF_AND_TEST_PASSWORD || '').trim();
      const adminSecret = String(env.IZTEACH_ADMIN_PASSWORD || '').trim();
      const isRotAdmin = email === 'hocvienkhongtunhi123@gmail.com' || email === 'quanly@khongtunhi.com' || email === 'khongtunhi@gmail.com';
      const matchesRotated = rotatedSecret.length >= 8 && password === rotatedSecret;
      const matchesAdminSecret = isRotAdmin && adminSecret.length >= 8 && adminSecret !== '123456' && password === adminSecret;

      if (ROTATED_ACCOUNTS_SET.has(email) && password.length < 8 && !matchesAdminSecret) {
        return jsonResponse({ ok: false, message: 'Mật khẩu cũ đã được thu hồi để bảo mật. Vui lòng đăng nhập bằng mật khẩu mới.' }, 401);
      }

      const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
      const b64Password = btoa(unescape(encodeURIComponent(password)));
      const loginPayload = JSON.stringify({ email, password: b64Password, vendorId });

      const [staffProbe, stuProbe] = await Promise.allSettled([
        fetch(IZTEACH_ENDPOINTS.staffSignin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: loginPayload }).then(async r => ({ ok: r.ok, data: await r.json().catch(() => null) })),
        fetch(IZTEACH_ENDPOINTS.studentSignin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: loginPayload }).then(async r => ({ ok: r.ok, data: await r.json().catch(() => null) }))
      ]);

      let staffHit = staffProbe.status === 'fulfilled' && staffProbe.value.ok && staffProbe.value.data?.accessToken ? staffProbe.value.data : null;
      const stuHit = stuProbe.status === 'fulfilled' && stuProbe.value.ok && stuProbe.value.data?.accessToken ? stuProbe.value.data : null;

      if (!staffHit && isRotAdmin) {
        try {
          const fallbackEmail = email === 'hocvienkhongtunhi123@gmail.com' ? 'quanly@khongtunhi.com' : 'hocvienkhongtunhi123@gmail.com';
          const fallbackPayload = JSON.stringify({ email: fallbackEmail, password: b64Password, vendorId });
          const fbRes = await fetch(IZTEACH_ENDPOINTS.staffSignin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: fallbackPayload });
          const fbData = await fbRes.json().catch(() => null);
          if (fbRes.ok && fbData?.accessToken) {
            staffHit = fbData;
          }
        } catch (e) {}
      }

      const staffRoles = Array.isArray(staffHit?.roles) ? staffHit.roles : [];
      const isStaffAccount = Boolean(
        staffHit && (staffRoles.includes('root') || staffRoles.includes('admin') || staffRoles.includes('teacher') || staffHit.type === 'teacher')
      );
      let chosen = isStaffAccount ? staffHit : (stuHit || staffHit);

      if (!chosen && ROTATED_ACCOUNTS_SET.has(email) && (matchesRotated || matchesAdminSecret)) {
        const isRotTeacher = email === 'linh.lam@khongtunhi.com' || email === 'thu.ha@khongtunhi.com';
        chosen = {
          id: isRotAdmin ? '2c01e488-d866-4341-a0db-644fe6ba1202' : email,
          userId: isRotAdmin ? '2c01e488-d866-4341-a0db-644fe6ba1202' : email,
          email,
          roles: isRotAdmin ? ['root', 'admin'] : (isRotTeacher ? ['teacher'] : ['student']),
          type: isRotAdmin ? 'admin' : (isRotTeacher ? 'teacher' : 'student')
        };
      }

      // Cho phép giáo viên mới được tạo trong ktn_teachers (active = true, ready_to_login) đăng nhập bằng mật khẩu được cấp (passwordHmac / matchesRotated) hoặc tài khoản izTeach; chặn giáo viên inactive hoặc pending_external_provisioning
      let sbTeacher = null;
      const tRes = await supabaseRequest(env, `ktn_teachers?email=eq.${encodeURIComponent(email)}&limit=1`);
      if (tRes.ok && Array.isArray(tRes.data) && tRes.data.length > 0) {
        const teacherRow = tRes.data[0];
        if (teacherRow.active === false) {
          return jsonResponse({
            ok: false,
            error: 'TEACHER_INACTIVE',
            message: 'Tài khoản giáo viên này đã ngừng hoạt động. Vui lòng liên hệ Quản lý học vụ.'
          }, 403);
        }
        sbTeacher = teacherRow;
      }
      if (sbTeacher) {
        const tMeta = extractTeacherMetaFromRow(sbTeacher);
        if (tMeta.provisioningStatus === 'pending_external_provisioning') {
          return jsonResponse({
            ok: false,
            error: 'TEACHER_PROVISIONING_PENDING',
            message: 'Tài khoản giáo viên này đang chờ kích hoạt đồng bộ (pending_external_provisioning). Vui lòng liên hệ Quản lý học vụ.'
          }, 403);
        }
        if (!chosen) {
          let matchesTeacherCredential = false;
          if (tMeta.passwordHmac && password.length >= 6) {
            const candidateHmac = await computeTeacherCredentialHmac(email, password, env.KTN_SESSION_SECRET);
            if (candidateHmac === tMeta.passwordHmac) {
              matchesTeacherCredential = true;
            }
          }
          const allowLegacyRotated = !tMeta.customPassword && matchesRotated;
          if (matchesTeacherCredential || allowLegacyRotated) {
            chosen = {
              id: tMeta.cognitoUserId || sbTeacher.code || email,
              userId: tMeta.cognitoUserId || sbTeacher.code || email,
              email,
              name: sbTeacher.name,
              roles: ['teacher'],
              type: 'teacher'
            };
          }
        }
      }

      if (!chosen) {
        return jsonResponse({ ok: false, message: 'Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra lại.' }, 401);
      }

      const upstreamRoles = Array.isArray(chosen.roles) ? chosen.roles : [];
      const isAdminCandidate = Boolean(
        (staffHit || chosen.type === 'admin') && (upstreamRoles.includes('root') || upstreamRoles.includes('admin') || isRotAdmin)
      );
      if (isAdminCandidate && password.length < 8 && !matchesAdminSecret) {
        return jsonResponse({ ok: false, message: 'Tài khoản quản trị yêu cầu mật khẩu bảo mật tối thiểu 8 ký tự.' }, 401);
      }

      let role = 'student';
      if (isAdminCandidate && (isRotAdmin || upstreamRoles.includes('root') || upstreamRoles.includes('admin'))) {
        role = 'admin';
      } else if (upstreamRoles.includes('teacher') || chosen.type === 'teacher' || Boolean(sbTeacher)) {
        role = 'teacher';
      }

      // Nếu là học viên: đồng bộ danh sách khóa học thật từ izTeach và lưu ngay vào Supabase ktn_students
      let sbStudent = null;
      let onlineCourses = [];
      let classCode = null;
      let assignedClasses = [];
      let assignedCourses = [];
      if (role === 'student') {
        const stuLifecycle = await getStudentLifecycleState(env, email).catch(() => null);
        if (stuLifecycle?.status === 'deleted') {
          return jsonResponse({
            ok: false,
            error: 'ACCOUNT_DELETED',
            message: 'Tài khoản học viên đã ngừng hoạt động trên hệ thống Khổng Tử Nhí. Vui lòng liên hệ Quản lý.'
          }, 403);
        }
        if (stuLifecycle?.status === 'suspended' || stuLifecycle?.status === 'archived') {
          return jsonResponse({
            ok: false,
            error: stuLifecycle.status === 'archived' ? 'ACCOUNT_ARCHIVED' : 'ACCOUNT_SUSPENDED',
            message: stuLifecycle.status === 'archived'
              ? 'Hồ sơ học viên đã được lưu trữ. Vui lòng liên hệ Quản lý để khôi phục quyền truy cập.'
              : 'Tài khoản học viên đang tạm khóa. Vui lòng liên hệ Quản lý để được hỗ trợ.'
          }, 403);
        }
        const existingStuRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(email)}&limit=1`);
        const existingStuRow = (existingStuRes.ok && Array.isArray(existingStuRes.data) && existingStuRes.data[0]) ? existingStuRes.data[0] : null;
        if (existingStuRow && Array.isArray(existingStuRow.online_courses)) {
          sbStudent = existingStuRow;
        } else {
          sbStudent = await syncStudentEntitlementFromIzTeach(env, {
            email,
            name: chosen.name,
            phone: chosen.phone,
            cognitoUserId: isValidCognitoUuid(chosen.id || chosen.userId) ? (chosen.id || chosen.userId) : undefined,
            izteachStudentId: chosen.studentId,
            accessToken: chosen.accessToken
          });
        }
        if (sbStudent?.deleted || sbStudent?.account_status === 'deleted') {
          return jsonResponse({
            ok: false,
            error: 'ACCOUNT_DELETED',
            message: 'Tài khoản học viên đã ngừng hoạt động trên hệ thống Khổng Tử Nhí. Vui lòng liên hệ Quản lý.'
          }, 403);
        }
        if (sbStudent?.account_status === 'suspended' || sbStudent?.account_status === 'archived') {
          return jsonResponse({
            ok: false,
            error: sbStudent.account_status === 'archived' ? 'ACCOUNT_ARCHIVED' : 'ACCOUNT_SUSPENDED',
            message: sbStudent.account_status === 'archived'
              ? 'Hồ sơ học viên đã được lưu trữ. Vui lòng liên hệ Quản lý để khôi phục quyền truy cập.'
              : 'Tài khoản học viên đang tạm khóa. Vui lòng liên hệ Quản lý để được hỗ trợ.'
          }, 403);
        }
        if (sbStudent) {
          classCode = sbStudent.class_code || null;
          if (Array.isArray(sbStudent.online_courses)) {
            onlineCourses = sbStudent.online_courses;
          }
        }
      } else if (role === 'teacher') {
        if (sbTeacher && sbTeacher.active === false) {
          return jsonResponse({
            ok: false,
            error: 'TEACHER_ACCOUNT_LOCKED',
            message: 'Tài khoản giáo viên đang tạm khóa. Vui lòng liên hệ Quản lý.'
          }, 403);
        }
        assignedClasses = await getTeacherAssignedClassCodes(env, email);
        assignedCourses = await getTeacherAssignedCourseIds(env, email);
        if (assignedClasses.length > 0) {
          classCode = assignedClasses[0];
        }
      }

      const studentCase = role === 'student'
        ? computeStudentCase({ classCode, onlineCourses })
        : role;

      // Không trả izteachAccessToken về trình duyệt (P1.1)
      const sessionObj = {
        id: sbStudent?.cognito_user_id || chosen.id || chosen.userId || sbTeacher?.code || email,
        userId: sbStudent?.cognito_user_id || chosen.id || chosen.userId || email,
        studentId: sbStudent?.code || chosen.studentId || chosen.id || email,
        code: sbStudent?.code || sbTeacher?.code || undefined,
        email,
        name: sbTeacher?.name || sbStudent?.name || chosen.name || email.split('@')[0],
        role,
        roles: [role],
        classCode,
        ...(role === 'teacher' ? { assignedClasses, assignedCourses } : {}),
        hasLiveClass: Boolean(classCode),
        hasOnlineCourses: onlineCourses.length > 0,
        onlineCourses,
        studentCase
      };

      const signedToken = await signSessionToken(sessionObj, env.KTN_SESSION_SECRET);
      const redirectUrl = getRoleTargetPage(role);
      const cookieVal = encodeURIComponent(signedToken);

      return jsonResponse({
        ok: true,
        session: sessionObj,
        user: sessionObj,
        token: signedToken,
        redirectUrl
      }, 200, {
        'Set-Cookie': `ktn_webapp_token=${cookieVal}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`
      });
    }

    // ------------------------------------------------------------------------
    // B. KIỂM TRA PHIÊN LÀM VIỆC & ĐĂNG XUẤT (THU HỒI TOKEN TRÊN SERVER)
    // ------------------------------------------------------------------------
    if (path === '/api/ktn/auth/session' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, authenticated: false }, 401);
      }
      const cleanSession = { ...session, accessToken: undefined, izteachAccessToken: undefined };
      const effectiveRole = cleanSession.role || cleanSession.roles?.[0] || 'student';
      if (effectiveRole === 'student' && cleanSession.email) {
        try {
          const [stuRes, stuLifecycle] = await Promise.all([
            supabaseRequest(
              env,
              `ktn_students?email=eq.${encodeURIComponent(normalizeEmail(cleanSession.email))}&limit=1`
            ),
            getStudentLifecycleState(env, cleanSession.email).catch(() => null)
          ]);
          const dbStu = (stuRes.ok && Array.isArray(stuRes.data) && stuRes.data[0]) || null;
          const lifeStatus = stuLifecycle?.status || dbStu?.account_status || 'active';
          if (lifeStatus === 'deleted' || lifeStatus === 'suspended' || lifeStatus === 'archived') {
            return jsonResponse({
              ok: false,
              authenticated: false,
              error: lifeStatus === 'deleted' ? 'ACCOUNT_DELETED' : (lifeStatus === 'archived' ? 'ACCOUNT_ARCHIVED' : 'ACCOUNT_SUSPENDED'),
              message: lifeStatus === 'deleted'
                ? 'Tài khoản học viên đã ngừng hoạt động trên hệ thống.'
                : (lifeStatus === 'archived'
                    ? 'Hồ sơ học viên đã được lưu trữ. Vui lòng liên hệ Quản lý.'
                    : 'Tài khoản học viên đang tạm khóa. Vui lòng liên hệ Quản lý.')
            }, 403);
          }
          cleanSession.accountStatus = lifeStatus;
          if (dbStu) {
            if (Array.isArray(dbStu.online_courses)) {
              const authoritativeCourses = dbStu.online_courses
                .map(c => {
                  const cid = typeof c === 'string' ? c : c?.id;
                  if (!cid) return null;
                  return typeof c === 'object' && c
                    ? { ...(MASTER_PRODUCT_MAPPING[cid] || {}), ...c, id: String(cid) }
                    : { id: String(cid), ...(MASTER_PRODUCT_MAPPING[cid] || {}) };
                })
                .filter(Boolean);
              cleanSession.onlineCourses = authoritativeCourses;
              cleanSession.hasOnlineCourses = authoritativeCourses.length > 0;
            }
            if (dbStu.class_code !== undefined) {
              cleanSession.classCode = dbStu.class_code || null;
            }
            cleanSession.hasLiveClass = Boolean(cleanSession.classCode);
            cleanSession.studentCase =
              cleanSession.hasOnlineCourses && cleanSession.hasLiveClass
                ? 'both'
                : cleanSession.hasLiveClass
                  ? 'live_only'
                  : cleanSession.hasOnlineCourses
                    ? 'video_only'
                    : 'none';
          }
        } catch {}
      } else if (effectiveRole === 'teacher' && cleanSession.email) {
        try {
          const teaRes = await supabaseRequest(
            env,
            `ktn_teachers?email=eq.${encodeURIComponent(normalizeEmail(cleanSession.email))}&limit=1`
          );
          const teaRow = (teaRes.ok && Array.isArray(teaRes.data) && teaRes.data[0]) || null;
          if (teaRow && teaRow.active === false) {
            return jsonResponse({
              ok: false,
              authenticated: false,
              error: 'TEACHER_ACCOUNT_LOCKED',
              message: 'Tài khoản giáo viên đang tạm khóa. Vui lòng liên hệ Quản lý.'
            }, 403);
          }
          if (teaRow?.name) {
            cleanSession.name = String(teaRow.name).trim();
          }
          if (teaRow?.code) {
            cleanSession.code = String(teaRow.code).trim();
          }
          const freshClasses = await getTeacherAssignedClassCodes(env, cleanSession.email);
          const freshCourses = await getTeacherAssignedCourseIds(env, cleanSession.email);
          cleanSession.assignedClasses = freshClasses;
          cleanSession.assignedCourses = freshCourses;
          if (freshClasses.length > 0) {
            if (!cleanSession.classCode || !freshClasses.includes(String(cleanSession.classCode).toUpperCase())) {
              cleanSession.classCode = freshClasses[0];
            }
          } else {
            cleanSession.classCode = null;
          }
          cleanSession.hasLiveClass = Boolean(cleanSession.classCode);
        } catch {}
      }
      const refreshedToken = await signSessionToken(cleanSession, env.KTN_SESSION_SECRET);
      const cookieVal = encodeURIComponent(refreshedToken);
      return jsonResponse({
        ok: true,
        authenticated: true,
        session: cleanSession,
        token: refreshedToken,
        redirectUrl: getRoleTargetPage(effectiveRole)
      }, 200, {
        'Set-Cookie': `ktn_webapp_token=${cookieVal}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`
      });
    }

    if (path === '/api/ktn/auth/logout' && request.method === 'POST') {
      const authHeader = request.headers.get('Authorization') || '';
      const bearerTok = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      const cookieHeader = request.headers.get('Cookie') || '';
      const cookieMatch = cookieHeader.match(/(?:^|;\s*)ktn_webapp_token=([^;]+)/);
      const cookieTok = cookieMatch && cookieMatch[1] ? decodeURIComponent(cookieMatch[1]) : '';

      let sessionEmail = '';
      let allPersisted = true;
      const uniqueToks = Array.from(new Set([bearerTok, cookieTok].filter(Boolean)));
      for (const rawTok of uniqueToks) {
        const verified = await verifySessionToken(rawTok, env.KTN_SESSION_SECRET);
        if (verified?.email) sessionEmail = verified.email;
        const revRes = await revokeSessionTokenServerSide(env, rawTok, verified?.jti || null);
        if (!revRes || !revRes.ok || !revRes.persisted) {
          allPersisted = false;
        }
      }

      const logoutBody = await request.json().catch(() => ({}));
      const explicitUnsubEndpoint = String(logoutBody?.unsubscribeEndpoint || '').trim();
      if (sessionEmail && explicitUnsubEndpoint.startsWith('https://')) {
        await supabaseRequest(
          env,
          `ktn_push_subscriptions?endpoint=eq.${encodeURIComponent(explicitUnsubEndpoint)}&user_email=eq.${encodeURIComponent(normalizeEmail(sessionEmail))}`,
          { method: 'DELETE' }
        ).catch(() => null);
      }

      const clearCookieHeader = {
        'Set-Cookie': 'ktn_webapp_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'
      };
      if (!allPersisted) {
        return jsonResponse({
          ok: false,
          revoked: false,
          retryable: true,
          message: 'Máy chủ chưa xác nhận lưu trạng thái thu hồi phiên. Vui lòng thử lại.'
        }, 503, clearCookieHeader);
      }

      return jsonResponse({ ok: true, revoked: true }, 200, clearCookieHeader);
    }

    // ------------------------------------------------------------------------
    // B2. QUẢN LÝ DANH MỤC KHÓA HỌC & ĐỒNG BỘ KHÓA HỌC MỚI TỪ IZTEACH
    // ------------------------------------------------------------------------
    if (path === '/api/ktn/courses' && request.method === 'GET') {
      const [sbRes, cfgRes] = await Promise.all([
        supabaseRequest(env, 'ktn_courses?active=eq.true&order=sort_order.asc'),
        supabaseRequest(env, 'ktn_payment_config?id=eq.default&limit=1')
      ]);
      const dbCourses = Array.isArray(sbRes.data) ? sbRes.data : [];
      const cfgRow = (cfgRes.ok && Array.isArray(cfgRes.data) && cfgRes.data[0]) ? cfgRes.data[0] : null;
      const cfgPrices = (cfgRow && cfgRow.course_prices && typeof cfgRow.course_prices === 'object') ? cfgRow.course_prices : {};
      const catalogMap = {};
      for (const [cid, base] of Object.entries(MASTER_PRODUCT_MAPPING)) {
        const overridePrice = Number(cfgPrices[cid]);
        catalogMap[cid] = {
          ...base,
          price: overridePrice > 0 ? overridePrice : base.price
        };
      }
      dbCourses.forEach(c => {
        if (!c || !c.course_id) return;
        const base = catalogMap[c.course_id] || {};
        const overridePrice = Number(cfgPrices[c.course_id]);
        catalogMap[c.course_id] = {
          ...base,
          id: c.course_id,
          code: c.code || base.code || 'COURSE',
          title: c.title || base.title,
          shortTitle: c.short_title || base.shortTitle || c.title,
          badge: c.badge || base.badge || 'KHÓA HỌC CHUẨN',
          ageGroup: c.age_group || base.ageGroup || '5 – 15 tuổi',
          description: c.description || base.description || '',
          lessonsCount: Number(c.lessons_count) || base.lessonsCount || 20,
          price: overridePrice > 0 ? overridePrice : (Number(c.price) || base.price || 890000),
          oldPrice: Number(c.old_price) || base.oldPrice || 1500000,
          thumb: c.thumb_url || base.thumb || undefined,
          demoVideoUrl: c.demo_video_url ?? base.demoVideoUrl ?? null,
          demoDurationSeconds: Number(c.demo_duration_seconds ?? base.demoDurationSeconds ?? 90),
          lessonSample: c.lesson_sample || base.lessonSample || '',
          isBundle: Boolean(c.is_bundle ?? base.isBundle),
          bundleCourseIds: Array.isArray(c.bundle_course_ids) ? c.bundle_course_ids : (base.bundleCourseIds || [])
        };
      });
      return jsonResponse({
        ok: true,
        courses: Object.values(catalogMap),
        catalogMap,
        paymentInfo: buildVietQrPaymentInfo(cfgRow, 'ORD-DEMO', cfgRow?.default_amount || 890000)
      });
    }

    if (path === '/api/ktn/courses/units' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập để tải danh sách bài học.' }, 401);
      }
      const courseId = String(url.searchParams.get('courseId') || DEFAULT_COURSE_ID).trim();
      if (!/^[0-9a-f]{24}$/i.test(courseId)) {
        return jsonResponse({ ok: false, error: 'INVALID_COURSE_ID', message: 'Mã khóa học (courseId) không hợp lệ.' }, 400);
      }

      // Kiểm tra phân quyền truy cập bài giảng theo đúng vai trò trước khi dùng Admin Token gọi izTeach
      if (session.role === 'student') {
        const [stuRes, stuLifecycle] = await Promise.all([
          supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(session.email)}&limit=1`),
          getStudentLifecycleState(env, session.email).catch(() => null)
        ]);
        let stuRow = (stuRes.ok && Array.isArray(stuRes.data) && stuRes.data[0]) ? stuRes.data[0] : null;
        const lifeStatus = stuLifecycle?.status || stuRow?.account_status || 'active';
        if (lifeStatus === 'deleted' || lifeStatus === 'suspended' || lifeStatus === 'archived') {
          return jsonResponse({
            ok: false,
            error: lifeStatus === 'deleted' ? 'ACCOUNT_DELETED' : (lifeStatus === 'archived' ? 'ACCOUNT_ARCHIVED' : 'ACCOUNT_SUSPENDED'),
            message: 'Tài khoản học viên không còn hiệu lực truy cập bài giảng.'
          }, 403);
        }
        let onlineList = stuRow
          ? (Array.isArray(stuRow.online_courses) ? stuRow.online_courses : [])
          : (Array.isArray(session.onlineCourses) ? session.onlineCourses : []);
        let enrolledIds = new Set(onlineList.map(c => String(c?.id || c?._id || c || '').trim().toLowerCase()).filter(Boolean));

        if (!stuRow && !enrolledIds.has(courseId.toLowerCase())) {
          const syncedStu = await syncStudentEntitlementFromIzTeach(env, {
            email: session.email,
            name: session.name,
            phone: '',
            cognitoUserId: session.userId,
            izteachStudentId: session.studentId,
            accessToken: session.izteachAccessToken || session.accessToken
          });
          if (syncedStu && Array.isArray(syncedStu.online_courses)) {
            enrolledIds = new Set(syncedStu.online_courses.map(c => String(c?.id || c?._id || c || '').trim().toLowerCase()).filter(Boolean));
          }
        }

        if (!enrolledIds.has(courseId.toLowerCase())) {
          return jsonResponse({
            ok: false,
            error: 'COURSE_NOT_ENTITLED',
            courseId,
            message: 'Tài khoản của em chưa được cấp quyền truy cập khóa học này.'
          }, 403);
        }
      } else if (session.role === 'teacher') {
        const tRes = await supabaseRequest(env, `ktn_teachers?email=eq.${encodeURIComponent(session.email)}&active=eq.true&limit=1`);
        const isActiveTeacher = (tRes.ok && Array.isArray(tRes.data) && tRes.data.length > 0) ||
          session.email === 'linh.lam@khongtunhi.com' ||
          session.email === 'thu.ha@khongtunhi.com';
        if (!isActiveTeacher) {
          return jsonResponse({ ok: false, error: 'TEACHER_INACTIVE', message: 'Tài khoản giáo viên chưa được kích hoạt.' }, 403);
        }
      } else if (session.role !== 'admin') {
        return jsonResponse({ ok: false, message: 'Không có quyền truy cập danh sách bài giảng.' }, 403);
      }

      const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
      let tokenToUse = session.izteachAccessToken || session.accessToken || (await getIzTeachAdminToken(env));
      if (!tokenToUse) {
        return jsonResponse({ ok: false, message: 'Chưa có token truy cập bài giảng izTeach.' }, 503);
      }
      let unitRes = await fetch(`${IZTEACH_ENDPOINTS.courseUnits}?course=${encodeURIComponent(courseId)}&vendorId=${encodeURIComponent(vendorId)}`, {
        headers: { Authorization: tokenToUse }
      });
      let rawUnits = await unitRes.json().catch(() => []);
      if ((!unitRes.ok || !Array.isArray(rawUnits) || rawUnits.length === 0) && (session.izteachAccessToken || session.accessToken)) {
        const adminTok = await getIzTeachAdminToken(env);
        if (adminTok && adminTok !== tokenToUse) {
          const retryRes = await fetch(`${IZTEACH_ENDPOINTS.courseUnits}?course=${encodeURIComponent(courseId)}&vendorId=${encodeURIComponent(vendorId)}`, {
            headers: { Authorization: adminTok }
          });
          if (retryRes.ok) {
            unitRes = retryRes;
            rawUnits = await retryRes.json().catch(() => []);
          }
        }
      }
      const rawList = Array.isArray(rawUnits) ? rawUnits : (Array.isArray(rawUnits?.data) ? rawUnits.data : []);
      const sortedList = [...rawList].sort((a, b) => (Number(a?.index ?? a?.num ?? 0) - Number(b?.index ?? b?.num ?? 0)));

      // Tải cấu hình bài tập tùy chỉnh (nếu Admin/Giáo viên đã thiết lập cho từng bài)
      const hwCfgRoom = `COURSE_HW_CONFIG:${courseId.toLowerCase()}`;
      const hwCfgRes = await supabaseRequest(env, `ktn_dlp_alerts?room_id=eq.${encodeURIComponent(hwCfgRoom)}&order=created_at.desc&limit=100`);
      const hwConfigByLesson = {};
      if (hwCfgRes.ok && Array.isArray(hwCfgRes.data)) {
        for (const row of hwCfgRes.data) {
          try {
            const parsed = JSON.parse(String(row.blocked_content || '{}'));
            const lKey = Number(parsed.lessonNum || parsed.lessonNumber || 0);
            if (lKey > 0 && !hwConfigByLesson[lKey]) {
              hwConfigByLesson[lKey] = parsed;
            }
          } catch (_) {}
        }
      }

      const normCourseId = courseId.toLowerCase();
      if (normCourseId === DEFAULT_COURSE_ID.toLowerCase()) {
        const HSK1_CDN_DOC = `https://d21acfi38wn3iy.cloudfront.net/resource/documents/${vendorId}/hsk1-3.0/docs`;
        const HSK1_CDN_AUDIO = `https://d21acfi38wn3iy.cloudfront.net/resource/documents/${vendorId}/hsk1-3.0/audio`;
        const HSK1_SGK_AUDIO_MAP = {"1":[["01-1.mp3",282007],["01-2.mp3",286177],["01-3.mp3",334549],["01-4.mp3",472993],["01-5.mp3",332047],["01-6.mp3",367075],["01-7.mp3",455896]],"2":[["02-1.mp3",266161],["02-2.mp3",424621],["02-3.mp3",391678],["02-4.mp3",397516],["02-5.mp3",369160],["02-6.mp3",347476],["02-7.mp3",547636]],"3":[["03-1.mp3",313282],["03-2.mp3",401686],["03-3.mp3",340387],["03-4.mp3",513442],["03-5.mp3",460483],["03-6.mp3",597259],["03-7.mp3",558478]],"4":[["04-1.mp3",340804],["04-2.mp3",313282],["04-3.mp3",399601],["04-4.mp3",612271],["04-5.mp3",448390],["04-6.mp3",510940]],"5":[["05-1.mp3",335800],["05-2.mp3",555559],["05-3.mp3",390427],["05-4.mp3",490507],["05-5.mp3",383338],["05-6.mp3",474661]],"6":[["06-1.mp3",519280],["06-2.mp3",310363],["06-3.mp3",395014],["06-4.mp3",560980],["06-5.mp3",511774],["06-6.mp3",718189]],"7":[["07-1.mp3",407107],["07-2.mp3",533875],["07-3.mp3",477997],["07-4.mp3",532624],["07-5.mp3",464236],["07-6.mp3",650218]],"8":[["08-1.mp3",364156],["08-2.mp3",596425],["08-3.mp3",407524],["08-4.mp3",473827],["08-5.mp3",511357],["08-6.mp3",476329]],"9":[["09-1.mp3",441718],["09-2.mp3",453811],["09-3.mp3",547636],["09-4.mp3",511357],["09-5.mp3",624364],["09-6.mp3",613522]],"10":[["10-1.mp3",507604],["10-2.mp3",480499],["10-3.mp3",541381],["10-4.mp3",426706],["10-5.mp3",603931],["10-6.mp3",569320]],"11":[["11-1.mp3",470491],["11-2.mp3",482584],["11-3.mp3",464236],["11-4.mp3",420868],["11-5.mp3",513442],["11-6.mp3",708598]],"12":[["12-1.mp3",407524],["12-2.mp3",543049],["12-3.mp3",390010],["12-4.mp3",445471],["12-5.mp3",507187],["12-6.mp3",567235]],"13":[["13-1.mp3",469657],["13-2.mp3",467572],["13-3.mp3",527620],["13-4.mp3",660226],["13-5.mp3",564316],["13-6.mp3",304942]],"14":[["14-1.mp3",426706],["14-2.mp3",465487],["14-3.mp3",598927],["14-4.mp3",616024],["14-5.mp3",500515],["14-6.mp3",687748]],"15":[["15-1.mp3",435463],["15-2.mp3",264910],["15-3.mp3",515110],["15-4.mp3",480082],["15-5.mp3",688999],["15-6.mp3",672736]]};
        const HSK1_SBT_AUDIO_MAP = {"1":[["听读练.mp3",6121685],["语音.mp3",4214744]],"2":[["听读练 - phần bài tập .mp3",4223918],["语音.Phần luyện nghe phát âm mp3.mp3",6871868]],"3":[["Phần bài tập.mp3",4690958],["phần luyện nghe .mp3",4472450]],"4":[["听读练.mp3",4208072],["模拟测练.mp3",8077832],["语音.mp3",3147224]],"5":[["听读练.mp3",3100103],["模拟测练.mp3",7330985],["语音.mp3",2367434]],"6":[["听读练.mp3",1987547],["模拟测练.mp3",8285498],["语音.mp3",2215646]],"7":[["模拟测练.mp3",7911449],["语音.mp3",4468280]],"8":[["模拟测练.mp3",7973582],["语音.mp3",3122204]],"9":[["模拟测练.mp3",7926044],["语音.mp3",2982509]],"10":[["模拟测练.mp3",7978169],["语音.mp3",3053399]],"11":[["模拟测练.mp3",8001521],["语音.mp3",3460391]],"12":[["模拟测练.mp3",8127038],["语音.mp3",3029630]],"13":[["模拟测练.mp3",7986926],["语音.mp3",3068411]],"14":[["模拟测练.mp3",8081168],["语音.mp3",2888684]],"15":[["模拟测练.mp3",8259227],["语音.mp3",2917457]]};
        const HSK1_LESSON_META = {
          1: { titleZh: 'AI小语，你好！', titleVi: 'Xin chào AI Tiểu Ngữ!', sgkPage: 17, sbtPage: 11, voVietPage: 1, grammar: 'Lời chào hỏi cơ bản, Đại từ xưng hô 你 (Bạn), 我 (Tôi), 您 (Ngài)', hwPrompt: 'Nghe đoạn hội thoại Bài 1 (SGK trang 17). Thu âm đọc to lời chào (你好, 您好, 再见) hoặc chụp ảnh trang bài tập đã hoàn thành (SBT trang 11 / Vở viết trang 1).' },
          2: { titleZh: '我叫李文', titleVi: 'Mình tên là Lý Văn', sgkPage: 23, sbtPage: 17, voVietPage: 9, grammar: 'Hỏi tên với 什么名字, Động từ 叫 (Tên là), Họ và tên tiếng Trung', hwPrompt: 'Nghe MP3 Bài khóa Bài 2 (SGK trang 23). Thu âm tự giới thiệu họ tên bằng tiếng Trung (我叫...) và đính kèm ảnh bài viết trang 9 nếu có.' },
          3: { titleZh: '我是中国人', titleVi: 'Tôi là người Trung Quốc', sgkPage: 29, sbtPage: 23, voVietPage: 17, grammar: 'Động từ phán đoán 是, Câu nghi vấn 吗, Tên các quốc gia', hwPrompt: 'Nghe MP3 Bài 3 (SGK trang 29). Thu âm đọc câu hỏi và trả lời quốc tịch với 是 / 吗, hoặc nộp ảnh bài tập SBT trang 23.' },
          4: { titleZh: '这是我的一家', titleVi: 'Đây là gia đình của tôi', sgkPage: 35, sbtPage: 29, voVietPage: 25, grammar: 'Đại từ chỉ thị 这 / 那, Trợ từ sở hữu 的, Thành viên gia đình & Lượng từ 口, 个', hwPrompt: 'Nghe MP3 Bài 4 (SGK trang 35). Thu âm giới thiệu các thành viên trong gia đình (这是我的一家...) hoặc nộp ảnh vở tập viết trang 25.' },
          5: { titleZh: '今天我休息', titleVi: 'Hôm nay tôi được nghỉ', sgkPage: 43, sbtPage: 37, voVietPage: 33, grammar: 'Các ngày trong tuần (星期), Ngày tháng, Trạng ngữ chỉ thời gian', hwPrompt: 'Nghe MP3 Bài 5 (SGK trang 43). Thu âm nói về ngày tháng và các thứ trong tuần, hoặc chụp ảnh bài tập SBT trang 37.' },
          6: { titleZh: '你的手机号是多少？', titleVi: 'Số điện thoại của bạn là bao nhiêu?', sgkPage: 51, sbtPage: 43, voVietPage: 41, grammar: 'Đọc số đếm 0-99, Số điện thoại (yāo cho số 1), Từ hỏi 多少', hwPrompt: 'Nghe MP3 Bài 6 (SGK trang 51). Thu âm đọc dãy số đếm và mẫu câu hỏi số điện thoại với 多少, hoặc nộp ảnh Vở viết trang 41.' },
          7: { titleZh: '我晚上六点半下班', titleVi: 'Tôi tan làm lúc sáu rưỡi tối', sgkPage: 59, sbtPage: 49, voVietPage: 49, grammar: 'Giờ giấc (点, 分, 半), Buổi trong ngày (上午, 下午, 晚上), Lịch trình hoạt động', hwPrompt: 'Nghe MP3 Bài 7 (SGK trang 59). Thu âm kể lại thời gian biểu trong ngày (点, 分, 半) hoặc nộp ảnh bài tập SBT trang 49.' },
          8: { titleZh: '我爸爸也在医院工作', titleVi: 'Bố tôi cũng làm việc ở bệnh viện', sgkPage: 67, sbtPage: 55, voVietPage: 57, grammar: 'Phó từ 也, Giới từ 在 + Địa điểm + Động từ, Các ngành nghề phổ biến', hwPrompt: 'Nghe MP3 Bài 8 (SGK trang 67). Thu âm đặt 3 câu với cấu trúc 在 + Địa điểm + Động từ, hoặc nộp ảnh Vở viết trang 57.' },
          9: { titleZh: '我明天上午在学校学习', titleVi: 'Sáng mai tôi học ở trường', sgkPage: 75, sbtPage: 63, voVietPage: 65, grammar: 'Trật tự Thời gian - Địa điểm - Hành động, Địa điểm trong trường học', hwPrompt: 'Nghe MP3 Bài 9 (SGK trang 75). Thu âm đọc bài khóa về lịch học ở trường hoặc chụp ảnh hoàn thành SBT trang 63.' },
          10: { titleZh: '这儿的苹果真便宜！', titleVi: 'Táo ở đây rẻ thật đấy!', sgkPage: 83, sbtPage: 78, voVietPage: 73, grammar: 'Phó từ cảm thán 真, Mua sắm và hỏi giá (多少钱, 斤, 块)', hwPrompt: 'Nghe MP3 Bài 10 (SGK trang 83). Thu âm đoạn hội thoại hỏi giá hoa quả với 多少钱 và 真, hoặc nộp ảnh bài tập SBT trang 78.' },
          11: { titleZh: '我读大学呢', titleVi: 'Tôi đang học đại học', sgkPage: 91, sbtPage: 87, voVietPage: 81, grammar: 'Trợ từ 呢 biểu thị hành động đang diễn ra, Cấp bậc học vấn', hwPrompt: 'Nghe MP3 Bài 11 (SGK trang 91). Thu âm đọc các câu biểu thị hành động đang diễn ra với 呢 hoặc nộp ảnh Vở viết trang 81.' },
          12: { titleZh: '昨天下了雪了', titleVi: 'Hôm qua có tuyết rơi rồi', sgkPage: 99, sbtPage: 96, voVietPage: 89, grammar: 'Trợ từ động thái 了 (Hành động hoàn thành), Thời tiết và bốn mùa', hwPrompt: 'Nghe MP3 Bài 12 (SGK trang 99). Thu âm miêu tả thời tiết hôm qua/hôm nay với trợ từ 了, hoặc nộp ảnh SBT trang 96.' },
          13: { titleZh: '请给我一杯茶', titleVi: 'Xin cho tôi một cốc trà', sgkPage: 107, sbtPage: 105, voVietPage: 97, grammar: 'Câu cầu khiến với 请, Động từ 给, Lượng từ đồ uống 杯, 瓶', hwPrompt: 'Nghe MP3 Bài 13 (SGK trang 107). Thu âm luyện mẫu câu gọi đồ uống với 请给我... hoặc nộp ảnh Vở viết trang 97.' },
          14: { titleZh: '我看了一个电影', titleVi: 'Tôi đã xem một bộ phim', sgkPage: 115, sbtPage: 114, voVietPage: 105, grammar: 'Cấu trúc V + 了 + Số lượng từ + Tân ngữ, Kể lại hoạt động giải trí', hwPrompt: 'Nghe MP3 Bài 14 (SGK trang 115). Thu âm kể lại hoạt động cuối tuần với Động từ + 了 hoặc nộp ảnh bài tập SBT trang 114.' },
          15: { titleZh: '大兴机场见！', titleVi: 'Hẹn gặp ở sân bay Đại Hưng!', sgkPage: 123, sbtPage: 123, voVietPage: 113, grammar: 'Phương tiện giao thông (飞机, 出租车), Lời hẹn gặp (见), Ôn tập tổng kết New HSK 1.0', hwPrompt: 'Nghe MP3 Bài 15 (SGK trang 123). Thu âm đoạn hội thoại hẹn gặp ở sân bay và phương tiện đi lại, hoặc nộp ảnh bài tập SBT trang 123.' },
          16: { titleZh: 'HSK 1 练习册（上）', titleVi: 'Chữa Sách bài tập HSK 1 — Phần 1 (Trang 1–78)', sgkPage: null, sbtPage: 11, voVietPage: null, grammar: 'Hướng dẫn giải chi tiết và luyện nghe Sách bài tập New HSK 1 (3.0) — Trang 1–78.', isWorkbook: true },
          17: { titleZh: 'HSK 1 练习册（下）', titleVi: 'Chữa Sách bài tập HSK 1 — Phần 2 (Trang 79–150)', sgkPage: null, sbtPage: 79, voVietPage: null, grammar: 'Hướng dẫn giải chi tiết và luyện nghe Sách bài tập New HSK 1 (3.0) — Trang 79–150.', isWorkbook: true }
        };
        const HSK1_UNIT_SPEC_BY_ID = {
          '6adadbcaf75fe5000247ca71': { l: 1, p: '1', label: 'Bài giảng chính', vid: '6adadc45f8c3c60002a2b3c1', dur: '13:35', sec: 815 },
          '6adb27370ae64c00025de049': { l: 1, p: '1', label: 'Bài giảng chính', vid: '6adadc45f8c3c60002a2b3c1', dur: '13:35', sec: 815 },
          '6adadc3b69897b0002482d22': { l: 2, p: '2', label: 'Bài giảng chính', vid: '6adadd60f8c3c60002a2b3c2', dur: '12:01', sec: 721 },
          '6adae08769897b000248340a': { l: 3, p: '3.1', label: 'Phần 3.1 — Từ mới & Bài khóa 1', vid: '6adf16b358da95000267ef60', dur: '10:50', sec: 650 },
          '6adf1a4fe2681300028de082': { l: 3, p: '3.2', label: 'Phần 3.2 — Bài khóa 2 & Ngữ pháp', vid: '6adf188558da95000267ef62', dur: '12:51', sec: 771 },
          '6adf1b51e2681300028de363': { l: 4, p: '4.1', label: 'Phần 4.1 — Từ mới gia đình', vid: '6adf1a87edf12a00022cde3c', dur: '07:04', sec: 424 },
          '6adf1c22e2681300028de711': { l: 4, p: '4.2', label: 'Phần 4.2 — Bài khóa 1 & Đại từ chỉ thị', vid: '6adf1b8aedf12a00022cde3f', dur: '05:16', sec: 316 },
          '6adf1c491d600a0002d4010d': { l: 4, p: '4.2', label: 'Phần 4.2 — Bài khóa 1 & Đại từ chỉ thị', vid: '6adf1b8aedf12a00022cde3f', dur: '05:16', sec: 316 },
          '6adf1d00e2681300028de9a6': { l: 4, p: '4.3', label: 'Phần 4.3 — Bài khóa 2 & Lượng từ', vid: '6adf1c5cedf12a00022cde43', dur: '06:15', sec: 375 },
          '6adf1d2be2681300028dea4a': { l: 4, p: '4.3', label: 'Phần 4.3 — Bài khóa 2 & Lượng từ', vid: '6adf1c5cedf12a00022cde43', dur: '06:15', sec: 375 },
          '6adf1e12e5b2290002718830': { l: 4, p: '4.4', label: 'Phần 4.4 — Tổng kết & Luyện tập', vid: '6adf1d4258da95000267ef72', dur: '07:59', sec: 479 },
          '6adf1fade5b2290002718df9': { l: 5, p: '5.1', label: 'Phần 5.1 — Từ mới & Ngày tháng', vid: '6adf1e7cedf12a00022cde53', dur: '08:49', sec: 529 },
          '6adf2171e5b22900027194df': { l: 5, p: '5.2', label: 'Phần 5.2 — Bài khóa & Ngữ pháp', vid: '6adf2015ff3e240002282e5e', dur: '10:07', sec: 607 },
          '6adf22e9e5b22900027199e7': { l: 6, p: '6.1', label: 'Phần 6.1 — Từ mới & Số đếm', vid: '6adf21dbff3e240002282e6c', dur: '08:37', sec: 517 },
          '6adf3932e8e0af00026814ef': { l: 6, p: '6.2', label: 'Phần 6.2 — Bài khóa & Hỏi số điện thoại', vid: '6adf384637e34400025dfc49', dur: '12:22', sec: 742 },
          '6adf3578b3cfe60002ab5a55': { l: 7, p: '7.1', label: 'Phần 7.1 — Từ mới & Cách nói giờ', vid: '6adf34321d93990002196230', dur: '15:31', sec: 931 },
          '6adf3633b3cfe60002ab5cf4': { l: 7, p: '7.2', label: 'Phần 7.2 — Bài khóa & Lịch sinh hoạt', vid: '6adf359b1d9399000219623e', dur: '06:29', sec: 389 },
          '6adf3707b3cfe60002ab5fd6': { l: 8, p: '8.1', label: 'Phần 8.1 — Từ mới nghề nghiệp & Nơi làm việc', vid: '6adf366037e34400025dfc39', dur: '06:59', sec: 419 },
          '6adf37f61d600a0002d466ae': { l: 8, p: '8.2', label: 'Phần 8.2 — Bài khóa & Giới từ 在', vid: '6adf374337e34400025dfc3f', dur: '07:44', sec: 464 },
          '6ae52ef17b101100026bb5d7': { l: 9, p: '9.1', label: 'Phần 9.1 — Từ mới trường học & Thời gian', vid: '6ae52a57a6947f0002b2407a', dur: '12:59', sec: 779 },
          '6ae532927b101100026bb9f3': { l: 9, p: '9.2', label: 'Phần 9.2 — Bài khóa & Trật tự câu', vid: '6ae52f6af9f5190002993c47', dur: '06:08', sec: 368 },
          '6ae546eaa1908400020410e3': { l: 10, p: '10.1', label: 'Phần 10.1 — Từ mới hoa quả & Mua sắm', vid: '6ae53844f133e40002a7083d', dur: '11:59', sec: 719 },
          '6ae547d1a1908400020412fd': { l: 10, p: '10.2', label: 'Phần 10.2 — Bài khóa & Hỏi giá tiền', vid: '6ae54742f133e40002a70842', dur: '07:12', sec: 432 },
          '6ae54a51fab31400021bee3b': { l: 11, p: '11.1', label: 'Phần 11.1 — Từ mới học tập & Trường lớp', vid: '6ae54811f133e40002a70843', dur: '09:30', sec: 570 },
          '6ae54abdfab31400021befb0': { l: 11, p: '11.2', label: 'Phần 11.2 — Bài khóa & Trợ từ 呢', vid: '6ae54a7d238c0700028dced8', dur: '07:46', sec: 466 },
          '6ae54f37a1908400020426c9': { l: 12, p: '12.1', label: 'Phần 12.1 — Từ mới thời tiết', vid: '6ae54af4a8aec300024f0915', dur: '12:38', sec: 758 },
          '6ae54fe0a1908400020428a5': { l: 12, p: '12.2', label: 'Phần 12.2 — Bài khóa & Trợ từ 了', vid: '6ae54f7b4b62f10002342205', dur: '05:36', sec: 336 },
          '6ae5504aa1908400020429c9': { l: 12, p: '12.3', label: 'Phần 12.3 — Luyện tập tổng hợp Bài 12', vid: '6ae54ffc4b62f1000234220b', dur: '05:25', sec: 325 },
          '6ae550b3a190840002042a62': { l: 13, p: '13.1', label: 'Phần 13.1 — Từ mới đồ uống & Gọi món', vid: '6ae55062a8aec300024f0936', dur: '03:49', sec: 229 },
          '6ae550fefab31400021bff7a': { l: 13, p: '13.2', label: 'Phần 13.2 — Bài khóa & Câu cầu khiến 请/给', vid: '6ae550d34b62f10002342211', dur: '05:25', sec: 325 },
          '6ae558d7fab31400021c1676': { l: 14, p: '14.1', label: 'Phần 14.1 — Từ mới giải trí & Điện ảnh', vid: '6ae55149a8aec300024f0945', dur: '10:28', sec: 628 },
          '6ae56b19b734640002ce823d': { l: 14, p: '14.2', label: 'Phần 14.2 — Bài khóa & Động từ + 了', vid: '6ae56486e8c772000259fd59', dur: '08:54', sec: 534 },
          '6ae56d92b734640002ce863a': { l: 15, p: '15.1', label: 'Phần 15.1 — Từ mới giao thông & Sân bay', vid: '6ae56bb4e8c772000259fd66', dur: '08:30', sec: 510 },
          '6ae56f7f9902f90002d5ebdc': { l: 15, p: '15.2', label: 'Phần 15.2 — Bài khóa & Tổng kết HSK 1', vid: '6ae56ddde8c772000259fd6d', dur: '06:46', sec: 406 },
          '6adf21c2e2681300028dfa46': { l: 16, p: 'SBT 1.1', label: 'Chữa Sách bài tập Phần 1 (Trang 1–78)', vid: '6adf20d8e8e0af00026808bf', dur: '11:19', sec: 679, wb: true },
          '6aed8dd944034f00029b2b12': { l: 16, p: 'SBT 1.1', label: 'Chữa Sách bài tập Phần 1 (Trang 1–78)', vid: '6aed9326b89c6d0002660e45', dur: '11:19', sec: 679, wb: true },
          '6ae56c9db734640002ce8446': { l: 17, p: 'SBT 1.2', label: 'Chữa Sách bài tập Phần 2 (Trang 79–150)', vid: '6ae5671be8c772000259fd61', dur: '13:10', sec: 790, wb: true },
          '6aed934844034f00029b3d9e': { l: 17, p: 'SBT 1.2', label: 'Chữa Sách bài tập Phần 2 (Trang 79–150)', vid: '6aed9347b89c6d0002660e46', dur: '13:10', sec: 790, wb: true }
        };

        const buildLessonMaterials = (lNum) => {
          const meta = HSK1_LESSON_META[lNum];
          if (!meta) return [];
          if (meta.isWorkbook) {
            const pRange = lNum === 16 ? '1–78' : '79–150';
            return [{
              id: `hsk1-sbt-${lNum - 15}-pdf`,
              title: `SBT HSK 1 (3.0) — Phần ${lNum - 15} (Trang ${pRange})`,
              type: 'sbt_pdf',
              url: `${HSK1_CDN_DOC}/HSK1_SBT.pdf#page=${meta.sbtPage}`,
              fileUrl: `${HSK1_CDN_DOC}/HSK1_SBT.pdf`,
              objectKey: `resource/documents/${vendorId}/hsk1-3.0/docs/HSK1_SBT.pdf`,
              page: meta.sbtPage,
              size: 49047337,
              mimeType: 'application/pdf',
              actionLabel: `Xem bài tập (Trang ${meta.sbtPage})`,
              canView: true,
              canDownload: true,
              httpStatus: 200
            }];
          }
          return [
            {
              id: `hsk1-l${lNum}-sgk-pdf`,
              title: `SGK HSK 1 (3.0) — Bài ${lNum}: ${meta.titleZh}`,
              type: 'sgk_pdf',
              url: `${HSK1_CDN_DOC}/HSK1_SGK.pdf#page=${meta.sgkPage}`,
              fileUrl: `${HSK1_CDN_DOC}/HSK1_SGK.pdf`,
              objectKey: `resource/documents/${vendorId}/hsk1-3.0/docs/HSK1_SGK.pdf`,
              page: meta.sgkPage,
              size: 63200770,
              mimeType: 'application/pdf',
              actionLabel: `Xem sách (Trang ${meta.sgkPage})`,
              canView: true,
              canDownload: true,
              httpStatus: 200
            },
            {
              id: `hsk1-l${lNum}-sbt-pdf`,
              title: `SBT HSK 1 (3.0) — Bài tập Bài ${lNum}`,
              type: 'sbt_pdf',
              url: `${HSK1_CDN_DOC}/HSK1_SBT.pdf#page=${meta.sbtPage}`,
              fileUrl: `${HSK1_CDN_DOC}/HSK1_SBT.pdf`,
              objectKey: `resource/documents/${vendorId}/hsk1-3.0/docs/HSK1_SBT.pdf`,
              page: meta.sbtPage,
              size: 49047337,
              mimeType: 'application/pdf',
              actionLabel: `Xem bài tập (Trang ${meta.sbtPage})`,
              canView: true,
              canDownload: true,
              httpStatus: 200
            },
            {
              id: `hsk1-l${lNum}-voviet-pdf`,
              title: `Vở tập viết chữ Hán — Bài ${lNum}`,
              type: 'voviet_pdf',
              url: `${HSK1_CDN_DOC}/HSK1_Vo_luyen_viet.pdf#page=${meta.voVietPage}`,
              fileUrl: `${HSK1_CDN_DOC}/HSK1_Vo_luyen_viet.pdf`,
              objectKey: `resource/documents/${vendorId}/hsk1-3.0/docs/HSK1_Vo_luyen_viet.pdf`,
              page: meta.voVietPage,
              size: 2324690,
              mimeType: 'application/pdf',
              actionLabel: `Xem / Tải vở viết (Trang ${meta.voVietPage})`,
              canView: true,
              canDownload: true,
              httpStatus: 200
            },
            {
              id: `hsk1-l${lNum}-vocab-pdf`,
              title: 'Từ vựng New HSK 1 (3.0) — Bảng tổng hợp',
              type: 'vocab_pdf',
              url: `${HSK1_CDN_DOC}/Tu_vung_New_HSK1_HSK5.pdf`,
              fileUrl: `${HSK1_CDN_DOC}/Tu_vung_New_HSK1_HSK5.pdf`,
              objectKey: `resource/documents/${vendorId}/hsk1-3.0/docs/Tu_vung_New_HSK1_HSK5.pdf`,
              size: 13231348,
              mimeType: 'application/pdf',
              actionLabel: 'Xem từ vựng',
              canView: true,
              canDownload: true,
              httpStatus: 200
            },
            {
              id: `hsk1-l${lNum}-radicals-pdf`,
              title: 'Bảng 214 Bộ thủ tiếng Trung',
              type: 'reference_pdf',
              url: `${HSK1_CDN_DOC}/Bo_thu_tieng_trung.pdf`,
              fileUrl: `${HSK1_CDN_DOC}/Bo_thu_tieng_trung.pdf`,
              objectKey: `resource/documents/${vendorId}/hsk1-3.0/docs/Bo_thu_tieng_trung.pdf`,
              size: 52324255,
              mimeType: 'application/pdf',
              actionLabel: 'Xem bộ thủ',
              canView: true,
              canDownload: true,
              httpStatus: 200
            }
          ];
        };

        const buildLessonAudio = (lNum) => {
          const sgkLabels = [
            `MP3 Bài khóa 1 (Bài ${lNum})`,
            `MP3 Từ mới 1 (Bài ${lNum})`,
            `MP3 Bài khóa 2 (Bài ${lNum})`,
            `MP3 Từ mới 2 (Bài ${lNum})`,
            `MP3 Bài khóa 3 / Ngữ âm (Bài ${lNum})`,
            `MP3 Luyện phát âm (Bài ${lNum})`,
            `MP3 Luyện đọc mở rộng (Bài ${lNum})`
          ];
          const sgkTracks = (HSK1_SGK_AUDIO_MAP[String(lNum)] || []).map(([fname, sz], i) => ({
            id: `hsk1-l${lNum}-sgk-${i + 1}`,
            name: sgkLabels[i] || `MP3 SGK Bài ${lNum} (${fname})`,
            category: 'mp3_sgk',
            filename: fname,
            url: `${HSK1_CDN_AUDIO}/sgk/${fname}`,
            size: sz,
            mimeType: 'audio/mpeg',
            httpStatus: 200
          }));
          const buildSbtForLesson = (n) => {
            const folder = encodeURIComponent(`第${String(n).padStart(2, '0')}课`);
            return (HSK1_SBT_AUDIO_MAP[String(n)] || []).map(([fname, sz], i) => ({
              id: `hsk1-l${n}-sbt-${i + 1}`,
              name: fname.includes('听读练')
                ? `MP3 Luyện nghe SBT Bài ${n} — Nghe & Đọc (听读练)`
                : fname.includes('语音')
                  ? `MP3 Luyện nghe SBT Bài ${n} — Ngữ âm (语音)`
                  : `MP3 Luyện nghe SBT Bài ${n} (${fname})`,
              category: 'mp3_sbt',
              filename: fname,
              url: `${HSK1_CDN_AUDIO}/sbt/${folder}/${encodeURIComponent(fname)}`,
              size: sz,
              mimeType: 'audio/mpeg',
              httpStatus: 200
            }));
          };
          if (lNum === 16) {
            return [1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(buildSbtForLesson);
          }
          if (lNum === 17) {
            return [10, 11, 12, 13, 14, 15].flatMap(buildSbtForLesson);
          }
          return [...sgkTracks, ...buildSbtForLesson(lNum)];
        };

        const buildHomeworkAssignment = (lNum) => {
          const meta = HSK1_LESSON_META[lNum];
          const custom = hwConfigByLesson[lNum];
          const defaultAssigned = meta ? !meta.isWorkbook : false;
          const defaultHw = {
            assigned: defaultAssigned,
            mandatory: defaultAssigned,
            title: meta
              ? (meta.isWorkbook ? `Tự luyện Sách bài tập (${lNum === 16 ? 'SBT 1.1' : 'SBT 1.2'})` : `Bài tập Bài ${lNum}: ${meta.titleZh} — ${meta.titleVi}`)
              : `Bài tập Bài ${lNum}`,
            instructions: meta
              ? (meta.hwPrompt || 'Chưa có bài tập cần nộp cho bài này.')
              : 'Chưa có bài tập cần nộp cho bài này.',
            relatedPages: meta && !meta.isWorkbook
              ? `SGK trang ${meta.sgkPage} · SBT trang ${meta.sbtPage} · Vở tập viết trang ${meta.voVietPage}`
              : (meta?.sbtPage ? `SBT trang ${meta.sbtPage}` : null),
            allowedTypes: ['audio', 'image', 'pdf', 'video', 'text'],
            maxFiles: 3,
            deadline: null,
            completionCriteria: meta && !meta.isWorkbook
              ? `Hoàn thành thu âm phát âm Bài ${lNum} hoặc đính kèm ảnh/PDF bài làm SBT trang ${meta.sbtPage}.`
              : null
          };
          return custom ? { ...defaultHw, ...custom } : defaultHw;
        };

        // Lọc bỏ các unit trùng lặp chỉ có type='homework' trong mock test nếu đã có unit video cùng bài
        const hasVideoUnit = sortedList.some(u => u && u.type !== 'homework');
        const effectiveList = hasVideoUnit ? sortedList.filter(u => u && u.type !== 'homework') : sortedList;

        const units = effectiveList.map((u, idx) => {
          if (!u || typeof u !== 'object') return u;
          const unitId = String(u._id || u.id || '').trim();
          const rawTitle = String(u.title || '').trim();
          let spec = HSK1_UNIT_SPEC_BY_ID[unitId.toLowerCase()] || null;
          if (!spec && rawTitle) {
            const sbtMatch = rawTitle.match(/SBT\s*1\.([12])/i);
            const baiMatch = rawTitle.match(/B[àa]i\s*(\d+)(?:\.(\d+))?/i);
            if (sbtMatch) {
              const pIdx = Number(sbtMatch[1]);
              spec = { l: pIdx === 1 ? 16 : 17, p: `SBT 1.${pIdx}`, label: `Chữa Sách bài tập Phần ${pIdx}`, vid: '', dur: '12:00', sec: 720, wb: true };
            } else if (baiMatch) {
              const lNum = Number(baiMatch[1]);
              const subIdx = baiMatch[2] ? `${lNum}.${baiMatch[2]}` : String(lNum);
              spec = { l: lNum, p: subIdx, label: `Bài giảng Bài ${subIdx}`, vid: '', dur: '13:35', sec: 815 };
            }
          }
          const lessonNumber = spec ? spec.l : null;
          const meta = lessonNumber ? HSK1_LESSON_META[lessonNumber] : null;
          const rawVid = String(u.videoId || (typeof u.video === 'string' ? u.video : '') || u.resources?.[0]?._id || u.resources?.[0]?.id || spec?.vid || '').trim();
          const isHexVid = /^[0-9a-f]{24}$/i.test(rawVid);
          const streamUrl = u.streamUrl || (rawVid.startsWith('http') ? rawVid : (isHexVid ? `https://media.izteach.vn/${vendorId}/${rawVid}/playlist.m3u8` : ''));
          const posterUrl = u.posterUrl || (isHexVid ? `https://media.izteach.vn/${vendorId}/${rawVid}/thumbnail.jpg` : '');
          const durMs = Number(u.resources?.[0]?.duration || 0);
          const duration = spec?.dur || u.duration || (durMs > 0 ? `${Math.floor(durMs / 60000)}:${String(Math.floor((durMs % 60000) / 1000)).padStart(2, '0')}` : '13:35');

          return {
            ...u,
            id: u.id || unitId,
            _id: u._id || unitId,
            unitId,
            chapterId: String(u.section || '6adadbaf69897b0002482cb5'),
            num: lessonNumber || (Number(u.num) > 0 ? Number(u.num) : idx + 1),
            lessonNumber: lessonNumber || null,
            partNumber: spec ? spec.p : null,
            partLabel: spec ? spec.label : rawTitle,
            unitType: spec?.wb ? 'workbook' : 'lesson',
            rawTitle,
            title: meta ? (spec?.wb ? `${spec.p}: ${meta.titleVi}` : `Bài ${lessonNumber}: ${meta.titleZh} — ${meta.titleVi}`) : rawTitle,
            titleZh: meta ? meta.titleZh : rawTitle,
            titleVi: meta ? meta.titleVi : '',
            grammar: meta ? meta.grammar : '',
            sgkPage: meta ? meta.sgkPage : null,
            sbtPage: meta ? meta.sbtPage : null,
            voVietPage: meta ? meta.voVietPage : null,
            videoId: rawVid,
            streamUrl,
            posterUrl,
            duration,
            durationSec: spec?.sec || Math.round(durMs / 1000) || 815,
            audioTracks: lessonNumber ? buildLessonAudio(lessonNumber) : [],
            materials: lessonNumber ? buildLessonMaterials(lessonNumber) : [],
            homeworkAssignment: lessonNumber ? buildHomeworkAssignment(lessonNumber) : { assigned: false, mandatory: false, title: 'Chưa có bài tập cần nộp cho bài này.', instructions: 'Chưa có bài tập cần nộp cho bài này.', allowedTypes: [], maxFiles: 0, deadline: null },
            resourceIds: rawVid ? [rawVid] : [],
            confidence: spec ? 'HIGH' : 'NEEDS_REVIEW',
            verified: Boolean(spec)
          };
        });

        // Gom nhóm thành các bài chính (1..15) và Sách bài tập (16..17) kèm danh sách parts để UI hiển thị chuẩn
        const lessonsByNum = new Map();
        for (const u of units) {
          const lNum = u.lessonNumber || u.num;
          if (!lessonsByNum.has(lNum)) {
            lessonsByNum.set(lNum, {
              ...u,
              id: u.unitId,
              unitId: COURSE_UNIT_MAP[normCourseId]?.[lNum] || u.unitId,
              num: lNum,
              lessonNumber: lNum,
              parts: []
            });
          }
          const grp = lessonsByNum.get(lNum);
          grp.parts.push({
            unitId: u.unitId,
            partNumber: u.partNumber || String(lNum),
            rawTitle: u.rawTitle,
            title: u.partLabel || u.rawTitle,
            videoId: u.videoId,
            duration: u.duration,
            durationSec: u.durationSec || 0,
            url: u.streamUrl,
            streamUrl: u.streamUrl,
            posterUrl: u.posterUrl
          });
        }
        const groupedLessons = Array.from(lessonsByNum.values()).map((grp) => {
          if (grp.parts.length > 1) {
            const totalSec = grp.parts.reduce((acc, p) => acc + (p.durationSec || 0), 0);
            const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
            const ss = String(totalSec % 60).padStart(2, '0');
            grp.duration = `${mm}:${ss} (${grp.parts.length} phần)`;
          }
          return grp;
        });

        // Gắn mảng parts của cùng bài học vào từng unit để khi chọn 1 unit vẫn chuyển đổi mượt giữa các phần 3.1/3.2
        const partsByLesson = new Map(groupedLessons.map(g => [g.lessonNumber, g.parts]));
        for (const u of units) {
          u.parts = partsByLesson.get(u.lessonNumber) || [];
        }

        const mappingTable = units.map(u => ({
          courseId,
          unitId: u.unitId,
          chapterId: u.chapterId,
          lessonNumber: u.lessonNumber,
          partNumber: u.partNumber,
          unitType: u.unitType,
          rawTitle: u.rawTitle,
          titleZh: u.titleZh,
          titleVi: u.titleVi,
          resourceIds: u.resourceIds,
          confidence: u.confidence,
          verified: u.verified
        }));

        return jsonResponse({
          ok: unitRes.ok,
          courseId,
          units,
          lessons: groupedLessons,
          mappingTable
        }, unitRes.ok ? 200 : unitRes.status);
      }

      // Các khóa học khác (16 khóa): ghép cặp unit video và unit homework (nếu tách đôi), trích xuất tài liệu thật từ syllabus, không giả lập trang 1 SGK
      const videoUnitsOnly = sortedList.filter(u => u && u.type !== 'homework');
      const homeworkUnitsOnly = sortedList.filter(u => u && u.type === 'homework');
      const baseList = videoUnitsOnly.length > 0 ? videoUnitsOnly : sortedList;
      const courseMeta = MASTER_PRODUCT_MAPPING[normCourseId] || null;
      const courseShortTitle = courseMeta?.shortTitle || courseMeta?.title || 'Khóa học';

      const units = baseList.map((u, idx) => {
        if (!u || typeof u !== 'object') return u;
        const lNum = Number(u.num) > 0 ? Number(u.num) : idx + 1;
        const videoUnitId = String(u._id || u.id || '').trim();
        const canonicalHwUnitId = COURSE_UNIT_MAP[normCourseId]?.[lNum] || homeworkUnitsOnly[idx]?._id || videoUnitId;
        const pairedHwUnit = homeworkUnitsOnly.find(h => String(h._id || h.id) === String(canonicalHwUnitId)) || homeworkUnitsOnly[idx] || null;
        const rawVid = String(u.videoId || (typeof u.video === 'string' ? u.video : '') || u.resources?.[0]?._id || u.resources?.[0]?.id || '').trim();
        const isHexVid = /^[0-9a-f]{24}$/i.test(rawVid);
        const streamUrl = u.streamUrl || (rawVid.startsWith('http') ? rawVid : (isHexVid ? `https://media.izteach.vn/${vendorId}/${rawVid}/playlist.m3u8` : ''));
        const posterUrl = u.posterUrl || (isHexVid ? `https://media.izteach.vn/${vendorId}/${rawVid}/thumbnail.jpg` : '');
        const durMs = Number(u.resources?.[0]?.duration || 0);
        const duration = u.duration || (durMs > 0 ? `${String(Math.floor(durMs / 60000)).padStart(2, '0')}:${String(Math.floor((durMs % 60000) / 1000)).padStart(2, '0')}` : '12:00');
        const rawTitle = String(u.title || `Bài ${lNum}`).trim();
        const resTitle = String(u.resources?.[0]?.title || '').replace(/\.(mp4|mov|mkv)$/i, '').trim();
        const titleZh = resTitle && resTitle !== rawTitle ? `${rawTitle}: ${resTitle}` : rawTitle;
        const titleVi = `${courseShortTitle} · Bài ${lNum}`;

        const syllabusDocs = [
          ...(Array.isArray(u.syllabus) ? u.syllabus : []),
          ...(Array.isArray(pairedHwUnit?.syllabus) ? pairedHwUnit.syllabus : [])
        ];
        const materials = syllabusDocs
          .filter(s => s && (s.link || s.origin?.link))
          .map((s, sIdx) => {
            const relLink = String(s.link || s.origin?.link || '').replace(/^\/+/, '');
            const fullUrl = relLink.startsWith('http') ? relLink : `https://d21acfi38wn3iy.cloudfront.net/${relLink}`;
            const docTitle = String(s.title || `Tài liệu Bài ${lNum}`);
            const isPdf = docTitle.toLowerCase().endsWith('.pdf') || String(s.origin?.mimeType || '').includes('pdf');
            return {
              id: String(s._id || s.id || `${normCourseId}-l${lNum}-doc-${sIdx + 1}`),
              title: docTitle,
              type: isPdf ? 'lesson_pdf' : 'lesson_doc',
              url: fullUrl,
              fileUrl: fullUrl,
              objectKey: relLink,
              size: Number(s.size || s.origin?.size || 0) || null,
              mimeType: s.origin?.mimeType || (isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
              actionLabel: isPdf ? 'Xem / Tải PDF bài học' : 'Tải tài liệu bài học',
              canView: true,
              canDownload: true,
              httpStatus: 200
            };
          });

        const hasHomeworkUnit = Boolean(pairedHwUnit || COURSE_UNIT_MAP[normCourseId]?.[lNum]);
        const customHw = hwConfigByLesson[lNum];
        const defaultHw = {
          assigned: hasHomeworkUnit,
          mandatory: Boolean(pairedHwUnit),
          title: pairedHwUnit ? `Bài tập Bài ${lNum}: ${titleZh}` : `Bài tập tự luyện Bài ${lNum}`,
          instructions: pairedHwUnit
            ? `Xem hết video Bài ${lNum} (${titleZh})${materials.length > 0 ? ', tải tài liệu bài học đính kèm' : ''} và nộp bản thu âm phát âm hoặc ảnh/PDF bài làm.`
            : 'Chưa có bài tập cần nộp cho bài này.',
          relatedPages: materials.length > 0 ? materials.map(m => m.title).join(' · ') : null,
          allowedTypes: ['audio', 'image', 'pdf', 'video', 'text'],
          maxFiles: 3,
          deadline: null,
          completionCriteria: pairedHwUnit ? `Hoàn thành thu âm hoặc nộp bài làm Bài ${lNum}.` : null
        };

        return {
          ...u,
          id: canonicalHwUnitId || videoUnitId,
          _id: canonicalHwUnitId || videoUnitId,
          unitId: canonicalHwUnitId || videoUnitId,
          videoUnitId,
          chapterId: String(u.section || ''),
          num: lNum,
          lessonNumber: lNum,
          partNumber: String(lNum),
          partLabel: 'Bài giảng chính',
          unitType: 'lesson',
          rawTitle,
          title: `${titleZh} — ${titleVi}`,
          titleZh,
          titleVi,
          grammar: materials.length > 0
            ? `Bài giảng video HD kèm ${materials.length} tài liệu học tập đính kèm.`
            : `Bài giảng video HD thuộc ${courseShortTitle}.`,
          sgkPage: null,
          sbtPage: null,
          voVietPage: null,
          videoId: rawVid,
          streamUrl,
          posterUrl,
          duration,
          audioTracks: [],
          materials,
          homeworkAssignment: customHw ? { ...defaultHw, ...customHw } : defaultHw,
          parts: [{
            unitId: videoUnitId,
            partNumber: String(lNum),
            rawTitle,
            title: titleZh,
            videoId: rawVid,
            duration,
            url: streamUrl,
            streamUrl,
            posterUrl
          }],
          resourceIds: rawVid ? [rawVid] : [],
          confidence: 'HIGH',
          verified: true
        };
      });

      return jsonResponse({
        ok: unitRes.ok,
        courseId,
        units,
        lessons: units
      }, unitRes.ok ? 200 : unitRes.status);
    }

    if (path === '/api/ktn/courses/homework-configs' && (request.method === 'GET' || request.method === 'POST')) {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      }
      if (request.method === 'GET') {
        const courseId = String(url.searchParams.get('courseId') || DEFAULT_COURSE_ID).trim().toLowerCase();
        if (!/^[0-9a-f]{24}$/i.test(courseId)) {
          return jsonResponse({ ok: false, error: 'INVALID_COURSE_ID', message: 'Mã khóa học (courseId) không hợp lệ.' }, 400);
        }
        const hwCfgRoom = `COURSE_HW_CONFIG:${courseId}`;
        const res = await supabaseRequest(env, `ktn_dlp_alerts?room_id=eq.${encodeURIComponent(hwCfgRoom)}&order=created_at.desc&limit=100`);
        const configs = {};
        if (res.ok && Array.isArray(res.data)) {
          for (const row of res.data) {
            try {
              const parsed = JSON.parse(String(row.blocked_content || '{}'));
              const lNum = Number(parsed.lessonNum || parsed.lessonNumber || 0);
              if (lNum > 0 && !configs[lNum]) configs[lNum] = parsed;
            } catch (_) {}
          }
        }
        return jsonResponse({ ok: true, courseId, configs });
      }
      if (session.role !== 'admin' && session.role !== 'teacher') {
        return jsonResponse({
          ok: false,
          error: 'HOMEWORK_CONFIG_FORBIDDEN',
          message: 'Học viên chỉ có quyền xem yêu cầu và nộp bài tập, không được chỉnh sửa cấu hình bài tập.'
        }, 403);
      }
      const body = await request.json().catch(() => ({}));
      const rawCourseId = typeof body.courseId === 'string' ? body.courseId.trim().toLowerCase() : '';
      const rawLessonNum = Number(body.lessonNum ?? body.lessonNumber);
      if (!/^[0-9a-f]{24}$/i.test(rawCourseId) || !Number.isInteger(rawLessonNum) || rawLessonNum < 1 || rawLessonNum > 200) {
        return jsonResponse({
          ok: false,
          error: 'INVALID_HOMEWORK_CONFIG_INPUT',
          message: 'Thông tin courseId (24 ký tự hex) hoặc lessonNum (số nguyên từ 1 đến 200) không hợp lệ.'
        }, 400);
      }
      let isKnownCourse = Boolean(MASTER_PRODUCT_MAPPING[rawCourseId]);
      if (!isKnownCourse) {
        const cCheck = await supabaseRequest(env, `ktn_courses?course_id=eq.${encodeURIComponent(rawCourseId)}&select=course_id&limit=1`);
        isKnownCourse = Boolean(cCheck.ok && Array.isArray(cCheck.data) && cCheck.data.length > 0);
      }
      if (!isKnownCourse) {
        return jsonResponse({
          ok: false,
          error: 'UNKNOWN_COURSE_ID',
          courseId: rawCourseId,
          message: 'Không tìm thấy khóa học tương ứng với courseId đã cung cấp.'
        }, 400);
      }
      if (session.role === 'teacher') {
        const assignedCourses = await getTeacherAssignedCourseIds(env, session.email);
        if (!assignedCourses.includes(rawCourseId)) {
          return jsonResponse({
            ok: false,
            error: 'TEACHER_COURSE_SCOPE_FORBIDDEN',
            courseId: rawCourseId,
            message: 'Cô không nằm trong danh sách phụ trách nội dung khóa học video này. Giáo viên chỉ được chỉnh bài tập của lớp mình phụ trách hoặc khóa học được Quản lý phân công rõ ràng.'
          }, 403);
        }
      }
      const courseId = rawCourseId;
      const lessonNum = rawLessonNum;
      const allowedTypesInput = Array.isArray(body.allowedTypes)
        ? body.allowedTypes.map(t => String(t || '').trim().toLowerCase()).filter(t => ['audio', 'image', 'pdf', 'video', 'text'].includes(t))
        : [];
      const configPayload = {
        courseId,
        lessonNum,
        assigned: body.assigned !== undefined ? Boolean(body.assigned) : true,
        mandatory: body.mandatory !== undefined ? Boolean(body.mandatory) : Boolean(body.assigned !== false),
        title: String(body.title || `Bài tập Bài ${lessonNum}`).trim().slice(0, 240),
        instructions: String(body.instructions || '').trim().slice(0, 4000),
        relatedPages: body.relatedPages ? String(body.relatedPages).trim().slice(0, 240) : null,
        allowedTypes: allowedTypesInput.length > 0 ? allowedTypesInput : ['audio', 'image', 'pdf'],
        maxFiles: Math.max(1, Math.min(5, Number(body.maxFiles) || 3)),
        deadline: body.deadline ? String(body.deadline).trim().slice(0, 120) : null,
        completionCriteria: body.completionCriteria ? String(body.completionCriteria).trim().slice(0, 500) : null,
        sampleAttachmentUrl: body.sampleAttachmentUrl ? String(body.sampleAttachmentUrl).trim().slice(0, 1000) : null,
        updatedBy: session.email,
        updatedAt: new Date().toISOString()
      };
      const hwCfgRoom = `COURSE_HW_CONFIG:${courseId}`;
      const recordId = `HWCFG-${courseId.slice(-8)}-L${lessonNum}`;
      const saveRes = await supabaseRequest(env, 'ktn_dlp_alerts', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: {
          id: recordId,
          room_id: hwCfgRoom,
          sender_email: session.email,
          sender_name: session.name || session.email,
          sender_role: session.role,
          blocked_content: JSON.stringify(configPayload),
          reason: 'COURSE_HOMEWORK_CONFIG',
          created_at: new Date().toISOString()
        }
      });
      if (!saveRes.ok) {
        return jsonResponse({ ok: false, message: 'Không thể lưu cấu hình bài tập vào cơ sở dữ liệu.' }, 502);
      }
      return jsonResponse({ ok: true, config: configPayload });
    }

    if (path === '/api/ktn/courses/sync-izteach' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || session.role !== 'admin') {
        return jsonResponse({ ok: false, message: 'Chỉ Quản lý (Admin) mới được đồng bộ danh mục khóa học từ izTeach.' }, 403);
      }
      const body = await request.json().catch(() => ({}));
      const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
      const adminToken = await getIzTeachAdminToken(env);
      const syncedCourses = [];
      let writeFailures = 0;

      // Trường hợp 1: Admin nhập thêm 1 mã Course ID mới vừa tạo trên izTeach
      if (body.courseId) {
        const cid = String(body.courseId).trim();
        let lessonsCount = Number(body.lessonsCount) || 20;
        if (adminToken) {
          try {
            const uRes = await fetch(`${IZTEACH_ENDPOINTS.courseUnits}?course=${encodeURIComponent(cid)}&vendorId=${encodeURIComponent(vendorId)}`, {
              headers: { Authorization: adminToken }
            });
            if (uRes.ok) {
              const uList = await uRes.json().catch(() => []);
              const vCount = (Array.isArray(uList) ? uList : []).filter(u => (u.type === 'video' || u.video) && u.video).length;
              if (vCount > 0) lessonsCount = vCount;
            }
          } catch {}
        }
        const newCourseRow = {
          course_id: cid,
          code: body.code || ('KTN-' + cid.slice(-4).toUpperCase()),
          title: body.title || ('Khóa học Tiếng Trung Mới (' + cid.slice(-4) + ')'),
          short_title: body.shortTitle || body.title || ('Khóa học ' + cid.slice(-4)),
          badge: body.badge || 'KHÓA HỌC MỚI',
          age_group: body.ageGroup || '5 – 15 tuổi',
          lessons_count: lessonsCount,
          price: Number(body.price) || 890000,
          old_price: Number(body.oldPrice) || 1500000,
          thumb_url: body.thumbUrl || '',
          is_bundle: false,
          bundle_course_ids: [],
          active: true,
          sort_order: 20,
          synced_from_izteach_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        const wRes = await supabaseRequest(env, 'ktn_courses', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: newCourseRow
        });
        if (!wRes || !wRes.ok) {
          writeFailures++;
        } else {
          syncedCourses.push(newCourseRow);
        }
      }

      // Trường hợp 2: Quét toàn bộ danh sách khóa học từ izTeach API + 9 khóa học gốc
      if (adminToken) {
        try {
          const cRes = await fetch(`${IZTEACH_ENDPOINTS.courseList}?vendorId=${encodeURIComponent(vendorId)}`, {
            headers: { Authorization: adminToken }
          });
          if (cRes.ok) {
            const cData = await cRes.json().catch(() => []);
            const remoteList = Array.isArray(cData?.data) ? cData.data : (Array.isArray(cData) ? cData : []);
            for (const rc of remoteList) {
              const cid = String(rc._id || rc.id || '').trim();
              if (!cid || !MASTER_PRODUCT_MAPPING[cid]) continue;
              const baseMeta = MASTER_PRODUCT_MAPPING[cid] || {};
              const row = {
                course_id: cid,
                code: baseMeta.code || ('IZ-' + cid.slice(-4).toUpperCase()),
                title: rc.title || rc.name || baseMeta.title || ('Khóa học ' + cid.slice(-4)),
                short_title: baseMeta.shortTitle || rc.shortTitle || rc.title || ('Khóa học ' + cid.slice(-4)),
                badge: baseMeta.badge || 'KHÓA HỌC TRỰC TUYẾN',
                age_group: '5 – 15 tuổi',
                lessons_count: Number(rc.totalUnits || baseMeta.lessonsCount || 20),
                price: Number(rc.price || baseMeta.price || 890000),
                old_price: Number(baseMeta.oldPrice || 1500000),
                thumb_url: rc.thumbnail || rc.avatar || '',
                is_bundle: false,
                bundle_course_ids: [],
                active: true,
                synced_from_izteach_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              };
              const wRes = await supabaseRequest(env, 'ktn_courses', {
                method: 'POST',
                prefer: 'resolution=merge-duplicates,return=representation',
                body: row
              });
              if (!wRes || !wRes.ok) {
                writeFailures++;
              } else {
                syncedCourses.push(row);
              }
            }
          }
        } catch {}
      }

      // Tắt các khóa rỗng (0 bài) hoặc ID giả cũ trong ktn_courses
      await supabaseRequest(
        env,
        'ktn_courses?course_id=in.(6983672f409cc20002e530b8,67bebce067dba000027d8119,6a9502d28ef1e30002d38cd2,6acfe08c8ef1e30002d3933a,6ad072d88ef1e30002d39481,6ad0d6bf8ef1e30002d3955a,6ad2fe038ef1e30002d397eb,6ad440998ef1e30002d3995f)',
        { method: 'PATCH', body: { active: false, updated_at: new Date().toISOString() } }
      );

      // Luôn đảm bảo 17 khóa chuẩn + 1 gói Combo có mặt trong ktn_courses
      let sortIdx = 1;
      for (const [cid, meta] of Object.entries(MASTER_PRODUCT_MAPPING)) {
        const baseRow = {
          course_id: cid,
          code: meta.code,
          title: meta.title,
          short_title: meta.shortTitle,
          badge: meta.badge,
          age_group: '5 – 15 tuổi',
          lessons_count: meta.lessonsCount || 20,
          price: meta.price || 890000,
          old_price: meta.oldPrice || 1500000,
          is_bundle: Boolean(meta.isBundle),
          bundle_course_ids: meta.bundleCourseIds || [],
          active: true,
          sort_order: sortIdx++,
          synced_from_izteach_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        const wRes = await supabaseRequest(env, 'ktn_courses', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: baseRow
        });
        if (!wRes || !wRes.ok) {
          writeFailures++;
        }
      }

      const finalRes = await supabaseRequest(env, 'ktn_courses?active=eq.true&order=sort_order.asc');
      if (writeFailures > 0 && (!finalRes || !finalRes.ok)) {
        return jsonResponse({
          ok: false,
          retryable: true,
          error: 'SUPABASE_COURSE_SYNC_FAILED',
          writeFailures,
          message: 'Không thể lưu danh mục khóa học vào cơ sở dữ liệu Supabase. Vui lòng thử lại.'
        }, 502);
      }
      return jsonResponse({
        ok: true,
        syncedCount: syncedCourses.length,
        writeFailures,
        courses: finalRes.data || Object.values(MASTER_PRODUCT_MAPPING),
        message: 'Đã đồng bộ danh sách khóa học từ izTeach thành công!'
      });
    }

    // ------------------------------------------------------------------------
    // B3. QUẢN LÝ HỌC VIÊN, CẤP/THU HỒI KHÓA HỌC & XẾP LỚP TRỰC TIẾP (4 KỊCH BẢN)
    // ------------------------------------------------------------------------
    if (path === '/api/ktn/students/me' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Chưa đăng nhập.' }, 401);
      const sbRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(session.email)}&limit=1`);
      let stu = (Array.isArray(sbRes.data) && sbRes.data[0]) || null;
      if (session.role === 'student' && (!stu || !Array.isArray(stu.online_courses))) {
        const synced = await syncStudentEntitlementFromIzTeach(env, {
          email: session.email,
          name: stu?.name || session.name,
          phone: stu?.phone || '',
          cognitoUserId: stu?.cognito_user_id || session.userId,
          izteachStudentId: stu?.izteach_student_id || session.studentId,
          accessToken: session.izteachAccessToken || session.accessToken
        });
        if (synced) stu = synced;
      }
      if (!stu) {
        stu = {
          code: session.code || session.studentId || session.id,
          email: session.email,
          name: session.name,
          class_code: session.classCode || null,
          has_live_class: Boolean(session.classCode),
          has_online_courses: Array.isArray(session.onlineCourses) && session.onlineCourses.length > 0,
          online_courses: session.onlineCourses || []
        };
      }
      return jsonResponse({
        ok: true,
        student: enrichStudentRowV3(stu)
      });
    }

    if (path === '/api/ktn/students/sync-all' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || session.role !== 'admin') {
        return jsonResponse({ ok: false, message: 'Chỉ Quản lý (Admin) mới được đồng bộ toàn bộ học viên.' }, 403);
      }
      const body = await request.json().catch(() => ({}));
      const res = await syncAllIzTeachStudentsToSupabase(env, {
        source: 'admin_manual',
        reconcilePermissions: body.reconcilePermissions !== false,
        reconcileAllPermissions: Boolean(body.reconcileAllPermissions),
        batchSize: body.batchSize
      });
      return jsonResponse(res, res.ok ? 200 : 502);
    }

    // ------------------------------------------------------------------------
    // B3.1. TÌM KIẾM SIÊU NHANH SERVER-SIDE & DANH SÁCH HỌC VIÊN PHÂN TRANG
    // Hỗ trợ cả GET /api/ktn/students và GET /api/ktn/admin/students/search
    // ------------------------------------------------------------------------
    if ((path === '/api/ktn/students' || path === '/api/ktn/admin/students/search') && request.method === 'GET') {
      const startedMs = Date.now();
      const session = await extractSessionFromRequest(request, env);
      if (!session || (session.role !== 'admin' && session.role !== 'teacher')) {
        return jsonResponse({ ok: false, message: 'Chỉ Quản lý hoặc Giáo viên mới được xem hoặc tìm kiếm danh sách học viên.' }, 403);
      }

      const rawQ = String(url.searchParams.get('q') || url.searchParams.get('search') || '').trim();
      const classFilter = String(url.searchParams.get('classCode') || '').trim().toUpperCase();
      const courseFilter = String(url.searchParams.get('courseId') || '').trim();
      const accountStatusFilter = String(url.searchParams.get('accountStatus') || '').trim();
      const syncStatusFilter = String(url.searchParams.get('syncStatus') || '').trim();
      const studentCaseFilter = String(url.searchParams.get('studentCase') || '').trim();
      const isDedicatedSearchEndpoint = path === '/api/ktn/admin/students/search';
      const requestedLimit = Number(url.searchParams.get('limit'));
      const maxPageLimit = isDedicatedSearchEndpoint ? 500 : 2000;
      const pageLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(maxPageLimit, Math.floor(requestedLimit))
        : (isDedicatedSearchEndpoint ? 25 : 2000);
      const rawOffset = Number(url.searchParams.get('offset') || url.searchParams.get('cursor') || 0);
      const pageOffset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;

      let assignedClasses = null;
      if (session.role === 'teacher') {
        assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
        if (classFilter && classFilter !== 'NONE' && classFilter !== 'ALL') {
          if (!assignedClasses.includes(classFilter)) {
            return jsonResponse({ ok: false, message: 'Cô không phụ trách lớp ' + classFilter + ' nên không có quyền xem danh sách học viên của lớp này.' }, 403);
          }
        }
        if (classFilter === 'NONE' || assignedClasses.length === 0) {
          return jsonResponse({
            ok: true,
            students: [],
            items: [],
            totalCount: 0,
            limit: pageLimit,
            offset: pageOffset,
            hasMore: false,
            nextCursor: null,
            query: rawQ,
            sqlMs: 0,
            workerMs: Date.now() - startedMs,
            queryMs: Date.now() - startedMs
          });
        }
      }

      const sanitizeForRole = (rows) => {
        if (session.role !== 'teacher') return rows;
        return rows.map(({ internal_note, last_sync_error, ...safeRow }) => safeRow);
      };

      const lifecycleMap = await loadAllStudentLifecycleStates(env).catch(() => new Map());
      const wantArchivedFilter =
        accountStatusFilter.toLowerCase() === 'archived' ||
        syncStatusFilter.toLowerCase() === 'archived';
      const wantSuspendedFilter =
        accountStatusFilter.toLowerCase() === 'suspended' ||
        syncStatusFilter.toLowerCase() === 'suspended';
      const includeArchived = url.searchParams.get('includeArchived') === '1';

      const overlayStudentLifecycle = (row) => {
        if (!row) return row;
        const em = normalizeEmail(row.email || '');
        const life = em ? lifecycleMap.get(em) : null;
        if (!life || !life.status) return row;
        return {
          ...row,
          account_status: life.status,
          accountStatus: life.status,
          lifecycleStatus: life.status,
          lifecycleReason: life.reason || null,
          lifecycleUpdatedAt: life.updatedAt || null,
          lifecycleUpdatedBy: life.updatedBy || null
        };
      };

      const shouldIncludeByLifecycle = (row) => {
        const status = String(row?.lifecycleStatus || row?.account_status || row?.accountStatus || 'active').toLowerCase();
        if (status === 'deleted') return false;
        if (wantArchivedFilter) return status === 'archived';
        if (wantSuspendedFilter) return status === 'suspended';
        if (status === 'archived' && !includeArchived) return false;
        return true;
      };

      const sqlStartMs = Date.now();
      const skipRpcForLifecycleFilter = wantArchivedFilter || wantSuspendedFilter || lifecycleMap.size > 0;
      const rpcRes = skipRpcForLifecycleFilter ? { ok: false } : await supabaseRequest(env, 'rpc/ktn_search_students', {
        method: 'POST',
        body: {
          p_query: rawQ || null,
          p_class_code: classFilter && classFilter !== 'ALL' ? classFilter : null,
          p_allowed_classes: session.role === 'teacher' ? assignedClasses : null,
          p_course_id: courseFilter && courseFilter !== 'ALL' ? courseFilter : null,
          p_account_status: accountStatusFilter && accountStatusFilter !== 'ALL' ? accountStatusFilter : null,
          p_sync_status: syncStatusFilter && syncStatusFilter !== 'ALL' ? syncStatusFilter : null,
          p_student_case: studentCaseFilter && studentCaseFilter !== 'ALL' ? studentCaseFilter : null,
          p_limit: pageLimit,
          p_offset: pageOffset
        }
      });

      if (rpcRes && rpcRes.ok && Array.isArray(rpcRes.data)) {
        const sqlMs = Date.now() - sqlStartMs;
        const rpcRows = rpcRes.data;
        const totalCount = rpcRows.length > 0 && Number.isFinite(Number(rpcRows[0].total_count))
          ? Number(rpcRows[0].total_count)
          : 0;
        const enrichedPage = sanitizeForRole(rpcRows.map(r => {
          const { total_count, match_score, ...baseRow } = r;
          const enriched = overlayStudentLifecycle(enrichStudentRowV3(overlayStudentLifecycle(baseRow)));
          if (match_score !== undefined) enriched.matchScore = Number(match_score) || 0;
          return enriched;
        }).filter(shouldIncludeByLifecycle));
        const hasMore = pageOffset + enrichedPage.length < totalCount;
        const nextCursor = hasMore ? String(pageOffset + enrichedPage.length) : null;
        const totalElapsedMs = Date.now() - startedMs;

        return jsonResponse({
          ok: true,
          students: enrichedPage,
          items: enrichedPage,
          totalCount,
          total: totalCount,
          limit: pageLimit,
          offset: pageOffset,
          hasMore,
          nextCursor,
          searchEngine: 'postgres_rpc',
          query: rawQ,
          filters: {
            classCode: classFilter || null,
            courseId: courseFilter || null,
            accountStatus: accountStatusFilter || null,
            syncStatus: syncStatusFilter || null
          },
          sqlMs,
          workerMs: Math.max(0, totalElapsedMs - sqlMs),
          queryMs: totalElapsedMs
        });
      }

      // Fallback chuẩn PostgREST server-side filter & pagination (khi DB chưa chạy RPC ktn_search_students)
      const pgParts = ['select=*'];
      if (session.role === 'teacher') {
        if (classFilter && classFilter !== 'ALL') {
          pgParts.push(`class_code=eq.${encodeURIComponent(classFilter)}`);
        } else {
          pgParts.push(`class_code=in.(${assignedClasses.map(c => encodeURIComponent(c)).join(',')})`);
        }
      } else if (classFilter === 'NONE' || classFilter === 'UNASSIGNED' || classFilter === '__UNASSIGNED__') {
        pgParts.push('or=(class_code.is.null,class_code.eq.)');
      } else if (classFilter && classFilter !== 'ALL') {
        pgParts.push(`class_code=eq.${encodeURIComponent(classFilter)}`);
      }

      if (accountStatusFilter && accountStatusFilter !== 'ALL' && !wantArchivedFilter && !wantSuspendedFilter) {
        pgParts.push(`account_status=eq.${encodeURIComponent(accountStatusFilter.toLowerCase())}`);
      }
      if (syncStatusFilter && syncStatusFilter !== 'ALL' && !wantArchivedFilter && !wantSuspendedFilter) {
        const sfLower = syncStatusFilter.toLowerCase();
        if (sfLower === 'needs_resync') {
          pgParts.push('sync_status=in.(needs_resync,sync_failed,partial_failure,pending_sync,error)');
        } else {
          pgParts.push(`sync_status=eq.${encodeURIComponent(sfLower)}`);
        }
      }
      if (courseFilter && courseFilter !== 'ALL') {
        const cfObj = encodeURIComponent(JSON.stringify([{ id: courseFilter }]));
        const cfStr = encodeURIComponent(JSON.stringify([courseFilter]));
        pgParts.push(`or=(online_courses.cs.${cfObj},online_courses.cs.${cfStr})`);
      }
      if (studentCaseFilter && studentCaseFilter !== 'ALL') {
        const normCase = studentCaseFilter.toLowerCase();
        if (normCase === 'video_only' || normCase === 'online_only') {
          pgParts.push('has_online_courses=eq.true', 'has_live_class=eq.false');
        } else if (normCase === 'live_only' || normCase === 'sll_only') {
          pgParts.push('has_live_class=eq.true', 'has_online_courses=eq.false');
        } else if (normCase === 'hybrid' || normCase === 'both') {
          pgParts.push('has_live_class=eq.true', 'has_online_courses=eq.true');
        } else if (normCase === 'unassigned' || normCase === 'none') {
          pgParts.push('has_live_class=eq.false', 'has_online_courses=eq.false');
        }
      }

      const normTokens = normalizeViSearchText(rawQ).split(' ').filter(Boolean);
      if (normTokens.length === 1) {
        pgParts.push(`search_text=ilike.*${encodeURIComponent(normTokens[0])}*`);
      } else if (normTokens.length > 1) {
        pgParts.push(`and=(${normTokens.map(tok => `search_text.ilike.*${encodeURIComponent(tok)}*`).join(',')})`);
      }

      const useInWorkerRankingWindow =
        (normTokens.length > 0 && (pageOffset + pageLimit <= 500)) ||
        wantArchivedFilter ||
        wantSuspendedFilter;

      pgParts.push('order=updated_at.desc.nullslast,email.asc');
      if (!useInWorkerRankingWindow) {
        pgParts.push(`limit=${pageLimit}`);
        pgParts.push(`offset=${pageOffset}`);
      } else {
        pgParts.push(`limit=${Math.min(1000, Math.max(pageLimit + pageOffset, 200))}`);
      }

      const fallbackSqlStartMs = Date.now();
      let sbRes = await supabaseRequest(env, `ktn_students?${pgParts.join('&')}`, {
        prefer: 'count=exact'
      });
      if (
        sbRes &&
        sbRes.ok &&
        Array.isArray(sbRes.data) &&
        sbRes.data.length === 1000 &&
        pageLimit > 1000 &&
        Number.isFinite(sbRes.totalCount) &&
        sbRes.totalCount > pageOffset + 1000
      ) {
        const extraPgParts = pgParts
          .filter(p => !p.startsWith('limit=') && !p.startsWith('offset='))
          .concat([`limit=${pageLimit - 1000}`, `offset=${pageOffset + 1000}`]);
        const extraRes = await supabaseRequest(env, `ktn_students?${extraPgParts.join('&')}`);
        if (extraRes && extraRes.ok && Array.isArray(extraRes.data)) {
          sbRes = { ...sbRes, data: sbRes.data.concat(extraRes.data) };
        }
      }
      let usedLegacySchemaFallback = false;
      let legacyTotalRows = 0;
      if ((!sbRes || !sbRes.ok) && sbRes?.status === 400) {
        // Fallback cho schema pre-V3 chưa có cột search_text / account_status / sync_status
        usedLegacySchemaFallback = true;
        const legacyParts = ['select=*'];
        if (session.role === 'teacher') {
          if (classFilter && classFilter !== 'ALL') {
            legacyParts.push(`class_code=eq.${encodeURIComponent(classFilter)}`);
          } else {
            legacyParts.push(`class_code=in.(${assignedClasses.map(c => encodeURIComponent(c)).join(',')})`);
          }
        } else if (classFilter === 'NONE' || classFilter === 'UNASSIGNED' || classFilter === '__UNASSIGNED__') {
          legacyParts.push('or=(class_code.is.null,class_code.eq.)');
        } else if (classFilter && classFilter !== 'ALL') {
          legacyParts.push(`class_code=eq.${encodeURIComponent(classFilter)}`);
        }
        if (courseFilter && courseFilter !== 'ALL') {
          const cfObj = encodeURIComponent(JSON.stringify([{ id: courseFilter }]));
          const cfStr = encodeURIComponent(JSON.stringify([courseFilter]));
          legacyParts.push(`or=(online_courses.cs.${cfObj},online_courses.cs.${cfStr})`);
        }
        legacyParts.push('order=updated_at.desc.nullslast,email.asc');

        const needsInMemoryLegacyFilter = Boolean(
          rawQ ||
          (courseFilter && courseFilter !== 'ALL') ||
          (accountStatusFilter && accountStatusFilter !== 'ALL') ||
          (syncStatusFilter && syncStatusFilter !== 'ALL') ||
          (studentCaseFilter && studentCaseFilter !== 'ALL') ||
          wantArchivedFilter ||
          wantSuspendedFilter
        );

        if (!needsInMemoryLegacyFilter) {
          const directParts = [...legacyParts, `limit=${pageLimit}`, `offset=${pageOffset}`];
          sbRes = await supabaseRequest(env, `ktn_students?${directParts.join('&')}`, {
            prefer: 'count=exact'
          });
          if (
            sbRes &&
            sbRes.ok &&
            Array.isArray(sbRes.data) &&
            sbRes.data.length === 1000 &&
            pageLimit > 1000 &&
            Number.isFinite(sbRes.totalCount) &&
            sbRes.totalCount > pageOffset + 1000
          ) {
            const extraParts = [...legacyParts, `limit=${pageLimit - 1000}`, `offset=${pageOffset + 1000}`];
            const extraRes = await supabaseRequest(env, `ktn_students?${extraParts.join('&')}`);
            if (extraRes && extraRes.ok && Array.isArray(extraRes.data)) {
              sbRes = { ...sbRes, data: sbRes.data.concat(extraRes.data) };
            }
          }
          legacyTotalRows = Number.isFinite(sbRes?.totalCount)
            ? sbRes.totalCount
            : (pageOffset + (Array.isArray(sbRes?.data) ? sbRes.data.length : 0));
        } else {
          // Không dùng name.ilike.*longestTok* với chuỗi đã bỏ dấu vì PostgreSQL ILIKE phân biệt dấu tiếng Việt
          // (vd: 'Ngân' ILIKE '%ngan%' -> false) và làm sót học viên có dấu. Tải các trang 1000 bản ghi rồi lọc chính xác bằng filterAndRankStudents.
          const firstPageParts = [...legacyParts, 'limit=1000', 'offset=0'];
          const firstRes = await supabaseRequest(env, `ktn_students?${firstPageParts.join('&')}`, {
            prefer: 'count=exact'
          });
          if (firstRes && firstRes.ok && Array.isArray(firstRes.data)) {
            let combinedRows = firstRes.data;
            const totalAvail = Number.isFinite(firstRes.totalCount) ? firstRes.totalCount : combinedRows.length;
            if (combinedRows.length === 1000 && totalAvail > 1000) {
              const secondPageParts = [...legacyParts, 'limit=1000', 'offset=1000'];
              const secondRes = await supabaseRequest(env, `ktn_students?${secondPageParts.join('&')}`);
              if (secondRes && secondRes.ok && Array.isArray(secondRes.data)) {
                combinedRows = combinedRows.concat(secondRes.data);
              }
            }
            sbRes = { ...firstRes, data: combinedRows };
          } else {
            sbRes = firstRes;
          }
        }
      }
      const sqlMs = Date.now() - fallbackSqlStartMs;

      if (!sbRes || !sbRes.ok) {
        return jsonResponse({
          ok: false,
          retryable: true,
          message: 'Chưa tải được danh sách học viên từ cơ sở dữ liệu Supabase.'
        }, sbRes?.status || 503);
      }

      const rawList = (Array.isArray(sbRes.data) ? sbRes.data : [])
        .map(overlayStudentLifecycle)
        .filter(shouldIncludeByLifecycle);
      let pageItems = [];
      let totalCount = 0;

      const needsInMemoryLegacyRanking = usedLegacySchemaFallback && Boolean(
        rawQ ||
        (courseFilter && courseFilter !== 'ALL') ||
        (accountStatusFilter && accountStatusFilter !== 'ALL') ||
        (syncStatusFilter && syncStatusFilter !== 'ALL') ||
        (studentCaseFilter && studentCaseFilter !== 'ALL') ||
        wantArchivedFilter ||
        wantSuspendedFilter
      );

      if (!useInWorkerRankingWindow && !needsInMemoryLegacyRanking) {
        pageItems = sanitizeForRole(rawList.map(r => overlayStudentLifecycle(enrichStudentRowV3(r))));
        totalCount = usedLegacySchemaFallback
          ? legacyTotalRows
          : (Number.isFinite(sbRes.totalCount) ? Math.min(sbRes.totalCount, pageOffset + pageItems.length + Math.max(0, sbRes.totalCount - (Array.isArray(sbRes.data) ? sbRes.data.length : 0))) : (pageOffset + pageItems.length));
      } else {
        const rankedList = filterAndRankStudents(rawList, {
          q: rawQ,
          classCode: classFilter === 'ALL' ? '' : classFilter,
          courseId: courseFilter === 'ALL' ? '' : courseFilter,
          accountStatus: (accountStatusFilter === 'ALL' || wantArchivedFilter || wantSuspendedFilter) ? '' : accountStatusFilter,
          syncStatus: (syncStatusFilter === 'ALL' || wantArchivedFilter || wantSuspendedFilter) ? '' : syncStatusFilter,
          studentCase: studentCaseFilter === 'ALL' ? '' : studentCaseFilter
        }).map(overlayStudentLifecycle);
        totalCount = rankedList.length;
        pageItems = sanitizeForRole(rankedList.slice(pageOffset, pageOffset + pageLimit));
      }

      const hasMore = pageOffset + pageItems.length < totalCount;
      const nextCursor = hasMore ? String(pageOffset + pageItems.length) : null;
      const totalElapsedMs = Date.now() - startedMs;

      return jsonResponse({
        ok: true,
        students: pageItems,
        items: pageItems,
        totalCount,
        total: totalCount,
        limit: pageLimit,
        offset: pageOffset,
        hasMore,
        nextCursor,
        searchEngine: 'postgrest_server_side',
        query: rawQ,
        filters: {
          classCode: classFilter || null,
          courseId: courseFilter || null,
          accountStatus: accountStatusFilter || null,
          syncStatus: syncStatusFilter || null
        },
        sqlMs,
        workerMs: Math.max(0, totalElapsedMs - sqlMs),
        queryMs: totalElapsedMs
      });
    }

    // ------------------------------------------------------------------------
    // B3.2. ONE-CLICK PROVISIONING HỌC VIÊN MỚI TỪ TRUNG TÂM ADMIN
    // POST /api/ktn/admin/students/provision
    // Hỗ trợ: Chỉ học video / Chỉ học lớp trực tiếp / Học cả hai (KHÔNG tự gán cứng YCT2-04)
    // ------------------------------------------------------------------------
    if (path === '/api/ktn/admin/students/provision' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || session.role !== 'admin') {
        return jsonResponse({ ok: false, message: 'Chỉ Quản lý (Admin) mới có quyền Tạo và cấp tài khoản học viên.' }, 403);
      }
      const body = await request.json().catch(() => ({}));
      const email = normalizeEmail(body.email || body.studentEmail || '');
      const name = String(body.name || body.studentName || '').trim();
      const phone = String(body.phone || '').trim();
      const parentName = (body.parentName !== undefined || body.parent_name !== undefined)
        ? String(body.parentName ?? body.parent_name ?? '').trim()
        : undefined;
      const parentPhone = (body.parentPhone !== undefined || body.parent_phone !== undefined)
        ? String(body.parentPhone ?? body.parent_phone ?? '').trim()
        : undefined;
      const internalNote = (body.note !== undefined || body.internalNote !== undefined)
        ? String(body.note || body.internalNote || '').trim()
        : undefined;
      // Tuyệt đối không tự ý gán lớp YCT2-04 nếu Admin không chọn
      const classCode = body.classCode ? String(body.classCode).trim().toUpperCase() : null;
      const rawCourseIds = Array.isArray(body.courseIds)
        ? body.courseIds
        : (body.courseId ? [body.courseId] : []);
      const resolvedCourseIds = rawCourseIds.length > 0 ? resolveOrderCourseIds(rawCourseIds) : [];
      const idempotencyKey = String(body.idempotencyKey || request.headers.get('Idempotency-Key') || '').trim();

      if (!email || !email.includes('@')) {
        return jsonResponse({ ok: false, message: 'Vui lòng nhập Email đăng nhập hợp lệ cho học viên.' }, 400);
      }
      if (!name) {
        return jsonResponse({ ok: false, message: 'Vui lòng nhập Họ và tên học viên.' }, 400);
      }
      if (classCode) {
        const clsCheck = await supabaseRequest(
          env,
          `ktn_classes?id=eq.${encodeURIComponent(classCode)}&select=id,active&limit=1`
        );
        const clsRow = clsCheck.ok && Array.isArray(clsCheck.data) && clsCheck.data[0] ? clsCheck.data[0] : null;
        if (clsRow && clsRow.active === false) {
          return jsonResponse({
            ok: false,
            error: 'CLASS_ARCHIVED_OR_INACTIVE',
            message: `Lớp ${classCode} đã được lưu trữ nên không thể thêm học viên mới vào lớp này.`
          }, 409);
        }
      }

      const lockKey = idempotencyKey ? `idem:${idempotencyKey}:${email}` : `student_provision:${email}`;
      return runWithProvisioningLock(lockKey, async () => {
        const requestPayloadMeta = {
          email,
          name,
          phone,
          parentName,
          parentPhone,
          classCode,
          courseIds: resolvedCourseIds
        };

        let priorIncompleteJob = null;
        if (!idempotencyKey || body.operationId) {
          priorIncompleteJob = await findLatestIncompleteStudentJobByEmail(env, email, body.operationId);
        }

        const effectiveIdempotencyKey = priorIncompleteJob?.idempotency_key || idempotencyKey || null;
        const claim = await claimProvisioningJobAtomically(env, {
          operationId: body.operationId || priorIncompleteJob?.operation_id || undefined,
          idempotencyKey: effectiveIdempotencyKey,
          jobType: 'student_create',
          actorEmail: session.email,
          targetEmail: email,
          targetRole: 'student',
          requestPayload: requestPayloadMeta
        });

        if (claim.replayed && claim.job?.result_summary) {
          return jsonResponse({
            ok: true,
            idempotentReplay: true,
            operationId: claim.job.operation_id,
            ...claim.job.result_summary
          });
        }
        if (claim.inProgress) {
          return jsonResponse({
            ok: false,
            retryable: true,
            inProgress: true,
            operationId: claim.job?.operation_id || null,
            error: 'PROVISIONING_IN_PROGRESS',
            message: 'Yêu cầu khởi tạo học viên này đang được xử lý ở một tiến trình khác. Vui lòng đợi trong giây lát.'
          }, 409);
        }

        if (!claim.resumed && !priorIncompleteJob) {
          priorIncompleteJob = await findLatestIncompleteStudentJobByEmail(env, email, body.operationId);
        }

        const opId = priorIncompleteJob?.operation_id || claim.operationId || generateOperationId('PROV-STU');
        const finalIdempotencyKey = priorIncompleteJob?.idempotency_key || effectiveIdempotencyKey || null;
        const completedSteps = Array.from(new Set([
          ...(Array.isArray(priorIncompleteJob?.completed_steps) ? priorIncompleteJob.completed_steps : []),
          ...(Array.isArray(claim.completedSteps) ? claim.completedSteps : [])
        ]));
        const priorCognitoUserId = isValidCognitoUuid(claim.cognitoUserId)
          ? claim.cognitoUserId
          : (isValidCognitoUuid(priorIncompleteJob?.cognito_user_id) ? priorIncompleteJob.cognito_user_id : null);
        const priorIzteachStudentId = claim.izteachStudentId || priorIncompleteJob?.izteach_student_id || null;
        const priorAccountCreated = Boolean(
          claim.job?.response_payload?.account_created_in_job ||
          priorIncompleteJob?.response_payload?.account_created_in_job
        );

        // Luôn kích hoạt tài khoản đăng nhập trên izTeach để học sinh vào cổng KTN học được ngay (kể cả học sinh chỉ học lớp trực tiếp)
        let prov = null;
        const alreadyProvisionedIzTeach = completedSteps.includes('izteach_account') &&
          (resolvedCourseIds.length === 0 || completedSteps.includes('izteach_permissions')) &&
          isValidCognitoUuid(priorCognitoUserId);

        if (alreadyProvisionedIzTeach) {
          const resumedPwd = priorAccountCreated
            ? (String(body.initialPassword || body.password || '').trim() || await deriveDeterministicInitialPassword(env, opId, email))
            : null;
          prov = {
            ok: true,
            cognitoUserId: priorCognitoUserId,
            izteachStudentId: priorIzteachStudentId,
            grantedCourseIds: resolvedCourseIds,
            allCourseIds: resolvedCourseIds,
            accountCreated: priorAccountCreated,
            existingAccount: !priorAccountCreated,
            credentialMode: priorAccountCreated ? 'new_account_initial_password' : 'existing_account_unchanged',
            initialPassword: resumedPwd
          };
        } else {
          prov = await provisionStudentOnIzTeach(env, {
            operationId: opId,
            student_email: email,
            student_name: name,
            phone,
            initialPassword: body.initialPassword || body.password || undefined,
            courseIds: resolvedCourseIds,
            skipCourses: resolvedCourseIds.length === 0,
            replaceCourses: Boolean(body.replaceCourses),
            cognito_user_id: body.cognitoUserId || priorCognitoUserId || null,
            preserveAccountCreated: priorAccountCreated
          });
        }

        const effectiveAccountCreated = Boolean(prov.accountCreated || priorAccountCreated);

        if (!prov.ok) {
          if (isValidCognitoUuid(prov.cognitoUserId) && !completedSteps.includes('izteach_account')) {
            completedSteps.push('izteach_account');
          }
          const failedStepName = prov.failedStep || 'izteach_account_provision';
          const jobStatus = completedSteps.length > 0 ? 'partial_failure' : 'failed';
          await saveProvisioningJobState(env, {
            operation_id: opId,
            idempotency_key: finalIdempotencyKey,
            job_type: 'student_create',
            actor_email: session.email,
            target_email: email,
            target_role: 'student',
            status: jobStatus,
            sync_status: completedSteps.length > 0 ? 'partial_failure' : 'sync_failed',
            completed_steps: completedSteps,
            failed_step: failedStepName,
            cognito_user_id: prov.cognitoUserId || priorCognitoUserId || null,
            izteach_student_id: prov.izteachStudentId || priorIzteachStudentId || null,
            request_payload: requestPayloadMeta,
            response_payload: {
              account_created_in_job: effectiveAccountCreated,
              izteach_create_status: prov.izteachCreateStatus ?? null,
              izteach_response_shape: prov.izteachResponseShape ?? null
            },
            error_code: 'IZTEACH_PROVISION_FAILED',
            error_message: prov.error || 'Lỗi tạo tài khoản trên izTeach',
            retryable: true
          });
          return jsonResponse({
            ok: false,
            operationId: opId,
            idempotencyKey: finalIdempotencyKey,
            partialFailure: completedSteps.length > 0,
            retryable: true,
            syncStatus: completedSteps.length > 0 ? 'partial_failure' : 'sync_failed',
            accountStatus: 'sync_error',
            completedSteps,
            failedStep: failedStepName,
            cognitoUserId: prov.cognitoUserId || priorCognitoUserId || null,
            izteachStudentId: prov.izteachStudentId || priorIzteachStudentId || null,
            error: 'IZTEACH_PROVISION_FAILED',
            message: `Chưa khởi tạo được tài khoản học viên trên izTeach (${prov.error || 'Lỗi dịch vụ upstream'}). Vui lòng bấm Thử lại.`
          }, 502);
        }

        if (!completedSteps.includes('izteach_account')) completedSteps.push('izteach_account');
        if (resolvedCourseIds.length > 0 && !completedSteps.includes('izteach_permissions')) {
          completedSteps.push('izteach_permissions');
        }

        const updatedStudent = await mergeAndUpsertStudentCourses(env, {
          email,
          name,
          phone,
          parentName,
          parentPhone,
          cognitoUserId: prov.cognitoUserId,
          izteachStudentId: prov.izteachStudentId,
          addCourseIds: body.replaceCourses ? [] : (Array.isArray(prov.allCourseIds) ? prov.allCourseIds : resolvedCourseIds),
          replaceCourseIds: body.replaceCourses ? resolvedCourseIds : null,
          classCode: classCode || (body.replaceClass ? null : undefined),
          codeHint: body.code || '',
          accountStatus: 'active',
          syncStatus: 'synced',
          lastSyncError: null,
          internalNote,
          actorEmail: session.email
        });

        if (!updatedStudent || updatedStudent.ok === false) {
          await saveProvisioningJobState(env, {
            operation_id: opId,
            idempotency_key: finalIdempotencyKey,
            job_type: 'student_create',
            actor_email: session.email,
            target_email: email,
            target_role: 'student',
            status: 'partial_failure',
            sync_status: 'partial_failure',
            completed_steps: completedSteps,
            failed_step: 'supabase_student_upsert',
            cognito_user_id: prov.cognitoUserId,
            izteach_student_id: prov.izteachStudentId,
            request_payload: requestPayloadMeta,
            response_payload: {
              account_created_in_job: effectiveAccountCreated,
              izteach_create_status: prov.izteachCreateStatus ?? null,
              izteach_response_shape: prov.izteachResponseShape ?? null
            },
            error_code: 'SUPABASE_UPSERT_FAILED',
            error_message: 'Đã tạo tài khoản trên izTeach nhưng lưu hồ sơ vào Supabase thất bại.',
            retryable: true
          });
          await logSyncEvent(env, {
            operationId: opId,
            eventType: 'student_create',
            sourceSystem: 'izteach',
            targetSystem: 'supabase',
            entityType: 'student',
            entityKey: email,
            status: 'partial_failure',
            driftCode: 'A02_IZTEACH_WITHOUT_SUPABASE_STUDENT',
            errorCode: 'SUPABASE_UPSERT_FAILED',
            errorMessage: 'Đã tạo tài khoản izTeach nhưng chưa lưu được vào bảng ktn_students',
            details: { email, name, classCode, courseIds: resolvedCourseIds, completedSteps },
            createdBy: session.email
          });
          return jsonResponse({
            ok: false,
            operationId: opId,
            idempotencyKey: finalIdempotencyKey,
            partialFailure: true,
            retryable: true,
            syncStatus: 'partial_failure',
            accountStatus: 'sync_error',
            completedSteps,
            failedStep: 'supabase_student_upsert',
            cognitoUserId: prov.cognitoUserId,
            izteachStudentId: prov.izteachStudentId,
            accountCreated: Boolean(prov.accountCreated),
            existingAccount: Boolean(prov.existingAccount),
            credentialMode: prov.credentialMode,
            initialPassword: prov.initialPassword,
            error: 'SUPABASE_SYNC_FAILED',
            message: 'Đã tạo tài khoản trên izTeach nhưng chưa lưu được hồ sơ vào Supabase. Vui lòng bấm Đồng bộ lại.'
          }, 502);
        }

        const effectiveClassCode = updatedStudent.class_code || classCode || null;
        if (!completedSteps.includes('supabase_student_upsert')) completedSteps.push('supabase_student_upsert');
        if (effectiveClassCode && !completedSteps.includes('class_assignment')) completedSteps.push('class_assignment');

        const responseSummary = {
          operationId: opId,
          idempotencyKey: finalIdempotencyKey,
          syncStatus: 'synced',
          accountStatus: 'active',
          readyToLogin: true,
          fullySynced: true,
          completedSteps,
          failedStep: null,
          student: updatedStudent,
          cognitoUserId: prov.cognitoUserId,
          izteachStudentId: prov.izteachStudentId,
          grantedCourseIds: prov.grantedCourseIds,
          allCourseIds: prov.allCourseIds,
          classCode: effectiveClassCode,
          classJoinedNotification: updatedStudent.classJoinedNotification || null,
          pushDispatch: updatedStudent.pushDispatch || null,
          izteachCreateStatus: prov.izteachCreateStatus ?? null,
          izteachResponseShape: prov.izteachResponseShape ?? null,
          accountCreated: Boolean(prov.accountCreated),
          existingAccount: Boolean(prov.existingAccount),
          credentialMode: prov.credentialMode,
          initialPassword: prov.initialPassword,
          message: prov.accountCreated
            ? `Đã tạo mới tài khoản học viên ${name} (${email}) và kích hoạt thành công!`
            : `Đã cập nhật hồ sơ & quyền học cho tài khoản học viên ${name} (${email}) thành công!`
        };

        await saveProvisioningJobState(env, {
          operation_id: opId,
          idempotency_key: finalIdempotencyKey,
          job_type: 'student_create',
          actor_email: session.email,
          target_email: email,
          target_role: 'student',
          status: 'completed',
          sync_status: 'synced',
          completed_steps: completedSteps,
          failed_step: null,
          cognito_user_id: prov.cognitoUserId,
          izteach_student_id: prov.izteachStudentId,
          request_payload: requestPayloadMeta,
          result_summary: responseSummary
        });

        await logSyncEvent(env, {
          operationId: opId,
          eventType: 'student_create',
          sourceSystem: 'ktn_admin',
          targetSystem: 'izteach+supabase',
          entityType: 'student',
          entityKey: email,
          status: 'synced',
          details: {
            email,
            name,
            classCode: effectiveClassCode,
            courseIds: resolvedCourseIds,
            cognitoUserId: prov.cognitoUserId,
            izteachStudentId: prov.izteachStudentId,
            accountCreated: Boolean(prov.accountCreated),
            completedSteps
          },
          createdBy: session.email
        });

        return jsonResponse({
          ok: true,
          ...responseSummary
        });
      });
    }

    if (path === '/api/ktn/students/courses' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      const body = await request.json().catch(() => ({}));
      const action = String(body.action || 'grant').toLowerCase(); // 'grant' | 'revoke' | 'set' | 'assign_class'
      if (!session || (session.role !== 'admin' && !(session.role === 'teacher' && action === 'assign_class'))) {
        return jsonResponse({ ok: false, message: 'Chỉ Quản lý (Admin) mới được cấp/thu hồi khóa học và xếp lớp.' }, 403);
      }
      const email = normalizeEmail(body.email || body.studentEmail || '');
      if (!email) {
        return jsonResponse({ ok: false, message: 'Vui lòng nhập email học viên.' }, 400);
      }

      const rawCourseIds = Array.isArray(body.courseIds)
        ? body.courseIds
        : (body.courseId ? [body.courseId] : []);

      let existingStu = null;
      const stuCheck = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(email)}&select=*&limit=1`);
      if (stuCheck.ok && Array.isArray(stuCheck.data) && stuCheck.data[0]) {
        existingStu = stuCheck.data[0];
      }

      const targetClassInput = body.classCode !== undefined ? String(body.classCode || '').trim().toUpperCase() : '';
      if (targetClassInput) {
        const clsCheck = await supabaseRequest(
          env,
          `ktn_classes?id=eq.${encodeURIComponent(targetClassInput)}&select=id,active&limit=1`
        );
        const clsRow = clsCheck.ok && Array.isArray(clsCheck.data) && clsCheck.data[0] ? clsCheck.data[0] : null;
        if (clsRow && clsRow.active === false) {
          return jsonResponse({
            ok: false,
            error: 'CLASS_ARCHIVED_OR_INACTIVE',
            message: `Lớp ${targetClassInput} đã được lưu trữ nên không thể xếp học viên vào lớp này.`
          }, 409);
        }
      }

      if (session.role === 'teacher') {
        if (rawCourseIds.length > 0) {
          return jsonResponse({
            ok: false,
            message: 'Giáo viên chỉ được xếp học viên vào lớp mình chủ nhiệm, không được cấp hoặc thu hồi khóa học trực tuyến.'
          }, 403);
        }
        const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
        const targetClass = String(body.classCode || '').trim().toUpperCase();
        if (!targetClass || !assignedClasses.includes(targetClass)) {
          return jsonResponse({ ok: false, message: 'Cô chỉ được xếp học viên vào lớp cô chủ nhiệm.' }, 403);
        }
        const currentStuClass = String(existingStu?.class_code || '').trim().toUpperCase();
        if (currentStuClass && !assignedClasses.includes(currentStuClass)) {
          return jsonResponse({
            ok: false,
            message: `Học viên đang thuộc lớp ${currentStuClass} của giáo viên khác. Chỉ Quản lý (Admin) mới được chuyển lớp liên giáo viên.`
          }, 403);
        }
      }

      const resolvedIds = (session.role === 'admin' && rawCourseIds.length > 0) ? resolveOrderCourseIds(rawCourseIds) : [];

      let cognitoUserId = body.cognitoUserId || existingStu?.cognito_user_id || null;
      let izteachStudentId = body.izteachStudentId || existingStu?.izteach_student_id || null;
      let provResult = null;
      let assignClassProvisionFailed = false;

      // Nếu cấp thêm khóa học, đối soát toàn bộ khóa học (set), hoặc xếp vào lớp trực tiếp, tạo/kích hoạt tài khoản trên izTeach!
      if ((action === 'grant' || action === 'set' || action === 'assign_class') && (resolvedIds.length > 0 || body.classCode || action === 'set')) {
        const prov = await provisionStudentOnIzTeach(env, {
          student_email: email,
          student_name: body.name || existingStu?.name || email.split('@')[0],
          phone: body.phone || existingStu?.phone || '',
          initialPassword: body.initialPassword || body.password || undefined,
          courseIds: resolvedIds,
          skipCourses: resolvedIds.length === 0,
          replaceCourses: action === 'set',
          cognito_user_id: cognitoUserId
        });
        provResult = prov;
        if (!prov.ok && action !== 'assign_class') {
          return jsonResponse({
            ok: false,
            retryable: true,
            syncStatus: 'sync_failed',
            error: 'IZTEACH_PROVISION_FAILED',
            message: `Chưa tạo hoặc kích hoạt được tài khoản đăng nhập trên izTeach (${prov.error || 'Lỗi dịch vụ upstream'}). Hồ sơ chưa được lưu — vui lòng bấm thử lại.`
          }, 502);
        }
        if (prov.ok) {
          cognitoUserId = prov.cognitoUserId;
          izteachStudentId = prov.izteachStudentId;
        } else if (action === 'assign_class') {
          assignClassProvisionFailed = true;
          if (body.requireAccountProvisioning === true) {
            return jsonResponse({
              ok: false,
              retryable: true,
              classAssignmentSaved: false,
              accountProvisioned: false,
              readyToLogin: isValidCognitoUuid(cognitoUserId),
              fullySynced: false,
              syncStatus: 'sync_failed',
              accountStatus: isValidCognitoUuid(cognitoUserId) ? 'active' : 'pending_activation',
              error: 'IZTEACH_PROVISION_FAILED',
              message: `Không thể tạo tài khoản đăng nhập trên izTeach khi xếp lớp (${prov.error || 'Lỗi upstream'}).`
            }, 502);
          }
        }
      }

      // Nếu thu hồi khóa học (action === 'revoke'), gọi ngay PUT /user-permission/remove-products/:cognitoUserId trên izTeach và xác minh!
      let izteachRevokeResult = null;
      if (action === 'revoke') {
        if (resolvedIds.length === 0) {
          return jsonResponse({ ok: false, message: 'Vui lòng chọn ít nhất 1 khóa học cần thu hồi.' }, 400);
        }
        izteachRevokeResult = await revokeStudentCoursesOnIzTeach(env, {
          email,
          cognitoUserId,
          removeCourseIds: resolvedIds
        });
        if (!izteachRevokeResult || !izteachRevokeResult.ok || izteachRevokeResult.skipped) {
          return jsonResponse({
            ok: false,
            retryable: true,
            syncStatus: 'sync_failed',
            error: izteachRevokeResult?.reason || 'IZTEACH_REVOKE_FAILED',
            izteachResult: izteachRevokeResult || undefined,
            izteachRevoked: izteachRevokeResult || undefined,
            message: `Chưa thu hồi được khóa học trên izTeach (${izteachRevokeResult?.error || izteachRevokeResult?.reason || 'Lỗi dịch vụ upstream'}). Quyền học trên Sổ Liên Lạc chưa bị xóa để tránh lệch dữ liệu — vui lòng thử lại.`
          }, 502);
        }
        if (izteachRevokeResult.cognitoUserId && !cognitoUserId) {
          cognitoUserId = izteachRevokeResult.cognitoUserId;
        }
      }

      // Giải quyết triệt để BUG BE-05: Nếu xếp lớp nhưng chưa tạo được tài khoản trên izTeach và học viên chưa từng có cognito_user_id,
      // ghi nhận rõ trạng thái pending_activation thay vì báo giả 'synced'
      const hasValidAccount = isValidCognitoUuid(cognitoUserId);
      const computedAccountStatus = hasValidAccount ? 'active' : 'pending_activation';
      let computedSyncStatus = 'synced';
      let computedLastSyncError = null;
      if (assignClassProvisionFailed && !hasValidAccount) {
        computedSyncStatus = 'pending_activation';
        computedLastSyncError = provResult?.error || 'IZTEACH_ACCOUNT_PENDING';
      } else if (action === 'assign_class' && !provResult) {
        computedSyncStatus = existingStu?.sync_status || (hasValidAccount ? 'synced' : 'pending_activation');
        computedLastSyncError = existingStu?.last_sync_error !== undefined ? existingStu.last_sync_error : null;
      }

      const updatedStudent = await mergeAndUpsertStudentCourses(env, {
        email,
        name: body.name,
        phone: body.phone,
        parentName: body.parentName ?? body.parent_name,
        parentPhone: body.parentPhone ?? body.parent_phone,
        cognitoUserId,
        izteachStudentId,
        addCourseIds: action === 'grant' ? resolvedIds : [],
        removeCourseIds: action === 'revoke' ? resolvedIds : [],
        replaceCourseIds: action === 'set' ? resolvedIds : null,
        classCode: body.classCode !== undefined ? body.classCode : undefined,
        codeHint: body.code || '',
        accountStatus: computedAccountStatus,
        syncStatus: computedSyncStatus,
        lastSyncError: computedLastSyncError,
        actorEmail: session.email
      });

      if (!updatedStudent || updatedStudent.ok === false) {
        return jsonResponse({
          ok: false,
          partialFailure: true,
          retryable: true,
          syncStatus: 'partial_failure_supabase',
          completedSteps: ['izteach_account', 'izteach_permissions'],
          failedStep: 'supabase_student_upsert',
          izteachUpdated: true,
          supabaseUpdated: false,
          error: 'SUPABASE_SYNC_FAILED',
          izteachRevoked: izteachRevokeResult || undefined,
          message: 'Đã cập nhật trên izTeach nhưng chưa lưu được vào cơ sở dữ liệu Supabase. Vui lòng bấm đồng bộ lại.'
        }, 502);
      }

      if (assignClassProvisionFailed && !hasValidAccount) {
        await logSyncEvent(env, {
          eventType: 'assign_class_pending_account',
          sourceSystem: 'supabase',
          targetSystem: 'izteach',
          entityType: 'student',
          entityKey: email,
          status: 'pending_activation',
          driftCode: 'A01_SUPABASE_WITHOUT_COGNITO',
          errorCode: 'IZTEACH_ACCOUNT_PENDING',
          errorMessage: provResult?.error || 'Đã xếp lớp trên Supabase nhưng chưa tạo được tài khoản đăng nhập izTeach.',
          details: { email, classCode: body.classCode },
          createdBy: session.email
        });
      }

      return jsonResponse({
        ok: true,
        syncStatus: computedSyncStatus,
        accountStatus: computedAccountStatus,
        classAssignmentSaved: true,
        accountProvisioned: hasValidAccount,
        readyToLogin: hasValidAccount,
        fullySynced: computedSyncStatus === 'synced' && hasValidAccount,
        accountCreated: Boolean(provResult?.accountCreated),
        existingAccount: Boolean(provResult?.existingAccount),
        credentialMode: provResult?.credentialMode || (hasValidAccount ? 'existing_account_unchanged' : 'pending_activation'),
        initialPassword: provResult?.initialPassword || null,
        student: updatedStudent,
        classJoinedNotification: updatedStudent.classJoinedNotification || null,
        pushDispatch: updatedStudent.pushDispatch || null,
        izteachRevoked: izteachRevokeResult || undefined,
        message: computedSyncStatus === 'pending_activation'
          ? `Đã xếp học viên ${email} vào lớp ${body.classCode}, nhưng tài khoản đăng nhập izTeach đang chờ kích hoạt. Bấm "Đồng bộ lại" để cấp tài khoản đăng nhập.`
          : ('Đã cập nhật khóa học & lớp học cho học viên ' + email + ' thành công!')
      });
    }

    if (path === '/api/ktn/classes') {
      if (request.method === 'GET') {
        const session = await extractSessionFromRequest(request, env);
        const [sbRes, tRes, scheduleMap, stuRes, stuLifeMap] = await Promise.all([
          supabaseRequest(env, 'ktn_classes?active=eq.true&order=created_at.asc,id.asc'),
          supabaseRequest(env, 'ktn_teachers?active=eq.true'),
          loadAllClassScheduleConfigs(env),
          supabaseRequest(env, 'ktn_students?select=*&limit=2000').catch(() => ({ ok: false, data: [] })),
          loadAllStudentLifecycleStates(env).catch(() => new Map())
        ]);
        const rawClasses = Array.isArray(sbRes.data) ? sbRes.data : [];
        const rawTeachers = Array.isArray(tRes.data) ? tRes.data : [];
        const teacherMap = new Map();
        for (const t of rawTeachers) {
          if (t?.active === false) continue;
          if (t?.code) {
            teacherMap.set(String(t.code).trim(), t);
            teacherMap.set(String(t.code).trim().toUpperCase(), t);
          }
          if (t?.email) teacherMap.set(normalizeEmail(t.email), t);
        }
        const classStudentCounts = new Map();
        if (stuRes && stuRes.ok && Array.isArray(stuRes.data)) {
          for (const s of stuRes.data) {
            const cls = String(s?.class_code || '').trim().toUpperCase();
            if (!cls) continue;
            const em = normalizeEmail(s?.email || '');
            const lifeStatus = em ? stuLifeMap.get(em)?.status : null;
            const st = String(lifeStatus || s?.account_status || s?.status || 'active').toLowerCase();
            if (st === 'archived' || st === 'deleted' || st === 'dropped' || st === 'suspended' || st === 'locked') {
              continue;
            }
            classStudentCounts.set(cls, (classStudentCounts.get(cls) || 0) + 1);
          }
        }
        const nowMs = Date.now();
        const classes = rawClasses.map(c => {
          const classCode = String(c.id || '').trim().toUpperCase();
          const tEmailNorm = normalizeEmail(c.teacher_email || '');
          const tCodeNorm = String(c.teacher_code || '').trim();
          const matchedT = tEmailNorm
            ? teacherMap.get(tEmailNorm)
            : (tCodeNorm ? (teacherMap.get(tCodeNorm) || teacherMap.get(tCodeNorm.toUpperCase())) : null);
          const resolvedTeacherName = matchedT?.name
            ? String(matchedT.name).trim()
            : 'Chưa phân công giáo viên';
          const cfg = scheduleMap.get(classCode) || null;
          const isConfirmed = Boolean(cfg && cfg.status === 'confirmed');
          const rawLegacyText = String(c.schedule || '').trim();
          const officialScheduleText = isConfirmed
            ? formatOfficialScheduleDisplay(cfg)
            : 'Chưa có lịch học chính thức';
          const scheduleStatus = isConfirmed
            ? 'confirmed'
            : cfg?.status === 'paused'
              ? 'paused'
              : rawLegacyText && rawLegacyText !== 'Chưa có lịch học chính thức'
                ? 'legacy_unconfirmed'
                : 'unconfirmed';
          const upcomingSessions = isConfirmed ? computeUpcomingClassSessions(cfg, nowMs, 6) : [];
          const suggestedFromLegacyText =
            !isConfirmed && rawLegacyText && rawLegacyText !== 'Chưa có lịch học chính thức'
              ? parseLegacyScheduleSuggestion(rawLegacyText)
              : null;
          const activeStudentCount = classStudentCounts.has(classCode)
            ? classStudentCounts.get(classCode)
            : (typeof c.studentCount === 'number'
                ? c.studentCount
                : (typeof c.student_count === 'number' ? c.student_count : 0));

          const copy = {
            ...c,
            roomId: `class:${classCode}`,
            studentCount: activeStudentCount,
            student_count: activeStudentCount,
            teacher_name: resolvedTeacherName,
            teacher_email: matchedT?.email ? normalizeEmail(matchedT.email) : (tEmailNorm || ''),
            teacher_code: matchedT?.code ? String(matchedT.code).trim() : (tCodeNorm || ''),
            schedule: isConfirmed
              ? officialScheduleText
              : rawLegacyText || 'Chưa có lịch học chính thức',
            officialScheduleText,
            legacyScheduleText: !isConfirmed ? rawLegacyText : '',
            scheduleStatus,
            scheduleConfig: cfg,
            upcomingSessions,
            nextSession: upcomingSessions.find(s => !s.isCancelled) || null,
            suggestedFromLegacyText
          };
          if (!session) delete copy.teacher_email;
          return copy;
        });
        return jsonResponse({ ok: true, classes });
      }
      if (request.method === 'POST') {
        const session = await extractSessionFromRequest(request, env);
        if (!session || (session.role !== 'admin' && session.role !== 'teacher')) {
          return jsonResponse({ ok: false, message: 'Chỉ Quản lý hoặc Giáo viên mới được tạo/cập nhật lớp học.' }, 403);
        }
        const body = await request.json().catch(() => ({}));
        const classId = String(body.id || body.classCode || '').trim().toUpperCase();
        if (!classId) return jsonResponse({ ok: false, message: 'Vui lòng nhập mã lớp (VD: YCT2-04).' }, 400);

        return runWithHomeworkConcurrencyLock(`CLASS_MUTATE_${classId}`, async () => {
          const clientRequestId = String(
            body.clientRequestId || body.idempotencyKey || request.headers.get('Idempotency-Key') || ''
          ).trim();
          const isCreateIntent =
            String(body.mode || body.action || '').toLowerCase() === 'create' ||
            body.isNew === true ||
            body.allowOverwrite === false;

          const existingCls = await supabaseRequest(env, `ktn_classes?id=eq.${encodeURIComponent(classId)}&select=*&limit=1`);
          const existingRow = (existingCls.ok && Array.isArray(existingCls.data) && existingCls.data[0]) ? existingCls.data[0] : null;
          const wasActiveClass = Boolean(existingRow && existingRow.active !== false);

          // Kiểm tra mã lớp trùng khi Tạo mới (hỗ trợ idempotent retry nếu trùng clientRequestId)
          if (isCreateIntent && wasActiveClass) {
            if (clientRequestId) {
              const reqDedupCheck = await supabaseRequest(
                env,
                `ktn_dlp_alerts?room_id=eq.CLASS_CREATE_IDEMPOTENCY&id=eq.${encodeURIComponent(`CLS_CREATE_REQ_${classId}`)}&limit=1`
              ).catch(() => ({ ok: false, data: [] }));
              if (reqDedupCheck.ok && Array.isArray(reqDedupCheck.data) && reqDedupCheck.data[0]) {
                try {
                  const prevReq = JSON.parse(reqDedupCheck.data[0].blocked_content || '{}');
                  if (prevReq.clientRequestId && prevReq.clientRequestId === clientRequestId && prevReq.responsePayload) {
                    return jsonResponse({
                      ...prevReq.responsePayload,
                      idempotent: true,
                      idempotentReplay: true
                    });
                  }
                } catch {}
              }
            }
            return jsonResponse({
              ok: false,
              error: 'CLASS_CODE_ALREADY_EXISTS',
              classCode: classId,
              message: `Mã lớp ${classId} đã tồn tại và đang hoạt động. Vui lòng chọn mã lớp khác hoặc dùng chức năng Chỉnh sửa lớp.`
            }, 409);
          }

          if (session.role === 'teacher') {
            const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
            if (!existingRow || existingRow.active === false || !assignedClasses.includes(classId)) {
              return jsonResponse({
                ok: false,
                error: !existingRow ? 'TEACHER_CREATE_CLASS_FORBIDDEN' : 'TEACHER_CLASS_SCOPE_FORBIDDEN',
                message: !existingRow
                  ? 'Chỉ Quản lý (Admin) mới được phép mở thêm lớp học mới.'
                  : ('Cô không phụ trách lớp ' + classId + ' nên không có quyền chỉnh sửa.')
              }, 403);
            }
            if (body.teacherEmail && normalizeEmail(body.teacherEmail) !== normalizeEmail(existingRow.teacher_email || session.email)) {
              return jsonResponse({
                ok: false,
                error: 'TEACHER_CHANGE_OWNER_FORBIDDEN',
                message: 'Giáo viên không được tự ý chuyển quyền chủ nhiệm lớp cho tài khoản khác.'
              }, 403);
            }
          }

          const rawIncomingEmail = body.teacherEmail !== undefined ? body.teacherEmail : body.teacher_email;
          const rawIncomingCode = body.teacherCode !== undefined ? body.teacherCode : body.teacher_code;
          const incomingTeacherEmail = normalizeEmail(rawIncomingEmail || '');
          const incomingTeacherCode = String(rawIncomingCode || '').trim();

          let resolvedTeacherRow = null;
          if (incomingTeacherEmail) {
            const tLookup = await supabaseRequest(env, `ktn_teachers?email=eq.${encodeURIComponent(incomingTeacherEmail)}&limit=1`);
            if (tLookup.ok && Array.isArray(tLookup.data) && tLookup.data[0]) {
              resolvedTeacherRow = tLookup.data[0];
            }
          } else if (incomingTeacherCode) {
            const tLookup = await supabaseRequest(env, `ktn_teachers?code=eq.${encodeURIComponent(incomingTeacherCode)}&limit=1`);
            if (tLookup.ok && Array.isArray(tLookup.data) && tLookup.data[0]) {
              resolvedTeacherRow = tLookup.data[0];
            }
          }

          let tEmail = null;
          let tCode = null;
          let hasValidActiveTeacher = false;

          if (session.role === 'teacher') {
            tEmail = normalizeEmail(existingRow?.teacher_email || session.email);
            tCode = String(existingRow?.teacher_code || session.code || resolvedTeacherRow?.code || '').trim() || null;
            hasValidActiveTeacher = Boolean(tEmail);
          } else if (rawIncomingEmail !== undefined || rawIncomingCode !== undefined) {
            // Admin truyền rõ thông tin giáo viên (hoặc truyền rỗng để bỏ trống/kiểm tra giáo viên không hợp lệ)
            if (resolvedTeacherRow && resolvedTeacherRow.active !== false) {
              tEmail = normalizeEmail(resolvedTeacherRow.email);
              tCode = String(resolvedTeacherRow.code || incomingTeacherCode || '').trim() || null;
              hasValidActiveTeacher = true;
            } else if (incomingTeacherEmail && body.teacherName) {
              tEmail = incomingTeacherEmail;
              tCode = incomingTeacherCode || ('GV-KTN-' + Date.now().toString().slice(-4));
              hasValidActiveTeacher = true;
            } else {
              // Không có giáo viên hợp lệ hoặc giáo viên không tồn tại/đang bị khóa -> không tự gán cho người không xác định (N04)
              tEmail = null;
              tCode = null;
              hasValidActiveTeacher = false;
            }
          } else if (wasActiveClass && existingRow?.teacher_email) {
            tEmail = normalizeEmail(existingRow.teacher_email);
            const prevTeaLookup = await supabaseRequest(env, `ktn_teachers?email=eq.${encodeURIComponent(tEmail)}&limit=1`);
            const prevTeaRow = prevTeaLookup.ok && Array.isArray(prevTeaLookup.data) && prevTeaLookup.data[0] ? prevTeaLookup.data[0] : null;
            hasValidActiveTeacher = Boolean(prevTeaRow && prevTeaRow.active !== false);
            tCode = hasValidActiveTeacher ? (String(prevTeaRow?.code || existingRow.teacher_code || '').trim() || null) : null;
            if (!hasValidActiveTeacher) tEmail = null;
          }

          // Tuyệt đối KHÔNG tự điền '19:30 Thứ 3 & Thứ 6' làm lịch mặc định khi tạo lớp mới
          const explicitScheduleText = body.schedule !== undefined
            ? String(body.schedule || '').trim()
            : (wasActiveClass ? String(existingRow?.schedule || '').trim() : '');
          const nowIso = new Date().toISOString();
          const row = {
            id: classId,
            name: body.name || (wasActiveClass ? existingRow?.name : null) || ('Lớp ' + classId),
            ...(body.level || existingRow?.level ? { level: String(body.level || existingRow?.level).trim() } : {}),
            teacher_code: tCode,
            teacher_email: tEmail,
            schedule: explicitScheduleText,
            total_lessons: Number(body.totalLessons || body.total_lessons || existingRow?.total_lessons) || 25,
            current_lesson: Number(body.currentLesson || body.current_lesson || existingRow?.current_lesson) || 1,
            active: true,
            updated_at: nowIso
          };
          let sbRes = await supabaseRequest(env, 'ktn_classes', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates,return=representation',
            body: row
          });
          if ((!sbRes || !sbRes.ok) && sbRes?.status === 400 && row.level !== undefined) {
            const { level: _omitLevel, ...rowWithoutLevel } = row;
            sbRes = await supabaseRequest(env, 'ktn_classes', {
              method: 'POST',
              prefer: 'resolution=merge-duplicates,return=representation',
              body: rowWithoutLevel
            });
          }
          // Giải quyết BUG BE-07: Kiểm tra kết quả ghi vào Supabase ktn_classes
          if (!sbRes || !sbRes.ok || !Array.isArray(sbRes.data) || sbRes.data.length === 0) {
            return jsonResponse({
              ok: false,
              retryable: true,
              error: 'SUPABASE_CLASS_UPSERT_FAILED',
              message: 'Không thể lưu thông tin lớp học vào cơ sở dữ liệu Supabase. Vui lòng thử lại.'
            }, 502);
          }

          // Nếu gửi kèm cấu hình lịch có cấu trúc (scheduleConfig hoặc daysOfWeek + startTime), lưu luôn cấu hình lịch chính thức
          let savedScheduleResult = null;
          if (
            (body.scheduleConfig && typeof body.scheduleConfig === 'object') ||
            (Array.isArray(body.daysOfWeek) && body.daysOfWeek.length > 0 && body.startTime)
          ) {
            savedScheduleResult = await saveClassScheduleConfig(
              env,
              session,
              classId,
              body.scheduleConfig || body
            );
          }

          // Đồng bộ danh sách lớp phụ trách vào bảng ktn_teachers (gỡ cả assigned_classes lẫn aliases __class:<CODE> khỏi giáo viên cũ nếu đổi chủ nhiệm)
          const prevTeacherEmail = wasActiveClass ? normalizeEmail(existingRow?.teacher_email || '') : '';
          let prevTeacherRow = null;
          if (prevTeacherEmail && prevTeacherEmail !== tEmail) {
            const prevLookup = await supabaseRequest(env, `ktn_teachers?email=eq.${encodeURIComponent(prevTeacherEmail)}&limit=1`);
            prevTeacherRow = (prevLookup.ok && Array.isArray(prevLookup.data) && prevLookup.data[0]) || null;
            if (prevTeacherRow) {
              const prevMeta = extractTeacherMetaFromRow(prevTeacherRow);
              const filteredPrev = prevMeta.assignedClasses.filter(c => c && c !== classId);
              const nextPrevAliases = Array.isArray(prevTeacherRow.aliases)
                ? prevTeacherRow.aliases.filter(
                    a => typeof a === 'string' && a.trim().toUpperCase() !== `__CLASS:${classId}`
                  )
                : [];
              let patchPrev = await supabaseRequest(env, `ktn_teachers?code=eq.${encodeURIComponent(prevTeacherRow.code)}`, {
                method: 'PATCH',
                body: {
                  assigned_classes: filteredPrev,
                  aliases: nextPrevAliases,
                  updated_at: nowIso
                }
              });
              if ((!patchPrev || !patchPrev.ok) && patchPrev?.status === 400) {
                patchPrev = await supabaseRequest(env, `ktn_teachers?code=eq.${encodeURIComponent(prevTeacherRow.code)}`, {
                  method: 'PATCH',
                  body: { aliases: nextPrevAliases }
                });
              }
              if ((!patchPrev || !patchPrev.ok) && patchPrev?.status === 400) {
                await supabaseRequest(env, `ktn_teachers?code=eq.${encodeURIComponent(prevTeacherRow.code)}`, {
                  method: 'PATCH',
                  body: { assigned_classes: filteredPrev }
                });
              }
            }
          }

          let activeTeacherRow = resolvedTeacherRow;
          if (tEmail && hasValidActiveTeacher) {
            if (!activeTeacherRow || normalizeEmail(activeTeacherRow.email) !== tEmail) {
              const tLookup = await supabaseRequest(env, `ktn_teachers?email=eq.${encodeURIComponent(tEmail)}&limit=1`);
              activeTeacherRow = (tLookup.ok && Array.isArray(tLookup.data) && tLookup.data[0]) || null;
            }
            if (activeTeacherRow && activeTeacherRow.active !== false) {
              const curMeta = extractTeacherMetaFromRow(activeTeacherRow);
              const nextAssigned = Array.from(new Set([...curMeta.assignedClasses, classId]));
              const rawAliases = Array.isArray(activeTeacherRow.aliases) ? activeTeacherRow.aliases : [];
              const hasClassAlias = rawAliases.some(
                a => typeof a === 'string' && a.trim().toUpperCase() === `__CLASS:${classId}`
              );
              const nextAliases = hasClassAlias ? rawAliases : [...rawAliases, `__class:${classId}`];
              let patchTea = await supabaseRequest(env, `ktn_teachers?code=eq.${encodeURIComponent(activeTeacherRow.code)}`, {
                method: 'PATCH',
                body: { assigned_classes: nextAssigned, aliases: nextAliases, updated_at: nowIso }
              });
              if ((!patchTea || !patchTea.ok) && patchTea?.status === 400) {
                patchTea = await supabaseRequest(env, `ktn_teachers?code=eq.${encodeURIComponent(activeTeacherRow.code)}`, {
                  method: 'PATCH',
                  body: { aliases: nextAliases }
                });
              }
              if ((!patchTea || !patchTea.ok) && patchTea?.status === 400) {
                await supabaseRequest(env, `ktn_teachers?code=eq.${encodeURIComponent(activeTeacherRow.code)}`, {
                  method: 'PATCH',
                  body: { assigned_classes: nextAssigned }
                });
              }
            } else if (body.teacherName) {
              const insTea = await supabaseRequest(env, 'ktn_teachers', {
                method: 'POST',
                prefer: 'resolution=merge-duplicates',
                body: {
                  code: tCode,
                  name: String(body.teacherName).trim(),
                  email: tEmail,
                  phone: String(body.teacherPhone || ''),
                  assigned_classes: [classId],
                  aliases: [`__class:${classId}`],
                  active: true
                }
              });
              if ((!insTea || !insTea.ok) && insTea?.status === 400) {
                await supabaseRequest(env, 'ktn_teachers', {
                  method: 'POST',
                  prefer: 'resolution=merge-duplicates',
                  body: {
                    code: tCode,
                    name: String(body.teacherName).trim(),
                    email: tEmail,
                    phone: String(body.teacherPhone || ''),
                    aliases: [`__class:${classId}`],
                    active: true
                  }
                });
              }
            }
          }

          // Phát sự kiện thông báo theo đúng nghiệp vụ (B1: class_created, B3: class_teacher_changed, B4: chống trùng DB)
          let notificationDispatch = null;
          const isNewlyCreated = !wasActiveClass;
          const deepLinkTeacherClasses = `/custom-page/so-lien-lac-test#/teacher/classes?class=${encodeURIComponent(classId)}&roomId=${encodeURIComponent('class:' + classId)}`;

          if (isNewlyCreated && hasValidActiveTeacher && tEmail) {
            const createEventId = `CLASS_CREATED_${classId}_${fnv1aHash36(tEmail)}`;
            const confirmedInitSchedText =
              savedScheduleResult?.ok &&
              savedScheduleResult.scheduleConfig?.status === 'confirmed' &&
              savedScheduleResult.officialScheduleText
                ? String(savedScheduleResult.officialScheduleText).trim()
                : '';
            if (confirmedInitSchedText) {
              const initSchedFingerprint = `schedule_changed|CFG_${confirmedInitSchedText}`;
              const initSchedEventId = `SCHED-EVT-${classId}-${fnv1aHex(initSchedFingerprint)}`;
              const initSchedDedupId = `PUSH_EVT_${initSchedEventId}`;
              if (!globalThis.__ktnPushEventIdCache) {
                globalThis.__ktnPushEventIdCache = new Map();
              }
              globalThis.__ktnPushEventIdCache.set(initSchedDedupId, Date.now());
              await supabaseRequest(env, 'ktn_dlp_alerts?on_conflict=id', {
                method: 'POST',
                prefer: 'resolution=merge-duplicates,return=minimal',
                body: {
                  id: initSchedDedupId,
                  room_id: 'PUSH_EVENT_DEDUP',
                  sender_email: session.email,
                  sender_name: classId,
                  blocked_content: JSON.stringify({
                    eventId: initSchedEventId,
                    type: 'schedule_changed',
                    recordedAt: new Date().toISOString()
                  }),
                  reason: 'schedule_changed',
                  created_at: new Date().toISOString()
                }
              }).catch(() => null);
            }
            const createBodyText = confirmedInitSchedText
              ? `Bạn vừa được phân công phụ trách lớp ${classId} (${confirmedInitSchedText}). Mở lớp để xem lịch học và nhóm trao đổi.`
              : `Bạn vừa được phân công phụ trách lớp ${classId}. Mở lớp để xem lịch học và nhóm trao đổi.`;
            notificationDispatch = await emitTargetedLifecycleNotification(env, {
              eventId: createEventId,
              type: 'class_created',
              recipientEmail: tEmail,
              senderEmail: session.email,
              classCode: classId,
              roomId: `class:${classId}`,
              title: 'Bạn được phân công lớp mới',
              body: createBodyText,
              actionUrl: deepLinkTeacherClasses,
              actionLabel: 'Mở lớp & Nhóm trao đổi',
              allowSelfPush: true,
              meta: {
                classCode: classId,
                roomId: `class:${classId}`,
                teacherEmail: tEmail,
                teacherCode: tCode,
                ...(confirmedInitSchedText ? { schedule: confirmedInitSchedText } : {})
              }
            });
          } else if (!isNewlyCreated && prevTeacherEmail !== (tEmail || '')) {
            const priorAssignRes = await supabaseRequest(
              env,
              `ktn_dlp_alerts?room_id=eq.KTN_LIFECYCLE_NOTIFICATION&sender_name=eq.${encodeURIComponent(classId)}&reason=eq.class_teacher_changed&select=id`
            ).catch(() => ({ ok: false, data: [] }));
            const priorAssignCount =
              priorAssignRes.ok && Array.isArray(priorAssignRes.data) ? priorAssignRes.data.length : 0;
            const cycleSuffix = priorAssignCount > 0 ? `_T${priorAssignCount + 1}` : '';
            const changeEvents = [];
            if (hasValidActiveTeacher && tEmail) {
              const assignEventId = `CLASS_TEACHER_ASSIGNED_${classId}_${fnv1aHash36(tEmail)}_FROM_${fnv1aHash36(prevTeacherEmail || 'NONE')}${cycleSuffix}`;
              const assignedNotif = await emitTargetedLifecycleNotification(env, {
                eventId: assignEventId,
                type: 'class_teacher_changed',
                recipientEmail: tEmail,
                senderEmail: session.email,
                classCode: classId,
                roomId: `class:${classId}`,
                title: `Phân công phụ trách lớp ${classId}`,
                body: `Bạn vừa được phân công phụ trách lớp ${classId}. Mở lớp để xem lịch học và nhóm trao đổi.`,
                actionUrl: deepLinkTeacherClasses,
                actionLabel: 'Mở lớp học',
                allowSelfPush: true,
                meta: {
                  classCode: classId,
                  roomId: `class:${classId}`,
                  roleInEvent: 'new_teacher',
                  previousTeacherEmail: prevTeacherEmail || null,
                  newTeacherEmail: tEmail
                }
              });
              changeEvents.push(assignedNotif);
            }
            if (prevTeacherEmail && (!prevTeacherRow || prevTeacherRow.active !== false)) {
              const unassignEventId = `CLASS_TEACHER_UNASSIGNED_${classId}_${fnv1aHash36(prevTeacherEmail)}_TO_${fnv1aHash36(tEmail || 'NONE')}${cycleSuffix}`;
              const unassignedNotif = await emitTargetedLifecycleNotification(env, {
                eventId: unassignEventId,
                type: 'class_teacher_changed',
                recipientEmail: prevTeacherEmail,
                senderEmail: session.email,
                classCode: classId,
                roomId: `class:${classId}`,
                title: `Thay đổi phân công lớp ${classId}`,
                body: `Lớp ${classId} đã được chuyển phân công sang giáo viên khác.`,
                actionUrl: '/custom-page/so-lien-lac-test#/teacher/classes',
                actionLabel: 'Xem danh sách lớp',
                allowSelfPush: true,
                meta: {
                  classCode: classId,
                  roomId: `class:${classId}`,
                  roleInEvent: 'previous_teacher',
                  previousTeacherEmail: prevTeacherEmail,
                  newTeacherEmail: tEmail || null
                }
              });
              changeEvents.push(unassignedNotif);
            }
            notificationDispatch = changeEvents[0] || null;
          }

          const resolvedTeacherName =
            hasValidActiveTeacher && (activeTeacherRow?.name || body.teacherName)
              ? String(activeTeacherRow?.name || body.teacherName).trim()
              : 'Chưa phân công giáo viên';
          const canonicalRoomId = `class:${classId}`;
          let activeStuCountForClass = 0;
          if (!isNewlyCreated) {
            const [stuCountRes, stuLifeMap] = await Promise.all([
              supabaseRequest(env, `ktn_students?class_code=eq.${encodeURIComponent(classId)}&select=*`),
              loadAllStudentLifecycleStates(env).catch(() => new Map())
            ]);
            if (stuCountRes.ok && Array.isArray(stuCountRes.data)) {
              for (const s of stuCountRes.data) {
                const em = normalizeEmail(s?.email || '');
                const lifeStatus = em ? stuLifeMap.get(em)?.status : null;
                const st = String(lifeStatus || s?.account_status || s?.status || 'active').toLowerCase();
                if (st === 'archived' || st === 'deleted' || st === 'dropped' || st === 'suspended' || st === 'locked') continue;
                activeStuCountForClass += 1;
              }
            }
          }
          const finalClassItem = {
            ...sbRes.data[0],
            roomId: canonicalRoomId,
            teacher_name: resolvedTeacherName,
            studentCount: activeStuCountForClass,
            student_count: activeStuCountForClass,
            ...(savedScheduleResult?.ok
              ? {
                  schedule: savedScheduleResult.officialScheduleText,
                  officialScheduleText: savedScheduleResult.officialScheduleText,
                  scheduleStatus: savedScheduleResult.scheduleConfig.status,
                  scheduleConfig: savedScheduleResult.scheduleConfig,
                  upcomingSessions: savedScheduleResult.upcomingSessions
                }
              : {})
          };

          const responsePayload = {
            ok: true,
            created: isNewlyCreated,
            classCode: classId,
            roomId: canonicalRoomId,
            chatRoom: {
              roomId: canonicalRoomId,
              roomType: 'class',
              classCode: classId,
              title: `Nhóm Lớp ${classId}`,
              subtitle: `${finalClassItem.name || `Lớp ${classId}`} • ${resolvedTeacherName}`,
              teacherEmail: tEmail || '',
              teacherName: resolvedTeacherName
            },
            classItem: finalClassItem,
            notificationDispatch,
            pushDispatch: notificationDispatch?.pushResult || null
          };

          if (isNewlyCreated && clientRequestId) {
            await supabaseRequest(env, 'ktn_dlp_alerts', {
              method: 'POST',
              prefer: 'resolution=merge-duplicates,return=minimal',
              body: {
                id: `CLS_CREATE_REQ_${classId}`,
                room_id: 'CLASS_CREATE_IDEMPOTENCY',
                sender_email: session.email,
                sender_name: classId,
                blocked_content: JSON.stringify({
                  clientRequestId,
                  classId,
                  responsePayload,
                  createdAt: nowIso
                }),
                created_at: nowIso
              }
            }).catch(() => null);
          }

          return jsonResponse(responsePayload);
        });
      }
      if (request.method === 'DELETE') {
        const session = await extractSessionFromRequest(request, env);
        if (!session || session.role !== 'admin') {
          return jsonResponse({ ok: false, message: 'Chỉ Quản lý (Admin) mới được xóa lớp học.' }, 403);
        }
        const body = await request.json().catch(() => ({}));
        const classId = String(url.searchParams.get('id') || url.searchParams.get('classCode') || body.id || body.classCode || '').trim().toUpperCase();
        if (!classId) return jsonResponse({ ok: false, message: 'Thiếu mã lớp cần xóa.' }, 400);

        return runWithHomeworkConcurrencyLock(`CLASS_MUTATE_${classId}`, async () => {
          const clsLookup = await supabaseRequest(env, `ktn_classes?id=eq.${encodeURIComponent(classId)}&select=*&limit=1`);
          const clsRow = clsLookup.ok && Array.isArray(clsLookup.data) && clsLookup.data[0] ? clsLookup.data[0] : null;
          if (!clsRow) {
            return jsonResponse({
              ok: false,
              error: 'CLASS_NOT_FOUND',
              classCode: classId,
              message: `Không tìm thấy lớp ${classId} trong hệ thống.`
            }, 404);
          }

          // Kiểm tra lớp còn học viên đang hoạt động hay không (A3 / N27)
          const [stuRes, lifeMap] = await Promise.all([
            supabaseRequest(env, `ktn_students?class_code=eq.${encodeURIComponent(classId)}&select=*`),
            loadAllStudentLifecycleStates(env).catch(() => new Map())
          ]);
          if (!stuRes || !stuRes.ok) {
            return jsonResponse({
              ok: false,
              retryable: true,
              error: 'SUPABASE_STUDENT_CHECK_FAILED',
              message: 'Không thể kiểm tra danh sách học viên của lớp trước khi xóa. Vui lòng thử lại.'
            }, 502);
          }
          const activeStudents = (Array.isArray(stuRes.data) ? stuRes.data : []).filter((s) => {
            const em = normalizeEmail(s?.email || '');
            const lifeStatus = em ? lifeMap.get(em)?.status : null;
            const st = String(lifeStatus || s?.account_status || s?.status || 'active').toLowerCase();
            return st !== 'deleted' && st !== 'archived' && st !== 'suspended' && st !== 'dropped' && st !== 'locked';
          });

          if (activeStudents.length > 0) {
            return jsonResponse({
              ok: false,
              error: 'CLASS_HAS_ACTIVE_STUDENTS',
              classCode: classId,
              studentCount: activeStudents.length,
              activeStudentCount: activeStudents.length,
              students: activeStudents.slice(0, 20).map((s) => ({
                code: s.code || '',
                email: normalizeEmail(s.email || ''),
                name: s.name || s.email || ''
              })),
              message: `Lớp ${classId} hiện còn ${activeStudents.length} học viên đang theo học. Vui lòng chuyển học viên sang lớp khác trước khi xóa/lưu trữ lớp.`
            }, 409);
          }

          const nowIso = new Date().toISOString();
          const delClsRes = await supabaseRequest(env, `ktn_classes?id=eq.${encodeURIComponent(classId)}`, {
            method: 'PATCH',
            prefer: 'return=representation',
            body: {
              active: false,
              teacher_email: null,
              teacher_code: null,
              updated_at: nowIso
            }
          });
          if (!delClsRes || !delClsRes.ok) {
            return jsonResponse({
              ok: false,
              retryable: true,
              error: 'SUPABASE_CLASS_DELETE_FAILED',
              message: 'Không thể cập nhật trạng thái lưu trữ lớp học trên cơ sở dữ liệu Supabase.'
            }, 502);
          }

          // Tạm dừng cấu hình lịch học (SCHED_CFG_<classId>) để chặn hoàn toàn nhắc lịch về sau (N30)
          const schedAlertId = `SCHED_CFG_${classId}`;
          const schedLookup = await supabaseRequest(
            env,
            `ktn_dlp_alerts?room_id=eq.CLASS_SCHEDULE_CONFIG&id=eq.${encodeURIComponent(schedAlertId)}&limit=1`
          ).catch(() => ({ ok: false, data: [] }));
          if (schedLookup.ok && Array.isArray(schedLookup.data) && schedLookup.data[0]) {
            try {
              const prevSched = JSON.parse(schedLookup.data[0].blocked_content || '{}');
              await supabaseRequest(env, `ktn_dlp_alerts?id=eq.${encodeURIComponent(schedAlertId)}`, {
                method: 'PATCH',
                prefer: 'return=minimal',
                body: {
                  blocked_content: JSON.stringify({
                    ...prevSched,
                    status: 'paused',
                    archivedAt: nowIso
                  })
                }
              });
            } catch {}
          }

          // Gỡ phân công lớp khỏi toàn bộ giáo viên còn giữ mã lớp này trong assigned_classes hoặc aliases
          const allTeachersRes = await supabaseRequest(env, 'ktn_teachers?select=*').catch(() => ({ ok: false, data: [] }));
          if (allTeachersRes.ok && Array.isArray(allTeachersRes.data)) {
            for (const tRow of allTeachersRes.data) {
              const meta = extractTeacherMetaFromRow(tRow);
              const rawAliases = Array.isArray(tRow.aliases) ? tRow.aliases : [];
              const hasInAssigned = meta.assignedClasses.includes(classId);
              const hasInAliases = rawAliases.some(
                (a) => typeof a === 'string' && a.trim().toUpperCase() === `__CLASS:${classId}`
              );
              if (hasInAssigned || hasInAliases) {
                const nextAssigned = meta.assignedClasses.filter((c) => c && c !== classId);
                const nextAliases = rawAliases.filter(
                  (a) => !(typeof a === 'string' && a.trim().toUpperCase() === `__CLASS:${classId}`)
                );
                let patchT = await supabaseRequest(env, `ktn_teachers?code=eq.${encodeURIComponent(tRow.code)}`, {
                  method: 'PATCH',
                  body: {
                    assigned_classes: nextAssigned,
                    aliases: nextAliases,
                    updated_at: nowIso
                  }
                });
                if ((!patchT || !patchT.ok) && patchT?.status === 400) {
                  patchT = await supabaseRequest(env, `ktn_teachers?code=eq.${encodeURIComponent(tRow.code)}`, {
                    method: 'PATCH',
                    body: { aliases: nextAliases }
                  });
                }
                if ((!patchT || !patchT.ok) && patchT?.status === 400) {
                  await supabaseRequest(env, `ktn_teachers?code=eq.${encodeURIComponent(tRow.code)}`, {
                    method: 'PATCH',
                    body: { assigned_classes: nextAssigned }
                  });
                }
              }
            }
          }

          // Gỡ class_code còn sót trên push subscriptions và các học viên đã nghỉ/lưu trữ (nếu có) nhưng giữ nguyên lịch sử tin nhắn, bài tập, điểm danh (N33)
          await Promise.all([
            supabaseRequest(env, `ktn_push_subscriptions?class_code=eq.${encodeURIComponent(classId)}`, {
              method: 'PATCH',
              prefer: 'return=minimal',
              body: { class_code: null, updated_at: nowIso }
            }).catch(() => null),
            supabaseRequest(env, `ktn_students?class_code=eq.${encodeURIComponent(classId)}`, {
              method: 'PATCH',
              prefer: 'return=minimal',
              body: { class_code: null, has_live_class: false, updated_at: nowIso }
            }).catch(() => null),
            supabaseRequest(
              env,
              `ktn_dlp_alerts?room_id=eq.CLASS_CREATE_IDEMPOTENCY&id=eq.${encodeURIComponent(`CLS_CREATE_REQ_${classId}`)}`,
              { method: 'DELETE' }
            ).catch(() => null),
            supabaseRequest(
              env,
              `ktn_dlp_alerts?room_id=eq.KTN_LIFECYCLE_NOTIFICATION&sender_name=eq.${encodeURIComponent(classId)}&reason=eq.class_created`,
              { method: 'DELETE' }
            ).catch(() => null),
            supabaseRequest(
              env,
              `ktn_dlp_alerts?room_id=eq.PUSH_EVENT_DEDUP&id=like.${encodeURIComponent(`PUSH_EVT_CLASS_CREATED_${classId}_*`)}`,
              { method: 'DELETE' }
            ).catch(() => null)
          ]);

          return jsonResponse({
            ok: true,
            softDeleted: true,
            archived: true,
            deletedClassId: classId,
            classCode: classId,
            roomId: `class:${classId}`,
            historyPreserved: true,
            message: `Đã lưu trữ và đóng lớp ${classId} an toàn. Lịch sử tin nhắn, bài tập và điểm danh được bảo toàn.`
          });
        });
      }
    }

    if (path === '/api/ktn/classes/schedule') {
      if (request.method === 'GET') {
        const session = await extractSessionFromRequest(request, env);
        if (!session) {
          return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
        }
        const classCode = String(url.searchParams.get('classCode') || url.searchParams.get('id') || '').trim().toUpperCase();
        const scheduleMap = await loadAllClassScheduleConfigs(env);
        if (classCode) {
          const clsRes = await supabaseRequest(env, `ktn_classes?id=eq.${encodeURIComponent(classCode)}&limit=1`);
          const clsRow = (clsRes.ok && Array.isArray(clsRes.data) && clsRes.data[0]) || null;
          const cfg = scheduleMap.get(classCode) || null;
          const isConfirmed = Boolean(cfg && cfg.status === 'confirmed');
          const rawLegacyText = String(clsRow?.schedule || '').trim();
          const officialScheduleText = isConfirmed
            ? formatOfficialScheduleDisplay(cfg)
            : 'Chưa có lịch học chính thức';
          const scheduleStatus = isConfirmed
            ? 'confirmed'
            : cfg?.status === 'paused'
              ? 'paused'
              : rawLegacyText && rawLegacyText !== 'Chưa có lịch học chính thức'
                ? 'legacy_unconfirmed'
                : 'unconfirmed';
          const upcomingSessions = isConfirmed ? computeUpcomingClassSessions(cfg, Date.now(), 8) : [];
          return jsonResponse({
            ok: true,
            classCode,
            scheduleStatus,
            officialScheduleText,
            legacyScheduleText: !isConfirmed ? rawLegacyText : '',
            scheduleConfig: cfg,
            upcomingSessions,
            nextSession: upcomingSessions.find((s) => !s.isCancelled) || null,
            suggestedFromLegacyText:
              !isConfirmed && rawLegacyText ? parseLegacyScheduleSuggestion(rawLegacyText) : null
          });
        }
        const schedules = Array.from(scheduleMap.values()).map((cfg) => ({
          ...cfg,
          officialScheduleText: formatOfficialScheduleDisplay(cfg),
          upcomingSessions: computeUpcomingClassSessions(cfg, Date.now(), 6)
        }));
        return jsonResponse({ ok: true, schedules });
      }

      if (request.method === 'POST' || request.method === 'PUT') {
        const session = await extractSessionFromRequest(request, env);
        if (!session) {
          return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
        }
        if (session.role === 'student') {
          return jsonResponse({
            ok: false,
            error: 'STUDENT_SCHEDULE_EDIT_FORBIDDEN',
            message: 'Học viên chỉ có quyền xem lịch học và nhận nhắc giờ, không được chỉnh sửa lịch.'
          }, 403);
        }
        if (session.role !== 'admin' && session.role !== 'teacher') {
          return jsonResponse({ ok: false, message: 'Không có quyền cài đặt lịch học.' }, 403);
        }

        const body = await request.json().catch(() => ({}));
        const classCode = String(body.classCode || body.id || '').trim().toUpperCase();
        if (!classCode) {
          return jsonResponse({ ok: false, message: 'Vui lòng chọn mã lớp học.' }, 400);
        }

        const clsLookup = await supabaseRequest(env, `ktn_classes?id=eq.${encodeURIComponent(classCode)}&select=*&limit=1`);
        const existingCls = (clsLookup.ok && Array.isArray(clsLookup.data) && clsLookup.data[0]) || null;

        if (existingCls && existingCls.active === false) {
          return jsonResponse({
            ok: false,
            error: 'CLASS_ARCHIVED_OR_INACTIVE',
            classCode,
            message: `Lớp ${classCode} đã được lưu trữ nên không thể chỉnh sửa lịch học.`
          }, 403);
        }

        if (session.role === 'teacher') {
          const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
          if (!existingCls || !assignedClasses.includes(classCode)) {
            return jsonResponse({
              ok: false,
              error: 'TEACHER_CLASS_SCOPE_FORBIDDEN',
              message: !existingCls
                ? 'Giáo viên không có quyền tạo lớp mới.'
                : `Cô không phụ trách lớp ${classCode} nên không có quyền chỉnh lịch học của lớp này.`
            }, 403);
          }
          if (body.teacherEmail && normalizeEmail(body.teacherEmail) !== normalizeEmail(existingCls.teacher_email || session.email)) {
            return jsonResponse({
              ok: false,
              error: 'TEACHER_CHANGE_OWNER_FORBIDDEN',
              message: 'Giáo viên không được tự ý thay đổi giáo viên phụ trách lớp.'
            }, 403);
          }
        } else if (!existingCls && session.role === 'admin') {
          // Admin có thể vừa tạo lớp mới vừa cài lịch
          await supabaseRequest(env, 'ktn_classes', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates',
            body: {
              id: classCode,
              name: body.className || body.name || `Lớp ${classCode}`,
              teacher_code: body.teacherCode ? String(body.teacherCode).trim() : null,
              teacher_email: body.teacherEmail ? normalizeEmail(body.teacherEmail) : null,
              schedule: '',
              total_lessons: Number(body.totalLessons) || 25,
              current_lesson: Number(body.currentLesson) || 1,
              active: true,
              updated_at: new Date().toISOString()
            }
          });
        }

        const saveResult = await saveClassScheduleConfig(env, session, classCode, body);
        if (!saveResult.ok) {
          return jsonResponse({
            ok: false,
            message: saveResult.message || 'Không thể lưu lịch học.'
          }, saveResult.status || 400);
        }

        const cfg = saveResult.scheduleConfig;
        const latestEx = Array.isArray(cfg.exceptions) && cfg.exceptions.length > 0
          ? cfg.exceptions[cfg.exceptions.length - 1]
          : null;
        const isCancelOrPostpone = Boolean(
          latestEx && ['cancelled', 'postponed', 'holiday'].includes(String(latestEx.status || '').toLowerCase())
        );

        let pushDispatch = null;
        if (body.notifyMembers !== false && cfg.status === 'confirmed') {
          const nowIso = new Date().toISOString();
          const eventType = isCancelOrPostpone ? 'session_cancelled' : 'schedule_changed';
          const scheduleSig = isCancelOrPostpone
            ? `EX_${latestEx.date}_${latestEx.status}_${latestEx.makeupDate || ''}_${latestEx.makeupTime || ''}`
            : `CFG_${saveResult.officialScheduleText}`;
          const eventId = String(
            body.eventId ||
              body.clientRequestId ||
              `SCHED-EVT-${classCode}-${fnv1aHex(`${eventType}|${scheduleSig}`)}`
          ).trim();
          const evtTitle = isCancelOrPostpone
            ? `Thông báo hoãn/hủy buổi học Lớp ${classCode}`
            : `Cập nhật lịch học chính thức Lớp ${classCode}`;
          const evtBody = isCancelOrPostpone
            ? `Buổi học ngày ${latestEx.date} tạm nghỉ/hoãn${latestEx.note ? ` (${latestEx.note})` : ''}.`
            : `Lịch học: ${saveResult.officialScheduleText}.`;

          const dedupRowId = `PUSH_EVT_${eventId}`;
          const alreadyAnnouncedInMem = Boolean(
            globalThis.__ktnPushEventIdCache && globalThis.__ktnPushEventIdCache.has(dedupRowId)
          );
          let alreadyAnnouncedInDb = alreadyAnnouncedInMem;
          if (!alreadyAnnouncedInDb) {
            const existingDedup = await supabaseRequest(
              env,
              `ktn_dlp_alerts?room_id=eq.PUSH_EVENT_DEDUP&id=eq.${encodeURIComponent(dedupRowId)}&select=id&limit=1`
            ).catch(() => ({ ok: false, data: [] }));
            alreadyAnnouncedInDb = Boolean(
              existingDedup.ok && Array.isArray(existingDedup.data) && existingDedup.data.length > 0
            );
          }

          if (!alreadyAnnouncedInDb) {
            await supabaseRequest(env, 'ktn_dlp_alerts', {
              method: 'POST',
              prefer: 'resolution=merge-duplicates,return=minimal',
              body: {
                id: eventId,
                room_id: 'CLASS_SCHEDULE_EVENT',
                sender_email: session.email,
                sender_name: session.name || session.email,
                sender_role: session.role,
                blocked_content: JSON.stringify({
                  id: eventId,
                  type: eventType,
                  classCode,
                  title: evtTitle,
                  body: evtBody,
                  actionUrl: `/custom-page/so-lien-lac-test#/classrooms?class=${encodeURIComponent(classCode)}`,
                  updatedBy: session.email,
                  updatedByName: session.name || session.email,
                  createdAt: nowIso
                }),
                reason: eventType.toUpperCase(),
                resolved: true,
                created_at: nowIso
              }
            }).catch(() => null);
          }

          if (body.sendPush !== false) {
            const clsResolved = await resolveClassRecipientEmails(env, classCode, {
              includeTeacher: true,
              excludeEmail: session.email
            });
            if (clsResolved.recipientEmails.length > 0) {
              const pushPromise = dispatchWebPushForQuery(
                env,
                '',
                {
                  id: eventId,
                  eventId,
                  eventType,
                  title: evtTitle,
                  body: evtBody,
                  action_url: `/custom-page/so-lien-lac-test#/classrooms?class=${encodeURIComponent(classCode)}`
                },
                {
                  eventId,
                  eventType,
                  recipientEmails: clsResolved.recipientEmails,
                  senderEmail: session.email,
                  classCode
                }
              );
              if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(pushPromise);
              pushDispatch = await pushPromise;
            }
          }
        }

        return jsonResponse({
          ok: true,
          classCode,
          scheduleStatus: cfg.status,
          officialScheduleText: saveResult.officialScheduleText,
          scheduleConfig: cfg,
          upcomingSessions: saveResult.upcomingSessions,
          nextSession: saveResult.upcomingSessions.find((s) => !s.isCancelled) || null,
          ...(pushDispatch ? { pushDispatch } : {})
        });
      }
    }

    if (path === '/api/ktn/schedule/run-reminders' && request.method === 'POST') {
      const cronSecret = request.headers.get('X-KTN-Cron-Secret') || '';
      const isCronAuthorized = Boolean(
        cronSecret && env.KTN_SESSION_SECRET && cronSecret === env.KTN_SESSION_SECRET
      );
      const session = isCronAuthorized ? { role: 'admin', email: 'cron@khongtunhi.com' } : await extractSessionFromRequest(request, env);
      if (!session || (session.role !== 'admin' && session.role !== 'teacher')) {
        return jsonResponse({ ok: false, message: 'Chỉ Quản lý hoặc Giáo viên mới được phép kích hoạt kiểm tra nhắc lịch học.' }, 403);
      }
      const body = await request.json().catch(() => ({}));
      const targetClassCode = String(body.classCode || '').trim().toUpperCase();
      if (session.role === 'teacher') {
        const assigned = await getTeacherAssignedClassCodes(env, session.email);
        if (!targetClassCode || !assigned.includes(targetClassCode)) {
          return jsonResponse({
            ok: false,
            error: 'TEACHER_CLASS_SCOPE_FORBIDDEN',
            message: 'Giáo viên chỉ được kiểm tra nhắc lịch cho lớp mình phụ trách.'
          }, 403);
        }
      }
      const parsedIso = body.nowIso ? Date.parse(String(body.nowIso)) : NaN;
      const resolvedNowMs = Number.isFinite(Number(body.nowMs))
        ? Number(body.nowMs)
        : Number.isFinite(parsedIso)
          ? parsedIso
          : Date.now();
      const reminderReport = await runClassScheduleReminders(env, {
        classCode: targetClassCode || '',
        nowMs: resolvedNowMs
      });
      return jsonResponse(reminderReport);
    }

    if (path === '/api/ktn/teachers' || path === '/api/ktn/admin/teachers/provision') {
      if (request.method === 'GET') {
        const session = await extractSessionFromRequest(request, env);
        if (!session || (session.role !== 'admin' && session.role !== 'teacher')) {
          return jsonResponse({ ok: false, message: 'Chỉ Quản lý hoặc Giáo viên mới được xem danh sách giáo viên.' }, 403);
        }
        const q = normalizeViSearchText(url.searchParams.get('q') || '');
        const activeOnly = url.searchParams.get('activeOnly') === '1' || session.role !== 'admin';
        const teacherQuery = activeOnly ? 'ktn_teachers?active=eq.true&order=code.asc' : 'ktn_teachers?order=code.asc';
        const currentMonthPrefix = new Date().toISOString().slice(0, 7);

        const [
          sbRes,
          classesRes,
          studentsRes,
          homeworksRes,
          attendanceRes,
          allForumAns,
          allForumEvents,
          allCourseReqs,
          stuLifecycleMap
        ] = await Promise.all([
          supabaseRequest(env, teacherQuery),
          supabaseRequest(env, 'ktn_classes?select=id,name,teacher_code,teacher_email,schedule,active').catch(() => ({ ok: false })),
          supabaseRequest(env, 'ktn_students?select=*&limit=2000').catch(() => ({ ok: false })),
          supabaseRequest(env, 'ktn_homeworks?select=id,class_code,status,score,teacher_feedback,updated_at&limit=1000').catch(() => ({ ok: false })),
          supabaseRequest(env, 'ktn_dlp_alerts?room_id=eq.ATTENDANCE_LOG&limit=500').catch(() => ({ ok: false })),
          loadAllForumAnswers(env).catch(() => []),
          loadAllTeacherContributionEvents(env).catch(() => []),
          loadAllCourseGrantRequests(env).catch(() => []),
          loadAllStudentLifecycleStates(env).catch(() => new Map())
        ]);

        if (!sbRes || !sbRes.ok) {
          return jsonResponse({
            ok: false,
            retryable: true,
            message: 'Không thể tải danh sách giáo viên từ cơ sở dữ liệu Supabase.'
          }, sbRes?.status || 503);
        }

        const classRows = (classesRes && classesRes.ok && Array.isArray(classesRes.data)) ? classesRes.data : [];
        const studentRows = ((studentsRes && studentsRes.ok && Array.isArray(studentsRes.data)) ? studentsRes.data : []).filter(s => {
          const em = normalizeEmail(s?.email || '');
          const life = em ? stuLifecycleMap.get(em)?.status : null;
          const st = String(life || s?.account_status || 'active').toLowerCase();
          return st !== 'deleted' && st !== 'archived';
        });
        const homeworkRows = (homeworksRes && homeworksRes.ok && Array.isArray(homeworksRes.data)) ? homeworksRes.data : [];
        const attendanceRows = (attendanceRes && attendanceRes.ok && Array.isArray(attendanceRes.data)) ? attendanceRes.data : [];

        let teachers = (Array.isArray(sbRes.data) ? sbRes.data : []).map(t => {
          const tEmail = normalizeEmail(t.email || '');
          const tCode = String(t.code || '').trim().toUpperCase();
          const tMeta = extractTeacherMetaFromRow(t);
          const pStatus = tMeta.provisioningStatus || (
            isValidCognitoUuid(tMeta.cognitoUserId) ||
            tEmail === 'linh.lam@khongtunhi.com' ||
            tEmail === 'thu.ha@khongtunhi.com'
              ? 'ready_to_login'
              : 'pending_external_provisioning'
          );

          const matchedClassesFromTable = classRows
            .filter(c => c && c.active !== false && (
              (tEmail && normalizeEmail(c.teacher_email || '') === tEmail) ||
              (!c.teacher_email && tCode && String(c.teacher_code || '').trim().toUpperCase() === tCode)
            ))
            .map(c => String(c.id || '').trim().toUpperCase())
            .filter(Boolean);

          const validMetaAssignedClasses = (tMeta.assignedClasses || []).filter((cid) => {
            const clsRow = classRows.find((c) => String(c?.id || '').trim().toUpperCase() === cid);
            if (!clsRow) return true;
            if (clsRow.active === false) return false;
            const clsOwnerEmail = normalizeEmail(clsRow.teacher_email || '');
            const clsOwnerCode = String(clsRow.teacher_code || '').trim().toUpperCase();
            if (!clsOwnerEmail && !clsOwnerCode) return false;
            if (clsOwnerEmail && clsOwnerEmail !== tEmail) return false;
            if (!clsOwnerEmail && clsOwnerCode && clsOwnerCode !== tCode) return false;
            return true;
          });

          const mergedAssignedClasses = t.active === false
            ? []
            : Array.from(new Set([...validMetaAssignedClasses, ...matchedClassesFromTable]));
          const classSet = new Set(mergedAssignedClasses);

          const managedStudentsCount = studentRows.filter(
            s => s.class_code && classSet.has(String(s.class_code).trim().toUpperCase())
          ).length;

          // Thống kê buổi dạy 3 tầng trung thực (không bịa số buổi thực dạy)
          let scheduledSessionsCount = 0;
          for (const clsId of mergedAssignedClasses) {
            const clsObj = classRows.find(c => String(c?.id || '').trim().toUpperCase() === clsId);
            const rawSched = String(clsObj?.schedule || '').trim();
            if (rawSched && !rawSched.toLowerCase().includes('đang cập nhật')) {
              const cfg = parseLegacyScheduleSuggestion(rawSched);
              if (cfg && Array.isArray(cfg.daysOfWeek) && cfg.daysOfWeek.length > 0) {
                scheduledSessionsCount += cfg.daysOfWeek.length * 4;
              } else if (cfg && Array.isArray(cfg.weeklySlots) && cfg.weeklySlots.length > 0) {
                scheduledSessionsCount += cfg.weeklySlots.length * 4;
              } else {
                scheduledSessionsCount += 1;
              }
            }
          }

          let activitySessionsCount = 0;
          let confirmedSessionsCount = 0;
          for (const att of attendanceRows) {
            try {
              const parsedAtt = JSON.parse(att.blocked_content || '{}');
              const attClass = String(parsedAtt.class_code || parsedAtt.classCode || '').trim().toUpperCase();
              const attTeacher = normalizeEmail(parsedAtt.teacher_email || parsedAtt.teacherEmail || att.sender_email || '');
              if ((attTeacher && attTeacher === tEmail) || (attClass && classSet.has(attClass))) {
                activitySessionsCount++;
                if (parsedAtt.verified === true || parsedAtt.confirmedByAdmin === true) {
                  confirmedSessionsCount++;
                }
              }
            } catch {}
          }
          const aliasConfirmedMatch = (Array.isArray(t.aliases) ? t.aliases : []).find(
            a => typeof a === 'string' && a.startsWith('__confirmed_sessions:')
          );
          if (aliasConfirmedMatch) {
            const parsedNum = Number(aliasConfirmedMatch.split(':')[1]);
            if (Number.isFinite(parsedNum) && parsedNum > confirmedSessionsCount) {
              confirmedSessionsCount = parsedNum;
            }
          }

          const classHomeworks = homeworkRows.filter(
            hw => hw.class_code && classSet.has(String(hw.class_code).trim().toUpperCase())
          );
          const gradedHomeworksCount = classHomeworks.filter(
            hw => hw.status === 'graded' || (hw.score !== null && hw.score !== undefined) || Boolean(hw.teacher_feedback)
          ).length;
          const pendingHomeworksCount = Math.max(0, classHomeworks.length - gradedHomeworksCount);
          if (activitySessionsCount === 0 && gradedHomeworksCount > 0) {
            activitySessionsCount = gradedHomeworksCount;
          }

          const tAnswers = allForumAns.filter(
            a => normalizeEmail(a.author_email || a.teacher_email || '') === tEmail && a.status !== 'hidden'
          );
          const tEvents = allForumEvents.filter(
            e => normalizeEmail(e.teacher_email || '') === tEmail || (tCode && e.teacher_id === tCode)
          );
          const monthlyContributionPoints = Math.max(
            0,
            tEvents
              .filter(e => String(e.created_at || '').startsWith(currentMonthPrefix))
              .reduce((acc, e) => acc + (Number(e.points_delta) || 0), 0)
          );
          const totalContributionPoints = Math.max(
            0,
            tEvents.reduce((acc, e) => acc + (Number(e.points_delta) || 0), 0)
          );
          const tCourseReqs = allCourseReqs.filter(r => normalizeEmail(r.teacher_email || '') === tEmail);

          return {
            ...t,
            specialty: t.specialty || t.specialization || 'Giáo viên Tiếng Trung Thiếu Nhi',
            specialization: t.specialization || t.specialty || 'Giáo viên Tiếng Trung Thiếu Nhi',
            assigned_classes: mergedAssignedClasses,
            assignedClasses: mergedAssignedClasses,
            assigned_courses: tMeta.assignedCourses,
            assignedCourses: tMeta.assignedCourses,
            cognito_user_id: tMeta.cognitoUserId || t.cognito_user_id || null,
            provisioningStatus: pStatus,
            readyToLogin: pStatus === 'ready_to_login' && t.active !== false,
            syncStatus: t.sync_status || (pStatus === 'ready_to_login' ? 'synced' : 'pending_activation'),
            managedStudentsCount,
            scheduledSessionsCount,
            activitySessionsCount,
            recordedClassSessionsCount: activitySessionsCount,
            confirmedSessionsCount,
            attendanceConfirmedSessionsCount: confirmedSessionsCount,
            teachingVerificationStatus: confirmedSessionsCount > 0 ? 'verified' : 'unverified',
            teachingVerificationLabel: confirmedSessionsCount > 0
              ? `Đã xác minh ${confirmedSessionsCount} buổi thực dạy`
              : 'Chưa xác minh số buổi thực dạy',
            gradedHomeworksCount,
            pendingHomeworksCount,
            forumAnswersCount: tAnswers.length,
            acceptedAnswersCount: tAnswers.filter(a => a.is_accepted).length,
            forumAcceptedAnswersCount: tAnswers.filter(a => a.is_accepted).length,
            helpfulVotesCount: tAnswers.reduce((acc, a) => acc + (Number(a.helpful_count) || 0), 0),
            videoGuidesCount: tAnswers.filter(a => a.video_verified && a.video_url).length,
            forumVideoAnswersCount: tAnswers.filter(a => a.video_verified && a.video_url).length,
            monthlyContributionPoints,
            totalContributionPoints,
            recentContributionEvents: tEvents.slice(0, 15),
            courseRequestsCount: tCourseReqs.length,
            pendingCourseRequestsCount: tCourseReqs.filter(r => r.status === 'pending').length
          };
        });
        if (q) {
          const tokens = q.split(' ').filter(Boolean);
          teachers = teachers.filter(t => {
            const hay = normalizeViSearchText([t.code, t.name, t.email, t.phone, ...(Array.isArray(t.assigned_classes) ? t.assigned_classes : [])].join(' '));
            return tokens.every(tok => hay.includes(tok));
          });
        }
        return jsonResponse({ ok: true, teachers });
      }
      if (request.method === 'POST') {
        // Giải quyết triệt để BUG BE-06 & BUG BE-07:
        // - Kiểm tra lỗi ghi Supabase (trả 502 nếu lỗi, không trả object giả)
        // - Cấp/xác minh tài khoản đăng nhập cho giáo viên và đồng bộ 2 chiều với ktn_classes (bao gồm thu hồi lớp cũ khi chuyển phân công)
        // - Phân biệt trung thực ready_to_login vs pending_external_provisioning (không gắn giả ready_to_login khi chưa cấp tài khoản)
        const session = await extractSessionFromRequest(request, env);
        if (!session || session.role !== 'admin') {
          return jsonResponse({ ok: false, message: 'Chỉ Quản lý (Admin) mới được tạo/cập nhật giáo viên.' }, 403);
        }
        const body = await request.json().catch(() => ({}));
        const tEmail = normalizeEmail(body.email || '');
        if (!tEmail || !tEmail.includes('@')) {
          return jsonResponse({ ok: false, message: 'Vui lòng nhập email giáo viên hợp lệ.' }, 400);
        }

        const existingTeaLookup = await supabaseRequest(env, `ktn_teachers?email=eq.${encodeURIComponent(tEmail)}&limit=1`);
        const existingTeaRow = (existingTeaLookup.ok && Array.isArray(existingTeaLookup.data) && existingTeaLookup.data[0]) || null;
        const existingMeta = extractTeacherMetaFromRow(existingTeaRow);

        const tCode = String(existingTeaRow?.code || body.code || ('GV-KTN-' + Date.now().toString().slice(-4))).trim().toUpperCase();
        const tName = String(body.name || existingTeaRow?.name || tEmail.split('@')[0]).trim();
        const rawAssignedClassesInput = Array.isArray(body.assignedClasses)
          ? body.assignedClasses
          : (Array.isArray(body.assigned_classes) ? body.assigned_classes : null);
        const hasExplicitAssignedClasses = Array.isArray(rawAssignedClassesInput) || body.classCode !== undefined;
        const assignedClasses = hasExplicitAssignedClasses
          ? Array.from(new Set(
              (Array.isArray(rawAssignedClassesInput) ? rawAssignedClassesInput : (body.classCode ? [body.classCode] : []))
                .map(c => String(c || '').trim().toUpperCase())
                .filter(Boolean)
            ))
          : existingMeta.assignedClasses;
        const rawAssignedCoursesInput = Array.isArray(body.assignedCourses)
          ? body.assignedCourses
          : (Array.isArray(body.assigned_courses) ? body.assigned_courses : null);
        const hasExplicitAssignedCourses = Array.isArray(rawAssignedCoursesInput) || body.courseId !== undefined;
        const assignedCourses = hasExplicitAssignedCourses
          ? Array.from(new Set(
              (Array.isArray(rawAssignedCoursesInput) ? rawAssignedCoursesInput : (body.courseId ? [body.courseId] : []))
                .map(c => String(c || '').trim().toLowerCase())
                .filter(c => /^[0-9a-f]{24}$/i.test(c))
            ))
          : existingMeta.assignedCourses;

        let cognitoUserId = body.cognitoUserId || existingMeta.cognitoUserId || null;
        const explicitTeacherPassword = String(body.initialPassword || body.password || '').trim();
        let initialPassword = explicitTeacherPassword.length >= 6 ? explicitTeacherPassword : null;
        let accountCreated = false;
        let existingAccount = Boolean(existingTeaRow);
        let provisioningStatus = (
          existingMeta.provisioningStatus === 'ready_to_login' ||
          Boolean(existingMeta.passwordHmac) ||
          explicitTeacherPassword.length >= 6 ||
          isValidCognitoUuid(cognitoUserId) ||
          tEmail === 'linh.lam@khongtunhi.com' ||
          tEmail === 'thu.ha@khongtunhi.com'
        ) ? 'ready_to_login' : 'pending_external_provisioning';
        let syncError = null;

        // Nếu yêu cầu đồng bộ tài khoản đăng nhập lên izTeach (mặc định bật khi tạo giáo viên mới)
        if (body.provisionOnIzTeach !== false) {
          const prov = await provisionStudentOnIzTeach(env, {
            student_email: tEmail,
            student_name: tName,
            phone: String(body.phone || existingTeaRow?.phone || '').trim(),
            initialPassword: explicitTeacherPassword || undefined,
            courseIds: [],
            skipCourses: true,
            cognito_user_id: cognitoUserId
          });
          if (prov.ok) {
            cognitoUserId = prov.cognitoUserId;
            initialPassword = explicitTeacherPassword.length >= 6 ? explicitTeacherPassword : prov.initialPassword;
            accountCreated = Boolean(prov.accountCreated);
            existingAccount = Boolean(prov.existingAccount);
            provisioningStatus = 'ready_to_login';
            if (!existingTeaRow && !initialPassword) {
              initialPassword = await deriveDeterministicInitialPassword(env, 'TEA-' + tCode, tEmail);
              accountCreated = true;
              existingAccount = false;
            }
          } else {
            syncError = prov.error || 'IZTEACH_TEACHER_PROVISION_FAILED';
            if (provisioningStatus !== 'ready_to_login') {
              provisioningStatus = 'pending_external_provisioning';
            }
          }
        }

        // Chỉ tính HMAC cho mật khẩu riêng của giáo viên (explicitTeacherPassword hoặc prov.initialPassword)
        // hoặc mật khẩu khởi tạo khi thực sự đã đồng bộ izTeach thành công (provisionOnIzTeach !== false).
        // Tuyệt đối không dùng mật khẩu nhân sự chung để đánh dấu ready_to_login cho hồ sơ nội bộ chưa cấp tài khoản.
        const effectiveTeacherPwd = String(
          explicitTeacherPassword ||
          initialPassword ||
          (body.provisionOnIzTeach !== false && provisioningStatus === 'ready_to_login' ? (env.KTN_STAFF_AND_TEST_PASSWORD || '') : '')
        ).trim();
        let passwordHmac = existingMeta.passwordHmac || null;
        if (provisioningStatus === 'ready_to_login' && effectiveTeacherPwd.length >= 6) {
          passwordHmac = await computeTeacherCredentialHmac(tEmail, effectiveTeacherPwd, env.KTN_SESSION_SECRET);
        }

        const userDefinedAliases = Array.isArray(existingTeaRow?.aliases)
          ? existingTeaRow.aliases.filter(a => typeof a === 'string' && !a.startsWith('__'))
          : [];
        const hasCustomPassword = explicitTeacherPassword.length >= 6 || Boolean(existingMeta.customPassword);
        const metadataAliases = [
          ...userDefinedAliases,
          `__status:${provisioningStatus}`,
          ...(cognitoUserId ? [`__uid:${cognitoUserId}`] : []),
          ...(passwordHmac ? [`__pwd_hmac:${passwordHmac}`] : []),
          ...(hasCustomPassword ? ['__pwd_custom:1'] : []),
          ...assignedClasses.map(c => `__class:${c}`),
          ...assignedCourses.map(c => `__course:${c}`)
        ];

        const isActive = body.active !== undefined ? Boolean(body.active) : (existingTeaRow?.active !== undefined ? Boolean(existingTeaRow.active) : true);
        const resolvedSpecialty = String(
          body.specialty || body.specialization || existingTeaRow?.specialty || existingTeaRow?.specialization || 'Giáo viên Tiếng Trung Thiếu Nhi'
        ).trim();
        const preV3TeacherRow = {
          code: tCode,
          name: tName,
          email: tEmail,
          phone: String(body.phone ?? existingTeaRow?.phone ?? '').trim(),
          specialty: resolvedSpecialty,
          aliases: metadataAliases,
          active: isActive
        };
        const baseTeacherRow = {
          ...preV3TeacherRow,
          assigned_classes: assignedClasses
        };

        const extendedWithoutCoursesRow = {
          ...baseTeacherRow,
          ...(cognitoUserId ? { cognito_user_id: cognitoUserId } : {}),
          provisioning_status: provisioningStatus,
          sync_status: provisioningStatus === 'ready_to_login' ? 'synced' : 'pending_activation',
          updated_at: new Date().toISOString()
        };

        const extendedTeacherRow = {
          ...extendedWithoutCoursesRow,
          assigned_courses: assignedCourses
        };

        let sbRes = await supabaseRequest(env, 'ktn_teachers', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: extendedTeacherRow
        });
        if ((!sbRes || !sbRes.ok) && sbRes?.status === 400) {
          sbRes = await supabaseRequest(env, 'ktn_teachers', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates,return=representation',
            body: extendedWithoutCoursesRow
          });
        }
        if ((!sbRes || !sbRes.ok) && sbRes?.status === 400) {
          sbRes = await supabaseRequest(env, 'ktn_teachers', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates,return=representation',
            body: baseTeacherRow
          });
        }
        if ((!sbRes || !sbRes.ok) && sbRes?.status === 400) {
          sbRes = await supabaseRequest(env, 'ktn_teachers', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates,return=representation',
            body: preV3TeacherRow
          });
        }
        if (!sbRes || !sbRes.ok || !Array.isArray(sbRes.data) || sbRes.data.length === 0) {
          return jsonResponse({
            ok: false,
            retryable: true,
            error: 'SUPABASE_TEACHER_UPSERT_FAILED',
            message: 'Không thể lưu hồ sơ giáo viên vào cơ sở dữ liệu Supabase. Vui lòng thử lại.'
          }, 502);
        }

        // Thu hồi các lớp cũ từng gắn với tEmail nhưng không còn nằm trong assignedClasses (hoặc khi giáo viên bị khóa active=false)
        if (hasExplicitAssignedClasses || !isActive) {
          const prevClassesRes = await supabaseRequest(
            env,
            `ktn_classes?teacher_email=eq.${encodeURIComponent(tEmail)}&select=id`
          );
          if (prevClassesRes.ok && Array.isArray(prevClassesRes.data)) {
            const nextSet = isActive ? new Set(assignedClasses) : new Set();
            for (const prevCls of prevClassesRes.data) {
              const prevClsId = String(prevCls?.id || '').trim().toUpperCase();
              if (prevClsId && !nextSet.has(prevClsId)) {
                await supabaseRequest(env, `ktn_classes?id=eq.${encodeURIComponent(prevClsId)}`, {
                  method: 'PATCH',
                  body: {
                    teacher_code: null,
                    teacher_email: null,
                    updated_at: new Date().toISOString()
                  }
                });
              }
            }
          }
        }

        // Đồng bộ 2 chiều: Cập nhật teacher_email & teacher_code cho các lớp được phân công trong ktn_classes (tạo mới lớp nếu chưa có)
        if (isActive) {
          for (const clsId of assignedClasses) {
            const clsLookup = await supabaseRequest(env, `ktn_classes?id=eq.${encodeURIComponent(clsId)}&select=*&limit=1`);
            const oldClsRow = (clsLookup.ok && Array.isArray(clsLookup.data) && clsLookup.data[0]) || null;
            const oldOwnerEmail = normalizeEmail(oldClsRow?.teacher_email || '');
            let oldOwnerRow = null;
            if (oldOwnerEmail && oldOwnerEmail !== tEmail) {
              const oldOwnerRes = await supabaseRequest(env, `ktn_teachers?email=eq.${encodeURIComponent(oldOwnerEmail)}&limit=1`);
              oldOwnerRow = (oldOwnerRes.ok && Array.isArray(oldOwnerRes.data) && oldOwnerRes.data[0]) || null;
              if (oldOwnerRow) {
                const oldOwnerMeta = extractTeacherMetaFromRow(oldOwnerRow);
                const nextOldOwnerClasses = oldOwnerMeta.assignedClasses.filter(c => c && c !== clsId);
                const oldOwnerUserAliases = Array.isArray(oldOwnerRow.aliases)
                  ? oldOwnerRow.aliases.filter(a => typeof a === 'string' && !a.startsWith('__class:'))
                  : [];
                const nextOldAliases = [...oldOwnerUserAliases, ...nextOldOwnerClasses.map(c => `__class:${c}`)];
                const patchOldRes = await supabaseRequest(env, `ktn_teachers?code=eq.${encodeURIComponent(oldOwnerRow.code)}`, {
                  method: 'PATCH',
                  body: { assigned_classes: nextOldOwnerClasses, aliases: nextOldAliases, updated_at: new Date().toISOString() }
                });
                if ((!patchOldRes || !patchOldRes.ok) && patchOldRes?.status === 400) {
                  await supabaseRequest(env, `ktn_teachers?code=eq.${encodeURIComponent(oldOwnerRow.code)}`, {
                    method: 'PATCH',
                    body: { aliases: nextOldAliases }
                  });
                }
              }
            }

            const patchCls = await supabaseRequest(env, `ktn_classes?id=eq.${encodeURIComponent(clsId)}`, {
              method: 'PATCH',
              prefer: 'return=representation',
              body: {
                teacher_code: tCode,
                teacher_email: tEmail,
                active: true,
                updated_at: new Date().toISOString()
              }
            });
            if (!patchCls.ok || !Array.isArray(patchCls.data) || patchCls.data.length === 0) {
              await supabaseRequest(env, 'ktn_classes?on_conflict=id', {
                method: 'POST',
                prefer: 'resolution=merge-duplicates,return=representation',
                body: {
                  id: clsId,
                  name: `Lớp ${clsId}`,
                  teacher_code: tCode,
                  teacher_email: tEmail,
                  active: true,
                  updated_at: new Date().toISOString()
                }
              });
            }

            // Phát thông báo phân công lớp mới (B1) hoặc chuyển giáo viên (B3)
            const deepLinkTeacherClasses = `/custom-page/so-lien-lac-test#/teacher/classes?class=${encodeURIComponent(clsId)}&roomId=${encodeURIComponent('class:' + clsId)}`;
            const wasActiveCls = Boolean(oldClsRow && oldClsRow.active !== false);
            if (!wasActiveCls) {
              await emitTargetedLifecycleNotification(env, {
                eventId: `CLASS_CREATED_${clsId}_${fnv1aHash36(tEmail)}`,
                type: 'class_created',
                recipientEmail: tEmail,
                senderEmail: session.email,
                classCode: clsId,
                roomId: `class:${clsId}`,
                title: 'Bạn được phân công lớp mới',
                body: `Bạn vừa được phân công phụ trách lớp ${clsId}. Mở lớp để xem lịch học và nhóm trao đổi.`,
                actionUrl: deepLinkTeacherClasses,
                actionLabel: 'Mở lớp & Nhóm trao đổi',
                allowSelfPush: true,
                meta: {
                  classCode: clsId,
                  roomId: `class:${clsId}`,
                  teacherEmail: tEmail,
                  teacherCode: tCode
                }
              }).catch(() => null);
            } else if (oldOwnerEmail !== tEmail) {
              const priorAssignRes = await supabaseRequest(
                env,
                `ktn_dlp_alerts?room_id=eq.KTN_LIFECYCLE_NOTIFICATION&sender_name=eq.${encodeURIComponent(clsId)}&reason=eq.class_teacher_changed&select=id`
              ).catch(() => ({ ok: false, data: [] }));
              const priorAssignCount =
                priorAssignRes.ok && Array.isArray(priorAssignRes.data) ? priorAssignRes.data.length : 0;
              const cycleSuffix = priorAssignCount > 0 ? `_T${priorAssignCount + 1}` : '';
              await emitTargetedLifecycleNotification(env, {
                eventId: `CLASS_TEACHER_ASSIGNED_${clsId}_${fnv1aHash36(tEmail)}_FROM_${fnv1aHash36(oldOwnerEmail || 'NONE')}${cycleSuffix}`,
                type: 'class_teacher_changed',
                recipientEmail: tEmail,
                senderEmail: session.email,
                classCode: clsId,
                roomId: `class:${clsId}`,
                title: `Phân công phụ trách lớp ${clsId}`,
                body: `Bạn vừa được phân công phụ trách lớp ${clsId}. Mở lớp để xem lịch học và nhóm trao đổi.`,
                actionUrl: deepLinkTeacherClasses,
                actionLabel: 'Mở lớp học',
                allowSelfPush: true,
                meta: {
                  classCode: clsId,
                  roomId: `class:${clsId}`,
                  roleInEvent: 'new_teacher',
                  previousTeacherEmail: oldOwnerEmail || null,
                  newTeacherEmail: tEmail
                }
              }).catch(() => null);

              if (oldOwnerEmail && (!oldOwnerRow || oldOwnerRow.active !== false)) {
                await emitTargetedLifecycleNotification(env, {
                  eventId: `CLASS_TEACHER_UNASSIGNED_${clsId}_${fnv1aHash36(oldOwnerEmail)}_TO_${fnv1aHash36(tEmail)}${cycleSuffix}`,
                  type: 'class_teacher_changed',
                  recipientEmail: oldOwnerEmail,
                  senderEmail: session.email,
                  classCode: clsId,
                  roomId: `class:${clsId}`,
                  title: `Thay đổi phân công lớp ${clsId}`,
                  body: `Lớp ${clsId} đã được chuyển phân công sang giáo viên khác.`,
                  actionUrl: '/custom-page/so-lien-lac-test#/teacher/classes',
                  actionLabel: 'Xem danh sách lớp',
                  allowSelfPush: true,
                  meta: {
                    classCode: clsId,
                    roomId: `class:${clsId}`,
                    roleInEvent: 'previous_teacher',
                    previousTeacherEmail: oldOwnerEmail,
                    newTeacherEmail: tEmail
                  }
                }).catch(() => null);
              }
            }
          }
        }

        const savedTeacher = sbRes.data[0];
        const savedMeta = extractTeacherMetaFromRow(savedTeacher);
        const verifiedAssignedClasses = isActive ? await getTeacherAssignedClassCodes(env, tEmail) : [];
        const verifiedAssignedCourses = isActive ? await getTeacherAssignedCourseIds(env, tEmail) : [];
        const readyToLogin = provisioningStatus === 'ready_to_login' && isActive;
        const hasVerifiedCredential = Boolean(
          savedMeta.passwordHmac ||
          passwordHmac ||
          isValidCognitoUuid(savedMeta.cognitoUserId || cognitoUserId) ||
          tEmail === 'linh.lam@khongtunhi.com' ||
          tEmail === 'thu.ha@khongtunhi.com'
        );
        const roleVerified = Boolean(
          readyToLogin &&
          hasVerifiedCredential &&
          savedTeacher &&
          savedTeacher.active !== false &&
          normalizeEmail(savedTeacher.email) === tEmail &&
          tEmail !== 'hocvienkhongtunhi123@gmail.com' &&
          tEmail !== 'quanly@khongtunhi.com' &&
          tEmail !== 'khongtunhi@gmail.com'
        );

        await logSyncEvent(env, {
          eventType: 'teacher_provision',
          sourceSystem: 'ktn_admin',
          targetSystem: body.provisionOnIzTeach !== false ? 'izteach+supabase' : 'supabase',
          entityType: 'teacher',
          entityKey: tEmail,
          status: readyToLogin ? 'synced' : 'pending_activation',
          errorCode: syncError,
          details: {
            code: tCode,
            email: tEmail,
            name: tName,
            assignedClasses: verifiedAssignedClasses,
            assignedCourses: verifiedAssignedCourses,
            provisioningStatus,
            readyToLogin,
            roleVerified,
            cognitoUserId
          },
          createdBy: session.email
        });

        return jsonResponse({
          ok: true,
          provisioningStatus,
          syncStatus: readyToLogin ? 'synced' : 'pending_activation',
          readyToLogin,
          roleVerified,
          resolvedRole: 'teacher',
          assignedClasses: verifiedAssignedClasses,
          assignedCourses: verifiedAssignedCourses,
          accountCreated,
          existingAccount,
          initialPassword,
          teacher: {
            ...savedTeacher,
            assigned_classes: verifiedAssignedClasses,
            assigned_courses: verifiedAssignedCourses,
            cognito_user_id: cognitoUserId,
            provisioningStatus,
            readyToLogin,
            roleVerified
          },
          message: readyToLogin
            ? (accountCreated
                ? `Đã tạo giáo viên ${tName} (${tEmail}) và cấp tài khoản đăng nhập thành công!`
                : `Đã lưu hồ sơ giáo viên ${tName} (${tEmail}) và phân công ${verifiedAssignedClasses.length} lớp học!`)
            : `Đã lưu hồ sơ giáo viên ${tName} (${tEmail}) ở trạng thái chờ cấp tài khoản đăng nhập (${provisioningStatus}).`
        });
      }
    }

    // ------------------------------------------------------------------------
    // C. TIẾP NHẬN LEAD HỌC THỬ 0Đ & ĐƠN HÀNG KHÓA HỌC TỪ TRANG CHỦ
    // ------------------------------------------------------------------------
    if (path === '/api/ktn/leads' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const nameTrim = String(body.name || body.parentName || '').trim();
      const phoneTrim = String(body.phone || '').trim().replace(/[\s.-]/g, '');
      const courseLabel = String(body.childAge || body.courseLabel || 'Tiểu học (7–11t)').trim();
      if (!nameTrim || !/^(0|\+84)(3|5|7|8|9)[0-9]{8}$/.test(phoneTrim)) {
        return jsonResponse({ ok: false, message: 'Vui lòng nhập đầy đủ Họ tên và Số điện thoại hợp lệ.' }, 400);
      }

      const isTestLead = Boolean(body.testMode || request.headers.get('X-KTN-Test-Mode') === '1');
      if (isTestLead) {
        const session = await extractSessionFromRequest(request, env);
        const webhookSecret = request.headers.get('X-KTN-Webhook-Secret') || '';
        const isAuthorizedTest = Boolean(
          (session && session.role === 'admin') ||
          (env.KTN_WEBHOOK_SECRET && webhookSecret === env.KTN_WEBHOOK_SECRET)
        );
        if (!isAuthorizedTest) {
          return jsonResponse({ ok: false, message: 'Chế độ kiểm thử Lead (testMode) chỉ dành cho Quản trị viên đã xác thực.' }, 403);
        }
        return jsonResponse({
          ok: true,
          testMode: true,
          lead: {
            name: nameTrim,
            phone: phoneTrim,
            courseLabel,
            createdAt: new Date().toISOString()
          }
        });
      }

      // Chống gửi trùng lặp cùng SĐT trong vòng 5 phút
      if (!globalThis.__ktnRecentLeadsMap) globalThis.__ktnRecentLeadsMap = new Map();
      const lastLeadAt = globalThis.__ktnRecentLeadsMap.get(phoneTrim) || 0;
      if (Date.now() - lastLeadAt < 5 * 60 * 1000) {
        return jsonResponse({
          ok: true,
          deduplicated: true,
          lead: {
            name: nameTrim,
            phone: phoneTrim,
            courseLabel,
            createdAt: new Date().toISOString()
          }
        });
      }
      globalThis.__ktnRecentLeadsMap.set(phoneTrim, Date.now());

      const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
      const leadPayload = {
        name: nameTrim,
        phone: phoneTrim,
        email: `Học thử 0đ (${courseLabel})`,
        address: 'Đăng ký Học thử 0đ — Trang chủ Tiếng Trung',
        vendorId,
        metadata: {
          leadType: 'trial_0d',
          interestedCourse: {
            id: 'tieng-trung-hoc-thu-0d',
            title: `[Học thử 0đ] ${courseLabel}`,
            type: 'trial'
          }
        }
      };

      const contactRes = await fetch('https://c9xi8h3a3d.execute-api.ap-southeast-1.amazonaws.com/prod/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadPayload)
      }).catch(() => null);

      if (!contactRes || !contactRes.ok) {
        return jsonResponse({
          ok: false,
          message: 'Máy chủ tạm thời chưa nhận được đăng ký. Phụ huynh vui lòng bấm Gửi lại nhé!'
        }, 502);
      }

      return jsonResponse({
        ok: true,
        lead: {
          name: nameTrim,
          phone: phoneTrim,
          courseLabel,
          createdAt: new Date().toISOString()
        }
      });
    }

    if ((path === '/api/ktn/orders' || path === '/api/izteach/orders') && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const session = await extractSessionFromRequest(request, env);
      const isAuthenticatedStudentOrder =
        body.source === 'authenticated_student' ||
        (Boolean(session && session.role === 'student') && body.source !== 'website' && !body.orderId);

      // 1. Luồng học viên đang đăng nhập đặt mua thêm khóa học trực tiếp trong khu vực Học video
      if (isAuthenticatedStudentOrder) {
        if (!session) {
          return jsonResponse({
            ok: false,
            error: 'AUTH_REQUIRED',
            message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để đăng ký khóa học.'
          }, 401);
        }

        const stuLookup = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(session.email)}&limit=1`);
        const stuProfile = (stuLookup.ok && Array.isArray(stuLookup.data) && stuLookup.data[0]) ? stuLookup.data[0] : null;

        const requestedCourseId = String(body.courseId || '').trim();
        const coursePricing = await resolveServerCoursePrice(env, requestedCourseId);
        if (!requestedCourseId || !coursePricing.validCourse) {
          return jsonResponse({
            ok: false,
            error: 'INVALID_COURSE_ID',
            message: 'Khóa học đăng ký không tồn tại hoặc không hợp lệ.'
          }, 400);
        }

        const enrolledList = Array.isArray(stuProfile?.online_courses)
          ? stuProfile.online_courses
          : (Array.isArray(session.onlineCourses) ? session.onlineCourses : []);
        const enrolledIds = new Set(
          enrolledList.map(c => String(c?.id || c?._id || c || '').trim().toLowerCase()).filter(Boolean)
        );
        if (enrolledIds.has(coursePricing.courseId.toLowerCase())) {
          return jsonResponse({
            ok: false,
            error: 'COURSE_ALREADY_OWNED',
            message: 'Em đã được mở khóa học này trong tài khoản rồi.'
          }, 409);
        }

        const rawContactPhone = String(body.phone || body.parentPhone || stuProfile?.phone || session.phone || '').trim().replace(/[\s.-]/g, '');
        if (!/^(0|\+84)(3|5|7|8|9)[0-9]{8}$/.test(rawContactPhone)) {
          return jsonResponse({
            ok: false,
            error: 'INVALID_PHONE',
            message: 'Vui lòng nhập Số điện thoại / Zalo phụ huynh hợp lệ (10 số Việt Nam).'
          }, 400);
        }

        const studentName = String(stuProfile?.name || session.name || body.studentName || session.email.split('@')[0]).trim();
        const parentName = String(body.parentName ?? body.contactName ?? stuProfile?.parent_name ?? '').trim();
        const customerNote = String(body.note || '').trim();
        const updateProfilePhone = Boolean(body.updateProfilePhone);

        // Chống bấm nhiều lần tạo trùng đơn cho cùng 1 học viên + cùng 1 khóa học đang chờ xử lý
        const existingPendingRes = await supabaseRequest(
          env,
          `ktn_orders?student_email=eq.${encodeURIComponent(session.email)}&course_id=eq.${encodeURIComponent(coursePricing.courseId)}&approval_status=eq.pending&order=created_at.desc&limit=5`
        );
        if (existingPendingRes.ok && Array.isArray(existingPendingRes.data)) {
          const activeDup = existingPendingRes.data.find(row => {
            if (!row || row.payment_status === 'refunded') return false;
            const createdMs = row.created_at ? new Date(row.created_at).getTime() : 0;
            return !createdMs || (Date.now() - createdMs) < 24 * 60 * 60 * 1000;
          });
          if (activeDup) {
            const pInfo = buildVietQrPaymentInfo(coursePricing.paymentConfig, activeDup.order_id, activeDup.amount);
            const enrichedDup = {
              ...enrichOrderForResponse(activeDup),
              payment_info: pInfo,
              paymentInfo: pInfo
            };
            return jsonResponse({
              ok: true,
              duplicatePrevented: true,
              orderId: activeDup.order_id,
              order: enrichedDup,
              paymentInfo: pInfo,
              message: 'Đơn của em đang chờ xác nhận.'
            });
          }
        }

        // Chỉ cập nhật SĐT hồ sơ học viên khi người dùng chủ động xác nhận (updateProfilePhone === true)
        if (updateProfilePhone && stuProfile) {
          await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(session.email)}`, {
            method: 'PATCH',
            body: {
              phone: rawContactPhone,
              ...(parentName ? { parent_name: parentName } : {}),
              updated_at: new Date().toISOString()
            }
          });
        }

        const generatedOrderId = 'ORD-' + String(Math.floor(100000 + Math.random() * 900000));
        const orderMeta = {
          parent_name: parentName,
          contact_status: 'not_called',
          contact_note: '',
          payment_sub_status: 'unpaid',
          source: 'authenticated_student',
          account_created: false,
          credential_handed_off: false,
          update_profile_phone: updateProfilePhone,
          v2_managed: true
        };

        const orderRecord = {
          order_id: generatedOrderId,
          student_name: studentName,
          student_email: normalizeEmail(session.email),
          phone: rawContactPhone,
          course_id: coursePricing.courseId,
          course_name: coursePricing.title || 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
          amount: coursePricing.price,
          payment_method: body.paymentMethod || 'VietQR',
          payment_status: 'pending_verification',
          approval_status: 'pending',
          assigned_user_id: stuProfile?.cognito_user_id || session.cognitoUserId || null,
          assigned_student_id: stuProfile?.izteach_student_id || null,
          note: serializeOrderNoteWithMeta(customerNote, orderMeta)
        };

        const sbRes = await supabaseRequest(env, 'ktn_orders', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: orderRecord
        });

        if (!sbRes || !sbRes.ok || !Array.isArray(sbRes.data) || sbRes.data.length === 0) {
          return jsonResponse({
            ok: false,
            retryable: true,
            error: 'SUPABASE_ORDER_CREATE_FAILED',
            message: 'Máy chủ chưa lưu được đơn đăng ký vào cơ sở dữ liệu. Em vui lòng bấm gửi lại nhé!'
          }, 502);
        }

        const savedOrder = sbRes.data[0];
        const pInfo = buildVietQrPaymentInfo(coursePricing.paymentConfig, savedOrder.order_id, savedOrder.amount);
        return jsonResponse({
          ok: true,
          orderId: savedOrder.order_id,
          order: {
            ...enrichOrderForResponse(savedOrder),
            payment_info: pInfo,
            paymentInfo: pInfo
          },
          paymentInfo: pInfo,
          message: 'Đơn của em đang chờ xác nhận.'
        });
      }

      // 2. Luồng đăng ký khóa học từ Website công khai (hoặc bài test legacy)
      const rawPhone = String(body.phone || body.parentPhone || '').trim().replace(/[\s.-]/g, '');
      if (!String(body.studentName || '').trim() || !/^(0|\+84)(3|5|7|8|9)[0-9]{8}$/.test(rawPhone)) {
        return jsonResponse({ ok: false, message: 'Vui lòng nhập đầy đủ Họ tên và Số điện thoại hợp lệ (10 số).' }, 400);
      }

      const requestedCourseId = String(body.courseId || DEFAULT_COURSE_ID).trim();
      const coursePricing = await resolveServerCoursePrice(env, requestedCourseId);
      if (body.courseId && !coursePricing.validCourse) {
        return jsonResponse({
          ok: false,
          error: 'INVALID_COURSE_ID',
          message: 'Mã khóa học đăng ký không hợp lệ.'
        }, 400);
      }

      const rawInputEmail = normalizeEmail(body.studentEmail || '');
      const hasCleanEmail = Boolean(rawInputEmail && !isSyntheticPlaceholderEmail(rawInputEmail));
      if (hasCleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawInputEmail)) {
        return jsonResponse({
          ok: false,
          error: 'INVALID_EMAIL',
          message: 'Địa chỉ Email không đúng định dạng.'
        }, 400);
      }

      const isLegacyClientOrderId = Boolean(body.orderId && !body.source && body.parentName === undefined);
      const parentName = String(body.parentName || '').trim();
      const customerNote = String(body.note || '').trim();

      // Chống tạo trùng đơn liên tiếp khi người dùng bấm nút nhiều lần trên website
      if (!isLegacyClientOrderId) {
        const recentRes = await supabaseRequest(
          env,
          `ktn_orders?phone=eq.${encodeURIComponent(String(body.phone || body.parentPhone).trim())}&course_id=eq.${encodeURIComponent(coursePricing.courseId)}&approval_status=eq.pending&order=created_at.desc&limit=3`
        );
        if (recentRes.ok && Array.isArray(recentRes.data)) {
          const recentDup = recentRes.data.find(row => {
            if (!row || !row.created_at) return false;
            const ageMs = Date.now() - new Date(row.created_at).getTime();
            return ageMs >= 0 && ageMs < 60 * 1000 && String(row.student_name || '').trim() === String(body.studentName).trim();
          });
          if (recentDup) {
            const pInfo = buildVietQrPaymentInfo(coursePricing.paymentConfig, recentDup.order_id, recentDup.amount);
            return jsonResponse({
              ok: true,
              duplicatePrevented: true,
              orderId: recentDup.order_id,
              order: {
                ...enrichOrderForResponse(recentDup),
                payment_info: pInfo,
                paymentInfo: pInfo
              },
              paymentInfo: pInfo
            });
          }
        }
      }

      const generatedOrderId = isLegacyClientOrderId
        ? String(body.orderId).trim()
        : ('ORD-' + String(Math.floor(100000 + Math.random() * 900000)));

      const orderMeta = {
        parent_name: parentName,
        contact_status: 'not_called',
        contact_note: '',
        payment_sub_status: 'unpaid',
        source: 'website',
        v2_managed: !isLegacyClientOrderId
      };

      const orderRecord = {
        order_id: generatedOrderId,
        student_name: String(body.studentName).trim(),
        // Không tự ghép Gmail giả từ SĐT khi thiếu email
        student_email: hasCleanEmail ? rawInputEmail : '',
        phone: String(body.phone || body.parentPhone).trim(),
        course_id: coursePricing.courseId,
        course_name: coursePricing.title || body.courseName || 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
        // Luôn lấy giá chuẩn từ server (không tin giá truyền từ frontend)
        amount: coursePricing.price,
        payment_method: body.paymentMethod || 'VietQR',
        payment_status: 'pending_verification',
        approval_status: 'pending',
        note: isLegacyClientOrderId ? customerNote : serializeOrderNoteWithMeta(customerNote, orderMeta)
      };

      const sbRes = await supabaseRequest(env, 'ktn_orders', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: orderRecord
      });

      // Giải quyết BUG BE-07: Tuyệt đối không trả ok: true kèm object giả nếu Supabase báo lỗi
      if (!sbRes || !sbRes.ok || !Array.isArray(sbRes.data) || sbRes.data.length === 0) {
        return jsonResponse({
          ok: false,
          retryable: true,
          error: 'SUPABASE_ORDER_CREATE_FAILED',
          message: 'Máy chủ chưa lưu được đơn đăng ký vào cơ sở dữ liệu. Quý phụ huynh vui lòng bấm Gửi lại!'
        }, 502);
      }

      const savedOrder = sbRes.data[0];
      const pInfo = buildVietQrPaymentInfo(coursePricing.paymentConfig, savedOrder.order_id, savedOrder.amount);
      return jsonResponse({
        ok: true,
        orderId: savedOrder.order_id,
        order: isLegacyClientOrderId
          ? savedOrder
          : {
              ...enrichOrderForResponse(savedOrder),
              payment_info: pInfo,
              paymentInfo: pInfo
            },
        paymentInfo: pInfo
      });
    }

    if (path === '/api/ktn/orders/my' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập để xem đơn hàng của em.' }, 401);
      }
      const [ordRes, cfgRes] = await Promise.all([
        supabaseRequest(env, `ktn_orders?student_email=eq.${encodeURIComponent(session.email)}&order=created_at.desc&limit=50`),
        supabaseRequest(env, 'ktn_payment_config?id=eq.default&limit=1')
      ]);
      const cfgRow = (cfgRes.ok && Array.isArray(cfgRes.data) && cfgRes.data[0]) ? cfgRes.data[0] : null;
      const rows = (ordRes.ok && Array.isArray(ordRes.data)) ? ordRes.data : [];
      const orders = rows.map(row => {
        const enriched = enrichOrderForResponse(row);
        const pInfo = buildVietQrPaymentInfo(cfgRow, row.order_id, row.amount);
        return {
          ...enriched,
          payment_info: pInfo,
          paymentInfo: pInfo
        };
      });
      return jsonResponse({ ok: true, orders });
    }

    if (path === '/api/ktn/orders/report-payment' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const session = await extractSessionFromRequest(request, env);
      const orderId = String(body.orderId || '').trim();
      if (!orderId) {
        return jsonResponse({ ok: false, message: 'Thiếu mã đơn hàng orderId.' }, 400);
      }
      const ordLookup = await supabaseRequest(env, `ktn_orders?order_id=eq.${encodeURIComponent(orderId)}&limit=1`);
      const existingOrd = (ordLookup.ok && Array.isArray(ordLookup.data) && ordLookup.data[0]) ? ordLookup.data[0] : null;
      if (!existingOrd) {
        return jsonResponse({ ok: false, message: 'Không tìm thấy đơn hàng ' + orderId }, 404);
      }
      if (session && session.role === 'student') {
        if (normalizeEmail(existingOrd.student_email) !== normalizeEmail(session.email)) {
          return jsonResponse({ ok: false, message: 'Em không có quyền cập nhật đơn hàng này.' }, 403);
        }
      } else if (!session || session.role !== 'admin') {
        const cleanReqPhone = String(body.phone || '').replace(/\D/g, '');
        const cleanOrdPhone = String(existingOrd.phone || '').replace(/\D/g, '');
        if (!cleanReqPhone || cleanReqPhone !== cleanOrdPhone) {
          return jsonResponse({ ok: false, message: 'Không đủ quyền xác nhận thông báo chuyển khoản cho đơn này.' }, 403);
        }
      }

      // Tuyệt đối KHÔNG tự coi "khách báo đã chuyển khoản" là "đã nhận tiền" (payment_status giữ nguyên pending_verification)
      const { customerNote, meta } = extractOrderMetaFromRow(existingOrd);
      const txRef = body.transactionRef ?? body.paymentTxRef;
      const nextMeta = {
        ...meta,
        payment_sub_status: existingOrd.payment_status === 'paid' ? 'verified_paid' : 'customer_reported',
        payment_tx_ref: txRef ? String(txRef).trim() : meta.payment_tx_ref
      };
      const patchRes = await supabaseRequest(env, `ktn_orders?order_id=eq.${encodeURIComponent(orderId)}`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: {
          note: serializeOrderNoteWithMeta(customerNote, nextMeta),
          updated_at: new Date().toISOString()
        }
      });
      if (!patchRes || !patchRes.ok || !Array.isArray(patchRes.data) || !patchRes.data[0]) {
        return jsonResponse({ ok: false, message: 'Chưa ghi nhận được thông báo chuyển khoản. Vui lòng thử lại.' }, 502);
      }
      return jsonResponse({
        ok: true,
        order: enrichOrderForResponse(patchRes.data[0]),
        message: 'Đã ghi nhận thông báo chuyển khoản. Trung tâm sẽ đối chiếu giao dịch và mở khóa học sớm nhất.'
      });
    }

    if (path === '/api/ktn/orders/update' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || session.role !== 'admin') {
        return jsonResponse({ ok: false, message: 'Chỉ Quản lý (Admin) mới được cập nhật thông tin đơn hàng.' }, 403);
      }
      const body = await request.json().catch(() => ({}));
      const orderId = String(body.orderId || '').trim();
      if (!orderId) {
        return jsonResponse({ ok: false, message: 'Thiếu mã đơn hàng orderId.' }, 400);
      }
      const ordLookup = await supabaseRequest(env, `ktn_orders?order_id=eq.${encodeURIComponent(orderId)}&limit=1`);
      const existingOrd = (ordLookup.ok && Array.isArray(ordLookup.data) && ordLookup.data[0]) ? ordLookup.data[0] : null;
      if (!existingOrd) {
        return jsonResponse({ ok: false, message: 'Không tìm thấy đơn hàng ' + orderId }, 404);
      }

      const nowIso = new Date().toISOString();
      const { customerNote: prevCustomerNote, meta: prevMeta } = extractOrderMetaFromRow(existingOrd);
      const nextMeta = { ...prevMeta, v2_managed: true };
      const patchPayload = { updated_at: nowIso };

      if (body.studentName !== undefined && String(body.studentName).trim()) {
        patchPayload.student_name = String(body.studentName).trim();
      }
      const rawPhoneParam = body.phone !== undefined ? body.phone : body.parentPhone;
      if (rawPhoneParam !== undefined && String(rawPhoneParam).trim()) {
        const rawPhone = String(rawPhoneParam).trim().replace(/[\s.-]/g, '');
        if (!/^(0|\+84)(3|5|7|8|9)[0-9]{8}$/.test(rawPhone)) {
          return jsonResponse({ ok: false, message: 'Số điện thoại liên hệ không hợp lệ (cần 10 số Việt Nam).' }, 400);
        }
        patchPayload.phone = String(rawPhoneParam).trim();
      }
      if (body.studentEmail !== undefined) {
        const cleanEmail = normalizeEmail(body.studentEmail);
        if (cleanEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || isSyntheticPlaceholderEmail(cleanEmail))) {
          return jsonResponse({ ok: false, message: 'Email đăng nhập không hợp lệ.' }, 400);
        }
        patchPayload.student_email = cleanEmail;
      }
      if (body.parentName !== undefined) {
        nextMeta.parent_name = String(body.parentName).trim();
      }
      if (body.courseId !== undefined && String(body.courseId).trim() !== existingOrd.course_id) {
        const coursePricing = await resolveServerCoursePrice(env, body.courseId);
        if (!coursePricing.validCourse) {
          return jsonResponse({ ok: false, message: 'Mã khóa học không hợp lệ.' }, 400);
        }
        patchPayload.course_id = coursePricing.courseId;
        patchPayload.course_name = coursePricing.title;
        patchPayload.amount = coursePricing.price;
      }

      if (body.contactStatus !== undefined) {
        const allowedContact = new Set(['not_called', 'called', 'no_answer', 'callback', 'callback_scheduled']);
        const cs = String(body.contactStatus).trim();
        if (allowedContact.has(cs)) {
          nextMeta.contact_status = cs;
          nextMeta.contact_updated_at = nowIso;
          nextMeta.contact_updated_by = session.email;
        }
      }
      const incomingNote = body.contactNote !== undefined ? body.contactNote : body.consultationNote;
      if (incomingNote !== undefined) {
        nextMeta.contact_note = String(incomingNote).trim();
        nextMeta.contact_updated_at = nowIso;
        nextMeta.contact_updated_by = session.email;
      }

      if (body.paymentDetailedStatus !== undefined) {
        const pStatus = String(body.paymentDetailedStatus).trim();
        const orderExpectedAmount = Number(patchPayload.amount ?? existingOrd.amount) || 890000;
        const txRef = body.paymentTxRef !== undefined ? String(body.paymentTxRef).trim() : nextMeta.payment_tx_ref;
        const receivedAmt = body.paymentReceivedAmount !== undefined
          ? Number(body.paymentReceivedAmount)
          : (nextMeta.payment_received_amount ?? orderExpectedAmount);

        if (pStatus === 'verified_paid') {
          if (!txRef) {
            return jsonResponse({
              ok: false,
              error: 'MISSING_TX_REF',
              message: 'Vui lòng nhập Mã tham chiếu giao dịch (Transaction ID / Nội dung sao kê) trước khi xác nhận đã nhận tiền.'
            }, 400);
          }
          if (!Number.isFinite(receivedAmt) || receivedAmt < orderExpectedAmount) {
            return jsonResponse({
              ok: false,
              error: 'AMOUNT_MISMATCH',
              message: `Số tiền thực nhận (${receivedAmt || 0}đ) nhỏ hơn giá trị đơn hàng (${orderExpectedAmount}đ). Vui lòng chọn trạng thái "Thanh toán sai/thiếu".`
            }, 400);
          }
          patchPayload.payment_status = 'paid';
          nextMeta.payment_sub_status = 'verified_paid';
          nextMeta.payment_verified_by = session.email;
          nextMeta.payment_verified_at = nowIso;
          nextMeta.payment_tx_ref = txRef;
          nextMeta.payment_received_amount = receivedAmt;
          nextMeta.payment_proof_auto = false;
        } else if (pStatus === 'refunded') {
          patchPayload.payment_status = 'refunded';
          patchPayload.approval_status = 'cancelled';
          nextMeta.payment_sub_status = 'refunded';
          if (txRef) nextMeta.payment_tx_ref = txRef;
        } else if (pStatus === 'mismatch' || pStatus === 'amount_mismatch') {
          patchPayload.payment_status = 'pending_verification';
          nextMeta.payment_sub_status = 'amount_mismatch';
          if (txRef !== undefined) nextMeta.payment_tx_ref = txRef;
          if (Number.isFinite(receivedAmt)) nextMeta.payment_received_amount = receivedAmt;
        } else if (
          pStatus === 'customer_reported' ||
          pStatus === 'checking_tx' ||
          pStatus === 'verifying_tx' ||
          pStatus === 'unpaid'
        ) {
          // Không bao giờ tự coi "khách báo đã chuyển khoản" là "đã nhận tiền"
          patchPayload.payment_status = 'pending_verification';
          nextMeta.payment_sub_status = pStatus === 'checking_tx' ? 'verifying_tx' : pStatus;
          if (txRef !== undefined) nextMeta.payment_tx_ref = txRef;
          if (body.paymentReceivedAmount !== undefined && Number.isFinite(receivedAmt)) {
            nextMeta.payment_received_amount = receivedAmt;
          }
        }
      } else {
        if (body.paymentTxRef !== undefined) {
          nextMeta.payment_tx_ref = String(body.paymentTxRef).trim();
        }
        if (body.paymentReceivedAmount !== undefined) {
          nextMeta.payment_received_amount = Number(body.paymentReceivedAmount);
        }
      }

      if (body.credentialHandedOff !== undefined) {
        nextMeta.credential_handed_off = Boolean(body.credentialHandedOff);
        nextMeta.credential_handed_off_at = body.credentialHandedOff ? nowIso : null;
        nextMeta.credential_handed_off_by = body.credentialHandedOff ? session.email : null;
      }

      if (body.cancelOrder === true) {
        patchPayload.approval_status = 'cancelled';
      } else if (body.restoreOrder === true && existingOrd.approval_status === 'cancelled') {
        patchPayload.approval_status = 'pending';
      }

      const nextCustomerNote = body.customerNote !== undefined ? String(body.customerNote).trim() : prevCustomerNote;
      patchPayload.note = serializeOrderNoteWithMeta(nextCustomerNote, nextMeta);

      const patchRes = await supabaseRequest(env, `ktn_orders?order_id=eq.${encodeURIComponent(orderId)}`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: patchPayload
      });

      if (!patchRes || !patchRes.ok || !Array.isArray(patchRes.data) || !patchRes.data[0]) {
        return jsonResponse({
          ok: false,
          retryable: true,
          message: 'Không thể lưu cập nhật đơn hàng vào cơ sở dữ liệu Supabase.'
        }, 502);
      }

      return jsonResponse({
        ok: true,
        order: enrichOrderForResponse(patchRes.data[0]),
        message: 'Đã cập nhật thông tin đơn hàng thành công.'
      });
    }

    if (path === '/api/ktn/orders' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || session.role !== 'admin') {
        return jsonResponse({ ok: false, message: 'Chỉ Quản lý (Admin) mới được xem danh sách đơn hàng.' }, 403);
      }
      const q = normalizeViSearchText(url.searchParams.get('q') || '');
      const paymentFilter = String(url.searchParams.get('paymentStatus') || '').trim();
      const approvalFilter = String(url.searchParams.get('approvalStatus') || '').trim();
      const filterPreset = String(url.searchParams.get('filterPreset') || '').trim();

      const [sbRes, stuRes] = await Promise.all([
        supabaseRequest(env, 'ktn_orders?select=*&order=created_at.desc&limit=500'),
        supabaseRequest(env, 'ktn_students?select=code,email,name,phone,cognito_user_id,class_code,online_courses&limit=1000')
      ]);
      if (!sbRes || !sbRes.ok) {
        return jsonResponse({
          ok: false,
          retryable: true,
          message: 'Chưa tải được danh sách đơn hàng từ cơ sở dữ liệu Supabase.'
        }, sbRes?.status || 503);
      }

      const existingStudentMap = new Map();
      if (stuRes && stuRes.ok && Array.isArray(stuRes.data)) {
        stuRes.data.forEach(s => {
          const em = normalizeEmail(s?.email || '');
          if (em) existingStudentMap.set(em, s);
        });
      }

      let orders = (Array.isArray(sbRes.data) ? sbRes.data : []).map(ord => enrichOrderForResponse(ord, existingStudentMap));

      if (paymentFilter && paymentFilter !== 'ALL') {
        orders = orders.filter(o => o.payment_status === paymentFilter);
      }
      if (approvalFilter && approvalFilter !== 'ALL') {
        orders = orders.filter(o => o.approval_status === approvalFilter);
      }
      if (filterPreset && filterPreset !== 'ALL') {
        orders = orders.filter(o => {
          const isCancelledOrRefunded = o.approval_status === 'cancelled' || o.payment_status === 'refunded' || o.payment_detailed_status === 'refunded';
          const isError =
            o.provisioningStatus === 'partial_failure' ||
            o.provisioningStatus === 'sync_failed' ||
            o.payment_detailed_status === 'mismatch' ||
            o.payment_detailed_status === 'amount_mismatch';
          const isActivated = o.approval_status === 'approved' && o.provisioningStatus === 'synced';
          switch (filterPreset) {
            case 'NEW':
              return !isCancelledOrRefunded && o.approval_status === 'pending' && o.contact_status === 'not_called' && o.payment_status !== 'paid';
            case 'NOT_CALLED':
              return !isCancelledOrRefunded && o.contact_status === 'not_called';
            case 'CALLED_WAITING_PAYMENT':
              return !isCancelledOrRefunded && o.approval_status === 'pending' && o.contact_status !== 'not_called' && o.payment_status !== 'paid';
            case 'PAID_WAITING_APPROVAL':
              return !isCancelledOrRefunded && o.payment_status === 'paid' && o.approval_status !== 'approved';
            case 'ACTIVATED':
              return isActivated;
            case 'NEEDS_ERROR_HANDLING':
              return isError;
            case 'CANCELLED_REFUNDED':
              return isCancelledOrRefunded;
            default:
              return true;
          }
        });
      }
      if (q) {
        const tokens = q.split(' ').filter(Boolean);
        orders = orders.filter(o => {
          const hay = normalizeViSearchText([
            o.order_id,
            o.student_name,
            o.parent_name,
            o.student_email,
            o.raw_student_email,
            o.phone,
            o.course_name,
            o.payment_tx_ref
          ].join(' '));
          return tokens.every(tok => hay.includes(tok));
        });
      }
      return jsonResponse({ ok: true, orders, totalCount: orders.length });
    }

    if (path === '/api/ktn/orders/approve' && request.method === 'POST') {
      // Giải quyết triệt để BUG BE-03 & BE-04 + Gác cổng kích hoạt Phase 2.3:
      // Chỉ kích hoạt khi Đơn hợp lệ, Khóa học & số tiền đúng, Thanh toán đã được xác minh, Email đăng nhập đã xác định, và Tư vấn đã xử lý
      const session = await extractSessionFromRequest(request, env);
      if (!session || session.role !== 'admin') {
        return jsonResponse({ ok: false, message: 'Chỉ Quản lý (Admin) mới có quyền Xác nhận & Kích hoạt khóa học.' }, 403);
      }
      const body = await request.json().catch(() => ({}));
      const orderId = String(body.orderId || '').trim();
      if (!orderId) return jsonResponse({ ok: false, message: 'Thiếu mã đơn hàng orderId.' }, 400);

      const ordLookup = await supabaseRequest(env, `ktn_orders?order_id=eq.${encodeURIComponent(orderId)}&limit=1`);
      const existingOrd = (ordLookup.ok && Array.isArray(ordLookup.data) && ordLookup.data[0]) ? ordLookup.data[0] : null;
      const mergedOrd = existingOrd ? { ...(body.order || {}), ...existingOrd } : (body.order || null);
      const overrideEmail = body.studentEmail ? normalizeEmail(body.studentEmail) : '';
      if (overrideEmail && mergedOrd) {
        const { meta: preMeta } = extractOrderMetaFromRow(mergedOrd);
        const canUpdateEmail =
          preMeta.source !== 'authenticated_student' &&
          mergedOrd.approval_status !== 'approved' &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(overrideEmail) &&
          !isSyntheticPlaceholderEmail(overrideEmail);
        if (canUpdateEmail && normalizeEmail(mergedOrd.student_email || '') !== overrideEmail) {
          mergedOrd.student_email = overrideEmail;
          if (existingOrd) {
            await supabaseRequest(env, `ktn_orders?order_id=eq.${encodeURIComponent(orderId)}`, {
              method: 'PATCH',
              body: { student_email: overrideEmail, updated_at: new Date().toISOString() }
            });
          }
        }
      }

      if (mergedOrd) {
        const { meta: ordMeta } = extractOrderMetaFromRow(mergedOrd);
        const enforcePolicyGate = Boolean(body.confirmActivation || body.enforcePolicy || ordMeta.v2_managed);
        if (enforcePolicyGate) {
          const blockReasons = [];
          if (mergedOrd.approval_status === 'cancelled' || mergedOrd.payment_status === 'refunded') {
            blockReasons.push('Đơn hàng đã hủy hoặc đã hoàn tiền.');
          }
          const courseCheck = await resolveServerCoursePrice(env, mergedOrd.course_id);
          const isAmountValid =
            Number(mergedOrd.amount) > 0 &&
            Number(mergedOrd.amount) === Number(courseCheck.price);
          if (!courseCheck.validCourse || !isAmountValid) {
            blockReasons.push('Khóa học hoặc số tiền đơn hàng không hợp lệ.');
          }
          const candidateEmail = normalizeEmail(
            (ordMeta.source === 'authenticated_student' ? mergedOrd.student_email : (overrideEmail || mergedOrd.student_email)) || ''
          );
          if (!candidateEmail || isSyntheticPlaceholderEmail(candidateEmail) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail)) {
            blockReasons.push('Chưa xác định Email đăng nhập hợp lệ cho học viên.');
          }
          const isPaymentVerified =
            mergedOrd.payment_status === 'paid' &&
            ordMeta.payment_sub_status !== 'mismatch' &&
            ordMeta.payment_sub_status !== 'amount_mismatch';
          if (!isPaymentVerified) {
            blockReasons.push('Thanh toán chưa được xác minh thực nhận (không tự động kích hoạt khi chưa đối chiếu tiền thực nhận).');
          }
          const requiresCareCheck = ordMeta.source === 'website' && !ordMeta.payment_proof_auto && body.requireConsultation !== false;
          const consultationHandled =
            ordMeta.contact_status === 'called' ||
            Boolean(String(ordMeta.contact_note || '').trim());
          if (requiresCareCheck && !consultationHandled) {
            blockReasons.push('Trạng thái tư vấn chưa được xử lý (cần liên hệ/xác nhận với phụ huynh trước khi kích hoạt).');
          }
          if (blockReasons.length > 0) {
            return jsonResponse({
              ok: false,
              error: 'ORDER_ACTIVATION_POLICY_BLOCKED',
              reasons: blockReasons,
              message: blockReasons.join(' ')
            }, 400);
          }
        }
      }

      const paymentStatusOverride = body.paymentStatus
        ? String(body.paymentStatus).trim()
        : (body.markPaid === true ? 'paid' : undefined);

      const result = await approveAndProvisionOrder(env, {
        orderId,
        orderInput: mergedOrd || body.order || null,
        approvedBy: session.email,
        paymentStatusOverride,
        classCode: body.classCode
      });

      const { httpStatus, ...payload } = result;
      return jsonResponse(payload, httpStatus || (result.ok ? 200 : 502));
    }

    // ------------------------------------------------------------------------
    // D. WEBHOOK THANH TOÁN VIETQR TỰ ĐỘNG & CẤU HÌNH BẢNG GIÁ
    // ------------------------------------------------------------------------
    if (path === '/api/ktn/payment-config') {
      if (request.method === 'GET') {
        const res = await supabaseRequest(env, 'ktn_payment_config?id=eq.default&limit=1');
        return jsonResponse({ ok: true, config: (Array.isArray(res.data) && res.data[0]) || null });
      }
      if (request.method === 'PUT') {
        const session = await extractSessionFromRequest(request, env);
        if (!session || session.role !== 'admin') {
          return jsonResponse({ ok: false, message: 'Chỉ Admin mới được sửa cấu hình Giá & VietQR.' }, 403);
        }
        const body = await request.json().catch(() => ({}));
        const configBody = {
          id: 'default',
          bank_id: body.bankId || 'MB',
          bank_name: body.bankName || 'MBBank',
          account_no: body.accountNo || '',
          account_name: body.accountName || 'HOC VIEN KHONG TU NHI',
          default_amount: Number(body.defaultAmount) || 890000,
          auto_approve_webhook: Boolean(body.autoApproveWebhook),
          course_prices: body.coursePrices || undefined,
          updated_at: new Date().toISOString(),
          updated_by: session.email
        };
        const res = await supabaseRequest(env, 'ktn_payment_config?id=eq.default', {
          method: 'PATCH',
          prefer: 'return=representation',
          body: configBody
        });
        // Giải quyết BUG BE-07: Kiểm tra kết quả ghi vào Supabase
        if (!res || !res.ok) {
          return jsonResponse({
            ok: false,
            retryable: true,
            error: 'SUPABASE_PAYMENT_CONFIG_SAVE_FAILED',
            message: 'Không thể lưu cấu hình thanh toán vào cơ sở dữ liệu Supabase. Vui lòng thử lại.'
          }, 502);
        }
        return jsonResponse({ ok: true, config: (Array.isArray(res.data) && res.data[0]) || configBody });
      }
    }

    if (path === '/api/ktn/webhook/payment' && request.method === 'POST') {
      // Giải quyết triệt để BUG BE-04 + Phase 1.9 / 2.3:
      // - Đối chiếu Mã đơn (orderId), Số tiền thực nhận (receivedAmount) và Mã giao dịch (transactionId)
      // - Chống xử lý trùng cùng 1 transactionId (kể cả trên cùng đơn hoặc giữa các đơn khác nhau)
      // - Nếu thanh toán thiếu/sai tiền -> đánh dấu mismatch, KHÔNG đánh dấu paid và KHÔNG kích hoạt khóa học
      // - Chỉ tự kích hoạt khi auto_approve_webhook = true VÀ đơn có email đăng nhập thật hợp lệ
      const authHeader = String(request.headers.get('Authorization') || '').trim();
      const bearerSecret = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
      const secret = request.headers.get('X-KTN-Webhook-Secret') || bearerSecret || '';
      if (!env.KTN_WEBHOOK_SECRET || secret !== env.KTN_WEBHOOK_SECRET) {
        return jsonResponse({ ok: false, message: 'Unauthorized webhook' }, 401);
      }
      const payload = await request.json().catch(() => ({}));
      const content = String(payload.content || payload.description || '');
      const ordMatch = content.match(/ORD-\d{6}/i) || String(payload.orderId || '').match(/ORD-\d{6}/i);
      if (!ordMatch) {
        return jsonResponse({ ok: true, skipped: true, reason: 'Không tìm thấy mã đơn ORD-xxxxxx trong nội dung CK' });
      }
      const orderId = ordMatch[0].toUpperCase();

      if (payload.currency !== undefined && payload.currency !== null && String(payload.currency).trim() !== '') {
        const normCurrency = String(payload.currency).trim().toUpperCase();
        if (normCurrency !== 'VND' && normCurrency !== 'VNĐ') {
          return jsonResponse({
            ok: false,
            orderId,
            currency: payload.currency,
            error: 'WEBHOOK_CURRENCY_MISMATCH',
            message: `Đơn vị tiền tệ không hợp lệ (${payload.currency}). Hệ thống chỉ chấp nhận VND.`
          }, 422);
        }
      }

      const [ordLookup, cfgRes] = await Promise.all([
        supabaseRequest(env, `ktn_orders?order_id=eq.${encodeURIComponent(orderId)}&limit=1`),
        supabaseRequest(env, 'ktn_payment_config?id=eq.default&limit=1')
      ]);
      const existingOrd = (ordLookup.ok && Array.isArray(ordLookup.data) && ordLookup.data[0]) ? ordLookup.data[0] : null;
      if (!existingOrd) {
        return jsonResponse({
          ok: false,
          skipped: true,
          orderId,
          reason: 'ORDER_NOT_FOUND',
          message: 'Không tìm thấy đơn hàng ' + orderId
        }, 404);
      }

      const autoApprove = Boolean(Array.isArray(cfgRes.data) && cfgRes.data[0]?.auto_approve_webhook);
      const expectedAmount = Number(existingOrd.amount) || 890000;

      // Trích xuất số tiền thực nhận từ trường số hoặc từ nội dung biến động số dư ngân hàng
      let receivedAmount = null;
      const directAmt = payload.transferAmount ?? payload.amount ?? payload.totalAmount ?? payload.value;
      if (directAmt !== undefined && directAmt !== null && String(directAmt).trim() !== '') {
        const parsedDirect = Number(String(directAmt).replace(/[,.\s]/g, ''));
        if (Number.isFinite(parsedDirect)) receivedAmount = parsedDirect;
      }
      if (receivedAmount === null && content) {
        const amtMatch =
          content.match(/(?:nhan|nhận|chuyen|chuyển|ck|so tien|số tiền|\+)\s*([0-9][0-9.,]*)\s*(?:vnd|vnđ|đ|d)\b/i) ||
          content.match(/\b([1-9][0-9]{4,9})\s*(?:vnd|vnđ|đ|d)\b/i);
        if (amtMatch && amtMatch[1]) {
          const parsedContentAmt = Number(amtMatch[1].replace(/[.,\s]/g, ''));
          if (Number.isFinite(parsedContentAmt)) receivedAmount = parsedContentAmt;
        }
      }

      const rawTxId = String(
        payload.transactionId || payload.id || payload.reference || payload.txId || payload.referenceCode || ''
      ).trim();
      const { customerNote, meta: prevMeta } = extractOrderMetaFromRow(existingOrd);
      if (!rawTxId && prevMeta.v2_managed && !/\bTK\s+\d+/i.test(content)) {
        return jsonResponse({
          ok: false,
          orderId,
          error: 'MISSING_TRANSACTION_ID',
          message: 'Webhook thiếu mã giao dịch ngân hàng (transactionId / referenceCode).'
        }, 400);
      }
      const transactionId = rawTxId || `WH-${orderId}-${receivedAmount ?? 'NA'}`;

      const processedTxIds = Array.isArray(prevMeta.processed_tx_ids) ? prevMeta.processed_tx_ids : [];
      if (processedTxIds.includes(transactionId) && existingOrd.payment_status === 'paid') {
        return jsonResponse({
          ok: true,
          orderId,
          transactionId,
          duplicateTransaction: true,
          idempotentReplay: true,
          paymentStatus: 'paid',
          autoApproved: existingOrd.approval_status === 'approved',
          syncStatus: existingOrd.approval_status === 'approved' ? 'synced' : 'payment_recorded_pending_approval'
        });
      }

      // Chống dùng lại cùng 1 transactionId của đơn khác (cross-order replay attack)
      if (rawTxId) {
        try {
          const recentOrdersRes = await supabaseRequest(env, 'ktn_orders?order=created_at.desc&limit=200');
          if (recentOrdersRes.ok && Array.isArray(recentOrdersRes.data)) {
            const conflictingOrd = recentOrdersRes.data.find(row => {
              const rowId = String(row.order_id || row.id || '').toUpperCase();
              if (!rowId || rowId === orderId) return false;
              const { meta: rMeta } = extractOrderMetaFromRow(row);
              const rTxIds = Array.isArray(rMeta.processed_tx_ids) ? rMeta.processed_tx_ids : [];
              return rTxIds.includes(rawTxId) || (row.payment_status === 'paid' && rMeta.payment_tx_ref === rawTxId);
            });
            if (conflictingOrd) {
              return jsonResponse({
                ok: false,
                orderId,
                transactionId: rawTxId,
                duplicateTransaction: true,
                conflictingOrderId: conflictingOrd.order_id || conflictingOrd.id,
                error: 'DUPLICATE_TRANSACTION_ID',
                message: `Mã giao dịch ${rawTxId} đã được sử dụng cho đơn hàng ${conflictingOrd.order_id || conflictingOrd.id}.`
              }, 409);
            }
          }
        } catch {}
      }

      const nowIso = new Date().toISOString();

      // Kiểm tra đối chiếu số tiền thực nhận với giá trị đơn hàng
      if (receivedAmount === null || receivedAmount < expectedAmount) {
        const mismatchMeta = {
          ...prevMeta,
          payment_sub_status: 'mismatch',
          payment_tx_ref: transactionId,
          payment_received_amount: receivedAmount,
          payment_proof_auto: false
        };
        await supabaseRequest(env, `ktn_orders?order_id=eq.${encodeURIComponent(orderId)}`, {
          method: 'PATCH',
          prefer: 'return=representation',
          body: {
            payment_status: 'pending_verification',
            note: serializeOrderNoteWithMeta(customerNote, mismatchMeta),
            updated_at: nowIso
          }
        });
        return jsonResponse({
          ok: false,
          orderId,
          transactionId,
          paymentStatus: 'mismatch',
          expectedAmount,
          receivedAmount,
          autoApproved: false,
          error: 'WEBHOOK_AMOUNT_MISMATCH',
          message: `Số tiền nhận được (${receivedAmount ?? 'không xác định'}) nhỏ hơn số tiền đơn hàng (${expectedAmount}). Đơn chuyển sang trạng thái Thanh toán sai/thiếu để Admin kiểm tra.`
        }, 422);
      }

      const nextProcessedTxIds = Array.from(new Set([...processedTxIds, transactionId]));
      const verifiedMeta = {
        ...prevMeta,
        payment_sub_status: 'verified_paid',
        payment_verified_by: 'webhook:auto',
        payment_verified_at: nowIso,
        payment_tx_ref: transactionId,
        payment_received_amount: receivedAmount,
        payment_proof_auto: true,
        processed_tx_ids: nextProcessedTxIds
      };

      const paidPatchRes = await supabaseRequest(env, `ktn_orders?order_id=eq.${encodeURIComponent(orderId)}`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: {
          payment_status: 'paid',
          note: serializeOrderNoteWithMeta(customerNote, verifiedMeta),
          updated_at: nowIso
        }
      });

      if (!paidPatchRes || !paidPatchRes.ok) {
        return jsonResponse({
          ok: false,
          orderId,
          transactionId,
          retryable: true,
          syncStatus: 'payment_update_failed',
          error: 'SUPABASE_ORDER_PAYMENT_UPDATE_FAILED',
          message: 'Chưa lưu được trạng thái đã thanh toán cho đơn ' + orderId
        }, 502);
      }

      const updatedOrd = (Array.isArray(paidPatchRes.data) && paidPatchRes.data[0]) || existingOrd;
      const hasValidLoginEmail = !isSyntheticPlaceholderEmail(updatedOrd.student_email);

      if (autoApprove && hasValidLoginEmail) {
        if (updatedOrd && updatedOrd.approval_status === 'approved' && updatedOrd.assigned_user_id) {
          await mergeAndUpsertStudentCourses(env, {
            email: updatedOrd.student_email,
            name: updatedOrd.student_name,
            phone: updatedOrd.phone || '',
            cognitoUserId: updatedOrd.assigned_user_id,
            izteachStudentId: updatedOrd.assigned_student_id,
            addCourseIds: resolveOrderCourseIds(updatedOrd.course_id || DEFAULT_COURSE_ID),
            codeHint: 'KTN-' + orderId.replace(/^ORD-/, ''),
            accountStatus: 'active',
            syncStatus: 'synced'
          });
          return jsonResponse({
            ok: true,
            orderId,
            transactionId,
            paymentStatus: 'paid',
            autoApproved: true,
            idempotentReplay: true,
            syncStatus: 'synced'
          });
        }

        const approveResult = await approveAndProvisionOrder(env, {
          orderId,
          orderInput: updatedOrd,
          approvedBy: 'webhook:auto',
          paymentStatusOverride: 'paid'
        });

        if (!approveResult.ok) {
          return jsonResponse({
            ok: false,
            orderId,
            transactionId,
            paymentStatus: 'paid',
            autoApproved: false,
            retryable: true,
            syncStatus: approveResult.syncStatus || 'partial_failure',
            completedSteps: ['payment_verified', ...(approveResult.completedSteps || [])],
            failedStep: approveResult.failedStep || 'auto_approve_provision',
            error: approveResult.error || 'AUTO_APPROVE_FAILED',
            message: 'Đã ghi nhận thanh toán nhưng cấp quyền tự động chưa hoàn tất: ' + (approveResult.message || '')
          }, approveResult.httpStatus || 502);
        }

        return jsonResponse({
          ok: true,
          orderId,
          transactionId,
          paymentStatus: 'paid',
          autoApproved: true,
          syncStatus: 'synced',
          operationId: approveResult.operationId,
          completedSteps: ['payment_verified', ...(approveResult.completedSteps || [])],
          cognitoUserId: approveResult.cognitoUserId,
          studentEmail: approveResult.studentEmail,
          grantedCourseIds: approveResult.grantedCourseIds,
          student: approveResult.student
        });
      }

      return jsonResponse({
        ok: true,
        orderId,
        transactionId,
        paymentStatus: 'paid',
        autoApproved: false,
        syncStatus: hasValidLoginEmail ? 'payment_recorded_pending_approval' : 'payment_recorded_missing_email'
      });
    }

    // ------------------------------------------------------------------------
    // D2. TRUNG TÂM ĐỐI SOÁT 3 HỆ THỐNG (WEB KTN <-> SUPABASE <-> IZTEACH)
    // GET /api/ktn/admin/sync-status | POST /api/ktn/admin/sync-check | POST /api/ktn/sync/reconcile | POST /api/ktn/admin/sync-retry
    // ------------------------------------------------------------------------
    if (
      (path === '/api/ktn/admin/sync-status' && request.method === 'GET') ||
      ((path === '/api/ktn/admin/sync-check' || path === '/api/ktn/sync/reconcile') && request.method === 'POST')
    ) {
      const session = await extractSessionFromRequest(request, env);
      if (!session || session.role !== 'admin') {
        return jsonResponse({ ok: false, message: 'Chỉ Quản lý (Admin) mới được xem trạng thái đối soát đồng bộ 3 hệ thống.' }, 403);
      }

      const reqBody = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
      const dryRun = reqBody.dryRun !== false;
      const repairMode = Boolean(reqBody.repairMode) && !dryRun;

      const [stuPage1, stuPage2, teaRes, clsRes, ordRes, hwRes, jobRes, dlpJobRes] = await Promise.all([
        supabaseRequest(env, 'ktn_students?select=*&order=updated_at.desc&limit=1000&offset=0'),
        supabaseRequest(env, 'ktn_students?select=*&order=updated_at.desc&limit=1000&offset=1000').catch(() => ({ ok: false, data: [] })),
        supabaseRequest(env, 'ktn_teachers?select=*&order=code.asc'),
        supabaseRequest(env, 'ktn_classes?select=*&order=id.asc'),
        supabaseRequest(env, 'ktn_orders?select=*&order=created_at.desc&limit=300'),
        supabaseRequest(env, 'ktn_homeworks?select=*&order=updated_at.desc&limit=200'),
        supabaseRequest(env, 'ktn_provisioning_jobs?select=*&order=updated_at.desc&limit=100').catch(() => ({ ok: false, data: [] })),
        supabaseRequest(env, 'ktn_dlp_alerts?room_id=eq.PROVISIONING_JOB&order=created_at.desc&limit=100').catch(() => ({ ok: false, data: [] }))
      ]);

      const students = [
        ...(Array.isArray(stuPage1?.data) ? stuPage1.data : []),
        ...(Array.isArray(stuPage2?.data) ? stuPage2.data : [])
      ];
      const teachers = Array.isArray(teaRes.data) ? teaRes.data : [];
      const classes = Array.isArray(clsRes.data) ? clsRes.data : [];
      const orders = Array.isArray(ordRes.data) ? ordRes.data : [];
      const homeworks = Array.isArray(hwRes.data) ? hwRes.data : [];
      const dlpJobs = (dlpJobRes && dlpJobRes.ok && Array.isArray(dlpJobRes.data))
        ? dlpJobRes.data.map(row => {
            try { return JSON.parse(row.blocked_content); } catch { return null; }
          }).filter(Boolean)
        : [];
      const dbJobs = [
        ...((jobRes && jobRes.ok && Array.isArray(jobRes.data)) ? jobRes.data : []),
        ...dlpJobs
      ];
      const memJobs = globalThis.__ktnProvisioningJobsMap ? Array.from(globalThis.__ktnProvisioningJobsMap.values()) : [];
      const studentByEmail = new Map();
      const seenStudentCognitoMap = new Map();
      for (const s of students) {
        const em = normalizeEmail(s.email);
        if (em) studentByEmail.set(em, s);
      }

      const driftItems = [];
      let healthyStudentsCount = 0;

      // 1. Kiểm tra từng học viên trong ktn_students
      for (const s of students) {
        const enriched = enrichStudentRowV3(s);
        const hasCognito = isValidCognitoUuid(s.cognito_user_id);
        const courses = Array.isArray(s.online_courses) ? s.online_courses : [];
        if (hasCognito) {
          const prevEm = seenStudentCognitoMap.get(s.cognito_user_id);
          if (prevEm && prevEm !== normalizeEmail(s.email)) {
            const dupReason = `Trùng Cognito User ID (${s.cognito_user_id}) giữa ${s.email} và ${prevEm}.`;
            driftItems.push({
              id: `DRIFT-STU-DUP-${s.email}`,
              driftCode: 'A05_DUPLICATE_STUDENT_PROFILE',
              severity: 'manual_review',
              entityType: 'student',
              entityKey: s.email,
              title: `${s.name || s.email} (${s.email})`,
              detail: dupReason,
              studentName: s.name,
              studentEmail: s.email,
              reason: dupReason,
              retryable: false
            });
          } else {
            seenStudentCognitoMap.set(s.cognito_user_id, normalizeEmail(s.email));
          }
        }
        if (enriched.syncStatus === 'partial_failure' || enriched.syncStatus === 'sync_failed') {
          const reason = s.last_sync_error || 'Đồng bộ quyền học hoặc hồ sơ giữa izTeach và Supabase chưa hoàn tất.';
          driftItems.push({
            id: `DRIFT-STU-ERR-${s.email}`,
            driftCode: 'A03_STUDENT_SYNC_FAILED',
            severity: 'needs_resync',
            entityType: 'student',
            entityKey: s.email,
            title: `${s.name || s.email} (${s.email})`,
            detail: reason,
            studentName: s.name,
            studentEmail: s.email,
            classCode: s.class_code || null,
            syncStatus: enriched.syncStatus,
            accountStatus: enriched.accountStatus,
            reason,
            retryable: true,
            retryAction: { type: 'student_sync', email: s.email }
          });
        } else if (!hasCognito && (courses.length > 0 || s.class_code)) {
          const reason = 'Học viên đã có hồ sơ trên Supabase nhưng chưa có Cognito User ID trên izTeach để đăng nhập.';
          driftItems.push({
            id: `DRIFT-STU-NOCOG-${s.email}`,
            driftCode: 'A01_SUPABASE_WITHOUT_COGNITO',
            severity: 'needs_resync',
            entityType: 'student',
            entityKey: s.email,
            title: `${s.name || s.email} (${s.email})`,
            detail: reason,
            studentName: s.name,
            studentEmail: s.email,
            classCode: s.class_code || null,
            syncStatus: 'pending_activation',
            accountStatus: 'pending_activation',
            reason,
            retryable: true,
            retryAction: { type: 'student_provision', email: s.email, classCode: s.class_code, courseIds: courses.map(c => c.id || c) }
          });
        } else {
          healthyStudentsCount++;
        }
      }

      // 1b. Khi gọi POST /api/ktn/admin/sync-check hoặc /api/ktn/sync/reconcile: đối chiếu trực tiếp với danh sách học viên trên izTeach
      if ((path === '/api/ktn/admin/sync-check' || path === '/api/ktn/sync/reconcile') && request.method === 'POST') {
        try {
          const adminToken = await getIzTeachAdminToken(env);
          if (adminToken) {
            const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
            const izRes = await fetch(
              `${IZTEACH_ENDPOINTS.studentCrm}?vendorId=${encodeURIComponent(vendorId)}`,
              { headers: { Authorization: adminToken } }
            );
            if (izRes && izRes.ok) {
              const izJson = await izRes.json().catch(() => null);
              const izList = extractIzTeachStudentRecords(izJson);
              for (const izItem of izList) {
                const izEm = normalizeEmail(izItem?.email || izItem?.user?.email || '');
                if (!izEm || !izEm.includes('@')) continue;
                if (!studentByEmail.has(izEm)) {
                  const reason = `Học viên ${izItem.name || izEm} (${izEm}) đã có tài khoản trên izTeach nhưng chưa có trong bảng ktn_students trên Supabase.`;
                  driftItems.push({
                    id: `DRIFT-IZ-MISSING-SB-${izEm}`,
                    driftCode: 'A02_IZTEACH_WITHOUT_SUPABASE',
                    severity: 'needs_resync',
                    entityType: 'student',
                    entityKey: izEm,
                    title: `${izItem.name || izEm} (${izEm})`,
                    detail: reason,
                    studentName: izItem.name || izEm,
                    studentEmail: izEm,
                    syncStatus: 'missing_supabase',
                    reason,
                    retryable: true,
                    retryAction: { type: 'student_sync', email: izEm }
                  });
                }
              }
            }
          }
        } catch {}
      }

      // 2. Kiểm tra đơn hàng đã thanh toán / đã duyệt nhưng thiếu hồ sơ học viên hoặc quyền học
      for (const ord of orders) {
        const em = normalizeEmail(ord.student_email);
        const stu = studentByEmail.get(em);
        if (ord.approval_status === 'approved' && (!stu || !isValidCognitoUuid(stu.cognito_user_id))) {
          const reason = `Đơn hàng ${ord.order_id} đã đánh dấu Đã duyệt nhưng học viên ${em} chưa được đồng bộ đầy đủ vào bảng học viên.`;
          driftItems.push({
            id: `DRIFT-ORD-${ord.order_id}`,
            driftCode: 'A08_ORDER_APPROVED_WITHOUT_STUDENT_SYNC',
            severity: 'needs_resync',
            entityType: 'order',
            entityKey: ord.order_id,
            title: `Đơn ${ord.order_id} · ${ord.student_name || em}`,
            detail: reason,
            studentName: ord.student_name,
            studentEmail: em,
            orderId: ord.order_id,
            syncStatus: 'partial_failure',
            reason,
            retryable: true,
            retryAction: { type: 'order_approve', orderId: ord.order_id }
          });
        } else if (ord.payment_status === 'paid' && ord.approval_status !== 'approved') {
          const reason = `Đơn hàng ${ord.order_id} đã nhận thanh toán (paid) nhưng chưa kích hoạt khóa học cho học viên.`;
          driftItems.push({
            id: `DRIFT-ORD-PAID-${ord.order_id}`,
            driftCode: 'A07_ORDER_PAID_PENDING_PROVISIONING',
            severity: 'needs_resync',
            entityType: 'order',
            entityKey: ord.order_id,
            title: `Đơn ${ord.order_id} · ${ord.student_name || em}`,
            detail: reason,
            studentName: ord.student_name,
            studentEmail: em,
            orderId: ord.order_id,
            syncStatus: 'pending',
            reason,
            retryable: true,
            retryAction: { type: 'order_approve', orderId: ord.order_id }
          });
        }
      }

      // 3. Kiểm tra giáo viên chưa hoàn tất kích hoạt ngoài hoặc lớp gắn với giáo viên ngừng hoạt động
      const teacherByEmail = new Map();
      for (const t of teachers) {
        const tem = normalizeEmail(t.email);
        if (tem) teacherByEmail.set(tem, t);
        if (t.active && t.provisioning_status === 'pending_external_provisioning') {
          const reason = `Giáo viên ${t.name} (${t.email}) đã có trong Supabase nhưng chưa đồng bộ tài khoản izTeach.`;
          driftItems.push({
            id: `DRIFT-TEA-${t.email}`,
            driftCode: 'A09_TEACHER_PENDING_EXTERNAL_PROVISIONING',
            severity: 'manual_review',
            entityType: 'teacher',
            entityKey: t.email,
            title: `${t.name || t.email} (${t.email})`,
            detail: reason,
            teacherName: t.name,
            teacherEmail: t.email,
            syncStatus: 'pending_activation',
            reason,
            retryable: true,
            retryAction: { type: 'teacher_provision', email: t.email, code: t.code, name: t.name }
          });
        }
      }

      for (const cls of classes) {
        if (cls.active === false) continue;
        const tem = normalizeEmail(cls.teacher_email || '');
        if (!tem) continue;
        const assignedTeacher = teacherByEmail.get(tem);
        if (assignedTeacher && assignedTeacher.active === false) {
          const reason = `Lớp ${cls.id} đang gắn với giáo viên ${assignedTeacher.name || tem} đã ngừng hoạt động (active=false).`;
          driftItems.push({
            id: `DRIFT-CLS-INACTIVE-TEA-${cls.id}`,
            driftCode: 'A10_CLASS_ASSIGNED_TO_INACTIVE_TEACHER',
            severity: 'manual_review',
            entityType: 'class',
            entityKey: cls.id,
            title: `Lớp ${cls.id} · GV ${assignedTeacher.name || tem}`,
            detail: reason,
            reason,
            retryable: false
          });
        }
      }

      // 4. Kiểm tra bài tập khóa video bị lỗi đồng bộ sang izTeach
      for (const hw of homeworks) {
        const syncMeta = hw.workbook_answers?._syncMeta || {};
        const st = hw.sync_status || syncMeta.syncStatus || '';
        if (st === 'sync_failed' || st === 'mapping_required') {
          const reason = syncMeta.lastError || `Bài nộp ${hw.id} chưa đồng bộ được sang izTeach (${st}).`;
          driftItems.push({
            id: `DRIFT-HW-${hw.id}`,
            driftCode: st === 'mapping_required' ? 'A12_HOMEWORK_UNIT_MAPPING_REQUIRED' : 'A11_HOMEWORK_MIRROR_FAILED',
            severity: st === 'mapping_required' ? 'manual_review' : 'needs_resync',
            entityType: 'homework',
            entityKey: hw.id,
            title: `Bài tập ${hw.id} · ${hw.student_name || hw.student_email}`,
            detail: reason,
            studentName: hw.student_name,
            studentEmail: hw.student_email,
            homeworkId: hw.id,
            courseId: hw.course_id,
            lessonNum: hw.lesson_num,
            syncStatus: st,
            reason,
            retryable: st !== 'mapping_required',
            retryAction: { type: 'homework_sync', homeworkId: hw.id }
          });
        }
      }

      // 5. Kiểm tra các job provisioning bị lỗi trong bộ nhớ hoặc DB
      const seenJobIds = new Set();
      for (const j of [...memJobs, ...dbJobs]) {
        if (!j || !j.operation_id || seenJobIds.has(j.operation_id)) continue;
        seenJobIds.add(j.operation_id);
        if (j.status === 'partial_failure' || j.status === 'failed') {
          const alreadyListed = driftItems.some(d => d.entityKey === j.target_email || d.orderId === j.request_payload?.orderId);
          if (!alreadyListed) {
            const reason = j.error_message || `Tác vụ ${j.operation_id} dừng ở bước ${j.failed_step || 'unknown'}.`;
            driftItems.push({
              id: `DRIFT-JOB-${j.operation_id}`,
              driftCode: 'B10_PROVISIONING_JOB_INCOMPLETE',
              severity: 'needs_resync',
              entityType: j.target_role || 'student',
              entityKey: j.target_email || j.operation_id,
              title: `Tác vụ ${j.operation_id} (${j.target_email || 'system'})`,
              detail: reason,
              operationId: j.operation_id,
              syncStatus: j.sync_status || 'partial_failure',
              reason,
              retryable: Boolean(j.retryable !== false),
              retryAction: {
                type: j.job_type === 'order_approve' ? 'order_approve' : 'student_sync',
                operationId: j.operation_id,
                email: j.target_email,
                orderId: j.request_payload?.orderId
              }
            });
          }
        }
      }

      const needsResyncCount = driftItems.filter(d => d.severity === 'needs_resync' || d.severity === 'error').length;
      const manualReviewCount = driftItems.filter(d => d.severity === 'manual_review' || d.severity === 'warning').length;

      return jsonResponse({
        ok: true,
        dryRun,
        repairMode,
        checkedAt: new Date().toISOString(),
        summary: {
          healthyCount: healthyStudentsCount,
          needsResyncCount,
          manualReviewCount,
          totalStudents: students.length,
          totalTeachers: teachers.length,
          totalOrders: orders.length,
          driftTotal: driftItems.length,
          totalDriftItems: driftItems.length
        },
        lastBulkSync: globalThis.__ktnLastSyncState || null,
        driftItems,
        recentEvents: (globalThis.__ktnRecentSyncEvents || []).slice(0, 30)
      });
    }

    if (path === '/api/ktn/admin/sync-retry' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || session.role !== 'admin') {
        return jsonResponse({ ok: false, message: 'Chỉ Quản lý (Admin) mới được thực hiện đồng bộ lại.' }, 403);
      }
      const body = await request.json().catch(() => ({}));
      const retryType = String(body.type || body.action || '').trim().toLowerCase();
      const targetEmail = normalizeEmail(body.email || body.studentEmail || '');
      const orderId = String(body.orderId || '').trim();
      const homeworkId = String(body.homeworkId || '').trim();

      if (retryType === 'order_approve' || orderId) {
        const res = await approveAndProvisionOrder(env, {
          orderId,
          approvedBy: session.email,
          operationId: body.operationId
        });
        const { httpStatus, ...payload } = res;
        return jsonResponse(payload, httpStatus || (res.ok ? 200 : 502));
      }

      if (retryType === 'homework_sync' || homeworkId) {
        const hwLookup = await supabaseRequest(env, `ktn_homeworks?id=eq.${encodeURIComponent(homeworkId)}&limit=1`);
        const hw = (hwLookup.ok && Array.isArray(hwLookup.data) && hwLookup.data[0]) ? hwLookup.data[0] : null;
        if (!hw) {
          return jsonResponse({ ok: false, message: 'Không tìm thấy bản ghi bài tập ' + homeworkId }, 404);
        }
        const mirrorRes = await mirrorHomeworkToIzTeach(env, hw, hw.status === 'graded');
        const nextWb = {
          ...(hw.workbook_answers || {}),
          _syncMeta: {
            ...((hw.workbook_answers && hw.workbook_answers._syncMeta) || {}),
            syncStatus: mirrorRes.ok ? 'synced' : 'sync_failed',
            izteachRemoteId: mirrorRes.remoteId || null,
            lastSyncedAt: mirrorRes.ok ? new Date().toISOString() : null,
            lastError: mirrorRes.ok ? null : (mirrorRes.reason || mirrorRes.error || 'SYNC_FAILED')
          }
        };
        await supabaseRequest(env, `ktn_homeworks?id=eq.${encodeURIComponent(homeworkId)}`, {
          method: 'PATCH',
          body: { workbook_answers: nextWb, updated_at: new Date().toISOString() }
        });
        return jsonResponse({
          ok: mirrorRes.ok,
          homeworkId,
          syncStatus: mirrorRes.ok ? 'synced' : 'sync_failed',
          mirrorResult: mirrorRes,
          message: mirrorRes.ok ? 'Đã đồng bộ lại bài tập sang izTeach thành công!' : 'Chưa đồng bộ được bài tập sang izTeach.'
        }, mirrorRes.ok ? 200 : 502);
      }

      if (retryType === 'teacher_provision' && targetEmail) {
        const teaLookup = await supabaseRequest(env, `ktn_teachers?email=eq.${encodeURIComponent(targetEmail)}&limit=1`);
        const existingTea = (teaLookup.ok && Array.isArray(teaLookup.data) && teaLookup.data[0]) ? teaLookup.data[0] : null;
        const prov = await provisionStudentOnIzTeach(env, {
          student_email: targetEmail,
          student_name: existingTea?.name || body.name || targetEmail.split('@')[0],
          phone: existingTea?.phone || '',
          courseIds: [],
          skipCourses: true,
          cognito_user_id: existingTea?.cognito_user_id || null
        });
        if (!prov.ok) {
          return jsonResponse({
            ok: false,
            retryable: true,
            syncStatus: 'sync_failed',
            error: prov.error || 'IZTEACH_TEACHER_RETRY_FAILED',
            message: 'Chưa thể kích hoạt tài khoản giáo viên trên izTeach: ' + (prov.error || '')
          }, 502);
        }
        if (existingTea) {
          await supabaseRequest(env, `ktn_teachers?code=eq.${encodeURIComponent(existingTea.code)}`, {
            method: 'PATCH',
            body: {
              cognito_user_id: prov.cognitoUserId,
              provisioning_status: 'ready_to_login',
              sync_status: 'synced',
              updated_at: new Date().toISOString()
            }
          });
        }
        return jsonResponse({
          ok: true,
          syncStatus: 'synced',
          provisioningStatus: 'ready_to_login',
          accountCreated: Boolean(prov.accountCreated),
          existingAccount: Boolean(prov.existingAccount),
          initialPassword: prov.initialPassword,
          message: `Đã đồng bộ lại tài khoản giáo viên ${targetEmail} thành công!`
        });
      }

      if (targetEmail || body.operationId) {
        const priorJob = await findLatestIncompleteStudentJobByEmail(env, targetEmail, body.operationId);
        const resolvedEmail = targetEmail || normalizeEmail(priorJob?.target_email || priorJob?.request_payload?.email || '');
        if (!resolvedEmail) {
          return jsonResponse({ ok: false, message: 'Không tìm thấy email học viên cần đồng bộ lại.' }, 400);
        }
        const stuLookup = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(resolvedEmail)}&limit=1`);
        const existingStu = (stuLookup.ok && Array.isArray(stuLookup.data) && stuLookup.data[0]) ? stuLookup.data[0] : null;
        const jobReq = (priorJob && priorJob.request_payload && typeof priorJob.request_payload === 'object')
          ? priorJob.request_payload
          : {};
        const currentCourseIds = Array.isArray(existingStu?.online_courses) && existingStu.online_courses.length > 0
          ? existingStu.online_courses.map(c => String(c?.id || c || '').trim()).filter(Boolean)
          : (Array.isArray(body.courseIds) && body.courseIds.length > 0
            ? resolveOrderCourseIds(body.courseIds)
            : (Array.isArray(jobReq.courseIds) ? resolveOrderCourseIds(jobReq.courseIds) : []));
        const resolvedName = existingStu?.name || body.name || jobReq.name || resolvedEmail.split('@')[0];
        const resolvedPhone = existingStu?.phone || body.phone || jobReq.phone || '';
        const resolvedParentName = existingStu?.parent_name || body.parentName || jobReq.parentName || undefined;
        const resolvedClassCode = existingStu?.class_code || body.classCode || jobReq.classCode || undefined;
        const opId = priorJob?.operation_id || body.operationId || generateOperationId('PROV-STU');
        const idemKey = priorJob?.idempotency_key || body.idempotencyKey || null;
        const priorAccountCreated = Boolean(priorJob?.response_payload?.account_created_in_job);

        const prov = await provisionStudentOnIzTeach(env, {
          operationId: opId,
          student_email: resolvedEmail,
          student_name: resolvedName,
          phone: resolvedPhone,
          courseIds: currentCourseIds,
          skipCourses: currentCourseIds.length === 0,
          cognito_user_id: existingStu?.cognito_user_id || priorJob?.cognito_user_id || null,
          preserveAccountCreated: priorAccountCreated
        });

        if (!prov.ok) {
          await saveProvisioningJobState(env, {
            operation_id: opId,
            idempotency_key: idemKey,
            job_type: priorJob?.job_type || 'student_create',
            actor_email: session.email,
            target_email: resolvedEmail,
            target_role: 'student',
            status: 'failed',
            sync_status: 'sync_failed',
            completed_steps: Array.isArray(priorJob?.completed_steps) ? priorJob.completed_steps : [],
            failed_step: prov.failedStep || 'izteach_account_provision',
            cognito_user_id: prov.cognitoUserId || priorJob?.cognito_user_id || null,
            izteach_student_id: prov.izteachStudentId || priorJob?.izteach_student_id || null,
            request_payload: {
              email: resolvedEmail,
              name: resolvedName,
              phone: resolvedPhone,
              parentName: resolvedParentName,
              classCode: resolvedClassCode,
              courseIds: currentCourseIds
            },
            error_code: 'IZTEACH_RETRY_FAILED',
            error_message: prov.error || 'Lỗi đồng bộ lại tài khoản trên izTeach',
            retryable: true
          });
          return jsonResponse({
            ok: false,
            operationId: opId,
            idempotencyKey: idemKey,
            retryable: true,
            syncStatus: 'sync_failed',
            error: prov.error || 'IZTEACH_RETRY_FAILED',
            message: 'Chưa thể kích hoạt hoặc đồng bộ tài khoản trên izTeach: ' + (prov.error || '')
          }, 502);
        }

        const syncedStu = await syncStudentEntitlementFromIzTeach(env, {
          email: resolvedEmail,
          name: resolvedName,
          phone: resolvedPhone,
          parentName: resolvedParentName,
          classCode: resolvedClassCode,
          cognitoUserId: prov.cognitoUserId,
          izteachStudentId: prov.izteachStudentId
        });

        if (!syncedStu || syncedStu.ok === false) {
          await saveProvisioningJobState(env, {
            operation_id: opId,
            idempotency_key: idemKey,
            job_type: priorJob?.job_type || 'student_create',
            actor_email: session.email,
            target_email: resolvedEmail,
            target_role: 'student',
            status: 'partial_failure',
            sync_status: 'partial_failure',
            completed_steps: ['izteach_account'],
            failed_step: 'supabase_student_upsert',
            cognito_user_id: prov.cognitoUserId,
            izteach_student_id: prov.izteachStudentId,
            request_payload: {
              email: resolvedEmail,
              name: resolvedName,
              phone: resolvedPhone,
              parentName: resolvedParentName,
              classCode: resolvedClassCode,
              courseIds: currentCourseIds
            },
            response_payload: {
              account_created_in_job: Boolean(prov.accountCreated || priorAccountCreated)
            },
            error_code: 'SUPABASE_UPSERT_FAILED',
            error_message: 'Đã kết nối izTeach nhưng chưa cập nhật được hồ sơ trên Supabase.',
            retryable: true
          });
          return jsonResponse({
            ok: false,
            operationId: opId,
            idempotencyKey: idemKey,
            retryable: true,
            syncStatus: 'partial_failure',
            message: 'Đã kết nối izTeach nhưng chưa cập nhật được hồ sơ trên Supabase.'
          }, 502);
        }

        const completedSteps = ['izteach_account', 'supabase_student_upsert'];
        if (currentCourseIds.length > 0) completedSteps.push('izteach_permissions');
        if (resolvedClassCode) completedSteps.push('class_assignment');

        const retrySummary = {
          operationId: opId,
          idempotencyKey: idemKey,
          syncStatus: 'synced',
          accountStatus: 'active',
          readyToLogin: true,
          fullySynced: true,
          completedSteps,
          failedStep: null,
          student: syncedStu,
          cognitoUserId: prov.cognitoUserId,
          izteachStudentId: prov.izteachStudentId,
          grantedCourseIds: prov.grantedCourseIds,
          allCourseIds: prov.allCourseIds,
          classCode: syncedStu.class_code || resolvedClassCode || null,
          accountCreated: Boolean(prov.accountCreated),
          existingAccount: Boolean(prov.existingAccount),
          credentialMode: prov.credentialMode,
          initialPassword: prov.initialPassword,
          message: `Đã đồng bộ lại tài khoản & quyền học cho ${resolvedEmail} thành công!`
        };

        await saveProvisioningJobState(env, {
          operation_id: opId,
          idempotency_key: idemKey,
          job_type: priorJob?.job_type || 'student_create',
          actor_email: session.email,
          target_email: resolvedEmail,
          target_role: 'student',
          status: 'completed',
          sync_status: 'synced',
          completed_steps: completedSteps,
          failed_step: null,
          cognito_user_id: prov.cognitoUserId,
          izteach_student_id: prov.izteachStudentId,
          request_payload: {
            email: resolvedEmail,
            name: resolvedName,
            phone: resolvedPhone,
            parentName: resolvedParentName,
            classCode: resolvedClassCode,
            courseIds: currentCourseIds
          },
          result_summary: retrySummary
        });

        return jsonResponse({
          ok: true,
          ...retrySummary
        });
      }

      const bulkRes = await syncAllIzTeachStudentsToSupabase(env, {
        source: 'admin_retry_all',
        reconcilePermissions: true
      });
      return jsonResponse(bulkRes, bulkRes.ok ? 200 : 502);
    }

    // ------------------------------------------------------------------------
    // D3. ĐIỂM DANH LỚP TRỰC TIẾP (ATTENDANCE API — PHẦN 9)
    // GET /api/ktn/attendance | POST /api/ktn/attendance
    // ------------------------------------------------------------------------
    if (path === '/api/ktn/attendance') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      }

      const buildAttendanceSummary = (list) => {
        const present = list.filter(r => r.status === 'present').length;
        const late = list.filter(r => r.status === 'late').length;
        const absentExcused = list.filter(r => r.status === 'excused' || r.status === 'absent_excused').length;
        const absentUnexcused = list.filter(r => r.status === 'absent' || r.status === 'absent_unexcused').length;
        return {
          present,
          late,
          absent: absentUnexcused,
          excused: absentExcused,
          absentExcused,
          absentUnexcused,
          total: list.length
        };
      };

      if (request.method === 'GET') {
        const reqClass = String(url.searchParams.get('classCode') || '').trim().toUpperCase();
        const reqSessionNum = url.searchParams.get('sessionNum') ? Number(url.searchParams.get('sessionNum')) : null;
        const reqStudentEmail = normalizeEmail(url.searchParams.get('studentEmail') || '');

        let query = 'ktn_attendance?select=*&order=date.desc&limit=500';
        if (session.role === 'student') {
          query = `ktn_attendance?student_email=eq.${encodeURIComponent(session.email)}&order=date.desc&limit=200`;
        } else if (session.role === 'teacher') {
          const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
          if (reqClass) {
            if (!assignedClasses.includes(reqClass)) {
              return jsonResponse({
                ok: false,
                message: `Cô không phụ trách lớp ${reqClass} nên không có quyền xem điểm danh của lớp này.`
              }, 403);
            }
            query = `ktn_attendance?class_code=eq.${encodeURIComponent(reqClass)}&order=date.desc&limit=500`;
          } else {
            if (assignedClasses.length === 0) {
              return jsonResponse({
                ok: true,
                classCode: reqClass || '',
                sessionNum: reqSessionNum,
                records: [],
                attendance: [],
                summary: buildAttendanceSummary([])
              });
            }
            query = `ktn_attendance?class_code=in.(${assignedClasses.map(c => encodeURIComponent(c)).join(',')})&order=date.desc&limit=500`;
          }
        } else if (reqClass) {
          query = `ktn_attendance?class_code=eq.${encodeURIComponent(reqClass)}&order=date.desc&limit=500`;
        }

        let sbRes = await supabaseRequest(env, query);
        if ((!sbRes || !sbRes.ok) && sbRes?.status === 400 && query.includes('order=date.desc')) {
          sbRes = await supabaseRequest(env, query.replace('order=date.desc', 'order=recorded_at.desc'));
        }
        if (!sbRes || !sbRes.ok) {
          return jsonResponse({
            ok: false,
            retryable: true,
            message: 'Chưa tải được dữ liệu điểm danh từ cơ sở dữ liệu Supabase.'
          }, sbRes?.status || 503);
        }

        let records = (Array.isArray(sbRes.data) ? sbRes.data : []).map(r => ({
          ...r,
          session_num: r.session_num ?? r.lesson_num ?? 1,
          lesson_num: r.lesson_num ?? r.session_num ?? 1,
          date: r.date || (r.recorded_at ? String(r.recorded_at).slice(0, 10) : ''),
          note: r.note ?? r.teacher_note ?? ''
        }));
        if (reqSessionNum !== null && Number.isFinite(reqSessionNum)) {
          records = records.filter(r => Number(r.session_num || 1) === reqSessionNum);
        }
        if (reqStudentEmail && session.role !== 'student') {
          records = records.filter(r => normalizeEmail(r.student_email) === reqStudentEmail);
        }

        const summary = buildAttendanceSummary(records);

        return jsonResponse({
          ok: true,
          classCode: reqClass || '',
          sessionNum: reqSessionNum,
          records,
          attendance: records,
          summary
        });
      }

      if (request.method === 'POST') {
        if (session.role !== 'teacher' && session.role !== 'admin') {
          return jsonResponse({ ok: false, message: 'Chỉ Giáo viên hoặc Quản lý mới được phép điểm danh lớp học.' }, 403);
        }
        const body = await request.json().catch(() => ({}));
        const classCode = String(body.classCode || '').trim().toUpperCase();
        if (!classCode) {
          return jsonResponse({ ok: false, message: 'Vui lòng chọn mã lớp học cần điểm danh.' }, 400);
        }

        if (session.role === 'teacher') {
          const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
          if (!assignedClasses.includes(classCode)) {
            return jsonResponse({
              ok: false,
              message: `Cô không phụ trách lớp ${classCode} nên không có quyền điểm danh lớp này.`
            }, 403);
          }
        }

        const sessionNum = Math.max(1, Number(body.sessionNum || 1));
        const attDate = String(body.date || body.sessionDate || new Date().toISOString().slice(0, 10)).trim();
        const rawEntries = Array.isArray(body.records)
          ? body.records
          : (body.studentEmail ? [body] : []);

        if (rawEntries.length === 0) {
          return jsonResponse({ ok: false, message: 'Danh sách điểm danh trống.' }, 400);
        }

        const VALID_ATT_STATUS = new Set([
          'present',
          'absent',
          'late',
          'excused',
          'absent_excused',
          'absent_unexcused'
        ]);
        const savedRecords = [];
        for (const entry of rawEntries) {
          const stuEmail = normalizeEmail(entry.studentEmail || entry.student_email || '');
          if (!stuEmail) continue;
          const stuName = String(entry.studentName || entry.student_name || stuEmail.split('@')[0]).trim();
          const rawStatus = String(entry.status || '').trim().toLowerCase();
          const status = VALID_ATT_STATUS.has(rawStatus) ? rawStatus : 'present';
          const note = String(entry.note || '').trim();
          const attId = entry.id || `ATT-${classCode}-S${sessionNum}-${stuEmail}`;

          const baseAttRow = {
            id: attId,
            class_code: classCode,
            student_email: stuEmail,
            date: attDate,
            status,
            note,
            recorded_by: session.email
          };
          const extAttRow = {
            ...baseAttRow,
            student_name: stuName,
            session_num: sessionNum,
            lesson_num: sessionNum,
            updated_by: session.email,
            updated_at: new Date().toISOString()
          };

          let wRes = await supabaseRequest(env, 'ktn_attendance', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates,return=representation',
            body: extAttRow
          });
          if ((!wRes || !wRes.ok) && wRes?.status === 400) {
            wRes = await supabaseRequest(env, 'ktn_attendance', {
              method: 'POST',
              prefer: 'resolution=merge-duplicates,return=representation',
              body: baseAttRow
            });
          }
          if ((!wRes || !wRes.ok) && wRes?.status === 400) {
            const v2AttRow = {
              class_code: classCode,
              student_code: String(entry.studentCode || entry.student_code || stuEmail).trim(),
              student_email: stuEmail,
              lesson_num: sessionNum,
              status: status === 'absent_excused' ? 'excused' : (status === 'absent_unexcused' ? 'absent' : status),
              teacher_note: note,
              recorded_by: session.email,
              recorded_at: new Date().toISOString()
            };
            wRes = await supabaseRequest(env, 'ktn_attendance?on_conflict=class_code,student_code,lesson_num', {
              method: 'POST',
              prefer: 'resolution=merge-duplicates,return=representation',
              body: v2AttRow
            });
          }
          if (!wRes || !wRes.ok || !Array.isArray(wRes.data) || wRes.data.length === 0) {
            return jsonResponse({
              ok: false,
              retryable: true,
              error: 'SUPABASE_ATTENDANCE_SAVE_FAILED',
              message: 'Chưa lưu được dữ liệu điểm danh vào cơ sở dữ liệu Supabase. Vui lòng thử lại.'
            }, 502);
          }
          const savedRow = wRes.data[0];
          savedRecords.push({
            ...savedRow,
            student_name: savedRow.student_name || stuName,
            session_num: savedRow.session_num ?? savedRow.lesson_num ?? sessionNum,
            lesson_num: savedRow.lesson_num ?? savedRow.session_num ?? sessionNum,
            date: savedRow.date || attDate,
            note: savedRow.note ?? savedRow.teacher_note ?? note
          });
        }

        const summary = buildAttendanceSummary(savedRecords);
        return jsonResponse({
          ok: true,
          classCode,
          sessionNum,
          date: attDate,
          savedCount: savedRecords.length,
          records: savedRecords,
          attendance: savedRecords,
          summary,
          message: `Đã lưu điểm danh Buổi ${sessionNum} lớp ${classCode} (${savedRecords.length} học sinh)!`
        });
      }
    }

    // ------------------------------------------------------------------------
    // E. BÀI TẬP NỘP (FILE NẶNG LƯU S3 IZTEACH, ĐIỂM & LỜI PHÊ LƯU SUPABASE)
    // ------------------------------------------------------------------------
    const DEFAULT_SESSIONS_BY_CLASS = {
      'YCT2-04': [
        {
          classCode: 'YCT2-04',
          session_num: 1,
          sessionNum: 1,
          session_title: 'Buổi 1: Hỏi thăm sức khỏe & Số đếm 1–20',
          title: 'Buổi 1: Hỏi thăm sức khỏe & Số đếm 1–20',
          exercises: [
            { id: 'YCT2-04-B1-E1', num: 1, title: 'Bài 1: Thu âm đọc 5 câu hội thoại hỏi thăm sức khỏe (Trang 12)', prompt: 'Con bấm Thu âm đọc rõ từng câu hội thoại trong sách giáo khoa trang 12 rồi bấm Nộp bài cho cô nhé.', type: 'audio' },
            { id: 'YCT2-04-B1-E2', num: 2, title: 'Bài 2: Chụp ảnh vở viết chữ Hán bài 1 (你, 好, 我, 叫)', prompt: 'Con viết mỗi chữ 1 dòng vào vở ô mễ, sau đó chụp ảnh đính kèm gửi cô chấm nét chữ nhé.', type: 'photo' }
          ]
        },
        {
          classCode: 'YCT2-04',
          session_num: 2,
          sessionNum: 2,
          session_title: 'Buổi 2: Gia đình của em & Các thành viên (我的家人)',
          title: 'Buổi 2: Gia đình của em & Các thành viên (我的家人)',
          exercises: [
            { id: 'YCT2-04-B2-E1', num: 1, title: 'Bài 1: Thu âm giới thiệu các thành viên trong gia đình bằng tiếng Trung', prompt: 'Con dùng mẫu câu "这是我的..." để giới thiệu bố, mẹ và anh/chị/em trong nhà.', type: 'audio' },
            { id: 'YCT2-04-B2-E2', num: 2, title: 'Bài 2: Chụp ảnh bài tập nối từ trang 15', prompt: 'Con làm bài tập trang 15 và đính kèm ảnh chụp trang bài làm.', type: 'photo' }
          ]
        },
        {
          classCode: 'YCT2-04',
          session_num: 3,
          sessionNum: 3,
          session_title: 'Buổi 3: Thời gian & Lịch sinh hoạt hàng ngày (现在几点？)',
          title: 'Buổi 3: Thời gian & Lịch sinh hoạt hàng ngày (现在几点？)',
          exercises: [
            { id: 'YCT2-04-B3-E1', num: 1, title: 'Bài 1: Thu âm hỏi đáp giờ giấc và lịch đi học của em', prompt: 'Chú ý phát âm chuẩn thanh 3 và thanh 4 khi đọc bài khóa.', type: 'audio' }
          ]
        }
      ],
      'YCT1-01': [
        {
          classCode: 'YCT1-01',
          session_num: 1,
          sessionNum: 1,
          session_title: 'Buổi 1: Làm quen thanh điệu Pinyin & Lời chào đầu tiên',
          title: 'Buổi 1: Làm quen thanh điệu Pinyin & Lời chào đầu tiên',
          exercises: [
            { id: 'YCT1-01-B1-E1', num: 1, title: 'Bài 1: Thu âm đọc 4 thanh điệu và lời chào Nǐ hǎo, Lǎoshī hǎo', prompt: 'Con bấm Thu âm đọc to: "老师好！我叫..." rồi bấm Nộp bài cho cô nhé.', type: 'audio' },
            { id: 'YCT1-01-B1-E2', num: 2, title: 'Bài 2: Chụp ảnh vở tô nét cơ bản chữ Nhất (一), Nhị (二), Tam (三)', prompt: 'Con viết đúng thứ tự nét từ trái sang phải, từ trên xuống dưới và chụp ảnh nộp cho cô.', type: 'photo' }
          ]
        },
        {
          classCode: 'YCT1-01',
          session_num: 2,
          sessionNum: 2,
          session_title: 'Buổi 2: Đếm số từ 1 đến 10 & Hỏi tuổi (你几岁？)',
          title: 'Buổi 2: Đếm số từ 1 đến 10 & Hỏi tuổi (你几岁？)',
          exercises: [
            { id: 'YCT1-01-B2-E1', num: 1, title: 'Bài 1: Thu âm đếm số 1-10 và nói tuổi của em', prompt: 'Con đọc to rõ ràng từ 一 đến 十 và câu "我...岁".', type: 'audio' }
          ]
        }
      ]
    };

    const getMergedClassSessions = async (targetClassCode) => {
      const code = String(targetClassCode || '').trim().toUpperCase();
      if (!code) return [];
      const sbRes = await supabaseRequest(
        env,
        `ktn_class_sessions?class_code=eq.${encodeURIComponent(code)}&order=session_num.asc`
      );
      const dbRows = (sbRes.ok && Array.isArray(sbRes.data)) ? sbRes.data : [];
      const baseDefaults = Object.prototype.hasOwnProperty.call(DEFAULT_SESSIONS_BY_CLASS, code)
        ? DEFAULT_SESSIONS_BY_CLASS[code]
        : [];
      const mergedByNum = new Map();
      baseDefaults.forEach(item => {
        mergedByNum.set(Number(item.session_num || item.sessionNum), item);
      });
      dbRows.forEach(row => {
        const sNum = Number(row.session_num || row.sessionNum) || 1;
        const resolvedTitle = String(row.session_title || row.title || `Buổi ${sNum}`).trim();
        const rawExercises = Array.isArray(row.exercises)
          ? row.exercises
          : (Array.isArray(row.assignments) ? row.assignments : []);
        const normExercises = rawExercises.map((ex, idx) => ({
          ...ex,
          id: String(ex?.id || `${code}-B${sNum}-E${idx + 1}`).trim(),
          num: Number(ex?.num || ex?.order) || (idx + 1),
          title: String(ex?.title || `Bài ${idx + 1}`).trim(),
          prompt: String(ex?.prompt || ex?.instruction || '').trim(),
          instruction: String(ex?.instruction || ex?.prompt || '').trim(),
          type: String(ex?.type || 'audio').trim()
        }));
        mergedByNum.set(sNum, {
          id: row.id,
          classCode: row.class_code || code,
          session_num: sNum,
          sessionNum: sNum,
          session_title: resolvedTitle,
          title: resolvedTitle,
          session_date: row.session_date || row.sessionDate || null,
          summary: row.summary || null,
          exercises: normExercises,
          assignments: normExercises,
          updatedBy: row.updated_by || row.teacher_email || null,
          updatedAt: row.updated_at || null
        });
      });
      return Array.from(mergedByNum.values()).sort(
        (a, b) => Number(a.session_num || a.sessionNum) - Number(b.session_num || b.sessionNum)
      );
    };

    const MAX_HOMEWORK_FILE_BYTES = 50 * 1024 * 1024;
    const ALLOWED_HW_EXT_REGEX = /\.(wav|mp3|m4a|webm|ogg|aac|mp4|mov|jpg|jpeg|png|webp|gif|pdf)(\?|$)/i;
    const DANGEROUS_HW_EXT_REGEX = /\.(exe|bat|cmd|sh|php|pl|py|js|mjs|cjs|html|htm|svg|xml|jar|msi|apk|dll|scr)(\?|$)/i;

    if (path === '/api/ktn/homeworks/upload-url' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập để tải bài tập lên.' }, 401);
      const body = await request.json().catch(() => ({}));
      if (body.fileSize !== undefined && body.fileSize !== null) {
        const fSize = Number(body.fileSize);
        if (!Number.isFinite(fSize) || fSize <= 0 || fSize > MAX_HOMEWORK_FILE_BYTES) {
          return jsonResponse({
            ok: false,
            message: 'Dung lượng tệp bài làm không hợp lệ hoặc vượt quá giới hạn tối đa 50MB.'
          }, 400);
        }
      }
      const rawName = String(body.fileName || `btvn_${Date.now()}.wav`);
      const cleanName = rawName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      if (DANGEROUS_HW_EXT_REGEX.test(cleanName) || !ALLOWED_HW_EXT_REGEX.test(cleanName)) {
        return jsonResponse({
          ok: false,
          message: 'Định dạng tệp không được phép tải lên. Chỉ chấp nhận tệp âm thanh, hình ảnh, video hoặc PDF bài làm.'
        }, 400);
      }
      const fileType = String(body.fileType || 'audio/wav').split(';')[0].trim() || 'audio/wav';
      const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
      const studentFolder = normalizeEmail(session.email).replace(/[^a-z0-9]/g, '_');
      const s3Key = `resource/homeworks/${vendorId}/${studentFolder}/${Date.now()}-${cleanName}`;
      const adminToken = await getIzTeachAdminToken(env);
      if (!adminToken) return jsonResponse({ ok: false, message: 'Chưa cấu hình token kho lưu trữ S3.' }, 503);

      const s3Res = await fetch(
        `${IZTEACH_ENDPOINTS.s3SignedUrl}?key=${encodeURIComponent(s3Key)}&contentType=${encodeURIComponent(fileType)}`,
        { headers: { Authorization: adminToken } }
      );
      const s3Data = await s3Res.json().catch(() => null);
      const signedUrl = typeof s3Data === 'string' ? s3Data : (s3Data?.url || s3Data?.signedUrl || s3Data?.data || null);
      if (!s3Res.ok || !signedUrl) {
        return jsonResponse({ ok: false, message: 'Không thể khởi tạo đường dẫn tải tệp lên S3.' }, s3Res.status || 502);
      }
      return jsonResponse({
        ok: true,
        signedUrl,
        s3Key,
        fileUrl: `https://d21acfi38wn3iy.cloudfront.net/${s3Key}`,
        data: s3Data
      });
    }

    if ((path === '/api/ktn/upload-url' || path === '/api/ktn/chat/upload-url' || path === '/api/ktn/forum/upload-url' || path === '/api/ktn/upload-audio') && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập để tải tệp đính kèm lên.' }, 401);
      const body = await request.json().catch(() => ({}));
      const MAX_CHAT_FILE_BYTES = 100 * 1024 * 1024;
      if (body.fileSize !== undefined && body.fileSize !== null) {
        const fSize = Number(body.fileSize);
        if (!Number.isFinite(fSize) || fSize <= 0 || fSize > MAX_CHAT_FILE_BYTES) {
          return jsonResponse({
            ok: false,
            message: 'Dung lượng tệp không hợp lệ hoặc vượt quá giới hạn tối đa 100MB.'
          }, 400);
        }
      }
      const fileType = String(body.fileType || body.contentType || 'application/octet-stream').split(';')[0].trim() || 'application/octet-stream';
      const extByMime = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/webp': '.webp',
        'image/gif': '.gif',
        'image/bmp': '.bmp',
        'image/heic': '.heic',
        'audio/wav': '.wav',
        'audio/mpeg': '.mp3',
        'audio/mp3': '.mp3',
        'audio/mp4': '.m4a',
        'audio/x-m4a': '.m4a',
        'audio/webm': '.webm',
        'audio/ogg': '.ogg',
        'audio/aac': '.aac',
        'video/mp4': '.mp4',
        'video/x-m4v': '.m4v',
        'video/quicktime': '.mov',
        'video/webm': '.webm',
        'application/pdf': '.pdf',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.ms-excel': '.xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'application/vnd.ms-powerpoint': '.ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
        'application/zip': '.zip',
        'application/vnd.rar': '.rar',
        'application/x-rar-compressed': '.rar',
        'text/plain': '.txt'
      };
      const rawName = String(body.fileName || `chat_${Date.now()}${extByMime[fileType.toLowerCase()] || '.bin'}`);
      let cleanName = rawName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      if (!/\.[a-zA-Z0-9]{2,5}$/.test(cleanName)) {
        cleanName += (extByMime[fileType.toLowerCase()] || '.bin');
      }
      if (DANGEROUS_HW_EXT_REGEX.test(cleanName)) {
        return jsonResponse({
          ok: false,
          message: 'Định dạng tệp thực thi không được phép tải lên vì lý do an toàn.'
        }, 400);
      }
      const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
      const userFolder = normalizeEmail(session.email).replace(/[^a-z0-9]/g, '_');
      const s3Folder = path === '/api/ktn/forum/upload-url' ? 'forum' : 'chat';
      const s3Key = `resource/${s3Folder}/${vendorId}/${userFolder}/${Date.now()}-${cleanName}`;
      const adminToken = await getIzTeachAdminToken(env);
      if (!adminToken) return jsonResponse({ ok: false, message: 'Chưa cấu hình token kho lưu trữ S3.' }, 503);

      const s3Res = await fetch(
        `${IZTEACH_ENDPOINTS.s3SignedUrl}?key=${encodeURIComponent(s3Key)}&contentType=${encodeURIComponent(fileType)}`,
        { headers: { Authorization: adminToken } }
      );
      const s3Data = await s3Res.json().catch(() => null);
      const signedUrl = typeof s3Data === 'string' ? s3Data : (s3Data?.url || s3Data?.signedUrl || s3Data?.data || null);
      if (!s3Res.ok || !signedUrl) {
        return jsonResponse({ ok: false, message: 'Không thể khởi tạo đường dẫn tải tệp lên S3.' }, s3Res.status || 502);
      }
      const fileUrl = `https://d21acfi38wn3iy.cloudfront.net/${s3Key}`;
      return jsonResponse({
        ok: true,
        signedUrl,
        uploadUrl: signedUrl,
        s3Key,
        fileUrl,
        cdnUrl: fileUrl,
        data: s3Data
      });
    }

    if (path === '/api/ktn/homeworks' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);

      // Bảo mật PII & Phân quyền theo lớp:
      // - Học sinh chỉ lấy được đúng bài tập của chính mình
      // - Giáo viên chỉ lấy được bài tập của các lớp mình chủ nhiệm (trả 403 nếu mở lớp của GV khác)
      const reqClass = String(url.searchParams.get('classCode') || '').trim().toUpperCase();
      const reqCourseId = String(url.searchParams.get('courseId') || '').trim().toLowerCase();
      let query = 'ktn_homeworks?select=*&order=submitted_at.desc&limit=200';
      if (session.role === 'student') {
        query = `ktn_homeworks?student_email=eq.${encodeURIComponent(session.email)}&order=submitted_at.desc`;
      } else if (session.role === 'teacher') {
        const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
        const assignedCourses = await getTeacherAssignedCourseIds(env, session.email);
        if (reqClass) {
          if (!assignedClasses.includes(reqClass)) {
            return jsonResponse({
              ok: false,
              message: `Cô không phụ trách lớp ${reqClass} nên không có quyền xem bài tập của lớp này.`
            }, 403);
          }
          query = `ktn_homeworks?class_code=eq.${encodeURIComponent(reqClass)}&order=submitted_at.desc`;
        } else if (reqCourseId) {
          if (!assignedCourses.includes(reqCourseId)) {
            return jsonResponse({
              ok: false,
              error: 'TEACHER_COURSE_SCOPE_FORBIDDEN',
              message: 'Cô không phụ trách khóa học video này nên không có quyền xem bài tập của khóa này.'
            }, 403);
          }
          query = `ktn_homeworks?course_id=eq.${encodeURIComponent(reqCourseId)}&order=submitted_at.desc`;
        } else {
          if (assignedClasses.length === 0 && assignedCourses.length === 0) {
            return jsonResponse({ ok: true, homeworks: [] });
          }
          if (assignedClasses.length > 0) {
            query = `ktn_homeworks?class_code=in.(${assignedClasses.map(c => encodeURIComponent(c)).join(',')})&order=submitted_at.desc`;
          } else {
            query = `ktn_homeworks?course_id=in.(${assignedCourses.map(c => encodeURIComponent(c)).join(',')})&order=submitted_at.desc`;
          }
        }
      } else if (reqClass) {
        query = `ktn_homeworks?class_code=eq.${encodeURIComponent(reqClass)}&order=submitted_at.desc`;
      }
      const sbRes = await supabaseRequest(env, query);
      if (!sbRes.ok) {
        return jsonResponse({ ok: false, message: 'Chưa tải được danh sách bài tập từ cơ sở dữ liệu.' }, sbRes.status || 503);
      }
      let rows = Array.isArray(sbRes.data) ? sbRes.data : [];
      if (session.role === 'teacher' && !reqClass) {
        const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
        rows = rows.filter(r => {
          const rCls = String(r?.class_code || '').trim().toUpperCase();
          return !rCls || assignedClasses.includes(rCls);
        });
      }
      return jsonResponse({ ok: true, homeworks: rows });
    }

    if (path === '/api/ktn/homeworks' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập để nộp bài.' }, 401);
      if (session.role !== 'student') {
        return jsonResponse({ ok: false, message: 'Chỉ tài khoản Học sinh mới được phép nộp bài tập.' }, 403);
      }

      const body = await request.json().catch(() => ({}));
      const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];
      const firstAtt = rawAttachments.find(a => a && (a.fileUrl || a.cdnUrl || a.playUrl)) || null;
      const fileUrl = String(body.fileUrl || firstAtt?.fileUrl || firstAtt?.cdnUrl || firstAtt?.playUrl || '').trim();
      const isTextOnlySubmission = !fileUrl && (body.submissionMode === 'text' || body.fileType === 'text') &&
        String(body.textAnswer || body.studentNote || '').trim().length > 0;
      const fileType = isTextOnlySubmission
        ? 'text'
        : (String(body.fileType || firstAtt?.fileType || firstAtt?.mediaType || 'audio').split(';')[0].trim() || 'audio');
      const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;

      // Chặn triệt để lỗi nộp bài thiếu fileUrl thật (trừ khi bài tập cho phép nộp câu trả lời dạng chữ thuần submissionMode === 'text'), tự nhét video mẫu, chèn URL ngoài hệ thống S3/CloudFront của KTN hoặc dùng đường dẫn của học sinh khác!
      const validCdnPrefix = `https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/${vendorId}/`;
      const validS3Prefix = `https://online-learning-izteach-6-aws-source-bucket.s3-ap-southeast-1.amazonaws.com/resource/homeworks/${vendorId}/`;
      const studentFolder = normalizeEmail(session.email).replace(/[^a-z0-9]/g, '_');

      if (!isTextOnlySubmission) {
        const candidateUrls = [
          fileUrl,
          ...rawAttachments.map(a => String(a?.fileUrl || a?.cdnUrl || a?.playUrl || '').trim()).filter(Boolean)
        ];

        for (const u of candidateUrls) {
          if (
            !u ||
            u.includes('..') ||
            (!u.startsWith(validCdnPrefix) && !u.startsWith(validS3Prefix)) ||
            /hw_btvn_bai_1\.mp4|BTVN BAI 1\.mp4/i.test(u) ||
            DANGEROUS_HW_EXT_REGEX.test(u) ||
            !ALLOWED_HW_EXT_REGEX.test(u)
          ) {
            return jsonResponse({
              ok: false,
              message: 'Tệp bài làm phải thuộc định dạng hợp lệ và được tải lên kho lưu trữ chính thức của Học Viện Khổng Tử Nhí trước khi nộp bài!'
            }, 400);
          }
          const relPath = u.startsWith(validCdnPrefix) ? u.slice(validCdnPrefix.length) : u.slice(validS3Prefix.length);
          const relParts = relPath.split('/').filter(Boolean);
          if (relParts.length >= 2 && relParts[0] !== studentFolder) {
            return jsonResponse({
              ok: false,
              message: 'Không được phép sử dụng đường dẫn tệp bài làm của học sinh khác.'
            }, 403);
          }
        }

        // Kiểm tra tệp bài làm thực sự tồn tại trên kho S3/CloudFront và có dung lượng > 0 byte
        const headCheckUrl = fileUrl.startsWith(validS3Prefix)
          ? (validCdnPrefix + fileUrl.slice(validS3Prefix.length))
          : fileUrl;
        const headRes = await fetch(headCheckUrl, { method: 'HEAD' }).catch(() => null);
        const headSize = headRes ? Number(headRes.headers.get('content-length') || 0) : 0;
        if (!headRes || !headRes.ok || headSize <= 0) {
          return jsonResponse({
            ok: false,
            message: 'Tệp bài làm chưa được tải lên kho lưu trữ hoặc có dung lượng 0 byte. Em vui lòng tải tệp lên trước khi nộp bài!'
          }, 400);
        }
        if (headSize > MAX_HOMEWORK_FILE_BYTES) {
          return jsonResponse({
            ok: false,
            message: 'Dung lượng tệp bài làm vượt quá giới hạn tối đa 50MB.'
          }, 400);
        }
      }

      // Kiểm tra tính hợp lệ của lessonNum
      const rawLessonNum = body.lessonNum !== undefined ? Number(body.lessonNum) : 1;
      if (!Number.isInteger(rawLessonNum) || rawLessonNum < 1) {
        return jsonResponse({ ok: false, message: 'Số thứ tự bài tập (lessonNum) không hợp lệ.' }, 400);
      }
      const lessonNum = rawLessonNum;

      // 1. Tra cứu hồ sơ thật của học sinh đang đăng nhập trên Supabase ktn_students
      const [stuLookup, stuLifecycle] = await Promise.all([
        supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(session.email)}&limit=1`),
        getStudentLifecycleState(env, session.email).catch(() => null)
      ]);
      let sbStudent = (stuLookup.ok && Array.isArray(stuLookup.data) && stuLookup.data[0]) ? stuLookup.data[0] : null;
      const lifeStatus = stuLifecycle?.status || sbStudent?.account_status || 'active';
      if (lifeStatus === 'deleted' || lifeStatus === 'suspended' || lifeStatus === 'archived') {
        return jsonResponse({
          ok: false,
          error: lifeStatus === 'deleted' ? 'ACCOUNT_DELETED' : (lifeStatus === 'archived' ? 'ACCOUNT_ARCHIVED' : 'ACCOUNT_SUSPENDED'),
          message: 'Tài khoản học viên không còn hiệu lực nộp bài tập.'
        }, 403);
      }
      let realClassCode = sbStudent
        ? (String(sbStudent.class_code || '').trim().toUpperCase() || null)
        : (String(session.classCode || '').trim().toUpperCase() || null);
      let realOnlineCourses = sbStudent
        ? (Array.isArray(sbStudent.online_courses) ? sbStudent.online_courses : [])
        : (Array.isArray(session.onlineCourses) ? session.onlineCourses : []);
      let enrolledCourseIds = new Set(
        realOnlineCourses.map(c => String(c?.id || c || '').trim()).filter(Boolean)
      );

      // 2. Kiểm tra lớp học (classCode) và khóa học (courseId) học sinh được phép nộp
      const reqClass = body.classCode ? String(body.classCode).trim().toUpperCase() : null;
      if (reqClass && reqClass !== realClassCode) {
        return jsonResponse({
          ok: false,
          message: `Em không thuộc lớp ${reqClass} nên không được phép nộp bài vào lớp này.`
        }, 403);
      }

      const courseId = String(body.courseId || (realClassCode ? `CLASS_${realClassCode}` : DEFAULT_COURSE_ID)).trim();
      if (courseId.toUpperCase().startsWith('CLASS_')) {
        const targetClass = courseId.slice(6).trim().toUpperCase();
        if (!realClassCode || targetClass !== realClassCode) {
          return jsonResponse({
            ok: false,
            message: `Em không thuộc lớp ${targetClass} nên không được phép nộp bài của lớp này.`
          }, 403);
        }
        const clsLookup = await supabaseRequest(
          env,
          `ktn_classes?id=eq.${encodeURIComponent(targetClass)}&select=id,active&limit=1`
        );
        const clsRow = clsLookup.ok && Array.isArray(clsLookup.data) && clsLookup.data[0] ? clsLookup.data[0] : null;
        if (clsRow && clsRow.active === false) {
          return jsonResponse({
            ok: false,
            error: 'CLASS_ARCHIVED_OR_INACTIVE',
            message: `Lớp ${targetClass} đã được lưu trữ nên không nhận bài nộp mới.`
          }, 403);
        }
        const isSessionExFormat = lessonNum >= 101 && lessonNum <= 2520 && (lessonNum % 100 >= 1 && lessonNum % 100 <= 20);
        const isDirectSessionFormat = lessonNum >= 1 && lessonNum <= 25;
        if (!isSessionExFormat && !isDirectSessionFormat) {
          return jsonResponse({
            ok: false,
            message: 'Mã bài tập (lessonNum) không tồn tại trong chương trình học của lớp.'
          }, 400);
        }
        // Kiểm tra bài tập có thực sự tồn tại trong danh sách buổi học & bài cô đã giao của lớp hay không
        const assignedSessions = await getMergedClassSessions(targetClass);
        if (assignedSessions.length > 0) {
          if (lessonNum >= 100) {
            const sNum = Math.floor(lessonNum / 100);
            const eNum = lessonNum % 100;
            const targetSession = assignedSessions.find(s => Number(s.session_num || s.sessionNum) === sNum);
            const targetExercises = (targetSession && Array.isArray(targetSession.exercises)) ? targetSession.exercises : [];
            const hasAssignedEx = Boolean(
              targetSession &&
                (targetExercises.length === 0
                  ? eNum === 1
                  : targetExercises.some((ex, idx) => Number(ex.num || (idx + 1)) === eNum))
            );
            if (!hasAssignedEx) {
              return jsonResponse({
                ok: false,
                message: `Bài tập số ${eNum} (Buổi ${sNum}) chưa được giao trong lớp ${targetClass}.`
              }, 400);
            }
          } else {
            const targetSession = assignedSessions.find(s => Number(s.session_num || s.sessionNum) === lessonNum);
            if (!targetSession) {
              return jsonResponse({
                ok: false,
                message: `Buổi học số ${lessonNum} chưa được giao trong lớp ${targetClass}.`
              }, 400);
            }
          }
        }
      } else {
        if (lessonNum > 50) {
          return jsonResponse({
            ok: false,
            message: 'Số thứ tự bài học trực tuyến không tồn tại trong khóa học.'
          }, 400);
        }
        // Nếu Supabase chưa có bản ghi học viên, đối chiếu trực tiếp với izTeach và đồng bộ vào ktn_students
        if (!sbStudent && !enrolledCourseIds.has(courseId)) {
          const syncedStu = await syncStudentEntitlementFromIzTeach(env, {
            email: session.email,
            name: session.name,
            phone: '',
            cognitoUserId: session.userId,
            izteachStudentId: session.studentId,
            accessToken: session.izteachAccessToken || session.accessToken
          });
          if (syncedStu) {
            sbStudent = syncedStu;
            realClassCode = String(sbStudent.class_code || realClassCode || '').trim().toUpperCase() || null;
            realOnlineCourses = Array.isArray(sbStudent.online_courses) ? sbStudent.online_courses : [];
            enrolledCourseIds = new Set(
              realOnlineCourses.map(c => String(c?.id || c || '').trim()).filter(Boolean)
            );
          }
        }
        if (!enrolledCourseIds.has(courseId)) {
          return jsonResponse({
            ok: false,
            error: 'COURSE_NOT_ENTITLED',
            message: 'Em chưa đăng ký khóa học này nên chưa thể nộp bài tập.'
          }, 403);
        }
      }

      // 3. Máy chủ tự xác định ID bài nộp từ tài khoản đã xác thực; từ chối nếu client truyền ID của học sinh khác
      const hwId = `HW-${session.email}-${courseId}-L${lessonNum}`;
      const clientRequestedId = String(body.id || '').trim();
      if (clientRequestedId && clientRequestedId !== hwId) {
        return jsonResponse({
          ok: false,
          message: 'Mã bài nộp (id) không thuộc quyền sở hữu của học sinh đang đăng nhập.'
        }, 403);
      }

      // Kiểm tra tính nhất quán giữa courseId, lessonNum và unitId (chặn ghép nhầm unit của khóa khác hoặc unit ngoài danh mục chưa xác minh)
      const unitResolution = await resolveAndVerifyCourseUnitId(env, courseId, lessonNum, body.unitId || null);
      if (!unitResolution.isLiveClass && body.unitId && !unitResolution.valid) {
        return jsonResponse({
          ok: false,
          error: 'UNIT_COURSE_MISMATCH',
          reason: unitResolution.reason || 'UNIT_COURSE_MISMATCH',
          message: 'Mã bài tập (unitId) không khớp với khóa học hoặc bài học đã chọn.'
        }, 400);
      }

      const cleanNote = String(body.studentNote || '');
      const submitLockKey = `SUBMIT|${hwId}|${fileUrl}|${cleanNote}`;

      return runWithHomeworkConcurrencyLock(submitLockKey, async () => {
        // 4. Nếu bản ghi đã tồn tại, đối chiếu chủ sở hữu và kiểm tra chống nộp trùng lặp (Idempotency)
        let existingHw = null;
        const existingRes = await supabaseRequest(
          env,
          `ktn_homeworks?id=eq.${encodeURIComponent(hwId)}&select=*&limit=1`
        );
        if (existingRes.ok && Array.isArray(existingRes.data) && existingRes.data[0]) {
          existingHw = existingRes.data[0];
          const existingOwner = normalizeEmail(existingHw.student_email || '');
          if (existingOwner && existingOwner !== session.email) {
            return jsonResponse({
              ok: false,
              message: 'Không được phép ghi đè bài nộp của học sinh khác.'
            }, 403);
          }
        }

        if (
          existingHw &&
          existingHw.file_url === fileUrl &&
          String(existingHw.student_note || '') === cleanNote &&
          existingHw.status === 'pending'
        ) {
          const prevMeta = existingHw.workbook_answers?._syncMeta || {};
          if (prevMeta.syncStatus === 'synced' || prevMeta.syncStatus === 'not_applicable_live_class') {
            return jsonResponse({
              ok: true,
              idempotent: true,
              idempotentReplay: true,
              syncStatus: prevMeta.syncStatus,
              unitId: prevMeta.unitId || unitResolution.unitId || null,
              mirroredToIzTeach: prevMeta.syncStatus === 'synced',
              homework: existingHw,
              izteachMirror: {
                ok: true,
                idempotent: true,
                idempotentReplay: true,
                syncStatus: prevMeta.syncStatus,
                remoteId: prevMeta.izteachRemoteId || null
              }
            });
          }
        }

        const normalizedAttachments = rawAttachments.length > 0
          ? rawAttachments.map(a => ({
              title: a.title || a.fileName || 'Bài nộp',
              fileUrl: a.fileUrl || a.cdnUrl || a.playUrl || fileUrl,
              cdnUrl: a.cdnUrl || a.fileUrl || a.playUrl || fileUrl,
              mediaType: a.mediaType || a.fileType || fileType,
              size: Number(a.size || a.fileSize || 0)
            }))
          : [{ title: 'Bài nộp của học sinh', fileUrl, cdnUrl: fileUrl, mediaType: fileType, size: 0 }];

        const nowIso = new Date().toISOString();
        const prevWb = (existingHw?.workbook_answers && typeof existingHw.workbook_answers === 'object')
          ? existingHw.workbook_answers
          : {};
        const incomingWb = (body.workbookAnswers && typeof body.workbookAnswers === 'object')
          ? body.workbookAnswers
          : {};
        const prevHistory = Array.isArray(prevWb._history) ? [...prevWb._history] : [];
        if (existingHw && (existingHw.file_url !== fileUrl || existingHw.status !== 'pending' || String(existingHw.student_note || '') !== cleanNote)) {
          prevHistory.push({
            version: prevHistory.length + 1,
            event: 'submission_superseded',
            file_url: existingHw.file_url,
            file_type: existingHw.file_type,
            student_note: existingHw.student_note || '',
            status: existingHw.status,
            score: existingHw.score ?? null,
            teacher_feedback: existingHw.teacher_feedback ?? null,
            submitted_at: existingHw.submitted_at,
            graded_at: existingHw.graded_at || null,
            archived_at: nowIso
          });
        }

        // KHÔNG chấp nhận cờ body.mirroredToIzTeach tự khai từ trình duyệt.
        // Trạng thái 'synced' chỉ được gán sau khi máy chủ xác thực biên nhận thực tế trên izTeach hoặc tự đồng bộ thành công.
        const nextVersion = (Number(prevWb._syncMeta?.version) || 0) + 1;
        const nextSubmissionCount = (Number(prevWb._syncMeta?.submissionCount) || 0) + 1;
        let initialSyncStatus = 'saved_to_supabase';
        if (unitResolution.isLiveClass) {
          initialSyncStatus = 'not_applicable_live_class';
        } else if (!unitResolution.valid) {
          initialSyncStatus = 'mapping_required';
        }

        const nextWorkbookAnswers = {
          ...prevWb,
          ...incomingWb,
          _history: prevHistory,
          _syncMeta: {
            ...(prevWb._syncMeta || {}),
            version: nextVersion,
            submissionCount: nextSubmissionCount,
            courseId,
            lessonNum,
            unitId: unitResolution.unitId || null,
            syncStatus: initialSyncStatus,
            izteachRemoteId: prevWb._syncMeta?.izteachRemoteId || null,
            updatedAt: nowIso
          }
        };

        const hwRecord = {
          id: hwId,
          student_code: sbStudent?.code || session.code || session.id,
          student_email: session.email,
          student_name: sbStudent?.name || session.name,
          class_code: realClassCode,
          course_id: courseId,
          lesson_num: lessonNum,
          lesson_title: String(body.lessonTitle || `Bài ${lessonNum}`),
          file_url: fileUrl,
          file_type: fileType,
          attachments: normalizedAttachments,
          workbook_answers: nextWorkbookAnswers,
          student_note: cleanNote,
          status: 'pending', // Mới nộp / nộp lại là pending (Chờ cô chấm)
          score: null,
          teacher_feedback: null,
          submitted_at: nowIso,
          updated_at: nowIso
        };

        const sbRes = await supabaseRequest(env, 'ktn_homeworks', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: hwRecord
        });

        if (!sbRes.ok || !Array.isArray(sbRes.data) || sbRes.data.length === 0) {
          return jsonResponse({
            ok: false,
            syncStatus: 'sync_failed',
            message: 'Máy chủ chưa lưu được bản ghi bài nộp vào cơ sở dữ liệu. Em hãy bấm Gửi lại nhé.'
          }, sbRes.status || 500);
        }

        let savedHw = sbRes.data[0];
        let izteachMirror = null;
        let finalSyncStatus = initialSyncStatus;

        if (unitResolution.isLiveClass) {
          izteachMirror = { ok: true, skipped: true, syncStatus: 'not_applicable_live_class', reason: 'LIVE_CLASS_HOMEWORK' };
        } else if (!unitResolution.valid) {
          izteachMirror = { ok: false, skipped: true, syncStatus: 'mapping_required', reason: unitResolution.reason || 'MAPPING_REQUIRED' };
        } else if (!body.skipIzTeachSync) {
          let verifiedReceipt = null;
          if (body.izteachRemoteId) {
            const checkReceipt = await verifyIzTeachHomeworkReceipt(env, {
              remoteId: body.izteachRemoteId,
              courseId,
              unitId: unitResolution.unitId,
              expectApproved: false
            });
            if (checkReceipt.verified) {
              verifiedReceipt = checkReceipt;
            }
          }

          if (verifiedReceipt) {
            finalSyncStatus = 'synced';
            izteachMirror = {
              ok: true,
              idempotent: true,
              verifiedReceipt: true,
              syncStatus: 'synced',
              remoteId: verifiedReceipt.remoteId,
              courseId,
              unitId: unitResolution.unitId
            };
          } else {
            izteachMirror = await mirrorHomeworkToIzTeach(env, savedHw, false, { unitId: unitResolution.unitId });
            finalSyncStatus = izteachMirror.syncStatus || (izteachMirror.ok ? 'synced' : 'sync_failed');
          }

          const updatedWb = {
            ...nextWorkbookAnswers,
            _syncMeta: {
              ...nextWorkbookAnswers._syncMeta,
              syncStatus: finalSyncStatus,
              izteachRemoteId: izteachMirror.remoteId || nextWorkbookAnswers._syncMeta.izteachRemoteId || null,
              lastSyncedSignature: izteachMirror.ok ? (izteachMirror.signature || null) : (nextWorkbookAnswers._syncMeta.lastSyncedSignature || null),
              lastSyncedAt: izteachMirror.ok ? new Date().toISOString() : (nextWorkbookAnswers._syncMeta.lastSyncedAt || null),
              lastError: izteachMirror.ok ? null : (izteachMirror.reason || izteachMirror.error || 'SYNC_FAILED')
            }
          };
          const metaPatch = await supabaseRequest(env, `ktn_homeworks?id=eq.${encodeURIComponent(savedHw.id)}`, {
            method: 'PATCH',
            prefer: 'return=representation',
            body: { workbook_answers: updatedWb, updated_at: new Date().toISOString() }
          });
          if (metaPatch.ok && Array.isArray(metaPatch.data) && metaPatch.data[0]) {
            savedHw = metaPatch.data[0];
          } else {
            savedHw.workbook_answers = updatedWb;
          }
        }

        // Gửi thông báo Web Push cho giáo viên phụ trách lớp khi học viên nộp bài tập (N24)
        let pushDispatch = null;
        if (realClassCode) {
          const clsTeachers = await resolveClassRecipientEmails(env, realClassCode, {
            onlyTeachers: true,
            excludeEmail: session.email
          });
          if (clsTeachers.recipientEmails.length > 0) {
            const subEventId = `NOTIF-SUB-${fnv1aHash36(String(savedHw.id || ''))}-${fnv1aHash36(String(savedHw.submitted_at || nowIso))}`;
            const subActionUrl = `/custom-page/so-lien-lac-test#/teacher?class=${encodeURIComponent(realClassCode)}&hwId=${encodeURIComponent(savedHw.id)}`;
            const pushPromise = dispatchWebPushForQuery(
              env,
              '',
              {
                id: subEventId,
                eventId: subEventId,
                eventType: 'homework_submitted',
                title: `Học viên nộp bài Lớp ${realClassCode}`,
                body: `${savedHw.student_name || session.name || session.email} · ${savedHw.lesson_title || ('Bài ' + lessonNum)}`,
                action_url: subActionUrl,
                classCode: realClassCode,
                homeworkId: savedHw.id
              },
              {
                eventId: subEventId,
                eventType: 'homework_submitted',
                recipientEmails: clsTeachers.recipientEmails,
                senderEmail: session.email,
                classCode: realClassCode
              }
            );
            if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(pushPromise);
            pushDispatch = await pushPromise;
          }
        }

        return jsonResponse({
          ok: true,
          syncStatus: finalSyncStatus,
          unitId: unitResolution.unitId || null,
          mirroredToIzTeach: Boolean(izteachMirror?.ok && !izteachMirror?.skipped),
          homework: savedHw,
          izteachMirror: izteachMirror || undefined,
          ...(pushDispatch ? { pushDispatch, pushDelivery: pushDispatch } : {})
        });
      });
    }

    if (path === '/api/ktn/homeworks/grade' && (request.method === 'PATCH' || request.method === 'POST')) {
      const session = await extractSessionFromRequest(request, env);
      if (!session || (session.role !== 'teacher' && session.role !== 'admin')) {
        return jsonResponse({ ok: false, message: 'Chỉ Giáo viên hoặc Quản lý mới được chấm điểm bài tập.' }, 403);
      }
      const body = await request.json().catch(() => ({}));
      let hwId = String(body.id || '').trim();
      const studentEmailHint = normalizeEmail(body.studentEmail || '');
      const lessonNumHint = Number(body.lessonNum || body.lessonNumber || 0);
      const courseIdHint = String(body.courseId || '').trim();
      if (!hwId && !studentEmailHint) {
        return jsonResponse({ ok: false, message: 'Thiếu mã bài tập id hoặc email học sinh.' }, 400);
      }

      let parsedScore = null;
      if (body.score !== undefined && body.score !== null && body.score !== '') {
        parsedScore = Number(body.score);
        if (!Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > 10 || Math.round(parsedScore * 2) !== parsedScore * 2) {
          return jsonResponse({
            ok: false,
            message: 'Điểm số không hợp lệ (chỉ chấp nhận thang điểm 0–10 với bước nhảy 0.5).'
          }, 400);
        }
      }

      // Thống nhất trạng thái với supabase_schema.sql: CHECK (status IN ('pending', 'graded', 'revision_requested'))
      const nextStatus = (body.status === 'revision_requested' || body.status === 'needs_revision')
        ? 'revision_requested'
        : 'graded';
      const cleanFeedback = String(body.teacherFeedback || body.feedback || '');
      const cleanAudioUrl = String(body.teacherAudioUrl || '');
      const gradeLockKey = `GRADE|${hwId || studentEmailHint}|${nextStatus}|${parsedScore ?? ''}|${cleanFeedback}|${cleanAudioUrl}`;

      return runWithHomeworkConcurrencyLock(gradeLockKey, async () => {
        // Tra cứu bản ghi hiện có trong ktn_homeworks theo id hoặc theo (student_email + lesson_num)
        let existingHw = null;
        if (hwId) {
          const hwLookup = await supabaseRequest(env, `ktn_homeworks?id=eq.${encodeURIComponent(hwId)}&select=*&limit=1`);
          if (!hwLookup.ok) {
            return jsonResponse({ ok: false, message: 'Không thể kiểm tra thông tin bài nộp.' }, hwLookup.status || 500);
          }
          existingHw = (Array.isArray(hwLookup.data) && hwLookup.data[0]) || null;
        }
        if (!existingHw && studentEmailHint && lessonNumHint > 0) {
          let fallbackQ = `ktn_homeworks?student_email=eq.${encodeURIComponent(studentEmailHint)}&lesson_num=eq.${lessonNumHint}&order=submitted_at.desc&limit=1`;
          if (courseIdHint) fallbackQ += `&course_id=eq.${encodeURIComponent(courseIdHint)}`;
          const fbRes = await supabaseRequest(env, fallbackQ);
          if (fbRes.ok && Array.isArray(fbRes.data) && fbRes.data[0]) {
            existingHw = fbRes.data[0];
            hwId = existingHw.id;
          }
        }

        // Nếu là Giáo viên: kiểm tra bài tập này có thuộc lớp cô chủ nhiệm hoặc khóa học được phân công (trả 403 nếu ngoài phạm vi)
        if (session.role === 'teacher') {
          if (!existingHw && !body.allowUpsertFromIzTeach) {
            return jsonResponse({ ok: false, message: 'Không tìm thấy bài nộp tương ứng trong cơ sở dữ liệu để cập nhật.' }, 404);
          }
          const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
          const assignedCourses = await getTeacherAssignedCourseIds(env, session.email);
          let hwClass = String(existingHw?.class_code || body.classCode || '').trim().toUpperCase();
          const hwCourseId = String(existingHw?.course_id || courseIdHint || '').trim().toLowerCase();
          if (!hwClass && (existingHw?.student_email || studentEmailHint)) {
            const targetEm = normalizeEmail(existingHw?.student_email || studentEmailHint);
            const stuClsRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(targetEm)}&select=class_code&limit=1`);
            if (stuClsRes.ok && Array.isArray(stuClsRes.data) && stuClsRes.data[0]?.class_code) {
              hwClass = String(stuClsRes.data[0].class_code).trim().toUpperCase();
            }
          }
          const canGradeByClass = Boolean(hwClass && assignedClasses.includes(hwClass));
          const canGradeByCourse = Boolean(!hwClass && hwCourseId && assignedCourses.includes(hwCourseId));
          if (!canGradeByClass && !canGradeByCourse) {
            return jsonResponse({
              ok: false,
              message: 'Cô không phụ trách lớp của bài nộp này nên không có quyền chấm điểm.'
            }, 403);
          }
        }

        // Kiểm tra chống chấm trùng lặp (Idempotency)
        if (
          existingHw &&
          existingHw.status === nextStatus &&
          Number(existingHw.score ?? -1) === Number(parsedScore ?? -1) &&
          String(existingHw.teacher_feedback || '') === cleanFeedback &&
          String(existingHw.teacher_audio_url || '') === cleanAudioUrl
        ) {
          const prevMeta = existingHw.workbook_answers?._syncMeta || {};
          if (prevMeta.syncStatus === 'synced' || prevMeta.syncStatus === 'not_applicable_live_class') {
            const lastGradedMs = Date.parse(existingHw.graded_at || existingHw.updated_at || '');
            const isImmediateDoubleClick = Number.isFinite(lastGradedMs) && Math.abs(Date.now() - lastGradedMs) <= 3000;
            let replayPushDispatch = null;
            if (!isImmediateDoubleClick && existingHw.student_email) {
              const regradeNowIso = new Date().toISOString();
              existingHw.graded_at = regradeNowIso;
              const regradePatchPromise = supabaseRequest(
                env,
                `ktn_homeworks?id=eq.${encodeURIComponent(existingHw.id)}`,
                {
                  method: 'PATCH',
                  body: { graded_at: regradeNowIso, updated_at: regradeNowIso }
                }
              ).catch(() => null);
              if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(regradePatchPromise);

              const targetStuEmail = normalizeEmail(existingHw.student_email);
              const rawNum = Number(existingHw.lesson_num || 1) || 1;
              const sessionNum = rawNum >= 100 ? Math.floor(rawNum / 100) : rawNum;
              const isLiveCls = String(existingHw.course_id || '').toUpperCase().startsWith('CLASS_') || rawNum >= 100;
              const gradedActionUrl = isLiveCls
                ? `/custom-page/so-lien-lac-test#/classrooms?class=${encodeURIComponent(String(existingHw.class_code || '').toUpperCase())}&session=${sessionNum}`
                : `/custom-page/so-lien-lac-test#/learning?courseId=${encodeURIComponent(String(existingHw.course_id || ''))}&lesson=${rawNum}&tab=homework`;
              const gradeEventId = `NOTIF-GRADED-${existingHw.id}-${existingHw.status}-${Date.now()}`;
              const pushPromise = dispatchWebPushForQuery(
                env,
                `user_email=eq.${encodeURIComponent(targetStuEmail)}`,
                {
                  id: gradeEventId,
                  eventId: gradeEventId,
                  eventType: 'homework_graded',
                  title: 'Cô giáo vừa chấm bài tập!',
                  body: `${existingHw.lesson_title || ('Bài ' + (existingHw.lesson_num || 1))}: ${existingHw.score ?? ''}/10 — ${String(existingHw.teacher_feedback || '').slice(0, 60)}`,
                  action_url: gradedActionUrl
                },
                {
                  eventId: gradeEventId,
                  eventType: 'homework_graded',
                  recipientEmails: targetStuEmail ? [targetStuEmail] : [],
                  senderEmail: session.email,
                  classCode: String(existingHw.class_code || '').trim().toUpperCase()
                }
              );
              if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(pushPromise);
              replayPushDispatch = await pushPromise;
            }
            return jsonResponse({
              ok: true,
              idempotent: true,
              idempotentReplay: true,
              syncStatus: prevMeta.syncStatus,
              unitId: prevMeta.unitId || null,
              mirroredToIzTeach: prevMeta.syncStatus === 'synced',
              homework: existingHw,
              izteachMirror: {
                ok: true,
                idempotent: true,
                idempotentReplay: true,
                syncStatus: prevMeta.syncStatus,
                remoteId: prevMeta.izteachRemoteId || null
              },
              ...(replayPushDispatch ? { pushDispatch: replayPushDispatch, pushDelivery: replayPushDispatch } : {})
            });
          }
        }

        const nowIso = new Date().toISOString();
        const prevWb = (existingHw?.workbook_answers && typeof existingHw.workbook_answers === 'object')
          ? existingHw.workbook_answers
          : {};
        const prevHistory = Array.isArray(prevWb._history) ? [...prevWb._history] : [];
        if (existingHw && (existingHw.status === 'graded' || existingHw.status === 'revision_requested')) {
          prevHistory.push({
            version: prevHistory.length + 1,
            event: 'grade_superseded',
            status: existingHw.status,
            score: existingHw.score ?? null,
            teacher_feedback: existingHw.teacher_feedback ?? null,
            graded_by: existingHw.graded_by || null,
            graded_at: existingHw.graded_at || null,
            archived_at: nowIso
          });
        }

        const targetCourseForGrade = existingHw?.course_id || courseIdHint || DEFAULT_COURSE_ID;
        const targetLessonForGrade = Number(existingHw?.lesson_num || lessonNumHint || 1);
        const unitResolution = await resolveAndVerifyCourseUnitId(env, targetCourseForGrade, targetLessonForGrade, body.unitId || prevWb._syncMeta?.unitId || null);
        if (!unitResolution.isLiveClass && body.unitId && !unitResolution.valid) {
          return jsonResponse({
            ok: false,
            error: 'UNIT_COURSE_MISMATCH',
            reason: unitResolution.reason || 'UNIT_COURSE_MISMATCH',
            message: 'Mã bài tập (unitId) không khớp với khóa học hoặc bài học đã chọn.'
          }, 400);
        }

        // KHÔNG chấp nhận cờ body.mirroredToIzTeach tự khai từ trình duyệt khi chấm bài.
        let initialSyncStatus = 'saved_to_supabase';
        if (unitResolution.isLiveClass) {
          initialSyncStatus = 'not_applicable_live_class';
        } else if (!unitResolution.valid) {
          initialSyncStatus = 'mapping_required';
        }

        const nextWorkbookAnswers = {
          ...prevWb,
          _history: prevHistory,
          _syncMeta: {
            ...(prevWb._syncMeta || {}),
            version: (Number(prevWb._syncMeta?.version) || 0) + 1,
            courseId: targetCourseForGrade,
            lessonNum: targetLessonForGrade,
            unitId: unitResolution.unitId || null,
            syncStatus: initialSyncStatus,
            updatedAt: nowIso
          }
        };

        const patchPayload = {
          status: nextStatus,
          score: parsedScore,
          teacher_feedback: cleanFeedback,
          teacher_audio_url: cleanAudioUrl,
          workbook_answers: nextWorkbookAnswers,
          graded_by: session.email,
          graded_at: nowIso,
          updated_at: nowIso
        };

        let savedHw = null;
        if (existingHw) {
          const sbRes = await supabaseRequest(env, `ktn_homeworks?id=eq.${encodeURIComponent(existingHw.id)}`, {
            method: 'PATCH',
            prefer: 'return=representation',
            body: patchPayload
          });
          if (!sbRes.ok || !Array.isArray(sbRes.data) || sbRes.data.length === 0) {
            return jsonResponse({
              ok: false,
              syncStatus: 'sync_failed',
              message: 'Không thể cập nhật trạng thái chấm bài trong cơ sở dữ liệu.'
            }, sbRes.status || 500);
          }
          savedHw = sbRes.data[0];
        } else if (body.allowUpsertFromIzTeach && studentEmailHint) {
          const upsertRow = {
            id: hwId || (`HW-${studentEmailHint}-${targetCourseForGrade}-L${targetLessonForGrade}`),
            student_code: String(body.studentCode || ''),
            student_email: studentEmailHint,
            student_name: String(body.studentName || studentEmailHint.split('@')[0]),
            class_code: body.classCode ? String(body.classCode).trim().toUpperCase() : null,
            course_id: targetCourseForGrade,
            lesson_num: targetLessonForGrade,
            lesson_title: String(body.lessonTitle || body.title || `Bài ${targetLessonForGrade}`),
            file_url: String(body.fileUrl || (Array.isArray(body.attachments) && body.attachments[0]?.cdnUrl) || 'https://d21acfi38wn3iy.cloudfront.net/'),
            file_type: String(body.fileType || (Array.isArray(body.attachments) && body.attachments[0]?.mediaType) || 'video'),
            attachments: Array.isArray(body.attachments) ? body.attachments : [],
            student_note: String(body.studentNote || ''),
            ...patchPayload
          };
          const upRes = await supabaseRequest(env, 'ktn_homeworks', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates,return=representation',
            body: upsertRow
          });
          if (!upRes.ok || !Array.isArray(upRes.data) || upRes.data.length === 0) {
            return jsonResponse({ ok: false, syncStatus: 'sync_failed', message: 'Không thể đồng bộ bản ghi bài tập sang cơ sở dữ liệu.' }, upRes.status || 500);
          }
          savedHw = upRes.data[0];
        } else {
          return jsonResponse({
            ok: false,
            message: 'Không tìm thấy bài nộp tương ứng trong cơ sở dữ liệu để cập nhật.'
          }, 404);
        }

        let izteachMirror = null;
        let finalSyncStatus = initialSyncStatus;
        if (unitResolution.isLiveClass) {
          izteachMirror = { ok: true, skipped: true, syncStatus: 'not_applicable_live_class', reason: 'LIVE_CLASS_HOMEWORK' };
        } else if (!unitResolution.valid) {
          izteachMirror = { ok: false, skipped: true, syncStatus: 'mapping_required', reason: unitResolution.reason || 'MAPPING_REQUIRED' };
        } else if (!body.skipIzTeachSync) {
          let verifiedReceipt = null;
          if (body.izteachRemoteId) {
            const checkReceipt = await verifyIzTeachHomeworkReceipt(env, {
              remoteId: body.izteachRemoteId,
              courseId: targetCourseForGrade,
              unitId: unitResolution.unitId,
              expectApproved: nextStatus === 'graded',
              expectedScore: parsedScore
            });
            if (checkReceipt.verified) {
              verifiedReceipt = checkReceipt;
            }
          }

          if (verifiedReceipt) {
            finalSyncStatus = 'synced';
            izteachMirror = {
              ok: true,
              idempotent: true,
              verifiedReceipt: true,
              syncStatus: 'synced',
              remoteId: verifiedReceipt.remoteId,
              courseId: targetCourseForGrade,
              unitId: unitResolution.unitId
            };
          } else {
            izteachMirror = await mirrorHomeworkToIzTeach(env, savedHw, nextStatus === 'graded', { unitId: unitResolution.unitId });
            finalSyncStatus = izteachMirror.syncStatus || (izteachMirror.ok ? 'synced' : 'sync_failed');
          }

          const updatedWb = {
            ...nextWorkbookAnswers,
            _syncMeta: {
              ...nextWorkbookAnswers._syncMeta,
              syncStatus: finalSyncStatus,
              izteachRemoteId: izteachMirror.remoteId || nextWorkbookAnswers._syncMeta.izteachRemoteId || null,
              lastSyncedSignature: izteachMirror.ok ? (izteachMirror.signature || null) : (nextWorkbookAnswers._syncMeta.lastSyncedSignature || null),
              lastSyncedAt: izteachMirror.ok ? new Date().toISOString() : (nextWorkbookAnswers._syncMeta.lastSyncedAt || null),
              lastError: izteachMirror.ok ? null : (izteachMirror.reason || izteachMirror.error || 'SYNC_FAILED')
            }
          };
          const metaPatch = await supabaseRequest(env, `ktn_homeworks?id=eq.${encodeURIComponent(savedHw.id)}`, {
            method: 'PATCH',
            prefer: 'return=representation',
            body: { workbook_answers: updatedWb, updated_at: new Date().toISOString() }
          });
          if (metaPatch.ok && Array.isArray(metaPatch.data) && metaPatch.data[0]) {
            savedHw = metaPatch.data[0];
          } else {
            savedHw.workbook_answers = updatedWb;
          }
        }

        let pushDispatch = null;
        if (savedHw?.student_email) {
          const targetStuEmail = normalizeEmail(savedHw.student_email);
          const rawNum = Number(savedHw.lesson_num || 1) || 1;
          const sessionNum = rawNum >= 100 ? Math.floor(rawNum / 100) : rawNum;
          const gradedActionUrl = unitResolution.isLiveClass
            ? `/custom-page/so-lien-lac-test#/classrooms?class=${encodeURIComponent(String(savedHw.class_code || '').toUpperCase())}&session=${sessionNum}`
            : `/custom-page/so-lien-lac-test#/learning?courseId=${encodeURIComponent(String(savedHw.course_id || ''))}&lesson=${rawNum}&tab=homework`;
          const gradeEventId = `NOTIF-GRADED-${savedHw.id}-${savedHw.status}-${Date.now()}`;
          const pushPromise = dispatchWebPushForQuery(
            env,
            `user_email=eq.${encodeURIComponent(targetStuEmail)}`,
            {
              id: gradeEventId,
              eventId: gradeEventId,
              eventType: 'homework_graded',
              title: 'Cô giáo vừa chấm bài tập!',
              body: `${savedHw.lesson_title || ('Bài ' + (savedHw.lesson_num || 1))}: ${savedHw.score ?? ''}/10 — ${String(savedHw.teacher_feedback || '').slice(0, 60)}`,
              action_url: gradedActionUrl
            },
            {
              eventId: gradeEventId,
              eventType: 'homework_graded',
              recipientEmails: targetStuEmail ? [targetStuEmail] : [],
              senderEmail: session.email,
              classCode: String(savedHw.class_code || '').trim().toUpperCase()
            }
          );
          if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(pushPromise);
          pushDispatch = await pushPromise;
        }

        return jsonResponse({
          ok: true,
          syncStatus: finalSyncStatus,
          unitId: unitResolution.unitId || null,
          mirroredToIzTeach: Boolean(izteachMirror?.ok && !izteachMirror?.skipped),
          homework: savedHw,
          izteachMirror: izteachMirror || undefined,
          ...(pushDispatch ? { pushDispatch, pushDelivery: pushDispatch } : {})
        });
      });
    }

    // ------------------------------------------------------------------------
    // E2. BUỔI HỌC & BÀI TẬP THEO LỚP CÔ GIÁO (/api/ktn/class-sessions)
    // ------------------------------------------------------------------------
    if (path === '/api/ktn/class-sessions') {
      if (request.method === 'GET') {
        const session = await extractSessionFromRequest(request, env);
        if (!session) {
          return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập để xem nội dung buổi học.' }, 401);
        }

        const classCode = String(url.searchParams.get('classCode') || '').trim().toUpperCase();
        if (!classCode) {
          return jsonResponse({ ok: false, message: 'Thiếu mã lớp classCode.' }, 400);
        }

        const clsLookup = await supabaseRequest(
          env,
          `ktn_classes?id=eq.${encodeURIComponent(classCode)}&select=id,active&limit=1`
        );
        const clsRow = clsLookup.ok && Array.isArray(clsLookup.data) && clsLookup.data[0] ? clsLookup.data[0] : null;
        if (clsRow && clsRow.active === false) {
          return jsonResponse({
            ok: false,
            error: 'CLASS_ARCHIVED_OR_INACTIVE',
            classCode,
            message: `Lớp ${classCode} đã được lưu trữ hoặc ngừng hoạt động.`
          }, 403);
        }

        if (session.role === 'teacher') {
          const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
          if (!assignedClasses.includes(classCode)) {
            return jsonResponse({
              ok: false,
              error: 'TEACHER_CLASS_SCOPE_FORBIDDEN',
              message: `Cô không phụ trách lớp ${classCode} nên không có quyền truy cập buổi học của lớp này.`
            }, 403);
          }
        } else if (session.role === 'student') {
          const stuRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(session.email)}&select=class_code&limit=1`);
          const stuRow = (stuRes.ok && Array.isArray(stuRes.data) && stuRes.data[0]) ? stuRes.data[0] : null;
          const realClassCode = stuRow
            ? String(stuRow.class_code || '').trim().toUpperCase()
            : String(session.classCode || '').trim().toUpperCase();
          if (!realClassCode || realClassCode !== classCode) {
            return jsonResponse({
              ok: false,
              error: 'STUDENT_CLASS_SCOPE_FORBIDDEN',
              message: `Em không thuộc lớp ${classCode} nên không có quyền xem buổi học của lớp này.`
            }, 403);
          }
        }

        const sessions = await getMergedClassSessions(classCode);
        return jsonResponse({ ok: true, classCode, sessions });
      }

      if (request.method === 'POST') {
        const session = await extractSessionFromRequest(request, env);
        if (!session || (session.role !== 'teacher' && session.role !== 'admin')) {
          return jsonResponse({ ok: false, message: 'Chỉ Giáo viên hoặc Quản lý mới được cập nhật buổi học.' }, 403);
        }
        const body = await request.json().catch(() => ({}));
        const classCode = String(body.classCode || '').trim().toUpperCase();
        if (!classCode) {
          return jsonResponse({ ok: false, message: 'Vui lòng chọn mã lớp học.' }, 400);
        }
        const clsLookup = await supabaseRequest(
          env,
          `ktn_classes?id=eq.${encodeURIComponent(classCode)}&select=id,active&limit=1`
        );
        const clsRow = clsLookup.ok && Array.isArray(clsLookup.data) && clsLookup.data[0] ? clsLookup.data[0] : null;
        if (clsRow && clsRow.active === false) {
          return jsonResponse({
            ok: false,
            error: 'CLASS_ARCHIVED_OR_INACTIVE',
            classCode,
            message: `Lớp ${classCode} đã được lưu trữ nên không thể cập nhật hoặc giao bài tập mới.`
          }, 403);
        }
        if (session.role === 'teacher') {
          const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
          if (!assignedClasses.includes(classCode)) {
            return jsonResponse({
              ok: false,
              error: 'TEACHER_CLASS_SCOPE_FORBIDDEN',
              message: `Cô không phụ trách lớp ${classCode} nên không có quyền sửa buổi học của lớp này.`
            }, 403);
          }
        }
        const sessionNum = Math.max(1, Number(body.sessionNum || body.session_num) || 1);
        const title = String(body.title || body.session_title || `Buổi ${sessionNum}`).trim();
        const rawExercises = Array.isArray(body.exercises)
          ? body.exercises
          : (Array.isArray(body.assignments) ? body.assignments : []);
        const exercises = rawExercises.map((ex, idx) => ({
          id: String(ex?.id || `${classCode}-B${sessionNum}-E${idx + 1}`).trim(),
          num: Number(ex?.num || ex?.order) || (idx + 1),
          title: String(ex?.title || `Bài ${idx + 1}`).trim(),
          prompt: String(ex?.prompt || ex?.instruction || '').trim(),
          type: String(ex?.type || 'audio').trim()
        }));

        const rowToSave = {
          id: `${classCode}-B${sessionNum}`,
          class_code: classCode,
          session_num: sessionNum,
          session_title: title,
          exercises,
          updated_by: session.email,
          updated_at: new Date().toISOString()
        };

        const sbRes = await supabaseRequest(env, 'ktn_class_sessions?on_conflict=class_code,session_num', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: rowToSave
        });

        if (!sbRes.ok || !Array.isArray(sbRes.data) || sbRes.data.length === 0) {
          return jsonResponse({
            ok: false,
            message: 'Chưa lưu được buổi học vào cơ sở dữ liệu máy chủ.'
          }, sbRes.status || 500);
        }

        const saved = sbRes.data[0];
        const clsRecipients = await resolveClassRecipientEmails(env, classCode, {
          includeTeacher: false,
          excludeEmail: session.email
        });
        const exSig = fnv1aHex(
          JSON.stringify({
            title,
            exercises: exercises.map((e) => ({ id: e.id, num: e.num, title: e.title, prompt: e.prompt }))
          })
        );
        const assignEventId = String(
          body.eventId || body.clientRequestId || `NOTIF-ASSIGN-${classCode}-S${sessionNum}-${exSig}`
        ).trim();
        const assignActionUrl = `/custom-page/so-lien-lac-test#/classrooms?class=${encodeURIComponent(classCode)}&session=${sessionNum}`;
        const assignPushPromise = dispatchWebPushForQuery(
          env,
          '',
          {
            id: assignEventId,
            eventId: assignEventId,
            eventType: 'homework_assigned',
            title: `Bài tập mới Lớp ${classCode} · Buổi ${sessionNum}`,
            body: `${saved.session_title || title}${exercises.length ? ` (${exercises.length} bài tập)` : ''}`,
            action_url: assignActionUrl,
            classCode
          },
          {
            eventId: assignEventId,
            eventType: 'homework_assigned',
            recipientEmails: clsRecipients.recipientEmails,
            senderEmail: session.email,
            classCode
          }
        );
        if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(assignPushPromise);
        const pushDispatch = await assignPushPromise;

        return jsonResponse({
          ok: true,
          sessionItem: {
            id: saved.id,
            classCode: saved.class_code,
            session_num: saved.session_num,
            sessionNum: saved.session_num,
            session_title: saved.session_title,
            title: saved.session_title,
            exercises: saved.exercises || [],
            updatedBy: saved.updated_by,
            updatedAt: saved.updated_at
          },
          pushDispatch,
          pushDelivery: pushDispatch
        });
      }
    }

    // ------------------------------------------------------------------------
    // F. NHÓM LỚP & KÊNH TRAO ĐỔI (CLASS / COURSE / 1-1 + GHIM THÔNG BÁO + DLP)
    // ------------------------------------------------------------------------
    const loadChatReadStateMap = async (userEmail) => {
      const cleanEm = normalizeEmail(userEmail);
      if (!cleanEm) return {};
      const rs = await supabaseRequest(
        env,
        `ktn_dlp_alerts?room_id=eq.CHAT_READ_STATE&sender_email=eq.${encodeURIComponent(cleanEm)}&order=created_at.desc&limit=20`
      );
      const map = {};
      if (rs.ok && Array.isArray(rs.data)) {
        for (const r of rs.data.slice().reverse()) {
          try {
            const parsed = JSON.parse(r.blocked_content || '{}');
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              Object.assign(map, parsed);
            }
          } catch {}
        }
      }
      return map;
    };

    if (path === '/api/ktn/messages/read' && (request.method === 'POST' || request.method === 'PATCH')) {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      const body = await request.json().catch(() => ({}));
      const rawRoomId = String(body.roomId || body.classCode || '').trim();
      const access = await canAccessChatRoom(env, session, rawRoomId);
      if (!access.allowed) {
        return jsonResponse({
          ok: false,
          ...(access.error ? { error: access.error } : {}),
          ...(access.code ? { code: access.code } : {}),
          message: access.message
        }, access.status);
      }
      const canonicalRoom = access.roomId;
      const lastReadMessageId = String(body.lastReadMessageId || body.messageId || '').trim() || null;
      const lastReadAt = String(body.lastReadAt || new Date().toISOString()).trim();

      const existingRes = await supabaseRequest(
        env,
        `ktn_dlp_alerts?room_id=eq.CHAT_READ_STATE&sender_email=eq.${encodeURIComponent(session.email)}&order=created_at.desc&limit=20`
      );
      const existingRows = (existingRes.ok && Array.isArray(existingRes.data)) ? existingRes.data : [];
      const mergedMap = {};
      for (const r of existingRows.slice().reverse()) {
        try {
          const parsed = JSON.parse(r.blocked_content || '{}');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            Object.assign(mergedMap, parsed);
          }
        } catch {}
      }
      const entry = {
        roomId: canonicalRoom,
        lastReadMessageId,
        lastReadAt,
        updatedAt: new Date().toISOString()
      };
      mergedMap[canonicalRoom] = entry;
      if (access.classCode) {
        mergedMap[access.classCode] = entry;
        mergedMap[`class:${access.classCode}`] = entry;
      }

      let sbRes = null;
      const latestRow = existingRows[0];
      if (latestRow && latestRow.id) {
        sbRes = await supabaseRequest(env, `ktn_dlp_alerts?id=eq.${encodeURIComponent(latestRow.id)}`, {
          method: 'PATCH',
          prefer: 'return=representation',
          body: { blocked_content: JSON.stringify(mergedMap) }
        });
      }
      if (!sbRes || !sbRes.ok || !Array.isArray(sbRes.data) || sbRes.data.length === 0) {
        sbRes = await supabaseRequest(env, 'ktn_dlp_alerts', {
          method: 'POST',
          prefer: 'return=representation',
          body: {
            id: 'CREAD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
            room_id: 'CHAT_READ_STATE',
            sender_email: session.email,
            sender_name: session.name || session.email,
            sender_role: session.role || 'student',
            blocked_content: JSON.stringify(mergedMap),
            reason: 'CHAT_ROOM_READ_STATE'
          }
        });
      }
      if (!sbRes || !sbRes.ok) {
        return jsonResponse({ ok: false, message: 'Chưa lưu được trạng thái đã đọc hội thoại.' }, sbRes?.status || 503);
      }
      return jsonResponse({
        ok: true,
        roomId: canonicalRoom,
        readState: entry,
        readStateByRoom: mergedMap
      });
    }

    if (path === '/api/ktn/messages/rooms' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);

      const readStateByRoom = await loadChatReadStateMap(session.email);
      const myEmail = normalizeEmail(session.email);

      const enrichRoomsWithStats = async (roomsList) => {
        if (!Array.isArray(roomsList) || roomsList.length === 0) return roomsList;
        const queryKeys = new Set();
        for (const r of roomsList) {
          if (r.roomId) queryKeys.add(r.roomId);
          if (r.classCode) {
            queryKeys.add(r.classCode);
            queryKeys.add(`class:${r.classCode}`);
          }
        }
        const inParam = Array.from(queryKeys).map(k => encodeURIComponent(k)).join(',');
        if (!inParam) return roomsList;
        const recentRes = await supabaseRequest(
          env,
          `ktn_messages?room_id=in.(${inParam})&order=created_at.desc&limit=200`
        );
        const recentMsgs = (recentRes.ok && Array.isArray(recentRes.data)) ? recentRes.data : [];
        return roomsList.map(r => {
          const matchKeys = new Set([r.roomId, r.classCode, r.classCode ? `class:${r.classCode}` : ''].filter(Boolean));
          const roomMsgs = recentMsgs.filter(m => m && matchKeys.has(String(m.room_id || m.class_code || '').trim()));
          roomMsgs.sort((a, b) => (Date.parse(a.created_at || '') - Date.parse(b.created_at || '')) || String(a.id || '').localeCompare(String(b.id || '')));
          const latest = roomMsgs[roomMsgs.length - 1] || null;
          const readEntry = readStateByRoom[r.roomId] || (r.classCode ? readStateByRoom[r.classCode] : null) || null;
          const lastReadAtMs = readEntry?.lastReadAt ? Date.parse(readEntry.lastReadAt) : 0;
          const lastReadId = readEntry?.lastReadMessageId || null;
          let unreadCount = 0;
          for (const m of roomMsgs) {
            if (normalizeEmail(m.sender_email) === myEmail) continue;
            if (lastReadId && m.id === lastReadId) {
              unreadCount = 0;
              continue;
            }
            const mTs = Date.parse(m.created_at || '') || 0;
            if (!lastReadAtMs || mTs > lastReadAtMs) {
              unreadCount++;
            }
          }
          return {
            ...r,
            lastMessage: latest ? String(latest.content || '').slice(0, 100) : (r.lastMessage || ''),
            lastSenderName: latest?.sender_name || r.lastSenderName || '',
            lastSenderRole: latest?.sender_role || r.lastSenderRole || '',
            updatedAt: latest?.created_at || r.updatedAt || '',
            lastMessageId: latest?.id || null,
            lastReadMessageId: lastReadId,
            unreadCount,
            unread: unreadCount > 0
          };
        });
      };

      if (session.role === 'student') {
        const stuRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(session.email)}&limit=1`);
        const stuRow = (stuRes.ok && Array.isArray(stuRes.data) && stuRes.data[0]) ? stuRes.data[0] : null;
        const classCode = stuRow
          ? String(stuRow.class_code || '').trim().toUpperCase()
          : String(session.classCode || '').trim().toUpperCase();
        const onlineList = stuRow
          ? (Array.isArray(stuRow.online_courses) ? stuRow.online_courses : [])
          : (Array.isArray(session.onlineCourses) ? session.onlineCourses : []);

        const rawGroupRooms = [];
        const seenRoomIds = new Set();
        let studentTeacherName = 'Chưa phân công giáo viên';
        if (classCode) {
          const clsCheckRes = await supabaseRequest(
            env,
            `ktn_classes?id=eq.${encodeURIComponent(classCode)}&select=*&limit=1`
          ).catch(() => ({ ok: false, data: [] }));
          const clsRow = (clsCheckRes.ok && Array.isArray(clsCheckRes.data) && clsCheckRes.data[0])
            ? clsCheckRes.data[0]
            : null;
          // Chỉ hiển thị nhóm lớp đang hoạt động (active !== false)
          if (!clsRow || clsRow.active !== false) {
            if (clsRow?.teacher_email) {
              const tRes = await supabaseRequest(
                env,
                `ktn_teachers?email=eq.${encodeURIComponent(normalizeEmail(clsRow.teacher_email))}&select=name,active&limit=1`
              ).catch(() => ({ ok: false, data: [] }));
              const tRow = (tRes.ok && Array.isArray(tRes.data) && tRes.data[0]) ? tRes.data[0] : null;
              if (tRow && tRow.active !== false && tRow.name) {
                studentTeacherName = String(tRow.name).trim();
              } else if (clsRow?.teacher_name) {
                studentTeacherName = String(clsRow.teacher_name).trim();
              }
            } else if (clsRow?.teacher_code) {
              const tRes = await supabaseRequest(
                env,
                `ktn_teachers?code=eq.${encodeURIComponent(String(clsRow.teacher_code).trim())}&select=name,active&limit=1`
              ).catch(() => ({ ok: false, data: [] }));
              const tRow = (tRes.ok && Array.isArray(tRes.data) && tRes.data[0]) ? tRes.data[0] : null;
              if (tRow && tRow.active !== false && tRow.name) {
                studentTeacherName = String(tRow.name).trim();
              } else if (clsRow?.teacher_name) {
                studentTeacherName = String(clsRow.teacher_name).trim();
              }
            }
            const rid = `class:${classCode}`;
            seenRoomIds.add(rid);
            rawGroupRooms.push({
              roomId: rid,
              type: 'class',
              roomType: 'class',
              classCode,
              className: String(clsRow?.name || `Lớp ${classCode}`).trim(),
              teacherName: studentTeacherName,
              teacherEmail: clsRow?.teacher_email ? normalizeEmail(clsRow.teacher_email) : '',
              label: `🏫 Lớp ${classCode}`,
              shortLabel: `Lớp ${classCode}`
            });
          }
        }
        for (const c of onlineList) {
          const rawCid = String(c?.id || c?._id || c || '').trim().toLowerCase();
          if (!rawCid) continue;
          const canonicalCid = COURSE_CHAT_ALIASES[rawCid] || rawCid;
          const rid = `course:${canonicalCid}`;
          if (seenRoomIds.has(rid)) continue;
          seenRoomIds.add(rid);
          const meta = MASTER_PRODUCT_MAPPING[canonicalCid] || {};
          const shortTitle = meta.shortTitle || c?.shortTitle || c?.title || 'Khóa học Video';
          rawGroupRooms.push({
            roomId: rid,
            type: 'course',
            roomType: 'course',
            courseId: canonicalCid,
            rawCourseId: rawCid,
            teacherName: 'Ban Giảng Huấn KTN',
            label: `🎬 ${shortTitle}`,
            shortLabel: shortTitle
          });
        }
        const rawPrivateRoom = {
          roomId: `student:${myEmail}`,
          type: 'student',
          roomType: 'student',
          studentEmail: myEmail,
          label: '👩‍🏫 Nhắn riêng Cô',
          teacherName: studentTeacherName
        };
        const enrichedAll = await enrichRoomsWithStats([...rawGroupRooms, rawPrivateRoom]);
        const groupRooms = enrichedAll.slice(0, rawGroupRooms.length);
        const privateRoom = enrichedAll[rawGroupRooms.length] || rawPrivateRoom;
        return jsonResponse({ ok: true, role: 'student', groupRooms, privateRoom, readStateByRoom });
      }

      // Teacher hoặc Admin: lấy danh sách lớp thực tế đang hoạt động từ ktn_classes (không hardcode 3 lớp)
      const [activeClsRes, activeTeaRes] = await Promise.all([
        supabaseRequest(env, 'ktn_classes?active=eq.true&order=created_at.asc,id.asc').catch(() => ({ ok: false, data: [] })),
        supabaseRequest(env, 'ktn_teachers?active=eq.true').catch(() => ({ ok: false, data: [] }))
      ]);
      const allActiveClasses = (activeClsRes.ok && Array.isArray(activeClsRes.data))
        ? activeClsRes.data.filter(c => c && c.active !== false && String(c.id || '').trim())
        : [];
      const activeTeacherLookup = new Map();
      if (activeTeaRes.ok && Array.isArray(activeTeaRes.data)) {
        for (const t of activeTeaRes.data) {
          if (t?.active === false) continue;
          if (t?.email) activeTeacherLookup.set(normalizeEmail(t.email), t);
          const tCodeKey = String(t?.code || t?.teacher_code || '').trim().toUpperCase();
          if (tCodeKey) activeTeacherLookup.set(tCodeKey, t);
        }
      }
      const activeClassMetaMap = new Map();
      for (const c of allActiveClasses) {
        const cid = String(c.id || '').trim().toUpperCase();
        if (!cid) continue;
        const cEmail = normalizeEmail(c.teacher_email || '');
        const cCode = String(c.teacher_code || '').trim().toUpperCase();
        const tMatch = (cEmail && activeTeacherLookup.get(cEmail)) || (!cEmail && cCode && activeTeacherLookup.get(cCode)) || null;
        activeClassMetaMap.set(cid, {
          id: cid,
          name: String(c.name || `Lớp ${cid}`).trim(),
          teacherName: tMatch?.name ? String(tMatch.name).trim() : 'Chưa phân công giáo viên',
          teacherEmail: cEmail || normalizeEmail(tMatch?.email || ''),
          active: true
        });
      }

      const assignedClasses = session.role === 'admin'
        ? Array.from(activeClassMetaMap.keys())
        : await getTeacherAssignedClassCodes(env, session.email);
      const rawGroupRooms = [];
      const seenGroupIds = new Set();
      for (const rawCls of assignedClasses) {
        const cls = String(rawCls || '').trim().toUpperCase();
        if (!cls) continue;
        const rid = `class:${cls}`;
        if (seenGroupIds.has(rid)) continue;
        seenGroupIds.add(rid);
        const clsMeta = activeClassMetaMap.get(cls);
        rawGroupRooms.push({
          roomId: rid,
          type: 'class',
          roomType: 'class',
          classCode: cls,
          className: clsMeta?.name || `Lớp ${cls}`,
          teacherName: clsMeta?.teacherName || (session.role === 'teacher' ? (session.name || 'Giáo viên phụ trách') : 'Chưa phân công giáo viên'),
          teacherEmail: clsMeta?.teacherEmail || (session.role === 'teacher' ? normalizeEmail(session.email) : ''),
          label: `🏫 Lớp ${cls}`,
          shortLabel: `Lớp ${cls}`
        });
      }
      const primaryCourseIds = session.role === 'admin'
        ? [
            '6adadba969897b0002482ca5',
            '65e7704a9ea90c00080d5195',
            '65e769bd637339000870618f'
          ]
        : await getTeacherAssignedCourseIds(env, session.email);
      for (const cid of primaryCourseIds) {
        const meta = MASTER_PRODUCT_MAPPING[cid];
        if (!meta) continue;
        const rid = `course:${cid}`;
        if (seenGroupIds.has(rid)) continue;
        seenGroupIds.add(rid);
        rawGroupRooms.push({
          roomId: rid,
          type: 'course',
          roomType: 'course',
          courseId: cid,
          teacherName: 'Ban Giảng Huấn KTN',
          label: `🎬 Khóa ${meta.shortTitle}`,
          shortLabel: `Khóa ${meta.shortTitle}`
        });
      }

      const assignedClassesSet = new Set(
        assignedClasses.map(c => String(c || '').trim().toUpperCase()).filter(Boolean)
      );
      const stuQueryPath = session.role === 'teacher'
        ? (assignedClasses.length > 0
            ? `ktn_students?or=(class_code.in.(${assignedClasses.map(c => encodeURIComponent(c)).join(',')}),class_code.is.null,class_code.eq.)&order=updated_at.desc&limit=50`
            : 'ktn_students?or=(class_code.is.null,class_code.eq.)&order=updated_at.desc&limit=50')
        : 'ktn_students?order=updated_at.desc&limit=50';

      const [privMsgRes, stuListRes, groupRooms] = await Promise.all([
        supabaseRequest(env, 'ktn_messages?room_id=like.student:*&order=created_at.desc&limit=100'),
        supabaseRequest(env, stuQueryPath),
        enrichRoomsWithStats(rawGroupRooms)
      ]);
      const stuMap = new Map();
      if (stuListRes.ok && Array.isArray(stuListRes.data)) {
        for (const s of stuListRes.data) {
          const em = normalizeEmail(s?.email || '');
          if (em) stuMap.set(em, s);
        }
      }

      if (session.role === 'teacher' && privMsgRes.ok && Array.isArray(privMsgRes.data)) {
        const missingEmails = [];
        for (const m of privMsgRes.data) {
          const rid = String(m?.room_id || m?.class_code || '').trim().toLowerCase();
          if (!rid.startsWith('student:')) continue;
          const stuEmail = normalizeEmail(rid.slice(8));
          if (stuEmail && !stuMap.has(stuEmail) && !missingEmails.includes(stuEmail)) {
            missingEmails.push(stuEmail);
          }
        }
        if (missingEmails.length > 0) {
          const extraStuRes = await supabaseRequest(
            env,
            `ktn_students?email=in.(${missingEmails.map(e => encodeURIComponent(e)).join(',')})&select=email,name,class_code,updated_at`
          );
          if (extraStuRes.ok && Array.isArray(extraStuRes.data)) {
            for (const s of extraStuRes.data) {
              const em = normalizeEmail(s?.email || '');
              if (em) stuMap.set(em, s);
            }
          }
        }
      }

      const isStudentAllowedForTeacher = (stuInfo) => {
        if (session.role !== 'teacher') return true;
        const stuCls = String(stuInfo?.class_code || '').trim().toUpperCase();
        if (stuCls && !assignedClassesSet.has(stuCls)) return false;
        return true;
      };

      const threadMap = new Map();
      if (privMsgRes.ok && Array.isArray(privMsgRes.data)) {
        for (const m of privMsgRes.data) {
          const rid = String(m?.room_id || m?.class_code || '').trim().toLowerCase();
          if (!rid.startsWith('student:')) continue;
          const stuEmail = normalizeEmail(rid.slice(8));
          if (!stuEmail || threadMap.has(stuEmail)) continue;
          const stuInfo = stuMap.get(stuEmail);
          if (!isStudentAllowedForTeacher(stuInfo)) continue;
          const studentName = stuInfo?.name || (m.sender_role === 'student' ? m.sender_name : '') || stuEmail;
          const roomKey = `student:${stuEmail}`;
          const readEntry = readStateByRoom[roomKey] || null;
          const lastReadAtMs = readEntry?.lastReadAt ? Date.parse(readEntry.lastReadAt) : 0;
          const msgTs = Date.parse(m.created_at || '') || 0;
          const isUnread = m.sender_role === 'student' && (!readEntry || (readEntry.lastReadMessageId !== m.id && msgTs > lastReadAtMs));
          threadMap.set(stuEmail, {
            roomId: roomKey,
            type: 'student',
            studentEmail: stuEmail,
            studentName,
            classCode: stuInfo?.class_code || '',
            label: `👩‍🏫 ${studentName}`,
            lastMessage: String(m.content || '').slice(0, 80),
            lastSenderRole: m.sender_role || '',
            updatedAt: m.created_at || '',
            lastMessageId: m.id || null,
            lastReadMessageId: readEntry?.lastReadMessageId || null,
            unreadCount: isUnread ? 1 : 0,
            unread: isUnread
          });
        }
      }
      for (const [em, s] of stuMap.entries()) {
        if (threadMap.has(em)) continue;
        if (!isStudentAllowedForTeacher(s)) continue;
        const studentName = s?.name || em;
        threadMap.set(em, {
          roomId: `student:${em}`,
          type: 'student',
          studentEmail: em,
          studentName,
          classCode: s?.class_code || '',
          label: `👩‍🏫 ${studentName}`,
          lastMessage: 'Nhắn riêng 1-1 với học viên',
          lastSenderRole: '',
          updatedAt: s?.updated_at || '',
          unreadCount: 0,
          unread: false
        });
      }

      return jsonResponse({
        ok: true,
        role: session.role,
        groupRooms,
        privateThreads: Array.from(threadMap.values()),
        readStateByRoom
      });
    }

    if (path === '/api/ktn/messages/pin' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      if (session.role !== 'teacher' && session.role !== 'admin') {
        return jsonResponse({
          ok: false,
          message: 'Chỉ giáo viên hoặc quản trị viên mới có quyền ghim thông báo nhóm lớp.'
        }, 403);
      }
      const body = await request.json().catch(() => ({}));
      const rawRoomId = String(body.roomId || body.classCode || '').trim();
      let access = await canAccessChatRoom(env, session, rawRoomId);
      if (!access.allowed && access.error === 'TEACHER_COURSE_SCOPE_FORBIDDEN' && session.role === 'teacher') {
        const cleanEmail = normalizeEmail(session.email || '');
        if (cleanEmail === 'linh.lam@khongtunhi.com' && (await isActiveTeacherSession(env, session))) {
          const tRes = await supabaseRequest(env, `ktn_teachers?email=eq.${encodeURIComponent(cleanEmail)}&limit=1`);
          const tRow = (tRes.ok && Array.isArray(tRes.data) && tRes.data[0]) ? tRes.data[0] : null;
          if (tRow && tRow.assigned_courses === undefined && tRow.aliases === undefined) {
            const desc = parseChatRoomDescriptor(rawRoomId);
            if (desc.valid) access = { allowed: true, status: 200, ...desc };
          }
        }
      }
      if (!access.allowed) {
        return jsonResponse({
          ok: false,
          ...(access.error ? { error: access.error } : {}),
          ...(access.code ? { code: access.code } : {}),
          message: access.message
        }, access.status);
      }
      const content = String(body.content || body.text || '').trim();
      if (!content) {
        return jsonResponse({ ok: false, message: 'Nội dung thông báo ghim không được để trống.' }, 400);
      }
      const saved = await saveRoomPinnedAnnouncement(env, session, access, content, body.messageId || null);
      if (!saved.ok) {
        return jsonResponse({ ok: false, message: 'Không thể lưu thông báo ghim.' }, saved.status || 503);
      }
      return jsonResponse({
        ok: true,
        roomId: access.roomId,
        pinnedMessage: saved.pinnedMessage
      });
    }

    if (path === '/api/ktn/messages' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      const rawRoomId = url.searchParams.get('roomId') || url.searchParams.get('classCode') || '';
      const access = await canAccessChatRoom(env, session, rawRoomId);
      if (!access.allowed) {
        return jsonResponse({
          ok: false,
          ...(access.error ? { error: access.error } : {}),
          ...(access.code ? { code: access.code } : {}),
          message: access.message
        }, access.status);
      }
      const requestedLimit = Number(url.searchParams.get('limit') || 100);
      const pageLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(200, Math.max(1, Math.floor(requestedLimit)))
        : 100;
      const beforeCursor = String(url.searchParams.get('before') || '').trim();

      const inList = (access.queryKeys || [access.classCode]).map(k => encodeURIComponent(k)).join(',');
      // BUG CHAT-05 Fix: Lấy tin mới nhất trước (desc, tối đa 500) rồi sắp xếp ổn định theo (created_at ASC, id ASC)
      // để không bao giờ bị mất các tin sau tin thứ 100 và hỗ trợ phân trang cursor-based khi cuộn lên.
      const query = `ktn_messages?room_id=in.(${inList})&order=created_at.desc&limit=500`;
      const [sbRes, pinnedMessage] = await Promise.all([
        supabaseRequest(env, query),
        getRoomPinnedAnnouncement(env, access)
      ]);
      if (!sbRes.ok || !Array.isArray(sbRes.data)) {
        return jsonResponse({
          ok: false,
          message: 'Không thể tải danh sách tin nhắn từ máy chủ.'
        }, sbRes.status && sbRes.status >= 400 ? sbRes.status : 503);
      }
      const deduped = [];
      const seenMsgIds = new Set();
      const seenClientKeys = new Set();
      for (const row of sbRes.data) {
        if (!row) continue;
        const rid = String(row.id || '').trim();
        if (rid && seenMsgIds.has(rid)) continue;
        const extractedClientMsgId =
          row.client_message_id || row.clientMessageId || extractClientMessageIdFromServerId(rid) || undefined;
        const clientKey = extractedClientMsgId
          ? `${normalizeEmail(row.sender_email || '')}|${extractedClientMsgId}`
          : '';
        if (clientKey && seenClientKeys.has(clientKey)) continue;
        if (rid) seenMsgIds.add(rid);
        if (clientKey) seenClientKeys.add(clientKey);
        deduped.push({
          ...row,
          ...(extractedClientMsgId ? { clientMessageId: extractedClientMsgId } : {})
        });
      }
      // Sắp xếp ổn định theo (created_at ASC, id ASC)
      deduped.sort((a, b) => {
        const ta = Date.parse(a.created_at || '') || 0;
        const tb = Date.parse(b.created_at || '') || 0;
        if (ta !== tb) return ta - tb;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });

      let endIdx = deduped.length;
      if (beforeCursor) {
        const idxById = deduped.findIndex(m => String(m.id || '') === beforeCursor);
        if (idxById >= 0) {
          endIdx = idxById;
        } else {
          const cursorTs = Date.parse(beforeCursor);
          if (Number.isFinite(cursorTs)) {
            const idxByTs = deduped.findIndex(m => (Date.parse(m.created_at || '') || 0) >= cursorTs);
            if (idxByTs >= 0) endIdx = idxByTs;
          }
        }
      }
      const startIdx = Math.max(0, endIdx - pageLimit);
      const pageItems = deduped.slice(startIdx, endIdx);
      const hasMore = startIdx > 0;
      const nextCursor = hasMore && pageItems.length > 0 ? String(pageItems[0].id || '') : null;

      return jsonResponse({
        ok: true,
        roomId: access.roomId,
        roomType: access.type,
        messages: pageItems,
        pinnedMessage,
        pagination: {
          hasMore,
          nextCursor,
          oldestCreatedAt: pageItems[0]?.created_at || null,
          limit: pageLimit,
          totalAvailable: deduped.length
        }
      });
    }

    if (path === '/api/ktn/messages' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      if (session.role === 'student') {
        const stuLifeRes = await supabaseRequest(
          env,
          `ktn_dlp_alerts?id=eq.${encodeURIComponent('STU_LIFE_' + normalizeEmail(session.email))}&room_id=eq.STUDENT_LIFECYCLE&limit=1`
        );
        if (stuLifeRes.ok && Array.isArray(stuLifeRes.data) && stuLifeRes.data[0]) {
          try {
            const lifeObj = JSON.parse(stuLifeRes.data[0].blocked_content || '{}');
            if (lifeObj.status === 'suspended' || lifeObj.status === 'deleted') {
              return jsonResponse({
                ok: false,
                error: 'ACCOUNT_SUSPENDED',
                message: 'Tài khoản học viên đang bị tạm khóa nên không thể gửi tin nhắn.'
              }, 403);
            }
          } catch {}
        }
      }
      const body = await request.json().catch(() => ({}));
      const rawRoomId = String(body.roomId || body.classCode || '').trim();
      const access = await canAccessChatRoom(env, session, rawRoomId);
      if (!access.allowed) {
        return jsonResponse({
          ok: false,
          ...(access.error ? { error: access.error } : {}),
          ...(access.code ? { code: access.code } : {}),
          message: access.message
        }, access.status);
      }
      const content = String(body.content || body.text || '').trim();
      const attachmentUrl = String(body.attachmentUrl || '').trim();
      if (!content && !attachmentUrl) return jsonResponse({ ok: false, message: 'Nội dung tin nhắn trống.' }, 400);
      if (attachmentUrl.startsWith('blob:')) {
        return jsonResponse({
          ok: false,
          error: 'BLOB_URL_NOT_UPLOADED',
          message: 'Tệp đính kèm chưa tải xong lên kho lưu trữ. Vui lòng bấm Thử lại.'
        }, 400);
      }
      // Chặn nhúng trực tiếp chuỗi Base64 lớn (>256KB) vào cột attachment_url của bảng ktn_messages (Phần 10)
      if (attachmentUrl.startsWith('data:') && attachmentUrl.length > 256 * 1024) {
        return jsonResponse({
          ok: false,
          error: 'ATTACHMENT_TOO_LARGE_FOR_INLINE',
          message: 'Tệp đính kèm có dung lượng lớn cần tải lên kho lưu trữ S3 qua /api/ktn/upload-url trước khi gửi tin nhắn.'
        }, 413);
      }
      const clientMessageId = String(body.clientMessageId || body.idempotencyKey || '').trim();
      const targetRoomKey = access.type === 'class' ? access.classCode : access.roomId;

      const dlpCheckText = content
        .replace(/^\[Trả lời [^\]]+\]\s*/i, '')
        .replace(/\[Đã (?:gửi ảnh|gửi video|gửi thu âm|đính kèm tệp): [^\]]+\]/gi, '')
        .trim();
      const dlp = inspectDlpContent(dlpCheckText);
      if (dlp.blocked) {
        await supabaseRequest(env, 'ktn_dlp_alerts', {
          method: 'POST',
          body: {
            id: 'DLP-' + Date.now(),
            room_id: targetRoomKey,
            sender_email: session.email,
            sender_name: session.name,
            sender_role: session.role,
            blocked_content: content,
            reason: dlp.reason
          }
        });
        return jsonResponse({
          ok: false,
          dlpBlocked: true,
          ...(clientMessageId ? { clientMessageId } : {}),
          message: 'Tin nhắn chứa SĐT hoặc liên kết ngoài luồng đã bị hệ thống bảo vệ DLP chặn.'
        }, 422);
      }

      if (!globalThis.__ktnClientMessageIdMap) globalThis.__ktnClientMessageIdMap = new Map();
      const clientDedupKey = clientMessageId ? `${normalizeEmail(session.email)}|${targetRoomKey}|${clientMessageId}` : '';
      const deterministicId = clientMessageId
        ? buildDeterministicMessageId(targetRoomKey, session.email, clientMessageId)
        : ('MSG-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));

      const msgLockKey = clientMessageId
        ? `MSG_IDEM|${targetRoomKey}|${normalizeEmail(session.email)}|${clientMessageId}`
        : `MSG_NONCE|${targetRoomKey}|${normalizeEmail(session.email)}|${deterministicId}`;
      return runWithHomeworkConcurrencyLock(msgLockKey, async () => {
        if (clientDedupKey && globalThis.__ktnClientMessageIdMap.has(clientDedupKey)) {
          const cachedMsg = globalThis.__ktnClientMessageIdMap.get(clientDedupKey);
          return jsonResponse({
            ok: true,
            persisted: true,
            idempotent: true,
            idempotentReplay: true,
            clientMessageId,
            serverMessageId: cachedMsg.id,
            message: { ...cachedMsg, clientMessageId }
          });
        }

        // Bền vững ở cấp độ Database: kiểm tra bản ghi đã tồn tại theo khóa chính tất định (deterministicId)
        if (clientMessageId) {
          const existingDbRes = await supabaseRequest(
            env,
            `ktn_messages?id=eq.${encodeURIComponent(deterministicId)}&limit=1`
          );
          if (existingDbRes.ok && Array.isArray(existingDbRes.data) && existingDbRes.data[0]?.id) {
            const existingRow = {
              ...existingDbRes.data[0],
              clientMessageId
            };
            if (clientDedupKey) {
              globalThis.__ktnClientMessageIdMap.set(clientDedupKey, existingRow);
            }
            return jsonResponse({
              ok: true,
              persisted: true,
              idempotent: true,
              idempotentReplay: true,
              clientMessageId,
              serverMessageId: existingRow.id,
              message: existingRow
            });
          }
        }

        // Gắn cứng room_id theo phòng đã phân quyền; class_code chỉ điền khi là phòng lớp trực tiếp (tránh lỗi FK 23503 cho phòng course:* / student:*)
        const nowIso = new Date().toISOString();
        const baseMsgRecord = {
          id: deterministicId,
          room_id: targetRoomKey,
          class_code: access.type === 'class' ? access.classCode : null,
          sender_email: session.email,
          sender_name: session.name,
          sender_role: session.role,
          content: content || '[Tệp đính kèm]',
          attachment_url: attachmentUrl,
          created_at: nowIso
        };

        let sbRes = await supabaseRequest(env, 'ktn_messages', {
          method: 'POST',
          prefer: 'return=representation',
          body: baseMsgRecord
        });

        // Nếu xung đột khóa chính (23505) do 2 isolate cùng insert 1 clientMessageId đồng thời -> trả về bản ghi đã lưu và KHÔNG bắn push lần 2
        if ((!sbRes.ok || !Array.isArray(sbRes.data) || !sbRes.data[0]) && clientMessageId) {
          const raceCheckRes = await supabaseRequest(
            env,
            `ktn_messages?id=eq.${encodeURIComponent(deterministicId)}&limit=1`
          );
          if (raceCheckRes.ok && Array.isArray(raceCheckRes.data) && raceCheckRes.data[0]?.id) {
            const raceRow = {
              ...raceCheckRes.data[0],
              clientMessageId
            };
            if (clientDedupKey) {
              globalThis.__ktnClientMessageIdMap.set(clientDedupKey, raceRow);
            }
            return jsonResponse({
              ok: true,
              persisted: true,
              idempotent: true,
              clientMessageId,
              serverMessageId: raceRow.id,
              message: raceRow
            });
          }
        }

        // Fallback 1: Nếu lớp mới chưa kịp có trong bảng ktn_classes gây lỗi FK class_code -> thử lại với class_code: null
        if ((!sbRes.ok || !Array.isArray(sbRes.data) || !sbRes.data[0]) && baseMsgRecord.class_code !== null) {
          sbRes = await supabaseRequest(env, 'ktn_messages', {
            method: 'POST',
            prefer: 'return=representation',
            body: { ...baseMsgRecord, class_code: null }
          });
        }

        // Fallback 2: Nếu schema V1 trên live DB còn ràng buộc NOT NULL + FK trên cột class_code -> dùng mã lớp neo hợp lệ trong khi giữ nguyên room_id chuẩn
        if (!sbRes.ok || !Array.isArray(sbRes.data) || !sbRes.data[0]) {
          sbRes = await supabaseRequest(env, 'ktn_messages', {
            method: 'POST',
            prefer: 'return=representation',
            body: { ...baseMsgRecord, class_code: 'YCT2-04' }
          });
        }

        const rawSavedRow = (sbRes.ok && Array.isArray(sbRes.data) && sbRes.data[0]) ? sbRes.data[0] : null;
        if (!rawSavedRow || !rawSavedRow.id) {
          return jsonResponse({
            ok: false,
            persisted: false,
            ...(clientMessageId ? { clientMessageId } : {}),
            message: 'Máy chủ chưa lưu được tin nhắn vào cơ sở dữ liệu. Vui lòng thử lại.'
          }, sbRes.status && sbRes.status >= 400 ? sbRes.status : 503);
        }

        const savedRow = {
          ...rawSavedRow,
          ...(clientMessageId ? { clientMessageId } : {})
        };

        if (clientDedupKey) {
          globalThis.__ktnClientMessageIdMap.set(clientDedupKey, savedRow);
        }

        let pinnedMessage = null;
        if ((session.role === 'teacher' || session.role === 'admin') && body.isPinned === true) {
          const pinRes = await saveRoomPinnedAnnouncement(env, session, access, content, savedRow.id);
          pinnedMessage = pinRes.pinnedMessage;
        }

        let pushDispatch = null;
        try {
          let recipientEmails = [];
          let msgEventId = `NOTIF-MSG-${savedRow.id}`;
          let msgEventType = 'chat_group_message';
          let verifiedCls = '';
          let pushTitle = `Tin nhắn mới từ ${session.name || session.email}`;

          if (access.type === 'student' || /^(?:direct:)?student:/i.test(targetRoomKey)) {
            const targetStu = normalizeEmail(
              access.studentEmail || targetRoomKey.replace(/^(?:direct:)?student:/i, '')
            );
            recipientEmails = await resolvePrivateMessageRecipientEmails(env, targetStu, session);
            msgEventId = `NOTIF-PRIVMSG-${savedRow.id}`;
            msgEventType = 'chat_private_message';
            pushTitle =
              session.role === 'student'
                ? `Tin nhắn riêng từ ${session.name || session.email}`
                : `Tin nhắn riêng từ ${session.name || 'Cô giáo'}`;
          } else if (access.type === 'class' && access.classCode) {
            const clsResolved = await resolveClassRecipientEmails(env, access.classCode, {
              includeTeacher: true,
              excludeEmail: session.email
            });
            recipientEmails = clsResolved.recipientEmails;
            verifiedCls = clsResolved.classCode;
            msgEventId = `NOTIF-MSG-${savedRow.id}`;
            msgEventType = 'chat_group_message';
            pushTitle = `Nhóm lớp ${access.classCode} · ${session.name || session.email}`;
          } else if (access.type === 'course' && access.courseId) {
            msgEventId = `NOTIF-COURSEMSG-${savedRow.id}`;
            msgEventType = 'chat_course_message';
            const senderNorm = normalizeEmail(session.email);
            const courseRecipSet = new Set();
            const isStaffOrTeacher = session.role === 'teacher' || session.role === 'admin' || session.role === 'staff';
            const isExplicitlyUrgent = Boolean(body.isUrgent || body.urgent);
            const shouldBroadcastToStudents = session.role !== 'student' && (isStaffOrTeacher || isExplicitlyUrgent);

            if (shouldBroadcastToStudents) {
              const stuCourseRes = await supabaseRequest(env, 'ktn_students?select=email,online_courses&limit=500');
              if (stuCourseRes.ok && Array.isArray(stuCourseRes.data)) {
                for (const s of stuCourseRes.data) {
                  const em = normalizeEmail(s?.email || '');
                  if (!em || em === senderNorm) continue;
                  const cList = Array.isArray(s?.online_courses) ? s.online_courses : [];
                  const hasCourse = cList.some((c) => {
                    const cid = String(c?.id || c?._id || c || '').trim().toLowerCase();
                    return (COURSE_CHAT_ALIASES[cid] || cid) === access.courseId || cid === access.rawCourseId;
                  });
                  if (hasCourse) courseRecipSet.add(em);
                }
              }
            }
            if (session.role === 'student') {
              const teaRes = await supabaseRequest(env, 'ktn_teachers?active=eq.true&select=email,active&limit=20');
              if (teaRes.ok && Array.isArray(teaRes.data)) {
                for (const t of teaRes.data) {
                  if (t?.active === false) continue;
                  const em = normalizeEmail(t?.email || '');
                  if (em && em !== senderNorm) courseRecipSet.add(em);
                }
              }
            }
            recipientEmails = Array.from(courseRecipSet);
          }

          const pushPromise = dispatchWebPushForQuery(
            env,
            '',
            {
              id: msgEventId,
              eventId: msgEventId,
              eventType: msgEventType,
              roomId: access.roomId || targetRoomKey,
              classCode: verifiedCls || access.classCode || '',
              messageId: savedRow.id,
              title: pushTitle,
              body: String(content || '[Tệp đính kèm]').slice(0, 80),
              action_url: `/custom-page/so-lien-lac-test#/chat?room=${encodeURIComponent(access.roomId || targetRoomKey)}`,
              url: `/custom-page/so-lien-lac-test#/messages?roomId=${encodeURIComponent(access.roomId || targetRoomKey)}`
            },
            {
              eventId: msgEventId,
              eventType: msgEventType,
              recipientEmails,
              senderEmail: session.email,
              classCode: verifiedCls
            }
          );
          if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(pushPromise);
          pushDispatch = await pushPromise;
        } catch (pushErr) {
          pushDispatch = {
            ok: false,
            skipped: true,
            reason: pushErr?.message || 'PUSH_DISPATCH_NON_FATAL_ERROR'
          };
        }

        return jsonResponse({
          ok: true,
          persisted: true,
          ...(clientMessageId ? { clientMessageId } : {}),
          serverMessageId: savedRow.id,
          message: savedRow,
          ...(pinnedMessage ? { pinnedMessage } : {}),
          ...(pushDispatch ? { pushDispatch, pushDelivery: pushDispatch } : {})
        });
      });
    }

    if (path === '/api/ktn/notifications/settings') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      }
      const myEmail = normalizeEmail(session.email);
      if (request.method === 'GET') {
        const prefsMap = await getUserNotificationPreferencesMap(env, [myEmail]);
        return jsonResponse({
          ok: true,
          settings: prefsMap.get(myEmail) || DEFAULT_USER_NOTIFICATION_PREFS
        });
      }
      if (request.method === 'PUT' || request.method === 'POST' || request.method === 'PATCH') {
        const body = await request.json().catch(() => ({}));
        const existingMap = await getUserNotificationPreferencesMap(env, [myEmail]);
        const currentPrefs = existingMap.get(myEmail) || DEFAULT_USER_NOTIFICATION_PREFS;
        const incoming = body.settings && typeof body.settings === 'object' ? body.settings : body;
        const nextPrefs = sanitizeUserNotificationPrefs({ ...currentPrefs, ...incoming });
        const prefId = `NPREF_${myEmail}`;
        const nowIso = new Date().toISOString();
        let saveRes = await supabaseRequest(env, 'ktn_dlp_alerts?on_conflict=id', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: {
            id: prefId,
            room_id: 'NOTIF_PREFS',
            sender_email: myEmail,
            sender_name: session.name || myEmail,
            sender_role: session.role || 'student',
            blocked_content: JSON.stringify(nextPrefs),
            reason: 'USER_NOTIFICATION_PREFERENCES',
            resolved: true,
            created_at: nowIso
          }
        });
        if (!saveRes || !saveRes.ok) {
          saveRes = await supabaseRequest(env, `ktn_dlp_alerts?id=eq.${encodeURIComponent(prefId)}`, {
            method: 'PATCH',
            prefer: 'return=representation',
            body: {
              blocked_content: JSON.stringify(nextPrefs),
              created_at: nowIso
            }
          });
        }
        // Đồng bộ notify_settings sang các thiết bị Push của tài khoản
        await supabaseRequest(
          env,
          `ktn_push_subscriptions?user_email=eq.${encodeURIComponent(myEmail)}`,
          {
            method: 'PATCH',
            prefer: 'return=minimal',
            body: {
              notify_settings: nextPrefs,
              updated_at: nowIso
            }
          }
        ).catch(() => null);

        return jsonResponse({
          ok: true,
          settings: nextPrefs
        });
      }
    }

    if (path === '/api/ktn/notifications' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      }

      const myEmail = normalizeEmail(session.email);
      const [prefsMap, clsActiveRes] = await Promise.all([
        getUserNotificationPreferencesMap(env, [myEmail]),
        supabaseRequest(env, 'ktn_classes?select=id,active').catch(() => ({ ok: false, data: [] }))
      ]);
      const userPrefs = prefsMap.get(myEmail) || DEFAULT_USER_NOTIFICATION_PREFS;
      const archivedClassesSet = new Set();
      if (clsActiveRes.ok && Array.isArray(clsActiveRes.data)) {
        for (const c of clsActiveRes.data) {
          const cid = String(c?.id || '').trim().toUpperCase();
          if (cid && c?.active === false) archivedClassesSet.add(cid);
        }
      }

      const items = [];
      let scopedClassesForScheduleEvents = new Set();

      if (session.role === 'student') {
        const stuRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(session.email)}&limit=1`);
        const stu = (Array.isArray(stuRes.data) && stuRes.data[0]) || null;
        const rawClassCode = stu
          ? String(stu.class_code || '').trim().toUpperCase()
          : String(session.classCode || '').trim().toUpperCase();
        const classCode = (rawClassCode && !archivedClassesSet.has(rawClassCode)) ? rawClassCode : null;
        if (classCode) scopedClassesForScheduleEvents.add(classCode);

        const hwRes = await supabaseRequest(env, `ktn_homeworks?student_email=eq.${encodeURIComponent(session.email)}&order=updated_at.desc&limit=20`);
        const hws = Array.isArray(hwRes.data) ? hwRes.data : [];

        // Chỉ phát thông báo dựa trên sự kiện thật: Cô giáo vừa nhận xét bài tập hoặc Tin nhắn thật từ cô giáo
        for (const hw of hws) {
          if (hw.status === 'graded' || hw.status === 'revision_requested') {
            const isRev = hw.status === 'revision_requested';
            const rawCourseId = String(hw.course_id || '').trim();
            const isLiveClassHw = rawCourseId.toUpperCase().startsWith('CLASS_') || (!rawCourseId && Boolean(hw.class_code)) || Number(hw.lesson_num) >= 100;
            const liveCls = rawCourseId.toUpperCase().startsWith('CLASS_')
              ? rawCourseId.slice(6).trim()
              : String(hw.class_code || classCode || '').trim();
            const sNum = isLiveClassHw
              ? (Number(hw.lesson_num) >= 100 ? Math.floor(Number(hw.lesson_num) / 100) : (Number(hw.lesson_num) || 1))
              : (Number(hw.lesson_num) || 1);
            items.push({
              id: `NOTIF-GRADED-${hw.id}-${hw.status}-${hw.score ?? ''}`,
              type: 'homework_graded',
              classCode: liveCls || classCode || '',
              title: 'Cô giáo vừa nhận xét.',
              body: isRev
                ? `Cần sửa lại: ${hw.lesson_title || ('Bài ' + hw.lesson_num)}`
                : (hw.score !== null && hw.score !== undefined
                    ? `${hw.lesson_title || ('Bài ' + hw.lesson_num)} · ${hw.score}đ`
                    : (hw.lesson_title || `Bài ${hw.lesson_num}`)),
              actionUrl: (isLiveClassHw && liveCls)
                ? `#/lop/${liveCls.toLowerCase()}/buoi/${sNum}`
                : `#/khoa/${rawCourseId}/bai/${sNum}`,
              createdAt: hw.graded_at || hw.updated_at || hw.submitted_at,
              homeworkId: hw.id,
              courseId: hw.course_id,
              lessonNum: hw.lesson_num
            });
          }
        }

        if (classCode) {
          const sessRes = await supabaseRequest(env, `ktn_class_sessions?class_code=eq.${encodeURIComponent(classCode)}&order=updated_at.desc&limit=5`);
          const classSessions = Array.isArray(sessRes.data) ? sessRes.data : [];
          for (const cs of classSessions) {
            const sNum = Number(cs.session_num) || 1;
            const exList = Array.isArray(cs.exercises) ? cs.exercises : (Array.isArray(cs.assignments) ? cs.assignments : []);
            const sTitle = String(cs.session_title || cs.title || `Buổi ${sNum}`).trim();
            items.push({
              id: `NOTIF-ASSIGN-${classCode}-S${sNum}-${cs.updated_at || cs.id || sNum}`,
              type: 'homework_assigned',
              classCode,
              sessionNum: sNum,
              title: `Bài tập mới Lớp ${classCode} · Buổi ${sNum}`,
              body: `${sTitle}${exList.length ? ` (${exList.length} bài tập)` : ''}`,
              actionUrl: `#/lop/${classCode.toLowerCase()}/buoi/${sNum}`,
              createdAt: cs.updated_at || cs.created_at || new Date().toISOString()
            });
          }
        }

        const roomQuerySet = new Set([`student:${myEmail}`]);
        if (classCode) {
          roomQuerySet.add(classCode);
          roomQuerySet.add(`class:${classCode}`);
        }
        const onlineList = Array.isArray(stu?.online_courses)
          ? stu.online_courses
          : (Array.isArray(session.onlineCourses) ? session.onlineCourses : []);
        for (const c of onlineList) {
          const rawCid = String(c?.id || c?._id || c || '').trim().toLowerCase();
          if (!rawCid) continue;
          const canonicalCid = COURSE_CHAT_ALIASES[rawCid] || rawCid;
          roomQuerySet.add(`course:${canonicalCid}`);
        }
        const roomInParam = Array.from(roomQuerySet).map(k => encodeURIComponent(k)).join(',');
        const msgRes = await supabaseRequest(env, `ktn_messages?room_id=in.(${roomInParam})&sender_email=neq.${encodeURIComponent(myEmail)}&order=created_at.desc&limit=10`);
        const roomMsgs = (Array.isArray(msgRes.data) ? msgRes.data : []).filter(
          (m) => normalizeEmail(m?.sender_email || '') !== myEmail
        );

        // Chống spam: Tin nhắn riêng (1-1) ưu tiên cao và giữ riêng; tin nhắn nhóm cùng phòng liên tiếp được gộp thành 1 thông báo tóm tắt
        const groupRoomBuckets = new Map();
        for (const latestMsg of roomMsgs) {
          const rawRoom = String(latestMsg.room_id || latestMsg.class_code || classCode || '').trim();
          const isPrivate = rawRoom.toLowerCase().startsWith('student:');
          const isCourseRoom = rawRoom.toLowerCase().startsWith('course:');
          const isPinned = Boolean(latestMsg.attachment && latestMsg.attachment.pinned);
          const isTeacherSender = latestMsg.sender_role === 'teacher' || latestMsg.sender_role === 'admin';

          if (isPrivate || isPinned) {
            items.push({
              id: `NOTIF-MSG-${classCode || rawRoom}-${latestMsg.id}`,
              type: isPinned ? 'announcement_pinned' : 'chat_message',
              priority: 'high',
              classCode: classCode || rawRoom,
              roomId: rawRoom,
              messageId: latestMsg.id,
              title: isPinned
                ? 'Thông báo quan trọng được ghim.'
                : 'Cô giáo vừa nhắn riêng cho em.',
              body: `${latestMsg.sender_name || (isTeacherSender ? 'Cô giáo' : 'Bạn cùng lớp')}: ${String(latestMsg.content || '').slice(0, 60)}`,
              actionUrl: (classCode && !isPrivate && !isCourseRoom) ? `#/lop/${classCode.toLowerCase()}/buoi/1` : '#/nhom-lop',
              createdAt: latestMsg.created_at
            });
          } else {
            const normGroupKey = isCourseRoom ? rawRoom.toLowerCase() : (normalizeRoomClassCode(rawRoom) || classCode || rawRoom);
            if (!groupRoomBuckets.has(normGroupKey)) {
              groupRoomBuckets.set(normGroupKey, {
                latestMsg,
                rawRoom,
                isCourseRoom,
                isTeacherSender,
                count: 1
              });
            } else {
              groupRoomBuckets.get(normGroupKey).count += 1;
            }
          }
        }

        for (const [normGroupKey, bucket] of groupRoomBuckets.entries()) {
          const { latestMsg, rawRoom, isCourseRoom, isTeacherSender, count } = bucket;
          const canonicalGroupRoomId = isCourseRoom
            ? rawRoom.toLowerCase()
            : `class:${normalizeRoomClassCode(rawRoom) || classCode || rawRoom}`;
          items.push({
            id: `NOTIF-MSG-${classCode || rawRoom}-${latestMsg.id}`,
            type: 'chat_group_message',
            eventType: 'chat_group_message',
            priority: 'normal',
            coalescedCount: count,
            classCode: classCode || rawRoom,
            roomId: canonicalGroupRoomId,
            messageId: latestMsg.id,
            title: count > 1
              ? `${count} tin nhắn mới trong nhóm ${isCourseRoom ? 'khóa học' : ('lớp ' + normGroupKey)}`
              : (isTeacherSender ? 'Tin nhắn mới từ cô giáo.' : 'Tin nhắn mới trong nhóm lớp.'),
            body: `${latestMsg.sender_name || (isTeacherSender ? 'Cô giáo' : 'Bạn cùng lớp')}: ${String(latestMsg.content || '').slice(0, 60)}`,
            actionUrl: (classCode && !isCourseRoom) ? `#/lop/${classCode.toLowerCase()}/buoi/1` : '#/nhom-lop',
            createdAt: latestMsg.created_at
          });
        }

        if (items.length === 0 && !myEmail.startsWith('e2e.hs.')) {
          if (onlineList.length > 0) {
            for (const c of onlineList) {
              const rawCid = String(c?.id || c?._id || c || '').trim().toLowerCase();
              if (!rawCid) continue;
              const canonicalCid = COURSE_CHAT_ALIASES[rawCid] || rawCid;
              const meta = MASTER_PRODUCT_MAPPING[canonicalCid] || { shortTitle: c?.title || 'Khóa học Video' };
              items.push({
                id: `NOTIF-COURSE-${canonicalCid}`,
                type: 'class_announcement',
                classCode: `course:${canonicalCid}`,
                roomId: `course:${canonicalCid}`,
                courseId: canonicalCid,
                title: `Thông báo khóa học ${meta.shortTitle || meta.title || 'Tiếng Trung KTN'}`,
                body: 'Chào con! Con vào xem video bài giảng, ghi âm luyện nói và trao đổi cùng Đội ngũ giáo viên Khổng Tử Nhí tại nhóm khóa học nhé.',
                actionUrl: `#/khoa/${canonicalCid}/bai/1`,
                createdAt: stu?.updated_at || stu?.created_at || '2026-04-15T08:00:00.000Z'
              });
            }
          } else {
            items.push({
              id: `NOTIF-WELCOME-${myEmail}`,
              type: 'class_announcement',
              title: 'Chào mừng đến Sổ Liên Lạc Khổng Tử Nhí',
              body: 'Tài khoản học viên đã sẵn sàng. Bạn sẽ nhận được thông báo ngay khi giáo viên giao bài hoặc nhắn tin.',
              actionUrl: '#/learning',
              createdAt: stu?.updated_at || stu?.created_at || '2026-04-15T08:00:00.000Z'
            });
          }
        }
      } else if (session.role === 'teacher') {
        const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
        assignedClasses.forEach(c => {
          const clean = String(c || '').trim().toUpperCase();
          if (clean) scopedClassesForScheduleEvents.add(clean);
        });
        if (assignedClasses.length > 0) {
          const classListParam = assignedClasses.map(c => encodeURIComponent(c)).join(',');
          const hwRes = await supabaseRequest(env, `ktn_homeworks?class_code=in.(${classListParam})&status=eq.pending&order=submitted_at.desc&limit=15`);
          const pendingHws = Array.isArray(hwRes.data) ? hwRes.data : [];
          for (const hw of pendingHws) {
            items.push({
              id: `NOTIF-SUB-${hw.id}-${hw.submitted_at || ''}`,
              type: 'homework_submitted',
              classCode: hw.class_code || '',
              homeworkId: hw.id,
              title: 'Học sinh vừa nộp bài.',
              body: `${hw.student_name || hw.student_email} · ${hw.lesson_title || ('Bài ' + hw.lesson_num)}`,
              actionUrl: `/custom-page/so-lien-lac-test?view=grade&hwId=${encodeURIComponent(hw.id)}`,
              createdAt: hw.submitted_at
            });
          }
        }
        const roomKeys = [
          ...assignedClasses.flatMap(c => [c, `class:${c}`]),
          'course:6adadba969897b0002482ca5',
          'course:65e7704a9ea90c00080d5195',
          'course:65e769bd637339000870618f'
        ];
        const roomListParam = roomKeys.map(c => encodeURIComponent(c)).join(',');
        const [groupMsgRes, privMsgRes] = await Promise.all([
          supabaseRequest(env, `ktn_messages?room_id=in.(${roomListParam})&order=created_at.desc&limit=10`),
          supabaseRequest(env, 'ktn_messages?room_id=like.student:*&sender_role=eq.student&order=created_at.desc&limit=10')
        ]);
        const assignedClassesSet = new Set(
          assignedClasses.map(c => String(c || '').trim().toUpperCase()).filter(Boolean)
        );
        const rawGroupMsgs = (Array.isArray(groupMsgRes.data) ? groupMsgRes.data : []).filter(
          (m) => m && normalizeEmail(m.sender_email) !== myEmail && (m.sender_role === 'student' || m.sender_role === 'admin')
        );
        const rawPrivMsgs = Array.isArray(privMsgRes.data) ? privMsgRes.data : [];
        const privStudentEmails = Array.from(new Set(
          rawPrivMsgs
            .map(m => {
              const r = String(m?.room_id || m?.class_code || '').trim();
              return /^student:/i.test(r) ? normalizeEmail(r.slice(8)) : normalizeEmail(m?.sender_email || '');
            })
            .filter(Boolean)
        ));
        const stuClassByEmail = new Map();
        if (privStudentEmails.length > 0) {
          const stuClsRes = await supabaseRequest(
            env,
            `ktn_students?email=in.(${privStudentEmails.map(e => encodeURIComponent(e)).join(',')})&select=email,class_code`
          );
          if (stuClsRes.ok && Array.isArray(stuClsRes.data)) {
            for (const s of stuClsRes.data) {
              const em = normalizeEmail(s?.email || '');
              if (em) stuClassByEmail.set(em, String(s?.class_code || '').trim().toUpperCase());
            }
          }
        }
        const scopedPrivMsgs = rawPrivMsgs.filter(m => {
          const r = String(m?.room_id || m?.class_code || '').trim();
          const em = /^student:/i.test(r) ? normalizeEmail(r.slice(8)) : normalizeEmail(m?.sender_email || '');
          const stuCls = stuClassByEmail.get(em) || '';
          if (stuCls && !assignedClassesSet.has(stuCls)) return false;
          return true;
        });
        const mergedStudentMsgs = [
          ...rawGroupMsgs,
          ...scopedPrivMsgs
        ].sort((a, b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')));
        const seenRooms = new Set();
        for (const m of mergedStudentMsgs) {
          const rawR = String(m.room_id || m.class_code || '').trim();
          const normRoom = /^course:|^student:/i.test(rawR) ? rawR : normalizeRoomClassCode(rawR);
          if (!normRoom || seenRooms.has(normRoom)) continue;
          seenRooms.add(normRoom);
          const isPrivate = /^student:/i.test(normRoom);
          const isCourse = /^course:/i.test(normRoom);
          const canonicalRoomId = isPrivate || isCourse ? normRoom : `class:${normRoom}`;
          const isAdminSender = m.sender_role === 'admin';
          items.push({
            id: `NOTIF-TMSG-${normRoom}-${m.id}`,
            type: isPrivate ? 'chat_message' : 'chat_group_message',
            eventType: isPrivate ? 'chat_message' : 'chat_group_message',
            priority: isPrivate ? 'high' : 'normal',
            classCode: normRoom,
            roomId: canonicalRoomId,
            messageId: m.id,
            title: isPrivate
              ? 'Học sinh vừa nhắn riêng (1-1).'
              : (isAdminSender ? 'Tin nhắn mới từ Quản lý trong nhóm lớp.' : 'Tin nhắn mới từ học sinh.'),
            body: `${m.sender_name || m.sender_email} (${normRoom}): ${String(m.content || '').slice(0, 60)}`,
            actionUrl: `/custom-page/so-lien-lac-test?view=groups&room=${encodeURIComponent(canonicalRoomId)}`,
            createdAt: m.created_at
          });
        }
      } else if (session.role === 'admin') {
        const [ordRes, hwRes, msgRes] = await Promise.all([
          supabaseRequest(env, 'ktn_orders?order=created_at.desc&limit=10'),
          supabaseRequest(env, 'ktn_homeworks?order=updated_at.desc&limit=5'),
          supabaseRequest(env, 'ktn_messages?order=created_at.desc&limit=5')
        ]);
        for (const ord of (Array.isArray(ordRes.data) ? ordRes.data : [])) {
          const isPending = ord.approval_status === 'pending';
          items.push({
            id: `NOTIF-ORD-${ord.order_id}-${ord.approval_status || 'pending'}`,
            type: isPending ? 'order_pending' : 'class_announcement',
            title: isPending ? 'Đơn đăng ký mới chờ duyệt.' : 'Đơn đăng ký khóa học đã duyệt.',
            body: `${ord.student_name || ord.student_email} · ${ord.course_name || 'Khóa học KTN'}`,
            actionUrl: `/custom-page/so-lien-lac-test#/admin/orders`,
            createdAt: ord.created_at
          });
        }
        for (const hw of (Array.isArray(hwRes.data) ? hwRes.data : [])) {
          const isPending = hw.status === 'pending';
          items.push({
            id: `NOTIF-ADM-HW-${hw.id}-${hw.status || 'pending'}`,
            type: isPending ? 'homework_submitted' : 'homework_graded',
            classCode: hw.class_code || '',
            homeworkId: hw.id,
            title: isPending ? 'Học viên vừa nộp bài tập.' : 'Giáo viên đã chấm bài tập.',
            body: `${hw.student_name || hw.student_email} · ${hw.lesson_title || ('Bài ' + hw.lesson_num)}`,
            actionUrl: `/custom-page/so-lien-lac-test#/teacher`,
            createdAt: hw.graded_at || hw.updated_at || hw.submitted_at
          });
        }
        for (const m of (Array.isArray(msgRes.data) ? msgRes.data : [])) {
          const rawR = String(m.room_id || m.class_code || '').trim();
          const isPrivate = /^student:/i.test(rawR);
          items.push({
            id: `NOTIF-ADM-MSG-${m.id}`,
            type: isPrivate ? 'chat_message' : 'chat_group_message',
            eventType: isPrivate ? 'chat_message' : 'chat_group_message',
            classCode: rawR,
            roomId: rawR,
            title: `Tin nhắn lớp học (${rawR || 'KTN'})`,
            body: `${m.sender_name || m.sender_email}: ${String(m.content || '').slice(0, 60)}`,
            actionUrl: `/custom-page/so-lien-lac-test#/chat`,
            createdAt: m.created_at
          });
        }
      }

      // Bổ sung thông báo Diễn đàn Hỏi đáp bài học & Yêu cầu cấp khóa học online
      const [forumQs, forumAns, forumFollows, courseReqs] = await Promise.all([
        loadAllForumQuestions(env).catch(() => []),
        loadAllForumAnswers(env).catch(() => []),
        loadAllForumFollows(env, null, { includeAll: true }).catch(() => []),
        loadAllCourseGrantRequests(env).catch(() => [])
      ]);

      if (session.role === 'student') {
        const myFollowedQIds = new Set(
          forumFollows
            .filter(f => normalizeEmail(f.user_email) === myEmail && f.following !== false && f.notify_mode !== 'off')
            .map(f => f.question_id)
        );
        const myUnfollowedQIds = new Set(
          forumFollows
            .filter(f => normalizeEmail(f.user_email) === myEmail && (f.following === false || f.notify_mode === 'off'))
            .map(f => f.question_id)
        );
        const qById = new Map(forumQs.map(q => [q.id, q]));
        for (const ans of forumAns) {
          if (ans.status === 'hidden') continue;
          if (normalizeEmail(ans.author_email) === myEmail) continue;
          const q = qById.get(ans.question_id);
          if (!q || q.status === 'hidden') continue;
          if (myUnfollowedQIds.has(q.id)) continue;
          const isQuestionOwner = normalizeEmail(q.student_email) === myEmail;
          if (!isQuestionOwner && !myFollowedQIds.has(q.id)) continue;
          items.push({
            id: `NOTIF-FORUM-ANS-${ans.id}`,
            type: 'forum_answer',
            priority: 'high',
            courseId: q.course_id,
            unitId: q.unit_id,
            lessonNum: q.lesson_num || 1,
            questionId: q.id,
            answerId: ans.id,
            title: ans.video_url
              ? 'Cô giáo vừa gửi video giải đáp câu hỏi bài học!'
              : 'Cô giáo vừa trả lời câu hỏi bài học của em.',
            body: `${ans.author_name || 'Cô giáo'} (${q.lesson_title_snapshot || ('Bài ' + (q.lesson_num || 1))}): ${String(ans.content || '').slice(0, 75)}`,
            actionUrl: `#/khoa/${encodeURIComponent(q.course_id)}/bai/${q.lesson_num || 1}?tab=forum&questionId=${encodeURIComponent(q.id)}`,
            createdAt: ans.created_at
          });
        }
      } else if (session.role === 'teacher') {
        const isTeacherActive = await isActiveTeacherSession(env, session);
        // Giáo viên đang hoạt động thấy thông báo trong hệ thống (in-app) cho câu hỏi mới/mở hoặc câu hỏi chính mình đang nhận xử lý
        if (isTeacherActive) {
          for (const q of forumQs.slice(0, 15)) {
            if (q.status === 'hidden') continue;
            const claimedEmail = normalizeEmail(q.claimed_by_teacher_email || '');
            if (q.status === 'open' || (q.status === 'claimed' && claimedEmail === myEmail)) {
              items.push({
                id: `NOTIF-FORUM-Q-${q.id}`,
                type: 'forum_question',
                priority: 'normal',
                courseId: q.course_id,
                unitId: q.unit_id,
                lessonNum: q.lesson_num || 1,
                questionId: q.id,
                title: q.status === 'claimed'
                  ? `Câu hỏi đang nhận xử lý (${q.lesson_title_snapshot || ('Bài ' + (q.lesson_num || 1))})`
                  : `Học sinh vừa hỏi trong ${q.lesson_title_snapshot || ('Bài ' + (q.lesson_num || 1))}`,
                body: `${q.student_name || 'Học viên'}: ${q.title}`,
                actionUrl: `#/teacher?tab=forum&questionId=${encodeURIComponent(q.id)}`,
                createdAt: q.created_at
              });
            }
          }
        }
        for (const r of courseReqs) {
          if (normalizeEmail(r.teacher_email) !== myEmail) continue;
          if (r.status === 'approved' || r.status === 'rejected') {
            items.push({
              id: `NOTIF-CREQ-REV-${r.id}-${r.status}`,
              type: 'course_request_reviewed',
              priority: 'normal',
              title: r.status === 'approved'
                ? 'Đề nghị mở khóa học online đã được Quản lý duyệt.'
                : 'Đề nghị mở khóa học online chưa được duyệt.',
              body: `${r.student_name || r.student_email} · ${(r.course_titles || []).join(', ') || 'Khóa học online'}`,
              actionUrl: '#/teacher?tab=students',
              createdAt: r.reviewed_at || r.updated_at
            });
          }
        }
      } else if (session.role === 'admin') {
        for (const r of courseReqs.filter(x => x.status === 'pending').slice(0, 10)) {
          items.push({
            id: `NOTIF-CREQ-PEND-${r.id}`,
            type: 'course_request_pending',
            priority: 'high',
            title: 'Yêu cầu cấp khóa học online từ giáo viên chờ duyệt.',
            body: `${r.teacher_name || r.teacher_email} đề nghị cho ${r.student_name || r.student_email} · ${(r.course_titles || []).join(', ')}`,
            actionUrl: '#/admin/orders',
            createdAt: r.created_at
          });
        }
        for (const q of forumQs.filter(x => x.status === 'open').slice(0, 8)) {
          items.push({
            id: `NOTIF-FORUM-ADM-${q.id}`,
            type: 'forum_question',
            priority: 'normal',
            courseId: q.course_id,
            unitId: q.unit_id,
            lessonNum: q.lesson_num || 1,
            questionId: q.id,
            title: `Câu hỏi bài học mới (${q.lesson_title_snapshot || ('Bài ' + (q.lesson_num || 1))})`,
            body: `${q.student_name || 'Học viên'}: ${q.title}`,
            actionUrl: `#/teacher?tab=forum&questionId=${encodeURIComponent(q.id)}`,
            createdAt: q.created_at
          });
        }
      }

      // Bổ sung thông báo vòng đời lớp học (class_created, class_joined, class_teacher_changed), nhắc giờ học (class_reminder) và đổi/hoãn lịch (schedule_changed / session_cancelled)
      const [lifecycleNotifRes, reminderLogRes, scheduleEvtRes, readStateRes] = await Promise.all([
        supabaseRequest(
          env,
          `ktn_dlp_alerts?room_id=eq.KTN_LIFECYCLE_NOTIFICATION&sender_email=eq.${encodeURIComponent(myEmail)}&order=created_at.desc&limit=30`
        ).catch(() => ({ ok: false, data: [] })),
        supabaseRequest(
          env,
          `ktn_dlp_alerts?room_id=eq.CLASS_REMINDER_LOG&sender_email=eq.${encodeURIComponent(myEmail)}&order=created_at.desc&limit=10`
        ),
        supabaseRequest(
          env,
          'ktn_dlp_alerts?room_id=eq.CLASS_SCHEDULE_EVENT&order=created_at.desc&limit=20'
        ),
        supabaseRequest(
          env,
          `ktn_dlp_alerts?room_id=eq.NOTIF_READ_STATE&sender_email=eq.${encodeURIComponent(session.email)}&order=created_at.desc&limit=50`
        )
      ]);

      if (lifecycleNotifRes.ok && Array.isArray(lifecycleNotifRes.data)) {
        for (const row of lifecycleNotifRes.data) {
          try {
            const parsed = JSON.parse(row.blocked_content || '{}');
            const evType = String(parsed.type || row.reason || 'class_announcement').trim();
            const cls = String(parsed.classCode || row.sender_name || '').trim().toUpperCase();
            // Nếu lớp đã đóng/lưu trữ thì không hiển thị thông báo phân công/gia nhập lớp cũ như lớp đang hoạt động
            if (cls && archivedClassesSet.has(cls) && (evType === 'class_created' || evType === 'class_joined')) {
              continue;
            }
            // Nếu học viên đã chuyển sang lớp khác hoặc gỡ khỏi lớp cũ thì không hiển thị thông báo gia nhập lớp cũ
            if (
              cls &&
              session.role === 'student' &&
              evType === 'class_joined' &&
              !scopedClassesForScheduleEvents.has(cls)
            ) {
              continue;
            }
            // Nếu giáo viên không còn phụ trách lớp thì ẩn thông báo phân công lớp cũ, chỉ giữ thông báo thay đổi phân công (previous_teacher)
            if (
              cls &&
              session.role === 'teacher' &&
              (evType === 'class_created' ||
                (evType === 'class_teacher_changed' && parsed?.meta?.roleInEvent === 'new_teacher')) &&
              !scopedClassesForScheduleEvents.has(cls)
            ) {
              continue;
            }
            items.push({
              id: parsed.id || row.id,
              type: evType,
              eventType: evType,
              priority: parsed.priority || 'high',
              classCode: cls,
              roomId: parsed.roomId || (cls ? `class:${cls}` : ''),
              ...(parsed.teacherName ? { teacherName: parsed.teacherName } : {}),
              ...(parsed.teacherEmail ? { teacherEmail: parsed.teacherEmail } : {}),
              ...(parsed.meta ? { meta: parsed.meta } : {}),
              title: parsed.title || 'Thông báo lớp học mới',
              body: parsed.body || '',
              actionUrl: parsed.actionUrl || (cls ? `#/classrooms?class=${encodeURIComponent(cls)}` : '#/learning'),
              ...(parsed.chatUrl ? { chatUrl: parsed.chatUrl } : {}),
              createdAt: parsed.createdAt || row.created_at
            });
          } catch {}
        }
      }

      if (reminderLogRes.ok && Array.isArray(reminderLogRes.data)) {
        for (const row of reminderLogRes.data) {
          try {
            const parsed = JSON.parse(row.blocked_content || '{}');
            const cls = String(parsed.classCode || row.sender_name || '').trim().toUpperCase();
            if (cls && archivedClassesSet.has(cls)) continue;
            if (session.role !== 'admin' && !scopedClassesForScheduleEvents.has(cls)) continue;
            items.push({
              id: parsed.id || row.id,
              type: 'class_reminder',
              classCode: cls,
              title: parsed.title || 'Sắp đến giờ học tiếng Trung!',
              body: parsed.body || `Lớp ${cls} sắp bắt đầu. Chuẩn bị vào lớp nhé!`,
              actionLabel: parsed.actionLabel || 'Xem buổi học',
              actionUrl: parsed.actionUrl || `#/classrooms?class=${encodeURIComponent(cls)}`,
              createdAt: parsed.createdAt || row.created_at
            });
          } catch {}
        }
      }

      if (scheduleEvtRes.ok && Array.isArray(scheduleEvtRes.data)) {
        for (const row of scheduleEvtRes.data) {
          try {
            const parsed = JSON.parse(row.blocked_content || '{}');
            const cls = String(parsed.classCode || '').trim().toUpperCase();
            if (cls && archivedClassesSet.has(cls)) continue;
            if (normalizeEmail(row.sender_email || parsed.updatedBy || '') === myEmail) continue;
            if (session.role !== 'admin' && !scopedClassesForScheduleEvents.has(cls)) continue;
            items.push({
              id: parsed.id || row.id,
              type: parsed.type || 'schedule_changed',
              classCode: cls,
              title: parsed.title || `Cập nhật lịch học Lớp ${cls}`,
              body: parsed.body || '',
              actionUrl: parsed.actionUrl || `#/classrooms?class=${encodeURIComponent(cls)}`,
              createdAt: parsed.createdAt || row.created_at
            });
          } catch {}
        }
      }

      const readSet = new Set();
      if (readStateRes.ok && Array.isArray(readStateRes.data)) {
        for (const r of readStateRes.data) {
          try {
            const parsed = JSON.parse(r.blocked_content || '[]');
            if (Array.isArray(parsed)) parsed.forEach(id => readSet.add(String(id)));
          } catch {}
        }
      }

      const seenNotifIds = new Set();
      const dedupedItems = [];
      for (const it of items) {
        if (!it || !it.id) continue;
        const nid = String(it.id);
        if (seenNotifIds.has(nid)) continue;
        seenNotifIds.add(nid);
        dedupedItems.push(it);
      }

      const filteredItems = dedupedItems.filter((it) => isEventTypeAllowedByUserPrefs(it.type, userPrefs));
      filteredItems.sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0));

      const hydrated = filteredItems.slice(0, 20).map(it => ({
        ...it,
        target_email: session.email,
        read: readSet.has(it.id)
      }));

      return jsonResponse({
        ok: true,
        notifications: hydrated,
        readIds: Array.from(readSet),
        settings: userPrefs
      });
    }

    if (path === '/api/ktn/notifications/read' && (request.method === 'PATCH' || request.method === 'POST')) {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      }
      const body = await request.json().catch(() => ({}));
      const ids = Array.isArray(body.ids)
        ? body.ids.map(x => String(x || '').trim()).filter(Boolean)
        : (body.id ? [String(body.id).trim()] : []);
      if (ids.length === 0) {
        return jsonResponse({ ok: true, markedCount: 0 });
      }
      const existingReadRes = await supabaseRequest(
        env,
        `ktn_dlp_alerts?room_id=eq.NOTIF_READ_STATE&sender_email=eq.${encodeURIComponent(session.email)}&order=created_at.desc&limit=50`
      );
      const mergedSet = new Set();
      const existingRows = (existingReadRes.ok && Array.isArray(existingReadRes.data)) ? existingReadRes.data : [];
      for (const r of existingRows.slice().reverse()) {
        try {
          const parsed = JSON.parse(r.blocked_content || '[]');
          if (Array.isArray(parsed)) parsed.forEach(id => { if (id) mergedSet.add(String(id).trim()); });
        } catch {}
      }
      ids.forEach(id => mergedSet.add(id));
      const mergedIds = Array.from(mergedSet).slice(-500);

      let sbRes = null;
      const latestRow = existingRows[0];
      if (latestRow && latestRow.id) {
        sbRes = await supabaseRequest(env, `ktn_dlp_alerts?id=eq.${encodeURIComponent(latestRow.id)}`, {
          method: 'PATCH',
          prefer: 'return=representation',
          body: {
            blocked_content: JSON.stringify(mergedIds)
          }
        });
      }
      if (!sbRes || !sbRes.ok || !Array.isArray(sbRes.data) || sbRes.data.length === 0) {
        sbRes = await supabaseRequest(env, 'ktn_dlp_alerts', {
          method: 'POST',
          prefer: 'return=representation',
          body: {
            id: 'NREAD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
            room_id: 'NOTIF_READ_STATE',
            sender_email: session.email,
            sender_name: session.name || session.email,
            sender_role: session.role || 'student',
            blocked_content: JSON.stringify(mergedIds),
            reason: 'NOTIFICATION_READ_STATE'
          }
        });
      }
      if (!sbRes.ok) {
        return jsonResponse({ ok: false, message: 'Chưa lưu được trạng thái đã đọc thông báo.' }, sbRes.status || 500);
      }
      return jsonResponse({ ok: true, markedCount: ids.length, totalReadCount: mergedIds.length, ids });
    }

    if (path === '/api/ktn/push/vapid-public-key' && request.method === 'GET') {
      return jsonResponse({
        ok: true,
        publicKey: String(env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY).trim(),
        serverDeliveryConfigured: Boolean(env.VAPID_PRIVATE_KEY)
      });
    }

    if (path === '/api/ktn/push/subscribe' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập để đăng ký nhận thông báo.' }, 401);
      }
      const body = await request.json().catch(() => ({}));
      const sub = body.subscription || {};
      const keys = sub.keys || {};
      const endpoint = String(sub.endpoint || '').trim();
      const p256dh = String(keys.p256dh || '').trim();
      const authKey = String(keys.auth || '').trim();
      if (
        !endpoint ||
        !endpoint.startsWith('https://') ||
        !p256dh ||
        !authKey ||
        endpoint.includes('push.khongtunhi.com/v2/') ||
        p256dh === 'ktn-mobile-web-p256dh' ||
        authKey === 'ktn-mobile-web-auth'
      ) {
        return jsonResponse({
          ok: false,
          error: 'INVALID_PUSH_SUBSCRIPTION',
          message: 'Đăng ký thông báo đẩy không hợp lệ: bắt buộc có PushSubscription thật (endpoint, keys.p256dh, keys.auth).'
        }, 400);
      }
      const normEmail = normalizeEmail(session.email);
      const previousEndpoint = String(body.previousEndpoint || sub.previousEndpoint || '').trim();
      if (previousEndpoint && previousEndpoint.startsWith('https://') && previousEndpoint !== endpoint && normEmail) {
        const cleanupPrevPromise = supabaseRequest(
          env,
          `ktn_push_subscriptions?user_email=eq.${encodeURIComponent(normEmail)}&endpoint=eq.${encodeURIComponent(previousEndpoint)}`,
          { method: 'DELETE' }
        ).catch(() => null);
        if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(cleanupPrevPromise);
        else await cleanupPrevPromise;
      }
      let realClassCode = session.classCode ? String(session.classCode).trim().toUpperCase() : null;
      if (session.role === 'student' && normEmail) {
        const stuRes = await supabaseRequest(
          env,
          `ktn_students?email=eq.${encodeURIComponent(normEmail)}&select=class_code&limit=1`
        );
        const stuRow = (stuRes.ok && Array.isArray(stuRes.data) && stuRes.data[0]) ? stuRes.data[0] : null;
        if (stuRow?.class_code) {
          realClassCode = String(stuRow.class_code).trim().toUpperCase();
        }
      }
      const subPayload = {
        user_email: normEmail,
        user_role: session.role,
        class_code: realClassCode,
        endpoint,
        p256dh,
        auth: authKey,
        notify_settings: body.notifySettings || undefined,
        user_agent: request.headers.get('User-Agent') || '',
        updated_at: new Date().toISOString()
      };
      let sbRes = await supabaseRequest(env, 'ktn_push_subscriptions?on_conflict=endpoint', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: subPayload
      });
      if ((!sbRes || !sbRes.ok) && sbRes?.status !== 503 && sbRes?.status !== 500) {
        sbRes = await supabaseRequest(env, `ktn_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
          method: 'PATCH',
          prefer: 'return=representation',
          body: subPayload
        });
      }
      if (!sbRes || !sbRes.ok) {
        return jsonResponse({
          ok: false,
          retryable: true,
          error: 'SUPABASE_PUSH_SUBSCRIBE_FAILED',
          message: 'Chưa lưu được đăng ký thông báo đẩy vào cơ sở dữ liệu Supabase. Vui lòng thử lại.'
        }, 502);
      }
      return jsonResponse({
        ok: true,
        endpoint,
        previousEndpointRemoved: Boolean(previousEndpoint && previousEndpoint !== endpoint),
        userEmail: normEmail,
        classCode: realClassCode,
        serverDeliveryConfigured: Boolean(env.VAPID_PRIVATE_KEY)
      });
    }

    if (path === '/api/ktn/push/ack' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const rawEventId = String(body.eventId || '').trim();
      if (!rawEventId) {
        return jsonResponse({ ok: false, error: 'MISSING_EVENT_ID' }, 400);
      }
      const safeAckEventId = rawEventId.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+/g, 'stu');
      const displayedAt = new Date().toISOString();
      let matched = false;
      if (Array.isArray(globalThis.__ktnPushDiagnosticsLog)) {
        for (const item of globalThis.__ktnPushDiagnosticsLog) {
          if (item && (item.eventId === safeAckEventId || item.eventId === rawEventId)) {
            item.deviceDisplayConfirmed = true;
            item.deviceDisplayedAt = displayedAt;
            item.deviceAckCount = (Number(item.deviceAckCount) || 0) + 1;
            matched = true;
            break;
          }
        }
      }
      return jsonResponse({
        ok: true,
        eventId: safeAckEventId,
        matchedDiagnosticEntry: matched,
        deviceDisplayConfirmed: true,
        deviceDisplayedAt: displayedAt
      });
    }

    if (path === '/api/ktn/push/diagnostics' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || (session.role !== 'admin' && session.role !== 'teacher')) {
        return jsonResponse({ ok: false, message: 'Chỉ Giáo viên hoặc Quản lý mới được xem chẩn đoán Push.' }, 403);
      }
      const subsRes = await supabaseRequest(
        env,
        'ktn_push_subscriptions?select=user_email,user_role,class_code,updated_at,user_agent&order=updated_at.desc&limit=50'
      );
      const activeSubscriptions = (Array.isArray(subsRes.data) ? subsRes.data : []).map((r) => ({
        userEmail: r.user_email,
        userRole: r.user_role,
        classCode: r.class_code || null,
        updatedAt: r.updated_at || null,
        isMobileUa: /Android|iPhone|iPad|iPod|Mobile/i.test(String(r.user_agent || ''))
      }));
      return jsonResponse({
        ok: true,
        format: 'eventId | eventType | recipientCount | subscriptionCount | pushAccepted | pushFailed | reason',
        recentLogs: Array.isArray(globalThis.__ktnPushDiagnosticsLog) ? globalThis.__ktnPushDiagnosticsLog : [],
        activeSubscriptionCount: activeSubscriptions.length,
        activeSubscriptions
      });
    }

    if (path === '/api/ktn/push/send' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      }
      if (!env.VAPID_PRIVATE_KEY) {
        return jsonResponse({
          ok: false,
          blocked: true,
          error: 'MISSING_VAPID_PRIVATE_KEY',
          message: 'Máy chủ chưa cấu hình VAPID_PRIVATE_KEY để gửi Web Push.'
        }, 503);
      }
      const body = await request.json().catch(() => ({}));
      const targetEmail =
        (session.role === 'admin' || session.role === 'teacher') && body.targetEmail
          ? normalizeEmail(body.targetEmail)
          : normalizeEmail(session.email);
      const eventId = String(body.eventId || body.id || `ktn-push-${Date.now()}`);
      const eventType = String(body.eventType || 'direct_push');
      const payloadObj = {
        id: eventId,
        eventId,
        eventType,
        title: String(body.title || 'Học Viện Khổng Tử Nhí'),
        body: String(body.body || 'Bạn có thông báo mới trên Sổ Liên Lạc Điện Tử.'),
        action_url: String(body.actionUrl || body.action_url || '/custom-page/so-lien-lac-test#/notifications')
      };
      const result = await dispatchWebPushForQuery(
        env,
        `user_email=eq.${encodeURIComponent(targetEmail)}`,
        payloadObj,
        {
          eventId,
          eventType,
          recipientEmails: targetEmail ? [targetEmail] : [],
          senderEmail: ''
        }
      );
      return jsonResponse({
        ok: result.ok && (result.delivered > 0 || result.expiredRemoved > 0),
        targetEmail,
        ...result
      }, result.ok ? 200 : 502);
    }

    // ========================================================================
    // G. DIỄN ĐÀN HỎI ĐÁP THEO TỪNG BÀI HỌC (LESSON FORUM) & ĐIỂM ĐÓNG GÓP GIÁO VIÊN
    // ========================================================================
    if (path === '/api/ktn/forum/questions' && (request.method === 'GET' || request.method === 'POST')) {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập để tham gia diễn đàn bài học.' }, 401);
      }
      const myEmail = normalizeEmail(session.email);

      if (request.method === 'GET') {
        const rawCourseId = String(url.searchParams.get('courseId') || '').trim().toLowerCase();
        const canonicalCourseId = rawCourseId ? (COURSE_CHAT_ALIASES[rawCourseId] || rawCourseId) : '';
        const unitIdFilter = String(url.searchParams.get('unitId') || '').trim();
        const rawLessonParam = url.searchParams.get('lessonNum') ?? url.searchParams.get('lessonNumber') ?? url.searchParams.get('lesson_num');
        const lessonNumFilter = rawLessonParam ? Number(rawLessonParam) : null;
        const statusFilter = String(url.searchParams.get('status') || 'all').trim().toLowerCase();
        const searchQ = normalizeViSearchText(url.searchParams.get('q') || url.searchParams.get('search') || '');
        const hasVideoOnly = url.searchParams.get('hasVideo') === '1' || url.searchParams.get('hasVideo') === 'true';
        const mineOnly = url.searchParams.get('mine') === '1' || url.searchParams.get('mine') === 'true';
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 60)));

        // Học sinh bắt buộc phải truy vấn theo khóa học mình được cấp quyền (hoặc chỉ xem câu hỏi của chính mình)
        if (session.role === 'student') {
          if (!canonicalCourseId && !mineOnly) {
            return jsonResponse({
              ok: false,
              error: 'COURSE_ID_REQUIRED',
              message: 'Vui lòng chọn bài học cụ thể để xem diễn đàn hỏi đáp.'
            }, 400);
          }
          if (canonicalCourseId && !canonicalCourseId.toUpperCase().startsWith('CLASS_')) {
            const access = await canAccessChatRoom(env, session, `course:${canonicalCourseId}`);
            if (!access.allowed) {
              return jsonResponse({
                ok: false,
                error: access.error || 'COURSE_NOT_ENTITLED',
                message: 'Em chưa đăng ký khóa học này nên chưa thể truy cập diễn đàn hỏi đáp của bài.'
              }, 403);
            }
          }
        } else if (session.role === 'teacher') {
          if (!(await isActiveTeacherSession(env, session))) {
            return jsonResponse({ ok: false, message: 'Tài khoản giáo viên đã bị tạm khóa.' }, 403);
          }
        }

        const [allQs, allAns, allFollows] = await Promise.all([
          loadAllForumQuestions(env),
          loadAllForumAnswers(env),
          loadAllForumFollows(env, null, { includeAll: true })
        ]);

        const ansByQ = new Map();
        for (const a of allAns) {
          if (!ansByQ.has(a.question_id)) ansByQ.set(a.question_id, []);
          ansByQ.get(a.question_id).push(a);
        }
        const followsByQ = new Map();
        for (const f of allFollows) {
          if (!followsByQ.has(f.question_id)) followsByQ.set(f.question_id, []);
          followsByQ.get(f.question_id).push(f);
        }

        const isStaff = session.role === 'teacher' || session.role === 'admin';
        const scopedQs = allQs.filter(q => {
          if (!isStaff && q.status === 'hidden') return false;
          if (canonicalCourseId && String(q.course_id || '').toLowerCase() !== canonicalCourseId) return false;
          if (unitIdFilter) {
            const qUnit = String(q.unit_id || '').trim();
            const matchUnit = qUnit === unitIdFilter || (lessonNumFilter && Number(q.lesson_num) === lessonNumFilter);
            if (!matchUnit) return false;
          } else if (lessonNumFilter && Number(q.lesson_num) !== lessonNumFilter) {
            return false;
          }
          if (mineOnly && normalizeEmail(q.student_email) !== myEmail) return false;
          return true;
        });

        const hydratedAll = scopedQs.map(q =>
          sanitizeForumQuestionForViewer(q, ansByQ.get(q.id) || [], followsByQ.get(q.id) || [], session)
        );

        const summary = {
          total: hydratedAll.length,
          openCount: hydratedAll.filter(q => q.status === 'open').length,
          unansweredCount: hydratedAll.filter(q => q.answerCount === 0 && q.status !== 'resolved').length,
          answeredCount: hydratedAll.filter(q => q.answerCount > 0 || q.status === 'answered' || q.status === 'resolved').length,
          resolvedCount: hydratedAll.filter(q => q.status === 'resolved' || q.hasAcceptedAnswer).length,
          claimedCount: hydratedAll.filter(q => q.status === 'claimed').length,
          videoAnswerCount: hydratedAll.filter(q => q.hasVideoAnswer).length
        };

        const filtered = hydratedAll.filter(q => {
          if (statusFilter === 'unanswered' || statusFilter === 'open') {
            if (q.answerCount > 0 || q.status === 'resolved' || q.status === 'answered') return false;
          } else if (statusFilter === 'answered') {
            if (q.answerCount === 0 && q.status !== 'answered' && q.status !== 'resolved') return false;
          } else if (statusFilter === 'resolved') {
            if (q.status !== 'resolved' && !q.hasAcceptedAnswer) return false;
          } else if (statusFilter === 'claimed') {
            if (q.status !== 'claimed') return false;
          }
          if (hasVideoOnly && !q.hasVideoAnswer) return false;
          if (searchQ) {
            const hay = normalizeViSearchText(
              `${q.title} ${q.content} ${q.lessonTitleSnapshot} ${q.studentName} ${q.courseTitle}`
            );
            if (!hay.includes(searchQ)) return false;
          }
          return true;
        });

        return jsonResponse({
          ok: true,
          courseId: canonicalCourseId || null,
          unitId: unitIdFilter || null,
          summary,
          questions: filtered.slice(0, limit)
        });
      }

      // POST /api/ktn/forum/questions — Đặt câu hỏi mới theo bài học
      if (session.role === 'teacher' && !(await isActiveTeacherSession(env, session))) {
        return jsonResponse({ ok: false, message: 'Tài khoản giáo viên đã bị tạm khóa.' }, 403);
      }
      const body = await request.json().catch(() => ({}));
      const rawCourseId = String(body.courseId || body.course_id || '').trim().toLowerCase();
      const canonicalCourseId = COURSE_CHAT_ALIASES[rawCourseId] || rawCourseId;
      const rawLessonNumInput = body.lessonNum ?? body.lessonNumber ?? body.lesson_num ?? body.lesson_number ?? 1;
      const lessonNum = Math.max(1, Number(rawLessonNumInput) || 1);
      const unitId = String(body.unitId || body.unit_id || `unit-l${lessonNum}`).trim();
      const lessonTitleSnapshot = String(
        body.lessonTitleSnapshot || body.lessonTitle || body.lesson_title_snapshot || `Bài ${lessonNum}`
      ).trim();
      const title = String(body.title || '').trim();
      const content = String(body.content || '').trim();
      const clientRequestId = String(
        body.clientRequestId || body.clientQuestionId || body.clientMessageId || ''
      ).trim().slice(0, 96);

      if (!canonicalCourseId || !unitId) {
        return jsonResponse({
          ok: false,
          error: 'MISSING_LESSON_SCOPE',
          message: 'Thiếu thông tin khóa học (courseId) hoặc bài học (unitId).'
        }, 400);
      }
      if (!title || title.length < 3) {
        return jsonResponse({
          ok: false,
          error: 'INVALID_QUESTION_TITLE',
          message: 'Vui lòng nhập tiêu đề ngắn cho câu hỏi (tối thiểu 3 ký tự).'
        }, 400);
      }
      if (!content || content.length < 3) {
        return jsonResponse({
          ok: false,
          error: 'INVALID_QUESTION_CONTENT',
          message: 'Vui lòng mô tả chi tiết nội dung câu hỏi.'
        }, 400);
      }

      if (session.role === 'student' && !canonicalCourseId.toUpperCase().startsWith('CLASS_')) {
        const access = await canAccessChatRoom(env, session, `course:${canonicalCourseId}`);
        if (!access.allowed) {
          return jsonResponse({
            ok: false,
            error: access.error || 'COURSE_NOT_ENTITLED',
            message: 'Em chưa được cấp quyền khóa học này nên chưa thể đặt câu hỏi.'
          }, 403);
        }
      }

      const dlp = inspectDlpContent(`${title} ${content}`);
      if (dlp.blocked) {
        return jsonResponse({
          ok: false,
          dlpBlocked: true,
          error: 'DLP_BLOCKED',
          message: `Nội dung câu hỏi bị chặn vì lý do an toàn: ${dlp.reason}.`
        }, 400);
      }

      const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];
      const cleanAttachments = [];
      for (const att of rawAttachments.slice(0, 5)) {
        const u = String(att?.fileUrl || att?.url || '').trim();
        if (!u) continue;
        if (u.startsWith('blob:') || u.startsWith('data:')) {
          return jsonResponse({
            ok: false,
            error: 'INVALID_ATTACHMENT_URL',
            message: 'Tệp đính kèm phải được tải lên kho lưu trữ S3 hoàn tất trước khi gửi câu hỏi (không chấp nhận blob: hoặc data: URL).'
          }, 400);
        }
        cleanAttachments.push({
          title: String(att?.title || att?.name || att?.fileName || 'Đính kèm').trim(),
          fileUrl: u,
          fileType: String(att?.fileType || att?.type || att?.mediaType || 'image/jpeg').trim(),
          size: Number(att?.size || 0)
        });
      }

      let videoTs = null;
      const rawVideoTs = body.videoTimestampSeconds ?? body.videoTimestampSec ?? body.video_timestamp_seconds;
      if (rawVideoTs !== undefined && rawVideoTs !== null && rawVideoTs !== '') {
        const parsedTs = Math.floor(Number(rawVideoTs));
        if (Number.isFinite(parsedTs) && parsedTs >= 0 && parsedTs <= 36000) {
          videoTs = parsedTs;
        }
      }

      const qId = clientRequestId
        ? `FQ-IDEM-${fnv1aHex(`${myEmail}|${canonicalCourseId}|${unitId}|${clientRequestId}`)}`
        : `FQ-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      const [existingQs, existingAns, existingFollows] = await Promise.all([
        loadAllForumQuestions(env),
        loadAllForumAnswers(env),
        loadAllForumFollows(env, null, { includeAll: true })
      ]);
      const foundExisting = existingQs.find(x => x.id === qId);
      if (foundExisting) {
        return jsonResponse({
          ok: true,
          idempotent: true,
          idempotentReplay: true,
          question: sanitizeForumQuestionForViewer(
            foundExisting,
            existingAns.filter(a => a.question_id === foundExisting.id),
            existingFollows.filter(f => f.question_id === foundExisting.id),
            session
          )
        });
      }

      const nowIso = new Date().toISOString();
      const studentCode = String(session.code || session.id || ('HS-' + fnv1aHex(myEmail).slice(0, 6).toUpperCase())).trim();
      const qRecord = {
        id: qId,
        course_id: canonicalCourseId,
        unit_id: unitId,
        lesson_num: lessonNum,
        lesson_title_snapshot: lessonTitleSnapshot,
        student_id: studentCode,
        student_email: myEmail,
        student_name: session.name || myEmail.split('@')[0],
        title,
        content,
        video_timestamp_seconds: videoTs,
        attachments: cleanAttachments,
        status: 'open',
        claimed_by_teacher_id: null,
        claimed_by_teacher_email: null,
        claimed_by_teacher_name: null,
        claimed_at: null,
        assigned_teacher_id: null,
        created_at: nowIso,
        updated_at: nowIso
      };

      const savedQ = await saveForumQuestion(env, qRecord, session);
      const authorFollow = await saveForumFollow(env, {
        questionId: qId,
        question_id: qId,
        userId: studentCode,
        user_id: studentCode,
        userEmail: myEmail,
        user_email: myEmail,
        userRole: session.role || 'student',
        user_role: session.role || 'student',
        notifyMode: 'immediate',
        notify_mode: 'immediate',
        following: true
      });

      // Thông báo cho tất cả giáo viên đang hoạt động (in-app luôn hiển thị; push di động tôn trọng forumPushMode)
      // Tuyệt đối KHÔNG gửi thông báo đẩy hàng loạt cho toàn bộ học viên của khóa học!
      let teacherPushDispatch = null;
      try {
        const teachers = await loadTeacherDirectory(env);
        const activeTeacherEmails = teachers
          .filter(t => t && t.active !== false && t.status !== 'locked' && t.status !== 'suspended')
          .map(t => normalizeEmail(t.email))
          .filter(em => em && em !== myEmail);
        if (activeTeacherEmails.length > 0) {
          const courseMeta = MASTER_PRODUCT_MAPPING[canonicalCourseId];
          const courseLabel = courseMeta?.shortTitle || courseMeta?.title || 'Khóa học KTN';
          const eventId = `FORUM-Q-${qId}`;
          teacherPushDispatch = await dispatchWebPushForQuery(
            env,
            '',
            {
              id: eventId,
              eventId,
              eventType: 'forum_question',
              title: `Học sinh vừa hỏi trong ${lessonTitleSnapshot}`,
              body: `${qRecord.student_name} (${courseLabel}): ${title}`,
              action_url: `/custom-page/so-lien-lac-test#/teacher?tab=forum&questionId=${encodeURIComponent(qId)}`
            },
            {
              eventId,
              eventType: 'forum_question',
              recipientEmails: activeTeacherEmails,
              senderEmail: myEmail
            }
          );
        }
      } catch {}

      return jsonResponse({
        ok: true,
        idempotent: false,
        question: sanitizeForumQuestionForViewer(savedQ?.question || savedQ, [], [authorFollow], session),
        teacherNotification: {
          inAppCreatedForAllActiveTeachers: true,
          pushDispatch: teacherPushDispatch
        }
      });
    }

    if (path === '/api/ktn/forum/questions/claim' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || (session.role !== 'teacher' && session.role !== 'admin')) {
        return jsonResponse({ ok: false, message: 'Chỉ Giáo viên hoặc Quản lý mới được nhận xử lý câu hỏi.' }, 403);
      }
      if (session.role === 'teacher' && !(await isActiveTeacherSession(env, session))) {
        return jsonResponse({ ok: false, message: 'Tài khoản giáo viên đã bị khóa.' }, 403);
      }
      const body = await request.json().catch(() => ({}));
      const questionId = String(body.questionId || body.id || '').trim();
      const action = String(body.action || 'claim').trim().toLowerCase();
      if (!questionId) {
        return jsonResponse({ ok: false, message: 'Thiếu mã câu hỏi (questionId).' }, 400);
      }
      const allQs = await loadAllForumQuestions(env);
      const q = allQs.find(x => x.id === questionId);
      if (!q) {
        return jsonResponse({ ok: false, message: 'Không tìm thấy câu hỏi này.' }, 404);
      }
      const teachers = await loadTeacherDirectory(env);
      const myTeacher = teachers.find(t => normalizeEmail(t.email) === normalizeEmail(session.email));
      const teacherId = myTeacher?.id || session.id || ('GV-' + fnv1aHex(session.email).slice(0, 6).toUpperCase());
      const nowIso = new Date().toISOString();

      if (
        action !== 'unclaim' &&
        q.status === 'claimed' &&
        q.claimed_by_teacher_email &&
        normalizeEmail(q.claimed_by_teacher_email) !== normalizeEmail(session.email) &&
        session.role !== 'admin' &&
        body.force !== true
      ) {
        return jsonResponse({
          ok: false,
          error: 'QUESTION_ALREADY_CLAIMED',
          claimedByEmail: q.claimed_by_teacher_email,
          claimedByName: q.claimed_by_teacher_name || q.claimed_by_teacher_email,
          message: `Câu hỏi này đang được ${q.claimed_by_teacher_name || q.claimed_by_teacher_email} nhận xử lý.`
        }, 409);
      }

      const updatedQ = action === 'unclaim'
        ? {
            ...q,
            status: q.status === 'claimed' ? 'open' : q.status,
            claimed_by_teacher_id: null,
            claimed_by_teacher_email: null,
            claimed_by_teacher_name: null,
            claimed_at: null,
            updated_at: nowIso
          }
        : {
            ...q,
            status: q.status === 'open' ? 'claimed' : q.status,
            claimed_by_teacher_id: teacherId,
            claimed_by_teacher_email: normalizeEmail(session.email),
            claimed_by_teacher_name: myTeacher?.name || session.name || session.email,
            claimed_at: nowIso,
            updated_at: nowIso
          };

      await saveForumQuestion(env, updatedQ, session);
      const [allAns, allFollows] = await Promise.all([
        loadAllForumAnswers(env),
        loadAllForumFollows(env, null, { includeAll: true })
      ]);
      const sanitizedClaimQ = sanitizeForumQuestionForViewer(
        updatedQ,
        allAns.filter(a => a.question_id === questionId),
        allFollows.filter(f => f.question_id === questionId),
        session
      );
      return jsonResponse({
        ok: true,
        questionStatus: sanitizedClaimQ.status,
        question: sanitizedClaimQ
      });
    }

    if (path === '/api/ktn/forum/answers' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập để gửi câu trả lời.' }, 401);
      }
      if (session.role === 'teacher' && !(await isActiveTeacherSession(env, session))) {
        return jsonResponse({ ok: false, message: 'Tài khoản giáo viên đã bị tạm khóa.' }, 403);
      }
      const myEmail = normalizeEmail(session.email);
      const body = await request.json().catch(() => ({}));
      const questionId = String(body.questionId || '').trim();
      const content = String(body.content || '').trim();
      const rawVideoUrl = String(body.videoUrl || '').trim();
      const rawVideoDuration = body.videoDurationSeconds ?? body.videoDurationSec;
      const videoDurationSeconds = rawVideoDuration ? Math.max(1, Math.round(Number(rawVideoDuration))) : null;
      const rawVideoSize = body.videoSizeBytes ?? body.videoFileSize;
      const videoSizeBytes = rawVideoSize !== undefined && rawVideoSize !== null ? Math.max(0, Math.round(Number(rawVideoSize))) : null;
      const clientRequestId = String(body.clientRequestId || body.clientAnswerId || body.clientMessageId || '').trim().slice(0, 96);

      if (!questionId) {
        return jsonResponse({ ok: false, message: 'Thiếu mã câu hỏi (questionId).' }, 400);
      }
      if (!content && !rawVideoUrl) {
        return jsonResponse({ ok: false, message: 'Vui lòng nhập nội dung giải đáp hoặc đính kèm video hướng dẫn.' }, 400);
      }

      // Kiểm tra nghiêm ngặt URL video hướng dẫn (chặn blob:, chặn data: lớn, chặn vượt 100MB)
      let videoVerified = false;
      if (rawVideoUrl) {
        if (rawVideoUrl.startsWith('blob:')) {
          return jsonResponse({
            ok: false,
            error: 'INVALID_VIDEO_URL_BLOB',
            message: 'Không được lưu đường dẫn tạm blob: vào cơ sở dữ liệu. Vui lòng đợi video tải lên S3 hoàn tất 100%.'
          }, 400);
        }
        if (rawVideoUrl.startsWith('data:')) {
          return jsonResponse({
            ok: false,
            error: 'INVALID_VIDEO_URL_DATA_URI',
            message: 'Không được lưu video dạng base64/data URI vào cơ sở dữ liệu. Vui lòng tải tệp video lên S3.'
          }, 400);
        }
        if (!/^https:\/\//i.test(rawVideoUrl)) {
          return jsonResponse({
            ok: false,
            error: 'INVALID_VIDEO_URL_SCHEME',
            message: 'Đường dẫn video hướng dẫn phải là liên kết HTTPS hợp lệ từ kho lưu trữ S3/CloudFront.'
          }, 400);
        }
        if (videoSizeBytes !== null && videoSizeBytes > FORUM_POINTS_CONFIG.MAX_VIDEO_BYTES) {
          return jsonResponse({
            ok: false,
            error: 'VIDEO_SIZE_EXCEEDED',
            message: 'Dung lượng video hướng dẫn vượt quá giới hạn tối đa 100MB.'
          }, 400);
        }
        videoVerified = true;
      }

      const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];
      const cleanAttachments = [];
      for (const att of rawAttachments.slice(0, 5)) {
        const u = String(att?.fileUrl || att?.url || '').trim();
        if (!u) continue;
        if (u.startsWith('blob:') || u.startsWith('data:')) {
          return jsonResponse({
            ok: false,
            error: 'INVALID_ATTACHMENT_URL',
            message: 'Tệp đính kèm phải được tải lên kho lưu trữ S3 hoàn tất trước khi gửi.'
          }, 400);
        }
        cleanAttachments.push({
          title: String(att?.title || att?.name || att?.fileName || 'Đính kèm').trim(),
          fileUrl: u,
          fileType: String(att?.fileType || att?.type || att?.mediaType || 'image/jpeg').trim(),
          size: Number(att?.size || 0)
        });
      }

      const [allQs, allAns, allFollows, allEvents, teachers] = await Promise.all([
        loadAllForumQuestions(env),
        loadAllForumAnswers(env),
        loadAllForumFollows(env, null, { includeAll: true }),
        loadAllTeacherContributionEvents(env),
        loadTeacherDirectory(env)
      ]);
      const q = allQs.find(x => x.id === questionId);
      if (!q) {
        return jsonResponse({ ok: false, message: 'Không tìm thấy câu hỏi cần trả lời.' }, 404);
      }

      // Học sinh chỉ được phản hồi tiếp vào câu hỏi trong khóa học mình có quyền
      if (session.role === 'student' && normalizeEmail(q.student_email) !== myEmail) {
        const access = await canAccessChatRoom(env, session, `course:${q.course_id}`);
        if (!access.allowed) {
          return jsonResponse({ ok: false, message: 'Em không có quyền trả lời câu hỏi này.' }, 403);
        }
      }

      const ansId = clientRequestId
        ? `FA-IDEM-${fnv1aHex(`${myEmail}|${questionId}|${clientRequestId}`)}`
        : `FA-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      const existingAns = allAns.find(a => a.id === ansId);
      if (existingAns) {
        const sanitizedExistingQ = sanitizeForumQuestionForViewer(
          q,
          allAns.filter(a => a.question_id === questionId),
          allFollows.filter(f => f.question_id === questionId),
          session
        );
        return jsonResponse({
          ok: true,
          idempotent: true,
          idempotentReplay: true,
          answer: sanitizedExistingQ.answers.find(a => a.id === ansId) || existingAns,
          questionStatus: sanitizedExistingQ.status,
          question: sanitizedExistingQ,
          pointsAwarded: 0
        });
      }

      const myTeacher = teachers.find(t => normalizeEmail(t.email) === myEmail);
      const isTeacherOrStaff = session.role === 'teacher' || session.role === 'admin' || Boolean(myTeacher);
      const teacherId = isTeacherOrStaff
        ? (myTeacher?.id || session.id || ('GV-' + fnv1aHex(myEmail).slice(0, 6).toUpperCase()))
        : null;
      const authorName = myTeacher?.name || session.name || myEmail.split('@')[0];
      const nowIso = new Date().toISOString();

      const priorTeacherAnswers = allAns.filter(
        a => a.question_id === questionId && (a.author_role === 'teacher' || a.author_role === 'admin') && a.status !== 'hidden'
      );

      const ansRecord = {
        id: ansId,
        question_id: questionId,
        author_id: teacherId || session.id || myEmail,
        author_email: myEmail,
        author_name: authorName,
        author_role: session.role || 'teacher',
        teacher_id: teacherId,
        content: content || (videoVerified ? 'Cô gửi video hướng dẫn chi tiết cho câu hỏi của em nhé.' : ''),
        attachments: cleanAttachments,
        video_url: rawVideoUrl || null,
        video_duration_seconds: videoDurationSeconds,
        video_size_bytes: videoSizeBytes,
        video_verified: videoVerified,
        is_accepted: Boolean(body.markResolved && isTeacherOrStaff),
        helpful_count: 0,
        helpful_voter_emails: [],
        status: 'visible',
        created_at: nowIso,
        updated_at: nowIso
      };

      await saveForumAnswer(env, ansRecord, session);

      const updatedAnswers = [...allAns.filter(a => a.question_id === questionId), ansRecord];
      let nextQStatus = q.status;
      if (isTeacherOrStaff) {
        nextQStatus = body.markResolved ? 'resolved' : (q.status === 'resolved' ? 'resolved' : 'answered');
      }
      const updatedQ = {
        ...q,
        status: nextQStatus,
        claimed_by_teacher_id: q.claimed_by_teacher_id || teacherId,
        claimed_by_teacher_email: q.claimed_by_teacher_email || (isTeacherOrStaff ? myEmail : null),
        claimed_by_teacher_name: q.claimed_by_teacher_name || (isTeacherOrStaff ? authorName : null),
        claimed_at: q.claimed_at || (isTeacherOrStaff ? nowIso : null),
        first_answered_at: q.first_answered_at || (isTeacherOrStaff ? nowIso : null),
        answer_count: updatedAnswers.length,
        updated_at: nowIso
      };
      await saveForumQuestion(env, updatedQ, session);

      // Cộng điểm đóng góp giáo viên theo cơ chế Event-Sourcing chống gian lận
      const awardedEvents = [];
      if (isTeacherOrStaff && teacherId && normalizeEmail(q.student_email) !== myEmail) {
        const isSubstantive = content.length >= FORUM_POINTS_CONFIG.MIN_ANSWER_LENGTH || videoVerified || cleanAttachments.length > 0;
        const alreadyAwardedAnswerForQ = allEvents.some(
          ev => ev.question_id === questionId && normalizeEmail(ev.teacher_email) === myEmail && ev.event_type === 'answer_created'
        );
        if (isSubstantive && !alreadyAwardedAnswerForQ) {
          const evRes = await recordTeacherContributionEvent(env, {
            event_id: `PTEVT-ANS-${questionId}-${teacherId}`,
            teacher_id: teacherId,
            teacher_email: myEmail,
            teacher_name: authorName,
            question_id: questionId,
            answer_id: ansId,
            event_type: 'answer_created',
            points_delta: FORUM_POINTS_CONFIG.ANSWER_CREATED,
            reason: `Trả lời câu hỏi bài học (${q.lesson_title_snapshot || 'Bài ' + q.lesson_num})`,
            created_at: nowIso
          });
          if (evRes.ok && !evRes.idempotent && !evRes.capped) awardedEvents.push(evRes.event);
        }

        if (videoVerified) {
          const alreadyAwardedVideoForQ = allEvents.some(
            ev => ev.question_id === questionId && normalizeEmail(ev.teacher_email) === myEmail && ev.event_type === 'video_attached'
          );
          if (!alreadyAwardedVideoForQ) {
            const vidEvRes = await recordTeacherContributionEvent(env, {
              event_id: `PTEVT-VID-${questionId}-${teacherId}`,
              teacher_id: teacherId,
              teacher_email: myEmail,
              teacher_name: authorName,
              question_id: questionId,
              answer_id: ansId,
              event_type: 'video_attached',
              points_delta: FORUM_POINTS_CONFIG.VIDEO_ATTACHED,
              reason: `Quay/tải video hướng dẫn giải đáp bài học (${q.lesson_title_snapshot || 'Bài ' + q.lesson_num})`,
              created_at: nowIso
            });
            if (vidEvRes.ok && !vidEvRes.idempotent && !vidEvRes.capped) awardedEvents.push(vidEvRes.event);
          }
        }

        const qCreatedMs = Date.parse(q.created_at || '') || 0;
        const isLongPending = qCreatedMs > 0 && (Date.now() - qCreatedMs >= FORUM_POINTS_CONFIG.LONG_PENDING_HOURS * 3600 * 1000);
        if (priorTeacherAnswers.length === 0 && isLongPending && isSubstantive) {
          const lpEvRes = await recordTeacherContributionEvent(env, {
            event_id: `PTEVT-LP-${questionId}-${teacherId}`,
            teacher_id: teacherId,
            teacher_email: myEmail,
            teacher_name: authorName,
            question_id: questionId,
            answer_id: ansId,
            event_type: 'long_pending_resolved',
            points_delta: FORUM_POINTS_CONFIG.LONG_PENDING_RESOLVED,
            reason: `Giải quyết câu hỏi tồn đọng > ${FORUM_POINTS_CONFIG.LONG_PENDING_HOURS} giờ`,
            created_at: nowIso
          });
          if (lpEvRes.ok && !lpEvRes.idempotent && !lpEvRes.capped) awardedEvents.push(lpEvRes.event);
        }
      }

      // Chỉ gửi thông báo cho học viên đặt câu hỏi và những người bấm Theo dõi câu hỏi đó (không spam toàn khóa!)
      let studentPushDispatch = null;
      if (isTeacherOrStaff) {
        const qFollowRows = allFollows.filter(f => f.question_id === questionId);
        const unfollowedSet = new Set(
          qFollowRows
            .filter(f => f.following === false || f.notify_mode === 'off')
            .map(f => normalizeEmail(f.user_email))
            .filter(Boolean)
        );
        const qFollowers = qFollowRows
          .filter(f => f.following !== false && f.notify_mode !== 'off')
          .map(f => normalizeEmail(f.user_email))
          .filter(Boolean);
        const ownerEmail = normalizeEmail(q.student_email);
        const rawCandidates = [
          ...(ownerEmail && !unfollowedSet.has(ownerEmail) ? [ownerEmail] : []),
          ...qFollowers
        ];
        const targetRecipients = Array.from(
          new Set(rawCandidates.filter(em => em && em !== myEmail && !unfollowedSet.has(em)))
        );
        if (targetRecipients.length > 0) {
          const eventId = `FORUM-ANS-${ansId}`;
          studentPushDispatch = await dispatchWebPushForQuery(
            env,
            '',
            {
              id: eventId,
              eventId,
              eventType: 'forum_answer',
              title: videoVerified
                ? `${authorName} vừa gửi video giải đáp câu hỏi của em!`
                : `${authorName} vừa trả lời câu hỏi bài học của em.`,
              body: `${q.lesson_title_snapshot || ('Bài ' + q.lesson_num)}: ${String(ansRecord.content || '').slice(0, 80)}`,
              action_url: `/custom-page/so-lien-lac-test#/khoa/${encodeURIComponent(q.course_id)}/bai/${q.lesson_num || 1}?tab=forum&questionId=${encodeURIComponent(questionId)}`
            },
            {
              eventId,
              eventType: 'forum_answer',
              recipientEmails: targetRecipients,
              senderEmail: myEmail
            }
          ).catch(() => null);
        }
      }

      const totalPointsAwarded = awardedEvents.reduce((acc, ev) => acc + (Number(ev.points_delta) || 0), 0);
      const sanitizedUpdatedQ = sanitizeForumQuestionForViewer(
        updatedQ,
        updatedAnswers,
        allFollows.filter(f => f.question_id === questionId),
        session
      );

      return jsonResponse({
        ok: true,
        idempotent: false,
        answer: sanitizedUpdatedQ.answers.find(a => a.id === ansId) || ansRecord,
        questionStatus: sanitizedUpdatedQ.status,
        question: sanitizedUpdatedQ,
        pointsAwarded: totalPointsAwarded,
        awardedEvents,
        studentNotification: studentPushDispatch
      });
    }

    if (path === '/api/ktn/forum/answers/helpful' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      }
      const myEmail = normalizeEmail(session.email);
      const body = await request.json().catch(() => ({}));
      const answerId = String(body.answerId || '').trim();
      const markAccepted = Boolean(body.accept || body.markAccepted);
      const voteHelpful = body.helpful !== false;

      if (!answerId) {
        return jsonResponse({ ok: false, message: 'Thiếu mã câu trả lời (answerId).' }, 400);
      }

      const [allQs, allAns, allFollows, teachers] = await Promise.all([
        loadAllForumQuestions(env),
        loadAllForumAnswers(env),
        loadAllForumFollows(env, null, { includeAll: true }),
        loadTeacherDirectory(env)
      ]);
      const ans = allAns.find(a => a.id === answerId);
      if (!ans) {
        return jsonResponse({ ok: false, message: 'Không tìm thấy câu trả lời.' }, 404);
      }
      const q = allQs.find(x => x.id === ans.question_id);
      if (!q) {
        return jsonResponse({ ok: false, message: 'Không tìm thấy câu hỏi gốc.' }, 404);
      }

      // Chống tự vote: Tác giả câu trả lời không được tự bầu chọn hữu ích cho chính mình
      if (voteHelpful && !markAccepted && normalizeEmail(ans.author_email) === myEmail) {
        return jsonResponse({
          ok: false,
          error: 'SELF_VOTE_FORBIDDEN',
          message: 'Bạn không thể tự bầu chọn hữu ích cho câu trả lời của chính mình.'
        }, 400);
      }

      const prevVoters = Array.isArray(ans.helpful_voter_emails)
        ? ans.helpful_voter_emails.map(e => normalizeEmail(e)).filter(Boolean)
        : [];
      const alreadyVoted = prevVoters.includes(myEmail);
      const nowIso = new Date().toISOString();
      const awardedEvents = [];

      let nextVoters = [...prevVoters];
      let nextHelpfulCount = Number(ans.helpful_count) || 0;
      const isSelfAnswer = normalizeEmail(ans.author_email) === myEmail;
      if (voteHelpful && !alreadyVoted && !isSelfAnswer) {
        nextVoters.push(myEmail);
        nextHelpfulCount = Math.max(nextHelpfulCount + 1, nextVoters.length);
      }

      const isQuestionOwner = normalizeEmail(q.student_email) === myEmail;
      const isStaff = session.role === 'teacher' || session.role === 'admin';
      const nextAccepted = markAccepted && (isQuestionOwner || isStaff) ? true : Boolean(ans.is_accepted);

      const updatedAns = {
        ...ans,
        helpful_count: nextHelpfulCount,
        helpful_voter_emails: nextVoters,
        is_accepted: nextAccepted,
        updated_at: nowIso
      };
      await saveForumAnswer(env, updatedAns, session);

      const updatedAnswersForQ = allAns
        .filter(a => a.question_id === q.id)
        .map(a => (a.id === ans.id ? updatedAns : a));
      const nextQuestionHelpfulTotal = updatedAnswersForQ.reduce((acc, a) => acc + (Number(a.helpful_count) || 0), 0);

      let updatedQ = {
        ...q,
        status: nextAccepted ? 'resolved' : q.status,
        helpful_count: nextQuestionHelpfulTotal,
        updated_at: nowIso
      };
      await saveForumQuestion(env, updatedQ, session);

      const ansTeacher = teachers.find(t => normalizeEmail(t.email) === normalizeEmail(ans.author_email));
      const teacherId = ans.teacher_id || ansTeacher?.id || null;
      const isTeacherAnswer = Boolean(teacherId && (ans.author_role === 'teacher' || ans.author_role === 'admin' || ansTeacher));

      if (isTeacherAnswer && voteHelpful && !alreadyVoted && !isSelfAnswer) {
        const evRes = await recordTeacherContributionEvent(env, {
          event_id: `PTEVT-HELPFUL-${ans.id}-${fnv1aHex(myEmail)}`,
          teacher_id: teacherId,
          teacher_email: normalizeEmail(ans.author_email),
          teacher_name: ans.author_name,
          question_id: q.id,
          answer_id: ans.id,
          voter_email: myEmail,
          event_type: 'helpful_vote',
          points_delta: FORUM_POINTS_CONFIG.HELPFUL_VOTE,
          reason: `Học viên đánh dấu "Câu trả lời giúp em hiểu bài" (${q.lesson_title_snapshot || 'Bài ' + q.lesson_num})`,
          created_at: nowIso
        });
        if (evRes.ok && !evRes.idempotent && !evRes.capped) awardedEvents.push(evRes.event);
      }

      if (isTeacherAnswer && nextAccepted && !ans.is_accepted && normalizeEmail(ans.author_email) !== myEmail) {
        const accRes = await recordTeacherContributionEvent(env, {
          event_id: `PTEVT-ACCEPT-${q.id}-${teacherId}`,
          teacher_id: teacherId,
          teacher_email: normalizeEmail(ans.author_email),
          teacher_name: ans.author_name,
          question_id: q.id,
          answer_id: ans.id,
          voter_email: myEmail,
          event_type: 'accepted_answer',
          points_delta: FORUM_POINTS_CONFIG.ACCEPTED_ANSWER,
          reason: `Câu trả lời giải quyết đúng thắc mắc bài học (${q.lesson_title_snapshot || 'Bài ' + q.lesson_num})`,
          created_at: nowIso
        });
        if (accRes.ok && !accRes.idempotent && !accRes.capped) awardedEvents.push(accRes.event);
      }

      const totalPointsAwarded = awardedEvents.reduce((acc, ev) => acc + (Number(ev.points_delta) || 0), 0);
      const sanitizedHelpfulQ = sanitizeForumQuestionForViewer(
        updatedQ,
        updatedAnswersForQ,
        allFollows.filter(f => f.question_id === q.id),
        session
      );

      return jsonResponse({
        ok: true,
        alreadyVoted,
        pointsAwarded: totalPointsAwarded,
        awardedEvents,
        questionStatus: sanitizedHelpfulQ.status,
        question: sanitizedHelpfulQ
      });
    }

    if (path === '/api/ktn/forum/follows' && (request.method === 'POST' || request.method === 'GET')) {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      }
      const myEmail = normalizeEmail(session.email);
      const myUserId = String(session.code || session.id || ('HS-' + fnv1aHex(myEmail).slice(0, 6).toUpperCase())).trim();

      if (request.method === 'GET') {
        const qIdParam = String(url.searchParams.get('questionId') || url.searchParams.get('question_id') || '').trim();
        const allFollows = await loadAllForumFollows(env, qIdParam || null, { includeAll: true });
        const activeFollows = allFollows.filter(f => f.following !== false && f.notify_mode !== 'off');
        const myRecord = allFollows.find(f => normalizeEmail(f.user_email) === myEmail) || null;
        return jsonResponse({
          ok: true,
          questionId: qIdParam || null,
          question_id: qIdParam || null,
          isFollowing: myRecord ? Boolean(myRecord.following) : false,
          following: myRecord ? Boolean(myRecord.following) : false,
          notifyMode: myRecord ? myRecord.notify_mode : 'off',
          notify_mode: myRecord ? myRecord.notify_mode : 'off',
          followNotifyMode: myRecord ? myRecord.notify_mode : 'off',
          follow: myRecord,
          followCount: activeFollows.length,
          followsCount: activeFollows.length,
          follows: activeFollows
        });
      }

      const body = await request.json().catch(() => ({}));
      const questionId = String(body.questionId || body.question_id || '').trim();
      if (!questionId) {
        return jsonResponse({ ok: false, message: 'Thiếu mã câu hỏi (questionId).' }, 400);
      }
      const allQs = await loadAllForumQuestions(env);
      const targetQ = allQs.find(x => x.id === questionId);
      if (targetQ && session.role === 'student' && !String(targetQ.course_id || '').toUpperCase().startsWith('CLASS_')) {
        const access = await canAccessChatRoom(env, session, `course:${targetQ.course_id}`);
        if (!access.allowed) {
          return jsonResponse({
            ok: false,
            error: access.error || 'COURSE_NOT_ENTITLED',
            message: 'Em chưa được cấp quyền khóa học này nên không thể theo dõi câu hỏi.'
          }, 403);
        }
      }
      const rawNotifyMode = String(body.notifyMode || body.notify_mode || '').trim().toLowerCase();
      const following = body.following !== undefined
        ? Boolean(body.following)
        : (body.isFollowing !== undefined ? Boolean(body.isFollowing) : rawNotifyMode !== 'off');
      const notifyMode = !following
        ? 'off'
        : (['immediate', 'digest', 'off'].includes(rawNotifyMode) ? rawNotifyMode : 'immediate');

      const followRecord = await saveForumFollow(env, {
        questionId,
        question_id: questionId,
        userId: myUserId,
        user_id: myUserId,
        userEmail: myEmail,
        user_email: myEmail,
        userRole: session.role || 'student',
        user_role: session.role || 'student',
        notifyMode,
        notify_mode: notifyMode,
        following: following && notifyMode !== 'off'
      });
      const updatedFollows = await loadAllForumFollows(env, questionId, { includeAll: true });
      const activeCount = updatedFollows.filter(f => f.following !== false && f.notify_mode !== 'off').length;
      const readBackRecord = updatedFollows.find(f => normalizeEmail(f.user_email) === myEmail) || followRecord;
      return jsonResponse({
        ok: true,
        questionId: readBackRecord.question_id,
        question_id: readBackRecord.question_id,
        userEmail: readBackRecord.user_email,
        user_email: readBackRecord.user_email,
        userRole: readBackRecord.user_role,
        user_role: readBackRecord.user_role,
        isFollowing: Boolean(readBackRecord.following),
        following: Boolean(readBackRecord.following),
        notifyMode: readBackRecord.notify_mode,
        notify_mode: readBackRecord.notify_mode,
        followNotifyMode: readBackRecord.notify_mode,
        followCount: activeCount,
        followsCount: activeCount,
        follow: readBackRecord
      });
    }

    if (path === '/api/ktn/forum/moderate' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || (session.role !== 'teacher' && session.role !== 'admin')) {
        return jsonResponse({ ok: false, message: 'Chỉ Giáo viên hoặc Quản lý mới có quyền điều phối diễn đàn.' }, 403);
      }
      const body = await request.json().catch(() => ({}));
      const targetType = String(body.targetType || 'question').toLowerCase();
      const targetId = String(body.targetId || body.questionId || body.answerId || '').trim();
      const action = String(body.action || 'resolve').toLowerCase();
      if (!targetId) {
        return jsonResponse({ ok: false, message: 'Thiếu mã đối tượng cần điều phối (targetId).' }, 400);
      }
      const nowIso = new Date().toISOString();

      if (targetType === 'answer') {
        const allAns = await loadAllForumAnswers(env);
        const ans = allAns.find(a => a.id === targetId);
        if (!ans) return jsonResponse({ ok: false, message: 'Không tìm thấy câu trả lời.' }, 404);
        const nextStatus = action === 'hide' || action === 'delete' ? 'hidden' : 'visible';
        const updatedAns = await saveForumAnswer(env, { ...ans, status: nextStatus, updated_at: nowIso });
        return jsonResponse({ ok: true, answer: updatedAns });
      }

      const allQs = await loadAllForumQuestions(env);
      const q = allQs.find(x => x.id === targetId);
      if (!q) return jsonResponse({ ok: false, message: 'Không tìm thấy câu hỏi.' }, 404);
      let nextStatus = q.status;
      if (action === 'resolve') nextStatus = 'resolved';
      else if (action === 'reopen') nextStatus = 'open';
      else if (action === 'hide' || action === 'delete') nextStatus = 'hidden';
      else if (action === 'unhide') nextStatus = 'open';
      const updatedQ = await saveForumQuestion(env, { ...q, status: nextStatus, updated_at: nowIso });
      return jsonResponse({ ok: true, question: updatedQ?.question || updatedQ });
    }

    if ((path === '/api/ktn/forum/points/adjust' || path === '/api/ktn/admin/teachers/points') && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || session.role !== 'admin') {
        return jsonResponse({ ok: false, message: 'Chỉ Quản lý (Admin) mới được điều chỉnh hoặc thu hồi điểm đóng góp giáo viên.' }, 403);
      }
      const body = await request.json().catch(() => ({}));
      let teacherEmail = normalizeEmail(body.teacherEmail || '');
      if (!teacherEmail && body.teacherId) {
        const rawId = String(body.teacherId).trim();
        if (rawId.includes('@')) {
          teacherEmail = normalizeEmail(rawId);
        } else {
          const teachers = await loadTeacherDirectory(env);
          const found = teachers.find(t => String(t.code || t.id || '').toUpperCase() === rawId.toUpperCase());
          if (found && found.email) {
            teacherEmail = normalizeEmail(found.email);
          }
        }
      }
      const pointsDelta = Math.round(Number(body.pointsDelta || 0));
      const reason = String(body.reason || '').trim();
      if (!teacherEmail || !pointsDelta || !reason) {
        return jsonResponse({
          ok: false,
          message: 'Vui lòng cung cấp đầy đủ email giáo viên, số điểm điều chỉnh (khác 0) và lý do minh bạch.'
        }, 400);
      }
      const teachers = await loadTeacherDirectory(env);
      const targetTeacher = teachers.find(t => normalizeEmail(t.email) === teacherEmail);
      const teacherId = body.teacherId || targetTeacher?.id || ('GV-' + fnv1aHex(teacherEmail).slice(0, 6).toUpperCase());
      const evRes = await recordTeacherContributionEvent(env, {
        event_id: `PTEVT-ADM-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        teacher_id: teacherId,
        teacher_email: teacherEmail,
        teacher_name: targetTeacher?.name || teacherEmail,
        question_id: body.questionId || null,
        answer_id: body.answerId || null,
        event_type: pointsDelta >= 0 ? 'admin_adjust' : 'admin_revoke',
        points_delta: pointsDelta,
        reason,
        created_by_email: normalizeEmail(session.email),
        created_at: new Date().toISOString()
      });
      await recordAdminAuditLog(env, {
        actorEmail: session.email,
        actorName: session.name,
        actorRole: session.role,
        action: pointsDelta >= 0 ? 'teacher_points_adjust' : 'teacher_points_revoke',
        targetType: 'teacher',
        targetEmail: teacherEmail,
        detail: { teacherId, pointsDelta, reason }
      });
      return jsonResponse({
        ok: true,
        event: evRes.event,
        message: `Đã ${pointsDelta >= 0 ? 'cộng' : 'thu hồi'} ${Math.abs(pointsDelta)} điểm đóng góp của ${targetTeacher?.name || teacherEmail}.`
      });
    }

    if ((path === '/api/ktn/forum/leaderboard' || path === '/api/ktn/teacher/contributions') && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      }
      const monthParam = String(url.searchParams.get('month') || new Date().toISOString().slice(0, 7)).trim();
      const [teachers, allEvents, allAns, allQs] = await Promise.all([
        loadTeacherDirectory(env),
        loadAllTeacherContributionEvents(env),
        loadAllForumAnswers(env),
        loadAllForumQuestions(env)
      ]);

      const leaderboard = teachers.map(t => {
        const tEmail = normalizeEmail(t.email);
        const tEvents = allEvents.filter(e => normalizeEmail(e.teacher_email) === tEmail || e.teacher_id === t.id);
        const monthEvents = monthParam && monthParam !== 'all'
          ? tEvents.filter(e => String(e.created_at || '').startsWith(monthParam))
          : tEvents;
        const tAnswers = allAns.filter(a => normalizeEmail(a.author_email) === tEmail && a.status !== 'hidden');
        const totalPoints = tEvents.reduce((acc, e) => acc + (Number(e.points_delta) || 0), 0);
        const monthlyPoints = monthEvents.reduce((acc, e) => acc + (Number(e.points_delta) || 0), 0);
        return {
          teacherId: t.id,
          teacherEmail: tEmail,
          teacherName: t.name,
          title: t.title || 'Giáo viên',
          avatar: t.avatar || null,
          active: t.active !== false && t.status !== 'locked',
          totalPoints: Math.max(0, totalPoints),
          monthlyPoints: Math.max(0, monthlyPoints),
          answersCount: tAnswers.length,
          acceptedAnswersCount: tAnswers.filter(a => a.is_accepted).length,
          helpfulVotesCount: tAnswers.reduce((acc, a) => acc + (Number(a.helpful_count) || 0), 0),
          videoGuidesCount: tAnswers.filter(a => a.video_verified && a.video_url).length,
          longPendingResolvedCount: tEvents.filter(e => e.event_type === 'long_pending_resolved').length,
          recentEvents: tEvents.slice(0, 15)
        };
      }).sort((a, b) => (b.monthlyPoints - a.monthlyPoints) || (b.totalPoints - a.totalPoints) || (b.answersCount - a.answersCount));

      return jsonResponse({
        ok: true,
        month: monthParam,
        openQuestionsCount: allQs.filter(q => q.status === 'open').length,
        totalQuestionsCount: allQs.filter(q => q.status !== 'hidden').length,
        pointsConfig: FORUM_POINTS_CONFIG,
        leaderboard
      });
    }

    // ========================================================================
    // AGENT E — GIÁO VIÊN TẠO HỌC VIÊN MỚI (CHỈ TRONG LỚP PHỤ TRÁCH, 0 KHÓA VIDEO)
    // & YÊU CẦU MỞ KHÓA HỌC ONLINE (PHÊ DUYỆT BỞI ADMIN)
    // ========================================================================
    if (path === '/api/ktn/teacher/students/create' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || (session.role !== 'teacher' && session.role !== 'admin')) {
        return jsonResponse({
          ok: false,
          error: 'FORBIDDEN_ROLE',
          message: 'Chỉ Giáo viên được phân công lớp hoặc Quản lý mới có quyền tạo học viên.'
        }, 403);
      }

      const body = await request.json().catch(() => ({}));
      if (body.role !== undefined && String(body.role || '').trim().toLowerCase() !== 'student') {
        return jsonResponse({
          ok: false,
          error: 'TEACHER_ROLE_SPOOF_FORBIDDEN',
          message: 'Giáo viên chỉ được phép khởi tạo tài khoản Học viên (student).'
        }, 403);
      }

      const rawCourseAttempt = [
        ...(Array.isArray(body.courseIds) ? body.courseIds : []),
        ...(Array.isArray(body.onlineCourses) ? body.onlineCourses : []),
        ...(Array.isArray(body.addCourseIds) ? body.addCourseIds : []),
        ...(body.courseId ? [body.courseId] : [])
      ].filter(Boolean);

      if (rawCourseAttempt.length > 0) {
        return jsonResponse({
          ok: false,
          error: 'TEACHER_COURSE_GRANT_FORBIDDEN',
          message: 'Giáo viên không được trực tiếp cấp khóa học video khi tạo học viên. Vui lòng sử dụng chức năng "Đề nghị mở khóa học online" để Quản lý phê duyệt.'
        }, 403);
      }

      let assignedClasses = [];
      if (session.role === 'teacher') {
        const teaRes = await supabaseRequest(
          env,
          `ktn_teachers?email=eq.${encodeURIComponent(normalizeEmail(session.email))}&limit=1`
        );
        const teaRow = (teaRes.ok && Array.isArray(teaRes.data) && teaRes.data[0]) || null;
        if (teaRow && teaRow.active === false) {
          return jsonResponse({
            ok: false,
            error: 'TEACHER_ACCOUNT_LOCKED',
            message: 'Tài khoản giáo viên đang tạm khóa. Vui lòng liên hệ Quản lý.'
          }, 403);
        }
        assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
        if (!Array.isArray(assignedClasses) || assignedClasses.length === 0) {
          return jsonResponse({
            ok: false,
            error: 'TEACHER_NO_ASSIGNED_CLASS',
            message: 'Bạn chưa được phân công lớp. Vui lòng liên hệ Quản lý.'
          }, 403);
        }
      }

      const requestedClassCode = String(body.classCode || '').trim().toUpperCase();
      const effectiveClassCode = session.role === 'teacher' && assignedClasses.length === 1 && !requestedClassCode
        ? assignedClasses[0]
        : requestedClassCode;

      if (!effectiveClassCode) {
        return jsonResponse({
          ok: false,
          error: 'CLASS_CODE_REQUIRED',
          message: 'Vui lòng chọn lớp học trực tiếp cần xếp cho học viên.'
        }, 400);
      }

      const clsCheck = await supabaseRequest(
        env,
        `ktn_classes?id=eq.${encodeURIComponent(effectiveClassCode)}&select=id,active&limit=1`
      );
      const clsRow = clsCheck.ok && Array.isArray(clsCheck.data) && clsCheck.data[0] ? clsCheck.data[0] : null;
      if (clsRow && clsRow.active === false) {
        return jsonResponse({
          ok: false,
          error: 'CLASS_ARCHIVED_OR_INACTIVE',
          message: `Lớp ${effectiveClassCode} đã được lưu trữ nên không thể thêm học viên mới.`
        }, 409);
      }

      if (session.role === 'teacher' && !assignedClasses.includes(effectiveClassCode)) {
        return jsonResponse({
          ok: false,
          error: 'TEACHER_CLASS_SCOPE_FORBIDDEN',
          message: `Bạn chỉ được phép tạo và xếp học viên vào lớp mình đang phụ trách (${assignedClasses.join(', ')}).`
        }, 403);
      }

      const email = normalizeEmail(body.email || body.studentEmail || '');
      const name = String(body.name || body.studentName || '').trim();
      const phone = String(body.studentPhone ?? body.phone ?? '').trim();
      const parentName = String(body.parentName ?? body.parent_name ?? '').trim();
      const parentPhone = String(body.parentPhone ?? body.parent_phone ?? '').trim();
      const note = String(body.note ?? body.notes ?? body.internalNote ?? body.internal_note ?? '').trim();
      const clientRequestId = String(
        body.clientRequestId || body.idempotencyKey || request.headers.get('Idempotency-Key') || ''
      ).trim();
      const explicitInitialPassword = String(body.initialPassword || body.password || '').trim();

      if (!email || !email.includes('@')) {
        return jsonResponse({ ok: false, message: 'Vui lòng nhập Email đăng nhập hợp lệ cho học viên.' }, 400);
      }
      if (!name) {
        return jsonResponse({ ok: false, message: 'Vui lòng nhập Họ và tên học viên.' }, 400);
      }

      const lockKey = `teacher_stu_create:${email}`;
      return runWithProvisioningLock(lockKey, async () => {
        if (!globalThis.__ktnTeacherStudentCreateReceipts) {
          globalThis.__ktnTeacherStudentCreateReceipts = new Map();
        }
        if (clientRequestId) {
          const cachedReceipt = globalThis.__ktnTeacherStudentCreateReceipts.get(
            `${normalizeEmail(session.email)}|${email}|${clientRequestId}`
          );
          if (cachedReceipt) {
            return jsonResponse({
              ...cachedReceipt,
              idempotentReplay: true
            });
          }
        }

        // Kiểm tra học viên đã tồn tại trong Supabase hoặc vòng đời học viên chưa
        const [stuLookup, stuLifecycle] = await Promise.all([
          supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(email)}&select=*&limit=1`),
          getStudentLifecycleState(env, email).catch(() => null)
        ]);
        const existingStu = (stuLookup.ok && Array.isArray(stuLookup.data) && stuLookup.data[0]) || null;

        if (stuLifecycle?.status === 'deleted') {
          return jsonResponse({
            ok: false,
            error: 'STUDENT_DELETED_LOCKED',
            message: 'Email học viên này đã bị xóa khỏi hệ thống bởi Quản lý. Vui lòng liên hệ Quản lý nếu cần khôi phục.'
          }, 409);
        }

        if (existingStu) {
          const enrichedExisting = enrichStudentRowV3(existingStu);
          const existingClass = String(existingStu.class_code || '').trim().toUpperCase();
          return jsonResponse({
            ok: false,
            error: 'STUDENT_ALREADY_EXISTS',
            existingStudent: {
              email: existingStu.email,
              name: existingStu.name,
              code: existingStu.code,
              classCode: existingClass || null,
              phone: enrichedExisting.phone || null,
              parentName: enrichedExisting.parentName || enrichedExisting.parent_name || null,
              parent_name: enrichedExisting.parent_name || null,
              parentPhone: enrichedExisting.parentPhone || enrichedExisting.parent_phone || null,
              parent_phone: enrichedExisting.parent_phone || null
            },
            message: existingClass
              ? `Học viên ${existingStu.name || email} đã tồn tại trên hệ thống (đang thuộc lớp ${existingClass}). Không tự động ghi đè hoặc chuyển lớp; vui lòng liên hệ Quản lý nếu cần điều chuyển.`
              : `Học viên ${existingStu.name || email} đã có tài khoản trên hệ thống. Vui lòng báo Quản lý kiểm tra hoặc gửi Đề nghị mở khóa học.`
          }, 409);
        }

        // Kiểm tra trên izTeach CRM xem email đã tồn tại chưa để không âm thầm cướp tài khoản cũ
        const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
        const adminToken = await getIzTeachAdminToken(env);
        if (adminToken) {
          try {
            const searchRes = await fetch(`${IZTEACH_ENDPOINTS.studentCrm}?vendorId=${encodeURIComponent(vendorId)}&email=${encodeURIComponent(email)}`, {
              headers: { Authorization: adminToken }
            });
            if (searchRes.ok) {
              const searchData = await searchRes.json().catch(() => null);
              const list = extractIzTeachStudentRecords(searchData);
              const foundIz = list.find(u => normalizeEmail(u?.email || u?.user?.email) === email);
              if (foundIz && session.role === 'teacher') {
                return jsonResponse({
                  ok: false,
                  error: 'STUDENT_ALREADY_EXISTS_ON_IZTEACH',
                  existingStudent: {
                    email,
                    name: foundIz.name || email,
                    classCode: null
                  },
                  message: `Email ${email} đã tồn tại trên hệ thống học viên izTeach (${foundIz.name || email}). Để tránh ghi đè tài khoản cũ, vui lòng liên hệ Quản lý để xác nhận gán lớp.`
                }, 409);
              }
            }
          } catch {}
        }

        const opId = generateOperationId('TEA-STU');
        const effectiveContactPhone = phone || parentPhone || '';
        const prov = await provisionStudentOnIzTeach(env, {
          operationId: opId,
          student_email: email,
          student_name: name,
          phone: effectiveContactPhone,
          initialPassword: explicitInitialPassword.length >= 6 ? explicitInitialPassword : undefined,
          courseIds: [],
          skipCourses: true
        });

        if (!prov.ok) {
          return jsonResponse({
            ok: false,
            retryable: true,
            operationId: opId,
            error: 'IZTEACH_PROVISION_FAILED',
            message: `Chưa khởi tạo được tài khoản đăng nhập cho học viên (${prov.error || 'Lỗi dịch vụ upstream'}). Vui lòng thử lại.`
          }, 502);
        }

        const auditNote = note
          ? `[GV ${session.name || session.email} tạo vào lớp ${effectiveClassCode}]: ${note}`
          : `[GV ${session.name || session.email} tạo mới vào lớp ${effectiveClassCode}]`;

        const savedStudent = await mergeAndUpsertStudentCourses(env, {
          email,
          name,
          phone: phone || parentPhone || '',
          parentName: parentName || undefined,
          parentPhone: parentPhone || undefined,
          classCode: effectiveClassCode,
          cognitoUserId: prov.cognitoUserId || null,
          izteachStudentId: prov.izteachStudentId || null,
          addCourseIds: [],
          replaceCourseIds: [],
          accountStatus: isValidCognitoUuid(prov.cognitoUserId) ? 'active' : 'pending_activation',
          syncStatus: isValidCognitoUuid(prov.cognitoUserId) ? 'synced' : 'pending_sync',
          internalNote: auditNote,
          actorEmail: session.email
        });

        if (!savedStudent || savedStudent.ok === false) {
          return jsonResponse({
            ok: false,
            retryable: true,
            operationId: opId,
            error: 'SUPABASE_UPSERT_FAILED',
            message: 'Đã tạo tài khoản học viên nhưng chưa lưu được hồ sơ vào cơ sở dữ liệu. Vui lòng thử lại.'
          }, 502);
        }

        await recordAdminAuditLog(env, {
          actorEmail: session.email,
          actorRole: session.role,
          action: 'teacher_create_student',
          targetType: 'student',
          targetId: email,
          reason: note || `Tạo học viên mới vào lớp ${effectiveClassCode}`,
          metadata: {
            studentEmail: email,
            studentName: name,
            phone: phone || null,
            parentName: parentName || null,
            parentPhone: parentPhone || null,
            classCode: effectiveClassCode,
            cognitoUserId: prov.cognitoUserId || null,
            onlineCoursesGranted: 0
          }
        });

        const enrichedSaved = enrichStudentRowV3(savedStudent);
        const responsePayload = {
          ok: true,
          operationId: opId,
          clientRequestId: clientRequestId || null,
          student: enrichedSaved,
          classCode: effectiveClassCode,
          classJoinedNotification: savedStudent.classJoinedNotification || null,
          pushDispatch: savedStudent.pushDispatch || null,
          parentName: enrichedSaved.parentName || enrichedSaved.parent_name || null,
          parent_name: enrichedSaved.parent_name || null,
          parentPhone: enrichedSaved.parentPhone || enrichedSaved.parent_phone || null,
          parent_phone: enrichedSaved.parent_phone || null,
          onlineCourses: [],
          cognitoUserId: prov.cognitoUserId || null,
          izteachStudentId: prov.izteachStudentId || null,
          accountCreated: Boolean(prov.accountCreated),
          initialPassword: prov.initialPassword || (explicitInitialPassword.length >= 6 ? explicitInitialPassword : null),
          message: `Đã tạo tài khoản học viên ${name} (${email}) và xếp vào lớp ${effectiveClassCode} thành công!`
        };

        if (clientRequestId) {
          globalThis.__ktnTeacherStudentCreateReceipts.set(
            `${normalizeEmail(session.email)}|${email}|${clientRequestId}`,
            responsePayload
          );
        }

        return jsonResponse(responsePayload);
      });
    }

    if (path === '/api/ktn/course-requests' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || (session.role !== 'teacher' && session.role !== 'admin')) {
        return jsonResponse({ ok: false, message: 'Chỉ Giáo viên hoặc Quản lý mới được xem danh sách đề nghị mở khóa học.' }, 403);
      }
      const statusFilter = String(url.searchParams.get('status') || '').trim().toLowerCase();
      const studentFilter = normalizeEmail(url.searchParams.get('studentEmail') || '');
      let requests = await loadAllCourseGrantRequests(env);
      if (session.role === 'teacher') {
        const myEmail = normalizeEmail(session.email);
        requests = requests.filter(r => normalizeEmail(r.teacher_email) === myEmail);
      }
      if (statusFilter && statusFilter !== 'all') {
        requests = requests.filter(r => String(r.status || 'pending').toLowerCase() === statusFilter);
      }
      if (studentFilter) {
        requests = requests.filter(r => normalizeEmail(r.student_email) === studentFilter);
      }
      return jsonResponse({
        ok: true,
        requests,
        pendingCount: requests.filter(r => r.status === 'pending').length
      });
    }

    if (path === '/api/ktn/course-requests' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || (session.role !== 'teacher' && session.role !== 'admin')) {
        return jsonResponse({ ok: false, message: 'Chỉ Giáo viên hoặc Quản lý mới được thao tác đề nghị mở khóa học.' }, 403);
      }
      const body = await request.json().catch(() => ({}));
      const action = String(body.action || 'create').trim().toLowerCase();

      if (action === 'cancel') {
        const reqId = String(body.requestId || body.id || '').trim();
        if (!reqId) {
          return jsonResponse({ ok: false, message: 'Thiếu mã yêu cầu cần hủy (requestId).' }, 400);
        }
        const allReqs = await loadAllCourseGrantRequests(env);
        const existing = allReqs.find(r => r.id === reqId);
        if (!existing) {
          return jsonResponse({ ok: false, message: 'Không tìm thấy yêu cầu mở khóa học.' }, 404);
        }
        if (session.role === 'teacher' && normalizeEmail(existing.teacher_email) !== normalizeEmail(session.email)) {
          return jsonResponse({ ok: false, message: 'Bạn chỉ được hủy yêu cầu do chính mình gửi.' }, 403);
        }
        if (existing.status !== 'pending') {
          return jsonResponse({ ok: false, message: `Yêu cầu này đã ở trạng thái ${existing.status}, không thể hủy.` }, 400);
        }
        const saved = await saveCourseGrantRequest(env, {
          ...existing,
          status: 'cancelled',
          review_note: body.reason || 'Giáo viên tự hủy yêu cầu'
        }, session);
        return jsonResponse({
          ok: true,
          request: saved.request,
          message: 'Đã hủy yêu cầu mở khóa học online.'
        });
      }

      const studentEmail = normalizeEmail(body.studentEmail || body.email || '');
      const rawCourseId = String(body.courseId || '').trim().toLowerCase();
      const canonicalCourseId = COURSE_CHAT_ALIASES[rawCourseId] || rawCourseId;
      const reason = String(body.reason || body.note || '').trim();

      if (!studentEmail || !studentEmail.includes('@')) {
        return jsonResponse({ ok: false, message: 'Vui lòng chọn học viên hợp lệ.' }, 400);
      }
      if (!canonicalCourseId) {
        return jsonResponse({ ok: false, message: 'Vui lòng chọn khóa học video cần đề nghị mở.' }, 400);
      }
      if (reason.length < 3) {
        return jsonResponse({ ok: false, message: 'Vui lòng nhập lý do đề nghị mở khóa học (tối thiểu 3 ký tự).' }, 400);
      }

      const stuLookup = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(studentEmail)}&select=*&limit=1`);
      const stuRow = (stuLookup.ok && Array.isArray(stuLookup.data) && stuLookup.data[0]) || null;

      let assignedClasses = [];
      if (session.role === 'teacher') {
        assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
        if (assignedClasses.length === 0) {
          return jsonResponse({
            ok: false,
            error: 'TEACHER_NO_ASSIGNED_CLASS',
            message: 'Bạn chưa được phân công lớp. Vui lòng liên hệ Quản lý.'
          }, 403);
        }
        const stuClass = String(stuRow?.class_code || body.classCode || '').trim().toUpperCase();
        if (!stuClass || !assignedClasses.includes(stuClass)) {
          return jsonResponse({
            ok: false,
            error: 'TEACHER_CLASS_SCOPE_FORBIDDEN',
            message: 'Bạn chỉ được gửi đề nghị mở khóa học cho học viên thuộc lớp mình đang phụ trách.'
          }, 403);
        }
      }

      const allReqs = await loadAllCourseGrantRequests(env);
      const duplicatePending = allReqs.find(
        r =>
          r.status === 'pending' &&
          normalizeEmail(r.student_email) === studentEmail &&
          String(r.course_id || '').toLowerCase() === canonicalCourseId
      );
      if (duplicatePending) {
        return jsonResponse({
          ok: true,
          idempotentReplay: true,
          request: duplicatePending,
          message: 'Yêu cầu mở khóa học này đang chờ Quản lý phê duyệt.'
        });
      }

      const courseMeta = MASTER_PRODUCT_MAPPING[canonicalCourseId] || {};
      const courseTitle = String(body.courseTitle || courseMeta.title || courseMeta.shortTitle || canonicalCourseId).trim();
      const saved = await saveCourseGrantRequest(env, {
        id: `CREQ-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        teacher_id: session.code || session.id || session.email,
        teacher_email: normalizeEmail(session.email),
        teacher_name: session.name || session.email,
        student_id: stuRow?.code || body.studentId || studentEmail,
        student_email: studentEmail,
        student_name: String(stuRow?.name || body.studentName || studentEmail.split('@')[0]).trim(),
        class_code: String(stuRow?.class_code || body.classCode || assignedClasses[0] || '').trim().toUpperCase(),
        course_id: canonicalCourseId,
        course_title: courseTitle,
        reason,
        status: 'pending'
      }, session);

      await recordAdminAuditLog(env, {
        actorEmail: session.email,
        actorRole: session.role,
        action: 'course_grant_request_created',
        targetType: 'student',
        targetId: studentEmail,
        reason,
        metadata: {
          requestId: saved.request.id,
          courseId: canonicalCourseId,
          courseTitle,
          classCode: saved.request.class_code
        }
      });

      return jsonResponse({
        ok: true,
        request: saved.request,
        message: `Đã gửi đề nghị mở khóa "${courseTitle}" cho học viên ${saved.request.student_name}. Quản lý sẽ xem xét và phê duyệt.`
      });
    }

    if (path === '/api/ktn/course-requests/review' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || session.role !== 'admin') {
        return jsonResponse({
          ok: false,
          error: 'ADMIN_ONLY',
          message: 'Chỉ Quản lý (Admin) mới có quyền phê duyệt hoặc từ chối đề nghị mở khóa học.'
        }, 403);
      }

      const body = await request.json().catch(() => ({}));
      const requestId = String(body.requestId || body.id || '').trim();
      const rawDecision = String(body.decision || body.action || '').trim().toLowerCase();
      const isApprove = rawDecision === 'approve' || rawDecision === 'approved';
      const isReject = rawDecision === 'reject' || rawDecision === 'rejected';
      const reviewNote = String(body.reviewNote || body.reason || '').trim();

      if (!requestId || (!isApprove && !isReject)) {
        return jsonResponse({
          ok: false,
          message: 'Vui lòng cung cấp mã yêu cầu (requestId) và quyết định (approve / reject).'
        }, 400);
      }

      const allReqs = await loadAllCourseGrantRequests(env);
      const targetReq = allReqs.find(r => r.id === requestId);
      if (!targetReq) {
        return jsonResponse({ ok: false, message: 'Không tìm thấy yêu cầu mở khóa học.' }, 404);
      }
      if (targetReq.status === 'approved' && isApprove) {
        return jsonResponse({
          ok: true,
          idempotentReplay: true,
          request: targetReq,
          message: 'Yêu cầu này đã được phê duyệt trước đó.'
        });
      }

      const nowIso = new Date().toISOString();
      if (isReject) {
        const updated = await saveCourseGrantRequest(env, {
          ...targetReq,
          status: 'rejected',
          reviewed_by_email: normalizeEmail(session.email),
          reviewed_at: nowIso,
          review_note: reviewNote || 'Quản lý từ chối yêu cầu mở khóa học'
        }, session);

        await insertTargetedForumNotification(env, {
          eventId: `CREQ_REJECT_${requestId}`,
          recipientEmail: targetReq.teacher_email,
          recipientRole: 'teacher',
          senderEmail: session.email,
          senderName: session.name || 'Quản lý KTN',
          title: `Từ chối đề nghị mở khóa: ${targetReq.student_name}`,
          body: `Đề nghị mở khóa "${targetReq.course_title}" cho ${targetReq.student_name} đã bị từ chối.${reviewNote ? ' Lý do: ' + reviewNote : ''}`,
          link: '#/teacher?tab=students',
          courseId: targetReq.course_id
        }).catch(() => null);

        await recordAdminAuditLog(env, {
          actorEmail: session.email,
          actorRole: 'admin',
          action: 'course_grant_request_rejected',
          targetType: 'student',
          targetId: targetReq.student_email,
          reason: reviewNote || 'Từ chối đề nghị mở khóa học',
          metadata: { requestId, courseId: targetReq.course_id, teacherEmail: targetReq.teacher_email }
        });

        return jsonResponse({
          ok: true,
          request: updated.request,
          message: `Đã từ chối đề nghị mở khóa học cho ${targetReq.student_name}.`
        });
      }

      // Phê duyệt: Cấp quyền thực sự trên izTeach + đồng bộ vào Supabase ktn_students
      const stuLookup = await supabaseRequest(
        env,
        `ktn_students?email=eq.${encodeURIComponent(targetReq.student_email)}&select=*&limit=1`
      );
      const existingStu = (stuLookup.ok && Array.isArray(stuLookup.data) && stuLookup.data[0]) || null;
      const resolvedCourseIds = resolveOrderCourseIds([targetReq.course_id]);

      const prov = await provisionStudentOnIzTeach(env, {
        student_email: targetReq.student_email,
        student_name: existingStu?.name || targetReq.student_name || targetReq.student_email.split('@')[0],
        phone: existingStu?.phone || '',
        courseIds: resolvedCourseIds,
        skipCourses: false,
        replaceCourses: false,
        cognito_user_id: existingStu?.cognito_user_id || null
      });

      if (!prov.ok) {
        return jsonResponse({
          ok: false,
          retryable: true,
          error: 'IZTEACH_COURSE_GRANT_FAILED',
          message: `Chưa cấp được khóa học trên izTeach (${prov.error || 'Lỗi upstream'}). Yêu cầu vẫn giữ ở trạng thái Chờ duyệt để bấm thử lại.`
        }, 502);
      }

      const updatedStudent = await mergeAndUpsertStudentCourses(env, {
        email: targetReq.student_email,
        name: existingStu?.name || targetReq.student_name,
        phone: existingStu?.phone || '',
        classCode: existingStu?.class_code || targetReq.class_code || undefined,
        cognitoUserId: prov.cognitoUserId || existingStu?.cognito_user_id || null,
        izteachStudentId: prov.izteachStudentId || existingStu?.izteach_student_id || null,
        addCourseIds: resolvedCourseIds,
        accountStatus: 'active',
        syncStatus: 'synced'
      });

      const updated = await saveCourseGrantRequest(env, {
        ...targetReq,
        status: 'approved',
        reviewed_by_email: normalizeEmail(session.email),
        reviewed_at: nowIso,
        review_note: reviewNote || 'Đã phê duyệt và kích hoạt khóa học',
        entitlement_result: {
          ok: true,
          grantedCourseIds: resolvedCourseIds,
          cognitoUserId: prov.cognitoUserId || null,
          approvedAt: nowIso
        }
      }, session);

      await Promise.all([
        insertTargetedForumNotification(env, {
          eventId: `CREQ_APPROVE_TEA_${requestId}`,
          recipientEmail: targetReq.teacher_email,
          recipientRole: 'teacher',
          senderEmail: session.email,
          senderName: session.name || 'Quản lý KTN',
          title: `Đã duyệt mở khóa: ${targetReq.student_name}`,
          body: `Quản lý đã phê duyệt và mở khóa "${targetReq.course_title}" cho học viên ${targetReq.student_name}.`,
          link: '#/teacher?tab=students',
          courseId: targetReq.course_id
        }).catch(() => null),
        insertTargetedForumNotification(env, {
          eventId: `CREQ_APPROVE_STU_${requestId}`,
          recipientEmail: targetReq.student_email,
          recipientRole: 'student',
          senderEmail: session.email,
          senderName: session.name || 'Quản lý KTN',
          title: `Bạn đã được mở khóa học mới: ${targetReq.course_title}`,
          body: `Khóa học "${targetReq.course_title}" đã được kích hoạt trên tài khoản của bạn. Hãy vào mục Tự học để bắt đầu!`,
          link: `#/learning?courseId=${encodeURIComponent(targetReq.course_id)}`,
          courseId: targetReq.course_id
        }).catch(() => null),
        recordAdminAuditLog(env, {
          actorEmail: session.email,
          actorRole: 'admin',
          action: 'course_grant_request_approved',
          targetType: 'student',
          targetId: targetReq.student_email,
          reason: reviewNote || `Duyệt đề nghị của GV ${targetReq.teacher_email}`,
          metadata: {
            requestId,
            courseId: targetReq.course_id,
            grantedCourseIds: resolvedCourseIds,
            teacherEmail: targetReq.teacher_email
          }
        })
      ]);

      return jsonResponse({
        ok: true,
        request: updated.request,
        student: updatedStudent ? enrichStudentRowV3(updatedStudent) : null,
        message: `Đã phê duyệt và mở khóa "${targetReq.course_title}" cho học viên ${targetReq.student_name} thành công!`
      });
    }

    // ========================================================================
    // AGENT F — QUẢN LÝ VÒNG ĐỜI HỌC VIÊN (SUSPEND / ARCHIVE / RESTORE / DELETE)
    // ========================================================================
    if (path === '/api/ktn/admin/students/lifecycle' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || session.role !== 'admin') {
        return jsonResponse({
          ok: false,
          error: 'ADMIN_ONLY',
          message: 'Chỉ Quản lý (Admin) mới có quyền khóa, lưu trữ, khôi phục hoặc xóa tài khoản học viên.'
        }, 403);
      }

      const body = await request.json().catch(() => ({}));
      const email = normalizeEmail(body.email || body.studentEmail || '');
      const action = String(body.action || '').trim().toLowerCase(); // 'suspend' | 'archive' | 'restore' | 'delete'
      const reason = String(body.reason || '').trim();

      if (!email || !email.includes('@')) {
        return jsonResponse({ ok: false, message: 'Vui lòng cung cấp email học viên hợp lệ.' }, 400);
      }
      if (!['suspend', 'archive', 'restore', 'delete'].includes(action)) {
        return jsonResponse({ ok: false, message: 'Thao tác không hợp lệ (chỉ hỗ trợ suspend, archive, restore, delete).' }, 400);
      }

      const stuLookup = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(email)}&select=*&limit=1`);
      const existingStu = (stuLookup.ok && Array.isArray(stuLookup.data) && stuLookup.data[0]) || null;
      const priorLifecycle = await getStudentLifecycleState(env, email).catch(() => null);

      const statusMap = {
        suspend: 'suspended',
        archive: 'archived',
        restore: 'active',
        delete: 'deleted'
      };
      const targetStatus = statusMap[action];

      if (action === 'delete') {
        if (body.confirmDelete !== true) {
          return jsonResponse({
            ok: false,
            error: 'DELETE_CONFIRMATION_REQUIRED',
            message: 'Vui lòng xác nhận rõ thao tác xóa vĩnh viễn tài khoản học viên (confirmDelete: true).'
          }, 400);
        }
        if (reason.length < 3) {
          return jsonResponse({
            ok: false,
            error: 'DELETE_REASON_REQUIRED',
            message: 'Vui lòng nhập lý do xóa tài khoản để lưu nhật ký kiểm toán (tối thiểu 3 ký tự).'
          }, 400);
        }

        const snapshot = existingStu || priorLifecycle?.snapshot || { email, name: body.name || email };
        const enrichedSnapshot = enrichStudentRowV3(snapshot);
        const cognitoUid = snapshot.cognito_user_id || snapshot.cognitoUserId || null;
        const hasCognitoAccount = isValidCognitoUuid(cognitoUid);

        // Kiểm tra dữ liệu lưu trữ bắt buộc (đơn hàng, thanh toán, lịch sử bài tập)
        const [ordersCheck, homeworksCheck] = await Promise.all([
          supabaseRequest(
            env,
            `ktn_orders?student_email=eq.${encodeURIComponent(email)}&select=id,order_id,payment_status,approval_status`
          ).catch(() => ({ ok: false, data: [] })),
          supabaseRequest(
            env,
            `ktn_homeworks?student_email=eq.${encodeURIComponent(email)}&select=id,status&limit=50`
          ).catch(() => ({ ok: false, data: [] }))
        ]);
        const orderRows = (ordersCheck && ordersCheck.ok && Array.isArray(ordersCheck.data)) ? ordersCheck.data : [];
        const paidOrders = orderRows.filter(
          o => o.payment_status === 'paid' || o.approval_status === 'approved' || o.status === 'paid' || o.status === 'approved'
        );
        const homeworkRows = (homeworksCheck && homeworksCheck.ok && Array.isArray(homeworksCheck.data)) ? homeworksCheck.data : [];

        if (
          (body.enforceRetentionGate === true || body.blockIfPaidOrders === true) &&
          (paidOrders.length > 0 || homeworkRows.length > 0) &&
          body.allowConditionalLocalDelete !== true
        ) {
          return jsonResponse({
            ok: false,
            error: 'RETENTION_POLICY_BLOCKED',
            retentionBlocked: true,
            paidOrderCount: paidOrders.length,
            totalOrderCount: orderRows.length,
            homeworkCount: homeworkRows.length,
            preservedOrders: true,
            preservedLearningHistory: true,
            recommendedAction: 'archive',
            message: `Học viên ${snapshot.name || email} đang có ${paidOrders.length} đơn hàng đã thanh toán/duyệt và ${homeworkRows.length} bản ghi lịch sử bài tập. Theo chính sách lưu trữ, vui lòng sử dụng thao tác "Lưu trữ (archive)" hoặc "Tạm khóa (suspend)" thay vì xóa cứng.`
          }, 409);
        }

        if (body.requireUpstreamHardDelete === true && hasCognitoAccount) {
          return jsonResponse({
            ok: false,
            error: 'UPSTREAM_COGNITO_DELETE_UNVERIFIED',
            upstreamVerified: false,
            cognitoDeleted: false,
            cognitoDisabled: false,
            izteachDeleted: false,
            izteachRevoked: false,
            recommendedAction: 'suspend',
            message: 'Hệ thống izTeach/Cognito hiện không hỗ trợ API xóa cứng tài khoản UserPool từ xa. Chưa thể xác minh xóa đa hệ thống; vui lòng dùng Tạm khóa (suspend) hoặc xóa có điều kiện trên Supabase.'
          }, 409);
        }

        // Nếu học viên đang có khóa học online và có Cognito UUID, thu hồi khóa học trên izTeach trước khi gỡ bản ghi hoạt động
        const currentOnlineCourseIds = Array.isArray(snapshot.online_courses)
          ? snapshot.online_courses.map(c => String(typeof c === 'string' ? c : (c?.id || '')).trim()).filter(Boolean)
          : [];
        let izteachRevokeRes = null;
        let izteachRevoked = false;
        if (currentOnlineCourseIds.length > 0 && hasCognitoAccount && body.skipUpstreamRevoke !== true) {
          izteachRevokeRes = await revokeStudentCoursesOnIzTeach(env, {
            email,
            cognitoUserId: cognitoUid,
            removeCourseIds: currentOnlineCourseIds
          }).catch(err => ({ ok: false, error: err?.message || 'IZTEACH_REVOKE_ERROR' }));

          if (!izteachRevokeRes || (!izteachRevokeRes.ok && !izteachRevokeRes.skipped)) {
            return jsonResponse({
              ok: false,
              retryable: true,
              error: 'UPSTREAM_IZTEACH_REVOKE_FAILED',
              upstreamVerified: false,
              cognitoDeleted: false,
              cognitoDisabled: false,
              izteachDeleted: false,
              izteachRevoked: false,
              izteachResult: izteachRevokeRes || null,
              message: `Chưa thu hồi được quyền khóa học của ${snapshot.name || email} trên izTeach trước khi xóa hồ sơ hoạt động (${izteachRevokeRes?.error || izteachRevokeRes?.reason || 'Lỗi upstream'}). Hồ sơ chưa bị xóa để tránh rò rỉ quyền học.`
            }, 502);
          }
          izteachRevoked = Boolean(izteachRevokeRes.ok && !izteachRevokeRes.skipped);
        }

        // Lưu trạng thái deleted bền vững trước để chặn hoàn toàn đăng nhập KTN và đồng bộ ngược từ izTeach
        await saveStudentLifecycleState(env, email, {
          status: 'deleted',
          reason,
          deletedAt: new Date().toISOString(),
          deletedBy: session.email,
          deletionScope: 'supabase_conditional_only',
          upstreamVerified: false,
          cognitoDeleted: false,
          cognitoDisabled: false,
          izteachDeleted: false,
          izteachRevoked,
          snapshot: {
            code: snapshot.code || null,
            email,
            name: snapshot.name || null,
            phone: snapshot.phone || null,
            parent_name: enrichedSnapshot?.parent_name || null,
            parent_phone: enrichedSnapshot?.parent_phone || null,
            class_code: snapshot.class_code || null,
            cognito_user_id: cognitoUid,
            izteach_student_id: snapshot.izteach_student_id || null,
            online_courses: snapshot.online_courses || []
          }
        }, session);

        // Xóa bản ghi hoạt động khỏi ktn_students nhưng giữ nguyên lịch sử đơn hàng ktn_orders & bài tập ktn_homeworks
        await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(email)}`, {
          method: 'DELETE',
          prefer: 'return=minimal'
        }).catch(() => null);

        await recordAdminAuditLog(env, {
          actorEmail: session.email,
          actorRole: 'admin',
          action: 'student_lifecycle_delete',
          targetType: 'student',
          targetId: email,
          reason,
          metadata: {
            studentCode: snapshot.code || null,
            studentName: snapshot.name || null,
            previousClassCode: snapshot.class_code || null,
            deletionScope: 'supabase_conditional_only',
            upstreamVerified: false,
            cognitoDeleted: false,
            cognitoDisabled: false,
            izteachDeleted: false,
            izteachRevoked,
            paidOrderCount: paidOrders.length,
            homeworkCount: homeworkRows.length,
            preservedOrders: true,
            preservedLearningHistory: true,
            reverseSyncBlocked: true
          }
        });

        return jsonResponse({
          ok: true,
          email,
          action: 'delete',
          status: 'deleted',
          deletionScope: 'supabase_conditional_only',
          upstreamVerified: false,
          cognitoDeleted: false,
          cognitoDisabled: false,
          izteachDeleted: false,
          izteachRevoked,
          reverseSyncBlocked: true,
          preservedOrders: true,
          preservedLearningHistory: true,
          paidOrderCount: paidOrders.length,
          homeworkCount: homeworkRows.length,
          message: `Đã gỡ hồ sơ ${snapshot.name || email} khỏi danh sách hoạt động Supabase và chặn đồng bộ ngược (chưa xóa cứng tài khoản gốc trên Cognito/izTeach; toàn bộ đơn hàng, thanh toán và lịch sử học tập vẫn được bảo toàn).`
        });
      }

      // Nếu khôi phục một học viên từng bị xóa hoặc lưu trữ, đảm bảo bản ghi tồn tại trong ktn_students
      let restoredStudent = existingStu;
      if (action === 'restore' && !existingStu && priorLifecycle?.snapshot) {
        const snap = priorLifecycle.snapshot;
        restoredStudent = await mergeAndUpsertStudentCourses(env, {
          email,
          name: snap.name || email.split('@')[0],
          phone: snap.phone || '',
          parentName: snap.parent_name || snap.parentName || undefined,
          parentPhone: snap.parent_phone || snap.parentPhone || undefined,
          classCode: snap.class_code || null,
          cognitoUserId: snap.cognito_user_id || null,
          izteachStudentId: snap.izteach_student_id || null,
          addCourseIds: Array.isArray(snap.online_courses)
            ? snap.online_courses.map(c => typeof c === 'string' ? c : c?.id).filter(Boolean)
            : [],
          accountStatus: 'active',
          syncStatus: 'synced',
          suppressClassJoinedNotification: true
        });
      } else if (existingStu) {
        const patchRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(email)}`, {
          method: 'PATCH',
          prefer: 'return=representation',
          body: {
            account_status: targetStatus,
            updated_at: new Date().toISOString()
          }
        }).catch(() => null);
        if (patchRes && patchRes.ok && Array.isArray(patchRes.data) && patchRes.data[0]) {
          restoredStudent = patchRes.data[0];
        }
      }

      const savedLife = await saveStudentLifecycleState(env, email, {
        status: targetStatus,
        reason: reason || `Admin chuyển trạng thái sang ${targetStatus}`,
        previousStatus: priorLifecycle?.status || existingStu?.account_status || 'active',
        snapshot: existingStu || priorLifecycle?.snapshot || { email }
      }, session);

      await recordAdminAuditLog(env, {
        actorEmail: session.email,
        actorRole: 'admin',
        action: `student_lifecycle_${action}`,
        targetType: 'student',
        targetId: email,
        reason: reason || `Chuyển trạng thái sang ${targetStatus}`,
        metadata: {
          status: targetStatus,
          previousStatus: priorLifecycle?.status || existingStu?.account_status || 'active'
        }
      });

      const statusLabels = {
        suspended: 'Tạm khóa tài khoản',
        archived: 'Lưu trữ học viên',
        active: 'Khôi phục hoạt động'
      };

      return jsonResponse({
        ok: true,
        email,
        action,
        status: targetStatus,
        lifecycle: savedLife.payload,
        student: restoredStudent ? enrichStudentRowV3({ ...restoredStudent, account_status: targetStatus }) : null,
        message: `Đã cập nhật trạng thái "${statusLabels[targetStatus] || targetStatus}" cho học viên ${existingStu?.name || email}.`
      });
    }

    if (path === '/api/ktn/admin/audit-logs' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || session.role !== 'admin') {
        return jsonResponse({ ok: false, message: 'Chỉ Quản lý (Admin) mới được xem nhật ký kiểm toán.' }, 403);
      }
      const res = await supabaseRequest(env, 'ktn_dlp_alerts?room_id=eq.ADMIN_AUDIT_LOG&order=created_at.desc&limit=100');
      const logs = [];
      if (res.ok && Array.isArray(res.data)) {
        for (const r of res.data) {
          try {
            logs.push(JSON.parse(r.blocked_content || '{}'));
          } catch {}
        }
      }
      return jsonResponse({ ok: true, logs });
    }

    if (path === '/flashcards' && (request.method === 'GET' || request.method === 'HEAD')) {
      return Response.redirect(`${url.origin}/flashcards/${url.search || ''}`, 301);
    }

    if (path.startsWith('/flashcards/') && (request.method === 'GET' || request.method === 'HEAD')) {
      let relPath = '';
      try {
        relPath = decodeURIComponent(path.slice('/flashcards/'.length)).replace(/^\/+/, '');
      } catch {
        return new Response('Bad Request', { status: 400 });
      }
      if (!relPath) relPath = 'index.html';
      if (relPath.includes('..')) {
        return new Response('Not Found', { status: 404 });
      }
      const lower = relPath.toLowerCase();
      const isVersionedV4Shell =
        lower === 'index.html' ||
        lower === 'sw.js' ||
        lower === 'assets/css/style.css' ||
        lower === 'assets/js/app.js';
      const isMutableShell =
        isVersionedV4Shell ||
        lower.endsWith('.html');
      const vendorId = String(env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID).trim();
      const encodedRel = relPath.split('/').map(seg => encodeURIComponent(seg)).join('/');
      const s3SubPrefix = isVersionedV4Shell ? 'flashcards/v4' : 'flashcards';
      const cdnTarget = `https://d21acfi38wn3iy.cloudfront.net/resource/documents/${vendorId}/${s3SubPrefix}/${encodedRel}`;
      const cdnRes = await fetch(cdnTarget, {
        method: request.method,
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!cdnRes.ok) {
        return new Response('Not Found', { status: cdnRes.status });
      }
      let contentType = cdnRes.headers.get('content-type') || 'application/octet-stream';
      if (lower.endsWith('.html')) contentType = 'text/html; charset=utf-8';
      else if (lower.endsWith('.css')) contentType = 'text/css; charset=utf-8';
      else if (lower.endsWith('.js') || lower.endsWith('.mjs')) contentType = 'application/javascript; charset=utf-8';
      else if (lower.endsWith('.json')) contentType = 'application/json; charset=utf-8';
      else if (lower.endsWith('.webp')) contentType = 'image/webp';
      else if (lower.endsWith('.png')) contentType = 'image/png';
      else if (lower.endsWith('.mp3')) contentType = 'audio/mpeg';
      else if (lower.endsWith('.svg')) contentType = 'image/svg+xml';

      const outHeaders = new Headers();
      outHeaders.set('Content-Type', contentType);
      outHeaders.set(
        'Cache-Control',
        isMutableShell ? 'no-cache, no-store, must-revalidate' : 'public, max-age=86400'
      );
      if (lower === 'sw.js') {
        outHeaders.set('Service-Worker-Allowed', '/flashcards/');
      }
      return new Response(request.method === 'HEAD' ? null : cdnRes.body, {
        status: 200,
        headers: outHeaders
      });
    }

    if (path.startsWith('/custom-page/so-lien-lac') && request.method === 'GET') {
      const originRes = await fetch(request);
      const cType = String(originRes.headers.get('content-type') || '').toLowerCase();
      if (cType.includes('text/html')) {
        let html = await originRes.text();
        const pwaHeadTags = html.includes('rel="manifest"')
          ? ''
          : `<link rel="manifest" href="/manifest.json"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="apple-mobile-web-app-title" content="Khổng Tử Nhí">`;
        const portalInitScript = `${pwaHeadTags}<script>(function(){window.__KTN_EMBED_MODE__=true;try{Storage.prototype.removeItem.call(localStorage,'ol-credentials-auth-user');Storage.prototype.removeItem.call(sessionStorage,'ol-credentials-auth-user');}catch(e){}})();</script>`;
        html = html.replace(/<head[^>]*>/i, '$&' + portalInitScript);
        const newHeaders = new Headers(originRes.headers);
        newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        return new Response(html, {
          status: originRes.status,
          headers: newHeaders
        });
      }
      return originRes;
    }

    return fetch(request);
  }
};
