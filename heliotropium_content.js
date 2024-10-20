'use strict';

function hasJsonLdDateProperty(object) {
	const DATE_PROPERTIES = ['datePublished'];
	const hasDate = DATE_PROPERTIES.some((property) => property in object);
	return hasDate;
}

function isJsonLdArticle(object) {
	const ARTICLE_TYPES = ['Article', 'BlogPosting', 'WebPage'];
	const type = object?.['@type'];
	const isArticle = Array.isArray(type)
		? type.some((t) => ARTICLE_TYPES.some((suffix) => t.endsWith(suffix)))
		: ARTICLE_TYPES.some((suffix) => type?.endsWith(suffix));
	return isArticle;
}

function findDateFromJsonLd() {
	const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
	if (scripts.length === 0) return null;

	console.log('heliotropium: found JSON-LD scripts.', scripts);

	for (const script of scripts) {
		try {
			// yet being invalid per JSON spec, but there are sites putting
			// unescaped newlines in JSON-LD scripts, so just remove them.
			const content = script.textContent.replaceAll('\n', '');
			// FIXME: some sites even has `<!CDATA[...]]>` in script element :(

			const data = JSON.parse(content);

			// { "@type": "Article", "datePublished": "..." }
			if (isJsonLdArticle(data) && hasJsonLdDateProperty(data)) {
				const date = data.datePublished;
				if (date) {
					console.log(`heliotropium: found date "${date}" in`, data);
					return date;
				}
			}

			// YouTube
			// { "@type": "VideoObject", "uploadDate": "..." }
			if (data?.['@type'] === 'VideoObject') {
				const date = data.uploadDate;
				if (date) {
					console.log(`heliotropium: found date "${date}" in`, data);
					return date;
				}
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
		} catch (error) {
			console.log('heliotropium: error parsing JSON-LD script.', error);
		}
	}

	return null;
}

function getValueFromElement({ selector, valueAttr = null, scope = document }) {
	const qsArgument = valueAttr ? `${selector}[${valueAttr}]` : selector;
	const matched = scope.querySelector(qsArgument);
	if (!matched) return null;

	const value = (valueAttr ? matched.getAttribute(valueAttr) : matched.textContent).trim();
	console.log(`heliotropium: found ${valueAttr ? `"${valueAttr}" value of ` : ''}"${value}" in`, matched);
	return value;
}

function findDateFromDateElements() {
	const dateElements = [
		{ selector: 'meta[property="article:published_time"]', valueAttr: 'content' },
		{ selector: 'meta[name="pubdate"]', valueAttr: 'content' },
		{ selector: 'meta[name="creation_date"]', valueAttr: 'content' },
		{ selector: 'meta[name="date"]', valueAttr: 'content' },
		{ selector: 'relative-time', valueAttr: 'datetime' },
		{ selector: 'time', valueAttr: 'datetime' },
	];

	for (const { selector, valueAttr } of dateElements) {
		const value = getValueFromElement({ selector, valueAttr });
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
		{ selector: 'p.gargardate' /* Gogole Search Central Blog */ },
		{ selector: 'devsite-content-footer > p:last-child' /* Chrome Developers, web.dev */ },
	];

	for (const selector of dateElements) {
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
		{ selector: 'relative-time[datetime]', valueAttr: 'datetime' },
		{ selector: 'time[datetime]', valueAttr: 'datetime' },
		{ selector: 'time' },
		{ selector: 'div.date' },
		{ selector: 'span.date' },
	];

	for (const { selector, valueAttr } of dateElements) {
		const value = getValueFromElement({ selector, valueAttr, scope: hashTarget });
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
