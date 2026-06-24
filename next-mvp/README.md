# Next.js WebRTC Greeter MVP

This folder is a starter implementation for the browser-native kiosk video call workflow.

## Local demo setup

This starter now includes `.env.local` with `NEXT_PUBLIC_LOCAL_DEMO=true`, so you can test without Supabase.

1. Run `npm install`.
2. Run `npm run dev`.
3. Open the staff page in one browser tab: `http://localhost:3000/staff`.
4. Click **Available**.
5. Open the kiosk page in another tab: `http://localhost:3000`.
6. Fill in the participant check-in fields and consent checkbox.
7. Click **Talk to a Live Person**.
8. Accept the incoming call on the staff tab. Staff will see the participant intake summary before accepting.
9. Press **Start Call** on the kiosk tab when prompted.

Local demo mode uses same-browser `BroadcastChannel` and `localStorage`, so it is meant for same-machine testing only.

From the project root you can also run `start-local-demo.cmd` or `start-local-demo.ps1` to start the local server.

## Supabase setup

1. Create a Supabase project.
2. Run `../supabase-schema.sql` in the Supabase SQL editor.
3. Enable Realtime on `call_sessions` for staff incoming-call notifications.
4. Create at least one staff auth user.
5. Insert a `staff_profiles` row for that user or let the staff dashboard upsert it after sign-in.
6. Insert one `kiosk_devices` row with a SHA-256 hash of the kiosk token.
7. Copy `.env.example` to `.env.local` and fill in the values.
8. Run `npm install`.
9. Run `npm run dev`.

Open:
- Kiosk: `http://localhost:3000`
- Staff: `http://localhost:3000/staff`

## Hash a kiosk token

Use any secure token generator, then store only its SHA-256 hash in `kiosk_devices.token_hash`.

```bash
node -e "console.log(require('crypto').createHash('sha256').update('replace-with-device-token').digest('hex'))"
```

## MVP caveats

- Supabase Realtime Broadcast is used for WebRTC signaling.
- STUN is configured for local testing; production needs TURN.
- Timeout rerouting is triggered by the kiosk polling the reroute API while ringing. In production, move this to a scheduled worker or Supabase Edge Function.
- Kiosk tokens are scoped device credentials. They are not equivalent to a service-role key and should be rotated.
