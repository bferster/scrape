document.addEventListener('DOMContentLoaded', () => {
	const params = new URLSearchParams(window.location.search);
	const activeTabId = parseInt(params.get('tabId'));

	const scrapeBtn = document.getElementById('scrapeBtn');
	const downloadBtn = document.getElementById('downloadBtn');
	const nextBtn = document.getElementById('nextBtn');
	const clearBtn = document.getElementById('clearBtn');
	const autoAdvanceCb = document.getElementById('autoAdvance');
	const loopCb = document.getElementById('loopScrape');
	const maxPagesInput = document.getElementById('maxPages');

	const previewContainer = document.getElementById('preview-container');
	const preview = document.getElementById('preview');
	const statusText = document.getElementById('status-text');
	const statusDot = document.querySelector('.status-dot');
	const statsFooter = document.getElementById('stats-footer'); // Get footer ref

	let scrapedData = [];
	let loopTimer = null;
	let pagesScrapedInSession = 0;

	// Load persisted data
	chrome.storage.local.get(['scrapedData'], (result) => {
		if (result.scrapedData) {
			scrapedData = result.scrapedData;
			// ... (keep existing display logic if needed, or just status)
			if (scrapedData.length > 0) {
				displayData(scrapedData);
				updateStatus(`Ready. ${scrapedData.length} rows in buffer.`, 'success');
				updateFooterStats(0, scrapedData.length); // Init stats
				downloadBtn.disabled = false;
				// downloadBtn.style.cursor = 'pointer'; // handled in display logic usually or CSS
			}
		}
	});

	function updateStatus(message, type = 'pending') {
		statusText.textContent = message;
		statusDot.className = 'status-dot';
		statusDot.classList.remove('error', 'success', 'pending');
		statusDot.classList.add(type === 'error' ? 'error' : type === 'success' ? 'success' : 'pending');
	}

	function updateFooterStats(lastCount, totalCount) {
		statsFooter.innerHTML = `
			<span>Last Scrape: <b>${lastCount}</b></span>
			<span>Total Rows: <b>${totalCount}</b></span>
		`;
	}

	clearBtn.addEventListener('click', () => {
		scrapedData = [];
		chrome.storage.local.set({ scrapedData: [] });
		previewContainer.style.display = 'none';
		preview.innerHTML = '';
		downloadBtn.disabled = true;
		pagesScrapedInSession = 0; // Reset session count
		updateStatus('Data cleared.', 'pending');
		updateFooterStats(0, 0);
		stopLoop();
	});

	nextBtn.addEventListener('click', async () => {
		if (!activeTabId) {
			updateStatus('Error: No target tab.', 'error');
			return;
		}
		triggerNextPage(activeTabId);
	});

	function triggerNextPage(tabId) {
		updateStatus('Navigating to Next Image...', 'pending');
		chrome.tabs.sendMessage(tabId, { action: "next_page" }, (response) => {
			if (chrome.runtime.lastError) {
				updateStatus('Error clicking Next: ' + chrome.runtime.lastError.message, 'error');
				stopLoop();
				return;
			}
			if (response && response.success) {
				updateStatus('Navigating...', 'success');

				// LOOP LOGIC
				if (loopCb.checked && autoAdvanceCb.checked) {
					updateStatus(`Waiting 10s before scraping Page ${pagesScrapedInSession + 1}...`, 'pending');
					loopTimer = setTimeout(() => {
						performScrape();
					}, 10000);
				}

			} else {
				updateStatus('Next button not found.', 'error');
				stopLoop(); // Stop if we can't click next
			}
		});
	}

	function stopLoop() {
		if (loopTimer) {
			clearTimeout(loopTimer);
			loopTimer = null;
		}
		loopCb.checked = false; // Uncheck to visually indicate stop
	}

	async function performScrape() {
		// Check Max Pages limit BEFORE scraping? Or after? Usually user says "Scrape 5 pages".
		// Let's increment after successful scrape.
		const maxPages = parseInt(maxPagesInput.value) || 9999;

		updateStatus('Scraping...', 'pending');


		if (!activeTabId) {
			updateStatus('Error: No target tab.', 'error');
			stopLoop();
			return;
		}

		chrome.tabs.sendMessage(activeTabId, { action: "scrape_selection" }, (response) => {
			if (chrome.runtime.lastError) {
				updateStatus('Error: Reload page.', 'error');
				stopLoop();
				return;
			}

			if (response && response.data && response.data.length > 0) {
				const newData = response.data;
				// Appending logic
				scrapedData = [...scrapedData, ...newData];

				// Persist
				chrome.storage.local.set({ scrapedData: scrapedData }, () => {
					if (chrome.runtime.lastError) {
						console.error("Storage Error:", chrome.runtime.lastError);
						updateStatus('Storage Limit Reached. Download now.', 'error');
						stopLoop();
					}
				});

				pagesScrapedInSession++;

				displayData(scrapedData);
				updateStatus(`Added ${newData.length} rows. Total: ${scrapedData.length}. Page: ${pagesScrapedInSession}/${maxPages}.`, 'success');
				updateFooterStats(newData.length, scrapedData.length);
				downloadBtn.disabled = false;

				// CHECK LIMIT
				if (pagesScrapedInSession >= maxPages) {
					updateStatus(`Limit reached (${maxPages} pages). Downloading...`, 'success');
					stopLoop();
					downloadBtn.click(); // Trigger download
					return;
				}

				// AUTO-ADVANCE LOGIC
				if (autoAdvanceCb.checked) {
					// Short delay before clicking next
					setTimeout(() => {
						triggerNextPage(activeTabId);
					}, 1000);
				} else {
					stopLoop();
				}

			} else {
				// Modified: If no data, but Looping + Auto-Advance -> Skip to next
				if (loopCb.checked && autoAdvanceCb.checked) {
					updateStatus('No data. Skipping to next page...', 'failed'); // Use distinct color if needed or just pending
					pagesScrapedInSession++; // We count skipped pages as visited pages to avoid infinite loop

					// Check limit even for skips
					const maxPages = parseInt(maxPagesInput.value) || 9999;
					if (pagesScrapedInSession >= maxPages) {
						updateStatus(`Limit reached (${maxPages} pages). Downloading...`, 'success');
						stopLoop();
						downloadBtn.click();
						return;
					}

					setTimeout(() => {
						triggerNextPage(activeTabId);
					}, 1000);
				} else {
					updateStatus('No data found. Stopping.', 'error');
					stopLoop();
				}
			}
		});
	}

	scrapeBtn.addEventListener('click', () => {
		if (scrapedData.length > 0) {
			if (!confirm(`You have ${scrapedData.length} rows in memory. Do you want to append to this list?`)) {
				return;
			}
		}

		// Always reset session page count when starting a new scrape job
		pagesScrapedInSession = 0;
		performScrape();
	});

	// Safety: Stop loop if user unchecks box manually during wait
	loopCb.addEventListener('change', () => {
		if (!loopCb.checked && loopTimer) {
			clearTimeout(loopTimer);
			loopTimer = null;
			updateStatus('Loop cancelled.', 'pending');
		} else if (loopCb.checked) {
			// Reset count? user might just be toggling mid-run.
			// We'll leave count alone unless manual start.
		}
	});

	downloadBtn.addEventListener('click', () => {
		if (!scrapedData.length) return;

		// DEDUPLICATION BEFORE DOWNLOAD
		// Use Set with JSON stringify to filter unique rows
		const seen = new Set();
		const uniqueData = scrapedData.filter(row => {
			const signature = JSON.stringify(row);
			if (seen.has(signature)) return false;
			seen.add(signature);
			return true;
		});

		if (uniqueData.length === 0) return; // Should not happen if filteredData had length

		// Dynamic Headers (Priority Order + Extras)
		let allKeys = new Set();
		uniqueData.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));

		// Split priority keys into Start and End groups based on user requirement
		const startKeys = [
			"line", "district", "dwelling", "family", "full_name",
			"first_name", "middle_name", "last_name", "age", "birth_year",
			"gender", "race", "occupation", "birth_place"
		];

		const endKeys = [
			"norm_race", "norm_first_name", "nysiis_last_name",
			"norm_occupation", "head"
		];

		// Identify extra keys (found in data but not in start/end lists)
		const extraKeys = Array.from(allKeys)
			.filter(k => !startKeys.includes(k) && !endKeys.includes(k))
			.sort();

		// Construct final header order: Start -> Extras -> End
		// Filter out keys from Start/End that don't exist in data? 
		// Actually, usually we force headers even if empty if they are "Standard", 
		// but the current logic was doing `priorityKeys.filter(k => allKeys.has(k))`.
		// We will stick to only including keys that actually have data (or valid headers found).

		const headers = [
			...startKeys.filter(k => allKeys.has(k)),
			...extraKeys,
			...endKeys.filter(k => allKeys.has(k))
		];

		// Handle CSV escaping properly
		const csvContent = [
			headers.join(','),
			...uniqueData.map(row =>
				headers.map(header => {
					let cell = row[header] || '';
					// Escape quotes and wrap in quotes if contains comma or quote
					if (cell.includes('"') || cell.includes(',')) {
						cell = `"${cell.replace(/"/g, '""')}"`;
					}
					return cell;
				}).join(',')
			)
		].join('\r\n');

		const blob = new Blob([csvContent], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `census_export_${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();
		URL.revokeObjectURL(url);

		// Data is NOT cleared after download per user request
		updateStatus(`Downloaded. ${scrapedData.length} rows retained in memory.`, 'success');
	});

	function displayData(data) {
		if (!data.length) return;

		// PERFORMANCE: Only show last 10 rows to prevent freezing
		const limit = 10;
		const displaySet = data.slice(-limit);

		preview.innerHTML = ''; // Clear existing

		const infoDiv = document.createElement('div');
		infoDiv.style.padding = '5px';
		infoDiv.style.color = '#94a3b8';
		infoDiv.style.fontSize = '11px';
		infoDiv.textContent = `Showing last ${displaySet.length} of ${data.length} rows`;
		preview.appendChild(infoDiv);

		const table = document.createElement('table');
		const thead = document.createElement('thead');
		const tbody = document.createElement('tbody');

		const headers = Object.keys(data[0]);
		const trHead = document.createElement('tr');
		headers.forEach(h => {
			const th = document.createElement('th');
			th.textContent = h;
			trHead.appendChild(th);
		});
		thead.appendChild(trHead);

		displaySet.forEach(row => {
			const tr = document.createElement('tr');
			headers.forEach(h => {
				const td = document.createElement('td');
				td.textContent = row[h];
				tr.appendChild(td);
			});
			tbody.appendChild(tr);
		});

		table.appendChild(thead);
		table.appendChild(tbody);
		preview.appendChild(table);
		previewContainer.style.display = 'block';
	}
});
