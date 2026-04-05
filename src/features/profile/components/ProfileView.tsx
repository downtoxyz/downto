"use client";

import { useState, useEffect } from "react";
import type { Profile } from "@/lib/types";
import { API_BASE } from "@/lib/db";
import cn from "@/lib/tailwindMerge";
import type { Friend, AvailabilityStatus } from "@/lib/ui-types";
import { AVAILABILITY_OPTIONS, EXPIRY_OPTIONS } from "@/lib/ui-types";
import { themes } from "@/lib/themes";
import type { ThemeName } from "@/lib/themes";
import { applyTheme } from "@/app/components/ThemeHydrator";

const THEME_STORAGE_KEY = "downto-theme";
const THEME_NAMES = Object.keys(themes) as ThemeName[];

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
  const [isLatestBuild, setIsLatestBuild] = useState<boolean | null>(null);

  useEffect(() => {
    const buildId = process.env.NEXT_PUBLIC_BUILD_ID;
    if (!buildId) return;
    fetch(`${API_BASE}/api/version`)
      .then((r) => r.json())
      .then(({ buildId: latest }) => setIsLatestBuild(!latest || latest === buildId))
      .catch(() => {});
  }, []);

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
  const [activeTheme, setActiveTheme] = useState<ThemeName | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeName | null;
    if (stored && stored in themes) setActiveTheme(stored);
  }, []);

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
  <div className="px-5 pb-[100px] animate-fade-in">
    <div className="text-center pt-5">
      <div
        className="w-[72px] h-[72px] rounded-full bg-dt text-black flex items-center justify-center font-mono text-[28px] font-bold mx-auto mb-3"
      >
        {avatarLetter}
      </div>
      <div
        onClick={onUpdateProfile ? openEditModal : undefined}
        className={cn(
          "inline-flex items-baseline gap-2",
          onUpdateProfile ? "cursor-pointer" : "cursor-default"
        )}
      >
        <h2 className="font-serif text-2xl text-primary font-normal">
          {displayName}
        </h2>
        <span className="font-mono text-xs text-dim">
          @{profile?.username ?? "you"}
        </span>
        {onUpdateProfile && (
          <span className="text-xs text-faint">✎</span>
        )}
      </div>
    </div>

    {/* Friends */}
    <button
      onClick={onOpenFriends}
      className="w-full mt-6 bg-card border border-border rounded-2xl py-3.5 px-4 cursor-pointer flex items-center justify-between"
    >
      <div className="flex items-center gap-3">
        <div className="flex">
          {friends.slice(0, 4).map((f, i) => (
            <div
              key={f.id}
              className={cn(
                "w-8 h-8 rounded-full bg-dt text-black flex items-center justify-center font-mono text-xs font-bold border-2 border-card",
                i > 0 && "-ml-2.5"
              )}
            >
              {f.avatar}
            </div>
          ))}
        </div>
        <span className="font-mono text-xs text-primary">
          {friends.length} friends
        </span>
      </div>
      <span className="text-dim text-sm">→</span>
    </button>

    {/* Theme Switcher — only for users with theme_enabled flag */}
    {profile?.theme_enabled && <div className="mt-6 bg-card rounded-2xl p-4 border border-border">
      <div
        className="font-mono text-tiny uppercase text-faint mb-3.5"
        style={{ letterSpacing: "0.15em" }}
      >
        Theme
      </div>
      <div className="flex flex-wrap gap-2">
        {THEME_NAMES.map((name) => {
          const isActive = activeTheme === name;
          return (
            <button
              key={name}
              onClick={() => {
                setActiveTheme(name);
                localStorage.setItem(THEME_STORAGE_KEY, name);
                applyTheme(name);
              }}
              className={cn(
                "rounded-xl py-2 px-3.5 font-mono text-xs cursor-pointer transition-all duration-200",
                isActive
                  ? "bg-dt text-black font-bold border border-transparent"
                  : "bg-transparent text-muted border border-border-mid"
              )}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>

    {/* Availability Meter */}
    <div
      className="mt-6 bg-card rounded-2xl p-4 border border-border"
    >
      <div
        className="font-mono text-tiny uppercase text-dim mb-3.5"
        style={{ letterSpacing: "0.15em" }}
      >
        Right now
      </div>
      {!showExpiryPicker ? (
        <>
          <div className="flex flex-col gap-2">
            {AVAILABILITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleStatusSelect(option.value)}
                className="flex items-center gap-2.5 py-3 px-3.5 rounded-xl cursor-pointer transition-all duration-200"
                style={{
                  background: availability === option.value ? `${option.color}15` : "transparent",
                  border: `1px solid ${availability === option.value ? option.color : "var(--color-border-mid, #333)"}`,
                }}
              >
                <span className="text-lg">{option.emoji}</span>
                <div className="flex-1 text-left">
                  <span
                    className="font-mono text-xs"
                    style={{
                      color: availability === option.value ? option.color : undefined,
                      fontWeight: availability === option.value ? 700 : 400,
                    }}
                  >
                    {option.label}
                  </span>
                  {availability === option.value && expiry && (
                    <span
                      className="font-mono text-tiny text-dim ml-2"
                    >
                      · expires in {expiry}
                    </span>
                  )}
                </div>
                {availability === option.value && (
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: option.color }}
                  />
                )}
              </button>
            ))}
          </div>
          <p
            className="font-mono text-tiny text-faint mt-3 text-center"
          >
            friends can see this on your profile
          </p>
        </>
      ) : (
        <>
          <div
            className="font-serif text-lg text-primary mb-1"
          >
            {AVAILABILITY_OPTIONS.find((o) => o.value === pendingStatus)?.emoji}{" "}
            {AVAILABILITY_OPTIONS.find((o) => o.value === pendingStatus)?.label}
          </div>
          <p
            className="font-mono text-xs text-dim mb-4"
          >
            {showCustomInput ? "Enter expiration" : "How long?"}
          </p>
          {!showCustomInput ? (
            <div className="flex flex-wrap gap-2">
              {EXPIRY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleExpirySelect(opt.value)}
                  className="bg-surface border border-border-mid rounded-2xl py-2 px-3.5 font-mono text-xs text-muted cursor-pointer transition-all duration-200"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={customExpiry}
                onChange={(e) => setCustomExpiry(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCustomExpirySubmit()}
                placeholder="e.g., 3 hours, 6pm, Friday"
                autoFocus
                className="flex-1 bg-deep border border-border-mid rounded-lg py-2.5 px-3.5 font-mono text-xs text-primary outline-none"
              />
              <button
                onClick={handleCustomExpirySubmit}
                disabled={!customExpiry.trim()}
                className={cn(
                  "border-none rounded-lg py-2.5 px-4 font-mono text-xs font-bold",
                  customExpiry.trim()
                    ? "bg-dt text-black cursor-pointer"
                    : "bg-border-mid text-dim cursor-not-allowed"
                )}
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
            className="mt-3.5 bg-transparent border-none font-mono text-xs text-faint cursor-pointer"
          >
            ← cancel
          </button>
        </>
      )}
    </div>

    {archivedChecks && archivedChecks.length > 0 && (
      <div className="mt-6">
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={cn(
            "bg-transparent border-none p-0 font-mono text-tiny uppercase text-faint cursor-pointer flex items-center gap-1.5",
            showArchived ? "mb-3" : "mb-0"
          )}
          style={{ letterSpacing: "0.15em" }}
        >
          Archived checks ({archivedChecks.length})
          <span style={{ fontSize: 8 }}>{showArchived ? "▼" : "→"}</span>
        </button>
        {showArchived && (
          <div className="flex flex-col gap-2">
            {archivedChecks.map((check) => (
              <div
                key={check.id}
                className="flex items-center justify-between gap-3 py-2.5 px-3.5 bg-card border border-border rounded-xl"
              >
                <span
                  className="font-mono text-xs text-muted flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
                >
                  {check.text}
                </span>
                <button
                  onClick={() => onRestoreCheck?.(check.id)}
                  className="bg-transparent border border-border-mid rounded-xl py-1.5 px-3 font-mono text-xs text-primary cursor-pointer shrink-0"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )}

    <div className="mt-8">
      <div
        className="font-mono text-tiny uppercase text-faint mb-4"
        style={{ letterSpacing: "0.15em" }}
      >
        Settings
      </div>
      {editingIg ? (
        <div
          className="py-3.5 border-b border-border"
        >
          <div className="font-mono text-xs text-muted mb-2">Instagram</div>
          <div className="flex gap-2 items-center">
            <span className="font-mono text-xs text-dim">@</span>
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
              className="flex-1 bg-deep border border-border-mid rounded-lg py-2 px-3 font-mono text-xs text-primary outline-none"
            />
            <button
              onClick={handleIgSave}
              className="bg-dt text-black border-none rounded-lg py-2 px-3.5 font-mono text-xs font-bold cursor-pointer"
            >
              Save
            </button>
            <button
              onClick={() => setEditingIg(false)}
              className="bg-transparent border-none font-mono text-xs text-faint cursor-pointer"
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
          className={cn(
            "py-3.5 border-b border-border font-mono text-xs text-muted flex justify-between items-center",
            onUpdateProfile ? "cursor-pointer" : "cursor-default"
          )}
        >
          <span>Instagram</span>
          {profile?.ig_handle ? (
            <span className="flex items-center gap-2">
              <a
                href={`https://instagram.com/${profile.ig_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-dim text-xs no-underline"
              >
                @{profile.ig_handle}
              </a>
              {onUpdateProfile && <span className="text-tiny text-faint">✎</span>}
            </span>
          ) : (
            onUpdateProfile && <span className="text-faint text-xs">Add →</span>
          )}
        </div>
      )}
      {pushSupported && (
        <div
          onClick={onTogglePush}
          className="py-3.5 border-b border-border font-mono text-xs text-muted flex justify-between items-center cursor-pointer"
        >
          <span>Push Notifications</span>
          <span className={cn("text-xs", pushEnabled ? "text-dt" : "text-border-mid")}>
            {pushEnabled ? "✓ Enabled" : "Enable →"}
          </span>
        </div>
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
          className="py-3.5 border-b border-border font-mono text-xs flex justify-between cursor-pointer"
          style={{ color: "#f0ad4e" }}
        >
          <span>Reset Onboarding</span>
          <span style={{ color: "#f0ad4e" }}>↺</span>
        </div>
      )}
      <div
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          const el = e.currentTarget;
          const timer = setTimeout(() => {
            const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
            navigator.clipboard.writeText(buildId).then(() => {
              showToast?.("Build ID copied");
            }).catch(() => {});
          }, 500);
          const cancel = () => { clearTimeout(timer); el.removeEventListener("pointerup", cancel); el.removeEventListener("pointerleave", cancel); };
          el.addEventListener("pointerup", cancel);
          el.addEventListener("pointerleave", cancel);
        }}
        className="py-3.5 border-b border-border font-mono text-xs text-muted flex justify-between cursor-pointer select-none"
      >
        <span>About</span>
        <span className="flex items-center gap-1.5">
          {isLatestBuild && (
            <span
              className="bg-[rgba(232,255,90,0.15)] text-dt font-mono font-bold py-0.5 px-1.5 rounded uppercase"
              style={{ fontSize: 9, letterSpacing: "0.08em" }}
            >
              latest
            </span>
          )}
          <span className="text-faint text-xs">
            v{(process.env.NEXT_PUBLIC_BUILD_ID ?? "dev").slice(0, 7)}
          </span>
        </span>
      </div>
      <div
        onClick={onLogout}
        className="py-3.5 font-mono text-xs text-danger flex justify-between cursor-pointer"
      >
        <span>Log out</span>
        <span className="text-danger">→</span>
      </div>
    </div>
    {showEditModal && (
      <div
        onClick={() => setShowEditModal(false)}
        className="fixed inset-0 bg-[rgba(0,0,0,0.7)] z-[9999] flex items-center justify-center"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-deep border border-border rounded-2xl max-w-[300px] w-[calc(100%-40px)] py-6 px-5"
        >
          <div className="font-serif text-lg text-primary mb-5 text-center">
            Edit profile
          </div>

          <div className="mb-4">
            <label
              className="font-mono text-tiny uppercase text-dim mb-1.5 block"
              style={{ letterSpacing: "0.15em" }}
            >
              Display name
            </label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => { if (e.target.value.length <= 30) setNameInput(e.target.value); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleProfileSave(); }}
              autoFocus
              className="w-full bg-surface border border-border-mid rounded-lg py-2.5 px-3 font-serif text-lg text-primary outline-none box-border"
            />
          </div>

          <div style={{ marginBottom: usernameError ? 4 : 20 }}>
            <label
              className="font-mono text-tiny uppercase text-dim mb-1.5 block"
              style={{ letterSpacing: "0.15em" }}
            >
              Username
            </label>
            <div className="relative">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-dim pointer-events-none"
              >@</span>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => {
                  const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
                  setUsernameInput(val);
                  setUsernameError("");
                }}
                onKeyDown={(e) => { if (e.key === "Enter") handleProfileSave(); }}
                className={cn(
                  "w-full bg-surface rounded-lg py-2.5 pr-3 pl-[26px] font-mono text-sm text-primary outline-none box-border border",
                  usernameError ? "border-[#ff4444]" : "border-border-mid"
                )}
              />
            </div>
          </div>
          {usernameError && (
            <p className="font-mono text-tiny text-[#ff4444] mb-4 text-center">
              {usernameError}
            </p>
          )}

          {confirmingUsername ? (
            <div>
              <p className="font-mono text-xs text-dim mb-3.5 text-center leading-normal">
                you can only change your username once every 24 hours
              </p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setConfirmingUsername(false)}
                  className="flex-1 bg-transparent border border-border-mid rounded-xl p-3 font-mono text-xs font-bold text-dim cursor-pointer uppercase"
                  style={{ letterSpacing: "0.08em" }}
                >
                  Nah
                </button>
                <button
                  onClick={() => handleProfileSave(true)}
                  disabled={saving}
                  className={cn(
                    "flex-[2] border-none rounded-xl p-3 font-mono text-xs font-bold",
                    saving
                      ? "bg-border-mid text-dim cursor-not-allowed"
                      : "bg-dt text-black cursor-pointer"
                  )}
                  style={{ letterSpacing: "0.04em" }}
                >
                  {saving ? "Saving..." : "yes, I really wanna change it"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 bg-transparent border border-border-mid rounded-xl p-3 font-mono text-xs font-bold text-dim cursor-pointer uppercase"
                style={{ letterSpacing: "0.08em" }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleProfileSave()}
                disabled={saving || !nameInput.trim()}
                className={cn(
                  "flex-1 border-none rounded-xl p-3 font-mono text-xs font-bold uppercase",
                  nameInput.trim() && !saving
                    ? "bg-dt text-black cursor-pointer"
                    : "bg-border-mid text-dim cursor-not-allowed"
                )}
                style={{ letterSpacing: "0.08em" }}
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
