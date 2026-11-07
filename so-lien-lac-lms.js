/* Lớp giao diện LMS: sidebar + trang Quản lý + Nhóm lớp (đồng bộ qua cloud state hiện có, phương án A1) */
(function () {
  'use strict';
  const app = window.app;
  if (!app) return;

  const $ = id => document.getElementById(id);
  const esc = s => (window.KTN_DLP && window.KTN_DLP.escapeHtml)
    ? window.KTN_DLP.escapeHtml(s)
    : String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fold = s => (app.foldText ? app.foldText(s) : String(s || '').toLowerCase());
  const SEEN_KEY = 'ktn_lms_seen_v1';
  const POLL_MS = 6000;

  /* ---------------- Icons ---------------- */
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    class: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
    teacher: '<circle cx="12" cy="7" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    check: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    play: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
    out: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    dl: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    up: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
    dots: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
    userx: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 8l4 4M21 8l-4 4"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>',
    task: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>'
  };
  const I = name => `<svg class="lms-i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  /* ---------------- State ---------------- */
  app.lms = app.lms || {
    page: { admin: 'dash', teacher: 'course-grade', parent: 'homework' },
    room: {},
    stuTab: 'all', stuQuery: '', stuClass: '',
    hwTab: 'pending', hwClass: '',
    cgCourse: 'ALL', cgTab: 'pending', cgLesson: '', cgQuery: '',
    orderTab: 'all', orderQuery: '',
    moreOpen: false,
    profileOpen: false
  };
  const L = app.lms;
  if (!L.cgCourse) L.cgCourse = 'ALL';
  if (!L.cgTab) L.cgTab = 'pending';

  const ONLINE_COURSES_CATALOG = {
    '6adadba969897b0002482ca5': {
      id: '6adadba969897b0002482ca5',
      title: 'HSK1 3.0',
      fullTitle: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
      icon: '📘',
      totalLessons: 15,
      badgeCls: 'r'
    },
    '65e7704a9ea90c00080d5195': {
      id: '65e7704a9ea90c00080d5195',
      title: 'Chinese For Kids',
      fullTitle: 'Chinese For Kids — Tiếng Trung Trẻ Em',
      icon: '🧒',
      totalLessons: 20,
      badgeCls: 'b'
    },
    '65e733b0e3317300084c5ce4': {
      id: '65e733b0e3317300084c5ce4',
      title: 'Tiếng Trung Tổng Hợp',
      fullTitle: 'Giáo trình Tiếng Trung Tổng Hợp',
      icon: '📗',
      totalLessons: 20,
      badgeCls: 'ok'
    },
    '661528ea42af880008944573': { id: '661528ea42af880008944573', title: 'CFK 03 (Cơ Bản 1)', fullTitle: 'Chinese For Kids 03 (Sơ Cấp 1 — Cơ Bản)', icon: '🧒', totalLessons: 20, badgeCls: 'b' },
    '6638b66f9347040008bc9e0d': { id: '6638b66f9347040008bc9e0d', title: 'CFK 03 (Cơ Bản 2)', fullTitle: 'Chinese For Kids 03 (Sơ Cấp 2 — Cơ Bản)', icon: '🧒', totalLessons: 20, badgeCls: 'b' },
    '6638bd09a7367400085c7ab2': { id: '6638bd09a7367400085c7ab2', title: 'CFK 03 (Nâng Cao)', fullTitle: 'Chinese For Kids 03 (Lộ trình Nâng Cao)', icon: '🧒', totalLessons: 20, badgeCls: 'b' },
    '678cb7ac0f868000028ca34b': { id: '678cb7ac0f868000028ca34b', title: 'CFK 04 (Cơ Bản 1)', fullTitle: 'Chinese For Kids 04 (Sơ Cấp 1 — Cơ Bản)', icon: '🧒', totalLessons: 20, badgeCls: 'b' },
    '678d0c7a495c2d0002a743d2': { id: '678d0c7a495c2d0002a743d2', title: 'CFK 04 (Cơ Bản 2)', fullTitle: 'Chinese For Kids 04 (Sơ Cấp 2 — Cơ Bản)', icon: '🧒', totalLessons: 20, badgeCls: 'b' },
    '678d14b960eae20002ddf8fe': { id: '678d14b960eae20002ddf8fe', title: 'CFK 04 (Nâng Cao)', fullTitle: 'Chinese For Kids 04 (Lộ trình Nâng Cao)', icon: '🧒', totalLessons: 20, badgeCls: 'b' },
    '678d20810f868000028ce258': { id: '678d20810f868000028ce258', title: 'CFK 05 (Cơ Bản 1)', fullTitle: 'Chinese For Kids 05 (Trung Cấp 1 — Cơ Bản)', icon: '🧒', totalLessons: 20, badgeCls: 'b' },
    '67a6ec062364d200022a9fc2': { id: '67a6ec062364d200022a9fc2', title: 'CFK 05 (Cơ Bản 2)', fullTitle: 'Chinese For Kids 05 (Trung Cấp 2 — Cơ Bản)', icon: '🧒', totalLessons: 20, badgeCls: 'b' },
    '67a7290a5fdc26000238b4e9': { id: '67a7290a5fdc26000238b4e9', title: 'CFK 05 (Nâng Cao)', fullTitle: 'Chinese For Kids 05 (Lộ trình Nâng Cao)', icon: '🧒', totalLessons: 20, badgeCls: 'b' },
    '67a730b72ecb9c0002579ff5': { id: '67a730b72ecb9c0002579ff5', title: 'CFK 06 (Cơ Bản 1)', fullTitle: 'Chinese For Kids 06 (Trung Cấp 1 — Cơ Bản)', icon: '🧒', totalLessons: 20, badgeCls: 'b' },
    '67a8559560ef5900022d26ce': { id: '67a8559560ef5900022d26ce', title: 'CFK 06 (Cơ Bản 2)', fullTitle: 'Chinese For Kids 06 (Trung Cấp 2 — Cơ Bản)', icon: '🧒', totalLessons: 20, badgeCls: 'b' },
    '67a869302ecb9c000257d966': { id: '67a869302ecb9c000257d966', title: 'CFK 06 (Nâng Cao)', fullTitle: 'Chinese For Kids 06 (Lộ trình Nâng Cao)', icon: '🧒', totalLessons: 20, badgeCls: 'b' },
    '65e769bd637339000870618f': { id: '65e769bd637339000870618f', title: 'Chinh Phục YCT 1', fullTitle: 'Chinh Phục Chứng Chỉ Quốc Tế YCT Cấp Độ 1', icon: '🏆', totalLessons: 20, badgeCls: 'r' },
    '65e76a533f5e7c00086715d7': { id: '65e76a533f5e7c00086715d7', title: 'Phát Âm & Giao Tiếp', fullTitle: 'Luyện Phát Âm Chuẩn & Giao Tiếp Phản Xạ', icon: '🎙️', totalLessons: 20, badgeCls: 'ok' },
    '66028938bfd6c90008b816e1': { id: '66028938bfd6c90008b816e1', title: 'Chinh Phục YCT 2', fullTitle: 'Chinh Phục Chứng Chỉ Quốc Tế YCT Cấp Độ 2', icon: '🏆', totalLessons: 20, badgeCls: 'r' }
  };
  const ONLINE_COURSE_LIST = Object.values(ONLINE_COURSES_CATALOG);

  const role = () => (app.currentRole === 'teacher' ? 'teacher' : app.currentRole === 'admin' ? 'admin' : 'parent');
  const isWorkspace = () => {
    const m = document.body.dataset.auth || ($('ktn-sll-root') && $('ktn-sll-root').dataset.auth);
    return m === 'connected' || m === 'demo';
  };
  const isLocalHost = () => /^(127\.0\.0\.1|localhost)$/.test(location.hostname);

  /* ---------------- Danh sách học viên thật từ izTeach (chỉ Quản lý, dùng token phiên của chính Quản lý) ---------------- */
  const IZ_STUDENT_API = 'https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student';
  const IZ_HOMEWORK_API = 'https://rt6i5wgkj4.execute-api.ap-southeast-1.amazonaws.com/prod/homework';
  const IZ_VENDOR_ID = '3529cd2b-7af6-4fda-887c-392a79393d6a';
  const IZ_CLOUDFRONT_DOMAIN = 'https://d21acfi38wn3iy.cloudfront.net';
  L.iz = L.iz || { status: 'idle', at: 0, total: 0, error: '' };
  L.izHw = L.izHw || { status: 'idle', at: 0, items: [], error: '' };
  const pad2 = n => String(n).padStart(2, '0');
  const fmtShort = t => {
    if (!t) return '—';
    const d = new Date(t);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())} · ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
  };
  const fmtIzDate = iso => {
    const t = Date.parse(iso || '');
    if (!t) return '';
    const d = new Date(t);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())} - ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  };

  function resolveCourseAndLessonFromRecord(raw) {
    if (!raw) return { courseId: '6adadba969897b0002482ca5', courseTitle: 'HSK1 3.0', lessonNum: 1, lessonTitle: '', unitId: '' };
    let cId = String(raw.courseId || raw.course || '').trim();
    const uId = String(raw.unitId || raw.unit || '').trim();
    const titleStr = String(raw.title || '');
    const allCoursesMap = window.ALL_COURSES_LESSONS || {};

    if (!ONLINE_COURSES_CATALOG[cId] && uId) {
      for (const [k, lessonsArr] of Object.entries(allCoursesMap)) {
        if (Array.isArray(lessonsArr) && lessonsArr.some(ls => ls && ls.parts && ls.parts[0] && ls.parts[0].unitId === uId)) {
          cId = k;
          break;
        }
      }
    }
    if (!ONLINE_COURSES_CATALOG[cId]) {
      if (/chinese\s*for\s*kids/i.test(titleStr)) cId = '65e7704a9ea90c00080d5195';
      else if (/tiếng\s*trung\s*tổng\s*hợp|tong\s*hop/i.test(titleStr)) cId = '65e733b0e3317300084c5ce4';
      else cId = '6adadba969897b0002482ca5';
    }
    const courseMeta = ONLINE_COURSES_CATALOG[cId] || ONLINE_COURSES_CATALOG['6adadba969897b0002482ca5'];
    let lessonNum = Number(raw.lessonNum || raw.lessonNumber) || 0;
    let lessonTitle = String(raw.lessonTitle || '').trim();
    const courseLessons = Array.isArray(allCoursesMap[cId]) ? allCoursesMap[cId] : [];
    if (uId && courseLessons.length) {
      const hitLesson = courseLessons.find(ls => ls && ls.parts && ls.parts[0] && ls.parts[0].unitId === uId);
      if (hitLesson) {
        if (!lessonNum) lessonNum = Number(hitLesson.num) || 1;
        if (!lessonTitle) lessonTitle = `${hitLesson.titleZh || ''}${hitLesson.titleVi ? ' (' + hitLesson.titleVi + ')' : ''}`;
      }
    }
    if (!lessonNum) {
      const m = titleStr.match(/(?:Bài|Buổi|Lesson)\s*(\d+)/i) || String(raw.lesson || '').match(/(\d+)/);
      lessonNum = m ? Number(m[1]) : 1;
    }
    if (!lessonTitle && courseLessons.length) {
      const hitByNum = courseLessons.find(ls => Number(ls.num) === lessonNum);
      if (hitByNum) {
        lessonTitle = `${hitByNum.titleZh || ''}${hitByNum.titleVi ? ' (' + hitByNum.titleVi + ')' : ''}`;
      }
    }
    return {
      courseId: cId,
      courseTitle: courseMeta.title,
      unitId: uId,
      lessonNum: lessonNum || 1,
      lessonTitle: lessonTitle
    };
  }

  function normalizeIzTeachHwItem(raw) {
    if (!raw) return null;
    const remoteId = String(raw._id || raw.id || raw.remoteId || '').trim();
    const meta = resolveCourseAndLessonFromRecord(raw);
    const notesStr = String(raw.notes || raw.parentNote || '');
    const fbMarker = '[NHẬN XÉT GIÁO VIÊN]:';
    const hasFbMarker = notesStr.indexOf(fbMarker) !== -1;
    let studentNote = notesStr;
    let extractedFb = String(raw.teacherFeedback || '').trim();
    if (hasFbMarker) {
      const parts = notesStr.split(fbMarker);
      studentNote = parts[0].trim();
      extractedFb = parts.slice(1).join(' ').trim();
    }
    const isGraded = raw.status === 'GRADED' || raw.state === 'approved' || (raw.mark !== undefined && raw.mark !== null) || (raw.score !== undefined && raw.score !== null);
    const scoreVal = raw.score !== undefined && raw.score !== null ? Number(raw.score) : (raw.mark !== undefined && raw.mark !== null ? Number(raw.mark) : null);
    const createdMs = Date.parse(raw.updatedAt || raw.createdAt || '') || Number(raw.updatedAtMs) || Date.now();
    const stuEmail = String(raw.studentEmail || raw.email || '').trim().toLowerCase();
    const stuName = String(raw.studentName || raw.name || (stuEmail ? stuEmail.split('@')[0] : 'Học viên Khổng Tử Nhí')).trim();
    const matchStu = (app.students || []).find(s => s && ((stuEmail && String(s.email || '').toLowerCase() === stuEmail) || (raw.studentCode && s.code === raw.studentCode)));

    let atts = [];
    if (Array.isArray(raw.attachments) && raw.attachments.length) {
      atts = raw.attachments.map(a => ({ ...a }));
    } else if (Array.isArray(raw.resources) && raw.resources.length) {
      atts = raw.resources.map((r, i) => {
        if (!r || typeof r !== 'object') return null;
        const link = String(r.link || '').trim();
        const cdnUrl = link.startsWith('http') ? link : `${IZ_CLOUDFRONT_DOMAIN}/${link.replace(/^\/+/, '')}`;
        const mime = String(r.type || '').toLowerCase();
        const nm = String(r.name || link || '').toLowerCase();
        let mediaType = 'file';
        if (mime.includes('image') || /\.(jpg|jpeg|png|gif|webp)(-|$)/i.test(nm)) mediaType = 'image';
        else if (mime.includes('audio') || /\.(mp3|wav|ogg|m4a|webm)(-|$)/i.test(nm)) mediaType = 'audio';
        else if (mime.includes('video') || /\.(mp4|mov|webm)(-|$)/i.test(nm)) mediaType = 'video';
        return {
          id: r._id || r.id || ('ATT-' + i),
          title: r.name || ('Tệp bài tập ' + (i + 1)),
          mediaType,
          mimeType: r.type || '',
          size: Number(r.size) || 0,
          s3Key: link,
          cdnUrl,
          playUrl: cdnUrl
        };
      }).filter(Boolean);
    }

    const cMeta = ONLINE_COURSES_CATALOG[meta.courseId] || ONLINE_COURSES_CATALOG['6adadba969897b0002482ca5'];
    return {
      id: raw.id && String(raw.id).startsWith('HW-') ? raw.id : ('HW-' + (remoteId || createdMs)),
      remoteId: remoteId || raw.id,
      isCourseHomework: true,
      courseId: meta.courseId,
      course: meta.courseId,
      courseTitle: meta.courseTitle,
      unitId: meta.unitId,
      unit: meta.unitId,
      lessonNum: meta.lessonNum,
      lessonTitle: meta.lessonTitle,
      lesson: `Bài ${meta.lessonNum}/${cMeta.totalLessons}`,
      title: raw.title || `[${meta.courseTitle} - Bài ${meta.lessonNum}] ${meta.lessonTitle || ('Bài ' + meta.lessonNum)}`,
      userId: raw.userId || (matchStu && matchStu.userId) || '',
      studentCode: raw.studentCode || (matchStu && matchStu.code) || ('KTN-ONLINE-' + (stuEmail.split('@')[0] || 'HV').toUpperCase().slice(0, 6)),
      studentEmail: stuEmail || (matchStu && matchStu.email) || '',
      studentName: stuName,
      classCode: '',
      submittedAt: raw.submittedAt || fmtShort(createdMs),
      timestamp: raw.createdAt || new Date(createdMs).toISOString(),
      updatedAtMs: createdMs,
      parentNote: studentNote,
      status: isGraded ? 'GRADED' : 'PENDING',
      score: isGraded && scoreVal !== null ? scoreVal : null,
      teacherFeedback: isGraded ? (extractedFb || 'Cô đã chấm bài của con!') : 'Chờ cô giáo đang nhận xét...',
      attachments: atts
    };
  }

  app.lmsFetchCourseHomeworks = async function (force) {
    if (L.izHw.status === 'loading') return false;
    if (!force && L.izHw.status === 'ok' && Date.now() - L.izHw.at < 25 * 1000) return true;
    L.izHw.status = 'loading';
    try {
      let token = null;
      if (window.IZTEACH_STORAGE && typeof window.IZTEACH_STORAGE.ensureToken === 'function') {
        token = await window.IZTEACH_STORAGE.ensureToken();
      }
      if (!token && window.IzTeachPortalClient && typeof window.IzTeachPortalClient.getServiceToken === 'function') {
        token = await window.IzTeachPortalClient.getServiceToken();
      }
      const headers = token ? { Authorization: token } : {};
      const [izRes, sbRes] = await Promise.all([
        fetch(`${IZ_HOMEWORK_API}/filter?vendorId=${IZ_VENDOR_ID}&_limit=500&_sort=createdAt:DESC`, { headers }).catch(() => null),
        (window.KtnWebApp && typeof window.KtnWebApp.apiRequest === 'function')
          ? window.KtnWebApp.apiRequest('/api/ktn/homeworks').catch(() => null)
          : Promise.resolve(null)
      ]);
      let rawList = [];
      if (izRes && izRes.ok) {
        const data = await izRes.json().catch(() => []);
        rawList = Array.isArray(data) ? data : (data.data || data.items || []);
      }
      const sbRows = (sbRes && sbRes.ok && Array.isArray(sbRes.data?.homeworks)) ? sbRes.data.homeworks : [];
      const sbCourseMapped = [];
      const sbClassMapped = [];
      sbRows.forEach(row => {
        if (!row) return;
        const lNum = Number(row.lesson_num) || 1;
        const isClassSessionHw = lNum >= 100 || String(row.course_id || '').startsWith('CLASS-');
        const isGraded = row.status === 'graded' || (row.score !== null && row.score !== undefined);
        const rawAtts = Array.isArray(row.attachments) && row.attachments.length > 0
          ? row.attachments.map((a, idx) => ({
              id: a.id || `${row.id}-${idx}`,
              title: a.title || row.lesson_title || 'Bài nộp',
              mediaType: a.mediaType || row.file_type || 'audio',
              size: Number(a.size || 0),
              cdnUrl: a.cdnUrl || a.fileUrl || row.file_url,
              playUrl: a.playUrl || a.cdnUrl || a.fileUrl || row.file_url
            }))
          : (row.file_url ? [{
              id: `${row.id}-0`,
              title: row.lesson_title || 'Bài nộp',
              mediaType: row.file_type || 'audio',
              size: 0,
              cdnUrl: row.file_url,
              playUrl: row.file_url
            }] : []);

        if (isClassSessionHw) {
          const sessionNum = lNum >= 100 ? Math.max(1, lNum - 100) : lNum;
          sbClassMapped.push({
            id: row.id,
            remoteId: row.id,
            classCode: row.class_code || 'YCT2-04',
            lesson: `Buổi ${sessionNum}`,
            lessonNumber: sessionNum,
            lessonNum: sessionNum,
            title: row.lesson_title || `Buổi ${sessionNum}`,
            studentCode: row.student_code || '',
            studentEmail: String(row.student_email || '').toLowerCase(),
            studentName: row.student_name || '',
            submittedAt: fmtShort(row.submitted_at || row.updated_at),
            updatedAtMs: Date.parse(row.updated_at || row.submitted_at || '') || Date.now(),
            parentNote: row.student_note || '',
            status: isGraded ? 'GRADED' : 'PENDING',
            score: isGraded && row.score != null ? Number(row.score) : null,
            teacherFeedback: isGraded ? (row.teacher_feedback || 'Cô đã chấm bài của con!') : 'Chờ cô giáo đang nhận xét...',
            attachments: rawAtts
          });
        } else {
          sbCourseMapped.push({
            _id: row.id,
            id: row.id,
            _source: 'supabase',
            courseId: row.course_id || '6adadba969897b0002482ca5',
            lessonNum: lNum,
            lessonTitle: row.lesson_title || `Bài ${lNum}`,
            title: row.lesson_title || `Bài ${lNum}`,
            studentCode: row.student_code || '',
            studentEmail: String(row.student_email || '').toLowerCase(),
            studentName: row.student_name || '',
            notes: row.student_note || '',
            status: isGraded ? 'GRADED' : 'PENDING',
            score: isGraded && row.score != null ? Number(row.score) : null,
            teacherFeedback: row.teacher_feedback || '',
            updatedAt: row.updated_at || row.submitted_at,
            createdAt: row.submitted_at || row.updated_at,
            attachments: rawAtts
          });
        }
      });

      const normalizedAll = [...sbCourseMapped, ...rawList].map(raw => {
        const norm = normalizeIzTeachHwItem(raw);
        if (norm && raw?._source) norm._source = raw._source;
        return norm;
      }).filter(Boolean);
      // Gộp theo (học viên + khóa học + bài học) ưu tiên bản ghi mới hơn từ Supabase (bao gồm cả trường hợp học sinh nộp lại sau khi đã được chấm)
      const dedupMap = new Map();
      normalizedAll.forEach(item => {
        const stuKey = String(item.studentEmail || item.userId || item.studentCode || item.studentName || '').toLowerCase();
        const key = `${stuKey}::${item.courseId}::${item.lessonNum}`;
        const prev = dedupMap.get(key);
        if (!prev) {
          dedupMap.set(key, item);
        } else {
          if (item.updatedAtMs > prev.updatedAtMs) {
            dedupMap.set(key, item);
          } else if (item.updatedAtMs === prev.updatedAtMs && item.status === 'GRADED' && prev.status !== 'GRADED') {
            dedupMap.set(key, item);
          }
        }
      });
      const normalized = Array.from(dedupMap.values());
      L.izHw = { status: 'ok', at: Date.now(), items: normalized, error: '' };

      // Đồng bộ cả bài tập khóa học lẫn bài tập buổi học trên lớp vào app.state.homeworks
      if (app.state) {
        if (!Array.isArray(app.state.homeworks)) app.state.homeworks = [];
        [...sbClassMapped, ...normalized].forEach(nh => {
          const idx = app.state.homeworks.findIndex(x => x && (x.remoteId === nh.remoteId || x.id === nh.id));
          if (idx >= 0) {
            const cur = app.state.homeworks[idx];
            if (cur.status === 'GRADED' && nh.status !== 'GRADED' && (nh.updatedAtMs || 0) <= (cur.updatedAtMs || 0)) return;
            app.state.homeworks[idx] = { ...cur, ...nh };
          } else {
            app.state.homeworks.push(nh);
          }
        });
      }
    } catch (e) {
      L.izHw = { ...L.izHw, status: 'error', error: String(e && e.message || e) };
    }
    applyShell();
    return L.izHw.status === 'ok';
  };
  function adminSessionToken() {
    const auth = window.sllAuth;
    if (!auth || auth.mode !== 'connected') return null;
    const r = typeof auth.sessionRole === 'function' ? auth.sessionRole() : null;
    const t = auth.session && auth.session.accessToken;
    if (r !== 'admin' || !t || String(t).startsWith('KTN-')) return null;
    return t;
  }
  app.lmsFetchIz = async function (force) {
    if (L.iz.status === 'loading') return false;
    if (!force && L.iz.status === 'ok' && Date.now() - L.iz.at < 60 * 1000) return false;
    const token = adminSessionToken();
    const hasKtnSession = Boolean(window.KtnWebApp && typeof window.KtnWebApp.getSession === 'function' && window.KtnWebApp.getSession());
    if (!token && !hasKtnSession) { L.iz.status = 'none'; return false; }
    L.iz.status = 'loading';
    if (force) applyShell();
    try {
      // 1. Đồng bộ Lớp học, Học viên và Đơn hàng từ Supabase qua Worker API (/api/ktn/*)
      let sbStudents = [];
      if (hasKtnSession && window.KtnWebApp && typeof window.KtnWebApp.apiRequest === 'function') {
        const curRole = role();
        const [clsRes, stuRes, ordRes] = await Promise.all([
          window.KtnWebApp.apiRequest('/api/ktn/classes').catch(() => null),
          (curRole === 'admin' || curRole === 'teacher') ? window.KtnWebApp.apiRequest('/api/ktn/students').catch(() => null) : Promise.resolve(null),
          curRole === 'admin' ? window.KtnWebApp.apiRequest('/api/ktn/orders').catch(() => null) : Promise.resolve(null)
        ]);
        if (clsRes?.ok && Array.isArray(clsRes.data?.classes) && Array.isArray(app.classes)) {
          clsRes.data.classes.forEach(sc => {
            if (!sc || !sc.id) return;
            const existingCls = app.classes.find(c => String(c.id).toUpperCase() === String(sc.id).toUpperCase());
            if (existingCls) {
              existingCls.schedule = sc.schedule || existingCls.schedule;
              existingCls.totalLessons = Number(sc.total_lessons || sc.totalLessons) || existingCls.totalLessons || 25;
              if (sc.teacher_code) existingCls.teacherCode = sc.teacher_code;
              if (sc.teacher_name) existingCls.teacherName = sc.teacher_name;
              if (sc.teacher_email) existingCls.teacherEmail = sc.teacher_email;
            } else {
              app.classes.push({
                id: sc.id,
                name: sc.name || sc.id,
                title: sc.name || ('Lớp ' + sc.id),
                schedule: sc.schedule || '19:30 Thứ 3 & Thứ 6',
                totalLessons: Number(sc.total_lessons || sc.totalLessons) || 25,
                teacherCode: sc.teacher_code || 'GV-KTN-08',
                teacherName: sc.teacher_name || 'Cô Lâm Mỹ Linh',
                teacherEmail: sc.teacher_email || 'linh.lam@khongtunhi.com',
                studentCodes: []
              });
            }
          });
        }
        if (ordRes?.ok && Array.isArray(ordRes.data?.orders) && app.state) {
          if (!Array.isArray(app.state.orders)) app.state.orders = [];
          ordRes.data.orders.forEach(so => {
            if (!so || !so.order_id) return;
            const mappedOrd = {
              orderId: so.order_id,
              studentName: so.student_name || 'Học viên',
              studentEmail: so.student_email || '',
              phone: so.phone || '',
              courseId: so.course_id || '6adadba969897b0002482ca5',
              courseName: so.course_name || 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
              amount: Number(so.amount) || 890000,
              paymentMethod: so.payment_method || 'VietQR',
              paymentStatus: so.payment_status === 'paid' ? 'paid' : 'pending_verification',
              approvalStatus: so.approval_status || 'pending',
              assignedUserId: so.assigned_user_id || null,
              assignedStudentId: so.assigned_student_id || null,
              approvedAt: so.approved_at || null,
              approvedBy: so.approved_by || null,
              createdAt: so.created_at || new Date().toISOString(),
              createdAtDisplay: fmtIzDate(so.created_at)
            };
            const idx = app.state.orders.findIndex(o => (o.orderId || o.id) === so.order_id);
            if (idx >= 0) app.state.orders[idx] = { ...app.state.orders[idx], ...mappedOrd };
            else app.state.orders.unshift(mappedOrd);
          });
        }
        if (stuRes?.ok && Array.isArray(stuRes.data?.students)) {
          sbStudents = stuRes.data.students;
          sbStudents.forEach(ss => {
            if (!ss || !ss.email) return;
            const em = String(ss.email).trim().toLowerCase();
            const cIds = Array.isArray(ss.online_courses)
              ? ss.online_courses.map(c => String(c?.id || c || '').trim()).filter(Boolean)
              : [];
            const rosterHit = (app.students || []).find(r => r && String(r.email || '').trim().toLowerCase() === em);
            if (rosterHit) {
              if (ss.class_code !== undefined) {
                rosterHit.classCode = ss.class_code || '';
                rosterHit.hasLiveClass = Boolean(ss.class_code);
              }
              rosterHit.hasOnlineCourses = cIds.length > 0;
              rosterHit.courseIds = cIds;
              if (ss.cognito_user_id && !rosterHit.userId) rosterHit.userId = ss.cognito_user_id;
              if (app.computeStudentCase) rosterHit.caseType = app.computeStudentCase(rosterHit);
            } else if (ss.class_code && Array.isArray(app.students)) {
              const newRoster = {
                name: ss.name || em.split('@')[0],
                parent: 'Phụ huynh ' + (ss.name || em.split('@')[0]),
                email: em,
                phone: ss.phone || '',
                userId: ss.cognito_user_id || '',
                code: ss.code || ('KTN-' + em.split('@')[0].toUpperCase().slice(0, 6)),
                classCode: ss.class_code,
                hasLiveClass: true,
                hasOnlineCourses: cIds.length > 0,
                courseIds: cIds,
                progress: 'Buổi 1/25',
                attendance: 'Đang theo học'
              };
              if (app.computeStudentCase) newRoster.caseType = app.computeStudentCase(newRoster);
              app.students.push(newRoster);
            }
          });
        }
      }

      // 2. Lấy danh sách từ izTeach CRM (nếu có token izTeach trực tiếp) hoặc từ bảng ktn_students đã đồng bộ
      const all = [];
      if (token) {
        const PAGE = 2000;
        for (let skip = 0, i = 0; i < 10; i++, skip += PAGE) {
          const res = await fetch(`${IZ_STUDENT_API}?vendorId=${IZ_VENDOR_ID}&_limit=${PAGE}&_skip=${skip}`, { headers: { Authorization: token } });
          if (!res.ok) break;
          const arr = await res.json();
          if (!Array.isArray(arr)) break;
          all.push(...arr);
          if (arr.length < PAGE) break;
        }
      }

      const sbByEmail = new Map();
      sbStudents.forEach(s => {
        if (s?.email) sbByEmail.set(String(s.email).trim().toLowerCase(), s);
      });

      const seen = new Set();
      const mapped = [];
      all.forEach(s => {
        const sid = s && (s.id || s._id);
        if (!sid || seen.has(sid)) return;
        seen.add(sid);
        const em = String(s.email || '').trim().toLowerCase();
        const sbMatch = sbByEmail.get(em);
        const sbCourseCount = Array.isArray(sbMatch?.online_courses) ? sbMatch.online_courses.length : 0;
        mapped.push({
          id: sid,
          userId: s.userId || s.dynamoId || sbMatch?.cognito_user_id || '',
          name: String(s.name || sbMatch?.name || '').trim() || em.split('@')[0],
          email: em,
          phone: String(s.phone || sbMatch?.phone || '').trim(),
          createdAt: fmtIzDate(s.createdAt || sbMatch?.updated_at),
          createdTimestamp: Date.parse(s.createdAt || sbMatch?.updated_at || '') || 0,
          isActive: s.state !== 'unverified',
          isBlock: Boolean(s.isBlock),
          onlineCount: sbMatch ? sbCourseCount : (Array.isArray(s.onlineCourses) ? s.onlineCourses.length : 0),
          classCode: sbMatch?.class_code || '',
          source: 'izteach'
        });
        if (em) sbByEmail.delete(em);
      });

      sbByEmail.forEach(sb => {
        const sid = sb.izteach_student_id || sb.cognito_user_id || sb.code || sb.email;
        if (!sid || seen.has(sid)) return;
        seen.add(sid);
        mapped.push({
          id: sid,
          userId: sb.cognito_user_id || '',
          name: String(sb.name || '').trim() || String(sb.email || '').split('@')[0],
          email: String(sb.email || '').trim().toLowerCase(),
          phone: String(sb.phone || '').trim(),
          createdAt: fmtIzDate(sb.updated_at),
          createdTimestamp: Date.parse(sb.updated_at || '') || 0,
          isActive: true,
          isBlock: false,
          onlineCount: Array.isArray(sb.online_courses) ? sb.online_courses.length : 0,
          classCode: sb.class_code || '',
          source: 'supabase'
        });
      });

      app.izMasterStudents = mapped;
      app.izStudents = mapped.slice();
      L.iz = { status: 'ok', at: Date.now(), total: mapped.length, error: '' };
    } catch (e) {
      L.iz = { ...L.iz, status: 'error', error: String(e && e.message || e) };
    }
    rowsCache = null;
    applyShell();
    return L.iz.status === 'ok';
  };
  let rowsCache = null;

  /* ---------------- Data helpers ---------------- */
  const D = {
    roster() {
      return (app.students || []).map((s, idx) => ({ s, idx })).filter(x => x.s && !x.s.isDynamicSession);
    },
    classStudents(id) {
      return (app.students || []).filter(s => s && !s.isDynamicSession && s.hasLiveClass && s.classCode === id);
    },
    lessonOf(s) {
      const m = String(s && s.progress || '').match(/(\d+)\s*\/\s*(\d+)/);
      return m ? Number(m[1]) : 0;
    },
    classLesson(cls) {
      return D.classStudents(cls.id).reduce((mx, s) => Math.max(mx, D.lessonOf(s)), 0);
    },
    submitted(cls) {
      const st = D.classStudents(cls.id);
      return { done: st.filter(s => !s.unsubmittedCurrent).length, total: st.length };
    },
    pending(classIds) {
      return (app.state?.homeworks || []).filter(h => h && h.status === 'PENDING' && (!classIds || classIds.includes(h.classCode)));
    },
    courseHomeworks(courseIdFilter) {
      const combined = [];
      const seenRemote = new Set();
      const allStateHws = (app.state?.homeworks || []).filter(Boolean);
      const izHws = Array.isArray(L.izHw?.items) ? L.izHw.items : [];

      const pushCandidate = raw => {
        if (!raw) return;
        const isCourse = Boolean(raw.isCourseHomework || raw.courseId || raw.course || /HSK|Chinese\s*For\s*Kids|Tiếng\s*Trung\s*Tổng\s*Hợp/i.test(String(raw.title || '')));
        if (!isCourse) return;
        const norm = raw.courseTitle ? raw : normalizeIzTeachHwItem(raw);
        if (!norm) return;
        const rKey = String(norm.remoteId || norm.id || '');
        if (rKey && seenRemote.has(rKey)) return;
        if (rKey) seenRemote.add(rKey);
        combined.push(norm);
      };

      allStateHws.forEach(pushCandidate);
      izHws.forEach(pushCandidate);

      // Deduplicate theo (Học viên + Khóa học + Bài học), ưu tiên bản mới nhất (kể cả khi học sinh nộp lại PENDING sau khi đã chấm)
      const byStuCourseLesson = new Map();
      combined.forEach(h => {
        const stuKey = String(h.studentEmail || h.userId || h.studentCode || h.studentName || '').toLowerCase();
        const k = `${stuKey}|${h.courseId}|${h.unitId || h.lessonNum || 1}`;
        const prev = byStuCourseLesson.get(k);
        if (!prev) {
          byStuCourseLesson.set(k, h);
        } else {
          const prevTime = D.hwTime(prev);
          const curTime = D.hwTime(h);
          if (curTime > prevTime) {
            byStuCourseLesson.set(k, h);
          } else if (curTime === prevTime && h.status === 'GRADED' && prev.status !== 'GRADED') {
            byStuCourseLesson.set(k, h);
          }
        }
      });

      let result = Array.from(byStuCourseLesson.values());
      if (courseIdFilter && courseIdFilter !== 'ALL') {
        result = result.filter(h => h.courseId === courseIdFilter);
      }
      result.sort((a, b) => D.hwTime(b) - D.hwTime(a));
      return result;
    },
    pendingCourseHomeworks(courseIdFilter) {
      return D.courseHomeworks(courseIdFilter).filter(h => h && h.status === 'PENDING');
    },
    hwTime(h) {
      // bài nộp mới lưu submittedAt = 'Vừa xong' nên phải dùng updatedAtMs
      return Date.parse(h && (h.submittedAt || h.timestamp) || '') || Number(h && h.updatedAtMs) || 0;
    },
    hwLesson(h) {
      const n = Number(h && (h.lessonNum || h.lessonNumber));
      if (n) return n;
      const m = String(h && h.lesson || '').match(/(\d+)/);
      return m ? Number(m[1]) : 0;
    },
    isOverdue(h) {
      const t = D.hwTime(h);
      return Boolean(t) && (Date.now() - t) > 864e5;
    },
    openAlerts() {
      return (app.state?.dlpAlerts || []).filter(a => (a.reviewStatus || 'OPEN') === 'OPEN');
    },
    izList() {
      const list = Array.isArray(app.izMasterStudents) && app.izMasterStudents.length ? app.izMasterStudents : (app.izStudents || []);
      return Array.isArray(list) ? list : [];
    },
    izByEmail() {
      const map = {};
      D.izList().forEach(z => { if (z && z.email) map[String(z.email).toLowerCase()] = z; });
      return map;
    },
    izExtras() {
      const emails = new Set(D.roster().map(({ s }) => String(s.email || '').toLowerCase()));
      // Bỏ các tài khoản mà bộ lọc lưu trữ hiện có sẽ loại khi lưu (nếu không, "Xếp lớp" sẽ mất sau khi tải lại)
      const persistable = em => {
        if (typeof app._sanitizePersistedState !== 'function') return true;
        try { return app._sanitizePersistedState({ customStudents: [{ code: 'x', email: em }] }).customStudents.length === 1; } catch { return true; }
      };
      return D.izList().filter(z => z && z.email && !emails.has(String(z.email).toLowerCase()) && persistable(String(z.email).toLowerCase()));
    },
    studentIdxByCode(code) {
      return (app.students || []).findIndex(s => s && s.code === code);
    },
    rows() {
      if (typeof app.syncApprovedOrdersToStudents === 'function') {
        try { app.syncApprovedOrdersToStudents(); } catch {}
      }
      const sig = `${(app.students || []).length}|${app.state?._updatedAt || ''}|${L.iz.at}|${D.izList().length}|${(app.students || []).map(s => s && (s.classCode || '-')).join('')}`;
      if (rowsCache && rowsCache.sig === sig && Date.now() - rowsCache.t < 2000) return rowsCache.rows;
      const iz = D.izByEmail();
      const rows = D.roster().map(({ s, idx }) => {
        const z = iz[String(s.email || '').toLowerCase()];
        const inClass = Boolean(s.hasLiveClass && s.classCode);
        const status = z && z.isBlock ? 'locked' : (z && z.isActive === false) ? 'inactive' : inClass ? 'active' : 'unassigned';
        const created = (z && z.createdAt) || s.createdAt || (s.createdTs ? new Date(s.createdTs).toISOString() : '') || '';
        const createdTs = (z && z.createdTimestamp) || s.createdTs || (s.createdAt ? Date.parse(s.createdAt) : 0) || 0;
        return {
          key: 'r:' + idx, kind: 'roster', idx, name: s.name, email: s.email || '',
          phone: (z && z.phone) || s.phone || '', classCode: inClass ? s.classCode : '',
          online: s.hasOnlineCourses ? (s.courseIds || []).length : 0,
          created, createdTs, status
        };
      });
      D.izExtras().forEach(z => rows.push({
        key: 'z:' + z.id, kind: 'iz', izId: z.id, name: z.name, email: z.email || '', phone: z.phone || '',
        classCode: '', online: z.onlineCount || 0, created: z.createdAt || '', createdTs: z.createdTimestamp || 0,
        status: z.isBlock ? 'locked' : z.isActive === false ? 'inactive' : 'unassigned'
      }));
      rows.sort((a, b) => (b.classCode ? 1 : 0) - (a.classCode ? 1 : 0) || (b.createdTs || 0) - (a.createdTs || 0));
      rowsCache = { sig, rows, t: Date.now() };
      return rows;
    },
    rowByKey(key) {
      return D.rows().find(r => r.key === key);
    },
    visibleClasses(r) {
      if (r === 'admin') return app.classes || [];
      if (r === 'teacher') return app.getTeacherManagedClasses ? app.getTeacherManagedClasses() : [];
      const stu = app.getActiveParentStudent ? app.getActiveParentStudent() : null;
      if (!stu || !stu.hasLiveClass || !stu.classCode) return [];
      const cls = (app.classes || []).find(c => c.id === stu.classCode);
      return cls ? [cls] : [];
    },
    normalizeRoomKey(rawRoom) {
      const s = String(rawRoom || '').trim();
      if (!s) return { key: '', apiRoomId: '', isPrivate: false, isCourse: false };
      if (/^student:/i.test(s)) {
        const em = s.replace(/^student:/i, '').trim().toLowerCase();
        return { key: 'student:' + em, apiRoomId: 'student:' + em, isPrivate: true, isCourse: false, studentEmail: em };
      }
      if (/^course:/i.test(s)) {
        let cid = s.replace(/^course:/i, '').trim().toLowerCase();
        if (cid === '65e7688d524c58000836593b') cid = '65e7704a9ea90c00080d5195';
        return { key: 'course:' + cid, apiRoomId: 'course:' + cid, isPrivate: false, isCourse: true, courseId: cid };
      }
      const cls = s.replace(/^class:/i, '').trim().toUpperCase();
      return { key: cls, apiRoomId: 'class:' + cls, isPrivate: false, isCourse: false, classCode: cls };
    },
    roomMessages(classId) {
      const norm = D.normalizeRoomKey(classId);
      const upKey = String(norm.key || '').toUpperCase();
      const upApi = String(norm.apiRoomId || '').toUpperCase();
      return (app.state?.messages || [])
        .filter(m => {
          if (!m || m.blocked) return false;
          const mCls = String(m.classCode || '').toUpperCase();
          const mRoom = String(m.roomId || '').toUpperCase();
          return (upKey && (mCls === upKey || mRoom === upKey)) || (upApi && (mCls === upApi || mRoom === upApi));
        })
        .sort((a, b) => (Date.parse(a.timestamp || '') || 0) - (Date.parse(b.timestamp || '') || 0));
    },
    orders() {
      if (!app.state || !Array.isArray(app.state.orders)) {
        app.state = app.state || {};
        app.state.orders = (typeof app.getDefaultState === 'function' && Array.isArray(app.getDefaultState().orders))
          ? app.getDefaultState().orders.map(o => ({ ...o }))
          : (app.DEFAULT_ORDERS || []).map(o => ({ ...o }));
      }
      try {
        const busRaw = localStorage.getItem('ktn_sll_orders_bus');
        if (busRaw) {
          const bus = JSON.parse(busRaw);
          if (Array.isArray(bus)) {
            bus.forEach(bo => {
              if (bo && (bo.orderId || bo.id) && !app.state.orders.some(o => (o.orderId || o.id) === (bo.orderId || bo.id))) {
                app.state.orders.unshift(bo);
              }
            });
          }
        }
      } catch (e) {}
      try {
        const v1Raw = localStorage.getItem('ktn_sll_v1_state');
        if (v1Raw) {
          const v1 = JSON.parse(v1Raw);
          if (Array.isArray(v1.orders)) {
            v1.orders.forEach(vo => {
              if (vo && (vo.orderId || vo.id) && !app.state.orders.some(o => (o.orderId || o.id) === (vo.orderId || vo.id))) {
                app.state.orders.unshift(vo);
              }
            });
          }
        }
      } catch (e) {}
      return app.state.orders || [];
    },
    pendingOrders() {
      return D.orders().filter(o => o && (o.approvalStatus === 'pending' || !o.approvalStatus));
    }
  };
  app.lmsData = D;

  const STATUS = {
    active: ['ok', 'Đang học'],
    unassigned: ['blue', 'Chưa xếp lớp'],
    inactive: ['warn', 'Chưa kích hoạt'],
    locked: ['err', 'Đang khóa']
  };
  const tag = (cls, text, plain) => `<span class="lms-tag ${cls}${plain ? ' plain' : ''}">${esc(text)}</span>`;
  const initials = name => {
    const n = String(name || '?').trim();
    if (/^ban quản lý/i.test(n)) return 'QL';
    const cleaned = n.replace(/\([^)]*\)/g, ' ').replace(/^(Bé|Cô|Thầy)\s+/i, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
    return (cleaned || n).split(/\s+/).filter(Boolean).slice(-2).map(w => w[0] || '').join('').toUpperCase() || '?';
  };
  const shortTeacher = n => String(n || '').trim();

  /* ---------------- Unread ---------------- */
  const seenStore = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch { return {}; } };
  const seenKey = (r, room) => `${r}:${room}`;
  const unreadOf = (r, room) => {
    const last = Number(seenStore()[seenKey(r, room)] || 0);
    const myRole = r;
    return D.roomMessages(room).filter(m => (Date.parse(m.timestamp || '') || 0) > last && (m.senderRole || m.sender) !== myRole).length;
  };
  const markSeen = (r, room) => {
    const msgs = D.roomMessages(room);
    const last = msgs.length ? (Date.parse(msgs[msgs.length - 1].timestamp || '') || Date.now()) : Date.now();
    const st = seenStore(); st[seenKey(r, room)] = last;
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(st)); } catch {}
  };

  /* ---------------- Navigation model ---------------- */
  function navItems(r) {
    if (r === 'admin') {
      const pend = D.pending().length;
      const pendCourse = D.pendingCourseHomeworks().length;
      const alerts = D.openAlerts().length;
      const unread = (app.classes || []).reduce((n, c) => n + unreadOf('admin', c.id), 0);
      const pendingOrdersCount = D.pendingOrders().length;
      return [
        { id: 'dash', label: 'Tổng quan', icon: 'home' },
        { grp: 'Đào tạo' },
        { id: 'classes', label: 'Lớp học', icon: 'class', count: (app.classes || []).length },
        { id: 'students', label: 'Học viên', icon: 'users', count: D.rows().length },
        { id: 'teachers', label: 'Giáo viên', icon: 'teacher', count: (app.teachers || []).length },
        { id: 'courses', label: 'Khóa học online', icon: 'play' },
        { grp: 'Theo dõi' },
        { id: 'orders', label: 'Đơn hàng & Duyệt', icon: 'zap', count: pendingOrdersCount, hot: pendingOrdersCount > 0 },
        { id: 'course-grade', label: 'Chấm bài Khóa học', icon: 'book', count: pendCourse, hot: pendCourse > 0 },
        { id: 'homework', label: 'Bài tập Lớp học', icon: 'check', count: pend, hot: pend > 0 },
        { id: 'groups', label: 'Nhóm lớp', icon: 'chat', count: unread, hot: unread > 0 },
        { id: 'alerts', label: 'Cảnh báo', icon: 'shield', count: alerts, hot: alerts > 0 }
      ];
    }
    if (r === 'teacher') {
      const ids = D.visibleClasses('teacher').map(c => c.id);
      const pend = D.pending(ids).length;
      const pendCourse = D.pendingCourseHomeworks().length;
      const unread = ids.reduce((n, id) => n + unreadOf('teacher', id), 0);
      return [
        { id: 'course-grade', label: 'Chấm bài Khóa học', icon: 'book', count: pendCourse, hot: pendCourse > 0 },
        { id: 'grade', label: 'Chấm bài Lớp học', icon: 'check', count: pend, hot: pend > 0 },
        { id: 'assign', label: 'Giao bài', icon: 'task', native: true, enter: () => app.switchTeacherTab('assign') },
        { id: 'groups', label: 'Nhóm lớp', icon: 'chat', count: unread, hot: unread > 0 }
      ];
    }
    const stu = app.getActiveParentStudent ? app.getActiveParentStudent() : null;
    const caseType = app.computeStudentCase ? app.computeStudentCase(stu) : 'both';
    const items = [];
    const room = (stu && stu.classCode) || 'course:6adadba969897b0002482ca5';
    const unread = room ? unreadOf('parent', room) : 0;
    if (caseType === 'both' || caseType === 'sll_only') {
      items.push({ id: 'homework', label: 'Bài tập', icon: 'book', native: true, enter: () => app.switchParentSubtab('homework') });
    }
    if (caseType === 'both' || caseType === 'online_only' || caseType === 'unassigned') {
      items.push({ id: 'courses', label: 'Khóa học online', icon: 'play', native: true, enter: () => app.switchParentSubtab('courses') });
    }
    items.push({ id: 'groups', label: 'Nhóm lớp', icon: 'chat', count: unread, hot: unread > 0 });
    return items;
  }

  const PAGE_TITLES = {
    dash: '📊 Tổng quan',
    classes: '🏫 Lớp học',
    students: '🎓 Học viên',
    teachers: '👩‍🏫 Giáo viên',
    courses: '🎬 Khóa học',
    orders: '💳 Đơn hàng',
    'course-grade': '✍️ Chấm bài',
    homework: '📝 Bài tập',
    groups: '💬 Nhóm lớp',
    alerts: '🛡️ Cảnh báo',
    grade: '✍️ Chấm bài Lớp học',
    assign: '📋 Giao bài'
  };

  function currentPage(r) {
    const items = navItems(r).filter(n => n.id);
    let p = L.page[r];
    if (!items.some(n => n.id === p)) p = items[0] ? items[0].id : '';
    L.page[r] = p;
    return p;
  }

  app.lmsGo = function (page, opts = {}) {
    const r = role();
    if (opts.room) L.room[r] = opts.room;
    if (opts.stuClass !== undefined) L.stuClass = opts.stuClass;
    if (opts.stuTab) L.stuTab = opts.stuTab;
    if (opts.hwClass !== undefined) L.hwClass = opts.hwClass;
    if (opts.hwTab) L.hwTab = opts.hwTab;
    if (opts.cgCourse !== undefined) L.cgCourse = opts.cgCourse;
    if (opts.cgTab) L.cgTab = opts.cgTab;
    if (opts.cgLesson !== undefined) L.cgLesson = opts.cgLesson;
    L.page[r] = page;
    L.moreOpen = false;
    const item = navItems(r).find(n => n.id === page);
    if (item && item.native && item.enter) item.enter();
    applyShell();
    try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch {}
    return false;
  };

  /* ---------------- DOM scaffolding ---------------- */
  function ensureDom() {
    if ($('lms-side')) return;
    const main = $('main-content');
    if (!main) return;
    const host = main.parentNode;

    const side = document.createElement('aside');
    side.id = 'lms-side';
    side.setAttribute('aria-label', 'Điều hướng chính');
    host.insertBefore(side, host.firstChild);

    const top = document.createElement('div');
    top.id = 'lms-top';
    main.insertBefore(top, main.firstChild);

    const page = document.createElement('section');
    page.id = 'lms-page';
    page.className = 'hidden';
    main.appendChild(page);

    const mtab = document.createElement('nav');
    mtab.id = 'lms-mtab';
    mtab.setAttribute('aria-label', 'Điều hướng nhanh');
    host.appendChild(mtab);

    const dlg = document.createElement('dialog');
    dlg.id = 'lms-dialog';
    dlg.className = 'lms-dialog';
    host.appendChild(dlg);

    const gdlg = document.createElement('dialog');
    gdlg.id = 'lms-grade-dlg';
    gdlg.className = 'lms-drawer-dlg';
    gdlg.addEventListener('close', () => { L.gradeOpen = null; });
    host.appendChild(gdlg);

    const pdlg = document.createElement('dialog');
    pdlg.id = 'lms-profile-dlg';
    pdlg.className = 'lms-dialog lms-profile-dlg';
    pdlg.addEventListener('close', () => { L.profileOpen = false; renderMtab(role(), currentPage(role())); });
    pdlg.addEventListener('cancel', () => { L.profileOpen = false; renderMtab(role(), currentPage(role())); });
    pdlg.addEventListener('click', ev => { if (ev.target === pdlg) app.lmsCloseProfile(); });
    host.appendChild(pdlg);
  }

  function ensureProfileDlg() {
    let pdlg = $('lms-profile-dlg');
    if (!pdlg) {
      const host = ($('main-content') && $('main-content').parentNode) || document.body;
      pdlg = document.createElement('dialog');
      pdlg.id = 'lms-profile-dlg';
      pdlg.className = 'lms-dialog lms-profile-dlg';
      pdlg.addEventListener('close', () => { L.profileOpen = false; renderMtab(role(), currentPage(role())); });
      pdlg.addEventListener('cancel', () => { L.profileOpen = false; renderMtab(role(), currentPage(role())); });
      pdlg.addEventListener('click', ev => { if (ev.target === pdlg) app.lmsCloseProfile(); });
      host.appendChild(pdlg);
    }
    return pdlg;
  }

  function userInfo(r) {
    const acc = window.sllAuth?.session?.account || {};
    if (r === 'admin') return { name: acc.name || 'Ban Quản Lý', sub: acc.email || 'Quản lý trung tâm' };
    if (r === 'teacher') return { name: app.state?.teacherName || acc.name || 'Giáo viên', sub: acc.email || 'Giáo viên' };
    const stu = app.getActiveParentStudent ? app.getActiveParentStudent() : null;
    return { name: (stu && stu.name) || acc.name || 'Học viên', sub: stu && stu.hasLiveClass && stu.classCode ? `Lớp ${stu.classCode}` : (acc.email || 'Học viên') };
  }

  function renderSide(r, page) {
    const side = $('lms-side');
    if (!side) return;
    const roleLabel = r === 'admin' ? 'Sổ liên lạc · Quản lý' : r === 'teacher' ? 'Sổ liên lạc · Giáo viên' : 'Sổ liên lạc · Học viên';
    const items = navItems(r);
    let html = `<div class="lms-brand"><img src="assets/logo.jpg" alt="" width="34" height="34"><div><b>Khổng Tử Nhí</b><small>${esc(roleLabel)}</small></div></div><nav class="lms-nav">`;
    items.forEach(n => {
      if (n.grp) { html += `<div class="lms-grp">${esc(n.grp)}</div>`; return; }
      const cnt = n.count ? `<span class="lms-cnt${n.hot ? ' hot' : ''}">${n.count}</span>` : '';
      html += `<button type="button" class="lms-nav-btn${n.id === page ? ' on' : ''}" onclick="app.lmsGo('${n.id}')">${I(n.icon)}<span>${esc(n.label)}</span>${cnt}</button>`;
    });
    if (r === 'teacher' && !D.visibleClasses('teacher').length) {
      html += `<div class="lms-side-empty">Chưa được phân lớp</div>`;
    }
    html += `</nav>`;
    const u = userInfo(r);
    html += `<div class="lms-me"><div class="lms-av">${esc(initials(u.name))}</div><div class="lms-me-txt"><b>${esc(u.name)}</b><small>${esc(u.sub)}</small></div><button type="button" class="lms-me-out" title="Đăng xuất" onclick="app.lmsLogout()">${I('out')}</button></div>`;
    side.innerHTML = html;
  }

  function renderTop(r, page) {
    const top = $('lms-top');
    if (!top) return;
    let title = PAGE_TITLES[page] || '📒 Sổ liên lạc';
    let sub = '';
    if (r === 'parent' && page === 'courses') title = '📒 Sổ liên lạc · Khóa học';
    if (r === 'parent' && page === 'homework') title = '📒 Sổ liên lạc · Bài tập';
    const u = userInfo(r);
    const search = r === 'admin'
      ? `<label class="lms-search">${I('search')}<input id="lms-global-search" type="search" placeholder="Tìm học viên theo tên, email, SĐT" value="${esc(L.stuQuery)}" onkeydown="if(event.key==='Enter'){app.lmsSearchStudents(this.value)}"></label>`
      : '';
    const bellBtn = `
      <button type="button" class="ktn-bell-btn lms-bell-btn" id="ktn-bell-trigger" onclick="(window.KTN_NOTIF||window.app)?.toggleNotificationCenter?.()" title="Trung tâm thông báo" aria-label="Xem thông báo">
        <svg class="ktn-bell-icon lms-bell-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        <span class="ktn-unread-badge lms-bell-badge hidden" id="ktn-unread-count">0</span>
      </button>
    `;
    const userBtn = `
      <div class="lms-top-act">
        ${bellBtn}
        <button type="button" class="lms-top-profile" onclick="app.lmsOpenProfile()" title="Tài khoản cá nhân: ${esc(u.name)}">
          <span class="lms-top-av">${esc(initials(u.name))}</span>
          <span class="lms-top-name">${esc(u.name)}</span>
        </button>
      </div>
    `;
    top.innerHTML = `<div class="lms-crumb"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>${search}${userBtn}`;
    if (window.KTN_NOTIF && typeof window.KTN_NOTIF.recalculateUnreadBadge === 'function') {
      setTimeout(() => window.KTN_NOTIF.recalculateUnreadBadge(), 0);
    }
    const native = Boolean((navItems(r).find(n => n.id === page) || {}).native);
    top.classList.toggle('has-ph', !native);
    top.classList.toggle('no-search', !search);
  }

  function renderMtab(r, page) {
    const bar = $('lms-mtab');
    if (!bar) return;
    const items = navItems(r).filter(n => n.id);
    const MOBILE_FIRST = { admin: ['dash', 'orders', 'students', 'homework', 'groups'] };
    const order = MOBILE_FIRST[r];
    const primary = items.length > 5
      ? (order ? order.map(id => items.find(n => n.id === id)).filter(Boolean) : items.slice(0, 4))
      : items;
    const rest = items.length > 5 ? items.filter(n => !primary.includes(n)) : [];
    const btn = n => `<button type="button" class="${n.id === page && !L.profileOpen ? 'on' : ''}" onclick="app.lmsCloseProfile(); app.lmsGo('${n.id}')">${I(n.icon)}<span>${esc(n.label.replace(' & chấm', '').replace(' online', ''))}</span>${n.count && n.hot ? `<i>${n.count}</i>` : ''}</button>`;
    let html = primary.map(btn).join('');
    if (rest.length) {
      const restOn = rest.some(n => n.id === page);
      html += `<button type="button" class="${restOn && !L.profileOpen ? 'on' : ''}" onclick="app.lmsToggleMore()">${I('dots')}<span>Khác</span></button>`;
      html += `<div class="lms-more${L.moreOpen ? ' open' : ''}">
        <button type="button" class="${L.profileOpen ? 'on' : ''}" onclick="app.lmsOpenProfile()">${I('user')}<span>Tài khoản</span></button>
        ${rest.map(n => `<button type="button" class="${n.id === page ? 'on' : ''}" onclick="app.lmsGo('${n.id}')">${I(n.icon)}<span>${esc(n.label)}</span>${n.count ? `<b>${n.count}</b>` : ''}</button>`).join('')}
        <button type="button" onclick="app.lmsLogout()">${I('out')}<span>Đăng xuất</span></button>
      </div>`;
    } else {
      html += `<button type="button" class="${L.profileOpen ? 'on' : ''}" onclick="app.lmsOpenProfile()">${I('user')}<span>Tài khoản</span></button>`;
    }
    bar.innerHTML = html;
  }

  app.lmsToggleMore = function () { L.moreOpen = !L.moreOpen; renderMtab(role(), currentPage(role())); };
  app.lmsLogout = function () {
    if (document.body.dataset.auth === 'demo' && $('demo-return-login')) { $('demo-return-login').click(); return; }
    if ($('auth-logout')) $('auth-logout').click();
    else if (window.sllAuth && window.sllAuth.logout) window.sllAuth.logout();
  };

  app.lmsOpenProfile = function () {
    const dlg = ensureProfileDlg();
    if (!dlg) return;
    const r = role();
    const u = userInfo(r);
    const acc = window.sllAuth?.session?.account || window.sllAuth?.session?.user || window.sllAuth?.session?.payload || {};
    const stu = app.getActiveParentStudent ? app.getActiveParentStudent() : null;
    const teacher = (r === 'parent' && app.getStudentTeacher) ? app.getStudentTeacher(stu) : null;
    const cls = stu && stu.classCode && app.getClassInfo ? app.getClassInfo(stu.classCode) : null;
    const sr = (window.sllAuth && typeof window.sllAuth.sessionRole === 'function')
      ? window.sllAuth.sessionRole()
      : null;

    let roleTag = 'Học viên';
    if (r === 'admin') roleTag = 'Quản lý trung tâm';
    else if (r === 'teacher') roleTag = 'Giáo viên';
    else if (stu && stu.hasLiveClass && stu.classCode) roleTag = 'Học viên lớp trực tiếp';
    else roleTag = 'Học viên khóa online';

    let stuSwitcher = '';
    // Chỉ hiển thị switcher khi là phụ huynh (parent) và có từ 2 học sinh thật trở lên.
    // Tuyệt đối không hiển thị cho học sinh cá nhân (sr === 'student')
    if (sr !== 'student' && r === 'parent' && Array.isArray(app.students) && app.students.length > 1) {
      stuSwitcher = `
        <div class="lms-profile-sec">
          <div class="lms-profile-lbl">Chuyển học viên (${app.students.length})</div>
          <div class="lms-stu-chips">
            ${app.students.map((s, idx) => `
              <button type="button" class="lms-stu-chip${idx === app.activeParentStudentIdx ? ' on' : ''}" onclick="if(app.selectParentStudent){app.selectParentStudent(${idx});}else{app.activeParentStudentIdx=${idx};} if(window.app.lmsApply){window.app.lmsApply();}else if(typeof applyShell==='function'){applyShell();} app.lmsCloseProfile();">
                <span class="lms-av sm">${esc(initials(s.name))}</span>
                <span>${esc(s.name)}</span>
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }

    let classMeta = '';
    if (r === 'parent' && stu) {
      if (stu.hasLiveClass && stu.classCode) {
        // Học viên CÓ lớp trực tiếp
        const clsName = (cls && cls.title) || `Lớp ${stu.classCode}`;
        const teacherName = teacher ? teacher.name : '';
        const schedule = cls && (cls.schedule || cls.time) ? (cls.schedule || cls.time) : '';
        classMeta = `
          <div class="lms-profile-grid">
            <div class="lms-profile-item">
              <span class="lbl">Mã học viên</span>
              <span class="val">${esc(stu.code || stu.studentCode || stu.id || 'KTN-HV')}</span>
            </div>
            <div class="lms-profile-item">
              <span class="lbl">Lớp học</span>
              <span class="val">${esc(clsName)}</span>
            </div>
            ${teacherName ? `
              <div class="lms-profile-item">
                <span class="lbl">Giáo viên</span>
                <span class="val">${esc(teacherName)}</span>
              </div>
            ` : ''}
            ${schedule ? `
              <div class="lms-profile-item">
                <span class="lbl">Lịch học</span>
                <span class="val">${esc(schedule)}</span>
              </div>
            ` : ''}
          </div>
        `;
      } else {
        // Học viên KHÔNG ở trong lớp trực tiếp: tuyệt đối không hiển thị lớp hoặc giáo viên giả!
        const onlineCount = (stu.courseIds && stu.courseIds.length) || (stu.onlineCount) || 0;
        const activeCourseObjs = (stu.courseIds && Array.isArray(stu.courseIds))
          ? (app.onlineCourses || []).filter(c => stu.courseIds.includes(c.id))
          : [];
        const courseNames = activeCourseObjs.map(c => c.title).join(', ');
        const onlineVal = onlineCount > 0
          ? (courseNames ? `${onlineCount} khóa (${courseNames})` : `${onlineCount} khóa học`)
          : 'Chưa kích hoạt';
        classMeta = `
          <div class="lms-profile-grid">
            <div class="lms-profile-item">
              <span class="lbl">Mã tài khoản</span>
              <span class="val">${esc(stu.code || stu.studentCode || stu.id || 'KTN-HV')}</span>
            </div>
            <div class="lms-profile-item">
              <span class="lbl">Hình thức học</span>
              <span class="val">Khóa học online</span>
            </div>
            <div class="lms-profile-item">
              <span class="lbl">Khóa học đã mở</span>
              <span class="val" style="${onlineCount > 0 ? 'color:#059669;font-weight:700;' : ''}">${esc(onlineVal)}</span>
            </div>
            <div class="lms-profile-item">
              <span class="lbl">Lớp trực tiếp</span>
              <span class="val lms-muted-txt">Chưa đăng ký</span>
            </div>
          </div>
        `;
      }
    } else if (r === 'teacher') {
      const classes = D.visibleClasses('teacher');
      classMeta = `
        <div class="lms-profile-grid">
          <div class="lms-profile-item">
            <span class="lbl">Lớp phụ trách</span>
            <span class="val">${classes.length ? classes.map(c => c.id).join(', ') : 'Chưa phân lớp'}</span>
          </div>
          <div class="lms-profile-item">
            <span class="lbl">Email giáo viên</span>
            <span class="val">${esc(acc.email || u.sub || '')}</span>
          </div>
        </div>
      `;
    }

    dlg.innerHTML = `
      <div class="lms-dlg-h">
        <h2>Tài khoản cá nhân</h2>
        <button type="button" class="lms-more-btn" onclick="app.lmsCloseProfile()" title="Đóng">${I('x')}</button>
      </div>
      <div class="lms-dlg-b lms-profile-body">
        <div class="lms-profile-card">
          <div class="lms-profile-av">${esc(initials(u.name))}</div>
          <div class="lms-profile-info">
            <div class="lms-profile-name">${esc(u.name)}</div>
            <div class="lms-profile-badge">${esc(roleTag)}</div>
            <div class="lms-profile-email">${esc(acc.email || u.sub || '')}</div>
            ${acc.phone ? `<div class="lms-profile-phone">${esc(acc.phone)}</div>` : ''}
          </div>
        </div>
        ${stuSwitcher}
        ${classMeta}
        <div class="lms-profile-act">
          <button type="button" class="lms-btn-logout-full" onclick="app.lmsCloseProfile(); app.lmsLogout();">
            ${I('out')}
            <span>Đăng xuất tài khoản</span>
          </button>
        </div>
      </div>
    `;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    L.profileOpen = true;
    renderMtab(r, currentPage(r));
  };

  app.lmsCloseProfile = function () {
    const dlg = $('lms-profile-dlg');
    if (dlg) {
      if (typeof dlg.close === 'function') dlg.close();
      else dlg.removeAttribute('open');
    }
    L.profileOpen = false;
    renderMtab(role(), currentPage(role()));
  };
  app.lmsPickTeacherClass = function (id) {
    if (app.filterTeacherClass) app.filterTeacherClass(id);
    const p = L.page.teacher;
    if (p === 'groups' && id !== 'ALL') L.room.teacher = id;
    applyShell();
  };
  app.lmsSearchStudents = function (q) {
    L.stuQuery = String(q || '');
    L.stuTab = 'all';
    app.lmsGo('students');
  };

  /* ---------------- Admin pages ---------------- */
  const pageHead = (title, sub, actions = '') =>
    `<div class="lms-ph"><div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="lms-ph-act">${actions}</div>` : ''}</div>`;
  const btn = (label, onclick, opts = {}) =>
    `<button type="button" class="lms-btn${opts.pri ? ' pri' : ''}${opts.sm ? ' sm' : ''}" onclick="${onclick}">${opts.icon ? I(opts.icon) : ''}${esc(label)}</button>`;
  const bar = pct => `<div class="lms-bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
  const today = () => {
    try { return new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return ''; }
  };

  function pageDash() {
    const rows = D.rows();
    const inClass = rows.filter(x => x.classCode).length;
    const classes = app.classes || [];
    const empty = classes.filter(c => !D.classStudents(c.id).length);
    let done = 0, total = 0;
    classes.forEach(c => { const s = D.submitted(c); done += s.done; total += s.total; });
    const rate = total ? Math.round(done * 100 / total) : 0;
    const pend = D.pending();
    const overdue = pend.filter(D.isOverdue);
    const alerts = D.openAlerts();
    const weekAgo = Date.now() - 7 * 864e5;
    const unassigned = rows.filter(x => !x.classCode && x.status !== 'locked' && (x.kind === 'roster' || (x.createdTs && x.createdTs >= weekAgo)));

    const todos = [];
    const pendingOrders = D.pendingOrders();
    const pendCourse = D.pendingCourseHomeworks();
    if (pendingOrders.length) {
      const o0 = pendingOrders[0];
      todos.push({
        ic: 'zap',
        tone: 'r',
        t: `${pendingOrders.length} đơn đăng ký khóa học chờ duyệt 1 chạm`,
        s: `Mới nhất: ${esc(o0.studentName || o0.name || 'Học viên')} (${esc(o0.courseName || 'Khóa học')}) · ${esc(o0.phone || o0.studentPhone || '')}`,
        b: btn('Duyệt ngay', "app.lmsGo('orders')", { pri: true, sm: true })
      });
    }
    if (pendCourse.length) {
      const ch0 = pendCourse[0];
      todos.push({
        ic: 'book',
        tone: 'a',
        t: `${pendCourse.length} bài nộp Khóa học Online chờ chấm (Học viên tự do)`,
        s: `Mới nhất: ${esc(ch0.studentName || 'Học viên')} · Khóa ${esc(ch0.courseTitle || 'Online')} · Bài ${esc(String(ch0.lessonNum || 1))}`,
        b: btn('Chấm theo Khóa', "app.lmsGo('course-grade',{cgTab:'pending'})", { pri: true, sm: true })
      });
    }
    if (alerts.length) {
      sortAlerts();
      const a0 = D.openAlerts()[0] || alerts[0];
      todos.push({ ic: 'shield', tone: 'r', t: `${alerts.length} cảnh báo an toàn chưa xử lý`, s: `Mới nhất: ${esc(String(a0.teacher || '').replace(/\s*\(.*\)$/, ''))} · ${esc(a0.channel || '')} · ${esc(a0.time || '')}`, b: btn('Xem', "app.lmsGo('alerts')", { sm: true }) });
    }
    if (overdue.length) {
      const h = overdue[0];
      todos.push({ ic: 'clock', tone: 'a', t: `${overdue.length} bài nộp quá 24 giờ chưa chấm`, s: `${esc(h.studentName || '')} · ${esc(h.lesson || '')} · Lớp ${esc(h.classCode || '')}`, b: btn('Xem bài', "app.lmsGo('homework',{hwTab:'pending'})", { sm: true }) });
    } else if (pend.length) {
      todos.push({ ic: 'clock', tone: 'a', t: `${pend.length} bài chờ giáo viên chấm`, s: pend.map(h => esc(h.studentName || '')).slice(0, 3).join(', '), b: btn('Xem bài', "app.lmsGo('homework',{hwTab:'pending'})", { sm: true }) });
    }
    if (unassigned.length) todos.push({ ic: 'userx', tone: 'b', t: `${unassigned.length} tài khoản mới chưa xếp lớp`, s: unassigned.slice(0, 3).map(x => esc(x.name)).join(', ') + (unassigned.length > 3 ? '…' : ''), b: btn('Xếp lớp', "app.lmsGo('students',{stuTab:'unassigned',stuClass:''})", { sm: true }) });
    empty.forEach(c => todos.push({ ic: 'class', tone: 'g', t: `Lớp ${esc(c.id)} chưa có học viên`, s: `${esc(shortTeacher(c.teacherName))} · ${esc(c.schedule || '')}`, b: btn('Thêm HV', `app.lmsOpenAddToClass('${esc(c.id)}')`, { sm: true }) }));

    const todoHtml = todos.length
      ? `<ul class="lms-todo">${todos.map(t => `<li><span class="lms-ti ${t.tone}">${I(t.ic)}</span><div><b>${t.t}</b><small>${t.s}</small></div>${t.b}</li>`).join('')}</ul>`
      : `<div class="lms-empty">Không có việc tồn đọng.</div>`;

    const classRows = classes.map(c => {
      const n = D.classStudents(c.id).length;
      const cur = D.classLesson(c);
      const tl = Number(c.totalLessons) || 25;
      const s = D.submitted(c);
      const sTag = !s.total ? tag('gray', '—', true) : s.done === s.total ? tag('ok', `${s.done}/${s.total}`, true) : tag('warn', `${s.done}/${s.total}`, true);
      return `<tr class="lms-click" onclick="app.lmsGo('classes')"><td><b>${esc(c.id)}</b><small class="lms-sub">${esc(shortTeacher(c.teacherName))} · ${n} HV</small></td><td class="lms-num">${cur}/${tl}${bar(cur * 100 / tl)}</td><td>${sTag}</td></tr>`;
    }).join('') || `<tr><td colspan="3" class="lms-empty">Chưa có lớp.</td></tr>`;

    return pageHead('📒 Sổ liên lạc · Tổng quan', esc(today()), btn('Mở lớp', 'app.openAdminCreateClassModal()', { icon: 'plus' }) + btn('Thêm HV', "app.openAdminProvisionModal('student')", { pri: true, icon: 'plus' })) +
      `<div class="lms-kpis">
        <div class="lms-card lms-kpi"><div class="l">Học viên</div><div class="v">${inClass}</div><div class="s">/ ${rows.length} TK</div></div>
        <div class="lms-card lms-kpi"><div class="l">Lớp học</div><div class="v">${classes.length}</div><div class="s${empty.length ? ' bad' : ''}">${empty.length ? `${empty.length} lớp trống` : 'Đủ HV'}</div></div>
        <div class="lms-card lms-kpi"><div class="l">Nộp bài</div><div class="v">${rate}%</div>${bar(rate)}<div class="s">${done}/${total} HV</div></div>
        <div class="lms-card lms-kpi"><div class="l">Chờ chấm</div><div class="v">${pend.length}</div><div class="s${overdue.length ? ' bad' : ''}">${overdue.length ? `${overdue.length} quá hạn` : 'Đúng hạn'}</div></div>
      </div>
      <div class="lms-grid2">
        <div class="lms-card"><div class="lms-card-h"><h2>Cần xử lý</h2><span class="lms-muted">${todos.length} việc</span></div>${todoHtml}</div>
        <div class="lms-card"><div class="lms-card-h"><h2>Lớp học</h2><a href="#" onclick="return app.lmsGo('classes')">Tất cả</a></div>
          <table class="lms-table"><thead><tr><th>Lớp</th><th>Buổi</th><th>Đã nộp</th></tr></thead><tbody>${classRows}</tbody></table></div>
      </div>`;
  }

  function pageClasses() {
    const classes = app.classes || [];
    const cards = classes.map(c => {
      const n = D.classStudents(c.id).length;
      const cur = D.classLesson(c);
      const tl = Number(c.totalLessons) || 25;
      const pct = Math.round(cur * 100 / tl);
      const st = n ? '' : tag('gray', 'Chưa có HV');
      const foot = n
        ? `${btn('Học viên', `app.lmsGo('students',{stuClass:'${esc(c.id)}',stuTab:'all'})`, { sm: true })}${btn('Bài tập', `app.lmsGo('homework',{hwClass:'${esc(c.id)}',hwTab:'all'})`, { sm: true })}${btn('Nhóm lớp', `app.lmsGo('groups',{room:'${esc(c.id)}'})`, { sm: true })}`
        : btn('Thêm học viên', `app.lmsOpenAddToClass('${esc(c.id)}')`, { sm: true, pri: true, icon: 'plus' });
      return `<div class="lms-card lms-cls">
        <div class="hd"><span class="code">${esc(c.id)}</span>${st}<button type="button" class="lms-more-btn" title="Sửa lớp" onclick="app.openAdminEditClassModal('${esc(c.id)}')">${I('pen')}</button></div>
        <div class="meta"><span>${I('teacher')}${esc(shortTeacher(c.teacherName) || 'Chưa phân công')}</span><span>${I('cal')}${esc(c.schedule || '—')}</span><span>${I('users')}${n} học viên${n ? ` · <a href="#" onclick="return app.lmsOpenAddToClass('${esc(c.id)}')">+ thêm</a>` : ''}</span></div>
        <div><div class="lms-row-sb"><span>Buổi ${cur}/${tl}</span><span>${pct}%</span></div>${bar(pct)}</div>
        <div class="ft">${foot}</div>
      </div>`;
    }).join('');
    return pageHead('Lớp học', '', btn('Mở lớp', 'app.openAdminCreateClassModal()', { pri: true, icon: 'plus' })) +
      (classes.length ? `<div class="lms-classes">${cards}</div>` : `<div class="lms-card lms-empty">Chưa có lớp. Bấm “Mở lớp” để tạo lớp đầu tiên.</div>`);
  }

  function pageStudents() {
    if (typeof app.syncApprovedOrdersToStudents === 'function') {
      try { app.syncApprovedOrdersToStudents(); } catch {}
    }
    const all = D.rows();
    const counts = {
      all: all.length,
      unassigned: all.filter(x => !x.classCode && x.status !== 'locked').length,
      inactive: all.filter(x => x.status === 'inactive').length,
      locked: all.filter(x => x.status === 'locked').length
    };
    let list = all;
    if (L.stuTab === 'unassigned') list = list.filter(x => !x.classCode && x.status !== 'locked');
    else if (L.stuTab === 'inactive') list = list.filter(x => x.status === 'inactive');
    else if (L.stuTab === 'locked') list = list.filter(x => x.status === 'locked');
    if (L.stuClass) list = list.filter(x => x.classCode === L.stuClass);
    const q = fold(L.stuQuery);
    if (q) list = list.filter(x => fold(x.name).includes(q) || fold(x.email).includes(q) || fold(x.phone).includes(q));
    L._stuVisible = list;
    const PER = 50;
    const pages = Math.max(1, Math.ceil(list.length / PER));
    if (!(L.stuPage >= 0) || L.stuPage >= pages) L.stuPage = 0;
    const pageRows = list.slice(L.stuPage * PER, L.stuPage * PER + PER);

    const tabs = [['all', 'Tất cả'], ['unassigned', 'Chưa xếp lớp'], ['inactive', 'Chưa kích hoạt'], ['locked', 'Đang khóa']]
      .map(([k, l]) => `<button type="button" class="lms-tab${L.stuTab === k ? ' on' : ''}" onclick="app.lmsSet('stuTab','${k}')">${l} <span class="c">${counts[k]}</span></button>`).join('');
    const classOpts = `<option value="">Mọi lớp</option>` + (app.classes || []).map(c => `<option value="${esc(c.id)}"${L.stuClass === c.id ? ' selected' : ''}>${esc(c.id)}</option>`).join('');

    const body = pageRows.map(x => {
      const [tc, tl] = STATUS[x.status] || STATUS.unassigned;
      const nameCell = x.kind === 'roster'
        ? `<button type="button" class="lms-link" onclick="app.openStudentFromAdmin(${x.idx})"><b>${esc(x.name)}</b></button>`
        : `<b>${esc(x.name)}</b>`;
      const classCell = x.classCode
        ? `<b>${esc(x.classCode)}</b>`
        : (x.status === 'locked' ? '<span class="lms-faint">—</span>' : btn('Xếp lớp', `app.lmsOpenEnroll('${esc(x.key)}')`, { sm: true }));
      const online = x.kind === 'roster'
        ? `<button type="button" class="lms-chip${x.online ? ' on' : ''}" onclick="app.lmsToggleOnline(${x.idx})">${x.online ? `${x.online} khóa` : 'Chưa mở'}</button>`
        : (x.online ? `<span class="lms-num">${x.online} khóa</span>` : '<span class="lms-faint">—</span>');
      const menu = x.classCode ? `<button type="button" class="lms-more-btn" title="Chuyển lớp" onclick="app.lmsOpenEnroll('${esc(x.key)}')">${I('pen')}</button>` : '';
      return `<tr>
        <td><div class="lms-who"><div class="lms-av sm">${esc(initials(x.name))}</div><div>${nameCell}<small>${esc(x.email)}</small></div></div></td>
        <td class="lms-num hide-m">${esc(x.phone || '—')}</td>
        <td>${classCell}</td>
        <td class="hide-m">${online}</td>
        <td class="lms-num hide-m">${esc(x.created || '—')}</td>
        <td>${tag(tc, tl)}</td>
        <td class="lms-r">${menu}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="7" class="lms-empty">Không có học viên phù hợp.</td></tr>`;

    const src = L.iz.status === 'ok'
      ? `Từ izTeach · cập nhật ${esc(fmtIzDate(new Date(L.iz.at).toISOString()).slice(0, 5))} · <a href="#" onclick="app.lmsFetchIz(true);return false">Làm mới</a>`
      : L.iz.status === 'loading' ? 'Đang tải danh sách từ izTeach…'
        : L.iz.status === 'error' ? `Không tải được danh sách izTeach (${esc(L.iz.error)}) · <a href="#" onclick="app.lmsFetchIz(true);return false">Thử lại</a>`
          : '';
    const pager = pages > 1
      ? `<div class="lms-pager"><span>${L.stuPage * PER + 1}–${Math.min(list.length, (L.stuPage + 1) * PER)} / ${list.length}</span><span>${btn('Trước', `app.lmsSet('stuPage', ${L.stuPage - 1})`, { sm: true }).replace('<button', L.stuPage === 0 ? '<button disabled' : '<button')}${btn('Sau', `app.lmsSet('stuPage', ${L.stuPage + 1})`, { sm: true }).replace('<button', L.stuPage >= pages - 1 ? '<button disabled' : '<button')}</span></div>`
      : '';

    return pageHead('Học viên', src,
      (isLocalHost() ? btn('Nhập Excel', 'app.openImportExcelModal()', { icon: 'up' }) : '') + btn('Xuất CSV', 'app.lmsExportStudents()', { icon: 'dl' }) + btn('Thêm học viên', "app.openAdminProvisionModal('student')", { pri: true, icon: 'plus' })) +
      `<div class="lms-card">
        <div class="lms-tabs">${tabs}</div>
        <div class="lms-toolbar">
          <label class="lms-field">${I('search')}<input id="lms-stu-search" type="search" placeholder="Tên, email hoặc SĐT" value="${esc(L.stuQuery)}" oninput="app.lmsSet('stuQuery', this.value)"></label>
          <label class="lms-field"><select onchange="app.lmsSet('stuClass', this.value)" aria-label="Lọc theo lớp">${classOpts}</select></label>
          ${list.length !== all.length ? `<span class="lms-toolbar-r">${list.length} kết quả</span>` : ''}
        </div>
        <div class="lms-table-wrap"><table class="lms-table">
          <thead><tr><th>Học viên</th><th class="hide-m">Số điện thoại</th><th>Lớp</th><th class="hide-m">Khóa online</th><th class="hide-m">Ngày tạo</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>${body}</tbody>
        </table></div>
        ${pager}
      </div>`;
  }

  app.lmsExportStudents = function () {
    const list = Array.isArray(L._stuVisible) ? L._stuVisible : D.rows();
    const safe = v => {
      let s = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const head = ['Họ và tên', 'Email', 'Số điện thoại', 'Lớp', 'Trạng thái', 'Ngày tạo'];
    const lines = [head.map(safe).join(',')].concat(list.map(x => [x.name, x.email, x.phone, x.classCode, (STATUS[x.status] || STATUS.unassigned)[1], x.created].map(safe).join(',')));
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hoc-vien-khong-tu-nhi-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    app.showToast(`Đã xuất ${list.length} học viên.`);
  };

  function pageTeachers() {
    const teachers = app.teachers || [];
    const rows = teachers.map(t => {
      const cls = (app.classes || []).filter(c => c.teacherCode === t.code);
      const ids = cls.map(c => c.id);
      const nStu = ids.reduce((n, id) => n + D.classStudents(id).length, 0);
      const pend = D.pending(ids).length;
      return `<tr>
        <td><div class="lms-who"><div class="lms-av sm">${esc(initials(t.name))}</div><div><b>${esc(t.name)}</b><small>${esc(t.email || '')}</small></div></div></td>
        <td>${cls.length ? cls.map(c => `<span class="lms-pill">${esc(c.id)}</span>`).join(' ') : '<span class="lms-faint">Chưa có lớp</span>'}</td>
        <td class="lms-num">${nStu}</td>
        <td>${pend ? tag('warn', `${pend} bài`, true) : '<span class="lms-faint">—</span>'}</td>
        <td class="lms-num hide-m">${esc(t.phone || '—')}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="5" class="lms-empty">Chưa có giáo viên.</td></tr>`;
    const locked = Boolean(app.state?.teacherChatLocked);
    return pageHead('Giáo viên', '', btn('Thêm giáo viên', "app.openAdminProvisionModal('teacher')", { pri: true, icon: 'plus' })) +
      `<div class="lms-card"><div class="lms-table-wrap"><table class="lms-table">
        <thead><tr><th>Giáo viên</th><th>Lớp phụ trách</th><th>Học viên</th><th>Chờ chấm</th><th class="hide-m">Số điện thoại</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>
      <div class="lms-card lms-inline"><div><b>Quyền nhắn tin của giáo viên</b><small>${locked ? 'Đang khóa: giáo viên không gửi được tin nhắn và nhận xét.' : 'Đang mở.'}</small></div>${btn(locked ? 'Mở lại' : 'Khóa', "app.openAction('lock')", { sm: true })}</div>`;
  }

  function pageCourses() {
    const roster = D.roster();
    const rows = roster.map(({ s, idx }) => {
      const n = s.hasOnlineCourses ? (s.courseIds || []).length : 0;
      return `<tr>
        <td><div class="lms-who"><div class="lms-av sm">${esc(initials(s.name))}</div><div><b>${esc(s.name)}</b><small>${esc(s.email || '')}</small></div></div></td>
        <td>${s.hasLiveClass && s.classCode ? `<b>${esc(s.classCode)}</b>` : '<span class="lms-faint">—</span>'}</td>
        <td>${n ? tag('ok', `${n} khóa`) : tag('gray', 'Chưa mở')}</td>
        <td class="lms-r">${btn(n ? 'Tắt' : 'Mở khóa học', `app.lmsToggleOnline(${idx})`, { sm: true, pri: !n })}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="4" class="lms-empty">Chưa có học viên.</td></tr>`;
    const opened = roster.filter(({ s }) => s.hasOnlineCourses).length;
    return pageHead('Khóa học online', `${opened}/${roster.length} học viên đã mở`) +
      `<div class="lms-card"><div class="lms-table-wrap"><table class="lms-table">
        <thead><tr><th>Học viên</th><th>Lớp</th><th>Khóa online</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  function renderGradeModeSwitch(activeMode) {
    const r = role();
    const pendCourse = D.pendingCourseHomeworks().length;
    const classIds = r === 'teacher' ? D.visibleClasses('teacher').map(c => c.id) : null;
    const pendClass = D.pending(classIds).length;
    const classTargetPage = r === 'teacher' ? 'grade' : 'homework';
    return `<div class="lms-mode-switch" role="tablist" aria-label="Chế độ chấm bài">
      <button type="button" class="${activeMode === 'course' ? 'on' : ''}" onclick="app.lmsGo('course-grade')">
        🎓 Khóa Online${pendCourse ? `<i>${pendCourse}</i>` : ''}
      </button>
      <button type="button" class="${activeMode === 'class' ? 'on' : ''}" onclick="app.lmsGo('${classTargetPage}')">
        🏫 Lớp học${pendClass ? `<i>${pendClass}</i>` : ''}
      </button>
    </div>`;
  }

  function pageCourseGrade() {
    const allCourseHws = D.courseHomeworks('ALL');
    const selectedCourse = L.cgCourse || 'ALL';
    const courseFiltered = selectedCourse === 'ALL'
      ? allCourseHws
      : allCourseHws.filter(h => h.courseId === selectedCourse);

    const counts = {
      pending: courseFiltered.filter(h => h.status === 'PENDING').length,
      graded: courseFiltered.filter(h => h.status === 'GRADED').length,
      all: courseFiltered.length
    };

    if (!['pending', 'graded', 'all'].includes(L.cgTab)) L.cgTab = 'pending';
    let list = courseFiltered;
    if (L.cgTab === 'pending') list = list.filter(h => h.status === 'PENDING');
    else if (L.cgTab === 'graded') list = list.filter(h => h.status === 'GRADED');

    if (L.cgLesson) {
      list = list.filter(h => String(h.lessonNum || '') === String(L.cgLesson));
    }
    const q = fold(L.cgQuery || '').trim();
    if (q) {
      list = list.filter(h =>
        fold(h.studentName || '').includes(q) ||
        fold(h.studentEmail || '').includes(q) ||
        fold(h.title || '').includes(q) ||
        fold(h.courseTitle || '').includes(q) ||
        fold(h.parentNote || '').includes(q)
      );
    }

    // KPI tổng hợp cho Khóa học Online
    const totalPendingAll = allCourseHws.filter(h => h.status === 'PENDING').length;
    const totalGradedAll = allCourseHws.filter(h => h.status === 'GRADED').length;
    const scoredItems = allCourseHws.filter(h => h.status === 'GRADED' && Number.isFinite(Number(h.score)));
    const avgScore = scoredItems.length
      ? (scoredItems.reduce((s, h) => s + Number(h.score), 0) / scoredItems.length).toFixed(1)
      : '—';
    const uniqueOnlineStudents = new Set(allCourseHws.map(h => String(h.studentEmail || h.userId || h.studentName || '').toLowerCase()).filter(Boolean)).size;

    // Thẻ chọn khóa học (cuộn ngang gọn gàng trên mobile)
    const allCardActive = selectedCourse === 'ALL';
    const courseCardsHtml = `
      <div class="lms-course-cards">
        <button type="button" class="lms-course-card${allCardActive ? ' on' : ''}" onclick="app.lmsSet('cgCourse','ALL'); app.lmsSet('cgLesson','');">
          <div class="lms-course-card-top">
            <span class="lms-course-card-title">🌐 Tất cả khóa</span>
            ${totalPendingAll ? tag('warn', `${totalPendingAll} chờ`) : tag('ok', 'Đã chấm')}
          </div>
          <div class="lms-course-card-sub">HSK1 3.0 · Chinese For Kids · Tiếng Trung Tổng Hợp</div>
          <div class="lms-course-card-stats">
            <span class="lms-pill">Tổng: ${allCourseHws.length} bài</span>
            <span class="lms-pill">Đã chấm: ${totalGradedAll}</span>
          </div>
        </button>
        ${ONLINE_COURSE_LIST.map(c => {
          const cList = allCourseHws.filter(h => h.courseId === c.id);
          const cPend = cList.filter(h => h.status === 'PENDING').length;
          const cGraded = cList.filter(h => h.status === 'GRADED').length;
          const isOn = selectedCourse === c.id;
          return `<button type="button" class="lms-course-card${isOn ? ' on' : ''}" onclick="app.lmsSet('cgCourse','${esc(c.id)}'); app.lmsSet('cgLesson','');">
            <div class="lms-course-card-top">
              <span class="lms-course-card-title">${c.icon} ${esc(c.title)}</span>
              ${cPend ? tag('warn', `${cPend} chờ`) : tag('ok', `${cGraded}/${cList.length}`)}
            </div>
            <div class="lms-course-card-sub">${esc(c.fullTitle)} · ${c.totalLessons} bài giảng</div>
            <div class="lms-course-card-stats">
              <span class="lms-pill">${cList.length} bài nộp</span>
              <span class="lms-pill">${cGraded} đã chấm</span>
            </div>
          </button>`;
        }).join('')}
      </div>
    `;

    const tabs = [
      ['pending', 'Chờ chấm', counts.pending],
      ['graded', 'Đã chấm', counts.graded],
      ['all', 'Tất cả', counts.all]
    ].map(([k, l, n]) => `<button type="button" class="lms-tab${L.cgTab === k ? ' on' : ''}" onclick="app.lmsSet('cgTab','${k}')">${l} <span class="c">${n}</span></button>`).join('');

    const maxLessonCount = selectedCourse !== 'ALL' && ONLINE_COURSES_CATALOG[selectedCourse]
      ? ONLINE_COURSES_CATALOG[selectedCourse].totalLessons
      : 15;
    let lessonOptions = `<option value="">Mọi bài (1–${maxLessonCount})</option>`;
    for (let i = 1; i <= maxLessonCount; i++) {
      lessonOptions += `<option value="${i}"${String(L.cgLesson) === String(i) ? ' selected' : ''}>Bài ${i}</option>`;
    }

    const rowsHtml = list.map(h => {
      const cMeta = ONLINE_COURSES_CATALOG[h.courseId] || ONLINE_COURSES_CATALOG['6adadba969897b0002482ca5'];
      const files = (h.attachments || []).length;
      const hasAudio = (h.attachments || []).some(a => a.mediaType === 'audio');
      const hasImage = (h.attachments || []).some(a => a.mediaType === 'image');
      const hasSbt = /\[Kết quả SBT tương tác:/i.test(String(h.parentNote || ''));
      const stBadge = h.status === 'GRADED'
        ? tag('ok', `✓ ${h.score}/10`)
        : D.isOverdue(h)
          ? tag('err', '⏳ Quá 24h')
          : tag('warn', '⏳ Chờ chấm');
      const classBadge = tag('blue', '🎓 Khóa Online', false);

      const attBadges = [];
      if (hasSbt) attBadges.push(`<span class="lms-pill" style="background:#F0FDF4;color:#15803D;border:1px solid #BBF7D0;">🎯 SBT</span>`);
      if (hasImage) attBadges.push(`<span class="lms-pill">🖼️ Ảnh</span>`);
      if (hasAudio) attBadges.push(`<span class="lms-pill">🎙️ Ghi âm</span>`);
      if (!hasImage && !hasAudio && files > 0) attBadges.push(`<span class="lms-pill">📎 ${files} tệp</span>`);

      const actionBtn = h.status === 'GRADED'
        ? btn('Xem', `app.lmsOpenGrade('${esc(h.id)}')`, { sm: true })
        : btn('✍️ Chấm', `app.lmsOpenGrade('${esc(h.id)}')`, { sm: true, pri: true });

      return `<tr class="lms-click" onclick="if(!event.target.closest('button,a'))app.lmsOpenGrade('${esc(h.id)}')">
        <td>
          <div class="lms-who">
            <div class="lms-av sm">${esc(initials(h.studentName))}</div>
            <div>
              <b>${esc(h.studentName || 'Học viên')}</b>
              <small>${esc(h.studentEmail || '—')}</small>
              <div class="hide-m" style="margin-top:3px;">${classBadge}</div>
            </div>
          </div>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px;">
            ${tag('blue', `${cMeta.icon} ${cMeta.title}`, false)}
            <b>Bài ${esc(String(h.lessonNum || 1))}</b>
          </div>
          <small class="lms-sub hide-m">${esc(h.lessonTitle || h.title || '')}</small>
        </td>
        <td class="hide-m">
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;">${attBadges.join('') || '<span class="lms-faint">Bài nộp trực tuyến</span>'}</div>
          <small class="lms-sub" style="display:block;max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(String(h.parentNote || '').replace(/\[Kết quả SBT tương tác:[\s\S]*?\]/i, '').trim())}</small>
        </td>
        <td class="lms-num hide-m">
          <div>${esc(fmtShort(D.hwTime(h)))}</div>
          <small class="lms-sub" style="font-family:monospace;">#${esc(String(h.remoteId || h.id).slice(-8))}</small>
        </td>
        <td>${stBadge}</td>
        <td class="lms-r">${actionBtn}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="6" class="lms-empty">Chưa có bài nộp nào.</td></tr>`;

    const syncStatusTxt = L.izHw.status === 'loading'
      ? 'Đang đồng bộ bài nộp…'
      : L.izHw.status === 'ok'
        ? `Đồng bộ Cloud (${allCourseHws.length} bài nộp)`
        : 'Chấm bài khóa học trực tuyến';

    return pageHead(
      '📒 Sổ liên lạc · Chấm bài Khóa Online',
      syncStatusTxt,
      btn('Đồng bộ', 'app.lmsFetchCourseHomeworks(true)', { icon: 'cal', pri: false })
    ) +
    renderGradeModeSwitch('course') +
    `<div class="lms-kpis" style="margin-bottom:14px;">
      <div class="lms-card lms-kpi"><div class="l">Tổng bài nộp</div><div class="v">${allCourseHws.length}</div><div class="s">Khóa Online</div></div>
      <div class="lms-card lms-kpi"><div class="l">Chờ chấm</div><div class="v" style="color:${totalPendingAll ? '#B91C1C' : '#059669'};">${totalPendingAll}</div><div class="s">${totalPendingAll ? 'Cần chấm điểm' : 'Hoàn tất 100%'}</div></div>
      <div class="lms-card lms-kpi"><div class="l">Đã chấm</div><div class="v">${totalGradedAll}</div><div class="s">TB: ${avgScore} / 10</div></div>
      <div class="lms-card lms-kpi"><div class="l">Học viên</div><div class="v">${uniqueOnlineStudents}</div><div class="s">Tự học Online</div></div>
    </div>` +
    courseCardsHtml +
    `<div class="lms-card">
      <div class="lms-tabs">${tabs}</div>
      <div class="lms-toolbar">
        <label class="lms-field">${I('search')}<input id="lms-cg-search" type="search" placeholder="Tìm học viên, bài học..." value="${esc(L.cgQuery || '')}" oninput="app.lmsSet('cgQuery', this.value)"></label>
        <label class="lms-field"><select onchange="app.lmsSet('cgLesson', this.value)" aria-label="Lọc theo bài học">${lessonOptions}</select></label>
        <span class="lms-toolbar-r">${list.length} bài</span>
      </div>
      <div class="lms-table-wrap">
        <table class="lms-table">
          <thead>
            <tr>
              <th>Học viên</th>
              <th>Khóa & Bài</th>
              <th class="hide-m">Bài làm & Tệp</th>
              <th class="hide-m">Thời gian</th>
              <th>Trạng thái</th>
              <th>Chấm</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>`;
  }

  function pageHomework() {
    const all = (app.state?.homeworks || []).filter(Boolean).slice()
      .sort((a, b) => D.hwTime(b) - D.hwTime(a));
    const counts = { pending: all.filter(h => h.status === 'PENDING').length, graded: all.filter(h => h.status === 'GRADED').length, all: all.length };
    let list = all;
    if (L.hwTab === 'pending') list = list.filter(h => h.status === 'PENDING');
    else if (L.hwTab === 'graded') list = list.filter(h => h.status === 'GRADED');
    if (L.hwClass) list = list.filter(h => h.classCode === L.hwClass);
    const tabs = [['pending', 'Chờ chấm'], ['graded', 'Đã chấm'], ['all', 'Tất cả']]
      .map(([k, l]) => `<button type="button" class="lms-tab${L.hwTab === k ? ' on' : ''}" onclick="app.lmsSet('hwTab','${k}')">${l} <span class="c">${counts[k]}</span></button>`).join('');
    const classOpts = `<option value="">Mọi lớp</option>` + (app.classes || []).map(c => `<option value="${esc(c.id)}"${L.hwClass === c.id ? ' selected' : ''}>${esc(c.id)}</option>`).join('');
    const fmt = h => fmtShort(D.hwTime(h));
    const rows = list.map(h => {
      const idx = D.studentIdxByCode(h.studentCode);
      const lesson = Number(h.lessonNum || h.lessonNumber) || 0;
      const st = h.status === 'GRADED' ? tag('ok', 'Đã chấm') : D.isOverdue(h) ? tag('err', 'Quá 24h') : tag('warn', 'Chờ chấm');
      const cls = (app.classes || []).find(c => c.id === h.classCode);
      return `<tr>
        <td><b>${esc(h.studentName || '')}</b><small class="lms-sub">${esc(h.title || '')}</small></td>
        <td>${esc(h.classCode || 'Khóa Online')}<small class="lms-sub hide-m">${esc(cls ? shortTeacher(cls.teacherName) : (h.courseTitle || 'Học viên tự do'))}</small></td>
        <td class="lms-num hide-m">${esc(h.lesson || (lesson ? 'Buổi ' + lesson : '—'))}</td>
        <td class="lms-num hide-m">${esc(fmt(h))}</td>
        <td>${st}</td>
        <td class="lms-num hide-m">${h.status === 'GRADED' && h.score != null ? esc(String(h.score)) : '—'}</td>
        <td class="lms-r">${btn(h.status === 'GRADED' ? 'Xem' : 'Chấm', `app.lmsOpenGrade('${esc(h.id)}')`, { sm: true, pri: h.status !== 'GRADED' })}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="7" class="lms-empty">Không có bài nộp.</td></tr>`;
    return pageHead('📒 Sổ liên lạc · Bài tập Lớp học', '') +
      renderGradeModeSwitch('class') +
      `<div class="lms-card"><div class="lms-tabs">${tabs}</div>
        <div class="lms-toolbar"><label class="lms-field"><select onchange="app.lmsSet('hwClass', this.value)" aria-label="Lọc theo lớp">${classOpts}</select></label><span class="lms-toolbar-r">${list.length !== all.length ? `${list.length} kết quả` : ''}</span></div>
        <div class="lms-table-wrap"><table class="lms-table"><thead><tr><th>Học viên</th><th>Lớp / Khóa</th><th class="hide-m">Buổi</th><th class="hide-m">Nộp lúc</th><th>Trạng thái</th><th class="hide-m">Điểm</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  /* ---------------- Giáo viên: hàng chờ chấm + bấm mới mở bài ---------------- */
  // Đường dẫn mẫu dạng tương đối không chạy trên khongtunhi.com; giá trị bên phải được script deploy thay bằng CDN
  const SAMPLE_MEDIA = {};
  SAMPLE_MEDIA['assets/' + 'hw_btvn_bai_1.mp4'] = 'assets/hw_btvn_bai_1.mp4';
  SAMPLE_MEDIA['assets/' + 'hw_vo_viet_chu_han.jpg'] = 'assets/hw_vo_viet_chu_han.jpg';
  const mediaSrc = att => {
    let u = (att.playUrl && !String(att.playUrl).startsWith('blob:')) ? att.playUrl : att.cdnUrl;
    if (SAMPLE_MEDIA[u]) u = SAMPLE_MEDIA[u];
    return u || '';
  };
  const GRADE_TEMPLATES = [
    ['Khen', 'Con phát âm rõ, chữ Hán viết đúng thứ tự nét. Cô khen con!'],
    ['Nhắc phát âm', 'Con chú ý thanh điệu và âm bật hơi zh, ch, sh, luyện đọc thêm 2 lần nhé.'],
    ['Nhắc chữ viết', 'Con viết chậm lại, đúng thứ tự nét và cân đối trong ô vở nhé.'],
    ['Khích lệ khóa online', 'Con tự học qua video và làm Sách Bài Tập tương tác rất chăm chỉ, tiếp tục phát huy ở bài tiếp theo nhé!'],
    ['Nộp lại', 'Video/ảnh chưa rõ, con quay hoặc chụp lại rồi nộp bổ sung giúp cô nhé.']
  ];

  function gradeData(classId) {
    const studs = D.classStudents(classId);
    const hws = (app.state?.homeworks || []).filter(Boolean);
    const forStu = s => hws.filter(h => app.isHomeworkForStudent ? app.isHomeworkForStudent(h, s) : h.studentCode === s.code);
    const pending = [], graded = [], missing = [];
    studs.forEach(s => {
      const list = forStu(s);
      list.forEach(h => {
        const item = { h, s };
        if (h.status === 'PENDING') pending.push(item);
        else if (h.status === 'GRADED') graded.push(item);
      });
      if (!list.some(h => h.status === 'PENDING') && s.unsubmittedCurrent) missing.push({ s, lesson: D.lessonOf(s) });
    });
    pending.sort((a, b) => D.hwTime(a.h) - D.hwTime(b.h));
    graded.sort((a, b) => (Number(b.h.updatedAtMs) || D.hwTime(b.h)) - (Number(a.h.updatedAtMs) || D.hwTime(a.h)));
    return { pending, graded, missing, studs };
  }

  function pageTeacherGrade() {
    const classes = D.visibleClasses('teacher');
    if (!classes.length) return pageHead('📒 Sổ liên lạc · Chấm bài Lớp học', '') + renderGradeModeSwitch('class') + `<div class="lms-card lms-empty">Chưa được phân lớp trực tiếp. Hãy chuyển sang <b>🎓 Khóa Online</b> ở trên.</div>`;
    const cur = classes.some(c => c.id === app.teacherClassFilter) ? app.teacherClassFilter : classes[0].id;
    const data = gradeData(cur);
    if (!['pending', 'graded', 'missing'].includes(L.gradeTab)) L.gradeTab = 'pending';

    const classTabs = classes.length > 1
      ? `<div class="lms-seg">${classes.map(c => {
        const n = D.pending([c.id]).length;
        return `<button type="button" class="${c.id === cur ? 'on' : ''}" onclick="app.lmsGradeClass('${esc(c.id)}')">${esc(c.id)}${n ? `<i>${n}</i>` : ''}</button>`;
      }).join('')}</div>`
      : '';
    const tabs = [['pending', 'Chờ chấm', data.pending.length], ['graded', 'Đã chấm', data.graded.length], ['missing', 'Chưa nộp', data.missing.length]]
      .map(([k, l, n]) => `<button type="button" class="lms-tab${L.gradeTab === k ? ' on' : ''}" onclick="app.lmsSet('gradeTab','${k}')">${l} <span class="c">${n}</span></button>`).join('');

    let rows = '';
    if (L.gradeTab === 'missing') {
      rows = data.missing.map(({ s, lesson }) => `<li class="lms-q">
        <div class="lms-av sm">${esc(initials(s.name))}</div>
        <div class="lms-q-main"><b>${esc(s.name)}</b><small>Buổi ${lesson || '—'} · chưa nộp</small></div>
        ${btn('Nhắc trong nhóm', `app.lmsRemindStudent('${esc(s.code)}')`, { sm: true })}
      </li>`).join('') || `<li class="lms-empty">Cả lớp đã nộp bài.</li>`;
    } else {
      const list = L.gradeTab === 'graded' ? data.graded : data.pending;
      rows = list.map(({ h, s }) => {
        const n = D.hwLesson(h);
        const files = (h.attachments || []).length;
        const right = h.status === 'GRADED'
          ? `<span class="lms-score">${esc(String(h.score ?? '—'))}</span>${btn('Xem', `app.lmsOpenGrade('${esc(h.id)}')`, { sm: true })}`
          : `${D.isOverdue(h) ? tag('err', 'Quá 24h', true) : ''}${btn('Chấm', `app.lmsOpenGrade('${esc(h.id)}')`, { sm: true, pri: true })}`;
        return `<li class="lms-q lms-click" onclick="if(!event.target.closest('button'))app.lmsOpenGrade('${esc(h.id)}')">
          <div class="lms-av sm">${esc(initials(s.name))}</div>
          <div class="lms-q-main"><b>${esc(s.name)}</b><small>Buổi ${n || '—'}${h.title ? ' · ' + esc(h.title) : ''}</small></div>
          <div class="lms-q-meta hide-m">${esc(fmtShort(D.hwTime(h)))}${files ? ` · ${files} tệp` : ''}</div>
          <div class="lms-q-act">${right}</div>
        </li>`;
      }).join('') || `<li class="lms-empty">${L.gradeTab === 'graded' ? 'Chưa có bài đã chấm.' : 'Không còn bài chờ chấm.'}</li>`;
    }
    return pageHead('📒 Sổ liên lạc · Chấm bài Lớp học', '') + renderGradeModeSwitch('class') + classTabs +
      `<div class="lms-card"><div class="lms-tabs">${tabs}</div><ul class="lms-queue">${rows}</ul></div>`;
  }

  app.lmsGradeClass = function (id) {
    app.filterTeacherClass?.(id);
    L.gradeTab = 'pending';
    applyShell();
  };

  app.lmsRemindStudent = function (code) {
    const s = (app.students || []).find(x => x.code === code);
    if (!s) return false;
    const n = D.lessonOf(s);
    L.groupDraft = `${s.parent || 'Phụ huynh ' + s.name} ơi, nhờ nhà mình nhắc ${s.name} nộp bài Buổi ${n || ''} giúp cô nhé.`.replace(/\s+/g, ' ');
    app.lmsGo('groups', { room: s.classCode });
    return false;
  };

  app.lmsOpenGrade = function (hwId) {
    let h = (app.state?.homeworks || []).find(x => x && (x.id === hwId || x.remoteId === hwId));
    if (!h) {
      h = D.courseHomeworks('ALL').find(x => x && (x.id === hwId || x.remoteId === hwId));
      if (h && app.state && Array.isArray(app.state.homeworks)) {
        app.state.homeworks.unshift(h);
      }
    }
    if (!h) return false;
    const s = (app.students || []).find(x => app.isHomeworkForStudent ? app.isHomeworkForStudent(h, x) : x.code === h.studentCode) || { name: h.studentName || 'Học viên', email: h.studentEmail || '', code: h.studentCode };
    L.gradeOpen = h.id;
    const isCourseMode = Boolean(L.page[role()] === 'course-grade' || h.isCourseHomework || h.courseId || !h.classCode);
    const classId = s.classCode || h.classCode;
    const queue = isCourseMode
      ? D.pendingCourseHomeworks(L.cgCourse || 'ALL').map(x => x.id)
      : gradeData(classId).pending.map(x => x.h.id);
    const pos = queue.indexOf(h.id);
    const n = D.hwLesson(h);
    const cMeta = h.courseId && ONLINE_COURSES_CATALOG[h.courseId] ? ONLINE_COURSES_CATALOG[h.courseId] : null;
    const info = (!isCourseMode && app.getLessonAssignmentInfo) ? app.getLessonAssignmentInfo(classId, n) : { tasks: [] };
    const tasks = (info.tasks || []).map((t, i) => `<li><b>Bài ${i + 1}</b> · ${t.format === 'image' ? 'Ảnh' : 'Video'}: ${esc(t.title)}</li>`).join('');

    // Tách kết quả SBT tương tác và ghi chú học viên
    const rawParentNote = String(h.parentNote || '');
    const sbtMatch = rawParentNote.match(/\[Kết quả SBT tương tác:\s*([^\]]+)\]/i);
    const sbtSummary = sbtMatch ? sbtMatch[1].trim() : '';
    const cleanStudentNote = rawParentNote.replace(/\[Kết quả SBT tương tác:[^\]]*\]/i, '').trim();

    const atts = (h.attachments || []).map((a, i) => {
      const src = esc(mediaSrc(a));
      const sizeKb = a.size ? ` (${Math.max(1, Math.round(a.size / 1024))} KB)` : '';
      const cfLink = src ? `<a href="${src}" target="_blank" rel="noopener" style="font-size:11.5px;color:#2563EB;font-weight:700;text-decoration:underline;margin-left:auto;">Mở tệp S3/CloudFront ↗</a>` : '';
      if (a.mediaType === 'image') {
        return `<div class="lms-media img">
          <img src="${src}" alt="${esc(a.title || 'Ảnh bài làm')}" loading="lazy" onclick="app.lmsZoomHw('${esc(h.id)}', ${i})" onerror="this.closest('.lms-media').classList.add('broken')">
          <span style="display:flex;align-items:center;justify-content:space-between;gap:8px;"><b>🖼️ ${esc(a.title || 'Ảnh')}${esc(sizeKb)}</b>${cfLink}</span>
        </div>`;
      }
      if (a.mediaType === 'audio') {
        return `<div class="lms-media aud">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;color:#0F172A;">
            <b>🎙️ ${esc(a.title || 'Bản ghi âm phát âm')}${esc(sizeKb)}</b>
            ${cfLink}
          </div>
          <audio controls preload="metadata" src="${src}"></audio>
        </div>`;
      }
      if (a.mediaType === 'video') {
        return `<div class="lms-media vid">
          <video controls preload="metadata" playsinline src="${src}${src && !src.includes('#') ? '#t=0.1' : ''}"></video>
          <span style="display:flex;align-items:center;justify-content:space-between;gap:8px;"><b>🎬 ${esc(a.title || 'Video')}${esc(sizeKb)}</b>${cfLink}</span>
        </div>`;
      }
      return `<div class="lms-media aud">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;">
          <b>📎 ${esc(a.title || 'Tệp đính kèm')}${esc(sizeKb)}</b>
          ${cfLink}
        </div>
      </div>`;
    }).join('') || `<div class="lms-empty">Bài nộp trực tuyến (không có tệp đính kèm).</div>`;

    const graded = h.status === 'GRADED';
    const locked = Boolean(app.state?.teacherChatLocked);
    const scoreVal = graded && h.score != null ? h.score : '';
    const fb = graded ? (h.teacherFeedback || '') : '';
    const scoreBtns = [10, 9.5, 9, 8.5, 8, 7].map(v => `<button type="button" class="${String(v) === String(scoreVal) ? 'on' : ''}" onclick="app.lmsPickScore(${v})">${v}</button>`).join('');
    const tpl = GRADE_TEMPLATES.map(([k], i) => `<button type="button" onclick="app.lmsUseTemplate(${i})">${esc(k)}</button>`).join('');

    const subtitleMeta = cMeta
      ? `Khóa: ${cMeta.title} · Bài ${n || 1}${h.lessonTitle ? ' (' + h.lessonTitle + ')' : ''} · Học viên tự do (Không thuộc lớp) · Nộp ${fmtShort(D.hwTime(h))}`
      : `Lớp ${classId || 'Khóa Online'} · Buổi ${n || '—'} · Nộp ${fmtShort(D.hwTime(h))}`;

    let dlg = $('lms-grade-dlg');
    if (!dlg) return false;
    dlg.innerHTML = `<form class="lms-drawer" onsubmit="event.preventDefault(); app.lmsSaveGrade(false)">
      <div class="lms-drawer-h">
        <div class="lms-av sm">${esc(initials(s.name || h.studentName))}</div>
        <div class="lms-drawer-t">
          <b>${esc(s.name || h.studentName)}${h.studentEmail ? ` <span style="font-weight:500;color:#64748B;font-size:12px;">(${esc(h.studentEmail)})</span>` : ''}</b>
          <small>${esc(subtitleMeta)}</small>
        </div>
        ${pos >= 0 && queue.length > 1 ? `<span class="lms-drawer-pos">${pos + 1}/${queue.length}</span>` : ''}
        <button type="button" class="lms-more-btn" title="Đóng" onclick="app.lmsCloseGrade()">${I('x')}</button>
      </div>
      <div class="lms-drawer-b">
        ${tasks ? `<ul class="lms-tasks">${tasks}</ul>` : ''}
        ${sbtSummary ? `<div class="lms-sbt-box"><b>🎯 Kết quả Sách Bài Tập Tương Tác:</b> ${esc(sbtSummary)}</div>` : ''}
        ${cleanStudentNote ? `<div class="lms-note"><b>💬 Ghi chú học viên:</b> ${esc(cleanStudentNote)}</div>` : ''}
        <div class="lms-media-grid">${atts}</div>
      </div>
      <div class="lms-drawer-f">
        ${locked ? `<div class="lms-compose-lock">Quyền nhận xét đang bị Quản lý tạm khóa.</div>` : `
        <div class="lms-score-row"><span class="lms-label">Điểm</span><div class="lms-score-btns">${scoreBtns}</div><input id="lms-grade-score" type="number" min="1" max="10" step="0.5" value="${esc(String(scoreVal))}" placeholder="—" aria-label="Điểm"></div>
        <div class="lms-tpl">${tpl}</div>
        <textarea id="lms-grade-fb" rows="3" maxlength="1000" placeholder="Nhận xét gửi học viên / phụ huynh (đồng bộ trực tiếp về Cổng Học Viên & izTeach)" oninput="app.lmsGradeDlp(this.value)">${esc(fb)}</textarea>
        <div id="lms-grade-dlp" class="lms-dlp hidden">Không ghi số điện thoại, Zalo hoặc liên kết cá nhân.</div>
        <div class="lms-drawer-btns">
          <button type="submit" class="lms-btn">${graded ? 'Lưu thay đổi' : 'Lưu'}</button>
          ${!graded && queue.length > 1 ? `<button type="button" class="lms-btn pri" onclick="app.lmsSaveGrade(true)">Lưu & chấm bài tiếp</button>` : (!graded ? `<button type="button" class="lms-btn pri" onclick="app.lmsSaveGrade(false)">Lưu & đóng</button>` : '')}
        </div>`}
      </div>
    </form>`;
    if (!dlg.open && typeof dlg.showModal === 'function') dlg.showModal();
    return false;
  };

  app.lmsCloseGrade = function () { const d = $('lms-grade-dlg'); if (d && d.open) d.close(); L.gradeOpen = null; };
  app.lmsPickScore = function (v) {
    const inp = $('lms-grade-score');
    if (inp) inp.value = v;
    document.querySelectorAll('.lms-score-btns button').forEach(b => b.classList.toggle('on', b.textContent === String(v)));
  };
  app.lmsUseTemplate = function (i) {
    const ta = $('lms-grade-fb');
    const t = GRADE_TEMPLATES[i];
    if (!ta || !t) return;
    ta.value = ta.value.trim() ? `${ta.value.trim()} ${t[1]}` : t[1];
    ta.focus();
  };
  app.lmsGradeDlp = function (v) {
    const el = $('lms-grade-dlp');
    if (el) el.classList.toggle('hidden', !(v && window.KTN_DLP && window.KTN_DLP.inspect(v).blocked));
  };
  app.lmsZoomHw = function (hwId, i) {
    const h = (app.state?.homeworks || []).find(x => x && x.id === hwId);
    if (!h || !app.openMediaZoom) return;
    app.openMediaZoom((h.attachments || []).map(a => ({ ...a, playUrl: mediaSrc(a) })), i);
  };

  app.lmsSaveGrade = function (goNext) {
    const h = (app.state?.homeworks || []).find(x => x && x.id === L.gradeOpen);
    if (!h) return false;
    if (app.state?.teacherChatLocked) { app.showToast('Quyền nhận xét đang bị khóa.'); return false; }
    const score = Number($('lms-grade-score')?.value);
    if (!Number.isFinite(score) || score < 1 || score > 10 || Math.round(score * 2) !== score * 2) {
      app.showToast('Chọn điểm từ 1 đến 10 (bước 0,5).');
      $('lms-grade-score')?.focus();
      return false;
    }
    const fb = String($('lms-grade-fb')?.value || '').trim();
    if (!fb) { app.showToast('Nhập nhận xét cho học viên / phụ huynh.'); $('lms-grade-fb')?.focus(); return false; }
    const s = (app.students || []).find(x => app.isHomeworkForStudent ? app.isHomeworkForStudent(h, x) : x.code === h.studentCode);
    const dlp = window.KTN_DLP ? window.KTN_DLP.inspect(fb) : { blocked: false };
    if (dlp.blocked) {
      app.logTeacherViolation('Nhận xét bài tập', dlp.reasons, fb, { target: s ? `${s.name} (${s.code}) · Buổi ${D.hwLesson(h)}` : (h.studentName || '') });
      app.saveState();
      app.lmsGradeDlp(fb);
      app.showToast('Nhận xét bị chặn vì chứa thông tin liên hệ cá nhân. Quản lý đã nhận cảnh báo.');
      return false;
    }
    const isCourseMode = Boolean(L.page[role()] === 'course-grade' || h.isCourseHomework || h.courseId || !h.classCode);
    const classId = (s && s.classCode) || h.classCode;
    const queueBefore = isCourseMode
      ? D.pendingCourseHomeworks(L.cgCourse || 'ALL').map(x => x.id)
      : gradeData(classId).pending.map(x => x.h.id);
    const nextId = queueBefore[queueBefore.indexOf(h.id) + 1] || queueBefore.find(id => id !== h.id);
    const oldRemoteId = h.remoteId || h.id;
    h.status = 'GRADED';
    h.score = score;
    h.teacherFeedback = fb;
    h.updatedAtMs = Date.now();
    h.gradedAt = new Date().toISOString();

    if (Array.isArray(L.izHw?.items)) {
      const izHit = L.izHw.items.find(x => x && (x.id === h.id || x.remoteId === oldRemoteId));
      if (izHit) {
        izHit.status = 'GRADED';
        izHit.score = score;
        izHit.teacherFeedback = fb;
        izHit.updatedAtMs = h.updatedAtMs;
      }
    }

    try {
      Promise.resolve(window.IZTEACH_STORAGE?.markHomeworkRecord?.(oldRemoteId, score, fb, h)).then(res => {
        if (res && res.remoteId) {
          h.remoteId = res.remoteId;
          if (Array.isArray(L.izHw?.items)) {
            const izHit = L.izHw.items.find(x => x && (x.id === h.id || x.remoteId === oldRemoteId));
            if (izHit) izHit.remoteId = res.remoteId;
          }
          app.saveState();
        }
      }).catch(() => {});
    } catch {}
    if (window.KtnWebApp && typeof window.KtnWebApp.apiRequest === 'function') {
      window.KtnWebApp.apiRequest('/api/ktn/homeworks/grade', {
        method: 'PATCH',
        body: {
          id: oldRemoteId,
          studentEmail: h.studentEmail || s?.email || '',
          studentName: h.studentName || s?.name || '',
          studentCode: h.studentCode || s?.code || '',
          classCode: classId || '',
          courseId: h.courseId || '',
          unitId: h.unitId || null,
          lessonNum: Number(h.lessonNum) || D.hwLesson(h) || 1,
          lessonTitle: h.lessonTitle || h.title || '',
          score,
          status: 'graded',
          teacherFeedback: fb,
          attachments: h.attachments || [],
          allowUpsertFromIzTeach: true
        }
      }).then(res => {
        if (res && res.ok && res.data?.syncStatus === 'sync_failed') {
          app.showToast(`⚠️ Đã lưu điểm ${score}đ vào Sổ liên lạc (Supabase), nhưng đồng bộ sang izTeach tạm thời lỗi. Hệ thống đã ghi nhận để đồng bộ lại.`, 'warn');
        } else if (res && !res.ok) {
          app.showToast(`⚠️ Lỗi lưu điểm trên máy chủ: ${res.data?.message || ('HTTP ' + res.status)}`, 'error');
        }
      }).catch(() => {});
    }
    app.saveState();
    app.triggerNotificationEvent?.('onGraded', { title: 'Cô giáo vừa nhận xét.', body: `Bài ${D.hwLesson(h)} · ${score}đ — ${fb}`, lessonNum: D.hwLesson(h), studentCode: (s && s.code) || h.studentCode, studentEmail: (s && s.email) || h.studentEmail || h.student_email });
    app.showToast(`Đã lưu ${score}đ & đồng bộ lên izTeach cho ${(s && s.name) || h.studentName || 'học viên'}.`, 'success');
    app.renderAll();
    if (goNext && nextId) app.lmsOpenGrade(nextId);
    else app.lmsCloseGrade();
    return true;
  };

  function pageAlerts() {
    const all = (app.state?.dlpAlerts || []).slice().sort((a, b) => {
      const ta = Date.parse(a && (a.createdAt || a.timestamp || a.time) || '') || 0;
      const tb = Date.parse(b && (b.createdAt || b.timestamp || b.time) || '') || 0;
      return tb - ta;
    });
    if (!L.alertTab) L.alertTab = 'OPEN';
    const counts = {
      OPEN: all.filter(a => a.reviewStatus !== 'REVIEWED').length,
      REVIEWED: all.filter(a => a.reviewStatus === 'REVIEWED').length,
      ALL: all.length
    };
    let list = all;
    if (L.alertTab === 'OPEN') list = list.filter(a => a.reviewStatus !== 'REVIEWED');
    else if (L.alertTab === 'REVIEWED') list = list.filter(a => a.reviewStatus === 'REVIEWED');

    const tabs = [
      ['OPEN', 'Chưa xử lý'],
      ['REVIEWED', 'Đã xử lý'],
      ['ALL', 'Tất cả']
    ].map(([k, l]) => `<button type="button" class="lms-tab${L.alertTab === k ? ' on' : ''}" onclick="app.lmsSetAlertTab('${k}')">${l} <span class="c">${counts[k]}</span></button>`).join('');

    const isLocked = Boolean(app.state?.teacherChatLocked);
    const lockBtn = `<button type="button" class="lms-btn${isLocked ? ' pri' : ' sec'}" onclick="app.openAction('lock')">${isLocked ? I('warn') + ' Mở khóa tin nhắn GV' : I('shield') + ' Khóa tin nhắn GV'}</button>`;

    const items = list.map(a => {
      const done = a.reviewStatus === 'REVIEWED';
      const stTag = done ? tag('ok', '✓ Đã xử lý') : tag('err', '⚠️ Chưa xử lý');
      const timeStr = a.time || (a.createdAt ? fmtIzDate(a.createdAt) : '');
      const sevTag = a.severity === 'CRITICAL' ? tag('err', 'Nghiêm trọng') : tag('warn', a.severity || 'Cảnh báo');
      return `<div class="lms-card" style="margin-bottom:12px;padding:14px 16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            ${stTag}
            ${sevTag}
            <strong style="font-size:14px;font-weight:700;color:var(--text);">${esc(a.teacher || 'Giáo viên')}</strong>
            <span style="font-size:13px;color:var(--dim);">→ ${esc(a.student || 'Học viên')}</span>
            <span class="lms-tag plain">${esc(a.channel || 'Tin nhắn')}</span>
          </div>
          <span style="font-size:12px;color:var(--dim);">${esc(timeStr)}</span>
        </div>
        <div style="font-size:12.5px;color:var(--err-txt);font-weight:700;margin-bottom:6px;">Chặn: ${esc((a.reasons || []).join(' • ') || 'Vi phạm chính sách liên hệ cá nhân')}</div>
        <div style="font-size:13px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:10px;font-family:monospace;white-space:pre-wrap;word-break:break-word;">${esc(a.rawContent || '')}</div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button type="button" class="lms-btn sec" onclick="app.toggleAlertReview('${esc(a.id)}')">${done ? 'Mở lại' : '✓ Đánh dấu đã xử lý'}</button>
        </div>
      </div>`;
    }).join('');

    const empty = `<div class="lms-card" style="padding:32px;text-align:center;color:var(--dim);"><div style="font-size:24px;margin-bottom:6px;">🛡️</div><b>Không có cảnh báo nào trong mục này.</b></div>`;

    return pageHead('Cảnh báo an toàn', `${counts.OPEN} cảnh báo cần xử lý`, lockBtn) +
      `<div class="lms-tabs" style="margin-bottom:14px;">${tabs}</div>` +
      (list.length ? items : empty);
  }

  app.lmsSetAlertTab = function (tab) {
    L.alertTab = tab;
    applyShell();
  };

  /* ---------------- Orders & 1-Click Approve (Admin) ---------------- */
  function pageOrders() {
    const orders = D.orders();
    const counts = {
      all: orders.length,
      pending: orders.filter(o => o.approvalStatus === 'pending' || !o.approvalStatus).length,
      approved: orders.filter(o => o.approvalStatus === 'approved').length,
      failed: orders.filter(o => o.approvalStatus === 'failed').length
    };

    const curTab = L.orderTab || 'all';
    let filtered = orders.filter(o => {
      const st = o.approvalStatus || 'pending';
      if (curTab === 'pending') return st === 'pending';
      if (curTab === 'approved') return st === 'approved';
      if (curTab === 'failed') return st === 'failed';
      return true;
    });

    const q = fold(L.orderQuery || '').trim();
    if (q) {
      filtered = filtered.filter(o =>
        fold(o.orderId || o.id || '').includes(q) ||
        fold(o.studentName || o.name || '').includes(q) ||
        fold(o.studentEmail || o.email || '').includes(q) ||
        fold(o.phone || o.studentPhone || '').includes(q) ||
        fold(o.courseName || '').includes(q)
      );
    }

    filtered.sort((a, b) => {
      const aPending = (a.approvalStatus === 'pending' || !a.approvalStatus) ? 1 : 0;
      const bPending = (b.approvalStatus === 'pending' || !b.approvalStatus) ? 1 : 0;
      if (aPending !== bPending) return bPending - aPending;
      const tA = new Date(a.createdAt || 0).getTime() || 0;
      const tB = new Date(b.createdAt || 0).getTime() || 0;
      return tB - tA;
    });

    const tabs = [
      ['all', 'Tất cả', counts.all],
      ['pending', 'Chờ duyệt', counts.pending],
      ['approved', 'Đã kích hoạt', counts.approved],
      ['failed', 'Lỗi cấp quyền', counts.failed]
    ].map(([k, l, c]) => `<button type="button" class="lms-tab${curTab === k ? ' on' : ''}" onclick="app.lmsSet('orderTab','${k}')">${l} <span class="c">${c}</span></button>`).join('');

    const formatMoney = val => typeof val === 'number' ? val.toLocaleString('vi-VN') + ' đ' : (val || '890.000 đ');
    const formatDate = o => o.createdAtDisplay || (o.createdAt ? new Date(o.createdAt).toLocaleString('vi-VN') : 'Mới');

    const body = filtered.map(o => {
      const isApproved = o.approvalStatus === 'approved';
      const isFailed = o.approvalStatus === 'failed';
      const isProc = Boolean(o._isProcessing || (app._activeApprovals && app._activeApprovals.has(o.orderId)));

      let tagStatus = isApproved ? tag('ok', '✓ Đã kích hoạt') : isFailed ? tag('err', '⚠ Lỗi cấp quyền') : tag('warn', '⏳ Chờ duyệt');
      let actBtn = '';
      if (isProc) {
        actBtn = `<button type="button" class="lms-btn sm" disabled style="opacity:0.7;">⏳ Đang duyệt...</button>`;
      } else if (isApproved) {
        actBtn = `<button type="button" class="lms-btn sm" onclick="app.openOrderApprovedModal('${esc(o.orderId || o.id)}')">🔑 Xem tài khoản</button>`;
      } else if (isFailed) {
        actBtn = `<button type="button" class="lms-btn sm" onclick="app.lmsApproveOrder('${esc(o.orderId || o.id)}')">🔄 Thử lại 1 chạm</button>`;
      } else {
        actBtn = `<button type="button" class="lms-btn sm pri" onclick="app.lmsApproveOrder('${esc(o.orderId || o.id)}')">⚡ Duyệt 1 chạm</button>`;
      }

      return `<tr>
        <td>
          <div style="font-family:ui-monospace,Consolas,monospace;font-weight:700;color:var(--text, #0F172A);">#${esc(o.orderId || o.id)}</div>
          <small class="lms-sub">${esc(formatDate(o))}</small>
        </td>
        <td>
          <div class="lms-who">
            <div class="lms-av sm">${esc(initials(o.studentName || o.name || 'HV'))}</div>
            <div>
              <b>${esc(o.studentName || o.name || 'Học viên')}</b>
              <small>${esc(o.studentEmail || o.email || '—')}${o.phone || o.studentPhone ? ` · ${esc(o.phone || o.studentPhone)}` : ''}</small>
            </div>
          </div>
        </td>
        <td>
          <b style="color:#1E40AF;">${esc(o.courseName || 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)')}</b>
          <div style="font-size:12px;font-weight:700;color:#DC2626;margin-top:2px;">${esc(formatMoney(o.amount))}</div>
        </td>
        <td class="hide-m">
          <span class="lms-pill">${esc(o.paymentMethod || 'VietQR')}</span>
          <small class="lms-sub">${o.paymentStatus === 'paid' ? 'Đã thanh toán' : esc(o.paymentStatus || 'Chưa TT')}</small>
        </td>
        <td>${tagStatus}</td>
        <td class="lms-r">${actBtn}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="6" class="lms-empty">Không tìm thấy đơn hàng nào phù hợp.</td></tr>`;

    return pageHead('📒 Sổ liên lạc · Đơn hàng', 'Duyệt 1 chạm & mở khóa học tự động',
      btn('Làm mới', 'app.lmsRefreshOrders()', { icon: 'cal' })) +
      `<div class="lms-card">
        <div class="lms-tabs">${tabs}</div>
        <div class="lms-toolbar">
          <label class="lms-field">${I('search')}<input id="lms-order-search" type="search" placeholder="Mã đơn, tên học viên, email hoặc SĐT" value="${esc(L.orderQuery || '')}" oninput="app.lmsSet('orderQuery', this.value)"></label>
          ${filtered.length !== orders.length ? `<span class="lms-toolbar-r">${filtered.length} kết quả</span>` : ''}
        </div>
        <div class="lms-table-wrap"><table class="lms-table">
          <thead><tr><th>Mã đơn & Ngày</th><th>Học viên</th><th>Khóa học</th><th class="hide-m">Thanh toán</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>${body}</tbody>
        </table></div>
      </div>`;
  }

  app.lmsApproveOrder = async function (orderId) {
    if (!orderId) return;
    try {
      if (typeof app.oneClickApproveOrder === 'function') {
        const res = await app.oneClickApproveOrder(orderId);
        if (res && res.success && !res.alreadyApproved) {
          app.showToast?.(`Đã kích hoạt thành công đơn hàng #${orderId}!`, 'success');
        } else if (res && res.error && !res.isBusy) {
          app.showToast?.(`Lỗi duyệt đơn: ${res.error}`, 'error');
        }
      }
    } catch (e) {
      console.error('[LMS] lmsApproveOrder error:', e);
      app.showToast?.(`Lỗi: ${e.message || e}`, 'error');
    } finally {
      rowsCache = null;
      if (typeof app.syncApprovedOrdersToStudents === 'function') {
        try { app.syncApprovedOrdersToStudents(); } catch {}
      }
      applyShell();
    }
  };

  app.lmsRefreshOrders = function () {
    try {
      if (typeof app.pullSilentCloudState === 'function') {
        app.pullSilentCloudState(true);
      }
    } catch (e) {}
    D.orders();
    applyShell();
    app.showToast?.('Đã làm mới danh sách đơn hàng.');
  };

  /* ---------------- Group chat (A1: cloud state) ---------------- */
  const dayLabel = t => {
    const d = new Date(t); const now = new Date();
    const key = x => x.toDateString();
    if (key(d) === key(now)) return 'Hôm nay';
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (key(d) === key(y)) return 'Hôm qua';
    try { return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return ''; }
  };
  const hhmm = t => { try { return new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  const roleName = r => r === 'teacher' ? 'Giáo viên' : r === 'admin' ? 'Quản lý' : r === 'student' ? 'Học viên' : 'Phụ huynh';
  const roomBadge = id => {
    const s = String(id || '');
    const letter = (s.match(/[A-Za-z]/) || ['L'])[0].toUpperCase();
    const digit = (s.match(/\d/) || [''])[0];
    return letter + digit;
  };

  function renderAttachment(m) {
    const a = m.attachment;
    if (!a) return '';
    if (a.type === 'image') {
      const src = a.playUrl || a.url;
      return `<button type="button" class="lms-att-img" onclick="app.openChatImageZoom('${esc(m.id)}')"><img src="${esc(src)}" alt="${esc(a.title || 'Ảnh')}" loading="lazy"></button>`;
    }
    if (a.type === 'homework') {
      return `<div class="lms-att-card">${I('book')}<div><b>${esc(a.title || 'Bài tập')}</b><small>${a.lessonNumber ? 'Buổi ' + esc(String(a.lessonNumber)) : ''}${a.status === 'GRADED' ? ` · ${esc(String(a.score))}/10` : ''}</small></div></div>`;
    }
    return `<a class="lms-att-card" href="${esc(a.url || '#')}" target="_blank" rel="noopener">${I('dl')}<div><b>${esc(a.title || 'Tài liệu')}</b><small>Tài liệu</small></div></a>`;
  }

  L.groupFilter = L.groupFilter || 'group';
  L.pinnedByRoom = L.pinnedByRoom || {};
  L.serverPrivateThreads = L.serverPrivateThreads || [];

  function getAvailableRoomsForRole(r) {
    const classes = D.visibleClasses(r);
    const groupRooms = classes.map(c => ({
      id: c.id,
      apiRoomId: 'class:' + c.id,
      label: `🏫 Lớp ${c.id}`,
      shortLabel: c.id,
      badge: roomBadge(c.id),
      subtitle: `${shortTeacher(c.teacherName || 'Cô Lâm Mỹ Linh')} · ${D.classStudents(c.id).length} học viên`,
      kind: 'class'
    }));

    if (r === 'teacher' || r === 'admin') {
      [
        { cid: '6adadba969897b0002482ca5', title: 'HSK1 3.0', badge: 'H1' },
        { cid: '65e7704a9ea90c00080d5195', title: 'Chinese For Kids', badge: 'CK' },
        { cid: '65e733b0e3317300084c5ce4', title: 'Tiếng Trung Tổng Hợp', badge: 'TH' }
      ].forEach(crs => {
        groupRooms.push({
          id: 'course:' + crs.cid,
          apiRoomId: 'course:' + crs.cid,
          label: `🎬 Khóa ${crs.title}`,
          shortLabel: `Khóa ${crs.title}`,
          badge: crs.badge,
          subtitle: `Cô Lâm Mỹ Linh · Nhóm học viên khóa ${crs.title}`,
          kind: 'course'
        });
      });
    } else {
      const stu = app.getActiveParentStudent ? app.getActiveParentStudent() : null;
      const stuCourseIds = Array.isArray(stu?.courseIds) && stu.courseIds.length
        ? stu.courseIds
        : ['6adadba969897b0002482ca5'];
      stuCourseIds.forEach(cid => {
        const normCid = cid === '65e7688d524c58000836593b' ? '65e7704a9ea90c00080d5195' : cid;
        const cMeta = ONLINE_COURSES_CATALOG[normCid];
        const title = cMeta ? cMeta.title : 'HSK1 3.0';
        if (!groupRooms.some(g => g.id === 'course:' + normCid)) {
          groupRooms.push({
            id: 'course:' + normCid,
            apiRoomId: 'course:' + normCid,
            label: `🎬 ${title}`,
            shortLabel: title,
            badge: 'KH',
            subtitle: `Cô Lâm Mỹ Linh & các bạn cùng khóa ${title}`,
            kind: 'course'
          });
        }
      });
    }

    const privateRooms = [];
    if (r === 'teacher' || r === 'admin') {
      const seenEmails = new Set();
      (L.serverPrivateThreads || []).forEach(th => {
        const em = String(th.studentEmail || '').trim().toLowerCase();
        if (!em || seenEmails.has(em)) return;
        seenEmails.add(em);
        privateRooms.push({
          id: 'student:' + em,
          apiRoomId: 'student:' + em,
          label: `👩‍🏫 ${th.studentName || em}`,
          shortLabel: th.studentName || em,
          badge: initials(th.studentName || em),
          subtitle: `Hộp thư riêng 1-1 · ${em}`,
          lastMessage: th.lastMessage || '',
          lastTimestamp: th.lastTimestamp || '',
          unread: Boolean(th.unread),
          kind: 'student'
        });
      });
      D.roster().forEach(({ s }) => {
        const em = String(s.email || '').trim().toLowerCase();
        if (!em || seenEmails.has(em)) return;
        seenEmails.add(em);
        privateRooms.push({
          id: 'student:' + em,
          apiRoomId: 'student:' + em,
          label: `👩‍🏫 ${s.name}${s.classCode ? ' (' + s.classCode + ')' : ''}`,
          shortLabel: s.name,
          badge: initials(s.name),
          subtitle: `Hộp thư riêng 1-1 · ${em}${s.classCode ? ' · Lớp ' + s.classCode : ''}`,
          kind: 'student'
        });
      });
      if (!seenEmails.has('taphong2002@gmail.com')) {
        privateRooms.push({
          id: 'student:taphong2002@gmail.com',
          apiRoomId: 'student:taphong2002@gmail.com',
          label: '👩‍🏫 Tạ Phong (Online)',
          shortLabel: 'Tạ Phong',
          badge: 'TP',
          subtitle: 'Hộp thư riêng 1-1 · taphong2002@gmail.com',
          kind: 'student'
        });
      }
    } else {
      const stu = app.getActiveParentStudent ? app.getActiveParentStudent() : null;
      const ownEmail = String(window.sllAuth?.session?.account?.email || stu?.email || 'hocsinh@khongtunhi.com').trim().toLowerCase();
      privateRooms.push({
        id: 'student:' + ownEmail,
        apiRoomId: 'student:' + ownEmail,
        label: '👩‍🏫 Nhắn riêng Cô Lâm Mỹ Linh',
        shortLabel: 'Nhắn riêng Cô',
        badge: '1:1',
        subtitle: 'Kênh trao đổi riêng 1-1 giữa Học viên & Cô giáo',
        kind: 'student'
      });
    }

    return { groupRooms, privateRooms, allRooms: [...groupRooms, ...privateRooms] };
  }

  function getDefaultPinForRoom(roomMeta) {
    if (!roomMeta) return 'Chào mừng các con đến với Nhóm lớp! Cùng trao đổi bài học và hỏi bài Cô tại đây nhé.';
    if (roomMeta.kind === 'course') {
      return `Chào mừng học viên ${roomMeta.shortLabel}! Có câu hỏi bài giảng hoặc phát âm hãy nhắn vào nhóm nhé.`;
    }
    return `Chào mừng lớp ${roomMeta.shortLabel}! Các con theo dõi thông báo lịch học và trao đổi bài tại đây nhé.`;
  }

  function pageGroups(r) {
    const { groupRooms, privateRooms, allRooms } = getAvailableRoomsForRole(r);
    if (!allRooms.length) {
      return pageHead('💬 Nhóm lớp', '') + `<div class="lms-card lms-empty">Chưa có nhóm lớp để tham gia.</div>`;
    }
    let room = L.room[r];
    if (!allRooms.some(x => x.id === room)) {
      if (L.groupFilter === 'private' && privateRooms.length) {
        room = privateRooms[0].id;
      } else if (r === 'teacher' && app.teacherClassFilter && groupRooms.some(c => c.id === app.teacherClassFilter)) {
        room = app.teacherClassFilter;
      } else {
        room = (groupRooms[0] || allRooms[0]).id;
      }
    }
    L.room[r] = room;
    const isPrivate = String(room).startsWith('student:');
    L.groupFilter = isPrivate ? 'private' : 'group';

    const activeList = isPrivate ? privateRooms : groupRooms;
    const activeMeta = allRooms.find(x => x.id === room) || activeList[0] || allRooms[0];
    const msgs = D.roomMessages(room);

    const filterToggleHtml = `<div class="lms-group-mode-bar" style="display:flex;gap:6px;padding:10px 12px;border-bottom:1px solid #E2E8F0;background:#F8FAFC;flex-wrap:wrap;align-items:center;">
      <button type="button" id="btn-lms-mode-group" onclick="app.lmsSetGroupFilter('group')" style="padding:6px 12px;border-radius:8px;font-size:12.5px;font-weight:800;border:1px solid ${!isPrivate ? '#DC2626' : '#CBD5E1'};background:${!isPrivate ? '#FEF2F2' : '#FFFFFF'};color:${!isPrivate ? '#B91C1C' : '#475569'};cursor:pointer;">
        ${r === 'parent' ? '👥 Nhóm chung' : '👥 Nhóm Lớp & Khóa'}
      </button>
      <button type="button" id="btn-lms-mode-private" onclick="app.lmsSetGroupFilter('private')" style="padding:6px 12px;border-radius:8px;font-size:12.5px;font-weight:800;border:1px solid ${isPrivate ? '#DC2626' : '#CBD5E1'};background:${isPrivate ? '#FEF2F2' : '#FFFFFF'};color:${isPrivate ? '#B91C1C' : '#475569'};cursor:pointer;">
        ${r === 'parent' ? '👩‍🏫 Nhắn riêng Cô' : `👩‍🏫 Nhắn riêng HS (1-1) (${privateRooms.length})`}
      </button>
    </div>`;

    const roomList = activeList.length > 0
      ? `<div class="lms-rooms">${activeList.map(c => {
        const ms = D.roomMessages(c.id);
        const last = ms[ms.length - 1];
        const un = c.id === room ? 0 : (unreadOf(r, c.id) || (c.unread ? 1 : 0));
        const who = last ? ((last.senderRole || last.sender) === 'admin' ? 'Quản lý' : String(last.senderName || '').split(' ').slice(-2).join(' ')) : '';
        const prev = last
          ? `${who ? esc(who) + ': ' : ''}${esc(last.text || (last.attachment ? '[Tệp đính kèm]' : ''))}`
          : (c.lastMessage ? esc(c.lastMessage) : 'Chưa có tin nhắn');
        return `<button type="button" class="lms-room${c.id === room ? ' on' : ''}" data-room-id="${esc(c.id)}" onclick="app.lmsOpenRoom('${esc(c.id)}')">
          <span class="lms-room-av">${esc(c.badge)}</span>
          <span class="lms-room-txt"><b>${esc(c.shortLabel)}</b><small>${prev}</small></span>
          <span class="lms-room-meta">${last ? esc(hhmm(Date.parse(last.timestamp || '') || Date.now())) : ''}${un ? `<i>${un}</i>` : ''}</span>
        </button>`;
      }).join('')}</div>`
      : '';

    const canPin = (r === 'teacher' || r === 'admin') && !isPrivate;
    const rawPinnedText = L.pinnedByRoom[activeMeta.apiRoomId]?.content || getDefaultPinForRoom(activeMeta);
    const pinnedText = String(rawPinnedText).replace(/^(?:📌\s*)+/u, '').trim() || getDefaultPinForRoom(activeMeta);
    const pinnedBannerHtml = !isPrivate
      ? `<div id="lms-pinned-banner" style="padding:8px 12px;background:#FFFBEB;border-bottom:1px solid #FDE68A;font-size:12.5px;color:#92400E;">
          <div style="display:flex;align-items:flex-start;gap:6px;">
            <span>📌</span>
            <div style="flex:1;line-height:1.4;"><strong>Thông báo lớp:</strong> <span id="lms-pinned-text">${esc(pinnedText)}</span></div>
          </div>
          ${canPin ? `<div style="display:flex;gap:6px;margin-top:6px;">
            <input id="lms-pin-input" type="text" placeholder="Nhập thông báo ghim đầu nhóm..." style="flex:1;padding:5px 9px;border:1px solid #FCD34D;border-radius:6px;font-size:12px;background:#FFF;">
            <button type="button" id="btn-lms-pin-save" onclick="app.lmsPinRoomAnnouncement()" style="background:#D97706;color:#FFF;border:none;padding:5px 10px;border-radius:6px;font-size:11.5px;font-weight:800;cursor:pointer;white-space:nowrap;">📌 Ghim</button>
          </div>` : ''}
        </div>`
      : '';

    let lastDay = '';
    const me = r;
    const msgHtml = msgs.length ? msgs.map(m => {
      const t = Date.parse(m.timestamp || '') || Date.now();
      const day = dayLabel(t);
      const sep = day !== lastDay ? `<div class="lms-day"><span>${esc(day)}</span></div>` : '';
      lastDay = day;
      const sr = m.senderRole || m.sender;
      const mine = sr === me;
      const pinBtn = canPin && m.text
        ? ` <button type="button" class="lms-pin-msg-btn" data-pin-text="${esc(m.text)}" onclick="app.lmsPinRoomAnnouncement(this.getAttribute('data-pin-text'))" style="background:#FEF3C7;color:#92400E;border:1px solid #FDE68A;border-radius:5px;padding:1px 5px;font-size:10px;font-weight:700;cursor:pointer;margin-left:4px;">📌 Ghim</button>`
        : '';
      return `${sep}<div class="lms-msg${mine ? ' mine' : ''}${sr === 'teacher' ? ' t' : ''}">
        ${mine ? '' : `<div class="lms-av sm">${esc(initials(m.senderName))}</div>`}
        <div class="lms-msg-body">
          <div class="lms-msg-nm">${mine ? '' : `${esc(m.senderName || '')} ${fold(m.senderName).includes(fold(roleName(sr))) ? '' : `<em>${esc(roleName(sr))}</em> `}`}<i>${esc(hhmm(t))}</i>${pinBtn}</div>
          ${m.text ? `<div class="lms-bub">${esc(m.text)}</div>` : ''}
          ${renderAttachment(m)}
        </div>
      </div>`;
    }).join('') : `<div class="lms-chat-empty">Chưa có tin nhắn trong lớp. Hãy gửi lời chào đầu tiên!</div>`;

    const locked = r === 'teacher' && app.state?.teacherChatLocked;
    const placeholderText = isPrivate
      ? (r === 'parent' ? 'Nhắn riêng cho Cô giáo…' : `Nhắn riêng cho ${activeMeta.shortLabel}…`)
      : `Nhắn vào ${activeMeta.label}…`;
    const compose = locked
      ? `<div class="lms-compose-lock">Quyền nhắn tin của giáo viên đang bị Quản lý tạm khóa.</div>`
      : `<form class="lms-compose" onsubmit="event.preventDefault(); app.lmsSendGroup();">
          <label class="lms-field grow"><input id="lms-group-input" type="text" maxlength="4000" autocomplete="off" placeholder="${esc(placeholderText)}" oninput="app.lmsGroupDlpHint(this.value)"></label>
          <button type="submit" class="lms-btn pri">${I('send')}Gửi</button>
        </form>
        <div id="lms-group-dlp" class="lms-dlp hidden">Không gửi số điện thoại, Zalo hoặc liên kết cá nhân.</div>`;

    return pageHead('💬 Nhóm lớp', '') +
      `<div class="lms-card" style="overflow:hidden;">
        ${filterToggleHtml}
        <div class="lms-chat${roomList ? '' : ' single'}" style="border:none;border-radius:0;">
          ${roomList}
          <div class="lms-conv">
            <div class="lms-conv-h"><div><b>${esc(activeMeta.label)}</b><small>${esc(activeMeta.subtitle)}</small></div></div>
            ${pinnedBannerHtml}
            <div class="lms-msgs" id="lms-msgs">${msgHtml}</div>
            ${compose}
          </div>
        </div>
      </div>`;
  }

  app.lmsSetGroupFilter = function (mode) {
    const r = role();
    L.groupFilter = mode === 'private' ? 'private' : 'group';
    const { groupRooms, privateRooms } = getAvailableRoomsForRole(r);
    if (L.groupFilter === 'private' && privateRooms.length) {
      L.room[r] = privateRooms[0].id;
    } else if (groupRooms.length) {
      L.room[r] = groupRooms[0].id;
    }
    applyShell();
    if (L.room[r]) app.lmsSyncRoomMessages(L.room[r], false);
  };

  app.lmsPinRoomAnnouncement = async function (customText) {
    const r = role();
    const room = L.room[r];
    if (!room) return false;
    const norm = D.normalizeRoomKey(room);
    const input = $('lms-pin-input');
    const content = String(typeof customText === 'string' ? customText : (input ? input.value : '')).trim();
    if (!content) return false;
    if (window.KtnWebApp && typeof window.KtnWebApp.apiRequest === 'function') {
      const res = await window.KtnWebApp.apiRequest('/api/ktn/messages/pin', {
        method: 'POST',
        body: { roomId: norm.apiRoomId, content }
      });
      if (res && res.ok && res.data?.ok && res.data?.pinnedMessage) {
        L.pinnedByRoom[norm.apiRoomId] = res.data.pinnedMessage;
      } else {
        L.pinnedByRoom[norm.apiRoomId] = { roomId: norm.apiRoomId, content };
      }
    } else {
      L.pinnedByRoom[norm.apiRoomId] = { roomId: norm.apiRoomId, content };
    }
    if (input && typeof customText !== 'string') input.value = '';
    const txtEl = $('lms-pinned-text');
    if (txtEl) txtEl.textContent = content.replace(/^(?:📌\s*)+/u, '').trim() || content;
    app.showToast?.('📌 Đã ghim thông báo đầu nhóm!');
    return true;
  };

  const _roomSyncTs = {};
  app.lmsSyncRoomMessages = async function (room, silent = false) {
    const norm = D.normalizeRoomKey(room);
    const cleanRoom = norm.key;
    const apiRoomId = norm.apiRoomId;
    if (!cleanRoom || !window.KtnWebApp || typeof window.KtnWebApp.apiRequest !== 'function') return false;
    const nowTs = Date.now();
    if (silent && _roomSyncTs[apiRoomId] && (nowTs - _roomSyncTs[apiRoomId] < 2500)) return false;
    _roomSyncTs[apiRoomId] = nowTs;
    try {
      const curRole = role();
      const [res, roomsRes] = await Promise.all([
        window.KtnWebApp.apiRequest('/api/ktn/messages?roomId=' + encodeURIComponent(apiRoomId)),
        (curRole === 'teacher' || curRole === 'admin')
          ? window.KtnWebApp.apiRequest('/api/ktn/messages/rooms').catch(() => null)
          : Promise.resolve(null)
      ]);
      if (roomsRes && roomsRes.ok && Array.isArray(roomsRes.data?.privateThreads)) {
        L.serverPrivateThreads = roomsRes.data.privateThreads;
      }
      if (!res || !res.ok || !Array.isArray(res.data?.messages)) return false;
      if (res.data?.pinnedMessage && res.data.pinnedMessage.content) {
        L.pinnedByRoom[apiRoomId] = res.data.pinnedMessage;
      }
      if (!Array.isArray(app.state.messages)) app.state.messages = [];
      let changed = false;
      const upClean = String(cleanRoom).toUpperCase();
      const upApi = String(apiRoomId).toUpperCase();
      const otherRoomMsgs = app.state.messages.filter(ex => {
        if (!ex) return false;
        const exCls = String(ex.classCode || '').toUpperCase();
        const exRoom = String(ex.roomId || '').toUpperCase();
        return exCls !== upClean && exCls !== upApi && exRoom !== upClean && exRoom !== upApi;
      });
      const roomMsgs = [];
      const seenIds = new Set();

      res.data.messages.forEach(m => {
        if (!m || (!m.content && !m.text)) return;
        const msgId = String(m.id || '').trim();
        if (msgId && seenIds.has(msgId)) return;
        if (msgId) seenIds.add(msgId);
        const msgText = String(m.content || m.text || '').trim();
        const msgTs = Date.parse(m.created_at || m.timestamp || '') || Date.now();
        const sRoleRaw = String(m.sender_role || m.senderRole || 'student').toLowerCase();
        const mappedRole = sRoleRaw === 'student' ? 'parent' : sRoleRaw;
        const dupRecent = roomMsgs.some(ex => {
          const exTxt = String(ex.text || '').trim();
          const exTs = Date.parse(ex.timestamp || '') || 0;
          return ex.senderRole === mappedRole && exTxt === msgText && Math.abs(exTs - msgTs) < 4000;
        });
        if (dupRecent) return;
        roomMsgs.push({
          id: msgId || ('SB-' + msgTs + '-' + Math.random().toString(36).slice(2, 6)),
          classCode: cleanRoom,
          roomId: apiRoomId,
          studentCode: '',
          sender: mappedRole,
          senderRole: mappedRole,
          senderEmail: m.sender_email || '',
          senderName: m.sender_name || m.sender_email || 'Học viên',
          time: hhmm(msgTs),
          timestamp: new Date(msgTs).toISOString(),
          text: msgText,
          attachment: m.attachment_url ? { type: 'file', url: m.attachment_url, title: 'Tệp đính kèm' } : null,
          status: 'sent',
          blocked: false
        });
      });

      const prevRoomMsgs = D.roomMessages(room);
      if (prevRoomMsgs.length !== roomMsgs.length || prevRoomMsgs.some((p, i) => p.id !== roomMsgs[i]?.id)) {
        app.state.messages = [...otherRoomMsgs, ...roomMsgs];
        changed = true;
      }

      if (changed) {
        const curInput = $('lms-group-input');
        const draftVal = curInput ? curInput.value : '';
        const hadFocus = document.activeElement === curInput;
        if (isWorkspace() && L.page[role()] === 'groups') {
          applyShell();
          const nextInput = $('lms-group-input');
          if (nextInput && draftVal) nextInput.value = draftVal;
          if (nextInput && hadFocus) nextInput.focus();
        }
        window.KTN_NOTIF?.recalculateUnreadBadge?.();
      }
      return changed;
    } catch (e) {
      return false;
    }
  };

  app.lmsOpenRoom = function (id) {
    const r = role();
    L.room[r] = id;
    L.groupFilter = String(id || '').startsWith('student:') ? 'private' : 'group';
    applyShell();
    app.lmsSyncRoomMessages(id, false);
    setTimeout(() => $('lms-group-input')?.focus(), 0);
  };

  app.lmsGroupDlpHint = function (val) {
    const hint = $('lms-group-dlp');
    if (!hint) return;
    const blocked = val && window.KTN_DLP && window.KTN_DLP.inspect(val).blocked;
    hint.classList.toggle('hidden', !blocked);
  };

  app.lmsSendGroup = async function () {
    if (L._sendingGroupMsg) return false;
    const r = role();
    const input = $('lms-group-input');
    const text = String(input ? input.value : '').trim();
    const room = L.room[r];
    if (!text || !room) return false;
    const norm = D.normalizeRoomKey(room);
    const { allRooms } = getAvailableRoomsForRole(r);
    if (!allRooms.some(c => c.id === room || c.apiRoomId === norm.apiRoomId)) {
      app.showToast('Bạn không thuộc nhóm lớp này.');
      return false;
    }
    if (r === 'teacher' && app.state?.teacherChatLocked) { app.showToast('Quyền nhắn tin đang bị khóa.'); return false; }
    const dlp = window.KTN_DLP ? window.KTN_DLP.inspect(text) : { blocked: false, reasons: [] };
    if (dlp.blocked) {
      if (r === 'teacher') {
        app.logTeacherViolation('Nhóm lớp ' + room, dlp.reasons, text, { target: 'Cả lớp ' + room });
        app.saveState();
        app.lmsGroupDlpHint(text);
        app.showToast('Tin nhắn bị chặn vì chứa thông tin liên hệ cá nhân. Quản lý đã nhận cảnh báo.');
        applyShell();
        return false;
      }
      app.lmsGroupDlpHint(text);
      app.showToast(`Tin nhắn bị chặn: ${(dlp.reasons || []).join(', ') || 'chứa thông tin liên hệ cá nhân'}.`);
      return false;
    }
    const stu = r === 'parent' && app.getActiveParentStudent ? app.getActiveParentStudent() : null;
    const name = r === 'admin' ? (window.sllAuth?.session?.account?.name || 'Ban Quản Lý')
      : r === 'teacher' ? (app.state?.teacherName || 'Giáo viên')
        : ((stu && stu.parent) || ('Phụ huynh ' + ((stu && stu.name) || '')));

    L._sendingGroupMsg = true;
    const clientMessageId = 'cmsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    let savedServerMsg = null;
    let errMsg = '';
    try {
      if (window.KtnWebApp && typeof window.KtnWebApp.apiRequest === 'function') {
        const res = await window.KtnWebApp.apiRequest('/api/ktn/messages', {
          method: 'POST',
          body: { roomId: norm.apiRoomId, classCode: norm.classCode || norm.key, content: text, clientMessageId }
        });
        if (res && res.ok && res.data?.ok && res.data?.message && res.data.message.id) {
          savedServerMsg = res.data.message;
        } else {
          errMsg = res?.data?.message || 'Chưa gửi được. Tin nhắn vẫn đang được giữ trên thiết bị.';
        }
      } else {
        errMsg = 'Chưa gửi được. Tin nhắn vẫn đang được giữ trên thiết bị.';
      }
    } catch (e) {
      errMsg = 'Chưa gửi được. Tin nhắn vẫn đang được giữ trên thiết bị.';
    } finally {
      L._sendingGroupMsg = false;
    }

    if (!savedServerMsg || !savedServerMsg.id) {
      try { localStorage.setItem('ktn_sll_draft_' + norm.apiRoomId, text); } catch {}
      app.showToast(errMsg || 'Chưa gửi được. Tin nhắn vẫn đang được giữ trên thiết bị.');
      return false;
    }
    try { localStorage.removeItem('ktn_sll_draft_' + norm.apiRoomId); } catch {}

    const msgTs = Date.parse(savedServerMsg.created_at || '') || Date.now();
    const msg = {
      id: savedServerMsg.id,
      clientMessageId,
      classCode: norm.key,
      roomId: norm.apiRoomId,
      studentCode: stu ? stu.code : '',
      sender: r,
      senderRole: r,
      senderName: savedServerMsg.sender_name || name,
      time: hhmm(msgTs),
      timestamp: new Date(msgTs).toISOString(),
      text,
      attachment: null,
      status: 'sent',
      blocked: false
    };
    if (!Array.isArray(app.state.messages)) app.state.messages = [];
    if (!app.state.messages.some(ex => ex && ex.id === msg.id)) {
      app.state.messages.push(msg);
    }
    if (input) input.value = '';
    app.lmsGroupDlpHint('');
    app.saveState();
    markSeen(r, room);
    applyShell();
    setTimeout(() => $('lms-group-input')?.focus(), 0);
    return true;
  };

  function startGroupPoll() {
    if (L.room[role()]) app.lmsSyncRoomMessages?.(L.room[role()], true);
    if (L._poll) return;
    L._poll = setInterval(() => {
      if (document.hidden) return;
      if (!isWorkspace() || L.page[role()] !== 'groups') { stopGroupPoll(); return; }
      app.pullSilentCloudState?.(true);
      if (L.room[role()]) app.lmsSyncRoomMessages?.(L.room[role()], true);
    }, POLL_MS);
  }
  function stopGroupPoll() { if (L._poll) { clearInterval(L._poll); L._poll = null; } }

  /* ---------------- Actions ---------------- */
  // Ghi cảnh báo DLP với mã duy nhất + giờ tuyệt đối (mã cũ đếm theo độ dài mảng nên trùng giữa các máy và bị ghi đè khi đồng bộ)
  app.logTeacherViolation = function (channel, reasons, rawContent, extra = {}) {
    if (!this.state) return null;
    if (!Array.isArray(this.state.dlpAlerts)) this.state.dlpAlerts = [];
    const now = new Date();
    const stu = (this.students || [])[this.selectedStudentIdx] || (this.students || [])[0] || {};
    const alert = {
      id: 'DLP-' + now.getTime() + '-' + Math.floor(1000 + Math.random() * 9000),
      createdAt: now.toISOString(),
      time: `${pad2(now.getHours())}:${pad2(now.getMinutes())} · ${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()}`,
      teacher: `${this.state.teacherName || 'Giáo viên'} (${this.state.teacherCode || ''})`,
      student: extra.target || (stu.name ? `${stu.name} (${stu.code || ''})` : ''),
      channel,
      severity: 'CRITICAL',
      reasons: Array.isArray(reasons) ? reasons : [String(reasons || '')],
      rawContent,
      reviewStatus: 'OPEN',
      resolution: 'Chưa xử lý · Cần Quản lý xác nhận.'
    };
    this.state.dlpAlerts.unshift(alert);
    return alert;
  };
  const alertTs = a => Date.parse(a && a.createdAt || '') || 0;
  const sortAlerts = () => {
    const arr = app.state && app.state.dlpAlerts;
    if (!Array.isArray(arr)) return;
    const idx = new Map(arr.map((a, i) => [a, i]));
    arr.sort((a, b) => (alertTs(b) - alertTs(a)) || (idx.get(a) - idx.get(b)));
  };
  const origRenderAlerts = app.renderAdminAlerts;
  if (typeof origRenderAlerts === 'function') {
    app.renderAdminAlerts = function () { sortAlerts(); return origRenderAlerts.apply(this, arguments); };
  }

  function notifyNewTeacherClasses() {
    const ids = D.visibleClasses('teacher').map(c => c.id);
    const key = app.state?.teacherCode || '';
    if (L._tClassKey === key && Array.isArray(L._tClasses)) {
      const added = ids.filter(id => !L._tClasses.includes(id));
      if (added.length) app.showToast(`Bạn vừa được phân công thêm lớp ${added.join(', ')}.`);
    }
    L._tClassKey = key;
    L._tClasses = ids;
  }
  app.lmsSet = function (key, val) {
    L[key] = val;
    if (key === 'stuTab' || key === 'stuQuery' || key === 'stuClass') L.stuPage = 0;
    applyShell();
  };

  app.lmsToggleOnline = function (idx) {
    if (app.adminToggleStudentOnline) app.adminToggleStudentOnline(idx);
    applyShell();
  };

  function dialog(html) {
    const dlg = $('lms-dialog');
    if (!dlg) return null;
    dlg.innerHTML = html;
    if (!dlg.open && typeof dlg.showModal === 'function') dlg.showModal();
    return dlg;
  }
  app.lmsCloseDialog = function () { const d = $('lms-dialog'); if (d && d.open) d.close(); };

  app.lmsOpenEnroll = function (key) {
    const row = D.rowByKey(key);
    if (!row) return false;
    const classes = app.classes || [];
    if (!classes.length) { app.showToast('Chưa có lớp. Hãy mở lớp trước.'); return false; }
    dialog(`<form onsubmit="event.preventDefault(); app.lmsSubmitEnroll('${esc(key)}')">
      <div class="lms-dlg-h"><h2>${row.classCode ? 'Chuyển lớp' : 'Xếp lớp'}</h2><button type="button" class="lms-more-btn" onclick="app.lmsCloseDialog()">${I('x')}</button></div>
      <div class="lms-dlg-b">
        <div class="lms-who"><div class="lms-av sm">${esc(initials(row.name))}</div><div><b>${esc(row.name)}</b><small>${esc(row.email)}</small></div></div>
        <label class="lms-label" for="lms-enroll-class">Lớp</label>
        <select id="lms-enroll-class" class="lms-select">${classes.map(c => `<option value="${esc(c.id)}"${row.classCode === c.id ? ' selected' : ''}>${esc(c.id)} · ${esc(shortTeacher(c.teacherName))} · ${D.classStudents(c.id).length} HV</option>`).join('')}</select>
      </div>
      <div class="lms-dlg-f"><button type="button" class="lms-btn" onclick="app.lmsCloseDialog()">Hủy</button><button type="submit" class="lms-btn pri">Lưu</button></div>
    </form>`);
    return false;
  };

  app.lmsOpenAddToClass = function (classId) {
    const cls = (app.classes || []).find(c => c.id === classId);
    if (!cls) return false;
    const pool = D.rows().filter(x => x.classCode !== classId && x.status !== 'locked')
      .sort((a, b) => (a.classCode ? 1 : 0) - (b.classCode ? 1 : 0));
    if (!pool.length) { app.showToast('Không còn học viên nào để thêm. Hãy tạo tài khoản mới.'); return false; }
    dialog(`<form onsubmit="event.preventDefault(); app.lmsSubmitEnroll(document.getElementById('lms-add-stu').value, '${esc(classId)}')">
      <div class="lms-dlg-h"><h2>Thêm học viên vào ${esc(classId)}</h2><button type="button" class="lms-more-btn" onclick="app.lmsCloseDialog()">${I('x')}</button></div>
      <div class="lms-dlg-b">
        <label class="lms-label" for="lms-add-stu">Học viên</label>
        <select id="lms-add-stu" class="lms-select">${pool.map(x => `<option value="${esc(x.key)}">${esc(x.name)} · ${esc(x.email)}${x.classCode ? ' · đang ở ' + esc(x.classCode) : ''}</option>`).join('')}</select>
        <p class="lms-hint">Chưa có tài khoản? <a href="#" onclick="app.lmsCloseDialog(); app.openAdminProvisionModal('student'); return false;">Tạo tài khoản mới</a></p>
      </div>
      <div class="lms-dlg-f"><button type="button" class="lms-btn" onclick="app.lmsCloseDialog()">Hủy</button><button type="submit" class="lms-btn pri">Thêm</button></div>
    </form>`);
    return false;
  };

  app.lmsSubmitEnroll = function (key, forcedClass) {
    const classId = forcedClass || ($('lms-enroll-class') && $('lms-enroll-class').value);
    const cls = (app.classes || []).find(c => c.id === classId);
    const row = D.rowByKey(key);
    if (!cls || !row) return false;
    if (row.kind === 'roster') {
      app.adminAssignStudentClass(row.idx, classId);
    } else {
      const z = D.izList().find(s => s.id === row.izId);
      if (!z) return false;
      const name = String(z.name || '').trim() || String(z.email).split('@')[0];
      const newStu = {
        name,
        parent: 'Phụ huynh ' + name.replace(/^Bé\s+/i, 'bé '),
        email: String(z.email || '').toLowerCase(),
        phone: z.phone || '',
        userId: z.userId || undefined,
        aliases: [],
        code: app._nextStudentCode(),
        classCode: classId,
        hasLiveClass: true,
        hasOnlineCourses: false,
        courseIds: [],
        unsubmittedCurrent: true,
        progress: `Buổi 1/${Number(cls.totalLessons) || 25}`,
        attendance: '',
        target: '',
        note: '',
        _entUpdatedAt: Date.now()
      };
      app.students.push(newStu);
      app.persistEntitlementsToState?.();
      app.syncStudentEntitlementToServer?.(newStu, 'assign_class');
      app.showToast(`Đã xếp ${name} vào lớp ${classId}.`);
    }
    app.saveState();
    app.lmsCloseDialog();
    app.renderAll();
    return true;
  };

  /* ---------------- Render orchestration ---------------- */
  function renderPage(r, page) {
    const el = $('lms-page');
    if (!el) return;
    const active = document.activeElement;
    const focusId = active && el.contains(active) ? active.id : null;
    const selStart = focusId && active.selectionStart != null ? active.selectionStart : null;
    const msgsEl = $('lms-msgs');
    const atBottom = msgsEl ? (msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 40) : true;
    const draft = $('lms-group-input') ? $('lms-group-input').value : '';

    let html = '';
    if (page === 'groups') html = pageGroups(r);
    else if (page === 'course-grade') html = pageCourseGrade();
    else if (r === 'teacher' && page === 'grade') html = pageTeacherGrade();
    else if (r === 'admin') {
      html = page === 'classes' ? pageClasses()
        : page === 'students' ? pageStudents()
          : page === 'teachers' ? pageTeachers()
            : page === 'courses' ? pageCourses()
              : page === 'orders' ? pageOrders()
                : page === 'homework' ? pageHomework()
                : page === 'alerts' ? pageAlerts()
                  : pageDash();
    }
    el.innerHTML = `<div class="lms-wrap">${html}</div>`;

    if (page === 'groups') {
      const m = $('lms-msgs');
      if (m && atBottom) m.scrollTop = m.scrollHeight;
      if ($('lms-group-input') && draft) $('lms-group-input').value = draft;
      if ($('lms-group-input') && L.groupDraft) {
        $('lms-group-input').value = L.groupDraft;
        L.groupDraft = '';
        setTimeout(() => $('lms-group-input')?.focus(), 0);
      }
      if (L.room[r]) markSeen(r, L.room[r]);
      startGroupPoll();
    } else {
      stopGroupPoll();
    }
    if (focusId && $(focusId)) {
      const f = $(focusId);
      f.focus();
      if (selStart != null && f.setSelectionRange) { try { f.setSelectionRange(selStart, selStart); } catch {} }
    }
  }

  let applying = false;
  function applyShell() {
    if (applying) return;
    applying = true;
    try {
      const on = isWorkspace();
      document.body.classList.toggle('lms-on', on);
      if (!on) { stopGroupPoll(); return; }
      ensureDom();
      if (!$('lms-side')) return;
      const r = role();
      const page = currentPage(r);
      const item = navItems(r).find(n => n.id === page);
      const isNative = Boolean(item && item.native);
      ['parent', 'teacher', 'admin'].forEach(x => {
        const v = $('view-' + x);
        if (v) v.classList.toggle('hidden', !(isNative && x === r));
      });
      $('lms-page').classList.toggle('hidden', isNative);
      document.body.dataset.lmsRole = r;
      if (r === 'admin') {
        app.lmsFetchIz();
        app.lmsFetchCourseHomeworks();
      }
      if (r === 'teacher') {
        app.lmsFetchIz();
        app.lmsFetchCourseHomeworks();
        notifyNewTeacherClasses();
        // Màn chấm/giao bài luôn theo 1 lớp: chế độ "Tất cả" cũ trộn học sinh nhiều lớp dưới nhãn của một lớp
        const tCls = D.visibleClasses('teacher');
        if (tCls.length && (!app.teacherClassFilter || app.teacherClassFilter === 'ALL' || !tCls.some(c => c.id === app.teacherClassFilter))) {
          const pend = D.pending(tCls.map(c => c.id))[0];
          app.filterTeacherClass((pend && tCls.some(c => c.id === pend.classCode)) ? pend.classCode : tCls[0].id);
        }
      }
      renderSide(r, page);
      renderTop(r, page);
      renderMtab(r, page);
      if (!isNative) renderPage(r, page);
      else stopGroupPoll();
      if (page === 'groups') { renderSide(r, page); renderMtab(r, page); }
    } catch (e) {
      console.error('[LMS] applyShell', e);
    } finally {
      applying = false;
    }
  }
  app.lmsApply = applyShell;

  /* ---------------- Hooks ---------------- */
  const wrap = (name, after) => {
    const orig = app[name];
    if (typeof orig !== 'function' || orig.__lmsWrapped) return;
    const fn = function () {
      const res = orig.apply(this, arguments);
      try { after.call(this); } catch (e) { console.error('[LMS] hook ' + name, e); }
      return res;
    };
    fn.__lmsWrapped = true;
    app[name] = fn;
  };
  wrap('renderAll', applyShell);
  wrap('renderAdminOrders', applyShell);
  wrap('switchRole', applyShell);
  wrap('switchParentSubtab', () => {
    if (role() !== 'parent') return;
    if (app.parentSubtab === 'homework' || app.parentSubtab === 'courses') L.page.parent = app.parentSubtab;
    else if (app.parentSubtab === 'chat') { L.page.parent = 'groups'; applyShell(); }
  });
  wrap('switchTeacherTab', () => {
    if (app.teacherTab === 'grade' || app.teacherTab === 'assign') L.page.teacher = app.teacherTab;
    else if (app.teacherTab === 'chat') {
      L.page.teacher = 'groups';
      if (app.teacherClassFilter && app.teacherClassFilter !== 'ALL') L.room.teacher = app.teacherClassFilter;
      applyShell();
    }
  });

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('ktn_sll_orders_bus');
      bc.onmessage = function (ev) {
        if (ev && ev.data) {
          D.orders();
          applyShell();
        }
      };
    }
    window.addEventListener('storage', function (e) {
      if (e.key === 'ktn_sll_orders_bus' || e.key === 'ktn_sll_v1_state') {
        D.orders();
        applyShell();
      }
    });
  } catch (e) {}

  /* ============================================================ */
  /* UNIFIED MULTI-ROLE APP NOTIFICATION ENGINE (window.KTN_NOTIF) */
  /* ============================================================ */
  const CURRENT_TAB_ID = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const PROCESSED_MSG_IDS = new Set();

  const KTN_NOTIF = {
    _dedupeCache: new Map(),
    _notifChannel: null,
    activeTab: 'all',
    isOpen: false,

    getActiveContext() {
      const cleanMount = document.getElementById('ktn-clean-portal-mount');
      const isStudentPortalVisible = Boolean(cleanMount && cleanMount.style.display !== 'none' && getComputedStyle(cleanMount).display !== 'none');
      const portalUser = typeof window.getRealCurrentUser === 'function' ? window.getRealCurrentUser() : null;

      if (isStudentPortalVisible && portalUser) {
        const stuCls = String(portalUser.classCode || window.currentStudentProfile?.classCode || '').trim().toUpperCase();
        return {
          role: 'student',
          roleLabel: stuCls ? `Học viên · Lớp ${stuCls}` : 'Học viên Khóa Online',
          userId: String(portalUser.id || portalUser.userId || '').trim(),
          email: String(portalUser.email || '').trim().toLowerCase(),
          name: portalUser.name || 'Học viên',
          code: String(portalUser.studentId || portalUser.code || window.currentStudentProfile?.student_code || '').trim(),
          classCodes: stuCls ? [stuCls] : [],
          isPortal: true
        };
      }

      const r = role();
      const acc = window.sllAuth?.session?.account || {};
      if (r === 'admin') {
        return {
          role: 'admin',
          roleLabel: 'Quản lý Trung tâm',
          userId: String(acc.id || 'ADMIN').trim(),
          email: String(acc.email || 'hocvienkhongtunhi123@gmail.com').trim().toLowerCase(),
          name: acc.name || 'Ban Quản Lý',
          code: 'ADMIN',
          classCodes: (app.classes || []).map(c => c.id),
          isPortal: false
        };
      }
      if (r === 'teacher') {
        const tClasses = D.visibleClasses('teacher').map(c => c.id);
        return {
          role: 'teacher',
          roleLabel: 'Giáo viên',
          userId: String(acc.id || app.state?.teacherCode || 'GV-KTN-08').trim(),
          email: String(acc.email || 'linh.lam@khongtunhi.com').trim().toLowerCase(),
          name: app.state?.teacherName || acc.name || 'Cô Lâm Mỹ Linh',
          code: app.state?.teacherCode || 'GV-KTN-08',
          classCodes: tClasses.length ? tClasses : ['YCT2-04', 'HSK1-K12'],
          isPortal: false
        };
      }
      const stu = app.getActiveParentStudent ? app.getActiveParentStudent() : null;
      return {
        role: 'parent',
        roleLabel: stu && stu.classCode ? `Phụ huynh · Lớp ${stu.classCode}` : 'Phụ huynh & Học viên',
        userId: String((stu && stu.userId) || acc.id || '').trim(),
        email: String(acc.email || (window.sllAuth?.mode === 'connected' && stu && stu.email) || '').trim().toLowerCase(),
        name: (stu && stu.name) || acc.name || 'Học viên',
        code: String((stu && stu.code) || acc.code || '').trim(),
        classCodes: stu && stu.classCode ? [stu.classCode] : [],
        isPortal: false
      };
    },

    getReadSet() {
      try {
        localStorage.removeItem('ktn_notif_read_ids_v2');
        const raw = localStorage.getItem('ktn_notif_read_ids_v3');
        return new Set(raw ? JSON.parse(raw) : []);
      } catch {
        return new Set();
      }
    },

    saveReadSet(set) {
      try {
        localStorage.setItem('ktn_notif_read_ids_v3', JSON.stringify(Array.from(set).slice(-400)));
      } catch {}
    },

    getCustomEvents() {
      try {
        localStorage.removeItem('ktn_notif_custom_log_v2');
        const raw = localStorage.getItem('ktn_notif_custom_log_v3');
        const arr = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(arr)) return [];
        return arr.filter(x => x && x.id && !/\[TEST|VAPID|NOTIF-INIT/i.test(String(x.title || '') + String(x.id || '')));
      } catch {
        return [];
      }
    },

    saveCustomEvents(list) {
      try {
        const clean = (Array.isArray(list) ? list : []).filter(x => x && x.id && !/\[TEST|VAPID|NOTIF-INIT/i.test(String(x.title || '') + String(x.id || '')));
        localStorage.setItem('ktn_notif_custom_log_v3', JSON.stringify(clean.slice(0, 120)));
      } catch {}
    },

    evaluateRecipientMatch(notif, ctxInput) {
      const ctx = ctxInput || this.getActiveContext();
      if (!notif || !ctx || !ctx.email) return false;
      if (/\[TEST|VAPID|NOTIF-INIT/i.test(String(notif.title || '') + String(notif.id || ''))) return false;
      const rRole = String(notif.recipient_role || 'all').toLowerCase();
      let roleMatch = false;
      if (rRole === 'all') roleMatch = true;
      else if (rRole === ctx.role) roleMatch = true;
      else if ((ctx.role === 'student' || ctx.role === 'parent') && (rRole === 'student' || rRole === 'parent')) roleMatch = true;
      if (!roleMatch) return false;

      const rId = String(notif.recipient_id || 'ALL').trim();
      if (notif.type === 'HOMEWORK_GRADED') {
        return Boolean(
          (ctx.email && rId.toLowerCase() === ctx.email) ||
          (ctx.code && rId === ctx.code) ||
          (ctx.userId && rId === ctx.userId)
        );
      }
      const idMatch = rId === 'ALL'
        || (ctx.userId && rId === ctx.userId)
        || (ctx.code && rId === ctx.code)
        || (ctx.email && rId.toLowerCase() === ctx.email);
      if (!idMatch) return false;

      const tClass = notif.metadata?.classCode ? String(notif.metadata.classCode).trim() : '';
      if (tClass && tClass !== 'ALL' && ctx.role !== 'admin') {
        if (ctx.classCodes.length > 0 && !ctx.classCodes.includes(tClass)) return false;
      }
      return true;
    },

    isAuthenticated() {
      if (window.__ktnLoggingOut) return false;
      if (window.location.pathname === '/') return false;
      const portalUser = typeof window.getRealCurrentUser === 'function' ? window.getRealCurrentUser() : null;
      const sllConnected = Boolean(
        window.sllAuth &&
        window.sllAuth.mode === 'connected' &&
        window.sllAuth.session &&
        (window.sllAuth.session.email || window.sllAuth.session.account?.email)
      );
      if (!sllConnected && !(portalUser && portalUser.email)) return false;
      const ctx = this.getActiveContext();
      return Boolean(ctx && ctx.email);
    },

    buildRoleNotifications() {
      if (!this.isAuthenticated()) return [];
      const ctx = this.getActiveContext();
      const readSet = this.getReadSet();
      const now = Date.now();
      const items = [];
      const seenIds = new Set();

      const pushItem = (obj) => {
        if (!obj || !obj.id || seenIds.has(obj.id)) return;
        seenIds.add(obj.id);
        obj.read_status = Boolean(obj.read_status || readSet.has(obj.id));
        items.push(obj);
      };

      // 1. Custom real-time events triggered during session
      this.getCustomEvents().forEach(ev => {
        if (this.evaluateRecipientMatch(ev, ctx)) {
          pushItem({ ...ev, read_status: Boolean(ev.read_status || readSet.has(ev.id)) });
        }
      });

      const courseHws = D.courseHomeworks('ALL');
      const DEMO_ORDER_IDS = new Set(['ORD-20261031-001', 'ORD-20261030-002', 'ORD-20261030-003']);
      const DEMO_ALERT_IDS = new Set(['DLP-2026-101', 'DLP-2026-102', 'DLP-2026-103']);
      const orders = D.orders().filter(o => o && !DEMO_ORDER_IDS.has(String(o.orderId || o.id || '')));
      const openAlerts = D.openAlerts().filter(a => a && !DEMO_ALERT_IDS.has(String(a.id || '')));

      // 2. Chỉ tổng hợp thông báo thật ngắn gọn theo đúng vai trò đã đăng nhập
      if (ctx.role === 'admin') {
        orders.filter(o => o && (o.approvalStatus === 'pending' || !o.approvalStatus)).slice(0, 5).forEach((o, idx) => {
          const oid = o.orderId || o.id || ('ORD-' + idx);
          const ts = Date.parse(o.createdAt || '') || (now - (idx + 1) * 300000);
          pushItem({
            id: 'notif_admin_ord_pend_' + oid,
            recipient_role: 'admin',
            recipient_id: 'ALL',
            type: 'ORDER_CREATED',
            category: 'order',
            priority: 'HIGH',
            title: 'Đơn đăng ký mới chờ duyệt.',
            body: `${o.studentName || o.name || 'Học viên'} · ${o.courseName || 'Khóa học'}`,
            action_url: `/custom-page/so-lien-lac-test?view=orders&orderId=${encodeURIComponent(oid)}`,
            timestamp: ts,
            cta: 'Duyệt đơn →',
            metadata: { orderId: oid }
          });
        });

        openAlerts.slice(0, 3).forEach((a, idx) => {
          pushItem({
            id: 'notif_admin_dlp_' + (a.id || idx),
            recipient_role: 'admin',
            recipient_id: 'ALL',
            type: 'DLP_VIOLATION_DETECTED',
            category: 'security',
            priority: 'HIGH',
            title: 'Cảnh báo tin nhắn vi phạm.',
            body: `${a.teacher || 'Lớp học'} · ${a.channel || 'Nhóm lớp'}`,
            action_url: `/custom-page/so-lien-lac-test?view=alerts`,
            timestamp: now - (idx + 1) * 420000,
            cta: 'Kiểm tra →',
            metadata: { alertId: a.id }
          });
        });
      } else if (ctx.role === 'teacher') {
        courseHws.filter(h => h && h.status === 'PENDING').slice(0, 5).forEach((h, idx) => {
          pushItem({
            id: 'notif_teacher_chw_' + h.id,
            recipient_role: 'teacher',
            recipient_id: 'ALL',
            type: 'HOMEWORK_SUBMITTED_TEACHER_ALERT',
            category: 'academic',
            priority: 'HIGH',
            title: 'Học sinh vừa nộp bài.',
            body: `${h.studentName} · ${h.courseTitle} Bài ${h.lessonNum}`,
            action_url: `/custom-page/so-lien-lac-test?view=course-grade&hwId=${encodeURIComponent(h.id)}`,
            timestamp: D.hwTime(h) || (now - (idx + 1) * 300000),
            cta: 'Chấm bài →',
            metadata: { homeworkId: h.id, courseId: h.courseId, lessonNum: h.lessonNum, isCourseHomework: true }
          });
        });

        const classPend = D.pending(ctx.classCodes);
        classPend.slice(0, 5).forEach((h, idx) => {
          pushItem({
            id: 'notif_teacher_clshw_' + h.id,
            recipient_role: 'teacher',
            recipient_id: 'ALL',
            type: 'HOMEWORK_SUBMITTED_TEACHER_ALERT',
            category: 'academic',
            priority: 'HIGH',
            title: 'Học sinh vừa nộp bài.',
            body: `${h.studentName} · Lớp ${h.classCode || ''} Buổi ${D.hwLesson(h)}`,
            action_url: `/custom-page/so-lien-lac-test?view=grade&hwId=${encodeURIComponent(h.id)}`,
            timestamp: D.hwTime(h) || (now - (idx + 2) * 400000),
            cta: 'Chấm bài →',
            metadata: { homeworkId: h.id, classCode: h.classCode || '' }
          });
        });

        (ctx.classCodes || []).forEach(cls => {
          const normCls = String(cls || '').toUpperCase();
          const alreadyHasRoomChatNotif = items.some(ex =>
            ex && (ex.type === 'CLASS_CHAT_MESSAGE' || ex.type === 'CHAT_MESSAGE') &&
            String(ex.metadata?.classCode || '').toUpperCase() === normCls
          );
          if (alreadyHasRoomChatNotif) return;
          const roomMsgs = D.roomMessages(cls).filter(m => (m.senderRole || m.sender) !== 'teacher');
          const lastParentMsg = roomMsgs[roomMsgs.length - 1];
          if (lastParentMsg && lastParentMsg.text && lastParentMsg.id) {
            pushItem({
              id: `NOTIF-TMSG-${normCls}-${lastParentMsg.id}`,
              recipient_role: 'teacher',
              recipient_id: 'ALL',
              type: 'CLASS_CHAT_MESSAGE',
              category: 'comm',
              priority: 'MEDIUM',
              title: 'Tin nhắn mới từ học sinh.',
              body: `${lastParentMsg.senderName || 'Học sinh'} (${normCls}): ${String(lastParentMsg.text).slice(0, 60)}`,
              action_url: `/custom-page/so-lien-lac-test?view=groups&room=${encodeURIComponent(normCls)}`,
              timestamp: Date.parse(lastParentMsg.timestamp || '') || (now - 540000),
              cta: 'Xem tin nhắn →',
              metadata: { classCode: normCls }
            });
          }
        });
      } else {
        // Học sinh / Phụ huynh đã đăng nhập: chỉ hiện thông báo của đúng email đang đăng nhập
        const myHws = courseHws.filter(h => {
          const em = String(h.studentEmail || '').toLowerCase();
          return ctx.email && em === ctx.email;
        });

        myHws.filter(h => h.status === 'GRADED' || h.status === 'REVISION_REQUESTED').slice(0, 5).forEach((h, idx) => {
          const lIdx = Math.max(0, (Number(h.lessonNum) || 1) - 1);
          const normStatus = String(h.status || 'graded').toLowerCase();
          const canonicalHwId = String(h.id || '').startsWith('HW-' + ctx.email)
            ? h.id
            : `HW-${ctx.email}-${h.courseId}-L${h.lessonNum}`;
          const canonicalNotifId = `NOTIF-GRADED-${canonicalHwId}-${normStatus}-${h.score ?? ''}`;
          const alreadyHasSameLessonNotif = items.some(existing =>
            existing &&
            existing.type === 'HOMEWORK_GRADED' &&
            existing.metadata &&
            String(existing.metadata.courseId || '') === String(h.courseId || '') &&
            Number(existing.metadata.lessonNum || 0) === Number(h.lessonNum || 0)
          );
          if (alreadyHasSameLessonNotif) return;
          const rawCId = String(h.courseId || '');
          const isLiveClassHw = rawCId.toUpperCase().startsWith('CLASS_') || Number(h.lessonNum) >= 100;
          const liveCls = String(h.classCode || rawCId.replace(/^CLASS_/i, '')).trim();
          const sNum = Number(h.lessonNum) >= 100 ? Math.floor(Number(h.lessonNum) / 100) : (Number(h.lessonNum) || 1);
          const hwActionUrl = isLiveClassHw && liveCls
            ? `#/lop/${liveCls.toLowerCase()}/buoi/${sNum}`
            : (ctx.isPortal ? `#/khoa/${rawCId}/bai/${sNum}` : `/custom-page/so-lien-lac-test?course=${rawCId}&lesson=${lIdx}`);
          pushItem({
            id: canonicalNotifId,
            recipient_role: 'student',
            recipient_id: ctx.email,
            type: 'HOMEWORK_GRADED',
            category: 'academic',
            priority: 'HIGH',
            title: 'Cô giáo vừa nhận xét.',
            body: `${h.courseTitle || (isLiveClassHw && liveCls ? 'Lớp ' + liveCls : 'Bài tập')} · ${isLiveClassHw ? 'Buổi ' + sNum : 'Bài ' + h.lessonNum}${h.score != null ? (' (' + h.score + 'đ)') : ''}`,
            action_url: hwActionUrl,
            timestamp: D.hwTime(h) || (now - (idx + 1) * 240000),
            cta: 'Xem nhận xét →',
            metadata: { courseId: h.courseId, classCode: isLiveClassHw ? liveCls : '', lessonNum: h.lessonNum, lessonIdx: lIdx, homeworkId: canonicalHwId }
          });
        });

        const clsCode = ctx.classCodes && ctx.classCodes[0] ? String(ctx.classCodes[0]).toUpperCase() : '';
        if (clsCode) {
          const alreadyHasClsChatNotif = items.some(ex =>
            ex && (ex.type === 'CLASS_CHAT_MESSAGE' || ex.type === 'CHAT_MESSAGE') &&
            String(ex.metadata?.classCode || '').toUpperCase() === clsCode
          );
          if (!alreadyHasClsChatNotif) {
            const roomMsgs = D.roomMessages(clsCode).filter(m => (m.senderRole || m.sender) === 'teacher');
            const lastTeacherMsg = roomMsgs[roomMsgs.length - 1];
            if (lastTeacherMsg && lastTeacherMsg.text && lastTeacherMsg.id) {
              pushItem({
                id: `NOTIF-MSG-${clsCode}-${lastTeacherMsg.id}`,
                recipient_role: 'student',
                recipient_id: ctx.email,
                type: 'CLASS_CHAT_MESSAGE',
                category: 'comm',
                priority: 'MEDIUM',
                title: 'Tin nhắn mới từ cô giáo.',
                body: `${lastTeacherMsg.senderName || 'Cô giáo'}: ${String(lastTeacherMsg.text).slice(0, 60)}`,
                action_url: ctx.isPortal ? `#/lop/${clsCode.toLowerCase()}/buoi/1` : `/custom-page/so-lien-lac-test?view=groups&room=${encodeURIComponent(clsCode)}`,
                timestamp: Date.parse(lastTeacherMsg.timestamp || '') || (now - 600000),
                cta: 'Xem tin nhắn →',
                metadata: { classCode: clsCode }
              });
            }
          }
        }
      }

      items.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
      return items;
    },

    getCategoryIcon(cat) {
      if (cat === 'academic') return '📚';
      if (cat === 'comm') return '💬';
      if (cat === 'schedule') return '⏰';
      if (cat === 'order') return '🛒';
      if (cat === 'security') return '🛡️';
      return '🔔';
    },

    formatRelativeTime(ts) {
      const diff = Math.max(0, Date.now() - (Number(ts) || Date.now()));
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'Vừa xong';
      if (mins < 60) return `${mins} phút trước`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs} giờ trước`;
      return fmtShort(ts);
    },

    recalculateUnreadBadge() {
      const list = this.buildRoleNotifications();
      const unreadCount = list.filter(n => !n.read_status).length;
      const hasHigh = list.some(n => !n.read_status && n.priority === 'HIGH');
      const badges = document.querySelectorAll('#ktn-unread-count, #ktn-portal-unread-count, .ktn-unread-badge');
      badges.forEach(badge => {
        badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
        if (unreadCount > 0) {
          badge.classList.remove('hidden');
          badge.style.display = 'inline-flex';
          badge.classList.toggle('badge-pulse', hasHigh);
        } else {
          badge.classList.add('hidden');
          badge.style.display = 'none';
          badge.classList.remove('badge-pulse');
        }
      });
      const pill = document.getElementById('ktn-notif-total-badge');
      if (pill) {
        pill.textContent = unreadCount > 0 ? `${unreadCount} chưa đọc` : 'Đã đọc hết';
      }
      return unreadCount;
    },

    ensureDrawerDom() {
      let drawer = document.getElementById('ktn-notification-drawer');
      if (!drawer) {
        drawer = document.createElement('div');
        drawer.id = 'ktn-notification-drawer';
        drawer.className = 'ktn-notif-drawer hidden';
        document.body.appendChild(drawer);
      }
      let toastStack = document.getElementById('ktn-app-toast-stack');
      if (!toastStack) {
        toastStack = document.createElement('div');
        toastStack.id = 'ktn-app-toast-stack';
        document.body.appendChild(toastStack);
      }
      return drawer;
    },

    toggleNotificationCenter() {
      if (this.isOpen) this.closeNotificationCenter();
      else this.openNotificationCenter();
    },

    openNotificationCenter(tab) {
      if (tab) this.activeTab = tab;
      const drawer = this.ensureDrawerDom();
      this.isOpen = true;
      drawer.classList.remove('hidden');
      this.renderNotificationCenter();
      this.pullCloudNotifications();
    },

    closeNotificationCenter() {
      const drawer = document.getElementById('ktn-notification-drawer');
      this.isOpen = false;
      if (drawer) drawer.classList.add('hidden');
    },

    switchNotifTab(tab) {
      this.activeTab = tab || 'all';
      this.renderNotificationCenter();
    },

    renderNotificationCenter() {
      const drawer = this.ensureDrawerDom();
      const ctx = this.getActiveContext();
      const all = this.buildRoleNotifications();
      const unreadList = all.filter(n => !n.read_status);
      const acadList = all.filter(n => n.category === 'academic');
      const commSchedList = all.filter(n => n.category === 'comm' || n.category === 'schedule');
      const sysOrderList = all.filter(n => n.category === 'order' || n.category === 'security');

      let filtered = all;
      if (this.activeTab === 'unread') filtered = unreadList;
      else if (this.activeTab === 'academic') filtered = acadList;
      else if (this.activeTab === 'comm_sched') filtered = commSchedList;
      else if (this.activeTab === 'sys_order') filtered = sysOrderList;

      const tabs = [
        ['all', 'Tất cả', all.length],
        ['unread', 'Chưa đọc', unreadList.length],
        ['academic', 'Bài tập & Học tập', acadList.length],
        ['comm_sched', 'Tin nhắn & Giờ học', commSchedList.length],
        ...(ctx.role === 'admin' || sysOrderList.length ? [['sys_order', 'Đơn hàng & An toàn', sysOrderList.length]] : [])
      ].map(([k, l, c]) => `<button type="button" class="ktn-tab-item${this.activeTab === k ? ' active' : ''}" onclick="window.KTN_NOTIF.switchNotifTab('${k}')">${esc(l)} <i>${c}</i></button>`).join('');

      const listHtml = filtered.length ? filtered.map(item => `
        <div class="ktn-notif-item ${item.read_status ? 'is-read' : 'is-unread'} pri-${esc(item.priority || 'MEDIUM')}" data-notif-id="${esc(item.id)}" onclick="window.KTN_NOTIF.handleNotificationItemClick('${esc(item.id)}')">
          <div class="ktn-category-avatar cat-${esc(item.category || 'academic')}">
            ${this.getCategoryIcon(item.category)}
          </div>
          <div class="ktn-notif-content-col">
            <div class="ktn-notif-row-top">
              <h4 class="ktn-item-title">${esc(item.title)}</h4>
              <span class="ktn-item-time">${esc(this.formatRelativeTime(item.timestamp))}</span>
            </div>
            <p class="ktn-item-body">${esc(item.body)}</p>
            <div class="ktn-item-meta">
              <span class="ktn-item-cta">${esc(item.cta || 'Xem chi tiết →')}</span>
              ${!item.read_status ? '<span class="ktn-unread-indicator" title="Chưa đọc"></span>' : '<span style="color:#94A3B8;font-size:11px;">✓ Đã xem</span>'}
            </div>
          </div>
        </div>
      `).join('') : `
        <div class="ktn-notif-empty">
          <div style="font-size:32px;margin-bottom:8px;">${this.activeTab === 'unread' ? '✅' : '🔔'}</div>
          <b>${this.activeTab === 'unread' ? 'Tuyệt vời! Bạn đã đọc hết tất cả thông báo.' : 'Chưa có thông báo nào trong mục này.'}</b>
        </div>
      `;

      const isPwaActive = this.isPwaPermanentActive();
      const pwaBtnHtml = isPwaActive
        ? `<button type="button" class="btn-pwa-push-config is-permanent-active" onclick="window.KTN_NOTIF.requestNotificationPermissionSafe()" style="background:#ECFDF5;border-color:#10B981;color:#065F46;">
             ✓ Đã bật thông báo trình duyệt
           </button>`
        : `<button type="button" class="btn-pwa-push-config" onclick="window.KTN_NOTIF.requestNotificationPermissionSafe()">
             🔔 Bật thông báo trình duyệt
           </button>`;

      drawer.innerHTML = `
        <div class="ktn-notif-backdrop" onclick="window.KTN_NOTIF.closeNotificationCenter()"></div>
        <aside class="ktn-notif-panel" role="dialog" aria-label="Trung tâm thông báo">
          <header class="ktn-notif-header">
            <div class="ktn-notif-title-wrap">
              <h3 class="ktn-notif-title">🔔 Thông Báo</h3>
              <span class="ktn-notif-role-pill">${esc(ctx.roleLabel)}</span>
              <span id="ktn-notif-total-badge" class="ktn-notif-count-pill">${unreadList.length > 0 ? `${unreadList.length} chưa đọc` : 'Đã đọc hết'}</span>
            </div>
            <div class="ktn-notif-header-actions">
              <button type="button" id="ktn-btn-mark-all-read" class="btn-text-action" onclick="window.KTN_NOTIF.markAllNotificationsRead()">✓ Đọc tất cả</button>
              <button type="button" class="btn-icon-close" onclick="window.KTN_NOTIF.closeNotificationCenter()" aria-label="Đóng">✕</button>
            </div>
          </header>
          <nav class="ktn-notif-tabs">${tabs}</nav>
          <div id="ktn-notif-list" class="ktn-notif-scroll-area">${listHtml}</div>
          <footer class="ktn-notif-footer">
            ${pwaBtnHtml}
          </footer>
        </aside>
      `;
      this.recalculateUnreadBadge();
    },

    async markNotificationRead(notifId) {
      if (!notifId) return;
      const nid = String(notifId).trim();
      const set = this.getReadSet();
      set.add(nid);
      this.saveReadSet(set);
      const custom = this.getCustomEvents();
      let changed = false;
      custom.forEach(c => {
        if (c.id === nid && !c.read_status) {
          c.read_status = true;
          changed = true;
        }
      });
      if (changed) this.saveCustomEvents(custom);
      this.recalculateUnreadBadge();
      if (this.isOpen) this.renderNotificationCenter();
      try {
        this._notifChannel?.postMessage({ type: 'NOTIF_MARK_READ', originTabId: CURRENT_TAB_ID, notifId: nid });
      } catch {}
      if (window.KtnWebApp && typeof window.KtnWebApp.apiRequest === 'function') {
        try {
          await window.KtnWebApp.apiRequest('/api/ktn/notifications/read', {
            method: 'PATCH',
            body: { ids: [nid] }
          });
        } catch {}
      }
    },

    async markAllNotificationsRead() {
      const set = this.getReadSet();
      const all = this.buildRoleNotifications();
      const ids = all.map(n => String(n.id || '').trim()).filter(Boolean);
      ids.forEach(id => set.add(id));
      this.saveReadSet(set);
      const custom = this.getCustomEvents();
      custom.forEach(c => { c.read_status = true; });
      this.saveCustomEvents(custom);
      this.recalculateUnreadBadge();
      if (this.isOpen) this.renderNotificationCenter();
      try {
        this._notifChannel?.postMessage({ type: 'NOTIF_MARK_ALL_READ', originTabId: CURRENT_TAB_ID });
      } catch {}
      if (ids.length > 0 && window.KtnWebApp && typeof window.KtnWebApp.apiRequest === 'function') {
        try {
          await window.KtnWebApp.apiRequest('/api/ktn/notifications/read', {
            method: 'PATCH',
            body: { ids }
          });
        } catch {}
      }
    },

    async handleNotificationItemClick(notifId) {
      const all = this.buildRoleNotifications();
      const item = all.find(n => n.id === notifId);
      await this.markNotificationRead(notifId);
      this.closeNotificationCenter();
      if (item) {
        this.handleNotificationDeepLink(item.action_url, item);
      }
    },

    handleNotificationDeepLink(actionUrl, item) {
      const ctx = this.getActiveContext();
      const meta = (item && item.metadata) || {};

      // 1. Ngữ cảnh Cổng Học Viên Trực Tuyến (Student Online Portal)
      if (ctx.isPortal) {
        const rawUrl = String(actionUrl || '');
        const isChat = Boolean(item && (item.type === 'CLASS_CHAT_MESSAGE' || item.type === 'CHAT_MESSAGE'));
        if ((rawUrl.startsWith('#/lop') || rawUrl.startsWith('#/khoa')) && typeof window.navigateStudentHash === 'function') {
          window.navigateStudentHash(rawUrl);
          setTimeout(() => {
            if (isChat) {
              const chatBox = document.getElementById('student-chat-messages') || document.getElementById('student-chat-input');
              if (chatBox) chatBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (rawUrl.startsWith('#/lop')) {
              const hwBox = document.getElementById('class-active-session-box') || document.getElementById('student-homework-list');
              if (hwBox) hwBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
              const fbBox = document.getElementById('hw-graded-feedback-box') || document.getElementById('interactive-workbook-section');
              if (fbBox) fbBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 300);
          return;
        }
        if (isChat || rawUrl.includes('view=groups')) {
          const targetCls = String(meta.classCode || (ctx.classCodes && ctx.classCodes[0]) || '').trim().toLowerCase();
          if (targetCls && typeof window.navigateStudentHash === 'function') {
            window.navigateStudentHash(`#/lop/${targetCls}/buoi/1`);
            setTimeout(() => {
              const chatBox = document.getElementById('student-chat-messages');
              if (chatBox) chatBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 350);
            return;
          }
        }
        const cid = meta.courseId || (actionUrl && actionUrl.startsWith('/') && new URL(actionUrl, location.origin).searchParams.get('course'));
        const lIdx = meta.lessonIdx != null ? Number(meta.lessonIdx) : (actionUrl && actionUrl.startsWith('/') && new URL(actionUrl, location.origin).searchParams.get('lesson') != null ? Number(new URL(actionUrl, location.origin).searchParams.get('lesson')) : null);
        if (cid && typeof window.enterCourseLearning === 'function') {
          window.enterCourseLearning(lIdx != null ? lIdx : 0, cid);
          setTimeout(() => {
            const fbBox = document.getElementById('hw-graded-feedback-box') || document.getElementById('interactive-workbook-section');
            if (fbBox) fbBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 450);
          return;
        }
        if (typeof window.showCoursesDashboard === 'function') {
          window.showCoursesDashboard();
        }
        return;
      }

      // 2. Ngữ cảnh Sổ Liên Lạc LMS (Admin / Teacher / Parent)
      try {
        const u = actionUrl ? new URL(actionUrl, location.origin) : null;
        const view = (u && (u.searchParams.get('view') || u.searchParams.get('tab'))) || '';
        const hwId = meta.homeworkId || (u && u.searchParams.get('hwId')) || '';
        const room = meta.classCode || (u && u.searchParams.get('room')) || '';

        if (view === 'course-grade' || meta.isCourseHomework) {
          app.lmsGo('course-grade', { cgCourse: meta.courseId || 'ALL', cgTab: 'all' });
          if (hwId) setTimeout(() => app.lmsOpenGrade(hwId), 200);
          return;
        }
        if (view === 'grade') {
          app.lmsGo(ctx.role === 'admin' ? 'homework' : 'grade');
          if (hwId) setTimeout(() => app.lmsOpenGrade(hwId), 200);
          return;
        }
        if (view === 'orders') {
          const tab = (u && u.searchParams.get('tab')) || 'all';
          app.lmsGo('orders', { orderTab: tab });
          return;
        }
        if (view === 'alerts') {
          app.lmsGo('alerts');
          return;
        }
        if (view === 'groups') {
          app.lmsGo('groups', room ? { room } : undefined);
          return;
        }
        if (view === 'assign') {
          app.lmsGo('assign');
          return;
        }
        if (view === 'classes') {
          app.lmsGo('classes');
          return;
        }
        if (view === 'homework') {
          app.lmsGo('homework');
          return;
        }
        if (view === 'home') {
          app.lmsGo('home');
          return;
        }
      } catch (e) {
        console.warn('[KTN_NOTIF] DeepLink warning:', e);
      }
    },

    showInAppToast(notif) {
      this.ensureDrawerDom();
      const stack = document.getElementById('ktn-app-toast-stack');
      if (!stack || !notif) return;
      while (stack.children.length >= 3) {
        stack.firstElementChild.remove();
      }
      const el = document.createElement('div');
      el.className = `ktn-app-toast pri-${esc(notif.priority || 'MEDIUM')} cat-${esc(notif.category || 'academic')}`;
      el.innerHTML = `
        <div class="ktn-app-toast-ic">${this.getCategoryIcon(notif.category)}</div>
        <div class="ktn-app-toast-body">
          <b>${esc(notif.title)}</b>
          <p>${esc(notif.body)}</p>
        </div>
        <button type="button" class="ktn-app-toast-x" aria-label="Đóng">✕</button>
      `;
      el.addEventListener('click', (ev) => {
        if (ev.target.closest('.ktn-app-toast-x')) {
          el.remove();
          return;
        }
        el.remove();
        this.handleNotificationItemClick(notif.id);
      });
      stack.appendChild(el);
      setTimeout(() => {
        if (el.parentNode) el.remove();
      }, 5000);
    },

    triggerNotificationEvent(eventCode, payload = {}) {
      if (!eventCode || !this.isAuthenticated()) return false;
      const now = Date.now();
      let type = eventCode;
      let category = payload.category || 'academic';
      let recipient_role = payload.recipient_role || 'all';
      let priority = payload.priority || 'HIGH';
      let action_url = payload.action_url || '/custom-page/so-lien-lac-test';
      let recipient_id = payload.recipient_id || payload.studentEmail || payload.studentCode || 'ALL';

      if (eventCode === 'onGraded') {
        type = 'HOMEWORK_GRADED';
        category = 'academic';
        recipient_role = 'student';
        recipient_id = payload.recipient_id || payload.studentEmail || payload.studentCode || 'NONE';
        action_url = `/custom-page/so-lien-lac-test?course=6adadba969897b0002482ca5&lesson=${Math.max(0, (Number(payload.lessonNum) || 1) - 1)}`;
      } else if (eventCode === 'onSubmitted') {
        type = 'HOMEWORK_SUBMITTED_TEACHER_ALERT';
        category = 'academic';
        recipient_role = 'teacher';
        action_url = '/custom-page/so-lien-lac-test?view=course-grade';
      } else if (eventCode === 'onAssignedOrChat') {
        type = 'HOMEWORK_ASSIGNED';
        category = 'academic';
        recipient_role = 'parent';
        action_url = '/custom-page/so-lien-lac-test?view=homework';
      }

      const notif = {
        id: payload.id || ('notif_' + now + '_' + Math.random().toString(36).slice(2, 7)),
        recipient_role,
        recipient_id,
        type,
        category,
        priority,
        title: payload.title || 'Thông báo mới từ Học Viện Khổng Tử Nhí',
        body: payload.body || '',
        action_url,
        cta: payload.cta || 'Xem ngay →',
        timestamp: now,
        read_status: false,
        metadata: payload.metadata || { lessonNum: payload.lessonNum, studentCode: payload.studentCode, studentEmail: payload.studentEmail }
      };

      PROCESSED_MSG_IDS.add(notif.id);
      const custom = this.getCustomEvents();
      custom.unshift(notif);
      this.saveCustomEvents(custom);

      const isTarget = this.evaluateRecipientMatch(notif) || Boolean(payload._forceShowOnCurrentTab);
      if (isTarget) {
        this.showInAppToast(notif);
        this.recalculateUnreadBadge();
        if (this.isOpen) this.renderNotificationCenter();
      }

      // Broadcast cross-tab
      try {
        this.initBroadcastChannel();
        this._notifChannel?.postMessage({
          type: 'NEW_NOTIFICATION',
          originTabId: CURRENT_TAB_ID,
          notification: notif
        });
      } catch {}

      // Dispatch PWA / Browser Notification if permission granted
      if (isTarget && 'Notification' in window && Notification.permission === 'granted') {
        try {
          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'KTN_SHOW_NOTIFICATION',
              title: notif.title,
              body: notif.body,
              data: notif
            });
          } else {
            new Notification(notif.title, {
              body: notif.body,
              icon: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/sofl-remake/logo.png'
            });
          }
        } catch {}
      }
      return true;
    },

    CLOUD_NOTIF_S3_KEY: 'resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/sofl-remake/ktn-live-notifications.json',
    CLOUD_NOTIF_CDN_URL: 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/sofl-remake/ktn-live-notifications.json',
    VENDOR_SETTING_URL: 'https://k90adfn1jk.execute-api.ap-southeast-1.amazonaws.com/prod/vendor-setting/3529cd2b-7af6-4fda-887c-392a79393d6a',

    async pushCloudNotification() {
      return false;
    },

    async pullCloudNotifications() {
      if (!this.isAuthenticated()) return;
      if (this._isPullingCloudNotifs) return;
      this._isPullingCloudNotifs = true;
      try {
        let items = [];
        if (window.KtnWebApp && typeof window.KtnWebApp.apiRequest === 'function') {
          const apiRes = await window.KtnWebApp.apiRequest('/api/ktn/notifications');
          if (apiRes && apiRes.ok && Array.isArray(apiRes.data?.notifications)) {
            items = apiRes.data.notifications;
          }
        }
        if (!items.length) return;

        const custom = this.getCustomEvents();
        const existingMap = new Map(custom.map(c => [c.id, c]));
        const readSet = this.getReadSet();
        let readSetChanged = false;
        let customChanged = false;
        const now = Date.now();
        const ctx = this.getActiveContext();

        items.slice().reverse().forEach(rawItem => {
          if (!rawItem || !rawItem.id) return;
          if (rawItem.read === true && !readSet.has(rawItem.id)) {
            readSet.add(rawItem.id);
            readSetChanged = true;
          }
          const isRead = Boolean(rawItem.read || readSet.has(rawItem.id));
          if (existingMap.has(rawItem.id)) {
            const ex = existingMap.get(rawItem.id);
            if (ex && ex.read_status !== isRead) {
              ex.read_status = isRead;
              customChanged = true;
            }
            return;
          }
          if (PROCESSED_MSG_IDS.has(rawItem.id)) return;
          const rawType = String(rawItem.type || 'academic').toLowerCase();
          const isChat = rawType === 'chat_message' || rawType === 'class_chat_message';
          const isOrder = rawType === 'order_pending' || rawType === 'order_created';
          const item = {
            id: rawItem.id,
            recipient_role: ctx.role,
            recipient_id: ctx.email || ctx.code || ctx.userId || 'ALL',
            type: isChat ? 'CLASS_CHAT_MESSAGE' : String(rawItem.type || 'ACADEMIC').toUpperCase(),
            category: isChat ? 'comm' : (isOrder ? 'order' : 'academic'),
            priority: isChat ? 'MEDIUM' : 'HIGH',
            title: rawItem.title || 'Thông báo mới',
            body: rawItem.body || '',
            action_url: rawItem.actionUrl || rawItem.action_url || '/custom-page/so-lien-lac-test',
            cta: isChat ? 'Xem tin nhắn →' : 'Xem ngay →',
            timestamp: rawItem.createdAt ? new Date(rawItem.createdAt).getTime() : now,
            read_status: isRead,
            metadata: {
              studentEmail: ctx.email,
              studentCode: ctx.code,
              classCode: rawItem.classCode || (ctx.classCodes && ctx.classCodes[0]) || '',
              homeworkId: rawItem.homeworkId || '',
              courseId: rawItem.courseId || '',
              lessonNum: rawItem.lessonNum || null
            }
          };
          if (!this.evaluateRecipientMatch(item, ctx)) return;
          PROCESSED_MSG_IDS.add(item.id);
          existingMap.set(item.id, item);
          custom.unshift(item);
          customChanged = true;
        });

        if (readSetChanged) this.saveReadSet(readSet);
        if (customChanged || readSetChanged) {
          this.saveCustomEvents(custom);
          this.recalculateUnreadBadge();
          if (this.isOpen) this.renderNotificationCenter();
        }
      } catch {} finally {
        this._isPullingCloudNotifs = false;
      }
    },

    simulateScenario() {
      return false;
    },

    VAPID_PUBLIC_KEY: 'BG4yPEa0evkPFiDAtau85Mg90U2WimsmOCRZgvIqeXQzUDzts5yR75wQub8YJCSXk0sK5jN3Jc3Hbp9jIVRECPM',

    urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    },

    async registerAndSubscribeWebPush() {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
        if ('Notification' in window && Notification.permission !== 'granted') return null;

        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null);
        }
        if (!reg) {
          reg = await navigator.serviceWorker.register('./sw.js').catch(() => null);
        }
        if (!reg || !reg.pushManager) return null;

        await navigator.serviceWorker.ready;
        const appServerKey = this.urlBase64ToUint8Array(this.VAPID_PUBLIC_KEY);
        let sub = await reg.pushManager.getSubscription();
        let previousEndpoint = '';
        if (sub && sub.options && sub.options.applicationServerKey) {
          const actualKey = new Uint8Array(sub.options.applicationServerKey);
          let keyMatches = actualKey.length === appServerKey.length;
          for (let i = 0; keyMatches && i < actualKey.length; i++) {
            if (actualKey[i] !== appServerKey[i]) keyMatches = false;
          }
          if (!keyMatches) {
            previousEndpoint = sub.endpoint || '';
            await sub.unsubscribe().catch(() => false);
            sub = null;
          }
        }
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: appServerKey
          });
        }
        if (sub) {
          await this.savePushSubscriptionToCloud(sub.toJSON(), previousEndpoint);
        }
        return sub;
      } catch {
        return null;
      }
    },

    async savePushSubscriptionToCloud(subJson, previousEndpoint) {
      try {
        if (!subJson || !subJson.endpoint || !subJson.keys) return false;
        if (!window.KtnWebApp || typeof window.KtnWebApp.apiRequest !== 'function') return false;
        const ctx = this.getActiveContext();
        const res = await window.KtnWebApp.apiRequest('/api/ktn/push/subscribe', {
          method: 'POST',
          body: {
            email: ctx.email || '',
            role: ctx.role || 'student',
            classCode: (ctx.classCodes && ctx.classCodes[0]) || null,
            subscription: subJson,
            ...(previousEndpoint ? { previousEndpoint } : {})
          }
        });
        if (res && res.ok) {
          localStorage.setItem('ktn_saved_push_ep_v1', subJson.endpoint);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },

    isPwaPermanentActive() {
      try {
        if ('Notification' in window && Notification.permission === 'granted') return true;
        if (localStorage.getItem('ktn_pwa_permanent_optin_v1') === '1') return true;
        if (document.cookie && document.cookie.indexOf('ktn_pwa_optin_v1=1') !== -1) return true;
      } catch {}
      return false;
    },

    markPwaPermanentActive() {
      try {
        localStorage.setItem('ktn_pwa_permanent_optin_v1', '1');
      } catch {}
      try {
        document.cookie = 'ktn_pwa_optin_v1=1; path=/; max-age=315360000; SameSite=Lax';
      } catch {}
      try {
        if (window.caches && typeof window.caches.open === 'function') {
          window.caches.open('ktn-sll-auth-v2').then(c => {
            c.put('/__ktn_pwa_optin__', new Response('1', { headers: { 'Content-Type': 'text/plain' } }));
          }).catch(() => {});
        }
      } catch {}
    },

    async ensurePermanentTokenAndPwa() {
      // 1. Tự động khôi phục cờ bật thông báo vĩnh viễn từ quyền trình duyệt / CacheStorage & đồng bộ WebPush Subscription
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          this.markPwaPermanentActive();
          this.registerAndSubscribeWebPush().catch(() => {});
        } else if (!this.isPwaPermanentActive() && window.caches && typeof window.caches.open === 'function') {
          const cache = await window.caches.open('ktn-sll-auth-v2').catch(() => null);
          const hit = cache ? await cache.match('/__ktn_pwa_optin__').catch(() => null) : null;
          if (hit) this.markPwaPermanentActive();
        }
      } catch {}

      // 2. Xin cấp Persistent Storage của trình duyệt để OS không bao giờ tự xóa dữ liệu PWA/IndexedDB/Cache
      try {
        if (navigator.storage && typeof navigator.storage.persist === 'function') {
          navigator.storage.persist().catch(() => {});
        }
      } catch {}

      // 3. Tự động gia hạn Token izTeach ngầm (Silent Token Auto-Heal) để phiên đăng nhập & luồng thông báo không bao giờ hết hạn
      try {
        if (window.__ktnLoggingOut) return;
        let freshToken = null;
        if (window.IzTeachPortalClient && typeof window.IzTeachPortalClient.getServiceToken === 'function') {
          freshToken = await window.IzTeachPortalClient.getServiceToken().catch(() => null);
        } else if (window.IZTEACH_STORAGE && typeof window.IZTEACH_STORAGE.ensureToken === 'function') {
          freshToken = await window.IZTEACH_STORAGE.ensureToken().catch(() => null);
        }
        if (freshToken && !window.__ktnLoggingOut) {
          const rawSaved = localStorage.getItem('ktn_sll_persistent_auth_v2');
          if (rawSaved) {
            const parsed = JSON.parse(rawSaved);
            if (parsed && parsed.email) {
              parsed.accessTokenExpiredAt = Date.now() + 3650 * 86400000; // 10 năm
              if (!parsed.accessToken || String(parsed.accessToken).startsWith('KTN-')) {
                parsed.serviceAccessToken = freshToken;
              }
              if (typeof window.__saveGlobalKtnSession === 'function' && !window.__ktnLoggingOut) {
                window.__saveGlobalKtnSession(parsed);
              }
            }
          }
        }
      } catch {}
    },

    async requestNotificationPermissionSafe() {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const isStandalone = (window.navigator.standalone === true) || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
      if (isIOS && !isStandalone) {
        this.markPwaPermanentActive();
        this.showAddToHomeScreenModal();
        return 'ios_a2hs_required';
      }
      if (!('Notification' in window) || typeof Notification.requestPermission !== 'function') {
        this.markPwaPermanentActive();
        await this.ensurePermanentTokenAndPwa();
        if (this.isOpen) this.renderNotificationCenter();
        this.showInAppToast({
          id: 'notif_pwa_info_' + Date.now(),
          category: 'schedule',
          priority: 'MEDIUM',
          title: '✅ Đã kích hoạt Thông báo Vĩnh viễn (Cài 1 lần duy nhất)',
          body: 'Thông báo và phiên đăng nhập đã được khóa vĩnh viễn trên thiết bị này, tự động gia hạn ngầm và chỉ mất nếu bạn gỡ cài đặt ứng dụng.'
        });
        return 'in_app_active';
      }
      try {
        if (Notification.permission === 'granted') {
          this.markPwaPermanentActive();
          await this.ensurePermanentTokenAndPwa();
          if (this.isOpen) this.renderNotificationCenter();
          this.showInAppToast({
            id: 'notif_pwa_already_granted_' + Date.now(),
            category: 'academic',
            priority: 'MEDIUM',
            title: '✅ Thông báo Vĩnh viễn đang hoạt động (Tự động gia hạn Token)',
            body: 'Bạn chỉ cần bật 1 lần duy nhất. Hệ thống tự động giữ quyền và làm mới Token ngầm trọn đời trừ khi gỡ cài đặt ứng dụng.'
          });
          return 'granted';
        }
        const perm = await Notification.requestPermission();
        this.markPwaPermanentActive();
        await this.ensurePermanentTokenAndPwa();
        if (this.isOpen) this.renderNotificationCenter();
        if (perm === 'granted') {
          this.showInAppToast({
            id: 'notif_pwa_granted_' + Date.now(),
            category: 'academic',
            priority: 'MEDIUM',
            title: '✅ Đã bật Thông báo Vĩnh viễn (Cài 1 lần · Không bao giờ hết hạn)!',
            body: 'Quyền thông báo và Token được tự động gia hạn ngầm. Bạn không bao giờ phải cài lại trừ khi gỡ ứng dụng.'
          });
          return 'granted';
        } else {
          this.showInAppToast({
            id: 'notif_pwa_inapp_fallback_' + Date.now(),
            category: 'schedule',
            priority: 'MEDIUM',
            title: '✅ Đã bật Thông báo trực tiếp Vĩnh viễn trong ứng dụng!',
            body: 'Mọi thông báo bài tập, tin nhắn, giờ học sẽ hiển thị tức thời và tự động gia hạn ngầm.'
          });
          return 'in_app_permanent';
        }
      } catch {}
      return 'default';
    },

    showAddToHomeScreenModal() {
      const existing = document.getElementById('ktn-a2hs-modal');
      if (existing) existing.remove();
      const html = `
        <div id="ktn-a2hs-modal" style="position:fixed;inset:0;background:rgba(15,23,42,0.65);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:'Be Vietnam Pro',sans-serif;">
          <div style="background:#fff;width:100%;max-width:440px;border-radius:20px;padding:24px;box-shadow:0 20px 40px rgba(0,0,0,0.25);">
            <div style="text-align:center;margin-bottom:16px;">
              <div style="font-size:36px;margin-bottom:6px;">📲</div>
              <h3 style="margin:0;font-size:18px;font-weight:800;color:#0F172A;">Cài đặt Ứng dụng ra Màn hình chính (PWA)</h3>
              <p style="margin:6px 0 0;font-size:13px;color:#64748B;">Để nhận thông báo nhắc giờ học, bài tập và tin nhắn giáo viên trên iPhone/iPad:</p>
            </div>
            <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:14px;margin-bottom:18px;font-size:13.5px;color:#334155;line-height:1.5;">
              <div style="margin-bottom:8px;"><b>1.</b> Nhấn nút <b>Chia sẻ (Share)</b> ở thanh dưới cùng Safari.</div>
              <div style="margin-bottom:8px;"><b>2.</b> Chọn <b>"Thêm vào MH chính" (Add to Home Screen)</b>.</div>
              <div><b>3.</b> Mở ứng dụng Khổng Tử Nhí từ màn hình chính để nhận thông báo đẩy tức thời.</div>
            </div>
            <button type="button" onclick="document.getElementById('ktn-a2hs-modal').remove()" style="width:100%;padding:11px;background:#B91C1C;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;">Đã hiểu</button>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', html);
    },

    initBroadcastChannel() {
      if (typeof BroadcastChannel === 'undefined' || this._notifChannel) return;
      try {
        this._notifChannel = new BroadcastChannel('ktn_notification_bus');
        this._notifChannel.onmessage = (ev) => {
          const msg = (ev && ev.data) || {};
          if (msg.originTabId === CURRENT_TAB_ID) return;
          if (msg.type === 'NEW_NOTIFICATION' && msg.notification) {
            const n = msg.notification;
            if (PROCESSED_MSG_IDS.has(n.id)) return;
            PROCESSED_MSG_IDS.add(n.id);
            if (this.evaluateRecipientMatch(n)) {
              this.showInAppToast(n);
            }
            this.recalculateUnreadBadge();
            if (this.isOpen) this.renderNotificationCenter();
          } else if (msg.type === 'NOTIF_MARK_READ' || msg.type === 'NOTIF_MARK_ALL_READ') {
            this.recalculateUnreadBadge();
            if (this.isOpen) this.renderNotificationCenter();
          }
        };
      } catch {}
    }
  };

  window.KTN_NOTIF = KTN_NOTIF;
  app.triggerNotificationEvent = KTN_NOTIF.triggerNotificationEvent.bind(KTN_NOTIF);
  app.toggleNotificationCenter = KTN_NOTIF.toggleNotificationCenter.bind(KTN_NOTIF);
  app.openNotificationCenter = KTN_NOTIF.openNotificationCenter.bind(KTN_NOTIF);
  app.closeNotificationCenter = KTN_NOTIF.closeNotificationCenter.bind(KTN_NOTIF);
  app.markAllNotificationsRead = KTN_NOTIF.markAllNotificationsRead.bind(KTN_NOTIF);
  app.requestNotificationPermissionSafe = KTN_NOTIF.requestNotificationPermissionSafe.bind(KTN_NOTIF);
  KTN_NOTIF.initBroadcastChannel();
  KTN_NOTIF.ensurePermanentTokenAndPwa();
  setTimeout(() => KTN_NOTIF.pullCloudNotifications(), 1200);
  setInterval(() => KTN_NOTIF.pullCloudNotifications(), 5000);
  setInterval(() => KTN_NOTIF.ensurePermanentTokenAndPwa(), 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      KTN_NOTIF.ensurePermanentTokenAndPwa();
      KTN_NOTIF.pullCloudNotifications();
    }
  });
  window.addEventListener('online', () => {
    KTN_NOTIF.ensurePermanentTokenAndPwa();
    KTN_NOTIF.pullCloudNotifications();
  });
  const observe = () => {
    const obs = new MutationObserver(() => applyShell());
    obs.observe(document.body, { attributes: true, attributeFilter: ['data-auth'] });
    const root = $('ktn-sll-root');
    if (root) obs.observe(root, { attributes: true, attributeFilter: ['data-auth'] });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { observe(); applyShell(); });
  else { observe(); applyShell(); }
})();
