#!/bin/bash
# Nasazení hry na ostrý server (warofash.com, 31.31.72.77).
#
# POZOR: server/data se NIKDY nenahrává — na serveru je to odkaz do
# /opt/warofash/data a jsou tam ostré účty hráčů. Přepsat je lokálními
# testovacími účty by je nenávratně smazalo.
#
# Použití:  ./nasadit.sh          (pustí testy, nahraje, restartuje, ověří)
#           ./nasadit.sh --bez-testu   (přeskočí testy — jen když víš proč)
set -e
SERVER=root@31.31.72.77
KOREN=$(cd "$(dirname "$0")" && pwd)
cd "$KOREN"

if [ "$1" != "--bez-testu" ]; then
  echo "== testy =="
  node tests/vse.js | tail -1
fi

echo "== balím =="
BAL=$(mktemp -d)
mkdir -p "$BAL/art"
cp -r js server index.html style.css package.json package-lock.json tests "$BAL/"
cp -r art/models "$BAL/art/"
# z art/render jen PORTRÉTY — zbytek složky jsou náhledy z Blenderu pro
# dokumentaci (20 MB), hra si sahá jen na hero_*.png (render.js, main.js)
mkdir -p "$BAL/art/render"
cp art/render/hero_*.png "$BAL/art/render/"
rm -rf "$BAL/server/data"          # ostrá data zůstávají na serveru
tar czf /tmp/warofash-deploy.tgz -C "$BAL" .
rm -rf "$BAL"
echo "   $(du -h /tmp/warofash-deploy.tgz | cut -f1)"

echo "== nahrávám =="
scp -q /tmp/warofash-deploy.tgz $SERVER:/tmp/
ssh $SERVER 'bash -s' <<'VZDALENE'
set -e
cd /opt/warofash/app
tar xzf /tmp/warofash-deploy.tgz && rm /tmp/warofash-deploy.tgz
npm install --omit=dev --silent >/dev/null 2>&1
chown -R warofash:warofash /opt/warofash/app
systemctl restart warofash
sleep 3
systemctl is-active --quiet warofash && echo "   služba běží" || { echo "   ❌ SLUŽBA SPADLA"; journalctl -u warofash -n 15 --no-pager -o cat; exit 1; }
VZDALENE

echo "== ověření zvenčí =="
# vždy po IP — dokud DNS míří na parking Wedosu, odpovídala by na doméně
# cizí HTTP 200 a nasazení by vypadalo v pořádku, i kdyby náš server ležel
curl -s -o /dev/null -w "   server po IPv4: HTTP %{http_code}\n" http://31.31.72.77/
curl -6 -s -o /dev/null -w "   server po IPv6: HTTP %{http_code}\n" "http://[2a02:2b88:2:1::7d15:1]/" 2>/dev/null || echo "   server po IPv6: odsud nedostupné (na tvé síti nemusí být IPv6)"
# %{remote_ip} = adresa, na kterou se curl OPRAVDU připojil. Odhalí i zapomenutý
# AAAA záznam: prohlížeč s IPv6 by skončil u Wedosu, i kdyby A záznam byl správně.
KAM=$(curl -s -o /dev/null -m 8 -w "%{remote_ip}" http://warofash.com/ 2>/dev/null)
if [ "$KAM" = "31.31.72.77" ]; then
  curl -s -o /dev/null -w "   https://warofash.com: HTTP %{http_code}\n" https://warofash.com/
else
  echo "   warofash.com míří na ${KAM:-nikam}, ne na nás — DNS ještě nejsou přepnuté"
fi
echo "== hotovo =="
