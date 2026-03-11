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
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
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

  const handleNameSave = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || !onUpdateProfile) return;
    try {
      await onUpdateProfile({ display_name: trimmed });
      setEditingName(false);
    } catch {
      showToast?.("Failed to update name");
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

  const displayName = profile?.display_name ?? "kat";
  const avatarLetter = profile?.avatar_letter ?? displayName.charAt(0).toUpperCase();

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
      {editingName ? (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", marginTop: 4 }}>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => {
              if (e.target.value.length <= 30) setNameInput(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleNameSave();
              if (e.key === "Escape") setEditingName(false);
            }}
            autoFocus
            style={{
              background: color.deep,
              border: `1px solid ${color.borderMid}`,
              borderRadius: 10,
              padding: "8px 12px",
              fontFamily: font.serif,
              fontSize: 20,
              color: color.text,
              outline: "none",
              width: 160,
              textAlign: "center",
            }}
          />
          <button
            onClick={handleNameSave}
            disabled={!nameInput.trim()}
            style={{
              background: nameInput.trim() ? color.accent : color.borderMid,
              color: nameInput.trim() ? "#000" : color.dim,
              border: "none",
              borderRadius: 10,
              padding: "8px 14px",
              fontFamily: font.mono,
              fontSize: 12,
              fontWeight: 700,
              cursor: nameInput.trim() ? "pointer" : "not-allowed",
            }}
          >
            Save
          </button>
          <button
            onClick={() => setEditingName(false)}
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
      ) : (
        <h2
          onClick={() => {
            if (onUpdateProfile) {
              setNameInput(displayName);
              setEditingName(true);
            }
          }}
          style={{
            fontFamily: font.serif,
            fontSize: 24,
            color: color.text,
            fontWeight: 400,
            cursor: onUpdateProfile ? "pointer" : "default",
            position: "relative",
            display: "inline-block",
          }}
        >
          {displayName}
          {onUpdateProfile && (
            <span style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", marginLeft: 8, fontSize: 12, color: color.faint }}>✎</span>
          )}
        </h2>
      )}
      <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, marginTop: 4 }}>
        @{profile?.username ?? "you"}
      </p>
      {profile?.username && (
        <button
          onClick={() => {
            navigator.clipboard.writeText(`https://downto.xyz?add=${profile.username}`);
            showToast?.("Link copied!");
          }}
          style={{
            marginTop: 10,
            background: "transparent",
            border: `1px solid ${color.borderMid}`,
            borderRadius: 20,
            padding: "6px 14px",
            fontFamily: font.mono,
            fontSize: 11,
            color: color.muted,
            cursor: "pointer",
          }}
        >
          copy my link
        </button>
      )}
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
      {["Calendar Sync (Google/Apple)", "Privacy & Visibility"].map(
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
  </div>
  );
};

export default ProfileView;
