import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// As suas credenciais do Firebase do Dores Delivery
const firebaseConfig = {
    apiKey: "AIzaSyBinV28T4xWvYAnE0Yed1rbsp9dEF_n7Eg",
    authDomain: "dores-delivery.firebaseapp.com",
    projectId: "dores-delivery",
    storageBucket: "dores-delivery.firebasestorage.app",
    messagingSenderId: "1029498697239",
    appId: "1:1029498697239:web:3ebc070bbd65048bd9ce52"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let allStores = []; let allDrivers = []; let globalBanners = []; let globalSponsors = []; let globalCities = [];
let globalUsers = []; let globalCoupons = []; let globalAlerts = [];
let storeImgBase64 = ''; let bannerImgBase64 = ''; let sponsorImgBase64 = '';
let editingStoreId = null; let editingDriverId = null;
let allOrders = [];

const formatBRL = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// 🟢 SISTEMA DE LOGIN VIA SESSÃO (BANCO DE DADOS) 🟢
window.onload = () => {
    const isAdminLogged = sessionStorage.getItem('adminAuth');
    if(isAdminLogged === 'true') {
        // Se estiver validado, exibe a interface do painel
        document.getElementById('app-screen').style.display = 'flex';
    } else {
        // Se não houver chave de sessão, redireciona para a página de login
        window.location.href = 'loginadm.html';
    }
};

window.logoutAdmin = () => {
    if(confirm("Deseja sair do painel administrativo?")) {
        sessionStorage.removeItem('adminAuth');
        window.location.href = 'loginadm.html';
    }
};

// 🟢 CONTROLO DE MENU MOBILE 🟢
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
// ÁUDIO DE NOTIFICAÇÃO
// ==========================================
let alertAudioBase64 = '';

document.getElementById('audio-file').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 800000) { 
            alert("O ficheiro é muito grande! Escolha um áudio menor que 800KB para não pesar o carregamento das lojas.");
            this.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = function(evt) {
            alertAudioBase64 = evt.target.result;
        };
        reader.readAsDataURL(file);
    }
});

window.saveAudioAlert = async () => {
    if (!alertAudioBase64) return alert("Por favor, selecione um ficheiro de áudio primeiro.");
    try {
        await setDoc(doc(db, "global_settings", "notification_audio"), {
            audioData: alertAudioBase64,
            updatedAt: Date.now()
        });
        alert("Áudio de notificação guardado com sucesso! A partir de agora, todas as lojas ouvirão este som.");
        document.getElementById('audio-file').value = '';
        alertAudioBase64 = '';
    } catch (e) {
        alert("Erro ao guardar áudio: " + e.message);
    }
};

window.deleteAudioAlert = async () => {
    if(confirm("Deseja remover o áudio personalizado e voltar para o som padrão (caixa registadora)?")) {
        try {
            await deleteDoc(doc(db, "global_settings", "notification_audio"));
            alert("Áudio restaurado para o padrão!");
        } catch(e) {}
    }
};

onSnapshot(doc(db, "global_settings", "notification_audio"), (docSnap) => {
    const container = document.getElementById('current-audio-container');
    if (docSnap.exists() && docSnap.data().audioData) {
        container.innerHTML = `
            <audio controls style="width: 100%; border-radius: 8px; margin-bottom: 15px; outline: none; background: #f9f9f9;">
                <source src="${docSnap.data().audioData}">
                O seu navegador não suporta áudio.
            </audio>
            <button class="btn-del" onclick="window.deleteAudioAlert()" style="width: 100%; justify-content: center;">Restaurar Som Padrão</button>
        `;
    } else {
        container.innerHTML = '<p style="color:#999; font-size:0.9rem;">Nenhum áudio personalizado no momento. O som padrão (caixa registadora) está ativo nas lojas.</p>';
    }
});


// ==========================================
// LÓGICA DO VÍDEO DE SPLASH SCREEN
// ==========================================
let splashVideoBase64 = '';

document.getElementById('splash-video-file').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        // 🟢 LIMITE AUMENTADO PARA 10MB (10.000.000 BYTES) 🟢
        if (file.size > 10000000) { 
            alert("O ficheiro excede o limite de 10MB! Por favor, diminua a resolução do vídeo ou use um Link Externo.");
            this.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = function(evt) {
            splashVideoBase64 = evt.target.result;
        };
        reader.readAsDataURL(file);
    }
});

window.saveSplashVideo = async () => {
    const urlInput = document.getElementById('splash-video-url').value.trim();
    const finalVideo = urlInput ? urlInput : splashVideoBase64;
    
    if (!finalVideo) return alert("Por favor, carregue um ficheiro de vídeo MP4 ou insira um link externo válido.");
    
    try {
        await setDoc(doc(db, "global_settings", "splash_video"), {
            videoData: finalVideo,
            updatedAt: Date.now()
        });
        alert("Vídeo de abertura guardado com sucesso! A aplicação já exibirá esta nova animação.");
        document.getElementById('splash-video-file').value = '';
        document.getElementById('splash-video-url').value = '';
        splashVideoBase64 = '';
    } catch (e) {
        // Se o Firebase recusar o tamanho do ficheiro durante o envio
        if(e.message.includes('payload is too large') || e.message.includes('size limit')) {
             alert("Erro: O ficheiro de vídeo selecionado é grande demais para ser guardado diretamente na base de dados. Por favor, coloque o vídeo no YouTube, Google Drive ou outro serviço e cole apenas o Link Externo na caixa apropriada.");
        } else {
            alert("Erro ao guardar vídeo: " + e.message);
        }
    }
};

window.deleteSplashVideo = async () => {
    if(confirm("Deseja remover o vídeo de abertura e voltar para a animação padrão da aplicação?")) {
        try {
            await deleteDoc(doc(db, "global_settings", "splash_video"));
            alert("Vídeo restaurado para o padrão!");
        } catch(e) {}
    }
};

// Carrega o vídeo atual para visualização no admin
onSnapshot(doc(db, "global_settings", "splash_video"), (docSnap) => {
    const container = document.getElementById('current-splash-container');
    if (docSnap.exists() && docSnap.data().videoData) {
        container.innerHTML = `
            <video controls autoplay muted loop style="width: 100%; max-width: 250px; border-radius: 12px; margin-bottom: 15px; background: #000; border: 1px solid #eee;">
                <source src="${docSnap.data().videoData}">
                O seu navegador não suporta vídeo.
            </video>
            <button class="btn-del" onclick="window.deleteSplashVideo()" style="width: 100%; justify-content: center;">Remover Vídeo e Usar Padrão</button>
        `;
    } else {
        container.innerHTML = '<p style="color:#999; font-size:0.9rem;">Nenhum vídeo personalizado no momento. A aplicação está a usar a animação padrão.</p>';
    }
});


// ==========================================
// 1. CIDADES
// ==========================================
onSnapshot(collection(db, "cities"), (snapshot) => {
    globalCities = [];
    snapshot.forEach(doc => globalCities.push({ id: doc.id, ...doc.data() }));
    globalCities.sort((a, b) => a.name.localeCompare(b.name));
    renderCitiesList();
    populateCityDropdowns();
});

window.saveCity = async () => {
    const name = document.getElementById('c-name').value.trim();
    const state = document.getElementById('c-state').value.trim().toUpperCase();
    if(!name || !state) return alert("Preencha o nome da cidade e a sigla do estado.");
    const exists = globalCities.find(c => c.name.toLowerCase() === name.toLowerCase() && c.state === state);
    if(exists) return alert("Esta cidade já está registada!");
    try {
        await addDoc(collection(db, "cities"), { name, state });
        document.getElementById('c-name').value = '';
        document.getElementById('c-state').value = '';
    } catch(e) { alert("Erro ao registar cidade."); }
};

window.deleteCity = async (id) => {
    if(confirm("Tem a certeza que deseja apagar esta cidade?")) {
        await deleteDoc(doc(db, "cities", id));
    }
};

function renderCitiesList() {
    const container = document.getElementById('city-list-container');
    if(globalCities.length === 0) {
        container.innerHTML = `<p style="color:#999; font-size:0.9rem;">Nenhuma cidade registada ainda.</p>`; return;
    }
    container.innerHTML = globalCities.map(c => `
        <div class="card-item" style="justify-content: space-between;">
            <div style="display:flex; align-items:center; gap:12px;">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ea1d2c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                <strong style="font-size: 1.15rem; color: #111;">${c.name} - ${c.state}</strong>
            </div>
            <button class="btn-del" onclick="window.deleteCity('${c.id}')" style="background: transparent; border: none; padding: 5px;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ea1d2c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
        </div>
    `).join('');
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
// 2. GESTÃO DE UTILIZADORES
// ==========================================
onSnapshot(collection(db, "customers"), (snapshot) => {
    globalUsers = []; let sicoobCount = 0;
    snapshot.forEach(doc => {
        const user = { id: doc.id, ...doc.data() };
        globalUsers.push(user);
        if (user.isSicoob) sicoobCount++;
    });
    document.getElementById('total-users').innerText = globalUsers.length;
    document.getElementById('total-sicoob').innerText = sicoobCount;
    window.filterUsers();
});

window.filterUsers = () => {
    const cityFilter = document.getElementById('filter-user-city').value;
    const searchFilter = document.getElementById('filter-user-search').value.toLowerCase().trim();
    const container = document.getElementById('users-container');

    let filtered = globalUsers;
    if (cityFilter !== 'all') filtered = filtered.filter(u => u.city === cityFilter);
    if (searchFilter !== '') {
        filtered = filtered.filter(u => 
            (u.name && u.name.toLowerCase().includes(searchFilter)) || 
            (u.email && u.email.toLowerCase().includes(searchFilter))
        );
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #999;">Nenhum utilizador encontrado.</div>`; return;
    }

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
                <div class="u-info">
                    <div class="u-name">${u.name || 'Cliente'}</div>
                    <div class="u-email">${u.email || ''}</div>
                </div>
            </div>
            <div class="badge-city" style="margin-bottom: 18px; width: fit-content;">📍 ${cityBadge}</div>
            <div class="u-data-row"><strong>Telefone:</strong> <span>${u.phone || 'N/A'}</span></div>
            <div class="u-data-row" style="margin-bottom: 20px;"><strong>Registado em:</strong> <span>${u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : '--'}</span></div>
            <div class="sicoob-area">
                <div class="sicoob-logo-text">Associado Patrocinador</div>
                <label class="toggle-switch">
                    <input type="checkbox" ${isSicoob ? 'checked' : ''} onchange="window.toggleSicoobStatus('${u.id}', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            <button class="btn-delete" style="color: #ea1d2c; border: 1px solid #fbd5d5; background: #fef0f0; padding: 12px; border-radius: 10px; cursor: pointer; width:100%; text-align:center; margin-top: auto;" onclick="window.deleteUser('${u.id}', '${safeName}')">Excluir Utilizador</button>
        </div>`;
    }).join('');
};

window.toggleSicoobStatus = async (userId, isNowSicoob) => {
    try { await updateDoc(doc(db, "customers", userId), { isSicoob: isNowSicoob }); } catch(e) { alert("Erro ao guardar."); window.filterUsers(); }
};

window.deleteUser = async (userId, userName) => {
    if (confirm(`Tem a certeza que deseja excluir ${userName}?`)) {
        try { await deleteDoc(doc(db, "customers", userId)); } catch(e) {}
    }
};

// ==========================================
// 3. CUPÕES PATROCINADOS
// ==========================================
window.toggleSponsorValueInput = () => {
    const type = document.getElementById('admin-sponsor-type').value;
    const valInput = document.getElementById('admin-sponsor-value');
    if(type === 'free_shipping') { valInput.value = ''; valInput.disabled = true; valInput.placeholder = "Não se aplica"; } 
    else { valInput.disabled = false; valInput.placeholder = "Ex: 20"; }
};

onSnapshot(collection(db, "coupons"), (snapshot) => {
    globalCoupons = []; snapshot.forEach(doc => globalCoupons.push({ id: doc.id, ...doc.data() })); renderAdminSponsorCoupons();
});

window.createSponsorCoupon = async () => {
    const sponsorName = document.getElementById('admin-sponsor-name').value.trim();
    const code = document.getElementById('admin-sponsor-code').value.trim().toUpperCase();
    const type = document.getElementById('admin-sponsor-type').value;
    // 🟢 LER O NOVO CAMPO DE PÚBLICO ALVO 🟢
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

    try {
        await addDoc(collection(db, "coupons"), {
            code, type, value, minOrder, usageLimit, storeId: "GLOBAL", targetCity, sponsorName, 
            exclusiveFor: exclusiveFor, // 🟢 GUARDAR A NOVA CONFIGURAÇÃO 🟢
            active: true, usedCount: 0, createdAt: Date.now()
        });
        alert(`Sucesso! Cupão criado.`);
        document.getElementById('admin-sponsor-code').value = ''; document.getElementById('admin-sponsor-value').value = '';
    } catch (error) {}
};

function renderAdminSponsorCoupons() {
    const container = document.getElementById('sponsor-coupons-list-container');
    const sponsorCoupons = globalCoupons.filter(c => c.storeId === 'GLOBAL');
    if (sponsorCoupons.length === 0) { container.innerHTML = '<p style="color:#999;">Nenhum cupão ativo.</p>'; return; }

    container.innerHTML = sponsorCoupons.map(c => {
        const toggleBtn = c.active ? `<button class="btn-suspend" onclick="window.toggleAdminCoupon('${c.id}', false)">Desativar</button>` : `<button class="btn-reactivate" onclick="window.toggleAdminCoupon('${c.id}', true)">Ativar</button>`;
        let discountText = c.type === 'percentage' ? `${c.value}%` : (c.type === 'free_shipping' ? `ENTREGA GRÁTIS` : `R$ ${c.value.toFixed(2)}`);
        let limitText = c.usageLimit ? `${c.usedCount || 0} / ${c.usageLimit}` : 'Ilimitado';
        
        // 🟢 EXIBIR A INFORMAÇÃO NO CARD DO ADMIN 🟢
        let audienceBadge = c.exclusiveFor === 'sicoob' 
            ? '<span style="background:#e6f4ea; color:#00a14b; padding:4px 8px; border-radius:6px; font-weight:bold; font-size:0.75rem;">Apenas Sicoob</span>' 
            : '<span style="background:#eef4ff; color:#0d6efd; padding:4px 8px; border-radius:6px; font-weight:bold; font-size:0.75rem;">Todos os Clientes</span>';

        return `
        <div class="card-item" style="flex-direction: column; align-items: flex-start; ${!c.active ? 'opacity: 0.6;' : ''}">
            <div style="width:100%; display:flex; justify-content:space-between; align-items:center;">
                <strong style="font-size:1.3rem;">${c.code}</strong>
                ${audienceBadge}
            </div>
            <div style="font-size:0.9rem; color:#555; width:100%; margin-top: 10px;">
                <strong>Patrocinador:</strong> ${c.sponsorName}<br>
                <strong>Cidade Alvo:</strong> ${c.targetCity}<br>
                <strong>Desconto:</strong> ${discountText}<br>
                <strong>Mínimo:</strong> R$ ${c.minOrder.toFixed(2)} | <strong>Utilizações:</strong> ${limitText}
            </div>
            <div class="actions-col" style="margin-top: 10px; width: 100%;">
                ${toggleBtn} <button class="btn-del" onclick="window.deleteAdminCoupon('${c.id}')">Excluir</button>
            </div>
        </div>`;
    }).join('');
}

window.toggleAdminCoupon = async (id, isActive) => { await updateDoc(doc(db, "coupons", id), { active: isActive }); };
window.deleteAdminCoupon = async (id) => { if(confirm("Apagar este cupão?")) await deleteDoc(doc(db, "coupons", id)); };

// ==========================================
// 4. LOJAS
// ==========================================
document.getElementById('s-logo').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) { resizeAndCompressImage(file, (compressedBase64) => { storeImgBase64 = compressedBase64; }); }
});

onSnapshot(collection(db, "stores"), (snapshot) => { 
    allStores = []; 
    snapshot.forEach(doc => allStores.push({ id: doc.id, ...doc.data() })); 
    
    window.renderStoreList(); 
    window.onCityFatChange(); 
    
    const bStoreEl = document.getElementById('b-store');
    if(bStoreEl) {
        const currentVal = bStoreEl.value;
        const sortedStores = [...allStores].sort((a,b) => a.name.localeCompare(b.name));
        bStoreEl.innerHTML = '<option value="">Nenhuma (Apenas visual)</option>' + 
            sortedStores.map(s => `<option value="${s.id}">🏪 ${s.name} (${s.city ? s.city.split(' - ')[0] : 'Sem cidade'})</option>`).join('');
        if(currentVal) bStoreEl.value = currentVal;
    }
});

window.saveStore = async () => { 
    const name = document.getElementById('s-name').value.trim(); const docId = document.getElementById('s-doc').value.trim();
    const cep = document.getElementById('s-cep').value.trim(); const street = document.getElementById('s-street').value.trim();
    const email = document.getElementById('s-email').value.trim(); const pass = document.getElementById('s-pass').value.trim(); 
    const cat = document.getElementById('s-cat').value; const cityDropdownVal = document.getElementById('s-city').value;
    const dueDateVal = document.getElementById('s-due-date').value;
    const isFeatured = document.getElementById('s-featured').checked;

    if(!name || !email || !pass || !cityDropdownVal) return alert("Preencha dados da loja, incluindo a cidade."); 
    const dueDateTimestamp = dueDateVal ? new Date(dueDateVal + 'T12:00:00').getTime() : null;

    const storeData = { name, email, password: pass, cat, doc: docId, cep, street, city: cityDropdownVal, dueDate: dueDateTimestamp, isFeatured: isFeatured };

    if (editingStoreId) { 
        if(allStores.find(s => s.email === email && s.id !== editingStoreId)) return alert("Já existe loja com este e-mail."); 
        if (storeImgBase64) storeData.logo = storeImgBase64; 
        await updateDoc(doc(db, "stores", editingStoreId), storeData); alert("Loja atualizada com sucesso!"); 
    } else { 
        if(allStores.find(s => s.email === email)) return alert("Já existe loja com este e-mail."); 
        storeData.status = 'Aberto'; storeData.isActive = true; storeData.logo = storeImgBase64 || 'https://via.placeholder.com/60';
        await addDoc(collection(db, "stores"), storeData); alert("Loja registada com sucesso!"); 
    } 
    window.cancelEdit(); 
};

window.editStore = (id) => { 
    editingStoreId = id; const store = allStores.find(s => s.id === id); if(!store) return; 
    document.getElementById('s-name').value = store.name; document.getElementById('s-doc').value = store.doc || ''; 
    document.getElementById('s-cep').value = store.cep || ''; document.getElementById('s-street').value = store.street || ''; 
    document.getElementById('s-city').value = store.city || ''; document.getElementById('s-email').value = store.email; 
    document.getElementById('s-pass').value = store.password; document.getElementById('s-cat').value = store.cat || 'Restaurantes'; 
    document.getElementById('s-featured').checked = store.isFeatured || false;
    if (store.dueDate) { document.getElementById('s-due-date').value = new Date(store.dueDate).toISOString().split('T')[0]; } else { document.getElementById('s-due-date').value = ''; }
    document.getElementById('s-logo').value = ''; storeImgBase64 = ''; 
    document.getElementById('btn-save-store').innerHTML = `Guardar Alterações`; 
    document.getElementById('btn-cancel-edit').style.display = "inline-flex"; 
    document.querySelector('.main-content').scrollTo({ top: 0, behavior: 'smooth' }); 
};

window.cancelEdit = () => { 
    editingStoreId = null; 
    document.getElementById('s-name').value = ''; document.getElementById('s-doc').value = ''; document.getElementById('s-cep').value = ''; 
    document.getElementById('s-street').value = ''; document.getElementById('s-city').value = ''; document.getElementById('s-email').value = ''; 
    document.getElementById('s-pass').value = ''; document.getElementById('s-logo').value = ''; document.getElementById('s-due-date').value = ''; 
    document.getElementById('s-featured').checked = false;
    storeImgBase64 = ''; 
    document.getElementById('btn-save-store').innerHTML = `Registar Loja`; 
    document.getElementById('btn-cancel-edit').style.display = "none"; 
};

window.toggleSubscription = async (id) => { const store = allStores.find(s => s.id === id); if (store) { await updateDoc(doc(db, "stores", id), { isActive: !store.isActive }); } };
window.deleteStore = async (id) => { if(confirm("Apagar loja permanentemente?")) { await deleteDoc(doc(db, "stores", id)); } };

window.renewSubscription = async (storeId, currentDue) => {
    if(confirm("Renovar por 1 mês e ativar loja?")) {
        const date = new Date(currentDue); date.setMonth(date.getMonth() + 1);
        await updateDoc(doc(db, "stores", storeId), { dueDate: date.getTime(), isActive: true });
    }
};

window.renderStoreList = () => { 
    const container = document.getElementById('store-list-container'); 
    const cityFilter = document.getElementById('filter-store-city').value;
    
    let filteredStores = allStores;
    if (cityFilter !== 'all') filteredStores = filteredStores.filter(s => s.city === cityFilter);

    if(filteredStores.length === 0) { container.innerHTML = `<p style="color:#999; padding:20px;">Nenhuma loja encontrada.</p>`; return; } 
    
    container.innerHTML = filteredStores.map(s => { 
        const isActive = s.isActive !== false; 
        let dueBadge = ''; let payButton = '';
        let featuredIcon = s.isFeatured ? '<span title="Loja em Destaque" style="color:#ea1d2c;">⭐</span>' : '';

        if (s.dueDate) {
            const daysLeft = Math.ceil((s.dueDate - Date.now()) / (1000 * 60 * 60 * 24));
            if (daysLeft < 0) dueBadge = `<span style="background: #fef0f0; color: #ea1d2c; padding: 4px; border-radius: 8px; font-size: 0.75rem;">Vencida</span>`; 
            else if (daysLeft <= 3) dueBadge = `<span style="background: #fff8e1; color: #d39e00; padding: 4px; border-radius: 8px; font-size: 0.75rem;">Vence em ${daysLeft}d</span>`; 
            else dueBadge = `<span style="background: #e6f4ea; color: #00a14b; padding: 4px; border-radius: 8px; font-size: 0.75rem;">Ativo</span>`;
            payButton = `<button class="btn-reactivate" onclick="window.renewSubscription('${s.id}', ${s.dueDate})">Renovar +1 Mês</button>`;
        }

        return ` 
        <div class="card-item ${isActive ? '' : 'suspended'}" style="position: relative;"> 
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
// 5. FATURAMENTO
// ==========================================
window.onCityFatChange = () => {
    const cityFilter = document.getElementById('filter-city-fat').value;
    const storeSelect = document.getElementById('filter-store-fat');
    const currentStore = storeSelect.value;

    let filteredStores = allStores;
    if(cityFilter !== 'all') {
        filteredStores = filteredStores.filter(s => s.city === cityFilter);
    }
    
    storeSelect.innerHTML = '<option value="all">Ver Todas as Lojas</option>' + 
        filteredStores.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    
    if(filteredStores.find(s => s.id === currentStore)) storeSelect.value = currentStore;
    else storeSelect.value = 'all';

    window.renderFaturamento();
};

window.renderFaturamento = () => {
    const timeFilter = document.getElementById('filter-faturamento').value;
    const cityFilter = document.getElementById('filter-city-fat').value;
    const storeFilter = document.getElementById('filter-store-fat').value;
    
    const now = Date.now();
    let startTime = 0;
    if (timeFilter === 'hoje') startTime = new Date().setHours(0,0,0,0);
    else if (timeFilter === '7dias') startTime = now - (7 * 24 * 60 * 60 * 1000);
    else if (timeFilter === 'mes') startTime = now - (30 * 24 * 60 * 60 * 1000);

    let totalVendas = 0;
    let totalTaxa = 0;
    let totalPedidos = 0;
    let storeRanking = {};

    allOrders.forEach(o => {
        if (o.timestamp >= startTime && ['Entregue', 'Concluído', 'Concluido'].includes(o.status)) {
            
            // FILTRO DE CIDADE
            if(cityFilter !== 'all') {
                const st = allStores.find(s => s.id === o.storeId);
                if(!st || st.city !== cityFilter) return;
            }
            
            // FILTRO DE LOJA
            if(storeFilter !== 'all' && o.storeId !== storeFilter) return;

            const val = o.total || 0;
            totalVendas += val;
            const taxa = o.platformFee || (val * 0.10); // Taxa padrao 10%
            totalTaxa += taxa;
            totalPedidos++;

            if(o.storeName) {
                if(!storeRanking[o.storeName]) {
                    storeRanking[o.storeName] = { rev: 0, orders: 0, tax: 0, logo: 'https://via.placeholder.com/80' };
                    const s = allStores.find(st => st.id === o.storeId);
                    if(s && s.logo) storeRanking[o.storeName].logo = s.logo;
                }
                storeRanking[o.storeName].rev += val;
                storeRanking[o.storeName].orders += 1;
                storeRanking[o.storeName].tax += taxa;
            }
        }
    });

    document.getElementById('fat-total-vendas').innerText = formatBRL(totalVendas);
    document.getElementById('fat-taxa-app').innerText = formatBRL(totalTaxa);
    document.getElementById('fat-pedidos').innerText = totalPedidos;

    const rankContainer = document.getElementById('ranking-list-render');
    const sorted = Object.keys(storeRanking).map(k => ({name: k, ...storeRanking[k]})).sort((a,b) => b.rev - a.rev);
    
    if(sorted.length === 0) {
        rankContainer.innerHTML = '<li style="justify-content:center; color:#999; padding:20px;">Nenhuma venda encontrada para o filtro.</li>';
    } else {
        const medals = ['🥇','🥈','🥉','4º','5º','6º','7º','8º','9º','10º'];
        rankContainer.innerHTML = sorted.map((s, i) => `
            <li class="ranking-item">
                <div class="r-medal">${medals[i] || (i+1)+'º'}</div>
                <img src="${s.logo}" class="r-logo">
                <div class="r-info">
                    <div class="r-name">${s.name}</div>
                    <div class="r-orders">${s.orders} Pedidos Concluídos</div>
                </div>
                <div class="r-revenue">
                    <div class="r-revenue-val">${formatBRL(s.rev)}</div>
                    <div class="r-revenue-tax">Taxa UaiPede: ${formatBRL(s.tax)}</div>
                </div>
            </li>
        `).join('');
    }
};

// ==========================================
// 6. REPASSE
// ==========================================
window.renderRepasse = () => {
    // Será implementado futuramente para visualização de taxas dos estafetas
};

// ==========================================
// 7. ENTREGADORES
// ==========================================
onSnapshot(collection(db, "drivers"), (snapshot) => { allDrivers = []; snapshot.forEach(doc => allDrivers.push({ id: doc.id, ...doc.data() })); renderDriverList(); });

window.saveDriver = async () => { 
    const name = document.getElementById('d-name').value.trim(); const phone = document.getElementById('d-phone').value.trim(); 
    const email = document.getElementById('d-email').value.trim(); const pass = document.getElementById('d-pass').value.trim(); 
    const city = document.getElementById('d-city').value;

    if(!name || !email || !pass || !phone || !city) return alert("Preencha todos os dados."); 
    if (editingDriverId) { 
        await updateDoc(doc(db, "drivers", editingDriverId), { name, phone, email, password: pass, city }); alert("Entregador atualizado!"); 
    } else { 
        await addDoc(collection(db, "drivers"), { name, phone, email, password: pass, city, isActive: true }); alert("Entregador registado!"); 
    } 
    window.cancelEditDriver(); 
};

window.editDriver = (id) => { 
    editingDriverId = id; const driver = allDrivers.find(d => d.id === id); if(!driver) return; 
    document.getElementById('d-name').value = driver.name; document.getElementById('d-phone').value = driver.phone; 
    document.getElementById('d-email').value = driver.email; document.getElementById('d-pass').value = driver.password; 
    document.getElementById('d-city').value = driver.city || '';
    document.getElementById('btn-save-driver').innerHTML = `Guardar Alterações`; 
    document.getElementById('btn-cancel-driver-edit').style.display = "inline-flex"; 
};

window.cancelEditDriver = () => { 
    editingDriverId = null; 
    document.getElementById('d-name').value = ''; document.getElementById('d-phone').value = ''; 
    document.getElementById('d-email').value = ''; document.getElementById('d-pass').value = ''; 
    document.getElementById('d-city').value = '';
    document.getElementById('btn-save-driver').innerHTML = `Registar Entregador`; 
    document.getElementById('btn-cancel-driver-edit').style.display = "none"; 
};

window.toggleDriverStatus = async (id) => { const driver = allDrivers.find(d => d.id === id); if (driver) { await updateDoc(doc(db, "drivers", id), { isActive: !driver.isActive }); } };
window.deleteDriver = async (id) => { if(confirm("Apagar entregador?")) { await deleteDoc(doc(db, "drivers", id)); } };

function renderDriverList() { 
    const container = document.getElementById('driver-list-container'); 
    if(allDrivers.length === 0) { container.innerHTML = `<p style="color:#999; padding:20px;">Nenhum entregador registado.</p>`; return; } 
    container.innerHTML = allDrivers.map(d => { 
        const isActive = d.isActive !== false; 
        return ` 
        <div class="card-item ${isActive ? '' : 'suspended'}"> 
            <div style="flex-grow: 1; line-height: 1.5;"> 
                <strong style="font-size: 1.2rem; color: #111;">${d.name}</strong><br> 
                <span style="font-size:0.85rem; color:#888;">📞 ${d.phone} | 📍 ${d.city || 'S/ Cidade'}</span><br>
                <span style="font-size:0.85rem; color:#555;">✉️ ${d.email} | 🔑 ${d.password}</span><br> 
            </div> 
            <div class="actions-col"> 
                <button class="btn-edit" onclick="window.editDriver('${d.id}')">Editar</button> 
                <button class="${isActive ? 'btn-suspend' : 'btn-reactivate'}" onclick="window.toggleDriverStatus('${d.id}')">${isActive ? 'Bloquear' : 'Ativar'}</button> 
                <button class="btn-del" onclick="window.deleteDriver('${d.id}')">Apagar</button> 
            </div> 
        </div> `; 
    }).join(''); 
}

// ==========================================
// 8. BANNERS DO APP COM LINK EXTERNO
// ==========================================
document.getElementById('b-image').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) { resizeAndCompressImage(file, (base64) => { bannerImgBase64 = base64; }); }
});

onSnapshot(collection(db, "banners"), (snapshot) => {
    globalBanners = [];
    snapshot.forEach(doc => globalBanners.push({ id: doc.id, ...doc.data() }));
    renderBanners();
});

window.saveBanner = async () => {
    const city = document.getElementById('b-city').value;
    const storeId = document.getElementById('b-store').value;
    const linkUrl = document.getElementById('b-link').value.trim(); 
    
    if (!bannerImgBase64) return alert("Por favor, selecione uma imagem para o banner.");
    
    try {
        await addDoc(collection(db, "banners"), { 
            image: bannerImgBase64, 
            city: city, 
            storeId: storeId, 
            link: linkUrl, 
            timestamp: Date.now() 
        });
        
        bannerImgBase64 = ''; 
        document.getElementById('b-image').value = '';
        document.getElementById('b-store').value = '';
        document.getElementById('b-link').value = '';
        alert("Banner adicionado com sucesso!");
    } catch(e) { alert("Erro ao guardar banner."); }
};

window.deleteBanner = async (id) => {
    if(confirm("Remover este banner da aplicação?")) {
        await deleteDoc(doc(db, "banners", id));
    }
};

function renderBanners() {
    const container = document.getElementById('banner-list-container');
    if(globalBanners.length === 0) { container.innerHTML = '<p style="color:#999; padding: 20px;">Nenhum banner registado.</p>'; return; }
    
    container.innerHTML = globalBanners.map(b => {
        let storeName = "Nenhuma";
        if(b.storeId) {
            const st = allStores.find(s => s.id === b.storeId);
            if(st) storeName = st.name;
        }
        
        let linkInfo = b.link ? `<span style="font-size:0.8rem; color:#0d6efd; display:block; margin-top:2px;">🔗 Externo: <b>${b.link}</b></span>` : '';
        let storeInfo = b.storeId ? `<span style="font-size:0.8rem; color:#555; display:block; margin-top:2px;">🏪 Loja: <b>${storeName}</b></span>` : '';

        return `
        <div class="card-item" style="flex-direction:column; align-items:flex-start; padding: 15px;">
            <img src="${b.image}" style="width:100%; height:130px; object-fit:cover; border-radius:12px; margin-bottom:15px; border: 1px solid #eee;">
            <div style="width:100%; display:flex; justify-content:space-between; align-items:flex-start;">
                <div style="display:flex; flex-direction:column; gap:2px; max-width:70%;">
                    <span class="badge-city" style="margin: 0; width: fit-content;">📍 ${b.city === 'all' ? 'Global' : b.city}</span>
                    ${storeInfo}
                    ${linkInfo}
                </div>
                <button class="btn-del" onclick="window.deleteBanner('${b.id}')">Apagar</button>
            </div>
        </div>
    `}).join('');
}

// ==========================================
// 9. PATROCINADORES (COM EFEITO DESLIZAR P/ ESQUERDA)
// ==========================================
document.getElementById('sp-image').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) { resizeAndCompressImage(file, (base64) => { sponsorImgBase64 = base64; }); }
});

onSnapshot(collection(db, "sponsors"), (snapshot) => {
    globalSponsors = [];
    snapshot.forEach(doc => globalSponsors.push({ id: doc.id, ...doc.data() }));
    renderSponsors();
});

window.saveSponsor = async () => {
    const city = document.getElementById('sp-city').value;
    const duration = document.getElementById('sp-duration').value;
    const transition = document.getElementById('sp-transition').value;

    if (!sponsorImgBase64) return alert("Por favor, selecione a imagem do patrocinador.");
    
    try {
        await addDoc(collection(db, "sponsors"), { 
            image: sponsorImgBase64, city: city, 
            duration: parseInt(duration), transition: transition, timestamp: Date.now() 
        });
        sponsorImgBase64 = ''; document.getElementById('sp-image').value = '';
        alert("Patrocinador registado com sucesso!");
    } catch(e) { alert("Erro ao guardar patrocinador."); }
};

window.deleteSponsor = async (id) => { if(confirm("Remover este patrocinador?")) await deleteDoc(doc(db, "sponsors", id)); };

function renderSponsors() {
    const container = document.getElementById('sponsor-list-container');
    if(globalSponsors.length === 0) { container.innerHTML = '<p style="color:#999;">Nenhum patrocinador registado.</p>'; return; }
    container.innerHTML = globalSponsors.map(s => {
        let transName = 'Esmaecer';
        if (s.transition === 'zoom') transName = 'Aproximar';
        else if (s.transition === 'slide') transName = 'Deslizar Baixo';
        else if (s.transition === 'slide-left') transName = 'Deslizar Esquerda'; 

        return `
        <div class="card-item" style="flex-direction:column; align-items:flex-start; padding: 15px;">
            <img src="${s.image}" style="width:100%; height:200px; object-fit:contain; background:#111; border-radius:12px; margin-bottom:15px;">
            <div style="width:100%; font-size:0.85rem; color:#555; margin-bottom:15px;">
                <strong style="color:#111;">Tempo:</strong> ${s.duration} Segs<br>
                <strong style="color:#111;">Efeito:</strong> ${transName}<br>
            </div>
            <div style="width:100%; display:flex; justify-content:space-between; align-items:center;">
                <span class="badge-city" style="margin: 0;">📍 ${s.city === 'all' ? 'Global' : s.city}</span>
                <button class="btn-del" onclick="window.deleteSponsor('${s.id}')">Apagar</button>
            </div>
        </div>
        `;
    }).join('');
}

// ==========================================
// 10. AVISOS GLOBAIS
// ==========================================
onSnapshot(collection(db, "global_alerts"), (snapshot) => {
    globalAlerts = []; snapshot.forEach(doc => globalAlerts.push({ id: doc.id, ...doc.data() }));
    globalAlerts.sort((a,b) => b.timestamp - a.timestamp); renderAlerts();
});

window.saveAlert = async () => {
    const text = document.getElementById('alert-text').value.trim(); const type = document.getElementById('alert-type').value;
    if(!text) return alert("Digite o texto do aviso.");
    try {
        await addDoc(collection(db, "global_alerts"), { text, type, timestamp: Date.now(), active: true });
        document.getElementById('alert-text').value = ''; alert("Aviso disparado!");
    } catch(e) { alert("Erro ao disparar aviso."); }
}

window.deleteAlert = async (id) => { if(confirm("Apagar e remover este aviso?")) await deleteDoc(doc(db, "global_alerts", id)); }

function renderAlerts() {
    const container = document.getElementById('alerts-list-container');
    if(globalAlerts.length === 0) { container.innerHTML = '<p style="color:#999;">Nenhum aviso ativo no momento.</p>'; return; }
    container.innerHTML = globalAlerts.map(a => {
        let badgeColor = '#0d6efd'; let typeName = 'Comunicado';
        if(a.type === 'promo') { badgeColor = '#ea1d2c'; typeName = 'Promoção'; }
        if(a.type === 'success') { badgeColor = '#00a14b'; typeName = 'Sucesso'; }
        
        return `
        <div style="background:#fff; padding:15px; border-radius:12px; border:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <strong style="color: ${badgeColor}; font-size:0.75rem; background: ${badgeColor}15; padding: 4px 8px; border-radius: 6px;">${typeName}</strong>
                <div style="color:#111; font-size:1.05rem; font-weight:bold; margin-top:8px;">${a.text}</div>
            </div>
            <button onclick="window.deleteAlert('${a.id}')" style="background:#fef0f0; border:1px solid #fbd5d5; padding: 10px; border-radius: 8px; color:#ea1d2c; cursor:pointer;">🗑️</button>
        </div>
    `}).join('');
}

// ==========================================
// CARREGAMENTO FINAL DE PEDIDOS (START DA ABA FATURAMENTO)
// ==========================================
onSnapshot(collection(db, "orders"), (snapshot) => {
    allOrders = []; snapshot.forEach(doc => allOrders.push({ id: doc.id, ...doc.data() }));
    if (typeof window.renderFaturamento === 'function') window.renderFaturamento(); 
});