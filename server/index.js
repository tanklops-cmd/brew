import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const backupDir = path.join(dataDir, "backups");
const dbPath = path.join(dataDir, "brewers-companion.sqlite");
const port = process.env.PORT || 4173;

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(backupDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

const tankStatuses = ["Available", "Cleaning", "Brew", "Fermenting", "Conditioning", "Packaging", "Maintenance"];
const inventoryCategories = ["Raw Materials", "Ready for Sale"];

db.exec(`
CREATE TABLE IF NOT EXISTS tanks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  capacity_l INTEGER NOT NULL,
  type TEXT NOT NULL,
  location TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Available',
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS beers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  style TEXT NOT NULL,
  abv REAL,
  ibu REAL,
  profile TEXT NOT NULL,
  target_ph REAL,
  target_og REAL,
  target_fg REAL,
  fermentation_temp_c REAL,
  allergen_notes TEXT DEFAULT 'Contains barley/gluten',
  source TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_no TEXT NOT NULL UNIQUE,
  beer_id INTEGER NOT NULL,
  tank_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  volume_l REAL NOT NULL,
  brew_date TEXT NOT NULL,
  package_date TEXT,
  expiry_date TEXT,
  operator TEXT DEFAULT 'Hopsession',
  yeast TEXT DEFAULT '',
  hops TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (beer_id) REFERENCES beers(id),
  FOREIGN KEY (tank_id) REFERENCES tanks(id)
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  logged_at TEXT NOT NULL,
  stage TEXT NOT NULL,
  temperature_c REAL,
  gravity REAL,
  ph REAL,
  pressure_psi REAL,
  brix REAL,
  dissolved_oxygen_ppb REAL,
  carbonation_vol REAL,
  volume_l REAL,
  cip_verified INTEGER DEFAULT 0,
  sanitation TEXT DEFAULT '',
  sensory TEXT DEFAULT '',
  corrective_action TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  sku TEXT DEFAULT '',
  barcode TEXT UNIQUE,
  unit TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  reorder_level REAL NOT NULL DEFAULT 0,
  location TEXT DEFAULT '',
  supplier TEXT DEFAULT '',
  package_size TEXT DEFAULT '',
  expiry_date TEXT,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  movement_type TEXT NOT NULL,
  quantity_delta REAL NOT NULL,
  reason TEXT DEFAULT '',
  reference TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);`);

const scalar = (sql, params = {}) => db.prepare(sql).get(params);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    return true;
  }
  return false;
}

const tankStatusColumnAdded = ensureColumn("tanks", "status", "TEXT NOT NULL DEFAULT 'Available'");
const processDataColumnAdded = ensureColumn("batches", "process_data", "TEXT DEFAULT NULL");
const currentStepColumnAdded = ensureColumn("batches", "current_step", "TEXT DEFAULT 'setup'");

function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  const existing = db.prepare("SELECT 1 FROM settings WHERE key = ?").get(key);
  if (existing) {
    db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(value, key);
  } else {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(key, value);
  }
}

function seed() {
  if (scalar("SELECT COUNT(*) AS count FROM tanks").count === 0) {
    const tankStmt = db.prepare("INSERT INTO tanks (name, capacity_l, type, location, status, notes) VALUES (?, ?, ?, ?, ?, ?)");
    [
      ["Uni 1", 600, "Unitank", "Brewery floor", "Fermenting", "Primary fermentation and conditioning"],
      ["Uni 2", 600, "Unitank", "Brewery floor", "Conditioning", "Primary fermentation and conditioning"],
      ["Uni 3", 600, "Unitank", "Brewery floor", "Packaging", "Primary fermentation and conditioning"],
      ["Bright 1", 500, "Bright tank", "Cold side", "Available", "Packaging-ready beer"]
    ].forEach((row) => tankStmt.run(...row));
  }

  if (scalar("SELECT COUNT(*) AS count FROM beers").count === 0) {
    const beerStmt = db.prepare(`
      INSERT INTO beers
      (name, style, abv, ibu, profile, target_ph, target_og, target_fg, fermentation_temp_c, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    [
      ["Hatch's Hill Hazy", "Hazy IPA", 6.2, 24, "Hazy golden orange. Citrus, mango, sweet malt, medium body, dry finish.", 4.45, 1.058, 1.012, 19, "Untappd / Dunedin Beer Fest public profile"],
      ["Burt APA", "American Pale Ale", 5, 48, "Golden orange pale ale with fruity citrus, passionfruit and an easy-drinking tropical finish.", 4.4, 1.050, 1.010, 18, "Untappd / Dunedin Beer Fest public profile"],
      ["Foveaux Cold IPA", "Cold IPA", 6.7, 55, "Golden straw cold IPA with citrus, stone fruit and a clean lager-like profile.", 4.35, 1.062, 1.009, 15, "Untappd / Dunedin Beer Fest public profile"],
      ["Stumped NZ Pilsner", "NZ Pilsner", 5.4, 30, "Motueka-led pilsner with lime, lemon, golden straw colour and crisp sessionable finish.", 4.3, 1.050, 1.008, 12, "Untappd / Dunedin Beer Fest public profile"],
      ["Helles Lager", "Helles Lager", 4.8, null, "Crisp clear golden lager with bready malt character and a dry finish.", 4.35, 1.046, 1.009, 11, "Untappd / Dunedin Beer Fest public profile"],
      ["Black Shag Coffee Stout", "Foreign Export Stout", 6, 60, "Black stout with tan head, dark plum, chocolate and a strong Black Shag coffee hit.", 4.55, 1.064, 1.018, 18, "Untappd / Dunedin Beer Fest public profile"],
      ["Rakiura", "American Amber / Red Ale", 5.4, 38, "Copper red ale with malty aroma, American hop character, fruit tones and citrus finish.", 4.45, 1.054, 1.012, 18, "Untappd public profile"],
      ["A Stone's Throw", "New Zealand Pale Ale", 5.6, 35, "Nelson Sauvin pale ale with stone fruit, gooseberry and grape character.", 4.4, 1.054, 1.011, 18, "Untappd public profile"],
      ["The Dark Nark", "Dark Lager", 5, null, "Dark lager with roasty coffee chocolate and a light mouthfeel.", 4.4, 1.050, 1.010, 12, "Untappd public profile"],
      ["Whalers Bay IPA", "American IPA", 6.4, 60, "Hop-forward American IPA profile reserved for house recipe notes.", 4.4, 1.061, 1.011, 18, "Untappd public profile"]
    ].forEach((row) => beerStmt.run(...row));
  }

  if (scalar("SELECT COUNT(*) AS count FROM batches").count === 0) {
    const batchStmt = db.prepare(`
      INSERT INTO batches
      (batch_no, beer_id, tank_id, status, volume_l, brew_date, package_date, expiry_date, yeast, hops, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    batchStmt.run("HS-2026-0617-01", 1, 1, "Fermenting", 520, "2026-06-14", null, "2026-12-14", "Verdant IPA", "Nelson Sauvin, Motueka, Citra", "Prototype seed batch");
    batchStmt.run("HS-2026-0610-02", 4, 2, "Conditioning", 540, "2026-06-10", null, "2026-12-10", "Lager yeast", "Motueka", "Dry hop complete");
    batchStmt.run("HS-2026-0602-03", 6, 3, "Ready to package", 480, "2026-06-02", "2026-06-20", "2027-06-20", "English Ale", "East Kent Goldings", "Coffee addition signed off");
    db.prepare("UPDATE tanks SET status = ? WHERE id = ?").run("Fermenting", 1);
    db.prepare("UPDATE tanks SET status = ? WHERE id = ?").run("Conditioning", 2);
    db.prepare("UPDATE tanks SET status = ? WHERE id = ?").run("Packaging", 3);

    const logStmt = db.prepare(`
      INSERT INTO logs
      (batch_id, logged_at, stage, temperature_c, gravity, ph, pressure_psi, brix, dissolved_oxygen_ppb, carbonation_vol, volume_l, cip_verified, sanitation, sensory, corrective_action, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    [
      [1, "2026-06-14T10:00", "Knockout", 19.2, 1.058, 5.18, 0, 14.2, 22, null, 520, 1, "CIP verified, peracetic acid pass", "Sweet wort, clean citrus", "", "Yeast pitched at 10:20"],
      [1, "2026-06-15T09:00", "Fermentation", 19.4, 1.038, 4.72, 2, 9.8, 18, null, 518, 0, "", "Active krausen, clean aroma", "", ""],
      [1, "2026-06-16T09:00", "Fermentation", 19.1, 1.020, 4.48, 5, 5.1, 14, null, 516, 0, "", "Tropical hop character building", "", "Spunding set"],
      [2, "2026-06-10T11:00", "Knockout", 12.1, 1.050, 5.12, 0, 12.4, 19, null, 540, 1, "CIP verified", "Clean pilsner wort", "", ""],
      [2, "2026-06-13T08:40", "Fermentation", 12.4, 1.019, 4.46, 3, 4.9, 15, null, 538, 0, "", "Lemon/lime notes", "", ""],
      [2, "2026-06-16T08:30", "Conditioning", 3.2, 1.008, 4.31, 10, 2.1, 11, 2.2, 536, 0, "", "Bright and crisp", "", "Crash complete"],
      [3, "2026-06-02T12:00", "Knockout", 18.4, 1.064, 5.22, 0, 15.6, 24, null, 480, 1, "CIP verified", "Roast and coffee base", "", ""],
      [3, "2026-06-09T09:15", "Conditioning", 3.8, 1.018, 4.58, 8, 4.6, 12, 2.1, 476, 0, "", "Coffee, plum, chocolate", "", "Coffee addition complete"],
      [3, "2026-06-16T10:45", "Packaging QA", 2.1, 1.018, 4.52, 12, 4.6, 9, 2.45, 474, 0, "Bright tank transfer line sanitised", "Balanced, no faults", "", "Ready for packaging approval"]
    ].forEach((row) => logStmt.run(...row));
  }

  if (scalar("SELECT COUNT(*) AS count FROM inventory_items").count === 0) {
    const itemStmt = db.prepare(`
      INSERT INTO inventory_items
      (category, name, sku, barcode, unit, quantity, reorder_level, location, supplier, package_size, expiry_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    [
      ["Raw Materials", "Gladfield Ale Malt", "RM-MALT-ALE", "9421902960011", "kg", 250, 75, "Dry store", "Gladfield Malt", "25 kg sack", "2027-03-01", "Base malt for pale ales and hazies"],
      ["Raw Materials", "Motueka Hop Pellets", "RM-HOP-MOT", "9421902960103", "kg", 8.5, 3, "Freezer", "NZ Hops", "5 kg foil", "2027-01-15", "NZ pilsner and hazy additions"],
      ["Raw Materials", "Nelson Sauvin Hop Pellets", "RM-HOP-NS", "9421902960110", "kg", 6, 2, "Freezer", "NZ Hops", "5 kg foil", "2027-02-01", "Pale ale and IPA aroma"],
      ["Raw Materials", "Verdant IPA Yeast", "RM-YEAST-VIPA", "9421902960202", "pack", 12, 4, "Yeast fridge", "Lallemand", "500 g brick", "2026-11-30", "Hazy fermentation"],
      ["Raw Materials", "Peracetic Acid Sanitiser", "RM-CHEM-PAA", "9421902960301", "L", 18, 5, "Chemical store", "Brewery supplier", "20 L drum", "2027-06-01", "CIP and sanitation"],
      ["Ready for Sale", "Hatch's Hill Hazy 440ml Can", "FG-HATCH-440", "9421902961001", "can", 720, 120, "Cold room", "Hopsession", "24 can carton", "2026-12-14", "Retail and taproom stock"],
      ["Ready for Sale", "Stumped NZ Pilsner 30L Keg", "FG-STUMPED-30", "9421902961100", "keg", 14, 4, "Cold room", "Hopsession", "30 L keg", "2026-12-10", "Wholesale keg stock"],
      ["Ready for Sale", "Black Shag Coffee Stout 440ml Can", "FG-SHAG-440", "9421902961209", "can", 360, 96, "Cold room", "Hopsession", "24 can carton", "2027-06-20", "Retail and cellar door"]
    ].forEach((row) => itemStmt.run(...row));

    const movementStmt = db.prepare(`
      INSERT INTO inventory_movements (item_id, movement_type, quantity_delta, reason, reference)
      VALUES (?, 'Initial count', ?, 'Prototype opening balance', 'seed')
    `);
    db.prepare("SELECT id, quantity FROM inventory_items").all().forEach((item) => {
      movementStmt.run(item.id, item.quantity);
    });
  }
}

seed();

if (tankStatusColumnAdded) {
  db.prepare("UPDATE tanks SET status = 'Fermenting' WHERE id IN (SELECT tank_id FROM batches WHERE status = 'Fermenting')").run();
  db.prepare("UPDATE tanks SET status = 'Conditioning' WHERE id IN (SELECT tank_id FROM batches WHERE status = 'Conditioning')").run();
  db.prepare("UPDATE tanks SET status = 'Packaging' WHERE id IN (SELECT tank_id FROM batches WHERE status = 'Ready to package')").run();
}

// --- Migrations: correct beer names to match Hopsession NZ website ---
const beerNameFixes = [
  ["Burt", "Burt APA"],
  ["Stumped", "Stumped NZ Pilsner"],
  ["Whaler's Bay IPA", "Whalers Bay IPA"],
  ["Rakiura Amber Ale", "Rakiura"],
];
const updateBeerName = db.prepare("UPDATE beers SET name = ? WHERE name = ?");
beerNameFixes.forEach(([newName, oldName]) => updateBeerName.run(newName, oldName));

// --- Migrations: correct batch names referencing renamed beers ---
// (batch_no corrections for the 3 seed batches, if needed)
// Batch HS-2026-0617-01 references beer_id=1 (Hatch's Hill Hazy) — no change needed
// Batch HS-2026-0610-02 references beer_id=4 (now "Stumped") — name in beers table updated above
// Batch HS-2026-0602-03 references beer_id=6 (Black Shag Coffee Stout) — no change needed

// --- Migrations: insert 3 real concurrent Hopsession NZ brews if not already present ---
{
  const beerByName = (name) => db.prepare("SELECT id FROM beers WHERE name = ?").get(name);
  const tankByName = (name) => db.prepare("SELECT id FROM tanks WHERE name = ?").get(name);
  const batchExists = (batch_no) => db.prepare("SELECT 1 FROM batches WHERE batch_no = ?").get(batch_no);

  // Brew 1: Hatch's Hill Hazy in Uni 1 — Fermenting (brewed 14 Jun 2026)
  if (!batchExists("HS-2026-0614-01")) {
    const beer = beerByName("Hatch's Hill Hazy");
    const tank = tankByName("Uni 1");
    if (beer && tank) {
      // Remove any existing batch in Uni 1 that was a seed placeholder
      db.prepare("DELETE FROM batches WHERE tank_id = ? AND batch_no = 'HS-2026-0617-01'").run(tank.id);
      db.prepare(`
        INSERT INTO batches (batch_no, beer_id, tank_id, status, volume_l, brew_date, operator, yeast, hops, notes, current_step)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run("HS-2026-0614-01", beer.id, tank.id, "Fermenting", 520, "2026-06-14", "Nathan", "Verdant IPA", "Nelson Sauvin, Motueka, Citra", "Day 5 fermentation tracking well.", "fermentation");
      db.prepare("UPDATE tanks SET status = 'Fermenting' WHERE id = ?").run(tank.id);

      const b1 = db.prepare("SELECT id FROM batches WHERE batch_no = 'HS-2026-0614-01'").get();
      const logStmt = db.prepare(`
        INSERT INTO logs (batch_id, logged_at, stage, temperature_c, gravity, ph, pressure_psi, brix, dissolved_oxygen_ppb, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      logStmt.run(b1.id, "2026-06-14T10:00", "Knockout", 19.2, 1.058, 5.18, 0, 14.2, 22, "Yeast pitched at 10:20");
      logStmt.run(b1.id, "2026-06-15T09:00", "Fermentation", 19.4, 1.038, 4.72, 2, 9.8, 18, "Active krausen, clean aroma");
      logStmt.run(b1.id, "2026-06-16T09:00", "Fermentation", 19.1, 1.028, 4.55, 4, 7.2, 16, "Tropical hop character building");
      logStmt.run(b1.id, "2026-06-17T09:00", "Fermentation", 19.0, 1.020, 4.50, 5, 5.1, 14, "Spunding set at 10 PSI");
      logStmt.run(b1.id, "2026-06-18T09:00", "Fermentation", 18.9, 1.016, 4.48, 6, 4.1, 12, "Gravity dropping steadily");
      logStmt.run(b1.id, "2026-06-19T08:30", "Fermentation", 18.8, 1.014, 4.46, 6, 3.6, 11, "Approaching target FG 1.012");
    }
  }

  // Brew 2: Stumped NZ Pilsner in Uni 2 — Conditioning (brewed 10 Jun 2026)
  if (!batchExists("HS-2026-0610-02")) {
    const beer = beerByName("Stumped");
    const tank = tankByName("Uni 2");
    if (beer && tank) {
      db.prepare(`
        INSERT INTO batches (batch_no, beer_id, tank_id, status, volume_l, brew_date, operator, yeast, hops, notes, current_step)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run("HS-2026-0610-02", beer.id, tank.id, "Conditioning", 540, "2026-06-10", "Nathan", "Lager yeast W-34/70", "Motueka, Riwaka", "Dry hop complete, crashing.", "conditioning");
      db.prepare("UPDATE tanks SET status = 'Conditioning' WHERE id = ?").run(tank.id);

      const b2 = db.prepare("SELECT id FROM batches WHERE batch_no = 'HS-2026-0610-02'").get();
      const logStmt2 = db.prepare(`
        INSERT INTO logs (batch_id, logged_at, stage, temperature_c, gravity, ph, pressure_psi, brix, dissolved_oxygen_ppb, carbonation_vol, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      logStmt2.run(b2.id, "2026-06-10T11:00", "Knockout", 12.1, 1.050, 5.12, 0, 12.4, 19, null, "Clean pilsner wort");
      logStmt2.run(b2.id, "2026-06-13T08:40", "Fermentation", 12.4, 1.019, 4.46, 3, 4.9, 15, null, "Lemon/lime notes emerging");
      logStmt2.run(b2.id, "2026-06-16T08:30", "Conditioning", 3.2, 1.008, 4.31, 10, 2.1, 11, 2.2, "Crash complete, bright and crisp");
      logStmt2.run(b2.id, "2026-06-19T08:00", "Conditioning", 1.8, 1.008, 4.30, 12, 2.1, 9, 2.4, "Carbonation on target, nearly ready");
    }
  }

  // Brew 3: Burt APA in Uni 3 — Planned / Brew day (brewed 19 Jun 2026)
  if (!batchExists("HS-2026-0619-03")) {
    const beer = beerByName("Burt");
    const tank = tankByName("Uni 3");
    if (beer && tank) {
      db.prepare(`
        INSERT INTO batches (batch_no, beer_id, tank_id, status, volume_l, brew_date, operator, yeast, hops, notes, current_step)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run("HS-2026-0619-03", beer.id, tank.id, "Planned", 500, "2026-06-19", "Nathan", "US-05", "Citra, Mosaic, Simcoe", "Brew day today.", "setup");
      db.prepare("UPDATE tanks SET status = 'Brew' WHERE id = ?").run(tank.id);
    }
  }
}

function backupDatabase(reason = "scheduled") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `brewers-companion-${stamp}-${reason}.sqlite`);
  db.exec("PRAGMA wal_checkpoint(FULL);");
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

backupDatabase("startup");
setInterval(() => backupDatabase("scheduled"), 1000 * 60 * 60 * 6);

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

function parseProcessData(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
}

function normalizeBatch(batch) {
  if (!batch) return null;
  return {
    ...batch,
    process_data: parseProcessData(batch.process_data),
    current_step: batch.current_step || "setup"
  };
}

function getBatch(id) {
  const batch = db.prepare(`
    SELECT b.*, beers.name AS beer_name, beers.style, beers.abv, beers.ibu, beers.profile,
           beers.target_ph, beers.target_og, beers.target_fg, beers.fermentation_temp_c,
           tanks.name AS tank_name, tanks.capacity_l, tanks.type AS tank_type
    FROM batches b
    JOIN beers ON beers.id = b.beer_id
    JOIN tanks ON tanks.id = b.tank_id
    WHERE b.id = ?
  `).get(id);
  return normalizeBatch(batch);
}

function getLatestLogs() {
  return db.prepare(`
    SELECT logs.*
    FROM logs
    JOIN (
      SELECT batch_id, MAX(logged_at) AS logged_at
      FROM logs
      GROUP BY batch_id
    ) latest ON latest.batch_id = logs.batch_id AND latest.logged_at = logs.logged_at
  `).all();
}

function getInventoryItem(id) {
  return db.prepare("SELECT * FROM inventory_items WHERE id = ?").get(id);
}

function getInventoryMovements() {
  return db.prepare(`
    SELECT inventory_movements.*, inventory_items.name AS item_name, inventory_items.category, inventory_items.unit
    FROM inventory_movements
    JOIN inventory_items ON inventory_items.id = inventory_movements.item_id
    ORDER BY inventory_movements.created_at DESC, inventory_movements.id DESC
    LIMIT 60
  `).all();
}

function normalizeInventoryBody(body) {
  return {
    category: body.category,
    name: body.name || "",
    sku: body.sku || "",
    barcode: body.barcode || null,
    unit: body.unit || "unit",
    quantity: Number(body.quantity || 0),
    reorder_level: Number(body.reorder_level || 0),
    location: "",
    supplier: body.supplier || "",
    package_size: body.package_size || "",
    expiry_date: body.expiry_date || null,
    notes: body.notes || ""
  };
}

function addInventoryMovement(itemId, movementType, quantityDelta, reason, reference) {
  db.prepare(`
    INSERT INTO inventory_movements (item_id, movement_type, quantity_delta, reason, reference)
    VALUES (?, ?, ?, ?, ?)
  `).run(itemId, movementType, quantityDelta, reason, reference);
}

function inventoryUsageMap(processData) {
  const rows = Array.isArray(processData?.ingredients?.inventoryUsage)
    ? processData.ingredients.inventoryUsage
    : [];
  const usage = new Map();
  rows.forEach((row) => {
    const itemId = Number(row.item_id);
    const quantity = Number(row.quantity);
    if (Number.isFinite(itemId) && itemId > 0 && Number.isFinite(quantity) && quantity > 0) {
      usage.set(itemId, (usage.get(itemId) || 0) + quantity);
    }
  });
  return usage;
}

function reconcileBatchInventoryUsage(batch, previousProcessData, nextProcessData) {
  const previous = inventoryUsageMap(previousProcessData);
  const next = inventoryUsageMap(nextProcessData);
  const itemIds = new Set([...previous.keys(), ...next.keys()]);
  itemIds.forEach((itemId) => {
    const oldQuantity = previous.get(itemId) || 0;
    const newQuantity = next.get(itemId) || 0;
    const quantityDelta = oldQuantity - newQuantity;
    if (Math.abs(quantityDelta) < 0.000001) return;
    const item = getInventoryItem(itemId);
    if (!item) return;
    addInventoryMovement(
      itemId,
      "Brew usage",
      quantityDelta,
      `Brewing wizard ${quantityDelta < 0 ? "consumption" : "reversal"}`,
      batch.batch_no
    );
    db.prepare("UPDATE inventory_items SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(quantityDelta, itemId);
  });
}

const brewStepLabels = {
  setup: "Setup",
  ingredients: "Ingredients",
  mash: "Mash",
  boil: "Wort boil",
  fermentation: "Fermentation",
  conditioning: "Conditioning",
  packaging: "Packaging"
};

const processFieldLabels = {
  brewDate: "Brew date",
  volumeL: "Batch volume L",
  tankReady: "Tank ready",
  setupNotes: "Setup notes",
  maltWeight: "Malt weight",
  hopSchedule: "Hop schedule",
  yeast: "Yeast",
  waterVolume: "Water volume",
  ingredientNotes: "Ingredient notes",
  strikeTemp: "Strike temperature C",
  mashTemp: "Mash temperature C",
  mashDuration: "Mash duration",
  mashNotes: "Mash notes",
  boilDuration: "Boil duration",
  hopAdditions: "Hop additions",
  kettleGravity: "Kettle gravity",
  boilNotes: "Boil notes",
  fermentationTemp: "Fermentation temperature C",
  targetOG: "Target OG",
  targetFG: "Target FG",
  fermentationNotes: "Fermentation notes",
  conditioningDays: "Conditioning days",
  clarityGoal: "Clarity goal",
  conditioningNotes: "Conditioning notes",
  packagingDate: "Packaging date",
  qaChecks: "QA checks",
  packagingNotes: "Packaging notes"
};

function writePdfHeading(doc, title) {
  doc.moveDown(0.7);
  doc.fontSize(13).text(title, { underline: true });
  doc.moveDown(0.2);
}

function writePdfLine(doc, label, value) {
  doc.fontSize(9.5).text(`${label}: ${value === null || value === undefined || value === "" ? "N/A" : value}`);
}

function writeProcessStep(doc, stepId, data) {
  const stepData = data?.[stepId];
  if (!stepData || typeof stepData !== "object") return;
  writePdfHeading(doc, brewStepLabels[stepId] || stepId);
  Object.entries(stepData).forEach(([key, value]) => {
    if (key === "inventoryUsage") return;
    if (value === "" || value === null || value === undefined) return;
    writePdfLine(doc, processFieldLabels[key] || key, value);
  });
  if (stepId === "ingredients" && Array.isArray(stepData.inventoryUsage) && stepData.inventoryUsage.length) {
    doc.moveDown(0.2);
    doc.fontSize(10).text("Inventory usage");
    stepData.inventoryUsage.forEach((row) => {
      const item = getInventoryItem(Number(row.item_id));
      const name = item?.name || row.item_name || `Item ${row.item_id}`;
      writePdfLine(doc, name, `${row.quantity || 0} ${row.unit || item?.unit || ""}`.trim());
    });
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, database: dbPath });
});

app.get("/api/bootstrap", (_req, res) => {
  const tanks = db.prepare("SELECT * FROM tanks ORDER BY id").all();
  const beers = db.prepare("SELECT * FROM beers ORDER BY name").all();
  const batches = db.prepare(`
    SELECT b.*, beers.name AS beer_name, beers.style, beers.abv, beers.ibu,
           beers.target_og, beers.target_fg, beers.fermentation_temp_c, beers.target_ph, beers.profile,
           b.process_data, b.current_step,
           tanks.name AS tank_name, tanks.capacity_l
    FROM batches b
    JOIN beers ON beers.id = b.beer_id
    JOIN tanks ON tanks.id = b.tank_id
    ORDER BY CASE b.status
      WHEN 'Fermenting' THEN 1
      WHEN 'Conditioning' THEN 2
      WHEN 'Ready to package' THEN 3
      ELSE 4
    END, b.brew_date DESC
  `).all().map(normalizeBatch);
  const logs = db.prepare("SELECT * FROM logs ORDER BY logged_at ASC").all();
  const inventoryItems = db.prepare("SELECT * FROM inventory_items ORDER BY category, name").all();
  const inventoryMovements = getInventoryMovements();
  const selectedBatchId = getSetting("selectedBatchId");
  res.json({
    tanks,
    beers,
    batches,
    logs,
    latestLogs: getLatestLogs(),
    inventoryItems,
    inventoryMovements,
    settings: {
      selectedBatchId: selectedBatchId ? Number(selectedBatchId) : null
    }
  });
});

app.get("/api/inventory/barcode/:barcode", (req, res) => {
  const item = db.prepare("SELECT * FROM inventory_items WHERE barcode = ?").get(req.params.barcode);
  if (!item) {
    res.status(404).json({ error: "Inventory item not found" });
    return;
  }
  res.json(item);
});

app.post("/api/inventory/items", (req, res) => {
  const body = req.body;
  if (!inventoryCategories.includes(body.category)) {
    res.status(400).json({ error: "Invalid inventory category", allowed: inventoryCategories });
    return;
  }
  const existing = body.barcode ? db.prepare("SELECT * FROM inventory_items WHERE barcode = ?").get(body.barcode) : null;
  if (existing) {
    res.status(409).json({ error: "Barcode already exists", item: existing });
    return;
  }
  const stmt = db.prepare(`
    INSERT INTO inventory_items
    (category, name, sku, barcode, unit, quantity, reorder_level, location, supplier, package_size, expiry_date, notes)
    VALUES (@category, @name, @sku, @barcode, @unit, @quantity, @reorder_level, @location, @supplier, @package_size, @expiry_date, @notes)
  `);
  const result = stmt.run(normalizeInventoryBody(body));
  const item = getInventoryItem(result.lastInsertRowid);
  addInventoryMovement(item.id, "Initial count", item.quantity, "Opening stock", "manual setup");
  res.status(201).json(item);
});

app.patch("/api/inventory/items/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!getInventoryItem(id)) {
    res.status(404).json({ error: "Inventory item not found" });
    return;
  }
  if (!inventoryCategories.includes(req.body.category)) {
    res.status(400).json({ error: "Invalid inventory category", allowed: inventoryCategories });
    return;
  }
  const duplicate = req.body.barcode
    ? db.prepare("SELECT id FROM inventory_items WHERE barcode = ? AND id != ?").get(req.body.barcode, id)
    : null;
  if (duplicate) {
    res.status(409).json({ error: "Barcode already exists on another item" });
    return;
  }
  const stmt = db.prepare(`
    UPDATE inventory_items
    SET category = @category,
        name = @name,
        sku = @sku,
        barcode = @barcode,
        unit = @unit,
        reorder_level = @reorder_level,
        location = @location,
        supplier = @supplier,
        package_size = @package_size,
        expiry_date = @expiry_date,
        notes = @notes,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);
  stmt.run({ ...normalizeInventoryBody(req.body), id });
  res.json(getInventoryItem(id));
});

app.post("/api/inventory/items/:id/movements", (req, res) => {
  const id = Number(req.params.id);
  if (!getInventoryItem(id)) {
    res.status(404).json({ error: "Inventory item not found" });
    return;
  }
  const delta = nullableNumber(req.body.quantity_delta);
  if (!Number.isFinite(delta) || delta === 0) {
    res.status(400).json({ error: "Movement quantity must be a non-zero number" });
    return;
  }
  addInventoryMovement(id, req.body.movement_type || "Adjustment", delta, req.body.reason || "", req.body.reference || "");
  db.prepare("UPDATE inventory_items SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(delta, id);
  res.json({ item: getInventoryItem(id), movements: getInventoryMovements() });
});

app.post("/api/batches", (req, res) => {
  const body = req.body;
  const stmt = db.prepare(`
    INSERT INTO batches
    (batch_no, beer_id, tank_id, status, volume_l, brew_date, package_date, expiry_date, operator, yeast, hops, notes, process_data, current_step)
    VALUES (@batch_no, @beer_id, @tank_id, @status, @volume_l, @brew_date, @package_date, @expiry_date, @operator, @yeast, @hops, @notes, @process_data, @current_step)
  `);
  const result = stmt.run({
    batch_no: body.batch_no,
    beer_id: Number(body.beer_id),
    tank_id: Number(body.tank_id),
    status: body.status || "Planned",
    volume_l: Number(body.volume_l || 0),
    brew_date: body.brew_date,
    package_date: body.package_date || null,
    expiry_date: body.expiry_date || null,
    operator: body.operator || "Hopsession",
    yeast: body.yeast || "",
    hops: body.hops || "",
    notes: body.notes || "",
    process_data: JSON.stringify({}),
    current_step: "setup"
  });
  db.prepare("UPDATE tanks SET status = ? WHERE id = ?").run(tankStatusForBatch(body.status || "Planned"), Number(body.tank_id));
  res.status(201).json(getBatch(result.lastInsertRowid));
});

app.patch("/api/tanks/:id/status", (req, res) => {
  const status = req.body?.status;
  if (!tankStatuses.includes(status)) {
    res.status(400).json({ error: "Invalid tank status", allowed: tankStatuses });
    return;
  }
  const result = db.prepare("UPDATE tanks SET status = ? WHERE id = ?").run(status, Number(req.params.id));
  if (result.changes === 0) {
    res.status(404).json({ error: "Tank not found" });
    return;
  }
  const tank = db.prepare("SELECT * FROM tanks WHERE id = ?").get(Number(req.params.id));
  res.json(tank);
});

app.post("/api/logs", (req, res) => {
  const body = req.body;
  const stmt = db.prepare(`
    INSERT INTO logs
    (batch_id, logged_at, stage, temperature_c, gravity, ph, pressure_psi, brix, dissolved_oxygen_ppb, carbonation_vol, volume_l, cip_verified, sanitation, sensory, corrective_action, notes)
    VALUES (@batch_id, @logged_at, @stage, @temperature_c, @gravity, @ph, @pressure_psi, @brix, @dissolved_oxygen_ppb, @carbonation_vol, @volume_l, @cip_verified, @sanitation, @sensory, @corrective_action, @notes)
  `);
  const result = stmt.run({
    batch_id: Number(body.batch_id),
    logged_at: body.logged_at,
    stage: body.stage,
    temperature_c: nullableNumber(body.temperature_c),
    gravity: nullableNumber(body.gravity),
    ph: nullableNumber(body.ph),
    pressure_psi: nullableNumber(body.pressure_psi),
    brix: nullableNumber(body.brix),
    dissolved_oxygen_ppb: nullableNumber(body.dissolved_oxygen_ppb),
    carbonation_vol: nullableNumber(body.carbonation_vol),
    volume_l: nullableNumber(body.volume_l),
    cip_verified: body.cip_verified ? 1 : 0,
    sanitation: body.sanitation || "",
    sensory: body.sensory || "",
    corrective_action: body.corrective_action || "",
    notes: body.notes || ""
  });
  const log = db.prepare("SELECT * FROM logs WHERE id = ?").get(result.lastInsertRowid);
  db.prepare("UPDATE batches SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(body.batch_id);
  res.status(201).json(log);
});

app.post("/api/backup", (_req, res) => {
  const backupPath = backupDatabase("manual");
  res.json({ ok: true, backupPath });
});

app.patch("/api/batches/:id/process", (req, res) => {
  const batchId = Number(req.params.id);
  const batch = getBatch(batchId);
  if (!batch) {
    res.status(404).json({ error: "Batch not found" });
    return;
  }

  let processData = batch.process_data || {};
  if (req.body.process_data !== undefined) {
    if (typeof req.body.process_data === "string") {
      try {
        processData = JSON.parse(req.body.process_data);
      } catch (error) {
        processData = {};
      }
    } else if (typeof req.body.process_data === "object") {
      processData = req.body.process_data;
    }
  }

  const currentStep = req.body.current_step !== undefined ? String(req.body.current_step) : batch.current_step || "setup";
  const newStatus = req.body.status && tankStatuses.includes(tankStatusForBatch(req.body.status))
    ? req.body.status
    : null;

  if (req.body.process_data !== undefined) {
    reconcileBatchInventoryUsage(batch, batch.process_data || {}, processData);
  }

  if (newStatus) {
    db.prepare(`
      UPDATE batches
      SET process_data = ?, current_step = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(processData), currentStep, newStatus, batchId);
    const tankStatus = tankStatusForBatch(newStatus);
    db.prepare("UPDATE tanks SET status = ? WHERE id = ?").run(tankStatus, batch.tank_id);
  } else {
    db.prepare(`
      UPDATE batches
      SET process_data = ?, current_step = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(processData), currentStep, batchId);
  }

  res.json(getBatch(batchId));
});

app.patch("/api/settings/:key", (req, res) => {
  const key = req.params.key;
  const value = req.body?.value;
  if (value === undefined || value === null || (typeof value !== "string" && typeof value !== "number")) {
    res.status(400).json({ error: "Invalid setting value" });
    return;
  }
  setSetting(key, String(value));
  res.json({ key, value: String(value) });
});

app.get("/api/batches/:id/pdf", (req, res) => {
  const batch = getBatch(req.params.id);
  if (!batch) {
    res.status(404).json({ error: "Batch not found" });
    return;
  }
  const logs = db.prepare("SELECT * FROM logs WHERE batch_id = ? ORDER BY logged_at").all(req.params.id);
  const doc = new PDFDocument({ margin: 42, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${batch.batch_no}-audit-log.pdf"`);
  doc.pipe(res);

  doc.fontSize(20).text("Hopsession Brewing - Batch Audit Packet");
  writePdfHeading(doc, "Batch identity");
  writePdfLine(doc, "Batch", batch.batch_no);
  writePdfLine(doc, "Beer", `${batch.beer_name} (${batch.style})`);
  writePdfLine(doc, "Tank", batch.tank_name);
  writePdfLine(doc, "Tank capacity", `${batch.capacity_l || "N/A"} L`);
  writePdfLine(doc, "Batch volume", `${batch.volume_l} L`);
  writePdfLine(doc, "Status", batch.status);
  writePdfLine(doc, "Current workflow step", brewStepLabels[batch.current_step] || batch.current_step);
  writePdfLine(doc, "Operator", batch.operator);
  writePdfLine(doc, "Brew date", batch.brew_date);
  writePdfLine(doc, "Package date", batch.package_date || "TBC");
  writePdfLine(doc, "Expiry", batch.expiry_date || "TBC");
  writePdfLine(doc, "Yeast", batch.yeast || "Not recorded");
  writePdfLine(doc, "Hops", batch.hops || "Not recorded");
  writePdfLine(doc, "Batch notes", batch.notes || "Not recorded");

  writePdfHeading(doc, "Recipe and targets");
  writePdfLine(doc, "Profile", batch.profile);
  writePdfLine(doc, "ABV", display(batch.abv, "%"));
  writePdfLine(doc, "IBU", display(batch.ibu));
  writePdfLine(doc, "Target pH", display(batch.target_ph));
  writePdfLine(doc, "Target OG", display(batch.target_og));
  writePdfLine(doc, "Target FG", display(batch.target_fg));
  writePdfLine(doc, "Fermentation temperature", display(batch.fermentation_temp_c, " C"));

  writePdfHeading(doc, "Brewing workflow");
  ["setup", "ingredients", "mash", "boil", "fermentation", "conditioning", "packaging"].forEach((stepId) => {
    writeProcessStep(doc, stepId, batch.process_data);
  });

  writePdfHeading(doc, "Production log entries");
  logs.forEach((log) => {
    doc.moveDown(0.35);
    doc.fontSize(10).text(`${formatDate(log.logged_at)} | ${log.stage}`, { continued: false });
    writePdfLine(doc, "Temperature", display(log.temperature_c, " C"));
    writePdfLine(doc, "Gravity", display(log.gravity));
    writePdfLine(doc, "pH", display(log.ph));
    writePdfLine(doc, "Pressure", display(log.pressure_psi, " psi"));
    writePdfLine(doc, "Brix", display(log.brix));
    writePdfLine(doc, "Dissolved oxygen", display(log.dissolved_oxygen_ppb, " ppb"));
    writePdfLine(doc, "Carbonation", display(log.carbonation_vol, " vols"));
    writePdfLine(doc, "Volume", display(log.volume_l, " L"));
    writePdfLine(doc, "CIP verified", log.cip_verified ? "Yes" : "No");
    writePdfLine(doc, "Sanitation", log.sanitation || "No sanitation note");
    writePdfLine(doc, "Sensory", log.sensory || "Not recorded");
    writePdfLine(doc, "Corrective action", log.corrective_action || "None recorded");
    writePdfLine(doc, "Notes", log.notes || "Not recorded");
  });
  doc.moveDown();
  doc.fontSize(9).text(`Generated: ${new Date().toLocaleString("en-NZ")}`);
  doc.end();
});

function nullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  return Number(value);
}

function display(value, suffix = "") {
  return value === null || value === undefined ? "N/A" : `${value}${suffix}`;
}

function formatDate(value) {
  return new Date(value).toLocaleString("en-NZ", { dateStyle: "medium", timeStyle: "short" });
}

function tankStatusForBatch(status) {
  return {
    Planned: "Brew",
    Fermenting: "Fermenting",
    Conditioning: "Conditioning",
    "Ready to package": "Packaging",
    Packaged: "Cleaning"
  }[status] || "Brew";
}

const distDir = path.join(rootDir, "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

app.listen(port, () => {
  console.log(`Hopsession Brewing app running on http://localhost:${port}`);
});
