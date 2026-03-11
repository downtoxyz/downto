"use client";

import { useState } from "react";
import * as db from "@/lib/db";
import type { Profile } from "@/lib/types";
import { font, color } from "@/lib/styles";
import Grain from "./Grain";
import { logError } from "@/lib/logger";

const ProfileSetupScreen = ({
  profile,
  onComplete,
}: {
  profile: Profile;
  onComplete: (updated: Profile) => void;
}) => {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [igHandle, setIgHandle] = useState(profile.ig_handle || "");
  const [saving, setSaving] = useState(false);

  const usernameValid = /^[a-z0-9_]{3,20}$/.test(username);
  const displayNameValid = displayName.trim().length >= 1;
  const formValid = usernameValid && displayNameValid;

  const handleSave = async () => {
    if (!formValid) return;
    setSaving(true);
    setUsernameError(null);
    try {
      const updates: Partial<Profile> = {
        username,
        display_name: displayName.trim(),
      };
      if (igHandle.trim()) updates.ig_handle = igHandle.trim().replace(/^@/, "");
      const updated = await db.updateProfile(updates);
      onComplete(updated);
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
      if (code === '23505') {
        setUsernameError("that one's taken");
      } else {
        logError("saveProfile", err, { username });
      }
      setSaving(false);
    }
  };

  const previewName = displayName.trim() || "your name";
  const previewAvatar = displayName.trim() ? displayName.trim().charAt(0).toUpperCase() : "?";
  const previewUsername = username || "username";

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "0 auto",
        minHeight: "100vh",
        background: color.bg,
        padding: "60px 24px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Grain />

      <h1
        style={{
          fontFamily: font.serif,
          fontSize: 48,
          color: color.text,
          fontWeight: 400,
          marginBottom: 8,
        }}
      >
        set up
      </h1>
      <p
        style={{
          fontFamily: font.mono,
          fontSize: 12,
          color: color.dim,
          marginBottom: 40,
        }}
      >
        pick a name and username — this is how you&apos;ll show up
      </p>

      {/* Display name */}
      <label
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          color: color.muted,
          marginBottom: 8,
          display: "block",
        }}
      >
        display name
      </label>
      <input
        type="text"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="your name"
        maxLength={30}
        style={{
          width: "100%",
          padding: "14px 16px",
          background: color.card,
          border: `1px solid ${color.borderMid}`,
          borderRadius: 12,
          color: color.text,
          fontFamily: font.mono,
          fontSize: 14,
          outline: "none",
          marginBottom: 24,
          boxSizing: "border-box",
        }}
      />

      {/* Username */}
      <label
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          color: color.muted,
          marginBottom: 8,
          display: "block",
        }}
      >
        username
      </label>
      <input
        type="text"
        value={username}
        onChange={(e) => {
          const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
          setUsername(v);
          setUsernameError(null);
        }}
        placeholder="your_username"
        style={{
          width: "100%",
          padding: "14px 16px",
          background: color.card,
          border: `1px solid ${usernameError ? "#ff4444" : color.borderMid}`,
          borderRadius: 12,
          color: color.text,
          fontFamily: font.mono,
          fontSize: 14,
          outline: "none",
          marginBottom: usernameError ? 4 : (username && !usernameValid ? 4 : 24),
          boxSizing: "border-box",
        }}
      />
      {usernameError && (
        <p style={{ fontFamily: font.mono, fontSize: 11, color: "#ff4444", margin: "0 0 16px 0" }}>
          {usernameError}
        </p>
      )}
      {username && !usernameValid && !usernameError && (
        <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, margin: "0 0 16px 0" }}>
          3-20 chars, letters, numbers & underscores
        </p>
      )}

      {/* IG handle */}
      <label
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          color: color.muted,
          marginBottom: 8,
          display: "block",
        }}
      >
        instagram handle (optional)
      </label>
      <div style={{ position: "relative", marginBottom: 32 }}>
        <span
          style={{
            position: "absolute",
            left: 16,
            top: "50%",
            transform: "translateY(-50%)",
            fontFamily: font.mono,
            fontSize: 14,
            color: color.dim,
          }}
        >
          @
        </span>
        <input
          type="text"
          value={igHandle}
          onChange={(e) => setIgHandle(e.target.value.replace(/^@/, ""))}
          placeholder="yourhandle"
          style={{
            width: "100%",
            padding: "14px 16px 14px 32px",
            background: color.card,
            border: `1px solid ${color.borderMid}`,
            borderRadius: 12,
            color: color.text,
            fontFamily: font.mono,
            fontSize: 14,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Feed preview */}
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: color.dim,
          marginBottom: 10,
        }}
      >
        preview — how you&apos;ll look in the feed
      </div>
      <div
        style={{
          background: color.card,
          border: `1px solid ${color.border}`,
          borderRadius: 14,
          padding: 14,
          marginBottom: 32,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: color.accent,
              color: "#000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: font.mono,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {previewAvatar}
          </div>
          <span style={{ fontFamily: font.mono, fontSize: 13, color: color.text }}>
            {previewName}
          </span>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: color.dim }}>
            @{previewUsername}
          </span>
        </div>
        <div style={{ fontFamily: font.serif, fontSize: 18, color: color.text }}>
          who wants to grab dinner tonight?
        </div>
      </div>

      {/* Let's go button */}
      <button
        onClick={handleSave}
        disabled={saving || !formValid}
        style={{
          width: "100%",
          padding: "16px",
          background: formValid ? color.accent : color.borderMid,
          border: "none",
          borderRadius: 12,
          color: formValid ? color.bg : color.dim,
          fontFamily: font.mono,
          fontSize: 14,
          fontWeight: 700,
          cursor: saving || !formValid ? "default" : "pointer",
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? "saving..." : "let's go"}
      </button>
    </div>
  );
};

export default ProfileSetupScreen;
