import { config } from "./config.js";
import { initDash } from "./dash.js";
import { buildServer } from "./server.js";
import { startWatcher } from "./watcher.js";

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
