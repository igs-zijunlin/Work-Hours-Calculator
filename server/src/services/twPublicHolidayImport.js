const Holidays = require("date-holidays");
const { addHoliday } = require("../repositories/holidayRepo");
const { rebuildWorkDaysForMonth } = require("./workdayService");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function entryToLocalDateString(entry) {
  const d = new Date(entry.date);
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

/** 匯入台灣 public 國定假日至「指定專案」，並重建該年 12 個月工作天 */
function importTwPublicHolidaysForYear(db, projectId, year) {
  if (!Number.isInteger(year) || year < 1990 || year > 2100) {
    throw new Error("year 需為 1990–2100 的整數");
  }

  const hd = new Holidays("TW");
  const list = hd.getHolidays(year).filter((h) => h.type === "public");

  const items = [];
  for (const h of list) {
    const dateStr = entryToLocalDateString(h);
    const label = h.name ? String(h.name) : "台灣國定假日";
    addHoliday(db, projectId, dateStr, label);
    items.push({ date: dateStr, label });
  }

  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${pad2(m)}`;
    rebuildWorkDaysForMonth(db, projectId, ym);
  }

  return { count: items.length, items };
}

module.exports = { importTwPublicHolidaysForYear };
