'use strict';

function isAcceptedDateFormat(string) {
	const re = /(?<year>\d{4})[-\/\.](?<month>\d{1,2})[-\/\.](?<day>\d{1,2})/;
	return re.test(string);
}

function parseFuzzyDateString(string) {
	const monthsMap = {
		jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
		jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
	};
	// "March 19th, 1984", "Mar. 19, 1984", etc.
	const reMonthDayYear = /(?<monthStr>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?[a-y]{0,6}\s+(?<dayStr>\d{1,2})(st|nd|rd|th)?,?\s+(?<yearStr>\d{4})/i;
	// "19th March 1984", "19 Mar 1984", etc.
	const reDayMonthYear = /(?<dayStr>\d{1,2})(st|nd|rd|th)?\s+(?<monthStr>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?[a-y]{0,6},?\s+(?<yearStr>\d{4})/i;

	const regexes = [reMonthDayYear, reDayMonthYear];
	let match;
	for (const regex of regexes) {
		match = regex.exec(string);
		if (match) break;
	}
	if (!match) return null;

	const { yearStr, monthStr, dayStr } = match.groups;

	return {
		year: parseInt(yearStr, 10),
		month: monthsMap[monthStr.toLowerCase()],
		day: parseInt(dayStr, 10),
	};
}

function findJsonLdScripts() {
	const scripts = [...document.querySelectorAll(`script[type="application/ld+json"]`)];
	if (scripts.length > 0) {
		console.log(`heliotropium: found JSON-LD scripts.`, scripts);
	}
	return scripts;
}

function hasJsonLdDateProperty(object) {
	const JSON_LD_DATE_PROPERTIES = [`datePublished`, `uploadDate`];
	const hasDate = JSON_LD_DATE_PROPERTIES.some((property) => {
		return property in object;
	});
	if (hasDate) {
		console.log(`heliotropium: found JSON-LD date property.`, object);
	}
	return hasDate;
}

function isJsonLdArticle(object) {
	const ARTICLE_TYPE_SUFFIXES = [`Article`, `BlogPosting`];
	const type = object?.[`@type`];
	const isArticle = ARTICLE_TYPE_SUFFIXES.some((suffix) => {
		return type?.endsWith(suffix);
	});
	if (isArticle) {
		console.log(`heliotropium: found JSON-LD type.`, type);
	}
	return isArticle;
}

function findDateFromJsonLd() {
	let object = null;
	let date = null;

	const jsonLdScripts = findJsonLdScripts();
	if (jsonLdScripts.length === 0) {
		return date;
	}

	const parsedData = jsonLdScripts.map((script) => {
		try {
			// technically invalid per spec, but there are sites putting
			// unescaped newlines in JSON-LD scripts, so just remove them.
			const scriptContent = script.textContent.replaceAll(`\n`, ``);
			// FIXME: some sites even has `<!CDATA[...]]>` in script element :(
			return JSON.parse(scriptContent);
		} catch (error) {
			return null;
		}
	}).filter((data) => {
		return data !== null;
	});

	for (const data of parsedData) {
		// { "@type": "Article", "datePublished": "..." }
		if (isJsonLdArticle(data) && hasJsonLdDateProperty(data)) {
			object = data;
			break;
		}
		// [{ "@type": "Article", "datePublished": "..." }]
		// { "@graph": [{ "@type": "Article", "datePublished": "..." }] }
		const arraysToCheck = [data, data?.['@graph']].filter(Array.isArray);
		for (const array of arraysToCheck) {
			const article = array.find((item) => {
				return isJsonLdArticle(item) && hasJsonLdDateProperty(item);
			});
			if (article) {
				object = article;
				break;
			}
		}
	}

	date = object?.datePublished || object?.uploadDate;
	if (date) {
		console.log(`heliotropium: found date "${date}" in`, object);
	}
	else {
		console.log(`heliotropium: no date found in JSON-LD.`);
	}
	return date;
}

function getAttrValue({ selector, valueAttr }) {
	const qsaArgument = `${selector}[${valueAttr}]`;
	const matched = [...document.querySelectorAll(qsaArgument)];
	if (matched.length === 0) {
		return null;
	}
	const firstMatched = matched[0];
	const value = firstMatched.getAttribute(valueAttr);
	console.log(`heliotropium: found "${valueAttr}" value of "${value}" in`, firstMatched);
	return value;
}

function findDateFromElements() {
	let date = null;
	const dateElements = [
		{ selector: `meta[property="article:published_time"]`, valueAttr: `content` },
		{ selector: `meta[name="pubdate"]`, valueAttr: `content` },
		{ selector: `meta[name="date"]`, valueAttr: `content` },
		{ selector: `relative-time`, valueAttr: `datetime` },
		{ selector: `time`, valueAttr: `datetime` },
	];
	for (const { selector, valueAttr } of dateElements) {
		let value = getAttrValue({ selector, valueAttr });
		if (!!value && isAcceptedDateFormat(value)) {
			date = value;
			break;
		}
	}
	return date;
}

function findDate() {
	let date = null;
	date = findDateFromJsonLd();
	if (!date || !isAcceptedDateFormat(date)) {
		date = findDateFromElements();
	}
	return date;
}

function handleMessage(message) {
	console.log(`heliotropium: got a message.`, message);
	if (!message) {
		console.log(`heliotrpium: message is empty.`);
		return;
	}
	let response = {};
	if (message?.action === `get-date`) {
		response.date = findDate();
	}
	console.log(`heliotropium: sending back a response.`, response);
	chrome.runtime.sendMessage(response);
}

chrome.runtime.onMessage.addListener(handleMessage);