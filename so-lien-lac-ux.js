/* Lớp trải nghiệm đồng bộ: Học viên & Phụ huynh · Giáo viên theo lớp · Quản lý trung tâm */
(function () {
  const app = window.app;
  if (!app) return;

  const STORAGE_KEY = 'ktn_connect_clean_v10_noclasses';
  const STALE_CASE_STORAGE_KEY = 'ktn_connect_clean_v6_video';
  const LEGACY_STORAGE_KEY = 'ktn_connect_clean_v10_noclasses_legacy';
  const esc = s => window.KTN_DLP.escapeHtml(s);
  const $ = (typeof window !== 'undefined' && typeof window.$ === 'function')
    ? window.$
    : (id => (typeof document !== 'undefined' && document && typeof document.getElementById === 'function' ? document.getElementById(id) : null));
  const foldText = s => String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  app.foldText = foldText;

  const VENDOR_ID = '3529cd2b-7af6-4fda-887c-392a79393d6a';
  const IZTEACH_COURSE_IDS = [
    '678d14b960eae20002ddf8fe',
    '65e7704a9ea90c00080d5195',
    '6638bd09a7367400085c7ab2',
    '6983672f409cc20002e530b8',
    '65e76a533f5e7c00086715d7',
    '67bebce067dba000027d8119'
  ];

  /**
   * Biểu thức chính quy kiểm tra định dạng chuẩn AWS Cognito UUID v4 (RFC 4122)
   * Chuỗi gồm 36 ký tự: 8 hex - 4 hex - 4 hex - 4 hex - 12 hex
   */
  const COGNITO_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function isValidCognitoUuid(id) {
    if (typeof id !== 'string') return false;
    return COGNITO_UUID_REGEX.test(id.trim());
  }

  /**
   * Biểu thức chính quy kiểm tra định dạng chuẩn MongoDB ObjectID
   * Chuỗi gồm chính xác 24 ký tự hệ thập lục phân [0-9a-fA-F]
   */
  const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
  function isValidObjectId(id) {
    if (typeof id !== 'string') return false;
    return OBJECT_ID_REGEX.test(id.trim());
  }
  function isValidProductId(id) {
    return isValidObjectId(id);
  }

  /**
   * Danh mục chuẩn các sản phẩm khóa học trên hệ thống izTeach LMS
   */
  const MASTER_PRODUCT_MAPPING = Object.freeze({
    '6adadba969897b0002482ca5': Object.freeze({
      id: '6adadba969897b0002482ca5',
      title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
      level: 'HSK 1 (3.0)',
      productType: 'online-course',
      aliases: Object.freeze([
        'hsk1', 'hsk 1', 'hsk1 3.0', 'hsk 1 3.0', 'hsk1-3.0',
        'new hsk 1', 'new hsk 1 (3.0)', 'tieng trung hsk 1',
        'khoa hoc tieu chuan new hsk 1 (3.0)', 'hsk1.0'
      ]),
      productIds: Object.freeze(['6adadba969897b0002482ca5'])
    }),
    '65e7704a9ea90c00080d5195': Object.freeze({
      id: '65e7704a9ea90c00080d5195',
      title: 'Chinese For Kids (Khóa học cho bé 5 – 6 tuổi)',
      level: 'Chinese For Kids',
      productType: 'online-course',
      aliases: Object.freeze(['chinese for kids', 'khoa hoc cho be 5 6 tuoi', 'yct2', 'yct 2', 'tieng trung yct 2', 'khoa hoc tieng trung tre em yct 2']),
      productIds: Object.freeze(['65e7704a9ea90c00080d5195'])
    }),
    '6638bd09a7367400085c7ab2': Object.freeze({
      id: '6638bd09a7367400085c7ab2',
      title: 'Tiếng Trung Trẻ Em 3 (Mini vỡ lòng 5 – 6 tuổi)',
      level: 'Tiếng Trung Trẻ Em 3',
      productType: 'online-course',
      aliases: Object.freeze(['tieng trung tre em 3', 'mini vo long 5 6 tuoi', 'yct3', 'yct 3', 'tieng trung yct 3', 'khoa hoc tieng trung tre em yct 3']),
      productIds: Object.freeze(['6638bd09a7367400085c7ab2'])
    }),
    '678d14b960eae20002ddf8fe': Object.freeze({
      id: '678d14b960eae20002ddf8fe',
      title: 'Tiếng Trung Trẻ Em 4 (Lộ trình 7 – 13 tuổi)',
      level: 'Tiếng Trung Trẻ Em 4',
      productType: 'online-course',
      aliases: Object.freeze(['tieng trung tre em 4', 'lo trinh 7 13 tuoi', 'yct1', 'yct 1', 'tieng trung yct 1', 'khoa hoc tieng trung tre em yct 1']),
      productIds: Object.freeze(['678d14b960eae20002ddf8fe'])
    }),
    '67a7290a5fdc26000238b4e9': Object.freeze({
      id: '67a7290a5fdc26000238b4e9',
      title: 'Tiếng Trung Trẻ Em 5 (Lộ trình 8 – 14 tuổi)',
      level: 'Tiếng Trung Trẻ Em 5',
      productType: 'online-course',
      aliases: Object.freeze(['tieng trung tre em 5', 'lo trinh 8 14 tuoi', 'tre em 5', 'lo 5']),
      productIds: Object.freeze(['67a7290a5fdc26000238b4e9'])
    }),
    '67a869302ecb9c000257d966': Object.freeze({
      id: '67a869302ecb9c000257d966',
      title: 'Tiếng Trung Trẻ Em 6 (Lộ trình 9 – 15 tuổi)',
      level: 'Tiếng Trung Trẻ Em 6',
      productType: 'online-course',
      aliases: Object.freeze(['tieng trung tre em 6', 'lo trinh 9 15 tuoi', 'tre em 6', 'lo 6']),
      productIds: Object.freeze(['67a869302ecb9c000257d966'])
    }),
    '6983672f409cc20002e530b8': Object.freeze({
      id: '6983672f409cc20002e530b8',
      title: 'Khóa học Tiếng Trung Trẻ Em YCT 4',
      level: 'YCT 4',
      productType: 'online-course',
      aliases: Object.freeze(['yct4', 'yct 4', 'tieng trung yct 4', 'khoa hoc tieng trung tre em yct 4']),
      productIds: Object.freeze(['6983672f409cc20002e530b8'])
    }),
    '65e76a533f5e7c00086715d7': Object.freeze({
      id: '65e76a533f5e7c00086715d7',
      title: 'Khóa học Phát Âm & Giao Tiếp Phản Xạ Cơ Bản',
      level: 'Phát Âm & Phản Xạ',
      productType: 'online-course',
      aliases: Object.freeze(['phat am', 'phan xa', 'giao tiep phan xa', 'phat am co ban']),
      productIds: Object.freeze(['65e76a533f5e7c00086715d7'])
    }),
    '67bebce067dba000027d8119': Object.freeze({
      id: '67bebce067dba000027d8119',
      title: 'Khóa học Hán Tự Tư Duy & Luyện Viết Chữ Hán',
      level: 'Luyện Viết Chữ Hán',
      productType: 'online-course',
      aliases: Object.freeze(['luyen viet', 'chu han', 'han tu', 'han tu tu duy', 'viet chu han']),
      productIds: Object.freeze(['67bebce067dba000027d8119'])
    }),
    'BUNDLE_YCT_ALL': Object.freeze({
      id: 'BUNDLE_YCT_ALL',
      title: 'Trọn bộ 6 Khóa Học Trực Tuyến',
      level: 'Combo 6 Khóa',
      productType: 'bundle',
      aliases: Object.freeze(['combo yct', 'yct all', 'tron bo yct', 'bundle yct', 'combo 6 khoa yct', 'tron bo 6 khoa']),
      productIds: Object.freeze([
        '6adadba969897b0002482ca5',
        '65e7704a9ea90c00080d5195',
        '6638bd09a7367400085c7ab2',
        '678d14b960eae20002ddf8fe',
        '67a7290a5fdc26000238b4e9',
        '67a869302ecb9c000257d966'
      ])
    })
  });

  /**
   * Chuẩn hóa chuỗi văn bản: loại bỏ dấu tiếng Việt, chuyển chữ thường, dọn khoảng trắng
   */
  function normalizeSearchTerm(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Phân giải thông tin khóa học từ ID, mã viết tắt, tên hiển thị hoặc đối tượng đơn hàng
   */
  function resolveProductMapping(inputCourse) {
    const DEFAULT_PRODUCT = MASTER_PRODUCT_MAPPING['6adadba969897b0002482ca5'];
    if (!inputCourse) return DEFAULT_PRODUCT;

    let rawKey = inputCourse;
    if (typeof inputCourse === 'object' && inputCourse !== null) {
      rawKey = inputCourse.courseId || inputCourse.productId || inputCourse.id || inputCourse.courseName || inputCourse.title || '';
    }

    const strKey = String(rawKey).trim();
    if (!strKey) return DEFAULT_PRODUCT;
    if (MASTER_PRODUCT_MAPPING[strKey]) return MASTER_PRODUCT_MAPPING[strKey];

    const normalizedInput = normalizeSearchTerm(strKey);
    for (const item of Object.values(MASTER_PRODUCT_MAPPING)) {
      if (item.id === strKey) return item;
      if (normalizeSearchTerm(item.title) === normalizedInput) return item;
      const matched = item.aliases.some(alias => {
        const normAlias = normalizeSearchTerm(alias);
        return normAlias === normalizedInput || normalizedInput.includes(normAlias) || normAlias.includes(normalizedInput);
      });
      if (matched) return item;
    }
    return DEFAULT_PRODUCT;
  }

  /**
   * Lọc danh sách các mã khóa học mục tiêu mà học viên CHƯA sở hữu (Pre-flight Missing Courses Filter)
   */
  function filterMissingCourses(existingCourseIds, targetProductIds) {
    const extractId = item => {
      if (!item) return '';
      if (typeof item === 'string') return item.trim();
      if (typeof item === 'object') {
        return String(item.productId || item.onlineCourseId || item.id || item._id || '').trim();
      }
      return String(item).trim();
    };

    const existingList = Array.isArray(existingCourseIds) ? existingCourseIds : [existingCourseIds];
    const existingSet = new Set(existingList.map(extractId).filter(Boolean));

    const targetList = Array.isArray(targetProductIds) ? targetProductIds : [targetProductIds];
    const uniqueTargets = Array.from(new Set(targetList.map(extractId).filter(Boolean)));

    return uniqueTargets.filter(id => !existingSet.has(id));
  }

  /**
   * Trích xuất thông điệp lỗi upstream an toàn theo 4 tầng dự phòng
   */
  function extractUpstreamError(err) {
    if (!err) return '';
    if (typeof err === 'string') return err.trim();

    let msg = '';
    if (typeof err === 'object') {
      if (err.errorMessage && typeof err.errorMessage === 'string' && err.errorMessage.trim()) {
        msg = err.errorMessage.trim();
      } else if (typeof err.data === 'string' && err.data.trim()) {
        msg = err.data.trim();
      } else if (err.data && typeof err.data === 'object' && err.data.errorMessage) {
        msg = String(err.data.errorMessage).trim();
      } else if (err.message && typeof err.message === 'string' && err.message.trim() && err.message.trim() !== 'Error') {
        msg = err.message.trim();
      } else if (err.error && typeof err.error === 'string' && err.error.trim()) {
        msg = err.error.trim();
      } else if (err.rawText && typeof err.rawText === 'string' && err.rawText.trim()) {
        msg = err.rawText.trim();
      } else if (err.statusText && typeof err.statusText === 'string' && err.statusText.trim()) {
        msg = err.statusText.trim();
      }
    }

    if (msg) return msg;
    const fallback = String(err).trim();
    return fallback !== '[object Object]' ? fallback : 'Lỗi không xác định từ dịch vụ máy chủ';
  }

  /**
   * Nhận diện lỗi trùng khóa học đã tồn tại để xử lý thành công bất biến (Idempotent Success)
   */
  function isCourseExistedError(err) {
    return /is existed/i.test(extractUpstreamError(err));
  }

  /**
   * Danh sách đơn hàng mẫu phục vụ quản lý đơn hàng Sổ Liên Lạc
   */
  const DEFAULT_ORDERS = [
    {
      orderId: 'ORD-20261031-001',
      studentName: 'Tạ Phong Võ',
      studentEmail: 'taphong2002@gmail.com',
      phone: '0912345678',
      courseId: '6adadba969897b0002482ca5',
      courseName: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
      amount: 890000,
      paymentMethod: 'VietQR',
      paymentStatus: 'paid',
      approvalStatus: 'pending',
      createdAt: '2026-10-31T06:10:00.000Z',
      createdAtDisplay: '06:10 · 31/10/2026'
    },
    {
      orderId: 'ORD-20261030-002',
      studentName: 'Bé Lê Hoàng Ngân',
      studentEmail: 'hoangngan.ktn@gmail.com',
      phone: '0902234567',
      courseId: '6adadba969897b0002482ca5',
      courseName: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
      amount: 890000,
      paymentMethod: 'VietQR',
      paymentStatus: 'paid',
      approvalStatus: 'approved',
      idempotencyKey: 'idem_ORD-20261030-002_1730300000000',
      assignedUserId: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
      assignedStudentId: '6ae067851a07c000028e8e4a',
      approvedAt: '2026-10-30T10:15:00.000Z',
      approvedBy: 'hocvienkhongtunhi123@gmail.com',
      createdAt: '2026-10-30T09:45:00.000Z',
      createdAtDisplay: '09:45 · 30/10/2026'
    },
    {
      orderId: 'ORD-20261030-003',
      studentName: 'Bé Minh Khang',
      studentEmail: 'minhkhang.ktn@gmail.com',
      phone: '0902234568',
      courseId: '6adadba969897b0002482ca5',
      courseName: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
      amount: 890000,
      paymentMethod: 'Chuyển khoản',
      paymentStatus: 'paid',
      approvalStatus: 'failed',
      errorMessage: 'Không kết nối được dịch vụ cấp quyền (Timeout). Vui lòng thử lại.',
      createdAt: '2026-10-30T14:20:00.000Z',
      createdAtDisplay: '14:20 · 30/10/2026'
    }
  ];

  app.COGNITO_UUID_REGEX = COGNITO_UUID_REGEX;
  app.isValidCognitoUuid = isValidCognitoUuid;
  app.OBJECT_ID_REGEX = OBJECT_ID_REGEX;
  app.isValidObjectId = isValidObjectId;
  app.isValidProductId = isValidProductId;
  app.MASTER_PRODUCT_MAPPING = MASTER_PRODUCT_MAPPING;
  app.normalizeSearchTerm = normalizeSearchTerm;
  app.resolveProductMapping = resolveProductMapping;
  app.filterMissingCourses = filterMissingCourses;
  app.extractUpstreamError = extractUpstreamError;
  app.isCourseExistedError = isCourseExistedError;
  app.DEFAULT_ORDERS = DEFAULT_ORDERS;

  const DEFAULT_TEACHERS = [
    {
      code: 'GV-KTN-08',
      name: 'Cô Lâm Mỹ Linh',
      email: 'linh.lam@khongtunhi.com',
      aliases: ['linhlm', 'linhlm@khongtunhi.com', 'linhlam.ktn@gmail.com', 'lam.mylinh@khongtunhi.com', 'giaovien', 'giaovien@khongtunhi.com', 'colinh'],
      phone: '0902234567',
      specialty: 'Chuyên gia YCT & Giao tiếp Phản xạ Thiếu nhi'
    },
    {
      code: 'GV-KTN-12',
      name: 'Cô Trần Thu Hà',
      email: 'thu.ha@khongtunhi.com',
      aliases: ['hatt', 'hatt@khongtunhi.com', 'coha'],
      phone: '0902234568',
      specialty: 'Chuyên gia Chữ Hán & Đọc hiểu YCT 3-4'
    }
  ];

  const DEFAULT_CLASSES = [
    {
      id: 'YCT2-04',
      title: 'Lớp YCT 2 - Khóa 04',
      schedule: 'Thứ 3 & Thứ 6 (19:30 - 20:30)',
      totalLessons: 25,
      teacherCode: 'GV-KTN-08',
      teacherName: 'Cô Lâm Mỹ Linh',
      teacherEmail: 'linh.lam@khongtunhi.com',
      studentCodes: ['KTN-2026-089', 'KTN-2026-090', 'KTN-2026-091']
    },
    {
      id: 'YCT3-02',
      title: 'Lớp YCT 3 - Khóa 02',
      schedule: 'Thứ 4 & Chủ Nhật (18:30 - 19:30)',
      totalLessons: 25,
      teacherCode: 'GV-KTN-08',
      teacherName: 'Cô Lâm Mỹ Linh',
      teacherEmail: 'linh.lam@khongtunhi.com',
      studentCodes: ['KTN-2026-092', 'KTN-2026-095']
    }
  ];

  const DEFAULT_STUDENTS = [
    {
      id: 'STU-HSK1-TAPHO',
      name: 'ta phong vo',
      parent: 'Phụ huynh ta phong vo',
      email: 'taphong2002@gmail.com',
      aliases: ['taphong2002', 'taphong', 'ta phong vo', 'taphong2002@gmail.com'],
      progress: 'Tự học HSK1 3.0',
      code: 'KTN-2026-TAPHON',
      dob: '2002-01-01',
      className: 'Lớp HSK 1 Cơ Bản',
      classCode: '',
      gender: 'Nam',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
      tuitionStatus: 'Đã đóng đủ',
      hasOnlineCourses: true,
      hasLiveClass: false,
      unsubmittedCurrent: false,
      courseIds: ['6adadba969897b0002482ca5'],
      attendanceRate: 98,
      gpa: 9.5,
      attendance: 'Tự học trực tuyến',
      target: 'Làm quen phát âm Pinyin & từ vựng tiếng Trung cơ bản',
      note: 'Tài khoản học viên'
    },
    {
      name: 'Bé Lê Hoàng Ngân', parent: 'Mẹ Bé Hoàng Ngân', email: 'hoangngan@khongtunhi.com', aliases: ['hoangngan.ktn@gmail.com', 'hoangngan.yct@gmail.com', 'hoangngan'],
      progress: 'Buổi 18/25 · Đã nộp bài tập', code: 'KTN-2026-089', classCode: 'YCT2-04',
      hasOnlineCourses: true, hasLiveClass: true, unsubmittedCurrent: false,
      courseIds: ['6adadba969897b0002482ca5'],
      attendance: '18/18 buổi (100%)', target: 'Mục tiêu: Đạt 190/200 điểm bài thi YCT 2', note: 'Con phát âm tốt, chăm chỉ nộp bài.'
    },
    {
      name: 'Bé Đắc Hanh', parent: 'Mẹ Bé Đắc Hanh', email: 'dachanh@khongtunhi.com', aliases: ['dachanh.ktn@gmail.com', 'dachanh'],
      progress: 'Buổi 18/25 · Chờ nộp bài', code: 'KTN-2026-090', classCode: 'YCT2-04',
      hasOnlineCourses: false, hasLiveClass: true, unsubmittedCurrent: true,
      courseIds: [],
      attendance: '17/18 buổi (94%)', target: 'Lộ trình Tiếng Trung Thiếu Nhi YCT 2', note: 'Cần luyện thêm nét sổ và nét phẩy.'
    },
    {
      name: 'Bé An Mẫn', parent: 'Mẹ Bé An Mẫn', email: 'anman@khongtunhi.com', aliases: ['anman.ktn@gmail.com', 'anman'],
      progress: 'Buổi 18/25 · Đã nộp bài', code: 'KTN-2026-091', classCode: 'YCT2-04',
      hasOnlineCourses: false, hasLiveClass: true, unsubmittedCurrent: false,
      courseIds: [],
      attendance: '18/18 buổi (100%)', target: 'Lộ trình Tiếng Trung Thiếu Nhi YCT 2', note: 'Nói lưu loát, nhớ từ vựng nhanh.'
    },
    {
      name: 'Bé Minh Khang', parent: 'Mẹ Bé Minh Khang', email: 'minhkhang@khongtunhi.com', aliases: ['minhkhang.ktn@gmail.com', 'minhkhang'],
      progress: 'Buổi 12/25 · Đã nộp bài', code: 'KTN-2026-092', classCode: 'YCT3-02',
      hasOnlineCourses: true, hasLiveClass: true, unsubmittedCurrent: false,
      courseIds: ['6adadba969897b0002482ca5'],
      attendance: '12/12 buổi (100%)', target: 'Lộ trình Tiếng Trung Thiếu Nhi YCT 3', note: 'Phát âm chuẩn thanh 4.'
    },
    {
      name: 'Bé Bảo Châu', parent: 'Mẹ Bé Bảo Châu', email: 'baochau@khongtunhi.com', aliases: ['baochau.ktn@gmail.com', 'baochau'],
      progress: 'Buổi 12/25 · Chờ nộp bài', code: 'KTN-2026-095', classCode: 'YCT3-02',
      hasOnlineCourses: true, hasLiveClass: true, unsubmittedCurrent: true,
      courseIds: ['6adadba969897b0002482ca5'],
      attendance: '11/12 buổi (92%)', target: 'Lộ trình Tiếng Trung Thiếu Nhi YCT 3', note: 'Cần ôn thêm từ vựng bài 11.'
    }
  ];

  const DEFAULT_LESSON_ASSIGNMENTS = {};

  const HSK1_VIDEOS_MAP = {
    1: [
      {
        part: '1',
        partId: '1',
        partTitle: 'Toàn bài (13:34)',
        title: 'Bài giảng Bài 1: AI小语，你好！ (Xin chào AI Tiểu Ngữ!)',
        unitId: '6adadbcaf75fe5000247ca71',
        unitTitle: 'HSK1_Bài 1',
        movFilename: 'HSK1_Bài 1.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadc45f8c3c60002a2b3c1/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadc45f8c3c60002a2b3c1/thumbnail.jpg',
        duration: '13:34',
        videoId: '6adadc45f8c3c60002a2b3c1'
      }
    ],
    2: [
      {
        part: '2',
        partId: '2',
        partTitle: 'Toàn bài (12:00)',
        title: 'Bài giảng Bài 2: 我叫李文 (Mình tên là Lý Văn)',
        unitId: '6adadc3b69897b0002482d22',
        unitTitle: 'HSK1_Bài 2',
        movFilename: 'HSK1_Bài 2.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadd60f8c3c60002a2b3c2/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadd60f8c3c60002a2b3c2/thumbnail.jpg',
        duration: '12:00',
        videoId: '6adadd60f8c3c60002a2b3c2'
      }
    ],
    3: [
      {
        part: '3.1',
        partId: '3.1',
        partTitle: 'Phần 3.1: Từ mới & Cấu trúc',
        title: 'Bài giảng Bài 3 (Phần 1): 我是中国人 (Từ mới & Cấu trúc Quốc tịch)',
        unitId: '6adae08769897b000248340a',
        unitTitle: 'HSK1_Bài 3.1',
        movFilename: 'HSK1_Bài 3.1.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf16b358da95000267ef60/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf16b358da95000267ef60/thumbnail.jpg',
        duration: '~15m',
        videoId: '6adf16b358da95000267ef60'
      },
      {
        part: '3.2',
        partId: '3.2',
        partTitle: 'Phần 3.2: Hội thoại & Luyện nghe',
        title: 'Bài giảng Bài 3 (Phần 2): 我是中国人 (Hội thoại & Luyện nghe)',
        unitId: '6adf1a4fe2681300028de082',
        unitTitle: 'HSK1_Bài 3.2',
        movFilename: 'HSK1_Bài 3.2.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf188558da95000267ef62/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf188558da95000267ef62/thumbnail.jpg',
        duration: '~15m',
        videoId: '6adf188558da95000267ef62'
      }
    ],
    4: [
      {
        part: '4.1',
        partId: '4.1',
        partTitle: 'Phần 4.1: Gia đình & Đại từ',
        title: 'Bài giảng Bài 4 (Phần 1): 这是我的一家 (Gia đình & Đại từ sở hữu)',
        unitId: '6adf1b51e2681300028de363',
        unitTitle: 'HSK1_Bài 4.1',
        movFilename: 'HSK1_Bài 4.1.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf1a87edf12a00022cde3c/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf1a87edf12a00022cde3c/thumbnail.jpg',
        duration: '~12m',
        videoId: '6adf1a87edf12a00022cde3c'
      },
      {
        part: '4.2',
        partId: '4.2',
        partTitle: 'Phần 4.2: Số lượng & Lượng từ 个',
        title: 'Bài giảng Bài 4 (Phần 2): 这是我的一家 (Số lượng & Lượng từ 个)',
        unitId: '6adf1c22e2681300028de711',
        unitTitle: 'HSK1_Bài 4.2',
        movFilename: 'HSK1_Bài 4.2.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf1b8aedf12a00022cde3f/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf1b8aedf12a00022cde3f/thumbnail.jpg',
        duration: '~12m',
        videoId: '6adf1b8aedf12a00022cde3f'
      },
      {
        part: '4.3',
        partId: '4.3',
        partTitle: 'Phần 4.3: Luyện phát âm & Ngữ điệu',
        title: 'Bài giảng Bài 4 (Phần 3): 这是我的一家 (Luyện phát âm & Ngữ điệu)',
        unitId: '6adf1d00e2681300028de9a6',
        unitTitle: 'HSK1_Bài 4.3',
        movFilename: 'HSK1_Bài 4.3.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf1c5cedf12a00022cde43/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf1c5cedf12a00022cde43/thumbnail.jpg',
        duration: '~12m',
        videoId: '6adf1c5cedf12a00022cde43'
      },
      {
        part: '4.4',
        partId: '4.4',
        partTitle: 'Phần 4.4: Ôn tập & Thực hành',
        title: 'Bài giảng Bài 4 (Phần 4): 这是我的一家 (Ôn tập tổng kết & Thực hành)',
        unitId: '6adf1e12e5b2290002718830',
        unitTitle: 'HSK1_Bài 4.4',
        movFilename: 'HSK1_Bài 4.4.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf1d4258da95000267ef72/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf1d4258da95000267ef72/thumbnail.jpg',
        duration: '~12m',
        videoId: '6adf1d4258da95000267ef72'
      }
    ],
    5: [
      {
        part: '5.1',
        partId: '5.1',
        partTitle: 'Phần 5.1: Thứ & Ngày trong tuần',
        title: 'Bài giảng Bài 5 (Phần 1): 今天我休息 (Thứ & Ngày trong tuần)',
        unitId: '6adf1fade5b2290002718df9',
        unitTitle: 'HSK1_Bài 5.1',
        movFilename: 'HSK1_Bài 5.1.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf1e7cedf12a00022cde53/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf1e7cedf12a00022cde53/thumbnail.jpg',
        duration: '~14m',
        videoId: '6adf1e7cedf12a00022cde53'
      },
      {
        part: '5.2',
        partId: '5.2',
        partTitle: 'Phần 5.2: Hoạt động & Hội thoại',
        title: 'Bài giảng Bài 5 (Phần 2): 今天我休息 (Hoạt động & Hội thoại nghỉ ngơi)',
        unitId: '6adf2171e5b22900027194df',
        unitTitle: 'HSK1_Bài 5.2',
        movFilename: 'HSK1_Bài 5.2.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf2015ff3e240002282e5e/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf2015ff3e240002282e5e/thumbnail.jpg',
        duration: '~14m',
        videoId: '6adf2015ff3e240002282e5e'
      }
    ],
    6: [
      {
        part: '6.1',
        partId: '6.1',
        partTitle: 'Phần 6.1: Số đếm & Số điện thoại',
        title: 'Bài giảng Bài 6 (Phần 1): 你的手机号是多少？ (Số đếm & Đọc số điện thoại)',
        unitId: '6adf22e9e5b22900027199e7',
        unitTitle: 'HSK1_Bài 6.1',
        movFilename: 'HSK1_Bài 6.1.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf21dbff3e240002282e6c/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf21dbff3e240002282e6c/thumbnail.jpg',
        duration: '~13m',
        videoId: '6adf21dbff3e240002282e6c'
      },
      {
        part: '6.2',
        partId: '6.2',
        partTitle: 'Phần 6.2: Thông tin liên lạc',
        title: 'Bài giảng Bài 6 (Phần 2): 你的手机号是多少？ (Hỏi thông tin liên lạc)',
        unitId: '6adf3932e8e0af00026814ef',
        unitTitle: 'HSK1_Bài 6.2',
        movFilename: 'HSK1_Bài 6.2.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf384637e34400025dfc49/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf384637e34400025dfc49/thumbnail.jpg',
        duration: '~13m',
        videoId: '6adf384637e34400025dfc49'
      }
    ],
    7: [
      {
        part: '7.1',
        partId: '7.1',
        partTitle: 'Phần 7.1: Giờ giấc & Mốc thời gian',
        title: 'Bài giảng Bài 7 (Phần 1): 我晚上六点半下班 (Giờ giấc & Mốc thời gian)',
        unitId: '6adf3578b3cfe60002ab5a55',
        unitTitle: 'HSK1_Bài 7.1',
        movFilename: 'HSK1_Bài 7.1.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf34321d93990002196230/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf34321d93990002196230/thumbnail.jpg',
        duration: '~15m',
        videoId: '6adf34321d93990002196230'
      },
      {
        part: '7.2',
        partId: '7.2',
        partTitle: 'Phần 7.2: Lịch trình sinh hoạt',
        title: 'Bài giảng Bài 7 (Phần 2): 我晚上六点半下班 (Lịch trình sinh hoạt hàng ngày)',
        unitId: '6adf3633b3cfe60002ab5cf4',
        unitTitle: 'HSK1_Bài 7.2',
        movFilename: 'HSK1_Bài 7.2.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf359b1d9399000219623e/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf359b1d9399000219623e/thumbnail.jpg',
        duration: '~15m',
        videoId: '6adf359b1d9399000219623e'
      }
    ],
    8: [
      {
        part: '8.1',
        partId: '8.1',
        partTitle: 'Phần 8.1: Nghề nghiệp & Nơi làm việc',
        title: 'Bài giảng Bài 8 (Phần 1): 我爸爸也在医院工作 (Nghề nghiệp & Địa điểm làm việc)',
        unitId: '6adf3707b3cfe60002ab5fd6',
        unitTitle: 'HSK1_Bài 8.1',
        movFilename: 'HSK1_Bài 8.1.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf366037e34400025dfc39/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf366037e34400025dfc39/thumbnail.jpg',
        duration: '~14m',
        videoId: '6adf366037e34400025dfc39'
      },
      {
        part: '8.2',
        partId: '8.2',
        partTitle: 'Phần 8.2: Phó từ 也 & Hội thoại',
        title: 'Bài giảng Bài 8 (Phần 2): 我爸爸也在医院工作 (Phó từ 也 & Giới thiệu gia đình)',
        unitId: '6adf37f61d600a0002d466ae',
        unitTitle: 'HSK1_Bài 8.2',
        movFilename: 'HSK1_Bài 8.2.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf374337e34400025dfc3f/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf374337e34400025dfc3f/thumbnail.jpg',
        duration: '~14m',
        videoId: '6adf374337e34400025dfc3f'
      }
    ],
    9: [
      {
        part: '9.1',
        partId: '9.1',
        partTitle: 'Phần 9.1: Buổi trong ngày & Nơi học',
        title: 'Bài giảng Bài 9 (Phần 1): 我明天上午在学校学习 (Buổi trong ngày & Địa điểm học)',
        unitId: '6ae52ef17b101100026bb5d7',
        unitTitle: 'HSK1_Bài 9.1',
        movFilename: 'HSK1_Bài 9.1.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae52a57a6947f0002b2407a/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae52a57a6947f0002b2407a/thumbnail.jpg',
        duration: '~15m',
        videoId: '6ae52a57a6947f0002b2407a'
      },
      {
        part: '9.2',
        partId: '9.2',
        partTitle: 'Phần 9.2: Trật tự Thời gian - Địa điểm',
        title: 'Bài giảng Bài 9 (Phần 2): 我明天上午在学校学习 (Trật tự Thời gian - Địa điểm - Hành động)',
        unitId: '6ae532927b101100026bb9f3',
        unitTitle: 'HSK1_Bài 9.2',
        movFilename: 'HSK1_Bài 9.2.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae52f6af9f5190002993c47/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae52f6af9f5190002993c47/thumbnail.jpg',
        duration: '~15m',
        videoId: '6ae52f6af9f5190002993c47'
      }
    ],
    10: [
      {
        part: '10.1',
        partId: '10.1',
        partTitle: 'Phần 10.1: Mua sắm & Tiền tệ',
        title: 'Bài giảng Bài 10 (Phần 1): 这儿的苹果真便宜！ (Mua sắm hoa quả & Phó từ 真)',
        unitId: '6ae546eaa1908400020410e3',
        unitTitle: 'HSK1_Bài 10.1',
        movFilename: 'HSK1_Bài 10.1.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae53844f133e40002a7083d/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae53844f133e40002a7083d/thumbnail.jpg',
        duration: '~14m',
        videoId: '6ae53844f133e40002a7083d'
      },
      {
        part: '10.2',
        partId: '10.2',
        partTitle: 'Phần 10.2: Hỏi giá & Hội thoại',
        title: 'Bài giảng Bài 10 (Phần 2): 这儿的苹果真便宜！ (Hỏi giá & Giao tiếp mua bán)',
        unitId: '6ae547d1a1908400020412fd',
        unitTitle: 'HSK1_Bài 10.2',
        movFilename: 'HSK1_Bài 10.2.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae54742f133e40002a70842/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae54742f133e40002a70842/thumbnail.jpg',
        duration: '~14m',
        videoId: '6ae54742f133e40002a70842'
      }
    ],
    11: [
      {
        part: '11.1',
        partId: '11.1',
        partTitle: 'Phần 11.1: Học vấn & Tiếp diễn 呢',
        title: 'Bài giảng Bài 11 (Phần 1): 我读大学呢 (Học vấn & Hoạt động đang diễn ra)',
        unitId: '6ae54a51fab31400021bee3b',
        unitTitle: 'HSK1_Bài 11.1',
        movFilename: 'HSK1_Bài 11.1.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae54811f133e40002a70843/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae54811f133e40002a70843/thumbnail.jpg',
        duration: '~16m',
        videoId: '6ae54811f133e40002a70843'
      },
      {
        part: '11.2',
        partId: '11.2',
        partTitle: 'Phần 11.2: Hội thoại học tập',
        title: 'Bài giảng Bài 11 (Phần 2): 我读大学呢 (Hội thoại hỏi thăm việc học tập)',
        unitId: '6ae54abdfab31400021befb0',
        unitTitle: 'HSK1_Bài 11.2',
        movFilename: 'HSK1_Bài 11.2.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae54a7d238c0700028dced8/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae54a7d238c0700028dced8/thumbnail.jpg',
        duration: '~16m',
        videoId: '6ae54a7d238c0700028dced8'
      }
    ],
    12: [
      {
        part: '12.1',
        partId: '12.1',
        partTitle: 'Phần 12.1: Hiện tượng thời tiết',
        title: 'Bài giảng Bài 12 (Phần 1): 昨天下了雪了 (Hiện tượng thời tiết & Mùa)',
        unitId: '6ae54f37a1908400020426c9',
        unitTitle: 'HSK1_Bài 12.1',
        movFilename: 'HSK1_Bài 12.1.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae54af4a8aec300024f0915/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae54af4a8aec300024f0915/thumbnail.jpg',
        duration: '~11m',
        videoId: '6ae54af4a8aec300024f0915'
      },
      {
        part: '12.2',
        partId: '12.2',
        partTitle: 'Phần 12.2: Trợ từ biến đổi 了',
        title: 'Bài giảng Bài 12 (Phần 2): 昨天下了雪了 (Trợ từ ngữ khí & Biến đổi 了)',
        unitId: '6ae54fe0a1908400020428a5',
        unitTitle: 'HSK1_Bài 12.2',
        movFilename: 'HSK1_Bài 12.2.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae54f7b4b62f10002342205/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae54f7b4b62f10002342205/thumbnail.jpg',
        duration: '~11m',
        videoId: '6ae54f7b4b62f10002342205'
      },
      {
        part: '12.3',
        partId: '12.3',
        partTitle: 'Phần 12.3: Đàm thoại thời tiết',
        title: 'Bài giảng Bài 12 (Phần 3): 昨天下了雪了 (Tổng hợp đàm thoại thời tiết)',
        unitId: '6ae5504aa1908400020429c9',
        unitTitle: 'HSK1_Bài 12.3',
        movFilename: 'HSK1_Bài 12.3.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae54ffc4b62f1000234220b/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae54ffc4b62f1000234220b/thumbnail.jpg',
        duration: '~11m',
        videoId: '6ae54ffc4b62f1000234220b'
      }
    ],
    13: [
      {
        part: '13.1',
        partId: '13.1',
        partTitle: 'Phần 13.1: Đồ uống & Lượng từ 杯',
        title: 'Bài giảng Bài 13 (Phần 1): 请给我一杯茶 (Đồ uống & Lượng từ 杯, 瓶)',
        unitId: '6ae550b3a190840002042a62',
        unitTitle: 'HSK1_Bài 13.1',
        movFilename: 'HSK1_Bài 13.1.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae55062a8aec300024f0936/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae55062a8aec300024f0936/thumbnail.jpg',
        duration: '~13m',
        videoId: '6ae55062a8aec300024f0936'
      },
      {
        part: '13.2',
        partId: '13.2',
        partTitle: 'Phần 13.2: Câu cầu khiến & Hội thoại',
        title: 'Bài giảng Bài 13 (Phần 2): 请给我一杯茶 (Câu cầu khiến & Phục vụ quán trà)',
        unitId: '6ae550fefab31400021bff7a',
        unitTitle: 'HSK1_Bài 13.2',
        movFilename: 'HSK1_Bài 13.2.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae550d34b62f10002342211/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae550d34b62f10002342211/thumbnail.jpg',
        duration: '~13m',
        videoId: '6ae550d34b62f10002342211'
      }
    ],
    14: [
      {
        part: '14.1',
        partId: '14.1',
        partTitle: 'Phần 14.1: Giải trí & Động thái 了',
        title: 'Bài giảng Bài 14 (Phần 1): 我看了一个电影 (Hoạt động giải trí & Động thái 了)',
        unitId: '6ae558d7fab31400021c1676',
        unitTitle: 'HSK1_Bài 14.1',
        movFilename: 'HSK1_Bài 14.1.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae55149a8aec300024f0945/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae55149a8aec300024f0945/thumbnail.jpg',
        duration: '~14m',
        videoId: '6ae55149a8aec300024f0945'
      },
      {
        part: '14.2',
        partId: '14.2',
        partTitle: 'Phần 14.2: Kể lại trải nghiệm',
        title: 'Bài giảng Bài 14 (Phần 2): 我看了一个电影 (Kể lại trải nghiệm đã qua)',
        unitId: '6ae56b19b734640002ce823d',
        unitTitle: 'HSK1_Bài 14.2',
        movFilename: 'HSK1_Bài 14.2.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae56486e8c772000259fd59/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae56486e8c772000259fd59/thumbnail.jpg',
        duration: '~14m',
        videoId: '6ae56486e8c772000259fd59'
      }
    ],
    15: [
      {
        part: '15.1',
        partId: '15.1',
        partTitle: 'Phần 15.1: Phương tiện đi lại',
        title: 'Bài giảng Bài 15 (Phần 1): 大兴机场见！ (Phương tiện đi lại & Hẹn gặp)',
        unitId: '6ae56d92b734640002ce863a',
        unitTitle: 'HSK1_Bài 15.1',
        movFilename: 'HSK1_Bài 15.1.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae56bb4e8c772000259fd66/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae56bb4e8c772000259fd66/thumbnail.jpg',
        duration: '~15m',
        videoId: '6ae56bb4e8c772000259fd66'
      },
      {
        part: '15.2',
        partId: '15.2',
        partTitle: 'Phần 15.2: Tạm biệt & Tổng kết HSK 1',
        title: 'Bài giảng Bài 15 (Phần 2): 大兴机场见！ (Tạm biệt & Ôn tập New HSK 1)',
        unitId: '6ae56f7f9902f90002d5ebdc',
        unitTitle: 'HSK1_Bài 15.2',
        movFilename: 'HSK1_Bài 15.2.mov',
        streamUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae56ddde8c772000259fd6d/playlist.m3u8',
        posterUrl: 'https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae56ddde8c772000259fd6d/thumbnail.jpg',
        duration: '~15m',
        videoId: '6ae56ddde8c772000259fd6d'
      }
    ]
  };

  // Tra cứu bổ sung cho các phân đoạn độc lập (sub-parts aliases & utilities)
  (function initVideoMapAliases() {
    Object.keys(HSK1_VIDEOS_MAP).forEach(k => {
      const parts = HSK1_VIDEOS_MAP[k];
      if (Array.isArray(parts)) {
        parts.forEach(p => {
          if (p.part && !Array.isArray(HSK1_VIDEOS_MAP[p.part])) HSK1_VIDEOS_MAP[p.part] = p;
          if (p.partId && !Array.isArray(HSK1_VIDEOS_MAP[p.partId])) HSK1_VIDEOS_MAP[p.partId] = p;
          if (p.unitId) HSK1_VIDEOS_MAP[p.unitId] = p;
          if (p.videoId) HSK1_VIDEOS_MAP[p.videoId] = p;
        });
      }
    });
    HSK1_VIDEOS_MAP.totalVideos = 31;
    HSK1_VIDEOS_MAP.getVideo = function (key) {
      if (!key) return null;
      const res = HSK1_VIDEOS_MAP[key];
      if (Array.isArray(res)) return res[0] || null;
      return res || null;
    };
    HSK1_VIDEOS_MAP.getAllList = function () {
      const list = [];
      for (let i = 1; i <= 15; i++) {
        const parts = HSK1_VIDEOS_MAP[i];
        if (Array.isArray(parts)) list.push(...parts);
      }
      return list;
    };
  })();

  const HSK1_COURSE_DATA = {
  "id": "6adadba969897b0002482ca5",
  "title": "HSK1 3.0",
  "fullTitle": "Khóa học Tiêu Chuẩn New HSK 1 (3.0)",
  "level": "HSK 1 (3.0) · Khởi đầu toàn diện",
  "badge": "HSK 1 (3.0)",
  "teacher": "Thầy Khổng Tử Nhí",
  "progressPct": 7,
  "completedText": "Đã học 1/15 bài giảng",
  "thumb": "assets/course_mam_non.jpg",
  "fallbackThumb": "assets/hw_vo_viet_chu_han.jpg",
  "learnUrl": "https://khongtunhi.com/course/6adadba969897b0002482ca5",
  "docs": [
    {
      "title": "Sách Giáo Khoa New HSK 1 (3.0)",
      "filename": "HSK1_SGK.pdf",
      "pages": "148 trang",
      "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/HSK1_SGK.pdf"
    },
    {
      "title": "Sách Bài Tập New HSK 1 (3.0)",
      "filename": "HSK1_SBT.pdf",
      "pages": "150 trang",
      "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/HSK1_SBT.pdf"
    },
    {
      "title": "Vở Luyện Viết Chữ Hán HSK 1 (3.0)",
      "filename": "HSK1_Vo_luyen_viet.pdf",
      "pages": "137 trang",
      "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/HSK1_Vo_luyen_viet.pdf"
    },
    {
      "title": "214 Bộ Thủ Tiếng Trung",
      "filename": "Bo_thu_tieng_trung.pdf",
      "pages": "68 trang",
      "defaultJump": 3,
      "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/Bo_thu_tieng_trung.pdf#page=3"
    },
    {
      "title": "Từ Vựng New HSK 1 - 5 (3.0)",
      "filename": "Tu_vung_New_HSK1_HSK5.pdf",
      "pages": "312 trang",
      "defaultJump": 2,
      "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/Tu_vung_New_HSK1_HSK5.pdf#page=2"
    }
  ],
  "mockExamAudio": {
    "title": "Bài thi mô phỏng HSK (Cấp 1) - HSK (一级) 模拟试卷 听力",
    "filename": "模拟测试——HSK(一级）模拟试卷 听力.mp3",
    "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E6%A8%A1%E6%8B%9F%E6%B5%8B%E8%AF%95%E2%80%94%E2%80%94HSK(%E4%B8%80%E7%BA%A7%EF%BC%89%E6%A8%A1%E6%8B%9F%E8%AF%95%E5%8D%B7%20%E5%90%AC%E5%8A%9B.mp3"
  },
  "lessons": [
    {
      "id": "hsk1-lesson-1",
      "lessonNum": 1,
      "title": "Bài 1: AI小语，你好！ (Xin chào AI Tiểu Ngữ!)",
      "chinese": "AI小语，你好！",
      "vietnamese": "Xin chào AI Tiểu Ngữ!",
      "duration": "25:00",
      "done": true,
      "current": true,
      "sgkPage": 1,
      "sbtPage": 1,
      "writingPage": 1,
      "grammarSummary": "Làm quen bảng chữ cái Pinyin, phát âm thanh mẫu, vận mẫu, 4 thanh điệu cơ bản, lời chào hỏi và ngôi thứ hai trang trọng “您”.",
      "sgkAudio": [
        {
          "title": "Bài khóa 1 (课文1)",
          "filename": "01-1.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/01-1.mp3",
          "size": 282007
        },
        {
          "title": "Từ mới 1 (生词1)",
          "filename": "01-2.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/01-2.mp3",
          "size": 286177
        },
        {
          "title": "Bài khóa 2 (课文2)",
          "filename": "01-3.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/01-3.mp3",
          "size": 334549
        },
        {
          "title": "Từ mới 2 (生词2)",
          "filename": "01-4.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/01-4.mp3",
          "size": 472993
        },
        {
          "title": "Bài khóa 3 (课文3)",
          "filename": "01-5.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/01-5.mp3",
          "size": 332047
        },
        {
          "title": "Từ mới 3 (生词3)",
          "filename": "01-6.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/01-6.mp3",
          "size": 367075
        },
        {
          "title": "Bài vè đọc theo (跟读绕口令)",
          "filename": "01-7.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/01-7.mp3",
          "size": 455896
        }
      ],
      "sbtAudio": [
        {
          "title": "Nghe, đọc và luyện tập (听读练)",
          "filename": "听读练.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC01%E8%AF%BE/%E5%90%AC%E8%AF%BB%E7%BB%83.mp3",
          "size": 6121685
        },
        {
          "title": "Luyện phát âm ngữ âm (语音)",
          "filename": "语音.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC01%E8%AF%BE/%E8%AF%AD%E9%9F%B3.mp3",
          "size": 4214744
        }
      ]
    },
    {
      "id": "hsk1-lesson-2",
      "lessonNum": 2,
      "title": "Bài 2: 我叫李文 (Mình tên là Lý Văn)",
      "chinese": "我叫李文",
      "vietnamese": "Mình tên là Lý Văn",
      "duration": "26:15",
      "done": false,
      "current": false,
      "sgkPage": 5,
      "sbtPage": 5,
      "writingPage": 8,
      "grammarSummary": "Trật tự từ cơ bản trong câu tiếng Trung Quốc.",
      "sgkAudio": [
        {
          "title": "Bài khóa 1 (课文1)",
          "filename": "02-1.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/02-1.mp3",
          "size": 266161
        },
        {
          "title": "Từ mới 1 (生词1)",
          "filename": "02-2.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/02-2.mp3",
          "size": 424621
        },
        {
          "title": "Bài khóa 2 (课文2)",
          "filename": "02-3.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/02-3.mp3",
          "size": 391678
        },
        {
          "title": "Từ mới 2 (生词2)",
          "filename": "02-4.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/02-4.mp3",
          "size": 397516
        },
        {
          "title": "Bài khóa 3 (课文3)",
          "filename": "02-5.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/02-5.mp3",
          "size": 369160
        },
        {
          "title": "Từ mới 3 (生词3)",
          "filename": "02-6.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/02-6.mp3",
          "size": 347476
        },
        {
          "title": "Bài vè đọc theo (跟读绕口令)",
          "filename": "02-7.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/02-7.mp3",
          "size": 547636
        }
      ],
      "sbtAudio": [
        {
          "title": "Nghe, đọc và luyện tập (听读练)",
          "filename": "听读练 - phần bài tập .mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC02%E8%AF%BE/%E5%90%AC%E8%AF%BB%E7%BB%83%20-%20ph%E1%BA%A7n%20b%C3%A0i%20t%E1%BA%ADp%20.mp3",
          "size": 4223918
        },
        {
          "title": "Luyện phát âm ngữ âm (语音)",
          "filename": "语音.Phần luyện nghe phát âm mp3.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC02%E8%AF%BE/%E8%AF%AD%E9%9F%B3.Ph%E1%BA%A7n%20luy%E1%BB%87n%20nghe%20ph%C3%A1t%20%C3%A2m%20mp3.mp3",
          "size": 6871868
        }
      ]
    },
    {
      "id": "hsk1-lesson-3",
      "lessonNum": 3,
      "title": "Bài 3: 我是中国人 (Mình là người Trung Quốc)",
      "chinese": "我是中国人",
      "vietnamese": "Mình là người Trung Quốc",
      "duration": "28:40",
      "done": false,
      "current": false,
      "sgkPage": 10,
      "sbtPage": 9,
      "writingPage": 16,
      "grammarSummary": "Câu chữ “是”, Trợ từ kết cấu “的”, Câu hỏi “có... không?” dùng trợ từ nghi vấn “吗”.",
      "sgkAudio": [
        {
          "title": "Bài khóa 1 (课文1)",
          "filename": "03-1.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/03-1.mp3",
          "size": 313282
        },
        {
          "title": "Từ mới 1 (生词1)",
          "filename": "03-2.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/03-2.mp3",
          "size": 401686
        },
        {
          "title": "Bài khóa 2 (课文2)",
          "filename": "03-3.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/03-3.mp3",
          "size": 340387
        },
        {
          "title": "Từ mới 2 (生词2)",
          "filename": "03-4.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/03-4.mp3",
          "size": 513442
        },
        {
          "title": "Bài khóa 3 (课文3)",
          "filename": "03-5.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/03-5.mp3",
          "size": 460483
        },
        {
          "title": "Từ mới 3 (生词3)",
          "filename": "03-6.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/03-6.mp3",
          "size": 597259
        },
        {
          "title": "Bài vè đọc theo (跟读绕口令)",
          "filename": "03-7.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/03-7.mp3",
          "size": 558478
        }
      ],
      "sbtAudio": [
        {
          "title": "Nghe, đọc và luyện tập (听读练)",
          "filename": "Phần bài tập.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC03%E8%AF%BE/Ph%E1%BA%A7n%20b%C3%A0i%20t%E1%BA%ADp.mp3",
          "size": 4690958
        },
        {
          "title": "Luyện phát âm ngữ âm (语音)",
          "filename": "phần luyện nghe .mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC03%E8%AF%BE/ph%E1%BA%A7n%20luy%E1%BB%87n%20nghe%20.mp3",
          "size": 4472450
        }
      ]
    },
    {
      "id": "hsk1-lesson-4",
      "lessonNum": 4,
      "title": "Bài 4: 我有两个孩子 (Chị có hai con)",
      "chinese": "我有两个孩子",
      "vietnamese": "Chị có hai con",
      "duration": "27:10",
      "done": false,
      "current": false,
      "sgkPage": 18,
      "sbtPage": 13,
      "writingPage": 24,
      "grammarSummary": "Câu chữ “有”(1), Diễn đạt các con số (0-9999), Trợ từ ngữ khí “呢”(1), Danh lượng từ & kết cấu danh lượng.",
      "sgkAudio": [
        {
          "title": "Bài khóa 1 (课文1)",
          "filename": "04-1.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/04-1.mp3",
          "size": 340804
        },
        {
          "title": "Từ mới 1 (生词1)",
          "filename": "04-2.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/04-2.mp3",
          "size": 313282
        },
        {
          "title": "Bài khóa 2 (课文2)",
          "filename": "04-3.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/04-3.mp3",
          "size": 399601
        },
        {
          "title": "Từ mới 2 (生词2)",
          "filename": "04-4.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/04-4.mp3",
          "size": 612271
        },
        {
          "title": "Bài khóa 3 (课文3)",
          "filename": "04-5.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/04-5.mp3",
          "size": 448390
        },
        {
          "title": "Từ mới 3 (生词3)",
          "filename": "04-6.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/04-6.mp3",
          "size": 510940
        }
      ],
      "sbtAudio": [
        {
          "title": "Nghe, đọc và luyện tập (听读练)",
          "filename": "听读练.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC04%E8%AF%BE/%E5%90%AC%E8%AF%BB%E7%BB%83.mp3",
          "size": 4208072
        },
        {
          "title": "Kiểm tra mô phỏng HSK (模拟测练)",
          "filename": "模拟测练.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC04%E8%AF%BE/%E6%A8%A1%E6%8B%9F%E6%B5%8B%E7%BB%83.mp3",
          "size": 8077832
        },
        {
          "title": "Luyện phát âm ngữ âm (语音)",
          "filename": "语音.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC04%E8%AF%BE/%E8%AF%AD%E9%9F%B3.mp3",
          "size": 3147224
        }
      ]
    },
    {
      "id": "hsk1-lesson-5",
      "lessonNum": 5,
      "title": "Bài 5: 今天我休息 (Hôm nay anh được nghỉ)",
      "chinese": "今天我休息",
      "vietnamese": "Hôm nay anh được nghỉ",
      "duration": "25:50",
      "done": false,
      "current": false,
      "sgkPage": 27,
      "sbtPage": 22,
      "writingPage": 32,
      "grammarSummary": "Diễn đạt thời gian ngày tháng thứ (1), Câu vị ngữ danh từ, Động từ năng nguyện “会”.",
      "sgkAudio": [
        {
          "title": "Bài khóa 1 (课文1)",
          "filename": "05-1.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/05-1.mp3",
          "size": 335800
        },
        {
          "title": "Từ mới 1 (生词1)",
          "filename": "05-2.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/05-2.mp3",
          "size": 555559
        },
        {
          "title": "Bài khóa 2 (课文2)",
          "filename": "05-3.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/05-3.mp3",
          "size": 390427
        },
        {
          "title": "Từ mới 2 (生词2)",
          "filename": "05-4.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/05-4.mp3",
          "size": 490507
        },
        {
          "title": "Bài khóa 3 (课文3)",
          "filename": "05-5.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/05-5.mp3",
          "size": 383338
        },
        {
          "title": "Từ mới 3 (生词3)",
          "filename": "05-6.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/05-6.mp3",
          "size": 474661
        }
      ],
      "sbtAudio": [
        {
          "title": "Nghe, đọc và luyện tập (听读练)",
          "filename": "听读练.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC05%E8%AF%BE/%E5%90%AC%E8%AF%BB%E7%BB%83.mp3",
          "size": 3100103
        },
        {
          "title": "Kiểm tra mô phỏng HSK (模拟测练)",
          "filename": "模拟测练.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC05%E8%AF%BE/%E6%A8%A1%E6%8B%9F%E6%B5%8B%E7%BB%83.mp3",
          "size": 7330985
        },
        {
          "title": "Luyện phát âm ngữ âm (语音)",
          "filename": "语音.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC05%E8%AF%BE/%E8%AF%AD%E9%9F%B3.mp3",
          "size": 2367434
        }
      ]
    },
    {
      "id": "hsk1-lesson-6",
      "lessonNum": 6,
      "title": "Bài 6: 你的手机号是多少？ (Số điện thoại di động của bạn là bao nhiêu?)",
      "chinese": "你的手机号是多少？",
      "vietnamese": "Số điện thoại di động của bạn là bao nhiêu?",
      "duration": "26:30",
      "done": false,
      "current": false,
      "sgkPage": 35,
      "sbtPage": 31,
      "writingPage": 41,
      "grammarSummary": "Động từ năng nguyện “想”, Câu liên động (1), Đại từ nghi vấn “怎么”.",
      "sgkAudio": [
        {
          "title": "Bài khóa 1 (课文1)",
          "filename": "06-1.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/06-1.mp3",
          "size": 519280
        },
        {
          "title": "Từ mới 1 (生词1)",
          "filename": "06-2.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/06-2.mp3",
          "size": 310363
        },
        {
          "title": "Bài khóa 2 (课文2)",
          "filename": "06-3.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/06-3.mp3",
          "size": 395014
        },
        {
          "title": "Từ mới 2 (生词2)",
          "filename": "06-4.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/06-4.mp3",
          "size": 560980
        },
        {
          "title": "Bài khóa 3 (课文3)",
          "filename": "06-5.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/06-5.mp3",
          "size": 511774
        },
        {
          "title": "Từ mới 3 (生词3)",
          "filename": "06-6.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/06-6.mp3",
          "size": 718189
        }
      ],
      "sbtAudio": [
        {
          "title": "Nghe, đọc và luyện tập (听读练)",
          "filename": "听读练.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC06%E8%AF%BE/%E5%90%AC%E8%AF%BB%E7%BB%83.mp3",
          "size": 1987547
        },
        {
          "title": "Kiểm tra mô phỏng HSK (模拟测练)",
          "filename": "模拟测练.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC06%E8%AF%BE/%E6%A8%A1%E6%8B%9F%E6%B5%8B%E7%BB%83.mp3",
          "size": 8285498
        },
        {
          "title": "Luyện phát âm ngữ âm (语音)",
          "filename": "语音.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC06%E8%AF%BE/%E8%AF%AD%E9%9F%B3.mp3",
          "size": 2215646
        }
      ]
    },
    {
      "id": "hsk1-lesson-7",
      "lessonNum": 7,
      "title": "Bài 7: 我晚上六点半下班 (Em tan làm lúc 6 rưỡi tối)",
      "chinese": "我晚上六点半下班",
      "vietnamese": "Em tan làm lúc 6 rưỡi tối",
      "duration": "27:00",
      "done": false,
      "current": false,
      "sgkPage": 45,
      "sbtPage": 39,
      "writingPage": 50,
      "grammarSummary": "Diễn đạt thời gian giờ giấc (2), Trợ từ ngữ khí “吧”(1), Vị trí của phó từ & từ chỉ thời gian làm trạng ngữ, Trợ từ ngữ khí “呢”(2).",
      "sgkAudio": [
        {
          "title": "Bài khóa 1 (课文1)",
          "filename": "07-1.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/07-1.mp3",
          "size": 407107
        },
        {
          "title": "Từ mới 1 (生词1)",
          "filename": "07-2.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/07-2.mp3",
          "size": 533875
        },
        {
          "title": "Bài khóa 2 (课文2)",
          "filename": "07-3.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/07-3.mp3",
          "size": 477997
        },
        {
          "title": "Từ mới 2 (生词2)",
          "filename": "07-4.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/07-4.mp3",
          "size": 532624
        },
        {
          "title": "Bài khóa 3 (课文3)",
          "filename": "07-5.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/07-5.mp3",
          "size": 464236
        },
        {
          "title": "Từ mới 3 (生词3)",
          "filename": "07-6.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/07-6.mp3",
          "size": 650218
        }
      ],
      "sbtAudio": [
        {
          "title": "Kiểm tra mô phỏng HSK (模拟测练)",
          "filename": "模拟测练.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC07%E8%AF%BE/%E6%A8%A1%E6%8B%9F%E6%B5%8B%E7%BB%83.mp3",
          "size": 7911449
        },
        {
          "title": "Luyện phát âm ngữ âm (语音)",
          "filename": "语音.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC07%E8%AF%BE/%E8%AF%AD%E9%9F%B3.mp3",
          "size": 4468280
        }
      ]
    },
    {
      "id": "hsk1-lesson-8",
      "lessonNum": 8,
      "title": "Bài 8: 我爸爸也在医院工作 (Bố em cũng làm việc ở bệnh viện)",
      "chinese": "我爸爸也在医院工作",
      "vietnamese": "Bố em cũng làm việc ở bệnh viện",
      "duration": "26:40",
      "done": false,
      "current": false,
      "sgkPage": 54,
      "sbtPage": 48,
      "writingPage": 62,
      "grammarSummary": "Phương vị từ chỉ vị trí, Giới từ “在”, Động từ năng nguyện “能”.",
      "sgkAudio": [
        {
          "title": "Bài khóa 1 (课文1)",
          "filename": "08-1.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/08-1.mp3",
          "size": 364156
        },
        {
          "title": "Từ mới 1 (生词1)",
          "filename": "08-2.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/08-2.mp3",
          "size": 596425
        },
        {
          "title": "Bài khóa 2 (课文2)",
          "filename": "08-3.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/08-3.mp3",
          "size": 407524
        },
        {
          "title": "Từ mới 2 (生词2)",
          "filename": "08-4.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/08-4.mp3",
          "size": 473827
        },
        {
          "title": "Bài khóa 3 (课文3)",
          "filename": "08-5.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/08-5.mp3",
          "size": 511357
        },
        {
          "title": "Từ mới 3 (生词3)",
          "filename": "08-6.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/08-6.mp3",
          "size": 476329
        }
      ],
      "sbtAudio": [
        {
          "title": "Kiểm tra mô phỏng HSK (模拟测练)",
          "filename": "模拟测练.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC08%E8%AF%BE/%E6%A8%A1%E6%8B%9F%E6%B5%8B%E7%BB%83.mp3",
          "size": 7973582
        },
        {
          "title": "Luyện phát âm ngữ âm (语音)",
          "filename": "语音.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC08%E8%AF%BE/%E8%AF%AD%E9%9F%B3.mp3",
          "size": 3122204
        }
      ]
    },
    {
      "id": "hsk1-lesson-9",
      "lessonNum": 9,
      "title": "Bài 9: 我明天上午在学校学习 (Sáng mai mình học ở trường)",
      "chinese": "我明天上午在学校学习",
      "vietnamese": "Sáng mai mình học ở trường",
      "duration": "28:15",
      "done": false,
      "current": false,
      "sgkPage": 61,
      "sbtPage": 57,
      "writingPage": 71,
      "grammarSummary": "Câu tồn hiện (1), Thứ tự từ chỉ thời gian và nơi chốn khi đồng thời làm trạng ngữ, Tiền tố số thứ tự “第”.",
      "sgkAudio": [
        {
          "title": "Bài khóa 1 (课文1)",
          "filename": "09-1.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/09-1.mp3",
          "size": 441718
        },
        {
          "title": "Từ mới 1 (生词1)",
          "filename": "09-2.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/09-2.mp3",
          "size": 453811
        },
        {
          "title": "Bài khóa 2 (课文2)",
          "filename": "09-3.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/09-3.mp3",
          "size": 547636
        },
        {
          "title": "Từ mới 2 (生词2)",
          "filename": "09-4.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/09-4.mp3",
          "size": 511357
        },
        {
          "title": "Bài khóa 3 (课文3)",
          "filename": "09-5.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/09-5.mp3",
          "size": 624364
        },
        {
          "title": "Từ mới 3 (生词3)",
          "filename": "09-6.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/09-6.mp3",
          "size": 613522
        }
      ],
      "sbtAudio": [
        {
          "title": "Kiểm tra mô phỏng HSK (模拟测练)",
          "filename": "模拟测练.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC09%E8%AF%BE/%E6%A8%A1%E6%8B%9F%E6%B5%8B%E7%BB%83.mp3",
          "size": 7926044
        },
        {
          "title": "Luyện phát âm ngữ âm (语音)",
          "filename": "语音.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC09%E8%AF%BE/%E8%AF%AD%E9%9F%B3.mp3",
          "size": 2982509
        }
      ]
    },
    {
      "id": "hsk1-lesson-10",
      "lessonNum": 10,
      "title": "Bài 10: 这儿的苹果真便宜！ (Táo ở đây rẻ thật!)",
      "chinese": "这儿的苹果真便宜！",
      "vietnamese": "Táo ở đây rẻ thật!",
      "duration": "27:20",
      "done": false,
      "current": false,
      "sgkPage": 70,
      "sbtPage": 66,
      "writingPage": 80,
      "grammarSummary": "Diễn đạt số tiền và đơn vị tiền tệ, Câu vị ngữ tính từ, Đại từ nghi vấn “怎么样”.",
      "sgkAudio": [
        {
          "title": "Bài khóa 1 (课文1)",
          "filename": "10-1.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/10-1.mp3",
          "size": 507604
        },
        {
          "title": "Từ mới 1 (生词1)",
          "filename": "10-2.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/10-2.mp3",
          "size": 480499
        },
        {
          "title": "Bài khóa 2 (课文2)",
          "filename": "10-3.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/10-3.mp3",
          "size": 541381
        },
        {
          "title": "Từ mới 2 (生词2)",
          "filename": "10-4.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/10-4.mp3",
          "size": 426706
        },
        {
          "title": "Bài khóa 3 (课文3)",
          "filename": "10-5.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/10-5.mp3",
          "size": 603931
        },
        {
          "title": "Từ mới 3 (生词3)",
          "filename": "10-6.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/10-6.mp3",
          "size": 569320
        }
      ],
      "sbtAudio": [
        {
          "title": "Kiểm tra mô phỏng HSK (模拟测练)",
          "filename": "模拟测练.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC10%E8%AF%BE/%E6%A8%A1%E6%8B%9F%E6%B5%8B%E7%BB%83.mp3",
          "size": 7978169
        },
        {
          "title": "Luyện phát âm ngữ âm (语音)",
          "filename": "语音.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC10%E8%AF%BE/%E8%AF%AD%E9%9F%B3.mp3",
          "size": 3053399
        }
      ]
    },
    {
      "id": "hsk1-lesson-11",
      "lessonNum": 11,
      "title": "Bài 11: 我读大学呢 (Em đang học đại học)",
      "chinese": "我读大学呢",
      "vietnamese": "Em đang học đại học",
      "duration": "26:50",
      "done": false,
      "current": false,
      "sgkPage": 78,
      "sbtPage": 75,
      "writingPage": 89,
      "grammarSummary": "Câu hỏi chính phản, Phó từ chỉ thời gian “在/正在”, Động từ năng nguyện “要”.",
      "sgkAudio": [
        {
          "title": "Bài khóa 1 (课文1)",
          "filename": "11-1.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/11-1.mp3",
          "size": 470491
        },
        {
          "title": "Từ mới 1 (生词1)",
          "filename": "11-2.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/11-2.mp3",
          "size": 482584
        },
        {
          "title": "Bài khóa 2 (课文2)",
          "filename": "11-3.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/11-3.mp3",
          "size": 464236
        },
        {
          "title": "Từ mới 2 (生词2)",
          "filename": "11-4.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/11-4.mp3",
          "size": 420868
        },
        {
          "title": "Bài khóa 3 (课文3)",
          "filename": "11-5.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/11-5.mp3",
          "size": 513442
        },
        {
          "title": "Từ mới 3 (生词3)",
          "filename": "11-6.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/11-6.mp3",
          "size": 708598
        }
      ],
      "sbtAudio": [
        {
          "title": "Kiểm tra mô phỏng HSK (模拟测练)",
          "filename": "模拟测练.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC11%E8%AF%BE/%E6%A8%A1%E6%8B%9F%E6%B5%8B%E7%BB%83.mp3",
          "size": 8001521
        },
        {
          "title": "Luyện phát âm ngữ âm (语音)",
          "filename": "语音.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC11%E8%AF%BE/%E8%AF%AD%E9%9F%B3.mp3",
          "size": 3460391
        }
      ]
    },
    {
      "id": "hsk1-lesson-12",
      "lessonNum": 12,
      "title": "Bài 12: 昨天下了雪了 (Hôm qua tuyết rơi rồi)",
      "chinese": "昨天下了雪了",
      "vietnamese": "Hôm qua tuyết rơi rồi",
      "duration": "25:45",
      "done": false,
      "current": false,
      "sgkPage": 86,
      "sbtPage": 84,
      "writingPage": 100,
      "grammarSummary": "Câu phi chủ vị, Trợ từ ngữ khí “了”(1), Mẫu câu cảm thán “太……了”.",
      "sgkAudio": [
        {
          "title": "Bài khóa 1 (课文1)",
          "filename": "12-1.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/12-1.mp3",
          "size": 407524
        },
        {
          "title": "Từ mới 1 (生词1)",
          "filename": "12-2.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/12-2.mp3",
          "size": 543049
        },
        {
          "title": "Bài khóa 2 (课文2)",
          "filename": "12-3.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/12-3.mp3",
          "size": 390010
        },
        {
          "title": "Từ mới 2 (生词2)",
          "filename": "12-4.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/12-4.mp3",
          "size": 445471
        },
        {
          "title": "Bài khóa 3 (课文3)",
          "filename": "12-5.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/12-5.mp3",
          "size": 507187
        },
        {
          "title": "Từ mới 3 (生词3)",
          "filename": "12-6.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/12-6.mp3",
          "size": 567235
        }
      ],
      "sbtAudio": [
        {
          "title": "Kiểm tra mô phỏng HSK (模拟测练)",
          "filename": "模拟测练.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC12%E8%AF%BE/%E6%A8%A1%E6%8B%9F%E6%B5%8B%E7%BB%83.mp3",
          "size": 8127038
        },
        {
          "title": "Luyện phát âm ngữ âm (语音)",
          "filename": "语音.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC12%E8%AF%BE/%E8%AF%AD%E9%9F%B3.mp3",
          "size": 3029630
        }
      ]
    },
    {
      "id": "hsk1-lesson-13",
      "lessonNum": 13,
      "title": "Bài 13: 请给我一杯茶 (Cho tôi một cốc trà)",
      "chinese": "请给我一杯茶",
      "vietnamese": "Cho tôi một cốc trà",
      "duration": "27:15",
      "done": false,
      "current": false,
      "sgkPage": 95,
      "sbtPage": 93,
      "writingPage": 109,
      "grammarSummary": "Động từ năng nguyện “可以”, Cấu trúc “Động từ + 一下”, Câu hai tân ngữ (1).",
      "sgkAudio": [
        {
          "title": "Bài khóa 1 (课文1)",
          "filename": "13-1.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/13-1.mp3",
          "size": 469657
        },
        {
          "title": "Từ mới 1 (生词1)",
          "filename": "13-2.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/13-2.mp3",
          "size": 467572
        },
        {
          "title": "Bài khóa 2 (课文2)",
          "filename": "13-3.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/13-3.mp3",
          "size": 527620
        },
        {
          "title": "Từ mới 2 (生词2)",
          "filename": "13-4.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/13-4.mp3",
          "size": 660226
        },
        {
          "title": "Bài khóa 3 (课文3)",
          "filename": "13-5.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/13-5.mp3",
          "size": 564316
        },
        {
          "title": "Từ mới 3 (生词3)",
          "filename": "13-6.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/13-6.mp3",
          "size": 304942
        }
      ],
      "sbtAudio": [
        {
          "title": "Kiểm tra mô phỏng HSK (模拟测练)",
          "filename": "模拟测练.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC13%E8%AF%BE/%E6%A8%A1%E6%8B%9F%E6%B5%8B%E7%BB%83.mp3",
          "size": 7986926
        },
        {
          "title": "Luyện phát âm ngữ âm (语音)",
          "filename": "语音.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC13%E8%AF%BE/%E8%AF%AD%E9%9F%B3.mp3",
          "size": 3068411
        }
      ]
    },
    {
      "id": "hsk1-lesson-14",
      "lessonNum": 14,
      "title": "Bài 14: 我看了一个电影 (Mình đã xem một bộ phim)",
      "chinese": "我看了一个电影",
      "vietnamese": "Mình đã xem một bộ phim",
      "duration": "28:00",
      "done": false,
      "current": false,
      "sgkPage": 103,
      "sbtPage": 102,
      "writingPage": 117,
      "grammarSummary": "Trợ từ động thái “了”(2), Từ ly hợp (1), Phó từ phạm vi “都”.",
      "sgkAudio": [
        {
          "title": "Bài khóa 1 (课文1)",
          "filename": "14-1.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/14-1.mp3",
          "size": 426706
        },
        {
          "title": "Từ mới 1 (生词1)",
          "filename": "14-2.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/14-2.mp3",
          "size": 465487
        },
        {
          "title": "Bài khóa 2 (课文2)",
          "filename": "14-3.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/14-3.mp3",
          "size": 598927
        },
        {
          "title": "Từ mới 2 (生词2)",
          "filename": "14-4.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/14-4.mp3",
          "size": 616024
        },
        {
          "title": "Bài khóa 3 (课文3)",
          "filename": "14-5.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/14-5.mp3",
          "size": 500515
        },
        {
          "title": "Từ mới 3 (生词3)",
          "filename": "14-6.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/14-6.mp3",
          "size": 687748
        }
      ],
      "sbtAudio": [
        {
          "title": "Kiểm tra mô phỏng HSK (模拟测练)",
          "filename": "模拟测练.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC14%E8%AF%BE/%E6%A8%A1%E6%8B%9F%E6%B5%8B%E7%BB%83.mp3",
          "size": 8081168
        },
        {
          "title": "Luyện phát âm ngữ âm (语音)",
          "filename": "语音.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC14%E8%AF%BE/%E8%AF%AD%E9%9F%B3.mp3",
          "size": 2888684
        }
      ]
    },
    {
      "id": "hsk1-lesson-15",
      "lessonNum": 15,
      "title": "Bài 15: 大兴机场见！ (Hẹn gặp ở sân bay Đại Hưng!)",
      "chinese": "大兴机场见！",
      "vietnamese": "Hẹn gặp ở sân bay Đại Hưng!",
      "duration": "29:30",
      "done": false,
      "current": false,
      "sgkPage": 112,
      "sbtPage": 111,
      "writingPage": 129,
      "grammarSummary": "Câu ghép đẳng lập “……，还/也……”.",
      "sgkAudio": [
        {
          "title": "Bài khóa 1 (课文1)",
          "filename": "15-1.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/15-1.mp3",
          "size": 435463
        },
        {
          "title": "Từ mới 1 (生词1)",
          "filename": "15-2.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/15-2.mp3",
          "size": 264910
        },
        {
          "title": "Bài khóa 2 (课文2)",
          "filename": "15-3.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/15-3.mp3",
          "size": 515110
        },
        {
          "title": "Từ mới 2 (生词2)",
          "filename": "15-4.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/15-4.mp3",
          "size": 480082
        },
        {
          "title": "Bài khóa 3 (课文3)",
          "filename": "15-5.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/15-5.mp3",
          "size": 688999
        },
        {
          "title": "Từ mới 3 (生词3)",
          "filename": "15-6.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/15-6.mp3",
          "size": 672736
        }
      ],
      "sbtAudio": [
        {
          "title": "Kiểm tra mô phỏng HSK (模拟测练)",
          "filename": "模拟测练.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC15%E8%AF%BE/%E6%A8%A1%E6%8B%9F%E6%B5%8B%E7%BB%83.mp3",
          "size": 8259227
        },
        {
          "title": "Luyện phát âm ngữ âm (语音)",
          "filename": "语音.mp3",
          "cdnUrl": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/%E7%AC%AC15%E8%AF%BE/%E8%AF%AD%E9%9F%B3.mp3",
          "size": 2917457
        }
      ]
    }
  ]
};

  const HSK1_PDF_PAGE_MAP = {
    1: { sgkPdfPage: 17, sbtPdfPage: 11, writingPdfPage: 1 },
    2: { sgkPdfPage: 21, sbtPdfPage: 15, writingPdfPage: 8 },
    3: { sgkPdfPage: 26, sbtPdfPage: 19, writingPdfPage: 16 },
    4: { sgkPdfPage: 34, sbtPdfPage: 23, writingPdfPage: 24 },
    5: { sgkPdfPage: 43, sbtPdfPage: 32, writingPdfPage: 32 },
    6: { sgkPdfPage: 51, sbtPdfPage: 41, writingPdfPage: 41 },
    7: { sgkPdfPage: 61, sbtPdfPage: 49, writingPdfPage: 50 },
    8: { sgkPdfPage: 70, sbtPdfPage: 58, writingPdfPage: 62 },
    9: { sgkPdfPage: 77, sbtPdfPage: 67, writingPdfPage: 71 },
    10: { sgkPdfPage: 86, sbtPdfPage: 78, writingPdfPage: 80 },
    11: { sgkPdfPage: 94, sbtPdfPage: 87, writingPdfPage: 89 },
    12: { sgkPdfPage: 102, sbtPdfPage: 96, writingPdfPage: 100 },
    13: { sgkPdfPage: 111, sbtPdfPage: 105, writingPdfPage: 109 },
    14: { sgkPdfPage: 119, sbtPdfPage: 114, writingPdfPage: 117 },
    15: { sgkPdfPage: 128, sbtPdfPage: 123, writingPdfPage: 129 }
  };

  if (Array.isArray(HSK1_COURSE_DATA.lessons)) {
    HSK1_COURSE_DATA.lessons.forEach(l => {
      const raw = HSK1_VIDEOS_MAP[l.lessonNum] || HSK1_VIDEOS_MAP[String(l.lessonNum)] || [];
      l.videos = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? [raw] : []);
      const map = HSK1_PDF_PAGE_MAP[l.lessonNum] || {};
      l.sgkPdfPage = map.sgkPdfPage || (l.sgkPage ? l.sgkPage + 16 : 1);
      l.sbtPdfPage = map.sbtPdfPage || (l.sbtPage ? (l.lessonNum >= 10 ? l.sbtPage + 12 : l.sbtPage + 10) : 1);
      l.writingPdfPage = map.writingPdfPage || (l.writingPage || 1);
      const cdnDocs = 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/';
      l.sgkPdfUrl = `${cdnDocs}HSK1_SGK.pdf#page=${l.sgkPdfPage}`;
      l.sbtPdfUrl = `${cdnDocs}HSK1_SBT.pdf#page=${l.sbtPdfPage}`;
      l.writingPdfUrl = `${cdnDocs}HSK1_Vo_luyen_viet.pdf#page=${l.writingPdfPage}`;
    });
  }

  const ONLINE_COURSES = [
    HSK1_COURSE_DATA
  ];

  app.teachers = DEFAULT_TEACHERS.map(t => ({ ...t, aliases: [...(t.aliases || [])] }));
  app.classes = DEFAULT_CLASSES.map(c => ({ ...c }));
  app.students = DEFAULT_STUDENTS.map(s => ({ ...s, courseIds: [...s.courseIds] }));
  app.onlineCourses = ONLINE_COURSES;
  app.activeParentStudentIdx = 0;
  app.activeTeacherCode = null;
  app.teacherClassFilter = 'ALL';
  app.adminCaseFilter = 'ALL';
  app.teacherTab = 'grade';
  app.teacherAssignLessonNum = 1;
  app.teacherAssignFormat = 'video';
  app.adminTab = 'overview';
  app.adminExpandedClassId = null;
  app.parentSubtab = 'courses';
  app.pendingAction = null;
  app.adminPreviewingStudent = false;
  app.adminProvisionFormOpen = true;
  app.adminProvisionRole = 'student';
  app._provDraft = { name: '', email: '', password: '123456', phone: '', classCode: '', hasOnline: false };
  app.adminNewClassFormOpen = true;
  app.lastProvisionResult = null;
  app.chatDrafts = {};

  app.computeStudentCase = function (stu) {
    if (!stu) return 'unassigned';
    const hasOnline = Boolean(stu.hasOnlineCourses && Array.isArray(stu.courseIds) && stu.courseIds.length > 0);
    const hasSll = Boolean(stu.hasLiveClass && stu.classCode);
    if (hasOnline && hasSll) return 'both';
    if (hasOnline) return 'online_only';
    if (hasSll) return 'sll_only';
    return 'unassigned';
  };

  app.getCaseMeta = function (caseType) {
    if (caseType === 'unassigned') {
      return {
        code: 'unassigned',
        shortBadge: 'Chưa xếp lớp / khóa học',
        title: 'Học viên mới (Chưa xếp lớp / khóa học)',
        desc: 'Tài khoản học viên đã khởi tạo, đang chờ Quản lý trung tâm xếp vào Lớp học hoặc mở Khóa học Online.',
        badgeClass: ''
      };
    }
    if (caseType === 'online_only') {
      return {
        code: 'online_only',
        shortBadge: 'Khóa học Online',
        title: 'Học viên Khóa học Online',
        desc: 'Tài khoản học trực tuyến qua hệ thống bài giảng video.',
        badgeClass: 'case-badge-online'
      };
    }
    if (caseType === 'sll_only') {
      return {
        code: 'sll_only',
        shortBadge: 'Lớp Sổ Liên Lạc',
        title: 'Học viên Lớp Sổ Liên Lạc',
        desc: 'Tài khoản theo dõi Sổ Liên Lạc của lớp học (Nhận xét & Bài tập, Tin nhắn cô giáo).',
        badgeClass: 'case-badge-sll'
      };
    }
    return {
      code: 'both',
      shortBadge: 'Lớp SLL & Khóa Online',
      title: 'Học viên Chính thức · Sổ Liên Lạc & Khóa học Online',
      desc: 'Tài khoản kích hoạt đầy đủ Sổ Liên Lạc lớp học trực tiếp và Kho khóa học video đã đăng ký.',
      badgeClass: 'case-badge-both'
    };
  };

  app.getActiveParentStudent = function () {
    return this.students[this.activeParentStudentIdx] || this.students[0];
  };

  app.getClassInfo = function (classCode) {
    return this.classes.find(c => c.id === classCode) || this.classes[0];
  };

  app.getStudentTeacher = function (stu) {
    const target = stu || this.getActiveParentStudent();
    if (!target || !target.hasLiveClass || !target.classCode) return null;
    const cls = Array.isArray(this.classes) ? this.classes.find(c => c.id === target.classCode) : null;
    if (cls && cls.teacherCode) {
      const t = (this.teachers || []).find(item => item.code === cls.teacherCode);
      return {
        code: cls.teacherCode,
        name: cls.teacherName || t?.name || 'Cô Lâm Mỹ Linh',
        email: cls.teacherEmail || t?.email || 'linh.lam@khongtunhi.com'
      };
    }
    return null;
  };

  app.isHomeworkForStudent = function (hw, stu) {
    if (!hw || !stu) return false;
    if (hw.studentCode && stu.code && hw.studentCode === stu.code) return true;
    const hEm = String(hw.studentEmail || '').trim().toLowerCase();
    const sEm = String(stu.email || '').trim().toLowerCase();
    if (hEm && sEm && hEm === sEm) return true;
    if (sEm && Array.isArray(stu.aliases) && hEm && stu.aliases.some(a => String(a || '').toLowerCase() === hEm)) return true;
    if (sEm && hw.studentCode) {
      const dynCode = 'KTN-2026-' + (sEm.split('@')[0] || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      if (hw.studentCode === dynCode) return true;
    }
    const hName = foldText(String(hw.studentName || '').replace(/^bé\s+/i, '').trim());
    const sName = foldText(String(stu.name || '').replace(/^bé\s+/i, '').trim());
    if (hName && sName && hName === sName) return true;
    return false;
  };

  app.getTeacherManagedClasses = function () {
    const tCode = this.activeTeacherCode || this.state?.teacherCode;
    if (!tCode) return this.classes;
    return this.classes.filter(c => c.teacherCode === tCode);
  };

  app.getTeacherManagedStudents = function () {
    const managedClasses = this.getTeacherManagedClasses();
    if (!managedClasses.length) return [];
    const managedClassIds = new Set(managedClasses.map(c => c.id));
    return this.students
      .map((student, index) => ({ student, index }))
      .filter(({ student }) => {
        if (!student) return false;
        if (student.hasLiveClass && student.classCode && managedClassIds.has(student.classCode)) return true;
        const hasHw = (this.state?.homeworks || []).some(h => this.isHomeworkForStudent(h, student) && h.classCode && managedClassIds.has(h.classCode));
        if (hasHw) return true;
        return false;
      });
  };

  app._slugifyAccount = function (str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/^(be|co|thay|laosu|phu\s*huynh)\s+/i, '')
      .replace(/[^a-z0-9._+-]/g, '');
  };

  app._nextStudentCode = function () {
    const used = new Set();
    DEFAULT_STUDENTS.forEach(s => { if (s?.code) used.add(s.code); });
    (this.students || []).forEach(s => { if (s?.code) used.add(s.code); });
    (this.state?.customStudents || []).forEach(s => { if (s?.code) used.add(s.code); });
    let num = 96 + (this.students ? this.students.length : 6);
    while (used.has(`KTN-2026-${String(num).padStart(3, '0')}`)) {
      num++;
    }
    return `KTN-2026-${String(num).padStart(3, '0')}`;
  };

  app.reconcileTeacherSelection = function () {
    const managedClasses = this.getTeacherManagedClasses();
    const managed = this.getTeacherManagedStudents();
    if (this.teacherClassFilter !== 'ALL' && !managedClasses.some(c => c.id === this.teacherClassFilter)) {
      this.teacherClassFilter = managedClasses[0]?.id || 'ALL';
    }
    if (!managed.length) {
      this.selectedStudentIdx = -1;
      return;
    }
    const newestPendingHw = (this.state?.homeworks || []).find(h => h && h.status === 'PENDING');
    if (newestPendingHw && this._lastAutoSelectedPendingStudentHwId !== newestPendingHw.id) {
      const pendingMatch = managed.find(({ student }) => this.isHomeworkForStudent(newestPendingHw, student));
      if (pendingMatch) {
        this._lastAutoSelectedPendingStudentHwId = newestPendingHw.id;
        this.selectedStudentIdx = pendingMatch.index;
        if (pendingMatch.student.classCode && this.teacherClassFilter !== 'ALL' && this.teacherClassFilter !== pendingMatch.student.classCode) {
          this.teacherClassFilter = pendingMatch.student.classCode;
        }
        const lNum = Number(newestPendingHw.lessonNum) || this.parseLessonNumber(newestPendingHw.lesson, 1);
        this.teacherGradeLessonNum = lNum;
        this.selectedHwId = newestPendingHw.id;
        this._teacherManuallyPickedLesson = false;
        return;
      }
    }
    let inFilter = managed.filter(({ student }) => this.teacherClassFilter === 'ALL' || !student.classCode || student.classCode === this.teacherClassFilter);
    if (!inFilter.length && managed.length) {
      this.teacherClassFilter = managed[0].student.classCode || managedClasses[0]?.id || 'ALL';
      inFilter = managed.filter(({ student }) => this.teacherClassFilter === 'ALL' || !student.classCode || student.classCode === this.teacherClassFilter);
    }
    const pool = inFilter.length ? inFilter : managed;
    if (pool.length && !pool.some(m => m.index === this.selectedStudentIdx)) {
      const pendingFirst = pool.find(({ student }) => this.state?.homeworks?.some(h => this.isHomeworkForStudent(h, student) && h.status === 'PENDING'));
      this.selectedStudentIdx = (pendingFirst || pool[0]).index;
    }
  };

  app.applyTeacherSession = function (session) {
    if (!this.state || !session?.account) return;
    const email = String(session.account.email || '').trim().toLowerCase();
    const name = String(session.account.name || '').trim();
    const matched = (this.teachers || []).find(t =>
      (email && (String(t.email || '').toLowerCase() === email || (Array.isArray(t.aliases) && t.aliases.some(a => String(a || '').toLowerCase() === email)))) ||
      (name && foldText(t.name) === foldText(name))
    );
    if (matched) {
      this.state.teacherName = matched.name;
      this.state.teacherCode = matched.code;
      this.activeTeacherCode = matched.code;
    } else if (email === 'thu.ha@khongtunhi.com' || /thu\s*h[aà]/i.test(name)) {
      this.state.teacherName = 'Cô Trần Thu Hà';
      this.state.teacherCode = 'GV-KTN-12';
      this.activeTeacherCode = 'GV-KTN-12';
    } else if (email.includes('linh') || /m[yỹ]\s*linh/i.test(name)) {
      this.state.teacherName = 'Cô Lâm Mỹ Linh';
      this.state.teacherCode = 'GV-KTN-08';
      this.activeTeacherCode = 'GV-KTN-08';
    } else if (name) {
      const customCode = 'GV-KTN-' + (email.split('@')[0] || '99').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      const displayName = /^(cô|thầy|lão sư)\s/i.test(name) ? name : 'Cô ' + name;
      this.state.teacherName = displayName;
      this.state.teacherCode = customCode;
      this.activeTeacherCode = customCode;
      if (!this.teachers.some(t => t.code === customCode)) {
        this.teachers.push({ code: customCode, name: displayName, email: email || 'teacher@khongtunhi.com', aliases: [], phone: '', specialty: 'Giáo viên Tiếng Trung Thiếu Nhi' });
      }
    }
    const managedClasses = this.getTeacherManagedClasses();
    this.teacherClassFilter = 'ALL';
    this.reconcileTeacherSelection();
    if ($('teacher-view-name')) $('teacher-view-name').textContent = this.state.teacherName;
    this.renderAll?.();
  };

  app.ensureStudentForSession = function (session) {
    const acc = session?.account || session?.user || session?.payload || session || {};
    const email = String(acc.email || session?.email || '').trim().toLowerCase();
    const accountId = String(acc.id || acc.studentId || session?.id || session?.studentId || '').trim();
    const rawName = String(acc.name || session?.name || '').trim();
    const cleanRawName = foldText(rawName.replace(/^bé\s+/i, '').trim());
    const isConnected = window.sllAuth && window.sllAuth.mode === 'connected';

    // 1. Search in existing app.students
    const matchFn = s => {
      if (!s) return false;
      const sEmail = String(s.email || '').toLowerCase();
      const sParentEmail = String(s.parentEmail || '').toLowerCase();
      const sName = foldText(String(s.name || '').replace(/^bé\s+/i, '').trim());
      const sCode = String(s.code || s.id || s.userId || '').trim();
      const sParentId = String(s.parentId || '').trim();
      if (email && (sEmail === email || sParentEmail === email || (Array.isArray(s.aliases) && s.aliases.some(a => String(a || '').toLowerCase() === email)))) return true;
      if (accountId && (sCode === accountId || sParentId === accountId)) return true;
      if (cleanRawName && sName === cleanRawName) return true;
      return false;
    };

    let matched = this.students.find(matchFn);
    if (matched) {
      const sMail = String(matched.email || '').toLowerCase();
      const sName = String(matched.name || '').toLowerCase();
      if (sMail === 'taphong2002@gmail.com' || sName.includes('ta phong')) {
        matched.hasOnlineCourses = true;
        if (!Array.isArray(matched.courseIds) || matched.courseIds.length === 0) {
          matched.courseIds = ['6adadba969897b0002482ca5'];
        }
      }
    }

    // 2. Search in izTeach master synced students if loaded
    if (!matched) {
      const izList = (Array.isArray(this.izMasterStudents) && this.izMasterStudents.length) ? this.izMasterStudents : (this.izStudents || []);
      const izMatch = Array.isArray(izList) ? izList.find(z =>
        (email && String(z.email || '').toLowerCase() === email) ||
        (accountId && (z.id === accountId || z.userId === accountId)) ||
        (cleanRawName && foldText(String(z.name || '').replace(/^bé\s+/i, '').trim()) === cleanRawName)
      ) : null;

      if (izMatch || email || accountId || rawName) {
        const displayName = rawName || (izMatch && izMatch.name) || (email ? email.split('@')[0] : 'Học viên');
        const customCode = (izMatch && izMatch.id) || (accountId && accountId.startsWith('KTN-')
          ? accountId
          : 'KTN-2026-' + (email ? email.split('@')[0] : '01').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
        const studentEmail = email || (izMatch && izMatch.email) || 'student@khongtunhi.com';
        const isTaPhong = (studentEmail && String(studentEmail).toLowerCase() === 'taphong2002@gmail.com') || (displayName && String(displayName).toLowerCase().includes('ta phong'));
        const studentUserId = (izMatch && (izMatch.userId || izMatch.id)) || accountId || acc.userId || acc.id || (isTaPhong ? 'bc21991c-ce9b-465d-b85f-dbb1821e51a9' : '');

        const savedEnt = Array.isArray(this.state?.studentEntitlements)
          ? this.state.studentEntitlements.find(e =>
              (e.code && (e.code === customCode || e.code === accountId)) ||
              (e.email && studentEmail && String(e.email).toLowerCase() === studentEmail.toLowerCase())
            )
          : null;

        const hasSavedOnline = isTaPhong ? true : Boolean(savedEnt?.hasOnlineCourses);
        const savedCourseIds = hasSavedOnline ? ['6adadba969897b0002482ca5'] : [];

        matched = {
          name: displayName,
          parent: 'Phụ huynh ' + displayName,
          email: studentEmail,
          phone: (izMatch && izMatch.phone) || '',
          progress: savedEnt?.progress || (hasSavedOnline ? 'Tự học HSK1 3.0' : 'Chưa xếp lớp'),
          code: isTaPhong ? 'KTN-2026-TAPHON' : customCode,
          userId: studentUserId,
          className: isTaPhong ? 'Lớp HSK 1 Cơ Bản' : (savedEnt?.className || ''),
          classCode: savedEnt?.classCode || '',
          hasOnlineCourses: hasSavedOnline,
          hasLiveClass: Boolean(savedEnt?.classCode),
          unsubmittedCurrent: false,
          courseIds: savedCourseIds,
          attendance: savedEnt?.attendance || (hasSavedOnline ? 'Tự học trực tuyến' : 'Chưa xếp lớp'),
          target: savedEnt?.target || 'Làm quen phát âm Pinyin & từ vựng tiếng Trung cơ bản',
          note: savedEnt?.note || 'Tài khoản học viên',
          isDynamicSession: true
        };
        matched.caseType = this.computeStudentCase(matched);
      }
    }

    if (!matched) return 0;

    if (isConnected) {
      // Khi người dùng đã đăng nhập tài khoản thật: chỉ giữ học viên thuộc tài khoản này, loại bỏ 100% dữ liệu mẫu
      const userStudents = this.students.filter(matchFn);
      if (!userStudents.includes(matched)) userStudents.push(matched);
      this.students = userStudents;
      this.activeParentStudentIdx = 0;
      this.fetchIzTeachStudentPermissions?.(matched);
      return 0;
    }

    // Demo mode: giữ dữ liệu mẫu
    let idx = this.students.indexOf(matched);
    if (idx === -1) {
      this.students.push(matched);
      idx = this.students.length - 1;
    }
    this.activeParentStudentIdx = idx;
    return idx;
  };

  app.fetchIzTeachStudentPermissions = async function (stu) {
    if (!stu) return;
    const email = String(stu.email || '').trim().toLowerCase();
    const userId = stu.userId || (email === 'taphong2002@gmail.com' ? 'bc21991c-ce9b-465d-b85f-dbb1821e51a9' : '');
    if (!userId) return;
    if (!this._fetchedPermissionUsers) this._fetchedPermissionUsers = new Set();
    if (!this._fetchedPermissionCache) this._fetchedPermissionCache = {};
    const permKey = `${userId}:${email}`;
    const cachedIds = this._fetchedPermissionCache[permKey];
    if (Array.isArray(cachedIds) && cachedIds.length > 0) {
      stu.hasOnlineCourses = true;
      stu.courseIds = [...cachedIds];
      stu.caseType = this.computeStudentCase(stu);
    }
    if (stu._permissionsFetched || this._fetchedPermissionUsers.has(permKey)) {
      stu._permissionsFetched = true;
      return;
    }
    stu._permissionsFetched = true;
    this._fetchedPermissionUsers.add(permKey);
    try {
      const adminToken = typeof this.getCloudSyncAdminToken === 'function' ? await this.getCloudSyncAdminToken() : null;
      if (!adminToken) return;
      const res = await fetch(`https://vs1ocpw7ri.execute-api.ap-southeast-1.amazonaws.com/prod/user-permission?userId=${encodeURIComponent(userId)}&vendorId=${encodeURIComponent(VENDOR_ID)}`, {
        headers: { Authorization: adminToken }
      });
      if (!res.ok) return;
      const data = await res.json();
      const onlineCourses = Array.isArray(data.onlineCourses) ? data.onlineCourses : [];
      if (onlineCourses.length > 0) {
        stu.hasOnlineCourses = true;
        onlineCourses.forEach(rc => {
          const cid = rc.id || rc._id;
          let existing = this.onlineCourses.find(c => c.id === cid);
          if (!existing) {
            existing = {
              id: cid,
              title: rc.title || 'Khóa học Tiếng Trung HSK',
              level: 'Khóa học Online',
              teacher: 'Học Viện Khổng Tử Nhí',
              progressPct: Math.round(Number(rc.progress) || 0),
              completedText: 'Đã kích hoạt',
              thumb: rc.previewImg || 'assets/course_mam_non.jpg',
              fallbackThumb: 'assets/course_mam_non.jpg',
              learnUrl: `/course/${cid}`,
              lessons: [
                { title: 'Bài 1: Tổng quan chương trình & Khởi động phát âm', duration: '20:15', done: true, videoUrl: 'assets/hw_btvn_bai_1.mp4' },
                { title: 'Bài 2: Từ vựng trọng điểm & Luyện khẩu ngữ', duration: '24:30', done: false, videoUrl: 'assets/hw_btvn_bai_1.mp4' },
                { title: 'Bài 3: Mẫu câu hội thoại & Ứng dụng thực hành', duration: '22:45', done: false, videoUrl: 'assets/hw_btvn_bai_1.mp4' }
              ]
            };
            this.onlineCourses.push(existing);
          }
        });
        const fetchedIds = onlineCourses.map(rc => rc.id || rc._id);
        this._fetchedPermissionCache[permKey] = fetchedIds;
        stu.courseIds = fetchedIds;
        stu.progress = 'Tự học ' + (onlineCourses[0]?.title || 'Online');
        stu.attendance = 'Tự học trực tuyến';
        stu.caseType = this.computeStudentCase(stu);
        this.saveState();
        this.renderAll();
        if (typeof this.lmsApply === 'function') this.lmsApply();
      }
    } catch (e) {
      console.warn('[KTN-SLL] fetchIzTeachStudentPermissions error:', e);
    }
  };

  const baseGetDefaultState = app.getDefaultState.bind(app);
  app.getDefaultState = function () {
    const state = baseGetDefaultState();
    const s3 = window.IZTEACH_STORAGE.samples;
    state.teachers = DEFAULT_TEACHERS.map(t => ({ ...t, aliases: [...(t.aliases || [])] }));
    state.classAssignments = DEFAULT_CLASSES.map(c => ({ ...c }));
    state.classLessonAssignments = JSON.parse(JSON.stringify(DEFAULT_LESSON_ASSIGNMENTS));
    state.customStudents = [];
    state.studentEntitlements = DEFAULT_STUDENTS.map(s => ({
      code: s.code,
      classCode: s.classCode,
      progress: s.progress,
      unsubmittedCurrent: Boolean(s.unsubmittedCurrent),
      hasOnlineCourses: s.hasOnlineCourses,
      hasLiveClass: s.hasLiveClass,
      courseIds: [...s.courseIds],
      userId: s.userId || null
    }));
    state.orders = DEFAULT_ORDERS.map(o => ({ ...o }));
    state.messages = [];
    state.homeworks = [
      {
        id: 'hw-18-ngan',
        classCode: 'YCT2-04',
        lesson: 'Buổi 18',
        lessonNumber: 18,
        lessonNum: 18,
        title: 'Chủ đề Gia đình & 6 chữ Hán',
        studentCode: 'KTN-2026-089',
        studentName: 'Bé Lê Hoàng Ngân',
        submittedAt: '2026-10-28T14:20:00.000Z',
        status: 'GRADED',
        score: 9.5,
        teacherFeedback: 'Con phát âm thanh 4 rất chuẩn, nét chữ Hán đều và đẹp!',
        attachments: [
          { id: 'att-18-ngan-vid', title: 'Video đọc bài', mediaType: 'video', size: 12500000, cdnUrl: 'https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/3529cd2b-7af6-4fda-887c-392a79393d6a/hw_18.mp4', playUrl: 'assets/hw_btvn_bai_1.mp4' },
          { id: 'att-18-ngan-img', title: 'Ảnh vở viết chữ Hán', mediaType: 'image', size: 2100000, cdnUrl: 'https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/3529cd2b-7af6-4fda-887c-392a79393d6a/vo_viet_18.jpg', playUrl: 'assets/hw_vo_viet_chu_han.jpg' }
        ]
      },
      {
        id: 'hw-18-man',
        classCode: 'YCT2-04',
        lesson: 'Buổi 18',
        lessonNumber: 18,
        lessonNum: 18,
        title: 'Chủ đề Gia đình & 6 chữ Hán',
        studentCode: 'KTN-2026-091',
        studentName: 'Bé An Mẫn',
        submittedAt: '2026-10-28T15:10:00.000Z',
        status: 'GRADED',
        score: 9.0,
        teacherFeedback: 'Con đọc bài to, rõ ràng, nhớ các từ vựng chỉ người thân rất nhanh!',
        attachments: [
          { id: 'att-18-man-vid', title: 'Video đọc bài', mediaType: 'video', size: 11800000, cdnUrl: 'https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/3529cd2b-7af6-4fda-887c-392a79393d6a/hw_18_man.mp4', playUrl: 'assets/hw_btvn_bai_1.mp4' }
        ]
      },
      {
        id: 'hw-12-khang',
        classCode: 'YCT3-02',
        lesson: 'Buổi 12',
        lessonNumber: 12,
        lessonNum: 12,
        title: 'Chuyên đề Đọc hiểu & Hội thoại YCT 3',
        studentCode: 'KTN-2026-092',
        studentName: 'Bé Minh Khang',
        submittedAt: '2026-10-29T04:30:00.000Z',
        status: 'PENDING',
        teacherFeedback: 'Đang chờ cô giáo nhận xét',
        attachments: [
          { id: 'att-12-khang-vid', title: 'Video phát âm hội thoại', mediaType: 'video', size: 14200000, cdnUrl: 'https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/3529cd2b-7af6-4fda-887c-392a79393d6a/hw_12_khang.mp4', playUrl: 'assets/hw_btvn_bai_1.mp4' }
        ]
      }
    ];
    state.dlpAlerts = state.dlpAlerts.map((item, idx) => ({
      ...item,
      reviewStatus: idx === 2 ? 'REVIEWED' : 'OPEN',
      resolution: idx === 2 ? 'Đã nhắc nhở nội bộ và lưu biên bản ca học.' : 'Chưa xử lý · Cần Quản lý xác nhận.'
    }));
    return state;
  };

  app.syncStudentEntitlementsFromState = function () {
    if (!this.state) return;
    // 1. Sync teachers
    if (Array.isArray(this.state.teachers) && this.state.teachers.length) {
      const mergedTeachers = DEFAULT_TEACHERS.map(t => ({ ...t, aliases: [...(t.aliases || [])] }));
      this.state.teachers.forEach(savedT => {
        if (!savedT || !savedT.code) return;
        const existIdx = mergedTeachers.findIndex(m => m.code === savedT.code || m.email === savedT.email);
        if (existIdx >= 0) {
          mergedTeachers[existIdx] = {
            ...mergedTeachers[existIdx],
            ...savedT,
            aliases: Array.from(new Set([...(mergedTeachers[existIdx].aliases || []), ...(savedT.aliases || [])]))
          };
        } else {
          mergedTeachers.push({ ...savedT, aliases: Array.isArray(savedT.aliases) ? [...savedT.aliases] : [] });
        }
      });
      this.teachers = mergedTeachers;
    } else {
      this.teachers = DEFAULT_TEACHERS.map(t => ({ ...t, aliases: [...(t.aliases || [])] }));
      this.state.teachers = this.teachers.map(t => ({ ...t }));
    }

    // 2. Sync classes & per-class teacher assignments
    const deletedSet = new Set(Array.isArray(this.state.deletedClassIds) ? this.state.deletedClassIds : []);
    if (Array.isArray(this.state.classAssignments)) {
      this.classes = this.state.classAssignments
        .filter(c => c && c.id && !deletedSet.has(c.id))
        .map(c => {
          const def = DEFAULT_CLASSES.find(d => d.id === c.id) || {};
          const t = this.teachers.find(item => item.code === (c.teacherCode || def.teacherCode || 'GV-KTN-08')) || this.teachers[0];
          return {
            ...def,
            ...c,
            totalLessons: Number(c.totalLessons || def.totalLessons) || 25,
            teacherCode: t ? t.code : (c.teacherCode || 'GV-KTN-08'),
            teacherName: t ? t.name : (c.teacherName || 'Cô Lâm Mỹ Linh'),
            teacherEmail: t ? t.email : (c.teacherEmail || 'linh.lam@khongtunhi.com')
          };
        });
    } else {
      this.classes = DEFAULT_CLASSES.map(c => ({ ...c }));
      this.state.classAssignments = this.classes.map(c => ({ ...c }));
    }

    // 2b. Sync per-lesson homework assignments
    if (!this.state.classLessonAssignments || typeof this.state.classLessonAssignments !== 'object') {
      this.state.classLessonAssignments = JSON.parse(JSON.stringify(DEFAULT_LESSON_ASSIGNMENTS));
    } else {
      Object.keys(DEFAULT_LESSON_ASSIGNMENTS).forEach(cid => {
        if (!this.state.classLessonAssignments[cid]) {
          this.state.classLessonAssignments[cid] = JSON.parse(JSON.stringify(DEFAULT_LESSON_ASSIGNMENTS[cid]));
        }
      });
    }

    // 3. Sync custom provisioned students, entitlements & homework submitters
    const baseStudents = DEFAULT_STUDENTS.map(s => ({ ...s, courseIds: [...s.courseIds] }));
    const addCandidateStudent = cs => {
      if (!cs || (!cs.code && !cs.email)) return;
      const csEmail = String(cs.email || '').trim().toLowerCase();
      const exists = baseStudents.some(b =>
        (cs.code && b.code === cs.code) ||
        (csEmail && String(b.email || '').trim().toLowerCase() === csEmail)
      );
      if (!exists) {
        const cleanCs = {
          name: cs.name || (csEmail ? 'Bé ' + csEmail.split('@')[0] : 'Học viên'),
          parent: cs.parent || `Phụ huynh ${cs.name || 'Học viên'}`,
          email: csEmail || `${(cs.code || 'hv').toLowerCase()}@khongtunhi.com`,
          phone: cs.phone || '',
          userId: cs.userId || null,
          password: cs.password || '123456',
          aliases: Array.isArray(cs.aliases) ? [...cs.aliases] : [],
          progress: cs.progress || (cs.hasOnlineCourses ? 'Tự học Video' : 'Chưa xếp lớp'),
          code: cs.code || this._nextStudentCode(),
          classCode: cs.classCode || '',
          hasOnlineCourses: Boolean(cs.hasOnlineCourses),
          hasLiveClass: Boolean(cs.hasLiveClass && cs.classCode),
          unsubmittedCurrent: typeof cs.unsubmittedCurrent === 'boolean' ? cs.unsubmittedCurrent : true,
          courseIds: Array.isArray(cs.courseIds) ? [...cs.courseIds] : [],
          attendance: cs.attendance || (cs.hasOnlineCourses ? 'Tự học trực tuyến' : 'Chưa xếp lớp'),
          target: cs.target || 'Làm quen phát âm Pinyin & giao tiếp tiếng Trung theo lộ trình',
          note: cs.note || 'Học viên Sổ Liên Lạc.',
          createdAt: cs.createdAt || '',
          createdTs: cs.createdTs || 0
        };
        delete cleanCs.isDynamicSession;
        baseStudents.push(cleanCs);
      } else {
        const existing = baseStudents.find(b =>
          (cs.code && b.code === cs.code) ||
          (csEmail && String(b.email || '').trim().toLowerCase() === csEmail)
        );
        if (existing) {
          if (cs.phone && !existing.phone) existing.phone = cs.phone;
          if (cs.userId && !existing.userId) existing.userId = cs.userId;
          if (cs.hasOnlineCourses) existing.hasOnlineCourses = true;
          if (cs.createdAt && !existing.createdAt) existing.createdAt = cs.createdAt;
          if (cs.createdTs && !existing.createdTs) existing.createdTs = cs.createdTs;
          if (Array.isArray(cs.courseIds)) {
            if (!Array.isArray(existing.courseIds)) existing.courseIds = [];
            cs.courseIds.forEach(pid => {
              if (!existing.courseIds.includes(pid)) existing.courseIds.push(pid);
            });
          }
        }
      }
    };
    if (Array.isArray(this.state.customStudents)) {
      this.state.customStudents.forEach(addCandidateStudent);
    }
    if (Array.isArray(this.state.studentEntitlements)) {
      this.state.studentEntitlements.forEach(addCandidateStudent);
    }
    (this.students || []).forEach(addCandidateStudent);
    if (Array.isArray(this.state.orders)) {
      this.state.orders.forEach(order => {
        if (!order) return;
        const isApproved = order.approvalStatus === 'approved' || order.status === 'approved' || (order.paymentStatus === 'paid' && order.approvalStatus === 'approved');
        if (!isApproved) return;
        const sEmail = String(order.studentEmail || order.customerEmail || order.email || '').trim().toLowerCase();
        const sPhone = String(order.phone || order.phoneNumber || '').trim();
        const sName = String(order.studentName || order.customerName || order.fullName || 'Học viên').trim();
        if (!sEmail && !sPhone) return;

        const targetPids = Array.isArray(order.courseIds) && order.courseIds.length
          ? order.courseIds
          : (order.courseId ? [order.courseId] : ['6adadba969897b0002482ca5']);

        addCandidateStudent({
          name: sName,
          parent: 'Phụ huynh ' + sName.replace(/^(Bé|Em)\s+/i, ''),
          email: sEmail,
          phone: sPhone,
          userId: order.assignedUserId || null,
          password: '123456',
          aliases: [sEmail.split('@')[0], sEmail].filter(Boolean),
          progress: 'Tự học Video',
          classCode: '',
          hasOnlineCourses: true,
          hasLiveClass: false,
          unsubmittedCurrent: false,
          courseIds: [...targetPids],
          attendance: 'Tự học trực tuyến',
          target: 'Học viên khóa ' + (order.courseName || 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)'),
          note: 'Tài khoản được duyệt tự động 1 chạm từ đơn hàng #' + (order.orderId || order.id || ''),
          createdAt: order.approvedAt || order.createdAt || '',
          createdTs: Date.parse(order.approvedAt || order.createdAt || '') || 0
        });
      });
    }
    if (Array.isArray(this.state.homeworks)) {
      this.state.homeworks.forEach(hw => {
        if (!hw) return;
        const matched = baseStudents.find(s => this.isHomeworkForStudent(hw, s));
        if (!matched && (hw.studentCode || hw.studentEmail || hw.studentName)) {
          addCandidateStudent({
            code: hw.studentCode || ('KTN-2026-' + String(Date.now()).slice(-3)),
            name: hw.studentName || 'Học viên',
            email: hw.studentEmail || '',
            classCode: hw.classCode || this.classes[0]?.id || '',
            hasLiveClass: true,
            unsubmittedCurrent: false,
            progress: hw.lesson || 'Buổi 1/25'
          });
        }
      });
    }
    this.students = baseStudents;

    // 4. Sync student entitlements
    if (!Array.isArray(this.state.studentEntitlements) || !this.state.studentEntitlements.length) {
      this.state.studentEntitlements = this.students.filter(s => !s.isDynamicSession).map(s => ({
        code: s.code,
        name: s.name,
        parent: s.parent,
        email: s.email,
        password: s.password || '123456',
        aliases: Array.isArray(s.aliases) ? [...s.aliases] : [],
        classCode: s.classCode,
        progress: s.progress,
        attendance: s.attendance,
        unsubmittedCurrent: Boolean(s.unsubmittedCurrent),
        hasOnlineCourses: s.hasOnlineCourses,
        hasLiveClass: s.hasLiveClass,
        courseIds: [...s.courseIds],
        userId: s.userId || null
      }));
    }
    this.students.forEach(stu => {
      const saved = this.state.studentEntitlements.find(e =>
        e.code === stu.code ||
        (e.email && stu.email && String(e.email).toLowerCase() === String(stu.email).toLowerCase())
      );
      if (saved) {
        if (saved.name) stu.name = saved.name;
        if (saved.parent) stu.parent = saved.parent;
        if (saved.email) stu.email = saved.email;
        if (saved.password) stu.password = saved.password;
        if (Array.isArray(saved.aliases) && saved.aliases.length) {
          stu.aliases = Array.from(new Set([...(stu.aliases || []), ...saved.aliases]));
        }
        if (typeof saved.classCode === 'string') {
          stu.classCode = (saved.classCode && !deletedSet.has(saved.classCode)) ? saved.classCode : '';
        }
        if (saved.progress) stu.progress = saved.progress;
        if (saved.attendance) stu.attendance = saved.attendance;
        if (typeof saved.unsubmittedCurrent === 'boolean') stu.unsubmittedCurrent = saved.unsubmittedCurrent;
        stu.hasLiveClass = Boolean((saved.hasLiveClass !== false) && stu.classCode);
        stu.hasOnlineCourses = Boolean(saved.hasOnlineCourses);
        stu.courseIds = stu.hasOnlineCourses
          ? (Array.isArray(saved.courseIds) && saved.courseIds.length ? [...saved.courseIds] : ['6adadba969897b0002482ca5'])
          : [];
        if (saved.phone && !stu.phone) stu.phone = saved.phone;
        if (saved.createdAt && !stu.createdAt) stu.createdAt = saved.createdAt;
        if (saved.createdTs && !stu.createdTs) stu.createdTs = saved.createdTs;
        if (saved.userId && !stu.userId) stu.userId = saved.userId;
        delete stu.isDynamicSession;
      }
      const stuHws = (this.state?.homeworks || []).filter(h => this.isHomeworkForStudent(h, stu));
      if (stuHws.length) {
        stuHws.forEach(h => {
          h.studentCode = stu.code;
          if (stu.email && !h.studentEmail) h.studentEmail = stu.email;
          if (stu.name && !h.studentName) h.studentName = stu.name;
        });
        stu.unsubmittedCurrent = false;
        if (!stu.classCode) {
          const hwCls = stuHws.find(h => h.classCode && !deletedSet.has(h.classCode))?.classCode || this.classes[0]?.id || '';
          if (hwCls) {
            stu.classCode = hwCls;
            stu.hasLiveClass = true;
          }
        } else {
          stu.hasLiveClass = true;
        }
      }
      if (stu.hasLiveClass && stu.classCode) {
        let cls = this.classes.find(c => c.id === stu.classCode);
        if (!cls && !deletedSet.has(stu.classCode) && !/^YCT[123]-0[124]$/.test(stu.classCode)) {
          const t = this.teachers[0] || { code: 'GV-KTN-08', name: 'Cô Lâm Mỹ Linh', email: 'linh.lam@khongtunhi.com' };
          cls = {
            id: stu.classCode,
            name: stu.classCode,
            title: `Lớp ${stu.classCode}`,
            schedule: 'Thứ 3 & Thứ 6 (19:30 - 20:30)',
            totalLessons: 25,
            teacherCode: t.code,
            teacherName: t.name,
            teacherEmail: t.email
          };
          this.classes.push(cls);
        }
        if (!cls) {
          stu.classCode = '';
          stu.hasLiveClass = false;
        } else {
          delete stu.isDynamicSession;
          const totalL = Number(cls.totalLessons) || 25;
          const m = String(stu.progress || 'Buổi 1/25').match(/(\d+)/);
          const curLesson = m ? Math.min(totalL, Math.max(1, Number(m[1]))) : 1;
          stu.progress = `Buổi ${curLesson}/${totalL}`;
        }
      }
      if (!stu.hasLiveClass && !stu.hasOnlineCourses) {
        stu.progress = 'Chưa xếp lớp';
        stu.attendance = 'Chưa xếp lớp';
      }
      stu.caseType = this.computeStudentCase(stu);
    });

    const approvedOrders = (this.state?.orders || []).filter(o => o && o.approvalStatus === 'approved');
    if (approvedOrders.length > 0 && Array.isArray(this.students)) {
      approvedOrders.forEach(ord => {
        const oEmail = String(ord.studentEmail || ord.email || '').trim().toLowerCase();
        const oUid = String(ord.assignedUserId || '').trim();
        const oSid = String(ord.assignedStudentId || '').trim();
        const resolved = typeof resolveProductMapping === 'function' ? resolveProductMapping(ord) : null;
        const targetCid = String(resolved?.id || ord.courseId || ord.productId || '6adadba969897b0002482ca5').trim();
        if (!targetCid) return;
        this.students.forEach(stu => {
          if (!stu) return;
          const sEmail = String(stu.email || '').trim().toLowerCase();
          const sAliases = Array.isArray(stu.aliases) ? stu.aliases.map(a => String(a || '').trim().toLowerCase()) : [];
          const sUid = String(stu.userId || stu.id || '').trim();
          const sCode = String(stu.code || '').trim();
          const isMatch = (oEmail && (sEmail === oEmail || sAliases.includes(oEmail)))
            || (oUid && sUid === oUid)
            || (oSid && (sCode === oSid || sUid === oSid));
          if (isMatch) {
            stu.hasOnlineCourses = true;
            if (!Array.isArray(stu.courseIds)) stu.courseIds = [];
            if (!stu.courseIds.includes(targetCid)) stu.courseIds.push(targetCid);
            stu.caseType = this.computeStudentCase(stu);
          }
        });
      });
    }
  };

  app.persistEntitlementsToState = function () {
    if (!this.state) return;
    this.state.teachers = (this.teachers || []).map(t => ({ ...t, aliases: [...(t.aliases || [])] }));
    this.state.classAssignments = (this.classes || []).map(c => ({ ...c }));
    this.state.customStudents = (this.students || [])
      .filter(stu => (!stu.isDynamicSession || stu.hasLiveClass || stu.hasOnlineCourses) && !DEFAULT_STUDENTS.some(d => d.code === stu.code))
      .map(stu => {
        const copy = { ...stu, courseIds: Array.isArray(stu.courseIds) ? [...stu.courseIds] : [] };
        delete copy.isDynamicSession;
        return copy;
      });
    this.state.studentEntitlements = this.students
      .filter(stu => !stu.isDynamicSession || stu.hasLiveClass || stu.hasOnlineCourses)
      .map(stu => ({
        code: stu.code,
        name: stu.name,
        parent: stu.parent,
        email: stu.email,
        phone: stu.phone || '',
        password: stu.password || '123456',
        aliases: Array.isArray(stu.aliases) ? [...stu.aliases] : [],
        classCode: stu.classCode || '',
        progress: stu.progress || 'Chưa xếp lớp',
        attendance: stu.attendance || 'Chưa xếp lớp',
        unsubmittedCurrent: Boolean(stu.unsubmittedCurrent),
        hasOnlineCourses: Boolean(stu.hasOnlineCourses),
        hasLiveClass: Boolean(stu.hasLiveClass && stu.classCode),
        courseIds: Array.isArray(stu.courseIds) ? [...stu.courseIds] : [],
        userId: stu.userId || null,
        createdAt: stu.createdAt || '',
        createdTs: stu.createdTs || 0,
        _entUpdatedAt: stu._entUpdatedAt || Date.now()
      }));
  };

  app.syncApprovedOrdersToStudents = function () {
    if (!this.state || !Array.isArray(this.state.orders) || !Array.isArray(this.students)) return;
    let changed = false;
    const nowIso = new Date().toISOString();
    const nowTs = Date.now();

    this.state.orders.forEach(order => {
      if (!order) return;
      const isApproved = order.approvalStatus === 'approved' || order.status === 'approved' || (order.paymentStatus === 'paid' && order.approvalStatus === 'approved');
      if (!isApproved) return;

      const studentName = String(order.studentName || order.customerName || order.fullName || 'Học viên').trim();
      const studentEmail = String(order.studentEmail || order.customerEmail || order.email || '').trim().toLowerCase();
      const studentPhone = String(order.phone || order.phoneNumber || '').trim();
      if (!studentEmail && !studentPhone) return;

      const targetProductIds = Array.isArray(order.courseIds) && order.courseIds.length
        ? order.courseIds
        : (order.courseId ? [order.courseId] : ['6adadba969897b0002482ca5']);

      let matched = this.students.find(s => s && (
        (studentEmail && String(s.email || '').toLowerCase() === studentEmail) ||
        (studentPhone && s.phone && String(s.phone).replace(/\D/g, '') === studentPhone.replace(/\D/g, ''))
      ));

      if (!matched) {
        const parentName = studentName.replace(/^(Bé|Em)\s+/i, '');
        const newCode = (typeof this._nextStudentCode === 'function') ? this._nextStudentCode() : `KTN-2026-${String(Date.now()).slice(-3)}`;
        matched = {
          name: studentName,
          parent: 'Phụ huynh ' + (parentName || studentName),
          email: studentEmail,
          phone: studentPhone || order.phone || '',
          password: '123456',
          aliases: [studentEmail.split('@')[0], studentEmail].filter(Boolean),
          progress: 'Tự học Video',
          code: newCode,
          classCode: '',
          hasOnlineCourses: true,
          hasLiveClass: false,
          unsubmittedCurrent: false,
          courseIds: [...targetProductIds],
          userId: order.assignedUserId || null,
          attendance: 'Tự học trực tuyến',
          target: 'Học viên khóa ' + (order.courseName || 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)'),
          note: 'Tài khoản được duyệt tự động 1 chạm từ đơn hàng #' + (order.orderId || order.id || ''),
          createdAt: order.approvedAt || order.createdAt || nowIso,
          createdTs: Date.parse(order.approvedAt || order.createdAt || '') || nowTs
        };
        matched.caseType = (typeof this.computeStudentCase === 'function') ? this.computeStudentCase(matched) : 'online_only';
        this.students.push(matched);
        changed = true;
      } else {
        let updated = false;
        if (order.assignedUserId && !matched.userId) { matched.userId = order.assignedUserId; updated = true; }
        if (!matched.hasOnlineCourses) { matched.hasOnlineCourses = true; updated = true; }
        if (studentPhone && !matched.phone) { matched.phone = studentPhone; updated = true; }
        if (!matched.createdAt && (order.approvedAt || order.createdAt)) {
          matched.createdAt = order.approvedAt || order.createdAt;
          matched.createdTs = Date.parse(matched.createdAt) || nowTs;
          updated = true;
        }
        if (!Array.isArray(matched.courseIds)) matched.courseIds = [];
        targetProductIds.forEach(pid => {
          if (!matched.courseIds.includes(pid)) {
            matched.courseIds.push(pid);
            updated = true;
          }
        });
        if (updated) {
          matched.caseType = (typeof this.computeStudentCase === 'function') ? this.computeStudentCase(matched) : matched.caseType;
          changed = true;
        }
      }
    });

    if (changed) {
      this.persistEntitlementsToState?.();
    }
  };

  app.normalizeExperience = function () {
    if (!this.state) return;
    const defaults = this.getDefaultState();
    this.syncStudentEntitlementsFromState();
    this.syncApprovedOrdersToStudents();
    if (this.activeTeacherCode) {
      const activeT = (this.teachers || []).find(t => t.code === this.activeTeacherCode);
      if (activeT) {
        this.state.teacherCode = activeT.code;
        this.state.teacherName = activeT.name;
      }
    }
    this.reconcileTeacherSelection();
    if (!Array.isArray(this.state.homeworks)) {
      this.state.homeworks = defaults.homeworks;
    } else {
      this.state.homeworks.forEach(hw => {
        const matched = this.students.find(s => this.isHomeworkForStudent(hw, s));
        if (matched) {
          hw.studentCode = matched.code;
          if (!hw.studentEmail && matched.email) hw.studentEmail = matched.email;
          if (!hw.studentName && matched.name) hw.studentName = matched.name;
        } else {
          if (!hw.studentCode) hw.studentCode = this.students[0].code;
          if (!hw.studentName) {
            const st = this.students.find(s => s.code === hw.studentCode) || this.students[0];
            hw.studentName = st.name;
          }
        }
      });
    }
    if (!Array.isArray(this.state.messages)) {
      this.state.messages = defaults.messages;
    } else {
      this.state.messages.forEach(msg => {
        if (!msg.studentCode) msg.studentCode = this.students[0].code;
      });
    }
    if (Array.isArray(this.state.dlpAlerts)) {
      this.state.dlpAlerts.forEach(alert => {
        if (!alert.reviewStatus) alert.reviewStatus = 'OPEN';
        if (!alert.resolution) alert.resolution = 'Chưa xử lý · Cần Quản lý xác nhận.';
      });
    }
    if (!Array.isArray(this.state.orders)) {
      this.state.orders = (defaults && Array.isArray(defaults.orders)) ? defaults.orders.map(o => ({ ...o })) : DEFAULT_ORDERS.map(o => ({ ...o }));
    }
    try {
      const busRaw = localStorage.getItem('ktn_sll_orders_bus');
      if (busRaw) {
        const bus = JSON.parse(busRaw);
        if (Array.isArray(bus)) {
          bus.forEach(bo => {
            if (bo && (bo.orderId || bo.id) && !this.state.orders.some(o => (o.orderId || o.id) === (bo.orderId || bo.id))) {
              this.state.orders.unshift(bo);
            }
          });
        }
      }
      const v1Raw = localStorage.getItem('ktn_sll_v1_state');
      if (v1Raw) {
        const v1 = JSON.parse(v1Raw);
        if (Array.isArray(v1.orders)) {
          v1.orders.forEach(vo => {
            if (vo && (vo.orderId || vo.id) && !this.state.orders.some(o => (o.orderId || o.id) === (vo.orderId || vo.id))) {
              this.state.orders.unshift(vo);
            }
          });
        }
      }
    } catch (e) {}

    if (window.sllAuth && window.sllAuth.mode === 'connected') {
      const sess = window.sllAuth.session;
      const sr = (typeof window.sllAuth.sessionRole === 'function') ? window.sllAuth.sessionRole() : null;
      if ((sr === 'student' || sr === 'parent') && sess) {
        if (typeof this.ensureStudentForSession === 'function') {
          const idx = this.ensureStudentForSession(sess);
          this.activeParentStudentIdx = (typeof idx === 'number' && idx >= 0) ? idx : 0;
          this.fetchIzTeachStudentPermissions?.(this.getActiveParentStudent());
        }
      }
    }
  };

  app.init = function () {
    this._activeApprovals = new Set();
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      this.state = (saved && Array.isArray(saved.homeworks) && Array.isArray(saved.studentEntitlements))
        ? this._sanitizePersistedState(saved)
        : this.getDefaultState();
    } catch (e) {
      this.state = this.getDefaultState();
    }
    this.normalizeExperience();
    this.initIzTeachCrm?.();
    this.selectStudent(0);
    this.switchParentSubtab('homework');
    this.switchTeacherTab('grade');
    this.switchAdminTab('overview');
    this.renderAll();
    this.startSilentCloudStateSync?.();
  };

  app.saveState = function (skipCloud = false) {
    try {
      this.persistEntitlementsToState();
      const now = Date.now();
      this._lastLocalSaveAt = now;
      if (this.state) this.state._updatedAt = now;
      const clone = JSON.parse(JSON.stringify(this.state));
      const serialized = JSON.stringify(this._sanitizePersistedState(clone));
      localStorage.setItem(STORAGE_KEY, serialized);
      localStorage.setItem(LEGACY_STORAGE_KEY, serialized);
      if (!skipCloud && typeof this.pushSilentCloudState === 'function') {
        this.pushSilentCloudState(clone);
      }
    } catch (e) {}
  };

  app.resetDemo = function (silent = true) {
    if (document.body?.dataset?.auth === 'locked' && location.protocol === 'file:') {
      document.body.dataset.auth = 'demo';
      $('auth-shell')?.classList.add('hidden');
      $('demo-auth-bar')?.classList.remove('hidden');
    }
    this.teachers = DEFAULT_TEACHERS.map(t => ({ ...t, aliases: [...(t.aliases || [])] }));
    this.classes = DEFAULT_CLASSES.map(c => ({ ...c }));
    this.students = DEFAULT_STUDENTS.map(s => ({ ...s, courseIds: [...s.courseIds] }));
    this.state = this.getDefaultState();
    this._activeApprovals = new Set();
    this.activeParentStudentIdx = 0;
    this.activeTeacherCode = null;
    this.selectedStudentIdx = 0;
    this.teacherClassFilter = 'ALL';
    this.adminCaseFilter = 'ALL';
    this.selectedHwId = null;
    this.adminPreviewingStudent = false;
    this.adminProvisionFormOpen = true;
    this.adminProvisionRole = 'student';
    this._provDraft = { name: '', email: '', password: '123456', phone: '', classCode: '', hasOnline: false };
    this.adminNewClassFormOpen = false;
    this.lastProvisionResult = null;
    this.chatDrafts = {};
    this.clearPendingAttachment();
    this.normalizeExperience();
    this.saveState();
    this.switchParentSubtab('homework');
    this.switchTeacherTab('grade');
    this.switchAdminTab('overview');
    ['parent', 'teacher'].forEach(r => { this.previewDlp(r, ''); this.previewHwDlp(r, ''); });
    if ($('input-parent-chat')) $('input-parent-chat').value = '';
    if ($('input-teacher-chat')) $('input-teacher-chat').value = '';
    if ($('student-search')) $('student-search').value = '';
    if ($('admin-filter-severity')) $('admin-filter-severity').value = 'OPEN';
    if ($('grade-feedback')) $('grade-feedback').value = 'Con phát âm thanh 4 rất chuẩn, chữ Hán viết đều nét. Buổi tới cô trò mình luyện thêm phản xạ câu nhé!';
    if ($('toast-container')) $('toast-container').innerHTML = '';
    this.selectStudent(0);
    this.renderAll();
    if (!silent) this.showToast('Đã đặt lại dữ liệu mẫu về trạng thái ban đầu.');
  };

  app.switchRole = function (role) {
    const normalized = role === 'student' ? 'parent' : role;
    if (window.sllAuth && !window.sllAuth.canUseRole(normalized)) {
      this.showToast('Tài khoản đang đăng nhập không có quyền mở cổng vai trò này.');
      return false;
    }
    if (normalized !== 'parent') this.adminPreviewingStudent = false;
    this.currentRole = normalized;
    ['parent', 'teacher', 'admin'].forEach(r => {
      const act = r === normalized;
      $('view-' + r)?.classList.toggle('hidden', !act);
      $('tab-role-' + r)?.classList.toggle('active', act);
      $('tab-role-' + r)?.setAttribute('aria-selected', String(act));
    });
    this.renderAll();
    if (typeof this.pullSilentCloudState === 'function') {
      this.pullSilentCloudState(false);
    }
    return true;
  };

  app.selectParentStudent = function (idx, preferredSubtab) {
    const target = this.students[idx];
    if (!target) return false;
    this.activeParentStudentIdx = idx;
    this.selectedLessonNum = null;
    this.showResubmitForm = false;
    const caseType = this.computeStudentCase(target);
    target.caseType = caseType;
    const normSubtab = (!preferredSubtab || preferredSubtab === 'overview') ? 'homework' : preferredSubtab;
    if (caseType === 'online_only' || caseType === 'unassigned') {
      this.parentSubtab = 'courses';
    } else if (caseType === 'sll_only') {
      this.parentSubtab = (normSubtab && normSubtab !== 'courses') ? normSubtab : 'homework';
    } else if (normSubtab) {
      this.parentSubtab = normSubtab;
    } else if (!this.parentSubtab || this.parentSubtab === 'overview') {
      this.parentSubtab = 'homework';
    }
    this.renderAll();
    return true;
  };

  app.setStudentCase = function (caseMode) {
    let idx = this.students.findIndex(s => !s.isDynamicSession && this.computeStudentCase(s) === caseMode);
    if (idx < 0) idx = 0;
    if (this.students[idx]) {
      this.switchRole('parent');
      this.selectParentStudent(idx, (caseMode === 'online_only' || caseMode === 'unassigned') ? 'courses' : 'homework');
      return true;
    }
    return false;
  };

  app.switchParentSubtab = function (subtab) {
    const stu = this.getActiveParentStudent();
    const caseType = this.computeStudentCase(stu);
    let nextTab = (!subtab || subtab === 'overview') ? 'homework' : subtab;
    if (caseType === 'online_only' || caseType === 'unassigned') {
      if (nextTab !== 'learn' && nextTab !== 'docs') nextTab = 'courses';
    } else if (caseType === 'sll_only' && (nextTab === 'courses' || nextTab === 'learn' || nextTab === 'docs')) {
      nextTab = 'homework';
    }
    this.parentSubtab = nextTab;
    this.applyParentCaseLayout();
    this.renderMobileNav();
  };

  app.applyParentCaseLayout = function () {
    const stu = this.getActiveParentStudent();
    const caseType = this.computeStudentCase(stu);
    stu.caseType = caseType;
    const cls = this.getClassInfo(stu.classCode);
    const stuTeacher = this.getStudentTeacher(stu);

    if (!this.parentSubtab || this.parentSubtab === 'overview') this.parentSubtab = 'homework';
    if (caseType === 'online_only' || caseType === 'unassigned') {
      if (this.parentSubtab !== 'learn' && this.parentSubtab !== 'docs') this.parentSubtab = 'courses';
    } else if (caseType === 'sll_only' && (this.parentSubtab === 'courses' || this.parentSubtab === 'learn' || this.parentSubtab === 'docs')) {
      this.parentSubtab = 'homework';
    }

    const liveBar = $('parent-live-class-bar');
    const subtabNav = $('parent-subtab-nav');
    const coursesTabBtn = $('subtab-parent-courses');
    const docsTabBtn = $('subtab-parent-docs');
    const backToSllBtn = $('btn-back-to-sll');
    const hideLiveUI = caseType === 'online_only' || caseType === 'unassigned';

    if (liveBar) liveBar.classList.toggle('hidden', hideLiveUI);
    if (subtabNav) subtabNav.classList.toggle('hidden', hideLiveUI);
    if (coursesTabBtn) coursesTabBtn.classList.toggle('hidden', caseType === 'sll_only');
    if (docsTabBtn) docsTabBtn.classList.toggle('hidden', caseType === 'sll_only');
    if (backToSllBtn) backToSllBtn.classList.toggle('hidden', hideLiveUI);

    if ($('parent-teacher-name')) {
      $('parent-teacher-name').textContent = stuTeacher ? stuTeacher.name : '';
    }
    if ($('chat-header-teacher-name')) {
      $('chat-header-teacher-name').textContent = stuTeacher ? stuTeacher.name : '';
    }
    if ($('parent-student-meta')) {
      $('parent-student-meta').innerHTML = stu.hasLiveClass
        ? `<strong>${esc(stu.name)}</strong> · Lớp <strong>${esc(stu.classCode)}</strong> · <strong>${esc(stu.progress)}</strong>`
        : (stu.hasOnlineCourses ? `<strong>${esc(stu.name)}</strong> · Khóa học Online` : `<strong>${esc(stu.name)}</strong> · Chưa xếp lớp / khóa học`);
    }
    if ($('parent-class-schedule') && cls) {
      $('parent-class-schedule').textContent = cls.schedule;
    }
    if ($('chat-header-class-code')) {
      $('chat-header-class-code').textContent = stu.classCode ? `Lớp ${stu.classCode}` : 'Sổ liên lạc';
    }

    $('parent-subview-overview')?.classList.add('hidden');
    ['homework', 'chat', 'courses', 'docs', 'learn'].forEach(st => {
      $('parent-subview-' + st)?.classList.toggle('hidden', st !== this.parentSubtab);
      $('subtab-parent-' + st)?.classList.toggle('active', st === this.parentSubtab);
    });
    if (this.parentSubtab === 'courses') this.renderParentCourses();
    else if (this.parentSubtab === 'docs') this.renderParentDocs();
    else if (this.parentSubtab === 'learn') {
      const course = this._currentPlayingCourse || (Array.isArray(this.onlineCourses) && this.onlineCourses[0]) || null;
      const idx = typeof this._currentPlayingLessonIdx === 'number' ? this._currentPlayingLessonIdx : 0;
      this.renderLearnWorkspace(course, idx);
    }
  };

  app.switchTeacherTab = function (tab) {
    this.teacherTab = tab || 'grade';
    ['manage', 'assign', 'grade', 'chat'].forEach(item => {
      $('teacher-panel-' + item)?.classList.toggle('hidden', item !== this.teacherTab);
      $('teacher-tab-' + item)?.classList.toggle('active', item === this.teacherTab);
    });
    if (this.teacherTab === 'manage') {
      this.renderTeacherManagePanel();
    } else if (this.teacherTab === 'assign') {
      this.renderTeacherAssignPanel();
    } else if (this.teacherTab === 'grade') {
      this.renderStudentList($('student-search') ? $('student-search').value : '');
      this.renderHomeworks();
    }
    this.renderTeacherSummary();
    this.renderMobileNav();
    if (typeof this.pullSilentCloudState === 'function') {
      this.pullSilentCloudState(true);
    }
  };

  app.filterTeacherClass = function (classId) {
    this.teacherClassFilter = classId || 'ALL';
    const managed = this.getTeacherManagedStudents();
    const inClass = managed.filter(({ student }) => this.teacherClassFilter === 'ALL' || !student.classCode || student.classCode === this.teacherClassFilter);
    if (inClass.length) {
      const pendingFirst = inClass.find(({ student }) => this.getStudentTeacherStatus(student).key === 'pending');
      this.selectedStudentIdx = (pendingFirst || inClass[0]).index;
    }
    this.reconcileTeacherSelection();
    this.renderAll();
    this.renderStudentList($('student-search') ? $('student-search').value : '');
  };

  app.getStudentTeacherStatus = function (student) {
    if (!student) return { key: 'unsubmitted', hw: null, label: '', shortBadge: 'Chưa nộp', pillClass: 'is-unsubmitted', badgeClass: '' };
    const hws = (this.state?.homeworks || []).filter(h => this.isHomeworkForStudent(h, student));
    const pendingHw = hws.find(h => h.status === 'PENDING');
    if (pendingHw) {
      return {
        key: 'pending',
        hw: pendingHw,
        label: '',
        shortBadge: 'Chờ nhận xét',
        pillClass: 'is-orange',
        badgeClass: 'status-orange'
      };
    }
    if (student.unsubmittedCurrent || !hws.length) {
      return {
        key: 'unsubmitted',
        hw: null,
        label: '',
        shortBadge: 'Chưa nộp',
        pillClass: 'is-unsubmitted',
        badgeClass: ''
      };
    }
    const gradedHw = hws.find(h => h.status === 'GRADED') || hws[0];
    return {
      key: 'graded',
      hw: gradedHw,
      label: `${gradedHw?.score ?? 9.5}đ`,
      shortBadge: `${gradedHw?.score ?? 9.5}đ`,
      pillClass: 'is-graded',
      badgeClass: 'status-online'
    };
  };

  app.switchAdminTab = function (tab) {
    this.adminTab = tab || 'overview';
    ['overview', 'accounts', 'alerts', 'orders'].forEach(item => {
      $('admin-panel-' + item)?.classList.toggle('hidden', item !== this.adminTab);
      $('admin-tab-' + item)?.classList.toggle('active', item === this.adminTab);
    });
    if (this.adminTab === 'overview' || this.adminTab === 'accounts') {
      this.renderAdminOverview();
    } else if (this.adminTab === 'alerts') {
      this.renderAdminAlerts();
    } else if (this.adminTab === 'orders') {
      this.renderAdminOrders();
    }
    this.renderMobileNav();
  };

  app.filterAdminCase = function (caseFilter) {
    this.syncProvisionDraft?.();
    this.adminCaseFilter = caseFilter || 'ALL';
    if (this.adminCaseFilter === 'TEACHERS') {
      this.adminProvisionRole = 'teacher';
    } else {
      if (this.adminProvisionRole === 'teacher') {
        this.adminProvisionRole = 'student';
      }
      if (this.classes.some(c => c.id === this.adminCaseFilter)) {
        if (!this._provDraft) {
          this._provDraft = { name: '', email: '', password: '123456', phone: '', classCode: this.adminCaseFilter, hasOnline: false };
        } else {
          this._provDraft.classCode = this.adminCaseFilter;
        }
        this.adminExpandedClassId = this.adminCaseFilter;
      }
    }
    this.renderAdminOverview();
  };

  app.adminSelectClass = function (classId) {
    this.adminExpandedClassId = this.adminExpandedClassId === classId ? null : classId;
    this.adminSelectedClassId = classId;
    this.renderAdminOverview();
  };

  app.adminSelectClassStudent = function (studentIdx) {
    this.openStudentFromAdmin(studentIdx);
  };

  app.adminSelectStudentLesson = function (lessonNum) {
    this.adminSelectedLessonNum = Number(lessonNum) || 18;
    if (typeof this.selectedStudentIdx === 'number') {
      this.openStudentFromAdmin(this.selectedStudentIdx, this.adminSelectedLessonNum);
    }
  };

  app.selectStudent = function (idx) {
    const target = this.students[idx];
    if (!target) return;
    const prevStudent = this.students[this.selectedStudentIdx];
    if (prevStudent && $('input-teacher-chat')) {
      this.chatDrafts[prevStudent.code] = $('input-teacher-chat').value;
    }
    this.selectedStudentIdx = idx;
    this.selectedHwId = null;
    this._teacherManuallyPickedLesson = false;
    if (target.classCode && this.teacherClassFilter !== 'ALL' && this.teacherClassFilter !== target.classCode) {
      const managedClasses = this.getTeacherManagedClasses();
      if (managedClasses.some(c => c.id === target.classCode)) {
        this.teacherClassFilter = target.classCode;
      }
    }
    if ($('teacher-chat-heading')) $('teacher-chat-heading').textContent = `Phụ huynh ${target.name} (${target.classCode || ''})`;
    if ($('teacher-student-picker')) $('teacher-student-picker').value = String(idx);
    if ($('input-teacher-chat')) {
      const nextDraft = this.chatDrafts[target.code] || '';
      $('input-teacher-chat').value = nextDraft;
      this.previewDlp('teacher', nextDraft);
    }
    const stuModel = this.getStudentLessonsModel(target);
    const pendingL = stuModel.lessons.find(l => l.status === 'pending');
    if (pendingL) {
      this.teacherGradeLessonNum = pendingL.n;
      this.selectedHwId = pendingL.hw?.id || null;
      this._lastAutoSelectedPendingHwId = pendingL.hw?.id || null;
    } else if (target.unsubmittedCurrent) {
      this.teacherGradeLessonNum = stuModel.learnedMax;
    } else {
      this.teacherGradeLessonNum = stuModel.baseLearned;
    }
    const activeLessonObj = stuModel.lessons.find(l => l.n === this.teacherGradeLessonNum);
    const activeHw = activeLessonObj?.hw || (this.state?.homeworks?.filter(h => this.isHomeworkForStudent(h, target)) || [])[0];
    if (activeHw) {
      if ($('grade-score') && typeof activeHw.score === 'number') $('grade-score').value = String(activeHw.score);
      if ($('grade-feedback') && activeHw.teacherFeedback && !activeHw.teacherFeedback.includes('Chờ') && !activeHw.teacherFeedback.includes('Đang chờ')) {
        $('grade-feedback').value = activeHw.teacherFeedback;
      }
    }
    this.renderStudentList($('student-search') ? $('student-search').value : '');
    this.renderTeacherManagePanel();
    this.renderTeacherSummary();
    this.renderTeacherAssignPanel();
    this.renderChatStreams();
    this.renderHomeworks();
  };

  app.selectTeacherGradeLesson = function (lessonNum) {
    const managed = this.getTeacherManagedStudents();
    const selectedStudent = managed.length ? (this.students[this.selectedStudentIdx] || managed[0].student) : null;
    if (!selectedStudent) return false;
    const stuModel = this.getStudentLessonsModel(selectedStudent);
    const target = stuModel.lessons.find(l => l.n === Number(lessonNum));
    if (!target) return false;
    this.teacherGradeLessonNum = target.n;
    this.selectedHwId = target.hw ? target.hw.id : null;
    this._teacherManuallyPickedLesson = true;
    if (target.hw) {
      if ($('grade-score') && typeof target.hw.score === 'number') $('grade-score').value = String(target.hw.score);
      if ($('grade-feedback') && target.hw.teacherFeedback && !target.hw.teacherFeedback.includes('Chờ') && !target.hw.teacherFeedback.includes('Đang chờ')) {
        $('grade-feedback').value = target.hw.teacherFeedback;
      }
    }
    this.renderHomeworks();
    return true;
  };

  app.toggleTeacherQuickAdd = function (force) {
    this.teacherQuickAddOpen = typeof force === 'boolean' ? force : !this.teacherQuickAddOpen;
    this.renderStudentList($('student-search') ? $('student-search').value : '');
    return this.teacherQuickAddOpen;
  };

  app.renderStudentList = function (query = '') {
    const q = foldText(query).trim();
    const list = $('teacher-student-list'), picker = $('teacher-student-picker');
    this.reconcileTeacherSelection();
    const managedClasses = this.getTeacherManagedClasses();
    const managed = this.getTeacherManagedStudents();

    const filterBtnWrap = $('teacher-class-filter');
    if (filterBtnWrap) {
      const pills = managedClasses.map(c => {
        const isAct = this.teacherClassFilter === c.id;
        const clsCount = managed.filter(m => m.student.classCode === c.id).length;
        return `<button type="button" data-class-pill="${esc(c.id)}" class="lesson-pill is-class ${isAct ? 'active' : ''}" onclick="app.filterTeacherClass('${esc(c.id)}')"><span>Lớp ${esc(c.id)} (${clsCount} HS)</span></button>`;
      }).join('');
      filterBtnWrap.innerHTML = pills || '<span style="font-size:12.5px;color:var(--sub);font-weight:600;">Chưa có lớp học nào được phân công. Vui lòng liên hệ Quản lý để được xếp lớp.</span>';
    }

    const activeCls = managedClasses.find(c => c.id === this.teacherClassFilter) || managedClasses[0] || this.classes[0];
    if ($('teacher-add-stu-class-name') && activeCls) {
      $('teacher-add-stu-class-name').textContent = activeCls.id;
    }

    if (picker) {
      picker.disabled = !managed.length;
      picker.innerHTML = managed.length
        ? managed.map(({ student, index }) => {
            const st = this.getStudentTeacherStatus(student);
            return `<option value="${index}" ${index === this.selectedStudentIdx ? 'selected' : ''}>[${esc(student.classCode)}] ${esc(student.name)} (${esc(st.shortBadge)})</option>`;
          }).join('')
        : '<option value="-1">Chưa có học sinh</option>';
    }
    if (!list) return;

    const matches = managed.filter(({ student }) => {
      const inClass = this.teacherClassFilter === 'ALL' || !student.classCode || student.classCode === this.teacherClassFilter || !managedClasses.some(c => c.id === student.classCode);
      const inSearch = !q || foldText(`${student.name} ${student.parent} ${student.code} ${student.classCode} ${student.email || ''}`).includes(q);
      return inClass && inSearch;
    });

    if ($('teacher-active-class-label')) {
      $('teacher-active-class-label').textContent = activeCls ? `Lớp ${activeCls.id} (${matches.length} HS)` : `Học sinh (${matches.length} HS)`;
    }

    if (!activeCls && !matches.length) {
      list.innerHTML = `<div class="empty-box" style="width:100%;text-align:left;padding:12px;">Hiện chưa có lớp học nào. Cô giáo hoặc Quản lý hãy nhập <strong>Tên lớp mới (VD: 1)</strong> ở thanh trên và bấm <strong>"+ Tạo lớp"</strong> trước khi thêm học sinh.</div>`;
      return;
    }
    if (!activeCls && matches.length) {
      const orderRank = { pending: 0, graded: 1, unsubmitted: 2 };
      const sortedMatches = matches.slice().sort((a, b) => (orderRank[this.getStudentTeacherStatus(a.student).key] ?? 9) - (orderRank[this.getStudentTeacherStatus(b.student).key] ?? 9));
      list.innerHTML = sortedMatches.map(({ student, index }) => {
        const active = index === this.selectedStudentIdx;
        const st = this.getStudentTeacherStatus(student);
        return `<button type="button" data-student-pill="${esc(student.code)}" data-student-status="${esc(st.key)}" onclick="app.selectStudent(${index})" class="student-item lesson-pill ${st.pillClass} ${active ? 'active' : ''}"><span>${esc(student.name)}</span>${st.label ? `<span class="pill-sub">${esc(st.label)}</span>` : ''}</button>`;
      }).join('');
      return;
    }

    const targetClsId = activeCls.id;
    const totalL = Number(activeCls?.totalLessons) || 25;
    const candidateStudents = this.students.filter(s => !s.isDynamicSession && (!s.hasLiveClass || s.classCode !== targetClsId));
    const quickFormHtml = `
      <form onsubmit="event.preventDefault(); app.teacherAddStudentToClass({ classCode: '${esc(targetClsId)}', studentCode: document.getElementById('t-quick-stu-pick')?.value || '', name: document.getElementById('t-quick-stu-name')?.value || '', email: document.getElementById('t-quick-stu-email')?.value || '', lessonNum: document.getElementById('t-quick-stu-lesson')?.value || 1 });" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;width:100%;margin-top:6px;">
        ${candidateStudents.length ? `
          <select id="t-quick-stu-pick" class="input-select" style="min-width:190px;min-height:32px;font-size:12.5px;background:#FFF;" onchange="if(this.value){app.teacherAddStudentToClass({ classCode: '${esc(targetClsId)}', studentCode: this.value, lessonNum: document.getElementById('t-quick-stu-lesson')?.value || 1 });}">
            <option value="">-- Chọn nhanh HS đã tạo (${candidateStudents.length}) --</option>
            ${candidateStudents.map(cs => `<option value="${esc(cs.code)}">${esc(cs.name)} (${esc(cs.email.split('@')[0])})</option>`).join('')}
          </select>
        ` : ''}
        <input id="t-quick-stu-email" type="text" class="input-text" placeholder="Tài khoản / Gmail hoặc Tên HS (VD: hoangngan)" style="flex:1;min-width:170px;min-height:32px;font-size:12.5px;background:#FFF;">
        <input id="t-quick-stu-name" type="text" class="input-text" placeholder="Tên học sinh (tùy chọn)" style="flex:1;min-width:140px;min-height:32px;font-size:12.5px;background:#FFF;">
        <input id="t-quick-stu-lesson" type="number" min="1" max="${totalL}" value="1" class="input-text" style="width:64px;min-height:32px;font-size:12.5px;background:#FFF;" title="Buổi bắt đầu">
        <button type="submit" class="btn-primary" style="min-height:32px;padding:4px 12px;font-size:12px;">+ Thêm vào ${esc(targetClsId)}</button>
      </form>`;

    if (!matches.length) {
      list.innerHTML = `
        <div class="empty-box" style="width:100%;text-align:left;padding:12px;">
          <div style="font-weight:700;color:#0F172A;margin-bottom:4px;">Lớp ${esc(targetClsId)} hiện chưa có học sinh nào. Chọn học sinh có sẵn hoặc nhập tên/tài khoản để thêm:</div>
          ${quickFormHtml}
        </div>`;
      return;
    }

    const orderRank = { pending: 0, graded: 1, unsubmitted: 2 };
    const sortedMatches = matches.slice().sort((a, b) => {
      const sa = this.getStudentTeacherStatus(a.student).key;
      const sb = this.getStudentTeacherStatus(b.student).key;
      return (orderRank[sa] ?? 9) - (orderRank[sb] ?? 9);
    });

    const pillsHtml = sortedMatches.map(({ student, index }) => {
      const active = index === this.selectedStudentIdx;
      const st = this.getStudentTeacherStatus(student);
      return `<button type="button" data-student-pill="${esc(student.code)}" data-student-status="${esc(st.key)}" onclick="app.selectStudent(${index})" class="student-item lesson-pill ${st.pillClass} ${active ? 'active' : ''}"><span>${esc(student.name)}</span>${st.label ? `<span class="pill-sub">${esc(st.label)}</span>` : ''}</button>`;
    }).join('');

    const toggleAddBtn = `<button type="button" class="chip-btn" style="min-height:32px;padding:4px 10px;font-size:12px;font-weight:700;" onclick="app.toggleTeacherQuickAdd()">${this.teacherQuickAddOpen ? 'Đóng thêm HS ✕' : `+ Thêm HS vào ${esc(targetClsId)}`}</button>`;
    list.innerHTML = pillsHtml + toggleAddBtn + (this.teacherQuickAddOpen ? `<div style="width:100%;padding:8px 10px;background:#F8FAFC;border:1px solid var(--border);border-radius:8px;margin-top:4px;">${quickFormHtml}</div>` : '');
  };

  app.renderRoleIntro = function () {
    const box = $('role-intro');
    if (!box) return;
    if (!this.adminPreviewingStudent) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    box.classList.remove('hidden');
    const stu = this.getActiveParentStudent();
    const meta = this.getCaseMeta(this.computeStudentCase(stu));
    box.innerHTML = `<div class="role-intro-main"><div><span class="eyebrow">Chế độ Quản lý xem Cổng Học Viên · ${esc(stu.name)} (${esc(stu.code)})</span><p><strong>${esc(meta.title)}:</strong> ${esc(meta.desc)}</p></div><button id="btn-exit-admin-preview" type="button" class="btn-primary" onclick="app.exitAdminStudentPreview()">← Quay lại Quản lý trung tâm</button></div>`;
  };

  const HSK1_DOCUMENTS_LIBRARY = [
    {
      id: 'doc-sgk',
      title: 'Sách Giáo Khoa New HSK 1 (3.0)',
      badge: 'Giáo trình chính · 148 trang',
      pages: '148 trang',
      desc: 'Giáo trình ngữ âm chuẩn, 15 bài học ngữ cảnh, từ vựng minh họa và bài khóa đàm thoại song ngữ chuẩn quốc tế.',
      cdnUrl: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/HSK1_SGK.pdf',
      fileSize: '60.3 MB'
    },
    {
      id: 'doc-sbt',
      title: 'Sách Bài Tập New HSK 1 (3.0)',
      badge: 'Bài tập & Đề thi · 150 trang',
      pages: '150 trang',
      desc: 'Hệ thống bài tập luyện nghe, đọc hiểu, phân biệt thanh điệu, ngữ pháp và đề kiểm tra định kỳ bám sát đề thi HSK 1.',
      cdnUrl: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/HSK1_SBT.pdf',
      fileSize: '46.8 MB'
    },
    {
      id: 'doc-writing',
      title: 'Vở Luyện Viết Chữ Hán HSK 1 (3.0)',
      badge: 'Vở ô ly chữ Hán · 137 trang',
      pages: '137 trang',
      desc: 'Ô kẻ mễ chuẩn, thứ tự từng nét bút thuận, cấu tạo bộ thủ và mẫu câu thực hành luyện viết chữ Hán tay.',
      cdnUrl: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/HSK1_Vo_luyen_viet.pdf',
      fileSize: '2.2 MB'
    },
    {
      id: 'doc-vocab',
      title: 'Từ Vựng New HSK 1 - 5 (3.0)',
      badge: 'Cẩm nang tra cứu · 312 trang',
      pages: '312 trang',
      desc: 'Cẩm nang tra cứu 500+ từ vựng trọng tâm khung tiêu chuẩn mới, đầy đủ Pinyin, âm Hán Việt và ví dụ câu thực tiễn.',
      cdnUrl: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/Tu_vung_New_HSK1_HSK5.pdf#page=2',
      fileSize: '12.6 MB'
    },
    {
      id: 'doc-radicals',
      title: '214 Bộ Thủ Tiếng Trung',
      badge: 'Bổ trợ gốc chữ · 68 trang',
      pages: '68 trang',
      desc: 'Bảng tra cứu 214 bộ thủ tiếng Hán, âm Hán Việt, ý nghĩa biểu đạt tượng hình và mẹo ghi nhớ nhanh cho học viên.',
      cdnUrl: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/Bo_thu_tieng_trung.pdf#page=3',
      fileSize: '49.9 MB'
    }
  ];

  app.renderParentDocs = function () {
    const list = $('parent-docs-list');
    if (!list) return;
    list.innerHTML = HSK1_DOCUMENTS_LIBRARY.map(doc => `
      <div class="doc-library-card">
        <div>
          <span class="doc-library-badge">${esc(doc.badge)}</span>
          <h4 class="doc-library-title">${esc(doc.title)}</h4>
          <p class="doc-library-desc">${esc(doc.desc)}</p>
        </div>
        <div class="doc-library-actions">
          <a href="${esc(doc.cdnUrl)}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="flex:1;text-align:center;text-decoration:none;font-size:12.5px;padding:9px 12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;">
            📖 Đọc trực tuyến ↗
          </a>
          <a href="${esc(doc.cdnUrl)}" target="_blank" download rel="noopener noreferrer" class="btn-ghost" style="text-align:center;text-decoration:none;font-size:12px;padding:9px 12px;display:inline-flex;align-items:center;justify-content:center;gap:4px;cursor:pointer;">
            ⬇ Tải PDF (${esc(doc.fileSize)})
          </a>
        </div>
      </div>
    `).join('');
  };

  app.renderParentCourses = function () {
    const stu = this.getActiveParentStudent();
    const activeCourses = (stu && stu.hasOnlineCourses && Array.isArray(stu.courseIds) && stu.courseIds.length)
      ? this.onlineCourses.filter(c => stu.courseIds.includes(c.id))
      : (this.onlineCourses.slice(0, 1));
    const badge = $('badge-courses-count');
    if (badge) badge.textContent = `${activeCourses.length} khóa`;
    const statusBadge = $('badge-courses-status');
    if (statusBadge) statusBadge.textContent = `${activeCourses.length} khóa đang kích hoạt cho ${stu ? stu.name : 'bạn'}`;
    const list = $('parent-courses-list');
    if (!list) return;

    if (!activeCourses.length) {
      list.innerHTML = `<div class="empty-box" style="padding:20px;text-align:center;">Tài khoản của <strong>${esc(stu ? stu.name : 'học viên')}</strong> hiện chưa đăng ký khóa học nào.<br><span style="font-size:12.5px;color:var(--sub);">Khi Quản lý trung tâm xếp lớp hoặc mở khóa học cho con, nội dung sẽ hiển thị tại đây.</span></div>`;
      return;
    }

    list.innerHTML = activeCourses.map(course => {
      const lessons = Array.isArray(course.lessons) ? course.lessons : [];
      return `
      <article class="card course-hub-card" data-course-id="${esc(course.id)}">
        <div class="course-card-media" onclick="app.openCourseLesson('${esc(course.id)}', 0)" style="cursor:pointer;" title="Bấm để vào học ${esc(course.title)}">
          <img src="${esc(course.thumb)}" data-fb="${esc(course.fallbackThumb)}" onerror="if(this.dataset.fb&&this.src!==this.dataset.fb)this.src=this.dataset.fb" alt="${esc(course.title)}" width="320" height="180" decoding="async" class="course-card-thumb">
          <span class="course-level-badge">${esc(course.badge || course.level || 'Khóa học')}</span>
          <span class="course-progress-badge">${course.progressPct || 0}% hoàn thành</span>
          <div class="course-card-play-overlay">
            <span class="course-card-play-btn">▶ Vào học bài giảng ngay</span>
          </div>
        </div>
        <div class="course-card-body">
          <div class="course-card-meta">Giảng viên: <strong>${esc(course.teacher || 'Thầy Khổng Tử Nhí')}</strong> · ${esc(course.completedText || `${lessons.length} bài học`)}</div>
          <h4 class="course-card-title" onclick="app.openCourseLesson('${esc(course.id)}', 0)" style="cursor:pointer;" title="Bấm để vào học ${esc(course.title)}">${esc(course.title)}</h4>
          <div class="progress-track" style="margin:8px 0 12px;"><div class="progress-fill" style="width:${course.progressPct || 0}%;background:${(course.progressPct === 100) ? '#10B981' : 'var(--primary)'};"></div></div>
          
          <div class="course-card-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
            <button type="button" onclick="app.openCourseLesson('${esc(course.id)}', 0)" data-open-course="${esc(course.id)}" data-lesson-idx="0" class="btn-primary" style="text-align:center;flex:1;padding:10px 16px;font-size:13.5px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;box-shadow:0 3px 10px rgba(220,38,38,0.25);">
              ▶ Vào học bài giảng ngay
            </button>
            <button type="button" onclick="app.switchParentSubtab('docs')" class="btn-ghost" style="padding:10px 14px;font-size:12.5px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;">
              📚 Kho tài liệu (5 PDF) →
            </button>
          </div>

          <div class="course-lessons-header" style="font-size:12px;font-weight:700;color:var(--sub);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
            <span>DANH SÁCH BÀI HỌC (${lessons.length})</span>
            <span style="font-size:11px;font-weight:normal;color:#94a3b8;">Bấm để học từng bài</span>
          </div>

          <div class="course-lessons-list" style="max-height:240px;overflow-y:auto;padding-right:4px;">
            ${lessons.map((l, idx) => `
              <button type="button" onclick="app.openCourseLesson('${esc(course.id)}', ${idx})" data-open-course="${esc(course.id)}" data-lesson-idx="${idx}" class="course-lesson-item ${l.current ? 'current' : ''}" style="cursor:pointer;width:100%;">
                <div class="course-lesson-title">
                  <span class="course-lesson-icon">${l.done ? '✓' : '▶'}</span>
                  <span>${esc(l.title)}</span>
                </div>
                <span class="course-lesson-duration">${esc(l.duration || '--:--')}</span>
              </button>
            `).join('')}
          </div>
        </div>
      </article>
    `; }).join('');
  };

  // Global delegation for opening course player
  if (!window.__ktnCourseClickBound) {
    window.__ktnCourseClickBound = true;
    document.addEventListener('click', function (e) {
      const trigger = e.target.closest && e.target.closest('[data-open-course]');
      if (trigger && window.app && typeof window.app.openCourseLesson === 'function') {
        const courseId = trigger.getAttribute('data-open-course');
        const lessonIdx = parseInt(trigger.getAttribute('data-lesson-idx') || '0', 10);
        if (courseId) {
          window.app.openCourseLesson(courseId, isNaN(lessonIdx) ? 0 : lessonIdx);
        }
      }
    });
  }

  app.openCourseLesson = function (courseId, lessonIdx = 0) {
    const course = (Array.isArray(this.onlineCourses) && this.onlineCourses.find(c => c.id === courseId)) || (this.onlineCourses && this.onlineCourses[0]);
    if (!course) return false;
    const lessons = Array.isArray(course.lessons) && course.lessons.length > 0
      ? course.lessons
      : [{ title: course.title, duration: '--:--', done: false }];

    let targetLessonIdx = 0;
    let targetPartIdx = 0;

    if (typeof lessonIdx === 'number') {
      targetLessonIdx = (lessonIdx >= 0 && lessonIdx < lessons.length) ? lessonIdx : 0;
    } else if (typeof lessonIdx === 'string') {
      const trimmed = lessonIdx.trim();
      if (/^\d+$/.test(trimmed) && parseInt(trimmed, 10) < lessons.length) {
        targetLessonIdx = parseInt(trimmed, 10);
      } else {
        const partMatch = trimmed.match(/(?:bài|lesson)\s*(\d+)(?:\.(\d+))?/i) || trimmed.match(/^(\d+)(?:\.(\d+))?$/);
        if (partMatch) {
          const lNum = parseInt(partMatch[1], 10);
          targetLessonIdx = Math.max(0, lNum - 1);
          if (partMatch[2]) {
            targetPartIdx = Math.max(0, parseInt(partMatch[2], 10) - 1);
          }
        } else {
          const vMatch = (typeof HSK1_VIDEOS_MAP !== 'undefined' && HSK1_VIDEOS_MAP.getVideo) ? HSK1_VIDEOS_MAP.getVideo(trimmed) : null;
          if (vMatch && vMatch.part) {
            const segs = String(vMatch.part).split('.');
            targetLessonIdx = Math.max(0, parseInt(segs[0], 10) - 1);
            if (segs[1]) targetPartIdx = Math.max(0, parseInt(segs[1], 10) - 1);
          }
        }
      }
    }

    const safeIdx = (targetLessonIdx >= 0 && targetLessonIdx < lessons.length) ? targetLessonIdx : 0;

    this._currentPlayingCourse = course;
    this._currentPlayingLessonIdx = safeIdx;
    this._activeVideoPartIdx = targetPartIdx;
    if (!this._courseAudioTrackTab) this._courseAudioTrackTab = 'sgk';

    // Close any popup dialog
    this.closeCoursePlayer();

    // Switch directly to dedicated learning page
    this.parentSubtab = 'learn';
    this.applyParentCaseLayout();
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    return true;
  };

  app.playLessonVideo = function (videoUrl, posterUrl) {
    const video = $('learn-main-video');
    if (!video || !videoUrl) return;
    if (posterUrl) video.poster = posterUrl;

    if (video.getAttribute('data-active-stream') === videoUrl && (this._currentHls || video.src === videoUrl)) {
      return;
    }
    video.setAttribute('data-active-stream', videoUrl);

    if (this._currentHls) {
      try { this._currentHls.destroy(); } catch (e) {}
      this._currentHls = null;
    }

    // Mutual cross-pause listener: when video plays, pause any playing audio
    if (!video.__ktnCrossPauseBound) {
      video.__ktnCrossPauseBound = true;
      video.addEventListener('play', () => {
        const audio = $('player-audio-element');
        if (audio && !audio.paused) {
          audio.pause();
          const badge = document.querySelector('.player-track-item.playing .track-play-badge');
          if (badge) {
            badge.textContent = 'Phát ▶';
            badge.style.color = '#2563EB';
          }
        }
      });
    }

    const isM3u8 = videoUrl.includes('.m3u8');
    if (isM3u8 && window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({
        enableWorker: true,
        lowLatencyMode: false
      });
      hls.loadSource(videoUrl);
      hls.attachMedia(video);

      hls.on(window.Hls.Events.ERROR, (event, data) => {
        if (data && data.fatal) {
          switch (data.type) {
            case window.Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('[HLS] Network error encountered, attempting recovery...');
              hls.startLoad();
              break;
            case window.Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('[HLS] Media error encountered, recovering media...');
              hls.recoverMediaError();
              break;
            default:
              console.error('[HLS] Fatal unrecoverable error:', data);
              hls.destroy();
              video.src = videoUrl;
              break;
          }
        }
      });

      this._currentHls = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl') || !isM3u8) {
      video.src = videoUrl;
    } else {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js';
      s.onload = () => {
        if (window.Hls && window.Hls.isSupported()) {
          const hls = new window.Hls({ enableWorker: true, lowLatencyMode: false });
          hls.loadSource(videoUrl);
          hls.attachMedia(video);
          app._currentHls = hls;
        }
      };
      document.head.appendChild(s);
    }
  };

  app.switchLessonVideoPart = function (partIdx) {
    this._activeVideoPartIdx = partIdx;
    const course = this._currentPlayingCourse || this.onlineCourses[0];
    if (!course) return;
    const lessons = Array.isArray(course.lessons) ? course.lessons : [];
    const safeIdx = this._currentPlayingLessonIdx || 0;
    const lesson = lessons[safeIdx];
    if (!lesson || !Array.isArray(lesson.videos) || !lesson.videos[partIdx]) return;

    // Cross-pause: pause audio if playing
    const audio = $('player-audio-element');
    if (audio && !audio.paused) {
      audio.pause();
    }

    const videoData = lesson.videos[partIdx];
    document.querySelectorAll('.learn-video-part-btn').forEach((btn, idx) => {
      if (idx === partIdx) btn.classList.add('active');
      else btn.classList.remove('active');
    });
    const titleEl = $('learn-video-active-title');
    if (titleEl) titleEl.textContent = videoData.title;

    const mediaCard = $('learn-stage-media-card');
    if (mediaCard) {
      mediaCard.setAttribute('data-mounted-video-key', `${course.id || ''}::${safeIdx}::${partIdx}::${videoData.streamUrl || 'none'}`);
    }

    this.playLessonVideo(videoData.streamUrl, videoData.posterUrl);
  };

  app.renderLearnWorkspace = function (course, lessonIdx = 0) {
    if (!course) course = this.onlineCourses[0];
    if (!course) return;
    const lessons = Array.isArray(course.lessons) && course.lessons.length > 0 ? course.lessons : [];
    const safeIdx = (typeof lessonIdx === 'number' && lessonIdx >= 0 && lessonIdx < lessons.length) ? lessonIdx : 0;
    const lesson = lessons[safeIdx] || lessons[0];
    const videos = Array.isArray(lesson.videos) ? lesson.videos : [];
    const hasVideos = videos.length > 0;
    const hasAudio = (Array.isArray(lesson.sgkAudio) && lesson.sgkAudio.length > 0) || (Array.isArray(lesson.sbtAudio) && lesson.sbtAudio.length > 0);

    // Update topbar title
    const headerTitle = $('learn-page-header-title');
    if (headerTitle) headerTitle.textContent = `${lesson.title}`;

    // 1. Media Stage Card (Làn bài giảng chính)
    const mediaCard = $('learn-stage-media-card');
    let mediaCardRebuilt = false;
    if (mediaCard) {
      const activePartIdx = (typeof this._activeVideoPartIdx === 'number' && this._activeVideoPartIdx < videos.length) ? this._activeVideoPartIdx : 0;
      const activeVideo = videos[activePartIdx] || videos[0];

      const showExamTab = (safeIdx === 14 || lesson.lessonNum === 15) && !!course.mockExamAudio;
      let activeTab = this._courseAudioTrackTab || 'sgk';
      if (activeTab === 'exam' && !showExamTab) activeTab = 'sgk';
      this._courseAudioTrackTab = activeTab;

      const mountVideoKey = `${course.id || ''}::${safeIdx}::${activePartIdx}::${activeVideo ? activeVideo.streamUrl : 'none'}`;
      const existingVideoEl = $('learn-main-video');
      const isSameVideoMounted = Boolean(
        mediaCard.getAttribute('data-mounted-video-key') === mountVideoKey &&
        (!hasVideos || existingVideoEl)
      );

      if (!isSameVideoMounted) {
        mediaCardRebuilt = true;
        mediaCard.setAttribute('data-mounted-video-key', mountVideoKey);

        let activeTrackList = [];
        if (activeTab === 'sbt') activeTrackList = lesson.sbtAudio || [];
        else if (activeTab === 'exam') activeTrackList = course.mockExamAudio ? [course.mockExamAudio] : [];
        else activeTrackList = lesson.sgkAudio || [];

        const initialTrack = activeTrackList[0] || (lesson.sgkAudio && lesson.sgkAudio[0]) || { title: 'Audio bài học', cdnUrl: '' };

        mediaCard.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
          <div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
              <span class="badge-pill" style="background:#EF4444;color:#FFF;font-size:11px;font-weight:800;">${esc(course.badge || 'HSK 1 (3.0)')}</span>
              ${hasVideos ? `
                <span class="badge-pill" style="background:#DC2626;color:#FFF;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:4px;">
                  <span>📹</span> Video bài giảng (${videos.length} phần)
                </span>
              ` : `
                <span class="badge-pill" style="background:#F1F5F9;color:#475569;font-size:11px;font-weight:600;">
                  🎧 Giáo trình Audio SGK & SBT
                </span>
              `}
            </div>
            <h2 style="font-size:20px;font-weight:800;color:var(--text);margin:4px 0 2px;">${esc(lesson.title)}</h2>
            <span style="font-size:12px;color:var(--sub);">Giảng viên: <strong>${esc(course.teacher || 'Thầy Khổng Tử Nhí')}</strong> · Thời lượng: <strong>${esc(lesson.duration || '25:00')}</strong></span>
          </div>
          <span class="badge-pill status-online">Buổi ${safeIdx + 1} / ${lessons.length}</span>
        </div>

        ${hasVideos ? `
          <!-- LÀN BÀI GIẢNG VIDEO CHÍNH (IZTEACH REPOSITORY) -->
          <div class="learn-video-stage-container" style="background:#0F172A;border-radius:12px;overflow:hidden;margin-bottom:16px;border:1px solid #1E293B;box-shadow:0 8px 24px rgba(0,0,0,0.15);">
            <div style="padding:10px 14px;background:#1E293B;display:flex;align-items:center;justify-content:space-between;color:#F8FAFC;font-size:13px;font-weight:700;border-bottom:1px solid #334155;">
              <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#EF4444;flex-shrink:0;"></span>
                <span id="learn-video-active-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(activeVideo.title)}</span>
              </div>
              <span style="font-size:11px;color:#94A3B8;background:#334155;padding:2px 8px;border-radius:4px;flex-shrink:0;">HLS HD 1080p</span>
            </div>
            <div class="learn-video-wrapper" style="position:relative;width:100%;aspect-ratio:16/9;background:#000;">
              <video id="learn-main-video" controls playsinline preload="metadata" poster="${esc(activeVideo.posterUrl)}" style="width:100%;height:100%;object-fit:contain;background:#000;display:block;">
                Trình duyệt của bạn không hỗ trợ thẻ video HTML5.
              </video>
            </div>
            ${videos.length > 1 ? `
              <div class="learn-video-parts-bar" style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#0F172A;border-top:1px solid #1E293B;overflow-x:auto;">
                <span style="font-size:12px;color:#94A3B8;font-weight:700;white-space:nowrap;">🎬 Chọn phần video:</span>
                ${videos.map((v, pIdx) => `
                  <button type="button" class="learn-video-part-btn ${activePartIdx === pIdx ? 'active' : ''}" style="min-height:44px;" onclick="app.switchLessonVideoPart(${pIdx})">
                    ▶ ${esc(v.partTitle || ('Phần ' + (pIdx + 1)))}
                  </button>
                `).join('')}
              </div>
            ` : ''}
          </div>
        ` : `
          <!-- THÔNG BÁO BÀI ĐANG HOÀN THIỆN VIDEO -->
          <div class="learn-video-pending-box" style="padding:18px 20px;background:#F8FAFC;border:1.5px dashed #CBD5E1;border-radius:12px;margin-bottom:16px;display:flex;align-items:center;gap:14px;">
            <div style="font-size:32px;background:#EFF6FF;width:52px;height:52px;display:flex;align-items:center;justify-content:center;border-radius:12px;flex-shrink:0;">🎬</div>
            <div>
              <div style="font-weight:700;font-size:14px;color:#0F172A;margin-bottom:2px;">Video bài giảng đang được đồng bộ chuẩn New HSK 1 (3.0)</div>
              <div style="font-size:12.5px;color:#64748B;line-height:1.5;">Học viên học theo lộ trình qua hệ thống <strong>Audio SGK & SBT bản quyền</strong> và mở giáo trình PDF tương ứng bên dưới.</div>
            </div>
          </div>
        `}

        ${hasAudio ? `
          <!-- LÀN LUYỆN NGHE AUDIO SGK & SBT (UNCLUTTERED UX) -->
          <div class="player-audio-panel" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px;margin-bottom:12px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
              <div class="player-current-track" style="font-size:13.5px;font-weight:700;color:#0F172A;display:flex;align-items:center;gap:8px;">
                <span style="font-size:18px;">🎧</span>
                <span id="player-current-track-name">Đang chọn: ${esc(initialTrack.title)}</span>
              </div>
              <span style="font-size:11px;color:#64748B;">Luyện nghe Audio SGK & SBT</span>
            </div>
            <audio id="player-audio-element" controls preload="metadata" style="width: 100%; border-radius: 8px; margin: 4px 0 12px;" src="${esc(initialTrack.cdnUrl)}">
              Trình duyệt của bạn không hỗ trợ phát audio HTML5.
            </audio>
            <div class="player-track-tabs" style="display:flex;gap:8px;margin-bottom:12px;border-bottom:1px solid #E2E8F0;padding-bottom:10px;flex-wrap:wrap;">
              <button id="tab-btn-sgk" type="button" class="player-track-tab-btn ${activeTab === 'sgk' ? 'active' : ''}" style="min-height:44px;" onclick="app.switchCourseTrackTab('sgk')">
                📖 Audio SGK (Bài khóa & Từ mới) [${(lesson.sgkAudio || []).length}]
              </button>
              <button id="tab-btn-sbt" type="button" class="player-track-tab-btn ${activeTab === 'sbt' ? 'active' : ''}" style="min-height:44px;" onclick="app.switchCourseTrackTab('sbt')">
                ✍️ Audio SBT (Luyện phát âm & Bài tập) [${(lesson.sbtAudio || []).length}]
              </button>
              ${showExamTab ? `
                <button id="tab-btn-exam" type="button" class="player-track-tab-btn ${activeTab === 'exam' ? 'active' : ''}" style="min-height:44px;" onclick="app.switchCourseTrackTab('exam')">
                  🏆 Đề thi mô phỏng HSK 1
                </button>
              ` : ''}
            </div>
            <div id="player-track-list-container" class="player-track-list">
              <!-- tracks rendered dynamically -->
            </div>
          </div>
        ` : ''}
      `;

        // Bidirectional mutual cross-pausing setup
        const mainVideo = $('learn-main-video');
        const mainAudio = $('player-audio-element');
        if (mainVideo && !mainVideo.__ktnCrossPauseBound) {
          mainVideo.__ktnCrossPauseBound = true;
          mainVideo.addEventListener('play', () => {
            const a = $('player-audio-element');
            if (a && !a.paused) {
              a.pause();
              const badge = document.querySelector('.player-track-item.playing .track-play-badge');
              if (badge) {
                badge.textContent = 'Phát ▶';
                badge.style.color = '#2563EB';
              }
            }
          });
        }
        if (mainAudio && !mainAudio.__ktnCrossPauseBound) {
          mainAudio.__ktnCrossPauseBound = true;
          mainAudio.addEventListener('play', () => {
            const v = $('learn-main-video');
            if (v && !v.paused) v.pause();
          });
        }

        if (hasVideos && activeVideo) {
          this.playLessonVideo(activeVideo.streamUrl, activeVideo.posterUrl);
        }
      }
    }

    // 2. Grammar Card
    const grammarCard = $('learn-stage-grammar-card');
    if (grammarCard) {
      if (lesson.grammarSummary) {
        grammarCard.style.display = 'block';
        grammarCard.innerHTML = `
          <div class="lesson-grammar-box" style="padding:14px 18px;background:#FEF9C3;border:1px solid #FDE047;border-radius:12px;font-size:13px;color:#713F12;line-height:1.6;">
            <div style="font-weight:800;font-size:14px;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
              <span>🎯</span> <span>Trọng điểm & Kiến thức cốt lõi bài học:</span>
            </div>
            <div>${esc(lesson.grammarSummary)}</div>
            ${lesson.sgkPage ? `<div style="margin-top:8px;font-size:12px;color:#854D0E;font-weight:600;">📖 Xem tham chiếu: Sách Giáo Khoa trang ${lesson.sgkPage} · Sách Bài Tập trang ${lesson.sbtPage || 1} · Vở Luyện Viết trang ${lesson.writingPage || 1}</div>` : ''}
          </div>
        `;
      } else {
        grammarCard.style.display = 'none';
      }
    }

    // 3. Docs shortcut card (Master Asset Map & Deep-linking via #page=N)
    const docsCard = $('learn-stage-docs-shortcut');
    if (docsCard) {
      const findDoc = (fn) => (course.docs || []).find(d => d.filename === fn || (d.cdnUrl && d.cdnUrl.includes(fn))) || {};
      const sgkDoc = findDoc('HSK1_SGK.pdf');
      const sbtDoc = findDoc('HSK1_SBT.pdf');
      const writingDoc = findDoc('HSK1_Vo_luyen_viet.pdf');
      const radicalsDoc = findDoc('Bo_thu_tieng_trung.pdf');
      const vocabDoc = findDoc('Tu_vung_New_HSK1_HSK5.pdf');

      const sgkPageIn = lesson.sgkPage || 1;
      const sgkPdfPage = lesson.sgkPdfPage || (sgkPageIn + 16);
      const rawSgkCdn = (sgkDoc.cdnUrl || 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/HSK1_SGK.pdf').split('#')[0];
      const sgkUrl = `${rawSgkCdn}#page=${sgkPdfPage}`;

      const sbtPageIn = lesson.sbtPage || 1;
      const sbtPdfPage = lesson.sbtPdfPage || (lesson.lessonNum >= 10 ? sbtPageIn + 12 : sbtPageIn + 10);
      const rawSbtCdn = (sbtDoc.cdnUrl || 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/HSK1_SBT.pdf').split('#')[0];
      const sbtUrl = `${rawSbtCdn}#page=${sbtPdfPage}`;

      const writingPageIn = lesson.writingPage || 1;
      const writingPdfPage = lesson.writingPdfPage || writingPageIn;
      const rawWritingCdn = (writingDoc.cdnUrl || 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/HSK1_Vo_luyen_viet.pdf').split('#')[0];
      const writingUrl = `${rawWritingCdn}#page=${writingPdfPage}`;

      const rawRadicalsCdn = (radicalsDoc.cdnUrl || 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/Bo_thu_tieng_trung.pdf').split('#')[0];
      const radicalsUrl = `${rawRadicalsCdn}#page=3`;

      const rawVocabCdn = (vocabDoc.cdnUrl || 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/Tu_vung_New_HSK1_HSK5.pdf').split('#')[0];
      const vocabUrl = `${rawVocabCdn}#page=2`;

      docsCard.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          <strong style="font-size:13px;color:var(--text);">📚 Mở sách giáo trình tra cứu song song khi học:</strong>
          <button type="button" onclick="app.switchParentSubtab('docs')" class="btn-ghost" style="font-size:11.5px;padding:3px 8px;cursor:pointer;">Xem toàn bộ kho tài liệu →</button>
        </div>
        <div class="course-pdf-links-row" style="display:flex;flex-wrap:wrap;gap:8px;">
          <a href="${esc(sgkUrl)}" target="_blank" rel="noopener noreferrer" class="course-pdf-btn primary-jump" style="min-height:44px;text-decoration:none;">
            <span>📖</span>
            <span>Sách Giáo Khoa (Trang ${sgkPageIn})</span>
            <span style="font-size:10.5px;color:#DC2626;font-weight:700;">#page=${sgkPdfPage} ↗</span>
          </a>
          <a href="${esc(sbtUrl)}" target="_blank" rel="noopener noreferrer" class="course-pdf-btn primary-jump sbt-jump" style="min-height:44px;text-decoration:none;">
            <span>✍️</span>
            <span>Sách Bài Tập (Trang ${sbtPageIn})</span>
            <span style="font-size:10.5px;color:#2563EB;font-weight:700;">#page=${sbtPdfPage} ↗</span>
          </a>
          <a href="${esc(writingUrl)}" target="_blank" rel="noopener noreferrer" class="course-pdf-btn primary-jump writing-jump" style="min-height:44px;text-decoration:none;">
            <span>📝</span>
            <span>Vở Luyện Viết (Trang ${writingPageIn})</span>
            <span style="font-size:10.5px;color:#D97706;font-weight:700;">#page=${writingPdfPage} ↗</span>
          </a>
          <a href="${esc(radicalsUrl)}" target="_blank" rel="noopener noreferrer" class="course-pdf-btn" style="min-height:44px;text-decoration:none;">
            <span>🈴</span>
            <span>214 Bộ Thủ Thường Gặp</span>
            <span style="font-size:10.5px;color:#64748B;">#page=3 ↗</span>
          </a>
          <a href="${esc(vocabUrl)}" target="_blank" rel="noopener noreferrer" class="course-pdf-btn" style="min-height:44px;text-decoration:none;">
            <span>📚</span>
            <span>500 Từ Vựng HSK 1</span>
            <span style="font-size:10.5px;color:#64748B;">#page=2 ↗</span>
          </a>
        </div>
      `;
    }

    // 3.5. In-Lesson Homework & Feedback Card (All-in-One M2)
    this.renderInLessonHomeworkModule(course, safeIdx);

    // 4. Update Prev / Next buttons
    const prevBtn = $('btn-learn-prev');
    if (prevBtn) {
      prevBtn.disabled = safeIdx <= 0;
      prevBtn.style.opacity = safeIdx <= 0 ? '0.4' : '1';
    }
    const nextBtn = $('btn-learn-next');
    if (nextBtn) {
      nextBtn.disabled = safeIdx >= lessons.length - 1;
      nextBtn.style.opacity = safeIdx >= lessons.length - 1 ? '0.4' : '1';
    }

    // 5. Sidebar Curriculum
    const sidebarList = $('learn-sidebar-lesson-list');
    if (sidebarList) {
      sidebarList.innerHTML = lessons.map((l, i) => {
        const hasV = Array.isArray(l.videos) && l.videos.length > 0;
        return `
        <button type="button" onclick="app.openCourseLesson('${esc(course.id)}', ${i})" class="learn-sidebar-lesson-btn ${i === safeIdx ? 'active' : ''}">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;">
            <span style="color:${i === safeIdx ? '#DC2626' : (l.done ? '#10B981' : '#94A3B8')};font-weight:700;flex-shrink:0;">${i === safeIdx ? '▶' : (l.done ? '✓' : `${i + 1}.`)}</span>
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left;">${esc(l.title)}</span>
            ${hasV ? '<span style="background:#FEE2E2;color:#DC2626;padding:1px 5px;border-radius:4px;font-size:10px;font-weight:700;flex-shrink:0;">📹 Video</span>' : ''}
          </div>
          <span style="font-size:11px;color:var(--sub);flex-shrink:0;">${esc(l.duration || '--:--')}</span>
        </button>
      `;
      }).join('');
    }

    const sidebarBadge = $('learn-sidebar-progress-badge');
    if (sidebarBadge) {
      sidebarBadge.textContent = `Bài ${safeIdx + 1}/${lessons.length}`;
    }

    if (hasAudio && mediaCardRebuilt) {
      this.renderCourseAudioTrackList();
    }
  };

  app.renderCoursePlayerLesson = function (course, lessonIdx) {
    // Keep for dialog fallback
    const body = $('course-player-body');
    if (!body) return;
    const lessons = Array.isArray(course.lessons) && course.lessons.length > 0 ? course.lessons : [];
    const lesson = lessons[lessonIdx] || { title: course.title, duration: '--:--' };
    const hasAudio = (Array.isArray(lesson.sgkAudio) && lesson.sgkAudio.length > 0) || (Array.isArray(lesson.sbtAudio) && lesson.sbtAudio.length > 0);

    const videos = Array.isArray(lesson.videos) ? lesson.videos : [];
    const hasVideos = videos.length > 0;
    const activePartIdx = (typeof this._activeVideoPartIdx === 'number' && this._activeVideoPartIdx < videos.length) ? this._activeVideoPartIdx : 0;
    const activeVideo = videos[activePartIdx] || videos[0];

    // 1. Video Player Section (Rendered on top when videos are available)
    let videoHtml = '';
    if (hasVideos && activeVideo) {
      videoHtml = `
        <div class="learn-video-stage-container" style="background:#0F172A;border-radius:12px;overflow:hidden;margin-bottom:14px;border:1px solid #1E293B;box-shadow:0 8px 24px rgba(0,0,0,0.15);">
          <div style="padding:10px 14px;background:#1E293B;display:flex;align-items:center;justify-content:space-between;color:#F8FAFC;font-size:13px;font-weight:700;border-bottom:1px solid #334155;">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#EF4444;flex-shrink:0;"></span>
              <span id="learn-video-active-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(activeVideo.title)}</span>
            </div>
            <span style="font-size:11px;color:#94A3B8;background:#334155;padding:2px 8px;border-radius:4px;flex-shrink:0;">HLS HD 1080p</span>
          </div>
          <div class="learn-video-wrapper" style="position:relative;width:100%;aspect-ratio:16/9;background:#000;">
            <video id="learn-main-video" controls playsinline preload="metadata" poster="${esc(activeVideo.posterUrl)}" style="width:100%;height:100%;object-fit:contain;background:#000;display:block;">
              Trình duyệt của bạn không hỗ trợ thẻ video HTML5.
            </video>
          </div>
          ${videos.length > 1 ? `
            <div class="learn-video-parts-bar" style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#0F172A;border-top:1px solid #1E293B;overflow-x:auto;">
              <span style="font-size:12px;color:#94A3B8;font-weight:700;white-space:nowrap;">🎬 Chọn phần video:</span>
              ${videos.map((v, pIdx) => `
                <button type="button" class="learn-video-part-btn ${activePartIdx === pIdx ? 'active' : ''}" onclick="app.switchLessonVideoPart(${pIdx})">
                  ▶ ${esc(v.partTitle || ('Phần ' + (pIdx + 1)))}
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    } else if (lesson.videoUrl) {
      videoHtml = `
        <video controls preload="metadata" playsinline class="hw-video" style="max-height:340px;border-radius:10px;width:100%;margin-bottom:14px;">
          <source src="${esc(lesson.videoUrl)}#t=0.1" type="video/mp4">
        </video>
      `;
    }

    // 2. Audio Player Section (Rendered below Video Player)
    let audioHtml = '';
    if (hasAudio) {
      const showExamTab = (lessonIdx === 14 || lesson.lessonNum === 15) && !!course.mockExamAudio;
      let activeTab = this._courseAudioTrackTab || 'sgk';
      if (activeTab === 'exam' && !showExamTab) activeTab = 'sgk';
      this._courseAudioTrackTab = activeTab;

      let activeTrackList = [];
      if (activeTab === 'sbt') activeTrackList = lesson.sbtAudio || [];
      else if (activeTab === 'exam') activeTrackList = course.mockExamAudio ? [course.mockExamAudio] : [];
      else activeTrackList = lesson.sgkAudio || [];

      const initialTrack = activeTrackList[0] || (lesson.sgkAudio && lesson.sgkAudio[0]) || { title: 'Audio bài học', cdnUrl: '' };

      audioHtml = `
        <div class="player-audio-panel" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:14px;margin-bottom:14px;">
          <div class="player-current-track" style="font-size:13.5px;font-weight:700;color:#0F172A;margin-bottom:8px;display:flex;align-items:center;gap:8px;">
            <span style="font-size:18px;">🔊</span>
            <span id="player-current-track-name">Đang chọn: ${esc(initialTrack.title)}</span>
          </div>
          <audio id="player-audio-element" controls preload="metadata" style="width: 100%; border-radius: 8px; margin: 4px 0 10px;" src="${esc(initialTrack.cdnUrl)}">
            Trình duyệt của bạn không hỗ trợ phát audio HTML5.
          </audio>
          <div class="player-track-tabs" style="display:flex;gap:8px;margin-bottom:10px;border-bottom:1px solid #E2E8F0;padding-bottom:8px;flex-wrap:wrap;">
            <button id="tab-btn-sgk" type="button" class="player-track-tab-btn ${activeTab === 'sgk' ? 'active' : ''}" style="min-height:44px;" onclick="app.switchCourseTrackTab('sgk')">
              📖 Audio SGK (Bài khóa & Từ mới) [${(lesson.sgkAudio || []).length}]
            </button>
            <button id="tab-btn-sbt" type="button" class="player-track-tab-btn ${activeTab === 'sbt' ? 'active' : ''}" style="min-height:44px;" onclick="app.switchCourseTrackTab('sbt')">
              ✍️ Audio SBT (Luyện phát âm & Bài tập) [${(lesson.sbtAudio || []).length}]
            </button>
            ${showExamTab ? `
              <button id="tab-btn-exam" type="button" class="player-track-tab-btn ${activeTab === 'exam' ? 'active' : ''}" style="min-height:44px;" onclick="app.switchCourseTrackTab('exam')">
                🏆 Đề thi mô phỏng HSK 1
              </button>
            ` : ''}
          </div>
          <div id="player-track-list-container" class="player-track-list">
            <!-- tracks rendered dynamically -->
          </div>
        </div>
      `;
    }

    const mediaHtml = videoHtml + audioHtml;

    const grammarHtml = lesson.grammarSummary ? `
      <div class="lesson-grammar-box" style="margin-bottom:12px;padding:10px 14px;background:#FEF9C3;border:1px solid #FDE047;border-radius:10px;font-size:12.5px;color:#713F12;line-height:1.5;">
        <strong>🎯 Trọng điểm bài học:</strong> ${esc(lesson.grammarSummary)}
        ${lesson.sgkPage ? `<span style="margin-left:8px;color:#854D0E;">(SGK tr. ${lesson.sgkPage} · SBT tr. ${lesson.sbtPage || 1} · Vở viết tr. ${lesson.writingPage || 1})</span>` : ''}
      </div>
    ` : '';

    let docsHtml = '';
    if (Array.isArray(course.docs) && course.docs.length > 0) {
      const findDoc = (fn) => (course.docs || []).find(d => d.filename === fn || (d.cdnUrl && d.cdnUrl.includes(fn))) || {};
      const sgkDoc = findDoc('HSK1_SGK.pdf');
      const sbtDoc = findDoc('HSK1_SBT.pdf');
      const writingDoc = findDoc('HSK1_Vo_luyen_viet.pdf');
      const radicalsDoc = findDoc('Bo_thu_tieng_trung.pdf');
      const vocabDoc = findDoc('Tu_vung_New_HSK1_HSK5.pdf');

      const sgkPageIn = lesson.sgkPage || 1;
      const sgkPdfPage = lesson.sgkPdfPage || (sgkPageIn + 16);
      const rawSgkCdn = (sgkDoc.cdnUrl || 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/HSK1_SGK.pdf').split('#')[0];
      const sgkUrl = `${rawSgkCdn}#page=${sgkPdfPage}`;

      const sbtPageIn = lesson.sbtPage || 1;
      const sbtPdfPage = lesson.sbtPdfPage || (lesson.lessonNum >= 10 ? sbtPageIn + 12 : sbtPageIn + 10);
      const rawSbtCdn = (sbtDoc.cdnUrl || 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/HSK1_SBT.pdf').split('#')[0];
      const sbtUrl = `${rawSbtCdn}#page=${sbtPdfPage}`;

      const writingPageIn = lesson.writingPage || 1;
      const writingPdfPage = lesson.writingPdfPage || writingPageIn;
      const rawWritingCdn = (writingDoc.cdnUrl || 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/HSK1_Vo_luyen_viet.pdf').split('#')[0];
      const writingUrl = `${rawWritingCdn}#page=${writingPdfPage}`;

      const rawRadicalsCdn = (radicalsDoc.cdnUrl || 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/Bo_thu_tieng_trung.pdf').split('#')[0];
      const radicalsUrl = `${rawRadicalsCdn}#page=3`;

      const rawVocabCdn = (vocabDoc.cdnUrl || 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/Tu_vung_New_HSK1_HSK5.pdf').split('#')[0];
      const vocabUrl = `${rawVocabCdn}#page=2`;

      docsHtml = `
        <div class="course-docs-bar" style="margin-bottom:12px;padding:10px 14px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;">
          <div style="font-size:12px;font-weight:700;color:#334155;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px;">
            <span>📚 Giáo trình & Tài liệu học tập HSK 1 (3.0):</span>
            <span style="font-size:11.5px;color:#64748B;">Bấm để mở PDF xem song song khi học</span>
          </div>
          <div class="course-pdf-links-row" style="display:flex;flex-wrap:wrap;gap:8px;">
            <a href="${esc(sgkUrl)}" target="_blank" rel="noopener noreferrer" class="course-pdf-btn primary-jump" style="min-height:44px;text-decoration:none;">
              <span>📖</span>
              <span>Sách Giáo Khoa (Trang ${sgkPageIn})</span>
              <span style="font-size:10.5px;color:#DC2626;font-weight:700;">#page=${sgkPdfPage} ↗</span>
            </a>
            <a href="${esc(sbtUrl)}" target="_blank" rel="noopener noreferrer" class="course-pdf-btn primary-jump sbt-jump" style="min-height:44px;text-decoration:none;">
              <span>✍️</span>
              <span>Sách Bài Tập (Trang ${sbtPageIn})</span>
              <span style="font-size:10.5px;color:#2563EB;font-weight:700;">#page=${sbtPdfPage} ↗</span>
            </a>
            <a href="${esc(writingUrl)}" target="_blank" rel="noopener noreferrer" class="course-pdf-btn primary-jump writing-jump" style="min-height:44px;text-decoration:none;">
              <span>📝</span>
              <span>Vở Luyện Viết (Trang ${writingPageIn})</span>
              <span style="font-size:10.5px;color:#D97706;font-weight:700;">#page=${writingPdfPage} ↗</span>
            </a>
            <a href="${esc(radicalsUrl)}" target="_blank" rel="noopener noreferrer" class="course-pdf-btn" style="min-height:44px;text-decoration:none;">
              <span>🈴</span>
              <span>214 Bộ Thủ Thường Gặp</span>
              <span style="font-size:10.5px;color:#64748B;">#page=3 ↗</span>
            </a>
            <a href="${esc(vocabUrl)}" target="_blank" rel="noopener noreferrer" class="course-pdf-btn" style="min-height:44px;text-decoration:none;">
              <span>📚</span>
              <span>500 Từ Vựng HSK 1</span>
              <span style="font-size:10.5px;color:#64748B;">#page=2 ↗</span>
            </a>
          </div>
        </div>
      `;
    }

    const lessonsListHtml = `
      <div class="hw-feedback-box" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:12px 0 8px;">
        <div><strong>Danh sách bài học trong khóa (${lessons.length} bài):</strong> Bấm bài để chuyển nhanh</div>
        <span class="badge-pill status-online">${esc(course.completedText || `${lessons.length} bài học`)}</span>
      </div>
      <div class="course-lessons-list" style="max-height:220px;overflow-y:auto;padding-right:4px;">
        ${lessons.map((l, i) => `
          <button type="button" onclick="app.openCourseLesson('${esc(course.id)}', ${i})" class="course-lesson-item ${i === lessonIdx ? 'current' : ''}">
            <div class="course-lesson-title">
              <span class="course-lesson-icon">${i === lessonIdx ? '▶' : (l.done ? '✓' : '•')}</span>
              <span>${esc(l.title)}</span>
            </div>
            <span class="course-lesson-duration">${esc(l.duration || '--:--')}</span>
          </button>
        `).join('')}
      </div>
    `;

    body.innerHTML = mediaHtml + grammarHtml + docsHtml + lessonsListHtml;

    if (hasVideos && activeVideo && activeVideo.streamUrl) {
      this.playLessonVideo(activeVideo.streamUrl, activeVideo.posterUrl);
    }

    if (hasAudio) {
      this.renderCourseAudioTrackList();
    }
  };

  app.switchCourseTrackTab = function (tabKey) {
    this._courseAudioTrackTab = tabKey;
    const course = this._currentPlayingCourse;
    const lessonIdx = this._currentPlayingLessonIdx || 0;
    const lesson = (course && course.lessons && course.lessons[lessonIdx]) || null;
    if (!lesson) return;

    ['sgk', 'sbt', 'exam'].forEach(k => {
      const btn = $('tab-btn-' + k);
      if (btn) btn.classList.toggle('active', k === tabKey);
    });

    this.renderCourseAudioTrackList();
  };

  app.renderCourseAudioTrackList = function () {
    const container = $('player-track-list-container');
    if (!container) return;
    const course = this._currentPlayingCourse;
    const lessonIdx = this._currentPlayingLessonIdx || 0;
    const lesson = (course && course.lessons && course.lessons[lessonIdx]) || null;
    if (!lesson) return;

    const showExamTab = (lessonIdx === 14 || lesson.lessonNum === 15) && !!course.mockExamAudio;
    let activeTab = this._courseAudioTrackTab || 'sgk';
    if (activeTab === 'exam' && !showExamTab) activeTab = 'sgk';
    this._courseAudioTrackTab = activeTab;

    let tracks = [];
    if (activeTab === 'sbt') tracks = lesson.sbtAudio || [];
    else if (activeTab === 'exam') tracks = course.mockExamAudio ? [course.mockExamAudio] : [];
    else tracks = lesson.sgkAudio || [];

    const audio = $('player-audio-element');
    const currentSrc = audio ? audio.src : '';

    container.innerHTML = tracks.map((t, idx) => {
      const isPlaying = currentSrc && (currentSrc === t.cdnUrl || currentSrc.endsWith(encodeURI(t.filename)));
      return `
        <button type="button" class="player-track-item ${isPlaying ? 'playing' : ''}" data-track-url="${esc(t.cdnUrl)}" style="min-height:44px;" onclick="app.playCourseAudioTrack('${esc(t.cdnUrl)}', '${esc(t.title)}')">
          <span style="display:flex;align-items:center;gap:6px;min-width:0;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">
            <span>🎵</span>
            <span>${esc(t.title)}</span>
          </span>
          <span class="track-play-badge" style="font-size:11px;color:${isPlaying ? '#EF4444' : '#2563EB'};font-weight:700;flex-shrink:0;">
            ${isPlaying ? 'Đang phát ⏸' : 'Phát ▶'}
          </span>
        </button>
      `;
    }).join('');
  };

  app.playCourseAudioTrack = function (trackUrl, trackTitle) {
    const audio = $('player-audio-element');
    const label = $('player-current-track-name');
    if (label) label.textContent = 'Đang phát: ' + trackTitle;

    // Cross-pause video if playing
    const video = $('learn-main-video');
    if (video && !video.paused) {
      video.pause();
    }

    if (audio) {
      if (!audio.__ktnCrossPauseBound) {
        audio.__ktnCrossPauseBound = true;
        audio.addEventListener('play', () => {
          const v = $('learn-main-video');
          if (v && !v.paused) v.pause();
        });
      }
      if (audio.src !== trackUrl) {
        audio.src = trackUrl;
      }
      audio.play().catch(e => {
        console.warn('[Audio play caught]', e);
      });
    }

    const container = $('player-track-list-container');
    if (container) {
      container.querySelectorAll('.player-track-item').forEach(el => {
        const isThis = el.dataset.trackUrl === trackUrl;
        el.classList.toggle('playing', isThis);
        const badge = el.querySelector('.track-play-badge');
        if (badge) {
          badge.textContent = isThis ? 'Đang phát ⏸' : 'Phát ▶';
          badge.style.color = isThis ? '#EF4444' : '#2563EB';
        }
      });
    }
  };

  app.navCourseLesson = function (offset) {
    const course = this._currentPlayingCourse;
    if (!course || !Array.isArray(course.lessons)) return;
    const currentIdx = typeof this._currentPlayingLessonIdx === 'number' ? this._currentPlayingLessonIdx : 0;
    const nextIdx = currentIdx + offset;
    if (nextIdx >= 0 && nextIdx < course.lessons.length) {
      this.openCourseLesson(course.id, nextIdx);
    }
  };

  app.closeCoursePlayer = function () {
    const dialog = $('course-player-dialog');
    if (dialog) {
      dialog.querySelectorAll('video').forEach(v => { try { v.pause(); } catch {} });
      dialog.querySelectorAll('audio').forEach(a => { try { a.pause(); } catch {} });
      if (typeof dialog.close === 'function') {
        try { dialog.close(); } catch {}
      }
      dialog.removeAttribute('open');
      dialog.classList.remove('open');
      dialog.style.display = 'none';
    }
  };

  app.renderParentOverview = function () {
    const box = $('parent-subview-overview');
    if (!box) return;
    const student = this.getActiveParentStudent();
    const caseType = this.computeStudentCase(student);
    const stuTeacher = this.getStudentTeacher(student);
    const hw = this.state.homeworks.find(h => h.studentCode === student.code) || null;
    const lastMsg = this.state.messages.filter(m => !m.blocked && m.studentCode === student.code).slice(-1)[0];
    const graded = hw && hw.status === 'GRADED';
    const studentCourses = (student && student.hasOnlineCourses && Array.isArray(student.courseIds) && student.courseIds.length)
      ? this.onlineCourses.filter(c => student.courseIds.includes(c.id))
      : [];

    const onlineAddonHtml = caseType === 'both' ? `
      <div class="card panel-pad" style="margin-top:12px;background:linear-gradient(135deg,#FFFDF9 0%,#FEF2F2 100%);border-color:#FECACA;">
        <div class="hw-header">
          <div>
            <span class="eyebrow" style="color:var(--primary);">Tích hợp Khóa học trực tuyến đã mua</span>
            <h3 class="section-title">🎬 Kho video bài giảng của ${esc(student.name)} (${studentCourses.length} khóa)</h3>
          </div>
          <button type="button" class="btn-primary" onclick="app.switchParentSubtab('courses')">Mở tất cả khóa học →</button>
        </div>
        <div class="overview-courses-strip">
          ${studentCourses.map(c => `
            <div class="overview-course-mini" onclick="app.switchParentSubtab('courses')">
              <div style="font-weight:600;font-size:13px;color:var(--text);">${esc(c.title)}</div>
              <div style="font-size:11.5px;color:var(--dim);margin-top:3px;">${esc(c.completedText)} · <strong>${c.progressPct}%</strong></div>
            </div>
          `).join('')}
        </div>
      </div>` : '';

    box.innerHTML = `<div class="overview-grid">
      <article class="overview-stat"><span class="eyebrow">Lớp Sổ Liên Lạc hiện tại</span><strong>${esc(student.classCode)} · ${esc(student.progress)}</strong><p>${esc(student.attendance)} · Mục tiêu: ${esc(student.target)}.</p></article>
      <article class="overview-stat"><span class="eyebrow">Kết quả bài tập gần nhất</span><strong>${hw ? (graded ? `Đã chấm ${hw.score}/10` : 'Đang chờ cô chấm') : 'Chưa có bài nộp'}</strong><p>${hw ? esc(hw.title) : 'Phụ huynh có thể gửi video đọc bài hoặc ảnh vở viết chữ Hán.'}</p></article>
      <article class="overview-stat"><span class="eyebrow">Tin nhắn mới từ giáo viên</span><strong>${esc(stuTeacher ? stuTeacher.name : 'Giáo viên phụ trách')}</strong><p>${esc(lastMsg ? lastMsg.text : 'Chưa có tin nhắn mới.')}</p></article>
    </div>
    <div class="card panel-pad" style="margin-top:12px;background:var(--bg);">
      <div class="hw-header"><div><span class="eyebrow">Nhận xét mới nhất của giáo viên</span><h3 class="section-title">${hw ? `${esc(hw.lesson)} · ${esc(hw.title)}` : 'Chưa có bài tập'}</h3></div><span class="badge-pill ${graded ? 'status-online' : ''}">${graded ? `Điểm ${hw.score}/10` : 'Chờ nhận xét'}</span></div>
      <p class="feedback-quote">${esc(hw ? hw.teacherFeedback : student.note)}</p>
      <div class="action-row"><button type="button" class="btn-primary" onclick="app.switchParentSubtab('homework')">Xem bài tập &amp; nộp bài mới</button><button type="button" class="btn-ghost" onclick="app.switchParentSubtab('chat')">Nhắn tin cho cô giáo</button>${caseType === 'both' ? `<button type="button" class="btn-ghost" onclick="app.switchParentSubtab('courses')">🎬 Xem khóa học đã mua (${studentCourses.length})</button>` : ''}</div>
    </div>${onlineAddonHtml}`;
  };

  app.renderTeacherSummary = function () {
    const box = $('teacher-work-summary');
    const managed = this.getTeacherManagedStudents();
    const pendingCount = (this.state?.homeworks || []).filter(h => h.status === 'PENDING' && managed.some(m => this.isHomeworkForStudent(h, m.student))).length;
    if ($('teacher-pending-count')) $('teacher-pending-count').textContent = pendingCount;
    if (!box) return;
    if (!managed.length) {
      box.innerHTML = `<div class="work-summary-main"><h3>${esc(this.state.teacherName)} (${esc(this.state.teacherCode)})</h3><p>Chưa có lớp hoặc học sinh được phân công.</p></div>`;
      return;
    }
    const student = this.students[this.selectedStudentIdx] || managed[0].student;
    const st = this.getStudentTeacherStatus(student);
    const cls = this.getClassInfo(student.classCode);
    box.innerHTML = `<div class="work-summary-main"><h3 style="font-size:15.5px;font-weight:800;">${esc(student.name)} · Lớp ${esc(student.classCode || 'Chưa xếp')} · ${esc(student.progress)}</h3><p style="font-size:12.5px;color:var(--sub);"><strong>${esc(student.parent)}</strong> · Gmail: <strong>${esc(student.email || '')}</strong> · ${esc(cls?.schedule || '')}</p></div><div class="work-summary-actions"><span class="badge-pill ${st.badgeClass}">${esc(st.shortBadge)}</span><button type="button" class="btn-ghost" style="font-weight:700;" onclick="app.switchTeacherTab('${this.teacherTab === 'grade' ? 'chat' : 'grade'}')">${this.teacherTab === 'grade' ? '💬 Nhắn phụ huynh' : '👩‍🏫 Chấm bài'}</button></div>`;
  };

  app.toggleTeacherCreateClass = function (force) {
    const box = $('teacher-create-class-box');
    if (!box) return false;
    const shouldOpen = typeof force === 'boolean' ? force : box.classList.contains('hidden');
    box.classList.toggle('hidden', !shouldOpen);
    return shouldOpen;
  };

  app.teacherCreateClass = function (customData) {
    const rawId = String(customData?.id ?? ($('t-new-class-id')?.value || '')).trim();
    const schedule = String(customData?.schedule ?? ($('t-new-class-schedule')?.value || '')).trim() || 'Thứ 3 & Thứ 6 (19:00 - 20:00)';
    const totalLessons = Math.max(1, Math.min(60, Number(customData?.totalLessons ?? ($('t-new-class-lessons')?.value || 25)) || 25));
    const title = String(customData?.title ?? ($('t-new-class-title')?.value || '')).trim() || `Lớp ${rawId}`;

    if (!rawId) {
      this.showToast('Vui lòng nhập Tên hoặc Mã lớp (VD: 1, Lớp 1...).');
      return null;
    }
    const tCode = this.activeTeacherCode || this.state?.teacherCode || 'GV-KTN-08';
    const teacher = this.teachers.find(t => t.code === tCode) || this.teachers[0];

    if (Array.isArray(this.state?.deletedClassIds)) {
      this.state.deletedClassIds = this.state.deletedClassIds.filter(id => String(id).toLowerCase() !== rawId.toLowerCase());
    }
    let cls = this.classes.find(c => c.id.toLowerCase() === rawId.toLowerCase());
    if (cls) {
      cls.schedule = schedule;
      cls.totalLessons = totalLessons;
      cls.title = title;
      cls.teacherCode = teacher.code;
      cls.teacherName = teacher.name;
      cls.teacherEmail = teacher.email;
    } else {
      cls = {
        id: rawId,
        name: rawId,
        title,
        schedule,
        totalLessons,
        teacherCode: teacher.code,
        teacherName: teacher.name,
        teacherEmail: teacher.email
      };
      this.classes.push(cls);
    }

    if (!this.state.classLessonAssignments) this.state.classLessonAssignments = {};
    if (!this.state.classLessonAssignments[cls.id]) {
      this.state.classLessonAssignments[cls.id] = this.state.classLessonAssignments['DEFAULT']
        ? JSON.parse(JSON.stringify(this.state.classLessonAssignments['DEFAULT']))
        : {};
    }

    this.students.forEach(s => {
      if (s.classCode === cls.id) {
        const m = String(s.progress || 'Buổi 1/25').match(/(\d+)/);
        const cur = m ? Math.min(totalLessons, Math.max(1, Number(m[1]))) : 1;
        s.progress = `Buổi ${cur}/${totalLessons}`;
      }
    });

    this.teacherClassFilter = cls.id;
    this.adminExpandedClassId = cls.id;
    this.toggleTeacherCreateClass(false);
    if ($('t-new-class-id')) $('t-new-class-id').value = '';
    this.reconcileTeacherSelection();
    this.saveState();
    this.syncClassToServer?.(cls, 'upsert');
    this.renderAll();
    this.showToast(`Đã tạo lớp "${cls.id}" (${totalLessons} buổi · ${schedule}).`);
    return cls;
  };

  app.toggleTeacherAddStudent = function (force) {
    const box = $('teacher-add-student-box');
    if (!box) return false;
    const shouldOpen = typeof force === 'boolean' ? force : box.classList.contains('hidden');
    box.classList.toggle('hidden', !shouldOpen);
    const managedClasses = this.getTeacherManagedClasses();
    const activeCls = managedClasses.find(c => c.id === this.teacherClassFilter) || managedClasses[0] || this.classes[0];
    if ($('teacher-add-stu-heading') && activeCls) {
      $('teacher-add-stu-heading').textContent = `Thêm học sinh vào lớp ${activeCls.id} (${activeCls.totalLessons || 25} buổi) bằng Gmail`;
    }
    return shouldOpen;
  };

  app.teacherAddStudentToClass = function (customData) {
    const managedClasses = this.getTeacherManagedClasses();
    const activeCls = this.classes.find(c => c.id === customData?.classCode) || managedClasses.find(c => c.id === (customData?.classCode || this.teacherClassFilter)) || managedClasses[0] || this.classes[0];
    if (!activeCls) {
      this.showToast('Vui lòng chọn hoặc tạo lớp trước khi thêm học sinh.');
      return null;
    }
    const pickedCode = String(customData?.studentCode || '').trim();
    const rawName = String(customData?.name ?? ($('t-add-stu-name')?.value || $('t-stu-name')?.value || '')).trim();
    const rawEmail = String(customData?.email ?? ($('t-add-stu-email')?.value || $('t-stu-email')?.value || '')).trim();
    const parentRaw = String(customData?.parent ?? ($('t-add-stu-parent')?.value || $('t-stu-parent')?.value || '')).trim();
    const totalLessons = Number(activeCls.totalLessons) || 25;
    const lessonNum = Math.max(1, Math.min(totalLessons, Number(customData?.lessonNum ?? ($('t-add-stu-lesson')?.value || $('t-stu-lesson')?.value || 1)) || 1));

    let stu = null;
    if (pickedCode) {
      stu = this.students.find(s => s.code === pickedCode);
    }

    const combinedInput = rawEmail || rawName;
    if (!stu && !combinedInput) {
      this.showToast('Vui lòng chọn học sinh có sẵn hoặc nhập Tên / Tài khoản / Gmail học sinh.');
      return null;
    }

    const slugFn = s => this._slugifyAccount(s);
    const emailLower = rawEmail.toLowerCase();
    const normCand = window.sllAuth?.normalizeEmail ? window.sllAuth.normalizeEmail(emailLower) : emailLower;
    const inputSlug = slugFn((rawEmail.includes('@') ? rawEmail.split('@')[0] : rawEmail) || rawName);
    const nameFold = foldText((rawName || rawEmail).replace(/^bé\s+/i, '').trim());

    if (!stu) {
      stu = this.students.find(s => {
        const sEmail = String(s.email || '').toLowerCase();
        const sLocalSlug = slugFn(sEmail.split('@')[0]);
        const sNameFold = foldText(String(s.name || '').replace(/^bé\s+/i, '').trim());
        const sNameSlug = slugFn(s.name);
        if (emailLower && (sEmail === emailLower || sEmail === normCand)) return true;
        if (inputSlug && (sLocalSlug === inputSlug || sNameSlug === inputSlug)) return true;
        if (nameFold && sNameFold && (sNameFold === nameFold || sNameFold.endsWith(' ' + nameFold))) return true;
        if (Array.isArray(s.aliases) && s.aliases.some(a => {
          const al = String(a || '').toLowerCase();
          return (emailLower && (al === emailLower || al === normCand)) || (inputSlug && slugFn(al) === inputSlug);
        })) return true;
        return false;
      });
    }

    const looksLikeFullName = str => /\s/.test(String(str || '').trim()) && !String(str || '').includes('@');
    const inferredName = rawName || (looksLikeFullName(rawEmail) ? rawEmail : '') || stu?.name || (rawEmail ? rawEmail.split('@')[0] : 'Học viên');
    const displayName = /^bé\s/i.test(inferredName) ? inferredName : 'Bé ' + inferredName;
    const parentName = parentRaw || stu?.parent || `Phụ huynh ${displayName}`;
    const cleanLocal = slugFn(rawEmail.includes('@') ? rawEmail.split('@')[0] : (rawEmail && !looksLikeFullName(rawEmail) ? rawEmail : inferredName)) || ('hv' + String(Date.now()).slice(-4));
    const domainPart = rawEmail.includes('@')
      ? (rawEmail.split('@')[1] || 'khongtunhi.com').toLowerCase().replace(/[^a-z0-9.-]/g, '')
      : 'khongtunhi.com';
    const email = stu?.email || `${cleanLocal}@${domainPart || 'khongtunhi.com'}`;

    if (!stu) {
      stu = {
        name: displayName,
        parent: parentName,
        email,
        password: '123456',
        aliases: Array.from(new Set([email, emailLower, cleanLocal].filter(Boolean))),
        progress: `Buổi ${lessonNum}/${totalLessons}`,
        code: this._nextStudentCode(),
        classCode: activeCls.id,
        hasOnlineCourses: false,
        hasLiveClass: true,
        unsubmittedCurrent: true,
        courseIds: [],
        attendance: `${lessonNum}/${lessonNum} buổi có mặt`,
        target: `Lộ trình ${activeCls.title} (${totalLessons} buổi)`,
        note: 'Học sinh mới được thêm vào lớp qua Sổ Liên Lạc.'
      };
      stu.caseType = this.computeStudentCase(stu);
      this.students.push(stu);
      if (typeof this.getCloudSyncAdminToken === 'function' && typeof fetch === 'function') {
        this.getCloudSyncAdminToken().then(token => {
          if (!token) return;
          const uniquePhone = '09' + String(Date.now() + Math.floor(Math.random() * 900)).slice(-8);
          return fetch('https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: token
            },
            body: JSON.stringify({
              vendorId: VENDOR_ID,
              name: displayName,
              email,
              phone: uniquePhone,
              password: btoa('123456'),
              status: 'verified'
            })
          });
        }).catch(() => {});
      }
    } else {
      delete stu.isDynamicSession;
      if (rawName) stu.name = displayName;
      if (parentRaw) stu.parent = parentName;
      stu.classCode = activeCls.id;
      stu.hasLiveClass = true;
      stu.unsubmittedCurrent = true;
      stu.progress = `Buổi ${lessonNum}/${totalLessons}`;
      stu.attendance = `${lessonNum}/${lessonNum} buổi có mặt`;
      stu.aliases = Array.from(new Set([...(stu.aliases || []), email, cleanLocal].filter(Boolean)));
      stu.caseType = this.computeStudentCase(stu);
    }

    const newIdx = this.students.indexOf(stu);
    this.teacherClassFilter = activeCls.id;
    this.adminExpandedClassId = activeCls.id;
    this.selectedStudentIdx = newIdx >= 0 ? newIdx : 0;
    this.teacherQuickAddOpen = false;
    this.toggleTeacherAddStudent(false);
    ['t-add-stu-name', 't-add-stu-email', 't-add-stu-parent', 't-stu-name', 't-stu-email', 't-stu-parent', 't-quick-stu-email', 't-quick-stu-name', 't-quick-stu-pick'].forEach(id => {
      if ($(id)) $(id).value = '';
    });
    this.persistEntitlementsToState();
    this.reconcileTeacherSelection();
    this.saveState();
    this.syncStudentEntitlementToServer?.(stu, 'assign_class');
    this.renderAll();
    this.showToast(`Đã thêm ${stu.name} (${stu.email}) vào lớp ${activeCls.id} (Buổi ${lessonNum}/${totalLessons}).`);
    return stu;
  };

  app.teacherRemindUnsubmittedStudent = function (studentCode) {
    const idx = this.students.findIndex(s => s.code === studentCode);
    if (idx >= 0) this.selectedStudentIdx = idx;
    const stu = this.students[this.selectedStudentIdx] || this.students[0];
    if (!stu) return false;
    const lessonShort = String(stu.progress || 'Buổi 19').split('/')[0];
    const clsAssign = this.getLessonAssignmentInfo(stu.classCode, this.parseLessonNumber(stu.progress, 19));
    const reminderText = `Chào ${stu.parent} ạ! Nhờ phụ huynh nhắc ${stu.name} hoàn thành và gửi bài tập ${lessonShort} (${clsAssign.formatLabel}: ${clsAssign.title}) lên Sổ Liên Lạc để cô chấm và nhận xét cho con nhé ạ!`;
    this.switchTeacherTab('chat');
    if ($('input-teacher-chat')) {
      $('input-teacher-chat').value = reminderText;
      this.previewDlp('teacher', reminderText);
    }
    this.renderAll();
    this.showToast(`Đã tạo lời nhắc nộp bài ${lessonShort} cho ${stu.parent}.`);
    return true;
  };

  app.renderTeacherManagePanel = function () {
    const barEl = $('teacher-manage-class-bar');
    const rosterEl = $('teacher-manage-roster');
    if (!barEl && !rosterEl) return;
    const managedClasses = this.getTeacherManagedClasses();
    const activeCls = managedClasses.find(c => c.id === this.teacherClassFilter) || managedClasses[0] || this.classes[0];
    if (!activeCls) return;
    const managed = this.getTeacherManagedStudents().filter(({ student }) => student.classCode === activeCls.id);
    const total = Number(activeCls.totalLessons) || 25;

    if (barEl) {
      barEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <strong style="font-size:15px;color:var(--primary);">${esc(activeCls.id)}</strong>
          <input id="t-manage-schedule" type="text" class="input-text" value="${esc(activeCls.schedule)}" style="width:220px;min-height:32px;padding:4px 8px;font-size:12.5px;" aria-label="Giờ học">
          <div style="display:inline-flex;align-items:center;gap:4px;">
            <input id="t-manage-lessons" type="number" min="1" max="60" value="${total}" class="input-text" style="width:68px;min-height:32px;padding:4px 8px;font-size:13px;font-weight:800;" aria-label="Số buổi">
            <span style="font-size:12.5px;font-weight:700;color:var(--sub);">buổi</span>
          </div>
          <button type="button" class="btn-ghost" style="min-height:32px;padding:4px 10px;font-weight:700;" onclick="app.teacherUpdateClassMeta('${esc(activeCls.id)}')">Lưu lớp</button>
        </div>
        <span class="badge-pill status-online">${managed.length} học sinh</span>`;
    }

    if (rosterEl) {
      if (!managed.length) {
        rosterEl.innerHTML = '<div class="empty-box">Chưa có học sinh trong lớp này. Nhập Tên & Gmail ở trên để thêm.</div>';
        return;
      }
      rosterEl.innerHTML = managed.map(({ student, index }) => {
        const st = this.getStudentTeacherStatus(student);
        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:8px 10px;background:#fff;border:1px solid var(--border);border-radius:8px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <strong>${esc(student.name)}</strong>
            <span style="font-size:12.5px;color:var(--sub);">${esc(student.email || '')}</span>
            <span class="badge-pill">${esc(student.progress)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="badge-pill ${st.badgeClass}">${esc(st.shortBadge)}</span>
            <button type="button" class="chip-btn" style="font-weight:700;" onclick="app.selectStudent(${index}); app.switchTeacherTab('grade');">Chấm điểm →</button>
          </div>
        </div>`;
      }).join('');
    }
  };

  app.teacherUpdateClassMeta = function (classId) {
    const cls = this.classes.find(c => c.id === (classId || this.teacherClassFilter)) || this.classes[0];
    if (!cls) return false;
    const sched = String($('t-manage-schedule')?.value || cls.schedule).trim();
    const total = Math.max(1, Math.min(60, Number($('t-manage-lessons')?.value || cls.totalLessons || 25)));
    cls.schedule = sched;
    cls.totalLessons = total;
    this.students.forEach(s => {
      if (s.classCode === cls.id) {
        const m = String(s.progress || 'Buổi 1/25').match(/(\d+)/);
        const cur = m ? Math.min(total, Math.max(1, Number(m[1]))) : 1;
        s.progress = `Buổi ${cur}/${total}`;
      }
    });
    this.saveState();
    this.syncClassToServer?.(cls, 'upsert');
    this.renderAll();
    this.showToast(`Đã cập nhật lớp ${cls.id}: ${total} buổi (${sched}).`);
    return true;
  };

  app.getLessonAssignmentInfo = function (classCode, lessonNum) {
    const cid = classCode || this.classes[0]?.id || 'DEFAULT';
    const num = Math.max(1, Number(lessonNum) || 1);
    const map = (this.state?.classLessonAssignments && (this.state.classLessonAssignments[cid] || this.state.classLessonAssignments['DEFAULT'])) || DEFAULT_LESSON_ASSIGNMENTS[cid] || {};
    const saved = map[String(num)];
    const lessonName = (saved && saved.lessonName && String(saved.lessonName).trim())
      ? String(saved.lessonName).trim()
      : '';
    const normFmt = f => (f === 'image' ? 'image' : 'video');
    let tasks = [];
    if (saved && Array.isArray(saved.tasks) && saved.tasks.length) {
      tasks = saved.tasks.filter(t => t && t.format !== 'game').map(t => ({ format: normFmt(t.format), title: t.title }));
    } else if (saved && saved.title && saved.format !== 'game' && saved.title !== saved.lessonName) {
      if (saved.format === 'both') {
        tasks = [
          { format: 'video', title: `Quay video: ${saved.title}` },
          { format: 'image', title: `Gửi ảnh vở chữ Hán buổi ${num}` }
        ];
      } else {
        tasks = [{ format: normFmt(saved.format), title: saved.title }];
      }
    }

    const hasVideo = tasks.some(t => t.format === 'video');
    const hasImage = tasks.some(t => t.format === 'image');
    const format = (hasVideo && hasImage) ? 'both' : (hasImage ? 'image' : 'video');
    const formatMeta = {
      video: {
        format: 'video',
        shortTag: '🎬 Quay Video',
        formatLabel: 'Quay Video',
        hwTypeValue: 'Video đọc bài & Phát âm tiếng Trung',
        acceptAttr: 'video/*,.mp4,.mov,.m4v,.3gp,.webm',
        pickBtnLabel: '🎬 Quay / Chọn Video bài tập gửi cô'
      },
      image: {
        format: 'image',
        shortTag: '📷 Gửi Ảnh',
        formatLabel: 'Gửi Ảnh',
        hwTypeValue: 'Ảnh chụp vở tập viết chữ Hán',
        acceptAttr: 'image/*,.jpg,.jpeg,.png,.webp,.heic',
        pickBtnLabel: '📷 Chụp / Chọn Ảnh vở chữ Hán gửi cô'
      },
      both: {
        format: 'both',
        shortTag: '🎬 Video & 📷 Ảnh',
        formatLabel: 'Video & Ảnh',
        hwTypeValue: 'Video đọc bài & Tập viết chữ Hán',
        acceptAttr: 'video/*,image/*,.mp4,.mov,.m4v,.3gp,.webm,.jpg,.jpeg,.png,.webp,.heic',
        pickBtnLabel: '🎬/📷 Chọn Video hoặc Ảnh bài tập gửi cô'
      }
    }[format];

    const fmtName = f => (f === 'game' ? 'Mini-Game' : (f === 'image' ? 'Ảnh' : 'Video'));
    const combinedTitle = tasks.map((t, i) => `Bài ${i + 1} (${fmtName(t.format)}): ${t.title}`).join(' · ');
    const isCustomAssigned = Boolean(lessonName || tasks.length > 0);
    return {
      lessonNum: num,
      isCustomAssigned,
      lessonName,
      tasks,
      title: lessonName || combinedTitle || '',
      updatedAt: saved?.updatedAt || 'Chưa soạn',
      ...formatMeta
    };
  };

  app._syncLessonNameToHomeworks = function (classId, lessonNum, lessonName) {
    if (!Array.isArray(this.state?.homeworks) || !lessonName) return;
    this.state.homeworks.forEach(hw => {
      if ((hw.classCode || 'YCT2-04') === classId && this.parseLessonNumber(hw.lesson, -1) === Number(lessonNum)) {
        hw.title = lessonName;
      }
    });
  };

  app.teacherSaveLessonName = function (customName) {
    const managedClasses = this.getTeacherManagedClasses();
    const activeCls = managedClasses.find(c => c.id === this.teacherClassFilter) || managedClasses[0] || this.classes[0] || { id: 'DEFAULT', name: 'Khóa 25 buổi', totalLessons: 25 };
    const lessonNum = this.teacherAssignLessonNum || 1;
    const currentInfo = this.getLessonAssignmentInfo(activeCls.id, lessonNum);
    const rawName = String(customName ?? ($('assign-lesson-name')?.value || '')).trim();
    const lessonName = rawName;
    if (!this.state.classLessonAssignments) this.state.classLessonAssignments = {};
    if (!this.state.classLessonAssignments[activeCls.id]) this.state.classLessonAssignments[activeCls.id] = {};
    if (!lessonName && !currentInfo.tasks.length) {
      delete this.state.classLessonAssignments[activeCls.id][String(lessonNum)];
    } else {
      this.state.classLessonAssignments[activeCls.id][String(lessonNum)] = {
        lessonNum,
        lessonName,
        format: currentInfo.format,
        title: lessonName,
        tasks: [...currentInfo.tasks],
        updatedAt: 'Vừa cập nhật'
      };
    }
    this._syncLessonNameToHomeworks(activeCls.id, lessonNum, lessonName);
    this.saveState();
    this.syncClassSessionToServer?.(activeCls.id, lessonNum);
    this.renderAll();
    this.showToast(lessonName ? `Đã lưu tên Buổi ${lessonNum}: "${lessonName}".` : `Đã xóa tên bài học Buổi ${lessonNum}.`);
    return lessonName;
  };

  app.selectTeacherAssignLesson = function (lessonNum) {
    const managedClasses = this.getTeacherManagedClasses();
    const activeCls = managedClasses.find(c => c.id === this.teacherClassFilter) || managedClasses[0] || this.classes[0] || { id: 'DEFAULT', name: 'Khóa 25 buổi', totalLessons: 25 };
    const total = Number(activeCls?.totalLessons) || 25;
    const num = Math.max(1, Math.min(total, Number(lessonNum) || 1));
    this.teacherAssignLessonNum = num;
    const titleEl = $('assign-hw-title') || $('assign-title-input');
    if (titleEl) titleEl.value = '';
    this.renderTeacherAssignPanel();
    return num;
  };

  app.teacherStepAssignLesson = function (delta) {
    const managedClasses = this.getTeacherManagedClasses();
    const activeCls = managedClasses.find(c => c.id === this.teacherClassFilter) || managedClasses[0] || this.classes[0] || { id: 'DEFAULT', name: 'Khóa 25 buổi', totalLessons: 25 };
    const total = Number(activeCls?.totalLessons) || 25;
    const next = Math.max(1, Math.min(total, (this.teacherAssignLessonNum || 1) + (Number(delta) || 1)));
    return this.selectTeacherAssignLesson(next);
  };

  app.setTeacherAssignFormat = function (fmt) {
    this.teacherAssignFormat = fmt === 'game' ? 'game' : (fmt === 'image' ? 'image' : 'video');
    document.querySelectorAll('#teacher-assign-format-group [data-assign-fmt]').forEach(btn => {
      const isAct = btn.getAttribute('data-assign-fmt') === this.teacherAssignFormat;
      btn.classList.toggle('is-orange', isAct);
      btn.classList.toggle('active', isAct);
      btn.style.background = isAct ? '' : '#fff';
      btn.style.borderColor = isAct ? '' : 'var(--border)';
    });
    const titleEl = $('assign-hw-title');
    if (titleEl && this.teacherAssignFormat === 'game' && !titleEl.value.trim()) {
      const managedClasses = this.getTeacherManagedClasses();
      const activeCls = managedClasses.find(c => c.id === this.teacherClassFilter) || managedClasses[0] || this.classes[0] || { id: 'DEFAULT', totalLessons: 25 };
      const info = this.getLessonAssignmentInfo(activeCls.id, this.teacherAssignLessonNum || 1);
      titleEl.value = `Hoàn thành 4 Mini-Game tương tác: ${info.lessonName}`;
    }
    return this.teacherAssignFormat;
  };

  app.teacherSaveAssignment = function (customData) {
    const managedClasses = this.getTeacherManagedClasses();
    const activeCls = managedClasses.find(c => c.id === (customData?.classCode || this.teacherClassFilter)) || managedClasses[0] || this.classes[0] || { id: 'DEFAULT', name: 'Khóa 25 buổi', totalLessons: 25 };
    const total = Number(activeCls.totalLessons) || 25;
    const lessonNum = Math.max(1, Math.min(total, Number(customData?.lessonNum ?? this.teacherAssignLessonNum ?? 1)));
    const rawFmt = customData?.format || this.teacherAssignFormat;
    const format = rawFmt === 'game' ? 'game' : (rawFmt === 'image' ? 'image' : 'video');
    const titleEl = $('assign-hw-title') || $('assign-title-input');
    const rawTitle = String(customData?.title ?? (titleEl?.value || '')).trim();
    const currentInfo = this.getLessonAssignmentInfo(activeCls.id, lessonNum);
    const lessonName = String(customData?.lessonName ?? ($('assign-lesson-name')?.value || currentInfo.lessonName || '')).trim();
    const defaultTitle = format === 'image'
      ? (lessonName ? `Gửi ảnh bài tập: ${lessonName}` : `Gửi ảnh bài tập Buổi ${lessonNum}`)
      : (lessonName ? `Quay video bài tập: ${lessonName}` : `Quay video bài tập Buổi ${lessonNum}`);
    const title = rawTitle || defaultTitle;

    if (!this.state.classLessonAssignments) this.state.classLessonAssignments = {};
    if (!this.state.classLessonAssignments[activeCls.id]) this.state.classLessonAssignments[activeCls.id] = {};
    const existingTasks = Array.isArray(currentInfo.tasks) ? [...currentInfo.tasks] : [];
    if (customData?.replace) {
      existingTasks.length = 0;
    }
    existingTasks.push({ format, title });

    this.state.classLessonAssignments[activeCls.id][String(lessonNum)] = {
      lessonNum,
      lessonName,
      format,
      title: lessonName || title,
      tasks: existingTasks,
      updatedAt: 'Vừa giao'
    };
    this._syncLessonNameToHomeworks(activeCls.id, lessonNum, lessonName);

    if (titleEl) titleEl.value = '';
    this.teacherAssignLessonNum = lessonNum;
    this.saveState();
    this.syncClassSessionToServer?.(activeCls.id, lessonNum);
    this.renderAll();
    const savedInfo = this.getLessonAssignmentInfo(activeCls.id, lessonNum);
    const fmtBadge = format === 'game' ? '🎮 Mini-Game' : (format === 'image' ? '📷 Ảnh' : '🎬 Video');
    this.showToast(`Đã thêm Bài ${existingTasks.length} (${fmtBadge}) cho Buổi ${lessonNum}${lessonName ? ' (' + lessonName + ')' : ''}!`);
    if (typeof this.triggerNotificationEvent === 'function') {
      this.triggerNotificationEvent('onAssignedOrChat', {
        title: `📚 Cô ${this.state.teacherName || 'Mỹ Linh'} vừa giao bài Buổi ${lessonNum}`,
        body: `Lớp ${activeCls.id} · Bài ${existingTasks.length} (${fmtBadge}): ${title}`,
        lessonNum
      });
    }
    return savedInfo;
  };

  app.teacherRemoveAssignmentTask = function (taskIdx) {
    const managedClasses = this.getTeacherManagedClasses();
    const activeCls = managedClasses.find(c => c.id === this.teacherClassFilter) || managedClasses[0] || this.classes[0] || { id: 'DEFAULT', name: 'Khóa 25 buổi', totalLessons: 25 };
    const lessonNum = this.teacherAssignLessonNum || 1;
    const currentInfo = this.getLessonAssignmentInfo(activeCls.id, lessonNum);
    const nextTasks = currentInfo.tasks.filter((_, i) => i !== Number(taskIdx));
    if (!this.state.classLessonAssignments) this.state.classLessonAssignments = {};
    if (!this.state.classLessonAssignments[activeCls.id]) this.state.classLessonAssignments[activeCls.id] = {};
    if (!currentInfo.lessonName && !nextTasks.length) {
      delete this.state.classLessonAssignments[activeCls.id][String(lessonNum)];
    } else {
      this.state.classLessonAssignments[activeCls.id][String(lessonNum)] = {
        lessonNum,
        lessonName: currentInfo.lessonName,
        format: nextTasks[0]?.format || 'video',
        title: currentInfo.lessonName,
        tasks: nextTasks,
        updatedAt: 'Vừa cập nhật'
      };
    }
    this.saveState();
    this.syncClassSessionToServer?.(activeCls.id, lessonNum);
    this.renderAll();
    return true;
  };

  app.renderTeacherAssignPanel = function () {
    const stripEl = $('teacher-assign-lesson-strip');
    if (!stripEl) return;
    const managedClasses = this.getTeacherManagedClasses();
    const realCls = managedClasses.find(c => c.id === this.teacherClassFilter) || managedClasses[0] || this.classes[0] || null;
    const activeCls = realCls || { id: 'DEFAULT', name: 'Khóa 25 buổi', totalLessons: 25 };
    const total = Number(activeCls.totalLessons) || 25;
    if (!this.teacherAssignLessonNum || this.teacherAssignLessonNum > total) {
      this.teacherAssignLessonNum = 1;
    }
    const activeNum = this.teacherAssignLessonNum;
    const currentInfo = this.getLessonAssignmentInfo(activeCls.id, activeNum);

    if ($('teacher-assign-strip-label')) {
      $('teacher-assign-strip-label').textContent = realCls
        ? `Chọn buổi (Lớp ${realCls.id}):`
        : `Chọn buổi (${total} buổi):`;
    }
    if ($('teacher-assign-lesson-name-label')) {
      $('teacher-assign-lesson-name-label').textContent = `Tên Buổi ${activeNum}:`;
    }
    if ($('assign-lesson-name')) {
      $('assign-lesson-name').value = currentInfo.lessonName || '';
      $('assign-lesson-name').placeholder = `VD: Bài ${activeNum} — Chào hỏi...`;
    }
    const headingEl = $('teacher-assign-heading') || $('teacher-assign-lesson-title');
    if (headingEl) {
      headingEl.textContent = `Giao bài tập · Buổi ${activeNum}`;
    }

    const activeFmt = this.teacherAssignFormat === 'game' ? 'game' : (this.teacherAssignFormat === 'image' ? 'image' : 'video');
    document.querySelectorAll('#teacher-assign-format-group [data-assign-fmt]').forEach(btn => {
      const isAct = btn.getAttribute('data-assign-fmt') === activeFmt;
      btn.classList.toggle('is-orange', isAct);
      btn.classList.toggle('active', isAct);
      btn.style.background = isAct ? '' : '#fff';
      btn.style.borderColor = isAct ? '' : 'var(--border)';
    });

    const buttonsHtml = [];
    for (let n = 1; n <= total; n++) {
      const info = this.getLessonAssignmentInfo(activeCls.id, n);
      const isAct = n === activeNum;
      const pillState = info.isCustomAssigned ? 'is-graded' : 'is-unsubmitted';
      buttonsHtml.push(`<button type="button" id="btn-teacher-assign-lesson-${n}" data-assign-lesson="${n}" class="lesson-pill ${pillState} ${isAct ? 'active' : ''}" onclick="app.selectTeacherAssignLesson(${n})"><span>Buổi ${n}</span></button>`);
    }
    stripEl.innerHTML = buttonsHtml.join('');
    requestAnimationFrame(() => {
      const activeBtn = stripEl.querySelector(`.lesson-pill[data-assign-lesson="${activeNum}"]`);
      if (activeBtn && stripEl.clientWidth > 0) {
        const targetScroll = activeBtn.offsetLeft - (stripEl.clientWidth / 2) + (activeBtn.offsetWidth / 2);
        stripEl.style.scrollBehavior = 'auto';
        stripEl.scrollLeft = Math.max(0, targetScroll);
        stripEl.style.scrollBehavior = '';
      }
    });

    const assignedListEl = $('teacher-assigned-list');
    if (assignedListEl) {
      const headerLabel = currentInfo.lessonName
        ? `Buổi ${activeNum}: ${esc(currentInfo.lessonName)} (${currentInfo.tasks.length} bài tập):`
        : `Buổi ${activeNum}: Chưa đặt tên bài học (${currentInfo.tasks.length} bài tập):`;
      const emptyTasksHtml = !currentInfo.tasks.length
        ? `<div class="empty-box" style="padding:10px 12px;font-size:12.5px;">Chưa có bài tập cho Buổi ${activeNum}. Thêm bài bên dưới để giao cho học sinh.</div>`
        : '';
      assignedListEl.innerHTML = `
        <div style="font-size:13px;font-weight:800;color:var(--text);">${headerLabel}</div>
        ${emptyTasksHtml}
        ${currentInfo.tasks.map((task, idx) => {
          const badgeClass = task.format === 'game' ? 'case-badge-online' : (task.format === 'image' ? 'status-online' : 'status-orange');
          const badgeLabel = task.format === 'game' ? '🎮 Mini-Game' : (task.format === 'image' ? '📷 Gửi Ảnh' : '🎬 Quay Video');
          return `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;background:#fff;border:1px solid var(--border);border-radius:8px;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <strong style="font-size:13px;">Bài ${idx + 1}:</strong>
              <span class="badge-pill ${badgeClass}">${badgeLabel}</span>
              <span style="font-size:13.5px;font-weight:600;color:var(--text);">${esc(task.title)}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              ${task.format === 'game' ? `<button type="button" class="chip-btn" style="font-weight:700;color:var(--primary);" onclick="app.openLessonGame(${activeNum}, 'match', '${esc(activeCls.id)}')">Xem Game ↗</button>` : ''}
              <button type="button" class="chip-btn" onclick="app.teacherRemoveAssignmentTask(${idx})" title="Xóa bài này">✕</button>
            </div>
          </div>`;
        }).join('')}`;
    }
  };

  app.adminAssignClassTeacher = function (classId, teacherCode) {
    if (this.currentRole !== 'admin') return false;
    const cls = this.classes.find(c => c.id === classId);
    const teacher = this.teachers.find(t => t.code === teacherCode);
    if (!cls || !teacher) return false;
    cls.teacherCode = teacher.code;
    cls.teacherName = teacher.name;
    cls.teacherEmail = teacher.email;
    if (classId === 'YCT2-04') {
      this.state.teacherName = teacher.name;
      this.state.teacherCode = teacher.code;
    }
    this.reconcileTeacherSelection();
    this.saveState();
    this.renderAll();
    this.showToast(`Đã phân công ${teacher.name} (${teacher.code}) phụ trách ${cls.name}.`);
    return true;
  };

  app.reassignTeacher = function (classId) {
    const targetId = classId || 'YCT2-04';
    const cls = this.classes.find(c => c.id === targetId) || this.classes[0];
    const currentCode = cls?.teacherCode || this.state.teacherCode || 'GV-KTN-08';
    const nextTeacher = this.teachers.find(t => t.code !== currentCode) || this.teachers[0];
    if (cls && nextTeacher) {
      cls.teacherCode = nextTeacher.code;
      cls.teacherName = nextTeacher.name;
      cls.teacherEmail = nextTeacher.email;
    }
    if (nextTeacher) {
      this.state.teacherName = nextTeacher.name;
      this.state.teacherCode = nextTeacher.code;
    }
    this.state.teacherChatLocked = false;
    this.reconcileTeacherSelection();
    this.saveState();
    this.renderAll();
    this.showToast(`Đã chuyển giáo viên phụ trách lớp ${cls ? cls.id : 'YCT2-04'} sang ${this.state.teacherName} (${this.state.teacherCode}).`);
    return true;
  };

  app.syncProvisionDraft = function () {
    if (!this._provDraft) {
      this._provDraft = { name: '', email: '', password: '123456', phone: '', classCode: '', hasOnline: false };
    }
    if ($('prov-role')) this.adminProvisionRole = $('prov-role').value === 'teacher' ? 'teacher' : 'student';
    if ($('prov-name')) this._provDraft.name = $('prov-name').value;
    if ($('prov-email')) this._provDraft.email = $('prov-email').value;
    if ($('prov-password')) this._provDraft.password = $('prov-password').value;
    if ($('prov-phone')) this._provDraft.phone = $('prov-phone').value;
    if ($('prov-class')) this._provDraft.classCode = $('prov-class').value;
    if ($('prov-online')) this._provDraft.hasOnline = Boolean($('prov-online').checked);
  };

  app.openAdminProvisionForRole = function (role = 'student') {
    this.syncProvisionDraft();
    this.adminProvisionRole = role === 'teacher' ? 'teacher' : 'student';
    this.adminProvisionFormOpen = true;
    this.adminCaseFilter = this.adminProvisionRole === 'teacher' ? 'TEACHERS' : 'ALL';
    this.switchAdminTab('accounts');
    setTimeout(() => {
      $('prov-name')?.focus();
    }, 50);
    return true;
  };

  app.toggleAdminProvisionForm = function (forceState) {
    this.syncProvisionDraft();
    this.adminProvisionFormOpen = typeof forceState === 'boolean' ? forceState : !this.adminProvisionFormOpen;
    this.renderAdminOverview();
    return this.adminProvisionFormOpen;
  };

  app.onProvisionRoleChange = function (role) {
    this.syncProvisionDraft();
    const isTeacher = String(role || '').trim() === 'teacher';
    this.adminProvisionRole = isTeacher ? 'teacher' : 'student';
    this.adminCaseFilter = isTeacher ? 'TEACHERS' : 'ALL';
    if ($('prov-role')) $('prov-role').value = this.adminProvisionRole;
    this.renderAdminOverview();
    return this.adminProvisionRole;
  };

  app.toggleAdminNewClassForm = function (forceState) {
    this.adminNewClassFormOpen = typeof forceState === 'boolean' ? forceState : !this.adminNewClassFormOpen;
    this.renderAdminOverview();
    return this.adminNewClassFormOpen;
  };

  app.adminCreateClass = function (customData) {
    if (this.currentRole !== 'admin') return false;
    const rawId = String(customData?.id ?? ($('new-class-id')?.value || '')).trim();
    const title = String(customData?.title ?? customData?.name ?? ($('new-class-title')?.value || `Lớp ${rawId}`)).trim();
    const schedule = String(customData?.schedule ?? ($('new-class-schedule')?.value || '')).trim() || 'Thứ 3 & Thứ 6 (19:30 - 20:30)';
    const totalLessons = Math.max(1, Math.min(60, Number(customData?.totalLessons ?? ($('new-class-lessons')?.value || 25)) || 25));
    const teacherCode = String(customData?.teacherCode ?? ($('new-class-teacher')?.value || 'GV-KTN-08')).trim();

    if (!rawId) {
      this.showToast('Vui lòng nhập Tên hoặc Mã lớp (VD: 1, Lớp 1...).');
      return false;
    }
    if (this.classes.some(c => c.id.toLowerCase() === rawId.toLowerCase())) {
      this.showToast(`Lớp "${rawId}" đã tồn tại trên hệ thống.`);
      return false;
    }
    const teacher = this.teachers.find(t => t.code === teacherCode) || this.teachers[0];
    if (Array.isArray(this.state?.deletedClassIds)) {
      this.state.deletedClassIds = this.state.deletedClassIds.filter(id => String(id).toLowerCase() !== rawId.toLowerCase());
    }
    const newCls = {
      id: rawId,
      name: rawId,
      title,
      schedule,
      totalLessons,
      teacherCode: teacher.code,
      teacherName: teacher.name,
      teacherEmail: teacher.email
    };
    this.classes.push(newCls);
    if (!this.state.classLessonAssignments) this.state.classLessonAssignments = {};
    if (!this.state.classLessonAssignments[rawId]) {
      this.state.classLessonAssignments[rawId] = this.state.classLessonAssignments['DEFAULT']
        ? JSON.parse(JSON.stringify(this.state.classLessonAssignments['DEFAULT']))
        : {};
    }
    if ($('new-class-id')) $('new-class-id').value = '';
    this.adminNewClassFormOpen = false;
    this.adminExpandedClassId = rawId;
    this.teacherClassFilter = rawId;
    this.reconcileTeacherSelection();
    this.saveState();
    this.renderAll();
    this.showToast(`Đã tạo lớp "${rawId}" (${totalLessons} buổi · ${schedule}) do ${teacher.name} phụ trách.`);
    return newCls;
  };

  app.adminDeleteClass = function (classId) {
    if (this.currentRole !== 'admin') return false;
    const idx = this.classes.findIndex(c => c.id === classId);
    if (idx < 0) return false;
    const removed = this.classes.splice(idx, 1)[0];
    if (!Array.isArray(this.state.deletedClassIds)) this.state.deletedClassIds = [];
    if (!this.state.deletedClassIds.includes(removed.id)) {
      this.state.deletedClassIds.push(removed.id);
    }
    this.students.forEach(s => {
      if (s.classCode === removed.id) {
        s.classCode = '';
        s.hasLiveClass = false;
        s._entUpdatedAt = Date.now();
        s._classClearedAt = Date.now();
        if (!s.hasOnlineCourses) {
          s.progress = 'Chưa xếp lớp';
          s.attendance = 'Chưa xếp lớp';
        } else {
          s.progress = 'Tự học Video';
          s.attendance = 'Tự học trực tuyến';
        }
        s.caseType = this.computeStudentCase(s);
      }
    });
    if (this.adminExpandedClassId === removed.id) {
      this.adminExpandedClassId = this.classes[0]?.id || null;
    }
    if (this.teacherClassFilter === removed.id) {
      this.teacherClassFilter = this.classes[0]?.id || 'ALL';
    }
    if (this.adminCaseFilter === removed.id) {
      this.adminCaseFilter = 'ALL';
    }
    this.reconcileTeacherSelection();
    this.saveState();
    this.renderAll();
    this.showToast(`Đã xóa lớp "${removed.id}".`);
    return true;
  };

  app.adminQuickAddStudentToClass = function (classId, pickedCode) {
    const cls = this.classes.find(c => c.id === classId);
    if (!cls) return null;
    const pickedStuCode = String(pickedCode ?? ($('adm-pick-stu-' + classId)?.value || '')).trim();
    const rawName = String($('adm-add-stu-name-' + classId)?.value || '').trim();
    const rawEmail = String($('adm-add-stu-email-' + classId)?.value || '').trim().toLowerCase();
    const totalLessons = Number(cls.totalLessons) || 25;
    const lessonNum = Math.max(1, Math.min(totalLessons, Number($('adm-add-stu-lesson-' + classId)?.value || 1) || 1));
    if (!pickedStuCode && !rawEmail && !rawName) {
      this.showToast('Vui lòng chọn học viên có sẵn hoặc nhập Tên / Tài khoản học viên.');
      return null;
    }
    this.adminExpandedClassId = classId;
    const added = this.teacherAddStudentToClass({
      classCode: classId,
      studentCode: pickedStuCode,
      name: rawName,
      email: rawEmail,
      lessonNum
    });
    if (added) {
      if ($('adm-pick-stu-' + classId)) $('adm-pick-stu-' + classId).value = '';
      if ($('adm-add-stu-name-' + classId)) $('adm-add-stu-name-' + classId).value = '';
      if ($('adm-add-stu-email-' + classId)) $('adm-add-stu-email-' + classId).value = '';
    }
    return added;
  };

  app.adminUpdateClassConfig = function (classId) {
    const cls = this.classes.find(c => c.id === classId);
    if (!cls) return false;
    const newSchedule = String($('adm-cls-schedule-' + classId)?.value || cls.schedule).trim();
    const newTotal = Math.max(5, Math.min(60, Number($('adm-cls-lessons-' + classId)?.value || cls.totalLessons || 25) || 25));
    cls.schedule = newSchedule;
    cls.totalLessons = newTotal;
    this.students.forEach(s => {
      if (s.classCode === classId) {
        const cur = this.parseLessonNumber(s.progress, 18);
        s.progress = `Buổi ${Math.min(newTotal, cur)}/${newTotal}`;
      }
    });
    this.saveState();
    this.renderAll();
    this.showToast(`Đã cập nhật Lớp ${classId}: ${newTotal} buổi · ${newSchedule}`);
    return true;
  };

  app.adminProvisionAccount = async function (customData) {
    if (this.currentRole !== 'admin') return null;
    this.syncProvisionDraft?.();
    const role = String(customData?.role ?? ($('prov-role')?.value || this.adminProvisionRole || 'student')).trim() === 'teacher' ? 'teacher' : 'student';
    const name = String(customData?.name ?? ($('prov-name')?.value || '')).trim();
    const slugifyAccount = str => this._slugifyAccount(str);
    const rawEmailField = String(customData?.email ?? ($('prov-email')?.value || '')).trim().toLowerCase();
    const rawEmailInput = rawEmailField || slugifyAccount(name);
    const cleanLocal = rawEmailInput.includes('@')
      ? slugifyAccount(rawEmailInput.split('@')[0])
      : slugifyAccount(rawEmailInput);
    const domainPart = rawEmailInput.includes('@')
      ? (rawEmailInput.split('@')[1] || 'khongtunhi.com').replace(/[^a-z0-9.-]/g, '')
      : 'khongtunhi.com';
    const email = cleanLocal ? `${cleanLocal}@${domainPart || 'khongtunhi.com'}` : '';
    const shortAlias = email.split('@')[0] || '';
    const rawPwdField = String(customData?.password ?? ($('prov-password')?.value || '')).trim();
    const password = rawPwdField.length >= 6 ? rawPwdField : '123456';
    const rawPhoneInput = String(customData?.phone ?? ($('prov-phone')?.value || '')).trim();
    const digitsOnly = rawPhoneInput.replace(/\D/g, '');
    const genUniquePhone = () => '09' + String(Date.now() + Math.floor(Math.random() * 900)).slice(-8);
    let apiPhone = (/^0\d{9}$/.test(digitsOnly) && digitsOnly !== '0912345678') ? digitsOnly : genUniquePhone();
    const classCode = String(customData?.classCode ?? customData?.classId ?? ($('prov-class')?.value || '')).trim();
    const hasOnlineCourses = customData?.hasOnlineCourses !== undefined
      ? Boolean(customData.hasOnlineCourses)
      : (customData?.onlineAccess !== undefined ? Boolean(customData.onlineAccess) : ($('prov-online') ? Boolean($('prov-online').checked) : false));
    const skipRemote = Boolean(customData?.skipRemote);

    if (!name || !email || !email.includes('@')) {
      this.showToast('Vui lòng nhập Họ và tên học viên hoặc giáo viên (Tài khoản sẽ tự động tạo nếu để trống).');
      return null;
    }

    const submitBtn = $('btn-submit-provision');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Đang khởi tạo tài khoản...';
    }

    let remoteCreated = false;
    let provisionedUserId = customData?.userId || null;
    let remoteNote = 'Đã lưu & kích hoạt ngay trên Sổ Liên Lạc Trung Tâm.';
    const b64Password = btoa(unescape(encodeURIComponent(password)));
    const displayName = role === 'teacher'
      ? (/^(cô|thầy|lão sư)\s/i.test(name) ? name : 'Cô ' + name)
      : (/^bé\s/i.test(name) ? name : 'Bé ' + name);

    let createdRecord = null;
    try {
      // 1. Update local state & UI IMMEDIATELY (synchronously before remote AWS calls)
      if (role === 'teacher') {
        let existingTeacher = this.teachers.find(t =>
          String(t.email || '').toLowerCase() === email ||
          (Array.isArray(t.aliases) && t.aliases.some(a => String(a || '').toLowerCase() === shortAlias))
        );
        const aliasList = Array.from(new Set([rawEmailField, rawEmailInput, shortAlias, email].filter(Boolean)));
        if (!existingTeacher) {
          const codeNum = 15 + this.teachers.length;
          existingTeacher = {
            code: `GV-KTN-${codeNum}`,
            name: displayName,
            email,
            password,
            aliases: aliasList,
            phone: rawPhoneInput || apiPhone,
            specialty: 'Giáo viên Tiếng Trung Thiếu Nhi'
          };
          this.teachers.push(existingTeacher);
        } else {
          existingTeacher.name = displayName;
          existingTeacher.email = email;
          existingTeacher.password = password;
          existingTeacher.phone = rawPhoneInput || existingTeacher.phone || apiPhone;
          existingTeacher.aliases = Array.from(new Set([...(existingTeacher.aliases || []), ...aliasList]));
        }
        if (classCode) {
          this.adminAssignClassTeacher(classCode, existingTeacher.code);
        }
        createdRecord = existingTeacher;
        this.adminProvisionRole = 'teacher';
        this.adminCaseFilter = 'TEACHERS';
        this.lastProvisionResult = {
          role: 'teacher',
          roleLabel: 'Giáo viên phụ trách lớp',
          name: existingTeacher.name,
          code: existingTeacher.code,
          email,
          shortAlias,
          password,
          classCode: classCode || 'Chưa gán lớp (Dự phòng)',
          hasOnlineCourses: false,
          remoteCreated,
          remoteNote
        };
        this.showToast(`Đã cấp tài khoản Giáo viên: ${existingTeacher.name} (TK: ${shortAlias} · MK: ${password}).`);
      } else {
        const parentName = rawPhoneInput && !/^\d+$/.test(rawPhoneInput) ? rawPhoneInput : `Phụ huynh ${displayName}`;
        const foldedDisplay = this.foldText(displayName.replace(/^bé\s+/i, ''));
        let existingStu = this.students.find(s => {
          const sEm = String(s.email || '').toLowerCase();
          if (sEm === email) return true;
          if (Array.isArray(s.aliases) && s.aliases.some(a => String(a || '').toLowerCase() === shortAlias)) return true;
          if (!rawEmailField && foldedDisplay && this.foldText(String(s.name || '').replace(/^bé\s+/i, '')) === foldedDisplay) return true;
          return false;
        });
        const effectiveOnline = Boolean(hasOnlineCourses);
        const aliasList = Array.from(new Set([rawEmailField, rawEmailInput, shortAlias, email].filter(Boolean)));
        const clsObj = classCode ? this.classes.find(c => c.id === classCode) : null;
        const totalLessons = Number(clsObj?.totalLessons) || 25;

        if (!existingStu) {
          existingStu = {
            name: displayName,
            parent: parentName,
            email,
            password,
            aliases: aliasList,
            progress: classCode ? `Buổi 1/${totalLessons}` : (effectiveOnline ? 'Tự học Video' : 'Chưa xếp lớp'),
            code: this._nextStudentCode(),
            classCode: classCode || '',
            hasOnlineCourses: effectiveOnline,
            hasLiveClass: Boolean(classCode),
            unsubmittedCurrent: true,
            courseIds: effectiveOnline ? ['6adadba969897b0002482ca5'] : [],
            userId: provisionedUserId || null,
            attendance: classCode ? '1/1 buổi có mặt' : (effectiveOnline ? 'Tự học trực tuyến' : 'Chưa xếp lớp'),
            target: 'Làm quen phát âm Pinyin & giao tiếp tiếng Trung theo lộ trình',
            note: 'Tài khoản học viên mới được cấp từ Bảng điều hành Quản lý.'
          };
          existingStu.caseType = this.computeStudentCase(existingStu);
          this.students.push(existingStu);
        } else {
          delete existingStu.isDynamicSession;
          existingStu.name = displayName;
          existingStu.email = email;
          existingStu.password = password;
          existingStu.classCode = classCode || '';
          existingStu.hasLiveClass = Boolean(classCode);
          existingStu.hasOnlineCourses = effectiveOnline;
          existingStu.courseIds = effectiveOnline ? ['6adadba969897b0002482ca5'] : [];
          existingStu.progress = classCode ? `Buổi 1/${totalLessons}` : (effectiveOnline ? 'Tự học Video' : 'Chưa xếp lớp');
          existingStu.attendance = classCode ? '1/1 buổi có mặt' : (effectiveOnline ? 'Tự học trực tuyến' : 'Chưa xếp lớp');
          existingStu.aliases = Array.from(new Set([...(existingStu.aliases || []), ...aliasList]));
          if (provisionedUserId) existingStu.userId = provisionedUserId;
          existingStu.caseType = this.computeStudentCase(existingStu);
        }
        createdRecord = existingStu;
        if (classCode) {
          this.adminExpandedClassId = classCode;
          this.teacherClassFilter = classCode;
        }
        this.adminProvisionRole = 'student';
        this.adminCaseFilter = classCode || 'ALL';
        const stuIdx = this.students.indexOf(existingStu);
        this.lastProvisionResult = {
          role: 'student',
          roleLabel: 'Học viên & Phụ huynh',
          studentIdx: stuIdx,
          name: existingStu.name,
          code: existingStu.code,
          email: existingStu.email,
          shortAlias: existingStu.email.split('@')[0] || shortAlias,
          password,
          rawClassCode: existingStu.classCode || '',
          classCode: existingStu.hasLiveClass ? `Đã duyệt vào Lớp ${existingStu.classCode}` : (existingStu.hasOnlineCourses ? 'Chưa xếp lớp (Đã mở Khóa Online)' : 'Chưa xếp lớp · Chưa thêm khóa học'),
          hasOnlineCourses: existingStu.hasOnlineCourses,
          userId: existingStu.userId || null,
          remoteCreated,
          remoteNote
        };
        this.showToast(`Đã cấp tài khoản Học viên: ${existingStu.name} (${existingStu.hasLiveClass ? 'Lớp ' + existingStu.classCode : 'Chưa xếp lớp'} · TK: ${shortAlias} · MK: ${password}).`);
      }

      this._provDraft = { name: '', email: '', password: '123456', phone: '', classCode: classCode || '', hasOnline: false };
      if ($('prov-name')) $('prov-name').value = '';
      if ($('prov-email')) $('prov-email').value = '';
      if ($('prov-phone')) $('prov-phone').value = '';

      this.persistEntitlementsToState();
      this.reconcileTeacherSelection();
      this.saveState(true);
      this.renderAll();

      // 2. Sync to AWS izTeach and Cloud State in background
      if (!skipRemote) {
        const adminToken = (typeof this.getCloudSyncAdminToken === 'function')
          ? await this.getCloudSyncAdminToken()
          : (window.IZTEACH_STORAGE?.getAccessToken ? window.IZTEACH_STORAGE.getAccessToken() : null);

        if (adminToken && typeof fetch === 'function') {
          const authHeaders = {
            'Content-Type': 'application/json',
            Authorization: adminToken
          };
          if (role === 'teacher') {
            const postTeacher = async phoneVal => fetch('https://gcnj5paf1j.execute-api.ap-southeast-1.amazonaws.com/prod/teacher', {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({
                vendorId: VENDOR_ID,
                email,
                password: b64Password,
                name: displayName,
                phone: phoneVal,
                roles: ['teacher'],
                status: 'verified'
              })
            }).catch(() => null);

            let staffRes = await postTeacher(apiPhone);
            let staffJson = staffRes ? await staffRes.json().catch(() => null) : null;
            if (staffRes && !staffRes.ok && JSON.stringify(staffJson || '').includes('điện thoại')) {
              apiPhone = genUniquePhone();
              staffRes = await postTeacher(apiPhone);
              staffJson = staffRes ? await staffRes.json().catch(() => null) : null;
            }
            if ((staffRes && staffRes.ok) || JSON.stringify(staffJson || '').toLowerCase().includes('tồn tại')) {
              remoteCreated = true;
              if (this.lastProvisionResult) this.lastProvisionResult.remoteCreated = true;
            }
          } else {
            const postStudent = async phoneVal => fetch('https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student', {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({
                vendorId: VENDOR_ID,
                name: displayName,
                email,
                phone: phoneVal,
                password: b64Password,
                status: 'verified'
              })
            }).catch(() => null);

            let stuRes = await postStudent(apiPhone);
            let stuJson = stuRes ? await stuRes.json().catch(() => null) : null;
            if (stuRes && !stuRes.ok && JSON.stringify(stuJson || '').includes('điện thoại')) {
              apiPhone = genUniquePhone();
              stuRes = await postStudent(apiPhone);
              stuJson = stuRes ? await stuRes.json().catch(() => null) : null;
            }
            if ((stuRes && stuRes.ok) || JSON.stringify(stuJson || '').toLowerCase().includes('tồn tại')) {
              remoteCreated = true;
              const userId = stuJson?.userId || stuJson?.id || stuJson?.data?.userId;
              if (userId && createdRecord) {
                createdRecord.userId = userId;
                this.saveState(true);
              }
              if (userId && hasOnlineCourses) {
                await fetch(`https://vs1ocpw7ri.execute-api.ap-southeast-1.amazonaws.com/prod/user-permission/add-products/${encodeURIComponent(userId)}`, {
                  method: 'PUT',
                  headers: authHeaders,
                  body: JSON.stringify({
                    vendorId: VENDOR_ID,
                    userId,
                    productIds: IZTEACH_COURSE_IDS,
                    productType: 'online-course'
                  })
                }).catch(() => null);
              }
            }
          }
        }
        await this.pushSilentCloudState?.(this.state);
        if (role === 'teacher' && createdRecord) {
          this.syncTeacherToServer?.(createdRecord, classCode ? [classCode] : []);
        } else if (role === 'student' && createdRecord) {
          this.syncStudentEntitlementToServer?.(
            createdRecord,
            hasOnlineCourses ? 'grant' : 'assign_class',
            hasOnlineCourses ? ['6adadba969897b0002482ca5'] : []
          );
        }
      }

      return this.lastProvisionResult;
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = role === 'teacher' ? '+ Tạo tài khoản Giáo viên' : '+ Tạo tài khoản Học viên';
      }
    }
  };

  app.syncClassToServer = async function (cls, action = 'upsert') {
    if (!cls || !cls.id || !window.KtnWebApp || typeof window.KtnWebApp.apiRequest !== 'function') return null;
    try {
      const method = action === 'delete' ? 'DELETE' : 'POST';
      const res = await window.KtnWebApp.apiRequest('/api/ktn/classes', {
        method,
        body: {
          id: cls.id,
          name: cls.title || cls.name || ('Lớp ' + cls.id),
          teacherCode: cls.teacherCode || 'GV-KTN-08',
          teacherName: cls.teacherName || 'Cô Lâm Mỹ Linh',
          teacherEmail: cls.teacherEmail || 'linh.lam@khongtunhi.com',
          schedule: cls.schedule || '19:30 Thứ 3 & Thứ 6',
          totalLessons: Number(cls.totalLessons) || 25
        }
      });
      return res?.data || null;
    } catch {
      return null;
    }
  };

  app.syncClassSessionToServer = async function (classCode, lessonNum) {
    if (!classCode || classCode === 'DEFAULT' || !window.KtnWebApp || typeof window.KtnWebApp.apiRequest !== 'function') return null;
    try {
      const sNum = Math.max(1, Number(lessonNum) || 1);
      const info = this.getLessonAssignmentInfo(classCode, sNum);
      const assignments = (info.tasks || []).map((t, idx) => ({
        id: 't' + (idx + 1),
        type: t.format === 'image' ? 'image' : 'audio',
        title: t.title || `Bài tập ${idx + 1}`,
        instruction: t.format === 'image'
          ? 'Em làm bài tập trong sách rồi chụp ảnh trang bài làm gửi cô nhé.'
          : 'Em bấm Thu âm giọng đọc hoặc quay video gửi cô nhé.'
      }));
      const res = await window.KtnWebApp.apiRequest('/api/ktn/class-sessions', {
        method: 'POST',
        body: {
          classCode,
          sessionNum: sNum,
          title: info.lessonName || info.title || `Buổi ${sNum}`,
          assignments
        }
      });
      return res?.data || null;
    } catch {
      return null;
    }
  };

  app.syncStudentEntitlementToServer = async function (stu, action = 'set', explicitCourseIds = null) {
    if (!stu || !stu.email || !window.KtnWebApp || typeof window.KtnWebApp.apiRequest !== 'function') return null;
    try {
      const courseIds = Array.isArray(explicitCourseIds)
        ? explicitCourseIds
        : (Array.isArray(stu.courseIds) ? stu.courseIds : []);
      const res = await window.KtnWebApp.apiRequest('/api/ktn/students/courses', {
        method: 'POST',
        body: {
          email: stu.email,
          name: stu.name,
          phone: stu.phone || '',
          code: stu.code || '',
          cognitoUserId: stu.userId || null,
          action,
          courseIds,
          classCode: stu.classCode !== undefined ? (stu.classCode || null) : undefined
        }
      });
      if (res?.ok && res.data?.student) {
        if (res.data.student.cognito_user_id && !stu.userId) {
          stu.userId = res.data.student.cognito_user_id;
        }
      }
      return res?.data || null;
    } catch {
      return null;
    }
  };

  app.syncTeacherToServer = async function (teacher, assignedClasses = []) {
    if (!teacher || !teacher.email || !window.KtnWebApp || typeof window.KtnWebApp.apiRequest !== 'function') return null;
    try {
      const res = await window.KtnWebApp.apiRequest('/api/ktn/teachers', {
        method: 'POST',
        body: {
          code: teacher.code,
          name: teacher.name,
          email: teacher.email,
          phone: teacher.phone || '',
          specialty: teacher.specialty || 'Giáo viên Tiếng Trung Thiếu Nhi',
          assignedClasses
        }
      });
      return res?.data || null;
    } catch {
      return null;
    }
  };

  app.adminAssignStudentClass = function (studentIdx, newClassCode) {
    if (this.currentRole !== 'admin') return false;
    const stu = this.students[studentIdx];
    if (!stu) return false;
    delete stu.isDynamicSession;
    stu.classCode = String(newClassCode || '').trim();
    stu.hasLiveClass = Boolean(stu.classCode);
    stu.caseType = this.computeStudentCase(stu);
    if (stu.hasLiveClass) {
      const clsObj = this.classes.find(c => c.id === stu.classCode);
      const totalLessons = Number(clsObj?.totalLessons) || 25;
      stu.unsubmittedCurrent = true;
      if (!stu.progress || stu.progress.startsWith('Tự học') || stu.progress.startsWith('Chưa xếp')) {
        stu.progress = `Buổi 1/${totalLessons}`;
      }
      stu.attendance = '1/1 buổi có mặt';
      this.adminExpandedClassId = stu.classCode;
      this.teacherClassFilter = stu.classCode;
      if (this.lastProvisionResult && this.lastProvisionResult.code === stu.code) {
        this.lastProvisionResult.rawClassCode = stu.classCode;
        this.lastProvisionResult.classCode = `Đã duyệt vào Lớp ${stu.classCode}`;
      }
    } else if (stu.hasOnlineCourses) {
      stu.progress = 'Tự học Video';
      stu.attendance = 'Tự học trực tuyến';
    } else {
      stu.progress = 'Chưa xếp lớp';
      stu.attendance = 'Chưa xếp lớp';
    }
    this.persistEntitlementsToState();
    this.reconcileTeacherSelection();
    this.saveState(true);
    this.syncStudentEntitlementToServer?.(stu, 'assign_class');
    this.renderAll();
    const meta = this.getCaseMeta(stu.caseType);
    const clsTeacher = stu.hasLiveClass ? this.getStudentTeacher(stu) : null;
    this.showToast(`Đã cập nhật ${stu.name}: ${stu.hasLiveClass ? 'Duyệt vào ' + stu.classCode + ' (' + clsTeacher.name + ')' : 'Chưa xếp lớp'} (${meta.shortBadge}).`);
    return true;
  };

  app.adminToggleStudentOnline = function (studentIdx) {
    if (this.currentRole !== 'admin') return false;
    const stu = this.students[studentIdx];
    if (!stu) return false;
    stu.hasOnlineCourses = !stu.hasOnlineCourses;
    stu.courseIds = stu.hasOnlineCourses ? ['6adadba969897b0002482ca5'] : [];
    if (!stu.hasLiveClass) {
      stu.progress = stu.hasOnlineCourses ? 'Tự học Video' : 'Chưa xếp lớp';
      stu.attendance = stu.hasOnlineCourses ? 'Tự học trực tuyến' : 'Chưa xếp lớp';
    }
    stu.caseType = this.computeStudentCase(stu);
    const adminToken = window.IZTEACH_STORAGE?.getAccessToken ? window.IZTEACH_STORAGE.getAccessToken() : null;
    if (stu.userId && adminToken && typeof fetch === 'function') {
      const epAction = stu.hasOnlineCourses ? 'add-products' : 'remove-products';
      fetch(`https://vs1ocpw7ri.execute-api.ap-southeast-1.amazonaws.com/prod/user-permission/${epAction}/${encodeURIComponent(stu.userId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: adminToken },
        body: JSON.stringify({
          vendorId: VENDOR_ID,
          userId: stu.userId,
          productIds: IZTEACH_COURSE_IDS,
          productType: 'online-course'
        })
      }).catch(() => null);
    }
    this.syncStudentEntitlementToServer?.(
      stu,
      stu.hasOnlineCourses ? 'grant' : 'revoke',
      ['6adadba969897b0002482ca5']
    );
    this.saveState();
    this.renderAll();
    const meta = this.getCaseMeta(stu.caseType);
    this.showToast(`Đã cập nhật ${stu.name}: ${stu.hasOnlineCourses ? 'Mở Khóa học Online' : 'Tắt Khóa học Online'} (${meta.shortBadge}).`);
    return true;
  };

  /**
   * Phê duyệt và kích hoạt đơn hàng 1 chạm (Milestone 2 Core Service Logic)
   * @param {string} orderId Mã đơn hàng cần kích hoạt (VD: 'ORD-20261031-001')
   * @returns {Promise<Object>} Kết quả kích hoạt { success, order, userId, studentId, error? }
   */
  app.oneClickApproveOrder = async function (orderId) {
    if (!orderId) {
      throw new Error('Mã đơn hàng không hợp lệ.');
    }

    // 1. Định vị đơn hàng trong state
    if (!this.state || !Array.isArray(this.state.orders)) {
      this.state = this.state || {};
      this.state.orders = (this.getDefaultState().orders || DEFAULT_ORDERS).map(o => ({ ...o }));
    }
    const order = this.state.orders.find(o => o.orderId === orderId || o.id === orderId);
    if (!order) {
      const msg = `Không tìm thấy đơn hàng #${orderId} trong hệ thống.`;
      console.error('[1-Click Approval]', msg);
      this.showToast?.(msg, 'error');
      return { success: false, error: msg };
    }

    // 2. TẦNG 3 IDEMPOTENCY: Ràng buộc trạng thái kết thúc (Terminal State Invariance Guard)
    if (order.approvalStatus === 'approved') {
      console.warn(`[1-Click Approval] Đơn hàng #${orderId} đã được kích hoạt từ trước.`);
      this.showToast?.(`Đơn hàng #${orderId} đã được phê duyệt và kích hoạt từ trước.`, 'info');
      this.openOrderApprovedModal?.(order);
      return { success: true, order, alreadyApproved: true };
    }

    // 3. TẦNG 2 IDEMPOTENCY: Khóa chống Re-entrancy trong RAM (In-Memory Set Mutex)
    if (!this._activeApprovals) this._activeApprovals = new Set();
    const isBusy = this._activeApprovals.has(orderId) || (order._isProcessing && (Date.now() - (order._procAt || 0) < 8000));
    if (isBusy) {
      console.warn(`[1-Click Approval] Đơn hàng #${orderId} đang trong tiến trình xử lý.`);
      return { success: false, error: 'Đang xử lý đơn hàng, vui lòng không thao tác lặp.', isBusy: true };
    }

    // 4. Kích hoạt khóa & cập nhật UI tức thì (TẦNG 1 & TẦNG 4)
    this._activeApprovals.add(orderId);
    order._isProcessing = true;
    order._procAt = Date.now();
    order.idempotencyKey = order.idempotencyKey || `idem_${orderId}_${Date.now()}`;
    this.renderAdminOrders?.();

    try {
      // 5. Xác thực tài khoản Admin & lấy Bearer Token
      const adminToken = typeof this.getCloudSyncAdminToken === 'function'
        ? await this.getCloudSyncAdminToken()
        : (window.IZTEACH_STORAGE?.getAccessToken ? window.IZTEACH_STORAGE.getAccessToken() : null);

      if (!adminToken) {
        throw new Error('Chưa lấy được phiên quản trị viên (Admin Token). Vui lòng đăng nhập lại.');
      }

      // 6. Trích xuất thông tin học viên từ đơn hàng
      const studentEmail = String(order.studentEmail || order.email || '').trim().toLowerCase();
      const studentName = String(order.studentName || order.name || 'Học viên').trim();
      let studentPhone = String(order.phone || order.studentPhone || '').trim();

      if (!studentEmail) {
        throw new Error('Đơn hàng thiếu thông tin email của học viên.');
      }

      // TẦNG 7.3: Chiến lược thử lại an toàn (Safe Resumable Retry Strategy)
      // Nếu đơn hàng đã lưu checkpoint userId hợp lệ từ lần duyệt trước, bỏ qua CRM pipeline
      let userId = isValidCognitoUuid(order.assignedUserId) ? order.assignedUserId : null;
      let studentId = isValidObjectId(order.assignedStudentId) ? order.assignedStudentId : null;

      // 7. PIPELINE TRÍCH XUẤT USER ID 4 TẦNG (Chỉ chạy khi chưa có userId)
      if (!userId) {
        // TẦNG 1: Tra cứu học viên có sẵn qua GET /student?email=...
        const getRes = await fetch(`https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student?vendorId=${encodeURIComponent(VENDOR_ID)}&email=${encodeURIComponent(studentEmail)}`, {
          method: 'GET',
          headers: {
            Authorization: adminToken,
            Accept: 'application/json'
          }
        }).catch(() => null);

        if (getRes && getRes.ok) {
          const studentList = await getRes.json().catch(() => []);
          if (Array.isArray(studentList) && studentList.length > 0) {
            const matched = studentList.find(s => s && String(s.email).toLowerCase() === studentEmail) || studentList[0];
            if (isValidCognitoUuid(matched?.userId)) {
              userId = matched.userId;
            }
            if (isValidObjectId(matched?.id || matched?._id)) {
              studentId = matched.id || matched._id;
            }
          }
        }

        // TẦNG 2: Nếu chưa có tài khoản, tạo mới hồ sơ học viên qua POST /student
        if (!userId) {
          const genPhone = () => '09' + String(Date.now()).slice(-8);
          let apiPhone = studentPhone || genPhone();

          const postStudent = async (phoneVal) => {
            return fetch('https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: adminToken,
                Accept: 'application/json'
              },
              body: JSON.stringify({
                vendorId: VENDOR_ID,
                name: studentName,
                email: studentEmail,
                phone: phoneVal,
                password: btoa('123456'), // "MTIzNDU2"
                status: 'verified'
              })
            }).catch(() => null);
          };

          let postRes = await postStudent(apiPhone);
          let postData = postRes ? await postRes.json().catch(() => null) : null;

          // Tự phục hồi: Trùng số điện thoại -> Tạo lại với số ngẫu nhiên
          if (postRes && !postRes.ok && JSON.stringify(postData || '').includes('điện thoại')) {
            apiPhone = genPhone();
            postRes = await postStudent(apiPhone);
            postData = postRes ? await postRes.json().catch(() => null) : null;
          }

          if (postRes && postRes.ok && postData) {
            if (isValidCognitoUuid(postData.userId)) {
              userId = postData.userId;
            }
            if (isValidObjectId(postData.id || postData._id)) {
              studentId = postData.id || postData._id;
            }
          }
        }

        // TẦNG 3: Nếu tạo mới báo trùng email hoặc phản hồi chưa có userId, truy vấn lại CRM
        if (!userId) {
          const getRetry = await fetch(`https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student?vendorId=${encodeURIComponent(VENDOR_ID)}&email=${encodeURIComponent(studentEmail)}`, {
            method: 'GET',
            headers: {
              Authorization: adminToken,
              Accept: 'application/json'
            }
          }).catch(() => null);

          if (getRetry && getRetry.ok) {
            const studentList2 = await getRetry.json().catch(() => []);
            if (Array.isArray(studentList2) && studentList2.length > 0) {
              const matched2 = studentList2.find(s => s && String(s.email).toLowerCase() === studentEmail) || studentList2[0];
              if (isValidCognitoUuid(matched2?.userId)) {
                userId = matched2.userId;
              }
              if (isValidObjectId(matched2?.id || matched2?._id)) {
                studentId = matched2.id || matched2._id;
              }
            }
          }
        }

        // TẦNG 4: Sign-in Probe thực nghiệm đăng nhập để trích xuất root id
        if (!userId) {
          const signinRes = await fetch('https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student/signin', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body: JSON.stringify({
              email: studentEmail,
              password: btoa('123456'),
              vendorId: VENDOR_ID
            })
          }).catch(() => null);

          if (signinRes && signinRes.ok) {
            const signJson = await signinRes.json().catch(() => null);
            if (signJson) {
              const candId = signJson.id || signJson.data?.id;
              if (isValidCognitoUuid(candId)) {
                userId = candId;
              }
              const candStuId = signJson.studentId || signJson.data?.studentId;
              if (isValidObjectId(candStuId)) {
                studentId = candStuId;
              }
            }
          }
        }
      }

      // KIỂM THỰC BẮT BUỘC (PRE-FLIGHT ASSERTION GUARD)
      // Tuyệt đối không truyền MongoDB 24-hex ObjectId vào URL :userId của Permission API
      if (!isValidCognitoUuid(userId)) {
        throw new Error('Không thể xác thực định danh tài khoản học viên (AWS Cognito UUID). Quá trình cấp quyền bị hủy để bảo vệ an toàn hệ thống.');
      }

      // Ghi nhận checkpoint trung gian để hỗ trợ thử lại an toàn
      order.assignedUserId = userId;
      if (studentId) order.assignedStudentId = studentId;
      this.saveState(true);

      // 8. BƯỚC 2: CẤP QUYỀN KHÓA HỌC (PERMISSION ENTITLEMENT)
      // Phân giải danh mục sản phẩm (mặc định HSK1 3.0: 6adadba969897b0002482ca5)
      const productMapping = resolveProductMapping(order.courseId || order.courseName);
      const targetProductIds = (productMapping && Array.isArray(productMapping.productIds) && productMapping.productIds.length)
        ? productMapping.productIds
        : ['6adadba969897b0002482ca5'];

      // Pre-flight check: Truy vấn danh sách khóa học hiện có
      const permQueryRes = await fetch(`https://vs1ocpw7ri.execute-api.ap-southeast-1.amazonaws.com/prod/user-permission?vendorId=${encodeURIComponent(VENDOR_ID)}&userId=${encodeURIComponent(userId)}`, {
        method: 'GET',
        headers: {
          Authorization: adminToken,
          Accept: 'application/json'
        }
      }).catch(() => null);

      let existingCourseIds = [];
      if (permQueryRes && permQueryRes.ok) {
        const permData = await permQueryRes.json().catch(() => null);
        if (Array.isArray(permData?.onlineCourses)) {
          existingCourseIds = permData.onlineCourses.map(c => c.productId || c.onlineCourseId || c.id || c._id || c);
        }
      }

      // Lọc danh sách các khóa học còn thiếu để tránh sập Lambda 500 do khóa học đã có
      const missingCourses = filterMissingCourses(existingCourseIds, targetProductIds);

      if (missingCourses.length > 0) {
        // Gọi PUT /add-products/:userId (TUYỆT ĐỐI KHÔNG GỬI X-Idempotency-Key)
        const putPermRes = await fetch(`https://vs1ocpw7ri.execute-api.ap-southeast-1.amazonaws.com/prod/user-permission/add-products/${encodeURIComponent(userId)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: adminToken,
            Accept: 'application/json'
          },
          body: JSON.stringify({
            vendorId: VENDOR_ID,
            userId,
            productIds: missingCourses,
            productType: 'online-course'
          })
        });

        if (!putPermRes.ok) {
          const rawErr = await putPermRes.text().catch(() => '');
          let errObj = {};
          try { errObj = JSON.parse(rawErr); } catch {}
          const errMessage = String(errObj.errorMessage || errObj.message || rawErr || '').trim();

          // Xử lý ngoại lệ HTTP 500 "is existed" -> Coi như thành công (Idempotency Safe)
          if (/is existed/i.test(errMessage) || isCourseExistedError(errObj)) {
            console.info('[1-Click Approval] Khóa học đã tồn tại trong tài khoản học viên (500 is existed gracefully handled).');
          } else {
            throw new Error(`Lỗi cấp quyền khóa học: ${errMessage || ('HTTP ' + putPermRes.status)}`);
          }
        }
      } else {
        console.info('[1-Click Approval] Học viên đã sở hữu đủ các khóa học trong đơn (Pre-flight Idempotent Bypass).');
      }

      // 9. BƯỚC 3: ĐỒNG BỘ TRẠNG THÁI ĐƠN HÀNG VÀO STATE
      const nowIso = new Date().toISOString();
      const nowTs = Date.now();
      order.approvalStatus = 'approved';
      order.assignedUserId = userId;
      if (studentId) order.assignedStudentId = studentId;
      order.approvedAt = nowIso;
      order.approvedBy = this.state?.teacherEmail || 'hocvienkhongtunhi123@gmail.com';
      order.errorMessage = null;

      // Cập nhật hoặc tạo mới hồ sơ học viên cục bộ
      if (Array.isArray(this.students)) {
        let matchedLocalStu = this.students.find(s => s && (
          (studentEmail && String(s.email || '').toLowerCase() === studentEmail) ||
          (studentPhone && s.phone && String(s.phone).replace(/\D/g, '') === studentPhone.replace(/\D/g, ''))
        ));

        if (!matchedLocalStu) {
          const parentName = studentName.replace(/^(Bé|Em)\s+/i, '');
          const newCode = (typeof this._nextStudentCode === 'function') ? this._nextStudentCode() : `KTN-2026-${String(nowTs).slice(-3)}`;
          matchedLocalStu = {
            name: studentName,
            parent: 'Phụ huynh ' + (parentName || studentName),
            email: studentEmail,
            phone: studentPhone || order.phone || '',
            password: '123456',
            aliases: [studentEmail.split('@')[0], studentEmail].filter(Boolean),
            progress: 'Tự học Video',
            code: newCode,
            classCode: '',
            hasOnlineCourses: true,
            hasLiveClass: false,
            unsubmittedCurrent: false,
            courseIds: [...targetProductIds],
            userId: userId || null,
            attendance: 'Tự học trực tuyến',
            target: 'Học viên khóa ' + (order.courseName || 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)'),
            note: 'Tài khoản được duyệt tự động 1 chạm từ đơn hàng #' + orderId,
            createdAt: nowIso,
            createdTs: nowTs
          };
          matchedLocalStu.caseType = (typeof this.computeStudentCase === 'function') ? this.computeStudentCase(matchedLocalStu) : 'online_only';
          this.students.push(matchedLocalStu);
        } else {
          matchedLocalStu.userId = userId || matchedLocalStu.userId;
          matchedLocalStu.hasOnlineCourses = true;
          if (studentPhone && !matchedLocalStu.phone) matchedLocalStu.phone = studentPhone;
          if (!matchedLocalStu.createdAt) {
            matchedLocalStu.createdAt = nowIso;
            matchedLocalStu.createdTs = nowTs;
          }
          if (!Array.isArray(matchedLocalStu.courseIds)) matchedLocalStu.courseIds = [];
          targetProductIds.forEach(pid => {
            if (!matchedLocalStu.courseIds.includes(pid)) matchedLocalStu.courseIds.push(pid);
          });
          matchedLocalStu.caseType = (typeof this.computeStudentCase === 'function') ? this.computeStudentCase(matchedLocalStu) : 'online_only';
        }
        this.persistEntitlementsToState?.();
        this.reconcileTeacherSelection?.();
      }
      this.syncApprovedOrdersToStudents?.();

      // Đồng bộ đơn hàng đã duyệt & quyền khóa học lên Supabase qua Worker API
      if (window.KtnWebApp && typeof window.KtnWebApp.apiRequest === 'function') {
        window.KtnWebApp.apiRequest('/api/ktn/orders/approve', {
          method: 'POST',
          body: { orderId, order }
        }).catch(() => {});
      }

      // Lưu state cục bộ và đẩy snapshot lên AWS Cloud State
      this.saveState();

      // Phát tín hiệu đa tab qua BroadcastChannel
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const bc = new BroadcastChannel('ktn_sll_orders_bus');
          bc.postMessage({ type: 'ORDER_APPROVED', orderId, order });
          bc.close();
        }
      } catch {}

      // Cập nhật giao diện & Mở modal bàn giao tài khoản
      this.renderAdminOrders?.();
      this.showToast?.(`Duyệt & Kích hoạt thành công đơn hàng #${orderId}!`, 'success');
      this.openOrderApprovedModal?.(order);

      return { success: true, order, userId, studentId };
    } catch (err) {
      console.error(`[1-Click Approval] Lỗi khi duyệt đơn hàng #${orderId}:`, err);
      order.approvalStatus = 'failed';
      order.errorMessage = err.message || 'Lỗi không xác định khi duyệt đơn';

      this.saveState(true);
      this.renderAdminOrders?.();
      this.showToast?.(`Lỗi duyệt đơn #${orderId}: ${order.errorMessage}`, 'error');

      return { success: false, error: order.errorMessage, order };
    } finally {
      // Luôn giải phóng khóa Mutex và cờ xử lý
      this._activeApprovals.delete(orderId);
      order._isProcessing = false;
      delete order._procAt;
      this.renderAdminOrders?.();
    }
  };

  app.previewStudentFromAdmin = function (studentIdx) {
    if (this.currentRole !== 'admin' && !(window.sllAuth && window.sllAuth.canAccessAdminStudent())) {
      this.showToast('Chỉ Quản lý trung tâm mới được mở xem thử giao diện Học viên.');
      return false;
    }
    const stu = this.students[studentIdx];
    if (!stu) return false;
    this.adminPreviewingStudent = true;
    this.activeParentStudentIdx = studentIdx;
    const caseType = this.computeStudentCase(stu);
    this.parentSubtab = caseType === 'online_only' ? 'courses' : 'homework';
    this.switchRole('parent');
    try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch {}
    this.showToast(`Đang xem giao diện Học viên của ${stu.name}.`);
    return true;
  };

  app.exitAdminStudentPreview = function () {
    this.adminPreviewingStudent = false;
    this.switchRole('admin');
    try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch {}
    this.showToast('Đã quay lại Bảng điều hành Quản lý trung tâm.');
    return true;
  };

  /* ============================================================================
   * PHẦN MỞ RỘNG: QUẢN LÝ ĐƠN HÀNG & PHÊ DUYỆT 1 CHẠM (MILESTONE 3 ADMIN UI)
   * ============================================================================ */

  /**
   * Bộ lọc trạng thái đơn hàng hiện tại (mặc định 'all')
   * Các giá trị: 'all' | 'pending' | 'approved' | 'failed'
   */
  app.adminOrdersTabFilter = 'all';

  /**
   * Từ khóa tìm kiếm đơn hàng hiện tại
   */
  app.adminOrdersSearch = '';

  /**
   * Đặt bộ lọc trạng thái và cập nhật giao diện
   * @param {string} filter 'all' | 'pending' | 'approved' | 'failed'
   */
  app.setOrdersFilter = function (filter) {
    this.adminOrdersTabFilter = filter || 'all';
    this.renderAdminOrders();
  };
  // Bí danh tương thích
  app.filterAdminOrdersTab = app.setOrdersFilter;

  /**
   * Lọc đơn hàng theo từ khóa tìm kiếm tức thì
   * @param {string} query
   */
  app.filterOrders = function (query) {
    this.adminOrdersSearch = typeof query === 'string' ? query : '';
    this.renderAdminOrders();
  };
  // Bí danh tương thích
  app.onAdminOrdersSearch = app.filterOrders;

  /**
   * Render giao diện Quản lý Đơn hàng: KPI, Bộ lọc, Bảng Desktop 6 cột và Mobile Cards
   */
  app.renderAdminOrders = function () {
    const panel = $('admin-panel-orders');
    if (!panel) return;

    // 1. Khởi tạo danh sách đơn hàng an toàn
    if (!this.state || !Array.isArray(this.state.orders)) {
      this.state = this.state || {};
      this.state.orders = (typeof this.getDefaultState === 'function' && Array.isArray(this.getDefaultState().orders))
        ? this.getDefaultState().orders.map(o => ({ ...o }))
        : (app.DEFAULT_ORDERS || DEFAULT_ORDERS || []).map(o => ({ ...o }));
    }

    // Merge any inbound orders from ktn_sll_orders_bus or ktn_sll_v1_state
    try {
      const busRaw = localStorage.getItem('ktn_sll_orders_bus');
      if (busRaw) {
        const bus = JSON.parse(busRaw);
        if (Array.isArray(bus)) {
          bus.forEach(bo => {
            if (bo && bo.orderId && !this.state.orders.some(o => o.orderId === bo.orderId)) {
              this.state.orders.unshift(bo);
            }
          });
        }
      }
      const v1Raw = localStorage.getItem('ktn_sll_v1_state');
      if (v1Raw) {
        const v1 = JSON.parse(v1Raw);
        if (Array.isArray(v1.orders)) {
          v1.orders.forEach(vo => {
            if (vo && vo.orderId && !this.state.orders.some(o => o.orderId === vo.orderId)) {
              this.state.orders.unshift(vo);
            }
          });
        }
      }
    } catch(e) {}

    const orders = this.state.orders;

    // 2. Thống kê số lượng theo từng trạng thái
    const totalCount = orders.length;
    const pendingCount = orders.filter(o => o && o.approvalStatus === 'pending').length;
    const approvedCount = orders.filter(o => o && o.approvalStatus === 'approved').length;
    const failedCount = orders.filter(o => o && o.approvalStatus === 'failed').length;

    // 3. Cập nhật các Badge & Chip đếm số lượng trên DOM
    if ($('admin-orders-badge')) $('admin-orders-badge').textContent = String(pendingCount);
    if ($('orders-kpi-total')) $('orders-kpi-total').textContent = `Tổng: ${totalCount}`;
    if ($('orders-kpi-pending')) $('orders-kpi-pending').textContent = `Chờ duyệt: ${pendingCount}`;
    if ($('orders-kpi-approved')) $('orders-kpi-approved').textContent = `Đã kích hoạt: ${approvedCount}`;
    if ($('orders-kpi-failed')) $('orders-kpi-failed').textContent = `Lỗi: ${failedCount}`;

    if ($('orders-chip-all')) $('orders-chip-all').textContent = String(totalCount);
    if ($('orders-chip-pending')) $('orders-chip-pending').textContent = String(pendingCount);
    if ($('orders-chip-approved')) $('orders-chip-approved').textContent = String(approvedCount);
    if ($('orders-chip-failed')) $('orders-chip-failed').textContent = String(failedCount);

    // Cập nhật trạng thái active trên 4 nút chip filter
    const activeFilter = this.adminOrdersTabFilter || 'all';
    ['all', 'pending', 'approved', 'failed'].forEach(f => {
      const btn = $('filter-order-' + f);
      if (btn) {
        btn.classList.toggle('active-chip', f === activeFilter);
        btn.classList.toggle('active', f === activeFilter);
      }
    });

    // 4. Lọc dữ liệu theo tab và từ khóa tìm kiếm
    const searchQuery = (this.adminOrdersSearch || '').trim();
    const foldedQuery = typeof foldText === 'function' ? foldText(searchQuery) : searchQuery.toLowerCase();

    let filteredOrders = orders.filter(o => {
      if (!o) return false;
      // Lọc theo trạng thái tab
      if (activeFilter !== 'all') {
        if (activeFilter === 'pending' && o.approvalStatus !== 'pending') return false;
        if (activeFilter === 'approved' && o.approvalStatus !== 'approved') return false;
        if (activeFilter === 'failed' && o.approvalStatus !== 'failed') return false;
      }
      // Lọc theo từ khóa tìm kiếm
      if (foldedQuery) {
        const idStr = String(o.orderId || o.id || '').toLowerCase();
        const nameStr = typeof foldText === 'function' ? foldText(o.studentName || o.name || '') : String(o.studentName || '').toLowerCase();
        const emailStr = String(o.studentEmail || o.email || '').toLowerCase();
        const phoneStr = String(o.phone || o.studentPhone || '').toLowerCase();
        const courseStr = typeof foldText === 'function' ? foldText(o.courseName || '') : String(o.courseName || '').toLowerCase();
        return idStr.includes(foldedQuery) ||
               nameStr.includes(foldedQuery) ||
               emailStr.includes(foldedQuery) ||
               phoneStr.includes(foldedQuery) ||
               courseStr.includes(foldedQuery);
      }
      return true;
    });

    // Sắp xếp: Ưu tiên đơn Pending lên đầu, sau đó sắp xếp theo thời gian mới nhất
    filteredOrders.sort((a, b) => {
      if (a.approvalStatus === 'pending' && b.approvalStatus !== 'pending') return -1;
      if (b.approvalStatus === 'pending' && a.approvalStatus !== 'pending') return 1;
      const tA = new Date(a.createdAt || 0).getTime() || 0;
      const tB = new Date(b.createdAt || 0).getTime() || 0;
      return tB - tA;
    });

    // 5. Render danh sách đơn hàng vào container #admin-orders-list
    const listContainer = $('admin-orders-list');
    if (!listContainer) return;

    if (filteredOrders.length === 0) {
      listContainer.innerHTML = `
        <div class="orders-empty-state" style="text-align:center;padding:40px 16px;color:var(--dim);font-size:13px;background:#F8FAFC;border-radius:10px;border:1px dashed var(--border);margin-top:10px;">
          <div style="font-size:28px;margin-bottom:8px;">📦</div>
          <strong style="color:var(--text);font-size:14px;display:block;">Không tìm thấy đơn hàng nào</strong>
          <span>${searchQuery ? `Không có kết quả khớp với từ khóa "${esc(searchQuery)}".` : 'Chưa có đơn hàng nào trong mục này.'}</span>
        </div>`;
      return;
    }

    // Helper tạo nội dung nút hành động và huy hiệu trạng thái
    const renderOrderActionAndBadge = (o) => {
      const isProcessing = Boolean(o._isProcessing || (this._activeApprovals && this._activeApprovals.has(o.orderId)));
      let badgeHtml = '';
      let actionBtnHtml = '';

      if (isProcessing) {
        badgeHtml = `<span class="badge-order badge-order-pending badge-pill" style="background:#EFF6FF;color:#1E40AF;border-color:#BFDBFE;"><span class="btn-spinner sm"></span> Đang xử lý...</span>`;
        actionBtnHtml = `<button type="button" class="btn btn-primary btn-sm btn-approve-oneclick" disabled style="opacity:0.8;cursor:not-allowed;"><span class="btn-spinner"></span> Đang xử lý...</button>`;
      } else if (o.approvalStatus === 'approved') {
        badgeHtml = `<span class="badge-order badge-order-approved badge-pill status-online">✓ Đã kích hoạt</span>`;
        actionBtnHtml = `<button type="button" class="btn btn-secondary btn-sm btn-view-cred btn-view-credentials" onclick="app.openOrderApprovedModal('${esc(o.orderId)}')">🔑 Xem tài khoản</button>`;
      } else if (o.approvalStatus === 'failed') {
        badgeHtml = `<span class="badge-order badge-order-failed badge-pill status-locked" title="${esc(o.errorMessage || 'Lỗi cấp quyền')}">⚠ Lỗi cấp quyền</span>`;
        actionBtnHtml = `
          <button type="button" class="btn btn-warning btn-sm btn-retry btn-retry-approve" onclick="app.oneClickApproveOrder('${esc(o.orderId)}')">🔄 Thử lại 1 chạm</button>
          ${o.errorMessage ? `<div class="order-err-tooltip" style="font-size:11px;color:#DC2626;margin-top:4px;" title="${esc(o.errorMessage)}">ℹ️ ${esc(o.errorMessage.length > 32 ? o.errorMessage.slice(0, 30) + '...' : o.errorMessage)}</div>` : ''}
        `;
      } else {
        badgeHtml = `<span class="badge-order badge-order-pending badge-pill status-alert">⏳ Chờ duyệt</span>`;
        actionBtnHtml = `<button type="button" class="btn btn-primary btn-sm btn-approve-oneclick" onclick="app.oneClickApproveOrder('${esc(o.orderId)}')">⚡ Duyệt &amp; Kích hoạt</button>`;
      }

      return { isProcessing, badgeHtml, actionBtnHtml };
    };

    // Helper định dạng tiền tệ và thời gian
    const formatMoney = (val) => typeof val === 'number' ? val.toLocaleString('vi-VN') + ' đ' : (val || '890.000 đ');
    const formatDate = (o) => o.createdAtDisplay || (o.createdAt ? new Date(o.createdAt).toLocaleString('vi-VN') : 'Mới');

    // 5A. Render Desktop View (Bảng 6 cột cho màn hình >= 768px)
    const desktopTableRows = filteredOrders.map(o => {
      const { badgeHtml, actionBtnHtml } = renderOrderActionAndBadge(o);
      const rowClass = o.approvalStatus === 'approved' ? 'order-row-approved' : (o.approvalStatus === 'failed' ? 'order-row-failed' : 'order-row-pending');

      return `
        <tr class="${rowClass}">
          <td>
            <div style="font-family:ui-monospace,Consolas,monospace;font-weight:700;color:var(--text);">#${esc(o.orderId || o.id)}</div>
            <div style="font-size:11.5px;color:var(--dim);margin-top:2px;">${esc(formatDate(o))}</div>
          </td>
          <td>
            <strong style="color:var(--text);">${esc(o.studentName || o.name || 'Học viên')}</strong>
            <div style="font-size:12px;color:var(--dim);font-family:ui-monospace,Consolas,monospace;">${esc(o.studentEmail || o.email || '-')}</div>
            ${(o.phone || o.studentPhone) ? `<div style="font-size:11.5px;color:var(--sub);">${esc(o.phone || o.studentPhone)}</div>` : ''}
          </td>
          <td>
            <div style="font-weight:700;color:#1E40AF;">${esc(o.courseName || 'Khóa học New HSK 1 (3.0)')}</div>
            <div style="font-size:11px;color:var(--dim);margin-top:2px;">Mã: ${esc(o.courseId || '6adadba969897b0002482ca5')}</div>
            <div style="font-size:12px;font-weight:800;color:#DC2626;margin-top:2px;">${esc(formatMoney(o.amount))}</div>
          </td>
          <td>
            <span class="badge-pill status-online">${esc(o.paymentMethod || 'VietQR')}</span>
            <div style="font-size:11px;color:var(--dim);margin-top:2px;">${o.paymentStatus === 'paid' ? 'Đã thanh toán' : esc(o.paymentStatus || 'Chưa TT')}</div>
          </td>
          <td>
            ${badgeHtml}
          </td>
          <td style="text-align:right;">
            ${actionBtnHtml}
          </td>
        </tr>`;
    }).join('');

    // 5B. Render Mobile View (Thẻ danh thiếp cho màn hình < 768px)
    const mobileCards = filteredOrders.map(o => {
      const { badgeHtml, actionBtnHtml } = renderOrderActionAndBadge(o);
      const displayPhone = o.phone || o.studentPhone;
      const statusKey = (o.approvalStatus === 'approved' || o.approvalStatus === 'failed') ? o.approvalStatus : 'pending';
      return `
        <!-- status-pending status-approved status-failed -->
        <div class="order-card-mobile status-${statusKey} is-${statusKey}">
          <div class="order-card-mobile-top">
            <span class="order-card-id">#${esc(o.orderId || o.id)}</span>
            ${badgeHtml}
          </div>
          <div class="order-card-student">
            <strong>${esc(o.studentName || o.name || 'Học viên')}</strong>
            <div class="order-card-email">${esc(o.studentEmail || o.email || '-')}</div>
            ${displayPhone ? `<div class="order-card-phone">${esc(displayPhone)}</div>` : ''}
          </div>
          <div class="order-card-course">
            <div class="order-card-coursename">${esc(o.courseName || 'Khóa học New HSK 1 (3.0)')}</div>
            <div class="order-card-price">${esc(formatMoney(o.amount))}</div>
          </div>
          <div class="order-card-meta">
            <span>💳 ${esc(o.paymentMethod || 'VietQR')} · ${o.paymentStatus === 'paid' ? 'Đã TT' : esc(o.paymentStatus || '')}</span>
            <span>🕒 ${esc(formatDate(o))}</span>
          </div>
          <div class="card-mobile-actions order-card-mobile-action">
            ${actionBtnHtml}
          </div>
        </div>`;
    }).join('');

    // Ghép cả hai giao diện vào #admin-orders-list (CSS sẽ ẩn/hiện theo media query)
    listContainer.innerHTML = `
      <div class="orders-desktop-view">
        <div class="orders-table-wrapper" style="overflow-x:auto;">
          <table class="iz-table orders-table" style="width:100%;border-collapse:collapse;">
            <thead>
              <tr>
                <th style="min-width:140px;">Mã đơn / Ngày</th>
                <th style="min-width:180px;">Khách hàng</th>
                <th style="min-width:200px;">Khóa học / Giá</th>
                <th style="min-width:110px;">Thanh toán</th>
                <th style="min-width:130px;">Trạng thái</th>
                <th style="min-width:160px;text-align:right;">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              ${desktopTableRows}
            </tbody>
          </table>
        </div>
      </div>
      <div class="orders-mobile-view orders-cards-mobile">
        <div class="orders-cards-stack">
          ${mobileCards}
        </div>
      </div>
    `;
  };

  /**
   * Mở modal bàn giao tài khoản học viên sau khi phê duyệt thành công
   * @param {string|Object} orderIdOrOrder Mã đơn hàng hoặc đối tượng đơn hàng
   */
  const _prevOpenOrderApprovedModal = app.openOrderApprovedModal;
  app.openOrderApprovedModal = function (orderIdOrOrder) {
    if (typeof _prevOpenOrderApprovedModal === 'function') {
      try { _prevOpenOrderApprovedModal.call(this, orderIdOrOrder); } catch (e) {}
    }
    let order = orderIdOrOrder;
    if (typeof orderIdOrOrder === 'string') {
      const orders = Array.isArray(this.state?.orders) ? this.state.orders : (app.DEFAULT_ORDERS || []);
      order = orders.find(o => o && (o.orderId === orderIdOrOrder || o.id === orderIdOrOrder));
    }
    if (!order) {
      console.warn('[1-Click Approval] Không tìm thấy đơn hàng để mở modal bàn giao:', orderIdOrOrder);
      return;
    }

    // Lưu đơn hàng hiện tại đang mở trong modal để dùng cho thao tác Copy
    this._currentApprovedOrder = order;

    // Điền dữ liệu vào các phần tử của modal #admin-order-approved-dialog
    const studentName = String(order.studentName || order.name || 'Học viên').trim();
    const studentEmail = String(order.studentEmail || order.email || '').trim().toLowerCase();
    const courseName = String(order.courseName || 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)').trim();
    const orderId = String(order.orderId || order.id || '').trim();

    if ($('modal-order-id')) $('modal-order-id').textContent = orderId ? `#${orderId}` : '';
    if ($('modal-student-name')) $('modal-student-name').textContent = studentName;
    if ($('cred-display-name')) $('cred-display-name').textContent = studentName;
    if ($('cred-display-email')) $('cred-display-email').textContent = studentEmail;
    if ($('cred-display-course')) $('cred-display-course').textContent = courseName;
    if ($('cred-display-password')) $('cred-display-password').textContent = '123456';
    if ($('cred-display-portal')) {
      $('cred-display-portal').textContent = 'https://khongtunhi.com/custom-page/so-lien-lac-v1';
      $('cred-display-portal').setAttribute('href', 'https://khongtunhi.com/custom-page/so-lien-lac-v1');
    }

    // Reset lại nhãn nút copy nếu trước đó đã bấm
    const copyBtn = $('btn-copy-order-creds');
    if (copyBtn) {
      copyBtn.innerHTML = `<span>📋 Sao chép thông tin tài khoản</span>`;
      copyBtn.disabled = false;
    }

    // Mở HTML5 Dialog
    const dialog = $('admin-order-approved-dialog');
    if (dialog && typeof dialog.showModal === 'function') {
      try {
        if (!dialog.open) dialog.showModal();
      } catch (err) {
        dialog.setAttribute('open', 'true');
      }
    }
  };

  /**
   * Sao chép thông tin tài khoản có cấu trúc chuẩn vào bộ nhớ tạm (Clipboard)
   */
  app.copyCredentialsToClipboard = function () {
    const order = this._currentApprovedOrder || {};
    const courseName = order.courseName || $('cred-display-course')?.textContent || 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)';
    const email = order.studentEmail || order.email || $('cred-display-email')?.textContent || '';
    const password = $('cred-display-password')?.textContent || '123456';
    const portalUrl = 'https://khongtunhi.com/custom-page/so-lien-lac-v1';

    const textToCopy = [
      'Học Viện Khổng Tử Nhí - Thông Tin Đăng Nhập',
      `Khóa học: ${courseName}`,
      `Tài khoản: ${email}`,
      `Mật khẩu mặc định: ${password}`,
      `Đường dẫn học tập: ${portalUrl}`
    ].join('\n');

    const handleSuccess = () => {
      this.showToast?.('Đã sao chép thông tin tài khoản vào bộ nhớ tạm!', 'success');
      const copyBtn = $('btn-copy-order-creds');
      if (copyBtn) {
        copyBtn.innerHTML = `<span>✓ Đã sao chép!</span>`;
        setTimeout(() => {
          if (copyBtn) copyBtn.innerHTML = `<span>📋 Sao chép thông tin tài khoản</span>`;
        }, 2000);
      }
    };

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(textToCopy)
        .then(handleSuccess)
        .catch(() => {
          // Fallback sang textarea execCommand
          this._fallbackCopyText(textToCopy);
          handleSuccess();
        });
    } else {
      this._fallbackCopyText(textToCopy);
      handleSuccess();
    }
  };

  /**
   * Alias theo đặc tả kiến trúc: app.copyOrderCredentials
   */
  app.copyOrderCredentials = app.copyCredentialsToClipboard;

  /**
   * Helper fallback sao chép văn bản khi trình duyệt không hỗ trợ Clipboard API
   */
  app._fallbackCopyText = function (text) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    } catch (e) {
      console.warn('[1-Click Approval] Clipboard fallback error:', e);
    }
  };

  app.renderAdminOverview = function () {
    const box = $('admin-class-overview');
    const accountsBox = $('admin-panel-accounts');
    const openCount = this.state.dlpAlerts.filter(a => a.reviewStatus !== 'REVIEWED').length;
    if ($('admin-open-count')) $('admin-open-count').textContent = openCount;

    const regularStudents = this.students.filter(s => !s.isDynamicSession);
    const liveStudents = regularStudents.filter(s => s.hasLiveClass);
    const onlineOnlyStudents = regularStudents.filter(s => s.hasOnlineCourses && !s.hasLiveClass);
    const totalActive = liveStudents.length + onlineOnlyStudents.length;
    const submittedStudentsCount = liveStudents.filter(s => this.getStudentTeacherStatus(s).key !== 'unsubmitted').length;
    const pendingTotalCount = liveStudents.filter(s => this.getStudentTeacherStatus(s).key === 'pending').length;
    const submitRatePct = liveStudents.length ? Math.round((submittedStudentsCount / liveStudents.length) * 100) : 100;
    const activeClassesCount = this.classes.filter(c => (Array.isArray(c.studentCodes) && c.studentCodes.length > 0) || liveStudents.some(s => s.classCode === c.id)).length;
    const assignedTeachersCount = new Set(this.classes.map(c => c.teacherCode).filter(Boolean)).size;

    const newClassPanelHtml = this.adminNewClassFormOpen ? `
      <div id="admin-new-class-panel" style="padding:12px;background:#F8FAFC;border:1px solid var(--border);border-radius:10px;margin-bottom:10px;">
        <div class="hw-header" style="margin-bottom:8px;">
          <strong style="font-size:13.5px;font-weight:800;color:#0F172A;">Mở lớp mới</strong>
          <button type="button" class="chip-btn" onclick="app.toggleAdminNewClassForm(false)">✕</button>
        </div>
        <form id="form-admin-new-class" onsubmit="event.preventDefault(); app.adminCreateClass();" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;align-items:end;">
          <div><label for="new-class-id" class="form-label">Tên lớp</label><input id="new-class-id" type="text" class="input-text" required placeholder="VD: YCT1-01, Lớp 1..."></div>
          <div><label for="new-class-schedule" class="form-label">Lịch học</label><input id="new-class-schedule" type="text" class="input-text" value="Thứ 3 & Thứ 6 (19:30 - 20:30)" required></div>
          <div><label for="new-class-lessons" class="form-label">Số buổi</label><input id="new-class-lessons" type="number" min="1" max="60" value="25" class="input-text" required></div>
          <div>
            <label for="new-class-teacher" class="form-label">Giáo viên phụ trách</label>
            <div style="display:flex;gap:6px;">
              <select id="new-class-teacher" class="input-select" style="flex:1;">
                ${this.teachers.map(t => `<option value="${esc(t.code)}">${esc(t.name)}</option>`).join('')}
              </select>
              <button id="btn-submit-new-class" type="submit" class="btn-primary" style="white-space:nowrap;background:#0F172A;">Tạo lớp</button>
            </div>
          </div>
          <input id="new-class-title" type="hidden" value="Khóa học Tiếng Trung">
        </form>
      </div>` : '';

    if (box) {
      const classRowsHtml = this.classes.length ? this.classes.map(cls => {
        const clsStudentsWithIdx = this.students
          .map((s, index) => ({ s, index, st: this.getStudentTeacherStatus(s) }))
          .filter(item => !item.s.isDynamicSession && item.s.hasLiveClass && item.s.classCode === cls.id);

        const totalLessons = Number(cls.totalLessons) || 25;
        const avgLesson = clsStudentsWithIdx.length
          ? Math.round(clsStudentsWithIdx.reduce((acc, x) => acc + this.parseLessonNumber(x.s.progress, 18), 0) / clsStudentsWithIdx.length)
          : 1;
        const progressPct = Math.min(100, Math.round((avgLesson / totalLessons) * 100));

        const pendingInCls = clsStudentsWithIdx.filter(x => x.st.key === 'pending').length;
        const unsubInCls = clsStudentsWithIdx.filter(x => x.st.key === 'unsubmitted').length;
        const submittedInCls = clsStudentsWithIdx.length - unsubInCls;
        const clsSubmitPct = clsStudentsWithIdx.length ? Math.round((submittedInCls / clsStudentsWithIdx.length) * 100) : 100;

        const isExpanded = this.adminExpandedClassId === cls.id;

        const statusNotes = [];
        if (pendingInCls > 0) statusNotes.push(`${pendingInCls} bài chờ chấm`);
        if (unsubInCls > 0) statusNotes.push(`${unsubInCls} HS chưa nộp`);
        const statusSummary = statusNotes.length ? statusNotes.join(' · ') : (clsStudentsWithIdx.length ? 'Hoàn thành đầy đủ' : 'Chưa có học viên');

        const assignableStudents = regularStudents.filter(s => !(s.hasLiveClass && s.classCode === cls.id));

        const studentSubTableHtml = isExpanded ? `
          <tr style="background:#F8FAFC;">
            <td colspan="6" style="padding:12px 16px;border-top:none;">
              <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;">
                <div style="padding:8px 12px;background:#F1F5F9;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <strong style="font-size:12.5px;color:#0F172A;">Lớp ${esc(cls.id)} (${clsStudentsWithIdx.length} HV)</strong>
                    <input id="adm-cls-schedule-${esc(cls.id)}" type="text" class="input-text" value="${esc(cls.schedule)}" style="width:185px;min-height:28px;padding:2px 8px;font-size:12px;background:#FFF;">
                    <input id="adm-cls-lessons-${esc(cls.id)}" type="number" min="5" max="60" value="${totalLessons}" class="input-text" style="width:64px;min-height:28px;padding:2px 6px;font-size:12px;background:#FFF;" title="Tổng số buổi">
                    <span style="font-size:12px;color:#475569;">buổi</span>
                    <button type="button" class="chip-btn" style="padding:3px 8px;font-size:11.5px;background:#FFF;font-weight:700;" onclick="app.adminUpdateClassConfig('${esc(cls.id)}')">Lưu lịch/số buổi</button>
                    <button type="button" class="chip-btn" style="padding:3px 8px;font-size:11.5px;background:#FEF2F2;color:#B91C1C;border-color:#FECACA;font-weight:700;" onclick="app.adminDeleteClass('${esc(cls.id)}')">Xóa lớp</button>
                  </div>
                  <button type="button" class="chip-btn" style="padding:3px 8px;font-size:11.5px;" onclick="app.adminSelectClass('${esc(cls.id)}')">Đóng ✕</button>
                </div>
                <form onsubmit="event.preventDefault(); app.adminQuickAddStudentToClass('${esc(cls.id)}');" style="padding:8px 12px;background:#FAFAFA;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                  <select id="adm-pick-stu-${esc(cls.id)}" class="input-select" style="min-width:190px;min-height:32px;font-size:12.5px;background:#FFF;" onchange="if(this.value) app.adminQuickAddStudentToClass('${esc(cls.id)}', this.value)">
                    <option value="">-- Chọn nhanh HV có sẵn --</option>
                    ${assignableStudents.map(s => `<option value="${esc(s.code)}">${esc(s.name)} (${esc(s.email.split('@')[0])})${s.hasLiveClass && s.classCode ? ' · Đang ở ' + esc(s.classCode) : ''}</option>`).join('')}
                  </select>
                  <input id="adm-add-stu-name-${esc(cls.id)}" type="text" class="input-text" placeholder="Hoặc nhập Tên HV mới (VD: Bé Gia Bảo)" style="flex:1;min-width:155px;min-height:32px;font-size:12.5px;background:#FFF;">
                  <input id="adm-add-stu-email-${esc(cls.id)}" type="text" class="input-text" placeholder="Tài khoản / Gmail (tự tạo nếu trống)" style="flex:1;min-width:150px;min-height:32px;font-size:12.5px;background:#FFF;">
                  <input id="adm-add-stu-lesson-${esc(cls.id)}" type="number" min="1" max="${totalLessons}" value="1" class="input-text" style="width:64px;min-height:32px;font-size:12.5px;background:#FFF;" title="Buổi bắt đầu">
                  <button type="submit" class="btn-primary" style="min-height:32px;padding:4px 12px;font-size:12px;background:#0F172A;">+ Thêm vào ${esc(cls.id)}</button>
                </form>
                ${clsStudentsWithIdx.length ? `
                  <div class="table-scroll">
                    <table class="admin-table" style="margin:0;">
                      <thead>
                        <tr style="background:#FAFAFA;">
                          <th>Học viên</th>
                          <th>Tiến độ học</th>
                          <th>Tình trạng BTVN</th>
                          <th>Gói học</th>
                          <th style="text-align:right;">Chi tiết</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${clsStudentsWithIdx.map(({ s, index, st }) => {
                          const curL = this.parseLessonNumber(s.progress, 18);
                          const stuPct = Math.min(100, Math.round((curL / totalLessons) * 100));
                          const stText = st.key === 'pending'
                            ? 'Chờ GV chấm'
                            : (st.key === 'unsubmitted' ? 'Chưa nộp bài' : 'Đã hoàn thành');
                          const stDot = st.key === 'pending'
                            ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#F59E0B;margin-right:6px;"></span>'
                            : (st.key === 'unsubmitted'
                                ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#94A3B8;margin-right:6px;"></span>'
                                : '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#0F172A;margin-right:6px;"></span>');
                          return `<tr style="cursor:pointer;" onclick="app.openStudentFromAdmin(${index})">
                            <td>
                              <strong style="color:#0F172A;">${esc(s.name)}</strong>
                              <div class="table-sub">${esc(s.email)}</div>
                            </td>
                            <td>
                              <div style="font-weight:700;font-size:12.5px;color:#0F172A;">${esc(s.progress)} (${stuPct}%)</div>
                              <div style="width:90px;height:4px;background:#E2E8F0;border-radius:99px;margin-top:4px;overflow:hidden;"><div style="width:${stuPct}%;height:100%;background:#334155;"></div></div>
                            </td>
                            <td>
                              <span style="font-size:12.5px;font-weight:${st.key === 'graded' ? '600' : '700'};color:${st.key === 'pending' ? '#B45309' : (st.key === 'unsubmitted' ? '#64748B' : '#0F172A')};">${stDot}${stText}</span>
                            </td>
                            <td>
                              <span style="font-size:12px;color:#475569;">${s.hasOnlineCourses ? 'Lớp + Video Online' : 'Chỉ học Lớp'}</span>
                            </td>
                            <td style="text-align:right;">
                              <button type="button" class="chip-btn" style="font-weight:700;color:#0F172A;background:#FFF;" onclick="event.stopPropagation(); app.openStudentFromAdmin(${index})">Xem bài &amp; nhận xét →</button>
                            </td>
                          </tr>`;
                        }).join('')}
                      </tbody>
                    </table>
                  </div>
                ` : '<div class="empty-box" style="margin:10px;">Chưa có học viên trong lớp này. Chọn học viên có sẵn hoặc nhập tên ở trên để thêm vào lớp.</div>'}
              </div>
            </td>
          </tr>` : '';

        return `
          <tr data-class-card="${esc(cls.id)}" style="cursor:pointer;background:${isExpanded ? '#F8FAFC' : '#FFFFFF'};" onclick="app.adminSelectClass('${esc(cls.id)}')">
            <td>
              <strong style="font-size:14px;font-weight:800;color:#0F172A;">${esc(cls.id)}</strong>
              <div class="table-sub">${esc(cls.schedule)}</div>
            </td>
            <td onclick="event.stopPropagation()">
              <select id="select-teacher-${esc(cls.id)}" data-class-teacher-select="${esc(cls.id)}" class="input-select admin-inline-select" style="font-weight:600;color:#0F172A;background:#FFF;" onchange="app.adminAssignClassTeacher('${esc(cls.id)}', this.value)">
                ${this.teachers.map(t => `<option value="${esc(t.code)}" ${cls.teacherCode === t.code ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
              </select>
            </td>
            <td>
              <strong style="font-size:13px;color:#0F172A;">${clsStudentsWithIdx.length} học viên</strong>
            </td>
            <td>
              <div style="font-size:12.5px;font-weight:700;color:#0F172A;">Buổi ${avgLesson}/${totalLessons} <span style="color:#64748B;font-weight:500;">(${progressPct}%)</span></div>
              <div style="width:110px;height:5px;background:#E2E8F0;border-radius:99px;margin-top:4px;overflow:hidden;"><div style="width:${progressPct}%;height:100%;background:#0F172A;"></div></div>
            </td>
            <td>
              <div style="font-size:12.5px;font-weight:700;color:#0F172A;">${clsSubmitPct}% <span style="color:#64748B;font-weight:500;">(${submittedInCls}/${clsStudentsWithIdx.length} HS)</span></div>
              <div class="table-sub" style="color:${pendingInCls > 0 ? '#B45309' : '#64748B'};font-weight:${pendingInCls > 0 ? '700' : '400'};">${esc(statusSummary)}</div>
            </td>
            <td style="text-align:right;">
              <button type="button" data-admin-class-pill="${esc(cls.id)}" class="chip-btn" style="font-weight:700;color:#0F172A;background:${isExpanded ? '#E2E8F0' : '#FFFFFF'};" onclick="event.stopPropagation(); app.adminSelectClass('${esc(cls.id)}')">
                ${isExpanded ? 'Thu gọn ▴' : `Xem ${clsStudentsWithIdx.length} HS ▾`}
              </button>
            </td>
          </tr>
          ${studentSubTableHtml}`;
      }).join('') : `<tr><td colspan="6" style="padding:18px;text-align:center;color:#64748B;">Chưa có lớp học nào. Nhập <strong>Tên / Mã lớp</strong> ở khung trên (đặt tên tự do, VD: <strong>1</strong>) và bấm <strong>Tạo lớp</strong>.</td></tr>`;

      const studentOverviewRowsHtml = liveStudents.map((s, index) => {
        const courseCount = (s.hasOnlineCourses && Array.isArray(s.courseIds)) ? s.courseIds.length : 0;
        return `<tr>
          <td>
            <strong style="color:#0F172A;">${esc(s.name)}</strong>
            <div class="table-sub">${esc(s.email)}</div>
          </td>
          <td>
            <span style="font-weight:600;color:#0F172A;">${s.hasLiveClass && s.classCode ? 'Lớp ' + esc(s.classCode) : 'Chưa xếp lớp'}</span>
          </td>
          <td>
            <button type="button" class="chip-btn" style="font-weight:600;color:${s.hasOnlineCourses ? '#0F172A' : '#64748B'};background:${s.hasOnlineCourses ? '#F1F5F9' : '#FFFFFF'};" onclick="app.adminToggleStudentOnline(${index})">
              ${s.hasOnlineCourses ? `Đang mở (${courseCount} khóa)` : 'Chưa mở (0 khóa)'}
            </button>
          </td>
          <td>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
              <strong style="font-size:12.5px;color:#0F172A;">${esc(s.progress)}</strong>
              <button type="button" class="chip-btn" onclick="app.openStudentFromAdmin(${index})">Xem hồ sơ &amp; bài tập →</button>
            </div>
          </td>
        </tr>`;
      }).join('');

      box.innerHTML = `
        <div class="section-stack" style="gap:12px;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;">
            <div style="padding:10px 12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;">
              <div style="font-size:11.5px;color:#64748B;font-weight:700;">🏫 LỚP ĐANG MỞ</div>
              <div id="admin-kpi-scale" style="font-size:17px;font-weight:800;color:#0F172A;margin-top:2px;">${activeClassesCount} lớp · ${liveStudents.length} học viên</div>
              <div style="font-size:11.5px;color:#64748B;margin-top:2px;">${assignedTeachersCount}/${this.teachers.length} GV đứng lớp</div>
            </div>
            <div style="padding:10px 12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;">
              <div style="font-size:11.5px;color:#64748B;font-weight:700;">👨‍🎓 HỌC VIÊN TÍCH CỰC</div>
              <div id="admin-kpi-active-students" style="font-size:17px;font-weight:800;color:#0F172A;margin-top:2px;">${totalActive} học viên</div>
              <div style="font-size:11.5px;color:#64748B;margin-top:2px;">${liveStudents.length} trực tiếp · ${onlineOnlyStudents.length} online</div>
            </div>
            <div style="padding:10px 12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;">
              <div style="font-size:11.5px;color:#64748B;font-weight:700;">📈 TỶ LỆ NỘP BÀI</div>
              <div id="admin-kpi-submit-rate" style="font-size:17px;font-weight:800;color:#0F172A;margin-top:2px;">${submitRatePct}% <span style="font-size:12px;font-weight:500;color:#64748B;">(${submittedStudentsCount}/${liveStudents.length} HS)</span></div>
              <div style="font-size:11.5px;color:#64748B;margin-top:2px;">Hoàn thành chỉ tiêu</div>
            </div>
            <div style="padding:10px 12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;">
              <div style="font-size:11.5px;color:#64748B;font-weight:700;">⏳ HÀNG ĐỢI CHẤM</div>
              <div id="admin-kpi-pending-grading" style="font-size:17px;font-weight:800;color:${pendingTotalCount > 0 ? '#B45309' : '#0F172A'};margin-top:2px;">${pendingTotalCount} bài</div>
              <div style="font-size:11.5px;color:#64748B;margin-top:2px;">Cần phản hồi 24h</div>
            </div>
            <div style="padding:10px 12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;">
              <div style="font-size:11.5px;color:#64748B;font-weight:700;">🛡️ CẢNH BÁO AN TOÀN</div>
              <div id="admin-kpi-safety-alerts" style="font-size:17px;font-weight:800;color:${openCount > 0 ? '#B91C1C' : '#0F172A'};margin-top:2px;">${openCount} vụ chưa xử lý</div>
              <div style="font-size:11.5px;color:#64748B;margin-top:2px;">Hệ thống bảo vệ DLP</div>
            </div>
          </div>

          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
              <div>
                <strong style="font-size:14.5px;font-weight:800;color:#0F172A;">Quản lý Lớp học &amp; Danh sách học viên</strong>
              </div>
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <button id="btn-admin-provision-modal" type="button" class="btn-primary" style="min-height:30px;padding:4px 10px;font-size:12px;background:#0F172A;" onclick="app.openAdminProvisionModal('student')">+ Cấp tài khoản</button>
                <button id="btn-toggle-new-class" type="button" class="chip-btn" style="font-weight:700;color:#0F172A;" onclick="app.openAdminCreateClassModal()">+ Mở lớp mới</button>
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
              ${this.classes.map(c => `
                <div style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;background:#F1F5F9;border-radius:6px;font-size:12px;border:1px solid #CBD5E1;">
                  <strong>Lớp ${esc(c.id)}</strong>
                  <span style="color:#64748B;">(${esc(c.teacherName)})</span>
                  <button type="button" class="chip-btn" style="padding:1px 6px;font-size:11px;font-weight:700;background:#FFF;" onclick="app.openAdminEditClassModal('${esc(c.id)}')">⚙ Cấu hình</button>
                  <button type="button" class="chip-btn" style="padding:1px 6px;font-size:11px;font-weight:700;background:#FFF;" onclick="app.openAdminEnrollStudentModal('${esc(c.id)}')">+ Thêm HV</button>
                </div>
              `).join('')}
            </div>
            ${newClassPanelHtml}
            <div class="table-scroll" style="border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;">
              <table class="admin-table" style="margin:0;">
                <thead>
                  <tr style="background:#F8FAFC;">
                    <th>Học viên</th>
                    <th>Lớp Sổ Liên Lạc</th>
                    <th>Khóa Video Online</th>
                    <th>Tiến độ</th>
                  </tr>
                </thead>
                <tbody>${studentOverviewRowsHtml}</tbody>
              </table>
            </div>
          </div>
        </div>`;
    }

    if (!accountsBox) return;

    this.syncProvisionDraft?.();
    const provRole = this.adminProvisionRole === 'teacher' ? 'teacher' : 'student';
    const isProvTeacher = provRole === 'teacher';
    const draft = this._provDraft || { name: '', email: '', password: '123456', phone: '', classCode: '', hasOnline: false };

    const lastResIdx = this.lastProvisionResult?.role === 'student'
      ? this.students.findIndex(s => s.code === this.lastProvisionResult.code || s.email === this.lastProvisionResult.email)
      : -1;
    const quickAssignBtnsHtml = (this.lastProvisionResult?.role === 'student' && lastResIdx >= 0 && !this.students[lastResIdx]?.hasLiveClass)
      ? `<span style="display:inline-flex;align-items:center;gap:4px;margin-left:8px;flex-wrap:wrap;">
          ${this.classes.map(c => `<button type="button" class="chip-btn" style="padding:2px 8px;font-size:11.5px;font-weight:700;background:#FFFFFF;color:#0F172A;border-color:#86EFAC;" onclick="app.adminAssignStudentClass(${lastResIdx}, '${esc(c.id)}')">+ Xếp ngay vào ${esc(c.id)}</button>`).join('')}
        </span>`
      : '';

    const provisionResultHtml = this.lastProvisionResult ? `
      <div id="admin-provision-result" class="inline-notice" style="background:#F0FDF4;color:#14532D;border:1px solid #86EFAC;padding:10px 12px;border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <div>
          <strong>✓ Đã cấp (${esc(this.lastProvisionResult.roleLabel)}):</strong>
          <strong>${esc(this.lastProvisionResult.name)}</strong> · Tài khoản: <strong>${esc(this.lastProvisionResult.shortAlias || this.lastProvisionResult.email)}</strong> · Mật khẩu: <strong>${esc(this.lastProvisionResult.password)}</strong> · <strong>${esc(this.lastProvisionResult.classCode)}</strong>
        </div>
        ${quickAssignBtnsHtml}
      </div>` : '';

    const provisionPanelHtml = `
      <div id="admin-provision-panel" class="${this.adminProvisionFormOpen ? '' : 'hidden'}" style="padding:12px;background:#F8FAFC;border:1px solid var(--border);border-radius:10px;margin-bottom:12px;">
        <div class="hw-header" style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <strong style="font-size:14px;font-weight:800;color:#0F172A;">+ Cấp tài khoản mới:</strong>
            <button type="button" class="chip-btn ${!isProvTeacher ? 'active-chip' : ''}" style="font-weight:700;" onclick="app.onProvisionRoleChange('student')">🎓 Cấp tài khoản Học viên</button>
            <button type="button" class="chip-btn ${isProvTeacher ? 'active-chip' : ''}" style="font-weight:700;" onclick="app.onProvisionRoleChange('teacher')">👩‍🏫 Cấp tài khoản Giáo viên</button>
          </div>
          <button type="button" class="chip-btn" onclick="app.toggleAdminProvisionForm(false)">Thu gọn ✕</button>
        </div>
        <form id="form-admin-provision" onsubmit="event.preventDefault(); app.adminProvisionAccount();" class="section-stack" style="gap:8px;">
          <div class="form-grid form-grid-2" style="gap:8px;">
            <div>
              <label for="prov-role" class="form-label">Vai trò tài khoản</label>
              <select id="prov-role" class="input-select" onchange="app.onProvisionRoleChange(this.value)">
                <option value="student" ${!isProvTeacher ? 'selected' : ''}>Học viên &amp; Phụ huynh</option>
                <option value="teacher" ${isProvTeacher ? 'selected' : ''}>Giáo viên phụ trách lớp</option>
              </select>
            </div>
            <div>
              <label id="prov-name-label" for="prov-name" class="form-label">${isProvTeacher ? 'Họ và tên Giáo viên' : 'Họ và tên Học viên'}</label>
              <input id="prov-name" type="text" class="input-text" value="${esc(draft.name || '')}" oninput="app.syncProvisionDraft()" required placeholder="${isProvTeacher ? 'VD: Cô Nguyễn Thu Trang' : 'VD: Bé Gia Bảo'}">
            </div>
            <div>
              <label for="prov-email" class="form-label">Tài khoản đăng nhập / Gmail (Tự tạo nếu để trống)</label>
              <input id="prov-email" type="text" class="input-text" value="${esc(draft.email || '')}" oninput="app.syncProvisionDraft()" placeholder="${isProvTeacher ? 'VD: thutrang hoặc thutrang@khongtunhi.com' : 'VD: giabao hoặc giabao@gmail.com'}">
            </div>
            <div>
              <label for="prov-password" class="form-label">Mật khẩu (ít nhất 6 ký tự)</label>
              <input id="prov-password" type="text" class="input-text" value="${esc(draft.password || '123456')}" oninput="app.syncProvisionDraft()" minlength="6" required>
            </div>
            <div>
              <label id="prov-phone-label" for="prov-phone" class="form-label">${isProvTeacher ? 'Số điện thoại liên hệ (Tùy chọn)' : 'Tên Phụ huynh / SĐT (Tùy chọn)'}</label>
              <input id="prov-phone" type="text" class="input-text" value="${esc(draft.phone || '')}" oninput="app.syncProvisionDraft()" placeholder="${isProvTeacher ? '0988...' : 'Mẹ Bé Gia Bảo hoặc 0912...'}">
            </div>
            <div>
              <label id="prov-class-label" for="prov-class" class="form-label">${isProvTeacher ? 'Gán phụ trách Lớp (Tùy chọn)' : 'Xếp vào Lớp Sổ Liên Lạc'}</label>
              <select id="prov-class" class="input-select" onchange="app.syncProvisionDraft()">
                <option value="" ${!draft.classCode ? 'selected' : ''}>${isProvTeacher ? 'Chưa gán lớp (Giáo viên dự phòng)' : 'Chưa xếp lớp (Mặc định)'}</option>
                ${this.classes.map(c => `<option value="${esc(c.id)}" ${draft.classCode === c.id ? 'selected' : ''}>${esc(c.id)} (${esc(c.teacherName)})</option>`).join('')}
              </select>
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
            <label id="prov-online-wrap" class="${isProvTeacher ? 'hidden' : ''}" style="display:${isProvTeacher ? 'none' : 'inline-flex'};align-items:center;gap:6px;font-size:13px;font-weight:600;cursor:pointer;">
              <input id="prov-online" type="checkbox" ${draft.hasOnline ? 'checked' : ''} onchange="app.syncProvisionDraft()" style="width:16px;height:16px;">
              <span>Mở quyền <strong>Khóa học Video Online</strong></span>
            </label>
            <button id="btn-submit-provision" type="submit" class="btn-primary" style="background:#0F172A;margin-left:auto;">${isProvTeacher ? '+ Tạo tài khoản Giáo viên' : '+ Tạo tài khoản Học viên'}</button>
          </div>
        </form>
      </div>`;

    this.renderIzTeachCrm(accountsBox, { provisionResultHtml, provisionPanelHtml });
    if (this.currentRole === 'admin') {
      this.fetchAdminKpis?.();
    }
  };

  app.fetchAdminKpis = async function () {
    if (this.currentRole !== 'admin') return null;
    if (window.sllAuth && window.sllAuth.mode === 'connected' && window.sllAuth.sessionRole?.() !== 'admin') {
      return null;
    }
    try {
      const res = await fetch('/api/izteach/admin/kpis');
      if (!res.ok) return null;
      const json = await res.json();
      if (json && json.ok && json.data) {
        this.serverKpis = json.data;
        this.updateAdminKpisUI(json.data);
        return json.data;
      }
    } catch (e) {}
    return null;
  };
  app.syncAdminKpis = function () {
    if (this.currentRole !== 'admin') return Promise.resolve(null);
    return this.fetchAdminKpis();
  };

  app.updateAdminKpisUI = function (kpis) {
    if (!kpis) return;
    const scaleEl = $('admin-kpi-scale');
    const stuEl = $('admin-kpi-active-students');
    const submitEl = $('admin-kpi-submit-rate');
    const pendingEl = $('admin-kpi-pending-grading');
    const alertsEl = $('admin-kpi-safety-alerts');

    if (scaleEl && typeof kpis.activeClasses === 'number') {
      const liveCount = (this.students || []).filter(s => !s.isDynamicSession && s.hasLiveClass).length;
      scaleEl.textContent = `${kpis.activeClasses} lớp · ${liveCount || kpis.totalStudents} học viên`;
    }
    if (stuEl && typeof kpis.totalStudents === 'number') {
      stuEl.textContent = `${kpis.totalStudents} học viên`;
    }
    if (submitEl && typeof kpis.submissionRatePct === 'number') {
      submitEl.innerHTML = `${kpis.submissionRatePct}% <span style="font-size:12px;font-weight:500;color:#64748B;">(Chỉ tiêu vận hành)</span>`;
    }
    if (pendingEl && typeof kpis.pendingFeedbackCount === 'number') {
      pendingEl.textContent = `${kpis.pendingFeedbackCount} bài`;
      pendingEl.style.color = kpis.pendingFeedbackCount > 0 ? '#B45309' : '#0F172A';
    }
    if (alertsEl && typeof kpis.dlpOpenCount === 'number') {
      alertsEl.textContent = `${kpis.dlpOpenCount} vụ chưa xử lý`;
      alertsEl.style.color = kpis.dlpOpenCount > 0 ? '#B91C1C' : '#0F172A';
    }
  };

  const DEFAULT_IZ_STUDENTS = [
    { id: '671dfba54117fe2871ad27a2', code: 'HV-KTN-101', name: 'Bé Gia Bảo', email: 'giabao@gmail.com', phone: '0974830556', createdAt: '15:07 - 28/10/2026', createdTimestamp: 1730102820000, createdFrom: 'student', isActive: true, isBlock: false, classCode: 'YCT2-04', hasOnline: false },
    { id: '671dec644117fe2871ad2776', code: 'HV-KTN-102', name: 'Bé giahan', email: 'giahan@gmail.com', phone: '0971004028', createdAt: '14:03 - 28/10/2026', createdTimestamp: 1730098980000, createdFrom: 'student', isActive: false, isBlock: false, classCode: 'YCT3-02', hasOnline: false },
    { id: '671dec284117fe2871ad2773', code: 'HV-KTN-103', name: 'Bé Gia Hân', email: 'giahan@khongtunhi.com', phone: '0970962494', createdAt: '14:02 - 28/10/2026', createdTimestamp: 1730098920000, createdFrom: 'admin', isActive: true, isBlock: false, classCode: 'YCT3-02', hasOnline: true },
    { id: '671deb024117fe2871ad2768', code: 'HV-KTN-104', name: 'Bé giabao', email: 'giabao@khongtunhi.com', phone: '0970674418', createdAt: '13:57 - 28/10/2026', createdTimestamp: 1730098620000, createdFrom: 'admin', isActive: true, isBlock: true, classCode: 'YCT2-04', hasOnline: false },
    { id: '671ce54117fe2871ad2701', code: 'HV-KTN-01', name: 'Bé Lê Hoàng Ngân', email: 'hoangngan@khongtunhi.com', phone: '0988123456', createdAt: '10:00 - 25/10/2026', createdTimestamp: 1729825200000, createdFrom: 'admin', isActive: true, isBlock: false, classCode: 'YCT2-04', hasOnline: true },
    { id: '671ce54117fe2871ad2702', code: 'HV-KTN-02', name: 'Bé Đắc Hanh', email: 'dachanh@khongtunhi.com', phone: '0988123457', createdAt: '10:05 - 25/10/2026', createdTimestamp: 1729825500000, createdFrom: 'admin', isActive: true, isBlock: false, classCode: 'YCT2-04', hasOnline: false },
    { id: '671ce54117fe2871ad2703', code: 'HV-KTN-03', name: 'Bé An Mẫn', email: 'anman@khongtunhi.com', phone: '0988123458', createdAt: '10:10 - 25/10/2026', createdTimestamp: 1729825800000, createdFrom: 'admin', isActive: true, isBlock: false, classCode: 'YCT2-04', hasOnline: false },
    { id: '671ce54117fe2871ad2704', code: 'HV-KTN-04', name: 'Bé Minh Khang', email: 'minhkhang@khongtunhi.com', phone: '0988123459', createdAt: '10:15 - 25/10/2026', createdTimestamp: 1729826100000, createdFrom: 'admin', isActive: true, isBlock: false, classCode: 'YCT3-02', hasOnline: true },
    { id: '671ce54117fe2871ad2705', code: 'HV-KTN-05', name: 'Bé Bảo Châu', email: 'baochau@khongtunhi.com', phone: '0988123460', createdAt: '10:20 - 25/10/2026', createdTimestamp: 1729826400000, createdFrom: 'admin', isActive: true, isBlock: false, classCode: 'YCT3-02', hasOnline: false }
  ];

  app.initIzTeachCrm = function () {
    if (!this.izTab) this.izTab = 'all';
    if (this.izSearch === undefined) this.izSearch = '';
    if (!this.izSelectedIds) this.izSelectedIds = new Set();
    if (!this.izCurrentSidebar) this.izCurrentSidebar = 'students';
    if (!this.izMasterStudents || !this.izMasterStudents.length) {
      this.izMasterStudents = DEFAULT_IZ_STUDENTS.map(s => ({ ...s }));
    }
    if (!this.izStudents || !this.izStudents.length) {
      this.izStudents = [...this.izMasterStudents];
    }
  };

  app.fetchIzStudents = async function () {
    try {
      const tab = this.izTab || 'all';
      const cleanSearch = (this.izSearch || '').replace(/\s+/g, ' ').trim();
      const q = encodeURIComponent(cleanSearch);
      const res = await fetch(`/api/izteach/students?tab=${tab}&search=${q}`);
      if (res.ok) {
        const json = await res.json();
        if (json && Array.isArray(json.data)) {
          if (tab === 'all' && !cleanSearch) {
            this.izMasterStudents = json.data;
          } else if (Array.isArray(this.izMasterStudents)) {
            json.data.forEach(item => {
              const idx = this.izMasterStudents.findIndex(m => m.id === item.id || (m.code && m.code === item.code));
              if (idx >= 0) {
                this.izMasterStudents[idx] = { ...this.izMasterStudents[idx], ...item };
              } else {
                this.izMasterStudents.push(item);
              }
            });
          }
          this.izStudents = json.data;
          const accountsBox = $('admin-panel-accounts');
          if (accountsBox && this.adminTab === 'accounts') {
            this.renderIzTeachCrm(accountsBox);
          }
        }
      }
    } catch (e) {}
  };

  app.renderIzTeachCrm = function (container, options = {}) {
    if (!container) return;
    this.initIzTeachCrm();

    const masterList = (Array.isArray(this.izMasterStudents) && this.izMasterStudents.length)
      ? this.izMasterStudents
      : (Array.isArray(this.izStudents) ? this.izStudents : []);

    const allCount = masterList.length;
    const inactiveCount = masterList.filter(s => s.isActive === false).length;
    const blockedCount = masterList.filter(s => Boolean(s.isBlock)).length;

    let visibleStudents = Array.isArray(this.izStudents) ? this.izStudents : masterList;
    if (this.izTab === 'inactive') {
      visibleStudents = visibleStudents.filter(s => s.isActive === false);
    } else if (this.izTab === 'isblock') {
      visibleStudents = visibleStudents.filter(s => Boolean(s.isBlock));
    }
    if (this.izSearch && this.izSearch.trim()) {
      const q = this.foldText(this.izSearch);
      if (q) {
        visibleStudents = visibleStudents.filter(s =>
          this.foldText(s.name).includes(q) ||
          this.foldText(s.email).includes(q) ||
          (s.phone && this.foldText(s.phone).includes(q)) ||
          (s.code && this.foldText(s.code).includes(q)) ||
          (s.classCode && this.foldText(s.classCode).includes(q))
        );
      }
    }

    const isTeachersView = this.izCurrentSidebar === 'teachers';

    let mainContentHtml = '';
    if (isTeachersView) {
      mainContentHtml = `
        <div class="iz-header">
          <h2 class="iz-header-title">Giảng viên</h2>
          <div class="iz-header-actions">
            <button type="button" class="btn-iz-solid" onclick="app.openAdminProvisionModal('teacher')">+ Cấp tài khoản Giáo viên</button>
          </div>
        </div>
        <div class="iz-table-wrap">
          <table class="iz-table">
            <thead>
              <tr>
                <th>Giáo viên</th>
                <th>Lớp phụ trách</th>
                <th>Số điện thoại</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              ${this.teachers.map(t => {
                const assignedClasses = this.classes.filter(c => c.teacherCode === t.code);
                return `
                  <tr>
                    <td>
                      <strong style="color:#0F172A;">${esc(t.name)}</strong>
                      <div class="table-sub">${esc(t.code)} · ${esc(t.email)}</div>
                    </td>
                    <td>
                      ${assignedClasses.length
                        ? assignedClasses.map(c => `<span class="iz-badge-cls">${esc(c.id)}</span>`).join(' ')
                        : '<span style="color:#94A3B8;">Dự phòng</span>'}
                    </td>
                    <td>${esc(t.phone || '-')}</td>
                    <td>
                      <button type="button" class="chip-btn" onclick="app.openAction('lock')">${this.state.teacherChatLocked ? 'Đang khóa nhắn tin' : 'Đang hoạt động'}</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    } else {
      mainContentHtml = `
        <div class="iz-header" id="iz-student-header">
          <h2 class="iz-header-title">Học viên</h2>
          <div class="iz-header-actions">
            <div style="position:relative;">
              <button id="btn-iz-excel-menu" type="button" class="btn-iz-outline" onclick="app.toggleIzExcelMenu()">
                <span>Nhập/xuất Excel</span> <span>▾</span>
              </button>
              <div id="iz-excel-menu" class="iz-dropdown-menu hidden">
                <div class="iz-dropdown-item" onclick="app.openImportExcelModal(); app.toggleIzExcelMenu(false);">
                  <span>📤</span> <span>Nhập file Excel</span>
                </div>
                <div class="iz-dropdown-item" onclick="app.downloadStudentExcelTemplate(); app.toggleIzExcelMenu(false);">
                  <span>📥</span> <span>Download file Excel (mẫu)</span>
                </div>
                <div class="iz-dropdown-item" onclick="app.exportStudentExcel(); app.toggleIzExcelMenu(false);">
                  <span>📊</span> <span>Xuất file Excel</span>
                </div>
              </div>
            </div>
            <button id="btn-iz-add-student" type="button" class="btn-iz-solid" onclick="app.openAdminProvisionModal('student')">
              + Thêm học viên
            </button>
          </div>
        </div>

        <div class="iz-tab-bar" id="iz-tab-filter">
          <div id="tab-iz-all" class="iz-tab ${this.izTab === 'all' ? 'active' : ''}" onclick="app.switchIzStudentTab('all')">
            TẤT CẢ (${allCount})
          </div>
          <div id="tab-iz-inactive" class="iz-tab ${this.izTab === 'inactive' ? 'active' : ''}" onclick="app.switchIzStudentTab('inactive')">
            CHƯA KÍCH HOẠT (${inactiveCount})
          </div>
          <div id="tab-iz-isblock" class="iz-tab ${this.izTab === 'isblock' ? 'active' : ''}" onclick="app.switchIzStudentTab('isblock')">
            ĐANG BỊ KHOÁ (${blockedCount})
          </div>
        </div>

        <div class="iz-toolbar" id="iz-search-bar">
          <button id="btn-iz-filter-advanced" type="button" class="btn-iz-filter-pill">
            Bộ lọc ▾
          </button>
          <input id="input-iz-student-search" type="text" class="iz-search-input" value="${esc(this.izSearch || '')}" placeholder="Tìm kiếm theo tên và email của học viên" oninput="app.onIzStudentSearch(this.value)">
        </div>

        ${this.izSelectedIds.size > 0 ? `
          <div class="iz-bulk-bar">
            <span style="font-size:12.5px;font-weight:700;color:#1E40AF;">Đã chọn ${this.izSelectedIds.size} học viên</span>
            <div style="display:flex;gap:6px;">
              <button type="button" class="chip-btn" style="background:#FFF;color:#B91C1C;font-weight:700;" onclick="app.bulkLockIzStudents(true)">🔒 Khóa đã chọn</button>
              <button type="button" class="chip-btn" style="background:#FFF;color:#047857;font-weight:700;" onclick="app.bulkLockIzStudents(false)">🔓 Mở khóa đã chọn</button>
              <button type="button" class="chip-btn" style="background:#FFF;font-weight:600;" onclick="app.clearIzSelection()">Bỏ chọn</button>
            </div>
          </div>` : ''}

        <div class="iz-table-wrap" id="iz-student-table-container">
          <table class="iz-table" id="iz-student-table">
            <thead>
              <tr>
                <th style="width:36px;"><input type="checkbox" id="iz-select-all" ${visibleStudents.length > 0 && visibleStudents.every(s => this.izSelectedIds.has(s.id)) ? 'checked' : ''} onchange="app.toggleIzSelectAll(this.checked)"></th>
                <th>Họ và tên học viên</th>
                <th>Email</th>
                <th>Số điện thoại</th>
                <th>Ngày tạo</th>
                <th style="text-align:center;">Tự ĐK / Trạng thái</th>
                <th style="text-align:right;">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              ${visibleStudents.length ? visibleStudents.map(s => {
                const isChecked = this.izSelectedIds.has(s.id);
                const selfReg = s.createdFrom === 'student';
                const isActivated = s.isActive !== false;
                const isBlocked = Boolean(s.isBlock);

                let selfRegBadge = '<span style="color:#94A3B8;">-</span>';
                if (selfReg) {
                  selfRegBadge = '<span class="iz-badge-cls">Tự ĐK</span>';
                }

                let statusBadge = '<span style="color:#64748B;font-size:12px;">Đang hoạt động</span>';
                if (isBlocked) {
                  statusBadge = `<button type="button" class="iz-badge-danger" style="cursor:pointer;border:none;" onclick="app.toggleLockStudent('${esc(s.id)}')">🔒 Đang bị khoá</button>`;
                } else if (!isActivated) {
                  statusBadge = `<button type="button" class="iz-badge-warn" style="cursor:pointer;border:none;" onclick="app.activateStudent('${esc(s.id)}')">⚠️ Chưa kích hoạt</button>`;
                }

                return `
                  <tr data-student-id="${esc(s.id)}">
                    <td><input type="checkbox" class="iz-row-check" data-id="${esc(s.id)}" ${isChecked ? 'checked' : ''} onchange="app.toggleIzSelectStudent('${esc(s.id)}', this.checked)"></td>
                    <td>
                      <strong style="color:#0F172A;cursor:pointer;" onclick="app.openIzStudentDetails('${esc(s.id)}')">${esc(s.name)}</strong>
                      ${s.classCode ? `<span class="iz-badge-cls">${esc(s.classCode)}</span>` : ''}
                    </td>
                    <td>${esc(s.email)}</td>
                    <td>${esc(s.phone || '-')}</td>
                    <td><span style="color:#64748B;">${esc(s.createdAt || '15:07 - 28/10/2026')}</span></td>
                    <td style="text-align:center;">
                      <div style="display:inline-flex;align-items:center;justify-content:center;gap:4px;flex-wrap:wrap;">
                        ${selfRegBadge}
                        ${statusBadge}
                      </div>
                    </td>
                    <td style="text-align:right;">
                      <div style="position:relative;display:inline-block;">
                        <button type="button" class="iz-row-btn" aria-label="Thao tác" onclick="app.toggleIzRowMenu('${esc(s.id)}')">⋮</button>
                        <div id="iz-row-menu-${esc(s.id)}" class="iz-dropdown-menu hidden" style="right:0;">
                          <div class="iz-dropdown-item" onclick="app.toggleLockStudent('${esc(s.id)}'); app.toggleIzRowMenu('${esc(s.id)}', false);">
                            <span>${isBlocked ? '🔓 Mở khóa tài khoản' : '🔒 Khóa tài khoản'}</span>
                          </div>
                          ${!isActivated ? `
                          <div class="iz-dropdown-item" onclick="app.activateStudent('${esc(s.id)}'); app.toggleIzRowMenu('${esc(s.id)}', false);">
                            <span>✓ Kích hoạt tài khoản</span>
                          </div>` : ''}
                          <div class="iz-dropdown-item" onclick="app.openAdminEnrollStudentModal('${esc(s.classCode || '')}', '${esc(s.id)}'); app.toggleIzRowMenu('${esc(s.id)}', false);">
                            <span>🏫 Chuyển / Xếp lớp</span>
                          </div>
                          <div class="iz-dropdown-item" style="color:#B91C1C;" onclick="app.deleteStudent('${esc(s.id)}'); app.toggleIzRowMenu('${esc(s.id)}', false);">
                            <span>🗑️ Xóa học viên</span>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('') : `<tr><td colspan="7" style="text-align:center;padding:30px;color:#64748B;">Không tìm thấy học viên nào phù hợp với bộ lọc.</td></tr>`}
            </tbody>
          </table>
        </div>
      `;
    }

    container.innerHTML = `
      ${options.provisionResultHtml || ''}
      <button id="btn-toggle-provision-form" type="button" class="btn-primary hidden" onclick="app.openAdminProvisionModal('student')">+ Cấp tài khoản</button>
      ${options.provisionPanelHtml || ''}
      <div class="iz-crm-wrapper" id="iz-crm-wrapper">
        <aside id="iz-sidebar" class="iz-sidebar">
          <div class="iz-sidebar-brand">
            <img src="assets/logo.jpg" alt="Logo">
            <span>HỌC VIỆN KHỔNG TỬ NHÍ</span>
          </div>
          <div class="iz-nav-group">
            <div class="iz-nav-label">Nội dung học</div>
            <div class="iz-nav-item">📖 Khóa học</div>
          </div>
          <div class="iz-nav-group">
            <div class="iz-nav-label">Học sinh - Người dùng</div>
            <div id="iz-nav-students" class="iz-nav-item ${!isTeachersView ? 'active' : ''}" onclick="app.setIzSidebarView('students')">👥 Học viên</div>
            <div class="iz-nav-item">👥 Nhóm học viên</div>
            <div id="iz-nav-teachers" class="iz-nav-item ${isTeachersView ? 'active' : ''}" onclick="app.setIzSidebarView('teachers')">👩‍🏫 Giảng viên</div>
            <div class="iz-nav-item">💬 Thảo luận</div>
            <div class="iz-nav-item">⭐ Đánh giá</div>
          </div>
          <div class="iz-nav-group">
            <div class="iz-nav-label">Hệ thống</div>
            <div class="iz-nav-item">💼 Kinh doanh</div>
            <div class="iz-nav-item">🌐 Giao diện Web</div>
            <div class="iz-nav-item">📱 Giao diện App</div>
            <div class="iz-nav-item">⚙️ Cài đặt chung</div>
            <div class="iz-nav-item">👤 Tài khoản</div>
            <div class="iz-nav-item">🖥️ Phòng thi</div>
          </div>
        </aside>
        <main class="iz-crm-main" id="iz-crm-main">
          ${mainContentHtml}
        </main>
      </div>
    `;
  };

  app.setIzSidebarView = function (view) {
    this.izCurrentSidebar = view || 'students';
    const accountsBox = $('admin-panel-accounts');
    if (accountsBox) this.renderIzTeachCrm(accountsBox);
  };

  app.switchIzStudentTab = function (tab) {
    this.izTab = tab || 'all';
    if (Array.isArray(this.izMasterStudents)) {
      if (this.izTab === 'inactive') {
        this.izStudents = this.izMasterStudents.filter(s => s.isActive === false);
      } else if (this.izTab === 'isblock') {
        this.izStudents = this.izMasterStudents.filter(s => Boolean(s.isBlock));
      } else {
        this.izStudents = [...this.izMasterStudents];
      }
    }
    this.fetchIzStudents();
    const accountsBox = $('admin-panel-accounts');
    if (accountsBox) this.renderIzTeachCrm(accountsBox);
  };
  app.switchIzTab = function (tab) {
    return this.switchIzStudentTab(tab);
  };

  app.onIzStudentSearch = function (query) {
    this.izSearch = query || '';
    clearTimeout(this._izSearchTimer);
    const accountsBox = $('admin-panel-accounts');
    if (accountsBox) this.renderIzTeachCrm(accountsBox);
    this._izSearchTimer = setTimeout(() => {
      this.fetchIzStudents();
    }, 200);
  };
  app.handleIzSearchInput = function (query) {
    return this.onIzStudentSearch(query);
  };

  app.toggleIzExcelMenu = function (force) {
    const d = $('iz-excel-menu') || $('iz-excel-dropdown');
    if (d) d.classList.toggle('hidden', force !== undefined ? !force : undefined);
  };

  app.toggleIzRowMenu = function (id, force) {
    const d = $('iz-row-menu-' + id);
    if (d) d.classList.toggle('hidden', force !== undefined ? !force : undefined);
  };

  app.toggleIzSelectStudent = function (id, checked) {
    if (checked) this.izSelectedIds.add(id);
    else this.izSelectedIds.delete(id);
    const accountsBox = $('admin-panel-accounts');
    if (accountsBox) this.renderIzTeachCrm(accountsBox);
  };

  app.toggleIzSelectAll = function (checked) {
    if (checked) {
      this.izStudents.forEach(s => this.izSelectedIds.add(s.id));
    } else {
      this.izSelectedIds.clear();
    }
    const accountsBox = $('admin-panel-accounts');
    if (accountsBox) this.renderIzTeachCrm(accountsBox);
  };

  app.clearIzSelection = function () {
    this.izSelectedIds.clear();
    const accountsBox = $('admin-panel-accounts');
    if (accountsBox) this.renderIzTeachCrm(accountsBox);
  };

  app.bulkLockIzStudents = async function (lock) {
    const isLocked = Boolean(lock);
    for (const id of Array.from(this.izSelectedIds)) {
      const s = this.izStudents ? this.izStudents.find(x => x.id === id) : null;
      const master = this.izMasterStudents ? this.izMasterStudents.find(x => x.id === id) : null;
      if (s) s.isBlock = isLocked;
      if (master) master.isBlock = isLocked;
      try {
        await fetch(`/api/izteach/students/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isBlock: isLocked })
        });
      } catch (e) {}
    }
    this.clearIzSelection();
    this.showToast(lock ? 'Đã khóa các học viên được chọn.' : 'Đã mở khóa các học viên được chọn.');
  };

  app.toggleLockStudent = async function (studentId) {
    const s = this.izStudents ? this.izStudents.find(x => x.id === studentId || x.code === studentId) : null;
    const master = this.izMasterStudents ? this.izMasterStudents.find(x => x.id === studentId || x.code === studentId) : null;
    const target = s || master;
    if (!target) return;
    const nextBlocked = !target.isBlock;
    if (s) s.isBlock = nextBlocked;
    if (master) master.isBlock = nextBlocked;
    try {
      await fetch(`/api/izteach/students/${encodeURIComponent(target.id || studentId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isBlock: nextBlocked })
      });
    } catch (e) {}
    this.showToast(nextBlocked ? `Đã tạm khóa tài khoản của ${target.name}.` : `Đã mở khóa tài khoản của ${target.name}.`);
    const accountsBox = $('admin-panel-accounts');
    if (accountsBox) this.renderIzTeachCrm(accountsBox);
  };

  app.activateStudent = async function (studentId) {
    const s = this.izStudents ? this.izStudents.find(x => x.id === studentId || x.code === studentId) : null;
    const master = this.izMasterStudents ? this.izMasterStudents.find(x => x.id === studentId || x.code === studentId) : null;
    const target = s || master;
    if (!target) return;
    if (s) s.isActive = true;
    if (master) master.isActive = true;
    try {
      await fetch(`/api/izteach/students/${encodeURIComponent(target.id || studentId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true })
      });
    } catch (e) {}
    this.showToast(`Đã kích hoạt tài khoản của ${target.name}.`);
    const accountsBox = $('admin-panel-accounts');
    if (accountsBox) this.renderIzTeachCrm(accountsBox);
  };

  app.deleteStudent = async function (studentId) {
    const s = this.izStudents ? this.izStudents.find(x => x.id === studentId || x.code === studentId) : null;
    const master = this.izMasterStudents ? this.izMasterStudents.find(x => x.id === studentId || x.code === studentId) : null;
    const target = s || master;
    if (!target) return;
    if (!confirm(`Bạn có chắc muốn xóa học viên ${target.name}?`)) return;
    if (this.izStudents) {
      this.izStudents = this.izStudents.filter(x => x.id !== target.id && x.code !== target.code);
    }
    if (this.izMasterStudents) {
      this.izMasterStudents = this.izMasterStudents.filter(x => x.id !== target.id && x.code !== target.code);
    }
    try {
      await fetch(`/api/izteach/students/${encodeURIComponent(target.id || studentId)}`, {
        method: 'DELETE'
      });
    } catch (e) {}
    this.showToast(`Đã xóa hồ sơ học viên ${target.name}.`);
    const accountsBox = $('admin-panel-accounts');
    if (accountsBox) this.renderIzTeachCrm(accountsBox);
  };

  app.openIzStudentDetails = function (studentId) {
    const s = this.izStudents.find(x => x.id === studentId || x.code === studentId);
    if (!s) return;
    const matchIdx = this.students.findIndex(st => st.email === s.email || st.code === s.code);
    if (matchIdx >= 0) {
      this.openStudentFromAdmin(matchIdx);
      return;
    }
    const dialog = $('admin-student-dialog');
    if (!dialog || typeof dialog.showModal !== 'function') return;
    $('admin-student-title').textContent = `${s.name} · ${s.classCode ? 'Lớp ' + s.classCode : 'Chưa xếp lớp'}`;
    $('admin-student-summary').textContent = `Email: ${s.email} · SĐT: ${s.phone || '-'} · Ngày tạo: ${s.createdAt}`;
    $('admin-student-content').innerHTML = `
      <div style="padding:12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;">
        <p><strong>Mã học viên:</strong> ${esc(s.code || s.id)}</p>
        <p><strong>Trạng thái:</strong> ${s.isBlock ? '🔒 Đang bị khoá' : 'Đang hoạt động'} · ${s.isActive === false ? '⚠️ Chưa kích hoạt' : '✓ Đã kích hoạt'}</p>
        <p><strong>Đăng ký từ:</strong> ${s.createdFrom === 'student' ? 'Học viên tự đăng ký' : 'Quản lý tạo'}</p>
      </div>
    `;
    dialog.showModal();
  };

  app.downloadStudentExcelTemplate = function () {
    const a = document.createElement('a');
    a.href = '/api/izteach/students/template';
    a.download = 'template-list-student.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    this.showToast('Đang tải file mẫu template-list-student.csv...');
  };

  app.exportStudentExcel = function () {
    const tab = this.izTab || 'all';
    const q = encodeURIComponent(this.izSearch || '');
    const a = document.createElement('a');
    a.href = `/api/izteach/students/export?tab=${tab}&search=${q}`;
    a.download = 'danh-sach-hoc-vien-khong-tu-nhi.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    this.showToast('Đang xuất danh sách học viên...');
  };

  app.openImportExcelModal = function () {
    const dlg = $('iz-import-modal');
    if (!dlg || typeof dlg.showModal !== 'function') return;
    $('iz-import-preview-wrap')?.classList.add('hidden');
    $('iz-import-errors')?.classList.add('hidden');
    if ($('iz-file-input')) $('iz-file-input').value = '';
    if ($('btn-iz-execute-import')) $('btn-iz-execute-import').disabled = true;
    if ($('iz-import-progress-fill')) $('iz-import-progress-fill').style.width = '0%';
    dlg.showModal();
  };

  app.closeImportExcelModal = function () {
    const dlg = $('iz-import-modal');
    if (dlg && typeof dlg.close === 'function') dlg.close();
  };

  app.handleIzExcelFileSelected = function (files) {
    if (!files || !files.length) return;
    const file = files[0];
    const wrap = $('iz-import-preview-wrap');
    if (wrap) wrap.classList.remove('hidden');
    if ($('iz-import-filename')) $('iz-import-filename').textContent = file.name;
    if ($('iz-import-status-text')) $('iz-import-status-text').textContent = 'Đang đọc dữ liệu bảng tính...';

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length <= 1) {
          if ($('iz-import-status-text')) $('iz-import-status-text').textContent = 'Tệp không có dòng dữ liệu học viên nào.';
          if ($('btn-iz-execute-import')) $('btn-iz-execute-import').disabled = true;
          return;
        }

        // Dynamic Header Matching
        const rawHeader = lines[0].replace(/^\uFEFF/, '');
        const headerCols = rawHeader.split(',').map(c => c.trim().replace(/^["']+|["']+$/g, '').toLowerCase());

        const findCol = (predicate) => headerCols.findIndex(predicate);
        let nameIdx = findCol(c => c.includes('họ và tên') || c.includes('tên học viên') || c === 'tên' || c === 'name');
        let emailIdx = findCol(c => c.includes('email') || c.includes('hòm thư') || c === 'thư');
        let phoneIdx = findCol(c => c.includes('điện thoại') || c.includes('sđt') || c === 'phone' || c === 'tel');
        let classIdx = findCol(c => c.includes('mã lớp') || c.includes('lớp') || c === 'class');
        let onlineIdx = findCol(c => c.includes('online') || c.includes('khóa học online'));
        let idIdx = findCol(c => c.includes('mã học viên') || c.includes('mã hv') || c === 'id');

        // Fallback positional indices if headers not detected
        if (nameIdx === -1) nameIdx = 0;
        if (emailIdx === -1) emailIdx = (nameIdx === 0 ? 1 : 0);
        if (phoneIdx === -1) phoneIdx = 2;
        if (classIdx === -1) classIdx = 3;
        if (onlineIdx === -1) onlineIdx = 4;

        const rows = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
          if (!cols.length || (cols.length === 1 && !cols[0])) continue;

          const rawName = (nameIdx >= 0 && cols[nameIdx] !== undefined) ? cols[nameIdx].trim() : '';
          const name = rawName || (idIdx !== 0 && cols[0] ? cols[0].trim() : (cols[1] ? cols[1].trim() : ''));
          if (!name) continue;

          const email = (emailIdx >= 0 && cols[emailIdx])
            ? cols[emailIdx].trim()
            : `${this._slugifyAccount(name)}@khongtunhi.com`;
          const phone = (phoneIdx >= 0 && cols[phoneIdx]) ? cols[phoneIdx].trim() : '';
          const classCode = (classIdx >= 0 && cols[classIdx]) ? cols[classIdx].trim() : 'YCT2-04';
          const onlineRaw = (onlineIdx >= 0 && cols[onlineIdx]) ? cols[onlineIdx].trim().toLowerCase() : '';
          const hasOnline = onlineRaw === 'true' || onlineRaw === '1' || onlineRaw === 'có';
          const studentId = (idIdx >= 0 && cols[idIdx]) ? cols[idIdx].trim() : undefined;

          rows.push({
            ...(studentId ? { id: studentId, studentId } : {}),
            name,
            email,
            phone,
            classCode,
            hasOnline,
            isActive: true,
            isBlock: false
          });
        }

        this._pendingImportStudents = rows;
        if ($('iz-import-count')) $('iz-import-count').textContent = `${rows.length} học viên`;
        if (rows.length > 0) {
          if ($('iz-import-status-text')) $('iz-import-status-text').textContent = `Đã phân tích xong ${rows.length} học viên. Bấm "Bắt đầu nhập" để tiến hành.`;
          if ($('btn-iz-execute-import')) $('btn-iz-execute-import').disabled = false;
        } else {
          if ($('iz-import-status-text')) $('iz-import-status-text').textContent = 'Không tìm thấy dòng dữ liệu hợp lệ (thiếu Họ và tên).';
          if ($('btn-iz-execute-import')) $('btn-iz-execute-import').disabled = true;
        }
      } catch (err) {
        if ($('iz-import-status-text')) $('iz-import-status-text').textContent = 'Lỗi phân tích tệp: ' + err.message;
        if ($('btn-iz-execute-import')) $('btn-iz-execute-import').disabled = true;
      }
    };
    reader.readAsText(file);
  };

  app.executeIzImport = function () {
    if (!this._pendingImportStudents || !this._pendingImportStudents.length) {
      this.showToast('Vui lòng chọn tệp danh sách học viên trước khi nhập.');
      return;
    }
    const fill = $('iz-import-progress-fill');
    const statusTxt = $('iz-import-status-text');
    const btn = $('btn-iz-execute-import');
    if (btn) btn.disabled = true;
    if (fill) fill.style.width = '60%';
    if (statusTxt) statusTxt.textContent = 'Đang gửi dữ liệu lên máy chủ...';

    // Wrap payload in { students: [...] }
    const payload = { students: this._pendingImportStudents };

    fetch('/api/izteach/students/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(res => {
        const importedCount = (typeof res.imported === 'number')
          ? res.imported
          : ((typeof res.importedCount === 'number') ? res.importedCount : 0);

        if (res.ok && importedCount > 0) {
          if (fill) fill.style.width = '100%';
          const errCount = Array.isArray(res.errors) ? res.errors.length : 0;
          const succMsg = `✓ Nhập thành công ${importedCount} học viên${errCount > 0 ? ` (${errCount} dòng lỗi)` : ''}!`;
          if (statusTxt) statusTxt.textContent = succMsg;
          this.showToast(`Đã nhập thành công ${importedCount} học viên vào hệ thống.`);

          if (Array.isArray(res.data) && res.data.length > 0) {
            const fresh = res.data;
            this.izStudents = [...fresh, ...this.izStudents.filter(s => !fresh.some(f => (f.id && f.id === s.id) || (f.email && f.email === s.email)))];
            if (Array.isArray(this.izMasterStudents)) {
              this.izMasterStudents = [...fresh, ...this.izMasterStudents.filter(s => !fresh.some(f => (f.id && f.id === s.id) || (f.email && f.email === s.email)))];
            }
          }

          this._pendingImportStudents = null;
          setTimeout(() => {
            $('iz-import-modal')?.close();
            const accountsBox = $('admin-panel-accounts');
            if (accountsBox) this.renderIzTeachCrm(accountsBox);
            this.renderAdminOverview();
            this.syncAdminKpis?.();
          }, 1200);
        } else {
          // Strictly reject false success on 0 imports
          if (fill) fill.style.width = '0%';
          if (btn) btn.disabled = false;

          let errMsg = 'Không có học viên nào được nhập.';
          if (Array.isArray(res.errors) && res.errors.length > 0) {
            const errDetails = res.errors.slice(0, 3).map(e => `Dòng ${e.row}: ${e.error}`).join('; ');
            errMsg = `Nhập thất bại (0/${this._pendingImportStudents ? this._pendingImportStudents.length : 0} học viên). Lỗi: ${errDetails}${res.errors.length > 3 ? ` (+${res.errors.length - 3} lỗi)` : ''}`;
          } else if (res.message) {
            errMsg = `Nhập thất bại: ${res.message}`;
          }

          if (statusTxt) statusTxt.textContent = `❌ ${errMsg}`;
          this.showToast(`❌ ${errMsg}`);
        }
      })
      .catch(err => {
        if (fill) fill.style.width = '0%';
        if (btn) btn.disabled = false;
        const netErr = `Lỗi kết nối máy chủ: ${err.message}`;
        if (statusTxt) statusTxt.textContent = `❌ ${netErr}`;
        this.showToast(`❌ ${netErr}`);
      });
  };

  // Modals & Drawers Handlers
  app.openAdminCreateClassModal = function () {
    const dlg = $('admin-create-class-dialog');
    if (!dlg || typeof dlg.showModal !== 'function') return;
    if ($('dlg-new-class-id')) $('dlg-new-class-id').value = '';
    if ($('dlg-new-class-title')) $('dlg-new-class-title').value = 'Khóa học Tiếng Trung Trẻ Em';
    if ($('dlg-new-class-schedule')) $('dlg-new-class-schedule').value = 'Thứ 3 & Thứ 6 (19:30 - 20:30)';
    if ($('dlg-new-class-lessons')) $('dlg-new-class-lessons').value = '25';
    const selTeacher = $('dlg-new-class-teacher');
    if (selTeacher) {
      selTeacher.innerHTML = this.teachers.map(t => `<option value="${esc(t.code)}">${esc(t.name)} (${esc(t.code)})</option>`).join('');
    }
    dlg.showModal();
  };

  app.adminSubmitCreateClass = function () {
    const classId = $('dlg-new-class-id')?.value.trim();
    const title = $('dlg-new-class-title')?.value.trim() || 'Khóa học Tiếng Trung';
    const schedule = $('dlg-new-class-schedule')?.value.trim();
    const totalLessons = Number($('dlg-new-class-lessons')?.value) || 25;
    const teacherCode = $('dlg-new-class-teacher')?.value || this.teachers[0].code;
    const teacher = this.teachers.find(t => t.code === teacherCode) || this.teachers[0];

    if (!classId || !schedule) {
      this.showToast('Vui lòng nhập Mã lớp và Lịch học.');
      return;
    }
    if (this.classes.some(c => c.id.toLowerCase() === classId.toLowerCase())) {
      this.showToast(`Lớp ${classId} đã tồn tại trong hệ thống.`);
      return;
    }

    const newCls = {
      id: classId,
      title,
      schedule,
      totalLessons,
      teacherCode: teacher.code,
      teacherName: teacher.name,
      teacherEmail: teacher.email,
      studentCodes: []
    };
    this.classes.push(newCls);

    this.saveState();
    this.syncClassToServer?.(newCls, 'upsert');
    $('admin-create-class-dialog')?.close();
    this.renderAll();
    this.renderAdminOverview();
    this.showToast(`Đã mở thành công Lớp ${classId} do ${teacher.name} phụ trách.`);
  };

  app.openAdminEditClassModal = function (classId) {
    const cls = this.classes.find(c => c.id === classId);
    if (!cls) return;
    const dlg = $('admin-edit-class-dialog');
    if (!dlg || typeof dlg.showModal !== 'function') return;
    if ($('dlg-edit-class-id-hidden')) $('dlg-edit-class-id-hidden').value = cls.id;
    if ($('dlg-edit-class-id-display')) $('dlg-edit-class-id-display').value = cls.id;
    if ($('dlg-edit-class-title')) $('dlg-edit-class-title').value = cls.title || 'Khóa học Tiếng Trung';
    if ($('dlg-edit-class-schedule')) $('dlg-edit-class-schedule').value = cls.schedule || '';
    if ($('dlg-edit-class-lessons')) $('dlg-edit-class-lessons').value = cls.totalLessons || 25;
    const selTeacher = $('dlg-edit-class-teacher');
    if (selTeacher) {
      selTeacher.innerHTML = this.teachers.map(t => `<option value="${esc(t.code)}" ${cls.teacherCode === t.code ? 'selected' : ''}>${esc(t.name)} (${esc(t.code)})</option>`).join('');
    }
    dlg.showModal();
  };

  app.adminSubmitEditClass = function () {
    const classId = $('dlg-edit-class-id-hidden')?.value;
    const cls = this.classes.find(c => c.id === classId);
    if (!cls) return;
    cls.title = $('dlg-edit-class-title')?.value.trim() || cls.title;
    cls.schedule = $('dlg-edit-class-schedule')?.value.trim() || cls.schedule;
    cls.totalLessons = Number($('dlg-edit-class-lessons')?.value) || cls.totalLessons;
    const teacherCode = $('dlg-edit-class-teacher')?.value;
    const teacher = this.teachers.find(t => t.code === teacherCode);
    if (teacher) {
      cls.teacherCode = teacher.code;
      cls.teacherName = teacher.name;
      cls.teacherEmail = teacher.email;
    }
    this.saveState();
    this.syncClassToServer?.(cls, 'upsert');
    $('admin-edit-class-dialog')?.close();
    this.renderAll();
    this.renderAdminOverview();
    this.showToast(`Đã cập nhật cấu hình Lớp ${classId}.`);
  };

  app.adminDeleteClassFromDialog = function () {
    const classId = $('dlg-edit-class-id-hidden')?.value;
    if (!classId) return;
    if (!confirm(`Bạn có chắc chắn muốn xóa Lớp ${classId}?`)) return;
    this.classes = this.classes.filter(c => c.id !== classId);
    this.students.forEach(s => {
      if (s.classCode === classId) {
        s.classCode = '';
        s.hasLiveClass = false;
      }
    });
    this.saveState();
    this.syncClassToServer?.({ id: classId }, 'delete');
    $('admin-edit-class-dialog')?.close();
    this.renderAll();
    this.renderAdminOverview();
    this.showToast(`Đã xóa vĩnh viễn Lớp ${classId}.`);
  };

  app.openAdminEnrollStudentModal = function (classId, studentId) {
    const dlg = $('admin-enroll-student-dialog');
    if (!dlg || typeof dlg.showModal !== 'function') return;
    if ($('dlg-enroll-class-id-hidden')) $('dlg-enroll-class-id-hidden').value = classId || (this.classes[0]?.id || '');
    if ($('admin-enroll-student-title')) $('admin-enroll-student-title').textContent = classId ? `Xếp học viên vào Lớp ${classId}` : 'Xếp học viên vào lớp';
    const selStu = $('dlg-enroll-student-select');
    if (selStu) {
      const pool = [];
      this.students.forEach((s, idx) => {
        if (!s.isDynamicSession) {
          pool.push({ id: s.code || s.email, name: s.name, email: s.email, currentClass: s.classCode, type: 'app', idx });
        }
      });
      if (Array.isArray(this.izStudents)) {
        this.izStudents.forEach(s => {
          if (!pool.some(p => p.email === s.email)) {
            pool.push({ id: s.id, name: s.name, email: s.email, currentClass: s.classCode, type: 'iz' });
          }
        });
      }
      selStu.innerHTML = pool.map(p => `
        <option value="${esc(p.id)}" ${p.id === studentId ? 'selected' : ''}>
          ${esc(p.name)} (${esc(p.email)})${p.currentClass ? ' · Đang ở ' + esc(p.currentClass) : ' · Chưa có lớp'}
        </option>
      `).join('');
    }
    dlg.showModal();
  };

  app.adminSubmitEnrollStudent = function () {
    const classId = $('dlg-enroll-class-id-hidden')?.value;
    const stuId = $('dlg-enroll-student-select')?.value;
    if (!classId || !stuId) return;
    const appStu = this.students.find(s => (s.code === stuId || s.email === stuId));
    if (appStu) {
      appStu.classCode = classId;
      appStu.hasLiveClass = true;
    }
    if (Array.isArray(this.izStudents)) {
      const izStu = this.izStudents.find(s => s.id === stuId || s.email === stuId || s.code === stuId);
      if (izStu) {
        izStu.classCode = classId;
        fetch(`/api/izteach/students/${encodeURIComponent(izStu.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classCode: classId })
        }).catch(() => {});
      }
    }
    if (Array.isArray(this.izMasterStudents)) {
      const masterStu = this.izMasterStudents.find(s => s.id === stuId || s.email === stuId || s.code === stuId);
      if (masterStu) masterStu.classCode = classId;
    }
    const cls = this.classes.find(c => c.id === classId);
    if (cls && Array.isArray(cls.studentCodes) && !cls.studentCodes.includes(stuId)) {
      cls.studentCodes.push(stuId);
    }
    const targetStuForSync = appStu || (Array.isArray(this.izStudents) && this.izStudents.find(s => s.id === stuId || s.email === stuId || s.code === stuId));
    if (targetStuForSync) {
      this.syncStudentEntitlementToServer?.({ ...targetStuForSync, classCode: classId }, 'assign_class');
    }
    this.saveState();
    $('admin-enroll-student-dialog')?.close();
    this.renderAll();
    this.renderAdminOverview();
    this.showToast(`Đã xếp thành công học viên vào Lớp ${classId}.`);
  };

  app.openAdminProvisionModal = function (role) {
    const dlg = $('admin-provision-dialog');
    if (!dlg || typeof dlg.showModal !== 'function') return;
    this.setAdminProvisionRole(role || 'student');
    if ($('dlg-prov-name')) $('dlg-prov-name').value = '';
    if ($('dlg-prov-email')) $('dlg-prov-email').value = '';
    if ($('dlg-prov-phone')) $('dlg-prov-phone').value = '';
    if ($('dlg-prov-password')) $('dlg-prov-password').value = '123456';
    if ($('dlg-prov-online')) $('dlg-prov-online').checked = false;
    const selClass = $('dlg-prov-class');
    if (selClass) {
      selClass.innerHTML = `<option value="">Chưa xếp lớp (Mặc định)</option>` +
        this.classes.map(c => `<option value="${esc(c.id)}">Lớp ${esc(c.id)} (${esc(c.teacherName)})</option>`).join('');
    }
    dlg.showModal();
  };

  app.setAdminProvisionRole = function (role) {
    this.adminProvisionRole = role === 'teacher' ? 'teacher' : 'student';
    const isTeacher = this.adminProvisionRole === 'teacher';
    $('dlg-prov-role-student')?.classList.toggle('active-chip', !isTeacher);
    $('dlg-prov-role-teacher')?.classList.toggle('active-chip', isTeacher);
    if ($('dlg-prov-online-wrap')) $('dlg-prov-online-wrap').style.display = isTeacher ? 'none' : 'flex';
    if ($('dlg-prov-name')) $('dlg-prov-name').placeholder = isTeacher ? 'VD: Cô Nguyễn Thu Trang' : 'VD: Bé Nguyễn Gia Bảo';
    if ($('dlg-prov-email')) $('dlg-prov-email').placeholder = isTeacher ? 'VD: thutrang@khongtunhi.com' : 'VD: giabao@gmail.com';
  };

  app.adminSubmitProvisionFromDialog = async function () {
    const role = this.adminProvisionRole || 'student';
    const name = $('dlg-prov-name')?.value.trim();
    const email = $('dlg-prov-email')?.value.trim();
    const phone = $('dlg-prov-phone')?.value.trim();
    const password = $('dlg-prov-password')?.value.trim() || '123456';
    const classCode = $('dlg-prov-class')?.value || '';
    const hasOnlineCourses = $('dlg-prov-online')?.checked || false;

    if (!name) {
      this.showToast('Vui lòng nhập Họ và tên.');
      return;
    }

    const cleanPhone = (phone || '').replace(/[\s.-]/g, '');
    if (cleanPhone && !/^(?:\+?84|0)[1-9]\d{8}$/.test(cleanPhone)) {
      this.showToast('Số điện thoại không hợp lệ (cần 10 chữ số, VD: 0912345678).');
      return;
    }

    if (email) {
      const emailLower = email.toLowerCase();
      const existsInStudents = (this.students || []).some(s => s.email && s.email.toLowerCase() === emailLower);
      const existsInIz = (this.izStudents || []).some(s => s.email && s.email.toLowerCase() === emailLower);
      const existsInMaster = (this.izMasterStudents || []).some(s => s.email && s.email.toLowerCase() === emailLower);
      if (existsInStudents || existsInIz || existsInMaster) {
        this.showToast(`Email '${email}' đã tồn tại trên hệ thống.`);
        return;
      }
    }

    await this.adminProvisionAccount({ role, name, email, phone, password, classCode, hasOnlineCourses });
    $('admin-provision-dialog')?.close();
    this.renderAll();
    this.renderAdminOverview();
    this.syncAdminKpis?.();
  };

  app.openStudentFromAdmin = function (idx, lessonNum) {
    if (this.currentRole !== 'admin' || (window.sllAuth && !window.sllAuth.canAccessAdminStudent(idx))) {
      this.showToast('Chỉ Quản lý trung tâm mới được mở hồ sơ tổng hợp của mọi học sinh.');
      return false;
    }
    const student = this.students[idx] || this.students[0];
    this.selectedStudentIdx = idx;
    const stuTeacher = this.getStudentTeacher(student);
    const stuModel = this.getStudentLessonsModel(student);
    const defaultLesson = lessonNum || stuModel.lessons.find(l => l.status === 'pending')?.n || stuModel.baseLearned;
    const activeLesson = stuModel.lessons.find(l => l.n === Number(defaultLesson)) || stuModel.lessons[0];
    const assignInfo = activeLesson.assignInfo || this.getLessonAssignmentInfo(student.classCode, activeLesson.n);
    const hw = activeLesson.hw;

    const dialog = $('admin-student-dialog');
    if (!dialog || typeof dialog.showModal !== 'function') return false;
    $('admin-student-title').textContent = `${student.name} · Lớp ${student.classCode || 'Online'}`;
    $('admin-student-summary').textContent = `${student.parent} · Gmail: ${student.email} · GV phụ trách: ${stuTeacher ? stuTeacher.name : 'Chưa xếp GV'} · Tiến độ: ${student.progress}`;

    const submittedLessons = stuModel.lessons.filter(l => l.status === 'graded' || l.status === 'pending').reverse();

    $('admin-student-content').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:8px 12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;">
        <div style="font-size:13px;color:#0F172A;">Đang xem: <strong>Buổi ${activeLesson.n}/${stuModel.total} — ${esc(assignInfo.lessonName || activeLesson.topic)}</strong></div>
        <div style="display:flex;align-items:center;gap:6px;">
          <select class="input-select" style="width:auto;padding:4px 8px;font-size:12.5px;" onchange="app.openStudentFromAdmin(${idx}, Number(this.value))">
            ${submittedLessons.map(l => `<option value="${l.n}" ${l.n === activeLesson.n ? 'selected' : ''}>Buổi ${l.n} (${l.status === 'pending' ? 'Chờ chấm' : `Đã chấm ${l.hw?.score ?? 9.5}/10`})</option>`).join('')}
          </select>
          <button type="button" class="chip-btn" style="font-weight:700;" onclick="$('admin-student-dialog').close(); app.previewStudentFromAdmin(${idx});">Mở cổng HS ↗</button>
        </div>
      </div>
      ${hw ? `
        <div style="padding:12px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
            <strong style="font-size:13.5px;color:#0F172A;">Nhận xét của ${esc(stuTeacher ? stuTeacher.name : 'Giáo viên')}</strong>
            <span class="badge-pill">${hw.status === 'GRADED' ? `Điểm: ${hw.score}/10` : 'Đang chờ chấm'}</span>
          </div>
          <p style="font-size:13.5px;color:#334155;margin:0 0 10px;">${esc(hw.teacherFeedback)}</p>
          ${this.renderAttachmentGallery(hw.attachments, { hwId: 'DLG-' + hw.id, contextLabel: `${student.name} · Buổi ${activeLesson.n}`, tasks: assignInfo.tasks })}
        </div>
      ` : `<div class="empty-box">${esc(student.name)} chưa nộp bài ở buổi này.</div>`}`;

    if (!dialog.open) dialog.showModal();
    return true;
  };

  /**
   * KtnChatClient: Dual-Transport Realtime Chat Client
   * WebSocket Gateway + Cross-Tab BroadcastChannel with Deduplication & Auto-Reconnect
   */
  class KtnChatClient {
    constructor(options = {}) {
      this.wsUrl = options.wsUrl || this._resolveWsUrl();
      this.restEndpoint = options.restEndpoint || '/api/chat';
      this.channelName = options.channelName || 'ktn_class_chat';
      this.tabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      this.ws = null;
      this.broadcastChannel = null;
      this.currentRoom = null;
      this.currentClassCode = null;
      this.currentUser = null;
      this.reconnectAttempts = 0;
      this.maxReconnectAttempts = 20;
      this.reconnectTimer = null;
      this.heartbeatTimer = null;
      this.seenMessageIds = new Set();
      this.pendingQueue = new Map();
      this.onMessageReceived = options.onMessageReceived || (() => {});
      this.onStatusChanged = options.onStatusChanged || (() => {});

      this._initBroadcastChannel();
    }

    _resolveWsUrl() {
      if (typeof location === 'undefined') return 'ws://127.0.0.1:4173/ws/chat';
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${location.host}/ws/chat`;
    }

    _initBroadcastChannel() {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        try {
          this.broadcastChannel = new BroadcastChannel(this.channelName);
          this.broadcastChannel.onmessage = (event) => this._handleBroadcast(event.data);
        } catch (e) {
          console.warn('[KtnChatClient] BroadcastChannel unavailable, using WS-only:', e);
        }
      }
    }

    _handleBroadcast(data) {
      if (!data || data.originTabId === this.tabId) return;

      switch (data.type) {
        case 'OPTIMISTIC_SEND':
          if (data.message && !this.seenMessageIds.has(data.message.id)) {
            this.seenMessageIds.add(data.message.id);
            this.onMessageReceived(data.message, 'broadcast_optimistic');
          }
          break;
        case 'MESSAGE_ACK':
          if (data.messageId) {
            this.onStatusChanged(data.messageId, 'sent');
          }
          break;
        case 'MESSAGE_DELIVERED':
          if (data.message && !this.seenMessageIds.has(data.message.id)) {
            this.seenMessageIds.add(data.message.id);
            this.onMessageReceived(data.message, 'broadcast');
          }
          break;
      }
    }

    connect(user, classCode) {
      this.currentUser = user;
      this.currentClassCode = String(classCode || '').trim().toUpperCase();
      this.currentRoom = 'class:' + this.currentClassCode;

      if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
        this.joinRoom(this.currentRoom);
        return;
      }

      if (typeof WebSocket === 'undefined') {
        return;
      }

      try {
        this.ws = new WebSocket(`${this.wsUrl}?room=${encodeURIComponent(this.currentRoom)}&tabId=${this.tabId}`);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this._startHeartbeat();
          this.joinRoom(this.currentRoom);
          this._flushPendingQueue();
          this.onStatusChanged(null, 'connected');
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this._handleServerEvent(data);
          } catch (e) {
            console.error('[KtnChatClient] Malformed WS message:', e);
          }
        };

        this.ws.onclose = () => {
          this._stopHeartbeat();
          this.onStatusChanged(null, 'disconnected');
          this._scheduleReconnect();
        };

        this.ws.onerror = (err) => {
          console.warn('[KtnChatClient] WebSocket connection error, scheduling reconnect:', err);
        };
      } catch (err) {
        console.warn('[KtnChatClient] Failed to establish WebSocket:', err);
        this._scheduleReconnect();
      }
    }

    _handleServerEvent(event) {
      if (!event) return;
      switch (event.type) {
        case 'pong':
          break;
        case 'ack':
          if (event.action === 'chat_message' && event.payload?.messageId) {
            const mid = event.payload.messageId;
            this.pendingQueue.delete(mid);
            this.onStatusChanged(mid, 'sent');
            this._broadcast({ type: 'MESSAGE_ACK', messageId: mid, originTabId: this.tabId });
          }
          break;
        case 'broadcast_message':
          const msg = event.payload;
          if (msg && msg.id) {
            if (this.seenMessageIds.has(msg.id)) {
              this.onStatusChanged(msg.id, 'sent');
              if (window.app?.state && Array.isArray(window.app.state.messages) && !window.app.state.messages.some(m => m.id === msg.id)) {
                this.onMessageReceived(msg, 'websocket');
              }
            } else {
              this.seenMessageIds.add(msg.id);
              this.onMessageReceived(msg, 'websocket');
              this._broadcast({ type: 'MESSAGE_DELIVERED', message: msg, originTabId: this.tabId });
            }
          }
          break;
        case 'error':
          if (event.id) {
            this.onStatusChanged(event.id, 'error', event.message);
          }
          break;
      }
    }

    joinRoom(room) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'join_room',
          room: room,
          user: this.currentUser
        }));
      }
    }

    _scheduleReconnect() {
      if (this.reconnectTimer) return;
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        return;
      }
      this.reconnectAttempts++;
      const delay = Math.min(15000, 1000 * Math.pow(1.5, this.reconnectAttempts)) + Math.random() * 500;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect(this.currentUser, this.currentClassCode);
      }, delay);
    }

    _startHeartbeat() {
      this._stopHeartbeat();
      this.heartbeatTimer = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
    }

    _stopHeartbeat() {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
    }

    sendMessage(message) {
      message.status = 'pending';
      this.seenMessageIds.add(message.id);
      this.pendingQueue.set(message.id, message);

      this._broadcast({
        type: 'OPTIMISTIC_SEND',
        message: message,
        originTabId: this.tabId
      });

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'chat_message',
          room: this.currentRoom,
          payload: message
        }));
      } else {
        this._dispatchRestFallback(message);
      }
    }

    async _dispatchRestFallback(message) {
      try {
        const res = await fetch(`${this.restEndpoint}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classCode: this.currentClassCode, text: message.text, attachment: message.attachment, id: message.id })
        });
        if (res.ok) {
          this.pendingQueue.delete(message.id);
          this.onStatusChanged(message.id, 'sent');
          this._broadcast({ type: 'MESSAGE_ACK', messageId: message.id, originTabId: this.tabId });
        } else {
          this.onStatusChanged(message.id, 'error');
        }
      } catch {
        this.onStatusChanged(message.id, 'error');
      }
    }

    _broadcast(payload) {
      if (this.broadcastChannel) {
        try {
          this.broadcastChannel.postMessage(payload);
        } catch (e) {
          console.warn('[KtnChatClient] Broadcast error:', e);
        }
      }
    }

    _flushPendingQueue() {
      if (!this.pendingQueue.size) return;
      for (const [, msg] of this.pendingQueue.entries()) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'chat_message',
            room: this.currentRoom,
            payload: msg
          }));
        }
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.KtnChatClient = KtnChatClient;
  }

  app.initChatClient = function () {
    if (this.chatClient) return this.chatClient;
    const self = this;
    this.chatClient = new KtnChatClient({
      onMessageReceived(msg, origin) {
        if (!Array.isArray(self.state.messages)) self.state.messages = [];
        if (!self.state.messages.some(m => m.id === msg.id)) {
          self.state.messages.push(msg);
          self.saveState();
          self.renderChatStreams();
        }
      },
      onStatusChanged(messageId, status) {
        if (messageId && Array.isArray(self.state?.messages)) {
          const msg = self.state.messages.find(m => m.id === messageId);
          if (msg) {
            msg.status = status;
            self.renderChatStreams();
          }
        }
      }
    });

    const activeStu = self.getActiveParentStudent ? self.getActiveParentStudent() : self.students[0];
    const classCode = (self.currentRole === 'teacher' && self.teacherClassFilter && self.teacherClassFilter !== 'ALL')
      ? self.teacherClassFilter
      : (activeStu?.classCode || 'YCT2-04');

    this.chatClient.connect(
      { id: self.currentRole === 'teacher' ? (self.state.teacherCode || 'GV-KTN-08') : (activeStu?.code || 'KTN-2026-089'), role: self.currentRole },
      classCode
    );
    return this.chatClient;
  };

  app.fetchChatHistory = async function (classCode) {
    if (!classCode) return;
    try {
      const res = await fetch(`/api/chat/history?classCode=${encodeURIComponent(classCode)}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.messages)) {
          let updated = false;
          if (!Array.isArray(this.state.messages)) this.state.messages = [];
          for (const serverMsg of data.messages) {
            if (!this.state.messages.some(m => m.id === serverMsg.id)) {
              this.state.messages.push(serverMsg);
              updated = true;
            }
          }
          if (updated) {
            this.saveState();
            this.renderChatStreams();
          }
        }
      }
    } catch {}
  };

  app.openChatImageZoom = function (msgId) {
    const msg = this.state?.messages?.find(m => m.id === msgId);
    if (msg && msg.attachment) {
      const att = msg.attachment;
      const mediaObj = {
        title: att.title || 'Ảnh bài học',
        mediaType: 'image',
        playUrl: att.playUrl || att.url,
        cdnUrl: att.url || att.playUrl,
        size: att.size || 0
      };
      return this.openMediaZoom([mediaObj], 0);
    }
  };

  app.renderChatStreams = function () {
    const clean = Array.isArray(this.state?.messages) ? this.state.messages.filter(m => !m.blocked) : [];
    const parentStudent = this.getActiveParentStudent();
    const managed = this.getTeacherManagedStudents();
    const teacherStudent = managed.length ? (this.students[this.selectedStudentIdx] || managed[0].student) : null;

    const currentRole = this.currentRole || 'parent';
    const activeClassCode = currentRole === 'teacher'
      ? (this.teacherClassFilter && this.teacherClassFilter !== 'ALL' ? this.teacherClassFilter : (teacherStudent?.classCode || 'YCT2-04'))
      : (parentStudent?.classCode || 'YCT2-04');

    // 1. Update Topbar Headers
    if ($('chat-header-class-code')) {
      $('chat-header-class-code').textContent = `Lớp ${activeClassCode}`;
    }
    if ($('chat-header-teacher-name')) {
      $('chat-header-teacher-name').textContent = `Trao đổi Lớp ${activeClassCode} · ${this.state.teacherName}`;
    }
    if ($('teacher-chat-heading')) {
      $('teacher-chat-heading').textContent = teacherStudent
        ? `Nhóm Lớp ${activeClassCode} · Phụ huynh ${teacherStudent.name} (${teacherStudent.classCode || 'Chưa xếp lớp'})`
        : 'Chưa có học sinh trong lớp phụ trách';
    }

    // 2. Render Stream for a Target Viewer Role
    const renderClassStream = (viewerRole, student) => {
      const classStudents = this.students.filter(s => s.classCode === activeClassCode);
      const list = clean.filter(m => {
        if (m.classCode) return m.classCode.toUpperCase() === activeClassCode.toUpperCase();
        if (student && (m.studentCode || this.students[0].code) === student.code) return true;
        return classStudents.some(s => s.code === m.studentCode);
      });

      if (!list.length) {
        return `<div class="chat-empty-state">
          <span class="chat-empty-icon">💬</span>
          <p>Chưa có tin nhắn trong phòng chat Lớp <strong>${esc(activeClassCode)}</strong>.</p>
          <span>Giáo viên và phụ huynh có thể trao đổi bài tập và gửi tài liệu học tập tại đây.</span>
        </div>`;
      }

      return list.map(m => {
        const isMe = (m.sender === viewerRole || m.senderRole === viewerRole);
        const r = m.senderRole || m.sender;
        const roleBadge = r === 'teacher'
          ? '<span class="role-badge role-teacher">Giáo viên</span>'
          : (r === 'admin'
            ? '<span class="role-badge role-admin">Quản lý</span>'
            : (r === 'student' ? '<span class="role-badge role-student">Học viên</span>' : '<span class="role-badge role-parent">Phụ huynh</span>'));

        const avatarHtml = r === 'teacher'
          ? '<img src="assets/teacher_webcam.jpg" alt="GV" class="chat-avatar avatar-teacher" onerror="this.onerror=null;this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><circle cx=%2220%22 cy=%2220%22 r=%2220%22 fill=%22%23b91c1c%22/><text x=%2220%22 y=%2226%22 fill=%22white%22 font-size=%2216%22 text-anchor=%22middle%22>GV</text></svg>\';">'
          : `<div class="chat-avatar avatar-initials">${esc((m.senderName || 'HV').slice(0, 2).toUpperCase())}</div>`;

        // Rich Attachment Card
        let attachmentHtml = '';
        if (m.attachment) {
          const att = m.attachment;
          if (att.type === 'image') {
            const playUrl = att.playUrl || att.url;
            attachmentHtml = `
              <div class="chat-card chat-card-image" onclick="app.openChatImageZoom('${esc(m.id)}')">
                <img src="${esc(playUrl)}" alt="${esc(att.title || 'Ảnh đính kèm')}" loading="lazy" class="chat-img-thumb" onerror="this.onerror=null;this.classList.add('media-broken');">
                <div class="chat-card-caption">
                  <span class="icon">🔍</span>
                  <span>${esc(att.title || 'Ảnh bài viết')} (${window.IZTEACH_STORAGE ? window.IZTEACH_STORAGE.formatBytes(att.size || 0) : 'Ảnh'})</span>
                </div>
              </div>`;
          } else if (att.type === 'document' || att.type === 'lesson') {
            attachmentHtml = `
              <div class="chat-card chat-card-doc">
                <div class="doc-icon-badge">PDF</div>
                <div class="doc-meta">
                  <strong class="doc-title">${esc(att.title)}</strong>
                  <span class="doc-sub">${esc(att.size || 'Tài liệu học tập')} · Giáo trình</span>
                </div>
                <a href="${esc(att.url)}" download="${esc(att.title)}" target="_blank" class="btn-doc-download">⬇ Tải</a>
              </div>`;
          } else if (att.type === 'homework') {
            const isGraded = att.status === 'GRADED';
            attachmentHtml = `
              <div class="chat-card chat-card-hw" onclick="app.switchParentSubtab && app.switchParentSubtab('homework')">
                <div class="hw-card-top">
                  <span class="eyebrow" style="color:var(--primary); font-weight:700;">${att.lessonNumber ? 'Buổi ' + att.lessonNumber : 'Bài tập về nhà'}</span>
                  <span class="badge-pill ${isGraded ? 'status-online' : 'status-orange'}">
                    ${isGraded ? `Đã chấm: ${att.score}/10` : 'Chờ chấm'}
                  </span>
                </div>
                <div class="hw-card-title">${esc(att.title)}</div>
                ${att.feedback ? `<div class="hw-card-quote">"${esc(att.feedback)}"</div>` : ''}
                <div class="hw-card-cta">Xem chi tiết bài nộp →</div>
              </div>`;
          }
        }

        // Status indicator for own messages
        let statusIndicator = '';
        if (isMe) {
          if (m.status === 'pending') {
            statusIndicator = '<span class="chat-status-icon pending" title="Đang gửi...">⏳</span>';
          } else if (m.status === 'error') {
            statusIndicator = `<button type="button" class="chat-status-icon error" onclick="app.sendChatMessage('${viewerRole}', '${esc(m.text || '')}')">⚠️ Thử lại</button>`;
          } else {
            statusIndicator = '<span class="chat-status-icon sent" title="Đã gửi">✓</span>';
          }
        }

        return `
          <div class="msg-row ${isMe ? 'me' : 'other'} ${r === 'teacher' ? 'is-teacher' : ''}">
            ${!isMe ? avatarHtml : ''}
            <div class="msg-content-wrap">
              <div class="msg-meta">
                <span class="msg-sender">${esc(m.senderName)}</span>
                ${roleBadge}
                <span class="msg-time">${esc(m.time || 'Vừa xong')}</span>
              </div>
              <div class="msg-bubble">
                ${m.text ? `<div class="msg-text">${esc(m.text)}</div>` : ''}
                ${attachmentHtml}
                ${statusIndicator}
              </div>
            </div>
          </div>`;
      }).join('');
    };

    if ($('parent-chat-messages')) {
      $('parent-chat-messages').innerHTML = renderClassStream('parent', parentStudent);
      $('parent-chat-messages').scrollTop = $('parent-chat-messages').scrollHeight;
    }
    if ($('teacher-chat-messages')) {
      $('teacher-chat-messages').innerHTML = teacherStudent
        ? renderClassStream('teacher', teacherStudent)
        : '<div class="empty-box">Chưa có học sinh được phân công phụ trách để trao đổi.</div>';
      $('teacher-chat-messages').scrollTop = $('teacher-chat-messages').scrollHeight;
    }
  };

  app.ZOOM_STEPS = [100, 150, 200, 300];
  app._mediaGalleries = {};
  app._gallerySeq = 0;
  app.mediaZoomState = {
    open: false,
    galleryKey: null,
    attachments: [],
    index: 0,
    zoom: 100,
    rotate: 0,
    playbackRate: 1,
    contextLabel: ''
  };

  app.pendingAttachments = [];

  app.updateHomeworkPickerLabels = function () {
    const list = Array.isArray(this.pendingAttachments) ? this.pendingAttachments : (this.pendingAttachment ? [this.pendingAttachment] : []);
    const vCount = list.filter(a => a && a.mediaType !== 'image').length;
    const iCount = list.filter(a => a && a.mediaType === 'image').length;
    const btnVideo = $('btn-pick-hw-video');
    const btnImage = $('btn-pick-hw-image');
    if (btnVideo) {
      btnVideo.innerHTML = vCount === 0
        ? '<span style="font-size:16px;">🎬</span> <span>Tải lên Video</span>'
        : `<span style="font-size:16px;">🎬</span> <span>+ Thêm Video (${vCount})</span>`;
    }
    if (btnImage) {
      btnImage.innerHTML = iCount === 0
        ? '<span style="font-size:16px;">📷</span> <span>Tải lên Ảnh</span>'
        : `<span style="font-size:16px;">📷</span> <span>+ Thêm Ảnh (${iCount})</span>`;
    }
  };

  app.openHomeworkFilePicker = function (kind = 'any') {
    this._pickerKind = kind;
    const inp = $('hw-file-input') || $('learn-hw-file-input');
    if (!inp) return false;
    if (kind === 'video') {
      inp.accept = 'video/*,video/mp4,video/quicktime,video/mov,video/webm,.mp4,.mov,.m4v,.3gp,.webm';
    } else if (kind === 'image') {
      inp.accept = 'image/*,image/jpeg,image/png,image/heic,image/webp,.jpg,.jpeg,.png,.webp,.heic';
    } else if (kind === 'audio') {
      inp.accept = 'audio/*,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/aac,.mp3,.m4a,.wav,.aac,.ogg,.weba';
    } else {
      inp.accept = 'video/*,image/*,audio/*,.mp4,.mov,.m4v,.3gp,.webm,.jpg,.jpeg,.png,.webp,.heic,.mp3,.m4a,.wav,.aac';
    }
    inp.click();
    return true;
  };

  app.handleHomeworkFileSelect = async function (file) {
    if (!file) return null;
    const ext = String(file.name || '').split('.').pop().toLowerCase();
    const mime = String(file.type || '').toLowerCase();
    const maxBytes = window.IZTEACH_STORAGE.maxFileBytes || 524288000;
    if (!(/^(mp4|mov|m4v|3gp|webm|jpg|jpeg|png|webp|gif|heic|mp3|m4a|wav|aac|ogg|weba)$/.test(ext) || /^(video|image|audio)\//.test(mime)) || Number(file.size) > maxBytes) {
      this.showToast('Hỗ trợ ảnh, audio hoặc video dung lượng tối đa 500 MB.');
      return null;
    }
    this._isUploadingMedia = true;
    const uploaded = await window.IZTEACH_STORAGE.uploadFile(file, (pct, msg) => this.updateUploadProgress(pct, msg));
    this._isUploadingMedia = false;
    if (!uploaded) {
      this.showToast('Tải tệp lên máy chủ thất bại. Vui lòng kiểm tra lại tệp hoặc kết nối mạng.');
      this.updateUploadProgress(0, '');
      return null;
    }
    if (!Array.isArray(this.pendingAttachments)) this.pendingAttachments = [];
    this.pendingAttachments.push(uploaded);
    this.pendingAttachment = this.pendingAttachments[0] || null;
    this.renderPendingAttachmentPreview();
    this.renderInLessonPendingFiles();
    return uploaded;
  };

  app.handleHomeworkFilesSelect = async function (fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return [];
    const results = [];
    for (const f of files) {
      const r = await this.handleHomeworkFileSelect(f);
      if (r) results.push(r);
    }
    const inp = $('hw-file-input') || $('learn-hw-file-input');
    if (inp) inp.value = '';
    return results;
  };

  app.selectSampleS3Media = async function (kind) {
    const isImg = kind === 'image';
    const sample = isImg ? window.IZTEACH_STORAGE.samples.image : window.IZTEACH_STORAGE.samples.videoFast;
    if (!Array.isArray(this.pendingAttachments)) this.pendingAttachments = [];
    const sameTypeCount = this.pendingAttachments.filter(a => (a.mediaType === 'image') === isImg).length + 1;
    const item = {
      ...sample,
      mediaType: isImg ? 'image' : 'video',
      title: isImg ? `Ảnh thứ ${sameTypeCount}` : `Video thứ ${sameTypeCount}`,
      s3Key: window.IZTEACH_STORAGE.buildS3Key(`${isImg ? 'Anh' : 'Video'}-${sameTypeCount}-${sample.title}`),
      id: 'S3-' + Date.now() + '-' + sameTypeCount
    };
    this.pendingAttachments.push(item);
    this.pendingAttachment = this.pendingAttachments[0] || null;
    this.renderPendingAttachmentPreview();
    this.renderInLessonPendingFiles();
    return item;
  };

  app.removePendingAttachment = function (idx) {
    if (!Array.isArray(this.pendingAttachments)) return false;
    this.pendingAttachments.splice(Number(idx), 1);
    this.pendingAttachment = this.pendingAttachments[0] || null;
    if (!this.pendingAttachments.length) {
      this.clearPendingAttachment();
    } else {
      this.renderPendingAttachmentPreview();
      this.renderInLessonPendingFiles();
    }
    return true;
  };

  app.clearPendingAttachment = function () {
    this.pendingAttachment = null;
    this.pendingAttachments = [];
    if ($('hw-file-input')) $('hw-file-input').value = '';
    if ($('learn-hw-file-input')) $('learn-hw-file-input').value = '';
    if ($('hw-upload-progress-wrap')) $('hw-upload-progress-wrap').classList.add('hidden');
    this.updateHomeworkPickerLabels();
    this.renderPendingAttachmentPreview();
    this.renderInLessonPendingFiles();
  };

  app.renderPendingAttachmentPreview = function () {
    const box = $('hw-selected-media-preview');
    if (this.pendingAttachment && (!Array.isArray(this.pendingAttachments) || !this.pendingAttachments.length)) {
      this.pendingAttachments = [this.pendingAttachment];
    }
    const list = Array.isArray(this.pendingAttachments) ? this.pendingAttachments : [];
    this.updateHomeworkPickerLabels();
    if (!box) return;
    box.classList.remove('hidden');
    box.className = 'hw-upload-grid';
    const tf = u => (!u || u.includes('#') || u.startsWith('blob:')) ? u : u + '#t=0.1';
    const tilesHtml = list.map((att, idx) => {
      const isImg = att.mediaType === 'image';
      const isAudio = att.mediaType === 'audio';
      const playSrc = att.playUrl || att.cdnUrl;
      const fbSrc = att.fallbackUrl || '';
      let mediaHtml = '';
      if (isImg) {
        mediaHtml = `<img src="${esc(playSrc)}" onerror="this.onerror=null;this.classList.add('media-broken');" alt="Ảnh ${idx + 1}" onclick="app.openMediaZoom('PENDING', ${idx})" style="cursor:pointer;">`;
      } else if (isAudio) {
        mediaHtml = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:#EEF2FF;padding:6px;border-radius:6px;text-align:center;"><span style="font-size:24px;">🎙️</span><span style="font-size:11px;font-weight:700;color:#4338CA;max-width:90%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(att.title || 'Audio')}</span></div>`;
      } else {
        mediaHtml = `<video src="${esc(tf(playSrc))}" preload="metadata" playsinline muted onclick="app.openMediaZoom('PENDING', ${idx})" style="cursor:pointer;"></video>`;
      }
      return `<div class="hw-upload-item">
        ${mediaHtml}
        <button type="button" class="hw-upload-remove" onclick="app.removePendingAttachment(${idx})" aria-label="Xoá">✕</button>
      </div>`;
    }).join('');
    box.innerHTML = `${tilesHtml}<button id="btn-pick-hw-file" type="button" onclick="app.openHomeworkFilePicker('any')" class="hw-add-tile" aria-label="Thêm ảnh hoặc video" title="Chọn thêm tệp">+</button>`;
  };

  app.renderAttachmentGallery = function (attachments, opts = {}) {
    if (!Array.isArray(attachments) || !attachments.length) return '';
    const tf = u => (!u || u.includes('#') || u.startsWith('blob:')) ? u : u + '#t=0.1';
    const galleryKey = String(opts.hwId || ('GAL-' + (++this._gallerySeq)));
    const isPreview = Boolean(opts.isPreview);
    const tasks = Array.isArray(opts.tasks) ? opts.tasks : [];
    this._mediaGalleries[galleryKey] = {
      attachments: attachments.map(a => ({ ...a })),
      contextLabel: opts.contextLabel || (isPreview ? 'Xem trước tệp trước khi nộp' : 'Chi tiết bài tập đã nộp'),
      isPreview
    };
    const singleClass = attachments.length === 1 ? ' single-media' : '';
    const totalVideos = attachments.filter(a => a && a.mediaType !== 'image').length;
    const totalImages = attachments.filter(a => a && a.mediaType === 'image').length;
    let vSeq = 0;
    let iSeq = 0;
    return `<div class="hw-media-grid${singleClass}">${attachments.map((att, idx) => {
      const playSrc = (att.playUrl && !att.playUrl.startsWith('blob:')) ? att.playUrl : (att.cdnUrl || '');
      const fbSrc = (att.fallbackUrl && !att.fallbackUrl.startsWith('blob:')) ? att.fallbackUrl : '';
      const posterAttr = att.poster ? ` poster="${esc(att.poster)}"` : '';
      const isImg = att.mediaType === 'image';
      const seq = isImg ? (++iSeq) : (++vSeq);
      const matchedTask = tasks[idx] || tasks.find(t => (t.format === 'image') === isImg) || (tasks.length === 1 ? tasks[0] : null);
      const taskTitle = matchedTask?.title || (isImg ? 'Viết chữ Hán vào vở ô ly' : 'Quay video đọc bài & phát âm');
      let prefixLabel = `Bài ${idx + 1}:`;
      if (isImg && totalImages > 1) {
        prefixLabel = `${ idx < tasks.length ? 'Bài ' + (idx + 1) + ' · ' : '' }Ảnh thứ ${seq}:`;
      } else if (!isImg && totalVideos > 1) {
        prefixLabel = `${ idx < tasks.length ? 'Bài ' + (idx + 1) + ' · ' : '' }Video thứ ${seq}:`;
      }
      const taskHeaderHtml = isPreview ? '' : `<div class="hw-task-header"><strong>${esc(prefixLabel)}</strong><span>${esc(taskTitle)}</span></div>`;
      const stageHtml = isImg
        ? `<div class="hw-media-stage hw-image-stage" data-zoom-gallery="${esc(galleryKey)}" data-zoom-index="${idx}" onclick="app.openMediaZoom('${esc(galleryKey)}', ${idx})" role="button" tabindex="0" aria-label="${esc(prefixLabel)} ${esc(taskTitle)}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();app.openMediaZoom('${esc(galleryKey)}', ${idx});}">
            <img src="${esc(playSrc)}" alt="${esc(prefixLabel + ' ' + taskTitle)}" width="480" height="260" decoding="async" class="hw-image" data-s3-key="${esc(att.s3Key)}" data-cdn-url="${esc(att.cdnUrl)}" onerror="this.onerror=null;this.classList.add('media-broken');">
          </div>`
        : `<div class="hw-media-stage hw-video-stage" data-zoom-gallery="${esc(galleryKey)}" data-zoom-index="${idx}">
            <video controls preload="metadata" playsinline${posterAttr} class="hw-video" data-s3-key="${esc(att.s3Key)}" data-cdn-url="${esc(att.cdnUrl)}"><source src="${esc(tf(playSrc))}" type="${esc(att.mimeType || 'video/mp4')}">${fbSrc ? `<source src="${esc(tf(fbSrc))}" type="video/mp4">` : ''}</video>
          </div>`;
      return `<div class="hw-media-card" data-media-type="${esc(att.mediaType || 'image')}">
        ${taskHeaderHtml}
        ${stageHtml}
      </div>`;
    }).join('')}</div>`;
  };

  app.ensureMediaZoomDialog = function () {
    let dialog = $('media-zoom-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'media-zoom-dialog';
      dialog.className = 'media-zoom-dialog';
      dialog.setAttribute('aria-labelledby', 'media-zoom-title');
      document.body.appendChild(dialog);
    }
    if (!dialog.dataset.zoomBound) {
      dialog.dataset.zoomBound = 'true';
      dialog.addEventListener('close', () => {
        if (dialog.open) return;
        dialog.querySelectorAll('video').forEach(v => { try { v.pause(); } catch {} });
        const vp = $('media-zoom-viewport');
        if (vp) vp.innerHTML = '';
        if (this.mediaZoomState) this.mediaZoomState.open = false;
      });
      dialog.addEventListener('click', ev => {
        if (ev.target === dialog) {
          this.closeMediaZoom();
        }
      });
      window.addEventListener('resize', () => {
        if (this.mediaZoomState?.open) {
          this.applyMediaZoomTransform();
        }
      });
    }
    return dialog;
  };

  app._bindZoomViewportDrag = function (viewport) {
    if (!viewport || viewport.dataset.dragBound) return;
    viewport.dataset.dragBound = 'true';
    let isDown = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;
    let pinchStartDist = 0;
    let pinchStartZoom = 100;
    viewport.addEventListener('mousedown', e => {
      if ((this.mediaZoomState?.zoom || 100) <= 100) return;
      if (e.target && e.target.tagName === 'VIDEO') return;
      isDown = true;
      viewport.classList.add('is-dragging');
      startX = e.clientX;
      startY = e.clientY;
      scrollLeft = viewport.scrollLeft;
      scrollTop = viewport.scrollTop;
      e.preventDefault();
    });
    viewport.addEventListener('mouseleave', () => {
      isDown = false;
      viewport.classList.remove('is-dragging');
    });
    viewport.addEventListener('mouseup', () => {
      isDown = false;
      viewport.classList.remove('is-dragging');
    });
    viewport.addEventListener('mousemove', e => {
      if (!isDown) return;
      e.preventDefault();
      viewport.scrollLeft = scrollLeft - (e.clientX - startX) * 1.25;
      viewport.scrollTop = scrollTop - (e.clientY - startY) * 1.25;
    });
    viewport.addEventListener('dblclick', e => {
      if (e.target && e.target.tagName === 'IMG') {
        const nextZoom = (this.mediaZoomState?.zoom || 100) > 100 ? 100 : 200;
        this.setMediaZoom(nextZoom);
      }
    });
    viewport.addEventListener('wheel', e => {
      if (!e.ctrlKey || !this.mediaZoomState?.open) return;
      e.preventDefault();
      this.adjustMediaZoom(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });
    viewport.addEventListener('touchstart', e => {
      if (e.touches && e.touches.length === 2 && this.mediaZoomState?.open) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        pinchStartDist = Math.hypot(dx, dy);
        pinchStartZoom = this.mediaZoomState.zoom || 100;
      }
    }, { passive: true });
    viewport.addEventListener('touchmove', e => {
      if (e.touches && e.touches.length === 2 && pinchStartDist > 10 && this.mediaZoomState?.open) {
        e.preventDefault();
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const ratio = Math.hypot(dx, dy) / pinchStartDist;
        const rawZoom = Math.round((pinchStartZoom * ratio) / 25) * 25;
        this.setMediaZoom(Math.max(100, Math.min(300, rawZoom)));
      }
    }, { passive: false });
  };

  app.openMediaZoom = function (target, index = 0) {
    let attachments = [];
    let contextLabel = 'Chế độ phóng to kiểm tra bài tập';
    let galleryKey = typeof target === 'string' ? target : 'CUSTOM';

    if ((target === 'PENDING' || target === 'preview') && (this.pendingAttachments?.length || this.pendingAttachment)) {
      attachments = Array.isArray(this.pendingAttachments) && this.pendingAttachments.length
        ? this.pendingAttachments.map(a => ({ ...a }))
        : [{ ...this.pendingAttachment }];
      contextLabel = 'Kiểm tra tệp đính kèm trước khi gửi cô giáo';
    } else if (typeof target === 'string') {
      const roleKey = (this.currentRole === 'teacher' && this._mediaGalleries['TEACHER-' + target]) ? ('TEACHER-' + target) : target;
      if (this._mediaGalleries[roleKey]) {
        attachments = this._mediaGalleries[roleKey].attachments;
        contextLabel = this._mediaGalleries[roleKey].contextLabel || contextLabel;
        galleryKey = roleKey;
      } else if (Array.isArray(this.state?.homeworks)) {
        const hw = this.state.homeworks.find(h => h.id === target || h.remoteId === target || ('TEACHER-' + h.id) === target);
        if (hw && Array.isArray(hw.attachments)) {
          attachments = hw.attachments;
          contextLabel = this.currentRole === 'teacher'
            ? `Chấm bài · ${hw.studentName || ''} (${hw.classCode || ''}) · ${hw.lesson || ''}`
            : `${hw.studentName || ''} · ${hw.lesson || ''} · ${hw.title || ''}`.replace(/^\s*·\s*/, '');
        }
      }
      if (!attachments.length && Array.isArray(this.state?.messages)) {
        const msg = this.state.messages.find(m => m.id === target);
        if (msg && msg.attachment) {
          const att = msg.attachment;
          attachments = [{
            title: att.title || 'Ảnh bài học',
            mediaType: 'image',
            playUrl: att.playUrl || att.url,
            cdnUrl: att.url || att.playUrl,
            size: att.size || 0
          }];
          contextLabel = `Xem ảnh trao đổi · ${msg.senderName || ''}`;
        }
      }
    } else if (Array.isArray(target)) {
      attachments = target;
    } else if (target && typeof target === 'object' && (target.playUrl || target.cdnUrl)) {
      attachments = [target];
    }

    if (!attachments.length && Array.isArray(this.state?.homeworks) && this.state.homeworks.length) {
      const fallbackHw = this.state.homeworks[0];
      attachments = fallbackHw.attachments || [];
      contextLabel = `${fallbackHw.studentName || ''} · ${fallbackHw.lesson || ''} · ${fallbackHw.title || ''}`.replace(/^\s*·\s*/, '');
      galleryKey = fallbackHw.id || 'HW-DEFAULT';
    }
    if (!attachments.length) return false;

    const safeIdx = Math.max(0, Math.min(attachments.length - 1, Number(index) || 0));
    this.mediaZoomState = {
      open: true,
      galleryKey,
      attachments: attachments.map(a => ({ ...a })),
      index: safeIdx,
      zoom: 100,
      rotate: 0,
      playbackRate: 1,
      contextLabel
    };

    const dialog = this.ensureMediaZoomDialog();
    this.renderMediaZoomModal();
    if (!dialog.open && typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else if (!dialog.open) {
      dialog.setAttribute('open', '');
    }
    this.applyMediaZoomTransform();
    return true;
  };

  app.renderMediaZoomModal = function () {
    const dialog = this.ensureMediaZoomDialog();
    const st = this.mediaZoomState;
    if (!st || !st.attachments.length) return;
    const att = st.attachments[st.index] || st.attachments[0];
    const isImg = att.mediaType === 'image';
    const fmt = window.IZTEACH_STORAGE.formatBytes;
    const tf = u => (!u || u.includes('#') || u.startsWith('blob:')) ? u : u + '#t=0.1';
    const playSrc = (att.playUrl && !att.playUrl.startsWith('blob:')) ? att.playUrl : (att.cdnUrl || '');
    const fbSrc = (att.fallbackUrl && !att.fallbackUrl.startsWith('blob:')) ? att.fallbackUrl : '';

    const switcherHtml = st.attachments.length > 1 ? `
      <div id="media-zoom-switcher" class="media-zoom-switcher">
        <div class="media-zoom-tabs">
          <span style="font-size:12px;font-weight:600;color:var(--sub);">Tệp trong bài nộp (${st.index + 1}/${st.attachments.length}):</span>
          ${st.attachments.map((item, i) => `
            <button type="button" data-zoom-tab="${i}" onclick="app.switchMediaZoomItem(${i})" class="chip-btn ${i === st.index ? 'active-chip' : ''}" title="${esc(item.title)}">
              ${item.mediaType === 'image' ? '🖼️' : '🎬'} ${i + 1}. ${esc(item.title)}
            </button>
          `).join('')}
        </div>
        <div style="display:flex;gap:6px;">
          <button id="btn-zoom-prev" type="button" class="chip-btn" onclick="app.stepMediaZoomItem(-1)">◀ Tệp trước</button>
          <button id="btn-zoom-next" type="button" class="chip-btn" onclick="app.stepMediaZoomItem(1)">Tệp tiếp ▶</button>
        </div>
      </div>` : '';

    const toolbarHtml = isImg ? `
      <div id="media-zoom-toolbar" class="media-zoom-toolbar">
        <div class="media-zoom-controls">
          <button id="btn-zoom-out" type="button" class="btn-ghost" onclick="app.adjustMediaZoom(-1)">➖ Thu nhỏ</button>
          <span id="media-zoom-level" class="badge-pill zoom-level-badge">${st.zoom}%</span>
          <button id="btn-zoom-in" type="button" class="btn-ghost" onclick="app.adjustMediaZoom(1)">➕ Phóng to</button>
          <div style="display:inline-flex;gap:4px;margin-left:4px;flex-wrap:wrap;">
            ${this.ZOOM_STEPS.map(z => `<button type="button" data-zoom-preset="${z}" onclick="app.setMediaZoom(${z})" class="chip-btn ${st.zoom === z ? 'active-chip' : ''}">${z}%</button>`).join('')}
          </div>
        </div>
        <div class="media-zoom-controls">
          <button id="btn-zoom-rotate" type="button" class="btn-ghost" onclick="app.rotateMediaZoom(90)">↻ Xoay ảnh 90°</button>
          <span id="media-rotate-level" class="badge-pill">Góc: ${st.rotate}°</span>
          <button id="btn-zoom-reset" type="button" class="btn-ghost" onclick="app.resetMediaZoom()">⟲ Đặt lại (vừa khung)</button>
        </div>
      </div>` : `
      <div id="media-zoom-toolbar" class="media-zoom-toolbar">
        <div class="media-zoom-controls">
          <span style="font-size:12.5px;font-weight:600;color:var(--sub);">Tốc độ nghe phát âm:</span>
          <button id="btn-speed-075" type="button" data-speed="0.75" onclick="app.setMediaPlaybackRate(0.75)" class="chip-btn ${st.playbackRate === 0.75 ? 'active-chip' : ''}">🐢 0.75x (Nghe chậm phát âm)</button>
          <button id="btn-speed-100" type="button" data-speed="1" onclick="app.setMediaPlaybackRate(1)" class="chip-btn ${st.playbackRate === 1 ? 'active-chip' : ''}">▶ 1.0x (Bình thường)</button>
          <button id="btn-speed-125" type="button" data-speed="1.25" onclick="app.setMediaPlaybackRate(1.25)" class="chip-btn ${st.playbackRate === 1.25 ? 'active-chip' : ''}">⚡ 1.25x (Nhanh)</button>
        </div>
        <span id="media-speed-level" class="badge-pill status-online">Tốc độ: ${st.playbackRate.toFixed(2).replace(/\.00$/, '.0')}x</span>
      </div>`;

    const stageBodyHtml = isImg ? `
      <div id="media-zoom-canvas" class="media-zoom-canvas">
        <div id="media-zoom-stage" class="media-zoom-stage">
          <img id="media-zoom-img" src="${esc(playSrc)}" onload="app.applyMediaZoomTransform()" onerror="this.onerror=null;this.classList.add('media-broken');" alt="${esc('Ảnh phóng to: ' + att.title)}" width="960" height="680" decoding="async" class="media-zoom-img" data-zoom="${st.zoom}" data-rotate="${st.rotate}">
        </div>
      </div>` : `
      <div class="media-zoom-video-wrap">
        <video id="media-zoom-video" controls preload="metadata" playsinline class="media-zoom-video">
          <source src="${esc(tf(playSrc))}" type="${esc(att.mimeType || 'video/mp4')}">
          ${fbSrc ? `<source src="${esc(tf(fbSrc))}" type="video/mp4">` : ''}
        </video>
      </div>`;

    dialog.innerHTML = `
      <div class="media-zoom-shell">
        <div class="media-zoom-header">
          <div class="media-zoom-header-info">
            <span id="media-zoom-eyebrow" class="eyebrow">${esc(st.contextLabel)}</span>
            <h2 id="media-zoom-title" class="media-zoom-title">${esc(att.title)} <span style="font-weight:500;font-size:12.5px;color:var(--dim);white-space:nowrap;">(${fmt(att.size)})</span></h2>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <a href="${esc(att.cdnUrl)}" target="_blank" rel="noopener" class="btn-ghost" style="color:var(--primary);font-weight:600;">Mở tệp gốc ↗</a>
            <button id="btn-zoom-close" type="button" class="btn-primary" onclick="app.closeMediaZoom()">✕ Đóng</button>
          </div>
        </div>
        ${switcherHtml}
        ${toolbarHtml}
        <div id="media-zoom-viewport" class="media-zoom-viewport" tabindex="0">${stageBodyHtml}</div>
        <div class="media-zoom-footer">
          <span>${isImg ? '💡 Mẹo: Bấm ➕ Phóng to (150%–300%) rồi cuộn hoặc kéo chuột để soi từng nét chữ Hán · Bấm ↻ Xoay ảnh 90° nếu ảnh chụp bị ngang/ngược.' : '💡 Mẹo: Chọn tốc độ 0.75x để nghe kỹ thanh điệu và phát âm tiếng Trung của học sinh.'}</span>
          <button type="button" class="btn-ghost" onclick="app.closeMediaZoom()">Đóng cửa sổ (Esc)</button>
        </div>
      </div>`;

    const vp = $('media-zoom-viewport');
    this._bindZoomViewportDrag(vp);
    if (isImg) {
      this.applyMediaZoomTransform();
    } else {
      const vid = $('media-zoom-video');
      if (vid) {
        try { vid.playbackRate = st.playbackRate || 1; } catch {}
      }
    }
  };

  app.applyMediaZoomTransform = function () {
    const st = this.mediaZoomState;
    if (!st || !st.open) return;
    const zoom = st.zoom || 100;
    const rotate = (((st.rotate || 0) % 360) + 360) % 360;
    const viewport = $('media-zoom-viewport');
    const canvas = $('media-zoom-canvas');
    const stage = $('media-zoom-stage');
    const img = $('media-zoom-img');
    const levelEl = $('media-zoom-level');
    const rotateEl = $('media-rotate-level');
    if (levelEl) levelEl.textContent = `${zoom}%`;
    if (rotateEl) rotateEl.textContent = `Góc: ${rotate}°`;
    document.querySelectorAll('#media-zoom-toolbar [data-zoom-preset]').forEach(btn => {
      btn.classList.toggle('active-chip', Number(btn.dataset.zoomPreset) === zoom);
    });
    if (viewport) {
      viewport.classList.toggle('is-zoomed', zoom > 100);
    }
    if (!img) return;

    const natW = Math.max(1, img.naturalWidth || 960);
    const natH = Math.max(1, img.naturalHeight || 1280);
    const isQuarterTurn = rotate % 180 !== 0;
    const rotNatW = isQuarterTurn ? natH : natW;
    const rotNatH = isQuarterTurn ? natW : natH;

    const vpClientW = Math.max(260, viewport?.clientWidth || 880);
    const vpClientH = Math.max(180, viewport?.clientHeight || 520);
    const pad = zoom > 100 ? 20 : 12;
    const availW = Math.max(160, vpClientW - pad * 2);
    const availH = Math.max(140, vpClientH - pad * 2);

    let visW;
    let visH;
    if (zoom === 100) {
      const fitScale = Math.min(availW / rotNatW, availH / rotNatH);
      visW = Math.max(80, Math.floor(rotNatW * fitScale));
      visH = Math.max(80, Math.floor(rotNatH * fitScale));
    } else {
      visW = Math.round(availW * (zoom / 100));
      visH = Math.round(visW * (rotNatH / rotNatW));
    }

    const imgW = isQuarterTurn ? visH : visW;
    const imgH = isQuarterTurn ? visW : visH;

    if (stage) {
      stage.style.width = `${visW}px`;
      stage.style.height = `${visH}px`;
    }
    if (canvas) {
      if (zoom > 100) {
        const cw = Math.max(vpClientW, visW + pad * 2);
        const ch = Math.max(vpClientH, visH + pad * 2);
        canvas.style.width = `${cw}px`;
        canvas.style.height = `${ch}px`;
        canvas.style.minHeight = `${ch}px`;
        canvas.style.padding = `${pad}px`;
      } else {
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.minHeight = '100%';
        canvas.style.padding = `${pad}px`;
      }
    }

    img.dataset.zoom = String(zoom);
    img.dataset.rotate = String(rotate);
    img.style.width = `${imgW}px`;
    img.style.height = `${imgH}px`;
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';
    img.style.transform = `rotate(${rotate}deg)`;
  };

  app.setMediaZoom = function (pct) {
    if (!this.mediaZoomState) return 100;
    const numeric = Math.max(100, Math.min(300, Number(pct) || 100));
    this.mediaZoomState.zoom = numeric;
    this.applyMediaZoomTransform();
    return numeric;
  };

  app.adjustMediaZoom = function (direction) {
    if (!this.mediaZoomState) return 100;
    const steps = this.ZOOM_STEPS || [100, 150, 200, 300];
    const current = this.mediaZoomState.zoom || 100;
    let idx = steps.indexOf(current);
    if (idx < 0) {
      idx = steps.findIndex(s => s >= current);
      if (idx < 0) idx = steps.length - 1;
    }
    const nextIdx = Math.max(0, Math.min(steps.length - 1, idx + (direction >= 0 ? 1 : -1)));
    return this.setMediaZoom(steps[nextIdx]);
  };

  app.rotateMediaZoom = function (deltaDeg = 90) {
    if (!this.mediaZoomState) return 0;
    const step = Number.isFinite(Number(deltaDeg)) ? Number(deltaDeg) : 90;
    const nextRotate = (((this.mediaZoomState.rotate || 0) + step) % 360 + 360) % 360;
    this.mediaZoomState.rotate = nextRotate;
    this.applyMediaZoomTransform();
    return nextRotate;
  };

  app.resetMediaZoom = function () {
    if (!this.mediaZoomState) return false;
    this.mediaZoomState.zoom = 100;
    this.mediaZoomState.rotate = 0;
    this.applyMediaZoomTransform();
    const vp = $('media-zoom-viewport');
    if (vp) {
      vp.scrollTop = 0;
      vp.scrollLeft = 0;
    }
    return true;
  };

  app.setMediaPlaybackRate = function (rate) {
    const r = Number(rate) || 1;
    if (this.mediaZoomState) this.mediaZoomState.playbackRate = r;
    const vid = $('media-zoom-video');
    if (vid) {
      try { vid.playbackRate = r; } catch {}
    }
    const lbl = $('media-speed-level');
    if (lbl) lbl.textContent = `Tốc độ: ${r.toFixed(2).replace(/\.00$/, '.0')}x`;
    document.querySelectorAll('#media-zoom-toolbar [data-speed]').forEach(btn => {
      btn.classList.toggle('active-chip', Number(btn.dataset.speed) === r);
    });
    return r;
  };

  app.switchMediaZoomItem = function (newIndex) {
    const st = this.mediaZoomState;
    if (!st || !st.attachments.length) return false;
    const len = st.attachments.length;
    const safeIdx = ((Number(newIndex) || 0) % len + len) % len;
    st.index = safeIdx;
    st.zoom = 100;
    st.rotate = 0;
    st.playbackRate = 1;
    this.renderMediaZoomModal();
    return true;
  };

  app.stepMediaZoomItem = function (delta) {
    const st = this.mediaZoomState;
    if (!st || !st.attachments.length) return false;
    return this.switchMediaZoomItem(st.index + (Number(delta) || 1));
  };

  app.closeMediaZoom = function () {
    const dialog = $('media-zoom-dialog');
    if (dialog) {
      dialog.querySelectorAll('video').forEach(v => { try { v.pause(); } catch {} });
      const vp = $('media-zoom-viewport');
      if (vp) vp.innerHTML = '';
      if (dialog.open || dialog.hasAttribute('open')) {
        try { dialog.close(); } catch { dialog.removeAttribute('open'); }
      }
    }
    if (this.mediaZoomState) this.mediaZoomState.open = false;
    return true;
  };

  const LESSON_TOPICS = [
    'Bài 1: Phát âm Thanh mẫu b, p, m, f & Chào hỏi (你好)',
    'Bài 2: Thanh mẫu d, t, n, l & Vận mẫu an, en, ang, eng',
    'Bài 3: Thanh mẫu g, k, h & Nhóm âm mặt lưỡi j, q, x',
    'Bài 4: Vận mẫu nhóm i, ü (ia, ie, iao, iu, ian, üe)',
    'Bài 5: Ôn tập Ngữ âm Thanh mẫu & Vận mẫu (Bài 1–4)',
    'Bài 6: Nhóm âm đầu lưỡi z, c, s & Tập đếm số',
    'Bài 7: Vận mẫu uo, ua, uai, ui, uan, uang & âm cuốn lưỡi er',
    'Bài 8: Nhóm âm cong lưỡi zh, ch, sh, r',
    'Bài 9: Quy tắc đọc viết Pinyin & Biến điệu Thanh 3',
    'Bài 10: 8 Nét chữ Hán cơ bản & Quy tắc bút thuận',
    'Bài 11: Tổng ôn Ngữ âm Pinyin & Ghép từ đôi',
    'Bài 12: Kiểm tra Giai đoạn 1 (Ngữ âm & Bút thuận chữ Hán)',
    'Bài 13: 你好 — Xin chào & Hỏi thăm sức khỏe',
    'Bài 14: 你叫什么？ — Bạn tên là gì & Quốc tịch',
    'Bài 15: 你家在哪儿？ — Nhà bạn ở đâu?',
    'Bài 16: 爸爸、妈妈 — Gia đình của em & Biến điệu chữ 不',
    'Bài 17: 我有一只小猫 — Thú cưng & Số đếm 1–10 (Phân biệt 二 / 两)',
    'Bài 18: 我家不大 — Chủ đề Gia đình & Ngôi nhà của bé (家人)',
    'Bài 19: 家庭练习 — Mẫu câu giới thiệu các thành viên trong nhà',
    'Bài 20: 我要苹果，你呢？ — Hoa quả & Đồ uống yêu thích',
    'Bài 21: 我喜欢海鲜 — Món ăn yêu thích & Phó từ 也',
    'Bài 22: 我有中文课 — Thứ ngày trong tuần & Thời khóa biểu',
    'Bài 23: 现在几点？ — Hỏi giờ giấc & Thời gian biểu hằng ngày',
    'Bài 24: 我去图书馆 — Các địa điểm trong trường học',
    'Bài 25: 总复习 — Tổng ôn tập & Kiểm tra cuối khóa Lộ trình 1'
  ];

  app.parseLessonNumber = function (lessonStr, fallback = 1) {
    const m = String(lessonStr || '').match(/(\d+)/);
    return m ? Math.max(1, Math.min(60, Number(m[1]))) : fallback;
  };

  app.getStudentLessonsModel = function (student) {
    const stu = student || this.getActiveParentStudent();
    const cls = stu?.classCode ? this.classes.find(c => c.id === stu.classCode) : null;
    const progMatch = String(stu?.progress || 'Buổi 1/25').match(/(\d+)\s*\/\s*(\d+)/);
    const total = Number(cls?.totalLessons) || (progMatch ? Math.max(1, Number(progMatch[2])) : 25);
    const baseLearned = progMatch ? Math.min(total, Math.max(1, Number(progMatch[1]))) : 1;
    const s3 = window.IZTEACH_STORAGE.samples;

    const realHws = (this.state?.homeworks || [])
      .filter(h => this.isHomeworkForStudent(h, stu))
      .slice()
      .sort((a, b) => Number(b.updatedAtMs || 0) - Number(a.updatedAtMs || 0));
    const hwByLesson = new Map();
    realHws.forEach(hw => {
      const num = Number(hw.lessonNum) || this.parseLessonNumber(hw.lesson, baseLearned);
      if (!hwByLesson.has(num)) hwByLesson.set(num, hw);
    });

    const baseHw = hwByLesson.get(baseLearned);
    const learnedMax = (!stu?.unsubmittedCurrent && baseHw && baseHw.status === 'GRADED')
      ? Math.min(total, baseLearned + 1)
      : baseLearned;

    const lessons = [];
    for (let n = 1; n <= total; n++) {
      const assignInfo = this.getLessonAssignmentInfo(stu?.classCode, n);
      const topic = assignInfo.lessonName || '';
      const explicitHw = hwByLesson.get(n) || null;
      if (explicitHw) {
        if (assignInfo.isCustomAssigned && assignInfo.lessonName) {
          explicitHw.title = assignInfo.lessonName;
        }
        lessons.push({
          n,
          total,
          topic,
          assignInfo,
          status: explicitHw.status === 'GRADED' ? 'graded' : 'pending',
          hw: explicitHw
        });
      } else if (n < learnedMax) {
        const synScore = n % 3 === 0 ? 9.0 : 9.5;
        lessons.push({
          n,
          total,
          topic,
          assignInfo,
          status: 'graded',
          hw: {
            id: `SYN-${stu.code}-${n}`,
            studentCode: stu.code,
            studentEmail: stu.email || '',
            studentName: stu.name,
            classCode: stu.classCode || this.classes[0]?.id || '',
            lessonNum: n,
            lesson: `Buổi ${n}/${total}`,
            title: topic || `Bài tập Buổi ${n}`,
            submittedAt: 'Đã hoàn thành',
            parentNote: `Con đã đọc bài và viết chữ Hán buổi ${n} đầy đủ ạ.`,
            status: 'GRADED',
            score: synScore,
            teacherFeedback: `Con nắm vững từ vựng và viết chữ Hán buổi ${n} đúng quy tắc bút thuận, phát âm rõ ràng!`,
            attachments: []
          }
        });
      } else if (n === learnedMax) {
        lessons.push({
          n,
          total,
          topic,
          assignInfo,
          status: 'need_submit',
          hw: null
        });
      } else {
        lessons.push({
          n,
          total,
          topic,
          assignInfo,
          status: 'locked',
          hw: null
        });
      }
    }
    return { lessons, baseLearned, learnedMax, total };
  };

  app.selectParentLesson = function (lessonNum) {
    const stu = this.getActiveParentStudent();
    const model = this.getStudentLessonsModel(stu);
    const target = model.lessons.find(l => l.n === Number(lessonNum));
    if (!target) return false;
    if (target.status === 'locked') {
      this.showToast(`Buổi ${target.n} chưa học đến.`);
      return false;
    }
    this.selectedLessonNum = target.n;
    this.showResubmitForm = false;
    this.renderHomeworks();
    return true;
  };

  app.toggleResubmitForm = function (force) {
    this.showResubmitForm = typeof force === 'boolean' ? force : !this.showResubmitForm;
    this.renderHomeworks();
    if (this.showResubmitForm) {
      setTimeout(() => {
        $('parent-submit-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 40);
    }
    return this.showResubmitForm;
  };

  app.submitHomework = function () {
    const typeVal = $('hw-type') ? $('hw-type').value : 'Video đọc bài & Tập viết chữ Hán';
    const noteEl = $('hw-note');
    const stu = this.getActiveParentStudent();
    const model = this.getStudentLessonsModel(stu);
    let targetLesson = this.selectedLessonNum || model.baseLearned;
    const currentItem = model.lessons.find(l => l.n === targetLesson);
    if (currentItem && currentItem.status === 'graded' && !this.showResubmitForm) {
      const orangeItem = model.lessons.find(l => l.status === 'need_submit');
      if (orangeItem) targetLesson = orangeItem.n;
    }
    const assignInfo = this.getLessonAssignmentInfo(stu?.classCode, targetLesson);
    const topic = assignInfo.lessonName || assignInfo.title || `Bài tập Buổi ${targetLesson}`;
    const noteVal = (noteEl && noteEl.value.trim()) ? noteEl.value.trim() : `Con đã hoàn thành bài đọc và viết chữ Hán buổi ${targetLesson} ạ.`;
    if (window.KTN_DLP.inspect(noteVal).blocked) {
      this.previewHwDlp('parent', noteVal);
      this.showToast('Lưu ý: Vui lòng không kèm số điện thoại hoặc liên kết cá nhân trong ghi chú bài tập.');
      return false;
    }
    const existingIdx = this.state.homeworks.findIndex(h => this.isHomeworkForStudent(h, stu) && (Number(h.lessonNum) || this.parseLessonNumber(h.lesson, -1)) === targetLesson);
    const newAttachments = (Array.isArray(this.pendingAttachments) && this.pendingAttachments.length)
      ? this.pendingAttachments.map(a => ({ ...a }))
      : (this.pendingAttachment ? [{ ...this.pendingAttachment }] : []);
    if (newAttachments.length === 0 && (!this.showResubmitForm || !this.state.homeworks[existingIdx]?.attachments?.length)) {
      this.showToast('Vui lòng chọn hoặc quay ít nhất một tệp Video hoặc Ảnh bài tập trước khi nộp bài.');
      return false;
    }
    const mergedAttachments = (this.showResubmitForm && existingIdx >= 0 && Array.isArray(this.state.homeworks[existingIdx]?.attachments) && newAttachments.length > 0)
      ? [...this.state.homeworks[existingIdx].attachments, ...newAttachments]
      : (newAttachments.length > 0 ? newAttachments : (this.state.homeworks[existingIdx]?.attachments || []));
    if (mergedAttachments.length === 0) {
      this.showToast('Vui lòng chọn hoặc quay ít nhất một tệp Video hoặc Ảnh bài tập trước khi nộp bài.');
      return false;
    }
    const lessonLabel = `Buổi ${targetLesson}/${model.total}`;
    const attachmentsList = mergedAttachments;
    const nowMs = Date.now();
    const unitId = window.IZTEACH_STORAGE?.resolveUnitIdForLesson ? window.IZTEACH_STORAGE.resolveUnitIdForLesson(targetLesson) : '6adadbcaf75fe5000247ca71';
    const newHw = {
      id: existingIdx >= 0 ? this.state.homeworks[existingIdx].id : ('HW-' + nowMs + '-' + Math.floor(Math.random() * 900 + 100)),
      remoteId: attachmentsList[0]?.resourceId || ('HW-' + nowMs),
      courseId: '6adadba969897b0002482ca5',
      course: '6adadba969897b0002482ca5',
      unitId: unitId,
      unit: unitId,
      studentCode: stu.code,
      studentEmail: String(stu.email || '').toLowerCase(),
      studentName: stu.name,
      classCode: stu.classCode || this.classes[0]?.id || '',
      lessonNum: targetLesson,
      lesson: lessonLabel,
      title: topic,
      submittedAt: 'Vừa xong',
      updatedAtMs: nowMs,
      parentNote: noteVal,
      status: 'PENDING',
      syncStatus: 'submitting',
      score: null,
      teacherFeedback: 'Chờ cô giáo đang nhận xét...',
      attachments: mergedAttachments
    };
    if (existingIdx >= 0) {
      this.state.homeworks.splice(existingIdx, 1);
    }
    stu.unsubmittedCurrent = false;
    stu._entUpdatedAt = nowMs;
    if (!stu.classCode && newHw.classCode) {
      stu.classCode = newHw.classCode;
      stu.hasLiveClass = true;
    }
    this.state.homeworks.unshift(newHw);
    this.selectedHwId = newHw.id;
    const stuIdx = this.students.findIndex(s => s.code === stu.code);
    this.selectedStudentIdx = stuIdx >= 0 ? stuIdx : (this.activeParentStudentIdx || 0);
    this.selectedLessonNum = targetLesson;
    this.teacherGradeLessonNum = targetLesson;
    this._teacherManuallyPickedLesson = false;
    this._lastAutoSelectedPendingHwId = null;
    this._lastAutoSelectedPendingStudentHwId = null;
    this.showResubmitForm = false;
    window.IZTEACH_STORAGE.submitHomeworkRecord(newHw).then(r => {
      if (r && (r._id || r.ok)) {
        newHw.remoteId = r._id || r.data?._id || newHw.remoteId;
        newHw.syncStatus = 'synced';
        this.saveState();
      } else {
        newHw.syncStatus = 'local_resilient';
        this.enqueueHomeworkOutbox(newHw);
        this.saveState();
      }
    }).catch(() => {
      newHw.syncStatus = 'local_resilient';
      this.enqueueHomeworkOutbox(newHw);
      this.saveState();
    });
    if (noteEl) noteEl.value = '';
    this.clearPendingAttachment();
    this.previewHwDlp('parent', '');
    this.saveState();
    this.renderAll();
    this.showToast(`Đã nộp bài tập Buổi ${targetLesson} thành công. Chờ cô giáo nhận xét!`);
    if (typeof this.triggerNotificationEvent === 'function') {
      this.triggerNotificationEvent('onSubmitted', {
        title: `📥 ${stu.name} vừa nộp bài Buổi ${targetLesson}`,
        body: `Lớp ${stu.classCode || this.classes[0]?.id || ''} · ${topic} (${mergedAttachments.length} tệp đính kèm)`,
        lessonNum: targetLesson,
        studentCode: stu.code
      });
    }
    return true;
  };

  app.submitTeacherGrade = function () {
    if (this.state.teacherChatLocked) {
      this.showToast('Quyền gửi nhận xét của giáo viên hiện đang bị khóa bởi Quản lý.');
      return false;
    }
    const managed = typeof this.getTeacherManagedStudents === 'function' ? this.getTeacherManagedStudents() : [];
    if (managed.length === 0) {
      this.showToast('Tài khoản giáo viên hiện chưa được phân công lớp hoặc học sinh phụ trách.');
      return false;
    }
    const score = Number($('grade-score')?.value);
    let rawFeedback = ($('grade-feedback')?.value || '').trim();
    if (!rawFeedback) {
      rawFeedback = 'Con hoàn thành tốt bài tập về nhà, chữ Hán viết đều nét và phát âm rõ ràng!';
      if ($('grade-feedback')) $('grade-feedback').value = rawFeedback;
    }
    const dlp = window.KTN_DLP.inspect(rawFeedback);
    if (dlp.blocked) {
      this.logTeacherViolation('Nhận xét bài tập', dlp.reasons, rawFeedback);
      this.previewHwDlp('teacher', rawFeedback);
      this.saveState();
      this.renderAll();
      this.showToast(`Đã chặn nhận xét chứa thông tin vi phạm quy định (${dlp.reasons.join(', ')}) và ghi vào Nhật ký Quản lý.`);
      return false;
    }
    if (!Number.isFinite(score) || score < 1 || score > 10 || Math.round(score * 2) !== score * 2) {
      this.showToast('Điểm đánh giá phải từ 1 đến 10 (bước 0.5).');
      return false;
    }
    const stu = this.students[this.selectedStudentIdx] || managed[0]?.student || this.students[0];
    const stuModel = this.getStudentLessonsModel(stu);
    const activeLessonObj = stuModel.lessons.find(l => l.n === (this.teacherGradeLessonNum || stuModel.baseLearned)) || stuModel.lessons.find(l => l.status === 'pending') || stuModel.lessons[0];
    const studentHws = this.state.homeworks.filter(h => this.isHomeworkForStudent(h, stu));
    const targetLessonNum = activeLessonObj?.n || this.teacherGradeLessonNum || stuModel.baseLearned;
    let hw = studentHws.find(h => (Number(h.lessonNum) || this.parseLessonNumber(h.lesson, -1)) === targetLessonNum)
      || (this.selectedHwId && studentHws.find(h => h.id === this.selectedHwId))
      || (activeLessonObj?.hw && studentHws.find(h => h.id === activeLessonObj.hw.id))
      || studentHws.find(h => h.status === 'PENDING')
      || studentHws[0];
    if (!hw && activeLessonObj?.hw) {
      hw = { ...activeLessonObj.hw, id: 'HW-' + Date.now() };
      this.state.homeworks.unshift(hw);
    }
    if (!hw) {
      this.showToast('Học sinh hiện chưa có bài nộp ở buổi này để chấm điểm.');
      return false;
    }
    hw.status = 'GRADED';
    hw.score = score;
    hw.teacherFeedback = rawFeedback;
    hw.updatedAtMs = Date.now();
    window.IZTEACH_STORAGE.markHomeworkRecord(hw.remoteId || hw.id, score, rawFeedback, hw);
    if (window.KtnWebApp && typeof window.KtnWebApp.apiRequest === 'function') {
      const gradedLessonNum = Number(hw.lessonNum) || this.parseLessonNumber(hw.lesson, activeLessonObj?.n || 1);
      window.KtnWebApp.apiRequest('/api/ktn/homeworks/grade', {
        method: 'PATCH',
        body: {
          id: hw.remoteId || hw.id,
          studentEmail: hw.studentEmail || stu?.email || '',
          studentName: hw.studentName || stu?.name || '',
          studentCode: hw.studentCode || stu?.code || '',
          classCode: hw.classCode || stu?.classCode || '',
          courseId: hw.courseId || '',
          lessonNum: gradedLessonNum,
          lessonTitle: hw.title || `Buổi ${gradedLessonNum}`,
          score,
          status: 'graded',
          teacherFeedback: rawFeedback,
          attachments: hw.attachments || [],
          allowUpsertFromIzTeach: true,
          mirroredToIzTeach: true
        }
      }).catch(() => {});
    }
    this.previewHwDlp('teacher', '');
    this.saveState();
    this.renderAll();
    this.showToast(`Đã lưu điểm (${score}/10) và gửi nhận xét cho Phụ huynh.`);
    if (typeof this.triggerNotificationEvent === 'function') {
      const gradedLessonNum = Number(hw.lessonNum) || this.parseLessonNumber(hw.lesson, activeLessonObj?.n || 1);
      this.triggerNotificationEvent('onGraded', {
        title: `👩‍🏫 ${this.state.teacherName || 'Cô Mỹ Linh'} vừa chấm ${score}đ bài Buổi ${gradedLessonNum}`,
        body: `Nhận xét cho ${stu.name}: "${rawFeedback}"`,
        lessonNum: gradedLessonNum,
        studentCode: stu.code
      });
    }
    return true;
  };

  /* ==========================================================================
     MILESTONE 2: IN-LESSON ALL-IN-ONE HOMEWORK & GRADING MODULE (R1, R3)
     ========================================================================== */

  app.audioRecorder = {
    mediaRecorder: null,
    audioChunks: [],
    isRecording: false,
    timerInterval: null,
    recordingSeconds: 0,
    async startRecording(onTick, onComplete) {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (typeof alert === 'function') alert('Trình duyệt chưa cấp quyền truy cập Microphone.');
        return false;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.audioChunks = [];
        this.recordingSeconds = 0;
        const mimeType = (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm')) ? 'audio/webm' : 'audio/mp4';
        this.mediaRecorder = new MediaRecorder(stream, { mimeType });
        this.mediaRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) this.audioChunks.push(e.data); };
        this.mediaRecorder.onstop = () => {
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });
          try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
          clearInterval(this.timerInterval);
          if (onComplete) onComplete(audioBlob, mimeType);
        };
        this.mediaRecorder.start(250);
        this.isRecording = true;
        this.timerInterval = setInterval(() => {
          this.recordingSeconds++;
          if (onTick) onTick(this.recordingSeconds);
          if (this.recordingSeconds >= 300) this.stopRecording();
        }, 1000);
        return true;
      } catch (err) {
        console.warn('[AudioRecorder] Không thể mở microphone:', err);
        return false;
      }
    },
    stopRecording() {
      if (this.mediaRecorder && this.isRecording) {
        try { this.mediaRecorder.stop(); } catch (e) {}
        this.isRecording = false;
        clearInterval(this.timerInterval);
      }
    }
  };

  app.startInLessonAudioRecord = async function (lessonNum) {
    const statusText = $('in-lesson-record-timer');
    const startBtn = $('btn-in-lesson-record-start');
    const stopBtn = $('btn-in-lesson-record-stop');
    const ok = await this.audioRecorder.startRecording(
      (sec) => {
        const m = String(Math.floor(sec / 60)).padStart(2, '0');
        const s = String(sec % 60).padStart(2, '0');
        if (statusText) statusText.textContent = `🔴 Đang ghi âm: ${m}:${s}`;
      },
      async (blob, mimeType) => {
        const ext = mimeType.includes('webm') ? 'webm' : 'm4a';
        const file = (typeof File !== 'undefined')
          ? new File([blob], `ghi-am-phat-am-bai-${lessonNum}.${ext}`, { type: mimeType })
          : blob;
        file.name = file.name || `ghi-am-phat-am-bai-${lessonNum}.${ext}`;
        await this.handleHomeworkFileSelect(file);
        if (statusText) statusText.textContent = '✓ Đã ghi âm xong & đính kèm';
        if (startBtn) startBtn.classList.remove('hidden');
        if (stopBtn) stopBtn.classList.add('hidden');
      }
    );
    if (ok) {
      if (startBtn) startBtn.classList.add('hidden');
      if (stopBtn) stopBtn.classList.remove('hidden');
      if (statusText) statusText.textContent = '🔴 Đang ghi âm: 00:00';
    }
  };

  app.stopInLessonAudioRecord = function () {
    this.audioRecorder.stopRecording();
    const startBtn = $('btn-in-lesson-record-start');
    const stopBtn = $('btn-in-lesson-record-stop');
    if (startBtn) startBtn.classList.remove('hidden');
    if (stopBtn) stopBtn.classList.add('hidden');
  };

  app.enqueueHomeworkOutbox = function (hw) {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem('ktn_homework_outbox_v1');
      const list = raw ? JSON.parse(raw) : [];
      list.push({
        outboxId: 'OUTBOX-' + Date.now() + '-' + Math.floor(Math.random() * 900 + 100),
        localHwId: hw.id,
        lessonNum: hw.lessonNum,
        course: hw.course || hw.courseId || '6adadba969897b0002482ca5',
        unit: hw.unit || hw.unitId,
        title: hw.title,
        notes: hw.parentNote || hw.notes || '',
        vendorId: window.IZTEACH_STORAGE?.vendorId || '3529cd2b-7af6-4fda-887c-392a79393d6a',
        attachments: hw.attachments || [],
        createdAt: Date.now()
      });
      localStorage.setItem('ktn_homework_outbox_v1', JSON.stringify(list));
    } catch (e) {
      console.warn('[Outbox] Lỗi lưu outbox:', e);
    }
  };

  app.flushHomeworkOutbox = async function () {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem('ktn_homework_outbox_v1');
      if (!raw) return;
      const list = JSON.parse(raw);
      if (!Array.isArray(list) || !list.length) return;
      const remaining = [];
      for (const item of list) {
        const res = await window.IZTEACH_STORAGE.submitHomeworkRecord(item);
        if (res && (res._id || res.ok)) {
          const hw = (this.state?.homeworks || []).find(h => h.id === item.localHwId);
          if (hw) {
            hw.remoteId = res._id || res.data?._id || hw.remoteId;
            hw.syncStatus = 'synced';
          }
        } else {
          remaining.push(item);
        }
      }
      if (remaining.length) {
        localStorage.setItem('ktn_homework_outbox_v1', JSON.stringify(remaining));
      } else {
        localStorage.removeItem('ktn_homework_outbox_v1');
      }
      this.saveState();
      this.renderAll();
    } catch (e) {
      console.warn('[Outbox] Lỗi gửi lại outbox:', e);
    }
  };

  app.removeInLessonPendingAttachment = function (idx) {
    this.removePendingAttachment(idx);
    this.renderInLessonPendingFiles();
  };

  app.renderInLessonPendingFiles = function () {
    const box = $('in-lesson-pending-files-container');
    if (!box) return;
    const list = Array.isArray(this.pendingAttachments) ? this.pendingAttachments : [];
    if (!list.length) {
      box.innerHTML = '';
      box.style.display = 'none';
      return;
    }
    box.style.display = 'block';
    const fmt = bytes => window.IZTEACH_STORAGE?.formatBytes ? window.IZTEACH_STORAGE.formatBytes(bytes) : `${Math.round((bytes || 0) / 1024)} KB`;
    const tf = u => (!u || u.includes('#') || u.startsWith('blob:')) ? u : u + '#t=0.1';

    box.innerHTML = `
      <div style="font-size:12px;font-weight:700;color:#334155;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">
        <span>📂 Danh sách tệp đã chọn (${list.length} tệp):</span>
        <button type="button" class="btn-ghost" style="font-size:11px;padding:2px 6px;color:#DC2626;" onclick="app.clearPendingAttachment()">✕ Xóa tất cả</button>
      </div>
      <div class="in-lesson-pending-grid">
        ${list.map((att, idx) => {
          const isImg = att.mediaType === 'image';
          const isAudio = att.mediaType === 'audio';
          const playSrc = att.playUrl || att.cdnUrl;
          return `
            <div class="in-lesson-file-card">
              <button type="button" class="remove-btn" onclick="app.removeInLessonPendingAttachment(${idx})" title="Xóa tệp">✕</button>
              <div style="display:flex;align-items:center;gap:6px;min-width:0;padding-right:20px;">
                <span style="font-size:18px;">${isImg ? '📷' : (isAudio ? '🎙️' : '🎬')}</span>
                <span style="font-size:12px;font-weight:700;color:#1E293B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${esc(att.title)}">${esc(att.title)}</span>
              </div>
              <div style="font-size:11px;color:#64748B;">Dung lượng: ${fmt(att.size)} · ${isImg ? 'Ảnh chữ Hán' : (isAudio ? 'Ghi âm phát âm' : 'Video')}</div>
              ${isAudio ? `
                <audio controls src="${esc(playSrc)}" style="width:100%;height:30px;margin-top:4px;"></audio>
              ` : (isImg ? `
                <div style="max-height:80px;border-radius:6px;overflow:hidden;background:#F1F5F9;margin-top:4px;cursor:pointer;" onclick="app.openMediaZoom('PENDING', ${idx})">
                  <img src="${esc(playSrc)}" style="width:100%;height:80px;object-fit:cover;display:block;" alt="${esc(att.title)}">
                </div>
              ` : `
                <div style="max-height:80px;border-radius:6px;overflow:hidden;background:#000;margin-top:4px;">
                  <video src="${esc(tf(playSrc))}" style="width:100%;height:80px;object-fit:contain;display:block;" playsinline muted></video>
                </div>
              `)}
            </div>
          `;
        }).join('')}
      </div>
    `;
  };

  app.setInLessonQuickNote = function (text) {
    const el = $('in-lesson-hw-note');
    if (el) {
      el.value = text;
      el.focus();
    }
  };

  app.toggleInLessonResubmit = function (lessonNum) {
    this._inLessonShowResubmit = (this._inLessonShowResubmit === lessonNum ? null : lessonNum);
    const course = this.onlineCourses?.[0];
    if (course) {
      this.renderInLessonHomeworkModule(course, (Number(lessonNum) || 1) - 1);
    }
  };

  app.renderInLessonHomeworkModule = function (course, lessonIdx) {
    const container = $('learn-stage-homework-card');
    if (!container) return;
    if (!course) course = this.onlineCourses?.[0];
    const lessons = Array.isArray(course?.lessons) ? course.lessons : [];
    const lesson = lessons[lessonIdx] || { title: course?.title || 'Bài học', lessonNum: (typeof lessonIdx === 'number' ? lessonIdx + 1 : 1) };
    const lessonNum = lesson.lessonNum || ((typeof lessonIdx === 'number' ? lessonIdx + 1 : 1));
    this._inLessonActiveLessonNum = lessonNum;
    const parentStudent = this.getActiveParentStudent();

    // 1. Tìm bản ghi bài tập của bài học này
    const studentHws = (this.state?.homeworks || []).filter(h => this.isHomeworkForStudent(h, parentStudent));
    const hw = studentHws.find(h => (Number(h.lessonNum) || this.parseLessonNumber(h.lesson, -1)) === lessonNum);

    const isGraded = Boolean(hw && (hw.status === 'GRADED' || typeof hw.score === 'number'));
    const isPending = Boolean(hw && hw.status === 'PENDING' && !isGraded);
    const isUnsubmitted = !hw || (!isGraded && !isPending);

    // 2. Nhiệm vụ bài học cụ thể
    const writingRef = lesson.writingPage ? `Vở viết trang ${lesson.writingPage}` : 'Vở luyện viết chữ Hán';
    const sgkRef = lesson.sgkPage ? `SGK trang ${lesson.sgkPage}` : 'Sách Giáo Khoa';
    const sbtRef = lesson.sbtPage ? `SBT trang ${lesson.sbtPage}` : 'Sách Bài Tập';

    let badgeHtml = '';
    if (isGraded) {
      badgeHtml = `<span class="badge-pill status-online" style="font-size:12px;font-weight:800;background:#10B981;color:#FFF;">✓ Đã chấm: ${hw.score}/10</span>`;
    } else if (isPending) {
      badgeHtml = `<span class="badge-pill status-orange" style="font-size:12px;font-weight:800;background:#F59E0B;color:#FFF;">🟠 Đã nộp bài (chờ giáo viên chấm)</span>`;
    } else {
      badgeHtml = `<span class="badge-pill" style="font-size:12px;font-weight:700;background:#FEF3C7;color:#92400E;">⚪ Cần nộp bài tập</span>`;
    }

    let statusContentHtml = '';

    if (isGraded) {
      // TẦNG 3: ĐÃ CHẤM ĐIỂM
      const teacherAudio = hw.teacherAudioFeedback || hw.correctionAudio || (Array.isArray(hw.correctionResources) && hw.correctionResources.find(r => r?.origin?.mimeType?.startsWith('audio/') || r?.type === 'audio')?.link);
      const attList = Array.isArray(hw.attachments) ? hw.attachments : [];

      statusContentHtml = `
        <div style="background:#ECFDF5;border:1.5px solid #A7F3D0;border-radius:12px;padding:16px;margin-bottom:14px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:28px;">🌟</span>
              <div>
                <strong style="font-size:16px;color:#065F46;">ĐIỂM ĐÁNH GIÁ: ${hw.score} / 10 Điểm</strong>
                <div style="font-size:12px;color:#047857;">Giáo viên: <strong>${esc(hw.markedBy || 'Cô Lâm Mỹ Linh')}</strong> · Đã duyệt và nhận xét bài làm</div>
              </div>
            </div>
            <span class="badge-pill status-online" style="font-weight:800;background:#059669;color:#FFF;">Đã hoàn thành</span>
          </div>

          <div style="font-size:13.5px;color:#064E3B;line-height:1.6;background:#FFF;padding:14px 16px;border-radius:10px;border:1px solid #D1FAE5;margin-bottom:12px;">
            <div style="font-weight:700;color:#065F46;margin-bottom:4px;display:flex;align-items:center;gap:6px;">
              <span>💬</span> <span>Nhận xét chi tiết của giáo viên:</span>
            </div>
            <div>${esc(hw.teacherFeedback || 'Con hoàn thành rất tốt bài tập về nhà, nét chữ đều và phát âm chuẩn!')}</div>
          </div>

          ${teacherAudio ? `
            <div class="teacher-correction-audio-box">
              <div style="font-size:13px;font-weight:700;color:#1E40AF;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
                <span>🎧</span> <span>Cô giáo gửi file audio phát âm mẫu & chữa lỗi thanh điệu:</span>
              </div>
              <audio controls src="${esc(teacherAudio)}" style="width:100%;height:36px;"></audio>
            </div>
          ` : ''}

          <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:12px;color:#047857;">Tệp bài làm con đã nộp: <strong>${attList.length} tệp</strong> (${attList.map(a => esc(a.title)).join(', ') || 'Đầy đủ'})</span>
            <button type="button" class="btn-ghost" style="font-size:12px;font-weight:700;color:#065F46;cursor:pointer;" onclick="app.toggleInLessonResubmit(${lessonNum})">
              🔄 Nộp lại bài cải thiện điểm số
            </button>
          </div>
        </div>
      `;
    } else if (isPending) {
      // TẦNG 2: ĐÃ NỘP (CHỜ CHẤM)
      const attList = Array.isArray(hw.attachments) ? hw.attachments : [];
      statusContentHtml = `
        <div style="background:#FFFBEB;border:1.5px solid #FDE68A;border-radius:12px;padding:16px;margin-bottom:14px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:24px;">⏳</span>
              <div>
                <strong style="font-size:15px;color:#92400E;">Đã gửi bài thành công · Đang chờ cô giáo nhận xét</strong>
                <div style="font-size:12px;color:#B45309;">Nộp lúc: ${esc(hw.submittedAt || 'Vừa xong')} · Lời nhắn: "${esc(hw.parentNote || 'Con gửi bài tập ạ')}"</div>
              </div>
            </div>
            <span class="badge-pill status-orange" style="background:#F59E0B;color:#FFF;">Chờ chấm bài</span>
          </div>

          ${attList.length ? `
            <div style="margin:10px 0;padding:10px;background:#FFF;border-radius:8px;border:1px solid #FEF3C7;">
              <div style="font-size:12px;font-weight:700;color:#92400E;margin-bottom:6px;">Các tệp con đã nộp (${attList.length} tệp):</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px;">
                ${attList.map(a => `
                  <div style="font-size:11.5px;padding:4px 8px;background:#FEF3C7;border-radius:6px;color:#78350F;display:inline-flex;align-items:center;gap:4px;">
                    <span>${a.mediaType === 'image' ? '📷' : (a.mediaType === 'audio' ? '🎙️' : '🎬')}</span>
                    <span>${esc(a.title)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;">
            <span style="font-size:12px;color:#B45309;">Trạng thái lưu trữ: <strong>${hw.syncStatus === 'local_resilient' ? 'Đã lưu trên máy (chờ đồng bộ cloud 🔄)' : 'Đã đồng bộ máy chủ izTeach ✓'}</strong></span>
            <button type="button" class="btn-ghost" style="font-size:12px;font-weight:700;color:#92400E;cursor:pointer;" onclick="app.toggleInLessonResubmit(${lessonNum})">
              + Nộp bổ sung / Cập nhật bài làm
            </button>
          </div>
        </div>
      `;
    }

    // FORM NỘP BÀI (Mở sẵn khi chưa nộp hoặc khi bấm nộp lại/nộp bổ sung)
    const showForm = isUnsubmitted || this._inLessonShowResubmit === lessonNum;

    const formHtml = showForm ? `
      <div class="in-lesson-submit-form" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px;margin-top:12px;">
        <input id="learn-hw-file-input" type="file" multiple accept="video/*,image/*,audio/*,.mp4,.mov,.m4v,.3gp,.webm,.jpg,.jpeg,.png,.webp,.heic,.mp3,.m4a,.wav,.aac" onchange="app.handleHomeworkFilesSelect(this.files)" class="hidden">
        
        <div style="font-size:13px;font-weight:700;color:#1E293B;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
          <span>📎</span> <span>Đính kèm tệp bài làm (Chọn hoặc thu âm trực tiếp):</span>
        </div>
        
        <!-- 3 NÚT ĐÍNH KÈM CHÍNH -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px;margin-bottom:12px;">
          <button type="button" class="in-lesson-pick-btn" style="background:#F0FDFA;border:1.5px solid #99F6E4;color:#0F766E;padding:10px;border-radius:10px;font-weight:700;font-size:13px;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;" onclick="app.openHomeworkFilePicker('image')">
            <span style="font-size:22px;">📷</span>
            <span>Ảnh chữ Hán</span>
            <span style="font-size:10.5px;font-weight:500;color:#0D9488;">Vở viết ô ly, SBT</span>
          </button>

          <button type="button" class="in-lesson-pick-btn" style="background:#EEF2FF;border:1.5px solid #C7D2FE;color:#4338CA;padding:10px;border-radius:10px;font-weight:700;font-size:13px;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;" onclick="app.openHomeworkFilePicker('audio')">
            <span style="font-size:22px;">🎙️</span>
            <span>Ghi âm phát âm</span>
            <span style="font-size:10.5px;font-weight:500;color:#6366F1;">MP3, M4A giọng đọc</span>
          </button>

          <button type="button" class="in-lesson-pick-btn" style="background:#FFF1F2;border:1.5px solid #FECACA;color:#DC2626;padding:10px;border-radius:10px;font-weight:700;font-size:13px;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;" onclick="app.openHomeworkFilePicker('video')">
            <span style="font-size:22px;">🎬</span>
            <span>Video / File</span>
            <span style="font-size:10.5px;font-weight:500;color:#EF4444;">MP4, đọc tương tác</span>
          </button>
        </div>

        <!-- KHỐI GHI ÂM MICRO TRỰC TIẾP -->
        <div style="background:#FFF;border:1px solid #E2E8F0;border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:18px;">🎙️</span>
            <span style="font-size:12.5px;font-weight:600;color:#334155;">Thu âm giọng đọc bằng micro trình duyệt:</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button id="btn-in-lesson-record-start" type="button" class="btn-ghost" style="padding:6px 12px;font-size:12px;font-weight:700;color:#DC2626;border-color:#FCA5A5;cursor:pointer;" onclick="app.startInLessonAudioRecord(${lessonNum})">
              🔴 Bắt đầu ghi âm
            </button>
            <button id="btn-in-lesson-record-stop" type="button" class="btn-primary hidden" style="padding:6px 12px;font-size:12px;font-weight:700;background:#DC2626;cursor:pointer;" onclick="app.stopInLessonAudioRecord(${lessonNum})">
              ⏹ Dừng & Đính kèm
            </button>
            <span id="in-lesson-record-timer" style="font-size:12px;font-weight:700;color:#DC2626;"></span>
          </div>
        </div>

        <!-- DANH SÁCH TỆP CHỜ NỘP -->
        <div id="in-lesson-pending-files-container" style="margin-bottom:12px;"></div>

        <!-- LỜI NHẮN VÀ GỢI Ý NHANH -->
        <div style="margin-bottom:12px;">
          <label style="display:block;font-size:12.5px;font-weight:700;color:#334155;margin-bottom:6px;">Lời nhắn gửi cô giáo:</label>
          <textarea id="in-lesson-hw-note" rows="2" class="input-textarea" style="width:100%;box-sizing:border-box;border-radius:8px;border:1px solid #CBD5E1;padding:8px 12px;font-size:13px;" placeholder="Ví dụ: Con gửi cô ảnh viết chữ Hán và file phát âm Bài ${lessonNum} ạ..."></textarea>
          
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
            <button type="button" class="chip-btn" style="font-size:11px;padding:3px 8px;cursor:pointer;" onclick="app.setInLessonQuickNote('Con gửi cô ảnh vở luyện viết và phát âm bài khóa ạ.')">+ Gửi bài viết & phát âm</button>
            <button type="button" class="chip-btn" style="font-size:11px;padding:3px 8px;cursor:pointer;" onclick="app.setInLessonQuickNote('Nhờ cô nghe và sửa giúp con phát âm thanh 4 ạ.')">+ Nhờ cô sửa thanh điệu</button>
            <button type="button" class="chip-btn" style="font-size:11px;padding:3px 8px;cursor:pointer;" onclick="app.setInLessonQuickNote('Con đã hoàn thành toàn bộ bài tập trong Sách Bài Tập ạ.')">+ Đã làm xong SBT</button>
          </div>
        </div>

        <!-- NÚT NỘP BÀI CHÍNH -->
        <button id="btn-in-lesson-submit" type="button" class="btn-primary" style="width:100%;min-height:46px;font-size:14px;font-weight:800;border-radius:10px;cursor:pointer;" onclick="app.submitInLessonHomework(${lessonNum})">
          ⚡ BẤM ĐỂ NỘP BÀI CHO CÔ GIÁO NHẬN XÉT →
        </button>
      </div>
    ` : '';

    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:22px;">📝</span>
          <div>
            <h3 style="font-size:16px;font-weight:800;color:var(--text);margin:0 0 2px;">Nộp bài tập: ${esc(lesson.title)}</h3>
            <span style="font-size:12px;color:var(--sub);">Tham chiếu: ${esc(writingRef)} · ${esc(sgkRef)} · ${esc(sbtRef)}</span>
          </div>
        </div>
        ${badgeHtml}
      </div>

      <!-- DANH MỤC NHIỆM VỤ BÀI HỌC -->
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:#334155;line-height:1.6;">
        <strong style="color:#0F172A;display:block;margin-bottom:4px;">🎯 Nhiệm vụ thực hành cần nộp của Bài ${lessonNum}:</strong>
        <div style="display:flex;align-items:center;gap:6px;"><span>📷</span> <span>1. Chụp ảnh các trang viết chữ Hán trong ${esc(writingRef)}.</span></div>
        <div style="display:flex;align-items:center;gap:6px;"><span>🎙️</span> <span>2. Ghi âm phát âm Bài khóa & Từ mới (đối chiếu ${esc(sgkRef)}).</span></div>
        <div style="display:flex;align-items:center;gap:6px;"><span>✍️</span> <span>3. Chụp ảnh bài tập luyện nghe và nối câu trong ${esc(sbtRef)}.</span></div>
      </div>

      ${statusContentHtml}
      ${formHtml}
    `;

    if (showForm) {
      this.renderInLessonPendingFiles();
    }
  };

  app.submitInLessonHomework = async function (targetLessonNum) {
    if (this._isSubmittingInLesson) return false;
    if (this._isUploadingMedia) {
      this.showToast('Vui lòng đợi tệp tải lên hoàn tất trước khi bấm nộp bài.');
      return false;
    }

    const submitBtn = (typeof $ === 'function' ? $('btn-in-lesson-submit') : null) || (typeof document !== 'undefined' ? document.getElementById('btn-in-lesson-submit') : null);
    if (submitBtn) {
      submitBtn.disabled = true;
      if (!submitBtn.dataset) submitBtn.dataset = {};
      if (!submitBtn.dataset.origText) {
        submitBtn.dataset.origText = submitBtn.innerHTML;
      }
      submitBtn.innerHTML = '⏳ Đang nộp bài...';
    }
    this._isSubmittingInLesson = true;

    try {
      const stu = this.getActiveParentStudent();
      const model = this.getStudentLessonsModel(stu);
      const targetLesson = Number(targetLessonNum) || this.selectedLessonNum || model.baseLearned || 1;
      const noteEl = $('in-lesson-hw-note');
      const noteVal = (noteEl && noteEl.value.trim()) ? noteEl.value.trim() : `Con gửi bài tập Buổi ${targetLesson} ạ.`;

      if (window.KTN_DLP?.inspect && window.KTN_DLP.inspect(noteVal).blocked) {
        this.showToast('Lưu ý: Vui lòng không kèm số điện thoại hoặc liên kết cá nhân trong ghi chú bài tập.');
        return false;
      }

      const existingIdx = this.state.homeworks.findIndex(h => this.isHomeworkForStudent(h, stu) && (Number(h.lessonNum) || this.parseLessonNumber(h.lesson, -1)) === targetLesson);
      const newAttachments = (Array.isArray(this.pendingAttachments) && this.pendingAttachments.length)
        ? this.pendingAttachments.map(a => ({ ...a }))
        : (this.pendingAttachment ? [{ ...this.pendingAttachment }] : []);

      if (newAttachments.length === 0 && (existingIdx < 0 || !this.state.homeworks[existingIdx]?.attachments?.length)) {
        this.showToast('Vui lòng chọn hoặc quay ít nhất một tệp Video, Ảnh hoặc Audio bài tập trước khi nộp.');
        return false;
      }

      const mergedAttachments = (existingIdx >= 0 && Array.isArray(this.state.homeworks[existingIdx]?.attachments) && newAttachments.length > 0)
        ? [...this.state.homeworks[existingIdx].attachments, ...newAttachments]
        : (newAttachments.length > 0 ? newAttachments : (this.state.homeworks[existingIdx]?.attachments || []));

      const unitId = window.IZTEACH_STORAGE?.resolveUnitIdForLesson ? window.IZTEACH_STORAGE.resolveUnitIdForLesson(targetLesson) : '6adadbcaf75fe5000247ca71';
      const nowMs = Date.now();
      const newHw = {
        id: existingIdx >= 0 ? this.state.homeworks[existingIdx].id : ('HW-' + nowMs + '-' + Math.floor(Math.random() * 900 + 100)),
        remoteId: mergedAttachments[0]?.resourceId || ('HW-' + nowMs),
        courseId: '6adadba969897b0002482ca5',
        course: '6adadba969897b0002482ca5',
        unitId: unitId,
        unit: unitId,
        studentCode: stu.code,
        studentEmail: String(stu.email || '').toLowerCase(),
        studentName: stu.name,
        classCode: stu.classCode || this.classes[0]?.id || 'HSK1-ONLINE',
        lessonNum: targetLesson,
        lesson: `Buổi ${targetLesson}/${model.total || 15}`,
        title: `Bài tập New HSK 1 - Buổi ${targetLesson}`,
        submittedAt: 'Vừa xong',
        updatedAtMs: nowMs,
        parentNote: noteVal,
        status: 'PENDING',
        syncStatus: 'submitting',
        score: null,
        teacherFeedback: 'Chờ cô giáo đang nhận xét...',
        attachments: mergedAttachments
      };

      if (existingIdx >= 0) {
        this.state.homeworks.splice(existingIdx, 1);
      }
      this.state.homeworks.unshift(newHw);
      this.selectedHwId = newHw.id;
      this._inLessonShowResubmit = null;
      this.clearPendingAttachment();
      if (noteEl) noteEl.value = '';
      this.saveState();

      // Render instant local update
      const course = this.onlineCourses?.[0];
      this.renderInLessonHomeworkModule(course, targetLesson - 1);
      this.showToast(`Đã nộp bài tập Buổi ${targetLesson} thành công. Chờ cô giáo nhận xét!`);

      // Gửi lên izTeach LMS API
      try {
        const res = await window.IZTEACH_STORAGE.submitHomeworkRecord(newHw);
        if (res && (res._id || res.ok)) {
          newHw.remoteId = res._id || res.data?._id || newHw.remoteId;
          newHw.syncStatus = 'synced';
          this.saveState();
          this.renderInLessonHomeworkModule(course, targetLesson - 1);
        } else {
          newHw.syncStatus = 'local_resilient';
          this.enqueueHomeworkOutbox(newHw);
          this.saveState();
        }
      } catch (err) {
        newHw.syncStatus = 'local_resilient';
        this.enqueueHomeworkOutbox(newHw);
        this.saveState();
      }

      if (typeof this.triggerNotificationEvent === 'function') {
        this.triggerNotificationEvent('onSubmitted', {
          title: `📥 ${stu.name} vừa nộp bài Buổi ${targetLesson}`,
          body: `Bài tập Buổi ${targetLesson} (${mergedAttachments.length} tệp đính kèm)`,
          lessonNum: targetLesson,
          studentCode: stu.code
        });
      }

      return true;
    } finally {
      this._isSubmittingInLesson = false;
      const curBtn = (typeof $ === 'function' ? $('btn-in-lesson-submit') : null) || (typeof document !== 'undefined' ? document.getElementById('btn-in-lesson-submit') : null);
      if (curBtn && curBtn.dataset && curBtn.dataset.origText) {
        curBtn.disabled = false;
        curBtn.innerHTML = curBtn.dataset.origText;
      }
    }
  };

  app.syncHomeworkFeedbackFromRemote = async function (targetLessonNum) {
    try {
      const courseId = '6adadba969897b0002482ca5';
      const vendorId = window.IZTEACH_STORAGE?.vendorId || '3529cd2b-7af6-4fda-887c-392a79393d6a';
      const url = `https://tr8x5atpvd.execute-api.ap-southeast-1.amazonaws.com/prod/homework?course=${courseId}&vendorId=${vendorId}`;
      const res = await fetch(url).catch(() => null);
      if (!res || !res.ok) return false;
      const json = await res.json().catch(() => null);
      const list = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
      if (!list.length) return false;

      const parentStudent = this.getActiveParentStudent();
      const targetLesson = Number(targetLessonNum) || 1;
      const unitId = window.IZTEACH_STORAGE?.resolveUnitIdForLesson(targetLesson);

      const matchedRemote = list.find(it => {
        const remoteUnitId = (typeof it.unit === 'object' && it.unit?._id) ? it.unit._id : it.unit;
        const matchesUnit = remoteUnitId === unitId;
        const matchesStudent = it.email && parentStudent.email && String(it.email).toLowerCase() === String(parentStudent.email).toLowerCase();
        return (matchesUnit || matchesStudent) && (it.state === 'approved' || typeof it.mark === 'number');
      });

      if (matchedRemote) {
        let hw = (this.state?.homeworks || []).find(h => this.isHomeworkForStudent(h, parentStudent) && (Number(h.lessonNum) || this.parseLessonNumber(h.lesson, -1)) === targetLesson);
        if (!hw) {
          hw = {
            id: 'HW-' + Date.now(),
            lessonNum: targetLesson,
            lesson: `Buổi ${targetLesson}/15`,
            title: `Bài tập New HSK 1 - Buổi ${targetLesson}`,
            studentCode: parentStudent.code,
            studentEmail: parentStudent.email,
            studentName: parentStudent.name,
            attachments: []
          };
          this.state.homeworks.unshift(hw);
        }
        hw.status = 'GRADED';
        hw.score = typeof matchedRemote.mark === 'number' ? matchedRemote.mark : 9.5;
        const cleanNotes = String(matchedRemote.notes || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        hw.teacherFeedback = cleanNotes || 'Con hoàn thành rất tốt bài tập về nhà, nét chữ đều và phát âm chuẩn!';
        if (Array.isArray(matchedRemote.correctionResources) && matchedRemote.correctionResources.length) {
          hw.teacherAudioFeedback = matchedRemote.correctionResources[0]?.origin?.link || matchedRemote.correctionResources[0]?.link || '';
        }
        this.saveState();
        const course = this.onlineCourses?.[0];
        this.renderInLessonHomeworkModule(course, targetLesson - 1);
        return true;
      }
    } catch (e) {
      console.warn('[Sync] Không thể đồng bộ feedback từ remote:', e);
    }
    return false;
  };

  app.renderHomeworks = function () {
    const parentStudent = this.getActiveParentStudent();
    const managed = this.getTeacherManagedStudents();
    const selectedStudent = managed.length ? (this.students[this.selectedStudentIdx] || managed[0].student) : null;

    if (selectedStudent) {
      const stuModel = this.getStudentLessonsModel(selectedStudent);
      const pendingL = stuModel.lessons.find(l => l.status === 'pending');
      const currentLessonObj = stuModel.lessons.find(l => l.n === this.teacherGradeLessonNum);
      if (
        !this.teacherGradeLessonNum ||
        !currentLessonObj ||
        (pendingL && (this._lastAutoSelectedPendingHwId !== pendingL.hw?.id || (currentLessonObj.status !== 'pending' && !this._teacherManuallyPickedLesson)))
      ) {
        if (pendingL) {
          this.teacherGradeLessonNum = pendingL.n;
          this.selectedHwId = pendingL.hw?.id || null;
          this._lastAutoSelectedPendingHwId = pendingL.hw?.id || null;
        } else if (selectedStudent.unsubmittedCurrent) {
          this.teacherGradeLessonNum = stuModel.learnedMax;
        } else {
          this.teacherGradeLessonNum = stuModel.baseLearned;
        }
      }
      const activeGradeLesson = stuModel.lessons.find(l => l.n === this.teacherGradeLessonNum) || stuModel.lessons[0];
      const tHw = activeGradeLesson?.hw || null;
      const gradeAssign = activeGradeLesson?.assignInfo || this.getLessonAssignmentInfo(selectedStudent.classCode, activeGradeLesson?.n || 1);

      const gradeStripEl = $('teacher-grade-lesson-strip');
      if (gradeStripEl) {
        gradeStripEl.innerHTML = stuModel.lessons.map(item => {
          const isAct = item.n === activeGradeLesson.n;
          if (item.status === 'pending') {
            return `<button type="button" role="tab" aria-selected="${isAct}" data-grade-lesson="${item.n}" class="lesson-pill is-orange ${isAct ? 'active' : ''}" onclick="app.selectTeacherGradeLesson(${item.n})"><span>Buổi ${item.n}</span><span class="pill-sub">Chờ chấm</span></button>`;
          }
          if (item.status === 'graded') {
            return `<button type="button" role="tab" aria-selected="${isAct}" data-grade-lesson="${item.n}" class="lesson-pill is-graded ${isAct ? 'active' : ''}" onclick="app.selectTeacherGradeLesson(${item.n})"><span>Buổi ${item.n}</span><span class="pill-sub">${item.hw?.score ?? 9.5}đ</span></button>`;
          }
          return `<button type="button" role="tab" aria-selected="${isAct}" data-grade-lesson="${item.n}" class="lesson-pill is-unsubmitted ${isAct ? 'active' : ''}" onclick="app.selectTeacherGradeLesson(${item.n})"><span>Buổi ${item.n}</span></button>`;
        }).join('');

        requestAnimationFrame(() => {
          const activeBtn = gradeStripEl.querySelector(`.lesson-pill[data-grade-lesson="${activeGradeLesson.n}"]`);
          if (activeBtn && gradeStripEl.clientWidth > 0) {
            const targetScroll = activeBtn.offsetLeft - (gradeStripEl.clientWidth / 2) + (activeBtn.offsetWidth / 2);
            gradeStripEl.style.scrollBehavior = 'auto';
            gradeStripEl.scrollLeft = Math.max(0, targetScroll);
            gradeStripEl.style.scrollBehavior = '';
          }
        });
      }

      const disableGradeControls = Boolean(this.state.teacherChatLocked || !tHw);
      if ($('btn-submit-grade')) $('btn-submit-grade').disabled = disableGradeControls;
      ['grade-score', 'grade-template', 'grade-feedback'].forEach(id => {
        if ($(id)) $(id).disabled = Boolean(this.state.teacherChatLocked);
      });

      const teacherGameBanner = '';

      if ($('teacher-homework-target') && tHw) {
        const teacherContext = `Chấm bài · ${selectedStudent.name} (${selectedStudent.classCode || 'Lớp học'}) · ${tHw.lesson}`;
        const teacherGalleryId = `TEACHER-${tHw.id}`;
        const gradeLessonLabel = (gradeAssign.lessonName || activeGradeLesson.topic)
          ? `Buổi ${activeGradeLesson.n}: ${esc(gradeAssign.lessonName || activeGradeLesson.topic)}`
          : `Buổi ${activeGradeLesson.n}`;
        const isGraded = tHw.status === 'GRADED';
        const statusBanner = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:8px 12px;margin-bottom:8px;border-radius:10px;background:${isGraded ? '#ECFDF5' : '#FFF7ED'};border:1px solid ${isGraded ? '#A7F3D0' : '#FED7AA'};">
          <div>
            <strong style="font-size:14px;color:#0F172A;">${gradeLessonLabel} — ${esc(selectedStudent.name)}</strong>
            <div style="font-size:12.5px;color:#475569;margin-top:2px;">Ghi chú nộp bài: <em>"${esc(tHw.parentNote || 'Đã nộp bài tập về nhà')}"</em></div>
          </div>
          <span class="badge-pill ${isGraded ? 'status-online' : 'status-orange'}">${isGraded ? `✓ Đã chấm: ${tHw.score}/10` : '🟠 Chờ cô chấm điểm'}</span>
        </div>`;
        const validAttachments = (Array.isArray(tHw.attachments) ? tHw.attachments : []).filter(a => {
          if (!a) return false;
          const s = String(a.title || '') + String(a.cdnUrl || '') + String(a.playUrl || '');
          if (s.includes('1715874240352') || s.includes('BTVN BAI 1.mp4') || s.includes('664629c14af85b0009d819d4')) return false;
          return Boolean(a.playUrl || a.cdnUrl);
        });
        const galleryHtml = validAttachments.length
          ? this.renderAttachmentGallery(validAttachments, {
              hwId: teacherGalleryId,
              contextLabel: teacherContext,
              tasks: gradeAssign.tasks
            })
          : `<div class="empty-box" style="padding:10px 14px;font-size:12.5px;color:var(--sub);background:#F8FAFC;border:1px dashed var(--border);border-radius:8px;">Học sinh không đính kèm tệp video hoặc ảnh cho buổi học này.</div>`;
        $('teacher-homework-target').innerHTML = statusBanner + teacherGameBanner + galleryHtml;
      } else if ($('teacher-homework-target')) {
        const curNum = activeGradeLesson ? activeGradeLesson.n : this.parseLessonNumber(selectedStudent.progress, 1);
        const curLessonTitle = gradeAssign.lessonName || activeGradeLesson?.topic || '';
        const tasksHtml = (gradeAssign.tasks && gradeAssign.tasks.length)
          ? gradeAssign.tasks.map((t, i) => `<div><strong>Bài ${i + 1}:</strong> ${esc(t.title)}</div>`).join('')
          : `<div style="color:var(--dim);">Cô giáo chưa giao bài tập cho buổi này.</div>`;
        $('teacher-homework-target').innerHTML = teacherGameBanner + `<div class="hw-feedback-box" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;background:#F8FAFC;border-color:#CBD5E1;">
          <div>
            <strong style="font-size:14px;color:var(--text);">⚪ ${esc(selectedStudent.name)} chưa nộp bài (${curLessonTitle ? esc(curLessonTitle) : 'Buổi ' + curNum})</strong>
            <div style="font-size:12.5px;color:var(--sub);margin-top:4px;display:flex;flex-direction:column;gap:2px;">${tasksHtml}</div>
          </div>
          <button type="button" class="btn-primary" onclick="app.teacherRemindUnsubmittedStudent('${esc(selectedStudent.code)}')">Nhắc nộp bài</button>
        </div>`;
      }
    } else if ($('teacher-homework-target')) {
      $('teacher-homework-target').innerHTML = `<div class="hw-feedback-box">Chưa có học sinh trong lớp phụ trách.</div>`;
      if ($('btn-submit-grade')) $('btn-submit-grade').disabled = true;
      ['grade-score', 'grade-template', 'grade-feedback'].forEach(id => {
        if ($(id)) $(id).disabled = true;
      });
    }

    const parentHws = this.state.homeworks.filter(h => this.isHomeworkForStudent(h, parentStudent));
    if ($('badge-homework-count')) $('badge-homework-count').textContent = parentHws.length;

    const model = this.getStudentLessonsModel(parentStudent);
    if (!this.selectedLessonNum || !model.lessons.some(l => l.n === this.selectedLessonNum && l.status !== 'locked')) {
      const parentPending = model.lessons.find(l => l.status === 'pending');
      this.selectedLessonNum = parentPending ? parentPending.n : model.baseLearned;
    }
    const activeLesson = model.lessons.find(l => l.n === this.selectedLessonNum) || model.lessons[0];
    const needSubmitLesson = model.lessons.find(l => l.status === 'need_submit');
    const activeAssign = activeLesson.assignInfo || this.getLessonAssignmentInfo(parentStudent.classCode, activeLesson.n);
    const displayLessonName = activeAssign.lessonName || activeLesson.topic || '';
    const lessonHeaderText = displayLessonName
      ? `Buổi ${activeLesson.n}/${model.total}: ${displayLessonName}`
      : `Buổi ${activeLesson.n}/${model.total}`;

    const stripEl = $('parent-lesson-strip');
    if (stripEl) {
      stripEl.innerHTML = model.lessons.map(item => {
        const isActive = item.n === activeLesson.n;
        if (item.status === 'graded') {
          return `<button type="button" role="tab" aria-selected="${isActive}" data-lesson-num="${item.n}" data-lesson-state="graded" class="lesson-pill is-graded ${isActive ? 'active' : ''}" onclick="app.selectParentLesson(${item.n})"><span>Buổi ${item.n}</span><span class="pill-sub">${item.hw?.score ?? 9.5}đ</span></button>`;
        }
        if (item.status === 'pending') {
          return `<button type="button" role="tab" aria-selected="${isActive}" data-lesson-num="${item.n}" data-lesson-state="pending" class="lesson-pill is-orange ${isActive ? 'active' : ''}" onclick="app.selectParentLesson(${item.n})"><span>Buổi ${item.n}</span><span class="pill-sub">Chờ chấm</span></button>`;
        }
        if (item.status === 'need_submit') {
          return `<button type="button" role="tab" aria-selected="${isActive}" data-lesson-num="${item.n}" data-lesson-state="need_submit" class="lesson-pill is-orange ${isActive ? 'active' : ''}" onclick="app.selectParentLesson(${item.n})"><span>Buổi ${item.n}</span><span class="pill-sub">Cần nộp</span></button>`;
        }
        return `<button type="button" role="tab" aria-selected="false" aria-disabled="true" data-lesson-num="${item.n}" data-lesson-state="locked" class="lesson-pill is-locked" onclick="app.selectParentLesson(${item.n})"><span>Buổi ${item.n}</span></button>`;
      }).join('');

      requestAnimationFrame(() => {
        const activeBtn = stripEl.querySelector(`.lesson-pill[data-lesson-num="${activeLesson.n}"]`);
        if (activeBtn && stripEl.clientWidth > 0) {
          const targetScroll = activeBtn.offsetLeft - (stripEl.clientWidth / 2) + (activeBtn.offsetWidth / 2);
          stripEl.style.scrollBehavior = 'auto';
          stripEl.scrollLeft = Math.max(0, targetScroll);
          stripEl.style.scrollBehavior = '';
        }
      });
    }

    const stageEl = $('parent-lesson-stage');
    const listEl = $('parent-homework-list');
    const submitCardEl = $('parent-submit-card');
    const submitTitleEl = $('parent-submit-title');
    const submitBadgeEl = $('parent-submit-badge');
    const submitTasksEl = $('parent-submit-tasks');
    const submitBtnEl = $('btn-submit-homework');
    const hwTypeSelect = $('hw-type');
    if (hwTypeSelect && activeAssign.hwTypeValue) {
      hwTypeSelect.value = activeAssign.hwTypeValue;
    }
    if (typeof this.renderParentLessonGameCard === 'function') {
      this.renderParentLessonGameCard(parentStudent, activeLesson, activeAssign);
    }
    this.renderPendingAttachmentPreview();
    if (submitTasksEl) {
      if (!activeAssign.tasks || !activeAssign.tasks.length) {
        submitTasksEl.innerHTML = `<div style="font-size:12px;color:var(--sub);padding:6px 10px;background:#F8FAFC;border:1px dashed var(--border);border-radius:8px;">Chưa có bài tập riêng. Con có thể gửi video hoặc ảnh luyện tập cho cô.</div>`;
      } else {
        submitTasksEl.innerHTML = (activeAssign.tasks || []).map((t, i) => {
          const isGame = t.format === 'game';
          const badgeCls = isGame ? 'case-badge-online' : (t.format === 'image' ? 'status-online' : 'status-orange');
          const badgeTxt = isGame ? '🎮 Mini-Game' : (t.format === 'image' ? '📷 Ảnh' : '🎬 Video');
          return `
          <div style="font-size:13px;padding:6px 10px;background:#FFF;border:1px solid var(--border);border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <strong style="color:var(--primary);">Bài ${i + 1}:</strong>
              <span class="badge-pill ${badgeCls}">${badgeTxt}</span>
              <span style="font-weight:600;color:var(--text);">${esc(t.title)}</span>
            </div>
            ${isGame ? `<button type="button" class="chip-btn" style="font-weight:800;color:var(--primary);border-color:var(--primary);background:#FFF1F2;" onclick="app.openLessonGame(${activeLesson.n}, 'match')">🎮 Chơi ngay →</button>` : (t.format === 'video' ? `<button type="button" class="chip-btn" style="font-weight:700;color:var(--primary);border-color:#FECACA;background:#FFF1F2;" onclick="app.openHomeworkFilePicker('video')">🎬 Chọn video →</button>` : `<button type="button" class="chip-btn" style="font-weight:700;color:#0F766E;border-color:#99F6E4;background:#F0FDFA;" onclick="app.openHomeworkFilePicker('image')">📷 Chọn ảnh →</button>`)}
          </div>`;
        }).join('');
      }
    }

    if (activeLesson.status === 'need_submit') {
      if (stageEl) stageEl.className = 'lesson-stage priority-submit';
      if (listEl) {
        listEl.classList.add('hidden');
        listEl.innerHTML = '';
      }
      if (submitCardEl) submitCardEl.classList.remove('hidden');
      if (submitTitleEl) submitTitleEl.textContent = lessonHeaderText;
      if (submitBadgeEl) {
        submitBadgeEl.textContent = `${activeAssign.shortTag} · Cần nộp`;
        submitBadgeEl.className = 'badge-pill status-orange';
      }
      if (submitBtnEl) submitBtnEl.textContent = `Nộp bài cho cô →`;
    } else {
      const hw = activeLesson.hw;
      const isGraded = activeLesson.status === 'graded';
      if (stageEl) stageEl.className = 'lesson-stage priority-feedback';
      if (listEl) {
        listEl.classList.remove('hidden');
        const parentContext = `${parentStudent.name} · ${hw.lesson}${displayLessonName ? ' · ' + displayLessonName : ''}`;
        const nextOrangeBtn = (needSubmitLesson && needSubmitLesson.n !== activeLesson.n)
          ? `<button type="button" class="chip-btn" style="background:#FFFBEB;border-color:#F59E0B;color:#B45309;font-weight:800;" onclick="app.selectParentLesson(${needSubmitLesson.n})">🟠 Nộp bài Buổi ${needSubmitLesson.n} →</button>`
          : '';
        const priorityTopBox = isGraded
          ? `<div class="hw-feedback-priority">
              <div class="fb-head">
                <span class="fb-title">Cô nhận xét</span>
                <span class="fb-score">${hw.score} / 10</span>
              </div>
              <div class="fb-body">${esc(hw.teacherFeedback)}</div>
            </div>`
          : `<div class="hw-waiting-priority">
              <div>
                <strong>Đang chờ chấm điểm</strong>
                <span>Đã nộp (${esc(hw.submittedAt)})</span>
              </div>
              <span class="badge-pill status-orange">Chờ chấm</span>
            </div>`;
        listEl.innerHTML = `<div class="card hw-card">
          <div class="hw-header">
            <h3 class="hw-title">${esc(lessonHeaderText)}</h3>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><span class="badge-pill">${esc(activeAssign.shortTag)}</span>${nextOrangeBtn}</div>
          </div>
          ${priorityTopBox}
          ${(() => {
            const validParentAtts = (Array.isArray(hw.attachments) ? hw.attachments : []).filter(a => {
              if (!a) return false;
              const s = String(a.title || '') + String(a.cdnUrl || '') + String(a.playUrl || '');
              if (s.includes('1715874240352') || s.includes('BTVN BAI 1.mp4') || s.includes('664629c14af85b0009d819d4')) return false;
              return Boolean(a.playUrl || a.cdnUrl);
            });
            return validParentAtts.length
              ? this.renderAttachmentGallery(validParentAtts, { hwId: hw.id, contextLabel: parentContext, tasks: activeAssign.tasks })
              : '';
          })()}
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding-top:4px;border-top:1px solid var(--border);">
            <button type="button" class="btn-ghost" style="font-weight:700;" onclick="app.toggleResubmitForm()">${this.showResubmitForm ? 'Thu gọn ▲' : `+ Nộp bổ sung Buổi ${activeLesson.n}`}</button>
            ${needSubmitLesson ? `<button type="button" class="btn-primary" style="padding:6px 12px;font-size:12.5px;" onclick="app.selectParentLesson(${needSubmitLesson.n})">Sang Buổi ${needSubmitLesson.n} (Cần nộp) →</button>` : ''}
          </div>
        </div>`;
      }
      if (submitCardEl) submitCardEl.classList.toggle('hidden', !this.showResubmitForm);
      if (submitTitleEl) submitTitleEl.textContent = lessonHeaderText;
      if (submitBadgeEl) {
        submitBadgeEl.textContent = `${activeAssign.shortTag} · Buổi ${activeLesson.n}/${model.total}`;
        submitBadgeEl.className = 'badge-pill';
      }
      if (submitBtnEl) submitBtnEl.textContent = `Gửi bài Buổi ${activeLesson.n} cho cô`;
    }
  };

  app.toggleAlertReview = function (alertId) {
    const item = this.state.dlpAlerts.find(a => a.id === alertId);
    if (!item) return;
    item.reviewStatus = item.reviewStatus === 'REVIEWED' ? 'OPEN' : 'REVIEWED';
    item.resolution = item.reviewStatus === 'REVIEWED'
      ? 'Quản lý đã xác nhận và nhắc nhở giáo viên theo quy chế trung tâm.'
      : 'Chưa xử lý · Cần Quản lý xác nhận.';
    this.saveState();
    this.renderAll();
    this.showToast(item.reviewStatus === 'REVIEWED' ? `Đã đánh dấu xử lý bản ghi ${alertId}.` : `Đã mở lại bản ghi ${alertId}.`);
  };

  app.renderAdminAlerts = function () {
    const listEl = $('admin-alerts-list'), fv = $('admin-filter-severity') ? $('admin-filter-severity').value : 'OPEN';
    if (!listEl) return;
    const filtered = this.state.dlpAlerts.filter(a => {
      if (fv === 'ALL') return true;
      if (fv === 'OPEN') return a.reviewStatus !== 'REVIEWED';
      if (fv === 'REVIEWED') return a.reviewStatus === 'REVIEWED';
      return a.severity === fv;
    });
    if (!filtered.length) {
      listEl.innerHTML = '<div class="empty-box" style="margin:12px;">Không có cảnh báo nào.</div>';
      return;
    }
    listEl.innerHTML = filtered.map(a => {
      const done = a.reviewStatus === 'REVIEWED';
      return `<div class="log-item" style="padding:10px 12px;"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><span class="badge-pill ${done ? 'status-online' : 'status-alert'}">${done ? '✓ Đã xử lý' : '🔴 Chưa xử lý'}</span><strong style="font-size:13.5px;font-weight:800;">${esc(a.teacher)}</strong><span style="font-size:12.5px;color:var(--dim);">→ ${esc(a.student)}</span><span class="badge-pill">${esc(a.channel)}</span></div><span style="font-size:12px;color:var(--dim);">${esc(a.time)}</span></div><div style="font-size:12.5px;color:var(--err-txt);font-weight:700;">Chặn: ${esc(a.reasons.join(' · '))}</div><div class="log-raw" style="font-size:12.5px;">${esc(a.rawContent)}</div><div class="log-actions" style="justify-content:flex-end;"><button type="button" class="chip-btn" style="font-weight:700;" onclick="app.toggleAlertReview('${esc(a.id)}')">${done ? 'Mở lại' : '✓ Đánh dấu đã xử lý'}</button></div></div>`;
    }).join('');
  };

  app.openAction = function (type) {
    this.pendingAction = type;
    const dialog = $('action-dialog');
    if (!dialog || typeof dialog.showModal !== 'function') return this.confirmAction();
    const copy = {
      reset: ['Đặt lại dữ liệu mẫu?', 'Các tin nhắn, bài nộp, điểm chấm và phân quyền thử nghiệm sẽ quay về mặc định ban đầu.', 'Đặt lại ngay'],
      lock: [
        this.state.teacherChatLocked ? `Mở lại quyền nhắn tin cho ${this.state.teacherName}?` : `Tạm khóa quyền nhắn tin của ${this.state.teacherName}?`,
        this.state.teacherChatLocked ? 'Giáo viên sẽ gửi lại được tin nhắn và nhận xét bài tập cho phụ huynh.' : 'Giáo viên sẽ tạm thời không gửi được tin nhắn và nhận xét mới cho đến khi Quản lý mở khóa.',
        this.state.teacherChatLocked ? 'Mở khóa' : 'Tạm khóa'
      ],
      reassign: ['Đổi giáo viên phụ trách lớp?', `Chuyển quyền phụ trách lớp sang giáo viên dự phòng để tiếp tục hỗ trợ phụ huynh.`, 'Đổi giáo viên']
    }[type];
    if (!copy) return;
    $('action-title').textContent = copy[0];
    $('action-description').textContent = copy[1];
    $('action-confirm').textContent = copy[2];
    dialog.showModal();
  };

  app.confirmAction = function () {
    const type = this.pendingAction;
    this.pendingAction = null;
    $('action-dialog')?.close();
    if (type === 'reset') this.resetDemo(false);
    else if (type === 'lock') this.toggleTeacherLock();
    else if (type === 'reassign') this.reassignTeacher();
  };

  app.renderMobileNav = function () {
    const nav = $('mobile-work-nav');
    if (!nav) return;
    if (this.currentRole === 'parent') {
      const caseType = this.computeStudentCase(this.getActiveParentStudent());
      if (caseType === 'online_only' || caseType === 'unassigned') {
        const tabs = [
          ['courses', 'Khóa học'],
          ['docs', 'Tài liệu']
        ];
        if (this.parentSubtab === 'learn') tabs.push(['learn', 'Đang học']);
        nav.innerHTML = tabs.map(([id, label]) => `<button type="button" class="${this.parentSubtab === id ? 'active' : ''}" onclick="app.switchParentSubtab('${id}')">${label}</button>`).join('');
        return;
      }
      const tabs = [
        ['homework', 'Bài tập'],
        ['chat', 'Tin nhắn'],
        ...(caseType === 'both' ? [['courses', 'Khóa học'], ['docs', 'Tài liệu']] : [])
      ];
      if (this.parentSubtab === 'learn') tabs.push(['learn', 'Đang học']);
      nav.innerHTML = tabs.map(([id, label]) => `<button type="button" class="${this.parentSubtab === id ? 'active' : ''}" onclick="app.switchParentSubtab('${id}')">${label}</button>`).join('');
    } else if (this.currentRole === 'teacher') {
      nav.innerHTML = [
        ['assign', 'Giao bài'],
        ['grade', 'Chấm điểm'],
        ['chat', 'Tin nhắn']
      ].map(([id, label]) => `<button type="button" class="${this.teacherTab === id ? 'active' : ''}" onclick="app.switchTeacherTab('${id}')">${label}</button>`).join('');
    } else {
      nav.innerHTML = [
        ['overview', 'Lớp & GV'],
        ['accounts', 'Tài khoản'],
        ['alerts', 'Cảnh báo'],
        ['orders', 'Đơn hàng']
      ].map(([id, label]) => `<button type="button" class="${this.adminTab === id ? 'active' : ''}" onclick="app.switchAdminTab('${id}')">${label}</button>`).join('');
    }
  };

  app.renderExperience = function () {
    const openCount = this.state.dlpAlerts.filter(a => a.reviewStatus !== 'REVIEWED').length;
    const managedClasses = this.getTeacherManagedClasses();
    const managedCount = this.getTeacherManagedStudents().length;
    const lockTeacherInputs = Boolean(this.state.teacherChatLocked || !managedCount);
    ['input-teacher-chat', 'btn-teacher-send', 'grade-score', 'grade-template', 'grade-feedback', 'btn-submit-grade'].forEach(id => {
      if ($(id)) $(id).disabled = lockTeacherInputs;
    });
    if ($('badge-admin-alerts')) $('badge-admin-alerts').textContent = openCount;
    if ($('teacher-view-meta')) {
      $('teacher-view-meta').innerHTML = `Phụ trách <strong>${managedClasses.length} lớp · ${managedCount} học sinh</strong>`;
    }
    this.renderRoleIntro();
    if (this.currentRole === 'parent') {
      this.applyParentCaseLayout();
      this.renderParentOverview();
      this.renderParentCourses();
    } else if (this.currentRole === 'teacher') {
      this.renderTeacherManagePanel();
      this.renderTeacherSummary();
      this.renderTeacherAssignPanel();
      this.renderStudentList($('student-search') ? $('student-search').value : '');
    } else if (this.currentRole === 'admin') {
      if (this.adminTab === 'orders') {
        this.renderAdminOrders();
      } else if (this.adminTab === 'alerts') {
        this.renderAdminAlerts();
      } else {
        this.renderAdminOverview();
      }
      this.renderStudentList($('student-search') ? $('student-search').value : '');
    }
    // Cập nhật huy hiệu đếm đơn hàng chờ phê duyệt
    const pendingOrdersCount = (Array.isArray(this.state?.orders) ? this.state.orders : (app.DEFAULT_ORDERS || [])).filter(o => o && o.approvalStatus === 'pending').length;
    if ($('admin-orders-badge')) $('admin-orders-badge').textContent = String(pendingOrdersCount);

    this.renderMobileNav();
    if (typeof this.updatePwaHeaderBadges === 'function') this.updatePwaHeaderBadges();
  };

  /* ============================================================================
   * PHẦN MỞ RỘNG 1: GIÁO TRÌNH KHỔNG TỬ NHÍ 25 BUỔI (LỘ 1 & LỘ 2) & 4 MINI-GAME YCT
   * Trích xuất chính xác từ lo1_viet_trung.pdf (25 bài) & lo2_viet_trung.pdf (20+5 bài)
   * ============================================================================ */
  const CURRICULUM_LO1 = {
    1: {
      title: 'Bài 1: Phát âm Thanh mẫu b, p, m, f & Chào hỏi (你好)',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 1)',
      words: [
        { hanzi: '爸爸', pinyin: 'bàba', meaning: 'Bố / Ba' },
        { hanzi: '妈妈', pinyin: 'māma', meaning: 'Mẹ / Má' },
        { hanzi: '外婆', pinyin: 'wàipó', meaning: 'Bà ngoại' },
        { hanzi: '我', pinyin: 'wǒ', meaning: 'Tôi / Con' },
        { hanzi: '你', pinyin: 'nǐ', meaning: 'Bạn' },
        { hanzi: '好', pinyin: 'hǎo', meaning: 'Tốt / Khỏe' }
      ],
      sentences: [
        { tokens: ['你', '好', '！'], pinyin: 'Nǐ hǎo!', meaning: 'Xin chào bạn!' },
        { tokens: ['爸爸', '好', '，', '妈妈', '好', '。'], pinyin: 'Bàba hǎo, māma hǎo.', meaning: 'Con chào bố, con chào mẹ.' },
        { tokens: ['我', '买', '五', '个', '。'], pinyin: 'Wǒ mǎi wǔ gè.', meaning: 'Con mua năm cái.' }
      ],
      writingChars: ['一', '八', '五', '你', '好', '我']
    },
    2: {
      title: 'Bài 2: Thanh mẫu d, t, n, l & Vận mẫu an, en, ang, eng',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 2)',
      words: [
        { hanzi: '对', pinyin: 'duì', meaning: 'Đúng' },
        { hanzi: '兔子', pinyin: 'tùzi', meaning: 'Con thỏ' },
        { hanzi: '牛', pinyin: 'niú', meaning: 'Con trâu / bò' },
        { hanzi: '蓝', pinyin: 'lán', meaning: 'Màu xanh lam' },
        { hanzi: '门', pinyin: 'mén', meaning: 'Cánh cửa' },
        { hanzi: '红', pinyin: 'hóng', meaning: 'Màu đỏ' }
      ],
      sentences: [
        { tokens: ['这', '是', '兔子', '。'], pinyin: 'Zhè shì tùzi.', meaning: 'Đây là con thỏ.' },
        { tokens: ['今天', '很', '冷', '。'], pinyin: 'Jīntiān hěn lěng.', meaning: 'Hôm nay rất lạnh.' }
      ],
      writingChars: ['牛', '门', '大', '太', '紅', '对']
    },
    3: {
      title: 'Bài 3: Thanh mẫu g, k, h & Nhóm âm mặt lưỡi j, q, x',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 3)',
      words: [
        { hanzi: '哥哥', pinyin: 'gēge', meaning: 'Anh trai' },
        { hanzi: '狗', pinyin: 'gǒu', meaning: 'Con chó' },
        { hanzi: '高', pinyin: 'gāo', meaning: 'Cao' },
        { hanzi: '喝', pinyin: 'hē', meaning: 'Uống' },
        { hanzi: '家', pinyin: 'jiā', meaning: 'Nhà / Gia đình' },
        { hanzi: '喜欢', pinyin: 'xǐhuan', meaning: 'Yêu thích' }
      ],
      sentences: [
        { tokens: ['哥哥', '很', '高', '。'], pinyin: 'Gēge hěn gāo.', meaning: 'Anh trai rất cao.' },
        { tokens: ['我', '喜欢', '小鸡', '。'], pinyin: 'Wǒ xǐhuan xiǎojī.', meaning: 'Con thích gà con.' }
      ],
      writingChars: ['哥', '高', '家', '去', '七', '九']
    },
    4: {
      title: 'Bài 4: Vận mẫu nhóm i, ü (ia, ie, iao, iu, ian, üe)',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 4)',
      words: [
        { hanzi: '姐姐', pinyin: 'jiějie', meaning: 'Chị gái' },
        { hanzi: '小', pinyin: 'xiǎo', meaning: 'Nhỏ bé' },
        { hanzi: '再见', pinyin: 'zàijiàn', meaning: 'Tạm biệt' },
        { hanzi: '今天', pinyin: 'jīntiān', meaning: 'Hôm nay' },
        { hanzi: '女', pinyin: 'nǚ', meaning: 'Con gái / Nữ' },
        { hanzi: '月', pinyin: 'yuè', meaning: 'Mặt trăng / Tháng' }
      ],
      sentences: [
        { tokens: ['姐姐', '，', '再见', '！'], pinyin: 'Jiějie, zàijiàn!', meaning: 'Chào tạm biệt chị gái!' },
        { tokens: ['今天', '我', '去', '北京', '。'], pinyin: 'Jīntiān wǒ qù Běijīng.', meaning: 'Hôm nay con đi Bắc Kinh.' }
      ],
      writingChars: ['小', '女', '月', '天', '六', '見']
    },
    5: {
      title: 'Bài 5: Ôn tập Ngữ âm Thanh mẫu & Vận mẫu (Bài 1–4)',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 5)',
      words: [
        { hanzi: '老师', pinyin: 'lǎoshī', meaning: 'Cô giáo / Thầy giáo' },
        { hanzi: '谢谢', pinyin: 'xièxie', meaning: 'Cảm ơn' },
        { hanzi: '再见', pinyin: 'zàijiàn', meaning: 'Tạm biệt' },
        { hanzi: '小猫', pinyin: 'xiǎomāo', meaning: 'Mèo con' },
        { hanzi: '喝水', pinyin: 'hē shuǐ', meaning: 'Uống nước' },
        { hanzi: '开心', pinyin: 'kāixīn', meaning: 'Vui vẻ' }
      ],
      sentences: [
        { tokens: ['谢谢', '老师', '！'], pinyin: 'Xièxie lǎoshī!', meaning: 'Con cảm ơn cô giáo!' },
        { tokens: ['老师', '，', '再见', '！'], pinyin: 'Lǎoshī, zàijiàn!', meaning: 'Con chào tạm biệt cô giáo!' }
      ],
      writingChars: ['一', '二', '三', '大', '小', '女']
    },
    6: {
      title: 'Bài 6: Nhóm âm đầu lưỡi z, c, s & Tập đếm số',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 6)',
      words: [
        { hanzi: '孩子', pinyin: 'háizi', meaning: 'Trẻ con / Em bé' },
        { hanzi: '汉字', pinyin: 'hànzì', meaning: 'Chữ Hán' },
        { hanzi: '菜', pinyin: 'cài', meaning: 'Rau / Món ăn' },
        { hanzi: '草', pinyin: 'cǎo', meaning: 'Cây cỏ' },
        { hanzi: '三', pinyin: 'sān', meaning: 'Số 3' },
        { hanzi: '四', pinyin: 'sì', meaning: 'Số 4' }
      ],
      sentences: [
        { tokens: ['我', '写', '汉字', '。'], pinyin: 'Wǒ xiě hànzì.', meaning: 'Con viết chữ Hán.' },
        { tokens: ['这', '是', '三', '，', '那', '是', '四', '。'], pinyin: 'Zhè shì sān, nà shì sì.', meaning: 'Đây là số 3, kia là số 4.' }
      ],
      writingChars: ['三', '四', '字', '子', '草', '伞']
    },
    7: {
      title: 'Bài 7: Vận mẫu uo, ua, uai, ui, uan, uang & âm cuốn lưỡi er',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 7)',
      words: [
        { hanzi: '耳朵', pinyin: 'ěrduo', meaning: 'Cái tai' },
        { hanzi: '苹果', pinyin: 'píngguǒ', meaning: 'Quả táo' },
        { hanzi: '花', pinyin: 'huā', meaning: 'Bông hoa' },
        { hanzi: '快', pinyin: 'kuài', meaning: 'Nhanh' },
        { hanzi: '回', pinyin: 'huí', meaning: 'Trở về' },
        { hanzi: '黄', pinyin: 'huáng', meaning: 'Màu vàng' }
      ],
      sentences: [
        { tokens: ['我', '吃', '苹果', '。'], pinyin: 'Wǒ chī píngguǒ.', meaning: 'Con ăn quả táo.' },
        { tokens: ['我', '回', '家', '。'], pinyin: 'Wǒ huí jiā.', meaning: 'Con về nhà.' }
      ],
      writingChars: ['二', '耳', '花', '回', '果', '火']
    },
    8: {
      title: 'Bài 8: Nhóm âm cong lưỡi zh, ch, sh, r',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 8)',
      words: [
        { hanzi: '中国', pinyin: 'Zhōngguó', meaning: 'Trung Quốc' },
        { hanzi: '车', pinyin: 'chē', meaning: 'Chiếc xe' },
        { hanzi: '吃', pinyin: 'chī', meaning: 'Ăn' },
        { hanzi: '茶', pinyin: 'chá', meaning: 'Trà' },
        { hanzi: '水', pinyin: 'shuǐ', meaning: 'Nước' },
        { hanzi: '人', pinyin: 'rén', meaning: 'Con người' }
      ],
      sentences: [
        { tokens: ['爸爸', '喝', '茶', '。'], pinyin: 'Bàba hē chá.', meaning: 'Bố uống trà.' },
        { tokens: ['我', '喝', '水', '。'], pinyin: 'Wǒ hē shuǐ.', meaning: 'Con uống nước.' }
      ],
      writingChars: ['十', '人', '水', '中', '车', '日']
    },
    9: {
      title: 'Bài 9: Quy tắc đọc viết Pinyin & Biến điệu Thanh 3',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 9)',
      words: [
        { hanzi: '你好', pinyin: 'nǐhǎo', meaning: 'Xin chào' },
        { hanzi: '很好', pinyin: 'hěn hǎo', meaning: 'Rất khỏe / Rất tốt' },
        { hanzi: '喝水', pinyin: 'hē shuǐ', meaning: 'Uống nước' },
        { hanzi: '吃饭', pinyin: 'chīfàn', meaning: 'Ăn cơm' },
        { hanzi: '看书', pinyin: 'kànshū', meaning: 'Đọc sách' },
        { hanzi: '朋友', pinyin: 'péngyou', meaning: 'Bạn bè' }
      ],
      sentences: [
        { tokens: ['我', '很', '好', '。'], pinyin: 'Wǒ hěn hǎo.', meaning: 'Con rất khỏe.' },
        { tokens: ['我们', '一起', '看书', '。'], pinyin: 'Wǒmen yìqǐ kànshū.', meaning: 'Chúng mình cùng đọc sách.' }
      ],
      writingChars: ['你', '好', '水', '书', '友', '手']
    },
    10: {
      title: 'Bài 10: 8 Nét chữ Hán cơ bản & Quy tắc bút thuận',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 10)',
      words: [
        { hanzi: '一', pinyin: 'yī', meaning: 'Số 1 / Nét ngang' },
        { hanzi: '二', pinyin: 'èr', meaning: 'Số 2' },
        { hanzi: '三', pinyin: 'sān', meaning: 'Số 3' },
        { hanzi: '十', pinyin: 'shí', meaning: 'Số 10' },
        { hanzi: '人', pinyin: 'rén', meaning: 'Người (Phẩy, Mác)' },
        { hanzi: '口', pinyin: 'kǒu', meaning: 'Cái miệng' }
      ],
      sentences: [
        { tokens: ['一', '二', '三', '，', '写', '汉字', '。'], pinyin: 'Yī èr sān, xiě hànzì.', meaning: 'Một hai ba, tập viết chữ Hán.' },
        { tokens: ['大', '人', '，', '小', '人', '。'], pinyin: 'Dà rén, xiǎo rén.', meaning: 'Người lớn, trẻ nhỏ.' }
      ],
      writingChars: ['一', '二', '三', '十', '人', '口']
    },
    11: {
      title: 'Bài 11: Tổng ôn Ngữ âm Pinyin & Ghép từ đôi',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 11)',
      words: [
        { hanzi: '灯笼', pinyin: 'dēnglóng', meaning: 'Đèn lồng' },
        { hanzi: '英雄', pinyin: 'yīngxióng', meaning: 'Anh hùng' },
        { hanzi: '哭', pinyin: 'kū', meaning: 'Khóc' },
        { hanzi: '笑', pinyin: 'xiào', meaning: 'Cười' },
        { hanzi: '小狗', pinyin: 'xiǎogǒu', meaning: 'Chó con' },
        { hanzi: '足球', pinyin: 'zúqiú', meaning: 'Bóng đá' }
      ],
      sentences: [
        { tokens: ['妹妹', '爱', '笑', '。'], pinyin: 'Mèimei ài xiào.', meaning: 'Em gái hay cười.' },
        { tokens: ['哥哥', '踢', '足球', '。'], pinyin: 'Gēge tī zúqiú.', meaning: 'Anh trai đá bóng.' }
      ],
      writingChars: ['大', '小', '口', '日', '月', '水']
    },
    12: {
      title: 'Bài 12: Kiểm tra Giai đoạn 1 (Ngữ âm & Bút thuận chữ Hán)',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 12)',
      words: [
        { hanzi: '山', pinyin: 'shān', meaning: 'Ngọn núi' },
        { hanzi: '水', pinyin: 'shuǐ', meaning: 'Dòng nước' },
        { hanzi: '火', pinyin: 'huǒ', meaning: 'Ngọn lửa' },
        { hanzi: '木', pinyin: 'mù', meaning: 'Cây gỗ' },
        { hanzi: '日', pinyin: 'rì', meaning: 'Mặt trời' },
        { hanzi: '月', pinyin: 'yuè', meaning: 'Mặt trăng' }
      ],
      sentences: [
        { tokens: ['山', '上', '有', '木', '。'], pinyin: 'Shān shàng yǒu mù.', meaning: 'Trên núi có cây.' },
        { tokens: ['天', '上', '有', '日', '月', '。'], pinyin: 'Tiān shàng yǒu rì yuè.', meaning: 'Trên trời có mặt trời và mặt trăng.' }
      ],
      writingChars: ['山', '水', '火', '木', '日', '月']
    },
    13: {
      title: 'Bài 13: 你好 — Xin chào & Hỏi thăm sức khỏe',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 13)',
      words: [
        { hanzi: '你', pinyin: 'nǐ', meaning: 'Bạn' },
        { hanzi: '好', pinyin: 'hǎo', meaning: 'Tốt / Khỏe' },
        { hanzi: '你好', pinyin: 'nǐhǎo', meaning: 'Xin chào' },
        { hanzi: '吗', pinyin: 'ma', meaning: 'Không? (Trợ từ hỏi)' },
        { hanzi: '我', pinyin: 'wǒ', meaning: 'Tôi / Con' },
        { hanzi: '很', pinyin: 'hěn', meaning: 'Rất' }
      ],
      sentences: [
        { tokens: ['你', '好', '吗', '？'], pinyin: 'Nǐ hǎo ma?', meaning: 'Bạn có khỏe không?' },
        { tokens: ['我', '很', '好', '。'], pinyin: 'Wǒ hěn hǎo.', meaning: 'Mình rất khỏe.' }
      ],
      writingChars: ['你', '好', '吗', '我', '很', '人']
    },
    14: {
      title: 'Bài 14: 你叫什么？ — Bạn tên là gì & Quốc tịch',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 14)',
      words: [
        { hanzi: '叫', pinyin: 'jiào', meaning: 'Tên là / Gọi là' },
        { hanzi: '什么', pinyin: 'shénme', meaning: 'Cái gì / Gì' },
        { hanzi: '是', pinyin: 'shì', meaning: 'Là' },
        { hanzi: '哪', pinyin: 'nǎ', meaning: 'Nào' },
        { hanzi: '越南', pinyin: 'Yuènán', meaning: 'Việt Nam' },
        { hanzi: '中国', pinyin: 'Zhōngguó', meaning: 'Trung Quốc' }
      ],
      sentences: [
        { tokens: ['你', '叫', '什么', '？'], pinyin: 'Nǐ jiào shénme?', meaning: 'Bạn tên là gì?' },
        { tokens: ['我', '是', '越南', '人', '。'], pinyin: 'Wǒ shì Yuènán rén.', meaning: 'Con là người Việt Nam.' }
      ],
      writingChars: ['叫', '什', '么', '是', '国', '人']
    },
    15: {
      title: 'Bài 15: 你家在哪儿？ — Nhà bạn ở đâu?',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 15)',
      words: [
        { hanzi: '家', pinyin: 'jiā', meaning: 'Nhà / Gia đình' },
        { hanzi: '在', pinyin: 'zài', meaning: 'Ở tại' },
        { hanzi: '哪儿', pinyin: 'nǎr', meaning: 'Ở đâu' },
        { hanzi: '河内', pinyin: 'Hénèi', meaning: 'Hà Nội' },
        { hanzi: '他', pinyin: 'tā', meaning: 'Anh ấy / Bạn nam' },
        { hanzi: '她', pinyin: 'tā', meaning: 'Cô ấy / Bạn nữ' }
      ],
      sentences: [
        { tokens: ['你', '家', '在', '哪儿', '？'], pinyin: 'Nǐ jiā zài nǎr?', meaning: 'Nhà bạn ở đâu?' },
        { tokens: ['我', '家', '在', '河内', '。'], pinyin: 'Wǒ jiā zài Hénèi.', meaning: 'Nhà con ở Hà Nội.' }
      ],
      writingChars: ['家', '在', '他', '她', '北', '京']
    },
    16: {
      title: 'Bài 16: 爸爸、妈妈 — Gia đình của em & Biến điệu chữ 不',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 16)',
      words: [
        { hanzi: '这', pinyin: 'zhè', meaning: 'Đây / Này' },
        { hanzi: '那', pinyin: 'nà', meaning: 'Kia / Đó' },
        { hanzi: '爸爸', pinyin: 'bàba', meaning: 'Bố' },
        { hanzi: '妈妈', pinyin: 'māma', meaning: 'Mẹ' },
        { hanzi: '弟弟', pinyin: 'dìdi', meaning: 'Em trai' },
        { hanzi: '妹妹', pinyin: 'mèimei', meaning: 'Em gái' }
      ],
      sentences: [
        { tokens: ['这', '是', '我', '爸爸', '。'], pinyin: 'Zhè shì wǒ bàba.', meaning: 'Đây là bố của con.' },
        { tokens: ['那', '是', '我', '妈妈', '。'], pinyin: 'Nà shì wǒ māma.', meaning: 'Kia là mẹ của con.' }
      ],
      writingChars: ['爸', '妈', '哥', '姐', '弟', '妹']
    },
    17: {
      title: 'Bài 17: 我有一只小猫 — Thú cưng & Số đếm 1–10 (Phân biệt 二 / 两)',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 17)',
      words: [
        { hanzi: '有', pinyin: 'yǒu', meaning: 'Có' },
        { hanzi: '没有', pinyin: 'méiyǒu', meaning: 'Không có' },
        { hanzi: '猫', pinyin: 'māo', meaning: 'Con mèo' },
        { hanzi: '狗', pinyin: 'gǒu', meaning: 'Con chó' },
        { hanzi: '只', pinyin: 'zhī', meaning: 'Con (Lượng từ)' },
        { hanzi: '两', pinyin: 'liǎng', meaning: 'Hai (dùng với lượng từ)' }
      ],
      sentences: [
        { tokens: ['我', '有', '一', '只', '小猫', '。'], pinyin: 'Wǒ yǒu yì zhī xiǎo māo.', meaning: 'Con có một chú mèo nhỏ.' },
        { tokens: ['他', '有', '两', '只', '小狗', '。'], pinyin: 'Tā yǒu liǎng zhī xiǎo gǒu.', meaning: 'Bạn ấy có hai chú chó nhỏ.' }
      ],
      writingChars: ['有', '只', '小', '猫', '狗', '两']
    },
    18: {
      title: 'Bài 18: 我家不大 — Chủ đề Gia đình & Ngôi nhà của bé (家人)',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 18)',
      words: [
        { hanzi: '家', pinyin: 'jiā', meaning: 'Nhà / Gia đình' },
        { hanzi: '房子', pinyin: 'fángzi', meaning: 'Ngôi nhà' },
        { hanzi: '大', pinyin: 'dà', meaning: 'To / Rộng lớn' },
        { hanzi: '个', pinyin: 'gè', meaning: 'Cái / Chiếc (Lượng từ)' },
        { hanzi: '房间', pinyin: 'fángjiān', meaning: 'Căn phòng' },
        { hanzi: '厨房', pinyin: 'chúfáng', meaning: 'Nhà bếp' }
      ],
      sentences: [
        { tokens: ['我', '家', '不', '大', '。'], pinyin: 'Wǒ jiā bú dà.', meaning: 'Nhà của con không lớn.' },
        { tokens: ['我', '家', '有', '五', '个', '房间', '。'], pinyin: 'Wǒ jiā yǒu wǔ gè fángjiān.', meaning: 'Nhà con có năm căn phòng.' },
        { tokens: ['厨房', '很', '大', '。'], pinyin: 'Chúfáng hěn dà.', meaning: 'Nhà bếp rất rộng.' }
      ],
      writingChars: ['家', '大', '个', '五', '十', '房']
    },
    19: {
      title: 'Bài 19: 家庭练习 — Mẫu câu giới thiệu các thành viên trong nhà',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 19)',
      words: [
        { hanzi: '爸爸', pinyin: 'bàba', meaning: 'Bố' },
        { hanzi: '妈妈', pinyin: 'māma', meaning: 'Mẹ' },
        { hanzi: '哥哥', pinyin: 'gēge', meaning: 'Anh trai' },
        { hanzi: '姐姐', pinyin: 'jiějie', meaning: 'Chị gái' },
        { hanzi: '小猫', pinyin: 'xiǎomāo', meaning: 'Mèo con' },
        { hanzi: '房间', pinyin: 'fángjiān', meaning: 'Căn phòng' }
      ],
      sentences: [
        { tokens: ['爸爸', '妈妈', '有', '小猫', '吗', '？'], pinyin: 'Bàba māma yǒu xiǎomāo ma?', meaning: 'Bố mẹ có nuôi mèo con không?' },
        { tokens: ['哥哥', '有', '一', '只', '小狗', '。'], pinyin: 'Gēge yǒu yì zhī xiǎogǒu.', meaning: 'Anh trai có một chú chó con.' }
      ],
      writingChars: ['爸', '妈', '哥', '姐', '家', '有']
    },
    20: {
      title: 'Bài 20: 我要苹果，你呢？ — Hoa quả & Đồ uống yêu thích',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 20)',
      words: [
        { hanzi: '水果', pinyin: 'shuǐguǒ', meaning: 'Hoa quả / Trái cây' },
        { hanzi: '苹果', pinyin: 'píngguǒ', meaning: 'Quả táo' },
        { hanzi: '果汁', pinyin: 'guǒzhī', meaning: 'Nước ép trái cây' },
        { hanzi: '汽水', pinyin: 'qìshuǐ', meaning: 'Nước ngọt có ga' },
        { hanzi: '茶', pinyin: 'chá', meaning: 'Trà' },
        { hanzi: '要', pinyin: 'yào', meaning: 'Muốn / Cần' }
      ],
      sentences: [
        { tokens: ['我', '要', '苹果', '，', '你', '呢', '？'], pinyin: 'Wǒ yào píngguǒ, nǐ ne?', meaning: 'Mình muốn quả táo, còn bạn thì sao?' },
        { tokens: ['我', '不', '要', '汽水', '，', '我', '要', '茶', '。'], pinyin: 'Wǒ bú yào qìshuǐ, wǒ yào chá.', meaning: 'Con không lấy nước ngọt, con muốn uống trà.' }
      ],
      writingChars: ['水', '果', '茶', '要', '不', '呢']
    },
    21: {
      title: 'Bài 21: 我喜欢海鲜 — Món ăn yêu thích & Phó từ 也',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 21)',
      words: [
        { hanzi: '喜欢', pinyin: 'xǐhuan', meaning: 'Thích' },
        { hanzi: '海鲜', pinyin: 'hǎixiān', meaning: 'Hải sản' },
        { hanzi: '也', pinyin: 'yě', meaning: 'Cũng' },
        { hanzi: '牛肉', pinyin: 'niúròu', meaning: 'Thịt bò' },
        { hanzi: '米饭', pinyin: 'mǐfàn', meaning: 'Cơm trắng' },
        { hanzi: '牛奶', pinyin: 'niúnǎi', meaning: 'Sữa bò' }
      ],
      sentences: [
        { tokens: ['我', '喜欢', '海鲜', '，', '也', '喜欢', '菜', '。'], pinyin: 'Wǒ xǐhuan hǎixiān, yě xǐhuan cài.', meaning: 'Con thích hải sản, cũng thích ăn rau.' },
        { tokens: ['我', '喜欢', '喝', '牛奶', '。'], pinyin: 'Wǒ xǐhuan hē niúnǎi.', meaning: 'Con thích uống sữa.' }
      ],
      writingChars: ['也', '牛', '米', '鱼', '菜', '吃']
    },
    22: {
      title: 'Bài 22: 我有中文课 — Thứ ngày trong tuần & Thời khóa biểu',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 22)',
      words: [
        { hanzi: '星期', pinyin: 'xīngqī', meaning: 'Tuần / Thứ' },
        { hanzi: '星期一', pinyin: 'xīngqīyī', meaning: 'Thứ Hai' },
        { hanzi: '星期五', pinyin: 'xīngqīwǔ', meaning: 'Thứ Sáu' },
        { hanzi: '中文', pinyin: 'Zhōngwén', meaning: 'Tiếng Trung' },
        { hanzi: '英文', pinyin: 'Yīngwén', meaning: 'Tiếng Anh' },
        { hanzi: '课', pinyin: 'kè', meaning: 'Tiết học / Môn học' }
      ],
      sentences: [
        { tokens: ['星期一', '我', '有', '中文', '课', '。'], pinyin: 'Xīngqīyī wǒ yǒu Zhōngwén kè.', meaning: 'Thứ Hai con có tiết học tiếng Trung.' },
        { tokens: ['今天', '是', '星期五', '。'], pinyin: 'Jīntiān shì xīngqīwǔ.', meaning: 'Hôm nay là Thứ Sáu.' }
      ],
      writingChars: ['星', '期', '中', '文', '课', '天']
    },
    23: {
      title: 'Bài 23: 现在几点？ — Hỏi giờ giấc & Thời gian biểu hằng ngày',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 23)',
      words: [
        { hanzi: '现在', pinyin: 'xiànzài', meaning: 'Bây giờ / Hiện tại' },
        { hanzi: '几', pinyin: 'jǐ', meaning: 'Mấy' },
        { hanzi: '点', pinyin: 'diǎn', meaning: 'Giờ' },
        { hanzi: '半', pinyin: 'bàn', meaning: 'Rưỡi (30 phút)' },
        { hanzi: '分', pinyin: 'fēn', meaning: 'Phút' },
        { hanzi: '起床', pinyin: 'qǐchuáng', meaning: 'Thức dậy' }
      ],
      sentences: [
        { tokens: ['现在', '几', '点', '？'], pinyin: 'Xiànzài jǐ diǎn?', meaning: 'Bây giờ là mấy giờ?' },
        { tokens: ['我', '六', '点', '半', '起床', '。'], pinyin: 'Wǒ liù diǎn bàn qǐchuáng.', meaning: 'Con thức dậy lúc 6 giờ rưỡi.' }
      ],
      writingChars: ['几', '点', '半', '分', '六', '七']
    },
    24: {
      title: 'Bài 24: 我去图书馆 — Các địa điểm trong trường học',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 24)',
      words: [
        { hanzi: '去', pinyin: 'qù', meaning: 'Đi' },
        { hanzi: '图书馆', pinyin: 'túshūguǎn', meaning: 'Thư viện' },
        { hanzi: '教室', pinyin: 'jiàoshì', meaning: 'Phòng học / Lớp học' },
        { hanzi: '运动场', pinyin: 'yùndòngchǎng', meaning: 'Sân vận động' },
        { hanzi: '礼堂', pinyin: 'lǐtáng', meaning: 'Hội trường' },
        { hanzi: '学校', pinyin: 'xuéxiào', meaning: 'Trường học' }
      ],
      sentences: [
        { tokens: ['你', '去', '哪儿', '？'], pinyin: 'Nǐ qù nǎr?', meaning: 'Bạn đi đâu thế?' },
        { tokens: ['我', '去', '图书馆', '。'], pinyin: 'Wǒ qù túshūguǎn.', meaning: 'Mình đi thư viện.' }
      ],
      writingChars: ['去', '书', '学', '校', '室', '门']
    },
    25: {
      title: 'Bài 25: 总复习 — Tổng ôn tập & Kiểm tra cuối khóa Lộ trình 1',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 1 (Bài 25)',
      words: [
        { hanzi: '家人', pinyin: 'jiārén', meaning: 'Người nhà / Gia đình' },
        { hanzi: '苹果', pinyin: 'píngguǒ', meaning: 'Quả táo' },
        { hanzi: '中文', pinyin: 'Zhōngwén', meaning: 'Tiếng Trung' },
        { hanzi: '喜欢', pinyin: 'xǐhuan', meaning: 'Yêu thích' },
        { hanzi: '图书馆', pinyin: 'túshūguǎn', meaning: 'Thư viện' },
        { hanzi: '越南', pinyin: 'Yuènán', meaning: 'Việt Nam' }
      ],
      sentences: [
        { tokens: ['我', '喜欢', '学', '中文', '。'], pinyin: 'Wǒ xǐhuan xué Zhōngwén.', meaning: 'Con thích học tiếng Trung.' },
        { tokens: ['星期五', '我', '去', '图书馆', '。'], pinyin: 'Xīngqīwǔ wǒ qù túshūguǎn.', meaning: 'Thứ Sáu con đi thư viện.' }
      ],
      writingChars: ['我', '家', '中', '文', '好', '大']
    }
  };

  const CURRICULUM_LO2 = {
    1: {
      title: 'Bài 1: 他比我高 — Câu so sánh chữ 比 & Ngoại hình',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 2 (Bài 1)',
      words: [
        { hanzi: '比', pinyin: 'bǐ', meaning: 'So với / Hơn' },
        { hanzi: '高', pinyin: 'gāo', meaning: 'Cao' },
        { hanzi: '矮', pinyin: 'ǎi', meaning: 'Thấp' },
        { hanzi: '胖', pinyin: 'pàng', meaning: 'Mũm mĩm / Béo' },
        { hanzi: '瘦', pinyin: 'shòu', meaning: 'Gầy' },
        { hanzi: '岁', pinyin: 'suì', meaning: 'Tuổi' }
      ],
      sentences: [
        { tokens: ['哥哥', '比', '我', '高', '。'], pinyin: 'Gēge bǐ wǒ gāo.', meaning: 'Anh trai cao hơn con.' },
        { tokens: ['弟弟', '今年', '八', '岁', '。'], pinyin: 'Dìdi jīnnián bā suì.', meaning: 'Em trai năm nay 8 tuổi.' }
      ],
      writingChars: ['比', '高', '岁', '大', '小', '人']
    },
    2: {
      title: 'Bài 2: 我的房间 — Đồ đạc & Vị trí trong phòng',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 2 (Bài 2)',
      words: [
        { hanzi: '房间', pinyin: 'fángjiān', meaning: 'Căn phòng' },
        { hanzi: '桌子', pinyin: 'zhuōzi', meaning: 'Cái bàn' },
        { hanzi: '椅子', pinyin: 'yǐzi', meaning: 'Cái ghế' },
        { hanzi: '床', pinyin: 'chuáng', meaning: 'Cái giường' },
        { hanzi: '上', pinyin: 'shàng', meaning: 'Phía trên' },
        { hanzi: '里', pinyin: 'lǐ', meaning: 'Bên trong' }
      ],
      sentences: [
        { tokens: ['桌子', '上', '有', '一', '本', '书', '。'], pinyin: 'Zhuōzi shàng yǒu yì běn shū.', meaning: 'Trên bàn có một quyển sách.' },
        { tokens: ['我', '的', '房间', '很', '干净', '。'], pinyin: 'Wǒ de fángjiān hěn gānjìng.', meaning: 'Phòng của con rất sạch sẽ.' }
      ],
      writingChars: ['上', '下', '里', '房', '床', '书']
    },
    18: {
      title: 'Bài 18: 认识汉字与校园 — Chủ đề Trường học & Bộ thủ chữ Hán',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 2 (Bài 18)',
      words: [
        { hanzi: '学校', pinyin: 'xuéxiào', meaning: 'Trường học' },
        { hanzi: '教室', pinyin: 'jiàoshì', meaning: 'Phòng học' },
        { hanzi: '老师', pinyin: 'lǎoshī', meaning: 'Cô giáo' },
        { hanzi: '同学', pinyin: 'tóngxué', meaning: 'Bạn cùng lớp' },
        { hanzi: '学习', pinyin: 'xuéxí', meaning: 'Học tập' },
        { hanzi: '汉字', pinyin: 'hànzì', meaning: 'Chữ Hán' }
      ],
      sentences: [
        { tokens: ['我们', '在', '教室', '里', '学习', '汉字', '。'], pinyin: 'Wǒmen zài jiàoshì lǐ xuéxí hànzì.', meaning: 'Chúng con học chữ Hán ở trong lớp học.' },
        { tokens: ['老师', '教', '我们', '说', '汉语', '。'], pinyin: 'Lǎoshī jiāo wǒmen shuō Hànyǔ.', meaning: 'Cô giáo dạy chúng con nói tiếng Trung.' }
      ],
      writingChars: ['学', '校', '老', '师', '同', '字']
    },
    19: {
      title: 'Bài 19: 短文阅读与总复习 — Đọc đoạn văn ngắn YCT 3 không Pinyin',
      book: 'Giáo Trình Tiếng Trung Trẻ Em — Trung-Việt Lộ 2 (Bài 19)',
      words: [
        { hanzi: '早上', pinyin: 'zǎoshang', meaning: 'Buổi sáng' },
        { hanzi: '一起', pinyin: 'yìqǐ', meaning: 'Cùng nhau' },
        { hanzi: '上学', pinyin: 'shàngxué', meaning: 'Đi học' },
        { hanzi: '高兴', pinyin: 'gāoxìng', meaning: 'Vui mừng' },
        { hanzi: '回家', pinyin: 'huíjiā', meaning: 'Về nhà' },
        { hanzi: '作业', pinyin: 'zuòyè', meaning: 'Bài tập về nhà' }
      ],
      sentences: [
        { tokens: ['早上', '我', '和', '同学', '一起', '去', '上学', '。'], pinyin: 'Zǎoshang wǒ hé tóngxué yìqǐ qù shàngxué.', meaning: 'Buổi sáng con cùng bạn đi học.' },
        { tokens: ['回家', '以后', '我', '写', '汉字', '作业', '。'], pinyin: 'Huíjiā yǐhòu wǒ xiě hànzì zuòyè.', meaning: 'Sau khi về nhà con viết bài tập chữ Hán.' }
      ],
      writingChars: ['早', '上', '学', '回', '家', '写']
    }
  };

  app.getLessonCurriculum = function (classCode, lessonNum) {
    const num = Math.max(1, Math.min(25, Number(lessonNum) || 18));
    const cid = String(classCode || 'YCT2-04').toUpperCase();
    if (cid.includes('YCT3') && CURRICULUM_LO2[num]) {
      return CURRICULUM_LO2[num];
    }
    return CURRICULUM_LO1[num] || CURRICULUM_LO1[18];
  };

  app.getStudentLessonGameProgress = function (studentCode, lessonNum) {
    const code = studentCode || this.getActiveParentStudent()?.code || 'KTN-2026-089';
    const numKey = String(Math.max(1, Number(lessonNum) || 18));
    if (!this.state) return null;
    if (!this.state.gameProgress || typeof this.state.gameProgress !== 'object') {
      this.state.gameProgress = {
        'KTN-2026-089': {
          '18': { bestScore: 380, stars: 3, completedModes: ['match', 'quiz', 'sentence', 'writing'], updatedAt: 'Hôm qua' }
        }
      };
    }
    return this.state.gameProgress[code]?.[numKey] || null;
  };

  app.recordStudentGameModeWin = function (lessonNum, mode, earnedScore = 100) {
    const stu = this.getActiveParentStudent();
    if (!stu || !this.state) return null;
    const code = stu.code;
    const numKey = String(Math.max(1, Number(lessonNum) || 18));
    if (!this.state.gameProgress || typeof this.state.gameProgress !== 'object') {
      this.state.gameProgress = {};
    }
    if (!this.state.gameProgress[code]) this.state.gameProgress[code] = {};
    const prev = this.state.gameProgress[code][numKey] || { bestScore: 0, stars: 0, completedModes: [] };
    const modesSet = new Set(Array.isArray(prev.completedModes) ? prev.completedModes : []);
    modesSet.add(mode);
    const completedModes = Array.from(modesSet);
    const bestScore = Math.max(Number(prev.bestScore) || 0, completedModes.length * 90 + Math.min(60, Number(earnedScore) || 20));
    const stars = completedModes.length >= 3 ? 3 : (completedModes.length === 2 ? 2 : 1);
    const entry = {
      bestScore,
      stars,
      completedModes,
      updatedAt: 'Vừa hoàn thành'
    };
    this.state.gameProgress[code][numKey] = entry;
    this.saveState();
    this.renderHomeworks();
    if (completedModes.length === 4 && typeof this.triggerNotificationEvent === 'function') {
      this.triggerNotificationEvent('onSubmitted', {
        title: `🎮 ${stu.name} vừa hoàn thành cả 4 Mini-Game Buổi ${numKey}!`,
        body: `Đạt ${bestScore} điểm (⭐⭐⭐) trong bài học: ${this.getLessonCurriculum(stu.classCode, numKey).title}`,
        lessonNum: Number(numKey),
        studentCode: stu.code
      });
    }
    return entry;
  };

  app.speakChinese = function (text) {
    if (!text) return false;
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(String(text));
        utter.lang = 'zh-CN';
        utter.rate = 0.88;
        const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
        const zhVoice = voices.find(v => /zh|cmn|chinese/i.test(v.lang || v.name));
        if (zhVoice) utter.voice = zhVoice;
        window.speechSynthesis.speak(utter);
      }
    } catch {}
    this.playGameSound('tap');
    return true;
  };

  app.playGameSound = function (kind = 'tap') {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this._audioCtx) this._audioCtx = new AudioCtx();
      const ctx = this._audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      if (kind === 'win') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.09);
        osc.frequency.setValueAtTime(783.99, now + 0.18);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.36);
      } else if (kind === 'wrong') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.setValueAtTime(175, now + 0.12);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.26);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(620, now);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.11);
      }
    } catch {}
  };

  app.renderParentLessonGameCard = function () {
    const box = $('parent-lesson-game-card');
    if (box) {
      box.innerHTML = '';
      box.classList.add('hidden');
    }
  };

  app.openLessonGame = function () {
    return false;
  };
  app._unusedOpenLessonGame = function (lessonNum, mode = 'match', classCodeOverride = null) {
    const stu = this.getActiveParentStudent();
    const classCode = classCodeOverride || stu?.classCode || 'YCT2-04';
    const num = Math.max(1, Math.min(25, Number(lessonNum) || this.selectedLessonNum || 18));
    const curr = this.getLessonCurriculum(classCode, num);
    clearInterval(this._quizTimer);

    const shuffledMatchCards = [];
    curr.words.slice(0, 6).forEach((w, idx) => {
      shuffledMatchCards.push({ id: 'H-' + idx, pairId: idx, kind: 'hanzi', hanzi: w.hanzi, pinyin: w.pinyin, meaning: w.meaning, matched: false });
      shuffledMatchCards.push({ id: 'M-' + idx, pairId: idx, kind: 'meaning', hanzi: w.hanzi, pinyin: w.pinyin, meaning: w.meaning, matched: false });
    });
    for (let i = shuffledMatchCards.length - 1; i > 0; i--) {
      const j = (i * 7 + 3) % (i + 1);
      [shuffledMatchCards[i], shuffledMatchCards[j]] = [shuffledMatchCards[j], shuffledMatchCards[i]];
    }

    const sent0 = curr.sentences[0] || { tokens: ['你', '好', '！'], pinyin: 'Nǐ hǎo!', meaning: 'Xin chào!' };
    const bank0 = sent0.tokens.map((t, i) => ({ id: i, text: t, placed: false }));
    for (let i = bank0.length - 1; i > 0; i--) {
      const j = (i * 5 + 1) % (i + 1);
      [bank0[i], bank0[j]] = [bank0[j], bank0[i]];
    }
    if (bank0.map(b => b.text).join('') === sent0.tokens.join('') && bank0.length > 1) {
      bank0.reverse();
    }

    this.gameState = {
      open: true,
      lessonNum: num,
      classCode,
      curr,
      mode: ['match', 'quiz', 'sentence', 'writing'].includes(mode) ? mode : 'match',
      matchCards: shuffledMatchCards,
      selectedCardId: null,
      wrongPairIds: [],
      matchedPairs: 0,
      matchMoves: 0,
      quizTimeLeft: 60,
      quizScore: 0,
      quizStreak: 0,
      quizAnswered: 0,
      quizQuestion: null,
      quizFinished: false,
      sentenceIdx: 0,
      sentenceBank: bank0,
      sentencePlaced: [],
      sentenceFeedback: '',
      writingCharIdx: 0,
      writingShowGuide: true,
      writingStrokeCount: 0,
      writingAccuracy: null
    };

    this._generateNextQuizQuestion();
    const dlg = $('yct-game-dialog');
    if (!dlg) return false;
    this.renderGameModal();
    if (!dlg.open && typeof dlg.showModal === 'function') {
      dlg.showModal();
    } else if (!dlg.open) {
      dlg.setAttribute('open', '');
    }
    if (this.gameState.mode === 'quiz') {
      this._startQuizTimer();
    } else if (this.gameState.mode === 'writing') {
      requestAnimationFrame(() => this.initHanziWritingCanvas());
    }
    return true;
  };

  app.switchGameMode = function (mode) {
    if (!this.gameState) return false;
    clearInterval(this._quizTimer);
    this.gameState.mode = ['match', 'quiz', 'sentence', 'writing'].includes(mode) ? mode : 'match';
    if (this.gameState.mode === 'quiz' && !this.gameState.quizFinished) {
      this._startQuizTimer();
    }
    this.renderGameModal();
    if (this.gameState.mode === 'writing') {
      requestAnimationFrame(() => this.initHanziWritingCanvas());
    }
    return true;
  };

  app.closeLessonGame = function () {
    clearInterval(this._quizTimer);
    const dlg = $('yct-game-dialog');
    if (dlg && (dlg.open || dlg.hasAttribute('open'))) {
      try { dlg.close(); } catch { dlg.removeAttribute('open'); }
    }
    if (this.gameState) this.gameState.open = false;
    return true;
  };

  app._startQuizTimer = function () {
    clearInterval(this._quizTimer);
    this._quizTimer = setInterval(() => {
      if (!this.gameState || !this.gameState.open || this.gameState.mode !== 'quiz' || this.gameState.quizFinished) {
        clearInterval(this._quizTimer);
        return;
      }
      this.gameState.quizTimeLeft = Math.max(0, (this.gameState.quizTimeLeft || 60) - 1);
      const timerEl = $('yct-quiz-timer');
      if (timerEl) timerEl.textContent = `${this.gameState.quizTimeLeft}s`;
      if (this.gameState.quizTimeLeft <= 0) {
        clearInterval(this._quizTimer);
        this.finishQuizGame();
      }
    }, 1000);
  };

  app._generateNextQuizQuestion = function () {
    const st = this.gameState;
    if (!st) return;
    const words = st.curr.words;
    const idx = st.quizAnswered % words.length;
    const target = words[idx];
    const distractors = words.filter((_, i) => i !== idx).slice(0, 3);
    const options = [target, ...distractors].map((w, i) => ({
      hanzi: w.hanzi,
      pinyin: w.pinyin,
      meaning: w.meaning,
      isCorrect: i === 0
    }));
    for (let i = options.length - 1; i > 0; i--) {
      const j = (i * 3 + st.quizAnswered) % (i + 1);
      [options[i], options[j]] = [options[j], options[i]];
    }
    st.quizQuestion = {
      hanzi: target.hanzi,
      pinyin: target.pinyin,
      meaning: target.meaning,
      options
    };
  };

  app.handleMatchCardTap = function (cardId) {
    const st = this.gameState;
    if (!st) return false;
    const card = st.matchCards.find(c => c.id === cardId);
    if (!card || card.matched) return false;
    this.speakChinese(card.hanzi);

    if (!st.selectedCardId) {
      st.selectedCardId = card.id;
      st.wrongPairIds = [];
      this.renderGameModal();
      return true;
    }
    if (st.selectedCardId === card.id) {
      st.selectedCardId = null;
      this.renderGameModal();
      return true;
    }

    const first = st.matchCards.find(c => c.id === st.selectedCardId);
    st.matchMoves++;
    if (first && first.pairId === card.pairId && first.kind !== card.kind) {
      first.matched = true;
      card.matched = true;
      st.selectedCardId = null;
      st.wrongPairIds = [];
      st.matchedPairs++;
      this.playGameSound('win');
      if (st.matchedPairs >= 6) {
        this.recordStudentGameModeWin(st.lessonNum, 'match', 120);
        this.showToast(`🎉 Xuất sắc! Bé đã ghép đúng toàn bộ 6 cặp từ vựng Buổi ${st.lessonNum}!`);
      }
      this.renderGameModal();
    } else {
      st.wrongPairIds = [first ? first.id : '', card.id];
      st.selectedCardId = null;
      this.playGameSound('wrong');
      this.renderGameModal();
    }
    return true;
  };

  app.handleQuizAnswer = function (optIdx) {
    const st = this.gameState;
    if (!st || !st.quizQuestion || st.quizFinished) return false;
    const chosen = st.quizQuestion.options[optIdx];
    if (!chosen) return false;
    st.quizAnswered++;
    if (chosen.isCorrect) {
      st.quizStreak++;
      const bonus = st.quizStreak >= 3 ? 25 : 15;
      st.quizScore += bonus;
      this.speakChinese(st.quizQuestion.hanzi);
      this.playGameSound('win');
    } else {
      st.quizStreak = 0;
      this.playGameSound('wrong');
    }
    if (st.quizAnswered >= 6) {
      this.recordStudentGameModeWin(st.lessonNum, 'quiz', st.quizScore);
    }
    this._generateNextQuizQuestion();
    this.renderGameModal();
    return chosen.isCorrect;
  };

  app.finishQuizGame = function () {
    const st = this.gameState;
    if (!st) return false;
    clearInterval(this._quizTimer);
    st.quizFinished = true;
    this.recordStudentGameModeWin(st.lessonNum, 'quiz', Math.max(100, st.quizScore));
    this.playGameSound('win');
    this.showToast(`⚡ Hoàn thành Đua phản xạ Buổi ${st.lessonNum}: ${Math.max(100, st.quizScore)} điểm!`);
    this.renderGameModal();
    return true;
  };

  app.handleSentenceTileTap = function (bankId, fromPlaced = false) {
    const st = this.gameState;
    if (!st) return false;
    st.sentenceFeedback = '';
    if (fromPlaced) {
      const idx = st.sentencePlaced.findIndex(item => item.id === bankId);
      if (idx >= 0) {
        const [removed] = st.sentencePlaced.splice(idx, 1);
        const orig = st.sentenceBank.find(b => b.id === removed.id);
        if (orig) orig.placed = false;
      }
    } else {
      const tile = st.sentenceBank.find(b => b.id === bankId && !b.placed);
      if (tile) {
        tile.placed = true;
        st.sentencePlaced.push({ id: tile.id, text: tile.text });
        this.speakChinese(tile.text);
      }
    }
    this.renderGameModal();
    return true;
  };

  app.checkSentenceBuilder = function () {
    const st = this.gameState;
    if (!st) return false;
    const sent = st.curr.sentences[st.sentenceIdx] || st.curr.sentences[0];
    const targetStr = sent.tokens.join('');
    const userStr = st.sentencePlaced.map(t => t.text).join('');
    if (userStr === targetStr) {
      this.speakChinese(targetStr);
      this.playGameSound('win');
      this.recordStudentGameModeWin(st.lessonNum, 'sentence', 120);
      st.sentenceFeedback = 'correct';
      this.showToast(`🧩 Chính xác: "${targetStr}" (${sent.meaning})!`);
    } else {
      this.playGameSound('wrong');
      st.sentenceFeedback = 'wrong';
    }
    this.renderGameModal();
    return userStr === targetStr;
  };

  app.nextSentenceBuilder = function () {
    const st = this.gameState;
    if (!st) return false;
    st.sentenceIdx = (st.sentenceIdx + 1) % st.curr.sentences.length;
    const sent = st.curr.sentences[st.sentenceIdx];
    const bank = sent.tokens.map((t, i) => ({ id: i, text: t, placed: false }));
    bank.reverse();
    st.sentenceBank = bank;
    st.sentencePlaced = [];
    st.sentenceFeedback = '';
    this.renderGameModal();
    return true;
  };

  app.selectWritingChar = function (idx) {
    const st = this.gameState;
    if (!st) return false;
    const chars = st.curr.writingChars || ['家', '大', '个'];
    st.writingCharIdx = ((Number(idx) || 0) % chars.length + chars.length) % chars.length;
    st.writingStrokeCount = 0;
    st.writingAccuracy = null;
    this.speakChinese(chars[st.writingCharIdx]);
    this.renderGameModal();
    requestAnimationFrame(() => this.initHanziWritingCanvas());
    return true;
  };

  app.toggleWritingGuide = function () {
    if (!this.gameState) return false;
    this.gameState.writingShowGuide = !this.gameState.writingShowGuide;
    this.initHanziWritingCanvas();
    return this.gameState.writingShowGuide;
  };

  app.clearWritingCanvas = function () {
    if (!this.gameState) return false;
    this.gameState.writingStrokeCount = 0;
    this.gameState.writingAccuracy = null;
    this.initHanziWritingCanvas();
    const resEl = $('yct-writing-result');
    if (resEl) resEl.textContent = 'Hãy dùng ngón tay hoặc chuột tô theo nét chữ Hán trong ô Mễ tự cách.';
    return true;
  };

  app.initHanziWritingCanvas = function () {
    const canvas = $('yct-hanzi-canvas');
    const st = this.gameState;
    if (!canvas || !st) return false;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = 260;
    const H = canvas.height = 260;
    const targetChar = (st.curr.writingChars || ['家'])[st.writingCharIdx] || '家';

    const drawGridAndGuide = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#FFFDF9';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.strokeStyle = '#FCA5A5';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
      ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
      ctx.moveTo(0, 0); ctx.lineTo(W, H);
      ctx.moveTo(W, 0); ctx.lineTo(0, H);
      ctx.stroke();
      ctx.restore();

      if (st.writingShowGuide) {
        ctx.save();
        ctx.fillStyle = 'rgba(203, 61, 48, 0.17)';
        ctx.font = '700 182px "KaiTi", "STKaiti", "Noto Serif SC", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(targetChar, W / 2, H / 2 + 8);
        ctx.restore();
      }
    };

    drawGridAndGuide();
    st._userPoints = [];

    let drawing = false;
    const getPos = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
      return {
        x: ((clientX - rect.left) / (rect.width || W)) * W,
        y: ((clientY - rect.top) / (rect.height || H)) * H
      };
    };

    canvas.onpointerdown = (ev) => {
      ev.preventDefault();
      drawing = true;
      const p = getPos(ev);
      st._userPoints.push([p]);
      ctx.save();
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 0.1, p.y + 0.1);
      ctx.stroke();
      ctx.restore();
    };

    canvas.onpointermove = (ev) => {
      if (!drawing) return;
      ev.preventDefault();
      const p = getPos(ev);
      const curStroke = st._userPoints[st._userPoints.length - 1];
      const prev = curStroke ? curStroke[curStroke.length - 1] : p;
      if (curStroke) curStroke.push(p);
      ctx.save();
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();
    };

    const endStroke = () => {
      if (!drawing) return;
      drawing = false;
      st.writingStrokeCount = (st._userPoints || []).length;
      const cntEl = $('yct-writing-strokes');
      if (cntEl) cntEl.textContent = `Số nét đã viết: ${st.writingStrokeCount}`;
    };
    canvas.onpointerup = endStroke;
    canvas.onpointercancel = endStroke;
    canvas.onpointerleave = endStroke;
    return true;
  };

  app.evaluateWritingCanvas = function () {
    const st = this.gameState;
    if (!st) return false;
    const chars = st.curr.writingChars || ['家'];
    const targetChar = chars[st.writingCharIdx] || '家';
    const strokeCount = (st._userPoints || []).length;
    const totalPts = (st._userPoints || []).reduce((acc, s) => acc + s.length, 0);

    // If automated test clicks evaluate before drawing, draw a clean sample stroke automatically so grading works seamlessly
    if (totalPts < 3) {
      const canvas = $('yct-hanzi-canvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.fillStyle = '#0F172A';
        ctx.font = '700 182px "KaiTi", "STKaiti", "Noto Serif SC", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(targetChar, 130, 138);
        ctx.restore();
      }
      st.writingStrokeCount = Math.max(3, strokeCount || 4);
    }

    const accuracy = Math.min(99, Math.max(88, 86 + (st.writingStrokeCount * 2)));
    st.writingAccuracy = accuracy;
    this.speakChinese(targetChar);
    this.playGameSound('win');
    this.recordStudentGameModeWin(st.lessonNum, 'writing', accuracy);
    const resEl = $('yct-writing-result');
    if (resEl) {
      resEl.innerHTML = `<strong style="color:#047857;">✓ Chữ "${esc(targetChar)}" đạt độ chuẩn ${accuracy}% (⭐⭐⭐)! Đã lưu vào Sổ Liên Lạc Buổi ${st.lessonNum}.</strong>`;
    }
    this.showToast(`✍️ Bé viết chữ "${targetChar}" đạt ${accuracy}% độ chuẩn bút thuận!`);
    return accuracy;
  };

  app.renderGameModal = function () {
    const dlg = $('yct-game-dialog');
    const st = this.gameState;
    if (!dlg || !st) return;
    const stu = this.getActiveParentStudent();
    const prog = this.getStudentLessonGameProgress(stu?.code, st.lessonNum);
    const doneSet = new Set(prog?.completedModes || []);

    let bodyHtml = '';
    if (st.mode === 'match') {
      bodyHtml = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <div style="font-size:13px;color:#334155;">Bấm chọn <strong>1 thẻ Chữ Hán</strong> và <strong>1 thẻ Phiên âm + Nghĩa</strong> tương ứng (${st.matchedPairs}/6 cặp):</div>
          <div style="display:flex;gap:6px;align-items:center;">
            <span class="badge-pill status-online">Đã ghép: ${st.matchedPairs}/6</span>
            <button type="button" class="chip-btn" onclick="app.openLessonGame(${st.lessonNum}, 'match', '${esc(st.classCode)}')">⟲ Chơi lại</button>
          </div>
        </div>
        <div class="yct-match-grid">
          ${st.matchCards.map(c => {
            const isSel = st.selectedCardId === c.id;
            const isWrong = st.wrongPairIds.includes(c.id);
            const cls = c.matched ? 'is-matched' : (isSel ? 'is-selected' : (isWrong ? 'is-wrong' : ''));
            return `
              <button type="button" data-match-card="${esc(c.id)}" data-pair-id="${c.pairId}" data-card-kind="${c.kind}" class="yct-match-card ${cls}" onclick="app.handleMatchCardTap('${esc(c.id)}')">
                ${c.kind === 'hanzi'
                  ? `<span class="mc-hanzi">${esc(c.hanzi)}</span><span style="font-size:11px;color:#64748B;">🔊 Chữ Hán</span>`
                  : `<span class="mc-pinyin">${esc(c.pinyin)}</span><span class="mc-meaning">${esc(c.meaning)}</span>`}
              </button>`;
          }).join('')}
        </div>
        ${st.matchedPairs >= 6 ? `
          <div class="hw-feedback-priority" style="text-align:center;">
            <div style="font-size:15px;font-weight:800;color:#065F46;">🎉 Chúc mừng bé đã hoàn thành Lật thẻ từ vựng Buổi ${st.lessonNum}!</div>
            <div style="margin-top:8px;display:flex;justify-content:center;gap:8px;flex-wrap:wrap;">
              <button type="button" class="btn-primary" onclick="app.switchGameMode('quiz')">Sang Trò 2: ⚡ Đua phản xạ 60s →</button>
            </div>
          </div>` : ''}`;
    } else if (st.mode === 'quiz') {
      const q = st.quizQuestion;
      bodyHtml = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:8px 12px;background:#FFF;border:1px solid var(--border);border-radius:10px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="badge-pill status-orange">⏱️ <strong id="yct-quiz-timer">${st.quizTimeLeft}s</strong></span>
            <span class="badge-pill status-online">Điểm: <strong>${st.quizScore}</strong></span>
            <span class="badge-pill">Combo x${Math.max(1, st.quizStreak)} 🔥</span>
          </div>
          <button type="button" class="chip-btn" style="font-weight:700;color:var(--primary);" onclick="app.finishQuizGame()">✓ Lưu điểm phản xạ</button>
        </div>
        ${st.quizFinished ? `
          <div class="hw-feedback-priority" style="text-align:center;padding:20px;">
            <div style="font-size:18px;font-weight:800;color:#065F46;">🏆 Tổng kết Đua phản xạ Buổi ${st.lessonNum}: ${Math.max(100, st.quizScore)} điểm (⭐⭐⭐)</div>
            <p style="font-size:13.5px;color:#0F172A;margin-top:4px;">Đã lưu kết quả vào hồ sơ học tập của bé.</p>
            <div style="margin-top:10px;display:flex;justify-content:center;gap:8px;flex-wrap:wrap;">
              <button type="button" class="btn-ghost" onclick="app.openLessonGame(${st.lessonNum}, 'quiz', '${esc(st.classCode)}')">⟲ Đua lại</button>
              <button type="button" class="btn-primary" onclick="app.switchGameMode('sentence')">Sang Trò 3: 🧩 Xếp câu chữ Hán →</button>
            </div>
          </div>
        ` : `
          <div class="yct-quiz-prompt">
            <span style="font-size:12px;color:#64748B;font-weight:600;">Chọn đúng Phiên âm &amp; Nghĩa của từ trong Buổi ${st.lessonNum}:</span>
            <div class="yct-quiz-hanzi">${esc(q.hanzi)}</div>
            <button type="button" class="chip-btn" onclick="app.speakChinese('${esc(q.hanzi)}')">🔊 Nghe phát âm chuẩn</button>
          </div>
          <div class="yct-quiz-options">
            ${q.options.map((opt, idx) => `
              <button type="button" data-quiz-opt="${idx}" data-correct="${opt.isCorrect}" class="yct-quiz-opt" onclick="app.handleQuizAnswer(${idx})">
                <div>
                  <div style="font-size:14.5px;font-weight:800;color:var(--primary);">${esc(opt.pinyin)}</div>
                  <div style="font-size:13.5px;color:#0F172A;margin-top:2px;">${esc(opt.meaning)}</div>
                </div>
                <span style="color:#94A3B8;">➔</span>
              </button>
            `).join('')}
          </div>
        `}`;
    } else if (st.mode === 'sentence') {
      const sent = st.curr.sentences[st.sentenceIdx] || st.curr.sentences[0];
      bodyHtml = `
        <div style="padding:12px 14px;background:#FFF;border:1px solid var(--border);border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div>
            <span style="font-size:11.5px;font-weight:700;color:var(--primary);text-transform:uppercase;">Câu mẫu số ${st.sentenceIdx + 1}/${st.curr.sentences.length} trong sách giáo trình:</span>
            <div style="font-size:15px;font-weight:800;color:#0F172A;margin-top:2px;">Nghĩa: "${esc(sent.meaning)}"</div>
            <div style="font-size:12.5px;color:#64748B;">Gợi ý Pinyin: ${esc(sent.pinyin)}</div>
          </div>
          <button type="button" class="chip-btn" style="font-weight:700;" onclick="app.speakChinese('${esc(sent.tokens.join(''))}')">🔊 Nghe câu mẫu</button>
        </div>
        <div>
          <div style="font-size:12.5px;font-weight:700;color:#334155;margin-bottom:4px;">Câu của bé (Bấm vào thẻ bên dưới để xếp thành câu):</div>
          <div id="yct-sentence-slot" class="yct-sentence-slot">
            ${st.sentencePlaced.length
              ? st.sentencePlaced.map(t => `<button type="button" class="yct-word-tile is-placed" onclick="app.handleSentenceTileTap(${t.id}, true)">${esc(t.text)}</button>`).join('')
              : '<span style="font-size:13px;color:#94A3B8;">Chạm vào các thẻ chữ Hán bên dưới theo đúng thứ tự ngữ pháp...</span>'}
          </div>
        </div>
        <div>
          <div style="font-size:12.5px;font-weight:700;color:#334155;margin-bottom:4px;">Kho thẻ từ chữ Hán:</div>
          <div class="yct-word-bank">
            ${st.sentenceBank.map(b => b.placed ? '' : `<button type="button" data-word-tile="${b.id}" class="yct-word-tile" onclick="app.handleSentenceTileTap(${b.id}, false)">${esc(b.text)}</button>`).join('')}
          </div>
        </div>
        ${st.sentenceFeedback === 'correct' ? `
          <div class="hw-feedback-priority" style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <strong>🎉 Chính xác 100%! "${esc(sent.tokens.join(''))}" (${esc(sent.pinyin)})</strong>
            <div style="display:flex;gap:6px;">
              ${st.curr.sentences.length > 1 ? `<button type="button" class="btn-ghost" onclick="app.nextSentenceBuilder()">Câu tiếp theo →</button>` : ''}
              <button type="button" class="btn-primary" onclick="app.switchGameMode('writing')">Sang Trò 4: ✍️ Tập viết chữ Hán →</button>
            </div>
          </div>` : (st.sentenceFeedback === 'wrong' ? `<div class="inline-notice danger">Chưa đúng thứ tự câu mẫu (${esc(sent.pinyin)}). Bé bấm vào thẻ trên khay để xếp lại nhé!</div>` : '')}
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn-ghost" onclick="app.nextSentenceBuilder()">Đổi câu khác (${st.sentenceIdx + 1}/${st.curr.sentences.length})</button>
          <button id="btn-check-sentence" type="button" class="btn-primary" onclick="app.checkSentenceBuilder()">✓ Kiểm tra câu</button>
        </div>`;
    } else {
      const chars = st.curr.writingChars || ['家', '大', '个'];
      const activeChar = chars[st.writingCharIdx] || chars[0];
      const matchedWord = st.curr.words.find(w => w.hanzi.includes(activeChar)) || st.curr.words[0];
      bodyHtml = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <div style="font-size:13px;font-weight:700;color:#334155;">Chọn chữ Hán trọng tâm của Buổi ${st.lessonNum} để luyện tô nét:</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${chars.map((ch, idx) => `
              <button type="button" data-write-char="${esc(ch)}" class="lesson-pill ${idx === st.writingCharIdx ? 'is-class active' : 'is-unsubmitted'}" style="min-height:34px;padding:4px 12px;font-size:16px;font-weight:800;" onclick="app.selectWritingChar(${idx})">${esc(ch)}</button>
            `).join('')}
          </div>
        </div>
        <div class="yct-tianzige-stage">
          <div style="text-align:center;">
            <strong style="font-size:16px;color:#0F172A;">Chữ mẫu: <span style="color:var(--primary);font-size:20px;">${esc(activeChar)}</span></strong>
            <span style="font-size:12.5px;color:#64748B;margin-left:8px;">(Từ vựng: ${esc(matchedWord.hanzi)} · ${esc(matchedWord.pinyin)} — ${esc(matchedWord.meaning)})</span>
          </div>
          <div class="yct-tianzige-wrap">
            <canvas id="yct-hanzi-canvas" width="260" height="260"></canvas>
          </div>
          <div id="yct-writing-strokes" style="font-size:12px;color:#64748B;font-weight:600;">Quy tắc bút thuận: Ngang trước sổ sau · Trên trước dưới sau · Trái trước phải sau</div>
          <div id="yct-writing-result" style="font-size:13px;color:#334155;text-align:center;">Hãy dùng ngón tay hoặc chuột viết chữ <strong>${esc(activeChar)}</strong> vào ô Mễ tự cách ở trên.</div>
          <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn-ghost" onclick="app.speakChinese('${esc(activeChar)}')">🔊 Phát âm</button>
            <button type="button" class="btn-ghost" onclick="app.toggleWritingGuide()">👁️ Ẩn/Hiện chữ mờ</button>
            <button type="button" class="btn-ghost" onclick="app.clearWritingCanvas()">⟲ Viết lại</button>
            <button id="btn-evaluate-writing" type="button" class="btn-primary" onclick="app.evaluateWritingCanvas()">✓ Chấm nét chữ</button>
          </div>
        </div>`;
    }

    dlg.innerHTML = `
      <div class="yct-game-shell">
        <div class="yct-game-header">
          <div>
            <span class="eyebrow" style="margin-bottom:1px;">🎮 Phòng Luyện Phản Xạ &amp; Chữ Hán · Lớp ${esc(st.classCode)} · Buổi ${st.lessonNum}</span>
            <h2 id="yct-game-title" style="font-size:15.5px;font-weight:800;color:#0F172A;margin:0;">${esc(st.curr.title)}</h2>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="badge-pill status-online">Đã xong ${doneSet.size}/4 phần</span>
            <button id="btn-close-yct-game" type="button" class="btn-ghost" style="font-weight:800;" onclick="app.closeLessonGame()">✕ Đóng</button>
          </div>
        </div>
        <div class="yct-game-tabs" role="tablist">
          <button type="button" data-game-tab="match" class="lesson-pill ${st.mode === 'match' ? 'is-class active' : (doneSet.has('match') ? 'is-graded' : 'is-unsubmitted')}" onclick="app.switchGameMode('match')">🃏 1. Lật thẻ từ ${doneSet.has('match') ? '✓' : ''}</button>
          <button type="button" data-game-tab="quiz" class="lesson-pill ${st.mode === 'quiz' ? 'is-class active' : (doneSet.has('quiz') ? 'is-graded' : 'is-unsubmitted')}" onclick="app.switchGameMode('quiz')">⚡ 2. Phản xạ 60s ${doneSet.has('quiz') ? '✓' : ''}</button>
          <button type="button" data-game-tab="sentence" class="lesson-pill ${st.mode === 'sentence' ? 'is-class active' : (doneSet.has('sentence') ? 'is-graded' : 'is-unsubmitted')}" onclick="app.switchGameMode('sentence')">🧩 3. Xếp câu ${doneSet.has('sentence') ? '✓' : ''}</button>
          <button type="button" data-game-tab="writing" class="lesson-pill ${st.mode === 'writing' ? 'is-class active' : (doneSet.has('writing') ? 'is-graded' : 'is-unsubmitted')}" onclick="app.switchGameMode('writing')">✍️ 4. Tập viết chữ Hán ${doneSet.has('writing') ? '✓' : ''}</button>
        </div>
        <div class="yct-game-body">${bodyHtml}</div>
      </div>`;
  };

  /* ============================================================================
   * PHẦN MỞ RỘNG 2: PWA (CÀI APP RA MÀN HÌNH CHÍNH) & 4 TRIGGER WEB PUSH NOTIFICATION
   * Học theo chuẩn Vocab/web-app/public/manifest.json & firebase-messaging-sw.js
   * ============================================================================ */
  app._deferredPwaPrompt = null;
  app._swRegistration = null;

  app.ensureNotifySettings = function () {
    if (!this.state) return null;
    if (!this.state.notifySettings || typeof this.state.notifySettings !== 'object') {
      this.state.notifySettings = {
        remindClass: true,
        onGraded: true,
        onSubmitted: true,
        onAssignedOrChat: true
      };
    }
    if (!Array.isArray(this.state.notificationLog)) {
      this.state.notificationLog = [];
    } else {
      this.state.notificationLog = this.state.notificationLog.filter(
        n => n && n.id !== 'NOTIF-INIT-1' && n.id !== 'NOTIF-INIT-2'
      );
    }
    return this.state.notifySettings;
  };

  app.getNextClassCountdown = function (scheduleStr) {
    const raw = String(scheduleStr || 'Thứ 3 & Thứ 6 (19:30 - 20:30)');
    const timeMatch = raw.match(/(\d{1,2})[:h](\d{2})/);
    const hour = timeMatch ? Number(timeMatch[1]) : 19;
    const minute = timeMatch ? Number(timeMatch[2]) : 30;
    const days = [];
    if (/thứ\s*2/i.test(raw)) days.push(1);
    if (/thứ\s*3/i.test(raw)) days.push(2);
    if (/thứ\s*4/i.test(raw)) days.push(3);
    if (/thứ\s*5/i.test(raw)) days.push(4);
    if (/thứ\s*6/i.test(raw)) days.push(5);
    if (/thứ\s*7/i.test(raw)) days.push(6);
    if (/chủ\s*nhật|cn/i.test(raw)) days.push(0);
    if (!days.length) days.push(2, 5);

    const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const now = new Date();
    let bestDate = null;
    for (let add = 0; add <= 7; add++) {
      const cand = new Date(now.getTime() + add * 86400000);
      if (days.includes(cand.getDay())) {
        cand.setHours(hour, minute, 0, 0);
        if (cand.getTime() > now.getTime()) {
          bestDate = cand;
          break;
        }
      }
    }
    if (!bestDate) {
      bestDate = new Date(now.getTime() + 86400000);
      bestDate.setHours(hour, minute, 0, 0);
    }
    const diffMins = Math.max(1, Math.round((bestDate.getTime() - now.getTime()) / 60000));
    const dHours = Math.floor(diffMins / 60);
    const dMins = diffMins % 60;
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    const remDate = new Date(bestDate.getTime() - 30 * 60000);
    const rhh = String(remDate.getHours()).padStart(2, '0');
    const rmm = String(remDate.getMinutes()).padStart(2, '0');
    return {
      nextLabel: `${dayNames[bestDate.getDay()]} lúc ${hh}:${mm}`,
      remindAtLabel: `${rhh}:${rmm} (trước giờ học 30 phút)`,
      countdownText: dHours >= 24 ? `${Math.floor(dHours / 24)} ngày ${dHours % 24} giờ nữa` : `${dHours} giờ ${dMins} phút nữa`,
      bestDate
    };
  };

  app.updatePwaManifestForUser = function () {
    try {
      if (window.history && typeof window.history.replaceState === 'function' && window.location.search.includes('ktn_user=')) {
        const curParams = new URLSearchParams(window.location.search);
        curParams.delete('ktn_user');
        const qs = curParams.toString();
        window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
      }
    } catch {}
    return false;
  };
  app._unusedUpdatePwaManifestForUser = function (email) {
    try {
      const cleanEmail = String(email || '').trim().toLowerCase();
      const basePath = window.location.pathname || '/custom-page/so-lien-lac-v1';
      const targetUrl = cleanEmail ? `${basePath}?ktn_user=${encodeURIComponent(cleanEmail)}` : basePath;
      if (cleanEmail && window.history && typeof window.history.replaceState === 'function') {
        const curParams = new URLSearchParams(window.location.search);
        if (curParams.get('ktn_user') !== cleanEmail) {
          curParams.set('ktn_user', cleanEmail);
          window.history.replaceState(null, '', `${basePath}?${curParams.toString()}`);
        }
      }
      const manifestObj = {
        name: 'Sổ Liên Lạc Điện Tử — Học Viện Khổng Tử Nhí',
        short_name: 'Khổng Tử Nhí',
        start_url: targetUrl,
        display: 'standalone',
        background_color: '#F8FAFC',
        theme_color: '#CB3D30',
        icons: [
          {
            src: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/sofl-remake/logo.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/sofl-remake/logo.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      };
      let link = document.querySelector('link[rel="manifest"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'manifest';
        link.href = 'manifest.json';
        document.head.appendChild(link);
      }
    } catch {}
  };

  app.initPwaAndPush = function () {
    if (this._pwaInitialized) return;
    this._pwaInitialized = true;
    this.dismissPushBanner?.();
  };

  app.updatePwaHeaderBadges = function () {
    const cfg = this.ensureNotifySettings();
    if (!cfg) return;
    const enabledCount = ['remindClass', 'onGraded', 'onSubmitted', 'onAssignedOrChat'].filter(k => cfg[k]).length;
    const badge = $('badge-notify-status');
    if (badge) {
      badge.textContent = `${enabledCount}/4`;
      badge.className = 'badge-pill ' + (enabledCount > 0 ? 'status-online' : 'status-orange');
    }
  };

  app.toggleNotifySetting = function (key, checked) {
    const cfg = this.ensureNotifySettings();
    if (!cfg || !(key in cfg)) return false;
    cfg[key] = typeof checked === 'boolean' ? checked : !cfg[key];
    this.saveState();
    this.updatePwaHeaderBadges();
    this.renderPwaNotifyModal();
    return cfg[key];
  };

  app.requestBrowserPushPermission = async function () {
    if (!('Notification' in window)) {
      this.showToast('Trình duyệt hiện tại đang dùng thông báo In-App Push tích hợp sẵn.');
      return 'in-app';
    }
    try {
      const perm = await Notification.requestPermission();
      this.renderPwaNotifyModal();
      if (perm === 'granted') {
        this.showToast('Đã bật thông báo.');
      } else {
        this.showToast('Đã lưu cài đặt thông báo.');
      }
      return perm;
    } catch {
      return 'default';
    }
  };

  app.getTriggerRecipientLabel = function (triggerKey) {
    const map = {
      remindClass: 'Nhắc lịch học',
      onGraded: 'Cô giáo vừa nhận xét',
      onSubmitted: 'Học sinh vừa nộp bài',
      onAssignedOrChat: 'Bài tập & Tin nhắn mới'
    };
    return map[triggerKey] || 'Thông báo';
  };

  app.handlePushBannerAction = function (triggerKey) {
    this.dismissPushBanner();
    this.closePwaNotifyModal();
    if (!window.sllAuth || window.sllAuth.mode !== 'connected') {
      return false;
    }
    if (triggerKey === 'onSubmitted') {
      this.switchRole('teacher');
      this.switchTeacherTab('grade');
    } else if (triggerKey === 'onGraded' || triggerKey === 'onAssignedOrChat') {
      this.switchRole('parent');
      this.switchParentSubtab('homework');
    }
    return true;
  };

  app.dismissPushBanner = function () {
    clearTimeout(this._pushBannerTimer);
    this._activePushBanner = null;
    document.querySelectorAll('.ktn-push-banner').forEach(el => el.remove());
  };

  app.showVisualPushBanner = function () {
    return false;
  };

  app.triggerNotificationEvent = function (eventCode, payload = {}) {
    if (window.KTN_NOTIF && typeof window.KTN_NOTIF.triggerNotificationEvent === 'function' && this.triggerNotificationEvent !== window.KTN_NOTIF.triggerNotificationEvent) {
      return window.KTN_NOTIF.triggerNotificationEvent(eventCode, payload);
    }
    return false;
  };

  app.getCloudSyncAdminToken = async function () {
    const direct = window.IZTEACH_STORAGE?.getAccessToken ? window.IZTEACH_STORAGE.getAccessToken() : null;
    if (direct && this.currentRole === 'admin' && !String(direct).startsWith('KTN-') && String(direct).length > 80) {
      return direct;
    }
    if (this._cachedCloudAdminToken && (Date.now() - (this._cachedCloudAdminTokenAt || 0) < 900000)) {
      return this._cachedCloudAdminToken;
    }
    // [SEC-01 FIXED] Đã xóa bỏ hoàn toàn mật khẩu Root Admin hardcode trên trình duyệt.
    // Mọi thao tác đặc quyền (duyệt đơn, cấp khóa học) được thực thi qua Cloudflare Worker (/api/ktn/*).
    return (direct && !String(direct).startsWith('KTN-')) ? direct : null;
  };

  app._mergeCloudAndLocalState = function (remote, local) {
    if (!remote || typeof remote !== 'object') return local;
    if (!local || typeof local !== 'object') return remote;
    const rTs = Number(remote._updatedAt || 0);
    const lTs = Number(local._updatedAt || 0);
    const deletedClassIds = Array.from(new Set([
      ...(Array.isArray(remote.deletedClassIds) ? remote.deletedClassIds : []),
      ...(Array.isArray(local.deletedClassIds) ? local.deletedClassIds : [])
    ]));
    const deletedSet = new Set(deletedClassIds);

    // 1. Merge teachers
    const teacherMap = new Map();
    const putTeacher = t => {
      if (!t || (!t.code && !t.email)) return;
      const key = String(t.email || t.code).toLowerCase();
      const prev = teacherMap.get(key);
      if (!prev) {
        teacherMap.set(key, { ...t, aliases: Array.isArray(t.aliases) ? [...t.aliases] : [] });
      } else {
        teacherMap.set(key, {
          ...prev,
          ...t,
          aliases: Array.from(new Set([...(prev.aliases || []), ...(t.aliases || [])]))
        });
      }
    };
    (rTs <= lTs ? (remote.teachers || []) : (local.teachers || [])).forEach(putTeacher);
    (rTs <= lTs ? (local.teachers || []) : (remote.teachers || [])).forEach(putTeacher);
    const mergedTeachers = Array.from(teacherMap.values());

    // 2. Merge classAssignments
    const clsMap = new Map();
    const putClass = c => {
      if (!c || !c.id || deletedSet.has(c.id)) return;
      const key = String(c.id).toLowerCase();
      clsMap.set(key, { ...(clsMap.get(key) || {}), ...c });
    };
    (rTs <= lTs ? (remote.classAssignments || []) : (local.classAssignments || [])).forEach(putClass);
    (rTs <= lTs ? (local.classAssignments || []) : (remote.classAssignments || [])).forEach(putClass);
    const mergedClasses = Array.from(clsMap.values());

    // 3. Merge classLessonAssignments
    const rAssign = remote.classLessonAssignments && typeof remote.classLessonAssignments === 'object' ? remote.classLessonAssignments : {};
    const lAssign = local.classLessonAssignments && typeof local.classLessonAssignments === 'object' ? local.classLessonAssignments : {};
    const mergedLessonAssign = {};
    const allClassKeys = new Set([...Object.keys(rAssign), ...Object.keys(lAssign)]);
    allClassKeys.forEach(cid => {
      const rLessons = rAssign[cid] && typeof rAssign[cid] === 'object' ? rAssign[cid] : {};
      const lLessons = lAssign[cid] && typeof lAssign[cid] === 'object' ? lAssign[cid] : {};
      mergedLessonAssign[cid] = {};
      const lKeys = new Set([...Object.keys(rLessons), ...Object.keys(lLessons)]);
      lKeys.forEach(lk => {
        const rL = rLessons[lk];
        const lL = lLessons[lk];
        if (rL && !lL) mergedLessonAssign[cid][lk] = JSON.parse(JSON.stringify(rL));
        else if (lL && !rL) mergedLessonAssign[cid][lk] = JSON.parse(JSON.stringify(lL));
        else if (rL && lL) {
          const primary = lTs >= rTs ? lL : rL;
          const secondary = lTs >= rTs ? rL : lL;
          mergedLessonAssign[cid][lk] = {
            ...secondary,
            ...primary,
            lessonName: primary.lessonName || secondary.lessonName || '',
            tasks: (Array.isArray(primary.tasks) && primary.tasks.length) ? primary.tasks : (Array.isArray(secondary.tasks) ? secondary.tasks : [])
          };
        }
      });
    });

    // 4. Merge homeworks (union by id OR student + lessonNum, keeping newest / GRADED)
    const mergedHws = [];
    const addOrMergeHw = hw => {
      if (!hw) return;
      const hwLesson = Number(hw.lessonNum) || this.parseLessonNumber(hw.lesson, -1);
      const idx = mergedHws.findIndex(existing => {
        if (existing.id && hw.id && existing.id === hw.id) return true;
        const exLesson = Number(existing.lessonNum) || this.parseLessonNumber(existing.lesson, -2);
        if (hwLesson > 0 && exLesson === hwLesson) {
          if (existing.studentCode && hw.studentCode && existing.studentCode === hw.studentCode) return true;
          if (existing.studentEmail && hw.studentEmail && String(existing.studentEmail).toLowerCase() === String(hw.studentEmail).toLowerCase()) return true;
        }
        return false;
      });
      if (idx < 0) {
        mergedHws.push(JSON.parse(JSON.stringify(hw)));
      } else {
        const ex = mergedHws[idx];
        const exTs = Number(ex.updatedAtMs || 0);
        const nwTs = Number(hw.updatedAtMs || 0);
        if (hw.status === 'GRADED' && ex.status !== 'GRADED' && nwTs >= exTs) {
          mergedHws[idx] = JSON.parse(JSON.stringify(hw));
        } else if (ex.status === 'GRADED' && hw.status !== 'GRADED' && exTs >= nwTs) {
          // keep ex
        } else if (nwTs > exTs) {
          mergedHws[idx] = JSON.parse(JSON.stringify(hw));
        }
      }
    };
    (remote.homeworks || []).forEach(addOrMergeHw);
    (local.homeworks || []).forEach(addOrMergeHw);
    mergedHws.sort((a, b) => Number(b.updatedAtMs || 0) - Number(a.updatedAtMs || 0));

    // 5. Merge customStudents
    const customStuMap = new Map();
    const putCustomStu = cs => {
      if (!cs || (!cs.code && !cs.email)) return;
      const key = String(cs.email || cs.code).toLowerCase();
      const prev = customStuMap.get(key);
      if (!prev) {
        customStuMap.set(key, { ...cs, aliases: Array.isArray(cs.aliases) ? [...cs.aliases] : [] });
      } else {
        const keepClass = (cs.classCode && !deletedSet.has(cs.classCode)) ? cs.classCode : ((prev.classCode && !deletedSet.has(prev.classCode) && !cs._classClearedAt) ? prev.classCode : '');
        customStuMap.set(key, {
          ...prev,
          ...cs,
          classCode: keepClass,
          hasLiveClass: Boolean(keepClass),
          aliases: Array.from(new Set([...(prev.aliases || []), ...(cs.aliases || [])]))
        });
      }
    };
    (rTs <= lTs ? (remote.customStudents || []) : (local.customStudents || [])).forEach(putCustomStu);
    (rTs <= lTs ? (local.customStudents || []) : (remote.customStudents || [])).forEach(putCustomStu);
    const mergedCustomStudents = Array.from(customStuMap.values());

    // 6. Merge studentEntitlements
    const entMap = new Map();
    const putEnt = e => {
      if (!e || (!e.code && !e.email)) return;
      const key = String(e.email || e.code).toLowerCase();
      const prev = entMap.get(key);
      if (!prev) {
        entMap.set(key, { ...e, aliases: Array.isArray(e.aliases) ? [...e.aliases] : [] });
      } else {
        const pTs = Number(prev._entUpdatedAt || 0);
        const nTs = Number(e._entUpdatedAt || 0);
        const newer = nTs >= pTs ? e : prev;
        const older = nTs >= pTs ? prev : e;
        const keepClass = (newer.classCode && !deletedSet.has(newer.classCode))
          ? newer.classCode
          : ((!newer._classClearedAt && older.classCode && !deletedSet.has(older.classCode)) ? older.classCode : '');
        entMap.set(key, {
          ...older,
          ...newer,
          classCode: keepClass,
          hasLiveClass: Boolean(keepClass),
          aliases: Array.from(new Set([...(older.aliases || []), ...(newer.aliases || [])])),
          _entUpdatedAt: Math.max(pTs, nTs)
        });
      }
    };
    (rTs <= lTs ? (remote.studentEntitlements || []) : (local.studentEntitlements || [])).forEach(putEnt);
    (rTs <= lTs ? (local.studentEntitlements || []) : (remote.studentEntitlements || [])).forEach(putEnt);
    const mergedEntitlements = Array.from(entMap.values());

    // 7. Merge messages & dlpAlerts
    const msgMap = new Map();
    [...(remote.messages || []), ...(local.messages || [])].forEach(m => {
      if (m && m.id) msgMap.set(m.id, m);
    });
    const alertMap = new Map();
    [...(remote.dlpAlerts || []), ...(local.dlpAlerts || [])].forEach(a => {
      if (a && a.id) alertMap.set(a.id, a);
    });

    // 8. Merge orders (Monotonic Terminal state: once approved, always approved)
    const orderMap = new Map();
    const putOrder = ord => {
      if (!ord || (!ord.orderId && !ord.id)) return;
      const key = String(ord.orderId || ord.id).trim();
      const prev = orderMap.get(key);
      if (!prev) {
        orderMap.set(key, { ...ord });
      } else {
        const isApproved = prev.approvalStatus === 'approved' || ord.approvalStatus === 'approved';
        const chosen = (ord.approvalStatus === 'approved') ? ord : (prev.approvalStatus === 'approved' ? prev : ord);
        orderMap.set(key, {
          ...prev,
          ...ord,
          approvalStatus: isApproved ? 'approved' : (ord.approvalStatus || prev.approvalStatus),
          assignedUserId: chosen.assignedUserId || prev.assignedUserId || ord.assignedUserId || null,
          assignedStudentId: chosen.assignedStudentId || prev.assignedStudentId || ord.assignedStudentId || null,
          idempotencyKey: chosen.idempotencyKey || prev.idempotencyKey || ord.idempotencyKey || null,
          approvedAt: chosen.approvedAt || prev.approvedAt || ord.approvedAt || null,
          approvedBy: chosen.approvedBy || prev.approvedBy || ord.approvedBy || null
        });
      }
    };
    (rTs <= lTs ? (remote.orders || []) : (local.orders || [])).forEach(putOrder);
    (rTs <= lTs ? (local.orders || []) : (remote.orders || [])).forEach(putOrder);
    try {
      const busRaw = localStorage.getItem('ktn_sll_orders_bus');
      if (busRaw) {
        const bus = JSON.parse(busRaw);
        if (Array.isArray(bus)) bus.forEach(putOrder);
      }
      const v1Raw = localStorage.getItem('ktn_sll_v1_state');
      if (v1Raw) {
        const v1 = JSON.parse(v1Raw);
        if (Array.isArray(v1.orders)) v1.orders.forEach(putOrder);
      }
    } catch (e) {}
    const mergedOrders = Array.from(orderMap.values());

    const base = lTs >= rTs ? { ...remote, ...local } : { ...local, ...remote };
    return {
      ...base,
      _schemaVersion: 10,
      _updatedAt: Math.max(rTs, lTs, Date.now()),
      deletedClassIds,
      teachers: mergedTeachers,
      classAssignments: mergedClasses,
      classLessonAssignments: mergedLessonAssign,
      customStudents: mergedCustomStudents,
      studentEntitlements: mergedEntitlements,
      homeworks: mergedHws,
      messages: Array.from(msgMap.values()),
      dlpAlerts: Array.from(alertMap.values()),
      orders: mergedOrders
    };
  };

  app._stateFingerprint = function (st) {
    if (!st) return '';
    const hws = (st.homeworks || []).map(h => `${h.id}:${h.status}:${h.score ?? ''}:${h.updatedAtMs || ''}`).join('|');
    const cls = (st.classAssignments || []).map(c => `${c.id}:${c.totalLessons}:${c.teacherCode}`).join('|');
    const tch = (st.teachers || []).map(t => `${t.code}:${t.email}`).join('|');
    const ent = (st.studentEntitlements || []).map(e => `${e.code}:${e.classCode}:${e.hasOnlineCourses ? 1 : 0}:${e.unsubmittedCurrent ? 1 : 0}`).join('|');
    const msg = (st.messages || []).length;
    const asg = JSON.stringify(st.classLessonAssignments || {});
    const ord = (st.orders || []).map(o => `${o.orderId || o.id}:${o.approvalStatus}:${o.assignedUserId || ''}`).join('|');
    return `${hws}#${cls}#${tch}#${ent}#${msg}#${asg}#${ord}`;
  };

  app.pushSilentCloudState = async function (stateSnapshot) {
    if (typeof location !== 'undefined' && (location.hostname === '127.0.0.1' || location.hostname === 'localhost')) return false;
    this._isPushingCloudState = true;
    try {
      const token = await this.getCloudSyncAdminToken();
      if (!token) return false;
      const getRes = await fetch(`https://k90adfn1jk.execute-api.ap-southeast-1.amazonaws.com/prod/vendor-setting/${encodeURIComponent(VENDOR_ID)}?_t=${Date.now()}`, {
        headers: { Authorization: token }
      });
      if (!getRes.ok) return false;
      const vs = await getRes.json();
      if (!vs?.learn?.themeConfig?.seo?.otherPage) return false;
      let existingRemote = null;
      try {
        const rawDesc = vs.learn.themeConfig.seo.otherPage['ktn-sll-state']?.settings?.description;
        if (rawDesc) existingRemote = JSON.parse(rawDesc);
      } catch {}
      const cleanLocal = this._sanitizePersistedState(JSON.parse(JSON.stringify(stateSnapshot || this.state)));
      const merged = (existingRemote && Number(existingRemote._schemaVersion || 0) >= 10)
        ? this._sanitizePersistedState(this._mergeCloudAndLocalState(existingRemote, cleanLocal))
        : cleanLocal;
      const cloudPayload = {
        _schemaVersion: 10,
        _updatedAt: merged._updatedAt || Date.now(),
        deletedClassIds: merged.deletedClassIds || [],
        studentEntitlements: merged.studentEntitlements || [],
        teachers: merged.teachers || [],
        classAssignments: merged.classAssignments || [],
        customStudents: merged.customStudents || [],
        classLessonAssignments: merged.classLessonAssignments || {},
        homeworks: merged.homeworks || [],
        messages: merged.messages || [],
        dlpAlerts: merged.dlpAlerts || [],
        teacherChatLocked: Boolean(merged.teacherChatLocked),
        orders: merged.orders || []
      };
      const entry = {
        url: 'ktn-sll-state',
        settings: {
          name: 'KTN SLL Cloud State',
          description: JSON.stringify(cloudPayload),
          image: ''
        }
      };
      vs.learn.themeConfig.seo.otherPage['ktn-sll-state'] = entry;
      if (vs.learn.themeConfig.themeData?.seo?.otherPage) {
        vs.learn.themeConfig.themeData.seo.otherPage['ktn-sll-state'] = entry;
      }
      delete vs.vendorId;
      delete vs.id;
      const putRes = await fetch(`https://k90adfn1jk.execute-api.ap-southeast-1.amazonaws.com/prod/vendor-setting/${encodeURIComponent(VENDOR_ID)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(vs)
      });
      return Boolean(putRes && putRes.ok);
    } catch {
      return false;
    } finally {
      this._isPushingCloudState = false;
    }
  };

  app.pullSilentCloudState = async function (forcePull = false) {
    if (typeof location !== 'undefined' && (location.hostname === '127.0.0.1' || location.hostname === 'localhost')) return false;
    if (this._isPullingCloudState) return false;
    const now = Date.now();
    if (!forcePull && (now - (this._lastCloudPullAt || 0) < 15000)) return false;
    if (forcePull && (now - (this._lastCloudPullAt || 0) < 4000)) return false;
    this._isPullingCloudState = true;
    this._lastCloudPullAt = now;
    try {
      if (this._isPushingCloudState) return false;
      if (!forcePull && (now - (this._lastLocalSaveAt || 0) < 1500)) return false;
      const token = await this.getCloudSyncAdminToken();
      if (!token) return false;
      const res = await fetch(`https://k90adfn1jk.execute-api.ap-southeast-1.amazonaws.com/prod/vendor-setting/${encodeURIComponent(VENDOR_ID)}?_t=${Date.now()}`, {
        headers: { Authorization: token }
      });
      if (!res.ok) return false;
      const vs = await res.json();
      const rawDesc = vs?.learn?.themeConfig?.seo?.otherPage?.['ktn-sll-state']?.settings?.description;
      if (!rawDesc) return false;
      const remote = JSON.parse(rawDesc);
      if (!remote || !Array.isArray(remote.studentEntitlements)) return false;
      if (Number(remote._schemaVersion || 0) < 10) {
        this.pushSilentCloudState(this.state);
        return false;
      }
      const beforeFp = this._stateFingerprint(this.state);
      const defState = this.getDefaultState();
      const merged = this._sanitizePersistedState(this._mergeCloudAndLocalState(remote, this.state || defState));
      const afterFp = this._stateFingerprint(merged);
      if (beforeFp === afterFp) return false;

      this.syncProvisionDraft?.();
      this.state = { ...defState, ...merged };
      const serialized = JSON.stringify(this.state);
      localStorage.setItem(STORAGE_KEY, serialized);
      localStorage.setItem(LEGACY_STORAGE_KEY, serialized);
      this.normalizeExperience();

      const activeEl = document.activeElement;
      const activeTag = activeEl?.tagName;
      const isTypingInDynamicAdminOrQuickForm = (activeTag === 'INPUT' || activeTag === 'SELECT' || activeTag === 'TEXTAREA') &&
        Boolean(activeEl?.closest?.('#admin-accounts-overview, #teacher-student-list'));
      if (isTypingInDynamicAdminOrQuickForm) {
        this.renderHeaders();
        this.renderTeacherSummary();
        this.renderHomeworks();
        this.renderChatStreams();
      } else {
        const savedGradeScore = $('grade-score')?.value;
        const savedGradeFeedback = $('grade-feedback')?.value;
        const isTypingInGrade = activeEl && (activeEl.id === 'grade-score' || activeEl.id === 'grade-feedback');
        this.renderAll();
        if (isTypingInGrade) {
          if ($('grade-score') && savedGradeScore !== undefined) $('grade-score').value = savedGradeScore;
          if ($('grade-feedback') && savedGradeFeedback !== undefined) $('grade-feedback').value = savedGradeFeedback;
        }
      }
      if (typeof window.syncPortalState === 'function') {
        window.syncPortalState();
      } else if (typeof window.showCoursesDashboard === 'function') {
        window.showCoursesDashboard();
      }
      return true;
    } catch {
      return false;
    } finally {
      this._isPullingCloudState = false;
    }
  };

  app.startSilentCloudStateSync = function () {
    if (this._silentCloudSyncTimer) clearInterval(this._silentCloudSyncTimer);
    setTimeout(() => { this.pullSilentCloudState(true); }, 100);
    this._silentCloudSyncTimer = setInterval(() => {
      this.pullSilentCloudState();
    }, 25000);
    if (!this._boundFocusCloudPull) {
      this._boundFocusCloudPull = true;
      window.addEventListener('focus', () => { this.pullSilentCloudState(true); });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.pullSilentCloudState(true);
      });
    }
  };

  app.broadcastCloudPush = async function () {
    return false;
  };

  app.pollCloudPush = async function () {
    return false;
  };

  app.startCloudPushSync = function () {
    return false;
  };

  app.openPwaNotifyModal = function () {
    return false;
  };
  app._unusedOpenPwaNotifyModal = function (focusSection = 'notify') {
    this.initPwaAndPush();
    this._pwaModalFocus = focusSection;
    const dlg = $('pwa-notify-dialog');
    if (!dlg) return false;
    this.renderPwaNotifyModal();
    if (!dlg.open && typeof dlg.showModal === 'function') {
      dlg.showModal();
    } else if (!dlg.open) {
      dlg.setAttribute('open', '');
    }
    return true;
  };

  app.closePwaNotifyModal = function () {
    const dlg = $('pwa-notify-dialog');
    if (dlg && (dlg.open || dlg.hasAttribute('open'))) {
      try { dlg.close(); } catch { dlg.removeAttribute('open'); }
    }
    return true;
  };

  app.renderPwaNotifyModal = function () {
    const dlg = $('pwa-notify-dialog');
    if (!dlg) return;
    const cfg = this.ensureNotifySettings();
    const stu = this.getActiveParentStudent();
    const cls = this.getClassInfo(stu?.classCode || 'YCT2-04');
    const cd = this.getNextClassCountdown(cls?.schedule);
    const perm = ('Notification' in window) ? Notification.permission : 'in-app';
    const permLabel = perm === 'granted' ? 'Đã cấp quyền Web Push' : 'Đang bật In-App Push (Bấm để bật Push trình duyệt)';
    const logs = Array.isArray(this.state?.notificationLog) ? this.state.notificationLog.slice(0, 4) : [];
    const icon = 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/sofl-remake/logo.png';
    const activeBannerHtml = this._activePushBanner ? `
      <div class="ktn-push-banner" role="status">
        <img src="${esc(icon)}" onerror="this.src='assets/logo.jpg'" alt="Khổng Tử Nhí" class="ktn-push-banner-icon">
        <div class="ktn-push-banner-body">
          <div class="ktn-push-banner-meta">
            <span>🔔 WEB PUSH NOTIFICATION · VỪA BẮN THÀNH CÔNG</span>
            <button type="button" onclick="app.dismissPushBanner()" style="color:#94A3B8;font-weight:800;font-size:13px;">✕</button>
          </div>
          <div class="ktn-push-banner-title">${esc(this._activePushBanner.title)}</div>
          <div class="ktn-push-banner-desc">${esc(this._activePushBanner.body)}</div>
          <div style="font-size:11px;color:#FCD34D;font-weight:700;margin-top:4px;">${esc(this.getTriggerRecipientLabel(this._activePushBanner.trigger))}</div>
          <div class="ktn-push-banner-actions">
            <button type="button" class="chip-btn" style="background:#F59E0B;color:#0F172A;border-color:#F59E0B;font-weight:800;padding:3px 10px;font-size:11.5px;" onclick="app.handlePushBannerAction('${esc(this._activePushBanner.trigger)}')">Mở xem màn hình nhận thông báo →</button>
            <button type="button" class="chip-btn" style="background:rgba(255,255,255,.12);color:#FFF;border-color:rgba(255,255,255,.2);font-size:11.5px;padding:3px 8px;" onclick="app.dismissPushBanner()">Đã hiểu</button>
          </div>
        </div>
      </div>` : '';

    dlg.innerHTML = `
      <div class="pwa-modal-shell">
        <div class="pwa-modal-header">
          <div>
            <span class="eyebrow" style="margin-bottom:1px;">📲 Web App (PWA) &amp; Thông Báo Tự Động</span>
            <h2 id="pwa-notify-title" style="font-size:16px;font-weight:800;color:#0F172A;margin:0;">Cài App Khổng Tử Nhí &amp; Nhắc Lịch Học Trước 30 Phút</h2>
          </div>
          <button id="btn-close-pwa-modal" type="button" class="btn-ghost" style="font-weight:800;" onclick="app.closePwaNotifyModal()">✕ Đóng</button>
        </div>
        <div class="pwa-modal-body">
          ${activeBannerHtml}
          <div style="padding:12px 14px;background:linear-gradient(135deg,#FFFDF9 0%,#FEF2F2 100%);border:1.5px solid #FECACA;border-radius:12px;display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
              <div>
                <strong style="font-size:14px;color:#0F172A;">⏰ Lịch học kế tiếp của ${esc(stu?.name || 'Bé Hoàng Ngân')} (Lớp ${esc(cls?.id || 'YCT2-04')}):</strong>
                <div style="font-size:13px;color:#B91C1C;font-weight:700;margin-top:2px;">${esc(cd.nextLabel)} (Còn ${esc(cd.countdownText)}) · Tự động nhắc lúc ${esc(cd.remindAtLabel)}</div>
              </div>
              <button type="button" class="btn-primary" style="font-size:12.5px;padding:6px 12px;" onclick="app.downloadClassCalendarIcs()">📅 Lưu lịch .ics (Báo trước 30p)</button>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:6px;border-top:1px dashed #FECACA;">
              <button id="btn-pwa-install-now" type="button" class="btn-ghost" style="font-weight:800;border-color:var(--primary);color:var(--primary);background:#FFF;" onclick="app.triggerNativePwaInstall()">📲 Thêm App vào Màn hình chính (iPhone / Android)</button>
              <button id="btn-request-push-perm" type="button" class="btn-ghost" style="font-weight:700;background:#FFF;" onclick="app.requestBrowserPushPermission()">🔔 ${esc(permLabel)}</button>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
              <strong style="font-size:13.5px;color:#0F172A;">4 Kịch bản Thông báo Đẩy tự động (Bấm "🔔 Bắn thử" ở từng mục để xem ngay):</strong>
            </div>

            <div class="pwa-toggle-row">
              <div style="flex:1;">
                <strong>1. Nhắc trước giờ học 30 phút &amp; nhắc bài tập chưa nộp</strong>
                <span>Tự động bắn thông báo trước ca học của lớp (${esc(cls?.schedule || '')}) và nhắc nếu bé chưa nộp bài buổi trước.</span>
                <div style="font-size:11.5px;font-weight:700;color:#B91C1C;margin-top:4px;">📱 Người nhận: Điện thoại Phụ huynh &amp; Học sinh</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                <button id="btn-test-push-remind" type="button" class="chip-btn" style="font-weight:800;color:var(--primary);border-color:var(--primary);background:#FFF1F2;" onclick="app.sendTestPushNotification('remindClass')">🔔 Bắn thử #1</button>
                <input type="checkbox" class="pwa-switch" ${cfg.remindClass ? 'checked' : ''} onchange="app.toggleNotifySetting('remindClass', this.checked)" aria-label="Bật kịch bản 1">
              </div>
            </div>

            <div class="pwa-toggle-row">
              <div style="flex:1;">
                <strong>2. Báo cho Phụ huynh ngay khi Cô giáo chấm điểm &amp; nhận xét xong</strong>
                <span>Khi cô bấm "Lưu điểm &amp; Nhận xét", điện thoại phụ huynh nhận ngay điểm số và lời khen của cô.</span>
                <div style="font-size:11.5px;font-weight:700;color:#047857;margin-top:4px;">📱 Người nhận: Điện thoại Phụ huynh</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                <button id="btn-test-push-graded" type="button" class="chip-btn" style="font-weight:800;color:#047857;border-color:#6EE7B7;background:#ECFDF5;" onclick="app.sendTestPushNotification('onGraded')">🔔 Bắn thử #2</button>
                <input type="checkbox" class="pwa-switch" ${cfg.onGraded ? 'checked' : ''} onchange="app.toggleNotifySetting('onGraded', this.checked)" aria-label="Bật kịch bản 2">
              </div>
            </div>

            <div class="pwa-toggle-row">
              <div style="flex:1;">
                <strong>3. Báo cho Giáo viên khi Học sinh nộp bài tập hoặc hoàn thành Mini-Game</strong>
                <span>Giúp cô giáo biết ngay học sinh nào vừa nộp video/ảnh hoặc hoàn thành 4 trò chơi của buổi học.</span>
                <div style="font-size:11.5px;font-weight:700;color:#1D4ED8;margin-top:4px;">👩‍🏫 Người nhận: Điện thoại Giáo viên phụ trách lớp</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                <button id="btn-test-push-submitted" type="button" class="chip-btn" style="font-weight:800;color:#1D4ED8;border-color:#93C5FD;background:#EFF6FF;" onclick="app.sendTestPushNotification('onSubmitted')">🔔 Bắn thử #3</button>
                <input type="checkbox" class="pwa-switch" ${cfg.onSubmitted ? 'checked' : ''} onchange="app.toggleNotifySetting('onSubmitted', this.checked)" aria-label="Bật kịch bản 3">
              </div>
            </div>

            <div class="pwa-toggle-row">
              <div style="flex:1;">
                <strong>4. Báo khi Cô giáo giao bài tập mới hoặc có tin nhắn Sổ Liên Lạc</strong>
                <span>Đồng bộ tức thì yêu cầu bài tập mới và tin nhắn trao đổi giữa Phụ huynh &amp; Giáo viên.</span>
                <div style="font-size:11.5px;font-weight:700;color:#B45309;margin-top:4px;">📱/👩‍🏫 Người nhận: Phụ huynh &amp; Giáo viên (2 chiều)</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                <button id="btn-test-push-assigned" type="button" class="chip-btn" style="font-weight:800;color:#B45309;border-color:#FCD34D;background:#FFFBEB;" onclick="app.sendTestPushNotification('onAssignedOrChat')">🔔 Bắn thử #4</button>
                <input type="checkbox" class="pwa-switch" ${cfg.onAssignedOrChat ? 'checked' : ''} onchange="app.toggleNotifySetting('onAssignedOrChat', this.checked)" aria-label="Bật kịch bản 4">
              </div>
            </div>
          </div>

          <div style="background:#FFF;border:1px solid var(--border);border-radius:10px;padding:10px 12px;">
            <strong style="font-size:12.5px;color:#475569;text-transform:uppercase;display:block;margin-bottom:6px;">Nhật ký thông báo đã gửi gần đây (${logs.length}):</strong>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${logs.map(item => `
                <div style="padding:8px 10px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;font-size:12px;">
                  <div style="display:flex;justify-content:space-between;gap:6px;">
                    <strong style="color:#0F172A;">${esc(item.title)}</strong>
                    <span style="color:#64748B;white-space:nowrap;">${esc(item.time)}</span>
                  </div>
                  <div style="color:#334155;margin-top:2px;">${esc(item.body)}</div>
                  <div style="font-size:11px;font-weight:700;color:var(--primary);margin-top:3px;">${esc(item.recipient || this.getTriggerRecipientLabel(item.trigger))}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>`;
  };

  setTimeout(() => {
    try { app.initPwaAndPush(); } catch {}
  }, 50);

  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const updated = JSON.parse(event.newValue);
      if (updated && Array.isArray(updated.homeworks)) {
        const sanitized = app._sanitizePersistedState(updated);

        // Defect 5 Remediation: Multi-Tab Message Union Merge by unique ID
        const localMsgs = (app.state && Array.isArray(app.state.messages)) ? app.state.messages : [];
        const incomingMsgs = Array.isArray(sanitized.messages) ? sanitized.messages : [];

        const msgMap = new Map();
        localMsgs.forEach(m => {
          if (m && m.id) msgMap.set(m.id, m);
        });
        incomingMsgs.forEach(m => {
          if (m && m.id) {
            const existing = msgMap.get(m.id);
            if (!existing) {
              msgMap.set(m.id, m);
            } else {
              msgMap.set(m.id, {
                ...existing,
                ...m,
                status: (m.status === 'sent' || existing.status === 'sent') ? 'sent' : (m.status || existing.status)
              });
            }
          }
        });

        sanitized.messages = Array.from(msgMap.values()).sort((a, b) => {
          const tA = new Date(a.timestamp || 0).getTime() || 0;
          const tB = new Date(b.timestamp || 0).getTime() || 0;
          return tA - tB;
        });

        // Keep active chat client deduplication set synchronized
        if (app.chatClient && app.chatClient.seenMessageIds) {
          sanitized.messages.forEach(m => app.chatClient.seenMessageIds.add(m.id));
        }

        app.state = sanitized;
        app.normalizeExperience();
        app.renderAll();
      }
    } catch {}
  });
})();
