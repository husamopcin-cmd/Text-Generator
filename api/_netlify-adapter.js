'use strict';

function normalizeHeaders(headers = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value || '');
  }
  return normalized;
}

async function readBody(req) {
  if (req.body !== undefined) {
    return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function createVercelHandler(netlifyHandler) {
  return async function vercelHandler(req, res) {
    try {
      const body = await readBody(req);
      const event = {
        httpMethod: req.method || 'GET',
        headers: normalizeHeaders(req.headers),
        queryStringParameters: req.query || {},
        path: (req.url || '').split('?')[0],
        rawUrl: req.url || '',
        body,
        isBase64Encoded: false
      };

      const response = await netlifyHandler(event, {});
      const statusCode = response && response.statusCode ? response.statusCode : 200;
      const headers = response && response.headers ? response.headers : {};

      for (const [key, value] of Object.entries(headers)) {
        if (value !== undefined) res.setHeader(key, value);
      }

      res.status(statusCode).send(response && response.body !== undefined ? response.body : '');
    } catch (error) {
      res.status(500).json({ ok: false, error: 'internal_server_error' });
    }
  };
}

module.exports = { createVercelHandler };
