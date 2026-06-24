import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export async function POST(request: Request, context: { params: Promise<{ callId: string }> }) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { callId } = await context.params;
  const supabase = createAdminSupabaseClient();

  const { data: call } = await supabase
    .from("call_sessions")
    .select("id, assigned_staff_id, status")
    .eq("id", callId)
    .single();

  if (!call || call.assigned_staff_id !== user.id) {
    return NextResponse.json({ message: "Call not assigned to this staff member." }, { status: 403 });
  }

  await supabase
    .from("call_sessions")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", callId);

  await supabase
    .from("staff_profiles")
    .update({ status: "busy", updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  await supabase.from("call_events").insert({
    call_session_id: callId,
    actor_type: "staff",
    actor_id: user.id,
    event_type: "accepted"
  });

  return NextResponse.json({ status: "accepted" });
}

async function getAuthenticatedUser(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data.user;
}
