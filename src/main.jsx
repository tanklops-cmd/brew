import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  Barcode,
  Beer,
  CalendarDays,
  Calculator,
  Camera,
  CheckCircle2,
  Clock3,
  ClipboardList,
  DatabaseBackup,
  Download,
  Droplets,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  Thermometer,
  TimerReset,
  Trash2,
  Waves
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import "./styles.css";

const api = (path, options) =>
  fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  }).then((response) => {
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json();
  });

const stages = ["Brew day", "Knockout", "Fermentation", "Dry hop", "Diacetyl rest", "Conditioning", "Packaging QA", "Packaged"];
const statuses = ["Planned", "Fermenting", "Conditioning", "Ready to package", "Packaged", "Archived"];
const tankStatuses = ["Available", "Cleaning", "Brew", "Fermenting", "Conditioning", "Packaging", "Maintenance"];
const brewSteps = [
  { id: "setup", label: "Setup", hint: "Confirm batch details, clean tank and prepare brew day." },
  { id: "ingredients", label: "Ingredients", hint: "Stage malt, hops, yeast and water in the correct quantities." },
  { id: "mash", label: "Mash", hint: "Run the mash schedule and monitor conversion temperature." },
  { id: "boil", label: "Wort boil", hint: "Boil wort, add hops and prepare for knockout." },
  { id: "fermentation", label: "Fermentation", hint: "Track early fermentation, temperature and gravity." },
  { id: "conditioning", label: "Conditioning", hint: "Manage conditioning and clarity before packaging." },
  { id: "packaging", label: "Packaging", hint: "Finish QA, package beer and release to stock." }
];

function App() {
  const [data, setData] = useState({ tanks: [], beers: [], batches: [], logs: [], latestLogs: [], inventoryItems: [], inventoryMovements: [], settings: {} });
  const [activeBatchId, setActiveBatchId] = useState(null);
  const [activeView, setActiveView] = useState(getInitialView);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState("");

  const loadData = () => {
    setIsLoading(true);
    api("/api/bootstrap")
      .then((payload) => {
        setData(payload);
        setActiveBatchId((current) => current || payload.settings?.selectedBatchId || payload.batches[0]?.id || null);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  const activeBatch = useMemo(
    () => data.batches.find((batch) => batch.id === Number(activeBatchId)) || data.batches[0],
    [data.batches, activeBatchId]
  );
  const activeLogs = useMemo(
    () => data.logs.filter((log) => log.batch_id === activeBatch?.id),
    [data.logs, activeBatch]
  );

  const latestByBatch = useMemo(() => {
    const map = new Map();
    data.latestLogs.forEach((log) => map.set(log.batch_id, log));
    return map;
  }, [data.latestLogs]);

  const saveLog = async (payload) => {
    await api("/api/logs", { method: "POST", body: JSON.stringify(payload) });
    setToast("Log saved");
    loadData();
    setTimeout(() => setToast(""), 2200);
  };

  const saveBatch = async (payload) => {
    const batch = await api("/api/batches", { method: "POST", body: JSON.stringify(payload) });
    setActiveBatchId(batch.id);
    await api(`/api/settings/selectedBatchId`, { method: "PATCH", body: JSON.stringify({ value: batch.id }) });
    setToast("Batch created");
    loadData();
    setTimeout(() => setToast(""), 2200);
  };

  const saveBatchProcess = async (batchId, payload) => {
    await api(`/api/batches/${batchId}/process`, { method: "PATCH", body: JSON.stringify(payload) });
    setToast("Brewing progress saved");
    loadData();
    setTimeout(() => setToast(""), 2200);
  };

  const completeBatch = async (batchId) => {
    await api(`/api/batches/${batchId}/complete`, { method: "PATCH", body: JSON.stringify({ archive_notes: "Completed from Audit" }) });
    setToast("Brew completed and archived");
    loadData();
    setTimeout(() => setToast(""), 2600);
  };

  const lookupBarcode = async (barcode) => {
    return api(`/api/inventory/barcode/${encodeURIComponent(barcode)}`);
  };

  const saveInventoryItem = async (payload) => {
    const item = await api("/api/inventory/items", { method: "POST", body: JSON.stringify(payload) });
    setToast("Inventory item created");
    setTimeout(() => setToast(""), 2200);
    loadData();
    return item;
  };

  const updateInventoryItem = async (id, payload) => {
    const item = await api(`/api/inventory/items/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
    setToast("Inventory item updated");
    setTimeout(() => setToast(""), 2200);
    loadData();
    return item;
  };

  const saveInventoryMovement = async (id, payload) => {
    const result = await api(`/api/inventory/items/${id}/movements`, { method: "POST", body: JSON.stringify(payload) });
    setToast("Inventory movement recorded");
    setTimeout(() => setToast(""), 2200);
    loadData();
    return result;
  };

  const manualBackup = async () => {
    await api("/api/backup", { method: "POST", body: "{}" });
    setToast("Database backup created");
    setTimeout(() => setToast(""), 2200);
  };

  const updateTankStatus = async (tankId, status) => {
    setData((current) => ({
      ...current,
      tanks: current.tanks.map((tank) => (tank.id === tankId ? { ...tank, status } : tank))
    }));
    await api(`/api/tanks/${tankId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    setToast("Tank status updated");
    setTimeout(() => setToast(""), 1800);
  };

  const setCurrentBatchId = async (batchId) => {
    setActiveBatchId(batchId);
    await api(`/api/settings/selectedBatchId`, { method: "PATCH", body: JSON.stringify({ value: batchId }) });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <img src="/icons/hopsession-logo.png" alt="Hopsession Brewing" />
          </div>
        </div>
        <p className="nav-kicker">Screens</p>
        <nav className="nav-list" aria-label="Main navigation">
          <button className={activeView === "dashboard" ? "active" : ""} onClick={() => setActiveView("dashboard")}>
            <LayoutDashboard size={18} /> <span>Dashboard</span>
          </button>
          <button className={activeView === "logs" ? "active" : ""} onClick={() => setActiveView("logs")}>
            <ClipboardList size={18} /> <span>Brewing</span>
          </button>
          <button className={activeView === "qa" ? "active" : ""} onClick={() => setActiveView("qa")}>
            <ShieldCheck size={18} /> <span>Audit</span>
          </button>
          <button className={activeView === "inventory" ? "active" : ""} onClick={() => setActiveView("inventory")}>
            <Barcode size={18} /> <span>Inventory</span>
          </button>
          <button className={activeView === "tools" ? "active" : ""} onClick={() => setActiveView("tools")}>
            <Calculator size={18} /> <span>Tools</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <button className="ghost-button" onClick={manualBackup}>
            <DatabaseBackup size={17} /> Backup now
          </button>
          <span>Auto backup every 6 hours</span>
        </div>
      </aside>

      <main>
        {isLoading ? (
          <div className="loading-state">Loading brewery records...</div>
        ) : (
          <>
            {activeView === "dashboard" && (
              <Dashboard
                data={data}
                latestByBatch={latestByBatch}
                setActiveBatchId={setActiveBatchId}
                setActiveView={setActiveView}
                onTankStatusChange={updateTankStatus}
              />
            )}
            {activeView === "logs" && (
              <BrewingView
                data={data}
                activeBatch={activeBatch}
                activeLogs={activeLogs}
                onSaveBatch={saveBatch}
                onSaveBatchProcess={saveBatchProcess}
                setActiveBatchId={setActiveBatchId}
                setActiveView={setActiveView}
              />
            )}
            {activeView === "qa" && (
              <AuditView
                batches={data.batches}
                activeBatch={activeBatch}
                activeBatchId={activeBatchId}
                activeLogs={activeLogs}
                onSelectBatch={setCurrentBatchId}
                onCompleteBatch={completeBatch}
              />
            )}
            {activeView === "inventory" && (
              <InventoryView
                inventoryItems={data.inventoryItems}
                inventoryMovements={data.inventoryMovements}
                onLookupBarcode={lookupBarcode}
                onSaveInventoryItem={saveInventoryItem}
                onUpdateInventoryItem={updateInventoryItem}
                onSaveInventoryMovement={saveInventoryMovement}
              />
            )}
            {activeView === "tools" && <ToolsView />}
          </>
        )}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Dashboard({ data, latestByBatch, setActiveBatchId, setActiveView, onTankStatusChange }) {
  const [selectedReport, setSelectedReport] = useState("ready");
  const activeBatches = data.batches.filter((batch) => batch.status !== "Archived" && batch.status !== "Packaged");
  const totalVolume = activeBatches.reduce((sum, batch) => sum + Number(batch.volume_l || 0), 0);
  const ready = activeBatches.filter((batch) => batch.status === "Ready to package").length;
  const availableTanks = data.tanks.filter((tank) => tank.status === "Available").length;
  const chartData = data.logs.map((log) => ({
    ...log,
    time: new Date(log.logged_at).toLocaleDateString("en-NZ", { day: "2-digit", month: "short" })
  }));

  return (
    <div className="content-grid">

      <section className="tank-grid">
        {data.tanks.map((tank) => {
          const batch = activeBatches.find((item) => item.tank_id === tank.id);
          const latest = batch ? latestByBatch.get(batch.id) : null;
          return (
            <article
              className={`tank-card ${batch ? "filled" : ""} tank-status-${slugify(tank.status || "Available")}`}
              key={tank.id}
            >
              <button
                className="tank-open"
                onClick={() => {
                  if (batch) setActiveBatchId(batch.id);
                  setActiveView("logs");
                }}
              >
                <div className="tank-card-head">
                  <span>{tank.name}</span>
                  <small>{tank.capacity_l} L</small>
                </div>
                {batch ? (
                  <>
                    <strong>{batch.beer_name}</strong>
                    <p>{batch.batch_no}</p>
                    <div className="status-row">
                      <Pill>{batch.status}</Pill>
                      <span>{batch.volume_l} L</span>
                    </div>
                    {batch.current_step && batch.current_step !== "setup" && (
                      <div className="tank-step-indicator">
                        <span className="tank-step-label">
                          {brewSteps.find((s) => s.id === batch.current_step)?.label || batch.current_step}
                        </span>
                        <div className="tank-step-bar">
                          {brewSteps.map((s) => (
                            <div
                              key={s.id}
                              className={`tank-step-seg${s.id === batch.current_step ? " active" : ""}${brewSteps.findIndex((x) => x.id === s.id) < brewSteps.findIndex((x) => x.id === batch.current_step) ? " done" : ""}`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="mini-readings">
                      <ReadingBar label="Vol" value={batch.volume_l} unit="L" min={0} max={tank.capacity_l} />
                      <ReadingBar label="Temp" value={latest?.temperature_c} unit="°C" min={0} max={30} />
                      <ReadingBar label="pH" value={latest?.ph} unit="" min={3} max={6} />
                      <ReadingBar label="Gravity" value={latest?.gravity} unit="" min={1.0} max={1.080} />
                    </div>
                  </>
                ) : (
                  <div className="empty-tank">
                    <Plus size={20} />
                    <span>No active batch</span>
                  </div>
                )}
              </button>
              <div className="tank-status-control">
                <span>Tank status</span>
                <strong>{tank.status || "Available"}</strong>
              </div>
            </article>
          );
        })}
      </section>

      <section className="panel chart-panel">
        <SectionTitle icon={<Activity />} title="Fermentation overview" />
        <div className="chart-frame">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d7ded6" />
              <XAxis dataKey="time" />
              <YAxis yAxisId="left" domain={["auto", "auto"]} />
              <YAxis yAxisId="right" orientation="right" domain={[3.8, 5.4]} />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="gravity" stroke="#1b6b50" strokeWidth={3} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="ph" name="pH" stroke="#e1a928" strokeWidth={3} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

function buildTasks(batches, latestByBatch, tanks) {
  const tasks = [];
  const now = new Date();

  tanks.forEach((tank) => {
    if (tank.status === "Cleaning") {
      tasks.push({
        batchId: null,
        tankId: tank.id,
        targetView: "dashboard",
        priority: "normal",
        icon: <ShieldCheck size={18} />,
        title: "Finish cleaning",
        detail: `${tank.name} needs release back to Available`,
        due: "Next"
      });
    }

    if (tank.status === "Maintenance") {
      tasks.push({
        batchId: null,
        tankId: tank.id,
        targetView: "dashboard",
        priority: "urgent",
        icon: <AlertTriangle size={18} />,
        title: "Maintenance lockout",
        detail: `${tank.name} is unavailable for brew scheduling`,
        due: "Open"
      });
    }
  });

  batches.forEach((batch) => {
    const latest = latestByBatch.get(batch.id);
    const hoursSinceLog = latest ? (now - new Date(latest.logged_at)) / 36e5 : Infinity;

    if (!latest || hoursSinceLog > 18) {
      tasks.push({
        batchId: batch.id,
        targetView: "logs",
        priority: "urgent",
        icon: <ClipboardList size={18} />,
        title: "Log readings",
        detail: `${batch.tank_name} - ${batch.beer_name}`,
        due: latest ? `${Math.floor(hoursSinceLog)}h` : "Now"
      });
    }

    if (batch.status === "Ready to package") {
      tasks.push({
        batchId: batch.id,
        targetView: "qa",
        priority: "ready",
        icon: <PackageCheck size={18} />,
        title: "Packaging QA",
        detail: `${batch.batch_no} needs final checks and export`,
        due: "Today"
      });
    }

    if (batch.status === "Conditioning") {
      tasks.push({
        batchId: batch.id,
        targetView: "logs",
        priority: "normal",
        icon: <Thermometer size={18} />,
        title: "Conditioning check",
        detail: `${batch.beer_name} cold-side temp, CO2 and sensory`,
        due: "Next"
      });
    }

    if (latest && !latest.cip_verified && batch.status === "Ready to package") {
      tasks.push({
        batchId: batch.id,
        targetView: "qa",
        priority: "urgent",
        icon: <AlertTriangle size={18} />,
        title: "Sanitation sign-off",
        detail: `${batch.tank_name} needs CIP evidence before packaging`,
        due: "Now"
      });
    }

    if (batch.status === "Fermenting" && latest?.gravity && Number(latest.gravity) <= 1.02) {
      tasks.push({
        batchId: batch.id,
        targetView: "logs",
        priority: "normal",
        icon: <FlaskConical size={18} />,
        title: "Gravity confirmation",
        detail: `${batch.beer_name} may be nearing dry hop or crash decision`,
        due: "Today"
      });
    }

    if (batch.expiry_date) {
      const daysToExpiry = Math.ceil((new Date(batch.expiry_date) - now) / 86400000);
      if (daysToExpiry <= 30) {
        tasks.push({
          batchId: batch.id,
          targetView: "qa",
          priority: "urgent",
          icon: <Clock3 size={18} />,
          title: "Expiry review",
          detail: `${batch.batch_no} expires ${formatShortDate(batch.expiry_date)}`,
          due: `${Math.max(daysToExpiry, 0)}d`
        });
      }
    }
  });

  return tasks
    .sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority))
    .slice(0, 6);
}

function buildOverviewReports(batches, tanks, latestByBatch) {
  const activeItems = batches.map((batch) => batchReportItem(batch, latestByBatch, "logs"));
  const readyItems = batches
    .filter((batch) => batch.status === "Ready to package")
    .map((batch) => batchReportItem(batch, latestByBatch, "qa"));
  const availableItems = tanks
    .filter((tank) => tank.status === "Available")
    .map((tank) => ({
      id: tank.id,
      targetView: "logs",
      title: tank.name,
      detail: `${tank.type} - ${tank.capacity_l} L`,
      meta: tank.status
    }));

  return [
    {
      id: "volume",
      title: "Active volume report",
      icon: <Waves />,
      empty: "No active volume is currently assigned.",
      items: activeItems
    },
    {
      id: "active",
      title: "Active batch report",
      icon: <Archive />,
      empty: "No active batches are currently running.",
      items: activeItems
    },
    {
      id: "ready",
      title: "Ready to package report",
      icon: <CheckCircle2 />,
      empty: "Nothing is marked ready to package yet.",
      items: readyItems
    },
    {
      id: "available",
      title: "Available tank report",
      icon: <TimerReset />,
      empty: "No tanks are currently marked Available.",
      items: availableItems
    }
  ];
}

function batchReportItem(batch, latestByBatch, targetView) {
  const latest = latestByBatch.get(batch.id);
  const latestDetail = latest
    ? `Last: ${display(latest.temperature_c, " C")} | pH ${display(latest.ph)} | gravity ${display(latest.gravity)}`
    : "No readings logged";

  return {
    id: batch.id,
    batchId: batch.id,
    targetView,
    title: `${batch.beer_name} - ${batch.batch_no}`,
    detail: `${batch.tank_name} | ${batch.volume_l} L | ${latestDetail}`,
    meta: batch.status
  };
}

function stepToStatus(stepId) {
  const map = { fermentation: "Fermenting", conditioning: "Conditioning", packaging: "Ready to package" };
  return map[stepId] || null;
}

function BrewingView({ data, activeBatch, activeLogs, onSaveBatch, onSaveBatchProcess, setActiveBatchId, setActiveView }) {
  const [isCreating, setIsCreating] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const serverProcessData = useMemo(() => activeBatch?.process_data ?? {}, [activeBatch?.id, activeBatch?.process_data]);
  const [processData, setProcessData] = useState(serverProcessData);
  const currentStep = brewSteps[stepIndex] || brewSteps[0];
  const [draft, setDraft] = useState(() => buildStepDraft(currentStep.id, processData, activeBatch));

  const activeBatches = useMemo(
    () => data.batches.filter((b) => b.status !== "Archived"),
    [data.batches]
  );

  const latestLog = activeLogs.length > 0 ? activeLogs[activeLogs.length - 1] : null;
  const daysBrewing = activeBatch?.brew_date
    ? Math.floor((Date.now() - new Date(activeBatch.brew_date)) / 86400000)
    : null;

  const og = Number(activeBatch?.target_og || 0);
  const fg = Number(activeBatch?.target_fg || 0);
  const currentGravity = latestLog?.gravity ? Number(latestLog.gravity) : null;
  const attenuation = og && fg && currentGravity && og > fg
    ? Math.min(100, Math.max(0, Math.round(((og - currentGravity) / (og - fg)) * 100)))
    : null;

  const completedSteps = useMemo(
    () => new Set(brewSteps.filter((s, i) => i < stepIndex || processData[s.id]).map((s) => s.id)),
    [processData, stepIndex]
  );

  useEffect(() => {
    const index = brewSteps.findIndex((step) => step.id === activeBatch?.current_step);
    setStepIndex(index >= 0 ? index : 0);
  }, [activeBatch?.id, activeBatch?.current_step]);

  useEffect(() => {
    setProcessData(serverProcessData);
  }, [activeBatch?.id, serverProcessData]);

  useEffect(() => {
    setDraft(buildStepDraft(currentStep.id, processData, activeBatch));
  }, [currentStep.id, processData, activeBatch?.id]);

  useEffect(() => {
    setIsCreating(false);
  }, [activeBatch?.id]);

  const updateField = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const isLastStep = stepIndex === brewSteps.length - 1;

  const saveProgress = async (nextIndex = null) => {
    const updatedData = { ...processData, [currentStep.id]: draft, lastSavedAt: new Date().toISOString() };
    const targetIndex = nextIndex !== null ? nextIndex : stepIndex;
    const nextStepId = brewSteps[targetIndex]?.id || currentStep.id;
    setProcessData(updatedData);
    if (nextIndex !== null) setStepIndex(Math.max(0, Math.min(brewSteps.length - 1, nextIndex)));
    const autoStatus = stepToStatus(nextStepId);
    const payload = { current_step: nextStepId, process_data: updatedData };
    if (autoStatus) payload.status = autoStatus;
    await onSaveBatchProcess(activeBatch.id, payload);
  };

  const goBack = () => { if (stepIndex > 0) saveProgress(stepIndex - 1); };
  const goNext = () => { if (!isLastStep) saveProgress(stepIndex + 1); };

  if (isCreating || !activeBatch) {
    return (
      <div className="brew-create-page">
        <div className="brew-create-header">
          <SectionTitle icon={<Plus />} title="Start new brew" />
          {activeBatch && (
            <button type="button" className="secondary-button" onClick={() => setIsCreating(false)}>
              Cancel
            </button>
          )}
        </div>
        <div className="panel brew-create-form">
          <BatchForm beers={data.beers} tanks={data.tanks} onSave={onSaveBatch} />
        </div>
      </div>
    );
  }

  const logChartData = activeLogs.map((log) => ({
    time: new Date(log.logged_at).toLocaleDateString("en-NZ", { day: "2-digit", month: "short" }),
    gravity: log.gravity,
    temp: log.temperature_c
  }));

  return (
    <div className="brew-layout">
      {/* Topbar: batch selector + new brew */}
      <div className="brew-topbar">
        <label className="brew-batch-select">
          <span>Active batch</span>
          <select value={activeBatch.id} onChange={(e) => setActiveBatchId(Number(e.target.value))}>
            {activeBatches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.batch_no} - {b.beer_name} ({b.status})
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="primary-button" onClick={() => setIsCreating(true)}>
          <Plus size={16} /> Start new brew
        </button>
      </div>

      <div className="brew-columns">
        {/* Left aside: details + step tracker */}
        <aside className="panel brew-aside">
          <div className="brew-aside-head">
            <div>
              <p className="eyebrow">{activeBatch.style || "Batch"}</p>
              <h2>{activeBatch.beer_name}</h2>
            </div>
            <Pill>{activeBatch.status}</Pill>
          </div>

          <dl className="brew-detail-list">
            <div><dt>Batch</dt><dd>{activeBatch.batch_no}</dd></div>
            <div><dt>Brewer</dt><dd>{activeBatch.operator || "N/A"}</dd></div>
            <div><dt>Tank</dt><dd>{activeBatch.tank_name}</dd></div>
            <div><dt>Volume</dt><dd>{activeBatch.volume_l} L</dd></div>
            <div><dt>Brew date</dt><dd>{activeBatch.brew_date || "TBC"}</dd></div>
            <div><dt>Package date</dt><dd>{activeBatch.package_date || "TBC"}</dd></div>
            {activeBatch.abv ? <div><dt>ABV</dt><dd>{activeBatch.abv}%</dd></div> : null}
            {activeBatch.target_og ? <div><dt>Target OG</dt><dd>{activeBatch.target_og}</dd></div> : null}
            {activeBatch.target_fg ? <div><dt>Target FG</dt><dd>{activeBatch.target_fg}</dd></div> : null}
            {activeBatch.fermentation_temp_c ? <div><dt>Ferm temp</dt><dd>{activeBatch.fermentation_temp_c}°C</dd></div> : null}
          </dl>

          {/* Step progress tracker */}
          <div className="step-tracker">
            <p className="step-tracker-kicker">Brew progress</p>
            <ol className="step-track">
              {brewSteps.map((step, i) => {
                const isDone = i < stepIndex;
                const isCurrent = i === stepIndex;
                const hasData = Boolean(processData[step.id]);
                return (
                  <li
                    key={step.id}
                    className={`step-track-item${isDone || hasData ? " done" : ""}${isCurrent ? " current" : ""}`}
                    title={step.hint}
                    onClick={() => {
                      if (i !== stepIndex) saveProgress(i);
                    }}
                  >
                    <div className="step-track-dot">
                      {isDone || (hasData && !isCurrent) ? <CheckCircle2 size={13} /> : <span>{i + 1}</span>}
                    </div>
                    <span className="step-track-label">{step.label}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </aside>

        {/* Right main: step form + analytics */}
        <div className="brew-main">
          <div className="panel brew-step-card">
            <div className="brew-step-header">
              <div>
                <p className="eyebrow">Step {stepIndex + 1} of {brewSteps.length}</p>
                <h2>{currentStep.label}</h2>
                <p className="muted-copy">{currentStep.hint}</p>
              </div>
            </div>
            <form
              className="form-stack"
              onSubmit={(e) => { e.preventDefault(); saveProgress(); }}
            >
              {renderStepFields(currentStep.id, draft, updateField, activeBatch, data.inventoryItems)}
              <div className="brew-navigation">
                <button type="button" className="secondary-button" disabled={stepIndex === 0} onClick={goBack}>
                  <ArrowLeft size={16} /> Back
                </button>
                <button type="submit" className="primary-button">
                  Save
                </button>
                <button type="button" className="secondary-button" disabled={isLastStep} onClick={goNext}>
                  {isLastStep ? (
                    <>
                      <CheckCircle2 size={16} /> Complete
                    </>
                  ) : (
                    <>
                      Next <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Analytics panel */}
          <div className="panel brew-analytics">
            <SectionTitle icon={<Activity />} title="Batch insights" />
            <div className="analytics-grid">
              <div className="stat-card">
                <strong>{daysBrewing !== null ? `${daysBrewing}d` : "N/A"}</strong>
                <span>Days brewing</span>
              </div>
              <div className="stat-card">
                <strong>{latestLog ? display(latestLog.temperature_c, "°C") : "N/A"}</strong>
                <span>Last temp</span>
              </div>
              <div className="stat-card">
                <strong>{latestLog ? display(latestLog.gravity) : "N/A"}</strong>
                <span>Last gravity</span>
              </div>
              <div className="stat-card">
                <strong>{latestLog ? display(latestLog.ph) : "N/A"}</strong>
                <span>Last pH</span>
              </div>
              <div className={`stat-card${attenuation !== null ? " highlight" : ""}`}>
                <strong>{attenuation !== null ? `${attenuation}%` : "N/A"}</strong>
                <span>Attenuation</span>
              </div>
              <div className="stat-card">
                <strong>{activeLogs.length}</strong>
                <span>Log entries</span>
              </div>
            </div>

            {og > 0 && fg > 0 && currentGravity !== null && (
              <div className="gravity-progress">
                <div className="gravity-progress-labels">
                  <span>OG {og}</span>
                  <span className="gravity-current">Current {currentGravity}</span>
                  <span>FG {fg}</span>
                </div>
                <div className="gravity-progress-track">
                  <div className="gravity-progress-fill" style={{ width: `${attenuation}%` }} />
                </div>
              </div>
            )}

            {logChartData.length > 1 && (
              <div className="brew-mini-chart">
                <p className="muted-copy" style={{ marginBottom: 8, fontSize: "0.82rem" }}>Gravity trend</p>
                <ResponsiveContainer width="100%" height={130}>
                  <AreaChart data={logChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#aab4a6" }} />
                    <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#aab4a6" }} />
                    <Tooltip contentStyle={{ background: "#0d2018", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10 }} />
                    <Area type="monotone" dataKey="gravity" stroke="#7de2b2" fill="rgba(125,226,178,0.1)" strokeWidth={2} dot={false} name="Gravity" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildStepDraft(stepId, processData, activeBatch) {
  const saved = processData?.[stepId] || {};
  switch (stepId) {
    case "setup":
      return {
        brewDate: saved.brewDate ?? activeBatch?.brew_date ?? "",
        volumeL: saved.volumeL ?? activeBatch?.volume_l ?? "",
        tankReady: saved.tankReady ?? "yes",
        setupNotes: saved.setupNotes ?? ""
      };
    case "ingredients":
      return {
        maltWeight: saved.maltWeight ?? "",
        hopSchedule: saved.hopSchedule ?? activeBatch?.hops ?? "",
        yeast: saved.yeast ?? activeBatch?.yeast ?? "",
        waterVolume: saved.waterVolume ?? "",
        inventoryUsage: Array.isArray(saved.inventoryUsage) ? saved.inventoryUsage : [],
        ingredientNotes: saved.ingredientNotes ?? ""
      };
    case "mash":
      return {
        strikeTemp: saved.strikeTemp ?? "",
        mashTemp: saved.mashTemp ?? "",
        mashDuration: saved.mashDuration ?? "",
        mashNotes: saved.mashNotes ?? ""
      };
    case "boil":
      return {
        boilDuration: saved.boilDuration ?? "",
        hopAdditions: saved.hopAdditions ?? "",
        kettleGravity: saved.kettleGravity ?? "",
        boilNotes: saved.boilNotes ?? ""
      };
    case "fermentation":
      return {
        fermentationTemp: saved.fermentationTemp ?? activeBatch?.fermentation_temp_c ?? "",
        targetOG: saved.targetOG ?? activeBatch?.target_og ?? "",
        targetFG: saved.targetFG ?? activeBatch?.target_fg ?? "",
        fermentationNotes: saved.fermentationNotes ?? ""
      };
    case "conditioning":
      return {
        conditioningDays: saved.conditioningDays ?? "",
        clarityGoal: saved.clarityGoal ?? "",
        conditioningNotes: saved.conditioningNotes ?? ""
      };
    case "packaging":
      return {
        packagingDate: saved.packagingDate ?? activeBatch?.package_date ?? "",
        qaChecks: saved.qaChecks ?? "",
        packagingNotes: saved.packagingNotes ?? ""
      };
    default:
      return {};
  }
}

function renderStepFields(stepId, draft, updateField, activeBatch, inventoryItems = []) {
  const rawMaterials = inventoryItems.filter((item) => item.category === "Raw Materials");
  const updateUsageRow = (index, key, value) => {
    const usage = [...(draft.inventoryUsage || [])];
    usage[index] = { ...usage[index], [key]: value };
    if (key === "item_id") {
      const item = rawMaterials.find((entry) => entry.id === Number(value));
      usage[index].unit = item?.unit || "";
      usage[index].item_name = item?.name || "";
    }
    updateField("inventoryUsage", usage);
  };
  const addUsageRow = () => {
    const firstItem = rawMaterials[0];
    updateField("inventoryUsage", [
      ...(draft.inventoryUsage || []),
      {
        item_id: firstItem?.id || "",
        item_name: firstItem?.name || "",
        quantity: "",
        unit: firstItem?.unit || ""
      }
    ]);
  };
  const removeUsageRow = (index) => {
    updateField("inventoryUsage", (draft.inventoryUsage || []).filter((_, rowIndex) => rowIndex !== index));
  };

  switch (stepId) {
    case "setup":
      return (
        <>
          <label>
            Tank ready?
            <select value={draft.tankReady} onChange={(event) => updateField("tankReady", event.target.value)}>
              <option value="yes">Yes, cleaned and ready</option>
              <option value="no">No, needs cleaning</option>
              <option value="partial">Partial, requires attention</option>
            </select>
          </label>
          <div className="form-row">
            <label>
              Brew date
              <input type="date" value={draft.brewDate} onChange={(event) => updateField("brewDate", event.target.value)} />
            </label>
            <label>
              Batch volume (L)
              <input type="number" step="1" value={draft.volumeL} onChange={(event) => updateField("volumeL", event.target.value)} />
            </label>
          </div>
          <label>
            Notes for setup
            <textarea value={draft.setupNotes} onChange={(event) => updateField("setupNotes", event.target.value)} />
          </label>
        </>
      );
    case "ingredients":
      return (
        <>
          <label>
            Malt weight
            <input type="text" value={draft.maltWeight} onChange={(event) => updateField("maltWeight", event.target.value)} placeholder="e.g. 180 kg" />
          </label>
          <label>
            Hop schedule
            <textarea value={draft.hopSchedule} onChange={(event) => updateField("hopSchedule", event.target.value)} placeholder={activeBatch?.hops || "Describe hop additions"} />
          </label>
          <label>
            Yeast selection
            <input value={draft.yeast} onChange={(event) => updateField("yeast", event.target.value)} placeholder={activeBatch?.yeast || "Yeast strain"} />
          </label>
          <label>
            Water volume
            <input type="text" value={draft.waterVolume} onChange={(event) => updateField("waterVolume", event.target.value)} placeholder="Litres of strike and sparge water" />
          </label>
          <div className="inventory-usage-panel">
            <div className="inventory-usage-header">
              <div>
                <strong>Inventory usage</strong>
                <span>Saved quantities deduct from stock on hand.</span>
              </div>
              <button type="button" className="secondary-button" onClick={addUsageRow} disabled={!rawMaterials.length}>
                <Plus size={16} /> Add product
              </button>
            </div>
            {(draft.inventoryUsage || []).map((row, index) => {
              const selected = rawMaterials.find((item) => item.id === Number(row.item_id));
              return (
                <div className="inventory-usage-row" key={`${row.item_id || "new"}-${index}`}>
                  <label>
                    Product
                    <select value={row.item_id || ""} onChange={(event) => updateUsageRow(index, "item_id", Number(event.target.value))}>
                      <option value="" disabled>Select product</option>
                      {rawMaterials.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.quantity.toLocaleString()} {item.unit})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Quantity used
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.quantity}
                      onChange={(event) => updateUsageRow(index, "quantity", event.target.value)}
                    />
                  </label>
                  <div className="inventory-usage-stock">
                    <span>On hand</span>
                    <strong>{selected ? `${selected.quantity.toLocaleString()} ${selected.unit}` : "N/A"}</strong>
                  </div>
                  <button type="button" className="icon-button danger" onClick={() => removeUsageRow(index)} aria-label="Remove inventory product">
                    <Trash2 size={17} />
                  </button>
                </div>
              );
            })}
            {!rawMaterials.length && <p className="muted-copy">Add raw materials in Inventory before linking them to brew usage.</p>}
          </div>
          <label>
            Ingredient notes
            <textarea value={draft.ingredientNotes} onChange={(event) => updateField("ingredientNotes", event.target.value)} />
          </label>
        </>
      );
    case "mash":
      return (
        <>
          <label>
            Strike temp (°C)
            <input type="number" step="0.1" value={draft.strikeTemp} onChange={(event) => updateField("strikeTemp", event.target.value)} />
          </label>
          <label>
            Mash temp (°C)
            <input type="number" step="0.1" value={draft.mashTemp} onChange={(event) => updateField("mashTemp", event.target.value)} />
          </label>
          <label>
            Mash duration
            <input type="text" value={draft.mashDuration} onChange={(event) => updateField("mashDuration", event.target.value)} placeholder="e.g. 60 minutes" />
          </label>
          <label>
            Mash notes
            <textarea value={draft.mashNotes} onChange={(event) => updateField("mashNotes", event.target.value)} />
          </label>
        </>
      );
    case "boil":
      return (
        <>
          <label>
            Boil duration
            <input type="text" value={draft.boilDuration} onChange={(event) => updateField("boilDuration", event.target.value)} placeholder="e.g. 60 minutes" />
          </label>
          <label>
            Hop additions
            <textarea value={draft.hopAdditions} onChange={(event) => updateField("hopAdditions", event.target.value)} placeholder="Describe timing and quantities" />
          </label>
          <label>
            Kettle gravity
            <input type="text" value={draft.kettleGravity} onChange={(event) => updateField("kettleGravity", event.target.value)} placeholder="e.g. 1.050" />
          </label>
          <label>
            Boil notes
            <textarea value={draft.boilNotes} onChange={(event) => updateField("boilNotes", event.target.value)} />
          </label>
        </>
      );
    case "fermentation":
      return (
        <>
          <label>
            Fermentation temp (°C)
            <input type="number" step="0.1" value={draft.fermentationTemp} onChange={(event) => updateField("fermentationTemp", event.target.value)} />
          </label>
          <div className="form-row">
            <label>
              Target OG
              <input type="text" value={draft.targetOG} onChange={(event) => updateField("targetOG", event.target.value)} placeholder={activeBatch?.target_og ?? ""} />
            </label>
            <label>
              Target FG
              <input type="text" value={draft.targetFG} onChange={(event) => updateField("targetFG", event.target.value)} placeholder={activeBatch?.target_fg ?? ""} />
            </label>
          </div>
          <label>
            Fermentation notes
            <textarea value={draft.fermentationNotes} onChange={(event) => updateField("fermentationNotes", event.target.value)} />
          </label>
        </>
      );
    case "conditioning":
      return (
        <>
          <label>
            Conditioning days
            <input type="text" value={draft.conditioningDays} onChange={(event) => updateField("conditioningDays", event.target.value)} placeholder="e.g. 7 days" />
          </label>
          <label>
            Clarity goal
            <input value={draft.clarityGoal} onChange={(event) => updateField("clarityGoal", event.target.value)} placeholder="Describe clarity / haze target" />
          </label>
          <label>
            Conditioning notes
            <textarea value={draft.conditioningNotes} onChange={(event) => updateField("conditioningNotes", event.target.value)} />
          </label>
        </>
      );
    case "packaging":
      return (
        <>
          <label>
            Packaging date
            <input type="date" value={draft.packagingDate} onChange={(event) => updateField("packagingDate", event.target.value)} />
          </label>
          <label>
            QA checks
            <textarea value={draft.qaChecks} onChange={(event) => updateField("qaChecks", event.target.value)} placeholder="CIP, sanitation, filling checks" />
          </label>
          <label>
            Packaging notes
            <textarea value={draft.packagingNotes} onChange={(event) => updateField("packagingNotes", event.target.value)} />
          </label>
        </>
      );
    default:
      return null;
  }
}

function LogForm({ activeBatch, onSave }) {
  const [form, setForm] = useState(defaultLog(activeBatch?.id));

  useEffect(() => {
    setForm(defaultLog(activeBatch?.id));
  }, [activeBatch?.id]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(form);
        setForm(defaultLog(activeBatch?.id));
      }}
    >
      <label>
        Batch
        <input value={`${activeBatch?.batch_no || ""} - ${activeBatch?.beer_name || ""}`} disabled />
      </label>
      <div className="form-row">
        <label>
          Time
          <input type="datetime-local" value={form.logged_at} onChange={(event) => update("logged_at", event.target.value)} required />
        </label>
        <label>
          Stage
          <select value={form.stage} onChange={(event) => update("stage", event.target.value)}>
            {stages.map((stage) => <option key={stage}>{stage}</option>)}
          </select>
        </label>
      </div>
      <div className="form-row thirds">
        <RangeField label="Temp C" value={form.temperature_c} onChange={(value) => update("temperature_c", value)} step="0.1" min={0} max={30} />
        <RangeField label="Gravity" value={form.gravity} onChange={(value) => update("gravity", value)} step="0.001" min={1.000} max={1.120} />
        <RangeField label="pH" value={form.ph} onChange={(value) => update("ph", value)} step="0.01" min={2.5} max={6.5} />
      </div>
      <div className="form-row thirds">
        <NumberField label="Pressure psi" value={form.pressure_psi} onChange={(value) => update("pressure_psi", value)} step="0.1" />
        <RangeField label="Brix" value={form.brix} onChange={(value) => update("brix", value)} step="0.1" min={0} max={20} />
        <NumberField label="DO ppb" value={form.dissolved_oxygen_ppb} onChange={(value) => update("dissolved_oxygen_ppb", value)} step="1" />
      </div>
      <div className="form-row">
        <RangeField label="CO2 vols" value={form.carbonation_vol} onChange={(value) => update("carbonation_vol", value)} step="0.01" min={0} max={5} />
        <NumberField label="Volume L" value={form.volume_l} onChange={(value) => update("volume_l", value)} step="1" />
      </div>
      <label className="check-row">
        <input type="checkbox" checked={form.cip_verified} onChange={(event) => update("cip_verified", event.target.checked)} />
        CIP/sanitation verified
      </label>
      <label>
        Sanitation
        <textarea value={form.sanitation} onChange={(event) => update("sanitation", event.target.value)} />
      </label>
      <label>
        Sensory
        <textarea value={form.sensory} onChange={(event) => update("sensory", event.target.value)} />
      </label>
      <label>
        Corrective action
        <textarea value={form.corrective_action} onChange={(event) => update("corrective_action", event.target.value)} />
      </label>
      <button className="primary-button" type="submit">
        <CheckCircle2 size={17} /> Save log
      </button>
    </form>
  );
}

function BatchForm({ beers, tanks, onSave, onCancel }) {
  const [form, setForm] = useState({
    batch_no: "",
    beer_id: "",
    tank_id: "",
    status: "Planned",
    volume_l: "",
    brew_date: "",
    package_date: "",
    expiry_date: "",
    operator: "",
    yeast: "",
    hops: "",
    notes: ""
  });
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(form);
      }}
    >
      <div className="form-row">
        <label>
          Batch number
          <input value={form.batch_no} onChange={(event) => update("batch_no", event.target.value)} required />
        </label>
        <label>
          Status
          <select value={form.status} onChange={(event) => update("status", event.target.value)}>
            {statuses.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          Beer / brew
          <select value={form.beer_id} onChange={(event) => update("beer_id", event.target.value)} required>
            <option value="" disabled>
              Select beer
            </option>
            {beers.map((beer) => <option key={beer.id} value={beer.id}>{beer.name}</option>)}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          Tank
          <select value={form.tank_id} onChange={(event) => update("tank_id", event.target.value)} required>
            <option value="" disabled>
              Select tank
            </option>
            {tanks.map((tank) => <option key={tank.id} value={tank.id}>{tank.name}</option>)}
          </select>
        </label>
        <label>
          Brewer
          <input value={form.operator} onChange={(event) => update("operator", event.target.value)} placeholder="Enter brewer name" required />
        </label>
      </div>
      <div className="form-row thirds">
        <NumberField label="Volume L" value={form.volume_l} onChange={(value) => update("volume_l", value)} />
        <label>
          Brew date
          <input type="date" value={form.brew_date} onChange={(event) => update("brew_date", event.target.value)} />
        </label>
        <label>
          Expiry
          <input type="date" value={form.expiry_date} onChange={(event) => update("expiry_date", event.target.value)} />
        </label>
      </div>
      <label>
        Yeast
        <input value={form.yeast} onChange={(event) => update("yeast", event.target.value)} />
      </label>
      <label>
        Hops
        <input value={form.hops} onChange={(event) => update("hops", event.target.value)} />
      </label>
      <label>
        Notes
        <textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} />
      </label>
      <button className="secondary-button" type="submit">
        <Plus size={17} /> Create batch
      </button>
    </form>
  );
}

function AuditView({ batches, activeBatch, activeBatchId, activeLogs, onSelectBatch, onCompleteBatch }) {
  const latest = activeLogs.at(-1);
  const stepCount = activeBatch?.process_data ? brewSteps.filter((step) => activeBatch.process_data[step.id]).length : 0;
  const isArchived = activeBatch?.status === "Archived";
  const hasPackagingStep = Boolean(activeBatch?.process_data?.packaging);
  const hasPackagingStatus = ["Ready to package", "Packaged", "Archived"].includes(activeBatch?.status);
  const completionRequirements = [
    { ok: Boolean(activeBatch?.batch_no), label: "Batch selected" },
    { ok: hasPackagingStep || hasPackagingStatus, label: "Packaging reached or batch marked ready to package" },
    { ok: activeLogs.length > 0, label: "At least one production log entry exists" }
  ];
  const canComplete = !isArchived && completionRequirements.every((item) => item.ok);
  const missingRequirements = completionRequirements.filter((item) => !item.ok);
  const completeBrew = () => {
    if (!activeBatch || !canComplete) return;
    if (!window.confirm(`Complete and archive ${activeBatch.batch_no}? This removes it from the tank dashboard but keeps it recallable in Audit.`)) return;
    onCompleteBatch(activeBatch.id);
  };

  return (
    <div className="two-column">
      <section className="panel">
        <div className="section-header-row">
          <SectionTitle icon={<ShieldCheck />} title="Batch audit" />
          <label className="audit-batch-select">
            Select batch
            <select value={activeBatchId || ""} onChange={(event) => onSelectBatch(Number(event.target.value))}>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.batch_no} - {batch.beer_name} ({batch.status})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="audit-list">
          <AuditItem ok={Boolean(activeBatch?.batch_no)} label="Batch number assigned" />
          <AuditItem ok={stepCount > 0} label={`${stepCount} brewing workflow steps captured`} />
          <AuditItem ok={activeLogs.length > 0} label={`${activeLogs.length} production log entries captured`} />
          <AuditItem ok={Boolean(latest?.gravity || latest?.ph || latest?.temperature_c)} label="Latest readings available" />
        </div>
      </section>
      <section className="panel archive-panel">
        <SectionTitle icon={<Archive />} title="Complete brew" />
        <BatchSummary batch={activeBatch} />
        {isArchived ? (
          <p className="muted-copy">This brew is archived and remains available here for audit export at any time.</p>
        ) : (
          <>
            <div className="audit-list">
              {completionRequirements.map((item) => (
                <AuditItem key={item.label} ok={item.ok} label={item.label} />
              ))}
            </div>
            <button className="primary-button full-width" type="button" disabled={!canComplete} onClick={completeBrew}>
              <Archive size={17} /> Complete and archive brew
            </button>
            <p className="muted-copy">
              {canComplete
                ? "Completion will release the tank to Available and keep the full batch record in Audit."
                : `Complete is unavailable until: ${missingRequirements.map((item) => item.label).join("; ")}.`}
            </p>
          </>
        )}
      </section>
      <section className="panel">
        <SectionTitle icon={<ClipboardList />} title="Export" />
        <BatchSummary batch={activeBatch} />
        <p className="muted-copy">
          PDF export includes batch identity, recipe profile, every saved brewing wizard step, inventory usage, readings, sanitation, sensory notes, corrective actions and operator notes.
        </p>
        {activeBatch && (
          <a className="primary-button full-width" href={`/api/batches/${activeBatch.id}/pdf`} target="_blank" rel="noreferrer">
            <Download size={17} /> Download audit PDF
          </a>
        )}
      </section>
    </div>
  );
}

function BeerLibrary({ beers }) {
  return (
    <section className="beer-library">
      {beers.map((beer) => (
        <article className="beer-card" key={beer.id}>
          <div>
            <p className="eyebrow">{beer.style}</p>
            <h2>{beer.name}</h2>
          </div>
          <p>{beer.profile}</p>
          <div className="beer-stats">
            <span>{display(beer.abv, "% ABV")}</span>
            <span>{beer.ibu ? `${beer.ibu} IBU` : "IBU TBC"}</span>
            <span>pH {display(beer.target_ph)}</span>
            <span>{display(beer.fermentation_temp_c, " C")}</span>
          </div>
        </article>
      ))}
    </section>
  );
}

function ToolsView() {
  const [dilution, setDilution] = useState({ volume: 20, currentAbv: 8, targetAbv: 5 });
  const [abv, setAbv] = useState({ og: 1.050, fg: 1.010 });
  const [hop, setHop] = useState({ grams: 50, alpha: 8, time: 60, volume: 20, gravity: 1.050 });
  const [strike, setStrike] = useState({ grainKg: 5, waterL: 15, grainTemp: 20, mashTemp: 67 });

  const updateTool = (setter, key, value) => setter((current) => ({ ...current, [key]: value }));
  const waterToAdd = calculateDilutionWater(dilution);
  const finalVolume = Number(dilution.volume || 0) + waterToAdd;
  const estimatedAbv = Math.max(0, (Number(abv.og || 0) - Number(abv.fg || 0)) * 131.25);
  const ibu = calculateTinsethIbu(hop);
  const strikeTemp = calculateStrikeTemp(strike);

  return (
    <div className="tools-grid">
      <ToolCard icon={<Droplets />} title="Dilution Calculator" result={`${formatToolNumber(waterToAdd)} L water`}>
        <div className="form-row thirds">
          <ToolNumber label="Current volume L" value={dilution.volume} onChange={(value) => updateTool(setDilution, "volume", value)} />
          <ToolNumber label="Current ABV %" value={dilution.currentAbv} onChange={(value) => updateTool(setDilution, "currentAbv", value)} step="0.1" />
          <ToolNumber label="Target ABV %" value={dilution.targetAbv} onChange={(value) => updateTool(setDilution, "targetAbv", value)} step="0.1" />
        </div>
        <p className="tool-result-copy">Final volume {formatToolNumber(finalVolume)} L</p>
      </ToolCard>

      <ToolCard icon={<Gauge />} title="ABV Calculator" result={`${formatToolNumber(estimatedAbv)}% ABV`}>
        <div className="form-row">
          <ToolNumber label="Original gravity" value={abv.og} onChange={(value) => updateTool(setAbv, "og", value)} step="0.001" />
          <ToolNumber label="Final gravity" value={abv.fg} onChange={(value) => updateTool(setAbv, "fg", value)} step="0.001" />
        </div>
      </ToolCard>

      <ToolCard icon={<Beer />} title="Hop Calculator" result={`${formatToolNumber(ibu)} IBU`}>
        <div className="form-row thirds">
          <ToolNumber label="Hop grams" value={hop.grams} onChange={(value) => updateTool(setHop, "grams", value)} step="0.1" />
          <ToolNumber label="Alpha acid %" value={hop.alpha} onChange={(value) => updateTool(setHop, "alpha", value)} step="0.1" />
          <ToolNumber label="Boil minutes" value={hop.time} onChange={(value) => updateTool(setHop, "time", value)} />
        </div>
        <div className="form-row">
          <ToolNumber label="Batch volume L" value={hop.volume} onChange={(value) => updateTool(setHop, "volume", value)} step="0.1" />
          <ToolNumber label="Wort gravity" value={hop.gravity} onChange={(value) => updateTool(setHop, "gravity", value)} step="0.001" />
        </div>
      </ToolCard>

      <ToolCard icon={<Thermometer />} title="Strike Water Calculator" result={`${formatToolNumber(strikeTemp)}°C`}>
        <div className="form-row thirds">
          <ToolNumber label="Grain kg" value={strike.grainKg} onChange={(value) => updateTool(setStrike, "grainKg", value)} step="0.1" />
          <ToolNumber label="Water L" value={strike.waterL} onChange={(value) => updateTool(setStrike, "waterL", value)} step="0.1" />
          <ToolNumber label="Grain temp °C" value={strike.grainTemp} onChange={(value) => updateTool(setStrike, "grainTemp", value)} step="0.1" />
        </div>
        <ToolNumber label="Target mash °C" value={strike.mashTemp} onChange={(value) => updateTool(setStrike, "mashTemp", value)} step="0.1" />
      </ToolCard>
    </div>
  );
}

function ToolCard({ icon, title, result, children }) {
  return (
    <section className="panel tool-card">
      <div className="tool-card-header">
        <SectionTitle icon={icon} title={title} />
        <strong>{result}</strong>
      </div>
      <div className="form-stack">{children}</div>
    </section>
  );
}

function ToolNumber({ label, value, onChange, step = "1" }) {
  return (
    <label>
      {label}
      <input type="number" value={value} step={step} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function calculateDilutionWater({ volume, currentAbv, targetAbv }) {
  const currentVolume = Number(volume || 0);
  const current = Number(currentAbv || 0);
  const target = Number(targetAbv || 0);
  if (currentVolume <= 0 || current <= 0 || target <= 0 || target >= current) return 0;
  return currentVolume * (current / target - 1);
}

function calculateTinsethIbu({ grams, alpha, time, volume, gravity }) {
  const hopGrams = Number(grams || 0);
  const alphaPercent = Number(alpha || 0) / 100;
  const boilMinutes = Number(time || 0);
  const volumeL = Number(volume || 0);
  const wortGravity = Number(gravity || 1.050);
  if (hopGrams <= 0 || alphaPercent <= 0 || boilMinutes <= 0 || volumeL <= 0) return 0;
  const utilization = (1.65 * Math.pow(0.000125, wortGravity - 1) * (1 - Math.exp(-0.04 * boilMinutes))) / 4.15;
  return (hopGrams * alphaPercent * 1000 * utilization) / volumeL;
}

function calculateStrikeTemp({ grainKg, waterL, grainTemp, mashTemp }) {
  const grain = Number(grainKg || 0);
  const water = Number(waterL || 0);
  const grainTemperature = Number(grainTemp || 0);
  const target = Number(mashTemp || 0);
  if (grain <= 0 || water <= 0 || target <= 0) return 0;
  const ratio = water / grain;
  return (0.41 / ratio) * (target - grainTemperature) + target;
}

function formatToolNumber(value) {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-NZ", { maximumFractionDigits: 2 });
}

function InventoryView({ inventoryItems, inventoryMovements, onLookupBarcode, onSaveInventoryItem, onUpdateInventoryItem, onSaveInventoryMovement }) {
  const [selectedItem, setSelectedItem] = useState(inventoryItems[0] || null);
  const [searchTerm, setSearchTerm] = useState("");
  const [barcodeValue, setBarcodeValue] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [scanActive, setScanActive] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scannerStatus, setScannerStatus] = useState("");
  const [inventoryTab, setInventoryTab] = useState("stock");
  const videoRef = useRef(null);
  const [newItem, setNewItem] = useState(defaultInventoryItem());
  const [movement, setMovement] = useState(defaultInventoryMovement());

  useEffect(() => {
    if (!selectedItem && inventoryItems.length) {
      setSelectedItem(inventoryItems[0]);
    }
  }, [inventoryItems, selectedItem]);

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return inventoryItems.filter((item) => {
      if (!term) return true;
      return (
        item.name.toLowerCase().includes(term) ||
        String(item.barcode || "").includes(term) ||
        String(item.sku || "").toLowerCase().includes(term)
      );
    });
  }, [inventoryItems, searchTerm]);

  const categories = ["Raw Materials", "Ready for Sale"].map((category) => ({
    category,
    items: filteredItems.filter((item) => item.category === category)
  }));

  const lowStockItems = filteredItems.filter((item) => item.reorder_level && item.quantity <= item.reorder_level);
  const totalOnHand = filteredItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  const selectItem = (item) => {
    setSelectedItem(item);
    setMovement(defaultInventoryMovement());
  };

  const handleLookup = async () => {
    const barcode = barcodeValue.trim();
    if (!barcode) {
      setScanMessage("Enter or scan a barcode first.");
      return;
    }
    try {
      const item = await onLookupBarcode(barcode);
      setSelectedItem(item);
      setScanMessage(`Found inventory item: ${item.name}`);
      if (inventoryTab !== "stock") setInventoryTab("stock");
    } catch (error) {
      setScanMessage("Item not found. Add it below or scan another barcode.");
    }
  };

  const stopScanner = (stream) => {
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
    setScanActive(false);
  };

  const scanBarcode = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setScanError("Camera scanning is not supported in this browser.");
      return;
    }
    if (!window.BarcodeDetector) {
      setScanError("No BarcodeDetector available. Use manual barcode entry.");
      return;
    }

    setScanError("");
    setScannerStatus("Starting camera...");
    setScanActive(true);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "qr_code", "code_128", "code_39"] });
      setScannerStatus("Point your camera at the barcode.");

      const scanLoop = async () => {
        try {
          const barcodes = await detector.detect(video);
          if (barcodes.length > 0) {
            const found = barcodes[0].rawValue;
            setBarcodeValue(found);
            setScanMessage(`Scanned barcode: ${found}`);
            stopScanner(stream);
            return;
          }
        } catch (error) {
          console.warn(error);
        }
        if (scanActive) {
          window.requestAnimationFrame(scanLoop);
        }
      };
      scanLoop();
    } catch (error) {
      stopScanner(stream);
      setScanActive(false);
      setScanError("Unable to access camera for scanning.");
      console.error(error);
    }
  };

  const onSaveItem = async (event) => {
    event.preventDefault();
    const item = await onSaveInventoryItem(newItem);
    setSelectedItem(item);
    setNewItem(defaultInventoryItem());
    setSearchTerm("");
    setInventoryTab("stock");
  };

  const onSaveMovement = async (event) => {
    event.preventDefault();
    if (!selectedItem) return;
    await onSaveInventoryMovement(selectedItem.id, movement);
    setMovement(defaultInventoryMovement());
  };

  return (
    <div className="inventory-grid">
      <section className="panel inventory-list-panel">
        <div className="inventory-panel-header">
          <div>
            <SectionTitle icon={<Barcode />} title="Inventory control" />
            <p className="inventory-panel-copy">
              Quickly see stock on hand and items that need reordering.
            </p>
          </div>
          <div className="inventory-tabs">
            <button
              type="button"
              className={`inventory-tab-button ${inventoryTab === "stock" ? "active" : ""}`}
              onClick={() => setInventoryTab("stock")}
            >
              Stock overview
            </button>
            <button
              type="button"
              className={`inventory-tab-button ${inventoryTab === "add" ? "active" : ""}`}
              onClick={() => setInventoryTab("add")}
            >
              Add / scan item
            </button>
          </div>
        </div>

        {inventoryTab === "stock" ? (
          <>
            <div className="inventory-scan-panel">
              <div className="inventory-search-toolbar">
                <label className="full-width">
                  Search inventory
                  <input
                    value={searchTerm}
                    placeholder="Search by name, SKU or barcode"
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setSearchTerm("");
                    setBarcodeValue("");
                    setScanMessage("");
                    setScanError("");
                  }}
                >
                  Clear filters
                </button>
              </div>
            </div>

            {categories.map((group) => (
              <div key={group.category} className="inventory-category-section">
                <div className="inventory-category-header">
                  <h3>{group.category}</h3>
                  <p>{group.items.length} items</p>
                </div>
                <div className="inventory-table-wrapper">
                  <table className="inventory-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Reorder</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((item) => (
                        <tr
                          key={item.id}
                          className={selectedItem?.id === item.id ? "selected-row" : ""}
                          onClick={() => selectItem(item)}
                        >
                          <td>
                            <strong>{item.name}</strong>
                            <small>{item.sku || item.barcode || "N/A"}</small>
                          </td>
                          <td>
                            <strong>{item.quantity.toLocaleString()}</strong>
                            <span className="inventory-table-unit">{item.unit}</span>
                          </td>
                          <td>
                            {item.reorder_level ? item.reorder_level : "N/A"}
                            {item.reorder_level && item.quantity <= item.reorder_level ? <span className="low-stock">Order</span> : null}
                          </td>
                        </tr>
                      ))}
                      {!group.items.length && (
                        <tr>
                          <td colSpan="3" className="muted-copy">
                            No items in this category.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </>
        ) : (
          <div className="inventory-add-tab-panel">
            <div className="barcode-actions">
              <label>
                Barcode lookup
                <div className="input-row">
                  <input
                    value={barcodeValue}
                    placeholder="Enter barcode"
                    onChange={(event) => setBarcodeValue(event.target.value)}
                  />
                  <button type="button" className="secondary-button" onClick={handleLookup}>
                    <Search size={16} /> Find
                  </button>
                </div>
              </label>
              <button type="button" className="primary-button" onClick={scanBarcode}>
                <Camera size={16} /> Scan barcode
              </button>
            </div>

            {(scannerStatus || scanError || scanMessage) && (
              <div className="inventory-flash-row">
                {scannerStatus && <span>{scannerStatus}</span>}
                {scanError && <span className="error-copy">{scanError}</span>}
                {scanMessage && <span>{scanMessage}</span>}
              </div>
            )}
            {scanActive && <video ref={videoRef} className="inventory-scanner-video" muted playsInline />}

            <div className="inventory-add-copy">
              <p>Use the form on the right to add a new item, or scan a barcode to prefill an existing product into stock.</p>
              <p className="muted-copy">Switch back to Stock overview to browse current materials and finished goods.</p>
            </div>
          </div>
        )}
      </section>

      <section className="panel inventory-detail-panel">
        <SectionTitle icon={<PackageCheck />} title={inventoryTab === "stock" ? "Item details" : "Add inventory item"} />

        {inventoryTab === "stock" ? (
          selectedItem ? (
            <div className="inventory-details">
              <div className="inventory-detail-card">
                <div className="detail-header">
                  <div>
                    <p className="eyebrow">{selectedItem.category}</p>
                    <h2>{selectedItem.name}</h2>
                    <p className="muted-copy">SKU {selectedItem.sku || "N/A"} • Barcode {selectedItem.barcode || "N/A"}</p>
                  </div>
                  <Pill>{selectedItem.quantity.toLocaleString()} {selectedItem.unit}</Pill>
                </div>
                <div className="inventory-meta-grid">
                  <div>
                    <strong>Supplier</strong>
                    <span>{selectedItem.supplier || "Unknown"}</span>
                  </div>
                  <div>
                    <strong>Package</strong>
                    <span>{selectedItem.package_size || "N/A"}</span>
                  </div>
                  <div>
                    <strong>Reorder</strong>
                    <span>{selectedItem.reorder_level || "N/A"}</span>
                  </div>
                  <div>
                    <strong>Expiry</strong>
                    <span>{selectedItem.expiry_date || "TBC"}</span>
                  </div>
                </div>
                <p className="inventory-detail-copy">{selectedItem.notes || "No additional notes."}</p>
              </div>

              <div className="inventory-actions">
                <section className="panel inventory-action-panel">
                  <SectionTitle icon={<Activity />} title="Adjust stock" />
                  <InventoryMovementForm movement={movement} onChange={setMovement} onSave={onSaveMovement} />
                </section>

                <section className="panel inventory-action-panel">
                  <SectionTitle icon={<PackageCheck />} title="Edit item" />
                  <InventoryItemForm item={selectedItem} onSave={onUpdateInventoryItem} />
                </section>
              </div>
            </div>
          ) : (
            <div className="inventory-empty-state">
              <p className="muted-copy">Select an item from Stock overview to inspect and edit its details.</p>
            </div>
          )
        ) : (
          <form className="form-stack" onSubmit={onSaveItem}>
            <label>
              Category
              <select value={newItem.category} onChange={(event) => setNewItem((current) => ({ ...current, category: event.target.value }))}>
                <option>Raw Materials</option>
                <option>Ready for Sale</option>
              </select>
            </label>
            <label>
              Name
              <input value={newItem.name} onChange={(event) => setNewItem((current) => ({ ...current, name: event.target.value }))} required />
            </label>
            <label>
              Barcode
              <input value={newItem.barcode} onChange={(event) => setNewItem((current) => ({ ...current, barcode: event.target.value }))} />
            </label>
            <div className="form-row thirds">
              <label>
                Unit
                <input value={newItem.unit} onChange={(event) => setNewItem((current) => ({ ...current, unit: event.target.value }))} />
              </label>
              <label>
                Qty
                <input type="number" value={newItem.quantity} onChange={(event) => setNewItem((current) => ({ ...current, quantity: Number(event.target.value) }))} />
              </label>
              <label>
                Reorder
                <input type="number" value={newItem.reorder_level} onChange={(event) => setNewItem((current) => ({ ...current, reorder_level: Number(event.target.value) }))} />
              </label>
            </div>
            <div className="form-row">
              <label>
                Supplier
                <input value={newItem.supplier} onChange={(event) => setNewItem((current) => ({ ...current, supplier: event.target.value }))} />
              </label>
              <label>
                Package
                <input value={newItem.package_size} onChange={(event) => setNewItem((current) => ({ ...current, package_size: event.target.value }))} />
              </label>
            </div>
            <label>
              Expiry date
              <input type="date" value={newItem.expiry_date || ""} onChange={(event) => setNewItem((current) => ({ ...current, expiry_date: event.target.value }))} />
            </label>
            <label>
              Notes
              <textarea value={newItem.notes} onChange={(event) => setNewItem((current) => ({ ...current, notes: event.target.value }))} />
            </label>
            <button className="primary-button" type="submit">
              <Plus size={17} /> Add inventory item
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function InventoryMovementForm({ movement, onChange, onSave }) {
  return (
    <form className="form-stack" onSubmit={onSave}>
      <SectionTitle icon={<Activity />} title="Inventory movement" />
      <label>
        Movement type
        <select value={movement.movement_type} onChange={(event) => onChange({ ...movement, movement_type: event.target.value })}>
          <option>Adjustment</option>
          <option>Consumption</option>
          <option>Purchase</option>
          <option>Stocktake</option>
        </select>
      </label>
      <div className="form-row thirds">
        <label>
          Qty change
          <input
            type="number"
            value={movement.quantity_delta}
            step="0.01"
            onChange={(event) => onChange({ ...movement, quantity_delta: Number(event.target.value) })}
            required
          />
        </label>
        <label>
          Reason
          <input value={movement.reason} onChange={(event) => onChange({ ...movement, reason: event.target.value })} />
        </label>
        <label>
          Reference
          <input value={movement.reference} onChange={(event) => onChange({ ...movement, reference: event.target.value })} />
        </label>
      </div>
      <button className="secondary-button" type="submit">
        Save movement
      </button>
    </form>
  );
}

function InventoryItemForm({ item, onSave }) {
  const [draft, setDraft] = useState(item);

  useEffect(() => {
    setDraft(item);
  }, [item]);

  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(item.id, draft);
      }}
    >
      <SectionTitle icon={<PackageCheck />} title="Edit item" />
      <div className="form-row">
        <label>
          Name
          <input value={draft.name} onChange={(event) => update("name", event.target.value)} required />
        </label>
        <label>
          Barcode
          <input value={draft.barcode || ""} onChange={(event) => update("barcode", event.target.value)} />
        </label>
      </div>
      <div className="form-row thirds">
        <label>
          Unit
          <input value={draft.unit} onChange={(event) => update("unit", event.target.value)} />
        </label>
        <label>
          Supplier
          <input value={draft.supplier} onChange={(event) => update("supplier", event.target.value)} />
        </label>
      </div>
      <button className="secondary-button" type="submit">
        Update item
      </button>
    </form>
  );
}

function defaultInventoryItem() {
  return {
    category: "Raw Materials",
    name: "",
    sku: "",
    barcode: "",
    unit: "unit",
    quantity: 0,
    reorder_level: 0,
    supplier: "",
    package_size: "",
    expiry_date: "",
    notes: ""
  };
}

function defaultInventoryMovement() {
  return {
    movement_type: "Adjustment",
    quantity_delta: 0,
    reason: "",
    reference: ""
  };
}

function BatchSummary({ batch }) {
  if (!batch) return null;
  return (
    <div className="batch-summary">
      <h2>{batch.beer_name}</h2>
      <p>{batch.batch_no}</p>
      <div>
        <Pill>{batch.status}</Pill>
        <span>{batch.tank_name}</span>
        <span>{batch.volume_l} L</span>
        <span>Expiry {batch.expiry_date || "TBC"}</span>
      </div>
    </div>
  );
}

function Metric({ icon, label, value, active, onClick }) {
  return (
    <button className={`metric ${active ? "active" : ""}`} type="button" onClick={onClick}>
      {React.cloneElement(icon, { size: 20 })}
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}

function SectionTitle({ icon, title }) {
  return (
    <div className="section-title">
      {React.cloneElement(icon, { size: 19 })}
      <h2>{title}</h2>
    </div>
  );
}

function AuditItem({ ok, label }) {
  return (
    <div className={ok ? "audit-item ok" : "audit-item"}>
      <CheckCircle2 size={18} />
      <span>{label}</span>
    </div>
  );
}

function NumberField({ label, value, onChange, step = "1" }) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <input type="number" value={value} step={step} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function RangeField({ label, value, onChange, step = "0.1", min = 0, max = 20 }) {
  const numericValue = value === "" || value === null || value === undefined ? min : Number(value);
  return (
    <label className="range-field">
      <div className="range-title-row">
        <span>{label}</span>
        <strong>{numericValue}</strong>
      </div>
      <input
        className="slider-input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={numericValue}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Pill({ children }) {
  return <span className="pill">{children}</span>;
}

function ReadingBar({ label, value, unit = "", min = 0, max = 100 }) {
  const numeric = Number(value);
  const valid = value !== undefined && value !== null && value !== "" && !Number.isNaN(numeric);
  const pct = valid ? Math.round(((numeric - min) / (max - min)) * 100) : 0;
  const fillWidth = `${Math.max(0, Math.min(100, pct))}%`;

  return (
    <div className="reading-bar">
      <div className="reading-bar-label">
        <span>{label}</span>
        <strong>{valid ? `${numeric}${unit}` : "N/A"}</strong>
      </div>
      <div className="reading-bar-track">
        <div className="reading-bar-fill" style={{ width: fillWidth }} />
      </div>
    </div>
  );
}

function defaultLog(batchId) {
  return {
    batch_id: batchId || "",
    logged_at: new Date().toISOString().slice(0, 16),
    stage: "Fermentation",
    temperature_c: "",
    gravity: "",
    ph: "",
    pressure_psi: "",
    brix: "",
    dissolved_oxygen_ppb: "",
    carbonation_vol: "",
    volume_l: "",
    cip_verified: false,
    sanitation: "",
    sensory: "",
    corrective_action: "",
    notes: ""
  };
}

function display(value, suffix = "") {
  return value === null || value === undefined || value === "" ? "N/A" : `${value}${suffix}`;
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function shortDate(value) {
  return new Date(value).toLocaleDateString("en-NZ", { day: "2-digit", month: "short" });
}

function formatShortDate(value) {
  return new Date(value).toLocaleDateString("en-NZ", { day: "2-digit", month: "short" });
}

function priorityWeight(priority) {
  return { urgent: 1, ready: 2, normal: 3 }[priority] || 4;
}

function nextExpiry(batches) {
  const dates = batches
    .map((batch) => batch.expiry_date)
    .filter(Boolean)
    .sort();
  return dates[0] ? new Date(dates[0]).toLocaleDateString("en-NZ", { day: "2-digit", month: "short" }) : "TBC";
}

function getInitialView() {
  const view = new URLSearchParams(window.location.search).get("view");
  return ["dashboard", "logs", "qa", "inventory", "tools"].includes(view) ? view : "dashboard";
}

createRoot(document.getElementById("root")).render(<App />);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
