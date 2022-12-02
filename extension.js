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
const { Clutter, GLib, GObject, St } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const GETTEXT_DOMAIN = 'gnome-rustdesk-extension@e7d.io';
const { gettext } = ExtensionUtils;

const RUSTDESK_SERVICE_PID_REGEXP = /^\w+ +(?<PID>\d+).*rustdesk --service$/;
const RUSTDESK_MAIN_PID_REGEXP = /^\w+ +(?<PID>\d+).*rustdesk$/;
const RUSTDESK_SESSION_CONNECT_PID_REGEXP = /^\w+ +(?<PID>\d+).*rustdesk --connect (?<sessionID>\d+)$/;
const RUSTDESK_SESSION_FILE_TRANSFER_PID_REGEXP = /^\w+ +(?<PID>\d+).*rustdesk --file-transfer (?<sessionID>\d+)$/;
const RUSTDESK_SESSION_PORT_FORWARD_PID_REGEXP = /^\w+ +(?<PID>\d+).*rustdesk --port-forward (?<sessionID>\d+)$/;
const WINDOW_STATE_REGEXP = /window state: (?<state>\w+)$/;

function execCommand(cmd) {
  try {
    let [, stdout, stderr, status] = GLib.spawn_command_line_sync(cmd);
    if (status !== 0) {
      if (stderr instanceof Uint8Array) stderr = ByteArray.toString(stderr);
      throw new Error(`Cmd failed: ${cmd}\nError detail: ${stderr}`);
    }
    if (stdout instanceof Uint8Array) stdout = ByteArray.toString(stdout);
    return stdout;
  } catch (e) {
    logError(e);
    return '';
  }
}

function toSession(sessions, sessionID) {
  return sessions[sessionID] || { sessionID, connect: {}, fileTransfer: {}, portForward: {} }
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
    const sessionConnectMatches = RUSTDESK_SESSION_CONNECT_PID_REGEXP.exec(line);
    if (sessionConnectMatches) {
      const { PID, sessionID } = sessionConnectMatches.groups;
      const windowID = PID && findWindowID(PID);
      const windowState = windowID && getWindowState(windowID);
      processes.sessions[sessionID] = {
        ...toSession(processes.sessions, sessionID),
        connect: { PID, windowID, windowState }
      };
    }
    const sessionFileTransferMatches = RUSTDESK_SESSION_FILE_TRANSFER_PID_REGEXP.exec(line);
    if (sessionFileTransferMatches) {
      const { PID, sessionID } = sessionFileTransferMatches.groups;
      const windowID = PID && findWindowID(PID);
      const windowState = windowID && getWindowState(windowID);
      processes.sessions[sessionID] = {
        ...toSession(processes.sessions, sessionID),
        fileTransfer: { PID, windowID, windowState }
      };
    }
    const sessionPortForwardMatches = RUSTDESK_SESSION_PORT_FORWARD_PID_REGEXP.exec(line);
    if (sessionPortForwardMatches) {
      const { PID, sessionID } = sessionPortForwardMatches.groups;
      const windowID = PID && findWindowID(PID);
      const windowState = windowID && getWindowState(windowID);
      processes.sessions[sessionID] = {
        ...toSession(processes.sessions, sessionID),
        portForward: { PID, windowID, windowState }
      };
    }
    return processes;
  }, { service: null, main: null, sessions: {} });
}

function findWindowID(PID) {
  return execCommand(`xdotool search --all --pid ${PID} --onlyvisible --limit 1`).trim();
}

function getWindowState(windowID) {
  const stdout = execCommand(`xprop -id ${windowID}`);
  return stdout.split('\n').reduce((windowState, line) => {
    const matches = WINDOW_STATE_REGEXP.exec(line);
    return (matches && matches.groups.state.trim()) || windowState;
  }, null);
}

function activateWindow(windowID) {
  GLib.spawn_command_line_async(`xdotool windowactivate ${windowID}`);
}

function startApp() {
  GLib.spawn_command_line_async('rustdesk');
}

function exitApp(PID) {
  GLib.spawn_command_line_async(`kill -SIGQUIT ${PID}`);
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

function startSession(action, sessionID) {
  GLib.spawn_command_line_async(`rustdesk --${action} ${sessionID}`);
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
      const online = Object.keys(this.rustDeskService.sessions).length > 0;
      this.destroy_all_children();
      this.icon = new St.Icon({ style_class: `rustdesk-icon${online ? ' online' : ''}${offline ? ' offline' : ''}` });
      this.add_child(this.icon);
    }

    toSessionLabel(sessionID) {
      return sessionID.split('').reverse().map((n, i) => `${(i + 1) % 3 === 0 ? ' ' : ''}${n}`).reverse().join('').trim();
    }

    updateMenu() {
      const service = this.rustDeskService.service;
      const main = this.rustDeskService.main;
      const sessions = Object.values(this.rustDeskService.sessions).filter(s => !s.deleted);

      this.menu.removeAll();

      const mainItem = new PopupMenu.PopupMenuItem(gettext('RustDesk'));
      mainItem.connect('activate', () => main ? activateWindow(main.windowID) : startApp());
      this.menu.addMenuItem(mainItem);

      if (sessions.length > 0) {
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
            connectCloseButton.connect('clicked', () => exitApp(connect.PID));
            connectSessionItem.add_child(connectCloseButton);
          }
          connectSessionItem.connect('activate', () => connect.windowID ? activateWindow(connect.windowID) : startSession('connect', sessionID));
          sessionSubMenu.menu.addMenuItem(connectSessionItem);
          const fileTransferSessionItem = new PopupMenu.PopupMenuItem(gettext('Transfer File'));
          fileTransferSessionItem.connect('activate', () => fileTransfer.windowID ? activateWindow(fileTransfer.windowID) : startSession('file-transfer', sessionID));
          sessionSubMenu.menu.addMenuItem(fileTransferSessionItem);
          const portForwardSessionItem = new PopupMenu.PopupMenuItem(gettext('TCP Tunneling'));
          portForwardSessionItem.connect('activate', () => portForward.windowID ? activateWindow(portForward.windowID) : startSession('port-forward', sessionID));
          sessionSubMenu.menu.addMenuItem(portForwardSessionItem);
          sessionSubMenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
          const closeSessionItem = new PopupMenu.PopupMenuItem(gettext('Close session'));
          closeSessionItem.connect('activate', () => [connect, fileTransfer, portForward].forEach(({ PID }) => PID && exitApp(PID)));
          sessionSubMenu.menu.addMenuItem(closeSessionItem);
          this.menu.addMenuItem(sessionSubMenu);
        });
        if (sessions.length > 1) {
          const closeAll = new PopupMenu.PopupMenuItem(gettext('Close all sessions'));
          closeAll.connect('activate', () => sessions.forEach(({ connect: { PID } }) => exitApp(PID)));
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
    this.sessions = {};
  }

  resolveSession(existingSession, session) {
    delete session.deleted;
    return ['connect', 'fileTransfer', 'portForward'].reduce((session, window) => {
      if (existingSession[window].windowID !== session[window].windowID) session.changed = true;
      return session;
    }, session);
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

    const previousSessions = JSON.parse(JSON.stringify(this.sessions));
    Object.keys(previousSessions).forEach(sessionID => {
      const previousSession = previousSessions[sessionID];
      delete previousSessions[sessionID].added;
      delete previousSessions[sessionID].changed;
      if (previousSession.deleted) {
        delete previousSessions[sessionID];
        return;
      }
      previousSessions[sessionID].deleted = true;
    });
    const sessions = Object.values(data.sessions).reduce((sessions, session) => {
      const existingSession = sessions[session.sessionID];
      if (existingSession) {
        sessions[session.sessionID] = this.resolveSession(existingSession, session);
        return sessions;
      }
      sessions[session.sessionID] = { ...session, added: true };
      return sessions;
    }, previousSessions);
    this.sessions = sessions;

    this.changes = serviceStarted || serviceStopped || mainStarted || mainClosed || Object.values(sessions).filter(s => s.added || s.deleted || s.changed).length > 0;
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
    const sessionCount = Object.keys(this.rustDeskService.sessions).length;
    if (this.indicator && !this.rustDeskService.main && sessionCount === 0) this.removeIndicator();
    if (!this.indicator && (this.rustDeskService.main || sessionCount > 0)) this.addIndicator();
    if (this.indicator) {
      this.indicator.updateIcon();
      if (this.rustDeskService.changes) this.indicator.updateMenu();
    }
  }
}

function init(meta) {
  return new Extension(meta.uuid);
}
