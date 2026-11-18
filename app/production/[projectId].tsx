import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useProject, useProjectSegments } from "../../lib/api/projects";
import {
  useActiveCrews,
  useCrewDefaultMembers,
  useCreateProductionEntry,
  useProjectProductionEntries,
} from "../../lib/api/production";
import {
  ProductionPhotoUploadError,
  useProductionPhotosByEntries,
  useProductionPhotoUrls,
  useUploadProductionEntryPhotos,
  type ProductionPhotoInput,
} from "../../lib/api/production-photos";
import { useLocation } from "../../lib/hooks/use-location";
import {
  captureProductionPhoto,
  type CapturedPhoto,
} from "../../lib/utils/capture-photo";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Card, CardContent } from "../../components/ui/Card";
import { ChipSelect, type ChipOption } from "../../components/ui/ChipSelect";
import { ProductionPhotoGrid } from "../../components/features/ProductionPhotoGrid";
import type {
  ProductionInternalStatus,
  UnitType,
} from "../../types/database";

const UNIT_TYPE_OPTIONS: { value: UnitType; label: string }[] = [
  { value: "drilling_ft", label: "Perforación (ft)" },
  { value: "aerial_ft", label: "Aéreo (ft)" },
  { value: "duct_ft", label: "Ducto (ft)" },
  { value: "trenching_ft", label: "Zanja (ft)" },
];

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

const NO_SEGMENT = "__none__";

/** What the pending retry banner needs to re-send only the photos. */
interface PendingPhotoUpload {
  entryId: string;
  projectId: string;
  photos: ProductionPhotoInput[];
  /** Named in the banner so the reporter knows which report it belongs to. */
  label: string;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** `2026-02-30` matches the format but is not a date. */
function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const parsed = new Date(Number(y), Number(m) - 1, Number(d));
  return (
    parsed.getFullYear() === Number(y) &&
    parsed.getMonth() === Number(m) - 1 &&
    parsed.getDate() === Number(d)
  );
}

const productionSchema = z.object({
  work_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD")
    .refine(isRealDate, "Esa fecha no existe")
    .refine(
      (value) => value <= toISODate(new Date()),
      "No puedes reportar producción futura",
    ),
  crew_id: z.string().min(1, "Selecciona una cuadrilla"),
  unit_type: z.enum(["drilling_ft", "aerial_ft", "duct_ft", "trenching_ft"]),
  // Kept as a string so the form's input and output types match; converted once
  // on submit. The column is NUMERIC(10,2).
  units_completed: z
    .string()
    .min(1, "Ingresa las unidades completadas")
    .refine(
      (value) => /^\d{1,8}(\.\d{1,2})?$/.test(value),
      "Usa un número con hasta 2 decimales",
    )
    .refine((value) => Number(value) > 0, "Debe ser mayor a 0"),
  line_segment_id: z.string(),
  notes: z.string().max(1000, "Máximo 1000 caracteres"),
});

type ProductionFormValues = z.infer<typeof productionSchema>;

export default function ProductionEntryScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  const { data: project, isLoading: loadingProject } = useProject(projectId);
  const { data: segments } = useProjectSegments(projectId);
  const { data: crews, isLoading: loadingCrews } = useActiveCrews();
  const { data: entries, isLoading: loadingEntries } =
    useProjectProductionEntries(projectId);
  const createEntry = useCreateProductionEntry();

  // Photos of the entries on screen, in one query rather than one per card.
  const entryIds = useMemo(
    () => (entries ?? []).map((entry) => entry.id),
    [entries],
  );
  const { data: photosByEntry } = useProductionPhotosByEntries(entryIds);
  const listPhotoPaths = useMemo(
    () =>
      Object.values(photosByEntry ?? {}).flatMap((list) =>
        list.map((photo) => photo.storage_path),
      ),
    [photosByEntry],
  );
  const { data: listPhotoUrls } = useProductionPhotoUrls(listPhotoPaths);

  const uploadPhotos = useUploadProductionEntryPhotos();
  const { location } = useLocation();
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [pendingUpload, setPendingUpload] =
    useState<PendingPhotoUpload | null>(null);

  const [memberIds, setMemberIds] = useState<string[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductionFormValues>({
    resolver: zodResolver(productionSchema),
    defaultValues: {
      work_date: toISODate(new Date()),
      crew_id: "",
      unit_type: "drilling_ft",
      units_completed: "",
      line_segment_id: NO_SEGMENT,
      notes: "",
    },
  });

  const crewId = watch("crew_id");
  const workDate = watch("work_date");
  const { data: defaultMembers } = useCrewDefaultMembers(crewId || undefined);

  // Picking a crew pre-selects its standing roster; the reporter then unchecks
  // whoever did not work the shift.
  //
  // Keyed on the crew, not on `defaultMembers` identity: the queryFn builds a
  // new array on every fetch, so depending on the data meant any late refetch
  // silently restored someone the reporter had just unchecked — and that lands
  // in payroll.
  const prefilledCrewRef = useRef<string | null>(null);
  useEffect(() => {
    if (prefilledCrewRef.current === crewId) return;
    if (!defaultMembers) {
      // Crew just changed; drop the previous crew's roster right away rather
      // than leaving their names selected until the new one arrives.
      setMemberIds([]);
      return;
    }
    prefilledCrewRef.current = crewId;
    setMemberIds(defaultMembers.map((m) => m.user_id));
  }, [crewId, defaultMembers]);

  const crewOptions: ChipOption[] = useMemo(
    () => (crews ?? []).map((crew) => ({ value: crew.id, label: crew.name })),
    [crews],
  );

  const segmentOptions: ChipOption[] = useMemo(
    () => [
      { value: NO_SEGMENT, label: "Sin tramo" },
      ...(segments ?? []).map((segment) => ({
        value: segment.id,
        label: segment.name,
      })),
    ],
    [segments],
  );

  const memberOptions: ChipOption[] = useMemo(
    () =>
      (defaultMembers ?? []).map((member) => ({
        value: member.user_id,
        label: member.full_name,
      })),
    [defaultMembers],
  );

  // A crew reporting twice for the same day is almost always a double-submit
  // after a flaky connection, not two real shifts. Warn rather than block —
  // split shifts do happen.
  const duplicateEntry = useMemo(
    () =>
      (entries ?? []).find(
        (entry) => entry.work_date === workDate && entry.crew_id === crewId,
      ),
    [entries, workDate, crewId],
  );

  const toggleMember = (userId: string) => {
    setMemberIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  // The submit button sits below the fold and every field error renders above
  // it, so a failed validation looked like nothing happened at all. Scroll
  // back to the form so the reporter sees what it is asking for.
  const onInvalid = () => {
    Keyboard.dismiss();
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const onCapturePhoto = async () => {
    const outcome = await captureProductionPhoto();

    if (outcome.status === "denied") {
      Alert.alert(
        "Permiso de cámara",
        "Habilita la cámara para esta app desde los ajustes del teléfono. También puedes registrar la producción sin foto y agregarla después.",
      );
      return;
    }
    if (outcome.status === "cancelled") return;

    setPhotos((prev) => [...prev, outcome.photo]);
  };

  const removeCapturedPhoto = (uri: string) =>
    setPhotos((prev) => prev.filter((photo) => photo.uri !== uri));

  /**
   * The GPS fix is stamped on the photo at submit time, not at capture time.
   *
   * Close enough: the crew is standing at the work when they report it. What
   * matters more is the other half — no fix means `location` goes up NULL and
   * the photo still uploads. A reporter in a trench or under canopy cannot be
   * made to wait for satellites.
   */
  const withGps = (captured: CapturedPhoto[]): ProductionPhotoInput[] =>
    captured.map((photo) => ({
      ...photo,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
    }));

  /** Re-send only the files that failed. Never the report — it is committed. */
  const retryPendingUpload = async (pending: PendingPhotoUpload) => {
    try {
      await uploadPhotos.mutateAsync({
        entryId: pending.entryId,
        projectId: pending.projectId,
        photos: pending.photos,
      });
      setPendingUpload(null);
      Alert.alert(
        pending.photos.length === 1 ? "Foto subida" : "Fotos subidas",
        "Ya quedaron adjuntas al reporte.",
      );
    } catch (error) {
      const stillFailing =
        error instanceof ProductionPhotoUploadError
          ? error.failed
          : pending.photos;
      setPendingUpload({ ...pending, photos: stillFailing });
      Alert.alert("Sigue fallando", photoErrorMessage(error));
    }
  };

  const onSubmit = async (values: ProductionFormValues) => {
    Keyboard.dismiss();

    // Clearing the units field is what stops a resubmit, so it runs on both
    // the success path and the entry-saved-roster-failed path.
    const clearForNextEntry = () =>
      reset({
        work_date: values.work_date,
        crew_id: values.crew_id,
        unit_type: values.unit_type,
        units_completed: "",
        line_segment_id: NO_SEGMENT,
        notes: "",
      });

    try {
      const entry = await createEntry.mutateAsync({
        project_id: projectId,
        line_segment_id:
          values.line_segment_id === NO_SEGMENT ? null : values.line_segment_id,
        crew_id: values.crew_id,
        units_completed: Number(values.units_completed),
        unit_type: values.unit_type,
        work_date: values.work_date,
        notes: values.notes,
        crew_member_ids: memberIds,
      });

      // The entry is committed from here on. Everything below may fail
      // without putting the report itself in doubt, and the reporter has to
      // be told that in those words.
      clearForNextEntry();

      const captured = photos;
      setPhotos([]);

      if (captured.length === 0) {
        Alert.alert(
          "Producción registrada",
          "El reporte quedó en estado Reportado, pendiente de aprobación del supervisor. Puedes agregarle fotos después desde Reportes recientes.",
        );
        return;
      }

      // Photos can only go up now: `create_production_entry` is one
      // transaction and the object path needs the entry id it just returned.
      try {
        await uploadPhotos.mutateAsync({
          entryId: entry.id,
          projectId,
          photos: withGps(captured),
        });

        Alert.alert(
          "Producción registrada",
          captured.length === 1
            ? "El reporte quedó en Reportado, con su foto adjunta."
            : `El reporte quedó en Reportado, con sus ${captured.length} fotos adjuntas.`,
        );
      } catch (error) {
        // GRA-766 all over again if this is phrased as a failure: the entry
        // IS saved, so the one thing the message must never invite is
        // re-sending the report. Retry means the file, and only the file.
        const failed =
          error instanceof ProductionPhotoUploadError
            ? error.failed
            : withGps(captured);
        const uploaded =
          error instanceof ProductionPhotoUploadError ? error.uploaded : 0;

        const pending: PendingPhotoUpload = {
          entryId: entry.id,
          projectId,
          photos: failed,
          label: `${values.units_completed} ft · ${values.work_date}`,
        };
        setPendingUpload(pending);

        Alert.alert(
          "La producción SÍ quedó registrada",
          `${
            uploaded > 0 ? `Subimos ${uploaded} de ${captured.length} fotos. ` : ""
          }No se pudo subir ${
            failed.length === 1 ? "1 foto" : `${failed.length} fotos`
          }: ${photoErrorMessage(error)}\n\nNo vuelvas a registrar el reporte — solo falta la foto.`,
          [
            { text: "Luego", style: "cancel" },
            {
              text: "Reintentar foto",
              onPress: () => retryPendingUpload(pending),
            },
          ],
        );
      }
    } catch (error) {
      // The entry and its roster are one transaction now (GRA-832), so a
      // failure here wrote nothing and a retry is safe — there is no
      // entry-saved-roster-failed state left to warn about.
      Alert.alert("No se pudo registrar", getErrorMessage(error));
    }
  };

  if (loadingProject) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!project) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 px-6">
        <Text className="text-gray-500">Proyecto no encontrado</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-gray-50"
    >
      <ScrollView
        ref={scrollRef}
        contentContainerClassName="px-5 pt-5 pb-10 gap-5"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text className="text-2xl font-bold text-gray-900">
            Registrar producción
          </Text>
          <Text className="text-sm text-gray-500 mt-1">{project.name}</Text>
        </View>

        {/*
          No role gate. Since GRA-767 (`production_entries_crew_reporter_insert`)
          every role in the app may report: admin and supervisor on any project
          of their org, and `operator` / `trinchero` on a crew they lead or are
          a default member of. That membership is the real restriction and no
          client-side role list can express it, so RLS answers it and
          `getErrorMessage` turns a denial into plain language. The card that
          used to live here told crew leads they could not report, which is the
          group the policy was written FOR.
        */}
        <Card>
          <CardContent className="gap-5">
            {/* Work date */}
            <Controller
              control={control}
              name="work_date"
              render={({ field: { onChange, value } }) => (
                <View className="gap-2">
                  <Input
                    label="Fecha del trabajo"
                    placeholder="AAAA-MM-DD"
                    value={value}
                    onChangeText={onChange}
                    keyboardType="numbers-and-punctuation"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={10}
                    error={errors.work_date?.message}
                    icon={
                      <Ionicons
                        name="calendar-outline"
                        size={20}
                        color="#9CA3AF"
                      />
                    }
                  />
                  <View className="flex-row gap-2">
                    <Button
                      title="Hoy"
                      size="sm"
                      variant={
                        value === shiftDays(0) ? "primary" : "secondary"
                      }
                      onPress={() => onChange(shiftDays(0))}
                    />
                    <Button
                      title="Ayer"
                      size="sm"
                      variant={
                        value === shiftDays(-1) ? "primary" : "secondary"
                      }
                      onPress={() => onChange(shiftDays(-1))}
                    />
                  </View>
                </View>
              )}
            />

            {/* Crew */}
            <Controller
              control={control}
              name="crew_id"
              render={({ field: { onChange, value } }) => (
                <ChipSelect
                  label="Cuadrilla"
                  options={crewOptions}
                  selected={value}
                  onSelect={onChange}
                  error={errors.crew_id?.message}
                  emptyLabel={
                    loadingCrews
                      ? "Cargando cuadrillas..."
                      : "No hay cuadrillas activas en tu organización"
                  }
                />
              )}
            />

            {/* Unit type */}
            <Controller
              control={control}
              name="unit_type"
              render={({ field: { onChange, value } }) => (
                <ChipSelect
                  label="Tipo de unidad"
                  options={UNIT_TYPE_OPTIONS}
                  selected={value}
                  onSelect={onChange}
                  error={errors.unit_type?.message}
                />
              )}
            />

            {/* Units completed */}
            <Controller
              control={control}
              name="units_completed"
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Unidades completadas"
                  placeholder="0.00"
                  value={value}
                  // Android numeric keyboards emit a comma as the decimal
                  // separator under es-MX; the column only accepts a dot.
                  onChangeText={(text) => onChange(text.replace(",", "."))}
                  keyboardType="decimal-pad"
                  error={errors.units_completed?.message}
                  icon={
                    <Ionicons name="resize-outline" size={20} color="#9CA3AF" />
                  }
                />
              )}
            />

            {/* Line segment */}
            <Controller
              control={control}
              name="line_segment_id"
              render={({ field: { onChange, value } }) => (
                <ChipSelect
                  label="Tramo (opcional)"
                  options={segmentOptions}
                  selected={value}
                  onSelect={onChange}
                  error={errors.line_segment_id?.message}
                />
              )}
            />

            {/* Crew members */}
            {crewId !== "" && (
              <ChipSelect
                label={`Integrantes del turno (${memberIds.length})`}
                options={memberOptions}
                selected={memberIds}
                onSelect={toggleMember}
                wrap
                emptyLabel="Esta cuadrilla no tiene integrantes por defecto"
              />
            )}

            {/* Notes */}
            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Notas (opcional)"
                  placeholder="Condiciones, incidencias, equipo usado..."
                  value={value}
                  onChangeText={onChange}
                  multiline
                  numberOfLines={3}
                  className="min-h-16"
                  style={{ textAlignVertical: "top" }}
                  error={errors.notes?.message}
                />
              )}
            />

            {/*
              Photos. After the quantity and before sending, because a photo is
              evidence of the quantity — and optional, so the label says so
              rather than making a crew with no camera free give up on the
              report (Jonas, GRA-829).
            */}
            <View className="gap-2">
              <Text className="text-sm font-medium text-gray-700">
                Fotos (opcional) · {photos.length}
              </Text>

              {photos.length > 0 && (
                <View className="flex-row flex-wrap gap-2">
                  {photos.map((photo) => (
                    <View key={photo.uri} className="relative">
                      <Image
                        source={{ uri: photo.uri }}
                        className="h-20 w-20 rounded-lg bg-gray-100"
                        resizeMode="cover"
                        accessibilityLabel={photo.filename}
                      />
                      <Pressable
                        onPress={() => removeCapturedPhoto(photo.uri)}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel={`Quitar ${photo.filename}`}
                        className="absolute -right-2 -top-2 h-6 w-6 items-center justify-center rounded-full bg-red-500"
                      >
                        <Ionicons name="close" size={14} color="white" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              <Button
                title={photos.length === 0 ? "Tomar foto" : "Tomar otra foto"}
                variant="secondary"
                onPress={onCapturePhoto}
                icon={<Ionicons name="camera" size={20} color="#374151" />}
              />

              <Text className="text-xs text-gray-400">
                {location
                  ? "Cada foto se guarda con la ubicación actual."
                  : "Sin señal de GPS: las fotos se guardan igual, sin ubicación."}
              </Text>
            </View>

            {duplicateEntry && (
              <View className="flex-row items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <Ionicons name="warning-outline" size={18} color="#b45309" />
                <Text className="flex-1 text-sm text-amber-800">
                  Esta cuadrilla ya tiene {duplicateEntry.units_completed} ft
                  reportados para {duplicateEntry.work_date}. Verifica antes
                  de registrar otro turno.
                </Text>
              </View>
            )}

            <Button
              title="Registrar producción"
              size="lg"
              onPress={handleSubmit(onSubmit, onInvalid)}
              loading={
                isSubmitting || createEntry.isPending || uploadPhotos.isPending
              }
              disabled={
                isSubmitting || createEntry.isPending || uploadPhotos.isPending
              }
              icon={<Ionicons name="checkmark-circle" size={20} color="white" />}
            />

            <Text className="text-xs text-gray-400 text-center">
              Se registra como Reportado y pasa a aprobación del supervisor.
            </Text>
          </CardContent>
        </Card>

        {/*
          A photo that did not make it up, with the report already saved.
          This banner exists so the retry outlives the alert: an alert is gone
          the moment it is tapped, and losing the only way back to the file is
          what turns "retry the photo" into "report the shift again".
        */}
        {pendingUpload && (
          <Card className="border-amber-200">
            <CardContent className="gap-3">
              <View className="flex-row items-start gap-2">
                <Ionicons
                  name="cloud-offline-outline"
                  size={18}
                  color="#b45309"
                />
                <View className="flex-1">
                  <Text className="font-semibold text-gray-900">
                    {pendingUpload.photos.length === 1
                      ? "Quedó 1 foto sin subir"
                      : `Quedaron ${pendingUpload.photos.length} fotos sin subir`}
                  </Text>
                  <Text className="mt-0.5 text-sm text-gray-600">
                    La producción de {pendingUpload.label} ya está registrada.
                    Solo falta la foto.
                  </Text>
                </View>
              </View>

              <View className="flex-row gap-2">
                <Button
                  title="Reintentar foto"
                  size="sm"
                  onPress={() => retryPendingUpload(pendingUpload)}
                  loading={uploadPhotos.isPending}
                  disabled={uploadPhotos.isPending}
                />
                <Button
                  title="Descartar"
                  size="sm"
                  variant="secondary"
                  onPress={() => setPendingUpload(null)}
                />
              </View>
            </CardContent>
          </Card>
        )}

        {/* Recent entries */}
        <View className="gap-3">
          <Text className="text-base font-semibold text-gray-900">
            Reportes recientes
          </Text>

          {loadingEntries && (
            <ActivityIndicator color="#2563eb" className="self-start" />
          )}

          {!loadingEntries && (entries?.length ?? 0) === 0 && (
            <Text className="text-sm text-gray-400">
              Todavía no hay producción reportada en este proyecto.
            </Text>
          )}

          {entries?.map((entry) => {
            const badge = STATUS_BADGE[entry.internal_status] ?? {
              label: entry.internal_status,
              variant: "default" as const,
            };
            const entryPhotos = photosByEntry?.[entry.id] ?? [];

            return (
              // The card opens the entry. That tap is the whole "report now,
              // photo later" path, so it is the card and not a small chevron:
              // a gloved thumb in the sun needs the target to be the thing it
              // can already see.
              <Pressable
                key={entry.id}
                onPress={() =>
                  router.push(`/production/entry/${entry.id}` as never)
                }
                accessibilityRole="button"
                accessibilityLabel={`Ver reporte de ${entry.units_completed} ft del ${entry.work_date}`}
              >
                <Card>
                  <CardContent className="gap-1.5">
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1">
                        <Text className="font-semibold text-gray-900">
                          {entry.units_completed} ft ·{" "}
                          {UNIT_TYPE_SHORT[entry.unit_type] ?? entry.unit_type}
                        </Text>
                        <Text className="text-xs text-gray-500 mt-0.5">
                          {entry.work_date} ·{" "}
                          {entry.crew?.name ?? "Sin cuadrilla"}
                        </Text>
                      </View>
                      <Badge label={badge.label} variant={badge.variant} />
                    </View>
                    <Text className="text-xs text-gray-400">
                      Reportó {entry.reported_by_user?.full_name ?? "—"}
                    </Text>
                    {entry.internal_status === "rejected" &&
                      entry.rejection_reason && (
                        <Text className="text-xs text-red-600">
                          Motivo: {entry.rejection_reason}
                        </Text>
                      )}
                    {entry.notes && (
                      <Text className="text-sm text-gray-600">
                        {entry.notes}
                      </Text>
                    )}

                    {entryPhotos.length > 0 ? (
                      <View className="mt-1">
                        <ProductionPhotoGrid
                          photos={entryPhotos}
                          urls={listPhotoUrls ?? {}}
                        />
                      </View>
                    ) : (
                      <View className="mt-1 flex-row items-center gap-1">
                        <Ionicons
                          name="camera-outline"
                          size={14}
                          color="#9CA3AF"
                        />
                        <Text className="text-xs text-gray-400">
                          Sin fotos · toca para agregar
                        </Text>
                      </View>
                    )}
                  </CardContent>
                </Card>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Why a photo did not go up, for a message that already says the production is
 * saved. So this returns only the cause — never "could not save".
 */
function photoErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message.toLowerCase() : "";

  if (msg.includes("no hay sesión activa")) {
    return "tu sesión expiró";
  }
  if (msg.includes("no se pudo obtener la organización")) {
    return "no pudimos leer tu organización";
  }
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("timeout")) {
    return "no hay conexión";
  }
  if (msg.includes("exceeded the maximum") || msg.includes("too large")) {
    return "la foto pesa demasiado";
  }
  if (
    msg.includes("row-level security") ||
    msg.includes("permission denied") ||
    msg.includes("42501")
  ) {
    return "tu usuario no tiene permiso para adjuntarla";
  }

  console.warn("[ProductionEntry] unhandled photo upload error:", error);
  return "falló la subida";
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Error desconocido. Intenta de nuevo.";
  const msg = error.message.toLowerCase();
  if (
    msg.includes("row-level security") ||
    msg.includes("violates row-level") ||
    msg.includes("permission denied")
  ) {
    return "Tu usuario no tiene permiso para registrar producción en este proyecto.";
  }
  if (msg.includes("no hay sesión activa")) {
    return "Tu sesión expiró. Vuelve a iniciar sesión.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Sin conexión. Vuelve a intentar cuando tengas señal.";
  }
  // Anything left is a Postgres/PostgREST string. Useful in a log, not on a
  // phone in the field.
  console.warn("[ProductionEntry] unhandled create error:", error);
  return "No se pudo guardar el reporte. Si vuelve a pasar, avisa a tu supervisor.";
}
