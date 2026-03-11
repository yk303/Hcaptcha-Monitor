'use strict';

require('./src/load-env');

const { config } = require('./src/config');
const { createApp } = require('./src/app');
const { createMonitor } = require('./src/monitor');
const { createStore } = require('./src/store');
const { shutdownTls } = require('./src/hcaptcha');

const startedAt = new Date().toISOString();
let timer;
let store;

async function shutdown(exitCode) {
  if (timer) {
    clearInterval(timer);
  }
  if (store) {
    await store.save().catch(() => {});
  }
  await shutdownTls();
  process.exit(exitCode);
}

async function boot() {
  store = await createStore(config.stateFile);
  const monitor = createMonitor(config, store);
  const app = createApp(config, store, monitor, startedAt);

  app.listen(config.port, '0.0.0.0', async () => {
    process.stdout.write(`hcaptcha helper listening on ${config.port}\n`);
    process.stdout.write(`state file: ${config.stateFile}\n`);
    process.stdout.write(`targets loaded: ${config.targets.length}\n`);
    await monitor.runChecks().catch(async (error) => {
      store.db.data.lastError = error.message;
      await store.save();
    });
    timer = setInterval(() => {
      monitor.runChecks().catch(async (error) => {
        store.db.data.lastError = error.message;
        await store.save();
      });
    }, config.pollIntervalMs);
  });
}

process.on('SIGINT', () => {
  shutdown(0).catch(() => process.exit(1));
});

process.on('SIGTERM', () => {
  shutdown(0).catch(() => process.exit(1));
});

boot().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
