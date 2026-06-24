"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SignalMessage } from "@/lib/signaling";

type UseWebRtcCallOptions = {
  role: "kiosk" | "staff";
  sendSignal: (message: SignalMessage) => Promise<void>;
  onRemoteEnded?: () => void;
};

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

export function useWebRtcCall({ role, sendSignal, onRemoteEnded }: UseWebRtcCallOptions) {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "ended">("idle");

  const ensurePeer = useCallback(() => {
    if (peerRef.current) return peerRef.current;

    const peer = new RTCPeerConnection(rtcConfig);
    const inbound = new MediaStream();

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        void sendSignal({ type: "ice", candidate: event.candidate.toJSON() });
      }
    };

    peer.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => inbound.addTrack(track));
      setRemoteStream(inbound);
      setStatus("connected");
    };

    peerRef.current = peer;
    return peer;
  }, [sendSignal]);

  const startLocalMedia = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;

    if (!navigator.mediaDevices?.getUserMedia) {
      const message = "Camera and microphone access is not available in this browser. Try Chrome, Edge, or Safari over localhost or HTTPS.";
      setMediaError(message);
      setStatus("idle");
      throw new Error(message);
    }

    try {
      setMediaError(null);
      setStatus("connecting");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: "user" }
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      const peer = ensurePeer();
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      return stream;
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Camera or microphone permission was denied. Allow access in the browser, then try again."
          : "Camera or microphone could not be started. Check the kiosk devices and try again.";
      setMediaError(message);
      setStatus("idle");
      throw new Error(message);
    }
  }, [ensurePeer]);

  const startOffer = useCallback(async () => {
    setStatus("connecting");
    const peer = ensurePeer();
    await startLocalMedia();
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await sendSignal({ type: "offer", sdp: offer });
  }, [ensurePeer, sendSignal, startLocalMedia]);

  const endCall = useCallback(
    async (notifyPeer = true) => {
      if (notifyPeer) {
        await sendSignal({ type: "hangup" });
      }

      peerRef.current?.close();
      peerRef.current = null;

      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;

      setLocalStream(null);
      setRemoteStream(null);
      setStatus("ended");
      setMuted(false);
      setCameraOff(false);
    },
    [sendSignal]
  );

  const handleSignal = useCallback(
    async (message: SignalMessage) => {
      const peer = ensurePeer();

      if (message.type === "offer") {
        setStatus("connecting");
        await startLocalMedia();
        await peer.setRemoteDescription(message.sdp);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await sendSignal({ type: "answer", sdp: answer });
        return;
      }

      if (message.type === "answer") {
        await peer.setRemoteDescription(message.sdp);
        return;
      }

      if (message.type === "ice") {
        await peer.addIceCandidate(message.candidate);
        return;
      }

      if (message.type === "hangup") {
        await endCall(false);
        onRemoteEnded?.();
      }
    },
    [endCall, ensurePeer, onRemoteEnded, sendSignal, startLocalMedia]
  );

  const toggleMute = useCallback(() => {
    const nextMuted = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
  }, [muted]);

  const toggleCamera = useCallback(() => {
    const nextCameraOff = !cameraOff;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !nextCameraOff;
    });
    setCameraOff(nextCameraOff);
  }, [cameraOff]);

  useEffect(() => {
    return () => {
      peerRef.current?.close();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return {
    role,
    status,
    localStream,
    remoteStream,
    mediaError,
    muted,
    cameraOff,
    startLocalMedia,
    startOffer,
    handleSignal,
    toggleMute,
    toggleCamera,
    endCall
  };
}
