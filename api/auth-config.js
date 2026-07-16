'use strict';

const { createVercelHandler } = require('./_netlify-adapter');
const { handler } = require('../netlify/functions/auth-config');

module.exports = createVercelHandler(handler);
