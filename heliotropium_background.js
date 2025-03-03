'use strict';

// utility functions

/**
 * Checks if a tab is active, has a valid HTTP/HTTPS URL, and is fully loaded.
 *
 * @param {{ tabId: number }} options
 * @returns {Promise<boolean>}
 */
async function isTabReady({ tabId }) {
	if (!tabId) return false;
	console.log('Fetching tab', tabId);

	const tab = await chrome.tabs.get(tabId);
	if (!tab) return false;

	const { active, url, status } = tab;

	if (!active || !url?.startsWith('http') || status !== 'complete') {
		console.log(`Tab ${tabId} is not ready. active: ${active}, url: ${url}, status: ${status}`);
		return false;
	}

	return true;
}

/**
 * Updates the action button for a specific tab.
 *
 * @param {{ tabId: number, enabled?: boolean, badgeText?: string, title?: string }} options -
 * Object containing tab ID and optional properties:
 * - `enabled` (boolean): Whether to enable or disable the browser action.
 * - `badgeText` (string): The text to display on the badge.
 * - `title` (string): The title for the browser action tooltip.
 */
function updateAction({ tabId, enabled = false, badgeText = '', title = '' }) {
	const method = enabled ? 'enable' : 'disable';
	const icon = enabled
		? (typeof window !== 'undefined')
			? (window.matchMedia('(prefers-color-scheme: light)').matches)
				? 'icons/icon_black.png'
				: 'icons/icon_white.png'
			: 'icons/icon_gray.png'
		: 'icons/icon_lightgray.png';
	chrome.action[method](tabId);
	chrome.action.setIcon({ tabId, path: icon });
	chrome.action.setBadgeText({ tabId, text: badgeText });
	chrome.action.setBadgeBackgroundColor({ tabId, color: '#36f' });
	chrome.action.setTitle({ tabId, title });
}

// extension specific functions

// Using tab IDs as keys so that each tab’s data remains separate.
const tabDataStore = new Map();

function logDataStore() {
	console.group(`Current data store: ${tabDataStore.size} items`);
	for (const [tabId, { url, title, date, dateString }] of tabDataStore) {
		console.log({ tabId, title, url, date, dateString });
	}
	console.groupEnd();
}

logDataStore();

/**
 * Retrieves cached data if available, otherwise returns a default structure.
 * @param {number} tabId
 * @param {string} url
 * @returns {{ tabId: number, url: string, title: string, dateString: string, date: object|null }}
 */
function getOrCreateTabData(tabId, url) {
	const result = tabDataStore.get(tabId) || {
		tabId,
		url,
		title: '',
		dateString: 'N/A',
		date: null,
	};
	return result;
}

/**
 * Parses a date string into an object with { year, month, day }.
 *
 * @param {string} dateString - The date string to parse.
 * @returns {{ year: string, month: string, day: string } | null}
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
		if (match && match.groups) {
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
 * Handles receiving a date from the content script and updates the cache.
 * @param {number} tabId
 * @param {{url: string, title: string, dateString: string}} message
 */
function handleGetDate(tabId, { url, title, dateString }) {
	console.log('Got a message from tab', tabId, url, title, dateString);
	if (!dateString) return updateAction({ tabId });

	const date = parseDate(dateString);
	console.log('Parsed date:', date);
	if (!date) return updateAction({ tabId });

	const existingData = getOrCreateTabData(tabId, url);

	// update cache
	tabDataStore.set(tabId, {
		...existingData,
		title: title || existingData.title,
		dateString,
		date,
	});

	const { year, month, day } = date;

	// Use M/D when the length is shorter, or MMDD otherwise.
	const monthDay = `${Number(month)}/${Number(day)}`;
	const badgeText = monthDay.length < 5 ? monthDay : monthDay.replace('/', '');

	updateAction({
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
 * @returns {Promise<{ tabId: number, url: string, title: string, dateString: string, date: object|null } | null>}
 */
async function fetchTabDate(tabId, url) {
	try {
		const response = await chrome.tabs.sendMessage(tabId, { action: 'get-date' });

		if (response) {
			console.log('Received response from tab', tabId, response);
			const { title, dateString } = response;
			const date = parseDate(dateString);
			const tabData = { tabId, url, title, dateString, date };
			tabDataStore.set(tabId, tabData);

			return tabData;
		}
	}
	catch (error) {
		console.log(`Error fetching date from content script for tab ${tabId}:`, error);
	}

	return null;
}

/**
 * Loads cached data if available, otherwise fetches a fresh date.
 * @param {number} tabId
 * @returns {Promise<{ tabId: number, url: string, title: string, dateString: string, date: object|null }>}
 */
async function loadTabData(tabId) {
	const tab = await chrome.tabs.get(tabId);

	if (!tab || !tab.url) {
		return { tabId, url: 'Unknown URL', title: 'Untitled', dateString: 'N/A', date: null };
	}

	// Try cache first using tabId as key.
	const cachedData = tabDataStore.get(tab.id);
	if (cachedData) {
		// Update title if missing.
		if (!cachedData.title) {
			cachedData.title = tab.title
		};
		if (cachedData.date) {
			return cachedData;
		};
	}

	// Fetch fresh data if cache is empty or date not available.
	return (
		await fetchTabDate(tabId, tab.url) || {
			tabId,
			url: tab.url,
			title: tab.title,
			dateString: 'N/A',
			date: null,
		}
	);
}

/**
 * Processes a tab event (activation/update) by ensuring its date is loaded.
 * @param {number} tabId
 */
async function handleTabEvent(tabId) {
	if (!await isTabReady({ tabId })) return;

	const data = await loadTabData(tabId);

	if (data) {
		handleGetDate(tabId, data)
	};
}

// Event listeners for tab events
chrome.tabs.onActivated.addListener(({ tabId }) => handleTabEvent(tabId));
chrome.tabs.onUpdated.addListener((tabId) => handleTabEvent(tabId));
chrome.tabs.onHighlighted.addListener(({ tabIds }) => {
	console.log('Tabs highlighted', tabIds);
	logDataStore();
});

// Event listener for messages from content scripts.
chrome.runtime.onMessage.addListener((message, sender) => {
	if (!sender.tab) {
		console.log('No tab information in sender.');
		return;
	}

	const { id: tabId, url, title } = sender.tab;
	console.log(`Received date for tab ${tabId}:`, message.dateString);

	handleGetDate(tabId, { ...message, title, url });
});

// Handling messages from external extensions

/**
 * Validates tabIds.
 * @param {Array<any>} tabIds
 * @returns {boolean}
 */
function validateTabIds(tabIds) {
	return Array.isArray(tabIds) && tabIds.length > 0;
}

/**
 * Retrieves dates for multiple tabs.
 * @param {Array<number>} tabIds
 * @returns {Promise<Array<{ tabId: number, url: string, title: string, dateString: string, date: object|null }>>}
 */
async function getDatesFromTabs(tabIds) {
	const tabDataPromises = tabIds.map(async (tabId) => {
		try {
			if (await isTabReady({ tabId })) {
				return await loadTabData(tabId);
			}
		}
		catch (error) {
			console.log(`Error processing tab ${tabId}:`, error);
		}
		return null;
	});

	const results = await Promise.allSettled(tabDataPromises);

	return results
		.map((result) => (result.status === 'fulfilled' ? result.value : null))
		.filter(Boolean);
}

chrome.runtime.onMessageExternal.addListener(async (message, sender, sendResponse) => {
	if (message?.action === 'get-dates' && validateTabIds(message.tabIds)) {
		try {
			console.log('External extension requested dates for tabs:', message.tabIds);
			const results = await Promise.all(message.tabIds.map(loadTabData));
			console.log('Sending response back:', { data: results });
			sendResponse({ data: results });
		}
		catch (error) {
			console.error('Error processing external request:', error);
			sendResponse({ error: 'Internal processing error' });
		}
		// Keep the channel open for async response.
		return true;
	}
	else {
		sendResponse({ error: 'Invalid request: missing or invalid tabIds.' });
	}
});
