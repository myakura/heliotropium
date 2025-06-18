# Heliotropium

A browser extension for Firefox and Chrome that automatically detects and displays publication dates of web pages.

## Overview

Heliotropium helps you quickly identify when web content was published by extracting date information from various sources on web pages and displaying it in the browser toolbar. No more hunting through articles to find publication dates!

## Features

### Smart Date Detection

The extension uses multiple strategies to find publication dates:

- **JSON-LD structured data** - Extracts `datePublished` for articles and `uploadDate` for videos
- **Meta tags** - Searches Open Graph, article metadata, and other date-related properties
- **HTML elements** - Finds `<time>` elements and common date-related CSS classes
- **Hash target content** - When URLs contain fragments (#), searches within those specific sections

### Flexible Date Parsing

Supports various international date formats:

- ISO format: `2001-01-01`
- US format: `June 19, 1984`
- UK format: `19 April 1984`
- Japanese format: `2001年1月1日`
- And common variations (e.g., slash format: `2001/01/01`; short month: `Jan 1, 2001`)

### Visual Indicators

- **Badge**: Shows abbreviated date (e.g., `5/19` or `1213`) on the extension icon
- **Tooltip**: Displays full date in `YYYY-MM-DD` format when hovering

## Installation

### Firefox

Heliotropium is available on the [Firefox Add-ons page](https://addons.mozilla.org/en-US/firefox/addon/heliotropium/). You can install it directly from there.

### Chrome

Unfortunately, Heliotropium is not currently available on the Chrome Web Store as it requires registration cost and dealing with dashboard and review process.

If you want to help getting it published, [please donate myakura on GitHub Sponsors](https://github.com/sponsors/myakura).

Meanwhile, you can install it manually.

#### Load From Source

1. Clone or download this repository
2. Open Chrome extension management page
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension directory

Note: this developer mode thing is not really recommended for regular users, as it requires you to keep the extension updated manually.

### Other Browsers

- **Microsoft Edge**: Not tested, but I hope it works with the same steps as Chrome
- **Other Chromium-based browsers**: Not tested, but I guess it works with the same steps as Chrome
- **Safari**: Not tested, not sure if it works; I know the API is compatible and this extension doesn't do much tricky things so I hope... I haven't tried building it for Safari yet.

## API for Developers

Heliotropium offers API for other extensions to request dates for selected tabs. You can send a message to this extension ID with the message format below:

```javascript
chrome.runtime.sendMessage(
	extensionId,
	{
		action: "get-dates",
		tabIds: [123, 456, 789], // yes you can request multiple tabs at once
	},
	(response) => {
		// response.data contains array of date information for each tab
		console.log(response.data);
	}
);
```

Response format:

```javascript
{
	data: [
		{
			tabId: 123,
			url: "https://example.com/article",
			title: "Article Title",
			dateString: "2024-03-15",
			date: { year: "2024", month: "03", day: "15" },
		},
	];
}
```

## Development

### Building

The extension only uses plain JavaScript - no build process required. Simply load the directory as an unpacked extension during development.

## Privacy

For now Heliotropium:

- Only processes page content locally
- Does not collect or transmit any personal data
- Does not track browsing history
- Only requests minimal permissions (`tabs` for managing browser action)
