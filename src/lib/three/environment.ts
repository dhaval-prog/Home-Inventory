import { Color } from "three";

export type WeatherCondition = "sunny" | "partly-cloudy" | "cloudy" | "rain" | "storm";

export type Season = "winter" | "spring" | "summer" | "autumn";

/**
 * Calendar month -> meteorological season. Northern-hemisphere default (no
 * geolocation dependency just for this) — matches the original design's
 * `{ timeOfDay, weather, season, ... }` state shape. Stable for the whole
 * session (seasons don't change minute to minute), so unlike time-of-day
 * this never needs smoothing/lerping.
 */
export function computeSeason(date: Date): Season {
  const month = date.getMonth(); // 0-11
  if (month === 11 || month === 0 || month === 1) return "winter";
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  return "autumn";
}

/**
 * Clean external-data interface (section 22): if/when the app connects a
 * real weather API, map its response into this shape. Everything below
 * derives purely from `condition` plus the current time — no visual logic
 * is hard-coded to a specific provider's payload.
 */
export interface WeatherReading {
  condition: WeatherCondition;
  cloudCoverage?: number; // 0-1, overrides the condition's default if provided
}

export interface EnvironmentTarget {
  /** Decimal hour 0-24 used to derive this target (for reference/debugging). */
  hour: number;
  isNight: boolean;
  season: Season;
  /** Continuous 0 (night) .. 1 (full day) — drives butterfly/dog/streetlight fades smoothly, unlike the binary isNight flag. */
  dayAmount: number;
  /** Continuous 0 (day) .. 1 (deep night) — drives firefly/star/moon-adjacent fades. */
  nightAmount: number;
  /** 0-1 global wind scalar (calm sunny days low, storms high) — trees/grass/butterflies/clouds/rain all read this one value so wind cohesively picks up together. */
  windStrength: number;
  /** -1 (midnight) .. 1 (solar noon), 0 at sunrise/sunset. */
  sunElevation: number;
  sunAzimuth: number;
  sunDirection: [number, number, number];
  sunIntensity: number;
  sunColor: Color;
  moonIntensity: number;
  ambientIntensity: number;
  hemiSkyColor: Color;
  hemiGroundColor: Color;
  skyTopColor: Color;
  skyHorizonColor: Color;
  fogColor: Color;
  fogNearFactor: number;
  fogFarFactor: number;
  starOpacity: number;
  moonOpacity: number;
  cloudCoverage: number;
  cloudOpacity: number;
  cloudColor: Color;
  cloudDarkColor: Color;
  rainIntensity: number; // 0-1
  lightningEnabled: boolean;
  houseLightIntensity: number; // 0-1, warm interior glow
  outdoorLightIntensity: number; // 0-1, path/garden lights
  groundWetness: number; // 0-1
  bgColor: Color;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Smooth 0..1 ease between edge0 and edge1 (classic smoothstep). */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mixColor(a: string, b: string, t: number): Color {
  return new Color(a).lerp(new Color(b), clamp01(t));
}

const WEATHER_DEFAULTS: Record<WeatherCondition, { cloudCoverage: number; rain: number; lightning: boolean }> = {
  sunny: { cloudCoverage: 0.08, rain: 0, lightning: false },
  "partly-cloudy": { cloudCoverage: 0.38, rain: 0, lightning: false },
  cloudy: { cloudCoverage: 0.8, rain: 0, lightning: false },
  rain: { cloudCoverage: 0.88, rain: 0.65, lightning: false },
  storm: { cloudCoverage: 0.97, rain: 1, lightning: true },
};

/**
 * Pure function: today's real time (or an override, for testing/preview) plus
 * a weather reading -> every visual parameter the scene needs. No component
 * state, no side effects — the smoothing hook (use-environment.ts) is what
 * turns this into gradually-changing values frame to frame.
 */
export function computeEnvironmentTarget(date: Date, weather: WeatherReading): EnvironmentTarget {
  const hour = date.getHours() + date.getMinutes() / 60;
  const season = computeSeason(date);

  // Single continuous sine spanning the full day: 0 at sunrise (6:00) and
  // sunset (18:00), +1 at solar noon, -1 at midnight. Everything else
  // (sky color, sun intensity, night flags) derives from this one curve so
  // there's no seam between "day" and "night" as discrete states.
  const sunElevation = Math.sin((2 * Math.PI * (hour - 6)) / 24);
  const sunAzimuth = (hour / 24) * Math.PI * 2;

  const elevationAngle = sunElevation * (Math.PI / 2);
  const horiz = Math.cos(elevationAngle);
  const sunDirection: [number, number, number] = [
    horiz * Math.cos(sunAzimuth),
    Math.sin(elevationAngle),
    horiz * Math.sin(sunAzimuth),
  ];

  const isNight = sunElevation < -0.12;
  const dayAmount = smoothstep(-0.1, 0.25, sunElevation); // 0 at/below horizon, 1 once well up
  const goldenAmount = smoothstep(-0.15, 0.15, sunElevation) * (1 - smoothstep(0.15, 0.45, sunElevation));
  const nightAmount = 1 - smoothstep(-0.2, 0.02, sunElevation);

  const weatherDefaults = WEATHER_DEFAULTS[weather.condition];
  const cloudCoverage = clamp01(weather.cloudCoverage ?? weatherDefaults.cloudCoverage);
  const overcastAmount = smoothstep(0.35, 0.95, cloudCoverage);

  // Sun / moon
  const rawSunIntensity = Math.max(0, sunElevation) ** 0.7;
  const sunIntensity = rawSunIntensity * (1 - overcastAmount * 0.75) * (1 - weatherDefaults.rain * 0.35);
  const sunColor = mixColor("#ffb469", "#fff4de", smoothstep(0, 0.4, sunElevation));
  const moonIntensity = nightAmount * (1 - overcastAmount * 0.6) * 0.28;

  // Sky
  const skyTopColor = mixColor("#050b1f", "#0e1a3d", nightAmount)
    .lerp(mixColor("#7c5fae", "#f2935c", goldenAmount), goldenAmount)
    .lerp(mixColor("#bfe0ff", "#8fbdf0", overcastAmount), dayAmount);
  const skyHorizonColor = mixColor("#141830", "#2a2f52", nightAmount)
    .lerp(new Color("#ffd9a8"), goldenAmount * (1 - overcastAmount * 0.5))
    .lerp(mixColor("#eaf3ff", "#c3cad6", overcastAmount), dayAmount);

  const ambientIntensity = 0.16 + dayAmount * 0.28 + nightAmount * 0.06 + goldenAmount * 0.05 - overcastAmount * 0.05;
  const hemiSkyColor = skyTopColor.clone().lerp(new Color("#ffffff"), 0.2);
  const hemiGroundColor = mixColor("#20242e", "#c9baa3", dayAmount);

  const fogColor = skyHorizonColor.clone();
  const fogNearFactor = 1.1 + overcastAmount * 0.5 + weatherDefaults.rain * 0.6 - dayAmount * 0.15;
  const fogFarFactor = 6 - overcastAmount * 1.5 - weatherDefaults.rain * 2.2;

  const starOpacity = nightAmount * (1 - overcastAmount * 0.85);
  const moonOpacity = nightAmount * (1 - overcastAmount * 0.7);

  const cloudOpacity = 0.35 + cloudCoverage * 0.5;
  const cloudColor = mixColor("#2b2f45", "#ffffff", dayAmount * (1 - overcastAmount * 0.4));
  const cloudDarkColor = mixColor("#12131c", "#7c828f", dayAmount);

  const houseLightIntensity = clamp01(nightAmount * 1.15 + overcastAmount * 0.25 - dayAmount * 0.3);
  const outdoorLightIntensity = clamp01(nightAmount * 1.1 - dayAmount * 0.3);

  const bgColor = skyHorizonColor.clone().lerp(hemiGroundColor, 0.15);

  // One shared wind scalar: mild on a still sunny day, picking up through
  // cloud cover, stronger in rain, strongest in a storm's gusts — every wind-
  // reactive element (trees, grass, butterflies, cloud drift, rain slant)
  // reads this same value so they all pick up together instead of each
  // inventing its own notion of "windy."
  const windStrength = clamp01(0.12 + cloudCoverage * 0.22 + weatherDefaults.rain * 0.35 + (weatherDefaults.lightning ? 0.25 : 0));

  return {
    hour,
    isNight,
    season,
    dayAmount,
    nightAmount,
    windStrength,
    sunElevation,
    sunAzimuth,
    sunDirection,
    sunIntensity,
    sunColor,
    moonIntensity,
    ambientIntensity,
    hemiSkyColor,
    hemiGroundColor,
    skyTopColor,
    skyHorizonColor,
    fogColor,
    fogNearFactor,
    fogFarFactor,
    starOpacity,
    moonOpacity,
    cloudCoverage,
    cloudOpacity,
    cloudColor,
    cloudDarkColor,
    rainIntensity: weatherDefaults.rain,
    lightningEnabled: weatherDefaults.lightning,
    houseLightIntensity,
    outdoorLightIntensity,
    groundWetness: weatherDefaults.rain,
    bgColor,
  };
}
