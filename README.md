# Unmatched Match Tracker

Веб-приложение для учёта матчей по настольной игре **Unmatched** с дашбордом
статистики. База данных — ваша существующая Google Таблица; приложение
читает и пишет в неё напрямую через Google Sheets API.

Идентификатор таблицы уже прописан по умолчанию:
`15IJy050me3WkkI2vYf10tMhCFCKF0dglRY_HaBF96vQ`

---

## 1. Рекомендация по стеку

| Слой | Выбор | Почему |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Один проект даёт и UI, и серверные API-роуты. Не нужен отдельный бэкенд, не нужен второй хостинг. Server Components умеют отдавать статистику сразу в HTML — дашборд открывается мгновенно. |
| UI | **React 19 + Tailwind CSS v4** | Тёмная «игровая» тема собирается из CSS-переменных, без UI-кита. Быстро и без зависимостей. |
| Графики | **Recharts 3** | Декларативные SVG-графики, отлично дружат с React 19 и SSR. |
| Sheets | **googleapis** (официальный клиент) | Сервисный аккаунт, `values.append`, `batchUpdate`. Читается только на сервере. |
| Валидация | **Zod** | Одни и те же схемы для клиента и API-роутов. |
| Хостинг | **Vercel** | Бесплатный тариф, `NEXT_PUBLIC`/env-переменные, автодеплой из Git. |

**Почему не low-code (Apps Script / Airtable / Notion):** таблица уже
сложилась под конкретную форму ответов, а расчёт винрейтов и синергий —
это агрегация по 894 строкам с ветвлением по режиму. Apps Script справился бы
с записью, но дашборд с интерактивными графиками и drill-down’ом в нём
пришлось бы собирать вручную, и каждая правка статистики превращалась бы в
правку формул. Next.js даёт и форму, и аналитику, и запись в ту же таблицу.

**Альтернативы**, если нужен результат ещё быстрее:

- **Google Apps Script + Google Forms** — если приложение вообще не нужно,
  а достаточно формы с сводкой. Пишет в ту же таблицу, формулы считают
  винрейты. Ноль хостинга, но нет дашборда и графиков.
- **Retool / Appsmith** поверх таблицы — дашборд за час, но кастомная логика
  (синергии, нормализация имён) пишется неудобно, и запросы к Sheets идут
  через их runtime, что бьёт по лимитам.

---

## 2. Быстрый старт

```bash
npm install
cp .env.example .env.local     # для чтения ничего менять не нужно
npm run dev                    # http://localhost:3000
```

Приложение **сразу работает на чтение** без единой настройки: таблица уже
расшарена «по ссылке», и приложение читает её через публичный CSV-экспорт.
Дашборд покажет все 892 матча, а форма и раздел «Контент» — сообщат, что
запись недоступна, пока не добавлен сервисный аккаунт.

Чтобы включить **запись**, выполните шаг 3.

Продакшен-сборка:

```bash
npm run build && npm start
```

---

## 3. Настройка Google Sheets (пошагово)

### Шаг 1. Создать сервисный аккаунт

1. Откройте <https://console.cloud.google.com/projectcreate> и создайте проект
   (например, `unmatched-tracker`).
2. **APIs & Services → Library** → найдите **Google Sheets API** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → Service account**.
4. Скопируйте **Email** (вида `unmatched@unmatched-tracker.iam.gserviceaccount.com`)
   и **Private key** (файл `.json`).

### Шаг 2. Дать доступ к таблице

1. Откройте таблицу → **Share** → **Add people and groups**.
2. Вставьте email сервисного аккаунта → роль **Editor**.
3. (Опционально, но рекомендуется) вкладку **PlayerList** можно открыть
   отдельно: «Любой, у кого есть ссылка» → **Читатель**.

> Сервисный аккаунт работает по адресу `…@iam.gserviceaccount.com` — если
> Google не предлагает его в выпадающем списке, вставьте адрес вручную.

### Шаг 3. Прописать ключи

`.env.local` в корне проекта:

```bash
GOOGLE_SHEETS_SPREADSHEET_ID=15IJy050me3WkkI2vYf10tMhCFCKF0dglRY_HaBF96vQ

# Вариант A — весь JSON сервисного аккаунта одной строкой:
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"unmatched@...iam.gserviceaccount.com","client_id":"...","token_uri":"https://oauth2.googleapis.com/token"}'

# Вариант B — три поля по отдельности:
GOOGLE_SERVICE_ACCOUNT_EMAIL=unmatched@unmatched-tracker.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Перезапустите сервер. В шапке дашборда бейдж сменится с
«Публичный CSV · Только чтение» на «Sheets API · Запись включена».

### Ключевой код интеграции

Всё общение с таблицей изолировано в `src/lib/sheets.ts`.

```ts
// src/lib/sheets.ts
function getSheetsClient(): sheets_v4.Sheets {
  if (sheetsClient) return sheetsClient;

  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const credentials = inline
    ? JSON.parse(inline)
    : {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        // В .env переносы строк хранятся как \n — превращаем их обратно.
        private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      };

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}
```

**Чтение** — вкладки адресуются по названию, ID вкладок не хардкодятся:

```ts
async function readRange(range: string): Promise<string[][]> {
  const client = getSheetsClient();
  const res = await client.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range,                       // например: "'Ответы на форму (3)'!A1:V"
  });
  return (res.data.values ?? []).map((row) => row.map((c) => (c == null ? '' : String(c))));
}
```

**Запись матча** — новая строка дописывается в конец, ровно в том формате,
который создаёт Google Форма, поэтому существующие формулы и сводные вкладки
продолжают работать:

```ts
await client.spreadsheets.values.append({
  spreadsheetId: spreadsheetId(),
  range: `'${MATCHES_TAB_TITLE}'!A:V`,
  valueInputOption: 'USER_ENTERED',     // дату Google сам разберёт как дату
  insertDataOption: 'INSERT_ROWS',
  requestBody: { values: [row] },
});
```

**Режимы работы.** Провайдер выбирается автоматически (`src/lib/sheets.ts`):

| `DATA_SOURCE` | Что делает | Когда нужен |
|---|---|---|
| `auto` (по умолчанию) | `api`, если есть ключи; иначе `public` | обычный режим |
| `api` | полный доступ: чтение + запись | продакшен |
| `public` | публичный CSV-экспорт, только чтение | демо без ключей |
| `snapshot` | встроенный JSON-снимок, только чтение | оффлайн-разработка |

Если `api` падает (отозванный ключ, опечатка в JSON), загрузчик данных
автоматически откатывается на публичный режим — дашборд не «упадёт» в
500, а просто покажет данные.

---

## 4. Структура таблицы

Приложение работает с существующей таблицей и **ничего в ней не ломает**.

### Вкладка `Ответы на форму (3)` — история матчей

22 колонки, одна строка = один матч.

| Колонка | Поле | Режим |
|---|---|---|
| A | Отметка времени | оба |
| B | Режим игры (`1 vs 1` / `2 vs 2`) | оба |
| C–F | Игрок 1, Герой 1, Игрок 2, Герой 2 | 1 vs 1 |
| G | Поле 1 vs 1 | 1 vs 1 |
| H | Победитель 1 vs 1 (`Игрок 1` / `Игрок 2`) | 1 vs 1 |
| I, J | Комментарий, Локация | 1 vs 1 |
| K | Поле 2 vs 2 | 2 vs 2 |
| L–S | Команда 1 (2 игрока + 2 героя), Команда 2 | 2 vs 2 |
| T | Победитель (`Команда 1` / `Команда 2`) | 2 vs 2 |
| U, V | Комментарий, Локация | 2 vs 2 |

### Вкладка `PlayerList` — справочники

| Колонка | Содержимое |
|---|---|
| C | СПИСОК ИГРОКОВ |
| D | герои для анкеты |
| F | фан персы игранные |
| I | Поля 2 на 2 |
| J | Поля 1 vs 1 |

Новые записи из раздела «Контент» дописываются в эти колонки.

### Вкладка `Images` — картинки

Создаётся автоматически при первой записи. Формат: `Имя | Тип (player/hero) | URL`.

---

## 5. Статистика: что и как считается

Всё считается из сырых строк матчей — сводные вкладки таблицы
(`2vs2`, `1vs1`, `HeroProfile`…) не используются как источник истины,
потому что они разошлись с фактическими матчами.

Движок — `src/lib/stats.ts`.

```ts
// Победа игрока определяется по номеру места, а не по имени:
// 1 vs 1 -> 'Игрок 1' / 'Игрок 2', 2 vs 2 -> 'Команда 1' / 'Команда 2'
function winningSeats(match: Match): Set<number> {
  const seats = new Set<number>();
  if (match.mode === '1v1') {
    if (match.winner === 'p1') seats.add(0);
    else if (match.winner === 'p2') seats.add(1);
  } else {
    if (match.winner === 't1') { seats.add(0); seats.add(1); }
    else if (match.winner === 't2') { seats.add(2); seats.add(3); }
  }
  return seats;
}
```

**Синергия 2 vs 2.** Пара героев (или игроков) — это те, кто сидел в одной
команде. Пара получает победу, если её команда выиграла:

```ts
for (const team of teams) {
  // Игрок не может быть партнёром самому себе — вырожденные строки пропускаем.
  if (
    team.players.length === 2 &&
    team.players.every(Boolean) &&
    identityKey(team.players[0]) !== identityKey(team.players[1])
  ) {
    const { key, members } = pairKey(team.players[0], team.players[1]);
    const agg = playerPairAgg.get(key) ?? { members, games: 0, wins: 0 };
    agg.games += 1;
    if (team.won) agg.wins += 1;
    playerPairAgg.set(key, agg);
  }
}
```

Порог отсечения — **минимум 3 матча** (`MIN_GAMES_FOR_SYNERGY`), иначе
лидерборд выигрывают пары с одним матчем и 100 % винрейтом.

### Что показывает дашборд

| Метрика | Где считается |
|---|---|
| Всего матчей, разбивка по режимам | `stats.totals` |
| Победы / поражения / винрейт — по игрокам | `stats.players` |
| Победы / поражения / винрейт — по героям | `stats.heroes` |
| Самый частый герой | `stats.mostPlayedHero` |
| Самое популярное поле | `stats.mostPopularMap`, `stats.maps` |
| Лучшая синергия героев (2 vs 2) | `stats.bestHeroSynergy` |
| Лучшая синергия игроков (2 vs 2) | `stats.bestPlayerSynergy` |
| Связки игрок + герой | `stats.favouriteCombos` |
| Очные противостояния | `stats.headToHead` |
| Активность по месяцам | `stats.timeline` |

---

## 6. Форма матча и правила валидации

`src/components/MatchForm.tsx` (клиентский компонент) +
`src/app/api/matches/route.ts` (серверная проверка).

**Правило «герой не может повторяться»** проверяется в трёх местах:

1. **В UI** — уже выбранный герой помечается в списке как недоступный:

```tsx
{heroes.slice(0, seatCount).some((h, i) => i !== index && h === hero.name) && (
  <option disabled>{hero.name} — уже выбран</option>
)}
```

2. **В браузере перед отправкой** — список ошибок справа от формы.
3. **На сервере** — `zod` не пропустит такой матч даже если отправить
   запрос вручную:

```ts
.superRefine((value, ctx) => {
  const seen = new Set<string>();
  value.heroes.forEach((hero, index) => {
    const key = hero.toLowerCase();
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['heroes', index],
        message: `Герой «${hero}» уже выбран в этом матче`,
      });
    }
    seen.add(key);
  });
});
```

---

## 7. Изображения: как хранить

Рекомендуемый вариант — **URL в отдельной вкладке `Images`**
(`Имя | Тип | URL`). Он уже реализован:

```ts
// src/lib/sheets.ts
async upsertImage(name, type, url) {
  const rows = await readRange(`'${imagesTab()}'!A1:C`);
  const targetIndex = rows.findIndex(
    (r) => (r[0] ?? '').trim() === name && (r[1] ?? '').trim() === type,
  );
  if (targetIndex >= 0) {
    await client.spreadsheets.values.update({
      spreadsheetId: spreadsheetId(),
      range: `'${imagesTab()}'!C${targetIndex + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[url]] },
    });
    return;
  }
  await client.spreadsheets.values.append({ /* ... [[name, type, url]] ... */ });
}
```

**Где взять сами картинки:**

| Способ | Как | Нюанс |
|---|---|---|
| **Google Drive** | загрузить файл → «Поделиться» → «Вставить ссылку» → ID вида `1AbC…` | Нужен **прямой** URL: `https://drive.google.com/uc?export=view&id=<ID>`. Обычная ссылка на просмотр не подойдёт — браузер отдаст HTML, а не картинку. |
| **GitHub / imgur** | загрузить файл, скопировать raw-ссылку | Самый простой вариант, домен не заблокирован. |
| **Яндекс.Диск** | публичная ссылка вида `https://disk.yandex.ru/i/<ID>/` | Работает как прямой URL. |

**Альтернативы и почему они хуже:**

- **Base64 в ячейке** — не делайте. Ячейка в Google Sheets ограничена
  50 000 символами, а картинка в base64 — это десятки килобайт. Таблица
  раздуется, а каждая загрузка страницы будет тянуть мегабайты.
- **Загрузка файлов через форму** — возможно, но требует отдельного
  хранилища (S3, Cloud Storage, Cloudinary) и отдельного API ключа.
  Прямой URL из Drive решает задачу без лишней инфраструктуры.
- **Внешний CDN для аватаров** (DiceBear, Gravatar) — бесплатно и без
  ручной загрузки, но это абстрактные аватары, а не портреты героев.

**Как это выглядит в интерфейсе.** Если URL не задан, приложение рисует
цветные монограммы, детерминированно вычисленные из имени — дашборд
никогда не выглядит «битым»:

```tsx
function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
```

---

## 8. Что уже нашлось в ваших данных

Приложение не «чинит» таблицу молча — проблемы показаны в панели
«Качество данных» на дашборде.

| Проблема | Масштаб | Как обрабатывается |
|---|---|---|
| Герой повторяется в матче | 1 строка (строка 74) | Строка исключена из статистики |
| Не заполнены игроки/герои/победитель | 1 строка (строка 305) | Строка исключена из статистики |
| Один игрок указан дважды в одной команде | **90 строк** | Матч учтён, но игрок засчитан **один раз**, чтобы не завышать его игры и винрейт. Такие пары исключены из таблицы синергий |
| Нет отметки времени | 211 строк | Матч учитывается в статистике, но не попадает на график по месяцам |
| Поле боя не указано | 523 строки | Поле необязательное; в рейтинг полей попадают только заполненные |
| Разные написания одного героя | `Ти‑Рекс`/`Ти-Рекс`, `Чёрная Пантера`/`Черная Пантера`, `Ведьмак (Фан)`/`Ведьмак(фан)` | Нормализуются в один герой при подсчёте (см. `src/lib/normalize.ts`) |
| В справочнике только 18 игроков и 78 героев | 52 игрока и 127 героев реально играли | Выпадающие списки строятся как **объединение** справочника и истории матчей, иначе часть игроков была бы недоступна |

---

## 9. API

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/api/data` | Полный снимок: матчи, справочники, вся статистика |
| `POST` | `/api/matches` | Записать матч (`422` при нарушении правил, `503` в режиме только-чтение) |
| `POST` | `/api/content` | Добавить героя / фан-персонажа / игрока / поле |
| `POST` | `/api/images` | Привязать URL картинки к игроку или герою |

Пример записи матча:

```bash
curl -X POST http://localhost:3000/api/matches \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "2v2",
    "players": ["Паша", "Дима", "Санжар", "Slayer"],
    "heroes": ["Меченый", "Малдун", "Дракула", "Зератул(фан)"],
    "map": "Globe Theatre(Удары судьбы)",
    "winner": "t1",
    "comment": "узкий перевес",
    "location": "ай квест"
  }'
```

---

## 10. Структура проекта

```
src/
├── app/
│   ├── layout.tsx              каркас, шрифты, навигация
│   ├── globals.css             тёмная тема (Tailwind v4 @theme)
│   ├── page.tsx                дашборд
│   ├── matches/page.tsx        форма записи матча
│   ├── content/page.tsx        контент и изображения
│   ├── history/page.tsx        полная история с поиском
│   └── api/
│       ├── data/route.ts       GET  /api/data
│       ├── matches/route.ts    POST /api/matches
│       ├── content/route.ts    POST /api/content
│       └── images/route.ts     POST /api/images
├── components/
│   ├── Dashboard.tsx           обзор, KPI, графики, вкладки
│   ├── charts.tsx              обёртки Recharts
│   ├── EntityTable.tsx         таблица лидеров + drill-down
│   ├── MatchForm.tsx           форма матча
│   ├── ContentManager.tsx      добавление героев/игроков/полей/картинок
│   ├── HistoryTable.tsx        история матчей
│   └── ui.tsx                  StatCard, Avatar, WinRateBar, Panel…
└── lib/
    ├── sheets.ts               интеграция с Google Sheets (3 провайдера)
    ├── parse.ts                строка таблицы → Match, сборка строки для записи
    ├── normalize.ts            нормализация имён, разбор дат
    ├── stats.ts                движок статистики
    ├── data.ts                 загрузка + сборка данных для клиента
    ├── csv.ts                  CSV-парсер (кавычки, переносы строк)
    └── snapshot.json           оффлайн-снимок данных
```

---

## 11. Деплой

**Vercel (рекомендуется):**

```bash
npm i -g vercel
vercel            # подключить репозиторий
vercel env add GOOGLE_SERVICE_ACCOUNT_JSON production
vercel env add GOOGLE_SHEETS_SPREADSHEET_ID production
vercel --prod
```

**Docker / любой Node-хостинг:**

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm ci && npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t unmatched-tracker .
docker run -p 3000:3000 --env-file .env.local unmatched-tracker
```

> Приложение полностью серверное: ключи Google никогда не попадают в
> браузер. Не переносите `googleapis` в клиентские компоненты.
