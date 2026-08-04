'use strict';

const { AdapterNotConfiguredError } = require('./adapter-not-configured-error');

class ProviderRegistry {
  listCapabilities() {
    throw new AdapterNotConfiguredError('ProviderRegistry', 'listCapabilities');
  }

  resolve() {
    throw new AdapterNotConfiguredError('ProviderRegistry', 'resolve');
  }
}

module.exports = { ProviderRegistry };
