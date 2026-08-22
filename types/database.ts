/**
 * Core database types for GeoERP mobile.
 * These mirror the Supabase tables from the web admin.
 * Generate full types with: npx supabase gen types typescript --project-id <id>
 */

export type UserRole = "admin" | "supervisor" | "operator" | "trinchero";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface UserRoleRecord {
  id: string;
  user_id: string;
  role_id: string;
  role: {
    name: UserRole;
    permissions: Record<string, string[]>;
  };
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "completed" | "on_hold" | "cancelled";
  client_id: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Segment {
  id: string;
  project_id: string;
  name: string;
  geometry: GeoJSON.LineString;
  status: string;
  created_at: string;
}

export type ServiceStatus =
  | "pending"
  | "located"
  | "approved"
  | "completed"
  | "not_found";

export interface Service {
  id: string;
  project_id: string;
  segment_id: string | null;
  service_type: string;
  description: string | null;
  status: ServiceStatus;
  location: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
  service_line: {
    type: "LineString";
    coordinates: [number, number][];
  } | null;
  reported_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  work_order_id: string;
  name: string;
  description: string | null;
  status: string;
  assigned_to: string | null;
  created_at: string;
}

export interface PreExistingDamage {
  id: string;
  project_id: string;
  segment_id: string | null;
  damage_type: string;
  description: string | null;
  severity: "low" | "medium" | "high" | "critical";
  location: {
    type: "Point";
    coordinates: [number, number];
  };
  reported_by: string | null;
  reported_at: string;
  status: string;
}

export interface Attachment {
  id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  entity_type: "segment" | "service" | "task" | "damage";
  entity_id: string;
  uploaded_by: string;
  created_at: string;
}
