// LUMIQ Service Worker - Cache First Strategy
var CACHE_NAME = 'lumiq-v2';
var STATIC = ['/lumiq.html', '/'];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(c) {
      return c.addAll(STATIC);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;
  // API calls - لا نخزنها
  if (url.includes('/api/') || url.includes('/socket.io')) return;
  // الملفات الثابتة - Cache First
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) {
        // تحديث في الخلفية
        fetch(e.request).then(function(fresh) {
          caches.open(CACHE_NAME).then(function(c){ c.put(e.request, fresh); });
        }).catch(function(){});
        return cached;
      }
      return fetch(e.request).then(function(res) {
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function(c){ c.put(e.request, clone); });
        return res;
      });
    })
  );
});
