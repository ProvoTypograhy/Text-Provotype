# Provotypographer

Provotypographer is a research-oriented text reading interface for experimenting with rapid serial visual presentation (RSVP) and continuously moving text. It is built as a single-page Next.js application that lets a researcher manipulate segmentation, pacing, spatial layout, highlighting, and structural guides, then export the exact condition as JSON for later reuse or reporting.

The current implementation is intentionally prototype-like: most reader logic, experimental controls, rendering behavior, and condition import/export all live in one client component, which makes the system easy to inspect and modify during interface research.

## What The Tool Does

At a high level, the application presents:

- A reading viewport where text is shown either as discrete RSVP units or as continuously moving text.
- A settings panel where nearly every display, pacing, and layout variable can be changed live.
- A condition-spec modal that exposes the full experimental state as JSON and supports download, copy, upload, and reset workflows.

This makes the tool useful for:

- Studying how segmentation affects readability or attention.
- Comparing RSVP against continuous reading flows.
- Testing typography and layout manipulations without rebuilding the interface.
- Preserving reproducible experimental conditions as structured data.

## Research Framing

The interface is designed around the idea of a reading condition as a serialized object. Instead of treating the UI as an informal control surface, the app treats the UI as a front end over a typed configuration schema. That matters for research because:

- A reading condition can be reconstructed exactly from exported JSON.
- UI-only state that affects presentation is included in exports.
- Older or partial imports are normalized against the current schema.
- The same text can be replayed under multiple controlled conditions.

In practice, the tool supports experiments involving:

- Temporal manipulation: autoplay, speed, inter-segment blank/overlap timing, punctuation delay, mouse-driven rate control.
- Segmentation manipulation: characters, words, sentences, paragraphs, grouped display windows.
- Spatial manipulation: viewport width/height cropping, alignment, line width, staircase indentation.
- Attentional cueing: highlight windows, sentence/line markers, central fixation in RSVP.

## Core Interaction Model

The app has two primary modes.

### RSVP Mode

In RSVP mode, text is tokenized and displayed inside a fixed viewport one unit at a time. The current display window is centered in the viewport, and progression happens either automatically or manually.

Behavioral details:

- Base tokenization is kept ungrouped for RSVP playback; grouping is applied at display time through the viewport step.
- The viewport can show 1-3 letters, 1-3 words, 1-3 sentences, or 1-3 paragraphs at once.
- The advance step is independent from the viewport size, but it is capped so it cannot exceed the number of units currently visible.
- Autoplay timing is derived from the number of characters traversed by the current advance step, not just the visible window size.
- If punctuation pause is enabled, tokens ending with punctuation receive extra delay.
- When autoplay is disabled, the user can advance by clicking the viewport or pressing `Space`, unless focus is inside an input control.
- For short RSVP units, rendering uses a center-character alignment layout similar to a fixation anchor.
- For sentence- and paragraph-scale units, rendering switches to multiline structured text layouts.

### Continuous Mode

In continuous mode, the text becomes a looped stream that moves horizontally or vertically through the viewport. The implementation uses a measurement pass plus a duplicated render pass to create marquee-like repetition.

Behavioral details:

- Motion is driven with `requestAnimationFrame`.
- Speed is specified in characters per second and converted internally into approximate pixels per second using font metrics.
- Horizontal continuous mode normalizes all whitespace into a single line.
- Vertical continuous mode preserves line breaks more faithfully and optionally wraps text.
- Sentence and paragraph tokenizations in vertical mode can use the same structured layouts as RSVP when staircase or marker systems are active.
- Continuous highlighting can either follow the moving text window or run as an independent jumping overlay.
- Horizontal continuous mode is forced to `paragraph-3` and the viewport step control is locked.

## Feature Reference

### Text Input

- The main source text is editable directly in a textarea.
- On first load, the app fetches [public/default-text.txt](/Users/dylanb/Documents/Github/text-interface/public/default-text.txt).
- The bundled sample is an excerpt from Upton Sinclair's 1928 novel [*Boston: A Novel*](https://openlibrary.org/works/OL115059W). The excerpt follows Cornelia Thornwell and her family around Governor Josiah Thornwell's death and funeral.
- If the default file cannot be loaded, the app silently keeps the current text state.

### Viewport Step System

The viewport step is the main segmentation control exposed to users. It maps directly to tokenization unit and chunk size.

Available steps:

- `letter-1`, `letter-2`, `letter-3`
- `word-1`, `word-2`, `word-3`
- `sentence-1`, `sentence-2`, `sentence-3`
- `paragraph-1`, `paragraph-2`, `paragraph-3`

Operational meaning:

- The prefix determines the tokenization unit.
- The numeric suffix determines how many units are shown at once.
- Changing viewport step updates the underlying tokenization in the condition spec.
- In RSVP, this determines the visible display window.
- In continuous mode, the effect is mainly relevant for structured sentence/paragraph rendering and highlighting logic.

### Advance Step

Advance step exists only for RSVP playback semantics.

- Range is `1` to the current viewport token count.
- Changing the viewport step resets the advance step to that maximum.
- A viewport showing `3 words` can still advance `1 word`, `2 words`, or `3 words` per tick.
- CPS playback uses the character count spanned by the advance step; lexical playback sums the timings of words spanned by the advance step.

### Playback Controls

RSVP:

- Autoplay toggle
- Play/pause button
- Reset button
- Character-per-second speed slider
- Optional lexical timing with an adjustable baseline fixation duration
- Optional fixed 30 ms saccade contribution per advanced word
- Optional punctuation pause
- Punctuation delay slider
- Inter-segment timing from -1000 to 1000 ms; positive values show a blank interval and negative values overlap consecutive segments
- Manual stepping through click or `Space`

Continuous:

- Autoplay toggle
- Character-per-second speed slider
- Direction control: `horizontal` or `vertical`
- Vertical wrapping toggle

### Mouse Y Rate Control

The viewport can act as a speed-sensitive area.

- When enabled, the current mouse Y position inside the viewport remaps speed dynamically.
- The current implementation maps the pointer vertically to a fixed `1-80 cps` range.
- The stored `minCps` and `maxCps` values exist in the condition schema and import normalization, but the live mapping currently uses the hard-coded UI range rather than those stored bounds.
- When `resetOnLeave` is enabled, the interface restores the previous speed once the pointer leaves the viewport.

This is important to note in any academic description: the schema exposes more rate-control structure than the present UI behavior actually uses.

### Viewport Geometry

The reading surface is adjustable in two different ways.

Inner viewport cropping:

- Width and height sliders control the inner viewport as a percentage of the available area.
- Four drag handles on the viewport corners provide direct manipulation resizing.
- Resizing crops what is visible without restructuring the outer layout.

Split-view layout:

- The settings panel can be shown or hidden.
- When visible, the sidebar width can be resized with a vertical drag separator.
- The app enforces minimum viewport and settings widths in the split layout.

### Typography Controls

Available typography controls include:

- Font size
- Line height
- Alignment: `left`, `center`, `right`, `justify`
- Use full viewport width or a capped line width
- Explicit line width in pixels
- Viewport padding in pixels
- Letter spacing
- Word spacing

The condition schema also includes `variableAxes`, which are applied through CSS `font-variation-settings` when present.

Default typography uses the `Geist` family in the condition spec, while the global app theme falls back to an Avenir/Segoe/Helvetica-style sans stack at the CSS level. In practice, visible text uses the condition spec’s `fontFamily` field.

### RSVP Highlight System

The app includes a highlight overlay system named `rsvpHighlight`, but it is used in both RSVP and continuous modes.

Capabilities:

- Can be enabled or disabled independently of mode.
- Can target `char`, `word`, `sentence`, or `paragraph` units.
- Can span sizes `1-3`.
- Can render as `bold`, `background`, or `outline`.
- Can move at a configurable jump rate.
- In continuous mode, can either follow the moving text (`tieToFlow: true`) or advance on its own timer (`tieToFlow: false`).
- Includes a reset mechanism for continuous highlight position.

RSVP-specific behavior:

- If highlight is enabled, the normal center-character RSVP rendering is replaced by highlighted token rendering.
- For autoplay RSVP, highlight movement can be tied to the computed duration of the current token so the jump spans the visible interval.

Continuous-specific behavior:

- The app computes measurable highlight ranges across the rendered stream.
- For horizontal movement, ranges are tied to measured span positions.
- For vertical movement, positions are estimated proportionally from text offsets.
- When tied to flow, the highlight window tracks the viewport focus point.
- When untied, the highlight jumps independently at the configured rate.

### Structured Sentence And Paragraph Layouts

For sentence- and paragraph-scale reading, the tool supports more than plain wrapped text.

#### Paragraph Staircase

This feature indents successive content to create stepped reading structures.

Controls:

- Enable/disable staircase
- Indent step in `ch`
- Indent mode: `sentence` or `line`
- Max line width in `ch`

Behavior:

- `sentence` mode increases indent at each new sentence.
- `line` mode increases indent at each wrapped line.
- If max width is set, each line can become progressively narrower, creating a stepped right edge as well as a stepped left edge.
- In line mode, long sentences are split into staircase lines using an internal width approximation based on font size and line width.

#### Sentence Markers

Guide markers can be drawn near boundaries to make structure more visible.

Controls:

- Enable/disable markers
- Position: `start`, `end`, `both`
- Variation mode: `shape`, `color`, `both`
- Guide mode: `sentence` or `line`
- Marker size in `em`
- Marker gap in `ch`

Marker semantics:

- Shapes cycle through circle, square, diamond, and triangle variants.
- Colors are mapped to those shape variants.
- In sentence mode, markers are attached to sentence boundaries.
- In line mode, markers pair wrapped lines in the staircase line renderer when possible; otherwise the implementation falls back to sentence-based behavior.

### Condition JSON Workflow

The modal opened by `View Settings Json` exposes the active condition in full.

Supported operations:

- View the current JSON payload
- Download JSON to a sanitized filename
- Copy JSON to the clipboard
- Upload JSON from disk
- Reset the condition to defaults

Export behavior:

- The payload includes the full `ConditionSpec`.
- It also includes a `ui` block with `viewportStep`, `advanceStep`, `viewportWidthPercent`, and `viewportHeightPercent`.

Import behavior:

- Partial and older JSON are normalized against the current default schema.
- Unsupported or malformed values fall back to defaults.
- Legacy `wpm` speed values are converted to cps with a fixed divisor.
- Legacy `pairingMode` marker data is mapped into the current sentence-marker mode field.
- Imported UI values are clamped to the valid viewport and advance ranges.

## Condition Schema

The condition schema is defined in [lib/condition-spec.ts](/Users/dylanb/Documents/Github/text-interface/lib/condition-spec.ts).

```ts
type ConditionSpec = {
  version: "0.1";
  mode: "rsvp" | "continuous";
  window: { width: number; height: number };
  tokenization: {
    unit: "char" | "word" | "chunk" | "sentence" | "paragraph";
    chunkSize: number;
  };
  typography: {
    fontFamily: string;
    fontSizePx: number;
    lineHeight: number;
    useViewportWidth: boolean;
    lineWidthPx: number;
    viewportPaddingPx: number;
    alignment: "left" | "center" | "right" | "justify";
    letterSpacingPx: number;
    wordSpacingPx: number;
    paragraphStaircase: {
      enabled: boolean;
      indentStepCh: number;
      indentMode: "sentence" | "line";
      maxWidthCh: number;
    };
    sentenceMarkers: {
      enabled: boolean;
      position: "both" | "start" | "end";
      variationMode: "shape" | "color" | "both";
      mode: "sentence" | "line";
      sizeEm: number;
      gapCh: number;
    };
    rsvpHighlight: {
      enabled: boolean;
      unit: "char" | "word" | "sentence" | "paragraph";
      size: number;
      style: "bold" | "background" | "outline";
      mode: "jump";
      jumpRateHz: number;
      tieToFlow: boolean;
    };
    variableAxes?: Record<string, number>;
  };
  motion: {
    autoplay: boolean;
    speed: { unit: "cps" | "pxps"; value: number };
    rsvpLexicalTiming: {
      enabled: boolean;
      baselineFixationMs: number;
      includeSaccade: boolean;
      saccadeMs: number;
    };
    rateControl: {
      enabled: boolean;
      source: "mouseY";
      minCps: number;
      maxCps: number;
      invert: boolean;
      resetOnLeave: boolean;
    };
    direction: "vertical" | "horizontal";
    wrapVerticalText: boolean;
    progression: "continuous" | "step";
    rsvpBlankIntervalMs: number;
    pauseAtPunctuation: { enabled: boolean; delayMs: number };
  };
};
```

### Notes On The Schema

- `tokenization.unit` includes `"chunk"`, but the current UI does not expose chunk mode directly.
- `motion.speed.unit` supports `"pxps"` in the schema, but the visible controls operate in cps and force that unit during most interactions.
- `motion.progression` exists in the schema but is not currently exposed as a live UI control.
- `window.width` and `window.height` are part of the schema but do not drive the responsive layout directly in the current implementation.

These fields should be described as part of the interface model, but not overstated as active user-facing controls if writing about the current release.

## Rendering And Tokenization Details

### Tokenization

Tokenization is implemented in [app/page.tsx](/Users/dylanb/Documents/Github/text-interface/app/page.tsx) and uses simple rule-based segmentation:

- Characters: `Array.from(text)`
- Words: whitespace splitting
- Sentences: a regex based on terminal punctuation
- Paragraphs: blank-line splitting

Research implication:

- Sentence segmentation is heuristic and punctuation-driven.
- It is not a linguistic parser and may behave imperfectly on abbreviations, quotations, or non-standard punctuation.
- Paragraph boundaries depend on blank-line patterns rather than semantic markup.

### RSVP Timing

RSVP has two timing paths:

- CPS timing uses `advancedCharCount / cps`, with a minimum duration floor.
- Lexical timing looks up the ELP word prediction, scales it by the selected baseline fixation time, and falls back to the supplied length/frequency model with `Log_Freq_HAL = 0` for unknown words.

Lexical timing is off by default. When enabled, predictions are clamped to 80–900 ms per word and may include 30 ms of saccade time per word. Word timings are summed over the units advanced, including words inside sentence and paragraph steps. Letter steps retain CPS timing. The optional punctuation delay is added once after the base duration.

The inter-segment timing is applied after the base duration. Positive values leave the viewport blank before the next segment appears. Negative values start the next segment early and keep the preceding segment visible for the overlap. The next onset retains a 20 ms safety floor.

The model data is loaded from `public/data/fixation_formula_params.csv` and `public/data/predicted_gaze_durations_default.csv`. Known-word lookup is case-insensitive and ignores surrounding punctuation. Hyphenated compounds are split at hyphens and each component is looked up and timed separately. If the prediction table cannot be loaded, the formula handles every word; if the parameters are unavailable, playback falls back to CPS timing.

### Continuous Motion

Continuous motion uses:

- `requestAnimationFrame` for animation
- DOM measurement for content size and highlight-position mapping
- duplicated content blocks to create looping behavior

Horizontal continuous mode compresses whitespace because the stream is intended to behave like a one-line marquee. Vertical mode preserves more structure and can wrap if enabled.

## Architecture

The current codebase is intentionally small.

### Main Files

- [app/page.tsx](/Users/dylanb/Documents/Github/text-interface/app/page.tsx): the full client-side reader, controls, animation logic, tokenization, structured layout code, import/export flow, and modal UI
- [lib/condition-spec.ts](/Users/dylanb/Documents/Github/text-interface/lib/condition-spec.ts): the typed condition schema and default condition object
- [app/layout.tsx](/Users/dylanb/Documents/Github/text-interface/app/layout.tsx): root metadata and layout shell
- [app/globals.css](/Users/dylanb/Documents/Github/text-interface/app/globals.css): Tailwind import plus global theme variables and font stacks
- [public/default-text.txt](/Users/dylanb/Documents/Github/text-interface/public/default-text.txt): startup text source

### Architectural Characteristics

- Single-route application using the Next.js App Router
- Almost all experimental logic lives in one client component
- React hooks manage animation timing, DOM measurement, resizing, and modal state
- No server-side data model, persistence layer, API routes, or database
- No external state management library
- No component library dependency; controls are handwritten with native form elements and Tailwind utility classes

This is useful to emphasize in a paper because the system is best described as a client-side research prototype, not a distributed platform.

## Tech Stack

Runtime and framework:

- Next.js `16.1.6`
- React `19.2.3`
- React DOM `19.2.3`
- TypeScript `5`

Styling and tooling:

- Tailwind CSS `4`
- `@tailwindcss/postcss`
- ESLint `9`
- `eslint-config-next`

Project characteristics:

- App Router project structure
- Strict TypeScript configuration
- Client-rendered primary interface
- No backend service dependency for core operation

## Development

### Requirements

- Node.js 20+ is the safest target for the current dependency set
- npm

### Install And Run

```bash
npm install
npm run dev
```

Then open the local URL printed by Next.js.

### Production

```bash
npm install
npm run build
npm run start
```

### Scripts

- `npm run dev`: start the local development server
- `npm run build`: produce a production build
- `npm run start`: run the production server
- `npm run lint`: run ESLint

## Reproducibility Notes For Academic Writing

If you are documenting this tool in a paper, the following details are worth stating explicitly.

### System Type

Provotypographer is a browser-based, client-rendered reading interface prototype for controlled manipulation of presentation variables in text reading tasks.

### Independent Variables Directly Supported

- Reading mode: RSVP vs continuous
- Segmentation unit: character, word, sentence, paragraph
- Display window size: 1-3 units
- Advance step size in RSVP
- Playback speed in cps
- Punctuation delay
- Text direction in continuous mode
- Typography and spacing
- Staircase indentation pattern
- Structural guide marker settings
- Highlight window unit, size, style, and coupling behavior
- Viewport geometry

### Implementation Constraints Worth Reporting

- Sentence segmentation is regex-based rather than parser-based.
- Horizontal continuous mode is constrained to a fixed `paragraph-3` viewport step.
- Some schema fields are forward-looking or partially implemented relative to the present UI.
- Mouse Y rate control currently maps to a fixed speed range despite carrying min/max parameters in the schema.
- The prototype uses approximate pixel conversion from cps for continuous movement.

### Reproducibility Strengths

- Typed condition schema
- JSON export/import workflow
- UI state included in saved payloads
- Default startup condition defined in source
- Startup text externalized into a plain text file

## Limitations

- The system is currently a single large client component, which is flexible for prototyping but not ideal for long-term maintainability.
- There is no built-in telemetry export beyond the internal playback log reference maintained in component state.
- The `logsRef` structure records start/stop/tick/manual events internally, but it is not surfaced in the UI or exported.
- Accessibility and keyboard support are functional in a limited prototype sense, not as a fully audited production interface.
- The app does not include participant management, trial randomization, data capture, or statistical analysis tooling.

## Future Extensions

Natural next steps for this codebase would be:

- Persisting experimental sessions and participant metadata
- Exporting event logs or trial traces
- Supporting richer sentence boundary detection
- Breaking the monolithic page into reusable rendering and control modules
- Adding experimental protocols, counterbalancing, and stimulus lists
- Introducing formal validation around uploaded condition JSON

## Summary

Provotypographer is best understood as a configurable reading-condition workbench. It combines a typed experimental condition model, live text rendering controls, and reproducible JSON serialization in a compact browser-based prototype intended for reading-interface research.
