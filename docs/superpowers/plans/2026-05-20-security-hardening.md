# UaiPedeX Security Hardening & Firebase Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir todas as vulnerabilidades críticas de segurança e migrar o Firebase completamente para Supabase, resultando em um sistema com autenticação nativa Supabase Auth, RLS ativa em todas as tabelas, preços calculados no servidor via Edge Functions e zero dependência do Firebase.

**Architecture:** HTML/JS estático + Supabase Auth + Supabase Realtime + Supabase Edge Functions (Deno/TypeScript). Migração em 4 camadas: Auth → RLS/DB → Edge Functions → Firebase out. Cada camada é deployável e testável independentemente.

**Tech Stack:** Supabase JS v2.49.4, Supabase Auth, Supabase Edge Functions (Deno), DOMPurify 3.1.6, OneSignal Web SDK v16, PostgreSQL 17 (PL/pgSQL)

**Supabase project:** `https://mvhqsiyalupodrtsfncj.supabase.co`

---

## Mapa de arquivos

### Novos arquivos
- `js/supabase-client.js` — cliente Supabase compartilhado (URL + key + createClient)
- `js/auth.js` — utilitários de autenticação (getSession, requireRole, logout, saveSession)
- `reset-password.html` — página de redefinição de senha via link de email
- `supabase/functions/migrate-users/index.ts` — script único de migração de usuários
- `supabase/functions/place-order/index.ts` — cálculo de total e criação de pedido no servidor
- `supabase/functions/apply-coupon/index.ts` — preview de desconto antes de confirmar pedido
- `supabase/functions/notify/index.ts` — envio de push notification via OneSignal

### Arquivos modificados
- `login.html` — substituir query-auth por Supabase Auth
- `cadastro.html` — substituir Firebase + query-auth por Supabase Auth
- `login-vendedor.html` — substituir query-auth por Supabase Auth
- `cadastroestabelecimento.html` — remover Firebase, usar Supabase Auth
- `login-entregador.html` — remover Firebase, usar Supabase Auth
- `loginadm.html` — simplificar (remover sessionStorage dupla)
- `adm.js` — remover exibição de senhas, atualizar guard de autenticação
- `index.js` — corrigir XSS nos alertas globais
- `carrinho.html` — chamar Edge Function `place-order` em vez de insert direto
- `vendedor.js` — remover Firebase, usar Supabase para produtos e Realtime para pedidos
- `loja.html` — ler produtos do Supabase em vez do Firebase
- `entregador.html` — remover Firebase completamente, usar Supabase Auth + Realtime + OneSignal
- `monitoramento.html` — substituir Firebase por Supabase Realtime
- `painel-parceiro.html` — substituir Firebase por Supabase
- `email.html` — substituir Firebase por Supabase
- `perfil.html` — atualizar guard de sessão
- `pedidos.html` — atualizar guard de sessão
- `vendedor.html` — atualizar guard de sessão

---

## LAYER 1 — Autenticação

---

### Task 1: Criar módulo compartilhado `js/supabase-client.js`

**Files:**
- Create: `js/supabase-client.js`

- [ ] **Step 1: Criar o arquivo**

```js
// js/supabase-client.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm";

export const SUPABASE_URL = 'https://mvhqsiyalupodrtsfncj.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_K_tmqPg95RJlCCzwRZln4Q_kmfrUw0G';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

- [ ] **Step 2: Verificar**

Abrir DevTools → Console e rodar:
```js
import { supabase } from './js/supabase-client.js';
console.log(supabase);
```
Esperado: objeto Supabase Client impresso no console, sem erros.

- [ ] **Step 3: Commit**

```bash
git add js/supabase-client.js
git commit -m "feat: módulo compartilhado supabase-client"
```

---

### Task 2: Criar módulo compartilhado `js/auth.js`

**Files:**
- Create: `js/auth.js`

- [ ] **Step 1: Criar o arquivo**

```js
// js/auth.js
import { supabase } from './supabase-client.js';

export async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

export async function requireAuth(redirectTo = 'login.html') {
    const session = await getSession();
    if (!session) { window.location.href = redirectTo; return null; }
    return session;
}

export async function requireRole(role, redirectTo = 'index.html') {
    const session = await getSession();
    if (!session) { window.location.href = 'login.html'; return null; }
    const userRole = session.user.app_metadata?.role;
    if (userRole !== role) { window.location.href = redirectTo; return null; }
    return session;
}

export async function logout(redirectTo = 'index.html') {
    await supabase.auth.signOut();
    localStorage.removeItem('loggedCustomer');
    localStorage.removeItem('loggedStore');
    localStorage.removeItem('loggedDriver');
    localStorage.removeItem('isLogged');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userName');
    localStorage.removeItem('userCity');
    sessionStorage.removeItem('adminAuth');
    window.location.href = redirectTo;
}

export function saveCustomerSession(user, profile) {
    localStorage.setItem('loggedCustomer', JSON.stringify({
        name: profile.name,
        email: user.email,
        phone: profile.phone || '',
        city: profile.city || ''
        // NUNCA salvar password aqui
    }));
    localStorage.setItem('isLogged', 'true');
    localStorage.setItem('userEmail', user.email);
    localStorage.setItem('userName', profile.name);
    if (profile.city) localStorage.setItem('userCity', profile.city);
}

export function saveStoreSession(user, profile) {
    localStorage.setItem('loggedStore', JSON.stringify({
        id: profile.id,
        name: profile.name,
        email: user.email,
        city: profile.city || '',
        pixKey: profile.pixKey || '',
        dueDate: profile.dueDate || null
        // NUNCA salvar password, doc, cep aqui
    }));
}

export function saveDriverSession(user, profile) {
    localStorage.setItem('loggedDriver', JSON.stringify({
        id: profile.id,
        name: profile.name,
        email: user.email,
        city: profile.city || ''
        // NUNCA salvar password aqui
    }));
}
```

- [ ] **Step 2: Commit**

```bash
git add js/auth.js
git commit -m "feat: módulo compartilhado auth utilities"
```

---

### Task 3: Migração de schema no banco — parte 1 (auth_id + products)

**Files:**
- No dashboard Supabase → SQL Editor

- [ ] **Step 1: Colar e executar o SQL abaixo no SQL Editor do Supabase**

```sql
-- Adiciona auth_id às tabelas de perfil
ALTER TABLE customers ADD COLUMN IF NOT EXISTS auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE stores    ADD COLUMN IF NOT EXISTS auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE drivers   ADD COLUMN IF NOT EXISTS auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Adiciona player_id do OneSignal para entregadores
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS onesignal_player_id TEXT;

-- Adiciona colunas de auth nos pedidos (para RLS funcionar)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_auth_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_auth_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Cria tabela de produtos (migração do Firebase)
CREATE TABLE IF NOT EXISTS products (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    price       NUMERIC(10,2) NOT NULL,
    category    TEXT,
    image_url   TEXT,
    active      BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- UUID padrão em tabelas que usam id TEXT (se ainda não tiver gen_random_uuid)
-- Verifique se as tabelas usam TEXT ou UUID para id. Se usarem TEXT, manter como está.
-- Esta linha só se aplicar: ALTER TABLE orders ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
```

- [ ] **Step 2: Verificar no Table Editor do Supabase**

Abrir Table Editor → tabela `customers` e confirmar que a coluna `auth_id` foi criada.
Abrir Table Editor → confirmar que a tabela `products` foi criada.

- [ ] **Step 3: Commit do arquivo de referência SQL**

```bash
mkdir -p supabase/migrations
```

Salvar o SQL acima em `supabase/migrations/20260520_schema_part1.sql` e então:

```bash
git add supabase/migrations/20260520_schema_part1.sql
git commit -m "feat: schema migration — auth_id columns + products table"
```

---

### Task 4: Edge Function de migração de usuários existentes

**Files:**
- Create: `supabase/functions/migrate-users/index.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// supabase/functions/migrate-users/index.ts
// ATENÇÃO: esta função é de uso único. Execute uma vez e desative.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MIGRATION_SECRET = Deno.env.get("MIGRATION_SECRET") ?? "";

serve(async (req) => {
    if (req.headers.get("x-migration-secret") !== MIGRATION_SECRET) {
        return new Response("Forbidden", { status: 403 });
    }

    const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const results = { customers: [], stores: [], drivers: [], errors: [] };

    // Migrar clientes
    const { data: customers } = await supabase.from("customers").select("id, email, name");
    for (const c of customers ?? []) {
        if (!c.email) continue;
        const { data, error } = await supabase.auth.admin.createUser({
            email: c.email,
            email_confirm: true,
            password: crypto.randomUUID(), // senha temporária — usuário vai redefinir
            app_metadata: { role: "customer", must_reset_password: true }
        });
        if (error) { results.errors.push({ email: c.email, error: error.message }); continue; }
        await supabase.from("customers").update({ auth_id: data.user.id }).eq("id", c.id);
        results.customers.push(c.email);
    }

    // Migrar lojistas
    const { data: stores } = await supabase.from("stores").select("id, email, name");
    for (const s of stores ?? []) {
        if (!s.email) continue;
        const { data, error } = await supabase.auth.admin.createUser({
            email: s.email,
            email_confirm: true,
            password: crypto.randomUUID(),
            app_metadata: { role: "store", must_reset_password: true }
        });
        if (error) { results.errors.push({ email: s.email, error: error.message }); continue; }
        await supabase.from("stores").update({ auth_id: data.user.id }).eq("id", s.id);
        results.stores.push(s.email);
    }

    // Migrar entregadores (do Supabase — pode ainda estar no Firebase)
    const { data: drivers } = await supabase.from("drivers").select("id, email, name");
    for (const d of drivers ?? []) {
        if (!d.email) continue;
        const { data, error } = await supabase.auth.admin.createUser({
            email: d.email,
            email_confirm: true,
            password: crypto.randomUUID(),
            app_metadata: { role: "driver", must_reset_password: true }
        });
        if (error) { results.errors.push({ email: d.email, error: error.message }); continue; }
        await supabase.from("drivers").update({ auth_id: data.user.id }).eq("id", d.id);
        results.drivers.push(d.email);
    }

    return new Response(JSON.stringify(results, null, 2), {
        headers: { "Content-Type": "application/json" }
    });
});
```

- [ ] **Step 2: Configurar variável de ambiente no Supabase**

No dashboard: Edge Functions → Secrets → adicionar:
- `MIGRATION_SECRET` = uma string longa aleatória (ex: `openssl rand -hex 32`)

- [ ] **Step 3: Deploy da Edge Function**

No dashboard Supabase → Edge Functions → New Function → colar o código acima com nome `migrate-users`.

Ou via CLI:
```bash
npx supabase functions deploy migrate-users --project-ref mvhqsiyalupodrtsfncj
```

- [ ] **Step 4: Executar a migração**

```bash
curl -X POST https://mvhqsiyalupodrtsfncj.supabase.co/functions/v1/migrate-users \
  -H "x-migration-secret: SEU_MIGRATION_SECRET"
```

Verificar a resposta JSON: todos os emails migrados sem erros.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/migrate-users/index.ts
git commit -m "feat: edge function migrate-users (one-time use)"
```

---

### Task 5: Criar `reset-password.html`

**Files:**
- Create: `reset-password.html`

- [ ] **Step 1: Criar o arquivo**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Redefinir Senha</title>
    <style>
        body { font-family: sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; background:#f5f5f5; margin:0; }
        .card { background:#fff; padding:2rem; border-radius:12px; box-shadow:0 2px 12px rgba(0,0,0,.1); width:100%; max-width:400px; }
        h2 { margin:0 0 1.5rem; color:#333; }
        input { width:100%; padding:.75rem; border:1px solid #ddd; border-radius:8px; font-size:1rem; box-sizing:border-box; margin-bottom:1rem; }
        button { width:100%; padding:.75rem; background:#007bff; color:#fff; border:none; border-radius:8px; font-size:1rem; cursor:pointer; }
        button:disabled { opacity:.6; cursor:not-allowed; }
        .msg { padding:.75rem; border-radius:8px; margin-bottom:1rem; display:none; }
        .msg.success { background:#d4edda; color:#155724; display:block; }
        .msg.error   { background:#f8d7da; color:#721c24; display:block; }
    </style>
</head>
<body>
    <div class="card">
        <h2>Criar nova senha</h2>
        <div id="msg" class="msg"></div>
        <input type="password" id="newPass" placeholder="Nova senha (mínimo 6 caracteres)" />
        <input type="password" id="confirmPass" placeholder="Confirmar nova senha" />
        <button id="btn">Salvar nova senha</button>
    </div>
    <script type="module">
        import { supabase } from './js/supabase-client.js';

        const showMsg = (text, type) => {
            const el = document.getElementById('msg');
            el.textContent = text;
            el.className = `msg ${type}`;
        };

        document.getElementById('btn').addEventListener('click', async () => {
            const newPass = document.getElementById('newPass').value;
            const confirmPass = document.getElementById('confirmPass').value;

            if (newPass.length < 6) return showMsg('A senha deve ter pelo menos 6 caracteres.', 'error');
            if (newPass !== confirmPass) return showMsg('As senhas não coincidem.', 'error');

            const btn = document.getElementById('btn');
            btn.disabled = true;
            btn.textContent = 'Salvando...';

            const { error } = await supabase.auth.updateUser({ password: newPass });
            if (error) {
                showMsg('Erro ao salvar senha. O link pode ter expirado. Solicite um novo.', 'error');
                btn.disabled = false;
                btn.textContent = 'Salvar nova senha';
                return;
            }

            // Limpa o must_reset_password flag via update de metadata
            await supabase.auth.updateUser({ data: { must_reset_password: false } });

            showMsg('Senha alterada com sucesso! Redirecionando...', 'success');
            setTimeout(() => { window.location.href = 'index.html'; }, 2000);
        });
    </script>
</body>
</html>
```

- [ ] **Step 2: Verificar**

Abrir `reset-password.html` no browser. O formulário deve aparecer. Sem erros no console.

- [ ] **Step 3: Configurar URL de redirecionamento no Supabase**

Dashboard → Authentication → URL Configuration → adicionar `reset-password.html` na lista de Redirect URLs permitidas.

- [ ] **Step 4: Commit**

```bash
git add reset-password.html
git commit -m "feat: página de redefinição de senha"
```

---

### Task 6: Atualizar `login.html` — Supabase Auth para clientes

**Files:**
- Modify: `login.html`

- [ ] **Step 1: Substituir o bloco `<script type="module">` inteiro**

Localizar:
```html
<script type="module">
    import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

    const supabaseUrl = 'https://mvhqsiyalupodrtsfncj.supabase.co';
    const supabaseKey = 'sb_publishable_K_tmqPg95RJlCCzwRZln4Q_kmfrUw0G'; 
    const supabase = createClient(supabaseUrl, supabaseKey);

    const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    if (localStorage.getItem('isLogged') === 'true') {
        window.location.href = "index.html";
    }
```

Substituir o bloco completo (do `<script type="module">` até o `</script>`) por:

```html
<script type="module">
    import { supabase } from './js/supabase-client.js';
    import { saveCustomerSession } from './js/auth.js';

    // Redireciona se já tiver sessão ativa
    const { data: { session: existingSession } } = await supabase.auth.getSession();
    if (existingSession && existingSession.user.app_metadata?.role === 'customer') {
        window.location.href = 'index.html';
    }

    const citySelect = document.getElementById('regCity');
    async function loadCities() {
        try {
            const { data: cities, error } = await supabase.from('cities').select('*');
            if (error) throw error;
            cities.sort((a, b) => a.name.localeCompare(b.name));
            if (cities.length === 0) { citySelect.innerHTML = '<option value="">Nenhuma cidade disponível</option>'; return; }
            citySelect.innerHTML = '<option value="">Selecione sua cidade...</option>' +
                cities.map(c => `<option value="${c.name} - ${c.state}">${c.name} - ${c.state}</option>`).join('');
        } catch (e) {
            citySelect.innerHTML = '<option value="">Erro ao carregar</option>';
        }
    }
    loadCities();

    let isRegisterMode = false;

    function showAlert(msg, type) {
        const alertBox = document.getElementById('alert-msg');
        alertBox.innerText = msg;
        alertBox.className = type === 'error' ? 'alert-box alert-error' : 'alert-box alert-success';
        alertBox.style.display = 'block';
        if (type === 'error') setTimeout(() => { alertBox.style.display = 'none'; }, 4000);
    }

    window.toggleMode = () => {
        isRegisterMode = !isRegisterMode;
        const title = document.getElementById('title-text');
        const btnSubmit = document.getElementById('btn-submit');
        const toggleText = document.getElementById('toggle-text');
        if (isRegisterMode) {
            title.innerText = 'Criar conta';
            btnSubmit.innerText = 'Criar conta';
            toggleText.innerHTML = 'Já tem conta? <span class="toggle-link" onclick="window.toggleMode()">Faça login</span>';
            document.getElementById('register-fields').style.display = 'block';
        } else {
            title.innerText = 'Entrar';
            btnSubmit.innerText = 'Entrar';
            toggleText.innerHTML = 'Não tem conta? <span class="toggle-link" onclick="window.toggleMode()">Cadastre-se</span>';
            document.getElementById('register-fields').style.display = 'none';
        }
    };

    window.toggleRecoveryMode = () => {
        const recoverySection = document.getElementById('recovery-section');
        const mainSection = document.getElementById('main-section');
        if (recoverySection) recoverySection.style.display = recoverySection.style.display === 'none' ? 'block' : 'none';
        if (mainSection) mainSection.style.display = mainSection.style.display === 'none' ? 'block' : 'none';
    };

    // RECUPERAÇÃO DE SENHA
    const recoverBtn = document.getElementById('btn-recover');
    if (recoverBtn) {
        recoverBtn.addEventListener('click', async () => {
            const email = document.getElementById('recover-email')?.value?.trim();
            if (!email) return showAlert('Informe seu e-mail.', 'error');
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/reset-password.html'
            });
            if (error) return showAlert('Erro ao enviar e-mail. Verifique o endereço.', 'error');
            showAlert('E-mail de recuperação enviado! Verifique sua caixa de entrada.', 'success');
        });
    }

    // LOGIN / REGISTRO
    document.getElementById('btn-submit').addEventListener('click', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const pass = document.getElementById('pass').value.trim();
        const btn = document.getElementById('btn-submit');
        btn.disabled = true;

        if (isRegisterMode) {
            const name = document.getElementById('reg-name')?.value?.trim();
            const phone = document.getElementById('reg-phone')?.value?.trim();
            const city = citySelect?.value;
            if (!name || !email || !pass || pass.length < 6) {
                showAlert('Preencha todos os campos. Senha mínima: 6 caracteres.', 'error');
                btn.disabled = false; return;
            }
            btn.innerText = 'Criando conta...';
            const { data, error } = await supabase.auth.signUp({
                email, password: pass,
                options: { data: { name, phone, city } }
            });
            if (error) { showAlert(error.message, 'error'); btn.disabled = false; btn.innerText = 'Criar conta'; return; }
            // Insere perfil na tabela customers
            await supabase.from('customers').insert([{
                auth_id: data.user.id,
                name, email, phone, city,
                createdAt: new Date().toISOString()
            }]);
            saveCustomerSession(data.user, { name, email, phone, city });
            showAlert('Conta criada! Bem-vindo.', 'success');
            setTimeout(() => { window.location.href = 'index.html'; }, 1000);
        } else {
            btn.innerText = 'Entrando...';
            const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
            if (error) { showAlert('E-mail ou senha incorretos.', 'error'); btn.disabled = false; btn.innerText = 'Entrar'; return; }

            // Verifica forced password reset
            if (data.user.app_metadata?.must_reset_password) {
                window.location.href = 'reset-password.html'; return;
            }

            // Busca perfil para salvar dados não-sensíveis no localStorage
            const { data: profile } = await supabase.from('customers').select('name, phone, city').eq('auth_id', data.user.id).single();
            saveCustomerSession(data.user, profile || { name: data.user.email });
            window.location.href = 'index.html';
        }
        btn.disabled = false;
    });
</script>
```

- [ ] **Step 2: Verificar**

1. Abrir `login.html` no browser.
2. Tentar login com credenciais válidas → deve redirecionar para `index.html`.
3. Tentar login com senha errada → deve mostrar alerta de erro.
4. Verificar no Supabase Dashboard → Authentication → Users que o usuário aparece.

- [ ] **Step 3: Commit**

```bash
git add login.html
git commit -m "feat: login de clientes migrado para Supabase Auth"
```

---

### Task 7: Atualizar `cadastro.html` — remover Firebase, usar Supabase Auth

**Files:**
- Modify: `cadastro.html`

- [ ] **Step 1: Substituir o bloco `<script type="module">` inteiro**

Localizar o bloco iniciando em:
```html
<script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
```

Substituir o bloco completo por:

```html
<script type="module">
    import { supabase } from './js/supabase-client.js';
    import { saveCustomerSession } from './js/auth.js';

    const form = document.getElementById('registerForm');
    const btnSubmit = document.getElementById('btnSubmit');

    function showError(el, errorId) {
        el.classList.add('invalid');
        const errEl = document.getElementById(errorId);
        if (errEl) errEl.style.display = 'block';
    }
    function hideError(el, errorId) {
        el.classList.remove('invalid');
        const errEl = document.getElementById(errorId);
        if (errEl) errEl.style.display = 'none';
    }

    // Carrega cidades
    const citySelect = document.getElementById('regCity');
    if (citySelect) {
        const { data: cities } = await supabase.from('cities').select('*');
        if (cities) {
            cities.sort((a, b) => a.name.localeCompare(b.name));
            citySelect.innerHTML = '<option value="">Selecione sua cidade...</option>' +
                cities.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
        }
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        let isValid = true;

        const name  = document.getElementById('regName');
        const email = document.getElementById('regEmail');
        const phone = document.getElementById('regPhone');
        const pass  = document.getElementById('regPass');
        const city  = citySelect?.value || '';

        if (name.value.trim().length < 3)  { showError(name,  'nameError');  isValid = false; } else hideError(name,  'nameError');
        if (!email.value.includes('@'))     { showError(email, 'emailError'); isValid = false; } else hideError(email, 'emailError');
        if (phone.value.trim().length < 8)  { showError(phone, 'phoneError'); isValid = false; } else hideError(phone, 'phoneError');
        if (pass.value.length < 6)          { showError(pass,  'passError');  isValid = false; } else hideError(pass,  'passError');
        if (!isValid) return;

        btnSubmit.disabled = true;
        btnSubmit.innerText = 'Criando conta...';

        const { data, error } = await supabase.auth.signUp({
            email: email.value.trim(),
            password: pass.value.trim(),
            options: { data: { name: name.value.trim(), phone: phone.value.trim(), city } }
        });

        if (error) {
            alert(error.message === 'User already registered'
                ? 'Este e-mail já está cadastrado. Faça login.'
                : 'Erro ao criar conta. Tente novamente.');
            btnSubmit.disabled = false;
            btnSubmit.innerText = 'Criar conta';
            return;
        }

        // Insere perfil
        await supabase.from('customers').insert([{
            auth_id: data.user.id,
            name: name.value.trim(),
            email: email.value.trim(),
            phone: phone.value.trim(),
            city,
            createdAt: new Date().toISOString()
        }]);

        saveCustomerSession(data.user, {
            name: name.value.trim(),
            email: email.value.trim(),
            phone: phone.value.trim(),
            city
        });

        alert('Conta criada com sucesso! Bem-vindo.');
        window.location.href = 'index.html';
    });
</script>
```

- [ ] **Step 2: Verificar**

1. Abrir `cadastro.html` no browser.
2. Criar uma conta de teste.
3. Verificar no Supabase Dashboard → Authentication → Users que o usuário foi criado.
4. Verificar no Table Editor → `customers` que o perfil foi inserido com `auth_id` preenchido.

- [ ] **Step 3: Commit**

```bash
git add cadastro.html
git commit -m "feat: registro de clientes migrado para Supabase Auth (remove Firebase)"
```

---

### Task 8: Atualizar `login-vendedor.html` — Supabase Auth para lojistas

**Files:**
- Modify: `login-vendedor.html`

- [ ] **Step 1: Substituir o bloco `<script type="module">` inteiro**

Localizar o bloco iniciando em:
```html
<script type="module">
    import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

    const supabaseUrl = 'https://mvhqsiyalupodrtsfncj.supabase.co';
    const supabaseKey = 'sb_publishable_K_tmqPg95RJlCCzwRZln4Q_kmfrUw0G'; 
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (localStorage.getItem('loggedStore')) {
```

Substituir o bloco completo por:

```html
<script type="module">
    import { supabase } from './js/supabase-client.js';
    import { saveStoreSession } from './js/auth.js';

    const { data: { session: existingSession } } = await supabase.auth.getSession();
    if (existingSession && existingSession.user.app_metadata?.role === 'store') {
        window.location.href = 'vendedor.html';
    }

    const form    = document.getElementById('login-form');
    const btnLogin = document.getElementById('btn-login');

    function showAlert(msg, type) {
        const alertBox = document.getElementById('alert-msg');
        alertBox.innerText = msg;
        alertBox.className = type === 'error' ? 'alert-box alert-error' : 'alert-box alert-success';
        alertBox.style.display = 'block';
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const pass  = document.getElementById('pass').value.trim();
        if (!email || !pass) { showAlert('❌ Preencha todos os campos.', 'error'); return; }

        btnLogin.disabled = true;
        btnLogin.innerText = 'Autenticando...';

        const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });

        if (error || data.user.app_metadata?.role !== 'store') {
            showAlert('❌ E-mail ou senha incorretos.', 'error');
            btnLogin.disabled = false; btnLogin.innerText = 'Entrar no Painel'; return;
        }

        if (data.user.app_metadata?.must_reset_password) {
            window.location.href = 'reset-password.html'; return;
        }

        const { data: profile } = await supabase.from('stores').select('id, name, city, pixKey, dueDate, isActive').eq('auth_id', data.user.id).single();

        if (!profile || profile.isActive === false) {
            await supabase.auth.signOut();
            showAlert('⚠️ Loja suspensa. Entre em contato com a administração.', 'error');
            btnLogin.disabled = false; btnLogin.innerText = 'Entrar no Painel'; return;
        }

        saveStoreSession(data.user, profile);
        showAlert('✅ Login efetuado! Redirecionando...', 'success');
        setTimeout(() => { window.location.href = 'vendedor.html'; }, 800);
    });
</script>
```

- [ ] **Step 2: Verificar**

1. Fazer login com um lojista existente (após executar a migração da Task 4 e o usuário ter redefinido a senha).
2. Verificar que `localStorage.getItem('loggedStore')` NÃO contém a senha.

- [ ] **Step 3: Commit**

```bash
git add login-vendedor.html
git commit -m "feat: login de lojistas migrado para Supabase Auth"
```

---

### Task 9: Atualizar `login-entregador.html` e `cadastroestabelecimento.html` — remover Firebase

**Files:**
- Modify: `login-entregador.html`
- Modify: `cadastroestabelecimento.html`

- [ ] **Step 1: Substituir o script em `login-entregador.html`**

Localizar o bloco iniciando em:
```html
<script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
```

Substituir o bloco completo por:

```html
<script type="module">
    import { supabase } from './js/supabase-client.js';
    import { saveDriverSession } from './js/auth.js';

    const { data: { session: existingSession } } = await supabase.auth.getSession();
    if (existingSession && existingSession.user.app_metadata?.role === 'driver') {
        window.location.href = 'entregador.html';
    }

    function showAlert(msg, type) {
        const alertBox = document.getElementById('alert-msg');
        alertBox.innerText = msg;
        alertBox.className = type === 'error' ? 'alert-box alert-error' : 'alert-box alert-success';
        alertBox.style.display = 'block';
        if (type === 'error') setTimeout(() => { alertBox.style.display = 'none'; }, 4000);
    }

    const form    = document.getElementById('login-form');
    const btnLogin = document.getElementById('btn-login');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const pass  = document.getElementById('pass').value.trim();
        if (!email || !pass) { showAlert('❌ Preencha todos os campos.', 'error'); return; }

        btnLogin.disabled = true; btnLogin.innerText = 'Verificando...';

        const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });

        if (error || data.user.app_metadata?.role !== 'driver') {
            showAlert('❌ E-mail ou senha incorretos.', 'error');
            document.getElementById('pass').value = '';
            btnLogin.disabled = false; btnLogin.innerText = 'Entrar'; return;
        }

        if (data.user.app_metadata?.must_reset_password) {
            window.location.href = 'reset-password.html'; return;
        }

        const { data: profile } = await supabase.from('drivers').select('id, name, city, isActive').eq('auth_id', data.user.id).single();

        if (!profile || profile.isActive === false) {
            await supabase.auth.signOut();
            showAlert('⚠️ Acesso bloqueado pelo administrador.', 'error');
            btnLogin.disabled = false; btnLogin.innerText = 'Entrar'; return;
        }

        saveDriverSession(data.user, profile);
        showAlert('✅ Login efetuado! Redirecionando...', 'success');
        setTimeout(() => { window.location.href = 'entregador.html'; }, 800);
    });
</script>
```

- [ ] **Step 2: Atualizar `cadastroestabelecimento.html`**

Localizar o bloco `<script type="module">` com `initializeApp` do Firebase e substituir por:

```html
<script type="module">
    import { supabase } from './js/supabase-client.js';
    import { saveStoreSession } from './js/auth.js';

    // Carrega cidades
    const citySelect = document.getElementById('storeCity');
    if (citySelect) {
        const { data: cities } = await supabase.from('cities').select('*');
        if (cities) {
            cities.sort((a, b) => a.name.localeCompare(b.name));
            citySelect.innerHTML = '<option value="">Selecione a cidade...</option>' +
                cities.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
        }
    }

    const form    = document.getElementById('registerForm') || document.querySelector('form');
    const btnSubmit = document.getElementById('btnSubmit');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name    = document.getElementById('storeName')?.value?.trim();
        const email   = document.getElementById('storeEmail')?.value?.trim();
        const pass    = document.getElementById('storePass')?.value?.trim();
        const phone   = document.getElementById('storePhone')?.value?.trim();
        const doc     = document.getElementById('storeDoc')?.value?.trim();
        const city    = citySelect?.value;

        if (!name || !email || !pass || pass.length < 6) {
            alert('Preencha todos os campos. Senha mínima: 6 caracteres.');
            return;
        }

        btnSubmit.disabled = true;
        btnSubmit.innerText = 'Criando loja...';

        const { data, error } = await supabase.auth.signUp({
            email, password: pass,
            options: { data: { name, role_intent: 'store' } }
        });

        if (error) {
            alert(error.message === 'User already registered' ? 'E-mail já cadastrado.' : 'Erro ao criar conta.');
            btnSubmit.disabled = false; btnSubmit.innerText = 'Criar conta';
            return;
        }

        // Insere perfil da loja
        await supabase.from('stores').insert([{
            auth_id: data.user.id,
            name, email, phone, doc, city,
            isActive: false, // loja fica pendente de aprovação admin
            createdAt: new Date().toISOString()
        }]);

        // Admin precisa atribuir o role 'store' manualmente via Dashboard
        // ou via função admin que será criada no painel

        alert('Cadastro enviado! Aguarde aprovação do administrador.');
        window.location.href = 'index.html';
    });
</script>
```

- [ ] **Step 3: Verificar ambos os arquivos**

Abrir cada página no browser, confirmar sem erros no console e sem imports do Firebase.

- [ ] **Step 4: Commit**

```bash
git add login-entregador.html cadastroestabelecimento.html
git commit -m "feat: login entregador e cadastro loja migrados para Supabase Auth (remove Firebase)"
```

---

### Task 10: Simplificar `loginadm.html` — remover verificação dupla com sessionStorage

**Files:**
- Modify: `loginadm.html`

- [ ] **Step 1: Substituir o bloco `<script type="module">`**

Localizar o script atual (que usa `sessionStorage.getItem('adminAuth')`) e substituir por:

```html
<script type="module">
    import { supabase } from './js/supabase-client.js';

    // Redireciona se já for admin logado
    const { data: { session } } = await supabase.auth.getSession();
    if (session && session.user.app_metadata?.role === 'admin') {
        window.location.href = 'adm.html';
    }

    const errorMsg = document.getElementById('error-message');
    const showError = (msg) => {
        errorMsg.innerText = msg;
        errorMsg.style.display = 'block';
        document.getElementById('btn-login').innerText = 'Entrar no Painel';
        document.getElementById('btn-login').disabled = false;
    };

    document.getElementById('btn-login').addEventListener('click', async () => {
        const email = document.getElementById('adm-email').value.trim();
        const pass  = document.getElementById('adm-pass').value.trim();
        const btn   = document.getElementById('btn-login');

        if (!email || !pass) return showError('Preencha todos os campos.');
        btn.innerText = 'Autenticando...';
        btn.disabled = true;
        errorMsg.style.display = 'none';

        const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });

        if (error || data.user.app_metadata?.role !== 'admin') {
            return showError('E-mail ou senha incorretos.');
        }

        window.location.href = 'adm.html';
    });
</script>
```

- [ ] **Step 2: Verificar**

Login admin deve funcionar normalmente. Verificar que o `sessionStorage` não é mais usado.

- [ ] **Step 3: Commit**

```bash
git add loginadm.html
git commit -m "fix: simplificar guard de admin — remover sessionStorage dupla"
```

---

## LAYER 2 — RLS e Segurança do Banco

---

### Task 11: Aplicar políticas RLS no banco

**Files:**
- No dashboard Supabase → SQL Editor

- [ ] **Step 1: Executar no SQL Editor**

```sql
-- Habilita RLS em todas as tabelas
ALTER TABLE customers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons         ENABLE ROW LEVEL SECURITY;
ALTER TABLE products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_alerts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE banners         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsors        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;

-- CUSTOMERS: só o dono lê e edita o próprio perfil
CREATE POLICY "customers_select_own" ON customers
    FOR SELECT USING (auth_id = auth.uid());
CREATE POLICY "customers_update_own" ON customers
    FOR UPDATE USING (auth_id = auth.uid());
CREATE POLICY "customers_insert_own" ON customers
    FOR INSERT WITH CHECK (auth_id = auth.uid());
CREATE POLICY "admin_customers_all" ON customers
    FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- STORES: leitura pública (catálogo), escrita só da loja dona ou admin
CREATE POLICY "stores_select_public" ON stores
    FOR SELECT USING (true);
CREATE POLICY "stores_update_own" ON stores
    FOR UPDATE USING (
        auth_id = auth.uid() OR
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );
CREATE POLICY "admin_stores_insert_delete" ON stores
    FOR INSERT WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- DRIVERS: só o próprio entregador ou admin
CREATE POLICY "drivers_select_own_or_admin" ON drivers
    FOR SELECT USING (
        auth_id = auth.uid() OR
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );
CREATE POLICY "drivers_update_own" ON drivers
    FOR UPDATE USING (auth_id = auth.uid());
CREATE POLICY "admin_drivers_all" ON drivers
    FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ORDERS: leitura para quem criou, para a loja ou entregador do pedido
CREATE POLICY "orders_select" ON orders
    FOR SELECT USING (
        customer_auth_id = auth.uid() OR
        store_auth_id    = auth.uid() OR
        driver_auth_id   = auth.uid() OR
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );
CREATE POLICY "orders_insert_authenticated" ON orders
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "orders_update_store_driver" ON orders
    FOR UPDATE USING (
        store_auth_id  = auth.uid() OR
        driver_auth_id = auth.uid() OR
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

-- PRODUCTS: leitura pública, escrita só da loja dona
CREATE POLICY "products_select_public" ON products
    FOR SELECT USING (true);
CREATE POLICY "products_write_own_store" ON products
    FOR ALL USING (
        store_id IN (SELECT id FROM stores WHERE auth_id = auth.uid()) OR
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

-- COUPONS: leitura para autenticados, escrita só admin
CREATE POLICY "coupons_select_authenticated" ON coupons
    FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin_coupons_all" ON coupons
    FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- TABELAS PÚBLICAS: leitura pública, escrita só admin
CREATE POLICY "global_alerts_read"  ON global_alerts   FOR SELECT USING (true);
CREATE POLICY "banners_read"        ON banners          FOR SELECT USING (true);
CREATE POLICY "sponsors_read"       ON sponsors         FOR SELECT USING (true);
CREATE POLICY "cities_read"         ON cities           FOR SELECT USING (true);
CREATE POLICY "settings_read"       ON global_settings  FOR SELECT USING (true);
CREATE POLICY "admin_alerts_write"  ON global_alerts    FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_banners_write" ON banners          FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_sponsors_write" ON sponsors        FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_cities_write"  ON cities           FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "admin_settings_write" ON global_settings FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```

- [ ] **Step 2: Criar função PL/pgSQL para validação atômica de cupons**

```sql
-- ATENÇÃO: O projeto usa colunas camelCase no Supabase (ex: usedCount, usageLimit).
-- Verifique os nomes reais das colunas em: Dashboard → Table Editor → coupons
-- Ajuste os nomes entre aspas duplas se forem diferentes do mostrado abaixo.
CREATE OR REPLACE FUNCTION validate_and_reserve_coupon(
    p_code     TEXT,
    p_store_id TEXT,
    p_subtotal NUMERIC
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_coupon  RECORD;
    v_discount NUMERIC := 0;
BEGIN
    -- Nomes de coluna entre aspas para preservar camelCase do Supabase
    SELECT * INTO v_coupon
    FROM coupons
    WHERE code = p_code
      AND active = true
      AND ("storeId" IS NULL OR "storeId" = p_store_id)
      AND ("expiresAt" IS NULL OR "expiresAt" > now())
    FOR UPDATE; -- lock de linha para evitar race condition TOCTOU

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cupom inválido ou expirado';
    END IF;

    IF v_coupon."usageLimit" IS NOT NULL AND COALESCE(v_coupon."usedCount", 0) >= v_coupon."usageLimit" THEN
        RAISE EXCEPTION 'Cupom esgotado';
    END IF;

    -- Calcula desconto
    IF v_coupon.type = 'percent' THEN
        v_discount := ROUND(p_subtotal * (v_coupon.discount / 100.0), 2);
    ELSIF v_coupon.type = 'fixed' THEN
        v_discount := LEAST(v_coupon.discount, p_subtotal);
    END IF;

    -- Incrementa contador atomicamente (sem race condition)
    UPDATE coupons SET "usedCount" = COALESCE("usedCount", 0) + 1 WHERE id = v_coupon.id;

    RETURN json_build_object('coupon_id', v_coupon.id, 'discount_amount', v_discount);
END;
$$;
```

- [ ] **Step 3: Verificar**

No Supabase Dashboard → Authentication → Policies, confirmar que todas as tabelas mostram policies criadas.

Teste rápido — executar no SQL Editor como usuário anônimo simulado:
```sql
-- Deve retornar 0 linhas (RLS bloqueando acesso anon a customers)
SELECT * FROM customers LIMIT 1;
```

- [ ] **Step 4: Salvar SQL e commitar**

```bash
# Salvar o SQL em:
# supabase/migrations/20260520_rls_policies.sql
git add supabase/migrations/20260520_rls_policies.sql
git commit -m "feat: RLS policies em todas as tabelas + função validate_and_reserve_coupon"
```

---

### Task 12: Corrigir XSS em `index.js` com DOMPurify

**Files:**
- Modify: `index.js`

- [ ] **Step 1: Adicionar DOMPurify ao `index.html`**

No `index.html`, antes do `<script type="module" src="index.js">`, adicionar:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js"
        integrity="sha512-dGNsbJYeP5hAO/j9NjHp0Y2KBkx0M3CRaxUKADZfyCT+tXFkXHHRDrz9IQTF2fPKBF0YExBjnXV2l3F2Tg==" 
        crossorigin="anonymous"></script>
```

- [ ] **Step 2: Em `index.js`, substituir a função `loadAlerts`**

Localizar:
```js
alertsHtml += `
    <div class="global-alert-card ${typeClass}" id="alert-${alertData.id}">
        <div style="font-size: 1.4rem;">${icon}</div>
        <div class="alert-text">${alertData.text}</div>
        <button class="alert-close" onclick="window.dismissAlert('${alertData.id}')">✕</button>
    </div>
`;
```

Substituir por:

```js
const safeText = DOMPurify.sanitize(alertData.text, { ALLOWED_TAGS: [] }); // texto puro
const safeId   = alertData.id.toString().replace(/[^a-zA-Z0-9_-]/g, '');
alertsHtml += `
    <div class="global-alert-card ${typeClass}" id="alert-${safeId}">
        <div style="font-size: 1.4rem;">${icon}</div>
        <div class="alert-text"></div>
        <button class="alert-close" data-alert-id="${safeId}">✕</button>
    </div>
`;
```

Após `container.innerHTML = alertsHtml;`, adicionar:
```js
// Preenche textos via textContent (XSS-safe)
container.querySelectorAll('.alert-text').forEach((el, i) => {
    el.textContent = alerts[i]?.text || '';
});
container.querySelectorAll('.alert-close').forEach(btn => {
    btn.addEventListener('click', () => window.dismissAlert(btn.dataset.alertId));
});
```

Remover o `onclick="window.dismissAlert(..."` inline da string de template (já substituído acima).

- [ ] **Step 3: Substituir o import do Supabase no topo do `index.js`**

Localizar:
```js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
const supabaseUrl = '...';
const supabaseKey = '...';
const supabase = createClient(supabaseUrl, supabaseKey);
```

Substituir por:
```js
import { supabase } from './js/supabase-client.js';
```

- [ ] **Step 4: Substituir verificação de sessão do cliente no topo de `index.js`**

Localizar:
```js
const loggedCustomer = JSON.parse(localStorage.getItem('loggedCustomer'));
const userEmail = loggedCustomer ? loggedCustomer.email : localStorage.getItem('userEmail');

if (userEmail) {
    supabase.from('customers').select('*').eq('email', userEmail).then(...)
}
```

Substituir por:
```js
const { data: { session } } = await supabase.auth.getSession();
const userEmail = session?.user?.email || localStorage.getItem('userEmail');
const loggedCustomer = JSON.parse(localStorage.getItem('loggedCustomer'));

if (session?.user) {
    supabase.from('customers')
        .select('isSicoob')
        .eq('auth_id', session.user.id)
        .single()
        .then(({ data }) => {
            if (data) {
                isSponsorAssociated = data.isSicoob === true;
                if (userCity) window.renderStores();
            }
        });
}
```

- [ ] **Step 5: Verificar**

Abrir `index.html`, inspecionar os alertas globais no DOM → os textos devem estar em elementos separados via `textContent`, não interpolados no HTML.

Inserir no banco um alerta com texto `<script>alert(1)</script>` e confirmar que ele é exibido como texto literal, sem executar o script.

- [ ] **Step 6: Commit**

```bash
git add index.html index.js
git commit -m "fix: XSS em alertas globais — DOMPurify + textContent"
```

---

### Task 13: Corrigir `adm.js` — remover exibição de senhas e corrigir XSS

**Files:**
- Modify: `adm.js`

- [ ] **Step 1: Substituir o import do Supabase no topo de `adm.js`**

Localizar:
```js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
const supabaseUrl = '...';
const supabaseKey = '...';
const supabase = createClient(supabaseUrl, supabaseKey);
```

Substituir por:
```js
import { supabase } from './js/supabase-client.js';
```

- [ ] **Step 2: Remover exibição de senha nas lojas (linha ~589)**

Localizar:
```js
`<span style="font-size:0.85rem; color:#888;">${s.email} | ${s.password}</span>`
```

Substituir por:
```js
`<span style="font-size:0.85rem; color:#888;"></span>` // senha removida
```

Depois, preencher o email via textContent (para evitar XSS):
```js
// Após o card ser inserido no DOM, preencher email via textContent
const emailSpan = card.querySelector('[data-email]');
if (emailSpan) emailSpan.textContent = s.email;
```

Alternativa mais simples se o template for pequeno: substituir o trecho por:
```js
`<span class="store-email" data-email="${encodeURIComponent(s.email)}"></span>`
```
E adicionar após inserir o HTML:
```js
document.querySelectorAll('.store-email').forEach(el => {
    el.textContent = decodeURIComponent(el.dataset.email);
});
```

- [ ] **Step 3: Remover exibição de senha dos entregadores (linha ~738)**

Localizar:
```js
`✉️ ${d.email} | 🔑 ${d.password}`
```

Substituir por:
```js
`✉️ <span class="driver-email" data-email="${encodeURIComponent(d.email)}"></span>`
```

E adicionar após render:
```js
document.querySelectorAll('.driver-email').forEach(el => {
    el.textContent = decodeURIComponent(el.dataset.email);
});
```

- [ ] **Step 4: Atualizar guard de autenticação no `adm.js` (topo do arquivo)**

Localizar qualquer bloco que verifica `sessionStorage.getItem('adminAuth')` e substituir por:

```js
const { data: { session } } = await supabase.auth.getSession();
if (!session || session.user.app_metadata?.role !== 'admin') {
    window.location.href = 'loginadm.html';
}
```

- [ ] **Step 5: Adicionar DOMPurify ao `adm.html`**

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js"
        integrity="sha512-dGNsbJYeP5hAO/j9NjHp0Y2KBkx0M3CRaxUKADZfyCT+tXFkXHHRDrz9IQTF2fPKBF0YExBjnXV2l3F2Tg==" 
        crossorigin="anonymous"></script>
```

- [ ] **Step 6: Verificar**

Abrir `adm.html`. Confirmar que nenhum card de loja ou entregador exibe a senha. Confirmar que emails são renderizados corretamente via `textContent`.

- [ ] **Step 7: Commit**

```bash
git add adm.html adm.js
git commit -m "fix: remover exibição de senhas no admin + corrigir XSS (adm.js)"
```

---

### Task 14: Atualizar guards de sessão em `perfil.html`, `pedidos.html`, `vendedor.html`

**Files:**
- Modify: `perfil.html`, `pedidos.html`, `vendedor.html`

- [ ] **Step 1: Em cada arquivo, substituir a verificação de sessão baseada em `localStorage`**

Padrão atual (em todos os três arquivos, a localizar):
```js
if (localStorage.getItem('isLogged') !== 'true') {
    window.location.href = 'login.html';
}
// OU:
const loggedStore = JSON.parse(localStorage.getItem('loggedStore'));
if (!loggedStore) { window.location.href = 'login-vendedor.html'; }
```

**Para `perfil.html` e `pedidos.html`** — substituir pela verificação Supabase Auth:
```js
import { requireRole } from './js/auth.js';
const session = await requireRole('customer', 'login.html');
if (!session) return;
const userId = session.user.id;
```

**Para `vendedor.html`** — substituir por:
```js
import { requireRole } from './js/auth.js';
const session = await requireRole('store', 'login-vendedor.html');
if (!session) return;
```

- [ ] **Step 2: Substituir também o import do Supabase em cada arquivo**

Em cada arquivo que tenha:
```js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
const supabaseUrl = '...';
const supabaseKey = '...';
const supabase = createClient(supabaseUrl, supabaseKey);
```

Substituir por:
```js
import { supabase } from './js/supabase-client.js';
```

- [ ] **Step 3: Verificar**

Abrir cada página sem estar logado → deve redirecionar para a página de login correta.
Abrir com sessão ativa → deve mostrar o conteúdo normalmente.

- [ ] **Step 4: Commit**

```bash
git add perfil.html pedidos.html vendedor.html
git commit -m "fix: guards de sessão migrados para Supabase Auth (perfil, pedidos, vendedor)"
```

---

## LAYER 3 — Edge Functions

---

### Task 15: Edge Function `place-order` — cálculo de preço no servidor

**Files:**
- Create: `supabase/functions/place-order/index.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// supabase/functions/place-order/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: cors });

    const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: cors });

    const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let body: any;
    try { body = await req.json(); } catch {
        return new Response(JSON.stringify({ error: "Corpo da requisição inválido" }), { status: 400, headers: cors });
    }

    const { store_id, items, delivery_method, address, coupon_code } = body;
    if (!store_id || !Array.isArray(items) || items.length === 0) {
        return new Response(JSON.stringify({ error: "Dados do pedido inválidos" }), { status: 400, headers: cors });
    }

    // Busca dados da loja (preço de entrega real)
    const { data: store } = await supabaseAdmin
        .from("stores").select("id, name, deliveryFee, minOrder, active, pixKey, auth_id")
        .eq("id", store_id).single();
    if (!store || !store.active) {
        return new Response(JSON.stringify({ error: "Loja indisponível" }), { status: 400, headers: cors });
    }

    // Busca preços reais dos produtos (NUNCA confia em preço do cliente)
    const productIds = items.map((i: any) => i.product_id);
    const { data: products } = await supabaseAdmin
        .from("products").select("id, name, price, active").in("id", productIds).eq("store_id", store_id);
    if (!products || products.length !== productIds.length) {
        return new Response(JSON.stringify({ error: "Um ou mais produtos não encontrados" }), { status: 400, headers: cors });
    }

    // Calcula subtotal com preços do banco
    let subtotal = 0;
    const orderItems = [];
    for (const item of items) {
        const product = products.find((p: any) => p.id === item.product_id);
        if (!product || !product.active) {
            return new Response(JSON.stringify({ error: `Produto ${item.product_id} indisponível` }), { status: 400, headers: cors });
        }
        const qty = Math.max(1, Math.floor(Number(item.qty)));
        subtotal += product.price * qty;
        orderItems.push({ product_id: product.id, name: product.name, price: product.price, qty, lineTotal: product.price * qty });
    }

    const deliveryFee = delivery_method === "retirada" ? 0 : Number(store.deliveryFee || 0);

    // Valida cupom atomicamente via função PL/pgSQL
    let discountAmount = 0;
    let couponId = null;
    if (coupon_code) {
        const { data: couponResult, error: couponErr } = await supabaseAdmin
            .rpc("validate_and_reserve_coupon", { p_code: coupon_code, p_store_id: store_id, p_subtotal: subtotal });
        if (couponErr) {
            return new Response(JSON.stringify({ error: couponErr.message || "Cupom inválido" }), { status: 400, headers: cors });
        }
        discountAmount = couponResult.discount_amount;
        couponId = couponResult.coupon_id;
    }

    const total = Math.max(0, Number((subtotal + deliveryFee - discountAmount).toFixed(2)));

    // Busca perfil do cliente
    const { data: customer } = await supabaseAdmin
        .from("customers").select("id, name, phone").eq("auth_id", user.id).single();

    // Insere pedido com service_role (bypassa RLS de INSERT)
    const { data: order, error: orderErr } = await supabaseAdmin
        .from("orders").insert([{
            store_id,
            customer_id: customer?.id,
            customer_auth_id: user.id,
            store_auth_id: store.auth_id,
            items: orderItems,
            subtotal,
            delivery_fee: deliveryFee,
            discount: discountAmount,
            coupon_id: couponId,
            total,
            delivery_method: delivery_method || "entrega",
            address,
            status: "Pendente",
            customer_name: customer?.name || user.email,
            customer_phone: customer?.phone || "",
            timestamp: Date.now(),
        }]).select().single();

    if (orderErr) {
        console.error("order insert error:", orderErr);
        return new Response(JSON.stringify({ error: "Erro ao registrar pedido" }), { status: 500, headers: cors });
    }

    return new Response(JSON.stringify({ success: true, order_id: order.id, total, items: orderItems }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" }
    });
});
```

- [ ] **Step 2: Deploy da Edge Function**

No dashboard Supabase → Edge Functions → New Function → nome `place-order` → colar o código.

Ou via CLI:
```bash
npx supabase functions deploy place-order --project-ref mvhqsiyalupodrtsfncj
```

- [ ] **Step 3: Verificar via curl**

```bash
# Substitua SEU_ANON_TOKEN por um JWT válido de um cliente logado
curl -X POST https://mvhqsiyalupodrtsfncj.supabase.co/functions/v1/place-order \
  -H "Authorization: Bearer SEU_ANON_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"store_id":"UUID_DE_UMA_LOJA","items":[{"product_id":"UUID_PRODUTO","qty":1}],"delivery_method":"entrega","address":{"rua":"Rua Teste","num":"1"}}'
```

Esperado: `{ "success": true, "order_id": "...", "total": X.XX }` sem incluir o `total` enviado pelo cliente.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/place-order/index.ts
git commit -m "feat: edge function place-order — cálculo de preço no servidor"
```

---

### Task 16: Atualizar `carrinho.html` — chamar Edge Function `place-order`

**Files:**
- Modify: `carrinho.html`

- [ ] **Step 1: Substituir o import do Supabase**

Localizar:
```js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
const supabaseUrl = '...'; const supabaseKey = '...';
const supabase = createClient(supabaseUrl, supabaseKey);
```

Substituir por:
```js
import { supabase } from './js/supabase-client.js';
```

- [ ] **Step 2: Substituir o bloco de finalização do pedido**

Localizar o bloco:
```js
const newOrder = {
    id: generateId(),
    ...
    total: finalTotal,
    ...
};
try {
    await supabase.from('orders').insert([newOrder]);
    if (appliedCoupon && appliedCoupon.id) {
        const { data: cData } = await supabase.from('coupons')...
        await supabase.from('coupons').update(...)...
    }
    localStorage.removeItem('cart');
    ...
```

Substituir por:

```js
// Monta o payload — sem enviar total (servidor calcula)
const orderPayload = {
    store_id: cart[0].storeId,
    items: cart.map(item => ({
        product_id: item.productId || item.id,
        qty: item.qty || item.quantity || 1
    })),
    delivery_method: currentMethod,
    address: {
        rua:    document.getElementById('end-rua')?.value?.trim()    || '',
        num:    document.getElementById('end-num')?.value?.trim()    || '',
        bairro: document.getElementById('end-bairro')?.value?.trim() || '',
        cidade: document.getElementById('end-cidade')?.value?.trim() || '',
        comp:   document.getElementById('end-comp')?.value?.trim()   || '',
    },
    coupon_code: appliedCoupon?.code || null
};

try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { alert('Faça login para finalizar o pedido.'); window.location.href = 'login.html'; return; }

    const response = await supabase.functions.invoke('place-order', { body: orderPayload });

    if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || response.error?.message || 'Erro ao registrar pedido');
    }

    localStorage.removeItem('cart');
    sessionStorage.removeItem('appliedCoupon');

    alert('Pedido realizado com sucesso! A loja já foi notificada.');
    window.location.href = 'pedidos.html';

} catch (error) {
    console.error('Erro ao finalizar pedido:', error);
    alert('Ocorreu um erro: ' + error.message);
    btn.innerHTML = `<span>Confirmar Pedido</span><span id="btn-checkout-total">R$ ${finalTotal.toFixed(2)}</span>`;
    btn.disabled = false;
}
```

- [ ] **Step 3: Remover `generateId` do arquivo**

Localizar e remover:
```js
const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
```

- [ ] **Step 4: Verificar**

1. Adicionar um produto ao carrinho.
2. Finalizar o pedido.
3. Confirmar no Supabase Dashboard → Table Editor → `orders` que o pedido foi inserido com o `total` calculado pelo servidor, não pelo cliente.

- [ ] **Step 5: Commit**

```bash
git add carrinho.html
git commit -m "feat: carrinho usa edge function place-order (total calculado no servidor)"
```

---

### Task 17: Edge Function `apply-coupon` — preview de desconto

**Files:**
- Create: `supabase/functions/apply-coupon/index.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// supabase/functions/apply-coupon/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ valid: false, reason: "Não autorizado" }), { status: 401, headers: cors });

    const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return new Response(JSON.stringify({ valid: false, reason: "Não autorizado" }), { status: 401, headers: cors });

    const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { coupon_code, store_id, subtotal } = await req.json();

    const { data: coupon } = await supabaseAdmin
        .from("coupons")
        .select("*")
        .eq("code", coupon_code)
        .eq("active", true)
        .single();

    // Nomes de coluna camelCase (padrão do projeto)
    if (!coupon) return new Response(JSON.stringify({ valid: false, reason: "Cupom não encontrado" }), { headers: cors });
    if (coupon.storeId && coupon.storeId !== store_id) return new Response(JSON.stringify({ valid: false, reason: "Cupom não válido para esta loja" }), { headers: cors });
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return new Response(JSON.stringify({ valid: false, reason: "Cupom expirado" }), { headers: cors });
    if (coupon.usageLimit && (coupon.usedCount || 0) >= coupon.usageLimit) return new Response(JSON.stringify({ valid: false, reason: "Cupom esgotado" }), { headers: cors });

    let discount = 0;
    if (coupon.type === 'percent') discount = Number((subtotal * (coupon.discount / 100.0)).toFixed(2));
    else if (coupon.type === 'fixed') discount = Math.min(coupon.discount, subtotal);

    return new Response(JSON.stringify({
        valid: true,
        coupon_id: coupon.id,
        discount,
        final_total: Number((subtotal - discount).toFixed(2))
    }), { headers: { ...cors, "Content-Type": "application/json" } });
});
```

- [ ] **Step 2: Deploy**

Dashboard → Edge Functions → New Function → nome `apply-coupon`.

- [ ] **Step 3: Atualizar `carrinho.html` para usar essa Edge Function no preview de cupom**

Localizar o bloco que valida o cupom diretamente no front (ex: `supabase.from('coupons').select(...).eq('code', couponCode)`).

Substituir por:
```js
const response = await supabase.functions.invoke('apply-coupon', {
    body: { coupon_code: couponCode, store_id: cart[0].storeId, subtotal: subtotalStore }
});
if (response.data?.valid) {
    appliedCoupon = { id: response.data.coupon_id, code: couponCode };
    discountAmount = response.data.discount;
    updateTotalsDisplay();
    showCouponSuccess(`Cupom aplicado! Desconto: R$ ${discountAmount.toFixed(2)}`);
} else {
    showCouponError(response.data?.reason || 'Cupom inválido');
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/apply-coupon/index.ts carrinho.html
git commit -m "feat: edge function apply-coupon + integração no carrinho"
```

---

### Task 18: Edge Function `notify` + Database Webhook

**Files:**
- Create: `supabase/functions/notify/index.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// supabase/functions/notify/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ONESIGNAL_APP_ID      = Deno.env.get("ONESIGNAL_APP_ID") ?? "";
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY") ?? "";

serve(async (req) => {
    const payload = await req.json(); // payload do Database Webhook
    const record = payload.record; // novo pedido inserido

    if (!record || payload.type !== "INSERT") {
        return new Response("Ignored", { status: 200 });
    }

    const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Busca entregadores disponíveis na mesma cidade
    const storeCity = record.address?.cidade || "";
    const { data: drivers } = await supabaseAdmin
        .from("drivers")
        .select("onesignal_player_id")
        .eq("available", true)
        .not("onesignal_player_id", "is", null);

    const playerIds = (drivers ?? [])
        .map((d: any) => d.onesignal_player_id)
        .filter(Boolean);

    if (playerIds.length === 0) return new Response("No drivers", { status: 200 });

    // Envia via OneSignal
    await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${ONESIGNAL_REST_API_KEY}`
        },
        body: JSON.stringify({
            app_id: ONESIGNAL_APP_ID,
            include_player_ids: playerIds,
            headings: { pt: "Novo pedido disponível!" },
            contents: { pt: `Pedido de ${record.customer_name} — R$ ${Number(record.total).toFixed(2)}` },
            data: { order_id: record.id }
        })
    });

    return new Response("Notified", { status: 200 });
});
```

- [ ] **Step 2: Configurar variáveis de ambiente no Supabase**

Dashboard → Edge Functions → Secrets → adicionar:
- `ONESIGNAL_APP_ID` = App ID do OneSignal
- `ONESIGNAL_REST_API_KEY` = REST API Key do OneSignal

- [ ] **Step 3: Deploy**

Dashboard → Edge Functions → New Function → nome `notify`.

- [ ] **Step 4: Configurar Database Webhook**

Dashboard → Database → Webhooks → Create a new hook:
- Name: `notify-on-new-order`
- Table: `orders`
- Events: INSERT
- HTTP Request: POST
- URL: `https://mvhqsiyalupodrtsfncj.supabase.co/functions/v1/notify`
- Headers: `Authorization: Bearer SERVICE_ROLE_KEY`

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/notify/index.ts
git commit -m "feat: edge function notify + database webhook para novos pedidos"
```

---

## LAYER 4 — Remoção Total do Firebase

---

### Task 19: Criar tabela `products` no Supabase e migrar `vendedor.js`

**Files:**
- SQL no dashboard (tabela já criada no Task 3, adicionar índices)
- Modify: `vendedor.js`

- [ ] **Step 1: Adicionar índice de performance na tabela products**

```sql
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(store_id, active);
```

- [ ] **Step 2: Substituir imports Firebase no topo de `vendedor.js`**

Localizar:
```js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, ... } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
const firebaseConfig = { apiKey: "AIzaSyBinV28T4xWvYAnE0Yed1rbsp9dEF_n7Eg", ... };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
```

Substituir por:
```js
import { supabase } from './js/supabase-client.js';
import { requireRole } from './js/auth.js';

const session = await requireRole('store', 'login-vendedor.html');
if (!session) throw new Error('Not authenticated');

const { data: storeProfile } = await supabase
    .from('stores')
    .select('id, name, city, deliveryFee, pixKey, dueDate')
    .eq('auth_id', session.user.id)
    .single();

const storeId = storeProfile?.id;
```

- [ ] **Step 3: Substituir operações Firestore de PRODUTOS por Supabase**

Para cada operação de produto com Firebase (addDoc, updateDoc, deleteDoc, getDocs), substituir pelo equivalente Supabase:

**Adicionar produto:**
```js
// Antes (Firebase):
await addDoc(collection(db, 'stores', storeId, 'products'), productData);

// Depois (Supabase):
await supabase.from('products').insert([{ ...productData, store_id: storeId }]);
```

**Buscar produtos da loja:**
```js
// Antes (Firebase):
const q = query(collection(db, 'stores', storeId, 'products'));
const snap = await getDocs(q);
snap.forEach(doc => { ... });

// Depois (Supabase):
const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .eq('active', true);
```

**Atualizar produto:**
```js
// Antes (Firebase):
await updateDoc(doc(db, 'stores', storeId, 'products', productId), updates);

// Depois (Supabase):
await supabase.from('products').update(updates).eq('id', productId).eq('store_id', storeId);
```

**Deletar produto:**
```js
// Antes (Firebase):
await deleteDoc(doc(db, 'stores', storeId, 'products', productId));

// Depois (Supabase):
await supabase.from('products').update({ active: false }).eq('id', productId).eq('store_id', storeId);
```

- [ ] **Step 4: Substituir listener de pedidos em tempo real (Firebase → Supabase Realtime)**

Localizar o `onSnapshot` que ouve novos pedidos para a loja:
```js
// Antes (Firebase):
onSnapshot(query(collection(db, 'orders'), where('storeId', '==', storeId)), (snap) => {
    snap.docChanges().forEach(change => { if (change.type === 'added') renderOrder(change.doc.data()); });
});
```

Substituir por:
```js
// Depois (Supabase Realtime):
supabase
    .channel(`store-orders-${storeId}`)
    .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'orders',
        filter: `store_id=eq.${storeId}`
    }, (payload) => {
        renderOrder(payload.new);
    })
    .subscribe();

// Carga inicial de pedidos
const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('store_id', storeId)
    .order('timestamp', { ascending: false })
    .limit(50);
orders?.forEach(renderOrder);
```

- [ ] **Step 5: Verificar**

1. Abrir `vendedor.html` com um lojista logado.
2. Adicionar um produto → deve aparecer na lista.
3. Abrir outra aba no browser como cliente, fazer um pedido → deve aparecer em tempo real no painel do lojista.
4. Confirmar zero erros de Firebase no console.

- [ ] **Step 6: Commit**

```bash
git add vendedor.js
git commit -m "feat: vendedor.js migrado para Supabase (produtos + realtime orders, remove Firebase)"
```

---

### Task 20: Atualizar `loja.html` — ler produtos do Supabase

**Files:**
- Modify: `loja.html`

- [ ] **Step 1: Substituir imports Firebase e queries de produtos**

Localizar qualquer `import` do Firebase e `getDocs(collection(db, 'stores', storeId, 'products')...)`.

Substituir por:
```js
import { supabase } from './js/supabase-client.js';

// Busca produtos da loja
const storeId = new URLSearchParams(window.location.search).get('id');
const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .eq('active', true);
```

- [ ] **Step 2: Verificar**

Abrir `loja.html?id=UUID_DE_UMA_LOJA` no browser. Produtos devem carregar do Supabase.

- [ ] **Step 3: Commit**

```bash
git add loja.html
git commit -m "feat: loja.html lê produtos do Supabase (remove Firebase)"
```

---

### Task 21: Migrar `entregador.html` — Firebase completo → Supabase + OneSignal

**Files:**
- Modify: `entregador.html`

- [ ] **Step 1: Substituir o bloco completo de imports Firebase + FCM**

Localizar:
```js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, ... } from "https://www.gstatic.com/firebasejs/...";
import { getMessaging, getToken, ... } from "https://www.gstatic.com/firebasejs/.../firebase-messaging.js";
const firebaseConfig = { apiKey: "AIzaSyBinV28T4xWvYAnE0Yed1rbsp9dEF_n7Eg", ... };
```

Remover completamente esse bloco e substituir por:
```js
import { supabase } from './js/supabase-client.js';
import { requireRole } from './js/auth.js';

const session = await requireRole('driver', 'login-entregador.html');
if (!session) throw new Error('Not authenticated');

const { data: driverProfile } = await supabase
    .from('drivers')
    .select('id, name, city, available, onesignal_player_id')
    .eq('auth_id', session.user.id)
    .single();

const driverId = driverProfile?.id;
```

- [ ] **Step 2: Adicionar OneSignal SDK ao `<head>` do `entregador.html`**

```html
<script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer></script>
<script>
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    OneSignalDeferred.push(async function(OneSignal) {
        await OneSignal.init({ appId: "SEU_ONESIGNAL_APP_ID" });
        const playerId = await OneSignal.User.PushSubscription.id;
        if (playerId) {
            // Salva o player_id no perfil do entregador para receber notificações
            import('./js/supabase-client.js').then(({ supabase }) => {
                supabase.auth.getSession().then(({ data: { session } }) => {
                    if (session) {
                        supabase.from('drivers')
                            .update({ onesignal_player_id: playerId })
                            .eq('auth_id', session.user.id);
                    }
                });
            });
        }
    });
</script>
```

- [ ] **Step 3: Substituir listener de pedidos Firebase por Supabase Realtime**

Localizar o `onSnapshot` que ouve novos pedidos para o entregador:

```js
// Antes (Firebase):
onSnapshot(query(collection(db, 'orders'), where('status', '==', 'Aceito'), where('city', '==', driverCity)), ...)

// Depois (Supabase Realtime):
supabase
    .channel('driver-available-orders')
    .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'orders',
        filter: `status=eq.Pendente`
    }, (payload) => {
        if (payload.new.address?.cidade === driverProfile.city) {
            renderNewOrder(payload.new);
        }
    })
    .subscribe();
```

- [ ] **Step 4: Substituir GPS broadcast Firebase por Supabase Realtime Broadcast**

Localizar o código que envia localização GPS via Firestore:
```js
// Antes (Firebase):
updateDoc(doc(db, 'drivers', driverId), { lat: position.coords.latitude, lng: position.coords.longitude });

// Depois (Supabase Broadcast — sem persistir no banco):
supabase
    .channel(`driver-location-${driverId}`)
    .send({
        type: 'broadcast',
        event: 'location',
        payload: { lat: position.coords.latitude, lng: position.coords.longitude, driverId }
    });
```

- [ ] **Step 5: Verificar**

1. Abrir `entregador.html` com um entregador logado.
2. Confirmar zero imports de Firebase no console.
3. Confirmar que o OneSignal SDK carrega (verificar no browser console `OneSignal.initialized`).
4. Verificar que quando um pedido é feito via `carrinho.html`, o entregador recebe a notificação em tempo real.

- [ ] **Step 6: Commit**

```bash
git add entregador.html
git commit -m "feat: entregador.html migrado para Supabase Auth + Realtime + OneSignal (remove Firebase)"
```

---

### Task 22: Migrar `monitoramento.html`, `painel-parceiro.html`, `email.html`

**Files:**
- Modify: `monitoramento.html`, `painel-parceiro.html`, `email.html`

- [ ] **Step 1: `monitoramento.html` — substituir Firebase por Supabase Realtime**

Localizar imports do Firebase e `onSnapshot`. Substituir o padrão:
```js
// Antes: onSnapshot para monitorar pedidos
import { getFirestore, collection, onSnapshot } from "...firestore...";

// Depois:
import { supabase } from './js/supabase-client.js';

supabase
    .channel('monitoring-orders')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        handleOrderUpdate(payload.new, payload.eventType);
    })
    .subscribe();

// Carga inicial
const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(100);
orders?.forEach(o => handleOrderUpdate(o, 'INITIAL'));
```

- [ ] **Step 2: `painel-parceiro.html` — substituir Firebase por Supabase**

Localizar todos os imports do Firebase. Substituir queries Firestore por queries Supabase equivalentes. Padrão:
```js
// Antes:
getDocs(collection(db, 'orders'), where('partnerId', '==', id))

// Depois:
supabase.from('orders').select('*').eq('partner_id', id)
```

- [ ] **Step 3: `email.html` — verificar e substituir**

Se `email.html` usar Firebase apenas para ler dados de configuração, substituir por:
```js
import { supabase } from './js/supabase-client.js';
// Buscar template/configs do Supabase (tabela global_settings ou similar)
const { data } = await supabase.from('global_settings').select('*');
```

Se `email.html` não for mais necessário (era para enviar emails via Firebase Functions), avaliar se pode ser removido ou substituído por uma Edge Function `send-email`.

- [ ] **Step 4: Verificar os três arquivos**

Abrir cada página no browser e confirmar ausência de imports Firebase no console.

- [ ] **Step 5: Commit**

```bash
git add monitoramento.html painel-parceiro.html email.html
git commit -m "feat: monitoramento, painel-parceiro, email migrados para Supabase (remove Firebase)"
```

---

### Task 23: Remover colunas de senha + auditoria final

**Files:**
- SQL no dashboard Supabase
- Todos os arquivos HTML/JS (auditoria)

- [ ] **Step 1: Executar migration final para remover colunas `password`**

> ATENÇÃO: Execute APENAS após confirmar que TODOS os usuários fizeram o reset de senha e nenhum fluxo de autenticação ainda usa o campo `password` diretamente.

```sql
-- Verifica se ainda há queries usando o campo password (inspecionar logs antes)
-- Depois de confirmar, remover as colunas:
ALTER TABLE customers DROP COLUMN IF EXISTS password;
ALTER TABLE stores    DROP COLUMN IF EXISTS password;
ALTER TABLE drivers   DROP COLUMN IF EXISTS password;
```

Salvar em `supabase/migrations/20260520_drop_password_columns.sql`.

- [ ] **Step 2: Auditoria de segurança — buscar referências remanescentes**

Executar no terminal a partir da pasta do projeto:
```bash
grep -r "firebase" --include="*.html" --include="*.js" -l
grep -r "firebase" --include="*.html" --include="*.js" -i
```

Esperado: zero resultados (ou apenas os arquivos de migração que são só referência documental).

```bash
grep -r "\.password" --include="*.js" --include="*.html"
grep -r "eq('password'" --include="*.js" --include="*.html"
grep -r "password.*==" --include="*.js" --include="*.html"
```

Esperado: zero resultados (nenhuma comparação de senha em query).

```bash
grep -r "Math\.random" --include="*.js" --include="*.html"
```

Esperado: zero resultados (todos os IDs gerados pelo banco com gen_random_uuid).

- [ ] **Step 3: Verificar RLS via Supabase Dashboard**

Dashboard → Authentication → Policies → confirmar que todas as tabelas têm políticas ativas e nenhuma tabela está com `RLS disabled`.

- [ ] **Step 4: Commit final**

```bash
git add supabase/migrations/20260520_drop_password_columns.sql
git commit -m "feat: remover colunas password das tabelas de perfil"
git tag v2.0.0-secure
```

---

## Checklist final de aceitação

- [ ] Nenhuma senha armazenada em texto plano no banco (colunas `password` removidas)
- [ ] Nenhuma senha exibida na interface do admin
- [ ] Login de clientes, lojistas e entregadores usa `supabase.auth.signInWithPassword()`
- [ ] Recuperação de senha envia email com link temporário (Supabase Auth)
- [ ] RLS ativa em todas as tabelas com políticas testadas
- [ ] Total do pedido calculado exclusivamente na Edge Function `place-order`
- [ ] Cupons validados com transação atômica (sem race condition)
- [ ] `grep -ri "firebase" *.html *.js` retorna zero resultados
- [ ] Push notifications funcionando via OneSignal (testar no Android APK Median.co)
- [ ] Supabase Realtime substituindo Firebase Realtime em pedidos e GPS
- [ ] innerHTML sanitizado com DOMPurify ou substituído por textContent
- [ ] `grep -r "eq('password'" *.js *.html` retorna zero resultados
