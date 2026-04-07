import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    server: {
      host: true,
      proxy: {
        // All /api/openrouter requests are forwarded to OpenRouter server-side.
        // The API key is injected here and never sent to the browser.
        "/api/openrouter": {
          target: "https://openrouter.ai",
          changeOrigin: true,
          rewrite: () => "/api/v1/chat/completions",
          headers: {
            "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
            "HTTP-Referer": "http://localhost:5173",
          },
        },
      },
    },
  };
});
