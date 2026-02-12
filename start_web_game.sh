#!/bin/bash

# Scriptin bulundugu klasoru al (.sh dosyasi ile ayni yer)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Proje klasorune git
cd "$SCRIPT_DIR" || { echo "Proje klasoru bulunamadi!"; exit 1; }

echo "--- SIHIRLI MATEMATIK OYUNU BASLATILIYOR ---"

# Bos bir port bul (8000'den baslayip kontrol et)
PORT=8000
# lsof komutu portun dolu olup olmadigini kontrol eder
# Eger port doluysa (lsof 0 donerse), port numarasini artir
while lsof -i :$PORT >/dev/null 2>&1; do
    echo "Port $PORT dolu, bir sonraki deneniyor..."
    ((PORT++))
done

echo "Port $PORT uzerinden sunucu baslatiliyor..."

# Sunucuyu baslat
python3 -m http.server $PORT &
SERVER_PID=$!

# Bekle
sleep 2

# Tarayiciyi ac
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux (Raspberry Pi)
    echo "Linux tespit edildi, Chromium baslatiliyor..."
    chromium-browser --app=http://localhost:$PORT \
        --unsafely-treat-insecure-origin-as-secure=http://localhost:$PORT \
        --autoplay-policy=no-user-gesture-required \
        --check-for-update-interval=31536000
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # Mac OSX
    open "http://localhost:$PORT"
else
    # Diger isletim sistemleri
    xdg-open "http://localhost:$PORT"
fi

echo ""
echo "Oyun tarayicinizi acti! (Adres: http://localhost:$PORT)"
echo "Oyunu kapatmak icin bu pencereyi kapatin veya CTRL+C tuslarina basin."
echo ""

# Kapanmasini bekle
wait $SERVER_PID
