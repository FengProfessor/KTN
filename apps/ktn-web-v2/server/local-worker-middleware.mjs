import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const WORKER_PATH = path.join(REPO_ROOT, 'cloudflare-worker-sw-proxy.js');
const HSK1_LESSONS_PATH = path.join(REPO_ROOT, 'clean_lessons_data.json');
const HSK1_MAPPING_PATH = path.join(REPO_ROOT, 'hsk1_33_units_mapping.json');
const ALL_COURSES_LESSONS_PATH = path.join(REPO_ROOT, 'all_courses_lessons_data.json');

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
      ktn_class_sessions: [],
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

  function evalSingleClause(row, clause) {
    const m = clause.match(/^([a-zA-Z0-9_]+)\.(eq|neq|ilike|like|is)\.(.+)$/);
    if (!m) return true;
    const [, col, op, v] = m;
    const rawCell = row[col];
    if (op === 'is') {
      if (v === 'null') return rawCell === null || rawCell === undefined || rawCell === '';
      return true;
    }
    const cell = String(rawCell ?? '');
    if (op === 'eq') return cell === v;
    if (op === 'neq') return cell !== v;
    const isCaseInsensitive = op === 'ilike';
    const regexStr = '^' + v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$';
    const re = new RegExp(regexStr, isCaseInsensitive ? 'i' : '');
    return re.test(cell);
  }

  function matchQueryFilters(row, searchParams) {
    for (const [k, rawVal] of searchParams.entries()) {
      if (k === 'select' || k === 'order' || k === 'limit' || k === 'offset' || k === 'on_conflict') continue;
      if (k === 'or') {
        const inner = rawVal.replace(/^\(/, '').replace(/\)$/, '');
        const clauses = inner.split(',');
        const anyMatch = clauses.some(c => evalSingleClause(row, c));
        if (!anyMatch) return false;
        continue;
      }
      if (k === 'and') {
        const inner = rawVal.replace(/^\(/, '').replace(/\)$/, '');
        const clauses = inner.split(',');
        const allMatch = clauses.every(c => evalSingleClause(row, c));
        if (!allMatch) return false;
        continue;
      }
      if (rawVal.startsWith('eq.')) {
        const target = rawVal.slice(3);
        if (String(row[k] ?? '') !== target) return false;
      } else if (rawVal.startsWith('neq.')) {
        const target = rawVal.slice(4);
        if (String(row[k] ?? '') === target) return false;
      } else if (rawVal.startsWith('is.')) {
        const target = rawVal.slice(3).toLowerCase();
        if (target === 'null' && row[k] !== null && row[k] !== undefined && row[k] !== '') return false;
      } else if (rawVal.startsWith('ilike.') || rawVal.startsWith('like.')) {
        const isCaseInsensitive = rawVal.startsWith('ilike.');
        const pattern = rawVal.slice(isCaseInsensitive ? 6 : 5);
        const regexStr = '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$';
        const re = new RegExp(regexStr, isCaseInsensitive ? 'i' : '');
        if (!re.test(String(row[k] ?? ''))) return false;
      } else if (rawVal.startsWith('in.(')) {
        const list = rawVal.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, ''));
        if (!list.includes(String(row[k] ?? ''))) return false;
      }
    }
    return true;
  }

  async function mockFetch(input, init = {}) {
    const urlStr = typeof input === 'string' ? input : input.url;
    const method = String(init.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
    const u = new URL(urlStr, 'http://localhost');

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

      const rows = state.tables[table] || (state.tables[table] = []);

      if (method === 'GET') {
        const matched = rows.filter(r => matchQueryFilters(r, u.searchParams));
        const orderParam = String(u.searchParams.get('order') || '');
        if (orderParam.includes('created_at.desc')) {
          matched.sort((a, b) => (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0));
        } else if (orderParam.includes('created_at.asc')) {
          matched.sort((a, b) => (Date.parse(a.created_at || '') || 0) - (Date.parse(b.created_at || '') || 0));
        } else if (orderParam.includes('updated_at.desc')) {
          matched.sort((a, b) => (Date.parse(b.updated_at || '') || 0) - (Date.parse(a.updated_at || '') || 0));
        } else if (orderParam.includes('code.asc')) {
          matched.sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
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
        const isUpsert = Boolean(onConflict || prefer.includes('resolution=merge-duplicates'));
        const pkByTable = {
          ktn_students: 'email',
          ktn_orders: 'order_id',
          ktn_teachers: 'code',
          ktn_classes: 'id',
          ktn_attendance: 'id',
          ktn_provisioning_jobs: 'operation_id',
          ktn_payment_config: 'id'
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
          } else if (isUpsert && item[defaultPk]) {
            existingIdx = rows.findIndex(r => String(r[defaultPk] || '').toLowerCase() === String(item[defaultPk] || '').toLowerCase());
          } else if (item.id) {
            existingIdx = rows.findIndex(r => r.id === item.id);
          }
          if (existingIdx >= 0) {
            rows[existingIdx] = { ...rows[existingIdx], ...item };
            out.push(rows[existingIdx]);
          } else {
            const created = {
              id: item.id || ('SB-' + (++state.autoId) + '-' + Date.now()),
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
        for (let idx = 0; idx < rawLessons.length; idx++) {
          const lesson = rawLessons[idx];
          const part0 = (Array.isArray(lesson.parts) && lesson.parts[0]) || {};
          const videoUnitId = part0.videoUnitId || part0.unitId || `6adadbcaf75fe5000247ca${String(idx + 71).padStart(2, '0')}`;
          const hwUnitId = part0.unitId || videoUnitId;
          const syllabus = (Array.isArray(lesson.docs) ? lesson.docs : []).map((d, dIdx) => ({
            _id: `${cid}-doc-${idx + 1}-${dIdx + 1}`,
            title: d.name || `Tài liệu Bài ${idx + 1}`,
            link: String(d.url || '').replace(/^https?:\/\/[^/]+\//, ''),
            origin: { link: String(d.url || '').replace(/^https?:\/\/[^/]+\//, '') }
          }));
          units.push({
            _id: videoUnitId,
            id: videoUnitId,
            index: uIdx++,
            num: lesson.num || idx + 1,
            course: cid,
            title: lesson.titleZh || part0.title || `Bài ${idx + 1}`,
            type: 'video',
            video: part0.videoId || part0.streamUrl || '',
            videoId: part0.videoId || '',
            streamUrl: part0.streamUrl || '',
            posterUrl: part0.posterUrl || '',
            duration: lesson.duration || part0.duration || '12:00',
            syllabus
          });
          if (hwUnitId !== videoUnitId) {
            units.push({
              _id: hwUnitId,
              id: hwUnitId,
              index: uIdx++,
              num: lesson.num || idx + 1,
              course: cid,
              title: `Assignment ${lesson.num || idx + 1}`,
              type: 'homework'
            });
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

  const sandbox = {
    module: { exports: {} },
    exports: {},
    fetch: mockFetch,
    Request,
    Response,
    Headers,
    URL,
    URLSearchParams,
    crypto: globalThis.crypto || crypto.webcrypto,
    TextEncoder,
    TextDecoder,
    atob: globalThis.atob || (str => Buffer.from(str, 'base64').toString('binary')),
    btoa: globalThis.btoa || (str => Buffer.from(str, 'binary').toString('base64')),
    console,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
    Array,
    Uint8Array,
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
    isFinite
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(workerCode, sandbox);

  const workerModule = sandbox.module.exports;
  const env = {
    SUPABASE_URL: 'https://mock-supabase.local',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key',
    IZTEACH_VENDOR_ID: '3529cd2b-7af6-4fda-887c-392a79393d6a',
    IZTEACH_ADMIN_EMAIL: 'hocvienkhongtunhi123@gmail.com',
    IZTEACH_ADMIN_PASSWORD: 'Ktn@2026!AdminPassword',
    KTN_STAFF_AND_TEST_PASSWORD: 'Ktn@2026!',
    KTN_SESSION_SECRET: 'ktn-v2-local-hmac-secret-2026',
    KTN_WEBHOOK_SECRET: 'mock-webhook-secret-2026'
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

      if (!url.startsWith('/api/ktn/')) {
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

        const workerRes = await workerModule.fetch(workerReq, env);
        res.statusCode = workerRes.status;
        workerRes.headers.forEach((val, key) => {
          res.setHeader(key, val);
        });
        const text = await workerRes.text();
        res.end(text);
      } catch (err) {
        console.error('[LocalWorkerHarness] Error handling /api/ktn/*:', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, message: 'Internal BFF error' }));
      }
    }
  };
}
