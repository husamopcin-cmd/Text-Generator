exports.handler = async function(event) {
  if (typeof fetch === 'undefined') {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        ok: false,
        error: 'runtime_fetch_missing',
        message: 'Netlify runtime fetch desteği bulunamadı.'
      })
    };
  }

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: 'OK'
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: false, error: 'Sadece POST desteklenir.' })
    };
  }

  const runwareKey = (process.env.RUNWARE_API_KEY || '').trim();
  if (!runwareKey) {
    return {
      statusCode: 503,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        ok: false,
        error: 'missing_env',
        message: 'Netlify üzerinde RUNWARE_API_KEY tanımlanmamış.'
      })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: false, error: 'bad_json', message: 'Geçersiz istek gövdesi.' })
    };
  }

  const prompt = body.prompt;
  const width = parseInt(body.width, 10) || 1024;
  const height = parseInt(body.height, 10) || 1024;

  if (!prompt) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: false, error: 'missing_prompt', message: 'Prompt alanı zorunludur.' })
    };
  }

  const taskUUID = Date.now().toString(36) + Math.random().toString(36).slice(2);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const resp = await fetch('https://api.runware.ai/v1', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + runwareKey
      },
      body: JSON.stringify([{
        taskType: 'imageInference',
        taskUUID,
        positivePrompt: prompt,
        model: 'runware:100@1',
        width,
        height,
        numberResults: 1,
        outputType: ['URL']
      }]),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const text = await resp.text();
    if (!resp.ok) {
      return {
        statusCode: resp.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          ok: false,
          error: 'provider_error',
          status: resp.status,
          message: 'Runware API hatası.',
          details: text
        })
      };
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = null;
    }

    const result = data && data.data && data.data[0];
    if (result && result.imageURL) {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          ok: true,
          provider: 'runware',
          images: [result.imageURL]
        })
      };
    } else {
      return {
        statusCode: 502,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          ok: false,
          error: 'empty_response',
          message: 'Sağlayıcı görsel adresi döndürmedi.',
          details: text
        })
      };
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      return {
        statusCode: 504,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ ok: false, error: 'timeout', message: 'Runware API zaman aşımına uğradı.' })
      };
    }
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: false, error: 'network', message: 'Proxy ağ hatası veya bağlantı kesildi.' })
    };
  }
};
