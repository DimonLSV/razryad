const CACHE='razryad-0945-0340';
const FILES=['./','./index.html','./chpu.html','./termist.html','./privacy.html',
 './manifest-chpu.webmanifest','./manifest-termist.webmanifest',
 './icon-chpu-192.png','./icon-chpu-512.png','./icon-termist-192.png','./icon-termist-512.png'];

self.addEventListener('message',e=>{ if(e.data==='skip') self.skipWaiting(); });

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(FILES.map(f=>c.add(f)))));
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x))))
    .then(()=>self.clients.claim()));
});

const withTimeout=(p,ms)=>new Promise((res,rej)=>{
  const t=setTimeout(()=>rej(new Error('slow')),ms);
  p.then(v=>{clearTimeout(t);res(v);},e=>{clearTimeout(t);rej(e);});
});

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  e.respondWith(
    withTimeout(fetch(e.request),2500).then(res=>{
      if(res&&res.status===200&&res.type==='basic'){
        const copy=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy));
      }
      return res;
    }).catch(()=>caches.match(e.request).then(hit=>hit||caches.match('./index.html')))
  );
});