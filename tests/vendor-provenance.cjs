/* Провенанс вендорных библиотек.
   Сборки в проекте нет: файлы кладутся в vendor/ руками, и версия в package.json
   ничего не доказывает. Когда выходит очередная CVE в pdf.js, надо уметь ответить,
   что именно стоит в APK у оператора. Этот набор сверяет фактическое содержимое
   репозитория с записанным провенансом. */
const fs=require('fs'),cr=require('crypto');
let n=0;
const assert=(v,m)=>{n++;if(!v)throw new Error(m)};

const man=JSON.parse(fs.readFileSync('vendor/PROVENANCE.json','utf8'));
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=d+'/'+e.name;return e.isDirectory()?walk(p):[p]});
const onDisk=walk('vendor').filter(p=>!/PROVENANCE\.json$/.test(p)).sort();

assert(Array.isArray(man.files)&&man.files.length>0,'манифест провенанса пуст');

/* Ни одного нового файла без записи и ни одной записи без файла. */
{
 const listed=new Set(man.files.map(f=>f.path.replace(/\\/g,'/')));
 const missing=onDisk.filter(p=>!listed.has(p));
 assert(!missing.length,'в vendor/ появились файлы без записи о происхождении: '+missing.join(', '));
 const gone=[...listed].filter(p=>!onDisk.includes(p));
 assert(!gone.length,'в манифесте числятся отсутствующие файлы: '+gone.join(', '));
}

/* Содержимое совпадает с записанным: подмена или тихое обновление будут видны. */
for(const f of man.files){
 const buf=fs.readFileSync(f.path);
 const sha=cr.createHash('sha256').update(buf).digest('hex');
 assert(sha===f.sha256,`${f.path}: содержимое не совпадает с манифестом (ожидалось ${f.sha256.slice(0,12)}, на диске ${sha.slice(0,12)}). Обновили библиотеку — обновите vendor/PROVENANCE.json.`);
 assert(buf.length===f.bytes,`${f.path}: размер не совпадает с манифестом`);
 assert(f.package&&f.package!=='?','у '+f.path+' не указан пакет');
 assert(f.version&&f.version!=='?','у '+f.path+' не указана версия');
 assert(f.license&&f.license!=='?','у '+f.path+' не указана лицензия');
 assert(/^https:\/\//.test(f.source||''),'у '+f.path+' не указан источник загрузки');
}

/* Версии в манифесте не должны расходиться с package.json. */
{
 const pkg=JSON.parse(fs.readFileSync('package.json','utf8')).dependencies||{};
 for(const [name,ver] of Object.entries(pkg)){
  const rows=man.files.filter(f=>f.package===name);
  if(!rows.length)continue;
  for(const r of rows)
   assert(r.version===ver,`${r.path}: в манифесте версия ${r.version}, в package.json ${name}@${ver}`);
 }
}

/* Лицензионные уведомления должны существовать: tesseract.min.js ссылается на
   файл LICENSE.txt, которого в репозитории не было. */
{
 const notices=fs.readFileSync('THIRD-PARTY-NOTICES.md','utf8');
 for(const p of ['tesseract.js','pdfjs-dist','qrcode-generator','tessdata'])
  assert(notices.includes(p),`в THIRD-PARTY-NOTICES.md нет упоминания ${p}`);
 assert(/Apache License/i.test(notices)&&/MIT/.test(notices),'в уведомлениях не приведены тексты лицензий');
}

/* Известная незакрытая уязвимость должна быть записана, пока не обновлена библиотека. */
{
 const pdf=man.files.find(f=>f.path.endsWith('pdf.min.js'));
 if(pdf&&pdf.version==='3.11.174'){
  const notices=fs.readFileSync('THIRD-PARTY-NOTICES.md','utf8');
  assert(/CVE-2024-4367/.test(notices),'pdf.js остаётся уязвимой версии, но об этом нигде не записано');
  assert(/isEvalSupported/.test(fs.readFileSync('generator-pro.js','utf8')),'защита от CVE-2024-4367 не применена');
 }
}

console.log(`провенанс вендорных библиотек: OK (${n} проверок)`);
