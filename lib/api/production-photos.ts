import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { File } from "expo-file-system";
import { supabase } from "../supabase/client";
import type {
  ProductionEntry,
  ProductionEntryPhoto,
  UserRole,
} from "../../types/database";

/**
 * Photos attached to a production report (GRA-1135, backend GRA-1134).
 *
 * Deliberately its own module rather than more of `lib/api/production.ts`: the
 * photo layer is the only part of production that touches Storage, and the
 * rules it has to respect come from the bucket's policies rather than from the
 * entry's. Keeping it separate also keeps it off the file GRA-829 (#12) is
 * rewriting.
 *
 * Three rules from the backend (Atlas on GRA-1135), each of which the policies
 * enforce and this module therefore cannot work around:
 *
 *  1. The object path is always `{org_id}/{project_id}/{production_entry_id}/{file}`.
 *     The Storage policies read segment [1] as the org and segment [3] as the
 *     entry, so a path built any other way is denied, not merely untidy.
 *  2. **No upsert.** There is no UPDATE policy on `storage.objects`, so
 *     `x-upsert` answers 403 — every object needs a name of its own.
 *  3. Deleting is object first, then row. Dropping the row leaves the file.
 */

export const BUCKET = "production-entry-photos";

/** How long a signed thumbnail URL stays good for. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export const productionPhotoKeys = {
  all: ["production-entry-photos"] as const,
  byEntry: (entryId: string) =>
    ["production-entry-photos", "entry", entryId] as const,
  byEntries: (entryIds: string[]) =>
    ["production-entry-photos", "entries", [...entryIds].sort()] as const,
  urls: (paths: string[]) =>
    ["production-entry-photos", "urls", [...paths].sort()] as const,
};

const PHOTO_COLUMNS =
  "id, production_entry_id, storage_path, filename, caption, taken_at, location, uploaded_by, created_at, uploaded_by_user:user_profiles!production_entry_photos_uploaded_by_fkey(full_name)";

/** A photo picked or captured on the device, not yet uploaded. */
export interface ProductionPhotoInput {
  uri: string;
  filename: string;
  mimeType: string;
  /** GPS fix at capture time. Absent is normal: no fix must not block a report. */
  latitude?: number | null;
  longitude?: number | null;
}

// ---------------------------------------------------------------------------
// Storage path
// ---------------------------------------------------------------------------

/**
 * Give an object a name of its own within the entry's folder.
 *
 * `Date.now()` alone is not enough — two photos from one tap-tap land in the
 * same millisecond — and without an upsert a collision is a hard 403 on the
 * second file, not a silent overwrite. A random suffix is used rather than a
 * uuid because every uuid package here is a native dependency, and a native
 * dependency costs an EAS build on every PR that touches it.
 */
function uniqueName(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  const extension = (match?.[1] ?? "jpg").toLowerCase();
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${suffix}.${extension}`;
}

/**
 * The object path for one photo of one entry.
 *
 * Exported because the Storage policies parse this string: segment [1] has to
 * be the caller's org and segment [3] the entry it is attached to, so the
 * shape is a contract with the database and not a formatting choice.
 */
export function buildProductionPhotoPath(input: {
  orgId: string;
  projectId: string;
  entryId: string;
  filename: string;
}): string {
  return [
    input.orgId,
    input.projectId,
    input.entryId,
    uniqueName(input.filename),
  ].join("/");
}

// ---------------------------------------------------------------------------
// Who may attach and who may remove — the client half of the RLS
// ---------------------------------------------------------------------------

/**
 * The entry fields the permission mirrors need. Narrower than
 * `ProductionEntry` so a caller holding only a list row can ask.
 */
export interface PhotoPermissionEntry {
  reported_by: string | null;
  internal_status: ProductionEntry["internal_status"];
}

export interface PhotoPermissionViewer {
  /**
   * `null` means unknown, not "no role". `fetchUserRole` resolves the role
   * with `.single()` over a many-to-many table, so a user holding two roles
   * comes back `null` — and a client-side block would then deny a supervisor
   * what the database would have allowed. Unknown therefore means "let the
   * attempt run and let RLS answer".
   */
  role: UserRole | null;
  userId: string | null;
}

const ALWAYS_ATTACH_ROLES: UserRole[] = ["admin", "supervisor"];

/**
 * Mirror of `can_attach_production_entry_photo` (GRA-1134): admin and
 * supervisor on any entry in their org; the crew reporter on an entry they
 * reported until an admin approves it — `reported`, `supervisor_approved` and
 * `rejected`, which is the window where a crew remembers the photo it missed
 * or corrects a rejected report.
 */
export function canAttachProductionPhoto(
  entry: PhotoPermissionEntry,
  viewer: PhotoPermissionViewer,
): boolean {
  if (viewer.role === null) return true; // unknown: let RLS decide
  if (ALWAYS_ATTACH_ROLES.includes(viewer.role)) return true;
  return (
    !!viewer.userId &&
    entry.reported_by === viewer.userId &&
    entry.internal_status !== "admin_approved"
  );
}

/**
 * Mirror of `can_remove_production_entry_photo` (GRA-1134): admin anywhere, or
 * whoever reported the entry, while it is still `reported`. Evidence a
 * supervisor has already looked at is not withdrawn by the crew.
 *
 * The reporter branch carries no role test, because the policy's does not: it
 * is `reported_by = auth.uid() AND internal_status = 'reported'` and nothing
 * else. A supervisor who filed their own production is a reporter like any
 * other and may remove their own photo while it is still `reported` (Ross,
 * S2 on GRA-1135) — an earlier `role === 'supervisor' → false` here hid the
 * button on an entry the database would have let them clear.
 */
export function canRemoveProductionPhoto(
  entry: PhotoPermissionEntry,
  viewer: PhotoPermissionViewer,
): boolean {
  if (viewer.role === "admin") return true;
  return (
    !!viewer.userId &&
    entry.reported_by === viewer.userId &&
    entry.internal_status === "reported"
  );
}

/**
 * Why the add-photo button is not there, in the reporter's words.
 *
 * The point of this is that the screen explains itself instead of offering a
 * button that comes back `42501`. `null` means it is allowed.
 */
export function attachBlockedReason(
  entry: PhotoPermissionEntry,
  viewer: PhotoPermissionViewer,
): string | null {
  if (canAttachProductionPhoto(entry, viewer)) return null;

  if (viewer.userId && entry.reported_by !== viewer.userId) {
    return "Solo quien reportó esta producción, o un supervisor, puede agregarle fotos.";
  }

  return "Esta entrada ya fue aprobada por un admin y quedó cerrada. Pídele a tu supervisor que agregue la foto.";
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The photos of one entry, oldest first — the order they were taken in. */
export function useProductionEntryPhotos(entryId: string | undefined) {
  return useQuery({
    queryKey: productionPhotoKeys.byEntry(entryId ?? ""),
    queryFn: async (): Promise<ProductionEntryPhoto[]> => {
      const { data, error } = await supabase
        .from("production_entry_photos")
        .select(PHOTO_COLUMNS)
        .eq("production_entry_id", entryId!)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data as unknown as ProductionEntryPhoto[]) ?? [];
    },
    enabled: !!entryId,
  });
}

/**
 * The photos of a whole page of entries, grouped by entry.
 *
 * One `in` query rather than one query per card: the recent-entries list shows
 * 20 entries, and 20 round trips on a field connection is the difference
 * between a list that renders and a list that spins.
 */
export function useProductionPhotosByEntries(entryIds: string[]) {
  return useQuery({
    queryKey: productionPhotoKeys.byEntries(entryIds),
    queryFn: async (): Promise<Record<string, ProductionEntryPhoto[]>> => {
      const { data, error } = await supabase
        .from("production_entry_photos")
        .select(PHOTO_COLUMNS)
        .in("production_entry_id", entryIds)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const rows = (data as unknown as ProductionEntryPhoto[]) ?? [];
      return rows.reduce<Record<string, ProductionEntryPhoto[]>>((acc, row) => {
        (acc[row.production_entry_id] ??= []).push(row);
        return acc;
      }, {});
    },
    enabled: entryIds.length > 0,
  });
}

/**
 * Signed URLs for a set of object paths, keyed by path.
 *
 * The bucket is private, so `getPublicUrl` would hand back a URL that 400s.
 * One `createSignedUrls` call covers the whole grid.
 */
export function useProductionPhotoUrls(paths: string[]) {
  return useQuery({
    queryKey: productionPhotoKeys.urls(paths),
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

      if (error) throw error;

      const signed = (data ?? []) as {
        path: string | null;
        signedUrl: string | null;
      }[];

      return signed.reduce<Record<string, string>>((acc, item) => {
        // A single unreadable path comes back with a null url and does not
        // fail the batch; that one thumbnail renders as a placeholder.
        if (item.path && item.signedUrl) acc[item.path] = item.signedUrl;
        return acc;
      }, {});
    },
    enabled: paths.length > 0,
    // Shorter than the URL's own life, so a long-lived screen re-signs before
    // its thumbnails start 403ing.
    staleTime: (SIGNED_URL_TTL_SECONDS / 2) * 1000,
  });
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * Some photos did not make it up.
 *
 * Carries the ones that failed so the screen can retry exactly those. The
 * entry itself is already committed by the time any of this runs, which is the
 * whole reason this is an error type and not a thrown string: the message a
 * reporter must see is "the production IS saved", and offering "retry" has to
 * mean the photos, never the report (GRA-766).
 */
export class ProductionPhotoUploadError extends Error {
  readonly uploaded: number;
  readonly failed: ProductionPhotoInput[];

  constructor(uploaded: number, failed: ProductionPhotoInput[], cause?: unknown) {
    super(
      failed.length === 1
        ? "No se pudo subir 1 foto"
        : `No se pudo subir ${failed.length} fotos`,
    );
    this.name = "ProductionPhotoUploadError";
    this.uploaded = uploaded;
    this.failed = failed;
    this.cause = cause;
  }
}

/**
 * Why an upload failed, in the only terms a screen has to tell apart.
 *
 * `denied` is the one that changes what the screen DOES rather than what it
 * says: a retry after `42501` fails every time, so the screen must stop
 * offering one.
 */
export type UploadFailureKind =
  | "no-session"
  | "no-org"
  | "offline"
  | "denied"
  | "too-large"
  | "unknown";

/**
 * Everything the thrown value can say about itself, lowercased.
 *
 * Three shapes arrive here and only one of them is an `Error`: Storage answers
 * with a `StorageApiError`, PostgREST with a bare object carrying `message`
 * and `code` (`42501` for an RLS denial), and this module's own guards with a
 * plain `Error`. Reading `.message` off an `instanceof Error` check alone
 * misses the PostgREST case, which is exactly the one worth telling apart.
 */
function errorSignals(error: unknown): string {
  if (typeof error === "string") return error.toLowerCase();
  if (!error || typeof error !== "object") return "";

  const e = error as Record<string, unknown>;
  return [e.message, e.code, e.statusCode, e.status, e.error]
    .filter((part) => typeof part === "string" || typeof part === "number")
    .join(" ")
    .toLowerCase();
}

/**
 * Classify what actually went wrong, through the wrapper.
 *
 * `ProductionPhotoUploadError` exists to carry WHICH photos failed, so its own
 * message is a count — "No se pudo subir 2 fotos" — and matching keywords
 * against it can only ever say "unknown". The diagnosis lives in `cause`
 * (Ross, S1 on GRA-1135); before this, every upload failure reached the
 * reporter as "falló la subida", offline and permission-denied alike.
 */
export function classifyUploadFailure(error: unknown): UploadFailureKind {
  const cause =
    error instanceof ProductionPhotoUploadError ? (error.cause ?? error) : error;
  const text = errorSignals(cause) || errorSignals(error);

  if (text.includes("no hay sesión activa")) return "no-session";
  if (text.includes("no se pudo obtener la organización")) return "no-org";
  if (
    text.includes("row-level security") ||
    text.includes("permission denied") ||
    text.includes("unauthorized") ||
    text.includes("42501") ||
    text.includes("403")
  ) {
    return "denied";
  }
  if (
    text.includes("exceeded the maximum") ||
    text.includes("too large") ||
    text.includes("payload too large") ||
    text.includes("413")
  ) {
    return "too-large";
  }
  if (
    text.includes("network") ||
    text.includes("fetch") ||
    text.includes("timeout") ||
    text.includes("timed out")
  ) {
    return "offline";
  }
  return "unknown";
}

export interface UploadProductionPhotosInput {
  entryId: string;
  projectId: string;
  photos: ProductionPhotoInput[];
}

export interface UploadProductionPhotosResult {
  uploaded: number;
}

/**
 * Upload photos for an entry that already exists, then record each one.
 *
 * Separate from `useCreateProductionEntry` on purpose. `create_production_entry`
 * is one transaction and returns the committed row; only then is there an
 * `production_entry_id` to build a path from. So "entry saved, photo failed" is
 * a state this feature has and the atomic insert does not, and the only honest
 * way to present it is to let the entry stand and retry the file.
 *
 * Each photo is independent: photo 2 failing does not undo photo 1, and the
 * retry carries only what failed — re-sending the lot would duplicate whatever
 * had already landed.
 */
export function useUploadProductionEntryPhotos() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: UploadProductionPhotosInput,
    ): Promise<UploadProductionPhotosResult> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("No hay sesión activa");

      // The org is the first path segment and the Storage policy compares it
      // against `current_user_org()`, so it has to be read, not guessed.
      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (profileError || !profile?.organization_id) {
        throw new Error("No se pudo obtener la organización del usuario");
      }

      const orgId = profile.organization_id as string;
      const failed: ProductionPhotoInput[] = [];
      let uploaded = 0;
      let firstError: unknown;

      for (const photo of input.photos) {
        const storagePath = buildProductionPhotoPath({
          orgId,
          projectId: input.projectId,
          entryId: input.entryId,
          filename: photo.filename,
        });

        try {
          const bytes = await new File(photo.uri).bytes();

          const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(storagePath, bytes, {
              contentType: photo.mimeType,
              // No `upsert`: there is no UPDATE policy on storage.objects, so
              // asking for one answers 403 rather than replacing anything.
            });

          if (uploadError) throw uploadError;

          const { error: rowError } = await supabase
            .from("production_entry_photos")
            .insert({
              production_entry_id: input.entryId,
              storage_path: storagePath,
              filename: photo.filename,
              taken_at: new Date().toISOString(),
              location: toPointOrNull(photo),
              uploaded_by: user.id,
            });

          if (rowError) {
            // The file is up but nothing points at it. Take it back out so a
            // retry does not pile up objects no screen will ever show.
            //
            // Best effort on purpose: the DELETE policy is narrower than the
            // INSERT one — `can_remove` wants `reported`, `can_attach` also
            // allows `supervisor_approved` and `rejected` — so a reporter
            // attaching to an already-approved entry cannot take back the
            // object they just wrote, and it is orphaned until an admin
            // clears it. Narrowing that gap is a backend change; noted on
            // GRA-1137 (Ross, N2 on GRA-1135).
            await supabase.storage
              .from(BUCKET)
              .remove([storagePath])
              .catch(() => undefined);
            throw rowError;
          }

          uploaded += 1;
        } catch (error) {
          console.warn("[ProductionPhotos] upload failed:", error);
          failed.push(photo);
          firstError ??= error;
        }
      }

      if (failed.length > 0) {
        throw new ProductionPhotoUploadError(uploaded, failed, firstError);
      }

      return { uploaded };
    },
    // onSettled, not onSuccess: a partial upload throws, and the photos that
    // DID land still have to appear.
    onSettled: (_result, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: productionPhotoKeys.byEntry(variables.entryId),
      });
      queryClient.invalidateQueries({ queryKey: productionPhotoKeys.all });
    },
  });
}

/**
 * `SRID=4326;POINT(lng lat)`, or NULL without a fix.
 *
 * A missing GPS fix never blocks the upload — a reporter under canopy or inside
 * a trench still has to be able to file the photo (GRA-1135). PostGIS takes
 * longitude first; getting that backwards is how a photo ends up in the ocean.
 */
function toPointOrNull(photo: ProductionPhotoInput): string | null {
  const { latitude, longitude } = photo;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  return `SRID=4326;POINT(${longitude} ${latitude})`;
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export interface DeleteProductionPhotoInput {
  photoId: string;
  entryId: string;
  storagePath: string;
}

/**
 * Remove a photo: the object first, then the row (Atlas, GRA-1135).
 *
 * In that order because deleting the row does not delete the file, and a row
 * with no file is at least visible as a broken thumbnail — a file with no row
 * is invisible to every screen and to every policy that reads the entry.
 */
export function useDeleteProductionEntryPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DeleteProductionPhotoInput) => {
      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .remove([input.storagePath]);

      if (storageError) throw storageError;

      const { error } = await supabase
        .from("production_entry_photos")
        .delete()
        .eq("id", input.photoId);

      if (error) throw error;
    },
    onSettled: (_result, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: productionPhotoKeys.byEntry(variables.entryId),
      });
      queryClient.invalidateQueries({ queryKey: productionPhotoKeys.all });
    },
  });
}
