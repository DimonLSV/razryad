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
run(`applyPreset('borethread'); state.vc=75; state.feed=.16; state.depth=1.2; state.rpm=650; state.boreRpm=900; state.threadRpm=450; state.extraOps.drill.enabled=true; state.extraOps.drill.cycle='G83'; state.extraOps.odGroove.enabled=true; state.extraOps.odGroove.finalD=38;`);
gcode = run('generateGcode()');
assert(gcode.includes('RASTOCHKA G71 ID'), 'ID roughing cycle is missing');
assert(gcode.includes('G83 Z-'), 'G83 drill cycle is missing');
assert(gcode.includes('KANAVKA G75'), 'G75 groove cycle is missing');
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

console.log('generator smoke tests: OK');
