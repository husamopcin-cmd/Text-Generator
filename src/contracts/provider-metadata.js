'use strict';

const { CONTRACT_STATUS, freezeContract } = require('./common');

/**
 * @typedef {{id: string, configured: boolean, tasks: string[], displayName?: string|null, aliases?: {provider: string[], modelSuffix: string[]}, environmentVariable?: string, defaultModel?: string, visionModel?: string, models?: string[], streaming?: boolean, capabilities?: Record<string, boolean>, order?: Record<string, number>}} ProviderMetadata
 */

const PROVIDER_METADATA_CONTRACT = freezeContract({
  name: 'ProviderMetadata',
  status: CONTRACT_STATUS,
  required: ['id', 'configured', 'tasks'],
  optional: [
    'displayName',
    'aliases',
    'environmentVariable',
    'defaultModel',
    'visionModel',
    'models',
    'streaming',
    'capabilities',
    'order'
  ],
  publicationStatus: 'internal-compatibility-metadata-only'
});

module.exports = { PROVIDER_METADATA_CONTRACT };
