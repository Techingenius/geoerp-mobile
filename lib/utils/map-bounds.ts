/**
 * Geographic bounds helpers for the project map (GRA-1140).
 *
 * A project has no center of its own in the database — `projects` carries no
 * geometry column — so "the center of the project" is derived from what the
 * project actually covers on the ground: its line segments and its services.
 *
 * The result is a region rather than a `fitToCoordinates` call because
 * `animateToRegion` behaves the same on Apple Maps and Google Maps, while
 * `fitToCoordinates`' `edgePadding` is interpreted in different units on each
 * platform and collapses to maximum zoom when every coordinate is identical.
 */

import type { LineSegment, Service } from "../../types/database";

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface MapRegion extends LatLng {
  latitudeDelta: number;
  longitudeDelta: number;
}

/**
 * Smallest span a derived region may have, in degrees (~450 m of latitude).
 * Keeps a single-service project — or a segment whose coordinates are all the
 * same point — from animating to street-tile zoom with nothing around it.
 */
export const MIN_REGION_DELTA = 0.004;

/** Extra room around the bounding box so pins are not flush with the edges. */
export const REGION_PADDING_FACTOR = 1.4;

/**
 * PostGIS geometry arrives as `unknown` through the Supabase client and the
 * casts in `lib/api` are assertions, not checks: a row written by an older
 * migration can still carry `null` or a half-built coordinate pair. Anything
 * that is not a usable WGS84 pair is dropped instead of poisoning the average.
 */
function isValidCoordinate(coord: unknown): coord is [number, number] {
  if (!Array.isArray(coord) || coord.length < 2) return false;
  const [lng, lat] = coord;
  return (
    typeof lng === "number" &&
    typeof lat === "number" &&
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** GeoJSON stores `[longitude, latitude]`; react-native-maps wants the pair named. */
function toLatLng(coord: [number, number]): LatLng {
  return { latitude: coord[1], longitude: coord[0] };
}

/**
 * Every coordinate the project map draws: segment vertices plus service points.
 */
export function collectProjectCoordinates(
  segments: LineSegment[] | undefined,
  services: Service[] | undefined
): LatLng[] {
  const coordinates: LatLng[] = [];

  for (const segment of segments ?? []) {
    for (const coord of segment.geometry?.coordinates ?? []) {
      if (isValidCoordinate(coord)) coordinates.push(toLatLng(coord));
    }
  }

  for (const service of services ?? []) {
    const coord = service.geometry?.coordinates;
    if (isValidCoordinate(coord)) coordinates.push(toLatLng(coord));
  }

  return coordinates;
}

/**
 * Region that contains every given coordinate, padded and floored at
 * {@link MIN_REGION_DELTA}. `null` when there is nothing to frame.
 */
export function regionFromCoordinates(
  coordinates: LatLng[],
  minDelta: number = MIN_REGION_DELTA
): MapRegion | null {
  if (coordinates.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const { latitude, longitude } of coordinates) {
    if (latitude < minLat) minLat = latitude;
    if (latitude > maxLat) maxLat = latitude;
    if (longitude < minLng) minLng = longitude;
    if (longitude > maxLng) maxLng = longitude;
  }

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * REGION_PADDING_FACTOR, minDelta),
    longitudeDelta: Math.max((maxLng - minLng) * REGION_PADDING_FACTOR, minDelta),
  };
}

/**
 * The region the "Centrar proyecto" control animates to. `null` means the
 * project has no geometry yet and the control is not rendered at all — the
 * field rule is to hide what cannot succeed rather than let it fail silently.
 */
export function projectMapRegion(
  segments: LineSegment[] | undefined,
  services: Service[] | undefined
): MapRegion | null {
  return regionFromCoordinates(collectProjectCoordinates(segments, services));
}
