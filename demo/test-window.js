import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

const app = new Gtk.Application({
    application_id: 'com.dixonSolutions.BlipDemo',
    flags: Gio.ApplicationFlags.NON_UNIQUE,
});

app.connect('activate', () => {
    const window = new Gtk.ApplicationWindow({
        application: app,
        title: 'Design review · Blip demo',
        default_width: 1120,
        default_height: 660,
    });

    const root = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 0});
    const sidebar = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 20,
        width_request: 240, margin_top: 28, margin_bottom: 28, margin_start: 24, margin_end: 18});
    const title = new Gtk.Label({label: 'PROJECT NOTES', xalign: 0});
    title.add_css_class('title-4');
    sidebar.append(title);
    for (const name of ['Overview', 'Open questions', 'References', 'Tasks']) {
        const row = new Gtk.Label({label: name, xalign: 0});
        row.add_css_class('dim-label');
        sidebar.append(row);
    }

    const content = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 18,
        hexpand: true, margin_top: 28, margin_bottom: 28, margin_start: 20, margin_end: 28});
    const heading = new Gtk.Label({label: 'A focused workspace', xalign: 0});
    heading.add_css_class('title-1');
    const description = new Gtk.Label({label: 'Keep a part of the screen covered while you work.', xalign: 0});
    description.add_css_class('dim-label');
    content.append(heading);
    content.append(description);

    const notes = new Gtk.Frame();
    const notesBox = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 16,
        margin_top: 20, margin_bottom: 20, margin_start: 24, margin_end: 24});
    notesBox.append(new Gtk.Label({label: 'Review notes', xalign: 0}));
    notesBox.append(new Gtk.Label({label: 'Navigation and flow are ready for review.', xalign: 0}));
    notesBox.append(new Gtk.Label({label: 'Open questions are collected in the left panel.', xalign: 0}));
    notes.set_child(notesBox);
    content.append(notes);

    const cards = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 14, vexpand: true});
    for (const [label, lines] of [
        ['Prototype', ['Current screen flow', 'Three screens ready', 'Review with the team']],
        ['Next steps', ['Check keyboard access', 'Refine the toolbar', 'Capture final notes']],
    ]) {
        const frame = new Gtk.Frame({hexpand: true, vexpand: true});
        const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 18,
            margin_top: 22, margin_bottom: 22, margin_start: 22, margin_end: 22});
        const cardTitle = new Gtk.Label({label, xalign: 0});
        cardTitle.add_css_class('title-4');
        box.append(cardTitle);
        for (const text of lines)
            box.append(new Gtk.Label({label: text, xalign: 0}));
        frame.set_child(box);
        cards.append(frame);
    }
    content.append(cards);
    root.append(sidebar);
    root.append(content);
    window.set_child(root);
    window.present();
});

app.run([]);
