function getWorkDays(db, projectId, ym) {
  return db
    .prepare(
      `SELECT work_date, percent
       FROM work_days
       WHERE project_id = ? AND ym = ?
       ORDER BY work_date ASC`
    )
    .all(projectId, ym);
}

function upsertWorkDayPercent(db, projectId, ym, workDate, percent) {
  db.prepare(
    `INSERT INTO work_days (project_id, ym, work_date, percent)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(project_id, ym, work_date) DO UPDATE SET percent = excluded.percent`
  ).run(projectId, ym, workDate, percent);
}

/** 清空該月所有工作天的 %（列保留，僅 percent 改為 NULL） */
function clearPercentsForMonth(db, projectId, ym) {
  db.prepare(`UPDATE work_days SET percent = NULL WHERE project_id = ? AND ym = ?`).run(projectId, ym);
}

function deleteWorkDaysNotInSet(db, projectId, ym, workDatesSet) {
  const desired = Array.from(workDatesSet);
  if (desired.length === 0) {
    db.prepare(`DELETE FROM work_days WHERE project_id = ? AND ym = ?`).run(projectId, ym);
    return;
  }
  const placeholders = desired.map(() => "?").join(",");
  const sql = `DELETE FROM work_days
               WHERE project_id = ? AND ym = ?
                 AND work_date NOT IN (${placeholders})`;
  db.prepare(sql).run(projectId, ym, ...desired);
}

module.exports = { getWorkDays, upsertWorkDayPercent, clearPercentsForMonth, deleteWorkDaysNotInSet };
