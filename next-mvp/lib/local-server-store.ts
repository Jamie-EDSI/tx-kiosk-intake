import type { IntakeSummary, LocalStaffStatus } from "@/lib/local-demo";
import type { SignalMessage } from "@/lib/signaling";

type StaffRecord = {
  staffId: string;
  displayName: string;
  status: LocalStaffStatus;
  lastSeenAt: number;
};

type LocalCall = {
  id: string;
  assignedStaffId: string;
  intake: IntakeSummary;
  status: "ringing" | "accepted" | "declined" | "ended";
  createdAt: number;
};

type SignalRecord = {
  id: number;
  callSessionId: string;
  sender: "kiosk" | "staff";
  message: SignalMessage;
};

type LocalDemoStore = {
  calls: LocalCall[];
  lastSignalId: number;
  routingIndex: number;
  signals: SignalRecord[];
  staff: StaffRecord[];
};

const globalForStore = globalThis as typeof globalThis & {
  workforceLocalDemoStore?: LocalDemoStore;
};

export function getLocalDemoStore() {
  if (!globalForStore.workforceLocalDemoStore) {
    globalForStore.workforceLocalDemoStore = {
      calls: [],
      lastSignalId: 0,
      routingIndex: -1,
      signals: [],
      staff: []
    };
  }

  return globalForStore.workforceLocalDemoStore;
}

export function upsertServerStaff(staffId: string, displayName: string, status: LocalStaffStatus) {
  const store = getLocalDemoStore();
  store.staff = store.staff.filter((staff) => staff.staffId !== staffId);
  store.staff.push({ staffId, displayName, status, lastSeenAt: Date.now() });
  return store.staff.find((staff) => staff.staffId === staffId);
}

export function pickServerStaff() {
  const store = getLocalDemoStore();
  const cutoff = Date.now() - 90_000;
  const available = store.staff
    .filter((staff) => staff.status === "available" && staff.lastSeenAt >= cutoff)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  if (available.length === 0) return null;

  store.routingIndex = (store.routingIndex + 1) % available.length;
  return available[store.routingIndex];
}

export function createServerCall(intake: IntakeSummary) {
  const store = getLocalDemoStore();
  const staff = pickServerStaff();
  if (!staff) return null;

  const call: LocalCall = {
    id: `local-${crypto.randomUUID()}`,
    assignedStaffId: staff.staffId,
    intake,
    status: "ringing",
    createdAt: Date.now()
  };

  store.calls.push(call);
  return call;
}

export function getServerCall(callId: string) {
  return getLocalDemoStore().calls.find((call) => call.id === callId) || null;
}

export function updateServerCall(callId: string, status: LocalCall["status"]) {
  const call = getServerCall(callId);
  if (!call) return null;
  call.status = status;
  return call;
}

export function getRingingCallsForStaff(staffId: string) {
  return getLocalDemoStore().calls.filter((call) => call.assignedStaffId === staffId && call.status === "ringing");
}

export function addSignal(callSessionId: string, sender: "kiosk" | "staff", message: SignalMessage) {
  const store = getLocalDemoStore();
  store.lastSignalId += 1;
  store.signals.push({ id: store.lastSignalId, callSessionId, sender, message });
  store.signals = store.signals.slice(-500);
  return store.lastSignalId;
}

export function getSignals(callSessionId: string, afterId: number, receiver: "kiosk" | "staff") {
  return getLocalDemoStore().signals.filter(
    (signal) => signal.callSessionId === callSessionId && signal.id > afterId && signal.sender !== receiver
  );
}
