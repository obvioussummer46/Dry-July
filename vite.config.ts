import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Dry July — Nostr",
        short_name: "Dry July",
        description:
          "Track your alcohol-free month and cheer each other on, powered by Nostr.",
        theme_color: "#0b1020",
        background_color: "#0b1020",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        scope: "./",
        categories: ["health", "lifestyle", "social"],
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.protocol.startsWith("http"),
            handler: "NetworkFirst",
            options: {
              cacheName: "http-cache",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
          }
        ]
      },
      devOptions: {
        enabled: true
      }
    })
  ]
});
