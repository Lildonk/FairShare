import { createHash } from 'node:crypto';

// Swagger UI from jsDelivr, pinned to a version at least two weeks old. The integrity hashes are of
// the npm package's own files (checked against the registry's tarball), so a changed file won't run.
const SWAGGER_UI = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.34.0/';
const SCRIPT_INTEGRITY = 'sha384-9Td7MKiIr2S83E1kZyyVi8KdJw/S8CpAvu0llLyMeg0xq/hDGiZJfVn0fV4llCmK';
const STYLE_INTEGRITY = 'sha384-4c3vsE5f+trhFyHrFrLM1fFGUn531NIaC7dcqEWIJdoRQJ5CkJbSuSCwXLpaS1KF';

// `validatorUrl: null` stops Swagger UI from sending the document to an outside validator.
const SETUP_SCRIPT =
  "window.addEventListener('load', function () { window.ui = SwaggerUIBundle({ url: '/api/v1/openapi.json', dom_id: '#swagger-ui', deepLinking: true, validatorUrl: null }); });";
const SETUP_HASH = createHash('sha256').update(SETUP_SCRIPT).digest('base64');

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  `script-src ${SWAGGER_UI} 'sha256-${SETUP_HASH}'`,
  // Swagger UI sets inline styles on its elements.
  `style-src ${SWAGGER_UI} 'unsafe-inline'`,
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FairShare API docs</title>
<link rel="stylesheet" href="${SWAGGER_UI}swagger-ui.css" integrity="${STYLE_INTEGRITY}" crossorigin="anonymous">
</head>
<body>
<noscript>Swagger UI needs JavaScript. The OpenAPI document itself is at <a href="/api/v1/openapi.json">/api/v1/openapi.json</a>.</noscript>
<div id="swagger-ui"></div>
<script src="${SWAGGER_UI}swagger-ui-bundle.js" integrity="${SCRIPT_INTEGRITY}" crossorigin="anonymous"></script>
<script>${SETUP_SCRIPT}</script>
</body>
</html>
`;

/** GET /api/docs: interactive Swagger UI for the OpenAPI document. Public. */
export function GET() {
  return new Response(PAGE, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': CONTENT_SECURITY_POLICY,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}
