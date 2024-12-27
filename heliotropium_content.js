'use strict';

function isJsonLdArticle(object) {
	const ARTICLE_TYPES = ['Article', 'BlogPosting', 'WebPage'];
	const type = object?.['@type'];
	if (Array.isArray(type)) {
		return type.some((t) => ARTICLE_TYPES.some((suffix) => t.endsWith(suffix)));
	}
	return ARTICLE_TYPES.some((suffix) => type?.endsWith(suffix));
}

function hasJsonLdDateProperty(object) {
	const DATE_PROPERTIES = ['datePublished'];
	return DATE_PROPERTIES.some((property) => property in object);
}

function parseJsonLdScript(script) {
	try {
		// yet being invalid per JSON spec, but there are sites putting
		// unescaped newlines in JSON-LD scripts, so just remove them.
		const content = script.textContent?.replaceAll('\n', '') || '';
		// FIXME: some sites even has `<!CDATA[...]]>` in script element :(

		return JSON.parse(content);
	}
	catch (error) {
		console.log('heliotropium: error parsing JSON-LD script.', error);
		return null;
	}
}

function findDateInJsonLdData(data) {
	if (!data) return null;

	// { "@type": "Article", "datePublished": "..." }
	if (isJsonLdArticle(data) && hasJsonLdDateProperty(data)) {
		return data.datePublished;
	}

	// YouTube
	// { "@type": "VideoObject", "uploadDate": "..." }
	if (data?.['@type'] === 'VideoObject') {
		return data.uploadDate;
	}

	return null;
}

function findDateFromJsonLd() {
	const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
	if (scripts.length === 0) return null;

	console.log('heliotropium: found JSON-LD scripts.', scripts);

	for (const script of scripts) {
		const data = parseJsonLdScript(script);
		if (!data) continue;

		const date = findDateInJsonLdData(data);
		if (date) {
			console.log(`heliotropium: found date "${date}" in`, data);
			return date;
		}

		// [{ "@type": "Article", "datePublished": "..." }]
		// { "@graph": [{ "@type": "Article", "datePublished": "..." }] }
		const arraysToCheck = [data, data?.['@graph']].filter(Array.isArray);

		for (const array of arraysToCheck) {
			const article = array.find((item) => isJsonLdArticle(item) && hasJsonLdDateProperty(item));
			if (article) {
				const date = article.datePublished;
				if (date) {
					console.log(`heliotropium: found date "${date}" in`, article);
					return date;
				}
			}
		}
	}

	return null;
}

function getValueFromElement({ selector, attribute = null, scope = document }) {
	const qsArgument = attribute ? `${selector}[${attribute}]` : selector;
	const match = scope.querySelector(qsArgument);
	if (!match) return null;

	const value = (attribute ? match.getAttribute(attribute) : match.textContent)?.trim() || '';
	console.log(`heliotropium: found ${attribute ? `"${attribute}" value of ` : ''}"${value}" in`, match);

	return value;
}

function findDateFromDateElements() {
	const dateElements = [
		{ selector: 'meta[property="article:published_time"]', attribute: 'content' },
		{ selector: 'meta[name="pubdate"]', attribute: 'content' },
		{ selector: 'meta[name="creation_date"]', attribute: 'content' },
		{ selector: 'meta[name="date"]', attribute: 'content' },
		{ selector: 'relative-time', attribute: 'datetime' },
		{ selector: 'time', attribute: 'datetime' },
	];

	for (const { selector, attribute } of dateElements) {
		const value = getValueFromElement({ selector, attribute });
		if (value) {
			return value;
		}
	}
	return null;
}

function findDateFromElementContent() {
	const dateElements = [
		{ selector: 'time' },
		{ selector: 'div.date' },
		{ selector: 'span.date' },
		{ selector: '.pubdate' },
		{ selector: 'p.gargardate' /* Google Search Central Blog */ },
		{ selector: '.wd-pubdates' /* Chrome Developers, web.dev */ },
		{ selector: '[class^="ArticleHeader_pubDate__"]' /* Zenn */ },
	];

	for (const { selector } of dateElements) {
		const value = getValueFromElement({ selector });
		if (value) {
			return value;
		}
	}
	return null;
}

function findDateInsideHashTarget() {
	const hash = location.hash;
	const hashTarget = (hash !== '') ? document.querySelector(hash) : null;
	if (!hashTarget) return null;

	const dateElements = [
		{ selector: 'relative-time[datetime]', attribute: 'datetime' },
		{ selector: 'time[datetime]', attribute: 'datetime' },
		{ selector: 'time' },
		{ selector: 'div.date' },
		{ selector: 'span.date' },
	];

	for (const { selector, attribute } of dateElements) {
		const value = getValueFromElement({ selector, attribute, scope: hashTarget });
		if (value) {
			console.log(`heliotropium: found date "${value}" inside hash target`, hashTarget);
			return value;
		}
	}
	return null;
}

function findDate() {
	const finders = [
		findDateInsideHashTarget,
		findDateFromJsonLd,
		findDateFromDateElements,
		findDateFromElementContent,
	];

	for (const finder of finders) {
		const date = finder();
		if (date) {
			return date;
		}
	}
	return null;
}

function handleGetDate(message, sender, sendResponse) {
	console.log('heliotropium: got a message.', message);

	if (!message) {
		console.log('heliotropium: message is empty.');
		return;
	}

	if (message?.action !== 'get-date') {
		console.log(`heliotropium: non-supported action '${message?.action}'.`);
		return;
	}

	const date = findDate();
	if (!date) {
		console.log('heliotropium: no date found.');
		return;
	}

	const response = { date, url: location.href };
	console.log('heliotropium: sending back a response.', response);
	sendResponse(response);
}

chrome.runtime.onMessage.addListener(handleGetDate);
