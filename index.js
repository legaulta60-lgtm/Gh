const GAME_RESULTS_CHANNEL_ID="1498059946116382731";
const STANDINGS_CHANNEL_ID="1498060011589472396";
const STAT_LEADERS_CHANNEL_ID="1498060011589472396";

const createGameResults = require("./gameResults");

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
    .setName("linkplayer")
    .setDescription("Link your Discord to your EA/player name")
    .addStringOption((option) =>
      option
        .setName("player")
        .setDescription("Your EA/player name")
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("mystats")
    .setDescription("View your linked player stats"),

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
    .setName("notifyunlinked")
    .setDescription("Show players with stats who are not linked"),

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


async function handleLinkPlayer(interaction) {
  const userId = interaction.user.id;
  const userName = interaction.user.username;
  const player = interaction.options.getString("player").trim();

  const linkedRows = await getSheetValues("Linked Players!A:C");

  const sameUserIndex = linkedRows.findIndex((row) => row[0] === userId);
  const samePlayerIndex = linkedRows.findIndex(
    (row) => normalize(row[2]) === normalize(player) && row[0] !== userId,
  );

  if (samePlayerIndex >= 0) {
    return interaction.reply(
      `❌ **${player}** is already linked to another Discord account.`,
    );
  }

  // ✅ Update or insert into Linked Players
  if (sameUserIndex >= 0) {
    const rowNumber = sameUserIndex + 1;
    await updateSheetValues(`Linked Players!A${rowNumber}:C${rowNumber}`, [
      [userId, userName, player],
    ]);
  } else {
    await appendSheetValues("Linked Players!A:C", [[userId, userName, player]]);
  }

  // =========================
  // 🔥 ENSURE PLAYER EXISTS IN PLAYER STATS
  // =========================
  const playerStats = await getSheetValues("Player Stats!A2:A1000");

  const existsInPlayers = playerStats.some(
    (row) => normalize(row[0]) === normalize(player),
  );

  if (!existsInPlayers) {
    await appendSheetValues("Player Stats!A:I", [
      [player, "", 0, 0, 0, 0, 0, 0, 0],
    ]);
  }

  // =========================
  // 🔥 ENSURE PLAYER EXISTS IN GOALIE STATS
  // =========================
  const goalieStats = await getSheetValues("Goalie Stats!A2:A1000");

  const existsInGoalies = goalieStats.some(
    (row) => normalize(row[0]) === normalize(player),
  );

  if (!existsInGoalies) {
    await appendSheetValues("Goalie Stats!A:K", [
      [player, "", 0, 0, 0, 0, 0, 0, "", "", 0],
    ]);
  }

  return interaction.reply(`✅ Linked to player: **${player}**`);
}

async function handleMyStats(interaction) {
  await interaction.deferReply();

  const userId = interaction.user.id;

  const linkedRows = await getSheetValues("Linked Players!A:C");
  const link = linkedRows.find((row) => row[0] === userId);

  if (!link) {
    return interaction.editReply(
      "You are not linked. Use `/linkplayer` first.",
    );
  }

  const playerName = link[2];

  const playerRows = await getSheetValues("Player Stats!A2:K1000");
  const goalieRows = await getSheetValues("Goalie Stats!A2:K1000");

  const player = playerRows.find(
    (row) => normalize(row[0]) === normalize(playerName),
  );
  const goalie = goalieRows.find(
    (row) => normalize(row[0]) === normalize(playerName),
  );

  if (!player && !goalie) {
    return interaction.editReply(
      "Player not found in Player Stats or Goalie Stats.",
    );
  }

  const playerTeam = player?.[1] || goalie?.[1] || "";
  const skaterGP = num(player?.[2]);
  const pts = num(player?.[5]);
  const ppg = skaterGP > 0 ? (pts / skaterGP).toFixed(2) : "0.00";

  const replacements = {
    PLAYER: playerName,
    TEAM: playerTeam,
    GP: player?.[2] || "0",
    G: player?.[3] || "0",
    A: player?.[4] || "0",
    PTS: player?.[5] || "0",
    BS: player?.[6] || "0",
    TA: player?.[7] || "0",
    INT: player?.[8] || "0",
    PPG: ppg,
    GGP: goalie?.[2] || "0",
    W: goalie?.[3] || "0",
    L: goalie?.[4] || "0",
    SV: formatSavePct(goalie?.[8]),
    GAA: formatGAA(goalie?.[9]),
    SO: goalie?.[10] || "0",
  };

  const imageReplacements = {};

  if (TEAM_LOGOS[playerTeam]) {
    imageReplacements.TEAM_LOGO = TEAM_LOGOS[playerTeam];
  }

  const file = new AttachmentBuilder(image, { name: "mystats.png" });

  return interaction.editReply({
    content: `**${playerName} Stats**`,
    files: [file],
  });
}

async function handleTeamStats(interaction) {
await interaction.deferReply();

const teamName = interaction.options.getString("team").trim();

// =========================
// 📊 GET TEAM FROM STANDINGS
// =========================
const standings = await getSheetValues("Standings!K1:S50");

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



async function handleGameResults(interaction) {
await interaction.deferReply();

const input = interaction.options.getString("input");
const lines = input.split("\n").map(l => l.trim()).filter(Boolean);

// =========================
// 🧠 PARSE GAME + SCORE
// =========================
let gameId = "";
let homeTeam = "";
let awayTeam = "";
let homeScore = 0;
let awayScore = 0;

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

gameId = String(gameId).trim();

if (!gameId) return interaction.editReply("❌ Missing Game ID.");
if (!homeTeam || !awayTeam) return interaction.editReply("❌ Invalid score format.");

const winner = homeScore > awayScore ? homeTeam : awayTeam;

// =========================
// 🔗 LINKED PLAYERS
// =========================
const linked = await getSheetValues("Linked Players!A:C");

function normalize(str) {
return String(str).toLowerCase().trim();
}

function isLinked(player) {
return linked.some(row => normalize(row[2]) === normalize(player));
}

const masterRows = [];
const unlinkedRows = [];


// =========================
// 🏒 PARSE STATS
// =========================
let section = "";
let currentTeam = "";

for (const line of lines) {

if (line === "SKATERS") {
section = "skaters";
continue;
}

if (line === "GOALIES") {
section = "goalies";
continue;
}

if (!line.includes(":")) {
currentTeam = line;
continue;
}

const [name, stats] = line.split(":").map(s => s.trim());

// =====================
// 🏒 SKATERS
// =====================
if (section === "skaters") {

let goals = 0, assists = 0, bs = 0, ta = 0, int = 0;

const g = stats.match(/(\d+)G/i);
const a = stats.match(/(\d+)A/i);
const b = stats.match(/(\d+)BS/i);
const t = stats.match(/(\d+)TA/i);
const i = stats.match(/(\d+)INT/i);

if (g) goals = Number(g[1]);
if (a) assists = Number(a[1]);
if (b) bs = Number(b[1]);
if (t) ta = Number(t[1]);
if (i) int = Number(i[1]);

masterRows.push([
gameId, name, currentTeam,
goals, assists, bs, ta, int,
"", "", "", "", ""
]);

if (!skaterOutput[currentTeam]) skaterOutput[currentTeam] = [];

let lineText = `${name}:`;
if (goals) lineText += ` ${goals}G`;
if (assists) lineText += ` ${assists}A`;
if (bs) lineText += ` ${bs}BS`;
if (ta) lineText += ` ${ta}TA`;
if (int) lineText += ` ${int}INT`;

skaterOutput[currentTeam].push(lineText);

if (!isLinked(name)) {
unlinkedRows.push([gameId, name, currentTeam]);
}
}

// =====================
// 🥅 GOALIES
// =====================
if (section === "goalies") {

const saveMatch = stats.match(/(\d+)\/(\d+)/);

let saves = 0;
let shots = 0;

if (saveMatch) {
saves = Number(saveMatch[1]);
shots = Number(saveMatch[2]);
}

const isWin = stats.includes("W");
const isLoss = stats.includes("L");

masterRows.push([
gameId, name, currentTeam,
"", "", "", "", "",
saves, shots,
isWin ? 1 : 0,
isLoss ? 1 : 0,
0
]);

if (!goalieOutput[currentTeam]) goalieOutput[currentTeam] = [];
goalieOutput[currentTeam].push(`${name}: ${stats}`);

if (!isLinked(name)) {
unlinkedRows.push([gameId, name, currentTeam]);
}
}
}

// =========================
// 📝 WRITE DATA
// =========================
if (masterRows.length) {
await appendSheetValues("Master Stats!A:M", masterRows);
}

if (unlinkedRows.length) {
await appendSheetValues("Unlinked Players!A:C", unlinkedRows);
}

await appendSheetValues("Game Results!A2:F", [
[gameId, homeTeam, awayTeam, homeScore, awayScore, winner]
]);

// =========================
// 📅 UPDATE SCHEDULE
// =========================
const schedule = await getSheetValues("Schedule!A2:I");

for (let i = 0; i < schedule.length; i++) {
const row = schedule[i];
const rowGameId = String(row[1]).replace(/[^0-9]/g, "").trim();

if (rowGameId === gameId) {
row[5] = homeScore;
row[6] = awayScore;
row[7] = "FINAL";

await updateSheetValues(`Schedule!A${i + 2}:I${i + 2}`, [row]);
break;
}
}

// =========================
// 📊 STANDINGS
// =========================
await rebuildStandings();


// =========================
// 🏒 POST GAME RESULT (TEXT)
// =========================
try {
const channel = await interaction.client.channels.fetch(GAME_RESULTS_CHANNEL_ID);

let post = `🏒 **Game ${gameId} Final**\n\n`;
post += `**${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}**\n\n`;

post += `**SKATERS**\n`;
for (const team in skaterOutput) {
post += `\n${team}\n`;
skaterOutput[team].forEach(p => post += `${p}\n`);
}

post += `\n**GOALIES**\n`;
for (const team in goalieOutput) {
post += `\n${team}\n`;
goalieOutput[team].forEach(g => post += `${g}\n`);
}

await channel.send(post);

} catch (err) {
console.error("GAME RESULT ERROR:", err);
}


// =========================
// 📊 POST STANDINGS (IMAGE)
// =========================
try {
await postStandings(interaction.client);
} catch (err) {
console.error("STANDINGS ERROR:", err);
}


// =========================
// 🏆 POST LEADERS (IMAGE)
// =========================
try {
await postStatLeaders(interaction.client);
} catch (err) {
console.error("LEADERS ERROR:", err);
}

const gameChannel = await interaction.client.channels.fetch(GAME_RESULTS_CHANNEL_ID);




return interaction.editReply("✅ Game recorded & posted.");  
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

standings.sort((a, b) => b[5] - a[5]);

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


async function handleNotifyUnlinked(interaction) {
  await interaction.reply("⏳ Checking unlinked players...");

  const rows = await getSheetValues("Unlinked Players!A2:C1000");

  if (!rows.length) {
    return interaction.editReply("✅ No unlinked players logged.");
  }

  const uniquePlayers = [];
  const seen = new Set();

  rows.forEach((row) => {
    const name = row[1];
    const team = row[2];
    if (!name) return;

    const key = normalize(name);

    if (!seen.has(key)) {
      seen.add(key);
      uniquePlayers.push({ name, team });
    }
  });

  const message =
    `⚠️ **Incorrect Team Listings Found**\n\n` +
    `The following players were found to not be linked to the bot:\n\n` +
    uniquePlayers
      .map(
        (p) => `• ${p.name}, played a game with ${p.team || "Unknown Team"}.`,
      )
      .join("\n") +
    `\n\nPlease tell them to run:\n/linkplayer player: TheirName`;

  return interaction.editReply(message);
}

async function getTeams() {
  const rows = await getSheetValues("Standings!K1:K50");
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
if (!value && value !== 0) continue;

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

// IMAGE replacements (FIXED LOOP)
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

await slides.presentations.batchUpdate({
presentationId: templateId,
requestBody: { requests },
});

await new Promise((r) => setTimeout(r, 800));

const thumb = await slides.presentations.pages.getThumbnail({
presentationId: templateId,
pageObjectId: tempSlideId,
"thumbnailProperties.mimeType": "PNG",
"thumbnailProperties.thumbnailSize": "LARGE",
});

const imageRes = await fetch(thumb.data.contentUrl);
const arrayBuffer = await imageRes.arrayBuffer();

return Buffer.from(arrayBuffer);

} catch (err) {
console.error("IMAGE ERROR:", err);
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



await slides.presentations.batchUpdate({
presentationId: templateId,
requestBody: { requests },
});

await new Promise((r) => setTimeout(r, 800));

const thumb = await slides.presentations.pages.getThumbnail({
presentationId: templateId,
pageObjectId: tempSlideId,
"thumbnailProperties.mimeType": "PNG",
"thumbnailProperties.thumbnailSize": "LARGE",
});

const imageRes = await fetch(thumb.data.contentUrl);
const arrayBuffer = await imageRes.arrayBuffer();

return Buffer.from(arrayBuffer);

} catch (err) {
console.error("IMAGE ERROR:", err);
throw err;

} finally {
await slides.presentations.batchUpdate({
presentationId: templateId,
requestBody: {
requests: [
{
deleteObject: {
objectId: `TEMP_${Date.now()}`,
},
},
],
},
}).catch(() => {});
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
return handleGameResults(interaction);
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

const { handleGameResults } = createGameResults({
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
});

client.login(process.env.DISCORD_TOKEN);
