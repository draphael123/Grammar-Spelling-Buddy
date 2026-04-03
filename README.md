# Grammar & Spelling Buddy

A free, lightweight Chrome extension that catches spelling and grammar mistakes as you type. No accounts, no cloud, no bloat.

## Project Structure

```
index.html          — Landing page (deployed to Vercel)
vercel.json         — Vercel deployment config
extension/          — Chrome extension source
  manifest.json     — Chrome Extension manifest (v3)
  content.js        — Content script (text field monitoring, underlines, tooltips)
  content.css       — Styles for underlines, tooltips, badges
  dictionary.js     — ~5,000 word English dictionary + common misspellings
  grammar-rules.js  — Pattern-based grammar rules engine
  popup.html        — Extension popup UI
  popup.js          — Popup logic (toggle, stats)
  background.js     — Service worker (badge, context menu)
  icons/            — Extension icons (16, 48, 128px)
```

## Landing Page

The landing page is deployed via Vercel at the root URL. It's a single static HTML file with no build step required.

## Chrome Extension — Local Install

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repo
5. The purple "G" icon appears in your toolbar — start typing anywhere

## Features

- Real-time spelling and grammar checking
- 100% local — no data leaves your browser
- Works on Gmail, Google Docs, LinkedIn, Slack, and any text field
- One-click fix suggestions
- Under 2 MB, no performance impact
- Free forever, no account required

## License

Free and open source.
