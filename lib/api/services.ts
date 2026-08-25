import { useMutation, useQueryClient } from "@tanstack/react-query";
import { File } from "expo-file-system";
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

      // Get org_id from user profile for storage path consistency with web
      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (profileError || !profile?.organization_id) {
        throw new Error("No se pudo obtener la organización del usuario");
      }

      const orgId = profile.organization_id;

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
        const storagePath = `${orgId}/${input.project_id}/${service.id}/${Date.now()}_${photo.filename}`;

        // Read file bytes using the new expo-file-system File API
        const file = new File(photo.uri);
        const fileData = await file.bytes();

        const { error: uploadError } = await supabase.storage
          .from("service-photos")
          .upload(storagePath, fileData, {
            contentType: photo.mimeType,
          });

        if (uploadError) {
          throw new Error(`Error subiendo foto: ${uploadError.message}`);
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
