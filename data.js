// ============================================================
// data.js  — Supabase backend (replaces localStorage version)
//
// HOW TO SET YOUR KEYS:
//   1. Go to Supabase Dashboard → Settings → API
//   2. Copy "Project URL" → paste as SUPABASE_URL below
//   3. Copy "anon public" key → paste as SUPABASE_ANON_KEY below
//
// These are safe to put in client-side JS because Row Level
// Security (set up in the migration SQL) controls what the
// anon key can actually do.
// ============================================================

(function () {

  // ── PASTE YOUR VALUES HERE ────────────────────────────────
  const SUPABASE_URL      = "https://pabudwgfabfiyyxpcswx.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_CbDDVfKLjZZr3_MZGVyiNQ_kVmdALgB";
  // ─────────────────────────────────────────────────────────

  // Tiny Supabase REST helper — no npm install needed.
  // Uses the same fetch-based REST API the JS SDK wraps.
  const db = {
    headers: {
      "apikey":        SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type":  "application/json",
      "Prefer":        "return=representation"   // always return the saved row
    },

    // SELECT — returns array of rows
    // pass a params object like { status: "neq.Complete", order: "submitted_at.desc" }
    async select(table, params = {}) {
      const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) throw new Error(`select failed: ${res.status} ${await res.text()}`);
      return res.json();
    },

    // INSERT — returns the saved row (Prefer: return=representation)
    async insert(table, row) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method:  "POST",
        headers: this.headers,
        body:    JSON.stringify(row)
      });
      if (!res.ok) throw new Error(`insert failed: ${res.status} ${await res.text()}`);
      const rows = await res.json();
      return rows[0];   // Supabase returns an array even for single inserts
    },

    // UPSERT — insert, or update on primary-key conflict. Used for
    // staff_presence, which is keyed by staff name rather than an id.
    async upsert(table, row) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method:  "POST",
        headers: { ...this.headers, "Prefer": "resolution=merge-duplicates,return=representation" },
        body:    JSON.stringify(row)
      });
      if (!res.ok) throw new Error(`upsert failed: ${res.status} ${await res.text()}`);
      const rows = await res.json();
      return rows[0];
    },

    // UPDATE — patch a single row by id
    async update(table, id, patch) {
      const url = `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`;
      const res = await fetch(url, {
        method:  "PATCH",
        headers: this.headers,
        body:    JSON.stringify(patch)
      });
      if (!res.ok) throw new Error(`update failed: ${res.status} ${await res.text()}`);
      const rows = await res.json();
      return rows[0];
    },

    // DELETE — remove a single row by id
    async delete(table, id) {
      const url = `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`;
      const res = await fetch(url, {
        method:  "DELETE",
        headers: { ...this.headers, "Prefer": "return=minimal" }
      });
      if (!res.ok) throw new Error(`delete failed: ${res.status} ${await res.text()}`);
    },

    // REALTIME — opens a Supabase Realtime websocket channel.
    // Calls onChange(eventType, newRow) whenever the table changes.
    // Returns a close() function so the caller can clean up.
    realtime(table, onChange) {
      const wsUrl = SUPABASE_URL
        .replace("https://", "wss://")
        .replace("http://",  "ws://");

      const socket = new WebSocket(`${wsUrl}/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`);
      let heartbeat;
      let ref = 1;

      socket.addEventListener("open", () => {
        // Join the channel and ask Supabase to forward postgres_changes for this table
        socket.send(JSON.stringify({
          topic:   `realtime:public:${table}`,
          event:   "phx_join",
          payload: {
            config: {
              postgres_changes: [{ event: "*", schema: "public", table }]
            }
          },
          ref:     String(ref++)
        }));

        // Phoenix channels close the socket if no heartbeat arrives every ~30s
        heartbeat = window.setInterval(() => {
          socket.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(ref++) }));
        }, 25_000);
      });

      socket.addEventListener("message", (event) => {
        try {
          const msg = JSON.parse(event.data);
          // Row changes arrive wrapped as { event: "postgres_changes", payload: { data: { type, record, old_record } } }
          if (msg.event === "postgres_changes") {
            const change = msg.payload?.data;
            if (change) {
              onChange(change.type, change.record ?? change.old_record);
            }
          }
        } catch {
          // ignore malformed frames
        }
      });

      socket.addEventListener("close", () => window.clearInterval(heartbeat));

      return { close: () => { window.clearInterval(heartbeat); socket.close(); } };
    }
  };

  // Expose the low-level REST/Realtime client so other modules (e.g. staff.js)
  // can talk to additional tables without re-entering the Supabase keys.
  window.SupabaseDB = db;

  // ── Public API (same shape as the old localStorage version) ──
  //
  // IMPORTANT CHANGE: loadRecords() and saveRecords() are now async.
  // app.js and kiosk.js use await on them — see the updated files.

  // Map Supabase column names (snake_case) → app field names (camelCase)
  // The DB uses submitted_at; the app uses submittedAt.
  function rowToRecord(row) {
    return {
      id:          row.id,
      name:        row.name,
      email:       row.email       ?? "",
      type:        row.type,
      priority:    row.priority,
      status:      row.status,
      notes:       row.notes       ?? "",
      materials:   row.materials   ?? [],
      source:      row.source,
      minutes:     row.minutes     ?? 0,
      submittedAt: row.submitted_at
    };
  }

  // Load all intakes from Supabase, newest first
  async function loadRecords() {
    const rows = await db.select("intakes", { order: "submitted_at.desc" });
    return rows.map(rowToRecord);
  }

  // Save a single new record (insert) — returns the saved record
  // NOTE: saveRecords() no longer takes the whole array.
  // It saves one record at a time (insert or update).
  async function saveRecord(record) {
    const row = await db.insert("intakes", {
      id:           record.id,
      name:         record.name,
      email:        record.email,
      type:         record.type,
      priority:     record.priority,
      status:       record.status,
      notes:        record.notes,
      materials:    record.materials,
      source:       record.source,
      minutes:      record.minutes,
      submitted_at: record.submittedAt
    });
    return rowToRecord(row);
  }

  // Update an existing record's status (advance) or any patch
  async function updateRecord(id, patch) {
    // Convert camelCase patch keys to snake_case for Supabase
    const dbPatch = {};
    if (patch.status      !== undefined) dbPatch.status   = patch.status;
    if (patch.notes       !== undefined) dbPatch.notes    = patch.notes;
    if (patch.priority    !== undefined) dbPatch.priority = patch.priority;
    if (patch.materials   !== undefined) dbPatch.materials = patch.materials;
    const row = await db.update("intakes", id, dbPatch);
    return rowToRecord(row);
  }

  // Delete (archive) a record
  async function deleteRecord(id) {
    await db.delete("intakes", id);
  }

  // Build a new in-memory record object from a form submission.
  // Does NOT save it — caller decides when to call saveRecord().
  function createRecord(formData, source = "Admin") {
    return {
      id:          crypto.randomUUID(),
      name:        formData.get("clientName").trim(),
      email:       (formData.get("email") ?? "").trim(),
      type:        formData.get("requestType"),
      priority:    formData.get("priority") || "Standard",
      status:      "Needs review",
      minutes:     Math.floor(Math.random() * 14) + 6,
      notes:       formData.get("notes").trim(),
      materials:   formData.getAll("materials"),
      submittedAt: new Date().toISOString(),
      source
    };
  }

  // Subscribe to live changes on the intakes table.
  // onChange(eventType, record) is called on INSERT / UPDATE / DELETE.
  // Returns { close() } — call close() to disconnect.
  function subscribeToChanges(onChange) {
    return db.realtime("intakes", (eventType, row) => {
      onChange(eventType, row ? rowToRecord(row) : null);
    });
  }

  window.IntakeData = {
    loadRecords,       // async () => record[]
    saveRecord,        // async (record) => savedRecord
    updateRecord,      // async (id, patch) => updatedRecord
    deleteRecord,      // async (id) => void
    createRecord,      // (formData, source?) => record (sync, no save)
    subscribeToChanges,// (onChange) => { close() }
    statusFlow: ["Needs review", "Waiting on docs", "Assigned", "Complete"]
  };

})();
