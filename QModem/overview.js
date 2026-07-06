'use strict';
'require view';
'require poll';
'require ui';
'require dom';
'require uci';
'require qmodem.qmodem as qmodem';

// 加载外部样式表
document.head.appendChild(E('link', {
	'rel': 'stylesheet',
	'type': 'text/css',
	'href': L.resource('qmodem/qmodem-next.css')
}));

// 判断系统中是否存在指定的 CSS 类
function hasCssClass(className) {
	var styleSheets = document.styleSheets;
	for (var i = 0; i < styleSheets.length; i++) {
		try {
			var rules = styleSheets[i].cssRules || styleSheets[i].rules;
			if (rules) {
				for (var j = 0; j < rules.length; j++) {
					if (rules[j].selectorText && rules[j].selectorText.indexOf(className) !== -1) {
						return true;
					}
				}
			}
		} catch(e) {
			// 跨域样式表跳过
		}
	}
	return false;
}

var progressbar_className = hasCssClass('.cbi-progressbar') ? 'cbi-progressbar' : 'compat-progressbar';

// 用于转换 PLMN 运营商编码的辅助函数
function parseProviderName(valStr) {
	var cleanVal = valStr.replace(/[^0-9]/g, ''); // 提取纯数字
	var cmcc = ['46000', '46002', '46004', '46007', '46008'];
	var cucc = ['46001', '46006'];
	var ctcc = ['46003', '46011'];
	var cbnc = ['46015'];

	if (cmcc.indexOf(cleanVal) !== -1) return '中国移动 (' + valStr + ')';
	if (cucc.indexOf(cleanVal) !== -1) return '中国联通 (' + valStr + ')';
	if (ctcc.indexOf(cleanVal) !== -1) return '中国电信 (' + valStr + ')';
	if (cbnc.indexOf(cleanVal) !== -1) return '中国广电 (' + valStr + ')';
	return valStr; // 没匹配到则返回原值
}

// 现代 MIUIX 风格表格组件
var LuciTable = function() {
	this.rows = [];
	this.gridContainer = null;
	this.fieldset = null;
	this.title_span = null;
	this.arrow_icon = null;
	this.initTable();
};

LuciTable.prototype = {
	initTable: function() {
		// 大圆角沉浸式卡片容器
		this.fieldset = E('div', { 'class': 'miuix-card collapsible draggable', 'draggable': 'true' });
		
		// 头部标题区
		this.title_span = E('span', { 'class': 'miuix-card-title-text' });
		this.arrow_icon = E('span', { 'class': 'miuix-card-arrow' }, '＞');
		var icon_prefix = E('div', { 'class': 'miuix-card-icon-prefix' });
		
		var header_div = E('div', { 'class': 'miuix-card-header' }, [
			E('div', { 'class': 'miuix-card-header-left' }, [icon_prefix, this.title_span]),
			this.arrow_icon
		]);
		
		// 替代原有 table 的现代双列错落网格容器
		this.gridContainer = E('div', { 'class': 'miuix-grid-container' });
		
		this.fieldset.appendChild(header_div);
		this.fieldset.appendChild(this.gridContainer);
	},

	setTitle: function(value) {
		var translatedValue = _(value);
		this.title_span.textContent = translatedValue;
		
		// 根据面板标题动态设定左侧小圆圈彩色图标
		var prefix = this.fieldset.querySelector('.miuix-card-icon-prefix');
		if (prefix) {
			prefix.className = 'miuix-card-icon-prefix';
			if (value.indexOf('基本') !== -1 || value.indexOf('Base') !== -1) {
				prefix.classList.add('bg-blue', 'ico-base');
			} else if (value.indexOf('SIM') !== -1) {
				prefix.classList.add('bg-green', 'ico-sim');
			} else if (value.indexOf('网络') !== -1 || value.indexOf('Network') !== -1) {
				prefix.classList.add('bg-orange', 'ico-net');
			} else if (value.indexOf('小区') !== -1 || value.indexOf('Cell') !== -1) {
				prefix.classList.add('bg-purple', 'ico-cell');
			} else {
				prefix.classList.add('bg-blue', 'ico-base');
			}
		}
	},

	// 专门处理数值美化渲染的核心逻辑
	renderValue: function(container, key, value) {
		container.innerHTML = '';
		if (value == null || value === '') return;

		var valStr = String(value).trim();
		var lowerVal = valStr.toLowerCase();
		var lowerKey = String(key).toLowerCase();

		// 专门处理QoS速率的显示
		if (lowerKey.indexOf('qos') !== -1 || lowerKey.indexOf('签约') !== -1 || lowerKey.indexOf('dl qos') !== -1 || lowerKey.indexOf('ul qos') !== -1) {
			// 判断是下载还是上传，加上不同的方向类名[cite: 3]
			var directionClass = (lowerKey.indexOf('dl') !== -1 || lowerKey.indexOf('download') !== -1) ? 'qos-dl' : 'qos-ul';
			var qosSpan = E('span', { 'class': 'qos-rate-value ' + directionClass }, valStr);
			container.appendChild(qosSpan);
		}
		// 1. 识别并转换运营商名
		else if (lowerKey.indexOf('提供商') !== -1 || lowerKey.indexOf('运营商') !== -1 || lowerKey.indexOf('provider') !== -1 || lowerKey.indexOf('operator') !== -1) {
			var parsedOperator = parseProviderName(valStr);
			container.appendChild(E('span', { 'class': 'miuix-badge badge-operator' }, parsedOperator));
		}
		// 2. 识别并格式化高亮 IMEI / ICCID / IMSI 信息卡，并加入点击遮罩隐藏功能
		else if (lowerKey.indexOf('imei') !== -1 || lowerKey.indexOf('iccid') !== -1 || lowerKey.indexOf('imsi') !== -1) {
			// 检查本地存储中的显示状态
			var storageKey = 'miuix_secure_hide_' + key + '_' + valStr;
			var isHidden = localStorage.getItem(storageKey) !== 'false'; // 默认为隐藏状态
			
			// 创建一个包裹长数字的 span 元素
			var secureSpan = E('span', { 
				'class': 'miuix-code-text ' + (isHidden ? 'miuix-secure-hide' : ''),
				'style': 'cursor: pointer;', // 鼠标悬停时变成小手提示可点击
				'title': '点击显示/隐藏内容',
				'data-storage-key': storageKey,
				'data-original-value': valStr
			}, valStr);

			// 绑定点击事件：点击时自动切换隐藏/明文状态
			secureSpan.addEventListener('click', function(e) {
				e.stopPropagation(); // 防止事件冒泡到父元素
				this.classList.toggle('miuix-secure-hide');
				var isCurrentlyHidden = this.classList.contains('miuix-secure-hide');
				localStorage.setItem(this.getAttribute('data-storage-key'), isCurrentlyHidden.toString());
			});

			container.appendChild(secureSpan);
		}
		// 3. 基础就绪/在线状态高亮
		else if (lowerVal === 'yes' || lowerVal === 'ready' || lowerVal === 'online') {
			container.appendChild(E('span', { 'class': 'miuix-badge badge-success' }, valStr));
		} else if (lowerVal === 'no' || lowerVal === 'offline') {
			container.appendChild(E('span', { 'class': 'miuix-badge badge-error' }, valStr));
		} 
		// 4. 5G 网络类型高亮
		else if (lowerVal.indexOf('nr5g') !== -1 || lowerVal.indexOf('5g') !== -1) {
			container.appendChild(E('span', { 'class': 'miuix-badge badge-primary' }, valStr));
		} else {
			container.textContent = valStr;
		}
	},

	newTr: function(data, index) {
		var type = data.type;
		var rowObj = this.rows[index];
		if (!rowObj) return;

		switch(type) {
			case 'plain_text':
				var key = data.key;
				var value = data.value;
				var full_name = data.full_name || key;
				var extra_info = data.extra_info;
				
				// 【新增汉化逻辑】：拦截英文 QoS 标题并转为中文标题
				if (full_name === 'Download QoS Rate') {
					full_name = '下载速率';
				} else if (full_name === 'Upload QoS Rate') {
					full_name = '上传速率';
				}
				
				var displayName = extra_info ? _(full_name) + ' (' + extra_info + ')' : _(full_name);
				
				rowObj.labelNode.textContent = displayName;
				this.renderValue(rowObj.valueNode, key, value);

				rowObj.cell.style.display = (value == null || value === '') ? 'none' : '';
				break;
				
			case 'progress_bar':
				var key = data.key;
				var full_name = data.full_name || key;
				var extra_info = data.extra_info;
				var value = parseFloat(data.value);
				var min = parseFloat(data.min_value);
				var max = parseFloat(data.max_value);
				var unit = data.unit || '';
				var percentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
				
				rowObj.labelNode.textContent = extra_info ? _(full_name) + ' (' + extra_info + ')' : _(full_name);
				
				rowObj.valueNode.innerHTML = '';
				// 重新组合当前值与范围值，还原原版比值显示效果
				var displayValue = data.value;
				if (data.min_value !== undefined && data.max_value !== undefined) {
					displayValue = '(' + data.value + '/' + data.max_value + unit + ')';
				} else {
					displayValue = data.value + unit;
				}

				var valSpan = E('span', { 'style': 'display:block; margin-bottom:4px;' }, displayValue);
				var track = E('div', { 'class': 'miuix-progress-track' }, [
					E('div', { 'class': 'miuix-progress-bar', 'style': 'width:' + percentage + '%' })
				]);
				
				rowObj.valueNode.appendChild(valSpan);
				rowObj.valueNode.appendChild(track);
				rowObj.cell.style.display = '';
				break;
		}
	},

	setData: function(value) {
		if (value == null) return;
		var dataArray = Array.isArray(value) ? value : Object.keys(value).map(k => ({ type: 'plain_text', key: k, value: value[k] }));
		
		var row_length = this.rows.length;
		var value_length = dataArray.length;
		
		if (row_length < value_length) {
			for (var i = row_length; i < value_length; i++) {
				var labelNode = E('div', { 'class': 'miuix-grid-label' });
				var valueNode = E('div', { 'class': 'miuix-grid-value' });
				var cell = E('div', { 'class': 'miuix-grid-cell' }, [labelNode, valueNode]);
				
				this.gridContainer.appendChild(cell);
				this.rows.push({ cell: cell, labelNode: labelNode, valueNode: valueNode });
			}
		} else if (row_length > value_length) {
			for (var i = value_length; i < row_length; i++) {
				this.gridContainer.removeChild(this.rows[i].cell);
			}
			this.rows = this.rows.slice(0, value_length);
		}
		
		for (var i = 0; i < dataArray.length; i++) {
			this.newTr(dataArray[i], i);
		}
	}
};

return view.extend({
	load: function() {
		return Promise.all([uci.load('qmodem')]);
	},

	getModemList: function() {
		var modems = [];
		var sections = uci.sections('qmodem', 'modem-device');
		sections.forEach(function(section) {
			if (section.state !== 'disabled' && section.at_port) {
				var name = section.name ? section.name.toUpperCase() : 'Unknown';
				modems.push({
					id: section['.name'],
					name: section.alias ? section.alias + ' (' + name + ')' : name
				});
			}
		});
		return modems;
	},

	getSectionOrder: function(modemId) {
		var order = localStorage.getItem('qmodem_section_order_' + modemId);
		return order ? JSON.parse(order) : [];
	},

	saveSectionOrder: function(modemId, order) {
		localStorage.setItem('qmodem_section_order_' + modemId, JSON.stringify(order));
	},

	getCollapsedState: function(modemId, className) {
		return localStorage.getItem('qmodem_collapsed_' + modemId + '_' + className) === 'true';
	},

	saveCollapsedState: function(modemId, className, isCollapsed) {
		localStorage.setItem('qmodem_collapsed_' + modemId + '_' + className, isCollapsed ? 'true' : 'false');
	},

	attachSectionHandlers: function(fieldset, className, modemId, infoContainer) {
		var self = this;
		var header = fieldset.querySelector('.miuix-card-header');
		
		if (header) {
			header.addEventListener('click', function() {
				if (fieldset.classList.contains('dragging')) return;
				fieldset.classList.toggle('collapsed');
				self.saveCollapsedState(modemId, className, fieldset.classList.contains('collapsed'));
			});
		}
		
		fieldset.addEventListener('dragstart', function(e) {
			fieldset.classList.add('dragging');
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', className);
		});
		
		fieldset.addEventListener('dragend', function() {
			fieldset.classList.remove('dragging');
			infoContainer.querySelectorAll('.miuix-card').forEach(function(sec) {
				sec.classList.remove('drag-over');
			});
		});
		
		fieldset.addEventListener('dragover', function(e) {
			e.preventDefault();
			var dragEl = infoContainer.querySelector('.dragging');
			if (dragEl && dragEl !== fieldset) fieldset.classList.add('drag-over');
		});
		
		fieldset.addEventListener('dragleave', function() {
			fieldset.classList.remove('drag-over');
		});
		
		fieldset.addEventListener('drop', function(e) {
			e.preventDefault();
			fieldset.classList.remove('drag-over');
			var dragEl = infoContainer.querySelector('.dragging');
			if (dragEl && dragEl !== fieldset) {
				infoContainer.insertBefore(dragEl, fieldset);
			}
			
			var newOrder = Array.from(infoContainer.querySelectorAll('.miuix-card')).map(function(sec) {
				var txt = sec.querySelector('.miuix-card-title-text');
				return txt ? txt.textContent : '';
			}).filter(Boolean);
			self.saveSectionOrder(modemId, newOrder);
		});
	},

	updateModemInfo: function(modemId, tables_map, infoContainer, updateTimeElement, copyrightElement) {
		var self = this;
		
		if (Object.keys(tables_map).length === 0) {
			dom.content(infoContainer, E('div', { 'class': 'miuix-loader' }, [
				E('div', { 'class': 'miuix-spinner' }),
				E('span', {}, _('Loading modem information...'))
			]));
		}
		
		Promise.all([
			qmodem.getBaseInfo(modemId),
			qmodem.getSimInfo(modemId),
			qmodem.getNetworkInfo(modemId),
			qmodem.getCellInfo(modemId),
			qmodem.getCopyright(modemId)
		]).then(function(results) {
			var all_info = [];
			for (var i = 0; i < results.length - 1; i++) {
				if (results[i] && results[i].modem_info) all_info = all_info.concat(results[i].modem_info);
			}
			
			var cp = results[results.length - 1];
			if (copyrightElement && cp && cp.copyright) {
				var arr = [];
				for (var k in cp.copyright) arr.push(_(k) + ': ' + cp.copyright[k]);
				copyrightElement.textContent = arr.join(' | ');
				copyrightElement.style.display = '';
			}

			var grouped = {};
			all_info.forEach(function(entry) {
				if (entry.type === 'warning_message') return;
				
				var cName = entry['class'] || 'General';
				var lowerKey = String(entry.key).toLowerCase();

				// 如果检测到速率相关字段，强行把分配终点划入“网络信息”卡片中[cite: 3]
				if (lowerKey.indexOf('qos') !== -1 || lowerKey.indexOf('签约') !== -1) {
					var netClassName = all_info.find(function(e) {
						return e['class'] && (e['class'].indexOf('网络') !== -1 || e['class'].indexOf('Network') !== -1);
					});
					cName = netClassName ? netClassName['class'] : '网络信息';
				}

				if (!grouped[cName]) grouped[cName] = [];
				grouped[cName].push(entry);
			});

			// 特别处理ICCID显示 - 确保在SIM Information类别中显示ICCID
			for (var category in grouped) {
				var categoryEntries = grouped[category];
				var hasICCID = false;
				for (var j = 0; j < categoryEntries.length; j++) {
					if (categoryEntries[j].key && categoryEntries[j].key.toLowerCase().indexOf('iccid') !== -1) {
						hasICCID = true;
						break;
					}
				}
				
				// 如果是SIM信息类别且没有ICCID，则尝试添加ICCID显示
				if (category.indexOf('SIM') !== -1 && !hasICCID) {
					// 不需要额外操作，因为后端脚本已经包含了ICCID查询
				}
			}

			var loader = infoContainer.querySelector('.miuix-loader');
			if (loader) infoContainer.removeChild(loader);

			/*
			for (var k in tables_map) {
				if (!grouped[k]) {
					if (tables_map[k].fieldset.parentNode) infoContainer.removeChild(tables_map[k].fieldset);
					delete tables_map[k];
				}
			}
			*/

			var order = self.getSectionOrder(modemId);
			var finalOrder = [].concat(order);
			for (var k in grouped) {
				if (finalOrder.indexOf(k) === -1) finalOrder.push(k);
			}
			
			finalOrder.forEach(function(k) {
				if (!grouped[k]) return;
				if (!tables_map[k]) {
					tables_map[k] = new LuciTable();
					infoContainer.appendChild(tables_map[k].fieldset);
					self.attachSectionHandlers(tables_map[k].fieldset, k, modemId, infoContainer);
				}
				tables_map[k].setTitle(k);
				tables_map[k].setData(grouped[k]);
				
				if (self.getCollapsedState(modemId, k)) tables_map[k].fieldset.classList.add('collapsed');
				else tables_map[k].fieldset.classList.remove('collapsed');
			});
			
			if (updateTimeElement) {
				var d = new Date();
				updateTimeElement.textContent = _('Last update') + ': ' + 
					`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')} ${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
			}
		}).catch(function(e) {
			dom.content(infoContainer, E('div', { 'class': 'miuix-err' }, _('Error: %s').format(e.message)));
		});
	},

	render: function() {
		var self = this;
		var modems = this.getModemList();
		if (modems.length === 0) {
			return E('div', { 'class': 'miuix-err' }, _('No modems configured.'));
		}

		var container = E('div', { 'class': 'miuix-app-layout' });
		
		var selCard = E('div', { 'class': 'miuix-card selector-card' }, [
			E('div', { 'class': 'miuix-grid-container' }, [
				E('div', { 'class': 'miuix-grid-cell', 'style': 'grid-column: span 2;' }, [
					E('div', { 'class': 'miuix-grid-label font-bold' }, _('Modem Name')),
					E('div', { 'class': 'miuix-grid-value', 'style': 'margin-top:6px;' }, [
						E('select', { 'class': 'miuix-native-select', 'id': 'modem_selector' }, 
							modems.map(function(m) { return E('option', { 'value': m.id }, m.name); })
						)
					])
				])
			])
		]);
		container.appendChild(selCard);
		
		var timeCard = E('div', { 'class': 'miuix-time-log' }, '-');
		container.appendChild(timeCard);
		
		var infoContainer = E('div', { 'class': 'miuix-card-stream' });
		container.appendChild(infoContainer);
		
		var cpDiv = E('div', { 'class': 'miuix-footer-copyright' });
		container.appendChild(cpDiv);
		
		var tables_map = {};
		var runUpdate = function(clear) {
			var sel = container.querySelector('#modem_selector').value;
			if (clear) {
				infoContainer.innerHTML = '';
				tables_map = {};
			}
			self.updateModemInfo(sel, tables_map, infoContainer, timeCard, cpDiv);
		};
		
		container.querySelector('#modem_selector').addEventListener('change', function() { runUpdate(true); });
		runUpdate(false);
		
		poll.add(function() {
			var sel = container.querySelector('#modem_selector').value;
			self.updateModemInfo(sel, tables_map, infoContainer, timeCard, cpDiv);
		}, 10);
		
		return container;
	},
	handleSaveApply: null, handleSave: null, handleReset: null
});
