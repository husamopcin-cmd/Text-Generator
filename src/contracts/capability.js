'use strict';

const { CONTRACT_STATUS, freezeContract } = require('./common');

/**
 * @typedef {{provider: string, model: string, tasks: string[], streaming: boolean, enabled: boolean}} Capability
 */

const CAPABILITY_CONTRACT = freezeContract({
  name: 'Capability',
  status: CONTRACT_STATUS,
  required: ['provider', 'model', 'tasks', 'streaming', 'enabled'],
  publicationStatus: 'not-exposed-by-current-public-api'
});

module.exports = { CAPABILITY_CONTRACT };
