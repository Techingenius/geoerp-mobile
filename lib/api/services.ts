import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { File } from "expo-file-system";
import { supabase } from "../supabase/client";
import type { ServiceStatus } from "../../types/database";

export interface ServicePhoto {
  id: string;
  service_id: string;
  storage_path: string;
  filename: string;
  photo_type: string | null;
  service_status: string | null;
  caption: string | null;
  taken_at: string | null;
  uploaded_by: string | null;
  created_at: string | null;
  uploaded_by_profile?: { full_name: string | null } | null;
}

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

export function useServicePhotos(serviceId: string | undefined) {
  return useQuery({
    queryKey: ["service-photos", serviceId],
    queryFn: async (): Promise<ServicePhoto[]> => {
      const { data, error } = await supabase
        .from("service_photos")
        .select("id, service_id, storage_path, filename, photo_type, service_status, caption, taken_at, uploaded_by, created_at, uploaded_by_profile:user_profiles!service_photos_uploaded_by_fkey(full_name)")
        .eq("service_id", serviceId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data as unknown as ServicePhoto[]) ?? [];
    },
    enabled: !!serviceId,
  });
}

export function getPhotoUrl(storagePath: string): string {
  const { data } = supabase.storage.from("service-photos").getPublicUrl(storagePath);
  return data.publicUrl;
}

interface UpdateServiceStatusInput {
  serviceId: string;
  status: ServiceStatus;
  photos: PhotoInput[];
  notes?: string;
}

export function useUpdateServiceStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateServiceStatusInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("No hay sesión activa");

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile?.organization_id) {
        throw new Error("No se pudo obtener la organización del usuario");
      }

      const { data: service, error: serviceError } = await supabase
        .from("services")
        .select("project_id")
        .eq("id", input.serviceId)
        .single();

      if (serviceError || !service) throw new Error("Servicio no encontrado");

      // Update service status + notes
      const { data: updated, error } = await supabase
        .from("services")
        .update({
          status: input.status,
          opened_by: user.id,
          notes: input.notes ?? null,
        })
        .eq("id", input.serviceId)
        .select()
        .single();

      if (error) throw error;

      // Upload all transition photos
      const photoType = input.status === "not_found" ? "not_found_proof" : "status_change";
      for (const photo of input.photos) {
        const storagePath = `${profile.organization_id}/${service.project_id}/${input.serviceId}/${Date.now()}_${photo.filename}`;

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

        await supabase.from("service_photos").insert({
          service_id: input.serviceId,
          storage_path: storagePath,
          filename: photo.filename,
          photo_type: photoType,
          service_status: input.status,
          caption: input.notes ?? null,
          taken_at: new Date().toISOString(),
          uploaded_by: user.id,
        });
      }

      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      queryClient.invalidateQueries({ queryKey: ["service-photos"] });
    },
  });
}

interface AddServicePhotosInput {
  serviceId: string;
  photos: PhotoInput[];
  caption?: string;
}

export function useAddServicePhotos() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AddServicePhotosInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("No hay sesión activa");

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile?.organization_id) {
        throw new Error("No se pudo obtener la organización del usuario");
      }

      const { data: service } = await supabase
        .from("services")
        .select("project_id, status")
        .eq("id", input.serviceId)
        .single();

      if (!service) throw new Error("Servicio no encontrado");

      for (const photo of input.photos) {
        const storagePath = `${profile.organization_id}/${service.project_id}/${input.serviceId}/${Date.now()}_${photo.filename}`;

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

        const { error } = await supabase.from("service_photos").insert({
          service_id: input.serviceId,
          storage_path: storagePath,
          filename: photo.filename,
          photo_type: "evidence",
          service_status: service.status,
          caption: input.caption ?? null,
          taken_at: new Date().toISOString(),
          uploaded_by: user.id,
        });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-photos"] });
    },
  });
}
