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
// 🏒 PARSE GAME INPUT
// =========================
function parseGameInput(input) {
const lines = input.split("\n").map(l => l.trim());

let gameId = Date.now();
let homeTeam = "", awayTeam = "";
let homeScore = 0, awayScore = 0;

let mode = null;
let currentTeam = null;

const skaters = [];
const goalies = [];

for (const line of lines) {
if (!line) continue;

if (line.toLowerCase().startsWith("game:")) {
gameId = line.split(":")[1].trim();
}

if (line.toLowerCase().startsWith("score:")) {
const clean = line.replace(/score:/i, "").trim();
const m = clean.match(/(.+?)\s+(\d+)\s*-\s*(.+?)\s+(\d+)/);

if (m) {
homeTeam = m[1].trim();
homeScore = Number(m[2]);
awayTeam = m[3].trim();
awayScore = Number(m[4]);
}
}

if (line === "SKATERS") { mode = "SKATERS"; continue; }
if (line === "GOALIES") { mode = "GOALIES"; continue; }

if (!line.includes(":") && mode) {
currentTeam = line;
continue;
}

if (!line.includes(":")) continue;

const [name, raw] = line.split(":").map(s => s.trim());
if (!raw) continue;

if (mode === "SKATERS") {
const g = Number((raw.match(/(\d+)G/) || [0,0])[1]);
const a = Number((raw.match(/(\d+)A(?![A-Z])/i) || [0,0])[1]);
const ta = Number((raw.match(/(\d+)TA/) || [0,0])[1]);
const int = Number((raw.match(/(\d+)INT/) || [0,0])[1]);
const bs = Number((raw.match(/(\d+)BS/) || [0,0])[1]);

skaters.push({ name, team: currentTeam, g,a,ta,int,bs });
}

if (mode === "GOALIES") {
const saveMatch = raw.match(/(\d+)\/(\d+)/);
if (!saveMatch) continue;

const saves = Number(saveMatch[1]);
const shots = Number(saveMatch[2]);
const ga = shots - saves;

const win = raw.includes("W") ? 1 : 0;
const loss = raw.includes("L") ? 1 : 0;
const so = ga === 0 ? 1 : 0;

goalies.push({ name, team: currentTeam, saves, shots, win, loss, so });
}
}

return {
gameId,
homeTeam,
awayTeam,
homeScore,
awayScore,
winner: homeScore > awayScore ? homeTeam : awayTeam,
skaters,
goalies
};
}

// =========================
// 🧠 REBUILD STATS
// =========================
async function rebuildAllStats() {
const master = await getSheetValues("Master Stats!A3:M1000");

const players = {};
const goalies = {};

for (const r of master) {
const name = r[1];
const team = r[2];
if (!name) continue;

// SKATER
if (r[3] !== "") {
if (!players[name]) players[name] = [name, team, 0,0,0,0,0,0,0];

const g = Number(r[3]) || 0;
const a = Number(r[4]) || 0;

players[name][2] += 1;
players[name][3] += g;
players[name][4] += a;
players[name][5] += g + a;
players[name][6] += Number(r[5]) || 0;
players[name][7] += Number(r[6]) || 0;
players[name][8] += Number(r[7]) || 0;
}

// GOALIE
if (r[8] !== "") {
if (!goalies[name]) goalies[name] = [name, team, 0,0,0,0,0,0,0];

const saves = Number(r[8]) || 0;
const shots = Number(r[9]) || 0;
const ga = shots - saves;

goalies[name][2] += 1;
goalies[name][3] += Number(r[10]) || 0;
goalies[name][4] += Number(r[11]) || 0;
goalies[name][5] += ga;
goalies[name][6] += saves;
goalies[name][7] += shots;
goalies[name][8] += Number(r[12]) || 0;
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
// 📊 STAT LEADERS (FULL)
// =========================
async function postStatLeaders(client) {
const rows = await getSheetValues("Player Stats!A3:I1000");
const goalieRows = await getSheetValues("Goalie Stats!A3:I1000");

const players = rows.map(r => ({
name: r[0],
team: r[1],
G: Number(r[3]) || 0,
A: Number(r[4]) || 0,
PTS: Number(r[5]) || 0,
BS: Number(r[6]) || 0,
TA: Number(r[7]) || 0,
INT: Number(r[8]) || 0
}));

const goalies = goalieRows.map(r => ({
name: r[0],
team: r[1],
SV: r[6] && r[7] ? (Number(r[6]) / Number(r[7])) : 0,
GAA: Number(r[5]) || 0,
SO: Number(r[8]) || 0
}));

const top = (arr, key, asc=false) =>
[...arr].sort((a,b)=> asc ? a[key]-b[key] : b[key]-a[key]).slice(0,5);

const rep = {};
const img = {};

function fill(list, key, prefix) {
for (let i = 0; i < 5; i++) {
const p = list[i] || {};
rep[`${prefix}N${i+1}`] = p.name || "";
rep[`${prefix}${i+1}`] = p[key] ?? "0";

if (TEAM_LOGOS[p.team]) {
img[`${prefix}LOGO${i+1}`] = TEAM_LOGOS[p.team];
}
}
}

fill(top(players,"PTS"),"PTS","P");
fill(top(players,"G"),"G","G");
fill(top(players,"A"),"A","A");
fill(top(players,"BS"),"BS","B");
fill(top(players,"TA"),"TA","T");
fill(top(players,"INT"),"INT","I");

fill(top(goalies,"SV"),"SV","SV");
fill(top(goalies,"GAA",true),"GAA","GAA");
fill(top(goalies,"SO"),"SO","SO");

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
// 🏆 POST STANDINGS
// =========================
async function postStandings(client) {
const rows = await getSheetValues("Standings!K2:S12");

const rep = {};
const img = {};

for (let i = 0; i < 12; i++) {
const r = rows[i] || [];

rep[`TEAM${i+1}`] = r[0] || "";
rep[`PT${i+1}`] = r[5] || "0";

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
// 🏒 MAIN COMMAND
// =========================
async function handleGameResults(interaction) {
await interaction.deferReply();

try {
const input = interaction.options.getString("input");
const data = parseGameInput(input);

const linked = await getSheetValues("Linked Players!A2:C1000");
const unlinked = await getSheetValues("Unlinked Players!A2:C1000");

const masterRows = [];

function checkLink(name, team) {
const isLinked = linked.some(r =>
r[2] && normalize(r[2]) === normalize(name)
);

const already = unlinked.some(r =>
normalize(r[1]) === normalize(name)
);

if (!isLinked && !already) {
appendSheetValues("Unlinked Players!A2:C", [
[data.gameId, name, team]
]);
}
}

for (const p of data.skaters) {
checkLink(p.name, p.team);

masterRows.push([
data.gameId, p.name, p.team,
p.g, p.a, p.bs, p.ta, p.int,
"", "", "", "", ""
]);
}

for (const g of data.goalies) {
checkLink(g.name, g.team);

masterRows.push([
data.gameId, g.name, g.team,
"", "", "", "", "",
g.saves, g.shots, g.win, g.loss, g.so
]);
}

if (masterRows.length) {
await appendSheetValues("Master Stats!A3:M", masterRows);
}

await appendSheetValues("Game Results!A2:F", [[
data.gameId,
data.homeTeam,
data.awayTeam,
data.homeScore,
data.awayScore,
data.winner
]]);

await rebuildAllStats();
await rebuildStandings();

const ch = await interaction.client.channels.fetch(GAME_RESULTS_CHANNEL_ID);
await ch.send(
`🏒 **Game ${data.gameId} Final**\n\n${data.homeTeam} ${data.homeScore} - ${data.awayScore} ${data.awayTeam}`
);

await postStandings(interaction.client);
await postStatLeaders(interaction.client);

return interaction.editReply("✅ Game recorded & fully updated.");

} catch (err) {
console.error(err);
return interaction.editReply("❌ Error.");
}
}

return {
handleGameResults
};
};
