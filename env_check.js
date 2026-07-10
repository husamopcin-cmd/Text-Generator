// env_check.js
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
console.log('STABILITY_API_KEY:', process.env.STABILITY_API_KEY);
