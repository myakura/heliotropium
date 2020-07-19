'use strict';

function parseDate(date) {
	const re = /^(?<year>\d{4})[-\/\.](?<month>\d{1,2})[-\/\.](?<day>\d{1,2})/;
	const { year, month, day } = re.exec(date).groups;
	return {
		year,
		month: month.padStart(2, `0`),
		day: day.padStart(2, `0`),
	};
}

function checkDate(string) {
	const re = /^\d{4}[-\/\.]\d{1,2}[-\/\.]\d{1,2}/;
	return re.test(string);
}

function askDate(tabId) {
	const message = { action: `get-date` };
	chrome.tabs.sendMessage(tabId, message);
}

function getTabInfo(tabId) {
	return new Promise((resolve, reject) => {
		chrome.tabs.get(tabId, (tab) => {
			if (chrome.runtime.lastError) {
				reject(chrome.runtime.lastError);
			}
			resolve(tab);
		});
	});
}

async function isTabReadyAndWebby(tabId) {
	const { url, status } = await getTabInfo(tabId);
	return url.startsWith(`http`) && status === `complete`;
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
	console.log(`tab activated`, tabId);
	const ok = await isTabReadyAndWebby(tabId);
	if (ok) {
		askDate(tabId);
	}
});

chrome.tabs.onUpdated.addListener(async (tabId) => {
	console.log(`tab updated`, tabId);
	const ok = await isTabReadyAndWebby(tabId);
	if (ok) {
		askDate(tabId);
	}
});

chrome.runtime.onMessage.addListener((message, sender) => {
	const tabId = sender.tab.id;
	const tabTitle = sender.tab.title;
	const tabUrl = sender.tab.url;
	console.log(`got a message from tab`, tabId, { tabTitle, tabUrl });
	console.log(message);

	let browserActionStatus = `disable`;
	let iconPath = `icons/icon-gray.png`;
	let badgeText = ``;
	let title = ``;

	if (message.type === `content-date`) {
		const { date } = message;
		if (date && checkDate(date)) {
			const { year, month, day } = parseDate(date);
			browserActionStatus = `enable`;
			iconPath = `icons/icon-black.png`;
			badgeText = `${month}${day}`;
			title = `${year}-${month}-${day}`;
		} else {
			console.log(`date unavailable or unsupported format`, date);
		}
	}

	chrome.browserAction[browserActionStatus](tabId);
	chrome.browserAction.setIcon({ tabId, path: iconPath });
	chrome.browserAction.setBadgeText({ tabId, text: badgeText });
	chrome.browserAction.setTitle({ tabId, title });
});
