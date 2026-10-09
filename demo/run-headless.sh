#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="${BLIP_DEMO_OUTPUT_DIR:-$PROJECT_DIR/artifacts/headless}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_FILE="${BLIP_DEMO_OUTPUT_FILE:-$OUTPUT_DIR/blip-demo-$STAMP.mp4}"
STATUS_FILE="$OUTPUT_DIR/status.txt"
DONE_FILE="$OUTPUT_DIR/complete.txt"
if [[ "${BLIP_DEMO_INSIDE:-0}" == 1 ]]; then
    WORK_DIR="$BLIP_DEMO_WORK_DIR"
    WAYLAND_NAME="$BLIP_DEMO_WAYLAND_NAME"
else
    WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/blip-headless.XXXXXX")"
    WAYLAND_NAME="wayland-blip-demo-$$"
fi
SHELL_PID=""
WINDOW_PID=""
PIPEWIRE_PID=""
WIREPLUMBER_PID=""
RECORDING_STARTED=0

mkdir -p -- "$OUTPUT_DIR"
mkdir -p -- "$(dirname -- "$OUTPUT_FILE")"
rm -f -- "$DONE_FILE"

write_status() {
    local state="$1" detail="${2:-}"
    {
        printf 'state=%s\n' "$state"
        printf 'output=%s\n' "$OUTPUT_FILE"
        printf 'detail=%s\n' "$detail"
        printf 'updated=%s\n' "$(date --iso-8601=seconds)"
    } > "$STATUS_FILE"
}

notify_host() {
    local state="$1"
    if command -v notify-send >/dev/null 2>&1 && [[ -n "${DBUS_SESSION_BUS_ADDRESS:-}" ]]; then
        notify-send -a Blip "Blip headless demo $state" "$OUTPUT_FILE" >/dev/null 2>&1 || true
    fi
}

cleanup() {
    local result=$?
    if (( RECORDING_STARTED )); then
        gdbus call --session --dest org.gnome.Shell.Screencast \
            --object-path /org/gnome/Shell/Screencast \
            --method org.gnome.Shell.Screencast.StopScreencast >/dev/null 2>&1 || true
    fi
    [[ -n "$WINDOW_PID" ]] && kill "$WINDOW_PID" >/dev/null 2>&1 || true
    [[ -n "$SHELL_PID" ]] && kill "$SHELL_PID" >/dev/null 2>&1 || true
    [[ -n "$WIREPLUMBER_PID" ]] && kill "$WIREPLUMBER_PID" >/dev/null 2>&1 || true
    [[ -n "$PIPEWIRE_PID" ]] && kill "$PIPEWIRE_PID" >/dev/null 2>&1 || true
    if [[ "${BLIP_DEMO_INSIDE:-0}" == 1 && $result == 0 ]]; then
        rm -rf -- "$WORK_DIR"
    fi
}

for tool in gnome-shell gsettings glib-compile-schemas dbus-run-session gdbus gjs ffmpeg ffprobe pipewire wireplumber pw-cli wpctl; do
    command -v "$tool" >/dev/null 2>&1 || { write_status failed "Missing required command: $tool"; exit 2; }
done

if [[ "${BLIP_DEMO_INSIDE:-0}" != 1 ]]; then
    write_status starting "Starting isolated D-Bus and headless GNOME Shell."
    mkdir -p "$WORK_DIR/runtime"
    chmod 700 "$WORK_DIR/runtime"
    export BLIP_DEMO_OUTPUT_DIR="$OUTPUT_DIR"
    export BLIP_DEMO_OUTPUT_FILE="$OUTPUT_FILE"
    export BLIP_DEMO_WORK_DIR="$WORK_DIR"
    export BLIP_DEMO_WAYLAND_NAME="$WAYLAND_NAME"
    if dbus-run-session -- env BLIP_DEMO_INSIDE=1 \
        BLIP_DEMO_OUTPUT_DIR="$OUTPUT_DIR" \
        BLIP_DEMO_OUTPUT_FILE="$OUTPUT_FILE" \
        BLIP_DEMO_WORK_DIR="$WORK_DIR" \
        BLIP_DEMO_WAYLAND_NAME="$WAYLAND_NAME" \
        "$0" --inside > "$WORK_DIR/session.log" 2>&1; then
        notify_host complete
        rm -rf -- "$WORK_DIR"
        exit 0
    else
        result=$?
        write_status failed "Headless GNOME run ended with exit code $result; see $WORK_DIR/session.log."
        printf '%s\n' "failed: $OUTPUT_FILE" > "$DONE_FILE"
        notify_host failed
        cat "$WORK_DIR/session.log" >&2
        printf 'Session log: %s/session.log\n' "$WORK_DIR" >&2
        exit "$result"
    fi
fi

trap cleanup EXIT INT TERM

WORK_DIR="$BLIP_DEMO_WORK_DIR"
WAYLAND_NAME="$BLIP_DEMO_WAYLAND_NAME"
export XDG_RUNTIME_DIR="$WORK_DIR/runtime"
export XDG_DATA_HOME="$WORK_DIR/data"
export XDG_CONFIG_HOME="$WORK_DIR/config"
export XDG_CACHE_HOME="$WORK_DIR/cache"
export XDG_STATE_HOME="$WORK_DIR/state"
export XDG_DATA_DIRS="$XDG_DATA_HOME:/usr/local/share:/usr/share${XDG_DATA_DIRS:+:$XDG_DATA_DIRS}"
export XDG_CURRENT_DESKTOP=GNOME
export XDG_SESSION_TYPE=wayland
export XDG_SESSION_DESKTOP=gnome
export PIPEWIRE_RUNTIME_DIR="$XDG_RUNTIME_DIR"
export GTK_A11Y=none
export NO_AT_BRIDGE=1
mkdir -p "$XDG_DATA_HOME/gnome-shell/extensions" "$XDG_DATA_HOME/glib-2.0/schemas" "$XDG_CONFIG_HOME/dconf" "$XDG_CACHE_HOME" "$XDG_STATE_HOME"

EXT_DIR="$XDG_DATA_HOME/gnome-shell/extensions/blip@dixonSolutions"
mkdir -p "$EXT_DIR/schemas"
cp "$PROJECT_DIR/metadata.json" "$PROJECT_DIR/extension.js" "$PROJECT_DIR/prefs.js" "$EXT_DIR/"
cp "$PROJECT_DIR/schemas/org.gnome.shell.extensions.blip.gschema.xml" "$EXT_DIR/schemas/"
cp "$PROJECT_DIR/schemas/org.gnome.shell.extensions.blip.gschema.xml" "$XDG_DATA_HOME/glib-2.0/schemas/"
glib-compile-schemas "$EXT_DIR/schemas"
glib-compile-schemas "$XDG_DATA_HOME/glib-2.0/schemas"
export GSETTINGS_SCHEMA_DIR="$XDG_DATA_HOME/glib-2.0/schemas"

gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.shell enabled-extensions "['blip@dixonSolutions']"
gsettings set org.gnome.shell.extensions.blip blips '[]'
gsettings set org.gnome.shell.extensions.blip add-shortcut "['<Super><Alt>b']"
gsettings set org.gnome.shell.extensions.blip remove-shortcut "['<Super><Alt>BackSpace']"
gsettings set org.gnome.shell.extensions.blip configure-shortcut "['<Super><Alt>Return']"
gsettings set org.gnome.shell.extensions.blip default-mode 'glass'
gsettings set org.gnome.shell.extensions.blip default-position 'center'
gsettings set org.gnome.shell.extensions.blip default-width 660
gsettings set org.gnome.shell.extensions.blip default-height 380
gsettings set org.gnome.shell.extensions.blip default-tint 0.78
gsettings set org.gnome.shell.extensions.blip default-color '#3157b8ff'
gsettings set org.gnome.shell.extensions.blip corner-radius 14
gsettings set org.gnome.shell.extensions.blip remove-clicks 2
gsettings set org.gnome.shell.extensions.blip configure-clicks 3

write_status running "Launching 1600x900 headless GNOME Shell and recording the real extension UI."
pipewire > "$WORK_DIR/pipewire.log" 2>&1 &
PIPEWIRE_PID=$!
pipewire_ready=0
for _ in $(seq 1 40); do
    if [[ -S "$PIPEWIRE_RUNTIME_DIR/pipewire-0" ]] && pw-cli info 0 >/dev/null 2>&1; then
        pipewire_ready=1
        break
    fi
    if ! kill -0 "$PIPEWIRE_PID" >/dev/null 2>&1; then
        cat "$WORK_DIR/pipewire.log" >&2
        exit 1
    fi
    sleep 0.25
done
(( pipewire_ready )) || { cat "$WORK_DIR/pipewire.log" >&2; echo "PipeWire did not become ready." >&2; exit 1; }
wireplumber > "$WORK_DIR/wireplumber.log" 2>&1 &
WIREPLUMBER_PID=$!
wireplumber_ready=0
for _ in $(seq 1 40); do
    if wpctl status >/dev/null 2>&1; then
        wireplumber_ready=1
        break
    fi
    if ! kill -0 "$WIREPLUMBER_PID" >/dev/null 2>&1; then
        cat "$WORK_DIR/wireplumber.log" >&2
        exit 1
    fi
    sleep 0.25
done
(( wireplumber_ready )) || { cat "$WORK_DIR/wireplumber.log" >&2; echo "WirePlumber did not become ready." >&2; exit 1; }

gnome-shell --wayland --headless --no-x11 \
    --virtual-monitor=1600x900 --wayland-display="$WAYLAND_NAME" \
    --debug-control > "$WORK_DIR/shell.log" 2>&1 &
SHELL_PID=$!

ready=0
for _ in $(seq 1 80); do
    if gdbus introspect --session --dest org.gnome.Shell \
        --object-path /org/gnome/Shell >/dev/null 2>&1; then
        ready=1
        break
    fi
    if ! kill -0 "$SHELL_PID" >/dev/null 2>&1; then
        cat "$WORK_DIR/shell.log" >&2
        exit 1
    fi
    sleep 0.25
done
(( ready )) || { cat "$WORK_DIR/shell.log" >&2; exit 1; }

WAYLAND_DISPLAY="$WAYLAND_NAME" GDK_BACKEND=wayland \
    gjs -m "$SCRIPT_DIR/test-window.js" > "$WORK_DIR/demo-window.log" 2>&1 &
WINDOW_PID=$!
sleep 2

WEBM_BASE="$WORK_DIR/blip-demo"
WEBM_FILE="$WEBM_BASE.webm"
record_result="$(gdbus call --session --dest org.gnome.Shell.Screencast \
    --object-path /org/gnome/Shell/Screencast \
    --method org.gnome.Shell.Screencast.Screencast \
    "$WEBM_BASE" "{'framerate': <int32 24>, 'draw-cursor': <false>}")"
[[ "$record_result" == *"(true,"* ]] || { echo "Could not start screen recording: $record_result" >&2; exit 1; }
RECORDING_STARTED=1
write_status recording "Headless GNOME capture is running; this script will finish automatically."

set_blips() {
    gsettings set org.gnome.shell.extensions.blip blips "$1"
}

sleep 2
set_blips '[{"id":"demo-glass","x":470,"y":255,"width":660,"height":380,"mode":"glass","color":"#3157b8ff","tint":0.78}]'
sleep 3
gsettings set org.gnome.shell.extensions.blip corner-radius 30
set_blips '[{"id":"demo-glass","x":470,"y":255,"width":660,"height":380,"mode":"glass","color":"#3157b8ff","tint":0.92}]'
sleep 3
set_blips '[{"id":"demo-glass","x":310,"y":210,"width":660,"height":380,"mode":"glass","color":"#3157b8ff","tint":0.78},{"id":"demo-color","x":930,"y":390,"width":430,"height":300,"mode":"color","color":"#3157b8e8","tint":0.78}]'
sleep 3
set_blips '[{"id":"demo-glass","x":310,"y":210,"width":660,"height":380,"mode":"glass","color":"#3157b8ff","tint":0.78}]'
sleep 2
set_blips '[]'
sleep 2

gdbus call --session --dest org.gnome.Shell.Screencast \
    --object-path /org/gnome/Shell/Screencast \
    --method org.gnome.Shell.Screencast.StopScreencast >/dev/null
RECORDING_STARTED=0
ffmpeg -hide_banner -loglevel error -y -i "$WEBM_FILE" \
    -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -movflags +faststart \
    "$OUTPUT_FILE"
ffmpeg -hide_banner -loglevel error -y -ss 7 -i "$OUTPUT_FILE" \
    -frames:v 1 "${OUTPUT_FILE%.mp4}-poster.png"
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT_FILE" \
    > "${OUTPUT_FILE%.mp4}.duration"
printf 'done: %s\n' "$OUTPUT_FILE" > "$DONE_FILE"
write_status done "Headless capture completed successfully."
printf 'Saved video: %s\n' "$OUTPUT_FILE"
printf 'Completion marker: %s\n' "$DONE_FILE"
