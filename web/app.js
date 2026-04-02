async function apiGet(path) {
  const res = await fetch(path, { method: "GET" });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function apiPut(path, body) {
  const res = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(path, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
  // 後端回傳 {ok:true} 或其它 JSON
  return res.json().catch(() => ({}));
}

const LS_PROJECT_ID = "worktime.activeProjectId";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function todayISO() {
  const d = new Date();
  // 以本機時區輸出 YYYY-MM-DD，避免 UTC/本機差異造成日期偏移
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

function ymFromToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function ymToDateRange(ym) {
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const first = new Date(y, m - 1, 1);
  // JS 的 month+1 可直接跨月
  const next = new Date(y, m, 1);
  const lastDay = Math.round((next - first) / (24 * 60 * 60 * 1000));
  return { year: y, month: m, firstDay, daysInMonth: lastDay };
}

function renderMessage(el, text) {
  el.textContent = text ?? "";
  el.className = "msg";
}

/** 與後端一致：空白 = 未填（null） */
function normalizeInputPercent(raw) {
  const t = String(raw ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  if (Number.isNaN(n)) return undefined;
  return n;
}

/** 從上次載入的資料讀取該日已存 %，供比對是否需 PUT */
function percentFromServerForDate(date) {
  const row = state.monthData?.workDays?.find((w) => w.work_date === date);
  if (row == null || row.percent == null || row.percent === "") return null;
  const n = Number(row.percent);
  return Number.isNaN(n) ? null : n;
}

function percentsEqual(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 1e-9;
}

const ymInput = document.getElementById("ymInput");
const totalPercentInput = document.getElementById("totalPercentInput");
const saveTotalBtn = document.getElementById("saveTotalBtn");
const rebuildBtn = document.getElementById("rebuildBtn");
const clearMonthBtn = document.getElementById("clearMonthBtn");

const workDaysCountEl = document.getElementById("workDaysCount");
const monthlyPoolTotalEl = document.getElementById("monthlyPoolTotal");
const filledDaysCountEl = document.getElementById("filledDaysCount");
const usedTotalPercentEl = document.getElementById("usedTotalPercent");
const usedBudgetPercentEl = document.getElementById("usedBudgetPercent");
const usedAveragePercentEl = document.getElementById("usedAveragePercent");

const tableWrap = document.getElementById("tableWrap");
const holidaysWrap = document.getElementById("holidaysWrap");
const msgEl = document.getElementById("msg");

let state = {
  projectId: 1,
  projects: [],
  ym: ymFromToday(),
  monthData: null,
};

function projectQs() {
  return `projectId=${encodeURIComponent(state.projectId)}`;
}

function setDefaultMonthUI() {
  ymInput.value = state.ym;
}

function makeWeekdayTable(rows, today) {
  const body = (rows || [])
    .map((r) => {
      const isToday = r.date === today;
      const wk = r.weekLabel
        ? ` <span class="muted">（${r.weekLabel}）</span>`
        : "";
      if (r.kind === "holiday") {
        const cls = isToday ? "row-holiday today" : "row-holiday";
        const labelPart = r.label
          ? ` <span class="muted">（${r.label}）</span>`
          : "";
        return `
        <tr class="${cls}">
          <td class="muted" style="width: 72px; text-align: center">—</td>
          <td>${r.date}${wk}${labelPart}</td>
          <td class="muted">（特殊假日，無需填寫）</td>
        </tr>`;
      }
      if (r.kind === "weekend") {
        const cls = isToday ? "row-weekend today" : "row-weekend";
        return `
        <tr class="${cls}">
          <td class="muted" style="width: 72px; text-align: center">—</td>
          <td>${r.date}${wk}</td>
          <td class="muted">（例假日週六日，無需填寫）</td>
        </tr>`;
      }
      const cls = isToday ? "today" : "";
      const value = r.percent == null ? "" : String(r.percent);
      return `
        <tr class="${cls}">
          <td style="width: 72px; text-align: center"><b>${r.workDayIndex}</b></td>
          <td style="width: 28%">${r.date}${wk}</td>
          <td>
            <input type="number" step="0.1" min="0" class="percent-input-cell" data-date="${r.date}" value="${value}" title="離開此欄位後自動儲存" />
          </td>
        </tr>`;
    })
    .join("");

  return `
    <table class="calendar-table">
      <thead>
        <tr>
          <th style="width: 72px">序號</th>
          <th style="width: 28%">日期</th>
          <th>%（可編輯，離開欄位自動儲存）</th>
        </tr>
      </thead>
      <tbody>
        ${body}
      </tbody>
    </table>
  `;
}

function renderHolidays(holidays) {
  if (!holidays || holidays.length === 0) {
    holidaysWrap.textContent = "（尚未載入）";
    return;
  }

  const rows = holidays
    .map((h) => {
      const label = h.label ? `（${h.label}）` : "";
      return `
        <tr>
          <td>${h.date}</td>
          <td class="muted">${label}</td>
          <td style="width: 120px">
            <button data-remove-holiday="${h.date}">移除</button>
          </td>
        </tr>
      `;
    })
    .join("");

  holidaysWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>日期</th>
          <th>標籤</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function applyMonthSummary(data) {
  const wdCount =
    data.workDaysCount != null ? data.workDaysCount : data.workDays.length;
  workDaysCountEl.textContent = String(wdCount);
  if (monthlyPoolTotalEl) {
    monthlyPoolTotalEl.textContent =
      data.monthlyPoolTotal != null ? String(data.monthlyPoolTotal) : "-";
  }
  filledDaysCountEl.textContent = String(data.filledDaysCount);
  usedTotalPercentEl.textContent = String(data.usedTotalPercent ?? 0);
  if (usedBudgetPercentEl) {
    usedBudgetPercentEl.textContent =
      data.usedBudgetPercent != null
        ? `${Number(data.usedBudgetPercent).toFixed(2)}%`
        : "-";
  }
  usedAveragePercentEl.textContent =
    data.filledDaysCount > 0
      ? `${Number(data.usedAveragePercent).toFixed(2)}%`
      : "-";
}

function renderMonthCalendar(data) {
  const today = todayISO();
  const rows =
    (data.calendarRows && data.calendarRows.length > 0
      ? data.calendarRows
      : null) ||
    (data.weekdayRows && data.weekdayRows.length > 0 ? data.weekdayRows : null);
  tableWrap.innerHTML = rows
    ? makeWeekdayTable(rows, today)
    : makeWeekdayTable(
        (data.workDays || []).map((d, i) => ({
          kind: "work",
          date: d.work_date,
          workDayIndex: i + 1,
          percent: d.percent,
        })),
        today
      );
}

async function loadProjects() {
  const res = await apiGet("/api/projects");
  state.projects = res.projects || [];
  if (state.projects.length === 0) {
    state.projectId = 1;
    return;
  }
  const saved = Number(localStorage.getItem(LS_PROJECT_ID));
  const valid =
    Number.isInteger(saved) && state.projects.some((p) => p.id === saved);
  if (valid) {
    state.projectId = saved;
  } else {
    state.projectId = state.projects[0].id;
  }
  localStorage.setItem(LS_PROJECT_ID, String(state.projectId));
}

function renderProjectTabs() {
  const el = document.getElementById("projectTabs");
  if (!el) return;
  const tabs = state.projects
    .map((p) => {
      const active = p.id === state.projectId ? " active" : "";
      return `<button type="button" class="project-tab${active}" data-project-id="${p.id}">${escapeHtml(p.name)}</button>`;
    })
    .join("");
  el.innerHTML =
    tabs +
    `<button type="button" class="project-tab project-tab-add" id="addProjectBtn">＋ 新增專案</button>` +
    `<button type="button" class="project-tab tab-action" id="renameProjectBtn">重新命名</button>` +
    `<button type="button" class="project-tab tab-action btn-danger" id="deleteProjectBtn">刪除此專案</button>`;
}

async function switchProject(id) {
  state.projectId = id;
  localStorage.setItem(LS_PROJECT_ID, String(id));
  renderProjectTabs();
  renderMessage(msgEl, "");
  await loadMonth(state.ym);
}

async function loadMonth(ym) {
  state.ym = ym;
  const data = await apiGet(
    `/api/month?ym=${encodeURIComponent(ym)}&${projectQs()}`
  );
  state.monthData = data;

  applyMonthSummary(data);
  renderMonthCalendar(data);
  renderHolidays(data.holidays ?? []);

  // 讓 UI 顯示本月總%
  if (data.totalPercent != null) totalPercentInput.value = data.totalPercent;
}

saveTotalBtn.addEventListener("click", async () => {
  const ym = ymInput.value;
  const total = totalPercentInput.value.trim();
  if (!ym) return;
  const totalPercent = total === "" ? 0 : Number(total);
  try {
    renderMessage(msgEl, "");
    await apiPut("/api/month/total", {
      ym,
      totalPercent,
      projectId: state.projectId,
    });
    await loadMonth(ym);
  } catch (err) {
    renderMessage(msgEl, err.message);
  }
});

rebuildBtn.addEventListener("click", async () => {
  const ym = ymInput.value;
  if (!ym) return;
  try {
    renderMessage(msgEl, "");
    await apiPost(
      `/api/work-days/${encodeURIComponent(ym)}/rebuild?${projectQs()}`,
      {}
    );
    await loadMonth(ym);
  } catch (err) {
    renderMessage(msgEl, err.message);
  }
});

if (clearMonthBtn) {
  clearMonthBtn.addEventListener("click", async () => {
    const ym = ymInput.value;
    if (!ym) return;
    const pname =
      state.projects.find((p) => p.id === state.projectId)?.name || "此專案";
    const ok = window.confirm(
      `確定清除「${pname}」在「${ym}」的工時與本月總%？\n（休假日不刪；僅影響目前專案）`
    );
    if (!ok) return;
    try {
      renderMessage(msgEl, "");
      await apiPost(`/api/month/${encodeURIComponent(ym)}/clear?${projectQs()}`, {});
      await loadMonth(ym);
      totalPercentInput.value = 0;
      msgEl.className = "msg success";
      msgEl.textContent = `已清除 ${ym} 的工時填寫與本月總%數。`;
    } catch (err) {
      renderMessage(msgEl, err.message);
    }
  });
}

ymInput.addEventListener("change", async () => {
  if (!ymInput.value) return;
  try {
    renderMessage(msgEl, "");
    const twY = document.getElementById("twHolidayYearInput");
    if (twY) {
      const y = Number(ymInput.value.slice(0, 4));
      if (!Number.isNaN(y)) twY.value = String(y);
    }
    await loadMonth(ymInput.value);
  } catch (err) {
    renderMessage(msgEl, err.message);
  }
});

async function init() {
  setDefaultMonthUI();
  totalPercentInput.value = 0;
  ymInput.value = state.ym;

  await loadProjects();
  renderProjectTabs();

  const projectTabsEl = document.getElementById("projectTabs");
  if (projectTabsEl) {
    projectTabsEl.addEventListener("click", async (e) => {
      const tab = e.target.closest("[data-project-id]");
      if (tab) {
        const id = Number(tab.getAttribute("data-project-id"));
        if (!Number.isInteger(id) || id < 1) return;
        await switchProject(id);
        return;
      }
      if (e.target.closest("#addProjectBtn")) {
        const name =
          window.prompt("新專案名稱（可日後再「重新命名」）", "") || "新專案";
        try {
          renderMessage(msgEl, "");
          const res = await apiPost("/api/projects", { name: name.trim() });
          await loadProjects();
          if (res && res.id) await switchProject(res.id);
          else {
            renderProjectTabs();
            await loadMonth(state.ym);
          }
        } catch (err) {
          renderMessage(msgEl, err.message);
        }
        return;
      }
      if (e.target.closest("#renameProjectBtn")) {
        const cur = state.projects.find((p) => p.id === state.projectId);
        const name = window.prompt(
          "專案名稱",
          cur ? cur.name : ""
        );
        if (name == null) return;
        const t = String(name).trim();
        if (!t) return;
        try {
          renderMessage(msgEl, "");
          await apiPut(`/api/projects/${state.projectId}`, { name: t });
          await loadProjects();
          renderProjectTabs();
        } catch (err) {
          renderMessage(msgEl, err.message);
        }
        return;
      }
      if (e.target.closest("#deleteProjectBtn")) {
        const cur = state.projects.find((p) => p.id === state.projectId);
        if (
          !window.confirm(
            `確定刪除專案「${cur ? cur.name : ""}」？\n該專案下所有月份、假日、工時資料將一併刪除，無法復原。`
          )
        )
          return;
        try {
          renderMessage(msgEl, "");
          await apiDelete(`/api/projects/${state.projectId}`);
          await loadProjects();
          renderProjectTabs();
          await loadMonth(state.ym);
          msgEl.className = "msg success";
          msgEl.textContent = "已刪除專案。";
        } catch (err) {
          renderMessage(msgEl, err.message);
        }
      }
    });
  }

  const twHolidayYearInput = document.getElementById("twHolidayYearInput");
  const importTwPublicBtn = document.getElementById("importTwPublicBtn");
  if (twHolidayYearInput) {
    const y = Number(state.ym.slice(0, 4));
    if (!Number.isNaN(y)) twHolidayYearInput.value = String(y);
  }

  // blur 不會 bubbling，改用 focusout：離開輸入框即儲存（與伺服器值相同則略過）
  tableWrap.addEventListener("focusout", async (e) => {
    const input = e.target;
    if (!input.matches || !input.matches("input.percent-input-cell[data-date]")) return;
    const date = input.dataset.date;
    if (!date || !state.ym) return;

    const parsed = normalizeInputPercent(input.value);
    if (parsed === undefined) {
      renderMessage(msgEl, "請輸入有效的 % 數值");
      try {
        await loadMonth(state.ym);
      } catch (err) {
        renderMessage(msgEl, err.message);
      }
      return;
    }

    const saved = percentFromServerForDate(date);
    if (percentsEqual(saved, parsed)) return;

    try {
      renderMessage(msgEl, "");
      await apiPut(
        `/api/work-days/${state.ym}/${date}?${projectQs()}`,
        { percent: parsed }
      );
      // 只更新摘要，不重繪日曆，避免用 Tab 換欄時焦點被 innerHTML 清掉
      const data = await apiGet(
        `/api/month?ym=${encodeURIComponent(state.ym)}&${projectQs()}`
      );
      state.monthData = data;
      applyMonthSummary(data);
    } catch (err) {
      renderMessage(msgEl, err.message);
    }
  });

  await loadMonth(state.ym);

  // 先顯示休假日管理表單事件（後續 TODO：完整實作）
  const holidayDateInput = document.getElementById("holidayDateInput");
  const holidayLabelInput = document.getElementById("holidayLabelInput");
  const addHolidayBtn = document.getElementById("addHolidayBtn");

  addHolidayBtn.addEventListener("click", async () => {
    const date = holidayDateInput.value;
    const label = holidayLabelInput.value.trim();
    if (!date) return;
    try {
      renderMessage(msgEl, "");
      await apiPost(`/api/holidays?${projectQs()}`, {
        date,
        label: label || null,
      });
      const ym = date.slice(0, 7);
      await loadMonth(ym);
      holidayLabelInput.value = "";
    } catch (err) {
      renderMessage(msgEl, err.message);
    }
  });

  holidaysWrap.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-remove-holiday]");
    if (!btn) return;
    const date = btn.getAttribute("data-remove-holiday");
    if (!date) return;

    try {
      renderMessage(msgEl, "");
      await apiDelete(`/api/holidays/${encodeURIComponent(date)}?${projectQs()}`);
      const ym = date.slice(0, 7);
      await loadMonth(ym);
    } catch (err) {
      renderMessage(msgEl, err.message);
    }
  });

  if (importTwPublicBtn && twHolidayYearInput) {
    importTwPublicBtn.addEventListener("click", async () => {
      let year = Number(twHolidayYearInput.value);
      if (!Number.isInteger(year) && ymInput.value) {
        year = Number(ymInput.value.slice(0, 4));
      }
      if (!Number.isInteger(year)) return;
      try {
        renderMessage(msgEl, "");
        const res = await apiPost(`/api/holidays/import/tw-public?${projectQs()}`, {
          year,
        });
        await loadMonth(state.ym);
        msgEl.className = "msg success";
        msgEl.textContent = `已匯入台灣 public 國定假日 ${res.importedCount ?? 0} 天（${year} 年），並已重建該年度各月工作天。`;
      } catch (err) {
        renderMessage(msgEl, err.message);
      }
    });
  }
}

init().catch((e) => renderMessage(msgEl, e.message));

