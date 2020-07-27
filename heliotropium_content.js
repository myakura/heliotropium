'use strict';

function init() {
	addListeners();
}

function addListeners() {
	chrome.runtime.onMessage.addListener(handleMessage);
}

function checkDate(string) {
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

function generateGrabDateFromMetatag() {
	const attributes = [
		`property="article:published_time"`,
		`name="pubdate"`,
		`name="date"`,
	];
	const metatagFunctions = attributes.map((attr) => {
		const selector = `meta[${attr}][content]`;
		return function () {
			let date = ``;
			const metaElement = document.querySelector(selector);
			if (!metaElement) {
				return date;
			}
			date = metaElement.content;
			console.log(`heliotropium: <meta ${attr}> found.`, date);
			return date;
		};
	});
	return metatagFunctions;
}

function generateGrabValueFromElements({
	elemName,
	selectorAttr = null,
	valueAttr,
}) {
	return function () {
		let date = ``;
		const selector = selectorAttr
			? `${elemName}[${selectorAttr}][${valueAttr}]`
			: `${elemName}[${valueAttr}]`;
		const element = document.querySelector(selector);
		if (!element) {
			return date;
		}
		date = element.getAttribute(valueAttr);
		console.log(
			`heliotropium: <${elemName}${
				selectorAttr ? ` ${selectorAttr}` : ``
			}> found.`,
			date,
		);
		return date;
	};
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
	const methods = [
		grabDateFromJsonLd,
		...generateGrabDateFromMetatag(),
		...grabDateFromTimeElements(),
	];
	let date = ``;
	for (const method of methods) {
		date = method();
		if (checkDate(date)) {
			break;
		}
	}
	return date;
}

init();
