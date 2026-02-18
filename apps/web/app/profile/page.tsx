"use client";

import { useAuth } from "../../context/auth";

const CSS = `
  :root {
    --bg-dark: #0b0512;
    --sidebar-bg: #120a1d;
    --accent-purple: #8e44ad;
    --active-violet: #6c5ce7;
    --text-main: #ffffff;
    --text-dim: #a0a0a0;
    --card-bg: #1c1427;
    --coral: #ff7675;
    --tag-border: #3d2b55;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { margin: 0; }
  .profile-root {
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
    transition: all 0.2s ease;
  }
  .btn-footer:hover { background-color: var(--tag-border); }
  .content { flex-grow: 1; overflow-y: auto; padding: 20px 40px; }
  .top-nav { display: flex; justify-content: flex-end; gap: 12px; margin-bottom: 25px; }
  .nav-btn {
    background: var(--card-bg); border: 1px solid var(--tag-border); color: white;
    padding: 6px 16px; border-radius: 20px; font-size: 13px; cursor: pointer;
    transition: all 0.2s ease; text-decoration: none; display: inline-block;
  }
  .nav-btn:hover { border-color: var(--active-violet); }
  .nav-btn.active { background-color: var(--active-violet); border-color: var(--active-violet); }

  /* Unauthenticated state */
  .unauth-box {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: calc(100vh - 120px); gap: 24px; text-align: center;
  }
  .unauth-icon { font-size: 72px; opacity: 0.4; }
  .unauth-title { font-size: 26px; font-weight: 600; color: var(--text-main); }
  .unauth-subtitle { font-size: 15px; color: var(--text-dim); max-width: 360px; line-height: 1.6; }
  .unauth-actions { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }
  .btn-primary {
    background: var(--active-violet); border: none; color: white;
    padding: 12px 28px; border-radius: 10px; font-size: 15px; font-weight: 600;
    cursor: pointer; text-decoration: none; display: inline-block;
    transition: background 0.2s ease, transform 0.15s ease;
  }
  .btn-primary:hover { background: #7d6dfa; transform: translateY(-2px); }
  .btn-secondary {
    background: transparent; border: 1px solid var(--tag-border); color: white;
    padding: 12px 28px; border-radius: 10px; font-size: 15px; font-weight: 600;
    cursor: pointer; text-decoration: none; display: inline-block;
    transition: border-color 0.2s ease, transform 0.15s ease;
  }
  .btn-secondary:hover { border-color: var(--active-violet); transform: translateY(-2px); }

  /* Authenticated state */
  .profile-header {
    background: linear-gradient(90deg, #6c5ce7 0%, #a29bfe 100%);
    border-radius: 16px; padding: 30px 35px; display: flex; align-items: center;
    gap: 24px; margin-bottom: 30px;
  }
  .avatar {
    width: 80px; height: 80px; border-radius: 50%;
    background: rgba(255,255,255,0.2); display: flex; align-items: center;
    justify-content: center; font-size: 36px; flex-shrink: 0;
  }
  .profile-name { font-size: 22px; font-weight: bold; margin-bottom: 4px; }
  .profile-email { font-size: 14px; opacity: 0.8; }
  .profile-badge {
    display: inline-block; background: rgba(255,255,255,0.2);
    border-radius: 12px; padding: 2px 10px; font-size: 12px; margin-top: 6px;
  }
  .section { background: var(--card-bg); border-radius: 14px; padding: 24px; margin-bottom: 16px; }
  .section-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: var(--text-main); }
  .section-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 0; border-bottom: 1px solid var(--tag-border); font-size: 14px;
  }
  .section-row:last-child { border-bottom: none; }
  .section-row-label { color: var(--text-dim); }
  .section-row-value { color: var(--text-main); }
  .btn-admin {
    display: flex; align-items: center; gap: 10px;
    background: linear-gradient(135deg, #e74c3c, #c0392b);
    border: none; color: white; padding: 14px 24px;
    border-radius: 12px; font-size: 15px; font-weight: 600;
    cursor: pointer; width: 100%; margin-bottom: 16px;
    transition: opacity 0.2s ease, transform 0.15s ease;
    text-decoration: none;
  }
  .btn-admin:hover { opacity: 0.9; transform: translateY(-2px); }
  .btn-logout {
    background: transparent; border: 1px solid var(--coral); color: var(--coral);
    padding: 10px 24px; border-radius: 10px; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: all 0.2s ease;
  }
  .btn-logout:hover { background: var(--coral); color: white; }
`;

function Sidebar() {
  return (
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
        <a href="/profile" className="menu-item active">👤 Профиль</a>
      </nav>
      <div style={{ marginTop: "auto" }}>
        <button className="btn-footer">👑 Премиум</button>
        <button className="btn-footer">📘 Гайд</button>
      </div>
    </aside>
  );
}

function UnauthenticatedView() {
  return (
    <div className="unauth-box">
      <div className="unauth-icon">🔒</div>
      <div>
        <div className="unauth-title">Вы не вошли в профиль</div>
        <div className="unauth-subtitle">
          Войдите в аккаунт или создайте новый, чтобы получить доступ к
          профилю и персональным настройкам.
        </div>
      </div>
      <div className="unauth-actions">
        <a href="/login" className="btn-primary">Авторизоваться</a>
        <a href="/register" className="btn-secondary">Создать аккаунт</a>
      </div>
    </div>
  );
}

function AuthenticatedView({
  user,
  onLogout,
}: {
  user: import("../../lib/api").UserProfile;
  onLogout: () => void;
}) {
  const isAdmin = user.role === "admin";
  const displayName = user.nickname || user.email.split("@")[0];

  return (
    <>
      {isAdmin && (
        <a href="/admin" className="btn-admin">
          ⚙️ Панель администратора
        </a>
      )}

      <div className="profile-header">
        <div className="avatar">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt={displayName}
              style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            "👤"
          )}
        </div>
        <div>
          <div className="profile-name">{displayName}</div>
          <div className="profile-email">{user.email}</div>
          <span className="profile-badge">
            {isAdmin ? "Администратор" : "Пользователь"}
          </span>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Аккаунт</div>
        <div className="section-row">
          <span className="section-row-label">Email</span>
          <span className="section-row-value">{user.email}</span>
        </div>
        <div className="section-row">
          <span className="section-row-label">Никнейм</span>
          <span className="section-row-value">{displayName}</span>
        </div>
        <div className="section-row">
          <span className="section-row-label">Роль</span>
          <span className="section-row-value">
            {isAdmin ? "Администратор" : "Пользователь"}
          </span>
        </div>
        <div className="section-row">
          <span className="section-row-label">Язык</span>
          <span className="section-row-value">{user.lang?.toUpperCase() || "RU"}</span>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Подписка</div>
        <div className="section-row">
          <span className="section-row-label">Тариф</span>
          <span className="section-row-value">
            {user.subscription === "premium" ? "👑 Премиум" : "Бесплатный"}
          </span>
        </div>
        <div className="section-row">
          <span className="section-row-label">Дата регистрации</span>
          <span className="section-row-value">
            {new Date(user.createdAt).toLocaleDateString("ru-RU")}
          </span>
        </div>
      </div>

      <div style={{ marginTop: "8px" }}>
        <button className="btn-logout" onClick={onLogout}>
          Выйти из аккаунта
        </button>
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

  // Show nothing during initial auth check to avoid flash
  if (loading) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="profile-root">
        <Sidebar />
        <main className="content">
          <header className="top-nav">
            <a href="/profile" className="nav-btn active">
              👤 Профиль
            </a>
            <button className="nav-btn">🌐 Русский</button>
          </header>
          {user ? (
            <AuthenticatedView user={user} onLogout={handleLogout} />
          ) : (
            <UnauthenticatedView />
          )}
        </main>
      </div>
    </>
  );
}
