"use client";

import { useState } from "react";
import { useAuth } from "../../context/auth";
import type { UserProfile } from "../../lib/api";

const CSS = `
  :root {
    --bg-dark: #0b0512;
    --sidebar-bg: #120a1d;
    --accent-purple: #8e44ad;
    --active-violet: #6c5ce7;
    --text-main: #ffffff;
    --text-dim: #a0a0a0;
    --card-bg: #1c1427;
    --tag-border: #3d2b55;
    --coral: #ff7675;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background-color: var(--bg-dark);
    color: var(--text-main);
    display: flex;
    height: 100vh;
    overflow: hidden;
  }
  .sidebar {
    width: 250px;
    background-color: var(--sidebar-bg);
    border-right: 1px solid var(--tag-border);
    display: flex;
    flex-direction: column;
    padding: 20px 15px;
    flex-shrink: 0;
  }
  .logo { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: bold; margin-bottom: 30px; }
  .logo-box { width: 30px; height: 30px; background: linear-gradient(135deg, #a29bfe, #6c5ce7); border-radius: 6px; }
  .menu-item {
    display: flex; align-items: center; gap: 12px; padding: 10px 15px;
    color: var(--text-dim); text-decoration: none; border-radius: 8px; font-size: 14px; margin-bottom: 4px;
    transition: all 0.2s ease;
  }
  .menu-item:hover { color: white; background-color: rgba(255,255,255,0.05); transform: translateX(5px); }
  .menu-item.active { background-color: var(--active-violet); color: white; }
  .btn-footer {
    display: block; width: 100%; padding: 10px; margin-top: 8px;
    border: 1px solid var(--tag-border); background: transparent; color: white;
    border-radius: 8px; cursor: pointer; text-align: left; font-size: 13px;
  }
  .content { flex-grow: 1; overflow-y: auto; padding: 20px 40px; }
  .top-nav { display: flex; justify-content: flex-end; gap: 12px; margin-bottom: 25px; }
  .nav-btn {
    background: var(--card-bg); border: 1px solid var(--tag-border); color: white;
    padding: 6px 16px; border-radius: 20px; font-size: 13px; cursor: pointer;
    text-decoration: none; display: inline-block; transition: border-color 0.2s;
  }
  .nav-btn:hover { border-color: var(--active-violet); }

  /* Unauthenticated */
  .unauth-box {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: calc(100vh - 120px); gap: 24px; text-align: center;
  }
  .unauth-icon { font-size: 72px; opacity: 0.4; }
  .unauth-title { font-size: 26px; font-weight: 600; }
  .unauth-subtitle { font-size: 15px; color: var(--text-dim); max-width: 360px; line-height: 1.6; }
  .unauth-actions { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }
  .btn-primary {
    background: var(--active-violet); border: none; color: white;
    padding: 12px 28px; border-radius: 10px; font-size: 15px; font-weight: 600;
    cursor: pointer; text-decoration: none; display: inline-block;
  }
  .btn-secondary {
    background: transparent; border: 1px solid var(--tag-border); color: white;
    padding: 12px 28px; border-radius: 10px; font-size: 15px; font-weight: 600;
    cursor: pointer; text-decoration: none; display: inline-block;
  }

  /* Profile layout */
  .profile-container {
    display: flex; gap: 30px;
    border: 1px solid var(--tag-border); border-radius: 12px;
    padding: 25px; min-height: 500px;
  }
  .profile-nav { width: 220px; display: flex; flex-direction: column; gap: 10px; flex-shrink: 0; }
  .sub-nav-item {
    padding: 12px 15px; border-radius: 8px; color: var(--text-dim);
    cursor: pointer; font-size: 14px; border: 1px solid var(--tag-border);
    transition: 0.3s; text-align: center; user-select: none;
  }
  .sub-nav-item.active { background-color: var(--active-violet); color: white; border-color: var(--active-violet); }
  .tab-content { display: none; flex-grow: 1; }
  .tab-content.active { display: block; }
  .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
  .btn-danger { background: var(--coral); color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; }

  /* Form */
  .form-group { margin-bottom: 20px; }
  .label { display: block; color: var(--text-dim); font-size: 12px; margin-bottom: 8px; }
  .input-wrapper {
    background: rgba(0,0,0,0.2); border: 1px solid var(--tag-border);
    border-radius: 8px; display: flex; align-items: center; padding: 0 15px; height: 45px;
  }
  .input-wrapper input {
    background: transparent; border: none; color: white; flex-grow: 1;
    font-size: 14px; outline: none;
  }
  .icon-btn { color: var(--text-dim); cursor: pointer; font-size: 14px; margin-left: 10px; }
  .social-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px; }
  .social-box { display: flex; align-items: center; gap: 10px; }
  .social-icon { width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 12px; font-weight: bold; color: white; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .btn-settings { background: var(--active-violet); color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; width: 100%; margin-top: 20px; }

  /* Subscription */
  .subscription-card {
    background: rgba(255,255,255,0.02); border: 1px solid var(--tag-border);
    border-radius: 15px; padding: 25px; display: flex; gap: 40px;
  }
  .plan-info { background: rgba(0,0,0,0.2); border: 1px solid var(--tag-border); border-radius: 12px; padding: 20px; min-width: 220px; }
  .plan-header { display: flex; align-items: center; gap: 10px; font-size: 24px; font-weight: bold; margin-bottom: 15px; }
  .plan-icon { background: var(--active-violet); width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
  .plan-list { list-style: none; font-size: 13px; color: var(--text-dim); line-height: 1.8; }
  .plan-list li::before { content: "•"; margin-right: 8px; color: var(--active-violet); }
  .toggle { width: 40px; height: 20px; background: #3d2b55; border-radius: 10px; position: relative; cursor: pointer; transition: 0.3s; }
  .toggle::after { content: ""; position: absolute; width: 16px; height: 16px; background: white; border-radius: 50%; top: 2px; left: 2px; transition: 0.3s; }
  .toggle.on { background: var(--active-violet); }
  .toggle.on::after { left: 22px; }

  /* Preferences */
  .grid-images { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 30px; }
  .image-card {
    border: 1px solid var(--tag-border); border-radius: 10px; overflow: hidden;
    aspect-ratio: 1/1; cursor: pointer; transition: 0.2s; background: var(--card-bg);
  }
  .image-card.active { border: 2px solid var(--active-violet); }
  .image-card img { width: 100%; height: 100%; object-fit: cover; }
  .tag-group { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .tag {
    background: rgba(255,255,255,0.05); border: 1px solid var(--tag-border);
    color: var(--text-dim); padding: 6px 14px; border-radius: 20px;
    font-size: 12px; cursor: pointer; transition: 0.2s;
  }
  .tag.active { background: var(--active-violet); color: white; border-color: var(--active-violet); }

  /* Chat profiles */
  .profile-card {
    width: 280px; background: rgba(255,255,255,0.02);
    border: 1px solid var(--tag-border); border-radius: 12px; padding: 20px;
  }
  .profile-card-add {
    width: 280px; border: 2px dashed var(--tag-border); border-radius: 12px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    cursor: pointer; transition: 0.3s; color: var(--text-dim); min-height: 160px;
  }
  .profile-card-add:hover { border-color: var(--active-violet); color: white; }
`;

const TABS = ["subscription", "account", "prefs", "chat-profiles"] as const;
type Tab = (typeof TABS)[number];

function ToggleSwitch() {
  const [on, setOn] = useState(true);
  return <div className={`toggle${on ? " on" : ""}`} onClick={() => setOn(!on)} />;
}

function TagItem({ label, defaultActive }: { label: string; defaultActive?: boolean }) {
  const [active, setActive] = useState(!!defaultActive);
  return (
    <div className={`tag${active ? " active" : ""}`} onClick={() => setActive(!active)}>
      {label}
    </div>
  );
}

function ImageCard({ src, defaultActive }: { src: string; defaultActive?: boolean }) {
  const [active, setActive] = useState(!!defaultActive);
  return (
    <div className={`image-card${active ? " active" : ""}`} onClick={() => setActive(!active)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Style" />
    </div>
  );
}

function SubscriptionTab({ user }: { user: UserProfile }) {
  const planName = user.subscription === "premium" ? "Премиум" : "Базовый";
  return (
    <>
      <div className="section-header"><h2>Подписка</h2></div>
      <div className="subscription-card">
        <div className="plan-info">
          <div className="plan-header">
            <div className="plan-icon">🚀</div>
            <span>{planName}</span>
          </div>
          <ul className="plan-list">
            <li>10 сообщений</li>
            <li>10 генераций</li>
            <li>Фото и видео</li>
            <li>100 жизней</li>
          </ul>
        </div>
        <div style={{ flexGrow: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--tag-border)", paddingBottom: 10 }}>
            <span>Автоматическое продление</span>
            <ToggleSwitch />
          </div>
          <p style={{ marginTop: 15, fontSize: 13, color: "var(--text-dim)" }}>
            Дата следующего списания: 18.02.2026
          </p>
          <button className="btn-settings">⚙️ Настройки подписки</button>
        </div>
      </div>
    </>
  );
}

function AccountTab({ user }: { user: UserProfile }) {
  const vkLink = user.socialLinks?.find((l) => l.type === "vk")?.url ?? "";
  const igLink = user.socialLinks?.find((l) => l.type === "instagram")?.url ?? "";
  const xLink = user.socialLinks?.find((l) => l.type === "twitter")?.url ?? "";

  return (
    <>
      <div className="section-header">
        <h2>Аккаунт</h2>
        <button className="btn-danger">🗑️ Удалить аккаунт</button>
      </div>
      <div className="form-group">
        <span className="label">Никнейм</span>
        <div className="input-wrapper">
          <input type="text" defaultValue={user.nickname ?? ""} placeholder="Mynickname" />
          <span className="icon-btn">📝</span>
        </div>
      </div>
      <span className="label">Ссылки на соцсети</span>
      <div className="social-grid">
        <div className="social-box">
          <div className="social-icon" style={{ background: "#0077FF" }}>VK</div>
          <div className="input-wrapper" style={{ flexGrow: 1 }}>
            <input type="text" defaultValue={vkLink} placeholder="https://vk.com/feed" />
            <span className="icon-btn">🗑️</span>
          </div>
        </div>
        <div className="social-box">
          <div className="social-icon" style={{ background: "linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)" }}>IG</div>
          <div className="input-wrapper" style={{ flexGrow: 1 }}>
            <input type="text" defaultValue={igLink} placeholder="http://instagram.com/" />
            <span className="icon-btn">🗑️</span>
          </div>
        </div>
        <div className="social-box">
          <div className="social-icon" style={{ background: "#000" }}>X</div>
          <div className="input-wrapper" style={{ flexGrow: 1 }}>
            <input type="text" defaultValue={xLink} placeholder="http://x.com/" />
            <span className="icon-btn">🗑️</span>
          </div>
        </div>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <span className="label">Email</span>
          <div className="input-wrapper">
            <input type="text" defaultValue={user.email} placeholder="mail@mail.ru" />
            <span className="icon-btn">📝</span>
            <span className="icon-btn">🗑️</span>
          </div>
        </div>
        <div className="form-group">
          <span className="label">Дополнительный Email</span>
          <div className="input-wrapper">
            <input type="text" placeholder="mail@mail.ru" />
            <span className="icon-btn">📝</span>
            <span className="icon-btn">🗑️</span>
          </div>
        </div>
      </div>
      <span className="label">Изменить пароль</span>
      <div className="grid-2" style={{ marginBottom: 15 }}>
        <div className="input-wrapper"><input type="password" placeholder="Старый пароль" /></div>
        <div className="input-wrapper"><input type="password" placeholder="Повторите пароль" /></div>
      </div>
      <button className="btn-settings" style={{ marginTop: 0 }}>Сохранить новый пароль</button>
    </>
  );
}

function PrefsTab() {
  return (
    <>
      <div className="section-header"><h2>Выбор пола, стиля графики</h2></div>
      <div className="grid-images">
        <ImageCard src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop" defaultActive />
        <ImageCard src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop" />
        <ImageCard src="https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?w=200&h=200&fit=crop" />
        <ImageCard src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop" />
        <ImageCard src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop" />
      </div>
      <div className="section-header" style={{ marginBottom: 10 }}><h2>Теги характеристик</h2></div>
      <div className="form-group">
        <span className="label">Внешность</span>
        <div className="tag-group">
          <TagItem label="Romantic" defaultActive />
          <TagItem label="Athletic" defaultActive />
          <TagItem label="Caring" defaultActive />
          <TagItem label="Virgin" />
          <TagItem label="College Student" />
          <TagItem label="Anime" />
          <TagItem label="Vintage" />
        </div>
      </div>
      <div className="form-group">
        <span className="label">Хобби</span>
        <div className="tag-group">
          <TagItem label="Gaming" defaultActive />
          <TagItem label="Fitness" defaultActive />
          <TagItem label="Travel" />
          <TagItem label="Music" />
          <TagItem label="Cooking" />
          <TagItem label="Art" />
        </div>
      </div>
    </>
  );
}

function ChatProfilesTab() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
      <div className="profile-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 5 }}>
          <h3 style={{ fontSize: 18, fontWeight: "bold" }}>Aduard</h3>
          <div style={{ display: "flex", gap: 10 }}>
            <span style={{ cursor: "pointer", opacity: 0.7 }}>📝</span>
            <span style={{ cursor: "pointer", color: "var(--coral)" }}>🗑️</span>
          </div>
        </div>
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 15 }}>23 года</p>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text-dim)" }}>
          Lorem ipsum dolor sit amet consectetur. Adipiscing augue dolor libero sem quis quis ac viverra.
        </p>
      </div>
      <div className="profile-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 5 }}>
          <h3 style={{ fontSize: 18, fontWeight: "bold" }}>Boris</h3>
          <div style={{ display: "flex", gap: 10 }}>
            <span style={{ cursor: "pointer", opacity: 0.7 }}>📝</span>
            <span style={{ cursor: "pointer", color: "var(--coral)" }}>🗑️</span>
          </div>
        </div>
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 15 }}>40 лет</p>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text-dim)" }}>
          Lorem ipsum dolor sit amet consectetur. Adipiscing augue dolor libero sem quis quis ac viverra.
        </p>
      </div>
      <div className="profile-card-add">
        <span style={{ fontSize: 24, marginBottom: 8 }}>👤⁺</span>
        <span style={{ fontSize: 14 }}>Добавить профиль чата</span>
      </div>
    </div>
  );
}

function ProfileContent({ user, onLogout }: { user: UserProfile; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>("account");
  const isAdmin = user.role === "admin";

  return (
    <>
      <header className="top-nav">
        {isAdmin && (
          <a href="/admin" className="nav-btn">⚙️ Админ</a>
        )}
        <button className="nav-btn" onClick={onLogout}>👤 Выйти</button>
        <button className="nav-btn">🌐 Русский</button>
      </header>
      <div className="profile-container">
        <div className="profile-nav">
          <div
            className={`sub-nav-item${activeTab === "subscription" ? " active" : ""}`}
            onClick={() => setActiveTab("subscription")}
          >
            Подписка
          </div>
          <div
            className={`sub-nav-item${activeTab === "account" ? " active" : ""}`}
            onClick={() => setActiveTab("account")}
          >
            Аккаунт
          </div>
          <div
            className={`sub-nav-item${activeTab === "prefs" ? " active" : ""}`}
            onClick={() => setActiveTab("prefs")}
          >
            Предпочтения
          </div>
          <div
            className={`sub-nav-item${activeTab === "chat-profiles" ? " active" : ""}`}
            onClick={() => setActiveTab("chat-profiles")}
          >
            Профили для чатов
          </div>
        </div>
        <div className="tab-content active" style={{ display: "block", flexGrow: 1 }}>
          {activeTab === "subscription" && <SubscriptionTab user={user} />}
          {activeTab === "account" && <AccountTab user={user} />}
          {activeTab === "prefs" && <PrefsTab />}
          {activeTab === "chat-profiles" && <ChatProfilesTab />}
        </div>
      </div>
    </>
  );
}

function UnauthContent() {
  return (
    <>
      <header className="top-nav">
        <a href="/login" className="nav-btn">👤 Профиль</a>
        <button className="nav-btn">🌐 Русский</button>
      </header>
      <div className="unauth-box">
        <div className="unauth-icon">🔒</div>
        <div>
          <div className="unauth-title">Вы не вошли в профиль</div>
          <div className="unauth-subtitle">
            Войдите в аккаунт или создайте новый, чтобы получить доступ к профилю и персональным настройкам.
          </div>
        </div>
        <div className="unauth-actions">
          <a href="/login" className="btn-primary">Авторизоваться</a>
          <a href="/register" className="btn-secondary">Создать аккаунт</a>
        </div>
      </div>
    </>
  );
}

export default function ProfilePage() {
  const { user, loading, logout } = useAuth();

  async function handleLogout() {
    await logout();
    window.location.href = "/login";
  }

  if (loading) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-box"></div>
          <span>Leonardo.Ai</span>
        </div>
        <nav>
          <a href="/" className="menu-item">🏠 Главная</a>
          <a href="#" className="menu-item">📱 Шортсы</a>
          <a href="/generation" className="menu-item">📸 Фото/видео</a>
          <a href="#" className="menu-item">👤 Мой AI</a>
          <a href="#" className="menu-item">🖼️ Галерея</a>
          <a href="#" className="menu-item">✨ Персонаж</a>
          <a href="/chat" className="menu-item">💬 Чат</a>
        </nav>
        <div style={{ marginTop: "auto" }}>
          <button className="btn-footer">👑 Премиум</button>
          <button className="btn-footer">📘 Гайд</button>
        </div>
      </aside>
      <main className="content">
        {user ? (
          <ProfileContent user={user} onLogout={handleLogout} />
        ) : (
          <UnauthContent />
        )}
      </main>
    </>
  );
}
