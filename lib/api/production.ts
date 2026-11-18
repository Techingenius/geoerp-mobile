import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase/client";
import type {
  Crew,
  ProductionEntry,
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
 * One `create_production_entry` call writes the entry AND its `crew_members`
 * in a single transaction (GRA-766, GRA-832). It replaces the two-step insert
 * this hook used to do, where losing signal between the two requests left a
 * committed entry with no roster — the expected case here, not the edge, since
 * crews report from the field on intermittent signal.
 *
 * The RPC is `SECURITY INVOKER`, so the RLS policies of `production_entries`
 * and `crew_members` apply exactly as they did to the direct inserts, and the
 * `production_entries` triggers hold the entry to the segment's activities and
 * plan. It also fills `reported_by` / `created_by` from `auth.uid()` and sets
 * `internal_status: 'reported'` / `billing_status: 'pending'` server-side, so
 * the client no longer sends them — nor does it need a round trip to read the
 * current user first. Web (`apps/web/src/hooks/use-production.ts`) and the
 * `daily-report` Edge Function go through the same function.
 */
export function useCreateProductionEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateProductionEntryInput) => {
      // Local read from AsyncStorage, not a round trip like `getUser()`. Only
      // to keep the "no session" case in the app's language: without it the
      // call goes out as anon and comes back as a bare permission-denied.
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) throw new Error("No hay sesión activa");

      const notes = input.notes?.trim();

      // No `.single()`: the function returns one `production_entries` row, so
      // PostgREST answers with the object itself. Same call shape as web and
      // the `daily-report` Edge Function.
      const { data: entry, error } = await supabase.rpc(
        "create_production_entry",
        {
          p_project_id: input.project_id,
          p_crew_id: input.crew_id,
          p_units_completed: input.units_completed,
          p_unit_type: input.unit_type,
          p_work_date: input.work_date,
          p_crew_member_ids: input.crew_member_ids,
          p_line_segment_id: input.line_segment_id ?? undefined,
          p_notes: notes ? notes : undefined,
        },
      );

      // Not special-cased by code: `42501` is both the RPC's own
      // "Not authenticated" and any RLS denial, so the database's message is
      // more honest than anything this layer could substitute for it.
      if (error) throw error;

      return entry as ProductionEntry;
    },
    // onSettled, not onSuccess. The write is atomic now, so a failure never
    // leaves a half-written entry — but a response lost on the way back still
    // leaves a COMMITTED entry the app believes failed. The recent-entries
    // list is what the duplicate-entry banner reads, so refreshing it on both
    // paths is what gives the reporter a chance to see the entry that did land
    // instead of reporting it twice. Keyed off `variables` because `data` is
    // undefined on the error path.
    onSettled: (_entry, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: productionKeys.byProject(variables.project_id),
      });
    },
  });
}
