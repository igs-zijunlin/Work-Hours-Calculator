function addHoliday(db, projectId, date, label) {
  db.prepare(
    `INSERT INTO holidays (project_id, date, label)
     VALUES (?, ?, ?)
     ON CONFLICT(project_id, date) DO UPDATE SET label = excluded.label`
  ).run(projectId, date, label ?? null);
}

function removeHoliday(db, projectId, date) {
  db.prepare(`DELETE FROM holidays WHERE project_id = ? AND date = ?`).run(projectId, date);
}

function listHolidaysForMonth(db, projectId, ym) {
  const [y, m] = ym.split("-");
  const prefix = `${y}-${m}`;
  return db
    .prepare(
      `SELECT date, label FROM holidays
       WHERE project_id = ? AND date LIKE ? || '-%'
       ORDER BY date ASC`
    )
    .all(projectId, prefix);
}

function listAllHolidays(db, projectId) {
  return db
    .prepare(
      `SELECT date, label FROM holidays WHERE project_id = ? ORDER BY date ASC`
    )
    .all(projectId);
}

module.exports = { addHoliday, removeHoliday, listHolidaysForMonth, listAllHolidays };
