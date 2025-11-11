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
      date_eff: new Date(row.date_eff),
      applied_tariff: parseFloat(row.applied_tariff || 0),
      imports_value_usd: parseFloat(row.imports_value_usd || 0),
    }));

    console.log("Rows loaded:", tariffData.length);
    populateDropdowns();
    drawChart(tariffData);
    updateSummary(tariffData);

  } catch (error) {
    console.error("Error loading CSV:", error);
    document.getElementById("tariffChart").innerHTML =
      "<p style='color:red'>⚠️ Failed to load tariff data. Please check the CSV link or your internet connection.</p>";
  }
}
/*
// === POPULATE DROPDOWNS ===
function populateDropdowns() {
  const importers = [...new Set(tariffData.map(d => d.importer))];
  const exporters = [...new Set(tariffData.map(d => d.exporter))];
  const products  = [...new Set(tariffData.map(d => d.product))];
  const dates     = [...new Set(
    tariffData.map(d => d.date_eff.toLocaleDateString())
  )].sort((a, b) => new Date(a) - new Date(b));

  populateSelect("importerSelect", importers);
  populateSelect("exporterSelect", exporters);
  populateSelect("productSelect", products);
  populateSelect("dateSelect", dates); // New dropdown for dates
}

function populateSelect(id, values) {
  const select = document.getElementById(id);
  if (!select) return;
  select.innerHTML = '<option value="">All</option>' +
    values.map(v => `<option value="${v}">${v}</option>`).join('');
}*/

// === POPULATE DROPDOWNS ===
function populateDropdowns() {
  // Importer will always be 'United States' (fixed)
  const importerSelect = document.getElementById("importerSelect");
  if (importerSelect) {
    importerSelect.innerHTML = `<option value="United States" selected>United States</option>`;
  }

  // Populate Exporter, Product, and Date normally
  const exporters = [...new Set(tariffData.map(d => d.exporter))];
  const products  = [...new Set(tariffData.map(d => d.product))];
  const dates     = [...new Set(
    tariffData.map(d => d.date_eff.toLocaleDateString())
  )].sort((a, b) => new Date(a) - new Date(b));

  populateSelect("exporterSelect", exporters, "World");
  populateSelect("productSelect", products, "All");
  populateSelect("dateSelect", dates, "All");
}

// === POPULATE SELECT DROPDOWN ===
function populateSelect(id, values, defaultLabel = "All") {
  const select = document.getElementById(id);
  if (!select) return;

  // Replace "All" with "World" for exporter dropdown
  select.innerHTML = `<option value="">${defaultLabel}</option>` +
    values.map(v => `<option value="${v}">${v}</option>`).join('');
}

// === APPLY FILTERS ===
function applyFilters() {
  const importer = document.getElementById("importerSelect").value;
  const exporter = document.getElementById("exporterSelect").value;
  const product  = document.getElementById("productSelect").value;
  const date_eff = document.getElementById("dateSelect").value;

  const filtered = tariffData.filter(d =>
    (!importer || d.importer === importer) &&
    (!exporter || d.exporter === exporter) &&
    (!product || d.product === product) &&
    (!date_eff || d.date_eff.toLocaleDateString() === date_eff)
  );

  drawChart(filtered);
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

// === SUMMARY TABLE (WTO-style Details) ===
function updateSummary(data) {
  const tbody = document.querySelector("#summaryTable tbody");
  const summaryTitle = document.getElementById("summary-title");

  if (data.length === 0) {
    tbody.innerHTML = "<tr><td colspan='7'>No data available</td></tr>";
    summaryTitle.textContent = "";
    return;
  }

  const importer = document.getElementById("importerSelect").value || "All importers";
  const exporter = document.getElementById("exporterSelect").value || "World";
  const product = document.getElementById("productSelect").value || "All products";

  summaryTitle.textContent = `${importer} imports from ${exporter} — ${product}`;

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
      tradeShare: "100%",
      tariffLineShare: "100%"
    };
  });

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

  if ($.fn.DataTable.isDataTable("#summaryTable")) {
    $("#summaryTable").DataTable().destroy();
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

