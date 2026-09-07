# Сторонние библиотеки в составе РАЗРЯД

Приложение работает без сети, поэтому все библиотеки лежат в репозитории — в каталоге
`vendor/`. Что именно там лежит, с какими контрольными суммами и откуда загружено,
записано в [`vendor/PROVENANCE.json`](vendor/PROVENANCE.json); соответствие проверяется
набором `tests/vendor-provenance.cjs` при каждом прогоне `npm test`.

| Компонент | Версия | Лицензия | Где используется |
|---|---|---|---|
| `tesseract.js` | 5.1.1 | Apache-2.0 | Офлайн-распознавание текста с фото чертежа и экрана стойки |
| `tesseract.js-core` | 5.1.1 | Apache-2.0 | Ядра WebAssembly для распознавания (обычное, SIMD, LSTM) |
| `tessdata_fast` (`rus`, `eng`) | 4.1.0 | Apache-2.0 | Языковые модели распознавания |
| `pdfjs-dist` | 3.11.174 | Apache-2.0 | Отрисовка первой страницы PDF-чертежа перед распознаванием |
| `qrcode-generator` | 1.4.4 | MIT | QR-код карточки наладки |

Шрифты Oswald, IBM Plex Sans и IBM Plex Mono подгружаются со шрифтового сервиса
Google Fonts и в репозитории не хранятся. Они распространяются по SIL Open Font
License 1.1. При работе без сети подставляются системные шрифты.

---

## Незакрытая уязвимость: pdf.js

Вендорная копия pdf.js — версии **3.11.174**, которая подвержена **CVE-2024-4367**:
специально собранный шрифт внутри PDF выполняет произвольный JavaScript при отрисовке
страницы. Чертежи приходят в цех почтой и мессенджерами, то есть файл здесь недоверенный.

Применена штатная защита: `getDocument` вызывается с `isEvalSupported: false`
(`generator-pro.js`). Без `eval` описанный в CVE механизм не срабатывает.

**Это не отменяет обновления.** Библиотека выпущена в 2023 году, уязвимость закрыта в
ветке 4.2.67, и оставаться на 3.x — временная мера. Обновление отложено по конкретной
причине: начиная с 4.x pdf.js поставляется только как ES-модуль (`pdf.min.mjs`),
классической сборки нет. Загрузчик придётся переписать на динамический `import()`, а
воркер — на модульный, и такую правку нельзя выкатывать без проверки в браузере на
реальном телефоне: маршрут «PDF → распознавание → размеры» ведёт к управляющей программе.

Порядок обновления, когда до него дойдут руки:

1. Скачать `pdf.min.mjs` и `pdf.worker.min.mjs` актуальной версии в `vendor/pdf/`.
2. Заменить `loadScriptOnce('./vendor/pdf/pdf.min.js', 'pdfjsLib')` на
   `await import('./vendor/pdf/pdf.min.mjs')`, а `workerSrc` — на `.mjs`.
3. Оставить `isEvalSupported: false`.
4. Обновить `vendor/PROVENANCE.json` (суммы пересчитываются) и `package.json`.
5. Проверить в браузере на Android: обычный PDF, PDF без текстового слоя, PDF на
   несколько страниц, работу в офлайне.

---

## Тексты лицензий

### Apache License 2.0

`tesseract.js`, `tesseract.js-core`, `tessdata_fast`, `pdfjs-dist`.

Licensed under the Apache License, Version 2.0 (the "License"); you may not use these
files except in compliance with the License. You may obtain a copy of the License at
<http://www.apache.org/licenses/LICENSE-2.0>.

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied. See the License for the specific language governing
permissions and limitations under the License.

Copyright 2023 Mozilla Foundation (pdf.js) · Copyright Tesseract.js contributors ·
Copyright Google Inc. and contributors (tessdata).

### MIT License

`qrcode-generator` — Copyright (c) 2009 Kazuhiko Arase.

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify,
merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be included in all copies
or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE
OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

«QR Code» — зарегистрированный товарный знак DENSO WAVE INCORPORATED.
