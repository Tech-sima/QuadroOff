const express = require('express');
const Database = require('./database');
const GoogleSheets = require('./googleSheets');
const path = require('path');

class AdminPanel {
    constructor() {
        this.app = express();
        this.db = new Database();
        this.googleSheets = new GoogleSheets();
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.static(path.join(__dirname, '../public')));
    }

    setupRoutes() {
        // Health check endpoint для Stormkit и других платформ
        this.app.get('/health', async (req, res) => {
            try {
                const botStatus = this.bot ? this.bot.getStatus() : null;
                const healthStatus = {
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    bot: botStatus ? {
                        isPollingActive: botStatus.isPollingActive,
                        pollingStarted: botStatus.pollingStarted,
                        reconnectAttempts: botStatus.reconnectAttempts,
                        timeSinceLastMessage: Math.floor(botStatus.timeSinceLastMessage / 1000) + 's'
                    } : null
                };
                
                // Если бот не активен более 10 минут, возвращаем warning
                if (botStatus && !botStatus.isPollingActive && botStatus.timeSinceLastMessage > 10 * 60 * 1000) {
                    healthStatus.status = 'warning';
                    healthStatus.message = 'Bot polling is not active';
                }
                
                res.status(200).json(healthStatus);
            } catch (error) {
                console.error('Ошибка при проверке здоровья:', error);
                res.status(500).json({ 
                    status: 'error', 
                    timestamp: new Date().toISOString(),
                    error: error.message 
                });
            }
        });

        // Главная страница
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../public/index.html'));
        });

        // API для получения всех заявок
        this.app.get('/api/applications', async (req, res) => {
            try {
                const applications = await this.db.getAllApplications();
                res.json(applications);
            } catch (error) {
                console.error('Ошибка при получении заявок:', error);
                res.status(500).json({ error: 'Ошибка сервера' });
            }
        });

        // API для получения конкретной заявки
        this.app.get('/api/applications/:id', async (req, res) => {
            try {
                const application = await this.db.getApplicationById(req.params.id);
                if (!application) {
                    return res.status(404).json({ error: 'Заявка не найдена' });
                }
                res.json(application);
            } catch (error) {
                console.error('Ошибка при получении заявки:', error);
                res.status(500).json({ error: 'Ошибка сервера' });
            }
        });

        // API для обновления статуса заявки
        this.app.post('/api/applications/:id/status', async (req, res) => {
            try {
                const { status, adminNotes } = req.body;
                const applicationId = req.params.id;

                if (!['approved', 'rejected'].includes(status)) {
                    return res.status(400).json({ error: 'Неверный статус' });
                }

                await this.db.updateApplicationStatus(applicationId, status, adminNotes);
                
                // Обновляем статус в Google Sheets
                this.googleSheets.updateApplicationStatus(applicationId, status).catch(err => {
                    console.error('Ошибка при обновлении статуса в Google Sheets (не критично):', err.message);
                });
                
                res.json({ success: true });
            } catch (error) {
                console.error('Ошибка при обновлении статуса:', error);
                res.status(500).json({ error: 'Ошибка сервера' });
            }
        });

        // API для получения статистики
        this.app.get('/api/stats', async (req, res) => {
            try {
                const applications = await this.db.getAllApplications();
                const stats = {
                    total: applications.length,
                    pending: applications.filter(app => app.status === 'pending').length,
                    approved: applications.filter(app => app.status === 'approved').length,
                    rejected: applications.filter(app => app.status === 'rejected').length
                };
                res.json(stats);
            } catch (error) {
                console.error('Ошибка при получении статистики:', error);
                res.status(500).json({ error: 'Ошибка сервера' });
            }
        });
    }

    start(port = 3000) {
        this.app.listen(port, '0.0.0.0', (err) => {
            if (err) {
                console.error('❌ Ошибка при запуске админ панели:', err);
                process.exit(1);
            }
            console.log(`🌐 Админ панель запущена на http://0.0.0.0:${port}`);
        });
    }
}

module.exports = AdminPanel;
