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
		boxId = 166901 // MWA box as default.
	
	mod.game.initialize("inventory")
	
	mod.game.inventory.on('update', () => {
		if (!mod.settings.enabled) return;
		
		isLooting = false; // event comes only after all S_SYSTEM_MESSAGE_LOOT_ITEM (probably)
		
		if (mod.settings.trash) {
			mod.game.inventory.findAllInBagOrPockets(mod.settings.trashList).forEach(item => {
				delItem(item);
			});
		}
	})
	
	mod.command.add(["box", "开盒"], (arg, number) => {
		if (!arg) {
			if (!mod.settings.enabled && !scanning) {
				scanning = true;
				load();
				MSG.chat(MSG.TIP("请打开一个盒子, 脚本会循环使用它"));
			} else {
				stop();
			}
		} else {
			switch (arg) {
				case "delay":
				case "延迟":
					number = parseInt(number);
					if (isNaN(number) || number < 1) {
						mod.settings.useDelay = false;
						MSG.chat("需要大于5的[数字]类型参数, 恢复默认 " + MSG.BLU("0.2s(200ms)" + "秒/次"));
					} else {
						mod.settings.useDelay = true;
						mod.settings.delay = parseInt(number) * 1000;
						MSG.chat("已设置开盒延迟 " + MSG.BLU((mod.settings.delay / 1000) + "秒/次"));
					}
					break;
				case "trash":
				case "垃圾":
					mod.settings.trash = !mod.settings.trash;
					MSG.chat("垃圾丢弃 " + (mod.settings.trash ? MSG.BLU("已启用") : MSG.YEL("已禁用")));
					break;
				default:
					MSG.chat("Box-Opener " + MSG.RED("无效的参数!"))
				break;
			}
		}
	});
	
	mod.hook('C_PLAYER_LOCATION', 5, (event) => {
		location = event
	});
	
	function load() {
		hook('C_USE_ITEM', 3, (event) => {
			if (scanning) {
				scanning = false;
				
				boxEvent = event;
				boxId = event.id;
				MSG.chat("已选择道具 " + MSG.BLU(mod.game.inventory.findInBagOrPockets(boxId).data.name) + " - " + MSG.TIP(boxId)
					+ "\n\t - 开盒脚本: " + MSG.BLU("启动")
					+ "\n\t - 开盒间隔: " + MSG.BLU((mod.settings.useDelay ? (mod.settings.delay / 1000) + "秒/次" : "无延迟"))
				);
				
				let d = new Date();
				statStarted = d.getTime();
				statOpened = 0;
				statUsed = 0;
				mod.settings.enabled = true;
				timer = setTimeout(useItem, (mod.settings.useDelay ? mod.settings.delay : 200));
			}
		});
		
		hook('S_SYSTEM_MESSAGE_LOOT_ITEM', 1, (event) => {
			if (boxEvent && !isLooting && !gacha_detected) {
				isLooting = true;
				statOpened++;
				
				if (!mod.settings.useDelay) {
					clearTimeout(timer);
					useItem();
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
					useItem();
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
	
	function useItem() {
		if (mod.game.inventory.getTotalAmountInBagOrPockets(boxEvent.id) > 0) {
			boxEvent.loc = location.loc;
			boxEvent.w = location.w;
			mod.send('C_USE_ITEM', 3, boxEvent);
			statUsed++;
			timer = setTimeout(useItem, (mod.settings.useDelay ? mod.settings.delay : 200));
		} else {
			stop();
		}
	}
	
	function delItem(item) {
		mod.send('C_DEL_ITEM', 3, {
			gameId: mod.game.me.gameId,
			pocket: item.pocket,
			slot: item.slot,
			amount: item.amount
		})
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
