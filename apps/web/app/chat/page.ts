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
            --chat-bubble-ai: #2d1b44;
            --chat-bubble-user: #4a3b61;
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
            transition: all 0.2s ease;
        }
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
            transition: all 0.2s ease;
        }
        .btn-footer:hover { background-color: var(--tag-border); }
        /* Content */
        .content { flex-grow: 1; display: flex; overflow: hidden; }
        /* Chat List Panel */
        .chat-list-panel {
            width: 300px;
            border-right: 1px solid var(--tag-border);
            display: flex;
            flex-direction: column;
            padding: 20px 15px;
        }
        .chat-title { font-size: 20px; margin-bottom: 15px; }
        .search-chat {
            background: var(--card-bg);
            border: 1px solid var(--tag-border);
            padding: 10px;
            border-radius: 8px;
            color: white;
            margin-bottom: 20px;
            width: 100%;
        }
        .chat-item {
            display: flex;
            gap: 12px;
            padding: 12px;
            border-radius: 12px;
            cursor: pointer;
            margin-bottom: 5px;
            transition: 0.2s;
        }
        .chat-item:hover { background: rgba(255,255,255,0.05); }
        .chat-item.active { background: #2d1b44; }
        .chat-avatar { width: 44px; height: 44px; border-radius: 50%; background: #4a3b61; flex-shrink: 0; }
        .chat-info { overflow: hidden; }
        .chat-info h4 { font-size: 14px; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; }
        .chat-info h4 span { font-size: 10px; color: var(--text-dim); }
        .chat-info p { font-size: 11px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        /* Messages Panel */
        .messages-panel {
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            padding: 20px;
            border-right: 1px solid var(--tag-border);
        }
        .messages-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding-bottom: 15px;
            border-bottom: 1px solid var(--tag-border);
            margin-bottom: 20px;
        }
        .messages-scroll {
            flex-grow: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 15px;
            padding-right: 10px;
        }
        .bubble {
            max-width: 80%;
            padding: 12px 16px;
            border-radius: 14px;
            font-size: 13px;
            line-height: 1.5;
        }
        .bubble.ai { background: var(--chat-bubble-ai); align-self: flex-start; }
        .bubble.user { background: var(--chat-bubble-user); align-self: flex-end; }
        .bubble-img { width: 100%; border-radius: 12px; margin-top: 10px; display: block; }
        .msg-date { font-size: 10px; color: var(--text-dim); margin-top: 5px; display: block; }
        .chat-input-container {
            margin-top: 20px;
            background: var(--card-bg);
            border: 1px solid var(--tag-border);
            border-radius: 12px;
            padding: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .chat-input { flex-grow: 1; background: transparent; border: none; color: white; outline: none; }
        .chat-btn { background: var(--active-violet); color: white; border: none; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; }
        /* Profile Panel */
        .profile-panel {
            width: 320px;
            padding: 20px;
            overflow-y: auto;
        }
        .profile-name { font-size: 22px; margin-bottom: 10px; }
        .profile-bio { font-size: 12px; color: var(--text-dim); margin-bottom: 20px; line-height: 1.4; }
        .profile-img { width: 100%; border-radius: 15px; margin-bottom: 20px; }
        .profile-actions { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
        .action-primary { background: var(--active-violet); border: none; color: white; padding: 12px; border-radius: 10px; font-weight: bold; cursor: pointer; }
        .action-secondary { background: transparent; border: 1px solid var(--tag-border); color: white; padding: 12px; border-radius: 10px; cursor: pointer; }
        .profile-stats {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            font-size: 12px;
        }
        .stat-item span { color: var(--text-dim); display: block; font-size: 10px; margin-bottom: 2px; }
        .full-stat { grid-column: 1 / -1; }</style><div id='app-root'><aside class="sidebar">
        <div class="logo">
            <div class="logo-box"></div>
            <span>Leonardo.Ai</span>
        </div>
        <nav>
            <a href="/" class="menu-item">\u{1F3E0} \u0413\u043B\u0430\u0432\u043D\u0430\u044F</a>
            <a href="#" class="menu-item">\u{1F4F1} \u0428\u043E\u0440\u0442\u0441\u044B</a>
            <a href="/generation" class="menu-item">\u{1F4F8} \u0424\u043E\u0442\u043E/\u0432\u0438\u0434\u0435\u043E</a>
            <a href="#" class="menu-item">\u{1F464} \u041C\u043E\u0439 AI</a>
            <a href="#" class="menu-item">\u{1F5BC}\uFE0F \u0413\u0430\u043B\u0435\u0440\u0435\u044F</a>
            <a href="#" class="menu-item">\u2728 \u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436</a>
            <a href="/chat" class="menu-item active">\u{1F4AC} \u0427\u0430\u0442</a>
        </nav>
        <div style="margin-top: auto;">
            <button class="btn-footer">\u{1F451} \u041F\u0440\u0435\u043C\u0438\u0443\u043C</button>
            <button class="btn-footer">\u{1F4D8} \u0413\u0430\u0439\u0434</button>
        </div>
    </aside>
    <main class="content">
        <section class="chat-list-panel">
            <h2 class="chat-title">\u0427\u0430\u0442</h2>
            <input type="text" class="search-chat" placeholder="\u{1F50D} \u041D\u0430\u0439\u0442\u0438 \u043F\u0440\u043E\u0444\u0438\u043B\u044C">

            <div class="chat-item active" onclick="switchChat(this)">
                <div class="chat-avatar"></div>
                <div class="chat-info">
                    <h4>Luna Zameskens <span>13/08/25</span></h4>
                    <p>sadf sef yua set sefse fset sefvsgaega...</p>
                </div>
            </div>
            <div class="chat-item" onclick="switchChat(this)">
                <div class="chat-avatar" style="filter: hue-rotate(0deg)"></div>
                <div class="chat-info">
                    <h4>Luna Zameskens <span>13/08/25</span></h4>
                    <p>sadf sef yua set sefse fset sefvsgaega...</p>
                </div>
            </div>
            <div class="chat-item" onclick="switchChat(this)">
                <div class="chat-avatar" style="filter: hue-rotate(40deg)"></div>
                <div class="chat-info">
                    <h4>Luna Zameskens <span>13/08/25</span></h4>
                    <p>sadf sef yua set sefse fset sefvsgaega...</p>
                </div>
            </div>
            <div class="chat-item" onclick="switchChat(this)">
                <div class="chat-avatar" style="filter: hue-rotate(80deg)"></div>
                <div class="chat-info">
                    <h4>Luna Zameskens <span>13/08/25</span></h4>
                    <p>sadf sef yua set sefse fset sefvsgaega...</p>
                </div>
            </div>
            <div class="chat-item" onclick="switchChat(this)">
                <div class="chat-avatar" style="filter: hue-rotate(120deg)"></div>
                <div class="chat-info">
                    <h4>Luna Zameskens <span>13/08/25</span></h4>
                    <p>sadf sef yua set sefse fset sefvsgaega...</p>
                </div>
            </div>
            <div class="chat-item" onclick="switchChat(this)">
                <div class="chat-avatar" style="filter: hue-rotate(160deg)"></div>
                <div class="chat-info">
                    <h4>Luna Zameskens <span>13/08/25</span></h4>
                    <p>sadf sef yua set sefse fset sefvsgaega...</p>
                </div>
            </div>
            <div class="chat-item" onclick="switchChat(this)">
                <div class="chat-avatar" style="filter: hue-rotate(200deg)"></div>
                <div class="chat-info">
                    <h4>Luna Zameskens <span>13/08/25</span></h4>
                    <p>sadf sef yua set sefse fset sefvsgaega...</p>
                </div>
            </div>
        </section>
        <section class="messages-panel">
            <div class="messages-header">
                <div class="chat-avatar" style="width: 30px; height: 30px;"></div>
                <span style="font-weight: bold;">Luna Zameskens</span>
            </div>
            <div class="messages-scroll">
                <div class="bubble ai">
                    \u044B\u0432\u0430\u043F\u0430 \u043F\u044B gsfsd sdarg sdgd gdgvs dfg argae fgsafsdfva serg dv dvdg ewfsd sagz dvdrgSvdzg
                    <span class="msg-date">13/08/25</span>
                </div>
                <div class="bubble user">
                    \u044B\u0432\u0430\u043F\u0430 \u043F\u044B gsfsd argae fgsafsdfva serg dv dvdg ewfsd sagz dvdrgSvdzg
                    <span class="msg-date">13/08/25</span>
                </div>
                <div class="bubble user">
                    \u044B\u0432\u0430\u043F\u0430 \u043F\u044B gsfsd
                    <span class="msg-date">13/08/25</span>
                </div>
                <div class="bubble ai">
                    <img src="https://via.placeholder.com/400x300/2d1b44/8e44ad?text=Generated+Scene" class="bubble-img">
                    <span class="msg-date">13/08/25</span>
                </div>
            </div>
            <div class="chat-input-container">
                <button class="chat-btn" style="background: transparent; color: var(--text-dim);">\u{1F4F7}</button>
                <button class="chat-btn" style="background: transparent; color: var(--text-dim);">\u{1F381}</button>
                <input type="text" class="chat-input" placeholder="\u044B\u0432\u0430\u043F\u0430 \u043F\u044B gsfsd">
                <button class="chat-btn">\u27A4</button>
            </div>
        </section>
        <section class="profile-panel">
            <h2 class="profile-name">\u0418\u043C\u044F \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u0436\u0430</h2>
            <p class="profile-bio">adfsd \u044B\u0432\u0430\u044B\u0432 fsd fsdf dsfsdffqwegs rgsrgar ge erg wsqseg sefge ef ef sefse \u043F\u0443\u043F ya \u044B\u0432\u0430 sef esfsef fsefsef sg segfse \u0430\u043F\u0443\u044B \u043F\u043F</p>

            <img src="https://via.placeholder.com/300x400/120a1d/8e44ad?text=Violin+Player" class="profile-img">
            <div class="profile-actions">
                <button class="action-primary">\u{1F49C} Call me</button>
                <button class="action-secondary">\u{1F3A8} Generate image</button>
            </div>
            <div class="profile-stats">
                <div class="stat-item"><span>\u0412\u043E\u0437\u0440\u0430\u0441\u0442</span><b>30</b></div>
                <div class="stat-item"><span>Body</span><b>Thin</b></div>
                <div class="stat-item"><span>Ethnicity</span><b>Russian</b></div>
                <div class="stat-item"><span>Lang</span><b>English</b></div>
                <div class="stat-item full-stat">
                    <span>Hobbies</span>
                    <p>Playing, Playing, Playing, Playing, Playing, Playing, Playing, Playing, Playing, Playing, Playing, Playing</p>
                </div>
                <div class="stat-item full-stat">
                    <span>Personality</span>
                    <p>Commanding, Commanding, Commanding</p>
                </div>
            </div>
        </section>
    </main></div><script>
        function switchChat(element) {
            document.querySelectorAll('.chat-item').forEach(function(item) {
                item.classList.remove('active');
            });
            element.classList.add('active');
        }
    </script>`;

export default function ChatPage() {
  return React.createElement("div", {
    suppressHydrationWarning: true,
    dangerouslySetInnerHTML: { __html: HTML },
  });
}
