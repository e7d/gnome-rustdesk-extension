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
const Gettext = imports.gettext;
const { Clutter, Gio, GLib, GObject, St } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Me = ExtensionUtils.getCurrentExtension();

const Domain = Gettext.domain(Me.metadata.uuid);
const _ = Domain.gettext;
const ngettext = Domain.ngettext;

var Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init(settings, rustdesk) {
      super._init(0.0, _('RustDesk'));
      this.settings = settings;
      this.rustdesk = rustdesk;
      this.update(true);
    }

    updateVisible() {
      const settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.gnome-rustdesk-extension');
      this.visible = settings.get_int('show-icon') === 0
        || this.rustdesk.main
        || Object.keys(this.rustdesk.sessions).length > 0;
    }

    getIconClasses() {
      const iconClasses = [];
      if (Object.values(this.rustdesk.sessions).filter(s => !s.deleted).length > 0) iconClasses.push('session-out');
      if (this.rustdesk.connectionManager) iconClasses.push('session-in');
      if (!this.rustdesk.service) iconClasses.push('service-offline');
      return iconClasses.join(' ');
    }

    updateIcon() {
      this.destroy_all_children();
      this.icon = new St.Icon({ style_class: `rustdesk-icon ${this.getIconClasses()}` });
      this.add_child(this.icon);
    }

    toSessionLabel(sessionID) {
      return sessionID.split('').reverse().map((n, i) => `${(i + 1) % 3 === 0 ? ' ' : ''}${n}`).reverse().join('').trim();
    }

    addMainItem(menu) {
      const { main } = this.rustdesk;
      const mainItem = new PopupMenu.PopupMenuItem(_('RustDesk'));
      mainItem.connect('activate', () => main ? this.rustdesk.activateWindow(main.windowID) : this.rustdesk.startApp());
      menu.addMenuItem(mainItem);
    }

    addConnectionManagerItem(menu) {
      const { connectionManager: connectionManagerSetting } = this.settings;
      if (!connectionManagerSetting) return;
      const { connectionManager } = this.rustdesk;
      if (!connectionManager) return;
      menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      const connectionManagerItem = new PopupMenu.PopupMenuItem(_('Connection Manager'));
      connectionManagerItem.connect('activate', () => connectionManager ? this.rustdesk.activateWindow(connectionManager.windowID) : this.rustdesk.startApp());
      menu.addMenuItem(connectionManagerItem);
    }

    addSessionActionItem(subMenu, sessionType, sessionLabel, sessionID, window) {
      const item = new PopupMenu.PopupMenuItem(sessionLabel);
      const { PID, windowID } = window;
      if (PID) {
        const closeButton = new St.Button({
          style_class: 'menu-button window-close',
          icon_name: 'window-close-symbolic',
          x_align: Clutter.ActorAlign.END
        });
        closeButton.connect('clicked', () => this.rustdesk.exitApp(PID));
        item.add_child(closeButton);
      }
      item.connect('activate', () => windowID ? this.rustdesk.activateWindow(windowID) : this.rustdesk.startSession(sessionType, sessionID));
      subMenu.menu.addMenuItem(item);
    }

    addSessionsItems(menu, sessions) {
      const { sessions: sessionsSetting } = this.settings;
      if (!sessionsSetting || sessions.length === 0) return;
      menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      sessions.forEach(({ sessionID, connect, fileTransfer, portForward }) => {
        const sessionItem = new PopupMenu.PopupSubMenuMenuItem(this.toSessionLabel(sessionID));
        this.addSessionActionItem(sessionItem, 'connect', _('Connect'), sessionID, connect);
        this.addSessionActionItem(sessionItem, 'file-transfer', _('Transfer File'), sessionID, fileTransfer);
        this.addSessionActionItem(sessionItem, 'port-forward', _('TCP Tunneling'), sessionID, portForward);
        sessionItem.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const sessionCloseItem = new PopupMenu.PopupMenuItem(_('Close session'));
        sessionCloseItem.connect('activate', () => [connect, fileTransfer, portForward].forEach(({ PID }) => PID && this.rustdesk.exitApp(PID)));
        sessionItem.menu.addMenuItem(sessionCloseItem);
        menu.addMenuItem(sessionItem);
      });
      if (sessions.length < 2) return;
      const closeAllItem = new PopupMenu.PopupMenuItem(_('Close all sessions'));
      closeAllItem.connect('activate', () => sessions.forEach(({ connect: { PID } }) => this.rustdesk.exitApp(PID)));
      menu.addMenuItem(closeAllItem);
    }

    addServiceItem(menu) {
      const { service } = this.rustdesk;
      const { service: serviceSetting } = this.settings;
      if (!serviceSetting) return;
      menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      const startStopItem = new PopupMenu.PopupMenuItem(service ? _('Stop service') : _('Start service'));
      startStopItem.connect('activate', () => service ? this.rustdesk.stopService() : this.rustdesk.startService());
      menu.addMenuItem(startStopItem);
      if (!service) return;
      const restartItem = new PopupMenu.PopupMenuItem(_('Restart service'));
      restartItem.connect('activate', () => this.rustdesk.restartService());
      menu.addMenuItem(restartItem);
    }

    addQuitItem(menu, sessions) {
      const { main } = this.rustdesk;
      if (!main && sessions.length === 0) return;
      menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      const quitItem = new PopupMenu.PopupMenuItem(_('Quit'));
      quitItem.connect('activate', () => {
        if (main) this.rustdesk.exitApp(main.PID);
        sessions.forEach(({ PID }) => this.rustdesk.exitApp(PID));
      });
      menu.addMenuItem(quitItem);
    }

    updateMenu() {
      const sessions = Object.values(this.rustdesk.sessions).filter(s => !s.deleted);

      this.menu.removeAll();
      this.addMainItem(this.menu);
      this.addConnectionManagerItem(this.menu);
      this.addSessionsItems(this.menu, sessions);
      this.addServiceItem(this.menu);
      this.addQuitItem(this.menu, sessions);
    }

    update(force) {
      if (!force && !this.settings.pendingChanges && !this.rustdesk.pendingChanges) return;
      this.updateVisible();
      this.updateIcon();
      this.updateMenu();
    }
  }
);
