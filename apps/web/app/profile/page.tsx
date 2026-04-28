"use client";

import { useState } from "react";
import { useAuth } from "../../context/auth";
import { users } from "../../lib/api";

type Tab = "subscription" | "account" | "preferences" | "chat-profiles";

/* ─────────────────────────────────────────────
   CSS — prefixed pp- to avoid global conflicts
───────────────────────────────────────────── */
const CSS = `
.pp { padding: 24px 32px; color: #fff; font-family: 'Syne', sans-serif; }

/* ── Tabs ── */
.pp-tabs { display: flex; gap: 2px; width: 100%; margin-bottom: 24px; }
.pp-tab {
  flex: 1 0 0; min-width: 1px;
  display: flex; flex-direction: column; gap: 12px; align-items: center;
  cursor: pointer;
}
.pp-tab-label {
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif;
  text-align: center; width: 100%; color: #969696; line-height: 1;
  user-select: none;
}
.pp-tab-active .pp-tab-label { color: #fff; }
.pp-tab-line {
  height: 2px; border-radius: 1px; width: 100%; flex-shrink: 0;
  background: #30272b;
}
.pp-tab-active .pp-tab-line {
  background: #f95bad;
  box-shadow: 0px 0px 5px 1px rgba(228,0,120,0.6);
  filter: blur(0.5px);
}

/* ── Subscription ── */
.pp-sub { display: flex; gap: 8px; align-items: flex-start; }
.pp-sub-card {
  flex: 1 0 0; min-width: 0; min-height: 416px;
  border: 1px solid rgba(255,153,206,0.6); border-radius: 4px;
  padding: 16px; display: flex; flex-direction: column; gap: 10px;
}
.pp-sub-heading { display: flex; gap: 16px; align-items: center; }
.pp-sub-icon {
  width: 42px; height: 42px; flex-shrink: 0;
  background: #1e1e1e; border: 0.8px solid rgba(228,0,120,0.2);
  border-radius: 4px; display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.pp-sub-title {
  font-size: 32px; font-weight: 700; font-family: 'Syne', sans-serif;
  line-height: 1.1; color: #fff; white-space: nowrap;
}
.pp-sub-price { display: flex; gap: 6px; align-items: flex-end; }
.pp-sub-amount {
  font-size: 32px; font-weight: 700; font-family: 'Syne', sans-serif;
  line-height: 1.1; color: #fff; white-space: nowrap;
}
.pp-sub-period {
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif;
  color: #d0d0d0; line-height: 1.6; margin-bottom: 4px;
}
.pp-sub-charge {
  background: rgba(0,0,0,0.25); height: 28px; border-radius: 4px;
  display: flex; align-items: center; justify-content: center; padding: 0 12px;
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif;
  color: #fff; white-space: nowrap; width: 100%;
}
.pp-spacer { flex: 1; }
.pp-sub-btns { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.pp-btn-grad {
  display: flex; align-items: center; justify-content: center;
  height: 38px; border-radius: 4px;
  background: linear-gradient(90deg, #f95bad, #ff0084);
  border: none; width: 100%; cursor: pointer;
  font-size: 14px; font-weight: 500; font-family: 'Syne', sans-serif; color: #fff;
}
.pp-btn-grad:disabled { opacity: 0.6; cursor: not-allowed; }
.pp-btn-dark {
  display: flex; align-items: center; justify-content: center;
  height: 38px; border-radius: 4px;
  background: #121212; border: 1px solid #313131;
  width: 100%; cursor: pointer;
  font-size: 14px; font-weight: 500; font-family: 'Syne', sans-serif; color: #fff;
}
.pp-sub-features {
  width: 222px; flex-shrink: 0;
  border: 1px solid #252525; border-radius: 4px; overflow: hidden;
}
.pp-feat-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-bottom: 1px solid #252525;
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif; color: #fff;
}
.pp-feat-row:last-child { border-bottom: none; }
.pp-feat-ico {
  width: 22px; height: 22px; flex-shrink: 0;
  background: rgba(48,39,43,0.4); border-radius: 4px;
  display: flex; align-items: center; justify-content: center; font-size: 11px;
}
.pp-sub-cmp {
  width: 150px; flex-shrink: 0;
  border: 1px solid #252525; border-radius: 4px; overflow: hidden;
}
.pp-cmp-hd { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #252525; }
.pp-cmp-hd span {
  font-size: 10px; font-weight: 600; font-family: 'Syne', sans-serif;
  color: #969696; text-align: center; padding: 8px 4px;
}
.pp-cmp-hd span:first-child { border-right: 1px solid #252525; }
.pp-cmp-row { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #252525; }
.pp-cmp-row:last-child { border-bottom: none; }
.pp-cmp-row span {
  font-size: 11px; font-family: 'Syne', sans-serif; text-align: center;
  padding: 10px 4px; display: flex; align-items: center; justify-content: center;
}
.pp-cmp-row span:first-child { border-right: 1px solid #252525; color: #848484; }
.pp-cmp-row span:last-child { color: #d0d0d0; }
.pp-chk { color: #C1F0AA; }
.pp-x { color: #969696; }

/* ── Account Info ── */
.pp-acc { display: flex; flex-direction: column; gap: 24px; max-width: 600px; }
.pp-field { display: flex; flex-direction: column; gap: 8px; }
.pp-lbl {
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif;
  color: #fff; display: flex; align-items: center; gap: 6px;
}
.pp-verified {
  font-size: 9px; font-weight: 500; color: #C1F0AA;
  border: 1px solid #C1F0AA; border-radius: 3px; padding: 1px 6px;
  background: rgba(193,240,170,0.08);
}
.pp-input {
  height: 38px; background: #121212; border: 1px solid #313131;
  border-radius: 4px; color: #fff;
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif;
  padding: 0 12px; outline: none; width: 100%; box-sizing: border-box;
  transition: border-color 0.2s;
}
.pp-input:focus { border-color: #f95bad; }
.pp-input:disabled { color: #848484; cursor: not-allowed; }
.pp-input::placeholder { color: #969696; }
.pp-avatar-row { display: flex; gap: 16px; align-items: flex-start; }
.pp-avatar-box {
  width: 110px; height: 110px; flex-shrink: 0;
  border: 1px solid #313131; border-radius: 8px;
  overflow: hidden; position: relative; background: #1e1e1e;
}
.pp-avatar-box img { width: 100%; height: 100%; object-fit: cover; }
.pp-avatar-fade {
  position: absolute; inset: 0; pointer-events: none; border-radius: 8px;
  background: linear-gradient(to bottom, rgba(9,9,9,0) 56%, rgba(9,9,9,0.8));
}
.pp-avatar-ph {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
}
.pp-avatar-right { display: flex; flex-direction: column; gap: 8px; }
.pp-avatar-btns { display: flex; flex-direction: column; gap: 8px; }
.pp-btn-sm {
  height: 30px; background: #121212; border: 1px solid #313131;
  border-radius: 4px; color: #fff;
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif;
  padding: 0 14px; cursor: pointer; white-space: nowrap;
  display: flex; align-items: center; justify-content: center;
  transition: border-color 0.2s;
}
.pp-btn-sm:hover { border-color: #f95bad; }
.pp-helper {
  font-size: 10px; font-weight: 500; font-family: 'Syne', sans-serif;
  color: #848484; line-height: 1.3; display: flex; flex-direction: column;
}
.pp-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
@media (max-width: 600px) { .pp-grid-2 { grid-template-columns: 1fr; } }
.pp-feedback { font-size: 11px; margin-top: 2px; min-height: 14px; font-family: 'Syne', sans-serif; }
.pp-feedback.ok { color: #C1F0AA; }
.pp-feedback.err { color: #E36466; }
.pp-save-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 38px; border-radius: 4px; padding: 0 24px;
  background: linear-gradient(90deg, #f95bad, #ff0084);
  border: none; cursor: pointer;
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif; color: #fff;
  margin-top: 4px; align-self: flex-start;
}
.pp-save-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* ── Preferences ── */
.pp-pref { display: flex; flex-direction: column; gap: 24px; max-width: 700px; }
.pp-section { display: flex; flex-direction: column; gap: 12px; }
.pp-section-label {
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif; color: #fff;
}
.pp-style-grid { display: flex; gap: 10px; }
.pp-style-card {
  flex: 1 0 0; min-width: 0; height: 160px;
  border-radius: 8px; border: 1px dashed #969696;
  overflow: hidden; position: relative; cursor: pointer;
  display: flex; align-items: center; justify-content: center; padding: 12px;
  box-sizing: border-box; transition: border-color 0.2s;
}
.pp-style-card.pp-active { border: 1px solid #f95bad; }
.pp-style-bg {
  position: absolute; inset: 0;
  background-size: cover; background-position: center top;
}
.pp-style-overlay {
  position: absolute; inset: 0; background: rgba(0,0,0,0.5);
}
.pp-style-name {
  position: relative; z-index: 1;
  font-size: 16px; font-weight: 700; font-family: 'Syne', sans-serif;
  color: #fff; text-align: center; width: 100%;
  text-shadow: 0 1px 4px rgba(0,0,0,0.6);
}
.pp-drops { display: flex; flex-direction: column; gap: 8px; }
.pp-drop-row {
  display: flex; align-items: center; justify-content: space-between;
  background: #1e1e1e; height: 30px; border-radius: 4px;
  padding: 0 10px; position: relative; cursor: pointer;
}
.pp-drop-left { display: flex; align-items: center; gap: 4px; }
.pp-drop-lbl {
  font-size: 10px; font-weight: 500; font-family: 'Syne', sans-serif; color: #969696;
}
.pp-drop-val {
  font-size: 10px; font-weight: 500; font-family: 'Syne', sans-serif; color: #fff;
}
.pp-drop-sel {
  position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
}

/* ── Chat Profiles ── */
.pp-chats { display: flex; flex-direction: column; gap: 8px; max-width: 600px; }
.pp-chat-card {
  display: flex; gap: 8px; align-items: flex-start;
  background: #252525; padding: 6px; border-radius: 8px;
}
.pp-chat-ava {
  width: 40px; height: 40px; flex-shrink: 0;
  border-radius: 4px; background: #313131; overflow: hidden;
  display: flex; align-items: center; justify-content: center; color: #848484;
}
.pp-chat-ava img { width: 100%; height: 100%; object-fit: cover; }
.pp-chat-info {
  flex: 1 0 0; min-width: 0;
  display: flex; flex-direction: column; gap: 6px; align-self: center;
}
.pp-chat-name {
  font-size: 12px; font-weight: 600; font-family: 'Syne', sans-serif; color: #fff;
}
.pp-chat-bio {
  font-size: 10px; font-weight: 500; font-family: 'Syne', sans-serif;
  color: #848484; line-height: 1.3;
}
.pp-chat-btn {
  width: 24px; height: 24px; flex-shrink: 0; align-self: center;
  border-radius: 8px; background: transparent; border: none;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  padding: 6px; box-sizing: border-box; color: #848484;
  backdrop-filter: blur(2px);
}
.pp-chat-create {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  height: 30px; background: #121212; border: 1px solid #313131;
  border-radius: 4px; color: #fff; padding: 0 14px; cursor: pointer;
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif;
  transition: border-color 0.2s;
}
.pp-chat-create:hover { border-color: #f95bad; }

/* ── Admin badge ── */
.pp-admin-link {
  display: inline-flex; align-items: center; gap: 8px;
  height: 30px; background: #1e1e1e; border: 1px solid rgba(228,0,120,0.3);
  border-radius: 4px; color: #f95bad; font-size: 12px; font-weight: 500;
  font-family: 'Syne', sans-serif; padding: 0 14px;
  text-decoration: none; margin-bottom: 16px;
  transition: border-color 0.2s;
}
.pp-admin-link:hover { border-color: #f95bad; }

/* ── Unauthenticated ── */
.pp-unauth {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: calc(100vh - 200px); gap: 20px; text-align: center;
}
.pp-unauth-title {
  font-size: 22px; font-weight: 700; font-family: 'Syne', sans-serif;
  margin-bottom: 8px;
}
.pp-unauth-sub {
  font-size: 13px; color: #848484; max-width: 320px; line-height: 1.6;
  font-family: 'Syne', sans-serif;
}
.pp-unauth-btns { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }
.pp-unauth-p {
  padding: 10px 24px; background: linear-gradient(90deg, #f95bad, #ff0084);
  border: none; border-radius: 4px; color: #fff;
  font-size: 13px; font-weight: 600; font-family: 'Syne', sans-serif;
  cursor: pointer; text-decoration: none; display: inline-flex; align-items: center;
}
.pp-unauth-s {
  padding: 10px 24px; background: transparent; border: 1px solid #313131;
  border-radius: 4px; color: #fff;
  font-size: 13px; font-weight: 600; font-family: 'Syne', sans-serif;
  cursor: pointer; text-decoration: none; display: inline-flex; align-items: center;
}
@media (max-width: 768px) {
  .pp { padding: 16px; }
  .pp-sub { flex-direction: column; }
  .pp-sub-features, .pp-sub-cmp { display: none; }
  .pp-style-grid { flex-wrap: wrap; }
  .pp-style-card { flex: 1 0 calc(50% - 5px); }
}
`;

/* ─── Data ─── */
const FEATURES = [
  { icon: "💬", label: "Messages per day",  free: "10", pro: "∞" },
  { icon: "🖼️", label: "Image generations", free: "10", pro: "∞" },
  { icon: "🎬", label: "Video content",      free: "✗",  pro: "✓" },
  { icon: "❤️", label: "AI relationships",   free: "1",  pro: "∞" },
  { icon: "⭐", label: "Premium characters", free: "✗",  pro: "✓" },
  { icon: "🎭", label: "Custom personas",    free: "✗",  pro: "✓" },
  { icon: "📷", label: "NSFW content",       free: "✗",  pro: "✓" },
  { icon: "⚡", label: "Priority responses", free: "✗",  pro: "✓" },
];

const STYLES = [
  { label: "Realistic", bg: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&h=240&fit=crop&crop=face" },
  { label: "Semi-real", bg: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=300&h=240&fit=crop&crop=face" },
  { label: "Anime",     bg: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&h=240&fit=crop" },
  { label: "2D",        bg: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&h=240&fit=crop" },
];

const CHAT_DATA = [
  { name: "Artem, 25", bio: "Creative writer and hopeless romantic. Loves poetry, rainy days, and deep conversations about the meaning of life." },
  { name: "Boris, 40", bio: "Experienced and thoughtful. Great listener with a dry sense of humor and a passion for history and philosophy." },
];

const TABS: { id: Tab; label: string }[] = [
  { id: "subscription",   label: "Subscription"  },
  { id: "account",        label: "Account Info"  },
  { id: "preferences",    label: "Preferences"   },
  { id: "chat-profiles",  label: "Chat Profiles" },
];

/* ─── Icons ─── */
function IconPerson({ size = 48, stroke = "#848484" }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function IconDiamond() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M2.7 7.5 12 2l9.3 5.5L12 22 2.7 7.5z" fill="#F95BAD" opacity="0.9"/>
      <path d="M2.7 7.5h18.6" stroke="#FF99CE" strokeWidth="1.2"/>
      <path d="M12 2 7.5 7.5M12 2l4.5 5.5" stroke="#FF99CE" strokeWidth="1"/>
    </svg>
  );
}

function IconChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4 6l4 4 4-4" stroke="#848484" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* ─── Subscription Tab ─── */
function SubscriptionTab() {
  return (
    <div className="pp-sub">
      {/* Plan card */}
      <div className="pp-sub-card">
        <div className="pp-sub-heading">
          <div className="pp-sub-icon"><IconDiamond /></div>
          <span className="pp-sub-title">Pro</span>
        </div>

        <div className="pp-sub-price">
          <span className="pp-sub-amount">$ 25</span>
          <span className="pp-sub-period">/ 6 month</span>
        </div>

        <div className="pp-sub-charge">
          We will charge your card on: 07/23/2026
        </div>

        <div className="pp-spacer" />

        <div className="pp-sub-btns">
          <button className="pp-btn-grad">Upgrade</button>
          <button className="pp-btn-dark">Manage Subscription</button>
        </div>
      </div>

      {/* Features list */}
      <div className="pp-sub-features">
        {FEATURES.map((f) => (
          <div className="pp-feat-row" key={f.label}>
            <div className="pp-feat-ico">{f.icon}</div>
            <span>{f.label}</span>
          </div>
        ))}
      </div>

      {/* Comparison */}
      <div className="pp-sub-cmp">
        <div className="pp-cmp-hd">
          <span>Free</span>
          <span>Pro</span>
        </div>
        {FEATURES.map((f) => (
          <div className="pp-cmp-row" key={f.label}>
            <span className={f.free === "✗" ? "pp-x" : f.free === "✓" ? "pp-chk" : ""}>{f.free}</span>
            <span className={f.pro === "✓" ? "pp-chk" : f.pro === "✗" ? "pp-x" : ""}>{f.pro}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Account Info Tab ─── */
function AccountTab() {
  const { user, refreshProfile } = useAuth();
  const [nickname, setNickname]     = useState(user?.nickname ?? "");
  const [avatarUrl, setAvatarUrl]   = useState(user?.avatarUrl ?? "");
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd]         = useState("");
  const [profMsg, setProfMsg]   = useState<{ text: string; ok: boolean } | null>(null);
  const [pwdMsg, setPwdMsg]     = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving]         = useState(false);
  const [savingPwd, setSavingPwd]   = useState(false);

  async function handleSaveProfile() {
    setSaving(true); setProfMsg(null);
    try {
      await users.updateProfile({ nickname: nickname || null, avatarUrl: avatarUrl || null });
      await refreshProfile();
      setProfMsg({ text: "Profile saved", ok: true });
    } catch { setProfMsg({ text: "Failed to save", ok: false }); }
    finally { setSaving(false); }
  }

  async function handleChangePwd() {
    if (!currentPwd || !newPwd) { setPwdMsg({ text: "Fill both fields", ok: false }); return; }
    setSavingPwd(true); setPwdMsg(null);
    try {
      await users.changePassword(currentPwd, newPwd);
      setPwdMsg({ text: "Password changed", ok: true });
      setCurrentPwd(""); setNewPwd("");
    } catch { setPwdMsg({ text: "Incorrect current password", ok: false }); }
    finally { setSavingPwd(false); }
  }

  return (
    <div className="pp-acc">
      {/* Profile picture */}
      <div className="pp-field">
        <span className="pp-lbl">Profile picture</span>
        <div className="pp-avatar-row">
          <div className="pp-avatar-box">
            {avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatarUrl} alt="avatar" />
              : <div className="pp-avatar-ph"><IconPerson size={48} stroke="#848484" /></div>
            }
            <div className="pp-avatar-fade" />
          </div>
          <div className="pp-avatar-right">
            <div className="pp-avatar-btns">
              <button className="pp-btn-sm" onClick={() => {
                const url = prompt("Enter image URL:");
                if (url) setAvatarUrl(url);
              }}>
                Replace picture
              </button>
              <button className="pp-btn-sm" onClick={() => setAvatarUrl("")}>Remove</button>
            </div>
            <div className="pp-helper">
              <span>*.png, *.jpg, *.jpeg, *.gif</span>
              <span>Max file size: 5 MB</span>
            </div>
          </div>
        </div>
      </div>

      {/* Nickname */}
      <div className="pp-field">
        <span className="pp-lbl">Nickname</span>
        <input className="pp-input" type="text" value={nickname}
          onChange={e => setNickname(e.target.value)} placeholder="Your nickname" />
        <button className="pp-save-btn" onClick={handleSaveProfile} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {profMsg && <div className={`pp-feedback ${profMsg.ok ? "ok" : "err"}`}>{profMsg.text}</div>}
      </div>

      {/* Email */}
      <div className="pp-field">
        <span className="pp-lbl">Email <span className="pp-verified">Verified</span></span>
        <input className="pp-input" type="text" value={user?.email ?? ""} disabled />
      </div>

      {/* Password */}
      <div className="pp-field">
        <span className="pp-lbl">Change password</span>
        <div className="pp-grid-2">
          <input className="pp-input" type="password" placeholder="Current password"
            value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} />
          <input className="pp-input" type="password" placeholder="New password"
            value={newPwd} onChange={e => setNewPwd(e.target.value)} />
        </div>
        <button className="pp-save-btn" onClick={handleChangePwd} disabled={savingPwd}>
          {savingPwd ? "Saving…" : "Change password"}
        </button>
        {pwdMsg && <div className={`pp-feedback ${pwdMsg.ok ? "ok" : "err"}`}>{pwdMsg.text}</div>}
      </div>
    </div>
  );
}

/* ─── Preferences Tab ─── */
function PreferencesTab() {
  const [style,   setStyle]   = useState("Realistic");
  const [gender,  setGender]  = useState("Female");
  const [age,     setAge]     = useState("18–25");
  const [content, setContent] = useState("All");

  const drops = [
    { label: "Preferred gender:", val: gender,  set: setGender,  opts: ["Female", "Male", "All"] },
    { label: "Age range:",        val: age,     set: setAge,     opts: ["18–25", "25–35", "35+", "Any"] },
    { label: "Content type:",     val: content, set: setContent, opts: ["All", "SFW only", "NSFW only"] },
  ];

  return (
    <div className="pp-pref">
      {/* Art style */}
      <div className="pp-section">
        <span className="pp-section-label">Graphic style</span>
        <div className="pp-style-grid">
          {STYLES.map((s) => (
            <div
              key={s.label}
              className={`pp-style-card${style === s.label ? " pp-active" : ""}`}
              onClick={() => setStyle(s.label)}
            >
              <div className="pp-style-bg" style={{ backgroundImage: `url(${s.bg})` }} />
              {style !== s.label && <div className="pp-style-overlay" />}
              <span className="pp-style-name">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Dropdowns */}
      <div className="pp-section">
        <span className="pp-section-label">Preferences</span>
        <div className="pp-drops">
          {drops.map((d) => (
            <div key={d.label} className="pp-drop-row">
              <div className="pp-drop-left">
                <span className="pp-drop-lbl">{d.label}</span>
                <span className="pp-drop-val">&nbsp;{d.val}</span>
              </div>
              <IconChevron />
              <select className="pp-drop-sel" value={d.val} onChange={e => d.set(e.target.value)}>
                {d.opts.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Chat Profiles Tab ─── */
function ChatProfilesTab() {
  return (
    <div className="pp-chats">
      {CHAT_DATA.map((p) => (
        <div className="pp-chat-card" key={p.name}>
          <div className="pp-chat-ava">
            <IconPerson size={20} stroke="#848484" />
          </div>
          <div className="pp-chat-info">
            <div className="pp-chat-name">{p.name}</div>
            <div className="pp-chat-bio">{p.bio}</div>
          </div>
          <button className="pp-chat-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
            </svg>
          </button>
        </div>
      ))}
      <button className="pp-chat-create">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="8.5" cy="7" r="4"/>
          <line x1="20" y1="8" x2="20" y2="14"/>
          <line x1="23" y1="11" x2="17" y2="11"/>
        </svg>
        Create New
      </button>
    </div>
  );
}

/* ─── Unauthenticated ─── */
function UnauthContent() {
  return (
    <div className="pp-unauth">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#313131" strokeWidth="1.5" strokeLinecap="round">
        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      <div>
        <div className="pp-unauth-title">You&apos;re not logged in</div>
        <div className="pp-unauth-sub">Sign in or create an account to access your profile and personal settings.</div>
      </div>
      <div className="pp-unauth-btns">
        <a href="/login" className="pp-unauth-p">Sign in</a>
        <a href="/register" className="pp-unauth-s">Create account</a>
      </div>
    </div>
  );
}

/* ─── Profile Content (authenticated) ─── */
function ProfileContent() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("subscription");
  const isAdmin = user?.role === "admin";

  return (
    <>
      {isAdmin && (
        <a href="/admin" className="pp-admin-link">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          Admin panel
        </a>
      )}

      {/* Tab navigation */}
      <div className="pp-tabs">
        {TABS.map((t) => (
          <div
            key={t.id}
            className={`pp-tab${activeTab === t.id ? " pp-tab-active" : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            <span className="pp-tab-label">{t.label}</span>
            <div className="pp-tab-line" />
          </div>
        ))}
      </div>

      {activeTab === "subscription"  && <SubscriptionTab />}
      {activeTab === "account"       && <AccountTab />}
      {activeTab === "preferences"   && <PreferencesTab />}
      {activeTab === "chat-profiles" && <ChatProfilesTab />}
    </>
  );
}

/* ─── Page ─── */
export default function ProfilePage() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="pp">
        {user ? <ProfileContent /> : <UnauthContent />}
      </div>
    </>
  );
}
