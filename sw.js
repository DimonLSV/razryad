const CACHE='razryad-0999-0902a';
const FILES=['./','./index.html','./chpu.html','./generator.html','./termist.html','./privacy.html',
 './manifest-chpu.webmanifest','./manifest-termist.webmanifest',
 './icon-chpu-192.png','./icon-chpu-512.png','./icon-termist-192.png','./icon-termist-512.png',
 './generator-pro.js','./generator-v99.js','./cnc-sim-core.js','./cnc-emulator-bridge.js','./operator-tools.js','./chpu-v99.js','./lathe-sim-v99.js','./mill-sim-v99.js','./termist-v99.js','./v99.css','./vendor/qrcode/qrcode.js','./samples/turning-demo.nc',
 './assets/backgrounds/work.jpg','./assets/backgrounds/codes.jpg','./assets/backgrounds/calc.jpg','./assets/backgrounds/control.jpg','./assets/backgrounds/learn.jpg',
 './assets/backgrounds/therm-work-v99.jpg','./assets/backgrounds/therm-steels-v99.jpg','./assets/backgrounds/therm-process-v99.jpg','./assets/backgrounds/therm-learn-v99.jpg',
 './vendor/ocr/tesseract.min.js','./vendor/ocr/worker.min.js',
 './vendor/ocr/core/tesseract-core.wasm.js','./vendor/ocr/core/tesseract-core.wasm',
 './vendor/ocr/core/tesseract-core-simd.wasm.js','./vendor/ocr/core/tesseract-core-simd.wasm',
 './vendor/ocr/core/tesseract-core-lstm.wasm.js','./vendor/ocr/core/tesseract-core-lstm.wasm',
 './vendor/ocr/core/tesseract-core-simd-lstm.wasm.js','./vendor/ocr/core/tesseract-core-simd-lstm.wasm',
 './vendor/tessdata/rus.traineddata.gz','./vendor/tessdata/eng.traineddata.gz',
 './vendor/pdf/pdf.min.js','./vendor/pdf/pdf.worker.min.js'];

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
    }).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(hit=>hit||caches.match('./index.html')))
  );
});
