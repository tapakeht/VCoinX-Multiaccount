const url = require('url'),
    open = require('open'),
    {
        VK
    } = require('vk-io');

const {
	CoinBot,
	State
} = require('./coinBot');

const {
    con,
    ccon,
    setColorsM,
    formatScore,
    rl,
    existsFile,
    existsAsync,
    writeFileAsync,
    appendFileAsync,
    setTerminalTitle,
    getVersion,
    infLog,
    onUpdates,
    beep,
} = require('./helpers');

let {
    BOTS
} = existsFile('./config.js') ? require('./config.js') : {};

let {
    autobeep,
    offColors
} = require('./settings')

let
    advertDisp = true,
    disableUpdates = false,
    updatesEv = false,
    updatesInterval = 60,
    updatesLastTime = 0;

onUpdates(msg => {
    if (!updatesEv && !disableUpdates)
        updatesEv = msg;

    con(msg, "white", "Red");
});

let bots = BOTS.map((cfg, i) => {
    let bot = new CoinBot(cfg.TOKEN, cfg.DONEURL, cfg.NAME_USER);
    if (cfg.TO) {
        bot.setTransferTo(cfg.TO);
    }
    if (cfg.TI) {
        bot.setTI(cfg.TI);
    }
    if (cfg.TSUM) {
        bot.setTS(cfg.TSUM);
    }
    if (cfg.TPERC) {
        bot.setTP(cfg.TPERC);
    }
    if (cfg.AUTOBUY) {
        bot.switchAB();
    }
    if (cfg.AUTOBUYITEMS) {
        bot.setABItems(cfg.AUTOBUYITEMS);
    }
    if (cfg.SMARTBUY) {
        bot.switchSB();
    }
    if (cfg.SHOW_STATUS) {
        bot.showStatus = true;
    }
    if (cfg.SHOW_T_IN) {
        bot.showTransferIn = true;
    }
    if (cfg.SHOW_T_OUT) {
        bot.showTransferOut = true;
    }
    if (cfg.SHOW_BUY) {
        bot.showBuy = true;
    }
    return bot;
});

let selBot = -1;

let showStatus = setInterval(_ => {
	let totalCoins = 0,
	    totalSpeed = 0,
        running = 0;
    for (let i = 0; i < bots.length; i++) {
        if (bots[i].state == State.RUNNING){
            running++;
            totalCoins += bots[i].getCoins();
            totalSpeed += bots[i].getSpeed();
        }
        if (bots[i].showStatus) {
            bots[i].conStatus();
        }
    }
    con("Работает " + running + " ботов из " + bots.length, "cyan");
    con("Всего коинов: " + formatScore(totalCoins, true), "cyan");
    con("Общая скорость: " + formatScore(totalSpeed, true) + " коинов/тик", "cyan");
}, 1e4);

rl.on('line', async (line) => {
	switch (line.trim().toLowerCase()) {
        case '':
            break;
            
        case "?":
        case "help":
            ccon("-- VCoinX --", "red");
            ccon("showall - показать статус всех ботов.");
            ccon("sel(ect) - выбрать бота.");
            ccon("info - отображение основной информации.");
            ccon("debug - отображение тестовой информации.");
            ccon("stop(pause)	- остановка майнера.");
            ccon("start(run)	- запуск майнера.");
            ccon("(b)uy	- покупка улучшений.");
            ccon("(p)rice - отображение цен на товары.");
            ccon("tran(sfer)	- перевод игроку.");
            ccon("hideupd(ate) - скрыть уведомление об обновлении.");
            ccon("to - указать ID и включить авто-перевод средств на него.");
            ccon("ti - указать интервал для авто-перевода (в секундах).");
            ccon("tsum - указать сумму для авто-перевода (без запятой).");
            ccon("autobuy - изменить статус авто-покупки.");
            ccon("autobuyitem - указать предмет(ы) для авто-покупки.");
            ccon("smartbuy - изменить статус умной покупки.")
            ccon("color - изменить цветовую схему консоли.");
            break;
            
        case 'color':
            setColorsM(offColors = !offColors);
            ccon("Цвета " + (offColors ? "от" : "в") + "ключены. (*^.^*)", "blue");
            break;

        case "hideupd":
        case "hideupdate":
            ccon("Уведомления об обновлении " + (!disableUpdates ? "скрыт" : "показан") + "ы. (*^.^*)");
            disableUpdates = !disableUpdates;
            break;
        
        case 'autobeep':
        case 'beep':
            autobeep = !autobeep;
            ccon("Автоматическое проигрывание звука при ошибках " + autobeep ? "включено" : "отключено" + ".");
            break;
        
        case 'sel':
        case 'select':
            let item = await rl.questionAsync("ID бота: ");
            let id = parseInt(item);
            if (!isNaN(id) && id > 0 && id <= bots.length) {
                selBot = id - 1;
                ccon("Выбран бот #"+id)
            }
            break;
            
        case 'showall':
            for (let i = 0; i < bots.length; i++) {
                bots[i].conStatus();
            }
            break;
    }
	
    if (selBot != -1) {
        let temp, item;
        
        switch (line.trim().toLowerCase()) {
            case '':
                break;
    
            case 'debuginformation':
            case 'debuginfo':
            case 'debug':
                bots[selBot].showDebug();
                break;
    
            case 'i':
            case 'info':
                bots[selBot].showInfo();
                break;
    
            case "stop":
            case "pause":
                bots[selBot].stop();
                break;
    
            case "start":
            case "run":
                bots[selBot].start();
                break;
    
            case 'b':
            case 'buy':
                bots[selBot].showPrices();
                item = await rl.questionAsync("Введи название ускорения [cursor, cpu, cpu_stack, computer, server_vk, quantum_pc, datacenter]: ");
                await bots[selBot].buy(item.split(" "));
                break;
    
            case 'autobuyitem':
                item = await rl.questionAsync("Введи название ускорения для автоматической покупки [cursor, cpu, cpu_stack, computer, server_vk, quantum_pc, datacenter]: ");
                bots[selBot].setABItems(item.split(" "), true);
                break;
    
            case 'ab':
            case 'autobuy':
                bots[selBot].switchAB(true);
                break;
    
            case 'sb':
            case 'smartbuy':
                bots[selBot].switchSB(true);
                break;
    
            case 'to':
                item = await rl.questionAsync("Введите ID пользователя: ");
                bots[selBot].setTransferTo(parseInt(item.replace(/\D+/g, "")), true);
                break;
    
            case 'ti':
                item = await rl.questionAsync("Введите интервал: ");
                bots[selBot].setTI(parseInt(item), true);
                break;
    
            case 'tsum':
                item = await rl.questionAsync("Введите сумму: ");
                bots[selBot].setTS(parseInt(item), true);
                break;
    
            case 'tperc':
                bots[selBot].setTP(parseInt(item), true);
                break;
    
            case 'p':
            case 'price':
            case 'prices':
                bots[selBot].showPrices();
                break;
    
            case 'tran':
            case 'transfer':
                let count = await rl.questionAsync("Количество: ");
                let id = await rl.questionAsync("ID получателя: ");
                let conf = await rl.questionAsync("Вы уверены? [yes]: ");
                id = parseInt(id.replace(/\D+/g, ""));
                if (conf.toLowerCase() != "yes" || !id || !count)
                    return con("Отправка не была произведена, вероятно, один из параметров не был указан.", true);
                await bots[selBot].transfer(id, count);
                break;
        }
    }
});

// ~ argument parsing ~ //

for (var argn = 2; argn < process.argv.length; argn++) {
    let cTest = process.argv[argn],
        dTest = process.argv[argn + 1];

    switch (cTest.trim().toLowerCase()) {

        case '-black':
            {
                con("Цвета отключены (*^.^*)", "blue");
                setColorsM(offColors = !offColors);
                break;
            }
        
        case '-noupdates':
            ccon("Уведомления об обновлении скрыты. (*^.^*)");
            disableUpdates = true;
            break;
        
        case '-h':
        case '-help':
            {
                ccon("-- VCoinX arguments --", "red");
                ccon("-help			- помощь.");
                ccon("-black      - отключить цвета консоли.");
                ccon("-noupdates  - отключить сообщение об обновлениях.");
                process.exit();
                continue;
            }
        default:
            con('Unrecognized param: ' + cTest + ' (' + dTest + ') ');
            break;
    }
}