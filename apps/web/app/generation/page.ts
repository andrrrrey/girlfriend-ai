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
            width: 200px;
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

        /* Generator Tabs Switcher */
        .tabs-switcher {
            display: flex;
            justify-content: center;
            gap: 10px;
            margin-bottom: 30px;
        }
        .tab-btn {
            padding: 10px 60px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s;
            border: 1px solid var(--tag-border);
            color: var(--text-dim);
            background: transparent;
        }
        .tab-btn.active { background: var(--active-violet); border: none; color: white; }

        /* Scene Controls (Specific for Video) */
        #video-scenes {
            display: none;
            gap: 10px;
            margin-bottom: 20px;
            align-items: center;
        }
        .scene-btn {
            background: var(--card-bg);
            border: 1px solid var(--tag-border);
            color: white;
            padding: 6px 15px;
            border-radius: 20px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .scene-btn:hover { border-color: var(--active-violet); }
        .scene-btn.active { border-color: var(--active-violet); background: rgba(108, 92, 231, 0.1); }
        .add-scene {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            border: 1px solid var(--tag-border);
            background: var(--card-bg);
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        }
        .add-scene:hover { border-color: var(--active-violet); }

        /* Generator Grid */
        .gen-section-title { font-size: 24px; margin-bottom: 20px; text-align: left; }

        .gen-grid {
            display: grid;
            grid-template-columns: 1.5fr 1fr 1fr;
            grid-template-rows: auto auto;
            gap: 15px;
            margin-bottom: 15px;
        }
        .gen-box {
            background: var(--card-bg);
            border: 1px dashed var(--tag-border);
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px 20px;
            cursor: pointer;
            color: var(--text-dim);
            font-size: 13px;
            text-align: center;
            gap: 10px;
            transition: all 0.2s ease;
        }
        .gen-box:hover { border-color: var(--active-violet); background: #251b35; color: white; }
        .full-width-box { grid-column: 1 / -1; padding: 20px; border-color: #4a1d2e; }
        .premium-text { color: var(--coral); font-size: 11px; opacity: 0.8; }

        /* Gallery */
        .gallery-header { display: flex; align-items: baseline; gap: 10px; margin: 40px 0 20px; }
        .gallery-header h3 { font-size: 20px; }
        .gallery-header span { color: var(--active-violet); }

        .secondary-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }
        .tag-sm {
            background: var(--card-bg); color: #888; padding: 4px 10px;
            border-radius: 6px; font-size: 11px; border: 1px solid var(--tag-border); cursor: pointer;
            transition: all 0.2s ease;
        }
        .tag-sm:hover {
            border-color: var(--active-violet);
            color: white;
            background-color: rgba(108, 92, 231, 0.1);
        }
        .tag-sm.active { background: var(--active-violet); color: white; border-color: var(--active-violet); }

        .search-bar-small {
            background: var(--card-bg); border: 1px solid var(--tag-border); padding: 10px;
            border-radius: 8px; width: 100%; color: white; margin-bottom: 20px; font-size: 13px;
        }

        .gallery-controls { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .gallery-actions { display: flex; gap: 10px; }
        .action-btn {
            background: var(--card-bg); border: 1px solid var(--tag-border); color: white;
            padding: 8px 15px; border-radius: 8px; font-size: 12px; cursor: pointer;
            transition: all 0.2s ease;
        }
        .action-btn:hover { border-color: var(--active-violet); }

        /* Image Grid & Checkboxes */
        .image-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
            gap: 10px;
        }
        .img-item {
            aspect-ratio: 1/1; background: #2d1b44; border-radius: 8px; position: relative;
            background-image: url('https://via.placeholder.com/150/2d1b44/ffffff?text=AI');
            background-size: cover; cursor: pointer;
        }

        .img-check {
            position: absolute; top: 8px; left: 8px; width: 20px; height: 20px;
            border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.5);
            background: rgba(0,0,0,0.2);
            display: flex; align-items: center; justify-content: center;
            transition: 0.2s;
        }
        .img-check.selected {
            background: var(--active-violet);
            border-color: var(--active-violet);
        }
        .img-check.selected::after {
            content: '+';
            color: white;
            font-size: 16px;
            font-weight: bold;
        }</style><div id='app-root'><aside class="sidebar">
        <div class="logo">
            <div class="logo-box"></div>
            <span>Leonardo.Ai</span>
        </div>
        <nav>
            <a href="/" class="menu-item">&#127968; &#1043;&#1083;&#1072;&#1074;&#1085;&#1072;&#1103;</a>
            <a href="#" class="menu-item">&#128241; &#1064;&#1086;&#1088;&#1090;&#1089;&#1099;</a>
            <a href="/generation" class="menu-item active">&#128248; &#1060;&#1086;&#1090;&#1086;/&#1074;&#1080;&#1076;&#1077;&#1086;</a>
            <a href="#" class="menu-item">&#128100; &#1052;&#1086;&#1081; AI</a>
            <a href="#" class="menu-item">&#128444;&#65039; &#1043;&#1072;&#1083;&#1077;&#1088;&#1077;&#1103;</a>
            <a href="#" class="menu-item">&#10024; &#1055;&#1077;&#1088;&#1089;&#1086;&#1085;&#1072;&#1078;</a>
            <a href="/chat" class="menu-item">&#128172; &#1063;&#1072;&#1090;</a>
        </nav>
        <div style="margin-top: auto;">
            <button class="btn-footer">&#128081; &#1055;&#1088;&#1077;&#1084;&#1080;&#1091;&#1084;</button>
            <button class="btn-footer">&#128216; &#1043;&#1072;&#1081;&#1076;</button>
        </div>
    </aside>

    <main class="content">
        <header class="top-nav">
            <a href="/profile" class="nav-btn">&#128100; &#1055;&#1088;&#1086;&#1092;&#1080;&#1083;&#1100;</a>
            <button class="nav-btn">&#127760; &#1056;&#1091;&#1089;&#1089;&#1082;&#1080;&#1081;</button>
        </header>

        <div class="tabs-switcher">
            <button class="tab-btn active" onclick="switchTab('photo')">&#128444;&#65039; &#1060;&#1086;&#1090;&#1086;</button>
            <button class="tab-btn" onclick="switchTab('video')">&#127916; &#1042;&#1080;&#1076;&#1077;&#1086;</button>
        </div>

        <h2 class="gen-section-title" id="gen-title">&#1043;&#1077;&#1085;&#1077;&#1088;&#1072;&#1090;&#1086;&#1088; &#1080;&#1079;&#1086;&#1073;&#1088;&#1072;&#1078;&#1077;&#1085;&#1080;&#1081;</h2>

        <div id="video-scenes">
            <button class="scene-btn active">1 &#1089;&#1094;&#1077;&#1085;&#1072;</button>
            <button class="scene-btn">2 &#1089;&#1094;&#1077;&#1085;&#1072;</button>
            <button class="add-scene">+</button>
        </div>

        <div class="gen-grid">
            <div class="gen-box" style="grid-row: span 2;">
                <span>&#128100;</span>
                <p>&#1042;&#1099;&#1073;&#1077;&#1088;&#1080;<br>&#1087;&#1077;&#1088;&#1089;&#1086;&#1085;&#1072;&#1078;&#1072;</p>
            </div>
            <div class="gen-box" style="grid-row: span 2;">
                <span>&#128336;</span>
                <p>&#1042;&#1099;&#1073;&#1077;&#1088;&#1080;<br>&#1087;&#1086;&#1079;&#1080;&#1094;&#1080;&#1102;</p>
            </div>
            <div class="gen-box">
                <span>&#128444;&#65039;</span>
                <p>&#1060;&#1086;&#1085;</p>
            </div>
            <div class="gen-box">
                <span>&#127912;</span>
                <p>&#1044;&#1077;&#1082;&#1086;&#1088;</p>
            </div>
            <div class="gen-box full-width-box">
                <p>&#127919; &#1057;&#1086;&#1073;&#1089;&#1090;&#1074;&#1077;&#1085;&#1085;&#1099;&#1081; &#1087;&#1088;&#1086;&#1084;&#1087;&#1090;</p>
                <span class="premium-text">(&#1076;&#1086;&#1089;&#1090;&#1091;&#1087;&#1085;&#1086; &#1076;&#1083;&#1103; &#1087;&#1088;&#1077;&#1084;&#1080;&#1091;&#1084;)</span>
            </div>
        </div>

        <div class="gallery-header">
            <h3>&#1043;&#1072;&#1083;&#1077;&#1088;&#1077;&#1103; <span>&#1092;&#1086;&#1090;&#1086; &#1080; &#1074;&#1080;&#1076;&#1077;&#1086;</span></h3>
        </div>

        <div class="secondary-tags">
            <span class="tag-sm active" onclick="toggleTag(this)">Romantic</span>
            <span class="tag-sm active" onclick="toggleTag(this)">Athletic</span>
            <span class="tag-sm" onclick="toggleTag(this)">College Student</span>
            <span class="tag-sm" onclick="toggleTag(this)">Anime</span>
            <span class="tag-sm">&#1055;&#1086;&#1082;&#1072;&#1079;&#1072;&#1090;&#1100; &#1074;&#1089;&#1077; &#9663;</span>
        </div>

        <input type="text" class="search-bar-small" placeholder="&#128269; &#1055;&#1086;&#1080;&#1089;&#1082; &#1087;&#1086; &#1075;&#1072;&#1083;&#1077;&#1088;&#1077;&#1077;">

        <div class="gallery-controls">
            <span class="count-label">&#1042;&#1099;&#1073;&#1088;&#1072;&#1085;&#1086;: 0 &#1092;&#1072;&#1081;&#1083;&#1086;&#1074;</span>
            <div class="gallery-actions">
                <button class="action-btn">&#128229; &#1057;&#1082;&#1072;&#1095;&#1072;&#1090;&#1100; &#1074;&#1099;&#1073;&#1088;&#1072;&#1085;&#1085;&#1086;&#1077;</button>
                <button class="action-btn" style="color: var(--coral); border-color: #4a1d2e;">&#128465;&#65039; &#1059;&#1076;&#1072;&#1083;&#1080;&#1090;&#1100;</button>
            </div>
        </div>

        <div class="image-grid">
            <div class="img-item"><div class="img-check" onclick="toggleSelect(this)"></div></div>
            <div class="img-item"><div class="img-check" onclick="toggleSelect(this)"></div></div>
            <div class="img-item"><div class="img-check" onclick="toggleSelect(this)"></div></div>
            <div class="img-item"><div class="img-check" onclick="toggleSelect(this)"></div></div>
            <div class="img-item"><div class="img-check" onclick="toggleSelect(this)"></div></div>
            <div class="img-item"><div class="img-check" onclick="toggleSelect(this)"></div></div>
            <div class="img-item"><div class="img-check" onclick="toggleSelect(this)"></div></div>
            <div class="img-item"><div class="img-check" onclick="toggleSelect(this)"></div></div>
        </div>
    </main></div><script>
        function switchTab(type) {
            var title = document.getElementById('gen-title');
            var scenes = document.getElementById('video-scenes');
            var buttons = document.querySelectorAll('.tab-btn');
            buttons.forEach(function(btn) { btn.classList.remove('active'); });
            if (type === 'video') {
                title.innerText = '\\u0413\\u0435\\u043d\\u0435\\u0440\\u0430\\u0442\\u043e\\u0440 \\u0432\\u0438\\u0434\\u0435\\u043e';
                scenes.style.display = 'flex';
                buttons[1].classList.add('active');
            } else {
                title.innerText = '\\u0413\\u0435\\u043d\\u0435\\u0440\\u0430\\u0442\\u043e\\u0440 \\u0438\\u0437\\u043e\\u0431\\u0440\\u0430\\u0436\\u0435\\u043d\\u0438\\u0439';
                scenes.style.display = 'none';
                buttons[0].classList.add('active');
            }
        }
        function toggleTag(el) {
            el.classList.toggle('active');
        }
        function toggleSelect(el) {
            el.classList.toggle('selected');
            var selectedCount = document.querySelectorAll('.img-check.selected').length;
            var label = document.querySelector('.count-label');
            label.innerText = '\\u0412\\u044b\\u0431\\u0440\\u0430\\u043d\\u043e: ' + selectedCount + ' \\u0444\\u0430\\u0439\\u043b\\u043e\\u0432';
        }
    </script>`;

export default function GenerationPage() {
  return React.createElement("div", {
    suppressHydrationWarning: true,
    dangerouslySetInnerHTML: { __html: HTML },
  });
}
