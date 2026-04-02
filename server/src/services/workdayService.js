const { listHolidaysForMonth } = require("../repositories/holidayRepo");
const { ensureMonth } = require("../repositories/monthRepo");
const { getWorkDays, upsertWorkDayPercent, deleteWorkDaysNotInSet } = require("../repositories/workDayRepo");

function ymToYearMonth(ym) {
  const [yStr, mStr] = ym.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  if (!year || !month || month < 1 || month > 12) {
    throw new Error(`Invalid ym: ${ym}`);
  }
  return { year, month };
}

function dateToISO(dateObj) {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function computeWorkDatesForMonth(ym, holidaySet) {
  const { year, month } = ymToYearMonth(ym);

  const first = new Date(year, month - 1, 1);
  const nextMonth = new Date(year, month, 1);
  const daysInMonth = Math.round((nextMonth - first) / (24 * 60 * 60 * 1000));

  const results = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    const weekday = d.getDay();
    const isWeekday = weekday >= 1 && weekday <= 5;
    if (!isWeekday) continue;

    const iso = dateToISO(d);
    if (holidaySet.has(iso)) continue;
    results.push(iso);
  }
  return results;
}

function rebuildWorkDaysForMonth(db, projectId, ym) {
  ensureMonth(db, projectId, ym);

  const holidays = listHolidaysForMonth(db, projectId, ym);
  const holidaySet = new Set(holidays.map((h) => h.date));

  const desiredWorkDates = computeWorkDatesForMonth(ym, holidaySet);
  const desiredSet = new Set(desiredWorkDates);

  const existingRows = getWorkDays(db, projectId, ym);
  const existingMap = new Map(existingRows.map((r) => [r.work_date, r.percent]));

  deleteWorkDaysNotInSet(db, projectId, ym, desiredSet);

  const stmt = db.prepare(
    `INSERT INTO work_days (project_id, ym, work_date, percent)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(project_id, ym, work_date) DO UPDATE SET
       percent = CASE
         WHEN excluded.percent IS NOT NULL THEN excluded.percent
         ELSE work_days.percent
       END`
  );

  const transaction = db.transaction(() => {
    for (const workDate of desiredWorkDates) {
      const existingPercent = existingMap.get(workDate);
      const percentToWrite = existingMap.has(workDate) ? existingPercent : null;
      stmt.run(projectId, ym, workDate, percentToWrite);
    }
  });

  transaction();

  return desiredWorkDates.map((d) => ({
    work_date: d,
    percent: existingMap.get(d) ?? null,
  }));
}

function buildMonthCalendarRows(ym, holidays, workDays) {
  const { year, month } = ymToYearMonth(ym);
  const holidayMap = new Map(holidays.map((h) => [h.date, h.label ?? null]));
  const percentMap = new Map(workDays.map((w) => [w.work_date, w.percent]));

  const first = new Date(year, month - 1, 1);
  const nextMonth = new Date(year, month, 1);
  const daysInMonth = Math.round((nextMonth - first) / (24 * 60 * 60 * 1000));

  const wkNames = ["日", "一", "二", "三", "四", "五", "六"];
  const rows = [];
  let workDayIndex = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    const weekday = d.getDay();
    const iso = dateToISO(d);
    const weekLabel = `週${wkNames[weekday]}`;

    if (holidayMap.has(iso)) {
      rows.push({
        kind: "holiday",
        date: iso,
        weekLabel,
        label: holidayMap.get(iso),
        workDayIndex: null,
      });
    } else if (weekday === 0 || weekday === 6) {
      rows.push({
        kind: "weekend",
        date: iso,
        weekLabel,
        label: null,
        workDayIndex: null,
      });
    } else {
      workDayIndex += 1;
      rows.push({
        kind: "work",
        date: iso,
        weekLabel,
        workDayIndex,
        percent: percentMap.has(iso) ? percentMap.get(iso) : null,
      });
    }
  }
  return rows;
}

module.exports = { rebuildWorkDaysForMonth, computeWorkDatesForMonth, buildMonthCalendarRows };
