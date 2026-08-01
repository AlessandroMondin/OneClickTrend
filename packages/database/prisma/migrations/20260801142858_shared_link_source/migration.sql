-- AlterTable
ALTER TABLE "Generation" ADD COLUMN     "sharedLinkId" TEXT;

-- AlterTable
ALTER TABLE "SharedLink" DROP COLUMN "consumed",
ADD COLUMN     "seen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'other';

-- AddForeignKey
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_sharedLinkId_fkey" FOREIGN KEY ("sharedLinkId") REFERENCES "SharedLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

