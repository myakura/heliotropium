'use strict';

function parseDateYYYYMMDD(date) {
	// e.g. "2001-01-01", "2001/1/1", "2001.01.01", "2001年1月1日"
	const re = /(?<year>\d{4})[-\/\.年](?<month>\d{1,2})[-\/\.月](?<day>\d{1,2})日?/;
	const { year, month, day } = re.exec(date).groups;
	return {
		year,
		month: month.padStart(2, `0`),
		day: day.padStart(2, `0`),
	};
}

function sendGetDate(tabId) {
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
		console.log(`tab`, tabId, `is ready. sending message...`);
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
	const icon = enabled
		? window.matchMedia(`(prefers-color-scheme: light)`).matches
			? `icons/icon_black.png`
			: `icons/icon_white.png`
		: `icons/icon_gray.png`;
	chrome.browserAction[method](tabId);
	chrome.browserAction.setIcon({ tabId, path: icon });
	chrome.browserAction.setBadgeText({ tabId, text: badgeText });
	chrome.browserAction.setBadgeBackgroundColor({ tabId, color: `#36f` })
	chrome.browserAction.setTitle({ tabId, title });
}

function handleMessage(tabId, message) {
	let browserActionProps = { tabId };
	const { date } = message;
	if (date) {
		const { year, month, day } = parseDateYYYYMMDD(date);
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
			console.log(`tab`, tabId, `is ready. sending message...`);
			sendGetDate(tabId);
		});
	});
});

chrome.tabs.onUpdated.addListener((tabId) => {
	console.log(`tab updated`, tabId);
	getTabInfo(tabId, (tab) => {
		isTabReadyAndWebby(tab, (tabId) => {
			console.log(`tab`, tabId, `is ready. sending message...`);
			sendGetDate(tabId);
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
