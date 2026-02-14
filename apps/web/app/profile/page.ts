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
            --tag-border: #3d2b55;
            --coral: #ff7675;
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
        .menu-item:hover { color: white; background-color: rgba(255, 255, 255, 0.05); transform: translateX(5px); }
        .menu-item.active { background-color: var(--active-violet); color: white; }
        .btn-footer {
            display: block; width: 100%; padding: 10px; margin-top: 8px;
            border: 1px solid var(--tag-border); background: transparent; color: white;
            border-radius: 8px; cursor: pointer; text-align: left; font-size: 13px;
            transition: all 0.2s ease;
        }
        .btn-footer:hover { background-color: var(--tag-border); }
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
        /* Profile Layout */
        .profile-container {
            display: flex;
            gap: 30px;
            border: 1px solid var(--tag-border);
            border-radius: 12px;
            padding: 25px;
            min-height: 500px;
        }
        .profile-nav { width: 220px; display: flex; flex-direction: column; gap: 10px; flex-shrink: 0; }
        .sub-nav-item {
            padding: 12px 15px;
            border-radius: 8px;
            color: var(--text-dim);
            cursor: pointer;
            font-size: 14px;
            border: 1px solid var(--tag-border);
            transition: 0.3s;
            text-align: center;
        }
        .sub-nav-item.active { background-color: var(--active-violet); color: white; border-color: var(--active-violet); }
        /* Sections Visibility */
        .tab-content { display: none; flex-grow: 1; }
        .tab-content.active { display: block; }
        .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
        .btn-danger { background: var(--coral); color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; }
        /* Form Elements */
        .form-group { margin-bottom: 20px; }
        .label { display: block; color: var(--text-dim); font-size: 12px; margin-bottom: 8px; }
        .input-wrapper {
            background: rgba(0,0,0,0.2);
            border: 1px solid var(--tag-border);
            border-radius: 8px;
            display: flex;
            align-items: center;
            padding: 0 15px;
            height: 45px;
        }
        .input-wrapper input {
            background: transparent;
            border: none;
            color: white;
            flex-grow: 1;
            font-size: 14px;
            outline: none;
        }
        .icon-btn { color: var(--text-dim); cursor: pointer; font-size: 14px; margin-left: 10px; }
        /* Social Grid */
        .social-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px; }
        .social-box { display: flex; align-items: center; gap: 10px; }
        .social-icon { width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        /* Two Column Layout */
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        /* Subscription styles */
        .subscription-card {
            background: rgba(255, 255, 255, 0.02); border: 1px solid var(--tag-border);
            border-radius: 15px; padding: 25px; display: flex; gap: 40px;
        }
        .plan-info { background: rgba(0, 0, 0, 0.2); border: 1px solid var(--tag-border); border-radius: 12px; padding: 20px; min-width: 220px; }
        .plan-header { display: flex; align-items: center; gap: 10px; font-size: 24px; font-weight: bold; margin-bottom: 15px; }
        .plan-icon { background: var(--active-violet); width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
        .plan-list { list-style: none; font-size: 13px; color: var(--text-dim); line-height: 1.8; }
        .plan-list li::before { content: "\\2022"; margin-right: 8px; color: var(--active-violet); }
        .toggle { width: 40px; height: 20px; background: #3d2b55; border-radius: 10px; position: relative; cursor: pointer; transition: 0.3s; }
        .toggle::after { content: ""; position: absolute; width: 16px; height: 16px; background: white; border-radius: 50%; top: 2px; left: 2px; transition: 0.3s; }
        .toggle.active { background: var(--active-violet); }
        .toggle.active::after { left: 22px; }
        .btn-settings { background: var(--active-violet); color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; width: 100%; margin-top: 20px; }
        /* Preferences Styles */
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
        /* Chat Profile Cards */
        .profile-card {
            width: 280px; background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--tag-border); border-radius: 12px; padding: 20px;
        }
        .profile-card-add {
            width: 280px; border: 2px dashed var(--tag-border); border-radius: 12px;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            cursor: pointer; transition: 0.3s; color: var(--text-dim); min-height: 160px;
        }
        .profile-card-add:hover { border-color: var(--active-violet); color: white; }</style><div id='app-root'><aside class="sidebar">
        <div class="logo"><div class="logo-box"></div><span>Leonardo.Ai</span></div>
        <nav>
            <a href="/" class="menu-item">\u{1F3E0} \u0413\u043B\u0430\u0432\u043D\u0430\u044F</a>
            <a href="#" class="menu-item">\u{1F4F1} \u0428\u043E\u0440\u0442\u0441\u044B</a>
            <a href="/generation" class="menu-item">\u{1F4F8} \u0424\u043E\u0442\u043E/\u0432\u0438\u0434\u0435\u043E</a>
            <a href="#" class="menu-item">\u{1F464} \u041C\u043E\u0439 AI</a>
            <a href="#" class="menu-item">\u{1F5BC}\uFE0F \u0413\u0430\u043B\u0435\u0440\u0435\u044F</a>
            <a href="#" class="menu-item">\u2728 \u041F\u0435\u0440\u0441\u043E\u043D\u0430\u0436</a>
            <a href="#" class="menu-item active">\u{1F4AC} \u0427\u0430\u0442</a>
        </nav>
        <div style="margin-top: auto;">
            <button class="btn-footer">\u{1F451} \u041F\u0440\u0435\u043C\u0438\u0443\u043C</button>
            <button class="btn-footer">\u{1F4D8} \u0413\u0430\u0439\u0434</button>
        </div>
    </aside>
    <main class="content">
        <header class="top-nav">
            <a href="/profile" class="nav-btn">\u{1F464} \u041F\u0440\u043E\u0444\u0438\u043B\u044C</a>
            <button class="nav-btn">\u{1F310} \u0420\u0443\u0441\u0441\u043A\u0438\u0439</button>
        </header>
        <div class="profile-container">
            <div class="profile-nav">
                <div class="sub-nav-item" onclick="openTab('subscription', this)">\u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0430</div>
                <div class="sub-nav-item active" onclick="openTab('account', this)">\u0410\u043A\u043A\u0430\u0443\u043D\u0442</div>
                <div class="sub-nav-item" onclick="openTab('prefs', this)">\u041F\u0440\u0435\u0434\u043F\u043E\u0447\u0442\u0435\u043D\u0438\u044F</div>
                <div class="sub-nav-item" onclick="openTab('chat-profiles', this)">\u041F\u0440\u043E\u0444\u0438\u043B\u0438 \u0434\u043B\u044F \u0447\u0430\u0442\u043E\u0432</div>
            </div>
            <div id="subscription" class="tab-content">
                <div class="section-header"><h2>\u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0430</h2></div>
                <div class="subscription-card">
                    <div class="plan-info">
                        <div class="plan-header"><div class="plan-icon">\u{1F680}</div><span>\u0411\u0430\u0437\u043E\u0432\u044B\u0439</span></div>
                        <ul class="plan-list"><li>10 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439</li><li>10 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0439</li><li>\u0424\u043E\u0442\u043E \u0438 \u0432\u0438\u0434\u0435\u043E</li><li>100 \u0436\u0438\u0437\u043D\u0435\u0439</li></ul>
                    </div>
                    <div style="flex-grow: 1;">
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--tag-border); padding-bottom:10px;">
                            <span>\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u043F\u0440\u043E\u0434\u043B\u0435\u043D\u0438\u0435</span>
                            <div class="toggle active" onclick="this.classList.toggle('active')"></div>
                        </div>
                        <p style="margin-top:15px; font-size:13px; color:var(--text-dim)">\u0414\u0430\u0442\u0430 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0433\u043E \u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F: 18.02.2026</p>
                        <button class="btn-settings">\u2699\uFE0F \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438</button>
                    </div>
                </div>
            </div>
            <div id="account" class="tab-content active">
                <div class="section-header">
                    <h2>\u0410\u043A\u043A\u0430\u0443\u043D\u0442</h2>
                    <button class="btn-danger">\u{1F5D1}\uFE0F \u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0430\u043A\u043A\u0430\u0443\u043D\u0442</button>
                </div>
                <div class="form-group">
                    <span class="label">\u041D\u0438\u043A\u043D\u0435\u0439\u043C</span>
                    <div class="input-wrapper">
                        <input type="text" placeholder="Mynickname">
                        <span class="icon-btn">\u{1F4DD}</span>
                    </div>
                </div>
                <span class="label">\u0421\u0441\u044B\u043B\u043A\u0438 \u043D\u0430 \u0441\u043E\u0446\u0441\u0435\u0442\u0438</span>
                <div class="social-grid">
                    <div class="social-box">
                        <div class="social-icon" style="background:#0077FF">VK</div>
                        <div class="input-wrapper" style="flex-grow:1"><input type="text" placeholder="https://vk.com/feed"><span class="icon-btn">\u{1F5D1}\uFE0F</span></div>
                    </div>
                    <div class="social-box">
                        <div class="social-icon" style="background:linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)">IG</div>
                        <div class="input-wrapper" style="flex-grow:1"><input type="text" placeholder="http://instagram.com/"><span class="icon-btn">\u{1F5D1}\uFE0F</span></div>
                    </div>
                    <div class="social-box">
                        <div class="social-icon" style="background:#000">X</div>
                        <div class="input-wrapper" style="flex-grow:1"><input type="text" placeholder="http://x.com/"><span class="icon-btn">\u{1F5D1}\uFE0F</span></div>
                    </div>
                </div>
                <div class="grid-2">
                    <div class="form-group">
                        <span class="label">Email</span>
                        <div class="input-wrapper">
                            <input type="text" placeholder="mail.23@mail.ru">
                            <span class="icon-btn">\u{1F4DD}</span><span class="icon-btn">\u{1F5D1}\uFE0F</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <span class="label">\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 Email</span>
                        <div class="input-wrapper">
                            <input type="text" placeholder="mail.23@mail.ru">
                            <span class="icon-btn">\u{1F4DD}</span><span class="icon-btn">\u{1F5D1}\uFE0F</span>
                        </div>
                    </div>
                </div>
                <span class="label">\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u043F\u0430\u0440\u043E\u043B\u044C</span>
                <div class="grid-2" style="margin-bottom: 15px;">
                    <div class="input-wrapper"><input type="password" placeholder="\u0421\u0442\u0430\u0440\u044B\u0439 \u043F\u0430\u0440\u043E\u043B\u044C"></div>
                    <div class="input-wrapper"><input type="password" placeholder="\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u0430\u0440\u043E\u043B\u044C"></div>
                </div>
                <button class="btn-settings" style="margin-top:0">\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043D\u043E\u0432\u044B\u0439 \u043F\u0430\u0440\u043E\u043B\u044C</button>
            </div>

            <div id="prefs" class="tab-content">
                <div class="section-header"><h2>\u0412\u044B\u0431\u043E\u0440 \u043F\u043E\u043B\u0430, \u0441\u0442\u0438\u043B\u044F \u0433\u0440\u0430\u0444\u0438\u043A\u0438</h2></div>
                <div class="grid-images">
                    <div class="image-card active"><img src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop" alt="Style"></div>
                    <div class="image-card"><img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop" alt="Style"></div>
                    <div class="image-card"><img src="https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?w=200&h=200&fit=crop" alt="Style"></div>
                    <div class="image-card"><img src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop" alt="Style"></div>
                    <div class="image-card"><img src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop" alt="Style"></div>
                </div>
                <div class="section-header" style="margin-bottom: 10px;"><h2>\u0422\u0435\u0433\u0438 \u0445\u0430\u0440\u0430\u043A\u0442\u0435\u0440\u0438\u0441\u0442\u0438\u043A</h2></div>
                <div class="form-group">
                    <span class="label">\u0412\u043D\u0435\u0448\u043D\u043E\u0441\u0442\u044C</span>
                    <div class="tag-group">
                        <div class="tag active">Romantic</div><div class="tag active">Athletic</div><div class="tag active">Caring</div>
                        <div class="tag">Virgin</div><div class="tag">College Student</div><div class="tag">Anime</div><div class="tag">Vintage</div>
                    </div>
                </div>
                <div class="form-group">
                    <span class="label">\u0425\u043E\u0431\u0431\u0438</span>
                    <div class="tag-group">
                        <div class="tag active">Gaming</div><div class="tag active">Fitness</div><div class="tag">Travel</div>
                        <div class="tag">Music</div><div class="tag">Cooking</div><div class="tag">Art</div>
                    </div>
                </div>
            </div>
            <div id="chat-profiles" class="tab-content">
                <div style="display: flex; flex-wrap: wrap; gap: 20px;">
                    <div class="profile-card">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px;">
                            <h3 style="font-size: 18px; font-weight: bold;">Aduard</h3>
                            <div style="display: flex; gap: 10px;"><span style="cursor: pointer; opacity: 0.7;">\u{1F4DD}</span><span style="cursor: pointer; color: var(--coral);">\u{1F5D1}\uFE0F</span></div>
                        </div>
                        <p style="color: var(--text-dim); font-size: 13px; margin-bottom: 15px;">23 \u0433\u043E\u0434\u0430</p>
                        <p style="font-size: 13px; line-height: 1.5; color: var(--text-dim);">Lorem ipsum dolor sit amet consectetur. Adipiscing augue dolor libero sem quis quis ac viverra.</p>
                    </div>
                    <div class="profile-card">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px;">
                            <h3 style="font-size: 18px; font-weight: bold;">Boris</h3>
                            <div style="display: flex; gap: 10px;"><span style="cursor: pointer; opacity: 0.7;">\u{1F4DD}</span><span style="cursor: pointer; color: var(--coral);">\u{1F5D1}\uFE0F</span></div>
                        </div>
                        <p style="color: var(--text-dim); font-size: 13px; margin-bottom: 15px;">40 \u043B\u0435\u0442</p>
                        <p style="font-size: 13px; line-height: 1.5; color: var(--text-dim);">Lorem ipsum dolor sit amet consectetur. Adipiscing augue dolor libero sem quis quis ac viverra.</p>
                    </div>
                    <div class="profile-card-add">
                        <span style="font-size: 24px; margin-bottom: 8px;">\u{1F464}\u207A</span>
                        <span style="font-size: 14px;">\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u0447\u0430\u0442\u0430</span>
                    </div>
                </div>
            </div>
        </div>
    </main></div><script>
        function openTab(tabId, element) {
            var contents = document.querySelectorAll('.tab-content');
            contents.forEach(function(content) { content.classList.remove('active'); });
            var buttons = document.querySelectorAll('.sub-nav-item');
            buttons.forEach(function(btn) { btn.classList.remove('active'); });
            document.getElementById(tabId).classList.add('active');
            element.classList.add('active');
        }
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('tag')) {
                e.target.classList.toggle('active');
            }
        });
    </script>`;

export default function ProfilePage() {
  return React.createElement("div", {
    suppressHydrationWarning: true,
    dangerouslySetInnerHTML: { __html: HTML },
  });
}
