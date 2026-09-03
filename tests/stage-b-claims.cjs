/* Этап B — заявления приложения должны сходиться с его кодом.
   Каждая проверка ниже отражает расхождение, найденное аудитом версии 0.999. */
const fs=require('fs');
let n=0;
const assert=(v,m)=>{n++;if(!v)throw new Error(m)};
const read=f=>fs.readFileSync(f,'utf8');

const APP_PAGES=['chpu.html','termist.html','generator.html','privacy.html'];
const ALL_PAGES=APP_PAGES.concat(['index.html']);

/* C6 — pdf.js 3.11.174 уязвима к CVE-2024-4367: специально собранный шрифт выполняет
   произвольный код при отрисовке. Штатная защита — отключить eval при разборе. */
{
 const g=read('generator-pro.js');
 assert(/getDocument\(\{[^}]*isEvalSupported:\s*false/.test(g),'C6: getDocument вызывается без isEvalSupported:false');
 assert(!/getDocument\(\{\s*data\s*\}\)/.test(g),'C6: остался незащищённый вызов getDocument({data})');
}

/* S2-3 — сторонний скрипт не должен исполняться на страницах, где лежат чертежи,
   G-код и история программ. Счётчик допустим только на титульной странице. */
{
 for(const f of APP_PAGES)assert(!read(f).includes('gc.zgo.at'),`S2-3: сторонний счётчик остался на ${f}`);
 assert(read('index.html').includes('gc.zgo.at'),'S2-3: счётчик на титульной удалён — тогда уберите и раскрытие в политике');
}

/* Политика безопасности содержимого закрывает загрузку чужих скриптов. */
{
 for(const f of ALL_PAGES){
  const s=read(f);
  assert(s.includes('http-equiv="Content-Security-Policy"'),`CSP: не задана на ${f}`);
  const m=/content="([^"]*)"/.exec(s.slice(s.indexOf('Content-Security-Policy')));
  const p=m[1];
  assert(/default-src 'self'/.test(p),`CSP: нет default-src 'self' на ${f}`);
  assert(/object-src 'none'/.test(p),`CSP: нет object-src 'none' на ${f}`);
  if(f!=='index.html')assert(!/gc\.zgo\.at/.test(p),`CSP: ${f} всё ещё разрешает счётчик`);
 }
 const chpu=/content="([^"]*)"/.exec(read('chpu.html').slice(read('chpu.html').indexOf('Content-Security-Policy')))[1];
 assert(/connect-src 'self'/.test(chpu),'CSP: рабочая страница разрешает произвольные исходящие запросы');
}

/* S1-3 — диктовка уходит в облако Google. Функция может остаться, но обязана
   спросить и назвать вещи своими именами. */
{
 const v=read('chpu-v99.js');
 assert(/SpeechRecognition/.test(v),'S1-3: тест устарел — диктовки в коде больше нет, снимите проверку');
 assert(/confirm\([^)]*Google/.test(v.replace(/\s+/g,' ')),'S1-3: диктовка включается без явного согласия и упоминания Google');
}

/* S1-3 — политика обязана называть камеру и микрофон, а не отрицать их. */
{
 const p=read('privacy.html');
 assert(!/не запрашивают доступ к камере, микрофону/.test(p),'S1-3: политика по-прежнему отрицает доступ к камере и микрофону');
 assert(/<h2>Камера<\/h2>/.test(p),'S1-3: в политике нет раздела о камере');
 assert(/<h2>Микрофон и диктовка<\/h2>/.test(p),'S1-3: в политике нет раздела о микрофоне');
 assert(/серверы Google/.test(p),'S1-3: политика не говорит, куда уходит звук диктовки');
}

/* H11 — политика существовала, но на неё не ссылалась ни одна страница. */
{
 const linked=ALL_PAGES.concat(['operator-tools.js','termist-v99.js','chpu-v99.js'])
  .filter(f=>read(f).includes('privacy.html'));
 assert(linked.includes('index.html'),'H11: титульная страница не ссылается на политику');
 assert(linked.includes('chpu.html'),'H11: приложение оператора не ссылается на политику');
 assert(linked.includes('termist-v99.js'),'H11: приложение термиста не ссылается на политику');
}

/* H12 — установленная PWA термиста открывается сразу на своей странице и раньше
   не показывала ни одной оговорки. */
{
 const t=read('termist-v99.js');
 assert(/рекомендательный характер/.test(t),'H12: у приложения термиста нет видимой оговорки');
 assert(/THERM_DISCLAIMER/.test(t)&&/\$\{THERM_DISCLAIMER\}/.test(t),'H12: оговорка объявлена, но не выводится на экран');
 assert(read('manifest-termist.webmanifest').includes('./termist.html'),'H12: тест устарел — стартовый экран термиста изменился');
}

/* S1-2 — план проекта требует держать DNC выключенным по умолчанию. */
{
 const g=read('generator.html');
 assert(/id="sendBtn"[^>]*hidden/.test(g),'S1-2: кнопка DNC видна по умолчанию');
 assert(/razryad-dnc-enabled/.test(g),'S1-2: нет флага, которым цех включает DNC');
 assert(/\^https:\\\/\\\//.test(g)||/\^https:\\\//.test(g),'S1-2: адрес шлюза принимается по незашифрованному http');
 assert(!/Введите полный http:\/\/ адрес/.test(g),'S1-2: подсказка по-прежнему предлагает http');
 assert(!/проверьте адрес и CORS/.test(g),'S1-2: сохранилось вводящее в заблуждение сообщение об ошибке');
}

/* index.html больше не обещает того, чего приложение не делает. */
{
 const i=read('index.html');
 assert(!/ничего никуда не отправляют/.test(i),'S1-2: на титульной осталось неверное «ничего никуда не отправляют»');
}

console.log(`этап B — соответствие заявлений коду: OK (${n} проверок)`);
