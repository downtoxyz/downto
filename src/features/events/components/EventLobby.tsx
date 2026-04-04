"use client";

import { useState, useEffect, useRef } from "react";
import cn from "@/lib/tailwindMerge";
import { color } from "@/lib/styles";
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
        className={cn(
          "flex items-center justify-between py-2.5",
          existingSquadId ? "cursor-pointer" : "cursor-default"
        )}
        style={{ borderBottom: `1px solid ${isFriend ? "#222" : color.surface}` }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center">
            {shown.map((p, i) => (
              <div
                key={p.userId ?? p.name}
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center font-mono text-sm font-bold shrink-0 relative",
                  isFriend ? "bg-dt text-black" : "bg-border-light text-dim"
                )}
                style={{
                  marginLeft: i === 0 ? 0 : -8,
                  border: `2px solid ${color.surface}`,
                  zIndex: maxShow - i,
                }}
              >
                {p.avatar}
              </div>
            ))}
            {overflow > 0 && (
              <span className="font-mono text-[8px] font-bold text-dim ml-1">
                +{overflow}
              </span>
            )}
          </div>
          <span className="font-mono text-xs text-faint">
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
        className={cn(
          "flex items-center justify-between py-2.5",
          (effectiveSelectable || (!isSelecting && (canRequest || p.userId))) ? "cursor-pointer" : "cursor-default"
        )}
        style={{ borderBottom: `1px solid ${isFriend ? "#222" : color.surface}` }}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center font-mono text-sm font-bold shrink-0",
              isFriend ? "bg-dt text-black" : "bg-border-light text-dim"
            )}
            style={p.inPool ? { boxShadow: `0 0 0 2px ${color.pool}` } : undefined}
          >
            {p.avatar}
          </div>
          <span className={cn(
            "font-mono text-sm",
            isFriend ? "text-primary" : "text-muted"
          )}>
            {p.name}
          </span>
          {hasSquad && (
            <span className="font-mono text-[9px] text-faint border border-faint rounded-md shrink-0 whitespace-nowrap"
              style={{ padding: "1px 6px" }}
            >
              in squad
            </span>
          )}
        </div>
        {/* Request to join indicator */}
        {!isSelecting && hasSquad && !inSameSquad && (
          <span className={cn(
            "font-mono text-[9px] text-dt whitespace-nowrap shrink-0 ml-2",
            alreadyRequested && "opacity-60"
          )}>
            {alreadyRequested ? "Requested" : "Request to join →"}
          </span>
        )}
        {selectingMembers && effectiveSelectable && p.userId && (
          <div
            className={cn(
              "w-[22px] h-[22px] rounded-md flex items-center justify-center transition-all duration-150 ease-in-out shrink-0",
              selectedIds.has(p.userId)
                ? "border-2 border-dt bg-dt"
                : "border-2 border-border-mid bg-transparent"
            )}
          >
            {selectedIds.has(p.userId) && (
              <span className="text-black text-sm font-bold">&#10003;</span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div
        onClick={close}
        className="absolute inset-0 transition-[opacity,backdrop-filter,-webkit-backdrop-filter] duration-300 ease-in-out"
        style={{
          background: "rgba(0,0,0,0.7)",
          backdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          WebkitBackdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          opacity: (entering || closing) ? 0 : 1,
        }}
      />
      <div
        ref={scrollRef}
        onTouchStart={handleScrollTouchStart}
        onTouchMove={handleScrollTouchMove}
        onTouchEnd={handleScrollTouchEnd}
        className="relative bg-surface rounded-t-3xl w-full max-w-[420px] max-h-[70vh] overscroll-contain"
        style={{
          padding: "32px 24px 40px",
          overflowY: isDragging.current ? "hidden" : "auto",
          animation: closing ? undefined : "slideUp 0.3s ease-out",
          transform: closing ? "translateY(100%)" : `translateY(${dragOffset}px)`,
          transition: isDragging.current ? "none" : "transform 0.25s ease-out",
        }}
      >
        <div className="w-10 h-1 bg-faint rounded-sm mx-auto mb-6" />
        <h3 className="font-serif text-2xl text-primary mb-1 font-normal">
          Who&rsquo;s down?
        </h3>
        <div className={cn("flex items-center gap-2", poolCount > 0 ? "mb-3" : "mb-6")}>
          <p className="font-mono text-xs text-dim m-0">
            {event.title}
          </p>
          <span
            className="font-mono text-[9px] font-bold rounded shrink-0 uppercase"
            style={{
              padding: "2px 6px",
              letterSpacing: "0.08em",
              background: event.isPublic ? "rgba(255,255,255,0.08)" : "rgba(232,255,90,0.15)",
              color: event.isPublic ? color.dim : color.accent,
            }}
          >
            {event.isPublic ? "public" : "friends & FoF"}
          </span>
        </div>

        {poolCount > 0 && (
          <div
            className="font-mono text-xs text-pool rounded-lg mb-5"
            style={{
              background: "rgba(0,212,255,0.08)",
              padding: "8px 12px",
            }}
          >
            {poolCount} looking for a squad
          </div>
        )}

        {/* Loading shimmer while waiting for squad enrichment */}
        {!peopleReady && (friends.length > 0 || others.length > 0) && (
          <div className="flex items-center gap-2.5 py-4">
            {[...Array(Math.min(friends.length + others.length, 5))].map((_, i) => (
              <div key={i}
                className="w-9 h-9 rounded-full bg-border-light opacity-40 shrink-0"
                style={{
                  marginLeft: i === 0 ? 0 : -10,
                  border: `2px solid ${color.surface}`,
                }}
              />
            ))}
            <div className="w-[60px] h-2 rounded bg-border-light opacity-30 ml-1" />
          </div>
        )}

        {peopleReady && (
          <div className="animate-fade-in">
            {/* Friends section */}
            {friends.length > 0 && (
              <>
                <div className="font-mono text-tiny uppercase text-dt mb-3"
                  style={{ letterSpacing: "0.15em" }}
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
                <div className="font-mono text-tiny uppercase text-dim mt-5 mb-3"
                  style={{ letterSpacing: "0.15em" }}
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
        <div className="flex flex-col gap-2.5 mt-6">
          {/* Start a squad / Go to squad — visible when anyone is down */}
          {(friends.length > 0 || others.length > 0) && peopleReady && !isSelecting && (
            existingSquadId ? (
              <button
                onClick={() => { onGoToSquad?.(existingSquadId); close(); }}
                className="w-full bg-dt text-black border-none rounded-xl p-3.5 font-mono text-xs font-bold cursor-pointer uppercase"
                style={{ letterSpacing: "0.1em" }}
              >
                Go to Squad →
              </button>
            ) : (
              <button
                onClick={() => { setSelectingMembers(true); setSelectedIds(new Set()); }}
                className="w-full bg-dt text-black border-none rounded-xl p-3.5 font-mono text-xs font-bold cursor-pointer uppercase"
                style={{ letterSpacing: "0.1em" }}
              >
                Start a Squad →
              </button>
            )
          )}

          {/* Confirm selection (shared by both friend and pool selection modes) */}
          {isSelecting && (
            <div className="flex gap-2">
              <button
                onClick={() => { setSelectingMembers(false); setSelectedIds(new Set()); }}
                className="flex-1 bg-transparent text-dim border border-border-mid rounded-xl p-3.5 font-mono text-xs cursor-pointer uppercase"
                style={{ letterSpacing: "0.1em" }}
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
                className={cn(
                  "flex-[2] border-none rounded-xl p-3.5 font-mono text-xs font-bold uppercase whitespace-nowrap",
                  selectedIds.size > 0
                    ? "bg-dt text-black cursor-pointer"
                    : "bg-border-mid text-dim cursor-default"
                )}
                style={{ letterSpacing: "0.1em" }}
              >
                Create Squad ({selectedIds.size}) →
              </button>
            </div>
          )}

          {/* Looking for a squad toggle — always visible when not selecting */}
          {!isSelecting && (
            <button
              onClick={() => onJoinSquadPool(event)}
              className={cn(
                "w-full rounded-xl p-3.5 font-mono text-xs cursor-pointer uppercase",
                inSquadPool
                  ? "bg-card text-dt border border-dt font-bold"
                  : "bg-transparent text-primary border border-border-mid font-normal"
              )}
              style={{ letterSpacing: "0.1em" }}
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
