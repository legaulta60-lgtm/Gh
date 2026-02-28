const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// ====== EDIT THESE ======
const SHEET_ID = "PASTE_YOUR_SHEET_ID_HERE";
const WEBHOOK_URL = "PASTE_YOUR_DISCORD_WEBHOOK_HERE";
// ========================

app.get("/", (req, res) => {
res.send("Bot is alive.");
});

app.get("/standings", async (req, res) => {
try {
const url = `https://opensheet.elk.sh/${SHEET_ID}/Standings`;
const response = await axios.get(url);
const data = response.data.slice(9); // Starts at A10

let message = "📊 **LEAGUE STANDINGS**\n\n";

data.forEach((team, i) => {
if (!team.A) return;
message += `${i + 1}. ${team.A} — ${team.F} pts\n`;
});

await axios.post(WEBHOOK_URL, {
content: message
});

res.send("Standings posted.");
} catch (err) {
console.log(err);
res.status(500).send("Error posting standings.");
}
});

app.listen(PORT, () => {
console.log(`Server running on port ${PORT}`);
});
