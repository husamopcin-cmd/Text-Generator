/* test_providers.js
 * Script to test each image generation provider individually.
 * It sends a POST request to the Netlify function endpoint (run with `netlify dev`).
 * For each provider it forces the provider via the `forceProvider` field and
 * writes the raw JSON response to a file in the artifacts directory.
 */

const fetch = require('node-fetch'); // npm i node-fetch@2 (CommonJS)
const fs = require('fs');
const path = require('path');

// Configuration – adjust if your dev server runs on a different port
const FUNCTION_URL = 'http://localhost:8888/.netlify/functions/generate-image';
const PROMPT = 'a yellow cat with a red tail';
const WIDTH = 512;
const HEIGHT = 512;

// List of providers in the order we want to test them
const providers = ['stability', 'runware', 'fal', 'replicate', 'huggingface'];

async function testProvider(name) {
  const body = {
    prompt: PROMPT,
    width: WIDTH,
    height: HEIGHT,
    forceProvider: name,
  };
  try {
    const resp = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    const outPath = path.resolve(__dirname, '..', 'artifacts', `${name}_output.json`);
    fs.writeFileSync(outPath, text, 'utf8');
    console.log(`✅ ${name} → ${outPath}`);
  } catch (err) {
    console.error(`❌ ${name} failed:`, err);
  }
}

(async () => {
  for (const p of providers) {
    await testProvider(p);
  }
  console.log('All providers tested.');
})();
