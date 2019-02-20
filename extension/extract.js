extract();

function extract() {
    var txt = '';
    urls = []
    for (var i = 0; i < document.links.length; i++) {
        url = document.links[i].href;
        var valid = /^(ftp|http|https):\/\/[^ "]+$/.test(url);
        if(valid) {
            var decodedURL = unescape(url);
            if(urls.indexOf(decodedURL) < 0) {
                urls.push(decodedURL);
                txt += url + '\n';
            }
        }
    }
    
    if(txt !== '') {
        return {success: true, urls: txt};
    }
    return {success: false, urls: ""};
}