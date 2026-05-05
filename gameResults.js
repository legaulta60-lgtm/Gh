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
// 📊 STAT LEADERS
// =========================
async function handleStatLeaders(interaction) {
try {

await interaction.deferReply();

const rows = await getSheetValues("Player Stats!A3:I");
const goalieRows = await getSheetValues("Goalie Stats!A3:I");

if (!rows.length) {
return interaction.editReply("❌ No stats found.");
}

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

return interaction.editReply({
content: "📊 Stat Leaders",
files: [{ attachment: image, name: "leaders.png" }]
});

} catch (err) {
console.error(err);
return interaction.editReply("❌ Error loading stat leaders.");
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

const linked = await getSheetValues("Linked Players!A2:C1000");
const unlinked = await getSheetValues("Unlinked Players!A2:C1000");

let gameId = Date.now();
let homeTeam="", awayTeam="";
let homeScore=0, awayScore=0;

let mode=null, currentTeam=null;

const masterRows = [];

for (const line of lines) {

if (line.toLowerCase().startsWith("game:")) {
gameId = line.split(":")[1].trim();
}

if (line.toLowerCase().startsWith("score:")) {
const clean = line.replace(/score:/i,"").trim();
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

// SKATER
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

// GOALIE
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

masterRows.push([gameId,name,currentTeam,null,null,null,null,null,saves,shots,raw.includes("W")?1:0,raw.includes("L")?1:0,ga===0?1:0]);
}
}

// WRITE
await appendSheetValues("Master Stats!A3:M", masterRows);

await appendSheetValues("Game Results!A2:F", [
[gameId,homeTeam,awayTeam,homeScore,awayScore,homeScore>awayScore?homeTeam:awayTeam]
]);

await rebuildAllStats();
await rebuildStandings();

// =========================
// 🏒 GAME RECAP
// =========================
const recap = `**Game #${gameId}**
(H) ${homeTeam} ${homeScore} - (A) ${awayTeam} ${awayScore}

${recapNote}`;

// send to results channel
const channel = await interaction.client.channels.fetch(GAME_RESULTS_CHANNEL_ID);

await channel.send({
content: recap.trim()
});

// =========================
// 📊 UPDATE POSTS
// =========================
await postStandings(interaction.client);
await postStatLeaders(interaction.client);

return interaction.editReply("✅ Game recorded + recap posted");
}


async function rebuildAllStats() {
const master = await getSheetValues("Master Stats!A3:M1000");

const players = {};
const goalies = {};

for (const r of master) {
const name = r[1];
const team = r[2];

const isSkater = r[3] !== "" && r[3] !== null && r[3] !== undefined;
const isGoalie = r[8] !== "" && r[8] !== null && r[8] !== undefined;

// SKATER
if (isSkater && !isGoalie) {
if (!players[name]) {
players[name] = [name, team, 0,0,0,0,0,0,0];
}

players[name][2] += 1;
players[name][3] += Number(r[3]) || 0;
players[name][4] += Number(r[4]) || 0;
players[name][5] += (Number(r[3]) + Number(r[4])) || 0;
players[name][6] += Number(r[5]) || 0;
players[name][7] += Number(r[6]) || 0;
players[name][8] += Number(r[7]) || 0;
}

// GOALIE
if (isGoalie && !isSkater) {
if (!goalies[name]) {
goalies[name] = [name, team, 0,0,0,0,0,0,0];
}

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

// 🔥 THESE MUST BE AFTER THE LOOP
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
const linkedRows = await getSheetValues("Linked Players!A:C");

const link = linkedRows.find(row => String(row[0]) === String(userId));

if (!link) {
return interaction.editReply("❌ You are not linked. Use /linkplayer first.");
}

const playerName = link[2];

// =========================
// 📊 GET STATS
// =========================
const playerRows = await getSheetValues("Player Stats!A3:I");
const goalieRows = await getSheetValues("Goalie Stats!A3:I");

const skater = playerRows.find(r => r[0] === playerName);
const goalie = goalieRows.find(r => r[0] === playerName);

// =========================
// 🏒 GET TEAM (IMPORTANT FIX)
// =========================
const team = skater?.[1] || goalie?.[1] || "";

// =========================
// 🧮 CALCULATIONS
// =========================
const gp = Number(skater?.[2]) || 0;
const g = Number(skater?.[3]) || 0;
const a = Number(skater?.[4]) || 0;
const pts = Number(skater?.[5]) || 0;

const bs = Number(skater?.[6]) || 0;
const ta = Number(skater?.[7]) || 0;
const int = Number(skater?.[8]) || 0;

const ppg = gp > 0 ? (pts / gp).toFixed(2) : "0.00";

const ggp = Number(goalie?.[2]) || 0;
const w = Number(goalie?.[3]) || 0;
const l = Number(goalie?.[4]) || 0;

const saves = Number(goalie?.[6]) || 0;
const shots = Number(goalie?.[7]) || 0;

const sv = shots > 0 ? (saves / shots).toFixed(3) : "0.000";
const gaa = Number(goalie?.[5]) || 0;
const so = Number(goalie?.[8]) || 0;

// =========================
// 🧾 TEMPLATE VALUES (MATCHES YOUR IMAGE)
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
// 🖼️ LOGO FIX
// =========================
const imageReplacements = {};

const logoKey = Object.keys(TEAM_LOGOS).find(
key => key.toLowerCase().trim() === team.toLowerCase().trim()
);

if (logoKey) {
imageReplacements.TEAM_LOGO = TEAM_LOGOS[logoKey];
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
files: [{ attachment: image, name: "mystats.png" }]
});

} catch (err) {
console.error(err);
return interaction.editReply("❌ Error loading stats.");
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
