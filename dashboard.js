// ========================================================
// Trade Model (CP) Equilibrium Dashboard (Final WTO Style)
// ========================================================

// === CONFIGURATION ===
const dataPath = "data/tariff_data.csv";  // Path to your CSV file

// === GLOBAL VARIABLES ===
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

    // === Parse CSV rows ===
    tariffData = results.data.map(row => ({
      importer: row.importer?.trim() || "",
      exporter: row.exporter?.trim() || "",
      product: row.product?.trim() || "",
      date_eff: new Date(row.date_eff),  
      applied_tariff: parseFloat(row.applied_tariff || 0),
      imports_value_usd: parseFloat(row.imports_value_usd || 0),
    }));

    console.log("Rows loaded:", tariffData.length);

    // Populate dropdowns
    populateDropdowns();

    // === DEFAULT: World + All Products + ALL history ===
    applyFilters(true);   // true = initial load

  } catch (error) {
    console.error("Error loading CSV:", error);
    document.getElementById("tariffChart").innerHTML =
      "<p style='color:red'>⚠️ Failed to load tariff data. Check CSV or internet.</p>";
  }
}

// ========================================================
// POPULATE DROPDOWNS
// ========================================================
function populateDropdowns() {
  // Importer fixed = United States
  document.getElementById("importerSelect").innerHTML =
    `<option value="United States" selected>United States</option>`;

  const exporters = [...new Set(tariffData.map(d => d.exporter))].sort();
  const products  = [...new Set(tariffData.map(d => d.product))].sort();

  populateSelect("exporterSelect", exporters, "World");
  populateSelect("productSelect", products, "All");
}

function populateSelect(id, values, defaultLabel = "All") {
  const select = document.getElementById(id);
  select.innerHTML =
    `<option value="">${defaultLabel}</option>` +
    values.map(v => `<option value="${v}">${v}</option>`).join("");
}

// ========================================================
// APPLY FILTERS (DAILY, NO AGGREGATION)
// ========================================================
function applyFilters(isInitial = false) {
  const importer = "United States";          // fixed
  const exporter = document.getElementById("exporterSelect").value;
  const product  = document.getElementById("productSelect").value;
  const dateFrom = document.getElementById("dateFrom").value;
  const dateTo   = document.getElementById("dateTo").value;

  let filtered = tariffData.filter(d => {
    // Importer always matches
    const matchImporter = d.importer === importer;

    // World = no filtering
    const matchExporter = !exporter || d.exporter === exporter;

    // All products = no filtering
    const matchProduct = !product || d.product === product;

    let inRange = true;

    // === DEFAULT INITIAL LOAD → FULL HISTORY ===
    if (isInitial) {
      inRange = true;
    }
    // === ONLY TO DATE ===
    else if (!dateFrom && dateTo) {
      inRange = d.date_eff <= new Date(dateTo);
    }
    // === FROM + TO ===
    else if (dateFrom && dateTo) {
      inRange =
        d.date_eff >= new Date(dateFrom) &&
        d.date_eff <= new Date(dateTo);
    }
    // === ONLY FROM ===
    else if (dateFrom && !dateTo) {
      inRange = d.date_eff >= new Date(dateFrom);
    }
    // === NO DATE SELECTED ===
    else {
      inRange = true;
    }

    return matchImporter && matchExporter && matchProduct && inRange;
  });

  // SORT by real date
  filtered.sort((a, b) => a.date_eff - b.date_eff);

  drawStepChart(filtered);
  updateSummary(filtered);
}

// ========================================================
// DRAE CHART
// ========================================================
function drawChart(data) {
  if (!data || data.length === 0) {
    Plotly.newPlot("tariffChart", [], { title: "No data available" });
    return;
  }

  // Sort by date
  data.sort((a, b) => a.date_eff - b.date_eff);

  // Build step-trend: keep only points where tariff *changes*
  const trendDates = [];
  const trendValues = [];

  let lastTariff = null;

  data.forEach(d => {
    if (d.applied_tariff !== lastTariff) {
      // Add change point
      trendDates.push(d.date_eff);
      trendValues.push(d.applied_tariff);
      lastTariff = d.applied_tariff;
    }
  });

  const trace = {
    x: trendDates,
    y: trendValues,
    mode: "lines",
    line: {
      shape: "hv",       // <-- horizontal-vertical step curve (WTO style)
      width: 3,
      color: "#003366"
    },
    name: "Applied Tariff Trend"
  };

  const layout = {
    title: "Tariff Trend (Change Points Only)",
    xaxis: { title: "Date" },
    yaxis: { title: "Applied Tariff (%)" },
    plot_bgcolor: "#fff",
    paper_bgcolor: "#fff",
    showlegend: false
  };

  Plotly.newPlot("tariffChart", [trace], layout);
}

// ========================================================
// SUMMARY TABLE
// ========================================================
function updateSummary(data) {
  const tbody = document.querySelector("#summaryTable tbody");
  const summaryTitle = document.getElementById("summary-title");

  if (!data || data.length === 0) {
    tbody.innerHTML =
      "<tr><td colspan='7'>No matching data for this selection</td></tr>";
    summaryTitle.textContent = "";
    return;
  }

  const importer = "United States";
  const exporter = document.getElementById("exporterSelect").value;
  const product  = document.getElementById("productSelect").value || "All products";

  const exporterLabel = exporter ? exporter : "World";
  summaryTitle.textContent = `${importer} imports from ${exporterLabel} — ${product}`;

  // === Group by exporter + date (WTO style) ===
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

  // === Compute averages ===
  const summaryRows = Object.values(grouped).map(g => {
    const simpleAvg = g.tariffs.reduce((a, b) => a + b, 0) / g.tariffs.length;
    const totalValue = g.values.reduce((a, b) => a + b, 0);
    const weightedAvg =
      g.weightedTariffs.reduce((a, b) => a + b, 0) / (totalValue || 1);

    return {
      partner: g.exporter,
      date: g.date,
      simpleAvg: simpleAvg.toFixed(3),
      tradeWeighted: weightedAvg.toFixed(3),
      tradeValue: totalValue.toFixed(3),
      tradeShare: "100%",
      tariffLineShare: "100%"
    };
  });

  // === Populate table ===
  tbody.innerHTML = summaryRows
    .map(r => {
      return `
        <tr>
          <td>${r.partner}</td>
          <td>${r.date}</td>
          <td>${r.simpleAvg}</td>
          <td>${r.tradeWeighted}</td>
          <td>${r.tradeValue}</td>
          <td>${r.tradeShare}</td>
          <td>${r.tariffLineShare}</td>
        </tr>`;
    })
    .join("");

  // Reinitialize DataTable
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
document.getElementById("applyFilters").addEventListener("click", () => {
  applyFilters(false);
});

// ========================================================
// INIT
// ========================================================
loadCSV();

