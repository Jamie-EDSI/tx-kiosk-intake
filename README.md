# Workforce Intake Greeter Prototype

This is a self-contained browser prototype for testing workforce participant intake.

For the browser-native WebRTC kiosk/staff video greeter architecture and starter Next.js implementation, see:

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [supabase-schema.sql](./supabase-schema.sql)
- [next-mvp/README.md](./next-mvp/README.md)

## Open it

Open `index.html` in a browser.

## What to test

- Participant check-in with name, DOB, ID last four, visit reason, needs, notes, and consent.
- Staff queue filtering by search text and status.
- Participant detail review, staff notes, and status changes.
- JSON export from the staff queue.
- Scenario buttons under Test controls for fast demo data.

The app stores test visits in browser `localStorage`, so refreshes keep the queue until you use **Clear test queue**.
