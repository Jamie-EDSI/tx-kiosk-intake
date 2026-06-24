"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VideoCallPanel } from "@/components/VideoCallPanel";
import { useWebRtcCall } from "@/hooks/use-webrtc-call";
import { isWithinBusinessHours } from "@/lib/business-hours";
import {
  createHttpSignalChannel,
  isLocalDemoMode,
  type IntakeSummary
} from "@/lib/local-demo";
import { createCallSignaling, type SignalMessage } from "@/lib/signaling";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

type CallResponse = {
  callSessionId?: string;
  status: "ringing" | "no_staff_available" | "closed" | "error";
  message: string;
};

type SignalChannel = {
  send: (signal: SignalMessage) => Promise<void> | void;
  close: () => Promise<void> | void;
  subscribe?: () => Promise<void>;
};

type KioskStep =
  | "home"
  | "appointment-code"
  | "appointment-review"
  | "booking-service"
  | "booking-time"
  | "booking-confirm"
  | "booking-success";

const workInTexasUrl = "https://www.workintexas.com/vosnet/Default.aspx";

const services = ["TANF", "SNAP", "Choices", "Education Opportunity", "RESEA", "Career Advisor", "Youth Advisor"];
const appointmentTimes = ["10:00 AM", "10:10 AM", "10:20 AM", "10:30 AM", "10:40 AM", "10:50 AM"];

const initialIntake: IntakeSummary = {
  firstName: "Kiosk",
  lastName: "Participant",
  dob: "",
  last4: "0000",
  phone: "",
  reason: "Appointment",
  appointmentTime: "10:00 AM",
  language: "English",
  needs: [],
  notes: ""
};

export default function KioskCallPage() {
  const localDemo = isLocalDemoMode();
  const supabase = useMemo(() => (localDemo ? null : createBrowserSupabaseClient()), [localDemo]);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<KioskStep>("home");
  const [callSessionId, setCallSessionId] = useState<string | null>(null);
  const [confirmationCode, setConfirmationCode] = useState("");
  const [selectedService, setSelectedService] = useState("SNAP");
  const [selectedTime, setSelectedTime] = useState("10:20 AM");
  const [staffAccepted, setStaffAccepted] = useState(false);
  const [message, setMessage] = useState("Choose how we can help you today.");
  const signalingRef = useRef<SignalChannel | null>(null);

  const sendSignal = useCallback(async (signal: SignalMessage) => {
    await signalingRef.current?.send(signal);
  }, []);

  const handleRemoteEnded = useCallback(() => {
    setCallSessionId(null);
    setMessage("The staff member ended the call. Returning to the home screen.");
    setStep("home");
  }, []);

  const call = useWebRtcCall({
    role: "kiosk",
    sendSignal,
    onRemoteEnded: handleRemoteEnded
  });

  useEffect(() => {
    setOpen(isWithinBusinessHours());
    const timer = window.setInterval(() => setOpen(isWithinBusinessHours()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!callSessionId) return;

    const nextSignaling: SignalChannel = localDemo
      ? createHttpSignalChannel(callSessionId, "kiosk", call.handleSignal)
      : createCallSignaling(supabase!, callSessionId, call.handleSignal);

    if (nextSignaling.subscribe) {
      void nextSignaling.subscribe();
    }

    signalingRef.current = nextSignaling;

    return () => {
      signalingRef.current = null;
      void nextSignaling.close();
    };
  }, [call.handleSignal, callSessionId, localDemo, supabase]);

  useEffect(() => {
    if (localDemo || !callSessionId || call.status !== "idle") return;

    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/calls/${callSessionId}/reroute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kioskDeviceId: process.env.NEXT_PUBLIC_KIOSK_DEVICE_ID,
          kioskDeviceToken: process.env.NEXT_PUBLIC_KIOSK_DEVICE_TOKEN
        })
      });
      const result = await response.json();
      if (result.status === "no_staff_available") {
        setCallSessionId(null);
        setMessage("No live staff are available right now. Please check in at the desk or try again shortly.");
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [call.status, callSessionId, localDemo]);

  useEffect(() => {
    if (!localDemo || !callSessionId || call.status !== "idle") return;

    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/local/calls/${callSessionId}`);
      const result = await response.json();

      if (result.call?.status === "accepted") {
        setStaffAccepted(true);
        setMessage("Staff accepted. Press Start Call when you are ready.");
      }

      if (result.call?.status === "declined") {
        setCallSessionId(null);
        setStaffAccepted(false);
        setMessage("The staff member declined. Please try again or check in at the desk.");
        setStep("appointment-review");
      }

      if (result.call?.status === "ended") {
        setCallSessionId(null);
        setStaffAccepted(false);
        setMessage("The call has ended. Returning to the home screen.");
        setStep("home");
      }
    }, 900);

    return () => window.clearInterval(timer);
  }, [call.status, callSessionId, localDemo]);

  function goHome() {
    setStep("home");
    setCallSessionId(null);
    setStaffAccepted(false);
    setMessage("Choose how we can help you today.");
  }

  function verifyAppointment() {
    if (confirmationCode.trim().length < 4) {
      setMessage("Enter your confirmation code to continue.");
      return;
    }

    setMessage("Appointment found. You can join when ready.");
    setStep("appointment-review");
  }

  async function requestMeetingCall(overrides: Partial<IntakeSummary> = {}) {
    const meetingIntake: IntakeSummary = {
      ...initialIntake,
      reason: "Join appointment",
      appointmentTime: "10:00 AM",
      notes: `Confirmation code: ${confirmationCode || "local-demo"}`,
      ...overrides
    };

    setMessage("Looking for your appointment staff member...");

    if (localDemo) {
      const response = await fetch("/api/local/calls/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intake: meetingIntake })
      });
      const result = (await response.json()) as CallResponse;

      if (result.status !== "ringing" || !result.callSessionId) {
        setMessage(result.message || "No local staff are available. Open /staff in another browser and choose Available.");
        return;
      }

      setStaffAccepted(false);
      setCallSessionId(result.callSessionId);
      setMessage(result.message);
      return;
    }

    const response = await fetch("/api/calls/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kioskDeviceId: process.env.NEXT_PUBLIC_KIOSK_DEVICE_ID,
        kioskDeviceToken: process.env.NEXT_PUBLIC_KIOSK_DEVICE_TOKEN,
        intake: meetingIntake
      })
    });

    const result = (await response.json()) as CallResponse;
    setMessage(result.message);

    if (result.status === "ringing" && result.callSessionId) {
      setStaffAccepted(false);
      setCallSessionId(result.callSessionId);
    }
  }

  async function requestHelpCall() {
    await requestMeetingCall({
      reason: "Kiosk assistance",
      appointmentTime: "",
      notes: `Help requested from confirmation screen. Entered code: ${confirmationCode || "not entered"}`
    });
  }

  async function startCall() {
    try {
      await call.startOffer();
      setMessage("Connecting your meeting. You can end the call at any time.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Camera or microphone could not be started.");
    }
  }

  async function endCall() {
    await call.endCall();
    if (localDemo && callSessionId) {
      await fetch(`/api/local/calls/${callSessionId}/end`, { method: "POST" });
      setCallSessionId(null);
      setStaffAccepted(false);
      setStep("home");
      setMessage("The meeting has ended. Returning to the home screen.");
      return;
    }

    if (callSessionId) {
      await fetch(`/api/calls/${callSessionId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kioskDeviceId: process.env.NEXT_PUBLIC_KIOSK_DEVICE_ID,
          kioskDeviceToken: process.env.NEXT_PUBLIC_KIOSK_DEVICE_TOKEN
        })
      });
    }
    setCallSessionId(null);
    setStaffAccepted(false);
    setStep("home");
    setMessage("The meeting has ended. Returning to the home screen.");
  }

  return (
    <main className="screen kiosk-home">
      <section className="kiosk-card">
        <div className="kiosk-topbar">
          <strong>Welcome</strong>
          <span>English</span>
        </div>

        <div className="kiosk-heading">
          <p className="lead">{open ? message : "Live meeting help is available during business hours."}</p>
        </div>

        {!callSessionId ? (
          <>
            {step === "home" ? (
              <section className="flow-home" aria-label="Kiosk main menu">
                <h1>How can we help you today?</h1>
                <div className="flow-options">
                  <a className="flow-card blue" href={workInTexasUrl} target="_blank" rel="noopener noreferrer">
                    <span className="flow-number">1</span>
                    <span className="flow-icon" aria-hidden="true">◎</span>
                    <strong>Not a Member</strong>
                    <span>Work in Texas</span>
                    <small>Create Profile</small>
                  </a>

                  <button className="flow-card green" type="button" onClick={() => setStep("appointment-code")}>
                    <span className="flow-number">2</span>
                    <span className="flow-icon" aria-hidden="true">✓</span>
                    <strong>Have an Appointment</strong>
                    <span>Enter confirmation code to join your meeting</span>
                  </button>

                  <button className="flow-card purple" type="button" onClick={() => setStep("booking-service")}>
                    <span className="flow-number">3</span>
                    <span className="flow-icon" aria-hidden="true">◷</span>
                    <strong>Don&apos;t Have an Appointment</strong>
                    <span>Book an appointment within the next hour</span>
                  </button>
                </div>
              </section>
            ) : null}

            {step === "appointment-code" ? (
              <section className="kiosk-step narrow" aria-label="Enter confirmation code">
                <h1>Enter Confirmation Code</h1>
                <p className="muted">Please enter your confirmation code.</p>
                <input
                  className="code-input"
                  value={confirmationCode}
                  onChange={(event) => setConfirmationCode(event.target.value.toUpperCase())}
                  placeholder="Example: A12345"
                />
                <div className="step-actions">
                  <button className="button" type="button" onClick={goHome}>Cancel</button>
                  <button className="button primary" type="button" onClick={verifyAppointment}>Continue</button>
                </div>
                <button className="text-button" type="button" onClick={requestHelpCall}>
                  Need help? Talk to staff
                </button>
              </section>
            ) : null}

            {step === "appointment-review" ? (
              <section className="kiosk-step narrow" aria-label="Verify appointment">
                <h1>Verify Appointment</h1>
                <p className="muted">Let&apos;s make sure it&apos;s time for your appointment.</p>
                <div className="summary-box ready">
                  <div><span>Time:</span><strong>10:00 AM</strong></div>
                  <div><span>With:</span><strong>Case Manager</strong></div>
                  <div><span>Status:</span><strong>Ready to Join</strong></div>
                </div>
                <p>Are you ready to join?</p>
                <div className="step-actions">
                  <button className="button" type="button" onClick={goHome}>Cancel</button>
                  <button className="button primary" type="button" onClick={() => requestMeetingCall()}>Join Meeting</button>
                </div>
              </section>
            ) : null}

            {step === "booking-service" ? (
              <section className="kiosk-step" aria-label="Select a service">
                <h1>Select a Service</h1>
                <p className="muted">Please select the service you need.</p>
                <div className="service-list">
                  {services.map((service) => (
                    <button
                      key={service}
                      className={`service-button ${selectedService === service ? "selected" : ""}`}
                      type="button"
                      onClick={() => setSelectedService(service)}
                    >
                      {service}
                    </button>
                  ))}
                </div>
                <div className="step-actions">
                  <button className="button" type="button" onClick={goHome}>Cancel</button>
                  <button className="button primary purple-button" type="button" onClick={() => setStep("booking-time")}>Next</button>
                </div>
              </section>
            ) : null}

            {step === "booking-time" ? (
              <section className="kiosk-step narrow" aria-label="Select time">
                <h1>Select Time</h1>
                <p className="muted">Available times within the next hour.</p>
                <div className="time-list">
                  {appointmentTimes.map((time) => (
                    <button
                      key={time}
                      className={`time-button ${selectedTime === time ? "selected" : ""}`}
                      type="button"
                      onClick={() => setSelectedTime(time)}
                    >
                      {time}
                    </button>
                  ))}
                </div>
                <div className="step-actions">
                  <button className="button" type="button" onClick={() => setStep("booking-service")}>Back</button>
                  <button className="button primary purple-button" type="button" onClick={() => setStep("booking-confirm")}>Next</button>
                </div>
              </section>
            ) : null}

            {step === "booking-confirm" ? (
              <section className="kiosk-step narrow" aria-label="Confirm appointment">
                <h1>Confirm Appointment</h1>
                <p className="muted">Please confirm your appointment details.</p>
                <div className="summary-box purple-summary">
                  <div><span>Service:</span><strong>{selectedService}</strong></div>
                  <div><span>Time:</span><strong>{selectedTime}</strong></div>
                  <div><span>With:</span><strong>Case Manager</strong></div>
                </div>
                <div className="step-actions">
                  <button className="button" type="button" onClick={() => setStep("booking-time")}>Back</button>
                  <button className="button primary purple-button" type="button" onClick={() => setStep("booking-success")}>Confirm</button>
                </div>
              </section>
            ) : null}

            {step === "booking-success" ? (
              <section className="kiosk-step narrow success-screen" aria-label="Appointment booked">
                <div className="success-mark">✓</div>
                <h1>Appointment Booked!</h1>
                <p>Your appointment is confirmed. Please check in at least 10 minutes before your appointment time.</p>
                <button className="button primary purple-button" type="button" onClick={goHome}>Return to Home</button>
              </section>
            ) : null}
          </>
        ) : (
          <section className="kiosk-step" aria-label="Joining meeting">
            <h1>Joining Meeting...</h1>
            <p className="muted">Please wait while we connect you to your appointment.</p>
            <VideoCallPanel
              localStream={call.localStream}
              remoteStream={call.remoteStream}
              muted={call.muted}
              cameraOff={call.cameraOff}
              onStart={startCall}
              onEnd={endCall}
              onToggleMute={call.toggleMute}
              onToggleCamera={call.toggleCamera}
              showStart={staffAccepted && call.status === "idle"}
            />
            {!staffAccepted && call.status === "idle" ? <p className="muted">Waiting for staff to accept your meeting.</p> : null}
          </section>
        )}

        {call.mediaError ? <p className="error-note">{call.mediaError}</p> : null}

        <div className="privacy">
          <strong>General notes</strong>
          <p>All screens are kiosk-optimized for touch. Assistance is available through staff when joining a meeting.</p>
          {localDemo ? <p>Local demo mode: signaling stays inside this browser on this machine.</p> : null}
        </div>
      </section>
    </main>
  );
}
