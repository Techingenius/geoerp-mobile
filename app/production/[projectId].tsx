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
} from "react-native";
import { useLocalSearchParams } from "expo-router";
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
  ProductionMembersError,
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

/** Roles whose RLS grant allows INSERT on production_entries. */
const REPORTING_ROLES = ["admin", "supervisor"];

const NO_SEGMENT = "__none__";

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
  const role = useAuthStore((s) => s.role);

  const { data: project, isLoading: loadingProject } = useProject(projectId);
  const { data: segments } = useProjectSegments(projectId);
  const { data: crews, isLoading: loadingCrews } = useActiveCrews();
  const { data: entries, isLoading: loadingEntries } =
    useProjectProductionEntries(projectId);
  const createEntry = useCreateProductionEntry();

  const [memberIds, setMemberIds] = useState<string[]>([]);

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

  // RLS is the real authority on who may insert. `fetchUserRole` resolves the
  // role with `.single()` over `user_roles`, which is many-to-many, so a user
  // holding two roles comes back `null` — and a hard block would then deny a
  // supervisor the database would have allowed. Block only on a KNOWN
  // non-reporting role; when the role is unknown, let the insert run and let
  // RLS answer (getErrorMessage turns that denial into plain language).
  // The `.single()` defect is pre-existing and needs an auth-store refactor.
  const canReport = role === null || REPORTING_ROLES.includes(role);

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
      await createEntry.mutateAsync({
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

      clearForNextEntry();

      Alert.alert(
        "Producción registrada",
        "El reporte quedó en estado Reportado, pendiente de aprobación del supervisor.",
      );
    } catch (error) {
      // The entry committed and only its roster failed. Telling the reporter
      // this failed would invite a retry, and a retry here is a second
      // billable entry in the approval queue that only an admin can delete.
      if (error instanceof ProductionMembersError) {
        console.warn(
          `[ProductionEntry] entry ${error.entryId} saved without crew_members:`,
          error.cause,
        );
        clearForNextEntry();
        Alert.alert(
          "Producción guardada — faltan los integrantes",
          "El reporte SÍ quedó registrado y ya está en la cola de aprobación. NO lo vuelvas a enviar.\n\nLo único que no se guardó son los integrantes del turno. Pedile a un supervisor que los agregue desde la web.",
        );
        return;
      }
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
        contentContainerClassName="px-5 py-5 gap-5"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text className="text-2xl font-bold text-gray-900">
            Registrar producción
          </Text>
          <Text className="text-sm text-gray-500 mt-1">{project.name}</Text>
        </View>

        {!canReport ? (
          <Card>
            <CardContent className="gap-2">
              <View className="flex-row items-center gap-2">
                <Ionicons name="lock-closed-outline" size={18} color="#b45309" />
                <Text className="font-semibold text-gray-900">
                  Tu rol no puede reportar producción
                </Text>
              </View>
              <Text className="text-sm text-gray-600">
                La base de datos solo permite crear reportes de producción a los
                roles <Text className="font-semibold">admin</Text> y{" "}
                <Text className="font-semibold">supervisor</Text>. Pídele al
                líder de tu cuadrilla que registre la producción del turno.
              </Text>
            </CardContent>
          </Card>
        ) : (
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
                onPress={handleSubmit(onSubmit)}
                loading={isSubmitting || createEntry.isPending}
                disabled={isSubmitting || createEntry.isPending}
                icon={<Ionicons name="checkmark-circle" size={20} color="white" />}
              />

              <Text className="text-xs text-gray-400 text-center">
                Se registra como Reportado y pasa a aprobación del supervisor.
              </Text>
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
            return (
              <Card key={entry.id}>
                <CardContent className="gap-1.5">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Text className="font-semibold text-gray-900">
                        {entry.units_completed} ft ·{" "}
                        {UNIT_TYPE_SHORT[entry.unit_type] ?? entry.unit_type}
                      </Text>
                      <Text className="text-xs text-gray-500 mt-0.5">
                        {entry.work_date} · {entry.crew?.name ?? "Sin cuadrilla"}
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
