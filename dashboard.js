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

  // === STEP 1 — Extract unique dates from FILTERED data ===
  var dateMap = {};

  for (var i = 0; i < data.length; i++) {
    var d = data[i];
    var dateStr = d.date_eff.toLocaleDateString("en-US");

    if (!dateMap[dateStr]) {
      dateMap[dateStr] = [];
    }
    dateMap[dateStr].push(d.applied_tariff);
  }

  // === STEP 2 — Build trend arrays ===
  var trendDates = [];
  var trendValues = [];

  var sortedKeys = Object.keys(dateMap).sort(function(a, b) {
    return new Date(a) - new Date(b);
  });

  for (var j = 0; j < sortedKeys.length; j++) {
    var k = sortedKeys[j];
    var arr = dateMap[k];
    var avg = arr.reduce(function(a, b){ return a + b; }, 0) / arr.length;

    trendDates.push(k);        // category axis label
    trendValues.push(avg);     // tariff
  }

  // === STEP 3 — Build trace ===
  var trace = {
    x: trendDates,             // category axis ensures ALL labels shown
    y: trendValues,
    mode: "lines+markers",
    line: { shape: "hv", width: 3, color: "#003366" },
    marker: { size: 8, color: "#003366" }
  };

  // === STEP 4 — CATEGORY AXIS to force ALL labels ===
  var layout = {
    title: "Tariff Trend by Date",
    xaxis: {
      title: "Date",
      type: "category",        // << this forces every date to show
      tickangle: -45,
      tickmode: "array",
      tickvals: trendDates,
      ticktext: trendDates
    },
    yaxis: { title: "Tariff (%)" },
    font: { family: "Georgia, serif", size: 14 },
    showlegend: false,
    plot_bgcolor: "#fff",
    paper_bgcolor: "#fff"
  };

  Plotly.newPlot("tariffChart", [trace], layout);
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
        "<td>100%</td>" +
        "<td>100%</td>" +
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


