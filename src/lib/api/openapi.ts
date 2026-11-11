/**
 * The OpenAPI 3.0 description of the FairShare API (Issue #9), served at `/api/v1/openapi.json` and
 * rendered by Swagger UI at `/api/docs`. `tests/integration/api/openapi-docs.test.ts` checks that it
 * lists exactly the operations the route handlers implement, so update it with every route change.
 */
import { SESSION_COOKIE } from '@/lib/auth/session';
import {
  MAX_DEBTS,
  MAX_ITEM_DESCRIPTION_LENGTH,
  MAX_MEMBER_ID_LENGTH,
  MAX_RECEIPT_ITEMS,
  MAX_SPLIT_MEMBERS,
  SPLIT_TYPES,
} from './calculator-input';

const schema = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const response = (name: string) => ({ $ref: `#/components/responses/${name}` });
const jsonBody = (description: string, body: object) => ({
  description,
  content: { 'application/json': { schema: body } },
});
const requestBody = (name: string) => ({ required: true, content: { 'application/json': { schema: schema(name) } } });

const SIGNED_IN = [{ sessionCookie: [] }];
const ANYONE: never[] = [];

const cents = (description: string, minimum = 1) => ({
  type: 'integer',
  minimum,
  maximum: Number.MAX_SAFE_INTEGER,
  description: `${description} In integer cents (1234 = $12.34).`,
});
const memberId = (description: string) => ({ type: 'string', minLength: 1, maxLength: MAX_MEMBER_ID_LENGTH, description });
const uuid = { type: 'string', format: 'uuid' };
const setsSessionCookie = {
  'Set-Cookie': {
    description: `The \`${SESSION_COOKIE}\` session cookie (HttpOnly, SameSite=Lax, valid for 7 days).`,
    schema: { type: 'string' },
  },
};
const redirect = (description: string) => ({
  description,
  headers: { Location: { description: 'Where the browser goes next.', schema: { type: 'string' } } },
});

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'FairShare API',
    version: '1.0.0',
    description: [
      'REST API for FairShare, a group expense-sharing app. All money is in **integer cents**.',
      '',
      `Private endpoints need the \`${SESSION_COOKIE}\` cookie that register, login, and Google sign-in set. ` +
        'Browsers send it automatically, so to try private endpoints here, sign in on this site first.',
      '',
      'Errors are JSON: `{ "code": "...", "message": "..." }`, plus `fields` (field → message) for invalid input. ' +
        'A group you are not a member of gets the same 404 as a group that does not exist.',
    ].join('\n'),
  },
  tags: [
    { name: 'Auth', description: 'Accounts and sessions.' },
    { name: 'Groups', description: 'Groups you belong to.' },
    { name: 'Admin', description: 'Platform-wide oversight. `ADMIN` role only.' },
    { name: 'Calculators', description: 'Public, stateless money calculators. They read no account or group data.' },
    { name: 'Docs', description: 'This document.' },
  ],
  paths: {
    '/api/v1/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Create an account and sign in',
        description: 'New accounts are always `MEMBER`; the role cannot be set by the client.',
        security: ANYONE,
        requestBody: requestBody('RegisterRequest'),
        responses: {
          '201': { ...jsonBody('Account created and signed in.', schema('UserResponse')), headers: setsSessionCookie },
          '400': response('InvalidInput'),
          '409': jsonBody('An account with this email already exists (`email_taken`).', schema('Error')),
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in with email and password',
        description: 'An unknown email and a wrong password get the same answer.',
        security: ANYONE,
        requestBody: requestBody('LoginRequest'),
        responses: {
          '200': { ...jsonBody('Signed in.', schema('UserResponse')), headers: setsSessionCookie },
          '400': response('InvalidInput'),
          '401': jsonBody('Wrong email or password (`invalid_credentials`).', schema('Error')),
        },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Sign out',
        security: ANYONE,
        responses: { '204': { description: 'Signed out; the session cookie is cleared.' }, '500': response('ServerError') },
      },
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'The signed-in user',
        security: SIGNED_IN,
        responses: { '200': jsonBody('Your profile.', schema('UserResponse')), '401': response('Unauthorized') },
      },
    },
    '/api/v1/auth/google': {
      get: {
        tags: ['Auth'],
        summary: 'Start Google sign-in',
        description:
          'Redirects to Google. While signed in with a password, this connects the Google account instead. ' +
          'Accounts are never merged by email.',
        security: ANYONE,
        responses: {
          '307': redirect('To Google, or to `/login?error=google_unavailable` when Google sign-in is not set up.'),
          '500': response('ServerError'),
        },
      },
    },
    '/api/v1/auth/google/callback': {
      get: {
        tags: ['Auth'],
        summary: 'Finish Google sign-in',
        description: 'Google redirects here. The ID token is verified on the server before any session is created.',
        security: ANYONE,
        parameters: [
          { name: 'code', in: 'query', required: false, schema: { type: 'string' }, description: 'From Google.' },
          { name: 'state', in: 'query', required: false, schema: { type: 'string' }, description: 'From Google.' },
        ],
        responses: {
          '307': redirect('Home with a session cookie on success, otherwise `/login?error=<code>`.'),
          '500': response('ServerError'),
        },
      },
    },
    '/api/v1/groups': {
      get: {
        tags: ['Groups'],
        summary: 'Your groups',
        security: SIGNED_IN,
        responses: {
          '200': jsonBody('Only the groups you belong to, by name.', {
            type: 'object',
            required: ['groups'],
            properties: { groups: { type: 'array', items: schema('GroupSummary') } },
          }),
          '401': response('Unauthorized'),
        },
      },
    },
    '/api/v1/groups/{groupId}': {
      get: {
        tags: ['Groups'],
        summary: 'A group and its members',
        security: SIGNED_IN,
        parameters: [{ $ref: '#/components/parameters/GroupId' }],
        responses: {
          '200': jsonBody('The group, with members’ names (no emails).', {
            type: 'object',
            required: ['group'],
            properties: { group: schema('GroupDetail') },
          }),
          '401': response('Unauthorized'),
          '404': response('GroupNotFound'),
        },
      },
    },
    '/api/v1/admin/groups': {
      get: {
        tags: ['Admin'],
        summary: 'Every group, with member, expense, and dispute counts',
        description: 'The role is read from the database on every request, so a demoted admin loses access at once.',
        security: SIGNED_IN,
        responses: {
          '200': jsonBody('All groups, by name.', {
            type: 'object',
            required: ['groups'],
            properties: { groups: { type: 'array', items: schema('AdminGroup') } },
          }),
          '401': response('Unauthorized'),
          '403': response('Forbidden'),
        },
      },
    },
    '/api/v1/simplify': {
      post: {
        tags: ['Calculators'],
        summary: 'Simplify debts into transfers',
        description:
          'Turns raw debts into each member’s net balance and a list of transfers that settles them, using ' +
          'the app’s greedy creditor/debtor matcher: at most N−1 transfers for N members with a nonzero ' +
          'balance (not guaranteed to be the global minimum). The output depends only on the debts, not on ' +
          'their order. Member IDs are any labels you choose.',
        security: ANYONE,
        requestBody: requestBody('SimplifyRequest'),
        responses: { '200': jsonBody('Balances and transfers.', schema('SimplifyResponse')), '400': response('InvalidInput') },
      },
    },
    '/api/v1/split/calculate': {
      post: {
        tags: ['Calculators'],
        summary: 'Split a total between members',
        description:
          'Uses the same engines as the app. EQUAL gives leftover cents to the payer if they take part, ' +
          'otherwise one cent each by member ID. PERCENTAGE takes basis points (10000 = 100%). ITEMIZED ' +
          'prorates tax, service, and tip over each member’s items. Allocations always add up to `totalCents`.',
        security: ANYONE,
        requestBody: requestBody('SplitRequest'),
        responses: { '200': jsonBody('One allocation per member, by member ID.', schema('SplitResponse')), '400': response('InvalidInput') },
      },
    },
    '/api/v1/openapi.json': {
      get: {
        tags: ['Docs'],
        summary: 'This OpenAPI document',
        security: ANYONE,
        responses: { '200': jsonBody('The OpenAPI 3.0 document.', { type: 'object' }), '500': response('ServerError') },
      },
    },
  },
  components: {
    securitySchemes: {
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: SESSION_COOKIE,
        description: 'Session cookie (a signed JWT) set by register, login, or Google sign-in. HttpOnly, so scripts cannot read it.',
      },
    },
    parameters: {
      GroupId: { name: 'groupId', in: 'path', required: true, schema: uuid, description: 'The group’s ID.' },
    },
    responses: {
      InvalidInput: jsonBody('Invalid input (`invalid_input`). `fields` says what to fix.', schema('Error')),
      Unauthorized: jsonBody('Not signed in, or the session is invalid or expired (`unauthorized`).', schema('Error')),
      Forbidden: jsonBody('Signed in, but not an admin (`forbidden`).', schema('Error')),
      GroupNotFound: jsonBody('No such group, or you are not a member of it (`not_found`).', schema('Error')),
      ServerError: jsonBody('Unexpected error (`server_error`). Details are never sent to the client.', schema('Error')),
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: { type: 'string', example: 'invalid_input' },
          message: { type: 'string', example: 'Check the highlighted fields.' },
          fields: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Field → message, for invalid input. Keys are JSON paths such as `debts[0].amountCents`.',
          },
        },
      },
      PublicUser: {
        type: 'object',
        required: ['id', 'email', 'name', 'role'],
        properties: { id: uuid, email: { type: 'string', format: 'email' }, name: { type: 'string' }, role: { type: 'string', enum: ['MEMBER', 'ADMIN'] } },
      },
      UserResponse: { type: 'object', required: ['user'], properties: { user: schema('PublicUser') } },
      RegisterRequest: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          email: { type: 'string', format: 'email', maxLength: 254 },
          password: { type: 'string', minLength: 8, description: 'At least 8 characters and at most 72 bytes (bcrypt’s limit).' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
      },
      GroupSummary: {
        type: 'object',
        required: ['id', 'name', 'description', 'currency', 'isArchived', 'memberCount'],
        properties: {
          id: uuid,
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          currency: { type: 'string', example: 'USD' },
          isArchived: { type: 'boolean' },
          memberCount: { type: 'integer', minimum: 1 },
        },
      },
      GroupMember: { type: 'object', required: ['id', 'name'], properties: { id: uuid, name: { type: 'string' } } },
      GroupDetail: {
        type: 'object',
        required: ['id', 'name', 'description', 'currency', 'isArchived', 'members'],
        properties: {
          id: uuid,
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          currency: { type: 'string', example: 'USD' },
          isArchived: { type: 'boolean' },
          members: { type: 'array', items: schema('GroupMember'), description: 'In the order they joined.' },
        },
      },
      AdminGroup: {
        type: 'object',
        required: ['id', 'name', 'isArchived', 'memberCount', 'expenseCount', 'disputedExpenseCount'],
        properties: {
          id: uuid,
          name: { type: 'string' },
          isArchived: { type: 'boolean' },
          memberCount: { type: 'integer', minimum: 0 },
          expenseCount: { type: 'integer', minimum: 0 },
          disputedExpenseCount: { type: 'integer', minimum: 0 },
        },
      },
      Debt: {
        type: 'object',
        required: ['fromMemberId', 'toMemberId', 'amountCents'],
        properties: {
          fromMemberId: memberId('Who owes.'),
          toMemberId: memberId('Who is owed. Must differ from `fromMemberId`.'),
          amountCents: cents('How much.'),
        },
      },
      SimplifyRequest: {
        type: 'object',
        required: ['debts'],
        properties: { debts: { type: 'array', maxItems: MAX_DEBTS, items: schema('Debt'), description: 'Their sum must be a safe integer.' } },
        example: {
          debts: [
            { fromMemberId: 'alice', toMemberId: 'bob', amountCents: 1000 },
            { fromMemberId: 'bob', toMemberId: 'carol', amountCents: 1000 },
          ],
        },
      },
      MemberBalance: {
        type: 'object',
        required: ['memberId', 'balanceCents'],
        properties: {
          memberId: { type: 'string' },
          balanceCents: { type: 'integer', description: 'Paid minus owed, in integer cents. Positive: gets money back. All balances add up to 0.' },
        },
      },
      Transfer: {
        type: 'object',
        required: ['fromMemberId', 'toMemberId', 'amountCents'],
        properties: { fromMemberId: { type: 'string' }, toMemberId: { type: 'string' }, amountCents: cents('How much to pay.') },
      },
      SimplifyResponse: {
        type: 'object',
        required: ['balances', 'transfers'],
        properties: {
          balances: { type: 'array', items: schema('MemberBalance'), description: 'Every member named in the debts, by member ID.' },
          transfers: { type: 'array', items: schema('Transfer') },
        },
      },
      EqualSplitRequest: {
        type: 'object',
        required: ['splitType', 'totalCents', 'participantIds', 'payerId'],
        properties: {
          splitType: { type: 'string', enum: ['EQUAL'] },
          totalCents: cents('The total.'),
          participantIds: { type: 'array', minItems: 1, maxItems: MAX_SPLIT_MEMBERS, uniqueItems: true, items: memberId('A participant.') },
          payerId: memberId('Who paid. Gets the leftover cents if they take part.'),
        },
        example: { splitType: 'EQUAL', totalCents: 1000, participantIds: ['a', 'b', 'c'], payerId: 'a' },
      },
      ExactSplitRequest: {
        type: 'object',
        required: ['splitType', 'totalCents', 'shares'],
        properties: {
          splitType: { type: 'string', enum: ['EXACT'] },
          totalCents: cents('The total. The shares must add up to it exactly.'),
          shares: {
            type: 'array',
            minItems: 1,
            maxItems: MAX_SPLIT_MEMBERS,
            items: {
              type: 'object',
              required: ['memberId', 'amountCents'],
              properties: { memberId: memberId('A member.'), amountCents: cents('Their share.', 0) },
            },
          },
        },
      },
      PercentageSplitRequest: {
        type: 'object',
        required: ['splitType', 'totalCents', 'shares'],
        properties: {
          splitType: { type: 'string', enum: ['PERCENTAGE'] },
          totalCents: cents('The total.'),
          shares: {
            type: 'array',
            minItems: 1,
            maxItems: MAX_SPLIT_MEMBERS,
            description: 'Must add up to 100% (10000 basis points), within 0.01%.',
            items: {
              type: 'object',
              required: ['memberId', 'basisPoints'],
              properties: {
                memberId: memberId('A member.'),
                basisPoints: { type: 'integer', minimum: 0, maximum: 10000, description: '3333 = 33.33%.' },
              },
            },
          },
        },
      },
      ItemizedSplitRequest: {
        type: 'object',
        required: ['splitType', 'totalCents', 'items'],
        properties: {
          splitType: { type: 'string', enum: ['ITEMIZED'] },
          totalCents: cents('The receipt total: items plus tax, service, and tip.'),
          items: {
            type: 'array',
            minItems: 1,
            maxItems: MAX_RECEIPT_ITEMS,
            items: {
              type: 'object',
              required: ['description', 'priceCents', 'participantIds'],
              properties: {
                description: { type: 'string', minLength: 1, maxLength: MAX_ITEM_DESCRIPTION_LENGTH },
                priceCents: cents('The item’s price.'),
                participantIds: { type: 'array', minItems: 1, maxItems: MAX_SPLIT_MEMBERS, uniqueItems: true, items: memberId('Who shares it.') },
              },
            },
          },
          taxCents: cents('Tax. Defaults to 0.', 0),
          serviceCents: cents('Service charge. Defaults to 0.', 0),
          tipCents: cents('Tip. Defaults to 0.', 0),
        },
        example: {
          splitType: 'ITEMIZED',
          totalCents: 3870,
          items: [
            { description: 'Pizza', priceCents: 2000, participantIds: ['a', 'b'] },
            { description: 'Salad', priceCents: 1000, participantIds: ['c'] },
          ],
          taxCents: 270,
          tipCents: 600,
        },
      },
      SplitRequest: {
        oneOf: [schema('EqualSplitRequest'), schema('ExactSplitRequest'), schema('PercentageSplitRequest'), schema('ItemizedSplitRequest')],
        discriminator: {
          propertyName: 'splitType',
          mapping: {
            EQUAL: '#/components/schemas/EqualSplitRequest',
            EXACT: '#/components/schemas/ExactSplitRequest',
            PERCENTAGE: '#/components/schemas/PercentageSplitRequest',
            ITEMIZED: '#/components/schemas/ItemizedSplitRequest',
          },
        },
      },
      Allocation: {
        type: 'object',
        required: ['memberId', 'owedCents'],
        properties: {
          memberId: { type: 'string' },
          owedCents: cents('This member’s share.', 0),
          itemsCents: cents('ITEMIZED only: their items.', 0),
          extrasCents: cents('ITEMIZED only: their share of tax, service, and tip.', 0),
        },
      },
      SplitResponse: {
        type: 'object',
        required: ['splitType', 'totalCents', 'allocations'],
        properties: {
          splitType: { type: 'string', enum: [...SPLIT_TYPES] },
          totalCents: cents('The total.'),
          allocations: { type: 'array', items: schema('Allocation'), description: '`owedCents` adds up to `totalCents` exactly.' },
        },
      },
    },
  },
};
