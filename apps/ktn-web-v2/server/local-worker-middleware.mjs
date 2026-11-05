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
const ALL_COURSES_LESSONS_PATH = path.join(REPO_ROOT, 'all_courses_lessons_data.json');

export function createLocalWorkerHarness() {
  let hsk1Lessons = [];
  let allCoursesLessons = {};
  try {
    if (fs.existsSync(HSK1_LESSONS_PATH)) {
      hsk1Lessons = JSON.parse(fs.readFileSync(HSK1_LESSONS_PATH, 'utf8'));
    }
    if (fs.existsSync(ALL_COURSES_LESSONS_PATH)) {
      allCoursesLessons = JSON.parse(fs.readFileSync(ALL_COURSES_LESSONS_PATH, 'utf8'));
    }
  } catch (err) {
    console.warn('[LocalWorkerHarness] Could not load lesson JSON files:', err);
  }

  const state = {
    faults: {
      failMessagesPost: false,
      failMessagesGet: false,
      failHomeworkPost: false
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
        }
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
        }
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
          created_at: new Date(Date.now() - 1800 * 1000).toISOString(),
          updated_at: new Date(Date.now() - 1800 * 1000).toISOString()
        }
      ],
      ktn_dlp_alerts: [
        {
          id: 'PIN-YCT2-04-DEFAULT',
          room_id: 'PINNED_MSG|YCT2-04',
          sender_email: 'linh.lam@khongtunhi.com',
          sender_name: 'Cô Lâm Mỹ Linh',
          sender_role: 'teacher',
          blocked_content: JSON.stringify({
            roomId: 'class:YCT2-04',
            content: 'Lịch học cố định: 19:30 Thứ 3 & Thứ 6 hàng tuần. Các con nộp bài thu âm trước 18:00 ngày có lịch học nhé!',
            pinnedBy: 'Cô Lâm Mỹ Linh',
            updatedAt: new Date(Date.now() - 7200 * 1000).toISOString()
          }),
          reason: 'ROOM_PINNED_ANNOUNCEMENT',
          resolved: true,
          created_at: new Date(Date.now() - 7200 * 1000).toISOString()
        }
      ],
      ktn_push_subscriptions: [],
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
        '424d2085-8685-4a49-a5e8-8fb63b0c85c5': []
      },
      homeworkPosts: []
    },
    autoId: 1000
  };

  function matchQueryFilters(row, searchParams) {
    for (const [k, rawVal] of searchParams.entries()) {
      if (k === 'select' || k === 'order' || k === 'limit' || k === 'offset' || k === 'on_conflict') continue;
      if (k === 'or') {
        const inner = rawVal.replace(/^\(/, '').replace(/\)$/, '');
        const clauses = inner.split(',');
        const anyMatch = clauses.some(c => {
          const m = c.match(/^([a-zA-Z0-9_]+)\.(eq|ilike)\.(.+)$/);
          if (!m) return true;
          const [, col, op, v] = m;
          const cell = String(row[col] ?? '');
          return op === 'ilike' ? cell.toLowerCase() === v.toLowerCase() : cell === v;
        });
        if (!anyMatch) return false;
        continue;
      }
      if (rawVal.startsWith('eq.')) {
        const target = rawVal.slice(3);
        if (String(row[k] ?? '') !== target) return false;
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
    const u = new URL(urlStr);

    if (u.hostname === 'mock-supabase.local') {
      const table = u.pathname.replace(/^\/rest\/v1\//, '');
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

      const rows = state.tables[table] || (state.tables[table] = []);

      if (method === 'GET') {
        let matched = rows.filter(r => matchQueryFilters(r, u.searchParams));
        const limit = Number(u.searchParams.get('limit') || 0);
        if (limit > 0) matched = matched.slice(0, limit);
        return new Response(JSON.stringify(matched), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (method === 'POST') {
        const body = init.body ? JSON.parse(init.body) : {};
        const items = Array.isArray(body) ? body : [body];
        const onConflict = u.searchParams.get('on_conflict');
        const prefer = String((init.headers && (init.headers.Prefer || init.headers.prefer)) || '');
        const isUpsert = Boolean(onConflict || prefer.includes('resolution=merge-duplicates'));
        const out = [];
        for (const item of items) {
          let existingIdx = -1;
          if (onConflict) {
            const keys = onConflict.split(',').map(s => s.trim());
            existingIdx = rows.findIndex(r => keys.every(k => String(r[k] ?? '').toLowerCase() === String(item[k] ?? '').toLowerCase()));
          } else if (isUpsert && table === 'ktn_students' && item.email) {
            existingIdx = rows.findIndex(r => String(r.email || '').toLowerCase() === String(item.email || '').toLowerCase());
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
        if (decodedPwd.length < 6 || decodedPwd === 'wrong-password') {
          return new Response(JSON.stringify({ message: 'Invalid credentials' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const stu = state.tables.ktn_students.find(s => s.email.toLowerCase() === email);
        if (stu) {
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
        if (teacher) {
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

      if (p.endsWith('/prod/user-permission') && method === 'GET') {
        const uid = u.searchParams.get('userId');
        const courses = state.izteach.permissionsByUid[uid] || [];
        return new Response(JSON.stringify([{
          userId: uid,
          onlineCourses: courses.map(id => ({ _id: id, id }))
        }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (p.includes('/prod/user-permission/add-products/') && method === 'PUT') {
        const uid = decodeURIComponent(p.split('/add-products/')[1]);
        const body = init.body ? JSON.parse(init.body) : {};
        const current = new Set(state.izteach.permissionsByUid[uid] || []);
        for (const cid of (body.productIds || body.onlineCourses || [])) current.add(String(cid));
        state.izteach.permissionsByUid[uid] = Array.from(current);
        return new Response(JSON.stringify({ ok: true, onlineCourses: state.izteach.permissionsByUid[uid] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (p.includes('/prod/user-permission/remove-products/') && method === 'PUT') {
        const uid = decodeURIComponent(p.split('/remove-products/')[1]);
        const body = init.body ? JSON.parse(init.body) : {};
        const toRemove = new Set((body.productIds || body.onlineCourses || []).map(String));
        const current = (state.izteach.permissionsByUid[uid] || []).filter(cid => !toRemove.has(String(cid)));
        state.izteach.permissionsByUid[uid] = current;
        return new Response(JSON.stringify({ ok: true, onlineCourses: current }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if ((p.endsWith('/prod/unit') || p.endsWith('/prod/courses/units')) && method === 'GET') {
        const cid = u.searchParams.get('course') || '6adadba969897b0002482ca5';
        const rawLessons = cid === '6adadba969897b0002482ca5'
          ? hsk1Lessons
          : (allCoursesLessons[cid] || []);
        const units = rawLessons.map((lesson, idx) => {
          const part0 = (Array.isArray(lesson.parts) && lesson.parts[0]) || {};
          return {
            _id: part0.unitId || `6adadbcaf75fe5000247ca${String(idx + 71).padStart(2, '0')}`,
            id: part0.unitId || `6adadbcaf75fe5000247ca${String(idx + 71).padStart(2, '0')}`,
            num: lesson.num || idx + 1,
            course: cid,
            title: lesson.titleZh ? `Bài ${lesson.num}: ${lesson.titleZh} (${lesson.titleVi || ''})` : (lesson.titleVi || part0.title || `Bài ${idx + 1}`),
            titleZh: lesson.titleZh || '',
            titleVi: lesson.titleVi || '',
            grammar: lesson.grammar || '',
            duration: lesson.duration || part0.duration || '12:00',
            sgkPage: lesson.sgkPage || idx + 1,
            sbtPage: lesson.sbtPage || idx + 1,
            voVietPage: lesson.voVietPage || idx + 1,
            type: 'video',
            video: part0.streamUrl || 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
            streamUrl: part0.streamUrl || 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
            posterUrl: part0.posterUrl || '',
            audioTracks: Array.isArray(lesson.audioTracks) ? lesson.audioTracks : [],
            workbookTitle: lesson.workbookTitle || `Sách bài tập Bài ${lesson.num || idx + 1}`
          };
        });
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
    KTN_SESSION_SECRET: 'ktn-v2-local-hmac-secret-2026'
  };

  return {
    state,
    env,
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
