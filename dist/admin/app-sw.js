const CACHE='jll-atendimento-v8';
const SHELL=['/admin/','/admin/admin.css','/admin/ios-app.css','/admin/ios-app.js','/admin/admin-v2.js','/admin/operations.js','/admin/app.webmanifest','/assets/brand/jll-favicon.svg','/assets/brand/jll-horizontal-color.svg','/assets/brand/jll-horizontal-reverse.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));self.skipWaiting()});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('jll-atendimento-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate'&&url.pathname==='/admin/'){event.respondWith(fetch(request).catch(()=>caches.match('/admin/')));return}
  if(SHELL.includes(url.pathname))event.respondWith(fetch(request).catch(()=>caches.match(url.pathname)));
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  event.waitUntil(self.registration.showNotification('JLL Atendimento', {
    body: data.body || 'Há uma atualização na Central.',
    icon: '/assets/brand/jll-favicon-512.png',
    data: data.target || {},
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data || {};
  const url = new URL('/admin/?app=1', self.location.origin);
  const params = new URLSearchParams();
  for (const key of ['tipo', 'atendimentoId', 'mensagemId', 'contatoId', 'mensagemInternaId']) {
    if (typeof target[key] === 'string') params.set(key, target[key]);
  }
  url.hash = params.toString();
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    const client = clients.find(item => {
      const current = new URL(item.url);
      return current.pathname === '/admin/' && current.searchParams.get('app') === '1';
    });
    if (client) {
      await client.focus();
      client.postMessage({type: 'jll-web-notification', target});
    } else {
      await self.clients.openWindow(url.href);
    }
  })());
});
