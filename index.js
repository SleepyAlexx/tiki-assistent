if (process.env.NODE_ENV !== "production") require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
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

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const DATABASE_URL = process.env.DATABASE_URL;

// Discord Bot Index Complete
// =====================
// ROLLEN
// =====================
const MANAGER_ROLE_ID = "1425374323203637248";
const EMPLOYEE_ROLE_ID = "1425374595526955081";
const PROBE_ROLE_ID = "1497980251416953054";
const DUTY_ROLE_ID = "1425379823387283456";
const PERSONAL_MANAGER_ROLE_ID = "1498116278328754307";

const WARNING_ROLE_1_ID = "1497609465443127346";
const WARNING_ROLE_2_ID = "1497609549903823078";
const TEAMUPDATE_EMPLOYEE_ROLE_ID = "1425373925147283597";
const TEAMUPDATE_PROBE_MANAGER_ROLE_ID = "1503473305439567953";
const TEAMUPDATE_MANAGER_ROLE_ID = "1425374060287889530";
const TEAMUPDATE_MANAGER_BASE_ROLE_ID = "1425374323203637248";
const TEAMUPDATE_PERSONAL_MANAGER_ROLE_ID = "1498116278328754307";
const GESCHAEFTSFUEHRUNG_ROLE_ID = "1425374157398478918";
const STV_GESCHAEFTSFUEHRUNG_ROLE_ID = "1496063831636709396";

const COUNTED_EMPLOYEE_ROLE_IDS = [TEAMUPDATE_EMPLOYEE_ROLE_ID, PROBE_ROLE_ID];
const ABSENCE_REVIEW_ROLE_IDS = [
  GESCHAEFTSFUEHRUNG_ROLE_ID,
  STV_GESCHAEFTSFUEHRUNG_ROLE_ID,
  TEAMUPDATE_MANAGER_BASE_ROLE_ID,
  TEAMUPDATE_MANAGER_ROLE_ID,
  PERSONAL_MANAGER_ROLE_ID,
];

// =====================
// CHANNELS
// =====================
const REQUEST_CHANNEL_ID = "1497604470891347998";
const ABSENCE_CHANNEL_ID = "1425379181440794624";

const CLOCK_CHANNEL_ID = "1425374252424761425";
const REMINDER_CHANNEL_ID = "1435690667891359967";

const WEEKLY_WORKTIME_CHANNEL_ID = "1425374327569907733";
const TOTAL_WORKTIME_CHANNEL_ID = "1497983336432537783";

const CORRECTION_CHANNEL_ID = "1503491667280527400";
const PERSONAL_OVERVIEW_CHANNEL_ID = "1503502645615267980";
const TIME_LOG_CHANNEL_ID = "1497265114854850631";
const FOODBUSINESS_TIMELOG_CHANNEL_ID = "1427672428989120522";
const FOODBUSINESS_MONEY_LOG_CHANNEL_ID = "1427674305977778346";
const FOODBIZ_FORGOT_CHECK_AFTER_MS = 6 * 60 * 60 * 1000;
const FOODBIZ_MONEY_IDLE_MS = 60 * 60 * 1000;
const FOODBUSINESS_ERROR_PING_ROLE_IDS = ["1425374157398478918", "1498116278328754307"];

const SHOPPING_CHANNEL_ID = "1427672956204744734";
const APPLICATION_CHANNEL_ID = "1426042325204729886";
const HOUSE_BAN_CHANNEL_ID = "1497589910968733867";

const MANAGEMENT_PANEL_CHANNEL_ID = "1503561538781446275";
const MANAGEMENT_OUTPUT_CHANNEL_ID = "1497601329718231040";
const TRAINING_OUTPUT_CHANNEL_ID = "1425375413189869588";
const WELCOME_CHANNEL_ID = "1425371919703740466";
const REGISTRATION_CHANNEL_ID = "1503578270648766545";

const DASHBOARD_CHANNEL_ID = "1506466002471354429";
const ACTIVE_STANDS_CHANNEL_ID = "1506466253546590369";
const PERSONAL_FILES_CHANNEL_ID = "1506466406722437120";
const STATISTICS_WEEKLY_CHANNEL_ID = "1506517525222002809";
const MANAGER_CHAT_CHANNEL_ID = "1503472859111096502";

const TERMINATION_REMOVE_ROLE_IDS = [
  EMPLOYEE_ROLE_ID,
  TEAMUPDATE_EMPLOYEE_ROLE_ID,
  PROBE_ROLE_ID,
  TEAMUPDATE_PROBE_MANAGER_ROLE_ID,
  TEAMUPDATE_MANAGER_ROLE_ID,
  TEAMUPDATE_MANAGER_BASE_ROLE_ID,
  STV_GESCHAEFTSFUEHRUNG_ROLE_ID,
  PERSONAL_MANAGER_ROLE_ID,
  DUTY_ROLE_ID,
  WARNING_ROLE_1_ID,
  WARNING_ROLE_2_ID,
];

const REGISTRATION_ROLE_IDS = [
  "1500500705608470639",
  "1425373803243896902",
  "1425374990395641866",
  "1497980251416953054",
  "1425374595526955081",
];

// =====================
// EINSTELLUNGEN
// =====================
const MIN_WEEKLY_MINUTES = 120;
const PROBE_RANKUP_MINUTES = 600;
const REMINDER_AFTER_MS = 2 * 60 * 60 * 1000;
const REMINDER_RESPONSE_MS = 10 * 60 * 1000;
const LEADERBOARD_PAGE_SIZE = 7;

// =====================
// ZEITEN
// =====================
// Die alten Fivebot-Import-Zeiten wurden entfernt.
// Die Zeiten werden jetzt ausschließlich aus der Datenbank gelesen und gespeichert.

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const managementDrafts = new Map();
const dutyCorrectionDrafts = new Map();
const timeManagementDrafts = new Map();

function draftKey(userId, type) {
  return `${userId}:${type}`;
}

// =====================
// HELPER
// =====================
async function query(sql, params = []) {
  return pool.query(sql, params);
}

function hasManagerRole(member) {
  return member.roles.cache.has(MANAGER_ROLE_ID);
}

function isPersonalManager(member) {
  return member.roles.cache.has(PERSONAL_MANAGER_ROLE_ID);
}

function canCreatePanels(member) {
  return hasManagerRole(member) || isPersonalManager(member);
}

function canManagePersonal(member) {
  return hasManagerRole(member) || isPersonalManager(member);
}

function hasAnyRole(member, roleIds) {
  return roleIds.some((roleId) => member?.roles?.cache?.has(roleId));
}

function canReviewAbsence(member) {
  return hasAnyRole(member, ABSENCE_REVIEW_ROLE_IDS);
}

function isCountedEmployeeMember(member) {
  return hasAnyRole(member, COUNTED_EMPLOYEE_ROLE_IDS);
}

async function filterRowsByCountedEmployeeRole(rows) {
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) return [];

  const members = await guild.members.fetch().catch(() => null);
  if (!members) return [];

  return rows.filter((row) => isCountedEmployeeMember(members.get(row.user_id)));
}

function getDisplayNameFromInteraction(interaction) {
  const memberName = interaction.member?.nickname || interaction.member?.displayName;
  const userName = interaction.user?.globalName || interaction.user?.username || "Unbekannt";
  return formatName(memberName || userName);
}

function formatDateForDisplay(dateKey) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return "Ungültiges Datum";
  const [year, month, day] = dateKey.split("-");
  return `${day}.${month}.${year}`;
}

function absenceReviewButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("absence_approve").setLabel("Genehmigt").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("absence_deny").setLabel("Abgelehnt").setEmoji("❌").setStyle(ButtonStyle.Danger)
  );
}

function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} Stunden & ${m} Minuten`;
}

function formatShortMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} Std. ${m} Min.`;
}

function medal(index) {
  if (index === 0) return "🥇";
  if (index === 1) return "🥈";
  if (index === 2) return "🥉";
  return `**${index + 1}.**`;
}

function parseGermanDate(input) {
  const match = input.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
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

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseCorrectionTime(raw) {
  const clean = raw.trim();

  if (clean.includes(":")) {
    const [h, m] = clean.split(":").map(Number);
    if (!Number.isNaN(h) && !Number.isNaN(m) && h >= 0 && m >= 0 && m < 60) {
      return h * 60 + m;
    }
  }

  const number = Number(clean);
  if (!Number.isNaN(number) && number >= 0) return number;

  return null;
}

function formatName(raw) {
  return raw
    .trim()
    .replace(/[ ]+/g, " ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getField(embed, name) {
  return embed.fields?.find((f) => f.name === name)?.value || "";
}

async function getSetting(key, fallback = null) {
  const res = await query(`SELECT value FROM bot_settings WHERE key = $1`, [key]);
  return res.rows[0]?.value ?? fallback;
}

async function setSetting(key, value) {
  await query(
    `
    INSERT INTO bot_settings (key, value)
    VALUES ($1, $2)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
    `,
    [key, String(value)]
  );
}

async function ensureEmployee(userId) {
  await query(
    `
    INSERT INTO employees (user_id, total_minutes, weekly_minutes, left_server)
    VALUES ($1, 0, 0, FALSE)
    ON CONFLICT (user_id)
    DO UPDATE SET left_server = FALSE;
    `,
    [userId]
  );
}

function replaceStatusField(embed, statusText) {
  const fields = embed.fields?.map((f) => ({
    name: f.name,
    value: f.value,
    inline: f.inline,
  })) || [];

  const index = fields.findIndex((f) => f.name === "Status" || f.name.includes("Status"));

  if (index >= 0) fields[index].value = statusText;
  else fields.push({ name: "Status", value: statusText });

  return fields;
}

// =====================
// DATABASE
// =====================
async function initDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS employees (
      user_id TEXT PRIMARY KEY,
      total_minutes INTEGER NOT NULL DEFAULT 0,
      weekly_minutes INTEGER NOT NULL DEFAULT 0,
      rankup_notified BOOLEAN NOT NULL DEFAULT FALSE,
      left_server BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS active_sessions (
      user_id TEXT PRIMARY KEY,
      started_at TIMESTAMPTZ NOT NULL,
      pause_started_at TIMESTAMPTZ,
      paused_ms BIGINT NOT NULL DEFAULT 0,
      reminder_message_id TEXT,
      reminder_sent_at TIMESTAMPTZ,
      reminder_deadline_at TIMESTAMPTZ
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS work_sessions (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ NOT NULL,
      minutes INTEGER NOT NULL,
      auto_clockout BOOLEAN NOT NULL DEFAULT FALSE,
      corrected BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS absences (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      date_from DATE NOT NULL,
      date_to DATE NOT NULL,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS bot_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS warning_records (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      warning_role_id TEXT NOT NULL,
      issuer_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reminded BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS active_stands (
      id SERIAL PRIMARY KEY,
      message_id TEXT,
      request_message_id TEXT,
      creator_id TEXT NOT NULL,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      time_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS personal_file_notes (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      issuer_id TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS personnel_events (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      issuer_id TEXT,
      event_type TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS stock_check_logs (
      id SERIAL PRIMARY KEY,
      message_id TEXT,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS time_adjustments (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      issuer_id TEXT NOT NULL,
      action TEXT NOT NULL,
      minutes INTEGER NOT NULL,
      old_weekly_minutes INTEGER NOT NULL DEFAULT 0,
      new_weekly_minutes INTEGER NOT NULL DEFAULT 0,
      old_total_minutes INTEGER NOT NULL DEFAULT 0,
      new_total_minutes INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS foodbusiness_name_mappings (
      normalized_name TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS foodbusiness_processed_logs (
      message_id TEXT PRIMARY KEY,
      user_id TEXT,
      ic_name TEXT NOT NULL,
      minutes INTEGER NOT NULL,
      assigned_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS foodbusiness_pending_logs (
      message_id TEXT PRIMARY KEY,
      ic_name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      minutes INTEGER NOT NULL,
      original_text TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Keine alten Fivebot-Zeiten mehr importieren.
  // Bestehende Zeiten bleiben in der Datenbank erhalten.


  await query(`
    CREATE TABLE IF NOT EXISTS foodbusiness_money_logs (
      message_id TEXT PRIMARY KEY,
      amount INTEGER,
      logged_at TIMESTAMPTZ NOT NULL,
      original_text TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS foodbusiness_forgot_alerts (
      user_id TEXT PRIMARY KEY,
      session_started_at TIMESTAMPTZ NOT NULL,
      last_alert_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log("✅ Datenbank bereit.");
}

// =====================
// COMMANDS
// =====================
async function registerCommands() {
  const commands = [
new SlashCommandBuilder()
      .setName("mitarbeiterpanel")
      .setDescription("Sendet das Mitarbeiterpanel."),

    new SlashCommandBuilder()
      .setName("managementpanel")
      .setDescription("Sendet das Management-Panel."),

    new SlashCommandBuilder()
      .setName("registrierungspanel")
      .setDescription("Sendet das Registrierungs-Panel."),

    new SlashCommandBuilder()
      .setName("dashboard")
      .setDescription("Aktualisiert das Live-Dashboard."),

    new SlashCommandBuilder()
      .setName("akte")
      .setDescription("Zeigt die Personalakte eines Mitarbeiters.")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("Mitarbeiter auswählen")
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("personalnotiz")
      .setDescription("Fügt eine interne Notiz zur Personalakte hinzu.")
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
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("mitarbeitercheck")
      .setDescription("Analysiert einen Mitarbeiter automatisch.")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("Mitarbeiter auswählen")
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("dienst-reset")
      .setDescription("Notfall-Reset: entfernt Im-Dienst-Rollen und leert aktive Sessions"),
    new SlashCommandBuilder()
      .setName("dienst-korrektur")
      .setDescription("Korrigiert einen Dienst bei Crash/vergessenem Ausstempeln.")
      .addUserOption((option) =>
        option.setName("user").setDescription("Mitarbeiter auswählen").setRequired(true)
      )
      .addStringOption((option) =>
        option.setName("endzeit").setDescription("Endzeit, z. B. 22:30 oder 07.07.2026 22:30").setRequired(true)
      )
      .addStringOption((option) =>
        option.setName("grund").setDescription("Grund, z. B. Crash").setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("statuscheck")
      .setDescription("Prüft Bot, Datenbank, Dashboard, Foodbusiness und wichtige Systeme."),
    new SlashCommandBuilder()
      .setName("verwarnungen-sync")
      .setDescription("Synchronisiert aktive Verwarnungen mit echten Rollen und Teamstatus."),
    new SlashCommandBuilder()
      .setName("bot-hilfe")
      .setDescription("Zeigt eine Übersicht der wichtigsten Bot-Commands und Systeme."),
    new SlashCommandBuilder()
      .setName("bot-cleanup")
      .setDescription("Bereinigt alte Bot-Daten manuell."),
].map((cmd) => cmd.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: [],
  });

  console.log("🧹 Alte Slash Commands gelöscht.");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: commands,
  });

  console.log("✅ Slash Commands registriert.");
}

// =====================
// BUTTONS / COMPONENTS
// =====================
function clockButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("clock_in").setLabel("Einstempeln").setEmoji("🟢").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("clock_out").setLabel("Ausstempeln").setEmoji("🔴").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("pause_start").setLabel("Pause starten").setEmoji("⏸️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("pause_end").setLabel("Pause beenden").setEmoji("▶️").setStyle(ButtonStyle.Primary)
  );
}

function leaderboardButtons(type, page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${type}_prev`).setEmoji("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`${type}_next`).setEmoji("➡️").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
  );
}

function shoppingButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("shopping_done").setLabel("Erledigt").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("shopping_open").setLabel("Offen").setEmoji("🕒").setStyle(ButtonStyle.Secondary)
  );
}

function applicationButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("application_accept").setLabel("Angenommen").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("application_deny").setLabel("Abgelehnt").setEmoji("❌").setStyle(ButtonStyle.Danger)
  );
}

function houseBanButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ban_active").setLabel("Aktiv").setEmoji("🚫").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ban_expired").setLabel("Abgelaufen").setEmoji("✅").setStyle(ButtonStyle.Success)
  );
}

function foodButtons(creatorId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`food_approve_${creatorId}`).setLabel("Bestätigen").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`food_deny_${creatorId}`).setLabel("Ablehnen").setEmoji("❌").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`food_time_${creatorId}`).setLabel("Uhrzeit ändern").setEmoji("🕒").setStyle(ButtonStyle.Secondary)
  );
}

function timeOnlyButton(creatorId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`food_time_${creatorId}`).setLabel("Uhrzeit ändern").setEmoji("🕒").setStyle(ButtonStyle.Secondary)
  );
}

function managementPanelRows() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("mgmt_training_start").setLabel("Einweisung").setEmoji("🧠").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("mgmt_teamupdate_start").setLabel("Teamupdate").setEmoji("🔄").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("mgmt_termination_start").setLabel("Kündigung").setEmoji("📤").setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("mgmt_warning_start").setLabel("Verwarnung").setEmoji("⚠️").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("mgmt_warning_remove_start").setLabel("Verwarnung zurückziehen").setEmoji("✅").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("mgmt_time_management_start").setLabel("Zeitverwaltung").setEmoji("⏱️").setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2];
}


function timeManagementPanelRows() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("time_add_start").setLabel("Zeit hinzufügen").setEmoji("➕").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("time_remove_start").setLabel("Zeit entfernen").setEmoji("➖").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("time_view_start").setLabel("Zeiten ansehen").setEmoji("📊").setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("time_set_weekly_start").setLabel("Weekly setzen").setEmoji("🔄").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("time_set_total_start").setLabel("Gesamtzeit setzen").setEmoji("🏆").setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2];
}

function warningRoleSelect(customId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder("Welche Verwarnung?")
      .addOptions(
        { label: "Verwarnung 1", value: WARNING_ROLE_1_ID, description: "Erste Verwarnungsrolle" },
        { label: "Verwarnung 2", value: WARNING_ROLE_2_ID, description: "Zweite Verwarnungsrolle" }
      )
  );
}

function teamUpdateRoleSelect(customId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder("Welche Rolle soll vergeben werden?")
      .addOptions(
        { label: "Mitarbeiter", value: "employee", description: "Vergibt Mitarbeiter und entfernt Probezeit" },
        { label: "Probe Manager", value: "probe_manager", description: "Vergibt Probe Manager + Verwaltungsrolle" },
        { label: "Manager", value: "manager", description: "Vergibt Manager und entfernt Probe Manager" },
        { label: "Personal Manager", value: "personal_manager", description: "Vergibt Personal Manager + Verwaltungsrolle" },
        { label: "Verwarnung 1", value: "warning_1", description: "Vergibt Verwarnung 1" },
        { label: "Verwarnung 2", value: "warning_2", description: "Vergibt Verwarnung 2" }
      )
  );
}

function userSelect(customId, placeholder = "User auswählen") {
  return new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).setMinValues(1).setMaxValues(1)
  );
}

function continueButton(customId, label = "Weiter") {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel(label).setEmoji("➡️").setStyle(ButtonStyle.Primary)
  );
}

function buildFoodEmbed(data) {
  return new EmbedBuilder()
    .setColor(data.color || 0xf1c40f)
    .setTitle(`🍽️ Neue Essensstand-Anfrage ${data.requestId}`)
    .addFields(
      { name: "Essensstand", value: data.name || "Nicht angegeben" },
      { name: "Ort", value: data.location || "Nicht angegeben" },
      { name: "Uhrzeit", value: data.time || "Nicht angegeben" },
      { name: "Status", value: data.status || "⏳ Wartet auf Bestätigung" },
      { name: "Erstellt von", value: `<@${data.creatorId}>` },
      { name: "Letzte Änderung", value: data.lastChange || "Noch keine Änderung" }
    )
    .setTimestamp();
}

// =====================
// MANAGEMENT SEND
// =====================
async function sendManagementMessage(content) {
  const channel = await client.channels.fetch(MANAGEMENT_OUTPUT_CHANNEL_ID);
  await channel.send({ content });
}

async function sendTrainingMessage(content) {
  const channel = await client.channels.fetch(TRAINING_OUTPUT_CHANNEL_ID);
  await channel.send({ content });
}

async function sendWarning(targetUserId, warningRoleId, reason, issuerId) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const targetMember = await guild.members.fetch(targetUserId).catch(() => null);

  if (targetMember) {
    await targetMember.roles.add(warningRoleId, `Verwarnung ausgestellt von ${issuerId}`).catch((err) => {
      console.error(`❌ Verwarnungsrolle konnte nicht vergeben werden: ${warningRoleId}`, err);
    });
  }

  await query(
    `
    INSERT INTO warning_records (user_id, warning_role_id, issuer_id, reason)
    VALUES ($1, $2, $3, $4);
    `,
    [targetUserId, warningRoleId, issuerId, reason]
  );

  await sendManagementMessage(
    `**⚠️Verwarnung⚠️**\n` +
      `Name: <@${targetUserId}>\n` +
      `Grund: ${reason}\n` +
      `Verwarnung: <@&${warningRoleId}>\n` +
      `Ausgestellt von: <@${issuerId}>`
  );
}

async function sendMissingHoursWarning(targetUserId, warningRoleId, issuerId) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const targetMember = await guild.members.fetch(targetUserId).catch(() => null);

  if (targetMember) {
    await targetMember.roles.add(warningRoleId, `Verwarnung für fehlende Stunden ausgestellt von ${issuerId}`).catch((err) => {
      console.error(`❌ Verwarnungsrolle für fehlende Stunden konnte nicht vergeben werden: ${warningRoleId}`, err);
    });
  }

  await query(
    `
    INSERT INTO warning_records (user_id, warning_role_id, issuer_id, reason)
    VALUES ($1, $2, $3, $4);
    `,
    [targetUserId, warningRoleId, issuerId, "Fehlende Stunden"]
  );

  await sendManagementMessage(
    `**⏰FEHLENDE STUNDEN⏰**\n` +
      `Name: <@${targetUserId}>\n` +
      `Du hast diese Woche deine Stunden nicht erreicht.\n` +
      `Verwarnung: <@&${warningRoleId}>\n\n` +
      `Ausgestellt von: <@${issuerId}>`
  );
}

async function safeAddRoles(targetMember, roleIds) {
  const ids = [...new Set((Array.isArray(roleIds) ? roleIds : [roleIds]).filter(Boolean))];
  const added = [];
  const failed = [];

  for (const roleId of ids) {
    try {
      await targetMember.roles.add(roleId, "Teamupdate über Management-Panel");
      added.push(roleId);
    } catch (err) {
      console.error(`❌ Rolle konnte nicht vergeben werden: ${roleId}`, err);
      failed.push(roleId);
    }
  }

  return { added, failed };
}

async function safeRemoveRoles(targetMember, roleIds) {
  const ids = [...new Set((Array.isArray(roleIds) ? roleIds : [roleIds]).filter(Boolean))];
  const removed = [];
  const failed = [];

  for (const roleId of ids) {
    try {
      await targetMember.roles.remove(roleId);
      removed.push(roleId);
    } catch (err) {
      console.error(`❌ Rolle konnte nicht entfernt werden: ${roleId}`, err);
      failed.push(roleId);
    }
  }

  return { removed, failed };
}

async function applyTeamUpdateRoles(targetMember, updateType) {
  let roleIds = [];
  let removeRoleIds = [];
  let displayRoleId = null;

  const employeeBaseRoles = [TEAMUPDATE_EMPLOYEE_ROLE_ID, EMPLOYEE_ROLE_ID];
  const managementBaseRoles = [TEAMUPDATE_EMPLOYEE_ROLE_ID, EMPLOYEE_ROLE_ID, TEAMUPDATE_MANAGER_BASE_ROLE_ID];

  if (updateType === "employee") {
    roleIds = employeeBaseRoles;
    removeRoleIds = [PROBE_ROLE_ID];
    displayRoleId = TEAMUPDATE_EMPLOYEE_ROLE_ID;
  }

  if (updateType === "probe_manager") {
    roleIds = [...managementBaseRoles, TEAMUPDATE_PROBE_MANAGER_ROLE_ID];
    removeRoleIds = [PROBE_ROLE_ID];
    displayRoleId = TEAMUPDATE_PROBE_MANAGER_ROLE_ID;
  }

  if (updateType === "manager") {
    roleIds = [...managementBaseRoles, TEAMUPDATE_MANAGER_ROLE_ID];
    removeRoleIds = [PROBE_ROLE_ID, TEAMUPDATE_PROBE_MANAGER_ROLE_ID];
    displayRoleId = TEAMUPDATE_MANAGER_ROLE_ID;
  }

  if (updateType === "personal_manager") {
    roleIds = [...managementBaseRoles, TEAMUPDATE_PERSONAL_MANAGER_ROLE_ID];
    removeRoleIds = [PROBE_ROLE_ID, TEAMUPDATE_PROBE_MANAGER_ROLE_ID];
    displayRoleId = TEAMUPDATE_PERSONAL_MANAGER_ROLE_ID;
  }

  if (updateType === "warning_1") {
    roleIds = [WARNING_ROLE_1_ID];
    displayRoleId = WARNING_ROLE_1_ID;
  }

  if (updateType === "warning_2") {
    roleIds = [WARNING_ROLE_2_ID];
    displayRoleId = WARNING_ROLE_2_ID;
  }

  const addResult = await safeAddRoles(targetMember, roleIds);
  const removeResult = removeRoleIds.length
    ? await safeRemoveRoles(targetMember, removeRoleIds)
    : { removed: [], failed: [] };

  const displayRoleText = displayRoleId ? `<@&${displayRoleId}>` : "Unbekannt";

  return {
    roleText: displayRoleText,
    displayRoleText,
    failedAdd: addResult.failed,
    failedRemove: removeResult.failed,
  };
}

async function sendTeamUpdate(targetUserId, updateType, issuerId) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const targetMember = await guild.members.fetch(targetUserId).catch(() => null);

  if (!targetMember) throw new Error("Target member not found");

  const roleResult = await applyTeamUpdateRoles(targetMember, updateType);

  await query(
    `INSERT INTO personnel_events (user_id, issuer_id, event_type, details) VALUES ($1, $2, $3, $4)`,
    [targetUserId, issuerId, "Beförderung", `Beförderung zu ${roleResult.displayRoleText || roleResult.roleText}`]
  ).catch(() => null);

  await sendManagementMessage(
    `**🎉 BEFÖRDERUNG 🎉**\n\n` +
      `Herzlichen Glückwunsch <@${targetUserId}>,\n` +
      `du wurdest offiziell zum ${roleResult.displayRoleText || roleResult.roleText} befördert! 🥳\n\n` +
      `Wir danken dir für deine Arbeit, deine Zuverlässigkeit und deinen Einsatz im Caffee Container.\n` +
      `Mach weiter so – wir freuen uns auf die weitere Zusammenarbeit mit dir! 💛\n\n` +
      `Ausgestellt von: <@${issuerId}>`
  );
}

async function deleteEmployeeTimeData(userId) {
  await query(`DELETE FROM active_sessions WHERE user_id = $1`, [userId]);
  await query(`DELETE FROM work_sessions WHERE user_id = $1`, [userId]);
  await query(`DELETE FROM absences WHERE user_id = $1`, [userId]);
  await query(`DELETE FROM employees WHERE user_id = $1`, [userId]);
}

async function sendTermination(targetUserId, note, issuerId) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const targetMember = await guild.members.fetch(targetUserId).catch(() => null);

  if (targetMember) {
    await safeRemoveRoles(targetMember, TERMINATION_REMOVE_ROLE_IDS);
  }

  await deleteEmployeeTimeData(targetUserId);
  await updateTotalWorktimeMessage();
  await updateWeeklyWorktimeMessage();
    await automaticWarningSync();

  await sendManagementMessage(
    `**Kündigung**\n` +
      `<@${targetUserId}> hat uns verlassen.\n` +
      `Notiz: ${note}\n\n` +
      `Ausgestellt von: <@${issuerId}>`
  );
}

async function sendWarningRemove(targetUserId, warningRoleId, issuerId) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const targetMember = await guild.members.fetch(targetUserId).catch(() => null);

  if (targetMember) {
    await targetMember.roles.remove(warningRoleId, `Verwarnung zurückgezogen von ${issuerId}`).catch((err) => {
      console.error(`❌ Verwarnungsrolle konnte nicht entfernt werden: ${warningRoleId}`, err);
    });
  }

  await query(
    `
    UPDATE warning_records
    SET active = FALSE
    WHERE user_id = $1
      AND warning_role_id = $2
      AND active = TRUE;
    `,
    [targetUserId, warningRoleId]
  );

  await sendManagementMessage(
    `**🔄 Verwarnung Zurückgezogen🔄 **\n` +
      `Name: <@${targetUserId}>\n` +
      `Folgende Verwarnung wurde zurückgezogen: <@&${warningRoleId}>\n\n` +
      `Du hast dich bewiesen – mach genauso weiter und hör auf, Mist zu bauen! 💛\n\n` +
      `Ausgestellt von: <@${issuerId}>`
  );
}

async function sendTraining(targetUserId, instructorId, date, issuerId) {
  await query(
    `INSERT INTO personnel_events (user_id, issuer_id, event_type, details) VALUES ($1, $2, $3, $4)`,
    [targetUserId, issuerId, "Einweisung", `Einweisung durch <@${instructorId}> am ${date}`]
  ).catch(() => null);

  await sendTrainingMessage(
    `**🧠 EINWEISUNG DOKUMENTIERT 🧠**

` +
      `Mitarbeiter: <@${targetUserId}>
` +
      `Einweisung durch: <@${instructorId}>
` +
      `Datum: ${date}

` +
      `Eingetragen von: <@${issuerId}>`
  );
}

// =====================
// PERMANENTE NACHRICHTEN
// =====================
async function sendOrUpdatePermanentMessage(channelId, key, payload) {
  const channel = await client.channels.fetch(channelId);
  const oldMessageId = await getSetting(key, null);

  if (oldMessageId) {
    try {
      const msg = await channel.messages.fetch(oldMessageId);
      await msg.edit(payload);
      return;
    } catch {}
  }

  const msg = await channel.send(payload);
  await setSetting(key, msg.id);
}

async function getOnlineUsersMap() {
  const active = await query(`SELECT user_id FROM active_sessions`);
  const map = {
        time_add_user: "time_add",
        time_remove_user: "time_remove",
        time_set_weekly_user: "time_set_weekly",
        time_set_total_user: "time_set_total",
        time_view_user: "time_view",};

  for (const row of active.rows) {
    map[row.user_id] = true;
  }

  return map;
}

async function updateTotalWorktimeMessage() {
  const result = await query(`
    SELECT user_id, total_minutes AS minutes
    FROM employees
    WHERE left_server = FALSE
    ORDER BY total_minutes DESC;
  `);

  const rows = await filterRowsByCountedEmployeeRole(result.rows);
  const onlineMap = await getOnlineUsersMap();

  let page = Number(await getSetting("total_page", "0"));
  const totalPages = Math.max(1, Math.ceil(rows.length / LEADERBOARD_PAGE_SIZE));

  if (page >= totalPages) page = totalPages - 1;
  if (page < 0) page = 0;

  await setSetting("total_page", page);

  const start = page * LEADERBOARD_PAGE_SIZE;
  const pageRows = rows.slice(start, start + LEADERBOARD_PAGE_SIZE);

  const description = pageRows.length
    ? pageRows
        .map((r, i) => {
          const realIndex = start + i;
          const dot = onlineMap[r.user_id] ? "🟢 " : "";
          return `${medal(realIndex)} ${dot}<@${r.user_id}>\n└ 🕒 **${formatMinutes(r.minutes)}**`;
        })
        .join("\n\n")
    : "Noch keine Zeiten vorhanden.";

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("💠 ・TIMEDESK • GESAMTZEITEN")
    .setDescription(description)
    .setFooter({ text: `Live aktualisiert alle 2 Minuten | Seite ${page + 1}/${totalPages}` })
    .setTimestamp();

  await sendOrUpdatePermanentMessage(TOTAL_WORKTIME_CHANNEL_ID, "total_worktime_message_id", {
    embeds: [embed],
    components: [leaderboardButtons("total", page, totalPages)],
  });
}

async function updateWeeklyWorktimeMessage() {
  const result = await query(`
    SELECT user_id, weekly_minutes AS minutes
    FROM employees
    WHERE left_server = FALSE
    ORDER BY weekly_minutes DESC;
  `);

  const rows = await filterRowsByCountedEmployeeRole(result.rows);
  const onlineMap = await getOnlineUsersMap();

  let page = Number(await getSetting("weekly_page", "0"));
  const totalPages = Math.max(1, Math.ceil(rows.length / LEADERBOARD_PAGE_SIZE));

  if (page >= totalPages) page = totalPages - 1;
  if (page < 0) page = 0;

  await setSetting("weekly_page", page);

  const start = page * LEADERBOARD_PAGE_SIZE;
  const pageRows = rows.slice(start, start + LEADERBOARD_PAGE_SIZE);

  const description = pageRows.length
    ? pageRows
        .map((r, i) => {
          const realIndex = start + i;
          const dot = onlineMap[r.user_id] ? "🟢 " : "";
          return `${medal(realIndex)} ${dot}<@${r.user_id}>\n└ 🕒 **${formatMinutes(r.minutes)}**`;
        })
        .join("\n\n")
    : "Noch keine Zeiten vorhanden.";

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("💎 ・TIMEDESK • WEEKLY LEADERBOARD")
    .setDescription(description)
    .setFooter({ text: `Live aktualisiert alle 2 Minuten | Seite ${page + 1}/${totalPages}` })
    .setTimestamp();

  await sendOrUpdatePermanentMessage(WEEKLY_WORKTIME_CHANNEL_ID, "weekly_worktime_message_id", {
    embeds: [embed],
    components: [leaderboardButtons("weekly", page, totalPages)],
  });
}


async function updateWeeklyStatisticsMessage() {
  const result = await query(`
    SELECT user_id, weekly_minutes
    FROM employees
    WHERE left_server = FALSE
    ORDER BY weekly_minutes DESC;
  `);

  const rows = await filterRowsByCountedEmployeeRole(result.rows);
  const activeSessions = await query(`
    SELECT user_id
    FROM active_sessions;
  `);

  const countedUserIds = new Set(rows.map((row) => row.user_id));
  const activeCount = activeSessions.rows.filter((row) =>
    countedUserIds.has(row.user_id)
  ).length;

  const employeeCount = rows.length;
  const totalWeeklyMinutes = rows.reduce(
    (sum, row) => sum + Number(row.weekly_minutes || 0),
    0
  );
  const averageWeeklyMinutes = employeeCount
    ? Math.round(totalWeeklyMinutes / employeeCount)
    : 0;
  const reachedMinimum = rows.filter(
    (row) => Number(row.weekly_minutes || 0) >= MIN_WEEKLY_MINUTES
  ).length;
  const belowMinimum = Math.max(0, employeeCount - reachedMinimum);

  const topFive = rows.length
    ? rows
        .slice(0, 5)
        .map((row, index) => {
          const place =
            index === 0
              ? "🥇"
              : index === 1
                ? "🥈"
                : index === 2
                  ? "🥉"
                  : `**${index + 1}.**`;

          return `${place} <@${row.user_id}> — **${formatShortMinutes(
            Number(row.weekly_minutes || 0)
          )}**`;
        })
        .join("\n")
    : "Noch keine Mitarbeiterzeiten vorhanden.";

  const embed = new EmbedBuilder()
    .setColor(belowMinimum > 0 ? 0xf1c40f : 0x2ecc71)
    .setTitle("📊 ・WÖCHENTLICHE ZEITSTATISTIK")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        `👥 **Mitarbeiter berücksichtigt**\n└ ${employeeCount}\n\n` +
        `🟢 **Aktuell im Dienst**\n└ ${activeCount}\n\n` +
        `⏱️ **Gesamte Wochenzeit**\n└ ${formatShortMinutes(totalWeeklyMinutes)}\n\n` +
        `📈 **Ø pro Mitarbeiter**\n└ ${formatShortMinutes(averageWeeklyMinutes)}\n\n` +
        `✅ **Mindestzeit erreicht**\n└ ${reachedMinimum}\n\n` +
        `⚠️ **Unter Mindestzeit**\n└ ${belowMinimum}\n` +
        "━━━━━━━━━━━━━━━━━━━━━━━━"
    )
    .addFields({
      name: "🏆 Top 5 dieser Woche",
      value: topFive,
    })
    .setFooter({
      text: "Caffee Container • Wöchentliche Statistik • automatische Aktualisierung",
    })
    .setTimestamp();

  await sendOrUpdatePermanentMessage(
    STATISTICS_WEEKLY_CHANNEL_ID,
    "weekly_statistics_message_id",
    {
      embeds: [embed],
      components: [],
    }
  );
}

// =====================
// LOGS
// =====================
async function sendTimeLog(type, member, text) {
  const channel = await client.channels.fetch(TIME_LOG_CHANNEL_ID);

  const colors = {
    in: 0x2ecc71,
    out: 0xe74c3c,
    pause: 0xf1c40f,
    resume: 0x3498db,
  };

  const titles = {
    in: "🟢 ・DIENST GESTARTET",
    out: "🔴 ・DIENST BEENDET",
    pause: "⏸️ ・PAUSE GESTARTET",
    resume: "▶️ ・PAUSE BEENDET",
  };

  const embed = new EmbedBuilder()
    .setColor(colors[type] || 0xffffff)
    .setTitle(titles[type] || "Log")
    .setDescription(`${member}\n${text}`)
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

// =====================
// SESSION / RANKUP
// =====================
async function checkRankup(userId) {
  const employee = await query(`SELECT total_minutes, rankup_notified FROM employees WHERE user_id = $1`, [userId]);

  if (!employee.rows[0]) return;
  if (employee.rows[0].rankup_notified) return;
  if (employee.rows[0].total_minutes < PROBE_RANKUP_MINUTES) return;

  const guild = await client.guilds.fetch(GUILD_ID);
  const member = await guild.members.fetch(userId).catch(() => null);

  if (!member) return;
  if (!member.roles.cache.has(PROBE_ROLE_ID)) return;

  const channel = await client.channels.fetch(PERSONAL_OVERVIEW_CHANNEL_ID);

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🚨 Probezeit-Ziel erreicht!")
    .setDescription(
      `<@${userId}> hat insgesamt **10 Arbeitsstunden** erreicht.\n\n` +
        `📈 Es wird Zeit für ein mögliches **Rank-Up**.\n` +
        `💸 Bitte denkt daran, das **Gehalt entsprechend anzupassen**.\n\n` +
        `<@&${PERSONAL_MANAGER_ROLE_ID}>`
    )
    .setTimestamp();

  await channel.send({ content: `<@&${PERSONAL_MANAGER_ROLE_ID}>`, embeds: [embed] });

  await query(`UPDATE employees SET rankup_notified = TRUE WHERE user_id = $1`, [userId]);
}

async function finishSession(userId, autoClockout = false, forcedEndAt = new Date()) {
  const res = await query(`SELECT * FROM active_sessions WHERE user_id = $1`, [userId]);
  const session = res.rows[0];
  if (!session) return null;

  let pausedMs = Number(session.paused_ms || 0);

  if (session.pause_started_at) {
    pausedMs += forcedEndAt.getTime() - new Date(session.pause_started_at).getTime();
  }

  const startedAt = new Date(session.started_at);

  const minutes = Math.max(0, Math.floor((forcedEndAt.getTime() - startedAt.getTime() - pausedMs) / 60000));

  const inserted = await query(
    `
    INSERT INTO work_sessions (user_id, started_at, ended_at, minutes, auto_clockout)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id;
    `,
    [userId, startedAt, forcedEndAt, minutes, autoClockout]
  );

  await query(
    `
    UPDATE employees
    SET total_minutes = total_minutes + $2,
        weekly_minutes = weekly_minutes + $2
    WHERE user_id = $1;
    `,
    [userId, minutes]
  );

  await query(`DELETE FROM active_sessions WHERE user_id = $1`, [userId]);

  const guild = await client.guilds.fetch(GUILD_ID);
  const member = await guild.members.fetch(userId).catch(() => null);

  if (member) {
    await member.roles.remove(DUTY_ROLE_ID).catch(() => {});

    await sendTimeLog(
      "out",
      `<@${userId}>`,
      autoClockout
        ? `⚠️ Automatisch ausgestempelt\n🕒 Gespeicherte Arbeitszeit: **${formatShortMinutes(minutes)}**`
        : `🕒 Arbeitszeit: **${formatShortMinutes(minutes)}**`
    );
  }

  await checkRankup(userId);
  await updateTotalWorktimeMessage();
  await updateWeeklyWorktimeMessage();
  await updateDashboardMessage().catch(() => null);

  return { sessionId: inserted.rows[0].id, minutes };
}

// =====================
// REMINDER
// =====================
async function deleteReminderMessage(session) {
  if (!session?.reminder_message_id) return;

  const channel = await client.channels.fetch(REMINDER_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const msg = await channel.messages.fetch(session.reminder_message_id).catch(() => null);
  if (msg) await msg.delete().catch(() => {});
}

async function checkReminders() {
  const now = new Date();
  const active = await query(`SELECT * FROM active_sessions`);

  for (const session of active.rows) {
    if (session.pause_started_at) continue;

    const userId = session.user_id;

    if (session.reminder_deadline_at && new Date(session.reminder_deadline_at) <= now) {
      await deleteReminderMessage(session);

      const endAt = new Date(session.reminder_sent_at);
      const finished = await finishSession(userId, true, endAt);
      if (!finished) continue;

      const channel = await client.channels.fetch(CORRECTION_CHANNEL_ID);

      const embed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle("🕒 Automatische Ausstempelung")
        .setDescription(
          `<@${userId}> du wurdest automatisch ausgestempelt.\n\n` +
            `Gespeicherte Zeit: **${formatShortMinutes(finished.minutes)}**\n` +
            `Bitte korrigiere deine tatsächliche Arbeitszeit, falls diese nicht stimmt.`
        )
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`correct_time_${finished.sessionId}_${userId}`)
          .setLabel("Arbeitszeit korrigieren")
          .setEmoji("🕒")
          .setStyle(ButtonStyle.Primary)
      );

      await channel.send({ content: `<@${userId}>`, embeds: [embed], components: [row] });
      continue;
    }

    if (!session.reminder_message_id) {
      const elapsed = now.getTime() - new Date(session.started_at).getTime() - Number(session.paused_ms || 0);

      if (elapsed >= REMINDER_AFTER_MS) {
        const channel = await client.channels.fetch(REMINDER_CHANNEL_ID);

        const embed = new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle("🛡️ Aktivitätsprüfung")
          .setDescription(
            `<@${userId}> bist du noch im Dienst?\n\n` +
              `Bitte bestätige innerhalb von **10 Minuten**, sonst wirst du automatisch ausgestempelt.`
          )
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`confirm_active_${userId}`).setLabel("Ich bin noch da").setEmoji("✅").setStyle(ButtonStyle.Success)
        );

        const msg = await channel.send({ content: `<@${userId}>`, embeds: [embed], components: [row] });

        await query(
          `
          UPDATE active_sessions
          SET reminder_message_id = $2,
              reminder_sent_at = $3,
              reminder_deadline_at = $4
          WHERE user_id = $1;
          `,
          [userId, msg.id, now, new Date(now.getTime() + REMINDER_RESPONSE_MS)]
        );
      }
    }
  }
}

async function checkWarningReviewReminders() {
  const res = await query(`
    SELECT *
    FROM warning_records
    WHERE active = TRUE
      AND reminded = FALSE
      AND issued_at <= NOW() - INTERVAL '14 days';
  `);

  if (!res.rows.length) return;

  const channel = await client.channels.fetch(PERSONAL_OVERVIEW_CHANNEL_ID);

  for (const warning of res.rows) {
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle("⚠️ Verwarnung seit 2 Wochen aktiv")
      .setDescription(
        `<@${warning.user_id}> hat seit **2 Wochen** folgende Verwarnung aktiv:

` +
          `Verwarnung: <@&${warning.warning_role_id}>
` +
          `Grund: ${warning.reason}

` +
          `Bitte prüfen, ob die Verwarnung zurückgezogen werden soll.

` +
          `<@&${PERSONAL_MANAGER_ROLE_ID}>`
      )
      .setTimestamp();

    await channel.send({ content: `<@&${PERSONAL_MANAGER_ROLE_ID}>`, embeds: [embed] });
    await query(`UPDATE warning_records SET reminded = TRUE WHERE id = $1`, [warning.id]);
  }
}

// =====================
// WOCHENPRÜFUNG
// =====================
function getBerlinParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
}

function getLastWeekRangeUTC() {
  const now = new Date();
  const p = getBerlinParts(now);

  const today = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
  const utcDay = today.getUTCDay();
  const diffToThisMonday = utcDay === 0 ? -6 : 1 - utcDay;

  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() + diffToThisMonday - 7);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return { monday: monday.toISOString().slice(0, 10), sunday: sunday.toISOString().slice(0, 10) };
}

async function getAbsenceStatus(userId, weekFrom, weekTo) {
  const res = await query(
    `
    SELECT *
    FROM absences
    WHERE user_id = $1
      AND date_from <= $3
      AND date_to >= $2;
    `,
    [userId, weekFrom, weekTo]
  );

  if (!res.rows.length) return "none";

  const full = res.rows.some((a) => {
    const from = new Date(a.date_from).toISOString().slice(0, 10);
    const to = new Date(a.date_to).toISOString().slice(0, 10);
    return from <= weekFrom && to >= weekTo;
  });

  return full ? "full" : "partial";
}

async function weeklyMinimumCheckAndReset() {
  const p = getBerlinParts();
  const todayKey = `${p.year}-${p.month}-${p.day}`;

  if (p.weekday !== "Mo." || p.hour !== "00" || p.minute !== "00") return;

  const already = await getSetting("last_weekly_reset", null);
  if (already === todayKey) return;

  const { monday, sunday } = getLastWeekRangeUTC();

  const employees = await query(
    `
    SELECT user_id, weekly_minutes
    FROM employees
    WHERE left_server = FALSE
      AND weekly_minutes < $1
    ORDER BY weekly_minutes ASC;
    `,
    [MIN_WEEKLY_MINUTES]
  );

  const countedEmployees = await filterRowsByCountedEmployeeRole(employees.rows);
  const lines = [];

  for (const e of countedEmployees) {
    const status = await getAbsenceStatus(e.user_id, monday, sunday);
    const missing = MIN_WEEKLY_MINUTES - e.weekly_minutes;

    if (status === "full") {
      lines.push(`• <@${e.user_id}> — **${formatShortMinutes(e.weekly_minutes)}** ⛔\n↳ Vollständig abgemeldet`);
    } else if (status === "partial") {
      lines.push(
        `• <@${e.user_id}> — **${formatShortMinutes(e.weekly_minutes)}** ⚠️\n↳ Teilweise abgemeldet\n↳ Fehlend: **${formatShortMinutes(missing)}**`
      );
    } else {
      lines.push(`• <@${e.user_id}> — **${formatShortMinutes(e.weekly_minutes)}** ❌\n↳ Fehlend: **${formatShortMinutes(missing)}**`);
    }
  }

  if (lines.length) {
    const channel = await client.channels.fetch(PERSONAL_OVERVIEW_CHANNEL_ID);

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("🚨 Wochenübersicht – Mindestarbeitszeit nicht erreicht")
      .setDescription(
        `Die folgenden Mitarbeiter haben diese Woche die Mindestarbeitszeit von **2 Stunden** nicht erreicht:\n\n` +
          lines.join("\n\n") +
          `\n\n<@&${PERSONAL_MANAGER_ROLE_ID}>`
      )
      .setTimestamp();

    await channel.send({ content: `<@&${PERSONAL_MANAGER_ROLE_ID}>`, embeds: [embed] });
  }

  await query(`UPDATE employees SET weekly_minutes = 0`);
  await setSetting("last_weekly_reset", todayKey);
  await setSetting("weekly_page", "0");
  await updateWeeklyWorktimeMessage();
}

// =====================
// MITARBEITER-ROLLEN-SYNC
// =====================
async function syncEmployeeRoles() {
  const guild = await client.guilds.fetch(GUILD_ID);
  const members = await guild.members.fetch();
  const employees = await query(`SELECT user_id FROM employees`);

  for (const employee of employees.rows) {
    const member = members.get(employee.user_id);
    const hasEmployeeRole = isCountedEmployeeMember(member);

    await query(`UPDATE employees SET left_server = $2 WHERE user_id = $1`, [employee.user_id, !hasEmployeeRole]);

    if (!hasEmployeeRole) {
      await query(`DELETE FROM active_sessions WHERE user_id = $1`, [employee.user_id]);
      if (member) await member.roles.remove(DUTY_ROLE_ID).catch(() => {});
    }
  }

  await updateTotalWorktimeMessage();
  await updateWeeklyWorktimeMessage();
  console.log("✅ Mitarbeiter-Rollen wurden synchronisiert.");
}


// =====================
// DASHBOARD / AKTIVE STÄNDE / PERSONALAKTEN
// =====================

async function getCleanUserDisplay(userId) {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId).catch(() => null);

    if (member) {
      const name = member.nickname || member.user.globalName || member.user.username;
      return `└ ${name}`;
    }

    const user = await client.users.fetch(userId).catch(() => null);
    if (user) return `└ ${user.globalName || user.username}`;

    return `└ User ${userId}`;
  } catch {
    return `└ User ${userId}`;
  }
}

async function updateDashboardMessage() {
  const activeSessions = await query(`SELECT user_id FROM active_sessions`);

  const activeWarnings = await query(`
    SELECT COUNT(*)::int AS count
    FROM warning_records
    WHERE active = TRUE
  `);

  const oldWarnings = await query(`
    SELECT COUNT(*)::int AS count
    FROM warning_records
    WHERE active = TRUE
      AND issued_at <= NOW() - INTERVAL '14 days'
  `);

  const employeeRows = await query(`
    SELECT user_id, weekly_minutes
    FROM employees
    WHERE left_server = FALSE
  `);

  const activeAbsences = await query(`
    SELECT COUNT(*)::int AS count
    FROM absences
    WHERE date_from <= CURRENT_DATE + INTERVAL '7 days'
      AND date_to >= CURRENT_DATE
  `);

  const lastStockCheck = await query(`
    SELECT created_at
    FROM stock_check_logs
    ORDER BY created_at DESC
    LIMIT 1
  `).catch(() => ({ rows: [] }));

  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  const members = guild ? await guild.members.fetch().catch(() => null) : null;
  const countedEmployeeRows = members
    ? employeeRows.rows.filter((row) => isCountedEmployeeMember(members.get(row.user_id)))
    : [];
  const countedActiveSessions = members
    ? activeSessions.rows.filter((row) => isCountedEmployeeMember(members.get(row.user_id)))
    : [];

  const employeeCount = countedEmployeeRows.length;
  const avgWeekly = employeeCount
    ? Math.round(countedEmployeeRows.reduce((sum, row) => sum + Number(row.weekly_minutes || 0), 0) / employeeCount)
    : 0;
  const underCount = countedEmployeeRows.filter((row) => Number(row.weekly_minutes || 0) < MIN_WEEKLY_MINUTES).length;
  const warningCount = activeWarnings.rows[0]?.count || 0;
  const oldWarningCount = oldWarnings.rows[0]?.count || 0;
  const absenceCount = activeAbsences.rows[0]?.count || 0;
  const dutyCount = countedActiveSessions.length;

  const activeList = dutyCount > 0
    ? (await Promise.all(
        countedActiveSessions.map((row) => getCleanUserDisplay(row.user_id))
      )).join("\n").slice(0, 900)
    : "└ Niemand ist aktuell eingestempelt.";

  let stockLine = "└ Noch keine Lagerprüfung gespeichert";
  let stockBad = false;

  if (lastStockCheck.rows[0]?.created_at) {
    const stockTime = new Date(lastStockCheck.rows[0].created_at);
    const ageMs = Date.now() - stockTime.getTime();
    const twoDays = 2 * 24 * 60 * 60 * 1000;

    if (ageMs <= twoDays) {
      stockLine = `└ 🟢 Zuletzt geprüft <t:${Math.floor(stockTime.getTime() / 1000)}:R>`;
    } else {
      stockLine = `└ 🔴 Überfällig — zuletzt <t:${Math.floor(stockTime.getTime() / 1000)}:R>`;
      stockBad = true;
    }
  }

  const overallColor =
    underCount > 3 || oldWarningCount > 0 || stockBad
      ? 0xe74c3c
      : underCount > 0 || warningCount > 0 || absenceCount > 0
        ? 0xf1c40f
        : 0x2ecc71;

  const personalTasks = [];
  if (underCount > 0) personalTasks.push(`└ 🔴 Mitarbeiter unter 2h prüfen: **${underCount}**`);
  if (oldWarningCount > 0) personalTasks.push(`└ 🔴 Alte Verwarnungen prüfen: **${oldWarningCount}**`);
  if (absenceCount > 0) personalTasks.push(`└ 🟡 Abmeldungen im Blick behalten: **${absenceCount}**`);
  if (!personalTasks.length) personalTasks.push("└ 🟢 Keine dringenden Aufgaben");

  const managementTasks = [];
  if (stockBad) managementTasks.push("└ 🔴 Lagerprüfung durchführen");
  managementTasks.push("└ 🛒 Einkaufsliste regelmäßig kontrollieren");

  const embed = new EmbedBuilder()
    .setColor(overallColor)
    .setTitle("💠 ・CAFFEE CONTAINER DASHBOARD")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━\n" +
      "**Live-Übersicht für Management & Personal Management**\n" +
      "🟢 Alles gut  •  🟡 Prüfen  •  🔴 Handeln\n" +
      "━━━━━━━━━━━━━━━━━━━━━━"
    )
    .addFields(
      {
        name: "👥 **TEAM & ZEITEN**",
        value:
          `👤 **Mitarbeiter im Team**\n└ ${employeeCount}\n\n` +
          `🟢 **Aktuell im Dienst**\n└ ${dutyCount}\n\n` +
          `📊 **Ø Wochenzeit pro Mitarbeiter**\n└ ${formatShortMinutes(avgWeekly)}\n\n` +
          `⚠️ **Unter 2 Stunden**\n└ ${underCount}`,
      },
      {
        name: "━━━━━━━━━━━━━━━━━━━━━━",
        value: " ",
      },
      {
        name: "👩‍💼 **PERSONAL MANAGEMENT**",
        value:
          `⚠️ **Aktive Verwarnungen**\n└ ${warningCount}\n\n` +
          `🕒 **Verwarnungen über 14 Tage**\n└ ${oldWarningCount}\n\n` +
          `📅 **Abmeldungen diese Woche**\n└ ${absenceCount}`,
      },
      {
        name: "📌 **PERSONAL — OFFENE AUFGABEN**",
        value: personalTasks.join("\n"),
      },
      {
        name: "━━━━━━━━━━━━━━━━━━━━━━",
        value: " ",
      },
      {
        name: "👨‍💼 **MANAGEMENT**",
        value:
          `📦 **Lagerstatus**\n${stockLine}\n\n` +
          `🛒 **Einkaufsliste**\n└ Regelmäßig kontrollieren`,
      },
      {
        name: "📌 **MANAGEMENT — OFFENE AUFGABEN**",
        value: managementTasks.join("\n"),
      },
      {
        name: "━━━━━━━━━━━━━━━━━━━━━━",
        value: " ",
      },
      {
        name: dutyCount > 0
          ? "🟢 **EINGESTEMPELTE MITARBEITER**"
          : "🔴 **AKTUELL IM DIENST**",
        value: activeList,
      }
    )
    .setFooter({
      text: "Caffee Container • Live-Dashboard • automatische Aktualisierung"
    })
    .setTimestamp();

  await sendOrUpdatePermanentMessage(
    DASHBOARD_CHANNEL_ID,
    "dashboard_message_id",
    {
      embeds: [embed],
      components: [],
    }
  );
}

async function updateManagementTasksMessage() {
  // Aufgaben sind jetzt direkt im Dashboard integriert.
  // Diese Funktion bleibt nur bestehen, damit ältere Aufrufe keinen Fehler auslösen.
  return;
}

function safeEmbedValue(value, fallback = "Keine Daten vorhanden.") {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.length > 1024 ? `${text.slice(0, 1000)}\n…` : text;
}

function formatDiscordTimestamp(value, style = "f") {
  if (!value) return "Unbekannt";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

function formatDateForDisplay(value) {
  if (!value) return "Unbekannt";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

async function buildPersonalFileEmbed(targetUserId, requesterId = null) {
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  const member = guild ? await guild.members.fetch(targetUserId).catch(() => null) : null;
  const user = member?.user || (await client.users.fetch(targetUserId).catch(() => null));

  const displayName = member?.nickname || user?.globalName || user?.username || `User ${targetUserId}`;
  const tag = user?.tag || user?.username || targetUserId;

  const employee = await query(
    `SELECT * FROM employees WHERE user_id = $1`,
    [targetUserId]
  ).catch(() => ({ rows: [] }));

  const activeSession = await query(
    `SELECT * FROM active_sessions WHERE user_id = $1`,
    [targetUserId]
  ).catch(() => ({ rows: [] }));

  const workSessions = await query(
    `
    SELECT *
    FROM work_sessions
    WHERE user_id = $1
    ORDER BY ended_at DESC
    LIMIT 5;
    `,
    [targetUserId]
  ).catch(() => ({ rows: [] }));

  const absences = await query(
    `
    SELECT *
    FROM absences
    WHERE user_id = $1
      AND date_to >= CURRENT_DATE - INTERVAL '30 days'
    ORDER BY date_from DESC
    LIMIT 5;
    `,
    [targetUserId]
  ).catch(() => ({ rows: [] }));

  const warnings = await query(
    `
    SELECT *
    FROM warning_records
    WHERE user_id = $1
      AND active = TRUE
    ORDER BY issued_at DESC;
    `,
    [targetUserId]
  ).catch(() => ({ rows: [] }));

  const notes = await query(
    `
    SELECT *
    FROM personal_file_notes
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 5;
    `,
    [targetUserId]
  ).catch(() => ({ rows: [] }));

  const events = await query(
    `
    SELECT *
    FROM personnel_events
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 8;
    `,
    [targetUserId]
  ).catch(() => ({ rows: [] }));

  const e = employee.rows[0];
  const active = activeSession.rows[0];

  const rolesText = member
    ? [
        member.roles.cache.has(EMPLOYEE_ROLE_ID) ? "✅ Mitarbeiterrolle" : "❌ Keine Mitarbeiterrolle",
        member.roles.cache.has(PROBE_ROLE_ID) ? "🟡 Probezeit" : "⚪ Nicht in Probezeit",
        member.roles.cache.has(MANAGER_ROLE_ID) ? "🛠️ Management" : null,
        member.roles.cache.has(PERSONAL_MANAGER_ROLE_ID) ? "👩‍💼 Personal Management" : null,
        member.roles.cache.has(DUTY_ROLE_ID) ? "🟢 Im-Dienst-Rolle aktiv" : "🔴 Keine Im-Dienst-Rolle",
        member.roles.cache.has(WARNING_ROLE_1_ID) ? "⚠️ Verwarnung 1 Rolle" : null,
        member.roles.cache.has(WARNING_ROLE_2_ID) ? "⚠️ Verwarnung 2 Rolle" : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "❌ Mitglied konnte auf dem Server nicht gefunden werden.";

  const warningText = warnings.rows.length
    ? warnings.rows
        .map(
          (w) =>
            `• <@&${w.warning_role_id}> — ${w.reason || "Kein Grund angegeben"}\n  seit ${formatDiscordTimestamp(w.issued_at, "R")}`
        )
        .join("\n")
    : "Keine aktiven Verwarnungen.";

  const workText = workSessions.rows.length
    ? workSessions.rows
        .map((s) => {
          const flags = [];
          if (s.auto_clockout) flags.push("Auto-Ausstempelung");
          if (s.corrected) flags.push("Korrigiert");
          return (
            `• ${formatDiscordTimestamp(s.started_at, "d")} — **${formatShortMinutes(Number(s.minutes || 0))}**` +
            (flags.length ? `\n  ${flags.join(" • ")}` : "")
          );
        })
        .join("\n")
    : "Noch keine abgeschlossenen Dienste gespeichert.";

  const absenceText = absences.rows.length
    ? absences.rows
        .map(
          (a) =>
            `• ${formatDateForDisplay(a.date_from)} bis ${formatDateForDisplay(a.date_to)}\n  ${a.reason || "Kein Grund angegeben"}`
        )
        .join("\n")
    : "Keine aktuellen oder letzten Abmeldungen gespeichert.";

  const noteText = notes.rows.length
    ? notes.rows
        .map(
          (n) =>
            `• ${formatDiscordTimestamp(n.created_at, "d")} von <@${n.issuer_id}>\n  ${n.note || "Keine Notiz"}`
        )
        .join("\n")
    : "Keine Personalnotizen gespeichert.";

  const eventText = events.rows.length
    ? events.rows
        .map(
          (ev) =>
            `• **${ev.event_type || "Eintrag"}** — ${formatDiscordTimestamp(ev.created_at, "d")}\n  ${ev.details || "Keine Details"}`
        )
        .join("\n")
    : "Keine Personalhistorie gespeichert.";

  const activeText = active
    ? `🟢 Im Dienst seit ${formatDiscordTimestamp(active.started_at, "R")}`
    : "🔴 Aktuell nicht im Dienst";

  const employeeText = e
    ? `📈 **Weekly:** ${formatShortMinutes(Number(e.weekly_minutes || 0))}\n` +
      `💎 **Gesamt:** ${formatShortMinutes(Number(e.total_minutes || 0))}\n` +
      `📌 **Status:** ${e.left_server ? "Hat Server/Team verlassen" : "Aktiv"}\n` +
      `🗓️ **Datensatz:** ${formatDiscordTimestamp(e.created_at, "d")}\n` +
      `🕒 **Dienst:** ${activeText}`
    : `Noch kein Mitarbeiterdatensatz in der Datenbank.\n🕒 **Dienst:** ${activeText}`;

  return new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("📁 ・PERSONALAKTE")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        `👤 **Mitarbeiter:** <@${targetUserId}>\n` +
        `🏷️ **Name:** ${displayName}\n` +
        `🆔 **Discord:** ${tag}\n` +
        (requesterId ? `📨 **Angefordert von:** <@${requesterId}>\n` : "") +
        "━━━━━━━━━━━━━━━━━━━━━━━━"
    )
    .addFields(
      { name: "🕒 Zeiten & Dienst", value: safeEmbedValue(employeeText) },
      { name: "🛡️ Rollenstatus", value: safeEmbedValue(rolesText) },
      { name: "⚠️ Aktive Verwarnungen", value: safeEmbedValue(warningText) },
      { name: "📅 Abmeldungen", value: safeEmbedValue(absenceText) },
      { name: "🕒 Letzte Dienste", value: safeEmbedValue(workText) },
      { name: "📝 Personalnotizen", value: safeEmbedValue(noteText) },
      { name: "📚 Personalhistorie", value: safeEmbedValue(eventText) }
    )
    .setFooter({ text: "Caffee Container • Personalakte • automatisch erstellt" })
    .setTimestamp();
}

async function sendPersonalFileToChannel(targetUserId, requesterId) {
  const channel = await client.channels.fetch(PERSONAL_FILES_CHANNEL_ID).catch(() => null);

  if (!channel || typeof channel.send !== "function") {
    throw new Error(`Personalakten-Channel nicht gefunden oder nicht beschreibbar: ${PERSONAL_FILES_CHANNEL_ID}`);
  }

  const embed = await buildPersonalFileEmbed(targetUserId, requesterId);

  return channel.send({
    content: `📁 Personalakte angefordert von <@${requesterId}>`,
    embeds: [embed],
    allowedMentions: { users: [requesterId], roles: [] },
  });
}

async function buildEmployeeCheckEmbed(targetUserId) {
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  const member = guild ? await guild.members.fetch(targetUserId).catch(() => null) : null;
  const user = member?.user || (await client.users.fetch(targetUserId).catch(() => null));
  const displayName = member?.nickname || user?.globalName || user?.username || `User ${targetUserId}`;

  const employee = await query(
    `SELECT * FROM employees WHERE user_id = $1`,
    [targetUserId]
  ).catch(() => ({ rows: [] }));

  const activeSession = await query(
    `SELECT * FROM active_sessions WHERE user_id = $1`,
    [targetUserId]
  ).catch(() => ({ rows: [] }));

  const warnings = await query(
    `SELECT COUNT(*)::int AS count FROM warning_records WHERE user_id = $1 AND active = TRUE`,
    [targetUserId]
  ).catch(() => ({ rows: [{ count: 0 }] }));

  const oldWarnings = await query(
    `
    SELECT COUNT(*)::int AS count
    FROM warning_records
    WHERE user_id = $1
      AND active = TRUE
      AND issued_at <= NOW() - INTERVAL '14 days';
    `,
    [targetUserId]
  ).catch(() => ({ rows: [{ count: 0 }] }));

  const activeAbsence = await query(
    `
    SELECT *
    FROM absences
    WHERE user_id = $1
      AND date_from <= CURRENT_DATE
      AND date_to >= CURRENT_DATE
    ORDER BY date_to DESC
    LIMIT 1;
    `,
    [targetUserId]
  ).catch(() => ({ rows: [] }));

  const e = employee.rows[0];
  const weekly = Number(e?.weekly_minutes || 0);
  const total = Number(e?.total_minutes || 0);
  const activeWarningCount = Number(warnings.rows[0]?.count || 0);
  const oldWarningCount = Number(oldWarnings.rows[0]?.count || 0);
  const checks = [];
  const actions = [];

  if (!member) {
    checks.push("❌ Mitglied ist nicht auf dem Server auffindbar.");
    actions.push("Teamstatus prüfen und ggf. Zeitdaten/Personalakte bereinigen.");
  } else {
    checks.push("✅ Mitglied ist auf dem Server.");

    if (member.roles.cache.has(EMPLOYEE_ROLE_ID)) checks.push("✅ Mitarbeiterrolle vorhanden.");
    else {
      checks.push("❌ Mitarbeiterrolle fehlt.");
      actions.push("Mitarbeiterrolle prüfen.");
    }

    if (member.roles.cache.has(DUTY_ROLE_ID) || activeSession.rows[0]) {
      checks.push("🟢 Mitarbeiter ist aktuell im Dienst oder hat eine aktive Session.");
    } else {
      checks.push("🔴 Keine aktive Dienstsession.");
    }
  }

  if (!e) {
    checks.push("⚠️ Kein Mitarbeiterdatensatz in der Datenbank.");
    actions.push("Registrierung oder Zeitdaten prüfen.");
  } else {
    checks.push(`📈 Weekly-Zeit: **${formatShortMinutes(weekly)}**`);
    checks.push(`💎 Gesamtzeit: **${formatShortMinutes(total)}**`);

    if (weekly < MIN_WEEKLY_MINUTES) {
      actions.push(`Weekly-Zeit unter Mindestwert: es fehlen **${formatShortMinutes(MIN_WEEKLY_MINUTES - weekly)}**.`);
    }

    if (member?.roles.cache.has(PROBE_ROLE_ID) && total >= PROBE_RANKUP_MINUTES) {
      actions.push("Probezeit-Ziel erreicht: mögliches Rank-Up prüfen.");
    }
  }

  if (activeWarningCount > 0) {
    checks.push(`⚠️ Aktive Verwarnungen: **${activeWarningCount}**`);
    if (oldWarningCount > 0) actions.push(`Alte Verwarnungen über 14 Tage prüfen: **${oldWarningCount}**.`);
  } else {
    checks.push("✅ Keine aktiven Verwarnungen.");
  }

  if (activeAbsence.rows[0]) {
    const a = activeAbsence.rows[0];
    checks.push(`📅 Aktuell abgemeldet bis **${formatDateForDisplay(a.date_to)}**.`);
  }

  if (!actions.length) actions.push("Keine dringende Auffälligkeit gefunden.");

  const color = actions.some((a) => a.includes("fehlen") || a.includes("prüfen") || a.includes("fehlt"))
    ? 0xf1c40f
    : 0x2ecc71;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle("🔍 ・MITARBEITERCHECK")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        `👤 **Mitarbeiter:** <@${targetUserId}>\n` +
        `🏷️ **Name:** ${displayName}\n` +
        "━━━━━━━━━━━━━━━━━━━━━━━━"
    )
    .addFields(
      { name: "📋 Prüfung", value: safeEmbedValue(checks.join("\n")) },
      { name: "📌 Empfehlung", value: safeEmbedValue(actions.map((a) => `• ${a}`).join("\n")) }
    )
    .setFooter({ text: "Caffee Container • Mitarbeitercheck" })
    .setTimestamp();
}


function getBerlinDateOnly(date = new Date()) {
  const p = getBerlinParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function daysBetweenDateKeys(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.floor((db - da) / 86400000);
}

function getBerlinDateKey(date = new Date()) {
  const p = getBerlinParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

async function sendStockCheckReminderIfNeeded(force = false) {
  const p = getBerlinParts();

  if (!force && (p.hour !== "17" || p.minute !== "00")) return;

  const todayKey = getBerlinDateOnly();
  const alreadyToday = await getSetting("last_stock_check_reminder", null);
  if (alreadyToday === todayKey) return;

  const lastReminderTime = await getSetting("last_stock_check_reminder_time", null);
  if (lastReminderTime) {
    const ageMs = Date.now() - new Date(lastReminderTime).getTime();
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    if (!Number.isNaN(ageMs) && ageMs < twoDaysMs) return;
  }

  const lastCheck = await query(`
    SELECT created_at
    FROM stock_check_logs
    WHERE status IN ('checked', 'shopping_needed', 'problem')
    ORDER BY created_at DESC
    LIMIT 1
  `).catch(() => ({ rows: [] }));

  if (lastCheck.rows[0]?.created_at) {
    const lastCheckKey = getBerlinDateOnly(new Date(lastCheck.rows[0].created_at));
    const daysSinceLastCheck = daysBetweenDateKeys(lastCheckKey, todayKey);
    if (daysSinceLastCheck < 2) return;
  }

  const channel = await client.channels.fetch(MANAGER_CHAT_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0x5dade2)
    .setTitle("📦 ・LAGERPRÜFUNG")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "Das Lager ist wieder zur Kontrolle fällig.\n\n" +
      "📋 **Bitte überprüft:**\n" +
      "└ Lebensmittelbestand\n" +
      "└ Getränkebestand\n" +
      "└ Artikel unter Mindestbestand\n" +
      "└ Produkte, die nachgekauft werden müssen\n\n" +
      "🌐 **Lagerverwaltung**\n" +
      "Öffnet die Website über den Button unten und führt dort die Lagerprüfung durch.\n\n" +
      "Anschließend bitte den passenden Status-Button auswählen.\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━"
    )
    .setFooter({ text: "Caffee Container • Lagerkontrolle alle 2 Tage" })
    .setTimestamp();

  const statusRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("stock_checked").setLabel("Lager geprüft").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("stock_shopping_needed").setLabel("Einkauf nötig").setEmoji("🛒").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("stock_problem").setLabel("Problem melden").setEmoji("⚠️").setStyle(ButtonStyle.Danger)
  );

  const websiteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Lagerverwaltung öffnen")
      .setEmoji("🌐")
      .setStyle(ButtonStyle.Link)
      .setURL("https://business-calc.de/")
  );

  await channel.send({
    content: "<@&1503473305439567953> <@&1425374060287889530>",
    embeds: [embed],
    components: [statusRow, websiteRow],
    allowedMentions: {
      roles: ["1503473305439567953", "1425374060287889530"]
    }
  });

  await setSetting("last_stock_check_reminder", todayKey);
  await setSetting("last_stock_check_reminder_time", new Date().toISOString());
}

async function logStockCheck(messageId, userId, status, note = null) {
  await query(
    `INSERT INTO stock_check_logs (message_id, user_id, status, note) VALUES ($1, $2, $3, $4)`,
    [messageId, userId, status, note]
  ).catch(() => null);
}


// =====================
// ZEITVERWALTUNG
// =====================
function timeActionLabel(action) {
  const labels = {
    add: "Zeit hinzugefügt",
    remove: "Zeit entfernt",
    set_weekly: "Weekly-Zeit gesetzt",
    set_total: "Gesamtzeit gesetzt",
  };

  return labels[action] || action;
}

async function refreshAllTimeDisplays() {
  await updateTotalWorktimeMessage().catch(() => null);
  await updateWeeklyWorktimeMessage().catch(() => null);
  await updateDashboardMessage().catch(() => null);
  await updateWeeklyStatisticsMessage().catch(() => null);
  await updateManagementTasksMessage().catch(() => null);
}

async function applyManualTimeChange({ targetUserId, issuerId, action, minutes, note = null }) {
  await ensureEmployee(targetUserId);

  const before = await query(
    `SELECT weekly_minutes, total_minutes FROM employees WHERE user_id = $1`,
    [targetUserId]
  );

  const oldWeekly = before.rows[0]?.weekly_minutes || 0;
  const oldTotal = before.rows[0]?.total_minutes || 0;

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
    newWeekly = Math.max(0, minutes);
  }

  if (action === "set_total") {
    newTotal = Math.max(0, minutes);
  }

  await query(
    `
    UPDATE employees
    SET weekly_minutes = $2,
        total_minutes = $3,
        left_server = FALSE
    WHERE user_id = $1;
    `,
    [targetUserId, newWeekly, newTotal]
  );

  await query(
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
    [targetUserId, issuerId, action, minutes, oldWeekly, newWeekly, oldTotal, newTotal, note]
  ).catch(() => null);

  await query(
    `INSERT INTO personnel_events (user_id, issuer_id, event_type, details) VALUES ($1, $2, $3, $4)`,
    [
      targetUserId,
      issuerId,
      "Zeitverwaltung",
      `${timeActionLabel(action)}: ${formatShortMinutes(minutes)}${note ? ` • ${note}` : ""}`,
    ]
  ).catch(() => null);

  const logChannel = await client.channels.fetch(TIME_LOG_CHANNEL_ID).catch(() => null);

  if (logChannel) {
    const embed = new EmbedBuilder()
      .setColor(0x5dade2)
      .setTitle("🛠️ ・ZEITVERWALTUNG LOG")
      .setDescription(
        "━━━━━━━━━━━━━━━━━━━━━━━━\\n" +
          `👤 **Mitarbeiter**\\n└ <@${targetUserId}>\\n\\n` +
          `🛠️ **Aktion**\\n└ ${timeActionLabel(action)}\\n\\n` +
          `🕒 **Eingetragene Zeit**\\n└ ${formatShortMinutes(minutes)}\\n\\n` +
          `📈 **Weekly-Zeit**\\n└ ${formatShortMinutes(oldWeekly)} → **${formatShortMinutes(newWeekly)}**\\n\\n` +
          `💎 **Gesamtzeit**\\n└ ${formatShortMinutes(oldTotal)} → **${formatShortMinutes(newTotal)}**\\n\\n` +
          `📝 **Notiz**\\n└ ${note || "Keine Notiz"}\\n\\n` +
          `👮 **Ausgeführt von**\\n└ <@${issuerId}>\\n` +
          "━━━━━━━━━━━━━━━━━━━━━━━━"
      )
      .setFooter({ text: "Caffee Container • Zeitverwaltung • Transparenzlog" })
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });
  }

  await refreshAllTimeDisplays();

  return {
    oldWeekly,
    newWeekly,
    oldTotal,
    newTotal,
  };
}

async function buildTimeOverviewEmbed(targetUserId) {
  await ensureEmployee(targetUserId);

  const employee = await query(
    `SELECT weekly_minutes, total_minutes FROM employees WHERE user_id = $1`,
    [targetUserId]
  );

  const adjustments = await query(
    `
    SELECT *
    FROM time_adjustments
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 5
    `,
    [targetUserId]
  ).catch(() => ({ rows: [] }));

  const e = employee.rows[0];

  const adjustmentText = adjustments.rows.length
    ? adjustments.rows
        .map((a) => `• **${timeActionLabel(a.action)}** — ${formatShortMinutes(a.minutes)}\n  von <@${a.issuer_id}>`)
        .join("\n")
        .slice(0, 1000)
    : "Keine manuellen Zeitänderungen gespeichert.";

  return new EmbedBuilder()
    .setColor(0x5dade2)
    .setTitle("📊 ・ZEITÜBERSICHT")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        `👤 **Mitarbeiter:** <@${targetUserId}>\n` +
        `📈 **Weekly-Zeit:** ${formatShortMinutes(e?.weekly_minutes || 0)}\n` +
        `💎 **Gesamtzeit:** ${formatShortMinutes(e?.total_minutes || 0)}\n` +
        "━━━━━━━━━━━━━━━━━━━━━━━━"
    )
    .addFields({ name: "🛠️ Letzte manuellen Änderungen", value: adjustmentText })
    .setFooter({ text: "Caffee Container • Zeitverwaltung" })
    .setTimestamp();
}

function timeUserSelect(customId, placeholder = "Mitarbeiter auswählen") {
  return new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(1)
  );
}


// =====================
// FOODBIZ / FOODBIZ ZEITLOG AUTOMATIK
// =====================
function normalizeFoodBusinessName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripDiscordPrefix(name) {
  return String(name || "")
    .replace(/^[A-ZÄÖÜ]{1,6}\s*\|\s*/i, "")
    .replace(/^CC\s*[-|]\s*/i, "")
    .trim();
}

function getMessageFullText(message) {
  const parts = [];

  if (message.content) parts.push(message.content);

  for (const embed of message.embeds || []) {
    if (embed.title) parts.push(embed.title);
    if (embed.description) parts.push(embed.description);
    if (embed.footer?.text) parts.push(embed.footer.text);

    for (const field of embed.fields || []) {
      if (field.name) parts.push(field.name);
      if (field.value) parts.push(field.value);
    }
  }

  return parts.join("\n");
}

function parseFoodBusinessTimeLog(message) {
  const text = getMessageFullText(message);

  if (!text || !/ausgestempelt/i.test(text)) return null;

  const nameMatch =
    text.match(/(.+?)\s*\(ID\s*:\s*\d+\)\s*hat sich ausgestempelt/i) ||
    text.match(/(.+?)\s+hat sich ausgestempelt/i);

  const durationMatch =
    text.match(/Dauer\s*:?\s*(\d+)\s*Stunden?\s*,?\s*(\d+)\s*Minuten?\s*,?\s*([\d,.]+)\s*Sekunden?/i) ||
    text.match(/(\d+)\s*Stunden?\s*,?\s*(\d+)\s*Minuten?\s*,?\s*([\d,.]+)\s*Sekunden?/i);

  if (!nameMatch || !durationMatch) return null;

  const rawName = nameMatch[1]
    .replace(/\*\*/g, "")
    .replace(/[`*_]/g, "")
    .replace(/^Der Mitarbeiter\s+/i, "")
    .replace(/^\s*[:•\-]+/, "")
    .trim();

  const hours = Number(durationMatch[1] || 0);
  const minutesRaw = Number(durationMatch[2] || 0);
  const seconds = Number(String(durationMatch[3] || "0").replace(",", "."));

  const minutes = Math.max(1, hours * 60 + minutesRaw + (seconds >= 30 ? 1 : 0));

  return {
    icName: rawName,
    normalizedName: normalizeFoodBusinessName(rawName),
    minutes,
    originalText: text.slice(0, 1800),
  };
}

async function findFoodBusinessUser(icName) {
  const normalized = normalizeFoodBusinessName(icName);

  const mapped = await query(
    `SELECT user_id FROM foodbusiness_name_mappings WHERE normalized_name = $1`,
    [normalized]
  ).catch(() => ({ rows: [] }));

  if (mapped.rows[0]?.user_id) {
    return { userId: mapped.rows[0].user_id, source: "mapping" };
  }

  const guild = await client.guilds.fetch(GUILD_ID);
  const members = await guild.members.fetch();

  const matches = [];

  for (const [, member] of members) {
    const display = member.nickname || member.user.globalName || member.user.username;
    const cleanDisplay = stripDiscordPrefix(display);

    const normalizedDisplay = normalizeFoodBusinessName(cleanDisplay);
    const normalizedFull = normalizeFoodBusinessName(display);

    if (
      normalizedDisplay === normalized ||
      normalizedFull === normalized ||
      normalizedFull.includes(normalized) ||
      normalized.includes(normalizedDisplay)
    ) {
      matches.push(member);
    }
  }

  if (matches.length === 1) {
    return { userId: matches[0].id, source: "nickname" };
  }

  return { userId: null, source: matches.length > 1 ? "multiple" : "none", matches };
}

async function applyFoodBusinessTime({ messageId, targetUserId, icName, minutes, assignedBy = "System" }) {
  const exists = await query(
    `SELECT message_id FROM foodbusiness_processed_logs WHERE message_id = $1`,
    [messageId]
  );

  if (exists.rows[0]) return { alreadyProcessed: true };

  await ensureEmployee(targetUserId);

  await query(
    `
    UPDATE employees
    SET total_minutes = total_minutes + $2,
        weekly_minutes = weekly_minutes + $2,
        left_server = FALSE
    WHERE user_id = $1;
    `,
    [targetUserId, minutes]
  );

  await query(
    `
    INSERT INTO foodbusiness_processed_logs (message_id, user_id, ic_name, minutes, assigned_by)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (message_id) DO NOTHING;
    `,
    [messageId, targetUserId, icName, minutes, assignedBy]
  );

  await query(`DELETE FROM active_sessions WHERE user_id = $1`, [targetUserId]).catch(() => null);

  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  const member = guild ? await guild.members.fetch(targetUserId).catch(() => null) : null;

  if (member) {
    await member.roles.remove(DUTY_ROLE_ID, "Foodbusiness automatisch ausgestempelt").catch(() => null);
  }

  await stopFoodBusinessDutyOnly(targetUserId, "Foodbusiness automatisch ausgestempelt").catch(() => null);

  await query(
    `
    INSERT INTO foodbusiness_name_mappings (normalized_name, original_name, user_id, created_by, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (normalized_name)
    DO UPDATE SET user_id = EXCLUDED.user_id, original_name = EXCLUDED.original_name, updated_at = NOW();
    `,
    [normalizeFoodBusinessName(icName), icName, targetUserId, assignedBy]
  ).catch(() => null);

  await query(
    `INSERT INTO personnel_events (user_id, issuer_id, event_type, details) VALUES ($1, $2, $3, $4)`,
    [
      targetUserId,
      assignedBy === "System" ? null : assignedBy,
      "Foodbusiness-Zeitlog",
      `${icName}: ${formatShortMinutes(minutes)} automatisch übernommen`,
    ]
  ).catch(() => null);

  await refreshAllTimeDisplays().catch(() => null);

  const logChannel = await client.channels.fetch(TIME_LOG_CHANNEL_ID).catch(() => null);
  if (logChannel) {
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("🔴 ・FOODBUSINESS AUSGESTEMPELT")
      .setDescription(
        "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
          `👤 **IC-Name**\n└ ${icName}\n\n` +
          `👥 **Discord-User**\n└ <@${targetUserId}>\n\n` +
          `⏱️ **Arbeitszeit**\n└ ${formatShortMinutes(minutes)}\n\n` +
          `🔴 **Aktion**\n└ Im-Dienst-Rolle wurde entfernt.\n\n` +
          `🛠️ **Zuordnung**\n└ ${assignedBy === "System" ? "Automatisch" : `<@${assignedBy}>`}\n` +
          "━━━━━━━━━━━━━━━━━━━━━━━━"
      )
      .setFooter({ text: "Caffee Container • Foodbusiness Zeitlog" })
      .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch(() => null);
  }

  return { alreadyProcessed: false };
}

async function sendFoodBusinessAssignmentRequest({ messageId, icName, normalizedName, minutes, originalText, reason }) {
  await query(
    `
    INSERT INTO foodbusiness_pending_logs (message_id, ic_name, normalized_name, minutes, original_text)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (message_id) DO NOTHING;
    `,
    [messageId, icName, normalizedName, minutes, originalText]
  ).catch(() => null);

  const channel = await client.channels.fetch(TIME_LOG_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("⚠️ ・ZEITLOG KONNTE NICHT ZUGEORDNET WERDEN")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        `👤 **IC-Name**\n└ ${icName}\n\n` +
        `⏱️ **Arbeitszeit**\n└ ${formatShortMinutes(minutes)}\n\n` +
        `❌ **Grund**\n└ ${reason}\n\n` +
        "Bitte wählt unten den richtigen Mitarbeiter aus.\n\n" +
        "Wenn der Name falsch erkannt wurde, bitte zuerst prüfen und dann korrekt zuordnen.\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━"
    )
    .setFooter({ text: `Foodbusiness Log-ID: ${messageId}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`fb_assign_${messageId}`)
      .setPlaceholder("Mitarbeiter auswählen")
      .setMinValues(1)
      .setMaxValues(1)
  );

  await channel.send({
    content: FOODBUSINESS_ERROR_PING_ROLE_IDS.map((id) => `<@&${id}>`).join(" "),
    embeds: [embed],
    components: [row],
    allowedMentions: { roles: FOODBUSINESS_ERROR_PING_ROLE_IDS },
  });
}


function parseFoodBusinessClockIn(message) {
  const text = getMessageFullText(message);

  if (!text || !/eingestempelt/i.test(text)) return null;

  const nameMatch =
    text.match(/(.+?)\s*\(ID\s*:\s*\d+\)\s*hat sich eingestempelt/i) ||
    text.match(/(.+?)\s+hat sich eingestempelt/i);

  if (!nameMatch) return null;

  const rawName = nameMatch[1]
    .replace(/\*\*/g, "")
    .replace(/[`*_]/g, "")
    .replace(/^Der Mitarbeiter\s+/i, "")
    .replace(/^\s*[:•\-]+/, "")
    .trim();

  return {
    icName: rawName,
    normalizedName: normalizeFoodBusinessName(rawName),
    originalText: text.slice(0, 1800),
  };
}

async function handleFoodBusinessClockIn(message, parsed) {
  const found = await findFoodBusinessUser(parsed.icName);

  if (!found.userId) {
    // Beim Einstempeln wird noch keine Zeit gebucht. Falls keine Zuordnung gefunden wird,
    // reicht die spätere Korrektur beim Ausstempeln, weil dort die Dauer übernommen wird.
    return;
  }

  await ensureEmployee(found.userId);

  await query(
    `
    INSERT INTO active_sessions (user_id, started_at)
    VALUES ($1, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET started_at = EXCLUDED.started_at,
                  pause_started_at = NULL,
                  paused_ms = 0,
                  reminder_message_id = NULL,
                  reminder_sent_at = NULL,
                  reminder_deadline_at = NULL;
    `,
    [found.userId]
  ).catch(() => null);

  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  const member = guild ? await guild.members.fetch(found.userId).catch(() => null) : null;

  if (member) {
    await member.roles.add(DUTY_ROLE_ID, "Foodbusiness automatisch eingestempelt").catch(() => null);
  }

  const logChannel = await client.channels.fetch(TIME_LOG_CHANNEL_ID).catch(() => null);
  if (logChannel) {
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("🟢 ・FOODBUSINESS EINGESTEMPELT")
      .setDescription(
        "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
          `👤 **IC-Name**\n└ ${parsed.icName}\n\n` +
          `👥 **Discord-User**\n└ <@${found.userId}>\n\n` +
          `✅ **Aktion**\n└ Im-Dienst-Rolle wurde vergeben.\n` +
          "━━━━━━━━━━━━━━━━━━━━━━━━"
      )
      .setFooter({ text: "Caffee Container • Automatische Dienst-Erkennung" })
      .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch(() => null);
  }

  await refreshAllTimeDisplays().catch(() => null);
}

async function handleFoodBusinessLogMessage(message) {
  if (!message.guild || message.channelId !== FOODBUSINESS_TIMELOG_CHANNEL_ID) return;
  if (message.author?.id === client.user.id) return;

  const clockIn = parseFoodBusinessClockIn(message);
  if (clockIn) {
    await handleFoodBusinessClockIn(message, clockIn);
    return;
  }

  const parsed = parseFoodBusinessTimeLog(message);
  if (!parsed) return;

  const processed = await query(
    `SELECT message_id FROM foodbusiness_processed_logs WHERE message_id = $1`,
    [message.id]
  ).catch(() => ({ rows: [] }));

  if (processed.rows[0]) return;

  const found = await findFoodBusinessUser(parsed.icName);

  if (found.userId) {
    await applyFoodBusinessTime({
      messageId: message.id,
      targetUserId: found.userId,
      icName: parsed.icName,
      minutes: parsed.minutes,
      assignedBy: "System",
    });
    return;
  }

  const reason =
    found.source === "multiple"
      ? "Mehrere mögliche Discord-User gefunden."
      : "Kein eindeutiger Discord-User gefunden.";

  await sendFoodBusinessAssignmentRequest({
    messageId: message.id,
    icName: parsed.icName,
    normalizedName: parsed.normalizedName,
    minutes: parsed.minutes,
    originalText: parsed.originalText,
    reason,
  });
}


// =====================
// FOODBIZ GELDLOG & SICHERHEIT
// =====================
function parseFoodBusinessMoneyLog(message) {
  const text = getMessageFullText(message);
  if (!text || !/NPC-Verkauf/i.test(text)) return null;

  const amountMatch = text.match(/\[\+\]\s*(\d+)\s*\$?/i);
  const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)/);

  let loggedAt = new Date();
  if (dateMatch) {
    const time = dateMatch[2].length === 5 ? `${dateMatch[2]}:00` : dateMatch[2];
    loggedAt = new Date(`${dateMatch[1]}T${time}+02:00`);
  }

  return {
    amount: amountMatch ? Number(amountMatch[1]) : null,
    loggedAt,
    originalText: text.slice(0, 1800),
  };
}

async function handleFoodBusinessMoneyLogMessage(message) {
  if (!message.guild || message.channelId !== FOODBUSINESS_MONEY_LOG_CHANNEL_ID) return;
  if (message.author?.id === client.user.id) return;

  const parsed = parseFoodBusinessMoneyLog(message);
  if (!parsed) return;

  await query(
    `
    INSERT INTO foodbusiness_money_logs (message_id, amount, logged_at, original_text)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (message_id) DO NOTHING;
    `,
    [message.id, parsed.amount, parsed.loggedAt, parsed.originalText]
  ).catch(() => null);

  await setSetting("last_foodbusiness_money_log_at", parsed.loggedAt.toISOString()).catch(() => null);
}

async function stopFoodBusinessDutyOnly(userId, reason = "Foodbusiness automatisch beendet") {
  await query(`DELETE FROM active_sessions WHERE user_id = $1`, [userId]).catch(() => null);

  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;

  if (member) {
    await member.roles.remove(DUTY_ROLE_ID, reason).catch(() => null);
  }

  await refreshAllTimeDisplays().catch(() => null);
}

async function sendForgotClockoutAlert({ userId, startedAt, lastMoneyLogAt, mode }) {
  const oldAlert = await query(
    `SELECT * FROM foodbusiness_forgot_alerts WHERE user_id = $1 AND session_started_at = $2`,
    [userId, startedAt]
  ).catch(() => ({ rows: [] }));

  if (oldAlert.rows[0]) return;

  await query(
    `
    INSERT INTO foodbusiness_forgot_alerts (user_id, session_started_at)
    VALUES ($1, $2)
    ON CONFLICT (user_id) DO UPDATE SET session_started_at = EXCLUDED.session_started_at, last_alert_at = NOW();
    `,
    [userId, startedAt]
  ).catch(() => null);

  const channel = await client.channels.fetch(TIME_LOG_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const lastMoneyText = lastMoneyLogAt
    ? `<t:${Math.floor(new Date(lastMoneyLogAt).getTime() / 1000)}:R>`
    : "Kein NPC-Verkauf nach Dienstbeginn gefunden.";

  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("⚠️ ・MÖGLICHES AUSSTEMPELN VERGESSEN")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        `👤 **Mitarbeiter**\n└ <@${userId}>\n\n` +
        `🟢 **Eingestempelt seit**\n└ <t:${Math.floor(new Date(startedAt).getTime() / 1000)}:F>\n\n` +
        `💰 **Letzter NPC-Verkauf**\n└ ${lastMoneyText}\n\n` +
        `🛡️ **Sicherheitsmodus**\n└ ${mode}\n\n` +
        "Bitte prüfen, ob die Person vergessen hat auszustempeln.\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━"
    )
    .setFooter({ text: "Caffee Container • Foodbusiness Sicherheitsprüfung" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`fb_force_duty_end_${userId}`)
      .setLabel("Dienst beenden")
      .setEmoji("🔴")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: FOODBUSINESS_ERROR_PING_ROLE_IDS.map((id) => `<@&${id}>`).join(" "),
    embeds: [embed],
    components: [row],
    allowedMentions: { roles: FOODBUSINESS_ERROR_PING_ROLE_IDS },
  });
}

async function checkForgotFoodBusinessClockouts() {
  const active = await query(`SELECT * FROM active_sessions`).catch(() => ({ rows: [] }));
  if (!active.rows.length) return;

  const now = Date.now();
  const lastMoney = await query(
    `SELECT logged_at FROM foodbusiness_money_logs ORDER BY logged_at DESC LIMIT 1`
  ).catch(() => ({ rows: [] }));

  const lastMoneyAt = lastMoney.rows[0]?.logged_at ? new Date(lastMoney.rows[0].logged_at) : null;

  for (const session of active.rows) {
    const startedAt = new Date(session.started_at);
    const activeMs = now - startedAt.getTime();
    if (activeMs < FOODBIZ_FORGOT_CHECK_AFTER_MS) continue;

    const moneyAfterStart = lastMoneyAt && lastMoneyAt.getTime() >= startedAt.getTime();
    const moneyIdle = lastMoneyAt && now - lastMoneyAt.getTime() >= FOODBIZ_MONEY_IDLE_MS;

    if (active.rows.length === 1 && moneyAfterStart && moneyIdle) {
      await stopFoodBusinessDutyOnly(session.user_id, "Foodbusiness Sicherheits-Autoausstempelung");

      const channel = await client.channels.fetch(TIME_LOG_CHANNEL_ID).catch(() => null);
      if (channel) {
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("🔴 ・DIENST AUTOMATISCH BEENDET")
          .setDescription(
            "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
              `👤 **Mitarbeiter**\n└ <@${session.user_id}>\n\n` +
              `🟢 **Eingestempelt seit**\n└ <t:${Math.floor(startedAt.getTime() / 1000)}:F>\n\n` +
              `💰 **Letzter NPC-Verkauf**\n└ <t:${Math.floor(lastMoneyAt.getTime() / 1000)}:F>\n\n` +
              "Die Im-Dienst-Rolle wurde entfernt. Es wurde **keine zusätzliche Zeit** gebucht, weil kein Foodbusiness-Ausstempel-Log vorhanden war.\n" +
              "━━━━━━━━━━━━━━━━━━━━━━━━"
          )
          .setFooter({ text: "Caffee Container • Sicherheits-Autoausstempelung" })
          .setTimestamp();

        await channel.send({ embeds: [embed] }).catch(() => null);
      }
    } else {
      await sendForgotClockoutAlert({
        userId: session.user_id,
        startedAt: session.started_at,
        lastMoneyLogAt: lastMoneyAt,
        mode: active.rows.length > 1 ? "Mehrere Personen im Dienst — keine automatische Buchung." : "Keine sichere Auto-Erkennung möglich.",
      });
    }
  }
}


// =====================
// DIENST-KORREKTUR BEI CRASH / VERGESSEN
// =====================
function parseDutyCorrectionEndTime(raw, sessionStart = new Date()) {
  const value = String(raw || "").trim();

  const fullMatch = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (fullMatch) {
    const day = Number(fullMatch[1]);
    const month = Number(fullMatch[2]);
    const year = Number(fullMatch[3]);
    const hour = Number(fullMatch[4]);
    const minute = Number(fullMatch[5]);
    if (hour > 23 || minute > 59) return null;
    return new Date(Date.UTC(year, month - 1, day, hour - 2, minute, 0));
  }

  const timeMatch = value.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    if (hour > 23 || minute > 59) return null;

    const p = getBerlinParts(sessionStart);
    const end = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour - 2, minute, 0));
    if (end.getTime() < sessionStart.getTime()) end.setUTCDate(end.getUTCDate() + 1);
    return end;
  }

  return null;
}

async function applyDutyCorrection({ targetUserId, endAt, issuerId, reason }) {
  const active = await query(`SELECT * FROM active_sessions WHERE user_id = $1`, [targetUserId]);
  const session = active.rows[0];
  if (!session) return { ok: false, error: "Der User ist aktuell nicht als aktiv eingestempelt." };

  const startAt = new Date(session.started_at);
  const minutes = Math.max(0, Math.floor((endAt.getTime() - startAt.getTime()) / 60000));
  if (minutes <= 0) return { ok: false, error: "Die Endzeit liegt vor oder direkt auf der Startzeit." };

  const dupe = await query(
    `SELECT id FROM work_sessions WHERE user_id = $1 AND started_at = $2 AND ended_at = $3 LIMIT 1`,
    [targetUserId, startAt, endAt]
  ).catch(() => ({ rows: [] }));
  if (dupe.rows[0]) return { ok: false, error: "Diese Korrektur wurde bereits gebucht." };

  const inserted = await query(
    `
    INSERT INTO work_sessions (user_id, started_at, ended_at, minutes, auto_clockout, corrected)
    VALUES ($1, $2, $3, $4, TRUE, TRUE)
    RETURNING id;
    `,
    [targetUserId, startAt, endAt, minutes]
  );

  await ensureEmployee(targetUserId);
  await query(
    `
    UPDATE employees
    SET total_minutes = total_minutes + $2,
        weekly_minutes = weekly_minutes + $2,
        left_server = FALSE
    WHERE user_id = $1;
    `,
    [targetUserId, minutes]
  );

  if (typeof stopFoodBusinessDutyOnly === "function") {
    await stopFoodBusinessDutyOnly(targetUserId, `Dienst-Korrektur durch ${issuerId}`).catch(() => null);
  } else {
    await query(`DELETE FROM active_sessions WHERE user_id = $1`, [targetUserId]).catch(() => null);
    const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
    const member = guild ? await guild.members.fetch(targetUserId).catch(() => null) : null;
    if (member) await member.roles.remove(DUTY_ROLE_ID, `Dienst-Korrektur durch ${issuerId}`).catch(() => null);
    await refreshAllTimeDisplays().catch(() => null);
  }

  await query(
    `INSERT INTO personnel_events (user_id, issuer_id, event_type, details) VALUES ($1, $2, $3, $4)`,
    [targetUserId, issuerId, "Dienst-Korrektur", `Crash/vergessen: ${formatShortMinutes(minutes)} gebucht. Grund: ${reason || "Nicht angegeben"}`]
  ).catch(() => null);

  await refreshAllTimeDisplays().catch(() => null);

  const logChannel = await client.channels.fetch(TIME_LOG_CHANNEL_ID).catch(() => null);
  if (logChannel) {
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("🕒 ・DIENST-KORREKTUR GEBUCHT")
      .setDescription(
        "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
          `👤 **Mitarbeiter**\n└ <@${targetUserId}>\n\n` +
          `🟢 **Startzeit**\n└ <t:${Math.floor(startAt.getTime() / 1000)}:F>\n\n` +
          `🔴 **Endzeit**\n└ <t:${Math.floor(endAt.getTime() / 1000)}:F>\n\n` +
          `⏱️ **Gebuchte Zeit**\n└ ${formatShortMinutes(minutes)}\n\n` +
          `📝 **Grund**\n└ ${reason || "Nicht angegeben"}\n\n` +
          `👮 **Korrigiert von**\n└ <@${issuerId}>\n` +
          "━━━━━━━━━━━━━━━━━━━━━━━━"
      )
      .setFooter({ text: "Caffee Container • Crash-/Dienstkorrektur" })
      .setTimestamp();
    await logChannel.send({ embeds: [embed] }).catch(() => null);
  }

  return { ok: true, sessionId: inserted.rows[0].id, minutes, startAt, endAt };
}


async function buildSystemStatusEmbed() {
  const checks = [];

  async function runCheck(label, fn) {
    try {
      await fn();
      checks.push(`🟢 **${label}**\n└ OK`);
    } catch (err) {
      console.error(`❌ Statuscheck fehlgeschlagen: ${label}`, err);
      checks.push(`🔴 **${label}**\n└ Fehler`);
    }
  }

  await runCheck("Datenbank", async () => await query(`SELECT 1`));
  await runCheck("Dashboard-Channel", async () => {
    if (!(await client.channels.fetch(DASHBOARD_CHANNEL_ID))) throw new Error("Dashboard fehlt");
  });
  await runCheck("Foodbusiness-Zeitlog", async () => {
    if (!(await client.channels.fetch(FOODBUSINESS_TIMELOG_CHANNEL_ID))) throw new Error("Zeitlog fehlt");
  });
  await runCheck("Zeit-/Fehlerlog", async () => {
    if (!(await client.channels.fetch(TIME_LOG_CHANNEL_ID))) throw new Error("Fehlerlog fehlt");
  });
  await runCheck("Im-Dienst-Rolle", async () => {
    const guild = await client.guilds.fetch(GUILD_ID);
    if (!(await guild.roles.fetch(DUTY_ROLE_ID))) throw new Error("Rolle fehlt");
  });

  const hasError = checks.some((x) => x.startsWith("🔴"));
  return new EmbedBuilder()
    .setColor(hasError ? 0xe74c3c : 0x2ecc71)
    .setTitle("🛡️ ・SYSTEM-STATUSCHECK")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      (hasError ? "🔴 Es gibt Probleme, bitte prüfen.\n\n" : "🟢 Alle Kernsysteme laufen.\n\n") +
      checks.join("\n\n") +
      "\n━━━━━━━━━━━━━━━━━━━━━━━━"
    )
    .setFooter({ text: "Caffee Container • Stabilitätsprüfung" })
    .setTimestamp();
}


async function sendWeeklySummaryIfNeeded() {
  const p = getBerlinParts();
  if (p.weekday !== "Mo." || p.hour !== "00" || p.minute !== "05") return;

  const todayKey = typeof getBerlinDateOnly === "function" ? getBerlinDateOnly() : `${p.year}-${p.month}-${p.day}`;
  const already = await getSetting("last_weekly_summary", null);
  if (already === todayKey) return;

  const employees = await query(`
    SELECT user_id, weekly_minutes
    FROM employees
    WHERE left_server = FALSE
    ORDER BY weekly_minutes DESC
  `);

  const reached = employees.rows.filter((e) => e.weekly_minutes >= MIN_WEEKLY_MINUTES);
  const missing = employees.rows.filter((e) => e.weekly_minutes < MIN_WEEKLY_MINUTES);

  const top = employees.rows.slice(0, 5).map((e, i) => {
    const place = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
    return `${place} <@${e.user_id}> — **${formatShortMinutes(e.weekly_minutes)}**`;
  }).join("\n") || "Keine Zeiten vorhanden.";

  const missingText = missing.slice(0, 10).map((e) => {
    return `• <@${e.user_id}> — **${formatShortMinutes(e.weekly_minutes)}**`;
  }).join("\n") || "Alle haben die Pflichtzeit erreicht.";

  const channel = await client.channels.fetch(WEEKLY_WORKTIME_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(missing.length ? 0xe67e22 : 0x2ecc71)
    .setTitle("📊 ・WOCHENZUSAMMENFASSUNG")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      `✅ **2h erreicht**\n└ ${reached.length}\n\n` +
      `⚠️ **Unter 2h**\n└ ${missing.length}\n\n` +
      `🏆 **Top 5**\n${top}\n\n` +
      `📌 **Prüfen**\n${missingText}\n` +
      "━━━━━━━━━━━━━━━━━━━━━━━━"
    )
    .setFooter({ text: "Caffee Container • Automatische Wochenzusammenfassung" })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  await setSetting("last_weekly_summary", todayKey);
}


// =====================
// VERWARNUNGS-SYNC
// =====================
function hasAnyTeamRole(member) {
  if (!member) return false;

  const teamRoleIds = [
    EMPLOYEE_ROLE_ID,
    PROBE_ROLE_ID,
    TEAMUPDATE_EMPLOYEE_ROLE_ID,
    TEAMUPDATE_PROBE_MANAGER_ROLE_ID,
    TEAMUPDATE_MANAGER_ROLE_ID,
    TEAMUPDATE_MANAGER_BASE_ROLE_ID,
    PERSONAL_MANAGER_ROLE_ID,
  ];

  return teamRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

async function syncWarningRecords({ manual = false, issuerId = null } = {}) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const warnings = await query(`
    SELECT *
    FROM warning_records
    WHERE active = TRUE;
  `);

  let checked = 0;
  let deactivated = 0;
  let missingMember = 0;
  let noTeamRole = 0;
  let roleRemoved = 0;

  for (const warning of warnings.rows) {
    checked++;

    const member = await guild.members.fetch(warning.user_id).catch(() => null);

    let shouldDeactivate = false;
    let reason = "";

    if (!member) {
      shouldDeactivate = true;
      reason = "User ist nicht mehr auf dem Discord.";
      missingMember++;
    } else if (!hasAnyTeamRole(member)) {
      shouldDeactivate = true;
      reason = "User hat keine relevante Teamrolle mehr.";
      noTeamRole++;
    } else if (!member.roles.cache.has(warning.warning_role_id)) {
      shouldDeactivate = true;
      reason = "Verwarnungsrolle wurde manuell entfernt.";
      roleRemoved++;
    }

    if (shouldDeactivate) {
      await query(
        `
        UPDATE warning_records
        SET active = FALSE
        WHERE id = $1;
        `,
        [warning.id]
      );

      deactivated++;

      await query(
        `INSERT INTO personnel_events (user_id, issuer_id, event_type, details) VALUES ($1, $2, $3, $4)`,
        [
          warning.user_id,
          issuerId,
          "Verwarnungs-Sync",
          `Aktive Verwarnung automatisch deaktiviert: ${reason}`,
        ]
      ).catch(() => null);
    }
  }

  await updateDashboardMessage().catch(() => null);

  return {
    checked,
    deactivated,
    missingMember,
    noTeamRole,
    roleRemoved,
  };
}

async function automaticWarningSync() {
  try {
    const result = await syncWarningRecords({ manual: false });

    if (result.deactivated > 0) {
      const channel = await client.channels.fetch(TIME_LOG_CHANNEL_ID).catch(() => null);

      if (channel) {
        const embed = new EmbedBuilder()
          .setColor(0x5dade2)
          .setTitle("🔄 ・VERWARNUNGS-SYNC")
          .setDescription(
            "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
              `✅ **Geprüft**\n└ ${result.checked}\n\n` +
              `🧹 **Automatisch deaktiviert**\n└ ${result.deactivated}\n\n` +
              `🚪 **Nicht mehr auf Discord**\n└ ${result.missingMember}\n\n` +
              `👥 **Keine Teamrolle mehr**\n└ ${result.noTeamRole}\n\n` +
              `⚠️ **Verwarnungsrolle entfernt**\n└ ${result.roleRemoved}\n` +
              "━━━━━━━━━━━━━━━━━━━━━━━━"
          )
          .setFooter({ text: "Caffee Container • Automatischer Verwarnungs-Sync" })
          .setTimestamp();

        await channel.send({ embeds: [embed] }).catch(() => null);
      }
    }
  } catch (err) {
    console.error("❌ Fehler beim automatischen Verwarnungs-Sync:", err);
  }
}


// =====================
// BOT-HILFE / SYSTEMÜBERSICHT
// =====================
function buildBotHelpEmbed() {
  return new EmbedBuilder()
    .setColor(0x5dade2)
    .setTitle("📘 ・CC ASSISTENT HILFE")
    .setDescription(
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "**Kurze Übersicht der wichtigsten Systeme & Commands**\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━"
    )
    .addFields(
      {
        name: "👩‍💼 Personal Management",
        value:
          "`/akte @user`\n└ Personalakte eines Mitarbeiters anzeigen\n\n" +
          "`/mitarbeitercheck @user`\n└ Mitarbeiter automatisch prüfen lassen\n\n" +
          "`/verwarnungen-sync`\n└ Verwarnungen mit Rollen/Teamstatus abgleichen",
      },
      {
        name: "🕒 Dienst & Zeiten",
        value:
          "`/dienst-korrektur @user endzeit grund`\n└ Crash/vergessenes Ausstempeln korrigieren\n\n" +
          "`/dienst-reset`\n└ Notfall: alle Im-Dienst-Rollen entfernen & aktive Sessions leeren\n\n" +
          "Foodbusiness-Zeitlogs werden automatisch erkannt und übernommen.",
      },
      {
        name: "👨‍💼 Management",
        value:
          "`/statuscheck`\n└ Prüft Datenbank, Channels, Rollen und Kernsysteme\n\n" +
          "Lagerprüfung läuft automatisch alle 2 Tage um 17:00 Uhr.\n\n" +
          "Dashboard aktualisiert sich automatisch.",
      },
      {
        name: "🔧 Hinweise",
        value:
          "Bei Problemen zuerst `/statuscheck` nutzen.\n" +
          "Wenn Leute falsch als eingestempelt angezeigt werden: `/dienst-reset`.\n" +
          "Wenn Verwarnungen falsch gezählt werden: `/verwarnungen-sync`.",
      }
    )
    .setFooter({ text: "Caffee Container • Bot-Hilfe" })
    .setTimestamp();
}


// =====================
// AUTOMATISCHE DATENBEREINIGUNG
// =====================
async function cleanupOldBotData({ manual = false } = {}) {
  const results = {
    oldPendingFoodLogs: 0,
    oldForgotAlerts: 0,
    oldProcessedLogs: 0,
    oldMoneyLogs: 0,
    staleSessions: 0,
  };

  const oldPending = await query(`
    DELETE FROM foodbusiness_pending_logs
    WHERE created_at <= NOW() - INTERVAL '7 days'
    RETURNING message_id;
  `).catch(() => ({ rows: [] }));
  results.oldPendingFoodLogs = oldPending.rows.length;

  const oldAlerts = await query(`
    DELETE FROM foodbusiness_forgot_alerts
    WHERE last_alert_at <= NOW() - INTERVAL '7 days'
    RETURNING user_id;
  `).catch(() => ({ rows: [] }));
  results.oldForgotAlerts = oldAlerts.rows.length;

  const oldProcessed = await query(`
    DELETE FROM foodbusiness_processed_logs
    WHERE created_at <= NOW() - INTERVAL '90 days'
    RETURNING message_id;
  `).catch(() => ({ rows: [] }));
  results.oldProcessedLogs = oldProcessed.rows.length;

  const oldMoney = await query(`
    DELETE FROM foodbusiness_money_logs
    WHERE created_at <= NOW() - INTERVAL '30 days'
    RETURNING message_id;
  `).catch(() => ({ rows: [] }));
  results.oldMoneyLogs = oldMoney.rows.length;

  const staleSessions = await query(`
    DELETE FROM active_sessions
    WHERE started_at <= NOW() - INTERVAL '24 hours'
    RETURNING user_id;
  `).catch(() => ({ rows: [] }));
  results.staleSessions = staleSessions.rows.length;

  if (staleSessions.rows.length) {
    const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);

    if (guild) {
      for (const row of staleSessions.rows) {
        const member = await guild.members.fetch(row.user_id).catch(() => null);
        if (member) {
          await member.roles.remove(DUTY_ROLE_ID, "Automatische Bereinigung alter aktiver Session").catch(() => null);
        }
      }
    }
  }

  await refreshAllTimeDisplays().catch(() => null);

  if (manual || Object.values(results).some((value) => value > 0)) {
    const channel = await client.channels.fetch(TIME_LOG_CHANNEL_ID).catch(() => null);

    if (channel) {
      const embed = new EmbedBuilder()
        .setColor(0x5dade2)
        .setTitle("🧹 ・BOT-DATENBEREINIGUNG")
        .setDescription(
          "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
            `🕒 **Alte Foodbusiness-Zuordnungen**\n└ ${results.oldPendingFoodLogs}\n\n` +
            `⚠️ **Alte Ausstempel-Warnungen**\n└ ${results.oldForgotAlerts}\n\n` +
            `📦 **Alte verarbeitete Foodbusiness-Logs**\n└ ${results.oldProcessedLogs}\n\n` +
            `💰 **Alte Geldlogs**\n└ ${results.oldMoneyLogs}\n\n` +
            `🔴 **Alte aktive Sessions beendet**\n└ ${results.staleSessions}\n` +
            "━━━━━━━━━━━━━━━━━━━━━━━━"
        )
        .setFooter({ text: "Caffee Container • Automatische Stabilitätsbereinigung" })
        .setTimestamp();

      await channel.send({ embeds: [embed] }).catch(() => null);
    }
  }

  return results;
}

async function automaticCleanupOldBotData() {
  try {
    await cleanupOldBotData({ manual: false });
  } catch (err) {
    console.error("❌ Fehler bei automatischer Datenbereinigung:", err);
  }
}

// =====================
// READY
// =====================
client.once("clientReady", async () => {
  console.log(`✅ Bot ist online als ${client.user.tag}`);

  try {
    await initDatabase();
    await registerCommands();
    await syncEmployeeRoles();
    await updateTotalWorktimeMessage();
    await updateWeeklyWorktimeMessage();
    await updateDashboardMessage();
    await updateWeeklyStatisticsMessage();
    await updateManagementTasksMessage();
    await sendStockCheckReminderIfNeeded(true);

    // Manuelle Stempeluhr deaktiviert: checkReminders wird nicht mehr benötigt.
    setInterval(
      () => updateTotalWorktimeMessage().catch((error) =>
        console.error("❌ Gesamtzeiten-Aktualisierung fehlgeschlagen:", error)
      ),
      2 * 60 * 1000
    );

    setInterval(
      () => updateWeeklyWorktimeMessage().catch((error) =>
        console.error("❌ Wochenzeiten-Aktualisierung fehlgeschlagen:", error)
      ),
      2 * 60 * 1000
    );

    setInterval(
      () => updateDashboardMessage().catch((error) =>
        console.error("❌ Dashboard-Aktualisierung fehlgeschlagen:", error)
      ),
      2 * 60 * 1000
    );

    setInterval(
      () => updateWeeklyStatisticsMessage().catch((error) =>
        console.error("❌ Wochenstatistik-Aktualisierung fehlgeschlagen:", error)
      ),
      5 * 60 * 1000
    );

    setInterval(
      () => updateManagementTasksMessage().catch((error) =>
        console.error("❌ Managementaufgaben-Aktualisierung fehlgeschlagen:", error)
      ),
      5 * 60 * 1000
    );
    setInterval(sendStockCheckReminderIfNeeded, 60 * 1000);
    setInterval(weeklyMinimumCheckAndReset, 60 * 1000);
    setInterval(checkWarningReviewReminders, 60 * 60 * 1000);
    setInterval(automaticWarningSync, 60 * 60 * 1000);
    setInterval(sendWeeklySummaryIfNeeded, 60 * 1000);
    setInterval(automaticCleanupOldBotData, 6 * 60 * 60 * 1000);
    setInterval(checkForgotFoodBusinessClockouts, 10 * 60 * 1000);

    console.log("✅ Foodbusiness-Autozeiten System gestartet.");
  } catch (err) {
    console.error("❌ Fehler beim Start:", err);
  }
});

// =====================
// MEMBER LEAVE
// =====================
client.on("guildMemberRemove", async (member) => {
  await deleteEmployeeTimeData(member.id);
  await updateTotalWorktimeMessage();
  await updateWeeklyWorktimeMessage();
});

client.on("guildMemberAdd", async (member) => {
  const channel = await client.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  await channel.send(
    `Hey ${member}, herzlich willkommen im Team des Caffee Containers! ☕💛
` +
      `Schön, dass du jetzt dabei bist – wir freuen uns auf die Zusammenarbeit mit dir.

` +
      `Bitte registriere dich noch im folgenden Channel: <#${REGISTRATION_CHANNEL_ID}>`
  );
});

// =====================
// MITARBEITER-ROLLE TRACKING
// =====================
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const hadRole = oldMember.roles.cache.has(EMPLOYEE_ROLE_ID);
  const hasRole = newMember.roles.cache.has(EMPLOYEE_ROLE_ID);

  const hadProbeRole = oldMember.roles.cache.has(PROBE_ROLE_ID);
  const hasProbeRole = newMember.roles.cache.has(PROBE_ROLE_ID);

  if (!hadProbeRole && hasProbeRole) {
    await ensureEmployee(newMember.id);
    await query(`UPDATE employees SET left_server = FALSE WHERE user_id = $1`, [newMember.id]);
    await updateTotalWorktimeMessage();
    await updateWeeklyWorktimeMessage();
    console.log(`✅ ${newMember.user.tag} wurde durch Probezeit-Rolle in die Zeitliste aufgenommen.`);
  }

  if (!hadRole && hasRole) {
    await ensureEmployee(newMember.id);
    await query(`UPDATE employees SET left_server = FALSE WHERE user_id = $1`, [newMember.id]);
    await updateTotalWorktimeMessage();
    await updateWeeklyWorktimeMessage();
    console.log(`✅ ${newMember.user.tag} wurde als Mitarbeiter hinzugefügt.`);
  }

  if (hadRole && !hasRole) {
    await query(`UPDATE employees SET left_server = TRUE WHERE user_id = $1`, [newMember.id]);
    await query(`DELETE FROM active_sessions WHERE user_id = $1`, [newMember.id]);
    await newMember.roles.remove(DUTY_ROLE_ID).catch(() => {});
    await updateTotalWorktimeMessage();
    await updateWeeklyWorktimeMessage();
    console.log(`❌ ${newMember.user.tag} wurde aus den Listen entfernt.`);
  }
});


// =====================
// FOODBIZ ZEITLOG MESSAGE LISTENER
// =====================
client.on("messageCreate", async (message) => {
  try {
    await handleFoodBusinessMoneyLogMessage(message);
    await handleFoodBusinessLogMessage(message);
  } catch (err) {
    console.error("❌ Fehler beim Foodbusiness-Log:", err);
  }
});

// =====================
// INTERACTIONS
// =====================
client.on("interactionCreate", async (interaction) => {
  try {
    // =====================
    // SLASH COMMANDS
    // =====================
    if (interaction.isChatInputCommand()) {




      if (interaction.commandName === "verwarnungen-sync") {
        if (!canManagePersonal(interaction.member)) {
          return interaction.reply({
            content: "❌ Du darfst den Verwarnungs-Sync nicht ausführen.",
            ephemeral: true,
          });
        }

        await interaction.deferReply({ ephemeral: true });

        const result = await syncWarningRecords({
          manual: true,
          issuerId: interaction.user.id,
        });

        const embed = new EmbedBuilder()
          .setColor(result.deactivated > 0 ? 0xf1c40f : 0x2ecc71)
          .setTitle("🔄 ・VERWARNUNGS-SYNC ABGESCHLOSSEN")
          .setDescription(
            "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
              `✅ **Geprüft**\n└ ${result.checked}\n\n` +
              `🧹 **Deaktiviert**\n└ ${result.deactivated}\n\n` +
              `🚪 **Nicht mehr auf Discord**\n└ ${result.missingMember}\n\n` +
              `👥 **Keine Teamrolle mehr**\n└ ${result.noTeamRole}\n\n` +
              `⚠️ **Verwarnungsrolle entfernt**\n└ ${result.roleRemoved}\n\n` +
              "Das Dashboard wurde anschließend aktualisiert.\n" +
              "━━━━━━━━━━━━━━━━━━━━━━━━"
          )
          .setFooter({ text: "Caffee Container • Manueller Verwarnungs-Sync" })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }



      if (interaction.commandName === "bot-cleanup") {
        if (!canManagePersonal(interaction.member)) {
          return interaction.reply({
            content: "❌ Du darfst die Bot-Bereinigung nicht ausführen.",
            ephemeral: true,
          });
        }

        await interaction.deferReply({ ephemeral: true });
        const result = await cleanupOldBotData({ manual: true });

        const embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("🧹 ・BOT-CLEANUP ABGESCHLOSSEN")
          .setDescription(
            "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
              `🕒 **Alte Foodbusiness-Zuordnungen**\n└ ${result.oldPendingFoodLogs}\n\n` +
              `⚠️ **Alte Ausstempel-Warnungen**\n└ ${result.oldForgotAlerts}\n\n` +
              `📦 **Alte verarbeitete Foodbusiness-Logs**\n└ ${result.oldProcessedLogs}\n\n` +
              `💰 **Alte Geldlogs**\n└ ${result.oldMoneyLogs}\n\n` +
              `🔴 **Alte aktive Sessions beendet**\n└ ${result.staleSessions}\n` +
              "━━━━━━━━━━━━━━━━━━━━━━━━"
          )
          .setFooter({ text: "Caffee Container • Manueller Cleanup" })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      if (interaction.commandName === "bot-hilfe") {
        const embed = buildBotHelpEmbed();

        return interaction.reply({
          embeds: [embed],
          ephemeral: true,
        });
      }

      if (interaction.commandName === "statuscheck") {
        if (!canManagePersonal(interaction.member)) {
          return interaction.reply({ content: "❌ Du darfst den Statuscheck nicht ausführen.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        const embed = await buildSystemStatusEmbed();
        return interaction.editReply({ embeds: [embed] });
      }

      if (interaction.commandName === "dienst-korrektur") {
        if (!canManagePersonal(interaction.member)) {
          return interaction.reply({ content: "❌ Du darfst keine Dienst-Korrektur durchführen.", ephemeral: true });
        }

        const targetUser = interaction.options.getUser("user");
        const endRaw = interaction.options.getString("endzeit");
        const reason = interaction.options.getString("grund") || "Crash / vergessen auszustempeln";

        const active = await query(`SELECT * FROM active_sessions WHERE user_id = $1`, [targetUser.id]);
        const session = active.rows[0];
        if (!session) {
          return interaction.reply({ content: "❌ Dieser User ist aktuell nicht als aktiv eingestempelt.", ephemeral: true });
        }

        const startAt = new Date(session.started_at);
        const endAt = parseDutyCorrectionEndTime(endRaw, startAt);
        if (!endAt) {
          return interaction.reply({ content: "❌ Ungültige Endzeit. Nutze z. B. `22:30` oder `07.07.2026 22:30`.", ephemeral: true });
        }

        const minutes = Math.max(0, Math.floor((endAt.getTime() - startAt.getTime()) / 60000));
        if (minutes <= 0) {
          return interaction.reply({ content: "❌ Die Endzeit liegt vor oder direkt auf der Startzeit.", ephemeral: true });
        }

        const correctionId = `${interaction.user.id}_${Date.now()}`;
        dutyCorrectionDrafts.set(correctionId, {
          targetUserId: targetUser.id,
          endAt: endAt.toISOString(),
          reason,
          issuerId: interaction.user.id,
        });

        const embed = new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle("🕒 ・DIENST-KORREKTUR VORSCHAU")
          .setDescription(
            "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
              `👤 **Mitarbeiter**\n└ <@${targetUser.id}>\n\n` +
              `🟢 **Startzeit**\n└ <t:${Math.floor(startAt.getTime() / 1000)}:F>\n\n` +
              `🔴 **Endzeit**\n└ <t:${Math.floor(endAt.getTime() / 1000)}:F>\n\n` +
              `⏱️ **Berechnete Zeit**\n└ ${formatShortMinutes(minutes)}\n\n` +
              `📝 **Grund**\n└ ${reason}\n\n` +
              "Bitte prüfe die Angaben und bestätige erst danach.\n" +
              "━━━━━━━━━━━━━━━━━━━━━━━━"
          )
          .setFooter({ text: "Caffee Container • Dienst-Korrektur Vorschau" })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`duty_correction_confirm_${correctionId}`).setLabel("Zeit buchen").setEmoji("✅").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`duty_correction_cancel_${correctionId}`).setLabel("Abbrechen").setEmoji("❌").setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }

      if (interaction.commandName === "dienst-reset") {
        if (!canManagePersonal(interaction.member)) {
          return interaction.reply({
            content: "❌ Du darfst den Dienst-Reset nicht ausführen.",
            ephemeral: true,
          });
        }

        await interaction.deferReply({ ephemeral: true });
        const guild = interaction.guild;
        await guild.members.fetch();

        const membersWithDutyRole = guild.members.cache.filter((member) =>
          member.roles.cache.has(DUTY_ROLE_ID)
        );

        let removed = 0;
        let failed = 0;

        for (const [, member] of membersWithDutyRole) {
          try {
            await member.roles.remove(
              DUTY_ROLE_ID,
              `Notfall-Dienst-Reset durch ${interaction.user.tag}`
            );
            removed++;
          } catch (err) {
            failed++;
            console.error(`❌ Im-Dienst-Rolle konnte bei ${member.id} nicht entfernt werden:`, err);
          }
        }

        const deletedSessions = await query(
          `DELETE FROM active_sessions RETURNING user_id`
        ).catch(() => ({ rows: [] }));

        await query(`DELETE FROM foodbusiness_forgot_alerts`).catch(() => null);
        await refreshAllTimeDisplays().catch(() => null);

        const embed = new EmbedBuilder()
          .setColor(failed === 0 ? 0x2ecc71 : 0xe67e22)
          .setTitle("🧹 ・DIENST-RESET ABGESCHLOSSEN")
          .setDescription(
            "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
            `🛡️ **Im-Dienst-Rollen entfernt**\n└ ${removed}\n\n` +
            `🗄️ **Aktive Sessions gelöscht**\n└ ${deletedSessions.rows.length}\n\n` +
            `⚠️ **Fehlgeschlagene Rollenentfernungen**\n└ ${failed}\n\n` +
            "Neue Dienstzeiten werden ab jetzt wieder automatisch über Foodbusiness erkannt.\n" +
            "━━━━━━━━━━━━━━━━━━━━━━━━"
          )
          .setFooter({ text: "Caffee Container • Notfall-Dienst-Reset" })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      if (interaction.commandName === "mitarbeiterpanel") {
        const embed = new EmbedBuilder()
          .setColor(0xe67e22)
          .setTitle("👥 ・MITARBEITERPANEL")
          .setDescription(
            "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
              "Willkommen im Mitarbeiterbereich des **Caffee Containers**.\n\n" +
              "❌ **Abmeldung**\n" +
              "└ Melde dich für einen Zeitraum ab\n\n" +
              "🛒 **Einkauf**\n" +
              "└ Trage ein, was benötigt wird\n\n" +
              "📋 **Bewerbung**\n" +
              "└ IC-Bewerbung einreichen\n\n" +
              "🚫 **Hausverbot**\n" +
              "└ Hausverbot dokumentieren\n" +
              "━━━━━━━━━━━━━━━━━━━━━━━━"
          )
          .setFooter({ text: "Caffee Container • Mitarbeiterverwaltung • Premium Design" })
          .setTimestamp();

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("open_absence_modal").setLabel("Abmeldung").setEmoji("❌").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("open_shopping_modal").setLabel("Einkauf").setEmoji("🛒").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("open_application_modal").setLabel("Bewerbung").setEmoji("📋").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("open_ban_modal").setLabel("Hausverbot").setEmoji("🚫").setStyle(ButtonStyle.Danger)
        );

        return interaction.reply({ embeds: [embed], components: [row1] });
      }

      if (interaction.commandName === "managementpanel") {
        if (!canManagePersonal(interaction.member)) {
          return interaction.reply({ content: "❌ Du darfst dieses Panel nicht erstellen.", ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🛠️ ・MANAGEMENT PANEL")
          .setDescription(
            "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
              "Verwalte hier das Team des **Caffee Containers**.\n\n" +
              "🧠 **Einweisung**\n" +
              "└ Einweisung dokumentieren\n\n" +
              "🔄 **Teamupdate**\n" +
              "└ Beförderungen und Rollenänderungen\n\n" +
              "📤 **Kündigung**\n" +
              "└ Mitarbeiter aus Zeitlisten entfernen\n\n" +
              "⚠️ **Verwarnung**\n" +
              "└ Normale Verwarnung ausstellen\n\n" +
              "✅ **Verwarnung zurückziehen**\n" +
              "└ Aktive Verwarnung entfernen\n\n" +
              "⏱️ **Zeitverwaltung**\n" +
              "└ Zeiten ansehen, hinzufügen, entfernen oder setzen\n" +
              "━━━━━━━━━━━━━━━━━━━━━━━━"
          )
          .setFooter({ text: "Caffee Container • Managementsystem • Premium Design" })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], components: managementPanelRows() });
      }

      if (interaction.commandName === "registrierungspanel") {
        if (!canCreatePanels(interaction.member)) {
          return interaction.reply({ content: "❌ Du darfst dieses Panel nicht erstellen.", ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle("📝 ・REGISTRIERUNG")
          .setDescription(
            "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
              "Registriere dich hier als Mitarbeiter des **Caffee Containers**.\n\n" +
              "📌 **Bitte eintragen:**\n" +
              "└ Vorname\n" +
              "└ Nachname\n\n" +
              "✅ Nach der Registrierung erhältst du automatisch deine Rollen.\n" +
              "━━━━━━━━━━━━━━━━━━━━━━━━"
          )
          .setFooter({ text: "Caffee Container • Registrierungssystem • Premium Design" })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("open_registration_modal")
            .setLabel("Registrieren")
            .setEmoji("📝")
            .setStyle(ButtonStyle.Primary)
        );

        return interaction.reply({ embeds: [embed], components: [row] });
      }

      if (interaction.commandName === "dashboard") {
        if (!canManagePersonal(interaction.member)) {
          return interaction.reply({ content: "❌ Du darfst das Dashboard nicht aktualisieren.", ephemeral: true });
        }

        await updateDashboardMessage();
        return interaction.reply({ content: "✅ Dashboard wurde aktualisiert.", ephemeral: true });
      }

      if (interaction.commandName === "akte") {
        if (!canManagePersonal(interaction.member)) {
          return interaction.reply({ content: "❌ Du darfst keine Personalakten ansehen.", ephemeral: true });
        }

        const target = interaction.options.getUser("user");

        await interaction.deferReply({ ephemeral: true });

        await sendPersonalFileToChannel(target.id, interaction.user.id);

        return interaction.editReply({
          content: `✅ Personalakte von ${target} wurde in den Personalakten-Channel gesendet.`,
        });
      }

      if (interaction.commandName === "mitarbeitercheck") {
        if (!canManagePersonal(interaction.member)) {
          return interaction.reply({ content: "❌ Du darfst keinen Mitarbeitercheck ausführen.", ephemeral: true });
        }

        const target = interaction.options.getUser("user");
        await interaction.deferReply({ ephemeral: true });

        const embed = await buildEmployeeCheckEmbed(target.id);
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (interaction.commandName === "personalnotiz") {
        if (!canManagePersonal(interaction.member)) {
          return interaction.reply({ content: "❌ Du darfst keine Personalnotizen erstellen.", ephemeral: true });
        }

        const target = interaction.options.getUser("user");
        const note = interaction.options.getString("notiz");

        await interaction.deferReply({ ephemeral: true });

        await query(
          `INSERT INTO personal_file_notes (user_id, issuer_id, note) VALUES ($1, $2, $3)`,
          [target.id, interaction.user.id, note]
        );

        await sendPersonalFileToChannel(target.id, interaction.user.id);

        return interaction.editReply({
          content: `✅ Notiz wurde zur Personalakte von ${target} hinzugefügt.`,
        });
      }

    }

    // =====================
    // SELECT MENUS
    // =====================
    if (interaction.isUserSelectMenu()) {
      const id = interaction.customId;

      if (id.startsWith("fb_assign_")) {
        if (!canManagePersonal(interaction.member)) {
          return interaction.reply({ content: "❌ Du darfst diese Zeit nicht zuordnen.", ephemeral: true });
        }

        const messageId = id.replace("fb_assign_", "");
        const targetUserId = interaction.values?.[0];

        const pending = await query(
          `SELECT * FROM foodbusiness_pending_logs WHERE message_id = $1`,
          [messageId]
        ).catch(() => ({ rows: [] }));

        const log = pending.rows[0];

        if (!log) {
          return interaction.reply({
            content: "❌ Dieser Foodbusiness-Zeitlog wurde nicht gefunden oder bereits verarbeitet.",
            ephemeral: true,
          });
        }

        const result = await applyFoodBusinessTime({
          messageId,
          targetUserId,
          icName: log.ic_name,
          minutes: log.minutes,
          assignedBy: interaction.user.id,
        });

        if (result.alreadyProcessed) {
          return interaction.reply({
            content: "❌ Diese Arbeitszeit wurde bereits übernommen.",
            ephemeral: true,
          });
        }

        await query(`DELETE FROM foodbusiness_pending_logs WHERE message_id = $1`, [messageId]).catch(() => null);

        const oldEmbed = interaction.message.embeds[0];
        const embed = EmbedBuilder.from(oldEmbed)
          .setColor(0x2ecc71)
          .setTitle("✅ ・ZEITLOG ZUGEORDNET")
          .setDescription(
            "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
              `👤 **IC-Name**\n└ ${log.ic_name}\n\n` +
              `👥 **Zugeordnet zu**\n└ <@${targetUserId}>\n\n` +
              `⏱️ **Arbeitszeit**\n└ ${formatShortMinutes(log.minutes)}\n\n` +
              `🛠️ **Zugeordnet von**\n└ <@${interaction.user.id}>\n` +
              "━━━━━━━━━━━━━━━━━━━━━━━━"
          )
          .setTimestamp();

        await interaction.message.edit({ embeds: [embed], components: [] }).catch(() => null);

        return interaction.reply({
          content: `✅ Zeit wurde <@${targetUserId}> gutgeschrieben und für zukünftige Logs gemerkt.`,
          ephemeral: true,
        });
      }


      if (
        id === "time_add_user" ||
        id === "time_remove_user" ||
        id === "time_set_weekly_user" ||
        id === "time_set_total_user" ||
        id === "time_view_user"
      ) {
        if (!canManagePersonal(interaction.member)) {
          return interaction.reply({ content: "❌ Du darfst die Zeitverwaltung nicht nutzen.", ephemeral: true });
        }

        const targetUserId = interaction.values?.[0];

        if (!targetUserId) {
          return interaction.reply({ content: "❌ Es wurde kein Mitarbeiter ausgewählt.", ephemeral: true });
        }

        const actionMap = {
          time_add_user: "add",
          time_remove_user: "remove",
          time_set_weekly_user: "set_weekly",
          time_set_total_user: "set_total",
          time_view_user: "view",
        };

        const action = actionMap[id];

        if (action === "view") {
          const embed = await buildTimeOverviewEmbed(targetUserId);
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        timeManagementDrafts.set(interaction.user.id, {
          action,
          targetUserId,
        });

        const actionTexts = {
          add: "➕ Zeit hinzufügen",
          remove: "➖ Zeit entfernen",
          set_weekly: "🔄 Weekly-Zeit setzen",
          set_total: "🏆 Gesamtzeit setzen",
        };

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`time_open_modal_${action}`)
            .setLabel("Weiter")
            .setEmoji("➡️")
            .setStyle(ButtonStyle.Primary)
        );

        return interaction.reply({
          content: `${actionTexts[action]} für <@${targetUserId}> ausgewählt. Klicke jetzt auf **Weiter**.`,
          components: [row],
          ephemeral: true,
        });
      }


      const map = {
        mgmt_warning_user: "warning",
        mgmt_missing_hours_user: "missing_hours",
        mgmt_teamupdate_user: "teamupdate",
        mgmt_termination_user: "termination",
        mgmt_warning_remove_user: "warning_remove",
        mgmt_training_user: "training",
        mgmt_training_instructor: "training",
      };

      const type = map[id];
      if (!type) return;

      if (type?.startsWith("time_")) {
        const targetUserId = interaction.values?.[0];

        if (!targetUserId) {
          return interaction.reply({ content: "❌ Es wurde kein Mitarbeiter ausgewählt.", ephemeral: true });
        }

        const action = type.replace("time_", "");

        const draft = {
          action,
          targetUserId,
        };

        timeManagementDrafts.set(interaction.user.id, draft);

        if (type === "time_view") {
          const embed = await buildTimeOverviewEmbed(targetUserId);
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const actionTexts = {
          add: "➕ Zeit hinzufügen",
          remove: "➖ Zeit entfernen",
          set_weekly: "🔄 Weekly-Zeit setzen",
          set_total: "🏆 Gesamtzeit setzen",
        };

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`time_open_modal_${action}`)
            .setLabel("Weiter")
            .setEmoji("➡️")
            .setStyle(ButtonStyle.Primary)
        );

        return interaction.reply({
          content: `${actionTexts[action] || "Zeitverwaltung"} für <@${targetUserId}> ausgewählt. Klicke jetzt auf **Weiter**.`,
          components: [row],
          ephemeral: true,
        });
      }

      const key = draftKey(interaction.user.id, type);
      const draft = managementDrafts.get(key) || {};

      if (id === "mgmt_training_instructor") draft.instructorId = interaction.values[0];
      else draft.targetUserId = interaction.values[0];

      managementDrafts.set(key, draft);
      return interaction.reply({ content: "✅ Auswahl gespeichert.", ephemeral: true });
    }

    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;

      if (id === "mgmt_warning_role") {
        const key = draftKey(interaction.user.id, "warning");
        const draft = managementDrafts.get(key) || {};
        draft.warningRoleId = interaction.values[0];
        managementDrafts.set(key, draft);
        return interaction.reply({ content: "✅ Verwarnung gespeichert.", ephemeral: true });
      }

      if (id === "mgmt_missing_hours_role") {
        const key = draftKey(interaction.user.id, "missing_hours");
        const draft = managementDrafts.get(key) || {};
        draft.warningRoleId = interaction.values[0];
        managementDrafts.set(key, draft);
        return interaction.reply({ content: "✅ Verwarnung für fehlende Stunden gespeichert.", ephemeral: true });
      }

      if (id === "mgmt_warning_remove_role") {
        const key = draftKey(interaction.user.id, "warning_remove");
        const draft = managementDrafts.get(key) || {};
        draft.warningRoleId = interaction.values[0];
        managementDrafts.set(key, draft);
        return interaction.reply({ content: "✅ Verwarnung gespeichert.", ephemeral: true });
      }

      if (id === "mgmt_teamupdate_role") {
        const key = draftKey(interaction.user.id, "teamupdate");
        const draft = managementDrafts.get(key) || {};
        draft.updateType = interaction.values[0];
        managementDrafts.set(key, draft);
        return interaction.reply({ content: "✅ Teamupdate-Rolle gespeichert.", ephemeral: true });
      }
    }

    // =====================
    // BUTTONS
    // =====================
    if (interaction.isButton()) {

      if (
        interaction.customId.startsWith("duty_correction_confirm_") ||
        interaction.customId.startsWith("duty_correction_cancel_")
      ) {
        if (!canManagePersonal(interaction.member)) {
          return interaction.reply({
            content: "❌ Du darfst diese Dienst-Korrektur nicht bearbeiten.",
            ephemeral: true,
          });
        }

        const isConfirm = interaction.customId.startsWith("duty_correction_confirm_");
        const correctionId = interaction.customId
          .replace("duty_correction_confirm_", "")
          .replace("duty_correction_cancel_", "");

        const draft = dutyCorrectionDrafts.get(correctionId);

        if (!draft) {
          return interaction.reply({
            content: "❌ Diese Korrektur ist abgelaufen oder wurde bereits bearbeitet. Bitte starte `/dienst-korrektur` neu.",
            ephemeral: true,
          });
        }

        if (!isConfirm) {
          dutyCorrectionDrafts.delete(correctionId);
          await interaction.message.edit({ components: [] }).catch(() => null);

          return interaction.reply({
            content: "❌ Dienst-Korrektur wurde abgebrochen.",
            ephemeral: true,
          });
        }

        await interaction.deferReply({ ephemeral: true });

        const result = await applyDutyCorrection({
          targetUserId: draft.targetUserId,
          endAt: new Date(draft.endAt),
          issuerId: interaction.user.id,
          reason: draft.reason,
        });

        dutyCorrectionDrafts.delete(correctionId);
        await interaction.message.edit({ components: [] }).catch(() => null);

        if (!result.ok) {
          return interaction.editReply({
            content: `❌ ${result.error}`,
          });
        }

        return interaction.editReply({
          content:
            `✅ **Dienst-Korrektur gebucht.**\n` +
            `👤 User: <@${draft.targetUserId}>\n` +
            `⏱️ Zeit: **${formatShortMinutes(result.minutes)}**\n` +
            `🔴 Im-Dienst-Rolle wurde entfernt.`,
        });
      }


      // ZEITVERWALTUNG START
      if (
        interaction.customId === "time_add_start" ||
        interaction.customId === "time_remove_start" ||
        interaction.customId === "time_set_weekly_start" ||
        interaction.customId === "time_set_total_start" ||
        interaction.customId === "time_view_start"
      ) {
        if (!canManagePersonal(interaction.member)) {
          return interaction.reply({ content: "❌ Du darfst die Zeitverwaltung nicht nutzen.", ephemeral: true });
        }

        const actionMap = {
          time_add_start: {
            selectId: "time_add_user",
            text: "➕ Wähle den Mitarbeiter aus, dem Zeit hinzugefügt werden soll.",
          },
          time_remove_start: {
            selectId: "time_remove_user",
            text: "➖ Wähle den Mitarbeiter aus, dem Zeit entfernt werden soll.",
          },
          time_set_weekly_start: {
            selectId: "time_set_weekly_user",
            text: "🔄 Wähle den Mitarbeiter aus, dessen Weekly-Zeit gesetzt werden soll.",
          },
          time_set_total_start: {
            selectId: "time_set_total_user",
            text: "🏆 Wähle den Mitarbeiter aus, dessen Gesamtzeit gesetzt werden soll.",
          },
          time_view_start: {
            selectId: "time_view_user",
            text: "📊 Wähle den Mitarbeiter aus, dessen Zeiten du ansehen möchtest.",
          },
        };

        const config = actionMap[interaction.customId];

        return interaction.reply({
          content: config.text,
          components: [timeUserSelect(config.selectId)],
          ephemeral: true,
        });
      }

      if (interaction.customId.startsWith("time_open_modal_")) {
        if (!canManagePersonal(interaction.member)) {
          return interaction.reply({ content: "❌ Du darfst die Zeitverwaltung nicht nutzen.", ephemeral: true });
        }

        const action = interaction.customId.replace("time_open_modal_", "");
        const draft = timeManagementDrafts.get(interaction.user.id);

        if (!draft?.targetUserId || draft.action !== action) {
          return interaction.reply({
            content: "❌ Deine Auswahl wurde nicht gefunden. Bitte starte die Zeitverwaltung neu.",
            ephemeral: true,
          });
        }

        const actionTitles = {
          add: "Zeit hinzufügen",
          remove: "Zeit entfernen",
          set_weekly: "Weekly-Zeit setzen",
          set_total: "Gesamtzeit setzen",
        };

        const modal = new ModalBuilder()
          .setCustomId(`time_manage_modal_${action}`)
          .setTitle(actionTitles[action] || "Zeitverwaltung");

        const amountInput = new TextInputBuilder()
          .setCustomId("time_amount")
          .setLabel("Zeit eingeben")
          .setPlaceholder("z. B. 1:30 oder 90")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const noteInput = new TextInputBuilder()
          .setCustomId("time_note")
          .setLabel("Notiz")
          .setPlaceholder("z. B. Korrektur / Nachtrag")
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(amountInput),
          new ActionRowBuilder().addComponents(noteInput)
        );

        return interaction.showModal(modal);
      }

      // MANAGEMENT START
      if (interaction.customId === "mgmt_warning_start") {
        if (!canManagePersonal(interaction.member)) return interaction.reply({ content: "❌ Du darfst das nicht.", ephemeral: true });
        managementDrafts.set(draftKey(interaction.user.id, "warning"), {});
        return interaction.reply({
          content: "⚠️ Wähle den User und die Verwarnung aus. Danach auf **Weiter** klicken.",
          components: [userSelect("mgmt_warning_user", "User für Verwarnung auswählen"), warningRoleSelect("mgmt_warning_role"), continueButton("mgmt_warning_continue")],
          ephemeral: true,
        });
      }

      if (interaction.customId === "mgmt_missing_hours_start") {
        if (!canManagePersonal(interaction.member)) return interaction.reply({ content: "❌ Du darfst das nicht.", ephemeral: true });
        managementDrafts.set(draftKey(interaction.user.id, "missing_hours"), {});
        return interaction.reply({
          content: "⏰ Wähle den User und die Verwarnung für fehlende Stunden aus. Danach auf **Weiter** klicken.",
          components: [
            userSelect("mgmt_missing_hours_user", "User für fehlende Stunden auswählen"),
            warningRoleSelect("mgmt_missing_hours_role"),
            continueButton("mgmt_missing_hours_continue"),
          ],
          ephemeral: true,
        });
      }

      if (interaction.customId === "mgmt_teamupdate_start") {
        if (!canManagePersonal(interaction.member)) return interaction.reply({ content: "❌ Du darfst das nicht.", ephemeral: true });
        managementDrafts.set(draftKey(interaction.user.id, "teamupdate"), {});
        return interaction.reply({
          content: "🔄 Wähle den User und die neue Rolle/Änderung aus. Danach auf **Weiter** klicken.",
          components: [
            userSelect("mgmt_teamupdate_user", "User für Teamupdate auswählen"),
            teamUpdateRoleSelect("mgmt_teamupdate_role"),
            continueButton("mgmt_teamupdate_continue"),
          ],
          ephemeral: true,
        });
      }

      if (interaction.customId === "mgmt_termination_start") {
        if (!canManagePersonal(interaction.member)) return interaction.reply({ content: "❌ Du darfst das nicht.", ephemeral: true });
        managementDrafts.set(draftKey(interaction.user.id, "termination"), {});
        return interaction.reply({
          content: "📤 Wähle den User aus. Danach auf **Weiter** klicken.",
          components: [userSelect("mgmt_termination_user", "User für Kündigung auswählen"), continueButton("mgmt_termination_continue")],
          ephemeral: true,
        });
      }

      if (interaction.customId === "mgmt_warning_remove_start") {
        if (!canManagePersonal(interaction.member)) return interaction.reply({ content: "❌ Du darfst das nicht.", ephemeral: true });
        managementDrafts.set(draftKey(interaction.user.id, "warning_remove"), {});
        return interaction.reply({
          content: "🔄 Wähle den User und die Verwarnung aus. Danach auf **Weiter** klicken.",
          components: [userSelect("mgmt_warning_remove_user", "User auswählen"), warningRoleSelect("mgmt_warning_remove_role"), continueButton("mgmt_warning_remove_continue")],
          ephemeral: true,
        });
      }

      if (interaction.customId === "mgmt_training_start") {
        if (!canManagePersonal(interaction.member)) return interaction.reply({ content: "❌ Du darfst das nicht.", ephemeral: true });
        managementDrafts.set(draftKey(interaction.user.id, "training"), {});
        return interaction.reply({
          content: "🧠 Wähle Mitarbeiter und Einweiser aus. Danach auf **Weiter** klicken.",
          components: [userSelect("mgmt_training_user", "Mitarbeiter auswählen"), userSelect("mgmt_training_instructor", "Einweisung durch auswählen"), continueButton("mgmt_training_continue")],
          ephemeral: true,
        });
      }

      if (interaction.customId === "mgmt_time_management_start") {
        if (!canManagePersonal(interaction.member)) return interaction.reply({ content: "❌ Du darfst das nicht.", ephemeral: true });

        const embed = new EmbedBuilder()
          .setColor(0x5dade2)
          .setTitle("⏱️ ・ZEITVERWALTUNG")
          .setDescription(
            "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
              "Wähle aus, was du in der Zeitverwaltung machen möchtest.\n\n" +
              "➕ **Zeit hinzufügen**\n" +
              "➖ **Zeit entfernen**\n" +
              "📊 **Zeiten ansehen**\n" +
              "🔄 **Weekly setzen**\n" +
              "🏆 **Gesamtzeit setzen**\n" +
              "━━━━━━━━━━━━━━━━━━━━━━━━"
          )
          .setFooter({ text: "Caffee Container • Zeitverwaltung" })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], components: timeManagementPanelRows(), ephemeral: true });
      }

      // MANAGEMENT CONTINUE
      if (interaction.customId === "mgmt_warning_continue") {
        const draft = managementDrafts.get(draftKey(interaction.user.id, "warning"));
        if (!draft?.targetUserId || !draft?.warningRoleId) return interaction.reply({ content: "❌ Bitte User und Verwarnung auswählen.", ephemeral: true });

        const modal = new ModalBuilder().setCustomId("mgmt_warning_modal").setTitle("Verwarnung erstellen");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("warning_reason").setLabel("Grund").setPlaceholder("Grund der Verwarnung").setStyle(TextInputStyle.Paragraph).setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }

      if (interaction.customId === "mgmt_missing_hours_continue") {
        const draft = managementDrafts.get(draftKey(interaction.user.id, "missing_hours"));
        if (!draft?.targetUserId || !draft?.warningRoleId) {
          return interaction.reply({ content: "❌ Bitte User und Verwarnung auswählen.", ephemeral: true });
        }

        await sendMissingHoursWarning(draft.targetUserId, draft.warningRoleId, interaction.user.id);
        managementDrafts.delete(draftKey(interaction.user.id, "missing_hours"));
        return interaction.reply({ content: "✅ Verwarnung für fehlende Stunden wurde gesendet.", ephemeral: true });
      }

      if (interaction.customId === "mgmt_teamupdate_continue") {
        const draft = managementDrafts.get(draftKey(interaction.user.id, "teamupdate"));
        if (!draft?.targetUserId || !draft?.updateType) {
          return interaction.reply({ content: "❌ Bitte User und Rolle/Änderung auswählen.", ephemeral: true });
        }

        await sendTeamUpdate(draft.targetUserId, draft.updateType, interaction.user.id);
        managementDrafts.delete(draftKey(interaction.user.id, "teamupdate"));
        return interaction.reply({ content: "✅ Teamupdate wurde gesendet und die Rolle wurde vergeben.", ephemeral: true });
      }

      if (interaction.customId === "mgmt_termination_continue") {
        const draft = managementDrafts.get(draftKey(interaction.user.id, "termination"));
        if (!draft?.targetUserId) return interaction.reply({ content: "❌ Bitte User auswählen.", ephemeral: true });

        const modal = new ModalBuilder().setCustomId("mgmt_termination_modal").setTitle("Kündigung erstellen");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("termination_note").setLabel("Notiz").setPlaceholder("z. B. Eigenwunsch").setStyle(TextInputStyle.Paragraph).setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }

      if (interaction.customId === "mgmt_warning_remove_continue") {
        const draft = managementDrafts.get(draftKey(interaction.user.id, "warning_remove"));
        if (!draft?.targetUserId || !draft?.warningRoleId) return interaction.reply({ content: "❌ Bitte User und Verwarnung auswählen.", ephemeral: true });
        await sendWarningRemove(draft.targetUserId, draft.warningRoleId, interaction.user.id);
        managementDrafts.delete(draftKey(interaction.user.id, "warning_remove"));
        return interaction.reply({ content: "✅ Zurückgezogene Verwarnung wurde gesendet.", ephemeral: true });
      }

      if (interaction.customId === "mgmt_training_continue") {
        const draft = managementDrafts.get(draftKey(interaction.user.id, "training"));
        if (!draft?.targetUserId || !draft?.instructorId) return interaction.reply({ content: "❌ Bitte Mitarbeiter und Einweiser auswählen.", ephemeral: true });

        const modal = new ModalBuilder().setCustomId("mgmt_training_modal").setTitle("Einweisung dokumentieren");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("training_date").setLabel("Datum").setPlaceholder("z. B. 12.05.2026").setStyle(TextInputStyle.Short).setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }

      // LEADERBOARD BUTTONS
      if (interaction.customId === "weekly_prev" || interaction.customId === "weekly_next") {
        const current = Number(await getSetting("weekly_page", "0"));
        const next = interaction.customId === "weekly_next" ? current + 1 : current - 1;
        await setSetting("weekly_page", Math.max(0, next));
        await updateWeeklyWorktimeMessage();
        return interaction.reply({ content: "✅ Weekly Leaderboard aktualisiert.", ephemeral: true });
      }

      if (interaction.customId === "total_prev" || interaction.customId === "total_next") {
        const current = Number(await getSetting("total_page", "0"));
        const next = interaction.customId === "total_next" ? current + 1 : current - 1;
        await setSetting("total_page", Math.max(0, next));
        await updateTotalWorktimeMessage();
        return interaction.reply({ content: "✅ Gesamtzeiten aktualisiert.", ephemeral: true });
      }

      if (
        interaction.customId === "clock_in" ||
        interaction.customId === "clock_out" ||
        interaction.customId === "pause_start" ||
        interaction.customId === "pause_end"
      ) {
        return interaction.reply({
          content: "ℹ️ Die manuelle Stempeluhr wurde deaktiviert. Arbeitszeiten werden jetzt automatisch über den Foodbusiness-Zeitlog erkannt.",
          ephemeral: true,
        });
      }

      // CLOCK BUTTONS
      if (interaction.customId === "clock_in") {
        if (!interaction.member.roles.cache.has(EMPLOYEE_ROLE_ID)) {
          return interaction.reply({ content: "❌ Du kannst dich nur einstempeln, wenn du die Mitarbeiter-Rolle hast.", ephemeral: true });
        }

        await ensureEmployee(interaction.user.id);
        const existing = await query(`SELECT * FROM active_sessions WHERE user_id = $1`, [interaction.user.id]);

        if (existing.rows[0]) return interaction.reply({ content: "❌ Du bist bereits eingestempelt.", ephemeral: true });

        await query(`INSERT INTO active_sessions (user_id, started_at) VALUES ($1, NOW())`, [interaction.user.id]);
        await interaction.member.roles.add(DUTY_ROLE_ID).catch(() => {});
        await sendTimeLog("in", `<@${interaction.user.id}>`, "Dienst wurde gestartet.");
        await updateTotalWorktimeMessage();
        await updateWeeklyWorktimeMessage();
        await updateDashboardMessage().catch(() => null);

        return interaction.reply({ content: "✅ Du wurdest eingestempelt und hast die Im-Dienst-Rolle erhalten.", ephemeral: true });
      }

      if (interaction.customId === "clock_out") {
        const finished = await finishSession(interaction.user.id, false, new Date());
        if (!finished) return interaction.reply({ content: "❌ Du bist aktuell nicht eingestempelt.", ephemeral: true });
        return interaction.reply({ content: `✅ Du wurdest ausgestempelt. Gespeicherte Arbeitszeit: **${formatShortMinutes(finished.minutes)}**`, ephemeral: true });
      }

      if (interaction.customId === "pause_start") {
        const res = await query(`SELECT * FROM active_sessions WHERE user_id = $1`, [interaction.user.id]);
        const s = res.rows[0];

        if (!s) return interaction.reply({ content: "❌ Du bist nicht eingestempelt.", ephemeral: true });
        if (s.pause_started_at) return interaction.reply({ content: "❌ Du bist bereits in Pause.", ephemeral: true });

        await query(`UPDATE active_sessions SET pause_started_at = NOW() WHERE user_id = $1`, [interaction.user.id]);
        await sendTimeLog("pause", `<@${interaction.user.id}>`, "Pause wurde gestartet.");
        await updateWeeklyWorktimeMessage();

        return interaction.reply({ content: "⏸️ Pause gestartet. Deine Arbeitszeit läuft währenddessen nicht weiter.", ephemeral: true });
      }

      if (interaction.customId === "pause_end") {
        const res = await query(`SELECT * FROM active_sessions WHERE user_id = $1`, [interaction.user.id]);
        const s = res.rows[0];

        if (!s) return interaction.reply({ content: "❌ Du bist nicht eingestempelt.", ephemeral: true });
        if (!s.pause_started_at) return interaction.reply({ content: "❌ Du bist aktuell nicht in Pause.", ephemeral: true });

        const pauseMs = Date.now() - new Date(s.pause_started_at).getTime();

        await query(
          `
          UPDATE active_sessions
          SET pause_started_at = NULL,
              paused_ms = paused_ms + $2
          WHERE user_id = $1;
          `,
          [interaction.user.id, pauseMs]
        );

        await sendTimeLog("resume", `<@${interaction.user.id}>`, "Pause wurde beendet.");
        await updateWeeklyWorktimeMessage();

        return interaction.reply({ content: "▶️ Pause beendet. Deine Arbeitszeit läuft wieder weiter.", ephemeral: true });
      }

      if (interaction.customId.startsWith("confirm_active_")) {
        const userId = interaction.customId.replace("confirm_active_", "");

        if (interaction.user.id !== userId) {
          return interaction.reply({ content: "❌ Diese Aktivitätsprüfung ist nicht für dich.", ephemeral: true });
        }

        const res = await query(`SELECT * FROM active_sessions WHERE user_id = $1`, [userId]);
        const session = res.rows[0];

        if (!session) return interaction.reply({ content: "❌ Du bist nicht mehr eingestempelt.", ephemeral: true });

        await deleteReminderMessage(session);

        await query(
          `
          UPDATE active_sessions
          SET reminder_message_id = NULL,
              reminder_sent_at = NULL,
              reminder_deadline_at = NULL
          WHERE user_id = $1;
          `,
          [userId]
        );

        return interaction.reply({ content: "✅ Bestätigt. Du bleibst eingestempelt.", ephemeral: true });
      }

      if (interaction.customId.startsWith("correct_time_")) {
        const parts = interaction.customId.split("_");
        const sessionId = parts[2];
        const userId = parts[3];

        if (interaction.user.id !== userId && !canManagePersonal(interaction.member)) {
          return interaction.reply({ content: "❌ Du darfst diese Zeit nicht korrigieren.", ephemeral: true });
        }

        const modal = new ModalBuilder().setCustomId(`correct_time_modal_${sessionId}_${userId}`).setTitle("Arbeitszeit korrigieren");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("corrected_time")
              .setLabel("Tatsächliche Arbeitszeit")
              .setPlaceholder("z. B. 1:30 oder 90")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }

      if (interaction.customId === "open_registration_modal") {
        const modal = new ModalBuilder().setCustomId("registration_modal").setTitle("Registrierung");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("registration_firstname")
              .setLabel("Vorname")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("registration_lastname")
              .setLabel("Nachname")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
        return interaction.showModal(modal);
      }

      // MITARBEITER PANEL BUTTONS
      if (interaction.customId === "open_absence_modal") {
        const modal = new ModalBuilder().setCustomId("absence_modal").setTitle("Abmeldung erstellen");
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("absence_from").setLabel("Von").setPlaceholder("TT.MM.JJJJ").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("absence_to").setLabel("Bis").setPlaceholder("TT.MM.JJJJ").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("absence_reason").setLabel("Grund").setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
        return interaction.showModal(modal);
      }

      if (interaction.customId === "open_request_menu") {
        const modal = new ModalBuilder().setCustomId("food_modal").setTitle("Essensstand/Event Anfrage");
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("food_name").setLabel("Essensstand/Event").setPlaceholder("z. B. Essensstand").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("food_location").setLabel("Ort").setPlaceholder("z. B. Sandy Shores PLZ 3008").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("food_time").setLabel("Uhrzeit").setPlaceholder("z. B. 18:00 - 21:00 Uhr").setStyle(TextInputStyle.Short).setRequired(true))
        );
        return interaction.showModal(modal);
      }

      if (interaction.customId === "open_shopping_modal") {
        const modal = new ModalBuilder().setCustomId("shopping_modal").setTitle("Einkauf eintragen");
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("shopping_items").setLabel("Was muss gekauft werden?").setStyle(TextInputStyle.Paragraph).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("shopping_amount").setLabel("Menge").setStyle(TextInputStyle.Short).setRequired(true))
        );
        return interaction.showModal(modal);
      }

      if (interaction.customId === "open_application_modal") {
        const modal = new ModalBuilder().setCustomId("application_modal").setTitle("IC-Bewerbung einreichen");
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("app_name").setLabel("IC Name").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("app_age").setLabel("Alter").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("app_experience").setLabel("Erfahrung").setStyle(TextInputStyle.Paragraph).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("app_reason").setLabel("Warum möchtest du zu uns?").setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
        return interaction.showModal(modal);
      }

      if (interaction.customId === "open_ban_modal") {
        const modal = new ModalBuilder().setCustomId("ban_modal").setTitle("Hausverbot eintragen");
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ban_name").setLabel("Name").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ban_reason").setLabel("Grund").setStyle(TextInputStyle.Paragraph).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ban_duration").setLabel("Dauer").setPlaceholder("z. B. 7 Tage / dauerhaft").setStyle(TextInputStyle.Short).setRequired(true))
        );
        return interaction.showModal(modal);
      }

      // STATUS BUTTONS
      if (interaction.customId === "stock_checked") {
        if (!hasManagerRole(interaction.member)) {
          return interaction.reply({ content: "❌ Nur Manager können die Lagerprüfung bestätigen.", ephemeral: true });
        }

        await logStockCheck(interaction.message.id, interaction.user.id, "checked");

        const oldEmbed = interaction.message.embeds[0];
        const embed = EmbedBuilder.from(oldEmbed)
          .setColor(0x2ecc71)
          .setDescription(
            "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
              `✅ **Lager wurde geprüft.**\n\n` +
              `Bestätigt von: <@${interaction.user.id}>\n` +
              `Zeitpunkt: <t:${Math.floor(Date.now() / 1000)}:f>\n` +
              "━━━━━━━━━━━━━━━━━━━━━━━━"
          );

        await interaction.message.edit({ embeds: [embed], components: [] });
        return interaction.reply({ content: "✅ Lagerprüfung wurde gespeichert. Danke für die Rückmeldung.", ephemeral: true });
      }

      if (interaction.customId === "stock_shopping_needed") {
        if (!hasManagerRole(interaction.member)) {
          return interaction.reply({ content: "❌ Nur Manager können das bestätigen.", ephemeral: true });
        }

        const modal = new ModalBuilder()
          .setCustomId(`stock_shopping_modal_${interaction.message.id}`)
          .setTitle("Einkauf nötig");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("stock_note")
              .setLabel("Was muss gekauft werden?")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }

      if (interaction.customId === "stock_problem") {
        if (!hasManagerRole(interaction.member)) {
          return interaction.reply({ content: "❌ Nur Manager können ein Lagerproblem melden.", ephemeral: true });
        }

        const modal = new ModalBuilder()
          .setCustomId(`stock_problem_modal_${interaction.message.id}`)
          .setTitle("Lagerproblem melden");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("stock_problem_note")
              .setLabel("Was ist das Problem?")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }

      if (interaction.customId === "stand_close") {
        if (!canCreatePanels(interaction.member)) {
          return interaction.reply({ content: "❌ Du darfst diesen Stand nicht schließen.", ephemeral: true });
        }

        const closed = await closeActiveStandByMessage(interaction.message.id, interaction.user.id);
        if (!closed) {
          return interaction.reply({ content: "❌ Dieser Stand ist nicht mehr aktiv oder wurde nicht gefunden.", ephemeral: true });
        }

        return interaction.reply({ content: "✅ Der Stand wurde erfolgreich geschlossen und das Dashboard wurde aktualisiert.", ephemeral: true });
      }

      if (interaction.customId === "absence_approve" || interaction.customId === "absence_deny") {
        if (!canReviewAbsence(interaction.member)) {
          return interaction.reply({ content: "❌ Du darfst Abmeldungen nicht bearbeiten.", ephemeral: true });
        }

        const approved = interaction.customId === "absence_approve";
        const oldEmbed = interaction.message.embeds[0];
        const status = approved
          ? `✅ Genehmigt von <@${interaction.user.id}>`
          : `❌ Abgelehnt von <@${interaction.user.id}>`;

        const fields = replaceStatusField(oldEmbed, status);
        const embed = EmbedBuilder.from(oldEmbed)
          .setColor(approved ? 0x2ecc71 : 0xe74c3c)
          .setFields(fields)
          .setFooter({ text: `Caffee Container • Abmeldung • Bearbeitet von ${interaction.user.tag}` });

        await interaction.message.edit({ embeds: [embed], components: [] });
        return interaction.reply({ content: `✅ Abmeldung wurde auf **${approved ? "Genehmigt" : "Abgelehnt"}** gesetzt.`, ephemeral: true });
      }

      if (interaction.customId === "shopping_done" || interaction.customId === "shopping_open") {
        if (!canCreatePanels(interaction.member)) return interaction.reply({ content: "❌ Du darfst das nicht.", ephemeral: true });
        const status = interaction.customId === "shopping_done" ? "✅ Erledigt" : "🕒 Offen";
        const oldEmbed = interaction.message.embeds[0];
        const embed = EmbedBuilder.from(oldEmbed).setFields(replaceStatusField(oldEmbed, status));
        await interaction.message.edit({ embeds: [embed], components: [shoppingButtons()] });
        return interaction.reply({ content: `✅ Status geändert: ${status}`, ephemeral: true });
      }

      if (interaction.customId === "application_accept" || interaction.customId === "application_deny") {
        if (!canCreatePanels(interaction.member)) return interaction.reply({ content: "❌ Du darfst das nicht.", ephemeral: true });
        const status = interaction.customId === "application_accept" ? `✅ Angenommen von <@${interaction.user.id}>` : `❌ Abgelehnt von <@${interaction.user.id}>`;
        const oldEmbed = interaction.message.embeds[0];
        const embed = EmbedBuilder.from(oldEmbed).setFields(replaceStatusField(oldEmbed, status));
        await interaction.message.edit({ embeds: [embed], components: [] });
        return interaction.reply({ content: `✅ Bewerbung wurde auf **${status}** gesetzt.`, ephemeral: true });
      }

      if (interaction.customId === "ban_active" || interaction.customId === "ban_expired") {
        if (!canCreatePanels(interaction.member)) return interaction.reply({ content: "❌ Du darfst das nicht.", ephemeral: true });
        const status = interaction.customId === "ban_active" ? "🚫 Aktiv" : "✅ Abgelaufen";
        const oldEmbed = interaction.message.embeds[0];
        const embed = EmbedBuilder.from(oldEmbed).setFields(replaceStatusField(oldEmbed, status));
        await interaction.message.edit({ embeds: [embed], components: [houseBanButtons()] });
        return interaction.reply({ content: `✅ Hausverbot Status geändert: ${status}`, ephemeral: true });
      }

      if (interaction.customId.startsWith("food_approve_") || interaction.customId.startsWith("food_deny_")) {
        if (!canCreatePanels(interaction.member)) return interaction.reply({ content: "❌ Du darfst das nicht.", ephemeral: true });

        const approved = interaction.customId.startsWith("food_approve_");
        const oldEmbed = interaction.message.embeds[0];
        const status = approved ? `✅ Bestätigt von <@${interaction.user.id}>` : `❌ Abgelehnt von <@${interaction.user.id}>`;
        const fields = replaceStatusField(oldEmbed, status);
        fields[fields.findIndex((f) => f.name === "Letzte Änderung")].value = `<t:${Math.floor(Date.now() / 1000)}:R>`;
        const embed = EmbedBuilder.from(oldEmbed).setColor(approved ? 0x2ecc71 : 0xe74c3c).setFields(fields);
        await interaction.message.edit({ embeds: [embed], components: [] });

        if (approved) {
          const standName = getField(oldEmbed, "Essensstand");
          const standLocation = getField(oldEmbed, "Ort");
          const standTime = getField(oldEmbed, "Uhrzeit");
          const creatorField = getField(oldEmbed, "Erstellt von");
          const creatorId = creatorField.replace(/\D/g, "") || interaction.user.id;

          await sendActiveStandMessage({
            requestMessageId: interaction.message.id,
            creatorId,
            name: standName,
            location: standLocation,
            time: standTime,
          }).catch((err) => console.error("❌ Aktiver Stand konnte nicht erstellt werden:", err));
        }

        return interaction.reply({ content: approved ? "✅ Anfrage bestätigt und als aktiver Stand eingetragen." : "❌ Anfrage abgelehnt.", ephemeral: true });
      }

      if (interaction.customId.startsWith("food_time_")) {
        if (!canCreatePanels(interaction.member)) return interaction.reply({ content: "❌ Du darfst das nicht.", ephemeral: true });
        const modal = new ModalBuilder().setCustomId(`food_time_modal_${interaction.message.id}`).setTitle("Uhrzeit ändern");
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("new_food_time").setLabel("Neue Uhrzeit").setStyle(TextInputStyle.Short).setRequired(true))
        );
        return interaction.showModal(modal);
      }
    }

    // =====================
    // MODALS
    // =====================
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("time_manage_modal_")) {
        if (!canManagePersonal(interaction.member)) {
          return interaction.reply({ content: "❌ Du darfst die Zeitverwaltung nicht nutzen.", ephemeral: true });
        }

        const action = interaction.customId.replace("time_manage_modal_", "");
        const draft = timeManagementDrafts.get(interaction.user.id);

        if (!draft?.targetUserId) {
          return interaction.reply({ content: "❌ Kein Mitarbeiter ausgewählt. Bitte starte die Zeitverwaltung neu.", ephemeral: true });
        }

        const rawTime = interaction.fields.getTextInputValue("time_amount");
        const note = interaction.fields.getTextInputValue("time_note") || null;
        const minutes = parseCorrectionTime(rawTime);

        if (minutes === null) {
          return interaction.reply({ content: "❌ Ungültiges Format. Nutze z. B. `1:30` oder `90`.", ephemeral: true });
        }

        const result = await applyManualTimeChange({
          targetUserId: draft.targetUserId,
          issuerId: interaction.user.id,
          action,
          minutes,
          note,
        });

        timeManagementDrafts.delete(interaction.user.id);

        const embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("✅ ・ZEIT ERFOLGREICH AKTUALISIERT")
          .setDescription(
            "━━━━━━━━━━━━━━━━━━━━━━━━\\n" +
              `👤 **Mitarbeiter**\\n└ <@${draft.targetUserId}>\\n\\n` +
              `🛠️ **Aktion**\\n└ ${timeActionLabel(action)}\\n\\n` +
              `🕒 **Zeit**\\n└ ${formatShortMinutes(minutes)}\\n\\n` +
              `📈 **Weekly-Zeit**\\n└ ${formatShortMinutes(result.oldWeekly)} → **${formatShortMinutes(result.newWeekly)}**\\n\\n` +
              `💎 **Gesamtzeit**\\n└ ${formatShortMinutes(result.oldTotal)} → **${formatShortMinutes(result.newTotal)}**\\n` +
              "━━━━━━━━━━━━━━━━━━━━━━━━"
          )
          .setFooter({ text: "Caffee Container • Zeitverwaltung" })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // MANAGEMENT MODALS
      if (interaction.customId === "mgmt_warning_modal") {
        const draft = managementDrafts.get(draftKey(interaction.user.id, "warning"));
        if (!draft?.targetUserId || !draft?.warningRoleId) return interaction.reply({ content: "❌ Entwurf nicht gefunden. Bitte neu starten.", ephemeral: true });

        const reason = interaction.fields.getTextInputValue("warning_reason");
        await sendWarning(draft.targetUserId, draft.warningRoleId, reason, interaction.user.id);
        managementDrafts.delete(draftKey(interaction.user.id, "warning"));
        return interaction.reply({ content: "✅ Verwarnung wurde gesendet.", ephemeral: true });
      }

      if (interaction.customId === "mgmt_termination_modal") {
        const draft = managementDrafts.get(draftKey(interaction.user.id, "termination"));
        if (!draft?.targetUserId) return interaction.reply({ content: "❌ Entwurf nicht gefunden. Bitte neu starten.", ephemeral: true });

        const note = interaction.fields.getTextInputValue("termination_note");
        await sendTermination(draft.targetUserId, note, interaction.user.id);
        managementDrafts.delete(draftKey(interaction.user.id, "termination"));
        return interaction.reply({ content: "✅ Kündigung wurde gesendet.", ephemeral: true });
      }

      if (interaction.customId === "mgmt_training_modal") {
        const draft = managementDrafts.get(draftKey(interaction.user.id, "training"));
        if (!draft?.targetUserId || !draft?.instructorId) return interaction.reply({ content: "❌ Entwurf nicht gefunden. Bitte neu starten.", ephemeral: true });

        const date = interaction.fields.getTextInputValue("training_date");
        await sendTraining(draft.targetUserId, draft.instructorId, date, interaction.user.id);
        managementDrafts.delete(draftKey(interaction.user.id, "training"));
        return interaction.reply({ content: "✅ Einweisung wurde dokumentiert.", ephemeral: true });
      }

      // CORRECTION MODAL
      if (interaction.customId.startsWith("correct_time_modal_")) {
        const parts = interaction.customId.split("_");
        const sessionId = parts[3];
        const userId = parts[4];
        const raw = interaction.fields.getTextInputValue("corrected_time");
        const correctedMinutes = parseCorrectionTime(raw);

        if (correctedMinutes === null) {
          return interaction.reply({ content: "❌ Ungültiges Format. Nutze z. B. `1:30` oder `90`.", ephemeral: true });
        }

        const old = await query(`SELECT minutes FROM work_sessions WHERE id = $1 AND user_id = $2`, [sessionId, userId]);
        if (!old.rows[0]) return interaction.reply({ content: "❌ Sitzung nicht gefunden.", ephemeral: true });

        const oldMinutes = old.rows[0].minutes;
        const diff = correctedMinutes - oldMinutes;

        await query(`UPDATE work_sessions SET minutes = $1, corrected = TRUE WHERE id = $2 AND user_id = $3`, [correctedMinutes, sessionId, userId]);
        await query(
          `UPDATE employees SET total_minutes = total_minutes + $2, weekly_minutes = weekly_minutes + $2 WHERE user_id = $1`,
          [userId, diff]
        );

        await updateTotalWorktimeMessage();
        await updateWeeklyWorktimeMessage();

        return interaction.reply({ content: `✅ Zeit korrigiert auf **${formatShortMinutes(correctedMinutes)}**.`, ephemeral: true });
      }

      if (interaction.customId === "registration_modal") {
        // Registrierung: Nickname setzen, Rollen vergeben und Zeitliste aktualisieren
        const firstName = formatName(interaction.fields.getTextInputValue("registration_firstname"));
        const lastName = formatName(interaction.fields.getTextInputValue("registration_lastname"));
        const fullName = `${firstName} ${lastName}`;

        let nicknameText = "";
        let roleText = "";

        try {
          await interaction.member.setNickname(fullName, "Registrierung über Bot");
          nicknameText = `✅ Nickname wurde auf **${fullName}** gesetzt.`;
        } catch (err) {
          console.error("❌ Nickname konnte nicht geändert werden:", err);
          nicknameText = "⚠️ Nickname konnte nicht geändert werden. Bitte Rollen-Hierarchie prüfen.";
        }

        const roleResult = await safeAddRoles(interaction.member, REGISTRATION_ROLE_IDS);

        if (roleResult.failed.length > 0) {
          roleText =
            `
⚠️ Folgende Rollen konnten nicht vergeben werden: ` +
            roleResult.failed.map((id) => `<@&${id}>`).join(" + ");
        } else {
          roleText = "\n✅ Alle Registrierungsrollen wurden vergeben.";
        }

        await ensureEmployee(interaction.user.id);
        await query(`UPDATE employees SET left_server = FALSE WHERE user_id = $1`, [interaction.user.id]);
        await updateTotalWorktimeMessage();
        await updateWeeklyWorktimeMessage();

        return interaction.reply({
          content: `✅ Registrierung abgeschlossen.
${nicknameText}${roleText}`,
          ephemeral: true,
        });
      }

      // MITARBEITER MODALS
      if (interaction.customId === "absence_modal") {
        const name = getDisplayNameFromInteraction(interaction);
        const fromRaw = interaction.fields.getTextInputValue("absence_from");
        const toRaw = interaction.fields.getTextInputValue("absence_to");
        const reason = interaction.fields.getTextInputValue("absence_reason");

        const from = parseGermanDate(fromRaw);
        const to = parseGermanDate(toRaw);
        const today = getBerlinDateOnly();

        if (!from || !to) {
          return interaction.reply({ content: "❌ Bitte gib echte gültige Daten im Format TT.MM.JJJJ ein.", ephemeral: true });
        }

        if (from < today || to < today) {
          return interaction.reply({ content: "❌ Vergangene Tage können nicht mehr für Abmeldungen genutzt werden.", ephemeral: true });
        }

        if (from > to) {
          return interaction.reply({ content: "❌ Das Bis-Datum darf nicht vor dem Von-Datum liegen.", ephemeral: true });
        }

        await query(
          `INSERT INTO absences (user_id, name, date_from, date_to, reason) VALUES ($1, $2, $3, $4, $5)`,
          [interaction.user.id, name, from, to, reason]
        );

        const channel = await client.channels.fetch(ABSENCE_CHANNEL_ID);
        const fromDisplay = formatDateForDisplay(from);
        const toDisplay = formatDateForDisplay(to);

        const embed = new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle("📋 • ABMELDUNG")
          .setDescription(
            "━━━━━━━━━━━━━━━━━━━━━━\n" +
              `**${name}** hat eine Abmeldung eingereicht.\n` +
              "━━━━━━━━━━━━━━━━━━━━━━"
          )
          .addFields(
            { name: "👤 Name", value: name, inline: true },
            { name: "📅 Zeitraum", value: `**Von:** ${fromDisplay}\n**Bis:** ${toDisplay}`, inline: true },
            { name: "📝 Grund", value: reason },
            { name: "📨 Eingereicht von", value: `<@${interaction.user.id}>` },
            { name: "📌 Status", value: "⏳ Wartet auf Bearbeitung" }
          )
          .setFooter({ text: "Caffee Container • Abmeldung" })
          .setTimestamp();

        await channel.send({ embeds: [embed], components: [absenceReviewButtons()] });
        return interaction.reply({ content: "✅ Abmeldung wurde eingetragen.", ephemeral: true });
      }

      if (interaction.customId === "food_modal") {
        const name = interaction.fields.getTextInputValue("food_name");
        const location = interaction.fields.getTextInputValue("food_location");
        const time = interaction.fields.getTextInputValue("food_time");
        const requestId = `#${Date.now().toString().slice(-5)}`;

        const channel = await client.channels.fetch(REQUEST_CHANNEL_ID);
        const embed = buildFoodEmbed({ name, location, time, requestId, creatorId: interaction.user.id });
        await channel.send({ content: `<@&${MANAGER_ROLE_ID}>`, embeds: [embed], components: [foodButtons(interaction.user.id)] });
        return interaction.reply({ content: "✅ Essensstand/Event-Anfrage wurde gesendet.", ephemeral: true });
      }

      if (interaction.customId.startsWith("food_time_modal_")) {
        const messageId = interaction.customId.replace("food_time_modal_", "");
        const newTime = interaction.fields.getTextInputValue("new_food_time");
        const oldEmbed = interaction.message?.embeds?.[0];

        if (!oldEmbed) return interaction.reply({ content: "❌ Nachricht konnte nicht bearbeitet werden.", ephemeral: true });

        const fields = oldEmbed.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline }));
        const timeIndex = fields.findIndex((f) => f.name === "Uhrzeit");
        const changeIndex = fields.findIndex((f) => f.name === "Letzte Änderung");

        if (timeIndex >= 0) fields[timeIndex].value = newTime;
        if (changeIndex >= 0) fields[changeIndex].value = `<@${interaction.user.id}> • <t:${Math.floor(Date.now() / 1000)}:R>`;

        const embed = EmbedBuilder.from(oldEmbed).setFields(fields);
        await interaction.message.edit({ embeds: [embed], components: interaction.message.components });
        return interaction.reply({ content: "✅ Uhrzeit wurde geändert.", ephemeral: true });
      }

      if (interaction.customId.startsWith("stock_shopping_modal_")) {
        const messageId = interaction.customId.replace("stock_shopping_modal_", "");
        const note = interaction.fields.getTextInputValue("stock_note");

        await logStockCheck(messageId, interaction.user.id, "shopping_needed", note);

        const shoppingChannel = await client.channels.fetch(SHOPPING_CHANNEL_ID).catch(() => null);
        if (shoppingChannel) {
          const embed = new EmbedBuilder()
            .setColor(0x5dade2)
            .setTitle("🛒 ・EINKAUF NACH LAGERPRÜFUNG")
            .setDescription(
              "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
                `${note}\n\n` +
                `Gemeldet von: <@${interaction.user.id}>\n` +
                "━━━━━━━━━━━━━━━━━━━━━━━━"
            )
            .setTimestamp();

          await shoppingChannel.send({ embeds: [embed], components: [shoppingButtons()] });
        }

        const managerMsg = await interaction.channel.messages.fetch(messageId).catch(() => null);
        if (managerMsg) {
          const oldEmbed = managerMsg.embeds[0];
          const embed = EmbedBuilder.from(oldEmbed)
            .setColor(0x3498db)
            .setDescription(
              "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
                `🛒 **Lager wurde geprüft – Einkauf nötig.**\n\n` +
                `Gemeldet von: <@${interaction.user.id}>\n` +
                `Notiz: ${note}\n` +
                `Zeitpunkt: <t:${Math.floor(Date.now() / 1000)}:f>\n` +
                "━━━━━━━━━━━━━━━━━━━━━━━━"
            );
          await managerMsg.edit({ embeds: [embed], components: [] }).catch(() => null);
        }

        return interaction.reply({ content: "✅ Einkauf wurde automatisch in die Einkaufsliste eingetragen.", ephemeral: true });
      }

      if (interaction.customId.startsWith("stock_problem_modal_")) {
        const messageId = interaction.customId.replace("stock_problem_modal_", "");
        const note = interaction.fields.getTextInputValue("stock_problem_note");

        await logStockCheck(messageId, interaction.user.id, "problem", note);

        const managerMsg = await interaction.channel.messages.fetch(messageId).catch(() => null);
        if (managerMsg) {
          const oldEmbed = managerMsg.embeds[0];
          const embed = EmbedBuilder.from(oldEmbed)
            .setColor(0xe74c3c)
            .setDescription(
              "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
                `⚠️ **Lagerproblem gemeldet.**\n\n` +
                `Gemeldet von: <@${interaction.user.id}>\n` +
                `Problem: ${note}\n` +
                `Zeitpunkt: <t:${Math.floor(Date.now() / 1000)}:f>\n` +
                "━━━━━━━━━━━━━━━━━━━━━━━━"
            );
          await managerMsg.edit({ embeds: [embed], components: [] }).catch(() => null);
        }

        return interaction.reply({ content: "✅ Lagerproblem wurde gespeichert.", ephemeral: true });
      }

      if (interaction.customId === "shopping_modal") {
        const items = interaction.fields.getTextInputValue("shopping_items");
        const amount = interaction.fields.getTextInputValue("shopping_amount");
        const channel = await client.channels.fetch(SHOPPING_CHANNEL_ID);

        const embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("🛒 Neuer Einkauf")
          .addFields(
            { name: "Artikel", value: items },
            { name: "Menge", value: amount },
            { name: "Status", value: "🕒 Offen" },
            { name: "Erstellt von", value: `<@${interaction.user.id}>` }
          )
          .setTimestamp();

        await channel.send({ embeds: [embed], components: [shoppingButtons()] });
        return interaction.reply({ content: "✅ Einkauf wurde eingetragen.", ephemeral: true });
      }

      if (interaction.customId === "application_modal") {
        const name = interaction.fields.getTextInputValue("app_name");
        const age = interaction.fields.getTextInputValue("app_age");
        const experience = interaction.fields.getTextInputValue("app_experience");
        const reason = interaction.fields.getTextInputValue("app_reason");
        const channel = await client.channels.fetch(APPLICATION_CHANNEL_ID);

        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("📋 Neue IC-Bewerbung")
          .addFields(
            { name: "Name", value: name },
            { name: "Alter", value: age },
            { name: "Erfahrung", value: experience },
            { name: "Warum?", value: reason },
            { name: "Status", value: "🕒 Offen" },
            { name: "Eingereicht von", value: `<@${interaction.user.id}>` }
          )
          .setTimestamp();

        const applicationMessage = await channel.send({ content: `<@&${MANAGER_ROLE_ID}>`, embeds: [embed], components: [applicationButtons()] });

        await applicationMessage.startThread({
          name: `Bewerbung - ${name}`.slice(0, 95),
          autoArchiveDuration: 10080,
          reason: "Automatischer Bewerbungs-Thread über Mitarbeiterpanel",
        }).catch((err) => console.error("❌ Bewerbungs-Thread konnte nicht erstellt werden:", err));

        return interaction.reply({ content: "✅ Bewerbung wurde eingereicht und ein Thread wurde erstellt.", ephemeral: true });
      }

      if (interaction.customId === "ban_modal") {
        const name = interaction.fields.getTextInputValue("ban_name");
        const reason = interaction.fields.getTextInputValue("ban_reason");
        const duration = interaction.fields.getTextInputValue("ban_duration");
        const channel = await client.channels.fetch(HOUSE_BAN_CHANNEL_ID);

        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("🚫 Neues Hausverbot")
          .addFields(
            { name: "Name", value: name },
            { name: "Grund", value: reason },
            { name: "Dauer", value: duration },
            { name: "Status", value: "🚫 Aktiv" },
            { name: "Eingetragen von", value: `<@${interaction.user.id}>` }
          )
          .setTimestamp();

        await channel.send({ embeds: [embed], components: [houseBanButtons()] });
        return interaction.reply({ content: "✅ Hausverbot wurde eingetragen.", ephemeral: true });
      }
    }
  } catch (err) {
    console.error("❌ Fehler bei Interaction:", err);

    const payload = {
      content:
        "❌ **Es ist ein Fehler aufgetreten.**\n" +
        "Bitte versuche es kurz erneut. Falls es nochmal passiert, schick einen Screenshot und ggf. die Railway-Logs weiter.",
      ephemeral: true,
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

client.login(TOKEN);
