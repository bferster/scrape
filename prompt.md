TASK:

I am a genealogical researcher.
I want to create an app that can scrape data from a web page into a table structure.
THe data exists on webpages that are not mine and I do not have access to the data.

SITE TO SCRAPE:

This is the first page of the site I want to scrape:
familysearch.org/ark:/61903/3:1:S3HY-6QYY-DR?wc=KPWR-N38%3A518656301%2C518715801%2C518715802%26cc%3D1438024&cc=1438024&lang=en
This is a transcription of the US census data from 1870 Charlottesville in Albemarle County, Virginia.

DATA I WANT TO SCRAPE FROM THE SITE:

Automatically select all items on the page
Extract all the data highlighted in blue that has been selected.
Extract data from all the columns
Ignore data in the first two columns.
Warn user that there is data in the table when starting the scrape.

CLEAN THE DATA:

Rename the "Name" column to "full_name".
Rename the "Birthplace" column to "birth_place".
Rename the "Birth Year:" column to "birth_year".
Rename the "Sex" column to "gender".
Rename the "Race" column to "race".
Rename the "Age" column to "age".
Rename the "Relationship to Head of Household" column to "head".
If source file has a page with the string "relation" in it, extract value and put value in "relation" column for output.
Rename the "Page Number" column to "page".

Add these new columns to the table:
	line
	district
	family
	first_name
	middle_name
	last_name
	norm_race
	norm_occupation
	norm_first_name	
	nysiis_last_name

All column header names must be lower case with each word separated by an underscore.
Remove all punctuation from header names.

The preview table should only show the first 10 rows.

after all rows have been scraped:
	for each row:
		Consider only the string in the full_name column {
			Remove any dots and commas.
			If the full_name has only one word, then add that word to last_name.
			If the full_name has two words, then first_name is the first word and last_name is the last word.
			If the full_name has more than two words, then first_name is the first word, middle_name is the second word, and last_name is the last word.
			if the full_name has a jr or sr or ii or iii or iv or 2nd or 3rd or 4th or 5th, use the word before it as the last_name.
			remove all punctuation from middle name.
			}
		
		if race is "Black" then race is "B" and add "B" to the norm_race column.
		if race is "White" then race is "W" and add "W" to the norm_race column.
		if race is "Other" then race is "O" and add "O" to the norm_race column.
		if race is "Unknown" then race is "U" and add "U" to the norm_race column.
		if race is "Mulatto" then race is "M" and add "B" to the norm_race column.
		if race is "Chinese" then race is "C" and add "W" to the norm_race column.
		if race is "Yellow" then race is "Y" and add "W" to the norm_race column.
		if race is "Octoroon" then race is "O" and add "B" to the norm_race column.
		if race is "Indian" then race is "I".

		if gender is "Male" then gender is "M".
		if gender is "Female" then gender is "F".
		if marital_status is "Single" then marital_status is "S".
		if marital_status is "Married" then marital_status is "M".
		if marital_status is "Widowed" then marital_status is "W".
		if marital_status is "Divorced" then marital_status is "D".
		if marital_status is "Separated" then marital_status is "Sp".
		if marital_status is "Unknown" then marital_status is "U".
		if marital_status is "Other" then marital_status is "O".

		If there is a value in the occupation column, then use the following formula {
			Convert the value to a normalized value using the normalized_occupations table found below.
			Put the normalized value in the norm_occupation column and leave the occupation column as is.
			Ignore case when normalizing.
			Remove all punctuation from occupation before normalizing.
			Remove the words Assist or Assistant or intern or app or appren. apprentice or apprenticed  from occupation.
			It is not necessary to match occupations exactly when normalizing for example “house keeper” and “house keeping” should both map to Domestic.
			If occupation has "school " or "university" or "prof" in it,  normalize it to "Education".
			If occupation has “farm” in it, normalize it to "Agriculture".
			If occupation has “maid” or “house” in it, normalize it to "Domestic".
			If occupation has “r r” in it, normalize it to "Transportation".
			If occupation does not match any of the categories, try to find the closest category that matches it. Do not make up any new categories.
			Make uppercase.
			}

		if the column name has the string "place" in it {
			if it has "United States" in the string, remove "United States" from the string, as well as the comma
			if it is a U.S state name, replace that with its two letter abbreviation.
			}

		In the "norm_first_name" column:
			for each row, encode the "first_name" column using the following procedure and put the result in the "norm_first_name":
				1. Remove all non-alphabetic characters and convert the name to uppercase.
				2. convert all abbreviations to full names, e.g. "Wm" to "William", "Robt" to "Robert", "Jas" to "James", etc.
				3. Convert all nicknames to full names, e.g. "Bill" to "William", "Bob" to "Robert", "Jim" to "James", etc.

		In the "nysiis_last_name" column:
			for each row, encode the "last_name" column using the following NYSIIS procedure and put the result in the "nysiis_last_name"
				1. Remove all non-alphabetic characters and convert the name to uppercase.
				2. At the beginning of name:
					a. MAC becomes MC.
					b. KN becomes N.
					c. SCH becomes S.
				3. At end of name:
					a. EE or IE becomes Y.
					b. DT, RT, RD, NT, or ND becomes D.
					c. Remove trailing S, or A.
				4. Within the name:
					a. Vowels (A, E, I, O, U) are all converted to A.
					b. Q becomes G, Z becomes S, M becomes N.
					c. PH becomes F, K becomes C.
					d. H is removed if the preceding or following character is not a vowel.
					e. W is removed if the preceding character is a vowel.
				5. Collapse all duplicate consecutive characters (e.g., AA becomes A). 

		In the "line" column:
			for each row, populate each one with its row number, starting at number 1.

		In the "age" column:
			for each row, convert "months" to "/12" and remove "years" and any spaces.

		In the "head" column:
			for each row, if there is a value in the "head" column, set it to "Y", otherwise leave it blank.
			


	Put columns in this order when saving to file:
		line
		district
		dwelling
		family
		full_name
		first_name
		middle_name
		last_name
		age
		birth_year
		gender
		race
		occupation
		birth_place
		Any other columns in the table should go here.
		norm_race
		norm_first_name
		nysiis_last_name	
		norm_occupation
		head

Keep a continuous list of data scraped, appending each scrape to the previous scrapes.
All columns in the table data being scraped should be included in the file.

Always show how many rows were just scraped and the total rows in memory. This should show constantly in a footer.
Make sure internal memory is sufficient to store all data.	
Wait 6 seconds before scraping each page.
Click on the button with the name "Next-Image" to go to the next page.
If the "Next-Image" button is not found, look for a button with the name "Next" and click on it instead.
Automatically click the "Next Image" button after scraping.
If a page does not have data, skip it and go to the next page.
Add input to set how many pages to loop through.
Add two input boxes: "New field" and "Value". If there is anything entered in the new field input, create a field with that name and put the value field's value in it.
Before downloading remove any duplicate rows.
When that many pages have been scraped, download the file.

THE APP MUST:

Make sure internal memory is sufficient to store all data.
Popup should stay persistent if the window is hidden or resized.
Make sure the popup is large enough to show all UI elements

Use plain vanilla JavaScript and jQuery.
Create as a Chrome extension.	

normalized_occupations_table[
  {
    "label": "Agriculture",
    "title": "Agricultural & Farming",
    "examples": "farmer, farmhand, planter, gardener, cattle work, dairyman, shepherd, hostler"
  },
  {
    "label": "Food",
    "title": "Food Production & Processing",
    "examples": "baker, butcher, miller, flour work, confectioner"
  },
  {
    "label": "Textile",
    "title": "Textile & Clothing",
    "examples": "tailor, seamstress, dressmaker, weaver, spinner"
  },
  {
    "label": "Leather",
    "title": "Leather & Footwear",
    "examples": "shoemaker, shoe maker, saddler, tanner, harness maker"
  },
  {
    "label": "Metal",
    "title": "Metalworking & Smithing",
    "examples": "blacksmith, silversmith, tinsmith, gunsmith, locksmith, b smith, blk-smith, bsmith"
  },
  {
    "label": "Woodwork",
    "title": "Woodworking & Furniture",
    "examples": "carpenter, cabinetmaker, wheelwright, chairmaker"
  },
  {
    "label": "Construction",
    "title": "Construction & Building",
    "examples": "mason, brickmaker, plasterer, painter, slater"
  },
  {
    "label": "Transportation",
    "title": "Railroad & Transportation",
    "examples": "railroad worker, railroad, conductor, engineer, brakeman, flagman, boatman, ferryman, sailor, waterman, teamster, drayman, wagoner, driver, expressman, rail road"
  },
  {
    "label": "Domestic",
    "title": "Domestic Service",
    "examples": "domestic, servant, cook, butler, chambermaid, housekeeper, laundress, washerwoman, nurse, governess, keep house, keeping house, at home, house keeper, house-keeping"
  },
  {
    "label": "Commerce",
    "title": "Retail & Commerce",
    "examples": "merchant, grocer, dealer, trader, storekeeper"
  },
  {
    "label": "Office",
    "title": "Clerical & Office Work",
    "examples": "clerk, bookkeeper, accountant, copyist"
  },
  {
    "label": "Profession",
    "title": "Professional Services",
    "examples": "lawyer, physician, surveyor, architect, photographer, doctor, dentist, banker, nurse"
  },
  {
    "label": "Education",
    "title": "Education",
    "examples": "teacher, college,professor, school, university prof"
  },
  {
    "label": "Religion",
    "title": "Religion",
    "examples": "minister, preacher, librarian"
  },
  {
    "label": "Manufacturing",
    "title": "Manufacturing & Industrial",
    "examples": "machinist, factory [worker], foundry [worker], manufacturer"
  },
  {
    "label": "Extraction",
    "title": "Mining & Extraction",
    "examples": "miner, coal [worker], quarryman, well digger"
  },
  {
    "label": "Government",
    "title": "Public Service & Law Enforcement",
    "examples": "police, sheriff, constable, judge, jailer, postmaster, tax collector, inspector, enumerator, mayor, post master, post mistress"
  },
  {
    "label": "Hospitality",
    "title": "Hospitality & Food Service",
    "examples": "hotel [keeper], saloonkeeper, bartender, waiter, boarding house [keeper]"
  },
  {
    "label": "Craftsman",
    "title": "Skilled Artisans & Crafts",
    "examples": "jeweler, watchmaker, printer, cooper"
  },
  {
    "label": "Laborer",
    "title": "General Labor & Assistance",
    "examples": "laborer, helper, assistant, errand [boy]"
  }
]


**CN-1870 DOCS EDITS**

familyNum=1 
for each row { 
	if head is == "Y" put familyNum in family column for the sucessive rows until the head becomes "Y" again, and then increment familyNum.
	}

**CN-1880 DOCS EDITS**

if person_number is == "0" put a "Y" in head column

familyNum=1 
for each row { 
	if person_number is == "0" put familyNum in family column for the sucessive rows until the person number becomes "0" again, and then increment familyNum.
	}

**Add the /Src filder to pack extension files so they can be installed.**