import { useQuery } from "@tanstack/react-query";
import { supabase } from "../supabase/client";
import type {
  BudgetLineLabel,
  GeoLineString,
  SegmentProgressRow,
  SegmentState,
  UnitType,
} from "../../types/database";

export const segmentKeys = {
  all: ["segment-progress"] as const,
  progress: (projectId: string, crewId: string | null) =>
    ["segment-progress", projectId, crewId ?? "all"] as const,
  budgetLineLabels: (projectId: string) =>
    ["budget-line-labels", projectId] as const,
};

/** A billable activity planned on a segment, with what has been reported on it. */
export interface SegmentActivity {
  activity_id: string;
  budget_line_id: string;
  /** Budget line name, e.g. "Bore principal". */
  line_name: string | null;
  /** Wave product code the client is billed under, e.g. `3101`. */
  wave_product_code: string | null;
  unit_type: UnitType;
  planned_qty: number;
  /** Reported + supervisor-approved, i.e. not yet admin-approved. */
  reported_units: number;
  /** Admin-approved. */
  approved_units: number;
  /** `approved_units / planned_qty`, as a percentage. */
  pct_approved: number;
  /** What is still missing to reach the plan; never negative. */
  remaining: number;
}

/** A segment of the project with its plan, its progress and its geometry. */
export interface SegmentWithProgress {
  id: string;
  name: string;
  assigned_crew_id: string | null;
  planned_date: string | null;
  length_ft: number | null;
  state: SegmentState;
  geometry: GeoLineString | null;
  activities: SegmentActivity[];
}

export const SEGMENT_STATE_LABEL: Record<SegmentState, string> = {
  unassigned: "Sin asignar",
  assigned: "Asignado",
  in_progress: "En progreso",
  complete: "Completo",
  approved: "Aprobado",
};

/**
 * Segment colours on the map. Same meaning as the web map (GRA-828) and high
 * contrast enough to tell apart in sunlight: grey nobody is on it, blue it is
 * ours for today, amber work has been reported, green the plan is met,
 * emerald an admin has approved it.
 */
export const SEGMENT_STATE_COLOR: Record<SegmentState, string> = {
  unassigned: "#9ca3af",
  assigned: "#2563eb",
  in_progress: "#f59e0b",
  complete: "#22c55e",
  approved: "#059669",
};

/** Unit suffix for a quantity, short enough for a chip. */
export const UNIT_SUFFIX: Record<UnitType, string> = {
  drilling_ft: "ft",
  aerial_ft: "ft",
  duct_ft: "ft",
  trenching_ft: "ft",
  unit: "u",
};

export const UNIT_TYPE_LABEL: Record<UnitType, string> = {
  drilling_ft: "Perforación (ft)",
  aerial_ft: "Aéreo (ft)",
  duct_ft: "Ducto (ft)",
  trenching_ft: "Zanja (ft)",
  unit: "Unidades",
};

/** Quantity without trailing zeros: `120` and `120.5`, never `120.00`. */
export function formatQty(value: number): string {
  return Number(value.toFixed(2)).toString();
}

export function activityLabel(activity: SegmentActivity): string {
  const name = activity.line_name ?? "Actividad";
  return activity.wave_product_code
    ? `${activity.wave_product_code} · ${name}`
    : name;
}

function toNumber(value: number | string | null): number {
  if (value === null) return 0;
  // NUMERIC comes back as a string over PostgREST whenever it does not fit a
  // float exactly; Number() handles both shapes.
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Group `get_segment_progress` rows (segment x activity) by segment. */
function groupBySegment(rows: SegmentProgressRow[]): SegmentWithProgress[] {
  const bySegment = new Map<string, SegmentWithProgress>();

  for (const row of rows) {
    let segment = bySegment.get(row.line_segment_id);
    if (!segment) {
      segment = {
        id: row.line_segment_id,
        name: row.segment_name,
        assigned_crew_id: row.assigned_crew_id,
        planned_date: row.planned_date,
        length_ft: row.length_ft,
        state: row.state,
        geometry: null,
        activities: [],
      };
      bySegment.set(row.line_segment_id, segment);
    }

    // A segment nobody has planned yet still gets one row, with every
    // activity column NULL. It is a segment with no activities, not a
    // malformed one.
    if (row.activity_id === null || row.budget_line_id === null) continue;

    const planned = toNumber(row.planned_qty);
    const reported = toNumber(row.reported_units);
    const approved = toNumber(row.approved_units);

    segment.activities.push({
      activity_id: row.activity_id,
      budget_line_id: row.budget_line_id,
      line_name: row.line_name,
      wave_product_code: row.wave_product_code,
      unit_type: (row.unit_type ?? "unit") as UnitType,
      planned_qty: planned,
      reported_units: reported,
      approved_units: approved,
      pct_approved: toNumber(row.pct_approved),
      remaining: Math.max(0, planned - reported - approved),
    });
  }

  return [...bySegment.values()];
}

/**
 * The project's segments with their planned activities and progress.
 *
 * `crewId` narrows to the segments assigned to that crew — "mis tramos" for a
 * crew lead. Pass `null` for every segment of the project, which is what a
 * supervisor or admin (who is on no crew) sees.
 *
 * Two requests in one query: `get_segment_progress` has the plan and the
 * numbers but no geometry, and the map needs the line. They are fetched
 * together so the screen has one loading state instead of two.
 *
 * The numbers are the segment's whole progress, not just this crew's: the
 * SELECT policy on `production_entries` is per organization, so a crew lead
 * sees every crew's production on the segment they are standing on. Two crews
 * splitting a bore read the same total.
 */
export function useSegmentProgress(
  projectId: string | undefined,
  crewId: string | null,
) {
  return useQuery({
    queryKey: segmentKeys.progress(projectId ?? "", crewId),
    queryFn: async (): Promise<SegmentWithProgress[]> => {
      const progressQuery = supabase.rpc("get_segment_progress", {
        p_project_id: projectId!,
        // Omitted rather than passed as null: the argument defaults to NULL
        // server-side, and PostgREST treats a missing key and an explicit
        // null the same way here.
        ...(crewId ? { p_crew_id: crewId } : {}),
      });

      const geometryQuery = supabase
        .from("line_segments")
        .select("id, geometry")
        .eq("project_id", projectId!);

      const [progress, geometries] = await Promise.all([
        progressQuery,
        crewId
          ? geometryQuery.eq("assigned_crew_id", crewId)
          : geometryQuery,
      ]);

      if (progress.error) throw progress.error;
      if (geometries.error) throw geometries.error;

      const geometryById = new Map<string, GeoLineString | null>(
        (geometries.data ?? []).map((row) => [
          row.id,
          (row.geometry as GeoLineString | null) ?? null,
        ]),
      );

      const segments = groupBySegment(progress.data ?? []);
      for (const segment of segments) {
        segment.geometry = geometryById.get(segment.id) ?? null;
      }
      return segments;
    },
    enabled: !!projectId,
  });
}

/**
 * Name, Wave code and unit of every budget line of the project, keyed by id.
 *
 * `project_budgets` itself is finance-tier (a crew holds no `financial:read`),
 * so the label comes from `project_budget_line_labels`, which returns the
 * identity of a line without its rate.
 */
export function useBudgetLineLabels(projectId: string | undefined) {
  return useQuery({
    queryKey: segmentKeys.budgetLineLabels(projectId ?? ""),
    queryFn: async (): Promise<Record<string, BudgetLineLabel>> => {
      const { data, error } = await supabase.rpc(
        "project_budget_line_labels",
        { p_project_id: projectId! },
      );

      if (error) throw error;

      return Object.fromEntries(
        (data ?? []).map((row) => [row.budget_line_id, row]),
      );
    },
    enabled: !!projectId,
  });
}

/** `3101 · Bore principal`, or just the name when the line has no Wave product. */
export function budgetLineLabel(line: BudgetLineLabel | undefined): string | null {
  if (!line) return null;
  const name = line.line_name ?? "Actividad";
  return line.wave_product_code ? `${line.wave_product_code} · ${name}` : name;
}
