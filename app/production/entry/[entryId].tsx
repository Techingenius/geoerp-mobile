import { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useProductionEntry } from "../../../lib/api/production";
import {
  attachBlockedReason,
  canRemoveProductionPhoto,
  classifyUploadFailure,
  useDeleteProductionEntryPhoto,
  useProductionEntryPhotos,
  useProductionPhotoUrls,
  useUploadProductionEntryPhotos,
  type ProductionPhotoInput,
  type UploadFailureKind,
} from "../../../lib/api/production-photos";
import { useAuthStore } from "../../../lib/stores/auth-store";
import { useLocation } from "../../../lib/hooks/use-location";
import { captureProductionPhoto } from "../../../lib/utils/capture-photo";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Card, CardContent } from "../../../components/ui/Card";
import { ProductionPhotoGrid } from "../../../components/features/ProductionPhotoGrid";
import type {
  ProductionEntryPhoto,
  ProductionInternalStatus,
  UnitType,
} from "../../../types/database";

const UNIT_TYPE_SHORT: Record<UnitType, string> = {
  drilling_ft: "perforación",
  aerial_ft: "aéreo",
  duct_ft: "ducto",
  trenching_ft: "zanja",
};

const STATUS_BADGE: Record<
  ProductionInternalStatus,
  { label: string; variant: "default" | "success" | "warning" | "danger" }
> = {
  reported: { label: "Reportado", variant: "warning" },
  supervisor_approved: { label: "Aprob. supervisor", variant: "default" },
  admin_approved: { label: "Aprob. admin", variant: "success" },
  rejected: { label: "Rechazado", variant: "danger" },
};

/**
 * One production entry and its photos, with a way to add more.
 *
 * This screen is what makes the feature usable rather than a nicety. The photo
 * is optional (Jonas, GRA-829), so the normal flow is to report the shift and
 * attach the photo later — from here — not to hold the report back until
 * somebody has a camera free. The reporter's window stays open through
 * `reported`, `supervisor_approved` and `rejected` and closes at
 * `admin_approved` (GRA-1134); when it is closed the screen says so, because
 * the alternative is a button that fails with 42501 and a crew that thinks the
 * app is broken.
 */
export default function ProductionEntryDetailScreen() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const role = useAuthStore((s) => s.role);
  const userId = useAuthStore((s) => s.user?.id ?? null);

  const {
    data: entry,
    isLoading: loadingEntry,
    refetch: refetchEntry,
  } = useProductionEntry(entryId);
  const {
    data: photos,
    isLoading: loadingPhotos,
    refetch: refetchPhotos,
  } = useProductionEntryPhotos(entryId);

  const paths = useMemo(
    () => (photos ?? []).map((photo) => photo.storage_path),
    [photos],
  );
  const { data: urls } = useProductionPhotoUrls(paths);

  const { location } = useLocation();
  const uploadPhotos = useUploadProductionEntryPhotos();
  const deletePhoto = useDeleteProductionEntryPhoto();
  const [removingPhotoId, setRemovingPhotoId] = useState<string | null>(null);

  const viewer = { role, userId };
  const blockedReason = entry ? attachBlockedReason(entry, viewer) : null;
  const mayRemove = entry ? canRemoveProductionPhoto(entry, viewer) : false;

  const onAddPhoto = async () => {
    if (!entry) return;

    const outcome = await captureProductionPhoto();

    if (outcome.status === "denied") {
      Alert.alert(
        "Permiso de cámara",
        "Habilita la cámara para esta app desde los ajustes del teléfono y vuelve a intentar.",
      );
      return;
    }
    if (outcome.status === "cancelled") return;

    const photo: ProductionPhotoInput = {
      ...outcome.photo,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
    };

    try {
      await uploadPhotos.mutateAsync({
        entryId: entry.id,
        projectId: entry.project_id,
        photos: [photo],
      });
    } catch (error) {
      // A denial is the one failure a retry cannot fix: the entry moved out
      // of the reporter's window while this screen was open, so offering
      // "Reintentar" would loop on 42501 forever (Ross, S1). Refresh instead
      // — the header and the button come back correct for the new status.
      const kind = classifyUploadFailure(error);

      Alert.alert(
        "No se pudo subir la foto",
        uploadErrorMessage(kind),
        kind === "denied"
          ? [{ text: "Entendido", onPress: () => refetchEntry() }]
          : [
              { text: "Cerrar", style: "cancel" },
              { text: "Reintentar", onPress: onAddPhotoRetry(photo) },
            ],
      );
    }
  };

  // Retry the same file rather than asking for the camera again: the shot was
  // already taken, and a crew that has moved on cannot retake it.
  const onAddPhotoRetry = (photo: ProductionPhotoInput) => async () => {
    if (!entry) return;
    try {
      await uploadPhotos.mutateAsync({
        entryId: entry.id,
        projectId: entry.project_id,
        photos: [photo],
      });
    } catch (error) {
      Alert.alert("Sigue fallando", uploadErrorMessage(classifyUploadFailure(error)));
    }
  };

  const onRemovePhoto = (photo: ProductionEntryPhoto) => {
    Alert.alert("Eliminar foto", "Se borra del reporte y no se puede deshacer.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          setRemovingPhotoId(photo.id);
          try {
            await deletePhoto.mutateAsync({
              photoId: photo.id,
              entryId: photo.production_entry_id,
              storagePath: photo.storage_path,
            });
          } catch (error) {
            Alert.alert("No se pudo eliminar", deleteErrorMessage(error));
          } finally {
            setRemovingPhotoId(null);
          }
        },
      },
    ]);
  };

  if (loadingEntry) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!entry) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 px-6">
        <Ionicons name="document-outline" size={32} color="#9CA3AF" />
        <Text className="mt-2 text-center text-gray-500">
          No encontramos este reporte, o no pertenece a tu organización.
        </Text>
      </View>
    );
  }

  const badge = STATUS_BADGE[entry.internal_status] ?? {
    label: entry.internal_status,
    variant: "default" as const,
  };
  const photoList = photos ?? [];

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerClassName="px-5 pt-5 pb-10 gap-5"
      refreshControl={
        <RefreshControl
          refreshing={loadingPhotos}
          onRefresh={() => {
            refetchEntry();
            refetchPhotos();
          }}
        />
      }
    >
      {/* The report itself */}
      <Card>
        <CardContent className="gap-1.5">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="text-xl font-bold text-gray-900">
                {entry.units_completed} ft ·{" "}
                {UNIT_TYPE_SHORT[entry.unit_type] ?? entry.unit_type}
              </Text>
              <Text className="mt-0.5 text-sm text-gray-500">
                {entry.work_date} · {entry.crew?.name ?? "Sin cuadrilla"}
              </Text>
            </View>
            <Badge label={badge.label} variant={badge.variant} />
          </View>

          <Text className="text-xs text-gray-400">
            Reportó {entry.reported_by_user?.full_name ?? "—"}
          </Text>

          {entry.internal_status === "rejected" && entry.rejection_reason && (
            <Text className="text-xs text-red-600">
              Motivo del rechazo: {entry.rejection_reason}
            </Text>
          )}

          {entry.notes && (
            <Text className="mt-1 text-sm text-gray-600">{entry.notes}</Text>
          )}
        </CardContent>
      </Card>

      {/* Photos */}
      <Card>
        <CardContent className="gap-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-gray-900">
              Fotos ({photoList.length})
            </Text>
            {loadingPhotos && <ActivityIndicator color="#2563eb" />}
          </View>

          {!loadingPhotos && photoList.length === 0 && (
            <Text className="text-sm text-gray-400">
              Este reporte todavía no tiene fotos.
            </Text>
          )}

          <ProductionPhotoGrid
            photos={photoList}
            urls={urls ?? {}}
            size="lg"
            onRemove={mayRemove ? onRemovePhoto : undefined}
            removingPhotoId={removingPhotoId}
          />

          {blockedReason ? (
            <View className="flex-row items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <Ionicons name="lock-closed-outline" size={18} color="#6b7280" />
              <Text className="flex-1 text-sm text-gray-600">
                {blockedReason}
              </Text>
            </View>
          ) : (
            <View className="gap-2">
              <Button
                title="Agregar foto"
                size="lg"
                onPress={onAddPhoto}
                loading={uploadPhotos.isPending}
                disabled={uploadPhotos.isPending}
                icon={<Ionicons name="camera" size={20} color="white" />}
              />
              <Text className="text-center text-xs text-gray-400">
                {location
                  ? "Se guarda con la ubicación actual."
                  : "Sin señal de GPS: la foto se guarda igual, sin ubicación."}
              </Text>
            </View>
          )}
        </CardContent>
      </Card>
    </ScrollView>
  );
}

/** The cause, in the reporter's words. Classified in `lib/api` so the keyword
 * list has one home and a test can reach it. */
function uploadErrorMessage(kind: UploadFailureKind): string {
  switch (kind) {
    case "no-session":
      return "Tu sesión expiró. Vuelve a iniciar sesión y la subes de nuevo.";
    case "no-org":
      return "No pudimos leer tu organización. Vuelve a iniciar sesión.";
    case "denied":
      return "Ya no puedes agregar fotos a este reporte: un admin lo aprobó. Pídele a tu supervisor que la agregue.";
    case "offline":
      return "Sin conexión. Reintenta la foto cuando tengas señal.";
    case "too-large":
      return "La foto pesa demasiado para subirla. Toma otra con menos detalle.";
    default:
      return "No se pudo subir la foto; puedes reintentarlo.";
  }
}

function deleteErrorMessage(error: unknown): string {
  switch (classifyUploadFailure(error)) {
    case "denied":
      return "Ya no puedes borrar fotos de este reporte: tu supervisor ya lo revisó.";
    case "offline":
      return "Sin conexión. Intenta de nuevo cuando tengas señal.";
    default:
      return "No se pudo eliminar la foto. Intenta de nuevo.";
  }
}
