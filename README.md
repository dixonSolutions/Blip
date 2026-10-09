# Blip

Blip puts a dark, configurable screen overlay wherever you need a part of the desktop to stay out of the way. Each blip catches pointer input and hides the pointer while it is over the covered area. Use glass tint for a dark translucent block, or color mode for a solid colored block.

## Use it

- Press **Super+Alt+B** to add a centered glass blip. Press it again to add another.
- Double-click a blip to remove it. Triple-click to enter configuration mode.
- In configuration mode, drag inside the blip to move it and drag the lower or right edge to resize it. Press **Enter** to save or **Escape** to cancel.
- Use **Super+Alt+Backspace** to remove the blip under the pointer, or **Super+Alt+Enter** to configure it.
- Open the black square in the top bar to add or remove blips and change the latest blip's mode, color, or tint.
- Open **Advanced settings…** to change shortcuts, click counts, default size and position, tray icon behavior, color, and rounded corners.

The initial shortcut is configurable in Extension Settings. Blips are saved across Shell restarts. Placement choices are centered, copy the most recently created blip, cover the screen, or random. The tray icon can follow the first or latest blip.

## Install

```sh
gnome-extensions install blip@dixonSolutions.shell-extension.zip
gnome-extensions enable blip@dixonSolutions
```

To build the installable archive from this checkout:

```sh
glib-compile-schemas schemas
gnome-extensions pack --force --out-file blip@dixonSolutions.shell-extension.zip
```

GNOME Shell 50 is currently supported. On Wayland, use GNOME Tweaks or the Extensions app to manage the extension after installation.

## Demo

See [demo.mp4](demo.mp4) for an illustrated UI walkthrough of adding, styling, moving, resizing, and removing a blip. Its GNOME desktop scenes are vector mockups, not a screen recording.

## License

Blip is available under the GNU General Public License, version 3 or later. See [COPYING](COPYING).
