const { authenticate } = require('./_api-auth');
const { runLLM } = require('./ai-chat');
const { buildSecurityHeaders } = require('./_security');

exports.handler = async function(event) {
    // 1. CORS Preflight Support
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-cinocode-project-id'
            }
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: buildSecurityHeaders(event),
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    // 2. Authentication
    const auth = authenticate(event);
    if (!auth.ok) {
        return {
            statusCode: auth.status,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ error: auth.error })
        };
    }

    // 3. Parse OpenAI Payload
    let rawBody;
    try {
        rawBody = JSON.parse(event.body || '{}');
    } catch (e) {
        return {
            statusCode: 400,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ error: 'Invalid JSON' })
        };
    }

    // 4. Adapt Payload for CinoCode internal logic
    const cinocodeBody = {
        taskType: 'chat',
        selectedModel: rawBody.model || 'openai',
        temperature: rawBody.temperature || 0.7,
        maxTokens: rawBody.max_tokens || 1024,
        messages: rawBody.messages || []
    };

    // Note: CinoCode doesn't have a backend database for projects yet.
    // If external apps need memory injected by the backend (Option 2),
    // they can pass `x-cinocode-project-id` header.
    // For now, we assume the external app sends the memory directly in messages (Option 1).
    const projectId = event.headers['x-cinocode-project-id'];
    if (projectId) {
        // TODO: In the future, fetch memory from Supabase using projectId
        // and inject it into cinocodeBody.messages as a system prompt.
    }

    // 5. Execute LLM using CinoCode routing
    const result = await runLLM(cinocodeBody, event);

    // 6. Format Response to OpenAI standard
    const baseHeaders = result.headers || buildSecurityHeaders(event);
    const headers = { ...baseHeaders, 'Access-Control-Allow-Origin': '*' };

    if (result.statusCode === 200) {
        let body;
        try {
            body = JSON.parse(result.body);
        } catch (e) {
            body = { content: result.body };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                id: "cinocode-" + Date.now(),
                object: "chat.completion",
                created: Math.floor(Date.now() / 1000),
                model: body.model || rawBody.model,
                choices: [{
                    index: 0,
                    message: {
                        role: "assistant",
                        content: body.content
                    },
                    finish_reason: "stop"
                }]
            })
        };
    }

    return {
        statusCode: result.statusCode || 500,
        headers,
        body: result.body
    };
};
