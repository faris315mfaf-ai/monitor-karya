-- ============================================================
-- MonitorKarya — SQL seed (7 Sep 2026): Holding PT Bike & 8 anak perusahaan.
--
-- Struktur: HOLDING -> PT -> Proyek -> Laporan (harian, mingguan, bulanan).
-- Tidak ada sub-holding, sektor, atau wilayah — anak perusahaan langsung di
-- bawah holding. Setiap PT punya 3 divisi dan 2 proyek; tiap proyek dipegang
-- SATU PIC (aturan: satu PIC = satu proyek).
--
-- Akun demo (pic@, kadiv@, adminpt@, direktur@ ...) ditanam langsung pada
-- PT Sigma, jadi tidak perlu lagi `npm run db:demo`.
--
-- Semua tanggal dihitung dalam WIB lalu disimpan sebagai UTC.
-- Aman dijalankan ulang: mengosongkan semua tabel dulu.
-- Jalankan: npm run db:seed:sql   (atau tempel ke Supabase SQL Editor)
-- PENTING: TRUNCATE menghapus tabel User beserta kata sandinya. Setelah seed:
--   npm run db:passwords -- --all
-- ============================================================
DO $seed$
DECLARE
  now_utc     timestamp := (now() at time zone 'UTC');
  today_wib   date      := (now() at time zone 'Asia/Jakarta')::date;
  yr          int       := extract(year from (now() at time zone 'Asia/Jakarta'))::int;

  holding_id  text := gen_random_uuid()::text;
  cal_id      text := gen_random_uuid()::text;

  -- anak perusahaan
  pt_codes    text[] := ARRAY['PT-SIGMA','PT-CIPTA','PT-FAHREZA','PT-KBI','PT-SMI','PT-PRAMBANAN','PT-RATUKARYA','PT-SPKD'];
  pt_names    text[] := ARRAY['PT Sigma','PT Cipta','PT Fahreza','PT kBI','PT SMI','PT Prambanan','PT Ratu Karya','PT SPKD'];
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

  -- nama orang generik untuk akun non-demo
  first_names text[] := ARRAY['Bpk. Arif','Ibu Dewi','Bpk. Fajar','Ibu Hesti','Bpk. Imam','Ibu Kartika','Bpk. Lukman','Ibu Nadia',
                              'Bpk. Prasetyo','Ibu Rina','Bpk. Surya','Ibu Tari','Bpk. Wahyu','Ibu Yuni','Bpk. Zaki','Ibu Ayu'];

  daily_statuses  text[] := ARRAY['SELESAI','ON_PROGRESS','ON_PROGRESS','TERKENDALA','MENUNGGU_KEPUTUSAN','TIDAK_ADA_PERUBAHAN'];
  weekly_statuses text[] := ARRAY['SELESAI','ON_PROGRESS','BELUM_MULAI','TERKENDALA','NA'];
  obstacles   text[] := ARRAY[
    'Keterlambatan pengiriman material dari pemasok','Cuaca buruk menghambat pekerjaan lapangan',
    'Kendala teknis pada peralatan','Perizinan dari pemerintah daerah belum selesai',
    'Kekurangan tenaga kerja terampil','Akses ke lokasi terganggu',
    'Harga material naik melebihi anggaran','Perubahan spesifikasi dari pemberi kerja'];
  achievements text[] := ARRAY[
    'Menyelesaikan pemasangan struktur tahap 1','Instalasi 4 unit peralatan utama selesai',
    'Pekerjaan pondasi mencapai 100%','Uji coba sistem berjalan tanpa temuan','Pelatihan 25 operator selesai',
    'Pengujian beban penuh sukses','Pemasangan rangka 5 unit','Inspeksi akhir lulus',
    'Pencapaian 95% target penyelesaian','Penyerahan dokumen as-built lengkap'];
  wk_aspect   text[] := ARRAY['OPS','KEU','PAT','SDM','HSE','PRJ','SYS','KOM'];
  wk_work     text[] := ARRAY['Optimasi throughput produksi harian','Closing laporan keuangan bulanan','Audit kepatuhan internal SOP','Rekrutmen tenaga operator baru','Inspeksi APD & alat keselamatan','Milestone pengiriman modul proyek','Pembaruan sistem ERP modul produksi','Peluncuran kampanye pelanggan baru'];
  wk_pic      text[] := ARRAY['Operator Senior','Manajer Keuangan','Compliance Officer','HR Business Partner','Safety Officer','Project Manager','IT Support Lead','Sales Manager'];
  task_titles text[] := ARRAY['Pemasangan panel segmen 3','Koordinasi dengan pemasok material','Inspeksi kualitas hasil pengecoran','Penyusunan laporan progres mingguan','Pengukuran ulang area kerja','Rapat koordinasi tim lapangan'];
  task_urg    text[] := ARRAY['RENDAH','SEDANG','TINGGI','KRITIS'];
  esc_summary text[] := ARRAY[
    'Keterlambatan signifikan pada milestone pengiriman modul - diperlukan keputusan alokasi anggaran tambahan',
    'Kebutuhan dukungan fungsi logistik lintas entitas untuk percepatan pengiriman material',
    'Permohonan realokasi anggaran untuk penyelesaian tahap commissioning',
    'Persetujuan izin lingkungan terhambat proses birokrasi',
    'Konflik jadwal kontraktor - diperlukan koordinasi lintas proyek',
    'Defisit anggaran kuartal ini untuk penyelesaian tahap pengujian',
    'Persetujuan perubahan lingkup proyek pasca-review teknis',
    'Dukungan teknis khusus dari tim holding'];
  esc_needed  text[] := ARRAY['KEPUTUSAN','DUKUNGAN_LINTAS_FUNGSI','ANGGARAN','KEPUTUSAN','DUKUNGAN_LINTAS_FUNGSI','ANGGARAN','KEPUTUSAN','DUKUNGAN_LINTAS_FUNGSI'];
  esc_status  text[] := ARRAY['DIAJUKAN','DITINJAU','DIPUTUSKAN','DITUTUP'];
  unlock_reasons text[] := ARRAY[
    'Koreksi capaian harian yang salah input - perlu update progress',
    'Penambahan bukti pendukung yang tertinggal',
    'Revisi target tanggal item mingguan setelah koordinasi dengan PIC',
    'Koreksi status dari TERKENDALA menjadi SELESAI setelah verifikasi'];
  unlock_statuses text[] := ARRAY['DIAJUKAN','DISETUJUI','DITOLAK','DIEKSEKUSI'];
  notif_templates text[] := ARRAY['DAILY_REMINDER_1715','WEEKLY_REMINDER_FRI_1615','APPROVAL_REQUESTED','LATE_INCIDENT_1','ESCALATION_RAISED','ESCALATION_DECIDED','UNLOCK_REQUESTED','UNLOCK_APPROVED'];
  audit_actions text[] := ARRAY['SAVE_DAILY_REPORT','SUBMIT_DAILY_REPORT','APPROVE_WEEKLY','CREATE_ESCALATION','DECIDE_ESCALATION','LOGIN','LOGOUT'];

  -- pengguna global
  mgmt_id     text := gen_random_uuid()::text;
  sdm_id      text := gen_random_uuid()::text;
  auditor_id  text := gen_random_uuid()::text;
  ti_id       text := gen_random_uuid()::text;

  -- variabel kerja
  i int; j int; k int; n int; m int;
  pt_id text; pt_path text; cur_admin text; cur_dir text; div_id text; kdv_id text; proj_id text; cur_pic text; wr_id text; rep_id text;
  dt_code text; dt_name text; rd date; st text; is_today bool; is_late bool; prog int; needs_esc bool;
  period_end date; period_start date; iso_y int; iso_w int; is_cur bool; approved bool; locked bool; hdr text;
  pri_code text; item_cnt int; raised timestamp; ust text; period_key text; nm text; em text; slug text;
  daily_cnt int := 0; weekly_cnt int := 0; progress_cnt int := 0; name_i int := 0;
  r record; src record;
BEGIN
  -- ---------- kosongkan ----------
  TRUNCATE "KpiSnapshot","WeeklyReportItem","WeeklyDivisionReport","DailyProjectReport","ProjectProgressReport","ProjectApproval",
           "Subtask","Task","Escalation","Evidence","Note","UnlockRequest","AuditLog","LateIncident","SpotCheck","NotificationLog",
           "AdminAppointment","Project","Division","Holiday","WorkCalendar","Priority","AspectCategory","DivisionType","User","Entity" CASCADE;

  CREATE TEMP TABLE tmp_pt   (i int, id text, code text, name text, path text, admin_id text, dir_id text) ON COMMIT DROP;
  CREATE TEMP TABLE tmp_div  (id text, entity_id text, name text, head_id text) ON COMMIT DROP;
  CREATE TEMP TABLE tmp_proj (id text, entity_id text, name text, phase text, pic_id text, pic_name text, admin_id text) ON COMMIT DROP;
  CREATE TEMP TABLE tmp_user (id text, email text, role text, scope text) ON COMMIT DROP;
  CREATE TEMP TABLE tmp_daily (id text, entity_id text, admin_id text) ON COMMIT DROP;

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

  -- ---------- hierarki: holding -> 8 PT ----------
  INSERT INTO "Entity"(id,type,code,name,path,"updatedAt")
  VALUES (holding_id,'HOLDING','HOLDING-BIKE','Holding PT Bike','/holding/',now_utc);
  FOR i IN 1..8 LOOP
    pt_id := gen_random_uuid()::text;
    pt_path := '/holding/'||pt_codes[i]||'/';
    INSERT INTO "Entity"(id,"parentId",type,code,name,path,"updatedAt")
    VALUES (pt_id,holding_id,'PT',pt_codes[i],pt_names[i],pt_path,now_utc);
    INSERT INTO tmp_pt VALUES (i, pt_id, pt_codes[i], pt_names[i], pt_path, NULL, NULL);
  END LOOP;

  -- ---------- pengguna global (akun demo) ----------
  INSERT INTO "User"(id,email,name,role,phone,"avatarColor","updatedAt") VALUES
    (mgmt_id,'manajemen@karya.co.id','Bpk. Hartono Wijaya','MANAJEMEN','+628110000007','#16a34a',now_utc),
    (sdm_id,'sdmga@karya.co.id','Ibu Ratna Sari','DIREKTUR_SDM_GA','+628110000005','#db2777',now_utc),
    (ti_id,'it@karya.co.id','Bpk. Rudi Santoso','TI','+628110000006','#4f46e5',now_utc),
    (auditor_id,'auditor@karya.co.id','Bpk. Dimas Pratama','AUDITOR',NULL,'#7c3aed',now_utc);
  INSERT INTO tmp_user VALUES (mgmt_id,'manajemen@karya.co.id','MANAJEMEN',NULL),(sdm_id,'sdmga@karya.co.id','DIREKTUR_SDM_GA',NULL),
    (ti_id,'it@karya.co.id','TI',NULL),(auditor_id,'auditor@karya.co.id','AUDITOR',NULL);

  -- ---------- per PT: admin, direktur, divisi + kadiv, proyek + PIC ----------
  FOR r IN SELECT * FROM tmp_pt ORDER BY tmp_pt.i LOOP
    slug := lower(replace(r.code,'PT-',''));

    -- Admin PT (PT Sigma memakai akun demo)
    cur_admin := gen_random_uuid()::text;
    IF r.i = 1 THEN nm := 'Bpk. Budi Santoso'; em := 'adminpt@karya.co.id';
    ELSE name_i := name_i + 1; nm := first_names[((name_i-1) % 16)+1]; em := 'admin.'||slug||'@karya.co.id'; END IF;
    INSERT INTO "User"(id,email,name,role,"scopeEntityId","avatarColor","lastLoginAt","updatedAt")
    VALUES (cur_admin, em, nm, 'ADMIN_PT', r.id, colors[((r.i-1) % 8)+1], now_utc - (random()*3) * interval '1 day', now_utc);
    INSERT INTO tmp_user VALUES (cur_admin, em, 'ADMIN_PT', r.id);

    -- Direktur Entitas
    cur_dir := gen_random_uuid()::text;
    IF r.i = 1 THEN nm := 'Bpk. Andi Kurniawan'; em := 'direktur@karya.co.id';
    ELSE name_i := name_i + 1; nm := first_names[((name_i-1) % 16)+1]; em := 'direktur.'||slug||'@karya.co.id'; END IF;
    INSERT INTO "User"(id,email,name,role,"scopeEntityId","avatarColor","updatedAt")
    VALUES (cur_dir, em, nm, 'DIREKTUR_ENTITAS', r.id, colors[(r.i % 8)+1], now_utc);
    INSERT INTO tmp_user VALUES (cur_dir, em, 'DIREKTUR_ENTITAS', r.id);
    UPDATE tmp_pt SET admin_id = cur_admin, dir_id = cur_dir WHERE id = r.id;

    INSERT INTO "AdminAppointment"(id,"entityId","userName","userEmail",kind,"skNumber","validFrom","validUntil",status,"updatedAt")
    VALUES (gen_random_uuid()::text, r.id, nm, em, 'UTAMA', 'SK/'||yr||'/'||lpad(r.i::text,2,'0')||'/HR',
            make_date(yr,1,1)::timestamp - interval '7 hours', make_date(yr+2,12,31)::timestamp - interval '7 hours', 'AKTIF', now_utc);

    -- 3 divisi, masing-masing dengan kepala divisi
    FOR j IN 1..3 LOOP
      dt_code := div_types[((r.i + j - 2) % 8) + 1];
      SELECT name INTO dt_name FROM "DivisionType" WHERE code = dt_code;
      div_id := gen_random_uuid()::text;
      kdv_id := gen_random_uuid()::text;
      IF r.i = 1 AND j = 1 THEN nm := 'Ibu Mira Anggraini'; em := 'kadiv@karya.co.id';
      ELSE name_i := name_i + 1; nm := first_names[((name_i-1) % 16)+1];
           em := 'kadiv.'||regexp_replace(lower(dt_name),'[^a-z]','','g')||'.'||slug||'@karya.co.id'; END IF;
      INSERT INTO "User"(id,email,name,role,"scopeEntityId","avatarColor","updatedAt")
      VALUES (kdv_id, em, nm, 'KEPALA_DIVISI', r.id, colors[((r.i + j) % 8)+1], now_utc);
      INSERT INTO tmp_user VALUES (kdv_id, em, 'KEPALA_DIVISI', r.id);
      INSERT INTO "Division"(id,"entityId","divisionTypeId",name,"headUserId","updatedAt")
      SELECT div_id, r.id, id, dt_name, kdv_id, now_utc FROM "DivisionType" WHERE code = dt_code;
      INSERT INTO tmp_div VALUES (div_id, r.id, dt_name, kdv_id);
    END LOOP;

    -- 2 proyek, masing-masing dipegang SATU PIC
    FOR j IN 1..2 LOOP
      proj_id := gen_random_uuid()::text;
      cur_pic := gen_random_uuid()::text;
      IF r.i = 1 AND j = 1 THEN nm := 'Bpk. Rangga Prasetya'; em := 'pic@karya.co.id';
      ELSE name_i := name_i + 1; nm := first_names[((name_i-1) % 16)+1]; em := 'pic'||j||'.'||slug||'@karya.co.id'; END IF;
      INSERT INTO "User"(id,email,name,role,"scopeEntityId","avatarColor","updatedAt")
      VALUES (cur_pic, em, nm, 'PIC_PROYEK', r.id, colors[((r.i + j + 2) % 8)+1], now_utc);
      INSERT INTO tmp_user VALUES (cur_pic, em, 'PIC_PROYEK', r.id);
      INSERT INTO "Project"(id,"entityId",code,name,phase,lifecycle,"picName","picUserId","startDate","targetEndDate","approvedByName","approvedAt","updatedAt")
      VALUES (proj_id, r.id, r.code||'-PRJ-'||lpad(j::text,2,'0'), proj_names[r.i][j], proj_phases[j], 'AKTIF', nm, cur_pic,
              make_date(yr, j*2, 1)::timestamp - interval '7 hours', make_date(yr, j*2+8, 28)::timestamp - interval '7 hours',
              'Bpk. Hartono Wijaya', make_date(yr, j*2, 5)::timestamp - interval '7 hours', now_utc);
      INSERT INTO tmp_proj VALUES (proj_id, r.id, proj_names[r.i][j], proj_phases[j], cur_pic, nm, cur_admin);
    END LOOP;
  END LOOP;

  -- Satu pengajuan proyek yang masih menunggu persetujuan (PT Sigma), agar alur
  -- persetujuannya langsung terlihat.
  SELECT * INTO r FROM tmp_pt WHERE tmp_pt.i = 1;
  INSERT INTO "Project"(id,"entityId",code,name,phase,lifecycle,description,"proposedById","proposedAt","startDate","targetEndDate","updatedAt")
  VALUES (gen_random_uuid()::text, r.id, r.code||'-PRJ-03', 'Pembangunan Kantor Cabang', 'INISIASI', 'DIUSULKAN',
          'Kantor cabang baru untuk menjangkau wilayah operasi timur; target mulai bulan depan.',
          r.admin_id, now_utc - interval '2 days', (today_wib + 30)::timestamp - interval '7 hours', (today_wib + 210)::timestamp - interval '7 hours', now_utc);

  -- ---------- laporan harian proyek (30 hari terakhir, hari kerja) ----------
  FOR n IN REVERSE 29..0 LOOP
    rd := today_wib - n;
    CONTINUE WHEN extract(isodow from rd) >= 6;
    is_today := (n = 0);
    FOR r IN SELECT * FROM tmp_proj LOOP
      CONTINUE WHEN random() < 0.12;
      st := daily_statuses[1+floor(random()*6)::int];
      is_late := (NOT is_today) AND random() < 0.08;
      prog := greatest(0, least(100, floor((30-n)*3.1)::int + floor(random()*8)::int));
      needs_esc := st IN ('TERKENDALA','MENUNGGU_KEPUTUSAN');
      rep_id := gen_random_uuid()::text;
      INSERT INTO "DailyProjectReport"(id,"projectId","entityId","reportDate",status,"progressPct",phase,"achievementToday",obstacle,"followUp",
        "followUpTargetDate","decisionRequestedFrom","needsEscalation","evidenceCount","isLocked","lockedAt","isLate","submittedById","submittedAt","forwardedById","forwardedAt","updatedAt")
      VALUES (rep_id, r.id, r.entity_id, rd::timestamp - interval '7 hours', st, prog, r.phase,
        achievements[1+floor(random()*10)::int],
        CASE WHEN needs_esc THEN obstacles[1+floor(random()*8)::int] END,
        CASE WHEN needs_esc THEN 'Koordinasi dengan Admin PT dan jadwalkan rapat tindak lanjut' END,
        CASE WHEN needs_esc THEN now_utc + interval '7 days' END,
        CASE WHEN st = 'MENUNGGU_KEPUTUSAN' THEN 'Direktur Entitas' END,
        needs_esc,
        CASE WHEN st = 'SELESAI' THEN 1+floor(random()*2)::int ELSE 0 END,
        NOT is_today,
        CASE WHEN NOT is_today THEN rd::timestamp - interval '7 hours' + interval '17 hours' END,
        is_late,
        r.pic_id, rd::timestamp - interval '7 hours' + interval '15 hours',
        CASE WHEN NOT is_today THEN r.admin_id END,
        CASE WHEN NOT is_today THEN rd::timestamp - interval '7 hours' + interval '16 hours' END,
        now_utc);
      INSERT INTO tmp_daily VALUES (rep_id, r.entity_id, r.admin_id);
      daily_cnt := daily_cnt + 1;
    END LOOP;
  END LOOP;

  -- ---------- task hari ini untuk proyek PIC demo (menunjukkan urgensi) ----------
  SELECT * INTO r FROM tmp_proj WHERE tmp_proj.pic_id = (SELECT id FROM tmp_user WHERE email = 'pic@karya.co.id');
  FOR k IN 1..4 LOOP
    proj_id := gen_random_uuid()::text;
    st := (ARRAY['SELESAI','BERJALAN','BERJALAN','TERKENDALA'])[k];
    INSERT INTO "Task"(id,"projectId","entityId","workDate",title,description,tags,"picName","startAt","endAt","durationMin",status,"progressPct",urgency,obstacle,"createdById","updatedAt")
    VALUES (proj_id, r.id, r.entity_id, today_wib::timestamp - interval '7 hours', task_titles[k],
      'Rincian pekerjaan hari ini untuk '||r.name||'.', ARRAY['Lapangan'],
      r.pic_name,
      today_wib::timestamp - interval '7 hours' + ((7+k) * interval '1 hour'),
      today_wib::timestamp - interval '7 hours' + ((9+k) * interval '1 hour'), 120,
      st, CASE WHEN st='SELESAI' THEN 100 WHEN st='TERKENDALA' THEN 40 ELSE 30+k*10 END,
      task_urg[k], CASE WHEN st='TERKENDALA' THEN obstacles[1] END, r.pic_id, now_utc);
    INSERT INTO "Subtask"(id,"taskId",title,"isDone",position) VALUES
      (gen_random_uuid()::text, proj_id, 'Persiapan alat dan bahan', true, 0),
      (gen_random_uuid()::text, proj_id, 'Pelaksanaan pekerjaan', st IN ('SELESAI'), 1),
      (gen_random_uuid()::text, proj_id, 'Dokumentasi hasil', st = 'SELESAI', 2);
  END LOOP;

  -- ---------- laporan kemajuan proyek: mingguan (4 minggu) & bulanan (3 bulan) ----------
  FOR n IN REVERSE 3..0 LOOP
    period_end := (today_wib - n*7) - (extract(isodow from today_wib - n*7)::int - 7);   -- Minggu
    period_start := period_end - 6;                                                        -- Senin
    iso_y := extract(isoyear from period_start)::int;
    iso_w := extract(week from period_start)::int;
    period_key := iso_y||'-W'||lpad(iso_w::text,2,'0');
    is_cur := (n = 0);
    FOR r IN SELECT * FROM tmp_proj LOOP
      CONTINUE WHEN is_cur AND random() < 0.5;
      st := daily_statuses[1+floor(random()*6)::int];
      INSERT INTO "ProjectProgressReport"(id,"projectId","entityId",cadence,"periodKey","periodStart","periodEnd",status,"progressPct",summary,obstacle,"followUp",
        "evidenceCount","submittedById","submittedAt","isLocked","lockedAt","updatedAt")
      VALUES (gen_random_uuid()::text, r.id, r.entity_id, 'MINGGUAN', period_key,
        period_start::timestamp - interval '7 hours', period_end::timestamp - interval '7 hours', st,
        greatest(0, least(100, 40 + (3-n)*15 + floor(random()*10)::int)),
        'Minggu '||iso_w||': '||achievements[1+floor(random()*10)::int]||'. Progres kumulatif sesuai rencana.',
        CASE WHEN st IN ('TERKENDALA','MENUNGGU_KEPUTUSAN') THEN obstacles[1+floor(random()*8)::int] END,
        CASE WHEN st IN ('TERKENDALA','MENUNGGU_KEPUTUSAN') THEN 'Percepatan pengadaan dan koordinasi ulang jadwal' END,
        CASE WHEN st = 'SELESAI' THEN 1 ELSE 0 END,
        r.pic_id, CASE WHEN NOT is_cur THEN period_end::timestamp - interval '7 hours' - interval '2 days' + interval '15 hours' END,
        NOT is_cur, CASE WHEN NOT is_cur THEN period_end::timestamp - interval '7 hours' - interval '2 days' + interval '17 hours' END, now_utc);
      progress_cnt := progress_cnt + 1;
    END LOOP;
  END LOOP;
  FOR m IN REVERSE 2..0 LOOP
    period_start := (date_trunc('month', today_wib::timestamp) - (m * interval '1 month'))::date;
    period_end := (period_start + interval '1 month' - interval '1 day')::date;
    period_key := to_char(period_start, 'YYYY-MM');
    is_cur := (m = 0);
    FOR r IN SELECT * FROM tmp_proj LOOP
      CONTINUE WHEN is_cur AND random() < 0.6;
      st := daily_statuses[1+floor(random()*6)::int];
      INSERT INTO "ProjectProgressReport"(id,"projectId","entityId",cadence,"periodKey","periodStart","periodEnd",status,"progressPct",summary,obstacle,"followUp",
        "evidenceCount","submittedById","submittedAt","isLocked","lockedAt","updatedAt")
      VALUES (gen_random_uuid()::text, r.id, r.entity_id, 'BULANAN', period_key,
        period_start::timestamp - interval '7 hours', period_end::timestamp - interval '7 hours', st,
        greatest(0, least(100, 30 + (2-m)*25 + floor(random()*10)::int)),
        'Bulan '||to_char(period_start,'MM/YYYY')||': '||achievements[1+floor(random()*10)::int]||'. Realisasi anggaran terkendali.',
        CASE WHEN st IN ('TERKENDALA','MENUNGGU_KEPUTUSAN') THEN obstacles[1+floor(random()*8)::int] END,
        CASE WHEN st IN ('TERKENDALA','MENUNGGU_KEPUTUSAN') THEN 'Eskalasi ke Direktur Entitas untuk keputusan anggaran' END,
        CASE WHEN st = 'SELESAI' THEN 2 ELSE 0 END,
        r.pic_id, CASE WHEN NOT is_cur THEN period_end::timestamp - interval '7 hours' + interval '15 hours' END,
        NOT is_cur, CASE WHEN NOT is_cur THEN period_end::timestamp - interval '7 hours' + interval '3 days' + interval '17 hours' END, now_utc);
      progress_cnt := progress_cnt + 1;
    END LOOP;
  END LOOP;

  -- ---------- laporan mingguan divisi (4 minggu terakhir) ----------
  FOR n IN REVERSE 3..0 LOOP
    period_end := today_wib - n*7;
    period_start := period_end - 6;
    iso_y := extract(isoyear from period_end)::int;
    iso_w := extract(week from period_end)::int;
    is_cur := (n = 0);
    FOR r IN SELECT * FROM tmp_div LOOP
      CONTINUE WHEN random() < 0.1;
      approved := (NOT is_cur) OR random() < 0.6;
      locked := NOT is_cur;
      hdr := CASE WHEN locked THEN 'TERKUNCI' WHEN approved THEN 'DISETUJUI' WHEN random() < 0.5 THEN 'MENUNGGU_PERSETUJUAN' ELSE 'DRAFT' END;
      wr_id := gen_random_uuid()::text;
      INSERT INTO "WeeklyDivisionReport"(id,"divisionId","entityId","isoYear","isoWeek","periodStart","periodEnd","statusHeader",
        "approvedById","approvedAt","approvalHash","isLocked","lockedAt","isLate","updatedAt")
      VALUES (wr_id, r.id, r.entity_id, iso_y, iso_w, period_start::timestamp - interval '7 hours', period_end::timestamp - interval '7 hours', hdr,
        CASE WHEN approved THEN r.head_id END,
        CASE WHEN approved THEN period_end::timestamp - interval '7 hours' - interval '1 day' END,
        CASE WHEN approved THEN 'sha256:'||substr(md5(random()::text),1,32) END,
        locked, CASE WHEN locked THEN period_end::timestamp - interval '7 hours' + interval '16 hours' END,
        (NOT is_cur) AND random() < 0.08, now_utc);
      item_cnt := 3 + floor(random()*3)::int;
      FOR k IN 1..item_cnt LOOP
        j := ((k-1) % 8) + 1;
        st := weekly_statuses[1+floor(random()*5)::int];
        pri_code := (ARRAY['TINGGI','SEDANG','RENDAH'])[1+floor(random()*3)::int];
        INSERT INTO "WeeklyReportItem"(id,"weeklyReportId","aspectCategoryId","workItem","targetOutput","picName","picTitle","targetDate",status,
          "progressPct","achievementThisWeek","obstacleFollowUp","priorityId","needsEscalation","evidenceCount","updatedAt")
        SELECT gen_random_uuid()::text, wr_id, ac.id, wk_work[j], 'Target minggu ke-'||iso_w||': '||(10+floor(random()*40)::int)||' unit',
          wk_pic[j], wk_pic[j], period_end::timestamp - interval '7 hours' + (floor(random()*14)::int) * interval '1 day', st,
          CASE WHEN st='SELESAI' THEN 100 WHEN st='BELUM_MULAI' THEN 0 ELSE floor(random()*90)::int + 5 END,
          CASE WHEN st='SELESAI' THEN achievements[1+floor(random()*10)::int] WHEN st='BELUM_MULAI' THEN 'Persiapan tahap awal'
               ELSE 'Progres '||(floor(random()*80)::int+10)||'% dari target' END,
          CASE WHEN st='TERKENDALA' THEN obstacles[1+floor(random()*8)::int] END,
          pr.id, (st='TERKENDALA' AND pri_code='TINGGI'),
          CASE WHEN st='SELESAI' THEN 1 ELSE 0 END, now_utc
        FROM "AspectCategory" ac, "Priority" pr WHERE ac.code = wk_aspect[j] AND pr.code = pri_code;
      END LOOP;
      weekly_cnt := weekly_cnt + 1;
    END LOOP;
  END LOOP;

  -- ---------- eskalasi (10) — sumbernya laporan harian SUNGGUHAN ----------
  i := 0;
  FOR src IN SELECT * FROM tmp_daily ORDER BY random() LIMIT 10 LOOP
    j := (i % 8) + 1;
    st := esc_status[CASE WHEN i < 3 THEN 1 WHEN i < 6 THEN 2 WHEN i < 8 THEN 3 ELSE 4 END];
    raised := now_utc - ((i+1)*2) * interval '1 day';
    INSERT INTO "Escalation"(id,"sourceType","sourceId","entityId","raisedById","raisedAt",summary,needed,status,"decidedById","decidedAt","decisionText","slaDays","updatedAt")
    VALUES (gen_random_uuid()::text, 'DAILY_REPORT', src.id, src.entity_id, src.admin_id, raised,
      esc_summary[j], esc_needed[j], st,
      CASE WHEN st IN ('DIPUTUSKAN','DITUTUP') THEN mgmt_id END,
      CASE WHEN st IN ('DIPUTUSKAN','DITUTUP') THEN raised + interval '4 days' END,
      CASE WHEN st IN ('DIPUTUSKAN','DITUTUP') THEN 'Disetujui dengan catatan: eksekusi segera dengan pemantauan mingguan oleh Direktur Entitas.' END,
      7, now_utc);
    i := i + 1;
  END LOOP;

  -- ---------- permintaan buka kunci (4) — menunjuk laporan harian sungguhan ----------
  i := 0;
  FOR src IN SELECT * FROM tmp_daily ORDER BY random() LIMIT 4 LOOP
    ust := unlock_statuses[(i % 4)+1];
    INSERT INTO "UnlockRequest"(id,"targetType","targetId","requestedById",reason,status,"approvedById","approvedAt","executedById","executedAt","unlockUntil","updatedAt")
    VALUES (gen_random_uuid()::text, 'DAILY_REPORT', src.id, src.admin_id,
      unlock_reasons[(i % 4)+1], ust,
      CASE WHEN ust <> 'DIAJUKAN' THEN sdm_id END, CASE WHEN ust <> 'DIAJUKAN' THEN now_utc - i * interval '1 day' END,
      CASE WHEN ust = 'DIEKSEKUSI' THEN ti_id END, CASE WHEN ust = 'DIEKSEKUSI' THEN now_utc - i * interval '1 day' + interval '1 hour' END,
      CASE WHEN ust = 'DIEKSEKUSI' THEN now_utc + interval '1 day' END, now_utc);
    i := i + 1;
  END LOOP;

  -- ---------- KPI snapshot (6 bulan per PT) ----------
  FOR m IN REVERSE 5..0 LOOP
    period_key := to_char(date_trunc('month', today_wib::timestamp) - (m * interval '1 month'), 'YYYY-MM');
    FOR r IN SELECT * FROM tmp_pt LOOP
      INSERT INTO "KpiSnapshot"(id,"entityId","periodType","periodKey","onTimeDailyPct","weeklyCompletenessPct","evidenceCompletenessPct",
        "highPriorityCompletionPct","avgEscalationDays","totalProjects","activeProjects","reportsToday","lateToday","pendingReports","complianceScore","updatedAt")
      VALUES (gen_random_uuid()::text, r.id, 'BULANAN', period_key, 78+random()*20, 84+random()*16, 86+random()*14, 72+random()*25, 3+random()*5, 2, 2,
        CASE WHEN m = 0 THEN 1+floor(random()*2)::int ELSE 2 END,
        CASE WHEN m = 0 THEN floor(random()*2)::int ELSE 0 END,
        CASE WHEN m = 0 THEN floor(random()*2)::int ELSE 0 END,
        68+random()*30, now_utc);
    END LOOP;
  END LOOP;

  -- ---------- insiden terlambat (bulan ini) ----------
  period_key := to_char(today_wib, 'YYYY-MM');
  FOR i IN 0..4 LOOP
    SELECT * INTO r FROM tmp_pt ORDER BY random() LIMIT 1;
    INSERT INTO "LateIncident"(id,"entityId",cycle,period,"occurrenceInMonth","actionTaken")
    VALUES (gen_random_uuid()::text, r.id, CASE WHEN random()<0.5 THEN 'HARIAN' ELSE 'MINGGUAN' END, period_key, 1+floor(random()*3)::int,
      CASE WHEN i < 2 THEN 'Tindakan: evaluasi penunjukan Admin PT' ELSE 'Tindakan: notifikasi ke Direktur Entitas' END);
  END LOOP;

  -- ---------- log notifikasi (12) ----------
  FOR i IN 0..11 LOOP
    SELECT * INTO r FROM tmp_user ORDER BY random() LIMIT 1;
    st := CASE WHEN random() < 0.6 THEN 'EMAIL' ELSE 'WHATSAPP' END;
    ust := CASE WHEN random() < 0.85 THEN 'SENT' ELSE 'FAILED' END;
    hdr := notif_templates[1+floor(random()*8)::int];
    INSERT INTO "NotificationLog"(id,"userId",channel,recipient,template,payload,status,error,"sentAt")
    VALUES (gen_random_uuid()::text, r.id, st, CASE WHEN st='EMAIL' THEN r.email ELSE '+6281234567890' END, hdr,
      json_build_object('template', hdr, 'entityId', r.scope)::text, ust,
      CASE WHEN ust='FAILED' THEN 'Connection timeout' END, CASE WHEN ust='SENT' THEN now_utc - i * interval '1 hour' END);
  END LOOP;

  -- ---------- audit log (20) — menunjuk laporan sungguhan ----------
  i := 0;
  FOR src IN SELECT d.*, u.id AS actor FROM tmp_daily d JOIN tmp_user u ON u.scope = d.entity_id ORDER BY random() LIMIT 20 LOOP
    hdr := audit_actions[1+floor(random()*7)::int];
    INSERT INTO "AuditLog"(id,"actorId",action,"targetType","targetId","beforeData","afterData",ip,"userAgent",at)
    VALUES (gen_random_uuid()::text, src.actor, hdr,
      CASE WHEN hdr LIKE '%ESCALATION%' THEN 'ESCALATION' WHEN hdr LIKE '%WEEKLY%' THEN 'WEEKLY_REPORT' WHEN hdr IN ('LOGIN','LOGOUT') THEN 'USER' ELSE 'DAILY_REPORT' END,
      CASE WHEN hdr IN ('LOGIN','LOGOUT') THEN src.actor ELSE src.id END,
      CASE WHEN hdr LIKE 'SAVE%' THEN '{"progressPct":50}' END, '{"progressPct":75,"status":"ON_PROGRESS"}',
      '10.0.'||floor(random()*255)::int||'.'||floor(random()*255)::int, 'Mozilla/5.0 (Seed)', now_utc - (i*3) * interval '1 hour');
    i := i + 1;
  END LOOP;

  RAISE NOTICE 'Seed selesai: 1 holding, 8 PT, % laporan harian, % laporan mingguan divisi, % laporan kemajuan proyek', daily_cnt, weekly_cnt, progress_cnt;
END
$seed$;
