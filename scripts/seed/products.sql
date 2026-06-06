INSERT INTO products (slug, name, type, description, base_price_cents) VALUES
  ('classic-tee', 'Classic Tee', 'tshirt', '100% cotton unisex tee — your design on the front.', 1999),
  ('ceramic-mug', 'Ceramic Mug', 'mug',    '11oz ceramic mug — wrap-around print.',             1299),
  ('dad-cap',     'Dad Cap',     'cap',     'Adjustable cotton cap — front print.',              1799)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
