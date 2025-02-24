'use strict';

/**
 * Checks if an object represents a JSON-LD article.
 * @param {object} object
 * @returns {boolean}
 */
function isJsonLdArticle(object) {
	const ARTICLE_TYPES = ['Article', 'BlogPosting', 'WebPage'];
	const type = object?.['@type'];
	if (Array.isArray(type)) {
		return type.some((t) => ARTICLE_TYPES.some((suffix) => t.endsWith(suffix)));
	}
	return ARTICLE_TYPES.some((suffix) => type?.endsWith(suffix));
}

/**
 * Checks if an object has a recognized JSON-LD date property.
 * @param {object} object
 * @returns {boolean}
 */
function hasJsonLdDateProperty(object) {
	const DATE_PROPERTIES = ['datePublished'];
	return DATE_PROPERTIES.some((property) => property in object);
}

/**
 * Parses the text content of a JSON-LD script element into a JavaScript object.
 * @param {HTMLScriptElement} script
 * @returns {object|null}
 */
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

/**
 * Extracts a publication date from JSON-LD data.
 * @param {object} data
 * @returns {string|null}
 */
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

/**
 * Finds a publication date from JSON-LD script elements in the document.
 * @returns {string|null}
 */
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

/**
 * Retrieves a value from an element based on a selector and optional attribute.
 * @param {object} options
 * @returns {string|null}
 */
function getValueFromElement({ selector, attribute = null, scope = document }) {
	const qsArgument = attribute ? `${selector}[${attribute}]` : selector;
	const match = scope.querySelector(qsArgument);
	if (!match) return null;

	const value = (attribute ? match.getAttribute(attribute) : match.textContent)?.trim() || '';
	console.log(`heliotropium: found ${attribute ? `"${attribute}" value of ` : ''}"${value}" in`, match);

	return value;
}

/**
 * Generic function to find a value from a list of selectors.
 * @param {Array<object>} selectors - Array of objects {selector, attribute?}
 * @param {Document|Element} [scope=document]
 * @returns {string|null}
 */
function findValueFromSelectors(selectors, scope = document) {
	for (const { selector, attribute } of selectors) {
		const value = getValueFromElement({ selector, attribute, scope });
		if (value) return value;
	}
	return null;
}

// Example usage for date elements:
function findDateFromDateElements() {
	const dateSelectors = [
		{ selector: 'meta[property="article:published_time"]', attribute: 'content' },
		{ selector: 'meta[name="pubdate"]', attribute: 'content' },
		{ selector: 'meta[name="creation_date"]', attribute: 'content' },
		{ selector: 'meta[name="date"]', attribute: 'content' },
		{ selector: 'relative-time', attribute: 'datetime' },
		{ selector: 'time', attribute: 'datetime' },
		{ selector: '.bz_comment_time', attribute: 'data-ts' /* WebKit Bugzilla */ },
	];
	return findValueFromSelectors(dateSelectors);
}

function findDateFromElementContent() {
	const contentSelectors = [
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
	return findValueFromSelectors(contentSelectors);
}

/**
 * Finds a publication date inside an element targeted by the URL hash.
 * @returns {string|null}
 */
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

/**
 * Finds a publication date by trying different methods in sequence.
 * @returns {string|null}
 */
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

/**
 * Handles incoming messages and responds with the extracted date.
 * @param {object} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {Function} sendResponse
 */
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
