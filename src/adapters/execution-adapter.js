'use strict';

const { AdapterNotConfiguredError } = require('./adapter-not-configured-error');

class ExecutionAdapter {
  execute() {
    throw new AdapterNotConfiguredError('ExecutionAdapter', 'execute');
  }
}

module.exports = { ExecutionAdapter };
