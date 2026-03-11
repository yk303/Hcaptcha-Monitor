'use strict';

const {
  Session,
  ClientIdentifier,
  initTLS,
  destroyTLS,
} = require('node-tls-client');

const VERSION_REGEX = /v1\/([A-Za-z0-9]+)\/static/;
const DEFAULT_HOST = 'accounts.hcaptcha.com';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_CHROME_MAJOR = '131';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let tlsInitialized = false;

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--sitekey' && argv[index + 1]) {
      options.sitekey = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--host' && argv[index + 1]) {
      options.host = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--timeout' && argv[index + 1]) {
      options.timeout = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--minimal') {
      options.minimal = true;
    }
  }

  return options;
}

function printHelp() {
  console.log(
    [
      'Usage:',
      '  node hcaptcha.js --sitekey <sitekey> [--host accounts.hcaptcha.com] [--timeout 30000]',
      '',
      'Environment variables:',
      '  SITEKEY   Required if --sitekey is not provided',
      '  HOST      Optional, defaults to accounts.hcaptcha.com',
      '  TIMEOUT   Optional, defaults to 30000',
      '  MINIMAL   Optional, set to 1 to return only diff-friendly fields',
    ].join('\n')
  );
}

function decodeBase64Url(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function decodeJwtPayload(token) {
  const parts = token.split('.');

  if (parts.length < 2) {
    throw new Error('Invalid JWT: missing payload segment');
  }

  return JSON.parse(decodeBase64Url(parts[1]));
}

function extractVersionFromApiJs(source) {
  const match = source.match(VERSION_REGEX);

  if (!match) {
    throw new Error('Failed to extract hCaptcha version from api.js');
  }

  return match[1];
}

function getScriptHeaders(host) {
  return {
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9',
    referer: `https://${host}/`,
    'sec-ch-ua': `"Google Chrome";v="${DEFAULT_CHROME_MAJOR}", "Chromium";v="${DEFAULT_CHROME_MAJOR}", "Not_A Brand";v="24"`,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'script',
    'sec-fetch-mode': 'no-cors',
    'sec-fetch-site': 'cross-site',
    'user-agent': DEFAULT_USER_AGENT,
  };
}

function getApiHeaders(host) {
  return {
    accept: 'application/json',
    'accept-language': 'en-US,en;q=0.9',
    referer: `https://${host}/`,
    'sec-ch-ua': `"Google Chrome";v="${DEFAULT_CHROME_MAJOR}", "Chromium";v="${DEFAULT_CHROME_MAJOR}", "Not_A Brand";v="24"`,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent': DEFAULT_USER_AGENT,
  };
}

async function requestText(session, url, headers) {
  const response = await session.get(url, {
    additionalDecode: true,
    followRedirects: true,
    headers,
  });

  if (!response.ok) {
    throw new Error(buildRequestError(response, url));
  }

  return response.text();
}

async function requestJson(session, url, headers) {
  const response = await session.get(url, {
    additionalDecode: true,
    followRedirects: true,
    headers,
  });

  if (!response.ok) {
    throw new Error(buildRequestError(response, url));
  }

  return response.json();
}

function buildRequestError(response, url) {
  const body =
    typeof response.body === 'string' && response.body.trim()
      ? ` body=${JSON.stringify(response.body.slice(0, 300))}`
      : '';
  return `Request failed with status ${response.status} for ${url}${body}`;
}

async function ensureTlsInitialized() {
  if (!tlsInitialized) {
    await initTLS();
    tlsInitialized = true;
  }
}

async function shutdownTls() {
  if (tlsInitialized) {
    await destroyTLS();
    tlsInitialized = false;
  }
}

async function fetchHcaptchaHsw(config) {
  const host = config.host || DEFAULT_HOST;
  const sitekey = config.sitekey;
  const timeout =
    Number.isFinite(config.timeout) && config.timeout > 0 ? config.timeout : DEFAULT_TIMEOUT_MS;
  const apiJsUrl = `https://js.hcaptcha.com/1/api.js?reportapi=${encodeURIComponent(`https://${host}`)}`;

  if (!sitekey) {
    throw new Error('Missing sitekey');
  }

  await ensureTlsInitialized();

  const session = new Session({
    clientIdentifier: ClientIdentifier.chrome_131,
    debug: process.env.TLS_DEBUG === '1',
    disableIPV6: true,
    randomTlsExtensionOrder: true,
    timeout,
  });

  try {
    const apiJsSource = await requestText(session, apiJsUrl, getScriptHeaders(host));
    const version = extractVersionFromApiJs(apiJsSource);
    const checksiteconfigUrl = new URL('https://api.hcaptcha.com/checksiteconfig');

    checksiteconfigUrl.searchParams.set('v', version);
    checksiteconfigUrl.searchParams.set('host', host);
    checksiteconfigUrl.searchParams.set('sitekey', sitekey);
    checksiteconfigUrl.searchParams.set('sc', '1');
    checksiteconfigUrl.searchParams.set('swa', '1');
    checksiteconfigUrl.searchParams.set('spst', '1');

    const checksiteconfig = await requestJson(
      session,
      checksiteconfigUrl.toString(),
      getApiHeaders(host)
    );
    const req = checksiteconfig?.c?.req;

    if (!req) {
      throw new Error('Missing c.req in checksiteconfig response');
    }

    const reqPayload = decodeJwtPayload(req);

    if (!reqPayload.l) {
      throw new Error('Missing l in decoded req payload');
    }

    return {
      checkedAt: new Date().toISOString(),
      sitekey,
      host,
      v: version,
      signature: `${version}:${reqPayload.l}`,
      req,
      l: reqPayload.l,
      hswUrl: `https://newassets.hcaptcha.com${reqPayload.l}/hsw.js`,
      reqPayload,
      checksiteconfig,
    };
  } finally {
    await session.close();
  }
}

function toOutput(result, minimal) {
  if (!minimal) {
    return result;
  }

  return {
    checkedAt: result.checkedAt,
    sitekey: result.sitekey,
    host: result.host,
    v: result.v,
    l: result.l,
    hswUrl: result.hswUrl,
    signature: result.signature,
  };
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  try {
    const result = await fetchHcaptchaHsw({
      sitekey: args.sitekey || process.env.SITEKEY,
      host: args.host || process.env.HOST || DEFAULT_HOST,
      timeout: args.timeout || Number(process.env.TIMEOUT),
    });

    process.stdout.write(
      `${JSON.stringify(toOutput(result, args.minimal || process.env.MINIMAL === '1'), null, 2)}\n`
    );
  } finally {
    await shutdownTls();
  }
}

module.exports = {
  decodeJwtPayload,
  ensureTlsInitialized,
  extractVersionFromApiJs,
  fetchHcaptchaHsw,
  runCli,
  shutdownTls,
  toOutput,
};
