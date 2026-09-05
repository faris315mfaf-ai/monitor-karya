-- ============================================================
-- MonitorKarya — SQL seed (port of scripts/seed.ts for PostgreSQL)
-- Menghasilkan data contoh: hierarki entitas, pengguna, divisi, proyek,
-- laporan harian (30 hari), laporan mingguan (4 minggu), eskalasi,
-- permintaan buka kunci, KPI 6 bulan, insiden terlambat, notifikasi, audit.
-- Semua tanggal dihitung dalam WIB (Asia/Jakarta) lalu disimpan sebagai UTC,
-- sesuai konvensi Prisma (TIMESTAMP tanpa zona = UTC) dan src/lib/wib.ts.
-- Aman dijalankan ulang: mengosongkan semua tabel terlebih dahulu.
-- Jalankan: npm run db:seed:sql   (atau tempel ke Supabase SQL Editor)
-- PENTING: TRUNCATE di bawah menghapus tabel User, jadi seluruh kata sandi
-- ikut terhapus. Setelah seed, jalankan lagi: npm run db:passwords
-- ============================================================
DO $seed$
DECLARE
  -- waktu
  now_utc     timestamp := (now() at time zone 'UTC');
  today_wib   date      := (now() at time zone 'Asia/Jakarta')::date;
  yr          int       := extract(year from (now() at time zone 'Asia/Jakarta'))::int;

  -- id referensi
  holding_id  text := gen_random_uuid()::text;
  cal_id      text := gen_random_uuid()::text;
  sh_ids      text[] := ARRAY[gen_random_uuid()::text, gen_random_uuid()::text];
  sh_codes    text[] := ARRAY['SH-ENERGI','SH-AGRO'];
  sh_names    text[] := ARRAY['Karya Energi Nusantara','Karya Agro Lestari'];
  sec_ids     text[] := ARRAY[gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text];
  sec_codes   text[] := ARRAY['S-MIGAS','S-EBT','S-SAWIT','S-TEH'];
  sec_names   text[] := ARRAY['Sektor Migas & Energi','Sektor Energi Baru Terbarukan','Sektor Perkebunan Sawit','Sektor Perkebunan Teh'];
  sec_parent  int[]  := ARRAY[1,1,2,2];
  reg_ids     text[] := ARRAY[gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text];
  reg_codes   text[] := ARRAY['R-SUMUT','R-KALTIM','R-JATIM','R-SULSEL','R-RIAU','R-JAMBI','R-JABAR'];
  reg_names   text[] := ARRAY['Sumatera Utara','Kalimantan Timur','Jawa Timur','Sulawesi Selatan','Riau','Jambi','Jawa Barat'];
  reg_parent  int[]  := ARRAY[1,1,2,2,3,3,4];
  pt_codes    text[] := ARRAY['PT-001','PT-002','PT-003','PT-004','PT-005','PT-006','PT-007','PT-008','PT-009','PT-010'];
  pt_names    text[] := ARRAY['PT Energi Migas Sumut','PT Kilang Utara Mandiri','PT Gas Kaltim Pratama','PT Petro Kaltim Energi','PT Surya Panel Jatim','PT Baterai Hijau Surabaya','PT Turbin Angin Sulsel','PT Sawit Riau Lestari','PT Karet Jambi Makmur','PT Teh Gunung Wangi'];
  pt_parent   int[]  := ARRAY[1,1,2,2,3,3,4,5,6,7];
  admin_names text[] := ARRAY['Bpk. Budi','Ibu Dewi','Bpk. Eko','Ibu Fitri','Bpk. Gilang','Ibu Hana','Bpk. Iwan','Ibu Juni','Bpk. Krisna','Ibu Lina'];
  colors      text[] := ARRAY['#2563eb','#0891b2','#7c3aed','#db2777','#16a34a','#ea580c','#0d9488','#4f46e5'];
  kdv_names   text[] := ARRAY['Bpk. Yudi','Ibu Mira','Bpk. Tono','Ibu Vera'];
  div_sets    text[][] := ARRAY[
    ARRAY['PROD','FIN','HSE','ENG'], ARRAY['PROD','OPS','HSE','FIN'], ARRAY['ENG','OPS','FIN','HSE'],
    ARRAY['PROD','LOG','FIN','HRD'], ARRAY['PROD','ENG','FIN','HSE'], ARRAY['OPS','FIN','HRD','IT'],
    ARRAY['PROD','FIN','HSE','ENG'], ARRAY['PROD','HRD','FIN','LOG'], ARRAY['PROD','ENG','FIN','HSE'],
    ARRAY['PROD','OPS','FIN','HRD']];
  proj_names  text[][] := ARRAY[
    ARRAY['Pembangunan Pembangkit Baru','Optimasi Jaringan Distribusi','Renovasi Substation','Pengadaan Trafo 50 MVA'],
    ARRAY['Integrasi Sistem SCADA','Audit Energi Tahunan','Rehabilitasi Sumur Minyak','Pengembangan Kilang Mini'],
    ARRAY['Instalasi Panel Surya 5 MW','Pengembangan Baterai Storage','Pilot Project Hybrid','Pelatihan Operator EBT'],
    ARRAY['Sertifikasi ISO 50001','Pengembangan Smart Grid','Pemasangan Inverter Smart','Studi Kelayakan Wind Farm'],
    ARRAY['Ekspansi Kebun 200 Ha','Pembangunan Pabrik CPO','Sertifikasi ISPO','Peningkatan Kapasitas Mill'],
    ARRAY['Renovasi Pabrik Karet','Pengembangan Lateks','Sertifikasi FSC','Pengadaan Mesin Creper'],
    ARRAY['Modernisasi Pabrik Teh','Pengembangan Varietas Unggul','Sertifikasi Rainforest Alliance','Pembangunan Warehouse'],
    ARRAY['Digitalisasi Produksi','Implementasi ERP','Pengembangan E-Commerce','Optimasi Rantai Pasok'],
    ARRAY['Sistem Manajemen Mutu','Pengembangan SDM','Green Factory Initiative','Penghematan Energi'],
    ARRAY['Ekspansi Pasar Ekspor','Pengembangan Brand Premium','Pengembangan R&D','Modernisasi Pabrik']];
  proj_phases text[] := ARRAY['PERENCANAAN','PELAKSANAAN','PELAKSANAAN','PENYELESAIAN'];
  daily_statuses text[] := ARRAY['SELESAI','ON_PROGRESS','TERKENDALA','MENUNGGU_KEPUTUSAN','TIDAK_ADA_PERUBAHAN'];
  weekly_statuses text[] := ARRAY['SELESAI','ON_PROGRESS','BELUM_MULAI','TERKENDALA','NA'];
  obstacles   text[] := ARRAY[
    'Keterlambatan pengiriman material dari pemasok','Cuaca buruk menghambat pekerjaan lapangan',
    'Kendala teknis pada peralatan survey','Permitting dari pemerintah daerah belum selesai',
    'Kekurangan tenaga kerja terampil','Masalah akses ke lokasi proyek',
    'Harga material naik melebihi anggaran','Perubahan spesifikasi dari klien'];
  achievements text[] := ARRAY[
    'Menyelesaikan pemasangan panel surya 200 unit','Installasi 4 unit trafo distribusi',
    'Penyelesaian trenching 1.2 km','Commissioning sistem SCADA selesai','Training 25 operator teknis',
    'Pengujian beban penuh sukses','Pemasangan struktur tower 5 unit','Final inspection lulus tanpa temuan',
    'Pencapaian 95% target penyelesaian','Penyerahan dokumen as-built lengkap'];
  wk_aspect   text[] := ARRAY['OPS','KEU','PAT','SDM','HSE','PRJ','SYS','KOM'];
  wk_work     text[] := ARRAY['Optimasi throughput produksi harian','Closing laporan keuangan bulanan','Audit kepatuhan internal SOP','Rekrutmen tenaga operator baru','Inspeksi PPE & alat keselamatan','Milestone pengiriman modul proyek','Update sistem ERP modul produksi','Peluncuran kampanye pelanggan baru'];
  wk_pic      text[] := ARRAY['Operator Senior','Manajer Keuangan','Compliance Officer','HR Business Partner','Safety Officer','Project Manager','IT Support Lead','Sales Manager'];
  esc_summary text[] := ARRAY[
    'Keterlambatan signifikan pada milestone pengiriman modul - diperlukan keputusan alokasi anggaran tambahan',
    'Kebutuhan dukungan fungsi logistik lintas entitas untuk percepatan pengiriman material',
    'Permohonan realokasi anggaran Rp 2.5M untuk penyelesaian tahap commissioning',
    'Eskalasi kebijakan: persetujuan izin lingkungan terhambat proses birokrasi',
    'Konflik jadwal kontraktor - diperlukan koordinasi lintas proyek',
    'Defisit anggaran Q4 untuk penyelesaian tahap commissioning dan testing',
    'Persetujuan perubahan scope proyek pasca-review engineering',
    'Dukungan teknis khusus dari tim engineering holding'];
  esc_needed  text[] := ARRAY['KEPUTUSAN','DUKUNGAN_LINTAS_FUNGSI','ANGGARAN','KEPUTUSAN','DUKUNGAN_LINTAS_FUNGSI','ANGGARAN','KEPUTUSAN','DUKUNGAN_LINTAS_FUNGSI'];
  esc_status  text[] := ARRAY['DIAJUKAN','DITINJAU','DIPUTUSKAN','DITUTUP'];
  unlock_reasons text[] := ARRAY[
    'Koreksi capaian harian yang salah input - perlu update progress',
    'Penambahan bukti pendukung yang tertinggal',
    'Revisi target date item mingguan setelah koordinasi dengan PIC',
    'Koreksi status dari TERKENDALA menjadi SELESAI setelah verifikasi'];
  unlock_statuses text[] := ARRAY['DIAJUKAN','DISETUJUI','DITOLAK','DIEKSEKUSI'];
  notif_templates text[] := ARRAY['DAILY_REMINDER_1715','WEEKLY_REMINDER_FRI_1615','APPROVAL_REQUESTED','LATE_INCIDENT_1','LATE_INCIDENT_2','LATE_INCIDENT_3','ESCALATION_RAISED','ESCALATION_DECIDED','UNLOCK_REQUESTED','UNLOCK_APPROVED'];
  audit_actions text[] := ARRAY['CREATE_REPORT','UPDATE_REPORT','APPROVE_WEEKLY','LOCK_REPORT','UNLOCK_EXECUTE','CREATE_ESCALATION','DECIDE_ESCALATION','LOGIN','LOGOUT'];

  -- pengguna tetap
  mgmt_id     text := gen_random_uuid()::text;
  sdm_id      text := gen_random_uuid()::text;
  auditor_id  text := gen_random_uuid()::text;
  ti_id       text := gen_random_uuid()::text;
  dir_ids     text[] := ARRAY[gen_random_uuid()::text, gen_random_uuid()::text];
  dir_names   text[] := ARRAY['Bpk. Andi Kurniawan','Ibu Sri Wahyuni'];

  -- variabel kerja
  i int; j int; k int; n int;
  pt_id text; pt_path text; new_admin_id text; div_id text; proj_id text; wr_id text; kdv_id text;
  dt_code text; dt_name text; rd date; st text; is_today bool; is_late bool; prog int; needs_esc bool;
  period_end date; period_start date; iso_y int; iso_w int; is_cur bool; approved bool; locked bool; hdr text;
  pri_idx int; pri_code text; item_cnt int; esc_i int; raised timestamp; ust text; m int; period_key text;
  daily_cnt int := 0; weekly_cnt int := 0;
  r record;
BEGIN
  -- ---------- kosongkan ----------
  TRUNCATE "KpiSnapshot","WeeklyReportItem","WeeklyDivisionReport","DailyProjectReport","Escalation","Evidence","Note",
           "UnlockRequest","AuditLog","LateIncident","SpotCheck","NotificationLog","AdminAppointment","Project","Division",
           "Holiday","WorkCalendar","Priority","AspectCategory","DivisionType","User","Entity" CASCADE;

  CREATE TEMP TABLE tmp_pt   (i int, id text, code text, name text, region text, path text, admin_id text) ON COMMIT DROP;
  CREATE TEMP TABLE tmp_div  (id text, entity_id text, name text) ON COMMIT DROP;
  CREATE TEMP TABLE tmp_proj (id text, entity_id text, name text, phase text) ON COMMIT DROP;
  CREATE TEMP TABLE tmp_user (id text, email text, role text, scope text, phone text) ON COMMIT DROP;

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
  SELECT gen_random_uuid()::text, cal_id, (make_date(yr,mm,dd)::timestamp - interval '7 hours'), nm, 'GRUP'
  FROM (VALUES (1,1,'Tahun Baru Masehi'),(3,11,'Hari Raya Nyepi'),(3,29,'Wafat Isa Al Masih'),(3,31,'Idul Fitri'),(4,1,'Idul Fitri'),
               (5,1,'Hari Buruh Internasional'),(5,20,'Hari Kebangkitan Nasional'),(6,1,'Hari Lahir Pancasila'),
               (6,17,'Hari Raya Idul Adha'),(8,17,'Hari Proklamasi Kemerdekaan RI'),(12,25,'Hari Raya Natal')) AS h(mm,dd,nm);

  -- ---------- hierarki entitas ----------
  INSERT INTO "Entity"(id,type,code,name,path,"updatedAt") VALUES (holding_id,'HOLDING','HOLDING-01','PT Karya Nusantara Holding','/holding/',now_utc);
  FOR i IN 1..2 LOOP
    INSERT INTO "Entity"(id,"parentId",type,code,name,path,"updatedAt")
    VALUES (sh_ids[i],holding_id,'SUB_HOLDING',sh_codes[i],sh_names[i],'/holding/'||sh_codes[i]||'/',now_utc);
  END LOOP;
  FOR i IN 1..4 LOOP
    INSERT INTO "Entity"(id,"parentId",type,code,name,path,"updatedAt")
    VALUES (sec_ids[i],sh_ids[sec_parent[i]],'SECTOR',sec_codes[i],sec_names[i],'/holding/'||sh_codes[sec_parent[i]]||'/'||sec_codes[i]||'/',now_utc);
  END LOOP;
  FOR i IN 1..7 LOOP
    SELECT path INTO pt_path FROM "Entity" WHERE id = sec_ids[reg_parent[i]];
    INSERT INTO "Entity"(id,"parentId",type,code,name,path,region,"updatedAt")
    VALUES (reg_ids[i],sec_ids[reg_parent[i]],'REGION',reg_codes[i],reg_names[i],pt_path||reg_codes[i]||'/',reg_names[i],now_utc);
  END LOOP;
  FOR i IN 1..10 LOOP
    pt_id := gen_random_uuid()::text;
    SELECT path INTO pt_path FROM "Entity" WHERE id = reg_ids[pt_parent[i]];
    INSERT INTO "Entity"(id,"parentId",type,code,name,path,region,"updatedAt")
    VALUES (pt_id,reg_ids[pt_parent[i]],'PT',pt_codes[i],pt_names[i],pt_path||pt_codes[i]||'/',reg_names[pt_parent[i]],now_utc);
    INSERT INTO tmp_pt VALUES (i, pt_id, pt_codes[i], pt_names[i], reg_names[pt_parent[i]], pt_path||pt_codes[i]||'/', NULL);
  END LOOP;

  -- ---------- pengguna ----------
  INSERT INTO "User"(id,email,name,role,"avatarColor","updatedAt") VALUES
    (mgmt_id,'manajemen@karya.co.id','Bpk. Hartono Wijaya','MANAJEMEN',colors[1],now_utc),
    (sdm_id,'sdmga@karya.co.id','Ibu Ratna Sari','DIREKTUR_SDM_GA',colors[2],now_utc),
    (auditor_id,'auditor@karya.co.id','Bpk. Dimas Pratama','AUDITOR',colors[3],now_utc),
    (ti_id,'ti@karya.co.id','Bpk. Rudi Santoso','TI',colors[4],now_utc);
  INSERT INTO tmp_user VALUES (mgmt_id,'manajemen@karya.co.id','MANAJEMEN',NULL,NULL),(sdm_id,'sdmga@karya.co.id','DIREKTUR_SDM_GA',NULL,NULL),
    (auditor_id,'auditor@karya.co.id','AUDITOR',NULL,NULL),(ti_id,'ti@karya.co.id','TI',NULL,NULL);
  FOR i IN 1..2 LOOP
    INSERT INTO "User"(id,email,name,role,"scopeEntityId","avatarColor","updatedAt")
    VALUES (dir_ids[i],'direktur.'||lower(sh_codes[i])||'@karya.co.id',dir_names[i],'DIREKTUR_ENTITAS',sh_ids[i],colors[((i+3) % 8)+1],now_utc);
    INSERT INTO tmp_user VALUES (dir_ids[i],'direktur.'||lower(sh_codes[i])||'@karya.co.id','DIREKTUR_ENTITAS',sh_ids[i],NULL);
  END LOOP;
  FOR r IN SELECT * FROM tmp_pt ORDER BY i LOOP
    new_admin_id := gen_random_uuid()::text;
    INSERT INTO "User"(id,email,name,role,"scopeEntityId","avatarColor","lastLoginAt","updatedAt")
    VALUES (new_admin_id,'admin.'||lower(r.code)||'@karya.co.id',admin_names[r.i],'ADMIN_PT',r.id,colors[((r.i-1) % 8)+1],now_utc - (random()*3) * interval '1 day',now_utc);
    INSERT INTO tmp_user VALUES (new_admin_id,'admin.'||lower(r.code)||'@karya.co.id','ADMIN_PT',r.id,NULL);
    UPDATE tmp_pt SET admin_id = new_admin_id WHERE id = r.id;
  END LOOP;

  -- ---------- penunjukan admin, divisi, proyek ----------
  FOR r IN SELECT * FROM tmp_pt ORDER BY i LOOP
    INSERT INTO "AdminAppointment"(id,"entityId","userName","userEmail",kind,"skNumber","validFrom","validUntil",status,"updatedAt")
    SELECT gen_random_uuid()::text, r.id, u.name, u.email, 'UTAMA', 'SK/'||yr||'/'||lpad(r.i::text,2,'0')||'/HR',
           make_date(yr,1,1)::timestamp - interval '7 hours', make_date(yr+2,12,31)::timestamp - interval '7 hours', 'AKTIF', now_utc
    FROM "User" u WHERE u.id = r.admin_id;

    FOR j IN 1..4 LOOP
      dt_code := div_sets[r.i][j];
      SELECT name INTO dt_name FROM "DivisionType" WHERE code = dt_code;
      div_id := gen_random_uuid()::text;
      INSERT INTO "Division"(id,"entityId","divisionTypeId",name,"updatedAt")
      SELECT div_id, r.id, id, dt_name, now_utc FROM "DivisionType" WHERE code = dt_code;
      INSERT INTO tmp_div VALUES (div_id, r.id, dt_name);
      kdv_id := gen_random_uuid()::text;
      INSERT INTO "User"(id,email,name,role,"scopeEntityId","avatarColor","updatedAt")
      VALUES (kdv_id,'kadv.'||regexp_replace(lower(dt_name),'[^a-z]','','g')||'.'||lower(r.code)||'@karya.co.id',
              kdv_names[1+floor(random()*4)::int],'KEPALA_DIVISI',r.id,colors[1+floor(random()*8)::int],now_utc);
      INSERT INTO tmp_user VALUES (kdv_id,'kadv.'||regexp_replace(lower(dt_name),'[^a-z]','','g')||'.'||lower(r.code)||'@karya.co.id','KEPALA_DIVISI',r.id,NULL);
    END LOOP;

    FOR j IN 1..4 LOOP
      proj_id := gen_random_uuid()::text;
      INSERT INTO "Project"(id,"entityId",code,name,phase,lifecycle,"picName","startDate","targetEndDate","approvedByName","approvedAt","updatedAt")
      VALUES (proj_id, r.id, r.code||'-PRJ-'||lpad(j::text,2,'0'), proj_names[r.i][j], proj_phases[j], 'AKTIF', admin_names[r.i],
              make_date(yr, j, 1)::timestamp - interval '7 hours', make_date(yr, j+6, 28)::timestamp - interval '7 hours',
              dir_names[((r.i-1) % 2)+1], make_date(yr, j, 5)::timestamp - interval '7 hours', now_utc);
      INSERT INTO tmp_proj VALUES (proj_id, r.id, proj_names[r.i][j], proj_phases[j]);
    END LOOP;
  END LOOP;

  -- ---------- laporan harian proyek (30 hari terakhir, hari kerja) ----------
  FOR n IN REVERSE 29..0 LOOP
    rd := today_wib - n;
    CONTINUE WHEN extract(isodow from rd) >= 6;
    is_today := (n = 0);
    FOR r IN SELECT p.*, t.admin_id FROM tmp_proj p JOIN tmp_pt t ON t.id = p.entity_id LOOP
      CONTINUE WHEN random() < 0.15;
      st := daily_statuses[1+floor(random()*5)::int];
      is_late := is_today AND random() < 0.12;
      prog := greatest(0, least(100, floor((30-n)*3.3)::int + floor(random()*8)::int));
      needs_esc := st IN ('TERKENDALA','MENUNGGU_KEPUTUSAN');
      INSERT INTO "DailyProjectReport"(id,"projectId","entityId","reportDate",status,"progressPct",phase,"achievementToday",obstacle,"followUp",
        "followUpTargetDate","decisionRequestedFrom","needsEscalation","evidenceCount","isLocked","lockedAt","isLate","submittedById","submittedAt","updatedAt")
      VALUES (gen_random_uuid()::text, r.id, r.entity_id, rd::timestamp - interval '7 hours', st, prog, r.phase,
        achievements[1+floor(random()*10)::int],
        CASE WHEN needs_esc THEN obstacles[1+floor(random()*8)::int] END,
        CASE WHEN needs_esc THEN 'Eskalasi ke manajemen dan jadwalkan rapat koordinasi minggu depan' END,
        CASE WHEN needs_esc THEN now_utc + interval '7 days' END,
        CASE WHEN st = 'MENUNGGU_KEPUTUSAN' THEN 'Direktur Entitas / Direktur SDM&GA' END,
        needs_esc,
        CASE WHEN st = 'SELESAI' THEN 1+floor(random()*3)::int ELSE 0 END,
        NOT is_today,
        CASE WHEN NOT is_today THEN rd::timestamp - interval '7 hours' + interval '17 hours' END,
        is_late, r.admin_id, rd::timestamp - interval '7 hours' + interval '16 hours', now_utc);
      daily_cnt := daily_cnt + 1;
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
      SELECT id INTO kdv_id FROM "User" WHERE role = 'KEPALA_DIVISI' AND "scopeEntityId" = r.entity_id LIMIT 1;
      approved := (NOT is_cur) OR random() < 0.6;
      locked := NOT is_cur;
      hdr := CASE WHEN locked THEN 'TERKUNCI' WHEN approved THEN 'DISETUJUI' WHEN random() < 0.5 THEN 'MENUNGGU_PERSETUJUAN' ELSE 'DRAFT' END;
      wr_id := gen_random_uuid()::text;
      INSERT INTO "WeeklyDivisionReport"(id,"divisionId","entityId","isoYear","isoWeek","periodStart","periodEnd","statusHeader",
        "approvedById","approvedAt","approvalHash","isLocked","lockedAt","isLate","updatedAt")
      VALUES (wr_id, r.id, r.entity_id, iso_y, iso_w, period_start::timestamp - interval '7 hours', period_end::timestamp - interval '7 hours', hdr,
        CASE WHEN approved THEN kdv_id END,
        CASE WHEN approved THEN period_end::timestamp - interval '7 hours' - interval '1 day' END,
        CASE WHEN approved THEN 'sha256:'||substr(md5(random()::text),1,16) END,
        locked, CASE WHEN locked THEN period_end::timestamp - interval '7 hours' + interval '16 hours' END,
        (NOT is_cur) AND random() < 0.08, now_utc);
      item_cnt := 4 + floor(random()*3)::int;
      FOR k IN 1..item_cnt LOOP
        j := ((k-1) % 8) + 1;
        st := weekly_statuses[1+floor(random()*5)::int];
        pri_idx := 1+floor(random()*3)::int;
        pri_code := (ARRAY['TINGGI','SEDANG','RENDAH'])[pri_idx];
        INSERT INTO "WeeklyReportItem"(id,"weeklyReportId","aspectCategoryId","workItem","targetOutput","picName","picTitle","targetDate",status,
          "progressPct","achievementThisWeek","obstacleFollowUp","priorityId","needsEscalation","evidenceCount","updatedAt")
        SELECT gen_random_uuid()::text, wr_id, ac.id, wk_work[j], 'Target minggu ke-'||iso_w||': '||(10+floor(random()*40)::int)||' unit',
          wk_pic[j], wk_pic[j], period_end::timestamp - interval '7 hours' + (floor(random()*14)::int) * interval '1 day', st,
          CASE WHEN st='SELESAI' THEN 100 WHEN st='BELUM_MULAI' THEN 0 ELSE floor(random()*90)::int + 5 END,
          CASE WHEN st='SELESAI' THEN achievements[1+floor(random()*10)::int] WHEN st='BELUM_MULAI' THEN 'Persiapan tahap awal'
               ELSE 'Progress '||(floor(random()*80)::int+10)||'% dari target' END,
          CASE WHEN st='TERKENDALA' THEN obstacles[1+floor(random()*8)::int] END,
          pr.id, (st='TERKENDALA' AND pri_code='TINGGI'),
          CASE WHEN st='SELESAI' THEN 1+floor(random()*2)::int ELSE 0 END, now_utc
        FROM "AspectCategory" ac, "Priority" pr WHERE ac.code = wk_aspect[j] AND pr.code = pri_code;
      END LOOP;
      weekly_cnt := weekly_cnt + 1;
    END LOOP;
  END LOOP;

  -- ---------- eskalasi (12) ----------
  FOR esc_i IN 0..11 LOOP
    SELECT * INTO r FROM tmp_pt ORDER BY random() LIMIT 1;
    j := (esc_i % 8) + 1;
    st := esc_status[CASE WHEN esc_i < 3 THEN 1 WHEN esc_i < 6 THEN 2 WHEN esc_i < 9 THEN 3 ELSE 4 END];
    raised := now_utc - ((esc_i+1)*2) * interval '1 day';
    INSERT INTO "Escalation"(id,"sourceType","sourceId","entityId","raisedById","raisedAt",summary,needed,status,"decidedById","decidedAt","decisionText","slaDays","updatedAt")
    VALUES (gen_random_uuid()::text, CASE WHEN random()<0.5 THEN 'DAILY_REPORT' ELSE 'WEEKLY_ITEM' END, 'seed-'||esc_i, r.id, r.admin_id, raised,
      esc_summary[j], esc_needed[j], st,
      CASE WHEN st IN ('DIPUTUSKAN','DITUTUP') THEN mgmt_id END,
      CASE WHEN st IN ('DIPUTUSKAN','DITUTUP') THEN raised + interval '4 days' END,
      CASE WHEN st IN ('DIPUTUSKAN','DITUTUP') THEN 'Disetujui dengan catatan: eksekusi segera dengan pemantauan mingguan oleh Direktur Entitas.' END,
      7, now_utc);
  END LOOP;

  -- ---------- permintaan buka kunci (6) ----------
  FOR i IN 0..5 LOOP
    SELECT * INTO r FROM tmp_pt ORDER BY random() LIMIT 1;
    ust := unlock_statuses[(i % 4)+1];
    INSERT INTO "UnlockRequest"(id,"targetType","targetId","requestedById",reason,status,"approvedById","approvedAt","executedById","executedAt","unlockUntil","updatedAt")
    VALUES (gen_random_uuid()::text, CASE WHEN i % 2 = 0 THEN 'DAILY_REPORT' ELSE 'WEEKLY_REPORT' END, 'seed-unlock-'||i, r.admin_id,
      unlock_reasons[(i % 4)+1], ust,
      CASE WHEN ust <> 'DIAJUKAN' THEN sdm_id END, CASE WHEN ust <> 'DIAJUKAN' THEN now_utc - i * interval '1 day' END,
      CASE WHEN ust = 'DIEKSEKUSI' THEN ti_id END, CASE WHEN ust = 'DIEKSEKUSI' THEN now_utc - i * interval '1 day' + interval '1 hour' END,
      CASE WHEN ust = 'DIEKSEKUSI' THEN now_utc + interval '1 day' END, now_utc);
  END LOOP;

  -- ---------- KPI snapshot (6 bulan per PT) ----------
  FOR m IN REVERSE 5..0 LOOP
    period_key := to_char(date_trunc('month', today_wib::timestamp) - (m * interval '1 month'), 'YYYY-MM');
    FOR r IN SELECT * FROM tmp_pt LOOP
      INSERT INTO "KpiSnapshot"(id,"entityId","periodType","periodKey","onTimeDailyPct","weeklyCompletenessPct","evidenceCompletenessPct",
        "highPriorityCompletionPct","avgEscalationDays","totalProjects","activeProjects","reportsToday","lateToday","pendingReports","complianceScore","updatedAt")
      VALUES (gen_random_uuid()::text, r.id, 'BULANAN', period_key, 80+random()*18, 85+random()*15, 88+random()*12, 75+random()*22, 3+random()*6, 4, 4,
        CASE WHEN m = 0 THEN 3+floor(random()*2)::int ELSE 4 END,
        CASE WHEN m = 0 THEN floor(random()*2)::int ELSE 0 END,
        CASE WHEN m = 0 THEN floor(random()*2)::int ELSE 0 END,
        70+random()*28, now_utc);
    END LOOP;
  END LOOP;

  -- ---------- insiden terlambat (bulan ini) ----------
  period_key := to_char(today_wib, 'YYYY-MM');
  FOR i IN 0..7 LOOP
    SELECT * INTO r FROM tmp_pt ORDER BY random() LIMIT 1;
    INSERT INTO "LateIncident"(id,"entityId",cycle,period,"occurrenceInMonth","actionTaken")
    VALUES (gen_random_uuid()::text, r.id, CASE WHEN random()<0.5 THEN 'HARIAN' ELSE 'MINGGUAN' END, period_key, 1+floor(random()*3)::int,
      CASE WHEN i < 2 THEN 'Tindakan: evaluasi penunjukan Admin PT' ELSE 'Tindakan: notifikasi ke Direktur Entitas' END);
  END LOOP;

  -- ---------- log notifikasi (15) ----------
  FOR i IN 0..14 LOOP
    SELECT * INTO r FROM tmp_user ORDER BY random() LIMIT 1;
    st := CASE WHEN random() < 0.6 THEN 'EMAIL' ELSE 'WHATSAPP' END;
    ust := CASE WHEN random() < 0.85 THEN 'SENT' ELSE 'FAILED' END;
    hdr := notif_templates[1+floor(random()*10)::int];
    INSERT INTO "NotificationLog"(id,"userId",channel,recipient,template,payload,status,error,"sentAt")
    VALUES (gen_random_uuid()::text, r.id, st, CASE WHEN st='EMAIL' THEN r.email ELSE coalesce(r.phone,'+6281234567890') END, hdr,
      json_build_object('template', hdr, 'entityId', r.scope)::text, ust,
      CASE WHEN ust='FAILED' THEN 'Connection timeout' END, CASE WHEN ust='SENT' THEN now_utc - i * interval '1 hour' END);
  END LOOP;

  -- ---------- audit log (20) ----------
  FOR i IN 0..19 LOOP
    SELECT * INTO r FROM tmp_user ORDER BY random() LIMIT 1;
    hdr := audit_actions[1+floor(random()*9)::int];
    INSERT INTO "AuditLog"(id,"actorId",action,"targetType","targetId","beforeData","afterData",ip,"userAgent",at)
    VALUES (gen_random_uuid()::text, r.id, hdr,
      CASE WHEN hdr LIKE '%ESCALATION%' THEN 'ESCALATION' WHEN hdr LIKE '%WEEKLY%' THEN 'WEEKLY_REPORT' ELSE 'DAILY_REPORT' END,
      'audit-'||i, CASE WHEN hdr LIKE 'UPDATE%' THEN '{"progressPct":50}' END, '{"progressPct":75,"status":"ON_PROGRESS"}',
      '10.0.'||floor(random()*255)::int||'.'||floor(random()*255)::int, 'Mozilla/5.0 (Seed)', now_utc - (i*3) * interval '1 hour');
  END LOOP;

  RAISE NOTICE 'Seed selesai: % laporan harian, % laporan mingguan', daily_cnt, weekly_cnt;
END
$seed$;
