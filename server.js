const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data', 'patients.json');

// Мидлвэрлер
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Маалыматтарды окуу
async function readData() {
    try {
        // data папкасын текшерүү
        const dir = path.dirname(DATA_FILE);
        await fs.mkdir(dir, { recursive: true });
        
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Эгер файл жок болсо, бош маалымат түзүү
        const emptyData = { patients: [] };
        await fs.writeFile(DATA_FILE, JSON.stringify(emptyData, null, 2));
        return emptyData;
    }
}

// Маалыматтарды сактоо
async function writeData(data) {
    const dir = path.dirname(DATA_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// ==================== API ЭНДПОИНТТЕР ====================

// Бардык пациенттерди алуу
app.get('/api/patients', async (req, res) => {
    try {
        const data = await readData();
        res.json(data);
    } catch (error) {
        console.error('Окууда ката:', error);
        res.status(500).json({ error: 'Маалыматтарды окууда ката' });
    }
});

// Пациенттерди сактоо
app.post('/api/patients', async (req, res) => {
    try {
        const data = req.body;
        await writeData(data);
        res.json({ success: true, message: 'Сакталды' });
    } catch (error) {
        console.error('Сактоодо ката:', error);
        res.status(500).json({ error: 'Маалыматтарды сактоодо ката' });
    }
});

// Бир пациентти алуу (ИНН боюнча)
app.get('/api/patients/:inn', async (req, res) => {
    try {
        const data = await readData();
        const patient = data.patients.find(p => p.inn === req.params.inn);
        if (patient) {
            res.json(patient);
        } else {
            res.status(404).json({ error: 'Пациент табылган жок' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Ката' });
    }
});

// ==================== СЕРВЕРДИ ИШКЕ КИРГИЗҮҮ ====================

app.listen(PORT, () => {
    console.log(`🚀 Сервер иштеп жатат: http://localhost:${PORT}`);
    console.log(`📁 Маалыматтар сакталат: ${DATA_FILE}`);
    console.log('Press Ctrl+C to stop');
});