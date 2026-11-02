// Khổng Tử Nhí — Unified Service Worker (Apple APNs & Google FCM Web Push + PWA Shell)
const SHELL_CACHE_NAME = 'ktn-sll-shell-v2';
const CDN_LOGO = 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/sofl-remake/logo.png';
const VAPID_PUBLIC_KEY = 'BFWxJ4T_sakVqTfRjAQOpN7RghDoQRo9owPWy_W1lvdoVYpqFdLJRmEOYgQEPPiEHpotoaixRt8oq2_R4VH8afM';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 1. Nhận Web Push từ Apple APNs / Google FCM ngay cả khi đã vuốt đóng hẳn ứng dụng / khóa màn hình
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: 'Học Viện Khổng Tử Nhí',
      body: event.data ? event.data.text() : 'Bạn có thông báo mới trong Sổ Liên Lạc Điện Tử!'
    };
  }
  const notif = payload.notification || payload;
  const title = notif.title || 'Học Viện Khổng Tử Nhí';
  const options = {
    body: notif.body || 'Chạm để mở ứng dụng xem chi tiết.',
    icon: notif.icon || CDN_LOGO,
    badge: notif.badge || CDN_LOGO,
    tag: notif.id || notif.tag || ('ktn-push-' + Date.now()),
    renotify: true,
    data: {
      url: notif.action_url || (notif.data && notif.data.url) || '/custom-page/so-lien-lac-test',
      id: notif.id || ''
    },
    vibrate: [200, 100, 200]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 2. Tự động gia hạn Push Subscription vĩnh viễn nếu Apple/Google xoay vòng token (Cài 1 lần - Vĩnh viễn)
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    }).then((newSub) => {
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'KTN_PUSH_SUBSCRIPTION_CHANGED',
            subscription: newSub.toJSON()
          });
        });
      });
    }).catch(() => {})
  );
});

// 3. Cho phép trang web kích hoạt thông báo qua Service Worker
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'KTN_SHOW_NOTIFICATION') {
    const title = data.title || 'Học Viện Khổng Tử Nhí';
    const options = {
      body: data.body || '',
      icon: data.icon || CDN_LOGO,
      badge: CDN_LOGO,
      tag: (data.data && data.data.id) || data.tag || ('ktn-local-' + Date.now()),
      data: {
        url: (data.data && data.data.action_url) || data.url || '/custom-page/so-lien-lac-test'
      },
      vibrate: [180, 80, 180]
    };
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

// 4. Khi người dùng chạm vào thông báo ngoài Màn hình khóa iPhone / Android
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || '/custom-page/so-lien-lac-test';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'KTN_NOTIFICATION_CLICKED', data });
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
