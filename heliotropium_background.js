function parseDate(date) {
	const re = /^(?<year>\d{4})[-\/\.](?<month>\d{2})[-\/\.](?<day>\d{2})/;
	const { year, month, day } = re.exec(date).groups;
	return { year, month, day };
}

function askDate(tabId) {
	const message = { action: `get-date` };
	chrome.tabs.sendMessage(tabId, message);
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
	console.log(`tab activated`, tabId);
	askDate(tabId);
});

chrome.tabs.onUpdated.addListener((tabId) => {
	console.log(`tab updated`, tabId);
	askDate(tabId);
});

chrome.runtime.onMessage.addListener((message, sender) => {
	const tabId = sender.tab.id;
	const tabTitle = sender.tab.title;
	const tabUrl = sender.tab.url;
	console.log(`got a message from tab`, tabId, { tabTitle, tabUrl });
	console.log(message);
	let iconPath = `icons/icon-gray.png`;
	let browserActionStatus = `disable`;
	let badgeText = ``;
	let title = ``;
	if (message.type === `content-date`) {
		const { status, date } = message;
		if (status === `OK`) {
			iconPath = `icons/icon-black.png`;
			browserActionStatus = `enable`;
			const { year, month, day } = parseDate(date);
			badgeText = `${month}${day}`;
			title = `${year}-${month}-${day}`;
		}
	}
	chrome.browserAction[browserActionStatus](tabId);
	chrome.browserAction.setIcon({ tabId, path: iconPath });
	chrome.browserAction.setBadgeText({ tabId, text: badgeText });
	chrome.browserAction.setTitle({ tabId, title });
});
