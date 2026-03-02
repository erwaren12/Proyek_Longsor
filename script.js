const channelID = "3268553"; 
const readAPIKey = "ZF37ZW3N1OMKTTGM"; 

let map, marker, circleRadius, chartTren;
let audioAktif = false;
let alarmSedangBunyi = false;
const synth = window.speechSynthesis;

// Variabel Penyimpan Data Lokasi & Cuaca (Dinamis)
let sensorLat = -7.6145;
let sensorLng = 112.6012;
let statusCuacaTeks = "CERAH";
let penaltiRisikoCuaca = 0; 

function aktifkanAudio() {
    audioAktif = true;
    let btn = document.getElementById("btnSuara");
    btn.innerHTML = "🔊 SISTEM SUARA AKTIF";
    btn.classList.add("active");
    
    let utterThis = new SpeechSynthesisUtterance("Sistem telemetri suara diaktifkan. Otoritas: Tohirlele. Menunggu data sensor dan satelit meteorologi.");
    utterThis.lang = 'id-ID';
    utterThis.rate = 1.1;
    synth.speak(utterThis);
}

function putarAlarmBahaya() {
    if(!audioAktif || alarmSedangBunyi) return;
    alarmSedangBunyi = true;
    let utterThis = new SpeechSynthesisUtterance("Peringatan Darurat. Potensi longsor tingkat tinggi terdeteksi. Segera lakukan prosedur evakuasi sekarang juga.");
    utterThis.lang = 'id-ID';
    utterThis.rate = 1.0;
    utterThis.pitch = 1.2;
    utterThis.onend = function() { alarmSedangBunyi = false; }
    synth.speak(utterThis);
}

// FUNGSI INIT MAP (DIUBAH MENJADI INTERAKTIF)
function initMap() {
    // Gunakan zoomControl agar user bisa zoom in/out peta
    map = L.map('map', {zoomControl: true, attributionControl: false}).setView([sensorLat, sensorLng], 14); 
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    
    circleRadius = L.circle([sensorLat, sensorLng], { color: '#00ff66', fillColor: '#00ff66', fillOpacity: 0.2, radius: 400 }).addTo(map);
    marker = L.circleMarker([sensorLat, sensorLng], { radius: 6, fillColor: "#fff", color: "#000", weight: 1, opacity: 1, fillOpacity: 0.8 }).addTo(map);

    // EVENT LISTENER: Saat Peta Di-klik
    map.on('click', function(e) {
        // Update variabel global koordinat
        sensorLat = e.latlng.lat;
        sensorLng = e.latlng.lng;

        // Pindahkan Marker dan Radius Circle di Peta
        marker.setLatLng([sensorLat, sensorLng]);
        circleRadius.setLatLng([sensorLat, sensorLng]);

        // Update teks di Layar HUD (Pojok Kanan Atas)
        document.getElementById('teksLat').innerText = sensorLat.toFixed(4);
        document.getElementById('teksLng').innerText = sensorLng.toFixed(4);

        // Tampilkan loading sebentar di cuaca
        document.getElementById('valCuaca').innerText = "MENCARI DATA...";

        // Tembak ulang satelit cuaca untuk lokasi yang baru di-klik
        sinkronisasiCuaca();
    });
}

function initChart() {
    Chart.defaults.color = '#7dd3fc';
    Chart.defaults.font.family = 'Share Tech Mono';
    
    chartTren = new Chart(document.getElementById('grafikTren').getContext('2d'), {
        type: 'line',
        data: { labels: [], datasets: [
            { label: 'KEMIRINGAN (°)', data: [], borderColor: '#00f3ff', backgroundColor: 'rgba(0, 243, 255, 0.1)', borderWidth: 2, fill: true, tension: 0.3, pointRadius: 0, yAxisID: 'y' },
            { label: 'KELEMBABAN (%)', data: [], borderColor: '#ffea00', borderDash: [5, 5], borderWidth: 2, fill: false, tension: 0.3, pointRadius: 0, yAxisID: 'y1' }
        ]},
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { grid: { color: 'rgba(0, 243, 255, 0.1)' } },
                y: { position: 'left', grid: { color: 'rgba(0, 243, 255, 0.1)' } },
                y1: { position: 'right', grid: { drawOnChartArea: false } }
            }
        }
    });
}

// FUNGSI TARIK DATA CUACA (DINAMIS SESUAI KOORDINAT)
async function sinkronisasiCuaca() {
    // URL sekarang menggunakan variabel sensorLat dan sensorLng
    let urlCuaca = `https://api.open-meteo.com/v1/forecast?latitude=${sensorLat}&longitude=${sensorLng}&current=weather_code`;
    
    try {
        let res = await fetch(urlCuaca);
        let data = await res.json();
        let wCode = data.current.weather_code;

        if(wCode === 0 || wCode === 1) {
            statusCuacaTeks = "CERAH"; penaltiRisikoCuaca = 0;
        } else if(wCode === 2 || wCode === 3) {
            statusCuacaTeks = "BERAWAN"; penaltiRisikoCuaca = 5;
        } else if(wCode >= 51 && wCode <= 55) {
            statusCuacaTeks = "GERIMIS"; penaltiRisikoCuaca = 10;
        } else if(wCode >= 61 && wCode <= 65 || wCode >= 80 && wCode <= 82) {
            statusCuacaTeks = "HUJAN"; penaltiRisikoCuaca = 20; 
        } else if(wCode >= 95) {
            statusCuacaTeks = "BADAI PETIR"; penaltiRisikoCuaca = 35; 
        } else {
            statusCuacaTeks = "MENDUNG"; penaltiRisikoCuaca = 5;
        }

        document.getElementById('valCuaca').innerText = statusCuacaTeks;
        
        // Minta update dashboard ThingSpeak agar bar risiko otomatis terkalkulasi ulang
        sinkronisasiSatelit();

    } catch (error) {
        console.error("Gagal sinkronisasi cuaca satelit:", error);
        document.getElementById('valCuaca').innerText = "OFFLINE";
    }
}

async function sinkronisasiSatelit() {
    let url = `https://api.thingspeak.com/channels/${channelID}/feeds.json?api_key=${readAPIKey}&results=15&_t=${new Date().getTime()}`;

    try {
        let res = await fetch(url, { cache: "no-store" });
        let data = await res.json();
        let feeds = data.feeds;
        if(feeds.length === 0) return;

        let labels = [], dataMiring = [], dataAir = [];
        let htmlTabel = "";

        feeds.forEach(feed => {
            labels.push(new Date(feed.created_at).toLocaleTimeString('id-ID'));
            dataMiring.push(parseFloat(feed.field1) || 0);
            dataAir.push(parseFloat(feed.field2) || 0);
        });

        chartTren.data.labels = labels;
        chartTren.data.datasets[0].data = dataMiring;
        chartTren.data.datasets[1].data = dataAir;
        chartTren.update('none');

        let terkini = feeds[feeds.length - 1];
        let valMiring = parseFloat(terkini.field1) || 0;
        let valAir = parseInt(terkini.field2) || 0;
        let statusKode = parseInt(terkini.field3) || 0;

        document.getElementById('valKemiringan').innerText = valMiring.toFixed(1) + "°";
        document.getElementById('valKelembaban').innerText = valAir + "%";
        document.getElementById('waktuServer').innerText = new Date().toLocaleTimeString('id-ID');

        let batasDinamis = 90 - (valMiring * 1.2);
        if (batasDinamis < 20) batasDinamis = 20;
        
        let risikoDasar = (valAir / batasDinamis) * 100;
        let persentaseRisiko = risikoDasar + penaltiRisikoCuaca; 
        
        if(persentaseRisiko > 100) persentaseRisiko = 100;
        
        document.getElementById('teksRisiko').innerText = persentaseRisiko.toFixed(1) + "%";
        let barRisiko = document.getElementById('barRisiko');
        barRisiko.style.width = persentaseRisiko + "%";

        [...feeds].reverse().forEach(feed => {
            let jam = new Date(feed.created_at).toLocaleTimeString('id-ID');
            let rsk = ((parseFloat(feed.field2) / (90 - (parseFloat(feed.field1)*1.2)))*100) + penaltiRisikoCuaca;
            let rskStr = rsk > 100 ? 100 : rsk.toFixed(1);
            htmlTabel += `<tr><td>${jam}</td><td>${parseFloat(feed.field1).toFixed(1)}°</td><td>${parseFloat(feed.field2).toFixed(0)}%</td><td style="color:${rsk>85?'#ff003c':'#00f3ff'}">${rskStr}%</td></tr>`;
        });
        document.getElementById('tabelData').innerHTML = htmlTabel;

        let boxBesar = document.getElementById('boxStatusBesar');
        let warnaUtama = "";

        if (statusKode === 2 || persentaseRisiko >= 90) { 
            warnaUtama = "var(--neon-red)";
            boxBesar.innerText = "🚨 EVAKUASI DARURAT 🚨";
            document.body.classList.add('darurat-mode');
            circleRadius.setStyle({color: '#ff003c', fillColor: '#ff003c'});
            barRisiko.style.backgroundColor = '#ff003c'; barRisiko.style.boxShadow = '0 0 15px #ff003c';
            putarAlarmBahaya(); 
        } else if (statusKode === 1 || persentaseRisiko >= 65) {
            warnaUtama = "var(--neon-yellow)";
            boxBesar.innerText = "⚠️ SIAGA PROTOKOL ⚠️";
            document.body.classList.remove('darurat-mode');
            circleRadius.setStyle({color: '#ffea00', fillColor: '#ffea00'});
            barRisiko.style.backgroundColor = '#ffea00'; barRisiko.style.boxShadow = '0 0 10px #ffea00';
        } else {
            warnaUtama = "var(--neon-green)";
            boxBesar.innerText = "SYS. AMAN TERKENDALI";
            document.body.classList.remove('darurat-mode');
            circleRadius.setStyle({color: '#00ff66', fillColor: '#00ff66'});
            barRisiko.style.backgroundColor = '#00ff66'; barRisiko.style.boxShadow = '0 0 10px #00ff66';
        }

        boxBesar.style.color = warnaUtama;
        boxBesar.style.borderColor = warnaUtama;
        boxBesar.style.textShadow = `0 0 15px ${warnaUtama}`;
        boxBesar.style.backgroundColor = statusKode === 2 ? "rgba(255,0,60,0.1)" : (statusKode === 1 ? "rgba(255,234,0,0.1)" : "rgba(0,255,102,0.1)");

    } catch (error) {
        console.error("Gagal sinkronisasi sensor:", error);
    }
}

window.onload = function() {
    initMap();
    initChart();
    
    sinkronisasiCuaca();
    setInterval(sinkronisasiCuaca, 300000); 
    
    sinkronisasiSatelit();
    setInterval(sinkronisasiSatelit, 15000); 
};