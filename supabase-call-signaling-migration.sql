-- ============================================================
-- supabase-call-signaling-migration.sql
--
-- Run after supabase-staff-migration.sql. Adds the two columns the
-- staff.html <-> kiosk WebRTC call flow uses to exchange SDP.
--
-- Non-trickle ICE: each side waits for ICE gathering to finish before
-- writing its description, so no separate ICE-candidate table is
-- needed for this POC (no TURN server either — same-network demo).
-- ============================================================

alter table call_requests
  add column if not exists offer  jsonb,
  add column if not exists answer jsonb;
