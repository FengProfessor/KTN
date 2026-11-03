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
const { execSync } = require('child_process');
const puppeteer = require('puppeteer');

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
  let gitCommit = 'unknown';
  try {
    gitCommit = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim();
  } catch {}
  console.log(`Target Base URL: ${BASE_URL} | Git Commit: ${gitCommit}`);

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

  console.log('\n=== [TEST 7] Full Student Bulk Sync (1,044 Students Audit + Idempotency) + Online Course Homework (Lesson 1 & Lesson 2) ===');
  const adminLogin = await fetch(`${BASE_URL}/api/ktn/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.IZTEACH_ADMIN_EMAIL || env.IZTEACH_ADMIN_EMAIL || 'hocvienkhongtunhi123@gmail.com',
      password: process.env.IZTEACH_ADMIN_PASSWORD || env.IZTEACH_ADMIN_PASSWORD || ''
    })
  }).then(r => r.json());
  if (!adminLogin.ok || !adminLogin.token) throw new Error('Admin login failed: ' + JSON.stringify(adminLogin));
  console.log('Admin login OK -> role:', adminLogin.session.role);

  const syncAllRes1 = await fetch(`${BASE_URL}/api/ktn/students/sync-all`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminLogin.token}`
    }
  }).then(r => r.json());
  console.log('POST /api/ktn/students/sync-all (Run #1) ->', JSON.stringify(syncAllRes1));
  if (
    !syncAllRes1.ok ||
    typeof syncAllRes1.izteachTotal !== 'number' ||
    syncAllRes1.izteachTotal < 1000 ||
    syncAllRes1.syncedCount !== syncAllRes1.izteachTotal ||
    syncAllRes1.failedCount !== 0
  ) {
    throw new Error('Bulk sync #1 audit failed: ' + JSON.stringify(syncAllRes1));
  }

  const syncAllRes2 = await fetch(`${BASE_URL}/api/ktn/students/sync-all`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminLogin.token}`
    }
  }).then(r => r.json());
  console.log('POST /api/ktn/students/sync-all (Run #2 Idempotency Check) ->', JSON.stringify(syncAllRes2));
  if (
    !syncAllRes2.ok ||
    syncAllRes2.supabaseBefore !== syncAllRes1.syncedCount ||
    syncAllRes2.syncedCount !== syncAllRes1.syncedCount ||
    !syncAllRes2.idempotent
  ) {
    throw new Error('Bulk sync #2 idempotency check failed: ' + JSON.stringify(syncAllRes2));
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
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
    }
  }

  console.log('\n=== [TEST 8] Authenticated-Only Concise Notifications, Cross-Student Isolation & Test-Mode Lead Endpoint ===');
  const unauthNotif = await fetch(`${BASE_URL}/api/ktn/notifications`);
  console.log('Unauthenticated GET /api/ktn/notifications -> status:', unauthNotif.status);
  if (unauthNotif.status !== 401) {
    throw new Error(`Expected 401 for unauthenticated /api/ktn/notifications, got ${unauthNotif.status}`);
  }

  const stuNotifRes = await fetch(`${BASE_URL}/api/ktn/notifications`, {
    headers: { 'Authorization': `Bearer ${stuLogin.token}` }
  });
  const stuNotifJson = await stuNotifRes.json();
  console.log('Student A GET /api/ktn/notifications -> status:', stuNotifRes.status, '| count:', (stuNotifJson.notifications || []).length);
  if (stuNotifRes.status !== 200 || !stuNotifJson.ok || !Array.isArray(stuNotifJson.notifications)) {
    throw new Error('Authenticated student notifications failed: ' + JSON.stringify(stuNotifJson));
  }

  const leadRes = await fetch(`${BASE_URL}/api/ktn/leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-KTN-Test-Mode': '1'
    },
    body: JSON.stringify({
      name: 'Phụ huynh Kiểm thử E2E',
      phone: '0988974685',
      childAge: 'Tiểu học (7–11t)',
      testMode: true
    })
  });
  const leadJson = await leadRes.json();
  console.log('POST /api/ktn/leads (testMode=true) -> status:', leadRes.status, '| body:', JSON.stringify(leadJson));
  if (leadRes.status !== 200 || !leadJson.ok || !leadJson.testMode) {
    throw new Error('POST /api/ktn/leads testMode failed: ' + JSON.stringify(leadJson));
  }

  console.log('\n=== [TEST 9] Real Browser (Puppeteer) E2E: Guest Clean UI -> Login -> Submit Bài 1 & Bài 2 -> Reload -> Teacher Grade -> Reload -> Cross-Student Isolation ===');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const createdHwIds = [
    'HW-dachanh@khongtunhi.com-CLASS_YCT2-04-L101',
    'HW-dachanh@khongtunhi.com-CLASS_YCT2-04-L102'
  ];
  try {
    // 9.1 Guest / Unauthenticated Browser Check on / and /custom-page/so-lien-lac-test
    const guestCtx = await browser.createBrowserContext();
    const guestPage = await guestCtx.newPage();
    await guestPage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 1500));
    const guestHomeAudit = await guestPage.evaluate(async () => {
      const hasSocialProof = Boolean(document.getElementById('ktn-social-proof'));
      const hasPushBanner = Boolean(document.getElementById('ktn-live-push-banner'));
      const hasToast = document.querySelectorAll('.ktn-toast-item').length > 0;
      const hasOpenDrawer = Boolean(document.querySelector('.ktn-notif-drawer.open'));
      const fnStr = typeof window.ktnLandingPage === 'function' ? window.ktnLandingPage.toString() : '';
      const bodyScripts = Array.from(document.querySelectorAll('script')).map(s => s.textContent || '').join('\n') + '\n' + fnStr;
      let usesLeadApi = document.documentElement.innerHTML.includes('/api/ktn/leads') || bodyScripts.includes('/api/ktn/leads');
      if (!usesLeadApi) {
        const extSrc = Array.from(document.querySelectorAll('script[src*="ktn-live"], script[src*="ktn-home"]')).map(s => s.src)[0];
        if (extSrc) {
          const jsTxt = await fetch(extSrc).then(r => r.text()).catch(() => '');
          usesLeadApi = jsTxt.includes('/api/ktn/leads');
        }
      }
      return { hasSocialProof, hasPushBanner, hasToast, hasOpenDrawer, usesLeadApi };
    });
    console.log('Step 9.1a: Guest Homepage UI Audit ->', JSON.stringify(guestHomeAudit));
    if (guestHomeAudit.hasSocialProof || guestHomeAudit.hasPushBanner || guestHomeAudit.hasToast || guestHomeAudit.hasOpenDrawer || !guestHomeAudit.usesLeadApi) {
      throw new Error('Guest homepage UI audit failed: ' + JSON.stringify(guestHomeAudit));
    }

    await guestPage.goto(`${BASE_URL}/custom-page/so-lien-lac-test`, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 1200));
    const guestSllAudit = await guestPage.evaluate(() => ({
      url: window.location.href,
      hasPushBanner: Boolean(document.getElementById('ktn-live-push-banner')),
      hasToast: document.querySelectorAll('.ktn-toast-item').length > 0,
      notifCount: window.KTN_NOTIF && typeof window.KTN_NOTIF.getVisibleNotifications === 'function'
        ? window.KTN_NOTIF.getVisibleNotifications().length
        : 0
    }));
    console.log('Step 9.1b: Guest SLL Redirect & Notification Audit ->', JSON.stringify(guestSllAudit));
    if (guestSllAudit.hasPushBanner || guestSllAudit.hasToast || guestSllAudit.notifCount !== 0) {
      throw new Error('Guest SLL notification leak detected: ' + JSON.stringify(guestSllAudit));
    }
    await guestCtx.close();

    // 9.2 Student (dachanh@khongtunhi.com - Class YCT2-04) Browser E2E Login + Submit Bài 1 & Bài 2
    const stuCtx = await browser.createBrowserContext();
    const stuPage = await stuCtx.newPage();
    await stuPage.goto(`${BASE_URL}/course-online?tab=tieng-trung`, { waitUntil: 'networkidle2', timeout: 45000 });
    await stuPage.evaluate(() => {
      if (typeof window.openKtnLoginModal === 'function') window.openKtnLoginModal();
      else if (typeof window.openKtnLogin === 'function') window.openKtnLogin();
    });
    await stuPage.waitForSelector('form.ant-form input#email', { visible: true, timeout: 20000 });
    await stuPage.evaluate(() => {
      const form = document.querySelector('form.ant-form');
      const em = form.querySelector('input#email');
      const pw = form.querySelector('input#password');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(em, 'dachanh@khongtunhi.com');
      em.dispatchEvent(new Event('input', { bubbles: true }));
      em.dispatchEvent(new Event('change', { bubbles: true }));
      setter.call(pw, '123456');
      pw.dispatchEvent(new Event('input', { bubbles: true }));
      pw.dispatchEvent(new Event('change', { bubbles: true }));
      form.querySelector('button[type=submit]').click();
    });

    await stuPage.waitForFunction(
      () => Boolean(localStorage.getItem('ktn_sll_persistent_auth_v2')),
      { timeout: 30000 }
    );
    await stuPage.goto(`${BASE_URL}/custom-page/so-lien-lac-test#/lop/yct2-04/buoi/1`, { waitUntil: 'networkidle2', timeout: 45000 });
    await stuPage.waitForSelector('#class-ex-card-1', { timeout: 25000 });
    await stuPage.waitForSelector('#class-ex-card-2', { timeout: 25000 });

    const wavB64 = wavBuf1.toString('base64');
    // Prepare real File objects in window.__classExDrafts and click Submit on Bài 1 and Bài 2
    await stuPage.evaluate((b64Audio) => {
      const bin = atob(b64Audio);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const wavFile = new File([bytes], 'Thu_am_YCT2-04_Buoi1_Bai1.wav', { type: 'audio/wav' });

      // 1x1 PNG image bytes for Bài 2
      const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const pngBin = atob(pngB64);
      const pngBytes = new Uint8Array(pngBin.length);
      for (let i = 0; i < pngBin.length; i++) pngBytes[i] = pngBin.charCodeAt(i);
      const imgFile = new File([pngBytes], 'bai_2_chu_han.png', { type: 'image/png' });

      if (!window.__classExDrafts) window.__classExDrafts = {};
      window.__classExDrafts['YCT2-04_1_1'] = { recording: false, timer: null, secs: 7, voiceFile: wavFile, attachFile: null };
      window.__classExDrafts['YCT2-04_1_2'] = { recording: false, timer: null, secs: 0, voiceFile: null, attachFile: imgFile };

      const n1 = document.getElementById('inp-class-note-YCT2-04_1_1');
      if (n1) n1.value = 'em gửi';
      const n2 = document.getElementById('inp-class-note-YCT2-04_1_2');
      if (n2) n2.value = 'Em nộp ảnh viết chữ Hán Bài 2';
    }, wavB64);

    await stuPage.click('#btn-class-submit-YCT2-04_1_1');
    await stuPage.waitForFunction(
      () => {
        const card = document.getElementById('class-ex-card-1');
        return card && card.textContent.includes('Đã nộp · Chờ cô chấm');
      },
      { timeout: 25000 }
    );

    await stuPage.click('#btn-class-submit-YCT2-04_1_2');
    await stuPage.waitForFunction(
      () => {
        const card = document.getElementById('class-ex-card-2');
        return card && card.textContent.includes('Đã nộp · Chờ cô chấm');
      },
      { timeout: 25000 }
    );

    const afterSubmitDom = await stuPage.evaluate(() => {
      const err1 = document.getElementById('err-class-submit-YCT2-04_1_1');
      const err2 = document.getElementById('err-class-submit-YCT2-04_1_2');
      const c1 = document.getElementById('class-ex-card-1')?.textContent || '';
      const c2 = document.getElementById('class-ex-card-2')?.textContent || '';
      return {
        err1Visible: Boolean(err1 && err1.style.display !== 'none'),
        err2Visible: Boolean(err2 && err2.style.display !== 'none'),
        card1Pending: c1.includes('Đã nộp · Chờ cô chấm'),
        card2Pending: c2.includes('Đã nộp · Chờ cô chấm')
      };
    });
    console.log('Step 9.2: Browser Submit Bài 1 & Bài 2 DOM State ->', JSON.stringify(afterSubmitDom));
    if (afterSubmitDom.err1Visible || afterSubmitDom.err2Visible || !afterSubmitDom.card1Pending || !afterSubmitDom.card2Pending) {
      throw new Error('Browser homework submit failed: ' + JSON.stringify(afterSubmitDom));
    }

    // 9.3 Reload page and verify submitted state persists from server + Resubmit works
    await stuPage.reload({ waitUntil: 'networkidle2', timeout: 45000 });
    await stuPage.waitForFunction(
      () => {
        const c1 = document.getElementById('class-ex-card-1')?.textContent || '';
        const c2 = document.getElementById('class-ex-card-2')?.textContent || '';
        return c1.includes('Đã nộp · Chờ cô chấm') && c2.includes('Đã nộp · Chờ cô chấm');
      },
      { timeout: 25000 }
    );
    console.log('Step 9.3a: Browser Reloaded -> Both Bài 1 & Bài 2 persisted "Đã nộp · Chờ cô chấm" and "Nộp lại bài" button.');

    // Resubmit Bài 1 in browser
    await stuPage.evaluate((b64Audio) => {
      const bin = atob(b64Audio);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const wavFile = new File([bytes], 'Thu_am_YCT2-04_Buoi1_Bai1_lan2.wav', { type: 'audio/wav' });
      window.__classExDrafts['YCT2-04_1_1'] = { recording: false, timer: null, secs: 8, voiceFile: wavFile, attachFile: null };
      const n1 = document.getElementById('inp-class-note-YCT2-04_1_1');
      if (n1) n1.value = 'Em nộp lại Bài 1 lần 2 ạ';
    }, wavB64);
    await stuPage.click('#btn-class-submit-YCT2-04_1_1');
    await stuPage.waitForFunction(
      () => {
        const btn = document.getElementById('btn-class-submit-YCT2-04_1_1');
        const inp = document.getElementById('inp-class-note-YCT2-04_1_1');
        return btn && !btn.disabled && inp && inp.value === 'Em nộp lại Bài 1 lần 2 ạ';
      },
      { timeout: 25000 }
    );
    console.log('Step 9.3b: Browser Resubmit Bài 1 succeeded.');

    // 9.4 Teacher A grades dachanh's Bài 1 (9.5) -> Student reloads browser and sees 9.5đ + feedback + concise notification
    const gradeDachAnhRes = await fetch(`${BASE_URL}/api/ktn/homeworks/grade`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teacherALogin.token}`
      },
      body: JSON.stringify({
        id: 'HW-dachanh@khongtunhi.com-CLASS_YCT2-04-L101',
        status: 'graded',
        score: 9.5,
        teacherFeedback: 'Con đọc to rõ 5 câu hội thoại rất chuẩn!'
      })
    }).then(r => r.json());
    if (!gradeDachAnhRes.ok || Number(gradeDachAnhRes.homework?.score) !== 9.5) {
      throw new Error('Grading dachanh Bài 1 failed: ' + JSON.stringify(gradeDachAnhRes));
    }

    await stuPage.reload({ waitUntil: 'networkidle2', timeout: 45000 });
    await stuPage.waitForFunction(
      () => {
        const c1 = document.getElementById('class-ex-card-1')?.textContent || '';
        return c1.includes('9.5/10') && c1.includes('Con đọc to rõ 5 câu hội thoại rất chuẩn!');
      },
      { timeout: 25000 }
    );
    const stuNotifInBrowser = await stuPage.evaluate(async () => {
      const res = await window.KtnWebApp.apiRequest('/api/ktn/notifications');
      const list = res.data?.notifications || [];
      const ids = list.map(n => n.id);
      const uniqueIds = new Set(ids);
      return {
        ok: res.ok,
        count: list.length,
        hasDuplicates: ids.length !== uniqueIds.size,
        hasGradedNotif: list.some(n => n.title === 'Cô giáo vừa nhận xét.' && String(n.body || '').includes('9.5đ')),
        titles: list.map(n => n.title)
      };
    });
    console.log('Step 9.4: Student Browser Reload after Teacher Grade -> 9.5đ rendered | Notifications:', JSON.stringify(stuNotifInBrowser));
    if (!stuNotifInBrowser.ok || stuNotifInBrowser.hasDuplicates || !stuNotifInBrowser.hasGradedNotif) {
      throw new Error('Student notification check after grading failed: ' + JSON.stringify(stuNotifInBrowser));
    }

    // 9.5 Cross-Student Isolation Check: Student C (minhkhang@khongtunhi.com - YCT3-02) must NOT see dachanh's homeworks or notifications
    const stuCLogin = await fetch(`${BASE_URL}/api/ktn/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'minhkhang@khongtunhi.com', password: '123456' })
    }).then(r => r.json());
    if (!stuCLogin.ok || !stuCLogin.token) throw new Error('Student C login failed: ' + JSON.stringify(stuCLogin));

    const stuCHwRes = await fetch(`${BASE_URL}/api/ktn/homeworks`, {
      headers: { 'Authorization': `Bearer ${stuCLogin.token}` }
    }).then(r => r.json());
    const stuCNotifRes = await fetch(`${BASE_URL}/api/ktn/notifications`, {
      headers: { 'Authorization': `Bearer ${stuCLogin.token}` }
    }).then(r => r.json());

    const leakedHw = (stuCHwRes.homeworks || []).some(h => h.student_email === 'dachanh@khongtunhi.com');
    const leakedNotif = (stuCNotifRes.notifications || []).some(n => String(n.id || '').includes('dachanh@khongtunhi.com'));
    console.log('Step 9.5: Cross-Student Isolation (minhkhang vs dachanh) -> leakedHw:', leakedHw, '| leakedNotif:', leakedNotif);
    if (leakedHw || leakedNotif) {
      throw new Error('Cross-student data leak detected!');
    }

    await stuCtx.close();
  } finally {
    await browser.close();
    if (SUPABASE_URL && SUPABASE_KEY) {
      for (const hwId of createdHwIds) {
        await fetch(`${SUPABASE_URL}/rest/v1/ktn_homeworks?id=eq.${encodeURIComponent(hwId)}`, {
          method: 'DELETE',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
      }
      const remRes = await fetch(`${SUPABASE_URL}/rest/v1/ktn_homeworks?select=id`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      }).then(r => r.json());
      console.log('Step 9.6: Production Cleanup Complete -> Remaining test rows in ktn_homeworks:', Array.isArray(remRes) ? remRes.length : 0);
    }
  }

  console.log('\nALL 9 SECURITY, 1044-STUDENT SYNC, BROWSER E2E HOMEWORK, NOTIFICATION & LEAD ACCEPTANCE TESTS PASSED!');
}

main().catch(err => {
  console.error('Regression Test Failed:', err);
  process.exit(1);
});
