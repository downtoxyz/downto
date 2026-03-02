import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { uploadEventImage } from "@/lib/supabase-admin";

/** Strip HTML tags and trim */
const strip = (s: string) => s.replace(/<[^>]*>/g, "").trim();

/** Convert a movie title to a Letterboxd-style slug */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Try to scrape a Letterboxd film page. Returns null on 404/error. */
async function tryFetchFilm(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      redirect: "follow",
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Extract Open Graph meta tags
    const ogTitle =
      html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] || "";
    const ogImage =
      html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || "";
    const ogDescription =
      html.match(/<meta property="og:description" content="([^"]+)"/)?.[1] ||
      "";

    // Extract year from title (usually "Movie Name (2024)")
    const yearMatch = ogTitle.match(/\((\d{4})\)/);
    const year = yearMatch ? yearMatch[1] : "";
    const movieTitle = ogTitle.replace(/\s*\(\d{4}\).*$/, "").trim();

    if (!movieTitle) return null;

    // Extract director if available
    const directorMatch =
      html.match(/Directed by <a[^>]*>([^<]+)<\/a>/i) ||
      html.match(/<meta name="twitter:data1" content="([^"]+)"/);
    const director = directorMatch ? directorMatch[1] : "";

    // Extract genres from the page
    const genreMatches = html.match(/\/films\/genre\/([^/"]+)/g) || [];
    const genres = genreMatches
      .slice(0, 3)
      .map((g) => g.replace("/films/genre/", ""));

    const movieSlug =
      url.match(/\/film\/([a-z0-9-]+)/i)?.[1] || "movie";
    const thumbnail = await uploadEventImage(
      ogImage,
      `letterboxd-${movieSlug}`
    );

    return {
      title: strip(movieTitle),
      year: strip(year),
      director: strip(director),
      thumbnail,
      url,
      vibes: genres.map((g) => strip(g)),
      description: strip(ogDescription).slice(0, 500),
    };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== "string" || query.length > 200) {
      return NextResponse.json(
        { error: "A valid query is required" },
        { status: 400 }
      );
    }

    const slug = slugify(query.trim());
    if (!slug) {
      return NextResponse.json({ found: false });
    }

    const currentYear = new Date().getFullYear();
    const candidates = [
      `https://letterboxd.com/film/${slug}-${currentYear}/`,
      `https://letterboxd.com/film/${slug}-${currentYear - 1}/`,
      `https://letterboxd.com/film/${slug}/`,
    ];

    for (const url of candidates) {
      const movie = await tryFetchFilm(url);
      if (movie) {
        return NextResponse.json({ found: true, movie });
      }
    }

    return NextResponse.json({ found: false });
  } catch (error) {
    logError("search-letterboxd", error);
    return NextResponse.json(
      { error: "Something went wrong searching Letterboxd." },
      { status: 500 }
    );
  }
}
