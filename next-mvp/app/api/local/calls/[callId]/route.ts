import { NextResponse } from "next/server";
import { getServerCall } from "@/lib/local-server-store";

export async function GET(_request: Request, context: { params: Promise<{ callId: string }> }) {
  const { callId } = await context.params;
  return NextResponse.json({ call: getServerCall(callId) });
}
