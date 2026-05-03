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

// =========================
// 📊 LOAD DATA
// =========================
const skaterRows = await getSheetValues("Player Stats!A2:I1000");
const goalieRows = await getSheetValues("Goalie Stats!A2:K1000");

// =========================
// 🏒 FORMAT SKATERS
// =========================
const skaters = skaterRows
.map(r => ({
name: r[0],
team: String(r[1] || "").trim(),
goals: Number(r[3]) || 0,
assists: Number(r[4]) || 0,
pts: Number(r[5]) || 0,
blocks: Number(r[6]) || 0,
takeaways: Number(r[7]) || 0,
interceptions: Number(r[8]) || 0
}))
.filter(p => p.name && p.name !== "");

// =========================
// 🥅 FORMAT GOALIES
// =========================
const goalies = goalieRows
.map(r => ({
name: r[0],
team: String(r[1] || "").trim(),
sv: Number(r[8]) || 0,
gaa: Number(r[9]) || 0,
so: Number(r[10]) || 0
}))
.filter(g => g.name && g.name !== "");

const rep = {};
const img = {};

// =========================
// 🧠 HELPER (SKATERS)
// =========================
function fillSkaters(statKey, prefix) {
const sorted = [...skaters].sort((a, b) => b[statKey] - a[statKey]);

for (let i = 0; i < 5; i++) {
const p = sorted[i] || {};

rep[`${prefix}N${i+1}`] = p.name || "";
rep[`${prefix}P${i+1}`] = p[statKey] ?? "0";

if (TEAM_LOGOS[p.team]) {
img[`${prefix}LOGO${i+1}`] = TEAM_LOGOS[p.team];
}
}
}

// =========================
// 🧠 HELPER (GOALIES)
// =========================
function fillGoalies(statKey, prefix, lowerIsBetter = false) {
const sorted = [...goalies].sort((a, b) =>
lowerIsBetter ? a[statKey] - b[statKey] : b[statKey] - a[statKey]
);

for (let i = 0; i < 5; i++) {
const g = sorted[i] || {};

rep[`${prefix}N${i+1}`] = g.name || "";
rep[`${prefix}${i+1}`] = g[statKey] ?? "0";

if (TEAM_LOGOS[g.team]) {
img[`${prefix}LOGO${i+1}`] = TEAM_LOGOS[g.team];
}
}
}

// =========================
// 🔥 SKATER LEADERS
// =========================
fillSkaters("pts", "P"); // {{PN1}}, {{PP1}}
fillSkaters("goals", "G"); // {{GN1}}, {{GP1}}
fillSkaters("assists", "A"); // {{AN1}}, {{AP1}}
fillSkaters("blocks", "B"); // {{BN1}}, {{BP1}}
fillSkaters("takeaways", "T"); // {{TN1}}, {{TP1}}
fillSkaters("interceptions", "I"); // {{IN1}}, {{IP1}}

// =========================
// 🥅 GOALIE LEADERS
// =========================
fillGoalies("sv", "SVN"); // {{SVN1}}, {{SV1}}
fillGoalies("gaa", "GAA", true); // lower = better
fillGoalies("so", "SON"); // {{SON1}}, {{SO1}}

// =========================
// 🖼️ GENERATE IMAGE
// =========================
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


async function handleGameResults(interaction) {
await interaction.deferReply();

const input = interaction.options.getString("input");

await appendSheetValues("Game Results!A2:F", [
[Date.now(), input]
]);

const lines = input.split("\n").map(l => l.trim());

let mode = null; // "SKATERS" or "GOALIES"
let currentTeam = null;

const players = [];
const goalies = [];

for (let line of lines) {
if (!line) continue;

// Detect sections
if (line.toUpperCase() === "SKATERS") {
mode = "SKATERS";
continue;
}
if (line.toUpperCase() === "GOALIES") {
mode = "GOALIES";
continue;
}

// Detect team names
if (!line.includes(":") && mode) {
currentTeam = line;
continue;
}

if (!line.includes(":")) continue;

const [name, rawStats] = line.split(":").map(s => s.trim());

if (!rawStats) continue;

// =========================
// 🧍 SKATERS
// =========================
if (mode === "SKATERS") {
const g = (rawStats.match(/(\d+)G/) || [0,0])[1];
const a = (rawStats.match(/(\d+)A(?![A-Z])/i) || [0,0])[1]; // avoid TA
const ta = (rawStats.match(/(\d+)TA/) || [0,0])[1];
const int = (rawStats.match(/(\d+)INT/) || [0,0])[1];
const bs = (rawStats.match(/(\d+)BS/) || [0,0])[1];

const goals = parseInt(g) || 0;
const assists = parseInt(a) || 0;
const takeaways = parseInt(ta) || 0;
const interceptions = parseInt(int) || 0;
const blocks = parseInt(bs) || 0;

if (goals || assists || takeaways || interceptions || blocks) {
players.push([
name,
currentTeam,
1,
goals,
assists,
goals + assists,
blocks,
takeaways,
interceptions
]);
}
}

// =========================
// 🧤 GOALIES
// =========================
if (mode === "GOALIES") {
const saveMatch = rawStats.match(/(\d+)\/(\d+)/);

if (!saveMatch) continue;

const saves = parseInt(saveMatch[1]);
const shots = parseInt(saveMatch[2]);
const ga = shots - saves;

const win = rawStats.includes("W") ? 1 : 0;
const loss = rawStats.includes("L") ? 1 : 0;
const so = rawStats.includes("SO") ? 1 : 0;

goalies.push([
name,
currentTeam,
1,
win,
loss,
ga,
saves,
shots,
so
]);
}
}

// =========================
// 📊 WRITE TO SHEETS
// =========================

if (players.length) {
await appendSheetValues("Player Stats!A2:I", players);
}

if (goalies.length) {
await appendSheetValues("Goalie Stats!A2:I", goalies);
}

// =========================
// 📢 POST RECAP
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
