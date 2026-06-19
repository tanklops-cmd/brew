import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("data/brewers-companion.sqlite");
const batch = db.prepare("SELECT id FROM batches WHERE batch_no = 'HS-2026-0602-03'").get();
if (batch) {
  db.prepare("DELETE FROM logs WHERE batch_id = ?").run(batch.id);
  db.prepare("DELETE FROM batches WHERE batch_no = 'HS-2026-0602-03'").run();
  console.log("Removed old HS-2026-0602-03");
} else {
  console.log("Already gone");
}
console.log("--- Final batches ---");
db.prepare("SELECT batch_no, beer_id, tank_id, status FROM batches ORDER BY id").all().forEach(r => console.log(JSON.stringify(r)));
