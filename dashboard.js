// ========================================================
// Trade Model (CP) Equilibrium Dashboard
// ========================================================

// === CONFIGURATION ===
const dataPath = "https://drive.google.com/uc?export=download&id=1KtN_bwmwOVMBy0rRQMtDRQqwMbU3ltEF&confirm=t";  // Path to your CSV file

// === GLOBAL VARIABLES ===
let tariffData = [];
let dataTable;

// === LOAD CSV ===
async function loadCSV() {
  const response = await fetch(dataPath);
  const csvText = await response.text();

  const results = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  tariffData = results.data.map(row => ({
    importer: row.importer?.trim() || "",
    exporter: row.exporter?.trim() || "",
    product: row.product?.trim() || "",
    date_eff: new Date(row.date_eff),
    applied_tariff: parseFloat(row.applied_tariff || 0),
    imports_value_usd: parseFloat(row.imports_value_usd || 0),
  }));

  populateDropdowns();
  drawChart(tariffData);
  populateTable(tariffData);
  updateSummary(tariffData);
}

// === POPULATE DROPDOWNS ===
function populateDropdowns() {
  const importers = [...new Set(tariffData.map(d => d.importer))];
  const exporters = [...new Set(tariffData.map(d => d.exporter))];
  const products  = [...new Set(tariffData.map(d => d.product))];

  populateSelect("importerSelect", importers);
  populateSelect("exporterSelect", exporters);
  populateSelect("productSelect", products);
}

function populateSelect(id, values) {
  const select = document.getElementById(id);
  select.innerHTML = '<option value="">All</option>' +
    values.map(v => `<option value="${v}">${v}</option>`).join('');
}

// === APPLY FILTERS ===
function applyFilters() {
  const importer = document.getElementById("importerSelect").value;
  const exporter = document.getElementById("exporterSelect").value;
  const product = document.getElementById("productSelect").value;

  const filtered = tariffData.filter(d =>
    (!importer || d.importer === importer) &&
    (!exporter || d.exporter === exporter) &&
    (!product || d.product === product)
  );

  drawChart(filtered);
  populateTable(filtered);
  updateSummary(filtered);
}

// === DRAW PLOTLY CHART ===
function drawChart(data) {
  if (data.length === 0) {
    Plotly.newPlot("tariffChart", [], { title: "No data available" });
    return;
  }

  data.sort((a, b) => a.date_eff - b.date_eff);

  const trace1 = {
    x: data.map(d => d.date_eff),
    y: data.map(d => d.applied_tariff),
    mode: "lines+markers",
    name: "Applied Tariff (%)",
    yaxis: "y1",
    marker: { size: 6 },
    line: { width: 3, color: "#003366" }
  };

  const trace2 = {
    x: data.map(d => d.date_eff),
    y: data.map(d => d.imports_value_usd),
    mode: "lines+markers",
    name: "Import Value (USD)",
    yaxis: "y2",
    marker: { size: 6 },
    line: { width: 2, dash: "dot", color: "#ff9900" }
  };

  const layout = {
    title: "Applied Tariff & Import Value Over Time",
    xaxis: { title: "Date" },
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

// === POPULATE FULL DATA TABLE ===
function populateTable(data) {
  const tbody = document.querySelector("#tariffTable tbody");
  if (!tbody) return;

  tbody.innerHTML = data.map(d => `
    <tr>
      <td>${d.importer}</td>
      <td>${d.exporter}</td>
      <td>${d.product}</td>
      <td>${d.date_eff.toLocaleDateString()}</td>
      <td>${d.applied_tariff.toFixed(3)}</td>
      <td>${d.imports_value_usd.toFixed(3)}</td>
    </tr>
  `).join("");

  if ($.fn.DataTable.isDataTable("#tariffTable")) {
    $("#tariffTable").DataTable().destroy();
  }
  $("#tariffTable").DataTable({
    pageLength: 5,
    order: [[3, "asc"]],
  });
}

// === SUMMARY TABLE (WTO-style Details) ===
function updateSummary(data) {
  const tbody = document.querySelector("#summaryTable tbody");
  const summaryTitle = document.getElementById("summary-title");

  if (data.length === 0) {
    tbody.innerHTML = "<tr><td colspan='7'>No data available</td></tr>";
    summaryTitle.textContent = "";
    return;
  }

  // Derive importer/exporter and product from selection
  const importer = document.getElementById("importerSelect").value || "All importers";
  const exporter = document.getElementById("exporterSelect").value || "World";
  const product = document.getElementById("productSelect").value || "All products";

  summaryTitle.textContent = `${importer} imports from ${exporter} — ${product}`;

  // Group data by partner and date
  const grouped = {};
  data.forEach(d => {
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

  // Compute summary metrics
  const summaryRows = Object.values(grouped).map(g => {
    const simpleAvg = g.tariffs.reduce((a,b)=>a+b,0) / g.tariffs.length;
    const totalTrade = g.values.reduce((a,b)=>a+b,0);
    const tradeWeighted = g.weightedTariffs.reduce((a,b)=>a+b,0) / (totalTrade || 1);

    return {
      partner: g.exporter,
      date: g.date,
      simpleAvg: simpleAvg.toFixed(3),
      tradeWeighted: tradeWeighted.toFixed(3),
      tradeValue: totalTrade.toFixed(3),
      tradeShare: "100%",          // Placeholder for now
      tariffLineShare: "100%"
    };
  });

  // Populate table
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

  // Re-initialize DataTable
  if ($.fn.DataTable.isDataTable("#summaryTable")) {
    $("#summaryTable").DataTable().destroy();
  }
  $("#summaryTable").DataTable({
    pageLength: 5,
    order: [[1, "asc"]],
  });
}

// === EVENT LISTENERS ===
document.getElementById("applyFilters").addEventListener("click", applyFilters);

// === INITIALIZE ON LOAD ===

loadCSV();
async function loadCSV() {
  try {
    const response = await fetch(dataPath);
    if (!response.ok) throw new Error("Unable to fetch data file");
    const csvText = await response.text();
    ...
  } catch (error) {
    console.error("Error loading CSV:", error);
    document.getElementById("tariffChart").innerHTML =
      "<p style='color:red'>Failed to load tariff data. Please check the Google Drive link or your internet connection.</p>";
  }
}


