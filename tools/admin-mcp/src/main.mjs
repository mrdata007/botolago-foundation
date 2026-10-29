import { readConfig } from "./config.mjs";
import { EncryptedStore } from "./store.mjs";
import { Backend } from "./backend.mjs";
import { createApp } from "./app.mjs";

const config = readConfig();
const store = new EncryptedStore(config.dataDir, config.encryptionKey);
const { app } = createApp(config, store, new Backend(config));
const cleanup = setInterval(() => store.prune(), 60_000).unref();
const server = app.listen(config.port, config.host, () => {
  console.log(
    `BotolaGO Admin MCP listening on ${config.host}:${config.port}; public resource ${config.resource}`,
  );
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    clearInterval(cleanup);
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
