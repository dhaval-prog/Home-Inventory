"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCurrentWeather } from "@/lib/weather/open-meteo";
import type { WeatherCondition } from "@/lib/three/environment";

const STORAGE_KEY = "home-inventory:live-weather-enabled";
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const GEO_TIMEOUT_MS = 8000;

export type LiveWeatherStatus = "idle" | "requesting" | "granted" | "denied" | "unsupported" | "error";

export interface LiveWeatherState {
  status: LiveWeatherStatus;
  condition?: WeatherCondition;
  temperature?: number;
}

function readStoredPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStoredPreference(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private browsing / storage disabled — live weather just won't persist across reloads.
  }
}

/**
 * Opt-in live weather: the scene defaults to "sunny" and only ever requests
 * geolocation when the user explicitly enables it (never on page load
 * without a prior opt-in), and every failure mode (permission denied, no
 * geolocation support, network/timeout) falls back to that same default
 * rather than blocking or erroring the 3D scene.
 */
export function useLiveWeather() {
  const [state, setState] = useState<LiveWeatherState>({ status: "idle" });
  const enabledRef = useRef(false);

  const refresh = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "unsupported" });
      return;
    }
    setState((s) => ({ ...s, status: "requesting" }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetchCurrentWeather(pos.coords.latitude, pos.coords.longitude).then((weather) => {
          if (!weather) {
            setState({ status: "error" });
            return;
          }
          setState({ status: "granted", condition: weather.condition, temperature: weather.temperature });
        });
      },
      () => {
        enabledRef.current = false;
        writeStoredPreference(false);
        setState({ status: "denied" });
      },
      { timeout: GEO_TIMEOUT_MS, maximumAge: 5 * 60 * 1000 }
    );
  }, []);

  const enable = useCallback(() => {
    enabledRef.current = true;
    writeStoredPreference(true);
    refresh();
  }, [refresh]);

  const disable = useCallback(() => {
    enabledRef.current = false;
    writeStoredPreference(false);
    setState({ status: "idle" });
  }, []);

  // Resume automatically on remount if the user opted in previously —
  // geolocation permission is already granted at this point, so this is a
  // silent refresh, not a new prompt.
  useEffect(() => {
    if (readStoredPreference()) {
      enabledRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.status !== "granted") return;
    const id = setInterval(() => {
      if (enabledRef.current) refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [state.status, refresh]);

  return { ...state, enable, disable };
}
