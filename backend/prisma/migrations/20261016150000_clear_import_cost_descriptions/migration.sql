-- Shipment imports used to write the landed-cost breakdown (and supplier)
-- into products.description, which the public online store displays. That
-- text was generated, never typed by an owner, and always had this shape:
--   [Supplier: <name> | ]Landed cost: ¥<cny> × <rate> = ... TZS
-- Clear exactly those, leaving any description an owner wrote untouched.
UPDATE "products"
SET "description" = NULL
WHERE "description" ~ '^(Supplier: [^|]*\| )?Landed cost: ';
