// ==========================================
// CONFIGURAÇÃO DO SUPABASE
// ==========================================
const SUPABASE_URL = 'https://mvhqsiyalupodrtsfncj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_K_tmqPg95RJlCCzwRZln4Q_kmfrUw0G';

// Usamos supabaseClient para não conflitar com a variável global 'supabase'
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// INICIALIZAÇÃO E AUTENTICAÇÃO
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const isAdmin = sessionStorage.getItem('adminAuth');
    if (!isAdmin) {
        window.location.href = "loginadm.html";
        return;
    }
    
    // Inicializar carregamento dos dados
    loadStores();
    loadCities();
    loadDrivers();
});

// ==========================================
// VARIÁVEIS GLOBAIS DE CONTROLE DE EDIÇÃO
// ==========================================
let editingStoreId = null;
let editingCityId = null;
let editingDriverId = null;
let storeImgBase64 = "";

// ==========================================
// GERENCIAMENTO DE LOJAS (STORES)
// ==========================================
async function loadStores() {
    const { data, error } = await supabaseClient.from('stores').select('*').order('name', { ascending: true });
    if (error) {
        console.error("Erro ao carregar lojas:", error);
        return;
    }
    
    const tableBody = document.getElementById("storesTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    data.forEach(store => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td><img src="${store.logo || 'placeholder.png'}" width="40" height="40" style="border-radius:50%;"></td>
            <td>${store.name}</td>
            <td>${store.email}</td>
            <td>${store.phone || '-'}</td>
            <td>
                <button onclick="editStore('${store.id}')" class="btn-edit">Editar</button>
                <button onclick="deleteStore('${store.id}')" class="btn-delete">Excluir</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

async function saveStore(event) {
    event.preventDefault();
    
    const name = document.getElementById("storeName").value;
    const email = document.getElementById("storeEmail").value;
    const phone = document.getElementById("storePhone").value;
    const city = document.getElementById("storeCity").value;
    
    const storeData = {
        name: name,
        email: email,
        phone: phone,
        city: city
    };

    if (editingStoreId) {
        // Modo Edição
        if (storeImgBase64) {
            storeData.logo = storeImgBase64;
        }

        const { data, error } = await supabaseClient
            .from('stores')
            .update(storeData)
            .eq('id', editingStoreId)
            .select();

        if (error) {
            alert(`Erro do Supabase ao atualizar: ${error.message}`);
            console.error(error);
        } else {
            alert("Loja atualizada com sucesso!");
            resetStoreForm();
            loadStores();
        }
    } else {
        // Modo Inserção
        storeData.logo = storeImgBase64 || "placeholder.png";

        const { data, error } = await supabaseClient
            .from('stores')
            .insert([storeData]);

        if (error) {
            alert(`Erro do Supabase ao inserir: ${error.message}`);
            console.error(error);
        } else {
            alert("Loja cadastrada com sucesso!");
            resetStoreForm();
            loadStores();
        }
    }
}

async function editStore(id) {
    const { data, error } = await supabaseClient.from('stores').select('*').eq('id', id).single();
    if (error || !data) {
        alert("Não foi possível buscar os dados da loja.");
        return;
    }

    editingStoreId = id;
    document.getElementById("storeName").value = data.name;
    document.getElementById("storeEmail").value = data.email;
    document.getElementById("storePhone").value = data.phone || "";
    document.getElementById("storeCity").value = data.city || "";
    document.getElementById("btnSaveStore").innerText = "Atualizar Loja";
}

async function deleteStore(id) {
    if (!confirm("Tem certeza que deseja excluir esta loja?")) return;

    const { error } = await supabaseClient
        .from('stores')
        .delete()
        .eq('id', id);

    if (error) {
        alert(`Erro do Supabase ao excluir: ${error.message}`);
        console.error(error);
    } else {
        alert("Loja excluída com sucesso!");
        loadStores();
    }
}

function resetStoreForm() {
    editingStoreId = null;
    document.getElementById("storeForm").reset();
    document.getElementById("btnSaveStore").innerText = "Salvar Loja";
    storeImgBase64 = "";
}

// Conversão de imagem para Base64
const storeImgInput = document.getElementById("storeLogoInput");
if (storeImgInput) {
    storeImgInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                storeImgBase64 = reader.result;
            };
            reader.readAsDataURL(file);
        }
    });
}

// ==========================================
// GERENCIAMENTO DE CIDADES (CITIES)
// ==========================================
async function loadCities() {
    const { data, error } = await supabaseClient.from('cities').select('*').order('name', { ascending: true });
    if (error) return console.error(error);

    const tableBody = document.getElementById("citiesTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    data.forEach(city => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${city.name}</td>
            <td>${city.state}</td>
            <td>${city.delivery_fee ? `R$ ${city.delivery_fee.toFixed(2)}` : 'Grátis'}</td>
            <td>
                <button onclick="editCity('${city.id}')" class="btn-edit">Editar</button>
                <button onclick="deleteCity('${city.id}')" class="btn-delete">Excluir</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

async function saveCity(event) {
    event.preventDefault();
    const name = document.getElementById("cityName").value;
    const state = document.getElementById("cityState").value;
    const fee = parseFloat(document.getElementById("cityFee").value) || 0;

    const cityData = { name: name, state: state, delivery_fee: fee };

    if (editingCityId) {
        const { error } = await supabaseClient.from('cities').update(cityData).eq('id', editingCityId).select();
        if (error) {
            alert(`Erro ao atualizar cidade: ${error.message}`);
        } else {
            alert("Cidade atualizada!");
            resetCityForm();
            loadCities();
        }
    } else {
        const { error } = await supabaseClient.from('cities').insert([cityData]);
        if (error) {
            alert(`Erro ao cadastrar cidade: ${error.message}`);
        } else {
            alert("Cidade cadastrada!");
            resetCityForm();
            loadCities();
        }
    }
}

async function editCity(id) {
    const { data, error } = await supabaseClient.from('cities').select('*').eq('id', id).single();
    if (error || !data) return;

    editingCityId = id;
    document.getElementById("cityName").value = data.name;
    document.getElementById("cityState").value = data.state;
    document.getElementById("cityFee").value = data.delivery_fee;
    document.getElementById("btnSaveCity").innerText = "Atualizar Cidade";
}

async function deleteCity(id) {
    if (!confirm("Excluir esta cidade?")) return;
    const { error } = await supabaseClient.from('cities').delete().eq('id', id);
    if (error) {
        alert(`Erro ao excluir cidade: ${error.message}`);
    } else {
        alert("Cidade excluída!");
        loadCities();
    }
}

function resetCityForm() {
    editingCityId = null;
    document.getElementById("cityForm").reset();
    document.getElementById("btnSaveCity").innerText = "Salvar Cidade";
}

// ==========================================
// GERENCIAMENTO DE ENTREGADORES (DRIVERS)
// ==========================================
async function loadDrivers() {
    const { data, error } = await supabaseClient.from('drivers').select('*').order('name', { ascending: true });
    if (error) return console.error(error);

    const tableBody = document.getElementById("driversTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    data.forEach(driver => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${driver.name}</td>
            <td>${driver.phone}</td>
            <td>${driver.vehicle || '-'}</td>
            <td>${driver.status === 'active' ? 'Ativo' : 'Inativo'}</td>
            <td>
                <button onclick="editDriver('${driver.id}')" class="btn-edit">Editar</button>
                <button onclick="deleteDriver('${driver.id}')" class="btn-delete">Excluir</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

async function saveDriver(event) {
    event.preventDefault();
    const name = document.getElementById("driverName").value;
    const phone = document.getElementById("driverPhone").value;
    const vehicle = document.getElementById("driverVehicle").value;
    const status = document.getElementById("driverStatus").value;

    const driverData = { name: name, phone: phone, vehicle: vehicle, status: status };

    if (editingDriverId) {
        const { error } = await supabaseClient.from('drivers').update(driverData).eq('id', editingDriverId).select();
        if (error) {
            alert(`Erro ao atualizar entregador: ${error.message}`);
        } else {
            alert("Entregador atualizado!");
            resetDriverForm();
            loadDrivers();
        }
    } else {
        const { error } = await supabaseClient.from('drivers').insert([driverData]);
        if (error) {
            alert(`Erro ao cadastrar entregador: ${error.message}`);
        } else {
            alert("Entregador cadastrado!");
            resetDriverForm();
            loadDrivers();
        }
    }
}

async function editDriver(id) {
    const { data, error } = await supabaseClient.from('drivers').select('*').eq('id', id).single();
    if (error || !data) return;

    editingDriverId = id;
    document.getElementById("driverName").value = data.name;
    document.getElementById("driverPhone").value = data.phone;
    document.getElementById("driverVehicle").value = data.vehicle || "";
    document.getElementById("driverStatus").value = data.status;
    document.getElementById("btnSaveDriver").innerText = "Atualizar Entregador";
}

async function deleteDriver(id) {
    if (!confirm("Excluir este entregador?")) return;
    const { error } = await supabaseClient.from('drivers').delete().eq('id', id);
    if (error) {
        alert(`Erro ao excluir entregador: ${error.message}`);
    } else {
        alert("Entregador excluído!");
        loadDrivers();
    }
}

function resetDriverForm() {
    editingDriverId = null;
    document.getElementById("driverForm").reset();
    document.getElementById("btnSaveDriver").innerText = "Salvar Entregador";
}

// ==========================================
// FUNÇÃO DE LOGOUT
// ==========================================
function logoutAdmin() {
    sessionStorage.removeItem('adminAuth');
    window.location.href = "loginadm.html";
}
