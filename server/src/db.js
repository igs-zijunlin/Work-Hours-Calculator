const Database = require("better-sqlite3");

function createDb(dbFilePath) {
  const db = new Database(dbFilePath);
  db.pragma("foreign_keys = ON");
  return db;
}

function tableExists(db, name) {
  const r = db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name);
  return !!r;
}

function columnExists(db, table, col) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => r.name === col);
}

/** 舊版（無 project_id）升級為多專案隔離 */
function migrateV1ToV2(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  if (db.prepare(`SELECT COUNT(*) AS c FROM projects`).get().c === 0) {
    db.prepare(`INSERT INTO projects (name) VALUES (?)`).run("預設專案");
  }

  db.exec(`
    CREATE TABLE months_new (
      project_id INTEGER NOT NULL REFERENCES projects(id),
      ym TEXT NOT NULL,
      total_percent REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, ym)
    );
    INSERT INTO months_new (project_id, ym, total_percent, updated_at)
    SELECT 1, ym, total_percent, updated_at FROM months;
    DROP TABLE months;
    ALTER TABLE months_new RENAME TO months;
  `);

  db.exec(`
    CREATE TABLE holidays_new (
      project_id INTEGER NOT NULL REFERENCES projects(id),
      date TEXT NOT NULL,
      label TEXT,
      PRIMARY KEY (project_id, date)
    );
    INSERT INTO holidays_new (project_id, date, label)
    SELECT 1, date, label FROM holidays;
    DROP TABLE holidays;
    ALTER TABLE holidays_new RENAME TO holidays;
  `);

  db.exec(`
    CREATE TABLE work_days_new (
      project_id INTEGER NOT NULL REFERENCES projects(id),
      ym TEXT NOT NULL,
      work_date TEXT NOT NULL,
      percent REAL,
      PRIMARY KEY (project_id, ym, work_date)
    );
    INSERT INTO work_days_new (project_id, ym, work_date, percent)
    SELECT 1, ym, work_date, percent FROM work_days;
    DROP TABLE work_days;
    ALTER TABLE work_days_new RENAME TO work_days;
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_work_days_project_ym ON work_days (project_id, ym);
    CREATE INDEX IF NOT EXISTS idx_work_days_work_date ON work_days (work_date);
  `);
}

function createFreshV2Schema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS months (
      project_id INTEGER NOT NULL REFERENCES projects(id),
      ym TEXT NOT NULL,
      total_percent REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, ym)
    );
    CREATE TABLE IF NOT EXISTS holidays (
      project_id INTEGER NOT NULL REFERENCES projects(id),
      date TEXT NOT NULL,
      label TEXT,
      PRIMARY KEY (project_id, date)
    );
    CREATE TABLE IF NOT EXISTS work_days (
      project_id INTEGER NOT NULL REFERENCES projects(id),
      ym TEXT NOT NULL,
      work_date TEXT NOT NULL,
      percent REAL,
      PRIMARY KEY (project_id, ym, work_date)
    );
    CREATE INDEX IF NOT EXISTS idx_work_days_project_ym ON work_days (project_id, ym);
    CREATE INDEX IF NOT EXISTS idx_work_days_work_date ON work_days (work_date);
  `);
  if (db.prepare(`SELECT COUNT(*) AS c FROM projects`).get().c === 0) {
    db.prepare(`INSERT INTO projects (name) VALUES (?)`).run("專案 1");
  }
}

function initSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS meta (
      schema_version INTEGER NOT NULL
    );
    INSERT INTO meta(schema_version)
    SELECT 1
    WHERE NOT EXISTS (SELECT 1 FROM meta);
  `);

  const monthsExists = tableExists(db, "months");

  if (monthsExists && !columnExists(db, "months", "project_id")) {
    migrateV1ToV2(db);
  } else if (!monthsExists) {
    createFreshV2Schema(db);
  } else {
    if (!tableExists(db, "projects")) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    }
    if (db.prepare(`SELECT COUNT(*) AS c FROM projects`).get().c === 0) {
      db.prepare(`INSERT INTO projects (name) VALUES (?)`).run("專案 1");
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_work_days_project_ym ON work_days (project_id, ym);
      CREATE INDEX IF NOT EXISTS idx_work_days_work_date ON work_days (work_date);
    `);
  }
}

module.exports = { createDb, initSchema };
