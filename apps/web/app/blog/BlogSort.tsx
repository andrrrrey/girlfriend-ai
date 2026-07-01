"use client";

/**
 * Дропдаун сортировки каталога блога. Меняет параметр `sort` в URL (и сбрасывает
 * `page` на 1), сохраняя текущую категорию. Навигация — через router, чтобы
 * сервер перерендерил каталог с новой сортировкой.
 */

import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BLOG_SORTS } from "../../lib/blogCategories";

export default function BlogSort({ sort }: { sort: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = BLOG_SORTS.find((s) => s.value === sort) ?? BLOG_SORTS[0];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const select = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "new") params.delete("sort");
    else params.set("sort", value);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `/blog?${qs}` : "/blog");
    setOpen(false);
  };

  return (
    <div className="blog-sort" ref={ref}>
      <button className="blog-sort-btn" onClick={() => setOpen((v) => !v)} type="button">
        <span className="blog-sort-label">Sort by:</span>
        <span className="blog-sort-value">{current.label}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="blog-sort-menu">
          {BLOG_SORTS.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`blog-sort-item${s.value === current.value ? " active" : ""}`}
              onClick={() => select(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
