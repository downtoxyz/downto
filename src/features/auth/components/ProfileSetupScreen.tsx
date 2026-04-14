"use client";

import { useState, useEffect } from "react";
import * as db from "@/lib/db";
import type { Profile } from "@/lib/types";
import { color } from "@/lib/styles";
import Grain from "@/app/components/Grain";
import { logError } from "@/lib/logger";
import cn from "@/lib/tailwindMerge";

const ProfileSetupScreen = ({
  profile,
  onComplete,
}: {
  profile: Profile;
  onComplete: (updated: Profile) => void;
}) => {
  const [hasPendingCheck, setHasPendingCheck] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("pendingCheckId")) setHasPendingCheck(true);
  }, []);
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

  return (
    <div className="w-full max-w-[420px] mx-auto min-h-dvh bg-bg px-6 pt-[60px] pb-6 flex flex-col box-border overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
      <Grain />

      <h1 className="font-serif text-5xl text-primary font-normal mb-2">
        set up
      </h1>
      <p className="font-mono text-xs text-dim mb-10">
        {hasPendingCheck
          ? "almost there — quick setup, then you can respond"
          : "pick a name and username \u2014 this is how you\u2019ll show up"}
      </p>

      {/* Display name */}
      <label className="font-mono text-xs text-muted mb-2 block">
        display name
      </label>
      <input
        type="text"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="your name"
        maxLength={30}
        className="w-full py-3.5 px-4 bg-card border border-border-mid rounded-xl text-primary font-mono text-sm outline-none mb-6 box-border"
      />

      {/* Username */}
      <label className="font-mono text-xs text-muted mb-2 block">
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
        className={cn(
          "w-full py-3.5 px-4 bg-card rounded-xl text-primary font-mono text-sm outline-none box-border border",
          usernameError ? "border-[#ff4444]" : "border-border-mid",
          usernameError ? "mb-1" : (username && !usernameValid ? "mb-1" : "mb-6")
        )}
      />
      {usernameError && (
        <p className="font-mono text-xs text-[#ff4444] mt-0 mb-4">
          {usernameError}
        </p>
      )}
      {username && !usernameValid && !usernameError && (
        <p className="font-mono text-xs text-dim mt-0 mb-4">
          3-20 chars, letters, numbers & underscores
        </p>
      )}

      {/* IG handle */}
      <label className="font-mono text-xs text-muted mb-2 block">
        instagram handle (optional)
      </label>
      <div className="relative mb-8">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-sm text-dim">
          @
        </span>
        <input
          type="text"
          value={igHandle}
          onChange={(e) => setIgHandle(e.target.value.replace(/^@/, ""))}
          placeholder="yourhandle"
          className="w-full py-3.5 pr-4 pl-8 bg-card border border-border-mid rounded-xl text-primary font-mono text-sm outline-none box-border"
        />
      </div>

      {/* Feed preview */}
      <div className="font-mono text-tiny uppercase text-dim mb-2.5" style={{ letterSpacing: "0.15em" }}>
        preview — how you&apos;ll look in the feed
      </div>
      <div className="bg-card border border-border rounded-xl p-3.5 mb-8">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-7 h-7 rounded-full bg-dt text-on-accent flex items-center justify-center font-mono text-xs font-bold">
            {previewAvatar}
          </div>
          <span className="font-mono text-sm text-primary">
            {previewName}
          </span>
        </div>
        <div className="font-serif text-lg text-primary">
          who wants to grab dinner tonight?
        </div>
      </div>

      {/* Let's go button */}
      <button
        onClick={handleSave}
        disabled={saving || !formValid}
        className={cn(
          "w-full p-4 border-none rounded-xl font-mono text-sm font-bold",
          formValid ? "bg-dt text-bg" : "bg-border-mid text-dim",
          saving || !formValid ? "cursor-default" : "cursor-pointer",
          saving ? "opacity-60" : "opacity-100"
        )}
      >
        {saving ? "saving..." : "let's go"}
      </button>
    </div>
  );
};

export default ProfileSetupScreen;
