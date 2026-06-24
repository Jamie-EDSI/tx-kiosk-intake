import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { isWithinBusinessHours } from "@/lib/business-hours";
import { pickNextAvailableStaff } from "@/lib/round-robin";

type RequestBody = {
  kioskDeviceId?: string;
  kioskDeviceToken?: string;
  intake?: Record<string, unknown>;
};

export async function POST(request: Request) {
  if (!isWithinBusinessHours()) {
    return NextResponse.json({
      status: "closed",
      message: "Live video help is available during business hours."
    });
  }

  const body = (await request.json()) as RequestBody;
  if (!body.kioskDeviceId || !body.kioskDeviceToken) {
    return NextResponse.json({ status: "error", message: "Missing kiosk device credentials." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const { data: kiosk, error: kioskError } = await supabase
    .from("kiosk_devices")
    .select("id, token_hash, is_active")
    .eq("id", body.kioskDeviceId)
    .eq("is_active", true)
    .single();

  if (kioskError || !kiosk || kiosk.token_hash !== sha256(body.kioskDeviceToken)) {
    return NextResponse.json({ status: "error", message: "This kiosk is not registered." }, { status: 401 });
  }

  const staff = await pickNextAvailableStaff(supabase);
  if (!staff) {
    const { data: session } = await supabase
      .from("call_sessions")
      .insert({
        kiosk_device_id: kiosk.id,
        status: "no_staff_available",
        end_reason: "no_available_staff"
      })
      .select("id")
      .single();

    if (session) {
      await logEvent(supabase, session.id, "system", null, "no_staff_available");
    }

    return NextResponse.json({
      status: "no_staff_available",
      message: "No live staff are available right now. Please check in at the desk or try again shortly."
    });
  }

  const timeoutSeconds = Number(process.env.CALL_RING_TIMEOUT_SECONDS || 25);
  const ringExpiresAt = new Date(Date.now() + timeoutSeconds * 1000).toISOString();

  const { data: session, error: sessionError } = await supabase
    .from("call_sessions")
    .insert({
      kiosk_device_id: kiosk.id,
      assigned_staff_id: staff.user_id,
      status: "ringing",
      ring_expires_at: ringExpiresAt,
      routing_attempt: 1,
      metadata: { intake: body.intake || null }
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ status: "error", message: "Could not create a call request." }, { status: 500 });
  }

  await logEvent(supabase, session.id, "system", staff.user_id, "routed", { displayName: staff.display_name });

  return NextResponse.json({
    status: "ringing",
    callSessionId: session.id,
    message: "We found an available staff member. Press Start Call when you are ready."
  });
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function logEvent(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  callSessionId: string,
  actorType: "kiosk" | "staff" | "system",
  actorId: string | null,
  eventType: string,
  payload: Record<string, unknown> = {}
) {
  await supabase.from("call_events").insert({
    call_session_id: callSessionId,
    actor_type: actorType,
    actor_id: actorId,
    event_type: eventType,
    payload
  });
}
