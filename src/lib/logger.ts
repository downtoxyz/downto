import * as Sentry from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === "development";

/**
 * Extract useful fields from Supabase/Postgres errors.
 */
function extractErrorInfo(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const info: Record<string, unknown> = { message: error.message };
    const e = error as unknown as Record<string, unknown>;
    if (e.code) info.code = e.code;
    if (e.details) info.details = e.details;
    if (e.hint) info.hint = e.hint;
    return info;
  }
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const info: Record<string, unknown> = {};
    if (e.message) info.message = e.message;
    if (e.code) info.code = e.code;
    if (e.details) info.details = e.details;
    if (e.hint) info.hint = e.hint;
    return Object.keys(info).length > 0 ? info : { raw: error };
  }
  return { raw: String(error) };
}

export function logError(
  action: string,
  error: unknown,
  context?: Record<string, unknown>,
) {
  const errorInfo = extractErrorInfo(error);

  if (isDev) {
    console.groupCollapsed(`%c✖ ${action}`, "color: #ff6b6b; font-weight: bold");
    console.error("Error:", errorInfo);
    if (context) console.log("Context:", context);
    if (error instanceof Error && error.stack) console.log("Stack:", error.stack);
    console.groupEnd();
  } else {
    console.error(
      JSON.stringify({ level: "error", action, error: errorInfo, ...context }),
    );
    Sentry.captureException(error instanceof Error ? error : new Error(String(errorInfo.message ?? errorInfo.raw)), {
      tags: { action },
      extra: context,
    });
  }
}

export function logWarn(
  action: string,
  message: string,
  context?: Record<string, unknown>,
) {
  if (isDev) {
    console.groupCollapsed(`%c⚠ ${action}`, "color: #ffaa5a; font-weight: bold");
    console.warn(message);
    if (context) console.log("Context:", context);
    console.groupEnd();
  } else {
    console.warn(
      JSON.stringify({ level: "warn", action, message, ...context }),
    );
  }
}
