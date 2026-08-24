import {
  View,
  Text,
  FlatList,
  Pressable,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useProjects } from "../../lib/api/projects";
import type { Project } from "../../types/database";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  completed: "bg-blue-100 text-blue-800",
  on_hold: "bg-yellow-100 text-yellow-800",
  cancelled: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Activo",
  completed: "Completado",
  on_hold: "En pausa",
  cancelled: "Cancelado",
};

function ProjectCard({ project }: { project: Project }) {
  return (
    <Pressable
      onPress={() => router.push(`/project/${project.id}`)}
      className="bg-white rounded-xl p-4 mb-3 border border-gray-100 active:bg-gray-50"
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-lg font-semibold text-gray-900 flex-1 mr-2">
          {project.name}
        </Text>
        <View
          className={`px-2.5 py-1 rounded-full ${
            STATUS_COLORS[project.status] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          <Text className="text-xs font-medium">
            {STATUS_LABELS[project.status] ?? project.status}
          </Text>
        </View>
      </View>

      {project.description && (
        <Text className="text-gray-500 text-sm mb-2" numberOfLines={2}>
          {project.description}
        </Text>
      )}

      <View className="flex-row items-center gap-4 mt-1">
        {project.start_date && (
          <View className="flex-row items-center gap-1">
            <Ionicons name="calendar-outline" size={14} color="#9ca3af" />
            <Text className="text-xs text-gray-400">
              {new Date(project.start_date).toLocaleDateString("es-MX")}
            </Text>
          </View>
        )}
        <View className="flex-row items-center gap-1">
          <Ionicons name="map-outline" size={14} color="#9ca3af" />
          <Text className="text-xs text-gray-400">Ver en mapa</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function ProjectsScreen() {
  const { data: projects, isLoading, error, refetch, isRefetching } = useProjects();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="text-gray-500 mt-3">Cargando proyectos...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 px-8">
        <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
        <Text className="text-red-600 text-center mt-3">
          Error al cargar proyectos
        </Text>
        <Pressable
          onPress={() => refetch()}
          className="mt-4 bg-primary-600 px-6 py-2.5 rounded-lg"
        >
          <Text className="text-white font-medium">Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ProjectCard project={item} />}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View className="items-center justify-center py-20">
            <Ionicons name="folder-open-outline" size={48} color="#d1d5db" />
            <Text className="text-gray-400 mt-3">
              No hay proyectos disponibles
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
