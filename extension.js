import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const COLORS = ['#111111ff', '#e53935ff', '#fb8c00ff', '#fdd835ff', '#43a047ff', '#1e88e5ff', '#8e24aaff', '#ffffffff'];

export default class BlipExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._cursorTracker = global.backend.get_cursor_tracker();
        this._blips = [];
        this._signalIds = [];
        this._loadBlips();
        this._indicator = new PanelMenu.Button(0.0, 'Blip', false);
        this._indicator.add_child(new St.Widget({
            style: 'background-color: black; border-radius: 2px; min-width: 14px; min-height: 14px;',
            y_align: Clutter.ActorAlign.CENTER,
        }));
        this._buildMenu();
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        this._registerKeybindings();
        this._signalIds.push(this._settings.connect('changed::blips', () => this._loadBlips()));
        this._signalIds.push(this._settings.connect('changed::tray-style', () => this._updateIndicator()));
        this._signalIds.push(this._settings.connect('changed::default-color', () => {
            const latest = this._blips.at(-1);
            if (latest?.data.mode === 'color') {
                latest.data.color = this._settings.get_string('default-color');
                this._styleBlip(latest);
                this._save();
            }
        }));
        this._updateIndicator();
    }

    disable() {
        this._unregisterKeybindings();
        for (const id of this._signalIds)
            this._settings.disconnect(id);
        this._signalIds = [];
        for (const blip of this._blips) {
            this._showPointer(blip);
            this._destroyBlip(blip);
        }
        this._blips = [];
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }

    _registerKeybindings() {
        Main.wm.addKeybinding('add-shortcut', this._settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL, () => this._addBlip());
        Main.wm.addKeybinding('remove-shortcut', this._settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL, () => this._withPointerBlip(blip => this._removeBlip(blip)));
        Main.wm.addKeybinding('configure-shortcut', this._settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL, () => this._withPointerBlip(blip => this._configureBlip(blip)));
    }

    _unregisterKeybindings() {
        for (const key of ['add-shortcut', 'remove-shortcut', 'configure-shortcut'])
            Main.wm.removeKeybinding(key);
    }

    _buildMenu() {
        this._indicator.menu.addAction('Add a blip', () => this._addBlip());
        this._indicator.menu.addAction('Remove all blips', () => this._removeAll());
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._modeItem = new PopupMenu.PopupSwitchMenuItem('Color mode', false);
        this._modeItem.connect('toggled', (_item, enabled) => this._setLatest('mode', enabled ? 'color' : 'glass'));
        this._indicator.menu.addMenuItem(this._modeItem);
        this._sliderItem = new PopupMenu.PopupSliderMenuItem(this._settings.get_double('default-tint'));
        this._sliderItem.connect('value-changed', (_item, value) => this._setLatest('tint', value));
        this._indicator.menu.addMenuItem(this._sliderItem);
        this._colorMenu = new PopupMenu.PopupSubMenuMenuItem('Blip color');
        for (const color of COLORS) {
            const item = new PopupMenu.PopupMenuItem(color);
            item.add_child(new St.Widget({style: `background-color: ${color}; width: 14px; height: 14px; margin-left: 8px;`}));
            item.connect('activate', () => this._setLatest('color', color));
            this._colorMenu.menu.addMenuItem(item);
        }
        const custom = new PopupMenu.PopupMenuItem('Custom color…');
        custom.connect('activate', () => this.openPreferences());
        this._colorMenu.menu.addMenuItem(custom);
        this._indicator.menu.addMenuItem(this._colorMenu);
        this._indicator.menu.addAction('Advanced settings…', () => this.openPreferences());
        this._indicator.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._syncMenu();
        });
    }

    _syncMenu() {
        const latest = this._blips.at(-1);
        this._modeItem.setToggleState((latest?.data.mode ?? this._settings.get_string('default-mode')) === 'color');
        const mode = latest?.data.mode ?? this._settings.get_string('default-mode');
        this._sliderItem.visible = mode === 'glass';
        this._colorMenu.visible = mode === 'color';
        this._sliderItem.setValue(latest?.data.tint ?? this._settings.get_double('default-tint'));
    }

    _loadBlips() {
        let saved = [];
        try { saved = JSON.parse(this._settings.get_string('blips')); } catch (e) { logError(e, 'Could not read Blip data'); }
        const old = new Map(this._blips.map(blip => [blip.data.id, blip]));
        this._blips = saved.map(data => {
            const existing = old.get(data.id);
            if (existing) {
                existing.data = data;
                this._styleBlip(existing);
                old.delete(data.id);
                return existing;
            }
            return this._createBlip(data);
        });
        for (const blip of old.values())
            this._destroyBlip(blip);
        this._updateIndicator();
    }

    _save() {
        this._settings.set_string('blips', JSON.stringify(this._blips.map(blip => blip.data)));
        this._updateIndicator();
    }

    _addBlip() {
        const [x, y, width, height] = this._newGeometry();
        const mode = this._settings.get_string('default-mode');
        const data = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            x, y, width, height, mode,
            color: this._settings.get_string('default-color'),
            tint: this._settings.get_double('default-tint'),
        };
        this._blips.push(this._createBlip(data));
        this._save();
    }

    _newGeometry() {
        const [screenWidth, screenHeight] = global.display.get_size();
        let width = Math.min(this._settings.get_int('default-width'), screenWidth);
        let height = Math.min(this._settings.get_int('default-height'), screenHeight);
        let x = Math.floor((screenWidth - width) / 2);
        let y = Math.floor((screenHeight - height) / 2);
        const place = this._settings.get_string('default-position');
        if (place === 'full-screen') { x = 0; y = 0; width = screenWidth; height = screenHeight; }
        else if (place === 'last' && this._blips.length) {
            const last = this._blips.at(-1).data;
            ({x, y, width, height} = last);
        } else if (place === 'random') {
            width = Math.max(80, Math.floor(screenWidth * (0.2 + Math.random() * 0.45)));
            height = Math.max(80, Math.floor(screenHeight * (0.2 + Math.random() * 0.45)));
            x = Math.floor(Math.random() * Math.max(1, screenWidth - width));
            y = Math.floor(Math.random() * Math.max(1, screenHeight - height));
        }
        return [x, y, width, height];
    }

    _createBlip(data) {
        const actor = new St.Widget({reactive: true, can_focus: true, track_hover: true,
            x: data.x, y: data.y, width: data.width, height: data.height,
            style_class: 'blip-overlay'});
        const blip = {data, actor, clickCount: 0, clickTimer: 0, config: false, drag: null};
        actor.connect('enter-event', () => {
            blip.hovered = true;
            if (!blip.config)
                this._hidePointer(blip);
            return Clutter.EVENT_PROPAGATE;
        });
        actor.connect('leave-event', () => {
            blip.hovered = false;
            this._showPointer(blip);
            return Clutter.EVENT_PROPAGATE;
        });
        actor.connect('button-press-event', (_actor, event) => this._pointerDown(blip, event));
        actor.connect('button-release-event', (_actor, event) => this._pointerUp(blip, event));
        actor.connect('motion-event', (_actor, event) => this._pointerMove(blip, event));
        actor.connect('key-press-event', (_actor, event) => this._keyPress(blip, event));
        Main.layoutManager.addChrome(actor, {affectsStruts: false, trackFullscreen: true});
        this._styleBlip(blip);
        return blip;
    }

    _styleBlip(blip) {
        const {data, actor} = blip;
        actor.set_position(data.x, data.y);
        actor.set_size(data.width, data.height);
        const radius = this._settings.get_int('corner-radius');
        const background = data.mode === 'color' ? data.color : `rgba(0, 0, 0, ${data.tint})`;
        actor.set_style(`background-color: ${background}; border-radius: ${radius}px;` +
            (blip.config ? ' border: 2px solid #79c0ff; box-shadow: inset 0 0 0 1px #ffffff;' : ''));
    }

    _destroyBlip(blip) {
        this._showPointer(blip);
        if (blip.clickTimer)
            GLib.Source.remove(blip.clickTimer);
        Main.layoutManager.removeChrome(blip.actor);
        blip.actor.destroy();
    }

    _pointerDown(blip, event) {
        if (!blip.config)
            return Clutter.EVENT_STOP;
        const [x, y] = event.get_coords();
        const rect = blip.actor.get_transformed_position();
        const localX = x - rect[0], localY = y - rect[1];
        const edge = 18;
        const right = localX > blip.data.width - edge;
        const left = localX < edge;
        const bottom = localY > blip.data.height - edge;
        const top = localY < edge;
        blip.drag = {x, y, startX: blip.data.x, startY: blip.data.y,
            startW: blip.data.width, startH: blip.data.height,
            resize: (right || left) && (top || bottom), right, bottom, left, top};
        return Clutter.EVENT_STOP;
    }

    _pointerMove(blip, event) {
        if (!blip.config)
            return Clutter.EVENT_STOP;
        const [x, y] = event.get_coords();
        if (!blip.drag) {
            return Clutter.EVENT_STOP;
        }
        const dx = x - blip.drag.x, dy = y - blip.drag.y;
        if (blip.drag.resize) {
            if (blip.drag.right)
                blip.data.width = Math.max(80, blip.drag.startW + dx);
            if (blip.drag.left) {
                const width = Math.max(80, blip.drag.startW - dx);
                blip.data.x = blip.drag.startX + blip.drag.startW - width;
                blip.data.width = width;
            }
            if (blip.drag.bottom)
                blip.data.height = Math.max(80, blip.drag.startH + dy);
            if (blip.drag.top) {
                const height = Math.max(80, blip.drag.startH - dy);
                blip.data.y = blip.drag.startY + blip.drag.startH - height;
                blip.data.height = height;
            }
        } else {
            blip.data.x = blip.drag.startX + dx;
            blip.data.y = blip.drag.startY + dy;
        }
        this._styleBlip(blip);
        return Clutter.EVENT_STOP;
    }

    _pointerUp(blip, _event) {
        blip.drag = null;
        if (!blip.config)
            this._click(blip);
        return Clutter.EVENT_STOP;
    }

    _keyPress(blip, event) {
        if (!blip.config)
            return Clutter.EVENT_STOP;
        const symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter)
            this._commitConfig(blip);
        else if (symbol === Clutter.KEY_Escape)
            this._cancelConfig(blip);
        return Clutter.EVENT_STOP;
    }

    _click(blip) {
        blip.clickCount++;
        if (blip.clickTimer) {
            GLib.Source.remove(blip.clickTimer);
            blip.clickTimer = 0;
        }
        const count = blip.clickCount;
        if (count >= this._settings.get_int('configure-clicks')) {
            blip.clickCount = 0;
            this._configureBlip(blip);
        } else {
            blip.clickTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                this._settings.get_int('click-timeout'), () => {
                    const shouldRemove = blip.clickCount >= this._settings.get_int('remove-clicks');
                    blip.clickCount = 0;
                    blip.clickTimer = 0;
                    if (shouldRemove)
                        this._removeBlip(blip);
                    return GLib.SOURCE_REMOVE;
                });
        }
    }

    _configureBlip(blip) {
        if (!blip || blip.config)
            return;
        blip.config = true;
        blip.beforeConfig = {...blip.data};
        this._showPointer(blip);
        blip.actor.grab_key_focus();
        this._styleBlip(blip);
    }

    _commitConfig(blip) {
        blip.config = false;
        this._styleBlip(blip);
        this._save();
        if (blip.hovered)
            this._hidePointer(blip);
    }

    _cancelConfig(blip) {
        blip.data = blip.beforeConfig;
        blip.config = false;
        this._styleBlip(blip);
        if (blip.hovered)
            this._hidePointer(blip);
    }

    _hidePointer(blip) {
        if (blip.pointerHidden)
            return;
        this._cursorTracker.inhibit_cursor_visibility();
        blip.pointerHidden = true;
    }

    _showPointer(blip) {
        if (!blip.pointerHidden)
            return;
        this._cursorTracker.uninhibit_cursor_visibility();
        blip.pointerHidden = false;
    }

    _removeBlip(blip) {
        const index = this._blips.indexOf(blip);
        if (index < 0) return;
        this._blips.splice(index, 1);
        this._destroyBlip(blip);
        this._save();
    }

    _removeAll() {
        for (const blip of this._blips)
            this._destroyBlip(blip);
        this._blips = [];
        this._save();
    }

    _setLatest(key, value) {
        const latest = this._blips.at(-1);
        if (!latest) {
            if (key === 'mode') this._settings.set_string('default-mode', value);
            else if (key === 'tint') this._settings.set_double('default-tint', value);
            else if (key === 'color') this._settings.set_string('default-color', value);
            return;
        }
        latest.data[key] = value;
        this._styleBlip(latest);
        this._save();
        this._syncMenu();
    }

    _withPointerBlip(callback) {
        const [x, y] = global.get_pointer();
        const blip = [...this._blips].reverse().find(({data}) => x >= data.x && y >= data.y && x <= data.x + data.width && y <= data.y + data.height);
        if (blip) callback(blip);
    }

    _updateIndicator() {
        if (!this._indicator) return;
        const blip = this._settings.get_string('tray-style') === 'first' ? this._blips[0] : this._blips.at(-1);
        const color = blip?.data.mode === 'color' ? blip.data.color : '#111111';
        this._indicator.get_first_child()?.set_style(`background-color: ${color}; border-radius: 2px; min-width: 14px; min-height: 14px;`);
    }
}
