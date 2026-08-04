const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Note: Testing Netlify functions directly might require mocking require
// For this simple test, we mock the required modules.

test('api-gateway returns 401 on missing auth', async () => {
    const { handler } = require('../netlify/functions/api-gateway');
    const response = await handler({
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({})
    });
    
    assert.equal(response.statusCode, 401);
});

test('api-gateway returns 401 on invalid token', async () => {
    const { handler } = require('../netlify/functions/api-gateway');
    const response = await handler({
        httpMethod: 'POST',
        headers: { authorization: 'Bearer invalid_token' },
        body: JSON.stringify({})
    });
    
    assert.equal(response.statusCode, 401);
});

// To test a successful request without hitting real APIs, we would need to mock runLLM.
