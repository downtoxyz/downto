"use client";

import { useState, useEffect, useRef } from "react";
import { font, color } from "@/lib/styles";
import { useModalTransition } from "@/shared/hooks/useModalTransition";
import type { Event, Person } from "@/lib/ui-types";

const EventLobby = ({
  event,
  open,
  onClose,
  onStartSquad,
  onJoinSquadPool,
  squadPoolMembers,
  inSquadPool,
  isDemoMode,
  onViewProfile,
  existingSquadId,
  onGoToSquad,
  onRequestToJoin,
  pendingRequestSquadIds,
  socialDataLoaded,
}: {
  event: Event | null;
  open: boolean;
  onClose: () => void;
  onStartSquad: (event: Event, selectedUserIds: string[]) => void;
  onJoinSquadPool: (event: Event) => void;
  squadPoolMembers: Person[];
  inSquadPool: boolean;
  isDemoMode: boolean;
  onViewProfile?: (userId: string) => void;
  existingSquadId?: string;
  onGoToSquad?: (squadId: string) => void;
  onRequestToJoin?: (squadId: string, squadName: string) => void;
  pendingRequestSquadIds?: Set<string>;
  socialDataLoaded?: boolean;
}) => {
  const [selectingMembers, setSelectingMembers] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const touchStartY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const { visible, entering, closing, close } = useModalTransition(open, onClose);

  // Reset selection state when drawer opens/closes
  useEffect(() => {
    if (!open) {
      setSelectingMembers(false);
      setSelectedIds(new Set());
    }
  }, [open]);

  // Lock body scroll when open
  useEffect(() => {
    if (!visible) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [visible]);

  const finishSwipe = () => {
    if (dragOffset > 60) {
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

  if (!visible || !event) return null;
  const friends = event.peopleDown.filter((p) => p.mutual);
  const others = event.peopleDown.filter((p) => !p.mutual);
  const friendSquadmates = existingSquadId ? friends.filter((p) => p.inSquadId === existingSquadId) : [];
  const friendNonSquadmates = existingSquadId ? friends.filter((p) => p.inSquadId !== existingSquadId) : friends;
  const otherSquadmates = existingSquadId ? others.filter((p) => p.inSquadId === existingSquadId) : [];
  const otherNonSquadmates = existingSquadId ? others.filter((p) => p.inSquadId !== existingSquadId) : others;
  const poolCount = event.poolCount ?? squadPoolMembers.length + (inSquadPool ? 1 : 0);
  const maxSquadPick = 4; // max 4 others + you = 5 total
  const isSelecting = selectingMembers;
  // Wait for squad enrichment before rendering people list to avoid list→facepile flash
  const peopleReady = !!socialDataLoaded;

  const toggleSelect = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else if (next.size < maxSquadPick) {
        next.add(userId);
      }
      return next;
    });
  };

  const SquadFacepile = ({ members, isFriend }: { members: Person[]; isFriend: boolean }) => {
    if (members.length === 0) return null;
    const maxShow = 5;
    const shown = members.slice(0, maxShow);
    const overflow = members.length - maxShow;
    return (
      <div
        onClick={() => existingSquadId && onGoToSquad?.(existingSquadId)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 0",
          borderBottom: `1px solid ${isFriend ? "#222" : color.surface}`,
          cursor: existingSquadId ? "pointer" : "default",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {shown.map((p, i) => (
              <div
                key={p.userId ?? p.name}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: isFriend ? color.accent : color.borderLight,
                  color: isFriend ? "#000" : color.dim,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: font.mono,
                  fontSize: 14,
                  fontWeight: 700,
                  flexShrink: 0,
                  marginLeft: i === 0 ? 0 : -8,
                  border: `2px solid ${color.surface}`,
                  position: "relative",
                  zIndex: maxShow - i,
                }}
              >
                {p.avatar}
              </div>
            ))}
            {overflow > 0 && (
              <span style={{
                fontFamily: font.mono,
                fontSize: 8,
                fontWeight: 700,
                color: color.dim,
                marginLeft: 4,
              }}>
                +{overflow}
              </span>
            )}
          </div>
          <span style={{
            fontFamily: font.mono,
            fontSize: 11,
            color: color.faint,
          }}>
            Your squad
          </span>
        </div>
      </div>
    );
  };

  const PersonRow = ({ p, isFriend, selectable }: { p: Person; isFriend: boolean; selectable: boolean }) => {
    const hasSquad = !!p.inSquadId;
    const inSameSquad = !!(existingSquadId && p.inSquadId === existingSquadId);
    const alreadyRequested = hasSquad && pendingRequestSquadIds?.has(p.inSquadId!);
    const canRequest = hasSquad && !inSameSquad && !alreadyRequested && !!onRequestToJoin;
    // In selection mode, persons already in a squad are unselectable
    const effectiveSelectable = selectable && !hasSquad;

    return (
      <div
        key={p.name}
        onClick={() => {
          if (effectiveSelectable && p.userId) toggleSelect(p.userId);
          else if (!isSelecting && canRequest && p.inSquadId && p.inSquadName) onRequestToJoin!(p.inSquadId, p.inSquadName);
          else if (!isSelecting && p.userId && onViewProfile) onViewProfile(p.userId);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 0",
          borderBottom: `1px solid ${isFriend ? "#222" : color.surface}`,
          cursor: effectiveSelectable || (!isSelecting && (canRequest || p.userId)) ? "pointer" : "default",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: isFriend ? color.accent : color.borderLight,
              color: isFriend ? "#000" : color.dim,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: font.mono,
              fontSize: 14,
              fontWeight: 700,
              flexShrink: 0,
              ...(p.inPool ? { boxShadow: `0 0 0 2px ${color.pool}` } : {}),
            }}
          >
            {p.avatar}
          </div>
          <span style={{ fontFamily: font.mono, fontSize: 13, color: isFriend ? color.text : color.muted }}>
            {p.name}
          </span>
          {hasSquad && (
            <span style={{
              fontFamily: font.mono,
              fontSize: 9,
              color: color.faint,
              border: `1px solid ${color.faint}`,
              borderRadius: 6,
              padding: "1px 6px",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}>
              in squad
            </span>
          )}
        </div>
        {/* Request to join indicator */}
        {!isSelecting && hasSquad && !inSameSquad && (
          <span style={{
            fontFamily: font.mono,
            fontSize: 9,
            color: color.accent,
            opacity: alreadyRequested ? 0.6 : 1,
            whiteSpace: "nowrap",
            flexShrink: 0,
            marginLeft: 8,
          }}>
            {alreadyRequested ? "Requested" : "Request to join →"}
          </span>
        )}
        {selectingMembers && effectiveSelectable && p.userId && (
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              border: `2px solid ${selectedIds.has(p.userId) ? color.accent : color.borderMid}`,
              background: selectedIds.has(p.userId) ? color.accent : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s ease",
              flexShrink: 0,
            }}
          >
            {selectedIds.has(p.userId) && (
              <span style={{ color: "#000", fontSize: 14, fontWeight: 700 }}>&#10003;</span>
            )}
          </div>
        )}
      </div>
    );
  };

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
        onClick={close}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          WebkitBackdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          opacity: (entering || closing) ? 0 : 1,
          transition: "opacity 0.3s ease, backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease",
        }}
      />
      <div
        ref={scrollRef}
        onTouchStart={handleScrollTouchStart}
        onTouchMove={handleScrollTouchMove}
        onTouchEnd={handleScrollTouchEnd}
        style={{
          position: "relative",
          background: color.surface,
          borderRadius: "24px 24px 0 0",
          width: "100%",
          maxWidth: 420,
          padding: "32px 24px 40px",
          maxHeight: "70vh",
          overflowY: isDragging.current ? "hidden" : "auto",
          overscrollBehavior: "contain",
          animation: closing ? undefined : "slideUp 0.3s ease-out",
          transform: closing ? "translateY(100%)" : `translateY(${dragOffset}px)`,
          transition: isDragging.current ? "none" : "transform 0.25s ease-out",
        }}
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
        <h3
          style={{
            fontFamily: font.serif,
            fontSize: 22,
            color: color.text,
            marginBottom: 4,
            fontWeight: 400,
          }}
        >
          Who&rsquo;s down?
        </h3>
        <p
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            color: color.dim,
            marginBottom: poolCount > 0 ? 12 : 24,
          }}
        >
          {event.title}
        </p>

        {poolCount > 0 && (
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              color: color.pool,
              background: "rgba(0,212,255,0.08)",
              borderRadius: 10,
              padding: "8px 12px",
              marginBottom: 20,
            }}
          >
            {poolCount} looking for a squad
          </div>
        )}

        {/* Loading shimmer while waiting for squad enrichment */}
        {!peopleReady && (friends.length > 0 || others.length > 0) && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 0",
          }}>
            {[...Array(Math.min(friends.length + others.length, 5))].map((_, i) => (
              <div key={i} style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: color.borderLight,
                opacity: 0.4,
                marginLeft: i === 0 ? 0 : -10,
                border: `2px solid ${color.surface}`,
                flexShrink: 0,
              }} />
            ))}
            <div style={{
              width: 60, height: 8, borderRadius: 4,
              background: color.borderLight, opacity: 0.3, marginLeft: 4,
            }} />
          </div>
        )}

        {peopleReady && (
          <div style={{ animation: "fadeIn 0.2s ease" }}>
            {/* Friends section */}
            {friends.length > 0 && (
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
                  Friends ({friends.length})
                </div>
                {!isSelecting && <SquadFacepile members={friendSquadmates} isFriend />}
                {(isSelecting ? friends : friendNonSquadmates).map((p) => (
                  <PersonRow key={p.name} p={p} isFriend selectable={selectingMembers} />
                ))}
              </>
            )}

            {/* Others section */}
            {others.length > 0 && (
              <>
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    color: color.dim,
                    marginTop: 20,
                    marginBottom: 12,
                  }}
                >
                  Also down ({others.length})
                </div>
                {!isSelecting && <SquadFacepile members={otherSquadmates} isFriend={false} />}
                {(isSelecting ? others : otherNonSquadmates).map((p) => (
                  <PersonRow key={p.name} p={p} isFriend={false} selectable={selectingMembers} />
                ))}
              </>
            )}
          </div>
        )}

        {/* CTAs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
          {/* Start a squad / Go to squad — visible when anyone is down */}
          {(friends.length > 0 || others.length > 0) && peopleReady && !isSelecting && (
            existingSquadId ? (
              <button
                onClick={() => { onGoToSquad?.(existingSquadId); close(); }}
                style={{
                  width: "100%",
                  background: color.accent,
                  color: "#000",
                  border: "none",
                  borderRadius: 12,
                  padding: "14px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Go to Squad →
              </button>
            ) : (
              <button
                onClick={() => { setSelectingMembers(true); setSelectedIds(new Set()); }}
                style={{
                  width: "100%",
                  background: color.accent,
                  color: "#000",
                  border: "none",
                  borderRadius: 12,
                  padding: "14px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Start a Squad →
              </button>
            )
          )}

          {/* Confirm selection (shared by both friend and pool selection modes) */}
          {isSelecting && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { setSelectingMembers(false); setSelectedIds(new Set()); }}
                style={{
                  flex: 1,
                  background: "transparent",
                  color: color.dim,
                  border: `1px solid ${color.borderMid}`,
                  borderRadius: 12,
                  padding: "14px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (selectedIds.size > 0) {
                    onStartSquad(event, Array.from(selectedIds));
                    setSelectingMembers(false);
                    setSelectedIds(new Set());
                  }
                }}
                disabled={selectedIds.size === 0}
                style={{
                  flex: 2,
                  background: selectedIds.size > 0 ? color.accent : color.borderMid,
                  color: selectedIds.size > 0 ? "#000" : color.dim,
                  border: "none",
                  borderRadius: 12,
                  padding: "14px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: selectedIds.size > 0 ? "pointer" : "default",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  whiteSpace: "nowrap",
                }}
              >
                Create Squad ({selectedIds.size}) →
              </button>
            </div>
          )}

          {/* Looking for a squad toggle — always visible when not selecting */}
          {!isSelecting && !isDemoMode && (
            <button
              onClick={() => onJoinSquadPool(event)}
              style={{
                width: "100%",
                background: inSquadPool ? color.card : "transparent",
                color: inSquadPool ? color.accent : color.text,
                border: `1px solid ${inSquadPool ? color.accent : color.borderMid}`,
                borderRadius: 12,
                padding: "14px",
                fontFamily: font.mono,
                fontSize: 12,
                fontWeight: inSquadPool ? 700 : 400,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              {inSquadPool
                ? "Leave squad pool"
                : `I'm looking for a squad${squadPoolMembers.length > 0 ? ` · ${squadPoolMembers.length} looking` : ""}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default EventLobby;
