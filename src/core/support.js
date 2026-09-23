define([
	"../var/support"
], function( support ) {

// Support: IE<9
// document.implementation.createHTMLDocument is not available at all.
//
// Support: Safari 8+
// In documents created via document.implementation.createHTMLDocument
// sibling forms collapse: the second one becomes a child of the first one.
// Because of that, this security measure has to be disabled in Safari 8.
// https://bugs.webkit.org/show_bug.cgi?id=137337
support.createHTMLDocument = (function() {
	var doc;

	try {
		doc = document.implementation.createHTMLDocument( "" );
		doc.body.innerHTML = "<form></form><form></form>";
	} catch( e ) {
		return false;
	}

	return doc.body.childNodes.length === 2;
})();

return support;

});
