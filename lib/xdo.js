/* window.js
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

const { GLib } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

const { Process } = Me.imports.lib.process;

const WINDOW_STATE_REGEXP = /window state: (?<state>\w+)$/;

var XDO = class XDO {
  static findWindowID(PID) {
    const stdout = Process.execCommand(`xdotool search --all --pid ${PID} --onlyvisible --limit 1`);
    return stdout && stdout.trim();
  }

  static getWindowState(windowID) {
    const stdout = Process.execCommand(`xprop WM_STATE -id ${windowID}`);
    return stdout && stdout.split('\n').reduce((windowState, line) => {
      const matches = WINDOW_STATE_REGEXP.exec(line);
      return (matches && matches.groups.state.trim()) || windowState;
    }, null);
  }
}
