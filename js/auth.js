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
