'use strict';

async function notifyDiscord(webhookUrl, change) {
  if (!webhookUrl) {
    return;
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content: [
        'hCaptcha changed',
        `Label: ${change.label}`,
        `Host: ${change.host}`,
        `Sitekey: ${change.sitekey}`,
        `v: ${change.previous.v} -> ${change.current.v}`,
        `l: ${change.previous.l} -> ${change.current.l}`,
        `hsw: ${change.current.hswUrl}`,
        `checkedAt: ${change.current.checkedAt}`,
      ].join('\n'),
    }),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed with status ${response.status}`);
  }
}

module.exports = { notifyDiscord };
