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

		const dateString = findDateInJsonLdData(data);
		if (dateString) {
			console.log(`heliotropium: found "${dateString}" in`, data);
			return dateString;
		}

		// [{ "@type": "Article", "datePublished": "..." }]
		// { "@graph": [{ "@type": "Article", "datePublished": "..." }] }
		const arraysToCheck = [data, data?.['@graph']].filter(Array.isArray);

		for (const array of arraysToCheck) {
			const article = array.find((item) => isJsonLdArticle(item) && hasJsonLdDateProperty(item));
			if (article) {
				const dateString = article.datePublished;
				if (dateString) {
					console.log(`heliotropium: found "${dateString}" in`, article);
					return dateString;
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
		{ selector: '.bz_comment_time', attribute: 'data-ts' /* WebKit Bugzilla */ },
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
		{ selector: '.post_date' },
		{ selector: 'p.gargardate' /* Google Search Central Blog */ },
		{ selector: '.wd-pubdates' /* Chrome Developers, web.dev */ },
		{ selector: 'devsite-content-footer p:last-child' /* Chrome Developers */ },
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
			console.log(`heliotropium: found "${value}" inside hash target`, hashTarget);
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
		const dateString = finder();
		if (dateString) {
			return dateString;
		}
	}
	return null;
}

function handleGetDate(message, sender, sendResponse) {
	console.log('heliotropium: got a message.');
	console.log(sender);
	console.log(message);

	if (!message || typeof message !== 'object') {
		console.log('heliotropium: received an invalid message.');
		sendResponse({ error: 'Invalid request' });
		return;
	}

	if (message?.action !== 'get-date') {
		console.log(`heliotropium: unsupported action '${message?.action}'.`);
		sendResponse({ error: 'Unsupported action' });
		return;
	}

	const dateString = findDate();
	if (!dateString) {
		console.log('heliotropium: no date string found.');
		sendResponse({ error: 'No date string found' });
		return;
	}

	const response = { dateString, url: location.href };
	console.log('heliotropium: sending response.', response);
	sendResponse(response);
}

chrome.runtime.onMessage.addListener(handleGetDate);
