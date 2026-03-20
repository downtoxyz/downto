"use client";

export default function DevProdBanner() {
  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;

  const isStaging = vercelEnv === "preview";
  const isProd = (() => {
    if (process.env.NODE_ENV !== "development") return false;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    return !url.includes("127.0.0.1") && !url.includes("localhost");
  })();

  if (!isStaging && !isProd) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: isStaging ? "#E8FF5A" : "#d32f2f",
        color: isStaging ? "#000" : "#fff",
        textAlign: "center",
        fontSize: 9,
        fontFamily: "Space Mono, monospace",
        padding: "env(safe-area-inset-top, 0px) 0 2px",
        letterSpacing: 1,
        pointerEvents: "none",
      }}
    >
      {isStaging ? "STAGING DATABASE" : "PRODUCTION DATABASE"}
    </div>
  );
}
