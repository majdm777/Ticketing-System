-- CreateTable
CREATE TABLE "VenueSection" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueSection_pkey" PRIMARY KEY ("id")
);

-- Add the column as nullable first so existing seats can be linked
-- before the constraint is enforced.
ALTER TABLE "VenueSeat" ADD COLUMN "sectionId" TEXT;

-- Backfill one VenueSection per existing (venueId, section) pair. The old
-- schema stored no price, so a placeholder (100) is used — correct prices
-- must be set manually for any pre-existing venue.
INSERT INTO "VenueSection" ("id", "venueId", "name", "price", "createdAt", "updatedAt")
SELECT
    md5("venueId" || ':' || "section"),
    "venueId",
    "section",
    100,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "venueId", "section" FROM "VenueSeat") AS distinct_sections;

-- Link every seat to its section before enforcing NOT NULL.
UPDATE "VenueSeat" vs
SET "sectionId" = s.id
FROM "VenueSection" s
WHERE s."venueId" = vs."venueId" AND s.name = vs."section";

DO $$
DECLARE
  null_count integer;
BEGIN
  SELECT COUNT(*) INTO null_count FROM "VenueSeat" WHERE "sectionId" IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION
      'Cannot set "VenueSeat"."sectionId" NOT NULL: % seat(s) have no matching section. Backfill or delete them before applying this migration.',
      null_count;
  END IF;
END $$;

ALTER TABLE "VenueSeat" ALTER COLUMN "sectionId" SET NOT NULL;

-- Drop the temporary default so the column matches the schema (no default).
ALTER TABLE "VenueSection" ALTER COLUMN "price" DROP DEFAULT;

-- AlterTable: dropping the column auto-drops the unique index that referenced it.
ALTER TABLE "VenueSeat" DROP COLUMN "section";

-- CreateIndex
CREATE UNIQUE INDEX "VenueSection_venueId_name_key" ON "VenueSection"("venueId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "VenueSection_id_venueId_key" ON "VenueSection"("id", "venueId");

-- CreateIndex
CREATE UNIQUE INDEX "VenueSeat_venueId_row_number_sectionId_key" ON "VenueSeat"("venueId", "row", "number", "sectionId");

-- AddForeignKey
ALTER TABLE "VenueSection" ADD CONSTRAINT "VenueSection_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: validated immediately — the table is bounded by seat count,
-- so the scan is trivial; NOT VALID would add no practical benefit.
ALTER TABLE "VenueSeat" ADD CONSTRAINT "VenueSeat_sectionId_venueId_fkey" FOREIGN KEY ("sectionId", "venueId") REFERENCES "VenueSection"("id", "venueId") ON DELETE RESTRICT ON UPDATE CASCADE;
