import express, { Request, Response, NextFunction } from "express";
import { PrismaClient, SCOPES, CATEGORIES } from "@prisma/client";
import { createClient } from "redis";
import geoip from "geoip-lite";

const app = express();
const port = process.env.PORT || 3000;

const prisma = new PrismaClient();

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redisClient.on("error", (err) => console.error(" Redis error:", err));

(async () => {
  await redisClient.connect();
  console.log(" Connected to Redis");
})();

const getClientIp = (req: Request): string => {
  const rawIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const ip = rawIp?.toString().replace("::ffff:", "") || "127.0.0.1";
  return ip === "::1" ? "203.0.113.1" : ip;
};

function safeStringify(obj: any): string {
  return JSON.stringify(obj, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
}

async function checkRestrictions(ip: string) {
  const cacheKey = `restriction:${ip}`;
  const cached = await redisClient.get(cacheKey);

  if (cached) {
    return cached === "none" ? null : JSON.parse(cached);
  }

  const geo = geoip.lookup(ip);
  const country = geo?.country || "";
  // const continent = geo?.continent || "";

  const restrictions = await prisma.restrictions.findMany({
    where: {
      state: "enabled",
      OR: [
        { scope: "ip", value: ip },
        { scope: "country", value: country },
        // { scope: "continent", value: continent },
        { scope: "all" },
      ],
    },
  });

  const restriction = restrictions[0] || null;

  await redisClient.setEx(
    cacheKey,
    300,
    restriction ? safeStringify(restriction) : "none"
  );

  return restriction;
}

app.use(async (req: Request, res: Response, next: NextFunction) => {
  const ip = getClientIp(req);
  const restriction = await checkRestrictions(ip);

  if (!restriction) return next();

  const msg = `Access from ${restriction.scope}: ${restriction.value}`;
  const status = restriction.code || 403;

  switch (restriction.category) {
    case "whitelist":
      return next();
    case "blocklogin":
      return res.status(status).send(`Login blocked. ${msg}`);
    case "blacklist":
      return res.status(status).send(`Access denied. ${msg}`);
    case "maintenance":
      return res.status(status).send(`Under maintenance. ${msg}`);
    default:
      return res.status(status).send("Access restricted.");
  }
});

app.listen(port, () => {
  console.log(` Server running at http://localhost:${port}`);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  await redisClient.quit();
  console.log(" Shutdown complete.");
  process.exit(0);
});
