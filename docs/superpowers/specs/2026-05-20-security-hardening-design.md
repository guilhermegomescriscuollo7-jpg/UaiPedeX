# Spec: UaiPedeX — Security Hardening & Firebase Migration

**Data:** 2026-05-20
**Status:** Aprovado
**Escopo:** Correção completa das vulnerabilidades de segurança + migração total do Firebase para Supabase

---

## Contexto

Auditoria de segurança identificou vulnerabilidades críticas no projeto UaiPedeX (sistema de delivery HTML/JS puro + Supabase + Firebase). As mais graves são:

- Senhas de todos os usuários armazenadas e comparadas em texto plano
- Tabelas Supabase sem RLS — qualquer pessoa com a anon key lê/escreve tudo
- Total do pedido calculado no navegador do cliente (fraude financeira direta)
- Firebase API keys e Supabase anon key expostas em 8+ arquivos
- XSS via innerHTML com dados não sanitizados do banco
- Recuperação de senha sem token seguro (basta saber email + telefone)

O projeto tem usuários reais em produção. A arquitetura é HTML/JS estático + Supabase. O APK Android é gerado via Median.co (WebView wrapper). iOS usa PWA via browser.

---

## Decisões de design

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Arquitetura | HTML/JS + Supabase sem Node.js | Manter simplicidade atual |
| Autenticação | Supabase Auth para todos os tipos | Gerenciamento nativo de senhas com bcrypt |
| Migração de usuários | Forced password reset | Senhas em texto plano não podem ser hasheadas retroativamente |
| Push notifications | OneSignal (integração Median.co) | Remove FCM direto do código; funciona em Android nativo e iOS PWA |
| Realtime | Supabase Realtime channels | Substitui Firebase Realtime DB completamente |
| Lógica de preço | Supabase Edge Functions | Único ponto seguro para cálculo de total e validação de cupons |
| Abordagem | Migração por camadas (4 camadas) | Protege usuários em produção rapidamente sem risco de quebrar tudo |

---

## Arquitetura alvo

```
Browser/APK
  │
  ├── supabase.auth.signInWithPassword() → JWT com role (customer|store|driver|admin)
  │
  ├── supabase.from('table').select()    → RLS valida JWT automaticamente
  │
  ├── supabase.functions.invoke('place-order', { body: { items, store_id, ... } })
  │     └── Edge Function calcula total real, valida cupom, insere pedido
  │
  ├── supabase.channel('orders').on('postgres_changes', ...)  → Realtime
  │
  └── OneSignal SDK → push notifications (Android via Median.co, iOS via PWA)
```

---

## Camada 1 — Autenticação com Supabase Auth

### Modelo de usuários

Todos os usuários são criados em `auth.users` (gerenciado pelo Supabase). O campo `raw_app_meta_data` armazena o `role`:

```json
{ "role": "customer" }  // ou "store", "driver", "admin"
```

Cada tabela de perfil mantém o vínculo:

```sql
ALTER TABLE customers ADD COLUMN auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE stores    ADD COLUMN auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE drivers   ADD COLUMN auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
```

### Fluxo de login (todos os tipos)

```js
// Mesmo código para customer, store, driver — o role redireciona para o painel certo
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) { /* mostra erro */ return; }

const role = data.user.app_metadata.role;
if (role === 'store')    window.location.href = 'vendedor.html';
if (role === 'driver')   window.location.href = 'entregador.html';
if (role === 'customer') window.location.href = 'inicio.html';
if (role === 'admin')    window.location.href = 'adm.html';
```

### Recuperação de senha

Substituir o fluxo atual por:
```js
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: 'https://uaipede.com.br/reset-password.html'
});
```
Supabase envia email com link temporário (token de 1h). A página `reset-password.html` (nova) chama `supabase.auth.updateUser({ password: newPass })`.

### Migração dos usuários existentes

Script de migração (executado uma única vez via Edge Function admin):

1. Ler todos os emails de `customers`, `stores`, `drivers`
2. Para cada email: `supabase.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role } })`
3. Marcar `must_reset_password = true` em `raw_app_meta_data`
4. No front-end: após login, verificar `user.app_metadata.must_reset_password` e redirecionar para tela de redefinição
5. Após reset: `supabase.auth.admin.updateUserById(uid, { app_metadata: { must_reset_password: false } })`

### O que é removido

- Colunas `password` das tabelas `customers`, `stores`, `drivers` (após migração concluída)
- Campos `password` em todos os objetos salvos no `localStorage`
- Exibição de senhas na UI do admin (`adm.js:589`, `adm.js:738`)
- Fluxo de recuperação de senha por email+telefone em `login.html`

---

## Camada 2 — RLS e banco de dados

### Políticas RLS por tabela

**`customers`**
```sql
-- Leitura: só o próprio cliente
CREATE POLICY "customers_select_own" ON customers
  FOR SELECT USING (auth_id = auth.uid());

-- Escrita: só o próprio cliente
CREATE POLICY "customers_update_own" ON customers
  FOR UPDATE USING (auth_id = auth.uid());
```

**`stores`**
```sql
-- Leitura pública (catálogo)
CREATE POLICY "stores_select_public" ON stores
  FOR SELECT USING (true);

-- Escrita: só a loja dona ou admin
CREATE POLICY "stores_update_own" ON stores
  FOR UPDATE USING (
    auth_id = auth.uid() OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
```

**`drivers`**
```sql
-- Leitura: próprio entregador ou admin
CREATE POLICY "drivers_select_own_or_admin" ON drivers
  FOR SELECT USING (
    auth_id = auth.uid() OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
```

**`orders`**
```sql
-- Leitura: cliente dono, loja do pedido, entregador atribuído ou admin
CREATE POLICY "orders_select" ON orders
  FOR SELECT USING (
    customer_auth_id = auth.uid() OR
    store_auth_id = auth.uid() OR
    driver_auth_id = auth.uid() OR
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Insert: só clientes autenticados (via Edge Function place-order, com service_role)
-- Não há policy de INSERT direta — o insert vem da Edge Function com service_role key

-- Update: loja e entregador podem atualizar status
CREATE POLICY "orders_update_status" ON orders
  FOR UPDATE USING (
    store_auth_id = auth.uid() OR
    driver_auth_id = auth.uid()
  );
```

**`coupons`, `banners`, `sponsors`, `global_alerts`, `global_settings`, `cities`**
```sql
-- Leitura pública
CREATE POLICY "public_read" ON <tabela> FOR SELECT USING (true);
-- Escrita: só admin
CREATE POLICY "admin_write" ON <tabela>
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```

### Outras alterações no banco

- `DEFAULT gen_random_uuid()` em todas as colunas `id` — elimina `Math.random()` no front-end
- Colunas `customer_auth_id`, `store_auth_id`, `driver_auth_id` adicionadas em `orders` para RLS funcionar
- Remover coluna `password` das três tabelas de perfil após migração
- Coluna `onesignal_player_id TEXT` adicionada em `drivers` — armazena o ID do device para envio de push; preenchida no login do entregador via `OneSignal.getUserId()`

### Sanitização XSS

Todos os locais que usam `innerHTML` com dados do banco são corrigidos:
- Textos simples: substituir por `element.textContent = value`
- HTML rico (onde necessário): adicionar DOMPurify via CDN com hash SRI
  ```html
  <script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js"
          integrity="sha512-..." crossorigin="anonymous"></script>
  ```
- Arquivos afetados: `index.js` (alerts), `adm.js` (cards de lojas/entregadores), `vendedor.js`

### Hashes SRI para SDKs de CDN

Fixar versões e adicionar `integrity` nas tags de script:
```html
<!-- Supabase JS v2.x com hash SRI -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js"
        integrity="sha256-[hash]" crossorigin="anonymous"></script>
```

---

## Camada 3 — Edge Functions

### `POST /place-order`

**Input (do cliente):**
```json
{
  "store_id": "uuid",
  "items": [{ "product_id": "uuid", "qty": 2 }],
  "delivery_method": "entrega",
  "address": { "rua": "...", "num": "...", "bairro": "...", "cidade": "..." },
  "coupon_code": "PROMO10"
}
```

**Lógica interna:**
1. Verificar `Authorization: Bearer <jwt>` — rejeitar se não autenticado
2. Buscar produtos por `product_id` no banco — nunca confiar em preço do cliente
3. Calcular `subtotal = SUM(produto.price * qty)`
4. Buscar `delivery_fee` da loja no banco
5. Se `coupon_code`: validar e aplicar desconto dentro de uma transação atômica (`SELECT FOR UPDATE`)
6. `total = subtotal + delivery_fee - discount`
7. Inserir em `orders` com `service_role` key (bypassando RLS de INSERT)
8. Retornar `{ order_id, total, items_summary }`

**Output de erro:** `400 Bad Request` com mensagem genérica para o cliente; log detalhado no servidor.

### `POST /apply-coupon` (validação prévia, sem debitar uso)

Usado na tela do carrinho para mostrar o desconto antes de confirmar o pedido.

```json
{ "coupon_code": "PROMO10", "store_id": "uuid", "subtotal": 45.00 }
```

Retorna `{ valid: true, discount: 4.50, final_total: 40.50 }` ou `{ valid: false, reason: "Cupom expirado" }`.

O uso do cupom SÓ é debitado dentro de `place-order`.

### `POST /admin/migrate-users`

Edge Function de uso único (protegida por header secreto) que executa a migração dos usuários existentes para o Supabase Auth com `must_reset_password = true`.

### `POST /notify` (trigger interno)

Chamada por **Supabase Database Webhook** (configurado no dashboard em Database → Webhooks) após INSERT em `orders`. Não requer código adicional — o Supabase dispara automaticamente um HTTP POST para a Edge Function.

1. Identifica entregadores disponíveis (`available = true`) na mesma cidade do pedido
2. Lê `onesignal_player_id` de cada entregador disponível
3. Chama `POST https://onesignal.com/api/v1/notifications` com `include_player_ids`
4. Envia notificação com resumo do pedido (loja, valor, endereço de retirada)

**Variáveis de ambiente necessárias nas Edge Functions:**
- `ONESIGNAL_APP_ID` — App ID do OneSignal
- `ONESIGNAL_REST_API_KEY` — REST API Key do OneSignal (nunca exposta no front-end)
- `SUPABASE_SERVICE_ROLE_KEY` — para operações que bypassam RLS (já disponível automaticamente nas Edge Functions)

---

## Camada 4 — Remoção do Firebase

### Mapeamento Firebase → Supabase

| Firebase (atual) | Supabase (novo) |
|-----------------|-----------------|
| `onSnapshot` em `orders` | `supabase.channel('orders').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, callback)` |
| `onSnapshot` em status do pedido | `supabase.channel('order-{id}').on('postgres_changes', { filter: 'id=eq.{id}' }, callback)` |
| GPS broadcast do entregador | `supabase.channel('driver-{id}').send({ type: 'broadcast', event: 'location', payload: { lat, lng } })` |
| FCM tokens + `getToken()` | OneSignal SDK — `OneSignal.getUserId()` retorna o `player_id` |
| Firebase Auth (entregadores) | Supabase Auth (camada 1) |
| Firestore (pedidos/produtos em `vendedor.js`) | Supabase (já parcialmente migrado) |

### Arquivos com Firebase a remover completamente

- `vendedor.js` — remover imports Firebase, substituir Firestore por Supabase
- `entregador.html` — remover Firebase Auth, FCM, Firestore; usar Supabase Auth + Realtime + OneSignal
- `login-entregador.html` — remover Firebase Auth; usar Supabase Auth
- `cadastroestabelecimento.html` — remover Firebase; usar Supabase
- `email.html` — avaliar se ainda é necessário; substituir por Supabase
- `monitoramento.html` — substituir Firestore por Supabase Realtime
- `painel-parceiro.html` — substituir Firebase por Supabase

### Push notifications com OneSignal

**Configuração Median.co:**
- Habilitar OneSignal nas configurações do app no dashboard Median.co
- Inserir App ID do OneSignal

**Configuração front-end (todos os arquivos que recebem notificações):**
```html
<script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer></script>
<script>
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  OneSignalDeferred.push(async function(OneSignal) {
    await OneSignal.init({ appId: "SEU_ONESIGNAL_APP_ID" });
  });
</script>
```

**Variável de ambiente:** `ONESIGNAL_REST_API_KEY` configurada nas Edge Functions do Supabase (nunca no front-end).

---

## Itens fora do escopo

- Redesign visual das páginas
- Funcionalidades novas (relatórios, analytics, etc.)
- Migração para framework (React, Vue, etc.)
- Rate limiting de API (pode ser adicionado via Supabase middleware em iteração futura)
- Content Security Policy headers (requer configuração de servidor/CDN na iteração futura)

---

## Critérios de aceitação

- [ ] Nenhuma senha armazenada em texto plano no banco
- [ ] Nenhuma senha exibida na interface do admin
- [ ] Login de clientes, lojistas e entregadores usa `supabase.auth.signInWithPassword()`
- [ ] Recuperação de senha envia email com link temporário
- [ ] RLS ativa em todas as tabelas com políticas testadas
- [ ] Total do pedido calculado exclusivamente na Edge Function `place-order`
- [ ] Cupons validados com transação atômica (sem race condition)
- [ ] Zero imports de Firebase no código-fonte
- [ ] Push notifications funcionando em Android (APK Median.co) e iOS (PWA)
- [ ] Supabase Realtime substituindo Firebase Realtime em pedidos e GPS
- [ ] innerHTML sanitizado com DOMPurify ou substituído por textContent
