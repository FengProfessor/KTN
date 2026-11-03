/**
 * KHỔNG TỬ NHÍ — KIỂM THỬ HỒI QUY BẢO MẬT & LUỒNG API HỌC SINH <-> GIÁO VIÊN
 * Chạy: node verify_security_and_flow.cjs
 *
 * Lưu ý: Kịch bản này kiểm thử ở tầng HTTP/API (Cloudflare Worker + Supabase + S3).
 * Việc thu âm micro thật (getUserMedia + MediaRecorder) và phát lại <audio> cần
 * được kiểm tra trực tiếp trên trình duyệt / điện thoại tại https://khongtunhi.com/sll-hocsinh.html
 * và https://khongtunhi.com/sll-teacher.html.
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const env = {};
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m) env[m[1]] = m[2].trim();
  }
}

const BASE_URL = process.env.KTN_TEST_BASE_URL || 'https://khongtunhi.com';
const SUPABASE_URL = process.env.SUPABASE_URL || env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';

async function main() {
  console.log(`Target Base URL: ${BASE_URL}`);

  console.log('\n=== [TEST 1] Forged Token + Admin Email Header Must Return 401 ===');
  const forgedSessionRes = await fetch(`${BASE_URL}/api/ktn/auth/session`, {
    headers: {
      'Authorization': 'Bearer forged.token.1234567890abcdef',
      'X-KTN-User-Email': 'hocvienkhongtunhi123@gmail.com'
    }
  });
  console.log('GET /api/ktn/auth/session with forged token + admin email -> status:', forgedSessionRes.status);
  if (forgedSessionRes.status !== 401) {
    throw new Error(`Expected 401 for forged token on /api/ktn/auth/session, got ${forgedSessionRes.status}`);
  }

  const forgedOrdersRes = await fetch(`${BASE_URL}/api/ktn/orders`, {
    headers: {
      'Authorization': 'Bearer forged.token.1234567890abcdef',
      'X-KTN-User-Email': 'hocvienkhongtunhi123@gmail.com'
    }
  });
  console.log('GET /api/ktn/orders with forged token + admin email -> status:', forgedOrdersRes.status);
  if (forgedOrdersRes.status !== 401 && forgedOrdersRes.status !== 403) {
    throw new Error(`Expected 401/403 for forged token on /api/ktn/orders, got ${forgedOrdersRes.status}`);
  }

  console.log('\n=== [TEST 2] Fallback Password (123456) When izTeach Rejects Login Must Return 401 ===');
  for (const targetEmail of ['hocvienkhongtunhi123@gmail.com', 'quanly@khongtunhi.com']) {
    const res = await fetch(`${BASE_URL}/api/ktn/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail, password: '123456' })
    });
    console.log(`POST /api/ktn/auth/login (${targetEmail} + 123456) -> status:`, res.status);
    if (res.status !== 401) {
      throw new Error(`Expected 401 for ${targetEmail} with fallback password 123456, got ${res.status}`);
    }
  }

  const badTeacherPwdRes = await fetch(`${BASE_URL}/api/ktn/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'linh.lam@khongtunhi.com', password: 'wrong-password-999' })
  });
  console.log('POST /api/ktn/auth/login (linh.lam@khongtunhi.com + wrong password) -> status:', badTeacherPwdRes.status);
  if (badTeacherPwdRes.status !== 401) {
    throw new Error(`Expected 401 for wrong teacher password, got ${badTeacherPwdRes.status}`);
  }

  console.log('\n=== [TEST 3] Teacher of Class B (YCT3-02) Must Be Denied (403) From Opening/Grading Class A (YCT2-04) ===');
  const stuLogin = await fetch(`${BASE_URL}/api/ktn/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'hoangngan@khongtunhi.com', password: '123456' })
  }).then(r => r.json());
  if (!stuLogin.ok || !stuLogin.token) throw new Error('Student login failed: ' + JSON.stringify(stuLogin));
  console.log('Student A (hoangngan@khongtunhi.com - YCT2-04) login OK -> classCode:', stuLogin.session.classCode);

  const teacherALogin = await fetch(`${BASE_URL}/api/ktn/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'linh.lam@khongtunhi.com', password: '123456' })
  }).then(r => r.json());
  if (!teacherALogin.ok || !teacherALogin.token) throw new Error('Teacher A login failed: ' + JSON.stringify(teacherALogin));
  console.log('Teacher A (Cô Linh - YCT2-04) login OK -> role:', teacherALogin.session.role);

  const teacherBLogin = await fetch(`${BASE_URL}/api/ktn/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'thu.ha@khongtunhi.com', password: '123456' })
  }).then(r => r.json());
  if (!teacherBLogin.ok || !teacherBLogin.token) throw new Error('Teacher B login failed: ' + JSON.stringify(teacherBLogin));
  console.log('Teacher B (Cô Hà - YCT3-02) login OK -> role:', teacherBLogin.session.role);

  const tbGetHwA = await fetch(`${BASE_URL}/api/ktn/homeworks?classCode=YCT2-04`, {
    headers: { 'Authorization': `Bearer ${teacherBLogin.token}` }
  });
  console.log('Teacher B GET /api/ktn/homeworks?classCode=YCT2-04 -> status:', tbGetHwA.status);
  if (tbGetHwA.status !== 403) {
    throw new Error(`Expected 403 when Teacher B opens Class A homeworks, got ${tbGetHwA.status}`);
  }

  const tbGetSessionsA = await fetch(`${BASE_URL}/api/ktn/class-sessions?classCode=YCT2-04`, {
    headers: { 'Authorization': `Bearer ${teacherBLogin.token}` }
  });
  console.log('Teacher B GET /api/ktn/class-sessions?classCode=YCT2-04 -> status:', tbGetSessionsA.status);
  if (tbGetSessionsA.status !== 403) {
    throw new Error(`Expected 403 when Teacher B opens Class A sessions, got ${tbGetSessionsA.status}`);
  }

  console.log('\n=== [TEST 4] Homework Ownership & Class Enrollment Guard (Student A Cannot Spoof Student B ID or Class B) ===');
  const upRes = await fetch(`${BASE_URL}/api/ktn/homeworks/upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${stuLogin.token}`
    },
    body: JSON.stringify({ fileName: 'nam-bai-1-lan-1.webm', fileType: 'audio/webm' })
  }).then(r => r.json());
  if (!upRes.ok || !upRes.fileUrl) throw new Error('S3 upload-url failed: ' + JSON.stringify(upRes));

  // 4a. Student A tries to pass an ID belonging to Student B (dachanh@khongtunhi.com)
  const spoofIdRes = await fetch(`${BASE_URL}/api/ktn/homeworks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${stuLogin.token}`
    },
    body: JSON.stringify({
      id: 'HW-dachanh@khongtunhi.com-CLASS_YCT2-04-L101',
      courseId: 'CLASS_YCT2-04',
      classCode: 'YCT2-04',
      lessonNum: 101,
      lessonTitle: 'Buổi 1 · Bài 1',
      fileType: 'audio',
      fileUrl: upRes.fileUrl
    })
  });
  console.log('Student A POST /api/ktn/homeworks with Student B ID -> status:', spoofIdRes.status);
  if (spoofIdRes.status !== 403) {
    throw new Error(`Expected 403 when Student A sends Student B homework ID, got ${spoofIdRes.status}`);
  }

  // 4b. Student A (YCT2-04) tries to submit homework to Class B (YCT3-02)
  const spoofClassRes = await fetch(`${BASE_URL}/api/ktn/homeworks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${stuLogin.token}`
    },
    body: JSON.stringify({
      courseId: 'CLASS_YCT3-02',
      classCode: 'YCT3-02',
      lessonNum: 101,
      lessonTitle: 'Buổi 1 · Bài 1',
      fileType: 'audio',
      fileUrl: upRes.fileUrl
    })
  });
  console.log('Student A POST /api/ktn/homeworks with Class YCT3-02 -> status:', spoofClassRes.status);
  if (spoofClassRes.status !== 403) {
    throw new Error(`Expected 403 when Student A submits to unassigned class YCT3-02, got ${spoofClassRes.status}`);
  }

  console.log('\n=== [TEST 5] API Flow & Live Supabase Schema Verification (Submit -> Revision Requested -> Resubmit -> Graded) ===');
  const testLessonNum = 901;
  const expectedServerHwId = `HW-hoangngan@khongtunhi.com-CLASS_YCT2-04-L${testLessonNum}`;

  // 5.1 Student A submits without passing body.id -> Server computes canonical ID
  const sub1 = await fetch(`${BASE_URL}/api/ktn/homeworks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${stuLogin.token}`
    },
    body: JSON.stringify({
      courseId: 'CLASS_YCT2-04',
      classCode: 'YCT2-04',
      lessonNum: testLessonNum,
      lessonTitle: '[Lớp YCT2-04 · Buổi 1] Bài 1',
      fileType: 'audio',
      fileUrl: upRes.fileUrl,
      studentNote: 'Con nộp bài thu âm lần 1 ạ',
      attachments: [{ title: 'nam-bai-1-lan-1.webm', fileUrl: upRes.fileUrl, cdnUrl: upRes.fileUrl, mediaType: 'audio/webm', size: 4096 }]
    })
  }).then(r => r.json());
  if (!sub1.ok || sub1.homework?.id !== expectedServerHwId || sub1.homework?.status !== 'pending') {
    throw new Error('Submit #1 failed or wrong server-derived ID: ' + JSON.stringify(sub1));
  }
  console.log('Step 5.1: Server derived canonical ID ->', sub1.homework.id, '| status:', sub1.homework.status, '| attachments count:', (sub1.homework.attachments || []).length);

  // 5.2 Teacher B tries to grade Class A's homework -> MUST be rejected with 403
  const tbGradeRes = await fetch(`${BASE_URL}/api/ktn/homeworks/grade`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${teacherBLogin.token}`
    },
    body: JSON.stringify({
      id: expectedServerHwId,
      status: 'graded',
      score: 10,
      teacherFeedback: 'Teacher B trying to grade Class A'
    })
  });
  console.log('Step 5.2: Teacher B PATCH /api/ktn/homeworks/grade on Class A homework -> status:', tbGradeRes.status);
  if (tbGradeRes.status !== 403) {
    throw new Error(`Expected 403 when Teacher B grades Class A homework, got ${tbGradeRes.status}`);
  }

  // 5.3 Teacher A requests revision ('revision_requested')
  const reqRev = await fetch(`${BASE_URL}/api/ktn/homeworks/grade`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${teacherALogin.token}`
    },
    body: JSON.stringify({
      id: expectedServerHwId,
      status: 'revision_requested',
      score: 7.0,
      teacherFeedback: 'Con chú ý đọc rõ thanh 3 ở câu 2 rồi thu âm gửi lại cho cô nhé.'
    })
  }).then(r => r.json());
  if (!reqRev.ok || reqRev.homework?.status !== 'revision_requested') {
    throw new Error('Teacher A request revision failed: ' + JSON.stringify(reqRev));
  }
  console.log('Step 5.3: Teacher A requested revision -> status in Supabase:', reqRev.homework.status);

  // 5.4 Student A resubmits recording #2 -> status resets to 'pending'
  const upRes2 = await fetch(`${BASE_URL}/api/ktn/homeworks/upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${stuLogin.token}`
    },
    body: JSON.stringify({ fileName: 'nam-bai-1-lan-2.webm', fileType: 'audio/webm' })
  }).then(r => r.json());
  const sub2 = await fetch(`${BASE_URL}/api/ktn/homeworks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${stuLogin.token}`
    },
    body: JSON.stringify({
      courseId: 'CLASS_YCT2-04',
      classCode: 'YCT2-04',
      lessonNum: testLessonNum,
      lessonTitle: '[Lớp YCT2-04 · Buổi 1] Bài 1',
      fileType: 'audio',
      fileUrl: upRes2.fileUrl,
      studentNote: 'Con đã sửa thanh 3 và nộp lại bài ạ',
      attachments: [{ title: 'nam-bai-1-lan-2.webm', fileUrl: upRes2.fileUrl, cdnUrl: upRes2.fileUrl, mediaType: 'audio/webm', size: 5120 }]
    })
  }).then(r => r.json());
  if (!sub2.ok || sub2.homework?.status !== 'pending' || sub2.homework?.file_url !== upRes2.fileUrl) {
    throw new Error('Student resubmit #2 failed: ' + JSON.stringify(sub2));
  }
  console.log('Step 5.4: Student A resubmitted recording #2 -> status reset to:', sub2.homework.status);

  // 5.5 Teacher A grades final submission as 'graded' (9.5)
  const finalGrade = await fetch(`${BASE_URL}/api/ktn/homeworks/grade`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${teacherALogin.token}`
    },
    body: JSON.stringify({
      id: expectedServerHwId,
      status: 'graded',
      score: 9.5,
      teacherFeedback: 'Lần này con phát âm thanh 3 rất chuẩn rồi! Cô khen con nhé.'
    })
  }).then(r => r.json());
  if (!finalGrade.ok || finalGrade.homework?.status !== 'graded' || Number(finalGrade.homework?.score) !== 9.5) {
    throw new Error('Teacher A final grade failed: ' + JSON.stringify(finalGrade));
  }
  console.log('Step 5.5: Teacher A graded resubmission -> status:', finalGrade.homework.status, 'score:', finalGrade.homework.score);

  if (SUPABASE_URL && SUPABASE_KEY) {
    const delRes = await fetch(`${SUPABASE_URL}/rest/v1/ktn_homeworks?id=eq.${encodeURIComponent(expectedServerHwId)}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY }
    });
    console.log('Cleanup DELETE test row status:', delRes.status);
  }

  console.log('\nALL 5 SECURITY & API FLOW REGRESSION TESTS PASSED!');
}

main().catch(err => {
  console.error('Regression Test Failed:', err);
  process.exit(1);
});
