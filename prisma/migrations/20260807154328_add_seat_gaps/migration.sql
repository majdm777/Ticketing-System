-- AlterEnum
ALTER TYPE "SeatStatus" ADD VALUE 'GAP';

-- AlterTable
ALTER TABLE "VenueSeat" ADD COLUMN     "gap" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "sectionId" DROP NOT NULL;
