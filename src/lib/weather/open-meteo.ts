import type { WeatherCondition } from "@/lib/three/environment";

export interface LiveWeather {
  condition: WeatherCondition;
  temperature: number; // Celsius
  cloudCoverage: number; // 0-1
}

/**
 * WMO weather codes (used by Open-Meteo's `weather_code` field) mapped onto
 * our five-condition model. Snow codes (71-77, 85-86) fold into "rain" —
 * whether cold-season precipitation renders as rain or snow is decided by
 * the environment engine's `season` field, not the weather condition itself
 * (see rain.tsx/seasonal.tsx), so no dedicated "snow" condition is needed.
 */
const WMO_TO_CONDITION: Record<number, WeatherCondition> = {
  0: "sunny",
  1: "sunny",
  2: "partly-cloudy",
  3: "cloudy",
  45: "cloudy",
  48: "cloudy",
  51: "rain",
  53: "rain",
  55: "rain",
  56: "rain",
  57: "rain",
  61: "rain",
  63: "rain",
  65: "rain",
  66: "rain",
  67: "rain",
  71: "rain",
  73: "rain",
  75: "rain",
  77: "rain",
  80: "rain",
  81: "rain",
  82: "storm",
  85: "rain",
  86: "rain",
  95: "storm",
  96: "storm",
  99: "storm",
};

const FETCH_TIMEOUT_MS = 6000;

/**
 * Open-Meteo's free, no-API-key-required current-weather endpoint — a
 * direct client-side fetch (it's a public CORS-enabled JSON API meant for
 * exactly this), so no server round-trip or key management is needed.
 * Returns null on any failure (network, timeout, bad response) so the
 * caller can fall back to the default "sunny" scene without surfacing an error.
 */
export async function fetchCurrentWeather(lat: number, lon: number): Promise<LiveWeather | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,cloud_cover&timezone=auto`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const current = data?.current;
    if (!current || typeof current.weather_code !== "number") return null;

    const condition = WMO_TO_CONDITION[current.weather_code] ?? "sunny";
    const cloudCoverage = typeof current.cloud_cover === "number" ? Math.max(0, Math.min(1, current.cloud_cover / 100)) : 0;
    const temperature = typeof current.temperature_2m === "number" ? current.temperature_2m : 20;

    return { condition, cloudCoverage, temperature };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
