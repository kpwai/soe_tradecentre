// /js/app.js

// =============================================================
// Disable DataTables automatic popups
// =============================================================
$.fn.dataTable.ext.errMode = "none";

// =============================================================
// File paths
// =============================================================
const EXPORTER_PATH   = "data/exporters.csv";
const ISIC_CODES_PATH = "data/isic4_2_product_name.csv"; 
const HS6_CODES_PATH  = "data/hs6code.csv";
const ISIC_TARIFF_PATH= "data/isic2tariff.csv";
const HS6_TARIFF_PATH = "data/hs6tariff.csv";

// =============================================================
// Globals
// =============================================================
let exporterList = [];
let isicCodes = [];
let hs6Codes = [];

let isicTariffData = [];
let hs6TariffData = [];

let isicLoaded = false;
let hs6Loaded = false;

const WORLD_IMPORTER_VALUE = "World";

// =============================================================
// DOM READY
// =============================================================
document.addEventListener("DOMContentLoaded", () => {
  setupExporterDropdown();

  document.getElementById("exporterBox").innerHTML = "";
  resetExporterDisplay("Loading Data...");

  loadExporters(() => {
    loadIsicCodes(() => {
      loadHs6Codes(() => {
        loadTariff(ISIC_TARIFF_PATH, "isic", () => {
          loadTariff(HS6_TARIFF_PATH, "hs6", () => {
            isicLoaded = true;
            hs6Loaded = true;

            document.getElementById("importerSelect").addEventListener("change", importerChanged);
            document.getElementById("classSelect").addEventListener("change", classificationChanged);
            document.getElementById("applyFilters").addEventListener("click", applyFilters);

            initialLoadAndRender();
          });
        });
      });
    });
  });
});

// =============================================================
// INITIAL LOAD FUNCTION
// =============================================================
function initialLoadAndRender() {
  document.getElementById("importerSelect").value = WORLD_IMPORTER_VALUE;
  document.getElementById("classSelect").value = "hs6";
  disableCodeDropdowns();

  const initialData = hs6TariffData;
  const initialClass = "hs6";

  populateHs6Exporters(WORLD_IMPORTER_VALUE, initialData);
  drawChart(initialData, [], true, initialClass, null);
  updateSummary(initialClass, initialData);
  updateEO(initialClass, initialData, WORLD_IMPORTER_VALUE, [], "", "", null, null);

  enableHs6Only();
  populateHs6(WORLD_IMPORTER_VALUE);
}

// =============================================================
// Exporter MULTI SELECT dropdown (UI behavior)
// =============================================================
function setupExporterDropdown() {
  const disp = document.getElementById("exporterDisplay");
  const panel = document.getElementById("exporterBox");

  disp.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.style.display = panel.style.display === "block" ? "none" : "block";
  });

  document.addEventListener("click", () => (panel.style.display = "none"));
  panel.addEventListener("click", (e) => e.stopPropagation());
}

function resetExporterDisplay(text) {
  document.getElementById("exporterDisplayText").textContent = text;
}

function updateExporterDisplay() {
  const cbs = document.querySelectorAll(".exporter-checkbox:checked");
  const txt = document.getElementById("exporterDisplayText");
  if (!cbs.length) txt.textContent = "World (All Exporters)";
  else if (cbs.length === 1) txt.textContent = cbs[0].value;
  else txt.textContent = `${cbs.length} exporters selected`;
}

// =============================================================
// Load supporting CSV lists
// =============================================================
function loadExporters(callback) {
  Papa.parse(EXPORTER_PATH, {
    download: true,
    header: true,
    complete: (res) => {
      const seen = {};
      exporterList = [];
      res.data.forEach((r) => {
        const e = (r.exporter || "").trim();
        if (e && !seen[e]) { seen[e] = true; exporterList.push(e); }
      });
      exporterList.sort();
      if (callback) callback();
    },
  });
}

function loadIsicCodes(callback) {
  Papa.parse(ISIC_CODES_PATH, {
    download: true,
    header: true,
    complete: (res) => {
      const seen = {};
      isicCodes = [];
      res.data.forEach((r) => {
        const raw = (r.isic4_2 || "").trim(); 
        const two = normalizeIsic(raw);
        if (two && !seen[two]) { seen[two] = true; isicCodes.push(two); }
      });
      isicCodes.sort();
      if (callback) callback();
    },
  });
}

function loadHs6Codes(callback) {
  Papa.parse(HS6_CODES_PATH, {
    download: true,
    header: true,
    complete: (res) => {
      const seen = {};
      hs6Codes = [];
      res.data.forEach((r) => {
        const code = (r.hs6code || "").trim();
        if (code && !seen[code]) { seen[code] = true; hs6Codes.push(code); }
      });
      hs6Codes.sort();
      if (callback) callback();
    },
  });
}

function normalizeIsic(raw) {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (d.length >= 2) return d.slice(0, 2);
  return d.padStart(2, "0");
}

// =============================================================
// Load tariff datasets
// =============================================================
function loadTariff(path, mode, callback) {
  Papa.parse(path, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: (res) => {
      const out = [];
      res.data.forEach((row) => {
        const d = new Date(row.date_eff);
        if (isNaN(d.getTime())) return;

        const importer = (row.importer || "").trim();
        const exporter = (row.exporter || "").trim();
        const tariff = parseFloat(row.tariffs || 0) || 0;

        const importsK = parseFloat(row.importsvaluein1000usd || 0) || 0;
        const tradeValue = importsK * 1000;

        const code = mode === "isic" ? normalizeIsic(row.isic4_2 || "") : (row.hs6 || "").trim();

        // Keep raw shares as-is (fraction 0..1 or percent 0..100)
        const share     = parseFloat(row.affected_trade_share || 0) || 0;
        const lineShare = parseFloat(row.affected_hs6tariff_line_share || 0) || 0;

        const affectedTv = parseFloat(row.affected_trade_value || 0) || 0;

        out.push({
          importer, exporter, code, date: d,
          tariff, tradeValue, affectedTv, share, lineShare,
        });
      });

      if (mode === "isic") isicTariffData = out;
      else hs6TariffData = out;

      if (callback) callback();
    },
  });
}

// =============================================================
// Importer / Classification Change Handlers
// =============================================================
function importerChanged() {
  const importer = document.getElementById("importerSelect").value;
  let cls = document.getElementById("classSelect").value;

  resetExporterDisplay("Select Classification First");
  disableCodeDropdowns();
  clearExporterList();
  document.getElementById("isicSelect").value = "";
  document.getElementById("hs6Select").value = "";

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
  document.getElementById("exporterBox").innerHTML = "";
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
// Dropdown Enable/Disable
// =============================================================
function disableCodeDropdowns() {
  const isic = document.getElementById("isicSelect");
  const hs6  = document.getElementById("hs6Select");

  isic.disabled = true;
  hs6.disabled = true;

  isic.value = "";
  hs6.value = "";
}

function enableIsicOnly() {
  document.getElementById("isicSelect").disabled = false;
  document.getElementById("hs6Select").disabled = true;
}

function enableHs6Only() {
  document.getElementById("isicSelect").disabled = true;
  document.getElementById("hs6Select").disabled = false;
}

// =============================================================
// Populate Dropdowns
// =============================================================
function populateIsic(importer) {
  const sel = document.getElementById("isicSelect");
  sel.innerHTML = "<option value=''>All</option>";

  const set = {};
  const sourceData = importer === WORLD_IMPORTER_VALUE ? isicTariffData : isicTariffData.filter((r) => r.importer === importer);
  sourceData.forEach((r) => { if (r.code) set[r.code] = true; });

  Object.keys(set).sort().forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
}

function populateIsicExporters(importer, optionalData) {
  const box = document.getElementById("exporterBox");
  box.innerHTML = "";

  const set = {};
  const sourceData = optionalData || (importer === WORLD_IMPORTER_VALUE ? isicTariffData : isicTariffData.filter((r) => r.importer === importer));
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
  sel.innerHTML = "<option value=''>All</option>";

  const set = {};
  const sourceData = importer === WORLD_IMPORTER_VALUE ? hs6TariffData : hs6TariffData.filter((r) => r.importer === importer);
  sourceData.forEach((r) => { if (r.code) set[r.code] = true; });

  Object.keys(set).sort().forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
}

function populateHs6Exporters(importer, optionalData) {
  const box = document.getElementById("exporterBox");
  box.innerHTML = "";

  const set = {};
  const sourceData = optionalData || (importer === WORLD_IMPORTER_VALUE ? hs6TariffData : hs6TariffData.filter((r) => r.importer === importer));
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
// APPLY FILTERS
// =============================================================
function applyFilters() {
  const importer = document.getElementById("importerSelect").value || WORLD_IMPORTER_VALUE;
  const cls = document.getElementById("classSelect").value;

  const isicC = document.getElementById("isicSelect").value;
  const hs6C  = document.getElementById("hs6Select").value;

  if (!cls) { alert("Please select classification."); return; }

  const from = document.getElementById("dateFrom").value ? new Date(document.getElementById("dateFrom").value) : null;
  const to   = document.getElementById("dateTo").value   ? new Date(document.getElementById("dateTo").value)   : null;

  const selectedExp = [];
  document.querySelectorAll(".exporter-checkbox:checked").forEach((x) => selectedExp.push(x.value));
  const worldMode = selectedExp.length === 0;

  const base = cls === "isic" ? isicTariffData : hs6TariffData;

  const filtered = base.filter((r) => {
    if (r.date && isNaN(r.date.getTime())) return false;
    if (importer !== WORLD_IMPORTER_VALUE && r.importer !== importer) return false;
    if (cls === "isic" && isicC && isicC !== "" && r.code !== isicC) return false;
    if (cls === "hs6" && hs6C && hs6C !== "" && r.code !== hs6C) return false;
    if (!worldMode && !selectedExp.includes(r.exporter)) return false;
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    return true;
  });

  const selectedCode =
    cls === "hs6" && hs6C ? `HS6 Tariff Line ${hs6C}` :
    cls === "isic" && isicC ? `ISIC4 2 Digit Tariff Line ${isicC}` :
    cls === "hs6" ? "HS6 Tariff Line" : "ISIC4 2 Digit Tariff Line";

  drawChart(filtered, selectedExp, worldMode, cls, selectedCode);
  updateSummary(cls, filtered);
  updateEO(cls, filtered, importer, selectedExp, isicC, hs6C, from, to);
}

// =============================================================
// DRAW CHART
// =============================================================
function drawChart(data, exporters, worldMode, classification, codeTitle) {
  const chartDiv = document.getElementById("tariffChartMain");

  if (!data || data.length === 0) {
    Plotly.newPlot(chartDiv, [], { title: "No Data" });
    return;
  }

  const traces = [];
  const chartTitle = codeTitle
    ? `${codeTitle}`
    : worldMode
      ? (classification === "isic" ? "ISIC4 2 Digit Tariff Line" : "HS6 Tariff Line")
      : "Tariff Lines – Selected Exporters";

  if (worldMode) {
    const grouped = {};
    data.forEach((d) => {
      const ds = d.date.toLocaleDateString("en-US");
      if (!grouped[ds]) grouped[ds] = [];
      grouped[ds].push(d.tariff);
    });

    const allDates = [];
    const allLabels = [];
    const allValues = [];

    Object.keys(grouped).sort((a, b) => new Date(a) - new Date(b)).forEach((key) => {
      allDates.push(new Date(key));
      allLabels.push(key);
      const arr = grouped[key];
      const avgVal = arr.reduce((a, b) => a + b, 0) / arr.length;
      allValues.push(avgVal);
    });

    traces.push({ x: allDates, y: allValues, mode: "lines+markers", name: "World", line: { shape: "hv", width: 3 }, marker: { size: 8 } });

    const layout = {
      title: chartTitle,
      xaxis: { title: "Date", type: "date", tickmode: "array", tickvals: allDates, ticktext: allLabels, tickangle: -45 },
      yaxis: { title: "Tariff (%)" },
      font: { family: "Georgia, serif", size: 12 },
      plot_bgcolor: "#fff",
      paper_bgcolor: "#fff",
      showlegend: false
    };

    Plotly.newPlot(chartDiv, traces, layout);
    return;
  }

  const dateSet = new Set();
  data.forEach((d) => dateSet.add(d.date.toLocaleDateString("en-US")));
  const allLabels = Array.from(dateSet).sort((a, b) => new Date(a) - new Date(b));
  const allDates = allLabels.map((label) => new Date(label));

  exporters.forEach((exp) => {
    const rows = data.filter((d) => d.exporter === exp);
    if (rows.length === 0) return;

    const dailyMap = {};
    rows.forEach((d) => {
      const ds = d.date.toLocaleDateString("en-US");
      if (!dailyMap[ds]) dailyMap[ds] = [];
      dailyMap[ds].push(d.tariff);
    });

    const x = [], y = [];
    allLabels.forEach((label) => {
      if (dailyMap[label]) {
        const arr = dailyMap[label];
        const avgVal = arr.reduce((a, b) => a + b, 0) / arr.length;
        x.push(new Date(label));
        y.push(avgVal);
      }
    });

    traces.push({ x, y, mode: "lines+markers", name: exp, line: { shape: "hv", width: 3 }, marker: { size: 8 } });
  });

  const layout = {
    title: chartTitle,
    xaxis: { title: "Date", type: "date", tickmode: "array", tickvals: allDates, ticktext: allLabels, tickangle: -45 },
    yaxis: { title: "Tariff (%)" },
    font: { family: "Georgia, serif", size: 12 },
    plot_bgcolor: "#fff",
    paper_bgcolor: "#fff",
    showlegend: true
  };

  Plotly.newPlot(chartDiv, traces, layout);
}

// =============================================================
// SUMMARY TABLE (ISIC computes shares; HS6 last two cols = 100%)
// =============================================================
function updateSummary(mode, data) {
  const $isic = $("#summaryTableISIC");
  const $hs6  = $("#summaryTableHS6");

  // teardown (keep table nodes)
  if ($.fn.DataTable.isDataTable($isic)) $isic.DataTable().clear().destroy();
  if ($.fn.DataTable.isDataTable($hs6))  $hs6.DataTable().clear().destroy();

  // normalize DOM (remove stale styles, ensure tbody)
  [$isic, $hs6].forEach(($t) => {
    if (!$t || !$t.length) return;
    if ($t.find("tbody").length === 0) $t.append("<tbody></tbody>");
    $t.find("tbody")[0].innerHTML = "";

    $t.removeAttr("style");
    $t.find("thead, tbody, tr, th, td").each(function () { this.removeAttribute("style"); });

    $t.find("thead").css("display", "table-header-group");
    $t.find("tbody").css("display", "table-row-group");
  });

  // enforce 7 headers on both tables
  ensureHeader7Cols("#summaryTableISIC");
  ensureHeader7Cols("#summaryTableHS6");

  const $target = mode === "isic" ? $isic : $hs6;
  const $other  = mode === "isic" ? $hs6  : $isic;

  $other.hide();
  $target.show();

  if (!data || !data.length) {
    $target.DataTable({ pageLength: 5, autoWidth: false, deferRender: true });
    return;
  }

  // group by (exporter,date)
  const grouped = {};
  data.forEach((r) => {
    const dkey = r.date.toLocaleDateString("en-US");
    const key  = r.exporter + "_" + dkey;

    if (!grouped[key]) {
      grouped[key] = {
        exporter: r.exporter,
        date: dkey,
        tariffs: [],
        weighted: [],
        tv: [],
        aff: [],
        share: [],
        line: [],
      };
    }

    grouped[key].tariffs.push(r.tariff);
    grouped[key].weighted.push(r.tariff * r.tradeValue);
    grouped[key].tv.push(r.tradeValue);
    grouped[key].aff.push(r.affectedTv);
    grouped[key].share.push(r.share);       // affected_trade_share
    grouped[key].line.push(r.lineShare);    // affected_hs6tariff_line_share
  });

  const rows = Object.values(grouped);
  const $tbody = $target.find("tbody");

  const isISIC = mode === "isic";
  rows.forEach((g) => {
    if (isISIC) {
      const affSharePct  = weightedSharePercent(g.share, g.tv);                 // 0..100
      const lineSharePct = avg(g.line.map(normalizeFraction)) * 100 || 0;       // 0..100

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
      // HS6: last two columns are 100%
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

  $target.DataTable({
    pageLength: 5,
    autoWidth: false,
    deferRender: true,
  });
}

// Ensure target table has a 7-col header
function ensureHeader7Cols(selector) {
  const table = document.querySelector(selector);
  if (!table) return;
  const thead = table.querySelector("thead") || table.createTHead();
  const ths = thead.querySelectorAll("th");
  if (ths.length === 7) return;
  thead.innerHTML = `
    <tr>
      <th>Exporter</th>
      <th>Date</th>
      <th>Avg Tariff (%)</th>
      <th>Weighted Avg Tariff (%)</th>
      <th>Affected Trade Value (USD)</th>
      <th>Affected Trade Share (%)</th>
      <th>Affected Tariff Line Share (%)</th>
    </tr>
  `;
}

// =============================================================
// EO SECTION
// =============================================================
function updateEO(mode, data, importer, exporters, isicC, hs6C, from, to) {
  const div = document.getElementById("eoContent");

  if (!data.length) {
    div.innerHTML = "<p>No EO-related data.</p>";
    return;
  }

  const clsTxt = mode === "isic" ? `ISIC ${isicC || "All"}` : `HS6 ${hs6C || "All"}`;
  const expTxt = exporters.length === 0 ? "World" : (exporters.length === 1 ? exporters[0] : `${exporters.length} exporters`);

  let dt = "All Dates";
  if (from || to) {
    const f = from ? from.toLocaleDateString("en-US") : "…";
    const t = to ? to.toLocaleDateString("en-US") : "…";
    dt = `${f} → ${t}`;
  }

  const eoCount = data.filter((x) => x.affectedTv > 0).length;

  div.innerHTML = `
    <p><strong>Importer:</strong> ${importer}</p>
    <p><strong>Exporter:</strong> ${expTxt}</p>
    <p><strong>Classification:</strong> ${clsTxt}</p>
    <p><strong>Date Range:</strong> ${dt}</p>
    <p><strong>EO-related actions:</strong> ${eoCount}</p>
  `;
}

// =============================================================
// Helpers (math + formatting)
// =============================================================
function avg(a) { return a && a.length ? a.reduce((x, y) => x + (Number(y)||0), 0) / a.length : 0; }
function sum(a) { return (a || []).reduce((x, y) => x + (Number(y)||0), 0); }
function weightedAvg(wv, tv) {
  const n = Math.min(wv.length, tv.length);
  let sw = 0, st = 0;
  for (let i = 0; i < n; i++) { const w = Number(wv[i])||0, t = Number(tv[i])||0; sw += w; st += t; }
  return st ? sw / st : 0;
}
// Accepts fraction (0..1) or percent (0..100) and returns fraction
function normalizeFraction(v) { const n = Number(v) || 0; return n > 1 ? n / 100 : n; }
// Weighted share (0..100) from affected_trade_share using trade values
function weightedSharePercent(shares, tv) {
  const n = Math.min(shares.length, tv.length);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const s = normalizeFraction(shares[i]);
    const t = Number(tv[i]) || 0;
    num += s * t; den += t;
  }
  return den ? (num / den) * 100 : 0;
}
function toFixedSafe(v, d) { const n = Number(v); return Number.isFinite(n) ? n.toFixed(d) : (0).toFixed(d); }
