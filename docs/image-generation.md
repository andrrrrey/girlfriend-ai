# Генерация изображений: как это работает сейчас

Документ описывает текущий (актуальный) пайплайн генерации картинок персонажей:
провайдер Civitai RED, модели AIR, связь со стилями, пиннинг, режимы img2img/txt2img
и админ-инструменты.

---

## 1. Кратко

- Основной провайдер генерации изображений — **Civitai RED** (Orchestration API).
- Каждый **стиль** (Graphic Style) соответствует **пулу чекпоинтов Civitai**, заданных
  идентификаторами **AIR**. Один AIR = одна модель (чекпоинт) = отдельная нейросеть.
- При первой генерации аватара из пула стиля берётся **случайный** чекпоинт, затем он
  **пиннится** к персонажу (сохраняется вместе с seed), и все последующие картинки
  этого персонажа идут на **той же** модели с **тем же** seed.
- Картинки персонажа в чате и на странице генерации создаются в режиме **img2img** —
  от аватара персонажа как референса (чтобы сохранить внешность).

---

## 2. AIR — идентификатор модели Civitai

**Формат:**

```
urn:air:{ecosystem}:checkpoint:civitai:{modelId}@{versionId}
```

- `ecosystem` — базовая архитектура: `sd1` (Stable Diffusion 1.5) или `sdxl`
  (SDXL / Pony / Illustrious и производные).
- `checkpoint` — тип ресурса (поддерживается только checkpoint; LoRA/embedding — нет).
- `modelId` — id модели на Civitai.
- `versionId` — id конкретной версии модели.

**Пример:** `urn:air:sdxl:checkpoint:civitai:827184@1612720`
(модель `827184`, версия `1612720`, база SDXL).

### Где взять AIR

1. Открыть страницу модели-чекпоинта на **civitai.com**. URL имеет вид
   `civitai.com/models/{modelId}?modelVersionId={versionId}` — оба числа прямо в адресной
   строке (`modelId` после `/models/`, `versionId` = `modelVersionId`; версия выбирается
   в панели **Versions** справа).
2. `ecosystem` определяется по полю **Base Model** на странице: `SD 1.5 → sd1`,
   `SDXL / Pony / Illustrious → sdxl`.
3. Тип ресурса должен быть **Checkpoint**.

Официальное описание формата: `developer.civitai.com/site/guide/air`.

> В админке (`/admin` → секция **Civitai AIR модели**) можно просто вставить ссылку Civitai —
> система сама вытащит `modelId`/`versionId`, определит базу и соберёт AIR через Civitai API.

---

## 3. Style (Graphic Style) → пул AIR

- Стили — это опции персонажа `CharacterOption` с `category = "STYLE"`. У каждой такой опции
  есть поле `generationStyle` (`schema.prisma`), которое хранит **ключ пула**.
- Текущие ключи пулов: `realism`, `mistoon`, `wai-ill`, `furry`.
- Пулы (списки AIR + параметры генерации) заданы в `apps/ai/src/index.ts`
  (`DEFAULT_CIVITAI_MODELS`) и **переопределяются через админку** (AppSetting
  `CIVITAI_MODELS`, JSON `Record<style, CivitaiModelConfig[]>`, слияние по стилям с
  дефолтами). Изменения применяются **без перезапуска** (читаются на каждый запрос
  через `/internal/settings`).

Каждый чекпоинт в пуле (`CivitaiModelConfig`) описывается полями:

| Поле        | Значение |
|-------------|----------|
| `air`       | идентификатор чекпоинта Civitai |
| `base`      | `sd1` \| `sdxl` — базовая архитектура |
| `width`/`height` | базовые размеры (SD1 обычно 512×768, SDXL 1024×1536) |
| `steps`     | число шагов диффузии (обычно 25–30) |
| `cfgScale`  | сила следования промпту (обычно 7) |
| `scheduler` | сэмплер (например `EulerA`) |
| `clipSkip`  | clip skip (обычно 2) |

**Выбор чекпоинта** (`generateImageCivitai`): если передан конкретный AIR (`modelAir`) —
берётся именно он; иначе — случайный из пула стиля. Пустой пул → ошибка
`No Civitai models configured for style`.

---

## 4. Пиннинг модели и seed к персонажу

Чтобы образ персонажа не «плыл» от картинки к картинке, при создании аватара
фактически использованные значения сохраняются в `Character.personality` (JSON):

- `avatarPrompt` — точный промпт аватара (база-идентичность);
- `avatarModel` — использованный AIR (чекпоинт);
- `avatarSeed` — seed;
- `generationStyle` — ключ пула стиля.

Дальше при любой генерации картинки персонажа фронт передаёт `model = avatarModel`,
`seed = avatarSeed`, `generationStyle`, а AI-сервис по префиксу `urn:air:` реюзает
именно этот чекпоинт. Так внешность/стиль/сид совпадают.

---

## 5. Режимы: img2img и txt2img

### img2img (продакшн: чат и страница генерации)

Картинки персонажа генерируются **img2img** — исходный аватар передаётся как референс.
Payload (`apps/web/app/chat/page.tsx`):

- `initImageUrl = character.avatarUrl` — аватар как референс (это и делает img2img);
- `provider = "civitai"`;
- `model = personality.avatarModel` — пиннутый AIR;
- `seed = personality.avatarSeed` — пиннутый seed;
- `generationStyle = personality.generationStyle` (иначе `"realism"`);
- `prompt` = база персонажа + промпт выбранной опции (поза/сцена/…).

Сила изменения относительно референса задаётся **denoise** (AppSetting
`CIVITAI_IMG2IMG_DENOISE`, по умолчанию `0.65`). Чем ниже — тем ближе к оригиналу,
чем выше — тем сильнее промпт меняет картинку.

### txt2img

Без референса — картинка строится только из промпта (на том же стиле/AIR).
Даёт полную свободу позы/сцены/ракурса, но внешность зависит только от промпта.

> В админ-разделе **Тест генераций** есть переключатель img2img/txt2img (по умолчанию
> img2img — как в проде).

---

## 6. Почему img2img «глушит» вариации позы/сцены/ракурса

img2img работает так: исходный аватар кодируется в латент, к нему добавляется шум
пропорционально `denoise`, и модель **до-восстанавливает** картину из этого шума под
управлением промпта. При `denoise = 0.65` примерно 35% исходной структуры (композиция,
поза, кадрирование, ракурс) **сохраняется** — именно за счёт этого держится похожесть на
персонажа. Побочный эффект: смена позы/сцены/ракурса из опций проявляется слабо, потому
что общая композиция унаследована от аватара.

Это фундаментальный компромисс «чистого» img2img: **нельзя одновременно** жёстко
сохранять внешность (низкий denoise) **и** свободно менять позу (нужен высокий denoise
или txt2img). Рычаги и решения:

| Подход | Плюс | Минус |
|--------|------|-------|
| Поднять `denoise` (0.75–0.85) | больше свободы позы/сцены | сильнее «уплывает» внешность |
| txt2img (тот же AIR + seed) | полная свобода позы/сцены/ракурса | внешность только из промпта, может отличаться от аватара |
| **IP-Adapter / ControlNet (OpenPose) / reference-only** | держит лицо/личность отдельно от композиции → «то же лицо, другая поза» | сейчас **не поддерживается** payload'ом (шлём только один checkpoint) |
| Персональная **LoRA** персонажа | максимальная стабильность образа | нужно обучать LoRA на каждого персонажа |

**Вывод:** чтобы «дополнять, а не глушить» (тот же персонаж в другой позе), нужен
identity-preserving механизм, отдельный от композиции — IP-Adapter или ControlNet.
В текущем пайплайне их нет: Civitai-запрос содержит только `model: air`, без
`additionalNetworks`/ControlNet. Это отдельная доработка (расширение payload в
`generateImageCivitai` + управление в админке). Краткосрочные варианты без доработки —
поднять denoise (компромисс) или использовать txt2img (свобода позы ценой точного лица).

---

## 7. Пайплайн end-to-end

```
web (chat/generation/gentest)
  → POST /generation/image  (apps/api GenerationService.createImageJob)
      • перевод кириллицы → EN
      • создаёт AiJob (status=pending) и кладёт задачу в BullMQ (очередь "ai-jobs")
  → worker (apps/worker)   — Worker без concurrency ⇒ обрабатывает джобы ПО ОДНОЙ
      → POST /ai/image/generate (apps/ai)
          • applyGlobalPromptSettings (NSFW/NEGATIVE промпт-теги)
          • generateImageCivitai → Civitai Orchestration API (wait=60 + поллинг до ~150с)
          • картинка перезаливается в S3
      → updateJobStatus (AiJob → completed/failed, output.url)
  ← клиент поллит GET /generation/jobs/:id
```

> **Важно:** воркер обрабатывает image-джобы **последовательно** (concurrency 1) на весь
> стек. Реального параллелизма генерации сейчас нет — множественная постановка джобов
> просто удлиняет очередь. Для настоящей многопоточности нужно поднять concurrency
> воркера (платформенное изменение, влияет на нагрузку/лимиты Civitai).

---

## 8. Глобальные промпт-настройки (AppSetting)

Применяются ко ВСЕМ генерациям на сервере (`apps/ai`), редактируются в админке:

- `NSFW_PROMPT_TAGS` — позитивные quality/NSFW-теги (добавляются к промпту);
- `NEGATIVE_PROMPT` — базовый негатив (мерджится с пользовательским);
- `SFW_PROMPT_TAGS` / `SFW_NEGATIVE_PROMPT` — версии для SFW-режима;
- `CIVITAI_API_TOKEN` — токен Civitai;
- `CIVITAI_IMG2IMG_DENOISE` — сила denoise для img2img (по умолчанию 0.65);
- `CIVITAI_MODELS` — переопределение пулов AIR по стилям (JSON), редактируется в
  секции «Civitai AIR модели».

---

## 9. Админ-инструменты

- **Настройки → Civitai RED** — токен Civitai.
- **Настройки → Civitai AIR модели** — просмотр/правка пулов AIR по стилям; вставка ссылки
  Civitai с авто-извлечением; справка «Где взять AIR»; какие STYLE-опции привязаны к пулу.
- **Тест генераций** (`/admin/gentest`) — перебор комбинаций опций (Appearance × Pose ×
  Scene × Camera) на выбранном персонаже и его AIR; режим img2img/txt2img; результаты
  таблицей с превью и статусами.

---

## 10. Ключевые файлы

| Файл | За что отвечает |
|------|-----------------|
| `apps/ai/src/index.ts` | вся логика Civitai: пулы `DEFAULT_CIVITAI_MODELS`, `resolveCivitaiModels`, `generateImageCivitai`, сборка payload |
| `apps/api/src/generation/generation.service.ts` | `createImageJob` (очередь), `getJobStatus`, каталог `IMAGE_MODELS` |
| `apps/api/src/chats/characters.service.ts` | пиннинг `avatarPrompt`/`avatarModel`/`avatarSeed`/`generationStyle` в `personality` |
| `apps/worker/src/index.ts` | обработчик очереди (последовательный) → вызывает `apps/ai` |
| `apps/web/lib/prompt.ts` | `buildCharacterImagePrompt` — база-идентичность из `personality` |
| `apps/web/app/chat/page.tsx` | генерация картинок в чате (img2img) |
| `apps/web/app/generation/page.tsx` | страница генерации (`buildCompositePrompt`, img2img для существующего персонажа) |
| `apps/web/app/admin/CivitaiModelsEditor.tsx` | редактор пулов AIR |
| `apps/api/src/admin/gentest/` | тестовый перебор генераций |
