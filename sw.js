const CACHE='razryad-0940-0335';
const FILES=['./','./index.html','./chpu.html','./termist.html',
 './manifest-chpu.webmanifest','./manifest-termist.webmanifest',
 './icon-chpu-192.png','./icon-chpu-512.png','./icon-termist-192.png','./icon-termist-512.png'];

self.addEventListener('message',e=>{ if(e.data==='skip') self.skipWaiting(); });

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).catch(()=>{}));
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x))))
      .then(()=>self.clients.claim())
  );
});

/* сначала сеть, кэш только при её отсутствии — чтобы обновления доходили сразу */
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  e.respondWith(
    fetch(e.request).then(res=>{
      if(res&&res.status===200&&res.type==='basic'){
        const copy=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy));
      }
      return res;
    }).catch(()=>caches.match(e.request).then(hit=>hit||caches.match('./index.html')))
  );
});