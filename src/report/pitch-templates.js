/**
 * PetaKlien - WhatsApp Outreach Templates (Bisnis / Skripsi / Survei / Magang / Kemitraan / Kustom)
 */

(function (root) {
  "use strict";

  function getPitchTemplateText(intent, categoryKey, lead, customTemplate) {
    const nama = lead.title || "Bapak/Ibu";
    const kategori = lead.category || "Instansi/Usaha";
    const alamat = lead.address || "lokasi Anda";
    const rating = lead.rating || "5.0";
    const ulasan = lead.reviewsCount || "banyak";

    // 1. Template Kustom
    if (intent === "custom") {
      const template = customTemplate || "Halo Tim {nama}, salam sukses!\n\nKami melihat usaha {kategori} Anda di {alamat} mendapatkan penilaian positif rating {rating} ({ulasan} ulasan) di Google Maps.\n\nApakah tertarik jika kami bantu kembangkan website resmi yang profesional dan modern untuk menjangkau lebih banyak pelanggan di Google Search?\n\nTerima kasih!";
      
      return template
        .replace(/\{nama\}|\{nama_bisnis\}/gi, nama)
        .replace(/\{kategori\}/gi, kategori)
        .replace(/\{alamat\}/gi, alamat)
        .replace(/\{rating\}/gi, rating)
        .replace(/\{ulasan\}/gi, ulasan);
    }

    // Auto-detect category key if "auto" is selected
    if (categoryKey === "auto") {
      const catLow = ((lead.category || "") + " " + (lead.title || "")).toLowerCase();
      if (catLow.includes("photo") || catLow.includes("foto") || catLow.includes("studio") || catLow.includes("potret") || catLow.includes("video") || catLow.includes("cinema")) {
        categoryKey = "photo";
      } else if (catLow.includes("sekolah") || catLow.includes("smp") || catLow.includes("sma") || catLow.includes("smk") || catLow.includes("sd") || catLow.includes("bimbel") || catLow.includes("les") || catLow.includes("kursus") || catLow.includes("universitas") || catLow.includes("kampus")) {
        categoryKey = "school";
      } else if (catLow.includes("klinik") || catLow.includes("dokter") || catLow.includes("dental") || catLow.includes("gigi") || catLow.includes("apotek") || catLow.includes("rumah sakit") || catLow.includes("terapi") || catLow.includes("medika")) {
        categoryKey = "clinic";
      } else if (catLow.includes("kafe") || catLow.includes("cafe") || catLow.includes("coffee") || catLow.includes("kopi") || catLow.includes("resto") || catLow.includes("makan") || catLow.includes("warung") || catLow.includes("kuliner") || catLow.includes("bakso")) {
        categoryKey = "cafe";
      } else if (catLow.includes("bengkel") || catLow.includes("otomotif") || catLow.includes("motor") || catLow.includes("mobil") || catLow.includes("cuci") || catLow.includes("rental")) {
        categoryKey = "automotive";
      } else if (catLow.includes("salon") || catLow.includes("barber") || catLow.includes("spa") || catLow.includes("skincare") || catLow.includes("beauty") || catLow.includes("nail")) {
        categoryKey = "beauty";
      } else if (catLow.includes("kost") || catLow.includes("kos") || catLow.includes("hotel") || catLow.includes("villa") || catLow.includes("homestay") || catLow.includes("arsitek") || catLow.includes("interior") || catLow.includes("properti")) {
        categoryKey = "property";
      } else if (catLow.includes("notaris") || catLow.includes("hukum") || catLow.includes("advokat") || catLow.includes("konsultan") || catLow.includes("akuntan") || catLow.includes("pajak")) {
        categoryKey = "legal";
      } else {
        categoryKey = "retail";
      }
    }

    // 2. Akademik: Riset Skripsi / Tugas Akhir (Permohonan Wawancara & Observasi)
    if (intent === "thesis") {
      if (categoryKey === "photo") {
        return "Selamat pagi/siang Kak / Manajemen " + nama + ".\n\nPerkenalkan saya mahasiswa yang sedang menyusun riset skripsi mengenai industri kreatif dan strategi manajemen studio fotografi pada " + nama + " di " + alamat + ".\n\nSehubungan dengan reputasi positif dan portofolio berkualitas " + nama + ", apakah kami diizinkan untuk mengajukan wawancara singkat atau observasi riset dengan tim manajemen terkait?\n\nSeluruh data semata-mata digunakan untuk kepentingan ilmiah. Terima kasih banyak atas waktu dan bantuannya!";
      } else if (categoryKey === "cafe") {
        return "Selamat pagi/siang Tim Manajemen " + nama + ".\n\nPerkenalkan saya mahasiswa yang sedang menyusun tugas akhir / skripsi mengenai manajemen operasional, tren F&B, dan kepuasan pelanggan pada kafe/restoran " + nama + " di " + alamat + ".\n\nApakah kami diperkenankan mengajukan wawancara singkat atau studi observasi dengan perwakilan manajemen?\n\nData hanya digunakan untuk kebutuhan akademis kampus. Terima kasih banyak atas kesempatan yang diberikan!";
      } else if (categoryKey === "clinic") {
        return "Selamat pagi/siang Manajemen " + nama + ".\n\nPerkenalkan saya mahasiswa yang saat ini menyusun riset skripsi mengenai sistem manajemen pelayanan kesehatan dan kepuasan pasien pada klinik " + nama + " di " + alamat + ".\n\nApakah kami diizinkan untuk melakukan wawancara singkat atau pengumpulan data ilmiah dengan pihak pengelola?\n\nSeluruh informasi dijamin kerahasiaannya untuk studi akademis. Terima kasih banyak atas perhatian dan dukungannya!";
      } else if (categoryKey === "school") {
        return "Selamat pagi/siang Bapak/Ibu Pimpinan " + nama + ".\n\nPerkenalkan saya mahasiswa yang sedang menyusun riset skripsi seputar tata kelola institusi pendidikan, kepuasan wali murid, dan implementasi teknologi informasi pada " + nama + " di " + alamat + ".\n\nApakah kami diizinkan mengajukan permohonan wawancara singkat dengan pihak pimpinan / staf terkait?\n\nData semata-mata untuk kepentingan penelitian ilmiah. Terima kasih banyak atas waktu dan restunya!";
      } else if (categoryKey === "automotive") {
        return "Selamat pagi/siang Manajemen " + nama + ".\n\nPerkenalkan saya mahasiswa yang sedang menyusun tugas akhir mengenai efisiensi operasional, manajemen rantai pasok, dan layanan bengkel/otomotif pada " + nama + " di " + alamat + ".\n\nApakah kami diperkenankan untuk wawancara singkat atau observasi studi lapangan?\n\nData hanya digunakan untuk riset ilmiah. Terima kasih banyak atas waktu dan kesempatannya!";
      } else if (categoryKey === "beauty") {
        return "Selamat pagi/siang Kak / Tim " + nama + ".\n\nPerkenalkan saya mahasiswa yang sedang menyusun riset skripsi mengenai strategi pemasaran dan manajemen bisnis kecantikan/estetika pada " + nama + " di " + alamat + ".\n\nApakah kami diizinkan untuk mengajukan wawancara singkat dengan pengelola/manajemen?\n\nSeluruh data semata-mata untuk keperluan akademis. Terima kasih banyak atas dukungannya!";
      } else if (categoryKey === "property") {
        return "Selamat pagi/siang Pengelola " + nama + ".\n\nPerkenalkan saya mahasiswa yang sedang menyusun riset skripsi mengenai pengelolaan properti hunian, manajemen okupansi, dan kepuasan penyewa pada " + nama + " di " + alamat + ".\n\nApakah kami diperkenankan melakukan wawancara singkat atau studi lapangan dengan pihak pengelola?\n\nData murni untuk kepentingan ilmiah. Terima kasih banyak atas bantuannya!";
      } else if (categoryKey === "legal") {
        return "Selamat pagi/siang Pimpinan " + nama + ".\n\nPerkenalkan saya mahasiswa yang sedang menyusun riset skripsi mengenai tata kelola jasa profesional, etika bisnis, dan kepuasan klien pada kantor " + nama + " di " + alamat + ".\n\nApakah kami diperkenankan mengajukan permohonan wawancara singkat dengan tim manajemen?\n\nSeluruh data dijamin kerahasiaannya untuk kepentingan ilmiah. Terima kasih banyak atas waktu yang diberikan!";
      } else {
        return "Selamat pagi/siang Bapak/Ibu Pimpinan " + nama + ".\n\nPerkenalkan saya mahasiswa yang saat ini sedang menyusun riset skripsi / tugas akhir mengenai perkembangan operasional dan pelayanan pada sektor " + kategori + " (" + nama + ") di " + alamat + ".\n\nSehubungan dengan reputasi positif tempat Anda, apakah kami diizinkan untuk mengajukan wawancara singkat atau observasi riset akademis dengan tim manajemen terkait?\n\nSeluruh data semata-mata digunakan untuk kepentingan ilmiah. Terima kasih banyak atas waktu dan kesempatan yang diberikan!";
      }
    }

    // 3. Akademik: Kuisioner & Survei Penelitian Mahasiswa
    if (intent === "survey") {
      if (categoryKey === "photo") {
        return "Halo Kak / Manajemen " + nama + ", salam hangat!\n\nPerkenalkan saya mahasiswa yang sedang melakukan mini riset / survei akademik mengenai preferensi pelanggan dan tren layanan studio foto pada " + nama + " di " + alamat + ".\n\nApakah kami diperkenankan untuk mengajukan beberapa pertanyaan singkat / pengisian kuisioner online untuk tugas kuliah?\n\nBantuan Bapak/Ibu akan sangat berarti bagi kelancaran studi kami. Terima kasih banyak!";
      } else if (categoryKey === "cafe") {
        return "Halo Tim " + nama + ", salam hangat!\n\nPerkenalkan saya mahasiswa yang sedang melakukan riset survei akademik mengenai tren kuliner dan kepuasan konsumen kafe/resto pada " + nama + " di " + alamat + ".\n\nApakah kami diperkenankan memohon kesediaan pengisian kuisioner singkat terkait operasional/layanan?\n\nBantuan Anda sangat membantu kelulusan mata kuliah kami. Terima kasih banyak!";
      } else if (categoryKey === "clinic") {
        return "Halo Manajemen " + nama + ", salam sehat!\n\nPerkenalkan saya mahasiswa yang sedang melakukan survei penelitian akademik mengenai mutu pelayanan kesehatan pada klinik " + nama + " di " + alamat + ".\n\nApakah kami diperkenankan untuk mengajukan permohonan pengisian kuisioner singkat bagi tim/pengelola?\n\nData semata-mata untuk tugas kuliah. Terima kasih banyak atas dukungannya!";
      } else if (categoryKey === "school") {
        return "Halo Tim " + nama + ", salam hangat!\n\nPerkenalkan saya mahasiswa yang sedang melakukan survei penelitian ilmiah mengenai sistem dan sarana edukasi pada " + nama + " di " + alamat + ".\n\nApakah kami diperkenankan mengajukan kuisioner singkat untuk kebutuhan data tugas kuliah?\n\nTerima kasih banyak atas perhatian dan bantuannya!";
      } else {
        return "Halo Tim " + nama + ", salam hangat!\n\nPerkenalkan saya mahasiswa yang sedang melakukan mini riset lapangan / survei akademik untuk mata kuliah seputar industri " + kategori + " pada " + nama + " di " + alamat + ".\n\nApakah kami diperkenankan untuk mengajukan beberapa pertanyaan singkat / permohonan pengisian kuisioner terkait operasional usaha? Bantuan Bapak/Ibu akan sangat berarti bagi kelancaran studi kami. Terima kasih banyak!";
      }
    }

    // 4. Akademik: Permohonan Magang / PKL / Studi Lapangan
    if (intent === "internship") {
      if (categoryKey === "photo") {
        return "Selamat pagi/siang Kak / Manajemen " + nama + ".\n\nPerkenalkan saya mahasiswa yang sangat tertarik dengan industri kreatif, fotografi, dan videografi di studio " + nama + " di " + alamat + ". Sehubungan dengan program magang / Praktik Kerja Lapangan (PKL) kampus kami, apakah saat ini " + nama + " membuka kesempatan magang atau studi lapangan bagi mahasiswa?\n\nJika berkenan, saya siap mengirimkan CV dan portofolio/surat pengantar resmi. Terima kasih banyak!";
      } else if (categoryKey === "cafe") {
        return "Selamat pagi/siang Tim Manajemen " + nama + ".\n\nPerkenalkan saya mahasiswa yang sangat tertarik dengan manajemen operasional, hospitality, dan industri F&B pada kafe/resto " + nama + " di " + alamat + ". Sehubungan dengan program magang / PKL kampus kami, apakah saat ini " + nama + " membuka kesempatan magang bagi mahasiswa?\n\nJika berkenan, saya siap mengirimkan CV dan surat pengantar resmi. Terima kasih banyak!";
      } else if (categoryKey === "clinic") {
        return "Selamat pagi/siang Manajemen " + nama + ".\n\nPerkenalkan saya mahasiswa yang tertarik mendalami administrasi layanan medis dan manajemen kesehatan pada klinik " + nama + " di " + alamat + ". Sehubungan dengan program magang / PKL kampus kami, apakah saat ini " + nama + " membuka kesempatan magang bagi mahasiswa?\n\nJika berkenan, saya siap melampirkan berkas dan surat pengantar resmi. Terima kasih banyak!";
      } else if (categoryKey === "school") {
        return "Selamat pagi/siang Bapak/Ibu Pimpinan " + nama + ".\n\nPerkenalkan saya mahasiswa yang sangat tertarik dengan bidang edukasi dan administrasi pendidikan pada " + nama + " di " + alamat + ". Sehubungan dengan program magang / PKL kampus kami, apakah saat ini " + nama + " membuka kesempatan magang bagi mahasiswa?\n\nJika berkenan, saya siap mengirimkan CV dan surat pengantar resmi. Terima kasih banyak!";
      } else {
        return "Selamat pagi/siang Bapak/Ibu HRD / Manajemen " + nama + ".\n\nPerkenalkan saya mahasiswa yang sangat tertarik dengan perkembangan dan kiprah " + nama + " di " + alamat + ". Sehubungan dengan program magang / Praktik Kerja Lapangan (PKL) kampus kami, apakah saat ini " + nama + " membuka kesempatan magang atau studi lapangan bagi mahasiswa?\n\nJika berkenan, saya siap mengirimkan CV dan surat pengantar resmi dari universitas. Terima kasih banyak atas perhatiannya!";
      }
    }

    // 5. Kemitraan & Kerjasama Usaha (Partnership / Kolaborasi)
    if (intent === "partnership") {
      if (categoryKey === "photo") {
        return "Halo Kak / Manajemen " + nama + ", salam kreatif!\n\nKami melihat portofolio studio foto " + nama + " di " + alamat + " sangat keren dan potensial. Kami ingin menjajaki peluang kolaborasi project, vendor event, atau sinergi promosi bersama.\n\nApakah ada kontak PIC atau waktu luang untuk berdiskusi santai mengenai potensi kemitraan ini? Terima kasih banyak!";
      } else if (categoryKey === "cafe") {
        return "Halo Tim Manajemen " + nama + ", salam sukses!\n\nKami melihat kafe/resto " + nama + " di " + alamat + " memiliki antusiasme pengunjung yang sangat baik. Kami bermaksud menjajaki kerjasama program kemitraan / event / kolaborasi yang saling menguntungkan.\n\nApakah berkenan jika kami jadwalkan diskusi singkat dengan bagian partnership/manajemen? Terima kasih!";
      } else if (categoryKey === "clinic") {
        return "Halo Manajemen " + nama + ", salam sehat!\n\nKami melihat perkembangan layanan " + nama + " di " + alamat + " sangat terpercaya. Kami ingin menjajaki kerjasama kemitraan corporate / program kesehatan bersama klinik Anda.\n\nApakah ada kontak PIC untuk koordinasi lebih lanjut? Terima kasih banyak!";
      } else {
        return "Halo Manajemen " + nama + ", salam sukses!\n\nKami melihat perkembangan " + nama + " di " + alamat + " sangat potensial. Kami ingin menjajaki peluang kolaborasi atau kerjasama strategis yang saling menguntungkan dengan usaha/instansi Anda.\n\nApakah ada kontak PIC atau kesempatan waktu luang untuk berdiskusi santai mengenai potensi sinergi ini? Terima kasih banyak!";
      }
    }

    // 6. Keperluan Uang / Bisnis (Penawaran Jasa Pembuatan Website & Digital)
    if (categoryKey === "photo") {
      return "Halo Kak / Manajemen " + nama + ", salam kreatif!\n\nKami melihat " + nama + " di " + alamat + " memiliki portofolio foto yang keren banget dengan rating " + rating + " (" + ulasan + " ulasan) di Google Maps.\n\nUntuk studio foto modern, punya website portofolio & sistem booking online otomatis sangat memudahkan klien memilih paket foto dan cek jadwal yang tersedia langsung tanpa antre chat. Apakah tertarik jika kami bantu buatkan website galeri & booking studio foto yang estetik?\n\nTerima kasih!";
    } else if (categoryKey === "cafe") {
      return "Halo Kak / Tim Manajemen " + nama + "!\n\nTempat Anda di " + alamat + " terlihat sangat menarik dan ramai dengan " + ulasan + " ulasan bintang " + rating + " di Google Maps.\n\nNamun kami perhatikan belum ada link website resmi untuk katalog menu digital, reservasi meja, dan info promo. Apakah tertarik jika kami bantu buatkan website profil & menu kafe yang estetik untuk menarik lebih banyak pengunjung?\n\nTerima kasih!";
    } else if (categoryKey === "clinic") {
      return "Halo Manajemen " + nama + ", salam sehat!\n\nKami melihat layanan kesehatan " + nama + " di " + alamat + " aktif melayani pasien dengan rating " + rating + " di Google Maps.\n\nNamun profil klinik Anda belum terhubung dengan website resmi untuk jadwal praktik dokter, reservasi online pasien, dan daftar layanan medis. Apakah berkenan jika kami bantu kembangkan sistem website informasi & reservasi klinik yang praktis?\n\nTerima kasih!";
    } else if (categoryKey === "school") {
      return "Halo Tim " + nama + ", salam hangat!\n\nKami melihat institusi " + nama + " di " + alamat + " memiliki reputasi yang sangat baik di Google Maps dengan rating " + rating + " (" + ulasan + " ulasan).\n\nWebsite resmi sangat penting untuk informasi pendaftaran siswa baru (PPDB), brosur online, dan profil institusi. Apakah berkenan jika kami bantu buatkan website resmi sekolah yang modern & profesional untuk mempermudah calon wali murid?\n\nTerima kasih!";
    } else if (categoryKey === "automotive") {
      return "Halo Manajemen " + nama + ", salam sukses!\n\nKami melihat usaha " + nama + " di " + alamat + " memiliki rating " + rating + " (" + ulasan + " ulasan) di Google Maps.\n\nBanyak pelanggan mencari daftar harga service, booking antrean bengkel, dan lokasi cabang secara online. Apakah tertarik jika kami bantu buatkan website profil & sistem booking servis kendaraan yang terpercaya?\n\nTerima kasih!";
    } else if (categoryKey === "beauty") {
      return "Halo Kak / Tim " + nama + ", salam hangat!\n\nKami melihat layanan " + nama + " di " + alamat + " sangat diminati pelanggan dengan rating " + rating + " (" + ulasan + " ulasan) di Google Maps.\n\nUntuk bisnis kecantikan/salon, website resmi dengan pricelist treatment & booking jadwal online bisa sangat mendongkrak omset dan memudahkan pelanggan baru. Apakah tertarik jika kami bantu buatkan website yang elegan & praktis?\n\nTerima kasih!";
    } else if (categoryKey === "property") {
      return "Halo Pengelola " + nama + ", salam hormat.\n\nKami melihat properti / hunian " + nama + " di " + alamat + " memiliki penilaian yang bagus (" + rating + " bintang) di Google Maps.\n\nAkan sangat mempermudah calon penyewa/tamu jika ada website resmi berisi foto tipe kamar/unit, fasilitas lengkap, dan nomor kontak admin langsung tanpa potongan komisi OTA. Apakah tertarik dibuatkan website profil properti yang menarik?\n\nTerima kasih!";
    } else if (categoryKey === "legal") {
      return "Halo " + nama + ", salam hormat.\n\nKami melihat kantor jasa profesional Anda di " + alamat + " memiliki reputasi positif (" + rating + " bintang) di Google Maps.\n\nBagi kantor hukum/jasa profesional, website resmi adalah etalase kredibilitas utama bagi calon klien korporat maupun perorangan. Apakah berkenan jika kami bantu buatkan website profil kantor yang elegan & berwibawa?\n\nTerima kasih!";
    } else {
      return "Halo Tim " + nama + ", salam sukses!\n\nKami melihat bisnis Anda di " + alamat + " mendapatkan " + ulasan + " ulasan pelanggan di Google Maps dengan rating " + rating + ".\n\nNamun kami perhatikan profil bisnis Anda saat ini belum memiliki website resmi untuk katalog produk dan menjangkau lebih banyak pelanggan di Google Search. Apakah tertarik jika kami bantu buatkan website profil bisnis yang profesional?\n\nTerima kasih!";
    }
  }

  const pitch = { getPitchTemplateText };
  if (typeof module !== "undefined" && module.exports) module.exports = pitch;
  if (typeof root !== "undefined" && root) root.PetaKlienPitch = pitch;
})(typeof globalThis !== "undefined" ? globalThis : this);
