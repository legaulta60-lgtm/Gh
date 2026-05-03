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


async function postStatLeaders(client) {
const rows = await getSheetValues("Player Stats!A3:I1000");
const goalieRows = await getSheetValues("Goalie Stats!A3:K1000");

if (!rows.length) return;

// =========================
// 🧠 MERGE DUPLICATE PLAYERS
// =========================
const playersMap = {};

for (const r of rows) {
const name = r[0];
const team = r[1];

if (!name) continue;

if (!playersMap[name]) {
playersMap[name] = {
name,
team,
G: 0,
A: 0,
PTS: 0,
BS: 0,
TA: 0,
INT: 0
};
}

playersMap[name].G += Number(r[3]) || 0;
playersMap[name].A += Number(r[4]) || 0;
playersMap[name].PTS += Number(r[5]) || 0;
playersMap[name].BS += Number(r[6]) || 0;
playersMap[name].TA += Number(r[7]) || 0;
playersMap[name].INT += Number(r[8]) || 0;
}

const players = Object.values(playersMap);

// =========================
// 🧠 GOALIES
// =========================
const goalies = goalieRows
.filter(r => r[0])
.map(r => ({
name: r[0],
team: r[1],
SV: Number(r[9]) || 0,
GAA: Number(r[10]) || 0,
SO: Number(r[8]) || 0
}));

const top = (arr, key) =>
[...arr].sort((a, b) => b[key] - a[key]).slice(0, 5);

const rep = {};
const img = {};

function fill(category, list, nameKey, valueKey, prefix) {
for (let i = 0; i < 5; i++) {
const p = list[i] || {};

rep[`${prefix}N${i+1}`] = p.name || "";
rep[`${prefix}P${i+1}`] = p[valueKey] ?? "0";

if (TEAM_LOGOS[p.team]) {
img[`${prefix}LOGO${i+1}`] = TEAM_LOGOS[p.team];
}
}
}

// =========================
// 🧊 SKATER CATEGORIES
// =========================
fill("PTS", top(players, "PTS"), "name", "PTS", "P");
fill("GOALS", top(players, "G"), "name", "G", "G");
fill("ASSISTS", top(players, "A"), "name", "A", "A");
fill("BLOCKS", top(players, "BS"), "name", "BS", "B");
fill("TAKEAWAYS", top(players, "TA"), "name", "TA", "T");
fill("INTERCEPTIONS", top(players, "INT"), "name", "INT", "I");

// =========================
// 🧤 GOALIES
// =========================
const topSV = top(goalies, "SV");
const topGAA = [...goalies].sort((a,b)=> a.GAA - b.GAA).slice(0,5);
const topSO = top(goalies, "SO");

for (let i = 0; i < 5; i++) {
const sv = topSV[i] || {};
const gaa = topGAA[i] || {};
const so = topSO[i] || {};

rep[`SVN${i+1}`] = sv.name || "";
rep[`SV${i+1}`] = sv.SV ?? "0";

rep[`GNM${i+1}`] = gaa.name || "";
rep[`GAA${i+1}`] = gaa.GAA ?? "0";

rep[`SON${i+1}`] = so.name || "";
rep[`SO${i+1}`] = so.SO ?? "0";

if (TEAM_LOGOS[sv.team]) img[`SVLOGO${i+1}`] = TEAM_LOGOS[sv.team];
if (TEAM_LOGOS[gaa.team]) img[`GLOGO${i+1}`] = TEAM_LOGOS[gaa.team];
if (TEAM_LOGOS[so.team]) img[`SOLOGO${i+1}`] = TEAM_LOGOS[so.team];
}

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
await appendSheetValues("Player Stats!A3:I", players);
}

if (goalies.length) {
await appendSheetValues("Goalie Stats!A3:I", goalies);
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
