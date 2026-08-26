import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Image,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import MapView, { Marker, Polyline } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  useProject,
  useProjectSegments,
  useProjectServices,
} from "../../lib/api/projects";
import {
  useCreateService,
  useServicePhotos,
  useUpdateServiceStatus,
  useAddServicePhotos,
  getPhotoUrl,
} from "../../lib/api/services";
import { useLocation } from "../../lib/hooks/use-location";
import type { Service, ServiceStatus } from "../../types/database";

const SERVICE_STATUS_COLORS: Record<ServiceStatus, string> = {
  to_open: "#ef4444",
  found: "#22c55e",
  not_found: "#9ca3af",
};

const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  to_open: "Por abrir",
  found: "Encontrado",
  not_found: "No encontrado",
};

const SERVICE_TYPES = [
  "gas",
  "power",
  "water",
  "telecom",
  "sewer",
  "other",
] as const;

const SERVICE_TYPE_LABELS: Record<string, string> = {
  gas: "Gas",
  power: "Eléctrico",
  water: "Agua",
  telecom: "Telecom",
  sewer: "Drenaje",
  other: "Otro",
};

interface PhotoItem {
  uri: string;
  filename: string;
  mimeType: string;
}

// --- Photo picker helpers (shared between create and detail flows) ---

async function captureFromCamera(): Promise<PhotoItem[]> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") {
    Alert.alert("Permiso requerido", "Se necesita acceso a la cámara");
    return [];
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.7,
    exif: true,
  });
  if (!result.canceled && result.assets[0]) {
    const asset = result.assets[0];
    return [
      {
        uri: asset.uri,
        filename: asset.fileName ?? `photo_${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? "image/jpeg",
      },
    ];
  }
  return [];
}

async function pickFromGallery(): Promise<PhotoItem[]> {
  const { status } =
    await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    Alert.alert("Permiso requerido", "Se necesita acceso a la galería");
    return [];
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
    allowsMultipleSelection: true,
    selectionLimit: 10,
  });
  if (!result.canceled) {
    return result.assets.map((asset) => ({
      uri: asset.uri,
      filename: asset.fileName ?? `photo_${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? "image/jpeg",
    }));
  }
  return [];
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: project, isLoading: loadingProject } = useProject(id);
  const { data: segments } = useProjectSegments(id);
  const { data: services, error: servicesError } = useProjectServices(id);

  if (servicesError) {
    console.warn("[ProjectDetail] services query error:", servicesError);
  }
  const { location } = useLocation();
  const createService = useCreateService();
  const updateStatus = useUpdateServiceStatus();
  const addPhotos = useAddServicePhotos();

  // Create service modal state
  const [showAddService, setShowAddService] = useState(false);
  const [serviceType, setServiceType] = useState("");
  const [serviceNotes, setServiceNotes] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  // Service detail modal state
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [pendingStatus, setPendingStatus] = useState<ServiceStatus | null>(null);
  const [statusPhotos, setStatusPhotos] = useState<PhotoItem[]>([]);
  const [statusNotes, setStatusNotes] = useState("");

  const { data: servicePhotos } = useServicePhotos(selectedService?.id);

  if (loadingProject) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!project) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-gray-500">Proyecto no encontrado</Text>
      </View>
    );
  }

  const initialRegion = location
    ? {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : {
        latitude: 29.1026,
        longitude: -110.9773,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };

  // --- Create service handlers ---

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const resetModal = () => {
    setShowAddService(false);
    setServiceType("");
    setServiceNotes("");
    setPhotos([]);
  };

  const handleAddService = async () => {
    if (!serviceType) {
      Alert.alert("Error", "Selecciona un tipo de servicio");
      return;
    }
    if (!location) {
      Alert.alert("Error", "No se pudo obtener la ubicación GPS");
      return;
    }
    if (photos.length === 0) {
      Alert.alert("Foto requerida", "Debes agregar al menos 1 foto");
      return;
    }
    if (location.accuracy && location.accuracy > 50) {
      Alert.alert(
        "Precisión baja",
        `La precisión GPS es de ${Math.round(location.accuracy)}m. ¿Deseas continuar?`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Continuar", onPress: submitService },
        ]
      );
      return;
    }
    submitService();
  };

  const submitService = async () => {
    try {
      await createService.mutateAsync({
        project_id: id,
        service_type: serviceType,
        notes: serviceNotes || undefined,
        latitude: location!.latitude,
        longitude: location!.longitude,
        photos,
      });
      resetModal();
      Alert.alert("Servicio creado", "El servicio se registró exitosamente");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo crear el servicio";
      Alert.alert("Error", message);
    }
  };

  // --- Service detail handlers ---

  const closeDetail = () => {
    setSelectedService(null);
    setPendingStatus(null);
    setStatusPhotos([]);
    setStatusNotes("");
  };

  const handleStatusChange = (newStatus: ServiceStatus) => {
    setPendingStatus(newStatus);
    setStatusPhotos([]);
    setStatusNotes("");
  };

  const handleStatusCamera = async () => {
    const newPhotos = await captureFromCamera();
    if (newPhotos.length > 0) {
      setStatusPhotos((prev) => [...prev, ...newPhotos]);
    }
  };

  const handleStatusGallery = async () => {
    const newPhotos = await pickFromGallery();
    if (newPhotos.length > 0) {
      setStatusPhotos((prev) => [...prev, ...newPhotos]);
    }
  };

  const removeStatusPhoto = (index: number) => {
    setStatusPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const confirmStatusChange = async () => {
    if (!selectedService || !pendingStatus || statusPhotos.length === 0) return;
    try {
      await updateStatus.mutateAsync({
        serviceId: selectedService.id,
        status: pendingStatus,
        photos: statusPhotos,
        notes: statusNotes || undefined,
      });
      setSelectedService((prev) =>
        prev ? { ...prev, status: pendingStatus, notes: statusNotes || prev.notes } : null
      );
      setPendingStatus(null);
      setStatusPhotos([]);
      setStatusNotes("");
      Alert.alert("Estado actualizado", `Servicio marcado como ${SERVICE_STATUS_LABELS[pendingStatus] ?? pendingStatus}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Error al actualizar";
      Alert.alert("Error", msg);
    }
  };

  const handleAddExtraPhotos = async (source: "camera" | "gallery") => {
    if (!selectedService) return;
    const newPhotos = source === "camera" ? await captureFromCamera() : await pickFromGallery();
    if (newPhotos.length === 0) return;
    try {
      await addPhotos.mutateAsync({
        serviceId: selectedService.id,
        photos: newPhotos,
      });
      Alert.alert("Fotos agregadas", `${newPhotos.length} foto(s) subida(s) exitosamente`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Error al subir fotos";
      Alert.alert("Error", msg);
    }
  };

  // --- Activity timeline builder ---

  const buildTimeline = () => {
    if (!selectedService || !servicePhotos) return [];

    const events: {
      id: string;
      type: "status_change" | "photo" | "created";
      timestamp: string;
      userName: string | null;
      description: string;
      status: ServiceStatus | null;
      note?: string;
      photoUrls?: string[];
    }[] = [];

    // Status change event (if service has been marked)
    if (selectedService.status !== "to_open" && selectedService.updated_at) {
      events.push({
        id: `status-${selectedService.id}`,
        type: "status_change",
        timestamp: selectedService.updated_at,
        userName: null,
        description: `Marcado como ${SERVICE_STATUS_LABELS[selectedService.status] ?? selectedService.status}`,
        status: selectedService.status,
        note: selectedService.notes ?? undefined,
      });
    }

    // Group photos by user + time window (60s)
    const sorted = [...servicePhotos].sort(
      (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
    );
    const groups: {
      userName: string | null;
      status: ServiceStatus | null;
      timestamp: string;
      urls: string[];
      caption: string | null;
    }[] = [];

    for (const photo of sorted) {
      const userName = photo.uploaded_by_profile?.full_name ?? null;
      const ts = new Date(photo.created_at ?? 0).getTime();
      const lastGroup = groups[groups.length - 1];

      if (
        lastGroup &&
        lastGroup.userName === userName &&
        ts - new Date(lastGroup.timestamp).getTime() < 60000
      ) {
        lastGroup.urls.push(getPhotoUrl(photo.storage_path));
      } else {
        groups.push({
          userName,
          status: photo.service_status as ServiceStatus | null,
          timestamp: photo.created_at ?? new Date().toISOString(),
          urls: [getPhotoUrl(photo.storage_path)],
          caption: photo.caption,
        });
      }
    }

    for (const group of groups) {
      const count = group.urls.length;
      events.push({
        id: `photos-${group.timestamp}`,
        type: "photo",
        timestamp: group.timestamp,
        userName: group.userName,
        description: count === 1 ? "Subió 1 foto" : `Subió ${count} fotos`,
        status: group.status,
        note: group.caption ?? undefined,
        photoUrls: group.urls,
      });
    }

    // Sort newest first
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return events;
  };

  const timeline = selectedService ? buildTimeline() : [];

  return (
    <View className="flex-1">
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton
      >
        {/* Segments as polylines */}
        {segments?.map((segment) => {
          const coords = segment.geometry?.coordinates?.map(
            (coord: number[]) => ({
              latitude: coord[1],
              longitude: coord[0],
            })
          );
          if (!coords?.length) return null;
          return (
            <Polyline
              key={segment.id}
              coordinates={coords}
              strokeColor="#3b82f6"
              strokeWidth={4}
            />
          );
        })}

        {/* Services as markers */}
        {services?.map((service) => {
          const coords = service.geometry?.coordinates;
          if (!coords) return null;
          return (
            <Marker
              key={service.id}
              coordinate={{
                latitude: coords[1],
                longitude: coords[0],
              }}
              pinColor={SERVICE_STATUS_COLORS[service.status] ?? "#6b7280"}
              title={SERVICE_TYPE_LABELS[service.service_type] ?? service.service_type}
              description={`Estado: ${SERVICE_STATUS_LABELS[service.status] ?? service.status}`}
              onPress={() => setSelectedService(service)}
            />
          );
        })}
      </MapView>

      {/* Bottom info bar */}
      <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 pb-8">
        <View className="flex-row items-center justify-between mb-2">
          <View>
            <Text className="font-semibold text-gray-900">{project.name}</Text>
            <Text className={`text-xs ${servicesError ? "text-red-500" : "text-gray-400"}`}>
              {servicesError ? "Error cargando servicios" : `${services?.length ?? 0} servicios`} · {segments?.length ?? 0} tramos
            </Text>
          </View>
          <Pressable
            onPress={() => setShowAddService(true)}
            className="bg-primary-600 flex-row items-center px-4 py-2.5 rounded-xl active:bg-primary-700"
          >
            <Ionicons name="add" size={18} color="white" />
            <Text className="text-white font-medium ml-1">Servicio</Text>
          </Pressable>
        </View>

        {/* Status legend */}
        <View className="flex-row gap-3 mt-1">
          {Object.entries(SERVICE_STATUS_COLORS).map(([status, color]) => (
            <View key={status} className="flex-row items-center gap-1">
              <View
                style={{ backgroundColor: color }}
                className="w-2.5 h-2.5 rounded-full"
              />
              <Text className="text-xs text-gray-400">
                {SERVICE_STATUS_LABELS[status as ServiceStatus] ?? status}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Add Service Modal */}
      <Modal visible={showAddService} animationType="slide" transparent>
        <View className="flex-1 justify-end">
          <Pressable className="flex-1" onPress={resetModal} />
          <View className="bg-white rounded-t-2xl px-6 pt-6 pb-10 border-t border-gray-200">
            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-xl font-bold text-gray-900">
                  Nuevo servicio
                </Text>
                <Pressable onPress={resetModal}>
                  <Ionicons name="close" size={24} color="#6b7280" />
                </Pressable>
              </View>

              {/* GPS indicator */}
              {location && (
                <View className="bg-green-50 rounded-lg p-3 mb-4 flex-row items-center">
                  <Ionicons name="location" size={18} color="#22c55e" />
                  <Text className="text-green-700 text-sm ml-2">
                    GPS: {location.latitude.toFixed(6)},{" "}
                    {location.longitude.toFixed(6)}
                    {location.accuracy
                      ? ` (±${Math.round(location.accuracy)}m)`
                      : ""}
                  </Text>
                </View>
              )}

              {!location && (
                <View className="bg-red-50 rounded-lg p-3 mb-4 flex-row items-center">
                  <Ionicons name="warning" size={18} color="#ef4444" />
                  <Text className="text-red-700 text-sm ml-2">
                    GPS no disponible
                  </Text>
                </View>
              )}

              {/* Service type selector */}
              <Text className="text-sm font-medium text-gray-700 mb-2">
                Tipo de servicio
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mb-4"
              >
                <View className="flex-row gap-2">
                  {SERVICE_TYPES.map((type) => (
                    <Pressable
                      key={type}
                      onPress={() => setServiceType(type)}
                      className={`px-4 py-2 rounded-full border ${
                        serviceType === type
                          ? "bg-primary-600 border-primary-600"
                          : "bg-white border-gray-300"
                      }`}
                    >
                      <Text
                        className={`text-sm font-medium ${
                          serviceType === type ? "text-white" : "text-gray-700"
                        }`}
                      >
                        {SERVICE_TYPE_LABELS[type]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>

              {/* Notes field */}
              <Text className="text-sm font-medium text-gray-700 mb-2">
                Notas (opcional)
              </Text>
              <TextInput
                className="border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50 mb-4"
                placeholder="Notas adicionales..."
                value={serviceNotes}
                onChangeText={setServiceNotes}
                multiline
                numberOfLines={2}
              />

              {/* Photos section */}
              <Text className="text-sm font-medium text-gray-700 mb-2">
                Fotos{" "}
                <Text className="text-red-500">*</Text>
                <Text className="text-gray-400 font-normal">
                  {" "}(mínimo 1)
                </Text>
              </Text>

              {/* Photo actions */}
              <View className="flex-row gap-3 mb-3">
                <Pressable
                  onPress={async () => {
                    const p = await captureFromCamera();
                    if (p.length) setPhotos((prev) => [...prev, ...p]);
                  }}
                  className="flex-1 flex-row items-center justify-center bg-gray-100 py-3 rounded-xl active:bg-gray-200"
                >
                  <Ionicons name="camera" size={20} color="#374151" />
                  <Text className="text-gray-700 font-medium ml-2">Cámara</Text>
                </Pressable>
                <Pressable
                  onPress={async () => {
                    const p = await pickFromGallery();
                    if (p.length) setPhotos((prev) => [...prev, ...p]);
                  }}
                  className="flex-1 flex-row items-center justify-center bg-gray-100 py-3 rounded-xl active:bg-gray-200"
                >
                  <Ionicons name="images" size={20} color="#374151" />
                  <Text className="text-gray-700 font-medium ml-2">Galería</Text>
                </Pressable>
              </View>

              {/* Photo preview grid */}
              {photos.length > 0 && (
                <View className="flex-row flex-wrap gap-2 mb-4">
                  {photos.map((photo, index) => (
                    <View key={photo.uri} className="relative">
                      <Image
                        source={{ uri: photo.uri }}
                        className="w-20 h-20 rounded-lg"
                      />
                      <Pressable
                        onPress={() => removePhoto(index)}
                        className="absolute -top-2 -right-2 bg-red-500 w-6 h-6 rounded-full items-center justify-center"
                      >
                        <Ionicons name="close" size={14} color="white" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              {photos.length === 0 && (
                <View className="bg-yellow-50 rounded-lg p-3 mb-4 flex-row items-center">
                  <Ionicons name="camera-outline" size={18} color="#d97706" />
                  <Text className="text-yellow-700 text-sm ml-2">
                    Agrega al menos 1 foto para continuar
                  </Text>
                </View>
              )}

              {/* Submit button */}
              <Pressable
                onPress={handleAddService}
                disabled={
                  !serviceType ||
                  !location ||
                  photos.length === 0 ||
                  createService.isPending
                }
                className={`py-4 rounded-xl items-center ${
                  !serviceType ||
                  !location ||
                  photos.length === 0 ||
                  createService.isPending
                    ? "bg-gray-300"
                    : "bg-primary-600 active:bg-primary-700"
                }`}
              >
                {createService.isPending ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-semibold text-base">
                    Registrar servicio
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Service Detail Modal */}
      <Modal
        visible={!!selectedService}
        animationType="slide"
        transparent
      >
        <View className="flex-1 justify-end">
          <Pressable className="flex-1" onPress={closeDetail} />
          <View className="bg-white rounded-t-2xl px-6 pt-6 pb-10 border-t border-gray-200 max-h-[85%]">
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedService && (
                <>
                  {/* Header */}
                  <View className="flex-row items-center justify-between mb-4">
                    <View className="flex-row items-center gap-3">
                      <Text className="text-xl font-bold text-gray-900">
                        {SERVICE_TYPE_LABELS[selectedService.service_type] ??
                          selectedService.service_type}
                      </Text>
                      <View
                        style={{
                          backgroundColor:
                            SERVICE_STATUS_COLORS[selectedService.status] ??
                            "#6b7280",
                        }}
                        className="px-3 py-1 rounded-full"
                      >
                        <Text className="text-white text-xs font-semibold">
                          {SERVICE_STATUS_LABELS[selectedService.status] ??
                            selectedService.status}
                        </Text>
                      </View>
                    </View>
                    <Pressable onPress={closeDetail}>
                      <Ionicons name="close" size={24} color="#6b7280" />
                    </Pressable>
                  </View>

                  {/* Notes */}
                  {selectedService.notes && (
                    <View className="bg-gray-50 rounded-lg p-3 mb-4">
                      <Text className="text-sm text-gray-600 italic">
                        &ldquo;{selectedService.notes}&rdquo;
                      </Text>
                    </View>
                  )}

                  {/* Created date */}
                  {selectedService.created_at && (
                    <Text className="text-xs text-gray-400 mb-4">
                      Creado:{" "}
                      {new Date(selectedService.created_at).toLocaleDateString(
                        "es",
                        {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )}
                    </Text>
                  )}

                  {/* Photo gallery grid */}
                  {servicePhotos && servicePhotos.length > 0 && (
                    <View className="mb-4">
                      <Text className="text-sm font-medium text-gray-700 mb-2">
                        Fotos ({servicePhotos.length})
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View className="flex-row gap-2">
                          {servicePhotos.map((photo) => (
                            <View key={photo.id} className="relative">
                              <Image
                                source={{ uri: getPhotoUrl(photo.storage_path) }}
                                className="w-28 h-28 rounded-lg bg-gray-200"
                                resizeMode="cover"
                              />
                              {photo.service_status && (
                                <View
                                  style={{
                                    backgroundColor:
                                      SERVICE_STATUS_COLORS[
                                        photo.service_status as ServiceStatus
                                      ] ?? "#6b7280",
                                  }}
                                  className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded"
                                >
                                  <Text className="text-white text-[10px] font-semibold">
                                    {SERVICE_STATUS_LABELS[
                                      photo.service_status as ServiceStatus
                                    ] ?? photo.service_status}
                                  </Text>
                                </View>
                              )}
                              {photo.caption && (
                                <View className="absolute bottom-0 left-0 right-0 bg-black/50 rounded-b-lg px-1.5 py-1">
                                  <Text className="text-white text-[10px]" numberOfLines={1}>
                                    {photo.caption}
                                  </Text>
                                </View>
                              )}
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  )}

                  {/* Status change section */}
                  {!pendingStatus && (
                    <>
                      <Text className="text-sm font-medium text-gray-700 mb-2">
                        Cambiar estado
                      </Text>
                      <View className="flex-row gap-2 mb-4">
                        {(
                          Object.keys(SERVICE_STATUS_COLORS) as ServiceStatus[]
                        )
                          .filter((s) => s !== selectedService.status)
                          .map((status) => (
                            <Pressable
                              key={status}
                              onPress={() => handleStatusChange(status)}
                              style={{
                                borderColor:
                                  SERVICE_STATUS_COLORS[status] ?? "#6b7280",
                              }}
                              className="flex-1 py-3 rounded-xl border-2 items-center active:opacity-70"
                            >
                              <Text
                                style={{
                                  color:
                                    SERVICE_STATUS_COLORS[status] ?? "#6b7280",
                                }}
                                className="text-sm font-semibold"
                              >
                                {SERVICE_STATUS_LABELS[status] ?? status}
                              </Text>
                            </Pressable>
                          ))}
                      </View>
                    </>
                  )}

                  {/* Pending status change — photos + notes */}
                  {pendingStatus && (
                    <View className="bg-blue-50 rounded-xl p-4 mb-4">
                      <Text className="text-sm font-medium text-blue-900 mb-1">
                        Cambiar a:{" "}
                        {SERVICE_STATUS_LABELS[pendingStatus] ?? pendingStatus}
                      </Text>
                      <Text className="text-xs text-blue-700 mb-3">
                        Agrega al menos 1 foto y opcionalmente una nota
                      </Text>

                      {/* Notes for status change */}
                      <TextInput
                        className="border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 bg-white mb-3"
                        placeholder="Notas (opcional)..."
                        value={statusNotes}
                        onChangeText={setStatusNotes}
                        multiline
                        numberOfLines={2}
                      />

                      {/* Photo capture buttons */}
                      <View className="flex-row gap-2 mb-3">
                        <Pressable
                          onPress={handleStatusCamera}
                          className="flex-1 bg-blue-600 py-2.5 rounded-xl items-center flex-row justify-center active:bg-blue-700"
                        >
                          <Ionicons name="camera" size={18} color="white" />
                          <Text className="text-white font-medium ml-1.5 text-sm">
                            Cámara
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={handleStatusGallery}
                          className="flex-1 bg-blue-600 py-2.5 rounded-xl items-center flex-row justify-center active:bg-blue-700"
                        >
                          <Ionicons name="images" size={18} color="white" />
                          <Text className="text-white font-medium ml-1.5 text-sm">
                            Galería
                          </Text>
                        </Pressable>
                      </View>

                      {/* Status photo previews */}
                      {statusPhotos.length > 0 && (
                        <View className="flex-row flex-wrap gap-2 mb-3">
                          {statusPhotos.map((photo, index) => (
                            <View key={photo.uri} className="relative">
                              <Image
                                source={{ uri: photo.uri }}
                                className="w-20 h-20 rounded-lg"
                                resizeMode="cover"
                              />
                              <Pressable
                                onPress={() => removeStatusPhoto(index)}
                                className="absolute -top-2 -right-2 bg-red-500 w-6 h-6 rounded-full items-center justify-center"
                              >
                                <Ionicons name="close" size={14} color="white" />
                              </Pressable>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Confirm / Cancel */}
                      <View className="flex-row gap-2">
                        <Pressable
                          onPress={() => {
                            setPendingStatus(null);
                            setStatusPhotos([]);
                            setStatusNotes("");
                          }}
                          className="flex-1 py-3 rounded-xl border border-gray-300 items-center active:bg-gray-50"
                        >
                          <Text className="text-gray-700 font-medium">
                            Cancelar
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={confirmStatusChange}
                          disabled={updateStatus.isPending || statusPhotos.length === 0}
                          className={`flex-1 py-3 rounded-xl items-center ${
                            statusPhotos.length === 0
                              ? "bg-gray-300"
                              : "bg-blue-600 active:bg-blue-700"
                          }`}
                        >
                          {updateStatus.isPending ? (
                            <ActivityIndicator color="white" />
                          ) : (
                            <Text className="text-white font-semibold">
                              Confirmar
                            </Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {/* Add extra photos — hidden during status change */}
                  {!pendingStatus && (
                    <View className="flex-row gap-2 mb-4">
                      <Pressable
                        onPress={() => handleAddExtraPhotos("camera")}
                        disabled={addPhotos.isPending}
                        className="flex-1 flex-row items-center justify-center bg-gray-100 py-3 rounded-xl active:bg-gray-200"
                      >
                        {addPhotos.isPending ? (
                          <ActivityIndicator color="#374151" />
                        ) : (
                          <>
                            <Ionicons name="camera-outline" size={18} color="#374151" />
                            <Text className="text-gray-700 font-medium ml-1.5 text-sm">
                              Foto
                            </Text>
                          </>
                        )}
                      </Pressable>
                      <Pressable
                        onPress={() => handleAddExtraPhotos("gallery")}
                        disabled={addPhotos.isPending}
                        className="flex-1 flex-row items-center justify-center bg-gray-100 py-3 rounded-xl active:bg-gray-200"
                      >
                        {addPhotos.isPending ? (
                          <ActivityIndicator color="#374151" />
                        ) : (
                          <>
                            <Ionicons name="images-outline" size={18} color="#374151" />
                            <Text className="text-gray-700 font-medium ml-1.5 text-sm">
                              Galería
                            </Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  )}

                  {/* Activity Timeline */}
                  {timeline.length > 0 && (
                    <View className="mb-4">
                      <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Actividad
                      </Text>
                      {timeline.map((event) => (
                        <View key={event.id} className="flex-row mb-4">
                          {/* Timeline dot + line */}
                          <View className="items-center mr-3">
                            <View
                              className="w-8 h-8 rounded-full items-center justify-center"
                              style={{
                                backgroundColor: event.type === "status_change" ? "#dbeafe" : "#f3f4f6",
                              }}
                            >
                              <Ionicons
                                name={event.type === "status_change" ? "sync" : "camera"}
                                size={14}
                                color={event.type === "status_change" ? "#2563eb" : "#6b7280"}
                              />
                            </View>
                          </View>

                          {/* Content */}
                          <View className="flex-1">
                            <View className="flex-row items-center justify-between">
                              <Text className="text-sm text-gray-900 flex-1" numberOfLines={2}>
                                {event.userName ? (
                                  <Text className="font-semibold">{event.userName} </Text>
                                ) : null}
                                {event.description}
                              </Text>
                              {event.status && (
                                <View
                                  style={{
                                    borderColor: SERVICE_STATUS_COLORS[event.status] ?? "#6b7280",
                                  }}
                                  className="ml-2 px-2 py-0.5 rounded border"
                                >
                                  <Text
                                    style={{
                                      color: SERVICE_STATUS_COLORS[event.status] ?? "#6b7280",
                                    }}
                                    className="text-[10px] font-semibold"
                                  >
                                    {SERVICE_STATUS_LABELS[event.status] ?? event.status}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text className="text-xs text-gray-400 mt-0.5">
                              {new Date(event.timestamp).toLocaleDateString("es", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </Text>
                            {event.note && (
                              <Text className="text-xs text-gray-500 italic mt-1">
                                &ldquo;{event.note}&rdquo;
                              </Text>
                            )}
                            {event.photoUrls && event.photoUrls.length > 0 && (
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                className="mt-2"
                              >
                                <View className="flex-row gap-1.5">
                                  {event.photoUrls.map((url, i) => (
                                    <Image
                                      key={`${event.id}-${i}`}
                                      source={{ uri: url }}
                                      className="w-16 h-16 rounded bg-gray-200"
                                      resizeMode="cover"
                                    />
                                  ))}
                                </View>
                              </ScrollView>
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Empty state */}
                  {servicePhotos && servicePhotos.length === 0 && timeline.length === 0 && (
                    <View className="bg-gray-50 rounded-lg p-4 mb-4">
                      <Text className="text-sm text-gray-400 text-center">
                        Sin actividad registrada
                      </Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
