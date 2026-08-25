import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase/client";
import type { ServiceStatus } from "../../types/database";

interface CreateServiceInput {
  project_id: string;
  line_segment_id?: string;
  service_type: string;
  notes?: string;
  latitude: number;
  longitude: number;
}

interface PhotoInput {
  uri: string;
  filename: string;
  mimeType: string;
}

export function useCreateService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateServiceInput & { photos: PhotoInput[] }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("No hay sesión activa");

      // 1. Insert the service
      const { data: service, error } = await supabase
        .from("services")
        .insert({
          project_id: input.project_id,
          line_segment_id: input.line_segment_id ?? null,
          service_type: input.service_type,
          notes: input.notes ?? null,
          status: "to_open" satisfies ServiceStatus,
          geometry: `SRID=4326;POINT(${input.longitude} ${input.latitude})`,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // 2. Upload photos and create service_photos records
      for (const photo of input.photos) {
        const storagePath = `${service.id}/${Date.now()}_${photo.filename}`;

        // Fetch the image file as blob
        const response = await fetch(photo.uri);
        const blob = await response.blob();

        const { error: uploadError } = await supabase.storage
          .from("service-photos")
          .upload(storagePath, blob, {
            contentType: photo.mimeType,
          });

        if (uploadError) {
          console.warn("Photo upload failed:", uploadError.message);
          continue;
        }

        // Insert service_photos record
        await supabase.from("service_photos").insert({
          service_id: service.id,
          storage_path: storagePath,
          filename: photo.filename,
          photo_type: "evidence",
          taken_at: new Date().toISOString(),
          location: `SRID=4326;POINT(${input.longitude} ${input.latitude})`,
          uploaded_by: user.id,
        });
      }

      return service;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
  });
}

interface UpdateServiceStatusInput {
  serviceId: string;
  status: ServiceStatus;
}

export function useUpdateServiceStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateServiceStatusInput) => {
      const { data, error } = await supabase
        .from("services")
        .update({ status: input.status })
        .eq("id", input.serviceId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
  });
}
