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
	for (const [url, { tabId, title, date }] of tabDataStore) {
		console.log({ tabId, title, url, date });
	}
	console.groupEnd();
}

logDataStore();


/**
 * Parses a date string into an object with { year, month, day }.
 * @param {string} dateString
 * @returns {object|null}
 */
function parseDate(dateString) {
	const patterns = [
		// matches YYYY-MM-DD-ish patterns
		// e.g. "2001-01-01", "2001/1/1", "2001.01.01", "2001年1月1日"
		/(?<year>\d{4})[-\/\.年](?<month>\d{1,2})[-\/\.月](?<day>\d{1,2})日?/,

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


/**
 * Retrieves cached data if available, otherwise returns a default structure.
 * @param {string} url
 * @returns {{url: string, title: string, dateString: string, date: object|null}}
 */
function getOrCreateTabData(url) {
	return tabDataStore.get(url) || { url, title: 'Untitled', dateString: 'N/A', date: null };
}


/**
 * Handles receiving a date from the content script and updates the cache.
 * @param {number} tabId
 * @param {{url: string, title: string, dateString: string}} message
 */
function handleGetDate(tabId, { url, title, dateString }) {
	console.log('Got a message from tab', tabId, url, title, dateString);

	if (!dateString) return updateBrowserAction({ tabId });

	const date = parseDate(dateString);
	console.log('Parsed date:', date);
	if (!date) return updateBrowserAction({ tabId });

	// Retrieve existing data if available
	const existingData = tabDataStore.get(url) || {};

	// Ensure the cache is updated correctly
	tabDataStore.set(url, {
		url,
		title: title || existingData.title || 'Unknown',
		dateString,
		date,
	});

	// Format badge text
	const { year, month, day } = date;
	const monthDay = `${Number(month)}/${Number(day)}`;
	const badgeText = monthDay.length < 5 ? monthDay : monthDay.replace('/', '');

	// Update browser action UI
	updateBrowserAction({
		tabId,
		enabled: true,
		badgeText,
		title: `${year}-${month}-${day}`,
	});
}


/**
 * Fetches a fresh date from the content script and updates the cache.
 * @param {number} tabId
 * @param {string} url
 * @returns {Promise<object|null>}
 */
async function fetchTabDate(tabId, url) {
	try {
		const response = await sendMessage(tabId, { action: 'get-date' });

		if (response) {
			const { title, dateString } = response;
			const date = parseDate(dateString);

			const tabData = { url, title, dateString, date };
			tabDataStore.set(url, tabData); // Store data by URL
			return tabData;
		}
	} catch (error) {
		console.log(`Error fetching date from content script for tab ${tabId}:`, error);
	}

	return null;
}

/**
 * Loads cached data if available, otherwise fetches a fresh date.
 * @param {number} tabId
 * @returns {Promise<object>}
 */
async function loadTabData(tabId) {
	const tab = await getTab(tabId);
	if (!tab || !tab.url) return { url: 'Unknown URL', title: 'Untitled', dateString: 'N/A', date: null };

	// Try cache first
	const cachedData = tabDataStore.get(tab.url);
	if (cachedData) {
		// Update title if missing
		if (!cachedData.title) cachedData.title = tab.title;
		if (cachedData.date) return cachedData; // Return valid cached data
	}

	// Fetch fresh data if cache is empty
	return await fetchTabDate(tabId, tab.url) || { url: tab.url, title: tab.title, dateString: 'N/A', date: null };
}


/**
 * Processes a tab event (activation/update) by ensuring its date is loaded.
 * @param {number} tabId
 */
async function handleTabEvent(tabId) {
	if (!await isTabReady({ tabId })) return;
	const data = await loadTabData(tabId);
	if (data) handleGetDate(tabId, data);
}

// Event listeners for tab events
chrome.tabs.onActivated.addListener(({ tabId }) => handleTabEvent(tabId));
chrome.tabs.onUpdated.addListener((tabId) => handleTabEvent(tabId));
chrome.tabs.onHighlighted.addListener(({ tabIds }) => {
	console.log('Tabs highlighted', tabIds);
	logDataStore();
});

// event listener for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender) => {
	if (!sender.tab) {
		console.log('No tab information in sender.');
		return;
	}

	const { id: tabId, url, title } = sender.tab;
	console.log(`Received date for tab ${tabId}:`, message.dateString);

	handleGetDate(tabId, { ...message, title });
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

/**
 * Handles requests from external extensions to retrieve tab dates.
 */
chrome.runtime.onMessageExternal.addListener(async (message, sender, sendResponse) => {
	if (message?.action === 'get-dates' && Array.isArray(message.tabIds)) {
		try {
			console.log('External extension requested dates for tabs:', message.tabIds);
			const results = await Promise.all(message.tabIds.map(loadTabData));
			sendResponse({ data: results });
		} catch (error) {
			console.error('Error processing external request:', error);
			sendResponse({ error: 'Internal processing error' });
		}
		// keep the channel open for async response
		return true;
	}
});
