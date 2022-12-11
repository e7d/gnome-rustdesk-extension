/* process.js
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
const { GLib } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

const { Logger } = Me.imports.lib.logger;

var Process = class Process {
  static execCommand(cmd) {
    try {
      let [, stdout, stderr, status] = GLib.spawn_command_line_sync(cmd);
      if (status !== 0) {
        const err = stderr instanceof Uint8Array
          ? ByteArray.toString(stderr)
          : stderr;
        throw new Error(`Cmd failed: ${cmd}\nError detail: ${err}`);
      }
      return stdout instanceof Uint8Array
        ? ByteArray.toString(stdout)
        : stdout;
    } catch (e) {
      Logger.error(e);
      return '';
    }
  }
}
