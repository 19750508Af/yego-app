import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "./safe-area";
import { api, setAdminToken, type ApiResponse } from "./api";

type Dashboard = ApiResponse<typeof api, "getDashboard">;
type ApplicationLookup = ApiResponse<typeof api, "getApplicationStatus">;
type AdminApplications = Extract<ApiResponse<typeof api, "getAdminApplications">, { authorized: true }>;
type Restaurant = Dashboard["restaurants"][number];
type Order = Dashboard["orders"][number];
type Claim = Dashboard["claims"][number];
type Status = Order["status"];
type Category = Restaurant["category"];

const STATUS: Record<Status, string> = { nuevo: "Recibido", preparando: "Preparando", en_camino: "En camino", entregado: "Entregado", cancelado: "Cancelado" };
const CATEGORIES: { value: Category | "todos"; label: string; glyph: string }[] = [
  { value: "todos", label: "Todos", glyph: "✦" }, { value: "pizza", label: "Pizza", glyph: "◒" },
  { value: "hamburguesas", label: "Hamburguesas", glyph: "☰" }, { value: "pollo", label: "Pollo", glyph: "♨" },
  { value: "comida_ecuatoriana", label: "Ecuatoriana", glyph: "●" }, { value: "mariscos", label: "Mariscos", glyph: "≈" },
  { value: "postres", label: "Postres", glyph: "♢" }, { value: "otro", label: "Otros", glyph: "+" },
];

function money(cents: number, currency = "USD") { try { return new Intl.NumberFormat("es-EC", { style: "currency", currency }).format(cents / 100); } catch { return `${(cents / 100).toFixed(2)} ${currency}`; } }
function dateTime(value: string) { return new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function readStorage(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* Storage can be unavailable in an embedded mobile webview. */ }
}
function readApplicationToken(key: string): string | null {
  const value = readStorage(key);
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
function Icon({ name }: { name: "search" | "heart" | "star" | "plus" | "shop" | "chevron" | "receipt" }) {
  const paths: Record<string, ReactNode> = {
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
    heart: <path d="M20 8c0 5-8 11-8 11S4 13 4 8a4 4 0 0 1 7-2 4 4 0 0 1 9 2Z"/>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>,
    plus: <path d="M12 5v14M5 12h14"/>, shop: <><path d="M4 10v10h16V10M3 10l2-6h14l2 6"/><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></>,
    chevron: <path d="m9 5 7 7-7 7"/>, receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6M9 12h6"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="sheet" role="dialog" aria-modal="true" aria-label={title}><div className="sheet-handle"/><div className="sheet-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label={`Cerrar ${title}`}>×</button></div>{children}</section></div>; }

type RouteMode = "auto" | "admin" | "customer";

function getRouteMode(): RouteMode {
  const hash = window.location.hash.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname.toLowerCase().replace(/\/+$/, "");
  if (hash === "#cliente" || hash === "#/cliente" || params.get("vista") === "cliente") return "customer";
  if (hash === "#admin" || hash === "#/admin" || hash === "#administracion" || hash === "#/administracion" || params.get("panel") === "administracion" || path.endsWith("/admin") || path.endsWith("/administracion")) return "admin";
  return "auto";
}

export function App() {
  const [routeMode, setRouteMode] = useState<RouteMode>(getRouteMode);
  const access = useQuery({ queryKey: ["admin-applications"], queryFn: () => api.getAdminApplications({}), retry: 1 });
  useEffect(() => {
    const syncRoute = () => setRouteMode(getRouteMode());
    window.addEventListener("hashchange", syncRoute);
    window.addEventListener("popstate", syncRoute);
    return () => {
      window.removeEventListener("hashchange", syncRoute);
      window.removeEventListener("popstate", syncRoute);
    };
  }, []);
  if (routeMode === "customer") return <CustomerApp />;
  if (routeMode === "admin") return <AdminPage />;
  if (access.isPending) return <div className="portal-loading"><span/><p>Abriendo Yego…</p></div>;
  return access.data?.authorized ? <AdminPage /> : <CustomerApp />;
}

function CustomerApp() {
  const qc = useQueryClient();
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: () => api.getDashboard({}) });
  const [screen, setScreen] = useState<"inicio" | "pedidos">("inicio");
  const [sheet, setSheet] = useState<"config" | "local" | "pedido" | "reseña" | "reclamo" | "repartidor" | null>(null);
  const [targetRestaurant, setTargetRestaurant] = useState<number | null>(null);
  const [targetOrder, setTargetOrder] = useState<number | null>(null);
  const [restaurantApplicationToken, setRestaurantApplicationToken] = useState<string | null>(() => readApplicationToken("yego-restaurant-application-token"));
  const [courierApplicationToken, setCourierApplicationToken] = useState<string | null>(() => readApplicationToken("yego-courier-application-token"));
  const application = useQuery({
    queryKey: ["application-status", restaurantApplicationToken, courierApplicationToken],
    queryFn: () => api.getApplicationStatus({ restaurant_token: restaurantApplicationToken, courier_token: courierApplicationToken }),
  });
  const [toast, setToast] = useState<string | null>(null);
  const refresh = async () => qc.invalidateQueries({ queryKey: ["dashboard"] });
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 3000); };
  const closeSuccess = async (message: string) => { await refresh(); setSheet(null); notify(message); };
  const restaurantM = useMutation({ mutationFn: api.createRestaurant, onSuccess: async (r) => { if (!r.ok) return notify(r.error); writeStorage("yego-restaurant-application-token", r.token); setRestaurantApplicationToken(r.token); await closeSuccess("Solicitud enviada · pendiente de aprobación"); } });
  const reviewM = useMutation({ mutationFn: api.createReview, onSuccess: async (r) => r.ok ? closeSuccess("Reseña publicada") : notify(r.error) });
  const orderM = useMutation({ mutationFn: api.createOrder, onSuccess: async (r) => { if (!r.ok) return notify(r.error); await closeSuccess(`Pedido #${r.id} creado`); setScreen("pedidos"); } });
  const claimM = useMutation({ mutationFn: api.createClaim, onSuccess: async (r) => r.ok ? closeSuccess("Reclamo enviado") : notify(r.error) });
  const courierM = useMutation({ mutationFn: api.createCourier, onSuccess: async (r) => { if (!r.ok) return notify(r.error); writeStorage("yego-courier-application-token", r.token); setCourierApplicationToken(r.token); await closeSuccess("Solicitud enviada · pendiente de aprobación"); } });
  const data = dashboard.data;

  if (dashboard.isPending) return <div className="loading"><span/><p>Preparando tu antojo…</p></div>;
  if (!data || dashboard.error) return <div className="loading"><p>No pudimos cargar los locales.</p><button className="primary-button" onClick={() => dashboard.refetch()}>Reintentar</button></div>;
  const openOrder = (restaurantId?: number) => { setTargetRestaurant(restaurantId ?? null); setSheet("pedido"); };

  return <div className="app-shell role-cliente"><SafeAreaTopScrim backgroundColor="var(--bg)" />
    <header className="consumer-head">
      <button className="location-button" type="button" onClick={() => notify("Escribe tu dirección al confirmar el pedido")} aria-label="Cambiar dirección de entrega"><span>Entregar en</span><strong>Tu ubicación⌄</strong></button>
      <button className="settings-button" type="button" onClick={() => setSheet("config")} aria-label="Abrir configuración">⚙</button>
    </header>

    {screen === "inicio" ? <ClientPortal data={data} onOrder={openOrder} onReview={(id) => { setTargetRestaurant(id); setSheet("reseña"); }} onRetry={() => dashboard.refetch()} /> : <CustomerOrders data={data} onClaim={(id) => { setTargetOrder(id); setSheet("reclamo"); }} onOrder={() => openOrder()} />}

    <nav className="bottom-nav" aria-label="Navegación principal">
      <button className={screen === "inicio" ? "active" : ""} type="button" onClick={() => setScreen("inicio")}><span aria-hidden="true">⌂</span>Inicio</button>
      <button className="order-fab" type="button" onClick={() => openOrder()} aria-label="Hacer un pedido"><Icon name="plus"/></button>
      <button className={screen === "pedidos" ? "active" : ""} type="button" onClick={() => setScreen("pedidos")}><Icon name="receipt"/>Mis pedidos</button>
    </nav>

    {sheet === "config" && <SettingsSheet restaurant={application.data?.restaurant ?? null} courier={application.data?.courier ?? null} onClose={() => setSheet(null)} onRestaurant={() => setSheet("local")} onCourier={() => setSheet("repartidor")} />}
    {sheet === "local" && <RestaurantForm pending={restaurantM.isPending} onClose={() => setSheet(null)} onSubmit={(v) => restaurantM.mutate(v)} />}
    {sheet === "pedido" && <OrderForm restaurants={data.restaurants} initial={targetRestaurant} pending={orderM.isPending} onClose={() => setSheet(null)} onSubmit={(v) => orderM.mutate(v)} />}
    {sheet === "reseña" && <ReviewForm restaurants={data.restaurants} initial={targetRestaurant} pending={reviewM.isPending} onClose={() => setSheet(null)} onSubmit={(v) => reviewM.mutate(v)} />}
    {sheet === "reclamo" && <ClaimForm orders={data.orders} initial={targetOrder} pending={claimM.isPending} onClose={() => setSheet(null)} onSubmit={(v) => claimM.mutate(v)} />}
    {sheet === "repartidor" && <CourierForm pending={courierM.isPending} onClose={() => setSheet(null)} onSubmit={(v) => courierM.mutate(v)} />}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}

type ApplicationStatus = "pendiente" | "en_revision" | "rechazado" | "aprobado";
type AdminFilter = "todas" | ApplicationStatus;
const APPLICATION_LABELS: Record<ApplicationStatus, string> = { pendiente: "Pendiente", en_revision: "En revisión", rechazado: "Rechazado", aprobado: "Aprobado" };

function AdminLogin({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = key.trim();
    if (!value) return;
    setAdminToken(value);
    setError(null);
    try {
      const check = await api.getAdminApplications({});
      if (check.authorized) {
        setKey("");
        onDone();
        return;
      }
    } catch {
      /* cae al error de abajo */
    }
    setAdminToken(null);
    setError("Clave incorrecta. Intenta de nuevo.");
  };
  return <div className="admin-access"><SafeAreaTopScrim backgroundColor="var(--admin-bg)" />
    <div className="admin-lock" aria-hidden="true">×</div>
    <h1>Acceso exclusivo para administración</h1>
    <p>Ingresa tu clave de administrador para abrir el panel de Yego.</p>
    <form className="form admin-login-form" onSubmit={submit}>
      <Field label="Clave de administrador"><input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="current-password" placeholder="••••••••" /></Field>
      {error && <p className="form-error">{error}</p>}
      <button className="admin-primary" type="submit">Entrar</button>
    </form>
    <button className="text-button" type="button" onClick={() => { window.location.hash = "cliente"; }}>Volver a la vista de clientes</button>
  </div>;
}

function AdminPage() {
  const qc = useQueryClient();
  const applications = useQuery({ queryKey: ["admin-applications"], queryFn: () => api.getAdminApplications({}) });
  const [filter, setFilter] = useState<AdminFilter>("pendiente");
  const [notice, setNotice] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: (input: { type: "restaurant" | "courier"; id: number; status: ApplicationStatus }) => input.type === "restaurant"
      ? api.updateRestaurantApplication({ restaurant_id: input.id, status: input.status })
      : api.updateCourierApplication({ courier_id: input.id, status: input.status }),
    onSuccess: async (result) => {
      if (!result.ok) { setNotice(result.error); return; }
      await qc.invalidateQueries({ queryKey: ["admin-applications"] });
      setNotice("Estado actualizado");
      window.setTimeout(() => setNotice(null), 2400);
    },
  });
  if (applications.isPending) return <div className="admin-loading"><span/><p>Cargando solicitudes…</p></div>;
  const payload = applications.data;
  if (!payload || applications.error) return <div className="admin-access"><strong>No se pudo abrir el panel.</strong><button className="admin-primary" onClick={() => applications.refetch()}>Reintentar</button></div>;
  if (!payload.authorized) return <AdminLogin onDone={() => applications.refetch()} />;
  const filteredRestaurants = payload.restaurants.filter((item) => filter === "todas" || item.status === filter);
  const filteredCouriers = payload.couriers.filter((item) => filter === "todas" || item.status === filter);
  const pendingCount = payload.restaurants.filter((item) => item.status === "pendiente").length + payload.couriers.filter((item) => item.status === "pendiente").length;
  const reviewCount = payload.restaurants.filter((item) => item.status === "en_revision").length + payload.couriers.filter((item) => item.status === "en_revision").length;
  return <div className="admin-shell"><SafeAreaTopScrim backgroundColor="var(--admin-bg)" />
    <header className="admin-header"><div><span className="admin-kicker">PANEL PRIVADO</span><h1>Solicitudes</h1><p>Revisa quién puede vender y repartir en Yego.</p></div><div className="admin-header-tools"><button className="admin-client-view" type="button" onClick={() => { window.location.hash = "cliente"; }} aria-label="Abrir vista de clientes">Vista de clientes</button><button className="admin-client-view" type="button" onClick={() => { setAdminToken(null); qc.invalidateQueries({ queryKey: ["admin-applications"] }); }} aria-label="Cerrar sesión de administración">Salir</button><div className="admin-summary"><div><strong>{pendingCount}</strong><span>Pendientes</span></div><div><strong>{reviewCount}</strong><span>En revisión</span></div></div></div></header>
    <main className="admin-main">
      <div className="admin-filters" role="group" aria-label="Filtrar solicitudes">{(["todas", "pendiente", "en_revision", "aprobado", "rechazado"] as AdminFilter[]).map((status) => <button key={status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{status === "todas" ? "Todas" : APPLICATION_LABELS[status]}</button>)}</div>
      <div className="admin-columns">
        <AdminSection title="Solicitudes de locales" count={filteredRestaurants.length} empty="No hay solicitudes de locales con este estado.">{filteredRestaurants.map((item) => <AdminApplicationCard key={`restaurant-${item.id}`} type="restaurant" item={item} pending={update.isPending} onStatus={(status) => update.mutate({ type: "restaurant", id: item.id, status })}/>)}</AdminSection>
        <AdminSection title="Solicitudes de repartidores" count={filteredCouriers.length} empty="No hay solicitudes de repartidores con este estado.">{filteredCouriers.map((item) => <AdminApplicationCard key={`courier-${item.id}`} type="courier" item={item} pending={update.isPending} onStatus={(status) => update.mutate({ type: "courier", id: item.id, status })}/>)}</AdminSection>
      </div>
    </main>
    {notice && <div className="admin-toast" role="status">{notice}</div>}
  </div>;
}

function AdminSection({ title, count, empty, children }: { title: string; count: number; empty: string; children: ReactNode }) {
  return <section className="admin-section"><div className="admin-section-title"><h2>{title}</h2><span>{count}</span></div>{count ? <div className="admin-list">{children}</div> : <div className="admin-empty"><p>{empty}</p></div>}</section>;
}

function AdminApplicationCard({ type, item, pending, onStatus }: { type: "restaurant" | "courier"; item: AdminApplications["restaurants"][number] | AdminApplications["couriers"][number]; pending: boolean; onStatus: (status: ApplicationStatus) => void }) {
  const isRestaurant = type === "restaurant" && "address" in item;
  return <article className="admin-card"><div className="admin-card-top"><div className="admin-avatar" aria-hidden="true">{type === "restaurant" ? "L" : "R"}</div><div><h3>{item.name}</h3><p>{item.phone ?? "Sin teléfono"}</p></div><span className={`admin-status ${item.status}`}>{APPLICATION_LABELS[item.status]}</span></div>{isRestaurant && <dl className="admin-details"><div><dt>Dirección</dt><dd>{item.address}</dd></div><div><dt>Categoría</dt><dd>{item.category.replaceAll("_", " ")}</dd></div></dl>}<p className="admin-date">Solicitud recibida {dateTime(item.created_at)}</p><div className="admin-actions"><button className="review" disabled={pending || item.status === "en_revision"} onClick={() => onStatus("en_revision")}>Marcar en revisión</button><button className="reject" disabled={pending || item.status === "rechazado"} onClick={() => onStatus("rechazado")}>Rechazar</button><button className="approve" disabled={pending || item.status === "aprobado"} onClick={() => onStatus("aprobado")}>Aprobar</button></div></article>;
}

function ClientPortal({ data, onOrder, onReview, onRetry }: { data: Dashboard; onOrder: (id?: number) => void; onReview: (id: number) => void; onRetry: () => void }) {
  const [search, setSearch] = useState(""); const [category, setCategory] = useState<Category | "todos">("todos");
  const [favorites, setFavorites] = useState<number[]>(() => { try { const stored = JSON.parse(readStorage("delivery-favorites") ?? "[]") as unknown; return Array.isArray(stored) ? stored.filter((value): value is number => typeof value === "number") : []; } catch { return []; } });
  useEffect(() => { writeStorage("delivery-favorites", JSON.stringify(favorites)); }, [favorites]);
  const query = search.trim().toLowerCase();
  const approvedRestaurants = data.restaurants.filter((r) => r.application_status === "aprobado" && r.menu.some((item) => item.active));
  const filtered = approvedRestaurants.filter((r) => (category === "todos" || r.category === category) && (!query || r.name.toLowerCase().includes(query) || r.menu.some((m) => m.name.toLowerCase().includes(query))));
  return <main className="consumer-body">
    <section className="welcome"><h1>¿Qué vas a pedir hoy?</h1><p>Comida rica, cerca de ti.</p></section>
    <div className="search-box"><Icon name="search"/><input aria-label="Buscar restaurantes o platos" placeholder="Buscar restaurantes o platos" value={search} onChange={(e) => setSearch(e.target.value)}/></div>
    <div className="category-row" aria-label="Categorías">{CATEGORIES.map((item) => <button type="button" key={item.value} className={category === item.value ? "active" : ""} onClick={() => setCategory(item.value)}><span>{item.glyph}</span>{item.label}</button>)}</div>
    <section className="promo-banner"><div><span>OFERTA YEGO</span><strong>Come rico,<br/>paga menos.</strong><p>Usa los cupones de cada local.</p></div><div className="promo-art" aria-hidden="true">20<small>%</small></div></section>
    <section className="restaurant-market"><div className="section-heading"><div><h2>Restaurantes cerca de ti</h2><p>{filtered.length ? `${filtered.length} disponibles` : "Explora tu zona"}</p></div></div>
      {filtered.length ? <div className="market-grid">{filtered.map((r) => <article className="market-card" key={r.id}><div className="restaurant-cover"><span>{CATEGORIES.find((c) => c.value === r.category)?.glyph ?? "●"}</span><div className="delivery-pill">Entrega disponible</div><button className={`favorite ${favorites.includes(r.id) ? "saved" : ""}`} onClick={() => setFavorites((old) => old.includes(r.id) ? old.filter((id) => id !== r.id) : [...old, r.id])} aria-label={favorites.includes(r.id) ? `Quitar ${r.name} de favoritos` : `Guardar ${r.name} en favoritos`}><Icon name="heart"/></button></div><div className="market-content"><div className="restaurant-title"><div><h3>{r.name}</h3><p>{CATEGORIES.find((c) => c.value === r.category)?.label ?? "Comida"} · {r.address}</p></div><div className="rating"><Icon name="star"/><strong>{r.rating_average?.toFixed(1) ?? "Nuevo"}</strong></div></div>{r.promotions.filter((p) => p.active).slice(0, 1).map((p) => <div className="promo-line" key={p.id}><strong>{p.title}</strong><span>Código {p.code}</span></div>)}<div className="menu-list">{r.menu.filter((m) => m.active).slice(0, 3).map((m) => <div key={m.id}><span>{m.name}</span><strong>{money(m.price_cents, r.currency)}</strong></div>)}{!r.menu.length && <p>Este local está preparando su menú.</p>}</div><div className="card-actions"><button className="primary-button" disabled={!r.menu.length} onClick={() => onOrder(r.id)}>Ver menú</button><button className="text-button" onClick={() => onReview(r.id)}>Calificar</button></div></div></article>)}</div> : approvedRestaurants.length === 0 ? <div className="empty-panel client-empty"><span className="empty-icon"><Icon name="shop"/></span><h3>No disponible en tu zona</h3><p>Pronto encontrarás restaurantes y sabores cerca de ti.</p><button className="primary-button" onClick={onRetry}>Reintentar</button></div> : <div className="empty-panel client-empty"><span className="empty-icon"><Icon name="search"/></span><h3>No encontramos resultados</h3><p>Prueba otra categoría o una palabra diferente.</p><button className="secondary-button" onClick={() => { setSearch(""); setCategory("todos"); }}>Ver todos</button></div>}
    </section>
  </main>;
}

function CustomerOrders({ data, onClaim, onOrder }: { data: Dashboard; onClaim: (id: number) => void; onOrder: () => void }) {
  const current = data.orders.filter((o) => o.status !== "entregado" && o.status !== "cancelado");
  const history = data.orders.filter((o) => o.status === "entregado" || o.status === "cancelado");
  return <main className="consumer-body orders-page"><div className="page-title"><h1>Mis pedidos</h1><p>Sigue lo que está en camino y revisa tus compras.</p></div><OrderList title="En curso" orders={current} empty="No tienes pedidos activos." onClaim={onClaim}/><OrderList title="Anteriores" orders={history} empty="Aquí aparecerá tu historial." onClaim={onClaim}/>{!data.orders.length && <button className="primary-button start-order" onClick={onOrder}>Hacer mi primer pedido</button>}</main>;
}
function OrderList({ title, orders, empty, onClaim }: { title: string; orders: Order[]; empty: string; onClaim: (id: number) => void }) { return <section className="orders-section"><div className="section-heading"><h2>{title}</h2></div>{orders.length ? <div className="order-cards">{orders.map((order) => <OrderCard key={order.id} order={order} onClaim={onClaim}/>)}</div> : <div className="empty-order"><Icon name="receipt"/><p>{empty}</p></div>}</section>; }
function OrderCard({ order, onClaim }: { order: Order; onClaim: (id: number) => void }) { const steps: Status[] = ["nuevo", "preparando", "en_camino", "entregado"]; const index = steps.indexOf(order.status); return <article className="order-card"><div className="order-title"><div><span>Pedido #{order.id}</span><h3>{order.restaurant_name}</h3></div><strong>{money(order.total_cents, order.currency)}</strong></div><p className="address">{order.delivery_address}</p><div className="progress-track">{steps.map((s, i) => <div className={i <= index ? "done" : ""} key={s}><span/><small>{STATUS[s]}</small></div>)}</div><div className="order-meta"><span>{order.payment_method}</span>{order.scheduled_for && <span>{dateTime(order.scheduled_for)}</span>}</div><button className="text-button" onClick={() => onClaim(order.id)}>Reportar un problema</button></article>; }

function SettingsSheet({ restaurant, courier, onClose, onRestaurant, onCourier }: { restaurant: ApplicationLookup["restaurant"]; courier: ApplicationLookup["courier"]; onClose: () => void; onRestaurant: () => void; onCourier: () => void }) { const label = (status: "pendiente" | "en_revision" | "rechazado" | "aprobado") => ({ pendiente: "Pendiente", en_revision: "En revisión", rechazado: "Rechazado", aprobado: "Aprobado" })[status]; return <Sheet title="Configuración" onClose={onClose}><div className="settings-list"><button onClick={onRestaurant} disabled={Boolean(restaurant)}><span className="setting-icon"><Icon name="shop"/></span><span><strong>Ingresar mi local</strong><small>{restaurant ? `${restaurant.name} · ${label(restaurant.status)}` : "Envía los datos de tu restaurante para revisión."}</small></span>{restaurant ? <em className={`application-status ${restaurant.status}`}>{label(restaurant.status)}</em> : <Icon name="chevron"/>}</button><button onClick={onCourier} disabled={Boolean(courier)}><span className="setting-icon">⌁</span><span><strong>Solicitar ser repartidor</strong><small>{courier ? `${courier.name} · ${label(courier.status)}` : "Registra tus datos para empezar el proceso."}</small></span>{courier ? <em className={`application-status ${courier.status}`}>{label(courier.status)}</em> : <Icon name="chevron"/>}</button><div className="settings-note"><strong>¿Necesitas ayuda?</strong><p>Los reclamos se envían desde cada pedido en “Mis pedidos”.</p></div></div></Sheet>; }
function RestaurantForm({ pending, onClose, onSubmit }: { pending: boolean; onClose: () => void; onSubmit: (v: { name: string; address: string; phone: string; currency: string; category: Category }) => void }) { const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); onSubmit({ name: String(f.get("name") ?? ""), address: String(f.get("address") ?? ""), phone: String(f.get("phone") ?? ""), currency: "USD", category: String(f.get("category")) as Category }); }; return <Sheet title="Ingresar mi local" onClose={onClose}><form className="form" onSubmit={submit}><p className="form-intro">Completa los datos esenciales. Cada persona puede registrar un solo local y la solicitud debe ser aprobada antes de publicarse.</p><Field label="Nombre del local"><input name="name" required minLength={2} autoFocus autoComplete="organization"/></Field><Field label="Tipo de comida"><select name="category" required>{CATEGORIES.filter((c) => c.value !== "todos").map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Field><Field label="Dirección"><input name="address" required minLength={4} placeholder="Calle, número o referencia" autoComplete="street-address"/></Field><Field label="Teléfono"><input name="phone" required minLength={7} inputMode="tel" autoComplete="tel"/></Field><button className="primary-button full" disabled={pending}>{pending ? "Enviando…" : "Enviar solicitud"}</button></form></Sheet>; }
function OrderForm({ restaurants, initial, pending, onClose, onSubmit }: { restaurants: Restaurant[]; initial: number | null; pending: boolean; onClose: () => void; onSubmit: (v: { restaurant_id: number; menu_item_id: number; quantity: number; customer_name: string; customer_phone?: string; delivery_address: string; notes?: string; promo_code?: string; payment_method: "efectivo" | "transferencia" | "tarjeta"; scheduled_for: string | null }) => void }) { const available = restaurants.filter((r) => r.application_status === "aprobado" && r.menu.some((m) => m.active)); const [restaurantId, setRestaurantId] = useState(initial && available.some((r) => r.id === initial) ? initial : available[0]?.id ?? 0); const restaurant = available.find((r) => r.id === restaurantId); const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); const scheduled = String(f.get("scheduled_for") ?? ""); onSubmit({ restaurant_id: Number(f.get("restaurant_id")), menu_item_id: Number(f.get("menu_item_id")), quantity: Number(f.get("quantity")), customer_name: String(f.get("customer_name") ?? ""), customer_phone: String(f.get("customer_phone") ?? ""), delivery_address: String(f.get("delivery_address") ?? ""), notes: String(f.get("notes") ?? ""), promo_code: String(f.get("promo_code") ?? ""), payment_method: String(f.get("payment_method")) as "efectivo" | "transferencia" | "tarjeta", scheduled_for: scheduled ? new Date(scheduled).toISOString() : null }); }; return <Sheet title="Confirmar pedido" onClose={onClose}><form className="form" onSubmit={submit}>{available.length ? <><Field label="Restaurante"><select name="restaurant_id" value={restaurantId} onChange={(e) => setRestaurantId(Number(e.target.value))}>{available.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field><div className="field-row"><Field label="Plato"><select name="menu_item_id" key={restaurantId}>{restaurant?.menu.filter((m) => m.active).map((m) => <option value={m.id} key={m.id}>{m.name} · {money(m.price_cents, restaurant.currency)}</option>)}</select></Field><Field label="Cantidad"><input name="quantity" type="number" min="1" max="99" defaultValue="1" required/></Field></div><Field label="Tu nombre"><input name="customer_name" required minLength={2}/></Field><Field label="Dirección y referencia"><textarea name="delivery_address" rows={3} required minLength={4} placeholder="Calle, número, sector o punto cercano"/></Field><Field label="Teléfono"><input name="customer_phone" inputMode="tel"/></Field><div className="field-row"><Field label="Pago"><select name="payment_method"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option></select></Field><Field label="Programar (opcional)"><input name="scheduled_for" type="datetime-local"/></Field></div><Field label="Cupón (opcional)"><input name="promo_code" autoCapitalize="characters"/></Field><Field label="Notas (opcional)"><textarea name="notes" rows={2}/></Field><button className="primary-button full" disabled={pending}>{pending ? "Creando…" : "Confirmar pedido"}</button></> : <div className="empty-panel"><h3>No hay platos disponibles</h3><p>Vuelve a intentarlo cuando un local publique su menú.</p></div>}</form></Sheet>; }
function ReviewForm({ restaurants, initial, pending, onClose, onSubmit }: { restaurants: Restaurant[]; initial: number | null; pending: boolean; onClose: () => void; onSubmit: (v: { restaurant_id: number; reviewer_name: string; rating: number; comment: string }) => void }) { const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); onSubmit({ restaurant_id: Number(f.get("restaurant_id")), reviewer_name: String(f.get("reviewer_name") ?? ""), rating: Number(f.get("rating")), comment: String(f.get("comment") ?? "") }); }; return <Sheet title="Calificar restaurante" onClose={onClose}><form className="form" onSubmit={submit}><Field label="Restaurante"><select name="restaurant_id" defaultValue={initial ?? restaurants[0]?.id}>{restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field><Field label="Tu nombre"><input name="reviewer_name" required/></Field><Field label="Calificación"><select name="rating"><option value="5">5 — Excelente</option><option value="4">4 — Muy bueno</option><option value="3">3 — Bueno</option><option value="2">2 — Regular</option><option value="1">1 — Malo</option></select></Field><Field label="Reseña"><textarea name="comment" required minLength={4} rows={4}/></Field><button className="primary-button full" disabled={pending}>Publicar reseña</button></form></Sheet>; }
function ClaimForm({ orders, initial, pending, onClose, onSubmit }: { orders: Order[]; initial: number | null; pending: boolean; onClose: () => void; onSubmit: (v: { order_id: number; category: Claim["category"]; description: string; contact?: string }) => void }) { const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); onSubmit({ order_id: Number(f.get("order_id")), category: String(f.get("category")) as Claim["category"], description: String(f.get("description") ?? ""), contact: String(f.get("contact") ?? "") }); }; return <Sheet title="Reportar un problema" onClose={onClose}><form className="form" onSubmit={submit}><Field label="Pedido"><select name="order_id" defaultValue={initial ?? orders[0]?.id}>{orders.map((o) => <option key={o.id} value={o.id}>#{o.id} · {o.restaurant_name}</option>)}</select></Field><Field label="Problema"><select name="category"><option value="demora">Demora</option><option value="pedido_incompleto">Pedido incompleto</option><option value="producto_incorrecto">Producto incorrecto</option><option value="cobro">Cobro</option><option value="trato">Trato recibido</option><option value="otro">Otro</option></select></Field><Field label="¿Qué pasó?"><textarea name="description" minLength={10} required rows={5}/></Field><Field label="Contacto"><input name="contact"/></Field><button className="primary-button full" disabled={pending}>Enviar reclamo</button></form></Sheet>; }
function CourierForm({ pending, onClose, onSubmit }: { pending: boolean; onClose: () => void; onSubmit: (v: { name: string; phone: string }) => void }) { const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); onSubmit({ name: String(f.get("name") ?? ""), phone: String(f.get("phone") ?? "") }); }; return <Sheet title="Solicitar ser repartidor" onClose={onClose}><form className="form" onSubmit={submit}><p className="form-intro">Déjanos tus datos y tu solicitud quedará registrada.</p><Field label="Nombre completo"><input name="name" required minLength={2} autoFocus autoComplete="name"/></Field><Field label="Teléfono"><input name="phone" inputMode="tel" required minLength={7} autoComplete="tel"/></Field><button className="primary-button full" disabled={pending}>{pending ? "Enviando…" : "Enviar solicitud"}</button></form></Sheet>; }
