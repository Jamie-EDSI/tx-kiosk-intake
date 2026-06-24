import { NextResponse } from "next/server";
import { upsertServerStaff } from "@/lib/local-server-store";

export async function POST(request: Request) {
  const body = await request.json();
  const staff = upsertServerStaff(body.staffId, body.displayName || "Local Staff", body.status || "offline");
  return NextResponse.json({ staff });
}
