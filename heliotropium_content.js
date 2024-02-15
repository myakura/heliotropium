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
		console.log(`heliotropium: found JSON-LD date property.`);
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
		console.log(`heliotropium: JSON-LD date found.`, date);
	}
	return date;
}

function generateGrabValueFromElements({
	elemName,
	selectorAttr = null,
	valueAttr,
}) {
	return function () {
		let value = ``;
		const selector = selectorAttr
			? `${elemName}[${selectorAttr}][${valueAttr}]`
			: `${elemName}[${valueAttr}]`;
		const element = document.querySelector(selector);
		if (!element) {
			return value;
		}
		value = element.getAttribute(valueAttr);
		console.log(
			`heliotropium: <${elemName}${
				selectorAttr ? ` ${selectorAttr}` : ``
			}> found.`,
			value,
		);
		return value;
	};
}

function generateGrabDateFromMetatags() {
	const attributes = [
		`property="article:published_time"`,
		`name="pubdate"`,
		`name="date"`,
	];
	const metatags = attributes.map((attr) => {
		return { elemName: `meta`, selectorAttr: attr, valueAttr: `content` };
	});
	return metatags.map((elemData) => generateGrabValueFromElements(elemData));
}

function grabDateFromTimeElements() {
	const timeElements = [
		{ elemName: `relative-time`, valueAttr: `datetime` },
		{ elemName: `time`, valueAttr: `datetime` },
	];
	return timeElements.map((elemData) =>
		generateGrabValueFromElements(elemData),
	);
}

function grabDate() {
	const grabDateFuntions = [
		grabDateFromJsonLd,
		...generateGrabDateFromMetatags(),
		...grabDateFromTimeElements(),
	];
	let date = ``;
	for (const grabDateFunction of grabDateFuntions) {
		date = grabDateFunction();
		if (isAcceptableDateFormat(date)) {
			break;
		}
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