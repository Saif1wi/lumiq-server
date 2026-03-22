// LUMIQ Service Worker
var CACHE_NAME = 'lumiq-v1';

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(clients.claim());
});

// استقبال Push Notification
self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data.json(); } catch(x) { data = { title: 'LUMIQ', body: e.data ? e.data.text() : 'رسالة جديدة' }; }
  var title = data.title || 'LUMIQ';
  var options = {
    body: data.body || 'لديك رسالة جديدة',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'lumiq-msg',
    data: { url: data.url || '/', chatId: data.chatId },
    actions: [
      { action: 'open', title: 'فتح' },
      { action: 'dismiss', title: 'إغلاق' }
    ],
    requireInteraction: false,
    silent: false
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// عند الضغط على الإشعار
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  if (e.action === 'dismiss') return;
  var url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.includes(self.location.origin)) {
          list[i].focus();
          list[i].postMessage({ type: 'notification_click', chatId: e.notification.data.chatId });
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});

// Background Sync - إرسال رسائل عند عودة الاتصال
self.addEventListener('sync', function(e) {
  if (e.tag === 'background-sync') {
    e.waitUntil(doBackgroundSync());
  }
});

function doBackgroundSync() {
  return Promise.resolve();
}
