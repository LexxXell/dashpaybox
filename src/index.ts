import { config } from "./config.js";
import { buildServer } from "./server.js";
import { startWatcher } from "./watcher.js";

const app = buildServer();
startWatcher();

app
  .listen({ host: "0.0.0.0", port: config.port })
  .then(() => app.log.info(`dash-pay listening on :${config.port} (${config.network})`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
