export function onRequestGet(context) {
  const rawCountry = context.request.cf && context.request.cf.country;
  const country = /^[A-Z]{2}$/.test(String(rawCountry || "").toUpperCase())
    ? String(rawCountry).toUpperCase()
    : null;

  return new Response(JSON.stringify({ country }), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
