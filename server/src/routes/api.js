const express = require("express");

const { getMonth, upsertMonthTotal, ensureMonth } = require("../repositories/monthRepo");
const { listHolidaysForMonth, addHoliday, removeHoliday } = require("../repositories/holidayRepo");
const { getWorkDays, upsertWorkDayPercent, clearPercentsForMonth } = require("../repositories/workDayRepo");
const {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} = require("../repositories/projectRepo");
const { rebuildWorkDaysForMonth, buildMonthCalendarRows } = require("../services/workdayService");
const { importTwPublicHolidaysForYear } = require("../services/twPublicHolidayImport");

function isValidYm(ym) {
  return /^\d{4}-\d{2}$/.test(ym);
}

function isValidISODate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/** 從 query 或 body 讀取專案 id；無效則回傳 null */
function parseProjectId(req) {
  const raw = req.query.projectId ?? req.body?.projectId;
  if (raw === undefined || raw === null || raw === "") return 1;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) return null;
  return id;
}

function apiRouter(db) {
  const router = express.Router();

  router.get("/health", (req, res) => {
    res.json({ ok: true });
  });

  router.get("/projects", (req, res) => {
    try {
      const rows = listProjects(db);
      res.json({ projects: rows.map((p) => ({ id: p.id, name: p.name, updatedAt: p.updated_at })) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/projects", (req, res) => {
    try {
      const name = (req.body && req.body.name) || "新專案";
      const id = createProject(db, name);
      res.json({ ok: true, id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put("/projects/:id", (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid id" });
      if (!getProject(db, id)) return res.status(404).json({ error: "Not found" });
      const name = req.body && req.body.name;
      if (name == null || String(name).trim() === "") return res.status(400).json({ error: "Invalid name" });
      updateProject(db, id, String(name).trim());
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete("/projects/:id", (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid id" });
      deleteProject(db, id);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get("/month", async (req, res) => {
    try {
      const projectId = parseProjectId(req);
      if (projectId == null) return res.status(400).json({ error: "Invalid projectId" });
      if (!getProject(db, projectId)) return res.status(404).json({ error: "Project not found" });

      const ym = req.query.ym;
      if (!ym || !isValidYm(ym)) return res.status(400).json({ error: "Invalid ym" });

      ensureMonth(db, projectId, ym);

      const workDays = getWorkDays(db, projectId, ym);
      const rebuilt = workDays.length === 0;
      if (rebuilt) {
        rebuildWorkDaysForMonth(db, projectId, ym);
      }

      const monthRow = getMonth(db, projectId, ym);
      const totalPercent = monthRow ? monthRow.total_percent : 0;

      const workDaysAfter = rebuilt ? getWorkDays(db, projectId, ym) : workDays;
      const holidays = listHolidaysForMonth(db, projectId, ym);

      const workDaysCount = workDaysAfter.length;
      const monthlyPoolTotal = totalPercent * workDaysCount;

      let filledDaysCount = 0;
      let usedSumFilledOnly = 0;
      let usedTotalPercentSum = 0;

      for (const wd of workDaysAfter) {
        const p = wd.percent != null && wd.percent !== "" ? Number(wd.percent) : null;
        if (p != null && !Number.isNaN(p)) {
          filledDaysCount += 1;
          usedSumFilledOnly += p;
          usedTotalPercentSum += p;
        }
      }

      const usedAveragePercent =
        filledDaysCount > 0 ? usedSumFilledOnly / filledDaysCount : null;
      const usedBudgetPercent =
        monthlyPoolTotal > 0 ? (usedTotalPercentSum / monthlyPoolTotal) * 100 : null;

      const calendarRows = buildMonthCalendarRows(ym, holidays, workDaysAfter);

      res.json({
        projectId,
        ym,
        totalPercent,
        holidays: holidays.map((h) => ({ date: h.date, label: h.label ?? null })),
        workDays: workDaysAfter.map((wd) => ({ work_date: wd.work_date, percent: wd.percent })),
        calendarRows,
        weekdayRows: calendarRows,
        workDaysCount,
        monthlyPoolTotal,
        filledDaysCount,
        usedTotalPercent: usedTotalPercentSum,
        usedAveragePercent,
        usedBudgetPercent,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put("/month/total", async (req, res) => {
    try {
      const projectId = parseProjectId(req);
      if (projectId == null) return res.status(400).json({ error: "Invalid projectId" });
      if (!getProject(db, projectId)) return res.status(404).json({ error: "Project not found" });

      const { ym, totalPercent } = req.body ?? {};
      if (!ym || !isValidYm(ym)) return res.status(400).json({ error: "Invalid ym" });
      const tp = Number(totalPercent);
      if (Number.isNaN(tp)) return res.status(400).json({ error: "Invalid totalPercent" });

      upsertMonthTotal(db, projectId, ym, tp);

      const workDays = getWorkDays(db, projectId, ym);
      if (workDays.length === 0) {
        rebuildWorkDaysForMonth(db, projectId, ym);
      }

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/month/:ym/clear", async (req, res) => {
    try {
      const projectId = parseProjectId(req);
      if (projectId == null) return res.status(400).json({ error: "Invalid projectId" });
      if (!getProject(db, projectId)) return res.status(404).json({ error: "Project not found" });

      const ym = req.params.ym;
      if (!isValidYm(ym)) return res.status(400).json({ error: "Invalid ym" });

      ensureMonth(db, projectId, ym);
      clearPercentsForMonth(db, projectId, ym);
      upsertMonthTotal(db, projectId, ym, 0);

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/work-days/:ym/rebuild", async (req, res) => {
    try {
      const projectId = parseProjectId(req);
      if (projectId == null) return res.status(400).json({ error: "Invalid projectId" });
      if (!getProject(db, projectId)) return res.status(404).json({ error: "Project not found" });

      const ym = req.params.ym;
      if (!isValidYm(ym)) return res.status(400).json({ error: "Invalid ym" });
      rebuildWorkDaysForMonth(db, projectId, ym);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put("/work-days/:ym/:date", async (req, res) => {
    try {
      const projectId = parseProjectId(req);
      if (projectId == null) return res.status(400).json({ error: "Invalid projectId" });
      if (!getProject(db, projectId)) return res.status(404).json({ error: "Project not found" });

      const { ym, date } = req.params;
      if (!isValidYm(ym)) return res.status(400).json({ error: "Invalid ym" });
      if (!isValidISODate(date)) return res.status(400).json({ error: "Invalid date" });
      if (!date.startsWith(`${ym}-`)) return res.status(400).json({ error: "date not in ym" });

      const { percent } = req.body ?? {};
      let value = null;
      if (percent != null && percent !== "") {
        const n = Number(percent);
        if (Number.isNaN(n)) return res.status(400).json({ error: "Invalid percent" });
        value = n;
      }

      upsertWorkDayPercent(db, projectId, ym, date, value);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/holidays", async (req, res) => {
    try {
      const projectId = parseProjectId(req);
      if (projectId == null) return res.status(400).json({ error: "Invalid projectId" });
      if (!getProject(db, projectId)) return res.status(404).json({ error: "Project not found" });

      const { date, label } = req.body ?? {};
      if (!isValidISODate(date)) return res.status(400).json({ error: "Invalid date" });

      const ym = date.slice(0, 7);
      addHoliday(db, projectId, date, label ?? null);
      rebuildWorkDaysForMonth(db, projectId, ym);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/holidays/import/tw-public", async (req, res) => {
    try {
      const projectId = parseProjectId(req);
      if (projectId == null) return res.status(400).json({ error: "Invalid projectId" });
      if (!getProject(db, projectId)) return res.status(404).json({ error: "Project not found" });

      const yearRaw = (req.body && req.body.year) ?? req.query?.year;
      const year = Number(yearRaw);
      if (!Number.isInteger(year)) {
        return res.status(400).json({ error: "Invalid year" });
      }
      const result = importTwPublicHolidaysForYear(db, projectId, year);
      res.json({ ok: true, year, importedCount: result.count, items: result.items });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete("/holidays/:date", async (req, res) => {
    try {
      const projectId = parseProjectId(req);
      if (projectId == null) return res.status(400).json({ error: "Invalid projectId" });
      if (!getProject(db, projectId)) return res.status(404).json({ error: "Project not found" });

      const date = req.params.date;
      if (!isValidISODate(date)) return res.status(400).json({ error: "Invalid date" });

      const ym = date.slice(0, 7);
      removeHoliday(db, projectId, date);
      rebuildWorkDaysForMonth(db, projectId, ym);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = apiRouter;
