# План внедрения IP-Adapter / ControlNet через Civitai (comfy-workflow)

## Context

Цель — «тот же персонаж в другой позе/сцене/ракурсе», где вариации **дополняют**, а не
глушатся (как в текущем img2img). Для этого нужны identity-механизм (IP-Adapter) и
управление позой (ControlNet OpenPose), отдельные от композиции.

## Итоги спайка (Civitai Lab)

Проверено живыми запросами (admin → Civitai Lab):

- `imageGen` + `engine: "sdcpp"` — рабочий, но **выбрасывает** `controlNets` и `ipAdapters`
  (эхо `input` их не содержит). Поддерживает только `loras` и `embeddings`.
- `engine` — **обязательный дискриминатор**; «движка по умолчанию» нет. Другого SD-движка
  с ControlNet в `imageGen` не обнаружено.
- **`$type: "comfy"` доступен**: API распознаёт `ComfyInput`, требует поле `comfyWorkflow`
  (ComfyUI-граф). Это единственный и рабочий путь к ControlNet/IP-Adapter.

**Вывод:** реализуем через шаг `comfy` с ComfyUI-графом. Путь тяжелее и более хрупкий, чем
`imageGen`, но открыт.

## Архитектурный подход

Добавить в `apps/ai/src/index.ts` **альтернативную ветку генерации**: когда запрошены
продвинутые контролы (IP-Adapter и/или ControlNet), слать не `imageGen`, а `comfy`-шаг с
собранным `comfyWorkflow` (ComfyUI API-format граф). Обычная генерация остаётся на `imageGen`.

Граф (минимум) для «identity + pose»:
- `CheckpointLoaderSimple` — чекпоинт по AIR персонажа (тот же пиннутый `avatarModel`);
- `CLIPTextEncode` ×2 — позитив/негатив;
- `EmptyLatentImage` — целевые W×H (txt2img, без img2img-глушения);
- **ControlNet**: `ControlNetLoader` (AIR OpenPose-модели, базозависимый) + препроцессор
  OpenPose по картинке-позе + `ControlNetApplyAdvanced` (weight, start/endStep);
- **IP-Adapter**: `IPAdapterModelLoader` + `CLIPVisionLoader` + `IPAdapterApply` с
  референс-изображением (аватар персонажа) и weight;
- `KSampler` (steps, cfg, sampler, seed) → `VAEDecode` → `SaveImage`.
- Входные изображения (поза, аватар) передаются URL'ами (как в текущем img2img).

Ресурсы (checkpoint / ControlNet / IP-Adapter / CLIP-Vision) в графе Civitai
задаются по **AIR**; ControlNet и IP-Adapter модели **базозависимы** (отдельные AIR для sd1 и sdxl).

## Конфигурация (AppSetting) + админка

Новая секция рядом с «Civitai AIR модели»:
- AIR control-моделей по базе: `CN_OPENPOSE_SD1/SDXL`, `IPADAPTER_SD1/SDXL`, `CLIPVISION_*`;
- дефолтные weights (IP-Adapter, ControlNet), start/endStep;
- флаги включения продвинутого режима.
Хранить JSON в AppSetting, читать в `apps/ai` через `fetchSettings()` (как `CIVITAI_MODELS`).

## Источники изображений

- **IP-Adapter identity** — `character.avatarUrl` (уже есть, пиннутый образ).
- **OpenPose поза** — картинка-скелет/референс. Варианты:
  1. новое поле `poseRefImageKey` (S3) на `PoseOption` + загрузка в админке опций;
  2. препроцессор OpenPose поверх обычной референс-картинки позы.
  (Выбор — на Фазе 2.)

## Фазы

- **Фаза 1 — рабочий comfy-граф (спайк→код):** через Civitai Lab довести валидный
  `comfyWorkflow` txt2img (checkpoint→CLIP→KSampler→VAE→Save), затем добавить **IP-Adapter**
  (identity с аватара). Критерий: лицо/образ держатся, композиция свободна. Перенести
  сборку графа в `apps/ai` за флагом. Лучший старт графа — экспорт ComfyUI API-format из
  генератора Civitai или их пример.
- **Фаза 2 — ControlNet OpenPose:** добавить в граф ControlNet-ветку; источник позы на
  `PoseOption`; связать с опциями Pose.
- **Фаза 3 — конфиг + UI + интеграция:** секция настроек control-моделей; продвинутый режим
  как опция в **Тест генераций** (проверять перебором), затем в чате/странице генерации.

## Ключевые файлы

- `apps/ai/src/index.ts` — ветка `comfy` + сборка `comfyWorkflow`, чтение AIR control-моделей.
- `apps/api` (settings) + `apps/web/app/admin` — конфиг control-моделей, вкл/выкл, weights.
- `apps/web/app/admin/CivitaiLab.tsx` — инструмент для итерации графа на Фазе 1.
- `PoseOption` (schema) — опциональное поле референс-позы (Фаза 2).
- `apps/api/src/admin/gentest` + чат/страница генерации — подключение режима (Фаза 3).

## Риски / оценка

- **Хрупкость ComfyUI-графа**: несовместимость версий нод/моделей, базозависимость
  control-моделей, подбор весов. Требует итераций в Lab.
- **Стоимость/скорость** comfy-графа обычно выше, чем `imageGen`.
- Точная схема `comfyWorkflow` (формат нод, привязка AIR) — уточняется на Фазе 1.
- Оценка: Фаза 1 ~2–4 дня (основной риск в графе), Фаза 2 ~2–3 дня, Фаза 3 ~2–3 дня.
  Итого ~1.5–2 недели.

## Что можно сделать дёшево параллельно (без comfy)

Если нужен быстрый промежуточный результат:
- **настраиваемый `denoise`** для img2img (ползунок «сила изменения») в чате/gentest —
  компромисс «похожесть ↔ свобода позы»;
- **поддержка LoRA** (`loras`) — стиль/качество/персональные LoRA.
