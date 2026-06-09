import {
  BellRing,
  CalendarDays,
  CheckCircle2,
  Clock,
  Instagram,
  MessageCircle,
  Phone,
  Scissors,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import logoUrl from './assets/tdb-logo.svg';

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3334/api';
const customerQueueIdKey = 'tdb-current-queue-id';
const alertedQueueIdKey = 'tdb-alerted-queue-id';
const initialMetrics = {
  today: { total: 0, count: 0, averageTicket: 0 },
  week: { total: 0, count: 0, averageTicket: 0 },
  month: { total: 0, count: 0, averageTicket: 0 },
  activeQueue: 0,
  inService: 0,
};

let queueAudioContext;

const shop = {
  name: 'TDB Barbearia',
  subtitle: 'Turma do Bairro',
  phone: '+55 21 97639-6473',
  whatsapp: '5521976396473',
  instagram: 'https://www.instagram.com/turmadobairrobarbearia/',
  address: 'Rua Surui, 150',
};

const services = [
  { id: 'corte', name: 'Corte', duration: 35, price: 35, tag: 'fila' },
  { id: 'corte-barba', name: 'Corte + barba', duration: 60, price: 60, tag: 'combo' },
  { id: 'barba', name: 'Barba', duration: 30, price: 30, tag: 'navalha' },
  { id: 'design', name: 'Design', duration: 25, price: 25, tag: 'detalhe' },
  { id: 'sobrancelha', name: 'Sobrancelha', duration: 15, price: 15, tag: 'extra' },
  { id: 'pigmentacao', name: 'Pigmentacao', duration: 45, price: 50, tag: 'acabamento' },
];

const barbers = [
  { id: 'qualquer', name: 'Qualquer barbeiro', specialty: 'Primeiro livre', initials: 'TDB' },
  { id: 'kaio', name: 'Kaio', specialty: 'Fade e acabamento', initials: 'K' },
  { id: 'peruca', name: 'Peruca', specialty: 'Barba e design', initials: 'P' },
];

const queueStatus = [
  { id: 'WAITING', label: 'Aguardando' },
  { id: 'CALLING', label: 'Chamando' },
  { id: 'IN_SERVICE', label: 'Em atendimento' },
  { id: 'DONE', label: 'Finalizado' },
  { id: 'LEFT', label: 'Saiu da fila' },
];

const specialDates = [
  {
    id: 'natal',
    name: 'Natal',
    date: '24/12',
    note: 'Atendimento com horario marcado para organizar a vespera.',
  },
  {
    id: 'ano-novo',
    name: 'Ano Novo',
    date: '31/12',
    note: 'Agenda especial para fechar o ano no corte.',
  },
  {
    id: 'dias-das-maes',
    name: 'Datas comemorativas',
    date: 'Sob aviso',
    note: 'Quando tiver agenda especial, a barbearia avisa no Instagram.',
  },
];

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function formatQueueTime(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getTodayLabel() {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date());
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message ?? 'Erro ao comunicar com o servidor.');
  }

  return data;
}

function getService(id, serviceList = services) {
  return serviceList.find((service) => service.id === id) ?? serviceList[0] ?? services[0];
}

function getItemService(item, serviceList = services) {
  if (item.service) {
    return {
      ...item.service,
      price: Number(item.service.price),
    };
  }

  return getService(item.serviceId, serviceList);
}

function getBarber(id) {
  return barbers.find((barber) => barber.id === id) ?? barbers[0];
}

function getStatus(id) {
  return queueStatus.find((status) => status.id === id) ?? queueStatus[0];
}

function getActiveQueue(queue) {
  return queue
    .filter((item) => !['DONE', 'LEFT'].includes(item.status))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function getPosition(queue, itemId) {
  const activeQueue = getActiveQueue(queue);
  const index = activeQueue.findIndex((item) => item.id === itemId);

  return index >= 0 ? index + 1 : null;
}

function buildWhatsAppUrl(item, kind = 'fila', serviceList = services) {
  const service = getItemService(item, serviceList);
  const barber = getBarber(item.barberId);
  const status = getStatus(item.status);
  const lines =
    kind === 'especial'
      ? [
          `Salve, ${shop.name}!`,
          `Quero falar sobre o agendamento especial ${item.id}.`,
          `Cliente: ${item.clientName}`,
          `Data especial: ${item.specialDate}`,
          `Servico: ${service.name}`,
          `Telefone: ${item.phone}`,
        ]
      : [
          `Salve, ${shop.name}!`,
          `Quero falar sobre minha posicao na fila ${item.id}.`,
          `Cliente: ${item.clientName}`,
          `Servico: ${service.name}`,
          `Preferencia: ${barber.name}`,
          `Status: ${status.label}`,
        ];

  return `https://wa.me/${shop.whatsapp}?text=${encodeURIComponent(lines.join('\n'))}`;
}

function getLocalStorageValue(key) {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function setLocalStorageValue(key, value) {
  try {
    if (value) {
      window.localStorage.setItem(key, value);
      return;
    }

    window.localStorage.removeItem(key);
  } catch {
    // Ignore browsers with local storage disabled.
  }
}

function prepareQueueAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;

  if (!AudioContext) {
    return null;
  }

  if (!queueAudioContext) {
    queueAudioContext = new AudioContext();
  }

  if (queueAudioContext.state === 'suspended') {
    queueAudioContext.resume().catch(() => {});
  }

  return queueAudioContext;
}

function playQueueAlert() {
  const context = prepareQueueAudio();

  if (!context) {
    return;
  }

  const now = context.currentTime;
  const tones = [0, 0.3, 0.6];

  tones.forEach((offset) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(880, now + offset);
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + 0.24);
  });
}

function requestNotificationPermission() {
  if (!('Notification' in window) || Notification.permission !== 'default') {
    return;
  }

  Notification.requestPermission().catch(() => {});
}

function showBrowserNotification(item) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const notification = new Notification('TDB Barbearia chamou voce', {
    body: `${item.clientName}, chegou sua vez na fila.`,
    tag: item.id,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}

function App() {
  const [view, setView] = useState('fila');
  const [serviceOptions, setServiceOptions] = useState(services);
  const [queue, setQueue] = useState([]);
  const [specialBookings, setSpecialBookings] = useState([]);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [isLoading, setIsLoading] = useState(true);
  const [trackedQueueId, setTrackedQueueId] = useState(() =>
    getLocalStorageValue(customerQueueIdKey),
  );
  const [alertedQueueId, setAlertedQueueId] = useState(() =>
    getLocalStorageValue(alertedQueueIdKey),
  );
  const [toast, setToast] = useState(null);
  const [queueForm, setQueueForm] = useState({
    clientName: '',
    phone: '',
    serviceId: 'corte',
    barberId: 'qualquer',
    notes: '',
  });
  const [specialForm, setSpecialForm] = useState({
    clientName: '',
    phone: '',
    serviceId: 'corte',
    specialDate: 'Natal - 24/12',
    preferredTime: '09:00',
  });

  useEffect(() => {
    loadDashboardData();

    const interval = window.setInterval(() => {
      loadDashboardData({ silent: true });
    }, 5000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setToast(null), 3200);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  const activeQueue = useMemo(() => getActiveQueue(queue), [queue]);
  const currentClient = activeQueue.find((item) => item.status === 'IN_SERVICE') ?? null;
  const waitingQueue = activeQueue.filter((item) => item.status !== 'IN_SERVICE');
  const trackedQueueItem = queue.find((item) => item.id === trackedQueueId) ?? null;
  const calledCustomer =
    trackedQueueItem?.status === 'CALLING' ? trackedQueueItem : null;
  const doneToday = metrics.today.count;
  const estimatedWait = Math.max(waitingQueue.length - 1, 0) * 35;

  useEffect(() => {
    if (!trackedQueueItem) {
      return;
    }

    if (['DONE', 'LEFT'].includes(trackedQueueItem.status)) {
      setTrackedQueueId('');
      setAlertedQueueId('');
      setLocalStorageValue(customerQueueIdKey, '');
      setLocalStorageValue(alertedQueueIdKey, '');
      return;
    }

    if (trackedQueueItem.status !== 'CALLING' || alertedQueueId === trackedQueueItem.id) {
      return;
    }

    setAlertedQueueId(trackedQueueItem.id);
    setLocalStorageValue(alertedQueueIdKey, trackedQueueItem.id);
    playQueueAlert();
    window.navigator.vibrate?.([500, 150, 500, 150, 800]);
    showBrowserNotification(trackedQueueItem);
    setView('fila');
    showToast('success', `${trackedQueueItem.clientName}, chegou sua vez na TDB.`);
  }, [trackedQueueItem, alertedQueueId]);

  function showToast(type, message) {
    setToast({ type, message });
  }

  async function refreshMetrics() {
    const updatedMetrics = await apiRequest('/admin/metrics');
    setMetrics(updatedMetrics);
  }

  async function loadDashboardData(options = {}) {
    try {
      const [loadedServices, loadedQueue, loadedSpecialBookings, loadedMetrics] =
        await Promise.all([
          apiRequest('/services'),
          apiRequest('/queue'),
          apiRequest('/special-bookings'),
          apiRequest('/admin/metrics'),
        ]);

      setServiceOptions(loadedServices);
      setQueue(loadedQueue);
      setSpecialBookings(loadedSpecialBookings);
      setMetrics(loadedMetrics);
    } catch (error) {
      if (!options.silent) {
        showToast(
          'error',
          error instanceof Error
            ? error.message
            : 'Nao foi possivel carregar os dados do servidor.',
        );
      }
    } finally {
      setIsLoading(false);
    }
  }

  function updateQueueForm(field, value) {
    setQueueForm((current) => ({ ...current, [field]: value }));
  }

  function updateSpecialForm(field, value) {
    setSpecialForm((current) => ({ ...current, [field]: value }));
  }

  async function joinQueue(event) {
    event.preventDefault();

    if (!queueForm.clientName.trim() || !queueForm.phone.trim()) {
      showToast('error', 'Preencha nome e telefone para entrar na fila.');
      return;
    }

    try {
      const item = await apiRequest('/queue', {
        method: 'POST',
        body: JSON.stringify(queueForm),
      });

      setQueue((current) => [...current, item]);
      setTrackedQueueId(item.id);
      setAlertedQueueId('');
      setLocalStorageValue(customerQueueIdKey, item.id);
      setLocalStorageValue(alertedQueueIdKey, '');
      prepareQueueAudio();
      requestNotificationPermission();
      setQueueForm((current) => ({
        ...current,
        clientName: '',
        phone: '',
        notes: '',
      }));
      setView('fila');
      showToast('success', `Cliente entrou na fila na posicao ${activeQueue.length + 1}.`);
      await refreshMetrics();
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Erro ao entrar na fila.');
    }
  }

  async function addSpecialBooking(event) {
    event.preventDefault();

    if (!specialForm.clientName.trim() || !specialForm.phone.trim()) {
      showToast('error', 'Preencha nome e telefone para a data especial.');
      return;
    }

    try {
      const item = await apiRequest('/special-bookings', {
        method: 'POST',
        body: JSON.stringify(specialForm),
      });

      setSpecialBookings((current) => [item, ...current]);
      setSpecialForm((current) => ({
        ...current,
        clientName: '',
        phone: '',
      }));
      showToast('success', 'Pedido de agendamento especial salvo.');
    } catch (error) {
      showToast(
        'error',
        error instanceof Error ? error.message : 'Erro ao salvar data especial.',
      );
    }
  }

  async function updateStatus(id, status, options = {}) {
    try {
      const updatedItem = await apiRequest(`/queue/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });

      setQueue((current) =>
        current.map((item) => (item.id === id ? updatedItem : item)),
      );
      await refreshMetrics();

      if (!options.silent) {
        showToast('success', 'Fila atualizada.');
      }
    } catch (error) {
      if (!options.silent) {
        showToast('error', error instanceof Error ? error.message : 'Erro ao atualizar fila.');
      }
    }
  }

  async function callNextClient() {
    const next = activeQueue.find((item) => item.status === 'WAITING' || item.status === 'CALLING');

    if (!next) {
      showToast('error', 'Nao tem cliente aguardando na fila.');
      return;
    }

    const callingItems = queue.filter(
      (item) => item.status === 'CALLING' && item.id !== next.id,
    );

    await Promise.all(
      callingItems.map((item) => updateStatus(item.id, 'WAITING', { silent: true })),
    );
    await updateStatus(next.id, 'CALLING', { silent: true });
    showToast('success', `${next.clientName} esta sendo chamado.`);
  }

  async function startService(id) {
    const currentInService = queue.find(
      (item) => item.status === 'IN_SERVICE' && item.id !== id,
    );

    if (currentInService) {
      await updateStatus(currentInService.id, 'WAITING', { silent: true });
    }

    await updateStatus(id, 'IN_SERVICE', { silent: true });
    showToast('success', 'Atendimento iniciado.');
  }

  function stopTrackingCustomer() {
    setTrackedQueueId('');
    setAlertedQueueId('');
    setLocalStorageValue(customerQueueIdKey, '');
    setLocalStorageValue(alertedQueueIdKey, '');
  }

  function renderQueueCard(item, variant = 'cliente') {
    const service = getItemService(item, serviceOptions);
    const barber = getBarber(item.barberId);
    const status = getStatus(item.status);
    const position = getPosition(queue, item.id);

    return (
      <article className={`appointment-card queue-card status-${item.status.toLowerCase()}`} key={item.id}>
        <div className="appointment-main">
          <div className="time-block queue-position">
            <span>{position ? `#${position}` : 'OK'}</span>
            <strong>{formatQueueTime(item.createdAt)}</strong>
          </div>
          <div>
            <div className="appointment-title">
              <strong>{item.clientName}</strong>
              <span>{item.id}</span>
            </div>
            <div className="appointment-meta">
              <span>{service.name}</span>
              <span>{barber.name}</span>
              <span>{formatCurrency(service.price)}</span>
            </div>
            {item.notes ? <p className="appointment-note">{item.notes}</p> : null}
          </div>
        </div>

        <div className="appointment-actions">
          <span className="status-pill">{status.label}</span>
          <a className="icon-link" href={buildWhatsAppUrl(item, 'fila', serviceOptions)} target="_blank" rel="noreferrer" aria-label="Abrir WhatsApp">
            <MessageCircle size={18} />
          </a>
          {variant === 'admin' ? (
            <div className="status-actions">
              <button type="button" onClick={() => updateStatus(item.id, 'CALLING')}>
                <Phone size={16} />
                Chamar
              </button>
              <button type="button" onClick={() => startService(item.id)}>
                <Scissors size={16} />
                Atender
              </button>
              <button type="button" onClick={() => updateStatus(item.id, 'DONE')}>
                <CheckCircle2 size={16} />
                Finalizar
              </button>
              <button type="button" className="danger" onClick={() => updateStatus(item.id, 'LEFT')}>
                <XCircle size={16} />
                Saiu
              </button>
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  function renderSpecialBooking(item) {
    const service = getItemService(item, serviceOptions);

    return (
      <article className="appointment-card special-booking-card" key={item.id}>
        <div className="appointment-main">
          <div className="time-block">
            <CalendarDays size={18} />
            <strong>{item.preferredTime}</strong>
          </div>
          <div>
            <div className="appointment-title">
              <strong>{item.clientName}</strong>
              <span>{item.id}</span>
            </div>
            <div className="appointment-meta">
              <span>{item.specialDate}</span>
              <span>{service.name}</span>
              <span>{formatCurrency(service.price)}</span>
            </div>
          </div>
        </div>
        <div className="appointment-actions">
          <span className="status-pill">Especial</span>
          <a className="icon-link" href={buildWhatsAppUrl(item, 'especial', serviceOptions)} target="_blank" rel="noreferrer" aria-label="Abrir WhatsApp">
            <MessageCircle size={18} />
          </a>
        </div>
      </article>
    );
  }

  return (
    <main className="app-shell">
      <div className="street-layer" aria-hidden="true" />

      {toast ? (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          {toast.message}
        </div>
      ) : null}

      <header className="topbar">
        <button className="brand" type="button" onClick={() => setView('fila')} aria-label="Voltar para fila">
          <img src={logoUrl} alt="Logo TDB Barbearia" />
          <span>
            <strong>{shop.name}</strong>
            <small>{shop.subtitle}</small>
          </span>
        </button>

        <nav className="nav-tabs" aria-label="Navegacao principal">
          <button className={view === 'fila' ? 'active' : ''} type="button" onClick={() => setView('fila')}>
            <UsersRound size={18} />
            Fila
          </button>
          <button className={view === 'entrar' ? 'active' : ''} type="button" onClick={() => setView('entrar')}>
            <Scissors size={18} />
            Entrar na fila
          </button>
          <button className={view === 'especiais' ? 'active' : ''} type="button" onClick={() => setView('especiais')}>
            <CalendarDays size={18} />
            Datas especiais
          </button>
          <button className={view === 'admin' ? 'active' : ''} type="button" onClick={() => setView('admin')}>
            <ShieldCheck size={18} />
            Admin
          </button>
        </nav>

        <a className="social-top instagram-top" href={shop.instagram} target="_blank" rel="noreferrer">
          <Instagram size={18} />
          Instagram
        </a>

        <a className="social-top whatsapp-top" href={`https://wa.me/${shop.whatsapp}`} target="_blank" rel="noreferrer">
          <MessageCircle size={18} />
          WhatsApp
        </a>
      </header>

      <section className="hero-strip queue-hero">
        <div>
          <p className="kicker">Atendimento por ordem de chegada</p>
          <h1>Fila TDB</h1>
          <span>{shop.address}</span>
        </div>
        <div className="hero-contact">
          <Phone size={18} />
          <strong>{shop.phone}</strong>
        </div>
      </section>

      {calledCustomer ? (
        <section className="customer-alert">
          <div className="customer-alert-icon">
            <BellRing size={34} />
          </div>
          <div>
            <p className="kicker">Chegou sua vez</p>
            <h2>{calledCustomer.clientName}, a TDB esta te chamando.</h2>
            <span>Mostre esse aviso no balcao ou responda pelo WhatsApp.</span>
          </div>
          <div className="customer-alert-actions">
            <a
              className="primary-btn compact"
              href={buildWhatsAppUrl(calledCustomer, 'fila', serviceOptions)}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={17} />
              WhatsApp
            </a>
            <button className="alert-close-btn" type="button" onClick={stopTrackingCustomer}>
              Estou indo
            </button>
          </div>
        </section>
      ) : null}

      {view === 'fila' ? (
        <section className="content-grid queue-layout">
          <div className="surface day-surface">
            <div className="section-title">
              <div>
                <p className="kicker">{getTodayLabel()}</p>
                <h2>
                  <UsersRound size={24} />
                  Fila de atendimento
                </h2>
              </div>
              <button className="primary-btn compact" type="button" onClick={() => setView('entrar')}>
                <Scissors size={17} />
                Entrar na fila
              </button>
            </div>

            {currentClient ? (
              <div className="now-serving">
                <p className="kicker">Atendendo agora</p>
                {renderQueueCard(currentClient)}
              </div>
            ) : null}

            <div className="appointment-list">
              {waitingQueue.length ? (
                waitingQueue.map((item) => renderQueueCard(item))
              ) : (
                <div className="empty-state">
                  <Sparkles size={26} />
                  <strong>Fila livre</strong>
                  <span>Chegou, cadastrou, cortou.</span>
                </div>
              )}
            </div>
          </div>

          <aside className="queue-side">
            <div className="surface stats-row queue-stats">
              <div className="stat-box">
                <span>Na fila</span>
                <strong>{waitingQueue.length}</strong>
              </div>
              <div className="stat-box">
                <span>Atendendo</span>
                <strong>{currentClient ? 1 : 0}</strong>
              </div>
              <div className="stat-box">
                <span>Finalizados</span>
                <strong>{doneToday}</strong>
              </div>
              <div className="stat-box">
                <span>Espera media</span>
                <strong>{estimatedWait}m</strong>
              </div>
            </div>

            <div className="surface next-surface">
              <div className="section-title">
                <div>
                  <p className="kicker">Regra da casa</p>
                  <h2>
                    <Clock size={24} />
                    Sem horario fixo
                  </h2>
                </div>
              </div>
              <p className="info-copy">
                No dia a dia, a TDB atende por ordem de chegada. Agendamento fica reservado
                para datas comemorativas, como Natal e Ano Novo.
              </p>
            </div>
          </aside>
        </section>
      ) : null}

      {view === 'entrar' ? (
        <section className="booking-layout">
          <form className="surface booking-form" onSubmit={joinQueue}>
            <div className="section-title">
              <div>
                <p className="kicker">Cheguei na barbearia</p>
                <h2>
                  <Scissors size={24} />
                  Entrar na fila
                </h2>
              </div>
            </div>

            <div className="form-grid">
              <label>
                Cliente
                <input
                  type="text"
                  value={queueForm.clientName}
                  onChange={(event) => updateQueueForm('clientName', event.target.value)}
                  placeholder="Nome do cliente"
                />
              </label>
              <label>
                Telefone
                <input
                  type="tel"
                  value={queueForm.phone}
                  onChange={(event) => updateQueueForm('phone', event.target.value)}
                  placeholder="21999999999"
                />
              </label>
              <label>
                Observacao
                <input
                  type="text"
                  value={queueForm.notes}
                  onChange={(event) => updateQueueForm('notes', event.target.value)}
                  placeholder="Preferencia de corte"
                />
              </label>
              <label>
                Preferencia
                <select
                  value={queueForm.barberId}
                  onChange={(event) => updateQueueForm('barberId', event.target.value)}
                >
                  {barbers.map((barber) => (
                    <option key={barber.id} value={barber.id}>
                      {barber.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="choice-block">
              <h3>Servico</h3>
              <div className="service-grid">
                {serviceOptions.map((service) => (
                  <button
                    className={queueForm.serviceId === service.id ? 'selected' : ''}
                    key={service.id}
                    type="button"
                    onClick={() => updateQueueForm('serviceId', service.id)}
                  >
                    <span>{service.tag}</span>
                    <strong>{service.name}</strong>
                    <small>
                      {service.duration} min - {formatCurrency(service.price)}
                    </small>
                  </button>
                ))}
              </div>
            </div>

            <button className="primary-btn" type="submit">
              <CheckCircle2 size={18} />
              Colocar na fila
            </button>
          </form>

          <aside className="surface booking-summary queue-summary">
            <img src={logoUrl} alt="" />
            <p className="kicker">Sua posicao</p>
            <h2>#{activeQueue.length + 1}</h2>
            <dl>
              <div>
                <dt>Atendimento</dt>
                <dd>Ordem de chegada</dd>
              </div>
              <div>
                <dt>Fila agora</dt>
                <dd>{activeQueue.length} cliente(s)</dd>
              </div>
              <div>
                <dt>Espera estimada</dt>
                <dd>{estimatedWait} min</dd>
              </div>
            </dl>
          </aside>
        </section>
      ) : null}

      {view === 'especiais' ? (
        <section className="booking-layout">
          <div className="surface booking-form">
            <div className="section-title">
              <div>
                <p className="kicker">Natal, Ano Novo e eventos</p>
                <h2>
                  <CalendarDays size={24} />
                  Datas especiais
                </h2>
              </div>
            </div>

            <div className="special-date-grid">
              {specialDates.map((date) => (
                <article className="special-date-card" key={date.id}>
                  <span>{date.date}</span>
                  <strong>{date.name}</strong>
                  <p>{date.note}</p>
                </article>
              ))}
            </div>

            <form className="special-form" onSubmit={addSpecialBooking}>
              <div className="form-grid">
                <label>
                  Cliente
                  <input
                    type="text"
                    value={specialForm.clientName}
                    onChange={(event) => updateSpecialForm('clientName', event.target.value)}
                    placeholder="Nome do cliente"
                  />
                </label>
                <label>
                  Telefone
                  <input
                    type="tel"
                    value={specialForm.phone}
                    onChange={(event) => updateSpecialForm('phone', event.target.value)}
                    placeholder="21999999999"
                  />
                </label>
                <label>
                  Data especial
                  <select
                    value={specialForm.specialDate}
                    onChange={(event) => updateSpecialForm('specialDate', event.target.value)}
                  >
                    <option>Natal - 24/12</option>
                    <option>Ano Novo - 31/12</option>
                    <option>Outra data comemorativa</option>
                  </select>
                </label>
                <label>
                  Horario desejado
                  <input
                    type="time"
                    value={specialForm.preferredTime}
                    onChange={(event) => updateSpecialForm('preferredTime', event.target.value)}
                  />
                </label>
              </div>

              <div className="choice-block">
                <h3>Servico</h3>
                <div className="service-grid">
                  {serviceOptions.map((service) => (
                    <button
                      className={specialForm.serviceId === service.id ? 'selected' : ''}
                      key={service.id}
                      type="button"
                      onClick={() => updateSpecialForm('serviceId', service.id)}
                    >
                      <span>{service.tag}</span>
                      <strong>{service.name}</strong>
                      <small>{formatCurrency(service.price)}</small>
                    </button>
                  ))}
                </div>
              </div>

              <button className="primary-btn" type="submit">
                <CheckCircle2 size={18} />
                Solicitar horario especial
              </button>
            </form>
          </div>

          <aside className="surface day-surface">
            <div className="section-title">
              <div>
                <p className="kicker">Reservas especiais</p>
                <h2>
                  <UsersRound size={24} />
                  Lista
                </h2>
              </div>
            </div>
            <div className="appointment-list">
              {specialBookings.length ? (
                specialBookings.map((item) => renderSpecialBooking(item))
              ) : (
                <div className="empty-state">
                  <CalendarDays size={26} />
                  <strong>Nenhum pedido especial</strong>
                  <span>Quando abrir agenda, aparece aqui.</span>
                </div>
              )}
            </div>
          </aside>
        </section>
      ) : null}

      {view === 'admin' ? (
        <section className="admin-layout">
          <div className="surface admin-main">
            <div className="section-title">
              <div>
                <p className="kicker">Painel da fila</p>
                <h2>
                  <ShieldCheck size={24} />
                  Controle do balcao
                </h2>
              </div>
              <button className="primary-btn compact" type="button" onClick={callNextClient}>
                <Phone size={17} />
                Chamar proximo
              </button>
            </div>

            <div className="appointment-list">
              {queue.length ? (
                [...queue]
                  .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
                  .map((item) => renderQueueCard(item, 'admin'))
              ) : (
                <div className="empty-state">
                  <UsersRound size={26} />
                  <strong>Fila vazia</strong>
                </div>
              )}
            </div>
          </div>

          <aside className="admin-side">
            <div className="surface finance-dashboard">
              <div className="section-title">
                <div>
                  <p className="kicker">Lucro da barbearia</p>
                  <h2>
                    <ShieldCheck size={22} />
                    Financeiro
                  </h2>
                </div>
              </div>
              <div className="finance-grid">
                <div className="finance-card">
                  <span>Hoje</span>
                  <strong>{formatCurrency(metrics.today.total)}</strong>
                  <small>{metrics.today.count} corte(s) finalizado(s)</small>
                </div>
                <div className="finance-card">
                  <span>Semana</span>
                  <strong>{formatCurrency(metrics.week.total)}</strong>
                  <small>{metrics.week.count} corte(s) finalizado(s)</small>
                </div>
                <div className="finance-card">
                  <span>Mes</span>
                  <strong>{formatCurrency(metrics.month.total)}</strong>
                  <small>{metrics.month.count} corte(s) finalizado(s)</small>
                </div>
              </div>
            </div>

            <div className="surface">
              <div className="section-title">
                <div>
                  <p className="kicker">Resumo</p>
                  <h2>
                    <Clock size={22} />
                    Hoje
                  </h2>
                </div>
              </div>
              <div className="price-list">
                <div>
                  <span>Na fila</span>
                  <strong>{waitingQueue.length}</strong>
                </div>
                <div>
                  <span>Em atendimento</span>
                  <strong>{currentClient ? currentClient.clientName : 'Livre'}</strong>
                </div>
                <div>
                  <span>Finalizados</span>
                  <strong>{doneToday}</strong>
                </div>
              </div>
            </div>

            <div className="surface">
              <div className="section-title">
                <div>
                  <p className="kicker">Tabela</p>
                  <h2>
                    <Scissors size={22} />
                    Servicos
                  </h2>
                </div>
              </div>
              <div className="price-list">
                {serviceOptions.map((service) => (
                  <div key={service.id}>
                    <span>{service.name}</span>
                    <strong>{formatCurrency(service.price)}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface">
              <div className="section-title">
                <div>
                  <p className="kicker">Especial</p>
                  <h2>
                    <UserRound size={22} />
                    Pedidos
                  </h2>
                </div>
              </div>
              <div className="client-list">
                {specialBookings.slice(0, 5).map((item) => (
                  <div className="client-row" key={item.id}>
                    <span>
                      <strong>{item.clientName}</strong>
                      <small>{item.specialDate}</small>
                    </span>
                    <b>{item.preferredTime}</b>
                  </div>
                ))}
                {!specialBookings.length ? <p className="info-copy">Sem reservas especiais ainda.</p> : null}
              </div>
            </div>
          </aside>
        </section>
      ) : null}
    </main>
  );
}

export default App;
