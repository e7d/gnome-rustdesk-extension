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

const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;

const Me = ExtensionUtils.getCurrentExtension();

const { Indicator } = Me.imports.lib.indicator;
const { Logger } = Me.imports.lib.logger;
const { Process } = Me.imports.lib.process;
const { RustDesk } = Me.imports.lib.rustdesk;
const { Settings } = Me.imports.lib.settings;

class Extension {
  constructor(uuid) {
    ExtensionUtils.initTranslations(Me.metadata.uuid);

    this.uuid = uuid;
    this.settings = new Settings();
    this.rustdesk = new RustDesk();
  }

  hasBinary(binary) {
    const stdout = Process.execCommand(`whereis ${binary}`);
    Logger.log(stdout);
    return true;
  }

  checkRequirements() {
    return this.hasBinary('xdotool') && this.hasBinary('xprop');
  }

  enable() {
    // if (!this.checkRequirements()) {
    //   Logger.log('Requirments are not met: please install "xdotool" and "xprop"');
    //   return;
    // }
    Logger.log('enabling');
    this.indicator = new Indicator(this.settings, this.rustdesk);
    Main.panel.addToStatusArea(this.uuid, this.indicator);
    this.refreshInterval = setInterval(this.refresh.bind(this), 1000);
  }

  disable() {
    Logger.log('disabling');
    clearInterval(this.refreshInterval);
    this.indicator.destroy();
    this.indicator = null;
  }

  refresh() {
    this.settings.update();
    this.rustdesk.update();
    this.indicator.update();
  }
}

function init(meta) {
  return new Extension(meta.uuid);
}
