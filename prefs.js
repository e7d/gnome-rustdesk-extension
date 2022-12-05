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

const { Adw, Gio, GLib, Gtk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

function init() {
}

function addSetupButton(group) {
  const row = new Adw.ActionRow({ title: 'Setup the required dependencies for the extension to work properly!' });
  group.add(row);

  const button = new Gtk.Button({
    label: 'Setup',
    valign: Gtk.Align.CENTER,
  });
  button.connect('clicked', () => {
    // GLib.spawn_command_line_async(`dnf install xdotool`);
  });

  row.add_suffix(button);
}

function addSessionsSwitch(settings, group) {
  const row = new Adw.ActionRow({ title: 'Manage opened sessions' });
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
  // row.activatable_widget = toggle;
}

function addServiceSwitch(settings, group) {
  const row = new Adw.ActionRow({ title: 'Manage RustDesk service' });
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
  // row.activatable_widget = toggle;
}

function addAlwaysShowSwitch(settings, group) {
  const row = new Adw.ActionRow({ title: 'Always show icon' });
  group.add(row);

  const toggle = new Gtk.Switch({
    active: settings.get_boolean('always-show'),
    valign: Gtk.Align.CENTER,
  });
  settings.bind(
    'always-show',
    toggle,
    'active',
    Gio.SettingsBindFlags.DEFAULT
  );

  row.add_suffix(toggle);
  // row.activatable_widget = toggle;
}

function fillPreferencesWindow(window) {
  const settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.gnome-rustdesk-extension');

  const page = new Adw.PreferencesPage();
  const group = new Adw.PreferencesGroup();
  page.add(group);

  // addSetupButton(group);
  addAlwaysShowSwitch(settings, group);
  addSessionsSwitch(settings, group);
  addServiceSwitch(settings, group);

  window.add(page);
}
