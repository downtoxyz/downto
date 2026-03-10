"use client";

import { useState } from "react";
import { font, color } from "@/lib/styles";

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
    eventTime: "7 PM",
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
    eventTime: "7 PM",
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
    <div style={{ background: color.bg, minHeight: "100vh", fontFamily: font.mono }}>
      {/* sticky toggle bar */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: color.surface,
          borderBottom: `1px solid ${color.border}`,
          padding: "12px 16px",
        }}
      >
        <div style={{ maxWidth: 420, margin: "0 auto" }}>
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
          <div style={{ height: 8 }} />
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
          <div style={{ height: 8 }} />
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
          <div style={{ height: 8 }} />
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
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "16px 16px 80px" }}>
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
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: color.dim,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              fontFamily: font.mono,
              fontSize: 10,
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: 6,
              border: `1px solid ${value === opt.value ? color.accent : color.borderMid}`,
              background: value === opt.value ? color.accent : "transparent",
              color: value === opt.value ? "#000" : color.muted,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
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

  const hasDateInfo = check.eventDateLabel || check.eventTime || check.eventLocation;
  const downResps = check.responses.filter((r) => r.type === "down");
  const maybeResps = check.responses.filter((r) => r.type === "maybe");

  return (
    <div
      style={{
        borderRadius: 14,
        marginBottom: 8,
        background: color.card,
        border: `1px solid ${color.border}`,
        overflow: "hidden",
      }}
    >
      {/* expiry bar */}
      <div style={{ height: 3, background: color.deep }}>
        <div
          style={{
            height: 3,
            width: `${100 - check.expiryPercent}%`,
            background: expiryColor,
            borderRadius: "0 2px 2px 0",
          }}
        />
      </div>

      <div style={{ padding: 14 }}>
        {/* author row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: color.borderLight,
                color: color.dim,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: font.mono,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {check.author[0]}
            </div>
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                color: color.muted,
              }}
            >
              {check.author}
            </span>
          </div>
          <span
            style={{
              fontFamily: font.mono,
              fontSize: 10,
              color: color.faint,
            }}
          >
            {check.expiresIn} left
          </span>
        </div>

        {/* body */}
        <div
          style={{
            fontFamily: font.serif,
            fontSize: 18,
            fontWeight: 400,
            color: color.text,
            lineHeight: 1.4,
            marginBottom: 10,
          }}
        >
          {check.text}
        </div>

        {/* date chips — inline or collapsed (not footer) */}
        {dateStyle === "chips" && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
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
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 8,
            marginTop: check.responses.length > 0 ? 0 : 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {check.responses.length > 0 && (
              <ResponseSection
                down={downResps}
                maybe={maybeResps}
                style={responseStyle}
              />
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <ActionButton label="Down" active={false} variant="down" buttonStyle={buttonStyle} />
            <ActionButton label="Maybe" active={false} variant="maybe" buttonStyle={buttonStyle} />
          </div>
        </div>
      </div>

      {/* date footer bar */}
      {dateStyle === "footer" && (
        <div
          style={{
            borderTop: `1px solid ${color.border}`,
            padding: "8px 14px",
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
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
      style={{
        fontFamily: font.mono,
        fontSize: 10,
        fontWeight: 600,
        color: isTBD ? color.faint : color.accent,
        background: isTBD ? "rgba(255,255,255,0.03)" : "rgba(232,255,90,0.08)",
        border: `1px solid ${isTBD ? color.borderLight : "rgba(232,255,90,0.2)"}`,
        borderRadius: 6,
        padding: "3px 8px",
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
      }}
    >
      {icon}{label}
      {flexible && (
        <span
          style={{
            fontSize: 9,
            color: isTBD ? color.faint : "rgba(232,255,90,0.5)",
            marginLeft: 2,
            fontWeight: 400,
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
    <div
      style={{
        fontFamily: font.mono,
        fontSize: 10,
        color: color.accent,
        marginBottom: 10,
      }}
    >
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
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ display: "flex" }}>
        {all.slice(0, 6).map((r, i) => (
          <div
            key={r.name}
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: r.type === "down" ? color.accent : color.borderLight,
              color: r.type === "down" ? "#000" : color.dim,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: font.mono,
              fontSize: 9,
              fontWeight: 700,
              marginLeft: i > 0 ? -6 : 0,
              border: `2px solid ${color.card}`,
              zIndex: all.length - i,
              position: "relative",
            }}
          >
            {r.name[0]}
          </div>
        ))}
      </div>
      <span style={{ fontFamily: font.mono, fontSize: 10 }}>
        {down.length > 0 && (
          <span style={{ color: color.accent }}>{down.length} down</span>
        )}
        {down.length > 0 && maybe.length > 0 && (
          <span style={{ color: color.faint }}> · </span>
        )}
        {maybe.length > 0 && (
          <span style={{ color: color.dim }}>{maybe.length} maybe</span>
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
      <div style={{ marginBottom: 6 }}>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            color: accentColor,
            marginBottom: 4,
          }}
        >
          {label} ({resps.length})
        </div>
        {resps.map((r) => (
          <div
            key={r.name}
            style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: label === "Down" ? color.accent : color.borderLight,
                color: label === "Down" ? "#000" : color.dim,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: font.mono,
                fontSize: 8,
                fontWeight: 700,
              }}
            >
              {r.name[0]}
            </div>
            <span style={{ fontFamily: font.mono, fontSize: 11, color: color.muted }}>
              {r.name}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      {renderGroup(down, "Down", color.accent)}
      {renderGroup(maybe, "Maybe", color.dim)}
    </div>
  );
}

/* response: side by side (two columns) */
function SideBySideResponses({ down, maybe }: { down: Response[]; maybe: Response[] }) {
  const col = (resps: Response[], label: string, accentColor: string, bg: string) => (
    <div style={{ flex: 1 }}>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: accentColor,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {resps.length === 0 ? (
        <span style={{ fontFamily: font.mono, fontSize: 10, color: color.faint }}>—</span>
      ) : (
        resps.map((r) => (
          <div
            key={r.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 3,
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: bg,
                color: label === "Down" ? "#000" : color.dim,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: font.mono,
                fontSize: 8,
                fontWeight: 700,
              }}
            >
              {r.name[0]}
            </div>
            <span style={{ fontFamily: font.mono, fontSize: 11, color: color.muted }}>
              {r.name}
            </span>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", gap: 12 }}>
      {col(down, "Down", color.accent, color.accent)}
      {col(maybe, "Maybe", color.dim, color.borderLight)}
    </div>
  );
}

/* response: inline names (text only, no avatars) */
function InlineResponses({ down, maybe }: { down: Response[]; maybe: Response[] }) {
  const parts: React.ReactElement[] = [];
  if (down.length > 0) {
    parts.push(
      <span key="down" style={{ color: color.accent }}>
        {down.map((r) => r.name).join(", ")} down
      </span>
    );
  }
  if (maybe.length > 0) {
    if (parts.length > 0) {
      parts.push(
        <span key="sep" style={{ color: color.faint }}>
          {" · "}
        </span>
      );
    }
    parts.push(
      <span key="maybe" style={{ color: color.dim }}>
        {maybe.map((r) => r.name).join(", ")} maybe
      </span>
    );
  }
  return (
    <div style={{ fontFamily: font.mono, fontSize: 10, lineHeight: 1.5 }}>{parts}</div>
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
      style={{
        fontFamily: font.mono,
        fontSize: buttonStyle === "iconOnly" ? 14 : 10,
        fontWeight: 700,
        padding: buttonStyle === "iconOnly" ? "4px 8px" : "6px 10px",
        borderRadius: 8,
        border: `1px solid ${isDown ? color.accent : color.borderMid}`,
        background: active ? (isDown ? color.accent : color.dim) : "transparent",
        color: active ? "#000" : isDown ? color.accent : color.dim,
        cursor: "pointer",
        lineHeight: 1,
      }}
    >
      {content}
    </button>
  );
}
