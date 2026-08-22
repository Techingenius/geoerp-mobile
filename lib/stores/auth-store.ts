import { create } from "zustand";
import { supabase } from "../supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { UserRole } from "../../types/database";

interface AuthState {
  session: Session | null;
  user: User | null;
  role: UserRole | null;
  permissions: Record<string, string[]> | null;
  isLoading: boolean;
  initialized: boolean;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasPermission: (resource: string, action: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  role: null,
  permissions: null,
  isLoading: true,
  initialized: false,

  initialize: async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        const role = await fetchUserRole(session.user.id);
        set({
          session,
          user: session.user,
          role: role?.name ?? null,
          permissions: role?.permissions ?? null,
          isLoading: false,
          initialized: true,
        });
      } else {
        set({ isLoading: false, initialized: true });
      }

      supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          const role = await fetchUserRole(session.user.id);
          set({
            session,
            user: session.user,
            role: role?.name ?? null,
            permissions: role?.permissions ?? null,
          });
        } else {
          set({
            session: null,
            user: null,
            role: null,
            permissions: null,
          });
        }
      });
    } catch {
      set({ isLoading: false, initialized: true });
    }
  },

  signIn: async (email: string, password: string) => {
    set({ isLoading: true });
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      set({ isLoading: false });
      throw error;
    }
    // Auth state change listener handles the rest
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({
      session: null,
      user: null,
      role: null,
      permissions: null,
    });
  },

  hasPermission: (resource: string, action: string) => {
    const { permissions, role } = get();
    if (role === "admin") return true;
    if (!permissions) return false;
    if ((permissions as Record<string, unknown>).all === true) return true;
    const resourcePerms = permissions[resource];
    if (!resourcePerms) return false;
    return Array.isArray(resourcePerms) && resourcePerms.includes(action);
  },
}));

async function fetchUserRole(userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role_id, roles(name, permissions)")
    .eq("user_id", userId)
    .single();

  if (!data?.roles) return null;
  const roles = data.roles as unknown as {
    name: UserRole;
    permissions: Record<string, string[]>;
  };
  return roles;
}
