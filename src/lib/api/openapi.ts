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
import { MAX_CATEGORY_LENGTH, MAX_EXPENSE_TITLE_LENGTH } from './expense-input';
import { MAX_GROUP_DESCRIPTION_LENGTH, MAX_GROUP_NAME_LENGTH } from './group-input';
import { MAX_PAYMENT_NOTES_LENGTH } from './settlement-input';

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
const groupId = { $ref: '#/components/parameters/GroupId' };
const expenseId = { $ref: '#/components/parameters/ExpenseId' };
const EXPENSE_RULES =
  'The shares (`splits`) must add up to `amountCents` exactly, name only members, and list each member once. ' +
  'EQUAL and PERCENTAGE shares must match what the finance engines compute: EQUAL gives leftover cents to the ' +
  'payer if they take part, otherwise one cent each by member ID; PERCENTAGE shares carry basis points. EXACT ' +
  'and ITEMIZED shares are taken as given. Refused with 409 while the group is archived.';
const expenseNotFound = jsonBody('No such group or expense, or you are not a member (`not_found`).', schema('Error'));
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
    { name: 'Expenses', description: 'A group’s shared expenses. Any member may add, change, or delete them.' },
    { name: 'Settlements', description: 'Balances, suggested transfers, and recorded payments.' },
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
      post: {
        tags: ['Groups'],
        summary: 'Create a group',
        description: 'You become its only member. Share its `inviteCode` so others can join.',
        security: SIGNED_IN,
        requestBody: requestBody('CreateGroupRequest'),
        responses: {
          '201': jsonBody('The new group.', schema('GroupResponse')),
          '400': response('InvalidInput'),
          '401': response('Unauthorized'),
        },
      },
    },
    '/api/v1/groups/join': {
      post: {
        tags: ['Groups'],
        summary: 'Join a group with its invite code',
        description: 'Joining a group you already belong to changes nothing.',
        security: SIGNED_IN,
        requestBody: requestBody('JoinGroupRequest'),
        responses: {
          '200': jsonBody('The group you joined.', schema('GroupResponse')),
          '400': response('InvalidInput'),
          '401': response('Unauthorized'),
          '404': jsonBody('No group has this invite code (`not_found`).', schema('Error')),
          '409': response('GroupArchived'),
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
          '200': jsonBody('The group, its invite code, and members’ names (no emails).', schema('GroupResponse')),
          '401': response('Unauthorized'),
          '404': response('GroupNotFound'),
        },
      },
    },
    '/api/v1/groups/{groupId}/expenses': {
      get: {
        tags: ['Expenses'],
        summary: 'The group’s expenses',
        security: SIGNED_IN,
        parameters: [groupId],
        responses: {
          '200': jsonBody('Oldest first, each with its splits by member ID. Archived groups can still be read.', {
            type: 'object',
            required: ['expenses'],
            properties: { expenses: { type: 'array', items: schema('Expense') } },
          }),
          '401': response('Unauthorized'),
          '404': response('GroupNotFound'),
        },
      },
      post: {
        tags: ['Expenses'],
        summary: 'Add an expense',
        description: EXPENSE_RULES,
        security: SIGNED_IN,
        parameters: [groupId],
        requestBody: requestBody('ExpenseInput'),
        responses: {
          '201': jsonBody('The saved expense.', schema('ExpenseResponse')),
          '400': response('InvalidInput'),
          '401': response('Unauthorized'),
          '404': response('GroupNotFound'),
          '409': response('GroupArchived'),
        },
      },
    },
    '/api/v1/groups/{groupId}/expenses/{expenseId}': {
      patch: {
        tags: ['Expenses'],
        summary: 'Replace an expense',
        description: `Send the whole expense, as when adding one; its splits are replaced. A missing \`category\` keeps the current one. ${EXPENSE_RULES}`,
        security: SIGNED_IN,
        parameters: [groupId, expenseId],
        requestBody: requestBody('ExpenseInput'),
        responses: {
          '200': jsonBody('The updated expense.', schema('ExpenseResponse')),
          '400': response('InvalidInput'),
          '401': response('Unauthorized'),
          '404': expenseNotFound,
          '409': response('GroupArchived'),
        },
      },
      delete: {
        tags: ['Expenses'],
        summary: 'Delete an expense',
        description: 'Deletes the expense and its splits. Refused with 409 while the group is archived.',
        security: SIGNED_IN,
        parameters: [groupId, expenseId],
        responses: {
          '204': { description: 'Deleted.' },
          '401': response('Unauthorized'),
          '404': expenseNotFound,
          '409': response('GroupArchived'),
        },
      },
    },
    '/api/v1/groups/{groupId}/settlements': {
      get: {
        tags: ['Settlements'],
        summary: 'Balances, suggested transfers, and recorded payments',
        description:
          'Confirmed payments count toward balances; pending and disputed ones do not. The transfers come from ' +
          'the same greedy matcher as `POST /api/v1/simplify`.',
        security: SIGNED_IN,
        parameters: [groupId],
        responses: {
          '200': jsonBody('The group’s settlement board.', schema('SettlementBoard')),
          '401': response('Unauthorized'),
          '404': response('GroupNotFound'),
        },
      },
      post: {
        tags: ['Settlements'],
        summary: 'Record a payment',
        description:
          'Only the payer or the receiver may record a payment. When the receiver records it, it is CONFIRMED at ' +
          'once; when the payer does, it stays PENDING until the receiver confirms or disputes it.',
        security: SIGNED_IN,
        parameters: [groupId],
        requestBody: requestBody('RecordPaymentRequest'),
        responses: {
          '201': jsonBody('The recorded payment.', schema('SettlementResponse')),
          '400': response('InvalidInput'),
          '401': response('Unauthorized'),
          '403': jsonBody('You are neither the payer nor the receiver (`forbidden`).', schema('Error')),
          '404': response('GroupNotFound'),
          '409': response('GroupArchived'),
        },
      },
    },
    '/api/v1/settlements/{settlementId}': {
      patch: {
        tags: ['Settlements'],
        summary: 'Confirm or dispute a pending payment',
        description: 'Only the receiver may answer, and only once.',
        security: SIGNED_IN,
        parameters: [{ $ref: '#/components/parameters/SettlementId' }],
        requestBody: requestBody('SettlementStatusRequest'),
        responses: {
          '200': jsonBody('The updated payment.', schema('SettlementResponse')),
          '400': response('InvalidInput'),
          '401': response('Unauthorized'),
          '403': jsonBody('Only the receiver can confirm or dispute it (`forbidden`).', schema('Error')),
          '404': jsonBody('No such payment, or it is not in one of your groups (`not_found`).', schema('Error')),
          '409': jsonBody(
            'The group is archived (`group_archived`), or the payment is no longer pending (`settlement_not_pending`).',
            schema('Error'),
          ),
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
    '/api/v1/admin/groups/{groupId}/archive': {
      patch: {
        tags: ['Admin'],
        summary: 'Archive a group',
        description:
          'Freezes the group’s ledger: adding, changing, or deleting expenses, recording or answering payments, ' +
          'and joining then answer 409, while members can still read everything. Archiving twice changes ' +
          'nothing. The admin need not be a member. There is no unarchive yet.',
        security: SIGNED_IN,
        parameters: [groupId],
        responses: {
          '200': jsonBody('The archived group.', {
            type: 'object',
            required: ['group'],
            properties: { group: schema('AdminGroup') },
          }),
          '401': response('Unauthorized'),
          '403': response('Forbidden'),
          '404': jsonBody('No such group (`not_found`). Only admins get this far.', schema('Error')),
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
      ExpenseId: { name: 'expenseId', in: 'path', required: true, schema: uuid, description: 'The expense’s ID.' },
      SettlementId: { name: 'settlementId', in: 'path', required: true, schema: uuid, description: 'The payment’s ID.' },
    },
    responses: {
      InvalidInput: jsonBody('Invalid input (`invalid_input`). `fields` says what to fix.', schema('Error')),
      Unauthorized: jsonBody('Not signed in, or the session is invalid or expired (`unauthorized`).', schema('Error')),
      Forbidden: jsonBody('Signed in, but not an admin (`forbidden`).', schema('Error')),
      GroupNotFound: jsonBody('No such group, or you are not a member of it (`not_found`).', schema('Error')),
      GroupArchived: jsonBody('The group is archived, so its records can’t change (`group_archived`).', schema('Error')),
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
          inviteCode: { type: 'string', description: 'Share it so others can join with `POST /api/v1/groups/join`.' },
          members: { type: 'array', items: schema('GroupMember'), description: 'In the order they joined.' },
        },
      },
      GroupResponse: { type: 'object', required: ['group'], properties: { group: schema('GroupDetail') } },
      CreateGroupRequest: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: MAX_GROUP_NAME_LENGTH },
          description: { type: 'string', maxLength: MAX_GROUP_DESCRIPTION_LENGTH, nullable: true, description: 'Blank means none.' },
        },
        example: { name: 'Ski trip', description: 'February cabin' },
      },
      JoinGroupRequest: {
        type: 'object',
        required: ['inviteCode'],
        properties: { inviteCode: { type: 'string', description: 'From the group’s details, shown to its members.' } },
      },
      ExpenseSplit: {
        type: 'object',
        required: ['userId', 'owedCents', 'allocatedBps'],
        properties: {
          userId: uuid,
          owedCents: cents('This member’s share.', 0),
          allocatedBps: {
            type: 'integer',
            minimum: 0,
            maximum: 10000,
            nullable: true,
            description: 'PERCENTAGE only, in basis points (3333 = 33.33%); null for every other split type.',
          },
        },
      },
      ExpenseInput: {
        type: 'object',
        required: ['title', 'amountCents', 'payerId', 'splitType', 'splits'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: MAX_EXPENSE_TITLE_LENGTH },
          amountCents: cents('The total.'),
          payerId: { ...uuid, description: 'The member who paid.' },
          splitType: { type: 'string', enum: [...SPLIT_TYPES] },
          category: { type: 'string', minLength: 1, maxLength: MAX_CATEGORY_LENGTH, description: 'Defaults to General.' },
          splits: { type: 'array', minItems: 1, items: schema('ExpenseSplit') },
        },
        example: {
          title: 'Dinner',
          amountCents: 10000,
          payerId: '11111111-1111-4111-8111-111111111111',
          splitType: 'EQUAL',
          splits: [
            { userId: '11111111-1111-4111-8111-111111111111', owedCents: 3334, allocatedBps: null },
            { userId: '22222222-2222-4222-8222-222222222222', owedCents: 3333, allocatedBps: null },
            { userId: '33333333-3333-4333-8333-333333333333', owedCents: 3333, allocatedBps: null },
          ],
        },
      },
      Expense: {
        type: 'object',
        required: ['id', 'groupId', 'title', 'amountCents', 'payerId', 'splitType', 'category', 'isDisputed', 'createdAt', 'updatedAt', 'splits'],
        properties: {
          id: uuid,
          groupId: uuid,
          title: { type: 'string' },
          amountCents: cents('The total.'),
          payerId: uuid,
          splitType: { type: 'string', enum: [...SPLIT_TYPES] },
          category: { type: 'string' },
          isDisputed: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          splits: { type: 'array', items: schema('ExpenseSplit'), description: 'By member ID; `owedCents` adds up to `amountCents`.' },
        },
      },
      ExpenseResponse: { type: 'object', required: ['expense'], properties: { expense: schema('Expense') } },
      GroupBalance: {
        type: 'object',
        required: ['userId', 'balanceCents'],
        properties: {
          userId: uuid,
          balanceCents: {
            type: 'integer',
            description: 'Paid minus owed, after confirmed payments, in integer cents. Positive: gets money back. All balances add up to 0.',
          },
        },
      },
      GroupTransfer: {
        type: 'object',
        required: ['fromUserId', 'toUserId', 'amountCents'],
        properties: { fromUserId: uuid, toUserId: uuid, amountCents: cents('How much to pay.') },
      },
      Settlement: {
        type: 'object',
        required: ['id', 'groupId', 'fromUserId', 'toUserId', 'amountCents', 'status', 'notes', 'settledAt', 'createdAt', 'updatedAt'],
        properties: {
          id: uuid,
          groupId: uuid,
          fromUserId: uuid,
          toUserId: uuid,
          amountCents: cents('The payment.'),
          status: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'DISPUTED'] },
          notes: { type: 'string', nullable: true },
          settledAt: { type: 'string', format: 'date-time', nullable: true, description: 'When it was confirmed.' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      SettlementResponse: { type: 'object', required: ['settlement'], properties: { settlement: schema('Settlement') } },
      SettlementBoard: {
        type: 'object',
        required: ['balances', 'transfers', 'settlements'],
        properties: {
          balances: { type: 'array', items: schema('GroupBalance'), description: 'Every member, by member ID.' },
          transfers: { type: 'array', items: schema('GroupTransfer') },
          settlements: { type: 'array', items: schema('Settlement'), description: 'Every recorded payment, oldest first.' },
        },
      },
      RecordPaymentRequest: {
        type: 'object',
        required: ['fromUserId', 'toUserId', 'amountCents'],
        properties: {
          fromUserId: { ...uuid, description: 'The member who paid.' },
          toUserId: { ...uuid, description: 'The member who received it.' },
          amountCents: cents('How much.'),
          notes: { type: 'string', maxLength: MAX_PAYMENT_NOTES_LENGTH, nullable: true },
        },
      },
      SettlementStatusRequest: {
        type: 'object',
        required: ['status'],
        properties: { status: { type: 'string', enum: ['CONFIRMED', 'DISPUTED'] } },
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
