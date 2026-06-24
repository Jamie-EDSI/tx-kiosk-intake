import { NextResponse } from "next/server";
import { updateServerCall } from "@/lib/local-server-store";

export async function POST(_request: Request, context: { params: Promise<{ callId: string }> }) {
  const { callId } = await context.params;
  return NextResponse.json({ call: updateServerCall(callId, "declined") });
}
