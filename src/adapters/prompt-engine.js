'use strict';

const { AdapterNotConfiguredError } = require('./adapter-not-configured-error');

class PromptEngine {
  compose() {
    throw new AdapterNotConfiguredError('PromptEngine', 'compose');
  }
}

module.exports = { PromptEngine };
