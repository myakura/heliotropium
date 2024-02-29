'use strict';

// "2001-01-01", "2001/1/1", "2001.01.01", "2001年1月1日"
const RE_YYYYMMDD = /(?<year>\d{4})[-\/\.年](?<month>\d{1,2})[-\/\.月](?<day>\d{1,2})日?/;

// "March 19th, 1984", "Mar. 19, 1984", etc.
const RE_MONTH_DAY_YEAR = /(?<month>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?[a-y]{0,6}\s+(?<day>\d{1,2})(st|nd|rd|th)?,?\s+(?<year>\d{4})/i;

// "19th March 1984", "19 Mar 1984", etc.
const RE_DAY_MONTH_YEAR = /(?<day>\d{1,2})(st|nd|rd|th)?\s+(?<month>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?[a-y]{0,6},?\s+(?<year>\d{4})/i;

function isAcceptedDateYYYYMMDD(string) {
	return RE_YYYYMMDD.test(string);
}

function isAcceptedFuzzyDateString(string) {
	return RE_MONTH_DAY_YEAR.test(string) || RE_DAY_MONTH_YEAR.test(string);
}

function isAcceptedDate(string) {
	return isAcceptedDateYYYYMMDD(string) || isAcceptedFuzzyDateString(string);
}

function parseDateYYYYMMDD(dateString) {
	const { year, month, day } = RE_YYYYMMDD.exec(dateString).groups;
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
	const regexes = [RE_MONTH_DAY_YEAR, RE_DAY_MONTH_YEAR];
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
	}
	if (isAcceptedFuzzyDateString(string)) {
		return parseFuzzyDateString(string);
	}
	return null;
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

function sendGetDate(tab) {
	const { id: tabId, active, url, status } = tab;
	if (active && url.startsWith(`http`) && status === `complete`) {
		console.log(`tab`, tabId, `is ready. sending message...`);
		chrome.tabs.sendMessage(tabId, { action: `get-date` });
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
	const { date } = message;
	if (date && isAcceptedDate(date)) {
		const { year, month, day } = parseDate(date);
		updateBrowserAction({
			tabId,
			enabled: true,
			badgeText: `${month}${day}`,
			title: `${year}-${month}-${day}`,
		});
	} else {
		console.log(`date unavailable.`);
		updateBrowserAction({ tabId });
	}
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
	console.log(`tab activated`, tabId);
	getTabInfo(tabId, sendGetDate);
});

chrome.tabs.onUpdated.addListener((tabId) => {
	console.log(`tab updated`, tabId);
	getTabInfo(tabId, sendGetDate);
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
