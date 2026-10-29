import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Pressable,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useProject } from "../../lib/api/projects";
import { useReportableCrews } from "../../lib/api/crews";
import {
  activityLabel,
  budgetLineLabel,
  formatQty,
  useBudgetLineLabels,
  useSegmentProgress,
  UNIT_SUFFIX,
  UNIT_TYPE_LABEL,
  type SegmentActivity,
} from "../../lib/api/segments";
import {
  useCrewDefaultMembers,
  useCreateProductionEntry,
  useProjectProductionEntries,
  classifyPlanRejection,
} from "../../lib/api/production";
import { useAuthStore } from "../../lib/stores/auth-store";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Card, CardContent } from "../../components/ui/Card";
import { ChipSelect, type ChipOption } from "../../components/ui/ChipSelect";
import type {
  ProductionInternalStatus,
  UnitType,
} from "../../types/database";

const UNIT_TYPE_OPTIONS: { value: UnitType; label: string }[] = (
  ["drilling_ft", "aerial_ft", "duct_ft", "trenching_ft", "unit"] as const
).map((value) => ({ value, label: UNIT_TYPE_LABEL[value] }));

const UNIT_TYPE_SHORT: Record<UnitType, string> = {
  drilling_ft: "perforación",
  aerial_ft: "aéreo",
  duct_ft: "ducto",
  trenching_ft: "zanja",
  unit: "unidades",
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
const NO_ACTIVITY = "";

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
  unit_type: z.enum([
    "drilling_ft",
    "aerial_ft",
    "duct_ft",
    "trenching_ft",
    "unit",
  ]),
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
  // Which of the segment's activities is being billed. Required once the
  // segment has any; checked on submit, where the segment's activities are
  // known, rather than in the schema, which cannot see them.
  budget_line_id: z.string(),
  overproduction_reason: z.string().max(500, "Máximo 500 caracteres"),
  notes: z.string().max(1000, "Máximo 1000 caracteres"),
});

type ProductionFormValues = z.infer<typeof productionSchema>;

export default function ProductionEntryScreen() {
  const { projectId, segmentId, budgetLineId } = useLocalSearchParams<{
    projectId: string;
    segmentId?: string;
    budgetLineId?: string;
  }>();
  const userId = useAuthStore((s) => s.user?.id);
  const role = useAuthStore((s) => s.role);

  const { data: project, isLoading: loadingProject } = useProject(projectId);
  const { data: reportableCrews, isLoading: loadingCrews } =
    useReportableCrews(userId);
  const { data: entries, isLoading: loadingEntries } =
    useProjectProductionEntries(projectId);
  const { data: lineLabels } = useBudgetLineLabels(projectId);
  const createEntry = useCreateProductionEntry();

  const [memberIds, setMemberIds] = useState<string[]>([]);
  // Set when the database — not the form — asks for an overproduction reason,
  // which happens when another crew reports on the activity between this
  // screen loading and the send.
  const [reasonDemanded, setReasonDemanded] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Memoised, not `?? []`: a fresh empty array on every render re-runs the
  // crew effect and the chip memo below on every keystroke in the form.
  const crews = useMemo(() => reportableCrews?.crews ?? [], [reportableCrews]);

  const {
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ProductionFormValues>({
    resolver: zodResolver(productionSchema),
    defaultValues: {
      work_date: toISODate(new Date()),
      crew_id: "",
      unit_type: "drilling_ft",
      units_completed: "",
      line_segment_id: segmentId ?? NO_SEGMENT,
      budget_line_id: budgetLineId ?? NO_ACTIVITY,
      overproduction_reason: "",
      notes: "",
    },
  });

  const crewId = watch("crew_id");
  const workDate = watch("work_date");
  const lineSegmentId = watch("line_segment_id");
  const selectedBudgetLineId = watch("budget_line_id");
  const unitsCompleted = watch("units_completed");
  const { data: defaultMembers } = useCrewDefaultMembers(crewId || undefined);

  // A crew lead picks among their own crew's segments; an admin or supervisor
  // plans the whole project and gets all of them. Keyed on the role rather
  // than on crew membership, so a supervisor who also happens to sit on a
  // crew's roster does not silently lose the rest of the project.
  const seesAllSegments = role === "admin" || role === "supervisor";
  const { data: segments } = useSegmentProgress(
    projectId,
    seesAllSegments ? null : crewId || null,
  );

  // One crew to report for is the normal case for a crew lead: select it
  // rather than making them tap the only chip on screen.
  useEffect(() => {
    if (crewId || crews.length !== 1) return;
    setValue("crew_id", crews[0].id);
  }, [crewId, crews, setValue]);

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
    () => crews.map((crew) => ({ value: crew.id, label: crew.name })),
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

  const selectedSegment = useMemo(
    () => (segments ?? []).find((segment) => segment.id === lineSegmentId),
    [segments, lineSegmentId],
  );

  const activities: SegmentActivity[] = useMemo(
    () => selectedSegment?.activities ?? [],
    [selectedSegment],
  );

  const selectedActivity = useMemo(
    () =>
      activities.find(
        (activity) => activity.budget_line_id === selectedBudgetLineId,
      ),
    [activities, selectedBudgetLineId],
  );

  const activityOptions: ChipOption[] = useMemo(
    () =>
      activities.map((activity) => ({
        value: activity.budget_line_id,
        label: `${activityLabel(activity)} · faltan ${formatQty(activity.remaining)} ${UNIT_SUFFIX[activity.unit_type]}`,
      })),
    [activities],
  );

  // Keep the chosen activity consistent with the chosen segment: drop one that
  // belongs to another segment, and take the only one when there is only one.
  // Written so that re-running it changes nothing.
  useEffect(() => {
    if (lineSegmentId === NO_SEGMENT) {
      if (selectedBudgetLineId) setValue("budget_line_id", NO_ACTIVITY);
      return;
    }
    // Until the segments arrive, this segment's activities are an empty list
    // rather than none — and clearing against that would throw away the
    // activity the crew tapped on the map to get here.
    if (!segments || !selectedSegment) return;

    const ids = activities.map((activity) => activity.budget_line_id);
    if (selectedBudgetLineId && !ids.includes(selectedBudgetLineId)) {
      setValue("budget_line_id", NO_ACTIVITY);
      return;
    }
    if (!selectedBudgetLineId && activities.length === 1) {
      setValue("budget_line_id", activities[0].budget_line_id);
    }
  }, [
    segments,
    selectedSegment,
    activities,
    lineSegmentId,
    selectedBudgetLineId,
    setValue,
  ]);

  // What is left on the activity is almost always what is being reported, so
  // it goes in the field as a suggestion. Only overwritten while the field
  // still holds what we put there: once the reporter types their own number,
  // a refetch must not move it.
  const suggestedUnits =
    selectedActivity && selectedActivity.remaining > 0
      ? formatQty(selectedActivity.remaining)
      : "";
  const suggestionRef = useRef<string>("");
  useEffect(() => {
    if (!suggestedUnits) return;
    const current = getValues("units_completed");
    if (current !== "" && current !== suggestionRef.current) return;
    suggestionRef.current = suggestedUnits;
    setValue("units_completed", suggestedUnits);
  }, [suggestedUnits, getValues, setValue]);

  // The unit is the activity's, taken from its budget line. Only a report with
  // no activity behind it still picks one by hand.
  const unitTypeValue = watch("unit_type");
  const effectiveUnit: UnitType = selectedActivity?.unit_type ?? unitTypeValue;

  const overPlan =
    !!selectedActivity &&
    Number(unitsCompleted || 0) > selectedActivity.remaining;
  const showReason = overPlan || reasonDemanded;

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

  const onSubmit = async (values: ProductionFormValues) => {
    Keyboard.dismiss();

    // Both of these are database rules (GRA-831). Checking them here is not a
    // substitute for the trigger — it is what turns a 400 into a sentence the
    // reporter can act on without losing what they typed.
    if (activities.length > 0 && !values.budget_line_id) {
      setError("budget_line_id", {
        message: "Elegí la actividad que estás reportando",
      });
      onInvalid();
      return;
    }

    if (showReason && !values.overproduction_reason.trim()) {
      setError("overproduction_reason", {
        message: "Explica por qué se pasa de lo planeado",
      });
      onInvalid();
      return;
    }

    // Clearing the units field is what stops a resubmit, so it runs on both
    // the success path and the entry-saved path.
    const clearForNextEntry = () => {
      suggestionRef.current = "";
      setReasonDemanded(false);
      reset({
        work_date: values.work_date,
        crew_id: values.crew_id,
        unit_type: values.unit_type,
        units_completed: "",
        line_segment_id: NO_SEGMENT,
        budget_line_id: NO_ACTIVITY,
        overproduction_reason: "",
        notes: "",
      });
    };

    try {
      await createEntry.mutateAsync({
        project_id: projectId,
        line_segment_id:
          values.line_segment_id === NO_SEGMENT ? null : values.line_segment_id,
        budget_line_id: values.budget_line_id || null,
        crew_id: values.crew_id,
        units_completed: Number(values.units_completed),
        unit_type: effectiveUnit,
        work_date: values.work_date,
        notes: values.notes,
        overproduction_reason: showReason
          ? values.overproduction_reason
          : null,
        crew_member_ids: memberIds,
      });

      clearForNextEntry();

      Alert.alert(
        "Producción registrada",
        "El reporte quedó en estado Reportado, pendiente de aprobación del supervisor.",
      );
    } catch (error) {
      switch (classifyPlanRejection(error)) {
        case "overproduction_reason_required":
          // The remaining quantity moved under us. Nothing was written —
          // the entry and its roster are one transaction — so the reporter
          // adds the reason and sends the same form again.
          setReasonDemanded(true);
          setError("overproduction_reason", {
            message: "Explica por qué se pasa de lo planeado",
          });
          onInvalid();
          Alert.alert(
            "Falta el motivo",
            "Entre que abriste la pantalla y enviaste, alguien más reportó sobre esta actividad y tu cantidad ya pasa de lo planeado. Escribí el motivo y volvé a enviar.",
          );
          return;
        case "activity_required":
          setError("budget_line_id", {
            message: "Elegí la actividad que estás reportando",
          });
          onInvalid();
          Alert.alert(
            "Elegí la actividad",
            "Este tramo tiene más de una actividad con esta unidad, así que hay que decir cuál se está reportando.",
          );
          return;
        case "activity_not_on_segment":
          setError("budget_line_id", {
            message: "Esa actividad no es de este tramo",
          });
          onInvalid();
          Alert.alert(
            "La actividad no es de este tramo",
            "El plan del tramo cambió. Desliza para actualizar y elegí una de sus actividades.",
          );
          return;
        default:
          Alert.alert("No se pudo registrar", getErrorMessage(error));
      }
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
                      variant={value === shiftDays(0) ? "primary" : "secondary"}
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
                      : "No estás en ninguna cuadrilla activa. Pídele a tu supervisor que te agregue."
                  }
                />
              )}
            />

            {/* Line segment */}
            <Controller
              control={control}
              name="line_segment_id"
              render={({ field: { onChange, value } }) => (
                <View className="gap-2">
                  <ChipSelect
                    label={seesAllSegments ? "Tramo" : "Tramo (mis tramos)"}
                    options={segmentOptions}
                    selected={value}
                    onSelect={onChange}
                    error={errors.line_segment_id?.message}
                  />
                  <Pressable
                    onPress={() => router.push(`/segments/${projectId}`)}
                    hitSlop={8}
                    className="flex-row items-center active:opacity-60"
                  >
                    <Ionicons name="map-outline" size={16} color="#1d4ed8" />
                    <Text className="text-xs font-medium text-primary-700 ml-1.5">
                      Elegirlo en el mapa
                    </Text>
                  </Pressable>
                </View>
              )}
            />

            {/* Activity on the segment */}
            {lineSegmentId !== NO_SEGMENT && (
              <Controller
                control={control}
                name="budget_line_id"
                render={({ field: { onChange, value } }) => (
                  <View className="gap-2">
                    <ChipSelect
                      label="Actividad"
                      options={activityOptions}
                      selected={value}
                      onSelect={onChange}
                      wrap
                      error={errors.budget_line_id?.message}
                      emptyLabel="Este tramo no tiene actividades planeadas; se reporta por tipo de unidad."
                    />
                    {selectedActivity && (
                      <View className="flex-row items-center gap-2">
                        <Badge
                          label={`Plan ${formatQty(selectedActivity.planned_qty)} ${UNIT_SUFFIX[selectedActivity.unit_type]}`}
                          variant="muted"
                        />
                        <Badge
                          label={`Aprobado ${formatQty(selectedActivity.approved_units)}`}
                          variant="success"
                        />
                        <Badge
                          label={`Reportado ${formatQty(selectedActivity.reported_units)}`}
                          variant="warning"
                        />
                      </View>
                    )}
                  </View>
                )}
              />
            )}

            {/* Unit type — only when no activity decides it */}
            {selectedActivity ? (
              <View className="gap-1">
                <Text className="text-sm font-medium text-gray-700">
                  Tipo de unidad
                </Text>
                <Text className="text-sm text-gray-500">
                  {UNIT_TYPE_LABEL[selectedActivity.unit_type]} · lo define la
                  actividad
                </Text>
              </View>
            ) : (
              <Controller
                control={control}
                name="unit_type"
                render={({ field: { onChange, value } }) => (
                  <ChipSelect
                    label="Tipo de unidad"
                    options={UNIT_TYPE_OPTIONS}
                    selected={value}
                    onSelect={onChange}
                    wrap
                    error={errors.unit_type?.message}
                  />
                )}
              />
            )}

            {/* Units completed */}
            <Controller
              control={control}
              name="units_completed"
              render={({ field: { onChange, value } }) => (
                <Input
                  label={`Unidades completadas (${UNIT_SUFFIX[effectiveUnit]})`}
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

            {/* Overproduction reason */}
            {showReason && (
              <Controller
                control={control}
                name="overproduction_reason"
                render={({ field: { onChange, value } }) => (
                  <View className="gap-2">
                    <View className="flex-row items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                      <Ionicons
                        name="alert-circle-outline"
                        size={18}
                        color="#b45309"
                      />
                      <Text className="flex-1 text-sm text-amber-800">
                        {selectedActivity
                          ? `Esto pasa de lo planeado en la actividad (quedaban ${formatQty(selectedActivity.remaining)} ${UNIT_SUFFIX[selectedActivity.unit_type]}). Hace falta un motivo.`
                          : "Esto pasa de lo planeado en la actividad. Hace falta un motivo."}
                      </Text>
                    </View>
                    <Input
                      label="Motivo de la sobre-producción"
                      placeholder="Se extendió el bore por una interferencia..."
                      value={value}
                      onChangeText={onChange}
                      multiline
                      numberOfLines={2}
                      className="min-h-16"
                      style={{ textAlignVertical: "top" }}
                      error={errors.overproduction_reason?.message}
                    />
                  </View>
                )}
              />
            )}

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

            {duplicateEntry && (
              <View className="flex-row items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <Ionicons name="warning-outline" size={18} color="#b45309" />
                <Text className="flex-1 text-sm text-amber-800">
                  Esta cuadrilla ya tiene{" "}
                  {formatQty(Number(duplicateEntry.units_completed))}{" "}
                  {UNIT_SUFFIX[duplicateEntry.unit_type] ?? ""} reportados para{" "}
                  {duplicateEntry.work_date}. Verifica antes de registrar otro
                  turno.
                </Text>
              </View>
            )}

            <Button
              title="Registrar producción"
              size="lg"
              onPress={handleSubmit(onSubmit, onInvalid)}
              loading={isSubmitting || createEntry.isPending}
              disabled={isSubmitting || createEntry.isPending}
              icon={
                <Ionicons name="checkmark-circle" size={20} color="white" />
              }
            />

            <Text className="text-xs text-gray-400 text-center">
              Se registra como Reportado y pasa a aprobación del supervisor.
            </Text>
          </CardContent>
        </Card>

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
            const activity = entry.budget_line_id
              ? budgetLineLabel(lineLabels?.[entry.budget_line_id])
              : null;
            return (
              <Card key={entry.id}>
                <CardContent className="gap-1.5">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Text className="font-semibold text-gray-900">
                        {formatQty(Number(entry.units_completed))}{" "}
                        {UNIT_SUFFIX[entry.unit_type] ?? ""} ·{" "}
                        {UNIT_TYPE_SHORT[entry.unit_type] ?? entry.unit_type}
                      </Text>
                      <Text className="text-xs text-gray-500 mt-0.5">
                        {entry.work_date} ·{" "}
                        {entry.crew?.name ?? "Sin cuadrilla"}
                      </Text>
                      {activity && (
                        <Text className="text-xs text-primary-700 mt-0.5">
                          {activity}
                        </Text>
                      )}
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
                  {entry.overproduction_reason && (
                    <Text className="text-xs text-amber-700">
                      Sobre-producción: {entry.overproduction_reason}
                    </Text>
                  )}
                  {entry.notes && (
                    <Text className="text-sm text-gray-600">{entry.notes}</Text>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Error desconocido. Intenta de nuevo.";
  const msg = error.message.toLowerCase();
  if (
    msg.includes("row-level security") ||
    msg.includes("violates row-level") ||
    msg.includes("permission denied")
  ) {
    return "Tu usuario no tiene permiso para reportar producción de esta cuadrilla.";
  }
  if (msg.includes("not authenticated") || msg.includes("no hay sesión")) {
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
