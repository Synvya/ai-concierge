/**
 * Simple validation test for reservation modification schemas
 * 
 * This script validates that:
 * 1. The schemas themselves are valid JSON Schema
 * 2. The example files validate against their schemas
 * 3. Edge cases are handled correctly
 * 
 * Run with: node scripts/validate-modification-schemas.js
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize AJV
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

// Load schemas
const modificationRequestSchema = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../docs/schemas/reservation.modification.request.schema.json"),
    "utf-8"
  )
);

const modificationResponseSchema = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../docs/schemas/reservation.modification.response.schema.json"),
    "utf-8"
  )
);

// Compile schemas
const validateModificationRequest = ajv.compile(modificationRequestSchema);
const validateModificationResponse = ajv.compile(modificationResponseSchema);

// Load examples
const modificationRequestExample = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../docs/schemas/examples/reservation.modification.request.example.json"),
    "utf-8"
  )
);

const modificationResponseAcceptedExample = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../docs/schemas/examples/reservation.modification.response.accepted.example.json"),
    "utf-8"
  )
);

const modificationResponseDeclinedExample = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../docs/schemas/examples/reservation.modification.response.declined.example.json"),
    "utf-8"
  )
);

// Test validation
console.log("Testing reservation modification schemas...\n");

// Test modification request example
console.log("1. Testing modification request example:");
const requestValid = validateModificationRequest(modificationRequestExample);
if (requestValid) {
  console.log("   ✅ Modification request example is valid");
} else {
  console.log("   ❌ Modification request example is invalid:");
  console.log("   ", validateModificationRequest.errors);
  process.exit(1);
}

// Test modification response accepted example
console.log("\n2. Testing modification response (accepted) example:");
const responseAcceptedValid = validateModificationResponse(modificationResponseAcceptedExample);
if (responseAcceptedValid) {
  console.log("   ✅ Modification response (accepted) example is valid");
} else {
  console.log("   ❌ Modification response (accepted) example is invalid:");
  console.log("   ", validateModificationResponse.errors);
  process.exit(1);
}

// Test modification response declined example
console.log("\n3. Testing modification response (declined) example:");
const responseDeclinedValid = validateModificationResponse(modificationResponseDeclinedExample);
if (responseDeclinedValid) {
  console.log("   ✅ Modification response (declined) example is valid");
} else {
  console.log("   ❌ Modification response (declined) example is invalid:");
  console.log("   ", validateModificationResponse.errors);
  process.exit(1);
}

// Test edge cases
console.log("\n4. Testing edge cases:");

// Test: accepted without iso_time should fail
const invalidAccepted = { status: "accepted", message: "Works!" };
const invalidAcceptedValid = validateModificationResponse(invalidAccepted);
if (!invalidAcceptedValid) {
  console.log("   ✅ Correctly rejects 'accepted' without iso_time");
} else {
  console.log("   ❌ Should reject 'accepted' without iso_time");
  process.exit(1);
}

// Test: missing required fields
const invalidRequest = { iso_time: "2025-10-17T19:30:00-07:00" };
const invalidRequestValid = validateModificationRequest(invalidRequest);
if (!invalidRequestValid) {
  console.log("   ✅ Correctly rejects request missing 'message'");
} else {
  console.log("   ❌ Should reject request missing 'message'");
  process.exit(1);
}

// Test: valid declined without iso_time
const validDeclined = { status: "declined", message: "Doesn't work" };
const validDeclinedValid = validateModificationResponse(validDeclined);
if (validDeclinedValid) {
  console.log("   ✅ Correctly accepts 'declined' without iso_time");
} else {
  console.log("   ❌ Should accept 'declined' without iso_time");
  console.log("   ", validateModificationResponse.errors);
  process.exit(1);
}

console.log("\n✅ All schema validation tests passed!");

