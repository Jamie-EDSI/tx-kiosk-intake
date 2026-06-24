import type { SupabaseClient } from "@supabase/supabase-js";

export type AvailableStaff = {
  user_id: string;
  display_name: string;
  last_seen_at: string | null;
};

export async function pickNextAvailableStaff(supabase: SupabaseClient, excludedUserIds: string[] = []) {
  const staleCutoff = new Date(Date.now() - 90_000).toISOString();

  const { data: staff, error: staffError } = await supabase
    .from("staff_profiles")
    .select("user_id, display_name, last_seen_at")
    .eq("status", "available")
    .gte("last_seen_at", staleCutoff)
    .order("display_name", { ascending: true });

  if (staffError) throw staffError;
  const available = ((staff || []) as AvailableStaff[]).filter((item) => !excludedUserIds.includes(item.user_id));
  if (available.length === 0) return null;

  const { data: state, error: stateError } = await supabase
    .from("call_routing_state")
    .select("last_staff_user_id")
    .eq("id", "global")
    .single();

  if (stateError) throw stateError;

  const lastIndex = available.findIndex((item) => item.user_id === state?.last_staff_user_id);
  const next = available[(lastIndex + 1) % available.length];

  const { error: updateError } = await supabase
    .from("call_routing_state")
    .update({ last_staff_user_id: next.user_id, updated_at: new Date().toISOString() })
    .eq("id", "global");

  if (updateError) throw updateError;
  return next;
}
