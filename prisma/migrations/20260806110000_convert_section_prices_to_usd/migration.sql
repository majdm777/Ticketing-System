-- Section prices used to hold whole LBP amounts (e.g. 300000 for $3.33).
-- Prices now mean whole US dollars ($1 is stored as 1). Convert any value
-- that is clearly an LBP amount (>= USD_TO_LBP = 90000) to the nearest whole
-- dollar; leave smaller values untouched, since they were already entered as
-- dollars by the seat-map builder.
UPDATE "VenueSection"
SET "price" = GREATEST(1, ROUND("price"::numeric / 90000)::int)
WHERE "price" >= 90000;
