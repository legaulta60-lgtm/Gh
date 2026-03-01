const express = require("express");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3000;

const SHEET_ID = "1JTF9jG30t7eDZ_RZ-A-HPlakkLRb5JoGBdyF3K0qKnw";
const TAB_NAME = "FinalStandings";
const WEBHOOK_URL = "https://discord.com/api/webhooks/1477604168926757004/is46oXGixwwrSU33LuGse7jozDG2Yf-sIosqCMEACTolqcOM6Wt8sLGVW2xQllbUEfz8";
const SECRET_KEY = "SWstock58";

let lastPostTime = 0;
const COOLDOWN_MS = 60 * 1000;

function getStandings(rows) {
  return rows.filter(r =>
    (r.Team || "").trim() &&
    (r.Team || "").trim().toLowerCase() !== "team"
  );
}

async function fetchRows() {
  const url = `https://opensheet.elk.sh/${SHEET_ID}/${TAB_NAME}`;
  const response = await axios.get(url);
  return response.data;
}

function buildMessage(standings) {
  let message = "📊 **LEAGUE STANDINGS**\n\n";
  standings.forEach((r, i) => {
    message += `${i + 1}. **${r.Team}** — ${r.Points} pts (GP:${r.GP} W:${r.W} L:${r.L} OTL:${r.OTL})\n`;
  });
  return message;
}

app.get("/", (req, res) => {
  res.send("Bot is alive.");
});

app.get("/standings-preview", async (req, res) => {
  try {
    const rows = await fetchRows();
    const standings = getStandings(rows);

    if (!standings.length) {
      return res.send("No standings rows found.");
    }

    res.type("text/plain").send(buildMessage(standings));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// all your constants up here


app.use(express.json());

// 👇 PASTE NEW ROUTE HERE

app.get("/standings", (req, res) => {
  res.status(405).send("Use POST /standings");
});

app.post("/standings", async (req, res) => {
  try {
    if (req.body.key !== SECRET_KEY)
      return res.status(403).send("Forbidden.");

    const now = Date.now();
    if (now - lastPostTime < COOLDOWN_MS)
      return res.send("Cooldown active.");

    const rows = await fetchRows();
    const standings = getStandings(rows);

    if (!standings.length)
      return res.send("No standings rows found.");

    const message = buildMessage(standings);

    await axios.post(
      WEBHOOK_URL,
      { content: message },
      {
        timeout: 15000,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "league-standings-bot"
        }
      }
    );

    lastPostTime = now;
    res.send("Standings posted.");
  } catch (err) {
    console.log("POST ERROR:", err?.message);
    console.log("STATUS:", err?.response?.status);
    console.log("DATA:", err?.response?.data);
    res.status(500).send("Error posting standings.");
  }
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
