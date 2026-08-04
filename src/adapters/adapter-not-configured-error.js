'use strict';

class AdapterNotConfiguredError extends Error {
  constructor(adapterName, operation) {
    super(`${adapterName}.${operation} is a Phase 1 skeleton and is not connected to production routing.`);
    this.name = 'AdapterNotConfiguredError';
    this.code = 'adapter_not_configured';
    this.adapter = adapterName;
    this.operation = operation;
  }
}

module.exports = { AdapterNotConfiguredError };
