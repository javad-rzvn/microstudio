const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeGameLanguage,
  mainPathForLanguage,
  normalizeSourcePathForLanguage,
  validateMicroStudioJavaScriptCode,
  validateMicroStudioRuntimeApiUsage
} = require("./game_generator.js");

test("normalizes language aliases to internal names", () => {
  assert.equal(normalizeGameLanguage("ms"), "microScript");
  assert.equal(normalizeGameLanguage("javascript"), "microStudioJavaScript");
  assert.equal(normalizeGameLanguage("microstudio-javascript"), "microStudioJavaScript");
});

test("selects the correct main source path for each language", () => {
  assert.equal(mainPathForLanguage("microScript"), "ms/main.ms");
  assert.equal(mainPathForLanguage("microStudioJavaScript"), "js/main.js");
  assert.equal(normalizeSourcePathForLanguage("source/main.js", "microStudioJavaScript"), "js/main.js");
  assert.equal(normalizeSourcePathForLanguage("source/main.js", "microScript"), "ms/main.ms");
});

test("rejects generic browser canvas APIs in microStudio JavaScript", () => {
  const badCode = [
    "function init() {}",
    "function update() {}",
    "function draw() {",
    "  line(0, 0, 10, 10);",
    "  fillText(\"hi\", 0, 0);",
    "  onMouseDown = function() {};",
    "}"
  ].join("\n");

  const validation = validateMicroStudioJavaScriptCode(badCode);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes("line")));
  assert.ok(validation.errors.some((error) => error.includes("fillText")));
  assert.ok(validation.errors.some((error) => error.includes("onMouseDown")));
});

test("accepts microStudio screen APIs", () => {
  const goodCode = [
    "function init() {}",
    "function update() {}",
    "function draw() {",
    "  screen.drawLine(0, 0, 10, 10, \"#fff\");",
    "  screen.drawText(\"hi\", 0, 0, 6, \"#fff\");",
    "}"
  ].join("\n");

  const validation = validateMicroStudioJavaScriptCode(goodCode);
  assert.equal(validation.ok, true);
  assert.deepEqual(validateMicroStudioRuntimeApiUsage(goodCode), {
    ok: true,
    errors: []
  });
});
