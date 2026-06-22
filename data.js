(function () {
  const STORAGE_KEY = "intake-app-records";
  const LEGACY_STORAGE_KEY = "intake-demo-records";

  const seedTemplates = [
    {
      name: "Avery Morgan",
      email: "avery.morgan@example.com",
      type: "New application",
      priority: "Urgent",
      status: "Needs review",
      minutes: 8,
      notes: "Submitted a new application with a same-week deadline. Verify ID and route to eligibility review.",
      materials: ["ID received", "Consent signed"]
    },
    {
      name: "Sam Patel",
      email: "sam.patel@example.com",
      type: "Document collection",
      priority: "High",
      status: "Waiting on docs",
      minutes: 14,
      notes: "Missing proof upload. Follow up by email and keep the case in document collection.",
      materials: ["Consent signed"]
    },
    {
      name: "Casey Rivera",
      email: "casey.rivera@example.com",
      type: "Case update",
      priority: "Standard",
      status: "Assigned",
      minutes: 22,
      notes: "Asked for a status update after a recent phone call. Confirm assignment and add the note to the case file.",
      materials: ["ID received", "Consent signed", "Proof uploaded"]
    }
  ];

  function createSeedRecords() {
    return seedTemplates.map((record) => ({
      ...record,
      id: crypto.randomUUID(),
      submittedAt: new Date().toISOString(),
      source: "Sample",
      materials: [...record.materials]
    }));
  }

  function loadRecords() {
    const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!saved) {
      return createSeedRecords();
    }

    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) && parsed.length ? parsed : createSeedRecords();
    } catch {
      return createSeedRecords();
    }
  }

  function saveRecords(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  function createRecord(formData, source = "Admin") {
    return {
      id: crypto.randomUUID(),
      name: formData.get("clientName").trim(),
      email: formData.get("email").trim(),
      type: formData.get("requestType"),
      priority: formData.get("priority") || "Standard",
      status: "Needs review",
      minutes: Math.floor(Math.random() * 14) + 6,
      notes: formData.get("notes").trim(),
      materials: formData.getAll("materials"),
      submittedAt: new Date().toISOString(),
      source
    };
  }

  window.IntakeData = {
    createRecord,
    createSeedRecords,
    loadRecords,
    saveRecords,
    statusFlow: ["Needs review", "Waiting on docs", "Assigned", "Complete"]
  };
})();
