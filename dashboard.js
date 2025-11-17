// ========================================================
// Trade Model (CP) Equilibrium Dashboard — TRUE DATE SCALING
// ========================================================

// === CONFIGURATION ===
const dataPath = "data/tariff_data.csv";

// === GLOBAL DATA STORAGE ===
let tariffData = [];

// ========================================================
// LOAD CSV
// ========================================================
async function loadCSV() {
  try {
    console.log("Fetching:", dataPath);
    const response = await fetch(dataPath);
    if (!response.ok) throw new Error("Unable to fetch data file");

    const csvText = await response.text();
    const results = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
    });

    tariffData = results.data.map(function(row) {
      return {
        importer: row.importer ? row.importer.trim() : "",
        exporter: row.exporter ? row.exporter.trim() : "",
        product: row.product ? row.product.trim() : "",
        date_eff: new Date(row.date_eff), // TRUE date object
        applied_tariff: parseFloat(row.applied_tariff || 0),
        imports_value_usd: parseFloat(row.imports_value_usd || 0),
      };
    });

    console.log("Rows loaded:", tariffData.length);

    populateDropdowns();
    applyFilters(true); // initial load = full history

  } catch (error) {
    console.error("Error loading CSV:", error);
    document.getElementById("tariffChart").innerHTML =
      "<p style='color:red'> Failed to load tariff data.</p>";
  }
}
/*
// ========================================================
// POPULATE DROPDOWNS
// ========================================================
function populateDropdowns() {
  document.getElementById("importerSelect").innerHTML =
    "<option value='United States' selected>United States</option>";
  
  var exporters = Array.from(new Set(tariffData.map(function(d){ return d.exporter; }))).sort();
  populateSelect("exporterSelect", exporters, "World");

  var products = Array.from(new Set(tariffData.map(function(d){ return d.product; }))).sort();
  populateSelect("productSelect", products, "All");
}

function populateSelect(id, values, defaultLabel) {
  var select = document.getElementById(id);

  var html = "<option value=''>" + defaultLabel + "</option>";
  for (var i = 0; i < values.length; i++) {
    html += "<option value='" + values[i] + "'>" + values[i] + "</option>";
  }
  select.innerHTML = html;
}
// ========================================================
// APPLY FILTERS
// ========================================================
function applyFilters(isInitial) {
  var importer = "United States";
  var exporter = document.getElementById("exporterSelect").value;
  var product = document.getElementById("productSelect").value;
  var dateFrom = document.getElementById("dateFrom").value;
  var dateTo = document.getElementById("dateTo").value;

  var startDate = dateFrom ? new Date(dateFrom) : null;
  var endDate = dateTo ? new Date(dateTo) : null;

  // Filter core logic
  var filtered = tariffData.filter(function(d) {
    var matchImporter = d.importer === importer;
    var matchExporter = !exporter || d.exporter === exporter;
    var matchProduct = !product || d.product === product;
    var inRange = true;

    if (!isInitial) {
      if (startDate && endDate) inRange = d.date_eff >= startDate && d.date_eff <= endDate;
      else if (startDate) inRange = d.date_eff >= startDate;
      else if (endDate) inRange = d.date_eff <= endDate;
    }

    return matchImporter && matchExporter && matchProduct && inRange;
  });

  drawChart(filtered);
  updateSummary(filtered);
}

// ========================================================
// TRUE DATE-SCALED CHART
// ========================================================
function drawChart(data) {
  if (!data || data.length === 0) {
    Plotly.newPlot("tariffChart", [], { title: "No data available" });
    return;
  }

  // === STEP 1 — Extract unique dates (real date objects) ===
  var dateMap = {};

  for (var i = 0; i < data.length; i++) {
    var d = data[i];
    var dateObj = d.date_eff;
    var dateStr = dateObj.toLocaleDateString("en-US");

    if (!dateMap[dateStr]) {
      dateMap[dateStr] = { date: dateObj, tariffs: [] };
    }
    dateMap[dateStr].tariffs.push(d.applied_tariff);
  }

  // === STEP 2 — Build sorted arrays ===
  var allDates = [];
  var allLabels = [];
  var allValues = [];

  var keys = Object.keys(dateMap).sort(function(a, b){
    return new Date(a) - new Date(b);
  });

  for (var j = 0; j < keys.length; j++) {
    var k = keys[j];
    var obj = dateMap[k];
    var avg = obj.tariffs.reduce(function(a,b){ return a+b; }, 0) / obj.tariffs.length;

    allDates.push(obj.date);     // REAL Date object
    allLabels.push(k);           // label MM/DD/YYYY
    allValues.push(avg);
  }

  // === STEP 3 — Build Plotly trace ===
  var trace = {
    x: allDates,
    y: allValues,
    mode: "lines+markers",
    line: { shape: "hv", width: 3, color: "#003366" },
    marker: { size: 8, color: "#003366" }
  };

  // === STEP 4 — TRUE DATE SCALING + FORCE ALL LABELS ===
  var layout = {
    title: "Tariff Trend",
    xaxis: {
      title: "Date",
      type: "date",
      tickmode: "array",     // force custom ticks
      tickvals: allDates,    // REAL dates for correct spacing
      ticktext: allLabels,   // MM/DD/YYYY for each dot
      tickangle: -45
    },
    yaxis: { title: "Tariff (%)" },
    font: { family: "Georgia, serif", size: 14 },
    plot_bgcolor: "#fff",
    paper_bgcolor: "#fff",
    showlegend: false
  };

  Plotly.newPlot("tariffChart", [trace], layout);
}*/
// =====================================
// POPULATE CONTROLS
// =====================================
function populateDropdowns() {
  // Importer fixed to United States
  document.getElementById("importerSelect").innerHTML =
    "<option value='United States' selected>United States</option>";

  // Exporters
  var exporters = Array.from(new Set(
    tariffData.map(function(d) { return d.exporter; })
  )).sort();

  populateExporterCheckboxes(exporters);

  // Products
  var products = Array.from(new Set(
    tariffData.map(function(d) { return d.product; })
  )).sort();

  populateSelect("productSelect", products, "All");
}

function populateSelect(id, values, defaultLabel) {
  var html = "<option value=''>" + defaultLabel + "</option>";
  for (var i = 0; i < values.length; i++) {
    html += "<option value='" + values[i] + "'>" + values[i] + "</option>";
  }
  document.getElementById(id).innerHTML = html;
}

// Build checkbox list for exporters
function populateExporterCheckboxes(exporters) {
  var box = document.getElementById("exporterBox");
  box.innerHTML = "";

  // "World" checkbox (Option A behavior)
  box.innerHTML +=
    "<label><input type='checkbox' id='exporter_world' checked> World (All exporters)</label>";

  for (var i = 0; i < exporters.length; i++) {
    var exp = exporters[i];
    box.innerHTML +=
      "<label><input type='checkbox' class='expCheck' value='" + exp + "'> " + exp + "</label>";
  }

  // World ↔ other exporters mutual exclusivity
  var worldCheck = document.getElementById("exporter_world");
  worldCheck.addEventListener("change", function() {
    if (this.checked) {
      var checks = document.querySelectorAll(".expCheck");
      for (var j = 0; j < checks.length; j++) {
        checks[j].checked = false;
      }
    }
  });

  var otherChecks = document.querySelectorAll(".expCheck");
  for (var k = 0; k < otherChecks.length; k++) {
    otherChecks[k].addEventListener("change", function() {
      if (this.checked) {
        document.getElementById("exporter_world").checked = false;
      } else {
        // If nothing else is selected, default back to World
        var anySelected = document.querySelector(".expCheck:checked");
        if (!anySelected) {
          document.getElementById("exporter_world").checked = true;
        }
      }
    });
  }
}

// Helper to get selected exporters
function getSelectedExporters() {
  var worldChecked = document.getElementById("exporter_world").checked;
  if (worldChecked) {
    return ["WORLD"];  // special flag
  }
  var checks = document.querySelectorAll(".expCheck:checked");
  var arr = [];
  for (var i = 0; i < checks.length; i++) {
    arr.push(checks[i].value);
  }
  if (arr.length === 0) {
    // Default to WORLD if nothing selected
    return ["WORLD"];
  }
  return arr;
}

// =====================================
// APPLY FILTERS
// =====================================
function applyFilters(isInitial) {
  var importer = "United States"; // fixed
  var exporters = getSelectedExporters();
  var worldMode = (exporters.length === 1 && exporters[0] === "WORLD");

  var product = document.getElementById("productSelect").value;
  var df = document.getElementById("dateFrom").value;
  var dt = document.getElementById("dateTo").value;

  var start = df ? new Date(df) : null;
  var end = dt ? new Date(dt) : null;

  var filtered = tariffData.filter(function(d) {
    // importer
    if (d.importer !== importer) return false;

    // product
    if (product && d.product !== product) return false;

    // exporter logic
    if (!worldMode) {
      if (exporters.indexOf(d.exporter) === -1) return false;
    }

    // date range
    if (!isInitial) {
      if (start && d.date_eff < start) return false;
      if (end && d.date_eff > end) return false;
    }

    return true;
  });

  drawChart(filtered, exporters, worldMode);
  updateSummary(filtered, exporters, worldMode);
}

// =====================================
// CHART (TRUE DATE SCALING + MULTI EXPORTER)
// =====================================
function drawChart(data, exporters, worldMode) {
  var chartDiv = document.getElementById("tariffChart");

  if (!data || data.length === 0) {
    Plotly.newPlot(chartDiv, [], { title: "No Data" });
    return;
  }

  var traces = [];

  // ======================================================
  // WORLD MODE (Single Aggregated Line)
  // ======================================================
  if (worldMode) {
    var grouped = {};

    data.forEach(function (d) {
      var ds = d.date_eff.toLocaleDateString("en-US");
      if (!grouped[ds]) grouped[ds] = [];
      grouped[ds].push(d.applied_tariff);
    });

    var allDates = [];
    var allLabels = [];
    var allValues = [];

    Object.keys(grouped)
      .sort((a, b) => new Date(a) - new Date(b))
      .forEach(function (key) {
        allDates.push(new Date(key));      // REAL date object
        allLabels.push(key);               // MM/DD/YYYY label

        var arr = grouped[key];
        var avg = arr.reduce((a, b) => a + b, 0) / arr.length;
        allValues.push(avg);
      });

    traces.push({
      x: allDates,
      y: allValues,
      mode: "lines+markers",
      name: "World",
      line: { shape: "hv", width: 3, color: "#003366" },
      marker: { size: 8, color: "#003366" }
    });

    // === Layout using your Tick Array logic ===
    var layout = {
      title: "Tariff Trend",
      xaxis: {
        title: "Date",
        type: "date",
        tickmode: "array",
        tickvals: allDates,     // TRUE SPACING
        ticktext: allLabels,    // EACH DATE SHOWN
        tickangle: -45
      },
      yaxis: { title: "Tariff (%)" },
      font: { family: "Georgia, serif", size: 14 },
      plot_bgcolor: "#fff",
      paper_bgcolor: "#fff",
      showlegend: false
    };

    Plotly.newPlot(chartDiv, traces, layout);
    return;
  }

  // ======================================================
  // MULTI-EXPORTER MODE (Each exporter gets its own line)
  // ======================================================

  // 1. Collect all real tariff-change dates across selected exporters
  var dateSet = new Set();
  data.forEach(d => dateSet.add(d.date_eff.toLocaleDateString("en-US")));

  var allLabels = Array.from(dateSet).sort((a, b) => new Date(a) - new Date(b));
  var allDates = allLabels.map(label => new Date(label));

  // 2. Build a trace for each exporter
  exporters.forEach(function (exp) {
    var rows = data.filter(d => d.exporter === exp);
    if (rows.length === 0) return;

    var dailyMap = {};
    rows.forEach(d => {
      var ds = d.date_eff.toLocaleDateString("en-US");
      if (!dailyMap[ds]) dailyMap[ds] = [];
      dailyMap[ds].push(d.applied_tariff);
    });

    var x = [];
    var y = [];

    allLabels.forEach(function (label) {
      if (dailyMap[label]) {
        var arr = dailyMap[label];
        var avg = arr.reduce((a, b) => a + b, 0) / arr.length;

        x.push(new Date(label));   // REAL spaced date
        y.push(avg);               // VALUE exists → dot is shown
      }
    });

    traces.push({
      x: x,
      y: y,
      mode: "lines+markers",
      name: exp,
      line: { shape: "hv", width: 3 },
      marker: { size: 8 }
    });
  });

  // === Layout using your Tick Array logic ===
  var layout = {
    title: "Exporter Comparison",
    xaxis: {
      title: "Date",
      type: "date",
      tickmode: "array",
      tickvals: allDates,    // TRUE spacing across chart
      ticktext: allLabels,   // EXACT MM/DD/YYYY text
      tickangle: -45
    },
    yaxis: { title: "Tariff (%)" },
    font: { family: "Georgia, serif", size: 14 },
    plot_bgcolor: "#fff",
    paper_bgcolor: "#fff",
    showlegend: true
  };

  Plotly.newPlot(chartDiv, traces, layout);
}
// ========================================================
// SUMMARY TABLE
// ========================================================
function updateSummary(data) {
  var tbody = document.querySelector("#summaryTable tbody");
  var summaryTitle = document.getElementById("summary-title");

  if (!data || data.length === 0) {
    tbody.innerHTML = "<tr><td colspan='7'>No data available</td></tr>";
    summaryTitle.textContent = "";
    return;
  }

  var exporter = document.getElementById("exporterSelect").value || "World";
  var product = document.getElementById("productSelect").value || "All products";
  summaryTitle.textContent = "United States imports from " + exporter + " — " + product;

  // Group rows
  var grouped = {};

  for (var i = 0; i < data.length; i++) {
    var d = data[i];
    var dateKey = d.date_eff.toLocaleDateString("en-US");
    var key = d.exporter + "_" + dateKey;

    if (!grouped[key]) {
      grouped[key] = { exporter: d.exporter, date: dateKey, tariffs: [], weightedTariffs: [], values: [] };
    }

    grouped[key].tariffs.push(d.applied_tariff);
    grouped[key].weightedTariffs.push(d.applied_tariff * d.imports_value_usd);
    grouped[key].values.push(d.imports_value_usd);
  }

  // Build HTML
  var htmlRows = "";
  var groups = Object.values(grouped);

  for (var j = 0; j < groups.length; j++) {
    var g = groups[j];

    var simpleAvg = g.tariffs.reduce(function(a, b){ return a + b; }, 0) / g.tariffs.length;
    var totalTrade = g.values.reduce(function(a, b){ return a + b; }, 0);
    var weightedAvg = g.weightedTariffs.reduce(function(a, b){ return a + b; }, 0) / (totalTrade || 1);

    htmlRows +=
      "<tr>" +
        "<td>" + g.exporter + "</td>" +
        "<td>" + g.date + "</td>" +
        "<td>" + simpleAvg.toFixed(3) + "</td>" +
        "<td>" + weightedAvg.toFixed(3) + "</td>" +
        "<td>" + totalTrade.toFixed(3) + "</td>" +
        "<td></td>" +
        "<td></td>" +
      "</tr>";
  }

  // Rebuild DataTable
  if ($.fn.DataTable.isDataTable("#summaryTable")) {
    $("#summaryTable").DataTable().destroy();
  }

  tbody.innerHTML = htmlRows;

  $("#summaryTable").DataTable({
    pageLength: 5,
    order: [[1, "asc"]]
  });
}

// ========================================================
// EVENT LISTENER
// ========================================================
document.getElementById("applyFilters").addEventListener("click", function() {
  applyFilters(false);
});

// ========================================================
// INITIALIZE DASHBOARD
// ========================================================
loadCSV();
