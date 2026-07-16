'use strict';

const { createVercelHandler } = require('./_netlify-adapter');
const { handler } = require('../netlify/functions/image-search');

module.exports = createVercelHandler(handler);
