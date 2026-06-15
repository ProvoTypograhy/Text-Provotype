import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.FEATURE_AUDIT_URL ?? "http://localhost:3000";
const results = [];

function record(group, feature, status, detail = "") {
  results.push({ group, feature, status, detail });
}

async function runCheck(group, feature, check) {
  try {
    const detail = await check();
    record(group, feature, "pass", detail ?? "");
  } catch (error) {
    record(
      group,
      feature,
      "fail",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function installControlFinder(page) {
  await page.addScriptTag({
    content: `
      window.findLabeledControl = function findLabeledControl(labelText, selector) {
        const labels = Array.from(document.querySelectorAll("label"));
        const normalize = (value) => value.replace(/\\s+/g, " ").trim();
        const ownText = (label) => normalize(
          Array.from(label.childNodes)
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent || "")
            .join(" ")
        );
        const label = labels.find((entry) => {
          const text = ownText(entry) || normalize(entry.textContent || "");
          return text === labelText || text.startsWith(labelText);
        });
        if (label) {
          const control = label.querySelector(selector);
          if (!control) {
            throw new Error("Unable to find " + selector + " for label: " + labelText);
          }
          return control;
        }

        const controls = Array.from(document.querySelectorAll(selector));
        const nearbyControl = controls.find((control) => {
          let node = control.parentElement;
          for (let depth = 0; node && depth < 4; depth += 1) {
            const text = normalize(node.textContent || "");
            if (text === labelText || text.startsWith(labelText)) {
              return true;
            }
            node = node.parentElement;
          }
          return false;
        });
        if (nearbyControl) {
          return nearbyControl;
        }
        throw new Error("Unable to find label/control: " + labelText);
      };
    `,
  });
}

async function loadFresh(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await installControlFinder(page);
  await page.waitForSelector("textarea");
}

async function setRange(page, labelText, value) {
  await page.evaluate(
    ({ labelText: targetLabelText, value: nextValue }) => {
      const node = window.findLabeledControl(targetLabelText, "input");
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(node, String(nextValue));
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { labelText, value },
  );
}

async function setCheckbox(page, labelText, checked) {
  await page.evaluate(
    ({ labelText: targetLabelText, checked: nextChecked }) => {
      const node = window.findLabeledControl(targetLabelText, "input");
      if (node.checked !== nextChecked) {
        node.click();
      }
    },
    { labelText, checked },
  );
}

async function selectOption(page, labelText, value) {
  await page.evaluate(
    ({ labelText: targetLabelText, value: nextValue }) => {
      const node = window.findLabeledControl(targetLabelText, "select");
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        "value",
      ).set;
      setter.call(node, nextValue);
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { labelText, value },
  );
}

async function isControlDisabled(page, labelText, selector = "input") {
  return page.evaluate(
    ({ labelText: targetLabelText, selector: targetSelector }) =>
      window.findLabeledControl(targetLabelText, targetSelector).disabled,
    { labelText, selector },
  );
}

async function getControlAttribute(page, labelText, selector, attribute) {
  return page.evaluate(
    ({ labelText: targetLabelText, selector: targetSelector, attribute: targetAttribute }) =>
      window.findLabeledControl(targetLabelText, targetSelector).getAttribute(targetAttribute),
    { labelText, selector, attribute },
  );
}

async function getSettingsPayload(page) {
  await page.getByRole("button", { name: "View Settings Json" }).click();
  const raw = await page.locator("pre").textContent();
  await page.getByRole("button", { name: "Close" }).click();
  return JSON.parse(raw ?? "{}");
}

async function getShareLink(page) {
  await page.evaluate(() => {
    window.__copiedText = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.__copiedText = value;
        },
      },
    });
  });
  await page.getByRole("button", { name: "View Settings Json" }).click();
  await page.getByRole("button", { name: "Copy Share Link" }).click();
  await page.waitForTimeout(300);
  const link = await page.evaluate(() => window.__copiedText || "");
  await page.getByRole("button", { name: "Close" }).click();
  return link;
}

async function uploadSettings(page, payload) {
  const filePath = path.join(os.tmpdir(), `feature-audit-${Date.now()}-${Math.random()}.json`);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  await page.getByRole("button", { name: "View Settings Json" }).click();
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await page.waitForTimeout(300);
  const raw = await page.locator("pre").textContent();
  const errorText = await page.locator(".text-red-600").textContent().catch(() => "");
  await page.getByRole("button", { name: "Close" }).click();
  return { payload: JSON.parse(raw ?? "{}"), errorText: errorText ?? "" };
}

async function uploadRawSettings(page, raw) {
  const filePath = path.join(os.tmpdir(), `feature-audit-invalid-${Date.now()}.json`);
  await fs.writeFile(filePath, raw, "utf8");
  await page.getByRole("button", { name: "View Settings Json" }).click();
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await page.waitForTimeout(300);
  const errorText = await page.locator(".text-red-600").textContent().catch(() => "");
  await page.getByRole("button", { name: "Close" }).click();
  return errorText ?? "";
}

async function resetDefaults(page) {
  await page.getByRole("button", { name: "View Settings Json" }).click();
  await page.getByRole("button", { name: "Reset Defaults" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await page.waitForTimeout(150);
}

async function getCounter(page) {
  return page.locator("text=/\\d+\\/\\d+/").first().textContent();
}

async function getDisplayedSpeed(page) {
  const speedText = await page.getByText(/Speed \(chars\/sec\):/).first().textContent();
  return Number(speedText?.match(/: (\d+)/)?.[1] ?? "0");
}

async function viewportClick(page) {
  await page.locator(".border.border-zinc-300.select-none").first().click({
    position: { x: 220, y: 220 },
  });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await loadFresh(page);

  await runCheck("Core", "Initial load and default text", async () => {
    const initialText = await page.locator("textarea").inputValue();
    expect(initialText.trim().length > 0, "Textarea stayed empty.");
    return "Default text loaded.";
  });

  await runCheck("Core", "Text edits update JSON source text indirectly", async () => {
    await page.locator("textarea").fill("Audit text alpha beta.");
    const text = await page.locator("textarea").inputValue();
    expect(text === "Audit text alpha beta.", `Textarea value was ${text}.`);
    return "Textarea accepted edited text.";
  });

  await runCheck("Core", "Empty text state renders without crash", async () => {
    await page.locator("textarea").fill("");
    await page.waitForTimeout(100);
    const emptyState = await page.getByText("Enter text to begin").count();
    expect(emptyState > 0, "Empty-state text was not visible.");
    return "Empty-state text was visible.";
  });

  await runCheck("Core", "Settings panel hide/show", async () => {
    await page.getByRole("button", { name: "Hide Settings" }).click();
    await page.waitForTimeout(100);
    expect(await page.getByRole("button", { name: "Show Settings" }).isVisible(), "Show Settings button not visible.");
    expect(await page.locator("textarea").count() === 0, "Settings textarea still visible after hide.");
    await page.getByRole("button", { name: "Show Settings" }).click();
    await page.waitForTimeout(100);
    expect(await page.locator("textarea").isVisible(), "Textarea not visible after showing settings.");
    return "Settings panel toggled.";
  });

  await page.locator("textarea").fill("One. Two words. Three words here. Four more words.\n\nSecond paragraph here.");
  await selectOption(page, "Mode", "rsvp");

  await runCheck("RSVP", "Playback controls show in RSVP", async () => {
    expect(await page.getByRole("button", { name: /Pause|Play/ }).isVisible(), "Play/Pause button not visible.");
    expect(await page.getByRole("button", { name: "Reset" }).isVisible(), "Reset button not visible.");
    return "RSVP controls visible.";
  });

  await runCheck("RSVP", "Manual click advance", async () => {
    await setCheckbox(page, "Autoplay", false);
    const before = await getCounter(page);
    await viewportClick(page);
    await page.waitForTimeout(150);
    const after = await getCounter(page);
    expect(before !== after, `Counter did not change: before=${before}, after=${after}.`);
    return `Counter before=${before}, after=${after}.`;
  });

  await runCheck("RSVP", "Manual Space advance outside inputs", async () => {
    await setCheckbox(page, "Autoplay", false);
    await page.locator("main").click({ position: { x: 80, y: 80 } });
    const before = await getCounter(page);
    await page.keyboard.press("Space");
    await page.waitForTimeout(150);
    const after = await getCounter(page);
    expect(before !== after, `Counter did not change: before=${before}, after=${after}.`);
    return `Counter before=${before}, after=${after}.`;
  });

  await runCheck("RSVP", "Space in textarea does not advance", async () => {
    await setCheckbox(page, "Autoplay", false);
    const before = await getCounter(page);
    await page.locator("textarea").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Space");
    await page.waitForTimeout(150);
    const after = await getCounter(page);
    expect(before === after, `Counter changed while typing: before=${before}, after=${after}.`);
    return `Counter stayed at ${after}.`;
  });

  await runCheck("RSVP", "Autoplay advances", async () => {
    await setCheckbox(page, "Autoplay", true);
    await setRange(page, "Speed (chars/sec):", 80);
    const before = await getCounter(page);
    await page.waitForTimeout(600);
    const after = await getCounter(page);
    await setCheckbox(page, "Autoplay", false);
    expect(before !== after, `Counter did not advance on autoplay: before=${before}, after=${after}.`);
    return `Counter before=${before}, after=${after}.`;
  });

  await runCheck("RSVP", "Reset returns index to first token", async () => {
    await setCheckbox(page, "Autoplay", false);
    await viewportClick(page);
    await page.getByRole("button", { name: "Reset" }).click();
    await page.waitForTimeout(100);
    const counter = await getCounter(page);
    expect(counter?.startsWith("1/"), `Counter after reset was ${counter}.`);
    return `Counter after reset=${counter}.`;
  });

  await runCheck("Viewport", "Letter/word/sentence/paragraph steps update tokenization", async () => {
    const checks = [
      { slider: 0, unit: "char", chunkSize: 1 },
      { slider: 4, unit: "word", chunkSize: 2 },
      { slider: 7, unit: "sentence", chunkSize: 2 },
      { slider: 11, unit: "paragraph", chunkSize: 3 },
    ];
    for (const check of checks) {
      await setRange(page, "Viewport Step", check.slider);
      await page.waitForTimeout(100);
      const payload = await getSettingsPayload(page);
      expect(
        payload.tokenization.unit === check.unit && payload.tokenization.chunkSize === check.chunkSize,
        `Slider ${check.slider} expected ${check.unit}-${check.chunkSize}, got ${payload.tokenization.unit}-${payload.tokenization.chunkSize}.`,
      );
    }
    return "Representative viewport steps mapped to expected tokenization.";
  });

  await runCheck("Viewport", "Advance step caps to viewport size", async () => {
    await setRange(page, "Viewport Step", 2);
    await page.waitForTimeout(100);
    const advanceMax = await getControlAttribute(page, "Advance Step:", "input", "max");
    expect(advanceMax === "3", `Expected max 3 after 3-unit viewport; got ${advanceMax}.`);
    return `Advance max=${advanceMax}.`;
  });

  await runCheck("Viewport", "Viewport width/height sliders export UI values", async () => {
    await setRange(page, "Viewport Width:", 45);
    await setRange(page, "Viewport Height:", 55);
    await page.waitForTimeout(100);
    const payload = await getSettingsPayload(page);
    expect(payload.ui.viewportWidthPercent === 45, `Width percent was ${payload.ui.viewportWidthPercent}.`);
    expect(payload.ui.viewportHeightPercent === 55, `Height percent was ${payload.ui.viewportHeightPercent}.`);
    return "Viewport UI percentages exported.";
  });

  await runCheck("Typography", "Font size, line height, padding export", async () => {
    await setRange(page, "Font Size:", 36);
    await setRange(page, "Line Height:", 1.8);
    await setRange(page, "Viewport Padding:", 24);
    const payload = await getSettingsPayload(page);
    expect(payload.typography.fontSizePx === 36, `Font size was ${payload.typography.fontSizePx}.`);
    expect(payload.typography.lineHeight === 1.8, `Line height was ${payload.typography.lineHeight}.`);
    expect(payload.typography.viewportPaddingPx === 24, `Padding was ${payload.typography.viewportPaddingPx}.`);
    return "Typography numeric controls exported.";
  });

  await runCheck("Typography", "Line width disabled/enabled by full-width toggle", async () => {
    await setCheckbox(page, "Use full viewport width", true);
    expect(await isControlDisabled(page, "Line Width:", "input"), "Line Width was enabled while full-width was on.");
    await setCheckbox(page, "Use full viewport width", false);
    expect(!(await isControlDisabled(page, "Line Width:", "input")), "Line Width stayed disabled after full-width off.");
    await setRange(page, "Line Width:", 640);
    const payload = await getSettingsPayload(page);
    expect(payload.typography.lineWidthPx === 640, `Line width was ${payload.typography.lineWidthPx}.`);
    return "Line Width enablement and export worked.";
  });

  await runCheck("Continuous", "Continuous controls show and RSVP controls hide", async () => {
    await selectOption(page, "Mode", "continuous");
    await page.waitForTimeout(150);
    expect(await page.getByRole("heading", { name: "Continuous" }).isVisible(), "Continuous section not visible.");
    expect(await page.getByText("Pause at punctuation").count() === 0, "RSVP punctuation controls still visible.");
    return "Continuous mode control surface switched.";
  });

  await runCheck("Continuous", "Horizontal locks viewport step", async () => {
    await selectOption(page, "Direction", "horizontal");
    await page.waitForTimeout(250);
    const viewportDisabled = await isControlDisabled(page, "Viewport Step", "input");
    const horizontalLockText = await page.getByText("Horizontal continuous is locked to `3 P`.").count();
    const payload = await getSettingsPayload(page);
    expect(viewportDisabled, "Viewport Step slider was not disabled.");
    expect(horizontalLockText > 0, "Horizontal lock message missing.");
    expect(payload.ui.viewportStep === "paragraph-3", `Viewport step was ${payload.ui.viewportStep}.`);
    return "Horizontal lock was enforced.";
  });

  await runCheck("Continuous", "Vertical enables wrap and unlocks viewport step", async () => {
    await selectOption(page, "Direction", "vertical");
    await page.waitForTimeout(150);
    expect(!(await isControlDisabled(page, "Wrap vertical text", "input")), "Wrap checkbox disabled in vertical mode.");
    expect(!(await isControlDisabled(page, "Viewport Step", "input")), "Viewport Step stayed disabled in vertical mode.");
    return "Vertical controls enabled.";
  });

  await runCheck("Continuous", "Autoplay off freezes transform", async () => {
    await setCheckbox(page, "Autoplay", true);
    await page.waitForTimeout(200);
    await setCheckbox(page, "Autoplay", false);
    const first = await page.locator('[style*="translate"]').first().getAttribute("style");
    await page.waitForTimeout(250);
    const second = await page.locator('[style*="translate"]').first().getAttribute("style");
    expect(first === second, `Transform changed while paused: before=${first}, after=${second}.`);
    return "Track transform stayed stable while paused.";
  });

  await runCheck("Highlight", "Highlight style and size export", async () => {
    await selectOption(page, "Mode", "rsvp");
    await setRange(page, "Viewport Step", 5);
    await setCheckbox(page, "Enable Highlight", true);
    await selectOption(page, "Highlight Style", "outline");
    await setRange(page, "Highlight Size:", 2);
    const payload = await getSettingsPayload(page);
    expect(payload.typography.rsvpHighlight.enabled === true, "Highlight not enabled in JSON.");
    expect(payload.typography.rsvpHighlight.style === "outline", `Style was ${payload.typography.rsvpHighlight.style}.`);
    expect(payload.typography.rsvpHighlight.size >= 1, `Size was ${payload.typography.rsvpHighlight.size}.`);
    return `Highlight exported as ${payload.typography.rsvpHighlight.unit}-${payload.typography.rsvpHighlight.size}, outline.`;
  });

  await runCheck("Highlight", "RSVP highlight combined with markers/staircase", async () => {
    await setCheckbox(page, "Enable Highlight", false);
    await setRange(page, "Viewport Step", 8);
    await setCheckbox(page, "Enable staircase", true);
    await setCheckbox(page, "Enable guide markers", true);
    await page.waitForTimeout(350);
    const markersBeforeHighlight = await page.locator('span[aria-hidden="true"]').count();
    await setCheckbox(page, "Enable Highlight", true);
    await page.waitForTimeout(350);
    const markersAfterHighlight = await page.locator('span[aria-hidden="true"]').count();
    expect(
      !(markersBeforeHighlight > 0 && markersAfterHighlight === 0),
      `Markers before highlight=${markersBeforeHighlight}, after highlight=${markersAfterHighlight}.`,
    );
    return `Markers before highlight=${markersBeforeHighlight}, after highlight=${markersAfterHighlight}.`;
  });

  await runCheck("Highlight", "Continuous highlight controls", async () => {
    await selectOption(page, "Mode", "continuous");
    await selectOption(page, "Direction", "vertical");
    await setCheckbox(page, "Enable Highlight", true);
    expect(await page.getByText("Lock Highlight To Flow").isVisible(), "Lock Highlight To Flow missing.");
    expect(await page.getByRole("button", { name: "Reset Highlight Position" }).isEnabled(), "Reset Highlight button disabled.");
    await setCheckbox(page, "Lock Highlight To Flow", false);
    expect(await page.getByText(/Highlight Jump Rate:/).isVisible(), "Jump rate control hidden when flow lock off.");
    return "Continuous highlight controls appeared.";
  });

  await runCheck("Highlight", "Continuous vertical highlight combined with markers/staircase", async () => {
    await selectOption(page, "Mode", "continuous");
    await selectOption(page, "Direction", "vertical");
    await setRange(page, "Viewport Step", 8);
    await setCheckbox(page, "Enable Highlight", false);
    await setCheckbox(page, "Enable staircase", true);
    await setCheckbox(page, "Enable guide markers", true);
    await page.waitForTimeout(350);
    const markersBeforeHighlight = await page.locator('span[aria-hidden="true"]').count();
    await setCheckbox(page, "Enable Highlight", true);
    await page.waitForTimeout(350);
    const markersAfterHighlight = await page.locator('span[aria-hidden="true"]').count();
    expect(
      !(markersBeforeHighlight > 0 && markersAfterHighlight === 0),
      `Markers before highlight=${markersBeforeHighlight}, after highlight=${markersAfterHighlight}.`,
    );
    return `Markers before highlight=${markersBeforeHighlight}, after highlight=${markersAfterHighlight}.`;
  });

  await runCheck("Structured Layout", "Markers render without highlight", async () => {
    await selectOption(page, "Mode", "rsvp");
    await setCheckbox(page, "Enable Highlight", false);
    await setRange(page, "Viewport Step", 8);
    await setCheckbox(page, "Enable guide markers", true);
    await page.waitForTimeout(350);
    const markerCount = await page.locator('span[aria-hidden="true"]').count();
    expect(markerCount > 0, `Marker count was ${markerCount}.`);
    return `Marker count=${markerCount}.`;
  });

  await runCheck("Structured Layout", "Staircase settings export", async () => {
    await setCheckbox(page, "Enable staircase", true);
    await setRange(page, "Stair Indent:", 4);
    await selectOption(page, "Staircase Mode", "line");
    await setRange(page, "Max Line Width:", 42);
    const payload = await getSettingsPayload(page);
    expect(payload.typography.paragraphStaircase.enabled === true, "Staircase not enabled.");
    expect(payload.typography.paragraphStaircase.indentStepCh === 4, `Indent was ${payload.typography.paragraphStaircase.indentStepCh}.`);
    expect(payload.typography.paragraphStaircase.indentMode === "line", `Mode was ${payload.typography.paragraphStaircase.indentMode}.`);
    expect(payload.typography.paragraphStaircase.maxWidthCh === 42, `Max width was ${payload.typography.paragraphStaircase.maxWidthCh}.`);
    return "Staircase settings exported.";
  });

  await runCheck("Structured Layout", "Marker settings export", async () => {
    await setCheckbox(page, "Enable guide markers", true);
    await selectOption(page, "Marker Position", "start");
    await selectOption(page, "Marker Variation", "color");
    await selectOption(page, "Guide Mode", "line");
    await setRange(page, "Marker Size:", 1.4);
    await setRange(page, "Marker Gap:", 1.2);
    const payload = await getSettingsPayload(page);
    expect(payload.typography.sentenceMarkers.position === "start", `Position was ${payload.typography.sentenceMarkers.position}.`);
    expect(payload.typography.sentenceMarkers.variationMode === "color", `Variation was ${payload.typography.sentenceMarkers.variationMode}.`);
    expect(payload.typography.sentenceMarkers.mode === "line", `Guide mode was ${payload.typography.sentenceMarkers.mode}.`);
    expect(payload.typography.sentenceMarkers.sizeEm === 1.4, `Size was ${payload.typography.sentenceMarkers.sizeEm}.`);
    expect(payload.typography.sentenceMarkers.gapCh === 1.2, `Gap was ${payload.typography.sentenceMarkers.gapCh}.`);
    return "Marker settings exported.";
  });

  await runCheck("JSON", "Settings modal open/close", async () => {
    await page.getByRole("button", { name: "View Settings Json" }).click();
    expect(await page.getByText("ConditionSpec").isVisible(), "Modal title missing.");
    expect(await page.locator("pre").isVisible(), "JSON pre not visible.");
    await page.getByRole("button", { name: "Close" }).click();
    await page.waitForTimeout(100);
    expect(await page.getByText("ConditionSpec").count() === 0, "Modal did not close.");
    return "Modal opened and closed.";
  });

  await runCheck("JSON", "Valid JSON upload restores values", async () => {
    const payload = await getSettingsPayload(page);
    payload.mode = "continuous";
    payload.motion.direction = "vertical";
    payload.ui.viewportWidthPercent = 66;
    payload.ui.viewportHeightPercent = 77;
    const uploaded = await uploadSettings(page, payload);
    expect(uploaded.payload.mode === "continuous", `Mode was ${uploaded.payload.mode}.`);
    expect(uploaded.payload.motion.direction === "vertical", `Direction was ${uploaded.payload.motion.direction}.`);
    expect(uploaded.payload.ui.viewportWidthPercent === 66, `Width was ${uploaded.payload.ui.viewportWidthPercent}.`);
    expect(uploaded.payload.ui.viewportHeightPercent === 77, `Height was ${uploaded.payload.ui.viewportHeightPercent}.`);
    return "Valid uploaded JSON restored selected values.";
  });

  await runCheck("Share", "Share link restores settings and short text", async () => {
    await resetDefaults(page);
    await page.locator("textarea").fill("Share text alpha beta.");
    await selectOption(page, "Mode", "continuous");
    await selectOption(page, "Direction", "vertical");
    await setRange(page, "Viewport Width:", 64);
    const link = await getShareLink(page);
    expect(link.includes("#share="), `Share hash missing from link: ${link.slice(0, 120)}.`);

    const sharedPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await sharedPage.goto(link, { waitUntil: "networkidle" });
      await installControlFinder(sharedPage);
      await sharedPage.waitForSelector("textarea");
      await sharedPage.waitForTimeout(500);
      const sharedText = await sharedPage.locator("textarea").inputValue();
      const payload = await getSettingsPayload(sharedPage);
      expect(sharedText === "Share text alpha beta.", `Shared text was ${sharedText}.`);
      expect(payload.mode === "continuous", `Shared mode was ${payload.mode}.`);
      expect(payload.motion.direction === "vertical", `Shared direction was ${payload.motion.direction}.`);
      expect(payload.ui.viewportWidthPercent === 64, `Shared viewport width was ${payload.ui.viewportWidthPercent}.`);
    } finally {
      await sharedPage.close();
    }
    return "Share link restored short text and settings.";
  });

  await runCheck("Share", "Share link omits long text but restores settings", async () => {
    await resetDefaults(page);
    const longText = Array.from(
      { length: 5000 },
      (_, index) =>
        `token-${index.toString(36)}-${((index * 2654435761) >>> 0).toString(36)}`,
    ).join(" ");
    await page.locator("textarea").fill(longText);
    await selectOption(page, "Mode", "continuous");
    await selectOption(page, "Direction", "vertical");
    await setRange(page, "Viewport Height:", 58);
    const link = await getShareLink(page);
    expect(link.includes("#share="), "Share hash missing.");
    expect(link.length <= 7000, `Share link length was ${link.length}.`);

    const sharedPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await sharedPage.goto(link, { waitUntil: "networkidle" });
      await installControlFinder(sharedPage);
      await sharedPage.waitForSelector("textarea");
      await sharedPage.waitForTimeout(500);
      const sharedText = await sharedPage.locator("textarea").inputValue();
      const payload = await getSettingsPayload(sharedPage);
      expect(sharedText !== longText, "Long text should have been omitted from the share link.");
      expect(payload.mode === "continuous", `Shared mode was ${payload.mode}.`);
      expect(payload.motion.direction === "vertical", `Shared direction was ${payload.motion.direction}.`);
      expect(payload.ui.viewportHeightPercent === 58, `Shared viewport height was ${payload.ui.viewportHeightPercent}.`);
    } finally {
      await sharedPage.close();
    }
    return `Long text omitted; link length=${link.length}.`;
  });

  await runCheck("Share", "Invalid share hash does not crash", async () => {
    const sharedPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await sharedPage.goto(`${baseUrl}#share=v1.bad.not-real`, { waitUntil: "networkidle" });
      await installControlFinder(sharedPage);
      await sharedPage.waitForSelector("textarea");
      const textareaCount = await sharedPage.locator("textarea").count();
      expect(textareaCount === 1, `Textarea count was ${textareaCount}.`);
    } finally {
      await sharedPage.close();
    }
    return "Invalid share hash kept the app usable.";
  });

  await runCheck("JSON", "Invalid JSON upload shows error", async () => {
    const errorText = await uploadRawSettings(page, "{ definitely invalid json");
    expect(errorText.length > 0, "No error text appeared for invalid JSON.");
    return `Error shown: ${errorText}`;
  });

  await runCheck("JSON", "Import preserves zero values", async () => {
    const payload = await getSettingsPayload(page);
    payload.typography.paragraphStaircase.indentStepCh = 0;
    payload.typography.sentenceMarkers.gapCh = 0;
    const uploaded = await uploadSettings(page, payload);
    const imported = uploaded.payload;
    expect(imported.typography?.paragraphStaircase?.indentStepCh === 0, `indentStepCh=${imported.typography?.paragraphStaircase?.indentStepCh}.`);
    expect(imported.typography?.sentenceMarkers?.gapCh === 0, `gapCh=${imported.typography?.sentenceMarkers?.gapCh}.`);
    return "Zero values preserved.";
  });

  await runCheck("JSON", "Reset defaults restores default mode and viewport", async () => {
    await resetDefaults(page);
    const payload = await getSettingsPayload(page);
    expect(payload.mode === "rsvp", `Mode was ${payload.mode}.`);
    expect(payload.ui.viewportStep === "word-1", `Viewport step was ${payload.ui.viewportStep}.`);
    expect(payload.ui.viewportWidthPercent === 100, `Viewport width was ${payload.ui.viewportWidthPercent}.`);
    expect(payload.ui.viewportHeightPercent === 100, `Viewport height was ${payload.ui.viewportHeightPercent}.`);
    return "Defaults restored.";
  });

  await runCheck("Mouse Y", "Live pointer changes displayed speed", async () => {
    await setCheckbox(page, "Enable Mouse Y", true);
    await setCheckbox(page, "Reset on mouse leave", false);
    await setRange(page, "Speed (chars/sec):", 10);
    await page.mouse.move(300, 180);
    await page.waitForTimeout(150);
    const speed = await getDisplayedSpeed(page);
    expect(speed !== 10, `Speed did not change from base 10; observed ${speed}.`);
    return `Observed speed=${speed}.`;
  });

  await runCheck("Mouse Y", "Imported rate bounds are respected", async () => {
    const mousePayload = await getSettingsPayload(page);
    mousePayload.motion.rateControl.enabled = true;
    mousePayload.motion.rateControl.resetOnLeave = false;
    mousePayload.motion.rateControl.minCps = 20;
    mousePayload.motion.rateControl.maxCps = 30;
    mousePayload.motion.rateControl.invert = false;
    mousePayload.motion.speed.value = 10;
    await uploadSettings(page, mousePayload);
    await page.mouse.move(300, 180);
    await page.waitForTimeout(150);
    const speed = await getDisplayedSpeed(page);
    expect(speed >= 20 && speed <= 30, `Imported bounds 20-30, observed displayed speed=${speed}.`);
    return `Observed speed=${speed}.`;
  });
} catch (error) {
  record("Runner", "Audit runner exception", "fail", error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  await browser.close();
}

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  totals: {
    pass: results.filter((result) => result.status === "pass").length,
    fail: results.filter((result) => result.status === "fail").length,
    total: results.length,
  },
  results,
};

const outputPath = path.join(process.cwd(), "feature-audit-results.json");
await fs.writeFile(outputPath, JSON.stringify(summary, null, 2), "utf8");

console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.totals.fail > 0 ? 1 : 0;
