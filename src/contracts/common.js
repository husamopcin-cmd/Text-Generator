'use strict';

function freezeContract(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeContract);
  return Object.freeze(value);
}

const CONTRACT_STATUS = 'compatibility-baseline';

const TASK_TYPES = freezeContract(['chat', 'pdf', 'vision']);

const AI_ERROR_CODES = freezeContract([
  'invalid_request',
  'request_too_large',
  'unsupported_task',
  'unsupported_model',
  'authentication_required',
  'quota_exceeded',
  'provider_not_configured',
  'provider_unauthorized',
  'provider_payment_required',
  'provider_rate_limited',
  'provider_timeout',
  'provider_network_error',
  'provider_error',
  'all_providers_failed',
  'cancelled',
  'internal_error'
]);

const AI_ERROR_CONTRACT = freezeContract({
  name: 'AIError',
  status: CONTRACT_STATUS,
  required: ['ok', 'error'],
  optional: ['message', 'details', 'requestId'],
  compatibilityNote: 'Legacy chat errors use a string error and details.status; normalized engine errors are not routed in production.'
});

module.exports = {
  AI_ERROR_CODES,
  AI_ERROR_CONTRACT,
  CONTRACT_STATUS,
  TASK_TYPES,
  freezeContract
};
