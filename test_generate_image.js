// test_generate_image.js
const path = require('path');
const { handler } = require(path.join(__dirname, 'netlify', 'functions', 'generate-image'));
const fs = require('fs');
(async () => {
  const event = {
    httpMethod: 'POST',
    body: JSON.stringify({ prompt: 'kedi çiz', width: 512, height: 512 })
  };
  const result = await handler(event);
  console.log('Result:', result);
  fs.writeFileSync('curl_prompt1_output.json', JSON.stringify(result, null, 2), 'utf-8');
})();
