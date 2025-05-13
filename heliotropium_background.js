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
async function updateAction({ tabId, enabled = false, badgeText = '', title = '' }) {
	const method = enabled ? 'enable' : 'disable';
	const icon = enabled
		? (typeof window !== 'undefined')
			? (window.matchMedia('(prefers-color-scheme: light)').matches)
				? 'icons/icon_black.png'
				: 'icons/icon_white.png'
			: 'icons/icon_gray.png'
		: 'icons/icon_lightgray.png';
	await chrome.action[method](tabId);
	await chrome.action.setIcon({ tabId, path: icon });
	await chrome.action.setBadgeText({ tabId, text: badgeText });
	await chrome.action.setBadgeBackgroundColor({ tabId, color: '#36f' });
	await chrome.action.setTitle({ tabId, title });
}

// extension specific functions

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
 * Handles receiving a date from the content script or fetched data.
 * @param {number} tabId
 * @param {{url: string, title: string, dateString: string}} data
 */
async function handleGetDate(tabId, { url, title, dateString }) {
	console.log('Handling date for tab', tabId, url, title, dateString);
	if (!dateString) return await updateAction({ tabId });

	const date = parseDate(dateString);
	console.log('Parsed date:', date);
	if (!date) return await updateAction({ tabId });

	const { year, month, day } = date;

	// Prefers shorter M/D to fit in the badge, MMDD otherwise.
	const monthDay = `${Number(month)}/${Number(day)}`;
	const badgeText = monthDay.length < 5 ? monthDay : monthDay.replace('/', '');

	await updateAction({
		tabId,
		enabled: true,
		badgeText,
		title: `${year}-${month}-${day}`,
	});
}

/**
 * Fetches a fresh date from the content script.
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

			return { tabId, url, title, dateString, date };
		}
	}
	catch (error) {
		console.log(`Error fetching date from content script for tab ${tabId}:`, error);
	}

	return null;
}

/**
 * Loads tab data by fetching a fresh date from the content script.
 * @param {number} tabId
 * @returns {Promise<{ tabId: number, url: string, title: string, dateString: string, date: object|null }>}
 */
async function loadTabData(tabId) {
	const tab = await chrome.tabs.get(tabId);

	if (!tab || !tab.url) {
		return {
			tabId,
			url: 'Unknown URL',
			title: 'Untitled',
			dateString: 'N/A',
			date: null,
		};
	}

	// Always fetch fresh data
	return (
		await fetchTabDate(tabId, tab.url) || {
			tabId,
			url: tab.url,
			title: tab.title || 'Untitled',
			dateString: 'N/A',
			date: null,
		}
	);
}

/**
 * Processes a tab event (activation/update) by ensuring its date is loaded and action updated.
 * @param {number} tabId
 */
async function handleTabEvent(tabId) {
	if (!await isTabReady({ tabId })) {
		// If tab is not ready, disable the action
		await updateAction({ tabId });
		return;
	}

	const data = await loadTabData(tabId);

	if (data) {
		await handleGetDate(tabId, data);
	}
	else {
		// If loading data fails, disable the action
		await updateAction({ tabId });
	}
}

// Event listeners for tab events
chrome.tabs.onActivated.addListener(async ({ tabId }) => await handleTabEvent(tabId));
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	// Only run on status complete to avoid multiple triggers and ensure content script is ready
	if (changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
		await handleTabEvent(tabId);
	}
	else if (changeInfo.status === 'loading') {
		// Optionally disable action while loading
		await updateAction({ tabId });
	}
});

// Event listener for messages from content scripts.
chrome.runtime.onMessage.addListener(async (message, sender) => {
	if (!sender.tab) {
		console.log('No tab information in sender.');
		return;
	}

	const { id: tabId, url, title } = sender.tab;
	console.log(`Received message from tab ${tabId}:`, message);

	// Directly handle the received data without caching
	await handleGetDate(tabId, { ...message, title: title || 'Untitled', url });
});

// Handling messages from external extensions

/**
 * Retrieves dates for multiple tabs by fetching fresh data for each.
 * @param {Array<number>} tabIds
 * @returns {Promise<Array<{ tabId: number, url: string, title: string, dateString: string, date: object|null }>>}
 */
async function getDatesFromTabs(tabIds) {
	const tabDataPromises = tabIds.map(async (tabId) => {
		try {
			// Check readiness before attempting to load/fetch data
			if (await isTabReady({ tabId })) {
				return await loadTabData(tabId);
			}
			else {
				// If tab is not ready, return a default structure
				const tab = await chrome.tabs.get(tabId).catch(() => null); // Get tab info if possible
				return {
					tabId,
					url: tab?.url || 'Unknown URL',
					title: tab?.title || 'Untitled',
					dateString: 'N/A',
					date: null,
				};
			}
		}
		catch (error) {
			console.log(`Error processing tab ${tabId}:`, error);
			// Return a default structure on error
			const tab = await chrome.tabs.get(tabId).catch(() => null);
			return {
				tabId,
				url: tab?.url || 'Unknown URL',
				title: tab?.title || 'Untitled',
				dateString: 'N/A',
				date: null,
			};
		}
	});

	// Use Promise.all directly as getDatesFromTabs is async
	const results = await Promise.all(tabDataPromises);

	// Filter out nulls just in case, though the logic above aims to always return an object
	return results.filter(Boolean);
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
	if (message?.action === 'get-dates' && Array.isArray(message.tabIds) && message.tabIds.length > 0) {
		console.log('External extension requested dates for tabs:', message.tabIds);

		// Handle the promise chain without async/await
		// Note: it needs to be a non-async function to make it work in Firefox
		// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage#sending_an_asynchronous_response_using_sendresponse
		Promise.all(message.tabIds.map(loadTabData))
			.then(results => {
				console.log('Sending response back:', { data: results });
				sendResponse({ data: results });
			})
			.catch(error => {
				console.error('Error processing external request:', error);
				sendResponse({ error: 'Internal processing error' });
			});
	}
	else {
		sendResponse({ error: 'Invalid request: missing or invalid tabIds.' });
	}

	// Keep the channel open for async response
	return true;
});
