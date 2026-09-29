import React, { useEffect, useState, useCallback } from 'react';
import { SafeAreaView, View, Text, TextInput, TouchableOpacity, FlatList, ScrollView,
  Alert, StyleSheet, ActivityIndicator, Platform, StatusBar } from 'react-native';
import { supabase } from './lib/supabase';

const TYPES = ['breakfast', 'lunch', 'dinner'];
const Btn = ({ title, onPress, alt, small }) => (
  <TouchableOpacity onPress={onPress} style={[s.btn, alt && s.btnAlt, small && { padding: 8 }]}>
    <Text style={[s.btnT, alt && { color: '#e67e22' }]}>{title}</Text>
  </TouchableOpacity>
);
const Input = (p) => <TextInput placeholderTextColor="#999" {...p} style={s.input} />;
const Chips = ({ items, value, onChange }) => (
  <View style={s.row}>{items.map(i => (
    <TouchableOpacity key={i} onPress={() => onChange(i)} style={[s.chip, value === i && s.chipOn]}>
      <Text style={value === i && { color: '#fff' }}>{i}</Text></TouchableOpacity>))}</View>
);

// ---------- AUTH ----------
function Auth() {
  const [mode, setMode] = useState('email'); // email | phone
  const [isSignup, setSignup] = useState(false);
  const [role, setRole] = useState('customer');
  const [f, setF] = useState({ email: '', password: '', name: '', phone: '', otp: '' });
  const [otpSent, setOtpSent] = useState(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const fail = (e) => e && Alert.alert('Error', e.message);

  const emailAuth = async () => {
    if (isSignup) {
      const { error } = await supabase.auth.signUp({ email: f.email, password: f.password,
        options: { data: { role, name: f.name } } });
      fail(error); if (!error) Alert.alert('Check your email', 'Confirm your address, then log in.');
    } else fail((await supabase.auth.signInWithPassword({ email: f.email, password: f.password })).error);
  };
  const sendOtp = async () => {
    const { error } = await supabase.auth.signInWithOtp({ phone: f.phone,
      options: { data: { role, name: f.name } } }); // phone like +919876543210
    fail(error); if (!error) setOtpSent(true);
  };
  const verifyOtp = async () =>
    fail((await supabase.auth.verifyOtp({ phone: f.phone, token: f.otp, type: 'sms' })).error);

  return (
    <ScrollView contentContainerStyle={s.pad}>
      <Text style={s.h1}>🍱 Tiffin</Text>
      <Chips items={['email', 'phone']} value={mode} onChange={setMode} />
      {(isSignup || mode === 'phone') && <>
        <Input placeholder="Your name" value={f.name} onChangeText={set('name')} />
        <Text style={s.label}>I am a</Text>
        <Chips items={['customer', 'provider']} value={role} onChange={setRole} />
      </>}
      {mode === 'email' ? <>
        <Input placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={f.email} onChangeText={set('email')} />
        <Input placeholder="Password" secureTextEntry value={f.password} onChangeText={set('password')} />
        <Btn title={isSignup ? 'Register' : 'Login'} onPress={emailAuth} />
        <Btn alt title={isSignup ? 'Have an account? Login' : 'New here? Register'} onPress={() => setSignup(!isSignup)} />
      </> : <>
        <Input placeholder="+91XXXXXXXXXX" keyboardType="phone-pad" value={f.phone} onChangeText={set('phone')} />
        {otpSent && <Input placeholder="6-digit OTP" keyboardType="number-pad" value={f.otp} onChangeText={set('otp')} />}
        <Btn title={otpSent ? 'Verify OTP' : 'Send OTP'} onPress={otpSent ? verifyOtp : sendOtp} />
      </>}
    </ScrollView>
  );
}

// ---------- CUSTOMER ----------
function Browse({ user }) {
  const [providers, setProviders] = useState([]);
  const [area, setArea] = useState('');
  const [sel, setSel] = useState(null);
  const load = useCallback(async () => {
    let q = supabase.from('providers').select('*');
    if (area.trim()) q = q.ilike('area', `%${area.trim()}%`);
    const { data } = await q; setProviders(data || []);
  }, [area]);
  useEffect(() => { load(); }, [load]);
  if (sel) return <Menu provider={sel} user={user} back={() => setSel(null)} />;
  return (
    <View style={s.pad}>
      <Input placeholder="Search your area (e.g. Gaya)" value={area} onChangeText={setArea} />
      <FlatList data={providers} keyExtractor={i => i.id}
        ListEmptyComponent={<Text style={s.muted}>No providers found in this area.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => setSel(item)}>
            <Text style={s.title}>{item.kitchen_name}</Text>
            <Text style={s.muted}>{item.area} · {item.description}</Text>
          </TouchableOpacity>)} />
    </View>
  );
}

function Menu({ provider, user, back }) {
  const [meals, setMeals] = useState([]);
  const [type, setType] = useState('lunch');
  const [address, setAddress] = useState('');
  useEffect(() => { (async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: dm } = await supabase.from('daily_menu').select('meals(*)')
      .eq('provider_id', provider.id).eq('menu_date', today);
    if (dm && dm.length) return setMeals(dm.map(d => d.meals));
    const { data } = await supabase.from('meals').select('*').eq('provider_id', provider.id).eq('is_default', true);
    setMeals(data || []); // default menu fallback
  })(); }, [provider.id]);
  const order = async (m) => {
    if (!address.trim()) return Alert.alert('Enter delivery address first');
    const { error } = await supabase.from('orders').insert({ customer_id: user.id,
      provider_id: provider.id, meal_id: m.id, address });
    Alert.alert(error ? 'Error' : 'Order placed! 🎉', error?.message);
  };
  return (
    <View style={s.pad}>
      <Btn small alt title="← Back" onPress={back} />
      <Text style={s.h2}>{provider.kitchen_name}</Text>
      <Chips items={TYPES} value={type} onChange={setType} />
      <Input placeholder="Delivery address" value={address} onChangeText={setAddress} />
      <FlatList data={meals.filter(m => m.meal_type === type)} keyExtractor={i => i.id}
        ListEmptyComponent={<Text style={s.muted}>Nothing available for {type} today.</Text>}
        renderItem={({ item }) => (
          <View style={s.card}>
            <Text style={s.title}>{item.name} · ₹{item.price}</Text>
            <Text style={s.muted}>{item.description}</Text>
            <Btn small title="Order" onPress={() => order(item)} />
          </View>)} />
    </View>
  );
}

function MyOrders({ user }) {
  const [orders, setOrders] = useState([]);
  useEffect(() => { supabase.from('orders').select('*, meals(name,price), providers(kitchen_name)')
    .eq('customer_id', user.id).order('created_at', { ascending: false })
    .then(({ data }) => setOrders(data || [])); }, []);
  return <FlatList contentContainerStyle={s.pad} data={orders} keyExtractor={i => i.id}
    renderItem={({ item }) => (<View style={s.card}>
      <Text style={s.title}>{item.meals?.name} · {item.providers?.kitchen_name}</Text>
      <Text style={s.muted}>{item.status}</Text></View>)} />;
}

// ---------- PROVIDER ----------
function KitchenSetup({ user, done }) {
  const [f, setF] = useState({ kitchen_name: '', area: '', description: '' });
  const save = async () => {
    const { error } = await supabase.from('providers').insert({ id: user.id, ...f });
    error ? Alert.alert('Error', error.message) : done();
  };
  return (<View style={s.pad}><Text style={s.h2}>Set up your kitchen</Text>
    <Input placeholder="Kitchen name" onChangeText={v => setF({ ...f, kitchen_name: v })} />
    <Input placeholder="Area / locality" onChangeText={v => setF({ ...f, area: v })} />
    <Input placeholder="Description" onChangeText={v => setF({ ...f, description: v })} />
    <Btn title="Save" onPress={save} /></View>);
}

function ProviderMeals({ user }) {
  const [meals, setMeals] = useState([]);
  const [today, setToday] = useState(new Set());
  const [f, setF] = useState({ name: '', description: '', price: '', meal_type: 'lunch', is_default: false });
  const date = new Date().toISOString().slice(0, 10);
  const load = async () => {
    const { data } = await supabase.from('meals').select('*').eq('provider_id', user.id);
    const { data: dm } = await supabase.from('daily_menu').select('meal_id').eq('provider_id', user.id).eq('menu_date', date);
    setMeals(data || []); setToday(new Set((dm || []).map(d => d.meal_id)));
  };
  useEffect(() => { load(); }, []);
  const add = async () => {
    const { error } = await supabase.from('meals').insert({ ...f, price: Number(f.price), provider_id: user.id });
    error ? Alert.alert('Error', error.message) : (setF({ ...f, name: '', description: '', price: '' }), load());
  };
  const toggleToday = async (m) => {
    today.has(m.id)
      ? await supabase.from('daily_menu').delete().eq('meal_id', m.id).eq('menu_date', date)
      : await supabase.from('daily_menu').insert({ meal_id: m.id, provider_id: user.id, menu_date: date });
    load();
  };
  const toggleDefault = async (m) => { await supabase.from('meals').update({ is_default: !m.is_default }).eq('id', m.id); load(); };
  return (
    <ScrollView contentContainerStyle={s.pad}>
      <Text style={s.h2}>Add a meal</Text>
      <Input placeholder="Meal name" value={f.name} onChangeText={v => setF({ ...f, name: v })} />
      <Input placeholder="Description" value={f.description} onChangeText={v => setF({ ...f, description: v })} />
      <Input placeholder="Price ₹" keyboardType="numeric" value={f.price} onChangeText={v => setF({ ...f, price: v })} />
      <Chips items={TYPES} value={f.meal_type} onChange={v => setF({ ...f, meal_type: v })} />
      <Btn small title="Add meal" onPress={add} />
      <Text style={s.h2}>Your meals — set today's menu</Text>
      {meals.map(m => (<View key={m.id} style={s.card}>
        <Text style={s.title}>{m.name} ({m.meal_type}) ₹{m.price}</Text>
        <View style={s.row}>
          <Btn small alt={!today.has(m.id)} title={today.has(m.id) ? '✓ On today\'s menu' : 'Add to today'} onPress={() => toggleToday(m)} />
          <Btn small alt={!m.is_default} title={m.is_default ? '★ Default' : 'Make default'} onPress={() => toggleDefault(m)} />
        </View></View>))}
    </ScrollView>
  );
}

function ProviderOrders({ user }) {
  const [orders, setOrders] = useState([]);
  const load = () => supabase.from('orders').select('*, meals(name)').eq('provider_id', user.id)
    .order('created_at', { ascending: false }).then(({ data }) => setOrders(data || []));
  useEffect(() => { load(); }, []);
  const setStatus = async (id, status) => { await supabase.from('orders').update({ status }).eq('id', id); load(); };
  return <FlatList contentContainerStyle={s.pad} data={orders} keyExtractor={i => i.id}
    renderItem={({ item }) => (<View style={s.card}>
      <Text style={s.title}>{item.meals?.name} × {item.quantity}</Text>
      <Text style={s.muted}>{item.address} · {item.status}</Text>
      <View style={s.row}>
        {['accepted', 'delivered', 'cancelled'].map(st => <Btn key={st} small alt title={st} onPress={() => setStatus(item.id, st)} />)}
      </View></View>)} />;
}

// ---------- ROOT ----------
export default function App() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [hasKitchen, setHasKitchen] = useState(true);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);
  const loadProfile = useCallback(async () => {
    if (!session) return setProfile(null);
    const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    setProfile(p);
    if (p?.role === 'provider') {
      const { data: k } = await supabase.from('providers').select('id').eq('id', p.id).maybeSingle();
      setHasKitchen(!!k);
    }
  }, [session]);
  useEffect(() => { loadProfile(); }, [loadProfile]);

  if (session === undefined) return <ActivityIndicator style={{ flex: 1 }} />;
  const body = () => {
    if (!session) return <Auth />;
    if (!profile) return <ActivityIndicator style={{ flex: 1 }} />;
    const u = session.user;
    if (profile.role === 'provider') {
      if (!hasKitchen) return <KitchenSetup user={u} done={loadProfile} />;
      return tab === 0 ? <ProviderMeals user={u} /> : <ProviderOrders user={u} />;
    }
    return tab === 0 ? <Browse user={u} /> : <MyOrders user={u} />;
  };
  const labels = profile?.role === 'provider' ? ['Menu', 'Orders'] : ['Browse', 'My orders'];
  return (
    <SafeAreaView style={s.root}>
      {session && <View style={s.bar}>
        {labels.map((l, i) => <TouchableOpacity key={l} onPress={() => setTab(i)}>
          <Text style={[s.tab, tab === i && s.tabOn]}>{l}</Text></TouchableOpacity>)}
        <TouchableOpacity onPress={() => supabase.auth.signOut()}><Text style={s.tab}>Logout</Text></TouchableOpacity>
      </View>}
      {body()}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fffaf3', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  pad: { padding: 16 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 },
  h1: { fontSize: 32, fontWeight: '800', textAlign: 'center', marginVertical: 20 },
  h2: { fontSize: 20, fontWeight: '700', marginVertical: 10 }, label: { marginTop: 8, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginVertical: 6, backgroundColor: '#fff', color: '#000' },
  btn: { backgroundColor: '#e67e22', padding: 12, borderRadius: 8, alignItems: 'center', marginVertical: 4 },
  btnAlt: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e67e22' }, btnT: { color: '#fff', fontWeight: '700' },
  chip: { borderWidth: 1, borderColor: '#e67e22', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 },
  chipOn: { backgroundColor: '#e67e22' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginVertical: 6, elevation: 2 },
  title: { fontSize: 16, fontWeight: '700' }, muted: { color: '#777', marginTop: 2 },
  bar: { flexDirection: 'row', justifyContent: 'space-around', padding: 10, borderBottomWidth: 1, borderColor: '#eee' },
  tab: { fontSize: 15, color: '#777' }, tabOn: { color: '#e67e22', fontWeight: '800' },
});
