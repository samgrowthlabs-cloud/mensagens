const CACHE_NAME = 'bidjorchat-v2';
const ASSETS = [
  '/login/index.html',
  '/chat/index.html',
  '/admin/index.html',
  '/mensagem_geral/index.html',
  '/reset-password.html',
  '/styles/variables.css',
  '/styles/global.css',
  '/styles/responsive.css',
  '/login/style.css',
  '/chat/style.css',
  '/admin/style.css',
  '/mensagem_geral/style.css',
  '/js/config.js',
  '/js/utils.js',
  '/js/crypto.js',
  '/js/database.js',
  '/js/session.js',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

// Instalação
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Ativação
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Estratégia: network first, fallback para cache
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('supabase.co')) return;
  if (event.request.destination === 'document') {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Evento de clique na notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/chat/index.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});