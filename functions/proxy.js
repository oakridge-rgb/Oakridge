export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  
  let targetUrl = url.searchParams.get('url');
  
  if (!targetUrl) {
    return new Response('Usage: /proxy?url=https://example.com', { status: 400 });
  }

  try { targetUrl = decodeURIComponent(targetUrl); } catch(e) {}

  if (!targetUrl.startsWith('http')) {
    return new Response('Invalid URL', { status: 400 });
  }

  try {
    const targetReq = new Request(targetUrl, {
      method: request.method,
      headers: {
        'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0',
        'Accept': request.headers.get('Accept') || '*/*',
        'Referer': new URL(targetUrl).origin,
      },
      body: request.body,
    });

    let response = await fetch(targetReq);
    response = new Response(response.body, response);
    
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    response.headers.set('Access-Control-Allow-Headers', '*');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: response.headers });
    }

    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('text/html')) {
      let text = await response.text();
      const proxyBase = `${url.origin}/proxy?url=`;
      const baseOrigin = new URL(targetUrl).origin;
      const basePath = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1) || targetUrl + '/';

      const escapedOrigin = baseOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(
        new RegExp(escapedOrigin, 'g'),
        proxyBase + encodeURIComponent(baseOrigin)
      );

      text = text.replace(
        /(href|src|action)=["'](\/[^"']*)["']/gi,
        `$1="${proxyBase}${encodeURIComponent(baseOrigin + '$2')}"`
      );

      text = text.replace(
        /(href|src|action)=["']([^\/][^"']*?)["']/gi,
        (match, attr, path) => {
          if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('#') || path.startsWith('javascript:')) {
            return match;
          }
          return `${attr}="${proxyBase}${encodeURIComponent(basePath + path)}"`;
        }
      );

      response = new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    }

    return response;

  } catch (error) {
    return new Response(`Proxy Error: ${error.message}`, { 
      status: 502,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}
