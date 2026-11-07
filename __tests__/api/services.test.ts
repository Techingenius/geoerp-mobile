import { act, waitFor } from "@testing-library/react-native";
import {
  argsOf,
  createSupabaseMock,
  type SupabaseMock,
} from "../helpers/supabase-mock";
import { renderQueryHook } from "../helpers/render-query-hook";

let mock: SupabaseMock;

jest.mock("../../lib/supabase/client", () => ({
  get supabase() {
    return mock.supabase;
  },
}));

/**
 * `new File(uri).bytes()` is the Expo SDK 54+ file API. The hooks only ever
 * read bytes to hand them to Storage, so the stub returns the uri as bytes:
 * that makes it visible in an assertion which photo was uploaded where.
 */
jest.mock("expo-file-system", () => ({
  File: class {
    uri: string;

    constructor(uri: string) {
      this.uri = uri;
    }

    async bytes() {
      return `bytes:${this.uri}`;
    }
  },
}));

import {
  getPhotoUrl,
  useAddServicePhotos,
  useCreateService,
  useServicePhotos,
  useUpdateServiceStatus,
} from "../../lib/api/services";

const FROZEN_NOW = 1762000000000;

const photo = {
  uri: "file:///tmp/foto.jpg",
  filename: "foto.jpg",
  mimeType: "image/jpeg",
};

const createInput = {
  project_id: "project-1",
  service_type: "gas",
  latitude: 10.5,
  longitude: -66.9,
  photos: [],
};

beforeEach(() => {
  jest.spyOn(Date, "now").mockReturnValue(FROZEN_NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useCreateService", () => {
  it("refuses to write anything without a session", async () => {
    mock = createSupabaseMock({ user: null });

    const { result } = await renderQueryHook(() => useCreateService());

    await act(async () => {
      await expect(result.current.mutateAsync(createInput)).rejects.toThrow(
        "No hay sesión activa",
      );
    });

    expect(mock.supabase.from).not.toHaveBeenCalled();
  });

  it.each([
    ["the profile read fails", { error: new Error("rls") }],
    ["the profile is missing", { data: null }],
    ["the profile has no organization", { data: { organization_id: null } }],
  ])("stops before the insert when %s", async (_label, profile) => {
    mock = createSupabaseMock({ tables: { user_profiles: profile } });

    const { result } = await renderQueryHook(() => useCreateService());

    await act(async () => {
      await expect(result.current.mutateAsync(createInput)).rejects.toThrow(
        "No se pudo obtener la organización del usuario",
      );
    });

    expect(mock.on("services")).toHaveLength(0);
  });

  it("writes longitude before latitude in the PostGIS point", async () => {
    mock = createSupabaseMock({
      tables: {
        user_profiles: { data: { organization_id: "org-1" } },
        services: { data: { id: "svc-1" } },
      },
    });

    const { result } = await renderQueryHook(() => useCreateService());
    await act(async () => {
      await result.current.mutateAsync(createInput);
    });

    const inserted = argsOf(mock.only("services"), "insert")?.[0] as Record<
      string,
      unknown
    >;
    // GeoJSON is [lng, lat] but react-native-maps is { latitude, longitude }.
    // Swapping these two numbers is how markers end up in the ocean.
    expect(inserted.geometry).toBe("SRID=4326;POINT(-66.9 10.5)");
  });

  it("opens a service at to_open, scoped to the project, stamped with the author", async () => {
    mock = createSupabaseMock({
      user: { id: "user-9" },
      tables: {
        user_profiles: { data: { organization_id: "org-1" } },
        services: { data: { id: "svc-1" } },
      },
    });

    const { result } = await renderQueryHook(() => useCreateService());
    await act(async () => {
      await result.current.mutateAsync({ ...createInput, notes: "al borde" });
    });

    expect(argsOf(mock.only("services"), "insert")?.[0]).toEqual({
      project_id: "project-1",
      line_segment_id: null,
      service_type: "gas",
      notes: "al borde",
      status: "to_open",
      geometry: "SRID=4326;POINT(-66.9 10.5)",
      created_by: "user-9",
    });
  });

  it("stores a photo under org/project/service and geotags the row", async () => {
    mock = createSupabaseMock({
      user: { id: "user-9" },
      tables: {
        user_profiles: { data: { organization_id: "org-1" } },
        services: { data: { id: "svc-1" } },
        service_photos: {},
      },
      uploads: { "service-photos": {} },
    });

    const { result } = await renderQueryHook(() => useCreateService());
    await act(async () => {
      await result.current.mutateAsync({ ...createInput, photos: [photo] });
    });

    const path = `org-1/project-1/svc-1/${FROZEN_NOW}_foto.jpg`;
    expect(mock.uploads).toEqual([
      {
        bucket: "service-photos",
        path,
        body: "bytes:file:///tmp/foto.jpg",
        options: { contentType: "image/jpeg" },
      },
    ]);
    expect(argsOf(mock.only("service_photos"), "insert")?.[0]).toEqual({
      service_id: "svc-1",
      storage_path: path,
      filename: "foto.jpg",
      photo_type: "evidence",
      taken_at: expect.any(String),
      location: "SRID=4326;POINT(-66.9 10.5)",
      uploaded_by: "user-9",
    });
  });

  it("reports a failed upload in Spanish and keeps the storage error", async () => {
    mock = createSupabaseMock({
      tables: {
        user_profiles: { data: { organization_id: "org-1" } },
        services: { data: { id: "svc-1" } },
      },
      uploads: { "service-photos": { error: { message: "Payload too large" } } },
    });

    const { result } = await renderQueryHook(() => useCreateService());

    await act(async () => {
      await expect(
        result.current.mutateAsync({ ...createInput, photos: [photo] }),
      ).rejects.toThrow("Error subiendo foto: Payload too large");
    });

    expect(mock.on("service_photos")).toHaveLength(0);
  });
});

describe("useServicePhotos", () => {
  it("does not query without a service id", async () => {
    mock = createSupabaseMock();

    const { result } = await renderQueryHook(() => useServicePhotos(undefined));

    expect(result.current.fetchStatus).toBe("idle");
    expect(mock.supabase.from).not.toHaveBeenCalled();
  });

  it("returns an empty list when PostgREST answers with null data", async () => {
    mock = createSupabaseMock({ tables: { service_photos: { data: null } } });

    const { result } = await renderQueryHook(() => useServicePhotos("svc-1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
    expect(argsOf(mock.only("service_photos"), "eq")).toEqual([
      "service_id",
      "svc-1",
    ]);
  });
});

describe("getPhotoUrl", () => {
  it("resolves a storage path to its public url", () => {
    mock = createSupabaseMock({ publicUrl: "https://cdn.test/foto.jpg" });

    expect(getPhotoUrl("org-1/project-1/svc-1/foto.jpg")).toBe(
      "https://cdn.test/foto.jpg",
    );
    expect(mock.supabase.storage.from).toHaveBeenCalledWith("service-photos");
  });
});

describe("useUpdateServiceStatus", () => {
  const statusInput = {
    serviceId: "svc-1",
    status: "found" as const,
    photos: [],
  };

  it("refuses to write anything without a session", async () => {
    mock = createSupabaseMock({ user: null });

    const { result } = await renderQueryHook(() => useUpdateServiceStatus());

    await act(async () => {
      await expect(result.current.mutateAsync(statusInput)).rejects.toThrow(
        "No hay sesión activa",
      );
    });

    expect(mock.supabase.from).not.toHaveBeenCalled();
  });

  it("stops before the update when the profile has no organization", async () => {
    mock = createSupabaseMock({
      tables: { user_profiles: { data: { organization_id: null } } },
    });

    const { result } = await renderQueryHook(() => useUpdateServiceStatus());

    await act(async () => {
      await expect(result.current.mutateAsync(statusInput)).rejects.toThrow(
        "No se pudo obtener la organización del usuario",
      );
    });

    expect(mock.on("services")).toHaveLength(0);
  });

  it.each([
    ["the lookup fails", { error: new Error("rls") }],
    ["the service is gone", { data: null }],
  ])("stops before the update when %s", async (_label, service) => {
    mock = createSupabaseMock({
      tables: {
        user_profiles: { data: { organization_id: "org-1" } },
        services: service,
      },
    });

    const { result } = await renderQueryHook(() => useUpdateServiceStatus());

    await act(async () => {
      await expect(result.current.mutateAsync(statusInput)).rejects.toThrow(
        "Servicio no encontrado",
      );
    });

    // Only the lookup ran; nothing was written.
    expect(mock.on("services")).toHaveLength(1);
  });

  it("writes the new status and the operator who opened it", async () => {
    mock = createSupabaseMock({
      user: { id: "user-9" },
      tables: {
        user_profiles: { data: { organization_id: "org-1" } },
        services: [
          { data: { project_id: "project-1" } },
          { data: { id: "svc-1", status: "found" } },
        ],
      },
    });

    const { result } = await renderQueryHook(() => useUpdateServiceStatus());
    await act(async () => {
      await result.current.mutateAsync({ ...statusInput, notes: "localizado" });
    });

    const [, update] = mock.on("services");
    expect(argsOf(update, "update")?.[0]).toEqual({
      status: "found",
      opened_by: "user-9",
      notes: "localizado",
    });
    expect(argsOf(update, "eq")).toEqual(["id", "svc-1"]);
  });

  it.each([
    ["not_found", "not_found_proof"],
    ["found", "status_change"],
    ["to_open", "status_change"],
  ] as const)(
    "files a %s transition photo as %s",
    async (status, expectedType) => {
      mock = createSupabaseMock({
        user: { id: "user-9" },
        tables: {
          user_profiles: { data: { organization_id: "org-1" } },
          services: [
            { data: { project_id: "project-1" } },
            { data: { id: "svc-1" } },
          ],
          service_photos: {},
        },
        uploads: { "service-photos": {} },
      });

      const { result } = await renderQueryHook(() => useUpdateServiceStatus());
      await act(async () => {
        await result.current.mutateAsync({
          serviceId: "svc-1",
          status,
          photos: [photo],
          notes: "evidencia",
        });
      });

      // A `not_found` claim is the one a client disputes, so its photo is
      // filed as proof rather than as an ordinary status change.
      expect(argsOf(mock.only("service_photos"), "insert")?.[0]).toEqual({
        service_id: "svc-1",
        storage_path: `org-1/project-1/svc-1/${FROZEN_NOW}_foto.jpg`,
        filename: "foto.jpg",
        photo_type: expectedType,
        service_status: status,
        caption: "evidencia",
        taken_at: expect.any(String),
        uploaded_by: "user-9",
      });
    },
  );

  it("reports a failed transition upload in Spanish", async () => {
    mock = createSupabaseMock({
      tables: {
        user_profiles: { data: { organization_id: "org-1" } },
        services: [
          { data: { project_id: "project-1" } },
          { data: { id: "svc-1" } },
        ],
      },
      uploads: { "service-photos": { error: { message: "offline" } } },
    });

    const { result } = await renderQueryHook(() => useUpdateServiceStatus());

    await act(async () => {
      await expect(
        result.current.mutateAsync({ ...statusInput, photos: [photo] }),
      ).rejects.toThrow("Error subiendo foto: offline");
    });
  });
});

describe("useAddServicePhotos", () => {
  const addInput = { serviceId: "svc-1", photos: [photo] };

  it("refuses to write anything without a session", async () => {
    mock = createSupabaseMock({ user: null });

    const { result } = await renderQueryHook(() => useAddServicePhotos());

    await act(async () => {
      await expect(result.current.mutateAsync(addInput)).rejects.toThrow(
        "No hay sesión activa",
      );
    });

    expect(mock.supabase.from).not.toHaveBeenCalled();
  });

  it("stops before uploading when the profile has no organization", async () => {
    mock = createSupabaseMock({
      tables: { user_profiles: { data: { organization_id: null } } },
    });

    const { result } = await renderQueryHook(() => useAddServicePhotos());

    await act(async () => {
      await expect(result.current.mutateAsync(addInput)).rejects.toThrow(
        "No se pudo obtener la organización del usuario",
      );
    });

    expect(mock.uploads).toEqual([]);
  });

  it("stops before uploading when the service is gone", async () => {
    mock = createSupabaseMock({
      tables: {
        user_profiles: { data: { organization_id: "org-1" } },
        services: { data: null },
      },
    });

    const { result } = await renderQueryHook(() => useAddServicePhotos());

    await act(async () => {
      await expect(result.current.mutateAsync(addInput)).rejects.toThrow(
        "Servicio no encontrado",
      );
    });

    expect(mock.uploads).toEqual([]);
  });

  it("tags an extra photo as evidence carrying the service's current status", async () => {
    mock = createSupabaseMock({
      user: { id: "user-9" },
      tables: {
        user_profiles: { data: { organization_id: "org-1" } },
        services: { data: { project_id: "project-1", status: "found" } },
        service_photos: {},
      },
      uploads: { "service-photos": {} },
    });

    const { result } = await renderQueryHook(() => useAddServicePhotos());
    await act(async () => {
      await result.current.mutateAsync({ ...addInput, caption: "empalme" });
    });

    expect(argsOf(mock.only("service_photos"), "insert")?.[0]).toEqual({
      service_id: "svc-1",
      storage_path: `org-1/project-1/svc-1/${FROZEN_NOW}_foto.jpg`,
      filename: "foto.jpg",
      photo_type: "evidence",
      service_status: "found",
      caption: "empalme",
      taken_at: expect.any(String),
      uploaded_by: "user-9",
    });
  });

  it("surfaces a failed service_photos insert", async () => {
    mock = createSupabaseMock({
      tables: {
        user_profiles: { data: { organization_id: "org-1" } },
        services: { data: { project_id: "project-1", status: "found" } },
        service_photos: { error: new Error("service_photos denied") },
      },
      uploads: { "service-photos": {} },
    });

    const { result } = await renderQueryHook(() => useAddServicePhotos());

    await act(async () => {
      await expect(result.current.mutateAsync(addInput)).rejects.toThrow(
        "service_photos denied",
      );
    });
  });
});
