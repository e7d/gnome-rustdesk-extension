/* prefs.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

'use strict';

const Gettext = imports.gettext;
const { Adw, Gio, GLib, GObject, Gtk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Domain = Gettext.domain(Me.metadata.uuid);
const _ = Domain.gettext;

function init() {
  ExtensionUtils.initTranslations(Me.metadata.uuid);
}

function addSetupButton(group) {
  const row = new Adw.ActionRow({ title: _('Setup the required dependencies for the extension to work properly!') });
  group.add(row);

  const button = new Gtk.Button({
    label: _('Setup'),
    valign: Gtk.Align.CENTER,
  });
  button.connect('clicked', () => {
    GLib.spawn_command_line_async('dnf install xdotool');
  });

  row.add_suffix(button);
}

function addShowIconComboBox(settings, group) {
  const row = new Adw.ActionRow({ title: _('Display icon') });
  group.add(row);

  let model = new Gtk.ListStore();
  model.set_column_types([GObject.TYPE_STRING, GObject.TYPE_STRING]);

  let cbox = new Gtk.ComboBox({
    model: model,
    active: settings.get_int('show-icon'),
    valign: Gtk.Align.CENTER,
  });
  let renderer = new Gtk.CellRendererText();
  cbox.pack_start(renderer, true);
  cbox.add_attribute(renderer, 'text', 1);

  model.set(model.append(), [0, 1], ['always', _('Always')]);
  model.set(model.append(), [0, 1], ['when-running', _('When RustDesk is running')]);

  settings.bind(
    'show-icon',
    cbox,
    'active',
    Gio.SettingsBindFlags.DEFAULT
  );

  row.add_suffix(cbox);
}

function addConnectionManagerSwitch(settings, group) {
  const row = new Adw.ActionRow({
    title: _('Connection manager'),
    subtitle: _('Display an entry to access the control manager window when opened.')
  });
  group.add(row);

  const toggle = new Gtk.Switch({
    active: settings.get_boolean('connection-manager'),
    valign: Gtk.Align.CENTER,
  });
  settings.bind(
    'connection-manager',
    toggle,
    'active',
    Gio.SettingsBindFlags.DEFAULT
  );

  row.add_suffix(toggle);
  row.activatable_widget = toggle;
}

function addSessionsSwitch(settings, group) {
  const row = new Adw.ActionRow({
    title: _('Manage sessions'),
    subtitle: _('Display an entry to manage each currently opened session.')
  });
  group.add(row);

  const toggle = new Gtk.Switch({
    active: settings.get_boolean('sessions'),
    valign: Gtk.Align.CENTER,
  });
  settings.bind(
    'sessions',
    toggle,
    'active',
    Gio.SettingsBindFlags.DEFAULT
  );

  row.add_suffix(toggle);
  row.activatable_widget = toggle;
}

function addServiceSwitch(settings, group) {
  const row = new Adw.ActionRow({
    title: _('Manage service'),
    subtitle: _('Display additional entries to start and stop the RustDesk service.')
  });
  group.add(row);

  const toggle = new Gtk.Switch({
    active: settings.get_boolean('service'),
    valign: Gtk.Align.CENTER,
  });
  settings.bind(
    'service',
    toggle,
    'active',
    Gio.SettingsBindFlags.DEFAULT
  );

  row.add_suffix(toggle);
  row.activatable_widget = toggle;
}

function fillPreferencesWindow(window) {
  const settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.gnome-rustdesk-extension');

  const page = new Adw.PreferencesPage();
  const group = new Adw.PreferencesGroup();
  page.add(group);

  // addSetupButton(group);
  addShowIconComboBox(settings, group);
  addConnectionManagerSwitch(settings, group);
  addSessionsSwitch(settings, group);
  addServiceSwitch(settings, group);

  window.add(page);
}
