'use strict';

const { AdapterNotConfiguredError } = require('./adapter-not-configured-error');

class PlatformClient {
  chat() {
    throw new AdapterNotConfiguredError('PlatformClient', 'chat');
  }

  generateImage() {
    throw new AdapterNotConfiguredError('PlatformClient', 'generateImage');
  }

  streamChat() {
    throw new AdapterNotConfiguredError('PlatformClient', 'streamChat');
  }
}

module.exports = { PlatformClient };
