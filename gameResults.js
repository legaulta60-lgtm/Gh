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
async function postStatLeaders(client) {

const rows = await getSheetValues("Player Stats!A3:I");
const goalieRows = await getSheetValues("Goalie Stats!A3:I");

if (!rows.length) return;

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

const goalies = goalieRows.map(r => {
const saves = Number(r[6]) || 0;
const shots = Number(r[7]) || 0;

return {
name: r[0],
team: r[1],
SV: shots > 0 ? (saves / shots).toFixed(3) : 0, // FIXED
GAA: Number(r[5]) || 0,
SO: Number(r[8]) || 0
};
});

const top = (arr, key) => [...arr].sort((a,b)=>b[key]-a[key]).slice(0,5);

const rep = {};
const img = {};

function fill(list, valueKey, prefix) {
for (let i = 0; i < 5; i++) {
const p = list[i] || {};
rep[`${prefix}N${i+1}`] = p.name || "";
rep[`${prefix}P${i+1}`] = p[valueKey] ?? "0";
if (TEAM_LOGOS[p.team]) img[`${prefix}LOGO${i+1}`] = TEAM_LOGOS[p.team];
}
}

fill(top(players,"PTS"),"PTS","P");
fill(top(players,"G"),"G","G");
fill(top(players,"A"),"A","A");
fill(top(players,"BS"),"BS","B");
fill(top(players,"TA"),"TA","T");
fill(top(players,"INT"),"INT","I");

const topSV = top(goalies,"SV");
const topGAA = [...goalies].sort((a,b)=>a.GAA-b.GAA).slice(0,5);
const topSO = top(goalies,"SO");

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
// 🏒 GAME RESULTS
// =========================
async function handleGameResults(interaction) {
await interaction.deferReply();

const input = interaction.options.getString("input");
const lines = input.split("\n").map(l=>l.trim());

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

await postStandings(interaction.client);
await postStatLeaders(interaction.client);

return interaction.editReply("✅ Game recorded");
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
await interaction.deferReply();

const discordId = interaction.user.id;
const discordName = interaction.user.username;
const playerName = interaction.options.getString("player");

if (!playerName) {
return interaction.editReply("❌ You must enter a player name.");
}

// =========================
// ADD TO LINKED PLAYERS
// =========================
const linked = await getSheetValues("Linked Players!A2:C");

const alreadyLinked = linked.some(r =>
normalize(r[2]) === normalize(playerName)
);

if (!alreadyLinked) {
const linked = await getSheetValues("Linked Players!A2:C1000");

let foundIndex = -1;

for (let i = 0; i < linked.length; i++) {
if (normalize(linked[i][2]) === normalize(playerName)) {
foundIndex = i;
break;
}
}

if (foundIndex !== -1) {
// UPDATE EXISTING ROW
const rowNumber = foundIndex + 2; // because A2 starts at row 2

await updateSheetValues(`Linked Players!A${rowNumber}:C${rowNumber}`, [
[discordId, discordName || "", playerName]
]);
} else {
// ADD NEW ROW
await appendSheetValues("Linked Players!A:C", [
[discordId, discordName || "", playerName]
]);
}
}

// =========================
// CREATE PLAYER ROW (IF NOT EXISTS)
// =========================
const players = await getSheetValues("Player Stats!A3:A1000");

const existsPlayer = players.some(r =>
normalize(r[0]) === normalize(playerName)
);

if (!existsPlayer) {
await appendSheetValues("Player Stats!A3:I", [
[playerName, "", 0, 0, 0, 0, 0, 0, 0]
]);
}

// =========================
// CREATE GOALIE ROW (IF NOT EXISTS)
// =========================
const goalies = await getSheetValues("Goalie Stats!A3:A1000");

const existsGoalie = goalies.some(r =>
normalize(r[0]) === normalize(playerName)
);

if (!existsGoalie) {
await appendSheetValues("Goalie Stats!A3:I", [
[playerName, "", 0, 0, 0, 0, 0, 0, 0]
]);
}

return interaction.editReply(`✅ Linked to **${playerName}**`);
}
  

return { 
  handleGameResults,
  handleLinkPlayer
       
};
};
