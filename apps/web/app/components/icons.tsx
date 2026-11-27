import type React from "react";

/**
 * Набор UI-иконок (inline SVG, обводка currentColor) — вместо эмодзи по всему
 * сайту. Цвет задаётся через `color` родителя или проп `color`, размер — `size`.
 */
export type IconName =
  | "chat" | "image" | "video" | "heart" | "star" | "masks" | "camera" | "zap"
  | "users" | "user" | "check" | "x" | "link" | "warning" | "dot"
  | "home" | "hotel" | "theater" | "car" | "beach" | "forest" | "city" | "castle" | "tent";

const PATHS: Record<IconName, React.ReactNode> = {
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  image: (<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-9 9" /></>),
  video: (<><rect x="2.5" y="6" width="13" height="12" rx="2" /><path d="M15.5 10.5l6-3.5v10l-6-3.5" /></>),
  heart: <path d="M12 20s-7.5-4.6-9.2-9.3C1.7 7.4 3.9 4 7.3 4c2 0 3.5 1.1 4.7 2.7C13.2 5.1 14.7 4 16.7 4c3.4 0 5.6 3.4 4.5 6.7C19.5 15.4 12 20 12 20z" />,
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" />,
  masks: (<><path d="M3 5c3-1.3 6-1.3 9 0v5.5a4.5 4.5 0 0 1-9 0z" /><path d="M12 9c3-1.3 6-1.3 9 0v5.5a4.5 4.5 0 0 1-9 0" /><path d="M6 9h.01M9 9h.01M15 13h.01M18 13h.01" /></>),
  camera: (<><path d="M4 7h3l2-2.5h6L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></>),
  zap: <path d="M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z" />,
  users: (<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>),
  check: <path d="M4.5 12.5l5 5 10-11" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  link: (<><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></>),
  warning: (<><path d="M12 3.5L2.5 20h19z" /><path d="M12 10v4.5M12 17.5h.01" /></>),
  dot: <circle cx="12" cy="12" r="5" fill="currentColor" />,
  home: (<><path d="M3 11l9-7.5 9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-6h4v6" /></>),
  hotel: (<><path d="M3 20V5M21 20v-6H3" /><path d="M3 14V11h7a3 3 0 0 1 3 3" /><circle cx="7" cy="8.5" r="1.5" /></>),
  theater: (<><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 4c2 5 5 7 9 7s7-2 9-7" /><path d="M12 11v9" /></>),
  car: (<><path d="M3 16v-3.5L5.5 7h13L21 12.5V16" /><path d="M3 16h18v2H3z" /><circle cx="7" cy="16" r="1.8" /><circle cx="17" cy="16" r="1.8" /></>),
  beach: (<><path d="M3 20h18" /><path d="M12 20V9" /><path d="M4 10a8 8 0 0 1 16 0z" /></>),
  forest: (<><path d="M8 3l-5 9h3.5L3 18h10l-3.5-6H13z" /><path d="M8 18v3M17 7l-4 7h8z" /><path d="M17 14v7" /></>),
  city: (<><path d="M3 21V9h6v12M9 21V4h7v17M16 21v-9h5v9" /><path d="M2 21h20M12 8h1M12 12h1M12 16h1" /></>),
  castle: (<><path d="M3 21V8h3v2h3V8h6v2h3V8h3v13z" /><path d="M10 21v-5h4v5M6 4v4M18 4v4" /></>),
  tent: (<><path d="M2 20L12 4l10 16z" /><path d="M12 4v16M9 20l3-6 3 6" /></>),
};

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
  className?: string;
  title?: string;
}

export function Icon({ name, size = 16, color = "currentColor", strokeWidth = 1.8, style, className, title }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, verticalAlign: "-0.15em", ...(color !== "currentColor" ? { color } : {}), ...style }}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}

/** Иконка категории сцены по ключу/подписи категории (дом, отель, пляж…). */
export function sceneCategoryIcon(category: string): IconName | null {
  const c = category.toLowerCase();
  if (/home|house|дом|haus|maison/.test(c)) return "home";
  if (/hotel|отел|hôtel/.test(c)) return "hotel";
  if (/entertain|theat|club|развлеч|театр|unterhalt|divertiss/.test(c)) return "theater";
  if (/car|transport|vehicle|авто|машин|transp|voiture|fahrzeug/.test(c)) return "car";
  if (/beach|sea|пляж|мор|strand|plage/.test(c)) return "beach";
  if (/nature|forest|лес|природ|wald|natur|forêt/.test(c)) return "forest";
  if (/city|urban|город|stadt|ville/.test(c)) return "city";
  if (/castle|palace|fantasy|замок|дворец|фэнт|schloss|château/.test(c)) return "castle";
  if (/camp|tent|кемп|палат|zelt|camping/.test(c)) return "tent";
  return null;
}
