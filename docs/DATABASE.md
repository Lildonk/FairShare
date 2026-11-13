# Database schema

PostgreSQL 17, managed with Prisma migrations ([`prisma/schema.prisma`](../prisma/schema.prisma), [`prisma/migrations/`](../prisma/migrations/)). Every amount is an **integer number of cents**; percentages are **basis points** (10000 = 100%).

```mermaid
erDiagram
  User ||--o{ GroupMember : "belongs to groups"
  Group ||--o{ GroupMember : "has members"
  Group ||--o{ Expense : "has"
  User ||--o{ Expense : "paid (payer)"
  Expense ||--|{ ExpenseSplit : "is split into"
  User ||--o{ ExpenseSplit : "owes"
  Group ||--o{ Settlement : "has"
  User ||--o{ Settlement : "sends (fromUser)"
  User ||--o{ Settlement : "receives (toUser)"
  Group ||--o{ AuditEvent : "history"
  User ||--o{ AuditEvent : "acted (actor)"

  User {
    uuid id PK
    string email UK
    string passwordHash "null for Google-only accounts"
    string googleSub UK "Google account ID (OIDC sub)"
    string name
    Role role "MEMBER | ADMIN (platform-wide)"
    datetime createdAt
    datetime updatedAt
  }
  Group {
    uuid id PK
    string name
    string description
    string currency "default USD"
    uuid inviteCode UK
    boolean isArchived "archived ledgers refuse writes"
    datetime createdAt
    datetime updatedAt
  }
  GroupMember {
    uuid id PK
    uuid userId FK
    uuid groupId FK
    datetime joinedAt
  }
  Expense {
    uuid id PK
    uuid groupId FK
    uuid payerId FK "Restrict"
    string title
    int amountCents "CHECK > 0"
    SplitType splitType "EQUAL | EXACT | PERCENTAGE | ITEMIZED"
    string category
    boolean isDisputed
    string receiptUrl
    datetime createdAt
    datetime updatedAt
  }
  ExpenseSplit {
    uuid id PK
    uuid expenseId FK
    uuid userId FK "Restrict"
    int owedCents "CHECK >= 0; sum = amountCents"
    int allocatedBps "PERCENTAGE only, 0-10000"
  }
  Settlement {
    uuid id PK
    uuid groupId FK
    uuid fromUserId FK "Restrict"
    uuid toUserId FK "Restrict; CHECK from <> to"
    int amountCents "CHECK > 0"
    SettlementStatus status "PENDING | CONFIRMED | DISPUTED"
    string notes
    datetime settledAt
    datetime createdAt
    datetime updatedAt
  }
  AuditEvent {
    uuid id PK
    uuid groupId FK "Restrict"
    uuid actorId FK "Restrict"
    AuditAction action
    string entityId "no FK: outlives deleted expenses"
    json snapshot "the record after the change, in cents"
    datetime createdAt
  }
```

## Constraints and why

| Rule | Where | Why |
| --- | --- | --- |
| Amounts are `Int` cents with CHECK constraints (> 0, shares ≥ 0, basis points 0–10000, payer ≠ payee) | migration SQL | The database rejects invalid money rows even if app code is wrong |
| The shared Prisma client rejects non-integer amounts, including inside JSON snapshots | `src/lib/db/prisma.ts` | Prisma silently truncates 19.99 to 19 in an `Int` column |
| `@@unique([userId, groupId])` on members, `@@unique([expenseId, userId])` on splits | schema | One membership per person per group, and one share per person per expense |
| `onDelete: Restrict` on every user reference from expenses, splits, settlements, and audit events | schema | Deleting a user must never erase other members' balances or history |
| `AuditEvent` is append-only: a trigger rejects `UPDATE`, `DELETE`, and `TRUNCATE` | migration `add_audit_event` | Financial history can't be rewritten. Only test cleanup may delete, by turning on `fairshare.audit_maintenance` in its own transaction |
| Indexes on foreign keys and on `(groupId, createdAt)` and `(groupId, status)` | schema | PostgreSQL doesn't index foreign keys automatically; these are the page and board queries |

Each change from the blueprint's Section 5 schema, and the reason for it, is listed in the product spec's [data model decisions](FAIRSHARE_PRODUCT_SPEC.md#data-model-decisions).
