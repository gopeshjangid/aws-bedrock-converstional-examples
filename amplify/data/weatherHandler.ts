import type { Schema } from "../data/resource";

export const handler: Schema["getWeather"]["functionHandler"] = async (event) => {
  const { city } = event.arguments;
  if (!city?.trim()) throw new Error("city is required");

  // Abort if things hang
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    // 1) Geocode city -> lat/lon (Open-Meteo, no API key needed)
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
      { signal: controller.signal }
    );
    if (!geoRes.ok) throw new Error(`geocode failed: ${geoRes.status}`);
    const geo = await geoRes.json();
    const best = geo?.results?.[0];
    if (!best) throw new Error(`no geocode match for "${city}"`);

    const { latitude, longitude } = best;

    // 2) Get current temperature in °C
    const wRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&timezone=auto`,
      { signal: controller.signal }
    );
    if (!wRes.ok) throw new Error(`weather failed: ${wRes.status}`);
    const w = await wRes.json();

    const tempC = Number(w?.current?.temperature_2m);
    if (!Number.isFinite(tempC)) throw new Error("temperature unavailable");

    // 3) Match your schema exactly
    return {
      value: Math.round(tempC), // integer
      unit: "C",                // or "°C" if you prefer
    };
  } finally {
    clearTimeout(timer);
  }
};
