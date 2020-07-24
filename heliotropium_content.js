'use strict';

function init() {
	addListeners();
}

function addListeners() {
	chrome.runtime.onMessage.addListener(handleMessage);
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
		console.log(`heliotropium: <relative-time> not found.`);
	} else {
		console.log(
			`heliotropium: <relative-time> found.`,
			relativeTimeElement.getAttribute(`datetime`),
		);
		date = relativeTimeElement.getAttribute(`datetime`);
	}
	return date;
}

function grabDateFromTimeElement() {
	let date = ``;
	const timeElement = document.querySelector(`time[datetime]`);
	if (!timeElement) {
		console.log(`heliotropium: <time> not found.`);
	} else {
		console.log(`heliotropium: <time> found.`, timeElement.dateTime);
		date = timeElement.dateTime;
	}
	return date;
}

function grabDateValueFromJsonLd() {
	let date = ``;
	const jsonLdScripts = [
		...document.querySelectorAll(`script[type="application/ld+json"]`),
	];
	const jsonLdDates = jsonLdScripts.filter((script) => {
		try {
			const data = JSON.parse(script.textContent);
			return `datePublished` in data;
		} catch (error) {
			return false;
		}
	});
	if (!jsonLdDates.length) {
		console.log(`heliotropium: JSON-LD "datePublished" not found.`);
	} else {
		const data = JSON.parse(jsonLdDates[0].textContent);
		console.log(
			`heliotropium: JSON-LD "datePublished" found.`,
			data.datePublished,
		);
		date = data.datePublished;
	}
	return date;
}

function grabDate() {
	let date = ``;
	if (document.querySelector(`script[type="application/ld+json"]`)) {
		date = grabDateValueFromJsonLd();
		return date;
	} else if (document.querySelector(`relative-time`)) {
		date = grabDateFromRelativeTimeElement();
		return date;
	} else if (document.querySelector(`time[datetime]`)) {
		date = grabDateFromTimeElement();
		return date;
	}
	return date;
}

init();
