import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "xyz.downto.app",
  appName: "downto",
  webDir: "out",
  server: {
    // In dev, load from local Next.js dev server instead of static files
    ...(process.env.CAPACITOR_DEV === "true" && {
      url: "http://localhost:3000",
      cleartext: true,
    }),
  },
};

export default config;
