# IELTS Coach

Platform belajar pribadi untuk naik skor di tes engnovate.com. Tesnya tetap dikerjakan
di engnovate, hasilnya dicatat di sini.

Buka http://localhost:3232. Aplikasi ini berjalan sendiri di latar belakang (launchd agent
`local.ielts-coach`), menyala otomatis saat Mac login, dan dinyalakan ulang kalau berhenti.
Hanya bisa diakses dari Mac ini.

```
npm run service:status    # jalan atau tidak
npm run service:restart   # setelah mengubah server.js atau lib/
npm run service:stop      # matikan
npm run service:start     # nyalakan lagi
npm run service:logs      # log: ~/Library/Logs/ielts-coach/server.log
npm test
```

Perubahan di `public/` langsung terlihat tanpa restart. Tanpa dependensi (Node 24).
Data tersimpan di `data/db.json`, tes yang dihapus di `data/trash.json`. Folder aslinya
`~/Projects/ielts-coach`; `~/Documents/Claude/ielts-coach` hanya shortcut, karena macOS
tidak mengizinkan service latar belakang membaca folder Documents.

## Fase 1: catatan skor + analisis (selesai)

- **Catat tes** (`/log`): tempel link tes engnovate. Grup soal, part, dan tipe soal
  terbaca otomatis dari halaman tes, lalu kamu klik nomor yang salah atau mengetiknya
  (`3, 5, 12-14`). Part yang tidak dikerjakan bisa ditandai "Dilewati". Tanpa link,
  susunan soal bisa diisi manual.
- **Skor**: Listening dan Reading dikonversi ke band (tabel Academic dan General Training
  berbeda). Latihan per bagian diberi band perkiraan (≈). Writing dan Speaking: band dan
  kriteria diisi dari engnovate.
- **Dashboard**: hitung mundur ujian, perkiraan overall, grafik band per skill,
  akurasi per tipe soal (diurutkan dari yang paling banyak membuang poin), dan riwayat tes.

Kunci jawaban tidak ada di halaman engnovate (dinilai di server mereka), jadi nomor yang
salah tetap diisi sendiri.

## Fase 2: materi + latihan mini

- **Materi** (`/learn`): satu pelajaran per tipe soal Reading dan Listening, dengan tipe
  terlemahmu (dari tes yang dicatat) ditaruh di atas. Nama tipe soal di dashboard juga
  menuju pelajarannya.
- **Latihan mini** di setiap pelajaran: teks atau audio buatan sendiri (bukan salinan buku
  Cambridge), dinilai otomatis, dengan pembahasan dan kalimat buktinya di-highlight.
  Hasilnya disimpan.
- Konten ada di `content/`: pelajaran sebagai Markdown (`lessons/`), latihan sebagai JSON
  (`drills/`), panduan penulisannya di `content/AUTHORING.md`.

```
npm run check    # cek semua materi: jawaban harus didukung teks/transkrip
npm run audio    # buat audio Listening dari skrip (suara macOS + ffmpeg)
```

## Fase 3: jurnal kesalahan + kartu

- **Jurnal** (`/journal`): setiap jawaban salah dari tes yang dicatat, lengkap dengan teks
  soalnya. Pilih alasannya (parafrase, FALSE/NOT GIVEN, pengecoh, ejaan, batas kata,
  ketinggalan audio, dan lainnya). "Pola kesalahanmu" menunjukkan alasan terbesar beserta
  saran dan link ke materi. Setelah mencatat tes yang ada salahnya, kamu langsung dibawa ke sini.
- **Kartu** (`/cards`): flashcard dengan pengulangan berjarak (Lupa / Sulit / Ingat /
  Mudah; interval 1 → 3 → 8 → 20 hari), maksimal 15 kartu baru per hari. Dua paket siap
  pakai di `content/decks/`: pasangan parafrase IELTS dan kata yang sering salah eja di
  Listening. Kartu juga bisa dibuat dari jurnal. Keyboard: Spasi untuk membalik, 1–4 untuk menilai.
- **Dashboard**: baris "Hari ini" berisi kartu yang harus diulang dan jawaban salah yang
  belum dianalisis.

## Fase 4: profil + Writing lab

- **Profil**: setiap orang punya tes, latihan, jurnal, kartu, esai, modul, dan target
  sendiri. Halaman `/pilih` ("Pilih peranmu") muncul kalau belum ada profil yang dipilih.
  Isinya kalimat penyemangat yang berganti tiap hari, plus kartu per orang dengan peran,
  hitung mundur ujian, progres tugas hari ini, dan hari berturut-turut. Tiap profil punya
  link pribadi `/p/<nama>` yang langsung masuk. Klik nama di menu untuk ganti profil;
  nama, peran, modul, tanggal ujian, dan target diubah di Pengaturan (dashboard). Di
  materi, contoh dan latihan diurutkan sesuai modul profil. Data versi lama dipindah ke
  profil pertama; salinannya ada di `data/db.v1-backup.json`.
- **Writing** (`/writing`): bank soal Task 1 surat (GT, 9 soal), Task 1 grafik (Academic,
  8 soal dengan grafik garis, batang, pie, dan tabel), dan Task 2 (12 soal), plus soal
  sendiri. Ada panduan per task, timer 20/40 menit, penghitung kata, dan draf yang tersimpan
  otomatis.
- **Penilaian oleh Claude**: server menjalankan Claude Code yang sudah login di Mac ini
  (`claude -p`, tanpa tool, tanpa API key, memakai kuota langganan Claude). Hasilnya band
  per kriteria (bilangan bulat, seperti examiner), band task (rata-rata dibulatkan ke bawah
  ke .5), kekuatan, perbaikan dengan kutipan dari tulisanmu, langkah berikutnya, dan contoh
  paragraf band 7.5+. Hasil Writing lab ikut muncul di grafik Writing di dashboard (sebagai
  estimasi). Kalau Claude belum login: jalankan `claude auth login` di Terminal.

## Tampilan: Liquid Glass

Gaya Apple macOS/iOS (Liquid Glass): sidebar kaca melayang di kiri (di HP jadi tab bar di
bawah plus bar atas), kontrol berbentuk kapsul kaca dengan kilau di tepi, kartu konten dari
kaca yang lebih pekat supaya teks tetap terbaca, font sistem Apple (SF Pro / SF Rounded,
teks bacaan New York atau Newsreader). Selalu terang secara default, apa pun pengaturan HP;
mode gelap dipilih manual lewat tombol bulan/matahari di navigasi (disimpan per perangkat,
`data-theme="dark"` di `<html>`). Kalau "Reduce transparency" aktif, kaca menjadi solid. Navigasi dirender dari satu tempat (`public/ui.js`).

## Speaking

- **Speaking** (`/speaking`): Part 1 (12 topik), Part 2 & 3 (12 cue card, persiapan 1 menit,
  bicara maksimal 2 menit, lalu diskusi), atau tes lengkap acak. Pertanyaan bisa dibacakan
  suara examiner (suara bawaan Mac). Jawaban direkam (rekaman disimpan di
  `data/audio/<profil>/`) dan ditranskrip oleh browser (Chrome lewat Google, Safari lewat
  Apple). Ada juga mode "ketik jawaban" tanpa mikrofon.
- **Penilaian**: Claude menilai Fluency & Coherence, Lexical Resource, dan Grammar dari
  transkrip plus durasi dan kecepatan bicara. Pronunciation tidak bisa dinilai dari teks,
  jadi kamu dapat tips cek mandiri dan bisa memutar ulang rekamanmu. Ada contoh jawaban band
  7.5+ dan kosakata topik yang bisa langsung dijadikan kartu.

## Rencana harian

Di dashboard, "Rencana hari ini" menyusun tugas dari tanggal ujian, waktu belajar per hari
(Pengaturan), dan kelemahanmu:

- Fase: **Fondasi** (>35 hari: materi + latihan mini), **Latihan terarah** (15–35 hari:
  bagian soal asli di engnovate), **Simulasi** (≤14 hari: tes lengkap tiap Sabtu).
- Fokus per hari: Sen Listening, Sel Reading, Rab Writing Task 1, Kam Speaking, Jum skill
  terlemah, Sab Listening atau simulasi, Min Writing Task 2. Ditambah kartu yang jatuh
  tempo, jurnal yang belum diisi, dan materi tipe soal yang paling banyak membuang poin.
- Daftar tugas disimpan saat pertama dibuka hari itu. Tugas tercentang sendiri ketika
  pekerjaannya terdeteksi (review kartu, latihan, esai, sesi Speaking, tes yang dicatat),
  atau dicentang manual. Ada strip minggu ini dan hitungan hari berturut-turut.

## Akses dari HP (Tailscale)

Server tetap hanya mendengarkan di `127.0.0.1:3232`. HP dan laptop lain membukanya lewat
Tailscale: Mac ini menjalankan `tailscale serve --bg http://127.0.0.1:3232`, sehingga
aplikasi tersedia lewat HTTPS di alamat `https://<nama-mac>.<tailnet>.ts.net`. Alamat itu hanya
bisa dijangkau perangkat di tailnet yang sama, dan HTTPS-nya membuat mikrofon untuk Speaking
tetap jalan. Setiap orang login ke Tailscale dengan akunnya sendiri (diundang lewat
Users → Invite users); profil di aplikasi tetap dipilih lewat `/pilih` atau `/p/<nama>`.

- Tanpa password: browser di Mac itu sendiri (`localhost`) dan permintaan lewat Tailscale
  Serve, yang membawa header `Tailscale-User-Login` (lihat `isTrusted` di `lib/auth.js`).
- Semua jalur lain, misalnya tunnel publik, minta password dulu (`/masuk`). Login berlaku 30
  hari; setelah 8 kali salah, percobaan dikunci 15 menit.
- `npm run password`: buat atau ganti password itu, dijalankan sendiri di Terminal. Yang
  disimpan hanya hash-nya, di `data/auth.json`. Password baru membuat semua perangkat keluar.
  Tanpa `data/auth.json`, jalur selain Tailscale tertutup sama sekali.
- Ikon layar utama: `public/apple-touch-icon.png`, `icon-512.png`, `manifest.webmanifest`.

Aplikasi ini tidak bisa di-deploy ke Vercel apa adanya: data disimpan sebagai file, rekaman
juga, dan penilaian memakai Claude Code yang login di Mac.

## Ide berikutnya

- Akses dari HP (jaringan rumah atau tunnel) dengan password.
- Lebih banyak latihan per tipe soal, dan materi khusus Reading General Training.
