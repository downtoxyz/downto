"use client";

import { useState, useEffect, useRef } from "react";
import cn from "@/lib/tailwindMerge";
import type { Friend } from "@/lib/ui-types";

export default function OnboardingFriendsPopup({
  suggestions,
  checkAuthorId,
  onAddFriend,
  onCancelRequest,
  onSearchUsers,
  onDone,
}: {
  suggestions: Friend[];
  checkAuthorId: string | null;
  onAddFriend: (id: string) => void;
  onCancelRequest?: (id: string) => void;
  onSearchUsers?: (query: string) => Promise<Friend[]>;
  onDone: () => void;
}) {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!onSearchUsers || search.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await onSearchUsers(search);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      }
      setSearching(false);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, onSearchUsers]);

  const available = suggestions.filter((s) => s.status === "none" || s.status === "pending");
  const hasAdded = suggestions.some((s) => s.status === "pending") || searchResults.some((s) => s.status === "pending");
  const checkAuthor = checkAuthorId ? suggestions.find((s) => s.id === checkAuthorId) : null;
  const others = available.filter((s) => s.id !== checkAuthorId);
  const isSearching = search.length >= 2;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-5">
      <div className="bg-deep border border-border rounded-2xl px-5 py-6 max-w-[360px] w-full max-h-[70vh] overflow-y-auto">
        <h2 className="font-serif text-2xl text-primary font-normal mb-1 text-center">
          add friends
        </h2>
        <p className="font-mono text-xs text-dim text-center mb-5">
          add at least one to get started
        </p>

        {/* Search input */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or username..."
          className="w-full bg-card border border-border-mid rounded-lg py-2.5 px-3 text-primary font-mono text-xs outline-none mb-4 box-border"
        />

        {/* Search results */}
        {isSearching && (
          <>
            {searching && (
              <p className="font-mono text-xs text-faint text-center py-2">
                searching...
              </p>
            )}
            {!searching && searchResults.length === 0 && search.length >= 2 && (
              <p className="font-mono text-xs text-faint text-center py-2">
                no results
              </p>
            )}
            {searchResults.filter((r) => r.id !== checkAuthorId).map((f) => (
              <div
                key={f.id}
                className="flex items-center py-2.5 border-b border-border"
              >
                <div className="w-9 h-9 rounded-full bg-border-light text-dim flex items-center justify-center font-mono text-sm font-bold mr-3">
                  {f.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm text-primary">{f.name}</div>
                  <div className="font-mono text-xs text-dim">@{f.username}</div>
                </div>
                <button
                  onClick={() => f.status === "pending" ? onCancelRequest?.(f.id) : f.status === "none" ? onAddFriend(f.id) : undefined}
                  disabled={f.status === "friend"}
                  className={cn(
                    "rounded-lg px-3.5 py-2 font-mono text-xs font-bold shrink-0",
                    f.status === "none"
                      ? "bg-dt text-black border-none"
                      : "bg-transparent text-dim border border-border-mid",
                    f.status === "friend" ? "cursor-default" : "cursor-pointer"
                  )}
                >
                  {f.status === "pending" ? "Requested" : f.status === "friend" ? "Friends" : "Add"}
                </button>
              </div>
            ))}
          </>
        )}

        {!isSearching && (
          <>
        {/* Check author -- highlighted */}
        {checkAuthor && checkAuthor.status !== "pending" && (
          <div className="mb-4">
            <div
              className="rounded-xl p-3.5 flex items-center gap-3"
              style={{
                background: "rgba(232,255,90,0.08)",
                border: "1px solid rgba(232,255,90,0.2)",
              }}
            >
              <div className="w-11 h-11 rounded-full bg-dt text-black flex items-center justify-center font-mono text-lg font-bold shrink-0">
                {checkAuthor.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm text-dt font-bold">
                  {checkAuthor.name}
                </div>
                <div className="font-mono text-tiny text-dim mt-0.5">
                  sent you this check — tap Add to connect
                </div>
              </div>
              <button
                onClick={() => onAddFriend(checkAuthor.id)}
                className="bg-dt text-black border-none rounded-lg px-3.5 py-2 font-mono text-xs font-bold cursor-pointer shrink-0"
              >
                Add
              </button>
            </div>
          </div>
        )}
        {/* Check author -- already added */}
        {checkAuthor && checkAuthor.status === "pending" && (
          <div
            className="rounded-xl p-3.5 flex items-center gap-3 mb-4"
            style={{
              background: "rgba(232,255,90,0.05)",
              border: "1px solid rgba(232,255,90,0.1)",
            }}
          >
            <div className="w-11 h-11 rounded-full bg-border-light text-dim flex items-center justify-center font-mono text-lg font-bold shrink-0">
              {checkAuthor.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-sm text-primary">
                {checkAuthor.name}
              </div>
              <div className="font-mono text-tiny text-dim mt-0.5">
                request sent!
              </div>
            </div>
            <button
              onClick={() => onCancelRequest?.(checkAuthor.id)}
              className="font-mono text-xs text-dim bg-transparent border border-border-mid rounded-lg px-3.5 py-2 cursor-pointer"
            >
              Requested
            </button>
          </div>
        )}

        {/* Other suggestions */}
        {others.length > 0 && (
          <>
            {checkAuthor && (
              <div className="font-mono text-tiny uppercase tracking-[0.15em] text-dim mb-2.5">
                People you may know
              </div>
            )}
            {others.slice(0, 6).map((f) => (
              <div
                key={f.id}
                className="flex items-center py-2.5 border-b border-border"
              >
                <div className="w-9 h-9 rounded-full bg-border-light text-dim flex items-center justify-center font-mono text-sm font-bold mr-3">
                  {f.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm text-primary">{f.name}</div>
                  <div className="font-mono text-xs text-dim">@{f.username}</div>
                </div>
                <button
                  onClick={() => f.status === "pending" ? onCancelRequest?.(f.id) : onAddFriend(f.id)}
                  className={cn(
                    "rounded-lg px-3.5 py-2 font-mono text-xs font-bold cursor-pointer shrink-0",
                    f.status === "pending"
                      ? "bg-transparent text-dim border border-border-mid"
                      : "bg-dt text-black border-none"
                  )}
                >
                  {f.status === "pending" ? "Requested" : "Add"}
                </button>
              </div>
            ))}
          </>
        )}
          </>
        )}

        {/* Continue button */}
        <button
          onClick={onDone}
          disabled={!hasAdded}
          className={cn(
            "w-full mt-5 border-none rounded-xl p-3.5 font-mono text-xs font-bold uppercase tracking-[0.08em]",
            hasAdded
              ? "bg-dt text-black cursor-pointer"
              : "bg-border-mid text-dim cursor-default"
          )}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
