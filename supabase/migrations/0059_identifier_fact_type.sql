-- One fact type: 'identifier'.
--
-- document_facts.fact_type used to hold a small enum of number kinds
-- (serial_number, policy_number, iban, member_id, other, …). That was the
-- wrong axis. German paperwork produces an endless tail of numbers —
-- Steuer-ID, Versichertennummer, Zählernummer, Aktenzeichen — and every
-- new one either needed a code change or fell into a nameless "other"
-- bucket, which is how a document ends up showing "Unklare Kennnummer".
--
-- What actually tells two numbers apart is the LABEL ("Steuer-ID Hanna",
-- "Seriennummer Waschmaschine"), which is free text a family can write and
-- correct, and which the fact search matches questions against. So the
-- type collapses to a single value and the label carries the meaning.
--
-- Nothing is lost: every row already has a label, and rows written by the
-- old extraction were labelled with their type name by default
-- ("Seriennummer", "IBAN", …), so the type name survives where it was the
-- only description there was.
--
-- The column stays (not null, no check constraint) so this migration is a
-- data update, not a schema change: no view, RPC or index depends on the
-- old values.
--
-- Idempotent: the update is a no-op on a second run, and re-labelling only
-- touches rows still carrying the pre-collapse fallback label.

-- 1. Give rows whose label was the nameless fallback a slightly better one
--    BEFORE the type is gone — 'other' rows labelled "Kennung" are the
--    ones with nothing else to go on.
update public.document_facts
   set label = 'Nummer'
 where fact_type <> 'identifier'
   and btrim(label) in ('Kennung', '');

-- 2. Collapse the type.
update public.document_facts
   set fact_type = 'identifier'
 where fact_type <> 'identifier';
