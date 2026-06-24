import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { pickNextAvailableStaff } from "@/lib/round-robin";

export async function POST(request: Request, context: { params: Promise<{ callId: string }> }) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { callId } = await context.params;
  const supabase = createAdminSupabaseClient();

  const { data: call } = await supabase
    .from("call_sessions")
    .select("id, assigned_staff_id, routing_attempt")
    .eq("id", callId)
    .single();

  if (!call || call.assigned_staff_id !== user.id) {
    return NextResponse.json({ message: "Call not assigned to this staff member." }, { status: 403 });
  }

  await supabase.from("call_events").insert({
    call_session_id: callId,
    actor_type: "staff",
    actor_id: user.id,
    event_type: "declined"
  });

  const nextStaff = await pickNextAvailableStaff(supabase, [user.id]);
  if (!nextStaff) {
    await supabase
      .from("call_sessions")
      .update({ status: "no_staff_available", assigned_staff_id: null, end_reason: "declined_no_next_staff" })
      .eq("id", callId);

    return NextResponse.json({ status: "no_staff_available" });
  }

  const timeoutSeconds = Number(process.env.CALL_RING_TIMEOUT_SECONDS || 25);
  await supabase
    .from("call_sessions")
    .update({
      status: "ringing",
      assigned_staff_id: nextStaff.user_id,
      ring_expires_at: new Date(Date.now() + timeoutSeconds * 1000).toISOString(),
      routing_attempt: Number(call.routing_attempt || 0) + 1
    })
    .eq("id", callId);

  await supabase.from("call_events").insert({
    call_session_id: callId,
    actor_type: "system",
    actor_id: nextStaff.user_id,
    event_type: "rerouted_after_decline"
  });

  return NextResponse.json({ status: "rerouted" });
}

async function getAuthenticatedUser(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data.user;
}
