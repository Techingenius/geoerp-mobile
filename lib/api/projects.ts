import { useQuery } from "@tanstack/react-query";
import { supabase } from "../supabase/client";
import type { Project, LineSegment, Service, PreExistingDamage } from "../../types/database";

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
      return data as unknown as LineSegment[];
    },
    enabled: !!projectId,
  });
}

/**
 * Fetch services for a project by joining through line_segments.
 * Services don't have a direct project_id FK — they reference line_segment_id,
 * and line_segments reference project_id.
 */
export function useProjectServices(projectId: string) {
  return useQuery({
    queryKey: ["services", projectId],
    queryFn: async (): Promise<Service[]> => {
      const { data, error } = await supabase
        .from("services")
        .select(
          "*, line_segment:line_segments!inner(id, name, project_id)"
        )
        .eq("line_segment.project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data as unknown as Service[]) ?? [];
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
      return data ?? [];
    },
    enabled: !!projectId,
  });
}
