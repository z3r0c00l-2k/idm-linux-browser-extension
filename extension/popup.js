var current_browser;

try {
	current_browser = browser;
	current_browser.runtime.getBrowserInfo().then(
		function(info) {
			if (info.name === 'Firefox') {
				// Do nothing
			}
		}
	);
} catch (ex) {
	// Not Firefox
	current_browser = chrome;
}

function saveChanges() {
	var keywordsToExclude = document.getElementById("keywordsToExclude").value.trim();
	var keywordsToInclude = document.getElementById("keywordsToInclude").value.trim();
	var interrupt = document.getElementById('chk-interrupt').checked;
	var minFileSize = parseInt(document.getElementById("fileSize").value) * 1024;
	if (isNaN(minFileSize)) {
		minFileSize = 300 * 1024;
	} else if(minFileSize < 0) {
		minFileSize = -1024;	// Which is -1 KB
	}

	current_browser.runtime.getBackgroundPage(function(backgroundPage) {
		backgroundPage.updateKeywords(keywordsToInclude, keywordsToExclude);
		backgroundPage.setInterruptDownload(interrupt, true);
		backgroundPage.updateMinFileSize(minFileSize);
	});

	window.close();
}

// When the popup HTML has loaded
window.addEventListener('load', function(evt) {
	// Show the system status
	current_browser.runtime.getBackgroundPage(function(backgroundPage) {
		var state = backgroundPage.getState();
		if (state == 0) {
			document.getElementById('info').style.display = 'block';
			document.getElementById('warn').style.display = 'none';
			document.getElementById('error').style.display = 'none';
		} else if (state == 1) {
			document.getElementById('info').style.display = 'none';
			document.getElementById('warn').style.display = 'block';
			document.getElementById('error').style.display = 'none';
		} else {
			document.getElementById('info').style.display = 'none';
			document.getElementById('warn').style.display = 'none';
			document.getElementById('error').style.display = 'block';
		}
	});

	let interrupt = (current_browser.storage.sync["idm-interrupt"] == "true");
	document.getElementById('save').addEventListener('click', saveChanges);
	current_browser.storage.sync.get(function(items) {
		document.getElementById('keywordsToExclude').value = items["idm-keywords-exclude"];
		document.getElementById('keywordsToInclude').value = items["idm-keywords-include"];
		document.getElementById('fileSize').value = parseInt(items["idm-min-file-size"]) / 1024;
		document.getElementById('chk-interrupt').checked = items["idm-interrupt"] == "true";
	});
});