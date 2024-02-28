'use strict';

function isAcceptedDateYYYYMMDD(string) {
	// e.g. "2001-01-01", "2001/1/1", "2001.01.01", "2001年1月1日"
	const re = /(?<year>\d{4})[-\/\.年](?<month>\d{1,2})[-\/\.月](?<day>\d{1,2})日?/;
	return re.test(string);
}

function isAcceptedFuzzyDateString(string) {
	// "March 19th, 1984", "Mar. 19, 1984", etc.
	const reMonthDayYear = /(?<month>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?[a-y]{0,6}\s+(?<day>\d{1,2})(st|nd|rd|th)?,?\s+(?<year>\d{4})/i;
	// "19th March 1984", "19 Mar 1984", etc.
	const reDayMonthYear = /(?<day>\d{1,2})(st|nd|rd|th)?\s+(?<month>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?[a-y]{0,6},?\s+(?<year>\d{4})/i;

	return reMonthDayYear.test(string) || reDayMonthYear.test(string);
}

function isAcceptedDate(string) {
	return isAcceptedDateYYYYMMDD(string) || isAcceptedFuzzyDateString(string);
}

function parseDateYYYYMMDD(dateString) {
	// e.g. "2001-01-01", "2001/1/1", "2001.01.01", "2001年1月1日"
	const re = /(?<year>\d{4})[-\/\.年](?<month>\d{1,2})[-\/\.月](?<day>\d{1,2})日?/;
	const { year, month, day } = re.exec(dateString).groups;
	return {
		year,
		month: month.padStart(2, `0`),
		day: day.padStart(2, `0`),
	};
}

function parseFuzzyDateString(dateString) {
	const monthsMap = {
		jan: '1', feb: '2', mar: '3', apr: '4', may: '5', jun: '6',
		jul: '7', aug: '8', sep: '9', oct: '10', nov: '11', dec: '12'
	};
	// "March 19th, 1984", "Mar. 19, 1984", etc.
	const reMonthDayYear = /(?<month>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?[a-y]{0,6}\s+(?<day>\d{1,2})(st|nd|rd|th)?,?\s+(?<year>\d{4})/i;
	// "19th March 1984", "19 Mar 1984", etc.
	const reDayMonthYear = /(?<day>\d{1,2})(st|nd|rd|th)?\s+(?<month>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?[a-y]{0,6},?\s+(?<year>\d{4})/i;

	const regexes = [reMonthDayYear, reDayMonthYear];
	let match;
	for (const regex of regexes) {
		match = regex.exec(dateString);
		if (match) break;
	}
	if (!match) return null;

	const { year, month, day } = match.groups;

	return {
		year: year,
		month: monthsMap[month.toLowerCase()].padStart(2, `0`),
		day: day.padStart(2, `0`),
	};
}

function parseDate(string) {
	if (isAcceptedDateYYYYMMDD(string)) {
		return parseDateYYYYMMDD(string);
	} else if (isAcceptedFuzzyDateString(string)) {
		return parseFuzzyDateString(string);
	} else {
		return null;
	}
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
	if (date && isAcceptedDate(date)) {
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
