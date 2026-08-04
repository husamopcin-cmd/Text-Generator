'use strict';

const { AdapterNotConfiguredError } = require('./adapter-not-configured-error');

class StreamAdapter {
  open() {
    throw new AdapterNotConfiguredError('StreamAdapter', 'open');
  }
}

module.exports = { StreamAdapter };
