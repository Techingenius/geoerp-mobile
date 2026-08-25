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
  useAddServicePhoto,
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

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: project, isLoading: loadingProject } = useProject(id);
  const { data: segments } = useProjectSegments(id);
  const { data: services } = useProjectServices(id);
  const { location } = useLocation();
  const createService = useCreateService();
  const updateStatus = useUpdateServiceStatus();
  const addPhoto = useAddServicePhoto();

  const [showAddService, setShowAddService] = useState(false);
  const [serviceType, setServiceType] = useState("");
  const [serviceNotes, setServiceNotes] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [pendingStatus, setPendingStatus] = useState<ServiceStatus | null>(null);
  const [statusPhoto, setStatusPhoto] = useState<PhotoItem | null>(null);

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

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permiso requerido", "Se necesita acceso a la cámara");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      exif: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const filename =
        asset.fileName ?? `photo_${Date.now()}.jpg`;
      setPhotos((prev) => [
        ...prev,
        {
          uri: asset.uri,
          filename,
          mimeType: asset.mimeType ?? "image/jpeg",
        },
      ]);
    }
  };

  const pickFromGallery = async () => {
    const { status } =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permiso requerido", "Se necesita acceso a la galería");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });

    if (!result.canceled) {
      const newPhotos = result.assets.map((asset) => ({
        uri: asset.uri,
        filename: asset.fileName ?? `photo_${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? "image/jpeg",
      }));
      setPhotos((prev) => [...prev, ...newPhotos]);
    }
  };

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

  const takeStatusPhoto = async (): Promise<PhotoItem | null> => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permiso requerido", "Se necesita acceso a la cámara");
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      return {
        uri: asset.uri,
        filename: asset.fileName ?? `photo_${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? "image/jpeg",
      };
    }
    return null;
  };

  const handleStatusChange = (newStatus: ServiceStatus) => {
    setPendingStatus(newStatus);
    setStatusPhoto(null);
  };

  const handleTakeStatusPhoto = async () => {
    const photo = await takeStatusPhoto();
    if (photo) setStatusPhoto(photo);
  };

  const confirmStatusChange = async () => {
    if (!selectedService || !pendingStatus || !statusPhoto) return;
    try {
      await updateStatus.mutateAsync({
        serviceId: selectedService.id,
        status: pendingStatus,
        photo: statusPhoto,
      });
      setSelectedService((prev) =>
        prev ? { ...prev, status: pendingStatus } : null
      );
      setPendingStatus(null);
      setStatusPhoto(null);
      Alert.alert("Estado actualizado", `Servicio marcado como ${SERVICE_STATUS_LABELS[pendingStatus] ?? pendingStatus}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Error al actualizar";
      Alert.alert("Error", msg);
    }
  };

  const handleAddExtraPhoto = async () => {
    if (!selectedService) return;
    const photo = await takeStatusPhoto();
    if (!photo) return;
    try {
      await addPhoto.mutateAsync({
        serviceId: selectedService.id,
        photo,
      });
      Alert.alert("Foto agregada", "La foto se subió exitosamente");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Error al subir foto";
      Alert.alert("Error", msg);
    }
  };

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
            <Text className="text-xs text-gray-400">
              {services?.length ?? 0} servicios · {segments?.length ?? 0} tramos
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
                  onPress={takePhoto}
                  className="flex-1 flex-row items-center justify-center bg-gray-100 py-3 rounded-xl active:bg-gray-200"
                >
                  <Ionicons name="camera" size={20} color="#374151" />
                  <Text className="text-gray-700 font-medium ml-2">Cámara</Text>
                </Pressable>
                <Pressable
                  onPress={pickFromGallery}
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
          <Pressable
            className="flex-1"
            onPress={() => {
              setSelectedService(null);
              setPendingStatus(null);
              setStatusPhoto(null);
            }}
          />
          <View className="bg-white rounded-t-2xl px-6 pt-6 pb-10 border-t border-gray-200 max-h-[75%]">
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
                    <Pressable
                      onPress={() => {
                        setSelectedService(null);
                        setPendingStatus(null);
                        setStatusPhoto(null);
                      }}
                    >
                      <Ionicons name="close" size={24} color="#6b7280" />
                    </Pressable>
                  </View>

                  {/* Notes */}
                  {selectedService.notes && (
                    <View className="bg-gray-50 rounded-lg p-3 mb-4">
                      <Text className="text-sm text-gray-600">
                        {selectedService.notes}
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

                  {/* Pending status change - need photo */}
                  {pendingStatus && (
                    <View className="bg-blue-50 rounded-xl p-4 mb-4">
                      <Text className="text-sm font-medium text-blue-900 mb-3">
                        Cambiar a:{" "}
                        {SERVICE_STATUS_LABELS[pendingStatus] ?? pendingStatus}
                      </Text>
                      <Text className="text-xs text-blue-700 mb-3">
                        Se requiere foto para confirmar el cambio de estado
                      </Text>

                      {!statusPhoto && (
                        <Pressable
                          onPress={handleTakeStatusPhoto}
                          className="bg-blue-600 py-3 rounded-xl items-center flex-row justify-center active:bg-blue-700"
                        >
                          <Ionicons name="camera" size={20} color="white" />
                          <Text className="text-white font-semibold ml-2">
                            Tomar foto
                          </Text>
                        </Pressable>
                      )}

                      {statusPhoto && (
                        <>
                          <Image
                            source={{ uri: statusPhoto.uri }}
                            className="w-full h-32 rounded-lg mb-3"
                            resizeMode="cover"
                          />
                          <View className="flex-row gap-2">
                            <Pressable
                              onPress={() => {
                                setPendingStatus(null);
                                setStatusPhoto(null);
                              }}
                              className="flex-1 py-3 rounded-xl border border-gray-300 items-center active:bg-gray-50"
                            >
                              <Text className="text-gray-700 font-medium">
                                Cancelar
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={confirmStatusChange}
                              disabled={updateStatus.isPending}
                              className="flex-1 py-3 rounded-xl bg-blue-600 items-center active:bg-blue-700"
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
                        </>
                      )}
                    </View>
                  )}

                  {/* Add extra photo button */}
                  <Pressable
                    onPress={handleAddExtraPhoto}
                    disabled={addPhoto.isPending}
                    className="flex-row items-center justify-center bg-gray-100 py-3 rounded-xl mb-4 active:bg-gray-200"
                  >
                    {addPhoto.isPending ? (
                      <ActivityIndicator color="#374151" />
                    ) : (
                      <>
                        <Ionicons
                          name="camera-outline"
                          size={20}
                          color="#374151"
                        />
                        <Text className="text-gray-700 font-medium ml-2">
                          Agregar foto
                        </Text>
                      </>
                    )}
                  </Pressable>

                  {/* Photo history */}
                  <Text className="text-sm font-medium text-gray-700 mb-2">
                    Historial de fotos ({servicePhotos?.length ?? 0})
                  </Text>
                  {servicePhotos && servicePhotos.length > 0 ? (
                    <View className="flex-row flex-wrap gap-2 mb-4">
                      {servicePhotos.map((photo) => (
                        <View key={photo.id} className="w-20">
                          <Image
                            source={{ uri: getPhotoUrl(photo.storage_path) }}
                            className="w-20 h-20 rounded-lg bg-gray-200"
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
                              className="mt-1 rounded px-1 py-0.5"
                            >
                              <Text className="text-white text-[10px] text-center font-medium">
                                {SERVICE_STATUS_LABELS[
                                  photo.service_status as ServiceStatus
                                ] ?? photo.service_status}
                              </Text>
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View className="bg-gray-50 rounded-lg p-3 mb-4">
                      <Text className="text-sm text-gray-400 text-center">
                        Sin fotos registradas
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
