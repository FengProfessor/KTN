/**
 * KHỔNG TỬ NHÍ — KIỂM THỬ HỒI QUY BẢO MẬT & LUỒNG E2E HỌC SINH <-> GIÁO VIÊN
 * Chạy: node verify_security_and_flow.cjs
 *
 * Yêu cầu biến môi trường trong .env (không hardcode mật khẩu trong mã nguồn):
 *   KTN_E2E_PASSWORD / KTN_STAFF_AND_TEST_PASSWORD
 *   IZTEACH_ADMIN_EMAIL / IZTEACH_ADMIN_PASSWORD
 *   KTN_E2E_STUDENT_A_EMAIL (mặc định: e2e.hs.a@khongtunhi.com - Lớp YCT2-04)
 *   KTN_E2E_STUDENT_B_EMAIL (mặc định: e2e.hs.b@khongtunhi.com - Lớp YCT3-02)
 */
const fs = require('fs');
const os = require('os');
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
const E2E_PASSWORD = process.env.KTN_E2E_PASSWORD || env.KTN_E2E_PASSWORD || process.env.KTN_STAFF_AND_TEST_PASSWORD || env.KTN_STAFF_AND_TEST_PASSWORD || '';
const ADMIN_EMAIL = process.env.IZTEACH_ADMIN_EMAIL || env.IZTEACH_ADMIN_EMAIL || 'hocvienkhongtunhi123@gmail.com';
const ADMIN_PASSWORD = process.env.KTN_ADMIN_PASSWORD || env.KTN_ADMIN_PASSWORD || E2E_PASSWORD;
const STUDENT_A_EMAIL = process.env.KTN_E2E_STUDENT_A_EMAIL || env.KTN_E2E_STUDENT_A_EMAIL || 'e2e.hs.a@khongtunhi.com';
const STUDENT_B_EMAIL = process.env.KTN_E2E_STUDENT_B_EMAIL || env.KTN_E2E_STUDENT_B_EMAIL || 'e2e.hs.b@khongtunhi.com';
const TEACHER_A_EMAIL = process.env.KTN_E2E_TEACHER_A_EMAIL || env.KTN_E2E_TEACHER_A_EMAIL || 'linh.lam@khongtunhi.com';
const TEACHER_B_EMAIL = process.env.KTN_E2E_TEACHER_B_EMAIL || env.KTN_E2E_TEACHER_B_EMAIL || 'thu.ha@khongtunhi.com';
const LEGACY_REVOKED_PWD = ['123', '456'].join('');

if (!E2E_PASSWORD || !ADMIN_PASSWORD) {
  console.error('Missing KTN_E2E_PASSWORD or IZTEACH_ADMIN_PASSWORD in .env');
  process.exit(1);
}

async function main() {
  let gitCommit = 'unknown';
  try {
    gitCommit = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim();
  } catch {}
  console.log(`Target Base URL: ${BASE_URL} | Git Commit: ${gitCommit}`);
  console.log(`Isolated E2E Accounts: StudentA=${STUDENT_A_EMAIL} (YCT2-04) | StudentB=${STUDENT_B_EMAIL} (YCT3-02)`);

  console.log('\n=== [TEST 1] Forged Token + Admin Email Header Must Return 401 ===');
  const forgedSessionRes = await fetch(`${BASE_URL}/api/ktn/auth/session`, {
    headers: {
      'Authorization': 'Bearer forged.token.invalid_sig_abc',
      'X-KTN-User-Email': ADMIN_EMAIL
    }
  });
  console.log('GET /api/ktn/auth/session with forged token + admin email -> status:', forgedSessionRes.status);
  if (forgedSessionRes.status !== 401) {
    throw new Error(`Expected 401 for forged token on /api/ktn/auth/session, got ${forgedSessionRes.status}`);
  }

  const forgedCompressed = zlib.deflateSync(Buffer.from(JSON.stringify({
    email: ADMIN_EMAIL,
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
      'Authorization': 'Bearer forged.token.invalid_sig_abc',
      'X-KTN-User-Email': ADMIN_EMAIL
    }
  });
  console.log('GET /api/ktn/orders with forged token + admin email -> status:', forgedOrdersRes.status);
  if (forgedOrdersRes.status !== 401 && forgedOrdersRes.status !== 403) {
    throw new Error(`Expected 401/403 for forged token on /api/ktn/orders, got ${forgedOrdersRes.status}`);
  }

  console.log('\n=== [TEST 2] Revoked Legacy Password Must Return 401 Across Admin, Teachers & Students ===');
  for (const targetEmail of [
    ADMIN_EMAIL,
    'quanly@khongtunhi.com',
    TEACHER_A_EMAIL,
    TEACHER_B_EMAIL,
    'hoangngan@khongtunhi.com',
    'dachanh@khongtunhi.com',
    'minhkhang@khongtunhi.com',
    STUDENT_A_EMAIL,
    STUDENT_B_EMAIL
  ]) {
    const res = await fetch(`${BASE_URL}/api/ktn/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail, password: LEGACY_REVOKED_PWD })
    });
    console.log(`POST /api/ktn/auth/login (${targetEmail} + revoked legacy password) -> status:`, res.status);
    if (res.status !== 401) {
      throw new Error(`Expected 401 for ${targetEmail} with revoked legacy password, got ${res.status}`);
    }
  }

  console.log('\n=== [TEST 3] Class & Chat Room Authorization (Messages, Class-Sessions, Homeworks, Push Subscribe) ===');
  const stuALogin = await fetch(`${BASE_URL}/api/ktn/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: STUDENT_A_EMAIL, password: E2E_PASSWORD })
  }).then(r => r.json());
  if (!stuALogin.ok || !stuALogin.token) throw new Error('Student A login failed: ' + JSON.stringify(stuALogin));
  if (stuALogin.session?.izteachAccessToken || stuALogin.session?.accessToken) {
    throw new Error('Login response leaked raw izteachAccessToken/accessToken in session payload!');
  }
  console.log(`Student A (${STUDENT_A_EMAIL} - ${stuALogin.session.classCode}) login OK | No raw izteachAccessToken leaked`);

  const stuBLogin = await fetch(`${BASE_URL}/api/ktn/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: STUDENT_B_EMAIL, password: E2E_PASSWORD })
  }).then(r => r.json());
  if (!stuBLogin.ok || !stuBLogin.token) throw new Error('Student B login failed: ' + JSON.stringify(stuBLogin));
  console.log(`Student B (${STUDENT_B_EMAIL} - ${stuBLogin.session.classCode}) login OK`);

  const teacherALogin = await fetch(`${BASE_URL}/api/ktn/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEACHER_A_EMAIL, password: E2E_PASSWORD })
  }).then(r => r.json());
  if (!teacherALogin.ok || !teacherALogin.token) throw new Error('Teacher A login failed: ' + JSON.stringify(teacherALogin));
  console.log('Teacher A (Cô Linh - YCT2-04) login OK -> role:', teacherALogin.session.role);

  const teacherBLogin = await fetch(`${BASE_URL}/api/ktn/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEACHER_B_EMAIL, password: E2E_PASSWORD })
  }).then(r => r.json());
  if (!teacherBLogin.ok || !teacherBLogin.token) throw new Error('Teacher B login failed: ' + JSON.stringify(teacherBLogin));
  console.log('Teacher B (Cô Hà - YCT3-02) login OK -> role:', teacherBLogin.session.role);

  // 3a. /api/ktn/messages roomId & cross-class isolation
  const msgMissingRoom = await fetch(`${BASE_URL}/api/ktn/messages`, {
    headers: { 'Authorization': `Bearer ${stuALogin.token}` }
  });
  console.log('Student A GET /api/ktn/messages (no roomId) -> status:', msgMissingRoom.status);
  if (msgMissingRoom.status !== 400) {
    throw new Error(`Expected 400 when GET /api/ktn/messages has no roomId, got ${msgMissingRoom.status}`);
  }

  const stuAGetMsgB = await fetch(`${BASE_URL}/api/ktn/messages?roomId=YCT3-02`, {
    headers: { 'Authorization': `Bearer ${stuALogin.token}` }
  });
  console.log('Student A (YCT2-04) GET /api/ktn/messages?roomId=YCT3-02 -> status:', stuAGetMsgB.status);
  if (stuAGetMsgB.status !== 403) {
    throw new Error(`Expected 403 when Student A reads Class B messages, got ${stuAGetMsgB.status}`);
  }

  const stuAPostMsgB = await fetch(`${BASE_URL}/api/ktn/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${stuALogin.token}`
    },
    body: JSON.stringify({ roomId: 'YCT3-02', content: 'Cross-class message spoof attempt' })
  });
  console.log('Student A (YCT2-04) POST /api/ktn/messages (roomId=YCT3-02) -> status:', stuAPostMsgB.status);
  if (stuAPostMsgB.status !== 403) {
    throw new Error(`Expected 403 when Student A posts to Class B chat room, got ${stuAPostMsgB.status}`);
  }

  const tbGetMsgA = await fetch(`${BASE_URL}/api/ktn/messages?roomId=YCT2-04`, {
    headers: { 'Authorization': `Bearer ${teacherBLogin.token}` }
  });
  console.log('Teacher B (YCT3-02) GET /api/ktn/messages?roomId=YCT2-04 -> status:', tbGetMsgA.status);
  if (tbGetMsgA.status !== 403) {
    throw new Error(`Expected 403 when Teacher B reads Class A messages, got ${tbGetMsgA.status}`);
  }

  const stuAGetOwnMsg = await fetch(`${BASE_URL}/api/ktn/messages?roomId=YCT2-04`, {
    headers: { 'Authorization': `Bearer ${stuALogin.token}` }
  });
  console.log('Student A (YCT2-04) GET /api/ktn/messages?roomId=YCT2-04 -> status:', stuAGetOwnMsg.status);
  if (stuAGetOwnMsg.status !== 200) {
    throw new Error(`Expected 200 when Student A reads own class messages, got ${stuAGetOwnMsg.status}`);
  }

  // 3b. /api/ktn/class-sessions auth & class isolation
  const unauthSessions = await fetch(`${BASE_URL}/api/ktn/class-sessions?classCode=YCT2-04`);
  console.log('Unauthenticated GET /api/ktn/class-sessions -> status:', unauthSessions.status);
  if (unauthSessions.status !== 401) {
    throw new Error(`Expected 401 for unauthenticated /api/ktn/class-sessions, got ${unauthSessions.status}`);
  }

  const stuAGetSessionsB = await fetch(`${BASE_URL}/api/ktn/class-sessions?classCode=YCT3-02`, {
    headers: { 'Authorization': `Bearer ${stuALogin.token}` }
  });
  console.log('Student A (YCT2-04) GET /api/ktn/class-sessions?classCode=YCT3-02 -> status:', stuAGetSessionsB.status);
  if (stuAGetSessionsB.status !== 403) {
    throw new Error(`Expected 403 when Student A opens Class B sessions, got ${stuAGetSessionsB.status}`);
  }

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

  // 3c. /api/ktn/push/subscribe requires authentication
  const unauthPushSub = await fetch(`${BASE_URL}/api/ktn/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userEmail: ADMIN_EMAIL,
      userRole: 'admin',
      subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/fake-endpoint-123' }
    })
  });
  console.log('Unauthenticated POST /api/ktn/push/subscribe -> status:', unauthPushSub.status);
  if (unauthPushSub.status !== 401) {
    throw new Error(`Expected 401 for unauthenticated /api/ktn/push/subscribe, got ${unauthPushSub.status}`);
  }

  console.log('\n=== [TEST 4] Homework Ownership, Class Enrollment, fileUrl Domain & Score Validation Guards ===');
  const wavBuf1 = createValidWavBuffer(1, 440);
  const upRes = await fetch(`${BASE_URL}/api/ktn/homeworks/upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${stuALogin.token}`
    },
    body: JSON.stringify({ fileName: 'e2e-bai-1-lan-1.wav', fileType: 'audio/wav' })
  }).then(r => r.json());
  if (!upRes.ok || !upRes.signedUrl || !upRes.fileUrl) throw new Error('S3 upload-url failed: ' + JSON.stringify(upRes));

  const s3Put1 = await fetch(upRes.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'audio/wav' },
    body: wavBuf1
  });
  console.log('S3 PUT recording #1 status:', s3Put1.status, '| bytes:', wavBuf1.length);
  if (!s3Put1.ok && s3Put1.status !== 204) {
    throw new Error(`Expected S3 PUT recording #1 to succeed, got ${s3Put1.status}`);
  }

  // 4a. Student A tries to pass an ID belonging to Student B
  const spoofIdRes = await fetch(`${BASE_URL}/api/ktn/homeworks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${stuALogin.token}`
    },
    body: JSON.stringify({
      id: `HW-${STUDENT_B_EMAIL}-CLASS_YCT2-04-L101`,
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
      'Authorization': `Bearer ${stuALogin.token}`
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

  // 4c. Student A tries to submit an external arbitrary fileUrl -> Must return 400
  const badUrlRes = await fetch(`${BASE_URL}/api/ktn/homeworks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${stuALogin.token}`
    },
    body: JSON.stringify({
      courseId: 'CLASS_YCT2-04',
      classCode: 'YCT2-04',
      lessonNum: 101,
      lessonTitle: 'Buổi 1 · Bài 1',
      fileType: 'audio/wav',
      fileUrl: 'https://evil.example.com/malware.wav'
    })
  });
  console.log('Student A POST /api/ktn/homeworks with external fileUrl -> status:', badUrlRes.status);
  if (badUrlRes.status !== 400) {
    throw new Error(`Expected 400 for external fileUrl, got ${badUrlRes.status}`);
  }

  // 4d. Student A tries to submit invalid lessonNum (99999) -> Must return 400
  const badLessonRes = await fetch(`${BASE_URL}/api/ktn/homeworks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${stuALogin.token}`
    },
    body: JSON.stringify({
      courseId: 'CLASS_YCT2-04',
      classCode: 'YCT2-04',
      lessonNum: 99999,
      lessonTitle: 'Buổi 999 · Bài 99',
      fileType: 'audio/wav',
      fileUrl: upRes.fileUrl
    })
  });
  console.log('Student A POST /api/ktn/homeworks with invalid lessonNum 99999 -> status:', badLessonRes.status);
  if (badLessonRes.status !== 400) {
    throw new Error(`Expected 400 for invalid lessonNum 99999, got ${badLessonRes.status}`);
  }

  console.log('\n=== [TEST 5] Real S3 Audio Upload + API Flow + Score Range Check + CloudFront Playback ===');
  const testLessonNum = 901;
  const expectedServerHwId = `HW-${STUDENT_A_EMAIL}-CLASS_YCT2-04-L${testLessonNum}`;

  const sub1 = await fetch(`${BASE_URL}/api/ktn/homeworks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${stuALogin.token}`
    },
    body: JSON.stringify({
      courseId: 'CLASS_YCT2-04',
      classCode: 'YCT2-04',
      lessonNum: testLessonNum,
      lessonTitle: '[Lớp YCT2-04 · Buổi 9] Bài 1',
      fileType: 'audio/wav',
      fileUrl: upRes.fileUrl,
      studentNote: 'Con nộp bài thu âm lần 1 ạ',
      attachments: [{ title: 'e2e-bai-1-lan-1.wav', fileUrl: upRes.fileUrl, cdnUrl: upRes.fileUrl, mediaType: 'audio/wav', size: wavBuf1.length }]
    })
  }).then(r => r.json());
  if (!sub1.ok || sub1.homework?.id !== expectedServerHwId || sub1.homework?.status !== 'pending') {
    throw new Error('Submit #1 failed or wrong server-derived ID: ' + JSON.stringify(sub1));
  }
  console.log('Step 5.1a: Server derived canonical ID ->', sub1.homework.id, '| status:', sub1.homework.status);

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
  console.log('Step 5.2a: Teacher B PATCH /api/ktn/homeworks/grade on Class A homework -> status:', tbGradeRes.status);
  if (tbGradeRes.status !== 403) {
    throw new Error(`Expected 403 when Teacher B grades Class A homework, got ${tbGradeRes.status}`);
  }

  // 5.2b Teacher A sends out-of-range score (15 or 9.3) -> MUST be rejected with 400
  for (const invalidScore of [15, -1, 9.3]) {
    const badScoreRes = await fetch(`${BASE_URL}/api/ktn/homeworks/grade`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teacherALogin.token}`
      },
      body: JSON.stringify({
        id: expectedServerHwId,
        status: 'graded',
        score: invalidScore,
        teacherFeedback: 'Điểm không hợp lệ'
      })
    });
    console.log(`Step 5.2b: Teacher A PATCH /api/ktn/homeworks/grade with invalid score=${invalidScore} -> status:`, badScoreRes.status);
    if (badScoreRes.status !== 400) {
      throw new Error(`Expected 400 for invalid score=${invalidScore}, got ${badScoreRes.status}`);
    }
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

  // 5.4 Student A uploads a NEW real WAV recording (#2) to S3 and resubmits -> status resets to 'pending'
  const wavBuf2 = createValidWavBuffer(2, 660);
  const upRes2 = await fetch(`${BASE_URL}/api/ktn/homeworks/upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${stuALogin.token}`
    },
    body: JSON.stringify({ fileName: 'e2e-bai-1-lan-2.wav', fileType: 'audio/wav' })
  }).then(r => r.json());
  if (!upRes2.ok || !upRes2.signedUrl || !upRes2.fileUrl) throw new Error('S3 upload-url #2 failed: ' + JSON.stringify(upRes2));

  const s3Put2 = await fetch(upRes2.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'audio/wav' },
    body: wavBuf2
  });
  if (!s3Put2.ok && s3Put2.status !== 204) {
    throw new Error(`Expected S3 PUT recording #2 to succeed, got ${s3Put2.status}`);
  }

  const sub2 = await fetch(`${BASE_URL}/api/ktn/homeworks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${stuALogin.token}`
    },
    body: JSON.stringify({
      courseId: 'CLASS_YCT2-04',
      classCode: 'YCT2-04',
      lessonNum: testLessonNum,
      lessonTitle: '[Lớp YCT2-04 · Buổi 9] Bài 1',
      fileType: 'audio/wav',
      fileUrl: upRes2.fileUrl,
      studentNote: 'Con đã sửa thanh 3 và nộp lại bài ạ',
      attachments: [{ title: 'e2e-bai-1-lan-2.wav', fileUrl: upRes2.fileUrl, cdnUrl: upRes2.fileUrl, mediaType: 'audio/wav', size: wavBuf2.length }]
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
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    console.log('Cleanup DELETE test row status:', delRes.status);
  }

  console.log('\n=== [TEST 6] Server-Side Session Revocation on Logout + Unified Client Logout ===');
  const tempLogin = await fetch(`${BASE_URL}/api/ktn/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: STUDENT_B_EMAIL, password: E2E_PASSWORD })
  }).then(r => r.json());
  if (!tempLogin.ok || !tempLogin.token) throw new Error('Temp login for logout revocation test failed');

  const preLogoutCheck = await fetch(`${BASE_URL}/api/ktn/auth/session`, {
    headers: { 'Authorization': `Bearer ${tempLogin.token}` }
  });
  console.log('GET /api/ktn/auth/session BEFORE logout -> status:', preLogoutCheck.status);
  if (preLogoutCheck.status !== 200) {
    throw new Error(`Expected 200 before logout, got ${preLogoutCheck.status}`);
  }

  const logoutRes = await fetch(`${BASE_URL}/api/ktn/auth/logout`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tempLogin.token}` }
  });
  const logoutCookie = logoutRes.headers.get('set-cookie') || '';
  const logoutBody = await logoutRes.json();
  console.log('POST /api/ktn/auth/logout -> status:', logoutRes.status, '| revoked:', logoutBody.revoked, '| Set-Cookie:', logoutCookie);
  if (logoutRes.status !== 200 || !logoutBody.ok || !logoutBody.revoked || !logoutCookie.includes('ktn_webapp_token=;') || !logoutCookie.includes('Max-Age=0')) {
    throw new Error(`Logout endpoint verification failed: status=${logoutRes.status} body=${JSON.stringify(logoutBody)}`);
  }

  const postLogoutCheck = await fetch(`${BASE_URL}/api/ktn/auth/session`, {
    headers: { 'Authorization': `Bearer ${tempLogin.token}` }
  });
  console.log('GET /api/ktn/auth/session AFTER logout with revoked Bearer token -> status:', postLogoutCheck.status);
  if (postLogoutCheck.status !== 401) {
    throw new Error(`Expected 401 when reusing logged-out Bearer token, got ${postLogoutCheck.status}`);
  }

  console.log('\n=== [TEST 7] Full Student Bulk Sync (Unbounded Pagination + Real Diff Idempotency) + Online Course Homework ===');
  const adminLogin = await fetch(`${BASE_URL}/api/ktn/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
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
    syncAllRes2.createdCount !== 0 ||
    syncAllRes2.updatedCount !== 0 ||
    syncAllRes2.unchangedCount !== syncAllRes2.izteachTotal ||
    syncAllRes2.idempotent !== true
  ) {
    throw new Error('Bulk sync #2 real diff idempotency check failed: ' + JSON.stringify(syncAllRes2));
  }

  for (const lNum of [1, 2]) {
    const onlineSub = await fetch(`${BASE_URL}/api/ktn/homeworks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stuALogin.token}`
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

  console.log('\n=== [TEST 8] Zero Synthetic Notifications ("Đã đến giờ học." / "Cần nộp bài tập.") & Admin-Only Lead TestMode ===');
  const unauthNotif = await fetch(`${BASE_URL}/api/ktn/notifications`);
  console.log('Unauthenticated GET /api/ktn/notifications -> status:', unauthNotif.status);
  if (unauthNotif.status !== 401) {
    throw new Error(`Expected 401 for unauthenticated /api/ktn/notifications, got ${unauthNotif.status}`);
  }

  const stuNotifRes = await fetch(`${BASE_URL}/api/ktn/notifications`, {
    headers: { 'Authorization': `Bearer ${stuALogin.token}` }
  });
  const stuNotifJson = await stuNotifRes.json();
  const forbiddenSynthetic = (stuNotifJson.notifications || []).filter(
    n => n.title === 'Đã đến giờ học.' || n.title === 'Cần nộp bài tập.'
  );
  console.log('Student A GET /api/ktn/notifications -> status:', stuNotifRes.status, '| count:', (stuNotifJson.notifications || []).length, '| forbiddenSynthetic:', forbiddenSynthetic.length);
  if (stuNotifRes.status !== 200 || !stuNotifJson.ok || forbiddenSynthetic.length > 0) {
    throw new Error('Synthetic notifications still present: ' + JSON.stringify(forbiddenSynthetic));
  }

  // Unauthenticated caller trying to use testMode on /api/ktn/leads -> Must return 403
  const unauthTestLead = await fetch(`${BASE_URL}/api/ktn/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-KTN-Test-Mode': '1' },
    body: JSON.stringify({
      name: 'Khách giả mạo TestMode',
      phone: '0988974685',
      childAge: 'Tiểu học (7–11t)',
      testMode: true
    })
  });
  console.log('Unauthenticated POST /api/ktn/leads (testMode=true) -> status:', unauthTestLead.status);
  if (unauthTestLead.status !== 403) {
    throw new Error(`Expected 403 for unauthenticated testMode lead, got ${unauthTestLead.status}`);
  }

  // Admin-authenticated testMode lead -> Must return 200 without writing spam to production DB
  const adminTestLead = await fetch(`${BASE_URL}/api/ktn/leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminLogin.token}`,
      'X-KTN-Test-Mode': '1'
    },
    body: JSON.stringify({
      name: 'Admin Kiểm thử E2E',
      phone: '0988974685',
      childAge: 'Tiểu học (7–11t)',
      testMode: true
    })
  });
  const leadJson = await adminTestLead.json();
  console.log('Admin POST /api/ktn/leads (testMode=true) -> status:', adminTestLead.status, '| body:', JSON.stringify(leadJson));
  if (adminTestLead.status !== 200 || !leadJson.ok || !leadJson.testMode) {
    throw new Error('Admin POST /api/ktn/leads testMode failed: ' + JSON.stringify(leadJson));
  }

  console.log('\n=== [TEST 9] Real Browser (Puppeteer) E2E: Fake MediaStream Mic Recording + <input type=file> Upload + Teacher UI Grading ===');
  const tmpPngPath = path.join(os.tmpdir(), 'ktn_e2e_bai2_chu_han.png');
  fs.writeFileSync(
    tmpPngPath,
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
  );

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream'
    ]
  });

  const createdHwIds = [
    `HW-${STUDENT_A_EMAIL}-CLASS_YCT2-04-L101`,
    `HW-${STUDENT_A_EMAIL}-CLASS_YCT2-04-L102`
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

    // 9.2 Isolated Student A (e2e.hs.a@khongtunhi.com - Class YCT2-04) Browser Login + Real MediaRecorder Mic + Real <input type=file>
    const stuCtx = await browser.createBrowserContext();
    const stuPage = await stuCtx.newPage();
    await stuPage.goto(`${BASE_URL}/course-online?tab=tieng-trung`, { waitUntil: 'networkidle2', timeout: 45000 });
    await stuPage.evaluate(() => {
      if (typeof window.openKtnLoginModal === 'function') window.openKtnLoginModal();
      else if (typeof window.openKtnLogin === 'function') window.openKtnLogin();
    });
    await stuPage.waitForSelector('form.ant-form input#email', { visible: true, timeout: 20000 });
    await stuPage.evaluate((emailVal, pwdVal) => {
      const form = document.querySelector('form.ant-form');
      const em = form.querySelector('input#email');
      const pw = form.querySelector('input#password');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(em, emailVal);
      em.dispatchEvent(new Event('input', { bubbles: true }));
      em.dispatchEvent(new Event('change', { bubbles: true }));
      setter.call(pw, pwdVal);
      pw.dispatchEvent(new Event('input', { bubbles: true }));
      pw.dispatchEvent(new Event('change', { bubbles: true }));
      form.querySelector('button[type=submit]').click();
    }, STUDENT_A_EMAIL, E2E_PASSWORD);

    await stuPage.waitForFunction(
      () => Boolean(localStorage.getItem('ktn_sll_persistent_auth_v2')),
      { timeout: 30000 }
    );
    await stuPage.goto(`${BASE_URL}/custom-page/so-lien-lac-test#/lop/yct2-04/buoi/1`, { waitUntil: 'networkidle2', timeout: 45000 });
    await stuPage.waitForSelector('#class-ex-card-1', { timeout: 25000 });
    await stuPage.waitForSelector('#class-ex-card-2', { timeout: 25000 });

    // Record real audio via navigator.mediaDevices.getUserMedia + MediaRecorder on Bài 1
    await stuPage.click('#btn-class-mic-YCT2-04_1_1');
    await stuPage.waitForFunction(
      () => {
        const lbl = document.getElementById('lbl-class-mic-YCT2-04_1_1');
        return lbl && lbl.textContent.includes('Dừng thu');
      },
      { timeout: 10000 }
    );
    await new Promise(r => setTimeout(r, 1600));
    await stuPage.click('#btn-class-mic-YCT2-04_1_1');
    await stuPage.waitForFunction(
      () => {
        const fileLbl = document.getElementById('lbl-class-file-YCT2-04_1_1');
        return fileLbl && fileLbl.textContent.includes('Đã thu xong');
      },
      { timeout: 10000 }
    );
    console.log('Step 9.2a: Real getUserMedia + MediaRecorder recorded audio in browser for Bài 1.');

    // Upload real PNG file via <input type="file"> on Bài 2
    const fileInput2 = await stuPage.$('#class-ex-card-2 input[type="file"]');
    if (!fileInput2) throw new Error('Could not find <input type="file"> in #class-ex-card-2');
    await fileInput2.uploadFile(tmpPngPath);
    await stuPage.waitForFunction(
      () => {
        const fileLbl = document.getElementById('lbl-class-file-YCT2-04_1_2');
        return fileLbl && fileLbl.textContent.includes('Đã chọn:');
      },
      { timeout: 10000 }
    );
    console.log('Step 9.2b: Real <input type="file"> uploaded PNG image in browser for Bài 2.');

    await stuPage.evaluate(() => {
      const n1 = document.getElementById('inp-class-note-YCT2-04_1_1');
      if (n1) n1.value = 'Con thu âm trực tiếp trên trình duyệt Bài 1 ạ';
      const n2 = document.getElementById('inp-class-note-YCT2-04_1_2');
      if (n2) n2.value = 'Con tải ảnh viết chữ Hán Bài 2 ạ';
    });

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
    console.log('Step 9.2c: Browser Submit Bài 1 & Bài 2 both transitioned to "Đã nộp · Chờ cô chấm".');

    // 9.3 Reload student page and verify persistence + zero synthetic notifications in UI
    await stuPage.reload({ waitUntil: 'networkidle2', timeout: 45000 });
    await stuPage.waitForFunction(
      () => {
        const c1 = document.getElementById('class-ex-card-1')?.textContent || '';
        const c2 = document.getElementById('class-ex-card-2')?.textContent || '';
        return c1.includes('Đã nộp · Chờ cô chấm') && c2.includes('Đã nộp · Chờ cô chấm');
      },
      { timeout: 25000 }
    );
    console.log('Step 9.3: Student Browser Reloaded -> Both Bài 1 & Bài 2 persisted "Đã nộp · Chờ cô chấm".');

    // 9.4 Teacher A (linh.lam@khongtunhi.com) opens /sll-teacher.html in Browser and grades Student A's Bài 1 via Teacher UI!
    const teacherCtx = await browser.createBrowserContext();
    const teacherPage = await teacherCtx.newPage();
    teacherPage.on('dialog', async dialog => {
      await dialog.accept();
    });
    await teacherPage.goto(`${BASE_URL}/course-online?tab=tieng-trung`, { waitUntil: 'networkidle2', timeout: 45000 });
    await teacherPage.evaluate((emailVal, tokenVal, sessionObj) => {
      if (window.KtnWebApp && typeof window.KtnWebApp.saveSession === 'function') {
        return window.KtnWebApp.saveSession({ ...sessionObj, email: emailVal, token: tokenVal }, tokenVal);
      }
      localStorage.setItem('ktn_sll_persistent_auth_v2', JSON.stringify({ ...sessionObj, email: emailVal, token: tokenVal }));
    }, TEACHER_A_EMAIL, teacherALogin.token, teacherALogin.session);

    await teacherPage.goto(`${BASE_URL}/sll-teacher.html`, { waitUntil: 'networkidle2', timeout: 45000 });
    const targetHwId = `HW-${STUDENT_A_EMAIL}-CLASS_YCT2-04-L101`;
    const safeDomId = targetHwId.replace(/[^a-zA-Z0-9_-]/g, '_');
    await teacherPage.waitForSelector(`#score-${safeDomId}`, { timeout: 25000 });
    await teacherPage.evaluate((sId) => {
      const scoreEl = document.getElementById('score-' + sId);
      const fbEl = document.getElementById('fb-' + sId);
      if (scoreEl) scoreEl.value = '9.5';
      if (fbEl) fbEl.value = 'Con đọc to rõ 5 câu hội thoại rất chuẩn! Cô khen con trên giao diện giáo viên.';
      const card = scoreEl.closest('.hw-item');
      const gradeBtn = card.querySelector('button.btn-red');
      gradeBtn.click();
    }, safeDomId);

    await teacherPage.waitForFunction(
      (hwId) => {
        const card = document.querySelector(`.hw-item[data-hw-id="${hwId}"]`);
        return card && card.textContent.includes('Đã hoàn thành · 9.5/10');
      },
      { timeout: 25000 },
      targetHwId
    );
    console.log('Step 9.4a: Teacher A graded Student A Bài 1 directly on /sll-teacher.html UI -> "Đã hoàn thành · 9.5/10".');
    await teacherCtx.close();

    // 9.4b Student A reloads browser and verifies 9.5/10 + feedback + concise notification (and zero synthetic notifications)
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
      const uiList = window.KTN_NOTIF && typeof window.KTN_NOTIF.getVisibleNotifications === 'function'
        ? window.KTN_NOTIF.getVisibleNotifications()
        : [];
      const ids = list.map(n => n.id);
      const uniqueIds = new Set(ids);
      const hasSyntheticApi = list.some(n => n.title === 'Đã đến giờ học.' || n.title === 'Cần nộp bài tập.');
      const hasSyntheticUi = uiList.some(n => n.title === 'Đã đến giờ học.' || n.title === 'Cần nộp bài tập.');
      return {
        ok: res.ok,
        count: list.length,
        hasDuplicates: ids.length !== uniqueIds.size,
        hasGradedNotif: list.some(n => n.title === 'Cô giáo vừa nhận xét.' && String(n.body || '').includes('9.5đ')),
        hasSyntheticApi,
        hasSyntheticUi,
        titles: list.map(n => n.title)
      };
    });
    console.log('Step 9.4b: Student Browser Reload after Teacher UI Grade -> 9.5đ rendered | Notifications:', JSON.stringify(stuNotifInBrowser));
    if (!stuNotifInBrowser.ok || stuNotifInBrowser.hasDuplicates || !stuNotifInBrowser.hasGradedNotif || stuNotifInBrowser.hasSyntheticApi || stuNotifInBrowser.hasSyntheticUi) {
      throw new Error('Student notification check after grading failed: ' + JSON.stringify(stuNotifInBrowser));
    }

    // 9.5 Cross-Student Isolation Check: Student B (e2e.hs.b@khongtunhi.com - YCT3-02) must NOT see Student A's homeworks or notifications
    const stuBHwRes = await fetch(`${BASE_URL}/api/ktn/homeworks`, {
      headers: { 'Authorization': `Bearer ${stuBLogin.token}` }
    }).then(r => r.json());
    const stuBNotifRes = await fetch(`${BASE_URL}/api/ktn/notifications`, {
      headers: { 'Authorization': `Bearer ${stuBLogin.token}` }
    }).then(r => r.json());

    const leakedHw = (stuBHwRes.homeworks || []).some(h => h.student_email === STUDENT_A_EMAIL);
    const leakedNotif = (stuBNotifRes.notifications || []).some(n => String(n.id || '').includes(STUDENT_A_EMAIL));
    console.log(`Step 9.5: Cross-Student Isolation (${STUDENT_B_EMAIL} vs ${STUDENT_A_EMAIL}) -> leakedHw:`, leakedHw, '| leakedNotif:', leakedNotif);
    if (leakedHw || leakedNotif) {
      throw new Error('Cross-student data leak detected!');
    }

    await stuCtx.close();
  } finally {
    await browser.close();
    try { fs.unlinkSync(tmpPngPath); } catch {}
    if (SUPABASE_URL && SUPABASE_KEY) {
      for (const hwId of createdHwIds) {
        await fetch(`${SUPABASE_URL}/rest/v1/ktn_homeworks?id=eq.${encodeURIComponent(hwId)}`, {
          method: 'DELETE',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
      }
      const remRes = await fetch(`${SUPABASE_URL}/rest/v1/ktn_homeworks?student_email=in.(${encodeURIComponent(STUDENT_A_EMAIL)},${encodeURIComponent(STUDENT_B_EMAIL)})&select=id`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      }).then(r => r.json());
      console.log('Step 9.6: Isolated E2E Cleanup Complete -> Remaining E2E test rows in ktn_homeworks:', Array.isArray(remRes) ? remRes.length : 0);
    }
  }

  console.log('\nALL 9 SECURITY, REVOKED-PASSWORD, CHAT-AUTH, LOGOUT-REVOCATION, 1044-STUDENT DIFF-SYNC & BROWSER E2E TESTS PASSED!');
}

main().catch(err => {
  console.error('Regression Test Failed:', err);
  process.exit(1);
});
