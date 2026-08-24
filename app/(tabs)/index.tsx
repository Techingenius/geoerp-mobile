import { useState, useCallback } from "react";
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
import { Card, CardContent } from "../../components/ui/Card";
import { Badge, PROJECT_STATUS_BADGE } from "../../components/ui/Badge";
import { SearchBar } from "../../components/ui/SearchBar";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ProjectCard({ project }: { project: Project }) {
  const badge = PROJECT_STATUS_BADGE[project.status] ?? {
    label: project.status,
    variant: "muted" as const,
  };

  return (
    <Pressable
      onPress={() => router.push(`/project/${project.id}`)}
      className="active:opacity-90"
    >
      <Card className="mb-3">
        <CardContent>
          {/* Header: name + badge */}
          <View className="flex-row items-start justify-between mb-2">
            <View className="flex-1 mr-3">
              <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
                {project.name}
              </Text>
            </View>
            <Badge label={badge.label} variant={badge.variant} />
          </View>

          {/* Description */}
          {project.description && (
            <Text className="text-sm text-gray-600 mb-3" numberOfLines={2}>
              {project.description}
            </Text>
          )}

          {/* Footer: date + map link */}
          <View className="flex-row items-center justify-between mt-1">
            {project.start_date ? (
              <View className="flex-row items-center">
                <Ionicons name="calendar-outline" size={13} color="#9CA3AF" />
                <Text className="text-xs text-gray-400 ml-1">
                  {formatDate(project.start_date)}
                </Text>
              </View>
            ) : (
              <View />
            )}
            <View className="flex-row items-center">
              <Ionicons name="map-outline" size={14} color="#2563eb" />
              <Text className="text-xs font-medium text-primary-600 ml-1">Ver en mapa</Text>
            </View>
          </View>
        </CardContent>
      </Card>
    </Pressable>
  );
}

function EmptyState() {
  return (
    <View className="flex-1 items-center justify-center px-8 pt-20">
      <View className="w-16 h-16 rounded-full bg-gray-100 items-center justify-center mb-4">
        <Ionicons name="folder-open-outline" size={32} color="#9CA3AF" />
      </View>
      <Text className="text-lg font-semibold text-gray-800 text-center">
        Sin proyectos
      </Text>
      <Text className="text-sm text-gray-500 text-center mt-2">
        Los proyectos asignados apareceran aqui.
      </Text>
    </View>
  );
}

export default function ProjectsScreen() {
  const [search, setSearch] = useState("");
  const { data: projects, isLoading, error, isRefetching, refetch } = useProjects();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Client-side filter for search
  const filteredProjects = projects?.filter((p) =>
    search.trim()
      ? p.name.toLowerCase().includes(search.trim().toLowerCase())
      : true,
  );

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
      {/* Search */}
      <View className="px-4 pt-3 pb-2 bg-white border-b border-gray-100">
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar proyecto..."
        />
      </View>

      <FlatList
        data={filteredProjects}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ProjectCard project={item} />}
        contentContainerStyle={{ padding: 16 }}
        contentContainerClassName={
          (filteredProjects ?? []).length === 0 ? "flex-1" : undefined
        }
        ListEmptyComponent={<EmptyState />}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor="#2563eb"
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
