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


const ByteArray = imports.byteArray;
const { GLib, GObject, St } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const GETTEXT_DOMAIN = 'gnome-rustdesk-extension@e7d.io';
const { gettext } = ExtensionUtils;

const RUSTDESK_SERVICE_PID_REGEXP = /^\w+ +(?<PID>\d+).*rustdesk --service$/;
const RUSTDESK_MAIN_PID_REGEXP = /^\w+ +(?<PID>\d+).*rustdesk$/;
const RUSTDESK_SESSION_PID_REGEXP = /^\w+ +(?<PID>\d+).*rustdesk --connect (?<sessionID>\d+)$/;
const WINDOW_STATE_REGEXP = /window state: (?<state>\w+)$/;

function execCommand(cmd) {
  try {
    let [, stdout, stderr, status] = GLib.spawn_command_line_sync(cmd);
    if (status !== 0) {
      if (stderr instanceof Uint8Array) stderr = ByteArray.toString(stderr);
      throw new Error(stderr);
    }
    if (stdout instanceof Uint8Array) stdout = ByteArray.toString(stdout);
    return stdout;
  } catch (e) {
    logError(e);
    return '';
  }
}

function parseProcesses() {
  const stdout = execCommand('ps -fC rustdesk').trim();
  return stdout.split('\n').reduce((processes, line) => {
    const serviceMatches = RUSTDESK_SERVICE_PID_REGEXP.exec(line);
    if (serviceMatches) {
      const { PID } = serviceMatches.groups;
      processes.service = { PID };
    }
    const mainMatches = RUSTDESK_MAIN_PID_REGEXP.exec(line);
    if (mainMatches) {
      const { PID } = mainMatches.groups;
      const windowID = PID && findWindowID(PID);
      const windowState = windowID && getWindowState(windowID);
      processes.main = { PID, windowID, windowState };
    }
    const sessionMatches = RUSTDESK_SESSION_PID_REGEXP.exec(line);
    if (sessionMatches) {
      const { PID, sessionID } = sessionMatches.groups;
      const windowID = PID && findWindowID(PID);
      const windowState = windowID && getWindowState(windowID);
      processes.sessions.push({ PID, sessionID, windowID, windowState });
    }
    return processes;
  }, { service: null, main: null, sessions: [] });
}

function findWindowID(PID) {
  return execCommand(`xdotool search --pid ${PID} --onlyvisible`).trim();
}

function getWindowState(windowID) {
  const stdout = execCommand(`xprop -id ${windowID}`).trim();
  return stdout.split('\n').reduce((windowState, line) => {
    const matches = WINDOW_STATE_REGEXP.exec(line);
    return (matches && matches.groups.state) || windowState;
  }, null);
}

function activateWindow(windowID) {
  console.log(`RustDesk is minized: activating ${windowID}`);
  execCommand(`xdotool windowactivate ${windowID}`);
}

function startService() {
  GLib.spawn_command_line_async('systemctl start rustdesk');
}

function stopService() {
  GLib.spawn_command_line_async('systemctl stop rustdesk');
}

function restartService() {
  GLib.spawn_command_line_async('systemctl restart rustdesk');
}

function startApp() {
  GLib.spawn_command_line_async('rustdesk');
}

function exitApp(PID) {
  GLib.spawn_command_line_async(`kill -SIGQUIT ${PID}`);
}

const Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init(rustDeskService) {
      super._init(0.0, gettext('RustDesk'));
      this.rustDeskService = rustDeskService;
      this.updateIcon();
      this.updateMenu();
    }

    updateIcon() {
      const offline = !this.rustDeskService.service;
      const online = this.rustDeskService.sessions.length > 0;
      this.destroy_all_children();
      this.icon = new St.Icon({ style_class: `rustdesk-icon${online ? ' online' : ''}${offline ? ' offline' : ''}` });
      this.add_child(this.icon);
    }

    updateMenu() {
      console.log('updateMenu');

      const service = this.rustDeskService.service;
      const main = this.rustDeskService.main;
      const sessions = this.rustDeskService.sessions.filter(s => !s.deleted);

      this.menu.removeAll();

      const mainItem = new PopupMenu.PopupMenuItem(gettext('RustDesk'));
      mainItem.connect('activate', () => main ? activateWindow(main.windowID) : startApp());
      this.menu.addMenuItem(mainItem);

      if (sessions.length > 0) {
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        sessions.forEach(({ PID, sessionID, windowID }) => {
          const sessionSubMenu = new PopupMenu.PopupSubMenuMenuItem(sessionID);
          const showSessionItem = new PopupMenu.PopupMenuItem('Show');
          showSessionItem.connect('activate', () => activateWindow(windowID));
          sessionSubMenu.menu.addMenuItem(showSessionItem);
          const closeSessionItem = new PopupMenu.PopupMenuItem('Close');
          closeSessionItem.connect('activate', () => exitApp(PID));
          sessionSubMenu.menu.addMenuItem(closeSessionItem);
          this.menu.addMenuItem(sessionSubMenu);
        });

        if (sessions.length > 1) {
          const closeAll = new PopupMenu.PopupMenuItem(gettext('Close all'));
          closeAll.connect('activate', () => sessions.forEach(({ PID }) => exitApp(PID)));
          this.menu.addMenuItem(closeAll);
        }
      }

      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      const serviceItem = new PopupMenu.PopupMenuItem(service ? gettext('Stop service') : gettext('Start service'));
      serviceItem.connect('activate', () => service ? stopService() : startService());
      this.menu.addMenuItem(serviceItem);

      if (service) {
        const restartServiceItem = new PopupMenu.PopupMenuItem(gettext('Restart service'));
        restartServiceItem.connect('activate', () => restartService());
        this.menu.addMenuItem(restartServiceItem);
      }

      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      const exitItem = new PopupMenu.PopupMenuItem(gettext('Exit'));
      exitItem.connect('activate', () => {
        if (main) exitApp(main.PID);
        sessions.forEach(({ PID }) => exitApp(PID));
      });
      this.menu.addMenuItem(exitItem);
    }
  }
);

class RustDeskService {
  constructor() {
    this.service = null;
    this.main = null;
    this.sessions = [];
  }

  set(data) {
    const previousService = JSON.parse(JSON.stringify(this.service));
    const serviceStarted = !previousService && data.service;
    const serviceStopped = previousService && !data.service;
    this.service = data.service;

    const previousMain = JSON.parse(JSON.stringify(this.main));
    const mainStarted = !previousMain && data.main;
    const mainClosed = previousMain && !data.main;
    this.main = data.main;

    const previousSessions = JSON.parse(JSON.stringify(this.sessions))
      .filter(s => !s.deleted)
      .map(s => {
        delete s.added;
        s.deleted = true;
        return s;
      });
    const sessions = data.sessions.reduce((sessions, session) => {
      const existingSession = sessions.find(({ sessionID }) => sessionID === session.sessionID);
      if (existingSession) {
        delete existingSession.deleted;
        return sessions;
      }
      return [...sessions, { ...session, added: true }];
    }, previousSessions);
    this.sessions = sessions;

    this.changes = serviceStarted || serviceStopped || mainStarted || mainClosed || sessions.filter(s => s.added || s.deleted).length > 0;
  }
}

class Extension {
  constructor(uuid) {
    this.uuid = uuid;
    ExtensionUtils.initTranslations(GETTEXT_DOMAIN);
    this.rustDeskService = new RustDeskService();
  }

  enable() {
    this.refreshInterval = setInterval(this.refresh.bind(this), 1000);
  }

  disable() {
    clearInterval(this.refreshInterval);
  }

  addIndicator() {
    this.indicator = new Indicator(this.rustDeskService);
    Main.panel.addToStatusArea(this.uuid, this.indicator);
  }

  removeIndicator() {
    this.indicator.destroy();
    this.indicator = null;
  }

  refresh() {
    this.rustDeskService.set(parseProcesses());
    if (this.indicator && !this.rustDeskService.main && this.rustDeskService.sessions.length === 0) this.removeIndicator();
    if (!this.indicator && (this.rustDeskService.main || this.rustDeskService.sessions.length > 0)) this.addIndicator();
    if (this.indicator) {
      this.indicator.updateIcon();
      if (this.rustDeskService.changes) this.indicator.updateMenu();
    }
  }
}

function init(meta) {
  return new Extension(meta.uuid);
}
