// ============================================================
// TIKI BAR ASSISTENT – VOLLSTÄNDIGE INDEX
// Grundlage: aktuelles CaffeeContainer-System
// ============================================================

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const {
  Client,
  GatewayIntentBits,
  ActivityType,
  Events,
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
  ThreadAutoArchiveDuration,
} = require("discord.js");

const { Pool } = require("pg");

// ============================================================
// UMGEBUNGSVARIABLEN
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const DATABASE_URL = process.env.DATABASE_URL;

for (const [key, value] of Object.entries({
  DISCORD_TOKEN: TOKEN,
  CLIENT_ID,
  GUILD_ID,
  DATABASE_URL,
})) {
  if (!value) {
    throw new Error(`❌ Die Umgebungsvariable ${key} fehlt.`);
  }
}

// ============================================================
// BRANDING
// ============================================================

const BRAND = Object.freeze({
  name: "Tiki Bar",
  botNickname: "Tiki Assistent",
  emoji: "🍸",
  color: 0x64d8ff,
  footer: "Tiki Bar • Managementsystem",
});

// ============================================================
// ROLLEN
// ============================================================

const ROLES = Object.freeze({
  owner: "1526427753740767358",
  deputyOwner: "1526427753740767356",
  fullAccess: "1526427753740767355",

  // Management-Hierarchie
  probationManager: "1526427753707081754",
  management: [
    "1526427753707081755", // Manager
    "1526427753707081756", // Personal Manager
  ],

  // Automatisch mitzugebende Verwaltungsrolle
  managementAccess: "1526427753740767357",

  employee: "1526427753707081750",
  probationEmployee: "1526427753707081749",

  // Automatisch mit Mitarbeiter oder Probe-Mitarbeiter mitzugeben
  employeeAddon: "1526427753707081752",

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
});

const MANAGER_POSITION_ROLE_IDS = [
  ROLES.probationManager,
  ...ROLES.management,
];

const MANAGEMENT_ROLE_IDS = [
  ROLES.owner,
  ROLES.deputyOwner,
  ROLES.fullAccess,
  ...MANAGER_POSITION_ROLE_IDS,
];

// Nur diese beiden Rollen zählen im Dashboard als Mitarbeiter.
// Inhaber, Management und Vollzugriff werden nur dann mitgezählt,
// wenn sie zusätzlich eine dieser Mitarbeiterrollen besitzen.
const EMPLOYEE_ROLE_IDS = [
  ROLES.employee,
  ROLES.probationEmployee,
];

const TEAM_ROLE_IDS = [
  ...MANAGEMENT_ROLE_IDS,
  ...EMPLOYEE_ROLE_IDS,
];

// Bei einer Kündigung werden alle Team-, Zusatz-, Verwaltungs-,
// Verwarnungs- und Dienstrrollen entfernt.
const TERMINATION_REMOVE_ROLE_IDS = [
  ROLES.managementAccess,
  ROLES.management[1],
  ROLES.management[0],
  ROLES.probationManager,
  ROLES.employeeAddon,
  ROLES.employee,
  ROLES.probationEmployee,
  ROLES.warning1,
  ROLES.warning2,
  ROLES.onDuty,
];

// ============================================================
// KANÄLE
// ============================================================

const CHANNELS = Object.freeze({
  registrationPanel: "1526427758903820383",
  employeePanel: "1526427758622670882",
  managementPanel: "1526427759071465564",
  dashboard: "1526427759071465566",

  foodbusinessTimeSource: "1526427759071465567",
  foodbusinessMoneySource: "1526427759071465568",
  dutyLogs: "1526427759071465569",

  welcome: "1526427758903820382",
  leave: "1526427758903820384",
  generalLogs: "1526427759352742026",

  absences: "1526427758622670883",
  shopping: "1526427758622670885",

  // Solange kein eigener Bewerbungskanal vorhanden ist,
  // werden Bewerbungen im Teamupdate-Kanal ausgegeben.
  applications: "1526427758622670884",

  houseBans: "1526427758622670886",
  teamUpdates: "1526427758358433879",
  training: "1526427759352742018",
  personalFiles: "1526427759352742021",
});

// ============================================================
// EINSTELLUNGEN
// ============================================================

const SETTINGS = Object.freeze({
  timezone: "Europe/Berlin",
  statusIntervalMs: 5_000,
  dashboardIntervalMs: 2 * 60 * 1000,
  leaderboardPageSize: 7,
  staleDutyCheckIntervalMs: 10 * 60 * 1000,
  staleDutyAfterMs: 6 * 60 * 60 * 1000,
});

// ============================================================
// CLIENT UND DATENBANK
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

pool.on("error", (error) => {
  console.error("❌ Unerwarteter PostgreSQL-Fehler:", error);
});

async function query(sql, params = []) {
  return pool.query(sql, params);
}

async function withTransaction(callback) {
  const databaseClient = await pool.connect();

  try {
    await databaseClient.query("BEGIN");
    const result = await callback(databaseClient);
    await databaseClient.query("COMMIT");
    return result;
  } catch (error) {
    await databaseClient.query("ROLLBACK");
    throw error;
  } finally {
    databaseClient.release();
  }
}

// ============================================================
// ZWISCHENSPEICHER FÜR MEHRSTUFIGE AKTIONEN
// ============================================================

const managementDrafts = new Map();
const dutyCorrectionDrafts = new Map();
const timeManagementDrafts = new Map();

const leaderboardPages = {
  weekly: 0,
  total: 0,
};

// Verhindert, dass automatische Rollensynchronisierung während
// einer Kündigung oder eines Teamupdates Rollen wieder hinzufügt.
const roleSyncSuppressedUntil = new Map();

function suppressRoleSync(userId, durationMs = 8_000) {
  roleSyncSuppressedUntil.set(userId, Date.now() + durationMs);
}

function isRoleSyncSuppressed(userId) {
  const until = roleSyncSuppressedUntil.get(userId) || 0;

  if (until <= Date.now()) {
    roleSyncSuppressedUntil.delete(userId);
    return false;
  }

  return true;
}

function draftKey(userId, type) {
  return `${userId}:${type}`;
}

// ============================================================
// ALLGEMEINE HELFER
// ============================================================

function hasAnyRole(member, roleIds) {
  if (!member?.roles?.cache) return false;
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

function canManage(member) {
  return hasAnyRole(member, MANAGEMENT_ROLE_IDS);
}

function isEmployee(member) {
  return hasAnyRole(member, EMPLOYEE_ROLE_IDS);
}

function hasManagerPosition(member) {
  return hasAnyRole(member, MANAGER_POSITION_ROLE_IDS);
}

function canUseEmployeeFunctions(member) {
  return isEmployee(member) || canManage(member);
}

function formatName(rawName) {
  return String(rawName || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join(" ");
}

function normalizeName(rawName) {
  return String(rawName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[`*_~|>]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9äöüß ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMinutes(minutes) {
  const safe = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${hours} Stunden & ${rest} Minuten`;
}

function formatShortMinutes(minutes) {
  const safe = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${hours} Std. ${rest} Min.`;
}

function formatDateTime(dateValue) {
  const date = new Date(dateValue);

  return new Intl.DateTimeFormat("de-DE", {
    timeZone: SETTINGS.timezone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatDate(dateValue) {
  const date = new Date(dateValue);

  return new Intl.DateTimeFormat("de-DE", {
    timeZone: SETTINGS.timezone,
    dateStyle: "short",
  }).format(date);
}

function createDateInTimeZone(
  { year, month, day, hour, minute },
  timeZone = SETTINGS.timezone
) {
  const utcGuess = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0
  );

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(new Date(utcGuess));
  const part = (type) =>
    Number(parts.find((entry) => entry.type === type)?.value);

  const formattedAsUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second")
  );

  const offset = formattedAsUtc - utcGuess;
  return new Date(utcGuess - offset);
}

function getCurrentDatePartsInTimeZone(
  timeZone = SETTINGS.timezone
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const part = (type) =>
    Number(parts.find((entry) => entry.type === type)?.value);

  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
  };
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

function parseStrictGermanDate(input) {
  const clean = String(input || "").trim();

  // Für Abmeldungen ist exakt TT.MM.JJJJ vorgeschrieben.
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(clean)) {
    return null;
  }

  return parseGermanDate(clean);
}

function getTodayIsoInTimeZone(
  timeZone = SETTINGS.timezone
) {
  const { year, month, day } =
    getCurrentDatePartsInTimeZone(timeZone);

  return `${year}-${String(month).padStart(2, "0")}-${String(
    day
  ).padStart(2, "0")}`;
}

function formatIsoDateGerman(isoDate) {
  const [year, month, day] = String(isoDate).split("-");
  return `${day}.${month}.${year}`;
}

function parsePositiveMinutes(input) {
  const clean = String(input || "").trim().replace(",", ".");
  const number = Number(clean);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return Math.round(number);
}

function createBaseEmbed(color = BRAND.color) {
  return new EmbedBuilder()
    .setColor(color)
    .setFooter({ text: BRAND.footer })
    .setTimestamp();
}

async function fetchTextChannel(channelId) {
  if (!channelId) return null;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  return channel?.isTextBased() ? channel : null;
}

async function sendEmbed(channelId, embed, options = {}) {
  const channel = await fetchTextChannel(channelId);
  if (!channel) return null;

  return channel
    .send({
      content: options.content,
      embeds: [embed],
      components: options.components || [],
    })
    .catch((error) => {
      console.error(`❌ Nachricht in Kanal ${channelId} fehlgeschlagen:`, error);
      return null;
    });
}

async function sendGeneralLog(title, description, color = BRAND.color) {
  const embed = createBaseEmbed(color)
    .setTitle(title)
    .setDescription(description);

  return sendEmbed(CHANNELS.generalLogs, embed);
}

async function safeAddRoles(member, roleIds, reason = "Tiki Assistent") {
  const ids = Array.isArray(roleIds) ? roleIds : [roleIds];
  const added = [];
  const failed = [];

  for (const roleId of ids) {
    if (!roleId || member.roles.cache.has(roleId)) continue;

    try {
      await member.roles.add(roleId, reason);
      added.push(roleId);
    } catch (error) {
      console.error(`❌ Rolle ${roleId} konnte nicht vergeben werden:`, error);
      failed.push(roleId);
    }
  }

  return { added, failed };
}

async function safeRemoveRoles(member, roleIds, reason = "Tiki Assistent") {
  const ids = Array.isArray(roleIds) ? roleIds : [roleIds];
  const removed = [];
  const failed = [];

  for (const roleId of ids) {
    if (!roleId || !member.roles.cache.has(roleId)) continue;

    try {
      await member.roles.remove(roleId, reason);
      removed.push(roleId);
    } catch (error) {
      console.error(`❌ Rolle ${roleId} konnte nicht entfernt werden:`, error);
      failed.push(roleId);
    }
  }

  return { removed, failed };
}

async function getSetting(key, fallback = null) {
  const result = await query(
    `SELECT value FROM bot_settings WHERE key = $1`,
    [key]
  );

  return result.rows[0]?.value ?? fallback;
}

async function setSetting(key, value) {
  await query(
    `
      INSERT INTO bot_settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value;
    `,
    [key, String(value)]
  );
}

async function ensureEmployee(userId) {
  await query(
    `
      INSERT INTO employees (
        user_id,
        total_minutes,
        weekly_minutes,
        left_server
      )
      VALUES ($1, 0, 0, FALSE)
      ON CONFLICT (user_id)
      DO UPDATE SET left_server = FALSE;
    `,
    [userId]
  );
}

async function sendOrUpdatePermanentMessage(
  channelId,
  settingKey,
  payload
) {
  const channel = await fetchTextChannel(channelId);

  if (!channel) {
    throw new Error(`Kanal ${channelId} wurde nicht gefunden.`);
  }

  const oldMessageId = await getSetting(settingKey, null);

  if (oldMessageId) {
    const oldMessage = await channel.messages
      .fetch(oldMessageId)
      .catch(() => null);

    if (oldMessage) {
      await oldMessage.edit(payload);
      return oldMessage;
    }
  }

  const newMessage = await channel.send(payload);
  await setSetting(settingKey, newMessage.id);
  return newMessage;
}

function userSelect(customId, placeholder = "Mitarbeiter auswählen") {
  return new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(1)
  );
}

function continueButton(customId, label = "Weiter") {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel(label)
      .setEmoji("➡️")
      .setStyle(ButtonStyle.Primary)
  );
}

function generateToken() {
  return `${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

// ============================================================
// DATENBANKTABELLEN
// ============================================================

async function initDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS employees (
      user_id TEXT PRIMARY KEY,
      total_minutes INTEGER NOT NULL DEFAULT 0,
      weekly_minutes INTEGER NOT NULL DEFAULT 0,
      left_server BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS active_sessions (
      user_id TEXT PRIMARY KEY,
      ic_name TEXT,
      started_at TIMESTAMPTZ NOT NULL,
      source_message_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS work_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      ic_name TEXT,
      started_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ NOT NULL,
      minutes INTEGER NOT NULL,
      corrected BOOLEAN NOT NULL DEFAULT FALSE,
      correction_reason TEXT,
      source_message_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS absences (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      date_from DATE NOT NULL,
      date_to DATE NOT NULL,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS shopping_requests (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      item TEXT NOT NULL,
      amount_text TEXT,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      message_id TEXT,
      thread_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS applications (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      ic_name TEXT NOT NULL,
      phone TEXT,
      experience TEXT,
      motivation TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      message_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS thread_id TEXT;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS house_bans (
      id BIGSERIAL PRIMARY KEY,
      creator_id TEXT NOT NULL,
      person_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      duration_text TEXT NOT NULL,
      evidence TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      message_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS warning_records (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      warning_role_id TEXT NOT NULL,
      issuer_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      removed_at TIMESTAMPTZ,
      removed_by TEXT
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS personnel_events (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      issuer_id TEXT,
      event_type TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS personal_file_notes (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      issuer_id TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS time_adjustments (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      issuer_id TEXT NOT NULL,
      action TEXT NOT NULL,
      minutes INTEGER NOT NULL,
      old_weekly_minutes INTEGER NOT NULL,
      new_weekly_minutes INTEGER NOT NULL,
      old_total_minutes INTEGER NOT NULL,
      new_total_minutes INTEGER NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS duty_corrections (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      issuer_id TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      corrected_end_at TIMESTAMPTZ NOT NULL,
      minutes INTEGER NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS foodbusiness_processed_logs (
      message_id TEXT PRIMARY KEY,
      user_id TEXT,
      ic_name TEXT,
      action TEXT NOT NULL,
      minutes INTEGER NOT NULL DEFAULT 0,
      processing_status TEXT NOT NULL,
      original_text TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS foodbusiness_money_logs (
      message_id TEXT PRIMARY KEY,
      amount NUMERIC,
      original_text TEXT NOT NULL,
      logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS stale_duty_alerts (
      user_id TEXT PRIMARY KEY,
      session_started_at TIMESTAMPTZ NOT NULL,
      last_alert_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS bot_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  console.log("✅ Datenbanktabellen sind bereit.");
}

// ============================================================
// SLASH-COMMANDS
// ============================================================

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("mitarbeiterpanel")
      .setDescription("Erstellt oder aktualisiert das Mitarbeiterpanel."),

    new SlashCommandBuilder()
      .setName("managementpanel")
      .setDescription("Erstellt oder aktualisiert das Managementpanel."),

    new SlashCommandBuilder()
      .setName("registrierungspanel")
      .setDescription("Erstellt oder aktualisiert das Registrierungspanel."),

    new SlashCommandBuilder()
      .setName("dashboard")
      .setDescription("Aktualisiert das Tiki-Bar-Dashboard."),

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
      .setDescription("Analysiert einen Mitarbeiter.")
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
            "Zum Beispiel 19:30 oder 14.07.2026 19:30"
          )
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("grund")
          .setDescription("Zum Beispiel Crash")
          .setMaxLength(300)
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("dienst-reset")
      .setDescription(
        "Entfernt alle Im-Dienst-Rollen und beendet offene Sessions."
      ),

    new SlashCommandBuilder()
      .setName("verwarnungen-sync")
      .setDescription(
        "Synchronisiert gespeicherte Verwarnungen mit den Discord-Rollen."
      ),

    new SlashCommandBuilder()
      .setName("statuscheck")
      .setDescription(
        "Prüft Bot, Datenbank, Kanäle und Foodbusiness-System."
      ),

    new SlashCommandBuilder()
      .setName("bot-hilfe")
      .setDescription("Zeigt eine Übersicht der Bot-Funktionen."),

    new SlashCommandBuilder()
      .setName("bot-cleanup")
      .setDescription("Bereinigt alte abgeschlossene Bot-Daten."),
  ].map((command) => command.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log(`✅ ${commands.length} Slash-Commands registriert.`);
}

// ============================================================
// PANEL-KOMPONENTEN
// ============================================================

function employeePanelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("open_absence_modal")
      .setLabel("Abmeldung")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("open_shopping_modal")
      .setLabel("Einkauf")
      .setEmoji("🛒")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("open_application_modal")
      .setLabel("Bewerbung")
      .setEmoji("📋")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("open_houseban_modal")
      .setLabel("Hausverbot")
      .setEmoji("🚫")
      .setStyle(ButtonStyle.Secondary)
  );
}

function managementPanelRows() {
  const firstRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("mgmt_warning_start")
      .setLabel("Verwarnung")
      .setEmoji("⚠️")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("mgmt_teamupdate_start")
      .setLabel("Teamupdate")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("mgmt_termination_start")
      .setLabel("Kündigung")
      .setEmoji("📤")
      .setStyle(ButtonStyle.Secondary)
  );

  const secondRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("mgmt_warning_remove_start")
      .setLabel("Verwarnung zurückziehen")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("mgmt_training_start")
      .setLabel("Einweisung")
      .setEmoji("🧠")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("mgmt_time_start")
      .setLabel("Zeitverwaltung")
      .setEmoji("⏱️")
      .setStyle(ButtonStyle.Secondary)
  );

  return [firstRow, secondRow];
}

function warningRoleSelect(customId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder("Verwarnungsstufe auswählen")
      .addOptions(
        {
          label: "1. Verwarnung",
          value: ROLES.warning1,
          description: "Vergibt die Rolle für die erste Verwarnung",
        },
        {
          label: "2. Verwarnung",
          value: ROLES.warning2,
          description: "Vergibt die Rolle für die zweite Verwarnung",
        }
      )
  );
}

function teamUpdateRoleSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("mgmt_teamupdate_role")
      .setPlaceholder("Neue Position auswählen")
      .addOptions(
        {
          label: "Probe-Mitarbeiter",
          value: "probation",
          description:
            "Vergibt Probe-Mitarbeiter plus Mitarbeiterzusatzrolle",
        },
        {
          label: "Mitarbeiter",
          value: "employee",
          description:
            "Entfernt Probe-Mitarbeiter und vergibt Mitarbeiter",
        },
        {
          label: "Probe-Manager",
          value: "probation_manager",
          description:
            "Vergibt Mitarbeiter-, Zusatz- und Verwaltungsrollen",
        },
        {
          label: "Manager",
          value: "manager",
          description:
            "Vergibt Mitarbeiter-, Zusatz- und Verwaltungsrollen",
        },
        {
          label: "Personal Manager",
          value: "personal_manager",
          description:
            "Vergibt Mitarbeiter-, Zusatz- und Verwaltungsrollen",
        }
      )
  );
}

function timeActionSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("time_action_select")
      .setPlaceholder("Zeitaktion auswählen")
      .addOptions(
        {
          label: "Zeit hinzufügen",
          value: "add",
          emoji: "➕",
        },
        {
          label: "Zeit entfernen",
          value: "remove",
          emoji: "➖",
        },
        {
          label: "Weekly-Zeit setzen",
          value: "set_weekly",
          emoji: "🔄",
        },
        {
          label: "Gesamtzeit setzen",
          value: "set_total",
          emoji: "🏆",
        },
        {
          label: "Zeiten ansehen",
          value: "view",
          emoji: "📊",
        }
      )
  );
}

// ============================================================
// PANELS
// ============================================================

async function postRegistrationPanel() {
  const embed = createBaseEmbed()
    .setTitle("👤 • REGISTRIERUNGSPANEL")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        `Willkommen bei der **${BRAND.name}**! 🍸\n\n` +
        "📝 **Registrierung**\n" +
        "└ Trage deinen Vor- und Nachnamen ein.\n" +
        "└ Der Name wird automatisch richtig geschrieben.\n\n" +
        "✅ Nach der Registrierung erhältst du automatisch deine vorgesehenen Rollen.\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━"
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("open_registration_modal")
      .setLabel("Jetzt registrieren")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Primary)
  );

  return sendOrUpdatePermanentMessage(
    CHANNELS.registrationPanel,
    "registration_panel_message_id",
    {
      embeds: [embed],
      components: [row],
    }
  );
}

async function postEmployeePanel() {
  const embed = createBaseEmbed()
    .setTitle("👥 • MITARBEITERPANEL")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        `Willkommen im Mitarbeiterbereich der **${BRAND.name}**.\n\n` +
        "❌ **Abmeldung**\n" +
        "└ Melde dich für einen Zeitraum ab.\n\n" +
        "🛒 **Einkauf**\n" +
        "└ Trage benötigte Waren oder Materialien ein.\n\n" +
        "📋 **Bewerbung**\n" +
        "└ Reiche eine IC-Bewerbung ein.\n\n" +
        "🚫 **Hausverbot**\n" +
        "└ Dokumentiere ein Hausverbot.\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━"
    );

  return sendOrUpdatePermanentMessage(
    CHANNELS.employeePanel,
    "employee_panel_message_id",
    {
      embeds: [embed],
      components: [employeePanelButtons()],
    }
  );
}

async function postManagementPanel() {
  const embed = createBaseEmbed()
    .setTitle("🛠️ • MANAGEMENTPANEL")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        `Verwalte hier das Team der **${BRAND.name}**.\n\n` +
        "⚠️ **Verwarnung**\n" +
        "└ Verwarnung ausstellen.\n\n" +
        "🔄 **Teamupdate**\n" +
        "└ Rollen und Positionen aktualisieren.\n\n" +
        "📤 **Kündigung**\n" +
        "└ Mitarbeiter aus dem Team entfernen.\n\n" +
        "✅ **Verwarnung zurückziehen**\n" +
        "└ Eine aktive Verwarnung entfernen.\n\n" +
        "🧠 **Einweisung**\n" +
        "└ Eine Einweisung dokumentieren.\n\n" +
        "⏱️ **Zeitverwaltung**\n" +
        "└ Arbeitszeiten ansehen oder korrigieren.\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━"
    );

  return sendOrUpdatePermanentMessage(
    CHANNELS.managementPanel,
    "management_panel_message_id",
    {
      embeds: [embed],
      components: managementPanelRows(),
    }
  );
}

// ============================================================
// DASHBOARD UND ZEITÜBERSICHTEN
// ============================================================

async function getTrackedDashboardMembers() {
  const guild = await client.guilds.fetch(GUILD_ID);

  // Die Mitglieder wurden beim Start bereits synchronisiert.
  // Nur wenn der Cache praktisch leer ist, wird erneut geladen.
  if (guild.members.cache.size <= 1) {
    await guild.members.fetch();
  }

  const trackedMembers = guild.members.cache.filter(
    (member) =>
      !member.user.bot &&
      (member.roles.cache.has(ROLES.employee) ||
        member.roles.cache.has(ROLES.probationEmployee))
  );

  return {
    guild,
    trackedMembers,
    trackedUserIds: [...trackedMembers.keys()],
  };
}

async function getDashboardTimeSnapshot() {
  const {
    trackedMembers,
    trackedUserIds,
  } = await getTrackedDashboardMembers();

  if (trackedUserIds.length === 0) {
    return {
      trackedMembers,
      trackedUserIds,
      rows: [],
      activeUserIds: new Set(),
    };
  }

  const [timeResult, activeResult] = await Promise.all([
    query(
      `
        SELECT user_id, weekly_minutes, total_minutes
        FROM employees
        WHERE user_id = ANY($1::text[])
      `,
      [trackedUserIds]
    ),
    query(
      `
        SELECT user_id
        FROM active_sessions
        WHERE user_id = ANY($1::text[])
      `,
      [trackedUserIds]
    ),
  ]);

  const timeByUser = new Map(
    timeResult.rows.map((row) => [
      row.user_id,
      {
        weeklyMinutes: Number(row.weekly_minutes) || 0,
        totalMinutes: Number(row.total_minutes) || 0,
      },
    ])
  );

  const activeUserIds = new Set(
    activeResult.rows.map((row) => row.user_id)
  );

  const rows = trackedUserIds.map((userId) => ({
    userId,
    weeklyMinutes:
      timeByUser.get(userId)?.weeklyMinutes || 0,
    totalMinutes:
      timeByUser.get(userId)?.totalMinutes || 0,
  }));

  return {
    trackedMembers,
    trackedUserIds,
    rows,
    activeUserIds,
  };
}

function formatLeaderboardMinutes(minutes) {
  const safe = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;

  const hourText = hours === 1 ? "Stunde" : "Stunden";
  const minuteText = rest === 1 ? "Minute" : "Minuten";

  return `${hours} ${hourText} & ${rest} ${minuteText}`;
}

function getRankSymbol(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `**${rank}.**`;
}

function buildLeaderboardButtons(type, page, pageCount) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`leaderboard_${type}_prev`)
      .setEmoji("⬅️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),

    new ButtonBuilder()
      .setCustomId(`leaderboard_${type}_next`)
      .setEmoji("➡️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= pageCount - 1)
  );
}

async function buildLeaderboardPayload(type, requestedPage = 0) {
  const snapshot = await getDashboardTimeSnapshot();

  const isWeekly = type === "weekly";
  const minuteKey = isWeekly
    ? "weeklyMinutes"
    : "totalMinutes";

  const sortedRows = [...snapshot.rows].sort((a, b) => {
    const difference = b[minuteKey] - a[minuteKey];

    if (difference !== 0) {
      return difference;
    }

    return a.userId.localeCompare(b.userId);
  });

  const pageSize = SETTINGS.leaderboardPageSize;
  const pageCount = Math.max(
    1,
    Math.ceil(sortedRows.length / pageSize)
  );

  const page = Math.min(
    Math.max(0, Number(requestedPage) || 0),
    pageCount - 1
  );

  leaderboardPages[type] = page;

  const startIndex = page * pageSize;
  const pageRows = sortedRows.slice(
    startIndex,
    startIndex + pageSize
  );

  const description = pageRows.length
    ? pageRows
        .map((row, index) => {
          const rank = startIndex + index + 1;
          const activeMarker =
            snapshot.activeUserIds.has(row.userId)
              ? " 🟢"
              : "";

          return (
            `${getRankSymbol(rank)}${activeMarker} <@${row.userId}>\n` +
            `└ ⏱️ **${formatLeaderboardMinutes(
              row[minuteKey]
            )}**`
          );
        })
        .join("\n\n")
    : "Noch keine Mitarbeiterzeiten vorhanden.";

  const title = isWeekly
    ? "🍸 • TIKI BAR • WOCHENZEITEN"
    : "🍸 • TIKI BAR • GESAMTZEITEN";

  const color = isWeekly ? 0x57f287 : 0x3498db;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text:
        `Tiki Bar • Live alle 2 Minuten • ` +
        `Seite ${page + 1}/${pageCount}`,
    })
    .setTimestamp();

  return {
    page,
    pageCount,
    payload: {
      embeds: [embed],
      components: [
        buildLeaderboardButtons(type, page, pageCount),
      ],
    },
  };
}

async function updateLeaderboardMessage(type) {
  const settingKey =
    type === "weekly"
      ? "weekly_leaderboard_message_id"
      : "total_leaderboard_message_id";

  const result = await buildLeaderboardPayload(
    type,
    leaderboardPages[type]
  );

  return sendOrUpdatePermanentMessage(
    CHANNELS.dashboard,
    settingKey,
    result.payload
  );
}

async function buildDashboardEmbed() {
  const {
    trackedMembers: employeeMembers,
    trackedUserIds: employeeIds,
  } = await getTrackedDashboardMembers();

  const [
    activeSessions,
    warningSummary,
    absenceSummary,
    employeeTimes,
  ] = await Promise.all([
    query(
      `
        SELECT user_id, started_at
        FROM active_sessions
        WHERE user_id = ANY($1::text[])
        ORDER BY started_at ASC
      `,
      [employeeIds]
    ),
    query(
      `
        SELECT
          COUNT(*) FILTER (WHERE active = TRUE)::int AS active_count,
          COUNT(*) FILTER (
            WHERE active = TRUE
              AND issued_at <= NOW() - INTERVAL '14 days'
          )::int AS older_than_14_days
        FROM warning_records
        WHERE user_id = ANY($1::text[])
      `,
      [employeeIds]
    ),
    query(
      `
        SELECT COUNT(*)::int AS count
        FROM absences
        WHERE user_id = ANY($1::text[])
          AND date_from <= CURRENT_DATE + INTERVAL '7 days'
          AND date_to >= CURRENT_DATE
      `,
      [employeeIds]
    ),
    query(
      `
        SELECT user_id, weekly_minutes, total_minutes
        FROM employees
        WHERE user_id = ANY($1::text[])
      `,
      [employeeIds]
    ),
  ]);

  const timeByUser = new Map(
    employeeTimes.rows.map((row) => [
      row.user_id,
      {
        weekly: Number(row.weekly_minutes) || 0,
        total: Number(row.total_minutes) || 0,
      },
    ])
  );

  const totalWeeklyMinutes = employeeIds.reduce(
    (sum, userId) =>
      sum + (timeByUser.get(userId)?.weekly || 0),
    0
  );

  const averageWeeklyMinutes =
    employeeIds.length > 0
      ? Math.round(
          totalWeeklyMinutes / employeeIds.length
        )
      : 0;

  const activeEmployeeSessions =
    activeSessions.rows.filter((row) =>
      employeeMembers.has(row.user_id)
    );

  const activeList = activeEmployeeSessions.length
    ? activeEmployeeSessions
        .map(
          (row) =>
            `└ <@${row.user_id}> • seit ` +
            `${formatDateTime(row.started_at)}`
        )
        .join("\n")
    : "└ Niemand ist aktuell eingestempelt.";

  const activeWarningCount =
    Number(warningSummary.rows[0]?.active_count) || 0;

  const oldWarningCount =
    Number(
      warningSummary.rows[0]?.older_than_14_days
    ) || 0;

  const absenceCount =
    Number(absenceSummary.rows[0]?.count) || 0;

  const openTasks = [];

  if (oldWarningCount > 0) {
    openTasks.push(
      `└ 🔴 Verwarnungen über 14 Tage prüfen: ` +
      `**${oldWarningCount}**`
    );
  }

  if (absenceCount > 0) {
    openTasks.push(
      `└ 🟡 Aktuelle/kommende Abmeldungen prüfen: ` +
      `**${absenceCount}**`
    );
  }

  if (openTasks.length === 0) {
    openTasks.push(
      "└ 🟢 Zurzeit sind keine offenen Prüfaufgaben vorhanden."
    );
  }

  return createBaseEmbed()
    .setTitle("🍸 • TIKI BAR DASHBOARD")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "**Live-Übersicht für Management & Personal Management**\n" +
        "🟢 Alles gut • 🟡 Prüfen • 🔴 Handeln\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +

        "👥 **TEAM & ZEITEN**\n\n" +
        "👥 **Mitarbeiter im Team**\n" +
        `└ **${employeeIds.length}**\n\n` +

        "🟢 **Aktuell im Dienst**\n" +
        `└ **${activeEmployeeSessions.length}**\n\n` +

        "📊 **Ø Wochenzeit pro Mitarbeiter**\n" +
        `└ **${formatShortMinutes(
          averageWeeklyMinutes
        )}**\n\n` +

        "━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +

        "🧑‍💼 **PERSONAL MANAGEMENT**\n\n" +
        "⚠️ **Aktive Verwarnungen**\n" +
        `└ **${activeWarningCount}**\n\n` +

        "🕒 **Verwarnungen über 14 Tage**\n" +
        `└ **${oldWarningCount}**\n\n` +

        "📅 **Abmeldungen diese Woche**\n" +
        `└ **${absenceCount}**\n\n` +

        "📌 **OFFENE AUFGABEN**\n" +
        `${openTasks.join("\n")}\n\n` +

        "━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +

        "🟢 **EINGESTEMPELTE MITARBEITER**\n" +
        `${activeList}\n` +

        "━━━━━━━━━━━━━━━━━━━━━━━━"
    );
}

async function updateDashboardMessage() {
  const embed = await buildDashboardEmbed();

  return sendOrUpdatePermanentMessage(
    CHANNELS.dashboard,
    "dashboard_message_id",
    {
      embeds: [embed],
      components: [],
    }
  );
}

async function updateDashboardOverview() {
  await updateDashboardMessage();
  await updateLeaderboardMessage("weekly");
  await updateLeaderboardMessage("total");
}

// ============================================================
// PERSONALAKTEN
// ============================================================

async function buildPersonalFileEmbed(userId) {
  const [employee, warnings, notes, events, sessions] =
    await Promise.all([
      query(
        `
          SELECT total_minutes, weekly_minutes, left_server, created_at
          FROM employees
          WHERE user_id = $1
        `,
        [userId]
      ),
      query(
        `
          SELECT warning_role_id, issuer_id, reason, issued_at
          FROM warning_records
          WHERE user_id = $1 AND active = TRUE
          ORDER BY issued_at DESC
        `,
        [userId]
      ),
      query(
        `
          SELECT issuer_id, note, created_at
          FROM personal_file_notes
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 5
        `,
        [userId]
      ),
      query(
        `
          SELECT issuer_id, event_type, details, created_at
          FROM personnel_events
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 8
        `,
        [userId]
      ),
      query(
        `
          SELECT started_at, ended_at, minutes, corrected
          FROM work_sessions
          WHERE user_id = $1
          ORDER BY ended_at DESC
          LIMIT 5
        `,
        [userId]
      ),
    ]);

  const employeeRow = employee.rows[0];

  const warningText = warnings.rows.length
    ? warnings.rows
        .map(
          (row) =>
            `• <@&${row.warning_role_id}> – ${row.reason}\n  ↳ ${formatDateTime(
              row.issued_at
            )} von <@${row.issuer_id}>`
        )
        .join("\n")
    : "Keine aktive Verwarnung.";

  const notesText = notes.rows.length
    ? notes.rows
        .map(
          (row) =>
            `• ${row.note}\n  ↳ ${formatDateTime(
              row.created_at
            )} von <@${row.issuer_id}>`
        )
        .join("\n")
        .slice(0, 1024)
    : "Keine internen Notizen.";

  const eventsText = events.rows.length
    ? events.rows
        .map(
          (row) =>
            `• **${row.event_type}:** ${row.details}\n  ↳ ${formatDateTime(
              row.created_at
            )}`
        )
        .join("\n")
        .slice(0, 1024)
    : "Keine Personalereignisse.";

  const sessionsText = sessions.rows.length
    ? sessions.rows
        .map(
          (row) =>
            `• ${formatDate(row.ended_at)} – ${formatShortMinutes(
              row.minutes
            )}${row.corrected ? " *(korrigiert)*" : ""}`
        )
        .join("\n")
    : "Noch keine Dienste gespeichert.";

  return createBaseEmbed()
    .setTitle("📁 • PERSONALAKTE")
    .setDescription(`Personalübersicht für <@${userId}>`)
    .addFields(
      {
        name: "⏱️ Arbeitszeiten",
        value: employeeRow
          ? `Weekly: **${formatShortMinutes(
              employeeRow.weekly_minutes
            )}**\nGesamt: **${formatShortMinutes(
              employeeRow.total_minutes
            )}**`
          : "Nicht in der Mitarbeiterliste.",
        inline: true,
      },
      {
        name: "📌 Status",
        value: employeeRow?.left_server
          ? "Nicht mehr im Team"
          : "Aktiv/registriert",
        inline: true,
      },
      {
        name: "⚠️ Aktive Verwarnungen",
        value: warningText.slice(0, 1024),
      },
      {
        name: "📝 Interne Notizen",
        value: notesText,
      },
      {
        name: "📋 Personalereignisse",
        value: eventsText,
      },
      {
        name: "🕒 Letzte Dienste",
        value: sessionsText.slice(0, 1024),
      }
    );
}

async function sendPersonalFileToChannel(userId, issuerId) {
  const embed = await buildPersonalFileEmbed(userId);

  await sendEmbed(CHANNELS.personalFiles, embed, {
    content: `Angefordert von <@${issuerId}>`,
  });
}

async function buildEmployeeCheckEmbed(userId) {
  const [employee, active, warnings, absences] = await Promise.all([
    query(
      `
        SELECT total_minutes, weekly_minutes, left_server
        FROM employees
        WHERE user_id = $1
      `,
      [userId]
    ),
    query(
      `SELECT started_at FROM active_sessions WHERE user_id = $1`,
      [userId]
    ),
    query(
      `
        SELECT COUNT(*)::int AS count
        FROM warning_records
        WHERE user_id = $1 AND active = TRUE
      `,
      [userId]
    ),
    query(
      `
        SELECT COUNT(*)::int AS count
        FROM absences
        WHERE user_id = $1 AND date_to >= CURRENT_DATE
      `,
      [userId]
    ),
  ]);

  const row = employee.rows[0];

  return createBaseEmbed()
    .setTitle("🔍 • MITARBEITERCHECK")
    .setDescription(`Automatische Übersicht für <@${userId}>`)
    .addFields(
      {
        name: "Teamstatus",
        value: row
          ? row.left_server
            ? "Nicht mehr im Team"
            : "Aktiv"
          : "Nicht in der Datenbank",
        inline: true,
      },
      {
        name: "Dienststatus",
        value: active.rows[0]
          ? `Im Dienst seit ${formatDateTime(active.rows[0].started_at)}`
          : "Nicht im Dienst",
        inline: true,
      },
      {
        name: "Weekly-Zeit",
        value: formatShortMinutes(row?.weekly_minutes || 0),
        inline: true,
      },
      {
        name: "Gesamtzeit",
        value: formatShortMinutes(row?.total_minutes || 0),
        inline: true,
      },
      {
        name: "Aktive Verwarnungen",
        value: String(warnings.rows[0]?.count || 0),
        inline: true,
      },
      {
        name: "Aktuelle Abmeldungen",
        value: String(absences.rows[0]?.count || 0),
        inline: true,
      }
    );
}

// ============================================================
// MITARBEITER-MODALS
// ============================================================

function registrationModal() {
  return new ModalBuilder()
    .setCustomId("registration_modal")
    .setTitle("Tiki-Bar-Registrierung")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("registration_first_name")
          .setLabel("Vorname")
          .setStyle(TextInputStyle.Short)
          .setMinLength(2)
          .setMaxLength(30)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("registration_last_name")
          .setLabel("Nachname")
          .setStyle(TextInputStyle.Short)
          .setMinLength(2)
          .setMaxLength(30)
          .setRequired(true)
      )
    );
}

function absenceModal(defaultName = "") {
  const safeName = formatName(defaultName).slice(0, 60);

  return new ModalBuilder()
    .setCustomId("absence_modal")
    .setTitle("Abmeldung einreichen")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("absence_name")
          .setLabel("Vor- und Nachname")
          .setStyle(TextInputStyle.Short)
          .setValue(safeName || "Nicht erkannt")
          .setMaxLength(60)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("absence_from")
          .setLabel("Von (TT.MM.JJJJ)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("14.07.2026")
          .setMinLength(10)
          .setMaxLength(10)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("absence_to")
          .setLabel("Bis (TT.MM.JJJJ)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("20.07.2026")
          .setMinLength(10)
          .setMaxLength(10)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("absence_reason")
          .setLabel("Grund")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(500)
          .setRequired(true)
      )
    );
}

function shoppingModal() {
  return new ModalBuilder()
    .setCustomId("shopping_modal")
    .setTitle("Einkauf eintragen")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("shopping_item")
          .setLabel("Was wird benötigt?")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(800)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("shopping_amount")
          .setLabel("Menge / Anzahl")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("shopping_reason")
          .setLabel("Hinweis / Grund")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(500)
          .setRequired(false)
      )
    );
}

function applicationModal() {
  return new ModalBuilder()
    .setCustomId("application_modal")
    .setTitle("IC-Bewerbung")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("application_name")
          .setLabel("IC Vor- und Nachname")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("application_phone")
          .setLabel("IC-Telefonnummer")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("application_experience")
          .setLabel("Bisherige Erfahrungen")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(700)
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("application_motivation")
          .setLabel("Warum möchtest du bei uns arbeiten?")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(true)
      )
    );
}

function houseBanModal() {
  return new ModalBuilder()
    .setCustomId("houseban_modal")
    .setTitle("Hausverbot dokumentieren")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("houseban_name")
          .setLabel("Name der Person")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("houseban_reason")
          .setLabel("Grund")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(700)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("houseban_duration")
          .setLabel("Dauer")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Permanent oder bis 20.07.2026")
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("houseban_evidence")
          .setLabel("Beweise / weitere Hinweise")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(700)
          .setRequired(false)
      )
    );
}

// ============================================================
// REGISTRIERUNG
// ============================================================

async function handleRegistration(interaction) {
  const firstName = formatName(
    interaction.fields.getTextInputValue("registration_first_name")
  );
  const lastName = formatName(
    interaction.fields.getTextInputValue("registration_last_name")
  );
  const fullName = `${firstName} ${lastName}`.trim();

  if (fullName.length < 5 || fullName.length > 32) {
    return interaction.reply({
      content:
        "❌ Der vollständige Name muss zwischen 5 und 32 Zeichen lang sein.",
      ephemeral: true,
    });
  }

  let nicknameResult = "✅ Discord-Name wurde angepasst.";

  try {
    await interaction.member.setNickname(
      fullName,
      "Registrierung über den Tiki Assistenten"
    );
  } catch (error) {
    console.error("❌ Nickname konnte nicht gesetzt werden:", error);
    nicknameResult =
      "⚠️ Der Discord-Name konnte wegen der Rollenhierarchie nicht geändert werden.";
  }

  const roleResult = await safeAddRoles(
    interaction.member,
    ROLES.registration,
    "Registrierung bei der Tiki Bar"
  );

  await query(
    `
      INSERT INTO personnel_events (
        user_id,
        issuer_id,
        event_type,
        details
      )
      VALUES ($1, $2, 'Registrierung', $3);
    `,
    [
      interaction.user.id,
      interaction.user.id,
      `Registrierung als ${fullName}`,
    ]
  );

  const failedRoles = roleResult.failed.length
    ? `\n⚠️ Diese Rollen konnten nicht vergeben werden: ${roleResult.failed
        .map((id) => `<@&${id}>`)
        .join(", ")}`
    : "\n✅ Alle Registrierungsrollen wurden vergeben.";

  await sendGeneralLog(
    "👤 • NEUE REGISTRIERUNG",
    `**Discord:** ${interaction.user}\n**IC-Name:** ${fullName}`,
    0x57f287
  );

  return interaction.reply({
    content:
      `✅ Registrierung als **${fullName}** abgeschlossen.\n` +
      nicknameResult +
      failedRoles,
    ephemeral: true,
  });
}

// ============================================================
// MITARBEITER-FORMULARE VERARBEITEN
// ============================================================

async function handleAbsence(interaction) {
  // Der Name wird immer aus dem Discord-Serverprofil genommen.
  // Änderungen im vorausgefüllten Feld werden nicht übernommen.
  const name = formatName(
    interaction.member?.displayName ||
      interaction.user.globalName ||
      interaction.user.username
  );

  const fromRaw =
    interaction.fields.getTextInputValue("absence_from");
  const toRaw =
    interaction.fields.getTextInputValue("absence_to");
  const reason =
    interaction.fields.getTextInputValue("absence_reason");

  const from = parseStrictGermanDate(fromRaw);
  const to = parseStrictGermanDate(toRaw);

  if (!from || !to) {
    return interaction.reply({
      content:
        "❌ Bitte verwende ausschließlich echte Daten im Format **TT.MM.JJJJ**, zum Beispiel `14.07.2026`.",
      ephemeral: true,
    });
  }

  const today = getTodayIsoInTimeZone();

  if (from < today || to < today) {
    return interaction.reply({
      content:
        "❌ Bereits vergangene Tage können nicht für eine Abmeldung ausgewählt werden.",
      ephemeral: true,
    });
  }

  if (from > to) {
    return interaction.reply({
      content:
        "❌ Das Enddatum darf nicht vor dem Startdatum liegen.",
      ephemeral: true,
    });
  }

  await query(
    `
      INSERT INTO absences (
        user_id,
        name,
        date_from,
        date_to,
        reason
      )
      VALUES ($1, $2, $3, $4, $5);
    `,
    [interaction.user.id, name, from, to, reason]
  );

  const embed = createBaseEmbed(0xed4245)
    .setTitle("❌ • NEUE ABMELDUNG")
    .addFields(
      { name: "👤 Name", value: name },
      {
        name: "📅 Zeitraum",
        value:
          `${formatIsoDateGerman(from)} bis ` +
          `${formatIsoDateGerman(to)}`,
      },
      { name: "📝 Grund", value: reason },
      {
        name: "Erstellt von",
        value: `${interaction.user}`,
      }
    );

  await sendEmbed(CHANNELS.absences, embed);
  await updateDashboardMessage().catch(() => null);

  return interaction.reply({
    content: "✅ Deine Abmeldung wurde eingetragen.",
    ephemeral: true,
  });
}

async function handleShopping(interaction) {
  const item =
    interaction.fields.getTextInputValue("shopping_item");
  const amount =
    interaction.fields.getTextInputValue("shopping_amount") ||
    "Nicht angegeben";
  const reason =
    interaction.fields.getTextInputValue("shopping_reason") ||
    "Kein weiterer Hinweis";

  const insert = await query(
    `
      INSERT INTO shopping_requests (
        user_id,
        item,
        amount_text,
        reason
      )
      VALUES ($1, $2, $3, $4)
      RETURNING id;
    `,
    [interaction.user.id, item, amount, reason]
  );

  const requestId = insert.rows[0].id;

  const embed = createBaseEmbed(0x57f287)
    .setTitle(`🛒 • EINKAUF #${requestId}`)
    .addFields(
      { name: "Benötigt", value: item },
      { name: "Menge", value: amount },
      { name: "Hinweis", value: reason },
      { name: "Status", value: "🕒 Offen" },
      { name: "Eingetragen von", value: `${interaction.user}` }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`shopping_done:${requestId}`)
      .setLabel("Erledigt")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`shopping_open:${requestId}`)
      .setLabel("Wieder öffnen")
      .setEmoji("🕒")
      .setStyle(ButtonStyle.Secondary)
  );

  const message = await sendEmbed(CHANNELS.shopping, embed, {
    components: [row],
  });

  if (message) {
    await query(
      `
        UPDATE shopping_requests
        SET message_id = $1
        WHERE id = $2
      `,
      [message.id, requestId]
    );
  }

  return interaction.reply({
    content: "✅ Der Einkauf wurde eingetragen.",
    ephemeral: true,
  });
}

async function handleApplication(interaction) {
  const icName = formatName(
    interaction.fields.getTextInputValue("application_name")
  );
  const phone =
    interaction.fields.getTextInputValue("application_phone") ||
    "Nicht angegeben";
  const experience =
    interaction.fields.getTextInputValue("application_experience") ||
    "Keine Angabe";
  const motivation =
    interaction.fields.getTextInputValue("application_motivation");

  const insert = await query(
    `
      INSERT INTO applications (
        user_id,
        ic_name,
        phone,
        experience,
        motivation
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id;
    `,
    [
      interaction.user.id,
      icName,
      phone,
      experience,
      motivation,
    ]
  );

  const applicationId = insert.rows[0].id;

  const embed = createBaseEmbed()
    .setTitle(`📋 • IC-BEWERBUNG #${applicationId}`)
    .addFields(
      { name: "👤 IC-Name", value: icName },
      { name: "📞 Telefonnummer", value: phone },
      {
        name: "💼 Erfahrungen",
        value: experience.slice(0, 1024),
      },
      {
        name: "💬 Motivation",
        value: motivation.slice(0, 1024),
      },
      { name: "Discord", value: `${interaction.user}` },
      { name: "Status", value: "🕒 Offen" }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`application_accept:${applicationId}`)
      .setLabel("Angenommen")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`application_deny:${applicationId}`)
      .setLabel("Abgelehnt")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
  );

  const message = await sendEmbed(CHANNELS.applications, embed, {
    components: [row],
  });

  let threadId = null;

  if (message) {
    try {
      const cleanThreadName = normalizeName(icName)
        .replace(/\s+/g, "-")
        .slice(0, 55);

      const thread = await message.startThread({
        name:
          `bewerbung-${applicationId}-${cleanThreadName || "bewerber"}`.slice(
            0,
            100
          ),
        autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
        reason: `Bewerbung #${applicationId} von ${icName}`,
      });

      threadId = thread.id;

      await thread.members
        .add(interaction.user.id)
        .catch(() => null);

      await thread.send({
        content:
          `📋 **Bewerbungsgespräch #${applicationId}**\n` +
          `Bewerber: ${interaction.user}\n` +
          `IC-Name: **${icName}**\n\n` +
          "Hier können Rückfragen und das weitere Vorgehen besprochen werden.",
      });
    } catch (error) {
      console.error(
        `❌ Thread für Bewerbung #${applicationId} konnte nicht erstellt werden:`,
        error
      );
    }

    await query(
      `
        UPDATE applications
        SET message_id = $1, thread_id = $2
        WHERE id = $3
      `,
      [message.id, threadId, applicationId]
    );
  }

  return interaction.reply({
    content:
      threadId
        ? `✅ Deine Bewerbung wurde eingereicht. Der zugehörige Thread wurde erstellt: <#${threadId}>`
        : "✅ Deine Bewerbung wurde eingereicht.",
    ephemeral: true,
  });
}

async function handleHouseBan(interaction) {
  const personName = formatName(
    interaction.fields.getTextInputValue("houseban_name")
  );
  const reason =
    interaction.fields.getTextInputValue("houseban_reason");
  const duration =
    interaction.fields.getTextInputValue("houseban_duration");
  const evidence =
    interaction.fields.getTextInputValue("houseban_evidence") ||
    "Keine Angabe";

  const insert = await query(
    `
      INSERT INTO house_bans (
        creator_id,
        person_name,
        reason,
        duration_text,
        evidence
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id;
    `,
    [
      interaction.user.id,
      personName,
      reason,
      duration,
      evidence,
    ]
  );

  const banId = insert.rows[0].id;

  const embed = createBaseEmbed(0xed4245)
    .setTitle(`🚫 • HAUSVERBOT #${banId}`)
    .addFields(
      { name: "👤 Person", value: personName },
      { name: "📝 Grund", value: reason },
      { name: "⏳ Dauer", value: duration },
      { name: "📎 Beweise/Hinweise", value: evidence },
      { name: "Status", value: "🚫 Aktiv" },
      { name: "Eingetragen von", value: `${interaction.user}` }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`houseban_active:${banId}`)
      .setLabel("Aktiv")
      .setEmoji("🚫")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(`houseban_expired:${banId}`)
      .setLabel("Abgelaufen")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
  );

  const message = await sendEmbed(CHANNELS.houseBans, embed, {
    components: [row],
  });

  if (message) {
    await query(
      `
        UPDATE house_bans
        SET message_id = $1
        WHERE id = $2
      `,
      [message.id, banId]
    );
  }

  return interaction.reply({
    content: "✅ Das Hausverbot wurde dokumentiert.",
    ephemeral: true,
  });
}

// ============================================================
// MANAGEMENTFUNKTIONEN
// ============================================================

async function sendTeamUpdateMessage(embed) {
  return sendEmbed(CHANNELS.teamUpdates, embed);
}

async function issueWarning({
  targetUserId,
  warningRoleId,
  reason,
  issuerId,
}) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const targetMember = await guild.members
    .fetch(targetUserId)
    .catch(() => null);

  if (!targetMember) {
    throw new Error("Der Mitarbeiter wurde nicht auf dem Server gefunden.");
  }

  await safeAddRoles(
    targetMember,
    warningRoleId,
    `Verwarnung durch ${issuerId}`
  );

  await query(
    `
      INSERT INTO warning_records (
        user_id,
        warning_role_id,
        issuer_id,
        reason
      )
      VALUES ($1, $2, $3, $4);
    `,
    [targetUserId, warningRoleId, issuerId, reason]
  );

  await query(
    `
      INSERT INTO personnel_events (
        user_id,
        issuer_id,
        event_type,
        details
      )
      VALUES ($1, $2, 'Verwarnung', $3);
    `,
    [
      targetUserId,
      issuerId,
      `${reason} – <@&${warningRoleId}>`,
    ]
  );

  const embed = createBaseEmbed(0xed4245)
    .setTitle("⚠️ • VERWARNUNG")
    .addFields(
      { name: "Mitarbeiter", value: `<@${targetUserId}>` },
      { name: "Grund", value: reason },
      { name: "Verwarnung", value: `<@&${warningRoleId}>` },
      { name: "Ausgestellt von", value: `<@${issuerId}>` }
    );

  await sendTeamUpdateMessage(embed);
  await updateDashboardMessage().catch(() => null);
}

async function removeWarning({
  targetUserId,
  warningRoleId,
  issuerId,
}) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const targetMember = await guild.members
    .fetch(targetUserId)
    .catch(() => null);

  if (targetMember) {
    await safeRemoveRoles(
      targetMember,
      warningRoleId,
      `Verwarnung zurückgezogen durch ${issuerId}`
    );
  }

  await query(
    `
      UPDATE warning_records
      SET
        active = FALSE,
        removed_at = NOW(),
        removed_by = $3
      WHERE user_id = $1
        AND warning_role_id = $2
        AND active = TRUE;
    `,
    [targetUserId, warningRoleId, issuerId]
  );

  await query(
    `
      INSERT INTO personnel_events (
        user_id,
        issuer_id,
        event_type,
        details
      )
      VALUES ($1, $2, 'Verwarnung zurückgezogen', $3);
    `,
    [targetUserId, issuerId, `<@&${warningRoleId}> entfernt`]
  );

  const embed = createBaseEmbed(0x57f287)
    .setTitle("✅ • VERWARNUNG ZURÜCKGEZOGEN")
    .addFields(
      { name: "Mitarbeiter", value: `<@${targetUserId}>` },
      {
        name: "Entfernte Verwarnung",
        value: `<@&${warningRoleId}>`,
      },
      { name: "Bearbeitet von", value: `<@${issuerId}>` }
    );

  await sendTeamUpdateMessage(embed);
  await updateDashboardMessage().catch(() => null);
}

async function applyTeamUpdate({
  targetUserId,
  updateType,
  issuerId,
}) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const member = await guild.members.fetch(targetUserId).catch(() => null);

  if (!member) {
    throw new Error("Der ausgewählte Mitarbeiter wurde nicht gefunden.");
  }

  let roleIdsToAdd = [];
  let roleIdsToRemove = [];
  let label = "Unbekannte Position";

  if (updateType === "probation") {
    roleIdsToAdd = [
      ROLES.probationEmployee,
      ROLES.employeeAddon,
    ];
    roleIdsToRemove = [
      ROLES.employee,
      ROLES.probationManager,
      ...ROLES.management,
      ROLES.managementAccess,
    ];
    label = `<@&${ROLES.probationEmployee}>`;
  }

  if (updateType === "employee") {
    roleIdsToAdd = [
      ROLES.employee,
      ROLES.employeeAddon,
    ];
    roleIdsToRemove = [
      ROLES.probationEmployee,
      ROLES.probationManager,
      ...ROLES.management,
      ROLES.managementAccess,
    ];
    label = `<@&${ROLES.employee}>`;
  }

  if (updateType === "probation_manager") {
    roleIdsToAdd = [
      ROLES.employee,
      ROLES.employeeAddon,
      ROLES.managementAccess,
      ROLES.probationManager,
    ];
    roleIdsToRemove = [
      ROLES.probationEmployee,
      ...ROLES.management,
    ];
    label = `<@&${ROLES.probationManager}>`;
  }

  if (updateType === "manager") {
    roleIdsToAdd = [
      ROLES.employee,
      ROLES.employeeAddon,
      ROLES.managementAccess,
      ROLES.management[0],
    ];
    roleIdsToRemove = [
      ROLES.probationEmployee,
      ROLES.probationManager,
      ROLES.management[1],
    ];
    label = `<@&${ROLES.management[0]}>`;
  }

  if (updateType === "personal_manager") {
    roleIdsToAdd = [
      ROLES.employee,
      ROLES.employeeAddon,
      ROLES.managementAccess,
      ROLES.management[1],
    ];
    roleIdsToRemove = [
      ROLES.probationEmployee,
      ROLES.probationManager,
      ROLES.management[0],
    ];
    label = `<@&${ROLES.management[1]}>`;
  }

  if (label === "Unbekannte Position") {
    throw new Error("Die ausgewählte Position ist ungültig.");
  }

  suppressRoleSync(targetUserId);

  await safeRemoveRoles(
    member,
    roleIdsToRemove,
    `Teamupdate durch ${issuerId}`
  );

  await safeAddRoles(
    member,
    roleIdsToAdd,
    `Teamupdate durch ${issuerId}`
  );

  await ensureEmployee(targetUserId);

  await query(
    `
      INSERT INTO personnel_events (
        user_id,
        issuer_id,
        event_type,
        details
      )
      VALUES ($1, $2, 'Teamupdate', $3);
    `,
    [targetUserId, issuerId, `Neue Position: ${label}`]
  );

  const embed = createBaseEmbed(0x57f287)
    .setTitle("🎉 • TEAMUPDATE")
    .setDescription(
      `Herzlichen Glückwunsch <@${targetUserId}>!\n\n` +
        `Du wurdest offiziell zu ${label} ernannt.\n\n` +
        "Vielen Dank für deinen Einsatz in der Tiki Bar. 🍸"
    )
    .addFields({
      name: "Ausgestellt von",
      value: `<@${issuerId}>`,
    });

  await sendTeamUpdateMessage(embed);
  await updateDashboardMessage().catch(() => null);
}

async function terminateEmployee({
  targetUserId,
  note,
  issuerId,
}) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const member = await guild.members.fetch(targetUserId).catch(() => null);

  if (member) {
    suppressRoleSync(targetUserId, 12_000);

    await safeRemoveRoles(
      member,
      TERMINATION_REMOVE_ROLE_IDS,
      `Kündigung durch ${issuerId}`
    );
  }

  await query(`DELETE FROM active_sessions WHERE user_id = $1`, [
    targetUserId,
  ]);

  await query(
    `
      UPDATE employees
      SET left_server = TRUE, updated_at = NOW()
      WHERE user_id = $1;
    `,
    [targetUserId]
  );

  await query(
    `
      INSERT INTO personnel_events (
        user_id,
        issuer_id,
        event_type,
        details
      )
      VALUES ($1, $2, 'Kündigung', $3);
    `,
    [targetUserId, issuerId, note]
  );

  const embed = createBaseEmbed(0xed4245)
    .setTitle("📤 • KÜNDIGUNG")
    .setDescription(`<@${targetUserId}> hat das Team verlassen.`)
    .addFields(
      { name: "Notiz", value: note },
      { name: "Ausgestellt von", value: `<@${issuerId}>` }
    );

  await sendTeamUpdateMessage(embed);
  await updateDashboardMessage().catch(() => null);
}

async function documentTraining({
  targetUserId,
  instructorId,
  dateText,
  issuerId,
}) {
  await query(
    `
      INSERT INTO personnel_events (
        user_id,
        issuer_id,
        event_type,
        details
      )
      VALUES ($1, $2, 'Einweisung', $3);
    `,
    [
      targetUserId,
      issuerId,
      `Einweisung durch <@${instructorId}> am ${dateText}`,
    ]
  );

  const embed = createBaseEmbed(0x57f287)
    .setTitle("🧠 • EINWEISUNG DOKUMENTIERT")
    .addFields(
      { name: "Mitarbeiter", value: `<@${targetUserId}>` },
      { name: "Einweisung durch", value: `<@${instructorId}>` },
      { name: "Datum", value: dateText },
      { name: "Eingetragen von", value: `<@${issuerId}>` }
    );

  await sendEmbed(CHANNELS.training, embed);
}

// ============================================================
// ZEITVERWALTUNG
// ============================================================

async function applyTimeAdjustment({
  targetUserId,
  issuerId,
  action,
  minutes,
  note,
}) {
  await ensureEmployee(targetUserId);

  const result = await withTransaction(async (databaseClient) => {
    const employeeResult = await databaseClient.query(
      `
        SELECT weekly_minutes, total_minutes
        FROM employees
        WHERE user_id = $1
        FOR UPDATE;
      `,
      [targetUserId]
    );

    const oldWeekly = employeeResult.rows[0]?.weekly_minutes || 0;
    const oldTotal = employeeResult.rows[0]?.total_minutes || 0;
    let newWeekly = oldWeekly;
    let newTotal = oldTotal;

    if (action === "add") {
      newWeekly += minutes;
      newTotal += minutes;
    }

    if (action === "remove") {
      newWeekly = Math.max(0, newWeekly - minutes);
      newTotal = Math.max(0, newTotal - minutes);
    }

    if (action === "set_weekly") {
      newWeekly = minutes;
    }

    if (action === "set_total") {
      newTotal = minutes;
    }

    await databaseClient.query(
      `
        UPDATE employees
        SET
          weekly_minutes = $2,
          total_minutes = $3,
          updated_at = NOW()
        WHERE user_id = $1;
      `,
      [targetUserId, newWeekly, newTotal]
    );

    await databaseClient.query(
      `
        INSERT INTO time_adjustments (
          user_id,
          issuer_id,
          action,
          minutes,
          old_weekly_minutes,
          new_weekly_minutes,
          old_total_minutes,
          new_total_minutes,
          note
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
      `,
      [
        targetUserId,
        issuerId,
        action,
        minutes,
        oldWeekly,
        newWeekly,
        oldTotal,
        newTotal,
        note,
      ]
    );

    return {
      oldWeekly,
      newWeekly,
      oldTotal,
      newTotal,
    };
  });

  await updateDashboardMessage().catch(() => null);

  const actionLabels = {
    add: "Zeit hinzugefügt",
    remove: "Zeit entfernt",
    set_weekly: "Weekly-Zeit gesetzt",
    set_total: "Gesamtzeit gesetzt",
  };

  await sendGeneralLog(
    "⏱️ • ZEITVERWALTUNG",
    `**Mitarbeiter:** <@${targetUserId}>\n` +
      `**Aktion:** ${actionLabels[action] || action}\n` +
      `**Wert:** ${formatShortMinutes(minutes)}\n` +
      `**Weekly vorher/nachher:** ${formatShortMinutes(
        result.oldWeekly
      )} → ${formatShortMinutes(result.newWeekly)}\n` +
      `**Gesamt vorher/nachher:** ${formatShortMinutes(
        result.oldTotal
      )} → ${formatShortMinutes(result.newTotal)}\n` +
      `**Hinweis:** ${note || "Keine Angabe"}\n` +
      `**Bearbeitet von:** <@${issuerId}>`
  );

  return result;
}

// ============================================================
// FOODBUSINESS-ERKENNUNG
// ============================================================

function collectMessageText(message) {
  const parts = [message.content || ""];

  for (const embed of message.embeds || []) {
    if (embed.title) parts.push(embed.title);
    if (embed.description) parts.push(embed.description);

    for (const field of embed.fields || []) {
      parts.push(field.name || "");
      parts.push(field.value || "");
    }

    if (embed.footer?.text) {
      parts.push(embed.footer.text);
    }
  }

  return parts.filter(Boolean).join("\n");
}

function extractFoodbusinessAction(text) {
  if (/hat\s+sich\s+eingestempelt/i.test(text)) return "clock_in";
  if (/hat\s+sich\s+ausgestempelt/i.test(text)) return "clock_out";
  return null;
}

function extractFoodbusinessName(text) {
  const patterns = [
    /Der\s+Mitarbeiter\s+(.+?)\s+\(ID:\s*\d+\)/i,
    /Mitarbeiter\s*[:\n]\s*(.+?)\s+\(ID:\s*\d+\)/i,
    /Mitarbeiter\s+(.+?)\s+\(ID:\s*\d+\)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return formatName(
        match[1]
          .replace(/[`*_~|>]/g, "")
          .replace(/\s+/g, " ")
          .trim()
      );
    }
  }

  return null;
}

function extractFoodbusinessDurationMinutes(text) {
  const match = text.match(
    /Dauer:\s*(\d+)\s*Stunden?,\s*(\d+)\s*Minuten?,\s*([\d.,]+)\s*Sekunden?/i
  );

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(String(match[3]).replace(",", "."));
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;

  return Math.max(1, Math.ceil(totalSeconds / 60));
}

async function findMemberByIcName(guild, icName) {
  await guild.members.fetch().catch(() => null);

  const normalizedTarget = normalizeName(icName);
  const exactMatches = guild.members.cache.filter((member) => {
    if (member.user.bot) return false;

    const possibleNames = [
      member.displayName,
      member.nickname,
      member.user.globalName,
      member.user.username,
    ]
      .filter(Boolean)
      .map(normalizeName);

    return possibleNames.includes(normalizedTarget);
  });

  if (exactMatches.size === 1) {
    return exactMatches.first();
  }

  return null;
}

async function foodbusinessAlreadyProcessed(messageId) {
  const result = await query(
    `
      SELECT 1
      FROM foodbusiness_processed_logs
      WHERE message_id = $1
    `,
    [messageId]
  );

  return result.rowCount > 0;
}

async function saveFoodbusinessProcessed({
  messageId,
  userId,
  icName,
  action,
  minutes,
  status,
  originalText,
}) {
  await query(
    `
      INSERT INTO foodbusiness_processed_logs (
        message_id,
        user_id,
        ic_name,
        action,
        minutes,
        processing_status,
        original_text
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (message_id) DO NOTHING;
    `,
    [
      messageId,
      userId,
      icName,
      action,
      minutes || 0,
      status,
      originalText,
    ]
  );
}

async function sendUnresolvedFoodbusinessLog({
  icName,
  action,
  originalText,
}) {
  const actionText =
    action === "clock_in" ? "Einstempeln" : "Ausstempeln";

  const embed = createBaseEmbed(0xfee75c)
    .setTitle("⚠️ • FOODBUSINESS NICHT ZUGEORDNET")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        `👤 **IC-Name**\n└ ${icName || "Nicht erkannt"}\n\n` +
        `🛠️ **Aktion**\n└ ${actionText}\n\n` +
        "❌ **Problem**\n" +
        "└ Kein eindeutiger Discord-Name gefunden.\n\n" +
        "📄 **Originalmeldung**\n" +
        `└ ${originalText.slice(0, 1000)}\n` +
        "━━━━━━━━━━━━━━━━━━━━━━━━"
    );

  await sendEmbed(CHANNELS.dutyLogs, embed);
}

async function handleFoodbusinessClockIn({
  message,
  member,
  icName,
  originalText,
}) {
  await ensureEmployee(member.id);

  await query(
    `
      INSERT INTO active_sessions (
        user_id,
        ic_name,
        started_at,
        source_message_id
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id)
      DO UPDATE SET
        ic_name = EXCLUDED.ic_name,
        started_at = EXCLUDED.started_at,
        source_message_id = EXCLUDED.source_message_id;
    `,
    [member.id, icName, message.createdAt, message.id]
  );

  await safeAddRoles(
    member,
    ROLES.onDuty,
    "Automatisch über Foodbusiness eingestempelt"
  );

  await saveFoodbusinessProcessed({
    messageId: message.id,
    userId: member.id,
    icName,
    action: "clock_in",
    minutes: 0,
    status: "assigned",
    originalText,
  });

  await query(
    `DELETE FROM stale_duty_alerts WHERE user_id = $1`,
    [member.id]
  );

  const embed = createBaseEmbed(0x57f287)
    .setTitle("🟢 • FOODBUSINESS EINGESTEMPELT")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        `👤 **IC-Name**\n└ ${icName}\n\n` +
        `👥 **Discord-User**\n└ ${member}\n\n` +
        "✅ **Aktion**\n" +
        "└ Im-Dienst-Rolle wurde vergeben.\n\n" +
        "🛠️ **Zuordnung**\n" +
        "└ Automatisch\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━"
    )
    .setFooter({
      text: "Tiki Bar • Automatische Dienst-Erkennung",
    });

  await sendEmbed(CHANNELS.dutyLogs, embed);
  await updateDashboardMessage().catch(() => null);
}

async function handleFoodbusinessClockOut({
  message,
  member,
  icName,
  durationMinutes,
  originalText,
}) {
  await ensureEmployee(member.id);

  const sessionResult = await query(
    `
      SELECT started_at
      FROM active_sessions
      WHERE user_id = $1
    `,
    [member.id]
  );

  const startedAt =
    sessionResult.rows[0]?.started_at ||
    new Date(
      message.createdAt.getTime() -
        Math.max(1, durationMinutes || 1) * 60 * 1000
    );

  const calculatedMinutes = Math.max(
    1,
    Math.ceil(
      (message.createdAt.getTime() -
        new Date(startedAt).getTime()) /
        60000
    )
  );

  const minutes = durationMinutes || calculatedMinutes;

  await withTransaction(async (databaseClient) => {
    await databaseClient.query(
      `
        INSERT INTO work_sessions (
          user_id,
          ic_name,
          started_at,
          ended_at,
          minutes,
          corrected,
          source_message_id
        )
        VALUES ($1, $2, $3, $4, $5, FALSE, $6);
      `,
      [
        member.id,
        icName,
        startedAt,
        message.createdAt,
        minutes,
        message.id,
      ]
    );

    await databaseClient.query(
      `
        UPDATE employees
        SET
          weekly_minutes = weekly_minutes + $2,
          total_minutes = total_minutes + $2,
          left_server = FALSE,
          updated_at = NOW()
        WHERE user_id = $1;
      `,
      [member.id, minutes]
    );

    await databaseClient.query(
      `DELETE FROM active_sessions WHERE user_id = $1`,
      [member.id]
    );

    await databaseClient.query(
      `
        INSERT INTO foodbusiness_processed_logs (
          message_id,
          user_id,
          ic_name,
          action,
          minutes,
          processing_status,
          original_text
        )
        VALUES ($1, $2, $3, 'clock_out', $4, 'assigned', $5)
        ON CONFLICT (message_id) DO NOTHING;
      `,
      [message.id, member.id, icName, minutes, originalText]
    );
  });

  await safeRemoveRoles(
    member,
    ROLES.onDuty,
    "Automatisch über Foodbusiness ausgestempelt"
  );

  await query(
    `DELETE FROM stale_duty_alerts WHERE user_id = $1`,
    [member.id]
  );

  const embed = createBaseEmbed(0xed4245)
    .setTitle("🔴 • FOODBUSINESS AUSGESTEMPELT")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        `👤 **IC-Name**\n└ ${icName}\n\n` +
        `👥 **Discord-User**\n└ ${member}\n\n` +
        `⏱️ **Arbeitszeit**\n└ ${formatShortMinutes(minutes)}\n\n` +
        "🔴 **Aktion**\n" +
        "└ Im-Dienst-Rolle wurde entfernt.\n\n" +
        "🛠️ **Zuordnung**\n" +
        "└ Automatisch\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━"
    )
    .setFooter({
      text: "Tiki Bar • Foodbusiness Zeitlog",
    });

  await sendEmbed(CHANNELS.dutyLogs, embed);
  await updateDashboardMessage().catch(() => null);
}

async function processFoodbusinessTimeMessage(message) {
  if (
    message.channelId !== CHANNELS.foodbusinessTimeSource ||
    !message.author.bot
  ) {
    return;
  }

  if (await foodbusinessAlreadyProcessed(message.id)) {
    return;
  }

  const originalText = collectMessageText(message);
  const action = extractFoodbusinessAction(originalText);

  if (!action) return;

  const icName = extractFoodbusinessName(originalText);
  const durationMinutes =
    extractFoodbusinessDurationMinutes(originalText);
  const guild = message.guild;

  if (!guild || !icName) {
    await saveFoodbusinessProcessed({
      messageId: message.id,
      userId: null,
      icName: icName || "Unbekannt",
      action,
      minutes: durationMinutes || 0,
      status: "unresolved",
      originalText,
    });

    await sendUnresolvedFoodbusinessLog({
      icName,
      action,
      originalText,
    });

    return;
  }

  const member = await findMemberByIcName(guild, icName);

  if (!member) {
    await saveFoodbusinessProcessed({
      messageId: message.id,
      userId: null,
      icName,
      action,
      minutes: durationMinutes || 0,
      status: "unresolved",
      originalText,
    });

    await sendUnresolvedFoodbusinessLog({
      icName,
      action,
      originalText,
    });

    return;
  }

  if (action === "clock_in") {
    await handleFoodbusinessClockIn({
      message,
      member,
      icName,
      originalText,
    });
    return;
  }

  await handleFoodbusinessClockOut({
    message,
    member,
    icName,
    durationMinutes,
    originalText,
  });
}

async function processFoodbusinessMoneyMessage(message) {
  if (
    message.channelId !== CHANNELS.foodbusinessMoneySource ||
    !message.author.bot
  ) {
    return;
  }

  const originalText = collectMessageText(message);
  const existing = await query(
    `
      SELECT 1
      FROM foodbusiness_money_logs
      WHERE message_id = $1
    `,
    [message.id]
  );

  if (existing.rowCount > 0) return;

  const amountMatches = [
    ...originalText.matchAll(
      /(?:\$|€)\s*([\d.]+(?:,\d{1,2})?)/g
    ),
  ];

  const amount = amountMatches.length
    ? Number(
        amountMatches[0][1]
          .replace(/\./g, "")
          .replace(",", ".")
      )
    : null;

  await query(
    `
      INSERT INTO foodbusiness_money_logs (
        message_id,
        amount,
        original_text,
        logged_at
      )
      VALUES ($1, $2, $3, $4);
    `,
    [message.id, amount, originalText, message.createdAt]
  );
}

// ============================================================
// DIENSTKORREKTUR
// ============================================================

function parseCorrectionEndTime(rawInput, startedAt) {
  const raw = String(rawInput || "").trim();
  let match = raw.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/
  );

  if (match) {
    const [, day, month, year, hour, minute] = match;
    const date = createDateInTimeZone({
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
    });

    return Number.isNaN(date.getTime()) ? null : date;
  }

  match = raw.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) return null;

  const [, hourRaw, minuteRaw] = match;
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (hour > 23 || minute > 59) return null;

  const today = getCurrentDatePartsInTimeZone();
  const date = createDateInTimeZone({
    ...today,
    hour,
    minute,
  });

  if (date <= new Date(startedAt)) {
    const nextDay = new Date(
      Date.UTC(today.year, today.month - 1, today.day + 1)
    );
    const nextDayParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(nextDay);
    const part = (type) =>
      Number(
        nextDayParts.find((entry) => entry.type === type)?.value
      );

    return createDateInTimeZone({
      year: part("year"),
      month: part("month"),
      day: part("day"),
      hour,
      minute,
    });
  }

  return date;
}

async function createDutyCorrection(interaction) {
  const target = interaction.options.getUser("user");
  const endTimeRaw =
    interaction.options.getString("endzeit");
  const reason =
    interaction.options.getString("grund") || "Keine Angabe";

  const session = await query(
    `
      SELECT user_id, ic_name, started_at
      FROM active_sessions
      WHERE user_id = $1
    `,
    [target.id]
  );

  if (!session.rows[0]) {
    return interaction.reply({
      content: "❌ Dieser Mitarbeiter hat keinen aktiven Dienst.",
      ephemeral: true,
    });
  }

  const startedAt = new Date(session.rows[0].started_at);
  const endAt = parseCorrectionEndTime(endTimeRaw, startedAt);

  if (!endAt || endAt <= startedAt) {
    return interaction.reply({
      content:
        "❌ Die Endzeit ist ungültig oder liegt vor dem Dienstbeginn.",
      ephemeral: true,
    });
  }

  const minutes = Math.max(
    1,
    Math.ceil((endAt.getTime() - startedAt.getTime()) / 60000)
  );
  const token = generateToken();

  dutyCorrectionDrafts.set(token, {
    issuerId: interaction.user.id,
    targetUserId: target.id,
    icName: session.rows[0].ic_name,
    startedAt,
    endAt,
    minutes,
    reason,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  const embed = createBaseEmbed(0xfee75c)
    .setTitle("⚠️ • DIENST-KORREKTUR")
    .addFields(
      { name: "Mitarbeiter", value: `${target}` },
      {
        name: "Dienstbeginn",
        value: formatDateTime(startedAt),
        inline: true,
      },
      {
        name: "Gewünschtes Dienstende",
        value: formatDateTime(endAt),
        inline: true,
      },
      {
        name: "Zu buchende Arbeitszeit",
        value: formatShortMinutes(minutes),
      },
      { name: "Grund", value: reason }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`duty_correction_book:${token}`)
      .setLabel("Buchen")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`duty_correction_cancel:${token}`)
      .setLabel("Abbrechen")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
  );

  return interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });
}

async function bookDutyCorrection(interaction, token) {
  const draft = dutyCorrectionDrafts.get(token);

  if (!draft || draft.expiresAt < Date.now()) {
    dutyCorrectionDrafts.delete(token);

    return interaction.update({
      content:
        "❌ Diese Dienstkorrektur ist abgelaufen. Bitte führe den Command erneut aus.",
      embeds: [],
      components: [],
    });
  }

  if (
    interaction.user.id !== draft.issuerId &&
    !canManage(interaction.member)
  ) {
    return interaction.reply({
      content: "❌ Du darfst diese Korrektur nicht bestätigen.",
      ephemeral: true,
    });
  }

  const sessionCheck = await query(
    `
      SELECT started_at
      FROM active_sessions
      WHERE user_id = $1
    `,
    [draft.targetUserId]
  );

  if (!sessionCheck.rows[0]) {
    dutyCorrectionDrafts.delete(token);

    return interaction.update({
      content:
        "❌ Der aktive Dienst existiert nicht mehr. Es wurde nichts gebucht.",
      embeds: [],
      components: [],
    });
  }

  await ensureEmployee(draft.targetUserId);

  await withTransaction(async (databaseClient) => {
    await databaseClient.query(
      `
        INSERT INTO work_sessions (
          user_id,
          ic_name,
          started_at,
          ended_at,
          minutes,
          corrected,
          correction_reason
        )
        VALUES ($1, $2, $3, $4, $5, TRUE, $6);
      `,
      [
        draft.targetUserId,
        draft.icName,
        draft.startedAt,
        draft.endAt,
        draft.minutes,
        draft.reason,
      ]
    );

    await databaseClient.query(
      `
        UPDATE employees
        SET
          weekly_minutes = weekly_minutes + $2,
          total_minutes = total_minutes + $2,
          left_server = FALSE,
          updated_at = NOW()
        WHERE user_id = $1;
      `,
      [draft.targetUserId, draft.minutes]
    );

    await databaseClient.query(
      `
        INSERT INTO duty_corrections (
          user_id,
          issuer_id,
          started_at,
          corrected_end_at,
          minutes,
          reason
        )
        VALUES ($1, $2, $3, $4, $5, $6);
      `,
      [
        draft.targetUserId,
        interaction.user.id,
        draft.startedAt,
        draft.endAt,
        draft.minutes,
        draft.reason,
      ]
    );

    await databaseClient.query(
      `DELETE FROM active_sessions WHERE user_id = $1`,
      [draft.targetUserId]
    );
  });

  const guild = await client.guilds.fetch(GUILD_ID);
  const targetMember = await guild.members
    .fetch(draft.targetUserId)
    .catch(() => null);

  if (targetMember) {
    await safeRemoveRoles(
      targetMember,
      ROLES.onDuty,
      "Dienstkorrektur abgeschlossen"
    );
  }

  dutyCorrectionDrafts.delete(token);
  await updateDashboardMessage().catch(() => null);

  const logEmbed = createBaseEmbed(0x57f287)
    .setTitle("🔧 • DIENSTZEIT KORRIGIERT")
    .addFields(
      {
        name: "Mitarbeiter",
        value: `<@${draft.targetUserId}>`,
      },
      {
        name: "Zeitraum",
        value: `${formatDateTime(
          draft.startedAt
        )} bis ${formatDateTime(draft.endAt)}`,
      },
      {
        name: "Gebuchte Zeit",
        value: formatShortMinutes(draft.minutes),
      },
      { name: "Grund", value: draft.reason },
      {
        name: "Bearbeitet von",
        value: `${interaction.user}`,
      }
    );

  await sendEmbed(CHANNELS.dutyLogs, logEmbed);

  return interaction.update({
    content: `✅ ${formatShortMinutes(
      draft.minutes
    )} wurden für <@${draft.targetUserId}> gebucht.`,
    embeds: [],
    components: [],
  });
}

// ============================================================
// VERWARNUNGS-SYNC UND BEREINIGUNG
// ============================================================

async function syncWarningRecords() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const activeRecords = await query(
    `
      SELECT id, user_id, warning_role_id
      FROM warning_records
      WHERE active = TRUE
    `
  );

  let deactivated = 0;

  for (const record of activeRecords.rows) {
    const member = await guild.members
      .fetch(record.user_id)
      .catch(() => null);

    const roleStillExists =
      member?.roles.cache.has(record.warning_role_id) || false;

    if (!member || !roleStillExists) {
      await query(
        `
          UPDATE warning_records
          SET active = FALSE, removed_at = NOW()
          WHERE id = $1
        `,
        [record.id]
      );

      deactivated += 1;
    }
  }

  return {
    checked: activeRecords.rowCount,
    deactivated,
  };
}

async function cleanupOldData() {
  const results = {};

  results.processed = (
    await query(`
      DELETE FROM foodbusiness_processed_logs
      WHERE created_at < NOW() - INTERVAL '90 days'
    `)
  ).rowCount;

  results.money = (
    await query(`
      DELETE FROM foodbusiness_money_logs
      WHERE logged_at < NOW() - INTERVAL '180 days'
    `)
  ).rowCount;

  results.absences = (
    await query(`
      DELETE FROM absences
      WHERE date_to < CURRENT_DATE - INTERVAL '90 days'
    `)
  ).rowCount;

  results.alerts = (
    await query(`
      DELETE FROM stale_duty_alerts
      WHERE session_started_at < NOW() - INTERVAL '7 days'
    `)
  ).rowCount;

  return results;
}

// ============================================================
// STALE-DIENST-HINWEIS
// ============================================================

async function checkStaleDuties() {
  const result = await query(
    `
      SELECT user_id, ic_name, started_at
      FROM active_sessions
      WHERE started_at <= NOW() - INTERVAL '6 hours'
    `
  );

  for (const session of result.rows) {
    const oldAlert = await query(
      `
        SELECT last_alert_at
        FROM stale_duty_alerts
        WHERE user_id = $1
      `,
      [session.user_id]
    );

    const lastAlert = oldAlert.rows[0]?.last_alert_at
      ? new Date(oldAlert.rows[0].last_alert_at)
      : null;

    if (
      lastAlert &&
      Date.now() - lastAlert.getTime() <
        SETTINGS.staleDutyAfterMs
    ) {
      continue;
    }

    const embed = createBaseEmbed(0xfee75c)
      .setTitle("⚠️ • LANGER AKTIVER DIENST")
      .setDescription(
        `<@${session.user_id}> ist seit **${formatDateTime(
          session.started_at
        )}** eingestempelt.\n\n` +
          "Bitte prüfen, ob ein Crash oder vergessenes Ausstempeln vorliegt.\n" +
          "Bei Bedarf kann `/dienst-korrektur` verwendet werden."
      );

    await sendEmbed(CHANNELS.dutyLogs, embed);

    await query(
      `
        INSERT INTO stale_duty_alerts (
          user_id,
          session_started_at,
          last_alert_at
        )
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          session_started_at = EXCLUDED.session_started_at,
          last_alert_at = NOW();
      `,
      [session.user_id, session.started_at]
    );
  }
}

async function syncTeamMembers() {
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.members.fetch();

  const activeTeamIds = [];

  for (const member of guild.members.cache.values()) {
    if (member.user.bot || !isEmployee(member)) continue;

    activeTeamIds.push(member.id);
    await ensureEmployee(member.id);
  }

  if (activeTeamIds.length > 0) {
    await query(
      `
        UPDATE employees
        SET left_server = TRUE, updated_at = NOW()
        WHERE NOT (user_id = ANY($1::text[]));
      `,
      [activeTeamIds]
    );
  } else {
    await query(
      `
        UPDATE employees
        SET left_server = TRUE, updated_at = NOW();
      `
    );
  }

  return activeTeamIds.length;
}

// ============================================================
// STATUSCHECK
// ============================================================

async function buildStatusEmbed() {
  let databaseStatus = "❌ Nicht verbunden";

  try {
    await query("SELECT NOW()");
    databaseStatus = "✅ Verbunden";
  } catch (error) {
    console.error("❌ Statuscheck-Datenbankfehler:", error);
  }

  const channelChecks = await Promise.all(
    Object.entries({
      Registrierung: CHANNELS.registrationPanel,
      Mitarbeiterpanel: CHANNELS.employeePanel,
      Managementpanel: CHANNELS.managementPanel,
      Dashboard: CHANNELS.dashboard,
      "Foodbusiness-Quelle": CHANNELS.foodbusinessTimeSource,
      Dienstlogs: CHANNELS.dutyLogs,
    }).map(async ([name, channelId]) => {
      const channel = await fetchTextChannel(channelId);
      return `${channel ? "✅" : "❌"} ${name}`;
    })
  );

  return createBaseEmbed()
    .setTitle("🍸 • TIKI ASSISTENT STATUS")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        "🤖 **Discord-Bot**\n└ ✅ Online\n\n" +
        `🗄️ **Datenbank**\n└ ${databaseStatus}\n\n` +
        "📡 **Kanäle und Systeme**\n" +
        channelChecks.map((line) => `└ ${line}`).join("\n") +
        "\n━━━━━━━━━━━━━━━━━━━━━━━━"
    );
}

// ============================================================
// INTERACTIONS: SLASH-COMMANDS
// ============================================================

async function handleChatInputCommand(interaction) {
  if (interaction.commandName === "statuscheck") {
    const embed = await buildStatusEmbed();

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  if (interaction.commandName === "bot-hilfe") {
    const embed = createBaseEmbed()
      .setTitle("🍸 • TIKI ASSISTENT HILFE")
      .setDescription(
        "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
          "👤 `/registrierungspanel`\n" +
          "└ Registrierungssystem erstellen/aktualisieren\n\n" +
          "👥 `/mitarbeiterpanel`\n" +
          "└ Abmeldung, Einkauf, Bewerbung und Hausverbot\n\n" +
          "🛠️ `/managementpanel`\n" +
          "└ Verwarnungen, Teamupdates, Kündigungen, Einweisungen und Zeitverwaltung\n\n" +
          "🔧 `/dienst-korrektur`\n" +
          "└ Aktiven Dienst nach Crash korrekt abschließen\n\n" +
          "📁 `/akte`, `/personalnotiz`, `/mitarbeitercheck`\n" +
          "└ Personalverwaltung\n" +
          "━━━━━━━━━━━━━━━━━━━━━━━━"
      );

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  const managementOnlyCommands = [
    "mitarbeiterpanel",
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
  ];

  if (
    managementOnlyCommands.includes(interaction.commandName) &&
    !canManage(interaction.member)
  ) {
    return interaction.reply({
      content: "❌ Du darfst diesen Command nicht benutzen.",
      ephemeral: true,
    });
  }

  if (interaction.commandName === "registrierungspanel") {
    await interaction.deferReply({ ephemeral: true });
    await postRegistrationPanel();

    return interaction.editReply(
      `✅ Das Registrierungspanel wurde in <#${CHANNELS.registrationPanel}> erstellt oder aktualisiert.`
    );
  }

  if (interaction.commandName === "mitarbeiterpanel") {
    await interaction.deferReply({ ephemeral: true });
    await postEmployeePanel();

    return interaction.editReply(
      `✅ Das Mitarbeiterpanel wurde in <#${CHANNELS.employeePanel}> erstellt oder aktualisiert.`
    );
  }

  if (interaction.commandName === "managementpanel") {
    await interaction.deferReply({ ephemeral: true });
    await postManagementPanel();

    return interaction.editReply(
      `✅ Das Managementpanel wurde in <#${CHANNELS.managementPanel}> erstellt oder aktualisiert.`
    );
  }

  if (interaction.commandName === "dashboard") {
    await interaction.deferReply({ ephemeral: true });
    await updateDashboardOverview();

    return interaction.editReply(
      `✅ Dashboard, Wochenzeiten und Gesamtzeiten wurden in ` +
      `<#${CHANNELS.dashboard}> aktualisiert.`
    );
  }

  if (interaction.commandName === "akte") {
    const target = interaction.options.getUser("user");
    await interaction.deferReply({ ephemeral: true });
    await sendPersonalFileToChannel(
      target.id,
      interaction.user.id
    );

    return interaction.editReply(
      `✅ Die Personalakte von ${target} wurde in <#${CHANNELS.personalFiles}> gesendet.`
    );
  }

  if (interaction.commandName === "personalnotiz") {
    const target = interaction.options.getUser("user");
    const note = interaction.options.getString("notiz");

    await query(
      `
        INSERT INTO personal_file_notes (
          user_id,
          issuer_id,
          note
        )
        VALUES ($1, $2, $3);
      `,
      [target.id, interaction.user.id, note]
    );

    await sendPersonalFileToChannel(
      target.id,
      interaction.user.id
    );

    return interaction.reply({
      content: `✅ Die Notiz wurde zur Personalakte von ${target} hinzugefügt.`,
      ephemeral: true,
    });
  }

  if (interaction.commandName === "mitarbeitercheck") {
    const target = interaction.options.getUser("user");
    const embed = await buildEmployeeCheckEmbed(target.id);

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  if (interaction.commandName === "dienst-korrektur") {
    return createDutyCorrection(interaction);
  }

  if (interaction.commandName === "dienst-reset") {
    await interaction.deferReply({ ephemeral: true });

    const guild = await client.guilds.fetch(GUILD_ID);
    const activeSessions = await query(
      `SELECT user_id FROM active_sessions`
    );

    for (const row of activeSessions.rows) {
      const member = await guild.members
        .fetch(row.user_id)
        .catch(() => null);

      if (member) {
        await safeRemoveRoles(
          member,
          ROLES.onDuty,
          "Notfall-Dienstreset"
        );
      }
    }

    await query(`DELETE FROM active_sessions`);
    await query(`DELETE FROM stale_duty_alerts`);
    await updateDashboardMessage().catch(() => null);

    await sendGeneralLog(
      "🚨 • DIENST-RESET",
      `${interaction.user} hat ${activeSessions.rowCount} offene Sessions zurückgesetzt.`,
      0xed4245
    );

    return interaction.editReply(
      `✅ ${activeSessions.rowCount} aktive Sessions wurden zurückgesetzt. Es wurden keine Arbeitszeiten gebucht.`
    );
  }

  if (interaction.commandName === "verwarnungen-sync") {
    const result = await syncWarningRecords();
    await updateDashboardMessage().catch(() => null);

    return interaction.reply({
      content:
        `✅ ${result.checked} aktive Verwarnungen geprüft.\n` +
        `🧹 ${result.deactivated} veraltete Datensätze deaktiviert.`,
      ephemeral: true,
    });
  }

  if (interaction.commandName === "bot-cleanup") {
    const result = await cleanupOldData();

    return interaction.reply({
      content:
        "✅ Bereinigung abgeschlossen:\n" +
        `• Foodbusiness-Zeitlogs: ${result.processed}\n` +
        `• Foodbusiness-Geldlogs: ${result.money}\n` +
        `• Alte Abmeldungen: ${result.absences}\n` +
        `• Alte Diensthinweise: ${result.alerts}`,
      ephemeral: true,
    });
  }
}

// ============================================================
// INTERACTIONS: BUTTONS
// ============================================================

async function handleButton(interaction) {
  const customId = interaction.customId;

  if (
    customId === "leaderboard_weekly_prev" ||
    customId === "leaderboard_weekly_next" ||
    customId === "leaderboard_total_prev" ||
    customId === "leaderboard_total_next"
  ) {
    const [, type, direction] = customId.split("_");
    const currentPage = leaderboardPages[type] || 0;
    const requestedPage =
      direction === "next"
        ? currentPage + 1
        : currentPage - 1;

    const result = await buildLeaderboardPayload(
      type,
      requestedPage
    );

    return interaction.update(result.payload);
  }

  if (customId === "open_registration_modal") {
    return interaction.showModal(registrationModal());
  }

  const employeeActionButtons = [
    "open_absence_modal",
    "open_shopping_modal",
    "open_application_modal",
    "open_houseban_modal",
  ];

  if (
    employeeActionButtons.includes(customId) &&
    !canUseEmployeeFunctions(interaction.member)
  ) {
    return interaction.reply({
      content:
        "❌ Diese Funktion ist nur für Mitarbeiter und das Management verfügbar.",
      ephemeral: true,
    });
  }

  if (customId === "open_absence_modal") {
    const detectedName =
      interaction.member?.displayName ||
      interaction.user.globalName ||
      interaction.user.username;

    return interaction.showModal(absenceModal(detectedName));
  }

  if (customId === "open_shopping_modal") {
    return interaction.showModal(shoppingModal());
  }

  if (customId === "open_application_modal") {
    return interaction.showModal(applicationModal());
  }

  if (customId === "open_houseban_modal") {
    return interaction.showModal(houseBanModal());
  }

  if (
    customId.startsWith("shopping_") ||
    customId.startsWith("application_") ||
    customId.startsWith("houseban_") ||
    customId.startsWith("mgmt_") ||
    customId.startsWith("time_") ||
    customId.startsWith("duty_correction_")
  ) {
    if (!canManage(interaction.member)) {
      return interaction.reply({
        content: "❌ Du darfst diese Verwaltungsaktion nicht benutzen.",
        ephemeral: true,
      });
    }
  }

  if (customId.startsWith("shopping_done:")) {
    const id = customId.split(":")[1];

    await query(
      `
        UPDATE shopping_requests
        SET status = 'done', updated_at = NOW()
        WHERE id = $1
      `,
      [id]
    );

    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    const fields = embed.data.fields || [];
    const index = fields.findIndex((field) => field.name === "Status");

    if (index >= 0) fields[index].value = "✅ Erledigt";
    embed.setFields(fields);

    return interaction.update({
      embeds: [embed],
      components: interaction.message.components,
    });
  }

  if (customId.startsWith("shopping_open:")) {
    const id = customId.split(":")[1];

    await query(
      `
        UPDATE shopping_requests
        SET status = 'open', updated_at = NOW()
        WHERE id = $1
      `,
      [id]
    );

    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    const fields = embed.data.fields || [];
    const index = fields.findIndex((field) => field.name === "Status");

    if (index >= 0) fields[index].value = "🕒 Offen";
    embed.setFields(fields);

    return interaction.update({
      embeds: [embed],
      components: interaction.message.components,
    });
  }

  if (
    customId.startsWith("application_accept:") ||
    customId.startsWith("application_deny:")
  ) {
    const [action, id] = customId.split(":");
    const accepted = action === "application_accept";

    const applicationUpdate = await query(
      `
        UPDATE applications
        SET status = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING thread_id, user_id
      `,
      [id, accepted ? "accepted" : "denied"]
    );

    const applicationRecord = applicationUpdate.rows[0] || null;

    if (applicationRecord?.thread_id) {
      const thread = await client.channels
        .fetch(applicationRecord.thread_id)
        .catch(() => null);

      if (thread?.isThread()) {
        await thread
          .send({
            content: accepted
              ? `✅ Die Bewerbung wurde von ${interaction.user} angenommen.`
              : `❌ Die Bewerbung wurde von ${interaction.user} abgelehnt.`,
          })
          .catch(() => null);

        await thread
          .setArchived(
            true,
            `Bewerbung #${id} wurde ${
              accepted ? "angenommen" : "abgelehnt"
            }`
          )
          .catch(() => null);
      }
    }

    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    const fields = embed.data.fields || [];
    const index = fields.findIndex((field) => field.name === "Status");

    if (index >= 0) {
      fields[index].value = accepted
        ? `✅ Angenommen von ${interaction.user}`
        : `❌ Abgelehnt von ${interaction.user}`;
    }

    embed.setFields(fields);

    return interaction.update({
      embeds: [embed],
      components: [],
    });
  }

  if (
    customId.startsWith("houseban_active:") ||
    customId.startsWith("houseban_expired:")
  ) {
    const [action, id] = customId.split(":");
    const active = action === "houseban_active";

    await query(
      `
        UPDATE house_bans
        SET status = $2, updated_at = NOW()
        WHERE id = $1
      `,
      [id, active ? "active" : "expired"]
    );

    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    const fields = embed.data.fields || [];
    const index = fields.findIndex((field) => field.name === "Status");

    if (index >= 0) {
      fields[index].value = active
        ? "🚫 Aktiv"
        : `✅ Abgelaufen – bearbeitet von ${interaction.user}`;
    }

    embed.setFields(fields);

    return interaction.update({
      embeds: [embed],
      components: interaction.message.components,
    });
  }

  if (customId === "mgmt_warning_start") {
    managementDrafts.delete(
      draftKey(interaction.user.id, "warning")
    );

    return interaction.reply({
      content: "Wähle den Mitarbeiter für die Verwarnung aus:",
      components: [userSelect("mgmt_warning_user")],
      ephemeral: true,
    });
  }

  if (customId === "mgmt_warning_reason") {
    const draft = managementDrafts.get(
      draftKey(interaction.user.id, "warning")
    );

    if (!draft?.targetUserId || !draft?.warningRoleId) {
      return interaction.reply({
        content: "❌ Die Verwarnungsauswahl ist abgelaufen.",
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId("mgmt_warning_modal")
      .setTitle("Verwarnung ausstellen")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("warning_reason")
            .setLabel("Grund der Verwarnung")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(800)
            .setRequired(true)
        )
      );

    return interaction.showModal(modal);
  }

  if (customId === "mgmt_teamupdate_start") {
    managementDrafts.delete(
      draftKey(interaction.user.id, "teamupdate")
    );

    return interaction.reply({
      content: "Wähle den Mitarbeiter für das Teamupdate aus:",
      components: [userSelect("mgmt_teamupdate_user")],
      ephemeral: true,
    });
  }

  if (customId === "mgmt_termination_start") {
    managementDrafts.delete(
      draftKey(interaction.user.id, "termination")
    );

    return interaction.reply({
      content: "Wähle den Mitarbeiter für die Kündigung aus:",
      components: [userSelect("mgmt_termination_user")],
      ephemeral: true,
    });
  }

  if (customId === "mgmt_termination_continue") {
    const draft = managementDrafts.get(
      draftKey(interaction.user.id, "termination")
    );

    if (!draft?.targetUserId) {
      return interaction.reply({
        content: "❌ Die Auswahl ist abgelaufen.",
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId("mgmt_termination_modal")
      .setTitle("Kündigung dokumentieren")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("termination_note")
            .setLabel("Notiz / Grund")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(800)
            .setRequired(true)
        )
      );

    return interaction.showModal(modal);
  }

  if (customId === "mgmt_warning_remove_start") {
    managementDrafts.delete(
      draftKey(interaction.user.id, "warning_remove")
    );

    return interaction.reply({
      content:
        "Wähle den Mitarbeiter, dessen Verwarnung zurückgezogen werden soll:",
      components: [userSelect("mgmt_warning_remove_user")],
      ephemeral: true,
    });
  }

  if (customId === "mgmt_training_start") {
    managementDrafts.delete(
      draftKey(interaction.user.id, "training")
    );

    return interaction.reply({
      content: "Wähle den eingewiesenen Mitarbeiter aus:",
      components: [userSelect("mgmt_training_target")],
      ephemeral: true,
    });
  }

  if (customId === "mgmt_training_continue") {
    const draft = managementDrafts.get(
      draftKey(interaction.user.id, "training")
    );

    if (!draft?.targetUserId || !draft?.instructorId) {
      return interaction.reply({
        content: "❌ Die Auswahl ist abgelaufen.",
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId("mgmt_training_modal")
      .setTitle("Einweisung dokumentieren")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("training_date")
            .setLabel("Datum der Einweisung")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("14.07.2026")
            .setRequired(true)
        )
      );

    return interaction.showModal(modal);
  }

  if (customId === "mgmt_time_start") {
    timeManagementDrafts.delete(interaction.user.id);

    return interaction.reply({
      content: "Wähle den Mitarbeiter für die Zeitverwaltung aus:",
      components: [userSelect("time_target_user")],
      ephemeral: true,
    });
  }

  if (customId === "time_action_continue") {
    const draft = timeManagementDrafts.get(interaction.user.id);

    if (!draft?.targetUserId || !draft?.action) {
      return interaction.reply({
        content: "❌ Die Auswahl ist abgelaufen.",
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId("time_adjustment_modal")
      .setTitle("Arbeitszeit bearbeiten")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("time_minutes")
            .setLabel("Minuten")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Zum Beispiel 90")
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("time_note")
            .setLabel("Hinweis / Grund")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(500)
            .setRequired(false)
        )
      );

    return interaction.showModal(modal);
  }

  if (customId.startsWith("duty_correction_book:")) {
    const token = customId.split(":")[1];
    return bookDutyCorrection(interaction, token);
  }

  if (customId.startsWith("duty_correction_cancel:")) {
    const token = customId.split(":")[1];
    const draft = dutyCorrectionDrafts.get(token);

    if (
      draft &&
      interaction.user.id !== draft.issuerId &&
      !canManage(interaction.member)
    ) {
      return interaction.reply({
        content: "❌ Du darfst diese Korrektur nicht abbrechen.",
        ephemeral: true,
      });
    }

    dutyCorrectionDrafts.delete(token);

    return interaction.update({
      content:
        "❌ Die Dienstkorrektur wurde abgebrochen. Es wurde nichts verändert.",
      embeds: [],
      components: [],
    });
  }
}

// ============================================================
// INTERACTIONS: USER-SELECTS
// ============================================================

async function handleUserSelect(interaction) {
  if (!canManage(interaction.member)) {
    return interaction.reply({
      content: "❌ Du darfst diese Auswahl nicht benutzen.",
      ephemeral: true,
    });
  }

  const selectedUserId = interaction.values[0];

  if (interaction.customId === "mgmt_warning_user") {
    managementDrafts.set(
      draftKey(interaction.user.id, "warning"),
      { targetUserId: selectedUserId }
    );

    return interaction.update({
      content: `Mitarbeiter: <@${selectedUserId}>\nWähle die Verwarnungsstufe:`,
      components: [warningRoleSelect("mgmt_warning_role")],
    });
  }

  if (interaction.customId === "mgmt_teamupdate_user") {
    managementDrafts.set(
      draftKey(interaction.user.id, "teamupdate"),
      { targetUserId: selectedUserId }
    );

    return interaction.update({
      content: `Mitarbeiter: <@${selectedUserId}>\nWähle die neue Position:`,
      components: [teamUpdateRoleSelect()],
    });
  }

  if (interaction.customId === "mgmt_termination_user") {
    managementDrafts.set(
      draftKey(interaction.user.id, "termination"),
      { targetUserId: selectedUserId }
    );

    return interaction.update({
      content: `Ausgewählt: <@${selectedUserId}>`,
      components: [
        continueButton(
          "mgmt_termination_continue",
          "Kündigung fortsetzen"
        ),
      ],
    });
  }

  if (interaction.customId === "mgmt_warning_remove_user") {
    managementDrafts.set(
      draftKey(interaction.user.id, "warning_remove"),
      { targetUserId: selectedUserId }
    );

    return interaction.update({
      content: `Mitarbeiter: <@${selectedUserId}>\nWelche Verwarnung soll entfernt werden?`,
      components: [
        warningRoleSelect("mgmt_warning_remove_role"),
      ],
    });
  }

  if (interaction.customId === "mgmt_training_target") {
    managementDrafts.set(
      draftKey(interaction.user.id, "training"),
      { targetUserId: selectedUserId }
    );

    return interaction.update({
      content: `Mitarbeiter: <@${selectedUserId}>\nWer hat die Einweisung durchgeführt?`,
      components: [
        userSelect(
          "mgmt_training_instructor",
          "Einweisende Person auswählen"
        ),
      ],
    });
  }

  if (interaction.customId === "mgmt_training_instructor") {
    const key = draftKey(interaction.user.id, "training");
    const draft = managementDrafts.get(key) || {};
    draft.instructorId = selectedUserId;
    managementDrafts.set(key, draft);

    return interaction.update({
      content:
        `Mitarbeiter: <@${draft.targetUserId}>\n` +
        `Einweisung durch: <@${selectedUserId}>`,
      components: [
        continueButton(
          "mgmt_training_continue",
          "Datum eintragen"
        ),
      ],
    });
  }

  if (interaction.customId === "time_target_user") {
    timeManagementDrafts.set(interaction.user.id, {
      targetUserId: selectedUserId,
    });

    return interaction.update({
      content: `Mitarbeiter: <@${selectedUserId}>\nWähle die Zeitaktion:`,
      components: [timeActionSelect()],
    });
  }
}

// ============================================================
// INTERACTIONS: STRING-SELECTS
// ============================================================

async function handleStringSelect(interaction) {
  if (!canManage(interaction.member)) {
    return interaction.reply({
      content: "❌ Du darfst diese Auswahl nicht benutzen.",
      ephemeral: true,
    });
  }

  const value = interaction.values[0];

  if (interaction.customId === "mgmt_warning_role") {
    const key = draftKey(interaction.user.id, "warning");
    const draft = managementDrafts.get(key);

    if (!draft?.targetUserId) {
      return interaction.update({
        content: "❌ Die Auswahl ist abgelaufen.",
        components: [],
      });
    }

    draft.warningRoleId = value;
    managementDrafts.set(key, draft);

    return interaction.update({
      content:
        `Mitarbeiter: <@${draft.targetUserId}>\n` +
        `Verwarnung: <@&${value}>`,
      components: [
        continueButton(
          "mgmt_warning_reason",
          "Grund eintragen"
        ),
      ],
    });
  }

  if (interaction.customId === "mgmt_teamupdate_role") {
    const key = draftKey(interaction.user.id, "teamupdate");
    const draft = managementDrafts.get(key);

    if (!draft?.targetUserId) {
      return interaction.update({
        content: "❌ Die Auswahl ist abgelaufen.",
        components: [],
      });
    }

    await interaction.deferUpdate();

    await applyTeamUpdate({
      targetUserId: draft.targetUserId,
      updateType: value,
      issuerId: interaction.user.id,
    });

    managementDrafts.delete(key);

    return interaction.editReply({
      content: `✅ Das Teamupdate für <@${draft.targetUserId}> wurde durchgeführt.`,
      components: [],
    });
  }

  if (interaction.customId === "mgmt_warning_remove_role") {
    const key = draftKey(
      interaction.user.id,
      "warning_remove"
    );
    const draft = managementDrafts.get(key);

    if (!draft?.targetUserId) {
      return interaction.update({
        content: "❌ Die Auswahl ist abgelaufen.",
        components: [],
      });
    }

    await interaction.deferUpdate();

    await removeWarning({
      targetUserId: draft.targetUserId,
      warningRoleId: value,
      issuerId: interaction.user.id,
    });

    managementDrafts.delete(key);

    return interaction.editReply({
      content: `✅ Die Verwarnung von <@${draft.targetUserId}> wurde zurückgezogen.`,
      components: [],
    });
  }

  if (interaction.customId === "time_action_select") {
    const draft = timeManagementDrafts.get(interaction.user.id);

    if (!draft?.targetUserId) {
      return interaction.update({
        content: "❌ Die Auswahl ist abgelaufen.",
        components: [],
      });
    }

    if (value === "view") {
      const embed = await buildEmployeeCheckEmbed(
        draft.targetUserId
      );

      timeManagementDrafts.delete(interaction.user.id);

      return interaction.update({
        content: "",
        embeds: [embed],
        components: [],
      });
    }

    draft.action = value;
    timeManagementDrafts.set(interaction.user.id, draft);

    return interaction.update({
      content:
        `Mitarbeiter: <@${draft.targetUserId}>\n` +
        `Aktion: **${value}**`,
      components: [
        continueButton(
          "time_action_continue",
          "Minuten eintragen"
        ),
      ],
    });
  }
}

// ============================================================
// INTERACTIONS: MODALS
// ============================================================

async function handleModal(interaction) {
  if (interaction.customId === "registration_modal") {
    return handleRegistration(interaction);
  }

  if (interaction.customId === "absence_modal") {
    return handleAbsence(interaction);
  }

  if (interaction.customId === "shopping_modal") {
    return handleShopping(interaction);
  }

  if (interaction.customId === "application_modal") {
    return handleApplication(interaction);
  }

  if (interaction.customId === "houseban_modal") {
    return handleHouseBan(interaction);
  }

  if (!canManage(interaction.member)) {
    return interaction.reply({
      content: "❌ Du darfst dieses Formular nicht absenden.",
      ephemeral: true,
    });
  }

  if (interaction.customId === "mgmt_warning_modal") {
    const key = draftKey(interaction.user.id, "warning");
    const draft = managementDrafts.get(key);

    if (!draft?.targetUserId || !draft?.warningRoleId) {
      return interaction.reply({
        content: "❌ Die Verwarnungsauswahl ist abgelaufen.",
        ephemeral: true,
      });
    }

    const reason =
      interaction.fields.getTextInputValue("warning_reason");

    await issueWarning({
      targetUserId: draft.targetUserId,
      warningRoleId: draft.warningRoleId,
      reason,
      issuerId: interaction.user.id,
    });

    managementDrafts.delete(key);

    return interaction.reply({
      content: `✅ Die Verwarnung für <@${draft.targetUserId}> wurde ausgestellt.`,
      ephemeral: true,
    });
  }

  if (interaction.customId === "mgmt_termination_modal") {
    const key = draftKey(
      interaction.user.id,
      "termination"
    );
    const draft = managementDrafts.get(key);

    if (!draft?.targetUserId) {
      return interaction.reply({
        content: "❌ Die Auswahl ist abgelaufen.",
        ephemeral: true,
      });
    }

    const note =
      interaction.fields.getTextInputValue("termination_note");

    await terminateEmployee({
      targetUserId: draft.targetUserId,
      note,
      issuerId: interaction.user.id,
    });

    managementDrafts.delete(key);

    return interaction.reply({
      content: `✅ Die Kündigung von <@${draft.targetUserId}> wurde dokumentiert.`,
      ephemeral: true,
    });
  }

  if (interaction.customId === "mgmt_training_modal") {
    const key = draftKey(interaction.user.id, "training");
    const draft = managementDrafts.get(key);

    if (!draft?.targetUserId || !draft?.instructorId) {
      return interaction.reply({
        content: "❌ Die Auswahl ist abgelaufen.",
        ephemeral: true,
      });
    }

    const dateText =
      interaction.fields.getTextInputValue("training_date");

    if (!parseGermanDate(dateText)) {
      return interaction.reply({
        content:
          "❌ Bitte gib das Datum im Format TT.MM.JJJJ ein.",
        ephemeral: true,
      });
    }

    await documentTraining({
      targetUserId: draft.targetUserId,
      instructorId: draft.instructorId,
      dateText,
      issuerId: interaction.user.id,
    });

    managementDrafts.delete(key);

    return interaction.reply({
      content: "✅ Die Einweisung wurde dokumentiert.",
      ephemeral: true,
    });
  }

  if (interaction.customId === "time_adjustment_modal") {
    const draft = timeManagementDrafts.get(
      interaction.user.id
    );

    if (!draft?.targetUserId || !draft?.action) {
      return interaction.reply({
        content: "❌ Die Auswahl ist abgelaufen.",
        ephemeral: true,
      });
    }

    const minutes = parsePositiveMinutes(
      interaction.fields.getTextInputValue("time_minutes")
    );
    const note =
      interaction.fields.getTextInputValue("time_note") ||
      "Keine Angabe";

    if (minutes === null) {
      return interaction.reply({
        content:
          "❌ Bitte gib eine gültige positive Minutenzahl ein.",
        ephemeral: true,
      });
    }

    const result = await applyTimeAdjustment({
      targetUserId: draft.targetUserId,
      issuerId: interaction.user.id,
      action: draft.action,
      minutes,
      note,
    });

    timeManagementDrafts.delete(interaction.user.id);

    return interaction.reply({
      content:
        `✅ Arbeitszeit von <@${draft.targetUserId}> aktualisiert.\n` +
        `Weekly: **${formatShortMinutes(
          result.newWeekly
        )}**\n` +
        `Gesamt: **${formatShortMinutes(result.newTotal)}**`,
      ephemeral: true,
    });
  }
}

// ============================================================
// ZENTRALER INTERACTION-HANDLER
// ============================================================

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      return await handleChatInputCommand(interaction);
    }

    if (interaction.isButton()) {
      return await handleButton(interaction);
    }

    if (interaction.isUserSelectMenu()) {
      return await handleUserSelect(interaction);
    }

    if (interaction.isStringSelectMenu()) {
      return await handleStringSelect(interaction);
    }

    if (interaction.isModalSubmit()) {
      return await handleModal(interaction);
    }
  } catch (error) {
    console.error("❌ Interaction-Fehler:", error);

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
// NACHRICHTEN / FOODBUSINESS
// ============================================================

client.on(Events.MessageCreate, async (message) => {
  try {
    await processFoodbusinessTimeMessage(message);
    await processFoodbusinessMoneyMessage(message);
  } catch (error) {
    console.error("❌ Foodbusiness-Verarbeitungsfehler:", error);

    await sendGeneralLog(
      "❌ • FOODBUSINESS-FEHLER",
      `**Kanal:** <#${message.channelId}>\n` +
        `**Nachricht:** ${message.id}\n` +
        `**Fehler:** ${String(error.message || error).slice(
          0,
          1000
        )}`,
      0xed4245
    );
  }
});

// ============================================================
// MEMBER-EVENTS
// ============================================================

client.on(Events.GuildMemberAdd, async (member) => {
  if (member.guild.id !== GUILD_ID) return;

  const embed = createBaseEmbed(0x57f287)
    .setTitle("🌺 • WILLKOMMEN IN DER TIKI BAR")
    .setDescription(
      `Willkommen ${member}!\n\n` +
        `Schön, dass du bei der **${BRAND.name}** dabei bist. 🍸\n` +
        `Bitte registriere dich in <#${CHANNELS.registrationPanel}>.`
    )
    .setThumbnail(member.user.displayAvatarURL());

  await sendEmbed(CHANNELS.welcome, embed);
});

client.on(Events.GuildMemberRemove, async (member) => {
  if (member.guild.id !== GUILD_ID) return;

  await query(
    `
      UPDATE employees
      SET left_server = TRUE, updated_at = NOW()
      WHERE user_id = $1
    `,
    [member.id]
  ).catch(() => null);

  await query(
    `DELETE FROM active_sessions WHERE user_id = $1`,
    [member.id]
  ).catch(() => null);

  const embed = createBaseEmbed(0xed4245)
    .setTitle("🌴 • MITGLIED VERLASSEN")
    .setDescription(
      `**${member.user.tag}** hat den Tiki-Bar-Discord verlassen.`
    )
    .setThumbnail(member.user.displayAvatarURL());

  await sendEmbed(CHANNELS.leave, embed);
  await updateDashboardMessage().catch(() => null);
});

client.on(
  Events.GuildMemberUpdate,
  async (oldMember, newMember) => {
    if (newMember.guild.id !== GUILD_ID) return;
    if (isRoleSyncSuppressed(newMember.id)) return;

    try {
      const hadEmployeeRole = isEmployee(oldMember);
      const hasEmployeeRole = isEmployee(newMember);

      const hadManagerRole = hasManagerPosition(oldMember);
      const hasManagerRole = hasManagerPosition(newMember);

      const employeeWasAdded =
        !oldMember.roles.cache.has(ROLES.employee) &&
        newMember.roles.cache.has(ROLES.employee);

      // Wer direkt Probe-Manager, Manager oder Personal Manager wird,
      // erhält automatisch normale Mitarbeiterrolle, Zusatzrolle
      // und Verwaltungsrolle. Probe-Mitarbeiter wird entfernt.
      if (hasManagerRole) {
        await safeAddRoles(
          newMember,
          [
            ROLES.employee,
            ROLES.employeeAddon,
            ROLES.managementAccess,
          ],
          "Automatische Rollenverknüpfung für Management"
        );

        await safeRemoveRoles(
          newMember,
          ROLES.probationEmployee,
          "Management erhält die normale Mitarbeiterrolle"
        );
      } else if (hasEmployeeRole) {
        // Probe-Mitarbeiter und Mitarbeiter erhalten immer
        // die Mitarbeiterzusatzrolle.
        await safeAddRoles(
          newMember,
          ROLES.employeeAddon,
          "Automatische Mitarbeiterzusatzrolle"
        );

        // Beim Aufstieg von Probe-Mitarbeiter zu Mitarbeiter
        // wird Probe-Mitarbeiter automatisch entfernt.
        if (employeeWasAdded) {
          await safeRemoveRoles(
            newMember,
            ROLES.probationEmployee,
            "Aufstieg zum Mitarbeiter"
          );
        }
      }

      // Wenn die letzte Managementposition entfernt wurde,
      // wird auch die Verwaltungsrolle entfernt.
      if (hadManagerRole && !hasManagerRole) {
        await safeRemoveRoles(
          newMember,
          ROLES.managementAccess,
          "Keine Managementposition mehr vorhanden"
        );
      }

      // Wenn weder Mitarbeiter- noch Managementposition vorhanden ist,
      // wird auch die Mitarbeiterzusatzrolle entfernt.
      if (!hasEmployeeRole && !hasManagerRole) {
        await safeRemoveRoles(
          newMember,
          ROLES.employeeAddon,
          "Keine Mitarbeiterposition mehr vorhanden"
        );
      }

      const shouldCountAsEmployee =
        hasEmployeeRole || hasManagerRole;

      const countedBefore =
        hadEmployeeRole || hadManagerRole;

      if (!countedBefore && shouldCountAsEmployee) {
        await ensureEmployee(newMember.id);
      }

      if (countedBefore && !shouldCountAsEmployee) {
        await query(
          `
            UPDATE employees
            SET left_server = TRUE, updated_at = NOW()
            WHERE user_id = $1
          `,
          [newMember.id]
        );

        await query(
          `DELETE FROM active_sessions WHERE user_id = $1`,
          [newMember.id]
        );

        await safeRemoveRoles(
          newMember,
          ROLES.onDuty,
          "Keine Mitarbeiter- oder Managementposition mehr vorhanden"
        );
      }

      await updateDashboardMessage().catch(() => null);
    } catch (error) {
      console.error(
        `❌ Automatische Rollensynchronisierung für ${newMember.id} fehlgeschlagen:`,
        error
      );
    }
  }
);

// ============================================================
// BOT-STATUS
// ============================================================

const BOT_STATUSES = ["Made by Kquwi☦", "Tiki Bar 🍸"];
let statusIndex = 0;

function updateBotStatus() {
  if (!client.user) return;

  client.user.setPresence({
    activities: [
      {
        name: BOT_STATUSES[statusIndex],
        type: ActivityType.Watching,
      },
    ],
    status: "online",
  });

  statusIndex = (statusIndex + 1) % BOT_STATUSES.length;
}

// ============================================================
// READY
// ============================================================

client.once(Events.ClientReady, async (readyClient) => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✅ Eingeloggt als ${readyClient.user.tag}`);
  console.log(`🍸 Projekt: ${BRAND.name}`);
  console.log(`🏠 Server-ID: ${GUILD_ID}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    await initDatabase();
    await registerCommands();
    const syncedTeamMembers = await syncTeamMembers();

    const guild = await client.guilds.fetch(GUILD_ID);
    const botMember = await guild.members.fetchMe();

    await botMember
      .setNickname(BRAND.botNickname)
      .catch((error) => {
        console.warn(
          "⚠️ Bot-Nickname konnte nicht gesetzt werden:",
          error.message
        );
      });

    updateBotStatus();
    setInterval(updateBotStatus, SETTINGS.statusIntervalMs);

    await updateDashboardOverview().catch((error) => {
      console.warn(
        "⚠️ Dashboard-Übersichten konnten beim Start nicht aktualisiert werden:",
        error.message
      );
    });

    setInterval(() => {
      updateDashboardOverview().catch((error) =>
        console.error(
          "❌ Dashboard-Übersichtsfehler:",
          error
        )
      );
    }, SETTINGS.dashboardIntervalMs);

    setInterval(() => {
      checkStaleDuties().catch((error) =>
        console.error("❌ Dienstprüfungsfehler:", error)
      );
    }, SETTINGS.staleDutyCheckIntervalMs);

    console.log(
      `✅ ${syncedTeamMembers} vorhandene Teammitglieder synchronisiert.`
    );
    console.log("✅ Tiki Assistent vollständig gestartet.");
    console.log("✅ Foodbusiness-Erkennung ist aktiv.");
  } catch (error) {
    console.error("❌ Fehler beim Bot-Start:", error);
  }
});

// ============================================================
// FEHLERBEHANDLUNG
// ============================================================

client.on(Events.Error, (error) => {
  console.error("❌ Discord-Client-Fehler:", error);
});

client.on(Events.Warn, (warning) => {
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
