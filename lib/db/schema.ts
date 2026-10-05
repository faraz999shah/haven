import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { NEW_PAYEE_MODES, PAYMENT_STATUSES, RISK_LEVELS, type RuleHit } from '@/lib/domain'

export const paymentStatus = pgEnum('payment_status', PAYMENT_STATUSES)
export const riskLevel = pgEnum('risk_level', RISK_LEVELS)
export const newPayeeMode = pgEnum('new_payee_mode', NEW_PAYEE_MODES)
export const messageRole = pgEnum('message_role', ['senior', 'haven'])
export const conversationStatus = pgEnum('conversation_status', ['active', 'completed', 'abandoned'])

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

export const caregivers = pgTable('caregivers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  createdAt: createdAt(),
})

export const seniors = pgTable('seniors', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  caregiverId: uuid('caregiver_id')
    .notNull()
    .references(() => caregivers.id),
  // "Today" for the daily limit is computed in the senior's time zone.
  timeZone: text('time_zone').notNull().default('America/New_York'),
  createdAt: createdAt(),
})

export const trustedPayees = pgTable(
  'trusted_payees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seniorId: uuid('senior_id')
      .notNull()
      .references(() => seniors.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    relationship: text('relationship').notNull().default(''),
    // Other ways the senior refers to them ("Maria", "my granddaughter", "the plumber").
    aliases: text('aliases').array().notNull().default([]),
    paypalEmail: text('paypal_email'),
    phone: text('phone'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('trusted_payees_senior_idx').on(t.seniorId)],
)

export const ruleSettings = pgTable('rule_settings', {
  seniorId: uuid('senior_id')
    .primaryKey()
    .references(() => seniors.id, { onDelete: 'cascade' }),
  maxSinglePaymentCents: integer('max_single_payment_cents').notNull(),
  dailyLimitCents: integer('daily_limit_cents').notNull(),
  newPayeeMode: newPayeeMode('new_payee_mode').notNull().default('always'),
  newPayeeThresholdCents: integer('new_payee_threshold_cents').notNull().default(20000),
  rapidMaxCount: integer('rapid_max_count').notNull().default(3),
  rapidWindowMinutes: integer('rapid_window_minutes').notNull().default(60),
  updatedAt: updatedAt(),
})

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  seniorId: uuid('senior_id')
    .notNull()
    .references(() => seniors.id, { onDelete: 'cascade' }),
  status: conversationStatus('status').notNull().default('active'),
  // Pipeline state between turns (draft payment, follow-up round count). Shape owned by lib/conversation.
  state: jsonb('state').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: messageRole('role').notNull(),
    text: text('text').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId, t.createdAt)],
)

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seniorId: uuid('senior_id')
      .notNull()
      .references(() => seniors.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    trustedPayeeId: uuid('trusted_payee_id').references(() => trustedPayees.id, { onDelete: 'set null' }),
    payeeName: text('payee_name').notNull(),
    payeeEmail: text('payee_email'),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('USD'),
    purpose: text('purpose'),
    status: paymentStatus('status').notNull(),
    // Final decided risk (after combining rules + AI) and what the AI alone said.
    riskLevel: riskLevel('risk_level').notNull(),
    aiRiskLevel: riskLevel('ai_risk_level'),
    reason: text('reason'),
    aiSignals: jsonb('ai_signals').$type<string[]>().notNull().default([]),
    rulesTriggered: jsonb('rules_triggered').$type<RuleHit[]>().notNull().default([]),
    paypalBatchId: text('paypal_batch_id'),
    paypalItemId: text('paypal_item_id'),
    paypalStatus: text('paypal_status'),
    paypalError: text('paypal_error'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    // When the senior was told about the caregiver's decision (approve/decline).
    seniorNotifiedAt: timestamp('senior_notified_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('payments_senior_created_idx').on(t.seniorId, t.createdAt),
    index('payments_batch_idx').on(t.paypalBatchId),
    index('payments_updated_idx').on(t.updatedAt),
  ],
)

// PayPal can deliver the same webhook more than once; we record each event id once.
export const webhookEvents = pgTable('webhook_events', {
  id: text('id').primaryKey(),
  eventType: text('event_type').notNull(),
  resourceId: text('resource_id'),
  payload: jsonb('payload').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Caregiver = typeof caregivers.$inferSelect
export type Senior = typeof seniors.$inferSelect
export type TrustedPayee = typeof trustedPayees.$inferSelect
export type RuleSettingsRow = typeof ruleSettings.$inferSelect
export type Conversation = typeof conversations.$inferSelect
export type Message = typeof messages.$inferSelect
export type Payment = typeof payments.$inferSelect
