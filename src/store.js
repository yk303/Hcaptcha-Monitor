'use strict';

const { mkdir } = require('node:fs/promises');
const { dirname } = require('node:path');
const { JSONFilePreset } = require('lowdb/node');

async function createStore(stateFile) {
  await mkdir(dirname(stateFile), { recursive: true });

  const db = await JSONFilePreset(stateFile, {
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: null,
    targets: {},
  });

  return {
    db,
    save() {
      return db.write();
    },
  };
}

module.exports = { createStore };
