'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useToast } from '@/app/providers/ToastProvider';
import cn from '@/lib/tailwindMerge';
import AvatarLetter from '@/shared/components/AvatarLetter';
import {
  sendMessage,
  leaveSquad,
  markSquadNotificationsRead,
  getSquadMessages,
  subscribeToMessages,
} from '../services/squad-actions';
import type { Squad, SquadMessage } from '../types';
import { formatDistanceToNow } from 'date-fns';

export default function SquadChat({
  squad: initialSquad,
  onClose,
  onLeave,
}: {
  squad: Squad;
  onClose: () => void;
  onLeave: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [messages, setMessages] = useState<SquadMessage[]>(
    initialSquad.messages
  );
  const [newMsg, setNewMsg] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(-1);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [chatHeight, setChatHeight] = useState('100dvh');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Mark notifications read on open
  useEffect(() => {
    markSquadNotificationsRead(initialSquad.id);
  }, [initialSquad.id]);

  // iOS keyboard handling
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setChatHeight(`${vv.height}px`);
      window.scrollTo(0, 0);
      setTimeout(
        () =>
          messagesEndRef.current?.scrollIntoView({ behavior: 'instant' }),
        50
      );
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [messages.length]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Fetch fresh messages on open
  useEffect(() => {
    let stale = false;
    getSquadMessages(initialSquad.id).then((raw) => {
      if (stale) return;
      const msgs: SquadMessage[] = raw.map((msg: any) => ({
        sender: msg.is_system
          ? 'system'
          : msg.sender_id === user.id
            ? 'You'
            : msg.sender?.display_name ?? 'Unknown',
        text: msg.text,
        time: formatDistanceToNow(new Date(msg.created_at), {
          addSuffix: false,
        }),
        isYou: msg.sender_id === user.id,
        ...(msg.message_type === 'date_confirm'
          ? { messageType: 'date_confirm' as const, messageId: msg.id }
          : {}),
        ...(msg.message_type === 'poll'
          ? { messageType: 'poll' as const, messageId: msg.id }
          : {}),
      }));
      setMessages(msgs);
    });
    return () => {
      stale = true;
    };
  }, [initialSquad.id, user.id]);

  // Realtime subscription
  useEffect(() => {
    const channel = subscribeToMessages(initialSquad.id, (newMessage: any) => {
      if (newMessage.sender_id === user.id) return;
      const isSystem =
        newMessage.is_system || newMessage.sender_id === null;
      const senderName = isSystem
        ? 'system'
        : newMessage.sender?.display_name ?? 'Unknown';
      setMessages((prev) => [
        ...prev,
        {
          sender: senderName,
          text: newMessage.text,
          time: 'now',
          isYou: false,
        },
      ]);
    });
    return () => {
      channel.unsubscribe();
    };
  }, [initialSquad.id, user.id]);

  // Get non-"You" squad members for @mention matching
  const otherMembers = initialSquad.members.filter((m) => m.name !== 'You');

  const handleSend = async () => {
    if (!newMsg.trim()) return;
    const text = newMsg.trim();

    // Extract @mentioned user IDs
    const mentionedNames = [...text.matchAll(/@(\S+)/g)].map((m) => m[1].toLowerCase());
    const mentionedIds = otherMembers
      .filter((m) => mentionedNames.some((n) =>
        m.name.toLowerCase() === n || m.name.split(' ')[0].toLowerCase() === n
      ))
      .map((m) => m.userId);

    // Optimistic add
    setMessages((prev) => [
      ...prev,
      { sender: 'You', text, time: 'now', isYou: true },
    ]);
    setNewMsg('');
    setMentionQuery(null);
    setMentionIdx(-1);
    if (inputRef.current) inputRef.current.style.height = 'auto';

    await sendMessage(initialSquad.id, text, mentionedIds).catch(() => {
      showToast('Failed to send message');
    });
  };

  const handleLeave = async () => {
    await leaveSquad(initialSquad.id);
    showToast('Left squad');
    onLeave();
  };

  // Swipe-to-close
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const [dragX, setDragX] = useState(0);
  const [closing, setClosing] = useState(false);
  const isDragging = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
    if (!isDragging.current && dx > 20 && dx > dy * 2.5) {
      isDragging.current = true;
    }
    if (isDragging.current && dx > 0) setDragX(dx);
  };
  const handleTouchEnd = () => {
    if (dragX > 120) {
      setClosing(true);
      setTimeout(() => {
        onClose();
      }, 250);
    } else {
      setDragX(0);
    }
    isDragging.current = false;
  };

  return (
    <>
      {/* Backdrop */}
      {(dragX > 0 || closing) && (
        <div className="fixed inset-0 z-[59] bg-neutral-950" />
      )}

      <div
        className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-neutral-950"
        style={{
          height: chatHeight,
          transform: closing
            ? 'translateX(100%)'
            : `translateX(${dragX}px)`,
          transition: closing
            ? 'transform 0.25s ease-in'
            : dragX === 0
              ? 'transform 0.3s ease-out'
              : 'none',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-neutral-900 px-5 pb-3 pt-3">
          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              className="mr-2 shrink-0 text-lg text-dt"
            >
              &lsaquo;
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="line-clamp-2 font-serif text-lg font-normal text-white">
                {initialSquad.name}
              </h2>
              {initialSquad.eventTitle && (
                <p className="truncate text-[0.625rem] text-neutral-600">
                  {initialSquad.eventTitle}
                  {initialSquad.eventDate
                    ? ` \u2014 ${initialSquad.eventDate}`
                    : ''}
                </p>
              )}
            </div>
            <div className="ml-3 flex shrink-0">
              {initialSquad.members.slice(0, 4).map((m, idx) => (
                <AvatarLetter
                  key={m.userId}
                  avatarLetter={m.avatar}
                  size="inline"
                  highlight={m.name === 'You'}
                  className={cn(
                    'border-neutral-950 border-2 border-solid',
                    { '-ml-1.5': idx > 0 }
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {messages.map((msg, idx) => {
            if (msg.sender === 'system') {
              return (
                <div
                  key={idx}
                  className="my-2 text-center text-[0.625rem] text-neutral-600 italic"
                >
                  {msg.text}
                </div>
              );
            }
            return (
              <div
                key={idx}
                className={cn('mb-3 flex flex-col', {
                  'items-end': msg.isYou,
                  'items-start': !msg.isYou,
                })}
              >
                {!msg.isYou && (
                  <span className="mb-0.5 text-[0.625rem] text-neutral-600">
                    {msg.sender}
                  </span>
                )}
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[0.8125rem]',
                    {
                      'bg-dt text-black': msg.isYou,
                      'bg-neutral-900 text-white': !msg.isYou,
                    }
                  )}
                >
                  {msg.text.split(/(@\S+)/g).map((part, pi) =>
                    part.startsWith('@') ? (
                      <span key={pi} className={cn('font-bold', {
                        'text-black': msg.isYou,
                        'text-dt': !msg.isYou,
                      })}>{part}</span>
                    ) : part
                  )}
                </div>
                <span className="mt-0.5 text-[0.5rem] text-neutral-700">
                  {msg.time}
                </span>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* @mention autocomplete */}
        {mentionQuery !== null && (() => {
          const filtered = otherMembers.filter((m) =>
            m.name.toLowerCase().includes(mentionQuery)
          );
          if (filtered.length === 0) return null;
          return (
            <div className="shrink-0 border-t border-neutral-900 bg-neutral-950 px-4 py-1">
              <div className="max-h-32 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950">
                {filtered.slice(0, 6).map((m) => (
                  <button
                    key={m.userId}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const before = newMsg.slice(0, mentionIdx);
                      const after = newMsg.slice(mentionIdx + 1 + (mentionQuery?.length ?? 0));
                      setNewMsg(before + '@' + m.name + ' ' + after);
                      setMentionQuery(null);
                      setMentionIdx(-1);
                      inputRef.current?.focus();
                    }}
                    className="flex w-full items-center gap-2 border-b border-neutral-900 px-3 py-2 text-left"
                  >
                    <AvatarLetter
                      avatarLetter={m.avatar}
                      size="inline"
                      highlight={false}
                    />
                    <span className="text-xs text-white">{m.name}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Input */}
        <div className="shrink-0 border-t border-neutral-900 px-4 py-3">
          <div className="flex items-end gap-2">
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="shrink-0 pb-1 text-[0.625rem] text-neutral-600"
            >
              leave
            </button>
            <textarea
              ref={inputRef}
              value={newMsg}
              onChange={(e) => {
                const val = e.target.value;
                setNewMsg(val);
                // Auto-resize
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
                // Detect @mention
                const cursor = e.target.selectionStart ?? val.length;
                const before = val.slice(0, cursor);
                const atMatch = before.match(/@([^\s@]*)$/);
                if (atMatch) {
                  setMentionQuery(atMatch[1].toLowerCase());
                  setMentionIdx(before.length - atMatch[0].length);
                } else {
                  setMentionQuery(null);
                  setMentionIdx(-1);
                }
              }}
              onKeyDown={(e) => {
                if (mentionQuery !== null && e.key === 'Escape') {
                  setMentionQuery(null);
                  setMentionIdx(-1);
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Message..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-neutral-800 bg-transparent px-3 py-2 text-[0.8125rem] text-white placeholder:text-neutral-600 focus:border-dt focus:outline-none"
            />
            <button
              onClick={handleSend}
              disabled={!newMsg.trim()}
              className={cn(
                'shrink-0 rounded-xl px-4 py-2 text-xs font-bold uppercase',
                {
                  'bg-dt text-black': !!newMsg.trim(),
                  'bg-neutral-800 text-neutral-600': !newMsg.trim(),
                }
              )}
            >
              Send
            </button>
          </div>
        </div>

        {/* Leave confirmation */}
        {showLeaveConfirm && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70">
            <div className="mx-4 max-w-[300px] rounded-2xl border border-neutral-900 bg-neutral-950 p-6">
              <h3 className="mb-2 font-serif text-lg text-white">
                Leave squad?
              </h3>
              <p className="mb-4 text-[0.6875rem] text-neutral-600">
                You&apos;ll stop receiving messages from this squad.
              </p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="flex-1 rounded-xl border border-neutral-800 px-4 py-3 text-xs font-bold uppercase text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLeave}
                  className="flex-1 rounded-xl bg-[#ff4444] px-4 py-3 text-xs font-bold uppercase text-white"
                >
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
