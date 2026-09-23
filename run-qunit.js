/* PhantomJS QUnit runner for jQuery 1.11.1
 * Usage: phantomjs run-qunit.js <url> [timeoutSeconds]
 * Exits 0 when all tests pass, 1 on any failure/timeout.
 */
/* global phantom, require, console */
var system = require( "system" );
var url = system.args[ 1 ] || "http://127.0.0.1:8000/test/index.html?dev";
var timeoutSec = parseInt( system.args[ 2 ] || "300", 10 );

var page = require( "webpage" ).create();
var started = Date.now();
var finished = false;
var failingTests = [];
var testCount = 0;
var summary = null;

page.settings.resourceTimeout = 60000;
page.viewportSize = { width: 1024, height: 768 };

// Inject QUnit hooks as soon as the page's JS context is created.
page.onInitialized = function() {
	page.evaluate( function() {
		var installed = false;
		function install() {
			if ( installed || typeof window.QUnit === "undefined" ) {
				return;
			}
			installed = true;
			window.QUnit.config.autostart = window.QUnit.config.autostart;
			window.QUnit.testDone( function( r ) {
				window.callPhantom( {
					type: "testDone",
					module: r.module,
					name: r.name,
					failed: r.failed,
					passed: r.passed,
					total: r.total,
					runtime: r.runtime
				} );
			} );
			window.QUnit.log( function( r ) {
				if ( !r.result ) {
					window.callPhantom( {
						type: "assertionFail",
						module: r.module,
						name: r.name,
						message: r.message,
						expected: String( r.expected ),
						actual: String( r.actual )
					} );
				}
			} );
			window.QUnit.done( function( r ) {
				window.callPhantom( {
					type: "done",
					failed: r.failed,
					passed: r.passed,
					total: r.total,
					runtime: r.runtime
				} );
			} );
		}
		// QUnit is loaded by a <script> later in <head>, so poll for it -- but bound the
		// poll. onInitialized fires for EVERY frame, and this suite creates hundreds of
		// iframes that never define QUnit. An unbounded 5ms interval in each of those
		// frames keeps spinning for the rest of the run, starving QtWebKit's layout and
		// resource handling; that surfaced as intermittent iframe-layout failures
		// (css #14084, support shrinkWrapBlocks) and as harness loads that hung before
		// QUnit ever started. 4s at 10ms is far more than the main frame needs, and
		// costs nothing in frames that never get QUnit.
		var attempts = 0;
		var iv = setInterval( function() {
			install();
			if ( installed || ++attempts > 400 ) {
				clearInterval( iv );
			}
		}, 10 );
		install();
	} );
};

page.onCallback = function( d ) {
	if ( !d ) {
		return;
	}
	if ( d.type === "testDone" ) {
		testCount++;
		var label = ( d.module || "(no module)" ) + ": " + d.name;
		if ( d.failed > 0 ) {
			failingTests.push( label + "  [" + d.failed + "/" + d.total + " assertions failed]" );
			console.log( "FAIL  " + label + "  (" + d.failed + "/" + d.total + ")" );
		} else {
			console.log( "ok    " + label + "  (" + d.passed + "/" + d.total + ")" );
		}
	} else if ( d.type === "assertionFail" ) {
		console.log( "        > assertion: " + ( d.message || "(no message)" ) +
			" | expected: " + d.expected + " | actual: " + d.actual );
	} else if ( d.type === "done" ) {
		summary = d;
		finished = true;
	}
};

page.onConsoleMessage = function( msg ) {
	console.log( "[page] " + msg );
};
page.onError = function( msg ) {
	console.log( "[pageerror] " + msg );
};
page.onResourceError = function( e ) {
	console.log( "[resourceerror] " + e.url + " : " + e.errorString );
};

function finish() {
	console.log( "" );
	console.log( "==================== QUnit summary ====================" );
	console.log( "tests run:        " + testCount );
	console.log( "assertions total: " + summary.total );
	console.log( "assertions passed:" + summary.passed );
	console.log( "assertions failed:" + summary.failed );
	console.log( "runtime (ms):     " + summary.runtime );
	if ( failingTests.length ) {
		console.log( "" );
		console.log( "FAILING TESTS (" + failingTests.length + "):" );
		for ( var i = 0; i < failingTests.length; i++ ) {
			console.log( "  " + ( i + 1 ) + ". " + failingTests[ i ] );
		}
	}
	console.log( "=======================================================" );
	phantom.exit( summary.failed > 0 || failingTests.length > 0 ? 1 : 0 );
}

page.open( url, function( status ) {
	if ( status !== "success" ) {
		console.log( "ERROR: unable to load " + url );
		phantom.exit( 2 );
		return;
	}
	console.log( "Loaded " + url + " -- waiting for QUnit to finish (timeout " + timeoutSec + "s)" );
	setInterval( function() {
		if ( finished ) {
			finish();
		} else if ( Date.now() - started > timeoutSec * 1000 ) {
			console.log( "ERROR: timed out after " + timeoutSec + "s (" + testCount + " tests seen)" );
			phantom.exit( 3 );
		}
	}, 250 );
} );
