// Content script to scrape Selection or Auto-detect Table
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === "scrape_selection") {
		// Try selection first
		let data = scrapeSelection();

		// If no selection, try auto-detection
		if (data.length === 0) {
			console.log("No selection found. Attempting auto-detection of table...");
			data = scrapeTableAuto();
		}

		sendResponse({ data: data });
	}
	else if (request.action === "next_page") {
		const success = clickNextButton();
		sendResponse({ success: success });
	}
	return true;
});

function isElementClickable(el) {
	if (!el) return false;
	if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
	try {
		const style = window.getComputedStyle(el);
		if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
			return false;
		}
	} catch (e) {}
	return true;
}

function doClickElement(el) {
	if (!el) return false;
	const target = (el.closest && el.closest('button, a, [role="button"]')) ? el.closest('button, a, [role="button"]') : el;
	target.click();
	return true;
}

function clickNextButton() {
	// Priority 1: Next-Image selectors (deep)
	const selectorImage = `
        button[title="Next-Image"], 
        a[title="Next-Image"],
        [aria-label="Next-Image"],
        [data-tip="Next-Image"],
        button[title="Next Image"], 
        [aria-label="Next Image"]
    `;

	let found = querySelectorAllDeep(selectorImage);
	for (const btn of found) {
		if (isElementClickable(btn)) {
			return doClickElement(btn);
		}
	}

	// Priority 2: "Next" selectors (deep)
	const selectorNext = `
		button[title="Next"], 
		a[title="Next"],
		[aria-label="Next"],
		button[name="Next"],
		[data-testid*="next" i],
		[data-test-id*="next" i]
	`;

	found = querySelectorAllDeep(selectorNext);
	for (const btn of found) {
		if (isElementClickable(btn)) {
			return doClickElement(btn);
		}
	}

	// Priority 3: ">" or "Next page" selectors (deep)
	const selectorGreater = `
		button[title=">"], 
		a[title=">"],
		[aria-label=">"],
		button[name=">"],
		[data-tip=">"],
		button[title="Next page"],
		a[title="Next page"],
		[aria-label="Next page"],
		[aria-label*="next page" i],
		[title*="next page" i]
	`;

	found = querySelectorAllDeep(selectorGreater);
	for (const btn of found) {
		if (isElementClickable(btn)) {
			return doClickElement(btn);
		}
	}

	// Priority 4: Search all clickable candidates deeply (including shadow roots)
	const candidates = querySelectorAllDeep("button, a, input[type='button'], input[type='submit'], [role='button'], span[role='button'], fs-button, fs-icon-button, [class*='next' i], [class*='forward' i], [class*='right' i], [class*='chevron' i]");
	
	for (const b of candidates) {
		if (!isElementClickable(b)) continue;

		const text = (b.innerText || b.textContent || '').trim();
		const aria = (b.getAttribute('aria-label') || '').trim();
		const title = (b.getAttribute('title') || '').trim();
		const dataTip = (b.getAttribute('data-tip') || '').trim();

		// Check for text "Next", ">", "›", "»", "→"
		if (
			text === 'Next' || text.toLowerCase() === 'next' ||
			text === '>' || text === '›' || text === '»' || text === '→' ||
			aria === '>' || title === '>' || dataTip === '>' ||
			aria.toLowerCase().includes('next') || title.toLowerCase().includes('next')
		) {
			return doClickElement(b);
		}
	}

	// Priority 5: Fallback search across ALL DOM nodes deeply for text/aria equal to '>'
	const allNodes = querySelectorAllDeep('*');
	for (const node of allNodes) {
		if (!isElementClickable(node)) continue;
		const t = (node.innerText || node.textContent || '').trim();
		const aria = (node.getAttribute('aria-label') || '').trim();
		const title = (node.getAttribute('title') || '').trim();

		if (t === '>' || t === '›' || t === '»' || t === '→' || aria === '>' || title === '>') {
			return doClickElement(node);
		}
	}

	console.warn("Next-Image, Next, or '>' button not found.");
	return false;
}

function scrapeSelection() {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0 || selection.toString().trim() === "") {
		return [];
	}

	const range = selection.getRangeAt(0);
	const fragment = range.cloneContents();
	const div = document.createElement('div');
	div.appendChild(fragment);

	const rows = div.querySelectorAll('tr, [role="row"], .ag-row');
	if (rows.length > 0) {
		return parseTableRows(rows);
	}
	return [];
}

function querySelectorAllDeep(selector, root = document) {
	const elements = Array.from(root.querySelectorAll(selector));
	const allNodes = Array.from(root.querySelectorAll('*'));
	for (const node of allNodes) {
		if (node.shadowRoot) {
			elements.push(...querySelectorAllDeep(selector, node.shadowRoot));
		}
	}
	return elements;
}

function scrapeTableAuto() {
	// Strategy: Find the "best" table.
	// Criteria 1: Contains specific FamilySearch headers (Name, Sex, Age)
	// Criteria 2: Has the most rows.

	const requiredHeaderPartials = ["Name", "Sex", "Age"];
	const unwantedHeaders = ["Attach", "Image", "Edit", "View"];

	let bestTable = null;
	let maxScore = 0;

	const tables = querySelectorAllDeep('table, [role="table"], [role="grid"], [role="treegrid"], .ag-root-wrapper, .ag-root, fs-table');

	$(tables).each(function () {
		const $tbl = $(this);
		
		// If $tbl is fs-table, its contents might be in shadowRoot
		const tblRoot = this.shadowRoot || this;
		const rows = querySelectorAllDeep('tr, [role="row"], .ag-row', tblRoot);
		const rowCount = rows.length;
		if (rowCount < 2) return; // Ignore tiny tables

		let score = 0;

		// Check headers
		let headerMatchCount = 0;
		const headers = querySelectorAllDeep('th, [role="columnheader"], .ag-header-cell', tblRoot);
		$(headers).each(function () {
			const text = $(this).text().trim().toLowerCase();
			if (requiredHeaderPartials.some(r => text.includes(r.toLowerCase()))) {
				headerMatchCount++;
			}
		});

		// Scoring: 10 points per header match, 1 point per row
		score = (headerMatchCount * 10) + rowCount;

		if (score > maxScore) {
			maxScore = score;
			bestTable = $tbl;
		}
	});

	if (bestTable) {
		const tblRoot = bestTable[0].shadowRoot || bestTable[0];
		const bestRows = querySelectorAllDeep('tr, [role="row"], .ag-row', tblRoot);
		return parseTableRows(bestRows, true);
	}

	return [];
}

function parseTableRows(rows, filtersHeaders = false) {
	const data = [];
	const seenRows = new Set();
	const unwantedHeaders = ["attach", "attach_to_tree", "image", "edit", "view", "more", "select", "egoid", "note", "sheet_letter", "sheet letter"];

	// Attempt to identify headers
	const rowsArray = Array.from(rows);

	if (rowsArray.length === 0) return [];

	let headerMap = {};
	let originalHeaders = [];
	const ignoredColumnIndices = new Set();

	// Header Processing (First Row)
	const firstRowCells = querySelectorAllDeep('td, th, [role="columnheader"], [role="cell"], [role="gridcell"], .ag-cell, .ag-header-cell', rowsArray[0]);
	firstRowCells.forEach((cell, index) => {
		let text = cell.innerText.trim();
		let lower = text.toLowerCase();
		let cleanLower = lower.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();

		// Check if this column is a known data column
		const isKnownDataColumn = 
			cleanLower.includes("name") || 
			cleanLower.includes("sex") || 
			cleanLower.includes("gender") || 
			cleanLower.includes("age") || 
			cleanLower.includes("birth") || 
			cleanLower.includes("race") || 
			cleanLower.includes("page") || 
			cleanLower.includes("marital") || 
			cleanLower.includes("head") || 
			cleanLower.includes("event") || 
			cleanLower.includes("relationship") ||
			cleanLower.includes("link");

		// Only ignore column if it's NOT a data column AND (its header is in unwantedHeaders or it has empty header text)
		const isUnwanted = unwantedHeaders.some(u => cleanLower.includes(u));
		if (!isKnownDataColumn && (isUnwanted || text === "" || cleanLower.includes("attach"))) {
			ignoredColumnIndices.add(index);
			return;
		}

		if (!text) text = `Column_${index + 1}`;

		// 1. Specific Renames (Priority)
		if (
			cleanLower === "name" ||
			cleanLower === "full name" ||
			cleanLower === "fullname" ||
			cleanLower === "full_name" ||
			(cleanLower.includes("name") && !cleanLower.includes("first") && !cleanLower.includes("last") && !cleanLower.includes("middle") && !cleanLower.includes("given") && !cleanLower.includes("sur"))
		) {
			text = "full_name";
		}
		else if (cleanLower === "line" || cleanLower === "line number" || cleanLower === "original line") text = "original_line";
		else if (cleanLower === "birthplace" || cleanLower.includes("birth place")) text = "birth_place";
		else if (cleanLower.includes("birth year") || cleanLower.includes("bith year")) text = "birth_year";
		else if (cleanLower === "sex" || cleanLower === "gender") text = "gender";
		else if (cleanLower === "race") text = "race";
		else if (cleanLower === "age") text = "age";
		else if (cleanLower === "page number" || cleanLower === "page") text = "page";
		else if (cleanLower === "marital status" || cleanLower === "marital_status") text = "marital_status";
		else if (cleanLower.includes("head")) text = "head";
		else {
			// 2. Generic snake_case for all other columns
			// Remove punctuation, replace non-alphanumeric with underscore, remove leading/trailing underscores
			text = lower.replace(/[^\w\s]|_/g, "").replace(/\s+/g, "_");
			if (!text) text = `column_${index + 1}`;
		}

		// ALWAYS include the column (User request: "All columns in the table should be included")
		headerMap[index] = text;
		originalHeaders.push(text);
	});

	// Extract data
	for (let i = 1; i < rowsArray.length; i++) {
		const row = rowsArray[i];
		const cells = querySelectorAllDeep('td, th, [role="columnheader"], [role="cell"], [role="gridcell"], .ag-cell, .ag-header-cell', row);
		const rowData = {};
		let hasData = false;

		cells.forEach((cell, index) => {
			if (ignoredColumnIndices.has(index)) return;

			let key = headerMap[index];
			if (!key) {
				// Handle columns that exceed the header row count
				key = `column_${index + 1}`;
			}

			if (key) {
				let val = cell.innerText ? cell.innerText.trim() : "";
				rowData[key] = val;
				if (val) hasData = true;
			}
		});

		if (hasData) {
			// --- TRANSFORMATIONS ---

			// Ensure 'name' or generic name field is mapped into 'full_name'
			Object.keys(rowData).forEach(k => {
				const kClean = k.toLowerCase().replace(/_/g, " ").trim();
				if (
					kClean === "name" ||
					(kClean.includes("name") && !kClean.includes("full") && !kClean.includes("first") && !kClean.includes("last") && !kClean.includes("middle") && !kClean.includes("norm") && !kClean.includes("nysiis") && !kClean.includes("given") && !kClean.includes("sur"))
				) {
					if (!rowData["full_name"]) {
						rowData["full_name"] = rowData[k];
					}
					delete rowData[k];
				}
			});

			// Clean multi-line name cell value if needed (e.g. "More\nNoah H Moyer\nGroom")
			if (rowData["full_name"]) {
				const lines = rowData["full_name"].split(/[\r\n]+/).map(s => s.trim()).filter(s => s.length > 0);
				const actionWords = ["more", "view", "attach", "edit", "expand", "details", "show", "hide", "select"];
				while (lines.length > 0 && actionWords.includes(lines[0].toLowerCase())) {
					lines.shift();
				}
				if (lines.length > 0) {
					rowData["full_name"] = lines[0];
				}
			}

			// 1. Name Splitting
			let first = "", middle = "", last = "";
			if (rowData["full_name"]) {
				const fName = rowData["full_name"].replace(/[.,]/g, "");
				const parts = fName.split(/\s+/).filter(s => s.length > 0);
				if (parts.length === 1) {
					last = parts[0];
				} else if (parts.length === 2) {
					first = parts[0];
					last = parts[1];
				} else if (parts.length >= 3) {
					first = parts[0];
					middle = parts[1].replace(/[^\w\s]/g, ""); // Remove punctuation from middle name
					last = parts.slice(2).join(" ");
				}

				// Suffix checking for last name (jr, sr, ii, iii, iv, 2nd, 3rd, 4th, 5th)
				const suffixes = ['jr', 'sr', 'ii', 'iii', 'iv', '2nd', '3rd', '4th', '5th'];
				if (parts.length > 1) {
					const lastTerm = parts[parts.length - 1].toLowerCase();
					if (suffixes.includes(lastTerm)) {
						if (parts.length >= 2) {
							last = parts[parts.length - 2];
						}
					}
				}
			}
			rowData["first_name"] = first;
			rowData["middle_name"] = middle;
			rowData["last_name"] = last;

			// 2. Race Encoding
			if (rowData["race"]) {
				const r = rowData["race"].toLowerCase();
				let code = rowData["race"];
				let normR = "";
				if (r.startsWith("black")) { code = "B"; normR = "B"; }
				else if (r.startsWith("white")) { code = "W"; normR = "W"; }
				else if (r.startsWith("other")) { code = "O"; normR = "O"; }
				else if (r.startsWith("unknown")) { code = "U"; normR = "U"; }
				else if (r.startsWith("mulatto")) { code = "M"; normR = "B"; }
				else if (r.startsWith("chinese")) { code = "C"; normR = "W"; }
				else if (r.startsWith("yellow")) { code = "Y"; normR = "W"; }
				else if (r.startsWith("octoroon")) { code = "O"; normR = "B"; }
				else if (r.startsWith("indian")) { code = "I"; }
				rowData["race"] = code;
				rowData["norm_race"] = normR;
			}

			// 3. Gender Encoding
			if (rowData["gender"]) {
				const g = rowData["gender"].toLowerCase();
				if (g.startsWith("male")) rowData["gender"] = "M";
				else if (g.startsWith("female")) rowData["gender"] = "F";
			}

			// 3.5 Marital Status Encoding
			if (rowData["marital_status"]) {
				const m = rowData["marital_status"].toLowerCase();
				let code = rowData["marital_status"];
				if (m.startsWith("single")) code = "S";
				else if (m.startsWith("married")) code = "M";
				else if (m.startsWith("widowed")) code = "W";
				else if (m.startsWith("divorced")) code = "D";
				else if (m.startsWith("separated")) code = "Sp";
				else if (m.startsWith("unknown")) code = "U";
				else if (m.startsWith("other")) code = "O";
				rowData["marital_status"] = code;
			}

			// 3.6 Age Encoding
			if (rowData["age"]) {
				let a = rowData["age"].toLowerCase();
				a = a.replace(/months/g, "/12");
				a = a.replace(/years/g, "");
				a = a.replace(/\s+/g, "");
				rowData["age"] = a;
			}

			// 4. State Abbreviation (Generalized for any column with "place" in name)
			Object.keys(rowData).forEach(key => {
				if (key.includes("place")) {
					let val = rowData[key];
					if (val) {
						// Remove "United States" and commas
						val = val.replace(/United States,?/gi, "").replace(/,/g, "").trim();
						rowData[key] = abbreviateState(val);
					}
				}
			});

			// --- CALCULATED COLUMNS ---

			// 5. norm_first_name
			rowData["norm_first_name"] = normalizeFirstName(first);

			// 6. nysiis_last_name
			rowData["nysiis_last_name"] = nysiis(last);

			// 7. norm_occupation
			if (rowData.hasOwnProperty("occupation")) {
				rowData["norm_occupation"] = normalizeOccupation(rowData["occupation"]);
			} else {
				rowData["norm_occupation"] = "";
			}

			// 8. head
			if (rowData["head"]) {
				rowData["head"] = "Y";
			} else {
				rowData["head"] = "";
			}

			// Reconstruct object with ALL columns
			const orderedData = {};

			// 1. Line Number (Always first, in original_line column)
			orderedData["original_line"] = rowData["original_line"] || rowData["line"] || i.toString();

			// 2. Priority Columns (if they exist)
			const priorityKeys = [
				"district", "dwelling", "family", "full_name", "first_name",
				"middle_name", "last_name", "age", "birth_year", "gender",
				"race", "occupation", "birth_place"
			];
			const endKeys = [
				"norm_race", "norm_first_name", "nysiis_last_name", "norm_occupation", "head"
			];

			priorityKeys.forEach(key => {
				if (rowData.hasOwnProperty(key)) {
					orderedData[key] = rowData[key];
				} else {
					orderedData[key] = "";
				}
			});

			// 3. All other columns found in the table
			const excludedKeys = ["line", "original_line", "attach_to_tree", "attach", "egoid", "note", "sheet_letter", "page_number", "birth_year_10", "nyiis_last_name"];
			Object.keys(rowData).forEach(key => {
				if (!excludedKeys.includes(key) && !key.toLowerCase().includes("attach") && !priorityKeys.includes(key) && !endKeys.includes(key)) {
					orderedData[key] = rowData[key];
				}
			});

			// Append end keys
			endKeys.forEach(key => {
				if (rowData.hasOwnProperty(key)) {
					orderedData[key] = rowData[key];
				} else {
					orderedData[key] = "";
				}
			});

			// Dedupe? If we include Line number, every row is unique.
			// But prompt asked to "Remove any duplicate rows before downloading" in Popup.
			// Popup deduplication will see "Line" is different and keep them?
			// "Remove any duplicate rows...".
			// If I scrape Page 1, I get Line 1..40.
			// If I scrape Page 1 AGAIN, I get Line 1..40.
			// Popup deduper will see: Line 1 + Data A vs Line 1 + Data A -> Same -> Remove.
			// If I scrape Page 2, I get Line 1..40.
			// Popup deduper will see: Line 1 + Data B. Unique.
			// So Line Number re-starting at 1 for each page is actually GOOD for deduplication if scraping same page twice.
			// But bad if merging pages?
			// "Keep a continious list... appending".
			// If Page 1 has Line 1. Page 2 has Line 1.
			// Then final CSV has multiple Line 1s.
			// User might expect global numbering 1..Total?
			// "populate each one with it's row number, starting a number 1".
			// Usually implies per-sheet.
			// If user wants global, I'd need to re-index in Popup.
			// Given "Add a new column...", it implies extraction logic.
			// I will stick to per-page 1..N.
			// If user wants global, they can re-number in Excel or I can update popup to re-inject Line numbers.
			// Let's stick to safe local numbering for now.

			// To support Popup Dedupe ignoring "line" (or handling same-page-scrape):
			// If I scrape same page twice -> Same Lines, Same Data -> Deduped. Correct.
			// If I scrape next page -> Same Lines, Diff Data -> Kept. Correct.

			// Dedupe check locally in this function (for the single page scrape)
			// We ignore "line" for local dedupe?
			const signatureObj = { ...orderedData };
			delete signatureObj.line;
			const signature = JSON.stringify(signatureObj);

			if (!seenRows.has(signature)) {
				seenRows.add(signature);
				data.push(orderedData);
			}


		}
	}

	return data;
}

// --- HELPERS ---

function abbreviateState(input) {
	const states = {
		'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
		'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
		'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
		'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
		'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
		'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
		'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
		'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
		'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
		'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
		'district of columbia': 'DC'
	};
	const lower = input.toLowerCase().trim();
	return states[lower] || input;
}

function normalizeFirstName(name) {
	if (!name) return "";
	let clean = name.replace(/[^a-zA-Z]/g, '').toUpperCase();

	const map = {
		// William
		"WM": "WILLIAM", "BILL": "WILLIAM", "BILLY": "WILLIAM",
		"WILL": "WILLIAM", "WILLY": "WILLIAM", "WILLIE": "WILLIAM",

		// Robert
		"ROBT": "ROBERT", "ROB": "ROBERT", "BOB": "ROBERT",
		"BOBBY": "ROBERT", "ROBBIE": "ROBERT",

		// James
		"JAS": "JAMES", "JIM": "JAMES", "JIMMY": "JAMES", "JAMIE": "JAMES",

		// Charles
		"CHAS": "CHARLES", "CHARLIE": "CHARLES", "CHUCK": "CHARLES", "CARL": "CHARLES",

		// Thomas
		"THOS": "THOMAS", "TOM": "THOMAS", "TOMMY": "THOMAS",

		// John
		"JNO": "JOHN", "JON": "JOHN", "JACK": "JOHN", "JACKIE": "JOHN",
		"JONNY": "JOHN", "JOHNNY": "JOHN",

		// Daniel
		"DAN": "DANIEL", "DANNY": "DANIEL",

		// Edward
		"ED": "EDWARD", "EDDIE": "EDWARD", "NED": "EDWARD", "TED": "EDWARD", "TEDDY": "EDWARD",

		// George
		"GEO": "GEORGE",

		// Joseph
		"JOS": "JOSEPH", "JOE": "JOSEPH", "JOEY": "JOSEPH",

		// Samuel
		"SAM": "SAMUEL", "SAMMY": "SAMUEL",

		// Alexander
		"ALEX": "ALEXANDER", "ALECK": "ALEXANDER", "ALEC": "ALEXANDER",
		"SANDY": "ALEXANDER",

		// Patrick
		"PAT": "PATRICK", "PADDY": "PATRICK",

		// Matthew
		"MATT": "MATTHEW", "MAT": "MATTHEW",

		// Michael
		"MIKE": "MICHAEL", "MICK": "MICHAEL", "MICKEY": "MICHAEL",
		"MICH": "MICHAEL",

		// David
		"DAVE": "DAVID", "DAVEY": "DAVID", "DAVY": "DAVID",

		// Christopher
		"CHRIS": "CHRISTOPHER", "KIT": "CHRISTOPHER",

		// Richard
		"RICH": "RICHARD", "RICK": "RICHARD", "DICK": "RICHARD",
		"RICHD": "RICHARD", "DICKY": "RICHARD",

		// Henry
		"HARRY": "HENRY", "HAL": "HENRY", "HEN": "HENRY",

		// Benjamin
		"BEN": "BENJAMIN", "BENNY": "BENJAMIN", "BENJ": "BENJAMIN",

		// Frederick
		"FRED": "FREDERICK", "FREDDY": "FREDERICK", "FREDK": "FREDERICK",

		// Francis
		"FRANK": "FRANCIS", "FRAN": "FRANCIS", "FRAS": "FRANCIS",

		// Andrew
		"ANDY": "ANDREW",

		// Anthony
		"TONY": "ANTHONY", "ANT": "ANTHONY",

		// Arthur
		"ART": "ARTHUR", "ARTIE": "ARTHUR",

		// Albert
		"AL": "ALBERT", "ALB": "ALBERT",

		// Alfred
		"ALF": "ALFRED", "ALFIE": "ALFRED",

		// Walter
		"WALT": "WALTER", "WALLY": "WALTER",

		// Peter
		"PETE": "PETER",

		// Stephen/Steven
		"STEVE": "STEPHEN", "STEPH": "STEPHEN",

		// Nicholas
		"NICK": "NICHOLAS", "NICKY": "NICHOLAS",

		// Nathaniel
		"NAT": "NATHANIEL", "NATE": "NATHANIEL", "NATHL": "NATHANIEL",

		// Abraham
		"ABE": "ABRAHAM",

		// Isaac
		"IKE": "ISAAC",

		// Elijah
		"LI": "ELIJAH", "LIJE": "ELIJAH",

		// Emanuel / Emmanuel
		"MANNY": "EMANUEL", "MANUEL": "EMANUEL",

		// Harvey
		"HARV": "HARVEY",

		// Lewis / Louis
		"LEW": "LEWIS",

		// Moses
		"MOSE": "MOSES",

		// Solomon
		"SOL": "SOLOMON",

		// Tobias
		"TOBY": "TOBIAS",

		// Jeremiah
		"JERRY": "JEREMIAH", "JER": "JEREMIAH",

		// Ezekiel
		"ZEKE": "EZEKIEL",

		// Cornelius
		"NEIL": "CORNELIUS", "CORN": "CORNELIUS",

		// Bartholomew
		"BART": "BARTHOLOMEW",

		// Edmund
		"ED": "EDMUND",  // overlaps with Edward — order-dependent; keep Edward last if you split

		// Archibald
		"ARCH": "ARCHIBALD", "ARCHIE": "ARCHIBALD",

		// Augustus
		"GUS": "AUGUSTUS",

		// Ambrose
		"AMB": "AMBROSE",

		// Zachariah / Zachary
		"ZACH": "ZACHARIAH", "ZACK": "ZACHARIAH",

		// ---------- Female names ----------

		// Elizabeth
		"LIZ": "ELIZABETH", "LIZZIE": "ELIZABETH", "LIZZY": "ELIZABETH",
		"BETH": "ELIZABETH", "BETTY": "ELIZABETH", "BETTE": "ELIZABETH",
		"BESS": "ELIZABETH", "BESSIE": "ELIZABETH", "ELIZA": "ELIZABETH",
		"ELIZ": "ELIZABETH", "LIBBY": "ELIZABETH",

		// Mary
		"MOLLY": "MARY", "POLLY": "MARY", "MAE": "MARY", "MAMIE": "MARY",

		// Margaret
		"MAG": "MARGARET", "MAGGIE": "MARGARET", "MEG": "MARGARET",
		"PEGGY": "MARGARET", "MARG": "MARGARET", "MARGT": "MARGARET",
		"RITA": "MARGARET",

		// Catherine / Katherine
		"KATE": "CATHERINE", "KATIE": "CATHERINE", "KIT": "CATHERINE",
		"KITTY": "CATHERINE", "KATH": "CATHERINE",

		// Sarah
		"SARA": "SARAH", "SALLY": "SARAH", "SAL": "SARAH",

		// Susan / Susannah
		"SUE": "SUSAN", "SUSIE": "SUSAN", "SUSY": "SUSAN",
		"SUSY": "SUSANNAH", "SUSA": "SUSANNAH",

		// Ann / Anne / Hannah
		"ANNIE": "ANN", "ANNA": "ANN", "NAN": "ANN", "NANNY": "ANN",
		"HANNA": "HANNAH",

		// Martha
		"MART": "MARTHA", "MATTIE": "MARTHA",

		// Rebecca
		"BECCA": "REBECCA", "BECKY": "REBECCA",

		// Caroline / Carolina
		"CARRIE": "CAROLINE", "CAROL": "CAROLINE",

		// Eleanor
		"NELL": "ELEANOR", "NELLIE": "ELEANOR", "NORA": "ELEANOR",

		// Frances
		"FANNY": "FRANCES",

		// Harriet
		"HATTIE": "HARRIET",

		// Louisa
		"LOU": "LOUISA", "LULA": "LOUISA",

		// Matilda
		"TILLY": "MATILDA", "TILLIE": "MATILDA",

		// Virginia
		"GINNY": "VIRGINIA",

		// Lavinia
		"VINA": "LAVINIA", "VINEY": "LAVINIA",

		// Priscilla
		"PRISSY": "PRISCILLA", "CILLA": "PRISCILLA",

		// Delilah
		"DELIA": "DELILAH", "LILA": "DELILAH",

		// Lucinda
		"LUCY": "LUCINDA",

		// Phillis / Phyllis (common in enslaved records)
		"PHILLIS": "PHYLLIS",

		// Minerva
		"MINNIE": "MINERVA",
	};

	return map[clean] || clean;
}

function nysiis(name) {
	if (!name) return "";
	// 1. Alpha only, Upper
	name = name.replace(/[^a-zA-Z]/g, '').toUpperCase();
	if (!name) return "";

	// 2. Beginning
	if (name.startsWith("MAC")) name = "MC" + name.slice(3);
	else if (name.startsWith("KN")) name = "N" + name.slice(2);
	else if (name.startsWith("SCH")) name = "S" + name.slice(3);

	// 3. End
	if (name.endsWith("EE") || name.endsWith("IE")) name = name.slice(0, -2) + "Y";
	else if (name.endsWith("DT") || name.endsWith("RT") || name.endsWith("RD") || name.endsWith("NT") || name.endsWith("ND")) name = name.slice(0, -2) + "D";

	// remove trailing S or A
	if (name.endsWith("S")) name = name.slice(0, -1);
	if (name.endsWith("A")) name = name.slice(0, -1);

	// 4. Within name (Loop)
	let s = name.split('');
	let len = s.length;
	let res = [];

	// Helper: isVowel
	const isVowel = (c) => ['A', 'E', 'I', 'O', 'U'].includes(c);

	// Iterate
	for (let i = 0; i < len; i++) {
		let curr = s[i];
		let next = s[i + 1] || "";
		let prev = (i > 0) ? s[i - 1] : ""; // Get previous char from original string

		// a. Vowels -> A
		if (isVowel(curr)) {
			res.push('A');
			continue;
		}

		// b. Q->G, Z->S, M->N
		if (curr === 'Q') { res.push('G'); continue; }
		if (curr === 'Z') { res.push('S'); continue; }
		if (curr === 'M') { res.push('N'); continue; }

		// c. PH->F, K->C
		if (curr === 'P' && next === 'H') {
			res.push('F');
			i++; // skip H
			continue;
		}
		if (curr === 'K') {
			res.push('C');
			continue;
		}

		// d. H removed if preceding OR following is not a vowel
		// This means H is kept ONLY IF (preceding IS vowel AND following IS vowel)
		if (curr === 'H') {
			const preVow = isVowel(prev);
			const nextVow = isVowel(next);
			if (preVow && nextVow) {
				res.push('H');
			}
			continue; // If not kept, it's removed (do nothing)
		}

		// e. W removed if preceding is vowel
		// This means W is kept ONLY IF (preceding IS NOT vowel)
		if (curr === 'W') {
			if (!isVowel(prev)) {
				res.push('W');
			}
			continue; // If not kept, it's removed (do nothing)
		}

		// Default: keep character
		res.push(curr);
	}

	// 5. Collapse duplicates
	let final = "";
	if (res.length > 0) final = res[0];
	for (let k = 1; k < res.length; k++) {
		if (res[k] !== res[k - 1]) {
			final += res[k];
		}
	}

	return final;
}

function levenshtein(a, b) {
	const tmp = [];
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	for (let i = 0; i <= b.length; i++) tmp[i] = [i];
	for (let j = 0; j <= a.length; j++) tmp[0][j] = j;

	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			tmp[i][j] = (b[i - 1] === a[j - 1])
				? tmp[i - 1][j - 1]
				: Math.min(tmp[i - 1][j - 1], tmp[i][j - 1], tmp[i - 1][j]) + 1;
		}
	}
	return tmp[b.length][a.length];
}

function normalizeOccupation(val) {
	if (!val) return "";

	let work = val.toLowerCase();
	work = work.replace(/[^a-z0-9\s]/g, " ");

	const removals = [
		"assistant", "assist", "intern",
		"apprenticed", "apprentice", "appren", "app"
	];
	const removeRegex = new RegExp(`\\b(${removals.join('|')})\\b`, 'g');
	work = work.replace(removeRegex, '');
	work = work.replace(/\s+/g, ' ').trim();

	const table = [
		{ "label": "Agriculture", "examples": "farmer, farmhand, planter, gardener, cattle work, dairyman, shepherd, hostler, farm" },
		{ "label": "Food", "examples": "baker, butcher, miller, flour work, confectioner" },
		{ "label": "Textile", "examples": "tailor, seamstress, dressmaker, weaver, spinner" },
		{ "label": "Leather", "examples": "shoemaker, saddler, tanner, harness maker, shoe maker" },
		{ "label": "Metal", "examples": "blacksmith, silversmith, tinsmith, gunsmith, locksmith, b smith, blk smith, blk-smith, bsmith" },
		{ "label": "Woodwork", "examples": "carpenter, cabinetmaker, wheelwright, chairmaker" },
		{ "label": "Construction", "examples": "mason, brickmaker, plasterer, painter, slater" },
		{ "label": "Transportation", "examples": "railroad worker, railroad, conductor, engineer, brakeman, flagman, boatman, ferryman, sailor, waterman, teamster, drayman, wagoner, driver, expressman, rail road, r road, r r road, r r" },
		{ "label": "Domestic", "examples": "domestic, servant, cook, butler, chambermaid, housekeeper, laundress, washerwoman, nurse, governess, keeping house, keep house, at home, house keeper, maid, house" },
		{ "label": "Commerce", "examples": "merchant, grocer, dealer, trader, storekeeper" },
		{ "label": "Office", "examples": "clerk, bookkeeper, accountant, copyist" },
		{ "label": "Profession", "examples": "lawyer, physician, surveyor, architect, dentist, banker, photographer, doctor, nurse" },
		{ "label": "Education", "examples": "teacher, professor, school, university, prof, college" },
		{ "label": "Religion", "examples": "minister, preacher, librarian" },
		{ "label": "Manufacturing", "examples": "machinist, factory worker, foundry worker, manufacturer, factory, foundry" },
		{ "label": "Extraction", "examples": "miner, coal worker, quarryman, well digger, coal" },
		{ "label": "Government", "examples": "police, sheriff, constable, judge, jailer, postmaster, tax collector, inspector, enumerator, post master, post mistress, mayor" },
		{ "label": "Hospitality", "examples": "hotel keeper, saloonkeeper, bartender, waiter, boarding house keeper, hotel, boarding house" },
		{ "label": "Craftsman", "examples": "jeweler, watchmaker, printer, cooper" },
		{ "label": "Laborer", "examples": "laborer, helper, assistant, errand boy, errand" }
	];

	// Extract standard exact substring match
	for (const entry of table) {
		const examples = entry.examples.split(',');
		for (let ex of examples) {
			let key = ex.toLowerCase().trim();
			if (key && work.includes(key)) {
				return entry.label;
			}
		}
	}

	// Fuzzy
	let minDistance = 100;
	let matchLabel = null;
	for (const entry of table) {
		const examples = entry.examples.split(',');
		for (let ex of examples) {
			let key = ex.toLowerCase().trim();
			if (!key) continue;

			const dist = levenshtein(work, key);
			if (dist < minDistance) {
				minDistance = dist;
				matchLabel = entry.label;
			}
		}
	}

	if (matchLabel && minDistance <= 2) {
		return matchLabel;
	}

	return val.replace(/[^\w\s]/g, "").toUpperCase();
}
