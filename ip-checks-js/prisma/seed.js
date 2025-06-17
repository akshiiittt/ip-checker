const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  await prisma.restrictions.deleteMany(); // Clear existing data
  await prisma.restrictions.createMany({
    data: [
      // Whitelist: Allow specific IP
      {
        category: "whitelist",
        scope: "ip",
        value: "192.168.1.1",
        code: 200,
        state: "enabled",
      },
      // Blacklist: Block a country
      {
        category: "blacklist",
        scope: "country",
        value: "US",
        code: 403,
        state: "enabled",
      },
      // Maintenance: Block a continent
      {
        category: "maintenance",
        scope: "continent",
        value: "EU",
        code: 503,
        state: "enabled",
      },
      // Blocklogin: Prevent login for an IP subnet
      {
        category: "blocklogin",
        scope: "ip_subnet",
        value: "192.168.1.0/24",
        code: 403,
        state: "enabled",
      },
      // All: Block everyone
      {
        category: "blacklist",
        scope: "all",
        value: "all",
        code: 403,
        state: "enabled",
      },
      // Disabled restriction (ignored)
      {
        category: "whitelist",
        scope: "country",
        value: "CA",
        code: 200,
        state: "disabled",
      },
    ],
  });
  console.log("Seed data inserted");
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
