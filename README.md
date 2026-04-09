# Provotypographer

Provotypographer is a research-oriented text reading interface built with Next.js. It is designed to explore RSVP and continuous text presentation patterns, compare pacing and segmentation strategies, and export reproducible reading conditions as JSON.

## Overview

The app presents a reading viewport beside a settings panel. You can paste or edit source text, switch between RSVP and continuous modes, tune playback and typography, resize the viewport, and save the current condition as JSON for reuse.

Default text is loaded from [public/default-text.txt](/Users/dylanb/Documents/Github/text-interface/public/default-text.txt).

## Features

### Reading Modes

- `rsvp` mode for centered token-by-token presentation
- `continuous` mode for looping horizontal or vertical text movement
- Shared viewport step ladder across both modes: `1-3 letters`, `1-3 words`, `1-3 sentences`, `1-3 paragraphs`
- Tokenization support for characters, words, sentences, and paragraphs

### RSVP Controls

- Autoplay toggle with play, pause, and reset controls
- Manual advance when autoplay is off by clicking the viewport or pressing `Space`
- Adjustable advance step capped by the current viewport step
- Speed control in characters per second
- Optional punctuation pause with configurable delay
- Center-character RSVP rendering for short units
- Structured sentence and paragraph rendering for larger units
- Optional RSVP highlight overlay with `bold`, `background`, or `outline` styles
- Highlight size tied to the same step ladder as the viewport

### Continuous Controls

- Autoplay loop for continuous reading
- Horizontal and vertical movement
- Adjustable speed in characters per second
- Optional vertical text wrapping
- Looping marquee-style rendering with continuous offset animation
- Sentence- and paragraph-aware rendering for structured text

### Viewport And Layout

- Resizable reading viewport using sliders or drag handles
- Separate width and height controls for the inner viewport
- Crop-style viewport resizing that hides text without reflowing the outer layout
- Resizable settings sidebar
- Show or hide the settings panel

### Typography And Presentation

- Adjustable font size and line height
- Alignment options: `left`, `center`, `right`, `justify`
- Toggle between full-width text measure and capped line width
- Adjustable viewport padding
- Support for variable font axes through the condition spec
- Letter spacing and word spacing support in the rendering layer

### Structured Reading Experiments

- Sentence staircase layout with configurable indent in `ch`
- Staircase modes for `by sentence` and `by line`
- Optional max line width for stepped right edges
- Guide marker system for sentence or line boundaries
- Marker position controls for `start`, `end`, or `both`
- Marker variation by `shape`, `color`, or `both`
- Configurable marker size and gap
- Structured sentence and paragraph rendering works in RSVP and continuous presentations where applicable

### Input And Condition Management

- Editable source text directly in the UI
- Condition spec modal for inspecting the active JSON
- Download current settings as JSON
- Copy current settings JSON to the clipboard
- Import settings JSON from a file
- Reset back to the default condition spec
- Exported settings include UI state such as viewport step, advance step, and viewport dimensions
- Import flow normalizes older or partial JSON inputs against the current spec

## Tech Stack

- Next.js 16 with the App Router
- React 19
- TypeScript 5 in `strict` mode
- Tailwind CSS 4
- ESLint 9 with `eslint-config-next`

## Project Structure

- [app/page.tsx](/Users/dylanb/Documents/Github/text-interface/app/page.tsx) contains the full reader UI, rendering logic, and settings controls
- [lib/condition-spec.ts](/Users/dylanb/Documents/Github/text-interface/lib/condition-spec.ts) defines the `ConditionSpec` schema and default state
- [app/globals.css](/Users/dylanb/Documents/Github/text-interface/app/globals.css) contains the global theme and base styles
- [public/default-text.txt](/Users/dylanb/Documents/Github/text-interface/public/default-text.txt) provides the startup text loaded into the editor

## Getting Started

### Requirements

- Node.js
- npm

### Development

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

## Available Scripts

- `npm run dev` starts the local development server
- `npm run build` creates a production build
- `npm run start` runs the production server
- `npm run lint` runs ESLint

## Notes

- This project is a prototype intended for reading research and interface experiments.
- If you want different startup content, edit [public/default-text.txt](/Users/dylanb/Documents/Github/text-interface/public/default-text.txt).
