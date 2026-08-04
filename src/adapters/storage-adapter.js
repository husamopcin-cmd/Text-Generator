'use strict';

const { AdapterNotConfiguredError } = require('./adapter-not-configured-error');

class StorageAdapter {
  load() {
    throw new AdapterNotConfiguredError('StorageAdapter', 'load');
  }

  save() {
    throw new AdapterNotConfiguredError('StorageAdapter', 'save');
  }

  migrate() {
    throw new AdapterNotConfiguredError('StorageAdapter', 'migrate');
  }
}

module.exports = { StorageAdapter };
