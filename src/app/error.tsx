"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { logError } from "@/lib/logger";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    logError("uncaughtError", error, { digest: error.digest });
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "'Instrument Serif', serif",
          fontSize: 48,
          color: "#E8FF5A",
          marginBottom: 12,
        }}
      >
        oops
      </div>
      <p
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 13,
          color: "#999",
          marginBottom: 24,
          maxWidth: 300,
          lineHeight: 1.6,
        }}
      >
        something broke — sorry about that
      </p>
      <button
        onClick={reset}
        style={{
          background: "#E8FF5A",
          color: "#000",
          border: "none",
          borderRadius: 12,
          padding: "14px 32px",
          fontFamily: "'Space Mono', monospace",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        Try Again
      </button>
    </div>
  );
}
