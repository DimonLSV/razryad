const CACHE='razryad-0999-0902a';
const FILES=['./','./index.html','./chpu.html','./generator.html','./termist.html','./privacy.html',
 './manifest-chpu.webmanifest','./manifest-termist.webmanifest',
 './icon-chpu-192.png','./icon-chpu-512.png','./icon-termist-192.png','./icon-termist-512.png',
 './razryad-store.js','./tolerance-fields.js','./generator-pro.js','./generator-v99.js','./cnc-sim-core.js','./cnc-emulator-bridge.js','./operator-tools.js','./chpu-v99.js','./lathe-sim-v99.js','./mill-sim-v99.js','./termist-v99.js','./v99.css','./vendor/qrcode/qrcode.js','./samples/turning-demo.nc',
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

/* Оболочка — то, без чего приложение не работает вовсе. Она кэшируется через
   Promise.all: если хоть один файл не дошёл, установка обязана провалиться, старый
   кэш остаётся жить, и оператор продолжает работать на прошлой рабочей версии.
   Раньше вся установка шла через Promise.allSettled и считалась успешной даже когда
   не скачалось ничего: activate стирал старый кэш, приложение объявляло себя готовым
   к офлайну, а у станка обнаруживался мёртвый эмулятор. */
const SHELL=FILES.filter(f=>!f.startsWith('./vendor/')&&(/\.(html|js|css|webmanifest)$/.test(f)||f==='./'));
const EXTRA=FILES.filter(f=>!SHELL.includes(f));

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(async c=>{
    await Promise.all(SHELL.map(f=>c.add(f)));           /* падаем громко */
    await Promise.allSettled(EXTRA.map(f=>c.add(f)));    /* иконки, фоны, OCR — по возможности */
  }));
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x))))
    .then(()=>self.clients.claim()));
});

const withTimeout=(p,ms)=>new Promise((res,rej)=>{
  const t=setTimeout(()=>rej(new Error('slow')),ms);
  p.then(v=>{clearTimeout(t);res(v);},e=>{clearTimeout(t);rej(e);});
});

/* Версионированные ресурсы (?v=…) отдаём из кэша сразу и обновляем в фоне: в цехе
   типичная беда не отсутствие сети, а одна палка, и network-first заставлял платить
   таймаут за каждый файл. Документы остаются network-first, чтобы обновление
   приложения доходило без ручной чистки. */
const versioned=url=>/[?&]v=/.test(url);

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const isDoc=e.request.mode==='navigate';

  if(!isDoc&&versioned(e.request.url)){
    e.respondWith(caches.match(e.request,{ignoreSearch:false}).then(hit=>{
      const net=withTimeout(fetch(e.request),2500).then(res=>{
        if(res&&res.status===200&&res.type==='basic'){
          const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));
        }
        return res;
      });
      return hit||net;
    }).catch(()=>miss(e.request)));
    return;
  }

  e.respondWith(
    withTimeout(fetch(e.request),2500).then(res=>{
      if(res&&res.status===200&&res.type==='basic'){
        const copy=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy));
      }
      return res;
    }).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(hit=>hit||miss(e.request,isDoc)))
  );
});

/* Промах кэша. Раньше на любой незакэшированный запрос отдавался index.html: браузер
   получал HTML со статусом 200 вместо .js и разбирал его как скрипт — вместо честной
   ошибки выходила тихая порча, из-за которой генератор молча откатывался на старую
   версию. Документу отдаём оболочку, всему остальному — явный отказ. */
function miss(request,isDoc){
  if(isDoc)return caches.match('./index.html');
  return new Response('Ресурс недоступен офлайн и не найден в кэше приложения.',
    {status:504,statusText:'Offline and not cached',headers:{'Content-Type':'text/plain; charset=utf-8'}});
}
