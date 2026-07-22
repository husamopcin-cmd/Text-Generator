const { createVercelHandler } = require('./_netlify-adapter');
const { handler } = require('../netlify/functions/guest-session');

module.exports = createVercelHandler(handler);
