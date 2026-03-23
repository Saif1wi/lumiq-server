// LUMIQ Service Worker v1.0
var CACHE_NAME = 'lumiq-v1';
var STATIC_CACHE = 'lumiq-static-v1';

// الملفات الأساسية التي تُخزَّن مرة واحدة
var STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// ── Install: خزّن الملفات الأساسية ──
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(STATIC_CACHE).then(function(cache) {
      return cache.addAll(STATIC_ASSETS).catch(function(err) {
        console.log('SW cache error:', err);
      });
    }).then(function() {
      return self.skipWaiting(); // فعّل فوراً بدون انتظار
    })
  );
});

// ── Activate: احذف الـ caches القديمة ──
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== STATIC_CACHE && key !== CACHE_NAME;
        }).map(function(key) {
          return caches.delete(key);
        })
      );
    }).then(function() {
      return self.clients.claim(); // تحكم بكل التبويبات فوراً
    })
  );
});

// ── Fetch: استراتيجية الـ cache ──
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  // لا تتدخل في طلبات الـ API أو Socket
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/socket.io/') ||
    url.protocol === 'chrome-extension:' ||
    e.request.method !== 'GET'
  ) {
    return;
  }

  // الخطوط من Google — cache first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(e.request).then(function(cached) {
          if (cached) return cached;
          return fetch(e.request).then(function(response) {
            if (response && response.status === 200) {
              cache.put(e.request, response.clone());
            }
            return response;
          }).catch(function() { return cached; });
        });
      })
    );
    return;
  }

  // CDN (Socket.io, etc.) — cache first
  if (url.hostname === 'cdn.socket.io' || url.hostname.includes('cdnjs')) {
    e.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(e.request).then(function(cached) {
          if (cached) return cached;
          return fetch(e.request).then(function(response) {
            if (response && response.status === 200) {
              cache.put(e.request, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  // الصور من Cloudinary — cache مع timeout
  if (url.hostname.includes('cloudinary') || url.hostname.includes('res.cloudinary')) {
    e.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(e.request).then(function(cached) {
          if (cached) return cached;
          return fetch(e.request).then(function(response) {
            if (response && response.status === 200) {
              cache.put(e.request, response.clone());
            }
            return response;
          }).catch(function() {
            return new Response('', { status: 408 });
          });
        });
      })
    );
    return;
  }

  // index.html — Network first, fallback to cache
  if (url.pathname === '/' || url.pathname === '/index.html') {
    e.respondWith(
      fetch(e.request).then(function(response) {
        if (response && response.status === 200) {
          caches.open(STATIC_CACHE).then(function(cache) {
            cache.put(e.request, response.clone());
          });
        }
        return response;
      }).catch(function() {
        // offline — أرجع النسخة المخزنة
        return caches.match('/index.html').then(function(cached) {
          return cached || caches.match('/');
        });
      })
    );
    return;
  }
});

// ── Push Notifications ──
self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch(x) {}
  var title   = data.title   || 'LUMIQ';
  var body    = data.body    || 'رسالة جديدة';
  var chatId  = data.chat_id || '';
  e.waitUntil(
    self.registration.showNotification(title, {
      body:    body,
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      tag:     'lumiq-' + chatId,
      data:    { chat_id: chatId },
      vibrate: [200, 100, 200],
      requireInteraction: false
    })
  );
});

// ── Notification Click ──
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var chatId = e.notification.data && e.notification.data.chat_id;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.includes('lumiq') && 'focus' in list[i]) {
          return list[i].focus();
        }
      }
      return clients.openWindow('/');
    })
  );
});
