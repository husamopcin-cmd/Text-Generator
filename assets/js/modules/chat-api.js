// assets/js/modules/chat-api.js
// Phase 2E: Model routing, health scoring, cooldown, provider key management.
// Extracted from main.js sendMessage() to decouple AI routing from UI.

(function() {
    'use strict';

    // ===== PROXY CLOUD PROVIDER LIST =====
    const PROXY_CLOUD_MODELS = ['openai', 'cerebras', 'deepseek', 'mistral', 'openrouter', 'gemini', 'groq', 'fireworks', 'together', 'anthropic'];

    // ===== MODEL LABEL PARSER =====
    function parseModelLabel(label) {
        const normalized = String(label || '').trim();
        const lower = normalized.toLowerCase();
        if (PROXY_CLOUD_MODELS.includes(lower)) {
            return { provider: lower, modelId: lower, displayLabel: normalized, isProviderAlias: true };
        }
        const providerMatch = normalized.match(/(?:[-:])(openai|cerebras|deepseek|mistral|openrouter|gemini|groq|fireworks|together|nvidia|xai|anthropic)(?:\\b|$)/i);
        const provider = providerMatch ? providerMatch[1].toLowerCase() : null;
        const modelId = provider ? normalized.replace(new RegExp(`(?:[-:])${provider}(?:\\\\b|$)`, 'i'), '').trim() : normalized;
        return { provider, modelId, displayLabel: normalized, isProviderAlias: false };
    }

    function isProxyCloudProvider(provider) {
        return PROXY_CLOUD_MODELS.includes(provider);
    }

    function isProxyCloudModel(modelValue) {
        return PROXY_CLOUD_MODELS.includes(String(modelValue || '').trim().toLowerCase());
    }

    // ===== PROVIDER API KEY MANAGEMENT =====
    function getProviderApiKey(provider) {
        if (!provider) return "";
        const keyStr = (localStorage.getItem(provider + '_api_key') || "").trim();
        if (!keyStr) return "";
        const keys = keyStr.split(',').map(function(k) { return k.trim(); }).filter(Boolean);
        return keys.length ? keys[Math.floor(Math.random() * keys.length)] : "";
    }

    function hasProviderApiKey(provider) {
        if (!provider) return false;
        if (isProxyCloudProvider(provider)) return true;
        return !!getProviderApiKey(provider);
    }

    // ===== REQUEST TIMEOUT =====
    function getRequestTimeoutMs(taskType, responseMaxTokens) {
        var RESPONSE_LENGTH_TOKEN_LIMITS = { normal: 2048, detailed: 4096, long: 8192 };
        if (taskType === 'vision') return 50000;
        if (taskType === 'pdf') return 58000;
        if (responseMaxTokens >= RESPONSE_LENGTH_TOKEN_LIMITS.long) return 58000;
        if (responseMaxTokens >= RESPONSE_LENGTH_TOKEN_LIMITS.detailed) return 52000;
        if (responseMaxTokens >= RESPONSE_LENGTH_TOKEN_LIMITS.normal) return 42000;
        return 30000;
    }

    // ===== MODEL COOLDOWN SYSTEM =====
    function getCooldowns() {
        try { return JSON.parse(localStorage.getItem('cinocode_model_cooldowns') || '{}'); } catch(e) { return {}; }
    }

    function setCooldown(modelId, ttlMs) {
        var cds = getCooldowns();
        cds[modelId] = Date.now() + ttlMs;
        localStorage.setItem('cinocode_model_cooldowns', JSON.stringify(cds));
    }

    function isModelOnCooldown(modelId) {
        if (!modelId) return false;
        var cds = getCooldowns();
        var until = cds[modelId];
        if (!until) return false;
        if (Date.now() > until) {
            delete cds[modelId];
            localStorage.setItem('cinocode_model_cooldowns', JSON.stringify(cds));
            return false;
        }
        return true;
    }

    // ===== AI ROUTER — MODEL HEALTH SCORING =====
    var MODEL_HEALTH_KEY = 'cinocode_model_health';

    function getModelHealth() {
        try { return JSON.parse(localStorage.getItem(MODEL_HEALTH_KEY) || '{}'); } catch(e) { return {}; }
    }

    function setModelScore(modelId, delta) {
        var h = getModelHealth();
        h[modelId] = Math.max(0, Math.min(10, (h[modelId] ?? 5) + delta));
        localStorage.setItem(MODEL_HEALTH_KEY, JSON.stringify(h));
    }

    function getModelScore(modelId) {
        return getModelHealth()[modelId] ?? 5;
    }

    // ===== VISION MODEL DETECTION =====
    function isVisionModel(modelValue) {
        if (!modelValue) return false;
        var v = modelValue.toLowerCase();
        return v.includes('vision') || v.includes('scout') || v.includes('llava') || v.includes('nvidia') || v.includes('vision-instruct');
    }

    function isVisionRouteModel(modelValue) {
        if (!modelValue) return false;
        var parsed = parseModelLabel(modelValue);
        if (parsed && isProxyCloudProvider(parsed.provider) && ['openai', 'gemini', 'openrouter', 'groq', 'anthropic'].includes(parsed.provider)) return true;
        return isVisionModel(modelValue);
    }

    // ===== PUBLIC API =====
    window.CinoCodeApi = {
        // Constants
        PROXY_CLOUD_MODELS: PROXY_CLOUD_MODELS,

        // Model Label Parser
        parseModelLabel: parseModelLabel,
        isProxyCloudProvider: isProxyCloudProvider,
        isProxyCloudModel: isProxyCloudModel,

        // Provider Keys
        getProviderApiKey: getProviderApiKey,
        hasProviderApiKey: hasProviderApiKey,

        // Timeout
        getRequestTimeoutMs: getRequestTimeoutMs,

        // Cooldown
        getCooldowns: getCooldowns,
        setCooldown: setCooldown,
        isModelOnCooldown: isModelOnCooldown,

        // Health Scoring
        getModelHealth: getModelHealth,
        setModelScore: setModelScore,
        getModelScore: getModelScore,

        // Vision Detection
        isVisionModel: isVisionModel,
        isVisionRouteModel: isVisionRouteModel
    };
})();
