'use strict';

const { CONTRACT_STATUS, freezeContract } = require('./common');

/**
 * @typedef {{prompt: string, width?: number, height?: number, forceProvider?: string}} ImageRequest
 * @typedef {{provider: string, error: string, status?: number|string|null, details?: string|null}} ImageAttempt
 * @typedef {{ok: true, provider: string, images: string[], attempts: ImageAttempt[]}} ImageResponse
 */

const IMAGE_LIMITS = freezeContract({
  bodyBytes: 64 * 1024,
  rateLimit: 15,
  rateWindowMs: 60 * 1000,
  promptCharacters: { min: 1, max: 8000 },
  width: { min: 256, max: 2048, default: 1024 },
  height: { min: 256, max: 2048, default: 1024 }
});

const IMAGE_REQUEST_CONTRACT = freezeContract({
  name: 'ImageRequest',
  status: CONTRACT_STATUS,
  required: ['prompt'],
  optional: ['width', 'height', 'forceProvider'],
  defaults: { width: 1024, height: 1024, forceProvider: '' }
});

const IMAGE_RESPONSE_CONTRACT = freezeContract({
  name: 'ImageResponse',
  status: CONTRACT_STATUS,
  required: ['ok', 'provider', 'images', 'attempts'],
  constants: { ok: true }
});

const IMAGE_SEARCH_REQUEST_CONTRACT = freezeContract({
  name: 'ImageSearchRequest',
  status: CONTRACT_STATUS,
  required: ['query'],
  limits: { bodyBytes: 16 * 1024, queryCharacters: 200, resultCount: 8 }
});

module.exports = {
  IMAGE_LIMITS,
  IMAGE_REQUEST_CONTRACT,
  IMAGE_RESPONSE_CONTRACT,
  IMAGE_SEARCH_REQUEST_CONTRACT
};
