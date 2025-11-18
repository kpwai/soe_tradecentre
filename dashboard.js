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
    applyFilters(true); // initial load

  } catch (error) {
    console.error("Error loading CSV:", error);
    document.getElementById("tariffChart").innerHTML =
      "<p style='color:red'> Failed to load tariff data.</p>";
  }
}

// ========================================================
// POPULATE CONTROLS
// ========================================================
function populateDropdowns() {
  // Importer fixed to United States
  document.getElementById("importerSelect").innerHTML =
    "<option value='United States' selected>United States</option>";

  // Exporters
  var exporters = Array.from(
    new Set(tariffData.map(d => d.exporter))
  ).sort();

  populateExporterCheckboxes(exporters);

  // Products
  var products = Array.from(
    new Set(tariffData.map(d => d.product))
  ).sort();

  populateSelect("productSelect", products, "All");
}

function populateSelect(id, values, defaultLabel) {
  var html = "<option value=''>" + defaultLabel + "</option>";
  for (var i = 0; i < values.length; i++) {
    html += "<option value='" + values[i] + "'>" + values[i] + "</option>";
  }
  document.getElementById(id).innerHTML = html;
}

// ========================================================
// EXPORTER CHECKBOX DROPDOWN
// ========================================================
function populateExporterCheckboxes(exporters) {
  var box = document.getElementById("exporterBox");
  box.innerHTML = "";

  // "World" checkbox (default)
  box.innerHTML +=
    "<label><input type='checkbox' id='exporter_world' checked> World (All exporters)</label>";

  exporters.forEach(exp => {
    box.innerHTML +=
      "<label><input type='checkbox' class='expCheck' value='" + exp + "'> " + exp + "</label>";
  });

  var worldCheck = document.getElementById("exporter_world");
  var otherChecks = document.querySelectorAll(".expCheck");

  // WORLD handler
  worldCheck.addEventListener("change", function () {
    if (this.checked) {
      document.querySelectorAll(".expCheck").forEach(c => c.checked = false);
    }
    updateExporterDisplay();
  });

  // Individual exporter handlers
  otherChecks.forEach(c => {
    c.addEventListener("change", function () {
      if (this.checked) {
        worldCheck.checked = false;
      } else {
        // No exporter → fallback to WORLD
        if (!document.querySelector(".expCheck:checked")) {
          worldCheck.checked = true;
        }
      }
      updateExporterDisplay();
    });
  });

  // Initialize display text
  updateExporterDisplay();
}

// Update display text for dropdown
function updateExporterDisplay() {
  const world = document.getElementById("exporter_world").checked;
  const checks = document.querySelectorAll(".expCheck:checked");

  if (world) {
    document.querySelector("#exporterDisplay span").textContent =
      "World (All exporters)";
    return;
  }

  if (checks.length === 0) {
    document.querySelector("#exporterDisplay span").textContent =
      "Select exporters…";
    return;
  }

  const names = Array.from(checks).map(c => c.value);
  document.querySelector("#exporterDisplay span").textContent =
    names.length > 3 ? names.slice(0, 3).join(", ") + "…" : names.join(", ");
}

// Helper: Get selected exporters
function getSelectedExporters() {
  if (document.getElementById("exporter_world").checked) {
    return ["WORLD"];
  }

  var checks = document.querySelectorAll(".expCheck:checked");
  var arr = Array.from(checks).map(c => c.value);

  if (arr.length === 0) return ["WORLD"];
  return arr;
}

// ========================================================
// APPLY FILTERS
// ========================================================
function applyFilters(isInitial) {
  var importer = "United States";
  var exporters = getSelectedExporters();
  var worldMode = (exporters.length === 1 && exporters[0] === "WORLD");

  var product = document.getElementById("productSelect").value;
  var df = document.getElementById("dateFrom").value;
  var dt = document.getElementById("dateTo").value;

  var start = df ? new Date(df) : null;
  var end = dt ? new Date(dt) : null;

  var filtered = tariffData.filter(function(d) {
    if (d.importer !== importer) return false;
    if (product && d.product !== product) return false;

    if (!worldMode) {
      if (!exporters.includes(d.exporter)) return false;
    }

    if (!isInitial) {
      if (start && d.date_eff < start) return false;
      if (end && d.date_eff > end) return false;
    }

    return true;
  });

  drawChart(filtered, exporters, worldMode);
  updateSummary(filtered, exporters, worldMode);
}

// ========================================================
// CHART — TRUE DATE SCALING & MULTI-EXPORTER
// ========================================================
function drawChart(data, exporters, worldMode) {
  var chartDiv = document.getElementById("tariffChart");

  if (!data || data.length === 0) {
    Plotly.newPlot(chartDiv, [], { title: "No Data" });
    return;
  }

  var traces = [];

  // WORLD MODE (aggregated)
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
        allDates.push(new Date(key));
        allLabels.push(key);

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

    var layout = {
      title: "Tariff Trend – World",
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
    };

    Plotly.newPlot(chartDiv, traces, layout);
    return;
  }

  // MULTI-EXPORTER MODE
  var dateSet = new Set();
  data.forEach(d => dateSet.add(d.date_eff.toLocaleDateString("en-US")));

  var allLabels = Array.from(dateSet).sort((a,b) => new Date(a) - new Date(b));
  var allDates = allLabels.map(label => new Date(label));

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
        x.push(new Date(label));
        y.push(avg);
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

  var layout = {
    title: "Tariff Trends – Selected Exporters",
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
  };

  Plotly.newPlot(chartDiv, traces, layout);
}

// ========================================================
// SUMMARY TABLE
// ========================================================
function updateSummary(data, exporters, worldMode) {
  var tbody = document.querySelector("#summaryTable tbody");
  var summaryTitle = document.getElementById("summary-title");

  if (!data || data.length === 0) {
    tbody.innerHTML = "<tr><td colspan='7'>No data available</td></tr>";
    summaryTitle.textContent = "";
    return;
  }

  let exporterLabel = worldMode ? "World (All exporters)" : exporters.join(", ");
  let product = document.getElementById("productSelect").value || "All products";

  summaryTitle.textContent =
    "United States imports from " + exporterLabel + " — " + product;

  var grouped = {};

  data.forEach(d => {
    var dateKey = d.date_eff.toLocaleDateString("en-US");
    var key = d.exporter + "_" + dateKey;

    if (!grouped[key]) {
      grouped[key] = {
        exporter: d.exporter,
        date: dateKey,
        tariffs: [],
        weightedTariffs: [],
        values: []
      };
    }

    grouped[key].tariffs.push(d.applied_tariff);
    grouped[key].weightedTariffs.push(d.applied_tariff * d.imports_value_usd);
    grouped[key].values.push(d.imports_value_usd);
  });

  var html = "";

  Object.values(grouped).forEach(g => {
    var simpleAvg = g.tariffs.reduce((a,b)=>a+b,0) / g.tariffs.length;
    var totalTrade = g.values.reduce((a,b)=>a+b,0);
    var weightedAvg =
      g.weightedTariffs.reduce((a,b)=>a+b,0) / (totalTrade || 1);

    html += `
      <tr>
        <td>${g.exporter}</td>
        <td>${g.date}</td>
        <td>${simpleAvg.toFixed(3)}</td>
        <td>${weightedAvg.toFixed(3)}</td>
        <td>${totalTrade.toFixed(3)}</td>
        <td></td>
        <td></td>
      </tr>`;
  });

  if ($.fn.DataTable.isDataTable("#summaryTable")) {
    $("#summaryTable").DataTable().destroy();
  }

  tbody.innerHTML = html;

  $("#summaryTable").DataTable({
    pageLength: 5,
    order: [[1, "asc"]]
  });
}

// ========================================================
// EVENT LISTENERS
// ========================================================
document.getElementById("applyFilters").addEventListener("click", function() {
  applyFilters(false);
});

// Collapsible exporter dropdown
document.getElementById("exporterDisplay").addEventListener("click", function () {
  const panel = document.getElementById("exporterBox");
  panel.style.display = (panel.style.display === "block") ? "none" : "block";
});

// Close dropdown when clicking outside
document.addEventListener("click", function(e) {
  const box = document.getElementById("exporterBox");
  const display = document.getElementById("exporterDisplay");
  if (!display.contains(e.target) && !box.contains(e.target)) {
    box.style.display = "none";
  }
});

// ========================================================
// INITIALIZE DASHBOARD
// ========================================================
loadCSV();


