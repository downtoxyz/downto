"use client";

import { useState } from "react";
import type { Profile } from "@/lib/types";
import { font, color } from "@/lib/styles";
import type { Friend, AvailabilityStatus } from "@/lib/ui-types";
import { AVAILABILITY_OPTIONS, EXPIRY_OPTIONS } from "@/lib/ui-types";

const ProfileView = ({
  friends,
  onOpenFriends,
  onLogout,
  profile,
  pushEnabled,
  pushSupported,
  onTogglePush,
  onAvailabilityChange,
  onUpdateProfile,
  showToast,
  archivedChecks,
  onRestoreCheck,
}: {
  friends: Friend[];
  onOpenFriends: () => void;
  onLogout: () => void;
  profile?: Profile | null;
  pushEnabled: boolean;
  pushSupported: boolean;
  onTogglePush: () => void;
  onAvailabilityChange?: (status: AvailabilityStatus) => void;
  onUpdateProfile?: (updates: Partial<Profile>) => Promise<void>;
  showToast?: (msg: string) => void;
  archivedChecks?: { id: string; text: string; archived_at: string }[];
  onRestoreCheck?: (checkId: string) => void;
}) => {
  const [availability, setAvailability] = useState<AvailabilityStatus>(
    profile?.availability ?? "open"
  );
  const [expiry, setExpiry] = useState<string | null>(null);
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customExpiry, setCustomExpiry] = useState("");
  const [pendingStatus, setPendingStatus] = useState<AvailabilityStatus | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingUsername, setConfirmingUsername] = useState(false);
  const [editingIg, setEditingIg] = useState(false);
  const [igInput, setIgInput] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const handleStatusSelect = (status: AvailabilityStatus) => {
    if (status === "open") {
      setAvailability("open");
      setExpiry(null);
      setShowExpiryPicker(false);
      setShowCustomInput(false);
      onAvailabilityChange?.("open");
    } else {
      setPendingStatus(status);
      setShowExpiryPicker(true);
      setShowCustomInput(false);
    }
  };

  const handleExpirySelect = (exp: string) => {
    if (exp === "custom") {
      setShowCustomInput(true);
      return;
    }
    if (pendingStatus) {
      setAvailability(pendingStatus);
      setExpiry(exp === "none" ? null : exp);
      setShowExpiryPicker(false);
      setShowCustomInput(false);
      onAvailabilityChange?.(pendingStatus);
      setPendingStatus(null);
    }
  };

  const handleCustomExpirySubmit = () => {
    if (pendingStatus && customExpiry.trim()) {
      setAvailability(pendingStatus);
      setExpiry(customExpiry.trim());
      setShowExpiryPicker(false);
      setShowCustomInput(false);
      onAvailabilityChange?.(pendingStatus);
      setPendingStatus(null);
      setCustomExpiry("");
    }
  };

  const displayName = profile?.display_name ?? "kat";
  const avatarLetter = profile?.avatar_letter ?? displayName.charAt(0).toUpperCase();

  const openEditModal = () => {
    setNameInput(displayName);
    setUsernameInput(profile?.username ?? "");
    setUsernameError("");
    setSaving(false);
    setConfirmingUsername(false);
    setShowEditModal(true);
  };

  const usernameChanged = () => {
    const sanitized = usernameInput.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
    return sanitized !== (profile?.username ?? "");
  };

  const handleProfileSave = async (confirmed = false) => {
    if (!onUpdateProfile) return;
    const trimmedName = nameInput.trim();
    const sanitizedUsername = usernameInput.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);

    if (!trimmedName) return;
    if (sanitizedUsername && !/^[a-z0-9_]{3,20}$/.test(sanitizedUsername)) {
      setUsernameError("3-20 chars, lowercase letters, numbers, _");
      return;
    }
    setUsernameError("");

    // If username is changing and not yet confirmed, show confirmation
    if (usernameChanged() && !confirmed) {
      setConfirmingUsername(true);
      return;
    }

    setSaving(true);

    const updates: Partial<Profile> = {};
    if (trimmedName !== displayName) updates.display_name = trimmedName;
    if (sanitizedUsername !== (profile?.username ?? "")) updates.username = sanitizedUsername;

    if (Object.keys(updates).length === 0) {
      setShowEditModal(false);
      return;
    }

    try {
      await onUpdateProfile(updates);
      setShowEditModal(false);
      setConfirmingUsername(false);
      showToast?.("Profile updated");
    } catch (err: unknown) {
      const pgErr = err as { code?: string; message?: string };
      if (pgErr.code === "23505") {
        setConfirmingUsername(false);
        setUsernameError("that one's taken");
      } else if (pgErr.message?.includes("USERNAME_COOLDOWN")) {
        setConfirmingUsername(false);
        setUsernameError("you changed your username too recently — try again in a few days");
      } else {
        showToast?.("Failed to update profile");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleIgSave = async () => {
    if (!onUpdateProfile) return;
    const trimmed = igInput.trim().replace(/^@/, "");
    try {
      await onUpdateProfile({ ig_handle: trimmed || null });
      setEditingIg(false);
    } catch {
      showToast?.("Failed to update Instagram");
    }
  };

  return (
  <div style={{ padding: "0 20px 100px", animation: "fadeIn 0.3s ease" }}>
    <div style={{ textAlign: "center", paddingTop: 20 }}>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: color.accent,
          color: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: font.mono,
          fontSize: 28,
          fontWeight: 700,
          margin: "0 auto 12px",
        }}
      >
        {avatarLetter}
      </div>
      <div
        onClick={onUpdateProfile ? openEditModal : undefined}
        style={{
          cursor: onUpdateProfile ? "pointer" : "default",
          display: "inline-flex",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <h2 style={{ fontFamily: font.serif, fontSize: 24, color: color.text, fontWeight: 400 }}>
          {displayName}
        </h2>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: color.dim }}>
          @{profile?.username ?? "you"}
        </span>
        {onUpdateProfile && (
          <span style={{ fontSize: 12, color: color.faint }}>✎</span>
        )}
      </div>
    </div>

    {/* Friends */}
    <button
      onClick={onOpenFriends}
      style={{
        width: "100%",
        marginTop: 24,
        background: color.card,
        border: `1px solid ${color.border}`,
        borderRadius: 16,
        padding: "14px 16px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex" }}>
          {friends.slice(0, 4).map((f, i) => (
            <div
              key={f.id}
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: color.accent,
                color: "#000",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: font.mono,
                fontSize: 12,
                fontWeight: 700,
                marginLeft: i > 0 ? -10 : 0,
                border: `2px solid ${color.card}`,
              }}
            >
              {f.avatar}
            </div>
          ))}
        </div>
        <span style={{ fontFamily: font.mono, fontSize: 12, color: color.text }}>
          {friends.length} friends
        </span>
      </div>
      <span style={{ color: color.dim, fontSize: 14 }}>→</span>
    </button>

    {/* Availability Meter */}
    <div
      style={{
        marginTop: 24,
        background: color.card,
        borderRadius: 16,
        padding: 16,
        border: `1px solid ${color.border}`,
      }}
    >
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: color.dim,
          marginBottom: 14,
        }}
      >
        Right now
      </div>
      {!showExpiryPicker ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {AVAILABILITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleStatusSelect(option.value)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  background: availability === option.value ? `${option.color}15` : "transparent",
                  border: `1px solid ${availability === option.value ? option.color : color.borderMid}`,
                  borderRadius: 12,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <span style={{ fontSize: 18 }}>{option.emoji}</span>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 12,
                      color: availability === option.value ? option.color : color.muted,
                      fontWeight: availability === option.value ? 700 : 400,
                    }}
                  >
                    {option.label}
                  </span>
                  {availability === option.value && expiry && (
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: 10,
                        color: color.dim,
                        marginLeft: 8,
                      }}
                    >
                      · expires in {expiry}
                    </span>
                  )}
                </div>
                {availability === option.value && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: option.color,
                    }}
                  />
                )}
              </button>
            ))}
          </div>
          <p
            style={{
              fontFamily: font.mono,
              fontSize: 10,
              color: color.faint,
              marginTop: 12,
              textAlign: "center",
            }}
          >
            friends can see this on your profile
          </p>
        </>
      ) : (
        <>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 18,
              color: color.text,
              marginBottom: 4,
            }}
          >
            {AVAILABILITY_OPTIONS.find((o) => o.value === pendingStatus)?.emoji}{" "}
            {AVAILABILITY_OPTIONS.find((o) => o.value === pendingStatus)?.label}
          </div>
          <p
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              color: color.dim,
              marginBottom: 16,
            }}
          >
            {showCustomInput ? "Enter expiration" : "How long?"}
          </p>
          {!showCustomInput ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {EXPIRY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleExpirySelect(opt.value)}
                  style={{
                    background: color.surface,
                    border: `1px solid ${color.borderMid}`,
                    borderRadius: 20,
                    padding: "8px 14px",
                    fontFamily: font.mono,
                    fontSize: 11,
                    color: color.muted,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={customExpiry}
                onChange={(e) => setCustomExpiry(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCustomExpirySubmit()}
                placeholder="e.g., 3 hours, 6pm, Friday"
                autoFocus
                style={{
                  flex: 1,
                  background: color.deep,
                  border: `1px solid ${color.borderMid}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  color: color.text,
                  outline: "none",
                }}
              />
              <button
                onClick={handleCustomExpirySubmit}
                disabled={!customExpiry.trim()}
                style={{
                  background: customExpiry.trim() ? color.accent : color.borderMid,
                  color: customExpiry.trim() ? "#000" : color.dim,
                  border: "none",
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: customExpiry.trim() ? "pointer" : "not-allowed",
                }}
              >
                Set
              </button>
            </div>
          )}
          <button
            onClick={() => {
              setShowExpiryPicker(false);
              setShowCustomInput(false);
              setPendingStatus(null);
              setCustomExpiry("");
            }}
            style={{
              marginTop: 14,
              background: "transparent",
              border: "none",
              fontFamily: font.mono,
              fontSize: 11,
              color: color.faint,
              cursor: "pointer",
            }}
          >
            ← cancel
          </button>
        </>
      )}
    </div>

    <div style={{ marginTop: 24 }}>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: color.faint,
          marginBottom: 16,
        }}
      >
        Your vibes
      </div>
      {["techno", "ambient", "house", "photography", "late night", "community"].map((v) => (
        <span
          key={v}
          style={{
            display: "inline-block",
            background: color.card,
            color: color.muted,
            padding: "8px 14px",
            borderRadius: 20,
            fontFamily: font.mono,
            fontSize: 11,
            margin: "0 6px 8px 0",
            border: `1px solid ${color.border}`,
          }}
        >
          {v}
        </span>
      ))}
    </div>

    {archivedChecks && archivedChecks.length > 0 && (
      <div style={{ marginTop: 24 }}>
        <button
          onClick={() => setShowArchived(!showArchived)}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            fontFamily: font.mono,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            color: color.faint,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: showArchived ? 12 : 0,
          }}
        >
          Archived checks ({archivedChecks.length})
          <span style={{ fontSize: 8 }}>{showArchived ? "▼" : "→"}</span>
        </button>
        {showArchived && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {archivedChecks.map((check) => (
              <div
                key={check.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 14px",
                  background: color.card,
                  border: `1px solid ${color.border}`,
                  borderRadius: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: 12,
                    color: color.muted,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {check.text}
                </span>
                <button
                  onClick={() => onRestoreCheck?.(check.id)}
                  style={{
                    background: "transparent",
                    border: `1px solid ${color.borderMid}`,
                    borderRadius: 12,
                    padding: "6px 12px",
                    fontFamily: font.mono,
                    fontSize: 11,
                    color: color.text,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )}

    <div style={{ marginTop: 32 }}>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: color.faint,
          marginBottom: 16,
        }}
      >
        Settings
      </div>
      {editingIg ? (
        <div
          style={{
            padding: "14px 0",
            borderBottom: `1px solid ${color.border}`,
          }}
        >
          <div style={{ fontFamily: font.mono, fontSize: 12, color: color.muted, marginBottom: 8 }}>Instagram</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontFamily: font.mono, fontSize: 12, color: color.dim }}>@</span>
            <input
              type="text"
              value={igInput}
              onChange={(e) => setIgInput(e.target.value.replace(/^@/, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleIgSave();
                if (e.key === "Escape") setEditingIg(false);
              }}
              placeholder="username"
              autoFocus
              style={{
                flex: 1,
                background: color.deep,
                border: `1px solid ${color.borderMid}`,
                borderRadius: 10,
                padding: "8px 12px",
                fontFamily: font.mono,
                fontSize: 12,
                color: color.text,
                outline: "none",
              }}
            />
            <button
              onClick={handleIgSave}
              style={{
                background: color.accent,
                color: "#000",
                border: "none",
                borderRadius: 10,
                padding: "8px 14px",
                fontFamily: font.mono,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Save
            </button>
            <button
              onClick={() => setEditingIg(false)}
              style={{
                background: "transparent",
                border: "none",
                fontFamily: font.mono,
                fontSize: 11,
                color: color.faint,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => {
            if (onUpdateProfile) {
              setIgInput(profile?.ig_handle ?? "");
              setEditingIg(true);
            }
          }}
          style={{
            padding: "14px 0",
            borderBottom: `1px solid ${color.border}`,
            fontFamily: font.mono,
            fontSize: 12,
            color: color.muted,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: onUpdateProfile ? "pointer" : "default",
          }}
        >
          <span>Instagram</span>
          {profile?.ig_handle ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <a
                href={`https://instagram.com/${profile.ig_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: color.dim, fontSize: 11, textDecoration: "none" }}
              >
                @{profile.ig_handle}
              </a>
              {onUpdateProfile && <span style={{ fontSize: 10, color: color.faint }}>✎</span>}
            </span>
          ) : (
            onUpdateProfile && <span style={{ color: color.faint, fontSize: 11 }}>Add →</span>
          )}
        </div>
      )}
      {pushSupported && (
        <div
          onClick={onTogglePush}
          style={{
            padding: "14px 0",
            borderBottom: `1px solid ${color.border}`,
            fontFamily: font.mono,
            fontSize: 12,
            color: color.muted,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
          }}
        >
          <span>Push Notifications</span>
          <span style={{ color: pushEnabled ? color.accent : color.borderMid, fontSize: 11 }}>
            {pushEnabled ? "✓ Enabled" : "Enable →"}
          </span>
        </div>
      )}
      {["Privacy & Visibility"].map(
        (s) => (
          <div
            key={s}
            style={{
              padding: "14px 0",
              borderBottom: `1px solid ${color.border}`,
              fontFamily: font.mono,
              fontSize: 12,
              color: color.muted,
              display: "flex",
              justifyContent: "space-between",
              cursor: "pointer",
            }}
          >
            {s}
            <span style={{ color: color.borderMid }}>→</span>
          </div>
        )
      )}
      {profile?.is_test && onUpdateProfile && (
        <div
          onClick={async () => {
            try {
              await onUpdateProfile({ onboarded: false } as Partial<Profile>);
              window.location.reload();
            } catch {
              showToast?.("Failed to reset");
            }
          }}
          style={{
            padding: "14px 0",
            borderBottom: `1px solid ${color.border}`,
            fontFamily: font.mono,
            fontSize: 12,
            color: "#f0ad4e",
            display: "flex",
            justifyContent: "space-between",
            cursor: "pointer",
          }}
        >
          <span>Reset Onboarding</span>
          <span style={{ color: "#f0ad4e" }}>↺</span>
        </div>
      )}
      <div
        style={{
          padding: "14px 0",
          borderBottom: `1px solid ${color.border}`,
          fontFamily: font.mono,
          fontSize: 12,
          color: color.muted,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>About</span>
        <span style={{ color: color.faint, fontSize: 11 }}>
          v{(process.env.NEXT_PUBLIC_BUILD_ID ?? "dev").slice(0, 7)}
        </span>
      </div>
      <div
        onClick={onLogout}
        style={{
          padding: "14px 0",
          fontFamily: font.mono,
          fontSize: 12,
          color: "#ff6b6b",
          display: "flex",
          justifyContent: "space-between",
          cursor: "pointer",
        }}
      >
        <span>Log out</span>
        <span style={{ color: "#ff6b6b" }}>→</span>
      </div>
    </div>
    {showEditModal && (
      <div
        onClick={() => setShowEditModal(false)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: color.deep,
            border: `1px solid ${color.border}`,
            borderRadius: 16,
            maxWidth: 300,
            width: "calc(100% - 40px)",
            padding: "24px 20px",
          }}
        >
          <div style={{ fontFamily: font.serif, fontSize: 18, color: color.text, marginBottom: 20, textAlign: "center" }}>
            Edit profile
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontFamily: font.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: color.dim, marginBottom: 6, display: "block" }}>
              Display name
            </label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => { if (e.target.value.length <= 30) setNameInput(e.target.value); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleProfileSave(); }}
              autoFocus
              style={{
                width: "100%",
                background: color.surface,
                border: `1px solid ${color.borderMid}`,
                borderRadius: 10,
                padding: "10px 12px",
                fontFamily: font.serif,
                fontSize: 18,
                color: color.text,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: usernameError ? 4 : 20 }}>
            <label style={{ fontFamily: font.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: color.dim, marginBottom: 6, display: "block" }}>
              Username
            </label>
            <div style={{ position: "relative" }}>
              <span style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                fontFamily: font.mono,
                fontSize: 13,
                color: color.dim,
                pointerEvents: "none",
              }}>@</span>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => {
                  const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
                  setUsernameInput(val);
                  setUsernameError("");
                }}
                onKeyDown={(e) => { if (e.key === "Enter") handleProfileSave(); }}
                style={{
                  width: "100%",
                  background: color.surface,
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: usernameError ? "#ff4444" : color.borderMid,
                  borderRadius: 10,
                  padding: "10px 12px 10px 26px",
                  fontFamily: font.mono,
                  fontSize: 13,
                  color: color.text,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
          {usernameError && (
            <p style={{ fontFamily: font.mono, fontSize: 10, color: "#ff4444", marginBottom: 16, textAlign: "center" }}>
              {usernameError}
            </p>
          )}

          {confirmingUsername ? (
            <div>
              <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, marginBottom: 14, textAlign: "center", lineHeight: 1.5 }}>
                you can only change your username once every 24 hours
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setConfirmingUsername(false)}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: `1px solid ${color.borderMid}`,
                    borderRadius: 12,
                    padding: 12,
                    fontFamily: font.mono,
                    fontSize: 12,
                    fontWeight: 700,
                    color: color.dim,
                    cursor: "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Nah
                </button>
                <button
                  onClick={() => handleProfileSave(true)}
                  disabled={saving}
                  style={{
                    flex: 2,
                    background: saving ? color.borderMid : color.accent,
                    color: saving ? color.dim : "#000",
                    border: "none",
                    borderRadius: 12,
                    padding: 12,
                    fontFamily: font.mono,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: saving ? "not-allowed" : "pointer",
                    letterSpacing: "0.04em",
                  }}
                >
                  {saving ? "Saving..." : "yes, I really wanna change it"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowEditModal(false)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: `1px solid ${color.borderMid}`,
                  borderRadius: 12,
                  padding: 12,
                  fontFamily: font.mono,
                  fontSize: 12,
                  fontWeight: 700,
                  color: color.dim,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleProfileSave()}
                disabled={saving || !nameInput.trim()}
                style={{
                  flex: 1,
                  background: nameInput.trim() && !saving ? color.accent : color.borderMid,
                  color: nameInput.trim() && !saving ? "#000" : color.dim,
                  border: "none",
                  borderRadius: 12,
                  padding: 12,
                  fontFamily: font.mono,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: nameInput.trim() && !saving ? "pointer" : "not-allowed",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </div>
      </div>
    )}
  </div>
  );
};

export default ProfileView;
