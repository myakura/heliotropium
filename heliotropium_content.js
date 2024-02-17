'use strict';

function isAcceptedDateFormat(string) {
	const re = /(?<year>\d{4})[-\/\.](?<month>\d{1,2})[-\/\.](?<day>\d{1,2})/;
	return re.test(string);
}

function findJsonLdScripts() {
	const scripts = [...document.querySelectorAll(`script[type="application/ld+json"]`)];
	console.log(`heliotropium: found JSON-LD scripts.`, scripts);
	return scripts;
}

function hasJsonLdDateProperty(object) {
	const JSON_LD_DATE_PROPERTY = [`datePublished`, `uploadDate`];
	const hasDate = JSON_LD_DATE_PROPERTY.some((property) => {
		return property in object;
	});
	if (hasDate) {
		console.log(`heliotropium: found JSON-LD date property.`, object);
	}
	return hasDate;
}

function grabDate(object) {
	return object?.datePublished || object?.uploadDate;
}

function isJsonLdArticle(object) {
	const ARTICLE_TYPES_SUFFIX = [`Article`, `BlogPosting`];
	const type = object?.[`@type`];
	const isArticle = ARTICLE_TYPES_SUFFIX.some((suffix) => {
		return type.endsWith(suffix);
	});
	if (isArticle) {
		console.log(`heliotropium: found JSON-LD type.`, type);
	}
	return isArticle;
}

function findDateFromJsonLd() {
	let date = null;

	const jsonLdScripts = findJsonLdScripts();
	if (jsonLdScripts.length === 0) {
		return date;
	}

	const parsedData = jsonLdScripts.map((script) => {
		try {
			return JSON.parse(script.textContent);
		} catch (error) {
			return null;
		}
	}).filter((data) => {
		return data !== null;
	});

	for (const data of parsedData) {
		if (isJsonLdArticle(data) && hasJsonLdDateProperty(data)) {
			date = grabDate(data);
			console.log(`heliotropium: found date "${date}" in`, data);
			break;
		}
		const graph = data?.[`@graph`];
		if (!!graph && Array.isArray(graph)) {
			const article = graph.find((object) => {
				return isJsonLdArticle(object) && hasJsonLdDateProperty(object);
			});
			if (article) {
				date = grabDate(article);
				console.log(`heliotropium: found date "${date}" in`, article);
				break;
			}
		}
		if (Array.isArray(data)) {
			const article = data.find((object) => {
				return isJsonLdArticle(object) && hasJsonLdDateProperty(object);
			});
			if (article) {
				date = grabDate(article);
				console.log(`heliotropium: found date "${date}" in`, article);
				break;
			}
		}
	}

	return date;
}

function getAttrValue({selector, valueAttr}) {
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

function findDateFromElements() {
	let date = null;
	const dateElements = [
		{ selector: `meta[property="article:published_time"]`, valueAttr: `content` },
		{ selector: `meta[name="pubdate"]`, valueAttr: `content` },
		{ selector: `meta[name="date"]`, valueAttr: `content` },
		{ selector: `relative-time`, valueAttr: `datetime` },
		{ selector: `time`, valueAttr: `datetime` },
	];
	for (const {selector, valueAttr} of dateElements) {
		let value = getAttrValue({selector, valueAttr});
		if (!!value && isAcceptedDateFormat(value)) {
			date = value;
			break;
		}
	}
	return date;
}

function findDate() {
	let date = null;
	date = findDateFromJsonLd();
	if (!date || !isAcceptedDateFormat(date)) {
		date = findDateFromElements();
	}
	return date;
}

function handleMessage(message) {
	console.log(`heliotropium: got a message.`, message);
	if (!message) {
		console.log(`heliotrpium: message is empty.`);
		return;
	}
	let response = {};
	if (message?.action === `get-date`) {
		response.date = findDate();
	}
	console.log(`heliotropium: sending back a response.`, response);
	chrome.runtime.sendMessage(response);
}

chrome.runtime.onMessage.addListener(handleMessage);