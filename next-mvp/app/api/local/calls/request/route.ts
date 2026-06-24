import { NextResponse } from "next/server";
import { createServerCall } from "@/lib/local-server-store";
import type { IntakeSummary } from "@/lib/local-demo";

export async function POST(request: Request) {
  const body = (await request.json()) as { intake: IntakeSummary };
  const call = createServerCall(body.intake);

  if (!call) {
    return NextResponse.json({
      status: "no_staff_available",
      message: "No local staff are available. Open /staff in another browser and choose Available."
    });
  }

  return NextResponse.json({
    status: "ringing",
    callSessionId: call.id,
    message: "Ringing available staff."
  });
}
