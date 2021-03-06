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
	const jsonLdScripts = [
		...document.querySelectorAll(`script[type="application/ld+json"]`),
	];
	if (jsonLdScripts.length === 0) {
		return date;
	}
	const jsonLdDates = jsonLdScripts.filter((script) => {
		try {
			const data = JSON.parse(script.textContent);
			return `datePublished` in data;
		} catch (error) {
			return false;
		}
	});
	if (jsonLdDates.length > 0) {
		const data = JSON.parse(jsonLdDates[0].textContent);
		date = data.datePublished;
		console.log(`heliotropium: JSON-LD "datePublished" found.`, date);
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
