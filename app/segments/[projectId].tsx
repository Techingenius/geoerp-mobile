import { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, router, Stack } from "expo-router";
import MapView, { Marker, Polyline } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { useProject } from "../../lib/api/projects";
import { useMyCrews } from "../../lib/api/crews";
import {
  useSegmentProgress,
  activityLabel,
  formatQty,
  SEGMENT_STATE_COLOR,
  SEGMENT_STATE_LABEL,
  UNIT_SUFFIX,
  type SegmentActivity,
  type SegmentWithProgress,
} from "../../lib/api/segments";
import { useAuthStore } from "../../lib/stores/auth-store";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { ChipSelect, type ChipOption } from "../../components/ui/ChipSelect";
import type { GeoLineString, SegmentState } from "../../types/database";

const STATE_BADGE_VARIANT: Record<
  SegmentState,
  "default" | "success" | "warning" | "muted"
> = {
  unassigned: "muted",
  assigned: "default",
  in_progress: "warning",
  complete: "success",
  approved: "success",
};

function formatPlannedDate(date: string | null): string {
  if (!date) return "Sin fecha planeada";
  const [y, m, d] = date.split("-").map(Number);
  // Built from parts, not `new Date(date)`: parsing `2026-10-24` as a string
  // gives UTC midnight, which is the day before in any negative offset.
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function toLatLngs(geometry: GeoLineString | null) {
  return (geometry?.coordinates ?? []).map((coord) => ({
    latitude: coord[1],
    longitude: coord[0],
  }));
}

/** The point halfway along the drawn line — where the tap target goes. */
function midpoint(geometry: GeoLineString | null) {
  const coords = toLatLngs(geometry);
  if (coords.length === 0) return null;
  return coords[Math.floor(coords.length / 2)];
}

function ActivityRow({
  activity,
  onReport,
}: {
  activity: SegmentActivity;
  onReport: () => void;
}) {
  const suffix = UNIT_SUFFIX[activity.unit_type];
  const done = activity.approved_units + activity.reported_units;
  const pct = activity.planned_qty
    ? Math.min(100, Math.round((done / activity.planned_qty) * 100))
    : 0;

  return (
    <Pressable
      onPress={onReport}
      accessibilityRole="button"
      accessibilityLabel={`Reportar ${activityLabel(activity)}`}
      className="border border-gray-200 rounded-xl px-3 py-2.5 gap-2 active:bg-gray-50"
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1 font-semibold text-gray-900" numberOfLines={1}>
          {activityLabel(activity)}
        </Text>
        <Ionicons name="add-circle" size={22} color="#2563eb" />
      </View>

      {/* Approved is what is billable, so it gets the solid bar; what is
          reported but not yet admin-approved is shown lighter next to it. */}
      <View className="h-2 rounded-full bg-gray-100 overflow-hidden flex-row">
        <View
          className="bg-emerald-500 h-full"
          style={{
            width: `${activity.planned_qty ? Math.min(100, (activity.approved_units / activity.planned_qty) * 100) : 0}%`,
          }}
        />
        <View
          className="bg-amber-400 h-full"
          style={{
            width: `${activity.planned_qty ? Math.min(100, (activity.reported_units / activity.planned_qty) * 100) : 0}%`,
          }}
        />
      </View>

      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-gray-500">
          {formatQty(done)} / {formatQty(activity.planned_qty)} {suffix} ·{" "}
          {pct}%
        </Text>
        <Text
          className={`text-xs font-medium ${
            activity.remaining > 0 ? "text-primary-700" : "text-emerald-700"
          }`}
        >
          {activity.remaining > 0
            ? `Faltan ${formatQty(activity.remaining)} ${suffix}`
            : "Plan cumplido"}
        </Text>
      </View>
    </Pressable>
  );
}

function SegmentCard({
  segment,
  selected,
  onSelect,
  onReport,
}: {
  segment: SegmentWithProgress;
  selected: boolean;
  onSelect: () => void;
  onReport: (activity: SegmentActivity | null) => void;
}) {
  return (
    <Pressable onPress={onSelect} className="active:opacity-90">
      <Card className={`mb-3 ${selected ? "border-primary-600" : ""}`}>
        <CardContent className="gap-3">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text
                className="text-base font-semibold text-gray-900"
                numberOfLines={1}
              >
                {segment.name}
              </Text>
              <Text className="text-xs text-gray-500 mt-0.5">
                {formatPlannedDate(segment.planned_date)}
                {segment.length_ft !== null
                  ? ` · ${formatQty(segment.length_ft)} ft`
                  : ""}
              </Text>
            </View>
            <Badge
              label={SEGMENT_STATE_LABEL[segment.state]}
              variant={STATE_BADGE_VARIANT[segment.state]}
            />
          </View>

          {segment.activities.length === 0 ? (
            <View className="gap-2">
              <Text className="text-sm text-gray-500">
                Este tramo todavía no tiene actividades planeadas.
              </Text>
              <Button
                title="Reportar producción"
                onPress={() => onReport(null)}
                icon={<Ionicons name="add" size={18} color="white" />}
              />
            </View>
          ) : (
            <View className="gap-2">
              {segment.activities.map((activity) => (
                <ActivityRow
                  key={activity.activity_id}
                  activity={activity}
                  onReport={() => onReport(activity)}
                />
              ))}
            </View>
          )}
        </CardContent>
      </Card>
    </Pressable>
  );
}

export default function MySegmentsScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const userId = useAuthStore((s) => s.user?.id);
  const role = useAuthStore((s) => s.role);

  const { data: project } = useProject(projectId);
  const { data: myCrews, isLoading: loadingCrews } = useMyCrews(userId);

  const [crewId, setCrewId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);
  const listRef = useRef<FlatList<SegmentWithProgress>>(null);
  const fittedRef = useRef(false);

  // A crew lead is on one crew and never picks; the chips only appear for
  // someone on two. An admin or supervisor gets `null` — every segment of the
  // project, assigned or not — because their job is the whole plan, and that
  // holds even for a supervisor who also sits on a crew's roster.
  const seesAllSegments = role === "admin" || role === "supervisor";
  const activeCrewId = seesAllSegments
    ? null
    : (crewId ?? myCrews?.[0]?.id ?? null);

  const {
    data: segments,
    isLoading,
    error,
    isRefetching,
    refetch,
  } = useSegmentProgress(projectId, activeCrewId);

  const crewOptions: ChipOption[] = useMemo(
    () => (myCrews ?? []).map((crew) => ({ value: crew.id, label: crew.name })),
    [myCrews],
  );

  const fitToSegments = useCallback((rows: SegmentWithProgress[]) => {
    const coords = rows.flatMap((segment) => toLatLngs(segment.geometry));
    if (coords.length === 0) return;
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
      animated: true,
    });
  }, []);

  // Fit once per screen, not on every refetch: re-fitting under a crew that is
  // walking the line yanks the map back while they are reading it.
  const onMapReady = useCallback(() => {
    if (fittedRef.current || !segments) return;
    fittedRef.current = true;
    fitToSegments(segments);
  }, [segments, fitToSegments]);

  const selectSegment = useCallback(
    (segment: SegmentWithProgress) => {
      setSelectedId(segment.id);
      const index = (segments ?? []).findIndex((s) => s.id === segment.id);
      if (index >= 0) {
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
      }
      const center = midpoint(segment.geometry);
      if (center) {
        mapRef.current?.animateCamera({ center, zoom: 16 }, { duration: 400 });
      }
    },
    [segments],
  );

  const goReport = useCallback(
    (segment: SegmentWithProgress, activity: SegmentActivity | null) => {
      router.push({
        pathname: "/production/[projectId]",
        params: {
          projectId,
          segmentId: segment.id,
          ...(activity ? { budgetLineId: activity.budget_line_id } : {}),
        },
      });
    },
    [projectId],
  );

  const header = (
    <Stack.Screen
      options={{
        title: "Mis tramos",
        headerRight: () => (
          <Pressable
            onPress={() => router.push(`/production/${projectId}`)}
            hitSlop={10}
            className="flex-row items-center active:opacity-60"
          >
            <Ionicons name="stats-chart" size={18} color="#1d4ed8" />
            <Text className="text-primary-700 font-semibold ml-1.5">
              Producción
            </Text>
          </Pressable>
        ),
      }}
    />
  );

  if (isLoading || loadingCrews) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="text-gray-500 mt-3">Cargando tramos...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 px-8">
        {header}
        <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
        <Text className="text-red-600 text-center mt-3">
          No se pudieron cargar los tramos
        </Text>
        <Pressable
          onPress={() => refetch()}
          className="mt-4 bg-primary-600 px-6 py-2.5 rounded-lg active:bg-primary-700"
        >
          <Text className="text-white font-medium">Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  const rows = segments ?? [];
  const withGeometry = rows.filter((segment) => segment.geometry !== null);

  return (
    <View className="flex-1 bg-gray-50">
      {header}

      <View className="h-56 bg-gray-200">
        {withGeometry.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Ionicons name="map-outline" size={32} color="#9ca3af" />
            <Text className="text-xs text-gray-500 text-center mt-2">
              Los tramos asignados no tienen trazo dibujado todavía.
            </Text>
          </View>
        ) : (
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            onMapReady={onMapReady}
            showsUserLocation
            showsMyLocationButton={false}
          >
            {withGeometry.map((segment) => {
              const coords = toLatLngs(segment.geometry);
              const selected = segment.id === selectedId;
              return (
                <Polyline
                  key={segment.id}
                  coordinates={coords}
                  strokeColor={SEGMENT_STATE_COLOR[segment.state]}
                  strokeWidth={selected ? 8 : 5}
                  tappable
                  onPress={() => selectSegment(segment)}
                />
              );
            })}

            {/* A 5pt line is a poor target with gloves on, and Android's
                polyline hit area is thinner than iOS's. The midpoint marker
                is what the crew actually taps.

                `pinColor` is exact on Apple Maps and quantised to Google's
                marker hues on Android, so the pin is a near shade there, not
                the same hex. The polyline carries the exact colour on both. */}
            {withGeometry.map((segment) => {
              const center = midpoint(segment.geometry);
              if (!center) return null;
              return (
                <Marker
                  key={`pin-${segment.id}`}
                  coordinate={center}
                  title={segment.name}
                  description={SEGMENT_STATE_LABEL[segment.state]}
                  pinColor={SEGMENT_STATE_COLOR[segment.state]}
                  onPress={() => selectSegment(segment)}
                />
              );
            })}
          </MapView>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SegmentCard
            segment={item}
            selected={item.id === selectedId}
            onSelect={() => selectSegment(item)}
            onReport={(activity) => goReport(item, activity)}
          />
        )}
        // scrollToIndex on rows of different heights needs a fallback, or a
        // tap on the map throws instead of scrolling.
        onScrollToIndexFailed={({ index }) =>
          listRef.current?.scrollToOffset({
            offset: index * 180,
            animated: true,
          })
        }
        ListHeaderComponent={
          <View className="gap-3 mb-3">
            <View>
              <Text className="text-sm text-gray-500" numberOfLines={1}>
                {project?.name ?? "Proyecto"}
              </Text>
              <Text className="text-xs text-gray-400">
                {rows.length === 1 ? "1 tramo" : `${rows.length} tramos`}
                {activeCrewId === null ? " · todas las cuadrillas" : ""}
              </Text>
            </View>

            {!seesAllSegments && crewOptions.length > 1 && (
              <ChipSelect
                label="Cuadrilla"
                options={crewOptions}
                selected={activeCrewId}
                onSelect={setCrewId}
              />
            )}
          </View>
        }
        ListEmptyComponent={
          <View className="items-center px-8 pt-10">
            <Ionicons name="git-branch-outline" size={40} color="#9ca3af" />
            <Text className="text-base font-semibold text-gray-800 text-center mt-3">
              Sin tramos asignados
            </Text>
            <Text className="text-sm text-gray-500 text-center mt-1">
              Cuando tu supervisor te asigne un tramo de este proyecto va a
              aparecer acá.
            </Text>
          </View>
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#2563eb"
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
