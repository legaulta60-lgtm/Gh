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

function normalize(v) {
return String(v || "").trim().toLowerCase();
}

// =========================
// 🔁 REBUILD ALL STATS
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
if (!players[name]) {
players[name] = [name, team, 0,0,0,0,0,0,0];
}

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
if (!goalies[name]) {
goalies[name] = [name, team, 0,0,0,0,0,0,0];
}

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
// 🏒 MAIN COMMAND
// =========================
async function handleGameResults(interaction) {
await interaction.deferReply();

const input = interaction.options.getString("input");

const linked = (await getSheetValues("Linked Players!A2:C1000")) || [];
const existingUnlinked = (await getSheetValues("Unlinked Players!A2:C1000")) || [];

const lines = input.split("\n").map(l => l.trim());

let gameId = Date.now();
let homeTeam = "", awayTeam = "";
let homeScore = 0, awayScore = 0;

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
const m = line.match(/(.+?)\s+(\d+)\s*-\s*(.+?)\s+(\d+)/);
if (m) {
homeTeam = m[1].trim();
homeScore = Number(m[2]);
awayTeam = m[3].trim();
awayScore = Number(m[4]);
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
if (!rawStats) continue;

// =========================
// LINK CHECK
// =========================
const isLinked = linked.some(r =>
r[2] && normalize(r[2]) === normalize(name)
);

const alreadyLogged = existingUnlinked.some(r =>
normalize(r[1]) === normalize(name)
);

if (!isLinked && !alreadyLogged) {
await appendSheetValues("Unlinked Players!A2:C", [
[gameId, name, currentTeam]
]);
}

// =========================
// SKATERS
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
"", "", "", "", ""
]);
}

// =========================
// GOALIES
// =========================
if (mode === "GOALIES") {
if (!/(\d+)\/(\d+)/.test(rawStats)) continue;

const m = rawStats.match(/(\d+)\/(\d+)/);
const saves = Number(m[1]);
const shots = Number(m[2]);
const ga = shots - saves;

const win = rawStats.includes("W") ? 1 : 0;
const loss = rawStats.includes("L") ? 1 : 0;
const so = ga === 0 ? 1 : 0;

masterRows.push([
gameId, name, currentTeam,
"", "", "", "", "",
saves, shots, win, loss, so
]);
}
}

// =========================
// WRITE MASTER
// =========================
if (masterRows.length) {
await appendSheetValues("Master Stats!A3:M", masterRows);
}

// =========================
// GAME RESULT
// =========================
await appendSheetValues("Game Results!A2:F", [
[gameId, homeTeam, awayTeam, homeScore, awayScore, winner]
]);

// =========================
// REBUILD EVERYTHING
// =========================
await rebuildAllStats();
await rebuildStandings();

// =========================
// POST
// =========================
const channel = await interaction.client.channels.fetch(GAME_RESULTS_CHANNEL_ID);

await channel.send(
`🏒 **Game ${gameId} Final**\n\n${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`
);

return interaction.editReply("✅ Game recorded & updated.");
}

return {
handleGameResults
};
};
