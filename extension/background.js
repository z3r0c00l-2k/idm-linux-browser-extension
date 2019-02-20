var EXTENSION_VERSION = "0.1";
var REQUIRED_WRAPPER_VERSION = "0.1";
var interruptDownloads = true;
var idmWrapperNotFound = true;
var disposition = '';
var hostName;
var idmWrapperVersion;
var idmVersion = '';
var chromeVersion;
var firefoxVersion;
var minFileSizeToInterrupt = 300 * 1024; // 300 kb
var current_browser;
var filter = [];
var keywordsToExclude = [];
var keywordsToInclude = [];
var cookies = '';
var requestList = [{
    cookies: '',
    postData: '',
    id: ''
}, {
    cookies: '',
    postData: '',
    id: ''
}, {
    cookies: '',
    postData: '',
    id: ''
}];
var currRequest = 0;
try {
    chromeVersion = /Chrome\/([0-9]+)/.exec(navigator.userAgent)[1];
} catch (ex) {
    chromeVersion = 33;
}

firefoxVersion = 0;
current_browser = chrome;
hostName = 'org.z3r0c00l_2k.idmchromewrapper';

current_browser.commands.onCommand.addListener(function(command) {
    if ("toggle-interruption" === command) {
        // Toggle
        setInterruptDownload(!interruptDownloads, true);
    }
});

chromeVersion = parseInt(chromeVersion);
sendMessageToHost({
    version: EXTENSION_VERSION
});

// Read the storage for excluded keywords
current_browser.storage.sync.get(function(items) {
    if (items["idm-keywords-exclude"]) {
        keywordsToExclude = items["idm-keywords-exclude"].split(/[\s,]+/);
    } else {
        current_browser.storage.sync.set({ "idm-keywords-exclude": '' });
    }

    // Read the local storage for included keywords
    if (items["idm-keywords-include"]) {
        keywordsToInclude = items["idm-keywords-include"].split(/[\s,]+/);
    } else {
        current_browser.storage.sync.set({ "idm-keywords-include": '' });
    }

    // Read the local storage for the minimum file-size to interrupt
    if (items["idm-min-file-size"]) {
        minFileSizeToInterrupt = parseInt(items["idm-min-file-size"]);
    } else {
        current_browser.storage.sync.set({ "idm-min-file-size": minFileSizeToInterrupt });
    }

    // Read the local storage for enabled flag
    if (!items["idm-interrupt"]) {
        // Keep the value string
        current_browser.storage.sync.set({ "idm-interrupt": 'true' });
    } else {
        var interrupt = (items["idm-interrupt"] == "true");
        setInterruptDownload(interrupt);
    }
});
// Message format to send the download information to the idm-integrator
var message = {
    url: '',
    cookies: '',
    useragent: '',
    fileName: '',
    fileSize: '',
    referrer: '',
    postData: '',
    batch: false
};

// Create context menu items
current_browser.contextMenus.create({
    title: 'Download with idm',
    id: "download_with_idm",
    contexts: ['link']
});

current_browser.contextMenus.onClicked.addListener(function(info, tab) {
    "use strict";
    if (info.menuItemId === "download_with_idm") {
        message.url = info['linkUrl'];
        message.referrer = info['pageUrl'];
        current_browser.cookies.getAll({ 'url': extractRootURL(info.pageUrl) }, parseCookies);
    } 
});

// Interrupt downloads on creation
current_browser.downloads.onCreated.addListener(function(downloadItem) {

    if (idmWrapperNotFound || !interruptDownloads) { // idm-integrator not installed
        return;
    }

    if ("in_progress" !== downloadItem['state'].toString().toLowerCase()) {
        return;
    }

    var fileSize = downloadItem['fileSize'];

    var url = '';
    if (chromeVersion >= 54) {
        url = downloadItem['finalUrl'];
    } else {
        url = downloadItem['url'];
    }
    if (fileSize < minFileSizeToInterrupt && !isWhiteListed(url)) {
        return;
    }
    if (isBlackListed(url)) {
        return;
    }
    // Cancel the download
    current_browser.downloads.cancel(downloadItem.id);
    // Erase the download from list
    current_browser.downloads.erase({
        id: downloadItem.id
    });

    message.url = url;
    message.fileName = unescape(downloadItem['filename']).replace(/\"/g, "");
    message.fileSize = fileSize;
    message.referrer = downloadItem['referrer'];
    current_browser.cookies.getAll({ 'url': extractRootURL(url) }, parseCookies);
});

current_browser.webRequest.onBeforeRequest.addListener(function(details) {
    if (details.method === 'POST') {
        message.postData = postParams(details.requestBody.formData);
    }
    return {
        requestHeaders: details.requestHeaders
    };
}, {
    urls: [
        '<all_urls>'
    ],
    types: [
        'main_frame',
        'sub_frame'
    ]
}, [
    'blocking',
    'requestBody'
]);
current_browser.webRequest.onBeforeSendHeaders.addListener(function(details) {
    currRequest++;
    if (currRequest > 2)
        currRequest = 2;
    requestList[currRequest].id = details.requestId;
    for (var i = 0; i < details.requestHeaders.length; ++i) {
        if (details.requestHeaders[i].name.toLowerCase() === 'user-agent') {
            message.useragent = details.requestHeaders[i].value;
        } else if (details.requestHeaders[i].name.toLowerCase() === 'referer') {
            requestList[currRequest].referrer = details.requestHeaders[i].value;
        } else if (details.requestHeaders[i].name.toLowerCase() === 'cookie') {
            requestList[currRequest].cookies = details.requestHeaders[i].value;
        }
    }
    return {
        requestHeaders: details.requestHeaders
    };
}, {
    urls: [
        '<all_urls>'
    ],
    types: [
        'main_frame',
        'sub_frame',
        'xmlhttprequest'
    ]
}, [
    'blocking',
    'requestHeaders'
]);
current_browser.webRequest.onHeadersReceived.addListener(function(details) {

    if (idmWrapperNotFound) { // idm-integrator not installed
        return {
            responseHeaders: details.responseHeaders
        };
    }

    if (!details.statusLine.includes("200")) { // HTTP response is not OK
        return {
            responseHeaders: details.responseHeaders
        };
    }

    if (isBlackListed(details.url)) {
        return {
            responseHeaders: details.responseHeaders
        };
    }

    var interruptDownload = false;
    message.url = details.url;
    var contentType = "";

    for (var i = 0; i < details.responseHeaders.length; ++i) {
        if (details.responseHeaders[i].name.toLowerCase() == 'content-length') {
            message.fileSize = details.responseHeaders[i].value;
            var fileSize = parseInt(message.fileSize);
            if (fileSize < minFileSizeToInterrupt && !isWhiteListed(message.url)) {
                return {
                    responseHeaders: details.responseHeaders
                };
            }
        } else if (details.responseHeaders[i].name.toLowerCase() == 'content-disposition') {
            disposition = details.responseHeaders[i].value;
            if (disposition.lastIndexOf('filename') != -1) {
                message.fileName = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)[1];
                message.fileName = unescape(message.fileName).replace(/\"/g, "");
                interruptDownload = true;
            }
        } else if (details.responseHeaders[i].name.toLowerCase() == 'content-type') {
            contentType = details.responseHeaders[i].value;
            if (/\b(?:xml|rss|javascript|json|html|text)\b/.test(contentType)) {
                interruptDownload = false;
                return {
                    responseHeaders: details.responseHeaders
                };
            } else if (/\b(?:application\/|video\/|audio\/)\b/.test(contentType) == true) {
                interruptDownload = true;
            } else {
                return {
                    responseHeaders: details.responseHeaders
                };
            }
        }
    }
    if (interruptDownload && interruptDownloads) {
        for (var i = 0; i < filter.length; i++) {
            if (filter[i] != "" && contentType.lastIndexOf(filter[i]) != -1) {
                return {
                    responseHeaders: details.responseHeaders
                };
            }
        }
        for (var j = 0; j < 3; j++) {
            if (details.requestId == requestList[j].id && requestList[j].id != "") {
                message.referrer = requestList[j].referrer;
                message.cookies = requestList[j].cookies;
                break;
            }
        }
        if (details.method != "POST") {
            message.postData = '';
        }
        current_browser.cookies.getAll({ 'url': extractRootURL(message.url) }, parseCookies);
        var scheme = /^https/.test(details.url) ? 'https' : 'http';
        if (chromeVersion >= 35 || firefoxVersion >= 51) {
            return {
                redirectUrl: "javascript:"
            };
        } else if (details.frameId === 0) {
            current_browser.tabs.update(details.tabId, {
                url: "javascript:"
            });
            var responseHeaders = details.responseHeaders.filter(function(header) {
                var name = header.name.toLowerCase();
                return name !== 'content-type' &&
                    name !== 'x-content-type-options' &&
                    name !== 'content-disposition';
            }).concat([{
                name: 'Content-Type',
                value: 'text/plain'
            }, {
                name: 'X-Content-Type-Options',
                value: 'nosniff'
            }]);
            return {
                responseHeaders: responseHeaders
            };
        }
        return {
            cancel: true
        };
    } else {
        clearMessage();
    }
    return {
        responseHeaders: details.responseHeaders
    };
}, {
    urls: [
        '<all_urls>'
    ],
    types: [
        'main_frame',
        'sub_frame'
    ]
}, [
    'responseHeaders',
    'blocking'
]);


/**
 * Send message to the idm-integrator
 */
function sendMessageToHost(message) {
    current_browser.runtime.sendNativeMessage(hostName, message, function(response) {
        clearMessage();
        idmWrapperNotFound = (response == null);
        if (!idmWrapperNotFound && !idmWrapperVersion) {
            idmWrapperVersion = response.version;
            idmVersion = response.idm;
        }
    });
}

/**
 * Return the internal state.
 */
function getState() {
    if (idmWrapperNotFound || !idmWrapperVersion) {
        return 2;
    } else if (!idmWrapperVersion.startsWith(REQUIRED_WRAPPER_VERSION)) {
        return 1;
    } else {
        return 0;
    }
}

/**
 * Clear the message.
 */
function clearMessage() {
    message.url = '';
    message.cookies = '';
    message.fileName = '';
    message.fileSize = '';
    message.referrer = '';
    message.useragent = '';
    message.batch = false;
}

/**
 * Extract the POST parameters from a form data.
 */
function postParams(source) {
    var array = [];
    for (var key in source) {
        array.push(encodeURIComponent(key) + '=' + encodeURIComponent(source[key]));
    }
    return array.join('&');
}

/**
 * Extract the root of a URL.
 */
function extractRootURL(url) {
    var domain;
    if (url.indexOf("://") > -1) {
        domain = url.split('/')[0] + '/' + url.split('/')[1] + '/' + url.split('/')[2];
    } else {
        domain = url.split('/')[0];
    }
    return domain;
}

/**
 * Parse the cookies and send the message to the native host.
 */
function parseCookies(cookies_arr) {
    cookies = '';
    for (var i in cookies_arr) {
        cookies += cookies_arr[i].domain + '\t';
        cookies += (cookies_arr[i].httpOnly ? "FALSE" : "TRUE") + '\t';
        cookies += cookies_arr[i].path + '\t';
        cookies += (cookies_arr[i].secure ? "TRUE" : "FALSE") + '\t';
        cookies += Math.round(cookies_arr[i].expirationDate) + '\t';
        cookies += cookies_arr[i].name + '\t';
        cookies += cookies_arr[i].value;
        cookies += '\n';
    }
    message.cookies = cookies;
    sendMessageToHost(message);
}

/**
 * Update the include & exclude keywords.
 * Is called from the popup.js.
 */
function updateKeywords(include, exclude) {
    keywordsToInclude = include.split(/[\s,]+/);
    keywordsToExclude = exclude.split(/[\s,]+/);
    current_browser.storage.sync.set({ "idm-keywords-include": include });
    current_browser.storage.sync.set({ "idm-keywords-exclude": exclude });
}

/**
 * Update the minimum file size to interrupt.
 * Is called from the popup.js.
 */
function updateMinFileSize(size) {
    minFileSizeToInterrupt = size;
    current_browser.storage.sync.set({ "idm-min-file-size": size });
}

/**
 * Check whether not to interrupt the given url.
 */
function isBlackListed(url) {
    if (!url) {
        return;
    }
    if (url.includes("//docs.google.com/") || url.includes("googleusercontent.com/docs")) { // Cannot download from Google Docs
        return true;
    }
    for (var keyword of keywordsToExclude) {
        if (url.includes(keyword)) {
            return true;
        }
    }
    return false;
}

/**
 * Check whether to interrupt the given url or not.
 */
function isWhiteListed(url) {
    if (url.includes("video")) {
        return true;
    }
    for (var keyword of keywordsToInclude) {
        if (url.includes(keyword)) {
            return true;
        }
    }
    return false;
}

/**
 * Enable/Disable the plugin and update the plugin icon based on the state.
 */
function setInterruptDownload(interrupt, writeToStorage) {
    interruptDownloads = interrupt;
    if (interrupt) {
        current_browser.browserAction.setIcon({
            path: "./images/logoSmall.png"
        });
    } else {
        current_browser.browserAction.setIcon({
            path: "./images/icon_small_disabled.png"
        });
    }
    if (writeToStorage) {
        current_browser.storage.sync.set({ "idm-interrupt": interrupt.toString() });
    }
}
