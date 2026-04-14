"use client";

export default function DevProdBanner() {
  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;

  const isStaging = vercelEnv === "preview";
  const isProd = (() => {
    if (process.env.NODE_ENV !== "development") return false;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    return !url.includes("127.0.0.1") && !url.includes("localhost");
  })();

  // TODO: re-enable banner — temporarily hidden while iterating on linen theme
  if (!isStaging && !isProd) return null;

  return null;
}
