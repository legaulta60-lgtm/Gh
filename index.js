const GAME_RESULTS_CHANNEL_ID="1479255203109671053";
const STANDINGS_CHANNEL_ID="1479255125741666335";
const STAT_LEADERS_CHANNEL_ID="1479255158373220363";

const {
Client,
GatewayIntentBits,
REST,
Routes,
SlashCommandBuilder,
AttachmentBuilder,
ActionRowBuilder,
ButtonBuilder,
ButtonStyle
} = require("discord.js");

const { google } = require("googleapis");

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const client = new Client({
intents: [GatewayIntentBits.Guilds],
});

const TEAM_LOGOS = {
"Buffalo Sabres": "https://i.imgur.com/5o8LJVa.png",
"Montreal Canadiens": "https://i.imgur.com/1na8DlE.png",
"Utah Mammoth": "https://i.imgur.com/wdAvOGj.png",
"Toronto Marlies": "https://i.imgur.com/x25dwvT.png",
"Toronto Maple Leafs": "https://i.imgur.com/DTGLpYi.png",
"Fort Erie Hawks": "https://i.imgur.com/lO6lUWU.png",
};

// 🔒 ADMIN SYSTEM
const ADMIN_ID = "769228708049190953";

function isAdmin(interaction) {
return interaction.user.id === ADMIN_ID;
}

const auth = new google.auth.GoogleAuth({
credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
scopes: [
"https://www.googleapis.com/auth/spreadsheets",
"https://www.googleapis.com/auth/presentations",
],
});

const sheets = google.sheets({ version: "v4", auth });
const slides = google.slides({ version: "v1", auth });

const PUBLIC_COMMANDS = [
  "linkplayer",
  "mystats",
  "teamstats"
  ];

const commands = [

new SlashCommandBuilder()
.setName("mystats")
.setDescription("View your linked player stats"),

new SlashCommandBuilder()
.setName("linkplayer")
.setDescription("Link your Discord to a player")
.addStringOption(option =>
option
.setName("player")
.setDescription("Your player name")
.setRequired(true)
),


new SlashCommandBuilder()
.setName("notifyunlinked")
.setDescription("Show unlinked players"),

new SlashCommandBuilder()
.setName("teamstats")
.setDescription("View a team stats card"),

new SlashCommandBuilder()
.setName("standings")
.setDescription("View league standings"),


new SlashCommandBuilder()
.setName("schedule")
.setDescription("View a team "),

new SlashCommandBuilder()
.setName("statleaders")
.setDescription("View league stat leaders"),

new SlashCommandBuilder()
.setName("removegame")
.setDescription("Remove a game by ID")
.addStringOption(option =>
option
.setName("game")
.setDescription("Game ID")
.setRequired(true)
),

new SlashCommandBuilder()
.setName("gameresults")
.setDescription("Submit game result")
.addStringOption((option) =>
option
.setName("input")
.setDescription("Game input (stats)")
.setRequired(true),
)
.addStringOption((option) =>
option
.setName("recap")
.setDescription("Optional recap message")
.setRequired(false),
),
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
try {
await rest.put(
Routes.applicationGuildCommands(
process.env.CLIENT_ID,
process.env.GUILD_ID,
),
{ body: commands },
);
console.log("Commands registered");
} catch (err) {
console.error("Command register error:", err);
}
})();

client.once("ready", () => {
console.log(`Logged in as ${client.user.tag}`);
});



async function handleTeamStats(interaction) {
try {

await interaction.deferReply();

// =========================
// 🔗 GET LINKED PLAYER
// =========================
const linked = await getSheetValues("Linked Players!A2:D1000"); // 🔥 FIXED RANGE

const link = linked.find(row => row[0] === interaction.user.id);

if (!link) {
return interaction.editReply("❌ You are not linked. Use /linkplayer first.");
}

const playerName = link[2];
const team = (link[3] || "").trim(); // 🔥 SAFE

if (!team) {
return interaction.editReply("❌ No team set. Add your team in column D.");
}

// =========================
// 📊 GET TEAM STATS
// =========================
const standings = await getSheetValues("Standings!K2:S50");

const teamRow = standings.find(row =>
normalize(row[0]) === normalize(team)
);

if (!teamRow) {
console.log("TEAM:", team);
console.log("STANDINGS:", standings.map(r => r[0]));
return interaction.editReply("❌ Team not found in standings.");
}

const gp = Number(teamRow[1]) || 0;
const w = Number(teamRow[2]) || 0;
const l = Number(teamRow[3]) || 0;
const otl = Number(teamRow[4]) || 0;
const pts = Number(teamRow[5]) || 0;
const gf = Number(teamRow[6]) || 0;
const ga = Number(teamRow[7]) || 0;

const diff = gf - ga;

const DIFF_POS = diff >= 0 ? `+${diff}` : "";
const DIFF_NEG = diff < 0 ? `${diff}` : "";

// =========================
// 📊 LOAD PLAYERS (YOU WERE MISSING THIS)
// =========================
const players = await getSheetValues("Player Stats!A3:I");

// =========================
// 🔥 TOP PLAYERS
// =========================
const teamPlayers = players
.filter(r => normalize(r[1]) === normalize(team))
.sort((a, b) => (Number(b[5]) || 0) - (Number(a[5]) || 0));

const top1 = teamPlayers[0];
const top2 = teamPlayers[1];

function formatForward(p) {
if (!p) return "N/A";

return `${p[0]}\n${p[2]} GP | ${p[3]}G ${p[4]}A ${p[5]}P`;
}

// =========================
// 🧤 GOALIE
// =========================
const goalies = await getSheetValues("Goalie Stats!A3:I");

const teamGoalies = goalies
.filter(r => normalize(r[1]) === normalize(team))
.sort((a, b) => (Number(b[2]) || 0) - (Number(a[2]) || 0));

const goalie = teamGoalies[0];

function formatGoalie(g) {
if (!g) return "N/A";

const gp = Number(g[2]) || 0;
const w = Number(g[3]) || 0;

const saves = Number(g[6]) || 0;
const shots = Number(g[7]) || 0;

const sv = shots > 0
? (saves / shots).toFixed(3).replace(/^0/, "")
: ".000";

const gaa = gp > 0
? ((shots - saves) / gp).toFixed(2)
: "0.00";

return `${g[0]}\n${gp} GP | ${w}W | ${sv} SV% | ${gaa} GAA`;
}

// =========================
// 🧾 TEMPLATE DATA
// =========================
const rep = {
TEAM: team,

GP: gp,
W: w,
L: l,
OTL: otl,
PTS: pts,

GF: gf,
GA: ga,

DIFF_POS,
DIFF_NEG,

FWD1: formatForward(top1),
FWD2: formatForward(top2),
GOALIE1: formatGoalie(goalie)
};

// =========================
// 🖼️ LOGO
// =========================
const img = {};

const logoKey = Object.keys(TEAM_LOGOS).find(
key => normalize(key) === normalize(team)
);

if (logoKey) {
img.TEAM_LOGO = TEAM_LOGOS[logoKey];
}

// =========================
// 🖼️ GENERATE IMAGE
// =========================
const image = await createImageFromTemplate(
process.env.TEAMSTATS_TEMPLATE_ID,
rep,
"teamstats.png",
img
);

return interaction.editReply({
content: `📊 ${team} Team Stats`,
files: [{ attachment: image, name: "teamstats.png" }]
});

} catch (err) {
console.error(err);
return interaction.editReply("❌ Error loading team stats.");
}
}

async function rebuildStandings() {

// 🔥 UPDATED RANGE (NOW INCLUDES RESULT TYPE)
const results = await getSheetValues("Game Results!A2:G");

let standings = await getSheetValues("Standings!K2:S50");

// reset stats
standings = standings.map(row => [
row[0], // TEAM
0, // GP
0, // W
0, // L
0, // OT
0, // PTS
0, // GF
0, // GA
0 // DIFF
]);

// =========================
// 🔧 UPDATE TEAM
// =========================
function updateTeam(teamName, gf, ga, isWin, resultType) {

for (let i = 0; i < standings.length; i++) {

if (normalize(standings[i][0]) === normalize(teamName)) {

standings[i][1] += 1; // GP

if (isWin) {
standings[i][2] += 1; // W
standings[i][5] += 2; // +2 pts
} else {

if (resultType === "OT") {
standings[i][4] += 1; // OT LOSS
standings[i][5] += 1; // +1 pt
} else {
standings[i][3] += 1; // REG LOSS
}

}

standings[i][6] += gf;
standings[i][7] += ga;
standings[i][8] = standings[i][6] - standings[i][7];
}
}
}

// =========================
// 🔁 PROCESS RESULTS
// =========================
for (const row of results) {

const [id, home, away, homeScore, awayScore, winner, resultType] = row;

const h = Number(homeScore);
const a = Number(awayScore);

// skip bad rows
if (!home || !away || isNaN(h) || isNaN(a)) continue;

updateTeam(home, h, a, h > a, resultType);
updateTeam(away, a, h, a > h, resultType);
}

// =========================
// 📊 SORT STANDINGS
// =========================
standings.sort((a, b) => {
if (b[5] !== a[5]) return b[5] - a[5]; // PTS
if (b[8] !== a[8]) return b[8] - a[8]; // DIFF
return b[6] - a[6]; // GF
});

// =========================
// 💾 SAVE
// =========================
await sheets.spreadsheets.values.clear({
spreadsheetId: process.env.SHEET_ID,
range: "Standings!K2:S50",
});

await updateSheetValues("Standings!K2:S50", standings);
}


async function handleRemoveGame(interaction) {

// 🔒 ADMIN CHECK
if (!interaction.member.permissions.has("Administrator")) {
return interaction.reply({
content: "❌ You do not have permission.",
ephemeral: true
});
}

await interaction.deferReply();

const gameId = String(interaction.options.getString("game")).trim();

// =========================
// 🗑 REMOVE GAME RESULTS
// =========================
const results = await getSheetValues("Game Results!A2:F");

const filteredResults = results.filter(row =>
String(row[0]).trim() !== gameId
);

await sheets.spreadsheets.values.clear({
spreadsheetId: process.env.SHEET_ID,
range: "Game Results!A2:F",
});

if (filteredResults.length) {
await updateSheetValues("Game Results!A2:F", filteredResults);
}

// =========================
// 🗑 REMOVE MASTER STATS
// =========================
const master = await getSheetValues("Master Stats!A2:M");

const filteredMaster = master.filter(row =>
String(row[0]).trim() !== gameId
);

await sheets.spreadsheets.values.clear({
spreadsheetId: process.env.SHEET_ID,
range: "Master Stats!A2:M",
});

// =========================
// 🔄 REBUILD PLAYER + GOALIE STATS FROM MASTER
// =========================

const masterData = filteredMaster;

// CLEAR tables
await sheets.spreadsheets.values.clear({
spreadsheetId: process.env.SHEET_ID,
range: "Player Stats!A3:I",
});

await sheets.spreadsheets.values.clear({
spreadsheetId: process.env.SHEET_ID,
range: "Goalie Stats!A3:I",
});

const playerMap = {};
const goalieMap = {};

for (const row of masterData) {
const name = row[1];
const team = row[2];

// 🧍 SKATER
if (row[3] !== "") {
if (!playerMap[name]) {
playerMap[name] = [name, team, 0,0,0,0,0,0,0];
}

playerMap[name][2] += 1;
playerMap[name][3] += Number(row[3]) || 0;
playerMap[name][4] += Number(row[4]) || 0;
playerMap[name][5] += Number(row[5]) || 0;
playerMap[name][6] += Number(row[6]) || 0;
playerMap[name][7] += Number(row[7]) || 0;
playerMap[name][8] += Number(row[8]) || 0;
}

// 🧤 GOALIE
if (row[9] !== "") {
if (!goalieMap[name]) {
goalieMap[name] = [name, team, 0,0,0,0,0,0,0];
}

const saves = Number(row[9]) || 0;
const shots = Number(row[10]) || 0;
const ga = shots - saves;

goalieMap[name][2] += 1;
goalieMap[name][3] += Number(row[11]) || 0;
goalieMap[name][4] += Number(row[12]) || 0;
goalieMap[name][5] += ga;
goalieMap[name][6] += saves;
goalieMap[name][7] += shots;
goalieMap[name][8] += Number(row[13]) || 0;
}
}

// WRITE BACK
if (Object.keys(playerMap).length) {
await updateSheetValues("Player Stats!A3:I", Object.values(playerMap));
}

if (Object.keys(goalieMap).length) {
await updateSheetValues("Goalie Stats!A3:I", Object.values(goalieMap));
}

if (filteredMaster.length) {
await updateSheetValues("Master Stats!A2:M", filteredMaster);
}

// =========================
// 📅 RESET SCHEDULE (ONLY ONE ROW)
// =========================
const schedule = await getSheetValues("Schedule!A2:I");

for (let i = 0; i < schedule.length; i++) {
const row = schedule[i];

const rowGameId = String(row[1]).replace(/[^0-9]/g, "").trim();

if (rowGameId === gameId) {
row[5] = "";
row[6] = "";
row[7] = "UPCOMING";
row[8] = "";

await updateSheetValues(`Schedule!A${i + 2}:I${i + 2}`, [row]);
break;
}
}

// =========================
// 📊 REBUILD STANDINGS
// =========================
let standings = await getSheetValues("Standings!K2:S50");

standings = standings.map(row => [
row[0], 0,0,0,0,0,0,0,0
]);

function updateTeam(teamName, gf, ga, isWin) {
for (let i = 0; i < standings.length; i++) {
if (normalize(standings[i][0]) === normalize(teamName)) {

standings[i][1] += 1;

if (isWin) {
standings[i][2] += 1;
standings[i][5] += 2;
} else {
standings[i][3] += 1;
}

standings[i][6] += gf;
standings[i][7] += ga;
standings[i][8] = standings[i][6] - standings[i][7];
}
}
}

for (const row of filteredResults) {
const [id, home, away, homeScore, awayScore] = row;

const h = Number(homeScore);
const a = Number(awayScore);

if (!home || !away || isNaN(h) || isNaN(a)) continue;

updateTeam(home, h, a, h > a);
updateTeam(away, a, h, a > h);
}

standings.sort((a, b) => b[5] - a[5]);

await sheets.spreadsheets.values.clear({
spreadsheetId: process.env.SHEET_ID,
range: "Standings!K2:S50",
});

await updateSheetValues("Standings!K2:S50", standings);

return interaction.editReply(`🗑️ Game ${gameId} fully removed.`);
}


async function getTeams() {
const rows = await getSheetValues("Standings!K2:K50");
return rows.map((row) => row[0]).filter(Boolean);
}

async function getSheetValues(range) {
const res = await sheets.spreadsheets.values.get({
spreadsheetId: process.env.SHEET_ID,
range,
});

return res.data.values || [];
}

async function appendSheetValues(range, values) {
await sheets.spreadsheets.values.append({
spreadsheetId: process.env.SHEET_ID,
range,
valueInputOption: "USER_ENTERED",
requestBody: { values },
});
}

async function updateSheetValues(range, values) {
await sheets.spreadsheets.values.update({
spreadsheetId: process.env.SHEET_ID,
range,
valueInputOption: "USER_ENTERED",
requestBody: { values },
});
}


async function handleScheduleSystem(interaction) {
try {

// =========================
// 🔘 BUTTON CLICK (PERSONAL)
// =========================
if (interaction.isButton() && interaction.customId === "personal_schedule") {

await interaction.deferReply({ ephemeral: true });

const userId = interaction.user.id;

// =========================
// 🔗 GET LINKED PLAYER (A:D)
// =========================
const linked = await getSheetValues("Linked Players!A2:D1000");

const link = linked.find(row => String(row[0]) === String(userId));

if (!link) {
return interaction.editReply("❌ You are not linked. Use /linkplayer first.");
}

const playerName = link[2];
const teamRaw = link[3];

// =========================
// 🟢 TEAM FROM LINKED (COLUMN D)
// =========================
if (!teamRaw) {
return interaction.editReply("❌ No team set. Contact admin.");
}

const team = String(teamRaw).trim();

// =========================
// 📅 GET SCHEDULE
// =========================
const rows = await getSheetValues("Schedule!A2:I");

// [3]=home, [4]=away
const games = rows.filter(row => {
const home = String(row[3] || "").trim().toLowerCase();
const away = String(row[4] || "").trim().toLowerCase();
const t = team.toLowerCase();

return home === t || away === t;
});

if (!games.length) {
return interaction.editReply(`❌ No games found for ${team}.`);
}

// =========================
// 🧾 BUILD TEMPLATE DATA
// =========================
const rep = {
TEAM: team
};

for (let i = 0; i < 40; i++) {

const g = games[i];

if (!g) {
rep[`GAME${i+1}`] = "";
continue;
}

const home = g[3] || "";
const away = g[4] || "";

const homeScore = g[5];
const awayScore = g[6];
const isFinal = String(g[7]).toLowerCase() === "true";

// =========================
// 🏒 FORMAT (YOUR EXACT STYLE)
// =========================
let line = `(H) ${home}\n(A) ${away}\n`;

if (isFinal && homeScore !== "" && awayScore !== "") {
line += `FINAL ${homeScore}-${awayScore}`;
} else {
line += `UPCOMING`;
}

rep[`GAME${i+1}`] = line;
}

// =========================
// 🖼️ GENERATE IMAGE
// =========================
const image = await createImageFromTemplate(
process.env.TEMPLATE_PRESENTATION_ID,
rep,
"schedule.png"
);

return interaction.editReply({
content: `📅 ${team} Schedule`,
files: [{ attachment: image, name: "schedule.png" }]
});
}

// =========================
// 📅 SLASH COMMAND (POST BUTTON)
// =========================
if (interaction.isChatInputCommand() && interaction.commandName === "schedule") {

const row = new ActionRowBuilder().addComponents(
new ButtonBuilder()
.setCustomId("personal_schedule")
.setLabel("Personal Schedule")
.setStyle(ButtonStyle.Primary)
);

// persistent message
return interaction.reply({
content:
"📅 **Season Schedule**\n\nClick the button below to view your personal schedule.",
components: [row],
});
}

} catch (err) {
console.error("SCHEDULE SYSTEM ERROR:", err);

if (interaction.deferred || interaction.replied) {
await interaction.editReply("❌ Error loading schedule.");
} else {
await interaction.reply({ content: "❌ Error.", ephemeral: true });
}
}
}

async function createImageFromTemplate(
templateId,
replacements,
fileName,
imageReplacements = {}
) {
let tempSlideId;

try {
const pres = await slides.presentations.get({
presentationId: templateId,
});

const sourceSlideId = pres.data.slides[0].objectId;
tempSlideId = `TEMP_${Date.now()}`;

const requests = [
{
duplicateObject: {
objectId: sourceSlideId,
objectIds: {
[sourceSlideId]: tempSlideId,
},
},
},
];

// TEXT replacements
for (const key in replacements) {
const value = replacements[key];
if (value === undefined || value === null) continue;

requests.push({
replaceAllText: {
containsText: {
text: `{{${key}}}`,
matchCase: true,
},
replaceText: String(value),
pageObjectIds: [tempSlideId],
},
});
}

// IMAGE replacements
for (const key in imageReplacements) {
const url = imageReplacements[key];
if (!url) continue;

requests.push({
replaceAllShapesWithImage: {
containsText: {
text: `{{${key}}}`,
matchCase: true,
},
imageUrl: url,
replaceMethod: "CENTER_CROP",
pageObjectIds: [tempSlideId],
},
});
}

console.log("🛠 Sending batchUpdate with", requests.length, "requests");

await slides.presentations.batchUpdate({
presentationId: templateId,
requestBody: { requests },
});

// 🔥 IMPORTANT: wait longer + ensure slide exists
await new Promise((r) => setTimeout(r, 1500));

const thumb = await slides.presentations.pages.getThumbnail({
presentationId: templateId,
pageObjectId: tempSlideId,
"thumbnailProperties.mimeType": "PNG",
"thumbnailProperties.thumbnailSize": "LARGE",
});

if (!thumb.data.contentUrl) {
throw new Error("Thumbnail generation failed");
}

const imageRes = await fetch(thumb.data.contentUrl);
const arrayBuffer = await imageRes.arrayBuffer();

console.log("✅ Image generated");

return Buffer.from(arrayBuffer);

} catch (err) {
console.error("❌ IMAGE ERROR:", err);
throw err;

} finally {
if (tempSlideId) {
await slides.presentations.batchUpdate({
presentationId: templateId,
requestBody: {
requests: [
{
deleteObject: {
objectId: tempSlideId,
},
},
],
},
}).catch(() => {});
}
}
}


function normalize(value) {
return String(value || "")
.trim()
.toLowerCase()
.replace(/\s+/g, " ");
}

function num(value) {
const n = Number(value);
return Number.isFinite(n) ? n : 0;
}

function formatSavePct(value) {
const n = num(value);
if (n === 0) return "0.000";
return n.toFixed(3).replace(/^0/, "");
}

function formatGAA(value) {
const n = num(value);
return n.toFixed(2);
}



client.on("interactionCreate", async (interaction) => {
try {

// 🔥 HANDLE SCHEDULE SYSTEM FIRST
await handleScheduleSystem(interaction);

// =========================
// OTHER COMMANDS
// =========================
if (!interaction.isChatInputCommand()) return;

// =========================
// 🔒 PUBLIC / ADMIN COMMANDS
// =========================
if (
!PUBLIC_COMMANDS.includes(interaction.commandName) &&
!isAdmin(interaction)
) {
return interaction.reply({
content: "❌ You do not have permission to use this command.",
ephemeral: true,
});
}

if (interaction.commandName === "removegame") {
return handleRemoveGame(interaction);
}

if (interaction.commandName === "gameresults") {

return handleGameResults(interaction);
}

if (interaction.commandName === "statleaders") {
  return handleStatLeaders(interaction);
}  

if (interaction.commandName === "mystats") {
return handleMyStats(interaction);
}

if (interaction.commandName === "teamstats") {
return handleTeamStats(interaction);
}

if (interaction.commandName === "linkplayer") {
return handleLinkPlayer(interaction);
}

if (interaction.commandName === "notifyunlinked") {
return handleNotifyUnlinked(interaction);
}

} catch (err) {
console.error(err);

if (interaction.deferred || interaction.replied) {
await interaction.editReply("❌ Error occurred.");
} else {
await interaction.reply("❌ Error occurred.");
}
}
});


const createGameResults = require("./gameResults");

const {
handleGameResults,
handleLinkPlayer,
handleNotifyUnlinked,
handleMyStats,
handleStatLeaders
} = createGameResults({
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
});

client.login(process.env.DISCORD_TOKEN);
