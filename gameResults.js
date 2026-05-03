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
STAT_LEADERS_CHANNEL_ID,
rebuildStandings
}) {

// =========================
// UTIL
// =========================
function normalize(v) {
return String(v || "").trim().toLowerCase();
}

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
await channel.send({ files: [{ attachment: image, name: "standings.png" }] });
}

// =========================
// 📊 POST STAT LEADERS
// =========================
async function postStatLeaders(client) {
const rows = await getSheetValues("Player Stats!A3:I1000");
const goalieRows = await getSheetValues("Goalie Stats!A3:I1000");

const players = rows.map(r => ({
name: r[0],
team: r[1],
pts: Number(r[5]) || 0
})).sort((a,b) => b.pts - a.pts).slice(0,5);

const rep = {};
const img = {};

for (let i = 0; i < 5; i++) {
const p = players[i] || {};
rep[`PN${i+1}`] = p.name || "";
rep[`PP${i+1}`] = p.pts || "0";

if (TEAM_LOGOS[p.team]) {
img[`PLOGO${i+1}`] = TEAM_LOGOS[p.team];
}
}

const image = await createImageFromTemplate(
process.env.LEADERS_TEMPLATE_ID,
rep,
"leaders.png",
img
);

const channel = await client.channels.fetch(STAT_LEADERS_CHANNEL_ID);
await channel.send({ files: [{ attachment: image, name: "leaders.png" }] });
}

// =========================
// 🔁 REBUILD STATS
// =========================
async function rebuildAllStats() {
const master = await getSheetValues("Master Stats!A3:M1000");

const players = {};
const goalies = {};

for (const row of master) {
const name = row[1];
const team = row[2];
if (!name) continue;

// SKATER
if (row[3] !== "") {
if (!players[name]) players[name] = [name, team, 0,0,0,0,0,0,0];

const g = Number(row[3]) || 0;
const a = Number(row[4]) || 0;

players[name][2] += 1;
players[name][3] += g;
players[name][4] += a;
players[name][5] += g + a;
players[name][6] += Number(row[5]) || 0;
players[name][7] += Number(row[6]) || 0;
players[name][8] += Number(row[7]) || 0;
}

// GOALIE
if (row[8] !== "") {
if (!goalies[name]) goalies[name] = [name, team, 0,0,0,0,0,0,0];

const saves = Number(row[8]) || 0;
const shots = Number(row[9]) || 0;
const ga = shots - saves;

goalies[name][2] += 1;
goalies[name][3] += Number(row[10]) || 0;
goalies[name][4] += Number(row[11]) || 0;
goalies[name][5] += ga;
goalies[name][6] += saves;
goalies[name][7] += shots;
goalies[name][8] += Number(row[12]) || 0;
}
}

await sheets.spreadsheets.values.clear({
spreadsheetId: process.env.SHEET_ID,
range: "Player Stats!A3:I"
});

await sheets.spreadsheets.values.clear({
spreadsheetId: process.env.SHEET_ID,
range: "Goalie Stats!A3:I"
});

if (Object.values(players).length) {
await updateSheetValues("Player Stats!A3:I", Object.values(players));
}

if (Object.values(goalies).length) {
await updateSheetValues("Goalie Stats!A3:I", Object.values(goalies));
}
}

// =========================
// 🏒 MAIN GAME RESULTS
// =========================
async function handleGameResults(interaction) {
await interaction.deferReply();

try {
const input = interaction.options.getString("input");
const lines = input.split("\n").map(l => l.trim());

const linked = (await getSheetValues("Linked Players!A2:C1000")) || [];
const existingUnlinked = (await getSheetValues("Unlinked Players!A2:C1000")) || [];

let gameId = Date.now();
let homeTeam = "", awayTeam = "";
let homeScore = 0, awayScore = 0;

let mode = null;
let currentTeam = null;

const masterRows = [];

// HEADER
for (const line of lines) {
if (line.toLowerCase().startsWith("score:")) {
const clean = line.replace(/score:/i, "").trim();
const m = clean.match(/(.+?)\s+(\d+)\s*-\s*(.+?)\s+(\d+)/);
if (m) {
homeTeam = m[1];
homeScore = Number(m[2]);
awayTeam = m[3];
awayScore = Number(m[4]);
}
}
}

const winner = homeScore > awayScore ? homeTeam : awayTeam;

for (const line of lines) {
if (!line) continue;

if (line === "SKATERS") { mode = "SKATERS"; continue; }
if (line === "GOALIES") { mode = "GOALIES"; continue; }

if (!line.includes(":") && mode) {
currentTeam = line;
continue;
}

if (!line.includes(":")) continue;

const [name, raw] = line.split(":").map(s => s.trim());
if (!raw) continue;

const isLinked = linked.some(r =>
r[2] && normalize(r[2]) === normalize(name)
);

const already = existingUnlinked.some(r =>
normalize(r[1]) === normalize(name)
);

if (!isLinked && !already) {
await appendSheetValues("Unlinked Players!A2:C", [
[gameId, name, currentTeam]
]);
}

// SKATER
if (mode === "SKATERS") {
const g = Number((raw.match(/(\d+)G/) || [0,0])[1]);
const a = Number((raw.match(/(\d+)A(?![A-Z])/i) || [0,0])[1]);
const ta = Number((raw.match(/(\d+)TA/) || [0,0])[1]);
const int = Number((raw.match(/(\d+)INT/) || [0,0])[1]);
const bs = Number((raw.match(/(\d+)BS/) || [0,0])[1]);

masterRows.push([gameId, name, currentTeam, g,a,bs,ta,int,"","","","",""]);
}

// GOALIE
if (mode === "GOALIES") {
const m = raw.match(/(\d+)\/(\d+)/);
if (!m) continue;

const saves = Number(m[1]);
const shots = Number(m[2]);
const ga = shots - saves;

const win = raw.includes("W") ? 1 : 0;
const loss = raw.includes("L") ? 1 : 0;
const so = ga === 0 ? 1 : 0;

masterRows.push([gameId,name,currentTeam,"","","","","",saves,shots,win,loss,so]);
}
}

if (masterRows.length) {
await appendSheetValues("Master Stats!A3:M", masterRows);
}

await appendSheetValues("Game Results!A2:F", [
[gameId, homeTeam, awayTeam, homeScore, awayScore, winner]
]);

await rebuildAllStats();
await rebuildStandings();

const ch = await interaction.client.channels.fetch(GAME_RESULTS_CHANNEL_ID);
await ch.send(`🏒 **Game ${gameId} Final**\n\n${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`);

await postStandings(interaction.client);
await postStatLeaders(interaction.client);

return interaction.editReply("✅ Game recorded & posted.");

} catch (err) {
console.error("GAME ERROR:", err);
return interaction.editReply("❌ Error.");
}
}

return { handleGameResults };
};
