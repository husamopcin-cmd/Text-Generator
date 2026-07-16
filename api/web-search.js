'use strict';

const { createVercelHandler } = require('./_netlify-adapter');
const { handler } = require('../netlify/functions/web-search');

module.exports = createVercelHandler(handler);
