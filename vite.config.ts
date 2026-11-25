import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { loadEnv } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

export default defineConfig(({ mode }) => {
  // Load only server configuration into Node. Never define secrets in client bundles.
  const local = loadEnv(mode, process.cwd(), "");
  for (const key of [
    "APP_ORIGIN",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SESSION_SECRET",
    "PAYSTACK_SECRET_KEY",
    "BREVO_API_KEY",
    "WORKER_SECRET",
  ]) {
    if (!process.env[key] && local[key]) process.env[key] = local[key];
  }
  return {
    server: { port: 3000, strictPort: true },
    resolve: {
      tsconfigPaths: true,
      dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
    },
    plugins: [
      tanstackStart({ server: { entry: "server" } }),
      // Detect Vercel during hosted builds; keep Node.js output for local builds.
      nitro(),
      viteReact(),
      tailwindcss(),
    ],
  };
});
