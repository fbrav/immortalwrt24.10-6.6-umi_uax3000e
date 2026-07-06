#!/bin/bash
#
# Copyright (c) 2019-2020 P3TERX <https://p3terx.com>
#
# This is free software, licensed under the MIT License.
# See /LICENSE for more information.
#
# https://github.com/P3TERX/Actions-OpenWrt
# File name: diy-part2.sh
# Description: OpenWrt DIY script part 2 (After Update feeds)
#

# Modify default IP
sudo apt install libfuse-dev
rm -rf feeds/packages/lang/golang
git clone https://github.com/sbwml/packages_lang_golang -b 25.x feeds/packages/lang/golang

cp "$GITHUB_WORKSPACE"/QModem/qmodem-next.css feeds/qmodem/luci/luci-app-qmodem-next/htdocs/luci-static/resources/qmodem/qmodem-next.css
cp "$GITHUB_WORKSPACE"/QModem/overview.js feeds/qmodem/luci/luci-app-qmodem-next/htdocs/luci-static/resources/view/qmodem/overview.js
cp "$GITHUB_WORKSPACE"/QModem/quectel.sh feeds/qmodem/application/qmodem/files/usr/share/qmodem/vendor/quectel.sh
