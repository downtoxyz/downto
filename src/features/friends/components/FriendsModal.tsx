"use client";

import { useState, useEffect, useRef } from "react";
import cn from "@/lib/tailwindMerge";
import type { Friend } from "@/lib/ui-types";
import * as db from "@/lib/db";
import { logError } from "@/lib/logger";
import { useModalTransition } from "@/shared/hooks/useModalTransition";

const FriendsModal = ({
  open,
  onClose,
  friends,
  suggestions,
  onAddFriend,
  onAcceptRequest,
  onRemoveFriend,
  onCancelRequest,
  onSearchUsers,
  initialTab,
  onViewProfile,
  preventClose,
}: {
  open: boolean;
  onClose: () => void;
  friends: Friend[];
  suggestions: Friend[];
  onAddFriend: (id: string) => void;
  onAcceptRequest: (id: string) => void;
  onRemoveFriend?: (id: string) => void;
  onCancelRequest?: (id: string) => void;
  onSearchUsers?: (query: string) => Promise<Friend[]>;
  initialTab?: "friends" | "add";
  onViewProfile?: (userId: string) => void;
  preventClose?: boolean;
}) => {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"friends" | "add">(initialTab ?? "friends");
  useEffect(() => {
    if (open && initialTab) setTab(initialTab);
  }, [initialTab, open]);
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [requestedState, setRequestedState] = useState<"preview" | "expanded" | "collapsed">("preview");
  const touchStartY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const { visible, entering, closing, close } = useModalTransition(open, onClose);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Lock body scroll when open
  useEffect(() => {
    if (!visible) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [visible]);

  const handleSwipeStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  };
  const handleSwipeMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) { isDragging.current = true; setDragOffset(dy); }
  };
  const finishSwipe = () => {
    if (dragOffset > 60 && !preventClose) {
      setDragOffset(0);
      close();
    } else {
      setDragOffset(0);
    }
    isDragging.current = false;
  };
  const handleScrollTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  };
  const handleScrollTouchMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - touchStartY.current;
    const atTop = scrollRef.current ? scrollRef.current.scrollTop <= 0 : true;
    if (atTop && dy > 0) { isDragging.current = true; e.preventDefault(); setDragOffset(dy); }
  };
  const handleScrollTouchEnd = () => { if (isDragging.current) finishSwipe(); };

  const hasAddedFriend = friends.length > 0 || suggestions.some((s) => s.status === "pending" || s.status === "incoming") || searchResults.some((s) => s.status === "pending");

  const incomingRequests = suggestions.filter((s) => s.status === "incoming");
  const outgoingRequests = suggestions.filter((s) => s.status === "pending");
  const filteredFriends = friends.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.username.toLowerCase().includes(search.toLowerCase())
  );
  const filteredOutgoing = outgoingRequests.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.username.toLowerCase().includes(search.toLowerCase())
  );
  const filteredSuggestions = suggestions.filter(
    (s) =>
      s.status !== "incoming" &&
      s.status !== "pending" &&
      (s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.username.toLowerCase().includes(search.toLowerCase()))
  );

  // Debounced user search for "Add" tab
  useEffect(() => {
    if (tab !== "add" || !onSearchUsers || search.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await onSearchUsers(search);
        setSearchResults(results);
      } catch (err) {
        logError("searchUsers", err, { query: search });
        setSearchResults([]);
      }
      setSearching(false);
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search, tab, onSearchUsers]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSearch("");
      setSearchResults([]);
      setSearching(false);
      setSelectedFriend(null);
    }
  }, [open]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-end justify-center">
      <div
        onClick={preventClose ? undefined : close}
        className={cn(
          "absolute inset-0 transition-all duration-300 ease-in-out",
          (entering || closing) ? "opacity-0" : "opacity-100"
        )}
        style={{
          background: "rgba(0,0,0,0.7)",
          backdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          WebkitBackdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
        }}
      />
      <div
        className={cn(
          "relative bg-surface w-full max-w-[420px] flex flex-col",
          !closing && "animate-slide-up"
        )}
        style={{
          borderRadius: "24px 24px 0 0",
          padding: "32px 24px 0",
          maxHeight: "85vh",
          transform: closing ? "translateY(100%)" : `translateY(${dragOffset}px)`,
          transition: closing ? "transform 0.2s ease-in" : (dragOffset === 0 ? "transform 0.2s ease-out" : "none"),
        }}
      >
        <div
          onTouchStart={handleSwipeStart}
          onTouchMove={handleSwipeMove}
          onTouchEnd={finishSwipe}
          className="touch-none"
        >
          <div className="w-10 h-1 bg-faint rounded-sm mx-auto mb-6" />
        </div>

        {preventClose && (
          <div className="font-mono text-sm text-primary text-center mb-4">
            add at least one friend to get started
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setTab("friends")}
            className={cn(
              "flex-1 rounded-lg p-2.5 font-mono text-xs cursor-pointer uppercase",
              tab === "friends"
                ? "bg-dt text-on-accent font-bold border-none"
                : "bg-transparent text-dim border border-border-mid font-normal"
            )}
            style={{ letterSpacing: "0.08em" }}
          >
            Friends ({friends.length})
          </button>
          <button
            onClick={() => setTab("add")}
            className={cn(
              "flex-1 rounded-lg p-2.5 font-mono text-xs cursor-pointer uppercase relative",
              tab === "add"
                ? "bg-dt text-on-accent font-bold border-none"
                : "bg-transparent text-dim border border-border-mid font-normal"
            )}
            style={{ letterSpacing: "0.08em" }}
          >
            Add
            {incomingRequests.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger" />
            )}
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === "add" ? "Search users by name or @username..." : "Filter friends..."}
          className="w-full bg-deep border border-border-mid rounded-xl py-3 px-4 text-primary font-mono text-sm outline-none mb-5"
        />

        <div
          ref={scrollRef}
          onTouchStart={handleScrollTouchStart}
          onTouchMove={handleScrollTouchMove}
          onTouchEnd={handleScrollTouchEnd}
          className="overflow-y-auto overflow-x-hidden flex-1 pb-10"
        >
        {tab === "friends" ? (
          <>
            {filteredFriends.length === 0 ? (
              <p className="text-center text-faint font-mono text-xs py-10">
                {search ? "No friends found" : "No friends yet"}
              </p>
            ) : (
              filteredFriends.map((f) => (
                <div
                  key={f.id}
                  onClick={() => onViewProfile ? onViewProfile(f.id) : setSelectedFriend(f)}
                  className="flex items-center py-3 border-b border-border cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-dt text-on-accent flex items-center justify-center font-mono text-base font-bold mr-3">
                    {f.avatar}
                  </div>
                  <div className="flex-1">
                    <div className="font-mono text-sm text-primary">
                      {f.name}
                    </div>
                    <div className="font-mono text-xs text-dim">
                      @{f.username}
                    </div>
                  </div>
                  {f.availability && (
                    <span className="text-xs opacity-80">
                      {f.availability === "open" && "\u2728"}
                      {f.availability === "awkward" && "\uD83D\uDC40"}
                      {f.availability === "not-available" && "\uD83C\uDF19"}
                    </span>
                  )}
                  <span className="text-faint text-base ml-2">&rsaquo;</span>
                </div>
              ))
            )}
          </>
        ) : (
          <>
            {/* Invite link */}
            <button
              onClick={async () => {
                try {
                  const token = await db.createFriendLink();
                  const url = `${window.location.origin}/friend?token=${token}`;
                  if (navigator.share) {
                    await navigator.share({ title: "Add me on down to", url });
                  } else {
                    await navigator.clipboard.writeText(url);
                    // TODO: show toast
                  }
                } catch { /* cancelled or error */ }
              }}
              className="w-full py-3 bg-transparent border border-dashed border-border-mid rounded-xl text-dt font-mono text-xs font-bold cursor-pointer uppercase mb-4"
              style={{ letterSpacing: "0.08em" }}
            >
              Share invite link
            </button>

            {/* Incoming requests */}
            {incomingRequests.length > 0 && (
              <>
                <div
                  className="font-mono text-tiny uppercase text-dt mb-3"
                  style={{ letterSpacing: "0.15em" }}
                >
                  Friend Requests ({incomingRequests.length})
                </div>
                {incomingRequests.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center py-3 border-b border-border"
                  >
                    <div className="w-10 h-10 rounded-full bg-border-light text-dim flex items-center justify-center font-mono text-base font-bold mr-3">
                      {f.avatar}
                    </div>
                    <div className="flex-1">
                      <div className="font-mono text-sm text-primary">
                        {f.name}
                      </div>
                      <div className="font-mono text-xs text-dim">
                        @{f.username}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      {onRemoveFriend && (
                        <button
                          onClick={() => onRemoveFriend(f.id)}
                          className="bg-transparent text-dim border border-border-mid rounded-lg py-2 px-3 font-mono text-xs font-bold cursor-pointer"
                        >
                          Decline
                        </button>
                      )}
                      <button
                        onClick={() => onAcceptRequest(f.id)}
                        className="bg-dt text-on-accent border-none rounded-lg py-2 px-3.5 font-mono text-xs font-bold cursor-pointer"
                      >
                        Accept
                      </button>
                    </div>
                  </div>
                ))}
                <div className="h-5" />
              </>
            )}

            {/* Requested (outgoing pending) */}
            {filteredOutgoing.length > 0 && (
              <div className="mb-5">
                <div
                  onClick={() => setRequestedState((s) => s === "collapsed" ? "preview" : "collapsed")}
                  className={cn(
                    "flex items-center justify-between cursor-pointer",
                    requestedState !== "collapsed" ? "pb-2" : "pb-0"
                  )}
                >
                  <div
                    className="font-mono text-tiny uppercase text-dim"
                    style={{ letterSpacing: "0.15em" }}
                  >
                    Requested ({filteredOutgoing.length})
                  </div>
                  <span
                    className="font-mono text-xs text-faint transition-transform duration-200"
                    style={{
                      transform: requestedState === "collapsed" ? "rotate(0deg)" : "rotate(90deg)",
                    }}
                  >
                    &rsaquo;
                  </span>
                </div>
                {requestedState !== "collapsed" && (
                  <>
                    {(requestedState === "preview" ? filteredOutgoing.slice(0, 3) : filteredOutgoing).map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center py-2.5 border-b border-border"
                      >
                        <div className="w-9 h-9 rounded-full bg-border-light text-dim flex items-center justify-center font-mono text-sm font-bold mr-3">
                          {f.avatar}
                        </div>
                        <div className="flex-1">
                          <div className="font-mono text-sm text-primary">
                            {f.name}
                          </div>
                          <div className="font-mono text-xs text-dim">
                            @{f.username}
                          </div>
                        </div>
                        <span
                          onClick={() => onCancelRequest?.(f.id)}
                          className={cn(
                            "font-mono text-tiny text-faint py-1 px-2 rounded-md border border-border",
                            onCancelRequest ? "cursor-pointer" : ""
                          )}
                        >
                          Pending
                        </span>
                      </div>
                    ))}
                    {requestedState === "preview" && filteredOutgoing.length > 3 && (
                      <div
                        onClick={() => setRequestedState("expanded")}
                        className="font-mono text-xs text-dim py-2.5 cursor-pointer text-center"
                      >
                        Show all ({filteredOutgoing.length})
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Search Results or Suggestions */}
            {search.length >= 2 ? (
              <>
                <div
                  className="font-mono text-tiny uppercase text-dim mb-3"
                  style={{ letterSpacing: "0.15em" }}
                >
                  {searching ? "Searching..." : `Results (${searchResults.length})`}
                </div>
                {searching ? (
                  <div className="text-center py-8 text-faint font-mono text-xs">
                    <span className="animate-pulse">
                      Searching users...
                    </span>
                  </div>
                ) : searchResults.length === 0 ? (
                  <p className="text-center text-faint font-mono text-xs py-8">
                    No users found
                  </p>
                ) : (
                  searchResults.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center py-3 border-b border-border"
                    >
                      <div
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center font-mono text-base font-bold mr-3",
                          f.status === "friend"
                            ? "bg-dt text-on-accent"
                            : "bg-border-light text-dim"
                        )}
                      >
                        {f.avatar}
                      </div>
                      <div className="flex-1">
                        <div className="font-mono text-sm text-primary">
                          {f.name}
                        </div>
                        <div className="font-mono text-xs text-dim">
                          @{f.username}
                        </div>
                      </div>
                      {f.status === "friend" ? (
                        <span className="font-mono text-xs text-dim py-2 px-3.5">
                          Friends
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            if (f.status === "pending") {
                              onCancelRequest?.(f.id);
                              setSearchResults((prev) =>
                                prev.map((r) => r.id === f.id ? { ...r, status: "none" as const } : r)
                              );
                              return;
                            }
                            if (f.status !== "none") return;
                            onAddFriend(f.id);
                            setSearchResults((prev) =>
                              prev.map((r) => r.id === f.id ? { ...r, status: "pending" as const } : r)
                            );
                          }}
                          className={cn(
                            "rounded-lg py-2 px-3.5 font-mono text-xs font-bold cursor-pointer",
                            f.status === "pending"
                              ? "bg-transparent text-dim border border-border-mid"
                              : "bg-dt text-on-accent border-none"
                          )}
                        >
                          {f.status === "pending" ? "Requested" : "Add"}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </>
            ) : (
              <>
                <div
                  className="font-mono text-tiny uppercase text-dim mb-3"
                  style={{ letterSpacing: "0.15em" }}
                >
                  Suggestions
                </div>
                {filteredSuggestions.length === 0 ? (
                  <p className="text-center text-faint font-mono text-xs py-8">
                    Search for friends by name or username
                  </p>
                ) : (
                  filteredSuggestions.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center py-3 border-b border-border"
                    >
                      <div className="w-10 h-10 rounded-full bg-border-light text-dim flex items-center justify-center font-mono text-base font-bold mr-3">
                        {f.avatar}
                      </div>
                      <div className="flex-1">
                        <div className="font-mono text-sm text-primary">
                          {f.name}
                        </div>
                        <div className="font-mono text-xs text-dim">
                          @{f.username}
                          {f.mutualFriendName && (
                            <span className="text-dt ml-1.5">via {f.mutualFriendName}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => f.status === "none" && onAddFriend(f.id)}
                        disabled={f.status === "pending"}
                        className={cn(
                          "rounded-lg py-2 px-3.5 font-mono text-xs font-bold",
                          f.status === "pending"
                            ? "bg-transparent text-dim border border-border-mid cursor-default"
                            : "bg-dt text-on-accent border-none cursor-pointer"
                        )}
                      >
                        {f.status === "pending" ? "Requested" : "Add"}
                      </button>
                    </div>
                  ))
                )}
              </>
            )}
          </>
        )}
        </div>

        {preventClose && hasAddedFriend && (
          <div className="py-3 pb-6 shrink-0">
            <button
              onClick={onClose}
              className="w-full bg-dt text-on-accent border-none rounded-xl py-3.5 font-mono text-sm font-bold cursor-pointer"
              style={{ letterSpacing: "0.02em" }}
            >
              Continue &rarr;
            </button>
          </div>
        )}
      </div>

      {/* Friend Profile Detail */}
      {selectedFriend && (
        <div
          className="absolute inset-0 bg-surface z-10 flex flex-col items-center animate-slide-up"
          style={{
            borderRadius: "24px 24px 0 0",
            padding: "32px 24px 40px",
          }}
        >
          <button
            onClick={() => setSelectedFriend(null)}
            className="self-start bg-transparent border-none text-dim font-mono text-sm cursor-pointer pb-5 px-0 flex items-center gap-1.5"
          >
            &lsaquo; Back
          </button>

          <div className="w-[72px] h-[72px] rounded-full bg-dt text-on-accent flex items-center justify-center font-mono text-[28px] font-bold mb-4">
            {selectedFriend.avatar}
          </div>

          <div className="font-serif text-2xl text-primary mb-1">
            {selectedFriend.name}
          </div>

          <div className="font-mono text-sm text-dim mb-2">
            @{selectedFriend.username}
          </div>

          {selectedFriend.availability && (
            <div className="font-mono text-xs text-faint mb-8">
              {selectedFriend.availability === "open" && "\u2728 open to friends!"}
              {selectedFriend.availability === "awkward" && "\uD83D\uDC40 awkward timing"}
              {selectedFriend.availability === "not-available" && "\uD83C\uDF19 not available"}
            </div>
          )}

          {onRemoveFriend && (
            <button
              onClick={() => {
                onRemoveFriend(selectedFriend.id);
                setSelectedFriend(null);
              }}
              className="mt-auto bg-transparent rounded-lg py-3 px-6 font-mono text-xs text-danger cursor-pointer uppercase"
              style={{
                border: "1px solid rgba(255,107,107,0.3)",
                letterSpacing: "0.08em",
              }}
            >
              Remove Friend
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default FriendsModal;
