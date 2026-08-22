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
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import MapView, { Marker, Polyline } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import {
  useProject,
  useProjectSegments,
  useProjectServices,
} from "../../lib/api/projects";
import { useCreateService } from "../../lib/api/services";
import { useLocation } from "../../lib/hooks/use-location";
import type { Service } from "../../types/database";

const SERVICE_STATUS_COLORS: Record<string, string> = {
  pending: "#6b7280",
  located: "#f59e0b",
  approved: "#22c55e",
  completed: "#3b82f6",
  not_found: "#ef4444",
};

const SERVICE_TYPES = [
  "Gas",
  "Water",
  "Sewer",
  "Electric",
  "Telecom",
  "Storm Drain",
  "Other",
];

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: project, isLoading: loadingProject } = useProject(id);
  const { data: segments } = useProjectSegments(id);
  const { data: services } = useProjectServices(id);
  const { location } = useLocation();
  const createService = useCreateService();

  const [showAddService, setShowAddService] = useState(false);
  const [serviceType, setServiceType] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [selectedService, setSelectedService] = useState<Service | null>(null);

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

  const handleAddService = async () => {
    if (!serviceType) {
      Alert.alert("Error", "Selecciona un tipo de servicio");
      return;
    }
    if (!location) {
      Alert.alert("Error", "No se pudo obtener la ubicación GPS");
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
        description: serviceDescription || undefined,
        latitude: location!.latitude,
        longitude: location!.longitude,
      });
      setShowAddService(false);
      setServiceType("");
      setServiceDescription("");
      Alert.alert("Servicio creado", "El servicio se registró exitosamente");
    } catch (error: any) {
      Alert.alert("Error", error.message || "No se pudo crear el servicio");
    }
  };

  return (
    <View className="flex-1">
      <MapView
        className="flex-1"
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
          const coords = service.location?.coordinates;
          if (!coords) return null;
          return (
            <Marker
              key={service.id}
              coordinate={{
                latitude: coords[1],
                longitude: coords[0],
              }}
              pinColor={SERVICE_STATUS_COLORS[service.status] ?? "#6b7280"}
              title={service.service_type}
              description={`Estado: ${service.status}`}
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
              <Text className="text-xs text-gray-400 capitalize">{status}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Add Service Modal */}
      <Modal visible={showAddService} animationType="slide" transparent>
        <View className="flex-1 justify-end">
          <Pressable
            className="flex-1"
            onPress={() => setShowAddService(false)}
          />
          <View className="bg-white rounded-t-2xl px-6 pt-6 pb-10 border-t border-gray-200">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xl font-bold text-gray-900">
                Nuevo servicio
              </Text>
              <Pressable onPress={() => setShowAddService(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </Pressable>
            </View>

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
                      {type}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text className="text-sm font-medium text-gray-700 mb-2">
              Descripción (opcional)
            </Text>
            <TextInput
              className="border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 bg-gray-50 mb-4"
              placeholder="Notas adicionales..."
              value={serviceDescription}
              onChangeText={setServiceDescription}
              multiline
              numberOfLines={2}
            />

            <Pressable
              onPress={handleAddService}
              disabled={!serviceType || !location || createService.isPending}
              className={`py-4 rounded-xl items-center ${
                !serviceType || !location || createService.isPending
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
          </View>
        </View>
      </Modal>
    </View>
  );
}
