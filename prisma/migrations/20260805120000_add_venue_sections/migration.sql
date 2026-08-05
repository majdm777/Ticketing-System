-- CreateTable
CREATE TABLE "VenueSection" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueSection_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "VenueSeat" ADD COLUMN "sectionId" TEXT NOT NULL;

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

-- AddForeignKey
ALTER TABLE "VenueSeat" ADD CONSTRAINT "VenueSeat_sectionId_venueId_fkey" FOREIGN KEY ("sectionId", "venueId") REFERENCES "VenueSection"("id", "venueId") ON DELETE RESTRICT ON UPDATE CASCADE;
