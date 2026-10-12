import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase/client";
import type {
  Crew,
  ProductionBillingStatus,
  ProductionEntry,
  ProductionInternalStatus,
  UnitType,
} from "../../types/database";

export const productionKeys = {
  all: ["production-entries"] as const,
  byProject: (projectId: string) =>
    ["production-entries", "project", projectId] as const,
  activeCrews: ["crews", "active"] as const,
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
 * Active crews in the caller's organization.
 * RLS (`crews.organization_id = current_user_org()`) does the org scoping, so
 * no organization_id filter is needed — nor would one be trustworthy here.
 */
export function useActiveCrews() {
  return useQuery({
    queryKey: productionKeys.activeCrews,
    queryFn: async (): Promise<Crew[]> => {
      const { data, error } = await supabase
        .from("crews")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data ?? [];
    },
  });
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
  crew_id: string;
  units_completed: number;
  unit_type: UnitType;
  /** Work date as `YYYY-MM-DD`; the column is a DATE, not a timestamp. */
  work_date: string;
  notes?: string | null;
  /** Workers who actually worked the shift; may be empty. */
  crew_member_ids: string[];
}

/**
 * Create a production entry at the first tier of the approval workflow.
 *
 * The initial state matches what the web app's approval workflow expects
 * (`apps/web/src/hooks/use-production.ts`): `internal_status: 'reported'` and
 * `billing_status: 'pending'`, both written explicitly rather than left to the
 * column defaults. Supervisor/admin approval and billing transitions stay on
 * the web side.
 *
 * `project_id` is sent on the insert because every RLS policy on this table
 * resolves the org through `production_entries.project_id` — the same scope
 * field whose omission broke service creation in GRA-396.
 */
export function useCreateProductionEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateProductionEntryInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("No hay sesión activa");

      const notes = input.notes?.trim();

      const { data: entry, error } = await supabase
        .from("production_entries")
        .insert({
          project_id: input.project_id,
          line_segment_id: input.line_segment_id ?? null,
          crew_id: input.crew_id,
          units_completed: input.units_completed,
          unit_type: input.unit_type,
          work_date: input.work_date,
          notes: notes ? notes : null,
          reported_by: user.id,
          created_by: user.id,
          internal_status: "reported" satisfies ProductionInternalStatus,
          billing_status: "pending" satisfies ProductionBillingStatus,
        })
        .select()
        .single();

      if (error) throw error;

      if (input.crew_member_ids.length > 0) {
        const { error: membersError } = await supabase
          .from("crew_members")
          .insert(
            input.crew_member_ids.map((user_id) => ({
              production_entry_id: entry.id,
              user_id,
              rate_applied: null,
            })),
          );

        if (membersError) throw membersError;
      }

      return entry as ProductionEntry;
    },
    onSuccess: (entry) => {
      queryClient.invalidateQueries({
        queryKey: productionKeys.byProject(entry.project_id),
      });
    },
  });
}
