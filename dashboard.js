// ========================================================
// Trade Model (CP) Equilibrium Dashboard (FINAL VERSION)
// Daily data + WTO-style Step Chart + Change Point Markers
// ========================================================

// === CONFIGURATION ===
const dataPath = "data/tariff_data.csv";  // Path to your CSV file

// === GLOBAL VARIABLES ===
let tariffData = [];

// === LOAD CSV ===
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

    // Parse dataset (daily, no aggregation)
    tariffData = results.data.map(row => ({
      importer: row.importer?.trim() || "",
      exporter: row.exporter?.trim() || "",
      product: row.product?.trim() || "",
      date_eff: parseMDY(row.date_eff),  // converts M/D/YY → Date()
      applied_tariff: parseFloat(row.applied_tariff || 0),
      imports_value_usd: parseFloat(row.imports_value_usd || 0),
    }));

    console.log("Rows loaded:", tariffData.length);
    populateDropdowns();

    // Default: show full dataset
    applyFilters();

  } catch (error) {
    console.error("Error loading CSV:", error);
    document.getElementById("tariffChart").innerHTML =
      "<p style='color:red'>Failed to load tariff data. Check CSV path or network.</p>";
  }
}

// === Parse Date in M/D/YY or M/D/YYYY format ===
function parseMDY(str) {
  if (!str) return null;
  const parts = str.split("/");
  let m = parseInt(parts[0]);
  let d = parseInt(parts[1]);
  let y = parseInt(parts[2]);
  if (y < 100) y = 2000 + y; // Convert YY → YYYY
  return new Date(y, m - 1, d);
}

// === POPULATE DROPDOWNS ===
function populateDropdowns() {
  // Importer fixed to United States
  document.getElementById("importerSelect").innerHTML =
    `<option value="United States" selected>United States</option>`;

  const exporters = [...new Set(tariffData.map(d => d.exporter))].sort();
  const products = [...new Set(tariffData.map(d => d.product))].sort();

  populateSelect("exporterSelect", exporters, "World");
  populateSelect("productSelect", products, "All");
}

// === Populate select dropdown ===
function populateSelect(id, values, defaultLabel = "All") {
  const select = document.getElementById(id);
  select.innerHTML = `<option value="">${defaultLabel}</option>` +
    values.map(v => `<option value="${v}">${v}</option>`).join('');
}

// === APPLY FILTERS (Always Daily Data) ===
function applyFilters() {
  const importer = document.getElementById("importerSelect").value;
  const exporter = document.getElementById("exporterSelect").value;
  const product = document.getElementById("productSelect").value;
  const dateFrom = document.getElementById("dateFrom").value;
  const dateTo = document.getElementById("dateTo").value;

  const startDate = dateFrom ? new Date(dateFrom) : null;
  const endDate = dateTo ? new Date(dateTo) : null;

  let filtered = tariffData.filter(d => {
    const matchImporter = !importer || d.importer === importer;
    const matchExporter = !exporter || d.exporter === exporter;
    const matchProduct = !product || d.product === product;

    const inRange =
      (!startDate || d.date_eff >= startDate) &&
      (!endDate || d.date_eff <= endDate);

    return matchImporter && matchExporter && matchProduct && inRange;
  });

  // Always show daily data
  drawStepChart(filtered);
  updateSummary(filtered);
}

// ========================================================
// === WTO-STYLE STEP CHART (HIGHLIGHT CHANGE POINTS) =====
// ========================================================
function drawStepChart(data) {
  if (data.length === 0) {
    Plotly.newPlot("tariffChart", [], { title: "No data available" });
    return;
  }

  // Sort by date
  data.sort((a, b) => a.date_eff - b.date_eff);

  // Find tariff change points
  const changePoints = [];
  let prevTariff = null;

  data.forEach(d => {
    if (prevTariff === null || d.applied_tariff !== prevTariff) {
      changePoints.push(d);
    }
    prevTariff = d.applied_tariff;
  });

  // STEP LINE
  const stepTrace = {
    x: data.map(d => d.date_eff),
    y: data.map(d => d.applied_tariff),
    mode: "lines",
    line: {
      shape: "hv",           // Horizontal-Vertical (Step)
      width: 3,
      color: "#003366"
    },
    name: "Applied Tariff (%)",
  };

  // POINTS ONLY AT CHANGE MOMENTS
  const markerTrace = {
    x: changePoints.map(d => d.date_eff),
    y: changePoints.map(d => d.applied_tariff),
    mode: "markers",
    marker: {
      size: 10,
      color: "#ffcc00",
      line: { color: "#003366", width: 2 }
    },
    name: "Tariff Change"
  };

  /*
  // === IMPORT VALUE LINE (TEMPORARILY HIDDEN) ===
  const valueTrace = {
    x: data.map(d => d.date_eff),
    y: data.map(d => d.imports_value_usd),
    mode: "lines+markers",
    name: "Import Value (USD)",
    yaxis: "y2",
    line: { width: 2, dash: "dot", color: "#ff9900" }
  };
  */

  const layout = {
    title: "Tariff Change Over Time",
    xaxis: {
      title: "Date",
      tickformat: "%b %d, %Y",
      showgrid: true,
      gridcolor: "#eee"
    },
    yaxis: {
      title: "Applied Tariff (%)",
      rangemode: "tozero",
      showgrid: true,
      gridcolor: "#eee"
    },
    plot_bgcolor: "#fff",
    paper_bgcolor: "#fff",
    font: { family: "Georgia, serif", color: "#003366" },
    legend: { orientation: "h", x: 0.25, y: -0.3 }
  };

  // Plot only tariff lines (import value hidden for now)
  Plotly.newPlot("tariffChart", [stepTrace, markerTrace], layout);
}

// ========================================================
// SUMMARY TABLE (Daily, No Aggregation)
// ========================================================
function updateSummary(data) {
  const tbody = document.querySelector("#summaryTable tbody");
  const title = document.getElementById("summary-title");

  if (!data || data.length === 0) {
    tbody.innerHTML = "<tr><td colspan='7'>No data available</td></tr>";
    title.textContent = "";
    return;
  }

  const importer = "United States";
  const exporter = document.getElementById("exporterSelect").value || "World";
  const product = document.getElementById("productSelect").value || "All products";

  title.textContent = `${importer} imports from ${exporter} — ${product}`;

  // Group by exporter + exact date
  const grouped = {};

  data.forEach(d => {
    const dateKey = d.date_eff.toLocaleDateString("en-US");
    const key = `${d.exporter}_${dateKey}`;

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

  const rows = Object.values(grouped).map(g => {
    const simpleAvg = g.tariffs.reduce((a, b) => a + b, 0) / g.tariffs.length;
    const totalValue = g.values.reduce((a, b) => a + b, 0);
    const weightedAvg =
      g.weightedTariffs.reduce((a, b) => a + b, 0) / (totalValue || 1);

    return `
      <tr>
        <td>${g.exporter}</td>
        <td>${g.date}</td>
        <td>${simpleAvg.toFixed(3)}</td>
        <td>${weightedAvg.toFixed(3)}</td>
        <td>${totalValue.toFixed(3)}</td>
        <td>100%</td>
        <td>100%</td>
      </tr>
    `;
  });

  tbody.innerHTML = rows.join("");

  if ($.fn.DataTable.isDataTable("#summaryTable")) {
    $("#summaryTable").DataTable().destroy();
  }

  $("#summaryTable").DataTable({
    pageLength: 5,
    order: [[1, "asc"]]
  });
}

// === EVENT LISTENER ===
document.getElementById("applyFilters").addEventListener("click", applyFilters);

// === INITIALIZE ===
loadCSV();
