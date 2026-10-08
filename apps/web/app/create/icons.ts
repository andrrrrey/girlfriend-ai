/**
 * Линейные SVG-иконки визарда создания персонажа (вместо эмодзи).
 * Единый стиль сайта: viewBox 24, обводка currentColor 1.6, скруглённые концы.
 * Цвет задаётся CSS-ом контейнера (розовый градиент-кружок / белый).
 */

const P: Record<string, string> = {
  // ── Personality ──
  crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z"/><path d="M5 19h14"/>',
  crystal: '<circle cx="12" cy="10" r="7"/><path d="M8 21h8"/><path d="M9 17.5L8 21M15 17.5l1 3.5"/><path d="M9.5 8.5a3 3 0 013-2.5"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z"/>',
  flower: '<circle cx="12" cy="12" r="2.5"/><path d="M12 9.5C10 6 10 3 12 3s2 3 0 6.5zM12 14.5c2 3.5 2 6.5 0 6.5s-2-3 0-6.5zM9.5 12C6 14 3 14 3 12s3-2 6.5 0zM14.5 12c3.5-2 6.5-2 6.5 0s-3 2-6.5 0z"/>',
  flame: '<path d="M12 21c-3.9 0-6.5-2.7-6.5-6.2 0-3.8 3.2-5.8 3.7-9.8 2.5 1.5 3.8 3.6 4 6 1-.7 1.6-1.9 1.8-3.2 2 1.8 3.5 4.3 3.5 7 0 3.5-2.6 6.2-6.5 6.2z"/><path d="M12 21c-1.6 0-2.7-1.1-2.7-2.6 0-1.7 1.6-2.6 2.7-4.4 1.1 1.8 2.7 2.7 2.7 4.4 0 1.5-1.1 2.6-2.7 2.6z"/>',
  bow: '<path d="M12 12L4 7.5v9L12 12zM12 12l8-4.5v9L12 12z"/><circle cx="12" cy="12" r="1.6"/><path d="M11 13.5L9 20M13 13.5l2 6.5"/>',
  lips: '<path d="M3 12c2.5-4 5-5 7-4 1 .5 1.5.5 2 0 .5.5 1 .5 2 0 2-1 4.5 0 7 4-2.5 4-5.5 6-9 6s-6.5-2-9-6z"/><path d="M3 12c3 1 6 1.5 9 1.5S18 13 21 12"/>',
  chain: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  butterfly: '<path d="M12 8v12"/><path d="M12 10C10 5 4 3 3.5 6.5 3 10 7 12 12 12.5"/><path d="M12 10c2-5 8-7 8.5-3.5.5 3.5-3.5 5.5-8.5 6"/><path d="M12 13c-3 0-6.5 1.5-6 4.5.5 2.5 4 1.5 6-2M12 13c3 0 6.5 1.5 6 4.5-.5 2.5-4 1.5-6-2"/><path d="M10.5 5L12 7.5 13.5 5"/>',
  horns: '<circle cx="12" cy="13" r="7"/><path d="M6.2 9.2C4.5 7.5 4.5 5 5 3c1.2 2 3 3 4.6 3.6M17.8 9.2c1.7-1.7 1.7-4.2 1.2-6.2-1.2 2-3 3-4.6 3.6"/><path d="M9 12.5l1.5.8M15 12.5l-1.5.8M9.5 16.5c1.5 1 3.5 1 5 0"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11"/><path d="M12 9c-1.5-3-5-3.5-5-1.5S10 9 12 9zM12 9c1.5-3 5-3.5 5-1.5S14 9 12 9z"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12C12 8 9 5 4.5 5c0 4.5 3 7 7.5 7z"/><path d="M12 14c0-3.5 2.5-6 6.5-6 0 4-2.5 6-6.5 6z"/>',
  wink: '<circle cx="12" cy="12" r="9"/><path d="M8 10h2.5M14.5 9.5l1.5 1-1.5 1"/><path d="M8.5 15c2 2 5 2 7 0"/>',
  book: '<path d="M4 4.5A1.5 1.5 0 015.5 3H20v15H5.5A1.5 1.5 0 004 19.5v-15z"/><path d="M4 19.5A1.5 1.5 0 005.5 21H20v-3"/><path d="M8 7h8"/>',
  homeHeart: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1H4a1 1 0 01-1-1v-9z"/><path d="M12 17.5s-3-1.8-3-4a1.6 1.6 0 013-.8 1.6 1.6 0 013 .8c0 2.2-3 4-3 4z"/>',
  zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
  heartCrack: '<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z"/><path d="M12 7.4L10.5 11l3 1.5L12 16"/>',

  // ── Preview / misc ──
  volume: '<path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13"/>',
  scissors: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 7.5L20 18M8 16.5L20 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  body: '<circle cx="12" cy="4.5" r="2"/><path d="M8 8.5h8l-1.5 5 1.5 7.5M8 8.5l1.5 5L8 21"/><path d="M9.5 13.5h5"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z"/>',
  peach: '<path d="M12 7c-4.5-2-8.5 1-8.5 6 0 4.5 3.8 8 8.5 8s8.5-3.5 8.5-8c0-5-4-8-8.5-6z"/><path d="M12 7c-.8 3.5-.8 9 0 14"/><path d="M12 7c0-2 1-3.5 3-4"/>',
  message: '<path d="M21 12a8 8 0 01-11.8 7L3 21l2-5.6A8 8 0 1121 12z"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9z"/>',
  couple: '<circle cx="8" cy="7" r="3"/><circle cx="16.5" cy="7" r="3"/><path d="M2.5 20a5.5 5.5 0 0111 0M13 14.5a5.5 5.5 0 018.5 5.5"/>',
  family: '<circle cx="7" cy="6" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="12" cy="12" r="2"/><path d="M3 20v-3.5A4 4 0 017 12.5M21 20v-3.5a4 4 0 00-4-4M8.5 20v-1.5a3.5 3.5 0 017 0V20"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8.5 7V5a2 2 0 012-2h3a2 2 0 012 2v2"/><path d="M3 13h18"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z"/>',
  ghost: '<path d="M5 21V10a7 7 0 0114 0v11l-2.3-1.8L14.3 21 12 19.2 9.7 21l-2.4-1.8L5 21z"/><path d="M9.5 10.5v1M14.5 10.5v1"/>',
  gem: '<path d="M6 3h12l3 6-9 12L3 9l3-6z"/><path d="M3 9h18M9 3l-1.5 6L12 21l4.5-12L15 3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pen: '<path d="M4 20h4L19.5 8.5a2.8 2.8 0 00-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',

  // ── Lifestyle ──
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  sofa: '<path d="M4 11V8a2 2 0 012-2h12a2 2 0 012 2v3"/><path d="M2 13a2 2 0 014 0v1h12v-1a2 2 0 014 0v5H2v-5z"/><path d="M5 18v2M19 18v2"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  party: '<path d="M8 21h8M12 15v6"/><path d="M6 3h12l-6 12L6 3z"/><path d="M7.5 6h9"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z"/>',
  square: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  feather: '<path d="M20 4c-7 0-13 5-13 12v4"/><path d="M20 4c0 7-4 12-11 12"/><path d="M7 16l6-6"/>',
  leaf: '<path d="M20 4C10 4 4 9 4 16c0 1.5.3 3 1 4 7 0 15-4 15-16z"/><path d="M5 20c3-5 7-8 11-10"/>',
};

/** Возвращает SVG-разметку иконки. */
export function svgIcon(name: string, size = 16): string {
  const body = P[name] ?? P.sparkle;
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** Иконки карточек характера (по имени из PERSONALITIES). */
export const PERSONALITY_ICONS: Record<string, string> = {
  "Overly Confident": "crown",
  "Mysterious": "crystal",
  "Obsessed With You": "heart",
  "Caregiver": "flower",
  "Dominant": "flame",
  "Submissive": "bow",
  "Seductress": "lips",
  "Cruel & Unforgiving": "chain",
  "Free Spirited": "butterfly",
  "Demanding Bully": "horns",
  "Hopeless Romantic": "gift",
  "Insatiable": "moon",
  "Shy & Innocent": "sprout",
  "Playful Tease": "wink",
  "Intellectual": "book",
  "Motherly": "homeHeart",
  "Tsundere": "zap",
  "Yandere": "heartCrack",
};

/** Иконки карточек образа жизни (по значению LIFESTYLES). */
export const LIFESTYLE_ICONS: Record<string, string> = {
  "Active": "activity",
  "Lazy": "sofa",
  "Homebody": "home",
  "Sporty": "dumbbell",
  "Party Girl": "party",
  "Workaholic": "briefcase",
  "Adventurer": "compass",
  "Minimalist": "square",
  "Luxurious": "gem",
  "Bohemian": "feather",
  "Health-Conscious": "leaf",
  "Night Owl": "moon",
};
