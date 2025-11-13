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
      date_eff: new Date(row.date_eff),   // MM/DD/YY format
      applied_tariff: parseFloat(row.applied_tariff || 0),
      imports_value_usd: parseFloat(row.imports_value_usd || 0),
    }));

    console.log("Rows loaded:", tariffData.length);

    populateDropdowns();

    // === Default view: last 6 months ===
    const today = new Date();
    const past6Months = new Date();
    past10Months.setMonth(today.getMonth() - 10);
    document.getElementById("dateFrom").valueAsDate = past6Months;
    document.getElementById("dateTo").valueAsDate = today;

    applyFilters(); // Initial graph + summary table

  } catch (error) {
    console.error("Error loading CSV:", error);
    document.getElementById("tariffChart").innerHTML =
      "<p style='color:red'>Failed to load tariff data. Check CSV link.</p>";
  }
}

// ========================================================
// POPULATE DROPDOWNS
// ========================================================
function populateDropdowns() {
  // Importer always fixed
  document.getElementById("importerSelect").innerHTML =
    `<option value="United States" selected>United States</option>`;

  const exporters = [...new Set(tariffData.map(d => d.exporter.trim()))].sort();
  const products = [...new Set(tariffData.map(d => d.product.trim()))].sort();

  populateSelect("exporterSelect", exporters, "World");
  populateSelect("productSelect", products, "All");
}

function populateSelect(id, values, defaultLabel = "All") {
  const select = document.getElementById(id);
  if (!select) return;

  select.innerHTML = `<option value="">${defaultLabel}</option>` +
    values.map(v => `<option value="${v}">${v}</option>`).join("");
}

// ========================================================
// APPLY FILTERS (Daily trend, no aggregation)
// ========================================================
function applyFilters() {
  const importer = document.getElementById("importerSelect").value;
  const exporter = document.getElementById("exporterSelect").value;
  const product  = document.getElementById("productSelect").value;
  const dateFrom = document.getElementById("dateFrom").value;
  const dateTo   = document.getElementById("dateTo").value;

  const startDate = dateFrom ? new Date(dateFrom) : null;
  const endDate   = dateTo   ? new Date(dateTo)   : null;

  const filtered = tariffData.filter(d => {
    const sameImporter = !importer || d.importer === importer;
    const sameExporter = !exporter || d.exporter.trim() === exporter.trim();
    const sameProduct  = !product  || d.product === product;

    const inRange =
      (!startDate || d.date_eff >= startDate) &&
      (!endDate   || d.date_eff <= endDate);

    return sameImporter && sameExporter && sameProduct && inRange;
  });

  // === Daily trend, group by unique date ===
  const grouped = aggregateByDate(filtered);

  drawChart(grouped);
  updateSummary(filtered);
}

// ========================================================
// AGGREGATE BY DATE (one dot per date)
// ========================================================
function aggregateByDate(data) {
  const map = {};

  data.forEach(d => {
    const dateKey = d.date_eff.toLocaleDateString("en-US"); // exact MM/DD/YYYY

    if (!map[dateKey]) {
      map[dateKey] = {
        date_eff: d.date_eff,
        tariffs: [],
        values: []
      };
    }

    map[dateKey].tariffs.push(d.applied_tariff);
    map[dateKey].values.push(d.imports_value_usd);
  });

  return Object.values(map)
    .map(g => ({
      date_eff: g.date_eff,
      applied_tariff: g.tariffs.reduce((a,b)=>a+b,0) / g.tariffs.length
    }))
    .sort((a,b)=>a.date_eff - b.date_eff);
}

// ========================================================
// DRAW PLOTLY CHART (Trend line only, single point per date)
// ========================================================
function drawChart(data) {
  if (data.length === 0) {
    Plotly.newPlot("tariffChart", [], { title: "No data available" });
    return;
  }

  const trace = {
    x: data.map(d => d.date_eff.toLocaleDateString("en-US")),
    y: data.map(d => d.applied_tariff),
    mode: "lines+markers",         // trend line + point
    name: "Tariff Trend (%)",
    marker: { size: 7, color: "#003366" },
    line: { width: 3, color: "#003366" }
  };

  const layout = {
    title: "Applied Tariff Trend Over Time",
    xaxis: { title: "Date" },
    yaxis: { title: "Tariff (%)" },
    font: { family: "Georgia" }
  };

  Plotly.newPlot("tariffChart", [trace], layout);
}

// ========================================================
// SUMMARY TABLE (with robust fix for DataTables)
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
  const product  = document.getElementById("productSelect").value || "All products";

  summaryTitle.textContent = `${importer} imports from ${exporter} — ${product}`;

  // Clean text normalization
  const clean = (x) => x?.trim().toLowerCase().normalize("NFKC").replace(/\s+/g, " ") || "";

  const exporterClean = clean(exporter);

  // Filter only that exporter if not World
  let filteredData = data;
  if (exporterClean !== "") {
    filteredData = data.filter(d => clean(d.exporter) === exporterClean);
  }

  if (filteredData.length === 0) {
    tbody.innerHTML = "<tr><td colspan='7'>No matching data for this selection</td></tr>";
    return;
  }

  // Group data by exporter + date
  const grouped = {};
  filteredData.forEach(d => {
    const dateKey = d.date_eff.toLocaleDateString("en-US");
    const key = `${clean(d.exporter)}_${dateKey}`;

    if (!grouped[key]) {
      grouped[key] = {
        exporter: d.exporter.trim(),
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

  // === FIX: FULL TABLE REBUILD ===
  if ($.fn.DataTable.isDataTable("#summaryTable")) {
    $('#summaryTable').DataTable().destroy();
    $('#summaryTable').empty();
    $('#summaryTable').html(`
      <thead>
        <tr>
          <th>Partner</th>
          <th>Date (MM/DD/YYYY)</th>
          <th>Simple Avg Tariff</th>
          <th>Weighted Avg Tariff</th>
          <th>Affected Trade (USD)</th>
          <th>Affected Trade Share</th>
          <th>Affected Tariff Line Share</th>
        </tr>
      </thead>
      <tbody></tbody>
    `);
  }

  const newTbody = document.querySelector("#summaryTable tbody");
  newTbody.innerHTML = summaryRows.map(r => `
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

  // === Initialize DataTable again ===
  $("#summaryTable").DataTable({
    pageLength: 5,
    order: [[1, "asc"]],
  });
}

// === EVENT LISTENER ===
document.getElementById("applyFilters").addEventListener("click", applyFilters);

// === INITIALIZE ===
loadCSV();

