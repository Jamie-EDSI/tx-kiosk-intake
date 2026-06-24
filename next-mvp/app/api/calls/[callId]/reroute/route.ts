import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { pickNextAvailableStaff } from "@/lib/round-robin";

export async function POST(request: Request, context: { params: Promise<{ callId: string }> }) {
  const { callId } = await context.params;
  const supabase = createAdminSupabaseClient();

  const body = await request.json().catch(() => ({}));
  if (!body.kioskDeviceId || !body.kioskDeviceToken) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { data: call } = await supabase
    .from("call_sessions")
    .select("id, status, ring_expires_at, routing_attempt, assigned_staff_id, kiosk_device_id")
    .eq("id", callId)
    .single();

  if (!call || call.kiosk_device_id !== body.kioskDeviceId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { data: kiosk } = await supabase
    .from("kiosk_devices")
    .select("token_hash, is_active")
    .eq("id", body.kioskDeviceId)
    .eq("is_active", true)
    .single();

  if (kiosk?.token_hash !== createHash("sha256").update(body.kioskDeviceToken).digest("hex")) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!call || call.status !== "ringing") {
    return NextResponse.json({ status: "not_ringing" });
  }

  if (call.ring_expires_at && new Date(call.ring_expires_at).getTime() > Date.now()) {
    return NextResponse.json({ status: "still_ringing" });
  }

  const excluded = call.assigned_staff_id ? [call.assigned_staff_id] : [];
  const nextStaff = await pickNextAvailableStaff(supabase, excluded);
  if (!nextStaff) {
    await supabase
      .from("call_sessions")
      .update({ status: "no_staff_available", assigned_staff_id: null, end_reason: "timeout_no_next_staff" })
      .eq("id", callId);
    return NextResponse.json({ status: "no_staff_available" });
  }

  const timeoutSeconds = Number(process.env.CALL_RING_TIMEOUT_SECONDS || 25);
  await supabase
    .from("call_sessions")
    .update({
      assigned_staff_id: nextStaff.user_id,
      ring_expires_at: new Date(Date.now() + timeoutSeconds * 1000).toISOString(),
      routing_attempt: Number(call.routing_attempt || 0) + 1
    })
    .eq("id", callId);

  await supabase.from("call_events").insert({
    call_session_id: callId,
    actor_type: "system",
    actor_id: nextStaff.user_id,
    event_type: "rerouted_after_timeout"
  });

  return NextResponse.json({ status: "rerouted" });
}
