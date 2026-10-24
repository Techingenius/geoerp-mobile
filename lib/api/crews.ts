import { useQuery } from "@tanstack/react-query";
import { supabase } from "../supabase/client";
import type { Crew } from "../../types/database";

export const crewKeys = {
  mine: (userId: string) => ["crews", "mine", userId] as const,
  reportable: (userId: string) => ["crews", "reportable", userId] as const,
};

/** Active crews in the caller's organization, in name order. */
async function fetchActiveCrews(): Promise<Crew[]> {
  const { data, error } = await supabase
    .from("crews")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) throw error;
  return data ?? [];
}

async function fetchMyCrews(userId: string): Promise<Crew[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from("crew_default_members")
    .select("crew_id")
    .eq("user_id", userId);

  if (membershipError) throw membershipError;

  const memberCrewIds = (memberships ?? []).map((row) => row.crew_id);

  // `.or()` takes one PostgREST filter string; `id.in.()` with an empty list
  // is a syntax error, so the member clause only goes in when there is at
  // least one id.
  const filters = [`lead_user_id.eq.${userId}`];
  if (memberCrewIds.length > 0) {
    filters.push(`id.in.(${memberCrewIds.join(",")})`);
  }

  const { data, error } = await supabase
    .from("crews")
    .select("*")
    .eq("is_active", true)
    .or(filters.join(","))
    .order("name");

  if (error) throw error;
  return data ?? [];
}

/** Whose crews the caller is choosing between. */
export type CrewScope = "mine" | "org";

export interface ReportableCrews {
  crews: Crew[];
  scope: CrewScope;
}

/**
 * The crews this user can pick when reporting production.
 *
 * A crew lead gets their own crew (usually exactly one, so the screen selects
 * it and never asks). Only when they are on none — an admin or supervisor
 * reporting on a crew's behalf — does the org-wide list get fetched. Offering
 * a crew lead all 12 crews in the company is three extra taps and a guaranteed
 * RLS denial on 11 of them.
 */
export function useReportableCrews(userId: string | undefined) {
  return useQuery({
    queryKey: crewKeys.reportable(userId ?? ""),
    queryFn: async (): Promise<ReportableCrews> => {
      const mine = await fetchMyCrews(userId!);
      if (mine.length > 0) return { crews: mine, scope: "mine" };
      return { crews: await fetchActiveCrews(), scope: "org" };
    },
    enabled: !!userId,
  });
}

/**
 * The crews the signed-in user reports for — the ones they lead, plus the ones
 * they are a standing member of.
 *
 * `crews` SELECT is scoped to the organization, not to the crew, so a plain
 * list shows a crew lead every crew in the company. That is the right scope for
 * a supervisor assigning work and the wrong one for "mis tramos": the filter
 * has to be applied here, against the same pair of conditions the database uses
 * to decide who may report (`is_crew_reporter`, GRA-767).
 *
 * An admin or supervisor is normally on no crew, so this comes back empty for
 * them — callers treat that as "all crews", not as "nothing to show".
 */
export function useMyCrews(userId: string | undefined) {
  return useQuery({
    queryKey: crewKeys.mine(userId ?? ""),
    queryFn: () => fetchMyCrews(userId!),
    enabled: !!userId,
  });
}
