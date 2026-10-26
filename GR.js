"use strict";

/* GR FIT — JavaScript com Supabase
   Usa a URL e a chave pública do projeto.
   Nunca coloque a chave service_role neste arquivo.
*/

const SUPABASE_URL = "https://yfxopqarfalicrkwbyie.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_xDbuNBbZeFWurBCqNQMlBA_5MqLWbGN";

const configured = Boolean(
  window.supabase &&
  SUPABASE_URL.startsWith("https://") &&
  SUPABASE_ANON_KEY.length > 20
);

const sb = configured
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const $ = id => document.getElementById(id);

let session = null;
let profile = null;
let charts = {};
let currentPage = "dashboard";

const navItems = {
  aluno: [
    ["dashboard", "Painel principal", "grid"],
    ["treinos", "Treinos", "dumbbell"],
    ["progresso", "Progresso", "chart"],
    ["avaliacoes", "Avaliações", "clipboard"],
    ["profissionais", "Profissionais", "users"],
    ["suporte", "Ajuda e suporte", "help"]
  ],
  profissional: [
    ["dashboard", "Painel principal", "grid"],
    ["treinos", "Treinos", "dumbbell"],
    ["progresso", "Progresso", "chart"],
    ["avaliacoes", "Avaliações", "clipboard"],
    ["profissional", "Área profissional", "briefcase"],
    ["suporte", "Ajuda e suporte", "help"]
  ],
  admin: [
    ["admin", "Painel administrativo", "shield"],
    ["suporte", "Suporte", "help"]
  ]
};

const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  dumbbell: '<path d="m6 6 12 12M4 8l4-4M16 20l4-4M3 11l8-8M13 21l8-8"/>',
  chart: '<path d="M3 3v18h18M7 14l4-4 3 3 6-7"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M8 10h8M8 14h8M8 18h5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 8v6M23 11h-6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 4.3 1.7c-1.2 1.1-1.9 1.4-1.9 3M12 17h.01"/>',
  briefcase: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/>',
  shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>'
};

function svg(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.grid}</svg>`;
}

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function msg(id, text, error = false) {
  const element = $(id);
  if (!element) return;
  element.textContent = text;
  element.classList.toggle("error", error);
}

function notice(text, error = false) {
  const element = $("notice");
  if (!element) return;
  element.textContent = text;
  element.classList.toggle("error", error);
  element.classList.remove("hidden");
}

function fmtDate(date) {
  if (!date) return "—";
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR");
}

function empty(text) {
  return `<div class="empty-state">${esc(text)}</div>`;
}

function btn(text, action, kind = "primary", attrs = "") {
  return `<button type="button" class="btn ${kind}" data-action="${action}" ${attrs}>${text}</button>`;
}

function requireConfig() {
  if (!sb) {
    msg(
      "authMessage",
      "Não foi possível inicializar o Supabase. Confira a URL, a chave pública e a biblioteca no HTML.",
      true
    );
    return false;
  }
  return true;
}

/* AUTENTICAÇÃO */

function switchAuth(mode) {
  $("loginForm").classList.toggle("hidden", mode !== "login");
  $("registerForm").classList.toggle("hidden", mode !== "register");

  document.querySelectorAll("[data-auth]").forEach(button => {
    button.classList.toggle("active", button.dataset.auth === mode);
  });

  msg("authMessage", "");
}

document.querySelectorAll("[data-auth]").forEach(button => {
  button.addEventListener("click", () => switchAuth(button.dataset.auth));
});

$("registerRole").addEventListener("change", () => {
  const professional = $("registerRole").value === "profissional";
  $("plansPreview").classList.toggle("hidden", !professional);
  $("inviteWrap").classList.toggle("hidden", professional);
});

$("adminLoginToggle").addEventListener("click", () => {
  $("adminLoginForm").classList.toggle("hidden");
});

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireConfig()) return;

  msg("authMessage", "Entrando...");

  try {
    const { error } = await sb.auth.signInWithPassword({
      email: $("loginEmail").value.trim(),
      password: $("loginPassword").value
    });

    if (error) throw error;

    const { data } = await sb.auth.getSession();
    session = data.session;

    await loadProfile();
    await renderApp();
  } catch (error) {
    msg("authMessage", error.message || "Não foi possível entrar.", true);
  }
});

$("registerForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireConfig()) return;

  const role = $("registerRole").value;
  const email = $("registerEmail").value.trim();
  const password = $("registerPassword").value;
  const fullName = $("registerName").value.trim();

  if (password.length < 8) {
    msg("authMessage", "Use uma senha com pelo menos 8 caracteres.", true);
    return;
  }

  msg("authMessage", "Criando conta...");

  try {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          requested_role: role,
          requested_plan: role === "profissional"
            ? $("registerPlan").value
            : null
        }
      }
    });

    if (error) throw error;

    if (!data.session) {
      msg(
        "authMessage",
        "Cadastro criado. Confirme seu e-mail e depois entre. A conta começa como aluno; a área profissional precisa ser autorizada separadamente."
      );
      return;
    }

    session = data.session;
    await loadProfile();

    if (role === "aluno" && $("registerInvite").value.trim()) {
      const result = await sb.rpc("redeem_invite_code", {
        invite_code_input: $("registerInvite").value.trim()
      });

      if (result.error) {
        notice("Conta criada, mas o convite não foi aplicado: " + result.error.message, true);
      }
    }

    await renderApp();
  } catch (error) {
    msg("authMessage", error.message || "Não foi possível criar a conta.", true);
  }
});

$("adminLoginForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireConfig()) return;

  try {
    const { error } = await sb.auth.signInWithPassword({
      email: $("adminEmail").value.trim(),
      password: $("adminPassword").value
    });

    if (error) throw error;

    const { data } = await sb.auth.getSession();
    session = data.session;

    await loadProfile();

    if (profile.role !== "admin") {
      await sb.auth.signOut();
      session = null;
      profile = null;
      msg("authMessage", "Esta conta não tem permissão administrativa.", true);
      return;
    }

    await renderApp();
  } catch (error) {
    msg("authMessage", error.message || "Falha no acesso administrativo.", true);
  }
});

$("logoutBtn").addEventListener("click", async () => {
  if (sb) await sb.auth.signOut();

  session = null;
  profile = null;

  $("appScreen").classList.add("hidden");
  $("authScreen").classList.remove("hidden");

  switchAuth("login");
});

$("menuToggle").addEventListener("click", () => {
  $("sidebar").classList.toggle("open");
});

$("mainNav").addEventListener("click", event => {
  const button = event.target.closest("[data-page]");
  if (button) navigate(button.dataset.page);
});

/* AÇÕES DOS BOTÕES E FORMULÁRIOS */

$("pageContent").addEventListener("click", async event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const action = button.dataset.action;

  try {
    if (action === "complete") await completeWorkout(button.dataset.id);
    if (action === "invite") await createInvite();
    if (action === "revoke-invite") await revokeInvite(button.dataset.id);

    if (action === "subscribe") {
      notice(
        "Os pagamentos ainda não estão conectados. É necessário integrar um provedor e confirmar o pagamento no servidor."
      );
    }

    if (action === "subscription-status") {
      await setSubscriptionStatus(
        button.dataset.id,
        button.dataset.professional,
        button.dataset.status
      );
    }

    if (action === "ticket-close") await closeTicket(button.dataset.id);
    if (action === "user-status") await toggleUserStatus(button.dataset.id, button.dataset.status);
    if (action === "ticket-reply") await replyTicket(button.dataset.id);
    if (action === "go-admin") navigate("admin");
    if (action === "go-workouts") navigate("treinos");
    if (action === "go-assess") navigate("avaliacoes");
  } catch (error) {
    notice(error.message || "Não foi possível concluir a ação.", true);
  }
});

$("pageContent").addEventListener("submit", async event => {
  const form = event.target;
  if (!form.matches("[data-form]")) return;

  event.preventDefault();

  try {
    const data = Object.fromEntries(new FormData(form).entries());

    if (form.dataset.form === "workout") await saveWorkout(data);
    if (form.dataset.form === "assessment") await saveAssessment(data);
    if (form.dataset.form === "support") await saveTicket(data);
    if (form.dataset.form === "redeem") await redeemInvite(data);
    if (form.dataset.form === "professional-assessment") {
      await saveProfessionalAssessment(data);
    }

    await renderPage(currentPage);
  } catch (error) {
    notice(error.message || "Erro ao salvar os dados.", true);
  }
});

/* PERFIL E NAVEGAÇÃO */

async function loadProfile() {
  if (!session?.user) throw new Error("Nenhuma sessão autenticada.");

  const { data, error } = await sb
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (error) throw error;
  if (!data) throw new Error("Perfil não encontrado. Confira o SQL do Supabase.");

  profile = data;

  if (profile.status === "suspended") {
    await sb.auth.signOut();
    throw new Error("Esta conta está suspensa. Entre em contato com o suporte.");
  }

  if (profile.role === "profissional" && profile.subscription_status !== "active") {
    notice("Sua conta profissional aguarda autorização e assinatura ativa.");
  }
}

async function boot() {
  if (!requireConfig()) return;

  const { data, error } = await sb.auth.getSession();
  if (error) throw error;

  session = data.session;

  if (!session) {
    $("authScreen").classList.remove("hidden");
    $("appScreen").classList.add("hidden");
    return;
  }

  await loadProfile();
  await renderApp();
}

async function renderApp() {
  $("authScreen").classList.add("hidden");
  $("appScreen").classList.remove("hidden");

  $("userName").textContent = profile.full_name || session.user.email;
  $("userRole").textContent = ({
    aluno: "Aluno",
    profissional: "Profissional",
    admin: "Administrador"
  })[profile.role] || profile.role;

  $("avatar").textContent = (profile.full_name || "GR")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();

  $("year").textContent = new Date().getFullYear();
  $("today").textContent = new Date().toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  $("mainNav").innerHTML = (navItems[profile.role] || navItems.aluno)
    .map(([id, label, icon]) =>
      `<button class="nav-btn" data-page="${id}">${svg(icon)}<span>${label}</span></button>`
    )
    .join("");

  currentPage = profile.role === "admin" ? "admin" : "dashboard";
  await renderPage(currentPage);
}

function navigate(page) {
  if (!(navItems[profile.role] || []).some(item => item[0] === page)) return;

  currentPage = page;
  $("sidebar").classList.remove("open");
  renderPage(page).catch(error => notice(error.message, true));
}

async function renderPage(page) {
  currentPage = page;

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  const names = {
    dashboard: ["Painel", "Sua evolução, acompanhada de perto."],
    treinos: ["Treinos", "Rotinas e conclusão dos treinos."],
    progresso: ["Progresso", "Acompanhe seus registros ao longo do tempo."],
    avaliacoes: ["Avaliações", "Histórico e registro de avaliações."],
    profissionais: ["Profissionais", "Encontre e conecte-se a um profissional."],
    profissional: ["Área profissional", "Gerencie alunos, treinos e avaliações."],
    suporte: ["Ajuda e suporte", "Envie uma solicitação ou acompanhe suas mensagens."],
    admin: ["Painel administrativo", "Contas e solicitações de suporte."]
  };

  $("pageTitle").innerHTML = `${esc(names[page]?.[0] || "Painel")} <span>GR Fit</span>`;
  $("pageSubtitle").textContent = names[page]?.[1] || "";

  destroyCharts();

  const content = $("pageContent");
  content.innerHTML = empty("Carregando dados...");

  if (page === "dashboard") content.innerHTML = await dashboardPage();
  else if (page === "treinos") content.innerHTML = await workoutsPage();
  else if (page === "progresso") content.innerHTML = await progressPage();
  else if (page === "avaliacoes") content.innerHTML = await assessmentsPage();
  else if (page === "profissional") content.innerHTML = await professionalPage();
  else if (page === "profissionais") content.innerHTML = await professionalsPage();
  else if (page === "suporte") content.innerHTML = await supportPage();
  else if (page === "admin") content.innerHTML = await adminPage();

  wirePageCharts(page);
}

function destroyCharts() {
  Object.values(charts).forEach(chart => chart.destroy());
  charts = {};
}

function draw(id, type, labels, datasets) {
  const canvas = $(id);
  if (!canvas || !window.Chart) return;

  charts[id] = new Chart(canvas, {
    type,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#c7ccd4" } }
      },
      scales: type === "doughnut" ? {} : {
        x: { ticks: { color: "#929dad" }, grid: { color: "#263243" } },
        y: { ticks: { color: "#929dad" }, grid: { color: "#263243" }, beginAtZero: true }
      }
    }
  });
}

/* DADOS DO ALUNO */

async function myAssessments() {
  const { data, error } = await sb
    .from("assessments")
    .select("*")
    .eq("student_id", session.user.id)
    .order("assessment_date");

  if (error) throw error;
  return data || [];
}

async function myWorkouts() {
  const { data, error } = await sb
    .from("workouts")
    .select("*, workout_completions(id,student_id,completed_at)")
    .eq("student_id", session.user.id)
    .eq("published", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function dashboardPage() {
  if (profile.role === "admin") {
    return `<div class="hero"><div class="hero-copy">
      <span class="pill">ADMINISTRAÇÃO</span>
      <h2>Controle do <span>GR Fit</span></h2>
      <p>Gerencie contas e solicitações de suporte.</p>
      ${btn("Abrir painel administrativo", "go-admin")}
    </div></div>`;
  }

  if (profile.role === "profissional" && profile.subscription_status !== "active") {
    return `<div class="hero"><div class="hero-copy">
      <span class="pill">ASSINATURA PENDENTE</span>
      <h2>Ative sua área <span>profissional</span></h2>
      <p>A área profissional aguarda autorização e confirmação da assinatura.</p>
    </div></div>${plansHTML()}`;
  }

  if (profile.role === "profissional") {
    const students = await professionalStudents();
    return `<div class="hero"><div class="hero-copy">
      <span class="pill">ÁREA PROFISSIONAL</span>
      <h2>Bem-vindo ao <span>GR Fit</span></h2>
      <p>Gerencie treinos, avaliações e alunos vinculados.</p>
      ${btn("Abrir área profissional", "go-workouts")}
    </div></div>
    <div class="stats"><article class="stat-card">
      <span>Alunos vinculados</span><strong>${students.length}</strong>
    </article></div>`;
  }

  const [assessments, workouts] = await Promise.all([myAssessments(), myWorkouts()]);
  const last = assessments.at(-1);

  return `<div class="hero"><div class="hero-copy">
    <span class="pill">DISCIPLINA · CONSTÂNCIA · EVOLUÇÃO</span>
    <h2>Construa sua melhor <span>versão.</span></h2>
    <p>Consulte treinos, registre avaliações e acompanhe seus registros.</p>
    ${btn("Ver meus treinos", "go-workouts")}
    ${btn("Registrar avaliação", "go-assess", "secondary")}
    </div>
    <img src="logo.png" class="hero-logo" alt="" onerror="this.style.display='none'">
  </div>
  <div class="stats">
    <article class="stat-card"><span>Treinos atribuídos</span><strong>${workouts.length}</strong>
      <small>${workouts.filter(w => w.workout_completions?.some(c => c.student_id === session.user.id)).length} concluídos</small>
    </article>
    <article class="stat-card"><span>Gordura corporal</span>
      <strong>${last ? Number(last.body_fat_pct).toLocaleString("pt-BR") + "%" : "—"}</strong>
      <small>Última avaliação</small>
    </article>
    <article class="stat-card"><span>Massa corporal</span>
      <strong>${last ? Number(last.mass_kg).toLocaleString("pt-BR") + " kg" : "—"}</strong>
      <small>Último registro</small>
    </article>
    <article class="stat-card"><span>Avaliações</span><strong>${assessments.length}</strong>
      <small>Histórico pessoal</small>
    </article>
  </div>
  <div class="content-grid">
    <article class="card"><h2>Conclusão dos treinos</h2><div class="chart-box"><canvas id="workoutChart"></canvas></div></article>
    <article class="card"><h2>Gordura corporal</h2><div class="chart-box"><canvas id="fatChart"></canvas></div></article>
  </div>`;
}

function plansHTML() {
  return `<div class="plan-grid">
    <article class="plan-card"><span class="pill">PLANO</span><h3>GR Fit Start</h3><div class="plan-price">R$ 29,90</div><p>Por mês.</p>${btn("Ver opções de pagamento", "subscribe", "secondary")}</article>
    <article class="plan-card"><span class="pill">PLANO</span><h3>GR Fit Pro</h3><div class="plan-price">R$ 149,90</div><p>A cada 6 meses.</p>${btn("Ver opções de pagamento", "subscribe", "secondary")}</article>
    <article class="plan-card"><span class="pill">PLANO</span><h3>GR Fit Premium</h3><div class="plan-price">R$ 269,90</div><p>Por ano.</p>${btn("Ver opções de pagamento", "subscribe", "secondary")}</article>
  </div>
  <p class="hint">Os valores são sugestões. Pagamentos reais ainda não estão conectados.</p>`;
}

/* TREINOS */

async function workoutsPage() {
  if (profile.role === "profissional" && profile.subscription_status !== "active") {
    return plansHTML();
  }

  let query = sb
    .from("workouts")
    .select("*, workout_completions(id,student_id,completed_at)")
    .order("created_at", { ascending: false });

  if (profile.role === "aluno") {
    query = query.eq("student_id", session.user.id).eq("published", true);
  } else {
    query = query.eq("professional_id", session.user.id);
  }

  const { data, error } = await query;
  if (error) throw error;

  if (!data?.length) return empty("Nenhum treino encontrado.");

  return `<div class="section-head"><div>
    <h2>${profile.role === "aluno" ? "Minha rotina de treinos" : "Treinos publicados"}</h2>
    <p class="muted">${profile.role === "aluno" ? "Marque um treino como concluído depois de realizá-lo." : "Acompanhe os treinos dos seus alunos."}</p>
  </div></div>
  <div class="workout-list">${data.map(workout => {
    const done = workout.workout_completions?.some(c => c.student_id === session.user.id);

    return `<article class="workout-card">
      <span class="badge ${done ? "" : "
