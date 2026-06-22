import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    strictPort: true,
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("react-dom")) {
              return "vendor-react";
            }
            if (id.includes("recharts")) {
              return "vendor-charts";
            }
            if (id.includes("jspdf")) {
              return "vendor-pdf";
            }
            if (id.includes("xlsx")) {
              return "vendor-xlsx";
            }
            if (id.includes("react-router")) {
              return "vendor-router";
            }
            return "vendor";
          }
        }
      }
    }
  }
});
