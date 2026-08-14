"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { computeEnvironmentTarget, type EnvironmentTarget, type Season, type WeatherReading } from "@/lib/three/environment";

const LERP_RATE = 0.55; // fraction closed per ~frame at 60fps — smooths without feeling laggy
// The target only depends on wall-clock time, which barely moves frame to
// frame — recomputing it (several Color allocations) a few times a second
// is plenty; the cheap per-frame lerp is what actually needs to run every tick.
const RECOMPUTE_INTERVAL = 0.35;

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function overrideDate(hourOverride?: number): Date {
  if (hourOverride === undefined) return new Date();
  const d = new Date();
  d.setHours(Math.floor(hourOverride), Math.round((hourOverride % 1) * 60), 0, 0);
  return d;
}

/**
 * Maintains a smoothed "current" EnvironmentTarget that gradually eases
 * toward the real-time-computed target instead of ever snapping a value
 * (section 23). Returns a ref, not React state — consumers read it inside
 * their own useFrame so updating it never triggers a React re-render.
 */
function applySeasonOverride(target: EnvironmentTarget, seasonOverride?: Season): EnvironmentTarget {
  if (seasonOverride) target.season = seasonOverride;
  return target;
}

export function useEnvironment(weather: WeatherReading, timeOverrideHour?: number, seasonOverride?: Season) {
  const initial = useMemo(
    () => applySeasonOverride(computeEnvironmentTarget(overrideDate(timeOverrideHour), weather), seasonOverride),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const current = useRef<EnvironmentTarget>(initial);
  const target = useRef<EnvironmentTarget>(initial);
  const sinceRecompute = useRef(RECOMPUTE_INTERVAL); // recompute immediately on first frame

  useFrame((_, delta) => {
    sinceRecompute.current += delta;
    if (sinceRecompute.current >= RECOMPUTE_INTERVAL) {
      sinceRecompute.current = 0;
      target.current = applySeasonOverride(computeEnvironmentTarget(overrideDate(timeOverrideHour), weather), seasonOverride);
    }

    const t = clampLerpT(1 - Math.pow(1 - LERP_RATE, delta * 60));
    const c = current.current;
    const g = target.current;

    c.hour = g.hour;
    c.isNight = g.isNight;
    c.season = g.season;
    c.dayAmount = lerpNum(c.dayAmount, g.dayAmount, t);
    c.nightAmount = lerpNum(c.nightAmount, g.nightAmount, t);
    c.windStrength = lerpNum(c.windStrength, g.windStrength, t);
    c.sunElevation = lerpNum(c.sunElevation, g.sunElevation, t);
    c.sunAzimuth = lerpNum(c.sunAzimuth, g.sunAzimuth, t);
    c.sunDirection[0] = lerpNum(c.sunDirection[0], g.sunDirection[0], t);
    c.sunDirection[1] = lerpNum(c.sunDirection[1], g.sunDirection[1], t);
    c.sunDirection[2] = lerpNum(c.sunDirection[2], g.sunDirection[2], t);
    c.sunIntensity = lerpNum(c.sunIntensity, g.sunIntensity, t);
    c.sunColor.lerp(g.sunColor, t);
    c.moonIntensity = lerpNum(c.moonIntensity, g.moonIntensity, t);
    c.ambientIntensity = lerpNum(c.ambientIntensity, g.ambientIntensity, t);
    c.hemiSkyColor.lerp(g.hemiSkyColor, t);
    c.hemiGroundColor.lerp(g.hemiGroundColor, t);
    c.skyTopColor.lerp(g.skyTopColor, t);
    c.skyHorizonColor.lerp(g.skyHorizonColor, t);
    c.fogColor.lerp(g.fogColor, t);
    c.fogNearFactor = lerpNum(c.fogNearFactor, g.fogNearFactor, t);
    c.fogFarFactor = lerpNum(c.fogFarFactor, g.fogFarFactor, t);
    c.starOpacity = lerpNum(c.starOpacity, g.starOpacity, t);
    c.moonOpacity = lerpNum(c.moonOpacity, g.moonOpacity, t);
    c.cloudCoverage = lerpNum(c.cloudCoverage, g.cloudCoverage, t);
    c.cloudOpacity = lerpNum(c.cloudOpacity, g.cloudOpacity, t);
    c.cloudColor.lerp(g.cloudColor, t);
    c.cloudDarkColor.lerp(g.cloudDarkColor, t);
    c.rainIntensity = lerpNum(c.rainIntensity, g.rainIntensity, t);
    c.lightningEnabled = g.lightningEnabled;
    c.houseLightIntensity = lerpNum(c.houseLightIntensity, g.houseLightIntensity, t);
    c.outdoorLightIntensity = lerpNum(c.outdoorLightIntensity, g.outdoorLightIntensity, t);
    c.groundWetness = lerpNum(c.groundWetness, g.groundWetness, t);
    c.bgColor.lerp(g.bgColor, t);
  });

  return current;
}

function clampLerpT(t: number): number {
  return Math.max(0, Math.min(1, t));
}
