const CACHE='jll-atendimento-v7';
const SHELL=['/admin/','/admin/admin.css','/admin/admin-v2.js','/admin/app.webmanifest','/assets/brand/jll-favicon.svg','/assets/brand/jll-horizontal-color.svg','/assets/brand/jll-horizontal-reverse.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim()});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate'){event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('/admin/',copy));return response}).catch(()=>caches.match('/admin/')));return}
  event.respondWith(fetch(request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(request,response.clone()));return response}).catch(()=>caches.match(request)));
});
