import "dotenv/config";
import { startGhostNotesWorker } from "../modules/ghost-notes/ghost-notes.worker.js";

const worker = startGhostNotesWorker();
if (!worker) {
  console.error(
    "[ghost-notes] Worker exit — set GHOST_NOTES_ENABLED=1 and REDIS_URL",
  );
  process.exit(1);
}

process.on("SIGINT", () => {
  void worker.close().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void worker.close().then(() => process.exit(0));
});
