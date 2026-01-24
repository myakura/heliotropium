'use strict';


// ============================================================================
// Model: URL-based date cache
// ============================================================================

/**
 * @typedef {Object} DateCacheEntry
 * @property {string} url
 * @property {string} title
 * @property {string} dateString
 * @property {{ year: string, month: string, day: string } | null} date
 */

/**
 * External API response type (adds tabId to DateCacheEntry).
 * @typedef {DateCacheEntry & { tabId: number }} TabDateInfo
 */

/** @type {Map<string, DateCacheEntry>} URL → date info cache */
const urlDateCache = new Map();

/** @type {Map<number, string>} tabId → URL mapping */
const tabUrlMap = new Map();

/**
 * Normalizes a URL for cache key.
 * Keeps hash fragment as some pages have different dates per hash.
 * @param {string} url
 * @returns {string}
 */
function normalizeUrl(url) {
	// for now, just return the URL as-is.
	// future normalization (e.g. removing UTM parameters) can be added here.
	return url;
}

/**
 * Gets cached date data for a URL.
 * @param {string} url
 * @returns {DateCacheEntry | undefined}
 */
function getCachedData(url) {
	return urlDateCache.get(normalizeUrl(url));
}

/**
 * Sets date data in cache and updates UI for the tab.
 * @param {string} url
 * @param {DateCacheEntry} data
 */
function setCachedData(url, data) {
	console.log('Caching data for', url, '\n', data);
	urlDateCache.set(normalizeUrl(url), data);
}

/**
 * Gets the stored data for a tab (from cache via URL).
 * @param {number} tabId
 * @returns {DateCacheEntry | undefined}
 */
function getTabData(tabId) {
	const url = tabUrlMap.get(tabId);
	return url ? getCachedData(url) : undefined;
}

/**
 * Associates a tab with a URL and triggers UI update.
 * @param {number} tabId
 * @param {string} url
 * @param {DateCacheEntry} data
 */
function setTabData(tabId, url, data) {
	tabUrlMap.set(tabId, normalizeUrl(url));
	setCachedData(url, data);
	updateActionForTab(tabId);
}

/**
 * Clears the tab-URL association and triggers UI update.
 * @param {number} tabId
 */
function clearTabData(tabId) {
	tabUrlMap.delete(tabId);
	updateActionForTab(tabId);
}

// Clean up tab mapping when tabs are closed (cache remains for future use)
chrome.tabs.onRemoved.addListener((tabId) => {
	tabUrlMap.delete(tabId);
});


// ============================================================================
// View: Action button UI
// ============================================================================

/**
 * Updates the action button based on stored tab data.
 * @param {number} tabId
 */
async function updateActionForTab(tabId) {
	const data = getTabData(tabId);

	if (!data?.date) {
		await setActionDisabled(tabId);
		return;
	}

	const { year, month, day } = data.date;
	const badgeText = formatBadgeText(month, day);
	const title = `${year}-${month}-${day}`;

	await setActionEnabled(tabId, badgeText, title);
}

/**
 * Formats the badge text to fit in the limited space.
 * @param {string} month
 * @param {string} day
 * @returns {string}
 */
function formatBadgeText(month, day) {
	// Prefers shorter "M/D" string so that it fits in the badge; "MMDD" otherwise.
	// e.g. "1/1" over "0101" but "1212" over "12/12".
	const monthDay = `${Number(month)}/${Number(day)}`;
	return monthDay.length < 5 ? monthDay : monthDay.replace('/', '');
}

/**
 * Gets the appropriate icon path based on enabled state.
 * @param {boolean} enabled
 * @returns {string}
 */
function getIconPath(enabled) {
	if (!enabled) return 'icons/icon_lightgray.png';

	if (typeof window !== 'undefined') {
		return window.matchMedia('(prefers-color-scheme: light)').matches
			? 'icons/icon_black.png'
			: 'icons/icon_white.png';
	}
	return 'icons/icon_gray.png';
}

/**
 * Sets the action button to enabled state.
 * @param {number} tabId
 * @param {string} badgeText
 * @param {string} title
 */
async function setActionEnabled(tabId, badgeText, title) {
	await chrome.action.enable(tabId);
	await chrome.action.setIcon({ tabId, path: getIconPath(true) });
	await chrome.action.setBadgeText({ tabId, text: badgeText });
	await chrome.action.setBadgeBackgroundColor({ tabId, color: '#36f' });
	await chrome.action.setTitle({ tabId, title });
}

/**
 * Sets the action button to disabled state.
 * @param {number} tabId
 */
async function setActionDisabled(tabId) {
	await chrome.action.disable(tabId);
	await chrome.action.setIcon({ tabId, path: getIconPath(false) });
	await chrome.action.setBadgeText({ tabId, text: '' });
	await chrome.action.setTitle({ tabId, title: '' });
}


// ============================================================================
// Date parsing utilities
// ============================================================================

/**
 * Parses a date string into an object with { year, month, day }.
 *
 * @param {string} dateString
 * @returns {{ year: string, month: string, day: string } | null}
 */
function parseDate(dateString) {
	const patterns = [
		// matches "YYYY-MM-DD"-ish patterns
		// e.g. "2001-01-01", "2001/1/1", "2001.01.01", "2001年1月1日"
		/(?<year>\d{4})[-\/\.年](?<month>\d{1,2})[-\/\.月](?<day>\d{1,2})日?/,

		// matches "month-day-year" patterns
		// e.g. "March 19th, 1984", "Mar. 19, 1984", etc.
		/(?<month>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?[a-y]{0,6}\s+(?<day>\d{1,2})(st|nd|rd|th)?,?\s+(?<year>\d{4})/i,

		// matches "day-month-year" patterns
		// e.g. "19th March 1984", "19 Mar 1984"
		/(?<day>\d{1,2})(st|nd|rd|th)?\s+(?<month>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?[a-y]{0,6},?\s+(?<year>\d{4})/i
	];

	const months = {
		jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
		jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
	};

	for (const pattern of patterns) {
		const match = pattern.exec(dateString);
		if (match?.groups) {
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


// ============================================================================
// Tab readiness check
// ============================================================================

/**
 * Checks if a tab is ready for date extraction.
 * @param {number} tabId
 * @param {boolean} [checkActive=true]
 * @returns {Promise<boolean>}
 */
async function isTabReady(tabId, checkActive = true) {
	if (!tabId) return false;

	try {
		const tab = await chrome.tabs.get(tabId);
		if (!tab) return false;

		const { active, url, status } = tab;
		const isReady = (!checkActive || active) && url?.startsWith('http') && status === 'complete';

		if (!isReady) {
			console.log('Tab', tabId, 'is not ready.\n', { url, status, active });
		}

		return isReady;
	}
	catch (error) {
		console.log('Error checking tab', tabId, '\n', error);
		return false;
	}
}


// ============================================================================
// Data fetching from content script
// ============================================================================

/**
 * Fetches date information from a tab's content script.
 * @param {number} tabId
 * @returns {Promise<DateCacheEntry | null>}
 */
async function fetchDateFromTab(tabId) {
	try {
		const tab = await chrome.tabs.get(tabId);
		if (!tab?.url) return null;

		// Inject content script
		await chrome.scripting.executeScript({
			target: { tabId },
			files: ['heliotropium_content.js'],
		});

		const response = await chrome.tabs.sendMessage(tabId, { action: 'get-date' });

		if (response?.dateString) {
			console.log('Received response from tab', tabId, '\n', response);
			return {
				url: tab.url,
				title: response.title || tab.title || 'Untitled',
				dateString: response.dateString,
				date: parseDate(response.dateString),
			};
		}
	}
	catch (error) {
		console.log('Error fetching date from tab', tabId, '\n', error);
	}

	return null;
}

/**
 * Creates a default (empty) TabDateInfo for a tab.
 * @param {number} tabId
 * @returns {Promise<TabDateInfo>}
 */
async function createEmptyTabData(tabId) {
	let url = 'Unknown URL';
	let title = 'Untitled';

	try {
		const tab = await chrome.tabs.get(tabId);
		url = tab?.url || url;
		title = tab?.title || title;
	}
	catch { /* ignore */ }

	return { tabId, url, title, dateString: 'N/A', date: null };
}


// ============================================================================
// Controller: Event handling and data flow
// ============================================================================

/**
 * Loads and stores date data for a tab.
 * Uses cache if available, otherwise fetches from content script.
 * @param {number} tabId
 */
async function loadAndStoreTabData(tabId) {
	const tab = await chrome.tabs.get(tabId);
	if (!tab?.url) {
		clearTabData(tabId);
		return;
	}

	const url = tab.url;

	// Check cache first
	const cached = getCachedData(url);
	if (cached) {
		console.log('Cache hit for', url, '\n', cached);
		tabUrlMap.set(tabId, normalizeUrl(url));
		updateActionForTab(tabId);
		return;
	}

	// Fetch from content script
	const data = await fetchDateFromTab(tabId);

	if (data) {
		setTabData(tabId, url, data);
	}
	else {
		clearTabData(tabId);
	}
}

/**
 * Handles tab activation and update events.
 * @param {number} tabId
 */
async function handleTabEvent(tabId) {
	try {
		if (!await isTabReady(tabId)) {
			clearTabData(tabId);
			return;
		}

		await loadAndStoreTabData(tabId);
	}
	catch (error) {
		console.error('Error handling tab event for tab', tabId, '\n', error);
		clearTabData(tabId);
	}
}

/**
 * Handles date data received directly from content script message.
 * @param {number} tabId
 * @param {string} url
 * @param {string} title
 * @param {string} dateString
 */
function handleContentScriptMessage(tabId, url, title, dateString) {
	if (!dateString) {
		clearTabData(tabId);
		return;
	}

	const date = parseDate(dateString);
	const data = { url, title, dateString, date };
	setTabData(tabId, url, data);
}


// ============================================================================
// Event listeners
// ============================================================================

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
	await handleTabEvent(tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
	if (changeInfo.status === 'complete') {
		await handleTabEvent(tabId);
	}
	else if (changeInfo.status === 'loading') {
		clearTabData(tabId);
	}
});

chrome.runtime.onMessage.addListener((message, sender) => {
	if (!sender.tab) {
		console.log('No tab information in sender.');
		return;
	}

	const { id: tabId, url, title } = sender.tab;
	console.log('Received message from tab', tabId, url, '\n', message);

	handleContentScriptMessage(tabId, url, title || 'Untitled', message.dateString);
});


// ============================================================================
// External extension API
// ============================================================================

/**
 * Retrieves dates for multiple tabs, using cache when available.
 * @param {number[]} tabIds
 * @returns {Promise<TabDateInfo[]>}
 */
async function getDatesFromTabs(tabIds) {
	const results = await Promise.all(
		tabIds.map(async (tabId) => {
			try {
				const tab = await chrome.tabs.get(tabId);
				if (!tab?.url) {
					return await createEmptyTabData(tabId);
				}

				// Check cache first
				const cached = getCachedData(tab.url);
				if (cached) {
					console.log('Cache hit for tab', tabId, { url: tab.url });
					return { tabId, ...cached };
				}

				// Fetch from content script
				if (await isTabReady(tabId, false)) {
					const data = await fetchDateFromTab(tabId);
					if (data) {
						setCachedData(tab.url, data);
						return { tabId, ...data };
					}
				}
				return await createEmptyTabData(tabId);
			}
			catch (error) {
				console.log('Error processing tab', tabId, { error });
				return await createEmptyTabData(tabId);
			}
		})
	);

	return results.filter(Boolean);
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
	const { action, tabIds } = message;

	if (action === 'get-dates' && Array.isArray(tabIds) && tabIds.length > 0) {
		console.log('External extension requested dates for tabs:', tabIds);

		// This needs to be a non-async function
		// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage#sending_an_asynchronous_response_using_sendresponse
		getDatesFromTabs(tabIds)
			.then((results) => {
				console.log('Sending response back:', { data: results });
				sendResponse({ data: results });
			})
			.catch((error) => {
				console.error('Error processing external request:', error);
				sendResponse({ error: 'Internal processing error' });
			});

		// Return true to keep the message channel open for the asynchronous response.
		return true;
	}

	sendResponse({ error: 'Invalid request: missing or invalid tabIds.' });
});
