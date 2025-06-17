const { PrismaClient } = require("@prisma/client");
const Redis = require("redis");
const geoip = require("geoip-lite");
const { Address4 } = require("ip-address");

const prisma = new PrismaClient();
const redisClient = Redis.createClient({ url: process.env.REDIS_URL });

// Connect to Redis with error handling
redisClient
  .connect()
  .catch((err) => console.error("Redis connection error:", err));

// Fetch restrictions from database and group by category/scope
async function fetchRestrictions() {
  try {
    const restrictions = await prisma.restrictions.findMany({
      where: { state: "enabled" },
      select: { category: true, scope: true, value: true, code: true },
    });

    const grouped = {};
    // Initialize categories
    ["whitelist", "maintenance", "blacklist", "blocklogin"].forEach(
      (category) => {
        grouped[category] = {};
        // Initialize scopes for each category
        ["all", "ip", "ip_subnet", "country", "continent"].forEach((scope) => {
          grouped[category][scope] = restrictions
            .filter((r) => r.category === category && r.scope === scope)
            .map((r) => ({ value: r.value, code: r.code }));
        });
      }
    );

    return grouped;
  } catch (err) {
    console.error("Error fetching restrictions:", err);
    throw err;
  }
}

// Get restrictions from Redis or database, cache for 5 minutes
async function getRestrictions() {
  const cacheKey = "restrictions";
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const restrictions = await fetchRestrictions();
    await redisClient.setEx(cacheKey, 300, JSON.stringify(restrictions)); // 300 seconds = 5 minutes
    return restrictions;
  } catch (err) {
    console.error("Error in getRestrictions:", err);
    return await fetchRestrictions(); // Fallback to DB if Redis fails
  }
}

// Find first matching restriction for a category
function findFirstMatchedRestriction(category, ip, restrictions) {
  const location = geoip.lookup(ip) || { country: "", continent: "" };
  const continent = location.continent || "";
  const country = location.country || "";

  // Check 'all' scope
  if (restrictions[category]["all"]?.length > 0) {
    return restrictions[category]["all"][0];
  }

  // Check 'ip' scope
  if (restrictions[category]["ip"]?.find((r) => r.value === ip)) {
    return restrictions[category]["ip"].find((r) => r.value === ip);
  }

  // Check 'ip_subnet' scope
  if (
    restrictions[category]["ip_subnet"]?.find((r) => {
      try {
        const subnet = new Address4(r.value);
        const ipAddr = new Address4(ip);
        return subnet.isInSubnet(ipAddr);
      } catch {
        console.error(`Invalid subnet or IP: ${r.value}, ${ip}`);
        return false;
      }
    })
  ) {
    return restrictions[category]["ip_subnet"].find((r) => {
      try {
        const subnet = new Address4(r.value);
        const ipAddr = new Address4(ip);
        return subnet.isInSubnet(ipAddr);
      } catch {
        return false;
      }
    });
  }

  // Check 'continent' scope
  if (
    continent &&
    restrictions[category]["continent"]?.find(
      (r) => r.value.toUpperCase() === continent.toUpperCase()
    )
  ) {
    return restrictions[category]["continent"].find(
      (r) => r.value.toUpperCase() === continent.toUpperCase()
    );
  }

  // Check 'country' scope
  if (
    country &&
    restrictions[category]["country"]?.find(
      (r) => r.value.toUpperCase() === country.toUpperCase()
    )
  ) {
    return restrictions[category]["country"].find(
      (r) => r.value.toUpperCase() === country.toUpperCase()
    );
  }

  return null;
}

// Middleware to check restrictions
async function checkRestrictions(req, res, next) {
  // Skip for specific paths
  if (req.path === "/api/v2/barong/identity/users/access") {
    return next();
  }

  const ip =
    req.ip || req.headers["x-forwarded-for"]?.split(",")[0] || "unknown";
  try {
    const restrictions = await getRestrictions();

    for (const category of [
      "whitelist",
      "maintenance",
      "blacklist",
      "blocklogin",
    ]) {
      const restriction = findFirstMatchedRestriction(
        category,
        ip,
        restrictions
      );

      if (restriction) {
        if (category === "blacklist" || category === "maintenance") {
          console.log(
            `Access denied for ip ${ip} due to ${restriction.value} for ${category}`
          );
          return res
            .status(restriction.code || 403)
            .json({ errors: [`authz.restrict.${category}`] });
        }
        if (category === "blocklogin" && req.path === "/login") {
          console.log(
            `Login denied for ip ${ip} due to ${restriction.value} for ${category}`
          );
          return res
            .status(restriction.code || 403)
            .json({ errors: [`authz.restrict.${category}`] });
        }
        if (category === "whitelist") {
          return next(); // Allow whitelisted users
        }
      }
    }

    next(); // No restrictions, proceed
  } catch (err) {
    console.error("Error in checkRestrictions:", err);
    res.status(500).json({ errors: ["Internal server error"] });
  }
}

module.exports = { checkRestrictions };
