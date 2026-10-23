-- POS drafts (and future synthetic flows) write carts rows whose
-- conversationId is a synthetic id (`pos_draft_*`), not an existing
-- conversations row. In Firestore this was a soft reference; the Postgres
-- FK added during migration breaks the POS draft flow with
-- carts_conversation_fk violations. Keep the column, drop the FK.
alter table carts
  drop constraint if exists carts_conversation_fk;
