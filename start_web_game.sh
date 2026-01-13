#!/bin/bash

# Scriptin bulundugu klasoru al (.sh dosyasi ile ayni yer)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Web klasorune git
cd "$SCRIPT_DIR/web" || { echo "Web klasoru bulunamadi!"; exit 1; }

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
open "http://localhost:$PORT"

echo ""
echo "Oyun tarayicinizi acti! (Adres: http://localhost:$PORT)"
echo "Oyunu kapatmak icin bu pencereyi kapatin veya CTRL+C tuslarina basin."
echo ""

# Kapanmasini bekle
wait $SERVER_PID
