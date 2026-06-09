import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const app = express();
const port = Number(process.env.PORT || 3334);
const dataDir = path.join(process.cwd(), 'server', 'data');
const dbPath = path.join(dataDir, 'barbearia.db');

fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);

const queueStatuses = ['WAITING', 'CALLING', 'IN_SERVICE', 'DONE', 'LEFT'];
const defaultServices = [
  { id: 'corte', name: 'Corte', duration: 35, price: 35, tag: 'fila' },
  { id: 'corte-barba', name: 'Corte + barba', duration: 60, price: 60, tag: 'combo' },
  { id: 'barba', name: 'Barba', duration: 30, price: 30, tag: 'navalha' },
  { id: 'design', name: 'Design', duration: 25, price: 25, tag: 'detalhe' },
  { id: 'sobrancelha', name: 'Sobrancelha', duration: 15, price: 15, tag: 'extra' },
  { id: 'pigmentacao', name: 'Pigmentacao', duration: 45, price: 50, tag: 'acabamento' },
];

app.use(cors());
app.use(express.json());

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizePhone(value) {
  return normalizeText(value).replace(/\D/g, '');
}

function createId(prefix) {
  const tail = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).slice(2, 5).toUpperCase();

  return `${prefix}-${tail}${random}`;
}

function getPeriodStarts(referenceDate = new Date()) {
  const day = new Date(referenceDate);
  day.setHours(0, 0, 0, 0);

  const week = new Date(day);
  const dayOfWeek = week.getDay();
  const distanceFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  week.setDate(week.getDate() - distanceFromMonday);

  const month = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);

  return {
    day: day.toISOString(),
    week: week.toISOString(),
    month: month.toISOString(),
  };
}

function initDatabase() {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      duration INTEGER NOT NULL,
      price REAL NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS queue_entries (
      id TEXT PRIMARY KEY,
      client_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      barber_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'WAITING',
      notes TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (service_id) REFERENCES services(id)
    );

    CREATE TABLE IF NOT EXISTS special_bookings (
      id TEXT PRIMARY KEY,
      client_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      service_id TEXT NOT NULL,
      special_date TEXT NOT NULL,
      preferred_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'WAITING',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (service_id) REFERENCES services(id)
    );
  `);

  const statement = db.prepare(`
    INSERT INTO services (id, name, duration, price, tag, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      duration = excluded.duration,
      price = excluded.price,
      tag = excluded.tag,
      updated_at = excluded.updated_at
  `);

  defaultServices.forEach((service) => {
    const timestamp = nowIso();
    statement.run(
      service.id,
      service.name,
      service.duration,
      service.price,
      service.tag,
      timestamp,
      timestamp,
    );
  });
}

function mapService(row) {
  return {
    id: row.service_id ?? row.id,
    name: row.service_name ?? row.name,
    duration: row.service_duration ?? row.duration,
    price: Number(row.service_price ?? row.price),
    tag: row.service_tag ?? row.tag,
  };
}

function mapQueueEntry(row) {
  return {
    id: row.id,
    clientName: row.client_name,
    phone: row.phone,
    barberId: row.barber_id,
    serviceId: row.service_id,
    status: row.status,
    notes: row.notes,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    service: mapService(row),
  };
}

function mapSpecialBooking(row) {
  return {
    id: row.id,
    clientName: row.client_name,
    phone: row.phone,
    serviceId: row.service_id,
    specialDate: row.special_date,
    preferredTime: row.preferred_time,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    service: mapService(row),
  };
}

function getQueueEntry(id) {
  const row = db
    .prepare(`
      SELECT
        q.*,
        s.id AS service_id,
        s.name AS service_name,
        s.duration AS service_duration,
        s.price AS service_price,
        s.tag AS service_tag
      FROM queue_entries q
      JOIN services s ON s.id = q.service_id
      WHERE q.id = ?
    `)
    .get(id);

  return row ? mapQueueEntry(row) : null;
}

function getRevenueSince(startDate) {
  const row = db
    .prepare(`
      SELECT COUNT(*) AS count, COALESCE(SUM(s.price), 0) AS total
      FROM queue_entries q
      JOIN services s ON s.id = q.service_id
      WHERE q.status = 'DONE' AND q.completed_at >= ?
    `)
    .get(startDate);
  const count = Number(row.count || 0);
  const total = Number(row.total || 0);

  return {
    total,
    count,
    averageTicket: count ? total / count : 0,
  };
}

function getAdminMetrics() {
  const { day, week, month } = getPeriodStarts();
  const activeQueue = db
    .prepare("SELECT COUNT(*) AS count FROM queue_entries WHERE status IN ('WAITING', 'CALLING')")
    .get();
  const inService = db
    .prepare("SELECT COUNT(*) AS count FROM queue_entries WHERE status = 'IN_SERVICE'")
    .get();

  return {
    today: getRevenueSince(day),
    week: getRevenueSince(week),
    month: getRevenueSince(month),
    activeQueue: Number(activeQueue.count || 0),
    inService: Number(inService.count || 0),
  };
}

app.get('/api/status', (_req, res) => {
  res.json({
    status: 'online',
    message: 'API da TDB Barbearia operando.',
  });
});

app.get('/api/services', (_req, res) => {
  const rows = db.prepare('SELECT * FROM services ORDER BY created_at ASC').all();
  res.json(rows.map(mapService));
});

app.get('/api/queue', (_req, res) => {
  const rows = db
    .prepare(`
      SELECT
        q.*,
        s.id AS service_id,
        s.name AS service_name,
        s.duration AS service_duration,
        s.price AS service_price,
        s.tag AS service_tag
      FROM queue_entries q
      JOIN services s ON s.id = q.service_id
      ORDER BY q.created_at ASC
    `)
    .all();

  res.json(rows.map(mapQueueEntry));
});

app.post('/api/queue', (req, res) => {
  const clientName = normalizeText(req.body.clientName);
  const phone = normalizePhone(req.body.phone);
  const serviceId = normalizeText(req.body.serviceId);
  const barberId = normalizeText(req.body.barberId) || 'qualquer';
  const notes = normalizeText(req.body.notes) || null;

  if (!clientName || !phone || !serviceId) {
    res.status(400).json({ message: 'Informe nome, telefone e servico.' });
    return;
  }

  const service = db.prepare('SELECT id FROM services WHERE id = ?').get(serviceId);

  if (!service) {
    res.status(404).json({ message: 'Servico nao encontrado.' });
    return;
  }

  const id = createId('TDB');
  const timestamp = nowIso();

  db.prepare(`
    INSERT INTO queue_entries
      (id, client_name, phone, barber_id, service_id, status, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'WAITING', ?, ?, ?)
  `).run(id, clientName, phone, barberId, serviceId, notes, timestamp, timestamp);

  res.status(201).json(getQueueEntry(id));
});

app.patch('/api/queue/:id/status', (req, res) => {
  const status = normalizeText(req.body.status);

  if (!queueStatuses.includes(status)) {
    res.status(400).json({ message: 'Status invalido.' });
    return;
  }

  const completedAt = ['DONE', 'LEFT'].includes(status) ? nowIso() : null;
  const timestamp = nowIso();
  const result = db
    .prepare(`
      UPDATE queue_entries
      SET status = ?, completed_at = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(status, completedAt, timestamp, req.params.id);

  if (!result.changes) {
    res.status(404).json({ message: 'Cliente da fila nao encontrado.' });
    return;
  }

  res.json(getQueueEntry(req.params.id));
});

app.get('/api/special-bookings', (_req, res) => {
  const rows = db
    .prepare(`
      SELECT
        b.*,
        s.id AS service_id,
        s.name AS service_name,
        s.duration AS service_duration,
        s.price AS service_price,
        s.tag AS service_tag
      FROM special_bookings b
      JOIN services s ON s.id = b.service_id
      ORDER BY b.created_at DESC
    `)
    .all();

  res.json(rows.map(mapSpecialBooking));
});

app.post('/api/special-bookings', (req, res) => {
  const clientName = normalizeText(req.body.clientName);
  const phone = normalizePhone(req.body.phone);
  const serviceId = normalizeText(req.body.serviceId);
  const specialDate = normalizeText(req.body.specialDate);
  const preferredTime = normalizeText(req.body.preferredTime);

  if (!clientName || !phone || !serviceId || !specialDate || !preferredTime) {
    res.status(400).json({ message: 'Preencha os dados da data especial.' });
    return;
  }

  const service = db.prepare('SELECT id FROM services WHERE id = ?').get(serviceId);

  if (!service) {
    res.status(404).json({ message: 'Servico nao encontrado.' });
    return;
  }

  const id = createId('ESP');
  const timestamp = nowIso();

  db.prepare(`
    INSERT INTO special_bookings
      (id, client_name, phone, service_id, special_date, preferred_time, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'WAITING', ?, ?)
  `).run(id, clientName, phone, serviceId, specialDate, preferredTime, timestamp, timestamp);

  const row = db
    .prepare(`
      SELECT
        b.*,
        s.id AS service_id,
        s.name AS service_name,
        s.duration AS service_duration,
        s.price AS service_price,
        s.tag AS service_tag
      FROM special_bookings b
      JOIN services s ON s.id = b.service_id
      WHERE b.id = ?
    `)
    .get(id);

  res.status(201).json(mapSpecialBooking(row));
});

app.get('/api/admin/metrics', (_req, res) => {
  res.json(getAdminMetrics());
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: 'Erro interno do servidor.' });
});

initDatabase();

app.listen(port, () => {
  console.log(`API TDB Barbearia em http://localhost:${port}`);
});
