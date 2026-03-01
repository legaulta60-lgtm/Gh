const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// ====== EDIT THESE ======
const SHEET_ID = "1JTF9jG30t7eDZ_RZ-A-HPlakkLRb5JoGBdyF3K0qKnw";
const WEBHOOK_URL = "https://discord.com/api/webhooks/1477010156293455904/W5U3CnCM4CoJvjWwNO17-7a6RxMAAg9wwG4V2fbajfteZD3AQxUtqtwLHS4rZgZv_LEY";
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

app.listen(PORT, () => {
console.log(`Server running on port ${PORT}`);
});
