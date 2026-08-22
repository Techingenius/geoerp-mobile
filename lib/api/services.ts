import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase/client";
import type { ServiceStatus } from "../../types/database";

interface CreateServiceInput {
  project_id: string;
  segment_id?: string;
  service_type: string;
  description?: string;
  latitude: number;
  longitude: number;
}

export function useCreateService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateServiceInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("services")
        .insert({
          project_id: input.project_id,
          segment_id: input.segment_id ?? null,
          service_type: input.service_type,
          description: input.description ?? null,
          status: "pending" as ServiceStatus,
          location: `POINT(${input.longitude} ${input.latitude})`,
          reported_by: user?.id ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["services", variables.project_id],
      });
    },
  });
}

interface UpdateServiceStatusInput {
  serviceId: string;
  projectId: string;
  status: ServiceStatus;
}

export function useUpdateServiceStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateServiceStatusInput) => {
      const { data, error } = await supabase
        .from("services")
        .update({ status: input.status, updated_at: new Date().toISOString() })
        .eq("id", input.serviceId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["services", variables.projectId],
      });
    },
  });
}
