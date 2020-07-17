'use strict';

function init() {
	addListeners();
}

function addListeners() {
	chrome.runtime.onMessage.addListener(handleMessage);
}

function handleMessage(message) {
	console.log(`heliotropium: got a message`, message);

	let date = ``;
	if (message.action === `get-date`) {
		date = grabDate();
	}
	const response = { type: `content-date`, date };
	console.log(`heliotropium: sending back a response`, response);
	chrome.runtime.sendMessage(response);
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
		const data = JSON.parse(script.textContent);
		return `datePublished` in data;
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
	} else if (document.querySelector(`time[datetime]`)) {
		date = grabDateFromTimeElement();
		return date;
	}
	return date;
}

init();
