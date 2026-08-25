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
 * Uses project_id directly (mobile-created services) OR via line_segments join (legacy).
 * Two queries merged: services with project_id + services via line_segment.
 */
export function useProjectServices(projectId: string) {
  return useQuery({
    queryKey: ["services", projectId],
    queryFn: async (): Promise<Service[]> => {
      // Fetch services that have project_id set directly (mobile-created)
      const { data: directServices, error: directError } = await supabase
        .from("services")
        .select("*, line_segment:line_segments(id, name, project_id)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (directError) throw directError;

      // Also fetch services linked via line_segments (legacy web-created)
      const { data: linkedServices, error: linkedError } = await supabase
        .from("services")
        .select("*, line_segment:line_segments!services_line_segment_id_fkey!inner(id, name, project_id)")
        .is("project_id", null)
        .eq("line_segment.project_id", projectId)
        .order("created_at", { ascending: false });

      if (linkedError) throw linkedError;

      // Merge and deduplicate by id
      const allServices = [...(directServices ?? []), ...(linkedServices ?? [])];
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
