import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "RADAR LOCAL PRO",
        short_name: "Radar Pro",
        description: "Encontre negócios. Identifique oportunidades. Conquiste clientes.",
        lang: "pt-BR",
        theme_color: "#08090C",
        background_color: "#08090C",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        categories: ["business", "productivity"],
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Nova pesquisa", url: "/pesquisa" },
          { name: "Mapa", url: "/mapa" },
          { name: "Kanban", url: "/kanban" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i, handler: "CacheFirst", options: { cacheName: "fonts", expiration: { maxEntries: 20, maxAgeSeconds: 31536000 } } },
          { urlPattern: /^https:\/\/[abcd]\.basemaps\.cartocdn\.com\/.*/i, handler: "StaleWhileRevalidate", options: { cacheName: "map-tiles", expiration: { maxEntries: 500, maxAgeSeconds: 604800 } } },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes("node_modules")) {
            if (/recharts|d3-/.test(id)) return "charts";
            if (/jspdf|xlsx|html2canvas/.test(id)) return "export";
            if (/leaflet|google-maps|markerclusterer/.test(id)) return "maps";
            if (/supabase/.test(id)) return "supabase";
          }
        },
      },
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
} as any);
