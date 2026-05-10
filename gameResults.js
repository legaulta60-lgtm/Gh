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
const goalieRows = await getSheetValues("Goalie Stats!A3:I");

if (!rows.length) return;

// =========================
// 🧍 PLAYERS
// =========================
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

// =========================
// 🥅 GOALIES
// =========================
const goalies = goalieRows.map(r => {
const saves = Number(r[6]) || 0;
const shots = Number(r[7]) || 0;

return {
name: r[0],
team: r[1],
SV: shots > 0 ? (saves / shots).toFixed(3).replace(/^0/, "") : ".000",
GAA: Number(r[5]) || 0,
SO: Number(r[8]) || 0
};
});

// =========================
// 🔢 HELPERS
// =========================
const top = (arr, key) => [...arr].sort((a,b)=>b[key]-a[key]).slice(0,5);

const rep = {};
const img = {};

// =========================
// 🔥 FILL FUNCTION (KEY FIX)
// =========================
function fill(list, statKey, prefix) {
for (let i = 0; i < 5; i++) {
const p = list[i] || {};

rep[`${prefix}N${i+1}`] = p.name || "";
rep[`${prefix}P${i+1}`] = p[statKey] ?? "0";

if (TEAM_LOGOS[p.team]) {
img[`${prefix}LOGO${i+1}`] = TEAM_LOGOS[p.team];
}
}
}

// =========================
// 📊 PLAYER CATEGORIES
// =========================
fill(top(players,"PTS"),"PTS","P"); // PN / PP
fill(top(players,"G"),"G","G"); // GN / GP
fill(top(players,"A"),"A","A"); // AN / AP
fill(top(players,"BS"),"BS","B"); // BN / BP
fill(top(players,"TA"),"TA","T"); // TN / TP
fill(top(players,"INT"),"INT","I"); // IN / IP

// =========================
// 🧤 GOALIES
// =========================
const topSV = top(goalies,"SV");
const topGAA = [...goalies].sort((a,b)=>a.GAA-b.GAA).slice(0,5);
const topSO = top(goalies,"SO");

for (let i = 0; i < 5; i++) {

const sv = topSV[i] || {};
const gaa = topGAA[i] || {};
const so = topSO[i] || {};

// SV%
rep[`SVN${i+1}`] = sv.name || "";
rep[`SV${i+1}`] = sv.SV ?? ".000";

// GAA
rep[`GNM${i+1}`] = gaa.name || "";
rep[`GAA${i+1}`] = gaa.GAA ?? "0";

// SHUTOUTS
rep[`SON${i+1}`] = so.name || "";
rep[`SO${i+1}`] = so.SO ?? "0";

// LOGOS
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

// =========================
// 🗑 DELETE OLD MESSAGE
// =========================
if (statLeadersMessageId) {
try {
const oldMsg = await channel.messages.fetch(statLeadersMessageId);
await oldMsg.delete();
} catch {}
}

// =========================
// 📤 SEND NEW MESSAGE
// =========================
const channel = await client.channels.fetch(STAT_LEADERS_CHANNEL_ID);
const msg = await channel.send({
files: [{ attachment: image, name: "leaders.png" }]
});

// save newest message id
statLeadersMessageId = msg.id;
  
return msg;

} catch (err) {
console.error(err);
return console.error("❌ Error loading stat leaders.");
}
}

// =========================
// 🏒 GAME RESULTS
// =========================
async function handleGameResults(interaction) {
await interaction.deferReply();

const input = interaction.options.getString("input");
const lines = input.split("\n").map(l=>l.trim());
const recapNote = interaction.options.getString("recap") || "";

// 🔥 UPDATED (A:D)
const linked = await getSheetValues("Linked Players!A2:D1000");
const unlinked = await getSheetValues("Unlinked Players!A2:C1000");

let gameId = Date.now();
let homeTeam="", awayTeam="";
let homeScore=0, awayScore=0;

let resultType = "REG";

let mode=null, currentTeam=null;

const masterRows = [];

// =========================
// 🔥 TEAM SYNC FUNCTION
// =========================
async function syncPlayerTeam(name, team) {

const linkedData = await getSheetValues("Linked Players!A2:D1000");
const playerData = await getSheetValues("Player Stats!A3:I1000");
const goalieData = await getSheetValues("Goalie Stats!A3:I1000");

// LINKED PLAYERS
for (let i = 0; i < linkedData.length; i++) {
if (normalize(linkedData[i][2]) === normalize(name)) {
linkedData[i][3] = team;
}
}

// PLAYER STATS
for (let i = 0; i < playerData.length; i++) {
if (normalize(playerData[i][0]) === normalize(name)) {
playerData[i][1] = team;
}
}

// GOALIE STATS
for (let i = 0; i < goalieData.length; i++) {
if (normalize(goalieData[i][0]) === normalize(name)) {
goalieData[i][1] = team;
}
}

await updateSheetValues("Linked Players!A2:D1000", linkedData);
await updateSheetValues("Player Stats!A3:I1000", playerData);
await updateSheetValues("Goalie Stats!A3:I1000", goalieData);
}

// =========================
// 🔁 PARSE INPUT
// =========================
for (const line of lines) {

if (line.toLowerCase().startsWith("game:")) {
gameId = line.split(":")[1].trim();
}

if (line.toLowerCase().startsWith("score:")) {
const clean = line.replace(/score:/i,"").trim();

if (clean.toLowerCase().includes("ot")) {
resultType = "OT";
}

const m = clean.match(/(.+?)\s+(\d+)\s*-\s*(.+?)\s+(\d+)/);
if (m) {
homeTeam=m[1]; homeScore=+m[2];
awayTeam=m[3]; awayScore=+m[4];
}
}

if (line==="SKATERS") { mode="SKATERS"; continue; }
if (line==="GOALIES") { mode="GOALIES"; continue; }

if (!line.includes(":") && mode) { currentTeam=line; continue; }
if (!line.includes(":")) continue;

const [name, raw] = line.split(":").map(s=>s.trim());

// =========================
// 🧍 SKATER
// =========================
if (mode==="SKATERS") {



const alreadyUnlinked = unlinked.some(r =>
normalize(r[1]) === normalize(name)
);

if (!isPlayerLinked(name, linked) && !alreadyUnlinked) {
await appendSheetValues("Unlinked Players!A:C", [
[gameId, name, currentTeam]
]);
}

const g=+(raw.match(/(\d+)G/)||[0,0])[1];
const a=+(raw.match(/(\d+)A/)||[0,0])[1];
const ta=+(raw.match(/(\d+)TA/)||[0,0])[1];
const int=+(raw.match(/(\d+)INT/)||[0,0])[1];
const bs=+(raw.match(/(\d+)BS/)||[0,0])[1];

masterRows.push([gameId,name,currentTeam,g,a,bs,ta,int,null,null,null,null,null]);
}

// =========================
// 🧤 GOALIE
// =========================
if (mode==="GOALIES") {



const alreadyUnlinked = unlinked.some(r =>
normalize(r[1]) === normalize(name)
);

if (!isPlayerLinked(name, linked) && !alreadyUnlinked) {
await appendSheetValues("Unlinked Players!A:C", [
[gameId, name, currentTeam]
]);
}

if (!/^\d+\/\d+/.test(raw)) continue;

const [saves,shots] = raw.match(/(\d+)\/(\d+)/).slice(1).map(Number);
const ga = shots - saves;

masterRows.push([
gameId,
name,
currentTeam,
null,null,null,null,null,
saves,
shots,
raw.includes("W")?1:0,
raw.includes("L")?1:0,
ga===0?1:0
]);
}
}

// =========================
// 💾 WRITE DATA
// =========================
await appendSheetValues("Master Stats!A3:M", masterRows);

await appendSheetValues("Game Results!A2:G", [[
gameId,
homeTeam,
awayTeam,
homeScore,
awayScore,
homeScore>awayScore?homeTeam:awayTeam,
resultType
]]);

await rebuildAllStats();
await rebuildStandings();

postStandings(interaction.client);
handleStatLeaders(interaction.client);

// =========================
// 🏒 GAME RECAP
// =========================
const recap = `__**Game #${gameId}**__
**(H) ${homeTeam}** ${homeScore} - ${awayScore} **${awayTeam} (A)**

${recapNote}`;

const channel = await interaction.client.channels.fetch(GAME_RESULTS_CHANNEL_ID);

await channel.send({ content: recap.trim() });



return interaction.editReply("✅ Game recorded + recap posted");
}

async function rebuildAllStats() {

const master = await getSheetValues("Master Stats!A3:M1000");

const players = {};
const goalies = {};

for (const r of master) {

const rawName = String(r[1] || "").trim();
if (!rawName) continue;

const key = normalize(rawName);

const team = String(r[2] || "").trim();

// =========================
// DETECT TYPES
// =========================
const isSkater =
r[3] !== "" &&
r[3] !== null &&
r[3] !== undefined;

const isGoalie =
r[8] !== "" &&
r[8] !== null &&
r[8] !== undefined;

// =========================
// SKATERS
// =========================
if (isSkater && !isGoalie) {

if (!players[key]) {
players[key] = [
rawName, // display name
team,
0, // GP
0, // G
0, // A
0, // PTS
0, // BS
0, // TA
0 // INT
];
}

// ALWAYS UPDATE TO MOST RECENT TEAM
players[key][1] = team;

// GP
players[key][2] += 1;

// GOALS
players[key][3] += Number(r[3]) || 0;

// ASSISTS
players[key][4] += Number(r[4]) || 0;

// POINTS
players[key][5] =
players[key][3] +
players[key][4];

// BLOCKED SHOTS
players[key][6] += Number(r[5]) || 0;

// TAKEAWAYS
players[key][7] += Number(r[6]) || 0;

// INTERCEPTIONS
players[key][8] += Number(r[7]) || 0;
}

// =========================
// GOALIES
// =========================
if (isGoalie && !isSkater) {

if (!goalies[key]) {
goalies[key] = [
rawName, // display name
team,
0, // GP
0, // W
0, // L
0, // GA
0, // SAVES
0, // SHOTS
0 // SO
];
}

// ALWAYS UPDATE TEAM
goalies[key][1] = team;

const saves = Number(r[8]) || 0;
const shots = Number(r[9]) || 0;

const ga = Math.max(0, shots - saves);

// GP
goalies[key][2] += 1;

// WINS
goalies[key][3] += Number(r[10]) || 0;

// LOSSES
goalies[key][4] += Number(r[11]) || 0;

// GOALS AGAINST
goalies[key][5] += ga;

// SAVES
goalies[key][6] += saves;

// SHOTS
goalies[key][7] += shots;

// SHUTOUTS
goalies[key][8] += Number(r[12]) || 0;
}
}

// =========================
// CLEAR SHEETS
// =========================
await sheets.spreadsheets.values.clear({
spreadsheetId: process.env.SHEET_ID,
range: "Player Stats!A3:I"
});

await sheets.spreadsheets.values.clear({
spreadsheetId: process.env.SHEET_ID,
range: "Goalie Stats!A3:I"
});

// =========================
// WRITE PLAYERS
// =========================
if (Object.values(players).length) {
await updateSheetValues(
"Player Stats!A3:I",
Object.values(players)
);
}

// =========================
// WRITE GOALIES
// =========================
if (Object.values(goalies).length) {
await updateSheetValues(
"Goalie Stats!A3:I",
Object.values(goalies)
);
}
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

const userId = interaction.user.id;

// =========================
// 🔗 GET LINKED PLAYER
// =========================
const linkedRows = await getSheetValues("Linked Players!A2:D1000");

const link = linkedRows.find(
row => String(row[0]) === String(userId)
);

if (!link) {
return interaction.editReply(
"❌ You are not linked. Use /linkplayer first."
);
}

const playerName = link[2];

// =========================
// 📊 GET STATS
// =========================
const playerRows = await getSheetValues("Player Stats!A3:I1000");
const goalieRows = await getSheetValues("Goalie Stats!A3:I1000");

// 🔥 FIXED NORMALIZATION
const skater = playerRows.find(r =>
normalize(r[0]) === normalize(playerName)
);

const goalie = goalieRows.find(r =>
normalize(r[0]) === normalize(playerName)
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
// 🧮 SKATER STATS
// =========================
const gp = Number(skater?.[2]) || 0;
const g = Number(skater?.[3]) || 0;
const a = Number(skater?.[4]) || 0;
const pts = Number(skater?.[5]) || 0;

const bs = Number(skater?.[6]) || 0;
const ta = Number(skater?.[7]) || 0;
const int = Number(skater?.[8]) || 0;

const ppg =
gp > 0
? (pts / gp).toFixed(2)
: "0.00";

// =========================
// 🧤 GOALIE STATS
// =========================
const ggp = Number(goalie?.[2]) || 0;
const w = Number(goalie?.[3]) || 0;
const l = Number(goalie?.[4]) || 0;

const saves = Number(goalie?.[6]) || 0;
const shots = Number(goalie?.[7]) || 0;

const sv =
shots > 0
? (saves / shots).toFixed(3)
: "0.000";

const gaa = Number(goalie?.[5]) || 0;
const so = Number(goalie?.[8]) || 0;

// =========================
// 🧾 TEMPLATE VALUES
// =========================
const rep = {
PLAYER: playerName,
TEAM: team,

GP: gp,
G: g,
A: a,
PTS: pts,

BS: bs,
TA: ta,
INT: int,

PPG: ppg,

GGP: ggp,
W: w,
L: l,

SV: sv,
GAA: gaa,
SO: so
};

// =========================
// 🖼️ TEAM LOGO
// =========================
const imageReplacements = {};

const logoKey = Object.keys(TEAM_LOGOS).find(
key => normalize(key) === normalize(team)
);

const fallbackKey = Object.keys(TEAM_LOGOS).find(
key =>
normalize(key).includes(normalize(team)) ||
normalize(team).includes(normalize(key))
);

const finalKey = logoKey || fallbackKey;

if (finalKey && TEAM_LOGOS[finalKey]) {
imageReplacements.TEAM_LOGO =
TEAM_LOGOS[finalKey];
}

// =========================
// 🖼️ GENERATE IMAGE
// =========================
const image = await createImageFromTemplate(
process.env.MYSTATS_TEMPLATE_ID,
rep,
"mystats.png",
imageReplacements
);

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
