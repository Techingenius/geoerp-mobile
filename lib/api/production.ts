import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase/client";
import type { ProductionEntry, UnitType } from "../../types/database";
import { segmentKeys } from "./segments";

export const productionKeys = {
  all: ["production-entries"] as const,
  byProject: (projectId: string) =>
    ["production-entries", "project", projectId] as const,
  crewDefaultMembers: (crewId: string) =>
    ["crew-default-members", crewId] as const,
};

export interface CrewMemberOption {
  user_id: string;
  full_name: string;
}

/** A production entry plus the display names the recent-entries list shows. */
export interface ProductionEntryWithNames extends ProductionEntry {
  crew?: { name: string } | null;
  reported_by_user?: { full_name: string | null } | null;
}

/**
 * The crew's standing roster. Used to pre-fill who worked today instead of
 * making a field user pick names out of the whole org on a phone.
 */
export function useCrewDefaultMembers(crewId: string | undefined) {
  return useQuery({
    queryKey: productionKeys.crewDefaultMembers(crewId ?? ""),
    queryFn: async (): Promise<CrewMemberOption[]> => {
      const { data, error } = await supabase
        .from("crew_default_members")
        .select(
          "user_id, user_profile:user_profiles!crew_default_members_user_id_fkey(full_name)",
        )
        .eq("crew_id", crewId!);

      if (error) throw error;

      const rows = (data ?? []) as unknown as {
        user_id: string;
        user_profile: { full_name: string | null } | null;
      }[];

      return rows
        .map((row) => ({
          user_id: row.user_id,
          full_name: row.user_profile?.full_name ?? "Sin nombre",
        }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
    enabled: !!crewId,
  });
}

/** Production already reported for this project, newest work_date first. */
export function useProjectProductionEntries(projectId: string | undefined) {
  return useQuery({
    queryKey: productionKeys.byProject(projectId ?? ""),
    queryFn: async (): Promise<ProductionEntryWithNames[]> => {
      const { data, error } = await supabase
        .from("production_entries")
        .select(
          "*, crew:crews!production_entries_crew_id_fkey(name), reported_by_user:user_profiles!production_entries_reported_by_fkey(full_name)",
        )
        .eq("project_id", projectId!)
        .order("work_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data as unknown as ProductionEntryWithNames[]) ?? [];
    },
    enabled: !!projectId,
  });
}

export interface CreateProductionEntryInput {
  project_id: string;
  line_segment_id?: string | null;
  /**
   * The segment activity being reported — a `project_budgets` line, i.e. one
   * Wave product. Required once the segment has planned activities; the
   * database refuses the entry otherwise (GRA-831).
   */
  budget_line_id?: string | null;
  crew_id: string;
  units_completed: number;
  unit_type: UnitType;
  /** Work date as `YYYY-MM-DD`; the column is a DATE, not a timestamp. */
  work_date: string;
  notes?: string | null;
  /** Why this entry takes the activity past its planned quantity. */
  overproduction_reason?: string | null;
  /** Workers who actually worked the shift; may be empty. */
  crew_member_ids: string[];
}

/**
 * A plan rule the database refused the entry on, in terms the screen can act
 * on. All three come back as `check_violation` (23514) from the segment
 * activity trigger, and telling them apart by `hint` is what turns "no se pudo
 * guardar" into a field instruction.
 */
export type ProductionPlanRejection =
  | "overproduction_reason_required"
  | "activity_required"
  | "activity_not_on_segment";

/** Postgres check_violation. */
const CHECK_VIOLATION = "23514";

/**
 * Which plan rule, if any, rejected this entry.
 *
 * The mobile form asks for a reason itself whenever the quantity goes past
 * what the activity has left, so reaching the overproduction branch means the
 * remaining quantity moved underneath us — another crew reported on the same
 * activity between the screen loading and the send.
 */
export function classifyPlanRejection(
  error: unknown,
): ProductionPlanRejection | null {
  if (!isPostgrestError(error) || error.code !== CHECK_VIOLATION) return null;

  const hint = error.hint ?? "";
  if (hint.includes("overproduction_reason")) {
    return "overproduction_reason_required";
  }
  if (hint.includes("Pass the budget line")) return "activity_required";
  if (hint.includes("Add the activity to the segment")) {
    return "activity_not_on_segment";
  }
  return null;
}

function isPostgrestError(
  error: unknown,
): error is { code: string; hint: string | null; message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

/**
 * Create a production entry at the first tier of the approval workflow.
 *
 * One RPC, one transaction (GRA-766): the entry and its `crew_members` rows
 * commit together, so a failed call leaves nothing behind and is safe to
 * retry. The two-step insert this replaced could commit the entry and lose
 * the roster, which put a billable entry in the approval queue that the
 * reporter was told had failed.
 *
 * `create_production_entry` is SECURITY INVOKER, so the same RLS decides who
 * may write: admins and supervisors, and crew leads or standing members of
 * the crew they report for (GRA-767). `internal_status` and `billing_status`
 * are set by the function, not by the caller.
 */
export function useCreateProductionEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateProductionEntryInput) => {
      const notes = input.notes?.trim();
      const reason = input.overproduction_reason?.trim();

      // Optional RPC arguments are typed as present-or-absent, not nullable:
      // an explicit null is not the same as letting the parameter default.
      const { data, error } = await supabase.rpc("create_production_entry", {
        p_project_id: input.project_id,
        p_crew_id: input.crew_id,
        p_units_completed: input.units_completed,
        p_unit_type: input.unit_type,
        p_work_date: input.work_date,
        p_crew_member_ids: input.crew_member_ids,
        ...(input.line_segment_id
          ? { p_line_segment_id: input.line_segment_id }
          : {}),
        ...(input.budget_line_id
          ? { p_budget_line_id: input.budget_line_id }
          : {}),
        ...(notes ? { p_notes: notes } : {}),
        ...(reason ? { p_overproduction_reason: reason } : {}),
      });

      if (error) throw error;
      return data as unknown as ProductionEntry;
    },
    onSuccess: (_entry, variables) => {
      queryClient.invalidateQueries({
        queryKey: productionKeys.byProject(variables.project_id),
      });
      // The entry changes what the activity has left to report, which is the
      // suggested quantity on the next one.
      queryClient.invalidateQueries({ queryKey: segmentKeys.all });
    },
  });
}
