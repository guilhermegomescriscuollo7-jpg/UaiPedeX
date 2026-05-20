// ==========================================
// CONFIGURAÇÃO SUPABASE
// ==========================================
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = 'https://mvhqsiyalupodrtsfncj.supabase.co';
const supabaseKey = 'sb_publishable_K_tmqPg95RJlCCzwRZln4Q_kmfrUw0G'; 

const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// VARIÁVEIS GLOBAIS E ESTADOS
// ==========================================
let allStores = []; let allDrivers = []; let globalBanners = []; let globalSponsors = []; let globalCities = [];
let globalUsers = []; let globalCoupons = []; let globalAlerts = [];
let storeImgBase64 = ''; let bannerImgBase64 = ''; let sponsorImgBase64 = '';
let editingStoreId = null; let editingDriverId = null;
let allOrders = [];

const formatBRL = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Função auxiliar para gerar IDs aleatórios para novos registos
const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// ==========================================
// 🟢 SISTEMA DE LOGIN VIA SESSÃO
// ==========================================
const initAdminPanel = () => {
    const isAdminLogged = sessionStorage.getItem('adminAuth');
    if(isAdminLogged === 'true') {
        const appScreen = document.getElementById('app-screen');
        if(appScreen) {
            appScreen.style.display = 'flex'; 
            loadAllData(); 
        }
    } else {
        window.location.href = 'loginadm.html';
    }
};

initAdminPanel();

window.logoutAdmin = () => {
    if(confirm("Deseja sair do painel administrativo?")) {
        sessionStorage.removeItem('adminAuth');
        window.location.href = 'loginadm.html';
    }
};

// ==========================================
// 🟢 CONTROLO DE MENU MOBILE E UTILITÁRIOS
// ==========================================
window.toggleSidebar = () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('active');
};

window.switchTab = (tabId, el) => {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    el.classList.add('active');
    
    if (window.innerWidth <= 850) {
        window.toggleSidebar();
    }
};

function resizeAndCompressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width; let height = img.height;
            const MAX_WIDTH = 800; 
            if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ==========================================
// CARREGADOR CENTRAL
// ==========================================
async function loadAllData() {
    await fetchCities();
    await fetchStores();
    await fetchUsers();
    await fetchCoupons();
    await fetchDrivers();
    await fetchBanners();
    await fetchSponsors();
    await fetchAlerts();
    await fetchOrders();
    await fetchSettingsAudio();
    await fetchSettingsVideo();
}

// ==========================================
// 1. ÁUDIO DE NOTIFICAÇÃO (global_settings)
// ==========================================
let alertAudioBase64 = '';

document.getElementById('audio-file').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 800000) { 
            alert("O ficheiro é muito grande! Escolha um áudio menor que 800KB.");
            this.value = ''; return;
        }
        const reader = new FileReader();
        reader.onload = function(evt) { alertAudioBase64 = evt.target.result; };
        reader.readAsDataURL(file);
    }
});

async function fetchSettingsAudio() {
    const { data, error } = await supabase.from('global_settings').select('*').eq('id', 'notification_audio').single();
    const container = document.getElementById('current-audio-container');
    if (data && data.audioData) {
        container.innerHTML = `
            <audio controls style="width: 100%; border-radius: 8px; margin-bottom: 15px; outline: none; background: #f9f9f9;">
                <source src="${data.audioData}">
                O seu navegador não suporta áudio.
            </audio>
            <button class="btn-del" onclick="window.deleteAudioAlert(event)" style="width: 100%; justify-content: center;">Restaurar Som Padrão</button>
        `;
    } else {
        container.innerHTML = '<p style="color:#999; font-size:0.9rem;">Nenhum áudio personalizado. Som padrão ativo.</p>';
    }
}

window.saveAudioAlert = async (event) => {
    if (event) event.preventDefault();
    if (!alertAudioBase64) return alert("Selecione um ficheiro de áudio primeiro.");
    const { error } = await supabase.from('global_settings').upsert({ id: 'notification_audio', audioData: alertAudioBase64, updatedAt: Date.now() });
    if (error) alert("Erro ao guardar áudio: " + error.message);
    else {
        alert("Áudio de notificação guardado com sucesso!");
        document.getElementById('audio-file').value = '';
        alertAudioBase64 = '';
        fetchSettingsAudio();
    }
};

window.deleteAudioAlert = async (event) => {
    if (event) event.preventDefault();
    if(confirm("Remover áudio personalizado e voltar para o padrão?")) {
        const { error } = await supabase.from('global_settings').delete().eq('id', 'notification_audio');
        if (error) alert("Erro ao remover: " + error.message);
        else { alert("Áudio restaurado!"); fetchSettingsAudio(); }
    }
};

// ==========================================
// 2. VÍDEO SPLASH SCREEN (global_settings)
// ==========================================
let splashVideoBase64 = '';

document.getElementById('splash-video-file').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 10000000) { 
            alert("O ficheiro excede o limite de 10MB! Use um Link Externo.");
            this.value = ''; return;
        }
        const reader = new FileReader();
        reader.onload = function(evt) { splashVideoBase64 = evt.target.result; };
        reader.readAsDataURL(file);
    }
});

async function fetchSettingsVideo() {
    const { data, error } = await supabase.from('global_settings').select('*').eq('id', 'splash_video').single();
    const container = document.getElementById('current-splash-container');
    if (data && data.videoData) {
        container.innerHTML = `
            <video controls autoplay muted loop style="width: 100%; max-width: 250px; border-radius: 12px; margin-bottom: 15px; background: #000; border: 1px solid #eee;">
                <source src="${data.videoData}">
                O seu navegador não suporta vídeo.
            </video>
            <button class="btn-del" onclick="window.deleteSplashVideo(event)" style="width: 100%; justify-content: center;">Remover Vídeo e Usar Padrão</button>
        `;
    } else {
        container.innerHTML = '<p style="color:#999; font-size:0.9rem;">Nenhum vídeo personalizado. Animação padrão activa.</p>';
    }
}

window.saveSplashVideo = async (event) => {
    if (event) event.preventDefault();
    const urlInput = document.getElementById('splash-video-url').value.trim();
    const finalVideo = urlInput ? urlInput : splashVideoBase64;
    
    if (!finalVideo) return alert("Carregue um vídeo MP4 ou insira um link externo válido.");
    
    const { error } = await supabase.from('global_settings').upsert({ id: 'splash_video', videoData: finalVideo, updatedAt: Date.now() });
    
    if (error) {
        if(error.message.includes('payload is too large')) alert("Vídeo grande demais para a base de dados. Use Link Externo.");
        else alert("Erro ao guardar vídeo: " + error.message);
    } else {
        alert("Vídeo guardado com sucesso!");
        document.getElementById('splash-video-file').value = '';
        document.getElementById('splash-video-url').value = '';
        splashVideoBase64 = '';
        fetchSettingsVideo();
    }
};

window.deleteSplashVideo = async (event) => {
    if (event) event.preventDefault();
    if(confirm("Remover vídeo de abertura e usar o padrão?")) {
        const { error } = await supabase.from('global_settings').delete().eq('id', 'splash_video');
        if (error) alert("Erro ao remover: " + error.message);
        else { alert("Vídeo restaurado!"); fetchSettingsVideo(); }
    }
};

// ==========================================
// 3. CIDADES
// ==========================================
async function fetchCities() {
    const { data, error } = await supabase.from('cities').select('*');
    if (!error && data) {
        globalCities = data;
        globalCities.sort((a, b) => a.name.localeCompare(b.name));
        renderCitiesList();
        populateCityDropdowns();
    }
}

window.saveCity = async (event) => {
    if (event) event.preventDefault();
    const name = document.getElementById('c-name').value.trim();
    const state = document.getElementById('c-state').value.trim().toUpperCase();
    if(!name || !state) return alert("Preencha o nome e estado.");
    
    const exists = globalCities.find(c => c.name.toLowerCase() === name.toLowerCase() && c.state === state);
    if(exists) return alert("Cidade já registada!");
    
    const { error } = await supabase.from('cities').insert([{ id: generateId(), name, state }]);
    if (error) alert("Erro ao registar cidade: " + error.message);
    else {
        document.getElementById('c-name').value = ''; document.getElementById('c-state').value = '';
        fetchCities();
    }
};

window.deleteCity = async (id) => {
    if(confirm("Tem a certeza que deseja apagar esta cidade?")) {
        const { error } = await supabase.from('cities').delete().eq('id', id);
        if (error) alert("Erro ao eliminar: " + error.message);
        else fetchCities();
    }
};

function renderCitiesList() {
    const container = document.getElementById('city-list-container');
    if(globalCities.length === 0) { container.innerHTML = `<p style="color:#999; font-size:0.9rem;">Nenhuma cidade registada.</p>`; return; }
    container.innerHTML = globalCities.map(c => `
        <div class="card-item" style="justify-content: space-between;">
            <div style="display:flex; align-items:center; gap:12px;">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ea1d2c" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                <strong style="font-size: 1.15rem; color: #111;">${c.name} - ${c.state}</strong>
            </div>
            <button class="btn-del" onclick="window.deleteCity('${c.id}')" style="background: transparent; border: none; padding: 5px;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ea1d2c" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
        </div>`).join('');
}

function populateCityDropdowns() {
    const cityOptions = globalCities.map(c => `<option value="${c.name} - ${c.state}">${c.name} - ${c.state}</option>`).join('');
    const fillSelect = (id, prepend) => {
        const el = document.getElementById(id);
        if (el) { const val = el.value; el.innerHTML = prepend + cityOptions; if(val) el.value = val; }
    };
    fillSelect('s-city', '<option value="">Selecione a cidade...</option>');
    fillSelect('d-city', '<option value="">Selecione a cidade...</option>');
    fillSelect('b-city', '<option value="all">Todas as Cidades (Global)</option>');
    fillSelect('sp-city', '<option value="all">Todas as Cidades (Global)</option>');
    fillSelect('filter-city-fat', '<option value="all">Todas as Cidades</option>');
    fillSelect('filter-user-city', '<option value="all">Todas as Cidades</option>');
    fillSelect('admin-sponsor-city', '<option value="">Selecione a cidade...</option>');
    fillSelect('filter-store-city', '<option value="all">Todas as Cidades</option>');
}

// ==========================================
// 4. GESTÃO DE UTILIZADORES (CUSTOMERS)
// ==========================================
async function fetchUsers() {
    const { data, error } = await supabase.from('customers').select('*');
    if (!error && data) {
        globalUsers = data;
        let sicoobCount = globalUsers.filter(u => u.isSicoob).length;
        document.getElementById('total-users').innerText = globalUsers.length;
        document.getElementById('total-sicoob').innerText = sicoobCount;
        window.filterUsers();
    }
}

window.filterUsers = () => {
    const cityFilter = document.getElementById('filter-user-city').value;
    const searchFilter = document.getElementById('filter-user-search').value.toLowerCase().trim();
    const container = document.getElementById('users-container');

    let filtered = globalUsers;
    if (cityFilter !== 'all') filtered = filtered.filter(u => u.city === cityFilter);
    if (searchFilter !== '') {
        filtered = filtered.filter(u => (u.name && u.name.toLowerCase().includes(searchFilter)) || (u.email && u.email.toLowerCase().includes(searchFilter)));
    }

    if (filtered.length === 0) { container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #999;">Nenhum utilizador encontrado.</div>`; return; }

    filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    container.innerHTML = filtered.map(u => {
        const initial = u.name ? u.name.charAt(0).toUpperCase() : '?';
        const cityBadge = u.city ? u.city : 'Sem cidade';
        const isSicoob = u.isSicoob ? true : false;
        const safeName = u.name ? u.name.replace(/'/g, "\\'") : 'Cliente';

        return `
        <div class="user-card">
            <div class="u-header">
                <div class="u-avatar">${initial}</div>
                <div class="u-info"><div class="u-name">${u.name || 'Cliente'}</div><div class="u-email">${u.email || ''}</div></div>
            </div>
            <div class="badge-city" style="margin-bottom: 18px; width: fit-content;">📍 ${cityBadge}</div>
            <div class="u-data-row"><strong>Telefone:</strong> <span>${u.phone || 'N/A'}</span></div>
            <div class="u-data-row" style="margin-bottom: 20px;"><strong>Registado em:</strong> <span>${u.createdAt ? new Date(Number(u.createdAt)).toLocaleDateString('pt-BR') : '--'}</span></div>
            <div class="sicoob-area">
                <div class="sicoob-logo-text">Associado Patrocinador</div>
                <label class="toggle-switch"><input type="checkbox" ${isSicoob ? 'checked' : ''} onchange="window.toggleSicoobStatus('${u.id}', this.checked)"><span class="slider"></span></label>
            </div>
            <button class="btn-delete" style="color: #ea1d2c; border: 1px solid #fbd5d5; background: #fef0f0; padding: 12px; border-radius: 10px; cursor: pointer; width:100%; margin-top: auto;" onclick="window.deleteUser('${u.id}', '${safeName}')">Excluir Utilizador</button>
        </div>`;
    }).join('');
};

window.toggleSicoobStatus = async (userId, isNowSicoob) => {
    const { error } = await supabase.from('customers').update({ isSicoob: isNowSicoob }).eq('id', userId); 
    if (error) alert("Erro ao atualizar Sicoob: " + error.message);
    else fetchUsers();
};

window.deleteUser = async (userId, userName) => {
    if (confirm(`Tem a certeza que deseja eliminar ${userName}?`)) {
        const { error } = await supabase.from('customers').delete().eq('id', userId); 
        if (error) alert("Erro ao eliminar cliente: " + error.message);
        else fetchUsers();
    }
};

// ==========================================
// 5. CUPÕES PATROCINADOS
// ==========================================
window.toggleSponsorValueInput = () => {
    const type = document.getElementById('admin-sponsor-type').value;
    const valInput = document.getElementById('admin-sponsor-value');
    if(type === 'free_shipping') { valInput.value = ''; valInput.disabled = true; valInput.placeholder = "Não se aplica"; } 
    else { valInput.disabled = false; valInput.placeholder = "Ex: 20"; }
};

async function fetchCoupons() {
    const { data, error } = await supabase.from('coupons').select('*');
    if (!error && data) { globalCoupons = data; renderAdminSponsorCoupons(); }
}

window.createSponsorCoupon = async (event) => {
    if (event) event.preventDefault();
    const sponsorName = document.getElementById('admin-sponsor-name').value.trim();
    const code = document.getElementById('admin-sponsor-code').value.trim().toUpperCase();
    const type = document.getElementById('admin-sponsor-type').value;
    const exclusiveFor = document.getElementById('admin-sponsor-audience').value;

    let value = parseFloat(document.getElementById('admin-sponsor-value').value);
    if (type === 'free_shipping') value = 0;
    const minOrder = parseFloat(document.getElementById('admin-sponsor-min').value) || 0;
    const limitStr = document.getElementById('admin-sponsor-limit').value.trim();
    const usageLimit = limitStr ? parseInt(limitStr) : null;
    const targetCity = document.getElementById('admin-sponsor-city').value;

    if (!sponsorName || !code || !targetCity || (type !== 'free_shipping' && (isNaN(value) || value <= 0))) {
        return alert("Preencha todos os campos obrigatórios.");
    }

    const { error } = await supabase.from('coupons').insert([{
        id: generateId(), code, type, value, minOrder, usageLimit, storeId: "GLOBAL", targetCity, sponsorName, 
        exclusiveFor, active: true, usedCount: 0, createdAt: Date.now()
    }]);

    if(error) alert(error.message); else {
        alert("Sucesso! Cupão criado.");
        document.getElementById('admin-sponsor-code').value = ''; document.getElementById('admin-sponsor-value').value = '';
        fetchCoupons();
    }
};

function renderAdminSponsorCoupons() {
    const container = document.getElementById('sponsor-coupons-list-container');
    const sponsorCoupons = globalCoupons.filter(c => c.storeId === 'GLOBAL');
    if (sponsorCoupons.length === 0) { container.innerHTML = '<p style="color:#999;">Nenhum cupão ativo.</p>'; return; }

    container.innerHTML = sponsorCoupons.map(c => {
        const toggleBtn = c.active ? `<button class="btn-suspend" onclick="window.toggleAdminCoupon('${c.id}', false)">Desativar</button>` : `<button class="btn-reactivate" onclick="window.toggleAdminCoupon('${c.id}', true)">Ativar</button>`;
        let discountText = c.type === 'percentage' ? `${c.value}%` : (c.type === 'free_shipping' ? `ENTREGA GRÁTIS` : `R$ ${c.value.toFixed(2)}`);
        let limitText = c.usageLimit ? `${c.usedCount || 0} / ${c.usageLimit}` : 'Ilimitado';
        let audienceBadge = c.exclusiveFor === 'sicoob' ? '<span style="background:#e6f4ea; color:#00a14b; padding:4px 8px; border-radius:6px; font-weight:bold; font-size:0.75rem;">Apenas Sicoob</span>' : '<span style="background:#eef4ff; color:#0d6efd; padding:4px 8px; border-radius:6px; font-weight:bold; font-size:0.75rem;">Todos</span>';

        return `
        <div class="card-item" style="flex-direction: column; align-items: flex-start; ${!c.active ? 'opacity: 0.6;' : ''}">
            <div style="width:100%; display:flex; justify-content:space-between; align-items:center;">
                <strong style="font-size:1.3rem;">${c.code}</strong>${audienceBadge}
            </div>
            <div style="font-size:0.9rem; color:#555; width:100%; margin-top: 10px;">
                <strong>Patrocinador:</strong> ${c.sponsorName}<br>
                <strong>Cidade:</strong> ${c.targetCity}<br>
                <strong>Desconto:</strong> ${discountText} | <strong>Mínimo:</strong> R$ ${c.minOrder.toFixed(2)}<br>
                <strong>Utilizações:</strong> ${limitText}
            </div>
            <div class="actions-col" style="margin-top: 10px; width: 100%;">${toggleBtn} <button class="btn-del" onclick="window.deleteAdminCoupon('${c.id}')">Excluir</button></div>
        </div>`;
    }).join('');
}

window.toggleAdminCoupon = async (id, isActive) => { 
    const { error } = await supabase.from('coupons').update({ active: isActive }).eq('id', id); 
    if(error) alert("Erro: " + error.message); else fetchCoupons();
};
window.deleteAdminCoupon = async (id) => { 
    if(confirm("Apagar este cupão?")) { 
        const { error } = await supabase.from('coupons').delete().eq('id', id); 
        if(error) alert("Erro: " + error.message); else fetchCoupons();
    } 
};

// ==========================================
// 6. LOJAS (STORES)
// ==========================================
document.getElementById('s-logo').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) { resizeAndCompressImage(file, (compressedBase64) => { storeImgBase64 = compressedBase64; }); }
});

async function fetchStores() {
    const { data, error } = await supabase.from('stores').select('*');
    if (!error && data) {
        allStores = data;
        window.renderStoreList(); 
        window.onCityFatChange(); 
        
        const bStoreEl = document.getElementById('b-store');
        if(bStoreEl) {
            const currentVal = bStoreEl.value;
            const sortedStores = [...allStores].sort((a,b) => a.name.localeCompare(b.name));
            bStoreEl.innerHTML = '<option value="">Nenhuma</option>' + sortedStores.map(s => `<option value="${s.id}">🏪 ${s.name} (${s.city ? s.city.split(' - ')[0] : 'S/cidade'})</option>`).join('');
            if(currentVal) bStoreEl.value = currentVal;
        }
    }
}

window.saveStore = async (event) => { 
    if (event) event.preventDefault(); // <--- PREVINE RECARREGAMENTO DE TELA SÚBITO

    const name = document.getElementById('s-name').value.trim(); 
    const docId = document.getElementById('s-doc').value.trim() || null; 
    const cep = document.getElementById('s-cep').value.trim() || null; 
    const street = document.getElementById('s-street').value.trim() || null; 
    const email = document.getElementById('s-email').value.trim(); 
    const pass = document.getElementById('s-pass').value.trim(); 
    const cat = document.getElementById('s-cat').value; 
    const cityDropdownVal = document.getElementById('s-city').value;
    const dueDateVal = document.getElementById('s-due-date').value;
    const isFeatured = document.getElementById('s-featured').checked;

    if(!name || !email || !pass || !cityDropdownVal) return alert("Preencha dados da loja, incluindo a cidade."); 
    const dueDateTimestamp = dueDateVal ? new Date(dueDateVal + 'T12:00:00').getTime() : null;

    const storeData = { name, email, password: pass, cat, doc: docId, cep, street, city: cityDropdownVal, dueDate: dueDateTimestamp, isFeatured };

    if (editingStoreId) { 
        if(allStores.find(s => s.email === email && s.id !== editingStoreId)) return alert("Já existe loja com este e-mail."); 
        if (storeImgBase64) storeData.logo = storeImgBase64; 
        
        // ADICIONADO .select() PARA VALIDAR SE O RLS DO BANCO BLOQUEOU A EDIÇÃO SILENCIOSAMENTE
        const { data, error } = await supabase.from('stores').update(storeData).eq('id', editingStoreId).select(); 
        
        if (error) { 
            alert("ERRO NO BANCO DE DADOS:\n" + error.message); 
            console.error(error); 
            return; 
        }
        
        if (!data || data.length === 0) {
            alert("ATENÇÃO: Os dados não foram salvos.\n\nMotivo: A tabela 'stores' no Supabase está com a segurança RLS ativa, mas falta criar uma política (Policy) que permita a operação de 'UPDATE' para usuários públicos/anon.");
            return;
        }
        
        alert("Loja atualizada com sucesso!"); 
    } else { 
        if(allStores.find(s => s.email === email)) return alert("Já existe loja com este e-mail."); 
        storeData.id = generateId(); storeData.status = 'Aberto'; storeData.isActive = true; storeData.logo = storeImgBase64 || 'https://via.placeholder.com/60';
        
        const { error } = await supabase.from('stores').insert([storeData]); 
        if (error) { alert("ERRO NO BANCO DE DADOS:\n" + error.message); console.error(error); return; }
        alert("Loja registada!"); 
    } 
    window.cancelEdit(); fetchStores();
};

window.editStore = (id) => { 
    editingStoreId = id; const store = allStores.find(s => s.id === id); if(!store) return; 
    document.getElementById('s-name').value = store.name; document.getElementById('s-doc').value = store.doc || ''; 
    document.getElementById('s-cep').value = store.cep || ''; document.getElementById('s-street').value = store.street || ''; 
    document.getElementById('s-city').value = store.city || ''; document.getElementById('s-email').value = store.email; 
    document.getElementById('s-pass').value = store.password; document.getElementById('s-cat').value = store.cat || 'Restaurantes'; 
    document.getElementById('s-featured').checked = store.isFeatured || false;
    if (store.dueDate) { document.getElementById('s-due-date').value = new Date(Number(store.dueDate)).toISOString().split('T')[0]; } else { document.getElementById('s-due-date').value = ''; }
    document.getElementById('s-logo').value = ''; storeImgBase64 = ''; 
    document.getElementById('btn-save-store').innerHTML = `Guardar Alterações`; document.getElementById('btn-cancel-edit').style.display = "inline-flex"; 
    document.querySelector('.main-content').scrollTo({ top: 0, behavior: 'smooth' }); 
};

window.cancelEdit = () => { 
    editingStoreId = null; 
    document.getElementById('s-name').value = ''; document.getElementById('s-doc').value = ''; document.getElementById('s-cep').value = ''; 
    document.getElementById('s-street').value = ''; document.getElementById('s-city').value = ''; document.getElementById('s-email').value = ''; 
    document.getElementById('s-pass').value = ''; document.getElementById('s-logo').value = ''; document.getElementById('s-due-date').value = ''; document.getElementById('s-featured').checked = false;
    storeImgBase64 = ''; document.getElementById('btn-save-store').innerHTML = `Registar Loja`; document.getElementById('btn-cancel-edit').style.display = "none"; 
};

window.toggleSubscription = async (id) => { 
    const store = allStores.find(s => s.id === id); 
    if (store) { 
        const { error } = await supabase.from('stores').update({ isActive: !store.isActive }).eq('id', id); 
        if(error) alert("Erro ao alterar status: " + error.message); else fetchStores();
    } 
};

window.deleteStore = async (id) => { 
    if(confirm("Apagar loja permanentemente?")) { 
        const { error } = await supabase.from('stores').delete().eq('id', id); 
        if(error) alert("Erro ao deletar: " + error.message); else fetchStores();
    } 
};

window.renewSubscription = async (storeId, currentDue) => {
    if(confirm("Renovar por 1 mês e ativar loja?")) {
        const date = new Date(Number(currentDue)); date.setMonth(date.getMonth() + 1);
        const { error } = await supabase.from('stores').update({ dueDate: date.getTime(), isActive: true }).eq('id', storeId); 
        if(error) alert("Erro ao renovar: " + error.message); else fetchStores();
    }
};

window.renderStoreList = () => { 
    const container = document.getElementById('store-list-container'); 
    const cityFilter = document.getElementById('filter-store-city').value;
    let filteredStores = allStores;
    if (cityFilter !== 'all') filteredStores = filteredStores.filter(s => s.city === cityFilter);
    if(filteredStores.length === 0) { container.innerHTML = `<p style="color:#999; padding:20px;">Nenhuma loja encontrada.</p>`; return; } 
    
    container.innerHTML = filteredStores.map(s => { 
        const isActive = s.isActive !== false; let dueBadge = ''; let payButton = '';
        let featuredIcon = s.isFeatured ? '<span title="Destaque" style="color:#ea1d2c;">⭐</span>' : '';

        if (s.dueDate) {
            const daysLeft = Math.ceil((Number(s.dueDate) - Date.now()) / (1000 * 60 * 60 * 24));
            if (daysLeft < 0) dueBadge = `<span style="background: #fef0f0; color: #ea1d2c; padding: 4px; border-radius: 8px; font-size: 0.75rem;">Vencida</span>`; 
            else if (daysLeft <= 3) dueBadge = `<span style="background: #fff8e1; color: #d39e00; padding: 4px; border-radius: 8px; font-size: 0.75rem;">Vence em ${daysLeft}d</span>`; 
            else dueBadge = `<span style="background: #e6f4ea; color: #00a14b; padding: 4px; border-radius: 8px; font-size: 0.75rem;">Ativo</span>`;
            payButton = `<button class="btn-reactivate" onclick="window.renewSubscription('${s.id}', ${s.dueDate})">Renovar +1 Mês</button>`;
        }

        return `<div class="card-item ${isActive ? '' : 'suspended'}" style="position: relative;"> 
            <img src="${s.logo}" class="card-img" style="width: 75px; height: 75px; border-radius: 16px;"> 
            <div style="flex-grow: 1; line-height: 1.6;"> 
                <strong style="font-size: 1.2rem; color: #111;">${s.name} ${featuredIcon}</strong> ${dueBadge}<br>
                <span style="font-size:0.85rem; color:#888;">${s.email} | ${s.password}</span><br>
                <span class="badge-city">📍 ${s.city || 'S/ Cidade'}</span>
            </div> 
            <div class="actions-col" style="flex-direction: column; align-items: flex-end; gap: 8px;"> 
                ${payButton}
                <div style="display:flex; gap: 8px;">
                    <button class="btn-edit" onclick="window.editStore('${s.id}')">Editar</button> 
                    <button class="${isActive ? 'btn-suspend' : 'btn-reactivate'}" onclick="window.toggleSubscription('${s.id}')">${isActive ? 'Bloquear' : 'Ativar'}</button> 
                    <button class="btn-del" onclick="window.deleteStore('${s.id}')">Apagar</button> 
                </div>
            </div> 
        </div>`; 
    }).join(''); 
}

// ==========================================
// 7. FATURAMENTO (ORDERS)
// ==========================================
async function fetchOrders() {
    const { data, error } = await supabase.from('orders').select('*');
    if (!error && data) { allOrders = data; window.renderFaturamento(); }
}

window.onCityFatChange = () => {
    const cityFilter = document.getElementById('filter-city-fat').value;
    const storeSelect = document.getElementById('filter-store-fat');
    const currentStore = storeSelect.value;
    let filteredStores = allStores;
    if(cityFilter !== 'all') filteredStores = filteredStores.filter(s => s.city === cityFilter);
    storeSelect.innerHTML = '<option value="all">Ver Todas as Lojas</option>' + filteredStores.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    if(filteredStores.find(s => s.id === currentStore)) storeSelect.value = currentStore; else storeSelect.value = 'all';
    window.renderFaturamento();
};

window.renderFaturamento = () => {
    const timeFilter = document.getElementById('filter-faturamento').value;
    const cityFilter = document.getElementById('filter-city-fat').value;
    const storeFilter = document.getElementById('filter-store-fat').value;
    
    const now = Date.now(); let startTime = 0;
    if (timeFilter === 'hoje') startTime = new Date().setHours(0,0,0,0);
    else if (timeFilter === '7dias') startTime = now - (7 * 24 * 60 * 60 * 1000);
    else if (timeFilter === 'mes') startTime = now - (30 * 24 * 60 * 60 * 1000);

    let totalVendas = 0; let totalTaxa = 0; let totalPedidos = 0; let storeRanking = {};

    allOrders.forEach(o => {
        if (Number(o.timestamp) >= startTime && ['Entregue', 'Concluído', 'Concluido'].includes(o.status)) {
            if(cityFilter !== 'all') { const st = allStores.find(s => s.id === o.storeId); if(!st || st.city !== cityFilter) return; }
            if(storeFilter !== 'all' && o.storeId !== storeFilter) return;

            const val = Number(o.total) || 0; totalVendas += val;
            const taxa = Number(o.platformFee) || (val * 0.10); totalTaxa += taxa; totalPedidos++;

            if(o.storeName) {
                if(!storeRanking[o.storeName]) {
                    storeRanking[o.storeName] = { rev: 0, orders: 0, tax: 0, logo: 'https://via.placeholder.com/80' };
                    const s = allStores.find(st => st.id === o.storeId);
                    if(s && s.logo) storeRanking[o.storeName].logo = s.logo;
                }
                storeRanking[o.storeName].rev += val; storeRanking[o.storeName].orders += 1; storeRanking[o.storeName].tax += taxa;
            }
        }
    });

    document.getElementById('fat-total-vendas').innerText = formatBRL(totalVendas); document.getElementById('fat-taxa-app').innerText = formatBRL(totalTaxa); document.getElementById('fat-pedidos').innerText = totalPedidos;

    const rankContainer = document.getElementById('ranking-list-render');
    const sorted = Object.keys(storeRanking).map(k => ({name: k, ...storeRanking[k]})).sort((a,b) => b.rev - a.rev);
    
    if(sorted.length === 0) { rankContainer.innerHTML = '<li style="justify-content:center; color:#999; padding:20px;">Nenhuma venda encontrada para o filtro.</li>'; } 
    else {
        const medals = ['🥇','🥈','🥉','4º','5º','6º','7º','8º','9º','10º'];
        rankContainer.innerHTML = sorted.map((s, i) => `
            <li class="ranking-item">
                <div class="r-medal">${medals[i] || (i+1)+'º'}</div><img src="${s.logo}" class="r-logo">
                <div class="r-info"><div class="r-name">${s.name}</div><div class="r-orders">${s.orders} Pedidos</div></div>
                <div class="r-revenue"><div class="r-revenue-val">${formatBRL(s.rev)}</div><div class="r-revenue-tax">Taxa UaiPede: ${formatBRL(s.tax)}</div></div>
            </li>
        `).join('');
    }
};

// ==========================================
// 8. ENTREGADORES (DRIVERS)
// ==========================================
async function fetchDrivers() {
    const { data, error } = await supabase.from('drivers').select('*');
    if (!error && data) { allDrivers = data; renderDriverList(); }
}

window.saveDriver = async (event) => { 
    if (event) event.preventDefault();

    const name = document.getElementById('d-name').value.trim(); 
    const phone = document.getElementById('d-phone').value.trim() || null;  
    const email = document.getElementById('d-email').value.trim(); 
    const pass = document.getElementById('d-pass').value.trim(); 
    const city = document.getElementById('d-city').value;

    if(!name || !email || !pass || !city) return alert("Preencha todos os dados."); 
    if (editingDriverId) { 
        const { data, error } = await supabase.from('drivers').update({ name, phone, email, password: pass, city }).eq('id', editingDriverId).select(); 
        if(error) { alert("ERRO AO ATUALIZAR:\n" + error.message); return; }
        if(!data || data.length === 0) { alert("Erro RLS: Sem permissão de UPDATE na tabela drivers."); return; }
        alert("Atualizado!"); 
    } else { 
        const { error } = await supabase.from('drivers').insert([{ id: generateId(), name, phone, email, password: pass, city, isActive: true }]); 
        if(error) { alert("ERRO AO REGISTRAR:\n" + error.message); return; }
        alert("Registado!"); 
    } 
    window.cancelEditDriver(); fetchDrivers();
};

window.editDriver = (id) => { 
    editingDriverId = id; const driver = allDrivers.find(d => d.id === id); if(!driver) return; 
    document.getElementById('d-name').value = driver.name; document.getElementById('d-phone').value = driver.phone || ''; 
    document.getElementById('d-email').value = driver.email; document.getElementById('d-pass').value = driver.password; document.getElementById('d-city').value = driver.city || '';
    document.getElementById('btn-save-driver').innerHTML = `Guardar Alterações`; document.getElementById('btn-cancel-driver-edit').style.display = "inline-flex"; 
};

window.cancelEditDriver = () => { 
    editingDriverId = null; document.getElementById('d-name').value = ''; document.getElementById('d-phone').value = ''; 
    document.getElementById('d-email').value = ''; document.getElementById('d-pass').value = ''; document.getElementById('d-city').value = '';
    document.getElementById('btn-save-driver').innerHTML = `Registar Entregador`; document.getElementById('btn-cancel-driver-edit').style.display = "none"; 
};

window.toggleDriverStatus = async (id) => { 
    const driver = allDrivers.find(d => d.id === id); 
    if (driver) { 
        const { error } = await supabase.from('drivers').update({ isActive: !driver.isActive }).eq('id', id); 
        if(error) alert("Erro: " + error.message); else fetchDrivers();
    } 
};

window.deleteDriver = async (id) => { 
    if(confirm("Apagar entregador?")) { 
        const { error } = await supabase.from('drivers').delete().eq('id', id); 
        if(error) alert("Erro: " + error.message); else fetchDrivers();
    } 
};

function renderDriverList() { 
    const container = document.getElementById('driver-list-container'); 
    if(allDrivers.length === 0) { container.innerHTML = `<p style="color:#999; padding:20px;">Nenhum entregador registado.</p>`; return; } 
    container.innerHTML = allDrivers.map(d => `<div class="card-item ${d.isActive !== false ? '' : 'suspended'}"> 
        <div style="flex-grow: 1;"> 
            <strong style="font-size: 1.2rem;">${d.name}</strong><br> 
            <span style="font-size:0.85rem; color:#888;">📞 ${d.phone || '-'} | 📍 ${d.city || 'S/ Cidade'}</span><br>
            <span style="font-size:0.85rem; color:#555;">✉️ ${d.email} | 🔑 ${d.password}</span><br> 
        </div> 
        <div class="actions-col"> 
            <button class="btn-edit" onclick="window.editDriver('${d.id}')">Editar</button> 
            <button class="${d.isActive !== false ? 'btn-suspend' : 'btn-reactivate'}" onclick="window.toggleDriverStatus('${d.id}')">${d.isActive !== false ? 'Bloquear' : 'Ativar'}</button> 
            <button class="btn-del" onclick="window.deleteDriver('${d.id}')">Apagar</button> 
        </div> 
    </div> `).join(''); 
}

// ==========================================
// 9. BANNERS
// ==========================================
document.getElementById('b-image').addEventListener('change', function(e) { const file = e.target.files[0]; if (file) { resizeAndCompressImage(file, (base64) => { bannerImgBase64 = base64; }); } });

async function fetchBanners() {
    const { data, error } = await supabase.from('banners').select('*');
    if (!error && data) { globalBanners = data; renderBanners(); }
}

window.saveBanner = async (event) => {
    if (event) event.preventDefault();
    const city = document.getElementById('b-city').value; 
    const storeId = document.getElementById('b-store').value || null; 
    const linkUrl = document.getElementById('b-link').value.trim() || null; 
    
    if (!bannerImgBase64) return alert("Selecione uma imagem.");
    const { error } = await supabase.from('banners').insert([{ id: generateId(), image: bannerImgBase64, city, storeId, link: linkUrl, timestamp: Date.now() }]);
    if(error) alert("Erro ao salvar banner:\n" + error.message); else {
        bannerImgBase64 = ''; document.getElementById('b-image').value = ''; document.getElementById('b-store').value = ''; document.getElementById('b-link').value = ''; alert("Banner adicionado!"); fetchBanners();
    }
};

window.deleteBanner = async (id) => { 
    if(confirm("Remover banner?")) { 
        const { error } = await supabase.from('banners').delete().eq('id', id); 
        if(error) alert("Erro: " + error.message); else fetchBanners();
    } 
};

function renderBanners() {
    const container = document.getElementById('banner-list-container');
    if(globalBanners.length === 0) { container.innerHTML = '<p style="color:#999; padding: 20px;">Nenhum banner registado.</p>'; return; }
    container.innerHTML = globalBanners.map(b => {
        let storeName = "Nenhuma"; if(b.storeId) { const st = allStores.find(s => s.id === b.storeId); if(st) storeName = st.name; }
        return `<div class="card-item" style="flex-direction:column; align-items:flex-start; padding: 15px;">
            <img src="${b.image}" style="width:100%; height:130px; object-fit:cover; border-radius:12px; margin-bottom:15px; border: 1px solid #eee;">
            <div style="width:100%; display:flex; justify-content:space-between; align-items:flex-start;">
                <div style="display:flex; flex-direction:column; gap:2px; max-width:70%;">
                    <span class="badge-city" style="margin: 0; width: fit-content;">📍 ${b.city === 'all' ? 'Global' : b.city}</span>
                    ${b.storeId ? `<span style="font-size:0.8rem; color:#555;">🏪 Loja: <b>${storeName}</b></span>` : ''}
                    ${b.link ? `<span style="font-size:0.8rem; color:#0d6efd;">🔗 Externo: <b>${b.link}</b></span>` : ''}
                </div>
                <button class="btn-del" onclick="window.deleteBanner('${b.id}')">Apagar</button>
            </div>
        </div>`}).join('');
}

// ==========================================
// 10. PATROCINADORES (ABERTURA)
// ==========================================
document.getElementById('sp-image').addEventListener('change', function(e) { const file = e.target.files[0]; if (file) { resizeAndCompressImage(file, (base64) => { sponsorImgBase64 = base64; }); } });

async function fetchSponsors() {
    const { data, error } = await supabase.from('sponsors').select('*');
    if (!error && data) { globalSponsors = data; renderSponsors(); }
}

window.saveSponsor = async (event) => {
    if (event) event.preventDefault();
    const city = document.getElementById('sp-city').value; const duration = document.getElementById('sp-duration').value; const transition = document.getElementById('sp-transition').value;
    if (!sponsorImgBase64) return alert("Selecione a imagem.");
    const { error } = await supabase.from('sponsors').insert([{ id: generateId(), image: sponsorImgBase64, city, duration: parseInt(duration), transition, timestamp: Date.now() }]);
    if(error) alert("Erro ao salvar:\n" + error.message); else { sponsorImgBase64 = ''; document.getElementById('sp-image').value = ''; alert("Registado!"); fetchSponsors(); }
};

window.deleteSponsor = async (id) => { 
    if(confirm("Remover patrocinador?")) { 
        const { error } = await supabase.from('sponsors').delete().eq('id', id); 
        if(error) alert("Erro: " + error.message); else fetchSponsors();
    } 
};

function renderSponsors() {
    const container = document.getElementById('sponsor-list-container');
    if(globalSponsors.length === 0) { container.innerHTML = '<p style="color:#999;">Nenhum patrocinador registado.</p>'; return; }
    container.innerHTML = globalSponsors.map(s => {
        let transName = s.transition === 'zoom' ? 'Aproximar' : s.transition === 'slide' ? 'Deslizar Baixo' : s.transition === 'slide-left' ? 'Deslizar Esquerda' : 'Esmaecer';
        return `<div class="card-item" style="flex-direction:column; align-items:flex-start; padding: 15px;">
            <img src="${s.image}" style="width:100%; height:200px; object-fit:contain; background:#111; border-radius:12px; margin-bottom:15px;">
            <div style="width:100%; font-size:0.85rem; color:#555; margin-bottom:15px;">Tempo: ${s.duration} Segs | Efeito: ${transName}</div>
            <div style="width:100%; display:flex; justify-content:space-between; align-items:center;">
                <span class="badge-city" style="margin: 0;">📍 ${s.city === 'all' ? 'Global' : s.city}</span><button class="btn-del" onclick="window.deleteSponsor('${s.id}')">Apagar</button>
            </div>
        </div>`;
    }).join('');
}

// ==========================================
// 11. AVISOS GLOBAIS
// ==========================================
async function fetchAlerts() {
    const { data, error } = await supabase.from('global_alerts').select('*');
    if (!error && data) { globalAlerts = data; globalAlerts.sort((a,b) => b.timestamp - a.timestamp); renderAlerts(); }
}

window.saveAlert = async (event) => {
    if (event) event.preventDefault();
    const text = document.getElementById('alert-text').value.trim(); const type = document.getElementById('alert-type').value;
    if(!text) return alert("Digite o texto.");
    const { error } = await supabase.from('global_alerts').insert([{ id: generateId(), text, type, timestamp: Date.now(), active: true }]);
    if(error) alert("Erro ao disparar aviso:\n" + error.message); else { document.getElementById('alert-text').value = ''; alert("Aviso disparado!"); fetchAlerts(); }
}

window.deleteAlert = async (id) => { 
    if(confirm("Apagar aviso?")) { 
        const { error } = await supabase.from('global_alerts').delete().eq('id', id); 
        if(error) alert("Erro: " + error.message); else fetchAlerts();
    } 
}

function renderAlerts() {
    const container = document.getElementById('alerts-list-container');
    if(globalAlerts.length === 0) { container.innerHTML = '<p style="color:#999;">Nenhum aviso ativo.</p>'; return; }
    container.innerHTML = globalAlerts.map(a => {
        let badgeColor = a.type === 'promo' ? '#ea1d2c' : a.type === 'success' ? '#00a14b' : '#0d6efd';
        let typeName = a.type === 'promo' ? 'Promoção' : a.type === 'success' ? 'Sucesso' : 'Comunicado';
        return `<div style="background:#fff; padding:15px; border-radius:12px; border:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
            <div><strong style="color: ${badgeColor}; font-size:0.75rem; background: ${badgeColor}15; padding: 4px 8px; border-radius: 6px;">${typeName}</strong>
            <div style="color:#111; font-size:1.05rem; font-weight:bold; margin-top:8px;">${a.text}</div></div>
            <button onclick="window.deleteAlert('${a.id}')" style="background:#fef0f0; border:1px solid #fbd5d5; padding: 10px; border-radius: 8px; color:#ea1d2c; cursor:pointer;">🗑️</button>
        </div>`}).join('');
}
