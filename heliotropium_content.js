'use strict';

class HeliotropiumContent {
	constructor() {
		this.init();
	}

	init() {
		const timeElement = document.querySelector(`time[datetime]`);
		if (!timeElement) {
			console.log(`heliotropium: no time element found.`);
		} else {
			console.log(
				`heliotropium: original datetime is "${timeElement.dateTime}"`,
			);
			const originalDate = new Date(timeElement.dateTime);
			const formattedDate = this.formatDate(originalDate);

			timeElement.textContent = formattedDate;
			timeElement.style.backgroundColor = `hsl(60 100% 94% / 50%)`;
		}
	}

	formatDate(dateObj) {
		const YYYY = dateObj.getFullYear();
		const MM = (dateObj.getMonth() + 1 + ``).padStart(2, `0`);
		const DD = (dateObj.getDate() + ``).padStart(2, `0`);
		const h = dateObj.getHours();
		const mm = (dateObj.getMinutes() + ``).padStart(2, `0`);

		const formattedString = `${YYYY}-${MM}-${DD} ${h}:${mm}`;
		return formattedString;
	}
}

new HeliotropiumContent();
