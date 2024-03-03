'use strict';

function hasJsonLdDateProperty(object) {
	const JSON_LD_DATE_PROPERTIES = [`datePublished`, `uploadDate`];
	const hasDate = JSON_LD_DATE_PROPERTIES.some((property) => property in object);
	if (hasDate) {
		console.log(`heliotropium: found JSON-LD date property.`, object);
	}
	return hasDate;
}

function isJsonLdArticle(object) {
	const ARTICLE_TYPE_SUFFIXES = [`Article`, `BlogPosting`];
	const type = object?.[`@type`];
	const isArticle = ARTICLE_TYPE_SUFFIXES.some((suffix) => type?.endsWith(suffix));
	if (isArticle) {
		console.log(`heliotropium: found JSON-LD type.`, type);
	}
	return isArticle;
}

function findDateFromJsonLd() {
	const scripts = [...document.querySelectorAll(`script[type="application/ld+json"]`)];
	if (!scripts.length) {
		console.log(`heliotropium: no JSON-LD scripts found.`);
		return null;
	}
	console.log(`heliotropium: found JSON-LD scripts.`, scripts);

	for (const script of scripts) {
		try {
			// technically invalid per spec, but there are sites putting
			// unescaped newlines in JSON-LD scripts, so just remove them.
			const content = script.textContent.replaceAll(`\n`, ``);
			// FIXME: some sites even has `<!CDATA[...]]>` in script element :(
			const data = JSON.parse(content);

			// { "@type": "Article", "datePublished": "..." }
			if (isJsonLdArticle(data) && hasJsonLdDateProperty(data)) {
				const date = data.datePublished || data.uploadDate;
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
					const date = article.datePublished || article.uploadDate;
					if (date) {
						console.log(`heliotropium: found date "${date}" in`, article);
						return date;
					}
				}
			}
		} catch (error) {
			console.log(`heliotropium: error parsing JSON-LD script.`, error);
		}
	}

	console.log(`heliotropium: no date found in JSON-LD.`);
	return null;
}

function getAttrValue({ selector, valueAttr }) {
	const qsaArgument = `${selector}[${valueAttr}]`;
	const matched = document.querySelector(qsaArgument);
	if (!matched) {
		return null;
	}
	const value = matched.getAttribute(valueAttr);
	console.log(`heliotropium: found "${valueAttr}" value of "${value}" in`, matched);
	return value;
}

function getElementContent({ selector }) {
	const matched = document.querySelector(selector);
	if (!matched) {
		return null;
	}
	const value = matched.textContent.trim();
	console.log(`heliotropium: found content of "${value}" in`, matched);
	return value;
}

function findDateFromDateElements() {
	const dateElements = [
		{ selector: `meta[property="article:published_time"]`, valueAttr: `content` },
		{ selector: `meta[name="pubdate"]`, valueAttr: `content` },
		{ selector: `meta[name="creation_date"]`, valueAttr: `content` },
		{ selector: `meta[name="date"]`, valueAttr: `content` },
		{ selector: `relative-time`, valueAttr: `datetime` },
		{ selector: `time`, valueAttr: `datetime` },
	];

	for (const { selector, valueAttr } of dateElements) {
		const value = getAttrValue({ selector, valueAttr });
		if (value) {
			return value;
		}
	}
	return null;
}

function findDateFromElementContent() {
	const dateElements = ['time', '.date'];

	for (const selector of dateElements) {
		const value = getElementContent({ selector });
		if (value) {
			return value;
		}
	}
	return null;
}

function findDate() {
	const finders = [findDateFromJsonLd, findDateFromDateElements, findDateFromElementContent];

	for (const finder of finders) {
		const date = finder();
		if (date) {
			return date;
		}
	}
	return null;
}

function handleMessage(message) {
	console.log(`heliotropium: got a message.`, message);

	if (!message || message?.action !== `get-date`) {
		console.log(`heliotropium: message is ${!message ? 'empty' : 'invalid'}.`);
		return;
	}

	const date = findDate();
	if (!date) {
		console.log(`heliotropium: no date found.`);
		return;
	}

	const response = { date };
	console.log(`heliotropium: sending back a response.`, response);
	chrome.runtime.sendMessage(response);
}

chrome.runtime.onMessage.addListener(handleMessage);