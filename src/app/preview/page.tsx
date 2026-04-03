"use client";

import { useState } from "react";
import cn from "@/lib/tailwindMerge";

/* ── sample data ───────────────────────────────────────────── */

interface Response {
  name: string;
  type: "down" | "maybe";
}

interface SampleCheck {
  id: string;
  text: string;
  author: string;
  expiresIn: string;
  expiryPercent: number;
  eventDateLabel?: string;
  eventTime?: string;
  eventLocation?: string;
  dateFlexible?: boolean;
  timeFlexible?: boolean;
  responses: Response[];
}

const CHECKS: SampleCheck[] = [
  {
    id: "1",
    text: "ramen in bushwick?",
    author: "Mia",
    expiresIn: "4h",
    expiryPercent: 60,
    eventDateLabel: "Sat, Mar 15",
    eventTime: "7pm",
    eventLocation: "Bushwick",
    responses: [
      { name: "Alex", type: "down" },
      { name: "Sara", type: "down" },
      { name: "Leo", type: "down" },
      { name: "Jake", type: "maybe" },
      { name: "Priya", type: "maybe" },
    ],
  },
  {
    id: "2",
    text: "art opening in LES anyone?",
    author: "Jake",
    expiresIn: "12h",
    expiryPercent: 35,
    eventDateLabel: "Fri, Mar 14",
    eventTime: "7pm",
    timeFlexible: true,
    eventLocation: "56 Henry LES",
    responses: [
      { name: "Mia", type: "down" },
      { name: "Sofia", type: "down" },
      { name: "Leo", type: "maybe" },
    ],
  },
  {
    id: "3",
    text: "beach day this weekend",
    author: "Sofia",
    expiresIn: "2d",
    expiryPercent: 15,
    dateFlexible: true,
    timeFlexible: true,
    responses: [],
  },
];

/* ── types ─────────────────────────────────────────────────── */

type DateStyle = "chips" | "collapsed" | "footer" | "plain" | "integrated";
type ResponseStyle = "collapsed" | "expanded" | "sideBySide" | "inline";
type IconStyle = "none" | "minimal" | "emoji";
type ButtonStyle = "text" | "iconText" | "iconOnly";

/* ── component ─────────────────────────────────────────────── */

export default function PreviewPage() {
  const [dateStyle, setDateStyle] = useState<DateStyle>("chips");
  const [responseStyle, setResponseStyle] = useState<ResponseStyle>("collapsed");
  const [iconStyle, setIconStyle] = useState<IconStyle>("none");
  const [buttonStyle, setButtonStyle] = useState<ButtonStyle>("text");

  return (
    <div className="bg-bg min-h-screen font-mono">
      {/* sticky toggle bar */}
      <div className="sticky top-0 z-50 bg-surface border-b border-border px-4 py-3">
        <div className="max-w-[420px] mx-auto">
          <ToggleRow
            label="DATE STYLE"
            options={[
              { value: "chips", label: "Chips" },
              { value: "collapsed", label: "Line" },
              { value: "footer", label: "Footer" },
              { value: "plain", label: "Plain" },
              { value: "integrated", label: "Integrated" },
            ]}
            value={dateStyle}
            onChange={(v) => setDateStyle(v as DateStyle)}
          />
          <div className="h-2" />
          <ToggleRow
            label="CHIP ICONS"
            options={[
              { value: "none", label: "None" },
              { value: "minimal", label: "Minimal" },
              { value: "emoji", label: "Emoji" },
            ]}
            value={iconStyle}
            onChange={(v) => setIconStyle(v as IconStyle)}
          />
          <div className="h-2" />
          <ToggleRow
            label="BUTTON STYLE"
            options={[
              { value: "text", label: "Text" },
              { value: "iconText", label: "Icon + Text" },
              { value: "iconOnly", label: "Icon Only" },
            ]}
            value={buttonStyle}
            onChange={(v) => setButtonStyle(v as ButtonStyle)}
          />
          <div className="h-2" />
          <ToggleRow
            label="RESPONSE STYLE"
            options={[
              { value: "collapsed", label: "Collapsed" },
              { value: "expanded", label: "Expanded" },
              { value: "sideBySide", label: "Side by Side" },
              { value: "inline", label: "Inline Names" },
            ]}
            value={responseStyle}
            onChange={(v) => setResponseStyle(v as ResponseStyle)}
          />
        </div>
      </div>

      {/* cards */}
      <div className="max-w-[420px] mx-auto px-4 pt-4 pb-20">
        {CHECKS.map((check) => (
          <CheckCard
            key={check.id}
            check={check}
            dateStyle={dateStyle}
            responseStyle={responseStyle}
            iconStyle={iconStyle}
            buttonStyle={buttonStyle}
          />
        ))}
      </div>
    </div>
  );
}

/* ── toggle row ────────────────────────────────────────────── */

function ToggleRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div
        className="font-mono text-tiny uppercase text-dim mb-1.5"
        style={{ letterSpacing: "0.15em" }}
      >
        {label}
      </div>
      <div className="flex gap-1 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "font-mono text-tiny font-bold rounded-md border cursor-pointer uppercase",
              value === opt.value
                ? "border-dt bg-dt text-black"
                : "border-border-mid bg-transparent text-muted"
            )}
            style={{ padding: "4px 10px", letterSpacing: "0.08em" }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── check card ────────────────────────────────────────────── */

function CheckCard({
  check,
  dateStyle,
  responseStyle,
  iconStyle,
  buttonStyle,
}: {
  check: SampleCheck;
  dateStyle: DateStyle;
  responseStyle: ResponseStyle;
  iconStyle: IconStyle;
  buttonStyle: ButtonStyle;
}) {
  const expiryColor =
    check.expiryPercent < 50
      ? "#4ade80"
      : check.expiryPercent < 75
        ? "#ffaa5a"
        : "#ff6b6b";

  const downResps = check.responses.filter((r) => r.type === "down");
  const maybeResps = check.responses.filter((r) => r.type === "maybe");

  return (
    <div className="rounded-xl mb-2 bg-card border border-border overflow-hidden">
      {/* expiry bar */}
      <div className="h-[3px] bg-deep">
        <div
          className="h-[3px]"
          style={{
            width: `${100 - check.expiryPercent}%`,
            background: expiryColor,
            borderRadius: "0 2px 2px 0",
          }}
        />
      </div>

      <div className="p-3.5">
        {/* author row */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-border-light text-dim flex items-center justify-center font-mono text-xs font-bold">
              {check.author[0]}
            </div>
            <span className="font-mono text-xs text-muted">
              {check.author}
            </span>
          </div>
          <span className="font-mono text-tiny text-faint">
            {check.expiresIn} left
          </span>
        </div>

        {/* body */}
        <div className="font-serif text-lg font-normal text-primary leading-[1.4] mb-2.5">
          {check.text}
        </div>

        {/* date chips — inline or collapsed (not footer) */}
        {dateStyle === "chips" && (
          <div className="flex gap-1.5 flex-wrap mb-2.5">
            <DateChip
              text={check.eventDateLabel}
              fallback="TBD"
              flexible={check.dateFlexible}
              chipType="date"
              iconStyle={iconStyle}
            />
            <DateChip
              text={check.eventTime}
              fallback="TBD"
              flexible={check.timeFlexible}
              chipType="time"
              iconStyle={iconStyle}
            />
            {(check.eventLocation || (!check.eventDateLabel && !check.eventTime)) && (
              <DateChip
                text={check.eventLocation}
                fallback="TBD"
                chipType="location"
                iconStyle={iconStyle}
              />
            )}
          </div>
        )}

        {dateStyle === "collapsed" && (
          <CollapsedDateLine check={check} iconStyle={iconStyle} />
        )}

        {/* responses + action buttons row */}
        <div
          className={cn(
            "flex items-end justify-between gap-2",
            check.responses.length > 0 ? "mt-0" : "mt-2.5"
          )}
        >
          <div className="flex-1 min-w-0">
            {check.responses.length > 0 && (
              <ResponseSection
                down={downResps}
                maybe={maybeResps}
                style={responseStyle}
              />
            )}
          </div>
          <div className="flex gap-1.5 shrink-0">
            <ActionButton label="Down" active={false} variant="down" buttonStyle={buttonStyle} />
            <ActionButton label="Maybe" active={false} variant="maybe" buttonStyle={buttonStyle} />
          </div>
        </div>
      </div>

      {/* date footer bar */}
      {dateStyle === "footer" && (
        <div className="border-t border-border px-3.5 py-2 flex gap-1.5 flex-wrap">
          <DateChip
            text={check.eventDateLabel}
            fallback="TBD"
            flexible={check.dateFlexible}
            chipType="date"
            iconStyle={iconStyle}
          />
          <DateChip
            text={check.eventTime}
            fallback="TBD"
            flexible={check.timeFlexible}
            chipType="time"
            iconStyle={iconStyle}
          />
          {(check.eventLocation || (!check.eventDateLabel && !check.eventTime)) && (
            <DateChip
              text={check.eventLocation}
              fallback="TBD"
              chipType="location"
              iconStyle={iconStyle}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ── icon helpers ──────────────────────────────────────────── */

const ICONS: Record<string, Record<IconStyle, string>> = {
  date: { none: "", minimal: "\u25CB ", emoji: "\uD83D\uDCC5 " },     // ○ / 📅
  time: { none: "", minimal: "\u25F7 ", emoji: "\uD83D\uDD50 " },     // ◷ / 🕐
  location: { none: "", minimal: "\u25B3 ", emoji: "\uD83D\uDCCD " }, // △ / 📍
};

/* ── date chip ────────────────────────────────────────────── */

function DateChip({
  text,
  fallback,
  flexible,
  chipType,
  iconStyle,
}: {
  text?: string;
  fallback: string;
  flexible?: boolean;
  chipType: "date" | "time" | "location";
  iconStyle: IconStyle;
}) {
  const isTBD = !text;
  const icon = ICONS[chipType][iconStyle];
  const label = text ?? fallback;

  return (
    <span
      className={cn(
        "font-mono text-tiny font-semibold rounded-md inline-flex items-center gap-0.5",
        isTBD ? "text-faint" : "text-dt"
      )}
      style={{
        background: isTBD ? "rgba(255,255,255,0.03)" : "rgba(232,255,90,0.08)",
        border: `1px solid ${isTBD ? "#2a2a2a" : "rgba(232,255,90,0.2)"}`,
        padding: "3px 8px",
      }}
    >
      {icon}{label}
      {flexible && (
        <span
          className="font-normal ml-0.5"
          style={{
            fontSize: 9,
            color: isTBD ? "#444" : "rgba(232,255,90,0.5)",
          }}
        >
          flex
        </span>
      )}
    </span>
  );
}

/* ── collapsed date line ──────────────────────────────────── */

function CollapsedDateLine({
  check,
  iconStyle,
}: {
  check: SampleCheck;
  iconStyle: IconStyle;
}) {
  const dateIcon = ICONS.date[iconStyle];
  const timeIcon = ICONS.time[iconStyle];
  const locIcon = ICONS.location[iconStyle];

  const parts: string[] = [];

  if (check.eventDateLabel) {
    parts.push(`${dateIcon}${check.eventDateLabel}${check.dateFlexible ? " (flex)" : ""}`);
  } else {
    parts.push(`${dateIcon}TBD${check.dateFlexible ? " (flex)" : ""}`);
  }

  if (check.eventTime) {
    parts.push(`${timeIcon}at ${check.eventTime}${check.timeFlexible ? " (flex)" : ""}`);
  } else {
    parts.push(`${timeIcon}TBD${check.timeFlexible ? " (flex)" : ""}`);
  }

  if (check.eventLocation) {
    parts.push(`${locIcon}${check.eventLocation}`);
  }

  return (
    <div className="font-mono text-tiny text-dt mb-2.5">
      {parts.join(" · ")}
    </div>
  );
}

/* ── response section ─────────────────────────────────────── */

function ResponseSection({
  down,
  maybe,
  style,
}: {
  down: Response[];
  maybe: Response[];
  style: ResponseStyle;
}) {
  if (style === "collapsed") return <CollapsedResponses down={down} maybe={maybe} />;
  if (style === "expanded") return <ExpandedResponses down={down} maybe={maybe} />;
  if (style === "sideBySide") return <SideBySideResponses down={down} maybe={maybe} />;
  return <InlineResponses down={down} maybe={maybe} />;
}

/* response: collapsed (avatar stack + summary) */
function CollapsedResponses({ down, maybe }: { down: Response[]; maybe: Response[] }) {
  const all = [...down, ...maybe];
  return (
    <div className="flex items-center gap-2">
      <div className="flex">
        {all.slice(0, 6).map((r, i) => (
          <div
            key={r.name}
            className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center font-mono font-bold relative",
              r.type === "down" ? "bg-dt text-black" : "bg-border-light text-dim"
            )}
            style={{
              fontSize: 9,
              marginLeft: i > 0 ? -6 : 0,
              border: "2px solid #111",
              zIndex: all.length - i,
            }}
          >
            {r.name[0]}
          </div>
        ))}
      </div>
      <span className="font-mono text-tiny">
        {down.length > 0 && (
          <span className="text-dt">{down.length} down</span>
        )}
        {down.length > 0 && maybe.length > 0 && (
          <span className="text-faint"> · </span>
        )}
        {maybe.length > 0 && (
          <span className="text-dim">{maybe.length} maybe</span>
        )}
      </span>
    </div>
  );
}

/* response: expanded names (avatars + vertical name list) */
function ExpandedResponses({ down, maybe }: { down: Response[]; maybe: Response[] }) {
  const renderGroup = (resps: Response[], label: string, accentColor: string) => {
    if (resps.length === 0) return null;
    return (
      <div className="mb-1.5">
        <div
          className={cn(
            "font-mono text-tiny uppercase mb-1",
            label === "Down" ? "text-dt" : "text-dim"
          )}
          style={{ letterSpacing: "0.15em" }}
        >
          {label} ({resps.length})
        </div>
        {resps.map((r) => (
          <div
            key={r.name}
            className="flex items-center gap-1.5 mb-[3px]"
          >
            <div
              className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center font-mono font-bold",
                label === "Down" ? "bg-dt text-black" : "bg-border-light text-dim"
              )}
              style={{ fontSize: 8 }}
            >
              {r.name[0]}
            </div>
            <span className="font-mono text-xs text-muted">
              {r.name}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      {renderGroup(down, "Down", "#e8ff5a")}
      {renderGroup(maybe, "Maybe", "#666")}
    </div>
  );
}

/* response: side by side (two columns) */
function SideBySideResponses({ down, maybe }: { down: Response[]; maybe: Response[] }) {
  const col = (resps: Response[], label: string, bg: string) => (
    <div className="flex-1">
      <div
        className={cn(
          "font-mono text-tiny uppercase mb-1",
          label === "Down" ? "text-dt" : "text-dim"
        )}
        style={{ letterSpacing: "0.15em" }}
      >
        {label}
      </div>
      {resps.length === 0 ? (
        <span className="font-mono text-tiny text-faint">—</span>
      ) : (
        resps.map((r) => (
          <div
            key={r.name}
            className="flex items-center gap-1.5 mb-[3px]"
          >
            <div
              className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center font-mono font-bold",
                label === "Down" ? "text-black" : "text-dim"
              )}
              style={{ fontSize: 8, background: bg }}
            >
              {r.name[0]}
            </div>
            <span className="font-mono text-xs text-muted">
              {r.name}
            </span>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="flex gap-3">
      {col(down, "Down", "#e8ff5a")}
      {col(maybe, "Maybe", "#2a2a2a")}
    </div>
  );
}

/* response: inline names (text only, no avatars) */
function InlineResponses({ down, maybe }: { down: Response[]; maybe: Response[] }) {
  const parts: React.ReactElement[] = [];
  if (down.length > 0) {
    parts.push(
      <span key="down" className="text-dt">
        {down.map((r) => r.name).join(", ")} down
      </span>
    );
  }
  if (maybe.length > 0) {
    if (parts.length > 0) {
      parts.push(
        <span key="sep" className="text-faint">
          {" · "}
        </span>
      );
    }
    parts.push(
      <span key="maybe" className="text-dim">
        {maybe.map((r) => r.name).join(", ")} maybe
      </span>
    );
  }
  return (
    <div className="font-mono text-tiny leading-normal">{parts}</div>
  );
}

/* ── action button ─────────────────────────────────────────── */

const BTN_ICONS = {
  down: { text: "", minimal: "↓ ", emoji: "✋ " },
  maybe: { text: "", minimal: "~ ", emoji: "🤔 " },
};

const BTN_ICONS_ONLY = {
  down: { text: "Down", minimal: "↓", emoji: "✋" },
  maybe: { text: "Maybe", minimal: "~", emoji: "🤔" },
};

function ActionButton({
  label,
  active,
  variant,
  buttonStyle,
}: {
  label: string;
  active: boolean;
  variant: "down" | "maybe";
  buttonStyle: ButtonStyle;
}) {
  const isDown = variant === "down";

  let content: string;
  if (buttonStyle === "iconOnly") {
    content = active ? `✓` : BTN_ICONS_ONLY[variant].minimal;
  } else if (buttonStyle === "iconText") {
    const icon = BTN_ICONS[variant].minimal;
    content = active ? `✓ ${label}` : `${icon}${label}`;
  } else {
    content = active ? `✓ ${label}` : label;
  }

  return (
    <button
      className={cn(
        "font-mono font-bold rounded-lg border cursor-pointer leading-none",
        buttonStyle === "iconOnly" ? "text-sm px-2 py-1" : "text-tiny py-1.5 px-2.5",
        isDown ? "border-dt" : "border-border-mid",
        active
          ? isDown
            ? "bg-dt text-black"
            : "bg-dim text-black"
          : "bg-transparent",
        !active && (isDown ? "text-dt" : "text-dim")
      )}
    >
      {content}
    </button>
  );
}
