'use strict';

function init() {
	addListeners();
}

function addListeners() {
	chrome.runtime.onMessage.addListener(handleMessage);
}

function isAcceptableDateFormat(string) {
	const re = /\d{4}[-\/\.]\d{1,2}[-\/\.]\d{1,2}/;
	return re.test(string);
}

function grabJsonLdScripts() {
	const scripts = [...document.querySelectorAll(`script[type="application/ld+json"]`)];
	console.log(`heliotropium: found JSON-LD scripts.`, scripts);
	return scripts;
}

function hasJsonLdDateProperty(object) {
	const JSON_LD_DATE_PROPERTY = [`datePublished`, `uploadDate`];
	const dateProperties = Object.keys(object).filter((key) => JSON_LD_DATE_PROPERTY.includes(key));
	if (dateProperties.length > 0) {
		console.log(`heliotropium: found JSON-LD date property.`, dateProperties);
	}
	return dateProperties;
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

function grabDateFromJsonLd() {
	let date = ``;
	const jsonLdScripts = grabJsonLdScripts();
	if (jsonLdScripts.length === 0) {
		return date;
	}
	const jsonLdWithDates = jsonLdScripts.filter((script) => {
		try {
			const data = JSON.parse(script.textContent);
			return hasJsonLdDateProperty(data);
		} catch (error) {
			return false;
		}
	});
	if (jsonLdWithDates.length > 0) {
		const data = JSON.parse(jsonLdWithDates[0].textContent);
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

init();
