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
let customAlertSound = null;
let realtimeOrdersChannel = null;
let realtimeChatChannel = null;

const formatBRL = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ==========================================
// INICIALIZAÇÃO
// ==========================================
window.onload = async () => {
    document.getElementById('ui-store-name').innerText = loggedStore.name;
    document.getElementById('ui-store-logo').src = loggedStore.logo || 'https://via.placeholder.com/80';

    // Carrega configurações de áudio
    await loadCustomAudio();

    // Sincroniza o status da loja
    document.getElementById('btn-toggle-status').checked = loggedStore.status === 'Aberto';
    
    initRealtimeOrders();
    loadProducts();
};

async function loadCustomAudio() {
    const { data } = await supabase.from('global_settings').select('audioData').eq('id', 'notification_audio').single();
    customAlertSound = new Audio(data?.audioData || 'https://www.myinstants.com/media/sounds/bell.mp3');
}

window.logoutStore = () => {
    localStorage.removeItem('loggedStore');
    window.location.href = 'login-vendedor.html';
};

// ==========================================
// PEDIDOS (TEMPO REAL)
// ==========================================
async function initRealtimeOrders() {
    const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('storeId', loggedStore.id)
        .order('timestamp', { ascending: false });

    if (data) {
        globalOrders = data;
        renderOrders();
    }

    realtimeOrdersChannel = supabase.channel('orders-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `storeId=eq.${loggedStore.id}` }, payload => {
            if (payload.eventType === 'INSERT') {
                globalOrders.unshift(payload.new);
                customAlertSound.play();
                window.showToast("🔔 Novo Pedido!", "success");
            } else if (payload.eventType === 'UPDATE') {
                const idx = globalOrders.findIndex(o => o.id === payload.new.id);
                if (idx !== -1) globalOrders[idx] = payload.new;
            }
            renderOrders();
        })
        .subscribe();
}

window.renderOrders = () => {
    // Adicione aqui a sua lógica de renderização baseada em globalOrders
    console.log("Pedidos atualizados:", globalOrders);
};

window.updateOrderStatus = async (orderId, newStatus) => {
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
};

// ==========================================
// PRODUTOS
// ==========================================
async function loadProducts() {
    const { data } = await supabase.from('products').select('*').eq('storeId', loggedStore.id);
    if (data) {
        globalProducts = data;
        renderProducts();
    }
}

function renderProducts() {
    const container = document.getElementById('product-list-container');
    container.innerHTML = globalProducts.map(p => `
        <div class="product-row">
            <div class="row-info">
                <div class="row-name">${p.name}</div>
                <div class="row-sub">R$ ${p.price.toFixed(2)}</div>
            </div>
            <button onclick="window.deleteProduct('${p.id}')">Excluir</button>
        </div>
    `).join('');
}

window.deleteProduct = async (id) => {
    await supabase.from('products').delete().eq('id', id);
    loadProducts();
};

// ==========================================
// CHAT
// ==========================================
window.openChatModal = async (orderId, customerName) => {
    currentChatOrderId = orderId;
    document.getElementById('chat-customer-name').innerText = customerName;
    document.getElementById('chat-modal').classList.add('active');

    const { data: msgs } = await supabase
        .from('order_messages')
        .select('*')
        .eq('order_id', orderId)
        .order('timestamp', { ascending: true });
    
    // Renderize as mensagens...
};

document.getElementById('chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = document.getElementById('chat-input').value;
    await supabase.from('order_messages').insert([{
        order_id: currentChatOrderId,
        text: text,
        sender: 'store',
        timestamp: Date.now(),
        timeString: new Date().toLocaleTimeString()
    }]);
    document.getElementById('chat-input').value = '';
});

// ==========================================
// STATUS DA LOJA
// ==========================================
window.toggleStoreStatus = async () => {
    const toggle = document.getElementById('btn-toggle-status');
    const status = toggle.checked ? 'Aberto' : 'Fechado';
    await supabase.from('stores').update({ status }).eq('id', loggedStore.id);
};

window.showToast = (msg, type) => { /* Sua lógica de toast */ };
