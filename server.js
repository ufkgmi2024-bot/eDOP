const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'patients.json');
const BACKUP_DIR = path.join(__dirname, 'backup');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

async function ensureDataFile() {
    try {
        await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
        await fs.access(DATA_FILE);
    } catch {
        await fs.writeFile(DATA_FILE, JSON.stringify({ patients: [] }, null, 2));
    }
}

async function readData() {
    await ensureDataFile();
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
}

async function writeData(data) {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// ===== AI ANALYSIS =====

function analyzeBP(sys, dia) {
    if (sys >= 180 || dia >= 120) {
        return {
            status: "danger",
            message: "🚨 Өтө кооптуу басым! Дароо врачка кайрылыңыз."
        };
    }

    if (sys >= 140 || dia >= 90) {
        return {
            status: "warning",
            message: "⚠️ Басым жогорулап жатат."
        };
    }

    return {
        status: "normal",
        message: "✅ Басым нормада."
    };
}

// ===== STATS =====

app.get('/api/stats', async (req, res) => {
    try {
        const data = await readData();
        let warning = 0;
        let danger = 0;
        let normal = 0;

        data.patients.forEach(p => {
            if (p.lastBP) {
                if (p.lastBP.status === 'danger') danger++;
                else if (p.lastBP.status === 'warning') warning++;
                else normal++;
            }
        });

        res.json({
            success: true,
            stats: {
                total_patients: data.patients.length,
                warning_count: warning,
                critical_count: danger,
                normal_count: normal
            }
        });

    } catch (e) {
        res.status(500).json({ error: "Stats error" });
    }
});

// ===== SEARCH PATIENT =====

app.get('/api/patients/search/:inn', async (req, res) => {
    const data = await readData();
    const patient = data.patients.find(p => p.inn === req.params.inn);

    if (!patient) {
        return res.json({ success: false });
    }

    res.json({
        success: true,
        patient
    });
});

// ===== GENERAL SEARCH =====

app.get('/api/patients', async (req, res) => {
    const data = await readData();
    const search = req.query.search;

    if (!search) {
        return res.json(data);
    }

    const found = data.patients.filter(p =>
        p.fullName?.toLowerCase().includes(search.toLowerCase()) ||
        p.inn.includes(search)
    );

    res.json({
        success: true,
        patients: found,
        pagination: {
            total: found.length
        }
    });
});

// ===== NEW PATIENT =====

app.post('/api/patients', async (req, res) => {
    try {
        const { inn, fullName, birthDate, phone, address } = req.body;
        const data = await readData();

        const exists = data.patients.find(p => p.inn === inn);

        if (exists) {
            return res.json({
                success: false,
                error: "Мындай пациент бар"
            });
        }

        const patient = {
            inn,
            fullName,
            birthDate,
            phone,
            address,
            history: [],
            lastBP: null
        };

        data.patients.push(patient);
        await writeData(data);

        res.json({
            success: true
        });

    } catch (e) {
        res.status(500).json({
            error: "Сактоо катасы"
        });
    }
});

// ===== ADD BLOOD PRESSURE =====

app.post('/api/blood-pressure', async (req, res) => {
    try {
        const { inn, systolic, diastolic, pulse, notes } = req.body;
        const data = await readData();

        const patient = data.patients.find(p => p.inn === inn);

        if (!patient) {
            return res.json({
                success: false,
                error: "Пациент жок"
            });
        }

        const ai = analyzeBP(systolic, diastolic);

        const record = {
            check_date: new Date().toISOString(),
            systolic,
            diastolic,
            pulse,
            notes,
            ai_status: ai.status
        };

        if (!patient.history) patient.history = [];

        patient.history.push(record);

        patient.lastBP = {
            systolic,
            diastolic,
            pulse,
            date: new Date().toISOString(),
            status: ai.status
        };

        await writeData(data);

        res.json({
            success: true,
            ai
        });

    } catch (e) {
        res.status(500).json({
            error: "BP error"
        });
    }
});

// ===== BACKUP =====

app.post('/api/backup', async (req, res) => {
    try {
        await fs.mkdir(BACKUP_DIR, { recursive: true });

        const backupFile = path.join(
            BACKUP_DIR,
            `backup-${Date.now()}.json`
        );

        const data = await readData();

        await fs.writeFile(
            backupFile,
            JSON.stringify(data, null, 2)
        );

        const stat = await fs.stat(backupFile);

        res.json({
            success: true,
            size: stat.size
        });

    } catch (e) {
        res.status(500).json({
            error: "Backup error"
        });
    }
});

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});