import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

// Served from https://<user>.github.io/smart-crop-protect/ in production.
const base = process.env.BASE_PATH ?? "/smart-crop-protect/";

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "2.0.0") },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "icons/*.png"],
      manifest: {
        name: "Smart Crop Protect",
        short_name: "Crop Protect",
        description: "AI crop doctor, weather and water advisor, yield and price forecasts for Indian farmers.",
        theme_color: "#1F5135",
        background_color: "#F4EFE4",
        display: "standalone",
        orientation: "portrait",
        start_url: base,
        scope: base,
        lang: "en-IN",
        categories: ["productivity", "utilities", "weather"],
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallback: "index.html",
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes("/models/") || url.pathname.endsWith(".wasm"),
            handler: "CacheFirst",
            options: { cacheName: "models", expiration: { maxEntries: 20 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes("/data/"),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "app-data", expiration: { maxEntries: 80 } },
          },
          {
            urlPattern: ({ url }) =>
              /open-meteo\.com|power\.larc\.nasa\.gov|rest\.isric\.org|bigdatacloud/.test(url.hostname),
            handler: "NetworkFirst",
            options: {
              cacheName: "live-apis",
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 3600 },
            },
          },
        ],
      },
    }),
  ],
  build: { target: "es2022", sourcemap: true, chunkSizeWarningLimit: 900 },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
