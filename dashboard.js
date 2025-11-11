// ========================================================
// Trade Model (CP) Equilibrium Dashboard
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

    tariffData = results.data.map(row => ({
      importer: row.importer?.trim() || "",
      exporter: row.exporter?.trim() || "",
      product: row.product?.trim() || "",
      date_eff: new Date(row.date_eff),  // expects month/day/year format
      applied_tariff: parseFloat(row.applied_tariff || 0),
      imports_value_usd: parseFloat(row.imports_value_usd || 0),
    }));

    console.log("Rows loaded:", tariffData.length);
    populateDropdowns();

    // === Default view: show last 6 months ===
    const today = new Date();
    const past6Months = new Date();
    past6Months.setMonth(today.getMonth() - 6);
    document.getElementById("dateFrom").valueAsDate = past6Months;
    document.getElementById("dateTo").valueAsDate = today;

    applyFilters();  // Automatically show last 6 months of data

  } catch (error) {
    console.error("Error loading CSV:", error);
    document.getElementById("tariffChart").innerHTML =
      "<p style='color:red'>⚠️ Failed to load tariff data. Please check the CSV link or your internet connection.</p>";
  }
}

// === POPULATE DROPDOWNS ===
function populateDropdowns() {
  // Importer fixed to United States
  const importerSelect = document.getElementById("importerSelect");
  if (importerSelect) {
    importerSelect.innerHTML = `<option value="United States" selected>United States</option>`;
  }

  const exporters = [...new Set(tariffData.map(d => d.exporter))];
  const products  = [...new Set(tariffData.map(d => d.product))];

  populateSelect("exporterSelect", exporters, "World");
  populateSelect("productSelect", products, "All");
}

// === POPULATE SELECT DROPDOWN ===
function populateSelect(id, values, defaultLabel = "All") {
  const select = document.getElementById(id);
  if (!select) return;

  select.innerHTML = `<option value="">${defaultLabel}</option>` +
    values.map(v => `<option value="${v}">${v}</option>`).join('');
}

// === APPLY FILTERS (with range + monthly aggregation) ===
function applyFilters() {
  const importer = document.getElementById("importerSelect").value;
  const exporter = document.getElementById("exporterSelect").value;
  const product  = document.getElementById("productSelect").value;
  const dateFrom = document.getElementById("dateFrom").value;
  const dateTo   = document.getElementById("dateTo").value;

  // Convert YYYY-MM-DD → M/D/YYYY to match CSV format
  const startDate = dateFrom ? new Date(`${dateFrom.split("-")[1]}/${dateFrom.split("-")[2]}/${dateFrom.split("-")[0]}`) : null;
  const endDate   = dateTo   ? new Date(`${dateTo.split("-")[1]}/${dateTo.split("-")[2]}/${dateTo.split("-")[0]}`) : null;

  const filtered = tariffData.filter(d => {
    const sameImporter = !importer || d.importer === importer;
    const sameExporter = !exporter || d.exporter === exporter;
    const sameProduct  = !product  || d.product === product;

    const inRange =
      (!startDate || d.date_eff >= startDate) &&
      (!endDate || d.date_eff <= endDate);

    return sameImporter && sameExporter && sameProduct && inRange;
  });

  // If range > 3 months, aggregate monthly averages for smoother chart
  const rangeMonths = startDate && endDate ? 
    (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()) : 0;

  if (rangeMonths > 3) {
    const monthlyAggregated = aggregateByMonth(filtered);
    drawChart(monthlyAggregated, true);  // true = aggregated mode
  } else {
    drawChart(filtered, false);
  }

  updateSummary(filtered);
}

// === AGGREGATE DATA BY MONTH ===
function aggregateByMonth(data) {
  const monthlyGroups = {};

  data.forEach(d => {
    const key = `${d.date_eff.getFullYear()}-${String(d.date_eff.getMonth()+1).padStart(2, "0")}`;
    if (!monthlyGroups[key]) {
      monthlyGroups[key] = { 
        date: new Date(d.date_eff.getFullYear(), d.date_eff.getMonth(), 1),
        tariffs: [],
        weightedTariffs: [],
        values: []
      };
    }
    monthlyGroups[key].tariffs.push(d.applied_tariff);
    monthlyGroups[key].weightedTariffs.push(d.applied_tariff * d.imports_value_usd);
    monthlyGroups[key].values.push(d.imports_value_usd);
  });

  return Object.values(monthlyGroups).map(g => {
    const simpleAvg = g.tariffs.reduce((a,b)=>a+b,0) / g.tariffs.length;
    const totalValue = g.values.reduce((a,b)=>a+b,0);
    const weightedAvg = g.weightedTariffs.reduce((a,b)=>a+b,0) / (totalValue || 1);

    return {
      date_eff: g.date,
      applied_tariff: simpleAvg,
      imports_value_usd: totalValue
    };
  }).sort((a,b)=>a.date_eff - b.date_eff);
}

// === DRAW PLOTLY CHART ===
function drawChart(data, isAggregated = false) {
  if (data.length === 0) {
    Plotly.newPlot("tariffChart", [], { title: "No data available" });
    return;
  }

  const trace1 = {
    x: data.map(d => d.date_eff),
    y: data.map(d => d.applied_tariff),
    mode: "lines+markers",
    name: isAggregated ? "Avg Tariff per Month (%)" : "Applied Tariff (%)",
    yaxis: "y1",
    marker: { size: 6 },
    line: { width: 3, color: "#003366" }
  };

  const trace2 = {
    x: data.map(d => d.date_eff),
    y: data.map(d => d.imports_value_usd),
    mode: "lines+markers",
    name: isAggregated ? "Total Import Value per Month (USD)" : "Import Value (USD)",
    yaxis: "y2",
    marker: { size: 6 },
    line: { width: 2, dash: "dot", color: "#ff9900" }
  };

  const layout = {
    title: isAggregated
      ? "Monthly Average Tariff & Total Import Value"
      : "Applied Tariff & Import Value Over Time",
    xaxis: { title: isAggregated ? "Month" : "Date" },
    yaxis: { title: "Applied Tariff (%)", side: "left" },
    yaxis2: {
      title: "Import Value (USD)",
      overlaying: "y",
      side: "right"
    },
    legend: { orientation: "h", x: 0.25, y: -0.2 },
    plot_bgcolor: "#fff",
    paper_bgcolor: "#fff"
  };

  Plotly.newPlot("tariffChart", [trace1, trace2], layout);
}

// === SUMMARY TABLE ===
function updateSummary(data) {
  const tbody = document.querySelector("#summaryTable tbody");
  const summaryTitle = document.getElementById("summary-title");

  // Handle empty dataset
  if (!data || data.length === 0) {
    tbody.innerHTML = "<tr><td colspan='7'>No data available</td></tr>";
    summaryTitle.textContent = "";
    return;
  }

  // Read the current filter selections
  const importer = document.getElementById("importerSelect").value || "United States";
  const exporter = document.getElementById("exporterSelect").value || "";
  const product  = document.getElementById("productSelect").value || "All products";

  // Set the summary title
  const exporterLabel = exporter === "" ? "World" : exporter;
  summaryTitle.textContent = `${importer} imports from ${exporterLabel} — ${product}`;

  // --- Filter data strictly for selected exporter (unless "World") ---
  let filteredData = data;
  if (exporter && exporter.toLowerCase() !== "world") {
    filteredData = data.filter(d => d.exporter === exporter);
  }

  // --- Group by exporter and date ---
  const grouped = {};
  filteredData.forEach(d => {
    const key = `${d.exporter}_${d.date_eff.toLocaleDateString()}`;
    if (!grouped[key]) grouped[key] = {
      exporter: d.exporter,
      date: d.date_eff.toLocaleDateString(),
      tariffs: [],
      weightedTariffs: [],
      values: []
    };
    grouped[key].tariffs.push(d.applied_tariff);
    grouped[key].weightedTariffs.push(d.applied_tariff * d.imports_value_usd);
    grouped[key].values.push(d.imports_value_usd);
  });

  // --- Calculate summary metrics ---
  const summaryRows = Object.values(grouped).map(g => {
    const simpleAvg = g.tariffs.reduce((a, b) => a + b, 0) / g.tariffs.length;
    const totalTrade = g.values.reduce((a, b) => a + b, 0);
    const tradeWeighted = g.weightedTariffs.reduce((a, b) => a + b, 0) / (totalTrade || 1);

    return {
      partner: g.exporter,
      date: g.date,
      simpleAvg: simpleAvg.toFixed(3),
      tradeWeighted: tradeWeighted.toFixed(3),
      tradeValue: totalTrade.toFixed(3),
      tradeShare: "100%",
      tariffLineShare: "100%"
    };
  });

  // --- Rebuild the table body ---
  tbody.innerHTML = summaryRows.map(r => `
    <tr>
      <td>${r.partner}</td>
      <td>${r.date}</td>
      <td>${r.simpleAvg}</td>
      <td>${r.tradeWeighted}</td>
      <td>${r.tradeValue}</td>
      <td>${r.tradeShare}</td>
      <td>${r.tariffLineShare}</td>
    </tr>
  `).join("");

  // --- Reinitialize DataTable cleanly ---
  if ($.fn.DataTable.isDataTable("#summaryTable")) {
    $("#summaryTable").DataTable().clear().destroy();
  }

  $("#summaryTable").DataTable({
    pageLength: 5,
    order: [[1, "asc"]],
  });
}

// === EVENT LISTENER ===
document.getElementById("applyFilters").addEventListener("click", applyFilters);

// === INITIALIZE ===
loadCSV();


