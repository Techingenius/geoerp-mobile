/**
 * The "Centrar proyecto" control on the project map (GRA-1140).
 *
 * `lib/utils/map-bounds` is covered on its own; what this adds is the wiring
 * the unit tests cannot see — that the control is rendered, that pressing it
 * reaches `MapView.mockAnimateToRegion` with the project's region, and that it is
 * absent when the project has nothing to frame.
 */

import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import type { LineSegment, Service } from "../../types/database";

const mockAnimateToRegion = jest.fn();

jest.mock("react-native-maps", () => {
  const RealReact = jest.requireActual("react") as typeof React;
  const { View: RNView } = jest.requireActual("react-native");

  // A class component so the ref the screen holds is the instance itself:
  // `mapRef.current.animateToRegion` is then the method below, which is the
  // call the control has to make.
  class MapView extends RealReact.Component<{ children?: React.ReactNode }> {
    animateToRegion(...args: unknown[]) {
      mockAnimateToRegion(...args);
    }
    render() {
      return RealReact.createElement(RNView, null, this.props.children);
    }
  }

  const passthrough = () => null;
  return { __esModule: true, default: MapView, Marker: passthrough, Polyline: passthrough };
});

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "project-1" }),
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
}));

jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock("../../lib/hooks/use-location", () => ({
  useLocation: () => ({
    // Deliberately far from the project: the control exists because the map
    // opens here, not on the work.
    location: { latitude: 10.49, longitude: -66.92, accuracy: 8, timestamp: 0 },
    error: null,
    isLoading: false,
    refresh: jest.fn(),
  }),
}));

let mockSegments: LineSegment[];
let mockServices: Service[];

jest.mock("../../lib/api/projects", () => ({
  useProject: () => ({ data: { id: "project-1", name: "qa-Proyecto Movil" }, isLoading: false }),
  useProjectSegments: () => ({ data: mockSegments }),
  useProjectServices: () => ({ data: mockServices, error: null }),
}));

jest.mock("../../lib/api/services", () => ({
  useCreateService: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateServiceStatus: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAddServicePhotos: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useServicePhotos: () => ({ data: [] }),
  getPhotoUrl: (path: string) => path,
}));

import ProjectDetailScreen from "../../app/project/[id]";

function segment(coordinates: [number, number][]): LineSegment {
  return { id: "seg", geometry: { type: "LineString", coordinates } } as unknown as LineSegment;
}

function service(coordinates: [number, number]): Service {
  return {
    id: "svc",
    status: "to_open",
    service_type: "gas",
    geometry: { type: "Point", coordinates },
  } as unknown as Service;
}

beforeEach(() => {
  mockAnimateToRegion.mockClear();
  mockSegments = [segment([[-66.88, 10.5], [-66.877, 10.501]])];
  mockServices = [service([-66.8798, 10.5001])];
});

describe("Centrar proyecto", () => {
  it("animates the map to the region that frames the project", async () => {
    const { getByText } = await render(<ProjectDetailScreen />);

    fireEvent.press(getByText("Centrar proyecto"));

    expect(mockAnimateToRegion).toHaveBeenCalledTimes(1);
    const [region] = mockAnimateToRegion.mock.calls[0];
    expect(region.latitude).toBeCloseTo(10.5005, 6);
    expect(region.longitude).toBeCloseTo(-66.8785, 6);
    // Both spans are below the floor for this project, so both are the floor.
    expect(region.latitudeDelta).toBeCloseTo(0.004, 6);
    expect(region.longitudeDelta).toBeCloseTo(0.0042, 6);
  });

  it("is not rendered while the project has no segments and no services", async () => {
    mockSegments = [];
    mockServices = [];

    const { queryByText } = await render(<ProjectDetailScreen />);

    expect(queryByText("Centrar proyecto")).toBeNull();
  });
});
