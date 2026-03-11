'use strict';

const cors = require('cors');
const express = require('express');
const { fetchHcaptchaHsw, toOutput } = require('./hcaptcha');

function createApp(config, store, monitor, startedAt) {
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_request, response) => {
    response.json({
      ok: true,
      startedAt,
      lastRunAt: store.db.data.lastRunAt,
      lastSuccessAt: store.db.data.lastSuccessAt,
      lastError: store.db.data.lastError,
      stateFile: config.stateFile,
      targets: config.targets.length,
    });
  });

  app.get('/state', (_request, response) => {
    response.json({
      config: {
        pollIntervalMs: config.pollIntervalMs,
        discordWebhookEnabled: Boolean(config.discordWebhookUrl),
        corsOrigin: config.corsOrigin,
        stateFile: config.stateFile,
        targets: config.targets,
      },
      state: store.db.data,
    });
  });

  app.post('/check', async (request, response) => {
    const sitekey = typeof request.body?.sitekey === 'string' ? request.body.sitekey.trim() : '';

    if (!sitekey) {
      response.status(400).json({ error: 'Missing sitekey' });
      return;
    }

    const result = await fetchHcaptchaHsw({
      sitekey,
      host:
        typeof request.body?.host === 'string' && request.body.host.trim()
          ? request.body.host.trim()
          : config.defaultHost,
      timeout: Number(request.body?.timeout),
    });

    response.json(toOutput(result, request.body?.minimal !== false));
  });

  app.post('/run', async (_request, response) => {
    response.json({ ok: true, results: await monitor.runChecks() });
  });

  app.use((error, _request, response, _next) => {
    response.status(500).json({ error: error.message });
  });

  return app;
}

module.exports = { createApp };
