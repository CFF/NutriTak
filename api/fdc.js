// Vercel serverless function — proxies USDA FoodData Central search.
// The API key is injected server-side and never exposed to the browser.

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const query = req.query?.query || "";
  if (!query) return res.status(400).json({ error: "Missing query" });

  const apiKey = process.env.USDA_FDC_API_KEY || "DEMO_KEY";

  try {
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

    return res.status(200).json({ results });
  } catch (err) {
    console.error("FDC proxy error:", err);
    return res.status(502).json({ error: "FDC request failed" });
  }
}
