'use strict';

require('./src/load-env');

const hcaptcha = require('./src/hcaptcha');

if (require.main === module) {
  hcaptcha.runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = hcaptcha;
