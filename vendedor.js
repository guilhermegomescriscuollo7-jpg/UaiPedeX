// ==========================================
// CONFIGURAÇÃO SUPABASE
// ==========================================
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = 'https://mvhqsiyalupodrtsfncj.supabase.co';
const supabaseKey = 'sb_publishable_K_tmqPg95RJlCCzwRZln4Q_kmfrUw0G'; 
const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// VARIÁVEIS GLOBAIS
// ==========================================
const loggedStore = JSON.parse(localStorage.getItem('loggedStore'));

if (!loggedStore) {
    window.location.href = "login-vendedor.html";
}

let globalOrders = [];
let globalProducts = [];
let currentChatOrderId = null;
let realtimeOrdersChannel = null;
let realtimeChatChannel = null;

const formatBRL = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ==========================================
// INICIALIZAÇÃO
// ==========================================
window.onload = async () => {
    document.getElementById('ui-store-name').innerText = loggedStore.name;
    document.getElementById('ui-store-logo').src = loggedStore.logo || 'https://via.placeholder.com/80';

    // Sincroniza o toggle com o status atual do BD
    const { data: storeData } = await supabase.from('stores').select('status').eq('id', loggedStore.id).single();
    if(storeData) {
        const isOpen = storeData.status === 'Aberto';
        document.getElementById('btn-toggle-status').checked = isOpen;
        document.getElementById('btn-toggle-status').className = isOpen ? 'store-status-toggle status-open' : 'store-status-toggle status-closed';
    }

    initRealtimeOrders();
    loadProducts();
};

// ==========================================
// GESTÃO DE PEDIDOS
// ==========================================
async function initRealtimeOrders() {
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('storeId', loggedStore.id)
        .order('timestamp', { ascending: false });

    if (!error && data) {
        globalOrders = data;
        renderOrders();
    }

    // Tempo Real
    supabase.channel('orders-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `storeId=eq.${loggedStore.id}` }, payload => {
            if (payload.eventType === 'INSERT') globalOrders.unshift(payload.new);
            else if (payload.eventType === 'UPDATE') {
                const idx = globalOrders.findIndex(o => o.id === payload.new.id);
                if (idx !== -1) globalOrders[idx] = payload.new;
            }
            renderOrders();
        }).subscribe();
}

function renderOrders() {
    // Lógica de renderização no Kanban (Pendente, Preparo, Rota, Concluido)
    // ... [Use a mesma lógica de filtros por status que já tínhamos]
}

window.updateOrderStatus = async (orderId, newStatus) => {
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
};

// ==========================================
// GESTÃO DO CARDÁPIO (PRODUTOS)
// ==========================================
async function loadProducts() {
    const { data, error } = await supabase.from('products').select('*').eq('storeId', loggedStore.id);
    if (!error && data) {
        globalProducts = data;
        renderProducts();
    }
}

function renderProducts() {
    const container = document.getElementById('product-list-container');
    container.innerHTML = globalProducts.map(p => `
        <div class="product-row" onclick="window.editProduct('${p.id}')">
            <img src="${p.image || ''}" class="row-img">
            <div class="row-info">
                <div class="row-name">${p.name}</div>
                <div class="row-sub">R$ ${p.price.toFixed(2)} • ${p.category || 'Geral'}</div>
            </div>
            <button class="btn btn-outline" onclick="window.deleteProduct('${p.id}', event)">Excluir</button>
        </div>
    `).join('');
}

window.deleteProduct = async (id, event) => {
    event.stopPropagation();
    if(confirm("Apagar produto?")) {
        await supabase.from('products').delete().eq('id', id);
        loadProducts();
    }
};

// ==========================================
// ABRIR E FECHAR LOJA
// ==========================================
window.toggleStoreStatus = async () => {
    const toggle = document.getElementById('btn-toggle-status');
    const newStatus = toggle.checked ? 'Aberto' : 'Fechado';
    
    toggle.className = toggle.checked ? 'store-status-toggle status-open' : 'store-status-toggle status-closed';
    
    await supabase.from('stores').update({ status: newStatus }).eq('id', loggedStore.id);
    window.alert("Loja " + newStatus);
};
