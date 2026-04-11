import { initializeDatabase } from "../src/lib/db/schema";

console.log("[Init] Initializing database...");
try {
  initializeDatabase();
  console.log("[Init] Database initialized successfully");
} catch (error) {
  console.error("[Init] Failed to initialize database:", error);
  process.exit(1);
}
