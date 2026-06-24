import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export async function POST(request: Request, context: { params: Promise<{ callId: string }> }) {
  const { callId } = await context.params;
  const supabase = createAdminSupabaseClient();
  const authorized = await isAuthorizedToEnd(request, callId);

  if (!authorized) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  await supabase
    .from("call_sessions")
    .update({ status: "ended", ended_at: new Date().toISOString(), end_reason: "user_ended" })
    .eq("id", callId);

  await supabase.from("call_events").insert({
    call_session_id: callId,
    actor_type: "system",
    event_type: "ended"
  });

  return NextResponse.json({ status: "ended" });
}

async function isAuthorizedToEnd(request: Request, callId: string) {
  const supabase = createAdminSupabaseClient();
  const token = request.headers.get("authorization")?.replace("Bearer ", "");

  if (token) {
    const { data } = await supabase.auth.getUser(token);
    if (!data.user) return false;

    const { data: call } = await supabase
      .from("call_sessions")
      .select("assigned_staff_id")
      .eq("id", callId)
      .single();

    return call?.assigned_staff_id === data.user.id;
  }

  const body = await request.json().catch(() => ({}));
  if (!body.kioskDeviceId || !body.kioskDeviceToken) return false;

  const { data: call } = await supabase
    .from("call_sessions")
    .select("kiosk_device_id")
    .eq("id", callId)
    .single();

  if (call?.kiosk_device_id !== body.kioskDeviceId) return false;

  const { data: kiosk } = await supabase
    .from("kiosk_devices")
    .select("token_hash, is_active")
    .eq("id", body.kioskDeviceId)
    .eq("is_active", true)
    .single();

  return kiosk?.token_hash === createHash("sha256").update(body.kioskDeviceToken).digest("hex");
}
