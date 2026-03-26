# Textual Provotype

Textual Provotype is a Next.js prototype for exploring RSVP and continuous text presentation patterns for reading research.

## Getting Started

You need `Node.js` and `npm` installed locally.

1. Run `npm install`
2. Run `npm run dev`
3. Open the local URL printed by Next.js in your browser

## Features

- Two reading modes: `rsvp` and `continuous`
- Viewport step slider with `L`, `W`, `S`, and `P` variants
- RSVP playback with autoplay, pause/play, reset, and manual advance
- Manual RSVP advance by clicking the viewport or pressing `Space`
- Advance step control in RSVP mode
- Continuous playback with horizontal and vertical motion
- Adjustable playback speed in characters per second
- Optional punctuation pause delay for RSVP playback
- Optional Mouse Y rate control with reset-on-leave behavior
- Editable source text inside the app
- Default startup text loaded from [public/default-text.txt](/Users/dylanb/Documents/Github/text-interface/public/default-text.txt)
- Resizable inner viewport width and height
- Crop-style viewport resizing that hides text without reflowing the layout
- Resizable settings sidebar
- Typography controls for font size, line height, alignment, line width, and viewport padding
- Full-width or capped text measure inside the viewport
- Support for variable font axes through the condition spec
- Sentence staircase layout with configurable indent in `ch`
- Staircase supports `by sentence` and `by line` modes
- Optional staircase max width can make the right edge step too
- Sentence staircase works in sentence and paragraph views
- Sentence staircase works in both RSVP and continuous rendering when sentence structure is shown
- Sentence marker system with cycling markers per sentence and configurable position, size, and gap
- Sentence markers can be used on their own or together with staircase layout
- Sentence and paragraph structured rendering in continuous mode, including multiline horizontal movement
- Paragraph-aware rendering that preserves paragraph breaks
- Settings JSON modal for viewing the active condition spec
- Settings JSON download
- Settings JSON copy to clipboard
- Settings JSON import from file
- Reset to default condition spec
- UI state persisted in exported settings JSON for viewport step, advance step, and viewport size

## Tech

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4

## Notes

- Default text can be changed by editing [public/default-text.txt](/Users/dylanb/Documents/Github/text-interface/public/default-text.txt).
- The app is intended as a research prototype
