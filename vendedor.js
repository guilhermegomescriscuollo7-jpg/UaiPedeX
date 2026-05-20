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
const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// ==========================================
// 🟢 SISTEMA DE ÁUDIO (SOM DE NOVO PEDIDO)
// ==========================================
async function loadCustomAudio() {
    const { data, error } = await supabase.from('global_settings').select('*').eq('id', 'notification_audio').single();
    if (data && data.audioData) {
        customAlertSound = new Audio(data.audioData);
    } else {
        customAlertSound = new Audio('https://www.myinstants.com/media/sounds/bell.mp3');
    }
}
loadCustomAudio();

const playAlertSound = () => {
    if (customAlertSound) {
        customAlertSound.play().catch(e => console.log("O navegador bloqueou o áudio automático. Interaja com a página primeiro."));
    }
};

window.onload = () => {
    document.getElementById('store-display-name').innerText = loggedStore.name;
    document.getElementById('store-display-logo').src = loggedStore.logo || 'https://via.placeholder.com/40';

    if (loggedStore.status === 'Aberto') {
        document.getElementById('store-status-toggle').checked = true;
        document.getElementById('store-status-text').innerText = 'Aberto';
        document.getElementById('store-status-text').style.color = 'var(--success)';
    }

    initRealtimeOrders();
    loadProducts();
    loadStoreSettings();
};

window.logoutStore = () => {
    if (confirm("Deseja realmente sair?")) {
        localStorage.removeItem('loggedStore');
        window.location.href = 'login-vendedor.html';
    }
};

// ==========================================
// 🟢 GESTÃO DE PEDIDOS (TEMPO REAL)
// ==========================================
async function initRealtimeOrders() {
    // Busca inicial
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('storeId', loggedStore.id)
        .order('timestamp', { ascending: false });

    if (!error && data) {
        globalOrders = data;
        renderOrders();
        updateStats();
    }

    // Inscreve no canal em tempo real para novos pedidos
    realtimeOrdersChannel = supabase.channel('custom-orders-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `storeId=eq.${loggedStore.id}` }, payload => {
            
            if (payload.eventType === 'INSERT') {
                globalOrders.unshift(payload.new);
                playAlertSound(); 
                window.showToast("🔔 NOVO PEDIDO RECEBIDO!", "success");
            } else if (payload.eventType === 'UPDATE') {
                const index = globalOrders.findIndex(o => o.id === payload.new.id);
                if (index !== -1) globalOrders[index] = payload.new;
            } else if (payload.eventType === 'DELETE') {
                globalOrders = globalOrders.filter(o => o.id !== payload.old.id);
            }
            
            globalOrders.sort((a,b) => b.timestamp - a.timestamp);
            renderOrders();
            updateStats();
        })
        .subscribe();
}

function renderOrders() {
    const container = document.getElementById('orders-list-container');
    const filter = document.getElementById('order-status-filter').value;

    let filtered = globalOrders;
    if (filter !== 'all') {
        filtered = filtered.filter(o => o.status === filter);
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state">Nenhum pedido encontrado.</div>`;
        return;
    }

    container.innerHTML = filtered.map(order => {
        let badgeClass = 'status-badge ';
        if(order.status === 'Pendente') badgeClass += 'status-pending';
        else if(order.status === 'Em Preparo') badgeClass += 'status-prep';
        else if(order.status === 'Entregue' || order.status === 'Concluído' || order.status === 'Concluido') badgeClass += 'status-delivered';
        else if(order.status === 'Cancelado') badgeClass += 'status-cancelled';
        else badgeClass += 'status-route'; 

        const shortId = order.id.substring(0, 6).toUpperCase();
        
        let itemsHtml = order.items.map(i => {
            let details = i.variant ? `(${i.variant})` : ''; 
            let addonsHtml = i.addons && i.addons.length > 0 ? `<div style="font-size:0.75rem; color:#888; margin-left:10px;">+ ${i.addons.join(', ')}</div>` : '';
            let obsHtml = i.observation ? `<div style="font-size:0.75rem; color:#ea1d2c; font-weight:bold; margin-left:10px;">Obs: ${i.observation}</div>` : '';
            return `<li><strong>${i.qty}x</strong> ${i.name} ${details} <span style="float:right;">R$ ${(i.price * i.qty).toFixed(2)}</span>${addonsHtml}${obsHtml}</li>`;
        }).join('');

        let isPickup = order.orderType === 'retirada' || (order.customer && order.customer.address && order.customer.address.includes('RETIRADA'));
        let typeBadge = isPickup ? `<span style="background:#fff3cd; color:#856404; font-size:0.7rem; padding:2px 6px; border-radius:4px; font-weight:bold; margin-left:10px; border: 1px solid #ffeeba;">🚶 Retirada</span>` : `<span style="background:#eef4ff; color:#0d6efd; font-size:0.7rem; padding:2px 6px; border-radius:4px; font-weight:bold; margin-left:10px; border: 1px solid #cce5ff;">🛵 Entrega</span>`;

        let actionBtns = '';
        if (order.status === 'Pendente') {
            actionBtns = `
                <button class="btn btn-outline" style="color:var(--success); border-color:var(--success);" onclick="window.updateOrderStatus('${order.id}', 'Aceito')">Aceitar</button>
                <button class="btn btn-outline" style="color:var(--primary); border-color:var(--primary);" onclick="window.updateOrderStatus('${order.id}', 'Cancelado')">Recusar</button>
            `;
        } else if (order.status === 'Aceito') {
            actionBtns = `<button class="btn btn-primary" onclick="window.updateOrderStatus('${order.id}', 'Em Preparo')">Iniciar Preparo</button>`;
        } else if (order.status === 'Em Preparo') {
            if (isPickup) {
                actionBtns = `<button class="btn btn-primary" onclick="window.updateOrderStatus('${order.id}', 'Pronto para Retirada')">Pronto para Retirada</button>`;
            } else {
                actionBtns = `<button class="btn btn-primary" onclick="window.updateOrderStatus('${order.id}', 'Saiu para Entrega')">Despachar Entrega</button>`;
            }
        } else if (order.status === 'Saiu para Entrega' || order.status === 'Pronto para Retirada') {
            actionBtns = `<button class="btn btn-primary" style="background:var(--success);" onclick="window.updateOrderStatus('${order.id}', 'Entregue')">Marcar como Concluído</button>`;
        } else if (order.status === 'Entregue' || order.status === 'Concluido' || order.status === 'Cancelado') {
            actionBtns = `<span style="font-size:0.85rem; color:var(--text-muted); font-weight:bold;">Pedido Finalizado</span>`;
        }

        let addressHtml = isPickup ? `<strong>O cliente virá retirar o pedido no local.</strong>` : `<strong>Endereço:</strong> ${order.customer.address}`;

        let pixAdminControls = '';
        if ((order.paymentMethod || '').toLowerCase().includes('pix')) {
            if (order.pixApproved === true) {
                pixAdminControls = `<div style="background:#e6f4ea; padding:8px; border-radius:6px; margin-top:10px; font-size:0.85rem; color:#00a14b; font-weight:bold;">✅ Pagamento PIX Confirmado</div>`;
            } else if (order.pixApproved === false) {
                pixAdminControls = `<div style="background:#fef0f0; padding:8px; border-radius:6px; margin-top:10px; font-size:0.85rem; color:#ea1d2c; font-weight:bold;">❌ PIX Rejeitado</div>`;
            } else {
                if (order.status !== 'Cancelado' && order.status !== 'Entregue' && order.status !== 'Concluido') {
                    pixAdminControls = `
                    <div style="background:#fff3cd; padding:12px; border-radius:6px; margin-top:10px; border: 1px solid #ffeeba;">
                        <strong style="color:#856404; font-size:0.85rem; display:block; margin-bottom:8px;">⏳ Pagamento via PIX pendente de conferência</strong>
                        <div style="display:flex; gap:10px;">
                            <button class="btn btn-primary" style="background:#00a14b; flex:1; font-size:0.8rem; padding:8px;" onclick="window.confirmarPix('${order.id}', true)">Confirmar PIX</button>
                            <button class="btn btn-outline" style="border-color:#ea1d2c; color:#ea1d2c; flex:1; font-size:0.8rem; padding:8px;" onclick="window.confirmarPix('${order.id}', false)">PIX Não Recebido</button>
                        </div>
                    </div>`;
                }
            }
        }

        return `
        <div class="card">
            <div class="order-header">
                <div>
                    <h3 style="margin-bottom:4px;">${order.customerName}</h3>
                    <span style="font-size:0.85rem; color:var(--text-muted);">Pedido #${shortId} • ${order.date}</span> ${typeBadge}
                </div>
                <div style="text-align: right;">
                    <span class="${badgeClass}">${order.status}</span>
                    <h3 style="margin-top:8px; color:var(--primary);">R$ ${(order.total || 0).toFixed(2)}</h3>
                </div>
            </div>
            
            <div style="font-size:0.9rem; color:var(--text-dark); margin-bottom:15px; line-height: 1.5;">
                <strong>Telefone:</strong> ${order.customer.phone || 'Não informado'}<br>
                ${addressHtml}<br>
                <strong>Pagamento:</strong> ${order.paymentMethod}
            </div>

            ${pixAdminControls}

            <ul class="order-items-list">
                ${itemsHtml}
            </ul>

            <div class="order-actions">
                <div style="display: flex; gap: 8px;">
                    ${actionBtns}
                </div>
                <button class="btn btn-outline" onclick="window.openChatModal('${order.id}', '${order.customerName}')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> Chat
                </button>
            </div>
        </div>`;
    }).join('');
}

window.filterOrders = () => { renderOrders(); };

window.updateOrderStatus = async (orderId, newStatus) => {
    if(newStatus === 'Cancelado') {
        if(!confirm("Tem certeza que deseja cancelar este pedido?")) return;
    }
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
};

window.confirmarPix = async (orderId, aprovado) => {
    if (aprovado) {
        if(!confirm("Confirma que o valor já caiu na sua conta?")) return;
        await supabase.from('orders').update({ pixApproved: true }).eq('id', orderId);
    } else {
        if(!confirm("ATENÇÃO: Isso marcará o PIX como NÃO PAGO e Cancelará o pedido. Confirmar?")) return;
        await supabase.from('orders').update({ pixApproved: false, status: 'Cancelado' }).eq('id', orderId);
    }
};

function updateStats() {
    let pendentes = 0; let preparo = 0; let faturado = 0;
    const now = new Date();
    const isHoje = (dateStr) => {
        if(!dateStr) return false;
        const oDate = dateStr.split(' ')[0];
        const hDate = now.toLocaleDateString('pt-BR');
        return oDate === hDate;
    };

    globalOrders.forEach(o => {
        if(o.status === 'Pendente') pendentes++;
        if(o.status === 'Aceito' || o.status === 'Em Preparo') preparo++;
        if((o.status === 'Entregue' || o.status === 'Concluido' || o.status === 'Concluído') && isHoje(o.date)) {
            faturado += (o.total || 0);
        }
    });

    document.getElementById('stat-pendentes').innerText = pendentes;
    document.getElementById('stat-preparo').innerText = preparo;
    document.getElementById('stat-faturado').innerText = formatBRL(faturado);
}

// ==========================================
// 🟢 SISTEMA DE CHAT (TEMPO REAL)
// ==========================================
window.openChatModal = async (orderId, customerName) => {
    currentChatOrderId = orderId;
    document.getElementById('chat-customer-name').innerText = customerName;
    document.getElementById('chat-order-id').innerText = '#' + orderId.substring(0, 6).toUpperCase();
    document.getElementById('chat-modal').classList.add('active');

    const container = document.getElementById('chat-messages-container');
    container.innerHTML = '<p style="text-align:center; color:#999; margin-top: 20px;">Carregando mensagens...</p>';

    // Busca mensagens existentes
    const { data: messages } = await supabase
        .from('order_messages')
        .select('*')
        .eq('order_id', orderId)
        .order('timestamp', { ascending: true });

    const renderMsgs = (msgs) => {
        if (!msgs || msgs.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#999; margin-top: 20px;">Nenhuma mensagem ainda.</p>';
            return;
        }
        container.innerHTML = msgs.map(msg => {
            if(msg.sender === 'store') {
                return `
                <div class="msg-bubble msg-store">
                    ${msg.text}
                    <span class="msg-time" style="color:rgba(255,255,255,0.8);">${msg.timeString} ✔</span>
                </div>`;
            } else {
                if (!msg.read) {
                    supabase.from('order_messages').update({ read: true }).eq('id', msg.id).then();
                }
                return `
                <div class="msg-bubble msg-customer">
                    <span class="msg-sender">${customerName}</span>
                    ${msg.text}
                    <span class="msg-time">${msg.timeString}</span>
                </div>`;
            }
        }).join('');
        container.scrollTop = container.scrollHeight;
    };

    renderMsgs(messages || []);

    // Inscreve para novas mensagens APENAS deste pedido
    if(realtimeChatChannel) supabase.removeChannel(realtimeChatChannel);
    
    realtimeChatChannel = supabase.channel('custom-chat-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_messages', filter: `order_id=eq.${orderId}` }, async payload => {
            const { data: newMessages } = await supabase.from('order_messages').select('*').eq('order_id', orderId).order('timestamp', { ascending: true });
            renderMsgs(newMessages || []);
        })
        .subscribe();
};

window.closeChatModal = () => {
    document.getElementById('chat-modal').classList.remove('active');
    currentChatOrderId = null;
    if (realtimeChatChannel) {
        supabase.removeChannel(realtimeChatChannel);
        realtimeChatChannel = null;
    }
};

document.getElementById('chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || !currentChatOrderId) return;
    
    input.value = ''; 
    const now = new Date();
    const timeString = now.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
    
    await supabase.from('order_messages').insert([{
        order_id: currentChatOrderId,
        text: text,
        sender: 'store',
        timestamp: Date.now(),
        timeString: timeString,
        read: false
    }]);
});

// ==========================================
// 🟢 GESTÃO DE PRODUTOS E CARDÁPIO
// ==========================================
let editingProductId = null;
let currentProductImgBase64 = '';

async function loadProducts() {
    const { data, error } = await supabase.from('products').select('*').eq('storeId', loggedStore.id);
    if (!error && data) {
        globalProducts = data;
        renderProducts();
    }
}

function renderProducts() {
    const container = document.getElementById('products-list-container');
    if (globalProducts.length === 0) {
        container.innerHTML = `<div class="empty-state">Nenhum produto cadastrado no cardápio.</div>`;
        return;
    }

    container.innerHTML = globalProducts.map(p => {
        return `
        <div class="card" style="display:flex; gap:15px; align-items:center; ${p.isActive === false ? 'opacity:0.6;' : ''}">
            <img src="${p.image || 'https://via.placeholder.com/80'}" style="width:80px; height:80px; border-radius:12px; object-fit:cover;">
            <div style="flex-grow:1;">
                <h4 style="margin-bottom:4px; color:var(--text-dark);">${p.name}</h4>
                <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:6px;">${p.category || 'Geral'}</div>
                <div style="font-weight:bold; color:var(--primary);">R$ ${(p.price || 0).toFixed(2)}</div>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                <button class="btn btn-outline" style="padding:6px 12px; font-size:0.8rem;" onclick="window.editProduct('${p.id}')">Editar</button>
                <button class="btn ${p.isActive === false ? 'btn-primary' : 'btn-outline'}" style="padding:6px 12px; font-size:0.8rem; ${p.isActive === false ? '' : 'color:var(--warning); border-color:var(--warning);'}" onclick="window.toggleProductStatus('${p.id}')">
                    ${p.isActive === false ? 'Ativar' : 'Pausar'}
                </button>
                <button class="btn btn-outline" style="padding:6px 12px; font-size:0.8rem; color:var(--primary); border-color:var(--primary);" onclick="window.deleteProduct('${p.id}')">Excluir</button>
            </div>
        </div>`;
    }).join('');
}

document.getElementById('prod-img').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(evt) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width; let height = img.height;
                if (width > 600) { height *= 600 / width; width = 600; }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                currentProductImgBase64 = canvas.toDataURL('image/jpeg', 0.7);
            };
            img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
    }
});

window.saveProduct = async (e) => {
    e.preventDefault();
    const name = document.getElementById('prod-name').value.trim();
    const desc = document.getElementById('prod-desc').value.trim();
    const price = parseFloat(document.getElementById('prod-price').value) || 0;
    const cat = document.getElementById('prod-cat').value.trim();

    if (!name || !cat) {
        window.showToast("Nome e Categoria são obrigatórios.", "error"); return;
    }

    const prodData = {
        storeId: loggedStore.id,
        name: name, desc: desc, price: price, category: cat,
        isActive: true,
        image: currentProductImgBase64 || 'https://via.placeholder.com/600x400'
    };

    if (editingProductId) {
        if (!currentProductImgBase64) delete prodData.image; 
        await supabase.from('products').update(prodData).eq('id', editingProductId);
        window.showToast("Produto atualizado com sucesso!", "success");
    } else {
        prodData.id = generateId();
        await supabase.from('products').insert([prodData]);
        window.showToast("Produto cadastrado com sucesso!", "success");
    }

    window.cancelProductEdit();
    loadProducts();
};

window.editProduct = (id) => {
    editingProductId = id;
    const prod = globalProducts.find(p => p.id === id);
    if(!prod) return;

    document.getElementById('prod-name').value = prod.name;
    document.getElementById('prod-desc').value = prod.desc || '';
    document.getElementById('prod-price').value = prod.price || '';
    document.getElementById('prod-cat').value = prod.category || '';
    currentProductImgBase64 = '';
    
    document.getElementById('btn-save-prod').innerText = "Atualizar Produto";
    document.getElementById('btn-cancel-prod').style.display = "inline-flex";
    
    switchTab('menu', document.querySelectorAll('.nav-item')[1]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.cancelProductEdit = () => {
    editingProductId = null;
    document.getElementById('product-form').reset();
    currentProductImgBase64 = '';
    document.getElementById('btn-save-prod').innerText = "Cadastrar Produto";
    document.getElementById('btn-cancel-prod').style.display = "none";
};

window.toggleProductStatus = async (id) => {
    const prod = globalProducts.find(p => p.id === id);
    if(prod) {
        await supabase.from('products').update({ isActive: !prod.isActive }).eq('id', id);
        loadProducts();
    }
};

window.deleteProduct = async (id) => {
    if(confirm("Tem certeza que deseja excluir este produto do cardápio?")) {
        await supabase.from('products').delete().eq('id', id);
        loadProducts();
    }
};

// ==========================================
// 🟢 CONFIGURAÇÕES DA LOJA E STATUS
// ==========================================
function loadStoreSettings() {
    document.getElementById('cfg-pix').value = loggedStore.pixKey || '';
    document.getElementById('cfg-min-order').value = loggedStore.minOrder || '';
    document.getElementById('cfg-delivery-fee').value = loggedStore.deliveryFee || '';
    document.getElementById('cfg-delivery-time').value = loggedStore.deliveryTime || '';
}

window.saveStoreSettings = async (e) => {
    e.preventDefault();
    const pix = document.getElementById('cfg-pix').value.trim();
    const minOrder = parseFloat(document.getElementById('cfg-min-order').value) || 0;
    const deliveryFee = parseFloat(document.getElementById('cfg-delivery-fee').value) || 0;
    const deliveryTime = document.getElementById('cfg-delivery-time').value.trim();

    await supabase.from('stores').update({
        pixKey: pix,
        minOrder: minOrder,
        deliveryFee: deliveryFee,
        deliveryTime: deliveryTime
    }).eq('id', loggedStore.id);

    loggedStore.pixKey = pix; loggedStore.minOrder = minOrder; loggedStore.deliveryFee = deliveryFee; loggedStore.deliveryTime = deliveryTime;
    localStorage.setItem('loggedStore', JSON.stringify(loggedStore));

    window.showToast("Configurações atualizadas!", "success");
};

window.toggleStoreStatus = async () => {
    const toggle = document.getElementById('store-status-toggle');
    const text = document.getElementById('store-status-text');
    
    const newStatus = toggle.checked ? 'Aberto' : 'Fechado';
    text.innerText = newStatus;
    text.style.color = toggle.checked ? 'var(--success)' : 'var(--text-muted)';

    await supabase.from('stores').update({ status: newStatus }).eq('id', loggedStore.id);
    
    loggedStore.status = newStatus;
    localStorage.setItem('loggedStore', JSON.stringify(loggedStore));
    
    window.showToast(`Loja marcada como ${newStatus}`, toggle.checked ? "success" : "error");
};

// ==========================================
// 🟢 UTILITÁRIOS DA INTERFACE
// ==========================================
window.switchTab = (tabId, element) => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    element.classList.add('active');

    if(window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebar-overlay').classList.remove('active');
    }
};

window.toggleSidebar = () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('active');
};

window.showToast = (msg, type) => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast-msg ${type === 'error' ? 'toast-error' : (type === 'success' ? 'toast-success' : '')}`;
    toast.innerHTML = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
};
