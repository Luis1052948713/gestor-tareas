/**
 * Cliente de la API REST del servidor. Centraliza las peticiones `fetch`,
 * el envío del token de sesión y la conversión de errores HTTP en excepciones.
 * @namespace API
 */
const API = (() => {
  /** Clave de localStorage donde se guarda el token de sesión. */
  const CLAVE_TOKEN = 'gestor_token';

  /**
   * Lee el token de sesión guardado en el navegador.
   * @returns {string|null} El token o `null` si no hay sesión.
   */
  function getToken() {
    return localStorage.getItem(CLAVE_TOKEN);
  }

  /**
   * Guarda el token de sesión, o lo borra si se pasa `null` (cerrar sesión).
   * @param {string|null} token - Token JWT recibido al iniciar sesión.
   * @returns {void}
   */
  function setToken(token) {
    if (token) localStorage.setItem(CLAVE_TOKEN, token);
    else localStorage.removeItem(CLAVE_TOKEN);
  }

  /**
   * Realiza una petición a la API y devuelve los datos de la respuesta.
   * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} metodo - Método HTTP.
   * @param {string} ruta - Ruta relativa a `/api` (por ejemplo `/tareas`).
   * @param {object} [cuerpo] - Datos a enviar como JSON.
   * @returns {Promise<object|null>} Datos de la respuesta (`null` si es 204 sin contenido).
   * @throws {Error} Con `message` del servidor y `status` HTTP si la respuesta no es exitosa.
   * @example
   * const tareas = await peticion('GET', '/tareas');
   */
  async function peticion(metodo, ruta, cuerpo) {
    const opciones = { method: metodo, headers: {} };
    const token = getToken();
    if (token) opciones.headers.Authorization = `Bearer ${token}`;
    if (cuerpo !== undefined) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(cuerpo);
    }

    const res = await fetch(`/api${ruta}`, opciones);
    if (res.status === 204) return null;

    const datos = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(datos.error || `Error ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return datos;
  }

  return {
    getToken,
    setToken,
    /** Crea una cuenta. @param {{nombre: string, email: string, password: string}} datos */
    registro: (datos) => peticion('POST', '/auth/registro', datos),
    /** Inicia sesión. @param {{email: string, password: string}} datos */
    login: (datos) => peticion('POST', '/auth/login', datos),
    /** Devuelve el usuario de la sesión actual. */
    yo: () => peticion('GET', '/auth/yo'),
    /** Lista tareas. @param {{categoria?: string, estado?: 'pendientes'|'completadas'}} [params] */
    listarTareas: (params = {}) => {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
      return peticion('GET', `/tareas${qs ? `?${qs}` : ''}`);
    },
    /** Categorías con totales y pendientes. */
    categorias: () => peticion('GET', '/tareas/categorias'),
    /** Crea una tarea. @param {object} datos */
    crearTarea: (datos) => peticion('POST', '/tareas', datos),
    /** Edita una tarea. @param {string} id @param {object} datos */
    editarTarea: (id, datos) => peticion('PUT', `/tareas/${id}`, datos),
    /** Marca como completada o pendiente. @param {string} id @param {boolean} completada */
    completarTarea: (id, completada) => peticion('PATCH', `/tareas/${id}/completar`, { completada }),
    /** Elimina una tarea. @param {string} id */
    eliminarTarea: (id) => peticion('DELETE', `/tareas/${id}`),
  };
})();
