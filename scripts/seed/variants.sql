INSERT INTO variants (product_id, color, size, sku, price_delta_cents)
SELECT pr.id, v.color, v.size, v.sku, v.delta
FROM (VALUES
  ('classic-tee', 'Black', 'S',  'tee-blk-s',  0),
  ('classic-tee', 'Black', 'M',  'tee-blk-m',  0),
  ('classic-tee', 'Black', 'L',  'tee-blk-l',  0),
  ('classic-tee', 'Black', 'XL', 'tee-blk-xl', 200),
  ('classic-tee', 'White', 'S',  'tee-wht-s',  0),
  ('classic-tee', 'White', 'M',  'tee-wht-m',  0),
  ('classic-tee', 'White', 'L',  'tee-wht-l',  0),
  ('classic-tee', 'White', 'XL', 'tee-wht-xl', 200),
  ('ceramic-mug', 'White', NULL, 'mug-wht',    0),
  ('ceramic-mug', 'Black', NULL, 'mug-blk',    100),
  ('dad-cap',     'Black', NULL, 'cap-blk',    0),
  ('dad-cap',     'Navy',  NULL, 'cap-nvy',    0)
) AS v(slug, color, size, sku, delta)
JOIN products pr ON pr.slug = v.slug
ON CONFLICT (sku) DO NOTHING;
