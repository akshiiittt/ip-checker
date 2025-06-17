const express = require("express");
const { checkRestrictions } = require("./restrictions");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Test endpoint
app.get("/api/v1/test", checkRestrictions, (req, res) => {
  res.json({ message: "Access granted" });
});

// Test login endpoint
app.get("/login", checkRestrictions, (req, res) => {
  res.json({ message: "Login successful" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ errors: ["Internal server error"] });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
