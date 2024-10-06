'use strict';

function parseYYYYMMDD(dateString) {
	// "2001-01-01", "2001/1/1", "2001.01.01", "2001年1月1日"
	const RE_YYYYMMDD = /(?<year>\d{4})[-\/\.年](?<month>\d{1,2})[-\/\.月](?<day>\d{1,2})日?/;

	let match = RE_YYYYMMDD.exec(dateString);
	if (!match) return null;

	const { year, month, day } = match.groups;

	return {
		year,
		month: month.padStart(2, '0'),
		day: day.padStart(2, '0'),
	};
}

function parseFuzzyDate(dateString) {
	// matches month-day-year patterns
	// e.g. "March 19th, 1984", "Mar. 19, 1984", etc.
	const RE_MONTH_DAY_YEAR = /(?<month>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?[a-y]{0,6}\s+(?<day>\d{1,2})(st|nd|rd|th)?,?\s+(?<year>\d{4})/i;

	// matches day-month-year patterns
	// e.g. "19th March 1984", "19 Mar 1984"
	const RE_DAY_MONTH_YEAR = /(?<day>\d{1,2})(st|nd|rd|th)?\s+(?<month>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?[a-y]{0,6},?\s+(?<year>\d{4})/i;

	const regexes = [RE_MONTH_DAY_YEAR, RE_DAY_MONTH_YEAR];

	const monthsMap = {
		jan: '1', feb: '2', mar: '3', apr: '4', may: '5', jun: '6',
		jul: '7', aug: '8', sep: '9', oct: '10', nov: '11', dec: '12'
	};

	let match;
	for (const regex of regexes) {
		match = regex.exec(dateString);
		if (match) break;
	}
	if (!match) return null;

	const { year, month, day } = match.groups;

	return {
		year: year,
		month: monthsMap[month.toLowerCase()].padStart(2, '0'),
		day: day.padStart(2, '0'),
	};
}

function parseDate(string) {
	const result = parseYYYYMMDD(string) ?? parseFuzzyDate(string);
	return result;
}

function handleGetDate(tabId, message) {
	console.log('Got a message from tab', tabId, message);
	if (!message) {
		console.log('Message is empty.');
		updateBrowserAction({ tabId });
		return;
	}

	if (message.date === undefined) {
		console.log('Date is unavailable.');
		updateBrowserAction({ tabId });
		return;
	}

	console.log('Parsing date:', message.date);
	const { date } = message;
	const parsedDate = parseDate(date);

	if (!parsedDate) {
		console.log('Date unavailable.');
		updateBrowserAction({ tabId });
		return;
	}

	console.log('Parsed date:', parsedDate);
	const { year, month, day } = parsedDate;

	// prefers shorter month-day format for the badge
	// if M/D is acceptable, use it; otherwise, use MMDD
	const monthDay = `${Number(month)}/${Number(day)}`;
	const badgeText = monthDay.length < 5 ? monthDay : monthDay.replace('/', '')
	updateBrowserAction({
		tabId,
		enabled: true,
		badgeText,
		title: `${year}-${month}-${day}`,
	});
	console.log('Updated badge:', badgeText);
}

function getTab(tabId) {
	const { promise, resolve, reject } = Promise.withResolvers();
	chrome.tabs.get(tabId, (tab) => {
		if (chrome.runtime.lastError) {
			reject(chrome.runtime.lastError.message);
		}
		resolve(tab);
	});

	return promise;
}

async function isTabReady({ tab = null, tabId = null }) {
	if (!tab && !tabId) {
		console.log('No `tab` nor `tabId` provided.');
		return false;
	}

	if (!tab && tabId) {
		console.log('Fetching tab', tabId);
		tab = await getTab(tabId);
	}
	console.log('Fetched tab', tabId, tab);

	const { active, url, status } = tab;

	if (!active) {
		console.log('Tab', tabId, 'is not active.');
		return false;
	}
	if (!url.startsWith('http')) {
		console.log('Tab', tabId, 'is not a web page.');
		return false;
	}
	if (status !== 'complete') {
		console.log('Tab', tabId, 'has not finished loading.');
		return false;
	}

	return true;
}

function updateBrowserAction({
	tabId,
	enabled = false,
	badgeText = '',
	title = '',
}) {
	const method = enabled ? 'enable' : 'disable';
	const icon = enabled
		? window.matchMedia('(prefers-color-scheme: light)').matches
			? 'icons/icon_black.png'
			: 'icons/icon_white.png'
		: 'icons/icon_gray.png';
	chrome.browserAction[method](tabId);
	chrome.browserAction.setIcon({ tabId, path: icon });
	chrome.browserAction.setBadgeText({ tabId, text: badgeText });
	chrome.browserAction.setBadgeBackgroundColor({ tabId, color: '#36f' })
	chrome.browserAction.setTitle({ tabId, title });
}

function sendMessage(tabId, message) {
	const { promise, resolve, reject } = Promise.withResolvers();

	console.log('Sending message to tab', tabId, message);
	chrome.tabs.sendMessage(tabId, message, (response) => {
		if (chrome.runtime.lastError) {
			reject(chrome.runtime.lastError.message);
		}
		resolve(response);
	});

	return promise;
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
	console.log('Tab activated', tabId);

	const tabReady = await isTabReady({ tabId });
	if (!tabReady) {
		// console.log('Tab is not ready.', tabId);
		return;
	}

	const response = await sendMessage(tabId, { action: 'get-date' });
	handleGetDate(tabId, response);
});

chrome.tabs.onUpdated.addListener(async (tabId) => {
	console.log('Tab updated', tabId);

	const tabReady = await isTabReady({ tabId });
	if (!tabReady) {
		// console.log('Tab is not ready.', tabId);
		return;
	}

	const response = await sendMessage(tabId, { action: 'get-date' });
	handleGetDate(tabId, response);
});

chrome.tabs.onHighlighted.addListener(async ({ tabIds }) => {
	console.log('Tab highlighted', tabIds);
});

chrome.runtime.onMessage.addListener((message, sender) => {
	const { id: tabId, title: tabTitle, url: tabUrl } = sender.tab;
	console.group('Got a message from tab', tabId);
	console.log('title:', tabTitle);
	console.log('url:', tabUrl);
	console.log('message:', message);
	console.groupEnd();

	handleGetDate(tabId, message);
});
