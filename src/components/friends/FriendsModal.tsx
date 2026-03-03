"use client";

import { useState, useEffect, useRef } from "react";
import { font, color } from "@/lib/styles";
import type { Friend } from "@/lib/ui-types";
import { logError } from "@/lib/logger";

const FriendsModal = ({
  open,
  onClose,
  friends,
  suggestions,
  onAddFriend,
  onAcceptRequest,
  onRemoveFriend,
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
  onSearchUsers?: (query: string) => Promise<Friend[]>;
  initialTab?: "friends" | "add";
  onViewProfile?: (userId: string) => void;
  preventClose?: boolean;
}) => {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"friends" | "add">(initialTab ?? "friends");
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const touchStartY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [closing, setClosing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

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
      setClosing(true);
      setTimeout(() => { setClosing(false); setDragOffset(0); onClose(); }, 250);
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

  const hasAddedFriend = friends.length > 0 || suggestions.some((s) => s.status === "pending" || s.status === "incoming");

  const incomingRequests = suggestions.filter((s) => s.status === "incoming");
  const filteredFriends = friends.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.username.toLowerCase().includes(search.toLowerCase())
  );
  const filteredSuggestions = suggestions.filter(
    (s) =>
      s.status !== "incoming" &&
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

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={preventClose ? undefined : onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />
      <div
        style={{
          position: "relative",
          background: color.surface,
          borderRadius: "24px 24px 0 0",
          width: "100%",
          maxWidth: 420,
          padding: "32px 24px 0",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          animation: closing ? undefined : "slideUp 0.3s ease-out",
          transform: closing ? "translateY(100%)" : `translateY(${dragOffset}px)`,
          transition: closing ? "transform 0.25s ease-in" : (dragOffset === 0 ? "transform 0.2s ease-out" : "none"),
        }}
      >
        <div
          onTouchStart={handleSwipeStart}
          onTouchMove={handleSwipeMove}
          onTouchEnd={finishSwipe}
          style={{ touchAction: "none" }}
        >
          <div
            style={{
              width: 40,
              height: 4,
              background: color.faint,
              borderRadius: 2,
              margin: "0 auto 24px",
            }}
          />
        </div>

        {preventClose && (
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 13,
              color: color.text,
              textAlign: "center",
              marginBottom: 16,
            }}
          >
            add at least one friend to get started
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button
            onClick={() => setTab("friends")}
            style={{
              flex: 1,
              background: tab === "friends" ? color.accent : "transparent",
              color: tab === "friends" ? "#000" : color.dim,
              border: tab === "friends" ? "none" : `1px solid ${color.borderMid}`,
              borderRadius: 10,
              padding: "10px",
              fontFamily: font.mono,
              fontSize: 11,
              fontWeight: tab === "friends" ? 700 : 400,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Friends ({friends.length})
          </button>
          <button
            onClick={() => setTab("add")}
            style={{
              flex: 1,
              background: tab === "add" ? color.accent : "transparent",
              color: tab === "add" ? "#000" : color.dim,
              border: tab === "add" ? "none" : `1px solid ${color.borderMid}`,
              borderRadius: 10,
              padding: "10px",
              fontFamily: font.mono,
              fontSize: 11,
              fontWeight: tab === "add" ? 700 : 400,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              position: "relative",
            }}
          >
            Add
            {incomingRequests.length > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#ff6b6b",
                }}
              />
            )}
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === "add" ? "Search users by name or @username..." : "Filter friends..."}
          style={{
            width: "100%",
            background: color.deep,
            border: `1px solid ${color.borderMid}`,
            borderRadius: 12,
            padding: "12px 16px",
            color: color.text,
            fontFamily: font.mono,
            fontSize: 13,
            outline: "none",
            marginBottom: 20,
          }}
        />

        <div
          ref={scrollRef}
          onTouchStart={handleScrollTouchStart}
          onTouchMove={handleScrollTouchMove}
          onTouchEnd={handleScrollTouchEnd}
          style={{
            overflowY: "auto",
            flex: 1,
            paddingBottom: 40,
          }}
        >
        {tab === "friends" ? (
          <>
            {filteredFriends.length === 0 ? (
              <p
                style={{
                  textAlign: "center",
                  color: color.faint,
                  fontFamily: font.mono,
                  fontSize: 12,
                  padding: "40px 0",
                }}
              >
                {search ? "No friends found" : "No friends yet"}
              </p>
            ) : (
              filteredFriends.map((f) => (
                <div
                  key={f.id}
                  onClick={() => onViewProfile ? onViewProfile(f.id) : setSelectedFriend(f)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "12px 0",
                    borderBottom: `1px solid ${color.border}`,
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: color.accent,
                      color: "#000",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: font.mono,
                      fontSize: 16,
                      fontWeight: 700,
                      marginRight: 12,
                    }}
                  >
                    {f.avatar}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontFamily: font.mono,
                        fontSize: 13,
                        color: color.text,
                      }}
                    >
                      {f.name}
                    </div>
                    <div
                      style={{
                        fontFamily: font.mono,
                        fontSize: 11,
                        color: color.dim,
                      }}
                    >
                      @{f.username}
                    </div>
                  </div>
                  {f.availability && (
                    <span
                      style={{
                        fontSize: 12,
                        opacity: 0.8,
                      }}
                    >
                      {f.availability === "open" && "✨"}
                      {f.availability === "awkward" && "👀"}
                      {f.availability === "not-available" && "🌙"}
                    </span>
                  )}
                  <span style={{ color: color.faint, fontSize: 16, marginLeft: 8 }}>›</span>
                </div>
              ))
            )}
          </>
        ) : (
          <>
            {/* Incoming requests */}
            {incomingRequests.length > 0 && (
              <>
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    color: color.accent,
                    marginBottom: 12,
                  }}
                >
                  Friend Requests ({incomingRequests.length})
                </div>
                {incomingRequests.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "12px 0",
                      borderBottom: `1px solid ${color.border}`,
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        background: color.borderLight,
                        color: color.dim,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: font.mono,
                        fontSize: 16,
                        fontWeight: 700,
                        marginRight: 12,
                      }}
                    >
                      {f.avatar}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontFamily: font.mono,
                          fontSize: 13,
                          color: color.text,
                        }}
                      >
                        {f.name}
                      </div>
                      <div
                        style={{
                          fontFamily: font.mono,
                          fontSize: 11,
                          color: color.dim,
                        }}
                      >
                        @{f.username}
                      </div>
                    </div>
                    <button
                      onClick={() => onAcceptRequest(f.id)}
                      style={{
                        background: color.accent,
                        color: "#000",
                        border: "none",
                        borderRadius: 8,
                        padding: "8px 14px",
                        fontFamily: font.mono,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Accept
                    </button>
                  </div>
                ))}
                <div style={{ height: 20 }} />
              </>
            )}

            {/* Search Results or Suggestions */}
            {search.length >= 2 ? (
              <>
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    color: color.dim,
                    marginBottom: 12,
                  }}
                >
                  {searching ? "Searching..." : `Results (${searchResults.length})`}
                </div>
                {searching ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "32px 0",
                      color: color.faint,
                      fontFamily: font.mono,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ animation: "pulse 1.5s ease-in-out infinite" }}>
                      Searching users...
                    </span>
                  </div>
                ) : searchResults.length === 0 ? (
                  <p
                    style={{
                      textAlign: "center",
                      color: color.faint,
                      fontFamily: font.mono,
                      fontSize: 12,
                      padding: "32px 0",
                    }}
                  >
                    No users found
                  </p>
                ) : (
                  searchResults.map((f) => (
                    <div
                      key={f.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "12px 0",
                        borderBottom: `1px solid ${color.border}`,
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          background: f.status === "friend" ? color.accent : color.borderLight,
                          color: f.status === "friend" ? "#000" : color.dim,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontFamily: font.mono,
                          fontSize: 16,
                          fontWeight: 700,
                          marginRight: 12,
                        }}
                      >
                        {f.avatar}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontFamily: font.mono,
                            fontSize: 13,
                            color: color.text,
                          }}
                        >
                          {f.name}
                        </div>
                        <div
                          style={{
                            fontFamily: font.mono,
                            fontSize: 11,
                            color: color.dim,
                          }}
                        >
                          @{f.username}
                        </div>
                      </div>
                      {f.status === "friend" ? (
                        <span
                          style={{
                            fontFamily: font.mono,
                            fontSize: 11,
                            color: color.dim,
                            padding: "8px 14px",
                          }}
                        >
                          Friends
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            if (f.status !== "none") return;
                            onAddFriend(f.id);
                            setSearchResults((prev) =>
                              prev.map((r) => r.id === f.id ? { ...r, status: "pending" as const } : r)
                            );
                          }}
                          disabled={f.status === "pending"}
                          style={{
                            background: f.status === "pending" ? "transparent" : color.accent,
                            color: f.status === "pending" ? color.dim : "#000",
                            border: f.status === "pending" ? `1px solid ${color.borderMid}` : "none",
                            borderRadius: 8,
                            padding: "8px 14px",
                            fontFamily: font.mono,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: f.status === "pending" ? "default" : "pointer",
                          }}
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
                  style={{
                    fontFamily: font.mono,
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    color: color.dim,
                    marginBottom: 12,
                  }}
                >
                  Suggestions
                </div>
                {filteredSuggestions.length === 0 ? (
                  <p
                    style={{
                      textAlign: "center",
                      color: color.faint,
                      fontFamily: font.mono,
                      fontSize: 12,
                      padding: "32px 0",
                    }}
                  >
                    Search for friends by name or username
                  </p>
                ) : (
                  filteredSuggestions.map((f) => (
                    <div
                      key={f.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "12px 0",
                        borderBottom: `1px solid ${color.border}`,
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          background: color.borderLight,
                          color: color.dim,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontFamily: font.mono,
                          fontSize: 16,
                          fontWeight: 700,
                          marginRight: 12,
                        }}
                      >
                        {f.avatar}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontFamily: font.mono,
                            fontSize: 13,
                            color: color.text,
                          }}
                        >
                          {f.name}
                        </div>
                        <div
                          style={{
                            fontFamily: font.mono,
                            fontSize: 11,
                            color: color.dim,
                          }}
                        >
                          @{f.username}
                        </div>
                      </div>
                      <button
                        onClick={() => f.status === "none" && onAddFriend(f.id)}
                        disabled={f.status === "pending"}
                        style={{
                          background: f.status === "pending" ? "transparent" : color.accent,
                          color: f.status === "pending" ? color.dim : "#000",
                          border: f.status === "pending" ? `1px solid ${color.borderMid}` : "none",
                          borderRadius: 8,
                          padding: "8px 14px",
                          fontFamily: font.mono,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: f.status === "pending" ? "default" : "pointer",
                        }}
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
          <div style={{ padding: "12px 0 24px", flexShrink: 0 }}>
            <button
              onClick={onClose}
              style={{
                width: "100%",
                background: color.accent,
                color: "#000",
                border: "none",
                borderRadius: 12,
                padding: "14px",
                fontFamily: font.mono,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: "0.02em",
              }}
            >
              Continue →
            </button>
          </div>
        )}
      </div>

      {/* Friend Profile Detail */}
      {selectedFriend && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: color.surface,
            borderRadius: "24px 24px 0 0",
            padding: "32px 24px 40px",
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            animation: "slideUp 0.2s ease-out",
          }}
        >
          <button
            onClick={() => setSelectedFriend(null)}
            style={{
              alignSelf: "flex-start",
              background: "transparent",
              border: "none",
              color: color.dim,
              fontFamily: font.mono,
              fontSize: 13,
              cursor: "pointer",
              padding: "0 0 20px",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            ‹ Back
          </button>

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
              marginBottom: 16,
            }}
          >
            {selectedFriend.avatar}
          </div>

          <div
            style={{
              fontFamily: font.serif,
              fontSize: 22,
              color: color.text,
              marginBottom: 4,
            }}
          >
            {selectedFriend.name}
          </div>

          <div
            style={{
              fontFamily: font.mono,
              fontSize: 13,
              color: color.dim,
              marginBottom: 8,
            }}
          >
            @{selectedFriend.username}
          </div>

          {selectedFriend.availability && (
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                color: color.faint,
                marginBottom: 32,
              }}
            >
              {selectedFriend.availability === "open" && "✨ open to friends!"}
              {selectedFriend.availability === "awkward" && "👀 awkward timing"}
              {selectedFriend.availability === "not-available" && "🌙 not available"}
            </div>
          )}

          {onRemoveFriend && (
            <button
              onClick={() => {
                onRemoveFriend(selectedFriend.id);
                setSelectedFriend(null);
              }}
              style={{
                marginTop: "auto",
                background: "transparent",
                border: `1px solid rgba(255,107,107,0.3)`,
                borderRadius: 10,
                padding: "12px 24px",
                fontFamily: font.mono,
                fontSize: 12,
                color: "#ff6b6b",
                cursor: "pointer",
                textTransform: "uppercase",
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
