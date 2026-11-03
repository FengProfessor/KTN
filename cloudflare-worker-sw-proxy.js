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
const DEFAULT_VAPID_PUBLIC_KEY = 'BFWxJ4T_sakVqTfRjAQOpN7RghDoQRo9owPWy_W1lvdoVYpqFdLJRmEOYgQEPPiEHpotoaixRt8oq2_R4VH8afM';
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
  contactLead: 'https://c9xi8h3a3d.execute-api.ap-southeast-1.amazonaws.com/prod/contact'
};

// ============================================================================
// DANH MỤC 9 KHÓA HỌC CHUẨN + GÓI COMBO 6 KHÓA TRÊN IZTEACH (MASTER CATALOG)
// ============================================================================
const MASTER_PRODUCT_MAPPING = {
  '6adadba969897b0002482ca5': {
    id: '6adadba969897b0002482ca5',
    code: 'HSK1-30',
    title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
    shortTitle: 'HSK1 3.0',
    badge: 'TIÊU CHUẨN MỚI 3.0',
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
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000
  },
  '6638bd09a7367400085c7ab2': {
    id: '6638bd09a7367400085c7ab2',
    code: 'KIDS-03',
    title: 'Tiếng Trung Trẻ Em 3 (Mini vỡ lòng 5 – 6 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em 3',
    badge: 'CẤP ĐỘ 03',
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
    lessonsCount: 18,
    price: 890000,
    oldPrice: 1500000
  },
  '67a7290a5fdc26000238b4e9': {
    id: '67a7290a5fdc26000238b4e9',
    code: 'KIDS-05',
    title: 'Tiếng Trung Trẻ Em 5 (Lộ trình 8 – 14 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em 5',
    badge: 'CẤP ĐỘ 05',
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
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000
  },
  '6983672f409cc20002e530b8': {
    id: '6983672f409cc20002e530b8',
    code: 'YCT-04',
    title: 'Khóa học Tiếng Trung Trẻ Em YCT 4',
    shortTitle: 'Tiếng Trung YCT 4',
    badge: 'CHỨNG CHỈ YCT 4',
    lessonsCount: 20,
    price: 1290000,
    oldPrice: 2000000
  },
  '65e76a533f5e7c00086715d7': {
    id: '65e76a533f5e7c00086715d7',
    code: 'PRON-01',
    title: 'Khóa học Phát Âm & Giao Tiếp Phản Xạ Cơ Bản',
    shortTitle: 'Phát Âm & Phản Xạ',
    badge: 'GIAO TIẾP PHẢN XẠ',
    lessonsCount: 19,
    price: 690000,
    oldPrice: 1200000
  },
  '67bebce067dba000027d8119': {
    id: '67bebce067dba000027d8119',
    code: 'HANZI-01',
    title: 'Khóa học Hán Tự Tư Duy & Luyện Viết Chữ Hán',
    shortTitle: 'Hán Tự Tư Duy',
    badge: 'HÁN TỰ TƯ DUY',
    lessonsCount: 20,
    price: 690000,
    oldPrice: 1200000
  },
  'BUNDLE_YCT_ALL': {
    id: 'BUNDLE_YCT_ALL',
    code: 'COMBO-6',
    title: 'Trọn Bộ 6 Khóa Học Trực Tuyến (Lộ trình 5 – 15 tuổi)',
    shortTitle: 'Trọn Bộ 6 Khóa',
    badge: 'COMBO ƯU ĐÃI 50%',
    isBundle: true,
    bundleCourseIds: [
      '6adadba969897b0002482ca5',
      '65e7704a9ea90c00080d5195',
      '6638bd09a7367400085c7ab2',
      '678d14b960eae20002ddf8fe',
      '67a7290a5fdc26000238b4e9',
      '67a869302ecb9c000257d966'
    ],
    lessonsCount: 113,
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
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-KTN-Webhook-Secret',
  'Access-Control-Max-Age': '86400'
};

function buildSwScript(vapidPublicKey) {
  return `
const CDN_LOGO = '${CDN_LOGO}';
const VAPID_PUBLIC_KEY = '${vapidPublicKey || DEFAULT_VAPID_PUBLIC_KEY}';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch { payload = { title: 'Học Viện Khổng Tử Nhí', body: event.data ? event.data.text() : 'Bạn có thông báo mới!' }; }
  const notif = payload.notification || payload;
  const title = notif.title || 'Học Viện Khổng Tử Nhí';
  const options = {
    body: notif.body || 'Chạm để mở Sổ Liên Lạc Điện Tử.',
    icon: notif.icon || CDN_LOGO,
    badge: notif.badge || CDN_LOGO,
    tag: notif.id || ('ktn-push-' + Date.now()),
    renotify: true,
    data: { url: notif.action_url || '/sll-hocsinh.html', id: notif.id || '' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    }).then((newSub) => {
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach((c) => c.postMessage({ type: 'KTN_PUSH_SUBSCRIPTION_CHANGED', subscription: newSub.toJSON() }));
      });
    }).catch(() => {})
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'KTN_SHOW_NOTIFICATION') {
    event.waitUntil(self.registration.showNotification(data.title || 'Học Viện Khổng Tử Nhí', {
      body: data.body || '',
      icon: CDN_LOGO,
      badge: CDN_LOGO,
      tag: (data.data && data.data.id) || ('ktn-local-' + Date.now()),
      data: { url: (data.data && data.data.action_url) || '/sll-hocsinh.html' }
    }));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/sll-hocsinh.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'KTN_NOTIFICATION_CLICKED', data: event.notification.data });
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
`.trim();
}

const MANIFEST_JSON = JSON.stringify({
  name: 'Sổ Liên Lạc Điện Tử — Học Viện Khổng Tử Nhí',
  short_name: 'Khổng Tử Nhí',
  description: 'Sổ liên lạc điện tử & Cổng học tập trực tuyến Học Viện Khổng Tử Nhí',
  start_url: '/?source=pwa',
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
    'hatt': 'thu.ha@khongtunhi.com',
    'coha': 'thu.ha@khongtunhi.com',
    'admin': 'hocvienkhongtunhi123@gmail.com',
    'quanly': 'quanly@khongtunhi.com',
    'taphong2002': 'taphong2002@gmail.com'
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
  const data = {
    ...payload,
    iat: Date.now(),
    exp: Date.now() + 365 * 86400 * 1000
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
  const [bodyB64, sigB64] = token.split('.');
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

async function extractSessionFromRequest(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const tok = authHeader.slice(7).trim();
    const verified = await verifySessionToken(tok, env.KTN_SESSION_SECRET);
    if (verified) return verified;
    return null;
  }
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)ktn_webapp_token=([^;]+)/);
  if (match && match[1]) {
    const verified = await verifySessionToken(decodeURIComponent(match[1]), env.KTN_SESSION_SECRET);
    if (verified) return verified;
  }
  return null;
}

async function getTeacherAssignedClassCodes(env, teacherEmail) {
  const email = normalizeEmail(teacherEmail || '');
  if (!email) return [];
  const res = await supabaseRequest(
    env,
    `ktn_classes?teacher_email=eq.${encodeURIComponent(email)}&active=eq.true&select=id`
  );
  if (!res.ok || !Array.isArray(res.data)) return [];
  return res.data
    .map(c => String(c?.id || '').trim().toUpperCase())
    .filter(Boolean);
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
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
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
  const phoneRegex = /(?:\+?84|0)(?:3|5|7|8|9)\d{8}\b/;
  const linkRegex = /\b(?:zalo\.me|fb\.com|facebook\.com|t\.me)\b/i;
  if (phoneRegex.test(s.replace(/[\s.-]/g, ''))) {
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

async function provisionStudentOnIzTeach(env, order) {
  const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
  const adminToken = await getIzTeachAdminToken(env);
  if (!adminToken) {
    return { ok: false, error: 'Chưa cấu hình mật khẩu IZTEACH_ADMIN_PASSWORD trong Cloudflare Worker Secret.' };
  }

  const email = normalizeEmail(order.student_email || order.studentEmail || order.email);
  const name = String(order.student_name || order.studentName || order.name || email.split('@')[0]).trim();
  const phone = String(order.phone || '').replace(/\D/g, '') || ('09' + Math.floor(10000000 + Math.random() * 90000000));
  const targetCourseIds = resolveOrderCourseIds(order);
  const defaultPassB64 = btoa('123456');

  let cognitoUserId = order.cognito_user_id || order.cognitoUserId || null;
  let izteachStudentId = order.izteach_student_id || order.izteachStudentId || null;

  // Tầng 1: Tra cứu học viên hiện có trên izTeach CRM
  if (!isValidCognitoUuid(cognitoUserId)) {
    cognitoUserId = null;
    try {
      const qRes = await fetch(`${IZTEACH_ENDPOINTS.studentCrm}?vendorId=${encodeURIComponent(vendorId)}&email=${encodeURIComponent(email)}`, {
        headers: { Authorization: adminToken }
      });
      if (qRes.ok) {
        const qData = await qRes.json().catch(() => null);
        const list = Array.isArray(qData?.data) ? qData.data : (Array.isArray(qData) ? qData : []);
        const found = list.find(u => String(u.email || '').toLowerCase() === email);
        if (found) {
          izteachStudentId = found.id || found._id || null;
          if (isValidCognitoUuid(found.userId)) cognitoUserId = found.userId;
          else if (isValidCognitoUuid(found.id)) cognitoUserId = found.id;
        }
      }
    } catch {}
  }

  // Tầng 2: Tạo mới học viên trên izTeach nếu chưa có
  if (!cognitoUserId) {
    try {
      const createRes = await fetch(IZTEACH_ENDPOINTS.studentCrm, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: adminToken },
        body: JSON.stringify({
          vendorId,
          name,
          email,
          phone,
          password: defaultPassB64,
          status: 'verified'
        })
      });
      const cData = await createRes.json().catch(() => null);
      if (cData) {
        izteachStudentId = cData.id || cData._id || izteachStudentId;
        if (isValidCognitoUuid(cData.userId)) cognitoUserId = cData.userId;
        else if (isValidCognitoUuid(cData.id)) cognitoUserId = cData.id;
      }
    } catch {}
  }

  // Tầng 3: Sign-in Probe để lấy chính xác Cognito UUID
  if (!cognitoUserId) {
    try {
      const siRes = await fetch(IZTEACH_ENDPOINTS.studentSignin, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: defaultPassB64, vendorId })
      });
      const siData = await siRes.json().catch(() => null);
      if (siData) {
        if (isValidCognitoUuid(siData.id)) cognitoUserId = siData.id;
        else if (isValidCognitoUuid(siData.userId)) cognitoUserId = siData.userId;
        izteachStudentId = siData.studentId || izteachStudentId;
      }
    } catch {}
  }

  if (!cognitoUserId) {
    return { ok: false, error: 'Không lấy được Cognito UUID từ izTeach cho email ' + email };
  }

  // Tầng 3.5: Đọc các khóa học hiện có của học viên trên izTeach để cộng dồn (không ghi đè khóa cũ)
  let existingIzCourseIds = [];
  try {
    const permRes = await fetch(`${IZTEACH_ENDPOINTS.userPermission}?userId=${encodeURIComponent(cognitoUserId)}&vendorId=${encodeURIComponent(vendorId)}`, {
      headers: { Authorization: adminToken }
    });
    if (permRes.ok) {
      const permData = await permRes.json().catch(() => null);
      if (Array.isArray(permData?.onlineCourses)) {
        existingIzCourseIds = permData.onlineCourses
          .map(c => String(c?.id || c?._id || c?.onlineCourseId || c?.productId || c || '').trim())
          .filter(Boolean);
      }
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
        return { ok: false, error: 'Lỗi cấp quyền khóa học izTeach: ' + errTxt };
      }
    }
  }

  const allGrantedIds = Array.from(new Set([...existingIzCourseIds, ...targetCourseIds]));
  return {
    ok: true,
    cognitoUserId,
    izteachStudentId,
    email,
    name,
    courseId: targetCourseIds[0] || DEFAULT_COURSE_ID,
    grantedCourseIds: targetCourseIds,
    allCourseIds: allGrantedIds
  };
}

async function mergeAndUpsertStudentCourses(env, { email, name, phone, cognitoUserId, izteachStudentId, addCourseIds = [], removeCourseIds = [], replaceCourseIds = null, classCode = undefined, codeHint = '' }) {
  const cleanEmail = normalizeEmail(email);
  const nowIso = new Date().toISOString();

  // Tra cứu hồ sơ học viên hiện có trong Supabase ktn_students
  let existingRow = null;
  const stuLookup = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(cleanEmail)}&limit=1`);
  if (stuLookup.ok && Array.isArray(stuLookup.data) && stuLookup.data[0]) {
    existingRow = stuLookup.data[0];
  }

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

  const finalClassCode = classCode !== undefined ? (classCode || null) : (existingRow?.class_code || null);
  const studentCode = existingRow?.code || codeHint || ('KTN-' + Date.now().toString().slice(-6));
  const payload = {
    code: studentCode,
    email: cleanEmail,
    name: name || existingRow?.name || cleanEmail.split('@')[0],
    phone: phone || existingRow?.phone || '',
    cognito_user_id: cognitoUserId || existingRow?.cognito_user_id || null,
    izteach_student_id: izteachStudentId || existingRow?.izteach_student_id || null,
    class_code: finalClassCode,
    has_live_class: Boolean(finalClassCode),
    has_online_courses: onlineCoursesJson.length > 0,
    online_courses: onlineCoursesJson,
    updated_at: nowIso
  };

  const sbRes = await supabaseRequest(env, 'ktn_students', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: payload
  });
  const saved = (Array.isArray(sbRes.data) && sbRes.data[0]) || payload;
  return {
    ...saved,
    studentCase: computeStudentCase(saved)
  };
}

export default {
  // ==========================================================================
  // 1. HẸN GIỜ TỰ ĐỘNG MỖI 24H CHỐNG NGỦ ĐÔNG SUPABASE (CRON TRIGGER)
  // ==========================================================================
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      await supabaseRequest(env, 'ktn_payment_config?select=id&limit=1');
    })());
  },

  // ==========================================================================
  // 2. XỬ LÝ HTTP REQUEST & CỔNG API /api/ktn/*
  // ==========================================================================
  async fetch(request, env) {
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
      const cdnUrl = `https://d21acfi38wn3iy.cloudfront.net/resource/documents/${vendorId}/sofl-remake${path}`;
      const cdnRes = await fetch(cdnUrl, { cf: { cacheTtl: 60, cacheEverything: true } });
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
      const email = normalizeEmail(body.email || '');
      const password = String(body.password || '');
      if (!email || !password) {
        return jsonResponse({ ok: false, message: 'Vui lòng nhập đầy đủ Email và Mật khẩu.' }, 400);
      }

      const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
      const b64Password = btoa(unescape(encodeURIComponent(password)));
      const loginPayload = JSON.stringify({ email, password: b64Password, vendorId });

      const [staffProbe, stuProbe] = await Promise.allSettled([
        fetch(IZTEACH_ENDPOINTS.staffSignin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: loginPayload }).then(async r => ({ ok: r.ok, data: await r.json().catch(() => null) })),
        fetch(IZTEACH_ENDPOINTS.studentSignin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: loginPayload }).then(async r => ({ ok: r.ok, data: await r.json().catch(() => null) }))
      ]);

      const staffHit = staffProbe.status === 'fulfilled' && staffProbe.value.ok && staffProbe.value.data?.accessToken ? staffProbe.value.data : null;
      const stuHit = stuProbe.status === 'fulfilled' && stuProbe.value.ok && stuProbe.value.data?.accessToken ? stuProbe.value.data : null;

      const chosen = staffHit || stuHit;
      if (!chosen) {
        return jsonResponse({ ok: false, message: 'Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra lại.' }, 401);
      }

      // Chặn tuyệt đối việc dùng mật khẩu mặc định 123456 cho tài khoản Quản trị (Admin)
      const upstreamRoles = Array.isArray(chosen.roles) ? chosen.roles : [];
      const isAdminCandidate = Boolean(
        staffHit && (upstreamRoles.includes('root') || upstreamRoles.includes('admin') || email === 'hocvienkhongtunhi123@gmail.com' || email === 'quanly@khongtunhi.com')
      );
      if (isAdminCandidate && (password === '123456' || email === 'quanly@khongtunhi.com')) {
        return jsonResponse({ ok: false, message: 'Tài khoản Quản trị viên bắt buộc xác thực bằng mật khẩu bảo mật chính thức.' }, 401);
      }

      // Chỉ tra Supabase để lấy vai trò và hồ sơ SAU KHI đã xác minh danh tính thành công trên izTeach
      let sbTeacher = null;
      const tRes = await supabaseRequest(env, `ktn_teachers?email=eq.${encodeURIComponent(email)}&active=eq.true&limit=1`);
      if (tRes.ok && Array.isArray(tRes.data) && tRes.data.length > 0) {
        sbTeacher = tRes.data[0];
      }

      let role = 'student';
      if (isAdminCandidate && email === 'hocvienkhongtunhi123@gmail.com') {
        role = 'admin';
      } else if (upstreamRoles.includes('teacher') || chosen.type === 'teacher' || Boolean(sbTeacher)) {
        role = 'teacher';
      }

      // Nếu là học viên: đồng bộ danh sách khóa học thật từ Supabase ktn_students + izTeach
      let sbStudent = null;
      let onlineCourses = [];
      let classCode = null;
      if (role === 'student') {
        const sRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(email)}&limit=1`);
        if (sRes.ok && Array.isArray(sRes.data) && sRes.data[0]) {
          sbStudent = sRes.data[0];
          classCode = sbStudent.class_code || null;
          if (Array.isArray(sbStudent.online_courses)) {
            onlineCourses = sbStudent.online_courses;
          }
        }
        const cognitoUid = chosen.id || chosen.userId || sbStudent?.cognito_user_id;
        if (isValidCognitoUuid(cognitoUid) && chosen.accessToken) {
          try {
            const pRes = await fetch(`${IZTEACH_ENDPOINTS.userPermission}?userId=${encodeURIComponent(cognitoUid)}&vendorId=${encodeURIComponent(vendorId)}`, {
              headers: { Authorization: chosen.accessToken }
            });
            if (pRes.ok) {
              const pData = await pRes.json().catch(() => null);
              if (Array.isArray(pData?.onlineCourses) && pData.onlineCourses.length > 0) {
                const izIds = pData.onlineCourses
                  .map(c => String(c?.id || c?._id || c?.onlineCourseId || c?.productId || c || '').trim())
                  .filter(Boolean);
                const mergedSet = new Set([...onlineCourses.map(c => String(c?.id || c)), ...izIds]);
                onlineCourses = Array.from(mergedSet).map(cid => ({
                  id: cid,
                  title: MASTER_PRODUCT_MAPPING[cid]?.shortTitle || 'Khóa học trực tuyến'
                }));
              }
            }
          } catch {}
        }
      }

      const studentCase = role === 'student'
        ? computeStudentCase({ classCode, onlineCourses })
        : role;

      const sessionObj = {
        id: chosen.id || chosen.userId || sbStudent?.cognito_user_id || sbTeacher?.code || email,
        userId: chosen.id || chosen.userId || sbStudent?.cognito_user_id || email,
        studentId: chosen.studentId || sbStudent?.code || chosen.id || email,
        code: sbStudent?.code || sbTeacher?.code || undefined,
        email,
        name: sbTeacher?.name || sbStudent?.name || chosen.name || email.split('@')[0],
        role,
        roles: [role],
        classCode,
        hasLiveClass: Boolean(classCode),
        hasOnlineCourses: onlineCourses.length > 0,
        onlineCourses,
        studentCase,
        accessToken: role === 'admin' ? undefined : chosen.accessToken,
        izteachAccessToken: role === 'admin' ? undefined : chosen.accessToken
      };

      const signedToken = await signSessionToken(sessionObj, env.KTN_SESSION_SECRET);
      const redirectUrl = getRoleTargetPage(role);
      const cookieVal = encodeURIComponent(signedToken);

      return jsonResponse({
        ok: true,
        session: sessionObj,
        token: signedToken,
        redirectUrl
      }, 200, {
        'Set-Cookie': `ktn_webapp_token=${cookieVal}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
      });
    }

    // ------------------------------------------------------------------------
    // B. KIỂM TRA PHIÊN LÀM VIỆC & ĐĂNG XUẤT
    // ------------------------------------------------------------------------
    if (path === '/api/ktn/auth/session' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, authenticated: false }, 401);
      }
      return jsonResponse({
        ok: true,
        authenticated: true,
        session,
        redirectUrl: getRoleTargetPage(session.role || session.roles?.[0] || 'student')
      });
    }

    if (path === '/api/ktn/auth/logout' && request.method === 'POST') {
      return jsonResponse({ ok: true }, 200, {
        'Set-Cookie': 'ktn_webapp_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'
      });
    }

    // ------------------------------------------------------------------------
    // B2. QUẢN LÝ DANH MỤC KHÓA HỌC & ĐỒNG BỘ KHÓA HỌC MỚI TỪ IZTEACH
    // ------------------------------------------------------------------------
    if (path === '/api/ktn/courses' && request.method === 'GET') {
      const sbRes = await supabaseRequest(env, 'ktn_courses?active=eq.true&order=sort_order.asc');
      const dbCourses = Array.isArray(sbRes.data) ? sbRes.data : [];
      const catalogMap = { ...MASTER_PRODUCT_MAPPING };
      dbCourses.forEach(c => {
        if (!c || !c.course_id) return;
        catalogMap[c.course_id] = {
          ...(catalogMap[c.course_id] || {}),
          id: c.course_id,
          code: c.code || 'COURSE',
          title: c.title,
          shortTitle: c.short_title || c.title,
          badge: c.badge || 'KHÓA HỌC CHUẨN',
          ageGroup: c.age_group || '5 – 15 tuổi',
          lessonsCount: Number(c.lessons_count) || 20,
          price: Number(c.price) || 890000,
          oldPrice: Number(c.old_price) || 1500000,
          thumb: c.thumb_url || undefined,
          isBundle: Boolean(c.is_bundle),
          bundleCourseIds: Array.isArray(c.bundle_course_ids) ? c.bundle_course_ids : []
        };
      });
      return jsonResponse({
        ok: true,
        courses: Object.values(catalogMap),
        catalogMap
      });
    }

    if (path === '/api/ktn/courses/units' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập để tải danh sách bài học.' }, 401);
      }
      const courseId = String(url.searchParams.get('courseId') || DEFAULT_COURSE_ID).trim();
      const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
      const tokenToUse = session.izteachAccessToken || session.accessToken || (await getIzTeachAdminToken(env));
      if (!tokenToUse) {
        return jsonResponse({ ok: false, message: 'Chưa có token truy cập bài giảng izTeach.' }, 503);
      }
      const unitRes = await fetch(`${IZTEACH_ENDPOINTS.courseUnits}?course=${encodeURIComponent(courseId)}&vendorId=${encodeURIComponent(vendorId)}`, {
        headers: { Authorization: tokenToUse }
      });
      const units = await unitRes.json().catch(() => []);
      return jsonResponse({
        ok: unitRes.ok,
        courseId,
        units: Array.isArray(units) ? units : []
      }, unitRes.ok ? 200 : unitRes.status);
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
        await supabaseRequest(env, 'ktn_courses', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: newCourseRow
        });
        syncedCourses.push(newCourseRow);
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
              if (!cid) continue;
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
              await supabaseRequest(env, 'ktn_courses', {
                method: 'POST',
                prefer: 'resolution=merge-duplicates,return=representation',
                body: row
              });
              syncedCourses.push(row);
            }
          }
        } catch {}
      }

      // Luôn đảm bảo 9 khóa chuẩn + 1 gói Combo có mặt trong ktn_courses
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
          synced_from_izteach_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        await supabaseRequest(env, 'ktn_courses', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: baseRow
        });
      }

      const finalRes = await supabaseRequest(env, 'ktn_courses?active=eq.true&order=sort_order.asc');
      return jsonResponse({
        ok: true,
        syncedCount: syncedCourses.length,
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
      const stu = (Array.isArray(sbRes.data) && sbRes.data[0]) || {
        code: session.code || session.studentId || session.id,
        email: session.email,
        name: session.name,
        class_code: session.classCode || null,
        has_live_class: Boolean(session.classCode),
        has_online_courses: Array.isArray(session.onlineCourses) && session.onlineCourses.length > 0,
        online_courses: session.onlineCourses || []
      };
      return jsonResponse({
        ok: true,
        student: {
          ...stu,
          studentCase: computeStudentCase(stu)
        }
      });
    }

    if (path === '/api/ktn/students' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || (session.role !== 'admin' && session.role !== 'teacher')) {
        return jsonResponse({ ok: false, message: 'Chỉ Quản lý hoặc Giáo viên mới được xem danh sách học viên.' }, 403);
      }
      const classFilter = String(url.searchParams.get('classCode') || '').trim().toUpperCase();
      let query = 'ktn_students?select=*&order=updated_at.desc&limit=300';
      if (session.role === 'teacher') {
        const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
        if (classFilter) {
          if (!assignedClasses.includes(classFilter)) {
            return jsonResponse({ ok: false, message: 'Cô không phụ trách lớp ' + classFilter + ' nên không có quyền xem danh sách học viên của lớp này.' }, 403);
          }
          query = `ktn_students?class_code=eq.${encodeURIComponent(classFilter)}&order=updated_at.desc`;
        } else {
          if (assignedClasses.length === 0) {
            return jsonResponse({ ok: true, students: [] });
          }
          query = `ktn_students?class_code=in.(${assignedClasses.map(c => encodeURIComponent(c)).join(',')})&order=updated_at.desc`;
        }
      } else if (classFilter) {
        query = `ktn_students?class_code=eq.${encodeURIComponent(classFilter)}&order=updated_at.desc`;
      }
      const sbRes = await supabaseRequest(env, query);
      const list = (Array.isArray(sbRes.data) ? sbRes.data : []).map(s => ({
        ...s,
        studentCase: computeStudentCase(s)
      }));
      return jsonResponse({ ok: true, students: list });
    }

    if (path === '/api/ktn/students/courses' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || session.role !== 'admin') {
        return jsonResponse({ ok: false, message: 'Chỉ Quản lý (Admin) mới được cấp/thu hồi khóa học và xếp lớp.' }, 403);
      }
      const body = await request.json().catch(() => ({}));
      const email = normalizeEmail(body.email || body.studentEmail || '');
      if (!email) {
        return jsonResponse({ ok: false, message: 'Vui lòng nhập email học viên.' }, 400);
      }

      const action = String(body.action || 'grant').toLowerCase(); // 'grant' | 'revoke' | 'set'
      const rawCourseIds = Array.isArray(body.courseIds)
        ? body.courseIds
        : (body.courseId ? [body.courseId] : []);
      const resolvedIds = rawCourseIds.length > 0 ? resolveOrderCourseIds(rawCourseIds) : [];

      let cognitoUserId = body.cognitoUserId || null;
      let izteachStudentId = body.izteachStudentId || null;

      // Nếu cấp thêm khóa học (grant hoặc set có khóa học), tự động kích hoạt trên izTeach!
      if ((action === 'grant' || action === 'set') && resolvedIds.length > 0) {
        const prov = await provisionStudentOnIzTeach(env, {
          student_email: email,
          student_name: body.name || email.split('@')[0],
          phone: body.phone || '',
          courseIds: resolvedIds,
          cognito_user_id: cognitoUserId
        });
        if (prov.ok) {
          cognitoUserId = prov.cognitoUserId;
          izteachStudentId = prov.izteachStudentId;
        }
      }

      const updatedStudent = await mergeAndUpsertStudentCourses(env, {
        email,
        name: body.name,
        phone: body.phone,
        cognitoUserId,
        izteachStudentId,
        addCourseIds: action === 'grant' ? resolvedIds : [],
        removeCourseIds: action === 'revoke' ? resolvedIds : [],
        replaceCourseIds: action === 'set' ? resolvedIds : null,
        classCode: body.classCode !== undefined ? body.classCode : undefined
      });

      return jsonResponse({
        ok: true,
        student: updatedStudent,
        message: 'Đã cập nhật khóa học & lớp học cho học viên ' + email + ' thành công!'
      });
    }

    if (path === '/api/ktn/classes') {
      if (request.method === 'GET') {
        const sbRes = await supabaseRequest(env, 'ktn_classes?active=eq.true&order=id.asc');
        return jsonResponse({ ok: true, classes: sbRes.data || [] });
      }
      if (request.method === 'POST') {
        const session = await extractSessionFromRequest(request, env);
        if (!session || session.role !== 'admin') {
          return jsonResponse({ ok: false, message: 'Chỉ Admin mới được tạo/cập nhật lớp học.' }, 403);
        }
        const body = await request.json().catch(() => ({}));
        const classId = String(body.id || body.classCode || '').trim().toUpperCase();
        if (!classId) return jsonResponse({ ok: false, message: 'Vui lòng nhập mã lớp (VD: YCT2-04).' }, 400);
        const row = {
          id: classId,
          name: body.name || ('Lớp ' + classId),
          teacher_code: body.teacherCode || 'GV-KTN-08',
          teacher_email: body.teacherEmail || 'linh.lam@khongtunhi.com',
          schedule: body.schedule || '19:30 Thứ 3 & Thứ 6',
          total_lessons: Number(body.totalLessons) || 25,
          current_lesson: Number(body.currentLesson) || 1,
          active: true,
          updated_at: new Date().toISOString()
        };
        const sbRes = await supabaseRequest(env, 'ktn_classes', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: row
        });
        return jsonResponse({ ok: true, classItem: (Array.isArray(sbRes.data) && sbRes.data[0]) || row });
      }
    }

    // ------------------------------------------------------------------------
    // C. TIẾP NHẬN ĐƠN HÀNG TỪ TRANG CHỦ & DUYỆT ĐƠN 1 CHẠM (ORDERS)
    // ------------------------------------------------------------------------
    if (path === '/api/ktn/orders' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const cleanPhone = String(body.phone || '').replace(/\D/g, '');
      if (!body.studentName || !cleanPhone) {
        return jsonResponse({ ok: false, message: 'Vui lòng nhập Họ tên và Số điện thoại.' }, 400);
      }

      const orderRecord = {
        order_id: body.orderId || ('ORD-' + Date.now().toString().slice(-6)),
        student_name: String(body.studentName).trim(),
        student_email: normalizeEmail(body.studentEmail || `hv_${cleanPhone}@gmail.com`),
        phone: String(body.phone).trim(),
        course_id: body.courseId || DEFAULT_COURSE_ID,
        course_name: body.courseName || 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
        amount: Number(body.amount) || 890000,
        payment_method: body.paymentMethod || 'VietQR',
        payment_status: 'pending_verification', // Chuẩn sự thật: Chờ Sale gọi tư vấn / Kế toán xác nhận CK
        approval_status: 'pending',
        note: String(body.note || '')
      };

      const sbRes = await supabaseRequest(env, 'ktn_orders', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: orderRecord
      });

      return jsonResponse({
        ok: true,
        order: (Array.isArray(sbRes.data) && sbRes.data[0]) || orderRecord
      });
    }

    if (path === '/api/ktn/orders' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || session.role !== 'admin') {
        return jsonResponse({ ok: false, message: 'Chỉ Quản lý (Admin) mới được xem danh sách đơn hàng.' }, 403);
      }
      const sbRes = await supabaseRequest(env, 'ktn_orders?select=*&order=created_at.desc&limit=200');
      return jsonResponse({ ok: true, orders: sbRes.data || [] });
    }

    if (path === '/api/ktn/orders/approve' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || session.role !== 'admin') {
        return jsonResponse({ ok: false, message: 'Chỉ Quản lý (Admin) mới có quyền Duyệt đơn 1 chạm.' }, 403);
      }
      const body = await request.json().catch(() => ({}));
      const orderId = String(body.orderId || '').trim();
      if (!orderId) return jsonResponse({ ok: false, message: 'Thiếu mã đơn hàng orderId.' }, 400);

      // 1. Đọc thông tin đơn từ Supabase (hoặc từ payload truyền lên)
      let order = body.order || null;
      const ordLookup = await supabaseRequest(env, `ktn_orders?order_id=eq.${encodeURIComponent(orderId)}&limit=1`);
      if (ordLookup.ok && Array.isArray(ordLookup.data) && ordLookup.data[0]) {
        order = ordLookup.data[0];
      }
      if (!order) {
        return jsonResponse({ ok: false, message: 'Không tìm thấy đơn hàng ' + orderId }, 404);
      }

      // 2. Gọi sang izTeach bằng mật khẩu Admin trong két sắt Cloudflare (Hỗ trợ cộng dồn khóa mới & gói Combo 6 khóa!)
      const prov = await provisionStudentOnIzTeach(env, order);
      if (!prov.ok) {
        return jsonResponse({ ok: false, message: prov.error }, 502);
      }

      // 3. Cập nhật trạng thái đã duyệt lên Supabase ktn_orders & cộng dồn khóa học vào ktn_students
      const nowIso = new Date().toISOString();
      await supabaseRequest(env, `ktn_orders?order_id=eq.${encodeURIComponent(orderId)}`, {
        method: 'PATCH',
        body: {
          payment_status: 'paid',
          approval_status: 'approved',
          assigned_user_id: prov.cognitoUserId,
          assigned_student_id: prov.izteachStudentId,
          approved_at: nowIso,
          approved_by: session.email,
          updated_at: nowIso
        }
      });

      const studentCode = 'KTN-' + orderId.replace(/^ORD-/, '');
      const updatedStu = await mergeAndUpsertStudentCourses(env, {
        email: prov.email,
        name: prov.name,
        phone: order.phone || '',
        cognitoUserId: prov.cognitoUserId,
        izteachStudentId: prov.izteachStudentId,
        addCourseIds: prov.allCourseIds || prov.grantedCourseIds || [prov.courseId],
        classCode: body.classCode !== undefined ? body.classCode : undefined,
        codeHint: studentCode
      });

      return jsonResponse({
        ok: true,
        orderId,
        cognitoUserId: prov.cognitoUserId,
        studentEmail: prov.email,
        grantedCourseIds: prov.grantedCourseIds,
        allCourseIds: prov.allCourseIds,
        student: updatedStu,
        defaultPassword: '123456',
        message: `Đã duyệt đơn & kích hoạt cộng dồn ${prov.grantedCourseIds.length} khóa học trên izTeach thành công!`
      });
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
        const res = await supabaseRequest(env, 'ktn_payment_config?id=eq.default', {
          method: 'PATCH',
          body: {
            bank_id: body.bankId || 'MB',
            bank_name: body.bankName || 'MBBank',
            account_no: body.accountNo || '',
            account_name: body.accountName || 'HOC VIEN KHONG TU NHI',
            default_amount: Number(body.defaultAmount) || 890000,
            auto_approve_webhook: Boolean(body.autoApproveWebhook),
            course_prices: body.coursePrices || undefined,
            updated_at: new Date().toISOString(),
            updated_by: session.email
          }
        });
        return jsonResponse({ ok: true, config: (Array.isArray(res.data) && res.data[0]) || body });
      }
    }

    if (path === '/api/ktn/webhook/payment' && request.method === 'POST') {
      const secret = request.headers.get('X-KTN-Webhook-Secret') || '';
      if (!env.KTN_WEBHOOK_SECRET || secret !== env.KTN_WEBHOOK_SECRET) {
        return jsonResponse({ ok: false, message: 'Unauthorized webhook' }, 401);
      }
      const payload = await request.json().catch(() => ({}));
      const content = String(payload.content || payload.description || '');
      const ordMatch = content.match(/ORD-\d{6}/i);
      if (!ordMatch) {
        return jsonResponse({ ok: true, skipped: true, reason: 'Không tìm thấy mã đơn ORD-xxxxxx trong nội dung CK' });
      }
      const orderId = ordMatch[0].toUpperCase();
      const cfgRes = await supabaseRequest(env, 'ktn_payment_config?id=eq.default&limit=1');
      const autoApprove = Array.isArray(cfgRes.data) && cfgRes.data[0]?.auto_approve_webhook;

      await supabaseRequest(env, `ktn_orders?order_id=eq.${encodeURIComponent(orderId)}`, {
        method: 'PATCH',
        body: { payment_status: 'paid', updated_at: new Date().toISOString() }
      });

      if (autoApprove) {
        const ordLookup = await supabaseRequest(env, `ktn_orders?order_id=eq.${encodeURIComponent(orderId)}&limit=1`);
        const order = Array.isArray(ordLookup.data) ? ordLookup.data[0] : null;
        if (order && order.approval_status !== 'approved') {
          const prov = await provisionStudentOnIzTeach(env, order);
          if (prov.ok) {
            await supabaseRequest(env, `ktn_orders?order_id=eq.${encodeURIComponent(orderId)}`, {
              method: 'PATCH',
              body: {
                approval_status: 'approved',
                assigned_user_id: prov.cognitoUserId,
                assigned_student_id: prov.izteachStudentId,
                approved_at: new Date().toISOString(),
                approved_by: 'webhook:auto'
              }
            });
          }
        }
      }
      return jsonResponse({ ok: true, orderId, autoApproved: Boolean(autoApprove) });
    }

    // ------------------------------------------------------------------------
    // E. BÀI TẬP NỘP (FILE NẶNG LƯU S3 IZTEACH, ĐIỂM & LỜI PHÊ LƯU SUPABASE)
    // ------------------------------------------------------------------------
    if (path === '/api/ktn/homeworks/upload-url' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập để tải bài tập lên.' }, 401);
      const body = await request.json().catch(() => ({}));
      const rawName = String(body.fileName || `btvn_${Date.now()}.wav`);
      const cleanName = rawName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileType = String(body.fileType || 'audio/wav');
      const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
      const s3Key = `resource/homeworks/${vendorId}/${Date.now()}-${cleanName}`;
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

    if (path === '/api/ktn/homeworks' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);

      // Bảo mật PII & Phân quyền theo lớp:
      // - Học sinh chỉ lấy được đúng bài tập của chính mình
      // - Giáo viên chỉ lấy được bài tập của các lớp mình chủ nhiệm (trả 403 nếu mở lớp của GV khác)
      const reqClass = String(url.searchParams.get('classCode') || '').trim().toUpperCase();
      let query = 'ktn_homeworks?select=*&order=submitted_at.desc&limit=200';
      if (session.role === 'student') {
        query = `ktn_homeworks?student_email=eq.${encodeURIComponent(session.email)}&order=submitted_at.desc`;
      } else if (session.role === 'teacher') {
        const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
        if (reqClass) {
          if (!assignedClasses.includes(reqClass)) {
            return jsonResponse({
              ok: false,
              message: `Cô không phụ trách lớp ${reqClass} nên không có quyền xem bài tập của lớp này.`
            }, 403);
          }
          query = `ktn_homeworks?class_code=eq.${encodeURIComponent(reqClass)}&order=submitted_at.desc`;
        } else {
          if (assignedClasses.length === 0) {
            return jsonResponse({ ok: true, homeworks: [] });
          }
          query = `ktn_homeworks?class_code=in.(${assignedClasses.map(c => encodeURIComponent(c)).join(',')})&order=submitted_at.desc`;
        }
      } else if (reqClass) {
        query = `ktn_homeworks?class_code=eq.${encodeURIComponent(reqClass)}&order=submitted_at.desc`;
      }
      const sbRes = await supabaseRequest(env, query);
      if (!sbRes.ok) {
        return jsonResponse({ ok: false, message: 'Chưa tải được danh sách bài tập từ cơ sở dữ liệu.' }, sbRes.status || 503);
      }
      return jsonResponse({ ok: true, homeworks: sbRes.data || [] });
    }

    if (path === '/api/ktn/homeworks' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập để nộp bài.' }, 401);
      const body = await request.json().catch(() => ({}));
      const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];
      const firstAtt = rawAttachments.find(a => a && (a.fileUrl || a.cdnUrl || a.playUrl)) || null;
      const fileUrl = String(body.fileUrl || firstAtt?.fileUrl || firstAtt?.cdnUrl || firstAtt?.playUrl || '').trim();
      const fileType = String(body.fileType || firstAtt?.fileType || firstAtt?.mediaType || 'audio').trim();

      // Chặn triệt để lỗi nộp bài thiếu fileUrl thật hoặc tự nhét video mẫu!
      if (!fileUrl || !/^https?:\/\//i.test(fileUrl) || /hw_btvn_bai_1\.mp4|BTVN BAI 1\.mp4/i.test(fileUrl)) {
        return jsonResponse({ ok: false, message: 'Vui lòng thu âm hoặc chọn tệp bài làm thật (đã tải lên máy chủ) trước khi nộp bài!' }, 400);
      }

      const lessonNum = Number(body.lessonNum) || 1;
      const courseId = String(body.courseId || DEFAULT_COURSE_ID);
      const hwId = body.id || `HW-${session.email}-${courseId}-L${lessonNum}`;
      const normalizedAttachments = rawAttachments.length > 0
        ? rawAttachments.map(a => ({
            title: a.title || a.fileName || 'Bài nộp',
            fileUrl: a.fileUrl || a.cdnUrl || a.playUrl || fileUrl,
            cdnUrl: a.cdnUrl || a.fileUrl || a.playUrl || fileUrl,
            mediaType: a.mediaType || a.fileType || fileType,
            size: Number(a.size || a.fileSize || 0)
          }))
        : [{ title: 'Bài nộp của học sinh', fileUrl, cdnUrl: fileUrl, mediaType: fileType, size: 0 }];

      const hwRecord = {
        id: hwId,
        student_code: body.studentCode || session.id,
        student_email: session.email,
        student_name: body.studentName || session.name,
        class_code: body.classCode || null,
        course_id: courseId,
        lesson_num: lessonNum,
        lesson_title: String(body.lessonTitle || `Bài ${lessonNum}`),
        file_url: fileUrl,
        file_type: fileType,
        attachments: normalizedAttachments,
        workbook_answers: body.workbookAnswers || {},
        student_note: String(body.studentNote || ''),
        status: 'pending', // Mới nộp là pending (Chờ cô chấm)
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const sbRes = await supabaseRequest(env, 'ktn_homeworks', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: hwRecord
      });

      if (!sbRes.ok || !Array.isArray(sbRes.data) || sbRes.data.length === 0) {
        return jsonResponse({
          ok: false,
          message: 'Máy chủ chưa lưu được bản ghi bài nộp vào cơ sở dữ liệu. Em hãy bấm Gửi lại nhé.'
        }, sbRes.status || 500);
      }

      return jsonResponse({
        ok: true,
        homework: sbRes.data[0]
      });
    }

    if (path === '/api/ktn/homeworks/grade' && request.method === 'PATCH') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || (session.role !== 'teacher' && session.role !== 'admin')) {
        return jsonResponse({ ok: false, message: 'Chỉ Giáo viên hoặc Quản lý mới được chấm điểm bài tập.' }, 403);
      }
      const body = await request.json().catch(() => ({}));
      const hwId = String(body.id || '').trim();
      if (!hwId) return jsonResponse({ ok: false, message: 'Thiếu mã bài tập id.' }, 400);

      // Nếu là Giáo viên: kiểm tra bài tập này có thuộc lớp cô chủ nhiệm hay không (trả 403 nếu chấm lớp của GV khác)
      if (session.role === 'teacher') {
        const hwLookup = await supabaseRequest(env, `ktn_homeworks?id=eq.${encodeURIComponent(hwId)}&select=id,class_code&limit=1`);
        if (!hwLookup.ok) {
          return jsonResponse({ ok: false, message: 'Không thể kiểm tra thông tin bài nộp.' }, hwLookup.status || 500);
        }
        const existingHw = Array.isArray(hwLookup.data) ? hwLookup.data[0] : null;
        if (!existingHw) {
          return jsonResponse({ ok: false, message: 'Không tìm thấy bài nộp tương ứng trong cơ sở dữ liệu để cập nhật.' }, 404);
        }
        const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
        const hwClass = String(existingHw.class_code || '').trim().toUpperCase();
        if (!hwClass || !assignedClasses.includes(hwClass)) {
          return jsonResponse({
            ok: false,
            message: 'Cô không phụ trách lớp của bài nộp này nên không có quyền chấm điểm.'
          }, 403);
        }
      }

      // Thống nhất trạng thái với supabase_schema.sql: CHECK (status IN ('pending', 'graded', 'revision_requested'))
      const nextStatus = (body.status === 'revision_requested' || body.status === 'needs_revision')
        ? 'revision_requested'
        : 'graded';
      const patchPayload = {
        status: nextStatus,
        score: body.score !== undefined && body.score !== null && body.score !== '' ? Number(body.score) : null,
        teacher_feedback: String(body.teacherFeedback || ''),
        teacher_audio_url: String(body.teacherAudioUrl || ''),
        graded_by: session.email,
        graded_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Cập nhật trực tiếp trên bản ghi trong Supabase và bắt buộc xác nhận có bản ghi được cập nhật!
      const sbRes = await supabaseRequest(env, `ktn_homeworks?id=eq.${encodeURIComponent(hwId)}`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: patchPayload
      });

      if (!sbRes.ok) {
        return jsonResponse({
          ok: false,
          message: 'Không thể cập nhật trạng thái chấm bài trong cơ sở dữ liệu.'
        }, sbRes.status || 500);
      }

      if (!Array.isArray(sbRes.data) || sbRes.data.length === 0) {
        return jsonResponse({
          ok: false,
          message: 'Không tìm thấy bài nộp tương ứng trong cơ sở dữ liệu để cập nhật.'
        }, 404);
      }

      return jsonResponse({
        ok: true,
        homework: sbRes.data[0]
      });
    }

    // ------------------------------------------------------------------------
    // E2. BUỔI HỌC & BÀI TẬP THEO LỚP CÔ GIÁO (/api/ktn/class-sessions)
    // ------------------------------------------------------------------------
    if (path === '/api/ktn/class-sessions') {
      const defaultSessionsByClass = {
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

      if (request.method === 'GET') {
        const classCode = String(url.searchParams.get('classCode') || '').trim().toUpperCase();
        if (!classCode) {
          return jsonResponse({ ok: false, message: 'Thiếu mã lớp classCode.' }, 400);
        }

        const session = await extractSessionFromRequest(request, env);
        if (session && session.role === 'teacher') {
          const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
          if (!assignedClasses.includes(classCode)) {
            return jsonResponse({
              ok: false,
              message: `Cô không phụ trách lớp ${classCode} nên không có quyền truy cập buổi học của lớp này.`
            }, 403);
          }
        }

        const sbRes = await supabaseRequest(
          env,
          `ktn_class_sessions?class_code=eq.${encodeURIComponent(classCode)}&order=session_num.asc`
        );

        const dbRows = (sbRes.ok && Array.isArray(sbRes.data)) ? sbRes.data : [];
        const baseDefaults = Object.prototype.hasOwnProperty.call(defaultSessionsByClass, classCode)
          ? defaultSessionsByClass[classCode]
          : [];

        const mergedByNum = new Map();
        baseDefaults.forEach(item => {
          mergedByNum.set(Number(item.session_num || item.sessionNum), item);
        });
        dbRows.forEach(row => {
          const sNum = Number(row.session_num) || 1;
          mergedByNum.set(sNum, {
            id: row.id,
            classCode: row.class_code,
            session_num: sNum,
            sessionNum: sNum,
            session_title: row.session_title,
            title: row.session_title,
            exercises: Array.isArray(row.exercises) ? row.exercises : [],
            updatedBy: row.updated_by || null,
            updatedAt: row.updated_at || null
          });
        });

        const sessions = Array.from(mergedByNum.values()).sort(
          (a, b) => Number(a.session_num || a.sessionNum) - Number(b.session_num || b.sessionNum)
        );
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
        if (session.role === 'teacher') {
          const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
          if (!assignedClasses.includes(classCode)) {
            return jsonResponse({
              ok: false,
              message: `Cô không phụ trách lớp ${classCode} nên không có quyền sửa buổi học của lớp này.`
            }, 403);
          }
        }
        const sessionNum = Math.max(1, Number(body.sessionNum || body.session_num) || 1);
        const title = String(body.title || body.session_title || `Buổi ${sessionNum}`).trim();
        const exercises = Array.isArray(body.exercises) ? body.exercises : [];

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
          }
        });
      }
    }

    // ------------------------------------------------------------------------
    // F. CHAT LỚP HỌC (KÈM BỘ LỌC DLP) & ĐĂNG KÝ CHUÔNG THÔNG BÁO PWA
    // ------------------------------------------------------------------------
    if (path === '/api/ktn/messages' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      const roomId = url.searchParams.get('roomId') || '';
      const query = roomId
        ? `ktn_messages?room_id=eq.${encodeURIComponent(roomId)}&order=created_at.asc&limit=100`
        : 'ktn_messages?order=created_at.desc&limit=100';
      const sbRes = await supabaseRequest(env, query);
      return jsonResponse({ ok: true, messages: sbRes.data || [] });
    }

    if (path === '/api/ktn/messages' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      const body = await request.json().catch(() => ({}));
      const content = String(body.content || '').trim();
      const roomId = String(body.roomId || 'general').trim();
      if (!content) return jsonResponse({ ok: false, message: 'Nội dung tin nhắn trống.' }, 400);

      const dlp = inspectDlpContent(content);
      if (dlp.blocked) {
        await supabaseRequest(env, 'ktn_dlp_alerts', {
          method: 'POST',
          body: {
            id: 'DLP-' + Date.now(),
            room_id: roomId,
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
          message: 'Tin nhắn chứa SĐT hoặc liên kết ngoài luồng đã bị hệ thống bảo vệ DLP chặn.'
        }, 422);
      }

      const msgRecord = {
        id: body.id || ('MSG-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)),
        room_id: roomId,
        class_code: body.classCode || null,
        sender_email: session.email,
        sender_name: session.name,
        sender_role: session.role,
        content,
        attachment_url: String(body.attachmentUrl || '')
      };
      const sbRes = await supabaseRequest(env, 'ktn_messages', {
        method: 'POST',
        body: msgRecord
      });
      return jsonResponse({ ok: true, message: (Array.isArray(sbRes.data) && sbRes.data[0]) || msgRecord });
    }

    if (path === '/api/ktn/push/subscribe' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      const body = await request.json().catch(() => ({}));
      const sub = body.subscription || {};
      const keys = sub.keys || {};
      if (!sub.endpoint || !keys.p256dh || !keys.auth) {
        return jsonResponse({ ok: false, message: 'Dữ liệu PushSubscription không hợp lệ.' }, 400);
      }
      const userEmail = session?.email || normalizeEmail(body.email || '');
      const userRole = session?.role || body.role || 'student';
      await supabaseRequest(env, 'ktn_push_subscriptions', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: {
          user_email: userEmail,
          user_role: userRole,
          class_code: body.classCode || null,
          endpoint: sub.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          notify_settings: body.notifySettings || undefined,
          user_agent: request.headers.get('User-Agent') || '',
          updated_at: new Date().toISOString()
        }
      });
      return jsonResponse({ ok: true });
    }

    return fetch(request);
  }
};
