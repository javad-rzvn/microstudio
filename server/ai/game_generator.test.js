const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeGameLanguage,
  mainPathForLanguage,
  normalizeSourcePathForLanguage,
  validateMicroStudioJavaScriptCode,
  validateMicroStudioRuntimeApiUsage,
  validateMicroScriptCode,
  buildMicroStudioJavaScriptTicTacToeFallbackGameCode,
  buildMicroStudioJavaScriptPuzzleFallbackGameCode,
  buildMicroStudioJavaScriptPlatformerFallbackGameCode,
  buildMicroStudioJavaScriptShooterFallbackGameCode,
  buildMicroScriptPuzzleFallbackGameCode,
  buildMicroScriptPlatformerFallbackGameCode,
  buildMicroScriptShooterFallbackGameCode
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

test("builds a valid puzzle microStudio JavaScript fallback", () => {
  const code = buildMicroStudioJavaScriptPuzzleFallbackGameCode(
    {
      project: {
        title: "Tile Order",
        description: "A small sliding puzzle."
      }
    },
    {
      idea: "build a puzzle with sliding tiles"
    }
  );

  const validation = validateMicroStudioJavaScriptCode(code);
  assert.equal(validation.ok, true, validation.errors.join("\n"));
  assert.ok(code.includes("blankIndex"));
  assert.ok(code.includes("function update()"));
  assert.ok(code.includes("screen.drawLine"));
});

test("builds a valid platformer microStudio JavaScript fallback", () => {
  const code = buildMicroStudioJavaScriptPlatformerFallbackGameCode(
    {
      project: {
        title: "Sky Steps",
        description: "A small platformer."
      }
    },
    {
      idea: "build a platformer with jumping and coins"
    }
  );

  const validation = validateMicroStudioJavaScriptCode(code);
  assert.equal(validation.ok, true, validation.errors.join("\n"));
  assert.ok(code.includes("grounded"));
  assert.ok(code.includes("function update()"));
  assert.ok(code.includes("screen.fillRect"));
});

test("builds a valid shooter microStudio JavaScript fallback", () => {
  const code = buildMicroStudioJavaScriptShooterFallbackGameCode(
    {
      project: {
        title: "Star Blaster",
        description: "A small shooter."
      }
    },
    {
      idea: "build a shooter with movement and firing"
    }
  );

  const validation = validateMicroStudioJavaScriptCode(code);
  assert.equal(validation.ok, true, validation.errors.join("\n"));
  assert.ok(code.includes("spawnEnemy"));
  assert.ok(code.includes("fireBullet"));
  assert.ok(code.includes("screen.fillRound"));
});

test("builds valid microScript genre fallbacks", () => {
  const puzzleCode = buildMicroScriptPuzzleFallbackGameCode(
    {
      project: {
        title: "Tile Order",
        description: "A small sliding puzzle."
      }
    },
    {
      idea: "build a puzzle with sliding tiles"
    }
  );

  const platformerCode = buildMicroScriptPlatformerFallbackGameCode(
    {
      project: {
        title: "Sky Steps",
        description: "A small platformer."
      }
    },
    {
      idea: "build a platformer with jumping and coins"
    }
  );

  const shooterCode = buildMicroScriptShooterFallbackGameCode(
    {
      project: {
        title: "Star Blaster",
        description: "A small shooter."
      }
    },
    {
      idea: "build a shooter with movement and firing"
    }
  );

  const puzzleValidation = validateMicroScriptCode(puzzleCode);
  const platformerValidation = validateMicroScriptCode(platformerCode);
  const shooterValidation = validateMicroScriptCode(shooterCode);

  assert.equal(puzzleValidation.ok, true, puzzleValidation.errors.join("\n"));
  assert.equal(platformerValidation.ok, true, platformerValidation.errors.join("\n"));
  assert.equal(shooterValidation.ok, true, shooterValidation.errors.join("\n"));
  assert.ok(puzzleCode.includes("blankIndex"));
  assert.ok(puzzleCode.includes("screen.drawLine"));
  assert.ok(platformerCode.includes("Collect the coins"));
  assert.ok(platformerCode.includes("screen.fillRect"));
  assert.ok(shooterCode.includes("spawnEnemy"));
  assert.ok(shooterCode.includes("screen.fillRound"));
});
