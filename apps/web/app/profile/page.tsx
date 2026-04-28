"use client";

import { useState } from "react";
import { useAuth } from "../../context/auth";
import { users } from "../../lib/api";

const CSS = `
  .profile-page {
    padding: 24px 32px;
    min-height: calc(100vh - 56px);
    font-family: 'Syne', sans-serif;
    color: #fff;
  }

  /* ── Tab nav ── */
  .profile-tabs {
    display: flex;
    border-bottom: 1px solid #252525;
    margin-bottom: 28px;
    gap: 0;
  }
  .profile-tab {
    padding: 10px 20px;
    font-size: 12px;
    font-weight: 500;
    color: #848484;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: color 0.2s, border-color 0.2s;
    white-space: nowrap;
    user-select: none;
  }
  .profile-tab.active {
    color: #fff;
    border-bottom: 2px solid #F95BAD;
    box-shadow: 0 2px 5px 1px rgba(228,0,120,0.4);
  }
  .profile-tab:hover:not(.active) { color: #D0D0D0; }

  /* ── Subscription tab ── */
  .sub-layout {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  @media (max-width: 768px) {
    .sub-layout { flex-direction: column; }
    .sub-features { display: none !important; }
    .sub-comparison { display: none !important; }
  }
  .sub-card {
    flex: 1;
    background: #090909;
    border: 1px solid rgba(255,153,206,0.6);
    border-radius: 8px;
    padding: 20px;
    min-width: 200px;
  }
  .sub-card-title {
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 4px;
  }
  .sub-price {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 16px;
  }
  .sub-price-amount { font-size: 32px; font-weight: 700; }
  .sub-price-period { font-size: 12px; color: #848484; }
  .sub-badge {
    background: rgba(0,0,0,0.35);
    border: 1px solid #313131;
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 10px;
    color: #969696;
    margin-bottom: 16px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .sub-btn-gradient {
    display: block;
    width: 100%;
    padding: 10px;
    background: linear-gradient(90deg, #F95BAD, #FF0084);
    border: none;
    border-radius: 4px;
    color: #fff;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    margin-bottom: 8px;
    font-family: 'Syne', sans-serif;
  }
  .sub-btn-outline {
    display: block;
    width: 100%;
    padding: 10px;
    background: #121212;
    border: 1px solid #313131;
    border-radius: 4px;
    color: #848484;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    font-family: 'Syne', sans-serif;
  }
  .sub-features {
    width: 222px;
    flex-shrink: 0;
    background: #090909;
    border: 1px solid #252525;
    border-radius: 8px;
    overflow: hidden;
  }
  .sub-feature-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid #252525;
    font-size: 12px;
  }
  .sub-feature-row:last-child { border-bottom: none; }
  .sub-feature-icon {
    width: 22px;
    height: 22px;
    background: rgba(48,39,43,0.4);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    flex-shrink: 0;
  }
  .sub-comparison {
    width: 150px;
    flex-shrink: 0;
    background: #090909;
    border: 1px solid #252525;
    border-radius: 8px;
    overflow: hidden;
  }
  .sub-cmp-header {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: 1px solid #252525;
    font-size: 10px;
    font-weight: 600;
    color: #969696;
    text-align: center;
  }
  .sub-cmp-header span { padding: 8px 4px; }
  .sub-cmp-header span:first-child { border-right: 1px solid #252525; }
  .sub-cmp-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: 1px solid #252525;
    font-size: 11px;
    text-align: center;
  }
  .sub-cmp-row:last-child { border-bottom: none; }
  .sub-cmp-row span {
    padding: 10px 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .sub-cmp-row span:first-child { border-right: 1px solid #252525; color: #848484; }
  .check { color: #C1F0AA; font-size: 13px; }
  .cross { color: #E36466; font-size: 13px; }

  /* ── Account Info tab ── */
  .acc-layout { max-width: 560px; }
  .acc-section { margin-bottom: 24px; }
  .acc-label {
    font-size: 12px;
    font-weight: 500;
    color: #969696;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .acc-verified {
    background: rgba(193,240,170,0.15);
    border: 1px solid #C1F0AA;
    color: #C1F0AA;
    border-radius: 3px;
    padding: 1px 6px;
    font-size: 9px;
  }
  .acc-avatar-wrap {
    position: relative;
    width: 110px;
    height: 110px;
    border-radius: 8px;
    border: 1px solid #313131;
    overflow: hidden;
    background: #1E1E1E;
    margin-bottom: 10px;
  }
  .acc-avatar-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .acc-avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #848484;
    font-size: 40px;
  }
  .acc-avatar-btns { display: flex; gap: 8px; }
  .acc-btn-sm {
    padding: 6px 12px;
    background: #252525;
    border: 1px solid #313131;
    border-radius: 4px;
    color: #D0D0D0;
    font-size: 11px;
    cursor: pointer;
    font-family: 'Syne', sans-serif;
    transition: border-color 0.2s;
  }
  .acc-btn-sm:hover { border-color: #F95BAD; }
  .acc-btn-sm.danger { color: #E36466; }
  .acc-input {
    width: 100%;
    height: 36px;
    background: #252525;
    border: 1px solid #313131;
    border-radius: 6px;
    color: #fff;
    font-size: 12px;
    padding: 0 12px;
    outline: none;
    font-family: 'Syne', sans-serif;
    box-sizing: border-box;
    transition: border-color 0.2s;
  }
  .acc-input:focus { border-color: #F95BAD; }
  .acc-input:disabled { color: #848484; cursor: not-allowed; }
  .acc-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  @media (max-width: 600px) { .acc-grid-2 { grid-template-columns: 1fr; } }
  .acc-btn-save {
    padding: 8px 20px;
    background: linear-gradient(90deg, #F95BAD, #FF0084);
    border: none;
    border-radius: 4px;
    color: #fff;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    font-family: 'Syne', sans-serif;
    margin-top: 8px;
  }
  .acc-feedback {
    font-size: 11px;
    margin-top: 6px;
    min-height: 16px;
  }
  .acc-feedback.ok { color: #C1F0AA; }
  .acc-feedback.err { color: #E36466; }

  /* ── Preferences tab ── */
  .pref-layout { max-width: 680px; }
  .pref-section-title {
    font-size: 14px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 12px;
  }
  .pref-style-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 28px;
  }
  @media (max-width: 600px) { .pref-style-grid { grid-template-columns: repeat(2, 1fr); } }
  .pref-style-card {
    height: 120px;
    border-radius: 8px;
    border: 2px solid #313131;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    background: #1E1E1E;
    transition: border-color 0.2s;
    display: flex;
    align-items: flex-end;
  }
  .pref-style-card.active { border-color: #F95BAD; }
  .pref-style-card-label {
    width: 100%;
    padding: 8px;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    background: linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%);
    text-align: center;
  }
  .pref-style-card-bg {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    opacity: 0.6;
  }
  .pref-select-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  .pref-select-label { font-size: 10px; color: #969696; min-width: 120px; }
  .pref-select {
    flex: 1;
    max-width: 200px;
    height: 30px;
    background: #1E1E1E;
    border: 1px solid #313131;
    border-radius: 4px;
    color: #fff;
    font-size: 10px;
    padding: 0 10px;
    outline: none;
    font-family: 'Syne', sans-serif;
    cursor: pointer;
  }

  /* ── Chat Profiles tab ── */
  .chat-profiles-list { display: flex; flex-direction: column; gap: 10px; max-width: 560px; }
  .chat-profile-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    background: #252525;
    border: 1px solid #313131;
    border-radius: 8px;
    padding: 12px;
  }
  .chat-profile-avatar {
    width: 44px;
    height: 44px;
    border-radius: 6px;
    background: #313131;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    color: #848484;
    overflow: hidden;
  }
  .chat-profile-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .chat-profile-info { flex: 1; }
  .chat-profile-name { font-size: 12px; font-weight: 600; color: #fff; margin-bottom: 4px; }
  .chat-profile-bio { font-size: 10px; color: #848484; line-height: 1.5; }
  .chat-profile-actions { display: flex; gap: 6px; }
  .chat-action-btn {
    width: 28px;
    height: 28px;
    background: rgba(255,255,255,0.05);
    border: 1px solid #313131;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #848484;
    font-size: 12px;
    transition: border-color 0.2s;
  }
  .chat-action-btn:hover { border-color: #F95BAD; color: #fff; }
  .chat-create-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 36px;
    background: #121212;
    border: 1px solid #313131;
    border-radius: 6px;
    color: #848484;
    font-size: 12px;
    cursor: pointer;
    font-family: 'Syne', sans-serif;
    margin-top: 4px;
    transition: border-color 0.2s, color 0.2s;
  }
  .chat-create-btn:hover { border-color: #F95BAD; color: #fff; }

  /* ── Unauth ── */
  .profile-unauth {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: calc(100vh - 200px);
    gap: 20px;
    text-align: center;
  }
  .profile-unauth-icon { font-size: 64px; opacity: 0.3; }
  .profile-unauth-title { font-size: 22px; font-weight: 700; }
  .profile-unauth-sub { font-size: 13px; color: #848484; max-width: 320px; line-height: 1.6; }
  .profile-unauth-btns { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }
  .profile-unauth-btn-primary {
    padding: 10px 24px;
    background: linear-gradient(90deg, #F95BAD, #FF0084);
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    font-family: 'Syne', sans-serif;
  }
  .profile-unauth-btn-secondary {
    padding: 10px 24px;
    background: transparent;
    border: 1px solid #313131;
    border-radius: 6px;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    font-family: 'Syne', sans-serif;
  }
`;

type Tab = "subscription" | "account" | "preferences" | "chat-profiles";

const FEATURES = [
  { icon: "💬", label: "Messages per day", free: "10", pro: "∞" },
  { icon: "🖼️", label: "Image generations", free: "10", pro: "∞" },
  { icon: "🎬", label: "Video content", free: "✗", pro: "✓" },
  { icon: "❤️", label: "AI relationships", free: "1", pro: "∞" },
  { icon: "🌟", label: "Premium characters", free: "✗", pro: "✓" },
  { icon: "🎭", label: "Custom personas", free: "✗", pro: "✓" },
  { icon: "📷", label: "NSFW content", free: "✗", pro: "✓" },
  { icon: "⚡", label: "Priority responses", free: "✗", pro: "✓" },
];

function SubscriptionTab() {
  return (
    <div className="sub-layout">
      <div className="sub-card">
        <div className="sub-card-title">Pro</div>
        <div className="sub-price">
          <span className="sub-price-amount">$25</span>
          <span className="sub-price-period">/ 6 month</span>
        </div>
        <div className="sub-badge">
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#C1F0AA", display: "inline-block" }} />
          Next charge: 18.02.2027
        </div>
        <button className="sub-btn-gradient">Get Pro</button>
        <button className="sub-btn-outline">Cancel subscription</button>
      </div>

      <div className="sub-features">
        {FEATURES.map((f) => (
          <div className="sub-feature-row" key={f.label}>
            <div className="sub-feature-icon">{f.icon}</div>
            <span style={{ fontSize: 12 }}>{f.label}</span>
          </div>
        ))}
      </div>

      <div className="sub-comparison">
        <div className="sub-cmp-header">
          <span>Free</span>
          <span>Pro</span>
        </div>
        {FEATURES.map((f) => (
          <div className="sub-cmp-row" key={f.label}>
            <span className={f.free === "✗" ? "cross" : f.free === "✓" ? "check" : ""}>{f.free}</span>
            <span className={f.pro === "✗" ? "cross" : f.pro === "✓" ? "check" : ""}>{f.pro}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountTab() {
  const { user, refreshProfile } = useAuth();
  const [nickname, setNickname] = useState(user?.nickname ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pwdMsg, setPwdMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  async function handleSaveProfile() {
    setSaving(true);
    setProfileMsg(null);
    try {
      await users.updateProfile({ nickname: nickname || null, avatarUrl: avatarUrl || null });
      await refreshProfile();
      setProfileMsg({ text: "Profile saved successfully", ok: true });
    } catch {
      setProfileMsg({ text: "Failed to save profile", ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    if (!newPwd || !currentPwd) {
      setPwdMsg({ text: "Fill in both password fields", ok: false });
      return;
    }
    setSavingPwd(true);
    setPwdMsg(null);
    try {
      await users.changePassword(currentPwd, newPwd);
      setPwdMsg({ text: "Password changed successfully", ok: true });
      setCurrentPwd("");
      setNewPwd("");
    } catch {
      setPwdMsg({ text: "Incorrect current password", ok: false });
    } finally {
      setSavingPwd(false);
    }
  }

  return (
    <div className="acc-layout">
      {/* Avatar */}
      <div className="acc-section">
        <div className="acc-label">Profile picture</div>
        <div className="acc-avatar-wrap">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="avatar" />
          ) : (
            <div className="acc-avatar-placeholder">👤</div>
          )}
        </div>
        <div className="acc-avatar-btns">
          <button className="acc-btn-sm" onClick={() => {
            const url = prompt("Enter image URL:");
            if (url) setAvatarUrl(url);
          }}>Replace picture</button>
          <button className="acc-btn-sm danger" onClick={() => setAvatarUrl("")}>Remove</button>
        </div>
      </div>

      {/* Nickname */}
      <div className="acc-section">
        <div className="acc-label">Nickname</div>
        <input
          className="acc-input"
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Your nickname"
        />
        <button className="acc-btn-save" onClick={handleSaveProfile} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {profileMsg && (
          <div className={`acc-feedback ${profileMsg.ok ? "ok" : "err"}`}>{profileMsg.text}</div>
        )}
      </div>

      {/* Email */}
      <div className="acc-section">
        <div className="acc-label">
          Email
          <span className="acc-verified">Verified</span>
        </div>
        <input className="acc-input" type="text" value={user?.email ?? ""} disabled />
      </div>

      {/* Password */}
      <div className="acc-section">
        <div className="acc-label">Change password</div>
        <div className="acc-grid-2" style={{ marginBottom: 8 }}>
          <input
            className="acc-input"
            type="password"
            placeholder="Current password"
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
          />
          <input
            className="acc-input"
            type="password"
            placeholder="New password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
          />
        </div>
        <button className="acc-btn-save" onClick={handleChangePassword} disabled={savingPwd}>
          {savingPwd ? "Saving…" : "Change password"}
        </button>
        {pwdMsg && (
          <div className={`acc-feedback ${pwdMsg.ok ? "ok" : "err"}`}>{pwdMsg.text}</div>
        )}
      </div>
    </div>
  );
}

function PreferencesTab() {
  const [style, setStyle] = useState("Realistic");
  const [gender, setGender] = useState("Female");

  const styles = [
    { label: "Realistic", bg: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&h=200&fit=crop" },
    { label: "Semi-real", bg: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=300&h=200&fit=crop" },
    { label: "Anime", bg: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&h=200&fit=crop" },
    { label: "2D", bg: "https://images.unsplash.com/photo-1561731216-c3a4d99437d5?w=300&h=200&fit=crop" },
  ];

  return (
    <div className="pref-layout">
      <div className="pref-section-title">Art style</div>
      <div className="pref-style-grid">
        {styles.map((s) => (
          <div
            key={s.label}
            className={`pref-style-card${style === s.label ? " active" : ""}`}
            onClick={() => setStyle(s.label)}
          >
            <div className="pref-style-card-bg" style={{ backgroundImage: `url(${s.bg})` }} />
            <div className="pref-style-card-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="pref-section-title">Preferences</div>
      <div className="pref-select-row">
        <span className="pref-select-label">Preferred gender:</span>
        <select className="pref-select" value={gender} onChange={(e) => setGender(e.target.value)}>
          <option>Female</option>
          <option>Male</option>
          <option>All</option>
        </select>
      </div>
      <div className="pref-select-row">
        <span className="pref-select-label">Age range:</span>
        <select className="pref-select">
          <option>18–25</option>
          <option>25–35</option>
          <option>35+</option>
          <option>Any</option>
        </select>
      </div>
      <div className="pref-select-row">
        <span className="pref-select-label">Content type:</span>
        <select className="pref-select">
          <option>All</option>
          <option>SFW only</option>
          <option>NSFW only</option>
        </select>
      </div>
    </div>
  );
}

const CHAT_PROFILES = [
  { name: "Aduard", bio: "23 years old. Romantic and caring companion who loves long walks and deep conversations.", avatar: "" },
  { name: "Boris", bio: "40 years old. Experienced and thoughtful. Great listener with a dry sense of humor.", avatar: "" },
];

function ChatProfilesTab() {
  return (
    <div>
      <div className="chat-profiles-list">
        {CHAT_PROFILES.map((p) => (
          <div className="chat-profile-card" key={p.name}>
            <div className="chat-profile-avatar">
              {p.avatar ? <img src={p.avatar} alt={p.name} /> : "👤"}
            </div>
            <div className="chat-profile-info">
              <div className="chat-profile-name">{p.name}</div>
              <div className="chat-profile-bio">{p.bio}</div>
            </div>
            <div className="chat-profile-actions">
              <button className="chat-action-btn" title="Edit">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button className="chat-action-btn" title="Delete" style={{ color: "#E36466" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
              </button>
            </div>
          </div>
        ))}
        <button className="chat-create-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          Create New
        </button>
      </div>
    </div>
  );
}

function UnauthContent() {
  return (
    <div className="profile-unauth">
      <div className="profile-unauth-icon">🔒</div>
      <div>
        <div className="profile-unauth-title">You&apos;re not logged in</div>
        <div className="profile-unauth-sub">
          Sign in or create an account to access your profile and personal settings.
        </div>
      </div>
      <div className="profile-unauth-btns">
        <a href="/login" className="profile-unauth-btn-primary">Sign in</a>
        <a href="/register" className="profile-unauth-btn-secondary">Create account</a>
      </div>
    </div>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: "subscription", label: "Subscription" },
  { id: "account", label: "Account Info" },
  { id: "preferences", label: "Preferences" },
  { id: "chat-profiles", label: "Chat Profiles" },
];

function ProfileContent() {
  const [activeTab, setActiveTab] = useState<Tab>("subscription");

  return (
    <>
      <div className="profile-tabs">
        {TABS.map((t) => (
          <div
            key={t.id}
            className={`profile-tab${activeTab === t.id ? " active" : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </div>
        ))}
      </div>
      {activeTab === "subscription" && <SubscriptionTab />}
      {activeTab === "account" && <AccountTab />}
      {activeTab === "preferences" && <PreferencesTab />}
      {activeTab === "chat-profiles" && <ChatProfilesTab />}
    </>
  );
}

export default function ProfilePage() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="profile-page">
        {user ? <ProfileContent /> : <UnauthContent />}
      </div>
    </>
  );
}
