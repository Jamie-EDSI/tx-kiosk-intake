"use client";

import { useEffect, useRef } from "react";

type VideoCallPanelProps = {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  onStart?: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  showStart?: boolean;
};

export function VideoCallPanel({
  localStream,
  remoteStream,
  muted,
  cameraOff,
  onStart,
  onEnd,
  onToggleMute,
  onToggleCamera,
  showStart = false
}: VideoCallPanelProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  return (
    <section className="video-panel" aria-label="Video call">
      <div className="video-grid">
        <div>
          <p className="muted">You</p>
          <video ref={localVideoRef} autoPlay muted playsInline />
        </div>
        <div>
          <p className="muted">Live person</p>
          <video ref={remoteVideoRef} autoPlay playsInline />
        </div>
      </div>
      <div className="call-controls">
        {showStart ? (
          <button className="button primary" type="button" onClick={onStart}>
            Start Call
          </button>
        ) : null}
        <button className="button" type="button" onClick={onToggleMute}>
          {muted ? "Unmute" : "Mute"}
        </button>
        <button className="button" type="button" onClick={onToggleCamera}>
          {cameraOff ? "Camera On" : "Camera Off"}
        </button>
        <button className="button danger" type="button" onClick={onEnd}>
          End Call
        </button>
      </div>
    </section>
  );
}
