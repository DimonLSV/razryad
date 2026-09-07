const fs = require('fs');
const vm = require('vm');

class FakeElement {
  constructor(selector = '') {
    this.selector = selector;
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.checked = false;
    this.disabled = false;
    this.dataset = {};
    this.style = { setProperty() {} };
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  addEventListener() {}
  querySelectorAll() { return []; }
  appendChild() {}
  insertAdjacentHTML() {}
  remove() {}
  click() {}
  getContext() { return new Proxy({}, { get: () => () => {} }); }
}

const elements = new Map();
const get = selector => {
  if (!elements.has(selector)) elements.set(selector, new FakeElement(selector));
  return elements.get(selector);
};
const document = {
  querySelector: get,
  querySelectorAll: () => [],
  createElement: tag => new FakeElement(tag),
  head: new FakeElement('head'),
  body: new FakeElement('body')
};
const storage = new Map();
const context = vm.createContext({
  console,
  document,
  navigator: {},
  localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
  location: { reload() {} },
  URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
  Blob,
  TextDecoder,
  setTimeout: fn => { if (typeof fn === 'function') fn(); return 1; },
  clearTimeout() {},
  requestAnimationFrame: () => 1,
  cancelAnimationFrame() {},
  performance: { now: () => 0 },
  confirm: () => true
});
context.window = context;
context.window.addEventListener = () => {};
context.window.scrollTo = () => {};

const html = fs.readFileSync('generator.html', 'utf8');
// tolerance-fields.js подключается в generator.html раньше generator-pro.js — порядок важен:
// buildProfile берёт размер настройки через window.RazryadTolerance.
vm.runInContext(fs.readFileSync('tolerance-fields.js', 'utf8'), context, { filename: 'tolerance-fields.js' });
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
vm.runInContext(inline, context, { filename: 'generator-inline.js' });
vm.runInContext(fs.readFileSync('generator-pro.js', 'utf8'), context, { filename: 'generator-pro.js' });
vm.runInContext(fs.readFileSync('generator-v99.js', 'utf8'), context, { filename: 'generator-v99.js' });

function setValue(id, value) { get('#' + id).value = String(value); }
function setupInputs(post = 'haas') {
  setValue('tool', 'T0101'); setValue('boreTool', 'T0202'); setValue('threadTool', 'T0303');
  setValue('grooveTool', 'T0404'); setValue('drillTool', 'T0505'); setValue('idThreadTool', 'T0606');
  setValue('nose', '.8'); setValue('boreNose', '.4'); setValue('insertGrade', 'carbide');
  setValue('stockD', '55'); setValue('stickout', '140'); setValue('maxRpm', '2500'); setValue('programNo', '123');
  setValue('postSelect', post); setValue('machineSelect', 'st20'); setValue('insertCatalog', 'cnmg08');
  setValue('chuckD', '210'); setValue('jawGrip', '30'); setValue('holderReach', '22'); setValue('holderHeight', '25');
}
function run(code) { return vm.runInContext(code, context); }
function assert(condition, message) { if (!condition) throw new Error(message); }

setupInputs('haas');
run(`applyPreset('shaft'); state.vc=110; state.feed=.22; state.depth=1.8; state.rpm=800; state.boreRpm=1000; state.threadRpm=600; state.features=[{type:'chamfer',value:2,axial:2}];`);
let gcode = run('generateGcode()');
if (process.env.DEBUG_GCODE) console.log(gcode);
assert(gcode.includes('X30.000 Z-38.000'), 'Chamfer axial tangent point is missing');
assert(gcode.includes('X34.000 Z-40.000'), 'Explicit C2x45 chamfer point is missing');

setupInputs('haas');
run(`applyPreset('spherical'); state.vc=90; state.feed=.16; state.depth=1; state.rpm=700; state.boreRpm=900; state.threadRpm=500;`);
gcode = run('generateGcode()');
assert(gcode.includes('SFERA SR RAZBITA NA KHORDY'), 'Sphere chord notice is missing');
assert((gcode.match(/N\d+ G01 X/g) || []).length > 7, 'Sphere was not split into contour chords');

setupInputs('haas');
run(`applyPreset('borethread'); state.vc=75; state.feed=.16; state.depth=1.2; state.rpm=650; state.boreRpm=900; state.threadRpm=450; state.extraOps.drill.enabled=true; state.extraOps.drill.cycle='G83'; state.extraOps.grooves=[{side:'od',z:22,width:5,finalD:38,peck:1,step:2}];`);
gcode = run('generateGcode()');
assert(gcode.includes('RASTOCHKA G71 ID'), 'ID roughing cycle is missing');
assert(gcode.includes('G83 Z-'), 'G83 drill cycle is missing');
// Заголовок канавки теперь содержит её номер: канавок может быть несколько, и на стойке
// должно быть видно, какая именно исполняется.
assert(/KANAVKA 1\/1 NARUZHNAYA G75/.test(gcode), 'G75 groove cycle is missing');
assert(gcode.includes('VNUTRENNYAYA REZBA G76'), 'Internal G76 is missing');
assert(!/[А-Яа-яЁё]/.test(gcode), 'NC output contains Cyrillic');

setupInputs('fanuc');
run(`state.post='fanuc'; state.thread.enabled=true; state.thread.d=30; state.thread.pitch=2; state.thread.length=25;`);
gcode = run('generateGcode()');
assert(/G71 U[\d.]+ R0\.5\nG71 P100/.test(gcode), 'Fanuc two-block G71 is missing');
assert(gcode.includes('G76 P011060'), 'Fanuc two-block G76 is missing');
assert(gcode.includes('V0990'), 'V0.99 program marker is missing');
assert(run("RazryadGeneratorV99.auditProgram('G96 S120 M03\\nM30').issues.length")>0, 'V0.99 audit missed G96 without G50');
assert(run('RazryadGeneratorV99.estimatePasses()')>=1, 'Pass estimate is invalid');

// --- Разбор строки OCR. Живой обработчик — parseEnhancedOcr, повешенный на #parseBtn в
// generator-pro.js; вызываем именно его, а не мёртвое определение из generator.html.
function parseOcr(text) {
  run("applyPreset('shaft'); state.operation='external'; state.freePoints=null; state.ocrLengths=[]; state.hrc=22;");
  get('#ocrText').value = text;
  get('#parseBtn').onclick();
  return {
    segs: run('JSON.stringify(state.segments.map(x=>[x.d,x.l,x.tol]))'),
    pool: run('JSON.stringify(state.ocrLengths)'),
    fromPreset: run('!!state.dimsFromPreset'),
    features: run('JSON.stringify(state.ocrFeatures.map(f=>f.type+f.value))'),
    thread: run('state.thread.enabled?state.thread.d+"x"+state.thread.pitch:"нет"'),
    hrc: run('state.hrc')
  };
}

// По ГОСТ 2.307 линейные размеры печатаются голыми числами. Трёх длин на две ступени не хватает
// для однозначной привязки — числа обязаны уйти в пул, а поля остаться пустыми. Раньше здесь
// подставлялся литерал 40 мм, неотличимый от прочитанного с чертежа.
let p = parseOcr('100 Ø45 60 Ø30 40');
assert(p.segs === '[[45,null,null],[30,null,null]]', 'Неоднозначные длины не должны привязываться: ' + p.segs);
assert(p.pool === '[100,60,40]', 'Непривязанные длины должны попасть в пул: ' + p.pool);

// Порядок ступеней берётся из чертежа, а не навязывается сортировкой по возрастанию диаметра:
// сортировка переставляла ступени вдоль Z и глушила предупреждение geometryIssue про G71 Type I.
assert(JSON.parse(p.segs)[0][0] === 45, 'Ступени не должны сортироваться по возрастанию Ø');

// Когда длин ровно столько же, сколько ступеней, привязка по индексу допустима.
p = parseOcr('Ø45 L60 Ø30 L40');
assert(p.segs === '[[45,60,null],[30,40,null]]', 'Совпадение по количеству должно давать привязку: ' + p.segs);

// Поле допуска съедается одним матчем с диаметром. Иначе Ø30±0.1 разбирается как Ø300.1
// и G71 уводит X на 304 мм.
p = parseOcr('Ø30±0.1 40');
assert(p.segs === '[[30,40,"±0.1"]]', 'Допуск ± должен отделяться от диаметра: ' + p.segs);
p = parseOcr('Ø45h6 60 Ø30 40');
assert(p.segs === '[[45,60,"h6"],[30,40,null]]', 'Поле допуска h6 должно распознаваться: ' + p.segs);

// Омоглифы: rus-модель Tesseract читает знак диаметра как Ф, фаску как кириллическую С,
// метрическую резьбу как кириллическую М. Латинские регулярки их не ловят.
p = parseOcr('Ф30 Ф45');
assert(p.segs === '[[30,null,null],[45,null,null]]', 'Ф должна читаться как знак диаметра: ' + p.segs);
p = parseOcr('Ø30 40 Ø45 60 С2x45');
assert(p.features === '["chamfer2"]', 'Фаска кириллической С должна распознаваться: ' + p.features);
p = parseOcr('М24x1.5 Ø24 30');
assert(p.thread === '24x1.5', 'Резьба кириллической М должна распознаваться: ' + p.thread);

// C из HRC не должна читаться как фаска.
p = parseOcr('Ø30 L40 Ø45 L60 C2x45 R3 HRC 32');
assert(p.features === '["chamfer2","round3"]', 'HRC 32 не должна давать фаску C32: ' + p.features);
assert(p.hrc === 32, 'HRC должна прочитаться: ' + p.hrc);

// Ни одного диаметра — значит на шаге размеров показаны числа шаблона. Это обязано быть
// помечено, иначе оператор подтверждает пресет как распознанное с чертежа.
p = parseOcr('ГОСТ 2.307 1:1 Сталь 45');
assert(p.fromPreset === true, 'Отсутствие диаметров должно помечаться флагом dimsFromPreset');
assert(p.pool === '[]', 'Без диаметров пул длин должен быть пуст, а не полон мусора из штампа: ' + p.pool);

// --- Поля допуска: точим в середину поля, а не по номиналу (ГОСТ 25346).
// Таблицы в tolerance-fields.js перенесены из расчёта посадок chpu.html.
const TOL = run('window.RazryadTolerance');
assert(TOL, 'tolerance-fields.js не загрузился');
assert(Math.abs(run("RazryadTolerance.midTarget(45,'h6')") - 44.992) < 1e-9, 'Ø45h6 -> 44.992');
assert(Math.abs(run("RazryadTolerance.midTarget(30,'H7')") - 30.0105) < 1e-9, 'Ø30H7 -> 30.0105');
assert(run("RazryadTolerance.midTarget(30,'±0.1')") === 30, 'Симметричный допуск не смещает размер');
assert(Math.abs(run("RazryadTolerance.midTarget(30,'+0.2/-0.1')") - 30.05) < 1e-9, '+0.2/-0.1 -> 30.05');
assert(run("RazryadTolerance.midTarget(45,'ерунда')") === 45, 'Нераспознанное поле -> номинал без смещения');
assert(run("RazryadTolerance.parse('h6',600)") === null, 'Вне таблицы ГОСТ поле не выдумывается');

// Размер настройки обязан дойти до контура G71, а не остаться на экране.
function gcodeFor(setupCode) {
  setupInputs('haas');
  setValue('stockD', '55'); setValue('stickout', '140');
  run(setupCode + " state.vc=110;state.feed=.22;state.depth=1.8;state.rpm=800;state.boreRpm=900;state.threadRpm=600;");
  return run('generateGcode()');
}
gcode = gcodeFor("applyPreset('shaft'); state.segments=[{d:30,l:40,tol:null},{d:45,l:60,tol:'h6'}]; state.features=[{type:'sharp',value:0,axial:6}];");
assert(gcode.includes('X44.992'), 'Контур должен идти по середине поля h6, а не по Ø45: ' + gcode.match(/N1[34]0[^\n]*/));
assert(gcode.includes('44.984..45.000'), 'В программе должны быть предельные размеры с чертежа');
assert(gcode.includes('NASTROYKA 44.992'), 'В программе должен быть явно указан размер настройки');
// Регистр поля допуска — это его смысл: h6 вал, H6 отверстие. ncText() уничтожил бы различие.
assert(/DIA 45\.000 h6 /.test(gcode), 'Регистр обозначения допуска должен сохраняться: ' + gcode.match(/UCHASTOK 2[^\n]*/));
assert(!/[А-Яа-яЁё]/.test(gcode), 'NC output contains Cyrillic');

// Угол фаски: катет по X равен 2c/tg(угол). При 45° это 2c, при 30° — заметно больше.
gcode = gcodeFor("applyPreset('shaft'); state.segments=[{d:30,l:40},{d:45,l:60}]; state.features=[{type:'chamfer',value:2,axial:2,angle:45}];");
assert(gcode.includes('X34.000 Z-40.000'), 'Фаска 45° должна давать катет 2c');
gcode = gcodeFor("applyPreset('shaft'); state.segments=[{d:30,l:40},{d:45,l:60}]; state.features=[{type:'chamfer',value:2,axial:2,angle:30}];");
assert(gcode.includes('X36.928 Z-40.000'), 'Фаска 30° должна давать другой катет, чем 45°: ' + gcode.match(/N130[^\n]*/));

// Расточка тоже точится в середину поля.
gcode = gcodeFor("applyPreset('bushing'); state.operation='both'; state.segments=[{d:60,l:50}]; state.features=[]; state.bore={preD:26,finalD:30,depth:45,through:false,tol:'H7'};");
// Номер кадра здесь намеренно не проверяется: он раздаётся динамически, чтобы диапазоны
// наружного контура и расточки не пересекались.
assert(/N\d+ G4[12] G00 X30\.011/.test(gcode), 'Расточка H7 должна идти по 30.011: ' + gcode.match(/N\d+ G4[12] G00[^\n]*/));

// Угол фаски читается с чертежа: C2x30.
p = parseOcr('Ø30 40 Ø45 60 C2x30');
assert(run('state.ocrFeatures[0].angle') === 30, 'Угол фаски должен читаться из выноски C2x30');
p = parseOcr('Ø30 40 Ø45 60 C2x45');
assert(run('state.ocrFeatures[0].angle') === 45, 'C2x45 должна давать 45°');

// --- state.safe — это то, что открывает экспорт (generator.html:252). Он не должен становиться
// true на геометрии, которую geometryIssue() отвергает. Раньше geometryIssue() спрашивали только
// в обработчике галочки «Размеры сверены», поэтому прямой вызов checkSafety() на участках с
// l:null давал зелёный свет: totalL()=0, контур вырождается в точки на Z0, зазоры «в норме».
setupInputs('haas');
setValue('stockD', '55'); setValue('stickout', '140');
run("applyPreset('shaft'); state.segments=[{d:30,l:null,tol:null},{d:45,l:null,tol:null}]; state.features=[{type:'sharp',value:0,axial:6}]; state.vc=110;state.feed=.22;state.depth=1.8;state.rpm=800;state.boreRpm=900;state.threadRpm=600; readSetup(); state.gcode=generateGcode(); checkSafety();");
assert(run('state.safe') === false, 'checkSafety() обязана отвергать геометрию с непроставленной длиной');
assert(/длин/i.test(get('#safetyText').textContent), 'Причина отказа должна называть незаполненную длину: ' + get('#safetyText').textContent);

// Обратная сторона: на годной геометрии checkSafety() по-прежнему пропускает.
run("state.segments=[{d:30,l:40,tol:null},{d:45,l:60,tol:null}]; state.gcode=generateGcode(); checkSafety();");
assert(run('state.safe') === true, 'Годная геометрия должна проходить проверку: ' + get('#safetyText').textContent);

// --- Конусы: у участка появился d2 — диаметр на дальнем конце. null = цилиндр.
gcode = gcodeFor("applyPreset('shaft'); state.segments=[{d:30,d2:45,l:40,tol:null},{d:60,l:50,tol:null}]; state.features=[{type:'sharp',value:0,axial:6}];");
assert(gcode.includes('X45.000 Z-40.000'), 'Конус должен давать наклонный кадр к Ø45 на Z-40: ' + gcode.match(/N120[^\n]*/));
assert(gcode.includes('X60.000 Z-40.000'), 'После конуса должен идти уступ до Ø60');

// maxD()/minD() в generator.html знают только про d. Без учёта d2 конус Ø30->Ø60 давал бы
// maxD()=30, а от него считается safeX — быстрый подвод пришёлся бы внутрь тела детали.
run("state.segments=[{d:30,d2:60,l:40,tol:null}]; state.features=[];");
assert(run('maxD()') === 60, 'maxD() обязана видеть дальний конец конуса: ' + run('maxD()'));
assert(run('minD()') === 30, 'minD() обязана видеть оба конца конуса: ' + run('minD()'));

// G71 Type I требует контур, растущий от торца к патрону. Сужение внутри участка и разрыв
// на стыке базовая проверка в generator.html не видит — она сравнивает только начальные диаметры.
run("state.segments=[{d:45,d2:30,l:40,tol:null},{d:60,l:50,tol:null}]; state.features=[{type:'sharp',value:0,axial:6}];");
assert(/сужается к патрону/.test(run('geometryIssue()')), 'Сужающийся конус должен отвергаться: ' + run('geometryIssue()'));
run("state.segments=[{d:30,d2:50,l:40,tol:null},{d:40,l:50,tol:null}]; state.features=[{type:'sharp',value:0,axial:6}];");
assert(/контур убывает/.test(run('geometryIssue()')), 'Разрыв на стыке конуса должен отвергаться: ' + run('geometryIssue()'));

// Поле допуска смещает оба конца конуса одинаково, иначе изменился бы угол конуса.
gcode = gcodeFor("applyPreset('shaft'); state.segments=[{d:30,d2:45,l:40,tol:'h6'},{d:60,l:50,tol:null}]; state.features=[{type:'sharp',value:0,axial:6}];");
assert(gcode.includes('X29.994'), 'Малый конец конуса со смещением по h6: ' + gcode.match(/N100[^\n]*/));
assert(gcode.includes('X44.993'), 'Большой конец смещён на ту же величину: ' + gcode.match(/N120[^\n]*/));

// Фаска в конце конуса начинается на диаметре, интерполированном по длине, а не на d.
gcode = gcodeFor("applyPreset('shaft'); state.segments=[{d:30,d2:45,l:40,tol:null},{d:60,l:50,tol:null}]; state.features=[{type:'chamfer',value:2,axial:2,angle:45}];");
assert(gcode.includes('X44.250 Z-38.000'), 'Начало фаски на конусе интерполируется по длине: ' + gcode.match(/N120[^\n]*/));

// Регрессия: цилиндры без d2 строятся ровно как раньше.
gcode = gcodeFor("applyPreset('shaft'); state.segments=[{d:30,l:40,tol:null},{d:45,l:60,tol:null}]; state.features=[{type:'sharp',value:0,axial:6}];");
assert(gcode.includes('X30.000 Z-40.000') && gcode.includes('X45.000 Z-40.000') && gcode.includes('X45.000 Z-100.000'),
  'Цилиндрический контур не должен измениться от появления конусов');

// --- Номера кадров двух контуров в одной программе не имеют права пересекаться.
// G71 P..Q.. ищет кадр ПО НОМЕРУ. Сфера даёт до 33 точек, наружный контур доходил до N430,
// а расточка жёстко просила P200 Q230 — и находила чужой кадр внутри наружного профиля.
// Расточная оправка в отверстии Ø18 получала при этом диаметры наружного профиля.
function frameNumbers(code) {
  return code.split('\n').map(l => (l.match(/^N(\d+)/) || [])[1]).filter(Boolean).map(Number);
}
gcode = gcodeFor("applyPreset('spherical'); state.operation='both'; state.bore={preD:12,finalD:18,depth:30,through:false,tol:null}; state.sphereTolerance=0.005;");
let frames = frameNumbers(gcode);
let dups = frames.filter((n, i) => frames.indexOf(n) !== i);
assert(frames.length > 30, 'Сфера должна давать длинный контур, иначе проверка бессмысленна: ' + frames.length);
assert(dups.length === 0, 'Номера кадров наружного контура и расточки пересеклись: ' + [...new Set(dups)].join(' '));

// Диапазоны P..Q обоих циклов не должны накладываться.
const ranges = [...gcode.matchAll(/G71 P(\d+) Q(\d+)/g)].map(m => [+m[1], +m[2]]);
assert(ranges.length === 2, 'Ожидались два цикла G71 — наружный и расточка: ' + JSON.stringify(ranges));
assert(ranges[0][1] < ranges[1][0], 'Диапазон расточки должен начинаться после конца наружного: ' + JSON.stringify(ranges));

// Сторона коррекции берётся из профиля станка напрямую, без правки готового NC регулярками,
// привязанными к номерам кадров.
run("state.extComp='G41'; state.idComp='G42';");
gcode = gcodeFor("applyPreset('bushing'); state.operation='both'; state.segments=[{d:60,l:50}]; state.features=[]; state.bore={preD:26,finalD:30,depth:45,through:false,tol:null};");
assert(/N\d+ G00 G41 X/.test(gcode), 'Наружная компенсация из профиля должна попадать в кадр: ' + gcode.match(/N\d+ G00 G4[12][^\n]*/));
assert(/N\d+ G42 G00 X/.test(gcode), 'Внутренняя компенсация из профиля должна попадать в кадр: ' + gcode.match(/N\d+ G4[12] G00[^\n]*/));
run("state.extComp='G42'; state.idComp='G41';");

// --- Несколько канавок в одной программе. Раньше extraOps был объектом и вмещал ровно по одной
// канавке каждого вида: вторая молча не попадала в программу, деталь уходила на сборку без
// второго кольцевого паза, и ни одна проверка на это не жаловалась.
gcode = gcodeFor("applyPreset('shaft'); state.segments=[{d:40,l:80,tol:null}]; state.features=[];"
  + " state.extraOps.grooves=[{side:'od',z:15,width:3,finalD:34,peck:1,step:2},"
  + "{side:'od',z:60,width:3,finalD:34,peck:1,step:2}];");
let g75 = gcode.match(/^G75 X/gm) || [];
assert(g75.length === 2, 'Две канавки должны дать два цикла G75, получено ' + g75.length);
assert(/KANAVKA 1\/2 NARUZHNAYA/.test(gcode) && /KANAVKA 2\/2 NARUZHNAYA/.test(gcode), 'Канавки должны быть пронумерованы: ' + (gcode.match(/KANAVKA[^\n]*/g) || []));
assert(gcode.includes('Z-15.000') && gcode.includes('Z-60.000'), 'Обе канавки должны стоять на своих Z');

// Три канавки разных видов — каждая своим циклом.
gcode = gcodeFor("applyPreset('bushing'); state.operation='both'; state.segments=[{d:60,l:60,tol:null}]; state.features=[];"
  + " state.bore={preD:26,finalD:30,depth:50,through:false,tol:null};"
  + " state.extraOps.grooves=[{side:'od',z:20,width:4,finalD:52,peck:1,step:2},"
  + "{side:'id',z:20,width:4,finalD:34,peck:.8,step:2},"
  + "{side:'face',startD:36,endD:50,depth:4,peck:.8,step:2}];");
assert((gcode.match(/^G75 X/gm) || []).length === 2, 'Наружная и внутренняя канавки — два G75');
assert((gcode.match(/^G74 X/gm) || []).length === 1, 'Торцевая канавка — один G74');
assert(!/[А-Яа-яЁё]/.test(gcode), 'NC output contains Cyrillic');

// Проверки по каждой канавке отдельно, с номером в тексте.
run("applyPreset('shaft'); state.segments=[{d:40,l:80,tol:null}]; state.features=[];"
  + " state.extraOps.grooves=[{side:'od',z:15,width:3,finalD:34,peck:1,step:2},"
  + "{side:'od',z:16,width:3,finalD:34,peck:1,step:2}];");
assert(/перекрываются по Z/.test(run('geometryIssue()')), 'Перекрывающиеся канавки должны отвергаться: ' + run('geometryIssue()'));
run("state.extraOps.grooves=[{side:'od',z:15,width:3,finalD:44,peck:1,step:2}];");
assert(/Канавка 1/.test(run('geometryIssue()')), 'Канавка глубже детали должна отвергаться с номером: ' + run('geometryIssue()'));
run("state.extraOps.grooves=[{side:'id',z:15,width:3,finalD:44,peck:1,step:2}];");
assert(/расточки/.test(run('geometryIssue()')), 'Внутренняя канавка без расточки должна отвергаться: ' + run('geometryIssue()'));

// Состояние, сохранённое старой версией (по одной канавке каждого вида), должно мигрировать.
run("state.extraOps=RazryadGeneratorPro.normalizeExtraOps({"
  + "odGroove:{enabled:true,z:22,width:5,finalD:26,peck:1,step:2},"
  + "idGroove:{enabled:false,z:22,width:5,finalD:34,peck:.8,step:2},"
  + "faceGroove:{enabled:true,startD:22,endD:42,depth:5,peck:.8,step:2},"
  + "drill:{enabled:true,cycle:'G83',diameter:12,depth:50,peck:5},"
  + "idThread:{enabled:false,d:30,pitch:1.5,length:25}});");
assert(run('state.extraOps.grooves.length') === 2, 'Из старой формы должны получиться две включённые канавки: ' + run('JSON.stringify(state.extraOps.grooves)'));
assert(run("state.extraOps.grooves.map(g=>g.side).join(',')") === 'od,face', 'Виды канавок при миграции должны сохраниться');
assert(run('state.extraOps.drill.enabled') === true, 'Сверление при миграции должно сохраниться');
// Выключенные в старой форме канавки не должны воскресать.
assert(run("RazryadGeneratorPro.normalizeExtraOps({odGroove:{enabled:false,z:1,width:1,finalD:1}}).grooves.length") === 0, 'Выключенная канавка не должна мигрировать');
// Уже новая форма проходит без изменений.
assert(run("RazryadGeneratorPro.normalizeExtraOps({grooves:[{side:'od',z:1,width:1,finalD:1}]}).grooves.length") === 1, 'Новая форма должна проходить без потерь');

// --- Ступенчатая расточка. Внутренний контур был захардкожен четырьмя кадрами, поэтому втулка
// с буртом под подшипник (Ø30 на 20 мм, дальше Ø22) не выражалась вовсе: оператор получал
// сквозную Ø30 на всю глубину и сажал подшипник в дыру без упора.
gcode = gcodeFor("applyPreset('bushing'); state.operation='both'; state.segments=[{d:60,l:70,tol:null}]; state.features=[];"
  + " state.bore={preD:20,through:false,steps:[{d:30,depth:20,tol:null},{d:22,depth:60,tol:null}]};");
let bore = gcode.split('\n').filter(l => /^N\d+ (G4[12] )?G0[01]/.test(l)).slice(-6);
assert(/G01 X30\.000/.test(gcode) || /G4[12] G00 X30\.000/.test(gcode), 'Первая ступень Ø30 должна быть в контуре: ' + bore.join(' | '));
assert(gcode.includes('G01 Z-20.000'), 'Первая ступень должна заканчиваться на Z-20: ' + bore.join(' | '));
assert(gcode.includes('G01 X22.000'), 'Переход на вторую ступень Ø22 отсутствует: ' + bore.join(' | '));
assert(gcode.includes('G01 Z-60.000'), 'Вторая ступень должна доходить до Z-60: ' + bore.join(' | '));
// Контур обязан остаться Type I: диаметр только убывает, Z только растёт по модулю.
{
  const pq = gcode.match(/G71 P(\d+) Q(\d+) U-/);
  assert(pq, 'Внутренний цикл G71 с отрицательным U отсутствует');
  const body = gcode.split('\n').filter(l => { const m = l.match(/^N(\d+)/); return m && +m[1] >= +pq[1] && +m[1] <= +pq[2]; });
  const xs = body.map(l => (l.match(/X(-?[\d.]+)/) || [])[1]).filter(Boolean).map(Number);
  for (let i = 1; i < xs.length - 1; i++) assert(xs[i] <= xs[i - 1] + 1e-9, 'Диаметр расточки должен только убывать: ' + xs.join(' -> '));
}

// Одна ступень даёт ровно те же четыре кадра, что и раньше.
gcode = gcodeFor("applyPreset('bushing'); state.operation='both'; state.segments=[{d:60,l:70,tol:null}]; state.features=[];"
  + " state.bore={preD:26,finalD:30,depth:45,through:false,tol:null};");
{
  const pq = gcode.match(/G71 P(\d+) Q(\d+) U-/);
  const body = gcode.split('\n').filter(l => { const m = l.match(/^N(\d+)/); return m && +m[1] >= +pq[1] && +m[1] <= +pq[2]; });
  assert(body.length === 4, 'Гладкое отверстие должно давать 4 кадра контура, получено ' + body.length + ': ' + body.join(' | '));
}

// Отверстие, расширяющееся вглубь — поднутрение, прямым резцом не берётся.
run("applyPreset('bushing'); state.operation='both'; state.segments=[{d:60,l:70,tol:null}]; state.features=[];"
  + " state.bore={preD:20,through:false,steps:[{d:22,depth:20,tol:null},{d:30,depth:60,tol:null}]};");
assert(/поднутрение/.test(run('geometryIssue()')), 'Расширяющееся вглубь отверстие должно отвергаться: ' + run('geometryIssue()'));
// Ступень не глубже предыдущей — тоже отказ.
run("state.bore={preD:20,through:false,steps:[{d:30,depth:40,tol:null},{d:22,depth:20,tol:null}]};");
assert(/глубина/.test(run('geometryIssue()')), 'Ступень не глубже предыдущей должна отвергаться: ' + run('geometryIssue()'));
// Ступень не больше исходного отверстия — снимать нечего.
run("state.bore={preD:30,through:false,steps:[{d:30,depth:40,tol:null}]};");
assert(/снимать нечего/.test(run('geometryIssue()')), 'Ø, равный исходному отверстию, должен отвергаться: ' + run('geometryIssue()'));

// Зеркала finalD/depth должны отражать ступени: их читают базовые проверки в generator.html.
run("state.bore={preD:20,through:false,steps:[{d:30,depth:20,tol:'H7'},{d:22,depth:60,tol:null}]}; RazryadGeneratorPro.syncBoreMirror();");
assert(run('state.bore.finalD') === 30, 'finalD должен быть диаметром у торца: ' + run('state.bore.finalD'));
assert(run('state.bore.depth') === 60, 'depth должен быть полной глубиной: ' + run('state.bore.depth'));
assert(run("RazryadGeneratorPro.boreDAt(10)") === 30 && run("RazryadGeneratorPro.boreDAt(40)") === 22,
  'boreDAt должен давать диаметр на своей глубине');

// Допуск на каждой ступени попадает в комментарии отдельной строкой.
gcode = gcodeFor("applyPreset('bushing'); state.operation='both'; state.segments=[{d:60,l:70,tol:null}]; state.features=[];"
  + " state.bore={preD:20,through:false,steps:[{d:30,depth:20,tol:'H7'},{d:22,depth:60,tol:'H8'}]};");
assert(/OTVERSTIE 1 DIA 30\.000 H7/.test(gcode), 'Допуск первой ступени отсутствует: ' + (gcode.match(/OTVERSTIE[^\n]*/g) || []));
assert(/OTVERSTIE 2 DIA 22\.000 H8/.test(gcode), 'Допуск второй ступени отсутствует: ' + (gcode.match(/OTVERSTIE[^\n]*/g) || []));
assert(!/[А-Яа-яЁё]/.test(gcode), 'NC output contains Cyrillic');

console.log('generator smoke tests: OK');
