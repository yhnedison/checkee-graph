(() => {
  const ROOT_ID = "checkee-analytics-root";
  const STORAGE_KEY_PREFIX = "checkeeAnalyticsLastPull";
  const START_DATE = new Date(Date.UTC(2008, 11, 1));
  const COLORS = [
    "#2563eb",
    "#dc2626",
    "#16a34a",
    "#9333ea",
    "#ea580c",
    "#0891b2",
    "#be123c",
    "#4f46e5",
    "#65a30d",
    "#a16207",
    "#0f766e",
    "#7c3aed"
  ];

  const state = {
    expanded: true,
    loading: false,
    rawRecords: [],
    records: [],
    weeks: weeksBetween(START_DATE, new Date()),
    visaTypes: [],
    selectedVisaType: null,
    timeRange: "1y",
    pullComplete: false,
    source: "Not loaded",
    lastError: "",
    loadingMessage: ""
  };

  const fieldGroups = {
    visaType: [
      "visaType",
      "visa_type",
      "visa",
      "type",
      "category",
      "签证类型",
      "visa_category"
    ],
    created: [
      "createdAt",
      "created_at",
      "createDate",
      "createdDate",
      "date",
      "submitDate",
      "submittedAt",
      "checkDate",
      "startDate",
      "applicationDate",
      "newDate",
      "caseDate",
      "提交日期",
      "check_date"
    ],
    cleared: [
      "clearedAt",
      "cleared_at",
      "clearDate",
      "clearanceDate",
      "clearance_date",
      "updateDate",
      "updatedAt",
      "completedAt",
      "finishDate",
      "clear_date",
      "通过日期",
      "clearedDate"
    ],
    status: ["status", "state", "caseStatus", "result", "状态"]
  };

  function init() {
    if (document.getElementById(ROOT_ID)) return;
    renderShell();
    attachListeners();
    renderData();
    void loadCachedData();
  }

  function renderShell() {
    const root = document.createElement("div");
    root.id = ROOT_ID;
    document.body.prepend(root);
    root.innerHTML = `
      <section class="ca-shell" aria-label="Checkee Graph overlay">
        <div class="ca-bar">
          <div class="ca-title">
            <strong>Checkee Graph</strong>
            <span data-ca-status>Click Refresh to load Checkee data for the selected time range.</span>
          </div>
          <div class="ca-actions">
            <label class="ca-control-label">
              <span>Time range</span>
              <select class="ca-select" data-ca-time-range aria-label="Time range">
                <option value="6m">Last 6 months</option>
                <option value="1y" selected>Last 1 year</option>
                <option value="2y">Last 2 years</option>
                <option value="5y">Last 5 years</option>
                <option value="max">Max</option>
              </select>
            </label>
            <label class="ca-file-label" title="Import exported Checkee JSON or CSV">
              Import
              <input class="ca-file-input" data-ca-import type="file" accept=".json,.csv,.txt,application/json,text/csv" />
            </label>
            <button class="ca-button" data-ca-refresh type="button">Refresh</button>
            <button class="ca-button" data-ca-toggle type="button">Expand</button>
          </div>
        </div>
        <div class="ca-panel">
          <div class="ca-grid">
            <aside class="ca-sidebar">
              <h3>Summary</h3>
              <div class="ca-stat-list" data-ca-stats></div>
              <h3>Visa Types</h3>
              <div class="ca-visa-list" data-ca-visas></div>
            </aside>
            <main class="ca-main">
              <div class="ca-chart-stack" data-ca-charts></div>
              <div data-ca-message></div>
            </main>
          </div>
        </div>
      </section>
    `;
    syncExpanded();
  }

  function attachListeners() {
    document.querySelector("[data-ca-toggle]").addEventListener("click", () => {
      state.expanded = !state.expanded;
      syncExpanded();
    });
    document.querySelector("[data-ca-refresh]").addEventListener("click", () => loadData());
    document.querySelector("[data-ca-time-range]").addEventListener("change", event => {
      state.timeRange = event.target.value;
      void handleTimeRangeChange();
    });
    document.querySelector("[data-ca-import]").addEventListener("change", event => {
      const file = event.target.files && event.target.files[0];
      if (file) void importFile(file);
      event.target.value = "";
    });
  }

  function syncExpanded() {
    const shell = document.querySelector(".ca-shell");
    const toggle = document.querySelector("[data-ca-toggle]");
    shell.classList.toggle("ca-expanded", state.expanded);
    toggle.textContent = state.expanded ? "Collapse" : "Expand";
  }

  async function handleTimeRangeChange() {
    state.lastError = "";
    if (currentDataCoversTimeRange()) {
      renderData();
      return;
    }
    const loaded = await loadCachedData({ replace: true });
    if (!loaded) {
      state.rawRecords = [];
      state.records = [];
      state.visaTypes = [];
      state.pullComplete = false;
      state.source = `No cached data for ${timeRangeLabel()}`;
      renderData();
    }
  }

  async function loadData() {
    const previousSnapshot = snapshotState();
    state.loading = true;
    state.lastError = "";
    state.loadingMessage = `Starting newest-to-oldest Checkee pull for ${timeRangeLabel()}...`;
    state.rawRecords = [];
    state.records = [];
    state.visaTypes = [];
    state.pullComplete = false;
    state.source = "Loading monthly pages";
    renderData();
    setLoading(true);
    try {
      const data = await discoverRecords();
      if (data.records.length) {
        ingestRecords(data.records, data.source);
        if (!state.records.length) {
          throw new Error(`Monthly pages returned ${data.records.length.toLocaleString()} raw rows, but none could be parsed into valid dated cases.`);
        }
        state.pullComplete = true;
        renderData();
        await saveCachedData(state.rawRecords, data.source);
      }
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
      await restoreAfterFailedRefresh(previousSnapshot);
    } finally {
      state.loading = false;
      state.loadingMessage = "";
      if (state.records.length && !state.pullComplete) state.pullComplete = true;
      if (state.selectedVisaType && !state.visaTypes.includes(state.selectedVisaType)) {
        state.selectedVisaType = null;
      }
      setLoading(false);
      renderData();
    }
  }

  async function discoverRecords() {
    const monthly = await loadMonthlyPages();
    if (monthly.records.length) {
      return monthly;
    }

    const pageRecords = collectPageRecords(document, currentDispMonth());
    if (pageRecords.length) {
      return { records: pageRecords, source: "current page" };
    }

    const monthErrors = monthly.errors.length ? ` Month pages: ${monthly.errors.slice(0, 3).join(" | ")}.` : "";
    throw new Error(`Could not find Checkee records automatically.${monthErrors}`);
  }

  async function loadMonthlyPages() {
    const origin = window.location.origin;
    const pullStart = monthStart(requestedStartDate());
    const months = monthStarts(pullStart, new Date()).reverse();
    const allRecords = [];
    const errors = [];

    for (let index = 0; index < months.length; index += 1) {
      const month = months[index];
      const url = `${origin}/main.php?dispdate=${month}`;
      const requestStartedAt = Date.now();
      state.loadingMessage = `Loading ${month} (${index + 1}/${months.length}) for ${timeRangeLabel()}; ${state.records.length.toLocaleString()} records so far...`;
      updateStatus(state.loadingMessage);
      try {
        const response = await fetch(url, {
          credentials: "include",
          headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }
        });
        if (!response.ok) {
          errors.push(`${month}: HTTP ${response.status}`);
          continue;
        }
        const text = await response.text();
        const records = recordsFromHtml(text, month, url);
        allRecords.push(...records);
        state.loadingMessage = `Loaded ${month} (${index + 1}/${months.length}); ${allRecords.length.toLocaleString()} raw rows so far. Waiting 1 second between months...`;
        ingestRecords(allRecords, `main.php?dispdate=${months[0]}...${month}`);
      } catch (error) {
        errors.push(`${month}: ${error instanceof Error ? error.message : String(error)}`);
        state.loadingMessage = `Skipped ${month} (${index + 1}/${months.length}); waiting 1 second before next month...`;
        renderData();
      }
      if (index < months.length - 1) {
        await delay(Math.max(0, 1000 - (Date.now() - requestStartedAt)));
      }
    }

    return {
      records: allRecords,
      errors,
      source: `main.php?dispdate=${months[0]}...${months[months.length - 1]}`
    };
  }

  function collectPageRecords(doc = document, sourceMonth = "") {
    const scriptRecords = Array.from(doc.scripts)
      .flatMap(script => recordsFromScriptText(script.textContent || ""));
    const tableRecords = recordsFromTables(doc, { sourceMonth, sourceUrl: window.location.href });
    return [...scriptRecords, ...tableRecords];
  }

  function recordsFromHtml(text, sourceMonth, sourceUrl) {
    const doc = new DOMParser().parseFromString(text, "text/html");
    const scriptRecords = Array.from(doc.scripts)
      .flatMap(script => recordsFromScriptText(script.textContent || ""))
      .map(record => ({ ...record, __sourceMonth: sourceMonth, __sourceUrl: sourceUrl }));
    const tableRecords = recordsFromTables(doc, { sourceMonth, sourceUrl });
    return [...scriptRecords, ...tableRecords];
  }

  function recordsFromScriptText(text) {
    if (!text || text.length < 20) return [];
    const records = [];
    const nextData = text.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (nextData) {
      try {
        records.push(...recordsFromUnknown(JSON.parse(nextData[1])));
      } catch (_) {}
    }
    const jsonishMatches = text.match(/\{[\s\S]{40,}\}/g) || [];
    for (const candidate of jsonishMatches.slice(0, 8)) {
      try {
        records.push(...recordsFromUnknown(JSON.parse(candidate)));
      } catch (_) {}
    }
    return records;
  }

  function recordsFromTables(doc = document, context = {}) {
    const records = [];
    doc.querySelectorAll("table").forEach(table => {
      const headers = Array.from(table.querySelectorAll("thead th, tr:first-child th, tr:first-child td"))
        .map(cell => normalizeHeader(cell.textContent));
      if (headers.length < 2) return;
      const rows = Array.from(table.querySelectorAll("tbody tr")).length
        ? Array.from(table.querySelectorAll("tbody tr"))
        : Array.from(table.querySelectorAll("tr")).slice(1);
      rows.forEach(row => {
        const cells = Array.from(row.children).map(cell => (cell.textContent || "").trim());
        if (cells.length < 2) return;
        const record = {};
        cells.forEach((value, index) => {
          record[headers[index] || `column_${index}`] = value;
        });
        record.__sourceMonth = context.sourceMonth || "";
        record.__sourceUrl = context.sourceUrl || "";
        record.__rowText = cells.join(" | ");
        records.push(record);
      });
    });
    return records;
  }

  function recordsFromUnknown(value) {
    const found = [];
    const seen = new Set();
    walk(value);
    return found;

    function walk(node) {
      if (!node || typeof node !== "object") return;
      if (seen.has(node)) return;
      seen.add(node);

      if (Array.isArray(node)) {
        if (node.length && node.every(item => item && typeof item === "object" && !Array.isArray(item))) {
          const plausible = node.filter(isPlausibleRecord);
          if (plausible.length >= Math.max(2, Math.ceil(node.length * 0.35))) {
            found.push(...plausible);
          }
        }
        node.forEach(walk);
        return;
      }

      Object.values(node).forEach(walk);
    }
  }

  function isPlausibleRecord(record) {
    const keys = Object.keys(record).map(key => key.toLowerCase());
    const joined = `${keys.join(" ")} ${Object.values(record).join(" ")}`.toLowerCase();
    const hasDate = Object.values(record).some(value => parseDate(value));
    const hasVisa = fieldGroups.visaType.some(key => keys.includes(key.toLowerCase())) || /\b(f-?1|h-?1b|j-?1|b-?1|b-?2|o-?1|l-?1|f1|h1b|j1)\b/i.test(joined);
    const hasStatus = fieldGroups.status.some(key => keys.includes(key.toLowerCase())) || /clear|check|issued|refused|行政|通过|完成/i.test(joined);
    return hasDate && (hasVisa || hasStatus);
  }

  function ingestRecords(records, source) {
    state.rawRecords = records;
    state.records = dedupeRecords(records
      .map(normalizeRecord)
      .filter(record => record && (record.createdAt || record.clearedAt))
      .filter(record => inRange(record.createdAt) || inRange(record.clearedAt)));

    state.source = source;
    state.weeks = displayWeeks();
    state.visaTypes = [...new Set(state.records.map(record => record.visaType))].sort();
    if (!state.loading && state.selectedVisaType && !state.visaTypes.includes(state.selectedVisaType)) {
      state.selectedVisaType = null;
    }
    renderData();
  }

  function snapshotState() {
    return {
      rawRecords: [...state.rawRecords],
      records: [...state.records],
      weeks: [...state.weeks],
      visaTypes: [...state.visaTypes],
      selectedVisaType: state.selectedVisaType,
      source: state.source,
      pullComplete: state.pullComplete
    };
  }

  async function restoreAfterFailedRefresh(snapshot) {
    if (snapshot.records.length) {
      restoreSnapshot(snapshot);
      return;
    }
    const cached = await readStorage(currentStorageKey());
    if (cached && Array.isArray(cached.records) && cached.records.length) {
      const originalError = state.lastError;
      state.pullComplete = true;
      ingestRecords(cached.records, "cached pull restored after failed refresh");
      state.lastError = originalError;
      return;
    }
    restoreSnapshot(snapshot);
  }

  function restoreSnapshot(snapshot) {
    state.rawRecords = snapshot.rawRecords;
    state.records = snapshot.records;
    state.weeks = snapshot.weeks;
    state.visaTypes = snapshot.visaTypes;
    state.selectedVisaType = snapshot.selectedVisaType;
    state.source = snapshot.source;
    state.pullComplete = snapshot.pullComplete;
  }

  function normalizeRecord(input) {
    const record = flatten(input);
    const sourceMonth = String(record.__sourceMonth || "");
    const visaType = cleanVisaType(pick(record, fieldGroups.visaType)) || inferVisaType(record) || "Unknown";
    const createdAt = parseDate(pick(record, fieldGroups.created), sourceMonth);
    let clearedAt = parseDate(pick(record, fieldGroups.cleared), sourceMonth);
    const status = String(pick(record, fieldGroups.status) || "").toLowerCase();
    if (!clearedAt && /clear|issued|complete|通过|完成/.test(status)) {
      clearedAt = parseDate(pick(record, ["updated", "updated_at", "lastUpdate", "last_updated", "modifiedAt"]), sourceMonth);
    }
    if (!clearedAt) clearedAt = inferDateFromRecord(record, sourceMonth);
    if (!createdAt && !clearedAt) return null;
    const waitDays = createdAt && clearedAt ? Math.max(0, daysBetween(createdAt, clearedAt)) : null;
    return { createdAt, clearedAt, visaType, waitDays, raw: input };
  }

  function dedupeRecords(records) {
    const seen = new Set();
    return records.filter(record => {
      const key = [
        record.visaType,
        record.createdAt ? isoDate(record.createdAt) : "",
        record.clearedAt ? isoDate(record.clearedAt) : "",
        String(record.raw && record.raw.__rowText || "").slice(0, 180)
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function flatten(value, prefix = "", out = {}) {
    if (!value || typeof value !== "object") return out;
    Object.entries(value).forEach(([key, item]) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (item && typeof item === "object" && !Array.isArray(item)) {
        flatten(item, fullKey, out);
      } else {
        out[key] = item;
        out[fullKey] = item;
      }
    });
    return out;
  }

  function pick(record, candidates) {
    const lowerMap = new Map(Object.keys(record).map(key => [key.toLowerCase(), key]));
    for (const candidate of candidates) {
      const exact = lowerMap.get(candidate.toLowerCase());
      if (exact && record[exact] !== "") return record[exact];
    }
    for (const [key, value] of Object.entries(record)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
      if (candidates.some(candidate => normalized.includes(candidate.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "")))) {
        if (value !== "") return value;
      }
    }
    return null;
  }

  function inferVisaType(record) {
    const text = Object.values(record).join(" ");
    const match = text.match(/\b(F-?1|J-?1|H-?1B|B-?1\/?B-?2|B-?1|B-?2|O-?1|L-?1|F2|J2|H4)\b/i);
    return match ? match[1].toUpperCase().replace(/^([A-Z])(\d)/, "$1-$2") : "";
  }

  function cleanVisaType(value) {
    if (value == null) return "";
    return String(value).trim().replace(/\s+/g, " ").toUpperCase();
  }

  function renderData() {
    state.weeks = displayWeeks();
    updateStatus(statusText());
    renderStats();
    renderVisaFilters();
    renderCharts();
    renderMessage();
  }

  function statusText() {
    if (state.loading) return state.loadingMessage || `Pulling Checkee data for ${timeRangeLabel()}...`;
    if (!state.records.length) return `Click Refresh to load Checkee data for ${timeRangeLabel()}.`;
    const filterText = state.selectedVisaType ? `, filtered to ${state.selectedVisaType}` : "";
    const earliest = earliestLoadedDate();
    const earliestText = earliest ? `; earliest loaded ${isoDate(earliest)}` : "";
    return `${state.records.length.toLocaleString()} records loaded from ${state.source}${earliestText}${filterText}`;
  }

  function renderStats() {
    const records = filteredRecords();
    const cleared = records.filter(record => isInDisplayRange(record.clearedAt)).length;
    const longWait = records.filter(record => isInDisplayRange(record.clearedAt) && record.waitDays >= 30).length;
    const newCases = records.filter(record => isInDisplayRange(record.createdAt)).length;
    const netInRange = state.pullComplete ? netChangeTotal() : null;
    document.querySelector("[data-ca-stats]").innerHTML = `
      <div class="ca-stat"><span>New cases</span><strong>${newCases.toLocaleString()}</strong></div>
      <div class="ca-stat"><span>Cleared</span><strong>${cleared.toLocaleString()}</strong></div>
      <div class="ca-stat"><span>Long-wait cleared</span><strong>${longWait.toLocaleString()}</strong></div>
      <div class="ca-stat"><span>Net in range</span><strong>${netInRange == null ? "Pending" : formatSigned(netInRange)}</strong></div>
      <div class="ca-stat"><span>Filter</span><strong>${escapeHtml(state.selectedVisaType || "All")}</strong></div>
    `;
  }

  function renderVisaFilters() {
    const list = document.querySelector("[data-ca-visas]");
    if (!state.visaTypes.length) {
      list.innerHTML = `<span class="ca-message">No visa types detected.</span>`;
      return;
    }
    list.innerHTML = state.visaTypes
      .map((visa, index) => `
        <button class="ca-pill" data-ca-visa="${escapeAttr(visa)}" data-active="${!state.selectedVisaType || state.selectedVisaType === visa}" data-selected="${state.selectedVisaType === visa}" type="button">
          <span class="ca-swatch" style="background:${colorFor(index)}"></span>${escapeHtml(visa)}
        </button>
      `)
      .join("");
    list.querySelectorAll("[data-ca-visa]").forEach(button => {
      button.addEventListener("click", () => {
        const visa = button.dataset.caVisa;
        state.selectedVisaType = state.selectedVisaType === visa ? null : visa;
        renderData();
      });
    });
  }

  function filteredRecords() {
    if (!state.selectedVisaType) return state.records;
    return state.records.filter(record => record.visaType === state.selectedVisaType);
  }

  function renderCharts() {
    const container = document.querySelector("[data-ca-charts]");
    const metrics = ["clearedByVisa", "longWaitByVisa", "newVsCleared", "netChangeSinceBase"];
    container.innerHTML = metrics.map(metric => `
      <section class="ca-chart-card">
        <h3>${escapeHtml(chartTitleForMetric(metric))}</h3>
        <div class="ca-chart-wrap" data-ca-chart="${metric}">
          <div class="ca-tooltip" data-ca-tooltip></div>
        </div>
        <div class="ca-legend" data-ca-legend="${metric}"></div>
      </section>
    `).join("");
    metrics.forEach(metric => renderChart(metric));
  }

  function renderChart(metric) {
    const chart = document.querySelector(`[data-ca-chart="${metric}"]`);
    if (!chart) return;
    const tooltip = chart.querySelector("[data-ca-tooltip]");
    if (metric === "netChangeSinceBase") {
      renderNetChangeChart(chart, tooltip, metric);
      return;
    }
    const series = seriesForMetric(metric);
    const visibleSeries = series.filter(item => item.values.some(value => value !== 0));
    const isStacked = metric !== "newVsCleared";
    const maxValue = isStacked
      ? Math.max(1, ...state.weeks.map((_, weekIndex) => visibleSeries.reduce((total, item) => total + item.values[weekIndex], 0)))
      : Math.max(1, ...visibleSeries.flatMap(item => item.values));
    const width = 1040;
    const height = 360;
    const margin = { top: 14, right: 22, bottom: 46, left: 48 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const weekBand = innerWidth / Math.max(1, state.weeks.length);
    const y = value => margin.top + innerHeight - (value / maxValue) * innerHeight;
    const groupCenter = index => margin.left + index * weekBand + weekBand / 2;
    const yTicks = tickValues(maxValue, 5);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", titleForMetric(metric));
    svg.innerHTML = `
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>
      ${yTicks.map(value => `
        <line x1="${margin.left}" y1="${y(value)}" x2="${width - margin.right}" y2="${y(value)}" stroke="#e2e8f0" />
        <text x="${margin.left - 10}" y="${y(value) + 4}" text-anchor="end" fill="#64748b" font-size="11">${value}</text>
      `).join("")}
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#94a3b8" />
      <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#94a3b8" />
      ${xLabels().map(item => `
        <text x="${groupCenter(item.index)}" y="${height - 22}" text-anchor="middle" fill="#64748b" font-size="11">${item.label}</text>
      `).join("")}
    `;

    if (isStacked) {
      const barWidth = Math.max(3, Math.min(18, weekBand * 0.72));
      state.weeks.forEach((week, weekIndex) => {
        let stackBottom = height - margin.bottom;
        visibleSeries.forEach((item, seriesIndex) => {
          const value = item.values[weekIndex];
          if (!value) return;
          const barHeight = Math.max(1, (value / maxValue) * innerHeight);
          const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          rect.setAttribute("x", String(groupCenter(weekIndex) - barWidth / 2));
          rect.setAttribute("y", String(stackBottom - barHeight));
          rect.setAttribute("width", String(barWidth));
          rect.setAttribute("height", String(barHeight));
          rect.setAttribute("rx", "2");
          rect.setAttribute("fill", item.color || colorFor(seriesIndex));
          rect.setAttribute("tabindex", "0");
          rect.dataset.caBar = "true";
          rect.dataset.tooltip = `${item.name}\n${formatWeek(week)}: ${value.toLocaleString()}`;
          svg.appendChild(rect);
          stackBottom -= barHeight;
        });
      });
    } else {
      const groupWidth = Math.max(4, weekBand * 0.78);
      const barGap = 2;
      const barWidth = Math.max(3, (groupWidth - barGap * Math.max(0, visibleSeries.length - 1)) / Math.max(1, visibleSeries.length));
      state.weeks.forEach((week, weekIndex) => {
        const groupStart = groupCenter(weekIndex) - groupWidth / 2;
        visibleSeries.forEach((item, seriesIndex) => {
          const value = item.values[weekIndex];
          if (!value) return;
          const barHeight = Math.max(1, (value / maxValue) * innerHeight);
          const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          rect.setAttribute("x", String(groupStart + seriesIndex * (barWidth + barGap)));
          rect.setAttribute("y", String(height - margin.bottom - barHeight));
          rect.setAttribute("width", String(barWidth));
          rect.setAttribute("height", String(barHeight));
          rect.setAttribute("rx", "2");
          rect.setAttribute("fill", item.color || colorFor(seriesIndex));
          rect.setAttribute("tabindex", "0");
          rect.dataset.caBar = "true";
          rect.dataset.tooltip = `${item.name}\n${formatWeek(week)}: ${value.toLocaleString()}`;
          svg.appendChild(rect);
        });
      });
    }

    chart.querySelector("svg")?.remove();
    chart.insertBefore(svg, tooltip);

    chart.querySelectorAll("[data-ca-bar]").forEach(bar => {
      bar.addEventListener("mousemove", event => showTooltip(event, bar.dataset.tooltip));
      bar.addEventListener("mouseleave", hideTooltip);
      bar.addEventListener("focus", event => showTooltip(event, bar.dataset.tooltip));
      bar.addEventListener("blur", hideTooltip);
    });

    document.querySelector(`[data-ca-legend="${metric}"]`).innerHTML = visibleSeries
      .map((item, index) => `
        <span class="ca-legend-item">
          <span class="ca-swatch" style="background:${item.color || colorFor(index)}"></span>${escapeHtml(item.name)}
        </span>
      `)
      .join("");

    function xLabels() {
      if (!state.weeks.length) return [];
      const approxCount = 8;
      const step = Math.max(1, Math.ceil(state.weeks.length / approxCount));
      return state.weeks
        .map((week, index) => ({ index, label: formatWeek(week) }))
        .filter((_, index) => index % step === 0);
    }
  }

  function renderNetChangeChart(chart, tooltip, metric) {
    if (!state.pullComplete) {
      chart.innerHTML = `
        <div class="ca-chart-placeholder">
          Waiting for the full monthly pull to finish before calculating net change.
        </div>
        <div class="ca-tooltip" data-ca-tooltip></div>
      `;
      document.querySelector(`[data-ca-legend="${metric}"]`).innerHTML = "";
      return;
    }
    const weeks = netChangeWeeks();
    const values = seriesForMetric(metric)[0].values;
    const total = netChangeTotal();
    const minValue = Math.min(0, ...values);
    const maxValue = Math.max(0, ...values);
    const width = 1040;
    const height = 360;
    const margin = { top: 14, right: 22, bottom: 46, left: 48 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const weekBand = innerWidth / Math.max(1, weeks.length);
    const domainMin = minValue === maxValue ? -1 : minValue;
    const domainMax = minValue === maxValue ? 1 : maxValue;
    const y = value => margin.top + ((domainMax - value) / Math.max(1, domainMax - domainMin)) * innerHeight;
    const zeroY = y(0);
    const groupCenter = index => margin.left + index * weekBand + weekBand / 2;
    const yTicks = tickValuesBetween(domainMin, domainMax, 5);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", chartTitleForMetric(metric));
    svg.innerHTML = `
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>
      ${yTicks.map(value => `
        <line x1="${margin.left}" y1="${y(value)}" x2="${width - margin.right}" y2="${y(value)}" stroke="${value === 0 ? "#64748b" : "#e2e8f0"}" stroke-width="${value === 0 ? "1.4" : "1"}" />
        <text x="${margin.left - 10}" y="${y(value) + 4}" text-anchor="end" fill="#64748b" font-size="11">${formatSigned(value)}</text>
      `).join("")}
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#94a3b8" />
      ${xLabels().map(item => `
        <text x="${groupCenter(item.index)}" y="${height - 22}" text-anchor="middle" fill="#64748b" font-size="11">${item.label}</text>
      `).join("")}
    `;

    const barWidth = Math.max(5, Math.min(28, weekBand * 0.62));
    values.forEach((value, index) => {
      if (!value) return;
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const topY = value > 0 ? y(value) : zeroY;
      const heightValue = Math.max(1, Math.abs(y(value) - zeroY));
      rect.setAttribute("x", String(groupCenter(index) - barWidth / 2));
      rect.setAttribute("y", String(topY));
      rect.setAttribute("width", String(barWidth));
      rect.setAttribute("height", String(heightValue));
      rect.setAttribute("rx", "2");
      rect.setAttribute("fill", value > 0 ? "#2563eb" : "#dc2626");
      rect.setAttribute("tabindex", "0");
      rect.dataset.caBar = "true";
      rect.dataset.tooltip = `Weekly net change\n${formatWeek(weeks[index])}: ${formatSigned(value)}\nTotal in range: ${formatSigned(total)}`;
      svg.appendChild(rect);
    });

    chart.querySelector("svg")?.remove();
    chart.insertBefore(svg, tooltip);
    chart.querySelectorAll("[data-ca-bar]").forEach(bar => {
      bar.addEventListener("mousemove", event => showTooltip(event, bar.dataset.tooltip));
      bar.addEventListener("mouseleave", hideTooltip);
      bar.addEventListener("focus", event => showTooltip(event, bar.dataset.tooltip));
      bar.addEventListener("blur", hideTooltip);
    });

    document.querySelector(`[data-ca-legend="${metric}"]`).innerHTML = `
      <span class="ca-legend-item"><span class="ca-swatch" style="background:#2563eb"></span>Net increase</span>
      <span class="ca-legend-item"><span class="ca-swatch" style="background:#dc2626"></span>Net decrease</span>
      <span class="ca-legend-item">Total in range: <strong>${formatSigned(total)}</strong></span>
    `;

    function xLabels() {
      if (!weeks.length) return [];
      const approxCount = 8;
      const step = Math.max(1, Math.ceil(weeks.length / approxCount));
      return weeks
        .map((week, index) => ({ index, label: formatWeek(week) }))
        .filter((_, index) => index % step === 0);
    }
  }

  function showTooltip(event, text) {
    const chart = event.currentTarget.closest("[data-ca-chart]");
    const tooltip = chart.querySelector("[data-ca-tooltip]");
    const chartRect = chart.getBoundingClientRect();
    const targetRect = event.currentTarget.getBoundingClientRect();
    const clientX = Number.isFinite(event.clientX) && event.clientX ? event.clientX : targetRect.left + targetRect.width / 2;
    const clientY = Number.isFinite(event.clientY) && event.clientY ? event.clientY : targetRect.top;
    tooltip.textContent = text || "";
    tooltip.style.display = "block";
    tooltip.style.left = `${clientX - chartRect.left}px`;
    tooltip.style.top = `${clientY - chartRect.top}px`;
  }

  function hideTooltip() {
    document.querySelectorAll("[data-ca-tooltip]").forEach(tooltip => {
      tooltip.style.display = "none";
    });
  }

  function renderMessage() {
    const el = document.querySelector("[data-ca-message]");
    if (state.records.length && !state.lastError) {
      el.innerHTML = "";
      return;
    }
    if (isExtensionContextError(state.lastError)) {
      el.innerHTML = `
        <div class="ca-message">
          Extension was reloaded while this page was open. Refresh the Checkee tab once so Chrome can attach the new content script.
        </div>
      `;
      return;
    }
    if (!state.lastError) {
      el.innerHTML = `
        <div class="ca-message">
          Click <code>Refresh</code> to load monthly Checkee pages for <code>${escapeHtml(timeRangeLabel())}</code>.
        </div>
      `;
      return;
    }
    el.innerHTML = `
      <div class="ca-message">
        Automatic extraction did not find records on this page. Open the Checkee list/data page and click <code>Refresh</code>,
        or use <code>Import</code> with JSON/CSV containing visa type, case date, cleared date, and status fields.
        ${state.lastError ? `<br><br>${escapeHtml(state.lastError)}` : ""}
      </div>
    `;
  }

  function seriesForMetric(metric) {
    if (metric === "newVsCleared") {
      return [
        {
          name: "New cases",
          color: "#2563eb",
          values: state.weeks.map(week => countRecords(record => inSameWeek(record.createdAt, week)))
        },
        {
          name: "Cleared cases",
          color: "#16a34a",
          values: state.weeks.map(week => countRecords(record => inSameWeek(record.clearedAt, week)))
        }
      ];
    }

    if (metric === "netChangeSinceBase") {
      return [
        {
          name: "Weekly net change",
          color: "#2563eb",
          values: netChangeWeeks().map(week => {
            const newCases = countRecords(record => inSameWeek(record.createdAt, week));
            const clearedCases = countRecords(record => inSameWeek(record.clearedAt, week));
            return newCases - clearedCases;
          })
        }
      ];
    }

    const isLongWait = metric === "longWaitByVisa";
    const visaTypes = state.selectedVisaType ? [state.selectedVisaType] : state.visaTypes;
    return visaTypes
      .map(visa => ({
        name: visa,
        color: colorFor(Math.max(0, state.visaTypes.indexOf(visa))),
        values: state.weeks.map(week => countRecords(record => {
          if (record.visaType !== visa || !record.clearedAt || !inSameWeek(record.clearedAt, week)) return false;
          return isLongWait ? record.waitDays >= 30 : true;
        }))
      }));
  }

  function countRecords(predicate) {
    return filteredRecords().reduce((total, record) => total + (predicate(record) ? 1 : 0), 0);
  }

  async function importFile(file) {
    const text = await file.text();
    const records = file.name.toLowerCase().endsWith(".json")
      ? recordsFromUnknown(JSON.parse(text))
      : parseCsv(text);
    ingestRecords(records, `imported ${file.name}`);
    state.pullComplete = true;
    await saveCachedData(records, `imported ${file.name}`);
    state.expanded = true;
    syncExpanded();
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (char === '"' && quoted && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        row.push(cell);
        cell = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") i += 1;
        row.push(cell);
        if (row.some(value => value.trim())) rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }
    row.push(cell);
    if (row.some(value => value.trim())) rows.push(row);
    if (rows.length < 2) return [];
    const headers = rows[0].map(normalizeHeader);
    return rows.slice(1).map(values => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = values[index] || "";
      });
      return record;
    });
  }

  function inferDateFromRecord(record, sourceMonth) {
    if (!sourceMonth) return null;
    const entries = Object.entries(record).filter(([key]) => !key.startsWith("__"));
    const likelyDateEntries = entries.filter(([key, value]) => isDateishKey(key) || containsDateShape(value));
    for (const [key, value] of likelyDateEntries) {
      const parsed = parseDate(value, sourceMonth, isDateishKey(key));
      if (parsed) return parsed;
    }
    return null;
  }

  function parseDate(value, sourceMonth = "", allowDayOnly = true) {
    if (value == null || value === "") return null;
    if (value instanceof Date && !Number.isNaN(value.valueOf())) return startOfDay(value);
    if (typeof value === "number") {
      const date = new Date(value > 100000000000 ? value : value * 1000);
      return Number.isNaN(date.valueOf()) ? null : startOfDay(date);
    }
    const text = String(value).trim();
    if (sourceMonth) {
      const sourceParts = sourceMonth.match(/^(\d{4})-(\d{2})$/);
      if (sourceParts) {
        const sourceYear = Number(sourceParts[1]);
        const sourceMonthNumber = Number(sourceParts[2]);
        const dayOnly = allowDayOnly ? text.match(/^\s*(\d{1,2})\s*$/) : null;
        if (dayOnly) {
          const day = Number(dayOnly[1]);
          if (day >= 1 && day <= 31) return new Date(Date.UTC(sourceYear, sourceMonthNumber - 1, day));
        }
        const monthDay = text.match(/\b(\d{1,2})[-/](\d{1,2})\b/);
        if (monthDay && !/\d{4}/.test(text)) {
          const first = Number(monthDay[1]);
          const second = Number(monthDay[2]);
          if (first === sourceMonthNumber && second >= 1 && second <= 31) {
            return new Date(Date.UTC(sourceYear, sourceMonthNumber - 1, second));
          }
          if (second === sourceMonthNumber && first >= 1 && first <= 31) {
            return new Date(Date.UTC(sourceYear, sourceMonthNumber - 1, first));
          }
        }
      }
    }
    const isoLike = text.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (isoLike) {
      return new Date(Date.UTC(Number(isoLike[1]), Number(isoLike[2]) - 1, Number(isoLike[3])));
    }
    const usLike = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/);
    if (usLike) {
      const year = Number(usLike[3].length === 2 ? `20${usLike[3]}` : usLike[3]);
      return new Date(Date.UTC(year, Number(usLike[1]) - 1, Number(usLike[2])));
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.valueOf()) ? null : startOfDay(parsed);
  }

  function isDateishKey(key) {
    return /date|time|day|clear|update|submit|create|check|pass|issue|通过|日期|时间|提交|完成/i.test(String(key));
  }

  function containsDateShape(value) {
    return /(\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2})|(\b\d{1,2}[-/]\d{1,2}\b)/.test(String(value || ""));
  }

  function weeksBetween(start, end) {
    const weeks = [];
    let cursor = startOfWeek(start);
    const final = startOfWeek(end);
    while (cursor <= final) {
      weeks.push(new Date(cursor));
      cursor = addDays(cursor, 7);
    }
    return weeks;
  }

  function monthStarts(start, end) {
    const months = [];
    let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const final = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    while (cursor <= final) {
      months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    return months;
  }

  function netChangeWeeks() {
    return displayWeeks();
  }

  function displayWeeks() {
    return weeksBetween(displayStartDate(), new Date());
  }

  function displayStartDate() {
    const today = startOfDay(new Date());
    if (state.timeRange === "6m") return maxDate(START_DATE, addMonths(today, -6));
    if (state.timeRange === "1y") return maxDate(START_DATE, addYears(today, -1));
    if (state.timeRange === "2y") return maxDate(START_DATE, addYears(today, -2));
    if (state.timeRange === "5y") return maxDate(START_DATE, addYears(today, -5));
    return earliestLoadedDate() || START_DATE;
  }

  function requestedStartDate() {
    const today = startOfDay(new Date());
    if (state.timeRange === "6m") return maxDate(START_DATE, addMonths(today, -6));
    if (state.timeRange === "1y") return maxDate(START_DATE, addYears(today, -1));
    if (state.timeRange === "2y") return maxDate(START_DATE, addYears(today, -2));
    if (state.timeRange === "5y") return maxDate(START_DATE, addYears(today, -5));
    return START_DATE;
  }

  function currentDataCoversTimeRange() {
    const earliest = earliestLoadedDate();
    return Boolean(earliest && earliest <= requestedStartDate());
  }

  function currentStorageKey() {
    return `${STORAGE_KEY_PREFIX}_${state.timeRange}_${formatMonth(monthStart(requestedStartDate()))}`;
  }

  function timeRangeLabel() {
    if (state.timeRange === "6m") return "last 6 months";
    if (state.timeRange === "1y") return "last 1 year";
    if (state.timeRange === "2y") return "last 2 years";
    if (state.timeRange === "5y") return "last 5 years";
    return "max";
  }

  function isInDisplayRange(date) {
    if (!date) return false;
    return date >= displayStartDate() && date <= new Date();
  }

  function maxDate(a, b) {
    return a > b ? a : b;
  }

  function earliestLoadedDate() {
    const dates = state.records
      .flatMap(record => [record.createdAt, record.clearedAt])
      .filter(Boolean)
      .sort((a, b) => a - b);
    return dates[0] || null;
  }

  async function loadCachedData(options = {}) {
    const cached = await readStorage(currentStorageKey());
    if (!cached || !Array.isArray(cached.records) || !cached.records.length || state.loading || (!options.replace && state.records.length)) {
      return false;
    }
    if (cached.startDate !== isoDate(monthStart(displayStartDate()))) {
      state.lastError = `Ignored stale cache starting at ${cached.startDate || "unknown"}; click Refresh to build the ${timeRangeLabel()} cache.`;
      renderData();
      return false;
    }
    state.lastError = "";
    state.pullComplete = true;
    const savedAt = cached.savedAt ? new Date(cached.savedAt) : null;
    const savedLabel = savedAt && !Number.isNaN(savedAt.valueOf()) ? savedAt.toLocaleString() : "previous run";
    ingestRecords(cached.records, `cached pull from ${savedLabel}`);
    return true;
  }

  async function saveCachedData(records, source) {
    if (!records.length) return;
    await writeStorage(currentStorageKey(), {
      records,
      source,
      pullComplete: true,
      savedAt: new Date().toISOString(),
      startDate: isoDate(monthStart(displayStartDate())),
      timeRange: state.timeRange,
      endDate: isoDate(new Date())
    });
  }

  function readStorage(key) {
    return new Promise(resolve => {
      try {
        if (globalThis.chrome && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(key, result => {
            if (chrome.runtime && chrome.runtime.lastError) {
              resolve(readLocalStorage(key));
              return;
            }
            resolve(result && result[key] ? result[key] : null);
          });
          return;
        }
      } catch (_) {
        resolve(readLocalStorage(key));
        return;
      }
      resolve(readLocalStorage(key));
    });
  }

  function readLocalStorage(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeStorage(key, value) {
    return new Promise(resolve => {
      try {
        if (globalThis.chrome && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ [key]: value }, () => {
            if (chrome.runtime && chrome.runtime.lastError) writeLocalStorage(key, value);
            resolve();
          });
          return;
        }
      } catch (_) {
        writeLocalStorage(key, value);
        resolve();
        return;
      }
      writeLocalStorage(key, value);
      resolve();
    });
  }

  function writeLocalStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function isExtensionContextError(message) {
    return /extension context invalidated/i.test(String(message || ""));
  }

  function currentDispMonth() {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("dispdate");
    return /^\d{4}-\d{2}$/.test(value || "") ? value : "";
  }

  function inRange(date) {
    if (!date) return false;
    return date >= START_DATE && date <= new Date();
  }

  function inSameWeek(date, weekStart) {
    if (!date) return false;
    const start = startOfWeek(date);
    return start.getTime() === weekStart.getTime();
  }

  function startOfWeek(date) {
    const day = startOfDay(date);
    const weekday = day.getUTCDay();
    const delta = weekday === 0 ? 6 : weekday - 1;
    return addDays(day, -delta);
  }

  function startOfDay(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  function monthStart(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  function addDays(date, days) {
    return new Date(date.getTime() + days * 86400000);
  }

  function addMonths(date, months) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
  }

  function addYears(date, years) {
    return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()));
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function daysBetween(start, end) {
    return Math.round((startOfDay(end) - startOfDay(start)) / 86400000);
  }

  function isoDate(date) {
    return startOfDay(date).toISOString().slice(0, 10);
  }

  function formatWeek(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  function formatMonth(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  function tickValues(maxValue, count) {
    const step = Math.max(1, Math.ceil(maxValue / count));
    const values = [];
    for (let value = 0; value <= maxValue; value += step) values.push(value);
    if (values[values.length - 1] !== maxValue) values.push(maxValue);
    return values;
  }

  function tickValuesBetween(minValue, maxValue, count) {
    const span = Math.max(1, maxValue - minValue);
    const step = Math.max(1, Math.ceil(span / count));
    const start = Math.floor(minValue / step) * step;
    const end = Math.ceil(maxValue / step) * step;
    const values = [];
    for (let value = start; value <= end; value += step) values.push(value);
    if (!values.includes(0)) values.push(0);
    return values.sort((a, b) => a - b);
  }

  function titleForMetric(metric) {
    if (metric === "longWaitByVisa") return "Long-wait (>= 30 days) clearance per week, by visa type";
    if (metric === "newVsCleared") return "New case vs cleared case per week";
    if (metric === "netChangeSinceBase") return `Weekly net case change from ${formatWeek(displayStartDate())}`;
    return "Case cleared per week, by visa type";
  }

  function chartTitleForMetric(metric) {
    if (metric !== "netChangeSinceBase") return titleForMetric(metric);
    if (!state.pullComplete) return `${titleForMetric(metric)} (pending full pull)`;
    return `${titleForMetric(metric)} (total ${formatSigned(netChangeTotal())})`;
  }

  function netChangeTotal() {
    return netChangeWeeks().reduce((total, week) => {
      const newCases = countRecords(record => inSameWeek(record.createdAt, week));
      const clearedCases = countRecords(record => inSameWeek(record.clearedAt, week));
      return total + newCases - clearedCases;
    }, 0);
  }

  function formatSigned(value) {
    return value > 0 ? `+${value.toLocaleString()}` : value.toLocaleString();
  }

  function normalizeHeader(text) {
    return String(text || "").trim().replace(/\s+/g, "_");
  }

  function colorFor(index) {
    return COLORS[index % COLORS.length];
  }

  function updateStatus(text) {
    document.querySelector("[data-ca-status]").textContent = text;
  }

  function setLoading(isLoading) {
    document.querySelector("[data-ca-refresh]").disabled = isLoading;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
