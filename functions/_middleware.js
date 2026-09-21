// Temporary kill switch. Set to false and redeploy to reopen the service.
const SERVICE_PAUSED = true;
const BLOCKED_COUNTRY = "CN";

function requestCountry(request) {
  const value = request && request.cf && request.cf.country;
  const country = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : null;
}

function blockedResponse() {
  const body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Service unavailable in your region</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; color: #202832; background: #f7f9fc; }
    main { width: min(520px, calc(100% - 40px)); padding: 32px; border: 1px solid #dfe5eb; border-radius: 12px; background: #fff; box-shadow: 0 14px 38px rgba(32, 40, 50, .08); }
    h1 { margin: 0 0 12px; font-size: 22px; line-height: 1.25; }
    p { margin: 0; color: #637181; font-size: 15px; line-height: 1.7; }
  </style>
</head>
<body>
  <main>
    <h1>Service unavailable in your region</h1>
    <p>This service is not available in mainland China.<br>本服务暂不向中国大陆地区提供。</p>
  </main>
</body>
</html>`;

  return new Response(body, {
    status: 403,
    statusText: "Forbidden",
    headers: {
      "Cache-Control": "no-store, private",
      "CDN-Cache-Control": "no-store",
      "Content-Language": "en",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
}

function pausedResponse() {
  const body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Service temporarily unavailable</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; color: #202832; background: #f7f9fc; }
    main { width: min(520px, calc(100% - 40px)); padding: 32px; border: 1px solid #dfe5eb; border-radius: 12px; background: #fff; box-shadow: 0 14px 38px rgba(32, 40, 50, .08); }
    h1 { margin: 0 0 12px; font-size: 22px; line-height: 1.25; }
    p { margin: 0; color: #637181; font-size: 15px; line-height: 1.7; }
  </style>
</head>
<body>
  <main>
    <h1>Service temporarily unavailable</h1>
    <p>Cutimg is temporarily offline. Please try again later.<br>Cutimg 暂时停止服务，请稍后再试。</p>
  </main>
</body>
</html>`;

  return new Response(body, {
    status: 503,
    statusText: "Service Unavailable",
    headers: {
      "Cache-Control": "no-store, private",
      "CDN-Cache-Control": "no-store",
      "Content-Language": "en",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": "3600",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
}

export async function onRequest(context) {
  if (SERVICE_PAUSED) {
    return pausedResponse();
  }
  if (requestCountry(context.request) === BLOCKED_COUNTRY) {
    return blockedResponse();
  }
  return context.next();
}
