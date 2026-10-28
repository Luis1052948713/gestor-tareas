/**
 * Lógica de la interfaz del Gestor de tareas: autenticación, vistas, filtros,
 * creación/edición de tareas, notificaciones y atajos de teclado.
 * Todo el estado vive en el objeto `estado` y la interfaz se redibuja con `render()`.
 */
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const estado = {
  usuario: null,
  tareas: [],
  vista: 'todas', // ver VISTAS
  categoria: '', // '' = sin filtrar por categoría
  busqueda: '',
  editando: null, // tarea abierta en el modal
  verCompletadas: false,
};

// ---------- Iconos (SVG fijos, nunca contienen datos del usuario) ----------

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONOS = {
  todas: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  hoy: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  proximas: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  vencidas: svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>'),
  buscar: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  salir: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  mas: svg('<path d="M12 5v14M5 12h14"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  editar: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  eliminar: svg('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'),
  reloj: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  flecha: svg('<path d="M9 6l6 6-6 6"/>'),
};

/**
 * Crea un icono SVG a partir del catálogo fijo ICONOS.
 * @param {string} nombre - Clave del icono (p. ej. "editar").
 * @returns {HTMLSpanElement}
 */
function icono(nombre) {
  const span = document.createElement('span');
  span.className = 'icono';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = ICONOS[nombre];
  return span;
}

// Rellena los iconos declarados en el HTML con data-icono
$$('[data-icono]').forEach((n) => {
  n.innerHTML = ICONOS[n.dataset.icono];
  n.setAttribute('aria-hidden', 'true');
});

// ---------- Utilidades ----------

/**
 * Crea un elemento DOM sin usar innerHTML con datos del usuario (protección contra XSS).
 * Las claves `on*` se registran como eventos; los textos se insertan como nodos de texto.
 * @param {string} tag - Etiqueta HTML.
 * @param {object} [props] - Atributos, `class` y manejadores `onclick`, `onchange`...
 * @param {...(Node|string|null)} hijos - Contenido; se ignoran `null`/`false`.
 * @returns {HTMLElement}
 * @example el('button', { class: 'btn', onclick: guardar }, 'Guardar')
 */
function el(tag, props = {}, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') nodo.className = v;
    else if (k.startsWith('on')) nodo.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) nodo.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos.flat()) {
    if (h !== null && h !== undefined && h !== false) nodo.append(h);
  }
  return nodo;
}

/**
 * Convierte una fecha guardada (medianoche UTC) a texto "AAAA-MM-DD".
 * @param {string|Date|null} fecha
 * @returns {string} Cadena vacía si no hay fecha.
 */
function fechaISO(fecha) {
  return fecha ? new Date(fecha).toISOString().slice(0, 10) : '';
}

/**
 * Fecha local en formato "AAAA-MM-DD".
 * @param {Date} d
 * @returns {string}
 */
function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Fecha de hoy más N días, en formato "AAAA-MM-DD".
 * @param {number} dias - 0 = hoy, 1 = mañana...
 * @returns {string}
 */
function sumarDias(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return isoLocal(d);
}

/**
 * Días que faltan para el vencimiento de una tarea.
 * @param {{fechaVencimiento: string|null}} tarea
 * @returns {number|null} Negativo si está vencida, 0 si vence hoy, `null` si no tiene fecha.
 */
function diasHasta(tarea) {
  const f = fechaISO(tarea.fechaVencimiento);
  if (!f) return null;
  const aUTC = (iso) => Date.UTC(...iso.split('-').map((n, i) => (i === 1 ? n - 1 : +n)));
  return Math.round((aUTC(f) - aUTC(isoLocal(new Date()))) / 86400000);
}

/**
 * Formatea una fecha como "jue, 12 nov".
 * @param {string|Date} fecha
 * @returns {string}
 */
function fechaCorta(fecha) {
  return new Date(fecha).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * Texto y estilo de la etiqueta de vencimiento ("Vence hoy", "Venció hace 2 días"...).
 * @param {object} tarea
 * @returns {{texto: string, clase: string}|null} `null` si la tarea no tiene fecha.
 */
function etiquetaFecha(tarea) {
  const d = diasHasta(tarea);
  if (d === null) return null;
  const corta = fechaCorta(tarea.fechaVencimiento);
  if (tarea.completada) return { texto: corta, clase: '' };
  if (d < 0) return { texto: d === -1 ? 'Venció ayer' : `Venció hace ${-d} días`, clase: 'vencida' };
  if (d === 0) return { texto: 'Vence hoy', clase: 'hoy' };
  if (d === 1) return { texto: 'Mañana', clase: 'pronto' };
  if (d < 7) return { texto: `En ${d} días · ${corta}`, clase: 'pronto' };
  return { texto: corta, clase: '' };
}

// Ignora mayúsculas y tildes al buscar
const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const COLORES = ['#4f46e5', '#0ea5e9', '#16a34a', '#d97706', '#db2777', '#7c3aed', '#0d9488', '#dc2626'];
/**
 * Color estable para una categoría (el mismo nombre siempre da el mismo color).
 * @param {string} nombre
 * @returns {string} Color hexadecimal de la paleta COLORES.
 */
function colorCategoria(nombre) {
  let h = 0;
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES[h % COLORES.length];
}

/**
 * Muestra (o limpia) el mensaje de error de un formulario.
 * @param {HTMLFormElement} form
 * @param {string} [mensaje]
 */
function mostrarError(form, mensaje) {
  form.querySelector('.error').textContent = mensaje || '';
}

// ---------- Notificaciones ----------

let temporizadorToast;
/**
 * Muestra una notificación temporal (5 s), opcionalmente con un botón como "Deshacer".
 * @param {string} mensaje - Texto a mostrar.
 * @param {{accion?: string, alPulsar?: Function, error?: boolean}} [opciones]
 * @example toast('Tarea eliminada', { accion: 'Deshacer', alPulsar: restaurar })
 */
function toast(mensaje, { accion, alPulsar, error } = {}) {
  const t = $('#toast');
  clearTimeout(temporizadorToast);
  t.replaceChildren(...[
    el('span', {}, mensaje),
    accion ? el('button', { type: 'button', onclick: () => { ocultarToast(); alPulsar(); } }, accion) : null,
  ].filter(Boolean));
  t.classList.toggle('error', Boolean(error));
  t.classList.add('visible');
  temporizadorToast = setTimeout(ocultarToast, 5000);
}

/**
 * Oculta la notificación visible.
 */
function ocultarToast() {
  $('#toast').classList.remove('visible');
}

/**
 * Maneja un error de la API: si la sesión expiró (401) vuelve al login; si no, muestra el mensaje.
 * @param {Error & {status?: number}} err
 */
function manejarErrorApi(err) {
  if (err.status === 401) {
    cerrarSesion();
    toast('Tu sesión expiró. Vuelve a iniciar sesión.', { error: true });
  } else {
    toast(err.message || 'Algo salió mal', { error: true });
  }
}

// ---------- Autenticación ----------

/**
 * Alterna entre la vista de acceso y la aplicación.
 * @param {'auth'|'app'} nombre
 */
function mostrarVista(nombre) {
  $('#vista-auth').hidden = nombre !== 'auth';
  $('#vista-app').hidden = nombre !== 'app';
}

/**
 * Muestra el formulario de inicio de sesión o el de registro.
 * @param {'login'|'registro'} cual
 */
function mostrarFormulario(cual) {
  $$('.pestana').forEach((b) => {
    const activa = b.dataset.form === cual;
    b.classList.toggle('activa', activa);
    b.setAttribute('aria-selected', activa);
  });
  $('#form-login').hidden = cual !== 'login';
  $('#form-registro').hidden = cual !== 'registro';
  $(`#form-${cual} input`).focus();
}

$$('.pestana').forEach((b) => b.addEventListener('click', () => mostrarFormulario(b.dataset.form)));
$$('[data-ir]').forEach((b) => b.addEventListener('click', () => mostrarFormulario(b.dataset.ir)));

$$('.ver-pass').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = btn.previousElementSibling;
    const mostrar = input.type === 'password';
    input.type = mostrar ? 'text' : 'password';
    btn.textContent = mostrar ? 'Ocultar' : 'Ver';
    btn.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
});

/**
 * Envía un formulario de acceso (login o registro) y, si funciona, entra a la app.
 * @param {SubmitEvent} evento
 * @param {Function} accion - `API.login` o `API.registro`.
 * @returns {Promise<void>}
 */
async function manejarAuth(evento, accion) {
  evento.preventDefault();
  const form = evento.target;
  mostrarError(form, '');
  const datos = Object.fromEntries(new FormData(form));
  if (!datos.email || !datos.password || ('nombre' in datos && !datos.nombre.trim())) {
    mostrarError(form, 'Completa todos los campos');
    return;
  }
  const boton = form.querySelector('button[type=submit]');
  boton.disabled = true;
  try {
    const { token, usuario } = await accion(datos);
    API.setToken(token);
    form.reset();
    await entrar(usuario);
  } catch (err) {
    mostrarError(form, err.message);
  } finally {
    boton.disabled = false;
  }
}

$('#form-login').addEventListener('submit', (e) => manejarAuth(e, API.login));
$('#form-registro').addEventListener('submit', (e) => manejarAuth(e, API.registro));

/**
 * Borra el token y vuelve a la pantalla de acceso.
 */
function cerrarSesion() {
  API.setToken(null);
  estado.usuario = null;
  estado.tareas = [];
  mostrarVista('auth');
}

$('#btn-salir').addEventListener('click', cerrarSesion);

/**
 * Prepara la interfaz para el usuario que inició sesión y carga sus tareas.
 * @param {{nombre: string}} usuario
 * @returns {Promise<void>}
 */
async function entrar(usuario) {
  Object.assign(estado, { usuario, vista: 'todas', categoria: '', busqueda: '' });
  $('#buscar').value = '';
  $('#nombre-usuario').textContent = usuario.nombre;
  $('#avatar').textContent = usuario.nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  mostrarVista('app');
  await cargar();
}

// ---------- Datos ----------

/**
 * Descarga todas las tareas del usuario y redibuja la interfaz.
 * @returns {Promise<void>}
 */
async function cargar() {
  try {
    estado.tareas = await API.listarTareas();
    render();
  } catch (err) {
    manejarErrorApi(err);
  }
}

/**
 * Calcula las categorías a partir de las tareas cargadas.
 * @returns {{nombre: string, pendientes: number, total: number}[]} Ordenadas alfabéticamente.
 */
function categorias() {
  const mapa = new Map();
  for (const t of estado.tareas) {
    const c = mapa.get(t.categoria) || { nombre: t.categoria, pendientes: 0, total: 0 };
    c.total++;
    if (!t.completada) c.pendientes++;
    mapa.set(t.categoria, c);
  }
  return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

const VISTAS = {
  todas: { nombre: 'Todas', titulo: 'Todas las tareas', filtro: () => true },
  hoy: { nombre: 'Hoy', titulo: 'Para hoy', filtro: (t) => diasHasta(t) === 0 },
  proximas: {
    nombre: 'Próximos 7 días',
    titulo: 'Próximos 7 días',
    filtro: (t) => { const d = diasHasta(t); return d !== null && d >= 0 && d <= 7; },
  },
  vencidas: { nombre: 'Vencidas', titulo: 'Vencidas', filtro: (t) => !t.completada && diasHasta(t) < 0 },
};

/**
 * Tareas que se deben mostrar según la vista, la categoría y la búsqueda actuales.
 * @returns {object[]}
 */
function tareasVisibles() {
  const q = normalizar(estado.busqueda);
  return estado.tareas.filter((t) =>
    VISTAS[estado.vista].filtro(t) &&
    (!estado.categoria || t.categoria === estado.categoria) &&
    (!q || normalizar(`${t.titulo} ${t.descripcion} ${t.categoria}`).includes(q))
  );
}

/**
 * Comparador: primero las que vencen antes; sin fecha al final; luego las más nuevas.
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function ordenarPendientes(a, b) {
  const da = diasHasta(a), db = diasHasta(b);
  if (da !== db) return (da ?? Infinity) - (db ?? Infinity);
  return new Date(b.createdAt) - new Date(a.createdAt);
}

// ---------- Render ----------

/**
 * Redibuja toda la interfaz a partir de `estado`.
 */
function render() {
  renderLateral();
  renderPrincipal();
}

/**
 * Crea un elemento del menú lateral (vista o categoría).
 * @param {object} opciones
 * @returns {HTMLLIElement}
 */
function itemMenu({ etiqueta, activo, contador, alerta, onclick, prefijo }) {
  return el('li', {},
    el('button', { type: 'button', class: `item-menu${activo ? ' activo' : ''}`, 'aria-current': activo ? 'page' : null, onclick },
      prefijo,
      el('span', { class: 'etiqueta' }, etiqueta),
      contador ? el('span', { class: `contador${alerta ? ' alerta' : ''}` }, String(contador)) : null));
}

/**
 * Dibuja el menú lateral con vistas, categorías y contadores de pendientes.
 */
function renderLateral() {
  const pendientes = estado.tareas.filter((t) => !t.completada);

  $('#lista-vistas').replaceChildren(...Object.entries(VISTAS).map(([clave, v]) =>
    itemMenu({
      etiqueta: v.nombre,
      prefijo: icono(clave),
      activo: estado.vista === clave && !estado.categoria,
      contador: pendientes.filter(v.filtro).length,
      alerta: clave === 'vencidas',
      onclick: () => { estado.vista = clave; estado.categoria = ''; render(); },
    })
  ));

  const cats = categorias();
  if (estado.categoria && !cats.some((c) => c.nombre === estado.categoria)) estado.categoria = '';

  $('#lista-categorias').replaceChildren(
    ...cats.map((c) => itemMenu({
      etiqueta: c.nombre,
      prefijo: el('span', { class: 'punto-cat', style: `--cat:${colorCategoria(c.nombre)}` }),
      activo: estado.categoria === c.nombre,
      contador: c.pendientes,
      onclick: () => { estado.categoria = c.nombre; estado.vista = 'todas'; render(); },
    })),
    ...(cats.length ? [] : [el('li', { class: 'sin-categorias' }, 'Las categorías aparecen al crear tareas.')])
  );
}

/**
 * Dibuja el encabezado, el progreso y la lista de tareas (agrupadas por categoría en "Todas").
 */
function renderPrincipal() {
  const visibles = tareasVisibles();
  const pendientes = visibles.filter((t) => !t.completada).sort(ordenarPendientes);
  const completadas = visibles.filter((t) => t.completada).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  // Encabezado y progreso
  $('#titulo-vista').textContent = estado.categoria || VISTAS[estado.vista].titulo;
  const total = visibles.length;
  $('#resumen').textContent = estado.busqueda
    ? `${total} resultado${total === 1 ? '' : 's'} para "${estado.busqueda}"`
    : total
      ? `${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'} · ${completadas.length} completada${completadas.length === 1 ? '' : 's'}`
      : '';
  // En "Vencidas" nunca hay completadas, así que el progreso no aporta
  $('#progreso').hidden = !total || estado.vista === 'vencidas';
  const pct = total ? Math.round((completadas.length / total) * 100) : 0;
  $('#barra-progreso').style.width = `${pct}%`;
  $('#porcentaje').textContent = `${pct}%`;

  // Dónde se agregará la tarea rápida
  const destino = $('#destino-rapido');
  destino.replaceChildren(...[
    estado.categoria ? el('span', { class: 'chip-cat', style: `--cat:${colorCategoria(estado.categoria)}` }, estado.categoria) : null,
    estado.vista === 'hoy' ? el('span', { class: 'chip-fecha hoy' }, 'Hoy') : null,
  ].filter(Boolean));

  const contenedor = $('#lista-tareas');

  if (!total) {
    contenedor.replaceChildren(estadoVacio());
    return;
  }

  const bloques = [];

  if (pendientes.length) {
    // Agrupar por categoría solo en "Todas" sin categoría elegida
    if (estado.vista === 'todas' && !estado.categoria && !estado.busqueda) {
      const grupos = new Map();
      for (const t of pendientes) {
        if (!grupos.has(t.categoria)) grupos.set(t.categoria, []);
        grupos.get(t.categoria).push(t);
      }
      [...grupos.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'es'))
        .forEach(([cat, lista]) => bloques.push(
          el('section', { class: 'grupo' },
            el('h3', {},
              el('span', { class: 'punto-cat', style: `--cat:${colorCategoria(cat)}` }),
              cat,
              el('span', { class: 'cuenta' }, String(lista.length))),
            el('ul', { class: 'tareas' }, lista.map((t) => itemTarea(t, false))))
        ));
    } else {
      bloques.push(el('ul', { class: 'tareas' }, pendientes.map((t) => itemTarea(t, !estado.categoria))));
    }
  } else {
    bloques.push(el('div', { class: 'celebracion' },
      el('span', { class: 'emoji' }, '🎉'),
      el('p', {}, el('strong', {}, '¡Todo listo por aquí!'), ' No tienes tareas pendientes.')));
  }

  if (completadas.length) {
    const detalles = el('details', { class: 'completadas', open: estado.verCompletadas },
      el('summary', {}, icono('flecha'), `Completadas (${completadas.length})`),
      el('ul', { class: 'tareas' }, completadas.map((t) => itemTarea(t, !estado.categoria))));
    detalles.addEventListener('toggle', () => { estado.verCompletadas = detalles.open; });
    bloques.push(detalles);
  }

  contenedor.replaceChildren(...bloques);
}

/**
 * Mensaje para cuando no hay tareas que mostrar, adaptado a la vista o búsqueda.
 * @returns {HTMLDivElement}
 */
function estadoVacio() {
  let titulo = 'Aún no tienes tareas';
  let texto = 'Escribe arriba lo que tienes que hacer y presiona Enter. ¡Así de fácil!';
  if (estado.busqueda) {
    titulo = 'Sin resultados';
    texto = 'Prueba con otras palabras o borra la búsqueda.';
  } else if (estado.vista === 'hoy') {
    titulo = 'Nada vence hoy';
    texto = 'Disfruta el día, o agrega algo para hoy desde arriba.';
  } else if (estado.vista === 'proximas') {
    titulo = 'Semana despejada';
    texto = 'No tienes tareas con fecha en los próximos 7 días.';
  } else if (estado.vista === 'vencidas') {
    titulo = '¡Al día!';
    texto = 'No tienes tareas vencidas.';
  }
  return el('div', { class: 'vacio' },
    el('div', { class: 'vacio-icono' }, icono(estado.busqueda ? 'buscar' : 'check')),
    el('h3', {}, titulo),
    el('p', {}, texto));
}

/**
 * Crea la tarjeta de una tarea con su casilla, datos y botones.
 * @param {object} t - Tarea.
 * @param {boolean} mostrarCategoria - Si se muestra la etiqueta de categoría.
 * @returns {HTMLLIElement}
 */
function itemTarea(t, mostrarCategoria) {
  const fecha = etiquetaFecha(t);
  return el('li', { class: `tarea${t.completada ? ' completada' : ''}` },
    el('button', {
      type: 'button',
      class: 'check',
      title: t.completada ? 'Marcar como pendiente' : 'Marcar como completada',
      'aria-label': `${t.completada ? 'Marcar como pendiente' : 'Marcar como completada'}: ${t.titulo}`,
      'aria-pressed': String(t.completada),
      onclick: () => alternarCompletada(t),
    }, icono('check')),
    el('button', { type: 'button', class: 'cuerpo', title: 'Abrir para editar', onclick: () => abrirModal(t) },
      el('span', { class: 'titulo' }, t.titulo),
      t.descripcion ? el('span', { class: 'descripcion' }, t.descripcion) : null,
      (fecha || mostrarCategoria) ? el('span', { class: 'meta' },
        mostrarCategoria ? el('span', { class: 'chip-cat', style: `--cat:${colorCategoria(t.categoria)}` }, t.categoria) : null,
        fecha ? el('span', { class: `chip-fecha ${fecha.clase}` }, icono('reloj'), fecha.texto) : null) : null),
    el('div', { class: 'acciones-tarea' },
      el('button', { type: 'button', class: 'btn icono-btn', title: 'Editar', 'aria-label': `Editar ${t.titulo}`, onclick: () => abrirModal(t) }, icono('editar')),
      el('button', { type: 'button', class: 'btn icono-btn peligro', title: 'Eliminar', 'aria-label': `Eliminar ${t.titulo}`, onclick: () => eliminarTarea(t) }, icono('eliminar')))
  );
}

// ---------- Acciones sobre tareas ----------

/**
 * Marca una tarea como completada o pendiente. Actualiza la interfaz al instante
 * (actualización optimista) y revierte el cambio si el servidor falla.
 * @param {object} t - Tarea.
 * @param {{silencioso?: boolean}} [opciones] - `silencioso` evita mostrar el aviso con "Deshacer".
 * @returns {Promise<void>}
 */
async function alternarCompletada(t, { silencioso = false } = {}) {
  const nuevo = !t.completada;
  t.completada = nuevo; // actualización optimista
  render();
  try {
    Object.assign(t, await API.completarTarea(t._id, nuevo));
    render();
    if (nuevo && !silencioso) {
      toast('¡Tarea completada!', { accion: 'Deshacer', alPulsar: () => alternarCompletada(t, { silencioso: true }) });
    }
  } catch (err) {
    t.completada = !nuevo;
    render();
    manejarErrorApi(err);
  }
}

/**
 * Elimina una tarea y ofrece "Deshacer" (la vuelve a crear con los mismos datos).
 * @param {object} t - Tarea.
 * @returns {Promise<void>}
 */
async function eliminarTarea(t) {
  const indice = estado.tareas.indexOf(t);
  estado.tareas.splice(indice, 1);
  render();
  try {
    await API.eliminarTarea(t._id);
    toast(`Se eliminó "${t.titulo}"`, {
      accion: 'Deshacer',
      alPulsar: async () => {
        try {
          const { titulo, descripcion, categoria, fechaVencimiento, completada } = t;
          estado.tareas.push(await API.crearTarea({ titulo, descripcion, categoria, fechaVencimiento, completada }));
          render();
        } catch (err) {
          manejarErrorApi(err);
        }
      },
    });
  } catch (err) {
    estado.tareas.splice(indice, 0, t);
    render();
    manejarErrorApi(err);
  }
}

// Agregar rápido desde la barra superior
const inputRapido = $('#input-rapido');

$('#form-rapido').addEventListener('submit', async (e) => {
  e.preventDefault();
  const titulo = inputRapido.value.trim();
  if (!titulo) {
    inputRapido.focus();
    return;
  }
  try {
    const tarea = await API.crearTarea({
      titulo,
      categoria: estado.categoria || 'General',
      fechaVencimiento: estado.vista === 'hoy' ? sumarDias(0) : '',
    });
    estado.tareas.push(tarea);
    inputRapido.value = '';
    // Si la vista actual no la mostraría (p. ej. "Vencidas"), ir a donde sí se ve
    if (!tareasVisibles().includes(tarea)) {
      Object.assign(estado, { vista: 'todas', busqueda: '' });
      $('#buscar').value = '';
    }
    render();
  } catch (err) {
    manejarErrorApi(err);
  }
});

$('#btn-detalles').addEventListener('click', () => abrirModal(null, inputRapido.value.trim()));

// Búsqueda
$('#buscar').addEventListener('input', (e) => {
  estado.busqueda = e.target.value.trim();
  renderPrincipal();
});

// ---------- Modal crear / editar ----------

const modal = $('#modal-tarea');
const formTarea = $('#form-tarea');

/**
 * Resalta el botón rápido de fecha que coincide con la fecha elegida.
 */
function marcarChipFecha() {
  const valor = formTarea.fechaVencimiento.value;
  $$('#chips-fecha .chip').forEach((c) => {
    const objetivo = c.dataset.dias === '' ? '' : sumarDias(Number(c.dataset.dias));
    c.classList.toggle('activo', objetivo === valor);
  });
}

/**
 * Resalta el botón de categoría que coincide con la escrita.
 */
function marcarChipCategoria() {
  const valor = formTarea.categoria.value.trim() || 'General';
  $$('#chips-categorias .chip').forEach((c) => c.classList.toggle('activo', c.dataset.valor === valor));
}

/**
 * Abre el formulario para crear (sin `tarea`) o editar una tarea.
 * @param {object|null} [tarea] - Tarea a editar.
 * @param {string} [tituloInicial] - Título precargado al crear desde "Más detalles".
 */
function abrirModal(tarea = null, tituloInicial = '') {
  estado.editando = tarea;
  formTarea.reset();
  mostrarError(formTarea, '');
  $('#titulo-modal').textContent = tarea ? 'Editar tarea' : 'Nueva tarea';
  $('#btn-eliminar-modal').hidden = !tarea;

  formTarea.titulo.value = tarea ? tarea.titulo : tituloInicial;
  formTarea.descripcion.value = tarea?.descripcion || '';
  formTarea.categoria.value = tarea ? tarea.categoria : (estado.categoria || '');
  formTarea.fechaVencimiento.value = tarea ? fechaISO(tarea.fechaVencimiento) : (estado.vista === 'hoy' ? sumarDias(0) : '');

  // Sugerencias de categoría: las existentes + algunas comunes
  const nombres = new Set([...categorias().map((c) => c.nombre), 'General', 'Trabajo', 'Estudio', 'Personal']);
  $('#chips-categorias').replaceChildren(...[...nombres].map((n) =>
    el('button', {
      type: 'button',
      class: 'chip',
      'data-valor': n,
      style: `--cat:${colorCategoria(n)}`,
      onclick: () => { formTarea.categoria.value = n; marcarChipCategoria(); },
    }, el('span', { class: 'punto-cat' }), n)
  ));

  marcarChipCategoria();
  marcarChipFecha();
  modal.showModal();
  formTarea.titulo.focus();
}

$$('#chips-fecha .chip').forEach((c) => c.addEventListener('click', () => {
  formTarea.fechaVencimiento.value = c.dataset.dias === '' ? '' : sumarDias(Number(c.dataset.dias));
  marcarChipFecha();
}));
formTarea.fechaVencimiento.addEventListener('input', marcarChipFecha);
formTarea.categoria.addEventListener('input', marcarChipCategoria);

$$('[data-cerrar]').forEach((b) => b.addEventListener('click', () => modal.close()));
// Cerrar al hacer clic fuera del contenido
modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

$('#btn-eliminar-modal').addEventListener('click', () => {
  const t = estado.editando;
  modal.close();
  if (t) eliminarTarea(t);
});

formTarea.addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(formTarea));
  if (!datos.titulo.trim()) {
    mostrarError(formTarea, 'Escribe un título para la tarea');
    formTarea.titulo.focus();
    return;
  }
  const boton = formTarea.querySelector('button[type=submit]');
  boton.disabled = true;
  try {
    if (estado.editando) {
      Object.assign(estado.editando, await API.editarTarea(estado.editando._id, datos));
      toast('Cambios guardados');
    } else {
      estado.tareas.push(await API.crearTarea(datos));
      inputRapido.value = '';
      toast('Tarea creada');
    }
    modal.close();
    render();
  } catch (err) {
    if (err.status === 401) manejarErrorApi(err);
    else mostrarError(formTarea, err.message);
  } finally {
    boton.disabled = false;
  }
});

// ---------- Atajos de teclado ----------

document.addEventListener('keydown', (e) => {
  if ($('#vista-app').hidden || modal.open) return;
  const escribiendo = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if (e.key === 'Escape' && escribiendo) {
    document.activeElement.blur();
    return;
  }
  if (escribiendo || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === '/') {
    e.preventDefault();
    $('#buscar').focus();
  } else if (e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    inputRapido.focus();
  }
});

// ---------- Inicio ----------

(async function iniciar() {
  if (!API.getToken()) return mostrarVista('auth');
  try {
    const { usuario } = await API.yo();
    await entrar(usuario);
  } catch {
    API.setToken(null);
    mostrarVista('auth');
  }
})();
