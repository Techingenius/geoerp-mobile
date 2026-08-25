import { useQuery } from "@tanstack/react-query";
import { supabase } from "../supabase/client";
import type { Project, LineSegment, Service, PreExistingDamage } from "../../types/database";

// PostGIS geometry comes as `unknown` from the Supabase client.
// We cast at the query boundary since we know the runtime shape is GeoJSON.

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: async (): Promise<Project> => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}

export function useProjectSegments(projectId: string) {
  return useQuery({
    queryKey: ["segments", projectId],
    queryFn: async (): Promise<LineSegment[]> => {
      const { data, error } = await supabase
        .from("line_segments")
        .select("*")
        .eq("project_id", projectId)
        .order("name");

      if (error) throw error;
      return data as LineSegment[];
    },
    enabled: !!projectId,
  });
}

/**
 * Fetch services for a project.
 * Two queries merged + dedup:
 * 1. services WHERE project_id = X  (mobile-created + new web-created)
 * 2. services WHERE project_id IS NULL AND line_segment_id IN (segment IDs for project)
 *    (legacy web-created services linked only via line_segments)
 */
export function useProjectServices(projectId: string) {
  return useQuery({
    queryKey: ["services", projectId],
    queryFn: async (): Promise<Service[]> => {
      // Query 1: services with project_id set directly
      const { data: directServices, error: directError } = await supabase
        .from("services")
        .select("*, line_segment:line_segments(id, name, project_id)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (directError) throw directError;

      // Query 2: legacy services linked via line_segments (no project_id on service)
      // First get segment IDs for this project, then find services by those IDs.
      // This avoids PostgREST embedded-resource filtering which can silently fail.
      const { data: projectSegments, error: segError } = await supabase
        .from("line_segments")
        .select("id")
        .eq("project_id", projectId);

      if (segError) throw segError;

      const segmentIds = (projectSegments ?? []).map((s) => s.id);

      let linkedServices: typeof directServices = [];
      if (segmentIds.length > 0) {
        const { data, error: linkedError } = await supabase
          .from("services")
          .select("*, line_segment:line_segments(id, name, project_id)")
          .is("project_id", null)
          .in("line_segment_id", segmentIds)
          .order("created_at", { ascending: false });

        if (linkedError) throw linkedError;
        linkedServices = data ?? [];
      }

      // Merge and deduplicate by id
      const allServices = [...(directServices ?? []), ...linkedServices];
      const seen = new Set<string>();
      const unique = allServices.filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });

      return unique as Service[];
    },
    enabled: !!projectId,
  });
}

export function useProjectDamages(projectId: string) {
  return useQuery({
    queryKey: ["damages", projectId],
    queryFn: async (): Promise<PreExistingDamage[]> => {
      const { data, error } = await supabase
        .from("pre_existing_damages")
        .select("*")
        .eq("project_id", projectId)
        .order("reported_at", { ascending: false });

      if (error) throw error;
      return (data as PreExistingDamage[]) ?? [];
    },
    enabled: !!projectId,
  });
}
