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

async function postStandings(client) {
const rows = await getSheetValues("Standings!K1:S12");
if (!rows.length) return;

const rep = {};
const img = {};

for (let i = 0; i < 12; i++) {
const r = rows[i] || [];

rep[`TEAM${i+1}`] = r[0] || "";
rep[`PT${i+1}`] = r[5] || "0";

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

async function postStatLeaders(client) {
const rows = await getSheetValues("Player Stats!A2:I1000");
if (!rows.length) return;

const players = rows.map(r => ({
name: r[0],
team: r[1],
pts: Number(r[5]) || 0
})).sort((a,b) => b.pts - a.pts);

const rep = {};
const img = {};

for (let i = 0; i < 5; i++) {
const p = players[i] || {};

rep[`PN${i+1}`] = p.name || "";
rep[`PP${i+1}`] = p.pts || "0";

if (TEAM_LOGOS[p.team]) {
img[`PLOGO${i+1}`] = TEAM_LOGOS[p.team];
}
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

async function handleGameResults(interaction) {
await interaction.deferReply();

const input = interaction.options.getString("input");

await appendSheetValues("Game Results!A2:F", [
[Date.now(), input]
]);

await postStandings(interaction.client);
await postStatLeaders(interaction.client);

return interaction.editReply("✅ Game recorded & posted.");
}

return {
handleGameResults
};
};
