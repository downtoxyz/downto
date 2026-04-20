"use client";

import { useState, useEffect } from "react";
import EventCard from "@/features/events/components/EventCard";
import CheckCard from "@/features/checks/components/CheckCard";
import { FeedContext } from "@/features/checks/context/FeedContext";
import type { FeedContextValue } from "@/features/checks/context/FeedContext";
import type { Event, InterestCheck, Friend } from "@/lib/ui-types";
import type { Profile } from "@/lib/types";
import { themes } from "@/lib/themes";
import type { ThemeName } from "@/lib/themes";
import { applyTheme } from "@/app/components/ThemeHydrator";
import cn from "@/lib/tailwindMerge";

const THEME_STORAGE_KEY = "downto-theme";
const THEME_NAMES = Object.keys(themes) as ThemeName[];

const MOCK_USER_ID = "mock-user";
const MOCK_PROFILE: Profile = {
  id: MOCK_USER_ID,
  display_name: "kat",
  avatar_letter: "K",
  username: "kat",
} as Profile;

const MOCK_PEOPLE = [
  { name: "Sara", avatar: "S", mutual: true, userId: "u1" },
  { name: "Devon", avatar: "D", mutual: true, userId: "u2" },
  { name: "Nic", avatar: "N", mutual: false, userId: "u3" },
  { name: "Gian", avatar: "G", mutual: true, userId: "u4" },
];

const FLYER_IMAGE = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80";
const POSTER_IMAGE = "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80";

// Stable fake UUIDs so DB queries return empty instead of throwing.
const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

const mockEvent = (id: string, overrides: Partial<Event> = {}): Event => ({
  id,
  createdBy: "u1",
  title: "viet heritage night @yankees (free hat giveaway)",
  venue: "Yankee Stadium",
  date: "Thu, Aug 27",
  time: "7pm",
  vibe: [],
  image: "",
  igHandle: "vcs.nyc",
  saved: false,
  isDown: false,
  peopleDown: MOCK_PEOPLE.slice(0, 3),
  isPublic: false,
  visibility: "friends",
  posterName: "martinckong24",
  posterAvatar: "M",
  ...overrides,
});

const mockCheck = (id: string, overrides: Partial<InterestCheck> = {}): InterestCheck => ({
  id,
  text: "ramen in bushwick this weekend?",
  author: "sara",
  authorId: "u1",
  timeAgo: "2h",
  expiresIn: "6h",
  expiryPercent: 40,
  responses: [
    { name: "Devon", avatar: "D", status: "down" as const },
    { name: "Nic", avatar: "N", status: "down" as const },
  ],
  isYours: false,
  ...overrides,
});

const noopFeedCtx: FeedContextValue = {
  checks: [],
  myCheckResponses: {},
  hiddenCheckIds: new Set(),
  pendingDownCheckIds: new Set(),
  newlyAddedCheckId: null,
  leftChecks: [],
  events: [],
  newlyAddedEventId: null,
  respondToCheck: () => {},
  clearResponse: () => {},
  acceptCoAuthorTag: async () => {},
  declineCoAuthorTag: async () => {},
  hideCheck: () => {},
  unhideCheck: () => {},
  redownFromLeft: () => {},
  toggleDown: async () => {},
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div
        className="font-mono text-tiny uppercase text-faint mb-2"
        style={{ letterSpacing: "0.15em" }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

export default function ThemePreview() {
  const [activeTheme, setActiveTheme] = useState<ThemeName | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeName | null;
    if (stored && stored in themes) setActiveTheme(stored);
    else setActiveTheme("dragonfruit");
  }, []);

  const sharedCheckProps = {
    userId: MOCK_USER_ID,
    profile: MOCK_PROFILE,
    friends: [] as Friend[],
    initialCommentCount: 0,
    startSquadFromCheck: async () => {},
    onNavigateToGroups: () => {},
    showToast: () => {},
    loadRealData: async () => {},
  };

  const sharedEventProps = {
    userId: MOCK_USER_ID,
    onToggleDown: () => {},
    onOpenSocial: () => {},
  };

  return (
    <FeedContext.Provider value={noopFeedCtx}>
      <div className="min-h-screen bg-bg p-4 pb-20 overflow-y-auto" style={{ height: "100vh" }}>
        <div className="max-w-[480px] mx-auto">
          <h1 className="font-serif text-2xl text-primary mb-1">theme preview</h1>
          <p className="font-mono text-xs text-dim mb-4">
            Every card variant rendered at once so you can see how token changes ripple.
          </p>

          {/* Theme switcher */}
          <div className="mb-6 bg-card rounded-2xl p-3 border border-border">
            <div
              className="font-mono text-tiny uppercase text-faint mb-2"
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
                      "rounded-xl py-1.5 px-3 font-mono text-xs cursor-pointer transition-all",
                      isActive
                        ? "bg-dt text-on-accent font-bold border border-transparent"
                        : "bg-transparent text-muted border border-border-mid"
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          <Section title="Event cards — no image">
            <EventCard
              {...sharedEventProps}
              event={mockEvent(uuid(1), {
                title: "Mietze Conte, CFCF dj set",
                venue: "Elsewhere",
                date: "Fri, May 1",
                time: "6pm",
                posterName: "nic",
                posterAvatar: "N",
              })}
            />
            <EventCard
              {...sharedEventProps}
              event={mockEvent(uuid(2), {
                title: "late night ramen run",
                venue: "Ippudo",
                date: "Sat, May 2",
                time: "11pm",
                isDown: true,
                peopleDown: MOCK_PEOPLE,
                posterName: "gian",
                posterAvatar: "G",
              })}
            />
          </Section>

          <Section title="Event cards — with image (wash)">
            <EventCard
              {...sharedEventProps}
              event={mockEvent(uuid(3), {
                image: FLYER_IMAGE,
                title: "Teksupport: FOUR TET",
                venue: "Brooklyn Storehouse",
                date: "Thu, Sep 17",
                time: "10:00 PM",
                posterName: "aidanfox",
                posterAvatar: "A",
              })}
            />
            <EventCard
              {...sharedEventProps}
              event={mockEvent(uuid(4), {
                image: POSTER_IMAGE,
                title: "pole hang & kbbq",
                venue: "sarah f's in LIC",
                date: "Sat, May 30",
                time: "7pm",
                isDown: true,
                peopleDown: MOCK_PEOPLE,
                posterName: "sarah f",
                posterAvatar: "S",
              })}
            />
            <EventCard
              {...sharedEventProps}
              event={mockEvent(uuid(5), {
                image: FLYER_IMAGE,
                title: "new event card (glow)",
                posterName: "ninja",
                posterAvatar: "N",
              })}
              isNew
            />
          </Section>

          <Section title="Interest checks — regular, mine, via friend, others-down">
            <CheckCard
              {...sharedCheckProps}
              check={mockCheck(uuid(11))}
            />
            <CheckCard
              {...sharedCheckProps}
              check={mockCheck(uuid(12), {
                text: "watch @krn shave my head and someone else bleaches/dyes it in the near future",
                author: "kat",
                authorId: MOCK_USER_ID,
                isYours: true,
                eventDate: "2026-04-20",
                eventDateLabel: "Mon, Apr 20",
                eventTime: "7:20pm",
                location: "kat apt 591 willoughby ave apt 2",
                responses: MOCK_PEOPLE.map(p => ({ name: p.name, avatar: p.avatar, status: "down" as const })),
              })}
            />
            <CheckCard
              {...sharedCheckProps}
              check={mockCheck(uuid(13), {
                text: "anyone down for a coffee walk tomorrow morning?",
                author: "devon",
                authorId: "u2",
                viaFriendName: "sara",
              })}
            />
            <CheckCard
              {...sharedCheckProps}
              check={mockCheck(uuid(14), {
                text: "late-night diner run anyone?",
                author: "nic",
                authorId: "u3",
                responses: MOCK_PEOPLE.slice(0, 3).map(p => ({ name: p.name, avatar: p.avatar, status: "down" as const })),
              })}
            />
          </Section>

          <Section title="Buttons & controls">
            <div className="flex flex-wrap gap-2 items-center">
              <button className="rounded-full py-1.5 px-3 font-mono text-tiny font-bold bg-dt text-on-accent">
                DOWN ✓
              </button>
              <button className="rounded-full py-1.5 px-3 font-mono text-tiny font-bold bg-[var(--color-down-idle-bg)] text-dt border border-[var(--color-down-idle-border)]">
                DOWN ?
              </button>
              <button className="rounded-xl py-2 px-3.5 font-mono text-xs bg-transparent text-muted border border-border-mid">
                secondary
              </button>
              <button className="rounded-lg py-2 px-3 font-mono text-xs bg-[#ff4444] text-white">
                destructive
              </button>
              <span className="px-2 py-0.5 rounded-full bg-dt/15 text-dt font-mono text-tiny">
                accent tag
              </span>
              <span className="px-2 py-0.5 rounded-full bg-surface text-muted border border-border font-mono text-tiny">
                neutral tag
              </span>
            </div>
          </Section>

          <Section title="Color tokens (swatches)">
            <div className="grid grid-cols-2 gap-2 font-mono text-tiny">
              {[
                ["bg", "--color-bg"],
                ["card", "--color-card"],
                ["surface", "--color-surface"],
                ["deep", "--color-deep"],
                ["primary", "--color-primary"],
                ["muted", "--color-muted"],
                ["dim", "--color-dim"],
                ["faint", "--color-faint"],
                ["border", "--color-border"],
                ["border-light", "--color-border-light"],
                ["border-mid", "--color-border-mid"],
                ["accent (dt)", "--color-dt"],
              ].map(([label, cssVar]) => (
                <div key={cssVar} className="flex items-center gap-2 border border-border rounded-md p-1.5">
                  <div
                    className="w-6 h-6 rounded-sm border border-border-mid shrink-0"
                    style={{ background: `var(${cssVar})` }}
                  />
                  <span className="text-dim">{label}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </FeedContext.Provider>
  );
}
