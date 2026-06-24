import { NextResponse } from "next/server";
import { getRingingCallsForStaff } from "@/lib/local-server-store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const staffId = url.searchParams.get("staffId");
  if (!staffId) return NextResponse.json({ calls: [] });
  return NextResponse.json({ calls: getRingingCallsForStaff(staffId) });
}
