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
 * Two parallel queries merged + dedup:
 * 1. services WHERE project_id = X  (backfilled + mobile-created)
 * 2. services linked via line_segments for this project (catches any not backfilled)
 */
export function useProjectServices(projectId: string) {
  return useQuery({
    queryKey: ["services", projectId],
    queryFn: async (): Promise<Service[]> => {
      // Get segment IDs for this project (needed for query 2)
      const { data: projectSegments, error: segError } = await supabase
        .from("line_segments")
        .select("id")
        .eq("project_id", projectId);

      if (segError) {
        console.warn("[useProjectServices] segments query error:", segError);
        throw segError;
      }

      const segmentIds = (projectSegments ?? []).map((s) => s.id);
      console.warn(`[useProjectServices] projectId=${projectId}, segments=${segmentIds.length}`);

      // Query 1: services with project_id set directly (migration backfills this)
      const { data: directServices, error: directError } = await supabase
        .from("services")
        .select("*, line_segment:line_segments!services_line_segment_id_fkey(id, name, project_id)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (directError) {
        console.warn("[useProjectServices] direct query error:", directError);
        throw directError;
      }

      console.warn(`[useProjectServices] direct services=${directServices?.length ?? 0}`);

      // Query 2: services linked via line_segments (no project_id on service row)
      let linkedServices: typeof directServices = [];
      if (segmentIds.length > 0) {
        const { data, error: linkedError } = await supabase
          .from("services")
          .select("*, line_segment:line_segments!services_line_segment_id_fkey(id, name, project_id)")
          .is("project_id", null)
          .in("line_segment_id", segmentIds)
          .order("created_at", { ascending: false });

        if (linkedError) {
          console.warn("[useProjectServices] linked query error:", linkedError);
          throw linkedError;
        }
        linkedServices = data ?? [];
      }

      console.warn(`[useProjectServices] linked services=${linkedServices.length}`);

      // Merge and deduplicate by id
      const allServices = [...(directServices ?? []), ...linkedServices];
      const seen = new Set<string>();
      const unique = allServices.filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });

      console.warn(`[useProjectServices] total unique=${unique.length}`);
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
