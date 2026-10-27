// Universal links for the native iOS app (apps/ios/docs/ARCHITECTURE.md §7.2).
// Served as application/json with no redirect; Apple's CDN fetches it on install. The Team ID is not a secret (it is in every
// signed binary) — it is the same value as DEVELOPMENT_TEAM in apps/ios/Config/Secrets.xcconfig.
// `components` is deliberate: a bare "/" would hijack every downto.xyz link into the app, including the web app itself.
import { NextResponse } from "next/server";

const APPLE_TEAM_ID = "FR4CG496L3";
const APP_ID = `${APPLE_TEAM_ID}.xyz.downto.app`;

const aasa = {
  applinks: {
    details: [
      {
        appIDs: [APP_ID],
        components: [
          { "/": "/check/*", comment: "shared check" },
          { "/": "/friend", "?": { token: "?*" }, comment: "invite link" },
          { "/": "/", "?": { add: "?*" }, comment: "?add=username" },
          { "/": "/", "?": { pendingCheck: "?*" }, comment: "?pendingCheck=id" },
          { "/": "/", "?": { squadId: "?*" }, comment: "legacy sw.js route" },
          { "/": "/", "?": { checkId: "?*" }, comment: "legacy sw.js route" },
        ],
      },
    ],
  },
  webcredentials: { apps: [APP_ID] },
};

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(aasa, {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
  });
}
