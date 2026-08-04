chrome.action.onClicked.addListener((tab) => {
	chrome.windows.create({
		url: `popup.html?tabId=${tab.id}`,
		type: "popup",
		width: 500,
		height: 700
	});
});
