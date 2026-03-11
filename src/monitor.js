'use strict';

const { fetchHcaptchaHsw, toOutput } = require('./hcaptcha');
const { notifyDiscord } = require('./notifier');

function targetKey({ host, sitekey }) {
  return `${host}:${sitekey}`;
}

function createMonitor(config, store) {
  let activeRun = null;

  async function checkTarget(target) {
    const current = {
      label: target.label,
      error: null,
      ...toOutput(await fetchHcaptchaHsw(target), true),
    };
    const key = targetKey(target);
    const previous = store.db.data.targets[key];
    const next = {
      ...current,
      changedAt:
        previous && previous.signature !== current.signature
          ? current.checkedAt
          : previous?.changedAt || null,
    };

    if (previous && previous.signature !== current.signature) {
      await notifyDiscord(config.discordWebhookUrl, {
        label: target.label,
        host: target.host,
        sitekey: target.sitekey,
        previous,
        current: next,
      });
    }

    store.db.data.targets[key] = next;
    return next;
  }

  async function runChecksInternal() {
    store.db.data.lastRunAt = new Date().toISOString();
    store.db.data.lastError = null;
    const results = [];

    for (const target of config.targets) {
      try {
        results.push({ ok: true, result: await checkTarget(target) });
      } catch (error) {
        const failed = {
          label: target.label,
          host: target.host,
          sitekey: target.sitekey,
          checkedAt: new Date().toISOString(),
          error: error.message,
        };

        store.db.data.targets[targetKey(target)] = {
          ...(store.db.data.targets[targetKey(target)] || {}),
          ...failed,
        };
        store.db.data.lastError = error.message;
        results.push({ ok: false, ...failed });
      }
    }

    store.db.data.lastSuccessAt = new Date().toISOString();
    await store.save();
    return results;
  }

  function runChecks() {
    if (activeRun) {
      return activeRun;
    }

    activeRun = runChecksInternal().finally(() => {
      activeRun = null;
    });

    return activeRun;
  }

  return { runChecks };
}

module.exports = { createMonitor };
