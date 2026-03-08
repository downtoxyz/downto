# downto

Save events from Instagram to your calendar, see who else is going, form small squads.

## What it does

- Paste an IG link (or Letterboxd, or enter manually) to save an event
- Mark yourself as "down" — see which friends are too
- Post interest checks ("who's down for Thai tonight?") with configurable expiry and squad size
- Friends respond down or maybe — start a squad chat from the responses
- Real-time messaging with logistics coordination (meeting spot, arrival time, transport)
- Push notifications so you don't miss when plans are forming

## Stack

- **Next.js** (App Router) + **TypeScript**
- **Supabase** — auth (OTP), Postgres, RLS, Realtime, DB triggers
- **Web Push** — VAPID-based push notifications via service worker
- **Vercel** — deployment
- No CSS framework — inline styles, Space Mono + Instrument Serif fonts, dark theme with #E8FF5A accent

## Architecture

```
                         ┌─────────────────────────────────┐
                         │           Supabase              │
                         │  ┌───────────┐  ┌────────────┐  │
                         │  │ Postgres  │  │  Realtime  │  │
                         │  │ + RLS     │  │  (pub/sub) │  │
                         │  │ + Triggers│  └────────────┘  │
                         │  └───────────┘                  │
                         └──────▲──────────────────▲───────┘
                                │                  │
              Supabase JS SDK   │                  │  Admin client
              (direct, RLS)     │                  │  (bypasses RLS)
                                │                  │
┌───────────────────────────────┴───┐    ┌─────────┴───────────┐
│            Browser (PWA)          │    │  Next.js API Routes │
│                                   │    │  (Vercel serverless)│
│  Feed · Calendar · Squads · You   │───▶│                     │
│                                   │    │  /api/scrape        │
│  Realtime subscriptions for live  │    │  /api/push/*        │
│  updates on checks, messages,     │    │  /api/squads/*      │
│  friendships, notifications       │    │  /api/search-*      │
└───────────────────────────────────┘    └─────────────────────┘
         fetch() only when server
         secrets or CORS bypass needed
```

Most data flows directly from the browser to Supabase via the JS SDK, protected by Row Level Security. The API routes are serverless functions used only when server secrets or CORS bypass are needed (scraping, push notifications, admin operations).

## Running locally

```bash
npm install
cp .env.local.example .env.local  # fill in Supabase + VAPID keys
npx supabase db push              # apply migrations
npm run dev
```

## Project structure

```
src/
  app/
    page.tsx          # main app (single-file SPA)
    api/
      scrape/         # IG + Letterboxd link scraping
      push/           # push notification endpoints
  lib/
    db.ts             # Supabase queries
    types.ts          # DB + frontend types
    supabase.ts       # Supabase client
supabase/
  migrations/         # 21 migrations with RLS policies
```

## Issues

Bugs and feature requests are tracked in [GitHub Issues](https://github.com/xylene-p/downto/issues).
