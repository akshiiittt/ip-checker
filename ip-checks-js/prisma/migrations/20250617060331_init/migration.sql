-- CreateEnum
CREATE TYPE "CATEGORIES" AS ENUM ('whitelist', 'maintenance', 'blacklist', 'blocklogin');

-- CreateEnum
CREATE TYPE "SCOPES" AS ENUM ('continent', 'country', 'ip', 'ip_subnet', 'all');

-- CreateEnum
CREATE TYPE "State" AS ENUM ('enabled', 'disabled');

-- CreateTable
CREATE TABLE "restrictions" (
    "id" BIGSERIAL NOT NULL,
    "category" "CATEGORIES" NOT NULL,
    "scope" "SCOPES" NOT NULL,
    "value" VARCHAR(64) NOT NULL,
    "code" INTEGER,
    "state" "State" NOT NULL DEFAULT 'enabled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restrictions_pkey" PRIMARY KEY ("id")
);
