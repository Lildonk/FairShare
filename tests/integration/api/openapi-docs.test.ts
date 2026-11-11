import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GET as getDocsPage } from '@/app/api/docs/route';
import { GET as getOpenApiDocument } from '@/app/api/v1/openapi.json/route';
import { SESSION_COOKIE } from '@/lib/auth/session';

const API_ROOT = path.resolve(__dirname, '../../../src/app/api/v1');
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** Operations anyone may call. Every other operation must require the session cookie. */
const PUBLIC_OPERATIONS = new Set([
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/logout',
  'GET /api/v1/auth/google',
  'GET /api/v1/auth/google/callback',
  'POST /api/v1/simplify',
  'POST /api/v1/split/calculate',
  'GET /api/v1/openapi.json',
]);

interface Operation {
  summary?: string;
  tags?: string[];
  security?: Record<string, string[]>[];
  responses?: Record<string, unknown>;
}
interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Partial<Record<(typeof METHODS)[number], Operation>>>;
  components: { securitySchemes: Record<string, unknown> } & Record<string, Record<string, unknown>>;
}

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === 'route.ts' ? [full] : [];
  });
}

/** "METHOD /api/v1/path/{param}" for every handler exported from a route file, mapped to its file. */
function implementedOperations(): Map<string, string> {
  const operations = new Map<string, string>();
  for (const file of routeFiles(API_ROOT)) {
    const segments = path.relative(API_ROOT, path.dirname(file)).split(path.sep).filter(Boolean);
    const urlPath = ['/api/v1', ...segments.map((s) => s.replace(/^\[(.+)\]$/, '{$1}'))].join('/');
    const source = readFileSync(file, 'utf8');
    for (const [, method] of source.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/g)) {
      operations.set(`${method} ${urlPath}`, file);
    }
  }
  return operations;
}

async function loadDocument(): Promise<OpenApiDocument> {
  const response = await getOpenApiDocument();
  expect(response.status).toBe(200);
  return response.json();
}

function documentedOperations(document: OpenApiDocument): [string, Operation][] {
  return Object.entries(document.paths).flatMap(([urlPath, item]) =>
    METHODS.filter((method) => item[method]).map((method): [string, Operation] => [
      `${method.toUpperCase()} ${urlPath}`,
      item[method] as Operation,
    ]),
  );
}

describe('GET /api/v1/openapi.json', () => {
  it('is an OpenAPI 3.0 document', async () => {
    const document = await loadDocument();

    expect(document.openapi).toMatch(/^3\.0\.\d+$/);
    expect(document.info.title).toBe('FairShare API');
  });

  it('documents exactly the operations the route handlers implement', async () => {
    const documented = documentedOperations(await loadDocument()).map(([key]) => key);

    expect(documented.sort()).toEqual([...implementedOperations().keys()].sort());
  });

  it('gives every operation a summary, a tag, and at least one success and one error response', async () => {
    for (const [key, operation] of documentedOperations(await loadDocument())) {
      const codes = Object.keys(operation.responses ?? {});
      expect(operation.summary, key).toEqual(expect.any(String));
      expect(operation.tags?.length, key).toBeGreaterThan(0);
      expect(codes.some((code) => /^[23]/.test(code)), `${key} success response`).toBe(true);
      expect(codes.some((code) => /^[45]/.test(code)), `${key} error response`).toBe(true);
    }
  });

  it('marks public operations as public, and private ones as needing the session cookie with a 401', async () => {
    const document = await loadDocument();

    expect(document.components.securitySchemes.sessionCookie).toEqual({
      type: 'apiKey',
      in: 'cookie',
      name: SESSION_COOKIE,
      description: expect.any(String),
    });
    for (const [key, operation] of documentedOperations(document)) {
      if (PUBLIC_OPERATIONS.has(key)) {
        expect(operation.security, key).toEqual([]);
      } else {
        expect(operation.security, key).toEqual([{ sessionCookie: [] }]);
        expect(operation.responses, key).toHaveProperty(['401']);
      }
    }
  });

  it('matches the code: every private route handler calls an auth guard', () => {
    for (const [key, file] of implementedOperations()) {
      if (PUBLIC_OPERATIONS.has(key)) continue;
      expect(readFileSync(file, 'utf8'), key).toMatch(/require(User|GroupMember|Admin)\(/);
    }
  });

  it('resolves every $ref', async () => {
    const document = await loadDocument();
    const refs: string[] = [];
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          if (key === '$ref' && typeof child === 'string') refs.push(child);
          else collect(child);
        }
      }
    };
    collect(document);

    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      const target = ref
        .replace(/^#\//, '')
        .split('/')
        .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], document);
      expect(target, ref).toBeDefined();
    }
  });
});

describe('GET /api/docs', () => {
  it('serves Swagger UI for the document, loading pinned files with integrity hashes', async () => {
    const response = await getDocsPage();
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/html/);
    expect(html).toContain('<title>FairShare API docs</title>');
    expect(html).toContain("url: '/api/v1/openapi.json'");
    expect(html).toMatch(
      /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/swagger-ui-dist@5\.34\.0\/swagger-ui-bundle\.js" integrity="sha384-9Td7MKiIr2S83E1kZyyVi8KdJw\/S8CpAvu0llLyMeg0xq\/hDGiZJfVn0fV4llCmK" crossorigin="anonymous"><\/script>/,
    );
    expect(html).toMatch(
      /<link rel="stylesheet" href="https:\/\/cdn\.jsdelivr\.net\/npm\/swagger-ui-dist@5\.34\.0\/swagger-ui\.css" integrity="sha384-4c3vsE5f\+trhFyHrFrLM1fFGUn531NIaC7dcqEWIJdoRQJ5CkJbSuSCwXLpaS1KF" crossorigin="anonymous">/,
    );
  });

  it('sends a Content-Security-Policy that only runs the pinned script and its own inline setup', async () => {
    const response = await getDocsPage();
    const policy = response.headers.get('content-security-policy') ?? '';
    const scriptSrc = policy.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src')) ?? '';

    expect(scriptSrc).toContain('https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.34.0/');
    expect(scriptSrc).toMatch(/'sha256-[A-Za-z0-9+/]+=*'/);
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
  });
});
