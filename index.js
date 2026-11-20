const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = '1573249197312835705';
const START_ID = 520016;                    // first ID to check
const CHECK_DELAY_MS = 8000;                // 8 seconds between checks (safe)
const STATE_FILE = path.join(__dirname, 'last_id.json');

const ASSET_TYPES = {
  8: 'Hat',
  41: 'Hair',
  42: 'Face',
  43: 'Neck',
  44: 'Shoulder',
  45: 'Front',
  46: 'Back',
  47: 'Waist',
  18: 'Face',
  19: 'Gear',
  17: 'Head',
  27: 'Torso',
  28: 'Right Arm',
  29: 'Left Arm',
  30: 'Left Leg',
  31: 'Right Leg',
  2: 'T-Shirt',
  11: 'Shirt',
  12: 'Pants',
  3: 'Audio',
  10: 'Model',
  13: 'Decal',
  24: 'Animation',
  40: 'Mesh Part'
};

if (!TOKEN) {
  console.error('DISCORD_TOKEN is missing!');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function loadLastId() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return data.lastId || START_ID;
    }
  } catch (e) {}
  return START_ID;
}

function saveLastId(id) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ lastId: id }, null, 2));
  } catch (e) {
    console.error('Could not save lastId:', e.message);
  }
}

async function getAssetDetails(id) {
  try {
    const res = await fetch(`https://octane.wtf/apisite/economy/v2/assets/${id}/details`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'OctaneMonitor/1.0' },
      timeout: 10000
    });

    if (res.status === 404) return { exists: false };
    if (!res.ok) return { exists: false, error: res.status };

    const data = await res.json();

    // empty / no real item
    if (!data || !data.Name || !data.Creator) {
      return { exists: false };
    }

    return {
      exists: true,
      id: data.AssetId || id,
      name: data.Name || 'Unknown',
      description: data.Description || 'No description',
      type: ASSET_TYPES[data.AssetTypeId] || `Type ${data.AssetTypeId}`,
      updated: data.Updated ? new Date(data.Updated).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }) : 'Unknown',
      creatorName: data.Creator?.Name || '',
      creatorId: data.Creator?.Id || data.Creator?.CreatorTargetId || 0,
      price: data.PriceInRobux
    };
  } catch (err) {
    console.error(`Error checking ${id}:`, err.message);
    return { exists: false, error: true };
  }
}

async function sendEmbed(channel, item) {
  const embed = new EmbedBuilder()
    .setColor(0x9B59B6) // purple
    .setTitle(item.name)
    .setURL(`https://octane.wtf/catalog/${item.id}`)
    .addFields(
      { name: 'Type', value: item.type, inline: true },
      { name: 'Updated', value: item.updated, inline: true },
      { name: 'Description', value: item.description.slice(0, 1000) || '—' }
    )
    .setFooter({ text: `Asset ID: ${item.id}` })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  console.log(`→ Sent new Octane item: ${item.name} (${item.id})`);
}

async function loop() {
  let currentId = loadLastId();
  console.log(`Starting monitor from ID ${currentId}`);

  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) {
    console.error('Cannot find channel', CHANNEL_ID);
    return;
  }

  while (true) {
    const result = await getAssetDetails(currentId);

    if (result.exists) {
      // real item found
      if (result.creatorName === 'Octane' || result.creatorId === 1) {
        await sendEmbed(channel, result);
      } else {
        console.log(`ID ${currentId} exists but not by Octane (${result.creatorName})`);
      }
      // move to next ID
      currentId++;
      saveLastId(currentId);
    } else {
      // no item (or error) → we are at the current end of catalog
      // stay on the same ID and keep checking until a new one appears
      console.log(`ID ${currentId} not found yet – waiting for new uploads...`);
      // do NOT increment
    }

    await new Promise(r => setTimeout(r, CHECK_DELAY_MS));
  }
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  loop().catch(console.error);
});

client.login(TOKEN);