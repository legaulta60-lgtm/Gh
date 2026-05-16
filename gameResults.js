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
// 🔧 HELPERS
// =========================
function normalize(str) {
return String(str || "").toLowerCase().trim();
}

function isPlayerLinked(name, linked) {
return linked.some(row =>
row[2] && normalize(row[2]) === normalize(name)
);
}

let standingsMessageId = null;
let statLeadersMessageId = null;
  
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
// =========================
// 🗑 DELETE OLD MESSAGE
// =========================
if (standingsMessageId) {
try {
const oldMsg = await channel.messages.fetch(standingsMessageId);
await oldMsg.delete();
} catch {}
}

// =========================
// 📤 SEND NEW MESSAGE
// =========================
const msg = await channel.send({
files: [{ attachment: image, name: "standings.png" }]
});

// save newest message id
standingsMessageId = msg.id;
}

// =========================
// 📊 STAT LEADERS
// =========================
async function handleStatLeaders(client) {

try {

const rows = await getSheetValues("Player Stats!A3:I");
const goalieRows = await getSheetValues("Goalie Stats!A3:K");

if (!rows.length) return;

// =========================
// 🧍 PLAYERS
// =========================

const players = rows
.filter(r => r[0])
.map(r => ({
name: r[0],
team: r[1],

G: Number(r[3]) || 0,
A: Number(r[4]) || 0,
PTS: Number(r[5]) || 0,

HITS: Number(r[6]) || 0,
TA: Number(r[7]) || 0,
INT: Number(r[8]) || 0
}));

// =========================
// 🥅 GOALIES
// =========================

const goalies = goalieRows
.filter(r => r[0])
.map(r => ({

name: r[0],
team: r[1],

GP: Number(r[2]) || 0,
W: Number(r[3]) || 0,
L: Number(r[4]) || 0,
GA: Number(r[5]) || 0,

Saves: Number(r[6]) || 0,
Shots: Number(r[7]) || 0,

SO: Number(r[8]) || 0,

SV: Number(r[9]) || 0,
GAA: Number(r[10]) || 0

}));

// =========================
// 🔢 SAFE TOP SORT
// =========================

function top(arr, key, asc = false) {

return [...arr]
.filter(p => p && p.name)
.sort((a, b) => {

const aVal = Number(a[key]) || 0;
const bVal = Number(b[key]) || 0;

return asc
? aVal - bVal
: bVal - aVal;

})
.slice(0, 5);
}

// =========================
// 📦 TEMPLATE DATA
// =========================

const rep = {};
const img = {};

// =========================
// 🖼️ SAFE FILL
// =========================

function fill(list, statKey, prefix) {

for (let i = 0; i < 5; i++) {

const p = list[i] || {};

rep[`${prefix}N${i+1}`] =
p.name || "";

rep[`${prefix}P${i+1}`] =
p[statKey] ?? "0";

// SAFE LOGO LOOKUP
const logo = TEAM_LOGOS[p.team];

if (logo) {
img[`${prefix}LOGO${i+1}`] = logo;
}
}
}

// =========================
// 📊 PLAYER LEADERS
// =========================

fill(top(players, "PTS"), "PTS", "P");
fill(top(players, "G"), "G", "GO");
fill(top(players, "A"), "A", "A");
fill(top(players, "H"), "H", "H");
fill(top(players, "TA"), "TA", "T");
fill(top(players, "INT"), "INT", "I");

// =========================
// 🧤 GOALIE LEADERS
// =========================

const topSV = top(goalies, "SV");
const topGAA = top(goalies, "GAA", true);
const topSO = top(goalies, "SO");

for (let i = 0; i < 5; i++) {

const sv = topSV[i] || {};
const gaa = topGAA[i] || {};
const so = topSO[i] || {};

// SV%
rep[`SVN${i+1}`] = sv.name || "";
rep[`SV${i+1}`] = sv.SV ?? "0.000";

// GAA
rep[`GNM${i+1}`] = gaa.name || "";
rep[`GAA${i+1}`] = gaa.GAA ?? "0.00";

// SHUTOUTS
rep[`SON${i+1}`] = so.name || "";
rep[`SO${i+1}`] = so.SO ?? "0";

// LOGOS
if (TEAM_LOGOS[sv.team]) {
img[`SVLOGO${i+1}`] = TEAM_LOGOS[sv.team];
}

if (TEAM_LOGOS[gaa.team]) {
img[`GLOGO${i+1}`] = TEAM_LOGOS[gaa.team];
}

if (TEAM_LOGOS[so.team]) {
img[`SOLOGO${i+1}`] = TEAM_LOGOS[so.team];
}
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

// =========================
// 📡 CHANNEL
// =========================

const channel =
await client.channels.fetch(
STAT_LEADERS_CHANNEL_ID
);

// =========================
// 🗑 DELETE OLD
// =========================

if (statLeadersMessageId) {

try {

const oldMsg =
await channel.messages.fetch(
statLeadersMessageId
);

await oldMsg.delete();

} catch {}
}

// =========================
// 📤 SEND NEW
// =========================

const msg = await channel.send({
files: [
{
attachment: image,
name: "leaders.png"
}
]
});

statLeadersMessageId = msg.id;

return msg;

} catch (err) {

console.error(err);

return console.error(
"❌ Error loading stat leaders."
);
}
}

  

// =========================
// 🏒 GAME RESULTS
// =========================
async function handleGameResults(interaction) {

await interaction.deferReply();

const input =
interaction.options.getString("input");

const lines =
input.split("\n").map(
l => l.trim()
);

const recapNote =
interaction.options.getString(
"recap"
) || "";

// =========================
// 📄 SHEET DATA
// =========================

const linked =
await getSheetValues(
"Linked Players!A2:D1000"
);

const unlinked =
await getSheetValues(
"Unlinked Players!A2:C1000"
);

// =========================
// 🎮 GAME INFO
// =========================

let gameId = Date.now();

let homeTeam = "";
let awayTeam = "";

let homeScore = 0;
let awayScore = 0;

let resultType = "REG";

let mode = null;
let currentTeam = null;

const masterRows = [];

// =========================
// 🔁 PARSE INPUT
// =========================

for (const line of lines) {

// =========================
// 🎮 GAME ID
// =========================

if (
line.toLowerCase().startsWith(
"game:"
)
) {

gameId =
line.split(":")[1].trim();

continue;
}

// =========================
// 🏒 SCORE
// =========================

if (
line.toLowerCase().startsWith(
"score:"
)
) {

const clean =
line.replace(/score:/i, "")
.trim();

if (
clean.toLowerCase().includes(
"ot"
)
) {
resultType = "OT";
}

if (
clean.toLowerCase().includes(
"so"
)
) {
resultType = "SO";
}

if (
clean.toLowerCase().includes(
"ff"
)
) {
resultType = "FF";
}

const m = clean.match(
/(.+?)\s+(\d+)\s*-\s*(.+?)\s+(\d+)/
);

if (m) {

homeTeam = m[1].trim();
homeScore = Number(m[2]);

awayTeam = m[3].trim();
awayScore = Number(m[4]);
}

continue;
}

// =========================
// 📂 MODES
// =========================

if (line === "SKATERS") {
mode = "SKATERS";
continue;
}

if (line === "GOALIES") {
mode = "GOALIES";
continue;
}

// =========================
// 🏒 TEAM HEADER
// =========================

if (
!line.includes(":") &&
mode
) {

currentTeam = line.trim();
continue;
}

// =========================
// ⏭ SKIP BAD LINES
// =========================

if (!line.includes(":"))
continue;

const [name, raw] =
line.split(":").map(
s => s.trim()
);

// =========================
// 🧍 SKATERS
// =========================

if (mode === "SKATERS") {

const alreadyUnlinked =
unlinked.some(
r =>
normalize(r[1]) ===
normalize(name)
);

if (
!isPlayerLinked(name, linked) &&
!alreadyUnlinked
) {

await appendSheetValues(
"Unlinked Players!A:C",
[
[
gameId,
name,
currentTeam
]
]
);
}

const g =
+(raw.match(/(\d+)G/) || [0,0])[1];

const a =
+(raw.match(/(\d+)A/) || [0,0])[1];

const hits =
+(raw.match(/(\d+)HIT/) || [0,0])[1];

const ta =
+(raw.match(/(\d+)TA/) || [0,0])[1];

const int =
+(raw.match(/(\d+)INT/) || [0,0])[1];

// ONLY WRITE REAL STATS
if (
g > 0 ||
a > 0 ||
hits > 0 ||
ta > 0 ||
int > 0
) {

masterRows.push([

gameId,
name,
currentTeam,

g,
a,
hits,
ta,
int,

"",
"",
"",
"",
""

]);
}
}

// =========================
// 🧤 GOALIES
// =========================

if (mode === "GOALIES") {

const alreadyUnlinked =
unlinked.some(
r =>
normalize(r[1]) ===
normalize(name)
);

if (
!isPlayerLinked(name, linked) &&
!alreadyUnlinked
) {

await appendSheetValues(
"Unlinked Players!A:C",
[
[
gameId,
name,
currentTeam
]
]
);
}

// MUST MATCH 10/12
if (!/^\d+\/\d+/.test(raw))
continue;

const [
saves,
shots
] = raw.match(
/(\d+)\/(\d+)/
)
.slice(1)
.map(Number);

// ONLY REAL GOALIES
if (shots > 0) {

const ga =
Math.max(
0,
shots - saves
);

masterRows.push([

gameId,
name,
currentTeam,

"",
"",
"",
"",
"",

saves,
shots,

raw.includes("W")
? 1 : 0,

raw.includes("L")
? 1 : 0,

ga === 0
? 1 : 0

]);
}
}
}

// =========================
// 💾 WRITE MASTER STATS
// =========================

if (masterRows.length) {

await appendSheetValues(
"Master Stats!A3:M",
masterRows
);
}

// =========================
// 🏆 WRITE GAME RESULT
// =========================

await appendSheetValues(
"Game Results!A2:G",
[[
gameId,
homeTeam,
awayTeam,
homeScore,
awayScore,

homeScore > awayScore
? homeTeam
: awayTeam,

resultType
]]
);

// =========================
// 🔄 REBUILD EVERYTHING
// =========================

await rebuildAllStats();

await rebuildStandings();

await postStandings(
interaction.client
);

await handleStatLeaders(
interaction.client
);

// =========================
// 🏒 GAME RECAP
// =========================

const recap = `__**Game #${gameId}**__
**(H) ${homeTeam}** ${homeScore} - ${awayScore} **${awayTeam} (A)**

${recapNote}`;

// =========================
// 📡 SEND RECAP
// =========================

const channel =
await interaction.client.channels.fetch(
GAME_RESULTS_CHANNEL_ID
);

await channel.send({
content: recap.trim()
});

// =========================
// ✅ DONE
// =========================

return interaction.editReply(
"✅ Game recorded + recap posted"
);
} 

async function rebuildAllStats() {

const master =
await getSheetValues(
"Master Stats!A3:M1000"
);

const players = {};
const goalies = {};

// =========================
// 🔁 LOOP MASTER STATS
// =========================

for (const r of master) {

const rawName =
String(r[1] || "").trim();

if (!rawName) continue;

const key = normalize(rawName);

const team =
String(r[2] || "").trim();

// =========================
// 📊 SKATER VALUES
// =========================

const goals =
Number(r[3]) || 0;

const assists =
Number(r[4]) || 0;

const hits =
Number(r[5]) || 0;

const takeaways =
Number(r[6]) || 0;

const interceptions =
Number(r[7]) || 0;

// =========================
// 🥅 GOALIE VALUES
// =========================

const saves =
Number(r[8]) || 0;

const shots =
Number(r[9]) || 0;

const wins =
Number(r[10]) || 0;

const losses =
Number(r[11]) || 0;

const shutouts =
Number(r[12]) || 0;

// =========================
// 🎯 DETECT TYPES
// =========================

const isGoalie =
shots > 0;

const isSkater =
goals > 0 ||
assists > 0 ||
hits > 0 ||
takeaways > 0 ||
interceptions > 0;

// =========================
// 🧍 SKATERS
// =========================

if (isSkater && !isGoalie) {

if (!players[key]) {

players[key] = [
rawName, // A Player
team, // B Team

0, // C GP
0, // D Goals
0, // E Assists
0, // F Points

0, // G HITS
0, // H TA
0 // I INT
];
}

// ALWAYS KEEP LATEST TEAM
players[key][1] = team;

// GP
players[key][2] += 1;

// G
players[key][3] += goals;

// A
players[key][4] += assists;

// PTS
players[key][5] =
players[key][3] +
players[key][4];

// HITS
players[key][6] += hits;

// TA
players[key][7] += takeaways;

// INT
players[key][8] += interceptions;
}

// =========================
// 🧤 GOALIES
// =========================

if (isGoalie) {

if (!goalies[key]) {

goalies[key] = {
name: rawName,
team,

gp: 0,
w: 0,
l: 0,

ga: 0,

saves: 0,
shots: 0,

shutouts: 0
};
}

// KEEP LATEST TEAM
goalies[key].team = team;

const ga =
Math.max(0, shots - saves);

// GP
goalies[key].gp += 1;

// W
goalies[key].w += wins;

// L
goalies[key].l += losses;

// GA
goalies[key].ga += ga;

// SAVES
goalies[key].saves += saves;

// SHOTS
goalies[key].shots += shots;

// SO
goalies[key].shutouts += shutouts;
}
}

// =========================
// 🥅 BUILD GOALIE SHEET
// =========================

const goalieValues =
Object.values(goalies).map(g => {

const svPct =
g.shots > 0
? (g.saves / g.shots).toFixed(3)
: "0.000";

const gaa =
g.gp > 0
? (g.ga / g.gp).toFixed(2)
: "0.00";

return [

g.name,
g.team,

g.gp,
g.w,
g.l,

g.ga,

g.saves,
g.shots,

g.shutouts,

svPct,
gaa
];
});

// =========================
// 🗑 CLEAR SHEETS
// =========================

await sheets.spreadsheets.values.clear({
spreadsheetId:
process.env.SHEET_ID,

range:
"Player Stats!A3:I"
});

await sheets.spreadsheets.values.clear({
spreadsheetId:
process.env.SHEET_ID,

range:
"Goalie Stats!A3:K"
});

// =========================
// 📤 WRITE PLAYERS
// =========================

if (
Object.values(players).length
) {

await updateSheetValues(
"Player Stats!A3:I",
Object.values(players)
);
}

// =========================
// 📤 WRITE GOALIES
// =========================

if (goalieValues.length) {

await updateSheetValues(
"Goalie Stats!A3:K",
goalieValues
);
}

console.log(
"✅ Rebuilt all stats."
);
}

  
async function handleLinkPlayer(interaction) {
try {
await interaction.deferReply();

const newName = interaction.options.getString("player");
const linked = await getSheetValues("Linked Players!A2:C1000");

// =========================
// FIND EXISTING USER
// =========================
const existingIndex = linked.findIndex(row =>
String(row[0]) === String(interaction.user.id)
);

const oldName = existingIndex !== -1 ? linked[existingIndex][2] : null;

// =========================
// UPDATE OR CREATE LINK
// =========================
if (existingIndex !== -1) {
const rowNumber = existingIndex + 2;

await updateSheetValues(`Linked Players!A${rowNumber}:C${rowNumber}`, [[
interaction.user.id,
interaction.user.username,
newName
]]);

} else {
await appendSheetValues("Linked Players!A:C", [[
interaction.user.id,
interaction.user.username,
newName
]]);
}

// =========================
// IF NAME CHANGED → UPDATE STATS SHEETS
// =========================
if (oldName && normalize(oldName) !== normalize(newName)) {

// PLAYER STATS UPDATE
const playerStats = await getSheetValues("Player Stats!A3:I1000");

const pIndex = playerStats.findIndex(r =>
normalize(r[0]) === normalize(oldName)
);

if (pIndex !== -1) {
const rowNumber = pIndex + 3;
await updateSheetValues(`Player Stats!A${rowNumber}:A${rowNumber}`, [[newName]]);
}

// GOALIE STATS UPDATE
const goalieStats = await getSheetValues("Goalie Stats!A3:I1000");

const gIndex = goalieStats.findIndex(r =>
normalize(r[0]) === normalize(oldName)
);

if (gIndex !== -1) {
const rowNumber = gIndex + 3;
await updateSheetValues(`Goalie Stats!A${rowNumber}:A${rowNumber}`, [[newName]]);
}
}

// =========================
// ENSURE PLAYER ROW EXISTS
// =========================
const playerStats = await getSheetValues("Player Stats!A3:I1000");

const playerExists = playerStats.some(r =>
normalize(r[0]) === normalize(newName)
);

if (!playerExists) {
await appendSheetValues("Player Stats!A:I", [[
newName,
"",
0,
0,
0,
0,
0,
0,
0
]]);
}

// =========================
// ENSURE GOALIE ROW EXISTS
// =========================
const goalieStats = await getSheetValues("Goalie Stats!A3:I1000");

const goalieExists = goalieStats.some(r =>
normalize(r[0]) === normalize(newName)
);

if (!goalieExists) {
await appendSheetValues("Goalie Stats!A:I", [[
newName,
"",
0,
0,
0,
0,
0,
0,
0
]]);
}

return interaction.editReply(`✅ Linked to ${newName}`);

} catch (err) {
console.error(err);
return interaction.editReply("❌ Error linking player.");
}
}


async function handleNotifyUnlinked(interaction) {
try {
await interaction.deferReply();

const rows = await getSheetValues("Unlinked Players!A2:C1000");

if (!rows || !rows.length) {
return interaction.editReply("✅ No unlinked players.");
}

const seen = new Set();
const list = [];

for (const r of rows) {
const name = r[1];
const team = r[2];

if (!name) continue;

const key = normalize(name);

if (!seen.has(key)) {
seen.add(key);
list.push(`• ${name}${team ? ` (${team})` : ""}`);
}
}

if (!list.length) {
return interaction.editReply("✅ No unlinked players.");
}

return interaction.editReply(
`⚠️ **Unlinked Players:**\n\n${list.join("\n")}`
);

} catch (err) {
console.error(err);
return interaction.editReply("❌ Error fetching unlinked players.");
}
}  

async function handleMyStats(interaction) {

try {

await interaction.deferReply();

const userId =
interaction.user.id;

// =========================
// 🔗 LINKED PLAYER
// =========================

const linkedRows =
await getSheetValues(
"Linked Players!A2:D1000"
);

const link = linkedRows.find(
row =>
String(row[0]) ===
String(userId)
);

if (!link) {

return interaction.editReply(
"❌ You are not linked. Use /linkplayer first."
);
}

const playerName = link[2];

// =========================
// 📊 LOAD STATS
// =========================

const playerRows =
await getSheetValues(
"Player Stats!A3:I1000"
);

const goalieRows =
await getSheetValues(
"Goalie Stats!A3:K1000"
);

// =========================
// 🔎 FIND PLAYER
// =========================

const skater = playerRows.find(
r =>
normalize(r[0]) ===
normalize(playerName)
);

const goalie = goalieRows.find(
r =>
normalize(r[0]) ===
normalize(playerName)
);

// =========================
// 🏒 TEAM
// =========================

const team = (

link?.[3] ||
skater?.[1] ||
goalie?.[1] ||
""

).trim();

// =========================
// 🧍 SKATER STATS
// =========================

const gp =
Number(skater?.[2]) || 0;

const g =
Number(skater?.[3]) || 0;

const a =
Number(skater?.[4]) || 0;

const pts =
Number(skater?.[5]) || 0;

const hits =
Number(skater?.[6]) || 0;

const ta =
Number(skater?.[7]) || 0;

const int =
Number(skater?.[8]) || 0;

const ppg =
gp > 0
? (pts / gp).toFixed(2)
: "0.00";

// =========================
// 🧤 GOALIE STATS
// =========================

const ggp =
Number(goalie?.[2]) || 0;

const w =
Number(goalie?.[3]) || 0;

const l =
Number(goalie?.[4]) || 0;

const ga =
Number(goalie?.[5]) || 0;

const saves =
Number(goalie?.[6]) || 0;

const shots =
Number(goalie?.[7]) || 0;

const so =
Number(goalie?.[8]) || 0;

// 🔥 NOW CORRECT COLUMNS
const sv =
goalie?.[9] || "0.000";

const gaa =
goalie?.[10] || "0.00";

// =========================
// 🧾 TEMPLATE VALUES
// =========================

const rep = {

PLAYER: playerName,
TEAM: team,

// SKATER
GP: gp,
G: g,
A: a,
PTS: pts,

H: hits,
TA: ta,
INT: int,

PPG: ppg,

// GOALIE
GGP: ggp,

W: w,
L: l,

GA: ga,

SAVES: saves,
SHOTS: shots,

SV: sv,
GAA: gaa,
SO: so
};

// =========================
// 🖼️ TEAM LOGO
// =========================

const imageReplacements = {};

const logoKey =
Object.keys(TEAM_LOGOS).find(
key =>
normalize(key) ===
normalize(team)
);

const fallbackKey =
Object.keys(TEAM_LOGOS).find(
key =>

normalize(key).includes(
normalize(team)
) ||

normalize(team).includes(
normalize(key)
)
);

const finalKey =
logoKey || fallbackKey;

if (
finalKey &&
TEAM_LOGOS[finalKey]
) {

imageReplacements.TEAM_LOGO =
TEAM_LOGOS[finalKey];
}

// =========================
// 🖼️ GENERATE IMAGE
// =========================

const image =
await createImageFromTemplate(

process.env.MYSTATS_TEMPLATE_ID,

rep,

"mystats.png",

imageReplacements
);

// =========================
// 📤 SEND
// =========================

return interaction.editReply({

files: [
{
attachment: image,
name: "mystats.png"
}
]
});

} catch (err) {

console.error(err);

return interaction.editReply(
"❌ Error loading stats."
);
}
}


  
return {
handleGameResults,
handleLinkPlayer,
handleNotifyUnlinked,
handleMyStats,
handleStatLeaders
};
};
