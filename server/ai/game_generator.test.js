const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeGameLanguage,
  mainPathForLanguage,
  normalizeSourcePathForLanguage,
  validateMicroStudioJavaScriptCode,
  validateMicroStudioRuntimeApiUsage,
  buildMicroStudioJavaScriptTicTacToeFallbackGameCode
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

test("builds a valid tic-tac-toe microStudio JavaScript fallback", () => {
  const code = buildMicroStudioJavaScriptTicTacToeFallbackGameCode(
    {
      project: {
        title: "Simple Tic-Tac-Toe",
        description: "A basic 2D Tic-Tac-Toe game with no images."
      }
    },
    {
      idea: "create a simple 2d tic-tac-toe game with no picture",
      gameDesign: {
        genre: "Puzzle",
        coreLoop: "Player clicks on empty cells to place X or O."
      }
    }
  );

  const validation = validateMicroStudioJavaScriptCode(code);
  assert.equal(validation.ok, true, validation.errors.join("\n"));
  assert.ok(code.includes("screen.drawLine"));
  assert.ok(code.includes("mouse.pressed"));
  assert.ok(code.includes("function update()"));
});
