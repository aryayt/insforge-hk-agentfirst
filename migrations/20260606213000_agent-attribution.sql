-- Provenance + guest design persistence.
-- Answers: "who/which agent placed this order?" and "where are the designs stored?"

-- ── Designs: allow guest rows + provenance ──────────────────────────────────
ALTER TABLE designs ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE designs ADD COLUMN IF NOT EXISTS label        TEXT;
ALTER TABLE designs ADD COLUMN IF NOT EXISTS session_key  TEXT;  -- ChatGPT user subject / conversation / 'web'
ALTER TABLE designs ADD COLUMN IF NOT EXISTS agent_source TEXT;  -- e.g. 'openai-mcp', 'claude-ai', 'web', 'inspector'
CREATE INDEX IF NOT EXISTS idx_designs_session_key ON designs(session_key);

-- Web /data view + storefront may render guest designs (artwork bucket is public-read anyway).
CREATE POLICY designs_guest_select ON designs
  FOR SELECT TO anon USING (user_id IS NULL);
GRANT SELECT ON designs TO anon;

-- ── Orders: who bought, via which agent ─────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name      TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS agent_source       TEXT;  -- MCP client name or 'web'
ALTER TABLE orders ADD COLUMN IF NOT EXISTS agent_user_subject TEXT;  -- stable per-ChatGPT-account id
ALTER TABLE orders ADD COLUMN IF NOT EXISTS agent_locale       TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_agent_source ON orders(agent_source);
