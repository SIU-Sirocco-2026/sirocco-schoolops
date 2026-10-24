import { pool } from "./db.js";
const result = await pool.query(
  "SELECT 1 FROM worker_heartbeat WHERE id='phase3' AND last_seen>now()-interval '20 seconds'",
);
await pool.end();
process.exit(result.rowCount ? 0 : 1);
