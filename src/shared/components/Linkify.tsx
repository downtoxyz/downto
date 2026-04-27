import React from "react";

/**
 * Inline-renders URLs and `@mention` tokens inside a free-text string.
 * Two cases:
 *   • `https?://…` → tappable link with a host+path display string
 *     (truncated at 40 chars), opens in a new tab
 *   • `@name` → if the name matches a co-author profile passed in
 *     `coAuthors`, the mention becomes tappable and routes to that
 *     user's profile via `onViewProfile`
 *
 * Identical implementations of this used to live in CheckCard.tsx and
 * FeedView.tsx — kept drifting (one used the design-system `text-muted`
 * for the dimmed-link variant, the other used Tailwind's raw
 * `text-neutral-500`). Now consolidated; this version uses `text-muted`
 * to stay on-system.
 */
export function Linkify({
  children,
  dimmed,
  coAuthors,
  onViewProfile,
}: {
  children: string;
  dimmed?: boolean;
  coAuthors?: { name: string; userId?: string }[];
  onViewProfile?: (userId: string) => void;
}) {
  const tokenRe = /(https?:\/\/[^\s),]+|@\S+)/g;
  const parts = children.split(tokenRe);
  if (parts.length === 1) return <>{children}</>;
  return (
    <>
      {parts.map((part, i) => {
        if (/^https?:\/\//.test(part)) {
          const display = (() => {
            try {
              const u = new URL(part);
              let d =
                u.host.replace(/^www\./, "") + u.pathname.replace(/\/$/, "");
              if (d.length > 40) d = d.slice(0, 37) + "…";
              return d;
            } catch {
              return part;
            }
          })();
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={`break-all underline underline-offset-2 ${dimmed ? "text-muted" : "text-dt"}`}
            >
              {display}
            </a>
          );
        }
        if (/^@\S+/.test(part)) {
          const mention = part.slice(1).toLowerCase();
          const matched = coAuthors?.find(
            (ca) =>
              ca.name.toLowerCase() === mention ||
              ca.name.split(" ")[0]?.toLowerCase() === mention,
          );
          const canTap = matched?.userId && onViewProfile;
          return (
            <span
              key={i}
              className="text-dt font-semibold"
              style={canTap ? { cursor: "pointer" } : undefined}
              onClick={
                canTap
                  ? (e) => {
                      e.stopPropagation();
                      onViewProfile!(matched!.userId!);
                    }
                  : undefined
              }
            >
              @{matched ? matched.name : part.slice(1)}
            </span>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}
