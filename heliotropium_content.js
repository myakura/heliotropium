'use strict';

function init() {
	addListeners();

	grabDate();
}

function addListeners() {
	chrome.runtime.onMessage.addListener(handleMessage);
}

function handleMessage(message) {
	console.log(`heliotropium: got a message`, message);

	let date = ``;
	let status = `NG`;
	if (message.action === `get-date`) {
		date = grabDate();
		if (date !== ``) {
			status = `OK`;
		}
	}
	const response = { type: `content-date`, status, date };
	console.log(`heliotropium: sending back a response`, response);
	chrome.runtime.sendMessage(response);
}

function grabDate() {
	let date = ``;
	const timeElement = document.querySelector(`time[datetime]`);
	if (!timeElement) {
		console.log(`heliotropium: <time> not found.`);
	}
	else {
		console.log(`heliotropium: datetime is "${timeElement.dateTime}"`);
		date = timeElement.dateTime;
	}
	return date;
}

init();
