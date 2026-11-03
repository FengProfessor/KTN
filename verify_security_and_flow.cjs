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
const zlib = require('zlib');

function createValidWavBuffer(durationSec = 1, freqHz = 440) {
  const sampleRate = 8000;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.round(12000 * Math.sin((2 * Math.PI * freqHz * i) / sampleRate));
    buf.writeInt16LE(sample, 44 + i * 2);
  }
  return buf;
}

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

  const forgedCompressed = zlib.deflateSync(Buffer.from(JSON.stringify({
    email: 'hocvienkhongtunhi123@gmail.com',
    vendorId: '3529cd2b-7af6-4fda-887c-392a79393d6a',
    userId: '2c01e488-d866-4341-a0db-644fe6ba1202',
    roles: ['root', 'admin']
  }))).toString('base64');
  const forgedMid = Buffer.from(JSON.stringify({ payloadCompressed: forgedCompressed })).toString('base64url');
  const forgedIzTeachJwt = `eayJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${forgedMid}.forged_signature_xyz`;
  const forgedIzRes = await fetch(`${BASE_URL}/api/ktn/auth/session`, {
    headers: { 'Authorization': `Bearer ${forgedIzTeachJwt}` }
  });
  console.log('GET /api/ktn/auth/session with forged 3-part eayJ admin JWT -> status:', forgedIzRes.status);
  if (forgedIzRes.status !== 401) {
    throw new Error(`Expected 401 for forged 3-part eayJ JWT, got ${forgedIzRes.status}`);
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
  const wavBuf1 = createValidWavBuffer(1, 440);
  const upRes = await fetch(`${BASE_URL}/api/ktn/homeworks/upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${stuLogin.token}`
    },
    body: JSON.stringify({ fileName: 'nam-bai-1-lan-1.wav', fileType: 'audio/wav' })
  }).then(r => r.json());
  if (!upRes.ok || !upRes.signedUrl || !upRes.fileUrl) throw new Error('S3 upload-url failed: ' + JSON.stringify(upRes));

  // Upload real WAV audio bytes (#1) to AWS S3 via signedUrl
  const s3Put1 = await fetch(upRes.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'audio/wav' },
    body: wavBuf1
  });
  console.log('S3 PUT recording #1 status:', s3Put1.status, '| bytes:', wavBuf1.length);
  if (!s3Put1.ok && s3Put1.status !== 204) {
    throw new Error(`Expected S3 PUT recording #1 to succeed, got ${s3Put1.status}`);
  }

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
      fileType: 'audio/wav',
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
      fileType: 'audio/wav',
      fileUrl: upRes.fileUrl
    })
  });
  console.log('Student A POST /api/ktn/homeworks with Class YCT3-02 -> status:', spoofClassRes.status);
  if (spoofClassRes.status !== 403) {
    throw new Error(`Expected 403 when Student A submits to unassigned class YCT3-02, got ${spoofClassRes.status}`);
  }

  console.log('\n=== [TEST 5] Real S3 Audio Upload + API Flow + CloudFront Playback Verification ===');
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
      fileType: 'audio/wav',
      fileUrl: upRes.fileUrl,
      studentNote: 'Con nộp bài thu âm lần 1 ạ',
      attachments: [{ title: 'nam-bai-1-lan-1.wav', fileUrl: upRes.fileUrl, cdnUrl: upRes.fileUrl, mediaType: 'audio/wav', size: wavBuf1.length }]
    })
  }).then(r => r.json());
  if (!sub1.ok || sub1.homework?.id !== expectedServerHwId || sub1.homework?.status !== 'pending') {
    throw new Error('Submit #1 failed or wrong server-derived ID: ' + JSON.stringify(sub1));
  }
  console.log('Step 5.1a: Server derived canonical ID ->', sub1.homework.id, '| status:', sub1.homework.status, '| attachments count:', (sub1.homework.attachments || []).length);

  // Teacher A fetches the submitted audio file from CloudFront CDN to verify it exists and is valid WAVE audio
  const cdnFetch1 = await fetch(sub1.homework.file_url);
  const cdnBytes1 = Buffer.from(await cdnFetch1.arrayBuffer());
  const riff1 = cdnBytes1.slice(0, 4).toString('ascii');
  const wave1 = cdnBytes1.slice(8, 12).toString('ascii');
  console.log('Step 5.1b: Teacher A fetched audio #1 from CloudFront -> status:', cdnFetch1.status, '| bytes:', cdnBytes1.length, '| header:', `${riff1}/${wave1}`);
  if (cdnFetch1.status !== 200 || cdnBytes1.length !== wavBuf1.length || riff1 !== 'RIFF' || wave1 !== 'WAVE') {
    throw new Error(`CloudFront audio #1 verification failed: status=${cdnFetch1.status} len=${cdnBytes1.length}`);
  }

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

  // 5.4 Student A uploads a NEW real WAV recording (#2, 2 seconds @ 660Hz) to S3 and resubmits -> status resets to 'pending'
  const wavBuf2 = createValidWavBuffer(2, 660);
  const upRes2 = await fetch(`${BASE_URL}/api/ktn/homeworks/upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${stuLogin.token}`
    },
    body: JSON.stringify({ fileName: 'nam-bai-1-lan-2.wav', fileType: 'audio/wav' })
  }).then(r => r.json());
  if (!upRes2.ok || !upRes2.signedUrl || !upRes2.fileUrl) throw new Error('S3 upload-url #2 failed: ' + JSON.stringify(upRes2));

  const s3Put2 = await fetch(upRes2.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'audio/wav' },
    body: wavBuf2
  });
  console.log('S3 PUT recording #2 status:', s3Put2.status, '| bytes:', wavBuf2.length);
  if (!s3Put2.ok && s3Put2.status !== 204) {
    throw new Error(`Expected S3 PUT recording #2 to succeed, got ${s3Put2.status}`);
  }

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
      fileType: 'audio/wav',
      fileUrl: upRes2.fileUrl,
      studentNote: 'Con đã sửa thanh 3 và nộp lại bài ạ',
      attachments: [{ title: 'nam-bai-1-lan-2.wav', fileUrl: upRes2.fileUrl, cdnUrl: upRes2.fileUrl, mediaType: 'audio/wav', size: wavBuf2.length }]
    })
  }).then(r => r.json());
  if (!sub2.ok || sub2.homework?.status !== 'pending' || sub2.homework?.file_url !== upRes2.fileUrl) {
    throw new Error('Student resubmit #2 failed: ' + JSON.stringify(sub2));
  }
  console.log('Step 5.4a: Student A resubmitted recording #2 -> status reset to:', sub2.homework.status);

  // Teacher A fetches the new resubmitted audio file (#2) from CloudFront CDN
  const cdnFetch2 = await fetch(sub2.homework.file_url);
  const cdnBytes2 = Buffer.from(await cdnFetch2.arrayBuffer());
  const riff2 = cdnBytes2.slice(0, 4).toString('ascii');
  const wave2 = cdnBytes2.slice(8, 12).toString('ascii');
  console.log('Step 5.4b: Teacher A fetched audio #2 from CloudFront -> status:', cdnFetch2.status, '| bytes:', cdnBytes2.length, '| header:', `${riff2}/${wave2}`);
  if (cdnFetch2.status !== 200 || cdnBytes2.length !== wavBuf2.length || riff2 !== 'RIFF' || wave2 !== 'WAVE') {
    throw new Error(`CloudFront audio #2 verification failed: status=${cdnFetch2.status} len=${cdnBytes2.length}`);
  }

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

  console.log('\n=== [TEST 6] Unified Logout Flow (Cookie Clearing + IndexedDB tx.oncomplete + EscapeHtml Coverage) ===');
  const logoutRes = await fetch(`${BASE_URL}/api/ktn/auth/logout`, {
    method: 'POST'
  });
  const logoutCookie = logoutRes.headers.get('set-cookie') || '';
  const logoutBody = await logoutRes.json();
  console.log('POST /api/ktn/auth/logout -> status:', logoutRes.status, '| ok:', logoutBody.ok, '| Set-Cookie:', logoutCookie);
  if (logoutRes.status !== 200 || !logoutBody.ok || !logoutCookie.includes('ktn_webapp_token=;') || !logoutCookie.includes('Max-Age=0')) {
    throw new Error(`Logout endpoint verification failed: status=${logoutRes.status} cookie=${logoutCookie}`);
  }

  const clientJsRes = await fetch(`${BASE_URL}/ktn-webapp-client.js`);
  const clientJsText = await clientJsRes.text();
  if (
    !clientJsText.includes('tx.oncomplete') ||
    !clientJsText.includes('clearSessionFromCacheStorage') ||
    !clientJsText.includes('window.__ktnLoggingOut = true') ||
    !clientJsText.includes('escapeHtml')
  ) {
    throw new Error('Deployed /ktn-webapp-client.js is missing unified logout / tx.oncomplete / escapeHtml checks');
  }
  console.log('Verified /ktn-webapp-client.js has tx.oncomplete, clearSessionFromCacheStorage, __ktnLoggingOut, and escapeHtml.');

  const studentHtmlRes = await fetch(`${BASE_URL}/sll-hocsinh.html`);
  const studentHtmlText = await studentHtmlRes.text();
  if (
    !studentHtmlText.includes('window.KtnWebApp.logout') ||
    !studentHtmlText.includes('window.KtnWebApp.switchAccountPreservingTarget') ||
    !studentHtmlText.includes('escapeHtml(')
  ) {
    throw new Error('Deployed /sll-hocsinh.html is missing KtnWebApp.logout delegation or escapeHtml');
  }
  console.log('Verified /sll-hocsinh.html delegates logout/switchAccount to KtnWebApp and uses escapeHtml.');

  console.log('\n=== [TEST 7] Full Student Bulk Sync + Online Course Homework Submission (Lesson 1 & Lesson 2) ===');
  const adminLogin = await fetch(`${BASE_URL}/api/ktn/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.IZTEACH_ADMIN_EMAIL || 'hocvienkhongtunhi123@gmail.com',
      password: process.env.IZTEACH_ADMIN_PASSWORD || ''
    })
  }).then(r => r.json());
  if (!adminLogin.ok || !adminLogin.token) throw new Error('Admin login failed: ' + JSON.stringify(adminLogin));
  console.log('Admin login OK -> role:', adminLogin.session.role);

  const syncAllRes = await fetch(`${BASE_URL}/api/ktn/students/sync-all`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminLogin.token}`
    }
  }).then(r => r.json());
  console.log('POST /api/ktn/students/sync-all ->', JSON.stringify(syncAllRes));
  if (!syncAllRes.ok || typeof syncAllRes.syncedCount !== 'number' || syncAllRes.syncedCount < 1) {
    throw new Error('Bulk sync failed: ' + JSON.stringify(syncAllRes));
  }

  // Test online course homework submission for Lesson 1 AND Lesson 2 (verifying no 403 and no lessonNum > 1 mismatch)
  for (const lNum of [1, 2]) {
    const onlineSub = await fetch(`${BASE_URL}/api/ktn/homeworks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stuLogin.token}`
      },
      body: JSON.stringify({
        courseId: '6adadba969897b0002482ca5',
        lessonNum: lNum,
        lessonTitle: `Bài ${lNum}: HSK1 3.0`,
        fileType: 'audio/wav',
        fileUrl: upRes.fileUrl,
        studentNote: `Con nộp vở bài tập khóa học Bài ${lNum} ạ`,
        attachments: [{ title: `hsk1-bai-${lNum}.wav`, fileUrl: upRes.fileUrl, cdnUrl: upRes.fileUrl, mediaType: 'audio/wav', size: wavBuf1.length }]
      })
    });
    const onlineSubJson = await onlineSub.json();
    console.log(`Online Course Homework Submit (Lesson ${lNum}) -> status:`, onlineSub.status, '| id:', onlineSubJson.homework?.id);
    if (onlineSub.status !== 200 || !onlineSubJson.ok) {
      throw new Error(`Expected 200 OK for online course homework Lesson ${lNum}, got ${onlineSub.status}: ${JSON.stringify(onlineSubJson)}`);
    }
    if (SUPABASE_URL && SUPABASE_KEY && onlineSubJson.homework?.id) {
      await fetch(`${SUPABASE_URL}/rest/v1/ktn_homeworks?id=eq.${encodeURIComponent(onlineSubJson.homework.id)}`, {
        method: 'DELETE',
        headers: { 'apikey': SUPABASE_KEY }
      });
    }
  }

  console.log('\n=== [TEST 8] Authenticated-Only Concise Notifications & Lead Endpoint ===');
  const unauthNotif = await fetch(`${BASE_URL}/api/ktn/notifications`);
  console.log('Unauthenticated GET /api/ktn/notifications -> status:', unauthNotif.status);
  if (unauthNotif.status !== 401) {
    throw new Error(`Expected 401 for unauthenticated /api/ktn/notifications, got ${unauthNotif.status}`);
  }

  const stuNotifRes = await fetch(`${BASE_URL}/api/ktn/notifications`, {
    headers: { 'Authorization': `Bearer ${stuLogin.token}` }
  });
  const stuNotifJson = await stuNotifRes.json();
  console.log('Student GET /api/ktn/notifications -> status:', stuNotifRes.status, '| count:', (stuNotifJson.notifications || []).length);
  if (stuNotifRes.status !== 200 || !stuNotifJson.ok || !Array.isArray(stuNotifJson.notifications)) {
    throw new Error('Authenticated student notifications failed: ' + JSON.stringify(stuNotifJson));
  }

  const leadRes = await fetch(`${BASE_URL}/api/ktn/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Phụ huynh Kiểm thử E2E',
      phone: '0988974685',
      childAge: 'Tiểu học (7–11t)'
    })
  });
  const leadJson = await leadRes.json();
  console.log('POST /api/ktn/leads -> status:', leadRes.status, '| body:', JSON.stringify(leadJson));
  if (leadRes.status !== 200 || !leadJson.ok) {
    throw new Error('POST /api/ktn/leads failed: ' + JSON.stringify(leadJson));
  }

  console.log('\nALL 8 SECURITY, SYNC, HOMEWORK, NOTIFICATION & LEAD REGRESSION TESTS PASSED!');
}

main().catch(err => {
  console.error('Regression Test Failed:', err);
  process.exit(1);
});
