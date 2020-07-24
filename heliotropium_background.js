'use strict';

function parseDate(date) {
	const re = /(?<year>\d{4})[-\/\.](?<month>\d{1,2})[-\/\.](?<day>\d{1,2})/;
	const { year, month, day } = re.exec(date).groups;
	return {
		year,
		month: month.padStart(2, `0`),
		day: day.padStart(2, `0`),
	};
}

function checkDate(string) {
	const re = /\d{4}[-\/\.]\d{1,2}[-\/\.]\d{1,2}/;
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

function updateBrowserAction({
	tabId,
	enabled = false,
	badgeText = ``,
	title = ``,
}) {
	const method = enabled ? `enable` : `disable`;
	const iconPath = enabled ? `icons/icon-black.png` : `icons/icon-gray.png`;

	chrome.browserAction[method](tabId);
	chrome.browserAction.setIcon({ tabId, path: iconPath });
	chrome.browserAction.setBadgeText({ tabId, text: badgeText });
	chrome.browserAction.setTitle({ tabId, title });
}

function handleMessage(tabId, message) {
	let baEnabled = false;
	let baBadgeText = ``;
	let baTitle = ``;

	const { date } = message;
	if (!date) {
		console.log(`date unavailable.`);
	} else if (!checkDate(date)) {
		console.log(`malformed date.`, date);
	} else {
		baEnabled = true;
		const { year, month, day } = parseDate(date);
		baBadgeText = `${month}${day}`;
		baTitle = `${year}-${month}-${day}`;
	}
	updateBrowserAction({
		tabId,
		enabled: baEnabled,
		badgeText: baBadgeText,
		title: baTitle,
	});
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
	const { id: tabId, title: tabTitle, url: tabUrl } = sender.tab;
	console.log(`got a message from tab`, tabId, { tabTitle, tabUrl });
	console.log(message);
	handleMessage(tabId, message);
});
