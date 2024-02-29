'use strict';

function hasJsonLdDateProperty(object) {
	const JSON_LD_DATE_PROPERTIES = [`datePublished`, `uploadDate`];
	const hasDate = JSON_LD_DATE_PROPERTIES.some((property) => {
		return property in object;
	});
	if (hasDate) {
		console.log(`heliotropium: found JSON-LD date property.`, object);
	}
	return hasDate;
}

function isJsonLdArticle(object) {
	const ARTICLE_TYPE_SUFFIXES = [`Article`, `BlogPosting`];
	const type = object?.[`@type`];
	const isArticle = ARTICLE_TYPE_SUFFIXES.some((suffix) => {
		return type?.endsWith(suffix);
	});
	if (isArticle) {
		console.log(`heliotropium: found JSON-LD type.`, type);
	}
	return isArticle;
}

function findDateFromJsonLd() {
	let object = null;
	let date = null;

	const jsonLdScripts = [...document.querySelectorAll(`script[type="application/ld+json"]`)];
	if (!jsonLdScripts.length) {
		return null;
	}
	console.log(`heliotropium: found JSON-LD scripts.`, jsonLdScripts);

	const parsedData = jsonLdScripts.map((script) => {
		try {
			// technically invalid per spec, but there are sites putting
			// unescaped newlines in JSON-LD scripts, so just remove them.
			const scriptContent = script.textContent.replaceAll(`\n`, ``);
			// FIXME: some sites even has `<!CDATA[...]]>` in script element :(
			return JSON.parse(scriptContent);
		} catch (error) {
			return null;
		}
	}).filter((data) => {
		return data !== null;
	});

	for (const data of parsedData) {
		// { "@type": "Article", "datePublished": "..." }
		if (isJsonLdArticle(data) && hasJsonLdDateProperty(data)) {
			object = data;
			break;
		}
		// [{ "@type": "Article", "datePublished": "..." }]
		// { "@graph": [{ "@type": "Article", "datePublished": "..." }] }
		const arraysToCheck = [data, data?.['@graph']].filter(Array.isArray);
		for (const array of arraysToCheck) {
			const article = array.find((item) => {
				return isJsonLdArticle(item) && hasJsonLdDateProperty(item);
			});
			if (article) {
				object = article;
				break;
			}
		}
	}

	date = object?.datePublished || object?.uploadDate;
	if (date) {
		console.log(`heliotropium: found date "${date}" in`, object);
	}
	else {
		console.log(`heliotropium: no date found in JSON-LD.`);
	}
	return date;
}

function getAttrValue({ selector, valueAttr }) {
	const qsaArgument = `${selector}[${valueAttr}]`;
	const matched = [...document.querySelectorAll(qsaArgument)];
	if (matched.length === 0) {
		return null;
	}
	const firstMatched = matched[0];
	const value = firstMatched.getAttribute(valueAttr);
	console.log(`heliotropium: found "${valueAttr}" value of "${value}" in`, firstMatched);
	return value;
}

function getElementContent({ selector }) {
	const matched = [...document.querySelectorAll(selector)];
	if (matched.length === 0) {
		return null;
	}
	const firstMatched = matched[0];
	const value = firstMatched.textContent.trim();
	console.log(`heliotropium: found content of "${value}" in`, firstMatched);
	return value;
}

function findDateFromDateElements() {
	let date = null;
	const dateElements = [
		{ selector: `meta[property="article:published_time"]`, valueAttr: `content` },
		{ selector: `meta[name="pubdate"]`, valueAttr: `content` },
		{ selector: `meta[name="date"]`, valueAttr: `content` },
		{ selector: `relative-time`, valueAttr: `datetime` },
		{ selector: `time`, valueAttr: `datetime` },
	];
	for (const { selector, valueAttr } of dateElements) {
		let value = getAttrValue({ selector, valueAttr });
		if (!!value) {
			date = value;
			break;
		}
	}
	return date;
}

function findDateFromElementContent() {
	let date = null;
	const dateElements = [
		{ selector: `time` },
		{ selector: `.date` },
	];
	for (const { selector } of dateElements) {
		let value = getElementContent({ selector });
		if (!!value) {
			date = value;
			break;
		}
	}
	return date;
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
	if (!message) {
		console.log(`heliotrpium: message is empty.`);
		return;
	}
	if (message?.action !== `get-date`) {
		console.log(`heliotrpium: message is invalid.`);
		return;
	}
	const date = findDate();
	if (!date) {
		console.log(`heliotropium: no date found.`);
		return;
	}
	let response = { date };
	console.log(`heliotropium: sending back a response.`, response);
	chrome.runtime.sendMessage(response);
}

chrome.runtime.onMessage.addListener(handleMessage);