"use client";

import React from "react";
import { useAuth } from "../../context/auth";

type ActivePage = "home" | "shorts" | "chat" | "gallery" | "generate" | "create-character" | "my-ai" | "admin";

export default function Sidebar({ activePage }: { activePage?: ActivePage }) {
  const { user, logout } = useAuth();

  const navLinkClass = (page: ActivePage) =>
    `nav-link${activePage === page ? " active" : ""}`;

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-wrap">
          <div className="logo-part1"><img src="http://localhost:3845/assets/4324af60bd5838bbeb3c32e99e14bc8d894f20e0.svg" alt="" /></div>
          <div className="logo-part2"><img src="http://localhost:3845/assets/b563d66a439cdeab3fb4943eff30c4c3b14cd589.svg" alt="" /></div>
          <div className="logo-part3"><img src="http://localhost:3845/assets/b563d66a439cdeab3fb4943eff30c4c3b14cd589.svg" alt="" /></div>
          <div className="logo-title"><img src="http://localhost:3845/assets/b26dec13b831377550a10af107006da1cf10544b.svg" alt="" /></div>
        </div>
      </div>

      <div className="sidebar-separator"></div>

      {/* Main nav */}
      <nav className="nav-section">
        <div className="nav-title">Main</div>
        <a href="/" className={navLinkClass("home")}>
          <div className="figma-icon">
            <div className="vi" style={{top:"66.67%",left:"41.67%",right:"41.66%",bottom:"33.33%"}}><img src="http://localhost:3845/assets/00ce9200ae0e0d43ab49f6e39042263cd93f76d1.svg" alt="" style={{inset:"-0.5px -18.75%",width:"calc(100% + 37.5%)",height:"calc(100% + 1px)"}} /></div>
            <div className="vi" style={{top:"12.8%",left:"8.33%",right:"8.34%",bottom:"66.67%"}}><img src="http://localhost:3845/assets/63f7eb240f0729d19b6c42bb79dbcc26aac8ca8b.svg" alt="" style={{inset:"-15.22% -3.75%",width:"calc(100% + 7.5%)",height:"calc(100% + 30.44%)"}} /></div>
            <div className="vi" style={{top:"45.83%",left:"16.67%",right:"16.66%",bottom:"12.5%"}}><img src="http://localhost:3845/assets/db287ef9443069dde69fbf84c4c40a9b867e77c1.svg" alt="" style={{inset:"-7.5% -4.69%",width:"calc(100% + 9.38%)",height:"calc(100% + 15%)"}} /></div>
          </div>
          <span className="label">Home</span>
        </a>
        <a className={navLinkClass("shorts")}>
          <div className="figma-icon">
            <div className="vi" style={{top:"29.38%",left:"29.38%",right:"29.38%",bottom:"29.38%"}}><img src="http://localhost:3845/assets/0e3f985525fbbc3eeb8c1713a08518581986fa3b.svg" alt="" style={{inset:"-7.58%",width:"calc(100% + 15.16%)",height:"calc(100% + 15.16%)"}} /></div>
            <div className="vi" style={{top:"8.33%",left:"8.33%",right:"8.34%",bottom:"8.33%"}}><img src="http://localhost:3845/assets/717c200aae4e6f28932bc2d7611108c81b715ea3.svg" alt="" style={{inset:"-3.75%",width:"calc(100% + 7.5%)",height:"calc(100% + 7.5%)"}} /></div>
          </div>
          <span className="label">Shorts</span>
        </a>
        <a href="/chat" className={navLinkClass("chat")}>
          <div className="figma-icon">
            <div className="vi" style={{top:"47.92%",left:"68.75%",right:"27.08%",bottom:"47.92%"}}><img src="http://localhost:3845/assets/681f0e0c62c3637f99c40525d031fcf22ce678d8.svg" alt="" style={{inset:"-75%",width:"calc(100% + 150%)",height:"calc(100% + 150%)"}} /></div>
            <div className="vi" style={{top:"47.92%",left:"47.92%",right:"47.91%",bottom:"47.92%"}}><img src="http://localhost:3845/assets/681f0e0c62c3637f99c40525d031fcf22ce678d8.svg" alt="" style={{inset:"-75%",width:"calc(100% + 150%)",height:"calc(100% + 150%)"}} /></div>
            <div className="vi" style={{top:"47.92%",left:"27.08%",right:"68.75%",bottom:"47.92%"}}><img src="http://localhost:3845/assets/0595a28a6b9b355b8465313df312e4b1b5a80872.svg" alt="" style={{inset:"-75%",width:"calc(100% + 150%)",height:"calc(100% + 150%)"}} /></div>
            <div className="vi" style={{top:"8.33%",left:"8.33%",right:"8.34%",bottom:"8.33%"}}><img src="http://localhost:3845/assets/b78b09c6cfd126c9eb58cde62cf51a46a1cf1ea9.svg" alt="" style={{inset:"-3.75%",width:"calc(100% + 7.5%)",height:"calc(100% + 7.5%)"}} /></div>
          </div>
          <span className="label">Chat</span>
          <span className="nav-badge">3 <span className="badge-dot" style={{width:5,height:5,position:"relative"}}><img src="http://localhost:3845/assets/dada33e5a2709393004f19970e3edadf7f02c7ff.svg" alt="" style={{position:"absolute",inset:"-120%",width:"340%",height:"340%",display:"block",maxWidth:"none"}} /></span></span>
        </a>
        <a className={navLinkClass("gallery")}>
          <div className="figma-icon">
            <div className="vi" style={{top:"29.17%",left:"29.17%",right:"12.5%",bottom:"12.5%"}}><img src="http://localhost:3845/assets/0b65e99d1791cd379cd1c2920e960b764296c01c.svg" alt="" style={{inset:"-5.36%",width:"calc(100% + 10.72%)",height:"calc(100% + 10.72%)"}} /></div>
            <div className="vi" style={{top:"16.67%",left:"16.67%",right:"25%",bottom:"25%"}}><img src="http://localhost:3845/assets/647cbc22e663f933601938ae55aea1d012c4d6f0.svg" alt="" style={{inset:"-5.36%",width:"calc(100% + 10.72%)",height:"calc(100% + 10.72%)"}} /></div>
            <div className="vi" style={{top:"62.5%",left:"29.17%",right:"12.5%",bottom:"25%"}}><img src="http://localhost:3845/assets/80a003509ebe72b068ec5432abe75c0f2f0343c0.svg" alt="" style={{inset:"-25% -5.36%",width:"calc(100% + 10.72%)",height:"calc(100% + 50%)"}} /></div>
            <div className="vi" style={{top:"41.67%",left:"62.5%",right:"25%",bottom:"45.83%"}}><img src="http://localhost:3845/assets/0cf6253ee13b2290c2e3471b16fdef1e1f51ec8b.svg" alt="" style={{inset:"-25%",width:"calc(100% + 50%)",height:"calc(100% + 50%)"}} /></div>
          </div>
          <span className="label">Gallery</span>
        </a>
        <a className={navLinkClass("generate")}>
          <div className="figma-icon">
            <div className="vi" style={{top:"12.5%",left:"8.33%",right:"8.34%",bottom:"12.5%"}}><img src="http://localhost:3845/assets/d19a82ae6484698943b19132a135d37d38956d24.svg" alt="" style={{inset:"-4.17% -3.75%",width:"calc(100% + 7.5%)",height:"calc(100% + 8.34%)"}} /></div>
            <div className="vi" style={{top:"37.5%",left:"33.33%",right:"33.34%",bottom:"29.17%"}}><img src="http://localhost:3845/assets/7e052be7e17c24a6659568ad6d99eadc7cf5a329.svg" alt="" style={{inset:"-9.37%",width:"calc(100% + 18.74%)",height:"calc(100% + 18.74%)"}} /></div>
          </div>
          <span className="label">Generate Content</span>
        </a>
        <a className={navLinkClass("create-character")}>
          <div className="figma-icon">
            <div className="vi" style={{top:"29.17%",left:"70.83%",right:"4.17%",bottom:"45.83%"}}><img src="http://localhost:3845/assets/817b6da1bb9d84b2a9e58fb5fd7357a42f72573c.svg" alt="" style={{inset:"-12.5%",width:"calc(100% + 25%)",height:"calc(100% + 25%)"}} /></div>
            <div className="vi" style={{top:"50%",left:"4.17%",right:"37.5%",bottom:"16.67%"}}><img src="http://localhost:3845/assets/ae40a27807484ef5f6072b1ecf6895792df207dd.svg" alt="" style={{inset:"-9.37% -5.36%",width:"calc(100% + 10.72%)",height:"calc(100% + 18.74%)"}} /></div>
            <div className="vi" style={{top:"16.67%",left:"16.67%",right:"50%",bottom:"50%"}}><img src="http://localhost:3845/assets/ac7e5406bbc69924e4543d14256213c39e58e1fc.svg" alt="" style={{inset:"-9.37%",width:"calc(100% + 18.74%)",height:"calc(100% + 18.74%)"}} /></div>
          </div>
          <span className="label">Create Character</span>
        </a>
        <a className={navLinkClass("my-ai")}>
          <div className="figma-icon">
            <div className="vi" style={{top:"12.5%",left:"8.33%",right:"8.34%",bottom:"12.5%"}}><img src="http://localhost:3845/assets/73c077160f57d53f52d0bdc3a7f38f652fa1e2b4.svg" alt="" style={{inset:"-4.17% -3.75%",width:"calc(100% + 7.5%)",height:"calc(100% + 8.34%)"}} /></div>
          </div>
          <span className="label">My AI</span>
        </a>
        <a className="nav-link premium">
          <img className="icon" src="http://localhost:3845/assets/ecda1cb5e0d2bcd6e589ee48e0745891e21c4311.svg" alt="" />
          <span className="label">Become Premium</span>
        </a>
      </nav>

      <div className="sidebar-separator"></div>

      {/* Settings nav */}
      <nav className="nav-section settings-nav">
        <div className="nav-title">Settings</div>
        <a href={user?.role === "admin" ? "/admin" : "/profile"} className={navLinkClass("admin")}>
          <div className="figma-icon">
            <div className="vi" style={{top:"8.33%",left:"8.33%",right:"8.34%",bottom:"8.33%"}}><img src="http://localhost:3845/assets/35c2d550729147f7b5b9ff1fe84e1c9ce255bb43.svg" alt="" style={{inset:"-3.75%",width:"calc(100% + 7.5%)",height:"calc(100% + 7.5%)"}} /></div>
            <div className="vi" style={{top:"64.58%",left:"17.8%",right:"17.79%",bottom:"23.56%"}}><img src="http://localhost:3845/assets/ba810d43de8e63402912f003a55a32c54920d430.svg" alt="" style={{inset:"-26.36% -4.85%",width:"calc(100% + 9.7%)",height:"calc(100% + 52.72%)"}} /></div>
            <div className="vi" style={{top:"25%",left:"37.5%",right:"37.5%",bottom:"50%"}}><img src="http://localhost:3845/assets/cfeca3e384f8734f4583d5ad5cf056ec90a4ac42.svg" alt="" style={{inset:"-12.5%",width:"calc(100% + 25%)",height:"calc(100% + 25%)"}} /></div>
          </div>
          <span className="label">Creator account</span>
        </a>
        <a className="nav-link">
          <div className="figma-icon">
            <div className="vi" style={{top:"37.5%",left:"37.5%",right:"37.5%",bottom:"37.5%"}}><img src="http://localhost:3845/assets/073cb9f1e11431823182dbffee338c363b43bdf3.svg" alt="" style={{inset:"-12.5%",width:"calc(100% + 25%)",height:"calc(100% + 25%)"}} /></div>
            <div className="vi" style={{top:"8.33%",left:"8.33%",right:"8.34%",bottom:"8.33%"}}><img src="http://localhost:3845/assets/2418d0e179c6a7dc5cfb70d65cd62c6caf37ec7e.svg" alt="" style={{inset:"-3.75%",width:"calc(100% + 7.5%)",height:"calc(100% + 7.5%)"}} /></div>
          </div>
          <span className="label">Settings</span>
          <svg className="chevron-down-icon" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </a>
      </nav>

      {/* Bottom links */}
      <nav className="nav-section">
        <a className="nav-link">
          <img className="icon" src="http://localhost:3845/assets/8ae469fff107c192a29b4759817450ef81546340.png" alt="" />
          <span className="label">English</span>
          <svg className="chevron-down-icon" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </a>
        <a className="nav-link">
          <div className="figma-icon">
            <div className="vi" style={{top:"8.33%",left:"8.33%",right:"8.34%",bottom:"8.33%"}}><img src="http://localhost:3845/assets/0f47804f77e143fc6963ab556afbbd2728b809ff.svg" alt="" style={{inset:"-3.75%",width:"calc(100% + 7.5%)",height:"calc(100% + 7.5%)"}} /></div>
            <div className="vi" style={{top:"26.56%",left:"37.5%",right:"39.58%",bottom:"41.67%"}}><img src="http://localhost:3845/assets/7d603f60b9cd08d55aab6f85549010da00775f9c.svg" alt="" style={{inset:"-9.84% -13.64%",width:"calc(100% + 27.28%)",height:"calc(100% + 19.68%)"}} /></div>
            <div className="vi" style={{top:"75%",left:"49.96%",right:"50%",bottom:"24.96%"}}><img src="http://localhost:3845/assets/ba22947984a8f2ccd2643f0f3ef6bbed6aec2b93.svg" alt="" style={{inset:"-0.5px",width:"calc(100% + 1px)",height:"calc(100% + 1px)"}} /></div>
          </div>
          <span className="label">Help center</span>
        </a>
        <a className="nav-link logout" onClick={() => { logout(); window.location.href = "/login"; }}>
          <div className="figma-icon">
            <div className="vi" style={{top:"37.5%",left:"50%",right:"20.83%",bottom:"37.5%"}}><img src="http://localhost:3845/assets/438f9790609b6f21c3f47b837fa8b2d5eacac111.svg" alt="" style={{inset:"-12.5% -10.71%",width:"calc(100% + 21.42%)",height:"calc(100% + 25%)"}} /></div>
            <div className="vi" style={{top:"12.5%",left:"20.83%",right:"20.84%",bottom:"12.5%"}}><img src="http://localhost:3845/assets/9ac73ff23c13404f1096b6dc046d3ef579f6cce4.svg" alt="" style={{inset:"-4.17% -5.36%",width:"calc(100% + 10.72%)",height:"calc(100% + 8.34%)"}} /></div>
          </div>
          <span className="label">Logout Account</span>
        </a>
      </nav>

      <div className="sidebar-bottom-text">PRIVACY NOTICE &bull; LEGAL INFORMATION</div>
    </aside>
  );
}
