import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export function useProfile() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data, error } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (error) throw error;
      if (data) return data;
      const { data: created, error: e2 } = await supabase.from("profiles").insert({ id: u.user.id }).select().single();
      if (e2) throw e2;
      return created;
    },
  });
  const update = async (patch: Partial<Profile>) => {
    if (!q.data) return;
    const { error } = await supabase
      .from("profiles")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", q.data.id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["profile"] });
  };
  return { ...q, update };
}

export function useSamples() {
  return useQuery({
    queryKey: ["samples"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sign_samples").select("id,label,features,created_at");
      if (error) throw error;
      return data;
    },
  });
}
