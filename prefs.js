import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class BlipPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({title: 'Blip', icon_name: 'preferences-desktop-display-symbolic'});
        window.add(page);

        const behavior = new Adw.PreferencesGroup({title: 'Interaction'});
        page.add(behavior);
        behavior.add(this._spin('Clicks to remove', 'remove-clicks', settings, 1, 8));
        behavior.add(this._spin('Clicks to configure', 'configure-clicks', settings, 1, 8));
        behavior.add(this._spin('Click sequence timeout (ms)', 'click-timeout', settings, 200, 1500, 50));

        const shortcuts = new Adw.PreferencesGroup({title: 'Keyboard shortcuts'});
        page.add(shortcuts);
        shortcuts.add(this._shortcut('Add a blip', 'add-shortcut', settings));
        shortcuts.add(this._shortcut('Remove under pointer', 'remove-shortcut', settings));
        shortcuts.add(this._shortcut('Configure under pointer', 'configure-shortcut', settings));

        const appearance = new Adw.PreferencesGroup({title: 'Appearance and placement'});
        page.add(appearance);
        appearance.add(this._choice('New blip style', 'default-mode', settings,
            ['glass', 'color'], ['Glass', 'Color']));
        appearance.add(this._choice('New blip position', 'default-position', settings,
            ['center', 'last', 'full-screen', 'random'], ['Centered', 'Last blip', 'Whole screen', 'Random']));
        appearance.add(this._choice('Tray icon follows', 'tray-style', settings,
            ['latest', 'first'], ['Latest blip', 'First blip']));
        appearance.add(this._spin('Default width', 'default-width', settings, 80, 10000, 20));
        appearance.add(this._spin('Default height', 'default-height', settings, 80, 10000, 20));
        appearance.add(this._spin('Rounded corners (px)', 'corner-radius', settings, 0, 80));
        appearance.add(this._colorRow('Default color', 'default-color', settings));
        appearance.add(this._scale('Default glass tint', 'default-tint', settings));
    }

    _spin(title, key, settings, min, max, step = 1) {
        const row = new Adw.SpinRow({title, adjustment: new Gtk.Adjustment({
            lower: min, upper: max, step_increment: step, page_increment: step * 5,
        })});
        const read = () => row.set_value(settings.get_int(key));
        read();
        row.connect('notify::value', () => settings.set_int(key, Math.round(row.value)));
        settings.connect(`changed::${key}`, read);
        return row;
    }

    _choice(title, key, settings, ids, labels) {
        const row = new Adw.ComboRow({title, model: Gtk.StringList.new(labels)});
        const sync = () => row.set_selected(Math.max(0, ids.indexOf(settings.get_string(key))));
        sync();
        row.connect('notify::selected', () => settings.set_string(key, ids[row.selected]));
        settings.connect(`changed::${key}`, sync);
        return row;
    }

    _shortcut(title, key, settings) {
        const row = new Adw.EntryRow({title});
        const read = () => row.set_text(settings.get_strv(key).join(', '));
        read();
        row.connect('apply', () => settings.set_strv(key, row.text.split(',').map(s => s.trim()).filter(Boolean)));
        settings.connect(`changed::${key}`, read);
        return row;
    }

    _colorRow(title, key, settings) {
        const row = new Adw.ActionRow({title});
        const button = new Gtk.ColorButton({use_alpha: true, valign: Gtk.Align.CENTER});
        const parse = () => {
            const rgba = new Gdk.RGBA();
            if (rgba.parse(settings.get_string(key))) button.set_rgba(rgba);
        };
        parse();
        button.connect('color-set', () => settings.set_string(key, button.get_rgba().to_string()));
        settings.connect(`changed::${key}`, parse);
        row.add_suffix(button);
        row.activatable_widget = button;
        return row;
    }

    _scale(title, key, settings) {
        const row = new Adw.SpinRow({title, adjustment: new Gtk.Adjustment({
            lower: 0.05, upper: 1, step_increment: 0.01, page_increment: 0.1,
        }), digits: 2});
        settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }
}
