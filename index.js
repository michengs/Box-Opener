module.exports = function BoxOpener(mod) {
	const command = mod.command || mod.require.command;
	
	if (mod.proxyAuthor !== 'caali') {
		const options = require('./module').options
		if (options) {
			const settingsVersion = options.settingsVersion
			if (settingsVersion) {
				mod.settings = require('./' + (options.settingsMigrator || 'settings_migrator.js'))(mod.settings._version, settingsVersion, mod.settings)
				mod.settings._version = settingsVersion
			}
		}
	}
	
	let hooks = [],
		boxEvent = null,
		gacha_detected = false,
		isLooting = false,
		location = null,
		timer = null,
		statOpened = 0,
		statUsed = 0,
		statStarted = null,
		scanning = false,
		boxId = 166901, // MWA box as default.
		inventory = null;
	
	mod.command.add("开盒", () => {
		if (!mod.settings.enabled && !scanning) {
			scanning = true;
			load();
			command.message("请正常打开一个盒子, 脚本会持续打开它");
		} else {
			stop();
		}
	});
	
	mod.command.add("开盒延迟", (arg) => {
		if (arg === "0") {
			mod.settings.useDelay = false;
			mod.settings.delay = 5500;
			command.message('设置开盒最小间隔延迟为: ' + '<font color="#56B4E9">无延迟</font>');
		} else if (!isNaN(arg)) {
			mod.settings.useDelay = true;
			mod.settings.delay = parseInt(arg);
			command.message('设置开盒最小间隔延迟为: <font color="#56B4E9">' + (mod.settings.delay / 1000) + ' </font>秒/盒');
		} else {
			command.message('设置开盒最小间隔延迟为: <font color="#56B4E9">' + (mod.settings.useDelay ? (mod.settings.delay / 1000) + '秒/盒' : '无延迟' ) + '</font>');
		}
	});
	
	mod.hook('C_PLAYER_LOCATION', 5, (event) => {
		location = event
	});
	
	function load() {
		hook('S_INVEN', 18, (event) => {
			if (mod.settings.enabled) {
				isLooting = false; // S_INVEN comes only after all S_SYSTEM_MESSAGE_LOOT_ITEM
				
				if (event.first) {
					inventory = [];
				} else if (!inventory) {
					return;
				}
				
				for (let item of event.items) {
					inventory.push(item);
				}
				
				if (!event.more) {
					let box = false;
					for (let item of inventory) {
						if (item.slot < 40) {
							continue;
						}
						if (item.id == boxId) {
							box = true;
						}
					}
					if (!box) {
						command.message('所有盒子开完 <font color="#E69F00">停止脚本</font>');
						stop();
					}
					inventory.splice(0, inventory.length)
					inventory = [];
					inventory = null;
				}
			}
		});
		
		hook('C_USE_ITEM', 3, (event) => {
			if (scanning) {
				if (scanning) {
					boxEvent = event;
					boxId = event.id;
					command.message(
						'选定盒子编号: <font color="#00FFFF">' + boxId + '</font> \n' +
						'\t - 自动开盒脚本: <font color="#56B4E9">启动</font> \n' +
						'\t - 开盒间隔设定: <font color="#56B4E9">' + (mod.settings.useDelay ? (mod.settings.delay / 1000) + ' 秒/盒' : '无延迟') + '</font>'
					);
					scanning = false;
					
					let d = new Date();
					statStarted = d.getTime();
					mod.settings.enabled = true;
					timer = setTimeout(openBox, mod.settings.delay);
				}
			}
		});
		
		hook('S_SYSTEM_MESSAGE_LOOT_ITEM', 1, (event) => {
			if (!gacha_detected && !isLooting && boxEvent) {
				isLooting = true;
				statOpened++;
				if (!mod.settings.useDelay) {
					clearTimeout(timer);
					openBox();
				}
			}
		});
		
		hook('S_GACHA_END', 1, (event) => {
			if (boxEvent) {
				statOpened++;
				if (!mod.settings.useDelay) {
					clearTimeout(timer);
					openBox();
				}
			}
		});
		
		hook('S_SYSTEM_MESSAGE', 1, (event) => {
			const msg = mod.parseSystemMessage(event.message);
			if (msg.id === 'SMT_ITEM_MIX_NEED_METERIAL' || msg.id === 'SMT_CANT_CONVERT_NOW') {
				command.message('无法再开启盒子 <font color="#E69F00">脚本停止</font>');
				stop();
			}
		});
		
		hook('S_GACHA_START', 1, (event) => {
			gacha_detected = true;
			mod.send('C_GACHA_TRY', 1, {
				id: event.id
			})
		});
	}
	
	function openBox() {
		boxEvent.loc = location.loc;
		boxEvent.w = location.w;
		mod.send('C_USE_ITEM', 3, boxEvent);
		if (mod.settings.useDelay) {
			statUsed++; // counter for used items other than boxes
		}
		timer = setTimeout(openBox, mod.settings.delay);
	}
	
	function addZero(i) {
		if (i < 10) {
			i = "0" + i;
		}
		return i;
	}
	
	function stop() {
		unload();
		if(scanning) {
			scanning = false;
			command.message('自动开盒脚本 <font color="#E69F00">关闭</font>');
		} else {
			clearTimeout(timer);
			mod.settings.enabled = false;
			gacha_detected = false;
			boxEvent = null;
			if(mod.settings.useDelay && statOpened == 0) {
				statOpened = statUsed;
			}
			let d = new Date();
			let t = d.getTime();
			let timeElapsedMSec = t-statStarted;
			d = new Date(1970, 0, 1); // Epoch
			d.setMilliseconds(timeElapsedMSec);
			let h = addZero(d.getHours());
			let m = addZero(d.getMinutes());
			let s = addZero(d.getSeconds());
			command.message(
				'自动开盒脚本 已完成: <font color="#FF0000">' + statOpened + '</font> 个盒子 \n' +
				'\t - 共计用时: <font color="#FF0000">' + (h + ":" + m + ":" + s) + '</font> \n' +
				'\t - 平均用时: <font color="#FF0000">' + ((timeElapsedMSec / statOpened) / 1000).toPrecision(2) + '</font> 秒/盒'
			);
			statOpened = 0;
			statUsed = 0;
		}
	}
	
	function unload() {
		if (hooks.length) {
			for (let h of hooks) {
				mod.unhook(h)
			}
			hooks = []
		}
	}
	
	function hook() {
		hooks.push(mod.hook(...arguments))
	}
	
}
