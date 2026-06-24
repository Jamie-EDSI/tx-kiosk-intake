"use client";

import type { SignalMessage } from "@/lib/signaling";

export type LocalStaffStatus = "available" | "busy" | "offline";

export type IntakeSummary = {
  firstName: string;
  lastName: string;
  dob: string;
  last4: string;
  phone: string;
  reason: string;
  appointmentTime: string;
  language: string;
  needs: string[];
  notes: string;
};

export type LocalCallMessage =
  | { type: "presence"; staffId: string; displayName: string; status: LocalStaffStatus; at: string }
  | { type: "call-request"; callSessionId: string; kioskId: string; at: string }
  | { type: "call-routed"; callSessionId: string; staffId: string; intake: IntakeSummary; at: string }
  | { type: "call-accepted"; callSessionId: string; staffId: string; at: string }
  | { type: "call-declined"; callSessionId: string; staffId: string; at: string }
  | { type: "call-ended"; callSessionId: string; at: string };

const staffKey = "workforce-local-demo-staff";
const routingKey = "workforce-local-demo-routing-index";
const localDemoStaffId = "local-demo-staff";

export function isLocalDemoMode() {
  return process.env.NEXT_PUBLIC_LOCAL_DEMO === "true" || !process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function createLocalChannel<T>(name: string, onMessage: (message: T) => void) {
  const channel = new BroadcastChannel(name);
  channel.onmessage = (event) => onMessage(event.data as T);

  return {
    send(message: T) {
      channel.postMessage(message);
    },
    close() {
      channel.close();
    }
  };
}

export function createLocalSignalChannel(callSessionId: string, onSignal: (message: SignalMessage) => void) {
  return createLocalChannel<SignalMessage>(`local-signal:${callSessionId}`, onSignal);
}

export function createHttpSignalChannel(callSessionId: string, sender: "kiosk" | "staff", onSignal: (message: SignalMessage) => void) {
  let lastSignalId = 0;
  let timer: number | undefined;

  return {
    async subscribe() {
      timer = window.setInterval(async () => {
        const response = await fetch(`/api/local/calls/${callSessionId}/signals?after=${lastSignalId}&receiver=${sender}`);
        const result = (await response.json()) as {
          signals: Array<{ id: number; message: SignalMessage }>;
        };

        result.signals.forEach((signal) => {
          lastSignalId = Math.max(lastSignalId, signal.id);
          onSignal(signal.message);
        });
      }, 700);
    },
    async send(message: SignalMessage) {
      await fetch(`/api/local/calls/${callSessionId}/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender, message })
      });
    },
    close() {
      if (timer) window.clearInterval(timer);
    }
  };
}

export function getLocalDemoStaffId() {
  return localDemoStaffId;
}

export function upsertLocalStaff(staffId: string, displayName: string, status: LocalStaffStatus) {
  const staff = getLocalStaff().filter((item) => item.staffId !== staffId && !item.staffId.startsWith("staff-"));
  staff.push({ staffId, displayName, status, lastSeenAt: new Date().toISOString() });
  localStorage.setItem(staffKey, JSON.stringify(staff));
}

export function getLocalStaff() {
  try {
    return JSON.parse(localStorage.getItem(staffKey) || "[]") as Array<{
      staffId: string;
      displayName: string;
      status: LocalStaffStatus;
      lastSeenAt: string;
    }>;
  } catch {
    return [];
  }
}

export function pickLocalStaffRoundRobin() {
  const cutoff = Date.now() - 90_000;
  const available = getLocalStaff()
    .filter((staff) => staff.status === "available" && new Date(staff.lastSeenAt).getTime() >= cutoff)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  localStorage.setItem(staffKey, JSON.stringify(available));

  if (available.length === 0) return null;

  const index = Number(localStorage.getItem(routingKey) || "-1");
  const nextIndex = (index + 1) % available.length;
  localStorage.setItem(routingKey, String(nextIndex));
  return available[nextIndex];
}

export function createLocalCallSessionId() {
  return `local-${crypto.randomUUID()}`;
}
