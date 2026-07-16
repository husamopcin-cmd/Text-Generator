'use strict';

const { createVercelHandler } = require('./_netlify-adapter');
const { handler } = require('../netlify/functions/generate-image');

module.exports = createVercelHandler(handler);
