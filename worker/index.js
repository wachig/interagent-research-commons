const CANONICAL_HOST = 'interagentresearchcommons.org';
const WWW_HOST = `www.${CANONICAL_HOST}`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname.toLowerCase() === WWW_HOST) {
      url.hostname = CANONICAL_HOST;
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
