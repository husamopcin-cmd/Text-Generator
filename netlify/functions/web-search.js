exports.handler = async function(event) {
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
      body: JSON.stringify({ error: 'Sadece POST desteklenir.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Geçersiz JSON.' })
    };
  }

  const query = body.query;
  if (!query || typeof query !== 'string') {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Arama sorgusu (query) gerekli.' })
    };
  }

  try {
    const res = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: `q=${encodeURIComponent(query)}`
    });

    if (!res.ok) {
      return {
        statusCode: 502,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Arama motoruna erişilemedi.' })
      };
    }

    const html = await res.text();
    
    // Düzenli ifadeler ile arama sonuçlarını çıkartma (HTML parse)
    const resultRegex = /<a class="result__snippet[^>]*>([^<]*(?:<(?!\/a>)[^<]*)*)<\/a>/gi;
    const titleRegex = /<h2 class="result__title">[\s\S]*?<a[^>]*>([^<]*(?:<(?!\/a>)[^<]*)*)<\/a>/gi;

    const snippets = [];
    let titleMatch, snippetMatch;
    
    while ((titleMatch = titleRegex.exec(html)) !== null && (snippetMatch = resultRegex.exec(html)) !== null) {
      if (snippets.length >= 4) break;
      const title = titleMatch[1].replace(/(<([^>]+)>)/gi, "").trim();
      const desc = snippetMatch[1].replace(/(<([^>]+)>)/gi, "").trim();
      snippets.push({ title, snippet: desc });
    }

    if (snippets.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ results: [{ title: "Uyarı", snippet: "Arama sonucu bulunamadı veya DDG tarafından geçici olarak engellendi." }] })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ results: snippets })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Arama sırasında bir sunucu hatası oluştu.' })
    };
  }
};
