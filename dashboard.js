// /js/dashboard.js  (full updated file)

// =============================================================
// DataTables error handling
// =============================================================
$.fn.dataTable.ext.errMode = "none";

// =============================================================
// Paths
// =============================================================
const EXPORTER_PATH       = "data/exporters.csv";
const ISIC_CODES_PATH     = "data/isic4_2_product_name.csv";
const HS6_CODES_PATH      = "data/hs6code.csv";
const ISIC_TARIFF_PATH    = "data/isic42dtariffnew.csv";
const HS6_TARIFF_PATH     = "data/hs6tariffsnew.csv";
const EO_LINKS_PATH       = "data/eo_links.csv";
const TRADE_AFFECTED_PATH = "data/trade_affected.csv"; // Trade affected CSV

// =============================================================
// Globals
// =============================================================
let exporterList = [];
let isicCodes = [];
let hs6Codes = [];

let isicTariffData = [];
let hs6TariffData = [];

const WORLD_IMPORTER_VALUE = "World";

let eoLinks = {};
let eoLinksLoaded = false;
let lastEOArgs = null;

// Trade affected dataset rows
// [{code,country,partner_country,rel_import_change,date: Date, dateRaw: string}]
let tradeAffectedData = [];
let tradeAffectedLoaded = false;

// =============================================================
// DOM Ready
// =============================================================
document.addEventListener("DOMContentLoaded", () => {
  setupExporterDropdown();

  const exporterBox = document.getElementById("exporterBox");
  if (exporterBox) exporterBox.innerHTML = "";
  resetExporterDisplay("Loading Data...");

  loadEOLinks();

  // Load trade affected first (independent)
  loadTradeAffected(() => {
    populateTradeAffectedCountries();
    initTradeAffectedDefaultDate(); // set latest date in input if empty
    drawTradeAffectedBars(getTASelectedCountry(), getTASelectedDate());
  });

  loadExporters(() => {
    loadIsicCodes(() => {
      loadHs6Codes(() => {
        loadTariff(ISIC_TARIFF_PATH, "isic", () => {
          loadTariff(HS6_TARIFF_PATH, "hs6", () => {
            bindCoreEvents();
            initialLoadAndRender();
          });
        });
      });
    });
  });

  bindTradeAffectedEvents(); // wire TA controls now; rendering waits for data
});

// =============================================================
// Events
// =============================================================
function bindCoreEvents() {
  document.getElementById("importerSelect")?.addEventListener("change", importerChanged);
  document.getElementById("classSelect")?.addEventListener("change", classificationChanged);
  document.getElementById("applyFilters")?.addEventListener("click", applyFilters);
}

// Local events for Trade Affected controls
function bindTradeAffectedEvents() {
  const cSel = document.getElementById("tradeAffectedCountry");
  const dSel = document.getElementById("tradeAffectedDate");
  if (cSel) {
    cSel.addEventListener("change", () => {
      drawTradeAffectedBars(getTASelectedCountry(), getTASelectedDate());
    });
  }
  if (dSel) {
    dSel.addEventListener("change", () => {
      drawTradeAffectedBars(getTASelectedCountry(), getTASelectedDate());
    });
  }
}

// =============================================================
// Initial render
// =============================================================
function initialLoadAndRender() {
  const importerEl = document.getElementById("importerSelect");
  const classEl = document.getElementById("classSelect");
  if (importerEl) importerEl.value = WORLD_IMPORTER_VALUE;
  if (classEl) classEl.value = "hs6";

  disableCodeDropdowns();

  const initialClass = "hs6";
  const initialData = hs6TariffData;

  populateHs6Exporters(WORLD_IMPORTER_VALUE, initialData);
  drawChart(initialData, [], true, initialClass, null);
  // Removed line chart for trade affected
  updateSummary(initialClass, initialData);
  updateEO(initialClass, initialData, WORLD_IMPORTER_VALUE, [], "", "", null, null);

  enableHs6Only();
  populateHs6(WORLD_IMPORTER_VALUE);
}

// =============================================================
// Exporter dropdown
// =============================================================
function setupExporterDropdown() {
  const disp = document.getElementById("exporterDisplay");
  const panel = document.getElementById("exporterBox");
  if (!disp || !panel) return;
  disp.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.style.display = panel.style.display === "block" ? "none" : "block";
  });
  document.addEventListener("click", () => (panel.style.display = "none"));
  panel.addEventListener("click", (e) => e.stopPropagation());
}
function resetExporterDisplay(text) {
  const el = document.getElementById("exporterDisplayText");
  if (el) el.textContent = text;
}
function updateExporterDisplay() {
  const cbs = document.querySelectorAll(".exporter-checkbox:checked");
  const txt = document.getElementById("exporterDisplayText");
  if (!txt) return;
  if (!cbs.length) txt.textContent = "World (All Exporters)";
  else if (cbs.length === 1) txt.textContent = cbs[0].value;
  else txt.textContent = `${cbs.length} exporters selected`;
}

// =============================================================
// Load CSV lists
// =============================================================
function loadExporters(callback) {
  Papa.parse(EXPORTER_PATH, {
    download: true, header: true,
    complete: (res) => {
      const seen = {};
      exporterList = [];
      (res.data || []).forEach((r) => {
        const e = (r.exporter || "").trim();
        if (e && !seen[e]) { seen[e] = true; exporterList.push(e); }
      });
      exporterList.sort();
      if (callback) callback();
    }
  });
}
function loadIsicCodes(callback) {
  Papa.parse(ISIC_CODES_PATH, {
    download: true, header: true,
    complete: (res) => {
      const seen = {};
      isicCodes = [];
      (res.data || []).forEach((r) => {
        const raw = (r.isic4_2 || "").trim();
        const two = normalizeIsic(raw);
        if (two && !seen[two]) { seen[two] = true; isicCodes.push(two); }
      });
      isicCodes.sort();
      if (callback) callback();
    }
  });
}
function loadHs6Codes(callback) {
  Papa.parse(HS6_CODES_PATH, {
    download: true, header: true,
    complete: (res) => {
      const seen = {};
      hs6Codes = [];
      (res.data || []).forEach((r) => {
        const code = (r.hs6code || "").trim();
        if (code && !seen[code]) { seen[code] = true; hs6Codes.push(code); }
      });
      hs6Codes.sort();
      if (callback) callback();
    }
  });
}
function normalizeIsic(raw) {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (!d) return "";
  return d.length >= 2 ? d.slice(0, 2) : d.padStart(2, "0");
}

// =============================================================
// Robust date parsing
// =============================================================
function parseDateSafe(v) {
  if (!v) return null;
  const s = String(v).trim();
  let m;
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
  if ((m = s.match(iso))) {
    const y = +m[1], mo = +m[2] - 1, d = +m[3];
    const dt = new Date(Date.UTC(y, mo, d));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/;
  if ((m = s.match(us))) {
    let y = +m[3]; if (y < 100) y += 2000;
    const mo = +m[1] - 1, d = +m[2];
    const dt = new Date(Date.UTC(y, mo, d));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}
function toYMD(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2,"0");
  const day = String(d.getUTCDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

// =============================================================
// Load tariffs (keep EO fields)
// =============================================================
function loadTariff(path, mode, callback) {
  Papa.parse(path, {
    download: true, header: true, skipEmptyLines: true,
    complete: (res) => {
      const out = [];
      (res.data || []).forEach((row) => {
        const d = parseDateSafe(row.date_eff);
        const importer = (row.importer || "").trim();
        const exporter = (row.exporter || "").trim();
        const tariff = parseFloat(row.tariffs || 0) || 0;

        const importsK = parseFloat(row.importsvaluein1000usd || 0) || 0;
        const tradeValue = importsK * 1000;

        const hs6Raw = (row.hs6 || "").trim();
        const code = mode === "isic" ? normalizeIsic(row.isic4_2 || "") : hs6Raw;

        const share     = parseFloat(row.affected_trade_share || 0) || 0;
        const lineShare = parseFloat(row.affected_hs6tariff_line_share || 0) || 0;
        const affectedTv = parseFloat(row.affected_trade_value || 0) || 0;

        const eo_name       = (row.eo_name || "").trim();
        const applied_scope = (row.applied_scope || row["applied scope"] || row.appliedscope || "").trim();
        const affected      = (row.affected ?? "").toString().trim();

        out.push({
          importer, exporter,
          code, hs6: hs6Raw,
          date: d, dateRaw: row.date_eff || "",
          tariff, tradeValue, importsK,
          affected, eo_name, applied_scope,
          affectedTv, share, lineShare
        });
      });

      if (mode === "isic") isicTariffData = out;
      else hs6TariffData = out;

      if (callback) callback();
    }
  });
}

// =============================================================
// EO links loader
// =============================================================
function loadEOLinks(callback) {
  Papa.parse(EO_LINKS_PATH, {
    download: true, header: true, skipEmptyLines: true,
    complete: (res) => {
      try {
        eoLinks = {};
        (res.data || []).forEach((row) => {
          const rawName = row.eo_name ?? row.EO_NAME ?? row["eo name"] ?? row["EO NAME"] ?? "";
          const rawUrl  = row.pdf_url ?? row.PDF_URL ?? row["pdf url"] ?? row["PDF URL"] ?? row.url ?? row.URL ?? "";
          const name = String(rawName).trim();
          const url  = String(rawUrl).trim();
          if (name && url) eoLinks[normalizeEOKey(name)] = url;
        });
      } catch (e) {
        console.warn("EO links parse error:", e);
      } finally {
        eoLinksLoaded = true;
        if (lastEOArgs) updateEO(...lastEOArgs);
        if (typeof callback === "function") callback();
      }
    },
    error: () => {
      eoLinksLoaded = true;
      if (lastEOArgs) updateEO(...lastEOArgs);
      if (typeof callback === "function") callback();
    }
  });
}
function normalizeEOKey(name) { return String(name || "").trim().toUpperCase(); }
function getEOLink(name) { return eoLinks[normalizeEOKey(name)] || null; }
function eoIconAnchor(name) {
  const href = getEOLink(name);
  if (!href) return "";
  const safeHref = encodeURI(href);
  return `
    <a href="${safeHref}" target="_blank" rel="noopener noreferrer"
       title="Open PDF for ${escapeHtml(name)}"
       style="margin-left:6px; vertical-align:middle; display:inline-flex; align-items:center;">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"
           aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              fill="none" stroke="currentColor"/>
        <path d="M14 2v6h6" fill="none" stroke="currentColor"/>
        <path d="M8 13h3M8 17h8" stroke="currentColor"/>
      </svg>
    </a>
  `;
}

// =============================================================
// Load TRADE AFFECTED CSV
// =============================================================
function loadTradeAffected(callback) {
  Papa.parse(TRADE_AFFECTED_PATH, {
    download: true, header: true, skipEmptyLines: true,
    complete: (res) => {
      const out = [];
      (res.data || []).forEach((row) => {
        const code = (row.code || "").trim();
        const country = (row.country || "").trim(); // full name or "All"
        const partner_country = (row.partner_country || "").trim(); // ISO3 partner
        const ric = Number(row.rel_import_change || row.rel_import_change_pct || row.ric) || 0;
        const d = parseDateSafe(row.date);
        out.push({
          code, country, partner_country,
          rel_import_change: ric,
          date: d, dateRaw: row.date || ""
        });
      });
      tradeAffectedData = out;
      tradeAffectedLoaded = true;
      if (typeof callback === "function") callback();
    },
    error: () => {
      tradeAffectedLoaded = true;
      if (typeof callback === "function") callback();
    }
  });
}

// =============================================================
// Populate Trade Affected controls
// =============================================================
function populateTradeAffectedCountries() {
  const sel = document.getElementById("tradeAffectedCountry");
  if (!sel || !tradeAffectedLoaded) return;

  const set = new Set();
  (tradeAffectedData || []).forEach(r => {
    const c = (r.country || "").trim();
    if (c) set.add(c);
  });

  const arr = Array.from(set).sort((a,b)=>a.localeCompare(b));
  sel.innerHTML = "";
  if (!arr.includes("All")) arr.unshift("All");

  arr.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
}

// Default date = latest available in dataset
function initTradeAffectedDefaultDate() {
  const input = document.getElementById("tradeAffectedDate");
  if (!input || !tradeAffectedLoaded) return;
  if (input.value) return;

  let maxTs = -Infinity, maxDate = null;
  (tradeAffectedData || []).forEach(r => {
    if (r.date instanceof Date && !isNaN(r.date)) {
      const ts = r.date.getTime();
      if (ts > maxTs) { maxTs = ts; maxDate = r.date; }
    }
  });
  if (maxDate) input.value = toYMD(maxDate);
}

// Helpers to read TA control selections
function getTASelectedCountry() {
  const sel = document.getElementById("tradeAffectedCountry");
  return sel ? sel.value : "";
}
function getTASelectedDate() {
  const input = document.getElementById("tradeAffectedDate");
  return input && input.value ? parseDateSafe(input.value) : null;
}

// =============================================================
// APPLY FILTERS
// =============================================================
function applyFilters() {
  const importer = document.getElementById("importerSelect").value || WORLD_IMPORTER_VALUE;
  const cls = document.getElementById("classSelect").value;

  const isicC = document.getElementById("isicSelect").value;
  const hs6C  = document.getElementById("hs6Select").value;

  if (!cls) { alert("Please select classification."); return; }

  const from = document.getElementById("dateFrom").value ? parseDateSafe(document.getElementById("dateFrom").value) : null;
  const to   = document.getElementById("dateTo").value   ? parseDateSafe(document.getElementById("dateTo").value)   : null;

  const selectedExp = [];
  document.querySelectorAll(".exporter-checkbox:checked").forEach((x) => selectedExp.push(x.value));
  const worldMode = selectedExp.length === 0;

  const base = cls === "isic" ? isicTariffData : hs6TariffData;

  const filtered = base.filter((r) => {
    if (importer !== WORLD_IMPORTER_VALUE && r.importer !== importer) return false;
    if (cls === "isic" && isicC && r.code !== isicC) return false;
    if (cls === "hs6"  && hs6C  && r.code !== hs6C)  return false;
    if (!worldMode && !selectedExp.includes(r.exporter)) return false;
    if (from && r.date instanceof Date && !isNaN(r.date) && r.date < from) return false;
    if (to   && r.date instanceof Date && !isNaN(r.date) && r.date > to)   return false;
    return true;
  });

  const selectedCode =
    cls === "hs6" && hs6C ? `HS6 Tariff Line ${hs6C}` :
    cls === "isic" && isicC ? `ISIC4 2 Digit Tariff Line ${isicC}` :
    cls === "hs6" ? "HS6 Tariff Line" : "ISIC4 2 Digit Tariff Line";

  drawChart(filtered, selectedExp, worldMode, cls, selectedCode);
  // Removed line chart call for trade affected
  updateSummary(cls, filtered);
  updateEO(cls, filtered, importer, selectedExp, isicC, hs6C, from, to);

  // Re-render Trade Affected bars too, using current TA controls
  drawTradeAffectedBars(getTASelectedCountry(), getTASelectedDate());
}

// =============================================================
// MAIN Chart
// =============================================================
function drawChart(data, exporters, worldMode, classification, codeTitle) {
  const chartDiv = document.getElementById("tariffChartMain");
  if (!chartDiv) return;

  if (!data || data.length === 0) {
    Plotly.newPlot(chartDiv, [], { title: "No Data" });
    return;
  }

  const traces = [];
  const chartTitle = codeTitle
    ? `${codeTitle}`
    : worldMode
      ? (classification === "isic" ? "ISIC4 2-Digit Tariff Line" : "HS6 Tariff Line")
      : "Tariff Lines – Selected Exporters";

  if (worldMode) {
    const grouped = {};
    data.forEach((d) => {
      const lbl = (d.date instanceof Date && !isNaN(d.date))
        ? d.date.toLocaleDateString("en-US")
        : (d.dateRaw || "Unknown");
      if (!grouped[lbl]) grouped[lbl] = [];
      grouped[lbl].push(d.tariff);
    });

    const allLabels = Object.keys(grouped).sort((a, b) => new Date(a) - new Date(b));
    const allDates  = allLabels.map((lbl) => parseDateSafe(lbl) || new Date(lbl));
    const allValues = allLabels.map((lbl) => {
      const arr = grouped[lbl];
      return arr.reduce((a,b)=>a+b,0) / arr.length;
    });

    traces.push({
      x: allDates,
      y: allValues,
      mode: "lines+markers",
      name: "World",
      line: { shape: "hv", width: 3, color: "#003366" },
      marker: { size: 8, color: "#003366" }
    });

    Plotly.newPlot(chartDiv, traces, {
      title: chartTitle,
      xaxis: {
        title: "Date",
        type: "date",
        tickmode: "array",
        tickvals: allDates,
        ticktext: allLabels,
        tickangle: -45
      },
      yaxis: { title: "Tariff (%)" },
      font: { family: "Georgia, serif", size: 12 },
      plot_bgcolor: "#fff",
      paper_bgcolor: "#fff",
      showlegend: false
    });
    return;
  }

  const labelSet = new Set();
  data.forEach((d) => {
    const lbl = (d.date instanceof Date && !isNaN(d.date))
      ? d.date.toLocaleDateString("en-US")
      : (d.dateRaw || "Unknown");
    labelSet.add(lbl);
  });
  const allLabels = Array.from(labelSet).sort((a,b)=>new Date(a)-new Date(b));
  const allDates  = allLabels.map((lbl)=>parseDateSafe(lbl) || new Date(lbl));

  exporters.forEach((exp) => {
    const rows = data.filter((d) => d.exporter === exp);
    if (!rows.length) return;

    const daily = {};
    rows.forEach((d) => {
      const lbl = (d.date instanceof Date && !isNaN(d.date))
        ? d.date.toLocaleDateString("en-US")
        : (d.dateRaw || "Unknown");
      if (!daily[lbl]) daily[lbl] = [];
      daily[lbl].push(d.tariff);
    });

    const x = [], y = [];
    allLabels.forEach((lbl) => {
      if (daily[lbl]) {
        const arr = daily[lbl];
        x.push(parseDateSafe(lbl) || new Date(lbl));
        y.push(arr.reduce((a,b)=>a+b,0) / arr.length);
      }
    });

    traces.push({
      x,
      y,
      mode: "lines+markers",
      name: exp,
      line: { shape: "hv", width: 3, color: "#003366" },
      marker: { size: 8, color: "#003366" }
    });
  });

  Plotly.newPlot(chartDiv, traces, {
    title: chartTitle,
    xaxis: {
      title: "Date",
      type: "date",
      tickmode: "array",
      tickvals: allDates,
      ticktext: allLabels,
      tickangle: -45
    },
    yaxis: { title: "Tariff (%)" },
    font: { family: "Georgia, serif", size: 12 },
    plot_bgcolor: "#fff",
    paper_bgcolor: "#fff",
    showlegend: true
  });
}

// =============================================================
// Trade Affected — BAR CHART by partner on selected date
// (this is now the ONLY Trade Affected visualization)
// =============================================================
function drawTradeAffectedBars(country, dateObj) {
  const container = document.getElementById("tradeAffectedChart");
  if (!container) return;

  if (!tradeAffectedLoaded || !tradeAffectedData.length) {
    Plotly.newPlot(container, [], { title: "No Data" });
    return;
  }

  // Fallback to latest date if none provided
  let targetDate = dateObj;
  if (!targetDate) {
    let maxTs = -Infinity, maxD = null;
    tradeAffectedData.forEach(r => {
      if (r.date instanceof Date && !isNaN(r.date)) {
        const ts = r.date.getTime();
        if (ts > maxTs) { maxTs = ts; maxD = r.date; }
      }
    });
    targetDate = maxD;
  }

  if (!targetDate) {
    Plotly.newPlot(container, [], { title: "No valid dates in dataset" });
    return;
  }

  const ymd = toYMD(targetDate);

  // 1️⃣ Filter rows by date and country
  let rows = tradeAffectedData.filter(r => {
    const rDate = (r.date instanceof Date && !isNaN(r.date))
      ? toYMD(r.date)
      : toYMD(parseDateSafe(r.dateRaw));

    const sameDay = rDate === ymd;
    const matchCountry =
      !country || country === "" || country === "All"
        ? true
        : (r.country === country);

    return sameDay && matchCountry;
  });

  if (!rows.length) {
    Plotly.newPlot(container, [], { title: "No data for selected filters" });
    return;
  }

  // 2️⃣ NO AGGREGATION NEEDED
  //    Your data already has exactly 1 row per partner_country.
  //    Just sort them:
  rows.sort((a,b) => a.rel_import_change - b.rel_import_change);

  // 3️⃣ Prepare plot arrays
  const xCats = rows.map(r => r.partner_country);
  const yVals = rows.map(r => r.rel_import_change);

  const titleCountry = country && country.length ? country : "All";
  const titleDate = ymd || "N/A";

  const trace = {
    x: xCats,
    y: yVals,
    type: "bar",
    marker: { color: "#003366" }
  };

  Plotly.newPlot(container, [trace], {
    title: `Relative Import Change by Partner — ${titleCountry} (${titleDate})`,
    xaxis: { title: "Partner Country", automargin: true, tickangle: -45 },
    yaxis: { title: "Relative Import Change", zeroline: true },
    font: { family: "Georgia, serif", size: 12 },
    plot_bgcolor: "#fff",
    paper_bgcolor: "#fff",
    showlegend: false,
    margin: { l: 60, r: 20, t: 60, b: 90 }
  });
}

// =============================================================
// SUMMARY TABLES (7 cols)
// =============================================================
function updateSummary(mode, data) {
  const $isic = $("#summaryTableISIC");
  const $hs6  = $("#summaryTableHS6");

  if ($.fn.DataTable.isDataTable($isic)) $isic.DataTable().clear().destroy();
  if ($.fn.DataTable.isDataTable($hs6))  $hs6.DataTable().clear().destroy();

  [$isic, $hs6].forEach(($t) => {
    if (!$t || !$t.length) return;
    if ($t.find("tbody").length === 0) $t.append("<tbody></tbody>");
    $t.find("tbody")[0].innerHTML = "";
    $t.removeAttr("style");
    $t.find("thead, tbody, tr, th, td").each(function(){ this.removeAttribute("style"); });
    $t.find("thead").css("display","table-header-group");
    $t.find("tbody").css("display","table-row-group");
  });

  ensureHeader7Cols("#summaryTableISIC");
  ensureHeader7Cols("#summaryTableHS6");

  const $target = mode === "isic" ? $isic : $hs6;
  const $other  = mode === "isic" ? $hs6  : $isic;
  $other.hide(); $target.show();

  if (!data || !data.length) {
    $target.DataTable({ pageLength: 5, autoWidth: false, deferRender: true });
    return;
  }

  const grouped = {};
  data.forEach((r) => {
    const lbl = (r.date instanceof Date && !isNaN(r.date)) ? r.date.toLocaleDateString("en-US") : (r.dateRaw || "Unknown");
    const key = r.exporter + "_" + lbl;

    if (!grouped[key]) {
      grouped[key] = { exporter: r.exporter, date: lbl, tariffs: [], weighted: [], tv: [], aff: [], share: [], line: [] };
    }
    grouped[key].tariffs.push(r.tariff);
    grouped[key].weighted.push(r.tariff * r.tradeValue);
    grouped[key].tv.push(r.tradeValue);
    grouped[key].aff.push(r.affectedTv);
    grouped[key].share.push(r.share);
    grouped[key].line.push(r.lineShare);
  });

  const rows = Object.values(grouped);
  const $tbody = $target.find("tbody");
  const isISIC = mode === "isic";

  rows.forEach((g) => {
    if (isISIC) {
      const affSharePct  = weightedSharePercent(g.share, g.tv);
      const lineSharePct = avg(g.line.map(normalizeFraction)) * 100 || 0;
      $tbody.append(`
        <tr>
          <td>${g.exporter}</td>
          <td>${g.date}</td>
          <td>${toFixedSafe(avg(g.tariffs), 2)}</td>
          <td>${toFixedSafe(weightedAvg(g.weighted, g.tv), 2)}</td>
          <td>${toFixedSafe(sum(g.aff), 0)}</td>
          <td>${toFixedSafe(affSharePct, 2)}%</td>
          <td>${toFixedSafe(lineSharePct, 2)}%</td>
        </tr>
      `);
    } else {
      $tbody.append(`
        <tr>
          <td>${g.exporter}</td>
          <td>${g.date}</td>
          <td>${toFixedSafe(avg(g.tariffs), 2)}</td>
          <td>${toFixedSafe(weightedAvg(g.weighted, g.tv), 2)}</td>
          <td>${toFixedSafe(sum(g.aff), 0)}</td>
          <td>100%</td>
          <td>100%</td>
        </tr>
      `);
    }
  });

  $target.DataTable({ pageLength: 5, autoWidth: false, deferRender: true });
}
function ensureHeader7Cols(selector) {
  const table = document.querySelector(selector);
  if (!table) return;
  const thead = table.querySelector("thead") || table.createTHead();
  const ths = thead.querySelectorAll("th");
  if (ths.length === 7) return;
  thead.innerHTML = `
    <tr>
      <th>Partner</th>
      <th>Date</th>
      <th>Simple Avg Tariff</th>
      <th>Weighted Avg Tariff</th>
      <th>Affected Trade (Thousand USD)</th>
      <th>Affected Trade Share</th>
      <th>Affected HS6 Tariff Line Share</th>
    </tr>
  `;
}

// =============================================================
// EO Section
// =============================================================
function updateEO(mode, data, importer, exporters, isicC, hs6C, from, to) {
  lastEOArgs = [mode, data, importer, exporters, isicC, hs6C, from, to];

  const div = document.getElementById("eoContent");
  if (!div) return;

  const clsTxt = mode === "isic" ? `ISIC ${isicC || "All"}` : `HS6 ${hs6C || "All"}`;
  const expTxt = exporters.length === 0 ? "World"
    : (exporters.length === 1 ? exporters[0] : `${exporters.length} exporters`);

  let dt = "All Dates";
  if (from || to) {
    const f = from ? from.toLocaleDateString("en-US") : "…";
    const t = to ? to.toLocaleDateString("en-US") : "…";
    dt = `${f} → ${t}`;
  }

  let html = `
    <p><strong>Importer:</strong> ${escapeHtml(importer || "")}</p>
    <p><strong>Exporter:</strong> ${escapeHtml(expTxt)}</p>
    <p><strong>Classification:</strong> ${escapeHtml(clsTxt)}</p>
    <p><strong>Date Range:</strong> ${escapeHtml(dt)}</p>
  `;

  if (mode === "hs6") {
    const eoSource = (data && data.length) ? data : hs6TariffData;
    const eoNames = uniqueNonEmpty((eoSource || []).map(r => String(r.eo_name || "").trim()));
    const scopes  = uniqueNonEmpty((eoSource || []).map(r => String(r.applied_scope || "").trim()));
    const namesWithIcons = eoNames.length
      ? eoNames.map(n => `${escapeHtml(n)}${eoIconAnchor(n)}`).join(", ")
      : "—";
    const scopeStr = scopes.length ? escapeHtml(scopes.join(", ")) : "—";
    html += `
      <p><strong>EO Name:</strong> ${namesWithIcons}</p>
      <p><strong>Applied Scope:</strong> ${scopeStr}</p>
    `;
  }

  div.innerHTML = html;
}

// =============================================================
// Populate dropdowns (core UI)
// =============================================================
function populateIsic(importer) {
  const sel = document.getElementById("isicSelect");
  if (!sel) return;
  sel.innerHTML = "<option value=''>All</option>";
  const set = {};
  const sourceData = importer === WORLD_IMPORTER_VALUE
    ? isicTariffData
    : isicTariffData.filter((r) => r.importer === importer);
  sourceData.forEach((r) => { if (r.code) set[r.code] = true; });
  Object.keys(set).sort().forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
}
function populateIsicExporters(importer, optionalData) {
  const box = document.getElementById("exporterBox");
  if (!box) return;
  box.innerHTML = "";
  const set = {};
  const sourceData = optionalData ||
    (importer === WORLD_IMPORTER_VALUE
      ? isicTariffData
      : isicTariffData.filter((r) => r.importer === importer));
  sourceData.forEach((r) => { if (r.exporter) set[r.exporter] = true; });
  const arr = Object.keys(set).sort();
  if (!arr.length) { resetExporterDisplay("No exporters found"); return; }
  arr.forEach((exp) => {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.classList.add("exporter-checkbox"); cb.value = exp;
    cb.addEventListener("change", updateExporterDisplay);
    label.appendChild(cb); label.appendChild(document.createTextNode(" " + exp));
    box.appendChild(label);
  });
  resetExporterDisplay("World (All Exporters)");
}
function populateHs6(importer) {
  const sel = document.getElementById("hs6Select");
  if (!sel) return;
  sel.innerHTML = "<option value=''>All</option>";
  const set = {};
  const sourceData = importer === WORLD_IMPORTER_VALUE
    ? hs6TariffData
    : hs6TariffData.filter((r) => r.importer === importer);
  sourceData.forEach((r) => { if (r.code) set[r.code] = true; });
  Object.keys(set).sort().forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
}
function populateHs6Exporters(importer, optionalData) {
  const box = document.getElementById("exporterBox");
  if (!box) return;
  box.innerHTML = "";
  const set = {};
  const sourceData = optionalData ||
    (importer === WORLD_IMPORTER_VALUE
      ? hs6TariffData
      : hs6TariffData.filter((r) => r.importer === importer));
  sourceData.forEach((r) => { if (r.exporter) set[r.exporter] = true; });
  const arr = Object.keys(set).sort();
  if (!arr.length) { resetExporterDisplay("No exporters found"); return; }
  arr.forEach((exp) => {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.classList.add("exporter-checkbox"); cb.value = exp;
    cb.addEventListener("change", updateExporterDisplay);
    label.appendChild(cb); label.appendChild(document.createTextNode(" " + exp));
    box.appendChild(label);
  });
  resetExporterDisplay("World (All Exporters)");
}

// =============================================================
// Importer / Classification changes
// =============================================================
function importerChanged() {
  const importer = document.getElementById("importerSelect").value;
  let cls = document.getElementById("classSelect").value;

  resetExporterDisplay("Select Classification First");
  disableCodeDropdowns();
  clearExporterList();
  const isicSel = document.getElementById("isicSelect");
  const hs6Sel = document.getElementById("hs6Select");
  if (isicSel) isicSel.value = "";
  if (hs6Sel) hs6Sel.value = "";

  if (importer === WORLD_IMPORTER_VALUE) {
    resetExporterDisplay("World (All Exporters)");
    if (!cls) { document.getElementById("classSelect").value = "hs6"; cls = "hs6"; }

    if (cls === "isic") {
      enableIsicOnly();
      populateIsic(WORLD_IMPORTER_VALUE);
      populateIsicExporters(WORLD_IMPORTER_VALUE);
    } else {
      enableHs6Only();
      populateHs6(WORLD_IMPORTER_VALUE);
      populateHs6Exporters(WORLD_IMPORTER_VALUE);
    }
    applyFilters();
    return;
  }

  if (importer && cls) {
    if (cls === "isic") {
      enableIsicOnly();
      populateIsic(importer);
      populateIsicExporters(importer);
    } else if (cls === "hs6") {
      enableHs6Only();
      populateHs6(importer);
      populateHs6Exporters(importer);
    }
    applyFilters();
  } else {
    document.getElementById("classSelect").value = "";
  }
}
function clearExporterList() {
  const box = document.getElementById("exporterBox");
  if (box) box.innerHTML = "";
}
function classificationChanged() {
  const importer = document.getElementById("importerSelect").value;
  const cls = document.getElementById("classSelect").value;

  clearExporterList();
  disableCodeDropdowns();

  if (cls === "isic") {
    enableIsicOnly();
    populateIsic(importer || WORLD_IMPORTER_VALUE);
    populateIsicExporters(importer || WORLD_IMPORTER_VALUE);
  } else if (cls === "hs6") {
    enableHs6Only();
    populateHs6(importer || WORLD_IMPORTER_VALUE);
    populateHs6Exporters(importer || WORLD_IMPORTER_VALUE);
  } else {
    return;
  }

  applyFilters();
}

// =============================================================
// Enable / Disable code dropdowns
// =============================================================
function disableCodeDropdowns() {
  const isic = document.getElementById("isicSelect");
  const hs6  = document.getElementById("hs6Select");
  if (isic) isic.disabled = true;
  if (hs6) hs6.disabled = true;
  if (isic) isic.value = "";
  if (hs6) hs6.value = "";
}
function enableIsicOnly() {
  const isic = document.getElementById("isicSelect");
  const hs6 = document.getElementById("hs6Select");
  if (isic) isic.disabled = false;
  if (hs6) hs6.disabled = true;
}
function enableHs6Only() {
  const isic = document.getElementById("isicSelect");
  const hs6 = document.getElementById("hs6Select");
  if (isic) isic.disabled = true;
  if (hs6) hs6.disabled = false;
}

// =============================================================
// Helpers
// =============================================================
function uniqueNonEmpty(arr) {
  const seen = new Set(), out = [];
  for (const v of arr || []) {
    const s = (v || "").trim();
    if (!s) continue;
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}
function escapeHtml(s) {
  return String(s)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}
function avg(a) {
  return a && a.length ? a.reduce((x,y)=>x+(Number(y)||0),0)/a.length : 0;
}
function sum(a) {
  return (a||[]).reduce((x,y)=>x+(Number(y)||0),0);
}
function weightedAvg(wv, tv) {
  const n = Math.min(wv.length, tv.length);
  let sw = 0, st = 0;
  for (let i=0;i<n;i++){
    const w=Number(wv[i])||0, t=Number(tv[i])||0;
    sw+=w; st+=t;
  }
  return st ? sw/st : 0;
}
function normalizeFraction(v) {
  const n = Number(v) || 0;
  return n > 1 ? n/100 : n;
}
function weightedSharePercent(shares, tv) {
  const n = Math.min(shares.length, tv.length);
  let num = 0, den = 0;
  for (let i=0;i<n;i++){
    const s = normalizeFraction(shares[i]);
    const t = Number(tv[i])||0;
    num += s*t; den += t;
  }
  return den ? (num/den)*100 : 0;
}
function toFixedSafe(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(d) : (0).toFixed(d);
}

