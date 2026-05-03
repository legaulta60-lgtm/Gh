module.exports = function ({
sheets,
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
// 🏒 GAME RESULTS
// =========================
async function handleGameResults(interaction) {
await interaction.deferReply();

const input = interaction.options.getString("input");
const lines = input.split("\n").map(l => l.trim());

let gameId = Date.now();
let homeTeam = "";
let awayTeam = "";
let homeScore = 0;
let awayScore = 0;

let mode = null;
let currentTeam = null;

const masterRows = [];

// =========================
// HEADER
// =========================
for (const line of lines) {
if (line.toLowerCase().startsWith("game:")) {
gameId = line.split(":")[1].trim();
}

if (line.toLowerCase().startsWith("score:")) {
const clean = line.replace(/score:/i, "").trim();
const match = clean.match(/(.+?)\s+(\d+)\s*-\s*(.+?)\s+(\d+)/);

if (match) {
homeTeam = match[1].trim();
homeScore = Number(match[2]);
awayTeam = match[3].trim();
awayScore = Number(match[4]);
}
}
}

const winner = homeScore > awayScore ? homeTeam : awayTeam;

// =========================
// PARSE
// =========================
for (const line of lines) {

if (!line) continue;

if (line.toUpperCase() === "SKATERS") {
mode = "SKATERS";
continue;
}

if (line.toUpperCase() === "GOALIES") {
mode = "GOALIES";
continue;
}

if (!line.includes(":") && mode) {
currentTeam = line;
continue;
}

if (!line.includes(":")) continue;

const [name, rawStats] = line.split(":").map(s => s.trim());

// =========================
// SKATER
// =========================
if (mode === "SKATERS") {

const g = Number((rawStats.match(/(\d+)G/) || [0,0])[1]);
const a = Number((rawStats.match(/(\d+)A(?![A-Z])/i) || [0,0])[1]);
const ta = Number((rawStats.match(/(\d+)TA/) || [0,0])[1]);
const int = Number((rawStats.match(/(\d+)INT/) || [0,0])[1]);
const bs = Number((rawStats.match(/(\d+)BS/) || [0,0])[1]);

masterRows.push([
gameId, name, currentTeam,
g, a, bs, ta, int,
null, null, null, null, null
]);
}

// =========================
// GOALIE
// =========================
if (mode === "GOALIES") {

const saveMatch = rawStats.match(/(\d+)\/(\d+)/);
if (!saveMatch) continue;

const saves = Number(saveMatch[1]);
const shots = Number(saveMatch[2]);
const ga = shots - saves;

const win = rawStats.includes("W") ? 1 : 0;
const loss = rawStats.includes("L") ? 1 : 0;
const so = ga === 0 ? 1 : 0;

masterRows.push([
gameId, name, currentTeam,
null, null, null, null, null,
saves, shots, win, loss, so
]);
}
}

// WRITE MASTER
await appendSheetValues("Master Stats!A3:M", masterRows);

// GAME RESULTS
await appendSheetValues("Game Results!A2:F", [
[gameId, homeTeam, awayTeam, homeScore, awayScore, winner]
]);

// REBUILD
await rebuildAllStats();
await rebuildStandings();

// POST
const channel = await interaction.client.channels.fetch(GAME_RESULTS_CHANNEL_ID);

await channel.send(
`🏒 **Game ${gameId} Final**\n\n${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`
);

await postStandings(interaction.client);
await postStatLeaders(interaction.client);

return interaction.editReply("✅ Game recorded & posted.");
}

// =========================
// 🔁 REBUILD STATS
// =========================
async function rebuildAllStats() {

const master = await getSheetValues("Master Stats!A3:M1000");

const playerMap = {};
const goalieMap = {};

for (const row of master) {

const name = row[1];
const team = row[2];

// SKATER CHECK (STRICT)
if (row[3] !== null && row[3] !== "") {

if (!playerMap[name]) {
playerMap[name] = [name, team, 0,0,0,0,0,0,0];
}

playerMap[name][2] += 1;
playerMap[name][3] += Number(row[3]) || 0;
playerMap[name][4] += Number(row[4]) || 0;
playerMap[name][5] += (Number(row[3]) + Number(row[4])) || 0;
playerMap[name][6] += Number(row[5]) || 0;
playerMap[name][7] += Number(row[6]) || 0;
playerMap[name][8] += Number(row[7]) || 0;
}

// GOALIE CHECK (STRICT)
if (row[8] !== null && row[8] !== "") {

if (!goalieMap[name]) {
goalieMap[name] = [name, team, 0,0,0,0,0,0,0];
}

const saves = Number(row[8]) || 0;
const shots = Number(row[9]) || 0;
const ga = shots - saves;

goalieMap[name][2] += 1;
goalieMap[name][3] += Number(row[10]) || 0;
goalieMap[name][4] += Number(row[11]) || 0;
goalieMap[name][5] += ga;
goalieMap[name][6] += saves;
goalieMap[name][7] += shots;
goalieMap[name][8] += Number(row[12]) || 0;
}
}

// CLEAR
await sheets.spreadsheets.values.clear({
spreadsheetId: process.env.SHEET_ID,
range: "Player Stats!A3:I",
});

await sheets.spreadsheets.values.clear({
spreadsheetId: process.env.SHEET_ID,
range: "Goalie Stats!A3:I",
});

// WRITE
if (Object.values(playerMap).length) {
await updateSheetValues("Player Stats!A3:I", Object.values(playerMap));
}

if (Object.values(goalieMap).length) {
await updateSheetValues("Goalie Stats!A3:I", Object.values(goalieMap));
}
}

return {
handleGameResults
};
};
