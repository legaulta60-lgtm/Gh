const GAME_RESULTS_CHANNEL_ID="1498059946116382731";
const STANDINGS_CHANNEL_ID="1498060011589472396";
const STAT_LEADERS_CHANNEL_ID="1498060011589472396";

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  AttachmentBuilder,
} = require("discord.js");

const { google } = require("googleapis");

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const {
  handleSchedule,
  handleScheduleTeamSelect,
} = require("./scheduleCommand");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const TEAM_LOGOS = {
  "Buffalo Sabres": "https://i.imgur.com/5o8LJVa.png",
  "Montreal Canadiens": "https://i.imgur.com/ZnW3lIE.png",
  "Super Cobras": "https://i.imgur.com/KV87bDx.png",
  "Toronto Marlies": "https://i.imgur.com/x25dwvT.png",
  "Toronto Maple Leafs": "https://i.imgur.com/fsjxkMb.png",
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
    .setDescription("View a team stats card")
    .addStringOption((option) =>
      option
        .setName("team")
        .setDescription("Choose a team")
        .setRequired(true)
        .setAutocomplete(true),
    ),

  new SlashCommandBuilder()
    .setName("standings")
    .setDescription("View league standings"),


  new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("View a team schedule"),

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
        .setDescription("Format: Leafs 3 - Canadiens 2")
        .setRequired(true),
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
await interaction.deferReply();

const teamName = interaction.options.getString("team").trim();

// =========================
// 📊 GET TEAM FROM STANDINGS
// =========================
const standings = await getSheetValues("Standings!K2:S50");

const team = standings.find(
(row) => normalize(row[0]) === normalize(teamName)
);

if (!team) {
return interaction.editReply("Team not found.");
}

const teamNameClean = team[0];

const gp = num(team[1]);
const w = num(team[2]);
const l = num(team[3]);
const otl = num(team[4]);
const pts = num(team[5]);
const gf = num(team[6]);
const ga = num(team[7]);

const diff = gf - ga;

// =========================
// 🎨 DIFF COLOR SYSTEM
// =========================
let DIFF_POS = "";
let DIFF_NEG = "";

if (diff >= 0) {
DIFF_POS = `+${diff}`;
} else {
DIFF_NEG = `${diff}`;
}

// =========================
// 📊 GET PLAYERS
// =========================
const playerRows = await getSheetValues("Player Stats!A2:K1000");

const teamPlayers = playerRows.filter(
(row) => normalize(row[1]) === normalize(teamNameClean)
);

// Top 2 forwards by points
const topForwards = teamPlayers
.sort((a, b) => num(b[5]) - num(a[5]))
.slice(0, 2);

// =========================
// 🥅 GET GOALIES
// =========================
const goalieRows = await getSheetValues("Goalie Stats!A2:K1000");

const teamGoalies = goalieRows.filter(
(row) => normalize(row[1]) === normalize(teamNameClean)
);

const topGoalie = teamGoalies.sort((a, b) => num(b[2]) - num(a[2]))[0];

// =========================
// 🧮 FORMAT FUNCTIONS
// =========================

function formatForward(p) {
if (!p) return "N/A";

const name = p[0];
const gp = num(p[2]);
const g = num(p[3]);
const a = num(p[4]);
const pts = num(p[5]);

const ppg = gp > 0 ? (pts / gp).toFixed(2) : "0.00";

return `${name} — ${gp} GP | ${g}G ${a}A ${pts}P | ${ppg} PPG`;
}

function formatGoalie(g) {
if (!g) return "N/A";

const name = g[0];
const gp = num(g[2]);
const w = num(g[3]);
const saves = num(g[6]); // Saves column
const shots = num(g[7]); // Shots Against column
const ga = shots - saves;
const so = num(g[10]);

const svPct =
shots > 0
? (saves / shots).toFixed(3).replace(/^0/, "")
: ".000";

const gaa = gp > 0 ? (ga / gp).toFixed(2) : "0.00";

return `${name} — ${gp} GP | ${w}W | ${svPct} SV% | ${gaa} GAA | ${so} SO`;
}

// =========================
// 🧾 REPLACEMENTS
// =========================

const replacements = {
TEAM: teamNameClean,

GP: gp,
W: w,
L: l,
OTL: otl,
PTS: pts,

GF: gf,
GA: ga,

DIFF_POS,
DIFF_NEG,

FWD1: formatForward(topForwards[0]),
FWD2: formatForward(topForwards[1]),
GOALIE1: formatGoalie(topGoalie),
};

// =========================
// 🖼️ LOGO
// =========================

const imageReplacements = {};

if (TEAM_LOGOS[teamNameClean]) {
imageReplacements.TEAM_LOGO = TEAM_LOGOS[teamNameClean];
}

// =========================
// 🖼️ GENERATE IMAGE
// =========================

console.log("REPLACEMENTS KEYS:", Object.keys(replacements));
console.log("GP1 VALUE:", replacements["GP1"]);
  console.log("FULL OBJECT:", replacements);
  
const image = await createImageFromTemplate(
process.env.TEAMSTATS_TEMPLATE_ID,
replacements,
"teamstats.png",
imageReplacements
);

const file = new AttachmentBuilder(image, { name: "teamstats.png" });

return interaction.editReply({
content: `**${teamNameClean} Team Stats**`,
files: [file],
});
}


async function rebuildStandings() {
const results = await getSheetValues("Game Results!A2:F");
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

for (const row of results) {
const [id, home, away, homeScore, awayScore] = row;

const h = Number(homeScore);
const a = Number(awayScore);

updateTeam(home, h, a, h > a);
updateTeam(away, a, h, a > h);
}

standings.sort((a, b) => {
if (b[5] !== a[5]) return b[5] - a[5];
if (b[8] !== a[8]) return b[8] - a[8];
return b[6] - a[6];
});

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

if (interaction.commandName === "removegame") {
if (!isAdmin(interaction)) {
return interaction.reply({
content: "❌ You don't have permission to use this command.",
ephemeral: true,
});
}

return handleRemoveGame(interaction);
}
  
  try {
if (!interaction.isChatInputCommand()) return;

if (interaction.commandName === "gameresults") {
if (!isAdmin(interaction)) {
return interaction.reply({
content: "❌ No permission.",
ephemeral: true,
});
}
}

if (interaction.commandName === "mystats") {
return handleMyStats(interaction);
}

if (interaction.commandName === "teamstats") {
return handleTeamStats(interaction);
}

if (interaction.commandName === "schedule") {
return handleSchedule(interaction);
}
    
if (interaction.commandName === "linkplayer") {
return handleLinkPlayer(interaction);
}    

if (interaction.commandName === "notifyunlinked") {
return handleNotifyUnlinked(interaction);
}    

if (interaction.commandName === "removegame") {
if (!isAdmin(interaction)) {
return interaction.reply({
content: "❌ No permission.",
ephemeral: true,
});
}
return handleRemoveGame(interaction);
}

if (interaction.commandName === "gameresults") {
  return handleGameResults(interaction);
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
handleTeamStats
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

const createSchedule = require("./schedule");

const { handleSchedule } = createSchedule({
getSheetValues,
createImageFromTemplate
});
client.login(process.env.DISCORD_TOKEN);
