const API_KEYS = {
    // Master key for external apps like Juno Life
    [process.env.CINOCODE_MASTER_KEY || 'cinocode_sk_test_123']: {
        appName: 'Juno Life',
        tier: 'unlimited'
    }
};

function authenticate(event) {
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
        return { ok: false, status: 401, error: 'Missing or invalid Authorization header' };
    }

    const token = authHeader.split(' ')[1];
    const client = API_KEYS[token];

    if (!client) {
        return { ok: false, status: 401, error: 'Invalid API Key' };
    }

    return { ok: true, client };
}

module.exports = {
    authenticate
};
