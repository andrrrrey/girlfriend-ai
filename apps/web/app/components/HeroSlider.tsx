"use client";

import React, { useCallback, useRef, useState } from "react";

type Slide = { src: string; alt: string; href?: string };

// Баннеры главной (1280×426, текст и кнопки нарисованы на самих картинках).
const SLIDES: Slide[] = [
  { src: "/banners/webcam-coming-soon.jpg", alt: "AI Webcam Streams — coming soon" },
  { src: "/banners/ai-date.jpg", alt: "Your perfect AI date — Start Dating", href: "#characters" },
  { src: "/banners/new-year-sale.jpg", alt: "New Year Sale — 70% off", href: "/subscription" },
  { src: "/banners/create-girlfriend.jpg", alt: "Create your own AI girlfriend", href: "/create" },
];

const INTERVAL_MS = 5000;

const SLIDER_CSS = `
  .hero-slider {
    position: relative; margin: 8px 36px 0; border: 1px solid #313131; border-radius: 8px;
    overflow: hidden; aspect-ratio: 1280 / 426; background: #1a0a1e; user-select: none;
  }
  .hero-slide {
    position: absolute; inset: 0; opacity: 0; transition: opacity 0.7s ease;
    pointer-events: none; display: block;
  }
  .hero-slide.active { opacity: 1; pointer-events: auto; }
  .hero-slide img { width: 100%; height: 100%; object-fit: cover; display: block; -webkit-user-drag: none; }
  .hero-slider .sr-only {
    position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
  }
  .hero-dots {
    position: absolute; left: 12px; right: 12px; bottom: 8px; z-index: 2; display: flex; gap: 6px;
  }
  .hero-dot {
    flex: 1; height: 14px; padding: 6px 0; background: none; border: none; cursor: pointer; position: relative;
  }
  .hero-dot-track {
    position: absolute; left: 0; right: 0; top: 6px; height: 2px; border-radius: 1px;
    background: rgba(255,255,255,0.25); overflow: hidden;
  }
  .hero-dot-fill {
    position: absolute; inset: 0; width: 0; background: #f95bad;
    box-shadow: 0 0 5px 1px rgba(228,0,120,0.6);
  }
  .hero-dot.done .hero-dot-fill { width: 100%; }
  .hero-dot.active .hero-dot-fill { animation: hero-dot-progress linear forwards; }
  .hero-slider.paused .hero-dot.active .hero-dot-fill { animation-play-state: paused; }
  @keyframes hero-dot-progress { from { width: 0; } to { width: 100%; } }
  @media (max-width: 768px) {
    .hero-slider { margin: 8px 16px 0; }
    .hero-dots { left: 8px; right: 8px; bottom: 4px; gap: 4px; }
  }
`;

export default function HeroSlider({ title }: { title: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = SLIDES.length;

  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  // Автопрокрутка: следующий слайд — по окончании анимации полоски активной точки,
  // поэтому пауза при наведении продолжает отсчёт с того же места.

  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
  };

  return (
    <div
      className={`hero-slider${paused ? " paused" : ""}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <style>{SLIDER_CSS}</style>
      <h1 className="sr-only">{title}</h1>
      {SLIDES.map((s, i) => {
        const img = (
          <img
            src={s.src}
            alt={s.alt}
            width={1280}
            height={426}
            loading={i === 0 ? "eager" : "lazy"}
            decoding="async"
            draggable={false}
          />
        );
        const cls = `hero-slide${i === index ? " active" : ""}`;
        return s.href ? (
          <a key={s.src} href={s.href} className={cls} aria-hidden={i !== index} tabIndex={i === index ? 0 : -1}>
            {img}
          </a>
        ) : (
          <div key={s.src} className={cls} aria-hidden={i !== index}>{img}</div>
        );
      })}
      <div className="hero-dots">
        {SLIDES.map((s, i) => (
          <button
            key={s.src}
            type="button"
            aria-label={`Slide ${i + 1}`}
            className={`hero-dot${i === index ? " active" : i < index ? " done" : ""}`}
            onClick={() => go(i)}
          >
            <span className="hero-dot-track">
              <span
                key={i === index ? `a${index}` : "i"}
                className="hero-dot-fill"
                style={i === index ? { animationDuration: `${INTERVAL_MS}ms` } : undefined}
                onAnimationEnd={i === index ? () => go(index + 1) : undefined}
              />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
