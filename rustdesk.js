/* rustdesk.js
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

const { GLib, GObject } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

const { Logger } = Me.imports.logger;
const { Process } = Me.imports.process;
const { XDO } = Me.imports.xdo;

const RUSTDESK_SERVICE_PID_REGEXP = /^\w+ +(?<PID>\d+).*rustdesk --service$/;
const RUSTDESK_MAIN_PID_REGEXP = /^\w+ +(?<PID>\d+).*rustdesk$/;
const RUSTDESK_CONNECTION_MANAGER_PID_REGEXP = /^\w+ +(?<PID>\d+).*rustdesk --cm$/;
const RUSTDESK_SESSION_CONNECT_PID_REGEXP = /^\w+ +(?<PID>\d+).*rustdesk --connect (?<sessionID>\d+)$/;
const RUSTDESK_SESSION_FILE_TRANSFER_PID_REGEXP = /^\w+ +(?<PID>\d+).*rustdesk --file-transfer (?<sessionID>\d+)$/;
const RUSTDESK_SESSION_PORT_FORWARD_PID_REGEXP = /^\w+ +(?<PID>\d+).*rustdesk --port-forward (?<sessionID>\d+)$/;

var RustDesk = class RustDesk {
  constructor() {
    this.service = null;
    this.main = null;
    this.connectionManager = null;
    this.sessions = {};
    this.pendingChanges = false;
  }

  parseServiceProcessLine(processes, line) {
    const serviceMatches = RUSTDESK_SERVICE_PID_REGEXP.exec(line);
    if (!serviceMatches) return processes;
    const { PID } = serviceMatches.groups;
    processes.service = { PID };
    return processes;
  }

  parseMainProcessLine(processes, line) {
    const mainMatches = RUSTDESK_MAIN_PID_REGEXP.exec(line);
    if (!mainMatches) return processes;
    const { PID } = mainMatches.groups;
    const windowID = PID && XDO.findWindowID(PID);
    const windowState = windowID && XDO.getWindowState(windowID);
    processes.main = { PID, windowID, windowState };
    return processes;
  }

  parseConnectionManagerProcessLine(processes, line) {
    const connectionManagerMatches = RUSTDESK_CONNECTION_MANAGER_PID_REGEXP.exec(line);
    if (!connectionManagerMatches) return processes;
    const { PID } = connectionManagerMatches.groups;
    const windowID = PID && XDO.findWindowID(PID);
    const windowState = windowID && XDO.getWindowState(windowID);
    processes.connectionManager = { PID, windowID, windowState };
    return processes;
  }

  toSession(sessions, sessionID) {
    return sessions[sessionID] || { sessionID, connect: {}, fileTransfer: {}, portForward: {} }
  }

  toSessionMatchesWithWindow(regexp, line) {
    const matches = regexp.exec(line);
    if (!matches) return null;
    const { PID, sessionID } = matches.groups;
    const windowID = PID && XDO.findWindowID(PID);
    const windowState = windowID && XDO.getWindowState(windowID);
    return { sessionID, PID, windowID, windowState }
  }

  parseSessionProcessLine(processes, type, regexp, line) {
    const matches = this.toSessionMatchesWithWindow(regexp, line);
    if (!matches) return processes;
    const { sessionID, PID, windowID, windowState } = matches;
    processes.sessions[sessionID] = {
      ...this.toSession(processes.sessions, sessionID),
      [type]: { PID, windowID, windowState }
    };
    return processes;
  }

  parseProcesses() {
    const stdout = Process.execCommand('ps -fC rustdesk').trim();
    return stdout.split('\n').reduce((processes, line) => {
      processes = this.parseServiceProcessLine(processes, line);
      processes = this.parseMainProcessLine(processes, line);
      processes = this.parseConnectionManagerProcessLine(processes, line);
      processes = this.parseSessionProcessLine(processes, 'connect', RUSTDESK_SESSION_CONNECT_PID_REGEXP, line);
      processes = this.parseSessionProcessLine(processes, 'fileTransfer', RUSTDESK_SESSION_FILE_TRANSFER_PID_REGEXP, line);
      processes = this.parseSessionProcessLine(processes, 'portForward', RUSTDESK_SESSION_PORT_FORWARD_PID_REGEXP, line);
      return processes;
    }, { service: null, main: null, connectionManager: null, sessions: {} });
  }

  startApp() {
    Logger.log(`Starting RustDesk application`);
    GLib.spawn_command_line_async('rustdesk');
  }

  exitApp(PID) {
    Logger.log(`Quitting RustDesk application`);
    GLib.spawn_command_line_async(`kill -SIGQUIT ${PID}`);
  }

  startService() {
    Logger.log(`Starting RustDesk service`);
    GLib.spawn_command_line_async('systemctl start rustdesk');
  }

  stopService() {
    Logger.log(`Stopping RustDesk service`);
    GLib.spawn_command_line_async('systemctl stop rustdesk');
  }

  restartService() {
    Logger.log(`Restarting RustDesk service`);
    GLib.spawn_command_line_async('systemctl restart rustdesk');
  }

  startSession(action, sessionID) {
    Logger.log(`Starting "${action}" RustDesk service to ${sessionID}`);
    GLib.spawn_command_line_async(`rustdesk --${action} ${sessionID}`);
  }

  activateWindow(windowID) {
    Logger.log(`Activating window ${windowID}`);
    GLib.spawn_command_line_async(`xdotool windowactivate ${windowID}`);
  }

  cloneDeep(object) {
    return JSON.parse(JSON.stringify(object));
  }

  hasServiceChanged(service) {
    const previous = this.cloneDeep(this.service);
    return (!previous && !!service)
      || (!!previous && !service)
      || (!!previous && !!service && (previous.PID !== service.PID));
  }

  hasMainChanged(main) {
    const previous = this.cloneDeep(this.main);
    return (!previous && !!main)
      || (!!previous && !main)
      || (!!previous && !!main) && previous.PID !== main.PID
      || (!!previous && !!main) && previous.windowID !== main.windowID;
  }

  hasConnectionManagerChanged(connectionManager) {
    const previous = this.cloneDeep(this.connectionManager);
    return (!previous && !!connectionManager)
      || (!!previous && !connectionManager)
      || (!!previous && !!connectionManager && previous.PID !== connectionManager.PID)
      || (!!previous && !!connectionManager && previous.windowID !== connectionManager.windowID);
  }

  toCurrentSessions(sessions) {
    const previousSessions = this.cloneDeep(this.sessions);
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
    const currentSessions = Object.values(sessions).reduce((sessions, session) => {
      const existingSession = sessions[session.sessionID];
      if (existingSession) {
        sessions[session.sessionID] = this.resolveSession(existingSession, session);
        return sessions;
      }
      sessions[session.sessionID] = { ...session, added: true };
      return sessions;
    }, previousSessions);
    const sessionsChanged = Object.values(currentSessions)
      .filter(s => s.added || s.deleted || s.changed).length > 0;
    return { currentSessions, sessionsChanged };
  }

  resolveSession(existingSession, session) {
    delete session.deleted;
    return ['connect', 'fileTransfer', 'portForward'].reduce((session, window) => {
      if (existingSession[window].windowID !== session[window].windowID) session.changed = true;
      return session;
    }, session);
  }

  update() {
    const { service, main, connectionManager, sessions } = this.parseProcesses();
    const serviceChanged = this.hasServiceChanged(service)
    const mainChanged = this.hasMainChanged(main)
    const connectionManagerChanged = this.hasConnectionManagerChanged(connectionManager)
    const { currentSessions, sessionsChanged } = this.toCurrentSessions(sessions)

    Object.assign(this, {
      service,
      main,
      connectionManager,
      sessions: currentSessions
    });

    this.pendingChanges = serviceChanged || mainChanged || connectionManagerChanged || sessionsChanged;
  }
}
