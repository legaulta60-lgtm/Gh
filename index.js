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

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      if (interaction.commandName === "teamstats") {
        const focused = interaction.options.getFocused().toLowerCase();
        const teams = await getTeams();

        const choices = teams
          .filter((team) => team.toLowerCase().includes(focused))
          .slice(0, 25)
          .map((team) => ({ name: team, value: team }));

        return interaction.respond(choices);
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "schedule_team_select") {
        return handleScheduleTeamSelect(
          interaction,
          sheets,
          process.env.SHEET_ID,
        );
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    // PUBLIC COMMANDS
    if (interaction.commandName === "linkplayer") {
      return handleLinkPlayer(interaction);
    }

    if (interaction.commandName === "mystats") {
      return handleMyStats(interaction);
    }

    if (interaction.commandName === "teamstats") {
      return handleTeamStats(interaction);
    }

    if (interaction.commandName === "schedule") {
      return handleSchedule(interaction, sheets, process.env.SHEET_ID);
    }

    // 🔒 ADMIN ONLY
    if (interaction.commandName === "standings") {
      if (!isAdmin(interaction)) {
        return interaction.reply({
          content: "❌ You don't have permission to use this command.",
          ephemeral: true,
        });
      }
      return handleStandings(interaction);
    }

    if (interaction.commandName === "statleaders") {
      if (!isAdmin(interaction)) {
        return interaction.reply({
          content: "❌ You don't have permission to use this command.",
          ephemeral: true,
        });
      }
      return handleStatLeaders(interaction);
    }

    if (interaction.commandName === "gameresults") {
      if (!isAdmin(interaction)) {
        return interaction.reply({
          content: "❌ You don't have permission to use this command.",
          ephemeral: true,
        });
      }
      return handleGameResults(interaction);
    }

    if (interaction.commandName === "notifyunlinked") {
      if (!isAdmin(interaction)) {
        return interaction.reply({
          content: "❌ You don't have permission to use this command.",
          ephemeral: true,
        });
      }
      return handleNotifyUnlinked(interaction);
    }
  } catch (err) {
    console.error("FULL ERROR:", err);

    const errorMessage = err?.message || String(err);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(
        `Something went wrong:\n\`\`\`${errorMessage}\`\`\``,
      );
    } else {
      await interaction.reply(
        `Something went wrong:\n\`\`\`${errorMessage}\`\`\``,
      );
    }
  }
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

  const image = await createImageFromTemplate(
    process.env.MYSTATS_TEMPLATE_ID,
    replacements,
    "mystats.png",
    imageReplacements,
  );

  const file = new AttachmentBuilder(image, { name: "mystats.png" });

  return interaction.editReply({
    content: `**${playerName} Stats**`,
    files: [file],
  });
}

async function handleTeamStats(interaction) {
  await interaction.deferReply();

  const teamName = interaction.options.getString("team").trim();


  const standings = await getSheetValues("Standings!K1:S50");
  const team = standings.find(
    (row) => normalize(row[0]) === normalize(teamName),
  );

  if (!team) {
    return interaction.editReply("Team not found.");
  }

  const playerRows = await getSheetValues("Player Stats!A2:K1000");

  const teamPlayers = playerRows
    .filter((row) => normalize(row[1]) === normalize(team[0]))
    .sort((a, b) => num(b[5]) - num(a[5]))
    .slice(0, 3);

  const replacements = {
    TEAM: team[0] || "",
    W: team[2] || "0",
    L: team[3] || "0",
    OTL: team[4] || "0",
    PTS: team[5] || "0",
    GF: team[6] || "0",
    GA: team[7] || "0",
    DF: team[8] || "0",
    TOP1: teamPlayers[0]?.[0] || "",
    TOP1PTS: teamPlayers[0]?.[5] || "0",
    TOP2: teamPlayers[1]?.[0] || "",
    TOP2PTS: teamPlayers[1]?.[5] || "0",
    TOP3: teamPlayers[2]?.[0] || "",
    TOP3PTS: teamPlayers[2]?.[5] || "0",
  };

  const imageReplacements = {};

  if (TEAM_LOGOS[team[0]]) {
    imageReplacements.TEAM_LOGO = TEAM_LOGOS[team[0]];
  }

  const image = await createImageFromTemplate(
    process.env.TEAMSTATS_TEMPLATE_ID,
    replacements,
    "teamstats.png",
    imageReplacements,
  );

  const file = new AttachmentBuilder(image, { name: "teamstats.png" });

  return interaction.editReply({
    content: `**${team[0]} Team Stats**`,
    files: [file],
  });
}

async function handleStandings(interaction) {
  await interaction.deferReply();

  const rows = await getSheetValues("Standings!K1:S12");

  if (!rows.length) {
    return interaction.editReply("No standings data found.");
  }

  const replacements = {};
  const imageReplacements = {};

  for (let i = 0; i < 12; i++) {
    const row = rows[i] || [];
    const teamName = row[0] || "";

    replacements[`TEAM${i + 1}`] = teamName;
    replacements[`GP${i + 1}`] = row[1] || "0";
    replacements[`W${i + 1}`] = row[2] || "0";
    replacements[`L${i + 1}`] = row[3] || "0";
    replacements[`OT${i + 1}`] = row[4] || "0";
    replacements[`PT${i + 1}`] = row[5] || "0";
    replacements[`GF${i + 1}`] = row[6] || "0";
    replacements[`GA${i + 1}`] = row[7] || "0";
    replacements[`DF${i + 1}`] = row[8] || "0";

    if (TEAM_LOGOS[teamName]) {
      imageReplacements[`LOGO${i + 1}`] = TEAM_LOGOS[teamName];
    }
  }

  const image = await createImageFromTemplate(
    process.env.STANDINGS_TEMPLATE_ID,
    replacements,
    "standings.png",
    imageReplacements,
  );

  const file = new AttachmentBuilder(image, { name: "standings.png" });

  return interaction.editReply({
    content: "**WHL Standings**",
    files: [file],
  });
}

async function handleStatLeaders(interaction) {
  await interaction.reply("📊 Generating stat leaders...");

  const playerRows = await getSheetValues("Player Stats!A2:I1000");
  const goalieRows = await getSheetValues("Goalie Stats!A2:K1000");

  if (!playerRows.length && !goalieRows.length) {
    return interaction.editReply("No stat data found.");
  }

  const players = playerRows.map((row) => ({
    Player: row[0],
    Team: row[1],
    G: num(row[3]),
    A: num(row[4]),
    PTS: num(row[5]),
    "Blocked Shots": num(row[6]),
    Takeaways: num(row[7]),
    Interceptions: num(row[8]),
  }));

  const goalies = goalieRows.map((row) => ({
    Player: row[0],
    Team: row[1],
    "SV%": num(row[8]),
    GAA: num(row[9]),
    Shutouts: num(row[10]),
  }));

  function getLeaders(arr, stat, count = 5, lowest = false) {
    return arr
      .filter((p) => p.Player)
      .sort((a, b) => (lowest ? a[stat] - b[stat] : b[stat] - a[stat]))
      .slice(0, count);
  }

  function getLogo(team) {
    if (!team) return null;

    const cleanTeam = normalize(team);

    for (const key in TEAM_LOGOS) {
      if (normalize(key) === cleanTeam) {
        return TEAM_LOGOS[key];
      }
    }

    console.log("NO LOGO MATCH FOR:", team); // DEBUG
    return null;
  }

  const replacements = {};
  const imageReplacements = {};

  function fill(prefix, list, stat, format = (v) => v) {
    for (let i = 0; i < 5; i++) {
      const p = list[i] || {};

      // TEXT
      replacements[`${prefix}N${i + 1}`] = p.Player || "";
      replacements[`${prefix}P${i + 1}`] =
        p[stat] !== undefined ? format(p[stat]) : "0";

      // 🔥 LOGOS (THIS IS THE FIX)
      if (p.Team) {
        const logo = getLogo(p.Team);
        if (logo) {
          imageReplacements[`${prefix}LOGO${i + 1}`] = logo;
        }
      }
    }
  }

  // SKATERS
  fill("P", getLeaders(players, "PTS"), "PTS");
  fill("G", getLeaders(players, "G"), "G");
  fill("A", getLeaders(players, "A"), "A");

  fill("B", getLeaders(players, "Blocked Shots"), "Blocked Shots");
  fill("T", getLeaders(players, "Takeaways"), "Takeaways");
  fill("I", getLeaders(players, "Interceptions"), "Interceptions");

  // GOALIES
  fill("SV", getLeaders(goalies, "SV%"), "SV%", (v) =>
    v === 0 ? "0.000" : Number(v).toFixed(3).replace(/^0/, ""),
  );

  const gaaLeaders = getLeaders(goalies, "GAA", 5, true);
  for (let i = 0; i < 5; i++) {
    const p = gaaLeaders[i] || {};
    replacements[`GNM${i + 1}`] = p.Player || "";
    replacements[`GAA${i + 1}`] =
      p.GAA !== undefined ? Number(p.GAA).toFixed(2) : "0.00";
  }

  for (let i = 0; i < 5; i++) {
    const p = gaaLeaders[i] || {};

    replacements[`GNM${i + 1}`] = p.Player || "";
    replacements[`GAA${i + 1}`] =
      p.GAA !== undefined ? Number(p.GAA).toFixed(2) : "0.00";

    if (p.Team) {
      const logo = getLogo(p.Team);
      if (logo) {
        imageReplacements[`GAALOGO${i + 1}`] = logo;
      }
    }
  }

  const gaaTop = gaaLeaders[0];
  if (gaaTop) {
    const logo = getLogo(gaaTop.Team);
    if (logo) {
      imageReplacements["GAALOGO1"] = logo;
    }
  }

  fill("SO", getLeaders(goalies, "Shutouts"), "Shutouts");

  const image = await createImageFromTemplate(
    process.env.LEADERS_TEMPLATE_ID,
    replacements,
    "statleaders.png",
    imageReplacements,
  );

  const file = new AttachmentBuilder(image, { name: "statleaders.png" });

  return interaction.editReply({
    content: "📊 **WHL Stat Leaders**",
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

if (!homeTeam || !awayTeam) {
return interaction.editReply("❌ Missing or invalid `Score:` line.");
}

const winner = homeScore > awayScore ? homeTeam : awayTeam;
const loser = homeScore > awayScore ? awayTeam : homeTeam;



// =========================
// 🏒 PARSE SKATERS
// =========================

let skaterRows = [];
const masterRows = [];

let currentSection = "";
let currentTeamName = "";

for (const line of lines) {
if (line === "SKATERS") {
currentSection = "skaters";
continue;
}

if (line === "GOALIES") {
currentSection = "";
continue;
}

if (currentSection === "skaters") {
// Team line
if (!line.includes(":")) {
currentTeamName = line;
continue;
}

// Player line
if (line.includes(":")) {
const [name, stats] = line.split(":").map(s => s.trim());

let goals = 0;
let assists = 0;

const gMatch = stats.match(/(\d+)G/i);
const aMatch = stats.match(/(\d+)A/i);

if (gMatch) goals = Number(gMatch[1]);
if (aMatch) assists = Number(aMatch[1]);

masterRows.push([
"",
name,
currentTeam,
g,
a,
0, // BS
0, // TA
0, // INT
"", // Saves ❗ MUST BE BLANK
"", // Shots ❗ MUST BE BLANK
"", // W
"", // L
"" // SO
]);
}
}
}

// =========================
// 📝 WRITE SKATERS TO MASTER STATS
// =========================

if (skaterRows.length > 0) {
await appendSheetValues("Master Stats!A:M", skaterRows);
}

  
// =========================
// 🥅 PARSE GOALIES
// =========================

let section = "";
let currentTeam = "";
let goalieW = "";
let goalieL = "";

for (const line of lines) {
if (line === "GOALIES") {
section = "goalies";
continue;
}

if (section === "goalies" && !line.includes(":")) {
currentTeam = line;
continue;
}

if (section === "goalies" && line.includes(":")) {
const [name, stats] = line.split(":").map(s => s.trim());

if (stats.includes("W")) {
goalieW = name;
}
if (stats.includes("L")) {
goalieL = name;
}
}

const linked = await getSheetValues("Linked Players!A:C");

function isLinked(player) {
return linked.some(row => normalize(row[2]) === normalize(player));
}

const unlinked = [];

if (goalieW && !isLinked(goalieW)) {
unlinked.push([gameId, goalieW, winner]);
}

if (goalieL && !isLinked(goalieL)) {
unlinked.push([gameId, goalieL, loser]);
}

if (unlinked.length > 0) {
await appendSheetValues("Unlinked Players!A:C", unlinked);
}  
masterRows.push([
"",
name,
currentTeam,
"", // G ❗ MUST BE BLANK
"", // A ❗ MUST BE BLANK
"", "", "",
saves,
shots,
result === "W" ? 1 : 0,
result === "L" ? 1 : 0,
0
]);

}

// =========================
// 📝 ADD TO GAME RESULTS TAB
// =========================

await appendSheetValues("Game Results!A2:F", [
[
gameId || "",
homeTeam,
awayTeam,
homeScore,
awayScore,
winner,
],
]);

// =========================
// 📊 UPDATE STANDINGS
// =========================

const standings = await getSheetValues("Standings!K1:S50");

function updateTeam(teamName, goalsFor, goalsAgainst, isWin) {
for (let i = 0; i < standings.length; i++) {
const row = standings[i];

if (normalize(row[0]) === normalize(teamName)) {
const gp = num(row[1]) + 1;
const w = num(row[2]) + (isWin ? 1 : 0);
const l = num(row[3]) + (isWin ? 0 : 1);
const otl = num(row[4]);
const pts = num(row[5]) + (isWin ? 2 : 0);
const gf = num(row[6]) + goalsFor;
const ga = num(row[7]) + goalsAgainst;
const df = gf - ga;

standings[i] = [teamName, gp, w, l, otl, pts, gf, ga, df];
}
}
}

updateTeam(homeTeam, homeScore, awayScore, homeScore > awayScore);
updateTeam(awayTeam, awayScore, homeScore, awayScore > homeScore);

standings.sort((a, b) => num(b[5]) - num(a[5]));

await updateSheetValues("Standings!K1:S50", standings);

// =========================
// 🥅 ADD GOALIES TO MASTER STATS
// =========================

const goalieRows = [];

if (goalieW) {
goalieRows.push([
gameId || "",
goalieW,
winner,
0,0,0,0,0,
0,0,
1,0,0,
]);
}

if (goalieL) {
goalieRows.push([
gameId || "",
goalieL,
loser,
0,0,0,0,0,
0,0,
0,1,0,
]);
}

if (goalieRows.length > 0) {
await appendSheetValues("Master Stats!A:M", goalieRows);
}

// =========================
// ✅ DONE
// =========================

return interaction.editReply(
`✅ Game recorded: **${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}**\n🥅 Goalies updated`
);
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
  imageReplacements = {},
) {
  const pres = await slides.presentations.get({
    presentationId: templateId,
  });

  const sourceSlideId = pres.data.slides[0].objectId;
  const tempSlideId = `TEMP_${Date.now()}`;

  const requests = [
{
duplicateObject: {
objectId: sourceSlideId,
objectIds: {
[sourceSlideId]: tempSlideId,
},
},
},
{
updateSlidesPosition: {
slideObjectIds: [tempSlideId],
insertionIndex: 0,
},
},
];

// ADD TEXT REPLACEMENTS
Object.entries(replacements).forEach(([key, value]) => {
requests.push({
replaceAllText: {
containsText: {
text: `{{${key}}}`,
matchCase: true,
},
replaceText: String(value ?? ""),
pageObjectIds: [tempSlideId],
},
});
});

// ADD IMAGE REPLACEMENTS
Object.entries(imageReplacements).forEach(([key, imageUrl]) => {
requests.push({
replaceAllShapesWithImage: {
containsText: {
text: `{{${key}}}`,
matchCase: true,
},
imageUrl,
replaceMethod: "CENTER_CROP",
pageObjectIds: [tempSlideId],
},
});
});
  

  try {
    await slides.presentations.batchUpdate({
      presentationId: templateId,
      requestBody: { requests },
    });

    await new Promise((resolve) => setTimeout(resolve, 800));

    const thumb = await slides.presentations.pages.getThumbnail({
      presentationId: templateId,
      pageObjectId: tempSlideId,
      "thumbnailProperties.mimeType": "PNG",
      "thumbnailProperties.thumbnailSize": "LARGE",
    });

    const imageRes = await fetch(thumb.data.contentUrl);
    const arrayBuffer = await imageRes.arrayBuffer();

    return Buffer.from(arrayBuffer);
  } finally {
    await slides.presentations
      .batchUpdate({
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
      })
      .catch(() => {});
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

client.login(process.env.DISCORD_TOKEN);
