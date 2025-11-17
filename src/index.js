require('dotenv').config();
const TelegramBotHandler = require('./bot');
const AdminPanel = require('./adminPanel');
const Database = require('./database');

class Application {
    constructor() {
        this.db = new Database();
        this.bot = new TelegramBotHandler();
        this.adminPanel = new AdminPanel();
        // Передаем ссылку на бот в админ панель для health check
        this.adminPanel.bot = this.bot;
    }

    async start() {
        try {
            // Проверяем наличие необходимых переменных окружения
            if (!process.env.TELEGRAM_BOT_TOKEN) {
                throw new Error('TELEGRAM_BOT_TOKEN не установлен в переменных окружения');
            }

            if (!process.env.ADMIN_TELEGRAM_ID) {
                console.warn('⚠️  ADMIN_TELEGRAM_ID не установлен. Админские функции будут недоступны.');
            }

            if (!process.env.APPROVED_CHAT_LINK) {
                console.warn('⚠️  APPROVED_CHAT_LINK не установлен. Ссылка на чат не будет отправляться при одобрении.');
            }

            // Запускаем админ панель
            const port = process.env.PORT || 3000;
            this.adminPanel.start(port);

            console.log('🚀 Приложение запущено успешно!');
            console.log(`📱 Telegram бот инициализирован (проверка подключения...)`);
            console.log(`🌐 Админ панель: http://0.0.0.0:${port}`);
            console.log(`📊 База данных: ${process.env.DATABASE_PATH || './database.sqlite'}`);
            console.log(`🔑 TELEGRAM_BOT_TOKEN установлен: ${process.env.TELEGRAM_BOT_TOKEN ? '✅ Да' : '❌ Нет'}`);
            console.log(`🌍 NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
            
            // Проверяем что бот действительно работает
            setTimeout(async () => {
                try {
                    const botInfo = await this.bot.bot.getMe();
                    console.log(`✅ Бот подтвержден: @${botInfo.username}`);
                    const botStatus = this.bot.getStatus();
                    console.log(`📊 Статус бота:`, {
                        pollingActive: botStatus.isPollingActive,
                        pollingStarted: botStatus.pollingStarted,
                        reconnectAttempts: botStatus.reconnectAttempts
                    });
                } catch (error) {
                    console.error('❌ Проблема с ботом:', error.message);
                    console.error('Проверьте:');
                    console.error('1. Правильность TELEGRAM_BOT_TOKEN');
                    console.error('2. Доступность Telegram API с сервера');
                    console.error('3. Логи на наличие ошибок polling');
                }
            }, 3000);
            
            // Keep-alive механизм для Stormkit (периодические запросы к health endpoint)
            this.startKeepAlive(port);

        } catch (error) {
            console.error('❌ Ошибка при запуске приложения:', error);
            process.exit(1);
        }
    }
    
    startKeepAlive(port) {
        // Keep-alive для Stormkit - периодические запросы к health endpoint
        // чтобы приложение не засыпало
        const keepAliveInterval = setInterval(async () => {
            try {
                const http = require('http');
                const options = {
                    hostname: 'localhost',
                    port: port,
                    path: '/health',
                    method: 'GET',
                    timeout: 5000
                };
                
                const req = http.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        try {
                            const health = JSON.parse(data);
                            if (health.status === 'ok') {
                                console.log(`💚 Keep-alive: Health check OK (${new Date().toLocaleTimeString()})`);
                            } else {
                                console.warn(`⚠️  Keep-alive: Health check warning - ${health.message || 'unknown'}`);
                            }
                        } catch (e) {
                            // Игнорируем ошибки парсинга
                        }
                    });
                });
                
                req.on('error', (error) => {
                    // Игнорируем ошибки keep-alive, чтобы не засорять логи
                    // console.error('Keep-alive error:', error.message);
                });
                
                req.on('timeout', () => {
                    req.destroy();
                });
                
                req.end();
            } catch (error) {
                // Игнорируем ошибки keep-alive
            }
        }, 5 * 60 * 1000); // Каждые 5 минут
        
        // Очистка при завершении процесса
        process.on('SIGINT', () => {
            clearInterval(keepAliveInterval);
        });
        
        process.on('SIGTERM', () => {
            clearInterval(keepAliveInterval);
        });
        
        console.log('💚 Keep-alive механизм запущен (каждые 5 минут)');
    }
}

// Обработка завершения процесса
process.on('SIGINT', () => {
    console.log('\n🛑 Получен сигнал завершения. Завершение работы...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Получен сигнал завершения. Завершение работы...');
    process.exit(0);
});

// Запуск приложения
const app = new Application();
app.start().catch((error) => {
    console.error('❌ Критическая ошибка при запуске:', error);
    process.exit(1);
});
