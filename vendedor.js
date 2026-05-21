import { supabase } from './js/supabase-client.js';
import { requireRole } from './js/auth.js';

let session;
try {
    session = await requireRole('store', 'login-vendedor.html');
    if (!session) throw new Error('Not authenticated');
} catch (error) {
    window.location.href = 'login-vendedor.html';
    throw error;
}

let storeProfile = null;
try {
    // maybeSingle() evita crash no Supabase caso retorne 0 linhas, permitindo tratar no JS
    const { data, error } = await supabase
        .from('stores')
        .select('id, name, logo, status, schedule, deliveryFee, deliveryTime, pickupTime, minOrder, paymentMethods, pixKey, moreInfo, categories, dueDate, isActive')
        .eq('auth_id', session.user.id)
        .maybeSingle();

    if (error) {
        console.error("Erro na query da loja:", error);
    } else {
        storeProfile = data;
    }
} catch (e) {
    console.error("Erro fatal ao carregar o perfil da loja:", e);
}

// 🟢 BLOQUEIO SEGURO: Interrompe a execução caso a loja não seja encontrada
if (!storeProfile || !storeProfile.id) {
    alert("Sua conta não tem uma loja vinculada ou foi desativada. Verifique o auth_id no Supabase!");
    window.location.href = 'login-vendedor.html';
    throw new Error("Store profile not found. Halting execution."); 
}

const loggedStore = storeProfile; // Keep compatibility with all existing code that references loggedStore

// 🟢 LÓGICA DO ÁUDIO CUSTOMIZADO 🟢
let customAlertSound = null;

(async () => {
    try {
        const { data: audioSnap } = await supabase
            .from('global_settings')
            .select('audioData')
            .eq('id', 'notification_audio')
            .maybeSingle();

        if (audioSnap && audioSnap.audioData) {
            customAlertSound = new Audio(audioSnap.audioData);
        } else {
            customAlertSound = new Audio('https://www.myinstants.com/media/sounds/cash-register-purchase.mp3');
        }
    } catch (e) {
        customAlertSound = new Audio('https://www.myinstants.com/media/sounds/cash-register-purchase.mp3');
    }
})();

// Funções auxiliares para o chat (evitando erros no console)
window.playMsgSound = () => { try { new Audio('https://www.myinstants.com/media/sounds/message-tone.mp3').play().catch(()=>{}); } catch(e){} };
window.showMsgToast = (name, text, orderId) => {
    const toast = document.getElementById('new-order-toast');
    document.getElementById('toast-store-name').innerText = `💬 Nova mensagem de ${name}`;
    document.getElementById('toast-msg-text').innerText = text.length > 30 ? text.substring(0, 30) + '...' : text;
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 5000);
};

// 🟢 VARIÁVEIS GLOBAIS 🟢
let globalOrders = []; 
let previousOrderCount = -1;
let globalCoupons = []; 
let onlineDriversCount = 0;
let chatUnsubscribe = null;
let currentChatOrderId = null;

let chatListeners = {};
let initialLoadMsg = {};
window.unreadCounts = {}; 

let globalProducts = [];
let myCategories = ['Destaques']; // Apenas Destaques por padrão
let currentEditingId = null; 
let editorImageBase64 = ''; 
let currentPriceType = 'simples'; 
let editingVariants = []; 
let editingModifiers = []; 

// 🟢 VARIÁVEL PARA O FILTRO DE CATEGORIAS 🟢
window.currentCategoryFilter = 'Todas';

document.getElementById('ui-store-name').innerText = loggedStore.name;
document.getElementById('ui-store-logo').src = loggedStore.logo || 'https://via.placeholder.com/80';
document.getElementById('mobile-store-name').innerText = loggedStore.name;
document.getElementById('mobile-store-logo').src = loggedStore.logo || 'https://via.placeholder.com/80';

window.updateStatusBtn = () => {
    const btn = document.getElementById('btn-toggle-status');
    const mBtn = document.getElementById('mobile-btn-toggle');
    
    let isScheduleOpen = true;
    if (loggedStore.schedule) {
        const now = new Date();
        const daysMap = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
        const todaySch = loggedStore.schedule[daysMap[now.getDay()]];
        
        if (!todaySch || !todaySch.active) {
            isScheduleOpen = false;
        } else {
            const currentMins = now.getHours() * 60 + now.getMinutes();
            const [oH, oM] = (todaySch.open || '00:00').split(':').map(Number);
            const [cH, cM] = (todaySch.close || '23:59').split(':').map(Number);
            const openMins = (oH || 0) * 60 + (oM || 0);
            const closeMins = (cH || 0) * 60 + (cM || 0);
            
            if (closeMins >= openMins) {
                isScheduleOpen = currentMins >= openMins && currentMins <= closeMins;
            } else {
                isScheduleOpen = currentMins >= openMins || currentMins <= closeMins;
            }
        }
    }

    if(loggedStore.status === 'Aberto') {
        if (isScheduleOpen) {
            btn.className = 'store-status-toggle status-open'; 
            btn.innerHTML = `
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    <span>Loja Aberta</span>
                </div>
                <span style="font-size:0.7rem;font-weight:600; opacity:0.8;">(Funcionamento normal)</span>`;
            if(mBtn) { mBtn.className = 'm-status-btn m-status-open'; mBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Aberta'; }
        } else {
            btn.className = 'store-status-toggle status-closed'; 
            btn.innerHTML = `
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    <span>Loja Fechada</span>
                </div>
                <span style="font-size:0.7rem;font-weight:600; opacity:0.8;">Fora do horário configurado</span>`;
            if(mBtn) { mBtn.className = 'm-status-btn m-status-closed'; mBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Fechada'; }
        }
    } else {
        btn.className = 'store-status-toggle status-closed'; 
        btn.innerHTML = `
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                <span>Loja Fechada</span>
            </div>
            <span style="font-size:0.7rem;font-weight:600; opacity:0.8;">Fechada manualmente</span>`;
        if(mBtn) { mBtn.className = 'm-status-btn m-status-closed'; mBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Fechada'; }
    }
};

setInterval(() => { if(loggedStore) window.updateStatusBtn(); }, 60000);

window.toggleStoreStatus = async () => {
    const newStatus = loggedStore.status === 'Aberto' ? 'Fechado' : 'Aberto';
    loggedStore.status = newStatus;
    window.updateStatusBtn();
    try { await supabase.from('stores').update({ status: newStatus }).eq('id', loggedStore.id); } catch(e) {}
};

window.requestNotificationPermission = () => {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        ctx.resume();
        
        alert("Áudio e Alertas ativados com sucesso! O som tocará perfeitamente agora.");
    } catch(e) {}
    if ("Notification" in window) Notification.requestPermission();
};

window.closeToast = () => { document.getElementById('new-order-toast').classList.remove('show'); };

function playAlertSound() {
    try {
        if (customAlertSound) {
            customAlertSound.play().catch(e => console.log("Áudio bloqueado pelo navegador"));
        } else {
            new Audio('https://www.myinstants.com/media/sounds/cash-register-purchase.mp3').play().catch(e=>{});
        }
    } catch (e) {}
}

function triggerNewOrderAlert() {
    playAlertSound();
    const toast = document.getElementById('new-order-toast');
    document.getElementById('toast-store-name').innerText = `Novo Pedido!`;
    document.getElementById('toast-msg-text').innerText = `Verifique a sua lista de pendentes.`;
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 10000); 
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification("UaiPede Loja: Novo Pedido!", { body: "Acabou de chegar um novo pedido na sua loja." });
    }
}

window.switchTab = (tabId, el) => {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    el.classList.add('active');
    if(tabId === 'cardapio') { window.loadCategoriesAndProducts(); window.clearEditor(); }
    if(tabId === 'estoque') { window.renderStock(); } 
    if(tabId === 'relatorios') { window.renderReports(); }
};

window.logoutStore = () => {
    if(confirm("Deseja sair do painel da loja?")) {
        localStorage.removeItem('loggedStore'); window.location.href = 'login-vendedor.html';
    }
};

// Load store config on init and subscribe to realtime changes
const applyStoreData = (data) => {
    loggedStore.schedule = data.schedule || null;
    loggedStore.status = data.status || 'Aberto';

    document.getElementById('cfg-delivery-fee').value = data.deliveryFee !== undefined ? data.deliveryFee : '';
    document.getElementById('cfg-delivery-time').value = data.deliveryTime || '';
    document.getElementById('cfg-pickup-time').value = data.pickupTime || '';
    document.getElementById('cfg-min-order').value = data.minOrder !== undefined ? data.minOrder : '';
    document.getElementById('cfg-payment-methods').value = data.paymentMethods || '';
    document.getElementById('cfg-pix-key').value = data.pixKey || '';
    document.getElementById('cfg-more-info').value = data.moreInfo || '';

    if (data.categories && Array.isArray(data.categories)) { myCategories = data.categories; }

    window.renderScheduleUI(data.schedule || {});
    window.updateStatusBtn();
    window.loadCategoriesAndProducts();

    if (data.dueDate) {
        const daysLeft = Math.ceil((data.dueDate - Date.now()) / (1000 * 60 * 60 * 24));
        const warningBanner = document.getElementById('payment-warning-banner');
        const blockOverlay = document.getElementById('payment-block-overlay');

        if (daysLeft < 0) {
            blockOverlay.style.display = 'flex';
            warningBanner.style.display = 'none';
            if (data.status === 'Aberto') {
                supabase.from('stores').update({ status: 'Fechado', isActive: false }).eq('id', loggedStore.id);
            }
        } else if (daysLeft <= 3) {
            blockOverlay.style.display = 'none';
            warningBanner.style.display = 'block';
            warningBanner.innerText = `⚠️ Atenção: Sua mensalidade vence em ${daysLeft} dia(s). Efetue o pagamento para evitar o bloqueio da loja.`;
        } else {
            blockOverlay.style.display = 'none';
            warningBanner.style.display = 'none';
        }
    }
};

// Initial load from storeProfile
applyStoreData(storeProfile);

// Subscribe to realtime store changes
supabase.channel(`store-config-${loggedStore.id}`)
    .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'stores',
        filter: `id=eq.${loggedStore.id}`
    }, (payload) => {
        Object.assign(loggedStore, payload.new);
        applyStoreData(payload.new);
    })
    .subscribe();

const updateDriverIndicators = () => {
    const indicators = document.querySelectorAll('.driver-status-indicator');
    indicators.forEach(ind => {
        if (onlineDriversCount > 0) {
            ind.style.background = '#ecfdf5';
            ind.style.color = 'var(--success)';
            ind.style.boxShadow = 'var(--shadow-sm)';
            ind.innerHTML = `🛵 ${onlineDriversCount} Entregador(es) Online`;
        } else {
            ind.style.background = 'var(--primary-soft)';
            ind.style.color = 'var(--primary)';
            ind.style.boxShadow = 'none';
            ind.innerHTML = `🛵 Nenhum entregador online`;
        }
    });
    window.renderOrders();
};

// Load initial driver count
(async () => {
    try {
        const { data: drivers } = await supabase
            .from('drivers')
            .select('id, isOnline, isActive')
            .eq('isActive', true);
        if (drivers) {
            onlineDriversCount = drivers.filter(d => d.isOnline === true || d.isOnline === 'true').length;
            updateDriverIndicators();
        }
    } catch (e) {
        console.error("Erro ao carregar entregadores:", e);
    }
})();

// Subscribe to driver changes
supabase.channel('drivers-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, async () => {
        const { data: drivers } = await supabase
            .from('drivers')
            .select('id, isOnline, isActive')
            .eq('isActive', true);
        if (drivers) {
            onlineDriversCount = drivers.filter(d => d.isOnline === true || d.isOnline === 'true').length;
            updateDriverIndicators();
        }
    })
    .subscribe();

const daysOfWeek = [
    { id: 'seg', name: 'Segunda-feira' }, { id: 'ter', name: 'Terça-feira' }, { id: 'qua', name: 'Quarta-feira' },
    { id: 'qui', name: 'Quinta-feira' }, { id: 'sex', name: 'Sexta-feira' }, { id: 'sab', name: 'Sábado' }, { id: 'dom', name: 'Domingo' }
];

window.renderScheduleUI = (scheduleData = {}) => {
    const container = document.getElementById('schedule-container');
    let html = '';
    daysOfWeek.forEach(day => {
        const data = scheduleData[day.id] || { active: true, open: '08:00', close: '18:00' };
        html += `
            <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 15px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px dashed var(--border);">
                <label style="width: 140px; display: flex; align-items: center; gap: 10px; margin: 0; font-weight:700; color:var(--text-dark); cursor:pointer;">
                    <input type="checkbox" id="sch-active-${day.id}" ${data.active ? 'checked' : ''} style="transform: scale(1.3); accent-color: var(--primary); cursor:pointer;"> 
                    ${day.name}
                </label>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <input type="time" id="sch-open-${day.id}" class="form-input" style="width: 120px;" value="${data.open}">
                    <span style="color: var(--text-muted); font-weight:700;">até</span>
                    <input type="time" id="sch-close-${day.id}" class="form-input" style="width: 120px;" value="${data.close}">
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
};

window.saveSchedule = async () => {
    const newSchedule = {};
    daysOfWeek.forEach(day => {
        newSchedule[day.id] = {
            active: document.getElementById(`sch-active-${day.id}`).checked,
            open: document.getElementById(`sch-open-${day.id}`).value,
            close: document.getElementById(`sch-close-${day.id}`).value
        };
    });
    try { await supabase.from('stores').update({ schedule: newSchedule }).eq('id', loggedStore.id); alert("Horários atualizados com sucesso!"); } catch(e) { alert("Ocorreu um erro ao salvar os horários."); }
};

window.saveStoreSettings = async () => {
    const deliveryFee = document.getElementById('cfg-delivery-fee').value;
    const deliveryTime = document.getElementById('cfg-delivery-time').value.trim();
    const pickupTime = document.getElementById('cfg-pickup-time').value.trim();
    const minOrder = document.getElementById('cfg-min-order').value;
    const paymentMethods = document.getElementById('cfg-payment-methods').value.trim();
    const pixKey = document.getElementById('cfg-pix-key').value.trim();
    const moreInfo = document.getElementById('cfg-more-info').value.trim();

    const dataToUpdate = {
        deliveryFee: deliveryFee === '' ? 0 : parseFloat(deliveryFee),
        deliveryTime: deliveryTime,
        pickupTime: pickupTime,
        minOrder: minOrder === '' ? 0 : parseFloat(minOrder),
        paymentMethods: paymentMethods,
        pixKey: pixKey,
        moreInfo: moreInfo
    };

    try {
        await supabase.from('stores').update(dataToUpdate).eq('id', loggedStore.id);
        alert("As configurações da loja foram atualizadas com sucesso e já aparecem para os clientes!");
    } catch(e) {
        alert("Erro ao salvar as configurações.");
    }
};

window.updateOrderStatus = async (btnElement, orderId, newStatus) => {
    const prevText = btnElement.innerHTML;
    btnElement.innerHTML = 'Aguarde...';
    btnElement.disabled = true;
    
    const updateObj = { status: newStatus };
    if (newStatus === 'Aceito') updateObj.acceptedAt = Date.now();
    if (newStatus === 'Em Preparo') updateObj.prepStartedAt = Date.now();
    if (newStatus === 'Saiu para Entrega' || newStatus === 'Pronto para Retirada') updateObj.dispatchedAt = Date.now();
    if (newStatus === 'Concluído' || newStatus === 'Entregue' || newStatus === 'Cancelado') updateObj.deliveredAt = Date.now();

    try {
        await supabase.from('orders').update(updateObj).eq('id', orderId);
    } catch(e) {
        console.error(e);
        alert("Erro ao atualizar status. Verifique sua conexão.");
        btnElement.innerHTML = prevText;
        btnElement.disabled = false;
    }
};

window.approvePix = async (btnElement, orderId, isApproved) => {
    const actionText = isApproved 
        ? "Confirmar que o valor do PIX já caiu na sua conta?" 
        : "Avisar o cliente que o PIX NÃO foi recebido/aprovado e RECUSAR este pedido?";
    
    if(confirm(actionText)) {
        const prevText = btnElement.innerHTML;
        btnElement.innerHTML = 'Aguarde...';
        btnElement.disabled = true;
        try {
            let updateData = { pixApproved: isApproved };
            if (!isApproved) {
                updateData.status = 'Cancelado';
            }
            await supabase.from('orders').update(updateData).eq('id', orderId);
        } catch(e) {
            alert("Erro ao processar o PIX.");
            btnElement.innerHTML = prevText;
            btnElement.disabled = false;
        }
    }
};

window.callPlatformDriver = async (btnElement, orderId, orderDeliveryFee) => {
    let confirmMessage = "";
    let driverFeeToSave = 5.00; 
    
    if (orderDeliveryFee && orderDeliveryFee > 0) {
        confirmMessage = `O cliente pagou R$ ${orderDeliveryFee.toFixed(2)} de taxa de entrega. Este valor cobrirá o entregador. Deseja confirmar a chamada?`;
    } else {
        confirmMessage = `O cliente teve Frete Grátis. O custo padrão do motoboy (R$ 5,00) ficará por conta da loja. Confirmar chamada?`;
    }

    if(confirm(confirmMessage)) {
        const prevText = btnElement.innerHTML;
        btnElement.innerHTML = 'Aguarde...';
        btnElement.disabled = true;
        try {
            await supabase.from('orders').update({
                status: 'Aguardando Entregador',
                platformDriverFee: driverFeeToSave,
                dispatchedAt: Date.now()
            }).eq('id', orderId);
        } catch(e) {
            alert("Erro ao solicitar entregador.");
            btnElement.innerHTML = prevText;
            btnElement.disabled = false;
        }
    }
};

// Load existing orders and subscribe to realtime changes
(async () => {
    try {
        const { data: existingOrders } = await supabase
            .from('orders')
            .select('*')
            .eq('storeId', loggedStore.id)
            .order('timestamp', { ascending: false })
            .limit(200);
        if (existingOrders) {
            globalOrders = existingOrders;
            previousOrderCount = globalOrders.filter(o => o.status === 'Pendente').length;
            window.renderOrders();
            window.renderReports();
        }
    } catch(e) {
        console.error("Erro ao carregar pedidos:", e);
    }
})();

supabase.channel(`store-orders-${loggedStore.id}`)
    .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `storeId=eq.${loggedStore.id}`
    }, async () => {
        // Reload all orders on any change
        const { data: updatedOrders } = await supabase
            .from('orders')
            .select('*')
            .eq('storeId', loggedStore.id)
            .order('timestamp', { ascending: false })
            .limit(200);
        if (updatedOrders) {
            globalOrders = updatedOrders;
            const currentPendingCount = globalOrders.filter(o => o.status === 'Pendente').length;
            if (previousOrderCount !== -1 && currentPendingCount > previousOrderCount) { triggerNewOrderAlert(); }
            previousOrderCount = currentPendingCount;
            window.renderOrders();
            window.renderReports();
        }
    })
    .subscribe();

window.renderOrders = () => {
    const colPendente = document.getElementById('list-pendente'); 
    const colPreparo = document.getElementById('list-preparo'); 
    const colRota = document.getElementById('list-rota'); 
    const colConcluido = document.getElementById('list-concluido');
    
    colPendente.innerHTML = ''; colPreparo.innerHTML = ''; colRota.innerHTML = ''; colConcluido.innerHTML = '';
    let cPend = 0, cPrep = 0, cRota = 0, cConc = 0;

    const filterValue = document.getElementById('filter-concluido').value;
    const nowTime = Date.now();
    const startOfToday = new Date().setHours(0,0,0,0);
    const startOf7Days = nowTime - (7 * 24 * 60 * 60 * 1000);
    const startOfMonth = nowTime - (30 * 24 * 60 * 60 * 1000);
    const startOfSemester = nowTime - (180 * 24 * 60 * 60 * 1000);

    const activeOrders = globalOrders.filter(o => !['Entregue', 'Concluído', 'Concluido', 'Cancelado'].includes(o.status));
    const completedOrders = globalOrders.filter(o => ['Entregue', 'Concluído', 'Concluido', 'Cancelado'].includes(o.status));

    activeOrders.sort((a, b) => a.timestamp - b.timestamp).forEach(order => {
        const cardHTML = buildOrderCard(order);
        if(order.status === 'Pendente') { colPendente.innerHTML += cardHTML; cPend++; } 
        else if(order.status === 'Aceito' || order.status === 'Em Preparo') { colPreparo.innerHTML += cardHTML; cPrep++; } 
        else if(order.status === 'Saiu para Entrega' || order.status === 'Aguardando Entregador' || order.status === 'Pronto para Retirada') { colRota.innerHTML += cardHTML; cRota++; }
    });

    completedOrders.sort((a, b) => b.timestamp - a.timestamp).forEach(order => {
        const cardHTML = buildOrderCard(order);
        let showOrder = true;
        if (filterValue === 'hoje') showOrder = order.timestamp >= startOfToday;
        else if (filterValue === '7dias') showOrder = order.timestamp >= startOf7Days;
        else if (filterValue === 'mes') showOrder = order.timestamp >= startOfMonth;
        else if (filterValue === 'semestre') showOrder = order.timestamp >= startOfSemester;

        if (showOrder) { colConcluido.innerHTML += cardHTML; cConc++; }
    });
    
    document.getElementById('count-pendente').innerText = cPend; 
    document.getElementById('count-preparo').innerText = cPrep; 
    document.getElementById('count-rota').innerText = cRota; 
    document.getElementById('count-concluido').innerText = cConc;

    activeOrders.forEach(order => {
        if (!chatListeners[order.id]) {
            initialLoadMsg[order.id] = true;

            // Load initial unread count
            supabase
                .from('order_messages')
                .select('id, sender, read')
                .eq('order_id', order.id)
                .then(({ data: msgs }) => {
                    if (msgs) {
                        const unread = msgs.filter(m => m.sender === 'customer' && !m.read).length;
                        window.unreadCounts[order.id] = unread;
                        const badge = document.getElementById(`badge-${order.id}`);
                        if (badge) {
                            if (unread > 0) { badge.innerText = unread; badge.style.display = 'inline-flex'; }
                            else { badge.style.display = 'none'; }
                        }
                    }
                });

            chatListeners[order.id] = supabase
                .channel(`order-messages-${order.id}`)
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'order_messages',
                    filter: `order_id=eq.${order.id}`
                }, async (payload) => {
                    const msg = payload.new;
                    if (msg.sender === 'customer') {
                        if (!initialLoadMsg[order.id]) {
                            if (currentChatOrderId === order.id) {
                                await supabase.from('order_messages').update({ read: true }).eq('id', msg.id);
                            } else {
                                window.showMsgToast(order.customerName || 'Cliente', msg.text, order.id);
                                window.playMsgSound();
                                window.unreadCounts[order.id] = (window.unreadCounts[order.id] || 0) + 1;
                                const badge = document.getElementById(`badge-${order.id}`);
                                if (badge) { badge.innerText = window.unreadCounts[order.id]; badge.style.display = 'inline-flex'; }
                            }
                        }
                    }
                    initialLoadMsg[order.id] = false;
                })
                .subscribe();
        }
    });
};

function buildOrderCard(order) {
    const shortId = order.id.substring(0, 6).toUpperCase();
    let orderDatePart = ''; let orderTimePart = '';
    if (order.date) { const dateParts = order.date.split(' '); orderDatePart = dateParts[0] || ''; orderTimePart = dateParts[1] || ''; }
    
    const itemsList = order.items.map(i => {
        let details = i.variant ? `(${i.variant})` : ''; 
        let obs = i.observation ? `<span class="item-obs" style="color:var(--primary)">Obs: ${i.observation}</span>` : '';
        let addons = i.addons && i.addons.length > 0 ? `<br><span style="color:var(--text-muted); font-size:0.8rem; font-weight:600;">+ ${i.addons.join(', ')}</span>` : '';
        return `<li style="margin-bottom:8px;"><b>${i.qty}x</b> <span style="font-weight:600;">${i.name}</span> ${details} ${addons} <br>${obs}</li>`;
    }).join('');
    
    let paymentBadge = ''; let payMethodText = order.paymentMethod || 'Não informado';
    if (payMethodText.includes('Dinheiro')) { paymentBadge = `<div class="payment-box pay-cash"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="2"></circle></svg> ${payMethodText}</div>`; } 
    else if (payMethodText.includes('Pix')) { paymentBadge = `<div class="payment-box pay-pix"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"></polygon><line x1="12" y1="22" x2="12" y2="15.5"></line><polyline points="22 8.5 12 15.5 2 8.5"></polyline><polyline points="2 15.5 12 8.5 22 15.5"></polyline><line x1="12" y1="2" x2="12" y2="8.5"></line></svg> ${payMethodText}</div>`; } 
    else { paymentBadge = `<div class="payment-box pay-card"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg> ${payMethodText}</div>`; }
    
    const isPickup = order.orderType === 'retirada' || (order.customer && order.customer.address && order.customer.address.includes('RETIRADA'));
    
    let addressHtml = ''; let orderTypeBadge = '';
    if (isPickup) {
        addressHtml = `<div class="address" style="background:#fef3c7; color:#92400e; font-weight:800; font-size: 0.95rem; text-align: center; border: 2px dashed #fcd34d; padding: 12px; display:flex; align-items:center; justify-content:center; gap:8px; border-radius: 12px;">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                        RETIRAR NA LOJA
                       </div>`;
        orderTypeBadge = `<span style="background:var(--warning); color:#fff; padding:4px 10px; border-radius:6px; font-size:0.75rem; font-weight:800; margin-left:10px;">RETIRADA</span>`;
    } else {
        addressHtml = `<div class="address">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; margin-top:2px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> 
                        <span style="font-weight:600;">${order.customer.address}</span>
                       </div>`;
        orderTypeBadge = `<span style="background:#eff6ff; color:#2563eb; padding:4px 10px; border-radius:6px; font-size:0.75rem; font-weight:800; margin-left:10px;">ENTREGA</span>`;
    }

    let discountHtml = '';
    if(order.discount && order.discount > 0) { discountHtml = `<div style="font-size:0.9rem; color:var(--primary); font-weight:800; text-align:right; margin-bottom:4px;">Cupom: - R$ ${order.discount.toFixed(2)}</div>`; }

    let actionBtn = ''; let sellerBadge = '';

    let pixApprovalHtml = '';
    if (payMethodText.toLowerCase().includes('pix')) {
        if (order.pixApproved === true) {
            pixApprovalHtml = `<div style="background:#ecfdf5; color:#047857; padding:10px; border-radius:8px; text-align:center; font-size:0.85rem; font-weight:800; margin-bottom:12px; border: 1px solid #a7f3d0;">✅ PIX Confirmado</div>`;
        } else if (order.pixApproved === false) {
            pixApprovalHtml = `<div style="background:var(--primary-soft); color:var(--primary); padding:10px; border-radius:8px; text-align:center; font-size:0.85rem; font-weight:800; margin-bottom:12px; border: 1px solid #fecaca;">❌ PIX Não Aprovado</div>`;
        } else if (order.status !== 'Cancelado') {
            pixApprovalHtml = `
            <div style="display:flex; gap:8px; margin-bottom:12px;">
                <button class="btn-action" style="background:var(--warning); flex:1; font-size:0.8rem; padding:10px;" onclick="window.approvePix(this, '${order.id}', true)">✅ Recebido</button>
                <button class="btn-action" style="background:var(--primary); flex:1; font-size:0.8rem; padding:10px;" onclick="window.approvePix(this, '${order.id}', false)">❌ Não Caiu</button>
            </div>`;
        }
    }

    if (order.status === 'Pendente') { 
        sellerBadge = `<span style="color:var(--primary); font-size:0.85rem; font-weight:800;">Novo Pedido</span>`;
        actionBtn = `
        <div style="display:flex; gap:10px;">
            <button class="btn-action btn-accept" style="flex:1;" onclick="window.updateOrderStatus(this, '${order.id}', 'Aceito')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Aceitar
            </button>
            <button class="btn-action" style="flex:1; background:var(--primary); color:#fff;" onclick="if(confirm('Tem certeza que deseja RECUSAR este pedido?')) window.updateOrderStatus(this, '${order.id}', 'Cancelado')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> Recusar
            </button>
        </div>`; 
    } 
    else if (order.status === 'Aceito') { 
        sellerBadge = `<span style="color:var(--warning); font-size:0.85rem; font-weight:800;">Aguardando Cozinha</span>`;
        actionBtn = `<button class="btn-action" style="background:var(--warning);" onclick="window.updateOrderStatus(this, '${order.id}', 'Em Preparo')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Iniciar Preparo</button>`; 
    } 
    else if (order.status === 'Em Preparo') { 
        sellerBadge = `<span style="color:#2563eb; font-size:0.85rem; font-weight:800;">Na Cozinha</span>`;
        if (isPickup) {
            actionBtn = `<button class="btn-action btn-dispatch" onclick="window.updateOrderStatus(this, '${order.id}', 'Pronto para Retirada')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg> Marcar como Pronto</button>`;
        } else {
            const feeArg = order.deliveryFee ? order.deliveryFee : 0;
            let driverCallBtn = '';
            if (onlineDriversCount > 0) {
                driverCallBtn = `<button class="btn-action btn-call-driver" onclick="window.callPlatformDriver(this, '${order.id}', ${feeArg})"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg> Solicitar Entregador UaiPede</button>`;
            } else {
                driverCallBtn = `<button class="btn-action" style="background:var(--border); color:var(--text-muted); cursor:not-allowed;" disabled>Nenhum entregador disponível.</button>`;
            }
            actionBtn = `<div style="display:flex; flex-direction:column; gap:10px;"><button class="btn-action btn-dispatch" onclick="window.updateOrderStatus(this, '${order.id}', 'Saiu para Entrega')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 18H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.09a2 2 0 0 0 1.51.67l2.88 3.33a2 2 0 0 0 1.51.67H21a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"></path><circle cx="8.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg> Saiu p/ Entrega (Próprio)</button>${driverCallBtn}</div>`; 
        }
    }
    else if (order.status === 'Aguardando Entregador') {
        sellerBadge = `<span style="color:#8b5cf6; font-size:0.85rem; font-weight:800;">Aguardando Motoboy</span>`;
        actionBtn = `<div style="text-align:center; margin-bottom: 12px; font-size: 0.95rem; color: #8b5cf6; font-weight: 800; display:flex; align-items:center; justify-content:center; gap:8px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 16 14"></polyline></svg>Entregador a caminho da loja...</div><button class="btn-action" style="background:var(--border); color:var(--text-dark);" onclick="window.updateOrderStatus(this, '${order.id}', 'Saiu para Entrega')">Forçar Saída</button>`;
    }
    else if (order.status === 'Pronto para Retirada') {
        sellerBadge = `<span style="color:#b45309; font-size:0.85rem; font-weight:800;">Aguardando Cliente</span>`;
        actionBtn = `<div style="text-align:center; margin-bottom: 12px; font-size: 0.95rem; color: #b45309; font-weight: 800; display:flex; align-items:center; justify-content:center; gap:8px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>Cliente vem buscar</div><button class="btn-action btn-accept" onclick="window.updateOrderStatus(this, '${order.id}', 'Concluído')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Entregue ao Cliente</button>`;
    }
    else if (order.status === 'Saiu para Entrega') {
        sellerBadge = `<span style="color:var(--warning); font-size:0.85rem; font-weight:800;">Em Rota</span>`;
        actionBtn = `<div style="text-align:center; margin-bottom: 12px; font-size: 0.95rem; color: var(--warning); font-weight: 800; display:flex; align-items:center; justify-content:center; gap:8px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 18H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.09a2 2 0 0 0 1.51.67l2.88 3.33a2 2 0 0 0 1.51.67H21a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"></path><circle cx="8.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>Com o Entregador</div><button class="btn-action btn-accept" onclick="window.updateOrderStatus(this, '${order.id}', 'Concluído')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Marcar como Entregue</button>`;
    }
    else if (order.status === 'Entregue' || order.status === 'Concluído' || order.status === 'Concluido') {
        sellerBadge = `<span style="color:var(--success); font-size:0.85rem; font-weight:800;">Finalizado</span>`;
        actionBtn = `<div style="text-align:center; color:var(--success); font-weight:800; font-size:1rem; display:flex; align-items:center; justify-content:center; gap:8px;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Pedido Concluído</div>`;
    }
    else if (order.status === 'Cancelado') {
        sellerBadge = `<span style="color:var(--primary); font-size:0.85rem; font-weight:800;">Cancelado</span>`;
        actionBtn = `<div style="text-align:center; color:var(--primary); font-weight:800; font-size:1rem; display:flex; align-items:center; justify-content:center; gap:8px;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> Cancelado</div>`;
    }

    const safeCustomerName = order.customerName ? order.customerName.replace(/'/g, "\\'") : 'Cliente';
    
    const unreadCount = window.unreadCounts && window.unreadCounts[order.id] ? window.unreadCounts[order.id] : 0;
    const badgeStyle = unreadCount > 0 ? 'display:inline-flex;' : 'display:none;';

    const chatBtn = `<button class="btn-chat-kanban" onclick="window.openChatModal('${order.id}', '${safeCustomerName}')" style="position:relative;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> 
        Chat com o Cliente
        <span class="chat-badge" id="badge-${order.id}" style="${badgeStyle}">${unreadCount}</span>
    </button>`;

    return `<div class="order-card" ${isPickup ? 'style="border-left: 5px solid var(--warning);"' : ''}><div class="order-header"><div style="display:flex; flex-direction:column;"><span class="order-id">#${shortId} ${orderTypeBadge}</span><div style="margin-top:5px;">${sellerBadge}</div></div><div class="order-time" style="font-size:0.8rem; color:var(--text-muted); text-align: right; display: flex; flex-direction: column; gap: 4px;"><strong style="color: var(--text-dark);">${orderDatePart}</strong><span style="font-weight:600;">${orderTimePart}</span></div></div><div class="customer-info"><strong style="display:flex; align-items:center; gap:8px; font-size:1.05rem;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>${order.customerName}</strong>${addressHtml}${chatBtn}</div><ul class="order-items" style="list-style:none; padding:0;">${itemsList}</ul>${paymentBadge}${discountHtml}<div class="order-total">R$ ${(order.total || 0).toFixed(2)}</div>${pixApprovalHtml}${actionBtn}</div>`;
}

// Load products and subscribe to realtime changes
const loadProducts = async () => {
    try {
        const { data: products } = await supabase
            .from('products')
            .select('*')
            .eq('storeId', loggedStore.id);
        if (products) {
            globalProducts = products;
            window.loadCategoriesAndProducts();
            window.renderStock();
        }
    } catch(e) {
        console.error("Erro ao carregar produtos:", e);
    }
};
loadProducts();

supabase.channel(`store-products-${loggedStore.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `storeId=eq.${loggedStore.id}` }, () => {
        loadProducts();
    })
    .subscribe();

window.renderStock = () => {
    const container = document.getElementById('stock-list-container');
    if (globalProducts.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:30px; font-weight:600; font-size:1.1rem; border: 2px dashed var(--border); border-radius: 12px;">Você ainda não cadastrou nenhum produto.</p>';
        return;
    }
    
    let sortedProducts = [...globalProducts].sort((a,b) => {
        if(a.hasStockControl === b.hasStockControl) return (a.name || '').localeCompare(b.name || '');
        return a.hasStockControl ? -1 : 1;
    });

    container.innerHTML = sortedProducts.map(p => {
        let isChecked = p.hasStockControl ? 'checked' : '';
        let qty = p.stockQuantity || 0;
        let min = p.minStock || 0;
        let displayInputs = p.hasStockControl ? 'flex' : 'none';
        
        let statusBadge = '';
        if (p.hasStockControl) {
            if (qty <= 0) statusBadge = `<span style="background:var(--primary-soft); color:var(--primary); padding:6px 12px; border-radius:6px; font-size:0.8rem; font-weight:800;">Esgotado (0)</span>`;
            else if (qty <= min) statusBadge = `<span style="background:#fef3c7; color:#b45309; padding:6px 12px; border-radius:6px; font-size:0.8rem; font-weight:800;">Baixo: ${qty} un</span>`;
            else statusBadge = `<span style="background:#ecfdf5; color:#047857; padding:6px 12px; border-radius:6px; font-size:0.8rem; font-weight:800;">Ok: ${qty} un</span>`;
        } else {
            statusBadge = `<span style="color:var(--text-muted); font-size:0.85rem; font-weight:800;">Ilimitado</span>`;
        }

        return `
        <div class="editor-card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:20px; padding: 20px;">
            <div style="display:flex; align-items:center; gap:20px; flex:1; min-width:250px;">
                <img src="${p.image || 'https://via.placeholder.com/60'}" style="width:65px; height:65px; border-radius:12px; object-fit:cover; border:1px solid var(--border);">
                <div>
                    <strong style="font-size:1.1rem; color:var(--text-dark); font-weight:800;">${p.name}</strong><br>
                    <div style="margin-top: 8px;">${statusBadge}</div>
                </div>
            </div>
            
            <div style="display:flex; align-items:center; gap:20px; flex-wrap:wrap; background:var(--bg-body); padding:15px 20px; border-radius:12px; border:1px solid var(--border);">
                <label style="display:flex; align-items:center; gap:10px; cursor:pointer; margin:0;">
                    <input type="checkbox" id="stock-toggle-${p.id}" ${isChecked} onchange="window.toggleProductStock('${p.id}', this.checked)" style="width:22px; height:22px; accent-color:var(--primary); cursor:pointer;">
                    <span style="font-size:0.95rem; font-weight:800; color:var(--text-dark);">Controlar</span>
                </label>
                
                <div id="stock-inputs-${p.id}" style="display:${displayInputs}; gap:15px; align-items:center;">
                    <div style="display:flex; flex-direction:column;">
                        <label style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px; font-weight:700;">Qtd Atual</label>
                        <input type="number" id="stock-qty-${p.id}" value="${qty}" style="width:80px; padding:10px; border-radius:8px; border:1px solid #cbd5e1; text-align:center; font-weight:800; font-size:1rem; outline:none;" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='#cbd5e1'">
                    </div>
                    <div style="display:flex; flex-direction:column;">
                        <label style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px; font-weight:700;">Mínimo</label>
                        <input type="number" id="stock-min-${p.id}" value="${min}" style="width:80px; padding:10px; border-radius:8px; border:1px solid #cbd5e1; text-align:center; font-weight:800; font-size:1rem; outline:none;" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='#cbd5e1'">
                    </div>
                    <button onclick="window.saveProductStock('${p.id}')" style="background:var(--primary); color:#fff; border:none; padding:12px 18px; border-radius:8px; font-weight:800; font-size:0.95rem; cursor:pointer; align-self:flex-end; transition:0.2s; box-shadow:0 4px 10px rgba(234, 29, 44, 0.2);">Salvar</button>
                </div>
            </div>
        </div>
        `;
    }).join('');
};

window.toggleProductStock = async (id, isChecked) => {
    document.getElementById(`stock-inputs-${id}`).style.display = isChecked ? 'flex' : 'none';
    try {
        await supabase.from('products').update({ hasStockControl: isChecked }).eq('id', id).eq('storeId', loggedStore.id);
    } catch(e) {
        alert("Erro ao ativar/desativar controle.");
    }
};

window.saveProductStock = async (id) => {
    const qty = parseInt(document.getElementById(`stock-qty-${id}`).value) || 0;
    const min = parseInt(document.getElementById(`stock-min-${id}`).value) || 0;
    if (qty < 0 || min < 0) return alert("Quantidades não podem ser negativas.");
    try {
        await supabase.from('products').update({ stockQuantity: qty, minStock: min }).eq('id', id).eq('storeId', loggedStore.id);
        alert("Estoque atualizado!");
    } catch(e) {
        alert("Erro ao salvar o estoque.");
    }
};

document.getElementById('ed-img-file').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(evt) { 
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 600; 
                const MAX_HEIGHT = 600;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                } else {
                    if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                editorImageBase64 = canvas.toDataURL('image/jpeg', 0.7);
                
                document.getElementById('ed-img-preview').src = editorImageBase64;
                document.getElementById('ed-img-preview').style.display = 'block';
            }
            img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
    }
});

window.toggleStockField = () => {
    const hasStock = document.getElementById('ed-has-stock').checked;
    document.getElementById('stock-field-container').style.display = hasStock ? 'block' : 'none';
    document.getElementById('stock-min-container').style.display = hasStock ? 'block' : 'none';
};

window.toggleWeightFields = () => {
    const unit = document.getElementById('ed-unit').value;
    const kgFields = document.getElementById('kg-fields');
    const priceInput = document.getElementById('ed-price');
    
    if(unit === 'kg') {
        kgFields.style.display = 'flex';
        priceInput.readOnly = true;
        priceInput.style.backgroundColor = 'var(--bg-body)';
        window.calcKgPrice();
    } else {
        kgFields.style.display = 'none';
        priceInput.readOnly = false;
        priceInput.style.backgroundColor = 'var(--surface)';
    }
};

window.calcKgPrice = () => {
    const priceKg = parseFloat(document.getElementById('ed-price-kg').value);
    const weight = parseFloat(document.getElementById('ed-weight').value);
    if(!isNaN(priceKg) && !isNaN(weight)) {
        document.getElementById('ed-price').value = (priceKg * weight).toFixed(2);
    } else {
        document.getElementById('ed-price').value = '';
    }
};

window.setPriceType = (type) => {
    currentPriceType = type;
    if (type === 'simples') {
        document.getElementById('tab-simples').classList.add('active'); document.getElementById('tab-variantes').classList.remove('active');
        document.getElementById('panel-simples').style.display = 'block'; document.getElementById('panel-variantes').style.display = 'none';
    } else {
        document.getElementById('tab-variantes').classList.add('active'); document.getElementById('tab-simples').classList.remove('active');
        document.getElementById('panel-variantes').style.display = 'block'; document.getElementById('panel-simples').style.display = 'none';
        if (editingVariants.length === 0) { editingVariants.push({ name: 'Pequeno', price: '' }); editingVariants.push({ name: 'Médio', price: '' }); }
        window.renderVariantList();
    }
};

window.renderVariantList = () => {
    const container = document.getElementById('variants-list-container'); const countBadge = document.getElementById('var-count');
    container.innerHTML = '';
    if(editingVariants.length > 0) { countBadge.innerText = editingVariants.length; countBadge.style.display = 'inline-block'; } 
    else { countBadge.style.display = 'none'; }
    editingVariants.forEach((v, index) => {
        container.innerHTML += `
            <div class="variant-row">
                <span class="drag-handle" style="font-size: 1.2rem; margin:0;">⋮⋮</span>
                <input type="text" class="form-input" placeholder="Ex: Pequeno" value="${v.name}" oninput="window.updateVarData(${index}, 'name', this.value)">
                <input type="number" class="form-input var-price" placeholder="R$ 0,00" value="${v.price}" step="0.01" oninput="window.updateVarData(${index}, 'price', this.value)">
                <button class="btn-rem-var" onclick="window.removeVariantRow(${index})" style="background:none; border:none; color:var(--primary); cursor:pointer; padding:5px; transition:0.2s;" title="Remover Variante">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>`;
    });
};

window.updateVarData = (index, field, value) => { if (field === 'price') editingVariants[index][field] = value !== '' ? parseFloat(value) : ''; else editingVariants[index][field] = value; };
window.addVariantRow = () => { editingVariants.push({ name: '', price: '' }); window.renderVariantList(); };
window.removeVariantRow = (index) => { editingVariants.splice(index, 1); window.renderVariantList(); };

window.promptNewCategory = async () => {
    const catName = prompt("Digite o nome da nova categoria:");
    if(catName && catName.trim() !== "") {
        if(!myCategories.includes(catName.trim())) {
            myCategories.push(catName.trim());
            try { await supabase.from('stores').update({ categories: myCategories }).eq('id', loggedStore.id); } catch(e) {}
        }
        else { alert("Esta categoria já existe!"); }
    }
};

window.deleteCategory = async (catName) => {
    if(confirm(`Tem certeza que deseja excluir a categoria "${catName}"?\nOs produtos serão movidos para a categoria "Destaques".`)) {
        myCategories = myCategories.filter(c => c !== catName);
        try { await supabase.from('stores').update({ categories: myCategories }).eq('id', loggedStore.id); } catch(e) {}
        globalProducts.forEach(async (p) => {
            if (p.category === catName) { try { await supabase.from('products').update({ category: 'Destaques' }).eq('id', p.id).eq('storeId', loggedStore.id); } catch(e){} }
        });
        if (document.getElementById('ed-category').value === catName) document.getElementById('ed-category').value = 'Destaques';
    }
};

window.editCategory = async (oldName) => {
    const newName = prompt(`Digite o novo nome para a categoria "${oldName}":`, oldName);
    if (newName && newName.trim() !== "" && newName.trim() !== oldName) {
        const cleanName = newName.trim();
        if (myCategories.includes(cleanName) || cleanName === 'Destaques') {
            alert("Já existe uma categoria com este nome!");
            return;
        }

        const index = myCategories.indexOf(oldName);
        if (index !== -1) {
            myCategories[index] = cleanName;
            
            try {
                // Atualiza o array de categorias na loja
                await supabase.from('stores').update({ categories: myCategories }).eq('id', loggedStore.id);

                // Atualiza todos os produtos desta categoria
                const productsToUpdate = globalProducts.filter(p => p.category === oldName);
                const batchPromises = productsToUpdate.map(p => supabase.from('products').update({ category: cleanName }).eq('id', p.id).eq('storeId', loggedStore.id));
                await Promise.all(batchPromises);

                // Atualiza o filtro se estiver ativo
                if (window.currentCategoryFilter === oldName) {
                    window.currentCategoryFilter = cleanName;
                }

                // Atualiza o select do editor se necessário
                if (document.getElementById('ed-category') && document.getElementById('ed-category').value === oldName) {
                    document.getElementById('ed-category').value = cleanName;
                }

                alert(`Categoria renomeada para "${cleanName}" com sucesso!`);
                window.loadCategoriesAndProducts();

            } catch (e) {
                alert("Erro ao editar a categoria.");
                console.error(e);
            }
        }
    }
};

window.setCategoryFilter = (catName) => {
    window.currentCategoryFilter = catName;
    window.loadCategoriesAndProducts();
};

window.loadCategoriesAndProducts = () => {
    const container = document.getElementById('product-list-container'); 
    const catSelect = document.getElementById('ed-category');
    const tabsContainer = document.querySelector('.list-header-tabs');

    container.innerHTML = ''; catSelect.innerHTML = ''; tabsContainer.innerHTML = '';

    let productCategories = globalProducts.map(p => p.category || 'Destaques');
    let orphanCats = productCategories.filter(c => !myCategories.includes(c) && c !== 'Destaques');
    
    let allUniqueCategories = ['Destaques', ...myCategories.filter(c => c !== 'Destaques'), ...new Set(orphanCats)];

    let tabsHTML = `<div class="list-tab ${window.currentCategoryFilter === 'Todas' ? 'active' : ''}" onclick="window.setCategoryFilter('Todas')">Todas</div>`;
    allUniqueCategories.forEach(catName => {
        tabsHTML += `<div class="list-tab ${window.currentCategoryFilter === catName ? 'active' : ''}" onclick="window.setCategoryFilter('${catName}')">${catName}</div>`;
        catSelect.innerHTML += `<option value="${catName}">${catName}</option>`;
    });
    tabsContainer.innerHTML = tabsHTML;

    let sortedProducts = [...globalProducts].sort((a, b) => {
        let orderA = a.order !== undefined ? a.order : 9999;
        let orderB = b.order !== undefined ? b.order : 9999;
        return orderA - orderB;
    });

    allUniqueCategories.forEach(catName => {
        if (window.currentCategoryFilter !== 'Todas' && window.currentCategoryFilter !== catName) return;

        const prodsInCat = sortedProducts.filter(p => (p.category || 'Destaques') === catName);
        
        const deleteBtnHTML = (catName !== 'Destaques') ? `<button class="btn-del-cat" title="Excluir Categoria" onclick="window.deleteCategory('${catName}')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>` : '';
        const editBtnHTML = (catName !== 'Destaques') ? `<button class="btn-del-cat" style="color: #2563eb;" title="Editar Categoria" onclick="window.editCategory('${catName}')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>` : '';
        const dragHandleHTML = (catName !== 'Destaques') ? `<span class="drag-handle" style="cursor: grab; margin-right: 10px; color: #cbd5e1; font-size: 1.2rem;" title="Arraste para reordenar a categoria">⋮⋮</span>` : '';
        const dragAttrs = (catName !== 'Destaques') ? `draggable="true" ondragstart="window.dragStartCat(event, '${catName}')" ondragover="window.dragOverCat(event)" ondrop="window.dropCat(event, '${catName}')" ondragenter="window.dragEnterCat(event)" ondragleave="window.dragLeaveCat(event)"` : '';

        let blockHTML = `
            <div class="category-block" id="block-cat-${catName}" ${dragAttrs} style="transition: border 0.2s;">
                <div class="category-header" style="cursor: ${catName !== 'Destaques' ? 'grab' : 'default'};">
                    <div style="display: flex; align-items: center;">
                        ${dragHandleHTML}
                        <div><span style="font-weight: 800; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.5px; opacity:0.8;">Nome da categoria</span><br><span style="color:var(--text-dark); font-size:1.25rem; font-weight:900; letter-spacing:-0.5px;">${catName}</span></div>
                    </div>
                    <div class="cat-actions"><button class="btn-add-prod-cat" onclick="window.openEditorNew('${catName}')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Novo Produto</button>${editBtnHTML}${deleteBtnHTML}</div>
                </div>`;
        
        if (prodsInCat.length === 0) { 
            blockHTML += `<div style="padding: 30px; font-size:0.95rem; color:var(--text-muted); text-align:center; font-weight: 600;" ondragover="window.dragOverEmpty(event)" ondrop="window.dropEmpty(event, '${catName}')">Nenhum produto cadastrado nesta categoria.</div>`; 
        } else {
            prodsInCat.forEach(p => {
                let subText = '';
                if (p.variants && p.variants.length > 0) { subText = `${p.variants.length} Variantes de Preço`; } 
                else {
                    if(p.unit === 'kg' && p.weight) { subText = `R$ ${(p.price || 0).toFixed(2)} (${p.weight}kg)`; } 
                    else { subText = `R$ ${(p.price || 0).toFixed(2)}`; }
                }
                let inactiveStyle = p.isActive === false ? 'opacity: 0.5; background: var(--bg-body);' : '';
                let inactiveBadge = p.isActive === false ? '<span style="background:var(--primary); color:#fff; font-size:0.7rem; font-weight:800; padding:2px 8px; border-radius:12px; margin-left:8px;">Inativo</span>' : '';
                let promoBadge = p.isPromo === true ? '<span style="background:var(--success); color:#fff; font-size:0.7rem; font-weight:900; padding:2px 8px; border-radius:12px; margin-left:8px; letter-spacing:0.5px; text-transform:uppercase;">Promoção</span>' : '';
                
                let stockBadge = '';
                if (p.hasStockControl) {
                    let stockColor = p.stockQuantity > 0 ? 'var(--success)' : 'var(--primary)';
                    let stockBg = p.stockQuantity > 0 ? '#ecfdf5' : 'var(--primary-soft)';
                    let stockText = p.stockQuantity > 0 ? `Estoque: ${p.stockQuantity}` : 'Esgotado';
                    stockBadge = `<span style="background:${stockBg}; color:${stockColor}; border:1px solid ${stockColor}; font-size:0.7rem; font-weight:800; padding:2px 8px; border-radius:12px; margin-left:8px; letter-spacing:0.5px;">${stockText}</span>`;
                }

                blockHTML += `
                    <div class="product-row" id="row-prod-${p.id}" style="${inactiveStyle}" draggable="true" ondragstart="window.dragStartProd(event, '${p.id}', '${catName}')" ondragover="window.dragOverProd(event)" ondrop="window.dropProd(event, '${p.id}', '${catName}')" ondragenter="window.dragEnterProd(event)" ondragleave="window.dragLeaveProd(event)">
                        <div class="drag-handle" style="cursor: grab;" onclick="event.stopPropagation()">⋮⋮</div>
                        <div style="display: flex; flex: 1; align-items: center;" onclick="window.openEditorEdit('${p.id}')">
                            <img src="${p.image}" class="row-img">
                            <div class="row-info"><div class="row-name" style="display:flex; align-items:center; flex-wrap:wrap;">${p.name} ${inactiveBadge} ${promoBadge} ${stockBadge}</div><div class="row-sub">${subText}</div></div>
                        </div>
                    </div>`;
            });
        }
        blockHTML += `</div>`; container.innerHTML += blockHTML;
    });
};

let draggedCatName = null;

window.dragStartCat = (e, catName) => {
    draggedCatName = catName;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
        let el = document.getElementById(`block-cat-${catName}`);
        if(el) el.style.opacity = '0.4';
    }, 0);
};

window.dragOverCat = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
};

window.dragEnterCat = (e) => {
    e.preventDefault();
    let block = e.target.closest('.category-block');
    if (block && block.id !== `block-cat-${draggedCatName}` && block.id !== 'block-cat-Destaques') {
        block.style.borderTop = '4px solid var(--primary)';
    }
};

window.dragLeaveCat = (e) => {
    let block = e.target.closest('.category-block');
    if (block) {
        block.style.borderTop = '';
    }
};

window.dropCat = async (e, targetCat) => {
    e.stopPropagation();
    e.preventDefault();

    let block = e.target.closest('.category-block');
    if (block) {
        block.style.borderTop = '';
        block.style.opacity = '1';
    }

    if(draggedCatName) {
        let draggedBlock = document.getElementById(`block-cat-${draggedCatName}`);
        if(draggedBlock) draggedBlock.style.opacity = '1';
    }

    if (!draggedCatName || draggedCatName === targetCat || targetCat === 'Destaques') {
        draggedCatName = null;
        return;
    }

    const draggedIndex = myCategories.indexOf(draggedCatName);
    let targetIndex = myCategories.indexOf(targetCat);
    
    if (draggedIndex > -1) {
        myCategories.splice(draggedIndex, 1);
        
        targetIndex = myCategories.indexOf(targetCat);
        if (targetIndex === -1) {
            myCategories.push(draggedCatName);
        } else {
            myCategories.splice(targetIndex, 0, draggedCatName);
        }
        
        try {
            await supabase.from('stores').update({ categories: myCategories }).eq('id', loggedStore.id);
        } catch(err) {
            console.error("Erro ao reordenar categoria", err);
        }
        
        window.loadCategoriesAndProducts();
    }

    draggedCatName = null;
};

let draggedProdId = null;
let draggedFromCat = null;

window.dragStartProd = (e, id, cat) => {
    e.stopPropagation(); 
    draggedProdId = id;
    draggedFromCat = cat;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => { e.target.style.opacity = '0.4'; }, 0);
};

window.dragOverProd = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
};

window.dragEnterProd = (e) => {
    e.preventDefault();
    let row = e.target.closest('.product-row');
    if (row && row.id !== `row-prod-${draggedProdId}`) {
        row.style.borderTop = '3px solid var(--primary)';
    }
};

window.dragLeaveProd = (e) => {
    let row = e.target.closest('.product-row');
    if (row) {
        row.style.borderTop = '';
        row.style.borderBottom = '';
    }
};

window.dragOverEmpty = (e) => { e.preventDefault(); };
window.dropEmpty = async (e, targetCat) => {
    e.preventDefault();
    if (!draggedProdId || draggedFromCat === targetCat) return;
    await supabase.from('products').update({ category: targetCat, order: 0 }).eq('id', draggedProdId).eq('storeId', loggedStore.id);
    draggedProdId = null;
    window.loadCategoriesAndProducts();
};

window.dropProd = async (e, targetId, targetCat) => {
    e.stopPropagation();
    e.preventDefault();

    let row = e.target.closest('.product-row');
    if (row) {
        row.style.borderTop = '';
        row.style.borderBottom = '';
        row.style.opacity = '1';
    }

    if (!draggedProdId || draggedProdId === targetId) {
        let draggedRow = document.getElementById(`row-prod-${draggedProdId}`);
        if(draggedRow) draggedRow.style.opacity = '1';
        return;
    }

    let catProducts = globalProducts.filter(p => (p.category || 'Destaques') === targetCat).sort((a, b) => (a.order || 0) - (b.order || 0));
    const draggedItemIndexGlobal = globalProducts.findIndex(p => p.id === draggedProdId);
    const draggedItem = globalProducts[draggedItemIndexGlobal];

    if (draggedFromCat !== targetCat) {
        draggedItem.category = targetCat;
        catProducts.push(draggedItem);
    }

    const draggedIndex = catProducts.findIndex(p => p.id === draggedProdId);
    const targetIndex = catProducts.findIndex(p => p.id === targetId);

    catProducts.splice(draggedIndex, 1);
    catProducts.splice(targetIndex, 0, draggedItem);

    const batchPromises = [];
    catProducts.forEach((prod, index) => {
        prod.order = index;
        const globalIndex = globalProducts.findIndex(gp => gp.id === prod.id);
        if(globalIndex > -1) globalProducts[globalIndex].order = index;

        batchPromises.push(supabase.from('products').update({ order: index, category: prod.category || 'Destaques' }).eq('id', prod.id).eq('storeId', loggedStore.id));
    });

    window.loadCategoriesAndProducts();

    try {
        await Promise.all(batchPromises);
    } catch (err) {
        console.error("Erro ao reordenar", err);
    }

    draggedProdId = null;
    draggedFromCat = null;
    return false;
};

document.addEventListener('dragend', (e) => {
    if (e.target.classList && e.target.classList.contains('product-row')) {
        e.target.style.opacity = '1';
    }
    if (e.target.classList && e.target.classList.contains('category-block')) {
        e.target.style.opacity = '1';
        e.target.style.borderTop = '';
    }
});

window.clearEditor = () => {
    currentEditingId = null; document.getElementById('ed-name').value = ''; document.getElementById('ed-desc').value = '';
    document.getElementById('ed-img-file').value = ''; document.getElementById('ed-img-preview').src = '';
    document.getElementById('ed-img-preview').style.display = 'none'; document.getElementById('btn-delete').style.display = 'none';
    editorImageBase64 = ''; document.getElementById('ed-price').value = ''; document.getElementById('ed-var-title').value = '';
    document.getElementById('ed-status').value = 'true'; document.getElementById('ed-promo').value = 'false';
    document.getElementById('ed-unit').value = 'un'; document.getElementById('ed-price-kg').value = ''; document.getElementById('ed-weight').value = '';
    document.getElementById('kg-fields').style.display = 'none'; document.getElementById('ed-price').readOnly = false; document.getElementById('ed-price').style.backgroundColor = 'var(--surface)';
    
    document.getElementById('ed-has-stock').checked = false; 
    document.getElementById('ed-stock-qty').value = ''; 
    document.getElementById('ed-stock-min').value = ''; 
    window.toggleStockField();

    editingVariants = []; editingModifiers = []; window.updateModBadge(); window.setPriceType('simples'); 
    document.querySelectorAll('.product-row').forEach(row => row.classList.remove('selected'));
};

window.openEditorNew = (categoryName) => { window.clearEditor(); document.getElementById('ed-category').value = categoryName; document.getElementById('ed-name').focus(); };

window.openEditorEdit = (productId) => {
    window.clearEditor(); currentEditingId = productId;
    document.querySelectorAll('.product-row').forEach(row => row.classList.remove('selected')); document.getElementById(`row-prod-${productId}`).classList.add('selected');
    const prod = globalProducts.find(p => p.id === productId);
    if(prod) {
        document.getElementById('ed-name').value = prod.name; document.getElementById('ed-desc').value = prod.desc || '';
        document.getElementById('ed-category').value = prod.category || 'Destaques'; document.getElementById('btn-delete').style.display = 'inline-block';
        if(prod.image && prod.image !== 'https://via.placeholder.com/150') { editorImageBase64 = prod.image; document.getElementById('ed-img-preview').src = editorImageBase64; document.getElementById('ed-img-preview').style.display = 'block'; }
        if (prod.variants && prod.variants.length > 0) { window.setPriceType('variantes'); editingVariants = [...prod.variants]; document.getElementById('ed-var-title').value = prod.variantTitle || ''; window.renderVariantList(); } 
        else { window.setPriceType('simples'); document.getElementById('ed-price').value = prod.price; }
        
        document.getElementById('ed-status').value = prod.isActive !== false ? 'true' : 'false';
        document.getElementById('ed-promo').value = prod.isPromo === true ? 'true' : 'false';
        
        document.getElementById('ed-unit').value = prod.unit || 'un';
        if(prod.unit === 'kg') {
            document.getElementById('ed-price-kg').value = prod.priceKg || '';
            document.getElementById('ed-weight').value = prod.weight || '';
        }
        window.toggleWeightFields();
        
        document.getElementById('ed-has-stock').checked = prod.hasStockControl === true;
        document.getElementById('ed-stock-qty').value = prod.stockQuantity !== undefined ? prod.stockQuantity : '';
        document.getElementById('ed-stock-min').value = prod.minStock !== undefined ? prod.minStock : '';
        window.toggleStockField();

        editingModifiers = prod.modifiers ? JSON.parse(JSON.stringify(prod.modifiers)) : []; window.updateModBadge();
    }
};

window.saveEditingProduct = async () => {
    const name = document.getElementById('ed-name').value.trim(); const desc = document.getElementById('ed-desc').value.trim(); const category = document.getElementById('ed-category').value;
    const isActive = document.getElementById('ed-status').value === 'true';
    const isPromo = document.getElementById('ed-promo').value === 'true';
    const unit = document.getElementById('ed-unit').value;
    
    const hasStockControl = document.getElementById('ed-has-stock').checked;
    let stockQuantity = null;
    let minStock = null;
    if (hasStockControl) {
        stockQuantity = parseInt(document.getElementById('ed-stock-qty').value);
        minStock = parseInt(document.getElementById('ed-stock-min').value);
        if (isNaN(stockQuantity) || stockQuantity < 0) return alert("Informe uma quantidade válida para o estoque atual.");
        if (isNaN(minStock) || minStock < 0) minStock = 0;
    }

    let finalPrice = 0; let finalVariants = []; let varTitle = '';
    let priceKg = null; let weight = null;

    if (!name) return alert("O Nome do produto é obrigatório!");
    if (currentPriceType === 'simples') {
        finalPrice = parseFloat(document.getElementById('ed-price').value); if (isNaN(finalPrice)) return alert("Preço é obrigatório!");
        if(unit === 'kg') {
            priceKg = parseFloat(document.getElementById('ed-price-kg').value) || 0; weight = parseFloat(document.getElementById('ed-weight').value) || 0;
            if(priceKg <= 0 || weight <= 0) return alert("Para produtos por Kg, preencha o valor do Kg e o peso da peça!");
        }
    } else {
        finalVariants = editingVariants.filter(v => v.name.trim() !== '' && v.price !== '');
        if (finalVariants.length === 0) return alert("Adicione pelo menos uma variante válida!");
        finalPrice = parseFloat(finalVariants[0].price); varTitle = document.getElementById('ed-var-title').value.trim() || 'Escolha uma opção';
    }
    
    const prodData = {
        storeId: loggedStore.id, name, desc, price: finalPrice, category,
        isActive, isPromo, unit, priceKg, weight,
        hasStockControl, stockQuantity, minStock,
        variants: finalVariants, variantTitle: varTitle, modifiers: editingModifiers
    };
    
    if(unit !== 'kg') { delete prodData.priceKg; delete prodData.weight; }
    if(editorImageBase64) prodData.image = editorImageBase64;

    try {
        if (currentEditingId) {
            const { error } = await supabase.from('products').update(prodData).eq('id', currentEditingId).eq('storeId', loggedStore.id);
            if (error) throw error;
            alert("Produto atualizado com sucesso!");
        } else {
            if(!editorImageBase64) prodData.image = 'https://via.placeholder.com/150';
            const { error } = await supabase.from('products').insert([prodData]);
            if (error) throw error;
            alert("Produto salvo com sucesso!");
        }
        window.clearEditor();
    } catch(e) {
        alert("Erro ao salvar produto: " + e.message);
        console.error("Supabase Error:", e);
    }
};

window.deleteEditingProduct = async () => {
    if(!currentEditingId) return;
    if(confirm("Deseja desativar este produto do seu cardápio?")) {
        try {
            await supabase.from('products').update({ active: false, isActive: false }).eq('id', currentEditingId).eq('storeId', loggedStore.id);
            window.clearEditor();
        } catch(e) {}
    }
};

window.updateModBadge = () => { document.getElementById('mod-count-badge').innerText = editingModifiers.length; document.getElementById('mod-header-count').innerText = editingModifiers.length; };
window.openModifiersModal = () => { document.getElementById('modifiers-modal').classList.add('active'); window.renderModifiersScreen(); };
window.closeModifiersModal = () => { document.getElementById('modifiers-modal').classList.remove('active'); window.updateModBadge(); };
window.addModCategory = () => { editingModifiers.push({ name: 'Nova Opção', isRequired: true, isMultiple: false, options: [ { name: '', price: '' } ] }); window.renderModifiersScreen(); };
window.removeModCategory = (index) => { if(confirm("Excluir esta categoria de modificador inteira?")) { editingModifiers.splice(index, 1); window.renderModifiersScreen(); } };
window.updateModCat = (index, field, value) => { editingModifiers[index][field] = value; };
window.addModOption = (catIndex) => { editingModifiers[catIndex].options.push({ name: '', price: '' }); window.renderModifiersScreen(); };
window.removeModOption = (catIndex, optIndex) => { editingModifiers[catIndex].options.splice(optIndex, 1); window.renderModifiersScreen(); };
window.updateModOpt = (catIndex, optIndex, field, value) => { editingModifiers[catIndex].options[optIndex][field] = value; };

window.renderModifiersScreen = () => {
    window.updateModBadge(); const container = document.getElementById('modifiers-list-render'); container.innerHTML = '';
    if(editingModifiers.length === 0) { container.innerHTML = `<div style="text-align:center; padding: 40px; color:var(--text-muted); font-weight: 700; font-size:1.1rem; border: 2px dashed var(--border); border-radius: 12px; margin: 20px;">Nenhuma categoria de modificador criada.<br>Clique em "+ Categoria" acima.</div>`; return; }
    editingModifiers.forEach((cat, cIndex) => {
        let optionsHtml = '';
        cat.options.forEach((opt, oIndex) => {
            optionsHtml += `
            <div style="display:flex; align-items:center; gap:15px; margin-bottom:15px; background:var(--surface); padding:15px 20px; border-radius:12px; border:1px solid var(--border); box-shadow: var(--shadow-sm);">
                <span style="color:#cbd5e1; font-size:1.5rem; cursor:grab;">⋮⋮</span>
                <div style="flex:2;"><label style="font-size:0.75rem; color:var(--text-muted); font-weight:800; text-transform:uppercase;">Nome do modificador</label><input type="text" value="${opt.name}" class="form-input" placeholder="Ex: Queijo Cheddar" oninput="window.updateModOpt(${cIndex}, ${oIndex}, 'name', this.value)"></div>
                <div style="flex:1;"><label style="font-size:0.75rem; color:var(--text-muted); font-weight:800; text-transform:uppercase;">Preço</label><input type="number" step="0.01" value="${opt.price}" class="form-input" placeholder="R$ 0,00" oninput="window.updateModOpt(${cIndex}, ${oIndex}, 'price', this.value)"></div>
                <button style="background:var(--primary-soft); border:none; padding:12px; border-radius:8px; color:var(--primary); cursor:pointer; margin-top:20px; transition:0.2s;" title="Remover Opção" onclick="window.removeModOption(${cIndex}, ${oIndex})">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>`;
        });
        container.innerHTML += `
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:16px; margin-bottom:30px; overflow:hidden; box-shadow: var(--shadow-md);">
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-body); padding:20px 30px; border-bottom:1px solid var(--border);">
                <div style="position:relative; flex:1; max-width: 400px;"><label style="position:absolute; top:-10px; left:16px; background:var(--bg-body); font-size:0.75rem; color:var(--primary); padding:0 8px; font-weight:900; text-transform:uppercase;">Título da Categoria</label><input type="text" value="${cat.name}" style="width:100%; padding:14px 20px; border:2px solid var(--primary); border-radius:12px; font-weight:900; font-size: 1.1rem; color:var(--text-dark); outline:none; background:var(--surface);" oninput="window.updateModCat(${cIndex}, 'name', this.value)"></div>
                <button style="background:var(--primary-soft); color:var(--primary); border:1px solid #fecaca; padding:12px 20px; border-radius:10px; font-weight:800; cursor:pointer; font-size:0.9rem; transition:0.2s;" onclick="window.removeModCategory(${cIndex})">✕ Excluir Categoria</button>
            </div>
            <div style="padding:30px;">
                <div style="display:flex; gap:30px; flex-wrap:wrap; margin-bottom:30px; background:var(--bg-body); padding:25px; border-radius:12px; border: 1px solid var(--border);">
                    <div style="flex:1; min-width:220px;"><span style="font-size:0.85rem; font-weight:900; color:var(--text-dark); display:block; margin-bottom:12px; text-transform:uppercase;">Condição do Cliente</span>
                        <label style="display:flex; align-items:center; gap:10px; font-size:0.95rem; color:var(--text-dark); font-weight:700; cursor:pointer; margin-bottom:10px;"><input type="radio" name="req_${cIndex}" ${cat.isRequired ? 'checked' : ''} style="transform:scale(1.3); accent-color:var(--primary);" onchange="window.updateModCat(${cIndex}, 'isRequired', true)"> Escolha Obrigatória</label>
                        <label style="display:flex; align-items:center; gap:10px; font-size:0.95rem; color:var(--text-dark); font-weight:700; cursor:pointer;"><input type="radio" name="req_${cIndex}" ${!cat.isRequired ? 'checked' : ''} style="transform:scale(1.3); accent-color:var(--primary);" onchange="window.updateModCat(${cIndex}, 'isRequired', false)"> Escolha Opcional</label>
                    </div>
                    <div style="flex:1; min-width:220px;"><span style="font-size:0.85rem; font-weight:900; color:var(--text-dark); display:block; margin-bottom:12px; text-transform:uppercase;">Limite de Escolha</span>
                        <label style="display:flex; align-items:center; gap:10px; font-size:0.95rem; color:var(--text-dark); font-weight:700; cursor:pointer; margin-bottom:10px;"><input type="radio" name="mult_${cIndex}" ${!cat.isMultiple ? 'checked' : ''} style="transform:scale(1.3); accent-color:var(--primary);" onchange="window.updateModCat(${cIndex}, 'isMultiple', false)"> Apenas 1 modificador</label>
                        <label style="display:flex; align-items:center; gap:10px; font-size:0.95rem; color:var(--text-dark); font-weight:700; cursor:pointer;"><input type="radio" name="mult_${cIndex}" ${cat.isMultiple ? 'checked' : ''} style="transform:scale(1.3); accent-color:var(--primary);" onchange="window.updateModCat(${cIndex}, 'isMultiple', true)"> Vários modificadores</label>
                    </div>
                </div>
                <div style="background:var(--surface); border:2px dashed var(--border); padding:25px; border-radius:12px;">
                    <h4 style="font-size:1.1rem; font-weight:900; color:var(--text-dark); margin-bottom:20px; display:flex; align-items:center; justify-content:space-between;">Opções de Adicionais <span style="background:var(--bg-body); color:var(--text-muted); padding:4px 12px; border-radius:12px; font-size:0.85rem; border:1px solid var(--border);">${cat.options.length} opções</span></h4>
                    ${optionsHtml}
                    <button style="background:#eff6ff; border:none; color:#2563eb; font-weight:800; cursor:pointer; font-size:1rem; margin-top:20px; padding: 14px 24px; border-radius:10px; display:flex; align-items:center; gap:8px; transition:0.2s;" onclick="window.addModOption(${cIndex})"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Nova Opção</button>
                </div>
            </div>
        </div>`;
    });
};

window.currentSalesTab = 'total';
window.chartData = null;

window.forceDateFilter = () => {
    const select = document.getElementById('filter-reports');
    let optionData = Array.from(select.options).find(opt => opt.value === 'data');
    if (!optionData) {
        optionData = new Option('Data Específica', 'data');
        optionData.style.display = 'none';
        select.add(optionData);
    }
    select.value = 'data';
    window.renderReports();
};

window.clearDateFilter = () => {
    document.getElementById('filter-reports-date').value = '';
    window.renderReports();
};

function calcTrendHtml(curr, prev) {
    if (prev === 0 && curr > 0) return `<div class="trend trend-up">▴ +100%</div>`;
    if (prev === 0 && curr === 0) return `<div class="trend" style="color:#a6a6a6;">- 0%</div>`;
    const diff = ((curr - prev) / prev) * 100;
    if (diff > 0) return `<div class="trend trend-up">▴ +${diff.toFixed(2).replace('.',',')}%</div>`;
    if (diff < 0) return `<div class="trend trend-down">▾ ${diff.toFixed(2).replace('.',',')}%</div>`;
    return `<div class="trend" style="color:#a6a6a6;">- 0%</div>`;
}

window.setSalesTab = (tab) => {
    window.currentSalesTab = tab;
    document.querySelectorAll('#btn-group-vendas .ifood-toggle-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-vendas-${tab}`).classList.add('active');
    if (window.chartData) window.renderSalesChart();
};

window.renderSalesChart = () => {
    const data = window.chartData;
    if(!data) return;
    const currData = data.curr[window.currentSalesTab];
    const prevData = data.prev[window.currentSalesTab];
    const labels = data.labels;

    const maxChartVal = Math.max(...currData, ...prevData, 1);
    const w = 800; const h = 140;
    const stepX = labels.length > 1 ? (w / (labels.length - 1)) : w;
    
    let currPoints = currData.map((val, i) => `${i * stepX},${h - ((val/maxChartVal) * (h-30)) - 15}`).join(' ');
    let prevPoints = prevData.map((val, i) => `${i * stepX},${h - ((val/maxChartVal) * (h-30)) - 15}`).join(' ');

    if(labels.length === 1) {
        currPoints = `0,${h - ((currData[0]/maxChartVal)*(h-30))-15} ${w},${h - ((currData[0]/maxChartVal)*(h-30))-15}`;
        prevPoints = `0,${h - ((prevData[0]/maxChartVal)*(h-30))-15} ${w},${h - ((prevData[0]/maxChartVal)*(h-30))-15}`;
    }

    let metricName = "vendas realizadas";
    if(window.currentSalesTab === 'valor') metricName = "R$ faturados";
    if(window.currentSalesTab === 'ticket') metricName = "R$ de ticket médio";
    if(window.currentSalesTab === 'novos') metricName = "novos clientes";

    document.getElementById('ifd-chart-container').innerHTML = `
        <svg width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="overflow:visible;">
            <polyline points="${prevPoints}" fill="none" stroke="#fecaca" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="${currPoints}" fill="none" stroke="var(--primary)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div style="display:flex; justify-content:space-between; margin-top:15px; font-size:0.75rem; color:var(--text-muted); font-weight:600;">
            ${labels.map(l => `<span style="flex:1; text-align:${labels.length===1 ? 'center' : 'left'};">${l}</span>`).join('')}
        </div>
        <div style="text-align:center; font-size:0.8rem; color:var(--text-muted); font-weight:700; margin-top:20px;">
            <span style="display:inline-flex; align-items:center; gap:6px; margin-right:20px;"><div style="width:10px; height:10px; border-radius:50%; background:var(--primary);"></div> ${metricName} (período selecionado)</span>
            <span style="display:inline-flex; align-items:center; gap:6px;"><div style="width:10px; height:10px; border-radius:50%; background:#fecaca;"></div> (período anterior)</span>
        </div>
    `;
};

window.currentHoursTab = 'semana';
window.currentFilteredOrders = [];

window.setHoursTab = (tab) => {
    window.currentHoursTab = tab;
    document.querySelectorAll('#btn-group-horarios .ifood-toggle-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-horarios-${tab}`).classList.add('active');
    
    const desc = document.getElementById('horarios-desc');
    if(tab === 'semana') desc.innerText = "Análise dos horários de pico (Segunda a Sexta)";
    else desc.innerText = "Análise dos horários de pico (Sábado e Domingo)";

    if (window.currentFilteredOrders) window.renderPeakHours();
};

window.renderPeakHours = () => {
    const hoursSales = { "10:00 - 12:00":0, "12:00 - 14:00":0, "14:00 - 16:00":0, "16:00 - 18:00":0, "18:00 - 20:00":0, "20:00 - 22:00":0, "22:00 - 00:00":0 };
    
    let targetOrders = window.currentFilteredOrders;
    if (window.currentHoursTab === 'semana') {
        targetOrders = targetOrders.filter(o => { const d = new Date(o.timestamp).getDay(); return d >= 1 && d <= 5; });
    } else {
        targetOrders = targetOrders.filter(o => { const d = new Date(o.timestamp).getDay(); return d === 0 || d === 6; });
    }

    targetOrders.forEach(o => {
        const hour = new Date(o.timestamp).getHours();
        let bucket = "";
        if(hour >= 10 && hour < 12) bucket = "10:00 - 12:00";
        else if(hour >= 12 && hour < 14) bucket = "12:00 - 14:00";
        else if(hour >= 14 && hour < 16) bucket = "14:00 - 16:00";
        else if(hour >= 16 && hour < 18) bucket = "16:00 - 18:00";
        else if(hour >= 18 && hour < 20) bucket = "18:00 - 20:00";
        else if(hour >= 20 && hour < 22) bucket = "20:00 - 22:00";
        else if(hour >= 22 || hour < 10) bucket = "22:00 - 00:00";
        if(bucket) hoursSales[bucket] += 1;
    });
    
    const maxHour = Math.max(...Object.values(hoursSales), 1);
    let bestHourStr = "Nenhum", bestHourVal = 0;

    const horariosHtml = Object.entries(hoursSales).map(([hour, count]) => {
        if(count > bestHourVal) { bestHourVal = count; bestHourStr = hour; }
        const pct = (count / maxHour) * 100;
        return `
        <div class="bar-horizontal">
            <div class="label">${hour}</div>
            <div class="track"><div class="fill" style="width:${pct}%;"></div></div>
            <div class="value">${count > 0 ? count : ''}</div>
        </div>`;
    }).join('');
    
    document.getElementById('ifd-horarios-list').innerHTML = horariosHtml;
    document.getElementById('ifd-melhor-horario').innerHTML = `${bestHourStr} <span style="font-size:0.9rem; color:var(--text-muted); font-weight:600;">${bestHourVal} vendas</span>`;
};

window.renderReports = () => {
    const filterValue = document.getElementById('filter-reports').value;
    const filterDateStr = document.getElementById('filter-reports-date').value;
    
    const nowTime = Date.now();
    let startTime = 0;
    let prevStartTime = 0;
    let prevEndTime = 0;

    if (filterDateStr && filterValue === 'data') {
        const targetDate = new Date(filterDateStr + 'T00:00:00');
        startTime = targetDate.getTime() + (targetDate.getTimezoneOffset() * 60000); 
        prevStartTime = startTime - 86400000; 
        prevEndTime = startTime;
    } else {
        if (filterValue === 'hoje') {
            startTime = new Date().setHours(0,0,0,0);
            prevStartTime = startTime - 86400000;
            prevEndTime = startTime;
        } else if (filterValue === '7dias') {
            startTime = nowTime - (7 * 86400000);
            prevStartTime = startTime - (7 * 86400000);
            prevEndTime = startTime;
        } else if (filterValue === 'mes') {
            startTime = nowTime - (30 * 86400000);
            prevStartTime = startTime - (30 * 86400000);
            prevEndTime = startTime;
        } else if (filterValue === 'semestre') {
            startTime = nowTime - (180 * 86400000);
            prevStartTime = startTime - (180 * 86400000);
            prevEndTime = startTime;
        } else {
            startTime = 0; // todos
            prevStartTime = 0;
            prevEndTime = 0;
        }
    }

    const validOrders = globalOrders.filter(o => ['Entregue', 'Concluído', 'Concluido'].includes(o.status));
    
    const currentOrders = validOrders.filter(o => {
        if(filterValue === 'data') return o.timestamp >= startTime && o.timestamp < startTime + 86400000;
        return o.timestamp >= startTime && o.timestamp <= nowTime;
    });
    const prevOrders = validOrders.filter(o => o.timestamp >= prevStartTime && o.timestamp < prevEndTime);

    // 1. Cálculos de Vendas Gerais
    let totalRevenue = 0, prevRevenue = 0;
    currentOrders.forEach(o => totalRevenue += (o.total || 0));
    prevOrders.forEach(o => prevRevenue += (o.total || 0));
    
    const totalOrders = currentOrders.length;
    const prevTotalOrders = prevOrders.length;

    const avgTicket = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;
    const prevAvgTicket = prevTotalOrders > 0 ? (prevRevenue / prevTotalOrders) : 0;

    const customerCounts = {}, prevCustomerCounts = {};
    currentOrders.forEach(o => { const name = o.customerName || 'Cliente'; customerCounts[name] = (customerCounts[name] || 0) + 1; });
    prevOrders.forEach(o => { const name = o.customerName || 'Cliente'; prevCustomerCounts[name] = (prevCustomerCounts[name] || 0) + 1; });
    
    let newCustomers = 0, prevNewCustomers = 0;
    const nCurrSet = new Set(), nPrevSet = new Set();
    
    currentOrders.forEach(o => {
        if (!validOrders.some(vo => vo.customerName === o.customerName && vo.timestamp < startTime)) {
            nCurrSet.add(o.customerName);
        }
    });
    newCustomers = nCurrSet.size;

    prevOrders.forEach(o => {
        if (!validOrders.some(vo => vo.customerName === o.customerName && vo.timestamp < prevStartTime)) {
            nPrevSet.add(o.customerName);
        }
    });
    prevNewCustomers = nPrevSet.size;

    document.getElementById('ifd-vendas-total').innerText = totalOrders;
    document.getElementById('ifd-vendas-valor').innerText = `R$ ${totalRevenue.toFixed(2).replace('.', ',')}`;
    document.getElementById('ifd-vendas-ticket').innerText = `R$ ${avgTicket.toFixed(2).replace('.', ',')}`;
    document.getElementById('ifd-vendas-novos').innerText = newCustomers;

    document.getElementById('ifd-trend-vendas-total').innerHTML = calcTrendHtml(totalOrders, prevTotalOrders);
    document.getElementById('ifd-trend-vendas-valor').innerHTML = calcTrendHtml(totalRevenue, prevRevenue);
    document.getElementById('ifd-trend-vendas-ticket').innerHTML = calcTrendHtml(avgTicket, prevAvgTicket);
    document.getElementById('ifd-trend-vendas-novos').innerHTML = calcTrendHtml(newCustomers, prevNewCustomers);

    // 2. Extrapolação de Funil
    const baseO = totalOrders;
    const revisao = Math.floor(baseO * 1.34);
    const sacola = Math.floor(baseO * 1.85);
    const visu = Math.floor(baseO * 3.40);
    const visitas = Math.floor(baseO * 6.80);

    const pBaseO = prevTotalOrders;
    const pRevisao = Math.floor(pBaseO * 1.34);
    const pSacola = Math.floor(pBaseO * 1.85);
    const pVisu = Math.floor(pBaseO * 3.40);
    const pVisitas = Math.floor(pBaseO * 6.80);

    document.getElementById('ifd-funnel-concluidos').innerText = baseO;
    document.getElementById('ifd-funnel-revisao').innerText = revisao;
    document.getElementById('ifd-funnel-sacola').innerText = sacola;
    document.getElementById('ifd-funnel-visu').innerText = visu;
    document.getElementById('ifd-funnel-visitas').innerText = visitas;

    document.getElementById('ifd-trend-concluidos').innerHTML = calcTrendHtml(baseO, pBaseO);
    document.getElementById('ifd-trend-revisao').innerHTML = calcTrendHtml(revisao, pRevisao);
    document.getElementById('ifd-trend-sacola').innerHTML = calcTrendHtml(sacola, pSacola);
    document.getElementById('ifd-trend-visu').innerHTML = calcTrendHtml(visu, pVisu);
    document.getElementById('ifd-trend-visitas').innerHTML = calcTrendHtml(visitas, pVisitas);

    const getPct = (val, max) => max > 0 ? ((val/max)*100).toFixed(2).replace('.',',') + '%' : '0%';
    document.getElementById('ifd-pct-concluidos').innerHTML = `${getPct(baseO, visitas)}`;
    document.getElementById('ifd-pct-revisao').innerHTML = `${getPct(revisao, visitas)}`;
    document.getElementById('ifd-pct-sacola').innerHTML = `${getPct(sacola, visitas)}`;
    document.getElementById('ifd-pct-visu').innerHTML = `${getPct(visu, visitas)}`;

    // 3. Gerar Dados do Gráfico de Linhas (Vendas por Data)
    const daysRange = filterValue === 'hoje' || filterValue === 'data' ? 1 : (filterValue === '7dias' ? 7 : (filterValue === 'mes' ? 30 : 6));
    
    window.chartData = { labels: [], curr: { total:[], valor:[], ticket:[], novos:[] }, prev: { total:[], valor:[], ticket:[], novos:[] } };
    
    if (daysRange > 1) {
        const interval = daysRange === 6 ? 30 : 1; 
        const multiplier = interval * 86400000;
        
        for(let i = daysRange - 1; i >= 0; i--) {
            let dStart = nowTime - (i + 1) * multiplier;
            let dEnd = nowTime - i * multiplier;
            
            if(filterValue === 'semestre') {
                let d = new Date(); d.setMonth(d.getMonth() - i);
                window.chartData.labels.push(d.toLocaleDateString('pt-BR', {month:'short'}));
            } else {
                window.chartData.labels.push(new Date(dEnd).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}));
            }

            const salesInCurr = currentOrders.filter(o => o.timestamp >= dStart && o.timestamp < dEnd);
            const salesInPrev = prevOrders.filter(o => o.timestamp >= (dStart - (daysRange*multiplier)) && o.timestamp < (dEnd - (daysRange*multiplier)));
            
            window.chartData.curr.total.push(salesInCurr.length);
            window.chartData.prev.total.push(salesInPrev.length);
            
            let vCurr = 0, vPrev = 0;
            salesInCurr.forEach(o => vCurr += (o.total || 0));
            salesInPrev.forEach(o => vPrev += (o.total || 0));
            
            window.chartData.curr.valor.push(vCurr);
            window.chartData.prev.valor.push(vPrev);
            
            window.chartData.curr.ticket.push(salesInCurr.length ? vCurr / salesInCurr.length : 0);
            window.chartData.prev.ticket.push(salesInPrev.length ? vPrev / salesInPrev.length : 0);
            
            const ncSet = new Set(), npSet = new Set();
            salesInCurr.forEach(o => { if(!validOrders.some(vo => vo.customerName === o.customerName && vo.timestamp < dStart)) ncSet.add(o.customerName); });
            salesInPrev.forEach(o => { if(!validOrders.some(vo => vo.customerName === o.customerName && vo.timestamp < (dStart - (daysRange*multiplier)))) npSet.add(o.customerName); });
            
            window.chartData.curr.novos.push(ncSet.size);
            window.chartData.prev.novos.push(npSet.size);
        }
    } else {
        window.chartData.labels.push(filterValue === 'data' ? new Date(startTime).toLocaleDateString('pt-BR') : 'Hoje');
        window.chartData.curr.total.push(totalOrders); window.chartData.prev.total.push(prevTotalOrders);
        window.chartData.curr.valor.push(totalRevenue); window.chartData.prev.valor.push(prevRevenue);
        window.chartData.curr.ticket.push(avgTicket); window.chartData.prev.ticket.push(prevAvgTicket);
        window.chartData.curr.novos.push(newCustomers); window.chartData.prev.novos.push(prevNewCustomers);
    }

    window.renderSalesChart();

    // 4. Pagamentos (Barras Horizontais)
    const paymentSales = {};
    currentOrders.forEach(o => { const pay = o.paymentMethod || 'Outros'; paymentSales[pay] = (paymentSales[pay] || 0) + 1; });
    const topPayments = Object.entries(paymentSales).sort((a, b) => b[1] - a[1]);
    const paymentsHtml = topPayments.map(([pay, count]) => {
        const pct = totalOrders > 0 ? (count / totalOrders) * 100 : 0;
        return `
        <div class="bar-horizontal">
            <div class="label" title="${pay}">${pay}</div>
            <div class="track"><div class="fill" style="width:${pct}%;"></div></div>
            <div class="value">${count} vendas</div>
        </div>`;
    }).join('');
    document.getElementById('ifd-pagamentos-list').innerHTML = paymentsHtml || '<div style="color:var(--text-muted); font-size:0.85rem; text-align:center; font-weight:600;">Sem dados no período</div>';

    // 5. Dias com Mais Vendas (Barras Verticais)
    const daysMapName = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const daysSales = { 'Terça':0, 'Quarta':0, 'Quinta':0, 'Sexta':0, 'Sábado':0, 'Domingo':0, 'Segunda':0 };
    currentOrders.forEach(o => { const dayName = daysMapName[new Date(o.timestamp).getDay()]; daysSales[dayName] = (daysSales[dayName] || 0) + 1; });
    
    const maxDay = Math.max(...Object.values(daysSales), 1);
    let bestDayStr = "Nenhum", bestDayVal = 0;
    
    const diasHtml = ['Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo', 'Segunda'].map(day => {
        const count = daysSales[day] || 0;
        if(count > bestDayVal) { bestDayVal = count; bestDayStr = day; }
        const pct = (count / maxDay) * 100;
        const shortDay = day.substring(0,3);
        return `
        <div class="bar-vertical-col">
            <div class="value">${count > 0 ? count : ''}</div>
            <div style="width:100%; height:90px; display:flex; align-items:flex-end; background:var(--bg-body); border-radius:6px 6px 0 0; overflow:hidden;">
                <div class="fill" style="height:${pct}%;"></div>
            </div>
            <div class="label">${shortDay}</div>
        </div>`;
    }).join('');
    document.getElementById('ifd-dias-list').innerHTML = diasHtml;
    document.getElementById('ifd-melhor-dia').innerHTML = `${bestDayStr} <span style="font-size:0.9rem; color:var(--text-muted); font-weight:600;">${bestDayVal} vendas</span>`;

    // 6. Horários de Pico (Barras Horizontais)
    window.currentFilteredOrders = currentOrders;
    window.renderPeakHours();
};

// 🟢 LÓGICA DE GESTÃO DE CUPONS 🟢
const loadCoupons = async () => {
    try {
        const { data: coupons } = await supabase
            .from('coupons')
            .select('*')
            .eq('storeId', loggedStore.id);
        if (coupons) {
            globalCoupons = coupons;
            window.renderCoupons();
        }
    } catch(e) {
        console.error("Erro ao carregar cupons:", e);
    }
};
loadCoupons();

supabase.channel(`store-coupons-${loggedStore.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'coupons', filter: `storeId=eq.${loggedStore.id}` }, () => {
        loadCoupons();
    })
    .subscribe();

window.createCoupon = async () => {
    const code = document.getElementById('cp-code').value.trim().toUpperCase();
    const type = document.getElementById('cp-type').value;
    const value = parseFloat(document.getElementById('cp-value').value);
    const minOrder = parseFloat(document.getElementById('cp-min').value) || 0;
    const limitStr = document.getElementById('cp-limit').value;
    const limit = limitStr ? parseInt(limitStr) : null;

    if (!code || isNaN(value) || value <= 0) {
        return alert("Preencha o código e o valor do desconto corretamente.");
    }

    const btn = document.querySelector('.coupon-form .btn-accept');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Salvando...';
    btn.disabled = true;

    try {
        const { error } = await supabase.from('coupons').insert([{
            storeId: loggedStore.id,
            code: code,
            type: type,
            value: value,
            minOrder: minOrder,
            limit: limit,
            usedCount: 0,
            isActive: true,
            createdAt: Date.now()
        }]);
        if (error) throw error;
        
        alert("Cupom criado com sucesso!");
        document.getElementById('cp-code').value = '';
        document.getElementById('cp-value').value = '';
        document.getElementById('cp-min').value = '';
        document.getElementById('cp-limit').value = '';
    } catch (error) {
        console.error("Erro ao criar cupom:", error);
        alert("Erro ao salvar o cupom. Verifique sua conexão.");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.renderCoupons = () => {
    const container = document.getElementById('coupon-list-render');
    if (globalCoupons.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 30px; font-weight:600; font-size:1.1rem; border: 2px dashed var(--border); border-radius: 12px;">Nenhum cupom cadastrado.</div>';
        return;
    }

    container.innerHTML = globalCoupons.sort((a, b) => b.createdAt - a.createdAt).map(cp => {
        const valDisplay = cp.type === 'fixed' ? `R$ ${cp.value.toFixed(2)}` : `${cp.value}%`;
        const minDisplay = cp.minOrder > 0 ? `Pedidos acima de R$ ${cp.minOrder.toFixed(2)}` : `Sem valor mínimo`;
        const limitDisplay = cp.limit ? `Uso: ${cp.usedCount || 0}/${cp.limit}` : `Uso ilimitado (${cp.usedCount || 0} usados)`;
        
        const toggleClass = cp.isActive ? 'active' : 'inactive';
        const toggleText = cp.isActive ? 'Ativo' : 'Inativo';
        const bgClass = cp.isActive ? 'linear-gradient(135deg, var(--primary), #b91c1c)' : 'linear-gradient(135deg, #64748b, #334155)';

        return `
        <div class="ticket-coupon" style="background: ${bgClass};">
            <div class="ticket-left">
                <div class="t-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg> 
                    CUPOM DE DESCONTO
                </div>
                <div class="t-value">${valDisplay}</div>
                <div class="t-info">${minDisplay}</div>
                <div class="t-info">${limitDisplay}</div>
            </div>
            <div class="ticket-right">
                <div class="t-code">${cp.code}</div>
                <button class="t-btn-toggle ${toggleClass}" onclick="window.toggleCouponStatus('${cp.id}', ${cp.isActive})">${toggleText}</button>
                <button class="t-btn-del" onclick="window.deleteCoupon('${cp.id}')" title="Excluir Cupom">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                </button>
            </div>
        </div>`;
    }).join('');
};

window.toggleCouponStatus = async (id, currentStatus) => {
    try {
        await supabase.from('coupons').update({ isActive: !currentStatus }).eq('id', id);
    } catch(e) {
        alert("Erro ao alterar o status do cupom.");
    }
};

window.deleteCoupon = async (id) => {
    if(confirm("Tem certeza que deseja excluir este cupom permanentemente?")) {
        try {
            await supabase.from('coupons').delete().eq('id', id);
        } catch(e) {
            alert("Erro ao excluir o cupom.");
        }
    }
};

// 🟢 LÓGICA DO CHAT DA LOJA 🟢
window.openChatModal = (orderId, customerName) => {
    currentChatOrderId = orderId;
    document.getElementById('chat-customer-name').innerText = customerName;
    document.getElementById('chat-order-id').innerText = '#' + orderId.substring(0, 6).toUpperCase();
    document.getElementById('chat-modal').classList.add('active');
    
    // Zera o contador de mensagens não lidas no painel
    window.unreadCounts[orderId] = 0;
    const badge = document.getElementById(`badge-${orderId}`);
    if (badge) badge.style.display = 'none';

    const container = document.getElementById('chat-messages-container');
    container.innerHTML = '<div class="chat-sys-msg">Carregando mensagens...</div>';

    // Cancela a escuta de outro chat, se houver um aberto anteriormente
    if (chatUnsubscribe) { chatUnsubscribe.unsubscribe(); chatUnsubscribe = null; }

    const renderChatMessages = async () => {
        const { data: msgs } = await supabase
            .from('order_messages')
            .select('*')
            .eq('order_id', orderId)
            .order('timestamp', { ascending: true });

        container.innerHTML = '';

        if (!msgs || msgs.length === 0) {
            container.innerHTML = '<div class="chat-sys-msg">Nenhuma mensagem ainda. Envie um "Olá"!</div>';
            return;
        }

        msgs.forEach(async msg => {
            const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';

            if (msg.sender === 'store') {
                container.innerHTML += `
                    <div class="msg-bubble msg-store">
                        ${msg.text}
                        <span class="msg-time">${timeStr}</span>
                    </div>
                `;
            } else {
                container.innerHTML += `
                    <div class="msg-bubble msg-customer">
                        <span class="msg-sender">${customerName}</span>
                        ${msg.text}
                        <span class="msg-time">${timeStr}</span>
                    </div>
                `;
                if (!msg.read) {
                    await supabase.from('order_messages').update({ read: true }).eq('id', msg.id);
                }
            }
        });

        setTimeout(() => { container.scrollTop = container.scrollHeight; }, 100);
    };

    await renderChatMessages();

    // Subscribe to new messages in this order
    chatUnsubscribe = supabase.channel(`chat-modal-${orderId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'order_messages',
            filter: `order_id=eq.${orderId}`
        }, async () => {
            await renderChatMessages();
        })
        .subscribe();
};

window.closeChatModal = () => {
    document.getElementById('chat-modal').classList.remove('active');
    currentChatOrderId = null;
    if (chatUnsubscribe) {
        chatUnsubscribe.unsubscribe();
        chatUnsubscribe = null;
    }
};

// Escuta o envio do formulário do chat
document.getElementById('chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    
    if (!text || !currentChatOrderId) return;
    
    input.value = ''; // Limpa a caixa de texto
    
    try {
        const { error } = await supabase.from('order_messages').insert([{
            order_id: currentChatOrderId,
            text: text,
            sender: 'store',
            timestamp: Date.now(),
            read: false
        }]);
        if (error) throw error;
    } catch(error) {
        console.error("Erro ao enviar mensagem:", error);
        alert("Erro de conexão ao enviar a mensagem. Tente novamente.");
    }
});
