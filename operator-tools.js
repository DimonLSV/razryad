/* РАЗРЯД 0.993 — рабочий центр оператора, настраиваемая главная и навигация */
(function(){
const WORK=[
 {id:'analyze',n:'Проверка G-кода',d:'Вставить или открыть NC: опасные кадры и траектория',icon:'<>',bg:'codes'},
 {id:'contours',n:'Контуры',bg:'calc',split:[['calc:geo','Наружный','контур · проточка','↗'],['calc:id','Внутренний','контур · расточка','Ø']]},
 {id:'alarmx',n:'Тревога / код',d:'Фото экрана, OCR и понятный порядок проверки',icon:'!',bg:'codes'},
 {id:'insertx',n:'Пластина ISO',d:'Фото коробки или код CNMG: расшифровка',icon:'◇',bg:'learn'},
 {id:'setupx',n:'Текущая наладка',d:'Заготовка, ноль, инструменты и чек-лист',icon:'✓',bg:'work'},
 {id:'edux',n:'Учебник А–Я',d:'29 тем, четыре стойки, разряды и тест',icon:'A',bg:'learn'},
 {id:'fitcalc',route:'calc:fit',n:'Допуски и посадки',d:'Предельные размеры, зазор, натяг и поля',icon:'±',bg:'control'}
];
const WORK_LAYOUT_KEY='razryad-work-layout-v1';
const WORK_EXTRA=[
 {id:'simx',route:'work:simx',n:'Эмулятор CNC',d:'2D-проверка программы и каждого T',icon:'▶',bg:'codes'},
 {id:'millx',route:'work:millx',n:'Эмулятор ЧПУ · фрезерный',d:'Карта высот детали, разрез и циклы сверления',icon:'▦',bg:'codes'},
 {id:'modes',route:'calc:rez',n:'Режимы резания',d:'Материал, HRC, Vc, обороты и подача',icon:'S',bg:'calc'},
 {id:'threadcalc',route:'calc:thr',n:'Резьба',d:'Диаметры, шаг и цикл G76',icon:'M',bg:'calc'},
 {id:'profilex',route:'work:profilex',n:'Профиль станка',d:'Патрон, лимиты и карта инструментов',icon:'P',bg:'work'},
 {id:'examples',route:'more:prog',n:'Примеры программ',d:'Токарные и фрезерные NC-примеры',icon:'G',bg:'codes'},
 {id:'academy',route:'more:edu-home',n:'Учебник А–Я',d:'Маршрут от первого дня до разряда',icon:'A',bg:'learn'},
 {id:'outer',route:'calc:geo',n:'Контур наружный',d:'Конусы, фаски, галтели и точки',icon:'↗',bg:'calc'},
 {id:'inner',route:'calc:id',n:'Контур внутренний',d:'Расточка, фаски и переходы отверстия',icon:'Ø',bg:'calc'}
];
const workKey=x=>x.split?'split:'+x.id:(x.route||'work:'+x.id);
const DEFAULT_WORK_LAYOUT=['work:simx','work:millx',...WORK.map(workKey),'work:profilex'];
function workCatalog(){const a=[...WORK,...WORK_EXTRA],seen=new Set();return a.filter(x=>{const k=workKey(x);if(seen.has(k))return false;seen.add(k);return true;});}
const WORK_SIM_MIGRATED='razryad-work-sim-top-v1';
const WORK_MILL_MIGRATED='razryad-work-mill-added-v1';
function workLayout(){const catalog=new Set(workCatalog().map(workKey)),saved=loadJSON(WORK_LAYOUT_KEY,DEFAULT_WORK_LAYOUT);
 let valid=(Array.isArray(saved)?saved:DEFAULT_WORK_LAYOUT).filter(k=>catalog.has(k));
 if(!valid.length)valid=[...DEFAULT_WORK_LAYOUT];
 /* эмулятор поднят на первое место; у кого уже была своя раскладка — переносим один раз */
 if(!localStorage.getItem(WORK_SIM_MIGRATED)){
  valid=['work:simx',...valid.filter(k=>k!=='work:simx')];
  try{localStorage.setItem(WORK_SIM_MIGRATED,'1');saveJSON(WORK_LAYOUT_KEY,valid.slice(0,12));}catch(e){}
 }
 /* фрезерный эмулятор добавляем один раз рядом с токарным: у кого раскладка уже
    своя, карточка иначе никогда бы не появилась */
 if(!localStorage.getItem(WORK_MILL_MIGRATED)){
  if(!valid.includes('work:millx')){
   const at=valid.indexOf('work:simx');
   valid.splice(at<0?0:at+1,0,'work:millx');
  }
  try{localStorage.setItem(WORK_MILL_MIGRATED,'1');saveJSON(WORK_LAYOUT_KEY,valid.slice(0,12));}catch(e){}
 }
 return valid.slice(0,12);}
function workItem(key){return workCatalog().find(x=>workKey(x)===key)||null;}
function workCardHtml(x,index){if(!x)return'';const slot=`data-work-slot="${index}"`;return x.split?`<div class="work-split ${x.bg} work-layout-item" ${slot}>${x.split.map(s=>`<button type="button" data-route="${s[0]}"><i>${s[3]}</i><b>${s[1]}</b><span>${s[2]}</span></button>`).join('')}</div>`:`<div class="work-card ${x.bg} work-layout-item" ${slot} ${x.href?`data-href="${x.href}"`:x.route?`data-route="${x.route}"`:`data-work="${x.id}"`}><i style="font:600 22px IBM Plex Mono;color:var(--ember);font-style:normal">${x.icon}</i><b>${x.n}</b><span>${x.d}</span></div>`;}
function renderWorkGrid(){return workLayout().map((key,index)=>workCardHtml(workItem(key),index)).join('');}
function workEditorHtml(){return `<div class="work-editor" id="workEditor" aria-hidden="true"><div class="work-editor-sheet"><div class="work-editor-head"><div><span>Настройка главной</span><b id="workEditorTitle">Добавить инструмент</b></div><button type="button" id="workEditorClose" aria-label="Закрыть" onclick="window.RazryadTools.closeWorkEditor()">×</button></div><p>Зажмите любую карточку, чтобы заменить или удалить её. Раскладка хранится только на этом устройстве.</p><div class="work-current" id="workCurrentList"></div><div class="sec">Выберите замену</div><div class="work-catalog">${workCatalog().map(x=>`<button type="button" data-work-choice="${workKey(x)}" onclick="window.RazryadTools.chooseWorkItem('${workKey(x)}')"><i>${x.icon||'•'}</i><span><b>${x.n}</b><small>${x.d||(x.split?'Наружный + внутренний контур':'Рабочий инструмент')}</small></span></button>`).join('')}</div><div class="work-editor-actions"><button type="button" class="btn ghost" id="workEditorDelete" onclick="window.RazryadTools.deleteWorkItem()">Удалить выбранную</button><button type="button" class="btn ghost" id="workEditorReset" onclick="window.RazryadTools.resetWorkItems()">Вернуть заводскую</button></div></div></div>`;}
const originalRender=render, originalViewMore=viewMore;

TABS.splice(0,TABS.length,
 {id:'work',n:'Работа',i:'<path d="M14.7 6.3 17.7 3.3l3 3-3 3M9.3 17.7l-3 3-3-3 3-3"/><path d="m8 16 8-8M5 5l4 1 1 4-4-1zM19 19l-4-1-1-4 4 1z"/>'},
 {id:'codes',n:'Коды',i:'<path d="M9 6 4 12l5 6M15 6l5 6-5 6"/>'},
 {id:'gen',n:'G-код',href:'./generator.html',i:'<path d="m12 3 1.6 4.1L18 9l-4.4 1.9L12 15l-1.6-4.1L6 9l4.4-1.9L12 3Z"/><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/>'},
 {id:'calc',n:'Расчёты',i:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h2M13 11h2M9 15h2M13 15h2"/>'},
 {id:'learn',n:'Учёба',i:'<path d="M4 6h16v12H4z"/><path d="M8 10h8M8 14h5"/>'},
 {id:'more',n:'Ещё',i:'<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>'}
);
tab='work'; folder=null;

function setSection(section){const d=document.querySelector('.device');if(d)d.dataset.section=section||'work';}
function customScreen(title,sub,html,section,showMachine){
 $('#ttl').textContent=title;$('#sub').textContent=sub;
 $('#searchbox').style.display='none';$('#chips').style.display='none';
 $('#mseg').innerHTML=showMachine?machineSwitch():'';
 $('#mseg').style.display=showMachine?'grid':'none';drawNav();
 $('#screen').innerHTML=html;setSection(section);bind();bindWork();numFix();$('#screen').scrollTop=0;
}

render=function(){
 if(tab==='work'){
  if(!folder)return customScreen('Работа у станка','Главные действия — в один-два нажатия',viewWork(),'work',true);
  if(folder==='analyze')return customScreen('Проверка G-кода','Предварительный разбор перед GRAPHICS',viewAnalyzer(),'codes',false);
  if(folder==='control')return customScreen('Первая деталь','Допуск, измерение и поправка',viewControl(),'control',false);
  if(folder==='alarmx')return customScreen('Тревога / код','Фото экрана или ручной ввод',viewAlarm(),'codes',false);
  if(folder==='insertx')return customScreen('Пластина ISO','Быстрая расшифровка обозначения',viewInsert(),'learn',false);
  if(folder==='setupx')return customScreen('Текущая наладка','Одна карточка для текущей детали',viewSetup(),'work',false);
  if(folder==='edux'){tab='more';folder='edu-home';return render();}
 }
 if(tab==='more'){
  if(!folder)return customScreen('Ещё','Учебник, настройки и информация',viewMoreHub(),'more',true);
  if(folder==='edu-home')return customScreen('Учебник А–Я','Выберите тему или найдите её через поиск',viewEdu(),'learn',true);
  if(folder==='about')return customScreen('О приложении','Версия, источники и резервные копии',originalViewMore(),'more',false);
  if(FOLDERS_BASE.learn.some(x=>x[0]===folder)){
   tab='learn';originalRender();tab='more';drawNav();setSection('learn');return;
  }
 }
 originalRender();setSection(tab==='codes'?'codes':tab==='calc'?'calc':tab==='learn'?'learn':'more');
};

function viewWork(){
 return `<div class="wrap"><div class="workintro"><b>Всё нужное<br>рядом со станком</b><span>Программа, проверка, измерение, инструмент и справочник используют один профиль станка и работают офлайн.</span></div>
 <div class="card" data-href="./generator.html" style="border-color:#70401E;background:linear-gradient(120deg,#2B180C,#171515);display:flex;align-items:center;gap:12px;cursor:pointer"><div style="width:42px;height:42px;border-radius:12px;background:var(--orange);color:#160900;display:grid;place-items:center;font:700 20px IBM Plex Mono">G</div><div><div style="font:600 17px Oswald">ФОТО / PDF / DXF → G-КОД</div><div class="ct" style="font-size:11px;margin-top:2px">Распознать размеры, собрать операции и проверить траекторию</div></div></div>
 <div class="quickbar"><button class="quickpill" data-route="codes:g">G-коды</button><button class="quickpill" data-route="calc:rez">Обороты и подача</button><button class="quickpill" data-route="calc:thr">Резьба</button><button class="quickpill" data-route="more:alarm">Тревоги</button><button class="quickpill" data-href="./generator.html">Фото → G-код</button></div>
 <div class="sec work-sec"><span>Рабочие инструменты</span><button type="button" id="workCustomize" onclick="window.RazryadTools.showWorkEditor(-1)">Настроить</button></div><div class="work-grid">${renderWorkGrid()}</div>
 <div class="lathe-sim-banner" id="latheSimBanner" data-route="work:simx" role="button" aria-label="Открыть эмулятор CNC 2D токарной обработки"><canvas id="latheSimBannerCanvas" width="900" height="260" aria-hidden="true"></canvas><div class="lathe-sim-banner-copy"><span>Проверка токарной программы</span><b>ЭМУЛЯТОР CNC</b><small>Циклы, дуги, расточка, сверление, столкновения и покадровая проверка</small><em>Открыть эмулятор →</em></div></div>${workEditorHtml()}${CREDIT}</div>`;
}

function viewMoreHub(){
 return `<div class="wrap"><div class="toolhero" style="--tool-bg:url('./assets/backgrounds/learn.jpg')"><b>Учебник и справочник</b><span>Старые разделы сохранены полностью: 29 учебных тем, разряды, тест, примеры программ и различия стоек.</span></div>
 <div class="work-grid"><div class="work-card learn" data-route="more:edu-home"><i style="font:600 22px IBM Plex Mono;color:var(--ember);font-style:normal">A</i><b>Учебник А–Я</b><span>С первого дня до аттестации</span></div><div class="work-card work" data-route="more:about"><i style="font:600 22px IBM Plex Mono;color:var(--ember);font-style:normal">i</i><b>О приложении</b><span>Версия, источники и копии</span></div></div>
 <div class="sec">Быстрый доступ</div>${[['calc:geo','Расчёт контура','Конусы, фаски, галтели и координаты'],['more:exam','Проверить себя','Тест с разбором ошибок'],['more:prog','Примеры программ','Токарные и фрезерные'],['more:tdec','Обозначения инструмента','Пластины, державки и фрезы']].map(x=>`<div class="card" data-route="${x[0]}"><div class="glow"></div><div style="font-family:Oswald;font-size:17px">${x[1]}</div><div class="ct" style="font-size:12px;margin-top:3px">${x[2]}</div></div>`).join('')}${CREDIT}</div>`;
}

function backCard(){return `<div class="wrap" style="padding-bottom:0"><div class="card" data-work-back style="display:flex;align-items:center;gap:10px;padding:11px 13px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2.4"><path d="M15 5l-7 7 7 7"/></svg><span style="font-family:Oswald;letter-spacing:.08em;text-transform:uppercase;font-size:12px">К рабочим инструментам</span></div></div>`;}

function viewAnalyzer(){return backCard()+`<div class="wrap"><div class="toolhero" style="--tool-bg:url('./assets/backgrounds/codes.jpg')"><b>Проверь готовую программу</b><span>Это предварительный анализ. Окончательная проверка выполняется на стойке через GRAPHICS и SINGLE BLOCK.</span></div>
 <div class="card"><label class="fld"><span>Профиль станка</span><select id="qaMachine"><option value="6000">Haas ST-10 · 6000 об/мин</option><option value="4000" selected>Haas ST-20 · 4000 об/мин</option><option value="3400">Haas ST-30 · 3400 об/мин</option><option value="2500">Другой · 2500 об/мин</option></select></label><label class="fld"><span>G-код</span><textarea id="qaCode" style="min-height:180px;font-family:IBM Plex Mono" placeholder="Вставьте программу или выберите .NC"></textarea></label><div class="two"><button class="btn ghost" id="qaFileBtn">Открыть .NC</button><button class="btn" id="qaRun">Проверить</button></div><input type="file" id="qaFile" accept=".nc,.tap,.txt" hidden><div class="two" style="margin-top:9px"><button class="btn ghost" id="qaDemo">Пример программы</button><button class="btn" id="qaEmulator">Открыть в эмуляторе</button></div></div>
 <div id="qaOutput"></div>${CREDIT}</div>`;}

/* Комментарий в скобках не переходит на следующую строку. Класс [^)] в JS включает
   перевод строки, поэтому одна незакрытая «(» съедала программу до следующей «)»:
   проверки не видели ни одного кадра и выдавали зелёный вердикт на опасном коде.
   Незакрытую скобку считаем комментарием до конца строки и сообщаем о ней. */
function stripComments(s){
 let unbalanced=0;
 const out=String(s).split(/\r?\n/).map(line=>{
  let res='',i=0;
  while(i<line.length){
   const ch=line[i];
   if(ch===';')break;
   if(ch==='('){const close=line.indexOf(')',i+1);if(close<0){unbalanced++;break;}res+=' ';i=close+1;continue;}
   res+=ch;i++;
  }
  return res;
 }).join('\n');
 stripComments.unbalanced=unbalanced;
 return out;
}
function analyzeProgram(){
 const raw=$('#qaCode').value.trim(),out=$('#qaOutput');if(!raw){toast('Вставьте G-код');return;}
 const code=stripComments(raw.toUpperCase()),lines=code.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),checks=[];
 const add=(type,title,text)=>checks.push({type,title,text});
 const has=x=>new RegExp(`(^|\\s)${x}(?=\\s|$)`).test(code.replace(/\n/g,' '));
 if(stripComments.unbalanced)add('bad','Незакрытая скобка комментария',`Найдено незакрытых «(»: ${stripComments.unbalanced}. Кадры после такой скобки стойка может прочитать иначе — закройте комментарий, иначе проверки ниже опираются на неполный текст.`);
 /* G50 без адреса S — это установка системы координат (обычная форма Fanuc 0i-T),
    а не ограничение оборотов, и как ограничитель она не годится. */
 const i96=code.search(/\bG96\b/),rawG50=code.search(/\bG50\b/),rpmLimit=+$('#qaMachine').value;
 const clampM=/\bG50\b[^\n]*?\bS\s*(\d+(?:\.\d+)?)/.exec(code),i50=clampM?clampM.index:-1;
 if(i96>=0&&(i50<0||i50>i96))add('bad','G96 без ограничения оборотов G50 S__',rawG50>=0&&rawG50<i96?'Найден G50 без адреса S — это установка координат, а не ограничитель. Постоянная скорость резания разгонит шпиндель у малого диаметра.':'Постоянная скорость резания может разогнать шпиндель выше безопасного значения.');
 else if(i96>=0){const clamp=+clampM[1];if(rpmLimit&&clamp>rpmLimit)add('bad','Ограничение G50 выше профиля станка',`G50 S${clamp} при пределе ${rpmLimit} об/мин — ограничитель не защищает.`);else add('okx',`Ограничение перед G96 найдено: G50 S${clamp}`,'Проверьте, что значение допустимо для заготовки и патрона.');}
 /* Под G96 адрес S задаёт скорость резания в м/мин, а не обороты: сравнивать её
    с пределом шпинделя бессмысленно. Режим считаем построчно и берём только G97. */
 let css=false,maxRpm=0,rpmLine=0;
 lines.forEach((line,idx)=>{
  if(/\bG96\b/.test(line))css=true;
  if(/\bG97\b/.test(line))css=false;
  if(/\bG50\b/.test(line))return;
  const m=/\bS\s*(\d+(?:\.\d+)?)/.exec(line);
  if(m&&!css&&+m[1]>maxRpm){maxRpm=+m[1];rpmLine=idx+1;}
 });
 if(maxRpm&&rpmLimit&&maxRpm>rpmLimit)add('bad','Обороты выше профиля станка',`Кадр ${rpmLine}: S${maxRpm} в режиме G97, профиль ограничен ${rpmLimit} об/мин.`);
 /* Компенсация проверяется по ходу программы. «Последний G41 против последнего G40»
    пропускал незакрытую компенсацию на первом инструменте, если её закрывал второй,
    и матчился подстрокой внутри G41.1 и G410. */
 let comp='',compLine=0,compBad=false;
 lines.forEach((line,idx)=>{
  const no=idx+1,on=/\bG0?4([12])(?![\d.])/.exec(line);
  if(comp&&no>compLine&&(/\bT\s*\d{2,4}\b/.test(line)||/\bM0?6(?![\d.])/.test(line)||/\bM30\b/.test(line)||/\bG28\b/.test(line))&&!compBad){
   compBad=true;add('bad','Компенсация не отменена перед сменой инструмента или возвратом',`${comp} включена в кадре ${compLine} и остаётся активной в кадре ${no}. Отмените G40 до T-слова, M06, G28 и M30.`);
  }
  if(/\bG0?40(?![\d.])/.test(line))comp='';
  if(on){comp='G4'+on[1];compLine=no;}
 });
 if(comp&&!compBad)add('bad','Не найден G40 после компенсации',`${comp} из кадра ${compLine} остаётся активной к концу программы.`);
 const drill=/\bG8[1-9]\b/.test(code);if(drill&&code.lastIndexOf('G80')<Math.max(...[...code.matchAll(/\bG8[1-9]\b/g)].map(m=>m.index)))add('warnx','Цикл сверления не закрыт G80','Проверьте отмену постоянного цикла перед следующими перемещениями.');
 if(!/\bM0?3\b|\bM0?4\b/.test(code))add('warnx','Не найден запуск шпинделя','Проверьте M03/M04 и направление вращения.');
 if(!/\bM30\b/.test(code))add('warnx','Не найден M30','Программа может не завершаться и не сбрасывать модальные состояния ожидаемым образом.');
 if(!/\bG99\b/.test(code))add('warnx','Не подтверждена подача на оборот G99','Для токарной программы убедитесь, что F интерпретируется как мм/об.');
 if(!/\bG28\b|\bG53\b/.test(code))add('warnx','Не найден безопасный возврат','Проверьте начало, смену инструмента и завершение программы.');
 const tools=[...new Set([...code.matchAll(/\bT\s*(\d{4})\b/g)].map(m=>m[1]))];if(tools.length)add('okx',`Инструменты: ${tools.map(x=>'T'+x).join(', ')}`,'Сверьте позиции револьверной головки и корректоры.');
 if(!checks.some(x=>x.type==='bad'))add('okx','Критические шаблонные ошибки не найдены','Это не доказывает безопасность геометрии — проверьте траекторию, ноль детали и патрон.');
 const points=parseToolPath(lines);out.innerHTML=`<div class="card"><div class="tag">Результат проверки</div><div class="analysis-list">${checks.map(x=>`<div class="analysis-item ${x.type}"><b>${x.title}</b><span>${x.text}</span></div>`).join('')}</div>${points.length>1?'<canvas id="qaCanvas" class="pathcanvas" width="720" height="420"></canvas>':'<div class="hint">Координаты X/Z для траектории не найдены.</div>'}</div>`;
 if(points.length>1)drawPath(points);
 return checks; /* возвращаем разбор, чтобы проверки были воспроизводимы в тестах */
}
function parseToolPath(lines){let x=null,z=null,mode='G00',pts=[];for(const line of lines){const gm=line.match(/\bG0?([0-3])\b/);if(gm)mode='G0'+gm[1];const xm=line.match(/\bX\s*(-?\d+(?:\.\d+)?)/),zm=line.match(/\bZ\s*(-?\d+(?:\.\d+)?)/);if(xm)x=+xm[1];if(zm)z=+zm[1];if((xm||zm)&&x!==null&&z!==null)pts.push({x,z,rapid:mode==='G00'});}return pts.slice(0,500);}
function drawPath(pts){const c=$('#qaCanvas'),ctx=c.getContext('2d'),W=c.width,H=c.height,p=48,xs=pts.map(q=>q.x),zs=pts.map(q=>q.z),xmin=Math.min(...xs),xmax=Math.max(...xs),zmin=Math.min(...zs),zmax=Math.max(...zs),sx=(W-p*2)/Math.max(1,zmax-zmin),sy=(H-p*2)/Math.max(1,xmax-xmin),px=z=>p+(z-zmin)*sx,py=x=>H-p-(x-xmin)*sy;ctx.fillStyle='#0D1014';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#2B333D';for(let i=0;i<8;i++){ctx.beginPath();ctx.moveTo(p,i*(H/8));ctx.lineTo(W-p,i*(H/8));ctx.stroke();}for(let i=1;i<pts.length;i++){ctx.strokeStyle=pts[i].rapid?'#FF6B00':'#5FA8FF';ctx.lineWidth=pts[i].rapid?2:3;ctx.setLineDash(pts[i].rapid?[8,6]:[]);ctx.beginPath();ctx.moveTo(px(pts[i-1].z),py(pts[i-1].x));ctx.lineTo(px(pts[i].z),py(pts[i].x));ctx.stroke();}ctx.setLineDash([]);ctx.fillStyle='#C7CBD0';ctx.font='18px IBM Plex Mono';ctx.fillText('Z',W-30,H-18);ctx.fillText('X',16,28);}

function viewControl(){const h=loadJSON('razryad-inspection-v1',[]);return backCard()+`<div class="wrap"><div class="toolhero" style="--tool-bg:url('./assets/backgrounds/control.jpg')"><b>Контроль первой детали</b><span>Введите номинал, поле допуска и фактический размер. Приложение покажет годность и величину изменения корректора.</span></div>
 <div class="card"><div class="two"><label class="fld"><span>Размер</span><select id="ctType"><option value="od">Наружный Ø · X</option><option value="id">Внутренний Ø · X</option><option value="z">Длина / торец · Z</option></select></label><label class="fld"><span>Номинал</span><input type="number" id="ctNom" value="40" step="0.001"></label></div><div class="two"><label class="fld"><span>Нижнее отклонение</span><input type="number" id="ctLow" value="-0.02" step="0.001"></label><label class="fld"><span>Верхнее отклонение</span><input type="number" id="ctHigh" value="0.02" step="0.001"></label></div><label class="fld"><span>Измерено</span><input type="number" id="ctActual" value="40.08" step="0.001"></label><button class="btn" id="ctCalc">Рассчитать коррекцию</button><div id="ctResult"></div></div>
 <div class="card"><div class="row"><div class="tag">Последние измерения</div><button class="chip" id="ctClear">Очистить</button></div><div id="ctHistory">${inspectionHistory(h)}</div></div>${CREDIT}</div>`;}
function inspectionHistory(h){return h.length?h.slice(0,12).map(x=>`<div style="padding:8px 0;border-bottom:1px solid #24242B"><div class="row"><b style="font:500 13px IBM Plex Mono">${x.type} ${x.nom.toFixed(3)} → ${x.actual.toFixed(3)}</b><span class="badge ${x.good?'b-same':'b-diff'}">${x.good?'годен':'не годен'}</span></div><div class="hint" style="margin-top:3px">Поправка ${x.corr>=0?'+':''}${x.corr.toFixed(3)} мм · ${x.date}</div></div>`).join(''):'<div class="hint">Измерений пока нет.</div>';}
function calcInspection(){const type=$('#ctType').value,nom=+$('#ctNom').value,lo=+$('#ctLow').value,hi=+$('#ctHigh').value,actual=+$('#ctActual').value;if(![nom,lo,hi,actual].every(Number.isFinite)||lo>hi){toast('Проверьте числа и отклонения');return;}const good=actual>=nom+lo&&actual<=nom+hi,err=actual-nom,corr=-err,axis=type==='z'?'Z Wear':'X Wear',label=type==='od'?'Ø наружный':type==='id'?'Ø внутренний':'Z / длина';$('#ctResult').innerHTML=`<div class="inspect-result ${good?'good':'bad'}"><div class="tag">${good?'Размер в допуске':'Размер вне допуска'}</div><div class="big">${corr>=0?'+':''}${corr.toFixed(3)} мм</div><div class="ct">Ориентировочно изменить ${axis} на указанную величину. Ошибка размера ${err>=0?'+':''}${err.toFixed(3)} мм.</div><div class="hint">Для X используется диаметральная величина. Перед вводом обязательно проверьте знак, ориентацию инструмента и способ измерения корректора на своей стойке.</div></div>`;const h=loadJSON('razryad-inspection-v1',[]);h.unshift({type:label,nom,actual,good,corr,date:new Date().toLocaleString('ru-RU')});saveJSON('razryad-inspection-v1',h.slice(0,30));$('#ctHistory').innerHTML=inspectionHistory(h);}

const ALARM_HINTS=[
 ['OVERTRAVEL|ПЕРЕХОД|ПРЕДЕЛ','Выход за предел перемещения','Перейдите в HANDLE/JOG, удерживайте разрешение восстановления только по руководству стойки и уводите ось от предела. Не меняйте параметры хода.'],
 ['CHUCK|ПАТРОН|CLAMP','Патрон или подтверждение зажима','Проверьте давление, положение кулачков, педаль и датчик подтверждения. Не запускайте шпиндель без уверенного зажима.'],
 ['TURRET|РЕВОЛЬВ','Револьверная головка','Проверьте, завершилась ли индексация, нет ли стружки и механического упора. Не помогайте повороту рукой.'],
 ['LUBE|СМАЗК','Система смазки','Проверьте уровень и видимые утечки. Повторяющаяся тревога требует ремонтника — не отключайте контроль.'],
 ['SPINDLE|ШПИНДЕЛ','Шпиндель / привод','Остановите цикл, проверьте зажим, перегрузку, инструмент и стружку. После удара или необычного звука вызывайте наладчика.'],
 ['SERVO|СЕРВО|OVERLOAD|ПЕРЕГРУЗ','Серво или перегрузка оси','Не повторяйте движение вслепую. Проверьте столкновение, стружку, зажим и последний кадр программы.'],
 ['DOOR|ДВЕР','Дверь / блокировка','Закройте дверь и проверьте, что замок не забит стружкой. Не обходите блокировку.'],
 ['COOLANT|СОЖ','СОЖ','Проверьте уровень, фильтр, подачу и положение сопла. Не продолжайте резание материала, требующего охлаждения, без устойчивого потока.']
];
function viewAlarm(){return backCard()+`<div class="wrap"><div class="toolhero" style="--tool-bg:url('./assets/backgrounds/codes.jpg')"><b>Тревога или неизвестный код</b><span>Сфотографируйте экран либо введите номер и текст. OCR работает на устройстве и ничего не отправляет.</span></div><div class="card"><label class="fld"><span>Номер, текст тревоги или G/M-код</span><input type="text" id="alarmQuery" placeholder="Например: G76, chuck, overtravel"></label><div class="two"><button class="btn ghost" id="alarmPhotoBtn">Фото экрана</button><button class="btn" id="alarmFind">Разобрать</button></div><input type="file" id="alarmPhoto" accept="image/*" capture="environment" hidden><div id="alarmOcr" class="hint"></div></div><div id="alarmResult"></div>${CREDIT}</div>`;}
function findAlarm(){const q=$('#alarmQuery').value.trim().toUpperCase();if(!q){toast('Введите код или текст');return;}const gm=q.match(/\b([GM])\s*(\d+(?:\.\d+)?)\b/);if(gm){const list=gm[1]==='G'?G:M,item=list.find(x=>x.c.replace(/\s/g,'')===(gm[1]+gm[2]).replace(/\s/g,''));if(item){$('#alarmResult').innerHTML=`<div class="card"><div class="tag">Найдено в полном справочнике</div><div class="code" style="margin-top:8px">${item.c}</div><div class="ct">${item.t}</div><button class="btn" id="alarmOpenCode" style="margin-top:11px">Открыть карточку</button></div>`;$('#alarmOpenCode').onclick=()=>openSearchItem({kind:'sheet',id:(gm[1]==='G'?'g:':'m:')+item.c});return;}}
 const hint=ALARM_HINTS.find(x=>new RegExp(x[0],'i').test(q));$('#alarmResult').innerHTML=hint?`<div class="card"><div class="tag">Безопасная первичная проверка</div><div style="font:500 18px Oswald;margin-top:7px">${hint[1]}</div><div class="ct">${hint[2]}</div><div class="note warn" style="margin-top:10px"><b>Номер тревоги зависит от модели и версии стойки.</b> Сверьте точную расшифровку в ALARMS/HELP и руководстве станка. Не меняйте параметры и не обходите блокировки по подсказке телефона.</div></div>`:`<div class="card"><div class="tag">Точного совпадения нет</div><div class="ct">Сохраните полный номер и текст тревоги, посмотрите последний выполненный кадр, активный инструмент и режим. Затем найдите номер в ALARMS/HELP конкретной стойки.</div></div>`;}

function viewInsert(){return backCard()+`<div class="wrap"><div class="toolhero" style="--tool-bg:url('./assets/backgrounds/learn.jpg')"><b>Расшифровка пластины</b><span>Введите обозначение или сфотографируйте коробку. Для полной геометрии всё равно сверяйтесь с каталогом производителя.</span></div><div class="card"><label class="fld"><span>ISO-код</span><input type="text" id="isoCode" value="CNMG 120408-PM" placeholder="CNMG 120408-PM"></label><div class="two"><button class="btn ghost" id="isoPhotoBtn">Фото коробки</button><button class="btn" id="isoParse">Расшифровать</button></div><input type="file" id="isoPhoto" accept="image/*" capture="environment" hidden><div id="isoOcr" class="hint"></div></div><div id="isoResult"></div><button class="btn ghost" data-route="more:tdec">Открыть полный учебный раздел</button>${CREDIT}</div>`;}
function parseInsert(){const raw=$('#isoCode').value.toUpperCase().replace(/[^A-Z0-9-]/g,''),m=raw.match(/^([A-Z])([A-Z])([A-Z])([A-Z])(\d{2})(\d{2})(\d{2})(?:-(.+))?/);if(!m){$('#isoResult').innerHTML='<div class="card"><div class="note warn"><b>Формат не распознан.</b> Нужны четыре буквы и шесть цифр, например CNMG120408-PM.</div></div>';return;}const shapes={C:'Ромб 80°',D:'Ромб 55°',V:'Ромб 35°',W:'Тригон 80°',T:'Треугольник 60°',S:'Квадрат 90°',R:'Круглая'},relief={N:'0° · отрицательная',C:'7° · положительная',P:'11° · положительная',D:'15°',E:'20°'},tol={M:'Средний класс M',G:'Точный класс G',U:'Универсальный U'},hole={G:'Отверстие и стружколом с двух сторон',M:'Отверстие и стружколом',T:'Односторонняя с отверстием',N:'Без отверстия'};/* У круглой пластины последние две цифры — не радиус: радиус при вершине равен
   половине вписанной окружности, а поле радиуса в коде стоит нулевым. Раньше
   карточка печатала «Круглая · радиус 0.0 мм» без всякой оговорки, и это число
   шло прямо в OFFSET, куда его и велит внести чек-лист перед Cycle Start. */
const round=m[1]==='R';
const nose=round?'по вписанной окружности (примерно половина IC) — взять из каталога':(+m[7]/10).toFixed(1)+' мм';
const grade=m[8]||'не указан';$('#isoResult').innerHTML=`<div class="card"><div class="tag">${raw}</div><div class="dl"><b>Форма</b><span>${shapes[m[1]]||'Код '+m[1]}</span><b>Задний угол</b><span>${relief[m[2]]||'Код '+m[2]}</span><b>Точность</b><span>${tol[m[3]]||'Класс '+m[3]}</span><b>Исполнение</b><span>${hole[m[4]]||'Код '+m[4]}</span><b>Размер</b><span>Код ${m[5]} — сверить вписанную окружность в каталоге</span><b>Толщина</b><span>Код ${m[6]} — сверить фактическое значение</span><b>Радиус вершины</b><span>${nose}</span><b>Стружколом/исполнение</b><span>${grade}</span></div><div class="note warn" style="margin-top:10px"><b>Важно:</b> ISO-код описывает геометрию, но не гарантирует режимы. Марку сплава, покрытие и диапазон Vc берите с коробки производителя.</div></div>`;}

const SETUP_CHECKS=[['zero','Ноль детали Z','Торец, G54 и направление Z сверены'],['tool','Инструменты','Номера T и корректоры соответствуют револьверной головке'],['nose','Вершина резца','Радиус и направление вершины внесены в OFFSET'],['chuck','Зажим','Кулачки, длина зажима и вылет проверены'],['spin','Шпиндель','M03/M04 и G50 проверены'],['cool','СОЖ','Подача и положение сопла готовы'],['graph','GRAPHICS','Траектория просмотрена на стойке'],['single','Первый запуск','SINGLE BLOCK и Rapid 5% включены']];
function viewSetup(){const s=loadJSON('razryad-current-setup-v1',{checks:{}});return backCard()+`<div class="wrap"><div class="toolhero" style="--tool-bg:url('./assets/backgrounds/work.jpg')"><b>Карточка текущей наладки</b><span>Только данные текущей детали — без складского учёта и лишней производственной отчётности.</span></div><div class="card"><div class="two"><label class="fld"><span>Программа</span><input type="text" data-setup="program" value="${esc(s.program||'O0100')}"></label><label class="fld"><span>Станок</span><input type="text" data-setup="machine" value="${esc(s.machine||'Haas ST-20')}"></label></div><label class="fld"><span>Материал / HRC</span><input type="text" data-setup="material" value="${esc(s.material||'Сталь 45 · 22 HRC')}"></label><div class="two"><label class="fld"><span>Заготовка</span><input type="text" data-setup="stock" value="${esc(s.stock||'Ø50 × 120')}"></label><label class="fld"><span>Вылет</span><input type="text" data-setup="stickout" value="${esc(s.stickout||'100 мм')}"></label></div><label class="fld"><span>Инструменты</span><textarea data-setup="tools" placeholder="T0101 CNMG R0.8&#10;T0202 расточной R0.4">${esc(s.tools||'')}</textarea></label><label class="fld"><span>Заметка</span><textarea data-setup="note" placeholder="Контрольный размер, особенность зажима">${esc(s.note||'')}</textarea></label><div class="hint" id="setupSaved">Сохраняется автоматически на этом устройстве.</div></div><div class="card"><div class="tag">Перед Cycle Start</div><div class="checklist" style="margin-top:10px">${SETUP_CHECKS.map(x=>`<label class="checkrow"><input type="checkbox" data-check="${x[0]}" ${s.checks&&s.checks[x[0]]?'checked':''}><span><b>${x[1]}</b><span>${x[2]}</span></span></label>`).join('')}</div></div><div class="two"><button class="btn ghost" id="setupReset">Новая наладка</button><button class="btn" data-href="./generator.html">Открыть G-код</button></div>${CREDIT}</div>`;}
function saveSetup(){const old=loadJSON('razryad-current-setup-v1',{checks:{}}),s={checks:{...(old.checks||{})}};document.querySelectorAll('[data-setup]').forEach(x=>s[x.dataset.setup]=x.value);document.querySelectorAll('[data-check]').forEach(x=>s.checks[x.dataset.check]=x.checked);saveJSON('razryad-current-setup-v1',s);const n=$('#setupSaved');if(n)n.textContent='Сохранено · '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});}

function loadJSON(k,f){try{return JSON.parse(localStorage.getItem(k)||'null')||f}catch(e){return f}}
/* Пустой catch прятал переполнение памяти: оператор правил наладку, ошибки не
   видел, а при следующем открытии получал старые данные. Отказ теперь виден. */
function saveJSON(k,v){if(window.RazryadStore){if(RazryadStore.save(k,1,v))return true;if(typeof toast==='function')toast(RazryadStore.failureText());return false}try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}
function loadLocalScript(src,global){if(window[global])return Promise.resolve();return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);});}
async function ocrToInput(file,inputId,statusId){const status=$('#'+statusId);status.textContent='Подготовка локального OCR…';try{await loadLocalScript('./vendor/ocr/tesseract.min.js','Tesseract');const worker=await Tesseract.createWorker('rus+eng',1,{workerPath:'./vendor/ocr/worker.min.js',corePath:'./vendor/ocr/core',langPath:'./vendor/tessdata',logger:m=>{if(m.status==='recognizing text')status.textContent='OCR '+Math.round((m.progress||0)*100)+'%';}});const r=await worker.recognize(file);await worker.terminate();$('#'+inputId).value=String(r.data.text||'').replace(/\s+/g,' ').trim();status.textContent='Распознано локально · уверенность '+Math.round(r.data.confidence||0)+'%';}catch(e){status.textContent='OCR не запустился — введите текст вручную.';}}

let workEditIndex=-1,workBlockClickUntil=0;
function fillWorkCurrent(){const box=$('#workCurrentList');if(!box)return;const keys=workLayout();box.innerHTML=`<button type="button" class="add ${workEditIndex<0?'on':''}" data-work-edit-index="-1" onclick="window.RazryadTools.showWorkEditor(-1)"><i>+</i><span><b>Добавить карточку</b><small>${keys.length}/12 занято</small></span></button>${keys.map((key,index)=>{const x=workItem(key);return`<button type="button" class="${index===workEditIndex?'on':''}" data-work-edit-index="${index}" onclick="window.RazryadTools.showWorkEditor(${index})"><i>${x&&x.icon||'•'}</i><span><b>${x&&x.n||key}</b><small>Позиция ${index+1}</small></span></button>`;}).join('')}`;}
function showWorkEditor(index=-1){const modal=$('#workEditor');if(!modal)return;workEditIndex=Number.isFinite(index)?index:-1;const x=workEditIndex>=0?workItem(workLayout()[workEditIndex]):null;$('#workEditorTitle').textContent=x?`Заменить: ${x.n}`:'Добавить инструмент';$('#workEditorDelete').disabled=workEditIndex<0;fillWorkCurrent();modal.classList.add('open');modal.setAttribute('aria-hidden','false');}
function closeWorkEditor(){const modal=$('#workEditor');if(modal){modal.classList.remove('open');modal.setAttribute('aria-hidden','true');}}
function chooseWorkItem(key){const keys=workLayout();if(workEditIndex<0){if(keys.length>=12)return toast('На главной не больше 12 карточек');if(keys.includes(key))return toast('Этот инструмент уже на главной');keys.push(key);}else{if(keys.includes(key)&&keys[workEditIndex]!==key)return toast('Этот инструмент уже на главной');keys[workEditIndex]=key;}const added=workEditIndex<0;saveJSON(WORK_LAYOUT_KEY,keys);render();toast(added?'Инструмент добавлен':'Карточка заменена');}
function deleteWorkItem(){const keys=workLayout();if(workEditIndex<0||!keys[workEditIndex])return;if(keys.length<=1)return toast('Оставьте хотя бы одну карточку');keys.splice(workEditIndex,1);saveJSON(WORK_LAYOUT_KEY,keys);render();toast('Карточка удалена с главной');}
function resetWorkItems(){localStorage.removeItem(WORK_LAYOUT_KEY);render();toast('Заводская раскладка восстановлена');}
function handleWorkEditorClick(e){const hit=s=>e.target.closest&&e.target.closest(s);if(hit('#workCustomize')){e.preventDefault();showWorkEditor(-1);return;}const current=hit('[data-work-edit-index]');if(current){e.preventDefault();showWorkEditor(+current.dataset.workEditIndex);return;}const choice=hit('[data-work-choice]');if(choice){e.preventDefault();chooseWorkItem(choice.dataset.workChoice);return;}if(hit('#workEditorClose')){e.preventDefault();closeWorkEditor();return;}if(hit('#workEditorDelete')){e.preventDefault();deleteWorkItem();return;}if(hit('#workEditorReset')){e.preventDefault();resetWorkItems();return;}const modal=hit('#workEditor');if(modal&&e.target===modal)closeWorkEditor();}
function bindWorkCustomizer(){
 const settings=$('#workCustomize'),modal=$('#workEditor');if(settings){settings.dataset.customizerBound='1';settings.onclick=()=>showWorkEditor(-1);}if(!modal)return;
 document.querySelectorAll('.work-layout-item[data-work-slot]').forEach(item=>{let timer=0,sx=0,sy=0;const cancel=()=>{if(timer){clearTimeout(timer);timer=0;}};item.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;sx=e.clientX;sy=e.clientY;cancel();timer=setTimeout(()=>{timer=0;workBlockClickUntil=Date.now()+700;showWorkEditor(+item.dataset.workSlot);if(navigator.vibrate)navigator.vibrate(25);},620);});item.addEventListener('pointermove',e=>{if(Math.hypot(e.clientX-sx,e.clientY-sy)>10)cancel();});['pointerup','pointercancel','pointerleave'].forEach(type=>item.addEventListener(type,cancel));item.addEventListener('click',e=>{if(Date.now()<workBlockClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);item.addEventListener('contextmenu',e=>{e.preventDefault();workBlockClickUntil=Date.now()+500;showWorkEditor(+item.dataset.workSlot);});});
}

function bindWork(){
 document.querySelectorAll('[data-work]').forEach(x=>x.onclick=()=>{folder=x.dataset.work;deeper();render();});
 document.querySelectorAll('[data-work-back]').forEach(x=>x.onclick=()=>{if(history.state&&history.state.razryadDepth)history.back();else{folder=null;render();}});
 document.querySelectorAll('[data-route]').forEach(x=>x.onclick=()=>openRoute(x.dataset.route));
 document.querySelectorAll('[data-href]').forEach(x=>x.onclick=()=>location.href=x.dataset.href);
 document.querySelectorAll('[data-mach]').forEach(x=>x.onclick=()=>{mach=x.dataset.mach;render();});
 if($('#qaRun')){$('#qaRun').onclick=analyzeProgram;$('#qaDemo').onclick=()=>{$('#qaCode').value='%\nO0100\nG21 G18 G40 G80 G99\nT0101\nG50 S2500\nG96 S120 M03\nG00 X52 Z2\nG71 P100 Q130 U0.3 W0.1 D2 F0.25\nN100 G00 G42 X30\nN110 G01 Z0\nN120 G01 Z-40\nN130 G01 X45\nG70 P100 Q130\nG40 G00 X80 Z20\nG28 U0 W0\nM30\n%';analyzeProgram();};$('#qaFileBtn').onclick=()=>$('#qaFile').click();$('#qaFile').onchange=async e=>{const f=e.target.files[0];if(f){$('#qaCode').value=await f.text();analyzeProgram();}};$('#qaEmulator').onclick=()=>{const code=$('#qaCode').value.trim();if(!code)return toast('Вставьте или откройте G-код');window.RazryadEmulator.open(code,{title:'Проверка готовой программы',source:'Работа → Проверка G-кода'});};}
 if($('#ctCalc')){$('#ctCalc').onclick=calcInspection;$('#ctClear').onclick=()=>{if(confirm('Очистить историю измерений?')){localStorage.removeItem('razryad-inspection-v1');$('#ctHistory').innerHTML=inspectionHistory([]);}};}
 if($('#alarmFind')){$('#alarmFind').onclick=findAlarm;$('#alarmPhotoBtn').onclick=()=>$('#alarmPhoto').click();$('#alarmPhoto').onchange=async e=>{const f=e.target.files[0];if(f){await ocrToInput(f,'alarmQuery','alarmOcr');findAlarm();}};}
 if($('#isoParse')){$('#isoParse').onclick=parseInsert;$('#isoPhotoBtn').onclick=()=>$('#isoPhoto').click();$('#isoPhoto').onchange=async e=>{const f=e.target.files[0];if(f){await ocrToInput(f,'isoCode','isoOcr');parseInsert();}};parseInsert();}
 document.querySelectorAll('[data-setup],[data-check]').forEach(x=>{x.oninput=saveSetup;x.onchange=saveSetup;});
 if($('#setupReset'))$('#setupReset').onclick=()=>{if(confirm('Начать новую карточку наладки?')){localStorage.removeItem('razryad-current-setup-v1');render();}};
 bindWorkCustomizer();
}

function openRoute(route){const [t,f]=route.split(':');tab=t;folder=f||null;geoCase=null;rank=null;filter='Все';if($('#q'))$('#q').value='';deeper();render();}

function searchIndex(){const a=[];workCatalog().forEach(x=>{if(x.split){x.split.forEach(s=>{const r=s[0].split(':');a.push({kind:'route',tab:r[0],folder:r[1],n:s[1]+' '+s[2],d:'Быстрый расчёт контура',icon:s[3]});});return;}const r=(x.route||`work:${x.id}`).split(':');a.push({kind:'route',tab:r[0],folder:r[1]||null,n:x.n,d:x.d,icon:x.icon});});
 a.unshift({kind:'href',href:'./generator.html',n:'Фото / PDF / DXF → G-код',d:'Офлайн OCR, операции, симуляция и экспорт',icon:'G'});
 [['codes','g','G-коды','Полный ряд G00–G200'],['codes','m','M-коды','Вспомогательные функции'],['codes','c','Постоянные циклы','Готовые примеры циклов'],['codes','d','Стойки Haas и Fanuc','Различия и перенос программ']].forEach(x=>a.push({kind:'route',tab:x[0],folder:x[1],n:x[2],d:x[3],icon:'§'}));
 (FOLDERS.calc||[]).forEach(x=>a.push({kind:'route',tab:'calc',folder:x[0],n:x[1],d:x[2],icon:'='}));
 FOLDERS_BASE.learn.forEach(x=>a.push({kind:'route',tab:'learn',folder:x[0],n:x[1],d:x[2],icon:'A'}));
 G.forEach(x=>a.push({kind:'sheet',id:'g:'+x.c,n:x.c+' · '+x.t,d:x.h||x.f||'G-код',icon:'G'}));M.forEach(x=>a.push({kind:'sheet',id:'m:'+x.c,n:x.c+' · '+x.t,d:x.h||x.f||'M-код',icon:'M'}));
  a.push({kind:'route',tab:'learn',folder:null,n:'Учебник от А до Я',d:'Все 29 учебных тем и маршрут по разрядам',icon:'A'},{kind:'route',tab:'work',folder:'profilex',n:'Профиль станка',d:'Лимиты, патрон, револьвер и безопасные точки',icon:'P'},{kind:'route',tab:'more',folder:'about',n:'О приложении',d:'Версия, источники и резервные копии',icon:'i'});return a;}
let NAV_INDEX=[];
function renderGlobalSearch(){const q=$('#navQuery').value.trim().toLowerCase(),words=q.split(/\s+/).filter(Boolean);const list=(NAV_INDEX.length?NAV_INDEX:(NAV_INDEX=searchIndex())).filter(x=>!words.length||words.every(w=>(x.n+' '+x.d).toLowerCase().includes(w))).slice(0,60);$('#navResults').innerHTML=list.length?list.map((x,i)=>`<div class="navresult" data-nav-index="${i}"><i>${esc(x.icon||'•')}</i><div><b>${esc(x.n)}</b><span>${esc(x.d||'')}</span></div></div>`).join(''):'<div class="empty">Ничего не найдено.<br>Попробуйте название короче или введите номер кода.</div>';document.querySelectorAll('[data-nav-index]').forEach(el=>el.onclick=()=>openSearchItem(list[+el.dataset.navIndex]));}
function openSearchItem(x){closeGlobalSearch();if(x.kind==='href'){location.href=x.href;return;}if(x.kind==='sheet'){tab='codes';folder=x.id.startsWith('g:')?'g':'m';render();setTimeout(()=>openSheet(x.id),0);return;}tab=x.tab;folder=x.folder||null;geoCase=null;rank=null;filter='Все';deeper();render();}
function openGlobalSearch(){const m=$('#navSearch');m.classList.add('open');$('#navQuery').value='';renderGlobalSearch();setTimeout(()=>$('#navQuery').focus(),30);}
function closeGlobalSearch(){$('#navSearch').classList.remove('open');}
$('#navSearchBtn').onclick=openGlobalSearch;$('#navSearchClose').onclick=closeGlobalSearch;$('#navQuery').oninput=renderGlobalSearch;$('#navSearch').addEventListener('keydown',e=>{if(e.key==='Escape')closeGlobalSearch();});

window.RazryadShellReady=true;
window.RazryadTools={searchIndex,analyzeProgram,parseInsert,calcInspection,workLayout,workCatalog,showWorkEditor,closeWorkEditor,chooseWorkItem,deleteWorkItem,resetWorkItems};
setSection('work');render();
})();
