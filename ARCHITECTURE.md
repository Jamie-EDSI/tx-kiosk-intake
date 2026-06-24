# Workforce Video Greeter MVP Architecture

## Recommendation

Build the MVP as a native browser WebRTC app using Next.js, React, TypeScript, Supabase Auth, Supabase Postgres, and Supabase Realtime. Deploy the web app on Vercel. Keep all privileged Supabase service-role access inside server-side routes or functions only.

This best matches the kiosk requirement: no third-party app install, no kiosk user sign-in, explicit camera/microphone permission only when a user presses **Talk to a Live Person**, and a staff-side web dashboard for presence and call handling.

## Tradeoffs

### A. Native WebRTC Custom App

Pros:
- No kiosk install beyond a browser.
- Best control over intake UX, privacy notices, business hours, fallback messaging, and staff routing.
- Can log call metadata without recording audio/video.
- Staff presence and round-robin routing can match workforce-center operations.

Cons:
- Requires signaling, presence, TURN, network testing, and operational monitoring.
- Browser permissions and device reliability must be designed carefully.
- More engineering responsibility than embedding a meeting product.

### B. Microsoft Teams Deep Link / Teams Workflow

Pros:
- Good if staff already live in Teams.
- Mature calling, device handling, enterprise policies, and staff identity.
- Less custom WebRTC infrastructure.

Cons:
- Kiosk deep links are brittle across browsers and policies.
- Usually nudges users toward Teams app install or authenticated meeting flow.
- Harder to create clean round-robin routing and anonymous kiosk handoff.
- Workforce participant UX can feel like a meeting product instead of a front-desk greeter.

### C. Zoom Meeting SDK

Pros:
- Mature meeting/video stack.
- Browser SDK avoids some native install pressure.
- Good media infrastructure and TURN/STUN behavior.

Cons:
- Adds vendor SDK complexity, meeting/session orchestration, and account/licensing concerns.
- Kiosk UX is still constrained by meeting semantics.
- Routing, staff presence, and workforce call metadata remain custom.

### D. Installing The Same Native App At Both Ends

Pros:
- Highest control over camera/mic devices, kiosk lockdown, auto-start behavior, and updates.
- Can integrate deeply with local hardware.

Cons:
- Conflicts with the browser-only kiosk requirement.
- Increases deployment, maintenance, patching, device management, and support burden.
- Slower MVP path.

## Best MVP Path

Start with native WebRTC plus Supabase:

- Supabase Auth for staff sign-in.
- Supabase Postgres for staff presence, kiosk devices, call sessions, routing state, and call events.
- Supabase Realtime Broadcast for WebRTC offer/answer/ICE signaling.
- A server-side Next.js route for call request routing, using a Supabase service-role key only on the server.
- Browser `getUserMedia` called only after the kiosk user presses **Start Call**.
- Optional early-stage polling fallback for incoming calls if realtime presence is unreliable during local testing.

## Architecture Diagram

```text
+-------------------+        HTTPS         +------------------------+
| Kiosk Browser     | -------------------> | Vercel Next.js App     |
| No sign-in        |                      | API routes             |
| Touch UI          | <------------------- | Server-side routing    |
+---------+---------+                      +-----------+------------+
          |                                            |
          | Supabase Realtime Broadcast                | Service-role key
          | call:<session_id>                          | server only
          v                                            v
+---------+---------+                      +-----------+------------+
| Staff Browser     | <------------------> | Supabase               |
| Authenticated     | Realtime + HTTPS     | Auth, Postgres, RT     |
| Availability UI   |                      |                        |
+---------+---------+                      +-----------+------------+
          |                                            |
          | WebRTC peer connection                     |
          | Audio/video media                          |
          v                                            v
      Kiosk camera/mic                         Staff camera/mic
```

## Runtime Flow

1. Kiosk loads home screen and checks business-hours config.
2. If open, kiosk shows **Talk to a Live Person** and a privacy notice.
3. User taps the button. The app creates a call request through a server-side API route.
4. The route finds available staff in round-robin order and creates a ringing call session.
5. Staff dashboard receives the incoming call through realtime subscription.
6. Staff accepts or declines. If timeout or decline, the server routes to the next available staff member.
7. When accepted, kiosk asks for camera/microphone with `getUserMedia`.
8. Kiosk and staff exchange WebRTC offer/answer/ICE through a Supabase realtime channel.
9. Either side ends the call. Tracks are stopped, peer connections close, call metadata is logged, and the kiosk returns home.

## Database Schema

See [supabase-schema.sql](./supabase-schema.sql) for starter SQL.

Core tables:
- `staff_profiles`: staff identity, display name, availability, last heartbeat.
- `kiosk_devices`: registered kiosk devices with hashed device token metadata.
- `call_sessions`: call state, assigned staff, timeout, timestamps, routing attempt count.
- `call_routing_state`: singleton row that stores the last staff member selected for round-robin.
- `call_events`: immutable metadata log for created, routed, accepted, declined, timed out, ended, and failure events.
- `signaling_messages`: optional durable audit/debug table for offer/answer/ICE metadata. The MVP can use realtime broadcast without persisting all ICE candidates.

## Implementation Plan

1. Create the Next.js app shell with kiosk and staff routes.
2. Configure Supabase environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_BUSINESS_HOURS`
   - `CALL_RING_TIMEOUT_SECONDS`
3. Add Supabase schema and RLS policies.
4. Build the kiosk page:
   - Business-hours gate.
   - Privacy notice.
   - Start Call button.
   - Local preview and remote video.
   - Mute, camera, end controls.
5. Build the staff dashboard:
   - Staff sign-in.
   - Availability status controls.
   - Incoming call panel.
   - Accept/decline controls.
   - Video panel after accept.
6. Implement routing API:
   - Validate kiosk device token.
   - Find available staff.
   - Route using round-robin state.
   - Timeout and retry next staff.
7. Implement WebRTC hook:
   - Create peer connection.
   - Request media only on explicit start/accept.
   - Exchange offer/answer/ICE over realtime signaling.
   - Stop all media tracks on end.
8. Test locally with two browser windows.
9. Deploy to Vercel and Supabase.
10. Add production hardening: TURN, monitoring, device checks, alerting, support handoff.

## Production Hardening Notes

- TURN is required for reliability. STUN alone will fail on some government, enterprise, school, and carrier NAT networks. Use Twilio Network Traversal, Xirsys, Metered TURN, Cloudflare Calls TURN, or a managed coturn deployment.
- Keep TURN credentials short-lived. Generate them server-side.
- Never expose Supabase service-role keys in client code or `NEXT_PUBLIC_*` variables.
- Treat kiosk tokens as device credentials, not user identity. Rotate them and scope them to call creation only.
- Use HTTPS everywhere. Browsers require secure context for camera/mic except on localhost.
- Do not call `getUserMedia` on page load. Call it only when the user explicitly starts or accepts a call.
- Stop tracks with `track.stop()` when calls end or fail.
- Store call metadata only: timestamps, staff ID, kiosk ID, outcome, duration, timeout/decline reasons. Do not record audio/video unless a separate consent and compliance review supports it.
- Add a heartbeat for staff presence. Mark staff offline if heartbeat is stale.
- Add reconnect handling for realtime subscriptions and visible "reconnecting" UI.
- Add timeout recovery: if staff does not answer, route to the next available staff member.
- Add device testing screens for camera, microphone, speakers, and network before kiosk go-live.
- Run firewall tests from actual kiosk sites. Confirm outbound HTTPS/WebSocket and TURN UDP/TCP/TLS paths.
- After a call ends, reset all kiosk state and return home.
- Add staff support handoff: display a phone number or front desk fallback when no staff are available or media setup fails.
