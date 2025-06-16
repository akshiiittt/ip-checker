-- AlterEnum
ALTER TYPE "SCOPES" ADD VALUE 'continent';

-- AlterTable
CREATE SEQUENCE restrictions_id_seq;
ALTER TABLE "restrictions" ALTER COLUMN "id" SET DEFAULT nextval('restrictions_id_seq');
ALTER SEQUENCE restrictions_id_seq OWNED BY "restrictions"."id";
