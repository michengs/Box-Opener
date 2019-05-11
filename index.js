module.exports = function BoxOpener(mod) {
	const Message = require('../tera-message')
	const MSG = new Message(mod)
	
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
	
	mod.command.add(["开盒", "box"], () => {
		if (!mod.settings.enabled && !scanning) {
			scanning = true;
			load();
			MSG.chat("Box-Opener " + MSG.TIP("请打开一个盒子, 脚本会循环使用它"));
		} else {
			stop();
		}
	});
	
	mod.command.add("开盒延迟", (arg) => {
		if (!arg || isNaN(arg) || parseInt(arg) < 0) {
			mod.settings.useDelay = false;
			MSG.chat("设置开盒间隔 " + MSG.BLU("无延迟"));
		} else {
			mod.settings.useDelay = true;
			mod.settings.delay = parseInt(arg);
			MSG.chat("设置开盒间隔 " + MSG.BLU((mod.settings.delay / 1000) + "秒/次" ));
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
						MSG.chat("所有盒子开完 " + MSG.RED("脚本停止"));
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
					scanning = false;
					
					boxEvent = event;
					boxId = event.id;
					MSG.chat("已选择道具编号: "   + MSG.TIP(boxId)
						+ "\n\t - 开盒脚本: " + MSG.BLU("启动")
						+ "\n\t - 开盒间隔: " + MSG.BLU((mod.settings.useDelay ? (mod.settings.delay / 1000) + "秒/次" : "无延迟"))
					);
					
					let d = new Date();
					statStarted = d.getTime();
					statOpened = 0;
					statUsed = 0;
					mod.settings.enabled = true;
					timer = setTimeout(openBox, (mod.settings.useDelay ? mod.settings.delay : 200));
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
		
		hook('S_GACHA_START', 1, (event) => {
			gacha_detected = true;
			mod.send('C_GACHA_TRY', 1, {
				id: event.id
			})
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
			
			if (msg.id === 'SMT_CANT_USE_ITEM_COOLTIME') {
				statUsed--;
			}
			
			if (msg.id === 'SMT_ITEM_MIX_NEED_METERIAL' || msg.id === 'SMT_CANT_CONVERT_NOW') {
				MSG.chat("无法再开启盒子 " + MSG.RED("脚本停止"));
				stop();
			}
		});
	}
	
	function openBox() {
		boxEvent.loc = location.loc;
		boxEvent.w = location.w;
		mod.send('C_USE_ITEM', 3, boxEvent);
		statUsed++;
		timer = setTimeout(openBox, (mod.settings.useDelay ? mod.settings.delay : 200));
	}
	
	function stop() {
		unload();
		if (scanning) {
			scanning = false;
			MSG.chat("自动开盒脚本 " + MSG.YEL("关闭"));
		} else {
			clearTimeout(timer);
			mod.settings.enabled = false;
			gacha_detected = false;
			boxEvent = null;
			if (statOpened == 0) {
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
			MSG.chat("完成次数: "     + MSG.TIP(statOpened)
				+ "\n\t - 共计用时: " + MSG.YEL(h + ":" + m + ":" + s)
				+ "\n\t - 平均用时: " + MSG.BLU(((timeElapsedMSec / statOpened) / 1000).toPrecision(2) + "秒/次")
			);
			statOpened = 0;
			statUsed = 0;
		}
	}
	
	function addZero(i) {
		if (i < 10) {
			i = "0" + i;
		}
		return i;
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
