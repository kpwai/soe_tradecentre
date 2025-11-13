// ========================================================
// Trade Model (CP) Equilibrium Dashboard — Trend Version
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

    tariffData = results.data.map(row => ({
      importer: row.importer?.trim() || "",
      exporter: row.exporter?.trim() || "",
      product: row.product?.trim() || "",
      date_eff: new Date(row.date_eff), // expects M/D/Y format
      applied_tariff: parseFloat(row.applied_tariff || 0),
      imports_value_usd: parseFloat(row.imports_value_usd || 0),
    }));

    console.log("Rows loaded:", tariffData.length);

    populateDropdowns();
    applyFilters(true); // Initial load = full history

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
  // Importer fixed to United States
  const importerSelect = document.getElementById("importerSelect");
  importerSelect.innerHTML = `<option value="United States" selected>United States</option>`;

  // Populate exporters
  const exporters = [...new Set(tariffData.map(d => d.exporter))].sort();
  populateSelect("exporterSelect", exporters, "World");

  // Populate product codes
  const products = [...new Set(tariffData.map(d => d.product))].sort();
  populateSelect("productSelect", products, "All");
}

function populateSelect(id, values, defaultLabel) {
  const select = document.getElementById(id);
  select.innerHTML =
    `<option value="">${defaultLabel}</option>` +
    values.map(v => `<option value="${v}">${v}</option>`).join("");
}

// ========================================================
// APPLY FILTERS
// ========================================================
function applyFilters(isInitial = false) {
  const importer = "United States"; // always fixed
  const exporter = document.getElementById("exporterSelect").value;
  const product = document.getElementById("productSelect").value;
  const dateFrom = document.getElementById("dateFrom").value;
  const dateTo = document.getElementById("dateTo").value;

  let startDate = dateFrom ? new Date(dateFrom) : null;
  let endDate = dateTo ? new Date(dateTo) : null;

  const filtered = tariffData.filter(d => {
    const matchImporter = d.importer === importer;
    const matchExporter = !exporter || d.exporter === exporter;
    const matchProduct = !product || d.product === product;

    let inRange = true;

    if (isInitial) {
      inRange = true; // full history
    } else if (startDate && endDate) {
      inRange = d.date_eff >= startDate && d.date_eff <= endDate;
    } else if (startDate && !endDate) {
      inRange = d.date_eff >= startDate;
    } else if (!startDate && endDate) {
      inRange = d.date_eff <= endDate;
    }

    return matchImporter && matchExporter && matchProduct && inRange;
  });

  drawChart(filtered, exporter, product);
  updateSummary(filtered);
}

// ========================================================
// BUILD TREND CHART
// ========================================================
function drawChart(data, exporter, product) {

  if (!data || data.length === 0) {
    Plotly.newPlot("tariffChart", [], { title: "No data available" });
    return;
  }

  // ---- STEP 1: Extract unique tariff-change dates (MM/DD/YYYY exactly) ----
  const changeDates = [...new Set(
    data.map(d => d.date_eff.toLocaleDateString("en-US"))
  )].sort((a, b) => new Date(a) - new Date(b));

  // ---- STEP 2: Aggregate tariff for each date ----
  const trendDates = [];
  const trendValues = [];

  changeDates.forEach(dateStr => {
    const rowsOnDate = data.filter(d =>
      d.date_eff.toLocaleDateString("en-US") === dateStr
    );

    const avgTariff = rowsOnDate.reduce((sum, d) => sum + d.applied_tariff, 0)
                      / rowsOnDate.length;

    trendDates.push(dateStr);     // label EXACTLY as MM/DD/YYYY
    trendValues.push(avgTariff);  // aggregated tariff
  });

  // ---- STEP 3: Build WTO-style trend ----
  const lineTrace = {
    x: trendDates,
    y: trendValues,
    mode: "lines+markers",
    line: {
      shape: "hv",     // step style
      width: 3,
      color: "#003366"
    },
    marker: {
      size: 8,
      color: "#003366"
    }
  };

  // ---- STEP 4: Use category axis to preserve EXACT dates ----
  const layout = {
    title: "Tariff Trend",
    xaxis: {
      title: "Date",
      type: "category",     // <-- THIS is the key
      tickangle: -45
    },
    yaxis: { title: "Tariff (%)" },
    font: { family: "Georgia, serif", size: 14 },
    showlegend: false,
    plot_bgcolor: "#fff",
    paper_bgcolor: "#fff"
  };

  Plotly.newPlot("tariffChart", [lineTrace], layout);
}

// ========================================================
// SUMMARY TABLE
// ========================================================
function updateSummary(data) {
  const tbody = document.querySelector("#summaryTable tbody");
  const summaryTitle = document.getElementById("summary-title");

  if (!data || data.length === 0) {
    tbody.innerHTML = "<tr><td colspan='7'>No data available</td></tr>";
    summaryTitle.textContent = "";
    return;
  }

  const importer = "United States";
  const exporter = document.getElementById("exporterSelect").value || "World";
  const product = document.getElementById("productSelect").value || "All products";

  summaryTitle.textContent = `${importer} imports from ${exporter} — ${product}`;

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
    const simpleAvg = g.tariffs.reduce((a,b)=>a+b,0) / g.tariffs.length;
    const totalTrade = g.values.reduce((a,b)=>a+b,0);
    const tradeWeighted = g.weightedTariffs.reduce((a,b)=>a+b,0) / (totalTrade || 1);

    return `
      <tr>
        <td>${g.exporter}</td>
        <td>${g.date}</td>
        <td>${simpleAvg.toFixed(3)}</td>
        <td>${tradeWeighted.toFixed(3)}</td>
        <td>${totalTrade.toFixed(3)}</td>
        <td>100%</td>
        <td>100%</td>
      </tr>
    `;
  });
  tbody.innerHTML = rows.join("");

  if ($.fn.DataTable.isDataTable("#summaryTable")) {
    $("#summaryTable").DataTable().clear().destroy();
  }

  $("#summaryTable").DataTable({
    pageLength: 5,
    order: [[1, "asc"]],
  });
}
// ========================================================
// EVENT LISTENER
// ========================================================
document.getElementById("applyFilters").addEventListener("click", () => applyFilters(false));

// ========================================================
// INITIALIZE DASHBOARD
// ========================================================
loadCSV();





