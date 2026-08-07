-- A seat coordinate is (row, number) within a venue. Two seats in the same
-- venue must never share a coordinate, even when they belong to different
-- sections — a venue with N seats has exactly N distinct coordinates, so
-- layouts round-trip through the builder/loader and the attendee seat map
-- without dropping or synthesizing seats.

-- Reject existing duplicates before enforcing the new constraint. The old
-- unique index was (venueId, row, number, sectionId), so duplicate
-- coordinates could only have been created across sections.
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT "venueId", "row", "number"
    FROM "VenueSeat"
    GROUP BY "venueId", "row", "number"
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce unique seat coordinates: % (venueId, row, number) coordinate(s) are shared by more than one seat. Fix or delete them before applying this migration.',
      dup_count;
  END IF;
END $$;

-- DropIndex: the old index allowed the same (row, number) in different sections.
DROP INDEX "VenueSeat_venueId_row_number_sectionId_key";

-- CreateIndex: coordinates are now unique per venue, across all sections.
CREATE UNIQUE INDEX "VenueSeat_venueId_row_number_key" ON "VenueSeat"("venueId", "row", "number");
