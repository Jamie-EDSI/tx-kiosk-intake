"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

export type SignalMessage =
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; candidate: RTCIceCandidateInit }
  | { type: "hangup" };

export function createCallSignaling(
  supabase: SupabaseClient,
  callSessionId: string,
  onSignal: (message: SignalMessage) => void
) {
  const channel = supabase.channel(`call:${callSessionId}`, {
    config: { broadcast: { self: false } }
  });

  channel.on("broadcast", { event: "signal" }, ({ payload }) => {
    onSignal(payload as SignalMessage);
  });

  return {
    async subscribe() {
      await channel.subscribe();
    },
    async send(message: SignalMessage) {
      await channel.send({
        type: "broadcast",
        event: "signal",
        payload: message
      });
    },
    async close() {
      await supabase.removeChannel(channel);
    }
  };
}
