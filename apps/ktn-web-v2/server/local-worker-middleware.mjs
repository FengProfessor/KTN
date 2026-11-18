import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { draftConsultationExamples, draftConsultationPolicy } from '../../../consultation-examples.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const WORKER_PATH = path.join(REPO_ROOT, 'cloudflare-worker-sw-proxy.js');
const HSK1_LESSONS_PATH = path.join(REPO_ROOT, 'clean_lessons_data.json');
const HSK1_MAPPING_PATH = path.join(REPO_ROOT, 'hsk1_33_units_mapping.json');
const ALL_COURSES_LESSONS_PATH = path.join(REPO_ROOT, 'all_courses_lessons_data.json');

const workerFetchAls = new AsyncLocalStorage();
let activeHostFetchDispatcher = null;
let previousHostFetch = null;

function ensureHostFetchDispatcher() {
  if (typeof globalThis.fetch !== 'function') return;
  if (globalThis.fetch === activeHostFetchDispatcher) return;
  previousHostFetch = globalThis.fetch;
  activeHostFetchDispatcher = function ktnLocalMiddlewareFetchDispatcher(input, init) {
    const activeMockFetch = workerFetchAls.getStore();
    if (typeof activeMockFetch === 'function') {
      return activeMockFetch(input, init);
    }
    return previousHostFetch.call(globalThis, input, init);
  };
  globalThis.fetch = activeHostFetchDispatcher;
}

const DEFAULT_LOCAL_CATALOG_COURSES = [
  {
    course_id: '6adadba969897b0002482ca5',
    code: 'HSK1-30',
    title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
    short_title: 'HSK1 3.0',
    badge: 'TIÊU CHUẨN MỚI 3.0',
    age_group: 'Mọi lứa tuổi',
    lessons_count: 15,
    price: 890000,
    old_price: 1500000,
    is_bundle: false,
    bundle_course_ids: [],
    active: true,
    sort_order: 1
  },
  {
    course_id: '6af2d9719a8b000002ad4bc0',
    code: 'HSK2-30',
    title: 'Khóa học Tiêu Chuẩn New HSK 2 (3.0)',
    short_title: 'HSK2 3.0',
    badge: 'TIÊU CHUẨN MỚI 3.0',
    age_group: 'Mọi lứa tuổi',
    lessons_count: 11,
    price: 890000,
    old_price: 1500000,
    is_bundle: false,
    bundle_course_ids: [],
    active: true,
    sort_order: 2
  },
  {
    course_id: '65e7704a9ea90c00080d5195',
    code: 'CFK-01',
    title: 'Chinese For Kids (Khóa học cho bé 5 – 6 tuổi)',
    short_title: 'Chinese For Kids',
    badge: 'SONG NGỮ MẦM NON',
    age_group: '5 – 6 tuổi',
    lessons_count: 20,
    price: 890000,
    old_price: 1500000,
    is_bundle: false,
    bundle_course_ids: [],
    active: true,
    sort_order: 3
  },
  {
    course_id: '6638bd09a7367400085c7ab2',
    code: 'KIDS-03',
    title: 'Tiếng Trung Trẻ Em 3 (Mini vỡ lòng 5 – 6 tuổi)',
    short_title: 'Tiếng Trung Trẻ Em 3',
    badge: 'CẤP ĐỘ 03',
    age_group: '5 – 6 tuổi',
    lessons_count: 20,
    price: 890000,
    old_price: 1500000,
    is_bundle: false,
    bundle_course_ids: [],
    active: true,
    sort_order: 4
  },
  {
    course_id: '678d14b960eae20002ddf8fe',
    code: 'KIDS-04',
    title: 'Tiếng Trung Trẻ Em 4 (Lộ trình 7 – 13 tuổi)',
    short_title: 'Tiếng Trung Trẻ Em 4',
    badge: 'CẤP ĐỘ 04',
    age_group: '7 – 13 tuổi',
    lessons_count: 16,
    price: 890000,
    old_price: 1500000,
    is_bundle: false,
    bundle_course_ids: [],
    active: true,
    sort_order: 5
  },
  {
    course_id: '67a7290a5fdc26000238b4e9',
    code: 'KIDS-05',
    title: 'Tiếng Trung Trẻ Em 5 (Lộ trình 8 – 14 tuổi)',
    short_title: 'Tiếng Trung Trẻ Em 5',
    badge: 'CẤP ĐỘ 05',
    age_group: '8 – 14 tuổi',
    lessons_count: 20,
    price: 890000,
    old_price: 1500000,
    is_bundle: false,
    bundle_course_ids: [],
    active: true,
    sort_order: 6
  },
  {
    course_id: '67a869302ecb9c000257d966',
    code: 'KIDS-06',
    title: 'Tiếng Trung Trẻ Em 6 (Lộ trình 9 – 15 tuổi)',
    short_title: 'Tiếng Trung Trẻ Em 6',
    badge: 'CẤP ĐỘ 06',
    age_group: '9 – 15 tuổi',
    lessons_count: 20,
    price: 890000,
    old_price: 1500000,
    is_bundle: false,
    bundle_course_ids: [],
    active: true,
    sort_order: 7
  },
  {
    course_id: '6983672f409cc20002e530b8',
    code: 'YCT-04',
    title: 'Khóa học Tiếng Trung Trẻ Em YCT 4',
    short_title: 'Tiếng Trung YCT 4',
    badge: 'CHỨNG CHỈ YCT 4',
    age_group: '9 – 15 tuổi',
    lessons_count: 20,
    price: 1290000,
    old_price: 2000000,
    is_bundle: false,
    bundle_course_ids: [],
    active: true,
    sort_order: 8
  },
  {
    course_id: '65e76a533f5e7c00086715d7',
    code: 'PRON-01',
    title: 'Khóa học Phát Âm & Giao Tiếp Phản Xạ Cơ Bản',
    short_title: 'Phát Âm & Phản Xạ',
    badge: 'GIAO TIẾP PHẢN XẠ',
    age_group: 'Mọi lứa tuổi',
    lessons_count: 19,
    price: 690000,
    old_price: 1200000,
    is_bundle: false,
    bundle_course_ids: [],
    active: true,
    sort_order: 9
  },
  {
    course_id: '67bebce067dba000027d8119',
    code: 'HANZI-01',
    title: 'Khóa học Hán Tự Tư Duy & Luyện Viết Chữ Hán',
    short_title: 'Hán Tự Tư Duy',
    badge: 'HÁN TỰ TƯ DUY',
    age_group: '6 – 15 tuổi',
    lessons_count: 20,
    price: 690000,
    old_price: 1200000,
    is_bundle: false,
    bundle_course_ids: [],
    active: true,
    sort_order: 10
  },
  {
    course_id: 'BUNDLE_YCT_ALL',
    code: 'COMBO-6',
    title: 'Trọn Bộ 6 Khóa Học Trực Tuyến (Lộ trình 5 – 15 tuổi)',
    short_title: 'Trọn Bộ 6 Khóa',
    badge: 'COMBO ƯU ĐÃI 50%',
    age_group: '5 – 15 tuổi',
    lessons_count: 113,
    price: 2990000,
    old_price: 6000000,
    is_bundle: true,
    bundle_course_ids: [
      '6adadba969897b0002482ca5',
      '65e7704a9ea90c00080d5195',
      '6638bd09a7367400085c7ab2',
      '678d14b960eae20002ddf8fe',
      '67a7290a5fdc26000238b4e9',
      '67a869302ecb9c000257d966'
    ],
    active: true,
    sort_order: 11
  }
];

const DEFAULT_LOCAL_GUIDANCE_CONFIG = {
  id: 'default',
  course_ids: DEFAULT_LOCAL_CATALOG_COURSES.slice(0, 10).map(c => c.course_id),
  duration_presets: {
    '6adadba969897b0002482ca5': '3m',
    '6af2d9719a8b000002ad4bc0': '3m',
    '65e7704a9ea90c00080d5195': '3m',
    '6638bd09a7367400085c7ab2': '3m',
    '678d14b960eae20002ddf8fe': '3m',
    '67a7290a5fdc26000238b4e9': '3m',
    '67a869302ecb9c000257d966': '3m',
    '6983672f409cc20002e530b8': 'unlimited',
    '65e76a533f5e7c00086715d7': '2m',
    '67bebce067dba000027d8119': '2m'
  },
  policy: draftConsultationPolicy,
  examples: draftConsultationExamples,
  bot_enabled: true,
  checkout_enabled: true,
  updated_by: 'system',
  updated_at: new Date().toISOString()
};

export function createLocalWorkerHarness() {
  let hsk1Lessons = [];
  let hsk1MappingTable = [];
  let allCoursesLessons = {};
  try {
    if (fs.existsSync(HSK1_LESSONS_PATH)) {
      hsk1Lessons = JSON.parse(fs.readFileSync(HSK1_LESSONS_PATH, 'utf8'));
    }
    if (fs.existsSync(HSK1_MAPPING_PATH)) {
      const parsedMap = JSON.parse(fs.readFileSync(HSK1_MAPPING_PATH, 'utf8'));
      hsk1MappingTable = Array.isArray(parsedMap?.mappingTable) ? parsedMap.mappingTable : [];
    }
    if (fs.existsSync(ALL_COURSES_LESSONS_PATH)) {
      allCoursesLessons = JSON.parse(fs.readFileSync(ALL_COURSES_LESSONS_PATH, 'utf8'));
    }
  } catch (err) {
    console.warn('[LocalWorkerHarness] Could not load lesson JSON files:', err);
  }

  const syntheticStudents = [];
  const syntheticIzStudents = [];
  const syntheticPermsByUid = {};

  for (let i = 1; i <= 1043; i++) {
    const seq = String(i).padStart(4, '0');
    const uid = `33333333-4444-4555-8666-00000000${seq}`;
    const izId = `66fa0000000000000000${seq}`;
    const email = `e2e.hs.${seq}@khongtunhi.com`;
    const code = `KTN-E2E-${seq}`;
    const name =
      i === 1
        ? 'Học viên thử nghiệm 0001 (3 khóa)'
        : i === 2
          ? 'Học viên thử nghiệm 0002 (Mã lớp cũ)'
          : i === 999
            ? 'Trần Bảo Ngọc 0999'
            : `Học viên thử nghiệm ${seq}`;
    const phone = `097800${seq}`;
    const classCode =
      i === 2 ? 'LEGACY-2023' : i % 2 === 0 ? 'YCT3-02' : 'YCT1-01';
    const onlineCourses =
      i === 1
        ? [
            {
              id: '6adadba969897b0002482ca5',
              code: 'HSK1-30',
              title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
              shortTitle: 'HSK1 3.0',
            },
            {
              id: '65e7704a9ea90c00080d5195',
              code: 'CFK-01',
              title: 'Chinese For Kids (Khóa học cho bé 5 – 6 tuổi)',
              shortTitle: 'Chinese For Kids',
            },
            {
              id: '65e7636a0a1b61000825c2ef',
              code: 'MINI-01',
              title: 'Khóa học Tiêu Chuẩn Tiếng Trung Trẻ Em Mini 1',
              shortTitle: 'Tiếng Trung Trẻ Em Mini 1',
            },
          ]
        : [
            {
              id: '6adadba969897b0002482ca5',
              code: 'HSK1-30',
              title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
              shortTitle: 'HSK1 3.0',
            },
          ];

    syntheticStudents.push({
      code,
      email,
      name,
      parent_name: `PH Học viên ${seq}`,
      phone,
      cognito_user_id: uid,
      izteach_student_id: izId,
      class_code: classCode,
      has_live_class: Boolean(classCode),
      has_online_courses: onlineCourses.length > 0,
      online_courses: onlineCourses,
      account_status: 'active',
      sync_status: 'synced',
      updated_at: new Date().toISOString(),
    });

    syntheticIzStudents.push({
      _id: izId,
      id: izId,
      dynamoId: uid,
      userId: uid,
      email,
      name,
      phone,
    });

    syntheticPermsByUid[uid] = onlineCourses.map((c) => c.id);
  }

  const syntheticTeachers = [];
  const teacherSampleNames = [
    'Cô Nguyễn Phương Thảo',
    'Thầy Đặng Quốc Bảo',
    'Cô Bùi Ngọc Ánh',
    'Thầy Hoàng Minh Đức',
    'Cô Vũ Thanh Huyền',
  ];
  for (let i = 1; i <= 30; i++) {
    const seq = String(i).padStart(4, '0');
    const isLocked = i === 15 || i === 28;
    const isUnassigned = i % 5 === 0;
    const assignedClasses = isUnassigned
      ? []
      : i % 2 === 0
      ? ['YCT1-01']
      : ['YCT3-02'];
    syntheticTeachers.push({
      code: `GV-E2E-${seq}`,
      email: `e2e.gv.${seq}@khongtunhi.com`,
      name: `${teacherSampleNames[(i - 1) % teacherSampleNames.length]} ${seq}`,
      phone: `096800${seq}`,
      specialty: i % 2 === 0 ? 'Chuyên gia HSK & Giao tiếp' : 'Chuyên gia YCT & Hán tự',
      assigned_classes: assignedClasses,
      assigned_courses: i % 3 === 0 ? ['6adadba969897b0002482ca5'] : [],
      active: !isLocked,
      status: isLocked ? 'locked' : 'active',
    });
  }

  const state = {
    faults: {
      failMessagesPost: false,
      failMessagesGet: false,
      failHomeworkPost: false,
      failStudentCoursesPost: false,
      failSetLimitedTime: false,
      failStudentSupabasePatch: false,
      strictPreV3TeacherSchema: false,
      zeroRowsTeacherPatch: false,
      failTeacherPatchByCodeEq: false,
      failClassesPatch: false,
      failDlpAlertsPost: false
    },
    uploadedBlobs: new Map(),
    tables: {
      ktn_students: [
        {
          code: 'KTN-2026-089',
          email: 'hoangngan@khongtunhi.com',
          name: 'Bé Nguyễn Hoàng Ngân',
          parent_name: 'PH Bé Hoàng Ngân (Chị Lan)',
          phone: '0912345601',
          cognito_user_id: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
          izteach_student_id: '65f000000000000000000089',
          class_code: 'YCT2-04',
          has_live_class: true,
          has_online_courses: true,
          online_courses: [
            { id: '6adadba969897b0002482ca5', code: 'HSK1-30', title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)', shortTitle: 'HSK1 3.0' },
            { id: '65e7704a9ea90c00080d5195', code: 'CFK-01', title: 'Chinese For Kids (Khóa học cho bé 5 – 6 tuổi)', shortTitle: 'Chinese For Kids' }
          ],
          updated_at: new Date().toISOString()
        },
        {
          code: 'KTN-2026-TAPHON',
          email: 'taphong2002@gmail.com',
          name: 'Tạ Phong Võ',
          parent_name: 'PH Tạ Phong',
          phone: '0988000111',
          cognito_user_id: 'bc21991c-ce9b-465d-b85f-dbb1821e51a9',
          izteach_student_id: '6abb2c0b8b46e30002add37b',
          class_code: null,
          has_live_class: false,
          has_online_courses: true,
          online_courses: [
            { id: '6adadba969897b0002482ca5', code: 'HSK1-30', title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)', shortTitle: 'HSK1 3.0' },
            { id: '65e7704a9ea90c00080d5195', code: 'CFK-01', title: 'Chinese For Kids (Khóa học cho bé 5 – 6 tuổi)', shortTitle: 'Chinese For Kids' }
          ],
          updated_at: new Date().toISOString()
        },
        {
          code: 'KTN-2026-102',
          email: 'minhkhang@khongtunhi.com',
          name: 'Bé Trần Minh Khang',
          parent_name: 'PH Bé Minh Khang',
          phone: '0912345604',
          cognito_user_id: '22222222-3333-4444-5555-666666666662',
          izteach_student_id: '65f000000000000000000102',
          class_code: 'YCT3-02',
          has_live_class: true,
          has_online_courses: false,
          online_courses: [],
          updated_at: new Date().toISOString()
        },
        {
          code: 'KTN-2026-VIP',
          email: 'taphong2002vip@gmail.com',
          name: 'Tạ Phong (Chưa cấp khóa)',
          parent_name: 'PH Tạ Phong VIP',
          phone: '0912345699',
          cognito_user_id: '424d2085-8685-4a49-a5e8-8fb63b0c85c5',
          izteach_student_id: null,
          class_code: null,
          has_live_class: false,
          has_online_courses: false,
          online_courses: [],
          updated_at: new Date().toISOString()
        },
        ...syntheticStudents
      ],
      ktn_teachers: [
        {
          code: 'GV-KTN-08',
          email: 'linh.lam@khongtunhi.com',
          name: 'Cô Lâm Mỹ Linh',
          phone: '0901112233',
          specialty: 'Chuyên gia YCT & Phản xạ Giao tiếp',
          assigned_classes: ['YCT2-04', 'YCT3-02'],
          active: true
        },
        {
          code: 'GV-KTN-12',
          email: 'thu.ha@khongtunhi.com',
          name: 'Cô Trần Thu Hà',
          phone: '0902223344',
          specialty: 'Chuyên gia HSK & Hán tự tư duy',
          assigned_classes: ['YCT1-01'],
          active: true
        },
        ...syntheticTeachers
      ],
      ktn_classes: [
        {
          id: 'YCT2-04',
          name: 'Lớp YCT 2 — Ca tối Thứ 3 & Thứ 6',
          teacher_code: 'GV-KTN-08',
          teacher_email: 'linh.lam@khongtunhi.com',
          teacher_name: 'Cô Lâm Mỹ Linh',
          schedule: '19:30 Thứ 3 & Thứ 6',
          total_lessons: 25,
          current_lesson: 18,
          active: true,
          updated_at: new Date().toISOString()
        },
        {
          id: 'YCT3-02',
          name: 'Lớp YCT 3 — Ca tối Thứ 4 & Chủ Nhật',
          teacher_code: 'GV-KTN-08',
          teacher_email: 'linh.lam@khongtunhi.com',
          teacher_name: 'Cô Lâm Mỹ Linh',
          schedule: '19:30 Thứ 4 & Chủ Nhật',
          total_lessons: 25,
          current_lesson: 12,
          active: true,
          updated_at: new Date().toISOString()
        },
        {
          id: 'YCT1-01',
          name: 'Lớp YCT 1 — Ca tối Thứ 2 & Thứ 5',
          teacher_code: 'GV-KTN-12',
          teacher_email: 'thu.ha@khongtunhi.com',
          teacher_name: 'Cô Trần Thu Hà',
          schedule: '19:30 Thứ 2 & Thứ 5',
          total_lessons: 25,
          current_lesson: 5,
          active: true,
          updated_at: new Date().toISOString()
        }
      ],
      ktn_courses: [],
      ktn_advisors: [
        {
          email: 'quanly@khongtunhi.com',
          name: 'Quản Lý KTN',
          active: true,
          role: 'manager',
          ktn_user_id: '2c01e488-d866-4341-a0db-644fe6ba1202',
          updated_at: new Date().toISOString()
        },
        {
          email: 'advisor1@khongtunhi.com',
          name: 'Tư vấn viên Minh Anh',
          active: true,
          role: 'advisor',
          ktn_user_id: 'ADV-KTN-01',
          updated_at: new Date().toISOString()
        },
        {
          email: 'advisor.an@khongtunhi.com',
          name: 'Tư Vấn An',
          active: true,
          role: 'advisor',
          ktn_user_id: 'ADV-KTN-02',
          updated_at: new Date().toISOString()
        }
      ],
      ktn_consultation_guidance: [{ ...DEFAULT_LOCAL_GUIDANCE_CONFIG }],
      ktn_consultations: [],
      ktn_consultation_messages: [],
      ktn_consultation_events: [],
      ktn_consultation_flags: [],
      ktn_consultation_orders: [],
      ktn_consultation_payments: [],
      ktn_consultation_advisor_counters: [],
      ktn_zalo_oa_events: [],
      ktn_sepay_reconciliation_logs: [],
      ktn_homeworks: [
        {
          id: 'HW-hoangngan@khongtunhi.com-6adadba969897b0002482ca5-L1',
          student_code: 'KTN-2026-089',
          student_email: 'hoangngan@khongtunhi.com',
          student_name: 'Bé Nguyễn Hoàng Ngân',
          class_code: 'YCT2-04',
          course_id: '6adadba969897b0002482ca5',
          lesson_num: 1,
          lesson_title: 'Bài 1: AI小语，你好！ (Xin chào AI Tiểu Ngữ!)',
          file_url: 'https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/3529cd2b-7af6-4fda-887c-392a79393d6a/hoangngan_khongtunhi_com/1730000001-btvn_bai1.wav',
          file_type: 'audio/wav',
          attachments: [
            {
              title: 'Bản thu âm Bài 1 - Bé Hoàng Ngân.wav',
              fileUrl: 'https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/3529cd2b-7af6-4fda-887c-392a79393d6a/hoangngan_khongtunhi_com/1730000001-btvn_bai1.wav',
              cdnUrl: 'https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/3529cd2b-7af6-4fda-887c-392a79393d6a/hoangngan_khongtunhi_com/1730000001-btvn_bai1.wav',
              mediaType: 'audio/wav',
              size: 148200
            }
          ],
          workbook_answers: {},
          student_note: 'Con nộp bài đọc to hội thoại bài 1 ạ!',
          status: 'graded',
          score: 9.5,
          teacher_feedback: 'Con phát âm thanh 3 rất rõ ràng và tự nhiên! Giữ vững phong độ ở Bài 2 nhé.',
          graded_by: 'linh.lam@khongtunhi.com',
          graded_at: new Date(Date.now() - 3600 * 1000).toISOString(),
          submitted_at: new Date(Date.now() - 7200 * 1000).toISOString(),
          updated_at: new Date(Date.now() - 3600 * 1000).toISOString()
        }
      ],
      ktn_class_sessions: [
        {
          id: 'YCT2-04-B1',
          class_code: 'YCT2-04',
          session_num: 1,
          session_title: 'Buổi 1: Từ vựng Gia đình & Hỏi thăm sức khỏe',
          exercises: [
            {
              id: 'YCT2-04-B1-E1',
              num: 1,
              title: 'Bài 1: Thu âm đọc 5 câu hội thoại hỏi thăm sức khỏe (Trang 12)',
              prompt: 'Con bấm Thu âm đọc rõ từng câu hội thoại trong sách giáo khoa trang 12 rồi bấm Nộp bài cho cô nhé.',
              type: 'audio',
              status: 'published'
            },
            {
              id: 'YCT2-04-B1-E2',
              num: 2,
              title: 'Bài 2: Chụp ảnh vở viết chữ Hán bài 1 (你, 好, 我, 叫)',
              prompt: 'Con viết mỗi chữ 1 dòng vào vở ô mễ, sau đó chụp ảnh đính kèm gửi cô chấm nét chữ nhé.',
              type: 'photo',
              status: 'published'
            }
          ],
          updated_by: 'linh.lam@khongtunhi.com',
          updated_at: new Date(Date.now() - 86400 * 1000).toISOString()
        }
      ],
      ktn_messages: [
        {
          id: 'MSG-SEED-YCT2-001',
          room_id: 'YCT2-04',
          class_code: 'YCT2-04',
          sender_email: 'linh.lam@khongtunhi.com',
          sender_name: 'Cô Lâm Mỹ Linh',
          sender_role: 'teacher',
          content: 'Chào phụ huynh và các con lớp YCT2-04! Tối nay 19:30 lớp mình học Buổi 18, các con chuẩn bị sách giáo khoa trang 12 nhé.',
          attachment_url: '',
          created_at: new Date(Date.now() - 5400 * 1000).toISOString()
        },
        {
          id: 'MSG-SEED-YCT2-002',
          room_id: 'YCT2-04',
          class_code: 'YCT2-04',
          sender_email: 'hoangngan@khongtunhi.com',
          sender_name: 'Bé Nguyễn Hoàng Ngân',
          sender_role: 'student',
          content: 'Dạ con chào cô Linh! Con đã ôn xong từ vựng và sẵn sàng vào lớp rồi ạ.',
          attachment_url: '',
          created_at: new Date(Date.now() - 3200 * 1000).toISOString()
        }
      ],
      ktn_orders: [
        {
          order_id: 'ORD-261105',
          student_name: 'Bé Phạm Gia Hân',
          student_email: 'giahan@khongtunhi.com',
          phone: '0987654321',
          course_id: '6adadba969897b0002482ca5',
          course_name: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
          amount: 890000,
          payment_method: 'VietQR',
          payment_status: 'paid',
          approval_status: 'pending',
          note: 'Đăng ký từ trang chủ<!--KTN_ORDER_META:{"parent_name":"Chị Phạm Thu Hà","contact_status":"called","contact_note":"Đã gọi tư vấn lộ trình HSK1","payment_sub_status":"verified_paid","payment_verified_by":"webhook:auto","payment_tx_ref":"FT2611058899","payment_received_amount":890000,"payment_proof_auto":true,"source":"website","v2_managed":true}-->',
          created_at: new Date(Date.now() - 1800 * 1000).toISOString(),
          updated_at: new Date(Date.now() - 1800 * 1000).toISOString()
        },
        {
          order_id: 'ORD-261106',
          student_name: 'Bé Lê Minh Tuấn',
          student_email: '',
          phone: '0912345688',
          course_id: '65e7704a9ea90c00080d5195',
          course_name: 'Chinese For Kids (Khóa học cho bé 5 – 6 tuổi)',
          amount: 890000,
          payment_method: 'VietQR',
          payment_status: 'pending_verification',
          approval_status: 'pending',
          note: 'Cần tư vấn lịch học buổi tối\n<!--KTN_ORDER_META:{"parent_name":"","contact_status":"not_called","contact_note":"","payment_sub_status":"unpaid","source":"website","v2_managed":true}-->',
          created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
          updated_at: new Date(Date.now() - 3600 * 1000).toISOString()
        },
        {
          order_id: 'ORD-261107',
          student_name: 'Bé Vũ Minh Anh',
          student_email: 'minhanh@khongtunhi.com',
          phone: '0909112233',
          course_id: '6638bd09a7367400085c7ab2',
          course_name: 'Tiếng Trung Trẻ Em 3 (Lộ trình 6 – 12 tuổi)',
          amount: 890000,
          payment_method: 'VietQR',
          payment_status: 'pending_verification',
          approval_status: 'pending',
          note: 'Mẹ vừa chuyển khoản qua VietQR\n<!--KTN_ORDER_META:{"parent_name":"Chị Vũ Thu Hương","contact_status":"called","contact_note":"Mẹ báo vừa CK xong","payment_sub_status":"customer_reported","source":"website","v2_managed":true}-->',
          created_at: new Date(Date.now() - 2400 * 1000).toISOString(),
          updated_at: new Date(Date.now() - 2400 * 1000).toISOString()
        }
      ],
      ktn_dlp_alerts: [
        {
          id: 'PIN-YCT2-04-DEFAULT',
          room_id: 'PIN:class:YCT2-04',
          sender_email: 'linh.lam@khongtunhi.com',
          sender_name: 'Cô Lâm Mỹ Linh',
          sender_role: 'teacher',
          blocked_content: JSON.stringify({
            roomId: 'class:YCT2-04',
            content: 'Lịch học cố định: 19:30 Thứ 3 & Thứ 6 hàng tuần. Các con nộp bài thu âm trước 18:00 ngày có lịch học nhé!',
            pinnedBy: 'Cô Lâm Mỹ Linh',
            pinnedByEmail: 'linh.lam@khongtunhi.com',
            isDefault: false,
            updatedAt: new Date(Date.now() - 7200 * 1000).toISOString()
          }),
          reason: 'ROOM_PINNED_ANNOUNCEMENT',
          resolved: true,
          created_at: new Date(Date.now() - 7200 * 1000).toISOString()
        }
      ],
      ktn_push_subscriptions: [],
      ktn_attendance: [],
      ktn_provisioning_jobs: [],
      ktn_sync_events: [],
      ktn_payment_config: [
        {
          id: 'default',
          bank_id: 'MB',
          bank_name: 'MBBank',
          account_no: '0988888888',
          account_name: 'HOC VIEN KHONG TU NHI',
          default_amount: 890000,
          auto_approve_webhook: false
        }
      ]
    },
    izteach: {
      students: [
        {
          _id: '65f000000000000000000089',
          id: '65f000000000000000000089',
          dynamoId: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
          userId: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
          email: 'hoangngan@khongtunhi.com',
          name: 'Bé Nguyễn Hoàng Ngân',
          phone: '0912345601'
        },
        {
          _id: '6abb2c0b8b46e30002add37b',
          id: '6abb2c0b8b46e30002add37b',
          dynamoId: 'bc21991c-ce9b-465d-b85f-dbb1821e51a9',
          userId: 'bc21991c-ce9b-465d-b85f-dbb1821e51a9',
          email: 'taphong2002@gmail.com',
          name: 'Tạ Phong Võ',
          phone: '0988000111'
        },
        {
          _id: '65f000000000000000000102',
          id: '65f000000000000000000102',
          dynamoId: '22222222-3333-4444-5555-666666666662',
          userId: '22222222-3333-4444-5555-666666666662',
          email: 'minhkhang@khongtunhi.com',
          name: 'Bé Trần Minh Khang',
          phone: '0912345604'
        },
        {
          _id: '65f000000000000000000999',
          id: '65f000000000000000000999',
          dynamoId: '424d2085-8685-4a49-a5e8-8fb63b0c85c5',
          userId: '424d2085-8685-4a49-a5e8-8fb63b0c85c5',
          email: 'taphong2002vip@gmail.com',
          name: 'Tạ Phong (Chưa cấp khóa)',
          phone: '0912345699'
        },
        ...syntheticIzStudents
      ],
      permissionsByUid: {
        'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68': [
          '6adadba969897b0002482ca5',
          '65e7704a9ea90c00080d5195'
        ],
        'bc21991c-ce9b-465d-b85f-dbb1821e51a9': [
          '6adadba969897b0002482ca5',
          '65e7704a9ea90c00080d5195'
        ],
        '22222222-3333-4444-5555-666666666662': [],
        '424d2085-8685-4a49-a5e8-8fb63b0c85c5': [],
        ...syntheticPermsByUid
      },
      permissionRecordsByUid: {},
      homeworkPosts: []
    },
    autoId: 1000
  };

  function getOrInitPermissionRecords(uid) {
    if (!uid) return [];
    const courseIds = (state.izteach.permissionsByUid[uid] || []).map(String);
    let records = state.izteach.permissionRecordsByUid[uid];
    if (!Array.isArray(records)) {
      records = courseIds.map((cid, idx) => ({
        _id: `perm_${uid.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}_${cid.slice(-6)}_${idx}`,
        id: `perm_${uid.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}_${cid.slice(-6)}_${idx}`,
        userId: uid,
        limitTime: null,
        isExpired: false,
        onlineCourses: [cid]
      }));
      state.izteach.permissionRecordsByUid[uid] = records;
      return records;
    }
    // Sync any newly added or removed courseIds in permissionsByUid
    const existingCourseSet = new Set();
    for (const r of records) {
      for (const c of r.onlineCourses || []) existingCourseSet.add(String(c));
    }
    for (const cid of courseIds) {
      if (!existingCourseSet.has(cid)) {
        const pid = `perm_${uid.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}_${cid.slice(-6)}_${++state.autoId}`;
        records.push({
          _id: pid,
          id: pid,
          userId: uid,
          limitTime: null,
          isExpired: false,
          onlineCourses: [cid]
        });
      }
    }
    const allowedSet = new Set(courseIds);
    const filtered = records.filter(r => (r.onlineCourses || []).some(c => allowedSet.has(String(c))));
    state.izteach.permissionRecordsByUid[uid] = filtered;
    return filtered;
  }

  function normalizeViMock(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9@._\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function matchesJsonbContainsMock(rawCell, jsonTarget) {
    if (!Array.isArray(rawCell)) return false;
    try {
      const needles = JSON.parse(jsonTarget);
      if (!Array.isArray(needles)) return false;
      return needles.every((needle) => {
        if (needle && typeof needle === 'object') {
          return rawCell.some(
            (item) =>
              item &&
              typeof item === 'object' &&
              Object.keys(needle).every((k) => String(item[k] ?? '') === String(needle[k] ?? ''))
          );
        }
        return rawCell.some(
          (item) => (typeof item === 'string' || typeof item === 'number') && String(item) === String(needle)
        );
      });
    } catch {
      return false;
    }
  }

  function comparePostgrestScalar(rawCell, target, op) {
    if (rawCell === null || rawCell === undefined || rawCell === '') return false;
    const rawStr = String(rawCell);
    const targetStr = String(target ?? '');
    let diff = null;
    if (targetStr.includes('-')) {
      const cellTs = Date.parse(rawStr);
      const targetTs = Date.parse(targetStr);
      if (Number.isFinite(cellTs) && Number.isFinite(targetTs)) {
        diff = cellTs - targetTs;
      }
    }
    if (diff === null) {
      const cellNum = Number(rawStr);
      const targetNum = Number(targetStr);
      if (rawStr.trim() !== '' && targetStr.trim() !== '' && Number.isFinite(cellNum) && Number.isFinite(targetNum)) {
        diff = cellNum - targetNum;
      } else {
        diff = rawStr === targetStr ? 0 : (rawStr > targetStr ? 1 : -1);
      }
    }
    if (op === 'gt') return diff > 0;
    if (op === 'gte') return diff >= 0;
    if (op === 'lt') return diff < 0;
    if (op === 'lte') return diff <= 0;
    return true;
  }

  function splitTopLevelClause(input) {
    const parts = [];
    let depth = 0;
    let inQuotes = false;
    let escaped = false;
    let current = '';
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (escaped) {
        current += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        current += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inQuotes = !inQuotes;
        current += ch;
        continue;
      }
      if (!inQuotes) {
        if (ch === '(') depth++;
        else if (ch === ')') depth = Math.max(0, depth - 1);
        else if (ch === ',' && depth === 0) {
          parts.push(current.trim());
          current = '';
          continue;
        }
      }
      current += ch;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  function stripQuotes(val) {
    const s = String(val ?? '').trim();
    if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
      return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    return s;
  }

  function resolveDottedField(row, colPath) {
    if (!row || typeof row !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(row, colPath)) return row[colPath];
    const parts = colPath.split('.');
    let cur = row;
    for (const p of parts) {
      if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
      cur = cur[p];
    }
    return cur;
  }

  function evalSingleClause(row, clause) {
    const logicMatch = /^(not\.)?(or|and)\(([\s\S]*)\)$/i.exec(clause.trim());
    if (logicMatch) {
      const inner = logicMatch[3];
      const subClauses = splitTopLevelClause(inner);
      const isAnd = logicMatch[2].toLowerCase() === 'and';
      const res = isAnd
        ? subClauses.every(c => evalSingleClause(row, c))
        : subClauses.some(c => evalSingleClause(row, c));
      return logicMatch[1] ? !res : res;
    }
    const m = clause.trim().match(/^([a-zA-Z0-9_.]+)\.(not\.)?(eq|neq|gt|gte|lt|lte|cs|ilike|like|is|in)\.([\s\S]+)$/);
    if (!m) return true;
    const [, col, neg, op, rawV] = m;
    const v = stripQuotes(rawV);
    const rawCell = resolveDottedField(row, col);
    let matched = true;
    if (op === 'is') {
      if (v.toLowerCase() === 'null') matched = rawCell === null || rawCell === undefined || rawCell === '';
      else if (v.toLowerCase() === 'true') matched = rawCell === true;
      else if (v.toLowerCase() === 'false') matched = rawCell === false;
    } else if (op === 'cs') {
      matched = matchesJsonbContainsMock(rawCell, rawV);
    } else if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
      matched = comparePostgrestScalar(rawCell, v, op);
    } else if (op === 'in') {
      const inner = rawV.replace(/^\(/, '').replace(/\)$/, '');
      const list = splitTopLevelClause(inner).map(stripQuotes);
      matched = list.includes(String(rawCell ?? ''));
    } else {
      const cell = String(rawCell ?? '');
      if (op === 'eq') matched = cell === v;
      else if (op === 'neq') matched = cell !== v;
      else {
        const isCaseInsensitive = op === 'ilike';
        const regexStr = '^' + v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$';
        const re = new RegExp(regexStr, isCaseInsensitive ? 'i' : '');
        matched = re.test(cell);
      }
    }
    return neg ? !matched : matched;
  }

  function matchQueryFilters(row, searchParams) {
    for (const [k, rawVal] of searchParams.entries()) {
      if (k === 'select' || k === 'order' || k === 'limit' || k === 'offset' || k === 'on_conflict') continue;
      if (k === 'or') {
        const inner = rawVal.replace(/^\(/, '').replace(/\)$/, '');
        const clauses = splitTopLevelClause(inner);
        const anyMatch = clauses.some(c => evalSingleClause(row, c));
        if (!anyMatch) return false;
        continue;
      }
      if (k === 'and') {
        const inner = rawVal.replace(/^\(/, '').replace(/\)$/, '');
        const clauses = splitTopLevelClause(inner);
        const allMatch = clauses.every(c => evalSingleClause(row, c));
        if (!allMatch) return false;
        continue;
      }
      const cell = resolveDottedField(row, k);
      const neg = rawVal.startsWith('not.');
      const val = neg ? rawVal.slice(4) : rawVal;
      let ok = true;
      if (val.startsWith('eq.')) {
        ok = String(cell ?? '') === stripQuotes(val.slice(3));
      } else if (val.startsWith('neq.')) {
        ok = String(cell ?? '') !== stripQuotes(val.slice(4));
      } else if (val.startsWith('gte.')) {
        ok = comparePostgrestScalar(cell, stripQuotes(val.slice(4)), 'gte');
      } else if (val.startsWith('gt.')) {
        ok = comparePostgrestScalar(cell, stripQuotes(val.slice(3)), 'gt');
      } else if (val.startsWith('lte.')) {
        ok = comparePostgrestScalar(cell, stripQuotes(val.slice(4)), 'lte');
      } else if (val.startsWith('lt.')) {
        ok = comparePostgrestScalar(cell, stripQuotes(val.slice(3)), 'lt');
      } else if (val.startsWith('cs.')) {
        ok = matchesJsonbContainsMock(cell, val.slice(3));
      } else if (val.startsWith('is.')) {
        const target = val.slice(3).toLowerCase();
        if (target === 'null') ok = cell === null || cell === undefined || cell === '';
        else if (target === 'true') ok = cell === true;
        else if (target === 'false') ok = cell === false;
      } else if (val.startsWith('ilike.') || val.startsWith('like.')) {
        const isCaseInsensitive = val.startsWith('ilike.');
        const pattern = stripQuotes(val.slice(isCaseInsensitive ? 6 : 5));
        const regexStr = '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$';
        const re = new RegExp(regexStr, isCaseInsensitive ? 'i' : '');
        ok = re.test(String(cell ?? ''));
      } else if (val.startsWith('in.(')) {
        const list = splitTopLevelClause(val.slice(4, -1)).map(stripQuotes);
        ok = list.includes(String(cell ?? ''));
      }
      if (neg ? ok : !ok) return false;
    }
    return true;
  }

  async function mockFetch(input, init = {}) {
    const urlStr = typeof input === 'string' ? input : input.url;
    const method = String(init.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
    const u = new URL(urlStr, 'http://localhost');

    if (u.hostname === 'mock-supabase.local' && u.pathname.startsWith('/auth/v1/')) {
      const authPath = u.pathname.slice('/auth/v1/'.length);
      const reqHeaders = new Headers(init.headers || {});
      if (authPath === 'token' && method === 'POST') {
        const body = init.body ? JSON.parse(init.body) : {};
        const email = String(body.email || '').trim().toLowerCase();
        const adv = (state.tables.ktn_advisors || []).find(
          a => String(a.email || '').toLowerCase() === email && a.active !== false
        );
        if (!adv || String(body.password || '') !== (env.KTN_STAFF_AND_TEST_PASSWORD || 'Ktn@2026!')) {
          return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(
          JSON.stringify({
            access_token: 'mock-supabase-jwt-' + adv.email,
            token_type: 'bearer',
            expires_in: 3600,
            user: {
              id: adv.ktn_user_id || adv.email,
              email: adv.email,
              email_confirmed_at: new Date().toISOString()
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (authPath === 'user' && method === 'GET') {
        const bearer = String(reqHeaders.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
        if (bearer.startsWith('mock-supabase-jwt-')) {
          const email = bearer.slice('mock-supabase-jwt-'.length).trim().toLowerCase();
          const adv = (state.tables.ktn_advisors || []).find(
            a => String(a.email || '').toLowerCase() === email && a.active !== false
          );
          if (adv) {
            return new Response(
              JSON.stringify({
                id: adv.ktn_user_id || adv.email,
                email: adv.email,
                email_confirmed_at: new Date().toISOString()
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
        }
        return new Response(JSON.stringify({ message: 'Invalid JWT' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ message: 'Unmocked auth path' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (u.hostname === 'mock-supabase.local') {
      const table = u.pathname.replace(/^\/rest\/v1\//, '');
      if (table === 'rpc/ktn_search_students' && method === 'POST') {
        const body = init.body ? JSON.parse(init.body) : {};
        const qNorm = normalizeViMock(body.p_query || '');
        const qTokens = qNorm ? qNorm.split(' ').filter(Boolean) : [];
        const classFilter = String(body.p_class_code || '').trim().toUpperCase();
        const courseFilter = String(body.p_course_id || '').trim();
        const accountFilter = String(body.p_account_status || '').trim();
        const syncFilter = String(body.p_sync_status || '').trim();
        const caseFilter = String(body.p_student_case || '').trim();
        const allowedClasses = Array.isArray(body.p_allowed_classes)
          ? body.p_allowed_classes.map(c => String(c || '').trim().toUpperCase()).filter(Boolean)
          : null;
        const limit = Math.min(200, Math.max(1, Number(body.p_limit || 50)));
        const offset = Math.max(0, Number(body.p_offset || 0));

        const matched = [];
        for (let rowIdx = 0; rowIdx < state.tables.ktn_students.length; rowIdx++) {
          const r = state.tables.ktn_students[rowIdx];
          const rowClass = String(r.class_code || '').trim().toUpperCase();
          if (allowedClasses !== null) {
            if (allowedClasses.length === 0 || !allowedClasses.includes(rowClass)) continue;
          }
          if (classFilter === 'NONE' || classFilter === 'UNASSIGNED' || classFilter === '__UNASSIGNED__') {
            if (rowClass !== '') continue;
          } else if (classFilter && classFilter !== 'ALL') {
            if (rowClass !== classFilter) continue;
          }
          const courses = Array.isArray(r.online_courses) ? r.online_courses : [];
          if (courseFilter && courseFilter !== 'ALL') {
            const hasC = courses.some(c => String(c?.id || c || '') === courseFilter);
            if (!hasC) continue;
          }
          const hasCog = Boolean(r.cognito_user_id);
          const accSt = r.account_status || (hasCog ? 'active' : 'pending_activation');
          const synSt = r.sync_status || (hasCog ? 'synced' : 'pending_activation');
          const rawCase = String(r.student_case || (rowClass && courses.length > 0 ? 'both' : rowClass ? 'live_only' : courses.length > 0 ? 'video_only' : 'unassigned')).toLowerCase();
          const normStuCase =
            rawCase === 'online_only' ? 'video_only'
            : rawCase === 'sll_only' ? 'live_only'
            : rawCase === 'hybrid' ? 'both'
            : rawCase === 'none' ? 'unassigned'
            : rawCase;
          const normCaseFilter =
            caseFilter.toLowerCase() === 'online_only' ? 'video_only'
            : caseFilter.toLowerCase() === 'sll_only' ? 'live_only'
            : caseFilter.toLowerCase() === 'hybrid' ? 'both'
            : caseFilter.toLowerCase() === 'none' ? 'unassigned'
            : caseFilter.toLowerCase();
          if (accountFilter && accountFilter !== 'ALL' && accSt !== accountFilter) continue;
          if (syncFilter && syncFilter !== 'ALL') {
            if (syncFilter.toLowerCase() === 'needs_resync') {
              const synLower = String(synSt || '').toLowerCase();
              const isResyncNeeded =
                synLower === 'needs_resync' ||
                synLower === 'sync_failed' ||
                synLower === 'partial_failure' ||
                synLower === 'pending_sync' ||
                synLower === 'error' ||
                Boolean(r.last_sync_error);
              if (!isResyncNeeded) continue;
            } else if (synSt !== syncFilter) {
              continue;
            }
          }
          if (caseFilter && caseFilter !== 'ALL' && normStuCase !== normCaseFilter) continue;

          const hay = r.search_text || normalizeViMock([r.code, r.name, r.email, r.phone, r.parent_name, r.class_code].join(' '));
          if (qTokens.length > 0 && !qTokens.every(t => hay.includes(t))) continue;

          let score = 1;
          const emLower = String(r.email || '').toLowerCase();
          const codeNorm = normalizeViMock(r.code || '');
          const nameNorm = normalizeViMock(r.name || '');
          const phoneClean = String(r.phone || '').replace(/\D/g, '');
          const qDigits = qNorm.replace(/\D/g, '');
          if (!qNorm) score = 1;
          else if (emLower === qNorm || codeNorm === qNorm) score = 120;
          else if (qDigits.length >= 6 && phoneClean.includes(qDigits)) score = 110;
          else if (nameNorm === qNorm) score = 100;
          else if (emLower.startsWith(qNorm) || codeNorm.startsWith(qNorm)) score = 90;
          else if (nameNorm.startsWith(qNorm) || nameNorm.endsWith(' ' + qNorm)) score = 85;
          else if (nameNorm.includes(qNorm)) score = 75;
          else if (hay.includes(qNorm)) score = 60;
          else score = 45;

          matched.push({ row: r, score, rowIdx });
        }
        matched.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.rowIdx - b.rowIdx;
        });
        const totalCount = matched.length;
        const page = matched.slice(offset, offset + limit).map(m => ({
          ...m.row,
          match_score: m.score,
          total_count: totalCount
        }));
        return new Response(JSON.stringify(page), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (table === 'rpc/ktn_search_teachers' && method === 'POST') {
        const rpcBody = init.body ? JSON.parse(init.body) : {};
        const qNorm = normalizeViMock(rpcBody.p_query || '');
        const qCompact = qNorm.replace(/\s+/g, '');
        const qDigits = qNorm.replace(/\D/g, '');
        const qTokens = qNorm ? qNorm.split(' ').filter(Boolean) : [];
        const statusFilter = String(rpcBody.p_status || '').trim().toLowerCase();
        const classFilter = String(rpcBody.p_class_code || '').trim().toUpperCase();
        const courseFilter = String(rpcBody.p_course_id || '').trim();
        const limit = Math.min(100, Math.max(1, Number(rpcBody.p_limit) || 25));
        const offset = Math.max(0, Number(rpcBody.p_offset) || 0);

        const allTeachers = state.tables.ktn_teachers || [];
        const matched = [];
        for (let rowIdx = 0; rowIdx < allTeachers.length; rowIdx++) {
          const r = allTeachers[rowIdx];
          const rawRowStatus = String(r.status || '').trim().toLowerCase();
          const isActive =
            r.active !== false &&
            r.is_active !== false &&
            !['inactive', 'locked', 'suspended', 'disabled'].includes(rawRowStatus);
          const classes = Array.isArray(r.assigned_classes) ? r.assigned_classes.map(c => String(c || '').trim().toUpperCase()).filter(Boolean) : [];
          const courses = Array.isArray(r.assigned_courses) ? r.assigned_courses.map(c => String(c || '').trim()).filter(Boolean) : [];

          if (statusFilter === 'active' && !isActive) continue;
          if (['inactive', 'locked', 'suspended', 'disabled'].includes(statusFilter) && isActive) continue;
          if (['unassigned', 'no_class'].includes(statusFilter) && classes.length > 0) continue;
          if (['assigned', 'has_class'].includes(statusFilter) && classes.length === 0) continue;
          if (classFilter && classFilter !== 'ALL' && !classes.includes(classFilter)) continue;
          if (courseFilter && courseFilter !== 'ALL' && courseFilter !== 'all' && !courses.includes(courseFilter)) continue;

          const nameNorm = normalizeViMock(r.name || '');
          const nameCompact = nameNorm.replace(/\s+/g, '');
          const codeNorm = normalizeViMock(r.code || '');
          const emLower = String(r.email || '').toLowerCase();
          const phoneClean = String(r.phone || '').replace(/\D/g, '');
          const specNorm = normalizeViMock(r.specialty || r.specialization || '');
          const hay = normalizeViMock([r.code, r.name, nameCompact, r.email, r.phone, phoneClean, r.specialty, r.specialization, ...classes].join(' '));
          const hayCompact = hay.replace(/\s+/g, '');

          if (qTokens.length > 0) {
            const tokenOk = qTokens.every(t => hay.includes(t));
            const compactOk = qCompact.length >= 2 && hayCompact.includes(qCompact);
            const phoneOk = qDigits.length >= 3 && phoneClean.includes(qDigits);
            if (!tokenOk && !compactOk && !phoneOk) continue;
          }

          let score = 100;
          if (qNorm) {
            if (codeNorm === qNorm) score = 1000;
            else if (emLower === qNorm) score = 990;
            else if (qDigits.length >= 6 && phoneClean === qDigits) score = 980;
            else if (nameNorm === qNorm) score = 960;
            else if (qCompact && nameCompact === qCompact) score = 940;
            else if (codeNorm.startsWith(qNorm)) score = 900;
            else if (emLower.startsWith(qNorm)) score = 880;
            else if (nameNorm.startsWith(qNorm)) score = 860;
            else if (qDigits.length >= 3 && phoneClean.includes(qDigits)) score = 840;
            else if (nameNorm.includes(qNorm)) score = 760;
            else if (qCompact && nameCompact.includes(qCompact)) score = 730;
            else if (specNorm.includes(qNorm)) score = 700;
            else score = 650;
          }

          matched.push({ row: r, score, isActive, rowIdx });
        }

        matched.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
          return a.rowIdx - b.rowIdx;
        });

        const totalCount = matched.length;
        const page = matched.slice(offset, offset + limit).map(m => ({
          ...m.row,
          active: m.isActive,
          is_active: m.isActive,
          rank_score: m.score,
          total_count: totalCount
        }));

        return new Response(JSON.stringify(page), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (table === 'rpc/ktn_get_rooms_latest_messages' && method === 'POST') {
        const rpcBody = init.body ? JSON.parse(init.body) : {};
        const roomIds = Array.isArray(rpcBody.p_room_ids)
          ? new Set(rpcBody.p_room_ids.map(r => String(r || '').trim()).filter(Boolean))
          : null;
        const roomPrefix = String(rpcBody.p_room_prefix || '').trim().toLowerCase();
        const latestByRoom = new Map();
        for (const m of state.tables.ktn_messages || []) {
          if (!m) continue;
          const rid = String(m.room_id || m.class_code || '').trim();
          if (!rid) continue;
          if (roomIds && !roomIds.has(rid)) continue;
          if (roomPrefix && !rid.toLowerCase().startsWith(roomPrefix)) continue;
          const prev = latestByRoom.get(rid);
          if (!prev) {
            latestByRoom.set(rid, { ...m, room_id: rid });
          } else {
            const prevTs = Date.parse(prev.created_at || '') || 0;
            const curTs = Date.parse(m.created_at || '') || 0;
            if (curTs > prevTs || (curTs === prevTs && String(m.id || '') > String(prev.id || ''))) {
              latestByRoom.set(rid, { ...m, room_id: rid });
            }
          }
        }
        return new Response(JSON.stringify(Array.from(latestByRoom.values())), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const buildInboxRows = () => {
        const orders = state.tables.ktn_orders || [];
        const links = state.tables.ktn_consultation_orders || [];
        return (state.tables.ktn_consultations || [])
          .filter(c => {
            if (c.last_customer_at !== null && c.last_customer_at !== undefined) return true;
            if (c.last_reply_at !== null && c.last_reply_at !== undefined) return true;
            return links.some(l => l.consultation_id === c.id);
          })
          .map(c => {
            const lastCust = c.last_customer_at ? Date.parse(c.last_customer_at) : null;
            const lastReply = c.last_reply_at ? Date.parse(c.last_reply_at) : -Infinity;
            const replyPending = lastCust !== null ? lastCust > lastReply : false;
            const hasPaidPending = links.some(l => {
              if (l.consultation_id !== c.id) return false;
              const ord = orders.find(o => o.order_id === l.order_id);
              return ord && ord.payment_status === 'paid' && ord.approval_status !== 'approved';
            });
            return {
              ...c,
              reply_pending: replyPending,
              has_paid_pending: hasPaidPending
            };
          });
      };

      const buildPaidReportRows = () => {
        const out = [];
        for (const l of state.tables.ktn_consultation_orders || []) {
          const ord = (state.tables.ktn_orders || []).find(o => o.order_id === l.order_id);
          if (!ord || ord.payment_status !== 'paid') continue;
          const conv = (state.tables.ktn_consultations || []).find(c => c.id === l.consultation_id);
          const payments = (state.tables.ktn_consultation_payments || [])
            .filter(p => p.order_id === ord.order_id && Number(p.amount) === Number(ord.amount) && ['accepted', 'done', 'needs_review'].includes(p.status))
            .sort((a, b) => (Date.parse(a.created_at || '') || 0) - (Date.parse(b.created_at || '') || 0));
          const p = payments[0];
          if (!p) continue;
          out.push({
            order_id: ord.order_id,
            consultation_id: l.consultation_id,
            owner_email: l.owner_email ?? conv?.owner_email ?? null,
            channel: conv?.channel || 'web',
            course_name: ord.course_name,
            amount: ord.amount,
            approval_status: ord.approval_status,
            paid_at: p.created_at
          });
        }
        return out;
      };

      const buildAssignmentReportRows = () => {
        const seen = new Set();
        const out = [];
        const events = [...(state.tables.ktn_consultation_events || [])].sort(
          (a, b) => (Date.parse(a.created_at || '') || 0) - (Date.parse(b.created_at || '') || 0)
        );
        for (const ev of events) {
          if (ev.kind !== 'assigned' || !ev.detail?.to) continue;
          const key = `${ev.consultation_id}::${ev.detail.to}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const conv = (state.tables.ktn_consultations || []).find(c => c.id === ev.consultation_id);
          out.push({
            consultation_id: ev.consultation_id,
            owner_email: ev.detail.to,
            channel: conv?.channel || 'web',
            assigned_at: ev.created_at
          });
        }
        return out;
      };

      const runConsultationActionMock = (p_id, p_action, p_actor = null, p_admin = false, p_payload = {}) => {
        const consultations = state.tables.ktn_consultations || (state.tables.ktn_consultations = []);
        const messages = state.tables.ktn_consultation_messages || (state.tables.ktn_consultation_messages = []);
        const events = state.tables.ktn_consultation_events || (state.tables.ktn_consultation_events = []);
        const advisors = state.tables.ktn_advisors || [];
        const conv = consultations.find(c => c.id === p_id);
        if (!conv) return { error: 'not_found' };

        const nowIso = new Date().toISOString();
        const textBody = typeof p_payload?.body === 'string' ? p_payload.body.trim() : '';
        let senderType = null;
        let deliveryState = 'sent';

        if (p_action === 'customer') {
          if (['messenger', 'zalo_oa'].includes(conv.channel) && !p_payload?.external_id) {
            return { error: 'invalid' };
          }
          senderType = 'customer';
        } else if (p_action === 'external') {
          if (!['messenger', 'zalo_oa'].includes(conv.channel) || !p_payload?.external_id) {
            return { error: 'invalid' };
          }
          senderType = 'external';
          const noteTxt = conv.channel === 'zalo_oa' ? 'Đã có phản hồi từ Zalo OA' : 'Đã có phản hồi từ Fanpage';
          for (const m of messages) {
            if (m.consultation_id === conv.id && m.sender === 'bot' && m.delivery === 'queued') {
              m.delivery = 'failed';
              m.delivery_note = noteTxt;
            }
          }
        } else if (p_action === 'bot') {
          const convMsgs = messages
            .filter(m => m.consultation_id === conv.id)
            .sort((a, b) => (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0) || String(b.id).localeCompare(String(a.id)));
          const latest = convMsgs[0] || null;
          if (conv.status !== 'bot' || conv.owner_email !== null || (p_payload?.after_id ?? null) !== (latest?.id ?? null)) {
            return { error: 'conflict' };
          }
          senderType = 'bot';
        } else if (p_action === 'queue') {
          const convMsgs = messages
            .filter(m => m.consultation_id === conv.id)
            .sort((a, b) => (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0) || String(b.id).localeCompare(String(a.id)));
          const latest = convMsgs[0] || null;
          if (conv.status !== 'bot' || conv.owner_email !== null || (p_payload?.after_id ?? null) !== (latest?.id ?? null)) {
            return { error: 'conflict' };
          }
          conv.status = 'waiting';
          conv.queued_at = conv.queued_at || nowIso;
          conv.updated_at = nowIso;
          if (textBody) {
            messages.push({
              id: crypto.randomUUID(),
              consultation_id: conv.id,
              sender: 'system',
              actor_email: null,
              body: textBody,
              external_id: null,
              client_request_id: null,
              delivery: ['messenger', 'zalo_oa'].includes(conv.channel) ? 'queued' : 'sent',
              delivery_note: null,
              claimed_at: null,
              created_at: nowIso
            });
          }
          events.push({ id: ++state.autoId, consultation_id: conv.id, actor_email: null, kind: 'queued', detail: {}, created_at: nowIso });
          return { conversation: { ...conv } };
        } else {
          if (!p_admin && (!p_actor || !advisors.some(a => a.email === p_actor && a.active !== false))) {
            return { error: 'forbidden' };
          }
          if (p_action === 'claim' || p_action === 'assign') {
            if ((p_action === 'assign' && !p_admin) || conv.status === 'closed' || (p_action === 'claim' && conv.owner_email !== null)) {
              return { error: 'conflict' };
            }
            const target = p_action === 'claim' ? p_actor : (p_payload?.email ? String(p_payload.email).trim() : null);
            if (target && !advisors.some(a => a.email === target && a.active !== false)) {
              return { error: 'invalid' };
            }
            events.push({
              id: ++state.autoId,
              consultation_id: conv.id,
              actor_email: p_actor,
              kind: 'assigned',
              detail: { from: conv.owner_email, to: target },
              created_at: nowIso
            });
            for (const m of messages) {
              if (m.consultation_id === conv.id && m.sender === 'bot' && m.delivery === 'queued') {
                m.delivery = 'failed';
                m.delivery_note = 'Đã chuyển cho tư vấn viên';
              }
            }
            conv.owner_email = target;
            conv.status = target ? 'open' : 'waiting';
            conv.queued_at = conv.queued_at || nowIso;
            conv.updated_at = nowIso;
            return { conversation: { ...conv } };
          }
          if (!p_admin && conv.owner_email !== p_actor) {
            return { error: 'forbidden' };
          }
          if (['note', 'follow_up', 'close', 'reopen'].includes(p_action)) {
            if (p_action === 'note' && !textBody) return { error: 'invalid' };
            if (p_action === 'close' && !['registered', 'declined', 'no_response', 'other'].includes(p_payload?.outcome || '')) {
              return { error: 'invalid' };
            }
            if (p_action === 'close') {
              for (const m of messages) {
                if (m.consultation_id === conv.id && m.sender === 'bot' && m.delivery === 'queued') {
                  m.delivery = 'failed';
                  m.delivery_note = 'Đã đóng ca';
                }
              }
            }
            if (p_action === 'follow_up' && conv.status === 'closed') {
              return { error: 'conflict' };
            }
            if (p_action === 'follow_up') conv.follow_up_at = p_payload?.at || null;
            if (p_action === 'close') {
              conv.follow_up_at = null;
              conv.outcome = p_payload.outcome;
              conv.status = 'closed';
            } else if (p_action === 'reopen') {
              conv.outcome = null;
              conv.status = conv.owner_email ? 'open' : 'waiting';
            }
            conv.updated_at = nowIso;
            events.push({ id: ++state.autoId, consultation_id: conv.id, actor_email: p_actor, kind: p_action, detail: p_payload || {}, created_at: nowIso });
            return { conversation: { ...conv } };
          }
          if (p_action !== 'reply' || conv.status === 'closed' || conv.status === 'bot') {
            return { error: 'conflict' };
          }
          senderType = p_admin ? 'manager' : 'advisor';
        }

        if (!textBody || textBody.length > 4000) return { error: 'invalid' };
        if (conv.channel === 'messenger' && ['advisor', 'manager', 'bot'].includes(senderType)) {
          const lastCust = conv.last_customer_at ? Date.parse(conv.last_customer_at) : 0;
          if (!lastCust || lastCust < Date.now() - 24 * 3600 * 1000) {
            return { error: 'window_closed' };
          }
          deliveryState = 'queued';
        } else if (conv.channel === 'zalo_oa' && ['advisor', 'manager', 'bot'].includes(senderType)) {
          deliveryState = 'queued';
        } else {
          deliveryState = 'sent';
        }

        const rawExtId = p_payload?.external_id ? String(p_payload.external_id) : null;
        const clientReqId =
          (p_payload?.client_request_id && String(p_payload.client_request_id).trim()) ||
          (rawExtId && rawExtId.startsWith('staff:') ? rawExtId : null);
        const msgExtId = clientReqId && deliveryState === 'queued' ? null : rawExtId;

        if (msgExtId && messages.some(m => m.external_id === msgExtId)) {
          return { duplicate: true };
        }
        if (clientReqId && messages.some(m => m.consultation_id === conv.id && m.client_request_id === clientReqId)) {
          return { duplicate: true };
        }

        const msgRow = {
          id: crypto.randomUUID(),
          consultation_id: conv.id,
          sender: senderType,
          actor_email: p_actor,
          body: textBody,
          external_id: msgExtId,
          client_request_id: clientReqId,
          delivery: deliveryState,
          delivery_note: null,
          claimed_at: null,
          created_at: nowIso
        };
        messages.push(msgRow);

        if (senderType === 'customer') {
          const atTs = p_payload?.at ? Math.min(Date.now(), Date.parse(p_payload.at) || Date.now()) : Date.now();
          const prevTs = conv.last_customer_at ? Date.parse(conv.last_customer_at) : 0;
          conv.last_customer_at = new Date(Math.max(prevTs, atTs)).toISOString();
          if (conv.status === 'closed') {
            conv.status = conv.owner_email ? 'open' : 'waiting';
            conv.outcome = null;
            conv.queued_at = conv.queued_at || nowIso;
          }
        } else if (senderType === 'external' && conv.status === 'bot') {
          conv.status = 'waiting';
          conv.queued_at = conv.queued_at || nowIso;
        }
        if (conv.status === 'waiting') {
          conv.queued_at = conv.queued_at || nowIso;
        }
        if (['advisor', 'manager'].includes(senderType) && deliveryState === 'sent') {
          conv.first_reply_at = conv.first_reply_at || nowIso;
          conv.next_review_at = nowIso;
        }
        if (deliveryState === 'sent' && ['advisor', 'manager', 'bot', 'external'].includes(senderType)) {
          conv.last_reply_at = nowIso;
        }
        conv.updated_at = nowIso;
        return { conversation: { ...conv }, message: { ...msgRow } };
      };

      if (table === 'rpc/ktn_consultation_action' && method === 'POST') {
        const b = init.body ? JSON.parse(init.body) : {};
        return new Response(JSON.stringify(runConsultationActionMock(b.p_id, b.p_action, b.p_actor, Boolean(b.p_admin), b.p_payload || {})), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (table === 'rpc/ktn_consultation_auto_assign' && method === 'POST') {
        const b = init.body ? JSON.parse(init.body) : {};
        const conv = (state.tables.ktn_consultations || []).find(c => c.id === b.p_id);
        const advisors = (state.tables.ktn_advisors || []).filter(a => a.active !== false);
        if (!conv || conv.status !== 'waiting' || conv.owner_email !== null || advisors.length === 0) {
          return new Response(JSON.stringify(false), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        const counters = state.tables.ktn_consultation_advisor_counters || (state.tables.ktn_consultation_advisor_counters = []);
        const sorted = [...advisors].sort((a, c) => {
          const ca = counters.find(x => x.email === a.email)?.last_assigned_at || '';
          const cb = counters.find(x => x.email === c.email)?.last_assigned_at || '';
          if (ca !== cb) return ca < cb ? -1 : 1;
          return a.email.localeCompare(c.email);
        });
        const chosenAdv = sorted[0];
        const nowIso = new Date().toISOString();
        const existingCounter = counters.find(x => x.email === chosenAdv.email);
        if (existingCounter) existingCounter.last_assigned_at = nowIso;
        else counters.push({ email: chosenAdv.email, last_assigned_at: nowIso });
        conv.owner_email = chosenAdv.email;
        conv.status = 'open';
        conv.updated_at = nowIso;
        (state.tables.ktn_consultation_events || (state.tables.ktn_consultation_events = [])).push({
          id: ++state.autoId,
          consultation_id: conv.id,
          actor_email: null,
          kind: 'assigned',
          detail: { from: null, to: chosenAdv.email, mode: 'auto' },
          created_at: nowIso
        });
        return new Response(JSON.stringify(true), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (table === 'rpc/ktn_consultation_create_order' && method === 'POST') {
        const b = init.body ? JSON.parse(init.body) : {};
        const conv = (state.tables.ktn_consultations || []).find(c => c.id === b.p_id);
        if (!conv) return new Response(JSON.stringify({ error: 'not_found' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        const links = state.tables.ktn_consultation_orders || (state.tables.ktn_consultation_orders = []);
        const orders = state.tables.ktn_orders || (state.tables.ktn_orders = []);
        const existingLink = links.find(l => l.consultation_id === b.p_id && l.request_id === b.p_request_id);
        if (existingLink) {
          const existingOrd = orders.find(o => o.order_id === existingLink.order_id);
          if (existingOrd) return new Response(JSON.stringify(existingOrd), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        let candidate = '';
        for (let i = 0; i < 10; i++) {
          const tryId = 'ORD-' + String(100000 + Math.floor(Math.random() * 900000));
          if (!orders.some(o => o.order_id === tryId)) {
            candidate = tryId;
            break;
          }
        }
        const nowIso = new Date().toISOString();
        const po = b.p_order || {};
        const vSource = po.source || (conv.channel === 'zalo_oa' ? 'zalo_oa' : conv.channel === 'web' ? 'web_chat' : 'messenger');
        const vAdvisor = po.assigned_advisor || conv.owner_email || null;
        const createdOrder = {
          order_id: candidate,
          student_name: po.student_name || '',
          student_email: po.student_email || '',
          phone: po.phone || '',
          course_id: po.course_id || '',
          course_name: po.course_name || '',
          amount: Number(po.amount || 0),
          payment_method: 'VietQR',
          payment_status: 'pending_verification',
          approval_status: 'pending',
          note: po.note || '',
          source: vSource,
          assigned_advisor: vAdvisor,
          consultation_id: conv.id,
          created_at: nowIso,
          updated_at: nowIso
        };
        orders.unshift(createdOrder);
        links.push({
          order_id: candidate,
          consultation_id: conv.id,
          request_id: b.p_request_id,
          owner_email: conv.owner_email || null,
          payment_info: po.payment_info || {},
          created_at: nowIso
        });
        (state.tables.ktn_consultation_events || (state.tables.ktn_consultation_events = [])).push({
          id: ++state.autoId,
          consultation_id: conv.id,
          actor_email: vAdvisor,
          kind: 'order',
          detail: { order_id: candidate, source: vSource },
          created_at: nowIso
        });
        conv.updated_at = nowIso;
        if (conv.channel === 'zalo_oa' || (conv.channel === 'messenger' && conv.last_customer_at && Date.parse(conv.last_customer_at) > Date.now() - 86400000)) {
          (state.tables.ktn_consultation_messages || (state.tables.ktn_consultation_messages = [])).push({
            id: crypto.randomUUID(),
            consultation_id: conv.id,
            sender: 'system',
            actor_email: null,
            body: `Đơn ${candidate} · ${createdOrder.course_name}\nVietQR: ${String(b.p_qr_base || '').replace('ORDER_CODE', candidate)}`,
            external_id: null,
            client_request_id: null,
            delivery: 'queued',
            created_at: nowIso
          });
        }
        return new Response(JSON.stringify(createdOrder), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (table === 'rpc/ktn_consultation_record_payment' && method === 'POST') {
        const b = init.body ? JSON.parse(init.body) : {};
        const payments = state.tables.ktn_consultation_payments || (state.tables.ktn_consultation_payments = []);
        const orders = state.tables.ktn_orders || [];
        const links = state.tables.ktn_consultation_orders || [];
        const ord = orders.find(o => o.order_id === b.p_order);
        const link = links.find(l => l.order_id === b.p_order);
        if (!ord || !link) {
          return new Response(JSON.stringify({ unknown: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        const existingTx = payments.find(p => p.transaction_id === b.p_transaction);
        if (existingTx) {
          if (existingTx.order_id !== b.p_order || Number(existingTx.amount) !== Number(b.p_amount)) {
            return new Response(JSON.stringify({ conflict: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(JSON.stringify({ ...existingTx }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        const nowIso = new Date().toISOString();
        let nextStatus = 'accepted';
        if (['cancelled', 'refunded'].includes(ord.payment_status) || ord.approval_status === 'rejected') nextStatus = 'needs_review';
        else if (ord.payment_status === 'paid') nextStatus = 'duplicate';
        else if (Number(b.p_amount) !== Number(ord.amount)) nextStatus = 'mismatch';
        const row = {
          transaction_id: b.p_transaction,
          order_id: b.p_order,
          amount: Number(b.p_amount),
          status: nextStatus,
          attempts: 0,
          next_attempt_at: nowIso,
          error: null,
          created_at: nowIso
        };
        payments.push(row);
        if (nextStatus === 'accepted') {
          ord.payment_status = 'paid';
          ord.updated_at = nowIso;
          return new Response(JSON.stringify({ ...row }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ ...row, expected: ord.amount }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (table === 'rpc/ktn_consultation_take_payment' && method === 'POST') {
        const b = init.body ? JSON.parse(init.body) : {};
        const payments = state.tables.ktn_consultation_payments || [];
        const nowMs = Date.now();
        const claimed = [];
        for (const p of payments) {
          if (claimed.length >= 10) break;
          if (p.status !== 'accepted') continue;
          if (Number(p.attempts || 0) >= 6) continue;
          if (b.p_order && p.order_id !== b.p_order) continue;
          if (p.next_attempt_at && Date.parse(p.next_attempt_at) > nowMs) continue;
          p.attempts = Number(p.attempts || 0) + 1;
          p.next_attempt_at = new Date(nowMs + 5 * 60000).toISOString();
          claimed.push({ ...p });
        }
        return new Response(JSON.stringify(claimed), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (table === 'rpc/ktn_consultation_retry_payment' && method === 'POST') {
        const b = init.body ? JSON.parse(init.body) : {};
        const payments = state.tables.ktn_consultation_payments || [];
        const orders = state.tables.ktn_orders || [];
        const links = state.tables.ktn_consultation_orders || [];
        const payment = payments.find(p => p.transaction_id === b.p_transaction && p.order_id === b.p_order);
        const ord = orders.find(o => o.order_id === b.p_order);
        if (
          !payment ||
          !ord ||
          payment.status !== 'needs_review' ||
          Number(payment.attempts || 0) <= 0 ||
          ord.payment_status !== 'paid' ||
          ord.approval_status === 'rejected' ||
          Number(payment.amount) !== Number(ord.amount)
        ) {
          return new Response(JSON.stringify(false), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        payment.status = 'accepted';
        payment.next_attempt_at = new Date().toISOString();
        payment.error = null;
        const link = links.find(l => l.order_id === b.p_order);
        if (link?.consultation_id) {
          (state.tables.ktn_consultation_events || (state.tables.ktn_consultation_events = [])).push({
            id: ++state.autoId,
            consultation_id: link.consultation_id,
            actor_email: b.p_actor || null,
            kind: 'payment_retry',
            detail: { order_id: b.p_order, transaction_id: b.p_transaction },
            created_at: new Date().toISOString()
          });
        }
        return new Response(JSON.stringify(true), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (table === 'rpc/ktn_consultation_take_outbox' && method === 'POST') {
        const b = init.body ? JSON.parse(init.body) : {};
        const messages = state.tables.ktn_consultation_messages || [];
        const consultations = state.tables.ktn_consultations || [];
        const claimed = [];
        const nowIso = new Date().toISOString();
        for (const m of messages) {
          if (claimed.length >= 10) break;
          if (m.delivery !== 'queued') continue;
          if (b.p_id && m.consultation_id !== b.p_id) continue;
          const conv = consultations.find(c => c.id === m.consultation_id);
          if (!conv) continue;
          const withinMessengerWindow = conv.channel !== 'messenger' || (conv.last_customer_at && Date.parse(conv.last_customer_at) > Date.now() - 86400000);
          const validBotState = m.sender !== 'bot' || conv.status === 'bot';
          m.claimed_at = nowIso;
          if (withinMessengerWindow && validBotState) {
            m.delivery = 'sending';
            m.delivery_note = null;
          } else {
            m.delivery = 'failed';
            m.delivery_note = !withinMessengerWindow ? 'Ngoài cửa sổ Messenger' : 'Đã chuyển cho tư vấn viên';
          }
          claimed.push({ ...m });
        }
        return new Response(JSON.stringify(claimed), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (table === 'rpc/ktn_consultation_complete_send' && method === 'POST') {
        const b = init.body ? JSON.parse(init.body) : {};
        const messages = state.tables.ktn_consultation_messages || [];
        const consultations = state.tables.ktn_consultations || [];
        const msg = messages.find(m => m.id === b.p_id && m.delivery === 'sending');
        if (b.p_external_id && msg) {
          state.tables.ktn_consultation_messages = messages.filter(
            m => !(m.external_id === b.p_external_id && m.sender === 'external' && m.consultation_id === msg.consultation_id)
          );
        }
        if (msg) {
          msg.delivery = b.p_error ? 'failed' : 'sent';
          msg.delivery_note = b.p_error || null;
          if (b.p_external_id) msg.external_id = b.p_external_id;
          if (!b.p_error) {
            const conv = consultations.find(c => c.id === msg.consultation_id);
            if (conv) {
              conv.last_reply_at = msg.created_at;
              if (['advisor', 'manager'].includes(msg.sender)) {
                conv.first_reply_at = conv.first_reply_at || msg.created_at;
                conv.next_review_at = new Date().toISOString();
              }
            }
          }
        }
        return new Response(JSON.stringify(null), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (table === 'rpc/ktn_consultation_review_flag' && method === 'POST') {
        const b = init.body ? JSON.parse(init.body) : {};
        const flags = state.tables.ktn_consultation_flags || [];
        const flag = flags.find(f => f.consultation_id === b.p_id && f.message_id === b.p_message && f.status === 'pending');
        if (!flag) return new Response(JSON.stringify(false), { status: 200, headers: { 'Content-Type': 'application/json' } });
        flag.status = b.p_status;
        flag.reviewed_by = b.p_actor;
        flag.review_note = b.p_note || null;
        flag.reviewed_at = new Date().toISOString();
        (state.tables.ktn_consultation_events || (state.tables.ktn_consultation_events = [])).push({
          id: ++state.autoId,
          consultation_id: b.p_id,
          actor_email: b.p_actor,
          kind: 'review',
          detail: { message_id: b.p_message, decision: b.p_status },
          created_at: new Date().toISOString()
        });
        return new Response(JSON.stringify(true), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (table === 'rpc/ktn_consultation_upsert_zalo_inbound' && method === 'POST') {
        const b = init.body ? JSON.parse(init.body) : {};
        const pEventId = String(b.p_event_id || '').trim();
        const pEventName = String(b.p_event_name || '').trim() || 'unknown';
        const pZaloUserId = String(b.p_zalo_user_id || '').trim();
        const pPayload = b.p_payload && typeof b.p_payload === 'object' ? b.p_payload : {};
        if (!pEventId || !pZaloUserId) {
          return new Response(JSON.stringify({ ok: false, error: 'invalid' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        const zEvents = state.tables.ktn_zalo_oa_events || (state.tables.ktn_zalo_oa_events = []);
        if (zEvents.some(e => e.event_id === pEventId)) {
          return new Response(JSON.stringify({ ok: true, duplicate: true, event_id: pEventId }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        const nowIso = new Date().toISOString();
        const zEvent = { event_id: pEventId, event_name: pEventName, zalo_user_id: pZaloUserId, consultation_id: null, payload: pPayload, status: 'received', error: null, created_at: nowIso };
        zEvents.push(zEvent);
        const isEcho = ['true', 't', '1'].includes(String(pPayload.is_echo ?? 'false').toLowerCase());
        const botEnabled = Boolean((state.tables.ktn_consultation_guidance || [])[0]?.bot_enabled);
        const consultations = state.tables.ktn_consultations || (state.tables.ktn_consultations = []);
        let conv = consultations.find(c => c.channel === 'zalo_oa' && c.external_id === pZaloUserId);
        if (!conv) {
          conv = {
            id: crypto.randomUUID(),
            channel: 'zalo_oa',
            external_id: pZaloUserId,
            zalo_user_id: pZaloUserId,
            owner_email: null,
            status: botEnabled && !isEcho ? 'bot' : 'waiting',
            outcome: null,
            follow_up_at: null,
            queued_at: null,
            first_reply_at: null,
            last_customer_at: null,
            last_reply_at: null,
            next_review_at: null,
            customer_name: pPayload.customer_name || null,
            customer_phone: pPayload.customer_phone || null,
            source_tag: pPayload.source_tag || 'zalo_oa',
            lead_meta: pPayload.lead_meta && typeof pPayload.lead_meta === 'object' ? { ...pPayload.lead_meta } : {},
            student_code: null,
            created_at: nowIso,
            updated_at: nowIso
          };
          consultations.push(conv);
        } else {
          if (pPayload.customer_name) conv.customer_name = pPayload.customer_name;
          if (pPayload.customer_phone) conv.customer_phone = pPayload.customer_phone;
          if (pPayload.source_tag) conv.source_tag = pPayload.source_tag;
          if (pPayload.lead_meta && typeof pPayload.lead_meta === 'object') {
            conv.lead_meta = { ...(conv.lead_meta || {}), ...pPayload.lead_meta };
          }
          conv.updated_at = nowIso;
        }
        zEvent.consultation_id = conv.id;
        zEvent.status = 'processed';
        const vBody = typeof pPayload.body === 'string' ? pPayload.body.trim() : '';
        if (vBody) {
          const actionRes = runConsultationActionMock(conv.id, isEcho ? 'external' : 'customer', null, false, {
            external_id: 'zalo:' + pEventId,
            body: vBody,
            at: pPayload.at || nowIso
          });
          if (actionRes.error) {
            zEvent.status = 'failed';
            zEvent.error = actionRes.error;
            return new Response(JSON.stringify({ ok: false, error: actionRes.error, event_id: pEventId, conversation: { ...conv } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          if (actionRes.duplicate) {
            zEvent.status = 'duplicate';
            return new Response(JSON.stringify({ ok: true, duplicate: true, event_id: pEventId, conversation: { ...conv } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(JSON.stringify({ ok: true, duplicate: false, event_id: pEventId, conversation: actionRes.conversation, message: actionRes.message }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ ok: true, duplicate: false, event_id: pEventId, conversation: { ...conv } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (table === 'rpc/ktn_consultation_log_sepay_reconciliation' && method === 'POST') {
        const b = init.body ? JSON.parse(init.body) : {};
        const validKinds = ['unmatched', 'unknown_order', 'account_mismatch', 'mismatch', 'duplicate', 'needs_review', 'accepted'];
        if (!b.p_transaction_id || !validKinds.includes(b.p_kind)) {
          return new Response(JSON.stringify({ ok: false, error: 'invalid' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        const logs = state.tables.ktn_sepay_reconciliation_logs || (state.tables.ktn_sepay_reconciliation_logs = []);
        const existing = logs.find(l => l.transaction_id === b.p_transaction_id);
        if (existing) {
          return new Response(JSON.stringify({ ok: true, duplicate: true, log: existing }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        const ord = b.p_order_id ? (state.tables.ktn_orders || []).find(o => o.order_id === b.p_order_id) : null;
        const link = b.p_order_id ? (state.tables.ktn_consultation_orders || []).find(l => l.order_id === b.p_order_id) : null;
        const nowIso = new Date().toISOString();
        const created = {
          id: crypto.randomUUID(),
          transaction_id: b.p_transaction_id,
          order_id: ord?.order_id || null,
          claimed_order_code: b.p_claimed_order_code || b.p_order_id || null,
          consultation_id: ord?.consultation_id || link?.consultation_id || null,
          kind: b.p_kind,
          amount: Number(b.p_amount || 0),
          expected_amount: b.p_expected_amount ?? null,
          account_number: b.p_account_number || null,
          transfer_content: b.p_transfer_content || null,
          raw_payload: b.p_raw_payload || {},
          resolution_status: 'open',
          resolved_by: null,
          resolved_at: null,
          resolution_note: null,
          created_at: nowIso,
          updated_at: nowIso
        };
        logs.unshift(created);
        return new Response(JSON.stringify({ ok: true, duplicate: false, log: created }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (table === 'rpc/ktn_consultation_list_sepay_reconciliation' && method === 'POST') {
        const b = init.body ? JSON.parse(init.body) : {};
        const limit = Math.max(1, Math.min(200, Number(b.p_limit || 50)));
        const offset = Math.max(0, Number(b.p_offset || 0));
        if (b.p_resolution_status && !['open', 'resolved', 'ignored'].includes(b.p_resolution_status)) {
          return new Response(JSON.stringify({ ok: false, error: 'invalid' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (b.p_kind && !['unmatched', 'unknown_order', 'account_mismatch', 'mismatch', 'duplicate', 'needs_review', 'accepted'].includes(b.p_kind)) {
          return new Response(JSON.stringify({ ok: false, error: 'invalid' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        const filtered = (state.tables.ktn_sepay_reconciliation_logs || []).filter(r => {
          if (b.p_resolution_status && r.resolution_status !== b.p_resolution_status) return false;
          if (b.p_kind && r.kind !== b.p_kind) return false;
          return true;
        });
        return new Response(
          JSON.stringify({ ok: true, items: filtered.slice(offset, offset + limit), total: filtered.length, limit, offset }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (table === 'rpc/ktn_consultation_resolve_sepay_reconciliation' && method === 'POST') {
        const b = init.body ? JSON.parse(init.body) : {};
        if (!['open', 'resolved', 'ignored'].includes(b.p_resolution_status || '')) {
          return new Response(JSON.stringify({ ok: false, error: 'invalid' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        const logs = state.tables.ktn_sepay_reconciliation_logs || [];
        const row = logs.find(r => r.transaction_id === b.p_transaction_id);
        if (!row) return new Response(JSON.stringify({ ok: false, error: 'not_found' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        let linkedConsult = row.consultation_id;
        if (b.p_order_id) {
          const ord = (state.tables.ktn_orders || []).find(o => o.order_id === b.p_order_id);
          if (!ord) return new Response(JSON.stringify({ ok: false, error: 'order_not_found' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          linkedConsult = ord.consultation_id || (state.tables.ktn_consultation_orders || []).find(l => l.order_id === b.p_order_id)?.consultation_id || linkedConsult;
          row.order_id = b.p_order_id;
        }
        const nowIso = new Date().toISOString();
        row.resolution_status = b.p_resolution_status;
        row.resolved_by = b.p_resolution_status === 'open' ? null : (b.p_actor || null);
        row.resolved_at = b.p_resolution_status === 'open' ? null : nowIso;
        if (b.p_note) row.resolution_note = b.p_note;
        row.consultation_id = linkedConsult || null;
        row.updated_at = nowIso;
        if (row.consultation_id) {
          (state.tables.ktn_consultation_events || (state.tables.ktn_consultation_events = [])).push({
            id: ++state.autoId,
            consultation_id: row.consultation_id,
            actor_email: b.p_actor || null,
            kind: 'sepay_reconciliation',
            detail: { transaction_id: b.p_transaction_id, resolution_status: b.p_resolution_status, order_id: row.order_id },
            created_at: nowIso
          });
        }
        return new Response(JSON.stringify({ ok: true, log: row }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (table === 'rpc/ktn_consultation_link_student' && method === 'POST') {
        const b = init.body ? JSON.parse(init.body) : {};
        const conv = (state.tables.ktn_consultations || []).find(c => c.id === b.p_consultation_id);
        if (!conv) return new Response(JSON.stringify({ ok: false, error: 'not_found' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        const stu = (state.tables.ktn_students || []).find(s => s.code === b.p_student_code);
        if (!stu) return new Response(JSON.stringify({ ok: false, error: 'student_not_found' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        const nowIso = new Date().toISOString();
        conv.student_code = stu.code;
        if (!conv.customer_name && stu.name) conv.customer_name = stu.name;
        if (!conv.customer_phone && stu.phone) conv.customer_phone = stu.phone;
        conv.updated_at = nowIso;
        stu.consultation_id = conv.id;
        if (!stu.zalo_user_id && conv.zalo_user_id) stu.zalo_user_id = conv.zalo_user_id;
        if (!stu.lead_source) stu.lead_source = conv.source_tag || conv.channel;
        stu.updated_at = nowIso;
        (state.tables.ktn_consultation_events || (state.tables.ktn_consultation_events = [])).push({
          id: ++state.autoId,
          consultation_id: conv.id,
          actor_email: b.p_actor || null,
          kind: 'student_linked',
          detail: { student_code: stu.code },
          created_at: nowIso
        });
        return new Response(JSON.stringify({ ok: true, conversation: { ...conv }, student_code: stu.code }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (table.startsWith('rpc/')) {
        return new Response(JSON.stringify({ message: `Unmocked RPC ${table}` }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (table === 'ktn_messages' && method === 'POST' && state.faults.failMessagesPost) {
        return new Response(JSON.stringify({ message: 'Simulated database error' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (table === 'ktn_messages' && method === 'GET' && state.faults.failMessagesGet) {
        return new Response(JSON.stringify({ message: 'Simulated database error' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (table === 'ktn_homeworks' && method === 'POST' && state.faults.failHomeworkPost) {
        return new Response(JSON.stringify({ message: 'Simulated database error' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (
        table.startsWith('ktn_students') &&
        (method === 'POST' || method === 'PATCH') &&
        (state.faults.failStudentCoursesPost || state.faults.failStudentSupabasePatch)
      ) {
        return new Response(JSON.stringify({ message: 'Simulated database write error for student entitlements' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (table === 'ktn_teachers' && state.faults.failTeacherPatchByCodeEq && u.searchParams.has('code')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (table === 'ktn_dlp_alerts' && (method === 'POST' || method === 'PATCH') && state.faults.failDlpAlertsPost) {
        return new Response(JSON.stringify({ code: '23502', message: 'Simulated ktn_dlp_alerts write failure' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      let rows;
      if (table === 'ktn_consultation_inbox') rows = buildInboxRows();
      else if (table === 'ktn_consultation_paid_report') rows = buildPaidReportRows();
      else if (table === 'ktn_consultation_assignment_report') rows = buildAssignmentReportRows();
      else rows = state.tables[table] || (state.tables[table] = []);

      if (method === 'GET') {
        let sourceRows = rows;
        if (table === 'ktn_consultation_flags') {
          sourceRows = rows.map(f => ({
            ...f,
            ktn_consultations: (state.tables.ktn_consultations || []).find(c => c.id === f.consultation_id) || null,
            ktn_consultation_messages: (state.tables.ktn_consultation_messages || []).find(m => m.id === f.message_id) || null
          }));
        } else if (table === 'ktn_consultation_orders') {
          sourceRows = rows.map(l => {
            const ord = (state.tables.ktn_orders || []).find(o => o.order_id === l.order_id) || null;
            const pays = (state.tables.ktn_consultation_payments || []).filter(p => p.order_id === l.order_id);
            return {
              ...l,
              ktn_orders: ord ? { ...ord, ktn_consultation_payments: pays } : null
            };
          });
        } else if (table === 'ktn_courses') {
          const explicitIds = new Set(rows.map(c => String(c.course_id || '').trim()).filter(Boolean));
          sourceRows = [
            ...rows,
            ...DEFAULT_LOCAL_CATALOG_COURSES.filter(c => !explicitIds.has(String(c.course_id || '').trim())).map(c => ({ ...c }))
          ];
        }
        const matched = sourceRows.filter(r => matchQueryFilters(r, u.searchParams));
        const orderParam = String(u.searchParams.get('order') || '');
        if (orderParam) {
          const orderCols = orderParam
            .split(',')
            .map(seg => seg.trim())
            .filter(Boolean)
            .map(seg => {
              const parts = seg.split('.');
              return { col: parts[0], desc: parts[1] === 'desc' };
            });
          matched.sort((a, b) => {
            for (const { col, desc } of orderCols) {
              const av = a[col];
              const bv = b[col];
              let cmp = 0;
              if (av === bv) cmp = 0;
              else if (av === null || av === undefined) cmp = 1;
              else if (bv === null || bv === undefined) cmp = -1;
              else if (typeof av === 'boolean' && typeof bv === 'boolean') cmp = av === bv ? 0 : (av ? -1 : 1);
              else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
              else {
                const ats = col.endsWith('_at') ? Date.parse(String(av)) : NaN;
                const bts = col.endsWith('_at') ? Date.parse(String(bv)) : NaN;
                if (Number.isFinite(ats) && Number.isFinite(bts)) cmp = ats - bts;
                else cmp = String(av).localeCompare(String(bv));
              }
              if (cmp !== 0) return desc ? -cmp : cmp;
            }
            return 0;
          });
        }
        const totalMatched = matched.length;
        const offset = Math.max(0, Number(u.searchParams.get('offset') || 0));
        const limit = Number(u.searchParams.get('limit') || 0);
        const paged = limit > 0 ? matched.slice(offset, offset + limit) : matched.slice(offset);
        return new Response(JSON.stringify(paged), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Range': `${offset}-${Math.max(offset, offset + paged.length - 1)}/${totalMatched}`
          }
        });
      }

      if (method === 'POST') {
        const body = init.body ? JSON.parse(init.body) : {};
        const items = Array.isArray(body) ? body : [body];
        const onConflict = u.searchParams.get('on_conflict');
        const prefer = String((init.headers && (init.headers.Prefer || init.headers.prefer)) || '');
        const ignoreDup = prefer.includes('resolution=ignore-duplicates');
        const isUpsert = Boolean(onConflict || prefer.includes('resolution=merge-duplicates') || ignoreDup);
        const pkByTable = {
          ktn_students: 'email',
          ktn_orders: 'order_id',
          ktn_teachers: 'code',
          ktn_classes: 'id',
          ktn_attendance: 'id',
          ktn_provisioning_jobs: 'operation_id',
          ktn_payment_config: 'id',
          ktn_advisors: 'email',
          ktn_courses: 'course_id',
          ktn_consultations: 'id',
          ktn_consultation_messages: 'id',
          ktn_consultation_flags: 'message_id',
          ktn_consultation_guidance: 'id',
          ktn_consultation_orders: 'order_id',
          ktn_consultation_payments: 'transaction_id',
          ktn_zalo_oa_events: 'event_id',
          ktn_sepay_reconciliation_logs: 'transaction_id'
        };
        const defaultPk = pkByTable[table] || 'id';
        const out = [];
        for (const item of items) {
          if (table === 'ktn_provisioning_jobs' && item.idempotency_key && !isUpsert) {
            const dupIdem = rows.find(
              r => r.idempotency_key && String(r.idempotency_key) === String(item.idempotency_key)
            );
            if (dupIdem) {
              return new Response(
                JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint' }),
                { status: 409, headers: { 'Content-Type': 'application/json' } }
              );
            }
          }
          if (table === 'ktn_messages' && item.id && !isUpsert) {
            const dupMsg = rows.find(r => r.id && String(r.id) === String(item.id));
            if (dupMsg) {
              return new Response(
                JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint "ktn_messages_pkey"' }),
                { status: 409, headers: { 'Content-Type': 'application/json' } }
              );
            }
          }
          let existingIdx = -1;
          if (onConflict) {
            const keys = onConflict.split(',').map(s => s.trim());
            existingIdx = rows.findIndex(r => keys.every(k => String(r[k] ?? '').toLowerCase() === String(item[k] ?? '').toLowerCase()));
          } else if (item[defaultPk]) {
            existingIdx = rows.findIndex(r => String(r[defaultPk] || '').toLowerCase() === String(item[defaultPk] || '').toLowerCase());
          } else if (item.id) {
            existingIdx = rows.findIndex(r => r.id === item.id);
          }
          if (existingIdx >= 0 && !isUpsert) {
            return new Response(
              JSON.stringify({ code: '23505', message: `duplicate key value violates unique constraint on "${table}"` }),
              { status: 409, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (existingIdx >= 0) {
            if (!ignoreDup) {
              rows[existingIdx] = { ...rows[existingIdx], ...item };
              out.push(rows[existingIdx]);
            }
          } else {
            const created = {
              id: item.id || (table.startsWith('ktn_consultation') || table === 'ktn_zalo_oa_events' || table === 'ktn_sepay_reconciliation_logs' ? crypto.randomUUID() : ('SB-' + (++state.autoId) + '-' + Date.now())),
              created_at: item.created_at || new Date().toISOString(),
              updated_at: item.updated_at || new Date().toISOString(),
              ...item
            };
            rows.unshift(created);
            out.push(created);
          }
        }
        return new Response(JSON.stringify(out), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (method === 'PATCH') {
        const patch = init.body ? JSON.parse(init.body) : {};
        if (
          table === 'ktn_teachers' &&
          state.faults.strictPreV3TeacherSchema &&
          (Object.prototype.hasOwnProperty.call(patch, 'assigned_classes') ||
            Object.prototype.hasOwnProperty.call(patch, 'assigned_courses'))
        ) {
          const missingCol = Object.prototype.hasOwnProperty.call(patch, 'assigned_classes')
            ? 'assigned_classes'
            : 'assigned_courses';
          return new Response(
            JSON.stringify({
              code: 'PGRST204',
              details: null,
              hint: null,
              message: `Could not find the '${missingCol}' column of 'ktn_teachers' in the schema cache`
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (table === 'ktn_teachers' && state.faults.zeroRowsTeacherPatch) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        if (table === 'ktn_classes' && state.faults.failClassesPatch) {
          return new Response(JSON.stringify({ code: 'PGRST500', message: 'Simulated ktn_classes PATCH failure' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        const matched = rows.filter(r => matchQueryFilters(r, u.searchParams));
        matched.forEach(r => Object.assign(r, patch));
        return new Response(JSON.stringify(matched), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (method === 'DELETE') {
        const keep = rows.filter(r => !matchQueryFilters(r, u.searchParams));
        state.tables[table] = keep;
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (u.hostname.endsWith('amazonaws.com')) {
      const p = u.pathname;
      if (p.endsWith('/signin') && method === 'POST') {
        const body = init.body ? JSON.parse(init.body) : {};
        const email = String(body.email || '').toLowerCase();
        let decodedPwd = '';
        try {
          decodedPwd = Buffer.from(String(body.password || ''), 'base64').toString('utf8');
        } catch {
          decodedPwd = String(body.password || '');
        }
        if (decodedPwd.length < 6 || decodedPwd === 'wrong-password' || /^(?:wrong|invalid|bad)[-_]/i.test(decodedPwd)) {
          return new Response(JSON.stringify({ message: 'Invalid credentials' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const stu = state.tables.ktn_students.find(s => s.email.toLowerCase() === email);
        if (stu && (stu.cognito_user_id || !/^2026\d{4,}$/i.test(String(stu.code || '').trim()))) {
          return new Response(JSON.stringify({
            accessToken: 'mock-student-jwt-' + stu.code,
            id: stu.cognito_user_id || stu.code,
            userId: stu.cognito_user_id || stu.code,
            studentId: stu.izteach_student_id || stu.code,
            email: stu.email,
            name: stu.name,
            roles: ['student'],
            type: 'student'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        const teacher = state.tables.ktn_teachers.find(t => t.email.toLowerCase() === email);
        if (teacher && (teacher.cognito_user_id || !/^GV\d+$/i.test(String(teacher.code || '').trim()))) {
          return new Response(JSON.stringify({
            accessToken: 'mock-teacher-jwt-' + teacher.code,
            id: teacher.code,
            userId: teacher.code,
            email: teacher.email,
            name: teacher.name,
            roles: ['teacher'],
            type: 'teacher'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (email === 'hocvienkhongtunhi123@gmail.com' || email === 'quanly@khongtunhi.com') {
          return new Response(JSON.stringify({
            token: 'mock-izteach-admin-token',
            accessToken: 'mock-izteach-admin-token',
            id: '2c01e488-d866-4341-a0db-644fe6ba1202',
            userId: '2c01e488-d866-4341-a0db-644fe6ba1202',
            email,
            name: 'Ban Quản Lý KTN',
            roles: ['root', 'admin'],
            type: 'admin'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ message: 'Invalid credentials' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (p.endsWith('/prod/student')) {
        if (method === 'GET') {
          const emailQ = String(u.searchParams.get('email') || '').toLowerCase();
          const list = emailQ
            ? state.izteach.students.filter(s => String(s.email || '').toLowerCase() === emailQ)
            : state.izteach.students;
          return new Response(JSON.stringify({ data: list }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        if (method === 'POST') {
          const body = init.body ? JSON.parse(init.body) : {};
          const seq = String(state.izteach.students.length + 1).padStart(4, '0');
          const generatedCognitoUid = body.dynamoId || body.userId || (`bbbb1111-2222-3333-4444-00000000${seq}`);
          const created = {
            _id: '66fb0000000000000000' + seq,
            id: '66fb0000000000000000' + seq,
            dynamoId: generatedCognitoUid,
            userId: generatedCognitoUid,
            ...body
          };
          state.izteach.students.push(created);
          if (!state.izteach.permissionsByUid[generatedCognitoUid]) {
            state.izteach.permissionsByUid[generatedCognitoUid] = [];
          }
          return new Response(JSON.stringify(created), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      if (p.endsWith('/prod/user-permission') && method === 'GET') {
        const uid = u.searchParams.get('userId');
        const permRecords = getOrInitPermissionRecords(uid);
        const nowMs = Date.now();
        const permissions = permRecords.map(r => {
          const isExp = r.limitTime ? Date.parse(r.limitTime) < nowMs : false;
          r.isExpired = isExp;
          return { ...r, isExpired: isExp };
        });
        const courses = state.izteach.permissionsByUid[uid] || [];
        const onlineCourses = courses.map(id => {
          const matchingPerms = permissions.filter(pr => (pr.onlineCourses || []).map(String).includes(String(id)));
          const hasActivePerm = matchingPerms.length === 0 ? true : matchingPerms.some(pr => !pr.isExpired);
          return {
            _id: id,
            id,
            isExpired: !hasActivePerm,
            permissions: matchingPerms.map(pr => ({
              _id: pr._id || pr.id,
              id: pr._id || pr.id,
              userPermissionId: pr._id || pr.id,
              limitTime: pr.limitTime,
              isExpired: pr.isExpired
            }))
          };
        });
        return new Response(JSON.stringify({
          userId: uid,
          onlineCourses,
          permissions
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (p.includes('/prod/user-permission/add-products/') && method === 'PUT') {
        if (state.faults.failStudentCoursesPost) {
          return new Response(JSON.stringify({ message: 'Simulated izTeach add-products 502 error' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        const uid = decodeURIComponent(p.split('/add-products/')[1]);
        const body = init.body ? JSON.parse(init.body) : {};
        const current = new Set(state.izteach.permissionsByUid[uid] || []);
        for (const cid of (body.productIds || body.onlineCourses || [])) current.add(String(cid));
        state.izteach.permissionsByUid[uid] = Array.from(current);
        getOrInitPermissionRecords(uid);
        return new Response(JSON.stringify({ ok: true, onlineCourses: state.izteach.permissionsByUid[uid] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (p.includes('/prod/user-permission/remove-products/') && method === 'PUT') {
        if (state.faults.failStudentCoursesPost) {
          return new Response(JSON.stringify({ message: 'Simulated izTeach remove-products 502 error' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        const uid = decodeURIComponent(p.split('/remove-products/')[1]);
        const body = init.body ? JSON.parse(init.body) : {};
        const toRemove = new Set((body.productIds || body.onlineCourses || []).map(String));
        const current = (state.izteach.permissionsByUid[uid] || []).filter(cid => !toRemove.has(String(cid)));
        state.izteach.permissionsByUid[uid] = current;
        getOrInitPermissionRecords(uid);
        return new Response(JSON.stringify({ ok: true, onlineCourses: current }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (p.includes('/prod/user-permission/set-limited-time/') && method === 'PUT') {
        if (state.faults.failSetLimitedTime) {
          return new Response(JSON.stringify({ message: 'Simulated izTeach set-limited-time 502 error' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        const permId = decodeURIComponent(p.split('/set-limited-time/')[1]);
        const body = init.body ? JSON.parse(init.body) : {};
        const rawLimit = body.limitTime;
        let normalizedIso = null;
        if (rawLimit !== null && rawLimit !== undefined && String(rawLimit).trim() !== '') {
          const ymd = String(rawLimit).trim().slice(0, 10);
          normalizedIso = `${ymd}T23:59:59.999Z`;
        }
        let updatedRecord = null;
        for (const uid of Object.keys(state.izteach.permissionsByUid)) {
          const recs = getOrInitPermissionRecords(uid);
          for (const rec of recs) {
            if (String(rec._id || rec.id) === String(permId)) {
              rec.limitTime = normalizedIso;
              rec.isExpired = normalizedIso ? Date.parse(normalizedIso) < Date.now() : false;
              updatedRecord = rec;
            }
          }
        }
        if (!updatedRecord) {
          return new Response(JSON.stringify({ message: 'UserPermission not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify(updatedRecord), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if ((p.endsWith('/prod/unit') || p.endsWith('/prod/courses/units')) && method === 'GET') {
        const cid = u.searchParams.get('course') || '6adadba969897b0002482ca5';
        if (cid === '6adadba969897b0002482ca5') {
          if (hsk1MappingTable.length > 0) {
            const units = hsk1MappingTable.map((m, uIdx) => {
              const vid = (Array.isArray(m.resourceIds) && m.resourceIds[0]) || '';
              return {
                _id: m.unitId,
                id: m.unitId,
                index: uIdx,
                course: cid,
                section: m.chapterId || '6adadbaf69897b0002482cb5',
                title: m.rawTitle,
                type: 'video',
                video: vid,
                videoId: vid,
                streamUrl: vid
                  ? `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/${vid}/playlist.m3u8`
                  : '',
                duration: m.duration || '12:00'
              };
            });
            return new Response(JSON.stringify(units), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          const units = [];
          let uIdx = 0;
          for (const lesson of hsk1Lessons) {
            const parts = Array.isArray(lesson.parts) && lesson.parts.length > 0 ? lesson.parts : [{}];
            for (const pt of parts) {
              const unitId = pt.unitId || `6adadbcaf75fe5000247ca${String(uIdx + 71).padStart(2, '0')}`;
              units.push({
                _id: unitId,
                id: unitId,
                index: uIdx++,
                course: cid,
                section: '6adadbaf69897b0002482cb5',
                title: pt.rawTitle || pt.title || `HSK1_Bài ${pt.partNumber || lesson.num}`,
                type: 'video',
                video: pt.videoId || pt.url || pt.streamUrl || '',
                videoId: pt.videoId || '',
                streamUrl: pt.url || pt.streamUrl || '',
                duration: pt.duration || lesson.duration || '12:00'
              });
            }
          }
          return new Response(JSON.stringify(units), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        const rawLessons = allCoursesLessons[cid] || [];
        const units = [];
        let uIdx = 0;
        const parseDurationSeconds = (durStr, fallbackSec = 600) => {
          if (typeof durStr === 'number' && Number.isFinite(durStr) && durStr > 0) return Math.round(durStr);
          const m = String(durStr || '').trim().match(/^(\d+):(\d{1,2})$/);
          if (m) return Number(m[1]) * 60 + Number(m[2]);
          return fallbackSec;
        };
        for (let idx = 0; idx < rawLessons.length; idx++) {
          const lesson = rawLessons[idx];
          const partsList = Array.isArray(lesson.parts) && lesson.parts.length > 0 ? lesson.parts : [{}];
          const syllabus = (Array.isArray(lesson.docs) ? lesson.docs : []).map((d, dIdx) => ({
            _id: `${cid}-doc-${idx + 1}-${dIdx + 1}`,
            title: d.name || `Tài liệu Bài ${idx + 1}`,
            link: String(d.url || '').replace(/^https?:\/\/[^/]+\//, ''),
            origin: { link: String(d.url || '').replace(/^https?:\/\/[^/]+\//, '') }
          }));
          const isMultiPartLesson = partsList.length > 1;
          for (let pIdx = 0; pIdx < partsList.length; pIdx++) {
            const pt = partsList[pIdx] || {};
            const videoUnitId = pt.videoUnitId || pt.unitId || `6adadbcaf75fe5000247ca${String(idx + 71).padStart(2, '0')}`;
            const hwUnitId = pt.unitId || videoUnitId;
            const lNum = lesson.num || idx + 1;
            const partDuration = isMultiPartLesson ? (pt.duration || lesson.duration || '10:00') : (lesson.duration || pt.duration || '12:00');
            const partDurationSeconds = pt.durationSeconds || parseDurationSeconds(partDuration, isMultiPartLesson ? 600 : 720);
            const partNumber = isMultiPartLesson
              ? `${lNum}.${pt.partNum || pt.part || (pIdx + 1)}`
              : String(pt.partNum || pt.part || lNum);
            const partTitle = isMultiPartLesson
              ? (pt.partTitle || pt.title || `Bài ${partNumber}`)
              : (lesson.titleZh || pt.title || `Bài ${idx + 1}`);
            units.push({
              _id: videoUnitId,
              id: videoUnitId,
              index: uIdx++,
              num: lNum,
              lessonNumber: lNum,
              ...(isMultiPartLesson ? { partNumber, partTitle, durationSeconds: partDurationSeconds } : {}),
              course: cid,
              title: partTitle,
              type: 'video',
              video: pt.videoId || pt.streamUrl || '',
              videoId: pt.videoId || '',
              streamUrl: pt.streamUrl || '',
              posterUrl: pt.posterUrl || '',
              duration: partDuration,
              syllabus: pIdx === 0 ? syllabus : []
            });
            if (hwUnitId !== videoUnitId) {
              units.push({
                _id: hwUnitId,
                id: hwUnitId,
                index: uIdx++,
                num: lNum,
                course: cid,
                title: `Assignment ${lNum}`,
                type: 'homework'
              });
            }
          }
        }
        return new Response(JSON.stringify(units), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (p.includes('/signed-url')) {
        const key = u.searchParams.get('key') || `resource/homeworks/default/${Date.now()}.wav`;
        return new Response(JSON.stringify({
          url: `/__local_s3_upload?key=${encodeURIComponent(key)}`
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (p.endsWith('/prod/homework') && method === 'POST') {
        const body = init.body ? JSON.parse(init.body) : {};
        const rec = { _id: 'izhw_' + (++state.autoId), ...body };
        state.izteach.homeworkPosts.push(rec);
        return new Response(JSON.stringify(rec), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (p.endsWith('/prod/homework') && method === 'GET') {
        return new Response(JSON.stringify({ data: state.izteach.homeworkPosts }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (u.hostname === 'api.resend.com') {
      return new Response(JSON.stringify({ id: 'mock-resend-' + (++state.autoId) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (u.hostname === 'openapi.zalo.me' || u.hostname === 'oauth.zaloapp.com') {
      if (u.hostname === 'oauth.zaloapp.com') {
        return new Response(JSON.stringify({ access_token: 'mock-zalo-access-token', refresh_token: 'mock-zalo-refresh', expires_in: 3600 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ error: 0, message: 'Success', data: { message_id: 'mock_zalo_' + (++state.autoId) } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (u.hostname === 'generativelanguage.googleapis.com') {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      reply: 'Bé nhà mình đang ở độ tuổi nào để cô gợi ý lộ trình phù hợp ạ?',
                      course_id: '',
                      handoff: false
                    })
                  }
                ]
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (
      u.hostname === 'media.izteach.vn' ||
      u.hostname.endsWith('.test') ||
      (u.hostname === 'd21acfi38wn3iy.cloudfront.net' && u.pathname.startsWith('/resource/documents/'))
    ) {
      const cleanInit = { ...init };
      delete cleanInit.cf;
      if (cleanInit.headers && typeof cleanInit.headers.entries === 'function') {
        cleanInit.headers = Object.fromEntries(cleanInit.headers.entries());
      }
      return workerFetchAls.run(null, () => globalThis.fetch(u.toString(), cleanInit));
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': '4096'
      }
    });
  }

  let workerCode = fs.readFileSync(WORKER_PATH, 'utf8');
  workerCode = workerCode.replace(/export\s+default\s+\{/, 'module.exports = {');
  workerCode = workerCode.replace(
    /\bimport\s*\(\s*(['"]\.\/[^'"]+\.m?js['"])\s*\)/g,
    '__ktnDynamicImport($1)'
  );

  const NativeUint8Array = Object.getPrototypeOf(Buffer);
  const NativeArrayBuffer = new NativeUint8Array(0).buffer.constructor;
  const NativeDataView = new DataView(new NativeArrayBuffer(0)).constructor;

  const sandbox = {
    module: { exports: {} },
    exports: {},
    fetch: mockFetch,
    Request,
    Response,
    Headers,
    URL,
    URLSearchParams,
    crypto: crypto.webcrypto || globalThis.crypto,
    AbortController,
    AbortSignal,
    TextEncoder: NodeTextEncoder,
    TextDecoder: NodeTextDecoder,
    atob: globalThis.atob || (str => Buffer.from(str, 'base64').toString('binary')),
    btoa: globalThis.btoa || (str => Buffer.from(str, 'binary').toString('base64')),
    console,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
    Array,
    ArrayBuffer: NativeArrayBuffer,
    Uint8Array: NativeUint8Array,
    Uint32Array,
    Int32Array,
    DataView: NativeDataView,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    Promise,
    Error,
    TypeError,
    encodeURIComponent,
    decodeURIComponent,
    unescape,
    escape,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    __ktnDynamicImport: (specifier) => {
      const target = path.resolve(REPO_ROOT, specifier);
      if (!target.startsWith(REPO_ROOT + path.sep)) {
        throw new Error(`Disallowed dynamic import: ${specifier}`);
      }
      return import(pathToFileURL(target).href);
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(workerCode, sandbox, {
    filename: WORKER_PATH,
    ...(vm.constants?.USE_MAIN_CONTEXT_DEFAULT_LOADER
      ? { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER }
      : {})
  });

  const workerModule = sandbox.module.exports;
  const env = {
    SUPABASE_URL: 'https://mock-supabase.local',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key',
    IZTEACH_VENDOR_ID: '3529cd2b-7af6-4fda-887c-392a79393d6a',
    IZTEACH_ADMIN_EMAIL: 'hocvienkhongtunhi123@gmail.com',
    IZTEACH_ADMIN_PASSWORD: 'Ktn@2026!AdminPassword',
    KTN_STAFF_AND_TEST_PASSWORD: 'Ktn@2026!',
    KTN_SESSION_SECRET: 'ktn-v2-local-hmac-secret-2026',
    KTN_WEBHOOK_SECRET: 'mock-webhook-secret-2026',
    KTN_CONSULTATIONS_ENABLED: 'true',
    KTN_CONSULTATION_MODE: 'full',
    KTN_CONSULTATION_SECRET: 'ktn-local-consultation-secret-2026',
    KTN_CONSULTATION_AUTH_KEY: 'mock-consultation-auth-key',
    KTN_CONSULTATION_PUBLIC_URL: 'http://localhost:5173',
    KTN_ZALO_SANDBOX: 'true',
    KTN_AI_SANDBOX: 'true',
    KTN_SEPAY_SANDBOX: 'true',
    KTN_ZALO_APP_ID: '1000000000000000001',
    KTN_ZALO_APP_SECRET: 'mock-zalo-app-secret-2026',
    KTN_ZALO_OA_ID: '2000000000000000001',
    KTN_SEPAY_API_KEY: 'mock-sepay-apikey-2026',
    KTN_SEPAY_BANK_ID: 'MB',
    KTN_SEPAY_ACCOUNT_NO: '0988888888',
    KTN_SEPAY_ACCOUNT_NAME: 'HOC VIEN KHONG TU NHI',
    KTN_CONSULTATION_MAIL_KEY: 'mock-resend-key-2026',
    KTN_CONSULTATION_MAIL_FROM: 'KTN <noreply@khongtunhi.local>',
    KTN_GEMINI_MODEL: 'gemini-2.5-flash',
    KTN_GEMINI_KEYS: '',
    KTN_CONSULTATION_LIMIT: { limit: async () => ({ success: true }) }
  };

  return {
    state,
    env,
    workerModule,
    async handleRequest(req, res, next) {
      const url = req.url || '/';
      if (url.startsWith('/__local_s3_upload')) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const buf = Buffer.concat(chunks);
        const u = new URL(url, 'http://localhost');
        const key = u.searchParams.get('key') || 'upload.bin';
        state.uploadedBlobs.set(key, { size: buf.length || 2048, uploadedAt: Date.now() });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, key, size: buf.length || 2048 }));
        return;
      }

      if (url.startsWith('/api/ktn/test/fault')) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
        Object.assign(state.faults, body);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, faults: state.faults }));
        return;
      }

      if (url.startsWith('/api/ktn/test/seed-chat-qa')) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
        const action = body.action || 'seed';

        const removeQaSeed = () => {
          state.tables.ktn_classes = state.tables.ktn_classes.filter(
            c => !String(c.id || '').startsWith('QA-SCROLL-')
          );
          const linh = state.tables.ktn_teachers.find(t => t.email === 'linh.lam@khongtunhi.com');
          if (linh && Array.isArray(linh.assigned_classes)) {
            linh.assigned_classes = linh.assigned_classes.filter(
              c => !String(c || '').startsWith('QA-SCROLL-')
            );
          }
          const ngan = state.tables.ktn_students.find(s => s.email === 'hoangngan@khongtunhi.com');
          if (ngan && Array.isArray(ngan.online_courses)) {
            ngan.online_courses = ngan.online_courses.filter(
              c => !String(c?.id || '').startsWith('qa-scroll-course-')
            );
          }
          const nganUid = ngan?.cognito_user_id || 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68';
          if (Array.isArray(state.izteach?.permissionsByUid?.[nganUid])) {
            state.izteach.permissionsByUid[nganUid] = state.izteach.permissionsByUid[nganUid].filter(
              cid => !String(cid || '').startsWith('qa-scroll-course-')
            );
          }
          if (Array.isArray(state.izteach?.permissionRecordsByUid?.[nganUid])) {
            state.izteach.permissionRecordsByUid[nganUid] = state.izteach.permissionRecordsByUid[nganUid].filter(
              r => !(r.onlineCourses || []).some(cid => String(cid || '').startsWith('qa-scroll-course-'))
            );
          }
          state.tables.ktn_messages = state.tables.ktn_messages.filter(
            m => !String(m.id || '').startsWith('MSG-QA-SCROLL-')
          );
        };

        if (action === 'reset') {
          removeQaSeed();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, reset: true }));
          return;
        }

        if (action === 'incoming') {
          const targetRoom = String(body.roomId || 'YCT2-04').replace(/^class:/i, '');
          const msgId = `MSG-QA-SCROLL-INC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const newMsg = {
            id: msgId,
            room_id: targetRoom,
            class_code: targetRoom,
            sender_email: body.senderEmail || 'linh.lam@khongtunhi.com',
            sender_name: body.senderName || 'Cô Lâm Mỹ Linh',
            sender_role: body.senderRole || 'teacher',
            content: body.content || `Tin nhắn mới từ giáo viên lúc ${new Date().toISOString()}`,
            attachment_url: body.attachmentUrl || '',
            created_at: new Date().toISOString()
          };
          state.tables.ktn_messages.unshift(newMsg);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, message: newMsg }));
          return;
        }

        removeQaSeed();
        const roomCount = Number(body.roomCount || 65);
        const messageCount = Number(body.messageCount || 120);
        const linh = state.tables.ktn_teachers.find(t => t.email === 'linh.lam@khongtunhi.com');
        const ngan = state.tables.ktn_students.find(s => s.email === 'hoangngan@khongtunhi.com');

        for (let i = 1; i <= roomCount; i++) {
          const num = String(i).padStart(2, '0');
          const clsId = `QA-SCROLL-${num}`;
          state.tables.ktn_classes.push({
            id: clsId,
            name: `Lớp Giao Tiếp & Hán Tự QA ${num}`,
            teacher_code: 'GV-KTN-08',
            teacher_email: 'linh.lam@khongtunhi.com',
            teacher_name: 'Cô Lâm Mỹ Linh',
            schedule: '19:30 Thứ 3 & Thứ 6',
            total_lessons: 25,
            current_lesson: 10,
            active: true,
            updated_at: new Date(Date.now() - i * 60000).toISOString()
          });
          if (linh && Array.isArray(linh.assigned_classes)) {
            linh.assigned_classes.push(clsId);
          }
          if (ngan && Array.isArray(ngan.online_courses)) {
            const cId = `qa-scroll-course-${num}`;
            ngan.online_courses.push({
              id: cId,
              code: `QAC-${num}`,
              title: `Nhóm Học Tập Bổ Trợ HSK-YCT #${num}`,
              shortTitle: `Nhóm Bổ Trợ #${num}`
            });
            const nganUid = String(ngan.cognito_user_id || 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68');
            state.izteach.permissionsByUid[nganUid] ||= [];
            if (!state.izteach.permissionsByUid[nganUid].includes(cId)) {
              state.izteach.permissionsByUid[nganUid].push(cId);
            }
            if (state.izteach.permissionRecordsByUid) {
              delete state.izteach.permissionRecordsByUid[nganUid];
            }
          }
          if (i <= 8) {
            state.tables.ktn_messages.push({
              id: `MSG-QA-SCROLL-UNREAD-CLS-${num}`,
              room_id: clsId,
              class_code: clsId,
              sender_email: 'hoangngan@khongtunhi.com',
              sender_name: 'Bé Nguyễn Hoàng Ngân',
              sender_role: 'student',
              content: `Câu hỏi chưa đọc tại lớp ${clsId}`,
              attachment_url: '',
              created_at: new Date(Date.now() - i * 30000).toISOString()
            });
            state.tables.ktn_messages.push({
              id: `MSG-QA-SCROLL-UNREAD-CRS-${num}`,
              room_id: `course:qa-scroll-course-${num}`,
              class_code: `course:qa-scroll-course-${num}`,
              sender_email: 'linh.lam@khongtunhi.com',
              sender_name: 'Cô Lâm Mỹ Linh',
              sender_role: 'teacher',
              content: `Thông báo bài tập mới tại Nhóm Bổ Trợ #${num}`,
              attachment_url: '',
              created_at: new Date(Date.now() - i * 25000).toISOString()
            });
          }
        }

        const sampleSvgDataUri =
          'data:image/svg+xml;utf8,' +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="#fef3c7"/><text x="20" y="95" font-size="18" fill="#991b1b">Bảng từ vựng YCT2 Khổng Tử Nhí</text></svg>'
          );

        const baseTime = Date.now() - (messageCount + 20) * 60000;
        for (let m = 1; m <= messageCount; m++) {
          const seq = String(m).padStart(3, '0');
          const isOwnStudent = m === messageCount ? true : m % 2 === 0;
          const isLong = m % 7 === 0;
          const hasImg = m % 15 === 0;
          const textBody = isLong
            ? `[QA-${seq}] Bài luyện đọc dài nhiều dòng lớp YCT2-04:\n1. 你好，我是小语 (Xin chào, mình là Tiểu Ngữ)\n2. 今天我们学习第十八课 (Hôm nay chúng ta học bài 18)\n3. Ghi chú phát âm thanh 3 khi đi liền nhau và luyện viết Hán tự đầy đủ.`
            : `[QA-${seq}] Tin nhắn lịch sử lớp YCT2-04 số #${seq} — Ôn tập từ vựng và mẫu câu chủ đề gia đình.`;
          state.tables.ktn_messages.push({
            id: `MSG-QA-SCROLL-YCT2-${seq}`,
            room_id: 'YCT2-04',
            class_code: 'YCT2-04',
            sender_email: isOwnStudent ? 'hoangngan@khongtunhi.com' : 'linh.lam@khongtunhi.com',
            sender_name: isOwnStudent ? 'Bé Nguyễn Hoàng Ngân' : 'Cô Lâm Mỹ Linh',
            sender_role: isOwnStudent ? 'student' : 'teacher',
            content: textBody,
            attachment_url: hasImg ? sampleSvgDataUri : '',
            created_at: new Date(baseTime + m * 60000).toISOString()
          });
        }

        for (let b = 1; b <= 25; b++) {
          const seq = String(b).padStart(2, '0');
          state.tables.ktn_messages.push({
            id: `MSG-QA-SCROLL-ROOMB-${seq}`,
            room_id: 'course:6adadba969897b0002482ca5',
            class_code: 'course:6adadba969897b0002482ca5',
            sender_email: b % 2 === 0 ? 'hoangngan@khongtunhi.com' : 'linh.lam@khongtunhi.com',
            sender_name: b % 2 === 0 ? 'Bé Nguyễn Hoàng Ngân' : 'Cô Lâm Mỹ Linh',
            sender_role: b % 2 === 0 ? 'student' : 'teacher',
            content: `[ROOM-B-${seq}] Thảo luận khóa HSK1 3.0 câu số #${seq}`,
            attachment_url: '',
            created_at: new Date(baseTime + b * 60000).toISOString()
          });
          state.tables.ktn_messages.push({
            id: `MSG-QA-SCROLL-YCT3-${seq}`,
            room_id: 'YCT3-02',
            class_code: 'YCT3-02',
            sender_email: 'linh.lam@khongtunhi.com',
            sender_name: 'Cô Lâm Mỹ Linh',
            sender_role: 'teacher',
            content: `[YCT3-${seq}] Nội dung ôn tập lớp YCT3-02 buổi #${seq}`,
            attachment_url: '',
            created_at: new Date(baseTime + b * 60000).toISOString()
          });
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ok: true,
            seededClasses: roomCount,
            seededMessages: messageCount
          })
        );
        return;
      }

      if (url === '/flashcards' || url.startsWith('/flashcards?') || url.startsWith('/flashcards/')) {
        const u = new URL(url, 'http://localhost');
        if (u.pathname === '/flashcards') {
          res.statusCode = 301;
          res.setHeader('Location', `/flashcards/${u.search || ''}`);
          res.end();
          return;
        }
        let relPath = decodeURIComponent(u.pathname.slice('/flashcards/'.length)).replace(/^\/+/, '');
        if (!relPath) relPath = 'index.html';
        const flashcardsDir = path.join(REPO_ROOT, 'flashcards');
        const targetFile = path.resolve(flashcardsDir, relPath);
        if (!targetFile.startsWith(flashcardsDir) || !fs.existsSync(targetFile) || fs.statSync(targetFile).isDirectory()) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        const ext = path.extname(targetFile).toLowerCase();
        const mimeMap = {
          '.html': 'text/html; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.mjs': 'application/javascript; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.webp': 'image/webp',
          '.png': 'image/png',
          '.mp3': 'audio/mpeg',
          '.svg': 'image/svg+xml'
        };
        res.statusCode = 200;
        res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
        fs.createReadStream(targetFile).pipe(res);
        return;
      }

      const reqPathname = new URL(url, 'http://localhost').pathname;
      const isConsultationPage =
        reqPathname === '/tu-van' ||
        reqPathname === '/tu-van/' ||
        reqPathname.startsWith('/tu-van/');
      if (!isConsultationPage && !reqPathname.startsWith('/api/ktn/')) {
        return next();
      }

      try {
        const chunks = [];
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          for await (const chunk of req) chunks.push(chunk);
        }
        const rawBody = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
        const fullUrl = `http://${req.headers.host || 'localhost:5173'}${url}`;
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (Array.isArray(v)) headers.set(k, v.join(', '));
          else if (typeof v === 'string') headers.set(k, v);
        }

        const workerReq = new Request(fullUrl, {
          method: req.method,
          headers,
          body: rawBody
        });

        const workerCtx = {
          waitUntil(p) {
            Promise.resolve(p).catch(() => {});
          },
          passThroughOnException() {}
        };
        ensureHostFetchDispatcher();
        const workerRes = await workerFetchAls.run(mockFetch, () =>
          workerModule.fetch(workerReq, env, workerCtx)
        );
        res.statusCode = workerRes.status;
        workerRes.headers.forEach((val, key) => {
          res.setHeader(key, val);
        });
        const arrayBuf = await workerRes.arrayBuffer();
        res.end(Buffer.from(arrayBuf));
      } catch (err) {
        console.error('[LocalWorkerHarness] Error handling /api/ktn/*:', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, message: 'Internal BFF error' }));
      }
    }
  };
}
