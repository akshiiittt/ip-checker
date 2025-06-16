/*
  Warnings:

  - The values [continent] on the enum `SCOPES` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "SCOPES_new" AS ENUM ('country', 'ip', 'ip_subnet', 'all');
ALTER TABLE "restrictions" ALTER COLUMN "scope" TYPE "SCOPES_new" USING ("scope"::text::"SCOPES_new");
ALTER TYPE "SCOPES" RENAME TO "SCOPES_old";
ALTER TYPE "SCOPES_new" RENAME TO "SCOPES";
DROP TYPE "SCOPES_old";
COMMIT;
