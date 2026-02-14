import React from "react";

export const dynamic = "force-static";

const HTML = `<style>:root {
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

        #app-root {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: var(--bg-dark);
            color: var(--text-main);
            display: flex;
            height: 100vh;
            overflow: hidden;
        }

        /* Sidebar */
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
            /* Добавлено: плавность анимации */
            transition: all 0.2s ease;
        }

        /* Добавлено: анимация наведения на меню */
        .menu-item:hover {
            color: white;
            background-color: rgba(255, 255, 255, 0.05);
            transform: translateX(5px);
        }

        .menu-item.active { background-color: var(--active-violet); color: white; }

        .btn-footer {
            display: block; width: 100%; padding: 10px; margin-top: 8px;
            border: 1px solid var(--tag-border); background: transparent; color: white;
            border-radius: 8px; cursor: pointer; text-align: left; font-size: 13px;
            /* Добавлено */
            transition: all 0.2s ease;
        }

        .btn-footer:hover {
            background-color: var(--tag-border);
        }

        /* Content Area */
        .content { flex-grow: 1; overflow-y: auto; padding: 20px 40px; }

        .top-nav { display: flex; justify-content: flex-end; gap: 12px; margin-bottom: 25px; }
        .nav-btn {
            background: var(--card-bg); border: 1px solid var(--tag-border); color: white;
            padding: 6px 16px; border-radius: 20px; font-size: 13px; cursor: pointer;
            text-decoration: none; display: inline-block;
            transition: all 0.2s ease;
        }
        .nav-btn:hover { border-color: var(--active-violet); }

        /* Hero */
        .hero {
            background: linear-gradient(90deg, #6c5ce7 0%, #a29bfe 100%);
            border-radius: 16px; padding: 35px; display: flex; justify-content: space-between;
            align-items: center; margin-bottom: 35px;
        }
        .hero h1 { font-size: 32px; margin-bottom: 15px; }
        .btn-create { 
            background: var(--coral); border: none; color: white; padding: 10px 25px; 
            border-radius: 8px; font-weight: bold; cursor: pointer;
            transition: transform 0.2s ease;
        }
        .btn-create:hover { transform: scale(1.05); }

        /* Filters & Tags */
        .section-title { font-size: 18px; margin: 25px 0 15px; }
        .filters-header { display: flex; justify-content: space-between; align-items: center; }
        .search-box { background: var(--card-bg); border: 1px solid var(--tag-border); padding: 10px 15px; border-radius: 10px; width: 320px; color: white; font-size: 13px; }

        .primary-tags { display: flex; gap: 8px; margin: 20px 0 12px; }
        
        .tag { 
            background: var(--card-bg); color: var(--text-dim); padding: 6px 14px; 
            border-radius: 15px; font-size: 12px; cursor: pointer;
            /* Добавлено */
            transition: all 0.2s ease;
        }

        /* Добавлено: анимация тегов */
        .tag:hover:not(.active) {
            background-color: #251b35;
            color: white;
            transform: translateY(-2px);
        }

        .tag.active { background: var(--coral); color: white; }

        .secondary-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 30px; }
        
        .tag-sm { 
            background: var(--card-bg); color: #888; padding: 4px 10px; 
            border-radius: 6px; font-size: 11px; border: 1px solid var(--tag-border); cursor: pointer;
            /* Добавлено */
            transition: all 0.2s ease;
        }

        /* Добавлено: анимация мелких тегов */
        .tag-sm:hover {
            border-color: var(--active-violet);
            color: white;
            background-color: rgba(108, 92, 231, 0.1);
        }

        /* Character Grid */
        .char-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 20px;
            padding-bottom: 40px;
        }

        .char-card {
            background: var(--card-bg);
            border-radius: 14px;
            overflow: hidden;
            position: relative;
            height: 300px;
            cursor: pointer;
            border: 2px solid transparent;
            transition: border-color 0.3s ease;
        }

        .char-card:hover {
            border-color: var(--active-violet);
        }

        .char-img {
            height: 100%;
            width: 100%;
            background: #2d1b44;
            background-image: url('https://via.placeholder.com/200x300/2d1b44/ffffff?text=AI+Girl'); 
            background-size: cover;
            transition: filter 0.3s ease;
        }

        .char-card:hover .char-img {
            filter: brightness(0.4);
        }

        .char-info {
            position: absolute;
            bottom: 0;
            padding: 15px;
            width: 100%;
            z-index: 2;
            opacity: 0;
            transform: translateY(20px);
            transition: opacity 0.3s ease, transform 0.3s ease;
        }

        .char-card:hover .char-info {
            opacity: 1;
            transform: translateY(0);
        }

        .char-info h4 { font-size: 15px; margin-bottom: 5px; color: white; }
        .char-info p { font-size: 11px; color: #ddd; line-height: 1.4; margin-bottom: 12px; }

        .btn-chat {
            width: 100%;
            background: var(--active-violet);
            border: none;
            color: white;
            padding: 8px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: bold;
            cursor: pointer;
            transition: background 0.2s;
        }

        .btn-chat:hover { background: #7d6dfa; }

        .pagination {
            display: flex;
            justify-content: center;
            gap: 10px;
            margin-top: 20px;
            color: var(--text-dim);
            font-size: 14px;
        }
        /* Добавлено для страниц */
        .pagination span { cursor: pointer; transition: color 0.2s; }
        .pagination span:hover { color: white; }</style><div id='app-root'><aside class="sidebar">
        <div class="logo">
            <div class="logo-box"></div>
            <span>Leonardo.Ai</span>
        </div>
        <nav>
            <a href="/" class="menu-item active">🏠 Главная</a>
            <a href="#" class="menu-item">📱 Шортсы</a>
            <a href="/generation" class="menu-item">📸 Фото/видео</a>
            <a href="#" class="menu-item">👤 Мой AI</a>
            <a href="#" class="menu-item">🖼️ Галерея</a>
            <a href="#" class="menu-item">✨ Персонаж</a>
            <a href="#" class="menu-item">💬 Чат</a>
        </nav>
        <div style="margin-top: auto;">
            <button class="btn-footer">👑 Премиум</button>
            <button class="btn-footer">📘 Гайд</button>
        </div>
    </aside>

    <main class="content">
        <header class="top-nav">
            <a href="/profile" class="nav-btn">👤 Профиль</a>
            <button class="nav-btn">🌐 Русский</button>
        </header>

        <section class="hero">
            <div>
                <h1>Создай девушку<br>своей мечты</h1>
                <button class="btn-create">✨ Создать</button>
            </div>
        </section>

        <div class="filters-header">
            <h3 class="section-title">Ai персонажи</h3>
            <input type="text" class="search-box" placeholder="Найди характер, внешность, возраст">
        </div>

        <div class="primary-tags">
            <span class="tag active">⭐ Популярное</span>
            <span class="tag">🕒 Недавнее</span>
            <span class="tag">📈 Тренды</span>
            <span class="tag">🆕 Новое</span>
        </div>

        <div class="secondary-tags">
            <span class="tag-sm">Romantic</span>
            <span class="tag-sm">Athletic</span>
            <span class="tag-sm">Caring</span>
            <span class="tag-sm">Virgin</span>
            <span class="tag-sm">Anime</span>
            <span class="tag-sm">College Student</span>
            <span class="tag-sm">Показать все ▿</span>
        </div>

        <section class="char-grid">
            <div class="char-card">
                <div class="char-img"></div>
                <div class="char-info">
                    <h4>Harriet, 20</h4>
                    <p>The soft, curvy new girl in the office doesn't seem to mind when you stare...</p>
                    <button class="btn-chat">💬 Chat</button>
                </div>
            </div>
            <div class="char-card">
                <div class="char-img"></div>
                <div class="char-info">
                    <h4>Jessica, 22</h4>
                    <p>A tall, athletic trainer who loves to push your limits at the gym.</p>
                    <button class="btn-chat">💬 Chat</button>
                </div>
            </div>
            <div class="char-card"><div class="char-img"></div><div class="char-info"><h4>Harriet, 20</h4><p>The soft, curvy new girl...</p><button class="btn-chat">💬 Chat</button></div></div>
            <div class="char-card"><div class="char-img"></div><div class="char-info"><h4>Harriet, 20</h4><p>The soft, curvy new girl...</p><button class="btn-chat">💬 Chat</button></div></div>
            <div class="char-card"><div class="char-img"></div><div class="char-info"><h4>Harriet, 20</h4><p>The soft, curvy new girl...</p><button class="btn-chat">💬 Chat</button></div></div>
            <div class="char-card"><div class="char-img"></div><div class="char-info"><h4>Harriet, 20</h4><p>The soft, curvy new girl...</p><button class="btn-chat">💬 Chat</button></div></div>
            <div class="char-card"><div class="char-img"></div><div class="char-info"><h4>Harriet, 20</h4><p>The soft, curvy new girl...</p><button class="btn-chat">💬 Chat</button></div></div>
            <div class="char-card"><div class="char-img"></div><div class="char-info"><h4>Harriet, 20</h4><p>The soft, curvy new girl...</p><button class="btn-chat">💬 Chat</button></div></div>
        </section>

        <div class="pagination">
            <span>&lt; Первая</span>
            <span style="color: white; font-weight: bold;">1</span>
            <span>2</span>
            <span>3</span>
            <span>4</span>
            <span>Последняя &gt;</span>
        </div>
    </main></div>`;

export default function HomePage() {
  return React.createElement("div", {
    suppressHydrationWarning: true,
    dangerouslySetInnerHTML: { __html: HTML },
  });
}
