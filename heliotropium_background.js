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
	console.log(`got a message`);
	console.log(message);
	console.log(sender);
	if (message.type === `content-date`) {
		const tabId = sender.tab.id;
		const { status, date } = message;
		let badgeText = ``;
		let title = ``;
		if (status === `OK`) {
			chrome.browserAction.enable(tabId);
			const { year, month, day } = parseDate(date);
			badgeText = `${month}${day}`;
			title = `${year}-${month}-${day}`;
		}
		else {
			chrome.browserAction.disable(tabId);
		}
		chrome.browserAction.setBadgeText({ tabId, text: badgeText });
		chrome.browserAction.setTitle({ tabId, title });
	}
});
