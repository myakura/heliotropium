'use strict';

function isAcceptableDateFormat(string) {
	const re = /(?<year>\d{4})[-\/\.](?<month>\d{1,2})[-\/\.](?<day>\d{1,2})/;
	return re.test(string);
}

function grabJsonLdScripts() {
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

function isJsonLdArticle(object) {
	const ARTICLE_TYPES = ['Article', 'NewsArticle', 'BlogPosting'];
	const type = object?.['@type'];
	const isArticle = ARTICLE_TYPES.includes(type);
	if (isArticle) {
		console.log('heliotropium: found JSON-LD type.', type);
	}
	return isArticle;
}

function grabDateFromJsonLd() {
	let date = ``;
	const jsonLdScripts = grabJsonLdScripts();
	if (jsonLdScripts.length === 0) {
		return date;
	}
	const jsonLdWithDates = jsonLdScripts.map((script) => {
		try {
			const data = JSON.parse(script.textContent);
			return data;
		} catch (error) {
			return false;
		}
	}).filter((object) => {
		return hasJsonLdDateProperty(object);
	});
	if (jsonLdWithDates.length > 0) {
		const data = jsonLdWithDates[0];
		date = data?.datePublished || data?.uploadDate;
		console.log(`heliotropium: found date "${date}" from`, data);
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

function grabDateFromElements() {
	let date = null;
	const dateCandidates = [
		{ selector: `meta[property="article:published_time"]`, valueAttr: `content` },
		{ selector: `meta[name="pubdate"]`, valueAttr: `content` },
		{ selector: `meta[name="date"]`, valueAttr: `content` },
		{ selector: `relative-time`, valueAttr: `datetime` },
		{ selector: `time`, valueAttr: `datetime` },
	];
	for (const {selector, valueAttr} of dateCandidates) {
		let value = getAttrValue({selector, valueAttr});
		if (!!value && isAcceptableDateFormat(value)) {
			date = value;
			break;
		}
	}
	return date;
}

function grabDate() {
	let date = null;
	date = grabDateFromJsonLd();
	if (!date || !isAcceptableDateFormat(date)) {
		date = grabDateFromElements();
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
		response.date = grabDate();
	}
	console.log(`heliotropium: sending back a response.`, response);
	chrome.runtime.sendMessage(response);
}

chrome.runtime.onMessage.addListener(handleMessage);