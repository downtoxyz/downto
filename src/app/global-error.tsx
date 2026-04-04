"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { logError } from "@/lib/logger";
import "./global.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    logError("uncaughtGlobalError", error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="m-0 p-0 bg-bg min-h-screen">
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
          <div className="font-serif text-dt mb-3" style={{ fontSize: 48 }}>
            oops
          </div>
          <p
            className="font-mono text-sm text-muted mb-6 max-w-[300px]"
            style={{ lineHeight: 1.6 }}
          >
            something broke — sorry about that
          </p>
          <button
            onClick={reset}
            className="bg-dt text-black border-none rounded-xl font-mono text-xs font-bold cursor-pointer uppercase"
            style={{ padding: "14px 32px", letterSpacing: "0.1em" }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
