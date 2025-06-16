import axios from "axios";

const baseUrl = "http://localhost:3000";

async function testRestriction(ip: string, description: string) {
  console.log(`\n--- Testing for IP: ${ip} (${description}) ---`);
  try {
    const response = await axios.get(baseUrl, {
      headers: {
        "X-Forwarded-For": ip, // Simulate IP for testing
      },
    });
    console.log(`Status: ${response.status}`);
    console.log(`Data: ${response.data}`);
  } catch (error: any) {
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Error Data: ${error.response.data}`);
    } else {
      console.error(`Error: ${error.message}`);
    }
  }
}

async function runTests() {
  // Test Blacklisted IP
  await testRestriction("192.168.1.100", "Blacklisted IP");

  // Test Whitelisted IP (should allow, unless overridden by more specific block)
  await testRestriction("192.168.1.101", "Whitelisted IP");

  // Test IP from US (blocklogin for country US)
  // Note: geoip-lite might return 'US' for certain IPs.
  // For precise testing, you might need to mock geoip-lite or use a known US IP.
  await testRestriction(
    "1.2.3.4",
    "IP from US (simulated, should be blocked if geoip resolves to US)"
  ); // Replace with a known US IP if possible

  // Test IP from Asia (blacklist for continent AS)
  await testRestriction("103.1.1.1", "IP from Asia (simulated)"); // Replace with a known Asian IP if possible

  // Test a general IP (should trigger 'maintenance' if enabled for 'all')
  await testRestriction(
    "5.6.7.8",
    "General IP (should trigger global maintenance)"
  );

  // Test a different IP from India (whitelisted for IN)
  await testRestriction("49.36.100.1", "IP from India (whitelisted for IN)"); // Replace with a known Indian IP

  // Test an IP not matching any specific restriction (should be allowed)
  await testRestriction("203.0.113.1", "Unrestricted IP");

  // Test again to check Redis caching
  console.log("\n--- Testing again to check Redis caching ---");
  await testRestriction("192.168.1.100", "Blacklisted IP (cached)");
  await testRestriction("203.0.113.1", "Unrestricted IP (cached)");
}

runTests();
