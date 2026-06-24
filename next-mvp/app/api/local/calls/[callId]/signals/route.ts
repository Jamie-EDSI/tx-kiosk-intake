import { NextResponse } from "next/server";
import { addSignal, getSignals } from "@/lib/local-server-store";
import type { SignalMessage } from "@/lib/signaling";

export async function GET(request: Request, context: { params: Promise<{ callId: string }> }) {
  const { callId } = await context.params;
  const url = new URL(request.url);
  const after = Number(url.searchParams.get("after") || 0);
  const receiver = (url.searchParams.get("receiver") || "kiosk") as "kiosk" | "staff";

  return NextResponse.json({ signals: getSignals(callId, after, receiver) });
}

export async function POST(request: Request, context: { params: Promise<{ callId: string }> }) {
  const { callId } = await context.params;
  const body = (await request.json()) as { sender: "kiosk" | "staff"; message: SignalMessage };
  const id = addSignal(callId, body.sender, body.message);
  return NextResponse.json({ id });
}
