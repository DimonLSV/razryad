/* RAZRYAD Photo -> G-code, production extensions v0.980 */
(function () {
  const INSERTS = {
    cnmg08: { code: 'CNMG 120408-PM', nose: .8, grade: 'carbide', use: 'Черновое/получистовое наружное точение сталей', group: 'P/M' },
    cnmg04: { code: 'CNMG 120404-PF', nose: .4, grade: 'carbide', use: 'Получистовое наружное точение, малые уступы', group: 'P' },
    dnmg04: { code: 'DNMG 150604-PF', nose: .4, grade: 'carbide', use: 'Профиль, фаски и чистовой проход', group: 'P/M' },
    vnmg04: { code: 'VNMG 160404-PF', nose: .4, grade: 'carbide', use: 'Тонкий профиль и подрезка к уступу', group: 'P/M' },
    ccmt04: { code: 'CCMT 09T304-PF', nose: .4, grade: 'carbide', use: 'Расточка и лёгкое наружное точение', group: 'P/M/K' },
    dcmt04: { code: 'DCMT 11T304-PF', nose: .4, grade: 'carbide', use: 'Чистовая расточка и профиль', group: 'P/M' },
    ccgt04: { code: 'CCGT 09T304-AL', nose: .4, grade: 'carbide', use: 'Алюминий и цветные сплавы, острозаточенная твердосплавная пластина', group: 'N' },
    cnmm12: { code: 'CNMM 120412-RR', nose: 1.2, grade: 'carbide', use: 'Тяжёлая черновая обработка при жёсткой наладке', group: 'P/K' },
    cnga08: { code: 'CNGA 120408 CBN', nose: .8, grade: 'cbn', use: 'Закалённая сталь; режим только по паспорту пластины', group: 'H' },
    ceramic: { code: 'CNGA 120408 CERAMIC', nose: .8, grade: 'ceramic', use: 'Закалённые стали/чугун, стабильный непрерывный рез', group: 'H/K' }
  };

  const MACHINES = {
    st10: { name: 'Haas ST-10', maxRpm: 6000, maxD: 356, maxZ: 356, chuck: 165, holder: 18 },
    st20: { name: 'Haas ST-20', maxRpm: 4000, maxD: 330, maxZ: 572, chuck: 210, holder: 22 },
    st30: { name: 'Haas ST-30', maxRpm: 3400, maxD: 533, maxZ: 660, chuck: 254, holder: 25 },
    tl1: { name: 'Haas TL-1', maxRpm: 1800, maxD: 406, maxZ: 762, chuck: 203, holder: 25 },
    custom: { name: 'Другой токарный станок', maxRpm: 2500, maxD: 300, maxZ: 500, chuck: 200, holder: 25 }
  };

  function defaultExtraOps() {
    return {
      odGroove: { enabled: false, z: 22, width: 5, finalD: 26, peck: 1, step: 2 },
      idGroove: { enabled: false, z: 22, width: 5, finalD: 34, peck: .8, step: 2 },
      faceGroove: { enabled: false, startD: 22, endD: 42, depth: 5, peck: .8, step: 2 },
      drill: { enabled: false, cycle: 'G83', diameter: 12, depth: 50, peck: 5 },
      idThread: { enabled: false, d: 30, pitch: 1.5, length: 25 }
    };
  }

  function initProState() {
    state.features = Array.isArray(state.features) ? state.features : [];
    state.ocrFeatures = Array.isArray(state.ocrFeatures) ? state.ocrFeatures : [];
    state.extraOps = state.extraOps || defaultExtraOps();
    state.post = state.post || 'haas';
    state.machineKey = state.machineKey || 'st20';
    state.machine = state.machine || { ...MACHINES[state.machineKey] };
    state.chuckD = state.chuckD || state.machine.chuck;
    state.jawGrip = state.jawGrip || 25;
    state.holderReach = state.holderReach || state.machine.holder;
    state.holderHeight = state.holderHeight || 25;
    state.insertKey = state.insertKey || 'cnmg08';
    state.sphereTolerance = state.sphereTolerance || .04;
    syncFeatures();
  }

  function syncFeatures() {
    const n = Math.max(0, state.segments.length - 1);
    while (state.features.length < n) state.features.push({ type: 'sharp', value: 0, axial: 6 });
    state.features = state.features.slice(0, n);
  }

  presets.grooved = { operation: 'external', segments: [{ d: 30, l: 45 }, { d: 44, l: 35 }], radius: 1.5, bore: { preD: 14, finalD: 20, depth: 45, through: false }, thread: { enabled: false, d: 30, pitch: 2, length: 30 } };
  presets.borethread = { operation: 'both', segments: [{ d: 48, l: 55 }], radius: 0, bore: { preD: 26, finalD: 27, depth: 52, through: true }, thread: { enabled: false, d: 48, pitch: 2, length: 30 } };
  presets.spherical = { operation: 'external', segments: [{ d: 6, l: 18.5 }, { d: 40, l: 30 }], radius: 0, bore: { preD: 12, finalD: 18, depth: 30, through: false }, thread: { enabled: false, d: 40, pitch: 2, length: 20 } };

  const coreApplyPreset = applyPreset;
  applyPreset = function (key) {
    coreApplyPreset(key);
    state.features = [];
    state.extraOps = defaultExtraOps();
    if (key === 'shaft') state.features = [{ type: 'fillet', value: 3, axial: 6 }];
    if (key === 'flange') state.features = [{ type: 'fillet', value: 2, axial: 6 }];
    if (key === 'threaded' || key === 'fitting') state.features = [{ type: 'fillet', value: key === 'fitting' ? 1.5 : 2, axial: 5 }];
    if (key === 'grooved') state.extraOps.odGroove.enabled = true;
    if (key === 'borethread') {
      state.extraOps.idThread.enabled = true;
      state.extraOps.idThread.d = 30;
      state.extraOps.idThread.pitch = 1.5;
      state.extraOps.idThread.length = 25;
    }
    if (key === 'spherical') state.features = [{ type: 'sphere', value: 20, axial: 18.5 }];
    syncFeatures();
  };

  function loadScriptOnce(src, globalName) {
    if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
      const found = document.querySelector(`script[data-local-src="${src}"]`);
      if (found) { found.addEventListener('load', () => resolve(window[globalName])); found.addEventListener('error', reject); return; }
      const s = document.createElement('script');
      s.src = src;
      s.dataset.localSrc = src;
      s.onload = () => resolve(globalName ? window[globalName] : true);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function showOcrConfidence(confidence, words) {
    const value = Math.max(0, Math.min(100, Math.round(confidence || 0)));
    $('#ocrConfidence').style.display = 'block';
    $('#ocrScoreRing').style.setProperty('--score', value + '%');
    $('#ocrScoreRing').dataset.score = value + '%';
    $('#ocrConfidenceBar').style.width = value + '%';
    $('#ocrConfidenceText').textContent = value < 70 ? 'Низкая уверенность: обязательно проверьте выделенные фрагменты.' : value < 88 ? 'Проверьте обозначения Ø, R, C, SR и десятичные знаки.' : 'Текст распознан уверенно, но размеры всё равно сверяются оператором.';
    $('#ocrTokens').innerHTML = (words || []).filter(w => String(w.text || '').trim()).slice(0, 28).map(w => `<span class="token ${(w.confidence || 0) < 70 ? 'low' : 'good'}" title="${Math.round(w.confidence || 0)}%">${esc(w.text)}</span>`).join('');
  }

  tryBrowserOcr = async function (file) {
    $('#ocrMode').textContent = 'OCR загружается…';
    $('#fileResultText').textContent = 'Подготовка локальных моделей';
    $('#fileResult').style.display = 'block';
    try {
      await loadScriptOnce('./vendor/ocr/tesseract.min.js', 'Tesseract');
      const worker = await Tesseract.createWorker('rus+eng', 1, {
        workerPath: './vendor/ocr/worker.min.js',
        corePath: './vendor/ocr/core',
        langPath: './vendor/tessdata',
        logger: m => {
          if (m.status === 'recognizing text') {
            const pct = Math.round((m.progress || 0) * 100);
            $('#ocrMode').textContent = `OCR ${pct}%`;
            $('#fileResultText').textContent = `Распознавание на устройстве: ${pct}%`;
          }
        }
      });
      await worker.setParameters({
        preserve_interword_spaces: '1',
        // Кириллические О Д М С Р и знаки ± ° ( ) / обязаны быть в списке: whitelist только
        // запрещает символы, поэтому без них ± подавляется и Ø30±0.1 склеивается в Ø300.1,
        // а метрическая резьба М24×1,5 кириллицей не распознаётся вовсе.
        tessedit_char_whitelist: '0123456789.,-+±°/()xXхХ×Ø⌀OОDДMМRLCHSRTФАСГАЛТЕЛЬСКРУГЛЕНИЕHRC '
      });
      const result = await worker.recognize(file);
      await worker.terminate();
      const text = String(result.data.text || '').replace(/\s+/g, ' ').trim();
      $('#ocrText').value = text;
      $('#ocrMode').textContent = 'Tesseract · офлайн';
      $('#fileResultText').textContent = text ? 'Текст распознан локально — проверьте сомнительные фрагменты' : 'Текст не найден — обрежьте фото до выносок или введите размеры';
      showOcrConfidence(result.data.confidence, result.data.words || []);
    } catch (err) {
      if ('TextDetector' in window) {
        try {
          const bmp = await createImageBitmap(file), detector = new TextDetector(), blocks = await detector.detect(bmp);
          $('#ocrText').value = blocks.map(x => x.rawValue).join(' ');
          $('#ocrMode').textContent = 'Системный OCR';
          $('#fileResultText').textContent = `Найдено фрагментов: ${blocks.length}`;
          return;
        } catch (_) { }
      }
      $('#ocrMode').textContent = 'Ручная проверка';
      $('#fileResultText').textContent = 'OCR не запустился — введите видимые обозначения строкой';
    }
  };

  importPdf = async function (file) {
    $('#ocrMode').textContent = 'PDF · локально';
    $('#fileResult').style.display = 'block';
    try {
      await loadScriptOnce('./vendor/pdf/pdf.min.js', 'pdfjsLib');
      pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf/pdf.worker.min.js';
      const data = new Uint8Array(await file.arrayBuffer());
      // isEvalSupported:false — смягчение CVE-2024-4367 (специально собранный шрифт исполняет
      // произвольный JS при рендере). Вендорная копия pdf.js — 3.11.174, уязвимая; обновление
      // vendor/pdf/* до >= 4.2.67 остаётся обязательным, этот флаг его не заменяет.
      const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2.4 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      $('#preview').src = URL.createObjectURL(blob); $('#preview').classList.add('on');

      // Экспорт из КОМПАС или SolidWorks несёт размеры точным текстовым слоем. Растеризовать его
      // и распознавать картинку — значит добровольно превращать точные данные в задачу OCR.
      // Поэтому сначала текстовый слой, и только при его отсутствии — растр.
      let layer = '';
      try {
        const content = await page.getTextContent();
        layer = content.items.map(x => x.str).join(' ').replace(/\s+/g, ' ').trim();
      } catch (_) { }
      if (/\d/.test(layer)) {
        $('#ocrText').value = layer;
        $('#ocrMode').textContent = 'PDF · текстовый слой';
        $('#fileResultText').textContent = `PDF: размеры взяты из текстового слоя страницы 1 из ${pdf.numPages} — распознавание не потребовалось`;
        return;
      }
      $('#fileResultText').textContent = `PDF без текстового слоя: распознаётся страница 1 из ${pdf.numPages}`;
      await tryBrowserOcr(blob);
    } catch (err) {
      $('#ocrMode').textContent = 'PDF · ошибка';
      $('#fileResultText').textContent = 'Не удалось отрисовать PDF — сохраните нужный фрагмент как фото';
    }
  };

  // Приводит вывод OCR к каноничным символам. Возвращает обе строки: `keywords` сохраняет
  // русские слова (ФАСКА / ГАЛТЕЛЬ / СКРУГЛЕНИЕ), `norm` пригоден для числового разбора.
  // Без этого выноска С2×45° или Р3, набранная кириллицей — а именно так её и читает rus-модель —
  // не совпадает с /C/ и /R/ и теряется молча.
  function normalizeOcr(src) {
    const keywords = String(src || '').replace(/\s+/g, ' ').trim();
    const norm = keywords
      .replace(/(\d)\s*,\s*(\d)/g, '$1.$2')   // десятичная запятая, но не разделитель перечисления
      .replace(/[Фф](?=\s*\d)/g, 'Ø')         // самый частый вывод Tesseract для знака диаметра
      .replace(/[ОоOo](?=\s*\d)/g, 'Ø')       // перед размером O/О — это Ø, а не ноль
      .replace(/[Хх]/g, 'x')
      .replace(/[Сс](?=\s*\d)/g, 'C')
      .replace(/[Рр](?=\s*\d)/g, 'R')
      .replace(/[Мм](?=\s*\d)/g, 'M')
      .replace(/[Дд](?=\s*\d)/g, 'D');
    return { keywords, norm };
  }

  // Ø с необязательным полем допуска: h6 / H7 / js6 / ±0.1 / +0.2/-0.1.
  // Допуск обязан быть съеден одним матчем, иначе "Ø30±0.1" разбирается как диаметр 300.1.
  // Буквенное поле пишется слитно с размером (ГОСТ 25346), поэтому пробел перед ним запрещён —
  // иначе "Ø45 L60" даёт допуск "L60" и съедает длину.
  // Кроме Ø принимается D в начале слова: так диаметр набирают руками в строке OCR
  // (кириллическая Д приводится к D в normalizeOcr).
  const RE_DIA = /(?:[Ø⌀]|\bD)\s*(\d+(?:\.\d+)?)((?:[a-km-zA-KM-Z][sS]?\d{1,2})|(?:\s*±\s*\d+(?:\.\d+)?)|(?:\s*[+\-]\s*\d+(?:\.\d+)?\s*\/\s*[+\-]\s*\d+(?:\.\d+)?))?/g;

  function parseEnhancedOcr() {
    if (state.freePoints) { go(3); return; }
    const { keywords, norm } = normalizeOcr($('#ocrText').value);

    const dias = [...norm.matchAll(RE_DIA)].map(m => ({ d: +m[1], tol: (m[2] || '').trim() || null, raw: m[0].trim() }));
    const thread = norm.match(/M\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    const hard = norm.match(/HRC\s*(\d+(?:\.\d+)?)/i);

    const features = [];
    // Ведущий разделитель обязателен: без него C из "HRC 32" читается как фаска C32.
    for (const m of keywords.matchAll(/(?:^|[^0-9A-Za-zА-Яа-яЁё])(?:C|С|ФАС(?:КА|КИ)?)\s*(\d+(?:[.,]\d+)?)\s*(?:[xXхХ×]\s*(\d{1,2}))?/gi)) {
      const v = +String(m[1]).replace(',', '.'), ang = +m[2];
      features.push({ type: 'chamfer', value: v, axial: v, angle: ang > 5 && ang < 85 ? ang : 45, raw: m[0].trim() });
    }
    for (const m of norm.matchAll(/SR\s*(\d+(?:\.\d+)?)/gi)) features.push({ type: 'sphere', value: +m[1], axial: +m[1], raw: m[0].trim() });
    for (const m of norm.matchAll(/S\s*[Ø⌀]\s*(\d+(?:\.\d+)?)/gi)) features.push({ type: 'sphere', value: +m[1] / 2, axial: +m[1] / 2, raw: m[0].trim() });
    const withoutSphere = norm.replace(/SR\s*\d+(?:\.\d+)?/gi, ' ').replace(/S\s*[Ø⌀]\s*\d+(?:\.\d+)?/gi, ' ');
    for (const m of withoutSphere.matchAll(/(?:^|[^0-9A-Za-zА-Яа-яЁё])R\s*(\d+(?:\.\d+)?)/gi)) features.push({ type: /ГАЛТЕЛ/i.test(keywords) ? 'fillet' : 'round', value: +m[1], axial: +m[1] * 1.2, raw: m[0].trim() });

    // Линейные размеры. По ГОСТ 2.307 они печатаются голыми числами — буквы L на чертеже нет,
    // поэтому кандидатами считается всё, что осталось после вычёркивания опознанных обозначений.
    let rest = norm;
    for (const re of [RE_DIA, /M\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?/gi, /HRC\s*\d+(?:\.\d+)?/gi,
                      /SR\s*\d+(?:\.\d+)?/gi, /S\s*[Ø⌀]\s*\d+(?:\.\d+)?/gi,
                      /[CR]\s*\d+(?:\.\d+)?(?:\s*[x×]\s*45)?/gi, /\b1\s*:\s*\d+/g]) rest = rest.replace(re, ' ');
    const explicitL = [...norm.matchAll(/(?:^|\s)L\s*(\d+(?:\.\d+)?)/gi)].map(m => +m[1]);
    const bareL = [...rest.matchAll(/(?:^|\s)(\d+(?:\.\d+)?)(?=\s|$)/g)].map(m => +m[1]).filter(v => v > 0 && v < 5000);
    const ls = explicitL.length ? explicitL : bareL;

    if (dias.length) {
      let outer = dias.slice();
      if (hasBore() && dias.length > 1) {
        const boreAt = outer.reduce((best, x, i) => x.d < outer[best].d ? i : best, 0);
        state.bore.finalD = outer[boreAt].d; state.bore.preD = Math.max(2, outer[boreAt].d - 4);
        state.bore.tol = outer[boreAt].tol;
        outer.splice(boreAt, 1);
      }
      if (outer.length) {
        outer = outer.slice(0, 8);
        // Привязка длины к ступени по индексу верна только когда длин ровно столько же, сколько
        // ступеней. OCR отдаёт токены в порядке растрового чтения, а не вдоль оси Z, поэтому при
        // любом другом соотношении числа уходят в пул кандидатов, а поля остаются пустыми:
        // geometryIssue() не пустит дальше, пока оператор не проставит их с чертежа.
        // Прежний литерал `|| 40` выдавал придуманное число, неотличимое от прочитанного.
        const paired = ls.length === outer.length;
        state.segments = outer.map((x, i) => ({ d: x.d, l: paired ? ls[i] : null, tol: x.tol }));
        state.ocrLengths = paired ? [] : ls.slice();
        // Сортировки по возрастанию Ø здесь нет намеренно: она молча переставляла ступени вдоль Z
        // и глушила geometryIssue(), которая как раз обязана сказать «одним G71 Type I не точится».
      }
    }
    // Ни одного диаметра — значит state.segments остались от applyPreset(). Раньше go(3)
    // выполнялся молча и оператор видел числа шаблона как распознанные.
    state.dimsFromPreset = !dias.length;
    if (state.dimsFromPreset) toast('Ни одного диаметра не распознано — на следующем шаге показаны числа шаблона, а не чертежа');
    state.ocrFeatures = features;
    // Без единого диаметра привязывать длины не к чему, а всё найденное — почти наверняка мусор
    // из основной надписи (номер ГОСТ, марка стали, масштаб). Пул в этом случае не показываем.
    if (!dias.length) state.ocrLengths = [];
    state.features = [];
    syncFeatures();
    if (features.length === 1 && state.features.length === 1) state.features[0] = { ...features[0] };
    if (thread) { state.thread.enabled = true; state.thread.d = +thread[1]; state.thread.pitch = +thread[2]; }
    if (hard) state.hrc = +hard[1];
    go(3);
  }

  // Сброс результатов предыдущего чертежа. Раньше freePoints обнулялся только в applyPreset(),
  // то есть по клику на шаблон, поэтому связка «DXF, потом фото» молча выбрасывала фотографию
  // на строке `if (state.freePoints) { go(3); return; }` и работала по профилю из DXF.
  function resetRecognition() {
    state.freePoints = null;
    state.ocrFeatures = [];
    state.ocrLengths = [];
    state.dimsFromPreset = false;
    if ($('#ocrConfidence')) $('#ocrConfidence').style.display = 'none';
    if ($('#ocrTokens')) $('#ocrTokens').innerHTML = '';
  }

  // pointsToSegments (generator.html:228) при неудаче возвращает выдуманную деталь
  // [{d:30,l:40},{d:45,l:60}] — причём оператору уже показано «DXF · профиль, импортировано
  // точек N». Перехватываем: пустой результат должен оставаться пустым.
  const corePointsToSegments = pointsToSegments;
  pointsToSegments = function (pts) {
    const a = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const l = Math.abs(pts[i + 1].z - pts[i].z);
      if (l > .01) a.push({ d: Math.max(pts[i].x, .1), l });
    }
    return a.slice(0, 8);
  };

  const coreImportDxf = importDxf;
  importDxf = async function (file) {
    await coreImportDxf(file);
    if (state.freePoints && !state.segments.length) {
      state.freePoints = null;
      $('#ocrMode').textContent = 'DXF · профиль не собран';
      $('#fileResultText').textContent = 'Точки прочитаны, но участков контура из них не вышло. Подставлять типовую деталь вместо чертежа нельзя — введите размеры вручную или загрузите другой файл.';
      toast('Из DXF не собрался контур — деталь не подставлена');
    }
  };

  const coreFileChange = $('#fileInput').onchange;
  $('#fileInput').onchange = async e => { if (e.target.files && e.target.files[0]) resetRecognition(); return coreFileChange.call($('#fileInput'), e); };

  $('#parseBtn').onclick = parseEnhancedOcr;
  $$('[data-ocr-example]').forEach(b => b.onclick = () => { $('#ocrText').value = b.dataset.ocrExample; $('#ocrMode').textContent = 'Пример формы'; toast('Пример перенесён в строку OCR'); });
  $('#demoOcr').onclick = () => { $('#ocrText').value = 'Ø30 L40 Ø45 L60 C2x45 R3 HRC 32'; $('#ocrMode').textContent = 'Демо'; toast('Добавлены ступени, фаска, радиус и HRC'); };

  function featureLabel(type) {
    return ({ sharp: 'Переход без фаски', chamfer: 'Фаска C×45°', fillet: 'Галтель R', round: 'Скругление R', sphere: 'Сферический участок SR' })[type] || type;
  }

  // Числа, прочитанные с чертежа, но не привязанные к ступеням: показываем их списком, чтобы
  // оператор не перечитывал чертёж заново. Привязку делает он сам — автоматически привязать
  // их нельзя, порядок токенов OCR не совпадает с порядком поверхностей вдоль оси.
  function renderLoosePool() {
    const pool = state.ocrLengths || [];
    if (!pool.length) return '';
    return `<div class="card feature-card"><div class="eyebrow">Линейные размеры с чертежа — не привязаны</div><div class="tokens">${pool.map(v => `<span class="token">${num(v)}</span>`).join('')}</div><div class="compact-note" style="margin-top:8px">Числа прочитаны, но какой ступени принадлежит каждое — с фотографии не определяется. Проставьте длины по чертежу; поля с пустой длиной дальше не пропускаются.</div></div>`;
  }

  // Показывает, по какому размеру пойдёт резец при указанном поле допуска.
  // Оператор должен видеть и номинал с чертежа, и размер настройки — они разные.
  function tolNote(s) {
    if (!s || !s.tol) return '';
    const T = window.RazryadTolerance, p = T && T.parse(s.tol, +s.d || 0);
    if (!p) return `<div class="card warn" style="margin:0 0 2px"><div class="compact-note">Допуск <b style="color:var(--paper)">${esc(s.tol)}</b> с чертежа не разобран — точим по номиналу Ø${num(s.d)}. Проверьте предельные размеры сами.</div></div>`;
    const target = (+s.d || 0) + p.mid;
    return `<div class="compact-note">Допуск <b style="color:var(--paper)">${esc(s.tol)}</b>: ${num((+s.d || 0) + p.ei, 3)} … ${num((+s.d || 0) + p.es, 3)} мм. Точим в середину поля — <b style="color:var(--paper)">Ø${num(target, 3)}</b>. Номинал Ø${num(s.d)} остаётся размером чертежа.</div>`;
  }

  function renderRecognizedFeatures() {
    if (!state.ocrFeatures.length) return '';
    return `<div class="card feature-card"><div class="eyebrow">Найдено на фото</div><div class="tokens">${state.ocrFeatures.map((f, i) => `<span class="token">${esc(f.raw || featureLabel(f.type) + f.value)}</span>`).join('')}</div><div class="compact-note" style="margin-top:8px">Сверьте выноску на чертеже и назначьте форму нужному переходу ниже. Автоматическая привязка не выполняется.</div></div>`;
  }

  function transitionHtml(i) {
    const f = state.features[i] || { type: 'sharp', value: 0, axial: 6 };
    return `<div class="card feature-card"><div class="flabel"><span>Переход ${i + 1} → ${i + 2}</span><span>Ø${num(state.segments[i].d)} → Ø${num(state.segments[i + 1].d)}</span></div><div class="feature-row"><label class="fld"><span>Форма по выноске</span><select data-feature="${i}" data-fkey="type"><option value="sharp" ${f.type === 'sharp' ? 'selected' : ''}>Острая</option><option value="chamfer" ${f.type === 'chamfer' ? 'selected' : ''}>Фаска C×45°</option><option value="fillet" ${f.type === 'fillet' ? 'selected' : ''}>Галтель R</option><option value="round" ${f.type === 'round' ? 'selected' : ''}>Скругление R</option><option value="sphere" ${f.type === 'sphere' ? 'selected' : ''}>Сфера SR</option></select></label><label class="fld"><span>${f.type === 'chamfer' ? 'Размер C' : f.type === 'sphere' ? 'Радиус SR' : 'Радиус R'}</span><div class="unit"><input type="number" data-feature="${i}" data-fkey="value" value="${num(f.value || 0)}" step="0.1" ${f.type === 'sharp' ? 'disabled' : ''}><i>мм</i></div></label></div>${f.type === 'sphere' ? `<label class="fld" style="margin:0"><span>Длина сферического участка по Z</span><div class="unit"><input type="number" data-feature="${i}" data-fkey="axial" value="${num(f.axial || f.value)}" step="0.1"><i>мм</i></div></label>` : ''}${f.type === 'chamfer' ? `<label class="fld" style="margin:0"><span>Угол фаски к оси</span><div class="unit"><input type="number" data-feature="${i}" data-fkey="angle" value="${num(f.angle || 45)}" step="1" min="6" max="84"><i>град</i></div></label>` : ''}<div class="compact-note">${f.type === 'sphere' ? 'Сфера аппроксимируется короткими G01-хордами с контролем допуска — одинаково для Haas и Fanuc.' : f.type === 'chamfer' ? `Фаска строится явными координатами, без зависимости от C-кода стойки. При ${num(f.angle || 45)}° катет по X равен ${num(2 * (+f.value || 0) / Math.tan((+f.angle || 45) * Math.PI / 180), 3)} мм.` : 'R выводится в контуре цикла; проверьте направление дуги в GRAPHICS.'}</div></div>`;
  }

  function opCard(key, title, subtitle, body) {
    const op = state.extraOps[key];
    return `<div class="card op-card ${op.enabled ? 'enabled' : ''}"><div class="op-title"><input type="checkbox" data-op-toggle="${key}" ${op.enabled ? 'checked' : ''}><div><b>${title}</b><div class="compact-note">${subtitle}</div></div></div>${op.enabled ? `<div style="margin-top:11px">${body}</div>` : ''}</div>`;
  }

  renderDimensions = function () {
    syncFeatures();
    const names = { shaft: 'Ступень', bushing: 'Втулка', flange: 'Фланец', ring: 'Кольцо', threaded: 'Резьбовой участок', fitting: 'Штуцер', grooved: 'Вал с канавкой', borethread: 'Втулка', spherical: 'Сфера/шейка', free: 'Точка/участок' };
    const form = $('#dimensionForm');
    $$('#operationSeg button').forEach(b => b.classList.toggle('on', b.dataset.op === state.operation));
    let outer = (state.dimsFromPreset ? `<div class="card warn"><div class="notice"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2"><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5m0 3v.1"/></svg><div><b>С чертежа не прочитан ни один диаметр.</b><div class="muted">Значения ниже взяты из шаблона детали, а не с фотографии. Введите размеры по чертежу вручную — подтверждать шаблонные числа нельзя.</div></div></div></div>` : '') + renderLoosePool() + renderRecognizedFeatures();
    outer += state.segments.map((s, i) => `<div class="card"><div class="segment"><div class="segno">${i + 1}</div><div><div class="flabel"><span>${hasOuter() ? (names[state.template] || 'Участок') : 'Габарит заготовки'} ${i + 1}</span><span>${i === 0 ? 'у торца' : i === state.segments.length - 1 ? 'к патрону' : ''}</span></div><div class="two"><label class="fld"><span>Диаметр</span><div class="unit"><input type="number" data-seg="${i}" data-key="d" value="${num(s.d)}" step="0.1"><i>мм</i></div></label><label class="fld"><span>Длина${s.l == null ? ' · не найдена на чертеже' : ''}</span><div class="unit"><input type="number" data-seg="${i}" data-key="l" value="${s.l == null ? '' : num(s.l)}" placeholder="введите с чертежа" step="0.1"><i>мм</i></div></label></div>${tolNote(s)}</div></div></div>${hasOuter() && i < state.segments.length - 1 ? transitionHtml(i) : ''}`).join('');
    const bore = hasBore() ? `<div class="card subop"><div class="eyebrow">Расточка G71 / G70</div><div class="two"><label class="fld"><span>Исходное отверстие</span><div class="unit"><input type="number" data-bore="preD" value="${num(state.bore.preD)}" step="0.1"><i>⌀ мм</i></div></label><label class="fld"><span>Готовое отверстие</span><div class="unit"><input type="number" data-bore="finalD" value="${num(state.bore.finalD)}" step="0.1"><i>⌀ мм</i></div></label></div><div class="two"><label class="fld"><span>Глубина по Z</span><div class="unit"><input type="number" data-bore="depth" value="${num(state.bore.depth)}" step="0.1"><i>мм</i></div></label><label class="fld"><span>Дно отверстия</span><select id="boreKind"><option value="blind" ${state.bore.through ? '' : 'selected'}>Глухое</option><option value="through" ${state.bore.through ? 'selected' : ''}>Сквозное</option></select></label></div><div class="compact-note">Исходное отверстие должно быть готово до внутреннего G71. U в цикле расточки выводится со знаком минус.</div></div>` : '';
    const thread = `<div class="card"><div class="confirm"><input type="checkbox" id="threadEnabled" ${state.thread.enabled ? 'checked' : ''}><label for="threadEnabled"><b>Наружная резьба G76</b><br><span class="muted">Метрическая 60°, отдельный резьбовой инструмент.</span></label></div>${state.thread.enabled ? `<div style="margin-top:12px"><div class="two"><label class="fld"><span>Наружный ⌀</span><div class="unit"><input type="number" data-thread="d" value="${num(state.thread.d)}" step="0.1"><i>мм</i></div></label><label class="fld"><span>Шаг F</span><div class="unit"><input type="number" data-thread="pitch" value="${num(state.thread.pitch)}" step="0.1"><i>мм</i></div></label></div><label class="fld" style="margin:0"><span>Длина</span><div class="unit"><input type="number" data-thread="length" value="${num(state.thread.length)}" step="0.1"><i>мм</i></div></label></div>` : ''}</div>`;
    const ops = `<div class="eyebrow" style="margin-top:16px">Дополнительные операции</div>` +
      opCard('drill', 'Сверление по оси', 'G83 с полным выводом или скоростной G74', `<div class="two"><label class="fld"><span>Цикл</span><select data-extra="drill" data-xkey="cycle"><option value="G83" ${state.extraOps.drill.cycle === 'G83' ? 'selected' : ''}>G83 · глубокое</option><option value="G74" ${state.extraOps.drill.cycle === 'G74' ? 'selected' : ''}>G74 · скоростное</option></select></label><label class="fld"><span>Сверло</span><div class="unit"><input type="number" data-extra="drill" data-xkey="diameter" value="${num(state.extraOps.drill.diameter)}"><i>⌀ мм</i></div></label></div><div class="two"><label class="fld"><span>Глубина</span><div class="unit"><input type="number" data-extra="drill" data-xkey="depth" value="${num(state.extraOps.drill.depth)}"><i>мм</i></div></label><label class="fld"><span>Шаг врезания</span><div class="unit"><input type="number" data-extra="drill" data-xkey="peck" value="${num(state.extraOps.drill.peck)}"><i>мм</i></div></label></div>`) +
      opCard('odGroove', 'Наружная канавка G75', 'Одиночная или широкая канавка с дроблением', grooveFields('odGroove', 'Готовый ⌀')) +
      opCard('idGroove', 'Внутренняя канавка G75', 'Канавочный резец внутри отверстия', grooveFields('idGroove', 'Готовый ⌀')) +
      opCard('faceGroove', 'Торцевая канавка G74', 'Переход по X и врезание по Z', `<div class="two"><label class="fld"><span>Начальный ⌀</span><input type="number" data-extra="faceGroove" data-xkey="startD" value="${num(state.extraOps.faceGroove.startD)}"></label><label class="fld"><span>Конечный ⌀</span><input type="number" data-extra="faceGroove" data-xkey="endD" value="${num(state.extraOps.faceGroove.endD)}"></label></div><div class="two"><label class="fld"><span>Глубина Z</span><input type="number" data-extra="faceGroove" data-xkey="depth" value="${num(state.extraOps.faceGroove.depth)}"></label><label class="fld"><span>K · врезание</span><input type="number" data-extra="faceGroove" data-xkey="peck" value="${num(state.extraOps.faceGroove.peck)}"></label></div>`) +
      opCard('idThread', 'Внутренняя резьба G76', 'После сверления/расточки до внутреннего диаметра резьбы', `<div class="two"><label class="fld"><span>Номинальный ⌀ M</span><input type="number" data-extra="idThread" data-xkey="d" value="${num(state.extraOps.idThread.d)}"></label><label class="fld"><span>Шаг</span><input type="number" data-extra="idThread" data-xkey="pitch" value="${num(state.extraOps.idThread.pitch)}" step="0.1"></label></div><label class="fld" style="margin:0"><span>Длина резьбы</span><input type="number" data-extra="idThread" data-xkey="length" value="${num(state.extraOps.idThread.length)}"></label>`);
    form.innerHTML = outer + bore + thread + ops;
    $('#swapSegments').style.display = hasOuter() && state.segments.length > 1 ? 'block' : 'none';
    form.querySelectorAll('[data-seg]').forEach(inp => inp.oninput = () => { state.segments[+inp.dataset.seg][inp.dataset.key] = String(inp.value).trim() === '' ? null : Math.max(0, +inp.value || 0); syncFeatures(); dirtyDims(); });
    form.querySelectorAll('[data-bore]').forEach(inp => inp.oninput = () => { state.bore[inp.dataset.bore] = Math.max(0, +inp.value || 0); dirtyDims(); });
    form.querySelectorAll('[data-thread]').forEach(inp => inp.oninput = () => { state.thread[inp.dataset.thread] = Math.max(0, +inp.value || 0); dirtyDims(); });
    form.querySelectorAll('[data-feature]').forEach(inp => inp.onchange = inp.oninput = () => { const f = state.features[+inp.dataset.feature]; f[inp.dataset.fkey] = inp.dataset.fkey === 'type' ? inp.value : Math.max(0, +inp.value || 0); renderDimensions(); });
    form.querySelectorAll('[data-op-toggle]').forEach(inp => inp.onchange = () => { state.extraOps[inp.dataset.opToggle].enabled = inp.checked; renderDimensions(); });
    form.querySelectorAll('[data-extra]').forEach(inp => inp.oninput = inp.onchange = () => { const op = state.extraOps[inp.dataset.extra]; op[inp.dataset.xkey] = inp.tagName === 'SELECT' ? inp.value : Math.max(0, +inp.value || 0); dirtyDims(); });
    if ($('#boreKind')) $('#boreKind').onchange = e => { state.bore.through = e.target.value === 'through'; dirtyDims(); };
    $('#threadEnabled').onchange = e => { state.thread.enabled = e.target.checked; renderDimensions(); };
    dirtyDims();
  };

  function grooveFields(key, diameterLabel) {
    const op = state.extraOps[key];
    return `<div class="two"><label class="fld"><span>Положение от торца</span><div class="unit"><input type="number" data-extra="${key}" data-xkey="z" value="${num(op.z)}"><i>мм</i></div></label><label class="fld"><span>Ширина</span><div class="unit"><input type="number" data-extra="${key}" data-xkey="width" value="${num(op.width)}"><i>мм</i></div></label></div><div class="two"><label class="fld"><span>${diameterLabel}</span><div class="unit"><input type="number" data-extra="${key}" data-xkey="finalD" value="${num(op.finalD)}"><i>мм</i></div></label><label class="fld"><span>I · врезание</span><div class="unit"><input type="number" data-extra="${key}" data-xkey="peck" value="${num(op.peck)}"><i>мм</i></div></label></div>`;
  }

  $$('#operationSeg button').forEach(b => b.onclick = () => { state.operation = b.dataset.op; renderDimensions(); });
  $('#swapSegments').onclick = () => { state.segments.reverse(); state.features.reverse(); if (state.freePoints) state.freePoints.reverse(); renderDimensions(); toast('Порядок и переходы изменены'); };

  const coreGeometryIssue = geometryIssue;
  geometryIssue = function () {
    // Пустой контур базовая проверка пропускает: .some() на пустом массиве даёт false.
    if (!state.segments.length) return 'Контур пуст: ни одного участка не прочитано. Введите размеры с чертежа.';
    if (state.segments.some(s => s.l == null)) return 'У части участков не найдена длина. Проставьте её по чертежу — подставлять значение по умолчанию нельзя.';
    const savedRadius = state.radius; state.radius = 0;
    const base = coreGeometryIssue(); state.radius = savedRadius;
    if (base) return base;
    for (let i = 0; i < state.features.length; i++) {
      const f = state.features[i], a = state.segments[i], b = state.segments[i + 1];
      if (f.type === 'sharp') continue;
      if (!(f.value > 0)) return `Введите размер формы перехода ${i + 1}–${i + 2}.`;
      const radial = Math.abs(b.d - a.d) / 2;
      if (f.type === 'chamfer' && f.value > Math.min(radial, a.l)) return `Фаска C${num(f.value)} не помещается в переходе ${i + 1}–${i + 2}.`;
      if ((f.type === 'fillet' || f.type === 'round') && f.value > Math.min(radial, a.l / 2, b.l / 2)) return `R${num(f.value)} не помещается в переходе ${i + 1}–${i + 2}.`;
      if (f.type === 'sphere') {
        if (!(f.axial > 0) || f.axial > a.l) return `Длина сферы в переходе ${i + 1}–${i + 2} должна быть не больше ${num(a.l)} мм.`;
        const chord = Math.hypot(f.axial, radial);
        if (chord > 2 * f.value) return `SR${num(f.value)} слишком мал для хорды ${num(chord)} мм.`;
      }
    }
    const o = state.extraOps;
    if (o.drill.enabled && (o.drill.depth <= 0 || o.drill.peck <= 0)) return 'Для сверления введите глубину и шаг врезания.';
    if (o.odGroove.enabled && (o.odGroove.finalD <= 0 || o.odGroove.finalD >= maxD())) return 'Готовый диаметр наружной канавки должен быть меньше диаметра детали.';
    if (o.idGroove.enabled && (!hasBore() || o.idGroove.finalD <= state.bore.finalD)) return 'Для внутренней канавки нужна расточка, а диаметр канавки должен быть больше отверстия.';
    if (o.idThread.enabled) {
      if (!hasBore()) return 'Для внутренней резьбы включите расточку.';
      if (o.idThread.d <= state.bore.preD || o.idThread.length > state.bore.depth) return 'Проверьте диаметр и длину внутренней резьбы относительно отверстия.';
    }
    return '';
  };

  function minorArcSamples(p0, p1, radius, tolerance) {
    const a = { z: p0.z, r: p0.x / 2 }, b = { z: p1.z, r: p1.x / 2 };
    const dz = b.z - a.z, dr = b.r - a.r, chord = Math.hypot(dz, dr);
    if (!radius || chord <= 1e-6 || chord > 2 * radius) return [p1];
    const mid = { z: (a.z + b.z) / 2, r: (a.r + b.r) / 2 }, h = Math.sqrt(Math.max(0, radius * radius - chord * chord / 4));
    const centers = [{ z: mid.z - dr / chord * h, r: mid.r + dz / chord * h }, { z: mid.z + dr / chord * h, r: mid.r - dz / chord * h }];
    let best = null;
    for (const c of centers) {
      const aa = Math.atan2(a.r - c.r, a.z - c.z), ab = Math.atan2(b.r - c.r, b.z - c.z);
      let delta = ab - aa; while (delta > Math.PI) delta -= Math.PI * 2; while (delta < -Math.PI) delta += Math.PI * 2;
      const arcLen = Math.abs(delta * radius), maxStep = Math.max(.5, 2 * Math.sqrt(Math.max(.001, 2 * radius * tolerance - tolerance * tolerance))), n = Math.max(3, Math.min(32, Math.ceil(arcLen / maxStep)));
      const pts = [];
      for (let i = 1; i <= n; i++) { const q = aa + delta * i / n; pts.push({ z: c.z + radius * Math.cos(q), x: 2 * (c.r + radius * Math.sin(q)), sphere: true }); }
      let score = 0;
      for (let i = 0; i < pts.length; i++) {
        const prev = i ? pts[i - 1] : p0;
        if (b.x >= a.x && pts[i].x + .001 < prev.x) score += 100;
        if (b.z <= a.z && pts[i].z - .001 > prev.z) score += 100;
        score += Math.max(0, Math.min(a.x, b.x) - pts[i].x) + Math.max(0, pts[i].x - Math.max(a.x, b.x));
      }
      if (!best || score < best.score) best = { score, pts };
    }
    return best ? best.pts : [p1];
  }

  // Размер настройки: при указанном поле допуска точим в СЕРЕДИНУ поля, а не по номиналу.
  // Ø45h6 -> 44.992. Номинал остаётся в state.segments[i].d и показывается оператору как есть.
  function targetD(seg) {
    if (!seg) return 0;
    const nominal = +seg.d || 0;
    return window.RazryadTolerance ? window.RazryadTolerance.midTarget(nominal, seg.tol) : nominal;
  }

  // Угол фаски к оси в градусах. По умолчанию 45°; иное значение приходит с чертежа (C2×30°).
  function chamferAngle(f) {
    const a = +(f && f.angle);
    return a > 5 && a < 85 ? a : 45;
  }

  // Кадры-комментарии о полях допуска: оператор на стойке должен видеть, что контур построен
  // не по номиналу чертежа, а по середине поля, и какие предельные размеры он обязан выдержать.
  // Поле допуска в комментарий NC. ncText() здесь применять НЕЛЬЗЯ: он приводит строку к верхнему
  // регистру, а регистр в обозначении и есть смысл — h6 это вал, H6 это отверстие.
  function ncTol(s) {
    return String(s == null ? '' : s).replace(/±/g, '+/-').replace(/[^A-Za-z0-9+\-./]/g, '');
  }

  function tolComments() {
    const T = window.RazryadTolerance;
    if (!T) return [];
    const out = [];
    state.segments.forEach((s, i) => {
      if (!s.tol) return;
      const p = T.parse(s.tol, +s.d || 0), n = +s.d || 0;
      if (!p) { out.push(`(UCHASTOK ${i + 1} DIA ${num(n, 3)} DOPUSK ${ncTol(s.tol)} NE RAZOBRAN / TOCHIM PO NOMINALU)`); return; }
      out.push(`(UCHASTOK ${i + 1} DIA ${num(n, 3)} ${ncTol(s.tol)} = ${num(n + p.ei, 3)}..${num(n + p.es, 3)} / NASTROYKA ${num(n + p.mid, 3)})`);
    });
    if (state.bore && state.bore.tol && hasBore()) {
      const n = +state.bore.finalD || 0, p = T.parse(state.bore.tol, n);
      if (p) out.push(`(OTVERSTIE DIA ${num(n, 3)} ${ncTol(state.bore.tol)} = ${num(n + p.ei, 3)}..${num(n + p.es, 3)} / NASTROYKA ${num(n + p.mid, 3)})`);
    }
    if (out.length) out.push('(RAZMER NASTROYKI = SEREDINA POLYA DOPUSKA / PROVERIT PERVUYU DETAL)');
    return out;
  }

  function buildProfile() {
    if (state.freePoints && state.freePoints.length > 1) return state.freePoints.map(p => ({ x: +p.x, z: +p.z }));
    if (!state.segments.length) return [];
    syncFeatures();
    let z = 0;
    const pts = [{ x: targetD(state.segments[0]), z: 0 }];
    state.segments.forEach((seg, i) => {
      const cornerZ = z - +seg.l, next = state.segments[i + 1], f = state.features[i];
      const dSeg = targetD(seg), dNext = next ? targetD(next) : 0;
      if (!next) { pts.push({ x: dSeg, z: cornerZ }); z = cornerZ; return; }
      if (f && f.type === 'chamfer' && f.value > 0) {
        const c = Math.min(+f.value, +seg.l * .8, Math.abs(dNext - dSeg) / 2 * .8);
        // Катет по X зависит от угла фаски: при 45° это 2c, при 30° — 2c/tan(30°).
        const legX = 2 * c / Math.tan(chamferAngle(f) * Math.PI / 180);
        pts.push({ x: dSeg, z: cornerZ + c });
        pts.push({ x: dSeg + Math.sign(dNext - dSeg) * legX, z: cornerZ, chamfer: c });
        pts.push({ x: dNext, z: cornerZ });
      } else if (f && f.type === 'sphere' && f.value > 0) {
        const axial = Math.min(+f.axial || +f.value, +seg.l);
        const start = { x: dSeg, z: cornerZ + axial }, end = { x: dNext, z: cornerZ };
        pts.push(start);
        pts.push(...minorArcSamples(start, end, +f.value, state.sphereTolerance));
      } else {
        pts.push({ x: dSeg, z: cornerZ });
        pts.push({ x: dNext, z: cornerZ, corner: f && (f.type === 'fillet' || f.type === 'round') ? +f.value : 0, cornerType: f ? f.type : 'sharp' });
      }
      z = cornerZ;
    });
    return pts.filter((p, i, a) => !i || Math.abs(p.x - a[i - 1].x) > .0005 || Math.abs(p.z - a[i - 1].z) > .0005);
  }

  contourPoints = buildProfile;

  function renderProSetup() {
    const machine = MACHINES[state.machineKey] || MACHINES.custom, ins = INSERTS[state.insertKey] || INSERTS.cnmg08;
    $('#proSetup').innerHTML = `<div class="card"><div class="eyebrow">Пластина по ISO</div><label class="fld"><span>Типовая пластина</span><select id="insertCatalog">${Object.entries(INSERTS).map(([k, x]) => `<option value="${k}" ${k === state.insertKey ? 'selected' : ''}>${x.code}</option>`).join('')}</select></label><div class="compact-note" id="insertHelp"><b style="color:var(--paper)">${ins.group}</b> · ${ins.use}. Радиус ${ins.nose} мм подставится в поле вершины и должен совпадать с OFFSET.</div></div><div class="card"><div class="eyebrow">Стойка и постпроцессор</div><div class="two"><label class="fld"><span>Формат программы</span><select id="postSelect"><option value="haas" ${state.post === 'haas' ? 'selected' : ''}>Haas NGC / Classic</option><option value="fanuc" ${state.post === 'fanuc' ? 'selected' : ''}>Fanuc 0i · 2 блока</option></select></label><label class="fld"><span>Профиль станка</span><select id="machineSelect">${Object.entries(MACHINES).map(([k, x]) => `<option value="${k}" ${k === state.machineKey ? 'selected' : ''}>${x.name}</option>`).join('')}</select></label></div><div class="compact-note">Fanuc G71/G76 выводится в двухблочном формате. Передача между стойками без проверки руководства конкретной модели запрещена.</div></div><div class="card"><div class="eyebrow">Патрон и державка · модель коллизий</div><div class="two"><label class="fld"><span>Наружный ⌀ кулачков</span><div class="unit"><input id="chuckD" type="number" value="${num(state.chuckD)}"><i>мм</i></div></label><label class="fld"><span>Длина зажима</span><div class="unit"><input id="jawGrip" type="number" value="${num(state.jawGrip)}"><i>мм</i></div></label></div><div class="two"><label class="fld"><span>Вылет тела державки</span><div class="unit"><input id="holderReach" type="number" value="${num(state.holderReach)}"><i>мм</i></div></label><label class="fld"><span>Высота державки</span><div class="unit"><input id="holderHeight" type="number" value="${num(state.holderHeight)}"><i>мм</i></div></label></div><div class="compact-note">Проверяется осевой зазор детали и корпуса державки до кулачков, рабочий диаметр и ход Z профиля станка.</div></div><div class="card subop"><div class="eyebrow">Инструменты дополнительных операций</div><div class="two"><label class="fld"><span>Канавочный</span><input id="grooveTool" value="${state.grooveTool || 'T0404'}" maxlength="5"></label><label class="fld"><span>Сверло</span><input id="drillTool" value="${state.drillTool || 'T0505'}" maxlength="5"></label></div><label class="fld" style="margin:0"><span>Внутренняя резьба</span><input id="idThreadTool" value="${state.idThreadTool || 'T0606'}" maxlength="5"></label></div>`;
    $('#insertCatalog').onchange = e => { state.insertKey = e.target.value; const x = INSERTS[state.insertKey]; state.insertGrade = x.grade; $('#insertGrade').value = x.grade; $('#nose').value = String(x.nose); $('#insertHelp').innerHTML = `<b style="color:var(--paper)">${x.group}</b> · ${x.use}. Радиус ${x.nose} мм подставлен; сверьте OFFSET.`; };
    $('#postSelect').onchange = e => state.post = e.target.value;
    $('#machineSelect').onchange = e => { state.machineKey = e.target.value; state.machine = { ...MACHINES[state.machineKey] }; state.chuckD = state.machine.chuck; state.holderReach = state.machine.holder; $('#chuckD').value = state.chuckD; $('#holderReach').value = state.holderReach; $('#maxRpm').value = Math.min(+$('#maxRpm').value || state.machine.maxRpm, state.machine.maxRpm); };
  }

  const coreRenderMaterials = renderMaterials;
  renderMaterials = function () { coreRenderMaterials(); renderProSetup(); };
  const coreReadSetup = readSetup;
  readSetup = function () {
    coreReadSetup();
    const val = id => $('#' + id) ? $('#' + id).value : '';
    state.post = val('postSelect') || state.post || 'haas';
    state.machineKey = val('machineSelect') || state.machineKey || 'st20';
    state.machine = { ...(MACHINES[state.machineKey] || MACHINES.custom) };
    state.insertKey = val('insertCatalog') || state.insertKey || 'cnmg08';
    state.chuckD = +val('chuckD') || state.machine.chuck;
    state.jawGrip = +val('jawGrip') || 25;
    state.holderReach = +val('holderReach') || state.machine.holder;
    state.holderHeight = +val('holderHeight') || 25;
    state.grooveTool = cleanTool(val('grooveTool'), 'T0404');
    state.drillTool = cleanTool(val('drillTool'), 'T0505');
    state.idThreadTool = cleanTool(val('idThreadTool'), 'T0606');
    state.maxRpm = Math.min(state.maxRpm, state.machine.maxRpm);
  };

  function cleanTool(v, fallback) { return String(v || '').toUpperCase().replace(/[^T0-9]/g, '') || fallback; }
  function cycleG71(lines, p, q, depth, u, w, feed) {
    if (state.post === 'fanuc') lines.push(`G71 U${num(depth, 2)} R0.5`, `G71 P${p} Q${q} U${num(u, 2)} W${num(w, 2)} F${num(feed, 3)}`);
    else lines.push(`G71 P${p} Q${q} U${num(u, 2)} W${num(w, 2)} D${num(depth, 2)} F${num(feed, 3)}`);
  }

  function appendThread(lines, kind) {
    const o = kind === 'id' ? state.extraOps.idThread : state.thread, p = +o.pitch, h = .61343 * p, first = Math.max(.05, .15 * p), rpm = Math.min(800, state.threadRpm || state.rpm), internal = kind === 'id';
    const target = internal ? +o.d : +o.d - 1.22687 * p;
    const start = internal ? Math.max(state.bore.preD, +o.d - 1.3 * p) : +o.d + 2;
    lines.push(`(--- ${internal ? 'VNUTRENNYAYA' : 'NARUZHNAYA'} REZBA G76 ---)`, 'G28 U0. W0.', internal ? state.idThreadTool : state.threadTool, `(M${num(o.d, 2)} X ${num(p, 3)} / PROVERIT PROFIL I TABLITSU)`, `G97 S${Math.round(rpm)} M03`, `G00 X${num(start, 3)} Z2. M08`);
    if (state.post === 'fanuc') {
      lines.push(`G76 P011060 Q${Math.round(first * 1000)} R0.05`, `G76 X${num(target, 3)} Z-${num(o.length, 3)} P${Math.round(h * 1000)} Q${Math.round(first * 1000)} F${num(p, 3)}`);
    } else lines.push(`G76 X${num(target, 3)} Z-${num(o.length, 3)} K${num(h, 3)} D${num(first, 3)} A60 F${num(p, 3)} P1`);
    lines.push(`G00 X${num(internal ? Math.max(.5, start - 3) : o.d + 6, 2)} Z5. M09`);
  }

  function appendExtraOps(lines) {
    const o = state.extraOps, f = Math.max(.04, state.feed * .45);
    if (o.drill.enabled) {
      const rpm = Math.min(state.maxRpm, Math.round(1000 * Math.max(18, state.vc * .55) / (Math.PI * Math.max(1, o.drill.diameter))));
      lines.push(`(--- SVERLENIE ${o.drill.cycle} ---)`, 'G28 U0. W0.', state.drillTool, `(SVERLO DIA ${num(o.drill.diameter, 2)})`, `G97 S${rpm} M03`, 'G00 X0. Z2. M08');
      if (o.drill.cycle === 'G74') lines.push(`G74 Z-${num(o.drill.depth, 3)} K${num(o.drill.peck, 3)} F${num(f, 3)}`);
      else lines.push(`G83 Z-${num(o.drill.depth, 3)} Q${num(o.drill.peck, 3)} R1. F${num(f, 3)}`, 'G80');
      lines.push('G00 Z5. M09');
    }
    if (o.odGroove.enabled) {
      lines.push('(--- NARUZHNAYA KANAVKA G75 ---)', 'G28 U0. W0.', state.grooveTool, `G97 S${Math.round(Math.min(state.rpm, 900))} M03`, `G00 X${num(Math.max(state.stockD, maxD()) + 2, 2)} Z-${num(o.odGroove.z, 3)} M08`, `G75 X${num(o.odGroove.finalD, 3)} Z-${num(o.odGroove.z + o.odGroove.width, 3)} I${num(o.odGroove.peck, 3)} K${num(o.odGroove.step, 3)} F${num(f, 3)}`, 'G00 X' + num(state.stockD + 5, 2) + ' Z5. M09');
    }
    if (o.idGroove.enabled) {
      lines.push('(--- VNUTRENNYAYA KANAVKA G75 ---)', 'G28 U0. W0.', state.grooveTool, `G97 S${Math.round(Math.min(state.boreRpm, 800))} M03`, `G00 X${num(Math.max(.5, state.bore.finalD - 2), 2)} Z-${num(o.idGroove.z, 3)} M08`, `G75 X${num(o.idGroove.finalD, 3)} Z-${num(o.idGroove.z + o.idGroove.width, 3)} I${num(o.idGroove.peck, 3)} K${num(o.idGroove.step, 3)} F${num(f, 3)}`, 'G00 X' + num(Math.max(.5, state.bore.preD - 2), 2) + ' Z5. M09');
    }
    if (o.faceGroove.enabled) {
      lines.push('(--- TORTSEVAYA KANAVKA G74 ---)', 'G28 U0. W0.', state.grooveTool, `G97 S${Math.round(Math.min(state.rpm, 900))} M03`, `G00 X${num(o.faceGroove.startD, 2)} Z1. M08`, `G74 X${num(o.faceGroove.endD, 3)} Z-${num(o.faceGroove.depth, 3)} I${num(o.faceGroove.step, 3)} K${num(o.faceGroove.peck, 3)} F${num(f, 3)}`, 'G00 X' + num(state.stockD + 5, 2) + ' Z5. M09');
    }
    if (o.idThread.enabled) appendThread(lines, 'id');
  }

  generateGcode = function () {
    readSetup();
    const pts = buildProfile(), safeX = Math.max(state.stockD, maxD()) + 4;
    const lines = ['%', 'O' + state.programNo + ' (RAZRYAD FOTO-GCODE V0980)', '(PROVERIT GRAPHICS SINGLE BLOCK RAPID 5%)', `(POST ${state.post === 'haas' ? 'HAAS NGC' : 'FANUC 0I TWO BLOCK'})`, `(MACHINE ${ncText(state.machine.name)})`, '(MATERIAL ' + ncText(materials[state.material].name) + (materials[state.material].noHrc ? '' : ' HRC ' + state.hrc) + ')', ...tolComments(), 'G21 G18 G40 G80 G99'];
    if (hasOuter()) {
      const firstN = 100, startN = 110, q = startN + (pts.length - 1) * 10;
      lines.push('(--- NARUZHNAYA G71 G70 TYPE I ---)', 'G28 U0. W0.', state.tool + ' (NARUZHNY PRAVY REZEC)', `(INSERT ${ncText((INSERTS[state.insertKey] || INSERTS.cnmg08).code)} / NOSE R${num(state.nose, 1)})`, 'G50 S' + Math.round(state.maxRpm), 'G97 S' + Math.round(state.rpm) + ' M03', 'G00 X' + num(safeX, 1) + ' Z2. M08');
      cycleG71(lines, firstN, q, state.depth, .3, .1, state.feed);
      lines.push(`N${firstN} G00 G42 X${num(pts[0].x, 3)}`, `N${startN} G01 Z${num(pts[0].z, 3)} F${num(state.feed, 3)}`);
      pts.slice(1).forEach((p, j) => lines.push(`N${startN + (j + 1) * 10} G01 X${num(p.x, 3)} Z${num(p.z, 3)}${p.corner > 0 ? ' R' + num(p.corner, 3) : ''} F${num(state.feed, 3)}`));
      if (state.features.some(f => f.type === 'sphere')) lines.push('(SFERA SR RAZBITA NA KHORDY / PROVERIT PROFIL SHABLONOM)');
      lines.push(`G70 P${firstN} Q${q}`, 'G01 G40 X' + num(safeX, 1) + ' F' + num(state.feed, 3), 'G00 X' + num(safeX + 10, 1) + ' Z10. M09');
    }
    if (hasBore()) {
      const startX = Math.max(.5, state.bore.preD - 2), endX = Math.max(.2, state.bore.preD - 1), bd = Math.max(.2, state.depth * .65), bf = Math.max(.04, state.feed * .72);
      lines.push('(--- RASTOCHKA G71 ID / G70 TYPE I ---)', 'G28 U0. W0.', state.boreTool + ' (RASTOCHNOY REZEC)', `(ISKHODNOE OTV DIA ${num(state.bore.preD, 2)} / NOSE R${num(state.boreNose, 1)})`, 'G50 S' + Math.round(state.maxRpm), 'G97 S' + Math.round(state.boreRpm) + ' M03', 'G00 X' + num(startX, 2) + ' Z2. M08');
      cycleG71(lines, 200, 230, bd, -.2, .1, bf);
      lines.push('N200 G41 G00 X' + num(targetD({ d: state.bore.finalD, tol: state.bore.tol }), 3), 'N210 G01 Z0. F' + num(Math.max(.04, bf * .7), 3), 'N220 G01 Z-' + num(state.bore.depth, 3), 'N230 G01 G40 X' + num(endX, 3), 'G70 P200 Q230', 'G00 X' + num(startX, 2) + ' Z5. M09');
    }
    if (state.thread.enabled) appendThread(lines, 'od');
    appendExtraOps(lines);
    lines.push('G28 U0. W0.', 'M30', '%');
    return lines.join('\n');
  };

  const coreCheckSafety = checkSafety;
  checkSafety = function () {
    coreCheckSafety();
    const issues = [], warn = [], gap = state.stickout - totalL(), holderGap = gap - state.holderReach;
    if (maxD() > state.machine.maxD) issues.push(`Ø${num(maxD())} больше рабочего Ø ${state.machine.name}`);
    if (totalL() > state.machine.maxZ) issues.push(`контур длиннее хода Z ${state.machine.maxZ} мм`);
    if (state.maxRpm > state.machine.maxRpm) issues.push(`G50 выше лимита ${state.machine.maxRpm} об/мин`);
    if (holderGap < 3) issues.push(`корпус державки входит в зону кулачков на ${num(Math.abs(holderGap - 3), 1)} мм`);
    if (state.chuckD < state.stockD) issues.push('наружный диаметр кулачков меньше диаметра заготовки');
    if (state.jawGrip < Math.max(8, state.stockD * .12)) warn.push(`длина зажима ${num(state.jawGrip)} мм мала для Ø${num(state.stockD)}`);
    if (state.extraOps.drill.enabled && state.extraOps.drill.depth / Math.max(1, state.extraOps.drill.diameter) > 5) warn.push('сверление глубже 5D: контролируйте СОЖ и удаление стружки');
    if (state.extraOps.faceGroove.enabled && state.extraOps.faceGroove.endD <= state.extraOps.faceGroove.startD) issues.push('конечный Ø торцевой канавки должен быть больше начального');
    if (issues.length) {
      state.safe = false;
      $('#safetyStatus').className = 'status bad'; $('#safetyTitle').textContent = 'Найдена возможная коллизия';
      $('#safetyText').textContent = issues.join(' · ') + (warn.length ? ' · ' + warn.join(' · ') : ''); $('#safetyCard').className = 'card warn';
    } else if (warn.length) {
      $('#safetyTitle').textContent = 'Проверки пройдены · есть предупреждения';
      $('#safetyText').textContent += ' · ' + warn.join(' · ');
    }
  };

  const coreDrawSim = drawSim;
  drawSim = function (t = 1) {
    coreDrawSim(t);
    const c = $('#sim'), ctx = c.getContext('2d'), W = c.width, H = c.height;
    ctx.save();
    ctx.fillStyle = 'rgba(255,93,22,.16)'; ctx.fillRect(W - 145, 46, 35, H - 92);
    ctx.strokeStyle = '#ff7a3c'; ctx.setLineDash([6, 5]); ctx.strokeRect(W - 145, 46, 35, H - 92); ctx.setLineDash([]);
    ctx.fillStyle = '#ffb084'; ctx.font = '14px Consolas'; ctx.fillText('ЗОНА ДЕРЖАВКИ', W - 205, H - 18);
    const active = Object.entries(state.extraOps).filter(([, v]) => v.enabled).map(([k]) => ({ drill: 'G83/G74', odGroove: 'G75 OD', idGroove: 'G75 ID', faceGroove: 'G74 FACE', idThread: 'G76 ID' })[k]);
    if (active.length) { ctx.fillStyle = '#f2f2f4'; ctx.font = '15px Consolas'; ctx.fillText(active.join(' · '), 18, 26); }
    ctx.restore();
  };

  function historyLoad() { try { return JSON.parse(localStorage.getItem('razryad-gcode-history-v1') || '[]'); } catch (_) { return []; } }
  function historySave(items) { localStorage.setItem('razryad-gcode-history-v1', JSON.stringify(items.slice(0, 60))); }
  function snapshot(quality, note) {
    return { id: Date.now(), date: new Date().toISOString(), programNo: state.programNo, template: state.template, material: state.material, materialName: materials[state.material].name, hrc: state.hrc, insertKey: state.insertKey, insert: (INSERTS[state.insertKey] || INSERTS.cnmg08).code, machineKey: state.machineKey, machine: state.machine.name, post: state.post, vc: state.vc, feed: state.feed, depth: state.depth, rpm: state.rpm, quality: quality || 'generated', note: note || '', segments: state.segments, features: state.features, extraOps: state.extraOps, gcode: state.gcode };
  }
  function saveGeneratedSnapshot() { const h = historyLoad(); h.unshift(snapshot()); historySave(h); }
  function renderHistory() {
    const h = historyLoad();
    $('#historyList').innerHTML = h.length ? h.map(x => `<div class="history-item"><div class="flabel"><b>O${esc(x.programNo || '----')} · ${esc(x.materialName || '')}</b><span>${new Date(x.date).toLocaleDateString('ru-RU')}</span></div><div class="compact-note">${esc(x.machine || '')} · ${x.hrc ? x.hrc + ' HRC · ' : ''}Vc ${num(x.vc || 0)} · F ${num(x.feed || 0)} · ap ${num(x.depth || 0)} · ${esc(x.quality || 'generated')}</div>${x.note ? `<div class="compact-note" style="color:var(--paper);margin-top:5px">${esc(x.note)}</div>` : ''}<div class="history-actions"><button class="btn secondary mini" data-history-use="${x.id}">Режим</button><button class="btn secondary mini" data-history-copy="${x.id}">Копировать</button><button class="btn secondary mini" data-history-emulator="${x.id}">Эмулятор</button></div></div>`).join('') : '<div class="card"><div class="muted">История пока пуста.</div></div>';
    $$('[data-history-use]').forEach(b => b.onclick = () => { const x = historyLoad().find(i => i.id === +b.dataset.historyUse); if (!x) return; $('#vc').value = x.vc; $('#feed').value = x.feed; $('#depth').value = x.depth; calcRpm(); closeProModals(); toast('Цеховой режим применён'); });
    $$('[data-history-copy]').forEach(b => b.onclick = async () => { const x = historyLoad().find(i => i.id === +b.dataset.historyCopy); if (!x) return; try { await navigator.clipboard.writeText(x.gcode || ''); toast('G-код из истории скопирован'); } catch (_) { toast('Не удалось скопировать'); } });
    $$('[data-history-emulator]').forEach(b => b.onclick = () => { const x = historyLoad().find(i => i.id === +b.dataset.historyEmulator); if (!x || !x.gcode) return toast('В записи нет G-кода'); window.RazryadEmulator.open(x.gcode,{title:`O${x.programNo||'----'} · история`,source:'История программ'}); });
  }
  function closeProModals() { $$('#historyModal,#resultModal').forEach(m => m.classList.remove('on')); }
  $$('[data-close-pro]').forEach(b => b.onclick = closeProModals);
  $$('#historyModal,#resultModal').forEach(m => m.onclick = e => { if (e.target === m) closeProModals(); });
  $('#openHistory').onclick = () => { renderHistory(); $('#historyModal').classList.add('on'); };
  $('#useShopMode').onclick = () => {
    const x = historyLoad().find(i => i.quality === 'good' && i.material === state.material && Math.abs((i.hrc || 0) - (state.hrc || 0)) <= 5 && i.machineKey === state.machineKey);
    if (!x) { toast('Для этой стали, HRC и станка удачного режима ещё нет'); return; }
    $('#vc').value = x.vc; $('#feed').value = x.feed; $('#depth').value = x.depth; calcRpm(); toast('Применён последний удачный режим');
  };
  $('#recordResult').onclick = () => { $('#actualFeed').value = state.feed || ''; $('#actualVc').value = state.vc || ''; $('#resultModal').classList.add('on'); };
  $('#saveResult').onclick = () => {
    const quality = $('#resultQuality').value, note = $('#resultNote').value.trim();
    state.feed = +$('#actualFeed').value || state.feed; state.vc = +$('#actualVc').value || state.vc;
    const h = historyLoad(); h.unshift(snapshot(quality, note)); historySave(h); closeProModals(); toast('Результат сохранён на устройстве');
  };
  $('#backupHistory').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, exported: new Date().toISOString(), items: historyLoad() }, null, 2)], { type: 'application/json' })); a.download = 'razryad-gcode-history.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 500); };
  $('#importHistory').onclick = () => $('#historyFile').click();
  $('#historyFile').onchange = async e => { try { const data = JSON.parse(await e.target.files[0].text()), incoming = Array.isArray(data) ? data : data.items; if (!Array.isArray(incoming)) throw new Error(); const merged = [...incoming, ...historyLoad()].filter((x, i, a) => i === a.findIndex(y => y.id === x.id)); historySave(merged); renderHistory(); toast('История импортирована'); } catch (_) { toast('Файл истории не распознан'); } };
  $('#clearHistory').onclick = () => { if (!confirm('Очистить локальную историю программ и режимов?')) return; localStorage.removeItem('razryad-gcode-history-v1'); renderHistory(); toast('История очищена'); };
  $('#showQr').onclick = () => {
    const box = $('#qrArea'); box.style.display = box.style.display === 'none' ? 'block' : 'none'; if (box.style.display === 'none') return;
    const payload = JSON.stringify({ app: 'RAZRYAD', o: state.programNo, m: materials[state.material].name, h: materials[state.material].noHrc ? null : state.hrc, vc: state.vc, f: state.feed, ap: state.depth, s: state.rpm, t: state.tool, p: state.post });
    try { const qr = qrcode(0, 'M'); qr.addData(payload); qr.make(); $('#qrBox').innerHTML = qr.createImgTag(4, 8, 'QR карточка наладки'); } catch (_) { $('#qrBox').textContent = payload; }
  };

  const generateButton = $('#generateBtn');
  generateButton.addEventListener('click', () => { $('#postTag').textContent = `${state.post === 'haas' ? 'HAAS' : 'FANUC 0i'} · G71/G70/G74/G75/G76/G83`; saveGeneratedSnapshot(); });

  initProState();
  renderProSetup();
})();
