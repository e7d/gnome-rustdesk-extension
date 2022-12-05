/* extension.js
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

const ByteArray = imports.byteArray;
const { Clutter, Gio, GLib, GObject, St } = imports.gi;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Me = ExtensionUtils.getCurrentExtension();
const { gettext } = ExtensionUtils;

const { RustDesk } = Me.imports.rustdesk;

const GETTEXT_DOMAIN = 'gnome-rustdesk-extension@e7d.io';

const Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init(rustdesk) {
      super._init(0.0, gettext('RustDesk'));
      this.rustdesk = rustdesk;
      this.update();
    }

    updateVisible() {
      const settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.gnome-rustdesk-extension');
      this.visible = settings.get_boolean('always-show')
        || this.rustdesk.main
        || Object.keys(this.rustdesk.sessions).length > 0;
    }

    updateIcon() {
      const offline = !this.rustdesk.service;
      const online = Object.values(this.rustdesk.sessions).filter(s => !s.deleted).length > 0;
      this.destroy_all_children();
      this.icon = new St.Icon({ style_class: `rustdesk-icon${online ? ' online' : ''}${offline ? ' offline' : ''}` });
      this.add_child(this.icon);
    }

    toSessionLabel(sessionID) {
      return sessionID.split('').reverse().map((n, i) => `${(i + 1) % 3 === 0 ? ' ' : ''}${n}`).reverse().join('').trim();
    }

    updateMenu() {
      const service = this.rustdesk.service;
      const main = this.rustdesk.main;
      const sessions = Object.values(this.rustdesk.sessions).filter(s => !s.deleted);

      const settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.gnome-rustdesk-extension');
      const manageSessions = settings.get_boolean('sessions')
      const manageservice = settings.get_boolean('service')

      this.menu.removeAll();

      const mainItem = new PopupMenu.PopupMenuItem(gettext('RustDesk'));
      mainItem.connect('activate', () => main ? this.rustdesk.activateWindow(main.windowID) : this.rustdesk.startApp());
      this.menu.addMenuItem(mainItem);

      if (manageSessions && sessions.length > 0) {
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        sessions.forEach(({ sessionID, connect, fileTransfer, portForward }) => {
          const sessionSubMenu = new PopupMenu.PopupSubMenuMenuItem(this.toSessionLabel(sessionID));
          const connectSessionItem = new PopupMenu.PopupMenuItem(gettext('Connect'));
          if (connect.PID) {
            const connectCloseButton = new St.Button({
              style_class: 'menu-button window-close',
              icon_name: 'window-close-symbolic',
              x_align: Clutter.ActorAlign.END
            });
            connectCloseButton.connect('clicked', () => this.rustdesk.exitApp(connect.PID));
            connectSessionItem.add_child(connectCloseButton);
          }
          connectSessionItem.connect('activate', () => connect.windowID ? this.rustdesk.activateWindow(connect.windowID) : this.rustdesk.startSession('connect', sessionID));
          sessionSubMenu.menu.addMenuItem(connectSessionItem);
          const fileTransferSessionItem = new PopupMenu.PopupMenuItem(gettext('Transfer File'));
          fileTransferSessionItem.connect('activate', () => fileTransfer.windowID ? this.rustdesk.activateWindow(fileTransfer.windowID) : this.rustdesk.startSession('file-transfer', sessionID));
          sessionSubMenu.menu.addMenuItem(fileTransferSessionItem);
          const portForwardSessionItem = new PopupMenu.PopupMenuItem(gettext('TCP Tunneling'));
          portForwardSessionItem.connect('activate', () => portForward.windowID ? this.rustdesk.activateWindow(portForward.windowID) : this.rustdesk.startSession('port-forward', sessionID));
          sessionSubMenu.menu.addMenuItem(portForwardSessionItem);
          sessionSubMenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
          const closeSessionItem = new PopupMenu.PopupMenuItem(gettext('Close session'));
          closeSessionItem.connect('activate', () => [connect, fileTransfer, portForward].forEach(({ PID }) => PID && this.rustdesk.exitApp(PID)));
          sessionSubMenu.menu.addMenuItem(closeSessionItem);
          this.menu.addMenuItem(sessionSubMenu);
        });
        if (sessions.length > 1) {
          const closeAll = new PopupMenu.PopupMenuItem(gettext('Close all sessions'));
          closeAll.connect('activate', () => sessions.forEach(({ connect: { PID } }) => this.rustdesk.exitApp(PID)));
          this.menu.addMenuItem(closeAll);
        }
      }

      if (manageservice) {
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const serviceItem = new PopupMenu.PopupMenuItem(service ? gettext('Stop service') : gettext('Start service'));
        serviceItem.connect('activate', () => service ? this.rustdesk.stopService() : this.rustdesk.startService());
        this.menu.addMenuItem(serviceItem);

        if (service) {
          const restartServiceItem = new PopupMenu.PopupMenuItem(gettext('Restart service'));
          restartServiceItem.connect('activate', () => this.rustdesk.restartService());
          this.menu.addMenuItem(restartServiceItem);
        }
      }

      if (main || sessions.length > 0) {
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const exitItem = new PopupMenu.PopupMenuItem(gettext('Exit'));
        exitItem.connect('activate', () => {
          if (main) this.rustdesk.exitApp(main.PID);
          sessions.forEach(({ PID }) => this.rustdesk.exitApp(PID));
        });
        this.menu.addMenuItem(exitItem);
      }
    }

    update() {
      this.updateVisible();
      if (!this.visible || !this.rustdesk.pendingChanges) return;
      this.updateIcon();
      this.updateMenu();
    }
  }
);



class Extension {
  constructor(uuid) {
    this.uuid = uuid;
    ExtensionUtils.initTranslations(GETTEXT_DOMAIN);
    this.rustdesk = new RustDesk();
  }

  enable() {
    log(`enabling ${Me.metadata.name}`);
    this.indicator = new Indicator(this.rustdesk);
    Main.panel.addToStatusArea(this.uuid, this.indicator);
    this.refreshInterval = setInterval(this.refresh.bind(this), 1000);
  }

  disable() {
    log(`disabling ${Me.metadata.name}`);
    clearInterval(this.refreshInterval);
    this.indicator.destroy();
    this.indicator = null;
  }

  refresh() {
    this.rustdesk.update();
    this.indicator.update();
  }
}

function init(meta) {
  return new Extension(meta.uuid);
}
