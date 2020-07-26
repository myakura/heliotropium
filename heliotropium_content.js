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
	console.log(`heliotropium: got a message`, message);
	if (!message) {
		console.log(`heliotrpium: message is empty.`);
		return;
	}

	let response = {};
	if (message?.action === `get-date`) {
		response.date = grabDate();
	}
	console.log(`heliotropium: sending back a response`, response);
	chrome.runtime.sendMessage(response);
}

function grabDateFromRelativeTimeElement() {
	let date = ``;
	const relativeTimeElement = document.querySelector(`relative-time`);
	if (!relativeTimeElement) {
		return date;
	}
	date = relativeTimeElement.getAttribute(`datetime`);
	console.log(`heliotropium: <relative-time> found.`, date);
	return date;
}

function grabDateFromTimeElement() {
	let date = ``;
	const timeElement = document.querySelector(`time[datetime]`);
	if (!timeElement) {
		return date;
	}
	date = timeElement.dateTime;
	console.log(`heliotropium: <time> found.`, date);
	return date;
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

function grabDate() {
	const methods = [
		grabDateFromJsonLd,
		grabDateFromRelativeTimeElement,
		grabDateFromTimeElement,
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
