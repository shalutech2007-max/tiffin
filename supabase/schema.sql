-- Run in Supabase Dashboard > SQL Editor
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null default 'customer' check (role in ('customer','provider')),
  name text, phone text
);
create table providers (
  id uuid primary key references profiles(id) on delete cascade,
  kitchen_name text not null, area text not null, description text
);
create table meals (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  name text not null, description text, price numeric not null,
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner')),
  is_default boolean not null default false
);
create table daily_menu (
  meal_id uuid references meals(id) on delete cascade,
  provider_id uuid references providers(id) on delete cascade,
  menu_date date not null default current_date,
  primary key (meal_id, menu_date)
);
create table orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id),
  provider_id uuid not null references providers(id),
  meal_id uuid not null references meals(id),
  quantity int not null default 1, address text,
  status text not null default 'placed' check (status in ('placed','accepted','delivered','cancelled')),
  created_at timestamptz default now()
);

-- auto-create profile on signup (role/name come from signup metadata)
create function handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into profiles(id, role, name, phone) values (new.id,
    coalesce(new.raw_user_meta_data->>'role','customer'),
    new.raw_user_meta_data->>'name', new.phone);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

alter table profiles enable row level security;
alter table providers enable row level security;
alter table meals enable row level security;
alter table daily_menu enable row level security;
alter table orders enable row level security;

create policy "own profile" on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "read providers" on providers for select using (true);
create policy "own provider" on providers for all using (id = auth.uid()) with check (id = auth.uid());
create policy "read meals" on meals for select using (true);
create policy "own meals" on meals for all using (provider_id = auth.uid()) with check (provider_id = auth.uid());
create policy "read menu" on daily_menu for select using (true);
create policy "own menu" on daily_menu for all using (provider_id = auth.uid()) with check (provider_id = auth.uid());
create policy "customer orders" on orders for select using (customer_id = auth.uid() or provider_id = auth.uid());
create policy "place order" on orders for insert with check (customer_id = auth.uid());
create policy "provider updates" on orders for update using (provider_id = auth.uid());
