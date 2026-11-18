import {
  MIN_REGION_DELTA,
  collectProjectCoordinates,
  projectMapRegion,
  regionFromCoordinates,
} from "../../lib/utils/map-bounds";
import type { LineSegment, Service } from "../../types/database";

/** Only the fields the helpers read; the rest of the row is irrelevant here. */
function segment(coordinates: unknown): LineSegment {
  return { id: "seg", geometry: { type: "LineString", coordinates } } as unknown as LineSegment;
}

function service(coordinates: unknown): Service {
  return { id: "svc", geometry: { type: "Point", coordinates } } as unknown as Service;
}

describe("collectProjectCoordinates", () => {
  it("reads segment vertices and service points as { latitude, longitude }", () => {
    const coords = collectProjectCoordinates(
      [segment([[-110.97, 29.1], [-110.96, 29.11]])],
      [service([-110.95, 29.12])]
    );

    expect(coords).toEqual([
      { latitude: 29.1, longitude: -110.97 },
      { latitude: 29.11, longitude: -110.96 },
      { latitude: 29.12, longitude: -110.95 },
    ]);
  });

  it("returns nothing when the project has no geometry at all", () => {
    expect(collectProjectCoordinates(undefined, undefined)).toEqual([]);
    expect(collectProjectCoordinates([], [])).toEqual([]);
    expect(collectProjectCoordinates([segment([])], [])).toEqual([]);
  });

  it("drops rows whose geometry is missing or malformed", () => {
    const coords = collectProjectCoordinates(
      [
        { id: "no-geometry" } as unknown as LineSegment,
        segment([["-110.97", 29.1], [-110.96], [Number.NaN, 29.1], [-110.96, 29.11]]),
      ],
      [
        { id: "no-geometry" } as unknown as Service,
        service(null),
        service([-200, 29.12]),
        service([-110.95, 95]),
        service([-110.95, 29.12]),
      ]
    );

    expect(coords).toEqual([
      { latitude: 29.11, longitude: -110.96 },
      { latitude: 29.12, longitude: -110.95 },
    ]);
  });
});

describe("regionFromCoordinates", () => {
  it("centers the bounding box and pads it", () => {
    const region = regionFromCoordinates([
      { latitude: 29.0, longitude: -111.0 },
      { latitude: 29.2, longitude: -110.8 },
    ]);

    expect(region).not.toBeNull();
    expect(region!.latitude).toBeCloseTo(29.1, 10);
    expect(region!.longitude).toBeCloseTo(-110.9, 10);
    // 0.2 degrees of span, padded by 1.4.
    expect(region!.latitudeDelta).toBeCloseTo(0.28, 10);
    expect(region!.longitudeDelta).toBeCloseTo(0.28, 10);
  });

  it("floors the span so a single point does not animate to maximum zoom", () => {
    const region = regionFromCoordinates([{ latitude: 29.1, longitude: -110.97 }]);

    expect(region).toEqual({
      latitude: 29.1,
      longitude: -110.97,
      latitudeDelta: MIN_REGION_DELTA,
      longitudeDelta: MIN_REGION_DELTA,
    });
  });

  it("floors each axis independently, so a straight segment still frames", () => {
    const region = regionFromCoordinates([
      { latitude: 29.1, longitude: -111.0 },
      { latitude: 29.1, longitude: -110.8 },
    ]);

    expect(region!.latitudeDelta).toBe(MIN_REGION_DELTA);
    expect(region!.longitudeDelta).toBeCloseTo(0.28, 10);
  });

  it("has no region for an empty coordinate list", () => {
    expect(regionFromCoordinates([])).toBeNull();
  });
});

describe("projectMapRegion", () => {
  it("frames every segment and service of the project", () => {
    const region = projectMapRegion(
      [segment([[-111.0, 29.0], [-110.9, 29.1]])],
      [service([-110.8, 29.2])]
    );

    expect(region!.latitude).toBeCloseTo(29.1, 10);
    expect(region!.longitude).toBeCloseTo(-110.9, 10);
    expect(region!.latitudeDelta).toBeCloseTo(0.28, 10);
  });

  it("is null when the project has nothing on the map, so the control hides", () => {
    expect(projectMapRegion([], [])).toBeNull();
    expect(projectMapRegion(undefined, undefined)).toBeNull();
  });
});
