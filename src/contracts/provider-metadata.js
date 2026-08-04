'use strict';

const { CONTRACT_STATUS, freezeContract } = require('./common');

/**
 * @typedef {{id: string, configured: boolean, defaultModel?: string, visionModel?: string, tasks: string[]}} ProviderMetadata
 */

const PROVIDER_METADATA_CONTRACT = freezeContract({
  name: 'ProviderMetadata',
  status: CONTRACT_STATUS,
  required: ['id', 'configured', 'tasks'],
  optional: ['defaultModel', 'visionModel'],
  publicationStatus: 'internal-compatibility-metadata-only'
});

module.exports = { PROVIDER_METADATA_CONTRACT };
