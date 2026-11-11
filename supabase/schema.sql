-- 報修登記系統：供人工審閱的首次建表腳本，本次僅產生檔案，不執行。
-- 以具備建表、授權與原則管理權限的角色執行；目標資料表必須尚未存在。
-- 使用交易讓建表、權限與 RLS 一起生效，任何步驟失敗時不留下半成品。
begin;

-- 第一段：資料結構與 CHECK。
-- 本設計將業務欄位設為不可空值；文字長度為設計建議，正式上線前須確認。
-- 姓名 1～100 字、地點 1～200 字、問題說明 1～2000 字；不接受純空白。
-- 長度以 PostgreSQL 的字元數計算；列舉值使用精確比對，同時限制內容與長度。
create table public.repair_requests (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    reporter_name text not null,
    location text not null,
    category text not null,
    description text not null,
    urgency text not null default '中',
    status text not null default '待處理',
    constraint repair_requests_reporter_name_check check (
        char_length(reporter_name) between 1 and 100
        and reporter_name ~ '[^[:space:]]'
    ),
    constraint repair_requests_location_check check (
        char_length(location) between 1 and 200
        and location ~ '[^[:space:]]'
    ),
    constraint repair_requests_description_check check (
        char_length(description) between 1 and 2000
        and description ~ '[^[:space:]]'
    ),
    constraint repair_requests_category_check check (
        category in ('設備', '網路', '環境', '其他')
    ),
    constraint repair_requests_urgency_check check (
        urgency in ('低', '中', '高')
    ),
    constraint repair_requests_status_check check (
        status in ('待處理', '處理中', '已完成')
    )
);

-- 第二段：GRANT 控制可以使用哪些資料表操作與新增欄位。
-- 明確撤回新表可能繼承的預設表級授權，只開放 anon；不授權 authenticated。
-- 此為首次建表腳本，沒有既存欄位級授權需要撤回。
revoke all privileges on table public.repair_requests
    from public, anon, authenticated;
grant usage on schema public to anon;
grant select on table public.repair_requests to anon;
-- 匿名新增只准指定以下五個輸入欄位；id、created_at、status 交由預設值產生。
-- 不授予表級 INSERT，也不授予 UPDATE、DELETE、TRUNCATE 等其他權限。
grant insert (reporter_name, location, category, description, urgency)
    on table public.repair_requests to anon;

-- 第三段：RLS 控制可讀取及新增的資料列。
-- 匿名訪客可讀取所有清單資料，新增後也可透過 SELECT 取得回傳資料。
alter table public.repair_requests enable row level security;
create policy repair_requests_anon_select
    on public.repair_requests
    for select
    to anon
    using (true);

-- 即使日後新增欄位授權調整，匿名新增仍必須以「待處理」開始。
-- 不建立 UPDATE 或 DELETE 原則，與 GRANT 共同拒絕匿名修改及刪除。
create policy repair_requests_anon_insert
    on public.repair_requests
    for insert
    to anon
    with check (status = '待處理');

-- 第四段：完成交易；此腳本未建立管理員更新管道。
-- 資料表擁有者及具 BYPASSRLS 的服務角色仍可能略過 RLS，金鑰不可放入前端。
commit;
