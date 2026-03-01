const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// ====================== EDIT THESE ======================
const SHEET_ID = "1JTF9jG30t7eDZ_RZ-A-HPlakkLRb5JoGBdyF3K0qKnw";
const WEBHOOK_URL = "https://discord.com/api/webhooks/1477010156293455904/W5U3CnCM4CoJvjWwNO17-7a6RxMAAg9wwG4V2fbajfteZD3AQxUtqtwLHS4rZgZv_LEY";

// Prevent random people/refreshes from posting to Discord.
// To post: /standings?key=YOUR_KEY
const SECRET_KEY = "SWstock58";

// Cooldown to prevent Discord/Cloudflare rate limit
const COOLDOWN_MS = 60 * 1000; // 1 minute
// =======================================================

let lastPostTime = 0;

const normalize = (v) =>
  String(v || "")
    .replace(/\u00A0/g, " ")   // non-breaking spaces -> spaces
    .replace(/\s+/g, " ")      // collapse whitespace
    .trim()
    .toLowerCase();

// Takes OpenSheet rows and returns ONLY the bottom (sorted) table
function getBottomStandingsTable(rows) {
  // Find the LAST header row where Team == "team"
  let lastHeaderIndex = -1;
  rows.forEach((r, idx) => {
    if (normalize(r.Team) === "team") lastHeaderIndex = idx;
  });

  // Use only rows after the last header
  const tableRows = lastHeaderIndex >= 0 ? rows.slice(lastHeaderIndex + 1) : rows;

  // Keep only valid team rows
  const finalStandings = tableRows.filter((r) => {
    const team = normalize(r.Team);
    return team && team !== "team";
  });

  return finalStandings;
}

async function fetchRows() {
  const url = `https://opensheet.elk.sh/${SHEET_ID}/Standings`;
  const response = await axios.get(url, { timeout: 15000 });
  return response.data;
}

function buildMessage(finalStandings) {
  let message = "📊 **LEAGUE STANDINGS**\n\n";

  finalStandings.forEach((r, i) => {
    message += `${i + 1}. **${r.Team}** — ${r.Points} pts (GP:${r.GP} W:${r.W} L:${r.L} OTL:${r.OTL})\n`;
  });

  return message;
}

// ====================== ROUTES ======================

app.get("/", (req, res) => {
  res.send("Bot is alive.");
});

// Shows what OpenSheet is returning so we can debug headers + rows
app.get("/debug-sheet", async (req, res) => {
  try {
    const rows = await fetchRows();
    const finalStandings = getBottomStandingsTable(rows);

    res.json({
      opensheetRowCount: rows.length,
      firstRowKeys: rows[0] ? Object.keys(rows[0]) : null,
      sampleRow0: rows[0] || null,
      sampleRow1: rows[1] || null,
      bottomTableCount: finalStandings.length,
      bottomTableTeams: finalStandings.map((r) => r.Team),
    });
  } catch (err) {
    res.status(500).json({
      message: err?.message,
      status: err?.response?.status,
      data: err?.response?.data,
    });
  }
});

// Safe preview (no posting)
app.get("/standings-preview", async (req, res) => {
  try {
    const rows = await fetchRows();
    const finalStandings = getBottomStandingsTable(rows);

    if (finalStandings.length === 0) {
      return res.type("text/plain").send("No standings rows found in bottom table.");
    }

    const message = buildMessage(finalStandings);
    res.type("text/plain").send(message);
  } catch (err) {
    res.status(500).type("text/plain").send(err?.message || "Preview error");
  }
});

// Posts to Discord (protected + cooldown)
app.get("/standings", async (req, res) => {
  try {
    // Secret key protection
    if (req.query.key !== SECRET_KEY) {
      return res.status(403).send("Forbidden. Add ?key=YOUR_SECRET_KEY");
    }

    // Cooldown protection
    const now = Date.now();
    const remaining = COOLDOWN_MS - (now - lastPostTime);
    if (remaining > 0) {
      return res
        .status(200)
        .send(`Cooldown active. Try again in ${Math.ceil(remaining / 1000)}s.`);
    }

    const rows = await fetchRows();
    const finalStandings = getBottomStandingsTable(rows);

    if (finalStandings.length === 0) {
      return res.status(200).send("No standings rows found in bottom table.");
    }

    const message = buildMessage(finalStandings);

    await axios.post(WEBHOOK_URL, { content: message }, { timeout: 15000 });

    lastPostTime = Date.now();
    res.send("Standings posted.");
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

// ====================== START SERVER ======================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
