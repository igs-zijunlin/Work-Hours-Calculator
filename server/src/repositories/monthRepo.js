function ensureMonth(db, projectId, ym) {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO months (project_id, ym, total_percent, updated_at)
     VALUES (?, ?, 0, datetime('now'))`
  );
  stmt.run(projectId, ym);
}

function getMonth(db, projectId, ym) {
  const row = db
    .prepare(
      `SELECT project_id, ym, total_percent, updated_at FROM months WHERE project_id = ? AND ym = ?`
    )
    .get(projectId, ym);
  return row ?? null;
}

function upsertMonthTotal(db, projectId, ym, totalPercent) {
  ensureMonth(db, projectId, ym);
  db.prepare(
    `UPDATE months
     SET total_percent = ?, updated_at = datetime('now')
     WHERE project_id = ? AND ym = ?`
  ).run(totalPercent, projectId, ym);
}

module.exports = { ensureMonth, getMonth, upsertMonthTotal };
