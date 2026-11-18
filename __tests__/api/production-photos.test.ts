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

// `expo-file-system`'s File reads a real URI off the device; here it only has
// to hand the upload some bytes. Kept as a jest.fn so a test can make the read
// itself fail, which is one of the two ways a photo is lost.
//
// `mock`-prefixed because jest.mock factories may not close over anything else.
const mockFileBytes = jest.fn(async () => new Uint8Array([1, 2, 3]));

jest.mock("expo-file-system", () => ({
  File: class {
    bytes() {
      return mockFileBytes();
    }
  },
}));

// Imported after the mocks so the module-level bindings are the stubs.
import {
  BUCKET,
  attachBlockedReason,
  buildProductionPhotoPath,
  canAttachProductionPhoto,
  canRemoveProductionPhoto,
  classifyUploadFailure,
  ProductionPhotoUploadError,
  useDeleteProductionEntryPhoto,
  useProductionEntryPhotos,
  useProductionPhotosByEntries,
  useProductionPhotoUrls,
  useUploadProductionEntryPhotos,
  type ProductionPhotoInput,
  type UploadProductionPhotosInput,
} from "../../lib/api/production-photos";

const ORG = "11111111-1111-1111-1111-111111111111";
const PROJECT = "22222222-2222-2222-2222-222222222222";
const ENTRY = "33333333-3333-3333-3333-333333333333";

const photo: ProductionPhotoInput = {
  uri: "file:///tmp/shot.jpg",
  filename: "shot.jpg",
  mimeType: "image/jpeg",
};

const uploadInput: UploadProductionPhotosInput = {
  entryId: ENTRY,
  projectId: PROJECT,
  photos: [photo],
};

/** A mock whose profile lookup answers with the org the path needs. */
function mockForUpload(
  overrides: Parameters<typeof createSupabaseMock>[0] = {},
) {
  return createSupabaseMock({
    tables: {
      user_profiles: { data: { organization_id: ORG } },
      production_entry_photos: { data: null },
      ...overrides.tables,
    },
    uploads: { [BUCKET]: { error: null }, ...overrides.uploads },
    removals: { [BUCKET]: { error: null }, ...overrides.removals },
    ...overrides,
  });
}

beforeEach(() => {
  mockFileBytes.mockReset();
  mockFileBytes.mockImplementation(async () => new Uint8Array([1, 2, 3]));
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// The object path is a contract with the Storage policies, not a format choice
// ---------------------------------------------------------------------------

describe("buildProductionPhotoPath", () => {
  it("puts org, project and entry in the segments the policies read", () => {
    const path = buildProductionPhotoPath({
      orgId: ORG,
      projectId: PROJECT,
      entryId: ENTRY,
      filename: "shot.jpg",
    });

    const segments = path.split("/");
    // The INSERT policy on storage.objects compares foldername[1] against
    // current_user_org() and passes foldername[3] to
    // can_attach_production_entry_photo. Anything else is a 403, not a typo.
    expect(segments).toHaveLength(4);
    expect(segments[0]).toBe(ORG);
    expect(segments[1]).toBe(PROJECT);
    expect(segments[2]).toBe(ENTRY);
  });

  it("keeps the extension so Storage can serve the right content type", () => {
    const png = buildProductionPhotoPath({
      orgId: ORG,
      projectId: PROJECT,
      entryId: ENTRY,
      filename: "evidencia.PNG",
    });

    expect(png).toMatch(/\.png$/);
  });

  it("falls back to jpg when the camera gives no extension", () => {
    // Android's camera intent routinely returns a name with no suffix.
    const path = buildProductionPhotoPath({
      orgId: ORG,
      projectId: PROJECT,
      entryId: ENTRY,
      filename: "IMG_0001",
    });

    expect(path).toMatch(/\.jpg$/);
  });

  it("never reuses a name, because there is no upsert to fall back on", () => {
    // Two photos from one tap-tap land in the same millisecond, and without an
    // UPDATE policy on storage.objects a collision is a hard 403 on the second
    // file rather than a silent overwrite.
    const names = new Set(
      Array.from({ length: 200 }, () =>
        buildProductionPhotoPath({
          orgId: ORG,
          projectId: PROJECT,
          entryId: ENTRY,
          filename: "shot.jpg",
        }),
      ),
    );

    expect(names.size).toBe(200);
  });

  it("does not leak the original filename into the object name", () => {
    // The row keeps `filename` for display; the object name is generated, so a
    // name with a slash or a space cannot reshape the path the policies parse.
    const path = buildProductionPhotoPath({
      orgId: ORG,
      projectId: PROJECT,
      entryId: ENTRY,
      filename: "../otra org/foto rara.jpg",
    });

    expect(path.split("/")).toHaveLength(4);
    expect(path).not.toContain(" ");
    expect(path).not.toContain("..");
  });
});

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

describe("useUploadProductionEntryPhotos", () => {
  it("uploads to the private bucket without asking for an upsert", async () => {
    mock = mockForUpload();

    const { result } = await renderQueryHook(() =>
      useUploadProductionEntryPhotos(),
    );
    await act(async () => {
      await result.current.mutateAsync(uploadInput);
    });

    expect(mock.uploads).toHaveLength(1);
    expect(mock.uploads[0].bucket).toBe(BUCKET);
    expect(mock.uploads[0].options?.contentType).toBe("image/jpeg");
    // There is no UPDATE policy on storage.objects: `x-upsert` answers 403.
    expect(mock.uploads[0].options?.upsert).toBeUndefined();
  });

  it("writes the row with the same path the object went to", async () => {
    mock = mockForUpload();

    const { result } = await renderQueryHook(() =>
      useUploadProductionEntryPhotos(),
    );
    await act(async () => {
      await result.current.mutateAsync(uploadInput);
    });

    const insert = argsOf(mock.only("production_entry_photos"), "insert")?.[0] as
      | Record<string, unknown>
      | undefined;

    // The table policy and the Storage policy are checked independently; a row
    // whose storage_path points somewhere else is a photo no screen can show.
    expect(insert?.storage_path).toBe(mock.uploads[0].path);
    expect(insert?.production_entry_id).toBe(ENTRY);
    expect(insert?.uploaded_by).toBe("user-1");
    expect(insert?.filename).toBe("shot.jpg");
  });

  it("stamps the GPS fix as longitude-first PostGIS", async () => {
    mock = mockForUpload();

    const { result } = await renderQueryHook(() =>
      useUploadProductionEntryPhotos(),
    );
    await act(async () => {
      await result.current.mutateAsync({
        ...uploadInput,
        photos: [{ ...photo, latitude: 10.5, longitude: -66.9 }],
      });
    });

    const insert = argsOf(mock.only("production_entry_photos"), "insert")?.[0] as
      | Record<string, unknown>
      | undefined;

    // GeoJSON and PostGIS both take longitude first; getting it backwards puts
    // the photo in the Gulf of Guinea.
    expect(insert?.location).toBe("SRID=4326;POINT(-66.9 10.5)");
  });

  it("uploads with a NULL location when there is no fix", async () => {
    mock = mockForUpload();

    const { result } = await renderQueryHook(() =>
      useUploadProductionEntryPhotos(),
    );
    await act(async () => {
      await result.current.mutateAsync(uploadInput);
    });

    const insert = argsOf(mock.only("production_entry_photos"), "insert")?.[0] as
      | Record<string, unknown>
      | undefined;

    // A crew in a trench gets no fix. The photo still has to go up: the GPS
    // must never be what blocks a reporter (GRA-1135).
    expect(insert?.location).toBeNull();
    expect(mock.uploads).toHaveLength(1);
  });

  it("treats a half-sent coordinate as no coordinate", async () => {
    mock = mockForUpload();

    const { result } = await renderQueryHook(() =>
      useUploadProductionEntryPhotos(),
    );
    await act(async () => {
      await result.current.mutateAsync({
        ...uploadInput,
        photos: [{ ...photo, latitude: 10.5, longitude: null }],
      });
    });

    const insert = argsOf(mock.only("production_entry_photos"), "insert")?.[0] as
      | Record<string, unknown>
      | undefined;

    // `POINT(null 10.5)` is not a point; PostGIS would reject the whole row
    // and the photo would be lost over a missing half of a pair.
    expect(insert?.location).toBeNull();
  });

  it("refuses to upload anything without a session", async () => {
    mock = createSupabaseMock({ user: null });

    const { result } = await renderQueryHook(() =>
      useUploadProductionEntryPhotos(),
    );

    await act(async () => {
      await expect(result.current.mutateAsync(uploadInput)).rejects.toThrow(
        "No hay sesión activa",
      );
    });
    expect(mock.uploads).toHaveLength(0);
  });

  it("does not guess the org when the profile lookup fails", async () => {
    mock = createSupabaseMock({
      tables: { user_profiles: { data: null, error: { message: "nope" } } },
    });

    const { result } = await renderQueryHook(() =>
      useUploadProductionEntryPhotos(),
    );

    // The org is the first path segment and the Storage policy compares it to
    // current_user_org(); a guess uploads into another org's folder or 403s.
    await act(async () => {
      await expect(result.current.mutateAsync(uploadInput)).rejects.toThrow(
        "No se pudo obtener la organización del usuario",
      );
    });
    expect(mock.uploads).toHaveLength(0);
  });

  describe("when the upload fails", () => {
    it("reports which photos failed and how many landed", async () => {
      mock = mockForUpload({
        uploads: { [BUCKET]: [{ error: null }, { error: { message: "403" } }] },
      });

      const second = { ...photo, filename: "segunda.jpg" };
      const { result } = await renderQueryHook(() =>
        useUploadProductionEntryPhotos(),
      );

      let outcome: unknown;
      await act(async () => {
        outcome = await result.current
          .mutateAsync({ ...uploadInput, photos: [photo, second] })
          .catch((e) => e);
      });
      const error = outcome as ProductionPhotoUploadError;

      // The entry is already committed by the time any of this runs, so the
      // screen has to be able to say "1 of 2 went up" and retry only the one
      // that did not. Re-sending both would duplicate the first.
      expect(outcome).toBeInstanceOf(ProductionPhotoUploadError);
      expect(error.uploaded).toBe(1);
      expect(error.failed).toEqual([second]);
    });

    it("does not write a row for a photo whose object never arrived", async () => {
      mock = mockForUpload({
        uploads: { [BUCKET]: { error: { message: "403 Unauthorized" } } },
      });

      const { result } = await renderQueryHook(() =>
        useUploadProductionEntryPhotos(),
      );

      await act(async () => {
        await expect(
          result.current.mutateAsync(uploadInput),
        ).rejects.toBeInstanceOf(ProductionPhotoUploadError);
      });
      // A row with no object renders as a permanently broken thumbnail.
      expect(mock.on("production_entry_photos")).toHaveLength(0);
    });

    it("takes the object back out when the row insert is denied", async () => {
      mock = mockForUpload({
        tables: {
          user_profiles: { data: { organization_id: ORG } },
          production_entry_photos: {
            error: { message: "new row violates row-level security policy" },
          },
        },
      });

      const { result } = await renderQueryHook(() =>
        useUploadProductionEntryPhotos(),
      );

      await act(async () => {
        await expect(
          result.current.mutateAsync(uploadInput),
        ).rejects.toBeInstanceOf(ProductionPhotoUploadError);
      });

      // Otherwise the file is up with nothing pointing at it: invisible to
      // every screen, and still counted against the bucket.
      expect(mock.removals).toEqual([
        { bucket: BUCKET, paths: [mock.uploads[0].path] },
      ]);
    });

    it("keeps going when one photo cannot be read off the device", async () => {
      mock = mockForUpload();
      mockFileBytes
        .mockImplementationOnce(async () => {
          throw new Error("ENOENT");
        })
        .mockImplementationOnce(async () => new Uint8Array([9]));

      const second = { ...photo, filename: "segunda.jpg" };
      const { result } = await renderQueryHook(() =>
        useUploadProductionEntryPhotos(),
      );

      let outcome: unknown;
      await act(async () => {
        outcome = await result.current
          .mutateAsync({ ...uploadInput, photos: [photo, second] })
          .catch((e) => e);
      });
      const error = outcome as ProductionPhotoUploadError;

      // One unreadable file must not cost the reporter the other shots.
      expect(outcome).toBeInstanceOf(ProductionPhotoUploadError);
      expect(error.uploaded).toBe(1);
      expect(error.failed).toEqual([photo]);
    });

    it("resolves with the count when every photo lands", async () => {
      mock = mockForUpload({
        uploads: { [BUCKET]: [{ error: null }, { error: null }] },
        tables: {
          user_profiles: { data: { organization_id: ORG } },
          production_entry_photos: [{ data: null }, { data: null }],
        },
      });

      const { result } = await renderQueryHook(() =>
        useUploadProductionEntryPhotos(),
      );

      let outcome: { uploaded: number } | undefined;
      await act(async () => {
        outcome = await result.current.mutateAsync({
          ...uploadInput,
          photos: [photo, { ...photo, filename: "segunda.jpg" }],
        });
      });

      expect(outcome).toEqual({ uploaded: 2 });
    });
  });
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

describe("useDeleteProductionEntryPhoto", () => {
  it("removes the object before the row", async () => {
    mock = createSupabaseMock({
      removals: { [BUCKET]: { error: null } },
      tables: { production_entry_photos: { data: null } },
    });

    const { result } = await renderQueryHook(() =>
      useDeleteProductionEntryPhoto(),
    );
    await act(async () => {
      await result.current.mutateAsync({
        photoId: "photo-1",
        entryId: ENTRY,
        storagePath: `${ORG}/${PROJECT}/${ENTRY}/shot.jpg`,
      });
    });

    // In that order because deleting the row does not delete the file
    // (Atlas, GRA-1135), and an orphaned object is invisible to every screen.
    expect(mock.removals).toHaveLength(1);
    expect(argsOf(mock.only("production_entry_photos"), "eq")).toEqual([
      "id",
      "photo-1",
    ]);
  });

  it("leaves the row alone when the object cannot be removed", async () => {
    mock = createSupabaseMock({
      removals: { [BUCKET]: { error: { message: "permission denied" } } },
    });

    const { result } = await renderQueryHook(() =>
      useDeleteProductionEntryPhoto(),
    );

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          photoId: "photo-1",
          entryId: ENTRY,
          storagePath: `${ORG}/${PROJECT}/${ENTRY}/shot.jpg`,
        }),
      ).rejects.toBeTruthy();
    });

    // Dropping the row anyway would strand the file for good: no row means no
    // screen and no policy can ever name it again.
    expect(mock.on("production_entry_photos")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

describe("useProductionEntryPhotos", () => {
  it("does not query at all without an entry id", async () => {
    mock = createSupabaseMock();

    const { result } = await renderQueryHook(() =>
      useProductionEntryPhotos(undefined),
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(mock.queries).toHaveLength(0);
  });

  it("reads one entry's photos oldest first", async () => {
    mock = createSupabaseMock({
      tables: {
        production_entry_photos: { data: [{ id: "photo-1" }] },
      },
    });

    const { result } = await renderQueryHook(() =>
      useProductionEntryPhotos(ENTRY),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const query = mock.only("production_entry_photos");
    expect(argsOf(query, "eq")).toEqual(["production_entry_id", ENTRY]);
    // Oldest first: the order the crew took them in is the order that reads.
    expect(argsOf(query, "order")).toEqual([
      "created_at",
      { ascending: true },
    ]);
  });
});

describe("useProductionPhotosByEntries", () => {
  it("does not query for an empty page of entries", async () => {
    mock = createSupabaseMock();

    const { result } = await renderQueryHook(() =>
      useProductionPhotosByEntries([]),
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(mock.queries).toHaveLength(0);
  });

  it("fetches a whole page in one query and groups it by entry", async () => {
    mock = createSupabaseMock({
      tables: {
        production_entry_photos: {
          data: [
            { id: "p1", production_entry_id: "e1", storage_path: "a" },
            { id: "p2", production_entry_id: "e2", storage_path: "b" },
            { id: "p3", production_entry_id: "e1", storage_path: "c" },
          ],
        },
      },
    });

    const { result } = await renderQueryHook(() =>
      useProductionPhotosByEntries(["e1", "e2"]),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // One `in` rather than 20 round trips: on a field connection that is the
    // difference between a list that renders and a list that spins.
    expect(mock.on("production_entry_photos")).toHaveLength(1);
    expect(argsOf(mock.only("production_entry_photos"), "in")).toEqual([
      "production_entry_id",
      ["e1", "e2"],
    ]);
    expect(result.current.data?.e1?.map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(result.current.data?.e2?.map((p) => p.id)).toEqual(["p2"]);
  });
});

describe("useProductionPhotoUrls", () => {
  it("signs the paths instead of asking for a public URL", async () => {
    mock = createSupabaseMock();

    const { result } = await renderQueryHook(() =>
      useProductionPhotoUrls(["a/b/c/one.jpg"]),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // The bucket is private; getPublicUrl would hand back a URL that 400s.
    expect(mock.signings).toHaveLength(1);
    expect(mock.signings[0].bucket).toBe(BUCKET);
    expect(mock.signings[0].expiresIn).toBeGreaterThan(0);
    expect(result.current.data?.["a/b/c/one.jpg"]).toContain("signed");
  });

  it("skips the whole round trip when there is nothing to sign", async () => {
    mock = createSupabaseMock();

    const { result } = await renderQueryHook(() => useProductionPhotoUrls([]));

    expect(result.current.fetchStatus).toBe("idle");
    expect(mock.signings).toHaveLength(0);
  });

  it("keeps the readable URLs when one path cannot be signed", async () => {
    mock = createSupabaseMock({
      signedUrls: {
        [BUCKET]: {
          data: [
            { path: "ok.jpg", signedUrl: "https://cdn.test/signed/ok.jpg" },
            { path: "gone.jpg", signedUrl: null },
          ],
        },
      },
    });

    const { result } = await renderQueryHook(() =>
      useProductionPhotoUrls(["ok.jpg", "gone.jpg"]),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // One unreadable object renders as a placeholder; it does not take the
    // rest of the grid down with it.
    expect(result.current.data).toEqual({
      "ok.jpg": "https://cdn.test/signed/ok.jpg",
    });
  });
});

// ---------------------------------------------------------------------------
// The client half of the RLS: what the screen may offer at all
// ---------------------------------------------------------------------------

describe("canAttachProductionPhoto", () => {
  const reporter = { role: "operator" as const, userId: "user-1" };

  it.each(["reported", "supervisor_approved", "rejected"] as const)(
    "lets the reporter attach to their own entry in %s",
    (status) => {
      // The window Atlas settled on (GRA-1134): reporting first and attaching
      // later is the normal flow, and `rejected` is exactly when a crew fixes
      // what was wrong.
      expect(
        canAttachProductionPhoto(
          { reported_by: "user-1", internal_status: status },
          reporter,
        ),
      ).toBe(true);
    },
  );

  it("closes the reporter's window once an admin approved it", () => {
    expect(
      canAttachProductionPhoto(
        { reported_by: "user-1", internal_status: "admin_approved" },
        reporter,
      ),
    ).toBe(false);
  });

  it("does not let a reporter attach to somebody else's entry", () => {
    expect(
      canAttachProductionPhoto(
        { reported_by: "user-2", internal_status: "reported" },
        reporter,
      ),
    ).toBe(false);
  });

  it.each(["admin", "supervisor"] as const)(
    "lets a %s attach to any entry, approved or not",
    (role) => {
      expect(
        canAttachProductionPhoto(
          { reported_by: "user-2", internal_status: "admin_approved" },
          { role, userId: "user-1" },
        ),
      ).toBe(true);
    },
  );

  it("lets the attempt through when the role is unknown", () => {
    // `fetchUserRole` resolves the role with `.single()` over a many-to-many
    // table, so a user holding two roles reads back null. Blocking on that
    // would deny a supervisor what the database allows; RLS answers instead.
    expect(
      canAttachProductionPhoto(
        { reported_by: "user-2", internal_status: "admin_approved" },
        { role: null, userId: "user-1" },
      ),
    ).toBe(true);
  });
});

describe("canRemoveProductionPhoto", () => {
  it("lets the reporter delete only while the entry is still reported", () => {
    const viewer = { role: "operator" as const, userId: "user-1" };

    expect(
      canRemoveProductionPhoto(
        { reported_by: "user-1", internal_status: "reported" },
        viewer,
      ),
    ).toBe(true);
    // Evidence a supervisor has already looked at is not withdrawn by the crew.
    expect(
      canRemoveProductionPhoto(
        { reported_by: "user-1", internal_status: "supervisor_approved" },
        viewer,
      ),
    ).toBe(false);
  });

  it("lets an admin delete at any point", () => {
    expect(
      canRemoveProductionPhoto(
        { reported_by: "user-2", internal_status: "admin_approved" },
        { role: "admin", userId: "user-1" },
      ),
    ).toBe(true);
  });

  it("does not let a supervisor delete somebody else's photo", () => {
    // The two policies differ on purpose: can_remove names admin and the
    // reporter, not supervisor. Offering a delete here would always 42501.
    expect(
      canRemoveProductionPhoto(
        { reported_by: "user-2", internal_status: "reported" },
        { role: "supervisor", userId: "user-1" },
      ),
    ).toBe(false);
  });

  it("lets a supervisor delete a photo on an entry THEY reported", () => {
    // can_remove's reporter branch carries no role test — it is
    // `reported_by = auth.uid() AND internal_status = 'reported'`. A
    // supervisor who filed their own production is a reporter like any other,
    // and a blanket `supervisor → false` hid the button on an entry the
    // database would have let them clear (Ross, S2).
    expect(
      canRemoveProductionPhoto(
        { reported_by: "user-1", internal_status: "reported" },
        { role: "supervisor", userId: "user-1" },
      ),
    ).toBe(true);
    // Still only while it is `reported`, same as any other reporter.
    expect(
      canRemoveProductionPhoto(
        { reported_by: "user-1", internal_status: "supervisor_approved" },
        { role: "supervisor", userId: "user-1" },
      ),
    ).toBe(false);
  });
});

describe("attachBlockedReason", () => {
  it("says nothing when attaching is allowed", () => {
    expect(
      attachBlockedReason(
        { reported_by: "user-1", internal_status: "reported" },
        { role: "operator", userId: "user-1" },
      ),
    ).toBeNull();
  });

  it("explains a closed entry instead of offering a button that 42501s", () => {
    const reason = attachBlockedReason(
      { reported_by: "user-1", internal_status: "admin_approved" },
      { role: "operator", userId: "user-1" },
    );

    expect(reason).toContain("admin");
    expect(reason).toContain("supervisor");
  });

  it("explains that the entry belongs to somebody else", () => {
    const reason = attachBlockedReason(
      { reported_by: "user-2", internal_status: "reported" },
      { role: "operator", userId: "user-1" },
    );

    expect(reason).toContain("Solo quien reportó");
  });
});

// ---------------------------------------------------------------------------
// Classifying the failure — the wrapper hides the cause unless you unwrap it
// ---------------------------------------------------------------------------

describe("classifyUploadFailure", () => {
  it("reads the cause through the wrapper, not its photo count", () => {
    // The wrapper's own message is "No se pudo subir 1 foto". Matching
    // keywords on that can only ever answer "unknown", which is how every
    // upload failure used to reach the reporter as "falló la subida".
    const wrapped = new ProductionPhotoUploadError(0, [photo], {
      message: "new row violates row-level security policy",
      code: "42501",
    });

    expect(wrapped.message).not.toContain("row-level");
    expect(classifyUploadFailure(wrapped)).toBe("denied");
  });

  it("classifies a PostgREST object that is not an Error", () => {
    // PostgREST answers with a bare object; an `instanceof Error` check
    // misses it, and that is the case worth telling apart.
    expect(classifyUploadFailure({ message: "permission denied", code: "42501" })).toBe(
      "denied",
    );
  });

  it("tells offline apart from denied", () => {
    expect(
      classifyUploadFailure(
        new ProductionPhotoUploadError(0, [photo], new TypeError("Network request failed")),
      ),
    ).toBe("offline");
  });

  it("recognises a file the bucket refuses as too large", () => {
    expect(
      classifyUploadFailure(
        new ProductionPhotoUploadError(0, [photo], {
          message: "The object exceeded the maximum allowed size",
          statusCode: "413",
        }),
      ),
    ).toBe("too-large");
  });

  it("keeps the guards this module throws before any upload", () => {
    expect(classifyUploadFailure(new Error("No hay sesión activa"))).toBe("no-session");
    expect(
      classifyUploadFailure(new Error("No se pudo obtener la organización del usuario")),
    ).toBe("no-org");
  });

  it("answers unknown rather than guessing", () => {
    expect(classifyUploadFailure(new Error("algo raro"))).toBe("unknown");
    expect(classifyUploadFailure(undefined)).toBe("unknown");
  });
});
