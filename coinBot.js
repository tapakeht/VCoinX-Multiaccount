const url = require('url');
const {
        VK
} = require('vk-io');

const {
    VCoinWS,
    Miner,
    Entit
} = require('./VCoinWS');

const {
    con,
    ccon,
    formatScore,
    infLog,
    rand,
    beep
} = require('./helpers');

const {
    offColors,
    autobeep
} = require('./settings');

const NO_TOKEN = "Бот остановлен (отсутствует токен). Информация о получении токена: github.com/cursedseal/VCoinX",
    URL_NO_VK_ID = "При анализе ссылки не был найден vk_user_id.",
    STARTING = "Бот запускается...",
    STARTED = "Бот запущен!",
    BAD_CONN_PAUSED = "Плохое соединение с сервером, бот был приостановлен.",
    NOT_ENOUGH_COINS = "Недостаточно средств для покупки",
    USER_LOADED = "Пользователь успешно загружен.",
    BRK_EVT = "Обнаружен brokenEvent, видимо сервер сломался.\n\t\tЧерез 10 секунд будет выполнен перезапуск.",
    SWITCH_SRV = "Достигнут лимит попыток подключиться к серверу.\n\t\t\tПроизводится смена сервера...",
    OTHER_DEVICE = "Обнаружено открытие приложения с другого устройства.\n\t\tЧерез 30 секунд будет выполнен перезапуск.",
    USER_OFFLINE = "Пользователь отключен от сервера.\n\t\tЧерез 20 секунд будет выполнен перезапуск.",
    TRANSFER_OK = "Перевод был выполнен успешно.",
    BAD_ARGS = "Вероятно, вы где-то указали неверный аргумент.";

const TOTAL_SERVERS = 4;

function formatWSS(link, user_id, server) {
    let gsearch = url.parse(link),
        naddrWS = gsearch.protocol.replace("https:", "wss:").replace("http:", "ws:") + "//" + gsearch.host + "/channel/",
        channel = user_id % 32;

    let URLWS = naddrWS + channel + "/" + gsearch.search + "&ver=1&pass=".concat(Entit.hashPassCoin(user_id, 0));
    let srv = /([\w-]+\.)*vkforms\.ru/;
    switch (server) {
        case 1:
            return URLWS.replace(srv, "bagosi-go-go.vkforms.ru");
        case 2:
            return URLWS.replace(srv, "coin.w5.vkforms.ru");
        case 3:
            return URLWS.replace(srv, (channel > 7) ? "bagosi-go-go.vkforms.ru" : "coin.w5.vkforms.ru");
        default:
            return URLWS.replace(srv, "coin-without-bugs.vkforms.ru");
    }
}

let State = {
    STOPPED: 1,
    LOADING: 2,
    RESTARTING: 3,
    RUNNING: 4,
    
    descr: ["???", "STOPPED", "LOADING", "RESTARTING", "RUNNING"]
}

class CoinBot {
    constructor(token, doneurl="", id=0, single=false) {
        this.vk_token = token;
        this.doneurl = doneurl;
        this.single = single;
        this.id = id;

        this.miner = new Miner();
        this.coinWS = new VCoinWS();
        
        this.user_id = 0;
        this.URLWS = null;
        this.currentServer = 0;
        
        this.tryStartTTL = null;
        this.missCount = 0;
        this.missTTL = null;
        this.transferTo = 0;
        this.transferScore = 3e4;
        this.transferPercent = 0;
        this.transferInterval = 36e2;
        this.transferLastTime = 0;
        this.autoBuy = false;
        this.autoBuyItems = ["datacenter"];
        this.smartBuy = false;
        this.boosterTTL = null;
        this.lastTry = 0;
        this.numberOfTries = 3;
        this.state = State.STARTING;
        this.lastStatus = "";
        this.showStatus = false;
        this.showTransferIn = false;
        this.showTransferOut = false;
        this.showBuy = false;
        
        this.setupWS();
        if (this.updateLink()) {
            this.startBooster();
        }
    }
    
    lPrices() {
        let temp = "";
        temp += Entit.names.map(el => {
            return ccon("\n> [" + el + "] " + Entit.titles[el] + " - " + formatScore(this.miner.getPriceForItem(el), true), this.miner.hasMoney(el) ? "green" : "red", "Black", true);
        });
        return temp;
    }
    
    justPrices() {
        return Entit.names.map(el => {
            return !this.miner.hasMoney(el) ? Infinity : this.miner.getPriceForItem(el);
        });
    }
    
    conId(message, color, colorBG) {
        con("[Bot #" + this.id + "] " + message, color, colorBG);
    }
    
    conStatus() {
        this.conId("(" + State.descr[this.state] + ") " + this.lastStatus, "yellow")
    }
    
    async infLogId(message) {
        try {
            await infLog("[Bot #" + this.id + "] " + message);
        } catch (e) {}
    }
    
    async logMisc(message, doWrite, color, colorBG) {
        let idMsg = (!this.single ? "[Bot #" + this.id + "] " : "") + message;
        if (this.single || doWrite) {
            con(idMsg, color, colorBG)
        }
        try {
            await infLog(idMsg);
        } catch (e) {}
    }
    
    conMisc(message, color, colorBG) {
        if (this.single) {
            con(message, color, colorBG)
        }
    }
    
    updateLink() {
        if (!this.doneurl) {
            if (!this.vk_token) {
                this.conId(NO_TOKEN, true);
                return this.stop();
            }
            let vk = new VK();
            vk.token = this.vk_token;
            return (async _ => {
                try {
                    let {
                        mobile_iframe_url
                    } = (await vk.api.apps.get({
                        app_id: 6915965
                    })).items[0];
                    if (!mobile_iframe_url)
                        throw ("Не удалось получить ссылку на приложение.\n\t\tВозможное решение: Используйте расширенный токен.");
    
                    let id = (await vk.api.users.get())[0]["id"];
                    if (!id)
                        throw ("Не удалось получить ID пользователя.");
    
                    this.user_id = id;
                    this.URLWS = formatWSS(mobile_iframe_url, this.user_id, this.currentServer);
                    return true;
                } catch (error) {
                    this.conId('API Error: ' + error, true);
                    this.stop();
                    return false;
                }
            })();
        } else {
            let gsearch = url.parse(this.doneurl, true);
            if (!gsearch.query || !gsearch.query.vk_user_id) {
                this.conId(URL_NO_VK_ID, true);
                this.stop();
                return false;
            }
            this.user_id = parseInt(gsearch.query.vk_user_id);
    
            this.URLWS = formatWSS(this.doneurl, this.user_id, this.currentServer);
            return true;
        }
    }
    
    startBooster(tw=1e3) {
        clearTimeout(this.tryStartTTL);
        this.tryStartTTL = setTimeout(() => {
            this.state = State.STARTING;
            this.conId(STARTING);
            this.coinWS.userId = this.user_id;
            this.coinWS.run(this.URLWS, _ => {
                this.conId(STARTED);
            });
        }, tw);
    }
    
    forceRestart(t) {
        this.stop();
        this.lastStatus = "";
        this.state = State.RESTARTING;
        this.startBooster(t);
    }
    
    setupWS() {
        this.coinWS.onMissClickEvent(_ => {
            if (this.missCount === 0) {
                clearTimeout(this.missTTL);
                this.missTTL = setTimeout(_ => {
                    this.missCount = 0;
                    return;
                }, 6e4)
            }
        
            if (++this.missCount > 20)
                this.forceRestart(4e3);
        
            if (++this.missCount > 10) {
                if (autobeep)
                    beep();
                this.conId(BAD_CONN_PAUSED, true);
            }
        });
        
        this.coinWS.onReceiveDataEvent(async (place, score) => {
            this.miner.setScore(score);
            if (place > 0) {
                if (this.transferPercent) {
                    this.transferScore = Math.floor(score / 1000 * (this.transferPercent / 100))
                }
                if (this.transferTo && (this.transferScore * 1e3 < score || this.transferScore * 1e3 >= 9e9) && ((Math.floor(Date.now() / 1000) - this.transferLastTime) > this.transferInterval)) {
                    try {
                        let scoreToTransfer = this.transferScore * 1e3 >= 9e9 ? Math.floor(score / 1e3) : this.transferScore;
                        await this.coinWS.transferToUser(this.transferTo, scoreToTransfer);
                        let template = "Автоматически переведено [" + formatScore(scoreToTransfer * 1e3, true) + "] коинов от @id" + this.user_id + " к @id" + this.transferTo;
                        
                        this.transferLastTime = Math.floor(Date.now() / 1000);
                        this.logMisc(template, this.showTransferOut, "black", "Green");
                    } catch (e) {
                        this.conId("Автоматический перевод не удалася. Ошибка: " + e.message, true);
                    }
                }
        
                if (this.autoBuy && score > 0) {
                    for (let i = 0; i < this.autoBuyItems.length; i++) {
                        if (this.miner.hasMoney(this.autoBuyItems[i])) {
                            try {
                                result = await this.coinWS.buyItemById(this.autoBuyItems[i]);
                                this.miner.updateStack(result.items);
                                let template = "Автоматической покупкой был приобретен " + Entit.titles[this.autoBuyItems[i]];;
                                this.logMisc(template, this.showBuy, "black", "Green");
                                this.logMisc("Новая скорость: " + formatScore(result.tick, true) + " коинов / тик.");
                            } catch (e) {
                                this.conId(e.message == "NOT_ENOUGH_COINS" ? NOT_ENOUGH_COINS : e.message, true)
                            }
                        }
                    }
                }
        
                if (this.smartBuy && score > 0) {
                    let prices = this.justPrices();
                    prices[0] *= 1000;
                    prices[1] = Math.floor(prices[1] / 3) * 1000;
                    prices[2] *= 100;
                    prices[3] = Math.floor(prices[3] / 3) * 100;
                    prices[4] *= 10;
                    prices[5] *= 2;
                    let min = Math.min.apply(null, prices);
                    let good = prices.indexOf(min);
                    let smartBuyItem = Entit.names[good];
        
                    if (this.miner.hasMoney(smartBuyItem)) {
                        try {
                            result = await this.coinWS.buyItemById(smartBuyItem);
                            this.miner.updateStack(result.items);
                            let template = "Умной покупкой был приобретен " + Entit.titles[smartBuyItem];
                            this.logMisc(template, this.showBuy, "black", "Green");
                            this.logMisc("Новая скорость: " + formatScore(result.tick, true) + " коинов / тик.");
                        } catch (e) {
                            this.conId(e.message == "NOT_ENOUGH_COINS" ? NOT_ENOUGH_COINS : e.message, true)
                        }
                    }
                }
                let msg = "Позиция в топе: " + place + "\tКоличество коинов: " + formatScore(score, true);
                this.lastStatus = msg;
                this.conMisc(msg, "yellow");
            }
        });
        
        this.coinWS.onTransfer(async (id, score) => {
            let template = "Пользователь @id" + this.user_id + " получил [" + formatScore(score, true) + "] коинов от @id" + id;
            this.logMisc(template, this.showTransferIn, "green", "Black");
        });
        
        this.coinWS.onUserLoaded((place, score, items, top, firstTime, tick) => {
            this.logMisc(USER_LOADED);
            this.logMisc("Скорость: " + formatScore(tick, true) + " коинов / тик.");
            
            this.miner.setActive(items);
            this.miner.updateStack(items);
        
            clearInterval(this.boosterTTL);
            this.boosterTTL = setInterval(_ => {
                rand(0, 5) > 3 && this.coinWS.click();
            }, 5e2);
            this.lastStatus = "Позиция в топе: " + place + "\tКоличество коинов: " + formatScore(score, true);
            this.state = State.RUNNING;
        });
        
        this.coinWS.onBrokenEvent(_ => {
            this.conId(BRK_EVT, true);
            if (autobeep)
                beep();
            
            this.tryAgain(1e4);
        });
        
        this.coinWS.onAlreadyConnected(_ => {
            this.conId(OTHER_DEVICE, true);
            if (autobeep)
                beep();
            this.forceRestart(3e4);
        });
        
        this.coinWS.onOffline(_ => {
            if (this.state == State.RUNNING || this.state == State.STARTING) {
                this.conId(USER_OFFLINE, true);
                if (autobeep)
                    beep();
            
                this.tryAgain(2e4);
            }
        });
    }
    
    tryAgain(t) {
        this.lastStatus = "";
        this.state = State.RESTARTING;
        this.lastTry++;
        if (this.lastTry >= this.numberOfTries) {
            this.lastTry = 0;
            this.currentServer = (this.currentServer + 1) % TOTAL_SERVERS;
            this.conId(SWITCH_SRV, true);
            if (this.updateLink()) {
                this.startBooster(t);
            }
        } else {
            this.forceRestart(t);
        }
    }
    
    stop() {
        if (this.state == State.STOPPED)
            return;
        this.state = State.STOPPED;
        clearTimeout(this.tryStartTTL);
        clearTimeout(this.missTTL);
        clearInterval(this.boosterTTL);
        this.coinWS.close();
    }
    
    showDebug() {
        console.log("autobuy", this.autoBuy);
        console.log("smartbuy", this.smartBuy);
        console.log("transferTo", this.transferTo);
        console.log("transferScore", this.transferScore);
        console.log("transferInterval", this.transferInterval);
        console.log("transferLastTime", this.transferLastTime);
    }
    
    showInfo() {
        this.conId("ID пользователя: " + this.user_id.toString());
        this.conId("Текущее количество коинов: " + formatScore(this.coinWS.confirmScore, true));
        this.conId("Текущая скорость: " + formatScore(this.coinWS.tick, true) + " коинов / тик.\n");
    }
    
    getCoins() {
        return this.coinWS.confirmScore;
    }
    
    getSpeed() {
        return this.coinWS.tick;
    }
    
    start() {
        if (this.coinWS.connected)
            this.conId("VCoinX уже запущен и работает!");
        this.startBooster();
    }
    
    async buy(items) {
        for (let i = 0, j = items.length; i < j; i++) {
            if (!items[i])
                return;
            try {
                let result = await this.coinWS.buyItemById(items[i]);
                this.miner.updateStack(result.items);
                if (result && result.items)
                    delete result.items;
                this.conId("Новая скорость: " + formatScore(result.tick, true) + " коинов / тик.");
            } catch (e) {
                this.conId(e.message == "NOT_ENOUGH_COINS" ? NOT_ENOUGH_COINS : e.message, true)
            }
        }
    }
    
    setABItems(items, log=false) {
        for (let i = 0; i < items.length; i++) {
            if (!Entit.titles[items[i]]) 
                return this.conId("Неизвестное ускорение: " + items[i], true);
            if (log)
                this.conId("Для автоматической покупки установлено ускорение: " + Entit.titles[items[i]]);
        }
        this.autoBuyItems = items;
    }
    
    switchAB(log=false) {
        this.autoBuy = !this.autoBuy;
        this.smartBuy = false;
        if (log) {
            this.conId("Автопокупка: " + (this.autoBuy ? "Включена" : "Отключена"));
            this.conId("Умная покупка: Отключена");
        }
    }
    
    switchSB(log=false) {
        this.smartBuy = !this.smartBuy;
        this.autoBuy = false;
        if (log) {
            this.conId("Умная покупка: " + (this.smartBuy ? "Включена" : "Отключена"));
            this.conId("Автопокупка: Отключена");
        }
    }
    
    setTransferTo(id, log=false) {
        this.transferTo = id;
        if (log) {
            this.conId("Автоматический перевод коинов на vk.com/id" + this.transferTo);
        }
    }
    
    setTI(ti, log=false) {
        this.transferInterval = ti;
        if (log) {
            this.conId("Интервал для автоматического перевода " + this.transferInterval + " секунд.");
        }
    }
    
    setTS(ts, log=false) {
        this.transferScore = ts;
        this.transferPercent = 0;
        if (log) {
            this.conId("Количество коинов для автоматического перевода " + this.transferScore + "");
        }
    }
    
    setTP(tp, log=false) {
        this.transferPercent = tp;
        if (log) {
            this.conId("Процент коинов для автоматического перевода: " + this.transferPercent + "%");
        }
    }
    
    showPrices() {
        ccon("-- Цены --", "red");
        ccon(this.lPrices());
    }
    
    async transfer(id, count) {
        try {
            await this.coinWS.transferToUser(id, count);
            this.conId(TRANSFER_OK, "black", "Green");
            let template = "Произведена отпрвка [" + formatScore(count * 1e3, true) + "] коинов от vk.com/id" + this.user_id.toString() + " для vk.com/id" + id.toString();
            this.infLogId(template);
        } catch (e) {
            this.conId(e.message == "BAD_ARGS" ? BAD_ARGS : e.message, true);
        }
    }
}

module.exports = {
    CoinBot,
    State
};