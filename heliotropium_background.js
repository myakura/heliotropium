'use strict';

// utility functions

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

async function isTabReady({ tabId = null }) {
	if (!tabId) return false;

	console.log('Fetching tab', tabId);
	const tab = await getTab(tabId);
	if (!tab) return false;

	const { active, url, status } = tab;
	if (!active || !url?.startsWith('http') || status !== 'complete') {
		console.log(`Tab ${tabId} is not ready.`);
		return false;
	}
	return true;
}

function updateBrowserAction({ tabId, enabled = false, badgeText = '', title = '' }) {
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
		if (!response) {
			reject('No response from content script.');
		}
		resolve(response);
	});

	return promise;
}

// extension specific functions

const tabDataStore = new Map();

function logDataStore() {
	console.group(`Current data store: ${tabDataStore.size} items`);
	for (const [url, { tabId, date }] of tabDataStore) {
		console.log({ tabId, url, date });
	}
	console.groupEnd();
}

logDataStore();

function parseDate(dateString) {
	const patterns = [
		// "2001-01-01", "2001/1/1", "2001.01.01", "2001年1月1日"
		/(?<year>\d{4})[-\/.年](?<month>\d{1,2})[-\/.月](?<day>\d{1,2})日?/,

		// matches month-day-year patterns
		// e.g. "March 19th, 1984", "Mar. 19, 1984", etc.
		/(?<month>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?[a-y]{0,6}\s+(?<day>\d{1,2})(st|nd|rd|th)?,?\s+(?<year>\d{4})/i,

		// matches day-month-year patterns
		// e.g. "19th March 1984", "19 Mar 1984"
		/(?<day>\d{1,2})(st|nd|rd|th)?\s+(?<month>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?[a-y]{0,6},?\s+(?<year>\d{4})/i
	];

	const months = {
		jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
		jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
	};

	for (const pattern of patterns) {
		const match = pattern.exec(dateString);
		if (match) {
			const { year, month, day } = match.groups;
			return {
				year,
				month: months[month?.toLowerCase()] || month.padStart(2, '0'),
				day: day.padStart(2, '0'),
			};
		}
	}

	return null;
}

function getOrCreateTabData(tabId) {
	const tabData = [...tabDataStore.values()].find((data) => data.tabId === tabId);

	if (tabData) {
		return {
			tabId,
			url: tabData.url,
			dateString: tabData.dateString,
			date: tabData.date,
		};
	}

	return {
		tabId,
		url: 'Unknown URL',
		dateString: 'N/A',
		date: null,
	};
}

function handleGetDate(tabId, { url, dateString }) {
	console.log('Got a message from tab', tabId, url, dateString);

	if (!dateString) return updateBrowserAction({ tabId });

	const date = parseDate(dateString);
	console.log('Parsed date:', date);
	if (!date) return updateBrowserAction({ tabId });

	tabDataStore.set(url, { tabId, url, dateString, date });

	// use M/D when the length is shorter, MMDD otherwise
	const { year, month, day } = date;
	const monthDay = `${Number(month)}/${Number(day)}`;
	const badgeText = monthDay.length < 5 ? monthDay : monthDay.replace('/', '');

	updateBrowserAction({
		tabId,
		enabled: true,
		badgeText,
		title: `${year}-${month}-${day}`,
	});
}

async function fetchTabDate(tabId) {
	try {
		const response = await sendMessage(tabId, { action: 'get-date' });

		if (response) {
			const date = parseDate(response.dateString);

			const tabData = {
				tabId,
				url: response.url,
				dateString: response.dateString,
				date,
			};

			tabDataStore.set(response.url, tabData);
			return tabData;
		}
	} catch (error) {
		console.log('Error fetching date:', error);
	}

	return null;
}

async function loadTabData(tabId) {
	const cachedData = getOrCreateTabData(tabId);
	if (cachedData.date) return cachedData;

	const tab = await getTab(tabId);
	if (!tab) return null;

	return await fetchTabDate(tabId) || cachedData;
}

async function handleTabEvent(tabId) {
	if (!await isTabReady({ tabId })) return;
	const data = await loadTabData(tabId);
	if (data) handleGetDate(tabId, data);
}

// event handling

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
	if (!sender.tab) {
		console.log('No tab information in sender.');
		return;
	}
	const { id: tabId, title: tabTitle, url: tabUrl } = sender.tab;
	console.group('Got a message from tab', tabId);
	console.log('title:', tabTitle);
	console.log('url:', tabUrl);
	console.log('message:', message);
	console.groupEnd();

	handleGetDate(tabId, message);
});


// handling messages from external extensions

function validateTabIds(tabIds) {
	return Array.isArray(tabIds) && tabIds.length > 0;
}

async function getDatesFromTabs(tabIds) {
	const tabDataPromises = tabIds.map(async (tabId) => {
		try {
			if (await isTabReady({ tabId })) {
				await loadTabData(tabId);
			}
			return getOrCreateTabData(tabId);
		} catch (error) {
			console.log(`Error processing tab ${tabId}:`, error);
			return getOrCreateTabData(tabId);
		}
	});

	const results = await Promise.allSettled(tabDataPromises);
	return results.map((result) => (result.status === 'fulfilled' ? result.value : null)).filter(Boolean);
}


chrome.runtime.onMessageExternal.addListener(async (message, sender, sendResponse) => {
	console.log('Got a message from external extension:');
	console.log(sender);
	console.log(message);

	if (message?.action === 'get-dates') {
		const tabIds = message?.tabIds;

		if (!tabIds || !validateTabIds(tabIds)) {
			console.log('Invalid tabIds provided:', tabIds);
			sendResponse({ error: 'Invalid tabIds provided.' });
			return;
		}

		try {
			console.log('Getting dates from tabs:', tabIds);
			const tabDataArray = await getDatesFromTabs(tabIds);
			console.log('Sending back tab data:', tabDataArray);
			sendResponse({ data: tabDataArray });
		} catch (error) {
			console.error('Error processing external request:', error);
			sendResponse({ error: 'Internal processing error' });
		}
	}

	// indicate that response will be sent asynchronously
	return true;
});
