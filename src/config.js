'use strict';

const DEFAULT_HOST = 'accounts.hcaptcha.com';

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseTargets() {
  const rawTargets = clean(process.env.HCAP_TARGETS);
  const rawSitekeys = clean(process.env.HCAP_SITEKEYS);

  if (rawTargets) {
    const parsed = JSON.parse(rawTargets);
    if (!Array.isArray(parsed)) {
      throw new Error('HCAP_TARGETS must be a JSON array');
    }
    return parsed
      .map((item, index) => ({
        label: clean(item.label) || `target-${index + 1}`,
        host: clean(item.host) || DEFAULT_HOST,
        sitekey: clean(item.sitekey),
      }))
      .filter((item) => item.sitekey);
  }

  return rawSitekeys
    ? rawSitekeys
        .split(',')
        .map((sitekey, index) => ({
          label: `target-${index + 1}`,
          host: DEFAULT_HOST,
          sitekey: clean(sitekey),
        }))
        .filter((item) => item.sitekey)
    : [];
}

module.exports = {
  clean,
  config: {
    corsOrigin: process.env.CORS_ORIGIN || '*',
    defaultHost: DEFAULT_HOST,
    discordWebhookUrl: clean(process.env.DISCORD_WEBHOOK_URL),
    pollIntervalMs: Math.max(Number(process.env.POLL_INTERVAL_MS) || 600000, 10000),
    port: Number(process.env.PORT) || 3000,
    stateFile: process.env.STATE_FILE || './data/state.json',
    targets: parseTargets(),
  },
};
