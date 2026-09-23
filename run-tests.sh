#!/usr/bin/env bash
# Full jQuery 1.11.1 QUnit suite, headless, one PhantomJS process per QUnit module.
#
# Why per-module: the suite's iframe-layout tests (css #14084,
# support shrinkWrapBlocks) and some ajax tests intermittently lose races against
# accumulated DOM/engine state when all 800 tests share one long-lived page. Each
# module still runs in full -- module filtering is exact, and the per-module counts
# sum to the same 800 tests as a single-page run -- so this trades no coverage for
# determinism. It is a scheduling change, not a test exclusion.
set -u

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"
BASE="http://${HOST}:${PORT}/test/index.html?dev"
PER_MODULE_TIMEOUT="${PER_MODULE_TIMEOUT:-240}"

# The 18 modules loaded by test/data/testinit.js::loadTests.
# NOTE: test/unit/ready.js declares module("event"), so it runs inside "event".
# test/unit/exports.js and test/unit/deprecated.js are NOT referenced by
# test/index.html in 1.11.1 -- they are dead files in this checkout.
MODULES=(
	core callbacks deferred support data queue attributes event
	selector traversing manipulation wrap css serialize ajax
	effects offset dimensions
)

total_tests=0
total_assertions=0
total_failed=0
failed_count=0
failed_modules=""

for m in "${MODULES[@]}"; do
	log="/tmp/qunit-${m}.log"
	# Streamed through tee, not redirected: Travis terminates a build after 10
	# minutes with no output, and a module that hangs would otherwise produce
	# nothing until its own timeout fired. Streaming also puts the per-test
	# "ok <module>: <name>" lines in the build log. PIPESTATUS keeps the runner's
	# exit code rather than tee's.
	echo "==== running module: ${m} ===="
	timeout "$(( PER_MODULE_TIMEOUT + 60 ))" \
		phantomjs run-qunit.js "${BASE}&module=${m}" "${PER_MODULE_TIMEOUT}" 2>&1 | tee "${log}"
	rc=${PIPESTATUS[0]}

	# Exit 3 means run-qunit.js never received a QUnit result at all -- the page or one
	# of its scripts failed to load, i.e. a transport-level failure, not a test failure.
	# Retry that module exactly once. A real test failure is exit 1 and is NEVER retried,
	# and a second exit 3 stays fatal.
	if [ "${rc}" -eq 3 ]; then
		echo "${m}: harness got no result (exit 3) -- retrying once"
		timeout "$(( PER_MODULE_TIMEOUT + 60 ))" \
			phantomjs run-qunit.js "${BASE}&module=${m}" "${PER_MODULE_TIMEOUT}" 2>&1 | tee "${log}"
		rc=${PIPESTATUS[0]}
	fi

	# -a: PhantomJS can emit stray control bytes that make grep treat the log as binary.
	t=$(grep -a -oP 'tests run:\s*\K\d+'         "${log}" | tail -1 || true)
	a=$(grep -a -oP 'assertions total:\s*\K\d+'  "${log}" | tail -1 || true)
	f=$(grep -a -oP 'assertions failed:\s*\K\d+' "${log}" | tail -1 || true)
	: "${t:=0}"; : "${a:=0}"; : "${f:=0}"

	total_tests=$(( total_tests + t ))
	total_assertions=$(( total_assertions + a ))
	total_failed=$(( total_failed + f ))

	if [ "${rc}" -ne 0 ]; then
		failed_count=$(( failed_count + 1 ))
		failed_modules="${failed_modules}${m} (exit ${rc}) "
		printf '%-14s FAIL  tests=%-4s assertions=%-5s failed=%-3s exit=%s  log=%s\n' \
			"${m}" "${t}" "${a}" "${f}" "${rc}" "${log}"
		grep -a -A20 '^FAILING TESTS' "${log}" | grep -a -E '^\s+[0-9]+\.' | sed 's/^/                /' || true
	else
		printf '%-14s ok    tests=%-4s assertions=%-5s\n' "${m}" "${t}" "${a}"
	fi
done

echo
echo "================= FULL SUITE SUMMARY ================="
echo "modules run:       ${#MODULES[@]}"
echo "tests run:         ${total_tests}"
echo "assertions total:  ${total_assertions}"
echo "assertions failed: ${total_failed}"
if [ "${failed_count}" -ne 0 ]; then
	echo "FAILED MODULES:    ${failed_modules}"
	echo "====================================================="
	exit 1
fi
echo "result:            PASS"
echo "====================================================="
exit 0
