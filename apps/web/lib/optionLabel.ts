/**
 * Локализация подписей опций генерации (позы, действия, тело, метки, ракурсы,
 * а также «чистые» английские значения вроде Blue/Female/Petite).
 *
 * Задачи (ТЗ):
 *  1. Сырые ключи из БД/манифеста (`img_hand_on_hip`, `type_petite`,
 *     `marks_freckles`, `angle_eye_level`, `motion_v_hip_sway`) показываем
 *     человекочитаемо: на английском при EN, на русском при RU.
 *  2. Уже англоязычные подписи (Blue, Female, Petite, Strawberry Blonde…)
 *     переводим на русский при RU.
 *
 * Значения, уходящие в промпт/профиль (`data-value`, `opt.name`), НЕ меняем —
 * локализуем только то, что видит пользователь.
 */

export type Lang = "en" | "ru";

const PREFIXES = ["img_", "motion_v_", "motion_", "marks_", "type_", "angle_"];

const SMALL_WORDS = new Set(["and", "or", "the", "of", "a", "an", "with", "on", "in", "to", "from", "at", "by", "for", "up"]);

// Аббревиатуры/особые случаи английского отображения.
const EN_SPECIAL: Record<string, string> = {
  pov: "POV", dp: "DP", mfm: "MFM", asmr: "ASMR", "69": "69",
  "2d": "2D", o: "O", g: "G", p: "P",
};

function stripPrefix(raw: string): string {
  for (const p of PREFIXES) {
    if (raw.startsWith(p) && raw.length > p.length) return raw.slice(p.length);
  }
  return raw;
}

/** Нормализованный ключ: без префикса, нижний регистр, слова через пробел. */
function normKey(raw: string): string {
  return stripPrefix(raw.trim()).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Человекочитаемая английская подпись. */
export function humanizeEn(raw: string): string {
  if (!raw) return "";
  const key = normKey(raw);
  if (!key) return "";
  return key
    .split(" ")
    .map((w, i) => {
      if (EN_SPECIAL[w]) return EN_SPECIAL[w];
      if (i > 0 && SMALL_WORDS.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

// ─── Полнофразовые переводы (приоритет над пословным) ─────────────
// Ключ — нормализованная английская фраза (lowercase, без префикса).
const RU_PHRASE: Record<string, string> = {
  // Цвета глаз / волос
  blue: "Синий", brown: "Карий", green: "Зелёный", gray: "Серый", grey: "Серый",
  violet: "Фиолетовый", red: "Рыжий", black: "Чёрный", turquoise: "Бирюзовый",
  orange: "Оранжевый", pink: "Розовый", yellow: "Жёлтый", white: "Белый",
  hazel: "Ореховый", amber: "Янтарный", heterochromia: "Гетерохромия", multicolor: "Разноцветный",
  blonde: "Блонд", brunette: "Брюнет", auburn: "Каштановый", "dark brown": "Тёмно-каштановый",
  "light brown": "Светло-каштановый", platinum: "Платиновый", ginger: "Имбирный",
  silver: "Серебристый", purple: "Пурпурный", ombre: "Омбре",
  "strawberry blonde": "Клубничный блонд", copper: "Медный", caramel: "Карамельный",
  // Особенности глаз
  normal: "Обычные", "vertical pupils": "Вертикальные зрачки", "long eyelashes": "Длинные ресницы",
  "heart shaped pupils": "Зрачки-сердечки", glowing: "Светящиеся", empty: "Пустые",
  sparkling: "Сверкающие", tsurime: "Цуримэ", tareme: "Тарэмэ", "through hair": "Сквозь волосы",
  // Особенности лица
  none: "Нет", freckles: "Веснушки", moles: "Родинки", "mole under the eye": "Родинка под глазом",
  "nose piercing": "Пирсинг носа", "lip piercing": "Пирсинг губы", "eyebrow piercing": "Пирсинг брови",
  "face tattoo": "Тату на лице", "facial scar": "Шрам на лице", glasses: "Очки", dimples: "Ямочки",
  "beauty mark": "Мушка", "face paint": "Боди-арт на лице", "sharp jawline": "Острая линия челюсти",
  "soft features": "Мягкие черты", "high cheekbones": "Высокие скулы", "full lips": "Пухлые губы",
  "thin lips": "Тонкие губы",
  // Длина волос
  short: "Короткие", medium: "Средние", long: "Длинные", "very long": "Очень длинные",
  // Пол / рост
  female: "Женский", male: "Мужской", femboy: "Фембой", "non binary": "Небинарный",
  "trans female": "Транс-женщина", "trans male": "Транс-мужчина",
  "below average": "Ниже среднего", average: "Средний", tall: "Высокий", "very tall": "Очень высокий",
  // Тип тела (body / BODY_TYPE)
  petite: "Миниатюрная", slim: "Стройная", athletic: "Атлетичная", curvy: "Фигуристая",
  chubby: "Пухленькая", fat: "Полная", muscular: "Мускулистая", thick: "Пышная",
  hourglass: "Песочные часы", fit: "Подтянутая", voluptuous: "Соблазнительная",
  // Размеры груди/ягодиц
  flat: "Плоский", small: "Маленький", large: "Большой", huge: "Огромный",
  // Ориентация
  heterosexual: "Гетеросексуальная", bisexual: "Бисексуальная", homosexual: "Гомосексуальная",
  pansexual: "Пансексуальная", asexual: "Асексуальная",
  // Национальности
  american: "Американка", british: "Британка", german: "Немка", french: "Француженка",
  italian: "Итальянка", spanish: "Испанка", japanese: "Японка", korean: "Кореянка",
  chinese: "Китаянка", brazilian: "Бразильянка", russian: "Русская", australian: "Австралийка",
  canadian: "Канадка", mexican: "Мексиканка", indian: "Индианка", swedish: "Шведка",
  norwegian: "Норвежка", dutch: "Голландка", polish: "Полька", ukrainian: "Украинка",
  thai: "Тайка", colombian: "Колумбийка", argentine: "Аргентинка", turkish: "Турчанка",
  egyptian: "Египтянка", irish: "Ирландка",
  // Языки
  english: "Английский", portuguese: "Португальский", arabic: "Арабский", hindi: "Хинди",
  vietnamese: "Вьетнамский",
  // Этничность
  slavic: "Славянская", caucasian: "Европейская", asian: "Азиатская", hispanic: "Латиноамериканская",
  latino: "Латино", mixed: "Смешанная", scandinavian: "Скандинавская",
  // Голос
  gentle: "Нежный", "high pitched": "Высокий", deep: "Низкий", rough: "Грубый", calm: "Спокойный",
  // Причёски
  straight: "Прямые", wavy: "Волнистые", curly: "Кудрявые", braids: "Косы", bun: "Пучок",
  ponytail: "Хвост", "pixie cut": "Пикси", bob: "Каре", "long layers": "Длинные слои",
  dreadlocks: "Дреды", bangs: "Чёлка", "twin tails": "Два хвоста", updo: "Высокая укладка",
  messy: "Небрежные", "side part": "Боковой пробор",
  // Образ жизни
  active: "Активный", lazy: "Ленивый", homebody: "Домосед", sporty: "Спортивный",
  "party girl": "Тусовщица", workaholic: "Трудоголик", adventurer: "Искательница приключений",
  minimalist: "Минималист", luxurious: "Роскошный", bohemian: "Богемный",
  "health conscious": "ЗОЖ", "night owl": "Сова",
  // Стили графики
  realistic: "Реалистичный", "semi real": "Полуреализм", anime: "Аниме", "2d": "2D",
  // Работа (Кем работает)
  unemployed: "Безработная", housewife: "Домохозяйка", teacher: "Учительница", cook: "Повар",
  nurse: "Медсестра", model: "Модель", dancer: "Танцовщица", artist: "Художница",
  writer: "Писательница", student: "Студентка", barista: "Бариста", "yoga instructor": "Инструктор по йоге",
  "fitness trainer": "Фитнес-тренер", influencer: "Инфлюенсер", photographer: "Фотограф",
  entrepreneur: "Предпринимательница", lawyer: "Юрист", doctor: "Врач", programmer: "Программист",
  "fashion designer": "Дизайнер одежды", musician: "Музыкант", waitress: "Официантка",
  librarian: "Библиотекарь", florist: "Флорист", chef: "Шеф-повар", therapist: "Психотерапевт",
  streamer: "Стримерша", masseuse: "Массажистка",
  // Хобби
  pottery: "Гончарное дело", photography: "Фотография", painting: "Живопись", dancing: "Танцы",
  cooking: "Готовка", reading: "Чтение", gaming: "Видеоигры", hiking: "Походы", swimming: "Плавание",
  surfing: "Сёрфинг", singing: "Пение", piano: "Пианино", guitar: "Гитара", gardening: "Садоводство",
  cosplay: "Косплей", fashion: "Мода", travel: "Путешествия", writing: "Письмо", meditation: "Медитация",
  "rock climbing": "Скалолазание", "horseback riding": "Верховая езда", archery: "Стрельба из лука",
  "martial arts": "Боевые искусства", "wine tasting": "Дегустация вин", baking: "Выпечка",
  shopping: "Шопинг", "film making": "Кино", yoga: "Йога",
  // Предпочтения (kinks)
  "role play": "Ролевые игры", "teacher student": "Учитель/ученица", "boss secretary": "Босс/секретарша",
  strangers: "Незнакомцы", maid: "Горничная", public: "На публике", office: "Офис",
  "pool party": "Вечеринка у бассейна", massage: "Массаж", photoshoot: "Фотосессия",
  "workout partner": "Партнёр по тренировкам", roommate: "Сосед(ка) по комнате", neighbor: "Сосед(ка)",
  dominant: "Доминантная", submissive: "Покорная", bondage: "Бондаж", blindfold: "Повязка на глаза",
  handcuffs: "Наручники", teasing: "Дразнить", edging: "Эджинг", worship: "Поклонение",
  praise: "Похвала", humiliation: "Унижение", "pet play": "Pet-play", collar: "Ошейник",
  leash: "Поводок", service: "Служение", lingerie: "Бельё", leather: "Кожа", latex: "Латекс",
  stockings: "Чулки", "high heels": "Высокие каблуки", uniform: "Униформа", wet: "Мокрая",
  "ice play": "Игры со льдом", wax: "Воск", feather: "Перо", whispering: "Шёпот", asmr: "АСМР",
  "dirty talk": "Грязные разговоры", voyeurism: "Вуайеризм", exhibitionism: "Эксгибиционизм",
  // Кадрирование (framing — уже RU в манифесте, но на всякий случай)
  "eye level": "На уровне глаз", "low angle": "Нижний ракурс", "high angle": "Верхний ракурс",
  "birds eye": "С высоты птичьего полёта", "worms eye": "С уровня земли", "dutch angle": "Голландский угол",
  "over shoulder": "Из-за плеча", "pov first person": "От первого лица (POV)", "from behind": "Сзади",
  "from side": "Сбоку", "three quarter": "Три четверти", "selfie angle": "Ракурс селфи",
  "mirror reflection": "Отражение в зеркале",
  // Сцена → Атмосфера → Время суток
  sunrise: "Рассвет", morning: "Утро", daylight: "Дневной свет", "strong sun": "Яркое солнце",
  "golden hour": "Золотой час", sunset: "Закат", night: "Ночь", moonlight: "Лунный свет",
  // Сцена → Атмосфера → Погода
  "clear sky": "Ясное небо", overcast: "Пасмурно", "light rain": "Лёгкий дождь",
  "heavy rain": "Сильный дождь", thunderstorm: "Гроза", "light snow": "Лёгкий снег",
  blizzard: "Метель", fog: "Туман", "strong wind": "Сильный ветер", rainbow: "Радуга",
  "aurora / northern lights": "Северное сияние", heat: "Жара", frost: "Мороз",
  // Сцена → Атмосфера → Частицы
  "sakura petals": "Лепестки сакуры", "falling leaves": "Падающие листья", fireflies: "Светлячки",
  "flying sparks": "Летящие искры", "magic sparkles": "Волшебные блёстки", "dust in light": "Пыль в свете",
  "soap bubbles": "Мыльные пузыри", ash: "Пепел", confetti: "Конфетти", "falling feathers": "Падающие перья",
  // Сцена → Атмосфера → Эффекты окружения
  smoke: "Дым", steam: "Пар", "wet surfaces": "Мокрые поверхности", "god rays": "Лучи света",
  "volumetric fog": "Объёмный туман", "sun glare": "Блики солнца", "neon glow": "Неоновое свечение",
  bioluminescence: "Биолюминесценция",
  // Камера → Объектив
  "ultra wide 14mm": "Сверхширокий 14mm", "wide 24mm": "Широкий 24mm", "standard 35mm": "Стандартный 35mm",
  "normal 50mm": "Обычный 50mm", "portrait 85mm": "Портретный 85mm", "telephoto 135mm": "Телеобъектив 135mm",
  fisheye: "Рыбий глаз",
  // Камера → Освещение
  "natural light": "Естественный свет", "soft diffused": "Мягкий рассеянный",
  "hard directional": "Жёсткий направленный", "studio softbox": "Студийный софтбокс",
  backlight: "Контровой свет", "high key": "Высокий ключ", neon: "Неон", candlelight: "Свет свечей",
  spotlight: "Прожектор", "window light": "Свет из окна", ultraviolet: "Ультрафиолет",
};

// ─── Пословный перевод (fallback для поз/действий/меток) ──────────
const RU_WORD: Record<string, string> = {
  // предлоги/служебные
  on: "на", in: "в", at: "у", to: "к", into: "в", from: "от", behind: "сзади", under: "под",
  over: "над", against: "у", below: "ниже", above: "выше", up: "вверх", down: "вниз",
  out: "наружу", here: "здесь", next: "рядом", together: "вместе", all: "все", no: "без",
  for: "для", after: "после", towards: "к", first: "первый", self: "сам", my: "мой",
  one: "одна", two: "две", three: "три", triple: "тройной", double: "двойной", reverse: "обратная",
  // части тела
  hand: "рука", hands: "руки", hip: "бедро", hips: "бёдра", arm: "рука", arms: "руки",
  leg: "нога", legs: "ноги", legged: "ноги", knee: "колено", knees: "колени", elbow: "локоть",
  head: "голова", hair: "волосы", neck: "шея", shoulder: "плечо", back: "спина", chest: "грудь",
  breast: "грудь", breasts: "грудь", boobs: "грудь", tits: "сиськи", titty: "сиська", titfuck: "тит-фак",
  underboob: "под грудью", cleave: "ложбинка", belly: "живот", stomach: "живот", navel: "пупок",
  waist: "талия", butt: "ягодицы", ass: "попка", thigh: "бедро", thighjob: "бедро-фак",
  feet: "ступни", foot: "ступня", footjob: "фут-фак", toe: "палец", toes: "пальцы ног",
  face: "лицо", facial: "лицо", eye: "глаз", eyebrow: "бровь", ear: "ухо", mouth: "рот",
  lip: "губа", lips: "губы", lipstick: "помада", tongue: "язык", nose: "нос", nipple: "сосок",
  skin: "кожа", pubic: "лобок", inner: "внутренний", lower: "нижний", body: "тело", pussy: "киска",
  clit: "клитор", labia: "половые губы", hole: "дырочка", womb: "матка", penis: "член", shaft: "ствол",
  // позы/положения
  standing: "стоя", sitting: "сидя", seated: "сидя", kneeling: "на коленях", lying: "лёжа",
  reclining: "полулёжа", crawling: "ползком", squatting: "на корточках", squat: "присед",
  bending: "наклон", bent: "согнутая", arched: "выгнутая", leaning: "опираясь", propped: "опираясь",
  perched: "присев", sprawled: "развалившись", prone: "ничком", fetal: "поза эмбриона",
  lotus: "лотос", split: "шпагат", splits: "шпагат", folded: "сложенная", curled: "свернувшись",
  crossed: "скрещены", cross: "крест", spread: "раздвинуты", spreading: "раздвигая",
  raised: "поднята", upright: "прямо", tiptoe: "на цыпочках", contrapposto: "контрапост",
  power: "силовая", confident: "уверенная", menacing: "угрожающая", pose: "поза", posing: "позирует",
  position: "положение", neutral: "нейтрально", peace: "пис", salute: "салют", sign: "жест",
  // действия / движения
  walk: "ходьба", walking: "идёт", running: "бежит", jogging: "бег трусцой", jump: "прыжок",
  dance: "танец", dancing: "танцует", twerk: "тверк", twerking: "тверкает", twirling: "кружится",
  sway: "покачивание", swing: "качание", wave: "волна", waving: "машет", wiggle: "виляние",
  bounce: "подпрыгивание", bouncing: "подпрыгивает", bouncy: "упругая", shake: "тряска",
  groove: "ритм", flow: "поток", rhythm: "ритм", pulse: "пульс", motion: "движение",
  stretch: "растяжка", stretching: "тянется", yoga: "йога", working: "работает",
  // взгляд/эмоции
  look: "взгляд", looking: "смотрит", wink: "подмигивание", smile: "улыбка", moan: "стон",
  surprise: "удивление", embarrassed: "смущена", shy: "застенчивая", joy: "радость",
  emotional: "эмоциональная", exhausted: "измотана", satisfied: "довольна", begging: "умоляет",
  seductive: "соблазнительная", sensual: "чувственная", flirting: "флиртует", teasing: "дразнит",
  tease: "дразнит", waiting: "ждёт", ready: "готова", drunk: "пьяная", ahegao: "ахегао",
  yandere: "яндере", goonette: "гунетта",
  // повседневное
  cooking: "готовит", eating: "ест", reading: "читает", shopping: "шопинг", selfie: "селфи",
  mirror: "зеркало", reflection: "отражение", shower: "душ", showering: "в душе", bath: "ванна",
  bathing: "купается", pool: "бассейн", sleeping: "спит", morning: "утро", date: "свидание",
  dinner: "ужин", romantic: "романтика", cuddle: "обнимашки", cuddling: "обнимается", hug: "объятие",
  kiss: "поцелуй", kissing: "целуется", makeout: "обжимания", touch: "касание", touching: "касается",
  hold: "держит", holding: "держит", grab: "хватает", grabbing: "хватает", grope: "лапает",
  press: "прижим", pressed: "прижата", squeeze: "сжатие", massage: "массаж", flashing: "засвет",
  // одежда/предметы
  clothed: "одетая", nude: "обнажённая", strip: "стриптиз", removing: "снимает", covering: "прикрывает",
  bra: "лифчик", panties: "трусики", panty: "трусики", corset: "корсет", collar: "ошейник",
  leash: "поводок", leashed: "на поводке", chain: "цепь", rope: "верёвка", tape: "лента",
  blindfolded: "с завязанными глазами", gagged: "с кляпом", tied: "связана", bondage: "бондаж",
  shibari: "шибари", strappado: "страппадо", pillory: "колодки", spreader: "распорка",
  // марки/особенности
  marks: "следы", mark: "след", tan: "загар", lines: "линии", birthmark: "родимое пятно",
  tattoo: "тату", tribal: "племенное", henna: "хна", oiled: "в масле", oil: "масло", dirty: "грязная",
  scar: "шрам", piercing: "пирсинг", dermal: "дермальный", love: "любовные", bite: "укус",
  bites: "укусы", handprint: "отпечаток руки", wax: "воск", scratch: "царапины", dripping: "капает",
  fluids: "выделения", bruised: "в синяках", smeared: "размазанный", makeup: "макияж", paint: "краска",
  // ракурсы/камера
  angle: "ракурс", level: "уровень", high: "высокий", low: "низкий", birds: "птичий", worms: "червячный",
  dutch: "голландский", quarter: "четверть", side: "сбок", front: "спереди", frontal: "анфас",
  rear: "сзади", pov: "POV", person: "лицо", solo: "соло",
  // explicit (взрослый контент — приложение 18+)
  sex: "секс", oral: "оральный", anal: "анальный", blowjob: "минет", deepthroat: "глубокий минет",
  handjob: "дрочка", cunnilingus: "куннилингус", fingering: "пальцами", masturbation: "мастурбация",
  cum: "сперма", cumshot: "камшот", creampie: "кримпай", bukkake: "буккаке",
  doggy: "догги", doggystyle: "догги-стайл", cowgirl: "наездница", missionary: "миссионерская",
  spooning: "ложкой", riding: "скачет", ride: "скачет", grinding: "трётся", humping: "трётся",
  straddle: "оседлав", straddling: "оседлав", penetration: "проникновение", insertion: "введение",
  insert: "ввод", threesome: "втроём", gangbang: "групповуха", orgy: "оргия", lesbian: "лесбийский",
  scissoring: "ножницы", tribbing: "трибба", fuck: "трах", fucking: "трах", suck: "сосёт",
  sucking: "сосёт", licking: "лижет", choking: "удушение", spanking: "шлепки", slap: "шлепок",
  slapping: "шлёпает", pegging: "пеггинг", worship: "поклонение", dildo: "дилдо", vibrator: "вибратор",
  vibe: "вибратор", plug: "пробка", toy: "игрушка", orgasm: "оргазм", squirting: "сквирт",
  edging: "эджинг", edge: "грань", cumming: "кончает", come: "кончает", pop: "хлоп",
  // дополнительный словарь поз/действий/сцен
  turn: "поворот", turned: "повёрнута", turns: "повороты", forward: "вперёд", fours: "четвереньки",
  full: "полный", small: "маленькая", size: "размер", wet: "мокрая", messy: "неряшливо",
  heart: "сердце", ring: "кольцо", lock: "замок", pin: "прижата", pull: "тянет", play: "игра",
  use: "использование", close: "близко", tilt: "наклон", drop: "капля", floor: "пол",
  wall: "стена", table: "стол", chair: "стул", bed: "кровать", pillow: "подушка", pole: "шест",
  railing: "перила", glass: "стекло", bar: "стойка", lap: "колени",
  girl: "девушка", model: "модель", cat: "кошка", paws: "лапки", monster: "монстр",
  dragon: "дракон", tentacle: "щупальце", clone: "клон", ball: "шар", bone: "кость",
  amazon: "амазонка", anime: "аниме", erotic: "эротичная", intimate: "интимная",
  tender: "нежная", steamy: "горячая", sloppy: "неряшливый",
  presenting: "демонстрирует", invitation: "приглашение", adoration: "обожание",
  shushing: "тсс", pats: "похлопывания", fondling: "ласки", strap: "ремень", sleeve: "рукав",
  tshirt: "футболка", upskirt: "под юбкой", downblouse: "в вырез", stuck: "застряла",
  suspended: "подвешена", waterfall: "водопад", tower: "башня", eiffel: "эйфелева",
  sandwich: "сэндвич", spitroast: "на вертеле", piledriver: "пайл-драйвер", nelson: "нельсон",
  breeding: "размножение", mating: "спаривание", pregnancy: "беременность", lactation: "лактация",
  nursing: "кормление", slave: "рабыня", condom: "презерватив", gun: "пистолет", machine: "машина",
  buttjob: "батджоб", throatpie: "в горло", glory: "глори", men: "мужчины", finger: "палец",
  blowing: "дует", blown: "воздушный", incoming: "приближается", inspection: "осмотр",
  foam: "пена", tanning: "загорает", album: "альбом", meme: "мем", nyan: "ня", post: "после",
  aftermath: "последствия", assume: "принять", clamps: "зажимы", difference: "разница",
  exit: "выход", jack: "дрочит",
};

// ─── Обратный перевод RU→EN для названий, хранящихся в манифесте на русском ──
// Категории HUMAN_RACE / FANTASY_RACE / HAIR_STYLE заведены в manifest.json
// русскими подписями (в отличие от BODY_TYPE с англ. ключами type_*). Чтобы при
// EN не показывать русский, переводим их обратно. Ключ — name в нижнем регистре.
const RU_TO_EN: Record<string, string> = {
  // Этничность (человеческие)
  "европейская": "Caucasian", "латиноамериканская": "Latina", "восточноазиатская": "East Asian",
  "юго-восточная азия": "Southeast Asian", "южноазиатская": "South Asian", "арабская": "Arab",
  "африканская": "African", "смешанная": "Mixed",
  // Этничность (фэнтезийные)
  "эльф": "Elf", "демон / суккуб": "Demon / Succubus", "ангел": "Angel", "вампир": "Vampire",
  "оборотень": "Werewolf", "неко": "Neko", "кицунэ": "Kitsune", "банни": "Bunny",
  "инопланетянин": "Alien", "андроид": "Android", "фурри": "Furry", "фея": "Fairy",
  "орк": "Orc", "дроу": "Drow",
  // Причёски
  "прямые": "Straight", "волнистые": "Wavy", "кудрявые": "Curly", "хвост": "Ponytail",
  "боковой хвост": "Side Ponytail", "два хвоста": "Twin Tails", "косы": "Braids",
  "две косички": "Twin Braids", "боковая коса": "Side Braid", "хвост с косой": "Braided Ponytail",
  "пучок": "Bun", "два пучка": "Double Buns", "высокая укладка": "Updo",
  "зачёсанные назад": "Slicked Back", "прямая чёлка": "Straight Bangs", "чёлка на пробор": "Parted Bangs",
  "боковая чёлка": "Side Bangs", "на один глаз": "Hair Over One Eye", "за ухо": "Tucked Behind Ear",
  "афро": "Afro", "дреды": "Dreadlocks", "асимметричная": "Asymmetrical", "волосы-сверло": "Drill Hair",
  "растрёпанные": "Messy", "каре": "Bob", "пикси": "Pixie", "ирокез": "Mohawk",
  "химэ-стрижка": "Hime Cut", "распущенные": "Loose", "низкий хвост": "Low Ponytail",
};

/**
 * Локализованная подпись опции.
 * @param name — сырое значение (`opt.name` / data-value), может быть ключом или англ. подписью.
 */
export function localizeOption(name: string, lang: Lang): string {
  if (!name) return "";
  // Данные, хранящиеся на русском (часть манифеста). При RU оставляем как есть,
  // при EN переводим обратно по словарю (если знаем), иначе показываем как есть.
  if (/[Ѐ-ӿ]/.test(name)) {
    if (lang === "ru") return name;
    return RU_TO_EN[name.trim().toLowerCase()] ?? name;
  }

  const en = humanizeEn(name);
  if (lang !== "ru") return en;

  const key = normKey(name);
  if (RU_PHRASE[key]) return RU_PHRASE[key];

  // Пословный fallback.
  const words = key.split(" ");
  const ru = words.map((w) => RU_WORD[w] ?? (EN_SPECIAL[w] || w)).join(" ");
  if (!ru) return en;
  return ru.charAt(0).toUpperCase() + ru.slice(1);
}
