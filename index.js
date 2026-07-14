// ============================================================
// TIKI BAR ASSISTENT
// Grundlage: CaffeeContainer-Bot
// ============================================================

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const {
  Client,
  GatewayIntentBits,
  ActivityType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  REST,
  Routes,
  SlashCommandBuilder,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");

const { Pool } = require("pg");

// ============================================================
// UMGEBUNGSVARIABLEN
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const DATABASE_URL = process.env.DATABASE_URL;

const REQUIRED_ENV_KEYS = {
  DISCORD_TOKEN: TOKEN,
  CLIENT_ID,
  GUILD_ID,
};

for (const [key, value] of Object.entries(REQUIRED_ENV_KEYS)) {
  if (!value) {
    throw new Error(`❌ Die Umgebungsvariable ${key} fehlt in der .env-Datei.`);
  }
}

// ============================================================
// TIKI-BAR-KONFIGURATION
// ============================================================

const CONFIG = Object.freeze({
  guildId: GUILD_ID,

  branding: {
    name: "Tiki Bar",
    botNickname: "Tiki Assistent",
    emoji: "🍸",
    color: 0x64d8ff,
    footer: "Tiki Bar • Managementsystem",
  },

  roles: {
    owner: "1526427753740767358",
    deputyOwner: "1526427753740767356",

    management: [
      "1526427753707081755",
      "1526427753707081756",
    ],

    employee: "1526427753707081750",
    probationEmployee: "1526427753707081749",

    citizen: [
      "1526427753690431639",
      "1526427753690431634",
    ],

    registration: [
      "1526427753690431639",
      "1526427753690431634",
      "1526427753690431633",
    ],

    warning1: "1526427753690431632",
    warning2: "1526427753690431631",

    onDuty: "1526427753740767359",
  },

  channels: {
    registrationPanel: "1526427758903820383",
    employeePanel: "1526427758622670882",
    managementPanel: "1526427759071465564",
    dashboard: "1526427759071465566",

    foodbusinessTimeSource: "1526427759071465567",
    foodbusinessMoneySource: "1526427759071465568",
    tikiDutyLogs: "1526427759071465569",

    welcome: "1526427758903820382",
    leave: "1526427758903820384",
    generalLogs: "1526427759352742026",

    absences: "1526427758622670883",
    shopping: "1526427758622670885",
    applications: null,
    houseBans: "1526427758622670886",

    teamUpdates: "1526427758358433879",
    training: "1526427759352742018",
    personalFiles: "1526427759352742021",
  },

  settings: {
    timezone: "Europe/Berlin",
    leaderboardPageSize: 7,
    statusIntervalMs: 5_000,
  },
});

// ============================================================
// DISCORD-CLIENT
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Entwürfe für mehrstufige Aktionen
const managementDrafts = new Map();
const dutyCorrectionDrafts = new Map();
const timeManagementDrafts = new Map();

// ============================================================
// DATENBANK
// ============================================================

let pool = null;

function getPool() {
  if (!DATABASE_URL) {
    throw new Error(
      "DATABASE_URL fehlt. Die PostgreSQL-Datenbank wurde noch nicht eingerichtet."
    );
  }

  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    });

    pool.on("error", (error) => {
      console.error("❌ Unerwarteter PostgreSQL-Fehler:", error);
    });
  }

  return pool;
}

async function query(sql, params = []) {
  return getPool().query(sql, params);
}

async function testDatabaseConnection() {
  if (!DATABASE_URL) {
    return {
      connected: false,
      text: "Noch nicht eingerichtet",
    };
  }

  try {
    await query("SELECT NOW();");

    return {
      connected: true,
      text: "Verbunden",
    };
  } catch (error) {
    console.error("❌ Datenbankverbindung fehlgeschlagen:", error);

    return {
      connected: false,
      text: "Verbindung fehlgeschlagen",
    };
  }
}

// ============================================================
// BERECHTIGUNGEN
// ============================================================

function hasAnyRole(member, roleIds) {
  if (!member?.roles?.cache) return false;

  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

function hasOwnerRole(member) {
  return hasAnyRole(member, [
    CONFIG.roles.owner,
    CONFIG.roles.deputyOwner,
  ]);
}

function hasManagementRole(member) {
  return hasAnyRole(member, CONFIG.roles.management);
}

function canManagePersonal(member) {
  return hasOwnerRole(member) || hasManagementRole(member);
}

function canCreatePanels(member) {
  return canManagePersonal(member);
}

function isEmployee(member) {
  return hasAnyRole(member, [
    CONFIG.roles.employee,
    CONFIG.roles.probationEmployee,
    CONFIG.roles.owner,
    CONFIG.roles.deputyOwner,
    ...CONFIG.roles.management,
  ]);
}

function canUseDutyCorrection(member) {
  return canManagePersonal(member);
}

// ============================================================
// ALLGEMEINE HELFER
// ============================================================

function draftKey(userId, type) {
  return `${userId}:${type}`;
}

function formatName(rawName) {
  return String(rawName || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => {
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function normalizeName(rawName) {
  return String(rawName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9äöüß ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMinutes(minutes) {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(safeMinutes / 60);
  const restMinutes = safeMinutes % 60;

  return `${hours} Stunden & ${restMinutes} Minuten`;
}

function formatShortMinutes(minutes) {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(safeMinutes / 60);
  const restMinutes = safeMinutes % 60;

  return `${hours} Std. ${restMinutes} Min.`;
}

function parseGermanDate(input) {
  const match = String(input || "")
    .trim()
    .match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);

  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCDate() !== day ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCFullYear() !== year
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
}

function createBaseEmbed() {
  return new EmbedBuilder()
    .setColor(CONFIG.branding.color)
    .setFooter({
      text: CONFIG.branding.footer,
    })
    .setTimestamp();
}

async function getTextChannel(channelId) {
  if (!channelId) return null;

  const channel = await client.channels.fetch(channelId).catch(() => null);

  if (!channel?.isTextBased()) {
    return null;
  }

  return channel;
}

async function sendGeneralLog(embed) {
  const channel = await getTextChannel(CONFIG.channels.generalLogs);

  if (!channel) return;

  await channel.send({ embeds: [embed] }).catch((error) => {
    console.error("❌ Allgemeiner Log konnte nicht gesendet werden:", error);
  });
}

// ============================================================
// BOT-STATUS
// ============================================================

const BOT_STATUSES = [
  "Made by Kquwi☦",
  "Tiki Bar 🍸",
];

let currentStatusIndex = 0;
let statusInterval = null;

function updateBotStatus() {
  if (!client.user) return;

  const statusText = BOT_STATUSES[currentStatusIndex];

  client.user.setPresence({
    activities: [
      {
        name: statusText,
        type: ActivityType.Watching,
      },
    ],
    status: "online",
  });

  currentStatusIndex =
    (currentStatusIndex + 1) % BOT_STATUSES.length;
}

function startStatusRotation() {
  if (statusInterval) {
    clearInterval(statusInterval);
  }

  updateBotStatus();

  statusInterval = setInterval(
    updateBotStatus,
    CONFIG.settings.statusIntervalMs
  );
}

// ============================================================
// SLASH-COMMANDS
// ============================================================

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("mitarbeiterpanel")
      .setDescription("Sendet das Tiki-Bar-Mitarbeiterpanel."),

    new SlashCommandBuilder()
      .setName("managementpanel")
      .setDescription("Sendet das Tiki-Bar-Managementpanel."),

    new SlashCommandBuilder()
      .setName("registrierungspanel")
      .setDescription("Sendet das Tiki-Bar-Registrierungspanel."),

    new SlashCommandBuilder()
      .setName("dashboard")
      .setDescription("Aktualisiert das Mitarbeiter-Dashboard."),

    new SlashCommandBuilder()
      .setName("akte")
      .setDescription("Sendet die Personalakte eines Mitarbeiters.")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("Mitarbeiter auswählen")
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("personalnotiz")
      .setDescription("Fügt eine interne Personalnotiz hinzu.")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("Mitarbeiter auswählen")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("notiz")
          .setDescription("Interne Notiz")
          .setMaxLength(1000)
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("mitarbeitercheck")
      .setDescription("Analysiert die Daten eines Mitarbeiters.")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("Mitarbeiter auswählen")
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("dienst-korrektur")
      .setDescription(
        "Korrigiert einen aktiven Dienst bei Crash oder vergessenem Ausstempeln."
      )
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("Mitarbeiter auswählen")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("endzeit")
          .setDescription(
            "Endzeit, zum Beispiel 19:30 oder 14.07.2026 19:30"
          )
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("grund")
          .setDescription("Grund, zum Beispiel Crash")
          .setMaxLength(300)
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("dienst-reset")
      .setDescription(
        "Notfall-Reset für aktive Dienste und Im-Dienst-Rollen."
      ),

    new SlashCommandBuilder()
      .setName("verwarnungen-sync")
      .setDescription(
        "Synchronisiert Verwarnungen mit den Discord-Rollen."
      ),

    new SlashCommandBuilder()
      .setName("statuscheck")
      .setDescription(
        "Prüft Bot, Datenbank, Kanäle und wichtige Systeme."
      ),

    new SlashCommandBuilder()
      .setName("bot-hilfe")
      .setDescription("Zeigt die wichtigsten Funktionen des Bots."),

    new SlashCommandBuilder()
      .setName("bot-cleanup")
      .setDescription("Bereinigt alte und verwaiste Bot-Daten."),
  ].map((command) => command.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    {
      body: commands,
    }
  );

  console.log(`✅ ${commands.length} Slash-Commands registriert.`);
}

// ============================================================
// VORLÄUFIGER INTERACTION-HANDLER
// Die vollständigen Panels und Funktionen kommen im nächsten Teil.
// ============================================================

client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "statuscheck") {
      const databaseStatus = await testDatabaseConnection();

      const embed = createBaseEmbed()
        .setTitle("🍸・TIKI ASSISTENT STATUS")
        .setDescription(
          "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
            `🤖 **Discord-Bot**\n└ Online\n\n` +
            `🗄️ **Datenbank**\n└ ${databaseStatus.text}\n\n` +
            `📡 **Foodbusiness-Quelle**\n└ <#${CONFIG.channels.foodbusinessTimeSource}>\n\n` +
            `📋 **Dienstlogs**\n└ <#${CONFIG.channels.tikiDutyLogs}>\n` +
            "━━━━━━━━━━━━━━━━━━━━━━━━"
        );

      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    }

    if (interaction.commandName === "bot-hilfe") {
      const embed = createBaseEmbed()
        .setTitle("🍸・TIKI ASSISTENT HILFE")
        .setDescription(
          "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
            "👥 **Mitarbeiterverwaltung**\n" +
            "└ Registrierung, Abmeldungen, Einkäufe und Hausverbote\n\n" +
            "🛠️ **Managementsystem**\n" +
            "└ Verwarnungen, Teamupdates, Kündigungen und Einweisungen\n\n" +
            "⏱️ **Dienstsystem**\n" +
            "└ Automatische Foodbusiness-Erkennung\n\n" +
            "🔧 **Dienstkorrektur**\n" +
            "└ `/dienst-korrektur`\n" +
            "━━━━━━━━━━━━━━━━━━━━━━━━"
        );

      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    }

    if (
      !canManagePersonal(interaction.member) &&
      [
        "managementpanel",
        "registrierungspanel",
        "dashboard",
        "akte",
        "personalnotiz",
        "mitarbeitercheck",
        "dienst-korrektur",
        "dienst-reset",
        "verwarnungen-sync",
        "bot-cleanup",
      ].includes(interaction.commandName)
    ) {
      return interaction.reply({
        content: "❌ Du darfst diese Funktion nicht benutzen.",
        ephemeral: true,
      });
    }

    return interaction.reply({
      content:
        "🍸 Das Grundsystem ist online. Diese Funktion wird im nächsten Index-Teil aktiviert.",
      ephemeral: true,
    });
  } catch (error) {
    console.error("❌ Fehler bei einer Interaction:", error);

    const payload = {
      content:
        "❌ Bei der Verarbeitung ist ein unerwarteter Fehler aufgetreten.",
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }
  }
});

// ============================================================
// BOT BEREIT
// ============================================================

client.once("clientReady", async () => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✅ Eingeloggt als ${client.user.tag}`);
  console.log(`🍸 Projekt: ${CONFIG.branding.name}`);
  console.log(`🏠 Server-ID: ${CONFIG.guildId}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    await registerCommands();
  } catch (error) {
    console.error("❌ Slash-Commands konnten nicht registriert werden:", error);
  }

  const guild = await client.guilds
    .fetch(CONFIG.guildId)
    .catch(() => null);

  if (!guild) {
    console.error("❌ Der Tiki-Bar-Server wurde nicht gefunden.");
    return;
  }

  const botMember = await guild.members
    .fetchMe()
    .catch(() => null);

  if (botMember) {
    await botMember
      .setNickname(CONFIG.branding.botNickname)
      .catch((error) => {
        console.warn(
          "⚠️ Bot-Nickname konnte nicht gesetzt werden:",
          error.message
        );
      });
  }

  startStatusRotation();

  if (!DATABASE_URL) {
    console.warn(
      "⚠️ DATABASE_URL ist noch leer. Discord-Grundsystem läuft trotzdem."
    );
  }
});

// ============================================================
// FEHLERBEHANDLUNG
// ============================================================

client.on("error", (error) => {
  console.error("❌ Discord-Client-Fehler:", error);
});

client.on("warn", (warning) => {
  console.warn("⚠️ Discord-Warnung:", warning);
});

process.on("unhandledRejection", (error) => {
  console.error("❌ Unbehandelte Promise-Ablehnung:", error);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Unbehandelter Programmfehler:", error);
});

// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN);
