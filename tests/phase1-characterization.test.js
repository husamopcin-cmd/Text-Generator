'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
const chatStateCode = fs.readFileSync(path.join(root, 'assets', 'js', 'modules', 'chat-state.js'), 'utf8');
const aiChatModulePath = require.resolve('../netlify/functions/ai-chat');

function extractNamedFunction(source, name) {
  const asyncMarker = `async function ${name}(`;
  const marker = `function ${name}(`;
  const asyncStart = source.indexOf(asyncMarker);
  const start = asyncStart === -1 ? source.indexOf(marker) : asyncStart;
  assert.notEqual(start, -1, `Missing function ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unterminated function ${name}`);
}

async function withFreshChatHandler(environment, run) {
  const keys = [
    'OPENAI_API_KEY', 'CEREBRAS_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY',
    'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'FIREWORKS_API_KEY',
    'TOGETHER_API_KEY', 'XAI_API_KEY', 'ANTHROPIC_API_KEY', 'NODE_ENV',
    'CINOCODE_TEST_ACCESS_BYPASS'
  ];
  const snapshot = new Map(keys.map(key => [key, process.env[key]]));
  const originalFetch = global.fetch;
  try {
    keys.forEach(key => delete process.env[key]);
    process.env.NODE_ENV = 'test';
    process.env.CINOCODE_TEST_ACCESS_BYPASS = '1';
    Object.assign(process.env, environment);
    delete require.cache[aiChatModulePath];
    return await run(require(aiChatModulePath).handler);
  } finally {
    delete require.cache[aiChatModulePath];
    for (const [key, value] of snapshot) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    global.fetch = originalFetch;
  }
}

test('chat payload keeps system messages, bounds conversation history, and preserves selected provider metadata', async () => {
  await withFreshChatHandler({ OPENAI_API_KEY: 'test-openai' }, async handler => {
    let providerBody;
    global.fetch = async (_url, options) => {
      providerBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: 'characterized' } }] })
      };
    };
    const messages = [
      { role: 'system', content: 'preserve me' },
      ...Array.from({ length: 7 }, (_, index) => ({ role: 'user', content: `message-${index}` }))
    ];
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ taskType: 'chat', selectedModel: 'openai', messages })
    });
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(Object.keys(body).sort(), ['content', 'model', 'ok', 'provider']);
    assert.equal(body.provider, 'openai');
    assert.equal(providerBody.messages[0].content, 'preserve me');
    assert.deepEqual(providerBody.messages.slice(1).map(item => item.content), ['message-3', 'message-4', 'message-5', 'message-6']);
  });
});

test('provider routing tries the selected provider first and falls back after rate limiting', async () => {
  await withFreshChatHandler({ DEEPSEEK_API_KEY: 'test-deepseek', OPENAI_API_KEY: 'test-openai' }, async handler => {
    const calls = [];
    global.fetch = async url => {
      calls.push(url);
      if (url.includes('deepseek.com')) return { ok: false, status: 429, text: async () => 'limited' };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: 'fallback' } }] })
      };
    };
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        selectedModel: 'deepseek-chat-deepseek',
        messages: [{ role: 'user', content: 'hello' }]
      })
    });

    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).provider, 'openai');
    assert.deepEqual(calls, [
      'https://api.deepseek.com/v1/chat/completions',
      'https://api.openai.com/v1/chat/completions'
    ]);
  });
});

test('localStorage workspace migration copies the current payload to IndexedDB and retains the backup key', async () => {
  const workspace = {
    sessions: { chat_1: { title: 'Existing', messages: [] } },
    currentChatId: 'chat_1',
    projects: { project_1: { name: 'Existing project' } }
  };
  const puts = [];
  const removals = [];
  const context = {
    loggedUser: 'Ada',
    localStorage: {
      getItem: key => key === 'cinocode_db_Ada' ? JSON.stringify(workspace) : null,
      removeItem: key => removals.push(key),
      setItem: () => {}
    },
    CinoDB: {
      init: async () => {},
      get: async () => null,
      put: async (...args) => { puts.push(args); return true; }
    },
    window: {
      useLocalStorageFallback: false,
      dispatchEvent: () => {}
    },
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options ? options.detail : null; } },
    console: { log() {}, error() {} }
  };
  vm.createContext(context);
  // Run the whole IIFE script to set up window.CinoCodeChat
  vm.runInContext(chatStateCode, context);
  
  await context.window.CinoCodeChat.loadDatabase();

  assert.ok(puts.length >= 1);
  const expectedWorkspace = JSON.parse(JSON.stringify(workspace));
  const chat = expectedWorkspace.sessions.chat_1;
  chat.messages = [];
  chat.createdAt = puts[0][2].sessions.chat_1.createdAt;
  chat.updatedAt = puts[0][2].sessions.chat_1.updatedAt;
  chat.starred = false;
  chat.manualTitle = false;
  chat.projectId = null;
  chat.freeToneState = { override: null, positiveHint: null };

  assert.deepEqual(JSON.parse(JSON.stringify(puts[0][2])), expectedWorkspace);
  assert.deepEqual(removals, [], 'legacy localStorage remains as the current backup behavior');
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.CinoCodeChat.sessions)), expectedWorkspace.sessions);
});

test('stream parser characterizes OpenAI SSE completion and Ollama JSON-line completion', () => {
  const processStreamLine = extractNamedFunction(main, 'processStreamLine');
  const context = { JSON, console: { error() {} }, words: [] };
  vm.createContext(context);
  vm.runInContext(`
    let isGroq = true;
    let isNvidia = false;
    let isOpenRouter = false;
    let isXai = false;
    let streamEndedCleanly = false;
    let finishReason = '';
    function handleStreamWord(word) { if (word) words.push(word); }
    ${processStreamLine}
    this.parseLine = processStreamLine;
    this.setOllamaMode = function () { isGroq = false; };
    this.state = function () { return { streamEndedCleanly, finishReason }; };
  `, context);

  context.parseLine('data: {"choices":[{"delta":{"content":"Merhaba"},"finish_reason":null}]}');
  context.parseLine('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}');
  assert.deepEqual(context.words, ['Merhaba']);
  assert.deepEqual(JSON.parse(JSON.stringify(context.state())), { streamEndedCleanly: true, finishReason: 'stop' });

  context.setOllamaMode();
  context.parseLine('{"message":{"content":" dunya"},"done":true,"done_reason":"stop"}');
  assert.deepEqual(context.words, ['Merhaba', ' dunya']);
  assert.deepEqual(JSON.parse(JSON.stringify(context.state())), { streamEndedCleanly: true, finishReason: 'stop' });
});

test('stopGeneration aborts the active request, records cancellation, and releases the generation lock', () => {
  const stopGeneration = extractNamedFunction(main, 'stopGeneration');
  let aborted = 0;
  let cleanupCalls = 0;
  const controller = { signal: { aborted: false }, abort() { aborted += 1; this.signal.aborted = true; } };
  const context = {
    window: {
      generationStopRequested: false,
      activeGenerationController: controller,
      activeGenerationBotId: null
    },
    document: { getElementById: () => null },
    messagesDiv: null,
    cleanupGenerationUi: () => { cleanupCalls += 1; }
  };
  vm.createContext(context);
  vm.runInContext(`${stopGeneration}; this.runStopGeneration = stopGeneration;`, context);
  context.runStopGeneration();

  assert.equal(context.window.generationStopRequested, true);
  assert.equal(aborted, 1);
  assert.equal(cleanupCalls, 1);
});

test('fallback remains bounded by task capability and local Ollama remains opt-in', () => {
  const server = fs.readFileSync(path.join(root, 'netlify', 'functions', 'ai-chat.js'), 'utf8');
  assert.match(server, /if \(taskType === 'vision'\) \{\s*return \['openai', 'gemini', 'groq', 'openrouter', 'anthropic'\]/);
  assert.match(server, /if \(taskType === 'pdf'\) \{\s*return \['gemini', 'openai', 'deepseek', 'cerebras', 'mistral', 'openrouter', 'anthropic'\]/);
  assert.match(main, /if \(taskType !== 'vision' && isOllamaFallbackEnabled\(\)\)/);
  assert.match(main, /return localStorage\.getItem\('ollama_fallback_enabled'\) === '1'/);
});
