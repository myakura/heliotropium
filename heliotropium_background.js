'use strict';

const tabDataStore = new Map();

function logDataStore() {
	console.group(`Current data store: ${tabDataStore.size} items`);
	for (const [url, data] of tabDataStore) {
		const { tabId, date } = data;
		console.log({ tabId, url, date });
	}
	console.groupEnd();
}

logDataStore();

function parseYYYYMMDD(dateString) {
	// "2001-01-01", "2001/1/1", "2001.01.01", "2001年1月1日"
	const RE_YYYYMMDD = /(?<year>\d{4})[-\/\.年](?<month>\d{1,2})[-\/\.月](?<day>\d{1,2})日?/;

	const match = RE_YYYYMMDD.exec(dateString);
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

	tabDataStore.set(message.url, { tabId, ...message });

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
	const badgeText = monthDay.length < 5 ? monthDay : monthDay.replace('/', '');
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
		: 'icons/icon_lightgray.png';
	chrome.browserAction[method](tabId);
	chrome.browserAction.setIcon({ tabId, path: icon });
	chrome.browserAction.setBadgeText({ tabId, text: badgeText });
	chrome.browserAction.setBadgeBackgroundColor({ tabId, color: '#36f' });
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

async function handleTabEvent(tabId) {
	console.log('Handling tab event for', tabId);

	if (!await isTabReady({ tabId })) return;

	const data = await processTabData(tabId);
	if (data) {
		handleGetDate(tabId, data);
	} else {
		console.log('No valid data found or retrieved for tab', tabId);
	}
}

async function processTabData(tabId) {
	const tab = await getTab(tabId);
	if (!tab) return null;

	const cachedData = tabDataStore.get(tab.url);
	if (cachedData) {
		console.log('Using cached data for', tabId, cachedData);
		return cachedData;
	}

	return await fetchTabDateFromContentScript(tabId);
}

async function fetchTabDateFromContentScript(tabId) {
	console.log('No cache match found for', tabId);
	const response = await sendMessage(tabId, { action: 'get-date' });

	if (response) {
		console.log('Received date from content script:', response);
		tabDataStore.set(response.url, { tabId, ...response });
		return response;
	}

	console.log('No date received from content script.');
	return null;
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
	handleTabEvent(tabId);
});

chrome.tabs.onUpdated.addListener((tabId) => {
	handleTabEvent(tabId);
});

chrome.tabs.onHighlighted.addListener(({ tabIds }) => {
	console.log('Tabs highlighted', tabIds);
	logDataStore();
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


chrome.runtime.onConnectExternal.addListener((port) => {
	console.log('Connected to external extension:');
	console.dir(port);

	port.onMessage.addListener(async (message) => {
		console.log('Got a message from external extension:');
		console.dir(message);

		if (message?.action === 'get-dates-from-selected-tabs') {
			const tabIds = message?.tabIds;

			if (!validateTabIds(tabIds)) {
				port.postMessage({ error: 'Invalid tabIds provided.' });
				return;
			}

			const tabDataArray = await getDatesFromTabs(tabIds);
			port.postMessage({ action: 'dates-from-selected-tabs', data: tabDataArray });
		}
	});
});

function validateTabIds(tabIds) {
	return Array.isArray(tabIds) && tabIds.length > 0;
}

async function getDatesFromTabs(tabIds) {
	const tabDataPromises = tabIds.map(async (tabId) => {
		try {
			if (!await isTabReady({ tabId })) {
				const tabData = await processTabData(tabId);
				return formatTabData(tabId, tabData);
			}
			return formatTabData(tabId, null);
		} catch (error) {
			console.log(`Error processing tab ${tabId}:`, error);
			return formatTabData(tabId, null);
		}
	});

	const results = await Promise.allSettled(tabDataPromises);

	return results.map((result) => {
		return result.status === 'fulfilled' ? result.value : null;
	}).filter(Boolean);
}

function formatTabData(tabId, tabData) {
	if (tabData && tabData.date) {
		return { tabId, url: tabData.url, date: tabData.date };
	}
	return { tabId, url: tabData?.url || 'Unknown URL', date: 'N/A' };
}
