import { config } from "./config.js";
import { initDash } from "./dash.js";
import { closeDb } from "./db.js";
import { buildServer } from "./server.js";
import { startWatcher, stopWatcher } from "./watcher.js";

const app = buildServer();

initDash()
  .then(() => app.listen({ host: "0.0.0.0", port: config.port }))
  .then(() => {
    app.log.info(`dash-pay listening on :${config.port} (${config.network})`);
    startWatcher();
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

// Graceful shutdown: stop the expiry timer, stop accepting requests, close the
// DB. In-flight settlements are not force-killed — they finish or are recovered
// by reconcile on next start.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`received ${signal}, shutting down`);
  stopWatcher();
  try {
    await app.close();
    closeDb();
  } catch (err) {
    app.log.error(err);
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
