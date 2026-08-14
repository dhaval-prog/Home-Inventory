"use client";

import { useEffect } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { useLiveWeather } from "@/hooks/use-live-weather";
import type { WeatherCondition } from "@/lib/three/environment";

const CONDITION_EMOJI: Record<WeatherCondition, string> = {
  sunny: "☀️",
  "partly-cloudy": "⛅",
  cloudy: "☁️",
  rain: "🌧️",
  storm: "⛈️",
};

/**
 * A small opt-in control overlaid on the 3D home card: tapping it is the
 * only thing that ever triggers a geolocation prompt (section: never on
 * page load without explicit consent). Every non-happy-path state (denied,
 * unsupported, fetch error) degrades to a quiet retry affordance rather than
 * blocking or erroring the scene, which keeps rendering with its default
 * "sunny" weather regardless.
 */
export function LiveWeatherToggle({ onWeatherChange }: { onWeatherChange: (condition: WeatherCondition | undefined) => void }) {
  const live = useLiveWeather();
  const liveCondition = live.status === "granted" ? live.condition : undefined;

  // Reports the resolved condition up to the parent (which feeds it into
  // the 3D scene) as an effect, not during render — calling a parent
  // setState synchronously mid-render is exactly what useEffect avoids here.
  useEffect(() => {
    onWeatherChange(liveCondition);
  }, [liveCondition, onWeatherChange]);

  if (live.status === "unsupported") return null;

  if (live.status === "granted" && live.condition) {
    return (
      <button
        type="button"
        onClick={live.disable}
        title="Using your local weather — tap to turn off"
        className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-xs font-medium text-[#0b0b14] shadow-sm backdrop-blur-sm hover:bg-white/85"
      >
        <span>{CONDITION_EMOJI[live.condition]}</span>
        {typeof live.temperature === "number" && <span>{Math.round(live.temperature)}°C</span>}
      </button>
    );
  }

  if (live.status === "requesting") {
    return (
      <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-xs font-medium text-[#0b0b14]/60 backdrop-blur-sm">
        <Loader2 className="size-3 animate-spin" />
        Locating…
      </span>
    );
  }

  const label = live.status === "denied" ? "Enable location" : live.status === "error" ? "Retry weather" : "Use my weather";

  return (
    <button
      type="button"
      onClick={live.enable}
      className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1.5 text-xs font-medium text-[#0b0b14]/70 shadow-sm backdrop-blur-sm hover:bg-white/80"
    >
      <MapPin className="size-3" />
      {label}
    </button>
  );
}
