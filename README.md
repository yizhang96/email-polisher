# Email Polisher (Gmail)

Chrome extension that polishes Gmail drafts with selectable tone/length, optional thread context, and a model selector.

![Screenshot: ./email-polisher.png]

## Features
- Floating pill next to the cursor for one-click polishing
- Tone and length presets
- Model selector (gpt-4o-mini / gpt-5-mini / gpt-4o)
- Optional inclusion of the previous thread messages for context
- Undo and Copy quick actions after polishing

## Install (Load Unpacked)
1. Run `npm install`
2. Run `npm run build`
3. Open Chrome → Extensions → Enable Developer mode
4. Click “Load unpacked” and select `dist/`

## Setup
Open the extension Options page and enter your OpenAI API key. The key is stored locally in Chrome extension storage on your machine.

## Usage
1. Open Gmail and click into a reply/compose box.
2. Click the floating “Polish ✨” pill.
3. Choose tone, length, model, and whether to include thread context.
4. Click “Polish” or “Grammar-only”.

## Model Selector
- gpt-4o-mini: fast fixer (cost efficient)
- gpt-5-mini: smart assistant (faster)
- gpt-4o: expert editor (most capable)

## Privacy
Draft text and (optional) thread context are sent directly from the extension to the OpenAI API using your API key. No data is stored by the extension beyond the local settings.

## Development
- Build: `npm run build`
- Watch build: `npm run dev`

## License
See `LICENSE`.
