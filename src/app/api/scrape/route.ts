import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { uploadEventImage } from "@/lib/supabase-admin";

/** Strip HTML tags and trim */
const strip = (s: string) => s.replace(/<[^>]*>/g, "").trim();

/** Normalize a parsed date string to "Wed, Mar 26" format */
function normalizeDate(raw: string, caption: string): string | null {
  const now = new Date();
  const lower = raw.toLowerCase().trim();

  // "tonight" / "tomorrow"
  if (lower === "tonight") {
    return now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  if (lower === "tomorrow") {
    const d = new Date(now); d.setDate(d.getDate() + 1);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  // Day name like "Saturday" — find next occurrence, also check for "the 28th" nearby
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayIdx = dayNames.indexOf(lower);
  if (dayIdx !== -1) {
    // Check if caption has "the Nth" or just a number near the day name
    const dayNumMatch = caption.match(new RegExp(raw + "[\\s,]*(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?", "i"));
    if (dayNumMatch) {
      const dayNum = parseInt(dayNumMatch[1]);
      // Try current month first, then next month
      for (let mOff = 0; mOff <= 1; mOff++) {
        const d = new Date(now.getFullYear(), now.getMonth() + mOff, dayNum);
        if (d.getDay() === dayIdx && d >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
          return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        }
      }
    }
    // No day number — find next occurrence of this weekday
    const d = new Date(now);
    while (d.getDay() !== dayIdx) d.setDate(d.getDate() + 1);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  // "this weekend" / "this saturday" etc.
  if (lower.startsWith("this ")) {
    const target = lower.replace("this ", "");
    if (target === "weekend") {
      const d = new Date(now);
      while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
      return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    }
    const tIdx = dayNames.indexOf(target);
    if (tIdx !== -1) {
      const d = new Date(now);
      while (d.getDay() !== tIdx) d.setDate(d.getDate() + 1);
      return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    }
  }

  // "Feb 14", "March 28" etc. — parse and format
  const monthDateMatch = raw.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})/i);
  if (monthDateMatch) {
    const parsed = new Date(`${monthDateMatch[1]} ${monthDateMatch[2]}, ${now.getFullYear()}`);
    if (!isNaN(parsed.getTime())) {
      if (parsed < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)) {
        parsed.setFullYear(parsed.getFullYear() + 1);
      }
      return parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    }
  }

  return null;
}

// Extract event details from Instagram caption using heuristics
function parseEventDetails(caption: string, authorName: string) {
  const lines = caption.split('\n').filter(l => l.trim());

  // Try to find title (usually first line or line with emoji/caps)
  let title = lines[0] || "Event";

  // Look for date patterns
  const datePatterns = [
    // "Feb 14", "February 14", "2/14"
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}/i,
    /\b\d{1,2}\/\d{1,2}/,
    // "Friday", "Saturday", etc.
    /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i,
    // "this weekend", "tonight", "tomorrow"
    /\b(tonight|tomorrow|this weekend|this saturday|this sunday|this friday)\b/i,
  ];

  let date = "TBD";
  for (const pattern of datePatterns) {
    const match = caption.match(pattern);
    if (match) {
      date = match[0];
      break;
    }
  }

  // Normalize date to "Wed, Mar 26" format
  if (date !== "TBD") {
    const normalized = normalizeDate(date, caption);
    if (normalized) date = normalized;
  }

  // Look for time patterns
  const timePatterns = [
    /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*[-–—to]+\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i,
    /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i,
    /\b\d{1,2}\s*[-–—]\s*\d{1,2}\s*(?:am|pm)\b/i,
  ];

  let time = "TBD";
  for (const pattern of timePatterns) {
    const match = caption.match(pattern);
    if (match) {
      time = match[0].toUpperCase();
      break;
    }
  }

  // Look for venue (often after "at" or "@" or contains common venue words)
  const venuePatterns = [
    /(?:at|@)\s+([A-Z][A-Za-z\s&']+?)(?:\n|$|\.|\!)/,
    /📍\s*([^\n]+)/,
    /(?:venue|location):\s*([^\n]+)/i,
  ];

  let venue = "TBD";
  for (const pattern of venuePatterns) {
    const match = caption.match(pattern);
    if (match) {
      venue = match[1].trim();
      break;
    }
  }

  // Extract vibes/tags from hashtags
  const hashtags = caption.match(/#(\w+)/g) || [];
  const vibes = hashtags
    .slice(0, 3)
    .map(h => h.replace('#', '').toLowerCase())
    .filter(h => h.length < 15);

  // If no vibes from hashtags, try to infer from content
  if (vibes.length === 0) {
    const vibeKeywords: Record<string, string> = {
      'dj': 'music',
      'dance': 'dancing',
      'techno': 'techno',
      'house': 'house',
      'art': 'art',
      'gallery': 'art',
      'comedy': 'comedy',
      'standup': 'comedy',
      'food': 'food',
      'brunch': 'brunch',
      'party': 'party',
      'rave': 'rave',
      'rooftop': 'rooftop',
      'outdoor': 'outdoor',
      'free': 'free',
    };

    const lowerCaption = caption.toLowerCase();
    for (const [keyword, vibe] of Object.entries(vibeKeywords)) {
      if (lowerCaption.includes(keyword) && !vibes.includes(vibe)) {
        vibes.push(vibe);
        if (vibes.length >= 3) break;
      }
    }
  }

  return {
    title: strip(title).slice(0, 100) || "Event",
    venue: strip(venue).slice(0, 100),
    date: strip(date).slice(0, 50),
    time: strip(time).slice(0, 50),
    vibe: vibes.length > 0 ? vibes.map(v => strip(v).slice(0, 30)) : ['event'],
    igHandle: `@${strip(authorName).slice(0, 30)}`,
  };
}

// Scrape Letterboxd movie page
async function scrapeLetterboxd(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    throw new Error("Could not fetch Letterboxd page");
  }

  const html = await response.text();

  // Extract Open Graph meta tags
  const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] || "";
  const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || "";
  const ogDescription = html.match(/<meta property="og:description" content="([^"]+)"/)?.[1] || "";

  // Extract year from title (usually "Movie Name (2024)")
  const yearMatch = ogTitle.match(/\((\d{4})\)/);
  const year = yearMatch ? yearMatch[1] : "";
  const movieTitle = ogTitle.replace(/\s*\(\d{4}\).*$/, "").trim();

  // Extract director if available
  const directorMatch = html.match(/Directed by <a[^>]*>([^<]+)<\/a>/i) ||
                        html.match(/<meta name="twitter:data1" content="([^"]+)"/);
  const director = directorMatch ? directorMatch[1] : "";

  // Extract genres from the page
  const genreMatches = html.match(/\/films\/genre\/([^/"]+)/g) || [];
  const genres = genreMatches
    .slice(0, 3)
    .map(g => g.replace('/films/genre/', ''));

  const movieSlug = url.match(/\/film\/([a-z0-9-]+)/i)?.[1] || 'movie';
  const thumbnail = await uploadEventImage(ogImage, `letterboxd-${movieSlug}`);

  return {
    type: "movie" as const,
    title: strip(`${movieTitle} screening`).slice(0, 100),
    movieTitle: strip(movieTitle).slice(0, 100),
    year: strip(year).slice(0, 4),
    director: strip(director).slice(0, 60),
    venue: "TBD",
    date: "TBD",
    time: "TBD",
    vibe: genres.length > 0 ? genres.map(g => strip(g).slice(0, 30)) : ["film", "movie night"],
    thumbnail,
    description: strip(ogDescription).slice(0, 500),
    letterboxdUrl: url,
  };
}

// Scrape Resident Advisor event page via Apify
async function scrapeRA(url: string) {
  const apifyToken = process.env.APIFY_TOKEN;

  // Try Apify RA scraper first
  if (apifyToken) {
    try {
      const apifyRes = await fetch(
        `https://api.apify.com/v2/acts/YdJ5E7Ofhy8QgcXUs/run-sync-get-dataset-items?token=${apifyToken}&timeout=120`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startUrls: [{ url }],
            maxItems: 1,
          }),
        }
      );

      if (apifyRes.ok) {
        const items = await apifyRes.json();
        if (Array.isArray(items) && items.length > 0) {
          const event = items[0];

          const title = strip(event.title || event.name || "").slice(0, 100) || "Event";
          const venue = strip(event.venue?.name || event.venueName || event.location || "TBD").slice(0, 100);

          let date = "TBD";
          let time = "TBD";
          const startDate = event.startDate || event.date || event.startTime;
          if (startDate) {
            try {
              const d = new Date(startDate);
              if (!isNaN(d.getTime())) {
                date = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
              }
            } catch { /* use TBD */ }
          }

          const image = event.image || event.imageUrl || event.flyerFront || "";
          const raSlug = url.match(/\/events\/(\d+)/i)?.[1] || url.match(/\/event\/(\d+)/i)?.[1] || 'ra-event';
          const thumbnail = await uploadEventImage(image, `ra-${raSlug}`);

          // Infer vibes from lineup, genres, or title
          const fullText = `${title} ${event.lineup?.join(' ') || ''} ${event.genres?.join(' ') || ''} ${event.description || ''}`.toLowerCase();
          const vibeKeywords: Record<string, string> = {
            'techno': 'techno', 'house': 'house', 'drum and bass': 'drum & bass',
            'drum & bass': 'drum & bass', 'dnb': 'drum & bass', 'trance': 'trance',
            'ambient': 'ambient', 'electronic': 'electronic', 'disco': 'disco',
            'garage': 'garage', 'bass': 'bass', 'minimal': 'minimal',
            'dj': 'dj set', 'live': 'live music', 'jazz': 'jazz',
          };
          const vibes: string[] = [];
          for (const [keyword, vibe] of Object.entries(vibeKeywords)) {
            if (fullText.includes(keyword) && !vibes.includes(vibe)) {
              vibes.push(vibe);
              if (vibes.length >= 3) break;
            }
          }

          return {
            type: "event" as const,
            title,
            venue,
            date: strip(date).slice(0, 50),
            time: strip(time).slice(0, 50),
            vibe: vibes.length > 0 ? vibes : ['event'],
            igHandle: "",
            thumbnail,
            isPublicPost: true,
            raUrl: url,
          };
        }
      }
    } catch (err) {
      logError("scrape:ra:apify", err);
    }
  }

  // Fallback: direct HTML fetch with JSON-LD / OG parsing
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    throw new Error("Could not fetch RA event page");
  }

  const html = await response.text();

  let title = "";
  let venue = "TBD";
  let date = "TBD";
  let time = "TBD";
  let image = "";

  // Try JSON-LD
  const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch) {
    try {
      const jsonLd = JSON.parse(jsonLdMatch[1]);
      const eventData = Array.isArray(jsonLd)
        ? jsonLd.find((item: Record<string, unknown>) => item['@type'] === 'MusicEvent' || item['@type'] === 'Event' || item['@type'] === 'DanceEvent')
        : (['MusicEvent', 'Event', 'DanceEvent'].includes(jsonLd['@type']) ? jsonLd : null);

      if (eventData) {
        title = eventData.name || "";
        if (eventData.location?.name) venue = eventData.location.name;
        if (eventData.startDate) {
          const d = new Date(eventData.startDate);
          date = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
        }
        if (eventData.image) {
          image = Array.isArray(eventData.image) ? eventData.image[0] : eventData.image;
        }
      }
    } catch { /* fall through */ }
  }

  // Fallback: OG tags
  if (!title) {
    const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/i);
    if (ogTitle) title = strip(ogTitle[1]);
  }
  if (!image) {
    const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/i);
    if (ogImage) image = ogImage[1];
  }

  const raSlug = url.match(/\/events\/(\d+)/i)?.[1] || url.match(/\/event\/(\d+)/i)?.[1] || 'ra-event';
  const thumbnail = await uploadEventImage(image, `ra-${raSlug}`);

  const fullText = `${title} ${html.substring(0, 5000)}`.toLowerCase();
  const vibeKeywords: Record<string, string> = {
    'techno': 'techno', 'house': 'house', 'drum and bass': 'drum & bass',
    'trance': 'trance', 'ambient': 'ambient', 'electronic': 'electronic',
    'disco': 'disco', 'garage': 'garage', 'minimal': 'minimal',
  };
  const vibes: string[] = [];
  for (const [keyword, vibe] of Object.entries(vibeKeywords)) {
    if (fullText.includes(keyword) && !vibes.includes(vibe)) {
      vibes.push(vibe);
      if (vibes.length >= 3) break;
    }
  }

  return {
    type: "event" as const,
    title: strip(title).slice(0, 100) || "Event",
    venue: strip(venue).slice(0, 100),
    date: strip(date).slice(0, 50),
    time: strip(time).slice(0, 50),
    vibe: vibes.length > 0 ? vibes : ['event'],
    igHandle: "",
    thumbnail,
    isPublicPost: true,
    raUrl: url,
  };
}

// Scrape Dice.fm event page
async function scrapeDice(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    throw new Error("Could not fetch Dice event page");
  }

  const html = await response.text();

  let title = "";
  let venue = "TBD";
  let date = "TBD";
  let time = "TBD";
  let image = "";

  // Primary: Try JSON-LD structured data
  const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch) {
    try {
      const jsonLd = JSON.parse(jsonLdMatch[1]);
      // Could be a single object or an array
      const eventData = Array.isArray(jsonLd)
        ? jsonLd.find((item: Record<string, unknown>) => item['@type'] === 'MusicEvent' || item['@type'] === 'Event')
        : (jsonLd['@type'] === 'MusicEvent' || jsonLd['@type'] === 'Event') ? jsonLd : null;

      if (eventData) {
        title = eventData.name || "";
        if (eventData.location?.name) {
          venue = eventData.location.name;
          if (eventData.location.address?.addressLocality) {
            venue += `, ${eventData.location.address.addressLocality}`;
          }
        }
        if (eventData.startDate) {
          const d = new Date(eventData.startDate);
          date = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
        }
        if (eventData.image) {
          image = Array.isArray(eventData.image) ? eventData.image[0] : eventData.image;
        }
      }
    } catch {
      // JSON-LD parse failed, fall through to fallback
    }
  }

  // Fallback: Parse <title> tag — format: "{title} Tickets | {price} | {date} @ {venue}, {city} | DICE"
  if (!title) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      const titleText = strip(titleMatch[1]);
      const parts = titleText.split('|').map(p => p.trim());
      if (parts.length >= 4) {
        title = parts[0].replace(/\s*Tickets\s*$/i, '').trim();
        // parts[2] has "date @ venue, city"
        const dateVenue = parts[2];
        const atSplit = dateVenue.split('@').map(p => p.trim());
        if (atSplit.length === 2) {
          if (date === "TBD") date = atSplit[0];
          if (venue === "TBD") venue = atSplit[1];
        }
      } else if (parts.length >= 1) {
        title = parts[0].replace(/\s*Tickets\s*$/i, '').trim();
      }
    }
  }

  // Fallback image: look for dice-media.imgix.net URLs
  if (!image) {
    const imgMatch = html.match(/https:\/\/dice-media\.imgix\.net\/[^"'\s]+/);
    if (imgMatch) {
      image = imgMatch[0];
    }
  }

  // Extract description for vibe inference
  const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/i);
  const description = descMatch ? descMatch[1].toLowerCase() : "";
  const fullText = `${title} ${description}`.toLowerCase();

  const vibeKeywords: Record<string, string> = {
    'dj': 'music',
    'dance': 'dancing',
    'techno': 'techno',
    'house': 'house',
    'hip hop': 'hip hop',
    'hip-hop': 'hip hop',
    'r&b': 'r&b',
    'jazz': 'jazz',
    'comedy': 'comedy',
    'standup': 'comedy',
    'party': 'party',
    'rave': 'rave',
    'club': 'nightlife',
    'festival': 'festival',
    'concert': 'concert',
    'live': 'live music',
    'bass': 'bass',
    'drum': 'drum & bass',
    'ambient': 'ambient',
    'electronic': 'electronic',
  };

  const vibes: string[] = [];
  for (const [keyword, vibe] of Object.entries(vibeKeywords)) {
    if (fullText.includes(keyword) && !vibes.includes(vibe)) {
      vibes.push(vibe);
      if (vibes.length >= 3) break;
    }
  }

  const diceSlug = url.match(/dice\.fm\/event\/([^/?#]+)/i)?.[1] || 'dice-event';
  const thumbnail = await uploadEventImage(image, `dice-${diceSlug}`);

  return {
    type: "event" as const,
    title: strip(title).slice(0, 100) || "Event",
    venue: strip(venue).slice(0, 100),
    date: strip(date).slice(0, 50),
    time: strip(time).slice(0, 50),
    vibe: vibes.length > 0 ? vibes : ['event'],
    igHandle: "",
    thumbnail,
    isPublicPost: true,
    diceUrl: url,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== 'string' || url.length > 500) {
      return NextResponse.json({ error: "A valid URL is required" }, { status: 400 });
    }

    // Check if it's a Letterboxd URL (including boxd.it short links)
    const letterboxdPattern = /letterboxd\.com\/film\/([a-z0-9-]+)/i;
    const boxdItPattern = /boxd\.it\/[A-Za-z0-9]+/i;
    let letterboxdMatch = url.match(letterboxdPattern);

    if (!letterboxdMatch && boxdItPattern.test(url)) {
      // boxd.it is Letterboxd's short URL — follow the redirect to get the canonical URL
      try {
        const redirectRes = await fetch(url, { redirect: 'follow', headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        }});
        const resolvedUrl = redirectRes.url;
        letterboxdMatch = resolvedUrl.match(letterboxdPattern);
        if (letterboxdMatch) {
          const movieData = await scrapeLetterboxd(resolvedUrl);
          return NextResponse.json(movieData);
        }
      } catch {
        return NextResponse.json({ error: "Could not resolve short link. Try pasting the full Letterboxd URL." }, { status: 400 });
      }
    }

    if (letterboxdMatch) {
      const movieData = await scrapeLetterboxd(url);
      return NextResponse.json(movieData);
    }

    // Check if it's a Dice.fm URL
    const dicePattern = /dice\.fm\/event\//i;
    if (dicePattern.test(url)) {
      const diceData = await scrapeDice(url);
      return NextResponse.json(diceData);
    }

    // Check if it's a Resident Advisor URL
    const raPattern = /ra\.co\/(events|event)\/\d+/i;
    if (raPattern.test(url)) {
      const raData = await scrapeRA(url);
      return NextResponse.json(raData);
    }

    // Check if it's an Instagram URL
    const igUrlPattern = /instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/;
    const igMatch = url.match(igUrlPattern);

    if (!igMatch) {
      return NextResponse.json({
        error: "Unsupported URL. Try an Instagram, Letterboxd, Dice, or RA link."
      }, { status: 400 });
    }

    const canonicalUrl = `https://www.instagram.com/${igMatch[1]}/${igMatch[2]}/`;
    const shortCode = igMatch[2];

    // Use Apify Instagram Scraper for reliable data extraction
    const apifyToken = process.env.APIFY_TOKEN;
    if (apifyToken) {
      try {
        const apifyRes = await fetch(
          `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${apifyToken}&timeout=120`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              directUrls: [canonicalUrl],
              resultsType: 'posts',
              resultsLimit: 1,
            }),
          }
        );

        if (apifyRes.ok) {
          const items = await apifyRes.json();
          if (Array.isArray(items) && items.length > 0 && !items[0].error) {
            const post = items[0];
            const caption = post.caption || "";
            const authorName = post.ownerUsername || "";
            const imageUrl = post.displayUrl || (post.images?.[0]) || "";

            const eventDetails = parseEventDetails(caption, authorName);

            // Use locationName from Apify if venue wasn't parsed from caption
            if ((!eventDetails.venue || eventDetails.venue === "TBD") && post.locationName) {
              eventDetails.venue = strip(post.locationName).slice(0, 100);
            }

            const hostedThumbnail = await uploadEventImage(imageUrl, `ig-${shortCode}`);

            return NextResponse.json({
              type: "event" as const,
              ...eventDetails,
              thumbnail: hostedThumbnail,
              authorUrl: `https://www.instagram.com/${authorName}/`,
              isPublicPost: true,
              rawCaption: caption,
              igUrl: canonicalUrl,
            });
          }
        }
      } catch (apifyErr) {
        logError("scrape:apify", apifyErr);
        // Fall through to direct fetch
      }
    }

    // Fallback: direct fetch with Googlebot UA (may not get images)
    const response = await fetch(canonicalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
    });

    if (!response.ok) {
      return NextResponse.json({
        error: "This post looks private or restricted. Try a public post, or enter the details manually.",
        isPrivate: true,
      }, { status: 403 });
    }

    const html = await response.text();

    const captionMatch = html.match(/"caption":\{[^}]*"text":"((?:[^"\\]|\\.)*)"/);
    let caption = "";
    if (captionMatch) {
      try { caption = JSON.parse(`"${captionMatch[1]}"`); } catch { caption = captionMatch[1]; }
    }

    const authorMatch = html.match(/<meta property="og:url" content="https:\/\/www\.instagram\.com\/([^/]+)\//);
    const authorName = authorMatch ? authorMatch[1] : "";

    const displayUrlMatch = html.match(/"display_url"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const thumbnailSrcMatch = html.match(/"thumbnail_src"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);

    let thumbnail = "";
    if (displayUrlMatch) {
      try { thumbnail = JSON.parse(`"${displayUrlMatch[1]}"`); } catch { /* fall through */ }
    }
    if (!thumbnail && thumbnailSrcMatch) {
      try { thumbnail = JSON.parse(`"${thumbnailSrcMatch[1]}"`); } catch { /* fall through */ }
    }
    if (!thumbnail && ogImageMatch) {
      thumbnail = ogImageMatch[1].replace(/&amp;/g, '&');
    }

    if (!caption && !thumbnail) {
      return NextResponse.json({
        error: "Couldn't read this post — it might be private or age-restricted. Try a different post, or enter the details manually.",
        isPrivate: true,
      }, { status: 403 });
    }

    const eventDetails = parseEventDetails(caption, authorName);
    const hostedThumbnail = await uploadEventImage(thumbnail, `ig-${shortCode}`);

    return NextResponse.json({
      type: "event" as const,
      ...eventDetails,
      thumbnail: hostedThumbnail,
      authorUrl: `https://www.instagram.com/${authorName}/`,
      isPublicPost: true,
      rawCaption: caption,
      igUrl: canonicalUrl,
    });

  } catch (error) {
    logError("scrape", error);
    return NextResponse.json({
      error: "Something went wrong fetching that post. Try again, or enter the details manually."
    }, { status: 500 });
  }
}
