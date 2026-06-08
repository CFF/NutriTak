import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      // Local dev proxy for USDA FoodData Central — mirrors api/fdc.js for Vercel
      {
        name: "fdc-dev-proxy",
        configureServer(server) {
          server.middlewares.use("/api/fdc", async (req, res) => {
            try {
              const qs = new URLSearchParams(req.url?.split("?")[1] || "");
              const query = qs.get("query") || "";
              if (!query) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Missing query" }));
              }
              const apiKey = env.USDA_FDC_API_KEY || "DEMO_KEY";
              const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
              url.searchParams.set("query", query);
              url.searchParams.set("pageSize", "5");
              url.searchParams.set("dataType", "Branded,Foundation,SR Legacy");
              url.searchParams.set("api_key", apiKey);

              const upstream = await fetch(url.toString());
              const data = await upstream.json();

              const results = (data.foods || []).slice(0, 5).map(food => {
                const getNutrient = (id) => {
                  const n = food.foodNutrients?.find(n => n.nutrientId === id);
                  return Math.round(n?.value || 0);
                };
                const isBranded = food.dataType === "Branded";
                const serving = isBranded && food.servingSize
                  ? `${food.servingSize}${food.servingSizeUnit || "g"}`
                  : "100g";
                return {
                  fdcId: food.fdcId,
                  name: food.description,
                  brand: isBranded ? (food.brandOwner || food.brandName || null) : "Generic",
                  calories: getNutrient(1008),
                  protein: getNutrient(1003),
                  carbs: getNutrient(1005),
                  fats: getNutrient(1004),
                  serving,
                };
              });

              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ results }));
            } catch (err) {
              console.error("FDC dev proxy error:", err);
              res.writeHead(502, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "FDC request failed" }));
            }
          });
        },
      },
    ],
    server: {
      host: true,
      proxy: {
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
