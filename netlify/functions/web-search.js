const { buildSecurityHeaders, guardRequest } = require('./_security');

exports.handler = async function(event) {
  const securityResponse = guardRequest(event, {
    namespace: 'web-search',
    maxBodyBytes: 16 * 1024,
    rateLimit: 30,
    windowMs: 60 * 1000
  });
  if (securityResponse) return securityResponse;

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: buildSecurityHeaders(event),
      body: JSON.stringify({ error: 'Sadece POST desteklenir.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      headers: buildSecurityHeaders(event),
      body: JSON.stringify({ error: 'Geçersiz JSON.' })
    };
  }

  const query = String(body.query || '').trim();
  if (!query) {
    return {
      statusCode: 400,
      headers: buildSecurityHeaders(event),
      body: JSON.stringify({ error: 'Arama sorgusu (query) gerekli.' })
    };
  }
  if (query.length > 500) {
    return {
      statusCode: 413,
      headers: buildSecurityHeaders(event),
      body: JSON.stringify({ error: 'Arama sorgusu en fazla 500 karakter olabilir.' })
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
        headers: buildSecurityHeaders(event),
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
        headers: buildSecurityHeaders(event),
        body: JSON.stringify({ results: [{ title: "Uyarı", snippet: "Arama sonucu bulunamadı veya DDG tarafından geçici olarak engellendi." }] })
      };
    }

    return {
      statusCode: 200,
      headers: buildSecurityHeaders(event),
      body: JSON.stringify({ results: snippets })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: buildSecurityHeaders(event),
      body: JSON.stringify({ error: 'Arama sırasında bir sunucu hatası oluştu.' })
    };
  }
};
