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

function askDate(tabId) {
	const message = { action: `get-date` };
	chrome.tabs.sendMessage(tabId, message);
}

function getTabInfo(tabId, callback) {
	if (!tabId) {
		console.log(`no tab with`, tabId);
		return;
	}
	chrome.tabs.get(tabId, (tab) => {
		if (chrome.runtime.lastError) {
			console.error(chrome.runtime.lastError.message);
		} else {
			console.log(`about tab`, tab.id, tab);
			callback(tab);
		}
	});
}

function isTabReadyAndWebby(tab, callback) {
	const { id: tabId, active, url, status } = tab;
	if (active && url.startsWith(`http`) && status === `complete`) {
		console.log(`tab`, tabId, `is ready. asking date...`);
		callback(tabId);
	}
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
	let browserActionProps = { tabId };
	const { date } = message;
	if (date) {
		const { year, month, day } = parseDate(date);
		browserActionProps = {
			tabId,
			enabled: true,
			badgeText: `${month}${day}`,
			title: `${year}-${month}-${day}`,
		};
	} else {
		console.log(`date unavailable.`);
	}
	updateBrowserAction(browserActionProps);
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
	console.log(`tab activated`, tabId);
	getTabInfo(tabId, (tab) => {
		isTabReadyAndWebby(tab, (tabId) => {
			console.log(`tab`, tabId, `is ready. asking date...`);
			askDate(tabId);
		});
	});
});

chrome.tabs.onUpdated.addListener((tabId) => {
	console.log(`tab updated`, tabId);
	getTabInfo(tabId, (tab) => {
		isTabReadyAndWebby(tab, (tabId) => {
			console.log(`tab`, tabId, `is ready. asking date...`);
			askDate(tabId);
		});
	});
});

chrome.runtime.onMessage.addListener((message, sender) => {
	const { id: tabId, title: tabTitle, url: tabUrl } = sender.tab;
	console.group(`got a message from tab`, tabId);
	console.log(`title:`, tabTitle);
	console.log(`url:`, tabUrl);
	console.log(`message:`, message);
	console.groupEnd();

	handleMessage(tabId, message);
});
