-- AlterTable
ALTER TABLE "Generation" ADD COLUMN     "outputKind" TEXT NOT NULL DEFAULT 'video',
ADD COLUMN     "outputS3Keys" JSONB;

