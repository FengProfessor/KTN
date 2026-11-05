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
  homeworkApi: 'https://rt6i5wgkj4.execute-api.ap-southeast-1.amazonaws.com/prod/homework',
  contactLead: 'https://c9xi8h3a3d.execute-api.ap-southeast-1.amazonaws.com/prod/contact'
};

// ============================================================================
// DANH MỤC 17 KHÓA HỌC VIDEO THỰC TẾ + GÓI COMBO TRÊN IZTEACH (MASTER CATALOG)
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
  '661528ea42af880008944573': {
    id: '661528ea42af880008944573',
    code: 'CFK-03',
    title: 'Chinese For Kids 3 (Khóa Song ngữ Trẻ em Cấp độ 3)',
    shortTitle: 'Chinese For Kids 3',
    badge: 'SONG NGỮ CẤP ĐỘ 3',
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000
  },
  '65e7636a0a1b61000825c2ef': {
    id: '65e7636a0a1b61000825c2ef',
    code: 'MINI-01',
    title: 'Tiếng Trung Trẻ Em Mini 1 (Khóa học cho bé 4 – 6 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em Mini 1',
    badge: 'MẦM NON MINI 1',
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000
  },
  '6600fa477c18b80008c53c88': {
    id: '6600fa477c18b80008c53c88',
    code: 'MINI-02',
    title: 'Tiếng Trung Trẻ Em Mini 2 (Khóa học cho bé 5 – 7 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em Mini 2',
    badge: 'MẦM NON MINI 2',
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000
  },
  '6600fa7da2bfe10008834e13': {
    id: '6600fa7da2bfe10008834e13',
    code: 'MINI-03',
    title: 'Tiếng Trung Trẻ Em Mini 3 (Khóa học cho bé 6 – 8 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em Mini 3',
    badge: 'MẦM NON MINI 3',
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000
  },
  '65e769bd637339000870618f': {
    id: '65e769bd637339000870618f',
    code: 'KIDS-01',
    title: 'Tiếng Trung Trẻ Em 1 (Lộ trình 6 – 11 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em 1',
    badge: 'CẤP ĐỘ 01',
    lessonsCount: 25,
    price: 890000,
    oldPrice: 1500000
  },
  '66028938bfd6c90008b816e1': {
    id: '66028938bfd6c90008b816e1',
    code: 'KIDS-02',
    title: 'Tiếng Trung Trẻ Em 2 (Lộ trình 6 – 12 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em 2',
    badge: 'CẤP ĐỘ 02',
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000
  },
  '6638bd09a7367400085c7ab2': {
    id: '6638bd09a7367400085c7ab2',
    code: 'KIDS-03',
    title: 'Tiếng Trung Trẻ Em 3 (Lộ trình 6 – 12 tuổi)',
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
    lessonsCount: 16,
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
  '65e772a1767c56000829518e': {
    id: '65e772a1767c56000829518e',
    code: 'JUNIOR-01',
    title: 'Chinese Junior 1 (Tiếng Trung Thiếu Niên Song Ngữ)',
    shortTitle: 'Chinese Junior 1',
    badge: 'CHINESE JUNIOR 1',
    lessonsCount: 25,
    price: 990000,
    oldPrice: 1600000
  },
  '6638c76dfac274000876cd13': {
    id: '6638c76dfac274000876cd13',
    code: 'JUNIOR-03',
    title: 'Chinese Junior 3 (Tiếng Trung Thiếu Niên Cấp Độ 3)',
    shortTitle: 'Chinese Junior 3',
    badge: 'CHINESE JUNIOR 3',
    lessonsCount: 25,
    price: 990000,
    oldPrice: 1600000
  },
  '65e76a533f5e7c00086715d7': {
    id: '65e76a533f5e7c00086715d7',
    code: 'HSK1-20',
    title: 'Khóa học Tiếng Trung HSK 1 & Giao Tiếp Phản Xạ',
    shortTitle: 'Tiếng Trung HSK 1',
    badge: 'GIAO TIẾP & HSK 1',
    lessonsCount: 20,
    price: 690000,
    oldPrice: 1200000
  },
  '65f6d1c722106a0008ff81a3': {
    id: '65f6d1c722106a0008ff81a3',
    code: 'HSK-PREP-VN',
    title: 'Khóa học Tiếng Trung + Luyện Thi HSK Chuẩn Quốc Tế',
    shortTitle: 'Tiếng Trung + Luyện Thi HSK',
    badge: 'LUYỆN THI HSK',
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000
  },
  '65e773c89ea90c00080d52fc': {
    id: '65e773c89ea90c00080d52fc',
    code: 'HSK-PREP-EN',
    title: 'Chinese + HSK Exam Preparation (Song ngữ Quốc tế)',
    shortTitle: 'Chinese + HSK Exam Prep',
    badge: 'HSK EXAM PREP',
    lessonsCount: 20,
    price: 990000,
    oldPrice: 1600000
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
    lessonsCount: 111,
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
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-KTN-Webhook-Secret, X-KTN-Test-Mode',
  'Access-Control-Max-Age': '86400',
  'X-KTN-Worker-Version': 'ktn-prod-v2026.11.03'
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
  const jti = payload.jti || ('sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10));
  const data = {
    ...payload,
    jti,
    accessToken: undefined,
    izteachAccessToken: undefined,
    iat: Date.now(),
    exp: Date.now() + 30 * 86400 * 1000
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
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [bodyB64, sigB64] = parts;
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

const revokedTokenMemorySet = new Set();

function getTokenRevocationKey(rawToken, jti) {
  if (jti && typeof jti === 'string') return jti;
  const s = String(rawToken || '').trim();
  return s ? ('tok_' + s.slice(-36)) : '';
}

async function isTokenRevoked(env, rawToken, jti) {
  const key1 = jti ? String(jti).trim() : '';
  const key2 = getTokenRevocationKey(rawToken, null);
  if ((key1 && revokedTokenMemorySet.has(key1)) || (key2 && revokedTokenMemorySet.has(key2))) {
    return true;
  }
  const lookupIds = [key1 ? `REVOKED_${key1}` : '', key2 ? `REVOKED_${key2}` : ''].filter(Boolean);
  if (lookupIds.length === 0) return false;
  try {
    const inParam = lookupIds.map(id => encodeURIComponent(id)).join(',');
    const res = await supabaseRequest(
      env,
      `ktn_dlp_alerts?id=in.(${inParam})&room_id=eq.AUTH_REVOKED&select=id,blocked_content&limit=5`
    );
    if (!res || !res.ok) {
      // Fail-closed: nếu kho thu hồi phiên không phản hồi hợp lệ, từ chối token để không lọt phiên đã đăng xuất
      return true;
    }
    if (Array.isArray(res.data) && res.data.length > 0) {
      const now = Date.now();
      for (const row of res.data) {
        const exp = Number(row?.blocked_content || 0);
        if (!exp || exp > now) {
          const rawKey = String(row.id || '').replace(/^REVOKED_/, '');
          if (rawKey) revokedTokenMemorySet.add(rawKey);
        }
      }
    }
  } catch {
    return true;
  }
  return Boolean((key1 && revokedTokenMemorySet.has(key1)) || (key2 && revokedTokenMemorySet.has(key2)));
}

async function revokeSessionTokenServerSide(env, rawToken, jti) {
  const cleanRaw = String(rawToken || '').trim();
  if (cleanRaw) {
    verifiedIzTeachTokenCache.delete(cleanRaw);
  }
  const key1 = jti ? String(jti).trim() : '';
  const key2 = getTokenRevocationKey(cleanRaw, null);
  if (key1) revokedTokenMemorySet.add(key1);
  if (key2) revokedTokenMemorySet.add(key2);
  const keys = Array.from(new Set([key1, key2].filter(Boolean)));
  if (keys.length === 0) return { ok: true, persisted: true };
  try {
    const now = Date.now();
    const exp = String(now + 30 * 86400 * 1000);
    const rows = keys.map(k => ({
      id: `REVOKED_${k}`,
      room_id: 'AUTH_REVOKED',
      sender_email: 'system@khongtunhi.com',
      sender_name: 'Auth Revocation Guard',
      sender_role: 'system',
      blocked_content: exp,
      reason: 'SESSION_LOGOUT_REVOKED',
      resolved: true
    }));
    const res = await supabaseRequest(env, 'ktn_dlp_alerts?on_conflict=id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: rows
    });
    if (!res || !res.ok) {
      return { ok: false, persisted: false, status: res?.status || 503 };
    }
    // Dọn các dòng thu hồi phiên đã quá hạn 30 ngày
    const cutoffIso = new Date(now - 30 * 86400 * 1000).toISOString();
    await supabaseRequest(
      env,
      `ktn_dlp_alerts?room_id=eq.AUTH_REVOKED&created_at=lt.${encodeURIComponent(cutoffIso)}`,
      { method: 'DELETE', prefer: 'return=minimal' }
    ).catch(() => null);
    return { ok: true, persisted: true };
  } catch {
    return { ok: false, persisted: false, status: 503 };
  }
}

const verifiedIzTeachTokenCache = new Map();

async function verifyIzTeachAccessToken(tok, env) {
  if (!tok || typeof tok !== 'string') return null;
  if (!tok.startsWith('eayJ') && !tok.startsWith('eyJ')) return null;
  const parts = tok.split('.');
  if (parts.length !== 3) return null;

  const cached = verifiedIzTeachTokenCache.get(tok);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.session;
  }

  try {
    const midB64u = parts[1];
    const midPad = '='.repeat((4 - (midB64u.length % 4)) % 4);
    const midJsonStr = atob((midB64u + midPad).replace(/-/g, '+').replace(/_/g, '/'));
    const midObj = JSON.parse(midJsonStr);

    let dec = midObj;
    if (midObj && typeof midObj.payloadCompressed === 'string') {
      const compB64 = midObj.payloadCompressed;
      const compPad = '='.repeat((4 - (compB64.length % 4)) % 4);
      const binStr = atob((compB64 + compPad).replace(/-/g, '+').replace(/_/g, '/'));
      const compBytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) compBytes[i] = binStr.charCodeAt(i);
      const ds = new DecompressionStream('deflate');
      const writer = ds.writable.getWriter();
      writer.write(compBytes);
      writer.close();
      const decompressedText = await new Response(ds.readable).text();
      dec = JSON.parse(decompressedText);
    }

    const email = normalizeEmail(dec?.email || '');
    const userId = String(dec?.userId || dec?.id || '').trim();
    const expectedVendor = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
    const vendorId = String(dec?.vendorId || '').trim();
    if (!email || !userId || vendorId !== expectedVendor) {
      return null;
    }

    // Xác thực chữ ký token trực tiếp qua endpoint user-permission của izTeach.
    // Chỉ chấp nhận khi upstream xác nhận hợp lệ với HTTP 200 OK (từ chối mọi mã 401/403/5xx).
    const permUrl = `${IZTEACH_ENDPOINTS.userPermission}?userId=${encodeURIComponent(userId)}&vendorId=${encodeURIComponent(vendorId)}`;
    const permRes = await fetch(permUrl, { headers: { Authorization: tok } });
    if (permRes.status !== 200) {
      return null;
    }
    const permData = await permRes.json().catch(() => null);
    if (!permData || typeof permData !== 'object') {
      return null;
    }

    const decRoles = Array.isArray(dec?.roles) ? dec.roles : [];
    let role = 'student';
    let name = dec?.name || email.split('@')[0];
    let code = userId;
    let classCode = null;

    if (decRoles.includes('root') || decRoles.includes('admin')) {
      role = 'admin';
    } else {
      const sbTeacher = await supabaseRequest(env, `ktn_teachers?email=eq.${encodeURIComponent(email)}&select=*&limit=1`);
      if (sbTeacher.ok && Array.isArray(sbTeacher.data) && sbTeacher.data[0]) {
        const tRow = sbTeacher.data[0];
        if (tRow.role === 'admin' && (decRoles.includes('root') || decRoles.includes('admin'))) {
          role = 'admin';
        } else if (tRow.role === 'teacher' || email === 'linh.lam@khongtunhi.com' || email === 'thu.ha@khongtunhi.com') {
          role = 'teacher';
        }
        name = tRow.name || name;
        code = tRow.code || code;
      } else if (email === 'linh.lam@khongtunhi.com' || email === 'thu.ha@khongtunhi.com') {
        role = 'teacher';
      } else {
        const sbStudent = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(email)}&select=*&limit=1`);
        if (sbStudent.ok && Array.isArray(sbStudent.data) && sbStudent.data[0]) {
          const sRow = sbStudent.data[0];
          role = 'student';
          name = sRow.name || name;
          code = sRow.code || code;
          classCode = sRow.class_code || null;
        }
      }
    }

    const session = {
      id: code,
      code,
      userId,
      email,
      name,
      role,
      roles: [role],
      classCode
    };
    verifiedIzTeachTokenCache.set(tok, {
      session,
      expiresAt: Date.now() + 5 * 60 * 1000
    });
    return session;
  } catch {
    return null;
  }
}

async function extractSessionFromRequest(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const tok = authHeader.slice(7).trim();
    const verified = await verifySessionToken(tok, env.KTN_SESSION_SECRET);
    if (verified) {
      if (await isTokenRevoked(env, tok, verified.jti)) return null;
      return verified;
    }
    if (await isTokenRevoked(env, tok, null)) return null;
    const verifiedIz = await verifyIzTeachAccessToken(tok, env);
    if (verifiedIz) {
      return verifiedIz;
    }
  }
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)ktn_webapp_token=([^;]+)/);
  if (match && match[1]) {
    const rawCookieTok = decodeURIComponent(match[1]);
    const verified = await verifySessionToken(rawCookieTok, env.KTN_SESSION_SECRET);
    if (verified) {
      if (await isTokenRevoked(env, rawCookieTok, verified.jti)) return null;
      return verified;
    }
    if (await isTokenRevoked(env, rawCookieTok, null)) return null;
    const verifiedIz = await verifyIzTeachAccessToken(rawCookieTok, env);
    if (verifiedIz) {
      return verifiedIz;
    }
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

function normalizeRoomClassCode(rawRoomId) {
  const s = String(rawRoomId || '').trim().replace(/^class:/i, '').trim().toUpperCase();
  if (!s || s === 'GENERAL' || s === 'ALL') return '';
  return s;
}

const COURSE_CHAT_ALIASES = {
  'hsk1': '6adadba969897b0002482ca5',
  'cfk1': '65e7704a9ea90c00080d5195',
  'cfk': '65e7704a9ea90c00080d5195',
  '65e7688d524c58000836593b': '65e7704a9ea90c00080d5195',
  'yct1': '65e769bd637339000870618f'
};

function parseChatRoomDescriptor(rawRoomId) {
  const raw = String(rawRoomId || '').trim();
  if (!raw) return { valid: false, type: '', classCode: '', roomId: '', queryKeys: [] };

  if (/^course:/i.test(raw)) {
    const rawCid = raw.replace(/^course:/i, '').trim().toLowerCase();
    if (!rawCid) return { valid: false, type: 'course', classCode: '', roomId: '', queryKeys: [] };
    const canonicalCid = COURSE_CHAT_ALIASES[rawCid] || rawCid;
    const keys = new Set([`course:${canonicalCid}`, `course:${rawCid}`]);
    if (canonicalCid === '65e7704a9ea90c00080d5195') {
      keys.add('course:65e7688d524c58000836593b');
    }
    return {
      valid: true,
      type: 'course',
      courseId: canonicalCid,
      rawCourseId: rawCid,
      classCode: `course:${canonicalCid}`,
      roomId: `course:${canonicalCid}`,
      queryKeys: Array.from(keys)
    };
  }

  if (/^student:/i.test(raw)) {
    const stuEmail = normalizeEmail(raw.replace(/^student:/i, '').trim());
    if (!stuEmail || !stuEmail.includes('@')) {
      return { valid: false, type: 'student', classCode: '', roomId: '', queryKeys: [] };
    }
    return {
      valid: true,
      type: 'student',
      studentEmail: stuEmail,
      classCode: `student:${stuEmail}`,
      roomId: `student:${stuEmail}`,
      queryKeys: [`student:${stuEmail}`]
    };
  }

  const classCode = normalizeRoomClassCode(raw);
  if (!classCode) return { valid: false, type: 'class', classCode: '', roomId: '', queryKeys: [] };
  return {
    valid: true,
    type: 'class',
    classCode,
    roomId: `class:${classCode}`,
    queryKeys: [classCode, `class:${classCode}`]
  };
}

async function isActiveTeacherSession(env, session) {
  if (!session || session.role !== 'teacher') return false;
  const email = normalizeEmail(session.email || '');
  if (email === 'linh.lam@khongtunhi.com' || email === 'thu.ha@khongtunhi.com') return true;
  const tRes = await supabaseRequest(env, `ktn_teachers?email=eq.${encodeURIComponent(email)}&active=eq.true&limit=1`);
  return Boolean(tRes.ok && Array.isArray(tRes.data) && tRes.data.length > 0);
}

async function canAccessChatRoom(env, session, rawRoomId) {
  const desc = parseChatRoomDescriptor(rawRoomId);
  if (!desc.valid) {
    return {
      allowed: false,
      status: 400,
      classCode: '',
      roomId: '',
      message: 'Vui lòng chọn đúng mã lớp học hoặc khóa học (roomId) để xem hoặc gửi tin nhắn.'
    };
  }
  if (!session) {
    return { allowed: false, status: 401, classCode: desc.classCode, roomId: desc.roomId, message: 'Vui lòng đăng nhập.' };
  }
  if (session.role === 'admin') {
    return { allowed: true, status: 200, ...desc };
  }

  if (desc.type === 'class') {
    const classCode = desc.classCode;
    if (session.role === 'teacher') {
      const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
      if (!assignedClasses.includes(classCode)) {
        return {
          allowed: false,
          status: 403,
          classCode,
          roomId: desc.roomId,
          message: `Cô không phụ trách lớp ${classCode} nên không có quyền truy cập phòng trao đổi của lớp này.`
        };
      }
      return { allowed: true, status: 200, ...desc };
    }
    const stuRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(session.email)}&select=class_code&limit=1`);
    const stuRow = (stuRes.ok && Array.isArray(stuRes.data) && stuRes.data[0]) ? stuRes.data[0] : null;
    const realClassCode = String(stuRow?.class_code || session.classCode || '').trim().toUpperCase();
    if (!realClassCode || realClassCode !== classCode) {
      return {
        allowed: false,
        status: 403,
        classCode,
        roomId: desc.roomId,
        message: `Em không thuộc lớp ${classCode} nên không có quyền xem hoặc gửi tin nhắn trong phòng trao đổi của lớp này.`
      };
    }
    return { allowed: true, status: 200, ...desc };
  }

  if (desc.type === 'course') {
    if (session.role === 'teacher') {
      if (!(await isActiveTeacherSession(env, session))) {
        return { allowed: false, status: 403, classCode: desc.classCode, roomId: desc.roomId, message: 'Tài khoản giáo viên chưa được kích hoạt.' };
      }
      return { allowed: true, status: 200, ...desc };
    }
    const stuRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(session.email)}&limit=1`);
    const stuRow = (stuRes.ok && Array.isArray(stuRes.data) && stuRes.data[0]) ? stuRes.data[0] : null;
    const onlineList = Array.isArray(stuRow?.online_courses)
      ? stuRow.online_courses
      : (Array.isArray(session.onlineCourses) ? session.onlineCourses : []);
    let enrolledIds = new Set(onlineList.map(c => String(c?.id || c?._id || c || '').trim().toLowerCase()).filter(Boolean));
    if (enrolledIds.has('65e7704a9ea90c00080d5195') || enrolledIds.has('65e7688d524c58000836593b')) {
      enrolledIds.add('65e7704a9ea90c00080d5195');
      enrolledIds.add('65e7688d524c58000836593b');
    }
    if (!enrolledIds.has(desc.courseId) && !enrolledIds.has(desc.rawCourseId)) {
      const syncedStu = await syncStudentEntitlementFromIzTeach(env, {
        email: session.email,
        name: stuRow?.name || session.name,
        phone: stuRow?.phone || '',
        cognitoUserId: stuRow?.cognito_user_id || session.userId,
        izteachStudentId: stuRow?.izteach_student_id || session.studentId,
        accessToken: session.izteachAccessToken || session.accessToken
      });
      if (syncedStu && Array.isArray(syncedStu.online_courses)) {
        enrolledIds = new Set(syncedStu.online_courses.map(c => String(c?.id || c?._id || c || '').trim().toLowerCase()).filter(Boolean));
        if (enrolledIds.has('65e7704a9ea90c00080d5195') || enrolledIds.has('65e7688d524c58000836593b')) {
          enrolledIds.add('65e7704a9ea90c00080d5195');
          enrolledIds.add('65e7688d524c58000836593b');
        }
      }
    }
    if (!enrolledIds.has(desc.courseId) && !enrolledIds.has(desc.rawCourseId)) {
      return {
        allowed: false,
        status: 403,
        error: 'COURSE_NOT_ENTITLED',
        classCode: desc.classCode,
        roomId: desc.roomId,
        message: 'Em chưa được cấp quyền khóa học này nên không thể tham gia nhóm trao đổi của khóa.'
      };
    }
    return { allowed: true, status: 200, ...desc };
  }

  if (desc.type === 'student') {
    if (session.role === 'teacher') {
      if (!(await isActiveTeacherSession(env, session))) {
        return { allowed: false, status: 403, classCode: desc.classCode, roomId: desc.roomId, message: 'Tài khoản giáo viên chưa được kích hoạt.' };
      }
      return { allowed: true, status: 200, ...desc };
    }
    const myEmail = normalizeEmail(session.email || '');
    if (!myEmail || myEmail !== desc.studentEmail) {
      return {
        allowed: false,
        status: 403,
        error: 'STUDENT_PRIVATE_ROOM_FORBIDDEN',
        classCode: desc.classCode,
        roomId: desc.roomId,
        message: 'Kênh nhắn riêng 1-1 với cô giáo là bảo mật cá nhân. Em không được phép truy cập hộp thư riêng của học viên khác.'
      };
    }
    return { allowed: true, status: 200, ...desc };
  }

  return { allowed: false, status: 400, classCode: '', roomId: '', message: 'Phòng trao đổi không hợp lệ.' };
}

function getDefaultPinnedAnnouncement(access) {
  if (!access || access.type === 'student') return null;
  if (access.type === 'class') {
    return {
      roomId: access.roomId,
      content: `Chào các con lớp ${access.classCode}! Các con trao đổi bài học và hỏi bài cùng Cô Lâm Mỹ Linh tại nhóm lớp nhé.`,
      pinnedBy: 'Cô Lâm Mỹ Linh',
      pinnedByEmail: 'linh.lam@khongtunhi.com',
      isDefault: true,
      updatedAt: '2026-04-15T08:00:00.000Z'
    };
  }
  if (access.type === 'course') {
    const meta = MASTER_PRODUCT_MAPPING[access.courseId] || { shortTitle: 'Khóa học Video' };
    return {
      roomId: access.roomId,
      content: `Chào các con khóa ${meta.shortTitle || meta.title}! Các con xem video bài giảng và trao đổi cùng Cô Lâm Mỹ Linh & các bạn cùng khóa tại đây nhé.`,
      pinnedBy: 'Cô Lâm Mỹ Linh',
      pinnedByEmail: 'linh.lam@khongtunhi.com',
      isDefault: true,
      updatedAt: '2026-04-15T08:00:00.000Z'
    };
  }
  return null;
}

async function getRoomPinnedAnnouncement(env, access) {
  if (!access || !access.roomId) return null;
  const pinKey = 'PIN:' + access.roomId;
  const res = await supabaseRequest(env, `ktn_dlp_alerts?room_id=eq.${encodeURIComponent(pinKey)}&order=created_at.desc&limit=1`);
  if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
    const row = res.data[0];
    try {
      const parsed = JSON.parse(row.blocked_content || '{}');
      if (parsed && parsed.content) {
        return {
          roomId: access.roomId,
          content: String(parsed.content).trim(),
          pinnedBy: parsed.pinnedBy || row.sender_name || 'Cô Lâm Mỹ Linh',
          pinnedByEmail: parsed.pinnedByEmail || row.sender_email || 'linh.lam@khongtunhi.com',
          messageId: parsed.messageId || null,
          isDefault: false,
          updatedAt: parsed.updatedAt || row.created_at || new Date().toISOString()
        };
      }
    } catch {}
  }
  return getDefaultPinnedAnnouncement(access);
}

async function saveRoomPinnedAnnouncement(env, session, access, content, messageId = null) {
  const pinKey = 'PIN:' + access.roomId;
  const pinId = 'PIN-' + access.roomId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const nowIso = new Date().toISOString();
  const payload = {
    roomId: access.roomId,
    content: String(content || '').trim(),
    pinnedBy: session.name || 'Cô Lâm Mỹ Linh',
    pinnedByEmail: session.email,
    messageId: messageId || null,
    isDefault: false,
    updatedAt: nowIso
  };
  const existingRes = await supabaseRequest(env, `ktn_dlp_alerts?room_id=eq.${encodeURIComponent(pinKey)}&order=created_at.desc&limit=1`);
  const existingRow = (existingRes.ok && Array.isArray(existingRes.data) && existingRes.data[0]) ? existingRes.data[0] : null;
  let sbRes = null;
  if (existingRow && existingRow.id) {
    sbRes = await supabaseRequest(env, `ktn_dlp_alerts?id=eq.${encodeURIComponent(existingRow.id)}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: {
        sender_email: session.email,
        sender_name: session.name || 'Cô Lâm Mỹ Linh',
        sender_role: session.role,
        blocked_content: JSON.stringify(payload)
      }
    });
  }
  if (!sbRes || !sbRes.ok || !Array.isArray(sbRes.data) || sbRes.data.length === 0) {
    sbRes = await supabaseRequest(env, 'ktn_dlp_alerts', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        id: pinId + '-' + Date.now(),
        room_id: pinKey,
        sender_email: session.email,
        sender_name: session.name || 'Cô Lâm Mỹ Linh',
        sender_role: session.role,
        blocked_content: JSON.stringify(payload),
        reason: 'ROOM_PINNED_ANNOUNCEMENT',
        created_at: nowIso
      }
    });
  }
  return { ok: Boolean(sbRes && sbRes.ok), pinnedMessage: payload, status: sbRes?.status || 500 };
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
  const phoneRegex = /(?<!\d)(?:\+?84|0)(?:3|5|7|8|9)(?:[\s.-]*\d){8}(?!\d)/;
  const linkRegex = /\b(?:zalo\.me|fb\.com|facebook\.com|t\.me)\b/i;
  if (phoneRegex.test(s)) {
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

function extractIzTeachOnlineCourseIds(permData) {
  const list = Array.isArray(permData) ? permData : (permData && typeof permData === 'object' ? [permData] : []);
  const ids = [];
  const seen = new Set();
  for (const item of list) {
    const arr = Array.isArray(item?.onlineCourses) ? item.onlineCourses : [];
    for (const c of arr) {
      const cid = String(c?.id || c?._id || c?.onlineCourseId || c?.productId || c || '').trim();
      if (cid && !seen.has(cid)) {
        seen.add(cid);
        ids.push(cid);
      }
    }
  }
  return ids;
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
  const targetCourseIds = order.skipCourses ? [] : resolveOrderCourseIds(order);
  const initialPassword = String(order.initialPassword || order.password || ('Ktn@' + Math.random().toString(36).slice(2, 8).toUpperCase() + '9!')).trim();
  const defaultPassB64 = btoa(unescape(encodeURIComponent(initialPassword)));

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
          if (isValidCognitoUuid(found.dynamoId)) cognitoUserId = found.dynamoId;
          else if (isValidCognitoUuid(found.userId)) cognitoUserId = found.userId;
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
      existingIzCourseIds = extractIzTeachOnlineCourseIds(permData);
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

  // Tầng 4.5: Nếu ở chế độ đối soát tuyệt đối (replaceCourses: true), thu hồi các khóa học đã bỏ chọn trên izTeach
  let coursesToRemove = [];
  if (order.replaceCourses === true) {
    const targetSet = new Set(targetCourseIds.map(id => String(id || '').trim()).filter(Boolean));
    coursesToRemove = existingIzCourseIds.filter(cid => cid && !targetSet.has(cid));
    if (coursesToRemove.length > 0) {
      const remRes = await fetch(`${IZTEACH_ENDPOINTS.userPermission}/remove-products/${encodeURIComponent(cognitoUserId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: adminToken },
        body: JSON.stringify({
          vendorId,
          userId: cognitoUserId,
          productIds: coursesToRemove,
          productType: 'online-course'
        })
      }).catch(e => ({ ok: false, status: 503, _err: e }));
      if (!remRes || !remRes.ok) {
        const errTxt = remRes && typeof remRes.text === 'function' ? await remRes.text().catch(() => '') : (remRes?._err?.message || 'NETWORK_ERROR');
        return { ok: false, error: 'Lỗi thu hồi khóa học cũ trên izTeach khi đối soát: ' + (errTxt || ('HTTP ' + (remRes?.status || 503))) };
      }
    }
  }

  // Tầng 5: Xác minh sau cập nhật (Read-After-Write Verification) trực tiếp trên izTeach user-permission
  let verifiedIzCourseIds = order.replaceCourses === true
    ? Array.from(new Set(targetCourseIds))
    : Array.from(new Set([...existingIzCourseIds, ...targetCourseIds]));
  if (missingCourseIds.length > 0 || coursesToRemove.length > 0) {
    try {
      const verifyRes = await fetch(`${IZTEACH_ENDPOINTS.userPermission}?userId=${encodeURIComponent(cognitoUserId)}&vendorId=${encodeURIComponent(vendorId)}`, {
        headers: { Authorization: adminToken }
      });
      if (!verifyRes.ok) {
        return { ok: false, error: 'Không xác minh được quyền khóa học trên izTeach sau cập nhật (HTTP ' + verifyRes.status + ')' };
      }
      const verifyData = await verifyRes.json().catch(() => null);
      if (verifyData && typeof verifyData === 'object') {
        verifiedIzCourseIds = extractIzTeachOnlineCourseIds(verifyData);
        const verifiedSet = new Set(verifiedIzCourseIds);
        const stillMissing = targetCourseIds.filter(cid => cid && !verifiedSet.has(cid));
        if (stillMissing.length > 0) {
          return { ok: false, error: 'izTeach chưa xác nhận cấp khóa học: ' + stillMissing.join(', ') };
        }
        if (order.replaceCourses === true && coursesToRemove.length > 0) {
          const stillPresent = coursesToRemove.filter(cid => verifiedSet.has(cid));
          if (stillPresent.length > 0) {
            return { ok: false, error: 'izTeach chưa xác nhận thu hồi khóa học: ' + stillPresent.join(', ') };
          }
        }
      }
    } catch (verifyErr) {
      return { ok: false, error: 'Lỗi xác minh quyền khóa học trên izTeach: ' + (verifyErr?.message || 'NETWORK_ERROR') };
    }
  }

  return {
    ok: true,
    verified: true,
    cognitoUserId,
    izteachStudentId,
    email,
    name,
    initialPassword,
    courseId: targetCourseIds[0] || DEFAULT_COURSE_ID,
    grantedCourseIds: targetCourseIds,
    allCourseIds: verifiedIzCourseIds
  };
}

/**
 * Thu hồi khóa học trực tiếp trên izTeach (PUT /user-permission/remove-products/:cognitoUserId)
 * Không bao giờ coi skipped: true là thành công; bắt buộc xác minh sau khi thu hồi.
 */
async function revokeStudentCoursesOnIzTeach(env, { email, cognitoUserId, removeCourseIds = [] }) {
  const cleanIds = Array.from(new Set((Array.isArray(removeCourseIds) ? removeCourseIds : []).map(id => String(id || '').trim()).filter(Boolean)));
  if (cleanIds.length === 0) return { ok: true, verified: true, removedCourseIds: [] };
  const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
  const adminToken = await getIzTeachAdminToken(env);
  if (!adminToken) return { ok: false, skipped: false, reason: 'NO_ADMIN_TOKEN', error: 'Missing izTeach admin token' };

  let resolvedUid = isValidCognitoUuid(cognitoUserId) ? cognitoUserId : null;
  const cleanEmail = normalizeEmail(email);

  if (!resolvedUid && cleanEmail) {
    const stuLookup = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(cleanEmail)}&limit=1`);
    const existingRow = (stuLookup.ok && Array.isArray(stuLookup.data) && stuLookup.data[0]) || null;
    if (isValidCognitoUuid(existingRow?.cognito_user_id)) {
      resolvedUid = existingRow.cognito_user_id;
    }
  }

  if (!resolvedUid && cleanEmail) {
    try {
      const qRes = await fetch(`${IZTEACH_ENDPOINTS.studentCrm}?vendorId=${encodeURIComponent(vendorId)}&email=${encodeURIComponent(cleanEmail)}`, {
        headers: { Authorization: adminToken }
      });
      if (qRes.ok) {
        const qData = await qRes.json().catch(() => null);
        const list = Array.isArray(qData?.data) ? qData.data : (Array.isArray(qData) ? qData : []);
        const found = list.find(u => normalizeEmail(u.email) === cleanEmail);
        if (found) {
          if (isValidCognitoUuid(found.dynamoId)) resolvedUid = found.dynamoId;
          else if (isValidCognitoUuid(found.userId)) resolvedUid = found.userId;
          else if (isValidCognitoUuid(found.id)) resolvedUid = found.id;
        }
      }
    } catch {}
  }

  if (!resolvedUid) {
    return {
      ok: false,
      skipped: false,
      reason: 'NO_COGNITO_UID',
      error: 'Không tìm thấy Cognito UUID trên izTeach cho học viên ' + (cleanEmail || '')
    };
  }

  try {
    const revRes = await fetch(`${IZTEACH_ENDPOINTS.userPermission}/remove-products/${encodeURIComponent(resolvedUid)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify({
        vendorId,
        userId: resolvedUid,
        productIds: cleanIds,
        productType: 'online-course'
      })
    });
    if (!revRes.ok) {
      const errTxt = await revRes.text().catch(() => '');
      return { ok: false, skipped: false, status: revRes.status, reason: 'IZTEACH_HTTP_' + revRes.status, error: errTxt || ('HTTP ' + revRes.status), cognitoUserId: resolvedUid };
    }

    // Xác minh sau thu hồi (Read-After-Write Verification) trên izTeach user-permission
    const verifyRes = await fetch(`${IZTEACH_ENDPOINTS.userPermission}?userId=${encodeURIComponent(resolvedUid)}&vendorId=${encodeURIComponent(vendorId)}`, {
      headers: { Authorization: adminToken }
    });
    if (!verifyRes.ok) {
      return {
        ok: false,
        skipped: false,
        status: verifyRes.status,
        reason: 'VERIFY_FAILED',
        error: 'Không thể xác minh trạng thái thu hồi khóa học trên izTeach (HTTP ' + verifyRes.status + ')',
        cognitoUserId: resolvedUid
      };
    }
    const verifyData = await verifyRes.json().catch(() => null);
    const remainingIds = extractIzTeachOnlineCourseIds(verifyData);
    const remainingSet = new Set(remainingIds);
    const stillPresent = cleanIds.filter(cid => remainingSet.has(cid));
    if (stillPresent.length > 0) {
      return {
        ok: false,
        skipped: false,
        reason: 'REVOKE_VERIFICATION_MISMATCH',
        error: 'izTeach vẫn còn giữ khóa học sau lệnh thu hồi: ' + stillPresent.join(', '),
        cognitoUserId: resolvedUid,
        remainingCourseIds: remainingIds
      };
    }

    return {
      ok: true,
      verified: true,
      skipped: false,
      cognitoUserId: resolvedUid,
      removedCourseIds: cleanIds,
      remainingCourseIds: remainingIds
    };
  } catch (err) {
    return { ok: false, skipped: false, reason: 'REVOKE_ERROR', error: err?.message || 'REVOKE_ERROR', cognitoUserId: resolvedUid };
  }
}

const COURSE_UNIT_MAP = {
  '6adadba969897b0002482ca5': { 1: '6adadbcaf75fe5000247ca71', 2: '6adadc3b69897b0002482d22', 3: '6adae08769897b000248340a', 4: '6adf1b51e2681300028de363', 5: '6adf1fade5b2290002718df9', 6: '6adf22e9e5b22900027199e7', 7: '6adf3578b3cfe60002ab5a55', 8: '6adf3707b3cfe60002ab5fd6', 9: '6ae52ef17b101100026bb5d7', 10: '6ae546eaa1908400020410e3', 11: '6ae54a51fab31400021bee3b', 12: '6ae54f37a1908400020426c9', 13: '6ae550b3a190840002042a62', 14: '6ae558d7fab31400021c1676', 15: '6ae56d92b734640002ce863a' },
  '678d14b960eae20002ddf8fe': { 1: '678d14ef83903000028fb716', 2: '67bbd7167e21a900021ce2ce', 3: '67bbd7187e21a900021ce2e1', 4: '67bbd7197e21a900021ce2e8', 5: '67bbd7237e21a900021ce2fe', 6: '67bbd7247e21a900021ce302', 7: '67bbd7267e21a900021ce30f', 8: '67bbd728f0b1030002fa0e2f', 9: '67bbd729f0b1030002fa0e34', 10: '67bbd72af0b1030002fa0e39', 11: '67bbd72cf0b1030002fa0e40', 12: '67bbd72ef0b1030002fa0e59', 13: '67bbd730f0b1030002fa0e5e', 14: '67bbd731f0b1030002fa0e62', 15: '67bbd732f0b1030002fa0e69', 16: '67bbd735f0b1030002fa0e6e' },
  '65e7704a9ea90c00080d5195': { 1: '663e2cb2f960e80008fb905a', 2: '663e2cb3ef5f220008fee283', 3: '663e2cb6d87762000820b409', 4: '663e2cb8d87762000820b40c', 5: '663e2cba501e8b00082e04d9', 6: '663e2cbcf6e78b000877efb4', 7: '663e2cbf0710270008948856', 8: '663e2cc1501e8b00082e04eb', 9: '663e2cc3071027000894885d', 10: '663e2cc60710270008948862', 11: '663e2cc90710270008948867', 12: '663e2ccb501e8b00082e04f5', 13: '663e2ccd071027000894887c', 14: '663e2ccf501e8b00082e04fa', 15: '663e2cd2f6e78b000877efba', 16: '663e2cd4501e8b00082e0502', 17: '663e2cd6501e8b00082e0505', 18: '663e2cd807102700089488c2', 19: '663e2cdaf6e78b000877efe1', 20: '663e2cdced505f0008ed1f31' },
  '6638bd09a7367400085c7ab2': { 1: '6638bd156090c200087ed9d4', 2: '6638bd156090c200087ed9d0', 3: '6638bd146090c200087ed9cc', 4: '6638bd14a7367400085c7abc', 5: '6638bd136090c200087ed9c2', 6: '6638bd126090c200087ed9be', 7: '6638bd126090c200087ed9ba', 8: '6638bd126090c200087ed9b6', 9: '6638bd116090c200087ed9b2', 10: '6638bd116090c200087ed9ae', 11: '6638bd106090c200087ed9aa', 12: '6638bd106090c200087ed9a6', 13: '6638bd0f6090c200087ed9a2', 14: '6638bd0f6090c200087ed99e', 15: '6638bd0e6090c200087ed99a', 16: '6638bd0e6090c200087ed996', 17: '6638bd0d6090c200087ed992', 18: '6638bd0d6090c200087ed98d', 19: '6638bd0c6090c200087ed989', 20: '6638bd0c6090c200087ed985' },
  '65e76a533f5e7c00086715d7': { 1: '65e8bfe290ed4a0008fe87aa', 2: '65e8c00e90ed4a0008fe87b8', 3: '65e8c02b90ed4a0008fe87c2', 4: '65e8c03990ed4a0008fe87c9', 5: '65e8c04590ed4a0008fe87d1', 6: '65e8c05390ed4a0008fe87db', 7: '65e8c05d90ed4a0008fe87e1', 8: '65e8c06690ed4a0008fe87e7', 9: '65f6d4deaf683f0008c040f1', 10: '65e8c070fcfcaf0008525490', 11: '65e8c086d3b8e900089c49a4', 12: '65e8c090d3b8e900089c49ae', 13: '65e8c099d3b8e900089c49b4', 14: '65e8c0a3fcfcaf000852549e', 15: '65e8c0add3b8e900089c49ca', 16: '65e8c0b7d3b8e900089c49d1', 17: '65e8c0cafcfcaf00085254a8', 18: '65e8c0d4fcfcaf00085254af', 19: '65e8c0defcfcaf00085254b7', 20: '69230bd3bafc0800020a6860' },
  '67a869302ecb9c000257d966': { 1: '67a86940e7d5cf000204abf3', 2: '67a86941e7d5cf000204abf8', 3: '67a869432ecb9c000257d99a', 4: '67a869442ecb9c000257d99f', 5: '67a869462ecb9c000257d9a8', 6: '67a869482ecb9c000257d9ad', 7: '67a86949e7d5cf000204ac68', 8: '67a8694b2ecb9c000257d9b4', 9: '67a8694de7d5cf000204ac79', 10: '67a8694ee7d5cf000204ac7e', 11: '67a869502ecb9c000257d9be', 12: '67a86951e7d5cf000204ac8c', 13: '67a86953e7d5cf000204ac96', 14: '67a86955e7d5cf000204ac9f', 15: '67a869572ecb9c000257d9d3', 16: '67a86959e570870002de0282', 17: '67a8695b2ecb9c000257d9ea', 18: '67a8695ee7d5cf000204acb5', 19: '67a86960e7d5cf000204acc3', 20: '67a86962e7d5cf000204accf' },
  '67a7290a5fdc26000238b4e9': { 1: '67a729145fdc26000238b517', 2: '67a729d74be3170002dfb3cc', 3: '67a72a294be3170002dfb432', 4: '67a72a2b4be3170002dfb43d', 5: '67a72a2c4be3170002dfb447', 6: '67a72a2d5fdc26000238b725', 7: '67a72a2e5fdc26000238b737', 8: '67a72a305fdc26000238b73f', 9: '67a72a325fdc26000238b749', 10: '67a72a334be3170002dfb462', 11: '67a72a354be3170002dfb466', 12: '67a72a364be3170002dfb46a', 13: '67a72a384be3170002dfb472', 14: '67a72a394be3170002dfb476', 15: '67a72a3b4be3170002dfb47b', 16: '67a72a3d4be3170002dfb484', 17: '67a72a3e4be3170002dfb489', 18: '67a72a404be3170002dfb48d', 19: '67a72a424be3170002dfb494', 20: '67a72a434be3170002dfb498' },
  '65e769bd637339000870618f': { 1: '6607ce6f21dc710008875026', 2: '6607ce7921dc71000887503f', 3: '6607ce7b21dc710008875048', 4: '6607ce7eb00d8d00089262f1', 5: '6607d0df8b279e00081a54c8', 6: '6607d1a283e588000871ab9d', 7: '6607d19ce4925800089d37db', 8: '6607d1a3380b740008b3c779', 9: '6607d1a583e588000871aba6', 10: '6607d1a883e588000871abab', 11: '6607d2fbdacfda000857bafe', 12: '6607d3ba83e588000871ae8b', 13: '6607d3c783e588000871aea2', 14: '6607d3d683e588000871aead', 15: '6607d3e783e588000871aed4', 16: '6607d3f08b279e00081a5894', 17: '6607d3fe8b279e00081a5911', 18: '6607d405dacfda000857bc26', 19: '6607d417dacfda000857bc46', 20: '6607d41fdacfda000857bc54', 21: '6607d4318b279e00081a5947', 22: '6607d4438b279e00081a5985', 23: '6607d43b8b279e00081a5972', 24: '6607d4578b279e00081a5991', 25: '6607d473dacfda000857bd0d' },
  '66028938bfd6c90008b816e1': { 1: '66028942bfd6c90008b8172f', 2: '66028942bfd6c90008b8172c', 3: '66028942bfd6c90008b8172a', 4: '66028941bfd6c90008b81728', 5: '660289416be3ad000881bd3d', 6: '660289406be3ad000881bd3b', 7: '660289406be3ad000881bd39', 8: '660289406be3ad000881bd37', 9: '6602893fbfd6c90008b8170f', 10: '6602893fbfd6c90008b8170d', 11: '6602893fbfd6c90008b8170b', 12: '6602893fbfd6c90008b81708', 13: '6602893fbfd6c90008b81706', 14: '6602893ebfd6c90008b81704', 15: '6602893ebfd6c90008b81702', 16: '6602893ebfd6c90008b81700', 17: '6602893ebfd6c90008b816fc', 18: '6602893ebfd6c90008b816fe', 19: '6602893dbfd6c90008b816fa', 20: '6602893dbfd6c90008b816f8' },
  '65e7636a0a1b61000825c2ef': { 1: '66151e91edf4a8000831d55c', 2: '66151e9340e05d00084ef497', 3: '66151e95159f810008a94f95', 4: '66151e9f32008f0008b9a45e', 5: '66151ee3d226ed0008a4de6f', 6: '66151ee529101d00087a7e42', 7: '66151ef0159f810008a94fd8', 8: '66151ef232008f0008b9a47e', 9: '66151ef4d226ed0008a4de77', 10: '66151efb32008f0008b9a492', 11: '66151efc32008f0008b9a497', 12: '66151efe159f810008a94fe1', 13: '66151f0132008f0008b9a4b3', 14: '66151f02d226ed0008a4de8d', 15: '66151f04d226ed0008a4de94', 16: '66151f0732008f0008b9a4b8', 17: '66151f0932008f0008b9a4c0', 18: '66151f0ad226ed0008a4dea7', 19: '66151f0d32008f0008b9a4c2', 20: '66151f0f29101d00087a7e48' },
  '6600fa477c18b80008c53c88': { 1: '661a40df8b116f00081e5907', 2: '661a40f0deefc7000889f048', 3: '661a413df4a2b80008a9ba4a', 4: '661a413ef4a2b80008a9ba5c', 5: '661a41418b116f00081e5944', 6: '661a4144f4a2b80008a9ba5f', 7: '661a4146f4a2b80008a9ba65', 8: '661a414b8b116f00081e5953', 9: '661a414dba471c00088b6ac8', 10: '661a41508b116f00081e595c', 11: '661a4152f4a2b80008a9ba73', 12: '661a41548b116f00081e5991', 13: '661a41b78b116f00081e5a40', 14: '661a41ba8b116f00081e5a46', 15: '661a41bc8b116f00081e5a4d', 16: '661a41bf8b116f00081e5a53', 17: '661a41c18b116f00081e5a5b', 18: '661a41c4deefc7000889f12b', 19: '661a41c68b116f00081e5a66', 20: '661a41c98b116f00081e5a6d' },
  '6600fa7da2bfe10008834e13': { 1: '66024f93bfeae0000840c495', 2: '66024f95bfeae0000840c49a', 3: '66024f97bfeae0000840c49f', 4: '66024f99bfeae0000840c4a4', 5: '66024f9abfeae0000840c4aa', 6: '66024f9cbfeae0000840c4af', 7: '66024f9ebfeae0000840c4b4', 8: '66024f9f8fe62f0008deb5f1', 9: '66024fa1bfeae0000840c4bc', 10: '66024fa3bfeae0000840c4c7', 11: '66024fa58fe62f0008deb5fa', 12: '66024fa78fe62f0008deb600', 13: '66024fa9752cee00085b3a25', 14: '66024fab752cee00085b3a2d', 15: '66024fae752cee00085b3a36', 16: '66024fb18fe62f0008deb606', 17: '66024fb38fe62f0008deb60b', 18: '66024fb7752cee00085b3a45', 19: '66024fb8752cee00085b3a4a', 20: '66024fbb8fe62f0008deb614' },
  '661528ea42af880008944573': { 1: '661528f42c3c210008e6b336', 2: '661528f42c3c210008e6b334', 3: '661528f42c3c210008e6b332', 4: '661528f42c3c210008e6b330', 5: '661528f3f8789400080a4118', 6: '661528f3f8789400080a4116', 7: '661528f3f8789400080a4114', 8: '661528f3f8789400080a4112', 9: '661528f3f8789400080a4110', 10: '661528f2f8789400080a410e', 11: '661528f2b6ac6d0008597d67', 12: '661528f2f8789400080a410c', 13: '661528f142af88000894457d', 14: '661528f02c3c210008e6b32b', 15: '661528f02c3c210008e6b329', 16: '661528f02c3c210008e6b327', 17: '661528ef2c3c210008e6b325', 18: '6638e9108a44d500081e86e7', 19: '661528ef2c3c210008e6b323', 20: '661528ef2c3c210008e6b321' },
  '65e772a1767c56000829518e': { 1: '6607c0f24b876a0008abaf44', 2: '6607c0f5dc20050008a26631', 3: '6607c0fa4b876a0008abaf50', 4: '6607c0fb0f3de50009512e2e', 5: '6607c10f0f3de50009512e52', 6: '6607c1100f3de50009512e58', 7: '6607c1130f3de50009512e60', 8: '6607c1150f3de50009512e65', 9: '6607c118dc20050008a26645', 10: '6607c444dde7ed00080ac105', 11: '6607c452dde7ed00080ac11e', 12: '6607c45fe1beeb0008a7b8fc', 13: '6607c486e1beeb0008a7b91b', 14: '6607c497e1beeb0008a7b956', 15: '6607c4a5e1beeb0008a7b979', 16: '6607c4b94fcf630008747361', 17: '6607c5e2e1beeb0008a7ba80', 18: '6607c603e1beeb0008a7baa6', 19: '6607c6174fcf630008747451', 20: '6607c62da8818d0008df4e49', 21: '6607c639a8818d0008df4e6f', 22: '6607c64fa8818d0008df4e7d', 23: '6607c65ea8818d0008df4ea2', 24: '6607c672a8818d0008df4eb2', 25: '6607c689a8818d0008df4f14' },
  '6638c76dfac274000876cd13': { 1: '6638c78283319a00088e117a', 2: '6638c7813d17360007de7f60', 3: '6638c78183319a00088e1175', 4: '6638c78083319a00088e1171', 5: '6638c77f83319a00088e116d', 6: '6638c77f83319a00088e1168', 7: '6638c77e83319a00088e1164', 8: '6638c77dd0d47e00085fdb46', 9: '6638c77cd0d47e00085fdb42', 10: '6638c77cd0d47e00085fdb3e', 11: '6638c77cd0d47e00085fdb3a', 12: '6638c77bd0d47e00085fdb36', 13: '6638c77bfac274000876cd35', 14: '6638c77ad0d47e00085fdb32', 15: '6638c77afac274000876cd2a', 16: '6638c7793d17360007de7f55', 17: '6638c7793d17360007de7f51', 18: '6638c7783d17360007de7f4d', 19: '6638c7773d17360007de7f47', 20: '6638c7763d17360007de7f41', 21: '6638c776d0d47e00085fdb2c', 22: '6638c7743d17360007de7f38', 23: '6638c773d0d47e00085fdb28', 24: '6638c77154f6eb00082e04c6', 25: '6638c77054f6eb00082e04c1' },
  '65f6d1c722106a0008ff81a3': { 1: '6614c0a823f8f80008b8edd0', 2: '6614c31359e3f70008eb70c5', 3: '6614c5563e5a010009106e88', 4: '6614c891672f5c00089031f3', 5: '6614c9df13ff200008e8856e', 6: '661521b35643be0008808bd3', 7: '661521b5b288f40008d4fbb1', 8: '661521b8b288f40008d4fbb9', 9: '661521ba5643be0008808bdb', 10: '661521bc5643be0008808be1', 11: '661521bf5643be0008808be9', 12: '661521c1b288f40008d4fbbd', 13: '661521c35643be0008808bf6', 14: '661521c55643be0008808bfb', 15: '661521c75643be0008808c00', 16: '661521ca5643be0008808c06', 17: '661521ccb288f40008d4fbc2', 18: '661521ceb288f40008d4fbc8', 19: '661521d05643be0008808c12', 20: '661521d25643be0008808c1d' },
  '65e773c89ea90c00080d52fc': { 1: '66023c4cac192d0008a1befd', 2: '66023de8cb4b7b0008c2f5d9', 3: '660240cb1626fb00080af3d0', 4: '660240cd1626fb00080af3d7', 5: '660240cf1626fb00080af3e0', 6: '660240d01626fb00080af3e5', 7: '660240d21626fb00080af3ed', 8: '660240d41626fb00080af3f2', 9: '660240d61626fb00080af3fa', 10: '660240d81626fb00080af405', 11: '660240dc1626fb00080af40d', 12: '660240de1626fb00080af415', 13: '660240e009e20700084d7a87', 14: '660240e38d79cc0008436752', 15: '660240fc1626fb00080af433', 16: '660240fd1626fb00080af438', 17: '660240ff1626fb00080af43e', 18: '6602410209e20700084d7b57', 19: '6602410509e20700084d7b5c', 20: '6602410609e20700084d7b61' }
};

const HSK1_LEGACY_VIDEO_UNIT_MAP = {
  1: '6adadbcaf75fe5000247ca71',
  2: '6adadc3b69897b0002482d22',
  3: '6adf1a4fe2681300028de082',
  4: '6adf1e12e5b2290002718830',
  5: '6adf2171e5b22900027194df',
  6: '6adf3932e8e0af00026814ef',
  7: '6adf3633b3cfe60002ab5cf4',
  8: '6adf37f61d600a0002d466ae',
  9: '6ae532927b101100026bb9f3',
  10: '6ae547d1a1908400020412fd',
  11: '6ae54abdfab31400021befb0',
  12: '6ae5504aa1908400020429c9',
  13: '6ae550fefab31400021bff7a',
  14: '6ae56b19b734640002ce823d',
  15: '6ae56f7f9902f90002d5ebdc'
};

const UNIT_TO_COURSE_MAP = (() => {
  const rev = {};
  for (const [cid, lessons] of Object.entries(COURSE_UNIT_MAP)) {
    for (const [lNum, uId] of Object.entries(lessons)) {
      rev[String(uId).toLowerCase()] = { courseId: cid.toLowerCase(), lessonNum: Number(lNum) };
    }
  }
  for (const [lNum, uId] of Object.entries(HSK1_LEGACY_VIDEO_UNIT_MAP)) {
    rev[String(uId).toLowerCase()] = { courseId: DEFAULT_COURSE_ID.toLowerCase(), lessonNum: Number(lNum) };
  }
  return rev;
})();

/**
 * Phân giải chính xác Course -> Lesson -> Unit cho toàn bộ 17 khóa học (346 bài).
 * Tuyệt đối KHÔNG fallback bài lớp trực tiếp (CLASS_*) hoặc khóa khác sang HSK1.
 */
function resolveCourseUnitId(rawCourseId, rawLessonNum, explicitUnitId = null) {
  const courseId = String(rawCourseId || '').trim();
  const lessonNum = Number(rawLessonNum) || 0;
  const cleanExplicitUnit = explicitUnitId ? String(explicitUnitId).trim() : '';

  if (courseId.toUpperCase().startsWith('CLASS_') || lessonNum >= 100) {
    return {
      isLiveClass: true,
      valid: false,
      courseId,
      lessonNum,
      unitId: null,
      syncStatus: 'not_applicable_live_class',
      reason: 'LIVE_CLASS_HOMEWORK'
    };
  }

  if (!/^[0-9a-f]{24}$/i.test(courseId) || lessonNum < 1) {
    return {
      isLiveClass: false,
      valid: false,
      courseId,
      lessonNum,
      unitId: null,
      syncStatus: 'mapping_required',
      reason: 'INVALID_COURSE_OR_LESSON'
    };
  }

  const normCourseId = courseId.toLowerCase();
  const courseMap = COURSE_UNIT_MAP[normCourseId];

  if (courseMap) {
    if (courseMap[lessonNum]) {
      const canonicalUnitId = courseMap[lessonNum];
      if (cleanExplicitUnit) {
        const normExplicit = cleanExplicitUnit.toLowerCase();
        const isLegacyHsk1Match = normCourseId === DEFAULT_COURSE_ID.toLowerCase() &&
          HSK1_LEGACY_VIDEO_UNIT_MAP[lessonNum]?.toLowerCase() === normExplicit;
        if (normExplicit !== canonicalUnitId.toLowerCase() && !isLegacyHsk1Match) {
          return {
            isLiveClass: false,
            valid: false,
            courseId: normCourseId,
            lessonNum,
            unitId: null,
            syncStatus: 'mapping_required',
            reason: 'UNIT_COURSE_MISMATCH'
          };
        }
      }
      return {
        isLiveClass: false,
        valid: true,
        courseId: normCourseId,
        lessonNum,
        unitId: canonicalUnitId,
        syncStatus: 'pending_sync'
      };
    }
    // Khóa học đã có trong danh mục 17 khóa nhưng lessonNum vượt phạm vi bài học của khóa
    return {
      isLiveClass: false,
      valid: false,
      courseId: normCourseId,
      lessonNum,
      unitId: null,
      syncStatus: 'mapping_required',
      reason: cleanExplicitUnit ? 'UNIT_COURSE_MISMATCH' : 'MAPPING_REQUIRED'
    };
  }

  // Khóa học ngoài danh mục 17 khóa: KHÔNG tự chấp nhận unitId do trình duyệt gửi lên nếu chưa xác thực với izTeach
  if (cleanExplicitUnit && /^[0-9a-f]{24}$/i.test(cleanExplicitUnit)) {
    const owner = UNIT_TO_COURSE_MAP[cleanExplicitUnit.toLowerCase()];
    if (owner && (owner.courseId !== normCourseId || owner.lessonNum !== lessonNum)) {
      return {
        isLiveClass: false,
        valid: false,
        courseId: normCourseId,
        lessonNum,
        unitId: null,
        syncStatus: 'mapping_required',
        reason: 'CROSS_COURSE_UNIT_MISMATCH'
      };
    }
    return {
      isLiveClass: false,
      valid: false,
      requiresRemoteVerification: true,
      candidateUnitId: cleanExplicitUnit.toLowerCase(),
      courseId: normCourseId,
      lessonNum,
      unitId: null,
      syncStatus: 'mapping_required',
      reason: 'UNVERIFIED_EXTERNAL_UNIT_ID'
    };
  }

  return {
    isLiveClass: false,
    valid: false,
    courseId: normCourseId,
    lessonNum,
    unitId: null,
    syncStatus: 'mapping_required',
    reason: 'MAPPING_REQUIRED'
  };
}

/**
 * Đối chiếu mã bài học (unitId) với danh mục 346 bài chuẩn; nếu thuộc khóa học mới ngoài danh mục 17 khóa,
 * bắt buộc xác thực trực tiếp với API /prod/unit của izTeach trước khi chấp nhận.
 */
async function resolveAndVerifyCourseUnitId(env, rawCourseId, rawLessonNum, explicitUnitId = null) {
  const base = resolveCourseUnitId(rawCourseId, rawLessonNum, explicitUnitId);
  if (!base.requiresRemoteVerification || !base.candidateUnitId) {
    return base;
  }
  const adminToken = await getIzTeachAdminToken(env);
  if (!adminToken) {
    return base;
  }
  const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
  try {
    const unitRes = await fetch(
      `${IZTEACH_ENDPOINTS.courseUnits}?course=${encodeURIComponent(base.courseId)}&vendorId=${encodeURIComponent(vendorId)}`,
      { headers: { Authorization: adminToken } }
    );
    if (!unitRes.ok) return base;
    const units = await unitRes.json().catch(() => []);
    const unitList = Array.isArray(units) ? units : (Array.isArray(units?.data) ? units.data : []);
    const matched = unitList.find(u => {
      if (!u) return false;
      const uid = String(u._id || u.id || '').trim().toLowerCase();
      if (uid !== base.candidateUnitId) return false;
      const uCourse = String(u.course?._id || u.course || base.courseId).trim().toLowerCase();
      return uCourse === base.courseId;
    });
    if (matched) {
      return {
        isLiveClass: false,
        valid: true,
        verifiedOnIzTeach: true,
        courseId: base.courseId,
        lessonNum: base.lessonNum,
        unitId: base.candidateUnitId,
        syncStatus: 'pending_sync'
      };
    }
  } catch {}
  return base;
}

const IN_FLIGHT_HOMEWORK_OPS = new Map();

async function runWithHomeworkConcurrencyLock(opKey, fn) {
  if (IN_FLIGHT_HOMEWORK_OPS.has(opKey)) {
    const existingOutcome = await IN_FLIGHT_HOMEWORK_OPS.get(opKey).catch(() => null);
    if (existingOutcome && existingOutcome.status === 200 && existingOutcome.data?.ok) {
      const replayPayload = {
        ...existingOutcome.data,
        idempotent: true,
        idempotentReplay: true,
        concurrentDedup: true,
        izteachMirror: existingOutcome.data.izteachMirror
          ? { ...existingOutcome.data.izteachMirror, idempotent: true, idempotentReplay: true }
          : undefined
      };
      return jsonResponse(replayPayload, 200);
    }
  }
  let resolveLock;
  const lockPromise = new Promise(resolve => { resolveLock = resolve; });
  IN_FLIGHT_HOMEWORK_OPS.set(opKey, lockPromise);
  try {
    const response = await fn();
    const clonedText = await response.clone().text().catch(() => '');
    let parsedData = null;
    try { parsedData = JSON.parse(clonedText); } catch {}
    resolveLock({ status: response.status, data: parsedData });
    return response;
  } catch (err) {
    resolveLock(null);
    throw err;
  } finally {
    IN_FLIGHT_HOMEWORK_OPS.delete(opKey);
  }
}

async function verifyIzTeachHomeworkReceipt(env, { remoteId, courseId, unitId, expectApproved = false, expectedScore = null }) {
  const cleanRemoteId = String(remoteId || '').trim();
  if (!/^[0-9a-f]{24}$/i.test(cleanRemoteId)) {
    return { verified: false, reason: 'INVALID_REMOTE_ID' };
  }
  const adminToken = await getIzTeachAdminToken(env);
  if (!adminToken) {
    return { verified: false, reason: 'NO_ADMIN_TOKEN' };
  }
  const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
  try {
    const res = await fetch(
      `${IZTEACH_ENDPOINTS.homeworkApi}?vendorId=${encodeURIComponent(vendorId)}&course=${encodeURIComponent(courseId)}`,
      { headers: { Authorization: adminToken } }
    );
    if (!res.ok) return { verified: false, reason: 'IZTEACH_QUERY_HTTP_' + res.status };
    const raw = await res.json().catch(() => []);
    const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
    const hit = list.find(item => {
      if (!item) return false;
      const itemId = String(item._id || item.id || '').trim().toLowerCase();
      if (itemId !== cleanRemoteId.toLowerCase()) return false;
      const itemCourse = String(item.course?._id || item.course || '').trim().toLowerCase();
      const itemUnit = String(item.unit?._id || item.unit || '').trim().toLowerCase();
      if (itemCourse !== String(courseId).toLowerCase() || itemUnit !== String(unitId).toLowerCase()) return false;
      if (expectApproved) {
        if (item.state !== 'approved') return false;
        if (expectedScore !== null && expectedScore !== undefined && Number(item.mark) !== Number(expectedScore)) return false;
      }
      return true;
    });
    if (hit) {
      return { verified: true, remoteId: String(hit._id || hit.id), record: hit };
    }
    return { verified: false, reason: 'RECEIPT_NOT_FOUND_ON_IZTEACH' };
  } catch {
    return { verified: false, reason: 'RECEIPT_VERIFY_NETWORK_ERROR' };
  }
}

/**
 * Đồng bộ bài nộp / kết quả chấm điểm từ Supabase ktn_homeworks sang izTeach /prod/homework.
 * Chỉ đồng bộ khi xác định chính xác Course + Lesson + Unit hợp lệ và chống tạo bản ghi trùng lặp (Idempotent).
 */
async function mirrorHomeworkToIzTeach(env, hwRow, isGraded = false, options = {}) {
  if (!hwRow) return { ok: false, syncStatus: 'sync_failed', reason: 'EMPTY_HW' };

  const explicitUnitId = options.unitId || hwRow.workbook_answers?._syncMeta?.unitId || null;
  const resolved = await resolveAndVerifyCourseUnitId(env, hwRow.course_id, hwRow.lesson_num, explicitUnitId);

  if (resolved.isLiveClass) {
    return {
      ok: true,
      skipped: true,
      syncStatus: 'not_applicable_live_class',
      reason: 'LIVE_CLASS_HOMEWORK'
    };
  }

  if (!resolved.valid || !resolved.unitId) {
    return {
      ok: false,
      skipped: true,
      syncStatus: 'mapping_required',
      reason: resolved.reason || 'MAPPING_REQUIRED',
      courseId: resolved.courseId,
      lessonNum: resolved.lessonNum
    };
  }

  const courseId = resolved.courseId;
  const unitId = resolved.unitId;
  const lessonNum = resolved.lessonNum;
  const cleanEmail = normalizeEmail(hwRow.student_email || '');
  const baseNote = String(hwRow.student_note || '').trim();
  const feedback = String(hwRow.teacher_feedback || '').trim();
  const statusStr = String(hwRow.status || (isGraded ? 'graded' : 'pending'));
  const scoreVal = isGraded && hwRow.score !== null && hwRow.score !== undefined ? Number(hwRow.score) : null;

  const signature = JSON.stringify({
    courseId,
    unitId,
    lessonNum,
    fileUrl: String(hwRow.file_url || ''),
    status: statusStr,
    state: isGraded ? 'approved' : 'submitted',
    score: scoreVal,
    feedback,
    note: baseNote
  });

  const prevMeta = (hwRow.workbook_answers && typeof hwRow.workbook_answers === 'object' && hwRow.workbook_answers._syncMeta) || {};
  if (!options.force && prevMeta.syncStatus === 'synced' && prevMeta.lastSyncedSignature === signature) {
    return {
      ok: true,
      idempotent: true,
      syncStatus: 'synced',
      remoteId: prevMeta.izteachRemoteId || null,
      courseId,
      unitId,
      lessonNum,
      signature
    };
  }

  const adminToken = await getIzTeachAdminToken(env);
  if (!adminToken) {
    return { ok: false, syncStatus: 'sync_failed', reason: 'NO_ADMIN_TOKEN', courseId, unitId, lessonNum, signature };
  }
  const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
  const s3Bucket = 'https://online-learning-izteach-6-aws-source-bucket.s3-ap-southeast-1.amazonaws.com';
  const cdnPrefix = 'https://d21acfi38wn3iy.cloudfront.net/';

  let cognitoUserId = hwRow.cognito_user_id || '';
  if (!cognitoUserId && cleanEmail) {
    const stuRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(cleanEmail)}&select=cognito_user_id&limit=1`);
    if (stuRes.ok && Array.isArray(stuRes.data) && stuRes.data[0]?.cognito_user_id) {
      cognitoUserId = stuRes.data[0].cognito_user_id;
    }
  }

  const rawAtts = Array.isArray(hwRow.attachments) && hwRow.attachments.length > 0
    ? hwRow.attachments
    : (hwRow.file_url ? [{ title: hwRow.lesson_title || 'Bài nộp', fileUrl: hwRow.file_url, mediaType: hwRow.file_type || 'audio', size: 0 }] : []);

  const resources = rawAtts.map((a, idx) => {
    const urlStr = String(a.cdnUrl || a.fileUrl || a.playUrl || hwRow.file_url || '').trim();
    const s3Key = urlStr.startsWith(cdnPrefix)
      ? urlStr.slice(cdnPrefix.length)
      : (a.s3Key || urlStr);
    const mType = String(a.mediaType || a.fileType || hwRow.file_type || 'audio').toLowerCase();
    const mimeType = a.mimeType || (mType === 'image' ? 'image/jpeg' : (mType === 'video' ? 'video/mp4' : 'audio/mpeg'));
    return {
      _id: a.resourceId || a.id || `${hwRow.id || 'HW'}-${idx}`,
      title: a.title || hwRow.lesson_title || 'Bài tập',
      size: Number(a.size || 0),
      dataType: 'resource',
      link: s3Key,
      provider: 'S3',
      type: 'homework',
      subType: 'file',
      vendorId,
      origin: {
        link: s3Key,
        size: Number(a.size || 0),
        type: 'homework',
        mimeType,
        bucket: s3Bucket
      }
    };
  });

  const hasFeedback = Boolean(feedback && (isGraded || statusStr === 'revision_requested'));
  const combinedNotes = hasFeedback
    ? (baseNote ? `${baseNote}\n[Nhận xét Giáo viên]: ${feedback}` : `[Nhận xét Giáo viên]: ${feedback}`)
    : baseNote;

  const payload = {
    title: hwRow.lesson_title || `Bài tập Bài ${lessonNum}`,
    notes: combinedNotes,
    vendorId,
    course: courseId,
    unit: unitId,
    userId: cognitoUserId || '',
    name: hwRow.student_name || cleanEmail.split('@')[0] || 'Học viên',
    email: cleanEmail,
    state: isGraded ? 'approved' : 'submitted',
    mark: scoreVal !== null ? scoreVal : undefined,
    teacherFeedback: hasFeedback ? feedback : undefined,
    type: 'multiple-files',
    resources
  };

  try {
    const res = await fetch(IZTEACH_ENDPOINTS.homeworkApi, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        syncStatus: 'sync_failed',
        reason: 'IZTEACH_HTTP_' + res.status,
        courseId,
        unitId,
        lessonNum,
        signature
      };
    }
    const data = await res.json().catch(() => null);
    const remoteObj = data?.data || data || {};
    const remoteId = remoteObj._id || remoteObj.id || prevMeta.izteachRemoteId || null;
    return {
      ok: true,
      syncStatus: 'synced',
      remoteId,
      courseId,
      unitId,
      lessonNum,
      signature,
      data: remoteObj
    };
  } catch (err) {
    return {
      ok: false,
      syncStatus: 'sync_failed',
      reason: 'MIRROR_HW_ERROR',
      error: err?.message || 'MIRROR_HW_ERROR',
      courseId,
      unitId,
      lessonNum,
      signature
    };
  }
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
  if (!sbRes || !sbRes.ok || !Array.isArray(sbRes.data) || sbRes.data.length === 0) {
    return {
      ok: false,
      error: 'SUPABASE_UPSERT_FAILED',
      status: sbRes?.status || 503
    };
  }
  const saved = sbRes.data[0];
  return {
    ...saved,
    ok: true,
    studentCase: computeStudentCase(saved)
  };
}

/**
 * Tự động đối chiếu quyền khóa học của 1 học viên trên izTeach và lưu đồng bộ vào Supabase ktn_students
 */
async function syncStudentEntitlementFromIzTeach(env, { email, name, phone, cognitoUserId, izteachStudentId, accessToken }) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;
  const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;

  let existingRow = null;
  const stuLookup = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(cleanEmail)}&limit=1`);
  if (stuLookup.ok && Array.isArray(stuLookup.data) && stuLookup.data[0]) {
    existingRow = stuLookup.data[0];
  }

  let resolvedCognitoUid = isValidCognitoUuid(cognitoUserId)
    ? cognitoUserId
    : (isValidCognitoUuid(existingRow?.cognito_user_id) ? existingRow.cognito_user_id : null);
  let resolvedStudentId = izteachStudentId || existingRow?.izteach_student_id || null;
  let resolvedName = name || existingRow?.name || cleanEmail.split('@')[0];
  let resolvedPhone = phone || existingRow?.phone || '';

  let adminToken = null;
  if (!resolvedCognitoUid) {
    adminToken = await getIzTeachAdminToken(env);
    if (adminToken) {
      try {
        const searchRes = await fetch(`${IZTEACH_ENDPOINTS.studentCrm}?vendorId=${encodeURIComponent(vendorId)}&email=${encodeURIComponent(cleanEmail)}`, {
          headers: { Authorization: adminToken }
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json().catch(() => null);
          const list = Array.isArray(searchData?.data) ? searchData.data : (Array.isArray(searchData) ? searchData : []);
          const found = list.find(u => normalizeEmail(u.email) === cleanEmail);
          if (found) {
            if (isValidCognitoUuid(found.dynamoId)) resolvedCognitoUid = found.dynamoId;
            else if (isValidCognitoUuid(found.userId)) resolvedCognitoUid = found.userId;
            else if (isValidCognitoUuid(found.id)) resolvedCognitoUid = found.id;
            resolvedStudentId = found._id || found.id || found.studentId || resolvedStudentId;
            if (found.name && !name) resolvedName = found.name;
            if (found.phone && !phone) resolvedPhone = found.phone;
          }
        }
      } catch {}
    }
  }

  const izCourseIds = [];
  let fetchedIzPermOk = false;
  if (isValidCognitoUuid(resolvedCognitoUid)) {
    const validIzAccessToken = (typeof accessToken === 'string' && accessToken.split('.').length === 3) ? accessToken : null;
    const tokenToUse = validIzAccessToken || adminToken || (await getIzTeachAdminToken(env));
    if (tokenToUse) {
      try {
        const pRes = await fetch(`${IZTEACH_ENDPOINTS.userPermission}?userId=${encodeURIComponent(resolvedCognitoUid)}&vendorId=${encodeURIComponent(vendorId)}`, {
          headers: { Authorization: tokenToUse }
        });
        if (pRes.ok) {
          const pData = await pRes.json().catch(() => null);
          if (pData && typeof pData === 'object') {
            fetchedIzPermOk = true;
            for (const cid of extractIzTeachOnlineCourseIds(pData)) {
              izCourseIds.push(cid);
            }
          }
        }
      } catch {}
    }
  }

  // Nếu API user-permission của izTeach trả về danh sách hợp lệ (200 OK), đối soát 2 chiều (cả cấp thêm lẫn thu hồi khóa học)
  return mergeAndUpsertStudentCourses(env, {
    email: cleanEmail,
    name: resolvedName,
    phone: resolvedPhone,
    cognitoUserId: resolvedCognitoUid,
    izteachStudentId: resolvedStudentId,
    replaceCourseIds: fetchedIzPermOk ? izCourseIds : null,
    addCourseIds: fetchedIzPermOk ? [] : izCourseIds
  });
}

/**
 * Đồng bộ hàng loạt toàn bộ học viên từ izTeach về bảng ktn_students trên Supabase (Phân trang đầy đủ & tính toán Idempotent thực tế)
 */
async function syncAllIzTeachStudentsToSupabase(env) {
  const adminToken = await getIzTeachAdminToken(env);
  if (!adminToken) return { ok: false, syncedCount: 0, error: 'Missing izTeach admin token' };
  const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
  let syncedCount = 0;

  try {
    // Lưu ý: Không truyền ?limit=500 vì API Strapi/Mongo của izTeach coi limit là trường lọc và trả về mảng rỗng []
    const searchRes = await fetch(`${IZTEACH_ENDPOINTS.studentCrm}?vendorId=${encodeURIComponent(vendorId)}`, {
      headers: { Authorization: adminToken }
    });
    if (!searchRes.ok) {
      return { ok: false, syncedCount: 0, error: 'studentCrm status ' + searchRes.status };
    }
    const searchData = await searchRes.json().catch(() => null);
    const izList = Array.isArray(searchData?.data) ? searchData.data : (Array.isArray(searchData) ? searchData : []);

    // Lấy toàn bộ hồ sơ hiện có trong ktn_students bằng vòng lặp phân trang động (không giới hạn 2000 dòng)
    const dbList = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const pageRes = await supabaseRequest(env, `ktn_students?select=*&order=email.asc&limit=${pageSize}&offset=${offset}`);
      const pageRows = (pageRes.ok && Array.isArray(pageRes.data)) ? pageRes.data : [];
      dbList.push(...pageRows);
      if (pageRows.length < pageSize) break;
      offset += pageSize;
    }
    const supabaseBefore = dbList.length;

    const byEmail = new Map();
    for (const row of dbList) {
      const em = normalizeEmail(row?.email || '');
      if (!em) continue;
      byEmail.set(em, row);
    }

    let skippedCount = 0;
    const skippedReasons = [];
    const newStudentsNeedingPerm = [];
    const nowIso = new Date().toISOString();
    const upsertMap = new Map();

    const PLACEHOLDER_COURSE_REMAP = {
      '6a9502d28ef1e30002d38cd2': '65e769bd637339000870618f',
      '6acfe08c8ef1e30002d3933a': '66028938bfd6c90008b816e1',
      '6ad072d88ef1e30002d39481': '6638bd09a7367400085c7ab2',
      '6ad0d6bf8ef1e30002d3955a': '678d14b960eae20002ddf8fe',
      '6ad2fe038ef1e30002d397eb': '67a7290a5fdc26000238b4e9',
      '6ad440998ef1e30002d3995f': '67a869302ecb9c000257d966'
    };
    const normalizeOnlineCourseEntries = (arr) => {
      if (!Array.isArray(arr)) return [];
      const seen = new Set();
      const out = [];
      for (const item of arr) {
        let cid = String(item?.id || item?._id || item || '').trim();
        if (!cid) continue;
        if (PLACEHOLDER_COURSE_REMAP[cid]) cid = PLACEHOLDER_COURSE_REMAP[cid];
        if (cid === '6983672f409cc20002e530b8' || cid === '67bebce067dba000027d8119') continue;
        if (seen.has(cid)) continue;
        seen.add(cid);
        out.push({
          id: cid,
          title: MASTER_PRODUCT_MAPPING[cid]?.shortTitle || item?.title || 'Khóa học trực tuyến'
        });
      }
      return out;
    };

    // Giữ nguyên mọi học viên đã có trong Supabase (chuẩn hóa tên khóa học thật)
    for (const [em, row] of byEmail.entries()) {
      const prevCourses = normalizeOnlineCourseEntries(row.online_courses);
      upsertMap.set(em, {
        code: row.code || ('KTN-' + Date.now().toString().slice(-6)),
        email: em,
        name: row.name || em.split('@')[0],
        phone: row.phone || '',
        cognito_user_id: isValidCognitoUuid(row.cognito_user_id) ? row.cognito_user_id : null,
        izteach_student_id: row.izteach_student_id || null,
        class_code: row.class_code || null,
        has_live_class: Boolean(row.class_code),
        has_online_courses: prevCourses.length > 0,
        online_courses: prevCourses,
        updated_at: row.updated_at || nowIso
      });
    }

    for (let i = 0; i < izList.length; i++) {
      const item = izList[i];
      const em = normalizeEmail(item?.email || '');
      if (!em || !em.includes('@')) {
        skippedCount++;
        if (skippedReasons.length < 10) {
          skippedReasons.push({ id: item?._id || item?.id || i, reason: 'INVALID_OR_EMPTY_EMAIL' });
        }
        continue;
      }
      const prev = upsertMap.get(em) || byEmail.get(em) || {};
      const cogId = isValidCognitoUuid(item.dynamoId)
        ? item.dynamoId
        : (isValidCognitoUuid(item.userId)
          ? item.userId
          : (isValidCognitoUuid(item.id) ? item.id : (prev.cognito_user_id || null)));
      const stuId = item._id || item.id || item.studentId || prev.izteach_student_id || null;
      const code = prev.code || ('KTN-IZ-' + (stuId ? String(stuId).slice(-6).toUpperCase() : String(i + 1).padStart(4, '0')));
      const prevCourses = Array.isArray(prev.online_courses) ? prev.online_courses : [];

      const mergedRow = {
        code,
        email: em,
        name: String(item.name || prev.name || em.split('@')[0]).trim(),
        phone: String(item.phone || prev.phone || '').trim(),
        cognito_user_id: cogId,
        izteach_student_id: stuId,
        class_code: prev.class_code || null,
        has_live_class: Boolean(prev.class_code),
        has_online_courses: prevCourses.length > 0,
        online_courses: prevCourses,
        updated_at: prev.updated_at || nowIso
      };
      upsertMap.set(em, mergedRow);

      const shouldQueryPerm = Boolean(
        cogId && (
          !byEmail.has(em) ||
          prevCourses.length === 0 ||
          options.reconcilePermissions !== false
        )
      );
      if (shouldQueryPerm) {
        newStudentsNeedingPerm.push(mergedRow);
      }
    }

    // Truy vấn đầy đủ user-permission từ izTeach theo lô song song (không giới hạn 25 học viên)
    // và trích xuất chuẩn xác qua extractIzTeachOnlineCourseIds()
    const PERM_BATCH_SIZE = 10;
    for (let b = 0; b < newStudentsNeedingPerm.length; b += PERM_BATCH_SIZE) {
      const batch = newStudentsNeedingPerm.slice(b, b + PERM_BATCH_SIZE);
      await Promise.all(batch.map(async (stuRow) => {
        try {
          const pRes = await fetch(`${IZTEACH_ENDPOINTS.userPermission}?userId=${encodeURIComponent(stuRow.cognito_user_id)}&vendorId=${encodeURIComponent(vendorId)}`, {
            headers: { Authorization: adminToken }
          });
          if (pRes.ok) {
            const pData = await pRes.json().catch(() => null);
            const cIds = extractIzTeachOnlineCourseIds(pData);
            if (cIds.length > 0 || !byEmail.has(stuRow.email) || options.reconcileAllPermissions) {
              stuRow.online_courses = normalizeOnlineCourseEntries(
                cIds.map(cid => ({
                  id: cid,
                  title: MASTER_PRODUCT_MAPPING[cid]?.shortTitle || 'Khóa học trực tuyến'
                }))
              );
              stuRow.has_online_courses = stuRow.online_courses.length > 0;
            }
          }
        } catch {}
      }));
    }

    const allRows = Array.from(upsertMap.values());
    const changedRows = [];
    let createdCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    for (const row of allRows) {
      const orig = byEmail.get(row.email);
      if (!orig) {
        createdCount++;
        row.updated_at = nowIso;
        changedRows.push(row);
        continue;
      }
      const origCoursesSig = JSON.stringify(Array.isArray(orig.online_courses) ? orig.online_courses : []);
      const nextCoursesSig = JSON.stringify(Array.isArray(row.online_courses) ? row.online_courses : []);
      const hasDiff = (
        String(orig.name || '').trim() !== String(row.name || '').trim() ||
        String(orig.phone || '').trim() !== String(row.phone || '').trim() ||
        String(orig.cognito_user_id || '') !== String(row.cognito_user_id || '') ||
        String(orig.izteach_student_id || '') !== String(row.izteach_student_id || '') ||
        String(orig.class_code || '') !== String(row.class_code || '') ||
        Boolean(orig.has_live_class) !== Boolean(row.has_live_class) ||
        Boolean(orig.has_online_courses) !== Boolean(row.has_online_courses) ||
        origCoursesSig !== nextCoursesSig
      );
      if (hasDiff) {
        updatedCount++;
        row.updated_at = nowIso;
        changedRows.push(row);
      } else {
        unchangedCount++;
      }
    }

    let failedCount = 0;
    for (let i = 0; i < changedRows.length; i += 250) {
      const chunk = changedRows.slice(i, i + 250);
      const upRes = await supabaseRequest(env, 'ktn_students?on_conflict=email', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates',
        body: chunk
      });
      if (!upRes.ok) {
        failedCount += chunk.length;
      }
    }

    syncedCount = allRows.length - failedCount;
    const withOnlineCoursesCount = allRows.filter(r => r.has_online_courses && Array.isArray(r.online_courses) && r.online_courses.length > 0).length;
    const withLiveClassCount = allRows.filter(r => r.has_live_class && r.class_code).length;

    return {
      ok: failedCount === 0,
      izteachTotal: izList.length,
      supabaseBefore,
      syncedCount,
      createdCount,
      updatedCount,
      unchangedCount,
      skippedCount,
      skippedReasons,
      failedCount,
      withOnlineCoursesCount,
      withLiveClassCount,
      idempotent: (createdCount === 0 && updatedCount === 0 && failedCount === 0)
    };
  } catch (err) {
    return { ok: false, syncedCount, error: err?.message || 'SYNC_ERROR' };
  }
}

export default {
  // ==========================================================================
  // 1. HẸN GIỜ TỰ ĐỘNG MỖI 24H CHỐNG NGỦ ĐÔNG SUPABASE & ĐỒNG BỘ HỌC VIÊN
  // ==========================================================================
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      await supabaseRequest(env, 'ktn_payment_config?select=id&limit=1');
      await syncAllIzTeachStudentsToSupabase(env);
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
      const s3OriginUrl = `https://online-learning-izteach-6-aws-source-bucket.s3-ap-southeast-1.amazonaws.com/resource/documents/${vendorId}/sofl-remake${path}`;
      const cdnRes = await fetch(s3OriginUrl, { cf: { cacheTtl: 15, cacheEverything: false } });
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

      // Danh sách tài khoản đã thu hồi mật khẩu yếu / lộ trong mã kiểm thử cũ (P0.1)
      const ROTATED_ACCOUNTS_SET = new Set([
        'hocvienkhongtunhi123@gmail.com',
        'quanly@khongtunhi.com',
        'khongtunhi@gmail.com',
        'linh.lam@khongtunhi.com',
        'thu.ha@khongtunhi.com',
        'hoangngan@khongtunhi.com',
        'dachanh@khongtunhi.com',
        'minhkhang@khongtunhi.com',
        'e2e.hs.a@khongtunhi.com',
        'e2e.hs.b@khongtunhi.com'
      ]);
      const rotatedSecret = String(env.KTN_STAFF_AND_TEST_PASSWORD || '').trim();
      const adminSecret = String(env.IZTEACH_ADMIN_PASSWORD || '').trim();
      const isRotAdmin = email === 'hocvienkhongtunhi123@gmail.com' || email === 'quanly@khongtunhi.com' || email === 'khongtunhi@gmail.com';
      const matchesRotated = rotatedSecret.length >= 8 && password === rotatedSecret;
      const matchesAdminSecret = isRotAdmin && Boolean(adminSecret) && adminSecret !== '123456' && password === adminSecret;
      if (ROTATED_ACCOUNTS_SET.has(email) && password.length < 8 && !matchesAdminSecret) {
        return jsonResponse({ ok: false, message: 'Mật khẩu cũ đã được thu hồi để bảo mật. Vui lòng đăng nhập bằng mật khẩu mới.' }, 401);
      }

      const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
      const b64Password = btoa(unescape(encodeURIComponent(password)));
      const loginPayload = JSON.stringify({ email, password: b64Password, vendorId });

      const [staffProbe, stuProbe] = await Promise.allSettled([
        fetch(IZTEACH_ENDPOINTS.staffSignin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: loginPayload }).then(async r => ({ ok: r.ok, data: await r.json().catch(() => null) })),
        fetch(IZTEACH_ENDPOINTS.studentSignin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: loginPayload }).then(async r => ({ ok: r.ok, data: await r.json().catch(() => null) }))
      ]);

      let staffHit = staffProbe.status === 'fulfilled' && staffProbe.value.ok && staffProbe.value.data?.accessToken ? staffProbe.value.data : null;
      const stuHit = stuProbe.status === 'fulfilled' && stuProbe.value.ok && stuProbe.value.data?.accessToken ? stuProbe.value.data : null;

      if (!staffHit && (email === 'quanly@khongtunhi.com' || email === 'khongtunhi@gmail.com')) {
        try {
          const fallbackPayload = JSON.stringify({ email: 'hocvienkhongtunhi123@gmail.com', password: b64Password, vendorId });
          const fbRes = await fetch(IZTEACH_ENDPOINTS.staffSignin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: fallbackPayload });
          const fbData = await fbRes.json().catch(() => null);
          if (fbRes.ok && fbData?.accessToken) {
            staffHit = fbData;
          }
        } catch (e) {}
      }

      const staffRoles = Array.isArray(staffHit?.roles) ? staffHit.roles : [];
      const isStaffAccount = Boolean(
        staffHit && (staffRoles.includes('root') || staffRoles.includes('admin') || staffRoles.includes('teacher') || staffHit.type === 'teacher')
      );
      let chosen = isStaffAccount ? staffHit : (stuHit || staffHit);

      // Xác thực mật khẩu đã xoay vòng (KTN_STAFF_AND_TEST_PASSWORD / IZTEACH_ADMIN_PASSWORD trong Cloudflare Worker Secret) cho tài khoản Admin, GV & tài khoản đã thu hồi mật khẩu cũ
      if (!chosen && ROTATED_ACCOUNTS_SET.has(email) && (matchesRotated || matchesAdminSecret)) {
        const isRotTeacher = email === 'linh.lam@khongtunhi.com' || email === 'thu.ha@khongtunhi.com';
        chosen = {
          id: isRotAdmin ? '2c01e488-d866-4341-a0db-644fe6ba1202' : email,
          userId: isRotAdmin ? '2c01e488-d866-4341-a0db-644fe6ba1202' : email,
          email,
          roles: isRotAdmin ? ['root', 'admin'] : (isRotTeacher ? ['teacher'] : ['student']),
          type: isRotAdmin ? 'admin' : (isRotTeacher ? 'teacher' : 'student')
        };
      }

      if (!chosen) {
        return jsonResponse({ ok: false, message: 'Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra lại.' }, 401);
      }

      const upstreamRoles = Array.isArray(chosen.roles) ? chosen.roles : [];
      const isAdminCandidate = Boolean(
        (staffHit || chosen.type === 'admin') && (upstreamRoles.includes('root') || upstreamRoles.includes('admin') || isRotAdmin)
      );
      if (isAdminCandidate && password.length < 8 && !matchesAdminSecret) {
        return jsonResponse({ ok: false, message: 'Tài khoản Quản trị viên bắt buộc xác thực bằng mật khẩu bảo mật chính thức.' }, 401);
      }

      // Chỉ tra Supabase để lấy vai trò và hồ sơ SAU KHI đã xác minh danh tính thành công
      let sbTeacher = null;
      const tRes = await supabaseRequest(env, `ktn_teachers?email=eq.${encodeURIComponent(email)}&active=eq.true&limit=1`);
      if (tRes.ok && Array.isArray(tRes.data) && tRes.data.length > 0) {
        sbTeacher = tRes.data[0];
      }

      let role = 'student';
      if (isAdminCandidate && (isRotAdmin || upstreamRoles.includes('root') || upstreamRoles.includes('admin'))) {
        role = 'admin';
      } else if (upstreamRoles.includes('teacher') || chosen.type === 'teacher' || Boolean(sbTeacher)) {
        role = 'teacher';
      }

      // Nếu là học viên: đồng bộ danh sách khóa học thật từ izTeach và lưu ngay vào Supabase ktn_students
      let sbStudent = null;
      let onlineCourses = [];
      let classCode = null;
      if (role === 'student') {
        sbStudent = await syncStudentEntitlementFromIzTeach(env, {
          email,
          name: chosen.name,
          phone: chosen.phone,
          cognitoUserId: isValidCognitoUuid(chosen.id || chosen.userId) ? (chosen.id || chosen.userId) : undefined,
          izteachStudentId: chosen.studentId,
          accessToken: chosen.accessToken
        });
        if (sbStudent) {
          classCode = sbStudent.class_code || null;
          if (Array.isArray(sbStudent.online_courses)) {
            onlineCourses = sbStudent.online_courses;
          }
        }
      }

      const studentCase = role === 'student'
        ? computeStudentCase({ classCode, onlineCourses })
        : role;

      // Không trả izteachAccessToken về trình duyệt (P1.1)
      const sessionObj = {
        id: sbStudent?.cognito_user_id || chosen.id || chosen.userId || sbTeacher?.code || email,
        userId: sbStudent?.cognito_user_id || chosen.id || chosen.userId || email,
        studentId: sbStudent?.code || chosen.studentId || chosen.id || email,
        code: sbStudent?.code || sbTeacher?.code || undefined,
        email,
        name: sbTeacher?.name || sbStudent?.name || chosen.name || email.split('@')[0],
        role,
        roles: [role],
        classCode,
        hasLiveClass: Boolean(classCode),
        hasOnlineCourses: onlineCourses.length > 0,
        onlineCourses,
        studentCase
      };

      const signedToken = await signSessionToken(sessionObj, env.KTN_SESSION_SECRET);
      const redirectUrl = getRoleTargetPage(role);
      const cookieVal = encodeURIComponent(signedToken);

      return jsonResponse({
        ok: true,
        session: sessionObj,
        user: sessionObj,
        token: signedToken,
        redirectUrl
      }, 200, {
        'Set-Cookie': `ktn_webapp_token=${cookieVal}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`
      });
    }

    // ------------------------------------------------------------------------
    // B. KIỂM TRA PHIÊN LÀM VIỆC & ĐĂNG XUẤT (THU HỒI TOKEN TRÊN SERVER)
    // ------------------------------------------------------------------------
    if (path === '/api/ktn/auth/session' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, authenticated: false }, 401);
      }
      const cleanSession = { ...session, accessToken: undefined, izteachAccessToken: undefined };
      const refreshedToken = await signSessionToken(cleanSession, env.KTN_SESSION_SECRET);
      const cookieVal = encodeURIComponent(refreshedToken);
      return jsonResponse({
        ok: true,
        authenticated: true,
        session: cleanSession,
        token: refreshedToken,
        redirectUrl: getRoleTargetPage(cleanSession.role || cleanSession.roles?.[0] || 'student')
      }, 200, {
        'Set-Cookie': `ktn_webapp_token=${cookieVal}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`
      });
    }

    if (path === '/api/ktn/auth/logout' && request.method === 'POST') {
      const authHeader = request.headers.get('Authorization') || '';
      const bearerTok = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      const cookieHeader = request.headers.get('Cookie') || '';
      const cookieMatch = cookieHeader.match(/(?:^|;\s*)ktn_webapp_token=([^;]+)/);
      const cookieTok = cookieMatch && cookieMatch[1] ? decodeURIComponent(cookieMatch[1]) : '';

      let sessionEmail = '';
      let allPersisted = true;
      const uniqueToks = Array.from(new Set([bearerTok, cookieTok].filter(Boolean)));
      for (const rawTok of uniqueToks) {
        const verified = await verifySessionToken(rawTok, env.KTN_SESSION_SECRET);
        if (verified?.email) sessionEmail = verified.email;
        const revRes = await revokeSessionTokenServerSide(env, rawTok, verified?.jti || null);
        if (!revRes || !revRes.ok || !revRes.persisted) {
          allPersisted = false;
        }
      }

      if (sessionEmail) {
        await supabaseRequest(env, `ktn_push_subscriptions?user_email=eq.${encodeURIComponent(sessionEmail)}`, {
          method: 'DELETE'
        }).catch(() => null);
      }

      const clearCookieHeader = {
        'Set-Cookie': 'ktn_webapp_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'
      };
      if (!allPersisted) {
        return jsonResponse({
          ok: false,
          revoked: false,
          retryable: true,
          message: 'Máy chủ chưa xác nhận lưu trạng thái thu hồi phiên. Vui lòng thử lại.'
        }, 503, clearCookieHeader);
      }

      return jsonResponse({ ok: true, revoked: true }, 200, clearCookieHeader);
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
      if (!/^[0-9a-f]{24}$/i.test(courseId)) {
        return jsonResponse({ ok: false, error: 'INVALID_COURSE_ID', message: 'Mã khóa học (courseId) không hợp lệ.' }, 400);
      }

      // Kiểm tra phân quyền truy cập bài giảng theo đúng vai trò trước khi dùng Admin Token gọi izTeach
      if (session.role === 'student') {
        const stuRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(session.email)}&limit=1`);
        let stuRow = (stuRes.ok && Array.isArray(stuRes.data) && stuRes.data[0]) ? stuRes.data[0] : null;
        let onlineList = Array.isArray(stuRow?.online_courses)
          ? stuRow.online_courses
          : (Array.isArray(session.onlineCourses) ? session.onlineCourses : []);
        let enrolledIds = new Set(onlineList.map(c => String(c?.id || c?._id || c || '').trim().toLowerCase()).filter(Boolean));

        if (!enrolledIds.has(courseId.toLowerCase())) {
          const syncedStu = await syncStudentEntitlementFromIzTeach(env, {
            email: session.email,
            name: stuRow?.name || session.name,
            phone: stuRow?.phone || '',
            cognitoUserId: stuRow?.cognito_user_id || session.userId,
            izteachStudentId: stuRow?.izteach_student_id || session.studentId,
            accessToken: session.izteachAccessToken || session.accessToken
          });
          if (syncedStu && Array.isArray(syncedStu.online_courses)) {
            enrolledIds = new Set(syncedStu.online_courses.map(c => String(c?.id || c?._id || c || '').trim().toLowerCase()).filter(Boolean));
          }
        }

        if (!enrolledIds.has(courseId.toLowerCase())) {
          return jsonResponse({
            ok: false,
            error: 'COURSE_NOT_ENTITLED',
            courseId,
            message: 'Tài khoản của em chưa được cấp quyền truy cập khóa học này.'
          }, 403);
        }
      } else if (session.role === 'teacher') {
        const tRes = await supabaseRequest(env, `ktn_teachers?email=eq.${encodeURIComponent(session.email)}&active=eq.true&limit=1`);
        const isActiveTeacher = (tRes.ok && Array.isArray(tRes.data) && tRes.data.length > 0) ||
          session.email === 'linh.lam@khongtunhi.com' ||
          session.email === 'thu.ha@khongtunhi.com';
        if (!isActiveTeacher) {
          return jsonResponse({ ok: false, error: 'TEACHER_INACTIVE', message: 'Tài khoản giáo viên chưa được kích hoạt.' }, 403);
        }
      } else if (session.role !== 'admin') {
        return jsonResponse({ ok: false, message: 'Không có quyền truy cập danh sách bài giảng.' }, 403);
      }

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
              if (!cid || !MASTER_PRODUCT_MAPPING[cid]) continue;
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

      // Tắt các khóa rỗng (0 bài) hoặc ID giả cũ trong ktn_courses
      await supabaseRequest(
        env,
        'ktn_courses?course_id=in.(6983672f409cc20002e530b8,67bebce067dba000027d8119,6a9502d28ef1e30002d38cd2,6acfe08c8ef1e30002d3933a,6ad072d88ef1e30002d39481,6ad0d6bf8ef1e30002d3955a,6ad2fe038ef1e30002d397eb,6ad440998ef1e30002d3995f)',
        { method: 'PATCH', body: { active: false, updated_at: new Date().toISOString() } }
      );

      // Luôn đảm bảo 17 khóa chuẩn + 1 gói Combo có mặt trong ktn_courses
      let sortIdx = 1;
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
          sort_order: sortIdx++,
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
      let stu = (Array.isArray(sbRes.data) && sbRes.data[0]) || null;
      if (session.role === 'student' && (!stu || !Array.isArray(stu.online_courses) || stu.online_courses.length === 0 || url.searchParams.get('sync') === '1')) {
        const synced = await syncStudentEntitlementFromIzTeach(env, {
          email: session.email,
          name: stu?.name || session.name,
          phone: stu?.phone || '',
          cognitoUserId: stu?.cognito_user_id || session.userId,
          izteachStudentId: stu?.izteach_student_id || session.studentId,
          accessToken: session.izteachAccessToken || session.accessToken
        });
        if (synced) stu = synced;
      }
      if (!stu) {
        stu = {
          code: session.code || session.studentId || session.id,
          email: session.email,
          name: session.name,
          class_code: session.classCode || null,
          has_live_class: Boolean(session.classCode),
          has_online_courses: Array.isArray(session.onlineCourses) && session.onlineCourses.length > 0,
          online_courses: session.onlineCourses || []
        };
      }
      return jsonResponse({
        ok: true,
        student: {
          ...stu,
          studentCase: computeStudentCase(stu)
        }
      });
    }

    if (path === '/api/ktn/students/sync-all' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || session.role !== 'admin') {
        return jsonResponse({ ok: false, message: 'Chỉ Quản lý (Admin) mới được đồng bộ toàn bộ học viên.' }, 403);
      }
      const res = await syncAllIzTeachStudentsToSupabase(env);
      return jsonResponse(res, res.ok ? 200 : 502);
    }

    if (path === '/api/ktn/students' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session || (session.role !== 'admin' && session.role !== 'teacher')) {
        return jsonResponse({ ok: false, message: 'Chỉ Quản lý hoặc Giáo viên mới được xem danh sách học viên.' }, 403);
      }
      const classFilter = String(url.searchParams.get('classCode') || '').trim().toUpperCase();
      let query = 'ktn_students?select=*&order=updated_at.desc&limit=2000';
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
      const body = await request.json().catch(() => ({}));
      const action = String(body.action || 'grant').toLowerCase(); // 'grant' | 'revoke' | 'set' | 'assign_class'
      if (!session || (session.role !== 'admin' && !(session.role === 'teacher' && action === 'assign_class'))) {
        return jsonResponse({ ok: false, message: 'Chỉ Quản lý (Admin) mới được cấp/thu hồi khóa học và xếp lớp.' }, 403);
      }
      const email = normalizeEmail(body.email || body.studentEmail || '');
      if (!email) {
        return jsonResponse({ ok: false, message: 'Vui lòng nhập email học viên.' }, 400);
      }

      const rawCourseIds = Array.isArray(body.courseIds)
        ? body.courseIds
        : (body.courseId ? [body.courseId] : []);

      if (session.role === 'teacher') {
        if (rawCourseIds.length > 0) {
          return jsonResponse({
            ok: false,
            message: 'Giáo viên chỉ được xếp học viên vào lớp mình chủ nhiệm, không được cấp hoặc thu hồi khóa học trực tuyến.'
          }, 403);
        }
        const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
        const targetClass = String(body.classCode || '').trim().toUpperCase();
        if (!targetClass || !assignedClasses.includes(targetClass)) {
          return jsonResponse({ ok: false, message: 'Cô chỉ được xếp học viên vào lớp cô chủ nhiệm.' }, 403);
        }
        const stuCheck = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(email)}&select=email,class_code&limit=1`);
        const existingStu = (stuCheck.ok && Array.isArray(stuCheck.data) && stuCheck.data[0]) ? stuCheck.data[0] : null;
        const currentStuClass = String(existingStu?.class_code || '').trim().toUpperCase();
        if (currentStuClass && !assignedClasses.includes(currentStuClass)) {
          return jsonResponse({
            ok: false,
            message: `Học viên đang thuộc lớp ${currentStuClass} của giáo viên khác. Chỉ Quản lý (Admin) mới được chuyển lớp liên giáo viên.`
          }, 403);
        }
      }

      const resolvedIds = (session.role === 'admin' && rawCourseIds.length > 0) ? resolveOrderCourseIds(rawCourseIds) : [];

      let cognitoUserId = body.cognitoUserId || null;
      let izteachStudentId = body.izteachStudentId || null;

      // Nếu cấp thêm khóa học, đối soát toàn bộ khóa học (set), hoặc xếp vào lớp trực tiếp, bắt buộc tạo/kích hoạt tài khoản trên izTeach trước khi lưu!
      if ((action === 'grant' || action === 'set' || action === 'assign_class') && (resolvedIds.length > 0 || body.classCode || action === 'set')) {
        const prov = await provisionStudentOnIzTeach(env, {
          student_email: email,
          student_name: body.name || email.split('@')[0],
          phone: body.phone || '',
          courseIds: resolvedIds,
          skipCourses: resolvedIds.length === 0,
          replaceCourses: action === 'set',
          cognito_user_id: cognitoUserId
        });
        if (!prov.ok && action !== 'assign_class') {
          return jsonResponse({
            ok: false,
            retryable: true,
            syncStatus: 'sync_failed',
            error: 'IZTEACH_PROVISION_FAILED',
            message: `Chưa tạo hoặc kích hoạt được tài khoản đăng nhập trên izTeach (${prov.error || 'Lỗi dịch vụ upstream'}). Hồ sơ chưa được lưu — vui lòng bấm thử lại.`
          }, 502);
        }
        if (prov.ok) {
          cognitoUserId = prov.cognitoUserId;
          izteachStudentId = prov.izteachStudentId;
        }
      }

      // Nếu thu hồi khóa học (action === 'revoke'), gọi ngay PUT /user-permission/remove-products/:cognitoUserId trên izTeach và xác minh!
      let izteachRevokeResult = null;
      if (action === 'revoke') {
        if (resolvedIds.length === 0) {
          return jsonResponse({ ok: false, message: 'Vui lòng chọn ít nhất 1 khóa học cần thu hồi.' }, 400);
        }
        izteachRevokeResult = await revokeStudentCoursesOnIzTeach(env, {
          email,
          cognitoUserId,
          removeCourseIds: resolvedIds
        });
        if (!izteachRevokeResult || !izteachRevokeResult.ok || izteachRevokeResult.skipped) {
          return jsonResponse({
            ok: false,
            retryable: true,
            syncStatus: 'sync_failed',
            error: izteachRevokeResult?.reason || 'IZTEACH_REVOKE_FAILED',
            izteachResult: izteachRevokeResult || undefined,
            izteachRevoked: izteachRevokeResult || undefined,
            message: `Chưa thu hồi được khóa học trên izTeach (${izteachRevokeResult?.error || izteachRevokeResult?.reason || 'Lỗi dịch vụ upstream'}). Quyền học trên Sổ Liên Lạc chưa bị xóa để tránh lệch dữ liệu — vui lòng thử lại.`
          }, 502);
        }
        if (izteachRevokeResult.cognitoUserId && !cognitoUserId) {
          cognitoUserId = izteachRevokeResult.cognitoUserId;
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
        classCode: body.classCode !== undefined ? body.classCode : undefined,
        codeHint: body.code || ''
      });

      if (!updatedStudent || updatedStudent.ok === false) {
        return jsonResponse({
          ok: false,
          partialFailure: true,
          syncStatus: 'partial_failure_supabase',
          izteachUpdated: true,
          supabaseUpdated: false,
          error: 'SUPABASE_SYNC_FAILED',
          izteachRevoked: izteachRevokeResult || undefined,
          message: 'Đã cập nhật trên izTeach nhưng chưa lưu được vào cơ sở dữ liệu Supabase. Vui lòng bấm đồng bộ lại.'
        }, 502);
      }

      return jsonResponse({
        ok: true,
        syncStatus: 'synced',
        student: updatedStudent,
        izteachRevoked: izteachRevokeResult || undefined,
        message: 'Đã cập nhật khóa học & lớp học cho học viên ' + email + ' thành công!'
      });
    }

    if (path === '/api/ktn/classes') {
      if (request.method === 'GET') {
        const session = await extractSessionFromRequest(request, env);
        const [sbRes, tRes] = await Promise.all([
          supabaseRequest(env, 'ktn_classes?active=eq.true&order=id.asc'),
          supabaseRequest(env, 'ktn_teachers?active=eq.true')
        ]);
        const rawClasses = Array.isArray(sbRes.data) ? sbRes.data : [];
        const rawTeachers = Array.isArray(tRes.data) ? tRes.data : [];
        const teacherMap = new Map();
        for (const t of rawTeachers) {
          if (t?.code) teacherMap.set(String(t.code).trim(), t);
          if (t?.email) teacherMap.set(normalizeEmail(t.email), t);
        }
        const classes = rawClasses.map(c => {
          const matchedT = teacherMap.get(String(c.teacher_code || '').trim()) || teacherMap.get(normalizeEmail(c.teacher_email || ''));
          const copy = {
            ...c,
            teacher_name: c.teacher_name || matchedT?.name || 'Cô Lâm Mỹ Linh'
          };
          if (!session) delete copy.teacher_email;
          return copy;
        });
        return jsonResponse({ ok: true, classes });
      }
      if (request.method === 'POST') {
        const session = await extractSessionFromRequest(request, env);
        if (!session || (session.role !== 'admin' && session.role !== 'teacher')) {
          return jsonResponse({ ok: false, message: 'Chỉ Quản lý hoặc Giáo viên mới được tạo/cập nhật lớp học.' }, 403);
        }
        const body = await request.json().catch(() => ({}));
        const classId = String(body.id || body.classCode || '').trim().toUpperCase();
        if (!classId) return jsonResponse({ ok: false, message: 'Vui lòng nhập mã lớp (VD: YCT2-04).' }, 400);

        const existingCls = await supabaseRequest(env, `ktn_classes?id=eq.${encodeURIComponent(classId)}&select=*&limit=1`);
        const existingRow = (existingCls.ok && Array.isArray(existingCls.data) && existingCls.data[0]) ? existingCls.data[0] : null;

        if (session.role === 'teacher') {
          const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
          if (!existingRow || !assignedClasses.includes(classId)) {
            return jsonResponse({
              ok: false,
              message: !existingRow
                ? 'Chỉ Quản lý (Admin) mới được phép mở thêm lớp học mới.'
                : ('Cô không phụ trách lớp ' + classId + ' nên không có quyền chỉnh sửa.')
            }, 403);
          }
          if (body.teacherEmail && normalizeEmail(body.teacherEmail) !== normalizeEmail(existingRow.teacher_email || session.email)) {
            return jsonResponse({
              ok: false,
              message: 'Giáo viên không được tự ý chuyển quyền chủ nhiệm lớp cho tài khoản khác.'
            }, 403);
          }
        }

        const tEmail = session.role === 'teacher'
          ? normalizeEmail(existingRow?.teacher_email || session.email)
          : normalizeEmail(body.teacherEmail || existingRow?.teacher_email || 'linh.lam@khongtunhi.com');
        const tCode = session.role === 'teacher'
          ? String(existingRow?.teacher_code || session.code || 'GV-KTN-08').trim()
          : String(body.teacherCode || existingRow?.teacher_code || 'GV-KTN-08').trim();
        const row = {
          id: classId,
          name: body.name || existingRow?.name || ('Lớp ' + classId),
          teacher_code: tCode,
          teacher_email: tEmail,
          schedule: body.schedule || existingRow?.schedule || '19:30 Thứ 3 & Thứ 6',
          total_lessons: Number(body.totalLessons || body.total_lessons || existingRow?.total_lessons) || 25,
          current_lesson: Number(body.currentLesson || body.current_lesson || existingRow?.current_lesson) || 1,
          active: true,
          updated_at: new Date().toISOString()
        };
        const sbRes = await supabaseRequest(env, 'ktn_classes', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: row
        });

        // Đồng bộ danh sách lớp phụ trách vào bảng ktn_teachers
        if (tEmail) {
          const tLookup = await supabaseRequest(env, `ktn_teachers?email=eq.${encodeURIComponent(tEmail)}&limit=1`);
          const existingTeacher = (tLookup.ok && Array.isArray(tLookup.data) && tLookup.data[0]) || null;
          if (existingTeacher) {
            const nextAssigned = Array.from(new Set([...(Array.isArray(existingTeacher.assigned_classes) ? existingTeacher.assigned_classes : []), classId]));
            await supabaseRequest(env, `ktn_teachers?code=eq.${encodeURIComponent(existingTeacher.code)}`, {
              method: 'PATCH',
              body: { assigned_classes: nextAssigned }
            });
          } else if (body.teacherName) {
            await supabaseRequest(env, 'ktn_teachers', {
              method: 'POST',
              prefer: 'resolution=merge-duplicates',
              body: {
                code: tCode,
                name: String(body.teacherName).trim(),
                email: tEmail,
                phone: String(body.teacherPhone || ''),
                assigned_classes: [classId],
                active: true
              }
            });
          }
        }

        return jsonResponse({ ok: true, classItem: (Array.isArray(sbRes.data) && sbRes.data[0]) || row });
      }
      if (request.method === 'DELETE') {
        const session = await extractSessionFromRequest(request, env);
        if (!session || session.role !== 'admin') {
          return jsonResponse({ ok: false, message: 'Chỉ Quản lý (Admin) mới được xóa lớp học.' }, 403);
        }
        const body = await request.json().catch(() => ({}));
        const classId = String(url.searchParams.get('id') || url.searchParams.get('classCode') || body.id || body.classCode || '').trim().toUpperCase();
        if (!classId) return jsonResponse({ ok: false, message: 'Thiếu mã lớp cần xóa.' }, 400);

        await supabaseRequest(env, `ktn_classes?id=eq.${encodeURIComponent(classId)}`, {
          method: 'PATCH',
          body: { active: false, updated_at: new Date().toISOString() }
        });
        await supabaseRequest(env, `ktn_students?class_code=eq.${encodeURIComponent(classId)}`, {
          method: 'PATCH',
          body: { class_code: null, has_live_class: false, updated_at: new Date().toISOString() }
        });
        return jsonResponse({ ok: true, deletedClassId: classId });
      }
    }

    if (path === '/api/ktn/teachers') {
      if (request.method === 'GET') {
        const session = await extractSessionFromRequest(request, env);
        if (!session || (session.role !== 'admin' && session.role !== 'teacher')) {
          return jsonResponse({ ok: false, message: 'Chỉ Quản lý hoặc Giáo viên mới được xem danh sách giáo viên.' }, 403);
        }
        const sbRes = await supabaseRequest(env, 'ktn_teachers?active=eq.true&order=code.asc');
        return jsonResponse({ ok: true, teachers: Array.isArray(sbRes.data) ? sbRes.data : [] });
      }
      if (request.method === 'POST') {
        const session = await extractSessionFromRequest(request, env);
        if (!session || session.role !== 'admin') {
          return jsonResponse({ ok: false, message: 'Chỉ Quản lý (Admin) mới được tạo/cập nhật giáo viên.' }, 403);
        }
        const body = await request.json().catch(() => ({}));
        const tEmail = normalizeEmail(body.email || '');
        const tCode = String(body.code || ('GV-KTN-' + Date.now().toString().slice(-4))).trim();
        if (!tEmail) return jsonResponse({ ok: false, message: 'Thiếu email giáo viên.' }, 400);
        const tRow = {
          code: tCode,
          name: String(body.name || tEmail.split('@')[0]).trim(),
          email: tEmail,
          phone: String(body.phone || '').trim(),
          specialty: String(body.specialty || 'Giáo viên Tiếng Trung Thiếu Nhi').trim(),
          assigned_classes: Array.isArray(body.assignedClasses) ? body.assignedClasses : [],
          active: true
        };
        const sbRes = await supabaseRequest(env, 'ktn_teachers', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: tRow
        });
        return jsonResponse({ ok: true, teacher: (Array.isArray(sbRes.data) && sbRes.data[0]) || tRow });
      }
    }

    // ------------------------------------------------------------------------
    // C. TIẾP NHẬN LEAD HỌC THỬ 0Đ & ĐƠN HÀNG KHÓA HỌC TỪ TRANG CHỦ
    // ------------------------------------------------------------------------
    if (path === '/api/ktn/leads' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const nameTrim = String(body.name || body.parentName || '').trim();
      const phoneTrim = String(body.phone || '').trim().replace(/[\s.-]/g, '');
      const courseLabel = String(body.childAge || body.courseLabel || 'Tiểu học (7–11t)').trim();
      if (!nameTrim || !/^(0|\+84)(3|5|7|8|9)[0-9]{8}$/.test(phoneTrim)) {
        return jsonResponse({ ok: false, message: 'Vui lòng nhập đầy đủ Họ tên và Số điện thoại hợp lệ.' }, 400);
      }

      const isTestLead = Boolean(body.testMode || request.headers.get('X-KTN-Test-Mode') === '1');
      if (isTestLead) {
        const session = await extractSessionFromRequest(request, env);
        const webhookSecret = request.headers.get('X-KTN-Webhook-Secret') || '';
        const isAuthorizedTest = Boolean(
          (session && session.role === 'admin') ||
          (env.KTN_WEBHOOK_SECRET && webhookSecret === env.KTN_WEBHOOK_SECRET)
        );
        if (!isAuthorizedTest) {
          return jsonResponse({ ok: false, message: 'Chế độ kiểm thử Lead (testMode) chỉ dành cho Quản trị viên đã xác thực.' }, 403);
        }
        return jsonResponse({
          ok: true,
          testMode: true,
          lead: {
            name: nameTrim,
            phone: phoneTrim,
            courseLabel,
            createdAt: new Date().toISOString()
          }
        });
      }

      // Chống gửi trùng lặp cùng SĐT trong vòng 5 phút
      if (!globalThis.__ktnRecentLeadsMap) globalThis.__ktnRecentLeadsMap = new Map();
      const lastLeadAt = globalThis.__ktnRecentLeadsMap.get(phoneTrim) || 0;
      if (Date.now() - lastLeadAt < 5 * 60 * 1000) {
        return jsonResponse({
          ok: true,
          deduplicated: true,
          lead: {
            name: nameTrim,
            phone: phoneTrim,
            courseLabel,
            createdAt: new Date().toISOString()
          }
        });
      }
      globalThis.__ktnRecentLeadsMap.set(phoneTrim, Date.now());

      const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
      const leadPayload = {
        name: nameTrim,
        phone: phoneTrim,
        email: `Học thử 0đ (${courseLabel})`,
        address: 'Đăng ký Học thử 0đ — Trang chủ Tiếng Trung',
        vendorId,
        metadata: {
          leadType: 'trial_0d',
          interestedCourse: {
            id: 'tieng-trung-hoc-thu-0d',
            title: `[Học thử 0đ] ${courseLabel}`,
            type: 'trial'
          }
        }
      };

      const contactRes = await fetch('https://c9xi8h3a3d.execute-api.ap-southeast-1.amazonaws.com/prod/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadPayload)
      }).catch(() => null);

      if (!contactRes || !contactRes.ok) {
        return jsonResponse({
          ok: false,
          message: 'Máy chủ tạm thời chưa nhận được đăng ký. Phụ huynh vui lòng bấm Gửi lại nhé!'
        }, 502);
      }

      return jsonResponse({
        ok: true,
        lead: {
          name: nameTrim,
          phone: phoneTrim,
          courseLabel,
          createdAt: new Date().toISOString()
        }
      });
    }

    if ((path === '/api/ktn/orders' || path === '/api/izteach/orders') && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const rawPhone = String(body.phone || '').trim().replace(/[\s.-]/g, '');
      const cleanPhone = rawPhone.replace(/\D/g, '');
      if (!String(body.studentName || '').trim() || !/^(0|\+84)(3|5|7|8|9)[0-9]{8}$/.test(rawPhone)) {
        return jsonResponse({ ok: false, message: 'Vui lòng nhập đầy đủ Họ tên và Số điện thoại hợp lệ (10 số).' }, 400);
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

      // 3. Cập nhật trạng thái đã duyệt lên Supabase ktn_orders (Upsert để đảm bảo cả đơn từ Sổ Liên Lạc cũng được lưu) & cộng dồn khóa học vào ktn_students
      const nowIso = new Date().toISOString();
      await supabaseRequest(env, 'ktn_orders', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: {
          order_id: orderId,
          student_name: String(order.student_name || order.studentName || prov.name || 'Học viên').trim(),
          student_email: prov.email,
          phone: String(order.phone || '').trim(),
          course_id: order.course_id || order.courseId || prov.courseId || DEFAULT_COURSE_ID,
          course_name: order.course_name || order.courseName || MASTER_PRODUCT_MAPPING[prov.courseId]?.title || 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
          amount: Number(order.amount) || 890000,
          payment_method: order.payment_method || order.paymentMethod || 'VietQR',
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
        defaultPassword: prov.initialPassword,
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
    const DEFAULT_SESSIONS_BY_CLASS = {
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

    const getMergedClassSessions = async (targetClassCode) => {
      const code = String(targetClassCode || '').trim().toUpperCase();
      if (!code) return [];
      const sbRes = await supabaseRequest(
        env,
        `ktn_class_sessions?class_code=eq.${encodeURIComponent(code)}&order=session_num.asc`
      );
      const dbRows = (sbRes.ok && Array.isArray(sbRes.data)) ? sbRes.data : [];
      const baseDefaults = Object.prototype.hasOwnProperty.call(DEFAULT_SESSIONS_BY_CLASS, code)
        ? DEFAULT_SESSIONS_BY_CLASS[code]
        : [];
      const mergedByNum = new Map();
      baseDefaults.forEach(item => {
        mergedByNum.set(Number(item.session_num || item.sessionNum), item);
      });
      dbRows.forEach(row => {
        const sNum = Number(row.session_num || row.sessionNum) || 1;
        const resolvedTitle = String(row.session_title || row.title || `Buổi ${sNum}`).trim();
        const rawExercises = Array.isArray(row.exercises)
          ? row.exercises
          : (Array.isArray(row.assignments) ? row.assignments : []);
        const normExercises = rawExercises.map((ex, idx) => ({
          ...ex,
          id: String(ex?.id || `${code}-B${sNum}-E${idx + 1}`).trim(),
          num: Number(ex?.num || ex?.order) || (idx + 1),
          title: String(ex?.title || `Bài ${idx + 1}`).trim(),
          prompt: String(ex?.prompt || ex?.instruction || '').trim(),
          instruction: String(ex?.instruction || ex?.prompt || '').trim(),
          type: String(ex?.type || 'audio').trim()
        }));
        mergedByNum.set(sNum, {
          id: row.id,
          classCode: row.class_code || code,
          session_num: sNum,
          sessionNum: sNum,
          session_title: resolvedTitle,
          title: resolvedTitle,
          session_date: row.session_date || row.sessionDate || null,
          summary: row.summary || null,
          exercises: normExercises,
          assignments: normExercises,
          updatedBy: row.updated_by || row.teacher_email || null,
          updatedAt: row.updated_at || null
        });
      });
      return Array.from(mergedByNum.values()).sort(
        (a, b) => Number(a.session_num || a.sessionNum) - Number(b.session_num || b.sessionNum)
      );
    };

    const MAX_HOMEWORK_FILE_BYTES = 50 * 1024 * 1024;
    const ALLOWED_HW_EXT_REGEX = /\.(wav|mp3|m4a|webm|ogg|aac|mp4|mov|jpg|jpeg|png|webp|gif|pdf)(\?|$)/i;
    const DANGEROUS_HW_EXT_REGEX = /\.(exe|bat|cmd|sh|php|pl|py|js|mjs|cjs|html|htm|svg|xml|jar|msi|apk|dll|scr)(\?|$)/i;

    if (path === '/api/ktn/homeworks/upload-url' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập để tải bài tập lên.' }, 401);
      const body = await request.json().catch(() => ({}));
      if (body.fileSize !== undefined && body.fileSize !== null) {
        const fSize = Number(body.fileSize);
        if (!Number.isFinite(fSize) || fSize <= 0 || fSize > MAX_HOMEWORK_FILE_BYTES) {
          return jsonResponse({
            ok: false,
            message: 'Dung lượng tệp bài làm không hợp lệ hoặc vượt quá giới hạn tối đa 50MB.'
          }, 400);
        }
      }
      const rawName = String(body.fileName || `btvn_${Date.now()}.wav`);
      const cleanName = rawName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      if (DANGEROUS_HW_EXT_REGEX.test(cleanName) || !ALLOWED_HW_EXT_REGEX.test(cleanName)) {
        return jsonResponse({
          ok: false,
          message: 'Định dạng tệp không được phép tải lên. Chỉ chấp nhận tệp âm thanh, hình ảnh, video hoặc PDF bài làm.'
        }, 400);
      }
      const fileType = String(body.fileType || 'audio/wav');
      const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;
      const studentFolder = normalizeEmail(session.email).replace(/[^a-z0-9]/g, '_');
      const s3Key = `resource/homeworks/${vendorId}/${studentFolder}/${Date.now()}-${cleanName}`;
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
      if (session.role !== 'student') {
        return jsonResponse({ ok: false, message: 'Chỉ tài khoản Học sinh mới được phép nộp bài tập.' }, 403);
      }

      const body = await request.json().catch(() => ({}));
      const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];
      const firstAtt = rawAttachments.find(a => a && (a.fileUrl || a.cdnUrl || a.playUrl)) || null;
      const fileUrl = String(body.fileUrl || firstAtt?.fileUrl || firstAtt?.cdnUrl || firstAtt?.playUrl || '').trim();
      const fileType = String(body.fileType || firstAtt?.fileType || firstAtt?.mediaType || 'audio').trim();
      const vendorId = env.IZTEACH_VENDOR_ID || DEFAULT_VENDOR_ID;

      // Chặn triệt để lỗi nộp bài thiếu fileUrl thật, tự nhét video mẫu, chèn URL ngoài hệ thống S3/CloudFront của KTN hoặc dùng đường dẫn của học sinh khác!
      const validCdnPrefix = `https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/${vendorId}/`;
      const validS3Prefix = `https://online-learning-izteach-6-aws-source-bucket.s3-ap-southeast-1.amazonaws.com/resource/homeworks/${vendorId}/`;
      const studentFolder = normalizeEmail(session.email).replace(/[^a-z0-9]/g, '_');

      const candidateUrls = [
        fileUrl,
        ...rawAttachments.map(a => String(a?.fileUrl || a?.cdnUrl || a?.playUrl || '').trim()).filter(Boolean)
      ];

      for (const u of candidateUrls) {
        if (
          !u ||
          u.includes('..') ||
          (!u.startsWith(validCdnPrefix) && !u.startsWith(validS3Prefix)) ||
          /hw_btvn_bai_1\.mp4|BTVN BAI 1\.mp4/i.test(u) ||
          DANGEROUS_HW_EXT_REGEX.test(u) ||
          !ALLOWED_HW_EXT_REGEX.test(u)
        ) {
          return jsonResponse({
            ok: false,
            message: 'Tệp bài làm phải thuộc định dạng hợp lệ và được tải lên kho lưu trữ chính thức của Học Viện Khổng Tử Nhí trước khi nộp bài!'
          }, 400);
        }
        const relPath = u.startsWith(validCdnPrefix) ? u.slice(validCdnPrefix.length) : u.slice(validS3Prefix.length);
        const relParts = relPath.split('/').filter(Boolean);
        if (relParts.length >= 2 && relParts[0] !== studentFolder) {
          return jsonResponse({
            ok: false,
            message: 'Không được phép sử dụng đường dẫn tệp bài làm của học sinh khác.'
          }, 403);
        }
      }

      // Kiểm tra tệp bài làm thực sự tồn tại trên kho S3/CloudFront và có dung lượng > 0 byte
      const headCheckUrl = fileUrl.startsWith(validS3Prefix)
        ? (validCdnPrefix + fileUrl.slice(validS3Prefix.length))
        : fileUrl;
      const headRes = await fetch(headCheckUrl, { method: 'HEAD' }).catch(() => null);
      const headSize = headRes ? Number(headRes.headers.get('content-length') || 0) : 0;
      if (!headRes || !headRes.ok || headSize <= 0) {
        return jsonResponse({
          ok: false,
          message: 'Tệp bài làm chưa được tải lên kho lưu trữ hoặc có dung lượng 0 byte. Em vui lòng tải tệp lên trước khi nộp bài!'
        }, 400);
      }
      if (headSize > MAX_HOMEWORK_FILE_BYTES) {
        return jsonResponse({
          ok: false,
          message: 'Dung lượng tệp bài làm vượt quá giới hạn tối đa 50MB.'
        }, 400);
      }

      // Kiểm tra tính hợp lệ của lessonNum
      const rawLessonNum = body.lessonNum !== undefined ? Number(body.lessonNum) : 1;
      if (!Number.isInteger(rawLessonNum) || rawLessonNum < 1) {
        return jsonResponse({ ok: false, message: 'Số thứ tự bài tập (lessonNum) không hợp lệ.' }, 400);
      }
      const lessonNum = rawLessonNum;

      // 1. Tra cứu hồ sơ thật của học sinh đang đăng nhập trên Supabase ktn_students
      const stuLookup = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(session.email)}&limit=1`);
      let sbStudent = (stuLookup.ok && Array.isArray(stuLookup.data) && stuLookup.data[0]) ? stuLookup.data[0] : null;
      let realClassCode = String(sbStudent?.class_code || session.classCode || '').trim().toUpperCase() || null;
      let realOnlineCourses = Array.isArray(sbStudent?.online_courses)
        ? sbStudent.online_courses
        : (Array.isArray(session.onlineCourses) ? session.onlineCourses : []);
      let enrolledCourseIds = new Set(
        realOnlineCourses.map(c => String(c?.id || c || '').trim()).filter(Boolean)
      );

      // 2. Kiểm tra lớp học (classCode) và khóa học (courseId) học sinh được phép nộp
      const reqClass = body.classCode ? String(body.classCode).trim().toUpperCase() : null;
      if (reqClass && reqClass !== realClassCode) {
        return jsonResponse({
          ok: false,
          message: `Em không thuộc lớp ${reqClass} nên không được phép nộp bài vào lớp này.`
        }, 403);
      }

      const courseId = String(body.courseId || (realClassCode ? `CLASS_${realClassCode}` : DEFAULT_COURSE_ID)).trim();
      if (courseId.toUpperCase().startsWith('CLASS_')) {
        const targetClass = courseId.slice(6).trim().toUpperCase();
        if (!realClassCode || targetClass !== realClassCode) {
          return jsonResponse({
            ok: false,
            message: `Em không thuộc lớp ${targetClass} nên không được phép nộp bài của lớp này.`
          }, 403);
        }
        const isSessionExFormat = lessonNum >= 101 && lessonNum <= 2520 && (lessonNum % 100 >= 1 && lessonNum % 100 <= 20);
        const isDirectSessionFormat = lessonNum >= 1 && lessonNum <= 25;
        if (!isSessionExFormat && !isDirectSessionFormat) {
          return jsonResponse({
            ok: false,
            message: 'Mã bài tập (lessonNum) không tồn tại trong chương trình học của lớp.'
          }, 400);
        }
        // Kiểm tra bài tập có thực sự tồn tại trong danh sách buổi học & bài cô đã giao của lớp hay không
        const assignedSessions = await getMergedClassSessions(targetClass);
        if (assignedSessions.length > 0) {
          if (lessonNum >= 100) {
            const sNum = Math.floor(lessonNum / 100);
            const eNum = lessonNum % 100;
            const targetSession = assignedSessions.find(s => Number(s.session_num || s.sessionNum) === sNum);
            const targetExercises = (targetSession && Array.isArray(targetSession.exercises)) ? targetSession.exercises : [];
            const hasAssignedEx = Boolean(targetSession && targetExercises.some((ex, idx) => Number(ex.num || (idx + 1)) === eNum));
            if (!hasAssignedEx) {
              return jsonResponse({
                ok: false,
                message: `Bài tập số ${eNum} (Buổi ${sNum}) chưa được giao trong lớp ${targetClass}.`
              }, 400);
            }
          } else {
            const targetSession = assignedSessions.find(s => Number(s.session_num || s.sessionNum) === lessonNum);
            if (!targetSession) {
              return jsonResponse({
                ok: false,
                message: `Buổi học số ${lessonNum} chưa được giao trong lớp ${targetClass}.`
              }, 400);
            }
          }
        }
      } else {
        if (lessonNum > 50) {
          return jsonResponse({
            ok: false,
            message: 'Số thứ tự bài học trực tuyến không tồn tại trong khóa học.'
          }, 400);
        }
        // Nếu Supabase chưa kịp có courseId, tự động đối chiếu trực tiếp với izTeach và đồng bộ vào ktn_students
        if (!enrolledCourseIds.has(courseId)) {
          const syncedStu = await syncStudentEntitlementFromIzTeach(env, {
            email: session.email,
            name: sbStudent?.name || session.name,
            phone: sbStudent?.phone || '',
            cognitoUserId: sbStudent?.cognito_user_id || session.userId,
            izteachStudentId: sbStudent?.izteach_student_id || session.studentId,
            accessToken: session.izteachAccessToken || session.accessToken
          });
          if (syncedStu) {
            sbStudent = syncedStu;
            realClassCode = String(sbStudent.class_code || realClassCode || '').trim().toUpperCase() || null;
            realOnlineCourses = Array.isArray(sbStudent.online_courses) ? sbStudent.online_courses : [];
            enrolledCourseIds = new Set(
              realOnlineCourses.map(c => String(c?.id || c || '').trim()).filter(Boolean)
            );
          }
        }
        if (!enrolledCourseIds.has(courseId)) {
          return jsonResponse({
            ok: false,
            error: 'COURSE_NOT_ENTITLED',
            message: 'Em chưa đăng ký khóa học này nên chưa thể nộp bài tập.'
          }, 403);
        }
      }

      // 3. Máy chủ tự xác định ID bài nộp từ tài khoản đã xác thực; từ chối nếu client truyền ID của học sinh khác
      const hwId = `HW-${session.email}-${courseId}-L${lessonNum}`;
      const clientRequestedId = String(body.id || '').trim();
      if (clientRequestedId && clientRequestedId !== hwId) {
        return jsonResponse({
          ok: false,
          message: 'Mã bài nộp (id) không thuộc quyền sở hữu của học sinh đang đăng nhập.'
        }, 403);
      }

      // Kiểm tra tính nhất quán giữa courseId, lessonNum và unitId (chặn ghép nhầm unit của khóa khác hoặc unit ngoài danh mục chưa xác minh)
      const unitResolution = await resolveAndVerifyCourseUnitId(env, courseId, lessonNum, body.unitId || null);
      if (!unitResolution.isLiveClass && body.unitId && !unitResolution.valid) {
        return jsonResponse({
          ok: false,
          error: 'UNIT_COURSE_MISMATCH',
          reason: unitResolution.reason || 'UNIT_COURSE_MISMATCH',
          message: 'Mã bài tập (unitId) không khớp với khóa học hoặc bài học đã chọn.'
        }, 400);
      }

      const cleanNote = String(body.studentNote || '');
      const submitLockKey = `SUBMIT|${hwId}|${fileUrl}|${cleanNote}`;

      return runWithHomeworkConcurrencyLock(submitLockKey, async () => {
        // 4. Nếu bản ghi đã tồn tại, đối chiếu chủ sở hữu và kiểm tra chống nộp trùng lặp (Idempotency)
        let existingHw = null;
        const existingRes = await supabaseRequest(
          env,
          `ktn_homeworks?id=eq.${encodeURIComponent(hwId)}&select=*&limit=1`
        );
        if (existingRes.ok && Array.isArray(existingRes.data) && existingRes.data[0]) {
          existingHw = existingRes.data[0];
          const existingOwner = normalizeEmail(existingHw.student_email || '');
          if (existingOwner && existingOwner !== session.email) {
            return jsonResponse({
              ok: false,
              message: 'Không được phép ghi đè bài nộp của học sinh khác.'
            }, 403);
          }
        }

        if (
          existingHw &&
          existingHw.file_url === fileUrl &&
          String(existingHw.student_note || '') === cleanNote &&
          existingHw.status === 'pending'
        ) {
          const prevMeta = existingHw.workbook_answers?._syncMeta || {};
          if (prevMeta.syncStatus === 'synced' || prevMeta.syncStatus === 'not_applicable_live_class') {
            return jsonResponse({
              ok: true,
              idempotent: true,
              idempotentReplay: true,
              syncStatus: prevMeta.syncStatus,
              unitId: prevMeta.unitId || unitResolution.unitId || null,
              mirroredToIzTeach: prevMeta.syncStatus === 'synced',
              homework: existingHw,
              izteachMirror: {
                ok: true,
                idempotent: true,
                idempotentReplay: true,
                syncStatus: prevMeta.syncStatus,
                remoteId: prevMeta.izteachRemoteId || null
              }
            });
          }
        }

        const normalizedAttachments = rawAttachments.length > 0
          ? rawAttachments.map(a => ({
              title: a.title || a.fileName || 'Bài nộp',
              fileUrl: a.fileUrl || a.cdnUrl || a.playUrl || fileUrl,
              cdnUrl: a.cdnUrl || a.fileUrl || a.playUrl || fileUrl,
              mediaType: a.mediaType || a.fileType || fileType,
              size: Number(a.size || a.fileSize || 0)
            }))
          : [{ title: 'Bài nộp của học sinh', fileUrl, cdnUrl: fileUrl, mediaType: fileType, size: 0 }];

        const nowIso = new Date().toISOString();
        const prevWb = (existingHw?.workbook_answers && typeof existingHw.workbook_answers === 'object')
          ? existingHw.workbook_answers
          : {};
        const incomingWb = (body.workbookAnswers && typeof body.workbookAnswers === 'object')
          ? body.workbookAnswers
          : {};
        const prevHistory = Array.isArray(prevWb._history) ? [...prevWb._history] : [];
        if (existingHw && (existingHw.file_url !== fileUrl || existingHw.status !== 'pending' || String(existingHw.student_note || '') !== cleanNote)) {
          prevHistory.push({
            version: prevHistory.length + 1,
            event: 'submission_superseded',
            file_url: existingHw.file_url,
            file_type: existingHw.file_type,
            student_note: existingHw.student_note || '',
            status: existingHw.status,
            score: existingHw.score ?? null,
            teacher_feedback: existingHw.teacher_feedback ?? null,
            submitted_at: existingHw.submitted_at,
            graded_at: existingHw.graded_at || null,
            archived_at: nowIso
          });
        }

        // KHÔNG chấp nhận cờ body.mirroredToIzTeach tự khai từ trình duyệt.
        // Trạng thái 'synced' chỉ được gán sau khi máy chủ xác thực biên nhận thực tế trên izTeach hoặc tự đồng bộ thành công.
        const nextVersion = (Number(prevWb._syncMeta?.version) || 0) + 1;
        const nextSubmissionCount = (Number(prevWb._syncMeta?.submissionCount) || 0) + 1;
        let initialSyncStatus = 'saved_to_supabase';
        if (unitResolution.isLiveClass) {
          initialSyncStatus = 'not_applicable_live_class';
        } else if (!unitResolution.valid) {
          initialSyncStatus = 'mapping_required';
        }

        const nextWorkbookAnswers = {
          ...prevWb,
          ...incomingWb,
          _history: prevHistory,
          _syncMeta: {
            ...(prevWb._syncMeta || {}),
            version: nextVersion,
            submissionCount: nextSubmissionCount,
            courseId,
            lessonNum,
            unitId: unitResolution.unitId || null,
            syncStatus: initialSyncStatus,
            izteachRemoteId: prevWb._syncMeta?.izteachRemoteId || null,
            updatedAt: nowIso
          }
        };

        const hwRecord = {
          id: hwId,
          student_code: sbStudent?.code || session.code || session.id,
          student_email: session.email,
          student_name: sbStudent?.name || session.name,
          class_code: realClassCode,
          course_id: courseId,
          lesson_num: lessonNum,
          lesson_title: String(body.lessonTitle || `Bài ${lessonNum}`),
          file_url: fileUrl,
          file_type: fileType,
          attachments: normalizedAttachments,
          workbook_answers: nextWorkbookAnswers,
          student_note: cleanNote,
          status: 'pending', // Mới nộp / nộp lại là pending (Chờ cô chấm)
          score: null,
          teacher_feedback: null,
          submitted_at: nowIso,
          updated_at: nowIso
        };

        const sbRes = await supabaseRequest(env, 'ktn_homeworks', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: hwRecord
        });

        if (!sbRes.ok || !Array.isArray(sbRes.data) || sbRes.data.length === 0) {
          return jsonResponse({
            ok: false,
            syncStatus: 'sync_failed',
            message: 'Máy chủ chưa lưu được bản ghi bài nộp vào cơ sở dữ liệu. Em hãy bấm Gửi lại nhé.'
          }, sbRes.status || 500);
        }

        let savedHw = sbRes.data[0];
        let izteachMirror = null;
        let finalSyncStatus = initialSyncStatus;

        if (unitResolution.isLiveClass) {
          izteachMirror = { ok: true, skipped: true, syncStatus: 'not_applicable_live_class', reason: 'LIVE_CLASS_HOMEWORK' };
        } else if (!unitResolution.valid) {
          izteachMirror = { ok: false, skipped: true, syncStatus: 'mapping_required', reason: unitResolution.reason || 'MAPPING_REQUIRED' };
        } else if (!body.skipIzTeachSync) {
          let verifiedReceipt = null;
          if (body.izteachRemoteId) {
            const checkReceipt = await verifyIzTeachHomeworkReceipt(env, {
              remoteId: body.izteachRemoteId,
              courseId,
              unitId: unitResolution.unitId,
              expectApproved: false
            });
            if (checkReceipt.verified) {
              verifiedReceipt = checkReceipt;
            }
          }

          if (verifiedReceipt) {
            finalSyncStatus = 'synced';
            izteachMirror = {
              ok: true,
              idempotent: true,
              verifiedReceipt: true,
              syncStatus: 'synced',
              remoteId: verifiedReceipt.remoteId,
              courseId,
              unitId: unitResolution.unitId
            };
          } else {
            izteachMirror = await mirrorHomeworkToIzTeach(env, savedHw, false, { unitId: unitResolution.unitId });
            finalSyncStatus = izteachMirror.syncStatus || (izteachMirror.ok ? 'synced' : 'sync_failed');
          }

          const updatedWb = {
            ...nextWorkbookAnswers,
            _syncMeta: {
              ...nextWorkbookAnswers._syncMeta,
              syncStatus: finalSyncStatus,
              izteachRemoteId: izteachMirror.remoteId || nextWorkbookAnswers._syncMeta.izteachRemoteId || null,
              lastSyncedSignature: izteachMirror.ok ? (izteachMirror.signature || null) : (nextWorkbookAnswers._syncMeta.lastSyncedSignature || null),
              lastSyncedAt: izteachMirror.ok ? new Date().toISOString() : (nextWorkbookAnswers._syncMeta.lastSyncedAt || null),
              lastError: izteachMirror.ok ? null : (izteachMirror.reason || izteachMirror.error || 'SYNC_FAILED')
            }
          };
          const metaPatch = await supabaseRequest(env, `ktn_homeworks?id=eq.${encodeURIComponent(savedHw.id)}`, {
            method: 'PATCH',
            prefer: 'return=representation',
            body: { workbook_answers: updatedWb, updated_at: new Date().toISOString() }
          });
          if (metaPatch.ok && Array.isArray(metaPatch.data) && metaPatch.data[0]) {
            savedHw = metaPatch.data[0];
          } else {
            savedHw.workbook_answers = updatedWb;
          }
        }

        return jsonResponse({
          ok: true,
          syncStatus: finalSyncStatus,
          unitId: unitResolution.unitId || null,
          mirroredToIzTeach: Boolean(izteachMirror?.ok && !izteachMirror?.skipped),
          homework: savedHw,
          izteachMirror: izteachMirror || undefined
        });
      });
    }

    if (path === '/api/ktn/homeworks/grade' && (request.method === 'PATCH' || request.method === 'POST')) {
      const session = await extractSessionFromRequest(request, env);
      if (!session || (session.role !== 'teacher' && session.role !== 'admin')) {
        return jsonResponse({ ok: false, message: 'Chỉ Giáo viên hoặc Quản lý mới được chấm điểm bài tập.' }, 403);
      }
      const body = await request.json().catch(() => ({}));
      let hwId = String(body.id || '').trim();
      const studentEmailHint = normalizeEmail(body.studentEmail || '');
      const lessonNumHint = Number(body.lessonNum || body.lessonNumber || 0);
      const courseIdHint = String(body.courseId || '').trim();
      if (!hwId && !studentEmailHint) {
        return jsonResponse({ ok: false, message: 'Thiếu mã bài tập id hoặc email học sinh.' }, 400);
      }

      let parsedScore = null;
      if (body.score !== undefined && body.score !== null && body.score !== '') {
        parsedScore = Number(body.score);
        if (!Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > 10 || Math.round(parsedScore * 2) !== parsedScore * 2) {
          return jsonResponse({
            ok: false,
            message: 'Điểm số không hợp lệ (chỉ chấp nhận thang điểm 0–10 với bước nhảy 0.5).'
          }, 400);
        }
      }

      // Thống nhất trạng thái với supabase_schema.sql: CHECK (status IN ('pending', 'graded', 'revision_requested'))
      const nextStatus = (body.status === 'revision_requested' || body.status === 'needs_revision')
        ? 'revision_requested'
        : 'graded';
      const cleanFeedback = String(body.teacherFeedback || body.feedback || '');
      const cleanAudioUrl = String(body.teacherAudioUrl || '');
      const gradeLockKey = `GRADE|${hwId || studentEmailHint}|${nextStatus}|${parsedScore ?? ''}|${cleanFeedback}|${cleanAudioUrl}`;

      return runWithHomeworkConcurrencyLock(gradeLockKey, async () => {
        // Tra cứu bản ghi hiện có trong ktn_homeworks theo id hoặc theo (student_email + lesson_num)
        let existingHw = null;
        if (hwId) {
          const hwLookup = await supabaseRequest(env, `ktn_homeworks?id=eq.${encodeURIComponent(hwId)}&select=*&limit=1`);
          if (!hwLookup.ok) {
            return jsonResponse({ ok: false, message: 'Không thể kiểm tra thông tin bài nộp.' }, hwLookup.status || 500);
          }
          existingHw = (Array.isArray(hwLookup.data) && hwLookup.data[0]) || null;
        }
        if (!existingHw && studentEmailHint && lessonNumHint > 0) {
          let fallbackQ = `ktn_homeworks?student_email=eq.${encodeURIComponent(studentEmailHint)}&lesson_num=eq.${lessonNumHint}&order=submitted_at.desc&limit=1`;
          if (courseIdHint) fallbackQ += `&course_id=eq.${encodeURIComponent(courseIdHint)}`;
          const fbRes = await supabaseRequest(env, fallbackQ);
          if (fbRes.ok && Array.isArray(fbRes.data) && fbRes.data[0]) {
            existingHw = fbRes.data[0];
            hwId = existingHw.id;
          }
        }

        // Nếu là Giáo viên: kiểm tra bài tập này có thuộc lớp cô chủ nhiệm hay không (trả 403 nếu chấm lớp của GV khác)
        if (session.role === 'teacher') {
          if (!existingHw && !body.allowUpsertFromIzTeach) {
            return jsonResponse({ ok: false, message: 'Không tìm thấy bài nộp tương ứng trong cơ sở dữ liệu để cập nhật.' }, 404);
          }
          const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
          let hwClass = String(existingHw?.class_code || body.classCode || '').trim().toUpperCase();
          if (!hwClass && (existingHw?.student_email || studentEmailHint)) {
            const targetEm = normalizeEmail(existingHw?.student_email || studentEmailHint);
            const stuClsRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(targetEm)}&select=class_code&limit=1`);
            if (stuClsRes.ok && Array.isArray(stuClsRes.data) && stuClsRes.data[0]?.class_code) {
              hwClass = String(stuClsRes.data[0].class_code).trim().toUpperCase();
            }
          }
          if (!hwClass || !assignedClasses.includes(hwClass)) {
            return jsonResponse({
              ok: false,
              message: 'Cô không phụ trách lớp của bài nộp này nên không có quyền chấm điểm.'
            }, 403);
          }
        }

        // Kiểm tra chống chấm trùng lặp (Idempotency)
        if (
          existingHw &&
          existingHw.status === nextStatus &&
          Number(existingHw.score ?? -1) === Number(parsedScore ?? -1) &&
          String(existingHw.teacher_feedback || '') === cleanFeedback &&
          String(existingHw.teacher_audio_url || '') === cleanAudioUrl
        ) {
          const prevMeta = existingHw.workbook_answers?._syncMeta || {};
          if (prevMeta.syncStatus === 'synced' || prevMeta.syncStatus === 'not_applicable_live_class') {
            return jsonResponse({
              ok: true,
              idempotent: true,
              idempotentReplay: true,
              syncStatus: prevMeta.syncStatus,
              unitId: prevMeta.unitId || null,
              mirroredToIzTeach: prevMeta.syncStatus === 'synced',
              homework: existingHw,
              izteachMirror: {
                ok: true,
                idempotent: true,
                idempotentReplay: true,
                syncStatus: prevMeta.syncStatus,
                remoteId: prevMeta.izteachRemoteId || null
              }
            });
          }
        }

        const nowIso = new Date().toISOString();
        const prevWb = (existingHw?.workbook_answers && typeof existingHw.workbook_answers === 'object')
          ? existingHw.workbook_answers
          : {};
        const prevHistory = Array.isArray(prevWb._history) ? [...prevWb._history] : [];
        if (existingHw && (existingHw.status === 'graded' || existingHw.status === 'revision_requested')) {
          prevHistory.push({
            version: prevHistory.length + 1,
            event: 'grade_superseded',
            status: existingHw.status,
            score: existingHw.score ?? null,
            teacher_feedback: existingHw.teacher_feedback ?? null,
            graded_by: existingHw.graded_by || null,
            graded_at: existingHw.graded_at || null,
            archived_at: nowIso
          });
        }

        const targetCourseForGrade = existingHw?.course_id || courseIdHint || DEFAULT_COURSE_ID;
        const targetLessonForGrade = Number(existingHw?.lesson_num || lessonNumHint || 1);
        const unitResolution = await resolveAndVerifyCourseUnitId(env, targetCourseForGrade, targetLessonForGrade, body.unitId || prevWb._syncMeta?.unitId || null);
        if (!unitResolution.isLiveClass && body.unitId && !unitResolution.valid) {
          return jsonResponse({
            ok: false,
            error: 'UNIT_COURSE_MISMATCH',
            reason: unitResolution.reason || 'UNIT_COURSE_MISMATCH',
            message: 'Mã bài tập (unitId) không khớp với khóa học hoặc bài học đã chọn.'
          }, 400);
        }

        // KHÔNG chấp nhận cờ body.mirroredToIzTeach tự khai từ trình duyệt khi chấm bài.
        let initialSyncStatus = 'saved_to_supabase';
        if (unitResolution.isLiveClass) {
          initialSyncStatus = 'not_applicable_live_class';
        } else if (!unitResolution.valid) {
          initialSyncStatus = 'mapping_required';
        }

        const nextWorkbookAnswers = {
          ...prevWb,
          _history: prevHistory,
          _syncMeta: {
            ...(prevWb._syncMeta || {}),
            version: (Number(prevWb._syncMeta?.version) || 0) + 1,
            courseId: targetCourseForGrade,
            lessonNum: targetLessonForGrade,
            unitId: unitResolution.unitId || null,
            syncStatus: initialSyncStatus,
            updatedAt: nowIso
          }
        };

        const patchPayload = {
          status: nextStatus,
          score: parsedScore,
          teacher_feedback: cleanFeedback,
          teacher_audio_url: cleanAudioUrl,
          workbook_answers: nextWorkbookAnswers,
          graded_by: session.email,
          graded_at: nowIso,
          updated_at: nowIso
        };

        let savedHw = null;
        if (existingHw) {
          const sbRes = await supabaseRequest(env, `ktn_homeworks?id=eq.${encodeURIComponent(existingHw.id)}`, {
            method: 'PATCH',
            prefer: 'return=representation',
            body: patchPayload
          });
          if (!sbRes.ok || !Array.isArray(sbRes.data) || sbRes.data.length === 0) {
            return jsonResponse({
              ok: false,
              syncStatus: 'sync_failed',
              message: 'Không thể cập nhật trạng thái chấm bài trong cơ sở dữ liệu.'
            }, sbRes.status || 500);
          }
          savedHw = sbRes.data[0];
        } else if (body.allowUpsertFromIzTeach && studentEmailHint) {
          const upsertRow = {
            id: hwId || (`HW-${studentEmailHint}-${targetCourseForGrade}-L${targetLessonForGrade}`),
            student_code: String(body.studentCode || ''),
            student_email: studentEmailHint,
            student_name: String(body.studentName || studentEmailHint.split('@')[0]),
            class_code: body.classCode ? String(body.classCode).trim().toUpperCase() : null,
            course_id: targetCourseForGrade,
            lesson_num: targetLessonForGrade,
            lesson_title: String(body.lessonTitle || body.title || `Bài ${targetLessonForGrade}`),
            file_url: String(body.fileUrl || (Array.isArray(body.attachments) && body.attachments[0]?.cdnUrl) || 'https://d21acfi38wn3iy.cloudfront.net/'),
            file_type: String(body.fileType || (Array.isArray(body.attachments) && body.attachments[0]?.mediaType) || 'video'),
            attachments: Array.isArray(body.attachments) ? body.attachments : [],
            student_note: String(body.studentNote || ''),
            ...patchPayload
          };
          const upRes = await supabaseRequest(env, 'ktn_homeworks', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates,return=representation',
            body: upsertRow
          });
          if (!upRes.ok || !Array.isArray(upRes.data) || upRes.data.length === 0) {
            return jsonResponse({ ok: false, syncStatus: 'sync_failed', message: 'Không thể đồng bộ bản ghi bài tập sang cơ sở dữ liệu.' }, upRes.status || 500);
          }
          savedHw = upRes.data[0];
        } else {
          return jsonResponse({
            ok: false,
            message: 'Không tìm thấy bài nộp tương ứng trong cơ sở dữ liệu để cập nhật.'
          }, 404);
        }

        let izteachMirror = null;
        let finalSyncStatus = initialSyncStatus;
        if (unitResolution.isLiveClass) {
          izteachMirror = { ok: true, skipped: true, syncStatus: 'not_applicable_live_class', reason: 'LIVE_CLASS_HOMEWORK' };
        } else if (!unitResolution.valid) {
          izteachMirror = { ok: false, skipped: true, syncStatus: 'mapping_required', reason: unitResolution.reason || 'MAPPING_REQUIRED' };
        } else if (!body.skipIzTeachSync) {
          let verifiedReceipt = null;
          if (body.izteachRemoteId) {
            const checkReceipt = await verifyIzTeachHomeworkReceipt(env, {
              remoteId: body.izteachRemoteId,
              courseId: targetCourseForGrade,
              unitId: unitResolution.unitId,
              expectApproved: nextStatus === 'graded',
              expectedScore: parsedScore
            });
            if (checkReceipt.verified) {
              verifiedReceipt = checkReceipt;
            }
          }

          if (verifiedReceipt) {
            finalSyncStatus = 'synced';
            izteachMirror = {
              ok: true,
              idempotent: true,
              verifiedReceipt: true,
              syncStatus: 'synced',
              remoteId: verifiedReceipt.remoteId,
              courseId: targetCourseForGrade,
              unitId: unitResolution.unitId
            };
          } else {
            izteachMirror = await mirrorHomeworkToIzTeach(env, savedHw, nextStatus === 'graded', { unitId: unitResolution.unitId });
            finalSyncStatus = izteachMirror.syncStatus || (izteachMirror.ok ? 'synced' : 'sync_failed');
          }

          const updatedWb = {
            ...nextWorkbookAnswers,
            _syncMeta: {
              ...nextWorkbookAnswers._syncMeta,
              syncStatus: finalSyncStatus,
              izteachRemoteId: izteachMirror.remoteId || nextWorkbookAnswers._syncMeta.izteachRemoteId || null,
              lastSyncedSignature: izteachMirror.ok ? (izteachMirror.signature || null) : (nextWorkbookAnswers._syncMeta.lastSyncedSignature || null),
              lastSyncedAt: izteachMirror.ok ? new Date().toISOString() : (nextWorkbookAnswers._syncMeta.lastSyncedAt || null),
              lastError: izteachMirror.ok ? null : (izteachMirror.reason || izteachMirror.error || 'SYNC_FAILED')
            }
          };
          const metaPatch = await supabaseRequest(env, `ktn_homeworks?id=eq.${encodeURIComponent(savedHw.id)}`, {
            method: 'PATCH',
            prefer: 'return=representation',
            body: { workbook_answers: updatedWb, updated_at: new Date().toISOString() }
          });
          if (metaPatch.ok && Array.isArray(metaPatch.data) && metaPatch.data[0]) {
            savedHw = metaPatch.data[0];
          } else {
            savedHw.workbook_answers = updatedWb;
          }
        }

        return jsonResponse({
          ok: true,
          syncStatus: finalSyncStatus,
          unitId: unitResolution.unitId || null,
          mirroredToIzTeach: Boolean(izteachMirror?.ok && !izteachMirror?.skipped),
          homework: savedHw,
          izteachMirror: izteachMirror || undefined
        });
      });
    }

    // ------------------------------------------------------------------------
    // E2. BUỔI HỌC & BÀI TẬP THEO LỚP CÔ GIÁO (/api/ktn/class-sessions)
    // ------------------------------------------------------------------------
    if (path === '/api/ktn/class-sessions') {
      if (request.method === 'GET') {
        const session = await extractSessionFromRequest(request, env);
        if (!session) {
          return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập để xem nội dung buổi học.' }, 401);
        }

        const classCode = String(url.searchParams.get('classCode') || '').trim().toUpperCase();
        if (!classCode) {
          return jsonResponse({ ok: false, message: 'Thiếu mã lớp classCode.' }, 400);
        }

        if (session.role === 'teacher') {
          const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
          if (!assignedClasses.includes(classCode)) {
            return jsonResponse({
              ok: false,
              message: `Cô không phụ trách lớp ${classCode} nên không có quyền truy cập buổi học của lớp này.`
            }, 403);
          }
        } else if (session.role === 'student') {
          const stuRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(session.email)}&select=class_code&limit=1`);
          const stuRow = (stuRes.ok && Array.isArray(stuRes.data) && stuRes.data[0]) ? stuRes.data[0] : null;
          const realClassCode = String(stuRow?.class_code || session.classCode || '').trim().toUpperCase();
          if (!realClassCode || realClassCode !== classCode) {
            return jsonResponse({
              ok: false,
              message: `Em không thuộc lớp ${classCode} nên không có quyền xem buổi học của lớp này.`
            }, 403);
          }
        }

        const sessions = await getMergedClassSessions(classCode);
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
        const rawExercises = Array.isArray(body.exercises)
          ? body.exercises
          : (Array.isArray(body.assignments) ? body.assignments : []);
        const exercises = rawExercises.map((ex, idx) => ({
          id: String(ex?.id || `${classCode}-B${sessionNum}-E${idx + 1}`).trim(),
          num: Number(ex?.num || ex?.order) || (idx + 1),
          title: String(ex?.title || `Bài ${idx + 1}`).trim(),
          prompt: String(ex?.prompt || ex?.instruction || '').trim(),
          type: String(ex?.type || 'audio').trim()
        }));

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
    // F. NHÓM LỚP & KÊNH TRAO ĐỔI (CLASS / COURSE / 1-1 + GHIM THÔNG BÁO + DLP)
    // ------------------------------------------------------------------------
    const loadChatReadStateMap = async (userEmail) => {
      const cleanEm = normalizeEmail(userEmail);
      if (!cleanEm) return {};
      const rs = await supabaseRequest(
        env,
        `ktn_dlp_alerts?room_id=eq.CHAT_READ_STATE&sender_email=eq.${encodeURIComponent(cleanEm)}&order=created_at.desc&limit=20`
      );
      const map = {};
      if (rs.ok && Array.isArray(rs.data)) {
        for (const r of rs.data.slice().reverse()) {
          try {
            const parsed = JSON.parse(r.blocked_content || '{}');
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              Object.assign(map, parsed);
            }
          } catch {}
        }
      }
      return map;
    };

    if (path === '/api/ktn/messages/read' && (request.method === 'POST' || request.method === 'PATCH')) {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      const body = await request.json().catch(() => ({}));
      const rawRoomId = String(body.roomId || body.classCode || '').trim();
      const access = await canAccessChatRoom(env, session, rawRoomId);
      if (!access.allowed) {
        return jsonResponse({
          ok: false,
          ...(access.error ? { error: access.error } : {}),
          message: access.message
        }, access.status);
      }
      const canonicalRoom = access.roomId;
      const lastReadMessageId = String(body.lastReadMessageId || body.messageId || '').trim() || null;
      const lastReadAt = String(body.lastReadAt || new Date().toISOString()).trim();

      const existingRes = await supabaseRequest(
        env,
        `ktn_dlp_alerts?room_id=eq.CHAT_READ_STATE&sender_email=eq.${encodeURIComponent(session.email)}&order=created_at.desc&limit=20`
      );
      const existingRows = (existingRes.ok && Array.isArray(existingRes.data)) ? existingRes.data : [];
      const mergedMap = {};
      for (const r of existingRows.slice().reverse()) {
        try {
          const parsed = JSON.parse(r.blocked_content || '{}');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            Object.assign(mergedMap, parsed);
          }
        } catch {}
      }
      const entry = {
        roomId: canonicalRoom,
        lastReadMessageId,
        lastReadAt,
        updatedAt: new Date().toISOString()
      };
      mergedMap[canonicalRoom] = entry;
      if (access.classCode) {
        mergedMap[access.classCode] = entry;
        mergedMap[`class:${access.classCode}`] = entry;
      }

      let sbRes = null;
      const latestRow = existingRows[0];
      if (latestRow && latestRow.id) {
        sbRes = await supabaseRequest(env, `ktn_dlp_alerts?id=eq.${encodeURIComponent(latestRow.id)}`, {
          method: 'PATCH',
          prefer: 'return=representation',
          body: { blocked_content: JSON.stringify(mergedMap) }
        });
      }
      if (!sbRes || !sbRes.ok || !Array.isArray(sbRes.data) || sbRes.data.length === 0) {
        sbRes = await supabaseRequest(env, 'ktn_dlp_alerts', {
          method: 'POST',
          prefer: 'return=representation',
          body: {
            id: 'CREAD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
            room_id: 'CHAT_READ_STATE',
            sender_email: session.email,
            sender_name: session.name || session.email,
            sender_role: session.role || 'student',
            blocked_content: JSON.stringify(mergedMap),
            reason: 'CHAT_ROOM_READ_STATE'
          }
        });
      }
      if (!sbRes || !sbRes.ok) {
        return jsonResponse({ ok: false, message: 'Chưa lưu được trạng thái đã đọc hội thoại.' }, sbRes?.status || 503);
      }
      return jsonResponse({
        ok: true,
        roomId: canonicalRoom,
        readState: entry,
        readStateByRoom: mergedMap
      });
    }

    if (path === '/api/ktn/messages/rooms' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);

      const readStateByRoom = await loadChatReadStateMap(session.email);
      const myEmail = normalizeEmail(session.email);

      const enrichRoomsWithStats = async (roomsList) => {
        if (!Array.isArray(roomsList) || roomsList.length === 0) return roomsList;
        const queryKeys = new Set();
        for (const r of roomsList) {
          if (r.roomId) queryKeys.add(r.roomId);
          if (r.classCode) {
            queryKeys.add(r.classCode);
            queryKeys.add(`class:${r.classCode}`);
          }
        }
        const inParam = Array.from(queryKeys).map(k => encodeURIComponent(k)).join(',');
        if (!inParam) return roomsList;
        const recentRes = await supabaseRequest(
          env,
          `ktn_messages?room_id=in.(${inParam})&order=created_at.desc&limit=200`
        );
        const recentMsgs = (recentRes.ok && Array.isArray(recentRes.data)) ? recentRes.data : [];
        return roomsList.map(r => {
          const matchKeys = new Set([r.roomId, r.classCode, r.classCode ? `class:${r.classCode}` : ''].filter(Boolean));
          const roomMsgs = recentMsgs.filter(m => m && matchKeys.has(String(m.room_id || m.class_code || '').trim()));
          roomMsgs.sort((a, b) => (Date.parse(a.created_at || '') - Date.parse(b.created_at || '')) || String(a.id || '').localeCompare(String(b.id || '')));
          const latest = roomMsgs[roomMsgs.length - 1] || null;
          const readEntry = readStateByRoom[r.roomId] || (r.classCode ? readStateByRoom[r.classCode] : null) || null;
          const lastReadAtMs = readEntry?.lastReadAt ? Date.parse(readEntry.lastReadAt) : 0;
          const lastReadId = readEntry?.lastReadMessageId || null;
          let unreadCount = 0;
          for (const m of roomMsgs) {
            if (normalizeEmail(m.sender_email) === myEmail) continue;
            if (lastReadId && m.id === lastReadId) {
              unreadCount = 0;
              continue;
            }
            const mTs = Date.parse(m.created_at || '') || 0;
            if (!lastReadAtMs || mTs > lastReadAtMs) {
              unreadCount++;
            }
          }
          return {
            ...r,
            lastMessage: latest ? String(latest.content || '').slice(0, 100) : (r.lastMessage || ''),
            lastSenderName: latest?.sender_name || r.lastSenderName || '',
            lastSenderRole: latest?.sender_role || r.lastSenderRole || '',
            updatedAt: latest?.created_at || r.updatedAt || '',
            lastMessageId: latest?.id || null,
            lastReadMessageId: lastReadId,
            unreadCount,
            unread: unreadCount > 0
          };
        });
      };

      if (session.role === 'student') {
        const stuRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(session.email)}&limit=1`);
        const stuRow = (stuRes.ok && Array.isArray(stuRes.data) && stuRes.data[0]) ? stuRes.data[0] : null;
        const classCode = String(stuRow?.class_code || session.classCode || '').trim().toUpperCase();
        const onlineList = Array.isArray(stuRow?.online_courses)
          ? stuRow.online_courses
          : (Array.isArray(session.onlineCourses) ? session.onlineCourses : []);

        const rawGroupRooms = [];
        const seenRoomIds = new Set();
        if (classCode) {
          const rid = `class:${classCode}`;
          seenRoomIds.add(rid);
          rawGroupRooms.push({
            roomId: rid,
            type: 'class',
            classCode,
            teacherName: 'Cô Lâm Mỹ Linh',
            label: `🏫 Lớp ${classCode}`,
            shortLabel: `Lớp ${classCode}`
          });
        }
        for (const c of onlineList) {
          const rawCid = String(c?.id || c?._id || c || '').trim().toLowerCase();
          if (!rawCid) continue;
          const canonicalCid = COURSE_CHAT_ALIASES[rawCid] || rawCid;
          const rid = `course:${canonicalCid}`;
          if (seenRoomIds.has(rid)) continue;
          seenRoomIds.add(rid);
          const meta = MASTER_PRODUCT_MAPPING[canonicalCid] || {};
          const shortTitle = meta.shortTitle || c?.shortTitle || c?.title || 'Khóa học Video';
          rawGroupRooms.push({
            roomId: rid,
            type: 'course',
            courseId: canonicalCid,
            rawCourseId: rawCid,
            teacherName: 'Ban Giảng Huấn KTN',
            label: `🎬 ${shortTitle}`,
            shortLabel: shortTitle
          });
        }
        const rawPrivateRoom = {
          roomId: `student:${myEmail}`,
          type: 'student',
          studentEmail: myEmail,
          label: '👩‍🏫 Nhắn riêng Cô',
          teacherName: 'Cô Lâm Mỹ Linh'
        };
        const enrichedAll = await enrichRoomsWithStats([...rawGroupRooms, rawPrivateRoom]);
        const groupRooms = enrichedAll.slice(0, rawGroupRooms.length);
        const privateRoom = enrichedAll[rawGroupRooms.length] || rawPrivateRoom;
        return jsonResponse({ ok: true, role: 'student', groupRooms, privateRoom, readStateByRoom });
      }

      // Teacher hoặc Admin
      const assignedClasses = session.role === 'admin'
        ? ['YCT2-04', 'YCT1-01', 'HSK1-K12']
        : await getTeacherAssignedClassCodes(env, session.email);
      const rawGroupRooms = [];
      const seenGroupIds = new Set();
      for (const cls of assignedClasses) {
        const rid = `class:${cls}`;
        if (seenGroupIds.has(rid)) continue;
        seenGroupIds.add(rid);
        rawGroupRooms.push({
          roomId: rid,
          type: 'class',
          classCode: cls,
          teacherName: session.name || 'Cô Lâm Mỹ Linh',
          label: `🏫 Lớp ${cls}`,
          shortLabel: `Lớp ${cls}`
        });
      }
      const primaryCourseIds = [
        '6adadba969897b0002482ca5',
        '65e7704a9ea90c00080d5195',
        '65e769bd637339000870618f'
      ];
      for (const cid of primaryCourseIds) {
        const meta = MASTER_PRODUCT_MAPPING[cid];
        if (!meta) continue;
        const rid = `course:${cid}`;
        if (seenGroupIds.has(rid)) continue;
        seenGroupIds.add(rid);
        rawGroupRooms.push({
          roomId: rid,
          type: 'course',
          courseId: cid,
          teacherName: 'Ban Giảng Huấn KTN',
          label: `🎬 Khóa ${meta.shortTitle}`,
          shortLabel: `Khóa ${meta.shortTitle}`
        });
      }

      const [privMsgRes, stuListRes, groupRooms] = await Promise.all([
        supabaseRequest(env, 'ktn_messages?room_id=like.student:*&order=created_at.desc&limit=100'),
        supabaseRequest(env, 'ktn_students?order=updated_at.desc&limit=50'),
        enrichRoomsWithStats(rawGroupRooms)
      ]);
      const stuMap = new Map();
      if (stuListRes.ok && Array.isArray(stuListRes.data)) {
        for (const s of stuListRes.data) {
          const em = normalizeEmail(s?.email || '');
          if (em) stuMap.set(em, s);
        }
      }
      const threadMap = new Map();
      if (privMsgRes.ok && Array.isArray(privMsgRes.data)) {
        for (const m of privMsgRes.data) {
          const rid = String(m?.room_id || m?.class_code || '').trim().toLowerCase();
          if (!rid.startsWith('student:')) continue;
          const stuEmail = normalizeEmail(rid.slice(8));
          if (!stuEmail || threadMap.has(stuEmail)) continue;
          const stuInfo = stuMap.get(stuEmail);
          const studentName = stuInfo?.name || (m.sender_role === 'student' ? m.sender_name : '') || stuEmail;
          const roomKey = `student:${stuEmail}`;
          const readEntry = readStateByRoom[roomKey] || null;
          const lastReadAtMs = readEntry?.lastReadAt ? Date.parse(readEntry.lastReadAt) : 0;
          const msgTs = Date.parse(m.created_at || '') || 0;
          const isUnread = m.sender_role === 'student' && (!readEntry || (readEntry.lastReadMessageId !== m.id && msgTs > lastReadAtMs));
          threadMap.set(stuEmail, {
            roomId: roomKey,
            type: 'student',
            studentEmail: stuEmail,
            studentName,
            classCode: stuInfo?.class_code || '',
            label: `👩‍🏫 ${studentName}`,
            lastMessage: String(m.content || '').slice(0, 80),
            lastSenderRole: m.sender_role || '',
            updatedAt: m.created_at || '',
            lastMessageId: m.id || null,
            lastReadMessageId: readEntry?.lastReadMessageId || null,
            unreadCount: isUnread ? 1 : 0,
            unread: isUnread
          });
        }
      }
      for (const [em, s] of stuMap.entries()) {
        if (threadMap.has(em)) continue;
        const studentName = s?.name || em;
        threadMap.set(em, {
          roomId: `student:${em}`,
          type: 'student',
          studentEmail: em,
          studentName,
          classCode: s?.class_code || '',
          label: `👩‍🏫 ${studentName}`,
          lastMessage: 'Nhắn riêng 1-1 với học viên',
          lastSenderRole: '',
          updatedAt: s?.updated_at || '',
          unreadCount: 0,
          unread: false
        });
      }

      return jsonResponse({
        ok: true,
        role: session.role,
        groupRooms,
        privateThreads: Array.from(threadMap.values()),
        readStateByRoom
      });
    }

    if (path === '/api/ktn/messages/pin' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      if (session.role !== 'teacher' && session.role !== 'admin') {
        return jsonResponse({
          ok: false,
          message: 'Chỉ giáo viên hoặc quản trị viên mới có quyền ghim thông báo nhóm lớp.'
        }, 403);
      }
      const body = await request.json().catch(() => ({}));
      const rawRoomId = String(body.roomId || body.classCode || '').trim();
      const access = await canAccessChatRoom(env, session, rawRoomId);
      if (!access.allowed) {
        return jsonResponse({
          ok: false,
          ...(access.error ? { error: access.error } : {}),
          message: access.message
        }, access.status);
      }
      const content = String(body.content || body.text || '').trim();
      if (!content) {
        return jsonResponse({ ok: false, message: 'Nội dung thông báo ghim không được để trống.' }, 400);
      }
      const saved = await saveRoomPinnedAnnouncement(env, session, access, content, body.messageId || null);
      if (!saved.ok) {
        return jsonResponse({ ok: false, message: 'Không thể lưu thông báo ghim.' }, saved.status || 503);
      }
      return jsonResponse({
        ok: true,
        roomId: access.roomId,
        pinnedMessage: saved.pinnedMessage
      });
    }

    if (path === '/api/ktn/messages' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      const rawRoomId = url.searchParams.get('roomId') || url.searchParams.get('classCode') || '';
      const access = await canAccessChatRoom(env, session, rawRoomId);
      if (!access.allowed) {
        return jsonResponse({
          ok: false,
          ...(access.error ? { error: access.error } : {}),
          message: access.message
        }, access.status);
      }
      const requestedLimit = Number(url.searchParams.get('limit') || 100);
      const pageLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(200, Math.max(1, Math.floor(requestedLimit)))
        : 100;
      const beforeCursor = String(url.searchParams.get('before') || '').trim();

      const inList = (access.queryKeys || [access.classCode]).map(k => encodeURIComponent(k)).join(',');
      // BUG CHAT-05 Fix: Lấy tin mới nhất trước (desc, tối đa 500) rồi sắp xếp ổn định theo (created_at ASC, id ASC)
      // để không bao giờ bị mất các tin sau tin thứ 100 và hỗ trợ phân trang cursor-based khi cuộn lên.
      const query = `ktn_messages?room_id=in.(${inList})&order=created_at.desc&limit=500`;
      const [sbRes, pinnedMessage] = await Promise.all([
        supabaseRequest(env, query),
        getRoomPinnedAnnouncement(env, access)
      ]);
      if (!sbRes.ok || !Array.isArray(sbRes.data)) {
        return jsonResponse({
          ok: false,
          message: 'Không thể tải danh sách tin nhắn từ máy chủ.'
        }, sbRes.status && sbRes.status >= 400 ? sbRes.status : 503);
      }
      const deduped = [];
      const seenMsgIds = new Set();
      for (const row of sbRes.data) {
        if (!row) continue;
        const rid = String(row.id || '').trim();
        if (rid && seenMsgIds.has(rid)) continue;
        if (rid) seenMsgIds.add(rid);
        deduped.push(row);
      }
      // Sắp xếp ổn định theo (created_at ASC, id ASC)
      deduped.sort((a, b) => {
        const ta = Date.parse(a.created_at || '') || 0;
        const tb = Date.parse(b.created_at || '') || 0;
        if (ta !== tb) return ta - tb;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });

      let endIdx = deduped.length;
      if (beforeCursor) {
        const idxById = deduped.findIndex(m => String(m.id || '') === beforeCursor);
        if (idxById >= 0) {
          endIdx = idxById;
        } else {
          const cursorTs = Date.parse(beforeCursor);
          if (Number.isFinite(cursorTs)) {
            const idxByTs = deduped.findIndex(m => (Date.parse(m.created_at || '') || 0) >= cursorTs);
            if (idxByTs >= 0) endIdx = idxByTs;
          }
        }
      }
      const startIdx = Math.max(0, endIdx - pageLimit);
      const pageItems = deduped.slice(startIdx, endIdx);
      const hasMore = startIdx > 0;
      const nextCursor = hasMore && pageItems.length > 0 ? String(pageItems[0].id || '') : null;

      return jsonResponse({
        ok: true,
        roomId: access.roomId,
        roomType: access.type,
        messages: pageItems,
        pinnedMessage,
        pagination: {
          hasMore,
          nextCursor,
          oldestCreatedAt: pageItems[0]?.created_at || null,
          limit: pageLimit,
          totalAvailable: deduped.length
        }
      });
    }

    if (path === '/api/ktn/messages' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      const body = await request.json().catch(() => ({}));
      const rawRoomId = String(body.roomId || body.classCode || '').trim();
      const access = await canAccessChatRoom(env, session, rawRoomId);
      if (!access.allowed) {
        return jsonResponse({
          ok: false,
          ...(access.error ? { error: access.error } : {}),
          message: access.message
        }, access.status);
      }
      const content = String(body.content || body.text || '').trim();
      const attachmentUrl = String(body.attachmentUrl || '').trim();
      if (!content && !attachmentUrl) return jsonResponse({ ok: false, message: 'Nội dung tin nhắn trống.' }, 400);
      const clientMessageId = String(body.clientMessageId || body.idempotencyKey || '').trim();
      const targetRoomKey = access.type === 'class' ? access.classCode : access.roomId;
      const inList = (access.queryKeys || [targetRoomKey]).map(k => encodeURIComponent(k)).join(',');

      const dlp = inspectDlpContent(content);
      if (dlp.blocked) {
        await supabaseRequest(env, 'ktn_dlp_alerts', {
          method: 'POST',
          body: {
            id: 'DLP-' + Date.now(),
            room_id: targetRoomKey,
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
          ...(clientMessageId ? { clientMessageId } : {}),
          message: 'Tin nhắn chứa SĐT hoặc liên kết ngoài luồng đã bị hệ thống bảo vệ DLP chặn.'
        }, 422);
      }

      if (!globalThis.__ktnClientMessageIdMap) globalThis.__ktnClientMessageIdMap = new Map();
      const clientDedupKey = clientMessageId ? `${session.email}|${targetRoomKey}|${clientMessageId}` : '';

      const msgLockKey = `MSG|${targetRoomKey}|${session.email}|${clientMessageId || content}|${attachmentUrl}`;
      return runWithHomeworkConcurrencyLock(msgLockKey, async () => {
        if (clientDedupKey && globalThis.__ktnClientMessageIdMap.has(clientDedupKey)) {
          const cachedMsg = globalThis.__ktnClientMessageIdMap.get(clientDedupKey);
          return jsonResponse({
            ok: true,
            persisted: true,
            idempotent: true,
            clientMessageId,
            serverMessageId: cachedMsg.id,
            message: cachedMsg
          });
        }

        // Kiểm tra chống gửi trùng lặp trong vòng 4 giây gần nhất trên máy chủ
        const recentRes = await supabaseRequest(
          env,
          `ktn_messages?room_id=in.(${inList})&sender_email=eq.${encodeURIComponent(session.email)}&order=created_at.desc&limit=5`
        );
        if (recentRes.ok && Array.isArray(recentRes.data)) {
          const nowMs = Date.now();
          const duplicateHit = recentRes.data.find(m => {
            if (!m || String(m.content || '').trim() !== content) return false;
            if (String(m.attachment_url || '') !== attachmentUrl) return false;
            const createdMs = Date.parse(m.created_at || '');
            return Number.isFinite(createdMs) && Math.abs(nowMs - createdMs) <= 4000;
          });
          if (duplicateHit && duplicateHit.id) {
            if (clientDedupKey) globalThis.__ktnClientMessageIdMap.set(clientDedupKey, duplicateHit);
            return jsonResponse({
              ok: true,
              persisted: true,
              idempotent: true,
              ...(clientMessageId ? { clientMessageId } : {}),
              serverMessageId: duplicateHit.id,
              message: duplicateHit
            });
          }
        }

        // Máy chủ tự sinh ID tin nhắn và gắn cứng room_id theo phòng đã phân quyền
        const nowIso = new Date().toISOString();
        const msgRecord = {
          id: 'MSG-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          room_id: targetRoomKey,
          class_code: targetRoomKey,
          sender_email: session.email,
          sender_name: session.name,
          sender_role: session.role,
          content: content || '[Tệp đính kèm]',
          attachment_url: attachmentUrl,
          created_at: nowIso
        };
        const sbRes = await supabaseRequest(env, 'ktn_messages', {
          method: 'POST',
          prefer: 'return=representation',
          body: msgRecord
        });
        const savedRow = (sbRes.ok && Array.isArray(sbRes.data) && sbRes.data[0]) ? sbRes.data[0] : null;
        if (!savedRow || !savedRow.id) {
          return jsonResponse({
            ok: false,
            persisted: false,
            ...(clientMessageId ? { clientMessageId } : {}),
            message: 'Máy chủ chưa lưu được tin nhắn vào cơ sở dữ liệu. Vui lòng thử lại.'
          }, sbRes.status && sbRes.status >= 400 ? sbRes.status : 503);
        }

        if (clientDedupKey) {
          globalThis.__ktnClientMessageIdMap.set(clientDedupKey, savedRow);
        }

        let pinnedMessage = null;
        if ((session.role === 'teacher' || session.role === 'admin') && body.isPinned === true) {
          const pinRes = await saveRoomPinnedAnnouncement(env, session, access, content, savedRow.id);
          pinnedMessage = pinRes.pinnedMessage;
        }
        return jsonResponse({
          ok: true,
          persisted: true,
          ...(clientMessageId ? { clientMessageId } : {}),
          serverMessageId: savedRow.id,
          message: savedRow,
          ...(pinnedMessage ? { pinnedMessage } : {})
        });
      });
    }

    if (path === '/api/ktn/notifications' && request.method === 'GET') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      }

      const items = [];
      if (session.role === 'student') {
        const stuRes = await supabaseRequest(env, `ktn_students?email=eq.${encodeURIComponent(session.email)}&limit=1`);
        const stu = (Array.isArray(stuRes.data) && stuRes.data[0]) || null;
        const classCode = String(stu?.class_code || session.classCode || '').trim().toUpperCase() || null;

        const hwRes = await supabaseRequest(env, `ktn_homeworks?student_email=eq.${encodeURIComponent(session.email)}&order=updated_at.desc&limit=20`);
        const hws = Array.isArray(hwRes.data) ? hwRes.data : [];

        // Chỉ phát thông báo dựa trên sự kiện thật: Cô giáo vừa nhận xét bài tập hoặc Tin nhắn thật từ cô giáo
        for (const hw of hws) {
          if (hw.status === 'graded' || hw.status === 'revision_requested') {
            const isRev = hw.status === 'revision_requested';
            const rawCourseId = String(hw.course_id || '').trim();
            const isLiveClassHw = rawCourseId.toUpperCase().startsWith('CLASS_') || (!rawCourseId && Boolean(hw.class_code)) || Number(hw.lesson_num) >= 100;
            const liveCls = rawCourseId.toUpperCase().startsWith('CLASS_')
              ? rawCourseId.slice(6).trim()
              : String(hw.class_code || classCode || '').trim();
            const sNum = isLiveClassHw
              ? (Number(hw.lesson_num) >= 100 ? Math.floor(Number(hw.lesson_num) / 100) : (Number(hw.lesson_num) || 1))
              : (Number(hw.lesson_num) || 1);
            items.push({
              id: `NOTIF-GRADED-${hw.id}-${hw.status}-${hw.score ?? ''}`,
              type: 'homework_graded',
              classCode: liveCls || classCode || '',
              title: 'Cô giáo vừa nhận xét.',
              body: isRev
                ? `Cần sửa lại: ${hw.lesson_title || ('Bài ' + hw.lesson_num)}`
                : (hw.score !== null && hw.score !== undefined
                    ? `${hw.lesson_title || ('Bài ' + hw.lesson_num)} · ${hw.score}đ`
                    : (hw.lesson_title || `Bài ${hw.lesson_num}`)),
              actionUrl: (isLiveClassHw && liveCls)
                ? `#/lop/${liveCls.toLowerCase()}/buoi/${sNum}`
                : `#/khoa/${rawCourseId}/bai/${sNum}`,
              createdAt: hw.graded_at || hw.updated_at || hw.submitted_at,
              homeworkId: hw.id,
              courseId: hw.course_id,
              lessonNum: hw.lesson_num
            });
          }
        }

        if (classCode) {
          const sessRes = await supabaseRequest(env, `ktn_class_sessions?class_code=eq.${encodeURIComponent(classCode)}&order=updated_at.desc&limit=5`);
          const classSessions = Array.isArray(sessRes.data) ? sessRes.data : [];
          for (const cs of classSessions) {
            const sNum = Number(cs.session_num) || 1;
            const exList = Array.isArray(cs.exercises) ? cs.exercises : (Array.isArray(cs.assignments) ? cs.assignments : []);
            items.push({
              id: `NOTIF-ASSIGN-${classCode}-S${sNum}-${cs.updated_at || cs.id || sNum}`,
              type: 'homework_assigned',
              classCode,
              sessionNum: sNum,
              title: `Bài tập mới Lớp ${classCode} · Buổi ${sNum}`,
              body: `${cs.title || ('Buổi ' + sNum)}${exList.length ? ` (${exList.length} bài tập)` : ''}`,
              actionUrl: `#/lop/${classCode.toLowerCase()}/buoi/${sNum}`,
              createdAt: cs.updated_at || cs.created_at || new Date().toISOString()
            });
          }
        }

        const myEmail = normalizeEmail(session.email);
        const roomQuerySet = new Set([`student:${myEmail}`]);
        if (classCode) {
          roomQuerySet.add(classCode);
          roomQuerySet.add(`class:${classCode}`);
        }
        const onlineList = Array.isArray(stu?.online_courses)
          ? stu.online_courses
          : (Array.isArray(session.onlineCourses) ? session.onlineCourses : []);
        for (const c of onlineList) {
          const rawCid = String(c?.id || c?._id || c || '').trim().toLowerCase();
          if (!rawCid) continue;
          const canonicalCid = COURSE_CHAT_ALIASES[rawCid] || rawCid;
          roomQuerySet.add(`course:${canonicalCid}`);
        }
        const roomInParam = Array.from(roomQuerySet).map(k => encodeURIComponent(k)).join(',');
        const msgRes = await supabaseRequest(env, `ktn_messages?room_id=in.(${roomInParam})&sender_role=in.(teacher,admin)&order=created_at.desc&limit=5`);
        const teacherMsgs = Array.isArray(msgRes.data) ? msgRes.data : [];
        for (const latestMsg of teacherMsgs) {
          const rawRoom = String(latestMsg.room_id || latestMsg.class_code || classCode || '').trim();
          const isPrivate = rawRoom.toLowerCase().startsWith('student:');
          const isCourseRoom = rawRoom.toLowerCase().startsWith('course:');
          const isPinned = Boolean(latestMsg.attachment && latestMsg.attachment.pinned);
          items.push({
            id: `NOTIF-MSG-${classCode || rawRoom}-${latestMsg.id}`,
            type: isPinned ? 'announcement_pinned' : 'chat_message',
            classCode: classCode || rawRoom,
            roomId: rawRoom,
            messageId: latestMsg.id,
            title: isPinned
              ? 'Thông báo quan trọng được ghim.'
              : (isPrivate ? 'Cô giáo vừa nhắn riêng cho em.' : 'Tin nhắn mới từ cô giáo.'),
            body: `${latestMsg.sender_name || 'Cô giáo'}: ${String(latestMsg.content || '').slice(0, 60)}`,
            actionUrl: (classCode && !isPrivate && !isCourseRoom) ? `#/lop/${classCode.toLowerCase()}/buoi/1` : '#/nhom-lop',
            createdAt: latestMsg.created_at
          });
        }
      } else if (session.role === 'teacher') {
        const assignedClasses = await getTeacherAssignedClassCodes(env, session.email);
        if (assignedClasses.length > 0) {
          const classListParam = assignedClasses.map(c => encodeURIComponent(c)).join(',');
          const hwRes = await supabaseRequest(env, `ktn_homeworks?class_code=in.(${classListParam})&status=eq.pending&order=submitted_at.desc&limit=15`);
          const pendingHws = Array.isArray(hwRes.data) ? hwRes.data : [];
          for (const hw of pendingHws) {
            items.push({
              id: `NOTIF-SUB-${hw.id}-${hw.submitted_at || ''}`,
              type: 'homework_submitted',
              classCode: hw.class_code || '',
              homeworkId: hw.id,
              title: 'Học sinh vừa nộp bài.',
              body: `${hw.student_name || hw.student_email} · ${hw.lesson_title || ('Bài ' + hw.lesson_num)}`,
              actionUrl: `/custom-page/so-lien-lac-test?view=grade&hwId=${encodeURIComponent(hw.id)}`,
              createdAt: hw.submitted_at
            });
          }
        }
        const roomKeys = [
          ...assignedClasses.flatMap(c => [c, `class:${c}`]),
          'course:6adadba969897b0002482ca5',
          'course:65e7704a9ea90c00080d5195',
          'course:65e769bd637339000870618f'
        ];
        const roomListParam = roomKeys.map(c => encodeURIComponent(c)).join(',');
        const [groupMsgRes, privMsgRes] = await Promise.all([
          supabaseRequest(env, `ktn_messages?room_id=in.(${roomListParam})&sender_role=eq.student&order=created_at.desc&limit=5`),
          supabaseRequest(env, 'ktn_messages?room_id=like.student:*&sender_role=eq.student&order=created_at.desc&limit=5')
        ]);
        const mergedStudentMsgs = [
          ...(Array.isArray(groupMsgRes.data) ? groupMsgRes.data : []),
          ...(Array.isArray(privMsgRes.data) ? privMsgRes.data : [])
        ].sort((a, b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')));
        const seenRooms = new Set();
        for (const m of mergedStudentMsgs) {
          const rawR = String(m.room_id || m.class_code || '').trim();
          const normRoom = /^course:|^student:/i.test(rawR) ? rawR : normalizeRoomClassCode(rawR);
          if (!normRoom || seenRooms.has(normRoom)) continue;
          seenRooms.add(normRoom);
          const isPrivate = /^student:/i.test(normRoom);
          items.push({
            id: `NOTIF-TMSG-${normRoom}-${m.id}`,
            type: 'chat_message',
            classCode: normRoom,
            roomId: normRoom,
            title: isPrivate ? 'Học sinh vừa nhắn riêng (1-1).' : 'Tin nhắn mới từ học sinh.',
            body: `${m.sender_name || m.sender_email} (${normRoom}): ${String(m.content || '').slice(0, 60)}`,
            actionUrl: `/custom-page/so-lien-lac-test?view=groups&room=${encodeURIComponent(normRoom)}`,
            createdAt: m.created_at
          });
        }
      } else if (session.role === 'admin') {
        const ordRes = await supabaseRequest(env, 'ktn_orders?approval_status=eq.pending&order=created_at.desc&limit=10');
        for (const ord of (Array.isArray(ordRes.data) ? ordRes.data : [])) {
          items.push({
            id: `NOTIF-ORD-${ord.order_id}`,
            type: 'order_pending',
            title: 'Đơn đăng ký mới chờ duyệt.',
            body: `${ord.student_name} · ${ord.course_name}`,
            actionUrl: `/custom-page/so-lien-lac-test?view=orders&orderId=${encodeURIComponent(ord.order_id)}`,
            createdAt: ord.created_at
          });
        }
      }

      const readStateRes = await supabaseRequest(
        env,
        `ktn_dlp_alerts?room_id=eq.NOTIF_READ_STATE&sender_email=eq.${encodeURIComponent(session.email)}&order=created_at.desc&limit=50`
      );
      const readSet = new Set();
      if (readStateRes.ok && Array.isArray(readStateRes.data)) {
        for (const r of readStateRes.data) {
          try {
            const parsed = JSON.parse(r.blocked_content || '[]');
            if (Array.isArray(parsed)) parsed.forEach(id => readSet.add(String(id)));
          } catch {}
        }
      }

      items.sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0));

      const hydrated = items.slice(0, 15).map(it => ({
        ...it,
        target_email: session.email,
        read: readSet.has(it.id)
      }));

      return jsonResponse({ ok: true, notifications: hydrated, readIds: Array.from(readSet) });
    }

    if (path === '/api/ktn/notifications/read' && (request.method === 'PATCH' || request.method === 'POST')) {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập.' }, 401);
      }
      const body = await request.json().catch(() => ({}));
      const ids = Array.isArray(body.ids)
        ? body.ids.map(x => String(x || '').trim()).filter(Boolean)
        : (body.id ? [String(body.id).trim()] : []);
      if (ids.length === 0) {
        return jsonResponse({ ok: true, markedCount: 0 });
      }
      const existingReadRes = await supabaseRequest(
        env,
        `ktn_dlp_alerts?room_id=eq.NOTIF_READ_STATE&sender_email=eq.${encodeURIComponent(session.email)}&order=created_at.desc&limit=50`
      );
      const mergedSet = new Set();
      const existingRows = (existingReadRes.ok && Array.isArray(existingReadRes.data)) ? existingReadRes.data : [];
      for (const r of existingRows.slice().reverse()) {
        try {
          const parsed = JSON.parse(r.blocked_content || '[]');
          if (Array.isArray(parsed)) parsed.forEach(id => { if (id) mergedSet.add(String(id).trim()); });
        } catch {}
      }
      ids.forEach(id => mergedSet.add(id));
      const mergedIds = Array.from(mergedSet).slice(-500);

      let sbRes = null;
      const latestRow = existingRows[0];
      if (latestRow && latestRow.id) {
        sbRes = await supabaseRequest(env, `ktn_dlp_alerts?id=eq.${encodeURIComponent(latestRow.id)}`, {
          method: 'PATCH',
          prefer: 'return=representation',
          body: {
            blocked_content: JSON.stringify(mergedIds)
          }
        });
      }
      if (!sbRes || !sbRes.ok || !Array.isArray(sbRes.data) || sbRes.data.length === 0) {
        sbRes = await supabaseRequest(env, 'ktn_dlp_alerts', {
          method: 'POST',
          prefer: 'return=representation',
          body: {
            id: 'NREAD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
            room_id: 'NOTIF_READ_STATE',
            sender_email: session.email,
            sender_name: session.name || session.email,
            sender_role: session.role || 'student',
            blocked_content: JSON.stringify(mergedIds),
            reason: 'NOTIFICATION_READ_STATE'
          }
        });
      }
      if (!sbRes.ok) {
        return jsonResponse({ ok: false, message: 'Chưa lưu được trạng thái đã đọc thông báo.' }, sbRes.status || 500);
      }
      return jsonResponse({ ok: true, markedCount: ids.length, totalReadCount: mergedIds.length, ids });
    }

    if (path === '/api/ktn/push/subscribe' && request.method === 'POST') {
      const session = await extractSessionFromRequest(request, env);
      if (!session) {
        return jsonResponse({ ok: false, message: 'Vui lòng đăng nhập để đăng ký nhận thông báo.' }, 401);
      }
      const body = await request.json().catch(() => ({}));
      const sub = body.subscription || {};
      const keys = sub.keys || {};
      if (!sub.endpoint || !keys.p256dh || !keys.auth) {
        return jsonResponse({ ok: false, message: 'Dữ liệu PushSubscription không hợp lệ.' }, 400);
      }
      await supabaseRequest(env, 'ktn_push_subscriptions', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: {
          user_email: session.email,
          user_role: session.role,
          class_code: session.classCode || null,
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
