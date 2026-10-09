#!/usr/bin/env bash
set -euo pipefail
glib-compile-schemas schemas
mkdir -p dist
zip -q -r -FS dist/blip@dixonSolutions.shell-extension.zip metadata.json extension.js prefs.js schemas
