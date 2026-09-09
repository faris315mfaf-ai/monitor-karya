-- ============================================================
-- MonitorKarya — seed STRUKTUR (10 Sep 2026)
--
-- Holding PT Bike + 8 anak perusahaan, divisi, proyek, dan akun ber-username.
-- SENGAJA TANPA data laporan/task/eskalasi/KPI: dashboard mulai kosong supaya
-- diisi sendiri dan perubahannya terlihat.
--
-- Jalankan: npm run db:seed:sql   lalu   npm run db:passwords -- --all
-- (SEED_PASSWORD di .env = 1234 untuk seluruh akun contoh)
--
-- Akun contoh (username): superadmin, owner, manajemen, holding, adminbike,
--   adminptcontoh, kepaladivisi, manager, direkturentitas (PT Sigma),
--   admin<slug> untuk tiap PT lain, direktur.<slug>, kadiv.<divisi>.<slug>,
--   manager1.<slug>, manager2.<slug>.
-- PENTING: TRUNCATE menghapus tabel User beserta kata sandinya.
-- ============================================================
DO $seed$
DECLARE
  now_utc     timestamp := (now() at time zone 'UTC');
  yr          int       := extract(year from (now() at time zone 'Asia/Jakarta'))::int;

  holding_id  text := gen_random_uuid()::text;
  cal_id      text := gen_random_uuid()::text;

  -- anak perusahaan (urutan sesuai daftar pengguna)
  pt_codes    text[] := ARRAY['PT-SIGMA','PT-CIPTA','PT-FAHREZA','PT-KBI','PT-SMI','PT-PRAMBANAN','PT-RATUKARYA','PT-SPKD'];
  pt_names    text[] := ARRAY['PT Sigma','PT Cipta','PT Fahreza','PT kBI','PT SMI','PT Prambanan','PT Ratu Karya','PT SPKD'];
  pt_slugs    text[] := ARRAY['sigma','cipta','fahreza','kbi','smi','prambanan','ratukarya','spkd'];
  pt_addr     text[] := ARRAY[
    'Jl. Gatot Subroto Kav. 12, Jakarta Selatan','Jl. Raya Bekasi Km 18, Bekasi','Jl. Ahmad Yani No. 88, Surabaya',
    'Jl. Soekarno-Hatta No. 21, Bandung','Jl. Diponegoro No. 5, Semarang','Jl. Malioboro No. 60, Yogyakarta',
    'Jl. Sudirman No. 14, Pekanbaru','Jl. Pemuda No. 33, Makassar'];
  pt_phone    text[] := ARRAY['+62 21 5200 101','+62 21 8890 202','+62 31 5310 303','+62 22 6030 404',
                              '+62 24 8410 505','+62 274 5120 606','+62 761 4510 707','+62 411 4560 808'];
  colors      text[] := ARRAY['#2563eb','#0891b2','#7c3aed','#db2777','#16a34a','#ea580c','#0d9488','#4f46e5'];

  -- divisi: 3 per PT, dirotasi dari 8 jenis
  div_types   text[] := ARRAY['PROD','FIN','HRD','OPS','HSE','IT','ENG','LOG'];

  -- proyek: 2 per PT
  proj_names  text[][] := ARRAY[
    ARRAY['Pembangunan Gudang Distribusi','Digitalisasi Sistem Operasional'],
    ARRAY['Renovasi Kantor Pusat','Implementasi ERP Terpadu'],
    ARRAY['Ekspansi Lini Produksi','Sertifikasi ISO 9001'],
    ARRAY['Pengadaan Armada Baru','Optimasi Rantai Pasok'],
    ARRAY['Pembangunan Pabrik Tahap II','Program Efisiensi Energi'],
    ARRAY['Modernisasi Mesin Utama','Pengembangan Kanal Penjualan'],
    ARRAY['Pembangunan Fasilitas Baru','Peningkatan Kapasitas Layanan'],
    ARRAY['Integrasi Sistem Informasi','Pelatihan & Sertifikasi SDM']];
  proj_phases text[] := ARRAY['PELAKSANAAN','PERENCANAAN'];

  -- nama orang generik untuk akun non-contoh
  first_names text[] := ARRAY['Bpk. Arif','Ibu Dewi','Bpk. Fajar','Ibu Hesti','Bpk. Imam','Ibu Kartika','Bpk. Lukman','Ibu Nadia',
                              'Bpk. Prasetyo','Ibu Rina','Bpk. Surya','Ibu Tari','Bpk. Wahyu','Ibu Yuni','Bpk. Zaki','Ibu Ayu'];

  -- variabel kerja
  i int; j int; name_i int := 0;
  pt_id text; pt_path text; cur_admin text; cur_dir text; div_id text; kdv_id text; proj_id text; cur_pic text;
  dt_code text; dt_name text; nm text; un text; slug text;
  r record;
BEGIN
  -- ---------- kosongkan ----------
  TRUNCATE "KpiSnapshot","WeeklyReportItem","WeeklyDivisionReport","DailyProjectReport","ProjectProgressReport","ProjectApproval",
           "Subtask","Task","Escalation","Evidence","Note","UnlockRequest","AuditLog","LateIncident","SpotCheck","NotificationLog",
           "AdminAppointment","Project","Division","Holiday","WorkCalendar","Priority","AspectCategory","DivisionType","User","Entity" CASCADE;

  CREATE TEMP TABLE tmp_pt (i int, id text, code text, name text, slug text) ON COMMIT DROP;

  -- ---------- referensi ----------
  INSERT INTO "AspectCategory"(id,code,name) VALUES
    (gen_random_uuid()::text,'OPS','Operasional'),(gen_random_uuid()::text,'KEU','Keuangan'),
    (gen_random_uuid()::text,'PAT','Kepatuhan'),(gen_random_uuid()::text,'SDM','SDM'),
    (gen_random_uuid()::text,'HSE','HSE'),(gen_random_uuid()::text,'PRJ','Proyek'),
    (gen_random_uuid()::text,'SYS','Sistem'),(gen_random_uuid()::text,'KOM','Komersial');
  INSERT INTO "Priority"(id,code,name,weight) VALUES
    (gen_random_uuid()::text,'TINGGI','Tinggi',3),(gen_random_uuid()::text,'SEDANG','Sedang',2),(gen_random_uuid()::text,'RENDAH','Rendah',1);
  INSERT INTO "DivisionType"(id,code,name,"updatedAt") VALUES
    (gen_random_uuid()::text,'PROD','Produksi',now_utc),(gen_random_uuid()::text,'FIN','Keuangan',now_utc),
    (gen_random_uuid()::text,'HRD','SDM',now_utc),(gen_random_uuid()::text,'OPS','Operasional',now_utc),
    (gen_random_uuid()::text,'HSE','K3 & Lingkungan',now_utc),(gen_random_uuid()::text,'IT','Teknologi Informasi',now_utc),
    (gen_random_uuid()::text,'ENG','Teknik',now_utc),(gen_random_uuid()::text,'LOG','Logistik',now_utc);
  INSERT INTO "WorkCalendar"(id,code,name,region) VALUES (cal_id,'CAL-ID','Kalender Kerja Indonesia','Nasional');
  INSERT INTO "Holiday"(id,"workCalendarId",date,name,scope)
  SELECT gen_random_uuid()::text, cal_id, (make_date(yr,mm,dd)::timestamp - interval '7 hours'), hnm, 'GRUP'
  FROM (VALUES (1,1,'Tahun Baru Masehi'),(5,1,'Hari Buruh Internasional'),(6,1,'Hari Lahir Pancasila'),
               (8,17,'Hari Proklamasi Kemerdekaan RI'),(12,25,'Hari Raya Natal')) AS h(mm,dd,hnm);

  -- ---------- hierarki: holding -> 8 PT, dengan identitas ----------
  INSERT INTO "Entity"(id,type,code,name,path,address,phone,email,website,"updatedAt")
  VALUES (holding_id,'HOLDING','HOLDING-BIKE','Holding PT Bike','/holding/',
          'Jl. Jenderal Sudirman Kav. 52-53, Jakarta Selatan','+62 21 5150 000','corporate@bike.co.id','https://bike.co.id',now_utc);
  FOR i IN 1..8 LOOP
    pt_id := gen_random_uuid()::text;
    pt_path := '/holding/'||pt_codes[i]||'/';
    INSERT INTO "Entity"(id,"parentId",type,code,name,path,address,phone,email,"updatedAt")
    VALUES (pt_id,holding_id,'PT',pt_codes[i],pt_names[i],pt_path,pt_addr[i],pt_phone[i],'info@'||pt_slugs[i]||'.co.id',now_utc);
    INSERT INTO tmp_pt VALUES (i, pt_id, pt_codes[i], pt_names[i], pt_slugs[i]);
  END LOOP;

  -- ---------- akun tingkat holding ----------
  INSERT INTO "User"(id,username,email,name,role,title,"scopeEntityId","avatarColor","updatedAt") VALUES
    (gen_random_uuid()::text,'superadmin','deckemr@gmail.com','Super Admin','SUPERADMIN','Super Admin',NULL,'#0f172a',now_utc),
    (gen_random_uuid()::text,'owner','owner@bike.co.id','Owner Holding PT Bike','SUPERADMIN','Pemilik',NULL,'#1d4ed8',now_utc),
    (gen_random_uuid()::text,'manajemen','manajemen@bike.co.id','Manajemen Holding','MANAJEMEN','Manajemen Holding',NULL,'#16a34a',now_utc),
    (gen_random_uuid()::text,'holding','holding@bike.co.id','Direksi Holding PT Bike','DIREKTUR_SDM_GA','Direktur SDM & GA Holding',holding_id,'#0d9488',now_utc),
    (gen_random_uuid()::text,'adminbike','adminbike@bike.co.id','Admin Holding PT Bike','ADMIN_PT','Admin Holding',holding_id,'#2563eb',now_utc);

  -- ---------- per PT: admin, direktur, 3 divisi + kadiv, 2 proyek + manager ----------
  FOR r IN SELECT * FROM tmp_pt ORDER BY tmp_pt.i LOOP
    slug := r.slug;

    -- Admin PT (PT Sigma memakai akun contoh)
    cur_admin := gen_random_uuid()::text;
    IF r.i = 1 THEN un := 'adminptcontoh'; nm := 'Admin PT Sigma (contoh)';
    ELSE un := 'admin'||slug; nm := 'Admin '||r.name; END IF;
    INSERT INTO "User"(id,username,email,name,role,title,"scopeEntityId","avatarColor","updatedAt")
    VALUES (cur_admin, un, un||'@karya.co.id', nm, 'ADMIN_PT', 'Admin PT', r.id, colors[((r.i-1) % 8)+1], now_utc);

    -- Direktur Perusahaan
    cur_dir := gen_random_uuid()::text;
    IF r.i = 1 THEN un := 'direkturentitas'; nm := 'Direktur PT Sigma (contoh)';
    ELSE un := 'direktur.'||slug; name_i := name_i + 1; nm := first_names[((name_i-1) % 16)+1]; END IF;
    INSERT INTO "User"(id,username,email,name,role,title,"scopeEntityId","avatarColor","updatedAt")
    VALUES (cur_dir, un, un||'@karya.co.id', nm, 'DIREKTUR_ENTITAS', 'Direktur Perusahaan', r.id, colors[(r.i % 8)+1], now_utc);

    INSERT INTO "AdminAppointment"(id,"entityId","userName","userEmail",kind,"skNumber","validFrom","validUntil",status,"updatedAt")
    SELECT gen_random_uuid()::text, r.id, u.name, u.email, 'UTAMA', 'SK/'||yr||'/'||lpad(r.i::text,2,'0')||'/HR',
           make_date(yr,1,1)::timestamp - interval '7 hours', make_date(yr+2,12,31)::timestamp - interval '7 hours', 'AKTIF', now_utc
    FROM "User" u WHERE u.id = cur_admin;

    -- 3 divisi, masing-masing dengan kepala divisi
    FOR j IN 1..3 LOOP
      dt_code := div_types[((r.i + j - 2) % 8) + 1];
      SELECT dt.name INTO dt_name FROM "DivisionType" dt WHERE dt.code = dt_code;
      div_id := gen_random_uuid()::text;
      kdv_id := gen_random_uuid()::text;
      IF r.i = 1 AND j = 1 THEN un := 'kepaladivisi'; nm := 'Kepala Divisi '||dt_name||' (contoh)';
      ELSE un := 'kadiv.'||regexp_replace(lower(dt_name),'[^a-z]','','g')||'.'||slug;
           name_i := name_i + 1; nm := first_names[((name_i-1) % 16)+1]; END IF;
      INSERT INTO "User"(id,username,email,name,role,title,"scopeEntityId","avatarColor","updatedAt")
      VALUES (kdv_id, un, un||'@karya.co.id', nm, 'KEPALA_DIVISI', 'Kepala Divisi '||dt_name, r.id, colors[((r.i + j) % 8)+1], now_utc);
      INSERT INTO "Division"(id,"entityId","divisionTypeId",name,"headUserId","updatedAt")
      SELECT div_id, r.id, dt.id, dt_name, kdv_id, now_utc FROM "DivisionType" dt WHERE dt.code = dt_code;
    END LOOP;

    -- 2 proyek, masing-masing dipegang SATU manager proyek
    FOR j IN 1..2 LOOP
      proj_id := gen_random_uuid()::text;
      cur_pic := gen_random_uuid()::text;
      IF r.i = 1 AND j = 1 THEN un := 'manager'; nm := 'Manager Proyek (contoh)';
      ELSE un := 'manager'||j||'.'||slug; name_i := name_i + 1; nm := first_names[((name_i-1) % 16)+1]; END IF;
      INSERT INTO "User"(id,username,email,name,role,title,"scopeEntityId","avatarColor","updatedAt")
      VALUES (cur_pic, un, un||'@karya.co.id', nm, 'PIC_PROYEK', 'Manager Proyek', r.id, colors[((r.i + j + 2) % 8)+1], now_utc);
      INSERT INTO "Project"(id,"entityId",code,name,phase,lifecycle,"picName","picUserId","startDate","targetEndDate","approvedByName","approvedAt","updatedAt")
      VALUES (proj_id, r.id, r.code||'-PRJ-'||lpad(j::text,2,'0'), proj_names[r.i][j], proj_phases[j], 'AKTIF', nm, cur_pic,
              make_date(yr, j*2, 1)::timestamp - interval '7 hours', make_date(yr, j*2+8, 28)::timestamp - interval '7 hours',
              'Manajemen Holding', make_date(yr, j*2, 5)::timestamp - interval '7 hours', now_utc);
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Seed struktur selesai: 1 holding, 8 PT, % akun, % divisi, % proyek — tanpa data laporan.',
    (SELECT count(*) FROM "User"), (SELECT count(*) FROM "Division"), (SELECT count(*) FROM "Project");
END
$seed$;
