/* Шов между двумя половинами приложения: программа, собранная генератором «Фото → G-код»,
   прогоняется через эмулятор CNC и проверяется по фактическому съёму металла.

   Оба набора тестов по отдельности были зелёными, когда генератор выдавал программу с
   ДВУМЯ кадрами N200: наружный контур сферической детали занимает N100..N430, а расточка
   жёстко просила P200 Q230 и находила чужой кадр внутри наружного профиля. Ни generator-smoke,
   ни lathe-sim-machining этого поймать не могли — первый не запускает эмулятор, второй не
   вызывает генератор. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.resolve(__dirname, '..');

let checks = 0;
const assert = (v, m) => { checks++; if (!v) throw new Error(m); };
const near = (a, b, tol, m) => { checks++; if (!(Math.abs(a - b) <= tol)) throw new Error(m + ': ожидалось ' + b + '±' + tol + ', получено ' + a); };

/* ---------- половина 1: генератор ---------- */
function makeGenerator() {
  class E {
    constructor(s = '') { this.selector = s; this.value = ''; this.textContent = ''; this.innerHTML = ''; this.checked = false; this.disabled = false; this.dataset = {}; this.style = { setProperty() {} }; this.classList = { add() {}, remove() {}, toggle() {} }; }
    addEventListener() {} querySelectorAll() { return []; } appendChild() {} insertAdjacentHTML() {} remove() {} click() {}
    getContext() { return new Proxy({}, { get: () => () => {} }); } matches() { return false; }
  }
  const els = new Map(), get = s => { if (!els.has(s)) els.set(s, new E(s)); return els.get(s); };
  const store = new Map();
  const ctx = vm.createContext({
    console, document: { querySelector: get, querySelectorAll: () => [], createElement: t => new E(t), head: new E('head'), body: new E('body') },
    navigator: {}, localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
    location: { reload() {} }, URL: { createObjectURL: () => 'blob:', revokeObjectURL() {} }, Blob, TextDecoder,
    setTimeout: f => { if (typeof f === 'function') f(); return 1; }, clearTimeout() {},
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, performance: { now: () => 0 }, confirm: () => true
  });
  ctx.window = ctx; ctx.window.addEventListener = () => {}; ctx.window.scrollTo = () => {};
  vm.runInContext(fs.readFileSync(path.join(root, 'tolerance-fields.js'), 'utf8'), ctx, { filename: 'tolerance-fields.js' });
  const html = fs.readFileSync(path.join(root, 'generator.html'), 'utf8');
  vm.runInContext([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1], ctx, { filename: 'generator-inline.js' });
  vm.runInContext(fs.readFileSync(path.join(root, 'generator-pro.js'), 'utf8'), ctx, { filename: 'generator-pro.js' });
  vm.runInContext(fs.readFileSync(path.join(root, 'generator-v99.js'), 'utf8'), ctx, { filename: 'generator-v99.js' });
  const set = (id, v) => { get('#' + id).value = String(v); };
  ['tool:T0101', 'boreTool:T0202', 'threadTool:T0303', 'grooveTool:T0404', 'drillTool:T0505', 'idThreadTool:T0606',
    'nose:.8', 'boreNose:.4', 'insertGrade:carbide', 'stockD:70', 'stickout:160', 'maxRpm:2500', 'programNo:123',
    'postSelect:haas', 'machineSelect:st20', 'insertCatalog:cnmg08', 'chuckD:210', 'jawGrip:30', 'holderReach:22', 'holderHeight:25']
    .forEach(p => { const i = p.indexOf(':'); set(p.slice(0, i), p.slice(i + 1)); });
  return {
    build(setup) {
      vm.runInContext(setup + " state.vc=90;state.feed=.16;state.depth=1;state.rpm=700;state.boreRpm=900;state.threadRpm=500;readSetup();", ctx);
      return vm.runInContext('generateGcode()', ctx);
    }
  };
}

/* ---------- половина 2: эмулятор ---------- */
function makeEmulator() {
  class E {
    constructor(s = '') { this.s = s; this.value = ''; this.innerHTML = ''; this.textContent = ''; this.checked = false; this.dataset = {}; this.style = {}; this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } }; this.parentElement = this; this.offsetWidth = 400; this.clientWidth = 400; this.width = 900; this.height = 260; }
    addEventListener() {} querySelector() { return null; } querySelectorAll() { return []; } setAttribute() {} focus() {} click() {} appendChild() {} insertAdjacentHTML() {} remove() {}
    getBoundingClientRect() { return { width: 400, height: 220 }; }
    getContext() { return new Proxy({ createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; }, measureText() { return { width: 10 }; } }, { get: (o, k) => k in o ? o[k] : () => {}, set: (o, k, v) => (o[k] = v, true) }); }
  }
  const els = new Map(), get = s => { if (!els.has(s)) els.set(s, new E(s)); return els.get(s); };
  const local = new Map();
  const ctx = vm.createContext({
    console, document: { querySelector: get, querySelectorAll: () => [], createElement: t => new E(t), head: new E('head'), body: new E('body'), addEventListener() {} },
    localStorage: { getItem: k => local.get(k) || null, setItem: (k, v) => local.set(k, v), removeItem: k => local.delete(k) },
    navigator: {}, history: { pushState() {}, back() {}, replaceState() {} }, location: { href: '', search: '', pathname: '/' },
    Event: function () {}, Blob, URL: { createObjectURL() { return 'blob:x'; }, revokeObjectURL() {} }, URLSearchParams,
    confirm: () => true, setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    innerWidth: 412, innerHeight: 800, matchMedia: () => ({ matches: false }), Date
  });
  ctx.window = ctx; ctx.window.addEventListener = () => {}; ctx.window.scrollTo = () => {};
  const html = fs.readFileSync(path.join(root, 'chpu.html'), 'utf8');
  const scripts = [...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].map(x => x[1]).filter(x => x.trim());
  vm.runInContext(scripts[scripts.length - 1], ctx, { filename: 'chpu-inline.js' });
  ['cnc-sim-core.js', 'operator-tools.js', 'chpu-v99.js', 'lathe-sim-v99.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f }));
  return ctx.RazryadCNC;
}

const GEN = makeGenerator(), CNC = makeEmulator();
const run = (code, over) => {
  const cfg = { ...CNC.defaults(), stockD: 70, length: 120, grip: 20, boreD: 0, ...(over || {}) };
  const res = CNC.parseGcode(code, cfg);
  return { cfg, res, mat: CNC.stockProfile(res, cfg, res.segments.length, 0) };
};
const at = (mat, z) => { const k = Math.max(0, Math.min(mat.z.length - 1, Math.round((z - mat.z[0]) / mat.step))); return { outer: mat.outer[k], inner: mat.inner[k] }; };

const realBad = res => res.issues.filter(x => x.type === 'bad');

/* ---------- 1. Длинный наружный контур плюс расточка: два цикла G71 в одной программе ----------
   Восемь ступеней дают наружному контуру диапазон N100..N260. Пока номера были жёстко зашиты,
   расточка просила P200 Q230 — то есть кадры ВНУТРИ наружного контура. Стойка нашла бы там
   чужой профиль и погнала бы расточную оправку по наружным диаметрам с U-0.2. */
{
  const eight = Array.from({ length: 8 }, (_, i) => '{d:' + (36 + i * 4) + ',l:10,tol:null}').join(',');
  const code = GEN.build("applyPreset('bushing'); state.operation='both'; state.segments=[" + eight + "];"
    + " state.features=[]; state.bore={preD:26,finalD:30,depth:40,through:false,tol:null};");

  const frames = code.split('\n').map(l => (l.match(/^N(\d+)/) || [])[1]).filter(Boolean).map(Number);
  const dups = [...new Set(frames.filter((n, i) => frames.indexOf(n) !== i))];
  const cycles = [...code.matchAll(/G71 P(\d+) Q(\d+)/g)].map(m => [+m[1], +m[2]]);

  assert(cycles.length === 2, 'Ожидались два цикла G71: наружный и расточка — ' + JSON.stringify(cycles));
  assert(cycles[0][1] > 200, 'Наружный контур должен перешагнуть N200, иначе проверка ничего не ловит: Q' + cycles[0][1]);
  assert(dups.length === 0, 'В программе повторяются номера кадров: ' + dups.join(' ') + ' — G71 P..Q.. найдёт чужой контур');
  assert(cycles[0][1] < cycles[1][0], 'Диапазоны P..Q двух циклов пересеклись: ' + JSON.stringify(cycles));
  cycles.forEach(([p, q]) => {
    assert(frames.includes(p), 'Кадр P' + p + ' отсутствует в программе');
    assert(frames.includes(q), 'Кадр Q' + q + ' отсутствует в программе');
    assert(frames.filter(n => n === p).length === 1, 'Кадр P' + p + ' встречается больше одного раза');
  });

  const r = run(code, { stock: 'tube', boreD: 26 });
  assert(realBad(r.res).length === 0, 'Эмулятор нашёл ошибки в программе генератора: ' + JSON.stringify(realBad(r.res).map(x => x.text)));
  assert(r.res.segments.length > 0, 'Эмулятор не построил ни одного перемещения');
  near(at(r.mat, -10).inner, 15, .8, 'Расточка Ø30 не выбрана эмулятором на глубине 10 мм');
  near(at(r.mat, -5).outer, 18, .8, 'Первая ступень Ø36 не выточена');
}

/* ---------- 2. Конус доходит до эмулятора как конус, а не как ступенька ---------- */
{
  const code = GEN.build("applyPreset('shaft'); state.operation='external'; state.segments=[{d:30,d2:50,l:40,tol:null},{d:60,l:40,tol:null}]; state.features=[{type:'sharp',value:0,axial:6}];");
  const r = run(code);
  assert(realBad(r.res).length === 0, 'Эмулятор нашёл ошибки в конусе: ' + JSON.stringify(realBad(r.res).map(x => x.text)));
  const a = at(r.mat, -10).outer, b = at(r.mat, -30).outer;
  assert(b > a + 2, 'Профиль на конусе должен расти вдоль Z, получено ' + a.toFixed(2) + ' -> ' + b.toFixed(2));
  near(at(r.mat, -39).outer, 25, .9, 'Конус не дошёл до Ø50 у дальнего конца участка');
}

/* ---------- 3. Проверка Type I: коррекция не должна давать ложное срабатывание,
   но настоящая немонотонность обязана ловиться по-прежнему ----------
   Проверка монотонности в lathe-sim-v99.js смотрела на путь, уже смещённый на радиус вершины.
   Смещение перпендикулярно движению, поэтому на стыке подвода по X с ходом по Z в смещённом пути
   появлялся короткий обратный ход по Z, которого в контуре нет — и любая программа с G41/G42
   в кадре P помечалась как заблокированный Type II. */
{
  const NL = '\n';
  const head = 'G21 G18 G40 G80 G99' + NL + 'T0101' + NL + 'G50 S2500' + NL + 'G97 S700 M03' + NL + 'G00 X74. Z2. M08' + NL;
  const tail = NL + 'G70 P100 Q140' + NL + 'G01 G40 X74. F0.16' + NL + 'M30';
  const cyc = 'G71 P100 Q140 U0.3 W0.1 D1 F0.16' + NL;
  const typeII = /Type II с обратным ходом Z/;

  /* монотонный контур с коррекцией — ровно то, что выдаёт генератор */
  const good = head + cyc + ['N100 G00 G42 X30.000', 'N110 G01 Z0.000 F0.160', 'N120 G01 X30.000 Z-40.000 F0.160',
    'N130 G01 X45.000 Z-40.000 F0.160', 'N140 G01 X45.000 Z-100.000 F0.160'].join(NL) + tail;
  const rg = CNC.parseGcode(good, { ...CNC.defaults(), stockD: 70, length: 120, grip: 20, boreD: 0 });
  assert(!rg.issues.some(x => typeII.test(x.text)),
    'Монотонный контур с G42 не должен помечаться как Type II: ' + JSON.stringify(rg.issues.filter(x => typeII.test(x.text)).map(x => x.text)));

  /* тот же контур, но с настоящим возвратом по Z — обязан быть отвергнут */
  const bad = head + cyc + ['N100 G00 G42 X30.000', 'N110 G01 Z0.000 F0.160', 'N120 G01 X30.000 Z-40.000 F0.160',
    'N130 G01 X45.000 Z-20.000 F0.160', 'N140 G01 X45.000 Z-100.000 F0.160'].join(NL) + tail;
  const rb = CNC.parseGcode(bad, { ...CNC.defaults(), stockD: 70, length: 120, grip: 20, boreD: 0 });
  assert(rb.issues.some(x => typeII.test(x.text)),
    'Контур с обратным ходом по Z обязан отвергаться как непригодный для Type I');
}

/* ---------- 4. Ступенчатая расточка доходит до детали двумя диаметрами ----------
   Внутренний контур был захардкожен четырьмя кадрами, поэтому втулка с буртом под подшипник
   не выражалась вовсе: выходила сквозная расточка на всю глубину, и подшипник садился без упора. */
{
  const code = GEN.build("applyPreset('bushing'); state.operation='both'; state.segments=[{d:60,l:70,tol:null}];"
    + " state.features=[]; state.bore={preD:26,through:false,steps:[{d:34,depth:20,tol:null},{d:30,depth:55,tol:null}]};");
  const r = run(code, { stock: 'tube', boreD: 26, length: 120 });
  assert(realBad(r.res).length === 0, 'Эмулятор нашёл ошибки в ступенчатой расточке: ' + JSON.stringify(realBad(r.res).map(x => x.text)));
  near(at(r.mat, -10).inner, 17, .8, 'Первая ступень отверстия Ø34 не выбрана');
  near(at(r.mat, -45).inner, 15, .8, 'Вторая ступень отверстия Ø30 не выбрана');
  assert(at(r.mat, -10).inner > at(r.mat, -45).inner + .8,
    'У торца отверстие должно быть шире, чем в глубине: ' + at(r.mat, -10).inner.toFixed(2) + ' против ' + at(r.mat, -45).inner.toFixed(2));
}

/* ---------- 5. Две канавки доходят до детали как две ---------- */
{
  const code = GEN.build("applyPreset('shaft'); state.operation='external'; state.segments=[{d:40,l:80,tol:null}]; state.features=[];"
    + " state.extraOps.grooves=[{side:'od',z:15,width:4,finalD:32,peck:1,step:2},"
    + "{side:'od',z:55,width:4,finalD:32,peck:1,step:2}];");
  const r = run(code, { stockD: 45, length: 110 });
  assert(realBad(r.res).length === 0, 'Эмулятор нашёл ошибки в программе с двумя канавками: ' + JSON.stringify(realBad(r.res).map(x => x.text)));
  near(at(r.mat, -17).outer, 16, 1, 'Первая канавка не прорезана до Ø32');
  near(at(r.mat, -57).outer, 16, 1, 'Вторая канавка не прорезана до Ø32');
  assert(at(r.mat, -35).outer > 19, 'Между канавками должен остаться диаметр детали, получено ' + at(r.mat, -35).outer.toFixed(2));
}

console.log('интеграция генератор -> эмулятор: OK (' + checks + ' проверок)');
