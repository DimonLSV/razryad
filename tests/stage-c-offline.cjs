/* Этап C, пункты 18-19 и 23 — офлайн-доставка и честный отказ.
   Раньше приложение сообщало о готовности к офлайну при пустом кэше, отвечало
   документом index.html на непрочитанный скрипт и молча откатывалось на старый
   генератор. Отказ выглядел как чёрный экран без объяснения. */
const fs=require('fs'),vm=require('vm');
let n=0;
const assert=(v,m)=>{n++;if(!v)throw new Error(m)};
const read=f=>fs.readFileSync(f,'utf8');

/* ── service worker: разбор поведения на подставных Cache и fetch ───────── */
const sw=read('sw.js');

/* 19a. Оболочка кэшируется через Promise.all, тяжёлые вендорные файлы — отдельно. */
{
 const files=[...sw.match(/const FILES=\[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);
 const SHELL=files.filter(f=>!f.startsWith('./vendor/')&&(/\.(html|js|css|webmanifest)$/.test(f)||f==='./'));
 assert(/Promise\.all\(SHELL/.test(sw),'оболочка кэшируется не через Promise.all — частичная установка снова будет считаться успешной');
 assert(/Promise\.allSettled\(EXTRA/.test(sw),'тяжёлые ресурсы должны ставиться по возможности, не блокируя установку');
 assert(!SHELL.some(f=>f.startsWith('./vendor/')),'вендорные библиотеки попали в обязательную оболочку');
 const size=SHELL.reduce((t,f)=>{try{return t+fs.statSync(f==='./'?'index.html':f.slice(2)).size}catch(e){return t}},0);
 assert(size<4*1024*1024,`обязательная оболочка разрослась до ${(size/1048576).toFixed(1)} МБ — это снова цена входа перед первой работой`);
 assert(SHELL.includes('./generator-pro.js')&&SHELL.includes('./lathe-sim-v99.js'),'скрипты приложения обязаны быть в оболочке');
}

/* 19b. Промах кэша отдаёт честную ошибку, а не HTML вместо скрипта. */
{
 const ctx=vm.createContext({self:{addEventListener(){},skipWaiting(){},clients:{claim(){}}},
  caches:{open:async()=>({add:async()=>{},put:async()=>{}}),match:async()=>undefined,keys:async()=>[],delete:async()=>{}},
  fetch:async()=>{throw new Error('offline')},Response,setTimeout,clearTimeout,console});
 vm.runInContext(sw,ctx,{filename:'sw.js'});
 const missAsDoc=vm.runInContext('miss({url:"./chpu.html"},true)',ctx);
 const missAsJs=vm.runInContext('miss({url:"./lathe-sim-v99.js?v=0999a"},false)',ctx);
 assert(missAsJs&&missAsJs.status===504,'промах по скрипту должен давать 504, а не документ');
 assert(!/text\/html/.test(String(missAsJs.headers.get('Content-Type'))),'промах по скрипту всё ещё отдаёт HTML');
 assert(missAsDoc!==undefined,'документ при промахе должен получать оболочку index.html');
}

/* 19c. Версионированные ресурсы отдаются из кэша, документы остаются network-first. */
{
 assert(/const versioned=/.test(sw),'нет разбора версионированных адресов');
 assert(/e\.request\.mode==='navigate'/.test(sw),'документ и ресурс обрабатываются одинаково');
 assert(/ignoreSearch:false/.test(sw),'версионированный адрес должен искаться точно, иначе вернётся файл другой версии');
}

/* ── 18. Тихий откат генератора ─────────────────────────────────────────── */
{
 const g=read('generator.html');
 assert(/function generatorReady\(/.test(g),'нет проверки полноты загрузки генератора');
 assert(/generateBtn'\)\.onclick=\(\)=>\{if\(!generatorReady\(\)\)return;/.test(g),'генерация запускается без проверки загруженных слоёв');
 assert(/RazryadGeneratorPro/.test(g)&&/RazryadGeneratorPro/.test(read('generator-pro.js')),'нет метки загрузки generator-pro.js');
 assert(/RazryadTolerance/.test(g)&&/RazryadGeneratorV99/.test(g),'проверяются не все обязательные слои генератора');
}
/* Поведение: без метки generator-pro экспорт обязан отказать. */
{
 class E{constructor(){this.value='';this.textContent='';this.innerHTML='';this.className='';this.disabled=false;this.checked=false;this.dataset={};this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){}};}addEventListener(){}querySelectorAll(){return[]}querySelector(){return null}appendChild(){}remove(){}click(){}focus(){}setAttribute(){}insertAdjacentHTML(){}getContext(){return new Proxy({},{get:()=>()=>{}})}}
 const els=new Map(),get=s=>{if(!els.has(s))els.set(s,new E());return els.get(s)};
 const store=new Map();
 const document={querySelector:get,querySelectorAll:()=>[],createElement:()=>new E(),head:new E(),body:new E(),addEventListener(){}};
 const ctx=vm.createContext({console,document,navigator:{},
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  location:{reload(){},href:''},URL:{createObjectURL:()=>'b',revokeObjectURL(){}},Blob,TextDecoder,
  setTimeout:fn=>{if(typeof fn==='function')fn();return 1},clearTimeout(){},requestAnimationFrame:()=>1,
  cancelAnimationFrame(){},performance:{now:()=>0},alert(){},confirm:()=>true});
 ctx.window=ctx;ctx.window.addEventListener=()=>{};ctx.window.scrollTo=()=>{};
 const html=read('generator.html');
 const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
 vm.runInContext(inline,ctx,{filename:'generator-inline.js'});
 /* generator-pro.js намеренно не загружаем — воспроизводим сбой сети */
 const ready=vm.runInContext('generatorReady()',ctx);
 assert(ready===false,'без generator-pro.js генератор считает себя готовым и выдаст другую программу');
 const shown=vm.runInContext("document.querySelector('#safetyText').textContent",ctx);
 assert(/загружен не полностью/.test(shown),'оператору не сказано, почему программа не построена: '+shown);
 assert(/generator-pro\.js/.test(shown),'в сообщении не назван недостающий файл');
}

/* ── 23. Отказ виден, а не выглядит чёрным экраном ───────────────────────── */
{
 for(const f of ['index.html','chpu.html','generator.html','termist.html']){
  const s=read(f);
  assert(/<noscript>/.test(s),`нет <noscript> на ${f}`);
  assert(/unhandledrejection/.test(s),`нет обработчика unhandledrejection на ${f}`);
  assert(/addEventListener\('error'/.test(s),`нет обработчика ошибок на ${f}`);
  assert(/data-boot-guard/.test(s),`страж загрузки на ${f} не помечен — он перехватит первый инлайн-скрипт у тестов`);
 }
}

console.log(`этап C — офлайн, генератор, видимость отказа: OK (${n} проверок)`);
