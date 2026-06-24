"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { VideoCallPanel } from "@/components/VideoCallPanel";
import { useWebRtcCall } from "@/hooks/use-webrtc-call";
import {
  createHttpSignalChannel,
  getLocalDemoStaffId,
  isLocalDemoMode,
  type IntakeSummary,
} from "@/lib/local-demo";
import { createCallSignaling, type SignalMessage } from "@/lib/signaling";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

type StaffStatus = "available" | "busy" | "offline";
type IncomingCall = {
  id: string;
  kiosk_device_id: string;
  status: string;
  ring_expires_at: string | null;
  intake?: IntakeSummary;
  metadata?: { intake?: IntakeSummary };
};

type SignalChannel = {
  send: (signal: SignalMessage) => Promise<void> | void;
  close: () => Promise<void> | void;
  subscribe?: () => Promise<void>;
};

export default function StaffDashboardPage() {
  const localDemo = isLocalDemoMode();
  const supabase = useMemo(() => (localDemo ? null : createBrowserSupabaseClient()), [localDemo]);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localStaffId] = useState(() => getLocalDemoStaffId());
  const [status, setStatus] = useState<StaffStatus>("offline");
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const signalingRef = useRef<SignalChannel | null>(null);
  const [message, setMessage] = useState(
    localDemo ? "Local demo mode is on. Mark yourself Available to receive kiosk calls." : "Sign in to receive kiosk video calls."
  );

  const sendSignal = useCallback(async (signal: SignalMessage) => {
    await signalingRef.current?.send(signal);
  }, []);

  const handleRemoteEnded = useCallback(() => {
    setIncomingCall(null);
    setMessage("The kiosk ended the call.");
  }, []);

  const call = useWebRtcCall({
    role: "staff",
    sendSignal,
    onRemoteEnded: handleRemoteEnded
  });

  useEffect(() => {
    if (localDemo) {
      setUser({
        id: localStaffId,
        email: "local.staff@example.test",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString()
      } as User);
      return;
    }

    supabase!.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase!.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => data.subscription.unsubscribe();
  }, [localDemo, localStaffId, supabase]);

  useEffect(() => {
    if (!user || localDemo) return;

    const channel = supabase!
      .channel(`staff-calls:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "call_sessions",
          filter: `assigned_staff_id=eq.${user.id}`
        },
        (payload) => {
          const nextCall = payload.new as IncomingCall;
          if (nextCall.status === "ringing") {
            setIncomingCall(nextCall);
            setMessage("Incoming kiosk call.");
          }
        }
      )
      .subscribe();

    return () => {
      void supabase!.removeChannel(channel);
    };
  }, [localDemo, supabase, user]);

  useEffect(() => {
    if (!localDemo || !user || status !== "available") return;

    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/local/staff/calls?staffId=${encodeURIComponent(user.id)}`);
      const result = await response.json();
      const nextCall = result.calls?.[0];

      if (nextCall && nextCall.id !== incomingCall?.id) {
        setIncomingCall({
          id: nextCall.id,
          kiosk_device_id: "local-kiosk",
          status: nextCall.status,
          ring_expires_at: null,
          intake: nextCall.intake
        });
        setMessage("Incoming local kiosk call.");
      }
    }, 900);

    return () => window.clearInterval(timer);
  }, [incomingCall?.id, localDemo, status, user]);

  useEffect(() => {
    if (!user || status === "offline") return;

    const heartbeat = async () => {
      if (localDemo) {
        await updateLocalPresence(user.id, user.email || "Local Staff", status);
        return;
      }

      await supabase!
        .from("staff_profiles")
        .update({ status, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
    };

    void heartbeat();
    const timer = window.setInterval(heartbeat, 30_000);
    return () => window.clearInterval(timer);
  }, [localDemo, status, supabase, user]);

  async function signIn() {
    if (!supabase) return;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      return;
    }

    setUser(data.user);
    setMessage("Signed in. Set yourself available when ready.");
  }

  async function updateStatus(nextStatus: StaffStatus) {
    if (!user) return;
    setStatus(nextStatus);

    if (localDemo) {
      await updateLocalPresence(user.id, user.email || "Local Staff", nextStatus);
      setMessage(`You are ${nextStatus}.`);
      return;
    }

    await supabase!
      .from("staff_profiles")
      .upsert({
        user_id: user.id,
        display_name: user.email || "Staff",
        status: nextStatus,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
  }

  async function acceptCall() {
    if (!incomingCall) return;
    if (user) {
      setStatus("busy");
      if (localDemo) await updateLocalPresence(user.id, user.email || "Local Staff", "busy");
    }

    if (localDemo) {
      await fetch(`/api/local/calls/${incomingCall.id}/accept`, { method: "POST" });
    } else {
      await staffFetch(`/api/calls/${incomingCall.id}/accept`);
    }

    const nextSignaling: SignalChannel = localDemo
      ? createHttpSignalChannel(incomingCall.id, "staff", call.handleSignal)
      : createCallSignaling(supabase!, incomingCall.id, call.handleSignal);

    if (nextSignaling.subscribe) {
      await nextSignaling.subscribe();
    }

    signalingRef.current = nextSignaling;

    try {
      await call.startLocalMedia();
      setMessage("Call accepted. Waiting for kiosk media.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Camera or microphone could not be started.");
    }
  }

  async function declineCall() {
    if (!incomingCall) return;

    if (localDemo) {
      await fetch(`/api/local/calls/${incomingCall.id}/decline`, { method: "POST" });
    } else {
      await staffFetch(`/api/calls/${incomingCall.id}/decline`);
    }

    setIncomingCall(null);
    setMessage("Call declined and returned to routing.");
  }

  async function endCall() {
    await call.endCall();

    if (localDemo && incomingCall) {
      await fetch(`/api/local/calls/${incomingCall.id}/end`, { method: "POST" });
    }

    if (incomingCall && !localDemo) {
      await staffFetch(`/api/calls/${incomingCall.id}/end`);
    }

    if (signalingRef.current) await signalingRef.current.close();
    signalingRef.current = null;
    setIncomingCall(null);
    if (user && localDemo) {
      setStatus("available");
      await updateLocalPresence(user.id, user.email || "Local Staff", "available");
    }
    setMessage("Call ended.");
  }

  async function updateLocalPresence(staffId: string, displayName: string, nextStatus: StaffStatus) {
    await fetch("/api/local/staff/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId, displayName, status: nextStatus })
    });
  }

  async function staffFetch(path: string) {
    if (!supabase) return fetch(path, { method: "POST" });

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return fetch(path, {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : undefined
    });
  }

  if (!user && !localDemo) {
    return (
      <main className="screen">
        <section className="signin">
          <h1>Staff sign in</h1>
          <p className="muted">{message}</p>
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
          <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" />
          <button className="button primary" type="button" onClick={signIn}>
            Sign in
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="screen">
      <section className="staff-shell">
        <div className="staff-header">
          <div>
            <h1>{localDemo ? "Local staff dashboard" : "Staff availability"}</h1>
            <p className="muted">{message}</p>
          </div>
          <div className="status-controls">
            {(["available", "busy", "offline"] as StaffStatus[]).map((item) => (
              <button
                key={item}
                className={`button ${status === item ? "active" : ""}`}
                type="button"
                onClick={() => updateStatus(item)}
              >
                {item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {incomingCall && call.status === "idle" ? (
          <section className="queue-card">
            <h2>Incoming kiosk call</h2>
            <p className="muted">Call session {incomingCall.id}</p>
            <IntakePreview intake={incomingCall.intake || incomingCall.metadata?.intake} />
            <div className="call-controls">
              <button className="button primary" type="button" onClick={acceptCall}>
                Accept
              </button>
              <button className="button danger" type="button" onClick={declineCall}>
                Decline
              </button>
            </div>
          </section>
        ) : null}

        {incomingCall && call.status !== "idle" ? (
          <VideoCallPanel
            localStream={call.localStream}
            remoteStream={call.remoteStream}
            muted={call.muted}
            cameraOff={call.cameraOff}
            onEnd={endCall}
            onToggleMute={call.toggleMute}
            onToggleCamera={call.toggleCamera}
          />
        ) : null}

        {call.mediaError ? <p className="error-note">{call.mediaError}</p> : null}
      </section>
    </main>
  );
}

function IntakePreview({ intake }: { intake?: IntakeSummary }) {
  if (!intake) {
    return <p className="muted">No intake details were attached to this call.</p>;
  }

  return (
    <div className="intake-preview">
      <div>
        <strong>
          {intake.firstName} {intake.lastName}
        </strong>
        <span className="muted">DOB {intake.dob || "not provided"} · ID ending {intake.last4 || "n/a"}</span>
      </div>
      <dl>
        <div>
          <dt>Reason</dt>
          <dd>{intake.reason || "Not selected"}</dd>
        </div>
        <div>
          <dt>Language</dt>
          <dd>{intake.language}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{intake.phone || "Not provided"}</dd>
        </div>
        <div>
          <dt>Needs</dt>
          <dd>{intake.needs.length ? intake.needs.join(", ") : "None selected"}</dd>
        </div>
      </dl>
      {intake.notes ? <p className="muted">{intake.notes}</p> : null}
    </div>
  );
}
