export function GET() {
  return Response.json({
    buildId: process.env.NEXT_PUBLIC_BUILD_ID,
    skipNotify: process.env.NEXT_PUBLIC_SKIP_UPDATE_NOTIFY === "true",
  });
}
