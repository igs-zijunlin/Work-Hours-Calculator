function listProjects(db) {
  return db.prepare(`SELECT id, name, updated_at FROM projects ORDER BY id ASC`).all();
}

function getProject(db, id) {
  return db.prepare(`SELECT id, name, updated_at FROM projects WHERE id = ?`).get(id) ?? null;
}

function createProject(db, name) {
  const n = String(name || "").trim() || "新專案";
  const r = db.prepare(`INSERT INTO projects (name, updated_at) VALUES (?, datetime('now'))`).run(n);
  return Number(r.lastInsertRowid);
}

function updateProject(db, id, name) {
  const n = String(name || "").trim();
  if (!n) throw new Error("專案名稱不可為空");
  db.prepare(
    `UPDATE projects SET name = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(n, id);
}

function countProjects(db) {
  return db.prepare(`SELECT COUNT(*) AS c FROM projects`).get().c;
}

/** 刪除專案及其月份、假日、工作天（至少保留一個專案） */
function deleteProject(db, id) {
  if (countProjects(db) <= 1) {
    throw new Error("至少需要保留一個專案");
  }
  const t = db.transaction(() => {
    db.prepare(`DELETE FROM work_days WHERE project_id = ?`).run(id);
    db.prepare(`DELETE FROM holidays WHERE project_id = ?`).run(id);
    db.prepare(`DELETE FROM months WHERE project_id = ?`).run(id);
    db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  });
  t();
}

module.exports = { listProjects, getProject, createProject, updateProject, deleteProject, countProjects };
