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
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg p-6 text-center">
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
  );
}
