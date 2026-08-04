'use strict';

const { CONTRACT_STATUS, TASK_TYPES, freezeContract } = require('./common');

/**
 * @typedef {'system'|'user'|'assistant'} ChatRole
 * @typedef {'chat'|'pdf'|'vision'} ChatTaskType
 * @typedef {{role: ChatRole|string, content: string, images?: string[]}} ChatMessage
 * @typedef {{taskType?: ChatTaskType, messages: ChatMessage[], selectedModel?: string, temperature?: number, maxTokens?: number}} ChatRequest
 * @typedef {{ok: true, provider: string, model: string, content: string}} ChatResponse
 */

const CHAT_LIMITS = freezeContract({
  bodyBytes: 6 * 1024 * 1024,
  rateLimit: 60,
  rateWindowMs: 60 * 1000,
  functionBudgetMs: 55 * 1000,
  maxImagesPerMessage: 20,
  retainedConversationMessages: {
    chat: 4,
    vision: 4,
    pdf: 8
  },
  maxMessageCharacters: {
    chat: 20000,
    vision: 20000,
    pdf: 40000
  }
});

const CHAT_REQUEST_CONTRACT = freezeContract({
  name: 'ChatRequest',
  status: CONTRACT_STATUS,
  transport: 'JSON',
  taskTypes: TASK_TYPES,
  required: ['messages'],
  optional: ['taskType', 'selectedModel', 'temperature', 'maxTokens'],
  defaults: {
    taskType: 'chat',
    selectedModel: '',
    temperature: 0.7,
    maxTokens: 1024
  },
  message: {
    required: [],
    optional: ['role', 'content', 'images'],
    defaults: { role: 'user', content: '' }
  }
});

const CHAT_RESPONSE_CONTRACT = freezeContract({
  name: 'ChatResponse',
  status: CONTRACT_STATUS,
  required: ['ok', 'provider', 'model', 'content'],
  constants: { ok: true }
});

module.exports = {
  CHAT_LIMITS,
  CHAT_REQUEST_CONTRACT,
  CHAT_RESPONSE_CONTRACT
};
