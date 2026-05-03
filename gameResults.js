module.exports = function ({
sheets,
slides,
getSheetValues,
appendSheetValues,
updateSheetValues,
createImageFromTemplate,
TEAM_LOGOS,
GAME_RESULTS_CHANNEL_ID,
STANDINGS_CHANNEL_ID,
STAT_LEADERS_CHANNEL_ID
}) {

// =========================
// 🏆 POST STANDINGS
// =========================
async function postStandings(client) {
const rows = await getSheetValues("Standings!K2:S12");
if (!rows.length) return;

const rep = {};
const img = {};

for (let i = 0; i < 12; i++) {
const r = rows[i] || [];

rep[`TEAM${i+1}`] = r[0] || "";
rep[`GP${i+1}`] = r[1] || "0";
rep[`W${i+1}`] = r[2] || "0";
rep[`L${i+1}`] = r[3] || "0";
rep[`OT${i+1}`] = r[4] || "0";
rep[`PT${i+1}`] = r[5] || "0";
rep[`GF${i+1}`] = r[6] || "0";
rep[`GA${i+1}`] = r[7] || "0";
rep[`DF${i+1}`] = r[8] || "0";

if (TEAM_LOGOS[r[0]]) {
img[`LOGO${i+1}`] = TEAM_LOGOS[r[0]];
}
}

const image = await createImageFromTemplate(
process.env.STANDINGS_TEMPLATE_ID,
rep,
"standings.png",
img
);

const channel = await client.channels.fetch(STANDINGS_CHANNEL_ID);

await channel.send({
files: [{ attachment: image, name: "standings.png" }]
});
}


// =========================
// 📊 POST STAT LEADERS
// =========================
async function postStatLeaders(client) {
const rows = await getSheetValues("Player Stats!A2:I1000");
if (!rows.length) return;

const players = rows.map(r => ({
name: r[0],
team: r[1],
goals: Number(r[3]) || 0,
assists: Number(r[4]) || 0,
pts: Number(r[5]) || 0,
blocks: Number(r[6]) || 0,
takeaways: Number(r[7]) || 0,
interceptions: Number(r[8]) || 0
}));

const rep = {};
const img = {};

function fillTop(statKey, prefix) {
const sorted = [...players].sort((a, b) => b[statKey] - a[statKey]);

for (let i = 0; i < 5; i++) {
const p = sorted[i] || {};

rep[`${prefix}N${i+1}`] = p.name || "";
rep[`${prefix}P${i+1}`] = p[statKey] || "0";

if (TEAM_LOGOS[p.team]) {
img[`${prefix}LOGO${i+1}`] = TEAM_LOGOS[p.team];
}
}
}

// 🔥 Fill each category
fillTop("pts", "P"); // Points
fillTop("goals", "G"); // Goals
fillTop("assists", "A"); // Assists
fillTop("blocks", "B"); // Blocks
fillTop("takeaways", "T"); // Takeaways
fillTop("interceptions", "I"); // Interceptions

const image = await createImageFromTemplate(
process.env.LEADERS_TEMPLATE_ID,
rep,
"leaders.png",
img
);

const channel = await client.channels.fetch(STAT_LEADERS_CHANNEL_ID);

await channel.send({
files: [{ attachment: image, name: "leaders.png" }]
});
}


// =========================
// 🏒 GAME RESULTS HANDLER
// =========================
async function handleGameResults(interaction) {
await interaction.deferReply();

const input = interaction.options.getString("input");

// Save basic result (you can expand later)
await appendSheetValues("Game Results!A2:F", [
[Date.now(), input]
]);

// =========================
// 📢 POST RECAP TEXT
// =========================
const gameChannel = await interaction.client.channels.fetch(GAME_RESULTS_CHANNEL_ID);

await gameChannel.send(
`🏒 **New Game Result Submitted**\n\n${input}`
);

// =========================
// 📊 POST IMAGES
// =========================
await postStandings(interaction.client);
await postStatLeaders(interaction.client);

return interaction.editReply("✅ Game recorded & posted.");
}


return {
handleGameResults
};
};
