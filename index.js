const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

/* ============================= */
/* 🔑 CONFIG — EDIT THESE ONLY  */
/* ============================= */

// ====== EDIT THESE ======
const SHEET_ID = "1JTF9jG30t7eDZ_RZ-A-HPlakkLRb5JoGBdyF3K0qKnw";
const WEBHOOK_URL = "https://discord.com/api/webhooks/1477010156293455904/W5U3CnCM4CoJvjWwNO17-7a6RxMAAg9wwG4V2fbajfteZD3AQxUtqtwLHS4rZgZv_LEY";
// ========================

/* ============================= */
/* ⏱ Cooldown Protection        */
/* ============================= */

let lastPostTime = 0;
const COOLDOWN_MS = 60 * 1000; // 1 minute cooldown

/* ============================= */
/* Root Route                   */
/* ============================= */

app.get("/", (req, res) => {
  res.send("Bot is alive.");
});

/* ============================= */
/* Debug Sheet Route            */
/* ============================= */

app.get("/debug-sheet", async (req, res) => {
  try {
    const url = `https://opensheet.elk.sh/${SHEET_ID}/Standings`;
    const response = await axios.get(url);
    const rows = response.data;

    res.json({
      totalRows: rows.length,
      firstRowKeys: rows[0] ? Object.keys(rows[0]) : null,
      sampleRow0: rows[0] || null,
      sampleRow9: rows[9] || null
    });
  } catch (err) {
    res.status(500).json({
      message: err?.message,
      status: err?.response?.status,
      data: err?.response?.data
    });
  }
});

/* ============================= */
/* Standings Preview (SAFE)     */
/* ============================= */

app.get("/standings-preview", async (req, res) => {
  try {
    const url = `https://opensheet.elk.sh/${SHEET_ID}/Standings`;
    const response = await axios.get(url);
    // Normalize helper (handles weird spaces)
const norm = (v) =>
  String(v || "")
    .replace(/\u00A0/g, " ")   // non-breaking spaces -> regular spaces
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

// Find the LAST header row (where Team == "team")
let lastHeaderIndex = -1;
rows.forEach((r, idx) => {
  if (norm(r.Team) === "team") lastHeaderIndex = idx;
});

// Take only rows AFTER the last header (this is your sorted table)
const tableRows = (lastHeaderIndex >= 0 ? rows.slice(lastHeaderIndex + 1) : rows);

// Now keep only valid rows with a real team name
const finalStandings = tableRows.filter(r => {
  const team = norm(r.Team);
  return team && team !== "team";
});
 const finalStandings = [];
const seen = new Set();

const normalizeTeam = (name) =>
  String(name || "")
    .replace(/\u00A0/g, " ")   // converts non-breaking spaces
    .trim()
    .toLowerCase();

for (const r of standings) {
  const key = normalizeTeam(r.Team);
  if (!key) continue;
  // keep the LAST occurrence instead of the first
if (seen.has(key)) {
  const idx = finalStandings.findIndex(x => normalizeTeam(x.Team) === key);
  finalStandings[idx] = r;
  continue;
}
  seen.add(key);
  finalStandings.push(r);
}

// Debug: show what we kept
console.log("Unique teams:", finalStandings.map(r => r.Team));
    
    let message = "📊 **LEAGUE STANDINGS**\n\n";

    standings.forEach((r, i) => {
      message += `${i + 1}. **${r.Team}** — ${r.Points} pts (GP:${r.GP} W:${r.W} L:${r.L} OTL:${r.OTL})\n`;
    });

    res.type("text/plain").send(message);

  } catch (err) {
    res.status(500).send(err?.message || "Preview error");
  }
});

/* ============================= */
/* Post Standings to Discord    */
/* ============================= */

app.get("/standings", async (req, res) => {
  try {
    const now = Date.now();

    if (now - lastPostTime < COOLDOWN_MS) {
      return res.send("Cooldown active. Try again in a minute.");
    }

    const url = `https://opensheet.elk.sh/${SHEET_ID}/Standings`;
    const response = await axios.get(url);
    const rows = response.data;

    const standings = rows
      .slice(9)
      .filter(r => r.Team && r.Team !== "Team");

    if (standings.length === 0) {
      return res.send("No standings found.");
    }

    let message = "📊 **LEAGUE STANDINGS**\n\n";

    finalStandings.forEach((r, i) => {
      message += `${i + 1}. **${r.Team}** — ${r.Points} pts (GP:${r.GP} W:${r.W} L:${r.L} OTL:${r.OTL})\n`;
    });

    await axios.post(WEBHOOK_URL, { content: message });

    lastPostTime = Date.now();

    res.send("Standings posted successfully.");

  } catch (err) {
    console.log("===== STANDINGS ERROR START =====");
    console.log("Message:", err?.message);
    console.log("Code:", err?.code);
    console.log("Status:", err?.response?.status);
    console.log("Data:", err?.response?.data);
    console.log("Stack:", err?.stack);
    console.log("===== STANDINGS ERROR END =====");

    res.status(500).send("Error posting standings.");
  }
});

/* ============================= */

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
