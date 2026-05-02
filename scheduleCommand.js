const {
ActionRowBuilder,
StringSelectMenuBuilder,
AttachmentBuilder,
} = require("discord.js");

const { google } = require("googleapis");
const fs = require("fs");

const SHEET_NAME = "Schedule";

const auth = new google.auth.GoogleAuth({
credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
scopes: [
"https://www.googleapis.com/auth/spreadsheets",
"https://www.googleapis.com/auth/presentations",
],
});

const slides = google.slides({ version: "v1", auth });

function normalize(value) {
return String(value || "").trim().toLowerCase();
}

function getTemplateId() {
return (
process.env.SCHEDULE_TEMPLATE_ID ||
process.env.TEMPLATE_ID ||
process.env.TEMPLATE_PRESENTATION_ID
);
}

// =========================
// 🎯 MAIN MENU
// =========================
async function handleSchedule(interaction) {
try {
const teams = [
"Buffalo Sabres",
"Fort Erie Hawks",
"Montreal Canadiens",
"Super Cobras",
"Toronto Marlies",
"Toronto Maple Leafs",
];

const menu = new StringSelectMenuBuilder()
.setCustomId("schedule_team_select")
.setPlaceholder("Select a team")
.addOptions(
teams.map((team) => ({
label: team,
value: team,
}))
);

const row = new ActionRowBuilder().addComponents(menu);

return interaction.reply({
content: "Select a team to generate their schedule:",
components: [row],
});
} catch (err) {
console.error("Schedule menu error:", err);
return safeReply(
interaction,
"Schedule menu failed, but the bot is still working."
);
}
}

// =========================
// 📅 TEAM SCHEDULE
// =========================
async function handleScheduleTeamSelect(
interaction,
sheets,
SPREADSHEET_ID
) {
let newSlideId = null;
let presentationId = null;

try {
await interaction.deferUpdate();

const selectedTeam = interaction.values[0];
const templateId = getTemplateId();

if (!templateId) {
return interaction.editReply({
content:
"Missing template secret. Use TEMPLATE_ID or SCHEDULE_TEMPLATE_ID.",
components: [],
});
}

presentationId = templateId;

// =========================
// 📊 LOAD SCHEDULE
// =========================
const scheduleRes = await sheets.spreadsheets.values.get({
spreadsheetId: SPREADSHEET_ID,
range: `${SHEET_NAME}!A2:I`,
});

const scheduleRows = scheduleRes.data.values || [];

// =========================
// 🏁 LOAD RESULTS
// =========================
const resultsRes = await sheets.spreadsheets.values.get({
spreadsheetId: SPREADSHEET_ID,
range: "Game Results!A2:F",
});

const results = resultsRes.data.values || [];

function findResult(home, away) {
return results.find(
(r) =>
normalize(r[1]) === normalize(home) &&
normalize(r[2]) === normalize(away)
);
}

// =========================
// 🎮 BUILD GAME LIST
// =========================
const games = [];

for (const row of scheduleRows) {
const home = row[3];
const away = row[4];

if (!home || !away) continue;

if (
normalize(home) === normalize(selectedTeam) ||
normalize(away) === normalize(selectedTeam)
) {
const result = findResult(home, away);

if (result) {
const homeScore = result[3];
const awayScore = result[4];

games.push(
`${home}\n${away}\n${homeScore}-${awayScore} FINAL`
);
} else {
games.push(
`${home}\n${away}\nUPCOMING`
);
}
}
}

// =========================
// 🖼️ CREATE SLIDE
// =========================
const presentation = await slides.presentations.get({
presentationId,
});

const templateSlideId = presentation.data.slides[0].objectId;

const duplicate = await slides.presentations.batchUpdate({
presentationId,
requestBody: {
requests: [
{
duplicateObject: {
objectId: templateSlideId,
},
},
],
},
});

newSlideId = duplicate.data.replies[0].duplicateObject.objectId;

// =========================
// ✏️ REPLACE TEXT
// =========================
const requests = [
{
replaceAllText: {
containsText: {
text: "{{TEAM}}",
matchCase: true,
},
replaceText: selectedTeam,
pageObjectIds: [newSlideId],
},
},
];

for (let i = 1; i <= 40; i++) {
requests.push({
replaceAllText: {
containsText: {
text: `{{GAME${i}}}`,
matchCase: true,
},
replaceText: games[i - 1] || "",
pageObjectIds: [newSlideId],
},
});
}

await slides.presentations.batchUpdate({
presentationId,
requestBody: { requests },
});

await new Promise((resolve) => setTimeout(resolve, 800));

// =========================
// 📸 EXPORT IMAGE
// =========================
const thumb = await slides.presentations.pages.getThumbnail({
presentationId,
pageObjectId: newSlideId,
"thumbnailProperties.mimeType": "PNG",
"thumbnailProperties.thumbnailSize": "LARGE",
});

const imageRes = await fetch(thumb.data.contentUrl);
const buffer = Buffer.from(await imageRes.arrayBuffer());

const filePath = `/tmp/${selectedTeam.replace(
/[^a-z0-9]/gi,
"_"
)}_schedule.png`;

fs.writeFileSync(filePath, buffer);

const attachment = new AttachmentBuilder(filePath);

await interaction.editReply({
content: `**${selectedTeam} Schedule**`,
files: [attachment],
components: [],
});

await deleteTempSlide(presentationId, newSlideId);
} catch (err) {
console.error("Schedule dropdown error:", err);

if (presentationId && newSlideId) {
await deleteTempSlide(presentationId, newSlideId);
}

return safeReply(
interaction,
"Schedule failed after selecting the team, but the bot is still working."
);
}
}

// =========================
// 🧹 CLEANUP
// =========================
async function deleteTempSlide(presentationId, slideId) {
try {
await slides.presentations.batchUpdate({
presentationId,
requestBody: {
requests: [
{
deleteObject: {
objectId: slideId,
},
},
],
},
});
} catch (err) {
console.error("Could not delete temp slide:", err);
}
}

async function safeReply(interaction, message) {
try {
if (interaction.deferred || interaction.replied) {
return interaction.editReply({
content: message,
components: [],
});
}

return interaction.reply({
content: message,
ephemeral: true,
});
} catch (err) {
console.error("Safe reply failed:", err);
}
}

module.exports = {
handleSchedule,
handleScheduleTeamSelect,
};
