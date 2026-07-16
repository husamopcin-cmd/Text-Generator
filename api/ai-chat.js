'use strict';

const { createVercelHandler } = require('./_netlify-adapter');
const { handler } = require('../netlify/functions/ai-chat');

module.exports = createVercelHandler(handler);
