/* Этап D — CI. Вынесен в отдельный набор и поставлен последним намеренно.
   Файл .github/workflows/tests.yml подготовлен и лежит в рабочем дереве, но добавить
   его в репозиторий может только тот, у кого есть право workflow. Пока он не добавлен,
   тесты не защищают ни один коммит, и этот набор об этом говорит — но не мешает
   отработать всем остальным. */
const fs=require('fs'),{execSync}=require('child_process');
let n=0;
const assert=(v,m)=>{n++;if(!v)throw new Error(m)};

assert(fs.existsSync('.github/workflows/tests.yml'),'подготовленный файл CI пропал из рабочего дерева');
const ci=fs.readFileSync('.github/workflows/tests.yml','utf8');
assert(/npm test/.test(ci),'CI не запускает тесты');
assert(/pull_request/.test(ci),'CI не срабатывает на pull request');
assert(/node --check/.test(ci),'CI не проверяет синтаксис скриптов');

const tracked=execSync('git ls-files .github/workflows',{encoding:'utf8'}).trim();
assert(tracked.includes('tests.yml'),
 'CI не добавлен в репозиторий: файл .github/workflows/tests.yml готов, но не закоммичен. '+
 'Добавьте его учётной записью с правом workflow — иначе прогон тестов остаётся ручным.');

console.log(`CI установлен: OK (${n} проверок)`);
