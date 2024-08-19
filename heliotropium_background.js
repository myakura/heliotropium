'use strict';

function parseDateYYYYMMDD(dateString) {
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

function parseFuzzyDateString(dateString) {
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
	const result = parseDateYYYYMMDD(string) ?? parseFuzzyDateString(string);
	return result;
}

function handleMessage(tabId, message) {
	const { date } = message;
	const parsedDate = parseDate(date);

	if (!parsedDate) {
		console.log('date unavailable.');
		updateBrowserAction({ tabId });
	}

	const { year, month, day } = parsedDate;
	let monthDay = `${Number(month)}/${Number(day)}`;
	updateBrowserAction({
		tabId,
		enabled: true,
		badgeText: monthDay.length < 5 ? monthDay : monthDay.replace('/', ''),
		title: `${year}-${month}-${day}`,
	});
}

function getTabInfo(tabId) {
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
		console.log('No `tab` nor `tabId` available');
		return false;
	}
	if (!tab && tabId) {
		console.log(`fetching tab info: ${tabId}`);
		tab = await getTabInfo(tabId);
	}

	console.log('tab', tab);
	const { active, url, status } = tab;

	if (!active) {
		console.log('Tab is not active.');
		return false;
	}
	if (!url.startsWith('http')) {
		console.log('Tab is not a web page.');
		return false;
	}
	if (status !== 'complete') {
		console.log(`Tab hasn't finished loading.`);
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

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
	console.log('tab activated', tabId);

	if (!await isTabReady({ tabId })) {
		console.log('tab not ready.');
		return;
	}

	chrome.tabs.sendMessage(tabId, { action: 'get-date' }, (response) => {
		console.log('got response from tab', tabId, response);
		handleMessage(tabId, response);
	});
});

chrome.tabs.onUpdated.addListener(async (tabId) => {
	console.log('tab updated', tabId);

	if (!await isTabReady({ tabId })) {
		console.log('tab not ready.');
		return;
	}

	chrome.tabs.sendMessage(tabId, { action: 'get-date' }, (response) => {
		console.log('got response from tab', tabId, response);
		handleMessage(tabId, response);
	});
});

chrome.runtime.onMessage.addListener((message, sender) => {
	const { id: tabId, title: tabTitle, url: tabUrl } = sender.tab;
	console.group('got a message from tab', tabId);
	console.log('title:', tabTitle);
	console.log('url:', tabUrl);
	console.log('message:', message);
	console.groupEnd();

	handleMessage(tabId, message);
});
