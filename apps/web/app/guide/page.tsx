"use client";

import React from "react";
import Link from "next/link";
import { useT } from "../../context/language";
import type { TKey } from "../../lib/i18n";

const CSS = `
.gd-page {
  padding: 24px 32px;
  max-width: 900px;
  width: 100%;
  box-sizing: border-box;
  margin: 0 auto;
  font-family: 'Syne', sans-serif;
  color: #fff;
}
.gd-head {
  padding-bottom: 24px;
  border-bottom: 1px solid #252525;
  margin-bottom: 24px;
}
.gd-title {
  font-size: 28px; font-weight: 700; line-height: 1.1; color: #fff; margin: 0;
}
.gd-sub {
  font-size: 13px; font-weight: 500; color: #969696; margin-top: 8px;
  line-height: 1.5; max-width: 560px;
}
.gd-group { margin-bottom: 28px; }
.gd-group-lbl {
  font-size: 12px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: #f95bad; margin-bottom: 12px;
}
.gd-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;
}
.gd-card {
  display: block; text-decoration: none;
  background: #161616; border: 1px solid #252525; border-radius: 8px;
  padding: 14px 16px; transition: border-color 0.2s, background 0.2s;
}
.gd-card:hover { border-color: rgba(249,91,173,0.5); background: #191419; }
.gd-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.gd-ico {
  width: 34px; height: 34px; flex-shrink: 0;
  background: rgba(48,39,43,0.5); border: 1px solid #313131; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; color: #f95bad;
}
.gd-card-title { font-size: 14px; font-weight: 600; color: #fff; }
.gd-card-desc { font-size: 12px; font-weight: 500; color: #969696; line-height: 1.45; }
@media (max-width: 768px) {
  .gd-page { padding: 16px; }
  .gd-grid { grid-template-columns: 1fr; }
}
`;

type Icon = React.ReactNode;
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const IcoHome: Icon = <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const IcoUsers: Icon = <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;
const IcoShorts: Icon = <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>;
const IcoBlog: Icon = <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>;
const IcoChat: Icon = <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>;
const IcoCreate: Icon = <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>;
const IcoGen: Icon = <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>;
const IcoGallery: Icon = <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
const IcoHeart: Icon = <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>;
const IcoDiamond: Icon = <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><polygon points="6 3 18 3 22 9 12 22 2 9"/><line x1="2" y1="9" x2="22" y2="9"/></svg>;
const IcoToggle: Icon = <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><rect x="1" y="6" width="22" height="12" rx="6"/><circle cx="16" cy="12" r="3"/></svg>;
const IcoBell: Icon = <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
const IcoUser: Icon = <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="9" r="3"/><path d="M6.168 18.849A4 4 0 0 1 10 16h4a4 4 0 0 1 3.834 2.855"/></svg>;
const IcoGlobe: Icon = <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>;

type Item = { icon: Icon; titleKey: TKey; descKey: TKey; href?: string };

const GROUPS: { labelKey: TKey; items: Item[] }[] = [
  {
    labelKey: "guide.grpBrowse",
    items: [
      { icon: IcoHome,   titleKey: "guide.homeTitle",       descKey: "guide.homeDesc",       href: "/" },
      { icon: IcoUsers,  titleKey: "guide.charactersTitle", descKey: "guide.charactersDesc", href: "/characters" },
      { icon: IcoShorts, titleKey: "guide.shortsTitle",     descKey: "guide.shortsDesc",     href: "/shorts" },
      { icon: IcoBlog,   titleKey: "guide.blogTitle",       descKey: "guide.blogDesc",       href: "/blog" },
    ],
  },
  {
    labelKey: "guide.grpCreate",
    items: [
      { icon: IcoChat,    titleKey: "guide.chatTitle",     descKey: "guide.chatDesc",     href: "/chat" },
      { icon: IcoCreate,  titleKey: "guide.createTitle",   descKey: "guide.createDesc",   href: "/create" },
      { icon: IcoGen,     titleKey: "guide.generateTitle", descKey: "guide.generateDesc", href: "/generation" },
      { icon: IcoGallery, titleKey: "guide.galleryTitle",  descKey: "guide.galleryDesc",  href: "/gallery" },
      { icon: IcoHeart,   titleKey: "guide.myAiTitle",     descKey: "guide.myAiDesc",     href: "/my-ai" },
    ],
  },
  {
    labelKey: "guide.grpAccount",
    items: [
      { icon: IcoDiamond, titleKey: "guide.subscriptionTitle",  descKey: "guide.subscriptionDesc",  href: "/subscription" },
      { icon: IcoToggle,  titleKey: "guide.contentModeTitle",   descKey: "guide.contentModeDesc" },
      { icon: IcoBell,    titleKey: "guide.notificationsTitle", descKey: "guide.notificationsDesc" },
      { icon: IcoUser,    titleKey: "guide.accountTitle",       descKey: "guide.accountDesc",       href: "/profile" },
      { icon: IcoGlobe,   titleKey: "guide.languageTitle",      descKey: "guide.languageDesc" },
    ],
  },
];

export default function GuidePage() {
  const { t } = useT();

  const renderCard = (it: Item) => {
    const inner = (
      <>
        <div className="gd-card-head">
          <div className="gd-ico">{it.icon}</div>
          <span className="gd-card-title">{t(it.titleKey)}</span>
        </div>
        <div className="gd-card-desc">{t(it.descKey)}</div>
      </>
    );
    return it.href
      ? <Link key={it.titleKey} href={it.href} className="gd-card">{inner}</Link>
      : <div key={it.titleKey} className="gd-card">{inner}</div>;
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="gd-page">
        <div className="gd-head">
          <h1 className="gd-title">{t("guide.title")}</h1>
          <div className="gd-sub">{t("guide.subtitle")}</div>
        </div>

        {GROUPS.map((g) => (
          <div className="gd-group" key={g.labelKey}>
            <div className="gd-group-lbl">{t(g.labelKey)}</div>
            <div className="gd-grid">{g.items.map(renderCard)}</div>
          </div>
        ))}
      </div>
    </>
  );
}
